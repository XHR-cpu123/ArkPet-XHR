import {
  ArchiveRestore,
  BellRing,
  FolderOpen,
  Gauge,
  HardDriveDownload,
  Palette,
  Plus,
  Power,
  Radio,
  Save,
  Trash2,
  Volume2
} from "lucide-react";
import { useEffect, useState } from "react";
import { makeId } from "../lib/id";
import { useAppState } from "../state";
import type {
  AppSettings,
  AuxiliaryWindowConfig,
  ServiceConfig,
  ThemeName
} from "../types";

type SettingsSection =
  | "overlay"
  | "theme"
  | "services"
  | "windows"
  | "data"
  | "app";

const themeOptions: Array<{
  id: ThemeName;
  name: string;
  description: string;
  colors: string[];
}> = [
  {
    id: "default",
    name: "默认工房",
    description: "当前版本的暖白与蓝色工作台。",
    colors: ["#f4f2ec", "#18243a", "#2f7df6", "#f59f38"]
  },
  {
    id: "violet",
    name: "紫苑",
    description: "取自紫红、樱粉与木槿色卡。",
    colors: ["#f8eef7", "#4b2850", "#a64a8d", "#d9699b"]
  },
  {
    id: "azure",
    name: "霜蓝",
    description: "取自月白、晴蓝与佛头青色卡。",
    colors: ["#eef4f9", "#12395f", "#3271ae", "#6e9bc5"]
  },
  {
    id: "jade",
    name: "青绿",
    description: "取自竹月、石绿与御台茶色卡。",
    colors: ["#eef4f2", "#1d3b3a", "#2f807d", "#83bfb8"]
  }
];

const sections: Array<{
  id: SettingsSection;
  label: string;
  description: string;
  icon: typeof Gauge;
}> = [
  { id: "overlay", label: "桌宠与物理", description: "重力、速度与显示", icon: Gauge },
  { id: "theme", label: "皮肤主题", description: "界面配色与皮肤", icon: Palette },
  { id: "windows", label: "辅助窗口", description: "窗口内容与尺寸", icon: BellRing },
  { id: "data", label: "数据安全", description: "备份与数据位置", icon: HardDriveDownload },
  { id: "app", label: "应用控制", description: "启动与退出", icon: Power }
];

