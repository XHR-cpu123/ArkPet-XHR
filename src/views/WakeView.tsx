import {
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  TestTubeDiagonal,
  X
} from "lucide-react";
import { PetAvatar } from "../components/PetAvatar";
import { SpinePet } from "../components/SpinePet";
import { useAppState } from "../state";
import type { PetMode } from "../components/AppShell";
import type { AppSettings } from "../types";
import { useEffect, useState } from "react";

export function WakeView({ petMode }: { petMode: PetMode }) {
  const { state, updateState } = useAppState();
  const [page, setPage] = useState(0);
  const [modulePickerOpen, setModulePickerOpen] = useState(false);
  const summonedPets = state
    ? state.summonedPetIds
        .map((petId) => state.pets.find((item) => item.id === petId))
        .filter(Boolean)
    : [];
  const pageSize = 2;
  const pageCount = Math.max(1, Math.ceil(summonedPets.length / pageSize));
  const pagePets = summonedPets.slice(
    page * pageSize,
    page * pageSize + pageSize
  );

  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  if (!state) return null;
  const currentState = state;
  const pet =
    currentState.pets.find((item) => item.id === currentState.activePetId) ||
    currentState.pets[0];

  async function saveOverlay(
    patch: Partial<AppSettings["overlay"]>
  ) {
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

  return (
    <div className="wake-layout">
      <section className="wake-controls">
        <div className="section-heading">
          <span className="section-kicker">物理与待机</span>
          <h2>调整桌面行为</h2>
          <p>出现与收回统一使用右上角的状态按钮，这里保留走路、摩擦力和待机动作设置。</p>
        </div>

        <div className="inline-note">
          <TestTubeDiagonal size={18} />
          <p>拖动桌宠后松手，会继承拖动速度并自动掉落到任务栏上方。</p>
        </div>

        <div className="motion-settings">
          <div className="idle-settings-heading">
            <div>
              <span className="section-kicker">移动物理</span>
              <strong>只影响走路与抛出后的弹动</strong>
            </div>
            <button
              className="motion-reset"
              type="button"
              onClick={() =>
                saveOverlay({
                  walkSpeed: 63,
                  friction: 45,
                  wallBounce: 55,
                  groundBounce: 45
                })
              }
            >
              <RotateCcw size={14} />
              恢复默认值
            </button>
          </div>

          <label className="idle-range motion-range">
            <span>走路速度</span>
            <input
              type="range"
              min="30"
              max="220"
              step="2"
              value={state.settings.overlay.walkSpeed}
              onChange={(event) =>
                saveOverlay({
                  walkSpeed: Number(event.target.value)
                })
              }
            />
            <strong>{state.settings.overlay.walkSpeed}</strong>
          </label>

          <label className="idle-range motion-range">
            <span>地面摩擦力</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={state.settings.overlay.friction}
              onChange={(event) =>
                saveOverlay({
                  friction: Number(event.target.value)
                })
              }
            />
            <strong>{state.settings.overlay.friction}%</strong>
          </label>

          <label className="idle-range motion-range">
            <span>墙壁弹性</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={state.settings.overlay.wallBounce}
              onChange={(event) =>
                saveOverlay({
                  wallBounce: Number(event.target.value)
                })
              }
            />
            <strong>{state.settings.overlay.wallBounce}%</strong>
          </label>

          <label className="idle-range motion-range">
            <span>地面弹性</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={state.settings.overlay.groundBounce}
              onChange={(event) =>
                saveOverlay({
                  groundBounce: Number(event.target.value)
                })
              }
            />
            <strong>{state.settings.overlay.groundBounce}%</strong>
          </label>

          <p className="idle-help">
            走路速度会同步调整移动距离和走路动画速度，不影响待机动画。摩擦力会衰减抓取后甩出的惯性，不影响正常行走。
          </p>
        </div>

        <div className="idle-settings">
          <div className="idle-settings-heading">
            <div>
              <span className="section-kicker">待机动作</span>
              <strong>
                {state.settings.overlay.idleActionEnabled
                  ? "随机触发"
                  : "已彻底关闭"}
              </strong>
            </div>
            <button
              className={
                state.settings.overlay.idleActionEnabled
                  ? "idle-toggle idle-toggle--active"
                  : "idle-toggle"
              }
              type="button"
              onClick={() =>
                saveOverlay({
                  idleActionEnabled:
                    !state.settings.overlay.idleActionEnabled
                })
              }
            >
              <Play size={15} />
              {state.settings.overlay.idleActionEnabled
                ? "彻底关闭"
                : "恢复待机"}
            </button>
          </div>

          <label className="idle-field">
            <span>待机动作时间</span>
            <div>
              <input
                type="number"
                min="5"
                max="300"
                value={state.settings.overlay.idleActionIntervalSeconds}
                onChange={(event) =>
                  saveOverlay({
                    idleActionIntervalSeconds: Math.max(
                      5,
                      Number(event.target.value) || 20
                    )
                  })
                }
              />
              <strong>秒</strong>
            </div>
          </label>

          <label className="idle-range">
            <span>触发概率</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={state.settings.overlay.idleActionChance}
              onChange={(event) =>
                saveOverlay({
                  idleActionChance: Number(event.target.value)
                })
              }
            />
            <strong>{state.settings.overlay.idleActionChance}%</strong>
          </label>

          <p className="idle-help">
            每隔设定时间进行一次概率判断。触发后会完整播放待机动作，只有鼠标拖动才能打断。
          </p>
        </div>
      </section>

      <div className="wake-stage-area">
        <div
          className="desktop-stage-stack"
          style={{
            gridTemplateRows: `repeat(${Math.max(
              1,
              pagePets.length
            )}, minmax(0, 1fr))`
          }}
        >
        {(pagePets.length > 0 ? pagePets : [null]).map((item, index) => (
          <section className="desktop-stage" key={item?.id || `empty-${index}`}>
            <div className="stage-status">
              <span className={item ? "state-chip state-chip--live" : "state-chip"}>
                <span className="state-dot" />
                {item ? "桌面活动中" : "当前没有桌宠"}
              </span>
              <span>
                主显示器 · 任务栏落点{item ? ` · ${item.name}` : ""}
              </span>
            </div>
            <div className="stage-grid" />
            <div className="stage-pet">
              {item?.spine ? (
                <SpinePet
                  skelUrl={item.spine.skelUrl}
                  state="walk"
                  fitRatio={0.72}
                  className="stage-spine-pet"
                  actionBindings={item.actionBindings}
                  boneMap={item.boneMap}
                  fallback={
                    <PetAvatar
                      primary={item.accent}
                      secondary={item.secondary}
                      size={120}
                      state="walk"
                    />
                  }
                />
              ) : item?.avatarUrl ? (
                <img
                  src={item.avatarUrl}
                  alt={item.name}
                  className="stage-pet-image"
                />
              ) : item ? (
                <PetAvatar
                  primary={item.accent}
                  secondary={item.secondary}
                  size={120}
                  state="walk"
                />
              ) : null}
            </div>
            <div className="taskbar-line">
              <span>任务栏上沿</span>
            </div>
          </section>
        ))}
        </div>
        {pageCount > 1 && (
          <div className="stage-pagination" aria-label="角色展示分页">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: pageCount }, (_, index) => (
              <button
                className={
                  index === page
                    ? "stage-page-dot stage-page-dot--active"
                    : "stage-page-dot"
                }
                key={index}
                type="button"
                aria-label={`第 ${index + 1} 页`}
                onClick={() => setPage(index)}
              />
            ))}
            <button
              type="button"
              disabled={page >= pageCount - 1}
              onClick={() =>
                setPage((current) => Math.min(pageCount - 1, current + 1))
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      <section className="wake-side">
        <div className="section-heading">
          <span className="section-kicker">模组区</span>
          <h2>角色模组</h2>
          <p>添加后可在这里直接调整模组。</p>
        </div>
        <div className="wake-module-list">
          {state.customModules
            .filter(
              (module) =>
                module.enabled !== false &&
                module.moduleScope === "global" &&
                module.quickControl === true
            )
            .map((module) => (
              <article className="wake-module-card" key={module.id}>
                <div className="wake-module-heading">
                  <strong>{module.name}</strong>
                  <button
                    type="button"
                    title="移除模组"
                    onClick={() =>
                      void updateState({
                        customModules: state.customModules.map((item) =>
                          item.id === module.id
                            ? { ...item, quickControl: false }
                            : item
                        )
                      })
                    }
                  >
                    <X size={13} />
                  </button>
                </div>
                {module.kind === "dialog-box" && (
                  <div className="wake-dialog-controls">
                    <label>
                      <span>宽度</span>
                      <input
                        type="number"
                        value={module.width || 320}
                        onChange={(event) =>
                          void updateState({
                            customModules: state.customModules.map((item) =>
                              item.id === module.id
                                ? {
                                    ...item,
                                    width: Number(event.target.value) || 320
                                  }
                                : item
                            )
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>高度</span>
                      <input
                        type="number"
                        value={module.height || 260}
                        onChange={(event) =>
                          void updateState({
                            customModules: state.customModules.map((item) =>
                              item.id === module.id
                                ? {
                                    ...item,
                                    height: Number(event.target.value) || 260
                                  }
                                : item
                            )
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>背景</span>
                      <input
                        type="color"
                        value={module.background || "#f7f5ef"}
                        onChange={(event) =>
                          void updateState({
                            customModules: state.customModules.map((item) =>
                              item.id === module.id
                                ? { ...item, background: event.target.value }
                                : item
                            )
                          })
                        }
                      />
                    </label>
                  </div>
                )}
                <button
                  className="wake-module-open"
                  type="button"
                  onClick={() =>
                    void window.deskPet.openExternalModule(module.id)
                  }
                >
                  <DoorOpen size={14} />
                  打开模组
                </button>
              </article>
            ))}
          {state.customModules.filter(
            (module) =>
              module.enabled !== false &&
              module.moduleScope === "global" &&
              module.quickControl === true
          ).length === 0 && (
            <p className="empty-copy">还没有添加模组。</p>
          )}
        </div>
        <button
          className="wake-add-module-bar"
          type="button"
          onClick={() => setModulePickerOpen((current) => !current)}
        >
          <Plus size={15} />
          添加模组
        </button>
        {modulePickerOpen && (
          <div className="wake-module-picker">
            {state.customModules
              .filter(
                (module) =>
                  module.enabled !== false &&
                  module.moduleScope === "global" &&
                  module.quickControl !== true
              )
              .map((module) => (
                <button
                  type="button"
                  key={module.id}
                  onClick={() => {
                    void updateState({
                      customModules: state.customModules.map((item) =>
                        item.id === module.id
                          ? { ...item, quickControl: true }
                          : item
                      )
                    });
                    setModulePickerOpen(false);
                  }}
                >
                  {module.name}
                  <Plus size={13} />
                </button>
              ))}
            {state.customModules.filter(
              (module) =>
                module.enabled !== false &&
                module.moduleScope === "global" &&
                module.quickControl !== true
            ).length === 0 && (
              <span className="empty-copy">没有可添加的模组。</span>
            )}
          </div>
        )}
        <div className="gravity-lock-panel">
          <div>
            <span className="section-kicker">移动模式</span>
            <strong>解除重力锁定</strong>
            <p>
              {state.settings.overlay.gravityLocked
                ? "关闭后，桌宠可以离开地面，在整个桌面区域移动。"
                : "当前桌宠不锁地面，会自由移动；摩擦力仍会衰减抛掷后的弹动。"}
            </p>
          </div>
          <button
            className={
              state.settings.overlay.gravityLocked
                ? "gravity-lock-button"
                : "gravity-lock-button gravity-lock-button--active"
            }
            type="button"
            onClick={() =>
              saveOverlay({
                gravityLocked: !state.settings.overlay.gravityLocked
              })
            }
          >
            {state.settings.overlay.gravityLocked
              ? "解除重力锁定"
              : "恢复重力锁定"}
          </button>
        </div>
        <div className="pet-size-panel">
          <div className="idle-settings-heading">
            <div>
              <span className="section-kicker">桌宠尺寸</span>
              <strong>当前 {Math.round(state.settings.overlay.scale * 100)}%</strong>
            </div>
            <button
              className="motion-reset"
              type="button"
              onClick={() => saveOverlay({ scale: 1 })}
            >
              <RotateCcw size={14} />
              恢复默认值
            </button>
          </div>
          <label className="idle-range motion-range">
            <span>显示大小</span>
            <input
              type="range"
              min="0.6"
              max="1.6"
              step="0.05"
              value={state.settings.overlay.scale}
              onChange={(event) =>
                saveOverlay({
                  scale: Number(event.target.value)
                })
              }
            />
            <strong>{Math.round(state.settings.overlay.scale * 100)}%</strong>
          </label>
          <p className="idle-help">
            默认尺寸为当前比例的 100%。尺寸只影响显示大小，不影响移动速度和摩擦力。
          </p>
        </div>
        <div
          className={
            summonedPets.length > 1
              ? "pet-interaction-panel"
              : "pet-interaction-panel pet-interaction-panel--disabled"
          }
        >
          <div className="idle-settings-heading">
            <div>
              <span className="section-kicker">桌宠相遇</span>
              <strong>相互穿过概率</strong>
            </div>
            <span>{state.settings.overlay.passThroughChance}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            disabled={summonedPets.length <= 1}
            value={state.settings.overlay.passThroughChance}
            onChange={(event) =>
              saveOverlay({
                passThroughChance: Number(event.target.value)
              })
            }
          />
          <p className="idle-help">
            数值越高，多个桌宠相遇时越容易上下分层穿过；数值越低，越容易碰撞后反向。
          </p>
        </div>
        <div className="inline-note">
          <Sparkles size={18} />
          <p>后续会加入桌面图标攀爬、窗口上檐移动和跨越辅助窗口。</p>
        </div>
      </section>
    </div>
  );
}
