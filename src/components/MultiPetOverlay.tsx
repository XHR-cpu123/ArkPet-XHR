import { MessageCircle, Mic, Moon, Power, Puzzle, Send, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent
} from "react";
import { clamp } from "../lib/format";
import { makeId } from "../lib/id";
import { getVisualSize } from "../lib/renderConfig";
import type {
  AppSettings,
  AppState,
  DisplayMetrics,
  PetProfile
} from "../types";
import { PetAvatar } from "./PetAvatar";
import { SpinePet } from "./SpinePet";

type EntitySnapshot = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hitboxOffsetX: number;
  hitboxOffsetY: number;
  vx: number;
  vy: number;
  direction: 1 | -1;
  directionY: 1 | -1;
  passUntil: number;
  zIndex: number;
  menu?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type PhysicsState = EntitySnapshot & {
  dragging: boolean;
  grounded: boolean;
  dragOffsetX: number;
  dragOffsetY: number;
  lastPointerX: number;
  lastPointerY: number;
  lastPointerAt: number;
  nextIdleAt: number;
  nextJumpAt: number;
  idleUntil: number;
  thrown: boolean;
  supportY: number | null;
  supportLeft: number | null;
  supportRight: number | null;
  supportId: string | null;
  supportGraceUntil: number;
  nextDirectionAt: number;
  pendingJumpAt: number;
  pendingJumpVx: number;
  pendingJumpVy: number;
};

