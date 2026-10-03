import { Spine } from "@pixi-spine/all-3.8";
import "@pixi/unsafe-eval";
import { Application, Assets } from "pixi.js";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  analyzeBoneMap,
  chooseBoundAnimation
} from "../lib/spineActions";
import {
  applyFirstPetLegWalk,
  FIRST_PET_LEG_WALK
} from "../lib/firstPetLegWalk";
import type { ActionBindings, BoneRoleMap } from "../types";

type SpineVisualState =
  | "idle"
  | "walk"
  | "fall"
  | "land"
  | "drag"
  | "windDown"
  | "sleep"
  | "excited";

type SpinePetProps = {
  skelUrl: string;
  state: SpineVisualState;
  className?: string;
  fallback?: ReactNode;
  fitWidth?: number;
  fitHeight?: number;
  fitRatio?: number;
  offsetX?: number;
  offsetY?: number;
  displayWidth?: number;
  displayHeight?: number;
  anchorBottom?: boolean;
  normalizeBodySize?: boolean;
  speedMultiplier?: number;
  actionBindings?: ActionBindings;
  actionOverride?: string;
  boneMap?: BoneRoleMap;
  onAnimations?: (animations: string[]) => void;
  onAnimationData?: (items: Array<{ name: string; duration: number }>) => void;
  onSkeletonInfo?: (info: {
    animations: string[];
    durations: Record<string, number>;
    boneMap: BoneRoleMap;
  }) => void;
};

const stateActionIds: Record<SpineVisualState, string> = {
  idle: "idle",
  walk: "walk",
  fall: "fall",
  land: "land",
  drag: "drag",
  windDown: "sleep",
  sleep: "sleep",
  excited: "idle"
};

function pickAnimation(
  available: string[],
  state: SpineVisualState,
  actionBindings?: ActionBindings,
  actionOverride?: string,
  durations?: Record<string, number>
): string | undefined {
  const isPlayable = (name: string) =>
    !durations || Number(durations[name] || 0) > 0;
  if (actionOverride) {
    const overrideMatch = available.find(
      (name) => name.toLowerCase() === actionOverride.toLowerCase()
    );
    if (overrideMatch) return overrideMatch;
  }
  const bound = chooseBoundAnimation(
    stateActionIds[state],
    actionBindings,
    available,
    durations
  );
  if (
    state === "walk" &&
    actionBindings?.walk === FIRST_PET_LEG_WALK
  ) {
    const baseCandidates = ["Idle", "Relax", "Special", "Default"];
    for (const candidate of baseCandidates) {
      const match = available.find(
        (name) => name.toLowerCase() === candidate.toLowerCase()
      );
      if (match && isPlayable(match)) return match;
    }
  }
  if (bound) return bound;
  const byState: Record<SpineVisualState, string[]> = {
    idle: ["Special", "Relax", "Sit", "Idle"],
    walk: ["Move", "Walk", "Idle", "Relax", "Default"],
    fall: ["Special", "Relax"],
    land: ["Special", "Relax"],
    drag: ["Interact", "Relax", "Special"],
    windDown: ["Relax", "Sit", "Sleep"],
    sleep: ["Sleep", "Relax", "Default"],
    excited: ["Interact", "Special", "Default"]
  };

  const lowerCaseNames = new Map(
    available.map((name) => [name.toLowerCase(), name])
  );
  for (const candidate of byState[state]) {
    const match = lowerCaseNames.get(candidate.toLowerCase());
    if (match && isPlayable(match)) return match;
  }
  return available[0];
}

