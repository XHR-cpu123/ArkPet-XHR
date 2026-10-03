import { Color, SkeletonBinary } from "@pixi-spine/all-3.8";
import {
  Bot,
  CheckCircle2,
  File,
  Image as ImageIcon,
  Layers3,
  Plus,
  Puzzle,
  Save,
  ScanLine,
  SlidersHorizontal,
  Trash2,
  Upload,
  Volume2,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PetAvatar } from "../components/PetAvatar";
import { SpinePet } from "../components/SpinePet";
import { makeId } from "../lib/id";
import {
  chooseBoundAnimation,
  universalActions,
  validateActionSet,
  type ActionDiagnostics
} from "../lib/spineActions";
import {
  FIRST_PET_LEG_WALK,
  FIRST_PET_LEG_WALK_LABEL
} from "../lib/firstPetLegWalk";
import {
  getVisualSize,
  withRenderConfigDefaults
} from "../lib/renderConfig";
import { useAppState } from "../state";
import type {
  AppState,
  BoneRoleMap,
  PetModulePlugins,
  PetProfile,
  PetRenderConfig,
  SpinePartKind,
  SpineStagedPart
} from "../types";

type WorkshopMode = "edit" | "create";
type AdvancedResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const advancedResizeEdges: AdvancedResizeEdge[] = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw"
];

const spineSlots: Array<{
  kind: SpinePartKind;
  label: string;
  hint: string;
  icon: typeof File;
}> = [
  { kind: "skeleton", label: "骨骼文件", hint: ".skel", icon: File },
  { kind: "atlas", label: "图集文件", hint: ".atlas", icon: Layers3 },
  { kind: "texture", label: "纹理页", hint: "PNG", icon: ImageIcon }
];

