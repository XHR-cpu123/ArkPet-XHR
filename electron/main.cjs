const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  protocol,
  screen,
  session,
  shell
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile, spawn, spawnSync } = require("node:child_process");
const sharp = require("sharp");
const { pathToFileURL } = require("node:url");
const { Store, id } = require("./store.cjs");
const ai = require("./ai.cjs");
const { LocalInferenceManager } = require("./local-inference.cjs");
const { VoiceAgent } = require("./voice-agent.cjs");

function readDataPathConfig(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.subarray(2).toString("utf16le").replace(/\0/g, "").trim();
    }
    return buffer.toString("utf8").replace(/^\uFEFF/, "").trim();
  } catch {
    return "";
  }
}

function resolvePortableDataPath() {
  if (!app.isPackaged) {
    return path.join(__dirname, "..", "user-data");
  }

  const portableDirectory = String(
    process.env.PORTABLE_EXECUTABLE_DIR || ""
  ).trim();
  if (portableDirectory) {
    return path.join(portableDirectory, "user-data");
  }

  const appDataRoot = process.env.APPDATA || app.getPath("appData");
  const configDirectory = path.join(
    appDataRoot,
    "XHR-cpu23",
    "DeskPetStudio"
  );
  const configured = readDataPathConfig(
    path.join(configDirectory, "data-path.txt")
  );
  return configured || path.join(configDirectory, "data");
}

function dataPathConfigFile() {
  const appDataRoot = process.env.APPDATA || app.getPath("appData");
  return path.join(
    appDataRoot,
    "XHR-cpu23",
    "DeskPetStudio",
    "data-path.txt"
  );
}

function writeDataPathConfig(targetPath) {
  const configFile = dataPathConfigFile();
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, targetPath, "utf8");
}

function copySeedUserData(targetPath) {
  if (!app.isPackaged) return;
  if (fs.existsSync(path.join(targetPath, "desk-pet-state.json"))) return;
  const seedPath = path.join(process.resourcesPath, "user-data-seed");
  if (!fs.existsSync(seedPath)) return;
  fs.mkdirSync(targetPath, { recursive: true });
  fs.cpSync(seedPath, targetPath, {
    recursive: true,
    force: false,
    errorOnExist: false
  });
}

let portableDataPath = resolvePortableDataPath();
app.setPath("userData", portableDataPath);