export function SettingsView() {
  const { state, updateState } = useAppState();
  const [activeSection, setActiveSection] = useState<SettingsSection>("overlay");
  const [serviceResults, setServiceResults] = useState<Record<string, string>>({});
  const [paths, setPaths] = useState<{
    dataPath: string;
    statePath: string;
    assetsPath: string;
    petStorePath: string;
  } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    window.deskPet.getDataPaths().then(setPaths);
  }, []);

  if (!state) return null;
  const currentState = state;

  async function saveOverlay(patch: Partial<AppSettings["overlay"]>) {
    await updateState({
      settings: {
        ...currentState.settings,
        overlay: {
          ...currentState.settings.overlay,
          ...patch
        }
      }
    });
  }

  async function saveTheme(theme: ThemeName) {
    await updateState({
      settings: {
        ...currentState.settings,
        appearance: {
          ...currentState.settings.appearance,
          theme
        }
      }
    });
  }

  async function saveService(
    service: "llm" | "asr" | "tts",
    patch: Partial<ServiceConfig>
  ) {
    await updateState({
      settings: {
        ...currentState.settings,
        services: {
          ...currentState.settings.services,
          [service]: {
            ...currentState.settings.services[service],
            ...patch
          }
        }
      }
    });
  }

  async function testService(service: "llm" | "asr" | "tts") {
    setServiceResults((current) => ({ ...current, [service]: "正在连接..." }));
    const result = await window.deskPet.testService(service);
    setServiceResults((current) => ({
      ...current,
      [service]: result.ok ? "连接正常" : result.error || "无法连接"
    }));
  }

  async function saveAuxiliary(
    auxiliaryId: string,
    patch: Partial<AuxiliaryWindowConfig>
  ) {
    await updateState({
      auxiliaryWindows: currentState.auxiliaryWindows.map((item) =>
        item.id === auxiliaryId ? { ...item, ...patch } : item
      )
    });
  }

  async function addAuxiliary() {
    const auxiliary: AuxiliaryWindowConfig = {
      id: makeId("aux"),
      name: "新辅助窗口",
      title: "临时落脚点",
      body: "这个窗口的内容可以在数据与设置中修改。",
      width: 440,
      height: 320,
      enabled: true
    };
    await updateState({
      auxiliaryWindows: [...currentState.auxiliaryWindows, auxiliary]
    });
  }

  async function exportBackup() {
    setBackupBusy(true);
    try {
      await window.deskPet.exportBackup();
    } finally {
      setBackupBusy(false);
    }
  }

  async function importBackup() {
    if (!window.confirm("导入备份会替换当前状态，确定继续吗？")) return;
    setBackupBusy(true);
    try {
      await window.deskPet.importBackup();
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <div className="settings-layout">
      <aside className="settings-nav">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              className={
                activeSection === section.id
                  ? "settings-nav-item settings-nav-item--active"
                  : "settings-nav-item"
              }
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
            >
              <Icon size={18} />
              <div>
                <strong>{section.label}</strong>
                <span>{section.description}</span>
              </div>
            </button>
          );
        })}
      </aside>

      <section className="settings-content">
        {activeSection === "overlay" && (
          <div className="settings-section">
            <div className="section-heading">
              <span className="section-kicker">桌宠与物理</span>
              <h2>调整桌面上的运动手感</h2>
              <p>修改后立即保存，并同步到透明桌宠层。</p>
            </div>
            <label className="toggle-row">
              <div>
                <strong>启动后显示桌宠</strong>
                <span>关闭后需要从顶栏手动释放</span>
              </div>
              <input
                type="checkbox"
                checked={state.settings.overlay.visibleOnStart}
                onChange={(event) => saveOverlay({ visibleOnStart: event.target.checked })}
              />
            </label>
            <label className="toggle-row">
              <div>
                <strong>始终置顶</strong>
                <span>让桌宠保持在普通窗口上方</span>
              </div>
              <input
                type="checkbox"
                checked={state.settings.overlay.alwaysOnTop}
                onChange={(event) => saveOverlay({ alwaysOnTop: event.target.checked })}
              />
            </label>
            <div className="settings-sliders">
              <label className="range-field">
                <span>重力</span>
                <input
                  type="range"
                  min="600"
                  max="3000"
                  step="50"
                  value={state.settings.overlay.gravity}
                  onChange={(event) => saveOverlay({ gravity: Number(event.target.value) })}
                />
                <strong>{state.settings.overlay.gravity}</strong>
              </label>
              <label className="range-field">
                <span>行走速度</span>
                <input
                  type="range"
                  min="30"
                  max="220"
                  step="2"
                  value={state.settings.overlay.walkSpeed}
                  onChange={(event) => saveOverlay({ walkSpeed: Number(event.target.value) })}
                />
                <strong>{state.settings.overlay.walkSpeed}</strong>
              </label>
              <label className="range-field">
                <span>桌宠缩放</span>
                <input
                  type="range"
                  min="0.6"
                  max="1.6"
                  step="0.05"
                  value={state.settings.overlay.scale}
                  onChange={(event) => saveOverlay({ scale: Number(event.target.value) })}
                />
                <strong>{Math.round(state.settings.overlay.scale * 100)}%</strong>
              </label>
            </div>
            <div className="settings-actions">
              <button type="button" onClick={() => window.deskPet.overlayCommand({ type: "drop" })}>
                测试掉落
              </button>
              <button
                className="primary-small"
                type="button"
                onClick={() => window.deskPet.overlayCommand({ type: "home" })}
              >
                <Save size={16} />
                回到默认落点
              </button>
            </div>
          </div>
        )}

        {activeSection === "theme" && (
          <div className="settings-section">
            <div className="section-heading">
              <span className="section-kicker">皮肤主题</span>
              <h2>选择整套界面配色</h2>
              <p>主题会保存在本机，重新打开软件后继续使用当前选择。</p>
            </div>
            <div className="theme-grid">
              {themeOptions.map((theme) => {
                const selected =
                  (state.settings.appearance?.theme || "default") === theme.id;
                return (
                  <button
                    className={
                      selected ? "theme-card theme-card--active" : "theme-card"
                    }
                    key={theme.id}
                    type="button"
                    onClick={() => saveTheme(theme.id)}
                  >
                    <div className="theme-swatches">
                      {theme.colors.map((color) => (
                        <span
                          key={color}
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                    <div className="theme-card-copy">
                      <strong>{theme.name}</strong>
                      <span>{theme.description}</span>
                    </div>
                    <span className="theme-card-state">
                      {selected ? "当前使用" : "点击切换"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeSection === "services" && (
          <div className="settings-section">
            <div className="section-heading">
              <span className="section-kicker">本地 AI</span>
              <h2>连接本机运行的服务</h2>
              <p>地址只在本机使用，默认接口采用常见的 OpenAI 兼容格式。</p>
            </div>
            {(["llm", "asr", "tts"] as const).map((service) => {
              const labels = {
                llm: "对话模型",
                asr: "语音识别",
                tts: "语音合成"
              };
              const config = state.settings.services[service];
              return (
                <div className="service-config" key={service}>
                  <div className="service-config-heading">
                    <div>
                      {service === "llm" && <Radio size={18} />}
                      {service === "asr" && <ArchiveRestore size={18} />}
                      {service === "tts" && <Volume2 size={18} />}
                      <strong>{labels[service]}</strong>
                    </div>
                    <span>{serviceResults[service] || "未测试"}</span>
                  </div>
                  <div className="service-fields">
                    <label>
                      <span>服务地址</span>
                      <input
                        defaultValue={config.baseUrl}
                        key={`${service}-${config.baseUrl}`}
                        onBlur={(event) => saveService(service, { baseUrl: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>模型或声线 ID</span>
                      <input
                        defaultValue={service === "tts" ? config.voiceId || "" : config.model}
                        key={`${service}-${config.model}-${config.voiceId || ""}`}
                        onBlur={(event) =>
                          saveService(
                            service,
                            service === "tts"
                              ? { voiceId: event.target.value }
                              : { model: event.target.value }
                          )
                        }
                      />
                    </label>
                    <button type="button" onClick={() => testService(service)}>
                      测试连接
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeSection === "windows" && (
          <div className="settings-section">
            <div className="section-heading section-heading--split">
              <div>
                <span className="section-kicker">辅助窗口</span>
                <h2>编辑可以打开和关闭的普通窗口</h2>
                <p>第一版只负责打开它们，后续再让桌宠借助这些窗口移动。</p>
              </div>
              <button className="primary-small" type="button" onClick={addAuxiliary}>
                <Plus size={16} />
                新建窗口
              </button>
            </div>
            <div className="aux-editor-list">
              {state.auxiliaryWindows.map((auxiliary) => (
                <article className="aux-editor" key={auxiliary.id}>
                  <div className="aux-editor-heading">
                    <input
                      defaultValue={auxiliary.name}
                      key={`${auxiliary.id}-name`}
                      onBlur={(event) => saveAuxiliary(auxiliary.id, { name: event.target.value })}
                    />
                    <label className="compact-toggle">
                      <input
                        type="checkbox"
                        checked={auxiliary.enabled}
                        onChange={(event) =>
                          saveAuxiliary(auxiliary.id, { enabled: event.target.checked })
                        }
                      />
                      启用
                    </label>
                    <button
                      type="button"
                      title="删除辅助窗口"
                      onClick={() =>
                        updateState({
                          auxiliaryWindows: state.auxiliaryWindows.filter(
                            (item) => item.id !== auxiliary.id
                          )
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="aux-editor-grid">
                    <label className="full-field">
                      <span>窗口标题</span>
                      <input
                        defaultValue={auxiliary.title}
                        key={`${auxiliary.id}-title`}
                        onBlur={(event) => saveAuxiliary(auxiliary.id, { title: event.target.value })}
                      />
                    </label>
                    <label className="full-field">
                      <span>窗口内容</span>
                      <textarea
                        defaultValue={auxiliary.body}
                        key={`${auxiliary.id}-body`}
                        rows={3}
                        onBlur={(event) => saveAuxiliary(auxiliary.id, { body: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>宽度</span>
                      <input
                        type="number"
                        defaultValue={auxiliary.width}
                        key={`${auxiliary.id}-width`}
                        onBlur={(event) =>
                          saveAuxiliary(auxiliary.id, { width: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label>
                      <span>高度</span>
                      <input
                        type="number"
                        defaultValue={auxiliary.height}
                        key={`${auxiliary.id}-height`}
                        onBlur={(event) =>
                          saveAuxiliary(auxiliary.id, { height: Number(event.target.value) })
                        }
                      />
                    </label>
                  </div>
                  <div className="aux-editor-actions">
                    <button type="button" onClick={() => window.deskPet.openAuxiliary(auxiliary.id)}>
                      打开预览
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeSection === "data" && (
          <div className="settings-section">
            <div className="section-heading">
              <span className="section-kicker">数据安全</span>
              <h2>管理本机保存的数据</h2>
              <p>状态文件、图片素材和声音样本都保存在当前电脑的数据目录中。</p>
            </div>
            <div className="data-path">
              <FolderOpen size={20} />
              <div>
                <strong>数据目录</strong>
                <code>{paths?.dataPath || "正在读取..."}</code>
              </div>
            </div>
            <div className="settings-actions">
              <button type="button" onClick={() => window.deskPet.openDataFolder()}>
                <FolderOpen size={16} />
                打开目录
              </button>
              <button
                type="button"
                onClick={async () => {
                  const result = await window.deskPet.syncPetStore();
                  window.alert(`已保存 ${result.count} 个独立角色文件。`);
                }}
              >
                <Save size={16} />
                保存独立角色文件
              </button>
              <button type="button" onClick={() => window.deskPet.openPetStore()}>
                <FolderOpen size={16} />
                打开角色存档
              </button>
              <button type="button" disabled={backupBusy} onClick={exportBackup}>
                <HardDriveDownload size={16} />
                导出备份
              </button>
              <button type="button" disabled={backupBusy} onClick={importBackup}>
                <ArchiveRestore size={16} />
                导入备份
              </button>
            </div>
          </div>
        )}

        {activeSection === "app" && (
          <div className="settings-section">
            <div className="section-heading">
              <span className="section-kicker">应用控制</span>
              <h2>本地运行状态</h2>
              <p>应用不需要登录或联网。关闭管理台时会隐藏到后台，桌宠继续运行。</p>
            </div>
            <div className="app-control-list">
              <div>
                <strong>运行位置</strong>
                <span>仅限当前 Windows 电脑</span>
              </div>
              <div>
                <strong>云服务</strong>
                <span>未使用</span>
              </div>
              <div>
                <strong>应用数据</strong>
                <span>关闭和重启后保留</span>
              </div>
            </div>
            <div className="danger-zone">
              <div>
                <strong>退出桌宠工房</strong>
                <span>结束管理台、桌宠悬浮层和后台服务连接。</span>
              </div>
              <button
                className="danger-button"
                type="button"
                onClick={() => {
                  if (window.confirm("确定退出桌宠工房吗？")) window.deskPet.quit();
                }}
              >
                <Power size={16} />
                退出应用
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