export function WorkshopView() {
  const { state, updateState, refresh } = useAppState();
  const [mode, setMode] = useState<WorkshopMode>("edit");
  const [draftId, setDraftId] = useState(() => makeId("spine-draft"));
  const [draftParts, setDraftParts] = useState<
    Partial<Record<SpinePartKind, SpineStagedPart>>
  >({});
  const [creating, setCreating] = useState(false);
  const [previewAction, setPreviewAction] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedMode, setAdvancedMode] = useState<
    "position" | "hitbox" | "display"
  >("hitbox");
  const [draftRenderConfig, setDraftRenderConfig] =
    useState<PetRenderConfig | null>(null);
  const [renderConfigDirty, setRenderConfigDirty] = useState(false);
  const [diagnostics, setDiagnostics] =
    useState<ActionDiagnostics | null>(null);
  const [draftDiagnostics, setDraftDiagnostics] =
    useState<ActionDiagnostics | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [modulePickerOpen, setModulePickerOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<AppState | null>(null);
  const petRef = useRef<PetProfile | null>(null);
  const draftRenderConfigRef = useRef<PetRenderConfig | null>(null);
  const renderConfigDirtyRef = useRef(false);

  useEffect(() => {
    if (!state) return;
    const currentPet =
      state.pets.find((item) => item.id === state.activePetId) ||
      state.pets[0];
    if (!currentPet.spine) {
      setDiagnostics(null);
      return;
    }
    setDiagnostics(
      validateActionSet(
        currentPet.spine.animations,
        currentPet.spine.animationDurations || {},
        currentPet.actionBindings
      )
    );
  }, [
    state?.activePetId,
    state?.pets
  ]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const update = () =>
      setStageSize({
        width: element.clientWidth,
        height: element.clientHeight
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    if (!state) return;
    const currentPet =
      state.pets.find((item) => item.id === state.activePetId) ||
      state.pets[0];
    if (!currentPet) return;
    setDraftRenderConfig(withRenderConfigDefaults(currentPet.renderConfig));
    setRenderConfigDirty(false);
  }, [state?.activePetId]);

  useEffect(() => {
    if (!state || !renderConfigDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      const shouldSave = window.confirm(
        "高级设置有未保存的改动，是否保存后退出？"
      );
      if (shouldSave && draftRenderConfig) {
        const currentPet =
          state.pets.find((item) => item.id === state.activePetId) ||
          state.pets[0];
        if (currentPet) {
          window.deskPet.updateStateSync({
            pets: state.pets.map((item) =>
              item.id === currentPet.id
                ? {
                    ...item,
                    renderConfig: withRenderConfigDefaults(draftRenderConfig)
                  }
                : item
            )
          });
        }
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state, renderConfigDirty, draftRenderConfig]);

  useEffect(() => {
    stateRef.current = state;
    petRef.current =
      state?.pets.find((item) => item.id === state.activePetId) ||
      state?.pets[0] ||
      null;
  }, [state]);

  useEffect(() => {
    draftRenderConfigRef.current = draftRenderConfig;
  }, [draftRenderConfig]);

  useEffect(() => {
    renderConfigDirtyRef.current = renderConfigDirty;
  }, [renderConfigDirty]);

  useEffect(
    () => () => {
      if (!renderConfigDirtyRef.current) return;
      const shouldSave = window.confirm(
        "高级设置有未保存的改动，是否保存后离开此页面？"
      );
      const currentState = stateRef.current;
      const currentPet = petRef.current;
      const draft = draftRenderConfigRef.current;
      if (shouldSave && currentState && currentPet && draft) {
        window.deskPet.updateStateSync({
          pets: currentState.pets.map((item) =>
            item.id === currentPet.id
              ? { ...item, renderConfig: withRenderConfigDefaults(draft) }
              : item
          )
        });
      }
    },
    []
  );

  if (!state) return null;
  const currentState = state;
  const pet =
    currentState.pets.find((item) => item.id === currentState.activePetId) ||
    currentState.pets[0];
  const activeRenderConfig: PetRenderConfig =
    draftRenderConfig || withRenderConfigDefaults(pet.renderConfig);

  async function savePet(nextPet: PetProfile) {
    nextPet.updatedAt = new Date().toISOString();
    await updateState({
      pets: currentState.pets.map((item) =>
        item.id === nextPet.id ? nextPet : item
      ),
      activePetId: nextPet.id
    });
  }

  function saveModulePlugin(patch: Partial<PetModulePlugins>) {
    void savePet({
      ...pet,
      modulePlugins: {
        ...(pet.modulePlugins || {}),
        ...patch
      }
    });
  }

  function saveCustomModulePlugin(
    source: "voice" | "ai" | "training",
    itemId: string
  ) {
    saveModulePlugin({
      custom: itemId ? { source, itemId } : undefined
    });
  }

  async function deletePet() {
    if (currentState.pets.length <= 1) return;
    if (!window.confirm(`确定删除“${pet.name}”吗？素材仍会保留在数据目录中。`)) {
      return;
    }
    const pets = currentState.pets.filter((item) => item.id !== pet.id);
    await updateState({ pets, activePetId: pets[0].id });
    setMode("edit");
  }

  async function startCreate() {
    if (renderConfigDirty) {
      const shouldSave = window.confirm(
        "高级设置有未保存的改动，是否保存后再新增桌宠？"
      );
      if (shouldSave) {
        await commitRenderConfig();
      } else {
        setDraftRenderConfig(withRenderConfigDefaults(pet.renderConfig));
        setRenderConfigDirty(false);
      }
    }
    setMode("create");
    setDraftId(makeId("spine-draft"));
    setDraftParts({});
    setDraftDiagnostics(null);
    setPreviewAction("");
    setShowAdvanced(false);
  }

  async function selectPart(kind: SpinePartKind) {
    try {
      const result = await window.deskPet.selectSpinePart(kind, draftId);
      if (result.part) {
        setDraftParts((current) => ({ ...current, [kind]: result.part }));
        if (kind === "skeleton") {
          await inspectSkeletonPart(result.part);
        }
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "素材导入失败。");
    }
  }

  async function inspectSkeletonPart(part: SpineStagedPart) {
    try {
      const response = await fetch(part.url);
      const buffer = await response.arrayBuffer();
      const makeAttachment = () => ({ color: new Color() });
      const loader = {
        newRegionAttachment: makeAttachment,
        newMeshAttachment: makeAttachment,
        newBoundingBoxAttachment: makeAttachment,
        newPathAttachment: makeAttachment,
        newPointAttachment: makeAttachment,
        newClippingAttachment: makeAttachment
      };
      const parser = new SkeletonBinary(loader as never);
      const data = parser.readSkeletonData(new Uint8Array(buffer));
      const animations = data.animations.map((animation) => animation.name);
      const durations = Object.fromEntries(
        data.animations.map((animation) => [
          animation.name,
          animation.duration
        ])
      );
      setDraftDiagnostics(validateActionSet(animations, durations));
    } catch {
      setDraftDiagnostics({
        status: "invalid",
        title: "该文件不能驱动模型运动",
        message: "无法读取骨骼动画数据，请重新导入正确的 .skel 文件。",
        missing: []
      });
    }
  }

  async function createPetFromSpine() {
    if (
      !draftParts.skeleton ||
      !draftParts.atlas ||
      !draftParts.texture ||
      creating ||
      draftDiagnostics?.status === "invalid"
    ) {
      return;
    }

    setCreating(true);
    try {
      const result = await window.deskPet.createPetFromSpine(
        draftId,
        {
          skeleton: draftParts.skeleton,
          atlas: draftParts.atlas,
          texture: draftParts.texture
        }
      );
      if (!result.ok) {
        window.alert(result.error || "创建桌宠失败。");
        return;
      }
      setDraftParts({});
      setDraftDiagnostics(null);
      await refresh();
      setMode("edit");
    } finally {
      setCreating(false);
    }
  }

  function saveSpineAnimations(animations: string[]) {
    if (!pet.spine) return;
    if (pet.spine.animations.join("|") === animations.join("|")) return;
    void savePet({
      ...pet,
      spine: {
        ...pet.spine,
        animations
      }
    });
  }

  function saveSkeletonInfo(info: {
    animations: string[];
    durations: Record<string, number>;
    boneMap: BoneRoleMap;
  }) {
    if (!pet.spine) return;
    const inferredBindings = { ...(pet.actionBindings || {}) };
    for (const action of universalActions) {
      if (!inferredBindings[action.id]) {
        const match = chooseBoundAnimation(
          action.id,
          undefined,
          info.animations,
          info.durations
        );
        if (match) inferredBindings[action.id] = match;
      }
    }
    setDiagnostics(
      validateActionSet(info.animations, info.durations, inferredBindings)
    );
    const bindingsChanged =
      JSON.stringify(inferredBindings) !==
      JSON.stringify(pet.actionBindings || {});
    const boneMapChanged =
      JSON.stringify(info.boneMap) !== JSON.stringify(pet.boneMap || {});
    if (bindingsChanged || boneMapChanged) {
      void savePet({
        ...pet,
        actionBindings: inferredBindings,
        boneMap: {
          ...(pet.boneMap || {}),
          ...info.boneMap
        },
        spine: {
          ...pet.spine,
          animations: info.animations,
          animationDurations: info.durations
        }
      });
    }
  }

  function updateActionBinding(actionId: string, animation: string) {
    const nextBindings = {
      ...(pet.actionBindings || {}),
      [actionId]: animation
    };
    void savePet({ ...pet, actionBindings: nextBindings });
    setDiagnostics(
      validateActionSet(
        pet.spine?.animations || [],
        pet.spine?.animationDurations || {},
        nextBindings
      )
    );
  }

  function previewBoundAction(actionId: string) {
    const animation =
      pet.actionBindings?.[actionId] ||
      chooseBoundAnimation(
        actionId,
        undefined,
        pet.spine?.animations || [],
        pet.spine?.animationDurations || {}
      );
    if (!animation) {
      window.alert("这个角色没有可预览的对应动画。");
      return;
    }
    setPreviewAction(animation);
    window.setTimeout(() => setPreviewAction(""), 3200);
  }

  function saveRenderConfig(patch: Partial<NonNullable<PetProfile["renderConfig"]>>) {
    setDraftRenderConfig((current) => ({
      ...withRenderConfigDefaults(current || pet.renderConfig),
      ...patch
    }));
    setRenderConfigDirty(true);
  }

  async function commitRenderConfig() {
    await savePet({
      ...pet,
      renderConfig: withRenderConfigDefaults({
        ...(pet.renderConfig || {}),
        ...activeRenderConfig
      })
    });
    setRenderConfigDirty(false);
  }

  async function toggleAdvancedSettings() {
    if (!showAdvanced) {
      setShowAdvanced(true);
      return;
    }
    if (renderConfigDirty) {
      const shouldSave = window.confirm(
        "高级设置有未保存的改动，是否保存后再退出？"
      );
      if (shouldSave) {
        await commitRenderConfig();
      } else {
        setDraftRenderConfig(withRenderConfigDefaults(pet.renderConfig));
        setRenderConfigDirty(false);
      }
    }
    setShowAdvanced(false);
  }

  function getAdvancedPreviewScale(config: Partial<PetRenderConfig>) {
    const visual = getVisualSize(config);
    const fitScale = Math.min(
      (stageSize.width - 80) / Math.max(1, visual.visualWidth),
      (stageSize.height - 80) / Math.max(1, visual.visualHeight)
    );
    return Math.max(0.12, Math.min(3.2, fitScale * 0.78));
  }

  function beginAdvancedDrag(
    event: React.PointerEvent,
    kind: "display" | "hitbox" | "hitboxMove" | "model"
  ) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = withRenderConfigDefaults(activeRenderConfig);
    const previewScale = getAdvancedPreviewScale(start);

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / previewScale;
      const dy = (moveEvent.clientY - startY) / previewScale;
      if (kind === "display") {
        saveRenderConfig({
          visualWidth: Math.max(40, Math.round(start.visualWidth + dx)),
          visualHeight: Math.max(60, Math.round(start.visualHeight + dy))
        });
      } else if (kind === "hitbox") {
        saveRenderConfig({
          hitboxWidth: Math.max(30, Math.round(start.hitboxWidth + dx)),
          hitboxHeight: Math.max(40, Math.round(start.hitboxHeight + dy))
        });
      } else if (kind === "hitboxMove") {
        saveRenderConfig({
          hitboxOffsetX: Math.round(start.hitboxOffsetX + dx),
          hitboxOffsetY: Math.round(start.hitboxOffsetY + dy)
        });
      } else {
        saveRenderConfig({
          offsetX: Math.round(start.offsetX + dx),
          offsetY: Math.round(start.offsetY + dy)
        });
      }
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function beginAdvancedResize(
    event: React.PointerEvent,
    mode: "display" | "hitbox",
    edge: AdvancedResizeEdge
  ) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = withRenderConfigDefaults(activeRenderConfig);
    const previewScale = getAdvancedPreviewScale(start);
    const handlesLeft = edge.includes("w");
    const handlesRight = edge.includes("e");
    const handlesTop = edge.includes("n");
    const handlesBottom = edge.includes("s");

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = Math.round((moveEvent.clientX - startX) / previewScale);
      const dy = Math.round((moveEvent.clientY - startY) / previewScale);
      const widthDelta = (handlesRight ? dx : 0) - (handlesLeft ? dx : 0);
      const heightDelta = (handlesBottom ? dy : 0) - (handlesTop ? dy : 0);

      if (mode === "hitbox") {
        const visual = getVisualSize(start);
        const hitboxWidth = Math.max(20, Math.round(start.hitboxWidth + widthDelta));
        const hitboxHeight = Math.max(
          30,
          Math.round(start.hitboxHeight + heightDelta)
        );
        const actualWidthDelta = hitboxWidth - start.hitboxWidth;
        const actualHeightDelta = hitboxHeight - start.hitboxHeight;
        saveRenderConfig({
          hitboxWidth,
          hitboxHeight,
          hitboxOffsetX: handlesLeft
            ? Math.round(start.hitboxOffsetX - actualWidthDelta)
            : start.hitboxOffsetX,
          hitboxOffsetY: handlesTop
            ? Math.round(start.hitboxOffsetY - actualHeightDelta)
            : start.hitboxOffsetY,
          visualWidth: visual.visualWidth,
          visualHeight: visual.visualHeight
        });
      } else {
        saveRenderConfig({
          visualWidth: Math.max(40, Math.round(start.visualWidth + widthDelta)),
          visualHeight: Math.max(60, Math.round(start.visualHeight + heightDelta))
        });
      }
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  const canCreate =
    Boolean(draftParts.skeleton) &&
    Boolean(draftParts.atlas) &&
    Boolean(draftParts.texture) &&
    draftDiagnostics?.status !== "invalid";
  const advancedScale = getAdvancedPreviewScale(activeRenderConfig);
  const advancedDisplayWidth =
    (activeRenderConfig.visualWidth || 104) * advancedScale;
  const advancedDisplayHeight =
    (activeRenderConfig.visualHeight || 134) * advancedScale;
  const advancedHitboxWidth = activeRenderConfig.hitboxWidth * advancedScale;
  const advancedHitboxHeight = activeRenderConfig.hitboxHeight * advancedScale;
  const advancedCenterX = stageSize.width / 2;
  const advancedCenterY = stageSize.height / 2;

  return (
    <div className="workshop-layout">
      <aside className="pet-list-panel">
        <div className="panel-heading">
          <Layers3 size={18} />
          <h3>角色列表</h3>
        </div>
        <div className="pet-list">
          {currentState.pets.map((item) => (
            <button
              className={
                mode === "edit" && item.id === pet.id
                  ? "pet-list-item pet-list-item--active"
                  : "pet-list-item"
              }
              key={item.id}
              type="button"
              onClick={async () => {
                if (item.id !== pet.id && renderConfigDirty) {
                  const shouldSave = window.confirm(
                    "高级设置有未保存的改动，是否保存后再切换角色？"
                  );
                  if (shouldSave) {
                    await commitRenderConfig();
                  } else {
                    setDraftRenderConfig(
                      withRenderConfigDefaults(pet.renderConfig)
                    );
                    setRenderConfigDirty(false);
                  }
                }
                await updateState({ activePetId: item.id });
                setMode("edit");
                setShowAdvanced(false);
              }}
            >
              <span className="pet-dot" style={{ background: item.accent }} />
              <div>
                <strong>{item.name}</strong>
                <span>{item.spine ? "Spine 角色" : "占位角色"}</span>
              </div>
              <span
                className={
                  currentState.summonedPetIds.includes(item.id)
                    ? "summoned-dot summoned-dot--active"
                    : "summoned-dot"
                }
                title={
                  currentState.summonedPetIds.includes(item.id)
                    ? "已在桌面召唤"
                    : "未召唤"
                }
              />
            </button>
          ))}
        </div>
        <button className="wide-secondary add-pet-button" type="button" onClick={startCreate}>
          <Plus size={17} />
          新增桌宠
        </button>
      </aside>

      <section className="pet-editor">
        <div className="editor-toolbar">
          <div>
            <span className="section-kicker">角色舞台</span>
            <h2>{mode === "create" ? "新增桌宠" : pet.name}</h2>
          </div>
          {mode === "edit" && (
            <div className="toolbar-buttons">
              <button
                className="toolbar-delete"
                type="button"
                style={{
                  color: "#fff",
                  background: "#d75d5d",
                  borderColor: "#d75d5d",
                  opacity: 1,
                  visibility: "visible"
                }}
                onClick={deletePet}
                disabled={state.pets.length <= 1}
              >
                <Trash2 size={16} />
                删除
              </button>
              <button
                className="primary-small"
                type="button"
                style={{
                  color: "#fff",
                  background: "#2f7df6",
                  borderColor: "#2f7df6",
                  opacity: 1,
                  visibility: "visible"
                }}
                onClick={() =>
                  showAdvanced ? commitRenderConfig() : savePet(pet)
                }
              >
                <Save size={16} />
                保存
              </button>
              <button
                className="advanced-settings-button"
                type="button"
                style={{
                  color: "#fff",
                  background: "#2b9a67",
                  borderColor: "#2b9a67",
                  opacity: 1,
                  visibility: "visible"
                }}
                onClick={toggleAdvancedSettings}
                aria-pressed={showAdvanced}
              >
                <SlidersHorizontal size={15} />
                {showAdvanced ? "完成高级设置" : "高级设置"}
              </button>
            </div>
          )}
        </div>

        <div
          ref={stageRef}
          className={
            mode === "create"
              ? "workshop-stage workshop-stage--empty"
              : "workshop-stage"
          }
        >
          <div className="workshop-platform" />
          {mode === "create" ? (
            <div className="workshop-empty-copy">
              <ImageIcon size={32} />
              <strong>等待导入新桌宠素材</strong>
              <span>请在右侧依次导入骨骼、图集和纹理文件</span>
            </div>
          ) : pet.spine ? (
            <SpinePet
              skelUrl={pet.spine.skelUrl}
              state="idle"
              fitRatio={showAdvanced ? 0.78 : 0.6}
              fitWidth={
                showAdvanced
                  ? advancedDisplayWidth
                  : undefined
              }
              fitHeight={
                showAdvanced
                  ? advancedDisplayHeight
                  : undefined
              }
              displayWidth={showAdvanced ? advancedDisplayWidth : undefined}
              displayHeight={showAdvanced ? advancedDisplayHeight : undefined}
              offsetX={
                showAdvanced
                  ? activeRenderConfig.offsetX * advancedScale
                  : -28 + activeRenderConfig.offsetX
              }
              offsetY={
                showAdvanced
                  ? activeRenderConfig.offsetY * advancedScale
                  : activeRenderConfig.offsetY
              }
              anchorBottom={false}
              normalizeBodySize={showAdvanced}
              className="workshop-spine-pet"
              onAnimations={saveSpineAnimations}
              onSkeletonInfo={saveSkeletonInfo}
              actionBindings={pet.actionBindings}
              actionOverride={previewAction}
              boneMap={pet.boneMap}
              fallback={
                <PetAvatar
                  primary={pet.accent}
                  secondary={pet.secondary}
                  size={150 * pet.scale}
                  state="idle"
                />
              }
            />
          ) : pet.avatarUrl ? (
            <img
              src={pet.avatarUrl}
              alt={pet.name}
              className="workshop-pet-image"
              style={{ transform: `scale(${pet.scale})` }}
            />
          ) : (
            <PetAvatar
              primary={pet.accent}
              secondary={pet.secondary}
              size={150 * pet.scale}
              state="idle"
            />
          )}
          {mode === "edit" && showAdvanced && (
            <div className="advanced-stage-editor">
              <div className="advanced-stage-label">高级设置中</div>
              {advancedMode === "position" && (
                <div
                  className="advanced-display-frame advanced-display-frame--guide"
                  style={{
                    left: advancedCenterX - advancedDisplayWidth / 2,
                    top: advancedCenterY - advancedDisplayHeight / 2,
                    width: advancedDisplayWidth,
                    height: advancedDisplayHeight
                  }}
                  onPointerDown={(event) => beginAdvancedDrag(event, "model")}
                >
                  <span className="advanced-frame-label">拖动角色位置</span>
                </div>
              )}
              {advancedMode === "display" && (
                <div
                  className="advanced-display-frame"
                  style={{
                    left: advancedCenterX - advancedDisplayWidth / 2,
                    top: advancedCenterY - advancedDisplayHeight / 2,
                    width: advancedDisplayWidth,
                    height: advancedDisplayHeight
                  }}
                >
                  <span className="advanced-frame-label">显示画面框</span>
                  {advancedResizeEdges.map((edge) => (
                    <span
                      className={`advanced-resize-edge advanced-resize-edge--${edge}`}
                      key={edge}
                      onPointerDown={(event) =>
                        beginAdvancedResize(event, "display", edge)
                      }
                    />
                  ))}
                </div>
              )}
              {advancedMode === "hitbox" && (
                <div
                  className="advanced-hitbox-frame"
                  style={{
                    left:
                      advancedCenterX -
                      advancedHitboxWidth / 2 +
                      activeRenderConfig.hitboxOffsetX * advancedScale,
                    top:
                      advancedCenterY -
                      advancedHitboxHeight / 2 +
                      activeRenderConfig.hitboxOffsetY * advancedScale,
                    width: advancedHitboxWidth,
                    height: advancedHitboxHeight
                  }}
                  onPointerDown={(event) =>
                    beginAdvancedDrag(event, "hitboxMove")
                  }
                >
                  <span className="advanced-frame-label">碰撞区域框</span>
                  {advancedResizeEdges.map((edge) => (
                    <span
                      className={`advanced-resize-edge advanced-resize-edge--${edge}`}
                      key={edge}
                      onPointerDown={(event) =>
                        beginAdvancedResize(event, "hitbox", edge)
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          {mode === "edit" && !showAdvanced && (
            <>
              <label className="stage-character-name">
                <span>角色名</span>
                <input
                  defaultValue={pet.name}
                  key={`${pet.id}-stage-name`}
                  onBlur={(event) =>
                    savePet({ ...pet, name: event.target.value })
                  }
                />
              </label>
              <label className="stage-character-size">
                <span>基础尺寸</span>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.05"
                  value={pet.scale}
                  onChange={(event) =>
                    savePet({ ...pet, scale: Number(event.target.value) })
                  }
                />
                <strong>{pet.scale.toFixed(2)}x</strong>
              </label>
            </>
          )}
        </div>

        {mode === "edit" && (
          <div className="editor-fields editor-fields--compact">
            {showAdvanced ? (
              <>
                <div className="advanced-mode-tabs">
                  <button
                    className={
                      advancedMode === "position"
                        ? "advanced-mode-button advanced-mode-button--active"
                        : "advanced-mode-button"
                    }
                    type="button"
                    onClick={() => setAdvancedMode("position")}
                  >
                    角色位置调试
                  </button>
                  <button
                    className={
                      advancedMode === "hitbox"
                        ? "advanced-mode-button advanced-mode-button--active"
                        : "advanced-mode-button"
                    }
                    type="button"
                    onClick={() => setAdvancedMode("hitbox")}
                  >
                    碰撞区域调试
                  </button>
                  <button
                    className={
                      advancedMode === "display"
                        ? "advanced-mode-button advanced-mode-button--active"
                        : "advanced-mode-button"
                    }
                    type="button"
                    onClick={() => setAdvancedMode("display")}
                  >
                    显示画面调试
                  </button>
                </div>
                <div className="advanced-slider-grid">
                  {advancedMode === "position" && (
                    <>
                      <label className="range-field">
                        <span>水平位置</span>
                        <input
                          type="range"
                          min="-200"
                          max="200"
                          step="2"
                          value={activeRenderConfig.offsetX}
                          onChange={(event) =>
                            saveRenderConfig({
                              offsetX: Number(event.target.value)
                            })
                          }
                        />
                        <strong>{activeRenderConfig.offsetX}</strong>
                      </label>
                      <label className="range-field">
                        <span>垂直位置</span>
                        <input
                          type="range"
                          min="-200"
                          max="200"
                          step="2"
                          value={activeRenderConfig.offsetY}
                          onChange={(event) =>
                            saveRenderConfig({
                              offsetY: Number(event.target.value)
                            })
                          }
                        />
                        <strong>{activeRenderConfig.offsetY}</strong>
                      </label>
                    </>
                  )}
                  {advancedMode === "hitbox" && (
                    <>
                      <label className="range-field">
                        <span>碰撞宽度</span>
                        <input
                          type="range"
                          min="40"
                          max="300"
                          step="2"
                          value={activeRenderConfig.hitboxWidth}
                          onChange={(event) =>
                            saveRenderConfig({
                              hitboxWidth: Number(event.target.value)
                            })
                          }
                        />
                        <strong>{activeRenderConfig.hitboxWidth}</strong>
                      </label>
                      <label className="range-field">
                        <span>碰撞高度</span>
                        <input
                          type="range"
                          min="60"
                          max="420"
                          step="2"
                          value={activeRenderConfig.hitboxHeight}
                          onChange={(event) =>
                            saveRenderConfig({
                              hitboxHeight: Number(event.target.value)
                            })
                          }
                        />
                        <strong>{activeRenderConfig.hitboxHeight}</strong>
                      </label>
                      <label className="range-field">
                        <span>水平偏移</span>
                        <input
                          type="range"
                          min="-200"
                          max="200"
                          step="2"
                          value={activeRenderConfig.hitboxOffsetX}
                          onChange={(event) =>
                            saveRenderConfig({
                              hitboxOffsetX: Number(event.target.value)
                            })
                          }
                        />
                        <strong>{activeRenderConfig.hitboxOffsetX}</strong>
                      </label>
                      <label className="range-field">
                        <span>垂直偏移</span>
                        <input
                          type="range"
                          min="-200"
                          max="200"
                          step="2"
                          value={activeRenderConfig.hitboxOffsetY}
                          onChange={(event) =>
                            saveRenderConfig({
                              hitboxOffsetY: Number(event.target.value)
                            })
                          }
                        />
                        <strong>{activeRenderConfig.hitboxOffsetY}</strong>
                      </label>
                    </>
                  )}
                  {advancedMode === "display" && (
                    <>
                      <label className="range-field">
                        <span>显示宽度</span>
                        <input
                          type="range"
                          min="40"
                          max="800"
                          step="2"
                          value={activeRenderConfig.visualWidth || 104}
                          onChange={(event) =>
                            saveRenderConfig({
                              visualWidth: Number(event.target.value)
                            })
                          }
                        />
                        <strong>{activeRenderConfig.visualWidth || 104}</strong>
                      </label>
                      <label className="range-field">
                        <span>显示高度</span>
                        <input
                          type="range"
                          min="60"
                          max="900"
                          step="2"
                          value={activeRenderConfig.visualHeight || 134}
                          onChange={(event) =>
                            saveRenderConfig({
                              visualHeight: Number(event.target.value)
                            })
                          }
                        />
                        <strong>{activeRenderConfig.visualHeight || 134}</strong>
                      </label>
                    </>
                  )}
                </div>
                <button
                  className="advanced-future-button"
                  type="button"
                  disabled
                >
                  创建平面图片角色（预留）
                </button>
              </>
            ) : (
              <>
                <div className="module-plugin-panel">
                  <div className="module-plugin-heading">
                    <Puzzle size={16} />
                    <strong>模组插件</strong>
                  </div>
                  <div className="module-plugin-list">
                    <div className="module-plugin-row">
                      <span className="module-plugin-name">
                        <Volume2 size={15} />
                        语音插件
                      </span>
                      <select
                        value={pet.modulePlugins?.voiceProfileId || ""}
                        onChange={(event) =>
                          saveModulePlugin({
                            voiceProfileId: event.target.value || undefined
                          })
                        }
                      >
                        <option value="">未绑定声音档案</option>
                        {(state.voiceProfiles || []).map((profile) => (
                          <option value={profile.id} key={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                      <span className="module-plugin-kind">声音档案</span>
                    </div>

                    <div className="module-plugin-row">
                      <span className="module-plugin-name">
                        <Bot size={15} />
                        AI 插件
                      </span>
                      <select
                        value={pet.modulePlugins?.aiModuleId || ""}
                        onChange={(event) =>
                          saveModulePlugin({
                            aiModuleId: event.target.value || undefined
                          })
                        }
                      >
                        <option value="">未绑定 AI 模块</option>
                        {(state.trainingProfiles || []).map((profile) => (
                          <option value={profile.id} key={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                      <span className="module-plugin-kind">AI 模块</span>
                    </div>

                    <div className="module-plugin-row module-plugin-row--bound">
                      <span className="module-plugin-name">
                        <Puzzle size={15} />
                        模组
                      </span>
                      <div
                        className="module-bound-selector"
                        onBlur={(event) => {
                          if (
                            !event.currentTarget.contains(event.relatedTarget)
                          ) {
                            setModulePickerOpen(false);
                          }
                        }}
                      >
                        <button
                          className="module-picker-toggle"
                          type="button"
                          onClick={() =>
                            setModulePickerOpen((current) => !current)
                          }
                        >
                          <Plus size={13} />
                          添加模组
                        </button>
                        <div className="module-bound-list">
                          {(pet.modulePlugins?.boundModuleIds || [])
                            .map((moduleId) =>
                              state.customModules.find(
                                (module) => module.id === moduleId
                              )
                            )
                            .filter(
                              (module) =>
                                Boolean(module) && module!.enabled !== false
                            )
                            .map((module) => (
                              <span className="module-bound-chip" key={module!.id}>
                                {module!.contextMenuLabel || module!.name}
                                <button
                                  type="button"
                                  onClick={() =>
                                    saveModulePlugin({
                                      boundModuleIds: (
                                        pet.modulePlugins?.boundModuleIds || []
                                      ).filter((id) => id !== module!.id)
                                    })
                                  }
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                        </div>
                        {modulePickerOpen && (
                          <div className="module-add-menu">
                            {(state.customModules || [])
                              .filter(
                                (module) =>
                                  module.enabled !== false &&
                                  !(
                                    pet.modulePlugins?.boundModuleIds || []
                                  ).includes(module.id)
                              )
                              .map((module) => (
                                <button
                                  type="button"
                                  key={module.id}
                                  onClick={() => {
                                    saveModulePlugin({
                                      boundModuleIds: [
                                        ...new Set([
                                          ...(pet.modulePlugins?.boundModuleIds ||
                                            []),
                                          module.id
                                        ])
                                      ]
                                    });
                                    setModulePickerOpen(false);
                                  }}
                                >
                                  <Plus size={13} />
                                  {module.contextMenuLabel || module.name}
                                </button>
                              ))}
                            {(state.customModules || []).filter(
                              (module) =>
                                module.enabled !== false &&
                                !(
                                  pet.modulePlugins?.boundModuleIds || []
                                ).includes(module.id)
                            ).length === 0 && (
                              <span className="empty-copy">
                                没有可添加的模组。
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="module-plugin-kind">右键菜单</span>
                    </div>

                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <aside className="asset-panel">
        <div className="panel-heading">
          <ScanLine size={18} />
          <h3>{mode === "create" ? "素材与动作" : "角色动作"}</h3>
        </div>

        {mode === "create" ? (
          <>
            <div className="spine-import-slots">
              {spineSlots.map((slot) => {
                const Icon = slot.icon;
                const part = draftParts[slot.kind];
                return (
                  <button
                    className={
                      part
                        ? "spine-import-slot spine-import-slot--ready"
                        : "spine-import-slot"
                    }
                    key={slot.kind}
                    type="button"
                    onClick={() => selectPart(slot.kind)}
                  >
                    <span className="spine-import-icon">
                      {part ? <CheckCircle2 size={19} /> : <Icon size={19} />}
                    </span>
                    <span className="spine-import-copy">
                      <strong>{slot.label}</strong>
                      <small>{part ? part.name : slot.hint}</small>
                    </span>
                    <Upload size={15} />
                  </button>
                );
              })}
            </div>

            {draftDiagnostics && (
              <div
                className={`spine-diagnostics spine-diagnostics--${draftDiagnostics.status}`}
              >
                <strong>{draftDiagnostics.title}</strong>
                <p>{draftDiagnostics.message}</p>
              </div>
            )}

            <button
              className="primary-small wide-secondary create-spine-pet"
              type="button"
              disabled={!canCreate || creating}
              onClick={createPetFromSpine}
            >
              <Plus size={17} />
              {creating ? "正在创建..." : "创建桌宠"}
            </button>

            <div className="asset-note">
              <strong>创建规则</strong>
              <p>
                依次导入 `.skel`、`.atlas` 和纹理图片。图片会自动转换为图集要求的尺寸。
              </p>
            </div>
          </>
        ) : pet.spine ? (
          <>
            <div className="spine-summary">
              <strong>当前角色：Spine 3.8</strong>
              <span>
                {pet.spine.animations.join(" / ") || "正在读取动画..."}
              </span>
            </div>
            {diagnostics && (
              <div
                className={`spine-diagnostics spine-diagnostics--${diagnostics.status}`}
              >
                <strong>{diagnostics.title}</strong>
                <p>{diagnostics.message}</p>
              </div>
            )}
            <div className="action-preset-panel">
              <div className="panel-heading">
                <Layers3 size={17} />
                <h3>动作预设</h3>
              </div>
              <div className="action-preset-list">
                {universalActions.map((action) => (
                  <div className="action-preset-row" key={action.id}>
                    <div>
                      <strong>{action.label}</strong>
                      <span>{action.description}</span>
                    </div>
                    <select
                      value={pet.actionBindings?.[action.id] || ""}
                      onChange={(event) =>
                        updateActionBinding(action.id, event.target.value)
                      }
                    >
                      <option value="">通用动作</option>
                      {action.id === "walk" && (
                        <option value={FIRST_PET_LEG_WALK}>
                          {FIRST_PET_LEG_WALK_LABEL}
                        </option>
                      )}
                      {(pet.spine?.animations || []).map((animation) => (
                        <option value={animation} key={animation}>
                          {animation}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => previewBoundAction(action.id)}
                    >
                      播放
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="empty-copy">当前角色还没有可编辑的动作。</p>
        )}
      </aside>

      {false && showAdvanced && mode === "edit" && (
        <div className="advanced-settings-backdrop">
          <section className="advanced-settings-dialog">
            <div className="advanced-settings-header">
              <div>
                <span className="section-kicker">高级设置</span>
                <h2>{pet.name}</h2>
              </div>
              <button type="button" onClick={() => setShowAdvanced(false)}>
                关闭
              </button>
            </div>

            <div className="advanced-settings-grid">
              <label className="range-field">
                <span>显示宽度</span>
                <input
                  type="range"
                  min="160"
                  max="800"
                  step="10"
                  value={pet.renderConfig?.displayWidth || 260}
                  onChange={(event) =>
                    saveRenderConfig({
                      displayWidth: Number(event.target.value)
                    })
                  }
                />
                <strong>{pet.renderConfig?.displayWidth || 260}</strong>
              </label>
              <label className="range-field">
                <span>显示高度</span>
                <input
                  type="range"
                  min="180"
                  max="900"
                  step="10"
                  value={pet.renderConfig?.displayHeight || 320}
                  onChange={(event) =>
                    saveRenderConfig({
                      displayHeight: Number(event.target.value)
                    })
                  }
                />
                <strong>{pet.renderConfig?.displayHeight || 320}</strong>
              </label>
              <label className="range-field">
                <span>碰撞宽度</span>
                <input
                  type="range"
                  min="40"
                  max="300"
                  step="2"
                  value={pet.renderConfig?.hitboxWidth || 104}
                  onChange={(event) =>
                    saveRenderConfig({
                      hitboxWidth: Number(event.target.value)
                    })
                  }
                />
                <strong>{pet.renderConfig?.hitboxWidth || 104}</strong>
              </label>
              <label className="range-field">
                <span>碰撞高度</span>
                <input
                  type="range"
                  min="60"
                  max="420"
                  step="2"
                  value={pet.renderConfig?.hitboxHeight || 134}
                  onChange={(event) =>
                    saveRenderConfig({
                      hitboxHeight: Number(event.target.value)
                    })
                  }
                />
                <strong>{pet.renderConfig?.hitboxHeight || 134}</strong>
              </label>
              <label className="range-field">
                <span>水平偏移</span>
                <input
                  type="range"
                  min="-200"
                  max="200"
                  step="2"
                  value={pet.renderConfig?.offsetX || 0}
                  onChange={(event) =>
                    saveRenderConfig({
                      offsetX: Number(event.target.value)
                    })
                  }
                />
                <strong>{pet.renderConfig?.offsetX || 0}</strong>
              </label>
              <label className="range-field">
                <span>垂直偏移</span>
                <input
                  type="range"
                  min="-200"
                  max="200"
                  step="2"
                  value={pet.renderConfig?.offsetY || 0}
                  onChange={(event) =>
                    saveRenderConfig({
                      offsetY: Number(event.target.value)
                    })
                  }
                />
                <strong>{pet.renderConfig?.offsetY || 0}</strong>
              </label>
            </div>

            <div className="advanced-settings-actions">
              <button
                type="button"
                onClick={() =>
                  saveRenderConfig({
                    displayWidth: 900,
                    displayHeight: 760,
                    hitboxWidth: 104,
                    hitboxHeight: 134,
                    offsetX: 0,
                    offsetY: 0
                  })
                }
              >
                自动检测并恢复推荐值
              </button>
              <button
                className="advanced-future-button"
                type="button"
                disabled
                title="后续用于上传整张立绘并自动抠图"
              >
                创建平面图片角色（预留）
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