export function SpinePet({
  skelUrl,
  state,
  className = "",
  fallback = null,
  fitWidth,
  fitHeight,
  fitRatio = 0.78,
  offsetX = 0,
  offsetY = 0,
  displayWidth,
  displayHeight,
  anchorBottom = false,
  normalizeBodySize = false,
  speedMultiplier = 0.82,
  actionBindings,
  actionOverride,
  boneMap,
  onAnimations,
  onAnimationData,
  onSkeletonInfo
}: SpinePetProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const spineRef = useRef<Spine | null>(null);
  const fitProfileRef = useRef<{
    width: number;
    height: number;
    scale: number;
  } | null>(null);
  const availableAnimationsRef = useRef<string[]>([]);
  const animationDurationsRef = useRef<Record<string, number>>({});
  const onAnimationsRef = useRef(onAnimations);
  const onAnimationDataRef = useRef(onAnimationData);
  const onSkeletonInfoRef = useRef(onSkeletonInfo);
  const boneMapRef = useRef(boneMap);
  const presetWalkRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onAnimationsRef.current = onAnimations;
    onAnimationDataRef.current = onAnimationData;
    onSkeletonInfoRef.current = onSkeletonInfo;
    boneMapRef.current = boneMap;
    presetWalkRef.current =
      state === "walk" && actionBindings?.walk === FIRST_PET_LEG_WALK;
  }, [onAnimations, onAnimationData, onSkeletonInfo, boneMap, state, actionBindings]);

  useEffect(() => {
    let disposed = false;
    let application: Application | null = null;
    setFailed(false);
    setReady(false);
    fitProfileRef.current = null;

    async function mount() {
      const host = hostRef.current;
      if (!host) return;

      try {
        application = new Application({
          resizeTo: host,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(2, window.devicePixelRatio || 1)
        });
        const canvas = application.view as unknown as HTMLCanvasElement;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
        host.appendChild(canvas);

        const resource = (await Assets.load(skelUrl)) as {
          spineData: ConstructorParameters<typeof Spine>[0];
        };
        if (disposed) return;

        const spine = new Spine(resource.spineData);
        spineRef.current = spine;
        const originalUpdateWorldTransform =
          spine.skeleton.updateWorldTransform.bind(spine.skeleton);
        spine.skeleton.updateWorldTransform = function () {
          if (presetWalkRef.current) {
            applyFirstPetLegWalk(
              spine.skeleton,
              boneMapRef.current,
              performance.now()
            );
          }
          return originalUpdateWorldTransform();
        } as typeof spine.skeleton.updateWorldTransform;
        application.stage.addChild(spine);

        const animationNames = resource.spineData.animations.map(
          (animation) => animation.name
        );
        const animationDurations = Object.fromEntries(
          resource.spineData.animations.map((animation) => [
            animation.name,
            animation.duration
          ])
        );
        const boneNames = resource.spineData.bones.map((bone) => bone.name);
        animationDurationsRef.current = animationDurations;
        spine.state.data.defaultMix = 0.32;
        try {
          spine.state.data.setMix("Move", "Relax", 0.38);
          spine.state.data.setMix("Relax", "Sleep", 0.55);
          spine.state.data.setMix("Sit", "Sleep", 0.55);
        } catch {
          // Some exported skeletons omit one of the transition clips.
        }
        availableAnimationsRef.current = animationNames;
        onAnimationsRef.current?.(animationNames);
        onAnimationDataRef.current?.(
          resource.spineData.animations.map((animation) => ({
            name: animation.name,
            duration: animation.duration
          }))
        );
        onSkeletonInfoRef.current?.({
          animations: animationNames,
          durations: animationDurations,
          boneMap: analyzeBoneMap(boneNames)
        });

        const fitToHost = () => {
          const width = Math.max(1, host.clientWidth);
          const height = Math.max(1, host.clientHeight);
          const desiredWidth = fitWidth || width;
          const desiredHeight = fitHeight || height;
          const bounds = spine.getLocalBounds();
          if (!bounds.width || !bounds.height) return;
          spine.skeleton.updateWorldTransform();
          const bones = spine.skeleton.bones;
          const headBone = bones.find((bone) =>
            /f_head(_[^ ]+)?$|^head$/i.test(bone.data.name)
          );
          const hipBone = bones.find((bone) =>
            /f_hip(_[^ ]+)?$|^hip$/i.test(bone.data.name)
          );
          const waistBone = bones.find((bone) =>
            /f_waist(_[^ ]+)?$|^waist$/i.test(bone.data.name)
          );
          const bodyHeight =
            headBone && hipBone
              ? Math.abs(headBone.worldY - hipBone.worldY)
              : headBone && waistBone
                ? Math.abs(headBone.worldY - waistBone.worldY)
              : 0;
          const boundsScale =
            Math.min(
              desiredWidth / bounds.width,
              desiredHeight / bounds.height
            ) * fitRatio;
          const bodyScale =
            bodyHeight > 1
              ? (desiredHeight * 0.104) / bodyHeight
              : boundsScale;
          const previousProfile = fitProfileRef.current;
          const dimensionsChanged =
            !previousProfile ||
            Math.abs(previousProfile.width - desiredWidth) > 0.5 ||
            Math.abs(previousProfile.height - desiredHeight) > 0.5;
          const scale = dimensionsChanged
            ? normalizeBodySize && bodyHeight > 1
              ? bodyScale
              : boundsScale
            : previousProfile.scale;
          fitProfileRef.current = {
            width: desiredWidth,
            height: desiredHeight,
            scale
          };
          spine.scale.set(scale);
          const x =
            (width - bounds.width * scale) / 2 -
            bounds.x * scale +
            offsetX;
          const y = anchorBottom
            ? height -
              2 -
              (bounds.y + bounds.height) * scale +
              offsetY
            : (height - bounds.height * scale) / 2 -
              bounds.y * scale +
              offsetY;
          spine.position.set(x, y);
        };

        const initialName = pickAnimation(
          animationNames,
          state,
          actionBindings,
          actionOverride,
          animationDurations
        );
        if (initialName) spine.state.setAnimation(0, initialName, true);

        fitToHost();
        requestAnimationFrame(fitToHost);
        const observer = new ResizeObserver(fitToHost);
        observer.observe(host);
        (application as Application & { spineResizeObserver?: ResizeObserver })
          .spineResizeObserver = observer;
        setReady(true);
      } catch (error) {
        const details =
          error instanceof Error ? error.stack || error.message : String(error);
        console.error("Spine load failed", details);
        if (!disposed) setFailed(true);
      }
    }

    mount();
    return () => {
      disposed = true;
      fitProfileRef.current = null;
      spineRef.current = null;
      availableAnimationsRef.current = [];
      const extension = application as
        | (Application & { spineResizeObserver?: ResizeObserver })
        | null;
      extension?.spineResizeObserver?.disconnect();
      application?.destroy(true, {
        children: true,
        texture: false,
        baseTexture: false
      });
    };
  }, [
    skelUrl,
    fitWidth,
    fitHeight,
    fitRatio,
    offsetX,
    offsetY,
    displayWidth,
    displayHeight,
    anchorBottom,
    normalizeBodySize
  ]);

  useEffect(() => {
    if (!ready || !spineRef.current) return;
    const name = pickAnimation(
      availableAnimationsRef.current,
      state,
      actionBindings,
      actionOverride,
      animationDurationsRef.current
    );
    if (!name) return;
    const spine = spineRef.current;
    spine.state.setAnimation(0, name, true);
    spine.state.timeScale =
      state === "walk"
        ? Math.min(4.5, Math.max(0.3, speedMultiplier))
        : state === "drag"
          ? 1.35
          : state === "windDown"
            ? 0.86
          : 1;
  }, [ready, state, speedMultiplier, actionBindings, actionOverride]);

  if (failed) return <>{fallback}</>;

  return (
    <div
      ref={hostRef}
      className={`spine-pet ${className}`}
      style={{
        opacity: ready ? 1 : 0,
        ...(displayWidth ? { width: displayWidth } : {}),
        ...(displayHeight ? { height: displayHeight } : {})
      }}
      aria-label="Spine 桌宠动画"
    />
  );
}