type DesktopIconRect = {
  id?: string;
  name: string;
  foodPath: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type EntityProps = {
  pet: PetProfile;
  overlaySettings: AppSettings["overlay"];
  metrics: DisplayMetrics;
  registry: MutableRefObject<Map<string, EntitySnapshot>>;
  canInteract: boolean;
  dialogModule?: AppState["customModules"][number];
  customModules: AppState["customModules"];
  voiceProfiles: AppState["voiceProfiles"];
  desktopIcons: DesktopIconRect[];
  iconSteps: { x: number; y: number };
  onClimbPlatform: (platform: DesktopIconRect) => void;
  onFoodConsumed: (foodPath: string) => void;
  foodNotice?: string;
};

const BASE_WIDTH = 104;
const BASE_HEIGHT = 134;

function withDecayedHunger(state: AppState, now = Date.now()) {
  const hungerModule = state.customModules.find(
    (module) => module.builtinType === "hunger-food"
  );
  const decayPerMinute = Math.max(
    0,
    Number(hungerModule?.hungerDecayPerMinute ?? 1)
  );
  let changed = false;
  const pets = state.pets.map((pet) => {
    if (
      hungerModule?.enabled === false ||
      !(pet.modulePlugins?.boundModuleIds || []).includes(
        hungerModule?.id || ""
      )
    ) {
      return pet;
    }
    const lastUpdated = new Date(
      pet.hungerUpdatedAt || pet.createdAt || now
    ).getTime();
    const elapsedMinutes = Number.isFinite(lastUpdated)
      ? Math.max(0, (now - lastUpdated) / 60000)
      : 0;
    if (elapsedMinutes < 0.05 || decayPerMinute <= 0) return pet;
    changed = true;
    return {
      ...pet,
      hunger: clamp(
        Number(pet.hunger ?? 100) - elapsedMinutes * decayPerMinute,
        0,
        100
      ),
      hungerUpdatedAt: new Date(now).toISOString()
    };
  });
  return changed ? { ...state, pets } : state;
}

function buildSupportSurfaces(icons: DesktopIconRect[]) {
  return [...icons].sort(
    (left, right) => left.y - right.y || left.x - right.x
  );
}

export function MultiPetOverlay() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const appStateRef = useRef<AppState | null>(null);
  const [overlaySettings, setOverlaySettings] =
    useState<AppSettings["overlay"] | null>(null);
  const [metrics, setMetrics] = useState<DisplayMetrics | null>(null);
  const [desktopIcons, setDesktopIcons] = useState<DesktopIconRect[]>([]);
  const [climbPlatforms, setClimbPlatforms] = useState<DesktopIconRect[]>([]);
  const [foodDropNotice, setFoodDropNotice] = useState<
    Record<string, string>
  >({});
  const iconSteps = useMemo(() => {
    const estimate = (values: number[], fallback: number) => {
      const unique = [...new Set(values.map((value) => Math.round(value)))]
        .sort((left, right) => left - right);
      const diffs = unique
        .slice(1)
        .map((value, index) => value - unique[index])
        .filter((value) => value > 8 && value < 500)
        .sort((left, right) => left - right);
      return diffs.length ? diffs[Math.floor(diffs.length / 2)] : fallback;
    };
    return {
      x: estimate(
        desktopIcons.map((icon) => icon.x),
        115
      ),
      y: estimate(
        desktopIcons.map((icon) => icon.y),
        147
      )
    };
  }, [desktopIcons]);
  const registry = useRef(new Map<string, EntitySnapshot>());

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const interactive = Boolean(
        target?.closest(
          ".pet-chat-bubble, .pet-voice-indicator, .overlay-menu, .multi-pet-hitbox"
        )
      );
      const hit = Array.from(registry.current.values()).some((entity) => {
        const inHitbox =
          event.clientX >= entity.x + entity.hitboxOffsetX &&
          event.clientX <=
            entity.x + entity.hitboxOffsetX + entity.width &&
          event.clientY >= entity.y + entity.hitboxOffsetY &&
          event.clientY <=
            entity.y + entity.hitboxOffsetY + entity.height;
        const inMenu =
          entity.menu &&
          event.clientX >= entity.menu.x &&
          event.clientX <= entity.menu.x + entity.menu.width &&
          event.clientY >= entity.menu.y &&
          event.clientY <= entity.menu.y + entity.menu.height;
        return inHitbox || inMenu;
      });
      const anyMenuOpen = Array.from(registry.current.values()).some(
        (entity) => Boolean(entity.menu)
      );
      window.deskPet.setOverlayMouseIgnore(!(hit || anyMenuOpen || interactive));
    }
    function handleMouseLeave() {
      window.deskPet.setOverlayMouseIgnore(true);
    }
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    window.deskPet.getState().then((state) => {
      if (!mounted) return;
      const nextState = withDecayedHunger(state);
      appStateRef.current = nextState;
      setAppState(nextState);
      setOverlaySettings(nextState.settings.overlay);
      if (nextState !== state) {
        void window.deskPet.updateState({ pets: nextState.pets });
      }
    });
    window.deskPet.getDisplayMetrics().then((nextMetrics) => {
      if (mounted) setMetrics(nextMetrics);
    });
    const refreshIcons = () => {
      void window.deskPet.getDesktopIcons().then((icons) => {
        if (mounted) setDesktopIcons(icons);
      });
    };
    refreshIcons();
    const iconTimer = window.setInterval(refreshIcons, 5000);
    const stateSubscription = window.deskPet.onStateChanged((state) => {
      appStateRef.current = state;
      setAppState(state);
    });
    const settingsSubscription =
      window.deskPet.onOverlaySettings(setOverlaySettings);
    const displaySubscription = window.deskPet.onDisplayChanged(setMetrics);
    return () => {
      mounted = false;
      stateSubscription();
      settingsSubscription();
      displaySubscription();
      window.clearInterval(iconTimer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const state = appStateRef.current;
      if (!state) return;
      const nextState = withDecayedHunger(state);
      if (nextState === state) return;
      appStateRef.current = nextState;
      setAppState(nextState);
      void window.deskPet.updateState({ pets: nextState.pets });
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const showNotice = (petId: string, text: string) => {
      setFoodDropNotice((current) => ({ ...current, [petId]: text }));
      window.setTimeout(() => {
        setFoodDropNotice((current) => {
          if (current[petId] !== text) return current;
          const next = { ...current };
          delete next[petId];
          return next;
        });
      }, 2600);
    };

    const unsubscribe = window.deskPet.onFoodDrop((payload) => {
      if (!payload.petId) return;
      showNotice(
        payload.petId,
        payload.ok
          ? "好吃！"
          : payload.error || "这个不能吃，只能吃 .food 文件。"
      );
      if (!payload.ok) return;
      if (payload.filePath) {
        setDesktopIcons((current) =>
          current.filter((icon) => icon.foodPath !== payload.filePath)
        );
      }
      void window.deskPet.getState().then((state) =>
        window.deskPet.updateState({
          pets: state.pets.map((pet) =>
            pet.id === payload.petId
              ? {
                  ...pet,
                  hunger: 100,
                  hungerUpdatedAt: new Date().toISOString()
                }
              : pet
          )
        })
      );
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    return window.deskPet.onClimbPlatformChanged((payload) => {
      setClimbPlatforms((current) => {
        if (payload.closed) {
          return current.filter((platform) => platform.id !== payload.id);
        }
        if (
          !Number.isFinite(payload.x) ||
          !Number.isFinite(payload.y) ||
          !Number.isFinite(payload.width) ||
          !Number.isFinite(payload.height)
        ) {
          return current;
        }
        const nextPlatform: DesktopIconRect = {
          id: payload.id,
          name: "攀爬落脚点",
          foodPath: "",
          x: Number(payload.x),
          y: Number(payload.y),
          width: Number(payload.width),
          height: Number(payload.height)
        };
        const existingIndex = current.findIndex(
          (platform) => platform.id === payload.id
        );
        if (existingIndex < 0) {
          return [...current.slice(-3), nextPlatform];
        }
        return current.map((platform, index) =>
          index === existingIndex ? nextPlatform : platform
        );
      });
    });
  }, []);

  if (!appState || !overlaySettings || !metrics) return null;
  const summonedPets = appState.summonedPetIds
    .map((petId) => appState.pets.find((pet) => pet.id === petId))
    .filter(Boolean) as PetProfile[];
  const dialogModule =
    appState.customModules.find(
      (item) => item.id === appState.settings.chat?.dialogModuleId
    ) || appState.customModules[0];
  const platforms = [...desktopIcons, ...climbPlatforms];

  return (
    <div className="overlay-root" style={{ pointerEvents: "none" }}>
      {summonedPets.map((pet) => (
        <MultiPetEntity
          key={pet.id}
          pet={pet}
          overlaySettings={overlaySettings}
          metrics={metrics}
          registry={registry}
          canInteract={summonedPets.length > 1}
          dialogModule={dialogModule}
          customModules={appState.customModules}
          voiceProfiles={appState.voiceProfiles}
          desktopIcons={platforms}
          iconSteps={iconSteps}
          foodNotice={foodDropNotice[pet.id]}
          onClimbPlatform={(platform) => {
            const timedPlatform = {
              ...platform,
              name: "攀爬落脚点",
              foodPath: ""
            };
            setClimbPlatforms((current) => [
              ...current.slice(-3),
              timedPlatform
            ]);
            window.setTimeout(() => {
              setClimbPlatforms((current) =>
                current.filter((item) =>
                  timedPlatform.id
                    ? item.id !== timedPlatform.id
                    : item !== timedPlatform
                )
              );
            }, 5200);
          }}
          onFoodConsumed={(foodPath) =>
            setDesktopIcons((current) =>
              current.filter((icon) => icon.foodPath !== foodPath)
            )
          }
        />
      ))}
    </div>
  );
}

function MultiPetEntity({
  pet,
  overlaySettings,
  metrics,
  registry,
  canInteract,
  dialogModule,
  customModules,
  voiceProfiles
  ,
  desktopIcons,
  iconSteps,
  onClimbPlatform,
  onFoodConsumed,
  foodNotice
}: EntityProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const visualRef = useRef<HTMLDivElement | null>(null);
  const hitboxRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuCloseTimer = useRef<number | null>(null);
  const [visualState, setVisualState] = useState<
    "idle" | "walk" | "fall" | "land" | "drag" | "sleep"
  >("idle");
  const [direction, setDirection] = useState<1 | -1>(1);
  const visualStateRef = useRef<
    "idle" | "walk" | "fall" | "land" | "drag" | "sleep"
  >("idle");
  const directionRef = useRef<1 | -1>(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [textChatOpen, setTextChatOpen] = useState(false);
  const [voicePhase, setVoicePhase] = useState<
    "idle" | "recording" | "transcribing" | "thinking" | "speaking"
  >("idle");
  const [voiceAudioSrc, setVoiceAudioSrc] = useState("");
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceSessionRef = useRef(0);
  const foodTargetIdRef = useRef("");
  const nextFoodSeekAtRef = useRef(0);
  const eatingFoodRef = useRef(false);
  const climbChainActiveRef = useRef(false);
  const climbChainStepsRef = useRef(0);
  const climbChainHeightRef = useRef(0);
  const climbApproachTargetIdRef = useRef("");
  const physicsDebugRef = useRef({
    frames: 0,
    total: 0,
    longFrames: 0,
    maxFrame: 0,
    stoppedEvents: 0,
    supportChanges: 0,
    supportDrops: 0,
    directionChanges: 0,
    lastSupportY: null as number | null,
    lastVx: 0,
    travelled: 0,
    since: performance.now()
  });
  const styleCacheRef = useRef({
    width: -1,
    height: -1,
    zIndex: -1,
    hitboxLeft: Number.NaN,
    hitboxTop: Number.NaN
  });
  const voiceProfile = voiceProfiles.find(
    (profile) => profile.id === pet.modulePlugins?.voiceProfileId
  );
  const canTextChat = Boolean(pet.modulePlugins?.aiModuleId);
  const canVoiceChat = Boolean(pet.modulePlugins?.voiceProfileId);
  const voiceHasAi = Boolean(
    pet.modulePlugins?.aiModuleId || voiceProfile?.defaultAiModuleId
  );
  const boundModules = customModules.filter((module) =>
    module.enabled !== false &&
    (pet.modulePlugins?.boundModuleIds || []).includes(module.id)
  );

  const climbModule = boundModules.find(
    (module) => module.builtinType === "climb-platforms"
  );
  const hungerModule = boundModules.find(
    (module) => module.builtinType === "hunger-food"
  );
  const hunger = clamp(Number(pet.hunger ?? 100), 0, 100);
  const foodTargets = useMemo(
    () => desktopIcons.filter((icon) => Boolean(icon.foodPath)),
    [desktopIcons]
  );
  const supportSurfaces = useMemo(
    () => buildSupportSurfaces(desktopIcons),
    [desktopIcons]
  );

  function setEntityVisual(next: typeof visualState) {
    if (visualStateRef.current === next) return;
    visualStateRef.current = next;
    setVisualState(next);
  }

  function setEntityDirection(next: 1 | -1) {
    if (directionRef.current === next) return;
    directionRef.current = next;
    setDirection(next);
  }

  async function triggerClimbPlatform() {
    if (!climbModule) return null;
    const result = await window.deskPet.triggerExternalModule(
      climbModule.id,
      pet.id,
      {
        x: physics.current.x + width / 2,
        y: physics.current.y + height,
        stepX: iconSteps.x,
        stepY: iconSteps.y
      }
    );
    if (
      result &&
      typeof result === "object" &&
      "x" in result &&
      "y" in result &&
      "width" in result &&
      "height" in result &&
      "id" in result
    ) {
      const platform: DesktopIconRect = {
        id: String(result.id || ""),
        name: "攀爬落脚点",
        foodPath: "",
        x: Number(result.x),
        y: Number(result.y),
        width: Number(result.width),
        height: Number(result.height)
      };
      onClimbPlatform(platform);
      return platform;
    }
    return null;
  }
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string }>>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [zIndex, setZIndex] = useState(10);
  const scale = (overlaySettings.scale || 1) * (pet.scale || 1);
  const width = (pet.renderConfig?.hitboxWidth || BASE_WIDTH) * scale;
  const height = (pet.renderConfig?.hitboxHeight || BASE_HEIGHT) * scale;
  const visual = getVisualSize(pet.renderConfig);
  const visualWidth = visual.visualWidth * scale;
  const visualHeight = visual.visualHeight * scale;
  const canvasWidth =
    Math.max(pet.renderConfig?.displayWidth || 260, visual.visualWidth) * scale;
  const canvasHeight =
    Math.max(pet.renderConfig?.displayHeight || 320, visual.visualHeight) * scale;
  const bounds = useMemo(
    () => ({
      left: metrics.workArea.x - metrics.bounds.x,
      right:
        metrics.workArea.x + metrics.workArea.width - metrics.bounds.x,
      floor: metrics.workArea.y + metrics.workArea.height - metrics.bounds.y
    }),
    [metrics]
  );
  const physics = useRef<PhysicsState>({
    id: pet.id,
    x: bounds.left + 80 + Math.random() * 180,
    y: bounds.floor - height,
    width,
    height,
    hitboxOffsetX: (pet.renderConfig?.hitboxOffsetX || 0) * scale,
    hitboxOffsetY: (pet.renderConfig?.hitboxOffsetY || 0) * scale,
    vx: 0,
    vy: 0,
    direction: 1,
    directionY: -1,
    passUntil: 0,
    zIndex: 10,
    dragging: false,
    grounded: true,
    dragOffsetX: 0,
    dragOffsetY: 0,
    lastPointerX: 0,
    lastPointerY: 0,
    lastPointerAt: 0,
    nextIdleAt: performance.now() + 3000,
    nextJumpAt: performance.now() + 1800,
    idleUntil: 0
    ,
    thrown: false,
    supportY: null,
    supportLeft: null,
    supportRight: null,
    supportId: null,
    supportGraceUntil: 0,
    nextDirectionAt: performance.now() + 4000,
    pendingJumpAt: 0,
    pendingJumpVx: 0,
    pendingJumpVy: 0
  });
  const configuredWalkSpeed = Number(overlaySettings.walkSpeed || 63);
  const effectiveWalkSpeed =
    63 * Math.pow(Math.max(1, configuredWalkSpeed) / 63, 1.35);
  const animationSpeed = Math.min(
    4.5,
    Math.max(0.3, Math.pow(Math.max(1, configuredWalkSpeed) / 77, 1.25))
  );
  const friction = clamp(overlaySettings.friction ?? 45, 0, 100) / 100;
  const wallBounce = clamp(overlaySettings.wallBounce ?? 55, 0, 100) / 100;
  const groundBounce =
    clamp(overlaySettings.groundBounce ?? 45, 0, 100) / 100;

  function sync() {
    const entity = physics.current;
    const styleCache = styleCacheRef.current;
    entity.width = width;
    entity.height = height;
    if (hostRef.current) {
      hostRef.current.style.transform = `translate3d(${entity.x}px, ${entity.y}px, 0)`;
      if (styleCache.width !== width) {
        hostRef.current.style.width = `${width}px`;
        styleCache.width = width;
      }
      if (styleCache.height !== height) {
        hostRef.current.style.height = `${height}px`;
        styleCache.height = height;
      }
      if (styleCache.zIndex !== zIndex) {
        hostRef.current.style.zIndex = String(zIndex);
        styleCache.zIndex = zIndex;
      }
    }
    if (hitboxRef.current) {
      entity.hitboxOffsetX = (pet.renderConfig?.hitboxOffsetX || 0) * scale;
      entity.hitboxOffsetY = (pet.renderConfig?.hitboxOffsetY || 0) * scale;
      if (styleCache.hitboxLeft !== entity.hitboxOffsetX) {
        hitboxRef.current.style.left = `${entity.hitboxOffsetX}px`;
        styleCache.hitboxLeft = entity.hitboxOffsetX;
      }
      if (styleCache.hitboxTop !== entity.hitboxOffsetY) {
        hitboxRef.current.style.top = `${entity.hitboxOffsetY}px`;
        styleCache.hitboxTop = entity.hitboxOffsetY;
      }
    }
    if (menuRef.current && menuOpen) {
      const menuWidth = menuRef.current.offsetWidth || 150;
      const menuHeight = menuRef.current.offsetHeight || 90;
      const rightX = entity.x + width + 10;
      const leftX = entity.x - menuWidth - 10;
      const x =
        rightX + menuWidth < window.innerWidth - 8
          ? rightX
          : clamp(leftX, 8, window.innerWidth - menuWidth - 8);
      const y = clamp(
        entity.y + height / 2 - menuHeight / 2,
        8,
        window.innerHeight - menuHeight - 8
      );
      menuRef.current.style.left = `${x}px`;
      menuRef.current.style.top = `${y}px`;
      entity.menu = {
        x,
        y,
        width: menuWidth,
        height: menuHeight
      };
    } else {
      entity.menu = undefined;
    }
    const snapshot = registry.current.get(pet.id);
    if (snapshot) {
      Object.assign(snapshot, entity);
    } else {
      registry.current.set(pet.id, { ...entity });
    }
  }

  function scheduleMenuClose() {
    if (menuCloseTimer.current !== null) {
      window.clearTimeout(menuCloseTimer.current);
    }
    menuCloseTimer.current = window.setTimeout(() => {
      setMenuOpen(false);
      menuCloseTimer.current = null;
    }, 260);
  }

  function queueJumpTo(
    entity: PhysicsState,
    target: DesktopIconRect,
    now: number
  ) {
    const gravity = Number(overlaySettings.gravity || 1800);
    const currentCenterX = entity.x + width / 2;
    const targetCenterX = target.x + target.width / 2;
    const heightDiff = Math.max(
      24,
      entity.y + height - target.y
    );
    const maximumHorizontalSpeed = 520;
    let jumpVy = -Math.sqrt(2 * gravity * heightDiff) * 1.03;
    let flightTime = Math.max(
      0.18,
      (2 * Math.abs(jumpVy)) / gravity
    );
    const desiredHorizontalSpeed =
      Math.abs(targetCenterX - currentCenterX) / flightTime;
    if (desiredHorizontalSpeed > maximumHorizontalSpeed) {
      flightTime =
        Math.abs(targetCenterX - currentCenterX) /
        maximumHorizontalSpeed;
      jumpVy = -Math.max(
        Math.abs(jumpVy),
        (gravity * flightTime) / 2
      );
    }
    const jumpVx = clamp(
      (targetCenterX - currentCenterX) / flightTime,
      -maximumHorizontalSpeed,
      maximumHorizontalSpeed
    );
    const targetDirection: 1 | -1 =
      targetCenterX >= currentCenterX ? 1 : -1;

    if (entity.direction !== targetDirection) {
      entity.direction = targetDirection;
      entity.vx = 0;
      entity.pendingJumpAt = now + 220;
      entity.pendingJumpVx = jumpVx;
      entity.pendingJumpVy = jumpVy;
      setEntityDirection(targetDirection);
      setEntityVisual("walk");
      return;
    }

    entity.vx = jumpVx;
    entity.vy = jumpVy;
    entity.grounded = false;
    entity.supportY = null;
    entity.supportLeft = null;
    entity.supportRight = null;
    entity.supportId = null;
    setEntityVisual("fall");
  }

  function chooseFoodTarget(now: number) {
    if (!hungerModule || hunger >= 100 || foodTargets.length === 0) {
      if (hunger >= 100) foodTargetIdRef.current = "";
      return null;
    }

    const activeTarget = foodTargets.find(
      (target) => target.foodPath === foodTargetIdRef.current
    );
    if (activeTarget) return activeTarget;

    const nearestTarget = () =>
      [...foodTargets].sort((left, right) => {
        const leftDistance = Math.hypot(
          left.x + left.width / 2 - (physics.current.x + width / 2),
          left.y - (physics.current.y + height)
        );
        const rightDistance = Math.hypot(
          right.x + right.width / 2 - (physics.current.x + width / 2),
          right.y - (physics.current.y + height)
        );
        return leftDistance - rightDistance;
      })[0] || null;

    if (hunger <= 30) {
      const target = nearestTarget();
      foodTargetIdRef.current = target?.foodPath || "";
      return target;
    }

    if (now < nextFoodSeekAtRef.current) return null;
    nextFoodSeekAtRef.current =
      now +
      Math.max(3, Number(hungerModule.foodSeekIntervalSeconds || 8)) *
        1000;
    const chance = clamp(10 + ((100 - hunger) / 70) * 80, 10, 90);
    if (Math.random() * 100 >= chance) return null;
    const target = nearestTarget();
    foodTargetIdRef.current = target?.foodPath || "";
    return target;
  }

  async function consumeFoodTarget(target: DesktopIconRect) {
    if (eatingFoodRef.current || !target.foodPath) return;
    eatingFoodRef.current = true;
    try {
      const result = await window.deskPet.consumeFood(target.foodPath);
      if (!result.ok) return;
      foodTargetIdRef.current = "";
      onFoodConsumed(target.foodPath);
      const state = await window.deskPet.getState();
      await window.deskPet.updateState({
        pets: state.pets.map((item) =>
          item.id === pet.id
            ? {
                ...item,
                hunger: 100,
                hungerUpdatedAt: new Date().toISOString()
              }
            : item
        )
      });
    } finally {
      eatingFoodRef.current = false;
    }
  }

  function handleFoodSeeking(
    entity: PhysicsState,
    target: DesktopIconRect,
    now: number
  ) {
    const currentCenterX = entity.x + width / 2;
    const currentBottom = entity.y + height;
    const targetCenterX = target.x + target.width / 2;
    const horizontalDistance = Math.abs(currentCenterX - targetCenterX);
    const verticalDistance = currentBottom - target.y;
    const aligned =
      horizontalDistance <= Math.max(20, target.width * 0.72);

    if (
      aligned &&
      Math.abs(verticalDistance) <= Math.max(20, target.height * 0.4)
    ) {
      void consumeFoodTarget(target);
      return;
    }

    if (verticalDistance > 12) {
      if (aligned && verticalDistance <= iconSteps.y * 2.1) {
        queueJumpTo(entity, target, now);
        return;
      }

      const intermediateTarget = desktopIcons
        .filter(
          (icon) =>
            icon.y < currentBottom - 8 &&
            icon.y > target.y + 8 &&
            currentBottom - icon.y <= iconSteps.y * 2.1 &&
            Math.abs(
              icon.x + icon.width / 2 - currentCenterX
            ) <=
              iconSteps.x * 2.1
        )
        .sort((left, right) => {
          const leftScore =
            Math.abs(left.y - target.y) +
            Math.abs(left.x + left.width / 2 - targetCenterX) * 0.35;
          const rightScore =
            Math.abs(right.y - target.y) +
            Math.abs(right.x + right.width / 2 - targetCenterX) * 0.35;
          return leftScore - rightScore;
        })[0];

      if (intermediateTarget) {
        queueJumpTo(entity, intermediateTarget, now);
        return;
      }

      void triggerClimbPlatform().then((platform) => {
        if (!platform || !entity.grounded || entity.dragging) return;
        queueJumpTo(entity, platform, performance.now());
      });
      return;
    }

    const direction: 1 | -1 =
      targetCenterX >= currentCenterX ? 1 : -1;
    entity.direction = direction;
    entity.vx = effectiveWalkSpeed * direction;
    entity.idleUntil = 0;
    entity.thrown = false;
    setEntityDirection(direction);
    setEntityVisual("walk");
  }

  function climbGridDistance(entity: PhysicsState, target: DesktopIconRect) {
    const horizontal = Math.abs(
      target.x + target.width / 2 - (entity.x + width / 2)
    ) / Math.max(1, iconSteps.x);
    const vertical = Math.max(
      0,
      entity.y + height - target.y
    ) / Math.max(1, iconSteps.y);
    return { horizontal, vertical, total: horizontal + vertical };
  }

  function beginClimbJump(
    entity: PhysicsState,
    target: DesktopIconRect,
    now: number
  ) {
    const distance = climbGridDistance(entity, target);
    climbChainActiveRef.current = true;
    climbChainStepsRef.current += 1;
    climbChainHeightRef.current += distance.vertical;
    entity.nextJumpAt = now + 350;
    queueJumpTo(entity, target, now);
  }

  function endClimbChain(entity: PhysicsState, now: number) {
    climbChainActiveRef.current = false;
    climbChainStepsRef.current = 0;
    climbChainHeightRef.current = 0;
    climbApproachTargetIdRef.current = "";
    const waitSeconds = Math.max(
      1,
      Number(climbModule?.climbJumpIntervalSeconds || 3)
    );
    entity.nextJumpAt = now + waitSeconds * 1000;
  }

  function currentClimbChance() {
    if (!climbModule) return 0;
    if (!climbChainActiveRef.current) {
      return Number(climbModule.climbJumpChance ?? 65);
    }
    const base = Number(climbModule.climbChainChance ?? 90);
    const chainDecay = Math.pow(
      Number(climbModule.climbChainDecay ?? 0.65),
      climbChainStepsRef.current
    );
    const heightDecay = Math.pow(
      Number(climbModule.climbHeightDecay ?? 0.8),
      climbChainHeightRef.current
    );
    return clamp(base * chainDecay * heightDecay, 0, 100);
  }

  function updateGroundedBehavior(
    entity: PhysicsState,
    now: number,
    wasFalling: boolean
  ) {
    if (entity.thrown) {
      if (friction >= 0.99 || Math.abs(entity.vx) < 4) {
        if (friction >= 0.99) entity.vx = 0;
        entity.thrown = false;
      }
    }

    if (entity.pendingJumpAt > 0 && now >= entity.pendingJumpAt) {
      entity.vx = entity.pendingJumpVx;
      entity.vy = entity.pendingJumpVy;
      entity.pendingJumpAt = 0;
      entity.grounded = false;
      entity.supportY = null;
      entity.supportLeft = null;
      entity.supportRight = null;
      entity.supportId = null;
      setEntityVisual("fall");
      return;
    }

    const foodTarget = chooseFoodTarget(now);
    if (foodTarget) {
      handleFoodSeeking(entity, foodTarget, now);
      return;
    }

    if (climbModule && entity.supportY !== null) {
      const currentCenterX = entity.x + width / 2;
      const upwardIcons = desktopIcons.filter(
        (icon) =>
          icon.y < entity.supportY! - 8 &&
          entity.supportY! - icon.y <= iconSteps.y * 2.1
      );
      const distanceTo = (target: DesktopIconRect) =>
        climbGridDistance(entity, target);
      const reachableTargets = upwardIcons.filter(
        (target) => distanceTo(target).total <= 2.05
      );
      const sameColumnTargets = reachableTargets
        .filter((target) => distanceTo(target).horizontal <= 0.55)
        .sort((left, right) => left.y - right.y);
      const reachableTarget = sameColumnTargets[0] ||
        [...reachableTargets].sort((left, right) => {
          const leftDistance = distanceTo(left);
          const rightDistance = distanceTo(right);
          return (
            leftDistance.total - rightDistance.total ||
            leftDistance.horizontal - rightDistance.horizontal
          );
        })[0];

      const approachTarget =
        upwardIcons.find(
          (icon) => icon.id === climbApproachTargetIdRef.current
        ) || null;
      if (approachTarget) {
        const approachDistance = distanceTo(approachTarget);
        if (approachDistance.total > 2.05) {
          const direction: 1 | -1 =
            approachTarget.x + approachTarget.width / 2 >= currentCenterX
              ? 1
              : -1;
          entity.direction = direction;
          entity.vx = effectiveWalkSpeed * direction;
          entity.nextJumpAt = now + 250;
          setEntityDirection(direction);
          setEntityVisual("walk");
          return;
        }
        climbApproachTargetIdRef.current = "";
        beginClimbJump(entity, approachTarget, now);
        return;
      }

      if (now >= entity.nextJumpAt) {
        const chance = currentClimbChance();
        if (Math.random() * 100 >= chance) {
          endClimbChain(entity, now);
        } else if (reachableTarget) {
          beginClimbJump(entity, reachableTarget, now);
          return;
        } else {
          const nextApproachTarget = [...upwardIcons].sort(
            (left, right) => {
              const leftDistance = distanceTo(left);
              const rightDistance = distanceTo(right);
              return (
                leftDistance.total - rightDistance.total ||
                leftDistance.horizontal - rightDistance.horizontal
              );
            }
          )[0];
          if (nextApproachTarget) {
            climbApproachTargetIdRef.current =
              nextApproachTarget.id ||
              `${nextApproachTarget.x}:${nextApproachTarget.y}`;
            const direction: 1 | -1 =
              nextApproachTarget.x + nextApproachTarget.width / 2 >=
              currentCenterX
                ? 1
                : -1;
            entity.direction = direction;
            entity.vx = effectiveWalkSpeed * direction;
            entity.nextJumpAt = now + 250;
            setEntityDirection(direction);
            setEntityVisual("walk");
            return;
          }

          if (
            Math.random() * 100 <
            Number(climbModule.climbChance ?? 55)
          ) {
            entity.nextJumpAt = now + 1000;
            void triggerClimbPlatform().then((platform) => {
              if (!entity.grounded || entity.dragging) return;
              if (platform) {
                beginClimbJump(entity, platform, performance.now());
                return;
              }
              endClimbChain(entity, performance.now());
            });
            return;
          }
          endClimbChain(entity, now);
        }
      }
    }

    const onDesktopPlatform =
      entity.supportY !== null && entity.supportY !== bounds.floor;
    if (!overlaySettings.idleActionEnabled || onDesktopPlatform) {
      entity.idleUntil = 0;
      if (Math.abs(entity.vx) < 4) {
        chooseRoamDirection(entity, now);
        entity.vx = effectiveWalkSpeed * entity.direction;
      }
      setEntityDirection(entity.direction);
      setEntityVisual("walk");
    } else if (entity.idleUntil > now) {
      entity.vx = 0;
      setEntityVisual("idle");
    } else if (now >= entity.nextIdleAt) {
      const seconds = Math.max(
        5,
        Number(overlaySettings.idleActionIntervalSeconds || 20)
      );
      entity.nextIdleAt = now + seconds * 1000;
      if (Math.random() * 100 < overlaySettings.idleActionChance) {
        entity.vx = 0;
        entity.idleUntil = now + 3200;
        setEntityVisual("idle");
      } else {
        chooseRoamDirection(entity, now);
        entity.vx = effectiveWalkSpeed * entity.direction;
        setEntityDirection(entity.direction);
        setEntityVisual("walk");
      }
    } else if (Math.abs(entity.vx) > 4) {
      setEntityVisual("walk");
    } else {
      chooseRoamDirection(entity, now);
      entity.vx = effectiveWalkSpeed * entity.direction;
      setEntityDirection(entity.direction);
      setEntityVisual("walk");
    }

    if (wasFalling) setEntityVisual("land");
  }

  function chooseRoamDirection(entity: PhysicsState, now: number) {
    if (now < entity.nextDirectionAt) return;
    entity.direction = Math.random() > 0.5 ? 1 : -1;
    entity.directionY = Math.random() > 0.5 ? 1 : -1;
    entity.nextDirectionAt =
      now + 3500 + Math.random() * 12000;
  }

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(0.04, (now - previous) / 1000);
      if (window.deskPet.physicsDebug) {
        const stats = physicsDebugRef.current;
        stats.frames += 1;
        stats.total += delta * 1000;
        if (delta > 0.025) stats.longFrames += 1;
        stats.maxFrame = Math.max(stats.maxFrame, delta * 1000);
        if (
          stats.lastSupportY !== null &&
          stats.lastSupportY !== bounds.floor &&
          physics.current.supportY === null
        ) {
          stats.supportDrops += 1;
        }
        if (stats.lastSupportY !== physics.current.supportY) {
          stats.lastSupportY = physics.current.supportY;
          stats.supportChanges += 1;
        }
        if (
          stats.lastVx !== 0 &&
          physics.current.vx !== 0 &&
          Math.sign(stats.lastVx) !== Math.sign(physics.current.vx)
        ) {
          stats.directionChanges += 1;
        }
        stats.lastVx = physics.current.vx;
        stats.travelled += Math.abs(physics.current.vx * delta);
        if (
          visualStateRef.current === "walk" &&
          Math.abs(physics.current.vx) < 1
        ) {
          stats.stoppedEvents += 1;
        }
        if (stats.frames >= 180) {
          window.deskPet.debugPhysicsLog(
            `[physics-debug] avg=${(
              stats.total / stats.frames
            ).toFixed(2)}ms long=${stats.longFrames} max=${stats.maxFrame.toFixed(
              2
            )}ms support=${String(
              physics.current.supportY
            )} platform=${String(
              physics.current.supportY !== null &&
                physics.current.supportY !== bounds.floor
            )} left=${String(physics.current.supportLeft)} right=${String(
              physics.current.supportRight
            )} floor=${bounds.floor.toFixed(1)} state=${
              visualStateRef.current
            } vx=${physics.current.vx.toFixed(
              1
            )} x=${physics.current.x.toFixed(1)} travelled=${stats.travelled.toFixed(
              1
            )} stops=${stats.stoppedEvents} supportChanges=${
              stats.supportChanges
            } supportDrops=${stats.supportDrops} directionChanges=${
              stats.directionChanges
            }`
          );
          stats.frames = 0;
          stats.total = 0;
          stats.longFrames = 0;
          stats.maxFrame = 0;
          stats.stoppedEvents = 0;
          stats.supportChanges = 0;
          stats.supportDrops = 0;
          stats.directionChanges = 0;
          stats.travelled = 0;
        }
      }
      previous = now;
      const entity = physics.current;

      if (entity.dragging) {
        setEntityVisual("drag");
      } else if (!overlaySettings.gravityLocked) {
        if (entity.idleUntil > now) {
          entity.idleUntil = 0;
        }
        if (now >= entity.nextJumpAt) {
          entity.vy = -Math.max(80, effectiveWalkSpeed * 1.15);
          entity.directionY = -1;
          entity.nextJumpAt =
            now +
            Math.max(1, Number(climbModule?.climbJumpIntervalSeconds || 3)) *
              1000;
          if (
            climbModule &&
            Math.random() * 100 <
              Number(climbModule.climbJumpChance ?? 65)
          ) {
            void triggerClimbPlatform();
          }
        }
        const freeFoodTarget = chooseFoodTarget(now);
        if (freeFoodTarget) {
          const targetCenterX =
            freeFoodTarget.x + freeFoodTarget.width / 2;
          const targetCenterY =
            freeFoodTarget.y + freeFoodTarget.height / 2;
          const entityCenterX = entity.x + width / 2;
          const entityCenterY = entity.y + height / 2;
          const dx = targetCenterX - entityCenterX;
          const dy = targetCenterY - entityCenterY;
          const distance = Math.hypot(dx, dy);
          if (distance <= Math.max(24, width * 0.8)) {
            entity.vx = 0;
            entity.vy = 0;
            void consumeFoodTarget(freeFoodTarget);
          } else {
            const speed = Math.max(effectiveWalkSpeed, 70);
            entity.vx = (dx / distance) * speed;
            entity.vy = (dy / distance) * speed;
            entity.direction = dx < 0 ? -1 : 1;
            entity.thrown = false;
            setEntityDirection(entity.direction);
          }
        } else if (entity.idleUntil > now) {
          entity.vx = 0;
          entity.vy = 0;
          setEntityVisual("idle");
        } else {
          chooseRoamDirection(entity, now);
          if (Math.abs(entity.vx) < 4 || Math.abs(entity.vy) < 4) {
            entity.vx = effectiveWalkSpeed * entity.direction;
            entity.vy = effectiveWalkSpeed * entity.directionY;
            entity.thrown = false;
          }
          if (entity.thrown) {
            const amount = Math.pow(friction, 1.45) * 520 * delta;
            const speed = Math.hypot(entity.vx, entity.vy);
            if (speed > 0) {
              const ratio = Math.max(0, speed - amount) / speed;
              entity.vx *= ratio;
              entity.vy *= ratio;
            }
            if (Math.hypot(entity.vx, entity.vy) < 20) {
              entity.vx = 0;
              entity.vy = 0;
              entity.thrown = false;
            }
          }
          entity.x += entity.vx * delta;
          entity.y += entity.vy * delta;
          if (entity.x < bounds.left) {
            entity.x = bounds.left;
            entity.vx =
              Math.abs(entity.vx) * (entity.thrown ? wallBounce : 1);
            entity.direction = 1;
          }
          const rightLimit = Math.max(bounds.left, bounds.right - width);
          if (entity.x > rightLimit) {
            entity.x = rightLimit;
            entity.vx =
              -Math.abs(entity.vx) * (entity.thrown ? wallBounce : 1);
            entity.direction = -1;
          }
          if (entity.y < 0) {
            entity.y = 0;
            entity.vy =
              Math.abs(entity.vy) * (entity.thrown ? groundBounce : 1);
            entity.directionY = 1;
          }
          const bottomLimit = bounds.floor - height;
          if (entity.y > bottomLimit) {
            entity.y = bottomLimit;
            entity.vy =
              -Math.abs(entity.vy) * (entity.thrown ? groundBounce : 1);
            entity.directionY = -1;
          }
          if (
            overlaySettings.idleActionEnabled &&
            now >= entity.nextIdleAt
          ) {
            const seconds = Math.max(
              5,
              Number(overlaySettings.idleActionIntervalSeconds || 20)
            );
            entity.nextIdleAt = now + seconds * 1000;
            if (Math.random() * 100 < overlaySettings.idleActionChance) {
              entity.vx = 0;
              entity.vy = 0;
              entity.idleUntil = now + 3200;
            }
          }
          setEntityDirection(entity.direction);
          setEntityVisual("walk");
        }
      } else {
        const previousBottom = entity.y + height;
        const wasGroundedBeforeStep = entity.grounded;
        if (entity.thrown && friction > 0) {
          const amount = Math.pow(friction, 1.45) * 520 * delta;
          if (Math.abs(entity.vx) <= amount) entity.vx = 0;
          else entity.vx -= Math.sign(entity.vx) * amount;
        }
        if (entity.grounded && entity.supportY !== null) {
          entity.vy = 0;
        } else {
          entity.vy += Number(overlaySettings.gravity || 1800) * delta;
        }
        entity.x += entity.vx * delta;
        entity.y += entity.vy * delta;

        if (entity.x < bounds.left) {
          entity.x = bounds.left;
          entity.vx =
            Math.abs(entity.vx) * (entity.thrown ? wallBounce : 1);
          entity.direction = 1;
          setEntityDirection(1);
        }
        const rightLimit = Math.max(bounds.left, bounds.right - width);
        if (entity.x > rightLimit) {
          entity.x = rightLimit;
          entity.vx =
            -Math.abs(entity.vx) * (entity.thrown ? wallBounce : 1);
          entity.direction = -1;
          setEntityDirection(-1);
        }

        let lockedSupportY: number | null = null;
        if (entity.grounded && entity.supportY !== null) {
          const trackedSurface =
            entity.supportId && entity.supportId !== "floor"
              ? supportSurfaces.find(
                  (surface) => surface.id === entity.supportId
                )
              : null;
          if (
            entity.supportId &&
            entity.supportId !== "floor" &&
            !trackedSurface
          ) {
            entity.grounded = false;
            entity.supportY = null;
            entity.supportLeft = null;
            entity.supportRight = null;
            entity.supportId = null;
            entity.supportGraceUntil = 0;
          } else {
            if (trackedSurface) {
              entity.y = trackedSurface.y - height;
              entity.supportY = trackedSurface.y;
              entity.supportLeft = trackedSurface.x;
              entity.supportRight = trackedSurface.x + trackedSurface.width;
              lockedSupportY = trackedSurface.y;
            }
            const footLeft = entity.x + width * 0.36;
            const footRight = entity.x + width * 0.64;
            const stillSupported =
              entity.supportLeft !== null &&
              entity.supportRight !== null &&
              footRight > entity.supportLeft + 2 &&
              footLeft < entity.supportRight - 2;
            if (!stillSupported && entity.supportY !== bounds.floor) {
              if (now < entity.supportGraceUntil) {
                lockedSupportY = entity.supportY;
              } else {
                entity.grounded = false;
                entity.supportY = null;
                entity.supportLeft = null;
                entity.supportRight = null;
                entity.supportId = null;
                entity.supportGraceUntil = 0;
              }
            } else if (stillSupported && entity.supportY !== bounds.floor) {
              lockedSupportY = entity.supportY;
              entity.supportGraceUntil = now + 140;
            }
          }
        }

        const newBottom = entity.y + height;
        const landingIcon =
          lockedSupportY === null && entity.vy >= 0
            ? supportSurfaces
                .filter(
                  (icon) =>
                    icon.y >= previousBottom - 6 &&
                    icon.y <= newBottom + 6 &&
                    entity.x + width * 0.64 > icon.x + 2 &&
                    entity.x + width * 0.36 <
                      icon.x + icon.width - 2
                )
                .sort((left, right) => left.y - right.y)[0]
            : undefined;
        const floorY = bounds.floor - height;
        if (lockedSupportY !== null) {
          entity.y = lockedSupportY - height;
          entity.vy = 0;
          entity.grounded = true;
          updateGroundedBehavior(entity, now, false);
        } else if (landingIcon && landingIcon.y <= bounds.floor) {
          const wasFalling =
            !wasGroundedBeforeStep && Math.abs(entity.vy) > 80;
          entity.y = landingIcon.y - height;
          entity.vy = 0;
          entity.grounded = true;
          entity.supportY = landingIcon.y;
          entity.supportLeft = landingIcon.x;
          entity.supportRight = landingIcon.x + landingIcon.width;
          entity.supportId = landingIcon.id || "";
          entity.supportGraceUntil = now + 140;
          updateGroundedBehavior(entity, now, wasFalling);
        } else if (entity.y >= floorY) {
          const impactSpeed = Math.abs(entity.vy);
          const wasFalling = entity.vy > 100;
          entity.y = floorY;
          if (entity.thrown && groundBounce > 0 && impactSpeed > 120) {
            entity.vy = -impactSpeed * groundBounce * 0.55;
            entity.grounded = false;
            setEntityVisual("fall");
          } else {
            entity.vy = 0;
            entity.grounded = true;
            entity.supportY = bounds.floor;
            entity.supportLeft = bounds.left;
            entity.supportRight = bounds.right;
            entity.supportId = "floor";
            entity.supportGraceUntil = 0;
            updateGroundedBehavior(entity, now, wasFalling);
          }
        } else {
          entity.grounded = false;
          if (entity.vy > 80) setEntityVisual("fall");
        }

        if (canInteract) {
          for (const other of registry.current.values()) {
            if (other.id === entity.id) continue;
            if (
              entity.passUntil > now ||
              other.passUntil > now ||
              !rectanglesOverlap(entity, other)
            ) {
              continue;
            }
            const pass =
              Math.random() * 100 < overlaySettings.passThroughChance;
            if (pass) {
              entity.passUntil = now + 650;
              other.passUntil = now + 650;
              setZIndex(20 + Math.floor(Math.random() * 20));
            } else {
              const directionSign = entity.x <= other.x ? -1 : 1;
              entity.vx = directionSign * Math.max(70, Math.abs(entity.vx));
              entity.direction = directionSign < 0 ? -1 : 1;
              setEntityDirection(entity.direction);
              entity.x += directionSign * 6;
            }
          }
        }
      }

      sync();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [
    bounds.left,
    bounds.right,
    bounds.floor,
    height,
    width,
    overlaySettings,
    canInteract,
    zIndex,
    desktopIcons,
    supportSurfaces,
    iconSteps.x,
    iconSteps.y,
    climbModule
  ]);

  useEffect(
    () => () => {
      registry.current.delete(pet.id);
    },
    [pet.id]
  );

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutsidePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        hitboxRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
    }
    window.addEventListener("pointerdown", handleOutsidePointer);
    return () => window.removeEventListener("pointerdown", handleOutsidePointer);
  }, [menuOpen]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const entity = physics.current;
    entity.dragging = true;
    entity.dragOffsetX = event.clientX - entity.x;
    entity.dragOffsetY = event.clientY - entity.y;
    entity.lastPointerX = event.clientX;
    entity.lastPointerY = event.clientY;
    entity.lastPointerAt = performance.now();
    entity.vx = 0;
    entity.vy = 0;
    climbChainActiveRef.current = false;
    climbChainStepsRef.current = 0;
    climbChainHeightRef.current = 0;
    climbApproachTargetIdRef.current = "";
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const entity = physics.current;
    if (!entity.dragging) return;
    const now = performance.now();
    const delta = Math.max(8, now - entity.lastPointerAt);
    entity.vx = ((event.clientX - entity.lastPointerX) / delta) * 720;
    entity.vy = ((event.clientY - entity.lastPointerY) / delta) * 720;
    entity.x = event.clientX - entity.dragOffsetX;
    entity.y = event.clientY - entity.dragOffsetY;
    entity.lastPointerX = event.clientX;
    entity.lastPointerY = event.clientY;
    entity.lastPointerAt = now;
    sync();
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const entity = physics.current;
    if (!entity.dragging) return;
    entity.dragging = false;
    const centerX = entity.x + width / 2;
    const top = entity.y;
    const bottom = entity.y + height;
    const droppedSurface = [...supportSurfaces]
      .filter(
        (surface) =>
          centerX >= surface.x &&
          centerX <= surface.x + surface.width &&
          bottom >= surface.y - 8 &&
          top <= surface.y + surface.height + 8
      )
      .sort(
        (left, right) =>
          Math.abs(left.y - bottom) - Math.abs(right.y - bottom)
      )[0];
    if (droppedSurface) {
      entity.x = clamp(
        entity.x,
        droppedSurface.x,
        Math.max(
          droppedSurface.x,
          droppedSurface.x + droppedSurface.width - width
        )
      );
      entity.y = droppedSurface.y - height;
      entity.vx = 0;
      entity.vy = 0;
      entity.grounded = true;
      entity.supportY = droppedSurface.y;
      entity.supportLeft = droppedSurface.x;
      entity.supportRight = droppedSurface.x + droppedSurface.width;
      entity.supportId = droppedSurface.id || null;
      entity.supportGraceUntil = performance.now() + 140;
      entity.thrown = false;
      setEntityVisual("land");
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    entity.vx = clamp(entity.vx, -1200, 1200);
    entity.vy = clamp(entity.vy, -1000, 1400);
    entity.grounded = false;
    entity.direction = entity.vx < 0 ? -1 : 1;
    entity.directionY = entity.vy < 0 ? -1 : 1;
    entity.thrown = true;
    setEntityDirection(entity.direction);
    setEntityVisual("fall");
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function sendChatMessage() {
    const content = chatDraft.trim();
    if (!content || chatBusy) return;
    const userMessage = {
      id: makeId("chat"),
      role: "user" as const,
      content
    };
    const assistantId = makeId("chat");
    setChatMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: "assistant", content: "" }
    ]);
    setChatDraft("");
    setChatBusy(true);
    const unsubscribe = window.deskPet.onChatStream(({ delta }) => {
      if (!delta) return;
      setChatMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: `${message.content}${delta}` }
            : message
        )
      );
    });
    try {
      const result = await window.deskPet.chatStream(
        [...chatMessages, userMessage].map((message) => ({
          role: message.role,
          content: message.content
        })),
        pet.modulePlugins?.aiModuleId
      );
      setChatMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: result.text }
            : message
        )
      );
    } finally {
      unsubscribe();
      setChatBusy(false);
    }
  }

  async function startVoiceChat() {
    const sessionId = voiceSessionRef.current + 1;
    voiceSessionRef.current = sessionId;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      voiceChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void processVoiceChat(sessionId);
      };
      voiceRecorderRef.current = recorder;
      recorder.start();
      setVoicePhase("recording");
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "无法打开麦克风。"
      );
      setVoicePhase("idle");
    }
  }

  function stopVoiceChat() {
    const recorder = voiceRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }

  async function processVoiceChat(sessionId: number) {
    if (sessionId !== voiceSessionRef.current) return;
    if (!voiceChunksRef.current.length) {
      setVoicePhase("idle");
      return;
    }
    try {
      const blob = new Blob(voiceChunksRef.current, {
        type: voiceChunksRef.current[0]?.type || "audio/webm"
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      setVoicePhase("transcribing");
      const transcription = await window.deskPet.voiceAgent.transcribe(bytes);
      if (sessionId !== voiceSessionRef.current) return;
      if (!transcription.ok || !transcription.text) {
        throw new Error(transcription.error || "没有识别到有效语音。");
      }
      setVoicePhase("thinking");
      const reply = await window.deskPet.voiceAgent.reply(transcription.text, {
        aiModuleId: pet.modulePlugins?.aiModuleId
      });
      if (sessionId !== voiceSessionRef.current) return;
      if (!reply.ok || !reply.text) {
        throw new Error(reply.warning || "对话模型没有返回内容。");
      }
      setVoicePhase("speaking");
      const audio = await window.deskPet.voiceAgent.speak(reply.text, {
        voiceProfileId: pet.modulePlugins?.voiceProfileId,
        speech: reply.speech
      });
      if (sessionId !== voiceSessionRef.current) return;
      if (audio.audioDataUrl) setVoiceAudioSrc(audio.audioDataUrl);
      setVoicePhase("recording");
      await startVoiceChat();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "语音对话失败。");
      setVoicePhase("idle");
    }
  }

  return (
    <div ref={hostRef} className="multi-pet-entity" style={{ zIndex }}>
      <div
        ref={visualRef}
        className={`multi-pet-visual ${
          direction < 0 ? "multi-pet-visual--left" : ""
        }`}
      >
        {pet.spine ? (
          <SpinePet
            skelUrl={pet.spine.skelUrl}
            state={visualState}
            actionBindings={pet.actionBindings}
            boneMap={pet.boneMap}
            fitWidth={visualWidth}
            fitHeight={visualHeight}
            displayWidth={canvasWidth}
            displayHeight={canvasHeight}
            offsetX={pet.renderConfig?.offsetX}
            offsetY={pet.renderConfig?.offsetY}
            anchorBottom
            normalizeBodySize
            speedMultiplier={animationSpeed}
            className="multi-pet-spine"
            fallback={
              <PetAvatar
                primary={pet.accent}
                secondary={pet.secondary}
                size={92 * scale}
                state={visualState}
                facing={direction < 0 ? "left" : "right"}
              />
            }
          />
        ) : (
          <PetAvatar
            primary={pet.accent}
            secondary={pet.secondary}
            size={92 * scale}
            state={visualState}
            facing={direction < 0 ? "left" : "right"}
          />
        )}
      </div>
      <div
        ref={hitboxRef}
        className="multi-pet-hitbox"
        data-pet-id={pet.id}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => window.deskPet.showControl()}
        onContextMenu={(event) => {
          event.preventDefault();
          window.deskPet.setOverlayMouseIgnore(false);
          setMenuOpen(true);
        }}
      />
      {foodNotice ? (
        <div className="pet-hunger-bubble pet-hunger-bubble--notice">
          {foodNotice}
        </div>
      ) : (
        hungerModule &&
        hunger < 30 && <div className="pet-hunger-bubble">饿……</div>
      )}
      {voicePhase !== "idle" && (
        <div className="pet-voice-indicator">
          <button
            type="button"
            onClick={() =>
              voicePhase === "recording" ? stopVoiceChat() : undefined
            }
          >
            <Mic size={15} />
            {voicePhase === "recording"
              ? "正在录入语音，点击结束"
              : voicePhase === "transcribing"
                ? "正在识别…"
                : voicePhase === "thinking"
                  ? "正在思考…"
                  : "正在说话…"}
          </button>
          <button
            type="button"
            title="关闭语音对话"
            onClick={() => {
              voiceSessionRef.current += 1;
              if (voicePhase === "recording") stopVoiceChat();
              setVoicePhase("idle");
              if (!textChatOpen) window.deskPet.setOverlayFocusable(false);
            }}
          >
            <X size={13} />
          </button>
        </div>
      )}
      {voiceAudioSrc && (
        <audio src={voiceAudioSrc} autoPlay onEnded={() => setVoiceAudioSrc("")} />
      )}
      {textChatOpen && (
        <section
          className="pet-chat-bubble"
          style={{
            background: dialogModule?.background || "#f7f5ef",
            backgroundImage: dialogModule?.backgroundImageUrl
              ? `url("${dialogModule.backgroundImageUrl}")`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            borderColor: dialogModule?.borderColor || "#d9d7d0",
            borderRadius: dialogModule?.borderRadius ?? 8,
            color: dialogModule?.textColor || "#172033",
            fontFamily:
              dialogModule?.fontFamily || "Microsoft YaHei UI"
          }}
        >
          <header>
            <strong>{pet.name}</strong>
            <button
              type="button"
              onClick={() => {
                setTextChatOpen(false);
                window.deskPet.setOverlayFocusable(false);
              }}
            >
              <X size={14} />
            </button>
          </header>
          <div className="pet-chat-messages">
            {chatMessages.slice(-6).map((message) => (
              <div
                className={`pet-chat-line pet-chat-line--${message.role}`}
                key={message.id}
                style={{
                  backgroundImage:
                    message.role === "user"
                      ? dialogModule?.userBubbleImageUrl
                        ? `url("${dialogModule.userBubbleImageUrl}")`
                        : undefined
                      : dialogModule?.assistantBubbleImageUrl
                        ? `url("${dialogModule.assistantBubbleImageUrl}")`
                        : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center"
                }}
              >
                {message.content}
              </div>
            ))}
            {chatMessages.length === 0 && (
              <span>说点什么吧。</span>
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendChatMessage();
            }}
          >
            <input
              value={chatDraft}
              onChange={(event) => setChatDraft(event.target.value)}
              placeholder="输入消息..."
            />
            <button type="submit" disabled={chatBusy || !chatDraft.trim()}>
              <Send size={14} />
            </button>
          </form>
        </section>
      )}
      {menuOpen && (
        <div
          ref={menuRef}
          className="overlay-menu multi-pet-menu"
          onMouseEnter={() => {
            if (menuCloseTimer.current !== null) {
              window.clearTimeout(menuCloseTimer.current);
            }
          }}
        >
          <button
            className="close-menu-button"
            type="button"
            onClick={() => setMenuOpen(false)}
          >
            <X size={16} />
            关闭
          </button>
          {hungerModule && (
            <div className="overlay-menu-status">
              <span>饥饿值</span>
              <strong>{Math.round(hunger)}%</strong>
            </div>
          )}
          {canTextChat && (
            <button
              type="button"
              onClick={() => {
                setTextChatOpen(true);
                voiceSessionRef.current += 1;
                if (voicePhase === "recording") stopVoiceChat();
                setVoicePhase("idle");
                window.deskPet.setOverlayFocusable(true);
                setMenuOpen(false);
              }}
            >
              <MessageCircle size={16} />
              文字对话
            </button>
          )}
          {canVoiceChat && (
            <button
              type="button"
              onClick={() => {
                if (!voiceHasAi) {
                  window.alert("请先给声音模块选择一个默认 AI 模块。");
                  return;
                }
                setTextChatOpen(false);
                window.deskPet.setOverlayFocusable(false);
                void startVoiceChat();
                setMenuOpen(false);
              }}
            >
              <Mic size={16} />
              语音对话
            </button>
          )}
          {boundModules
            .filter((module) => module.builtinType !== "hunger-food")
            .map((module) => (
              <button
                type="button"
                key={module.id}
                onClick={() => {
                  if (module.builtinType === "climb-platforms") {
                    void window.deskPet.triggerExternalModule(module.id, pet.id);
                  } else if (!module.entry) {
                    window.alert("这个内置对话框模组没有可打开的外部页面。");
                  } else {
                    void window.deskPet.openExternalModule(module.id);
                  }
                  setMenuOpen(false);
                }}
              >
                <Puzzle size={16} />
                {module.contextMenuLabel || module.name}
              </button>
            ))}
          <button
            type="button"
            onClick={() => {
              void window.deskPet.overlayCommand({ type: "rest", petId: pet.id });
              setMenuOpen(false);
            }}
          >
            <Moon size={16} />
            桌面休眠
          </button>
          <button
            type="button"
            onClick={() => {
              void window.deskPet.overlayCommand({ type: "sleep", petId: pet.id });
              setMenuOpen(false);
            }}
          >
            <Power size={16} />
            收回并休眠
          </button>
        </div>
      )}
    </div>
  );
}

function rectanglesOverlap(left: EntitySnapshot, right: EntitySnapshot) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}
