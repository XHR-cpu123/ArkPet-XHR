const { contextBridge, ipcRenderer, webUtils } = require("electron");

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const foodDropCallbacks = new Set();

function emitFoodDrop(payload) {
  for (const callback of foodDropCallbacks) {
    try {
      callback(payload);
    } catch {
      // One renderer callback must not block the remaining listeners.
    }
  }
}

function dropTargetElement(target) {
  return target instanceof Element
    ? target.closest(".multi-pet-hitbox[data-pet-id]")
    : null;
}

window.addEventListener("dragover", (event) => {
  const target = dropTargetElement(event.target);
  if (!target) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
});

window.addEventListener("drop", (event) => {
  const target = dropTargetElement(event.target);
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  const petId = target.getAttribute("data-pet-id") || "";
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const filePath = webUtils.getPathForFile(file);
  if (!filePath.toLowerCase().endsWith(".food")) {
    emitFoodDrop({
      ok: false,
      petId,
      fileName: file.name,
      error: "只能吃 .food 文件。"
    });
    return;
  }
  void ipcRenderer
    .invoke("food:consume", filePath, { allowOutsideDesktop: true })
    .then((result) =>
      emitFoodDrop({
        ...result,
        petId,
        fileName: file.name,
        filePath
      })
    )
    .catch((error) =>
      emitFoodDrop({
        ok: false,
        petId,
        fileName: file.name,
        filePath,
        error: error?.message || "无法吃掉这个文件。"
      })
    );
});