protocol.registerSchemesAsPrivileged([
  {
    scheme: "deskpet",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

let store;
let controlWindow = null;
let overlayWindow = null;
let isQuitting = false;
const auxiliaryWindows = new Map();
const chatWindows = new Map();
const externalModuleWindows = new Map();
const climbWindows = new Map();
const VOICE_SERVICE_URL = "http://127.0.0.1:9880";
const CUDA128_RUNTIME_DIR = path.join(
  __dirname,
  "..",
  "voice-engine",
  "cuda128-runtime"
);
const VOICE_ENGINE_DIR = path.join(
  __dirname,
  "..",
  "voice-engine",
  "GPT-SoVITS-windows",
  "GPT-SoVITS-v3lora-20250228"
);
const localInference = new LocalInferenceManager({
  pythonPath: path.join(VOICE_ENGINE_DIR, "runtime", "python.exe"),
  scriptPath: path.join(__dirname, "..", "scripts", "local_model_worker.py"),
  cwd: path.join(__dirname, ".."),
  logPath: path.join(__dirname, "..", "voice-engine", "local-inference.log")
});
const voiceAgent = new VoiceAgent({
  transcribe: (audioBytes) => transcribeAudioBytes(audioBytes),
  reply: (text, options) => replyWithProviders(store.get(), text, options),
  speak: (text, options) =>
    synthesizeWithSelectedVoice(store.get(), text, options)
});
let voiceServiceProcess = null;
let voiceServiceStartPromise = null;
let ownsVoiceService = false;

async function isVoiceServiceReady(timeoutMs = 1200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${VOICE_SERVICE_URL}/docs`, {
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureVoiceService() {
  if (await isVoiceServiceReady()) {
    return { ok: true, reused: true };
  }
  if (voiceServiceStartPromise) return voiceServiceStartPromise;

  voiceServiceStartPromise = (async () => {
    const pythonPath = path.join(VOICE_ENGINE_DIR, "runtime", "python.exe");
    const apiPath = path.join(VOICE_ENGINE_DIR, "api_v2.py");
    if (!fs.existsSync(pythonPath) || !fs.existsSync(apiPath)) {
      throw new Error("没有找到内置 GPT-SoVITS 运行环境。");
    }

    const logPath = path.join(VOICE_ENGINE_DIR, "..", "..", "gpt-sovits-api.log");
    const errorLogPath = path.join(
      VOICE_ENGINE_DIR,
      "..",
      "..",
      "gpt-sovits-api.err.log"
    );
    const stdoutFd = fs.openSync(logPath, "a");
    const stderrFd = fs.openSync(errorLogPath, "a");
    let spawnError = null;
    try {
      voiceServiceProcess = spawn(
        pythonPath,
        [
          apiPath,
          "-a",
          "127.0.0.1",
          "-p",
          "9880",
          "-c",
          "GPT_SoVITS/configs/tts_infer.yaml"
        ],
        {
          cwd: VOICE_ENGINE_DIR,
          windowsHide: true,
          env: {
            ...process.env,
            CUDA_VISIBLE_DEVICES: "-1"
          },
          stdio: ["ignore", stdoutFd, stderrFd]
        }
      );
      ownsVoiceService = true;
    } finally {
      fs.closeSync(stdoutFd);
      fs.closeSync(stderrFd);
    }

    voiceServiceProcess.once("error", (error) => {
      spawnError = error;
    });
    voiceServiceProcess.once("exit", () => {
      voiceServiceProcess = null;
      ownsVoiceService = false;
    });

    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      if (spawnError) {
        throw spawnError;
      }
      if (voiceServiceProcess?.exitCode !== null) {
        throw new Error("GPT-SoVITS CPU 服务启动失败，请查看语音日志。");
      }
      if (await isVoiceServiceReady(2500)) {
        return { ok: true, reused: false };
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("GPT-SoVITS CPU 服务启动超时。");
  })()
    .catch((error) => {
      stopOwnedVoiceService();
      return {
        ok: false,
        error: error.message || "GPT-SoVITS CPU 服务启动失败。"
      };
    })
    .finally(() => {
      voiceServiceStartPromise = null;
    });

  return voiceServiceStartPromise;
}

function isBundledVoiceService(config) {
  const rawUrl = String(config?.baseUrl || "");
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    return (
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.port === "9880"
    );
  } catch {
    return false;
  }
}

function stopOwnedVoiceService() {
  if (!ownsVoiceService || !voiceServiceProcess) return;
  try {
    voiceServiceProcess.kill();
  } catch {
    // The process may have already exited.
  }
  voiceServiceProcess = null;
  ownsVoiceService = false;
}

function appendActivity(draft, type, text) {
  draft.activity.unshift({
    id: id("activity"),
    type,
    text,
    createdAt: new Date().toISOString()
  });
  draft.activity = draft.activity.slice(0, 60);
}

function rendererUrl(view) {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const url = devUrl
    ? new URL(devUrl)
    : new URL(pathToFileURL(path.join(__dirname, "..", "dist", "index.html")).toString());
  if (view) url.searchParams.set("view", view);
  return url.toString();
}

function broadcastState() {
  if (!store) return;
  const state = store.get();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("store:changed", state);
  }
}

function broadcastClimbPlatform(payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("overlay:climb-platform", payload);
    }
  }
}

function applyOverlaySettings() {
  if (!overlayWindow || overlayWindow.isDestroyed() || !store) return;
  const overlay = store.get().settings.overlay;
  overlayWindow.setAlwaysOnTop(Boolean(overlay.alwaysOnTop), "screen-saver");
  overlayWindow.webContents.send("overlay:settings", overlay);
}

function getPrimaryMetrics() {
  const display = screen.getPrimaryDisplay();
  return {
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor
  };
}

function positionOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const { bounds } = getPrimaryMetrics();
  overlayWindow.setBounds(bounds);
  overlayWindow.webContents.send("display:changed", getPrimaryMetrics());
}

function createControlWindow() {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.show();
    controlWindow.focus();
    return controlWindow;
  }

  controlWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1080,
    minHeight: 720,
    title: "桌宠工房",
    backgroundColor: "#f4f2ec",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      sandbox: false
    }
  });

  controlWindow.loadURL(rendererUrl());
  controlWindow.once("ready-to-show", () => controlWindow.show());
  controlWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      controlWindow.hide();
    }
  });
  controlWindow.on("closed", () => {
    controlWindow = null;
  });
  if (!app.isPackaged) {
    controlWindow.webContents.on("console-message", (_event, level, message) => {
      console.log(`[control:${level}] ${message}`);
    });
    controlWindow.webContents.on(
      "did-fail-load",
      (_event, code, description, url) => {
        console.error(`[control] load failed ${code} ${description} ${url}`);
      }
    );
  }
  controlWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return controlWindow;
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;
  const { bounds } = getPrimaryMetrics();

  overlayWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      sandbox: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setFocusable(false);
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadURL(rendererUrl("overlay"));
  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
  if (!app.isPackaged) {
    overlayWindow.webContents.on("console-message", (_event, level, message) => {
      console.log(`[overlay:${level}] ${message}`);
    });
    overlayWindow.webContents.on(
      "did-fail-load",
      (_event, code, description, url) => {
        console.error(`[overlay] load failed ${code} ${description} ${url}`);
      }
    );
  }
  overlayWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  overlayWindow.once("ready-to-show", () => {
    applyOverlaySettings();
    const overlay = store.get().settings.overlay;
    if (overlay.visibleOnStart) overlayWindow.showInactive();
  });

  return overlayWindow;
}

function showOverlay() {
  const window = createOverlayWindow();
  window.setBounds(getPrimaryMetrics().bounds);
  window.showInactive();
}

function hideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
}

function pointToPrimaryDisplay(screenPoint) {
  const display = screen.getPrimaryDisplay();
  return {
    x: screenPoint.x - display.bounds.x,
    y: screenPoint.y - display.bounds.y
  };
}

function sendOverlayCommand(command) {
  const window = createOverlayWindow();
  showOverlay();
  const nextCommand = { ...command };

  if (command.type === "release" && controlWindow && !controlWindow.isDestroyed()) {
    const bounds = controlWindow.getBounds();
    nextCommand.origin = pointToPrimaryDisplay({
      x: bounds.x + bounds.width * 0.72,
      y: bounds.y + bounds.height * 0.68
    });
  }

  const state = store.mutate((draft) => {
    const petId = nextCommand.petId || draft.activePetId;
    if (command.type === "release") {
      draft.summonedPetIds = Array.from(
        new Set([...draft.summonedPetIds, petId])
      );
      draft.stats.releaseCount += 1;
      appendActivity(draft, "wake", "桌宠从管理窗口释放到桌面。");
    } else if (command.type === "wake") {
      draft.summonedPetIds = Array.from(
        new Set([...draft.summonedPetIds, petId])
      );
      draft.stats.wakeCount += 1;
      appendActivity(draft, "wake", "桌宠被唤醒。");
    } else if (command.type === "sleep") {
      draft.summonedPetIds = draft.summonedPetIds.filter(
        (id) => id !== petId
      );
      appendActivity(draft, "rest", "桌宠开始放松并进入休眠。");
    } else if (command.type === "rest") {
      appendActivity(draft, "rest", "桌宠在桌面上进入休眠。");
    }
  });
  broadcastState();
  window.webContents.send("overlay:command", nextCommand);
  for (const browserWindow of BrowserWindow.getAllWindows()) {
    if (!browserWindow.isDestroyed()) {
      browserWindow.webContents.send("overlay:mode", nextCommand.type);
    }
  }
  return state;
}

function createAuxiliaryWindow(config) {
  if (!config?.id) return null;
  const existing = auxiliaryWindows.get(config.id);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }

  const auxiliary = new BrowserWindow({
    width: Number(config.width) || 440,
    height: Number(config.height) || 320,
    minWidth: 320,
    minHeight: 220,
    title: config.title || config.name || "辅助窗口",
    autoHideMenuBar: true,
    backgroundColor: "#f7f5ef",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  auxiliary.loadURL(rendererUrl(`aux:${config.id}`));
  auxiliary.on("closed", () => auxiliaryWindows.delete(config.id));
  auxiliary.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  auxiliaryWindows.set(config.id, auxiliary);
  return auxiliary;
}

function createChatWindow(mode, dialogModuleId) {
  const key = `${mode}:${dialogModuleId || "default"}`;
  const existing = chatWindows.get(key);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }
  const dialogModule = store
    .get()
    .customModules.find((item) => item.id === dialogModuleId);
  const window = new BrowserWindow({
    width: Number(dialogModule?.width) || 460,
    height: Number(dialogModule?.height) || 620,
    minWidth: 360,
    minHeight: 420,
    title: mode === "voice" ? "桌宠语音对话" : "桌宠文字对话",
    autoHideMenuBar: true,
    backgroundColor: dialogModule?.background || "#f7f5ef",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  window.loadURL(rendererUrl(`chat:${mode}`));
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.on("closed", () => chatWindows.delete(key));
  chatWindows.set(key, window);
  return window;
}

function externalModulesRoot() {
  return path.join(store.userDataPath, "custom-modules");
}

function readExternalModuleManifest(folderPath) {
  const manifestPath = ["module.json", "manifest.json"]
    .map((name) => path.join(folderPath, name))
    .find((candidate) => fs.existsSync(candidate));
  if (!manifestPath) {
    throw new Error("模组文件夹里缺少 module.json 或 manifest.json。");
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const id = safeFileName(manifest.id || path.basename(folderPath));
  const entry = String(manifest.entry || "index.html");
  const entryPath = path.resolve(folderPath, entry);
  const relation = path.relative(folderPath, entryPath);
  if (relation.startsWith("..") || path.isAbsolute(relation)) {
    throw new Error("模组入口文件路径无效。");
  }
  if (!fs.existsSync(entryPath)) {
    throw new Error(`没有找到模组入口文件：${entry}`);
  }
  return {
    manifest,
    record: {
      id,
      name: String(manifest.name || id),
      description: String(manifest.description || "外部模组"),
      kind: manifest.type === "dialog-box" ? "dialog-box" : "interaction",
      moduleScope: manifest.scope === "pet" ? "pet" : "global",
      moduleCategory:
        manifest.category === "dialog-skin" ||
        manifest.category === "auxiliary-window" ||
        manifest.category === "interaction"
          ? manifest.category
          : "external",
      contextMenuLabel: String(
        manifest.contextMenuLabel || manifest.name || "打开模组"
      ),
      enabled: manifest.enabled !== false,
      quickControl: manifest.quickControl === true,
      builtinType:
        manifest.builtinType === "auxiliary-window"
          ? "auxiliary-window"
          : undefined,
      windowTitle: String(manifest.windowTitle || manifest.name || ""),
      windowBody: String(manifest.windowBody || manifest.description || ""),
      windowWidth: Number(manifest.windowWidth) || 420,
      windowHeight: Number(manifest.windowHeight) || 320,
      version: String(manifest.version || "1.0.0"),
      author: String(manifest.author || ""),
      entry,
      sourcePath: folderPath,
      width: Number(manifest.width) || 420,
      height: Number(manifest.height) || 420,
      background: String(manifest.background || "#f7f5ef"),
      borderColor: String(manifest.borderColor || "#d9d7d0"),
      borderRadius: Number(manifest.borderRadius) || 8,
      textColor: String(manifest.textColor || "#172033"),
      userBubbleColor: String(manifest.userBubbleColor || "#edf5ff"),
      assistantBubbleColor: String(
        manifest.assistantBubbleColor || "#ffffff"
      ),
      fontFamily: String(manifest.fontFamily || "Microsoft YaHei UI"),
      customCss: String(manifest.customCss || ""),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
}

function loadExternalModules() {
  const root = externalModulesRoot();
  if (!fs.existsSync(root)) return;
  const records = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      records.push(
        readExternalModuleManifest(path.join(root, entry.name)).record
      );
    } catch (error) {
      console.warn(`[module] ${entry.name}: ${error.message}`);
    }
  }
  if (!records.length) return;
  store.mutate((draft) => {
    for (const record of records) {
      const index = draft.customModules.findIndex(
        (item) => item.id === record.id
      );
      if (index >= 0) {
        draft.customModules[index] = {
          ...draft.customModules[index],
          ...record,
          createdAt: draft.customModules[index].createdAt
        };
      } else {
        draft.customModules.push(record);
      }
    }
  });
}

function openExternalModuleWindow(moduleId) {
  const module = store
    .get()
    .customModules.find((item) => item.id === moduleId);
  if (module?.builtinType === "auxiliary-window") {
    createAuxiliaryWindow({
      id: module.id,
      name: module.name,
      title: module.windowTitle || module.name,
      body: module.windowBody || module.description,
      width: module.windowWidth || 420,
      height: module.windowHeight || 320,
      enabled: true
    });
    return true;
  }
  if (!module?.sourcePath || !module.entry) {
    throw new Error("该模组没有可打开的入口文件。");
  }
  const existing = externalModuleWindows.get(module.id);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }
  const entryPath = path.resolve(module.sourcePath, module.entry);
  const relation = path.relative(module.sourcePath, entryPath);
  if (relation.startsWith("..") || path.isAbsolute(relation)) {
    throw new Error("模组入口路径无效。");
  }
  const window = new BrowserWindow({
    width: module.width,
    height: module.height,
    title: module.name,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.loadFile(entryPath);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.on("closed", () => externalModuleWindows.delete(module.id));
  externalModuleWindows.set(module.id, window);
  return window;
}

function triggerModuleAction(moduleId, petId = "default", origin = null) {
  const module = store
    .get()
    .customModules.find((item) => item.id === moduleId);
  if (!module) throw new Error("没有找到模组。");
  if (module.builtinType === "hunger-food") {
    return { ok: true, type: "hunger" };
  }
  if (module.builtinType !== "climb-platforms") {
    return openExternalModuleWindow(moduleId);
  }
  const key = String(petId || "default");
  const windows = climbWindows.get(key) || [];
  const maxWindows = Math.max(1, Number(module.climbMaxWindows || 2));
  while (windows.length >= maxWindows) {
    const oldest = windows.shift();
    if (oldest?.window && !oldest.window.isDestroyed()) {
      oldest.window.close();
    }
  }
  const display = screen.getPrimaryDisplay().workArea;
  const width = Number(module.windowWidth) || 420;
  const height = Number(module.windowHeight) || 300;
  const originX = Number(origin?.x);
  const originY = Number(origin?.y);
  const stepX = Math.max(48, Number(origin?.stepX) || 115);
  const stepY = Math.max(48, Number(origin?.stepY) || 147);
  const maxRise = stepY * 2;
  const x = Number.isFinite(originX)
    ? Math.round(
        Math.max(
          display.x,
          Math.min(display.x + display.width - width, originX - width / 2)
        )
      )
    : Math.round(
        display.x + display.width / 2 - width / 2
      );
  const y = Number.isFinite(originY)
    ? Math.round(
        Math.max(
          display.y + 40,
          Math.min(
            display.y + display.height - height,
            originY - maxRise
          )
        )
      )
    : Math.round(display.y + display.height * 0.35);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:${module.background || "#f7f5ef"};color:${module.textColor || "#172033"};font-family:${module.fontFamily || "Microsoft YaHei UI"};}
    main{display:grid;height:100%;place-content:center;gap:10px;padding:22px;text-align:center;}
    h1{margin:0;font-size:18px;}p{margin:0;font-size:12px;line-height:1.7;}
  </style></head><body><main><h1>${String(module.windowTitle || module.name).replace(/[<>&"]/g, "")}</h1><p>${String(module.windowBody || module.description).replace(/[<>&"]/g, "")}</p></main></body></html>`;
  const platformId = id("climb");
  const window = new BrowserWindow({
    x,
    y,
    width,
    height,
    title: module.windowTitle || module.name,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const publishBounds = () => {
    if (window.isDestroyed()) return;
    const bounds = window.getBounds();
    broadcastClimbPlatform({
      id: platformId,
      petId: key,
      closed: false,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    });
  };
  window.on("move", publishBounds);
  window.on("resize", publishBounds);
  const closeTimer = setTimeout(() => {
    if (!window.isDestroyed()) window.close();
  }, 4500);
  window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  window.on("closed", () => {
    clearTimeout(closeTimer);
    const current = climbWindows.get(key) || [];
    climbWindows.set(
      key,
      current.filter((item) => item.id !== platformId)
    );
    broadcastClimbPlatform({
      id: platformId,
      petId: key,
      closed: true
    });
  });
  windows.push({ id: platformId, window });
  climbWindows.set(key, windows);
  return { id: platformId, x, y, width, height, stepX, stepY };
}

function safeFileName(value) {
  return String(value || "asset")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function assetUrl(relativePath) {
  return `deskpet://assets/${relativePath.split(path.sep).join("/")}`;
}

function copyIntoAssets(sourcePath, folder) {
  const targetDir = path.join(store.assetsPath, folder);
  fs.mkdirSync(targetDir, { recursive: true });
  const extension = path.extname(sourcePath);
  const baseName = safeFileName(path.basename(sourcePath, extension));
  const uniqueName = `${Date.now()}-${baseName}${extension.toLowerCase()}`;
  const targetPath = path.join(targetDir, uniqueName);
  fs.copyFileSync(sourcePath, targetPath);
  const relativePath = path.relative(store.assetsPath, targetPath);
  return {
    id: id("asset"),
    name: path.basename(sourcePath),
    relativePath,
    url: assetUrl(relativePath),
    size: fs.statSync(targetPath).size,
    createdAt: new Date().toISOString()
  };
}

function formatParameterSize(parameterCount) {
  if (!Number.isFinite(parameterCount) || parameterCount <= 0) return "";
  if (parameterCount >= 1_000_000_000) {
    return `${(parameterCount / 1_000_000_000).toFixed(1)}B`;
  }
  if (parameterCount >= 1_000_000) {
    return `${(parameterCount / 1_000_000).toFixed(1)}M`;
  }
  return `${parameterCount}`;
}

function inferModelFamily(filePath, details = "") {
  const value = `${path.basename(filePath)} ${details}`.toLowerCase();
  if (value.includes("deepseek")) return "DeepSeek";
  if (value.includes("qwen")) return "Qwen";
  if (value.includes("mistral") || value.includes("mixtral")) return "Mistral";
  if (value.includes("gemma")) return "Gemma";
  if (value.includes("llama")) return "Llama";
  return "Unknown";
}

function suggestModelAdapter(family, parameterSize, fileName = "") {
  const normalized = String(parameterSize || "").toUpperCase();
  if (family === "Qwen") {
    const isQwen3 = /qwen[\s_-]*3/i.test(fileName);
    const isBase = /base/i.test(fileName);
    if (
      isQwen3 &&
      (normalized.startsWith("596") || normalized.startsWith("0.6B"))
    ) {
      return isBase ? "Qwen/Qwen3-0.6B-Base" : "Qwen/Qwen3-0.6B";
    }
    if (normalized.startsWith("0.5B")) return "Qwen/Qwen2.5-0.5B-Instruct";
    if (normalized.startsWith("1.5B")) return "Qwen/Qwen2.5-1.5B-Instruct";
    if (normalized.startsWith("3")) return "Qwen/Qwen2.5-3B-Instruct";
    if (normalized.startsWith("7")) return "Qwen/Qwen2.5-7B-Instruct";
    if (normalized.startsWith("14")) return "Qwen/Qwen2.5-14B-Instruct";
  }
  if (family === "DeepSeek") {
    if (normalized.startsWith("1.5B")) {
      return "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B";
    }
    if (normalized.startsWith("7")) {
      return "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B";
    }
    if (normalized.startsWith("14")) {
      return "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B";
    }
    if (normalized.startsWith("32")) {
      return "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B";
    }
  }
  return "";
}

function inspectSafetensors(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size < 16) {
    throw new Error("文件太小，不是有效的 .safetensors 模型。");
  }
  const fd = fs.openSync(filePath, "r");
  try {
    const lengthBuffer = Buffer.alloc(8);
    fs.readSync(fd, lengthBuffer, 0, 8, 0);
    const headerLength = Number(lengthBuffer.readBigUInt64LE(0));
    if (
      !Number.isSafeInteger(headerLength) ||
      headerLength <= 2 ||
      headerLength > stat.size - 8 ||
      headerLength > 128 * 1024 * 1024
    ) {
      throw new Error("safetensors 头信息无效，文件可能未下载完整。");
    }
    const headerBuffer = Buffer.alloc(headerLength);
    fs.readSync(fd, headerBuffer, 0, headerLength, 8);
    const header = JSON.parse(headerBuffer.toString("utf8"));
    let parameterCount = 0;
    const tensorNames = [];
    for (const [name, value] of Object.entries(header)) {
      if (name === "__metadata__" || !value?.shape) continue;
      tensorNames.push(name);
      parameterCount += value.shape.reduce(
        (total, dimension) => total * Number(dimension || 1),
        1
      );
    }
    const metadataText = JSON.stringify(header.__metadata__ || {});
    const tensorText = tensorNames.slice(0, 80).join(" ");
    return {
      metadata: header.__metadata__ || {},
      tensorCount: tensorNames.length,
      parameterCount,
      family: inferModelFamily(filePath, `${metadataText} ${tensorText}`)
    };
  } finally {
    fs.closeSync(fd);
  }
}

function inspectGguf(filePath) {
  const header = Buffer.alloc(4);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, header, 0, 4, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (header.toString("ascii") !== "GGUF") {
    throw new Error("文件头不是 GGUF，可能不是有效的对话模型。");
  }
  const preview = fs.readFileSync(filePath, { encoding: "latin1" }).slice(0, 1024 * 1024);
  return {
    family: inferModelFamily(filePath, preview)
  };
}

function inspectWhisperModel(sourcePath) {
  if (!fs.statSync(sourcePath).isDirectory()) {
    throw new Error("Whisper 模型需要选择包含配置和权重的模型文件夹。");
  }
  const entries = fs.readdirSync(sourcePath);
  const lower = new Map(entries.map((name) => [name.toLowerCase(), name]));
  const hasConfig = lower.has("config.json");
  const hasTokenizer =
    lower.has("tokenizer.json") ||
    lower.has("vocabulary.json") ||
    lower.has("vocabulary.txt");
  const hasWeights =
    lower.has("model.safetensors") ||
    lower.has("model.bin") ||
    entries.some((name) => name.toLowerCase().endsWith(".safetensors"));
  const missing = [];
  if (!hasConfig) missing.push("config.json");
  if (!hasWeights) missing.push("模型权重");
  if (!hasTokenizer) missing.push("分词器文件");
  return {
    status: missing.length === 0 ? "ready" : "needs-files",
    family: "Whisper",
    companionPaths: entries.map((name) => path.join(sourcePath, name)),
    validationMessage:
      missing.length === 0
        ? "Whisper 模型文件完整，可以直接用于本地语音识别。"
        : `缺少：${missing.join("、")}。`
  };
}

function inspectGptSoVitsVoiceModel(sourcePath) {
  if (!fs.statSync(sourcePath).isDirectory()) {
    throw new Error("GPT-SoVITS 声线模型需要选择模型文件夹。");
  }
  const files = fs.readdirSync(sourcePath);
  const gptFiles = files.filter((name) => /\.ckpt$/i.test(name));
  const sovitsFiles = files.filter((name) => /\.pth$/i.test(name));
  const missing = [];
  if (gptFiles.length === 0) missing.push("GPT .ckpt 权重");
  if (sovitsFiles.length === 0) missing.push("SoVITS .pth 权重");
  return {
    status: missing.length === 0 ? "ready" : "needs-files",
    family: "GPT-SoVITS",
    companionPaths: [...gptFiles, ...sovitsFiles].map((name) =>
      path.join(sourcePath, name)
    ),
    validationMessage:
      missing.length === 0
        ? "GPT-SoVITS 声线权重完整，可以绑定到声音模块。"
        : `缺少：${missing.join("、")}。`
  };
}

function inspectLlmFolder(sourcePath) {
  const entries = fs.readdirSync(sourcePath);
  const lowerEntries = entries.map((name) => name.toLowerCase());
  const configName =
    entries.find((name) => name.toLowerCase() === "config.json") || "";
  const tokenizerNames = [
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.json",
    "merges.txt",
    "special_tokens_map.json"
  ].filter((name) => lowerEntries.includes(name));
  const weightNames = entries.filter((name) =>
    /\.(safetensors|gguf)$/i.test(name)
  );
  const missing = [];
  if (!configName) missing.push("config.json");
  if (!weightNames.length) missing.push("模型权重");
  if (!tokenizerNames.length) missing.push("分词器文件");

  let family = inferModelFamily(sourcePath);
  if (family === "Unknown" && configName) {
    try {
      const configText = fs.readFileSync(path.join(sourcePath, configName), "utf8");
      family = inferModelFamily(sourcePath, configText);
    } catch {
      // Keep the folder usable if one metadata file cannot be read.
    }
  }

  return {
    status: missing.length === 0 ? "ready" : "needs-files",
    family,
    companionPaths: entries.map((name) => path.join(sourcePath, name)),
    validationMessage:
      missing.length === 0
        ? `完整模型文件夹已识别${family !== "Unknown" ? `：${family}` : ""}。`
        : `缺少：${missing.join("、")}。`
  };
}

function inspectLocalModel(kind, sourcePath) {
  const stat = fs.statSync(sourcePath);
  if (kind === "tts") {
    const result = inspectGptSoVitsVoiceModel(sourcePath);
    return {
      kind,
      name: path.basename(sourcePath),
      format: "gpt-sovits",
      sourcePath,
      backend: "gpt-sovits",
      ...result
    };
  }
  if (kind === "asr") {
    const result = inspectWhisperModel(sourcePath);
    return {
      kind,
      name: path.basename(sourcePath),
      format: "whisper",
      sourcePath,
      backend: "whisper",
      ...result
    };
  }
  if (stat.isDirectory()) {
    const result = inspectLlmFolder(sourcePath);
    return {
      kind: "llm",
      name: path.basename(sourcePath),
      format: "safetensors",
      sourcePath,
      backend: "transformers",
      family: inferModelFamily(sourcePath),
      status: result.status,
      companionPaths: result.companionPaths,
      validationMessage: result.validationMessage
    };
  }

  const extension = path.extname(sourcePath).toLowerCase();
  if (extension === ".gguf") {
    const result = inspectGguf(sourcePath);
    return {
      kind: "llm",
      name: path.basename(sourcePath),
      format: "gguf",
      sourcePath,
      backend: "llama.cpp",
      family: result.family,
      companionPaths: [sourcePath],
      status: "ready",
      validationMessage: "GGUF 文件结构有效，已准备使用 llama.cpp 本地后端。"
    };
  }
  if (extension === ".safetensors") {
    const result = inspectSafetensors(sourcePath);
    const parameterSize = formatParameterSize(result.parameterCount);
    const fileName = path.basename(sourcePath);
    const looksLikeVae = /vae/i.test(fileName);
    const modelId = looksLikeVae
      ? ""
      : suggestModelAdapter(result.family, parameterSize, fileName);
    return {
      kind: "llm",
      name: fileName,
      format: "safetensors",
      sourcePath,
      backend: "transformers",
      family: result.family,
      parameterSize,
      modelId,
      companionPaths: [sourcePath],
      status: modelId ? "ready" : looksLikeVae ? "invalid" : "unsupported",
      validationMessage:
        modelId
          ? `已识别 ${result.family} 权重，将使用内置适配信息加载。`
          : looksLikeVae
            ? "这是图像或视频模型的 VAE 组件，不是对话语言模型，不能用于 AI 对话。"
          : result.family === "Unknown"
            ? "权重文件有效，但暂时无法识别模型家族，需要后续选择适配包。"
            : `已识别 ${result.family} 权重，但该家族目前在预留窗口，尚未启用推理。`
    };
  }
  throw new Error("当前只支持 .safetensors、.gguf、Whisper 和 GPT-SoVITS 模型。");
}

function registerApiServiceModel(kind, config) {
  const now = new Date().toISOString();
  const sourcePath = String(config.baseUrl || "").trim();
  const displayName =
    config.model ||
    config.voiceId ||
    `${kind.toUpperCase()} API`;
  return store.mutate((draft) => {
    const modelKey = config.model || config.voiceId || "";
    const existing = draft.localModels.find(
      (model) =>
        model.kind === kind &&
        model.format === "api" &&
        model.sourcePath === sourcePath &&
        (model.modelId || "") === modelKey
    );
    const record = {
      id: existing?.id || id("model"),
      name: displayName,
      kind,
      format: "api",
      sourcePath,
      companionPaths: [],
      family: "API",
      parameterSize: "",
      status: "ready",
      validationMessage: "API 连接测试成功，可以设为当前模型。",
      backend: "api",
      modelId: modelKey,
      apiConfig: {
        ...config,
        mode: "api"
      },
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    if (existing) {
      Object.assign(existing, record);
    } else {
      draft.localModels.unshift(record);
    }
  });
}

function resolveAiModule(state, options = {}) {
  const activePet =
    state.pets?.find((pet) => pet.id === state.activePetId) || state.pets?.[0];
  const voiceProfileId =
    options.voiceProfileId || activePet?.modulePlugins?.voiceProfileId || "";
  const voiceProfile = state.voiceProfiles?.find(
    (profile) => profile.id === voiceProfileId
  );
  const moduleId =
    options.aiModuleId ||
    activePet?.modulePlugins?.aiModuleId ||
    voiceProfile?.defaultAiModuleId ||
    state.activeTrainingProfileId;
  return (
    state.trainingProfiles?.find((profile) => profile.id === moduleId) ||
    state.trainingProfiles?.find(
      (profile) => profile.id === state.activeTrainingProfileId
    ) ||
    state.trainingProfiles?.[0] ||
    null
  );
}

async function replyWithProviders(state, text, options = {}) {
  const aiModule = resolveAiModule(state, options);
  const replyState = aiModule
    ? {
        ...state,
        character: aiModule.character || state.character,
        documents: aiModule.documents || state.documents,
        memories: aiModule.memories || state.memories
      }
    : state;
  const modelId =
    aiModule?.localModelId ||
    options.modelId ||
    state.localInference?.llmModelId ||
    "";
  const llmMode = state.settings?.services?.llm?.mode || "local";
  if (llmMode === "api") {
    return ai.chatLocal(replyState, [{ role: "user", content: text }]);
  }
  const selectedModel = (state.localModels || []).find(
    (model) => model.id === modelId && model.status === "ready"
  );
  if (!selectedModel) {
    return {
      ok: true,
      source: "fallback",
      text: ai.fallbackReply(replyState, text),
      warning: "当前 AI 模块还没有可用的本地对话模型。"
    };
  }
  const systemPrompt = aiModule
    ? ai.buildProfileSkillPrompt(aiModule)
    : ai.buildSystemPrompt(state);
  const messages = [{ role: "user", content: text }];
  try {
    const localResult = await localInference.chat(state, [
      { role: "system", content: systemPrompt },
      ...messages
    ], { modelId: selectedModel.id });
    if (localResult) {
      const parsedResult = ai.parseModelPayload(localResult.text);
      return {
        ...localResult,
        text: ai.sanitizeCharacterReply(
          parsedResult.text || localResult.text
        ),
        speech: parsedResult.speech || undefined
      };
    }
  } catch (error) {
    return {
      ok: false,
      source: "local-model",
      text: `本地模型暂时无法运行：${error.message || "未知错误"}`,
      error: error.message || "本地模型推理失败。"
    };
  }
  return ai.chatLocal(replyState, messages);
}

async function transcribeWithProviders(state, filePath) {
  let apiResult = null;
  if ((state.settings?.services?.asr?.mode || "local") === "api") {
    apiResult = await ai.transcribeLocal(state, filePath);
    if (apiResult.ok) return apiResult;
  }
  const tempDir = path.join(os.tmpdir(), "arkpet-asr-audio");
  fs.mkdirSync(tempDir, { recursive: true });
  const extension = path.extname(filePath).toLowerCase();
  const normalizedPath =
    extension === ".wav"
      ? filePath
      : path.join(tempDir, `normalized-${Date.now()}.wav`);
  let createdNormalizedFile = false;

  if (normalizedPath !== filePath) {
    const ffmpegPath = path.join(VOICE_ENGINE_DIR, "ffmpeg.exe");
    const conversion = spawnSync(
      ffmpegPath,
      [
        "-y",
        "-i",
        filePath,
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        normalizedPath
      ],
      { windowsHide: true }
    );
    if (conversion.status !== 0 || !fs.existsSync(normalizedPath)) {
      return {
        ok: false,
        error: "录音格式转换失败，无法准备 Whisper 输入音频。"
      };
    }
    createdNormalizedFile = true;
  }

  try {
    const localResult = await localInference.transcribe(
      state,
      normalizedPath
    );
    if (localResult) return localResult;
  } catch (error) {
    return {
      ok: false,
      error: error.message || "本地 Whisper 识别失败。"
    };
  } finally {
    if (createdNormalizedFile) {
      fs.rmSync(normalizedPath, { force: true });
    }
  }
  return apiResult || ai.transcribeLocal(state, filePath);
}

async function transcribeAudioBytes(audioBytes) {
  const tempDir = path.join(os.tmpdir(), "arkpet-voice-agent");
  fs.mkdirSync(tempDir, { recursive: true });
  const filePath = path.join(tempDir, `input-${Date.now()}.webm`);
  fs.writeFileSync(filePath, Buffer.from(audioBytes));
  try {
    return await transcribeWithProviders(store.get(), filePath);
  } finally {
    fs.rmSync(filePath, { force: true });
  }
}

function getVoiceTrainingRuntime() {
  const pythonPath = path.join(CUDA128_RUNTIME_DIR, "python.exe");
  const logPath = path.join(
    __dirname,
    "..",
    "voice-engine",
    "cuda128-setup.log"
  );
  const logText = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, "utf8")
    : "";
  if (!fs.existsSync(pythonPath)) {
    return {
      ready: false,
      progress: logText.includes("Copying base runtime") ? 8 : 0,
      phase: "复制运行环境",
      message:
        "独立 CUDA 12.8 训练环境尚未安装。训练按钮会在环境验证通过后自动启用。"
    };
  }
  if (logText.includes("Verifying CUDA 12.8")) {
    return {
      ready: false,
      progress: 92,
      phase: "验证 RTX 5070",
      message: "CUDA 组件安装完成，正在验证 RTX 5070 的 sm_120 支持。"
    };
  }
  if (logText.includes("Installing CUDA 12.8 PyTorch")) {
    return {
      ready: false,
      progress: 55,
      phase: "下载并安装 CUDA 12.8",
      message: "正在下载和安装 GPU 训练组件，预计需要一些时间。"
    };
  }
  const result = spawnSync(
    pythonPath,
    [
      "-c",
      [
        "import torch",
        "print(torch.__version__)",
        "print(torch.version.cuda or '')",
        "print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')",
        "print('sm_120' in torch.cuda.get_arch_list() if torch.cuda.is_available() else False)"
      ].join(";")
    ],
    { encoding: "utf8", windowsHide: true }
  );
  if (result.status !== 0) {
    return {
      ready: false,
      progress: 80,
      phase: "检查失败",
      message: "CUDA 训练环境存在，但 PyTorch 检查失败。"
    };
  }
  const [version, cuda, device, supportsSm120] = result.stdout
    .trim()
    .split(/\r?\n/);
  if (supportsSm120 !== "True") {
    return {
      ready: false,
      progress: 90,
      phase: "需要升级",
      message: `当前 PyTorch ${version} 尚未支持 RTX 5070 sm_120。`,
      cuda,
      device
    };
  }
  return {
    ready: true,
    progress: 100,
    phase: "训练环境可用",
    message: `CUDA 训练环境可用：PyTorch ${version} / CUDA ${cuda} / ${device}`,
    cuda,
    device
  };
}

function getAudioDuration(filePath) {
  const ffprobePath = path.join(VOICE_ENGINE_DIR, "ffprobe.exe");
  const result = spawnSync(
    ffprobePath,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ],
    { encoding: "utf8", windowsHide: true }
  );
  if (result.status !== 0) return 0;
  const duration = Number(result.stdout.trim());
  return Number.isFinite(duration) ? duration : 0;
}

function getDesktopIcons() {
  const scriptPath = path.join(
    __dirname,
    "..",
    "scripts",
    "get_desktop_icons.ps1"
  );
  const desktopPath = app.getPath("desktop");
  let foodFiles = [];
  try {
    foodFiles = fs
      .readdirSync(desktopPath, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() && entry.name.toLowerCase().endsWith(".food")
      )
      .map((entry) => ({
        name: entry.name,
        stem: path.parse(entry.name).name,
        path: path.join(desktopPath, entry.name)
      }));
  } catch {
    foodFiles = [];
  }
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { encoding: "utf8", windowsHide: true, timeout: 10000 },
      (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        try {
          const parsed = JSON.parse(String(stdout).trim());
          const scale = screen.getPrimaryDisplay().scaleFactor || 1;
          resolve(
            parsed.map((icon) => {
              let name = "";
              try {
                name = Buffer.from(String(icon.label || ""), "base64")
                  .toString("utf16le")
                  .replace(/\0+$/g, "");
              } catch {
                name = "";
              }
              const normalizedName = name.trim().toLowerCase();
              const matchedFood = foodFiles.find(
                (food) =>
                  food.name.toLowerCase() === normalizedName ||
                  food.stem.toLowerCase() === normalizedName
              );
              return {
                id: name || `desktop-${icon.x}-${icon.y}`,
                name,
                foodPath: matchedFood?.path || "",
                x: Number(icon.x) / scale,
                y: Number(icon.y) / scale,
                width: Number(icon.width) / scale,
                height: Number(icon.height) / scale
              };
            })
          );
        } catch {
          resolve([]);
        }
      }
    );
  });
}

async function synthesizeWithSelectedVoice(state, text, options = {}) {
  const activeProfile = state.trainingProfiles?.find(
    (profile) => profile.id === state.activeTrainingProfileId
  );
  const profileId =
    options.voiceProfileId ||
    activeProfile?.voiceProfileIds?.[0] ||
    state.voiceProfiles?.[0]?.id;
  const profile =
    state.voiceProfiles?.find((item) => item.id === profileId) ||
    state.voiceProfiles?.find((item) =>
      activeProfile?.voiceProfileIds?.includes(item.id)
    ) ||
    state.voiceProfiles?.[0];
  const nextVoiceConfig = {
    ...(options.config || {}),
    ...options,
    voiceProfileId: profile?.id || options.voiceProfileId || "",
    engineType: profile?.engineType || options.engineType || "gpt-sovits",
    baseUrl: profile?.baseUrl || options.baseUrl || VOICE_SERVICE_URL,
    model: profile?.model || options.model || "",
    apiKey: profile?.apiKey || options.apiKey || "",
    referenceText: profile?.referenceText || options.referenceText || ""
  };

  const ttsMode = state.settings?.services?.tts?.mode || "local";
  if (ttsMode === "api") {
    nextVoiceConfig.engineType = "api";
    return ai.synthesizeLocal(
      state,
      text,
      profile?.voiceId || options.voiceId,
      nextVoiceConfig
    );
  }

  if (nextVoiceConfig.engineType === "gpt-sovits") {
    const effectiveVoiceConfig = {
      ...(state.settings?.services?.tts || {}),
      ...nextVoiceConfig
    };
    if (!isBundledVoiceService(effectiveVoiceConfig)) {
      return { ok: false, error: "GPT-SoVITS 地址必须指向本机 9880 端口。" };
    }
    const serviceState = await ensureVoiceService();
    if (!serviceState.ok) return serviceState;
    const localVoiceModel = (state.localModels || []).find(
      (model) =>
        model.id === state.localInference?.ttsModelId &&
        model.kind === "tts" &&
        model.status === "ready"
    );
    if (localVoiceModel) {
      const gptWeight = localVoiceModel.companionPaths.find((filePath) =>
        filePath.toLowerCase().endsWith(".ckpt")
      );
      const sovitsWeight = localVoiceModel.companionPaths.find((filePath) =>
        filePath.toLowerCase().endsWith(".pth")
      );
      try {
        if (gptWeight) {
          const response = await fetch(
            `${VOICE_SERVICE_URL}/set_gpt_weights?weights_path=${encodeURIComponent(gptWeight)}`
          );
          if (!response.ok) throw new Error(await response.text());
        }
        if (sovitsWeight) {
          const response = await fetch(
            `${VOICE_SERVICE_URL}/set_sovits_weights?weights_path=${encodeURIComponent(sovitsWeight)}`
          );
          if (!response.ok) throw new Error(await response.text());
        }
      } catch (error) {
        return {
          ok: false,
          error: `声线模型切换失败：${error.message || "未知错误"}`
        };
      }
    }
    const sample =
      profile?.samples?.find((item) => item.id === profile.activeSampleId) ||
      profile?.samples?.[0];
    if (sample?.relativePath) {
      const sourcePath = path.join(store.assetsPath, sample.relativePath);
      const referenceDir = path.join(os.tmpdir(), "desk-pet-voice");
      fs.mkdirSync(referenceDir, { recursive: true });
      const trimmedPath = path.join(referenceDir, `${profile.id}-ref.wav`);
      const sourceStat = fs.statSync(sourcePath);
      const trimmedReady =
        fs.existsSync(trimmedPath) &&
        fs.statSync(trimmedPath).mtimeMs >= sourceStat.mtimeMs;
      if (!trimmedReady) {
        const pythonPath = path.join(
          VOICE_ENGINE_DIR,
          "runtime",
          "python.exe"
        );
        const trimScript = path.join(
          __dirname,
          "..",
          "scripts",
          "trim_reference_wav.py"
        );
        const trimResult = spawnSync(
          pythonPath,
          [trimScript, sourcePath, trimmedPath, "8"],
          { windowsHide: true }
        );
        nextVoiceConfig.refAudioPath =
          trimResult.status === 0 ? trimmedPath : sourcePath;
      } else {
        nextVoiceConfig.refAudioPath = trimmedPath;
      }
    }
  }
  return ai.synthesizeLocal(
    state,
    text,
    profile?.voiceId || options.voiceId,
    nextVoiceConfig
  );
}

function buildTrainingDataset(profile) {
  const character = profile.character || {};
  const skillPrompt = ai.buildProfileSkillPrompt(profile);
  const examples = [
    {
      messages: [
        {
          role: "system",
          content: skillPrompt
        },
        {
          role: "user",
          content: "简单介绍一下你自己。"
        },
        {
          role: "assistant",
          content: `我是${character.name || profile.name}。${character.personality || "我会保持自己的性格回应你。"}`
        }
      ]
    }
  ];
  for (const document of profile.documents || []) {
    examples.push({
      messages: [
        {
          role: "system",
          content: `${skillPrompt}\n\n以下是${character.name || profile.name}的背景资料，请用于保持角色设定。`
        },
        { role: "user", content: document.title || "阅读这份资料。" },
        { role: "assistant", content: document.content || "" }
      ]
    });
  }
  for (const memory of profile.memories || []) {
    examples.push({
      messages: [
        {
          role: "system",
          content: `${skillPrompt}\n\n请记住这条与用户有关的长期记忆：${memory.title || "记忆"}`
        },
        { role: "user", content: "你还记得这件事吗？" },
        { role: "assistant", content: memory.content || "" }
      ]
    });
  }
  return examples.map((item) => JSON.stringify(item)).join("\n");
}

function registerIpc() {
  ipcMain.handle("store:get", () => store.get());
  ipcMain.handle("store:update", (_event, patch) => {
    const state = store.update(patch);
    broadcastState();
    applyOverlaySettings();
    return state;
  });
  ipcMain.on("store:update-sync", (event, patch) => {
    const state = store.update(patch);
    broadcastState();
    applyOverlaySettings();
    event.returnValue = state;
  });
  ipcMain.handle("store:replace", (_event, nextState) => {
    const state = store.replace(nextState);
    broadcastState();
    applyOverlaySettings();
    return state;
  });

  ipcMain.handle("display:get-metrics", () => getPrimaryMetrics());
  ipcMain.handle("desktop:get-icons", () => getDesktopIcons());
  ipcMain.on("debug:physics-log", (_event, message) => {
    if (process.env.ARKPET_PHYSICS_DEBUG !== "1") return;
    fs.appendFileSync(
      path.join(__dirname, "..", "voice-engine", "physics-debug.log"),
      `${message}\n`,
      "utf8"
    );
  });
  ipcMain.handle("window:get-control-bounds", () => {
    if (!controlWindow || controlWindow.isDestroyed()) return null;
    return controlWindow.getBounds();
  });
  ipcMain.handle("window:show-control", () => {
    createControlWindow();
    return true;
  });
  ipcMain.handle("window:hide-control", () => {
    if (controlWindow && !controlWindow.isDestroyed()) controlWindow.hide();
    return true;
  });

  ipcMain.on("overlay:ignore-mouse", (_event, ignore) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
    }
  });
  ipcMain.on("overlay:set-focusable", (_event, focusable) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setFocusable(Boolean(focusable));
      if (focusable) {
        overlayWindow.setIgnoreMouseEvents(false);
        overlayWindow.focus();
      }
    }
  });
  ipcMain.handle("overlay:command", (_event, command) => sendOverlayCommand(command));
  ipcMain.handle("overlay:hide", () => {
    hideOverlay();
    return true;
  });

  ipcMain.handle("auxiliary:open", (_event, auxiliaryId) => {
    const state = store.get();
    const config = state.auxiliaryWindows.find((item) => item.id === auxiliaryId);
    if (!config) throw new Error("没有找到辅助窗口配置。");
    createAuxiliaryWindow(config);
    return true;
  });
  ipcMain.handle("chat:open", (_event, mode, dialogModuleId) => {
    const state = store.get();
    const nextModuleId =
      dialogModuleId ||
      state.settings.chat?.dialogModuleId ||
      state.customModules.find((item) => item.kind === "dialog-box")?.id ||
      "";
    if (nextModuleId !== state.settings.chat?.dialogModuleId) {
      store.update({
        settings: {
          ...state.settings,
          chat: {
            ...(state.settings.chat || {}),
            dialogModuleId: nextModuleId
          }
        }
      });
      broadcastState();
    }
    createChatWindow(mode, nextModuleId);
    return true;
  });

  ipcMain.handle("assets:import-pet", async (_event, petId) => {
    const result = await dialog.showOpenDialog(controlWindow, {
      title: "导入桌宠图片素材",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "图片素材",
          extensions: ["png", "webp", "gif", "jpg", "jpeg", "bmp", "svg"]
        }
      ]
    });
    if (result.canceled) return { canceled: true };

    const assets = result.filePaths.map((filePath) =>
      copyIntoAssets(filePath, path.join("pets", petId))
    );
    const state = store.mutate((draft) => {
      const pet = draft.pets.find((item) => item.id === petId);
      if (!pet) throw new Error("没有找到要导入素材的桌宠。");
      pet.assets = [...(pet.assets || []), ...assets];
      if (!pet.avatarUrl && assets[0]) pet.avatarUrl = assets[0].url;
      pet.updatedAt = new Date().toISOString();
      appendActivity(draft, "asset", `导入了 ${assets.length} 个桌宠素材。`);
    });
    broadcastState();
    return { canceled: false, assets, state };
  });

  ipcMain.handle("assets:import-spine", async (_event, petId) => {
    const skeletonResult = await dialog.showOpenDialog(controlWindow, {
      title: "选择 Spine 骨骼文件",
      properties: ["openFile"],
      filters: [{ name: "Spine 骨骼", extensions: ["skel"] }]
    });
    if (skeletonResult.canceled) return { canceled: true };

    const skeletonPath = skeletonResult.filePaths[0];
    const skeletonExtension = path.extname(skeletonPath);
    const skeletonBase = skeletonPath.slice(0, -skeletonExtension.length);
    const atlasPath = `${skeletonBase}.atlas`;
    if (!fs.existsSync(atlasPath)) {
      throw new Error("没有找到与 .skel 同名的 .atlas 文件。");
    }

    const atlasText = fs.readFileSync(atlasPath, "utf8");
    const atlasPageName = atlasText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().endsWith(".png"));
    if (!atlasPageName) {
      throw new Error("图集文件里没有找到纹理页名称。");
    }

    let texturePath = path.join(path.dirname(skeletonPath), atlasPageName);
    if (!fs.existsSync(texturePath)) {
      const textureResult = await dialog.showOpenDialog(controlWindow, {
        title: `请选择图集纹理页 ${atlasPageName}`,
        properties: ["openFile"],
        filters: [{ name: "图集纹理", extensions: ["png", "webp", "jpg", "jpeg"] }]
      });
      if (textureResult.canceled) return { canceled: true };
      texturePath = textureResult.filePaths[0];
    }

    const folderName = `${safeFileName(path.basename(skeletonBase))}-${Date.now()}`;
    const targetDirectory = path.join(store.assetsPath, "spine", folderName);
    fs.mkdirSync(targetDirectory, { recursive: true });

    const skeletonName = path.basename(skeletonPath);
    const atlasName = path.basename(atlasPath);
    const textureName = atlasPageName;
    fs.copyFileSync(skeletonPath, path.join(targetDirectory, skeletonName));
    fs.copyFileSync(atlasPath, path.join(targetDirectory, atlasName));
    fs.copyFileSync(texturePath, path.join(targetDirectory, textureName));

    const relativeRoot = path.relative(store.assetsPath, targetDirectory);
    const spine = {
      skelUrl: assetUrl(path.join(relativeRoot, skeletonName)),
      atlasUrl: assetUrl(path.join(relativeRoot, atlasName)),
      textureUrl: assetUrl(path.join(relativeRoot, textureName)),
      folder: folderName,
      animations: []
    };

    const state = store.mutate((draft) => {
      const pet = draft.pets.find((item) => item.id === petId);
      if (!pet) throw new Error("没有找到要导入 Spine 的桌宠。");
      pet.spine = spine;
      pet.updatedAt = new Date().toISOString();
      appendActivity(draft, "asset", `导入了 Spine 角色：${skeletonName}`);
    });
    broadcastState();
    return { canceled: false, spine, state };
  });

  ipcMain.handle("spine:select-part", async (_event, kind, draftId) => {
    const filters = {
      skeleton: [{ name: "Spine 骨骼", extensions: ["skel"] }],
      atlas: [{ name: "Spine 图集", extensions: ["atlas"] }],
      texture: [{ name: "纹理页", extensions: ["png", "webp", "jpg", "jpeg"] }]
    };
    const titles = {
      skeleton: "选择 .skel 骨骼文件",
      atlas: "选择 .atlas 图集文件",
      texture: "选择纹理页 PNG"
    };
    if (!filters[kind]) throw new Error("不支持的 Spine 素材类型。");

    const result = await dialog.showOpenDialog(controlWindow, {
      title: titles[kind],
      properties: ["openFile"],
      filters: filters[kind]
    });
    if (result.canceled) return { canceled: true };

    const asset = copyIntoAssets(
      result.filePaths[0],
      path.join("spine-drafts", safeFileName(draftId))
    );
    return {
      canceled: false,
      part: {
        ...asset,
        kind
      }
    };
  });

  ipcMain.handle(
    "spine:create-from-parts",
    async (_event, draftId, parts, requestedName) => {
      if (
        !parts?.skeleton ||
        !parts?.atlas ||
        !parts?.texture ||
        !draftId
      ) {
        return { ok: false, error: "三份 Spine 文件还没有全部导入。" };
      }

      const resolveStagedPath = (part) => {
        const target = path.resolve(store.assetsPath, part.relativePath);
        const relation = path.relative(store.assetsPath, target);
        if (relation.startsWith("..") || path.isAbsolute(relation)) {
          throw new Error("素材路径无效。");
        }
        return target;
      };

      const skeletonSource = resolveStagedPath(parts.skeleton);
      const atlasSource = resolveStagedPath(parts.atlas);
      const textureSource = resolveStagedPath(parts.texture);
      if (
        !fs.existsSync(skeletonSource) ||
        !fs.existsSync(atlasSource) ||
        !fs.existsSync(textureSource)
      ) {
        return { ok: false, error: "暂存的 Spine 文件已经不存在，请重新导入。" };
      }

      const skeletonHeader = fs
        .readFileSync(skeletonSource)
        .subarray(0, 160)
        .toString("latin1");
      const version = skeletonHeader.match(/(\d+\.\d+\.\d+)/)?.[1] || "";
      if (!version.startsWith("3.8.")) {
        return {
          ok: false,
          error: `当前只支持 Spine 3.8 骨骼，检测到版本 ${version || "未知"}。`
        };
      }

      const atlasText = fs.readFileSync(atlasSource, "utf8");
      const expectedSize = atlasText.match(
        /^size:\s*(\d+)\s*,\s*(\d+)\s*$/m
      );
      const texturePageName = atlasText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.toLowerCase().endsWith(".png"));
      if (!texturePageName) {
        return { ok: false, error: "图集文件中没有找到纹理页名称。" };
      }
      let textureResize = null;
      if (expectedSize) {
        const imageSize = nativeImage.createFromPath(textureSource).getSize();
        const expectedWidth = Number(expectedSize[1]);
        const expectedHeight = Number(expectedSize[2]);
        if (
          imageSize.width !== expectedWidth ||
          imageSize.height !== expectedHeight
        ) {
          textureResize = {
            width: expectedWidth,
            height: expectedHeight
          };
        }
      }

      const baseName =
        safeFileName(path.basename(parts.skeleton.name, path.extname(parts.skeleton.name))) ||
        "spine-character";
      const folderName = `${baseName}-${Date.now()}`;
      const targetDirectory = path.join(store.assetsPath, "spine", folderName);
      fs.mkdirSync(targetDirectory, { recursive: true });

      const skeletonName = `${baseName}.skel`;
      const atlasName = `${baseName}.atlas`;
      fs.copyFileSync(skeletonSource, path.join(targetDirectory, skeletonName));
      fs.copyFileSync(atlasSource, path.join(targetDirectory, atlasName));
      if (textureResize || expectedSize) {
        const width = textureResize
          ? textureResize.width
          : Number(expectedSize[1]);
        const height = textureResize
          ? textureResize.height
          : Number(expectedSize[2]);
        await sharp(textureSource)
          .resize(width, height, {
            fit: "fill",
            kernel: "lanczos3"
          })
          .sharpen({ sigma: 0.8 })
          .png()
          .toFile(path.join(targetDirectory, texturePageName));
      } else {
        fs.copyFileSync(
          textureSource,
          path.join(targetDirectory, texturePageName)
        );
      }

      const relativeRoot = path.relative(store.assetsPath, targetDirectory);
      const spine = {
        skelUrl: assetUrl(path.join(relativeRoot, skeletonName)),
        atlasUrl: assetUrl(path.join(relativeRoot, atlasName)),
        textureUrl: assetUrl(path.join(relativeRoot, texturePageName)),
        folder: folderName,
        animations: []
      };
      const now = new Date().toISOString();
      const petId = id("pet");
      const petName = String(requestedName || baseName).trim() || "新桌宠";
      const pet = {
        id: petId,
        name: petName,
        title: "Spine 3.8 角色",
        description: "由 .skel、.atlas 和纹理页创建的新桌宠。",
        accent: "#2f7df6",
        secondary: "#f59f38",
        scale: 1,
        greeting: "我在这里。",
        assets: [],
        animationMap: {
          idle: "",
          walk: "",
          fall: "",
          land: "",
          drag: "",
          sleep: ""
        },
        spine,
        boneMap: {},
        actionBindings: {},
        renderConfig: {
          displayWidth: 260,
          displayHeight: 320,
          visualWidth: 104,
          visualHeight: 134,
          hitboxWidth: 104,
          hitboxHeight: 134,
          hitboxOffsetX: 0,
          hitboxOffsetY: 0,
          offsetX: 0,
          offsetY: 0
        },
        createdAt: now,
        updatedAt: now
      };

      const state = store.mutate((draft) => {
        draft.pets.push(pet);
        draft.activePetId = petId;
        draft.activeView = "workshop";
        appendActivity(draft, "asset", `创建了新桌宠：${petName}`);
      });
      broadcastState();
      return { ok: true, petId, state };
    }
  );

  ipcMain.handle("assets:import-voice-sample", async () => {
    const result = await dialog.showOpenDialog(controlWindow, {
      title: "导入声音样本",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "音频素材",
          extensions: ["wav", "mp3", "m4a", "flac", "ogg", "webm"]
        }
      ]
    });
    if (result.canceled) return { canceled: true };

    const samples = result.filePaths.map((filePath) =>
      copyIntoAssets(filePath, "voice-samples")
    );
    const state = store.mutate((draft) => {
      draft.voiceProfiles.unshift({
        id: id("voice"),
        name: `声音样本 ${draft.voiceProfiles.length + 1}`,
        samples,
        voiceId: "",
        engineType: "api",
        baseUrl: draft.settings.services.tts.baseUrl || "",
        model: draft.settings.services.tts.model || "",
        apiKey: draft.settings.services.tts.apiKey || "",
        localModelPath: "",
        status: "draft",
        createdAt: new Date().toISOString()
      });
      appendActivity(draft, "voice", `导入了 ${samples.length} 个声音样本。`);
    });
    broadcastState();
    return { canceled: false, samples, state };
  });

  ipcMain.handle("voice:stage-samples", async (_event, draftId) => {
    const result = await dialog.showOpenDialog(controlWindow, {
      title: "选择声音样本",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "音频素材",
          extensions: ["wav", "mp3", "m4a", "flac", "ogg", "webm"]
        }
      ]
    });
    if (result.canceled) return { canceled: true };
    return {
      canceled: false,
      samples: result.filePaths.map((filePath) =>
        copyIntoAssets(
          filePath,
          path.join("voice-staging", safeFileName(draftId || "draft"))
        )
      )
    };
  });

  ipcMain.handle("voice:remove-staged-sample", (_event, relativePath) => {
    const target = path.resolve(store.assetsPath, String(relativePath || ""));
    const relation = path.relative(store.assetsPath, target);
    if (
      relation.startsWith("..") ||
      path.isAbsolute(relation) ||
      !relation.startsWith(`voice-staging${path.sep}`)
    ) {
      throw new Error("声音样本路径无效。");
    }
    fs.rmSync(target, { force: true });
    return true;
  });

  ipcMain.handle(
    "voice-training:transcribe-sample",
    async (_event, relativePath) => {
      const target = path.resolve(store.assetsPath, String(relativePath || ""));
      const relation = path.relative(store.assetsPath, target);
      if (relation.startsWith("..") || path.isAbsolute(relation)) {
        return { ok: false, error: "训练音频路径无效。" };
      }
      if (!fs.existsSync(target)) {
        return { ok: false, error: "训练音频文件不存在。" };
      }
      const response = await transcribeWithProviders(store.get(), target);
      return {
        ...response,
        durationSeconds: getAudioDuration(target)
      };
    }
  );

  ipcMain.handle("voice-training:runtime", () => getVoiceTrainingRuntime());

  ipcMain.handle(
    "voice-training:prepare",
    (_event, profileId, clips) => {
      const runtime = getVoiceTrainingRuntime();
      if (!runtime.ready) {
        return { ok: false, error: runtime.message };
      }
      const validClips = (clips || []).filter(
        (clip) => clip.relativePath && clip.transcript?.trim()
      );
      const totalSeconds = validClips.reduce(
        (total, clip) => total + Number(clip.durationSeconds || 0),
        0
      );
      if (validClips.length < 3 && totalSeconds < 60) {
        return {
          ok: false,
          error: "至少需要 3 段音频，或总时长超过 1 分钟。"
        };
      }
      const folder = path.join(
        store.userDataPath,
        "voice-training",
        safeFileName(profileId || "voice")
      );
      fs.mkdirSync(folder, { recursive: true });
      const datasetPath = path.join(folder, "dataset.jsonl");
      const content = validClips
        .map((clip) =>
          JSON.stringify({
            audio: path.join(store.assetsPath, clip.relativePath),
            text: clip.transcript.trim(),
            duration: Number(clip.durationSeconds || 0)
          })
        )
        .join("\n");
      fs.writeFileSync(datasetPath, content, "utf8");
      return { ok: true, datasetPath };
    }
  );

  ipcMain.handle("models:choose", async (_event, kind, mode) => {
    const directoryMode =
      kind === "tts" || kind === "asr" || mode === "folder";
    const result = await dialog.showOpenDialog(controlWindow, {
      title:
        mode === "folder"
          ? "选择完整模型文件夹"
          : kind === "tts"
          ? "选择 GPT-SoVITS 声线模型文件夹"
          : kind === "asr"
            ? "选择 Whisper 模型文件夹"
            : "选择本地对话模型文件",
      properties: directoryMode ? ["openDirectory"] : ["openFile"],
      filters:
        kind === "llm"
          ? [
              {
                name: "本地对话模型",
                extensions: ["safetensors", "gguf"]
              }
            ]
          : undefined
    });
    if (result.canceled) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  ipcMain.handle("modules:import-folder", async () => {
    const result = await dialog.showOpenDialog(controlWindow, {
      title: "选择模组文件夹",
      properties: ["openDirectory"]
    });
    if (result.canceled) return { canceled: true };
    try {
      const source = result.filePaths[0];
      const { record } = readExternalModuleManifest(source);
      const root = externalModulesRoot();
      fs.mkdirSync(root, { recursive: true });
      const target = path.join(root, safeFileName(record.id));
      const relation = path.relative(root, target);
      if (relation.startsWith("..") || path.isAbsolute(relation)) {
        throw new Error("模组目标路径无效。");
      }
      fs.cpSync(source, target, { recursive: true, force: true });
      const installed = readExternalModuleManifest(target).record;
      const state = store.mutate((draft) => {
        const existing = draft.customModules.find(
          (item) => item.id === installed.id
        );
        if (existing) {
          Object.assign(existing, installed, {
            createdAt: existing.createdAt
          });
        } else {
          draft.customModules.push(installed);
        }
      });
      broadcastState();
      return { canceled: false, module: installed, state };
    } catch (error) {
      return {
        canceled: false,
        error: error.message || "模组文件夹导入失败。"
      };
    }
  });

  ipcMain.handle("modules:open-external", (_event, moduleId) => {
    openExternalModuleWindow(moduleId);
    return true;
  });
  ipcMain.handle("modules:trigger", (_event, moduleId, petId, origin) =>
    triggerModuleAction(moduleId, petId, origin)
  );

  ipcMain.handle("modules:choose-image", async (_event, moduleId, slot) => {
    const result = await dialog.showOpenDialog(controlWindow, {
      title: "选择模组图片",
      properties: ["openFile"],
      filters: [
        {
          name: "图片",
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"]
        }
      ]
    });
    if (result.canceled) return { canceled: true };
    try {
      const asset = copyIntoAssets(
        result.filePaths[0],
        path.join("module-assets", safeFileName(moduleId))
      );
      return { canceled: false, url: asset.url, slot };
    } catch (error) {
      return {
        canceled: false,
        error: error.message || "图片导入失败。"
      };
    }
  });

  ipcMain.handle("food:consume", async (_event, foodPath, options = {}) => {
    const target = path.resolve(String(foodPath || ""));
    const desktopRoot = path.resolve(app.getPath("desktop"));
    const relation = path.relative(desktopRoot, target);
    const allowOutsideDesktop = options?.allowOutsideDesktop === true;
    if (
      (!allowOutsideDesktop &&
        (relation.startsWith("..") || path.isAbsolute(relation))) ||
      path.extname(target).toLowerCase() !== ".food"
    ) {
      return { ok: false, error: "食物文件路径无效。" };
    }
    if (!fs.existsSync(target)) {
      return { ok: false, error: "这个食物文件已经不存在。" };
    }
    try {
      await shell.trashItem(target);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || "无法吃掉这个食物文件。"
      };
    }
  });

  ipcMain.handle("models:inspect", (_event, kind, sourcePath) => {
    try {
      const now = new Date().toISOString();
      const inspection = inspectLocalModel(kind, sourcePath);
      return {
        ok: true,
        model: {
          id: id("model"),
          ...inspection,
          createdAt: now,
          updatedAt: now
        }
      };
    } catch (error) {
      return { ok: false, error: error.message || "无法读取模型文件。" };
    }
  });

  ipcMain.handle("models:add", (_event, model) => {
    const state = store.mutate((draft) => {
      const existingIndex = draft.localModels.findIndex(
        (item) =>
          item.kind === model.kind &&
          path.resolve(item.sourcePath) === path.resolve(model.sourcePath)
      );
      if (existingIndex >= 0) {
        draft.localModels[existingIndex] = {
          ...draft.localModels[existingIndex],
          ...model,
          updatedAt: new Date().toISOString()
        };
      } else {
        draft.localModels.unshift(model);
      }
      appendActivity(draft, "model", `已导入本地模型：${model.name}`);
    });
    broadcastState();
    return state;
  });

  ipcMain.handle("models:remove", (_event, modelId) => {
    const state = store.mutate((draft) => {
      draft.localModels = draft.localModels.filter(
        (model) => model.id !== modelId
      );
    });
    broadcastState();
    return state;
  });

  ipcMain.handle("services:test", async (_event, service) => {
    const config = store.get().settings.services?.[service];
    if (
      service === "tts" &&
      (config?.mode || "local") === "local" &&
      isBundledVoiceService({
        baseUrl: config?.baseUrl || VOICE_SERVICE_URL
      })
    ) {
      const serviceState = await ensureVoiceService();
      if (!serviceState.ok) return serviceState;
    }
    const result = await ai.testLocalService(config, service);
    if (result.ok && (config?.mode || "local") === "api") {
      registerApiServiceModel(service, config);
      broadcastState();
    }
    return result;
  });
  ipcMain.handle("ai:chat", async (_event, messages, aiModuleId) => {
    const state = store.get();
    const text = [...messages]
      .reverse()
      .find((message) => message.role === "user")?.content;
    return replyWithProviders(state, String(text || ""), { aiModuleId });
  });
  ipcMain.handle("ai:chat-stream", async (event, messages, aiModuleId) => {
    const state = store.get();
    const text = [...messages]
      .reverse()
      .find((message) => message.role === "user")?.content;
    const userText = String(text || "");
    const aiModule = resolveAiModule(state, { aiModuleId });
    const replyState = aiModule
      ? {
          ...state,
          character: aiModule.character || state.character,
          documents: aiModule.documents || state.documents,
          memories: aiModule.memories || state.memories
        }
      : state;
    const emitDelta = (delta) => {
      if (delta && !event.sender.isDestroyed()) {
        event.sender.send("ai:chat-stream", { delta });
      }
    };
    if ((state.settings?.services?.llm?.mode || "local") === "api") {
      return ai.chatLocalStream(
        replyState,
        [{ role: "user", content: userText }],
        emitDelta
      );
    }
    const result = await replyWithProviders(state, userText, { aiModuleId });
    emitDelta(result.text);
    return result;
  });
  ipcMain.handle("voice:speak", async (_event, text, voiceId, voiceConfig) => {
    const state = store.get();
    return synthesizeWithSelectedVoice(state, text, {
      ...(voiceConfig || {}),
      voiceId
    });
  });

  ipcMain.handle("voice-agent:set-model", (_event, kind, modelId) => {
    const key =
      kind === "llm"
        ? "llmModelId"
        : kind === "asr"
          ? "asrModelId"
          : "ttsModelId";
    const selectedModel = store
      .get()
      .localModels.find((model) => model.id === modelId);
    const state = store.mutate((draft) => {
      draft.localInference = {
        ...draft.localInference,
        [key]: String(modelId || "")
      };
      if (selectedModel?.format === "api" && selectedModel.apiConfig) {
        draft.settings.services[kind] = {
          ...selectedModel.apiConfig,
          mode: "api"
        };
      }
    });
    broadcastState();
    if (kind === "llm" || kind === "asr") {
      localInference.preload(state, kind)?.catch(() => {
        // The normal request path will show a detailed error if loading fails.
      });
    }
    return state;
  });
  ipcMain.handle("voice-agent:transcribe", (_event, audioBytes) =>
    voiceAgent.transcribe(audioBytes)
  );
  ipcMain.handle("voice-agent:reply", (_event, text, options) =>
    voiceAgent.reply(String(text || ""), options || {})
  );
  ipcMain.handle("voice-agent:speak", (_event, text, options) =>
    voiceAgent.speak(String(text || ""), options || {})
  );
  ipcMain.handle("voice-agent:turn", (_event, audioBytes, options) =>
    voiceAgent.onUserAudio(audioBytes, options || {})
  );

  ipcMain.handle("training:start", (_event, profileId) => {
    const state = store.get();
    const profile =
      state.trainingProfiles.find((item) => item.id === profileId) ||
      state.trainingProfiles[0];
    if (!profile) return { ok: false, error: "没有可训练的 AI 模块。" };

    const config = profile.trainingConfig || {
      baseModel: "Qwen/Qwen2.5-7B-Instruct",
      epochs: 3,
      learningRate: 0.0002,
      batchSize: 1,
      maxLength: 1024
    };
    const moduleId = profile.id;
    const moduleDir = path.join(store.userDataPath, "ai-modules", moduleId);
    const datasetPath = path.join(moduleDir, "dataset.jsonl");
    const configPath = path.join(moduleDir, "training.json");
    const logPath = path.join(moduleDir, "train.log");
    const outputPath = path.join(moduleDir, "lora-output");
    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(datasetPath, buildTrainingDataset(profile), "utf8");
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          baseModel: config.baseModel,
          datasetPath,
          outputPath,
          epochs: config.epochs,
          learningRate: config.learningRate,
          batchSize: config.batchSize,
          maxLength: config.maxLength
        },
        null,
        2
      ),
      "utf8"
    );

    const now = new Date().toISOString();
    const nextModule = {
      id: moduleId,
      name: profile.name,
      description: profile.character?.personality || "本地角色模块",
      status: "training",
      sourceProfileId: profile.id,
      skillPrompt: ai.buildProfileSkillPrompt(profile),
      training: {
        baseModel: config.baseModel,
        datasetPath,
        configPath,
        logPath,
        outputPath,
        progress: 0,
        startedAt: now
      },
      createdAt: now,
      updatedAt: now
    };
    store.mutate((draft) => {
      const existing = draft.aiModules.find((item) => item.id === moduleId);
      if (existing) {
        Object.assign(existing, nextModule, {
          createdAt: existing.createdAt || now
        });
      } else {
        draft.aiModules.unshift(nextModule);
      }
      const trainingProfile = draft.trainingProfiles.find(
        (item) => item.id === profile.id
      );
      if (trainingProfile) {
        trainingProfile.status = "training";
        trainingProfile.updatedAt = now;
      }
    });
    broadcastState();

    const python = process.platform === "win32" ? "python" : "python3";
    const scriptPath = path.join(__dirname, "..", "scripts", "train_lora.py");
    const child = spawn(python, [scriptPath, "--config", configPath], {
      cwd: path.join(__dirname, ".."),
      windowsHide: true
    });
    const logStream = fs.createWriteStream(logPath, { flags: "a" });
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);
    child.on("error", (error) => {
      logStream.write(`\n[runner] ${error.message}\n`);
      store.mutate((draft) => {
        const module = draft.aiModules.find((item) => item.id === moduleId);
        if (module) {
          module.status = "draft";
          module.training = {
            ...(module.training || {}),
            error: error.message
          };
          module.updatedAt = new Date().toISOString();
        }
        const trainingProfile = draft.trainingProfiles.find(
          (item) => item.id === profile.id
        );
        if (trainingProfile) trainingProfile.status = "draft";
      });
      broadcastState();
    });
    child.on("close", (code) => {
      store.mutate((draft) => {
        const module = draft.aiModules.find((item) => item.id === moduleId);
        if (module) {
          module.status = code === 0 ? "ready" : "draft";
          module.training = {
            ...(module.training || {}),
            progress: code === 0 ? 100 : Number(module.training?.progress || 0),
            finishedAt: new Date().toISOString(),
            error: code === 0 ? undefined : `训练进程退出码 ${code}`
          };
          module.updatedAt = new Date().toISOString();
        }
        const trainingProfile = draft.trainingProfiles.find(
          (item) => item.id === profile.id
        );
        if (trainingProfile) {
          trainingProfile.status = code === 0 ? "ready" : "draft";
        }
      });
      broadcastState();
    });

    return { ok: true, moduleId, logPath, outputPath };
  });

  ipcMain.handle("training:open-folder", (_event, moduleId) => {
    const folder = path.join(store.userDataPath, "ai-modules", moduleId);
    fs.mkdirSync(folder, { recursive: true });
    shell.openPath(folder);
    return true;
  });
  ipcMain.handle("voice:transcribe-file", async () => {
    const result = await dialog.showOpenDialog(controlWindow, {
      title: "选择要识别的音频",
      properties: ["openFile"],
      filters: [
        {
          name: "音频文件",
          extensions: ["wav", "mp3", "m4a", "flac", "ogg", "webm"]
        }
      ]
    });
    if (result.canceled) return { canceled: true };
    const response = await transcribeWithProviders(
      store.get(),
      result.filePaths[0]
    );
    return { canceled: false, ...response };
  });

  ipcMain.handle("data:get-paths", () => ({
    dataPath: store.userDataPath,
    statePath: store.filePath,
    assetsPath: store.assetsPath,
    petStorePath: store.petStorePath
  }));
  ipcMain.handle("data:sync-pet-store", () => {
    const count = store.syncPetStore();
    return { ok: true, count };
  });
  ipcMain.handle("data:open-pet-store", async () => {
    await shell.openPath(store.petStorePath);
    return true;
  });
  ipcMain.handle("data:open-folder", async () => {
    await shell.openPath(store.userDataPath);
    return true;
  });
  ipcMain.handle("data:export-backup", async () => {
    const result = await dialog.showOpenDialog(controlWindow, {
      title: "选择备份文件夹",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled) return { canceled: true };
    const folder = path.join(
      result.filePaths[0],
      `desk-pet-backup-${new Date().toISOString().slice(0, 10)}`
    );
    fs.mkdirSync(folder, { recursive: true });
    fs.copyFileSync(store.filePath, path.join(folder, "desk-pet-state.json"));
    if (fs.existsSync(store.assetsPath)) {
      fs.cpSync(store.assetsPath, path.join(folder, "assets"), {
        recursive: true,
        force: true
      });
    }
    await shell.openPath(folder);
    return { canceled: false, folder };
  });
  ipcMain.handle("data:import-backup", async () => {
    const result = await dialog.showOpenDialog(controlWindow, {
      title: "选择备份数据文件",
      properties: ["openFile"],
      filters: [{ name: "桌宠备份", extensions: ["json"] }]
    });
    if (result.canceled) return { canceled: true };
    const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], "utf8"));
    const state = store.replace(parsed);
    broadcastState();
    applyOverlaySettings();
    return { canceled: false, state };
  });
  ipcMain.handle("app:quit", () => {
    isQuitting = true;
    app.quit();
    return true;
  });
}

