import { FolderPlus, Puzzle, Settings, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAppState } from "../state";
import type { CustomDialogModule } from "../types";

export function ModuleManagerView() {
  const { state, updateState } = useAppState();
  const [settingsId, setSettingsId] = useState("");
  if (!state) return null;
  const currentState = state;
  const settingsModule = currentState.customModules.find(
    (item) => item.id === settingsId
  );

  async function addModule() {
    const result = await window.deskPet.importExternalModule();
    if (result.canceled) return;
    if (result.error) {
      window.alert(result.error);
      return;
    }
    await updateState({});
  }

  async function chooseImage(
    slot: "background" | "user" | "assistant" | "decoration"
  ) {
    if (!settingsModule) return;
    const result = await window.deskPet.chooseModuleImage(
      settingsModule.id,
      slot
    );
    if (result.canceled || !result.url) {
      if (result.error) window.alert(result.error);
      return;
    }
    const patch =
      slot === "background"
        ? { backgroundImageUrl: result.url }
        : slot === "user"
          ? { userBubbleImageUrl: result.url }
          : slot === "assistant"
            ? { assistantBubbleImageUrl: result.url }
            : { decorationImageUrl: result.url };
    await updateState({
      customModules: currentState.customModules.map((module) =>
        module.id === settingsModule.id ? { ...module, ...patch } : module
      )
    });
  }

  return (
    <div className="module-manager-page">
      <div className="section-heading section-heading--split">
        <div>
          <span className="section-kicker">模组管理</span>
          <h2>添加外部模组包</h2>
          <p>
            选择一个包含 module.json 或 manifest.json 的模组文件夹。导入后，需要在桌宠制作里绑定，右键菜单才会显示。
          </p>
        </div>
        <button
          className="primary-small"
          type="button"
          onClick={() => void addModule()}
        >
          <FolderPlus size={16} />
          添加模组
        </button>
      </div>

      <div className="module-library-grid">
        {currentState.customModules.map((item) => (
          <article className="module-library-card" key={item.id}>
            <span className="module-library-icon">
              <Puzzle size={21} />
            </span>
            <div>
              <strong>{item.name}</strong>
              {item.builtinType !== "climb-platforms" && (
                <>
                  <span>
                    {item.kind} · v{item.version || "1.0.0"}
                  </span>
                  <span>
                    {item.moduleScope === "global" ? "全局作用" : "角色作用"} ·{" "}
                    {item.moduleCategory}
                  </span>
                </>
              )}
              <p>{item.description}</p>
              {item.builtinType !== "climb-platforms" && (
                <small>右键名称：{item.contextMenuLabel || item.name}</small>
              )}
            </div>
            <div className="module-library-actions">
              <button
                className={
                  item.enabled !== false
                    ? "module-switch module-switch--on"
                    : "module-switch"
                }
                type="button"
                title={item.enabled !== false ? "关闭模组" : "启用模组"}
                onClick={() =>
                  void updateState({
                    customModules: currentState.customModules.map((module) =>
                      module.id === item.id
                        ? { ...module, enabled: module.enabled === false }
                        : module
                    )
                  })
                }
              >
                <span />
              </button>
              <button
                type="button"
                title="模组设置"
                onClick={() => setSettingsId(item.id)}
              >
                <Settings size={15} />
              </button>
            </div>
          </article>
        ))}
        {currentState.customModules.length === 0 && (
          <p className="empty-copy">还没有导入外部模组。</p>
        )}
      </div>

      {settingsModule && (
        <section className="module-settings-panel">
          <div className="panel-heading">
            <Settings size={18} />
            <strong>{settingsModule.name} 设置</strong>
          </div>
          {settingsModule.moduleCategory === "dialog-skin" && (
            <section className="dialog-skin-workbench">
              <div
                className="dialog-skin-preview"
                style={{
                  background: settingsModule.background,
                  borderColor: settingsModule.borderColor,
                  borderRadius: settingsModule.borderRadius,
                  color: settingsModule.textColor,
                  backgroundImage: settingsModule.backgroundImageUrl
                    ? `url("${settingsModule.backgroundImageUrl}")`
                    : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center"
                }}
              >
                <div
                  className="dialog-skin-preview-line dialog-skin-preview-line--assistant"
                  style={{
                    background: settingsModule.assistantBubbleColor,
                    backgroundImage: settingsModule.assistantBubbleImageUrl
                      ? `url("${settingsModule.assistantBubbleImageUrl}")`
                      : undefined
                  }}
                >
                  你今天过得怎么样？
                </div>
                <div
                  className="dialog-skin-preview-line dialog-skin-preview-line--user"
                  style={{
                    background: settingsModule.userBubbleColor,
                    backgroundImage: settingsModule.userBubbleImageUrl
                      ? `url("${settingsModule.userBubbleImageUrl}")`
                      : undefined
                  }}
                >
                  还好，就是有点累。
                </div>
                {settingsModule.decorationImageUrl && (
                  <img
                    className="dialog-skin-decoration"
                    src={settingsModule.decorationImageUrl}
                    alt=""
                  />
                )}
              </div>
              <div className="dialog-skin-tools">
                <label>
                  <span>背景颜色</span>
                  <input
                    type="color"
                    value={settingsModule.background}
                    onChange={(event) =>
                      void updateState({
                        customModules: currentState.customModules.map(
                          (module) =>
                            module.id === settingsModule.id
                              ? { ...module, background: event.target.value }
                              : module
                        )
                      })
                    }
                  />
                </label>
                <label>
                  <span>边框颜色</span>
                  <input
                    type="color"
                    value={settingsModule.borderColor}
                    onChange={(event) =>
                      void updateState({
                        customModules: currentState.customModules.map(
                          (module) =>
                            module.id === settingsModule.id
                              ? { ...module, borderColor: event.target.value }
                              : module
                        )
                      })
                    }
                  />
                </label>
                <label>
                  <span>文字颜色</span>
                  <input
                    type="color"
                    value={settingsModule.textColor}
                    onChange={(event) =>
                      void updateState({
                        customModules: currentState.customModules.map(
                          (module) =>
                            module.id === settingsModule.id
                              ? { ...module, textColor: event.target.value }
                              : module
                        )
                      })
                    }
                  />
                </label>
                <label>
                  <span>圆角</span>
                  <input
                    type="number"
                    min="0"
                    max="40"
                    value={settingsModule.borderRadius}
                    onChange={(event) =>
                      void updateState({
                        customModules: currentState.customModules.map(
                          (module) =>
                            module.id === settingsModule.id
                              ? {
                                  ...module,
                                  borderRadius: Number(event.target.value) || 0
                                }
                              : module
                        )
                      })
                    }
                  />
                </label>
                <button type="button" onClick={() => void chooseImage("background")}>
                  导入背景图片
                </button>
                <button type="button" onClick={() => void chooseImage("user")}>
                  导入用户气泡图片
                </button>
                <button type="button" onClick={() => void chooseImage("assistant")}>
                  导入角色气泡图片
                </button>
                <button type="button" onClick={() => void chooseImage("decoration")}>
                  导入装饰图片
                </button>
              </div>
            </section>
          )}
          <div
            className={
              settingsModule.builtinType === "climb-platforms"
                ? "module-editor-grid module-editor-grid--climb"
                : "module-editor-grid"
            }
          >
            <label>
              <span>模组名称</span>
              <input
                value={settingsModule.name}
                onChange={(event) =>
                  void updateState({
                    customModules: currentState.customModules.map((module) =>
                      module.id === settingsModule.id
                        ? { ...module, name: event.target.value }
                        : module
                    )
                  })
                }
              />
            </label>
            <label>
              <span>右键菜单名称</span>
              <input
                value={settingsModule.contextMenuLabel || ""}
                onChange={(event) =>
                  void updateState({
                    customModules: currentState.customModules.map((module) =>
                      module.id === settingsModule.id
                        ? { ...module, contextMenuLabel: event.target.value }
                        : module
                    )
                  })
                }
              />
            </label>
            <label className="full-field">
              <span>说明</span>
              <input
                value={settingsModule.description}
                onChange={(event) =>
                  void updateState({
                    customModules: currentState.customModules.map((module) =>
                      module.id === settingsModule.id
                        ? { ...module, description: event.target.value }
                        : module
                    )
                  })
                }
              />
            </label>
            <label>
              <span>作用范围</span>
              <select
                value={settingsModule.moduleScope || "pet"}
                onChange={(event) =>
                  void updateState({
                    customModules: currentState.customModules.map((module) =>
                      module.id === settingsModule.id
                        ? {
                            ...module,
                            moduleScope: event.target.value as
                              | "global"
                              | "pet",
                            quickControl:
                              event.target.value === "global"
                                ? module.quickControl
                                : false
                          }
                        : module
                    )
                  })
                }
              >
                <option value="global">全局作用模组</option>
                <option value="pet">角色作用模组</option>
              </select>
            </label>
            <label>
              <span>模组分类</span>
              <select
                value={settingsModule.moduleCategory || "external"}
                onChange={(event) =>
                  void updateState({
                    customModules: currentState.customModules.map((module) =>
                      module.id === settingsModule.id
                        ? {
                            ...module,
                            moduleCategory: event.target.value as CustomDialogModule["moduleCategory"]
                          }
                        : module
                    )
                  })
                }
              >
                <option value="dialog-skin">对话框皮肤</option>
                <option value="auxiliary-window">辅助窗口</option>
                <option value="interaction">交互模组</option>
                <option value="external">外部扩展</option>
              </select>
            </label>
            {settingsModule.builtinType !== "climb-platforms" && (
              <label className="module-quick-toggle">
                <input
                  type="checkbox"
                  checked={settingsModule.quickControl === true}
                  disabled={settingsModule.moduleScope !== "global"}
                  onChange={(event) =>
                    void updateState({
                      customModules: currentState.customModules.map(
                        (module) =>
                          module.id === settingsModule.id
                            ? { ...module, quickControl: event.target.checked }
                            : module
                      )
                    })
                  }
                />
                <span>添加到桌宠行为控制快捷区</span>
              </label>
            )}
            {settingsModule.builtinType === "hunger-food" && (
              <>
                <label>
                  <span>每分钟饥饿下降</span>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    value={settingsModule.hungerDecayPerMinute ?? 1}
                    onChange={(event) =>
                      void updateState({
                        customModules: currentState.customModules.map(
                          (module) =>
                            module.id === settingsModule.id
                              ? {
                                  ...module,
                                  hungerDecayPerMinute: Math.max(
                                    0,
                                    Number(event.target.value) || 0
                                  )
                                }
                              : module
                        )
                      })
                    }
                  />
                </label>
                <label>
                  <span>寻找食物间隔（秒）</span>
                  <input
                    type="number"
                    min="3"
                    max="300"
                    value={settingsModule.foodSeekIntervalSeconds ?? 8}
                    onChange={(event) =>
                      void updateState({
                        customModules: currentState.customModules.map(
                          (module) =>
                            module.id === settingsModule.id
                              ? {
                                  ...module,
                                  foodSeekIntervalSeconds: Math.max(
                                    3,
                                    Number(event.target.value) || 8
                                  )
                                }
                              : module
                        )
                      })
                    }
                  />
                </label>
              </>
            )}
            {(settingsModule.builtinType === "auxiliary-window" ||
              settingsModule.builtinType === "climb-platforms") && (
              <>
                <label className="full-field module-climb-setting">
                  <span>窗口标题</span>
                  <input
                    value={settingsModule.windowTitle || ""}
                    onChange={(event) =>
                      void updateState({
                        customModules: currentState.customModules.map((module) =>
                          module.id === settingsModule.id
                            ? { ...module, windowTitle: event.target.value }
                            : module
                        )
                      })
                    }
                  />
                </label>
                <label className="full-field module-climb-setting">
                  <span>窗口内容</span>
                  <textarea
                    rows={3}
                    value={settingsModule.windowBody || ""}
                    onChange={(event) =>
                      void updateState({
                        customModules: currentState.customModules.map((module) =>
                          module.id === settingsModule.id
                            ? { ...module, windowBody: event.target.value }
                            : module
                        )
                      })
                    }
                  />
                </label>
                <label className="module-climb-setting">
                  <span>窗口宽度</span>
                  <input
                    type="range"
                    min="180"
                    max="900"
                    value={settingsModule.windowWidth || 420}
                    onChange={(event) =>
                      void updateState({
                        customModules: currentState.customModules.map((module) =>
                          module.id === settingsModule.id
                            ? {
                                ...module,
                                windowWidth: Number(event.target.value)
                              }
                            : module
                        )
                      })
                    }
                  />
                  <input
                    type="number"
                    value={settingsModule.windowWidth || 420}
                    onChange={(event) =>
                      void updateState({
                        customModules: currentState.customModules.map((module) =>
                          module.id === settingsModule.id
                            ? {
                                ...module,
                                windowWidth: Number(event.target.value) || 420
                              }
                            : module
                        )
                      })
                    }
                  />
                </label>
                <label className="module-climb-setting">
                  <span>窗口高度</span>
                  <input
                    type="range"
                    min="140"
                    max="700"
                    value={settingsModule.windowHeight || 320}
                    onChange={(event) =>
                      void updateState({
                        customModules: currentState.customModules.map((module) =>
                          module.id === settingsModule.id
                            ? {
                                ...module,
                                windowHeight: Number(event.target.value)
                              }
                            : module
                        )
                      })
                    }
                  />
                  <input
                    type="number"
                    value={settingsModule.windowHeight || 320}
                    onChange={(event) =>
                      void updateState({
                        customModules: currentState.customModules.map((module) =>
                          module.id === settingsModule.id
                            ? {
                                ...module,
                                windowHeight: Number(event.target.value) || 320
                              }
                            : module
                        )
                      })
                    }
                  />
                </label>
                {settingsModule.builtinType === "climb-platforms" && (
                  <>
                    <label className="module-climb-setting">
                      <span>召唤攀爬落脚点概率</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={settingsModule.climbChance ?? 55}
                        onChange={(event) =>
                          void updateState({
                            customModules: currentState.customModules.map(
                              (module) =>
                                module.id === settingsModule.id
                                  ? {
                                      ...module,
                                      climbChance: Number(event.target.value)
                                    }
                                  : module
                            )
                          })
                        }
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={settingsModule.climbChance ?? 55}
                        onChange={(event) =>
                          void updateState({
                            customModules: currentState.customModules.map(
                              (module) =>
                                module.id === settingsModule.id
                                  ? {
                                      ...module,
                                      climbChance: Math.max(
                                        0,
                                        Math.min(
                                          100,
                                          Number(event.target.value) || 0
                                        )
                                      )
                                    }
                                  : module
                            )
                          })
                        }
                      />
                    </label>
                    <label className="module-climb-setting">
                      <span>新一轮攀爬概率</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={settingsModule.climbJumpChance ?? 65}
                        onChange={(event) =>
                          void updateState({
                            customModules: currentState.customModules.map(
                              (module) =>
                                module.id === settingsModule.id
                                  ? {
                                      ...module,
                                      climbJumpChance: Number(event.target.value)
                                    }
                                  : module
                            )
                          })
                        }
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={settingsModule.climbJumpChance ?? 65}
                        onChange={(event) =>
                          void updateState({
                            customModules: currentState.customModules.map(
                              (module) =>
                                module.id === settingsModule.id
                                  ? {
                                      ...module,
                                      climbJumpChance: Math.max(
                                        0,
                                        Math.min(
                                          100,
                                          Number(event.target.value) || 0
                                        )
                                      )
                                    }
                                  : module
                            )
                          })
                        }
                      />
                    </label>
                    <label className="module-climb-setting">
                      <span>连跳续跳概率</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={settingsModule.climbChainChance ?? 90}
                        onChange={(event) =>
                          void updateState({
                            customModules: currentState.customModules.map(
                              (module) =>
                                module.id === settingsModule.id
                                  ? {
                                      ...module,
                                      climbChainChance: Math.max(
                                        0,
                                        Math.min(
                                          100,
                                          Number(event.target.value) || 0
                                        )
                                      )
                                    }
                                  : module
                            )
                          })
                        }
                      />
                    </label>
                    <label className="module-climb-setting">
                      <span>每次续跳衰减倍数</span>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={settingsModule.climbChainDecay ?? 0.65}
                        onChange={(event) =>
                          void updateState({
                            customModules: currentState.customModules.map(
                              (module) =>
                                module.id === settingsModule.id
                                  ? {
                                      ...module,
                                      climbChainDecay: Math.max(
                                        0,
                                        Math.min(
                                          1,
                                          Number(event.target.value) || 0
                                        )
                                      )
                                    }
                                  : module
                            )
                          })
                        }
                      />
                    </label>
                    <label className="module-climb-setting">
                      <span>每升高一格衰减倍数</span>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={settingsModule.climbHeightDecay ?? 0.8}
                        onChange={(event) =>
                          void updateState({
                            customModules: currentState.customModules.map(
                              (module) =>
                                module.id === settingsModule.id
                                  ? {
                                      ...module,
                                      climbHeightDecay: Math.max(
                                        0,
                                        Math.min(
                                          1,
                                          Number(event.target.value) || 0
                                        )
                                      )
                                    }
                                  : module
                            )
                          })
                        }
                      />
                    </label>
                    <label className="module-climb-setting">
                      <span>跳跃判定间隔（秒）</span>
                      <input
                        type="range"
                        min="1"
                        max="300"
                        value={settingsModule.climbJumpIntervalSeconds ?? 3}
                        onChange={(event) =>
                          void updateState({
                            customModules: currentState.customModules.map(
                              (module) =>
                                module.id === settingsModule.id
                                  ? {
                                      ...module,
                                      climbJumpIntervalSeconds: Number(
                                        event.target.value
                                      )
                                    }
                                  : module
                            )
                          })
                        }
                      />
                      <input
                        type="number"
                        min="1"
                        value={settingsModule.climbJumpIntervalSeconds ?? 3}
                        onChange={(event) =>
                          void updateState({
                            customModules: currentState.customModules.map(
                              (module) =>
                                module.id === settingsModule.id
                                  ? {
                                      ...module,
                                      climbJumpIntervalSeconds: Math.max(
                                        1,
                                        Number(event.target.value) || 3
                                      )
                                    }
                                  : module
                            )
                          })
                        }
                      />
                    </label>
                    <label className="module-climb-setting">
                      <span>最多窗口数量</span>
                      <input
                        type="range"
                        min="1"
                        max="4"
                        value={settingsModule.climbMaxWindows ?? 2}
                        onChange={(event) =>
                          void updateState({
                            customModules: currentState.customModules.map(
                              (module) =>
                                module.id === settingsModule.id
                                  ? {
                                      ...module,
                                      climbMaxWindows: Number(event.target.value)
                                    }
                                  : module
                            )
                          })
                        }
                      />
                      <input
                        type="number"
                        min="1"
                        max="4"
                        value={settingsModule.climbMaxWindows ?? 2}
                        onChange={(event) =>
                          void updateState({
                            customModules: currentState.customModules.map(
                              (module) =>
                                module.id === settingsModule.id
                                  ? {
                                      ...module,
                                      climbMaxWindows: Math.max(
                                        1,
                                        Math.min(
                                          4,
                                          Number(event.target.value) || 2
                                        )
                                      )
                                    }
                                  : module
                            )
                          })
                        }
                      />
                    </label>
                  </>
                )}
              </>
            )}
          </div>
          <div className="module-editor-actions">
            <button
              type="button"
              disabled={settingsModule.builtinType === "hunger-food"}
              onClick={() =>
                void (settingsModule.builtinType === "climb-platforms"
                  ? window.deskPet.triggerExternalModule(
                      settingsModule.id,
                      "preview"
                    )
                  : settingsModule.builtinType === "hunger-food"
                    ? Promise.resolve(false)
                    : window.deskPet.openExternalModule(settingsModule.id))
              }
            >
              {settingsModule.builtinType === "hunger-food"
                ? "随角色自动运行"
                : settingsModule.builtinType === "climb-platforms"
                ? "生成攀爬窗口"
                : "打开模组"}
            </button>
            <button
              type="button"
              onClick={() => setSettingsId("")}
            >
              关闭设置
            </button>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(`删除模组“${settingsModule.name}”？`)) return;
                void updateState({
                  customModules: currentState.customModules.filter(
                    (module) => module.id !== settingsModule.id
                  ),
                  pets: currentState.pets.map((pet) => ({
                    ...pet,
                    modulePlugins: pet.modulePlugins
                      ? {
                          ...pet.modulePlugins,
                          boundModuleIds: (
                            pet.modulePlugins.boundModuleIds || []
                          ).filter((id) => id !== settingsModule.id)
                        }
                      : pet.modulePlugins
                  }))
                });
                setSettingsId("");
              }}
            >
              <Trash2 size={15} />
              删除
            </button>
          </div>
        </section>
      )}

      <section className="module-format-help">
        <strong>module.json 示例</strong>
        <pre>{`{
  "id": "my-module",
  "name": "我的模组",
  "type": "interaction",
  "version": "1.0.0",
  "description": "模组说明",
  "contextMenuLabel": "打开我的模组",
  "entry": "index.html",
  "width": 480,
  "height": 520
}`}</pre>
      </section>
    </div>
  );
}