contextBridge.exposeInMainWorld("deskPet", {
  physicsDebug: process.env.ARKPET_PHYSICS_DEBUG === "1",
  debugPhysicsLog: (message) =>
    ipcRenderer.send("debug:physics-log", message),
  getState: () => ipcRenderer.invoke("store:get"),
  updateState: (patch) => ipcRenderer.invoke("store:update", patch),
  updateStateSync: (patch) => ipcRenderer.sendSync("store:update-sync", patch),
  replaceState: (state) => ipcRenderer.invoke("store:replace", state),

  getDisplayMetrics: () => ipcRenderer.invoke("display:get-metrics"),
  getDesktopIcons: () => ipcRenderer.invoke("desktop:get-icons"),
  getControlBounds: () => ipcRenderer.invoke("window:get-control-bounds"),
  showControl: () => ipcRenderer.invoke("window:show-control"),
  hideControl: () => ipcRenderer.invoke("window:hide-control"),
  quit: () => ipcRenderer.invoke("app:quit"),

  overlayCommand: (command) => ipcRenderer.invoke("overlay:command", command),
  hideOverlay: () => ipcRenderer.invoke("overlay:hide"),
  setOverlayMouseIgnore: (ignore) => ipcRenderer.send("overlay:ignore-mouse", ignore),
  setOverlayFocusable: (focusable) =>
    ipcRenderer.send("overlay:set-focusable", focusable),

  openAuxiliary: (auxiliaryId) => ipcRenderer.invoke("auxiliary:open", auxiliaryId),
  openChat: (mode, dialogModuleId) =>
    ipcRenderer.invoke("chat:open", mode, dialogModuleId),
  importExternalModule: () =>
    ipcRenderer.invoke("modules:import-folder"),
  openExternalModule: (moduleId) =>
    ipcRenderer.invoke("modules:open-external", moduleId),
  triggerExternalModule: (moduleId, petId, origin) =>
    ipcRenderer.invoke("modules:trigger", moduleId, petId, origin),
  chooseModuleImage: (moduleId, slot) =>
    ipcRenderer.invoke("modules:choose-image", moduleId, slot),
  consumeFood: (foodPath, options) =>
    ipcRenderer.invoke("food:consume", foodPath, options),
  onFoodDrop: (callback) => {
    foodDropCallbacks.add(callback);
    return () => foodDropCallbacks.delete(callback);
  },
  importPetAssets: (petId) => ipcRenderer.invoke("assets:import-pet", petId),
  importSpine: (petId) => ipcRenderer.invoke("assets:import-spine", petId),
  selectSpinePart: (kind, draftId) =>
    ipcRenderer.invoke("spine:select-part", kind, draftId),
  createPetFromSpine: (draftId, parts, name) =>
    ipcRenderer.invoke("spine:create-from-parts", draftId, parts, name),
  importVoiceSample: () => ipcRenderer.invoke("assets:import-voice-sample"),
  stageVoiceSamples: (draftId) =>
    ipcRenderer.invoke("voice:stage-samples", draftId),
  removeStagedVoiceSample: (relativePath) =>
    ipcRenderer.invoke("voice:remove-staged-sample", relativePath),
  transcribeVoiceTrainingSample: (relativePath) =>
    ipcRenderer.invoke("voice-training:transcribe-sample", relativePath),
  getVoiceTrainingRuntime: () =>
    ipcRenderer.invoke("voice-training:runtime"),
  prepareVoiceTraining: (profileId, clips) =>
    ipcRenderer.invoke("voice-training:prepare", profileId, clips),
  importTrainingAudio: () => ipcRenderer.invoke("voice:transcribe-file"),

  chooseLocalModel: (kind, mode) =>
    ipcRenderer.invoke("models:choose", kind, mode),
  inspectLocalModel: (kind, sourcePath) =>
    ipcRenderer.invoke("models:inspect", kind, sourcePath),
  addLocalModel: (model) => ipcRenderer.invoke("models:add", model),
  removeLocalModel: (modelId) =>
    ipcRenderer.invoke("models:remove", modelId),

  testService: (service) => ipcRenderer.invoke("services:test", service),
  chat: (messages, aiModuleId) =>
    ipcRenderer.invoke("ai:chat", messages, aiModuleId),
  chatStream: (messages, aiModuleId) =>
    ipcRenderer.invoke("ai:chat-stream", messages, aiModuleId),
  onChatStream: (callback) =>
    subscribe("ai:chat-stream", callback),
  speak: (text, voiceId, config) =>
    ipcRenderer.invoke("voice:speak", text, voiceId, config),
  voiceAgent: {
    setModel: (kind, modelId) =>
      ipcRenderer.invoke("voice-agent:set-model", kind, modelId),
    transcribe: (audioBytes) =>
      ipcRenderer.invoke("voice-agent:transcribe", audioBytes),
    reply: (text, options) =>
      ipcRenderer.invoke("voice-agent:reply", text, options),
    speak: (text, options) =>
      ipcRenderer.invoke("voice-agent:speak", text, options),
    turn: (audioBytes, options) =>
      ipcRenderer.invoke("voice-agent:turn", audioBytes, options)
  },
  startTraining: (profileId) => ipcRenderer.invoke("training:start", profileId),
  openTrainingFolder: (moduleId) =>
    ipcRenderer.invoke("training:open-folder", moduleId),

  getDataPaths: () => ipcRenderer.invoke("data:get-paths"),
  syncPetStore: () => ipcRenderer.invoke("data:sync-pet-store"),
  openPetStore: () => ipcRenderer.invoke("data:open-pet-store"),
  openDataFolder: () => ipcRenderer.invoke("data:open-folder"),
  exportBackup: () => ipcRenderer.invoke("data:export-backup"),
  importBackup: () => ipcRenderer.invoke("data:import-backup"),

  onStateChanged: (callback) => subscribe("store:changed", callback),
  onOverlayCommand: (callback) => subscribe("overlay:command", callback),
  onOverlayMode: (callback) => subscribe("overlay:mode", callback),
  onOverlaySettings: (callback) => subscribe("overlay:settings", callback),
  onClimbPlatformChanged: (callback) =>
    subscribe("overlay:climb-platform", callback),
  onDisplayChanged: (callback) => subscribe("display:changed", callback)
});