async function registerAssetProtocol() {
  protocol.handle("deskpet", async (request) => {
    try {
      const url = new URL(request.url);
      const relative = decodeURIComponent(url.pathname).replace(/^[/\\]+/, "");
      const root = path.resolve(store.assetsPath);
      const target = path.resolve(root, relative);
      const relation = path.relative(root, target);
      if (relation.startsWith("..") || path.isAbsolute(relation)) {
        return new Response("Forbidden", { status: 403 });
      }
      const extension = path.extname(target).toLowerCase();
      const mimeTypes = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".svg": "image/svg+xml",
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".flac": "audio/flac",
        ".ogg": "audio/ogg",
        ".webm": "audio/webm"
      };
      return new Response(fs.readFileSync(target), {
        headers: {
          "Content-Type": mimeTypes[extension] || "application/octet-stream",
          "Cache-Control": "no-cache"
        }
      });
    } catch (error) {
      return new Response(error.message || "Not found", { status: 404 });
    }
  });
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    createControlWindow();
  });

  app.whenReady().then(async () => {
    if (
      app.isPackaged &&
      !process.env.PORTABLE_EXECUTABLE_DIR &&
      !readDataPathConfig(dataPathConfigFile())
    ) {
      const result = await dialog.showOpenDialog({
        title: "选择桌宠数据保存位置",
        defaultPath: process.env.USERPROFILE || app.getPath("documents"),
        buttonLabel: "使用此文件夹",
        properties: ["openDirectory", "createDirectory"]
      });
      if (!result.canceled && result.filePaths[0]) {
        portableDataPath = result.filePaths[0];
        writeDataPathConfig(portableDataPath);
        app.setPath("userData", portableDataPath);
      }
    }
    copySeedUserData(portableDataPath);
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        callback(permission === "media");
      }
    );
    const legacyDataPath = path.join(
      app.getPath("appData"),
      "desk-companion-studio"
    );
    fs.mkdirSync(portableDataPath, { recursive: true });
    if (
      !fs.existsSync(path.join(portableDataPath, "desk-pet-state.json")) &&
      fs.existsSync(legacyDataPath)
    ) {
      for (const entry of ["desk-pet-state.json", "pet-store", "assets"]) {
        const source = path.join(legacyDataPath, entry);
        if (!fs.existsSync(source)) continue;
        fs.cpSync(source, path.join(portableDataPath, entry), {
          recursive: true,
          force: false
        });
      }
    }

    store = new Store(app.getPath("userData"));
    store.load();
    if (process.env.ARKPET_PHYSICS_DEBUG === "1") {
      store.mutate((draft) => {
        draft.summonedPetIds = [draft.activePetId];
      });
    }
    loadExternalModules();
    const initialState = store.get();
    if (initialState.voiceProfiles?.length) {
      ensureVoiceService().catch(() => {
        // Voice synthesis will start it again on demand if preloading fails.
      });
    }
    for (const kind of ["llm", "asr"]) {
      localInference.preload(initialState, kind)?.catch(() => {
        // The normal chat or transcription action will surface load errors.
      });
    }
    await registerAssetProtocol();
    registerIpc();
    createControlWindow();
    createOverlayWindow();

    screen.on("display-metrics-changed", () => {
      positionOverlay();
    });
    screen.on("display-added", positionOverlay);
    screen.on("display-removed", positionOverlay);
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  stopOwnedVoiceService();
  localInference.stopAll();
});

app.on("window-all-closed", () => {
  if (isQuitting) app.quit();
});

app.on("activate", () => {
  createControlWindow();
});
