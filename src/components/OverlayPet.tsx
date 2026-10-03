import {
  DoorOpen,
  Home,
  MessageCircle,
  Mic,
  Moon,
  MousePointerClick
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import { clamp } from "../lib/format";
import {
  appendWellbeingEvent,
  ensureWellbeing,
  simulateWellbeing
} from "../lib/wellbeing";
import {
  chooseBoundAnimation,
  universalActions
} from "../lib/spineActions";
import { getVisualSize } from "../lib/renderConfig";
import type {
  AppSettings,
  AppState,
  DisplayMetrics,
  OverlayCommand
} from "../types";
import { PetAvatar } from "./PetAvatar";
import { SpinePet } from "./SpinePet";

type VisualState =
  | "idle"
  | "walk"
  | "fall"
  | "land"
  | "drag"
  | "windDown"
  | "sleep";

type PhysicsState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: 1 | -1;
  directionY: 1 | -1;
  grounded: boolean;
  dragging: boolean;
  dragOffsetX: number;
  dragOffsetY: number;
  lastPointerX: number;
  lastPointerY: number;
  lastPointerAt: number;
  nextIdleCheckAt: number;
  idleUntil: number;
  landedUntil: number;
  thrown: boolean;
};

const BASE_WIDTH = 104;
const BASE_HEIGHT = 134;

export function OverlayPet() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const appStateRef = useRef<AppState | null>(null);
  const [overlaySettings, setOverlaySettings] =
    useState<AppSettings["overlay"] | null>(null);
  const [metrics, setMetrics] = useState<DisplayMetrics | null>(null);
  const [visualState, setVisualState] = useState<VisualState>("idle");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const petWrapRef = useRef<HTMLDivElement | null>(null);
  const [actionOverride, setActionOverride] = useState("");
  const [facing, setFacing] = useState<1 | -1>(1);
  const hoverRef = useRef(false);
  const ignoreRef = useRef(true);
  const menuRef = useRef<{ x: number; y: number } | null>(null);
  const menuElementRef = useRef<HTMLDivElement | null>(null);
  const hitboxElementRef = useRef<HTMLDivElement | null>(null);
  const menuCloseTimerRef = useRef<number | null>(null);
  const idleDurationRef = useRef(7000);
  const sleepTransitionTimerRef = useRef<number | null>(null);
  const sleepHideTimerRef = useRef<number | null>(null);
  const actionTimerRef = useRef<number | null>(null);
  const actionUntilRef = useRef(0);
  const facingRef = useRef<1 | -1>(1);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);
  const physics = useRef<PhysicsState>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    direction: 1,
    directionY: -1,
    grounded: true,
    dragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    lastPointerX: 0,
    lastPointerY: 0,
    lastPointerAt: 0,
    nextIdleCheckAt: 0,
    idleUntil: 0,
    landedUntil: 0,
    thrown: false
  });

  const activePetScale =
    appState?.pets.find((pet) => pet.id === appState.activePetId)?.scale || 1;
  const activeRenderConfig = appState?.pets.find(
    (pet) => pet.id === appState.activePetId
  )?.renderConfig;
  const displayWidth = activeRenderConfig?.displayWidth || 260;
  const displayHeight = activeRenderConfig?.displayHeight || 320;
  const scale = (overlaySettings?.scale || 1) * activePetScale;
  const hitboxOffsetX = (activeRenderConfig?.hitboxOffsetX || 0) * scale;
  const hitboxOffsetY = (activeRenderConfig?.hitboxOffsetY || 0) * scale;
  const petWidth = (activeRenderConfig?.hitboxWidth || BASE_WIDTH) * scale;
  const petHeight = (activeRenderConfig?.hitboxHeight || BASE_HEIGHT) * scale;
  const visual = getVisualSize(activeRenderConfig);
  const visualWidth = visual.visualWidth * scale;
  const visualHeight = visual.visualHeight * scale;
  const canvasWidth = Math.max(displayWidth, visual.visualWidth) * scale;
  const canvasHeight = Math.max(displayHeight, visual.visualHeight) * scale;

  function idleIntervalMs() {
    const seconds = Number(overlaySettings?.idleActionIntervalSeconds || 20);
    return Math.max(5, seconds) * 1000;
  }

  function idleActionChance() {
    return clamp(Number(overlaySettings?.idleActionChance ?? 50), 0, 100);
  }

  function walkSpeed() {
    const configured = Number(overlaySettings?.walkSpeed || 63);
    return 63 * Math.pow(Math.max(1, configured) / 63, 1.35);
  }

  function walkAnimationSpeed() {
    const configured = Number(overlaySettings?.walkSpeed || 63);
    return Math.min(
      4.5,
      Math.max(0.3, Math.pow(Math.max(1, configured) / 77, 1.25))
    );
  }

  function startWalking(
    now: number,
    direction?: 1 | -1,
    scheduleNextIdle = true
  ) {
    const pet = physics.current;
    if (direction) pet.direction = direction;
    pet.vx = walkSpeed() * pet.direction;
    pet.vy =
      overlaySettings?.gravityLocked === false
        ? walkSpeed() * pet.directionY
        : 0;
    pet.idleUntil = 0;
    pet.thrown = false;
    pet.grounded = overlaySettings?.gravityLocked !== false;
    if (scheduleNextIdle) pet.nextIdleCheckAt = now + idleIntervalMs();
    setVisualState("walk");
  }

  function startIdleAction(now: number) {
    const pet = physics.current;
    pet.vx = 0;
    pet.vy = 0;
    pet.idleUntil = now + Math.max(1000, idleDurationRef.current);
    pet.thrown = false;
    setVisualState("idle");
  }

  const activePet = useMemo(() => {
    if (!appState) return null;
    return appState.pets.find((pet) => pet.id === appState.activePetId) || appState.pets[0];
  }, [appState]);

  const bounds = useMemo(() => {
    if (!metrics) {
      return {
        left: 0,
        right: window.innerWidth,
        floor: window.innerHeight
      };
    }
    return {
      left: metrics.workArea.x - metrics.bounds.x,
      right: metrics.workArea.x + metrics.workArea.width - metrics.bounds.x,
      floor: metrics.workArea.y + metrics.workArea.height - metrics.bounds.y
    };
  }, [metrics]);

  function setMouseIgnore(ignore: boolean) {
    if (ignoreRef.current === ignore) return;
    ignoreRef.current = ignore;
    window.deskPet.setOverlayMouseIgnore(ignore);
  }

  function syncPetPosition() {
    const element = petWrapRef.current;
    if (!element) return;
    element.style.left = `${physics.current.x}px`;
    element.style.top = `${physics.current.y}px`;
    element.style.width = `${petWidth}px`;
    element.style.height = `${petHeight}px`;
    if (hitboxElementRef.current) {
      hitboxElementRef.current.style.left = `${hitboxOffsetX}px`;
      hitboxElementRef.current.style.top = `${hitboxOffsetY}px`;
      hitboxElementRef.current.style.width = `${petWidth}px`;
      hitboxElementRef.current.style.height = `${petHeight}px`;
    }
  }

  function syncFacing() {
    const direction = physics.current.direction;
    if (facingRef.current === direction) return;
    facingRef.current = direction;
    setFacing(direction);
  }

  function syncMenuPosition() {
    const element = menuElementRef.current;
    if (!element || !menuRef.current) return;
    const gap = 10;
    const menuWidth = element.offsetWidth || 178;
    const menuHeight = element.offsetHeight || 180;
    const pet = physics.current;
    const rightX = pet.x + petWidth + gap;
    const leftX = pet.x - menuWidth - gap;
    const centerX = clamp(
      pet.x + petWidth / 2 - menuWidth / 2,
      8,
      window.innerWidth - menuWidth - 8
    );
    const verticalCenter = clamp(
      pet.y + petHeight / 2 - menuHeight / 2,
      8,
      window.innerHeight - menuHeight - 8
    );
    const candidates = [
      { x: rightX, y: verticalCenter },
      { x: leftX, y: verticalCenter },
      { x: centerX, y: pet.y - menuHeight - gap },
      { x: centerX, y: pet.y + petHeight + gap }
    ];
    const fit = candidates.find(
      (candidate) =>
        candidate.x >= 8 &&
        candidate.y >= 8 &&
        candidate.x + menuWidth <= window.innerWidth - 8 &&
        candidate.y + menuHeight <= window.innerHeight - 8
    );
    const position = fit || {
      x: clamp(rightX, 8, window.innerWidth - menuWidth - 8),
      y: verticalCenter
    };
    menuRef.current = position;
    element.style.left = `${position.x}px`;
    element.style.top = `${position.y}px`;
  }

  function cancelMenuClose() {
    if (menuCloseTimerRef.current !== null) {
      window.clearTimeout(menuCloseTimerRef.current);
      menuCloseTimerRef.current = null;
    }
  }

  function scheduleMenuClose() {
    if (!menuRef.current) return;
    cancelMenuClose();
    menuCloseTimerRef.current = window.setTimeout(() => {
      menuRef.current = null;
      setMenu(null);
      menuCloseTimerRef.current = null;
    }, 260);
  }

  function clearSleepTimers() {
    if (sleepTransitionTimerRef.current !== null) {
      window.clearTimeout(sleepTransitionTimerRef.current);
      sleepTransitionTimerRef.current = null;
    }
    if (sleepHideTimerRef.current !== null) {
      window.clearTimeout(sleepHideTimerRef.current);
      sleepHideTimerRef.current = null;
    }
  }

  function clearActionTimer() {
    if (actionTimerRef.current !== null) {
      window.clearTimeout(actionTimerRef.current);
      actionTimerRef.current = null;
    }
    actionUntilRef.current = 0;
    setActionOverride("");
  }

  function pointHitsPet(x: number, y: number) {
    const pet = physics.current;
    const hitboxLeft = pet.x + hitboxOffsetX;
    const hitboxTop = pet.y + hitboxOffsetY;
    const currentMenu = menuRef.current;
    const hitsPet =
      x >= hitboxLeft &&
      x <= hitboxLeft + petWidth &&
      y >= hitboxTop &&
      y <= hitboxTop + petHeight;
    const hitsMenu =
      currentMenu &&
      x >= currentMenu.x &&
      x <= currentMenu.x + 178 &&
      y >= currentMenu.y &&
      y <= currentMenu.y + 118;
    return Boolean(hitsPet || hitsMenu);
  }

  function placeAtFloor(nextX?: number) {
    const x = clamp(
      nextX ?? (bounds.left + bounds.right) / 2 - petWidth / 2,
      bounds.left,
      Math.max(bounds.left, bounds.right - petWidth)
    );
    physics.current.x = x;
    physics.current.y = bounds.floor - petHeight;
    physics.current.vx = 0;
    physics.current.vy = 0;
    physics.current.directionY = -1;
    physics.current.grounded = true;
    physics.current.idleUntil = 0;
    physics.current.thrown = false;
    physics.current.nextIdleCheckAt = performance.now() + idleIntervalMs();
  }

  function handleCommand(command: OverlayCommand) {
    const pet = physics.current;
    if (command.type === "release") {
      clearSleepTimers();
      clearActionTimer();
      const origin = command.origin || {
        x: (bounds.left + bounds.right) / 2,
        y: 0
      };
      pet.x = clamp(
        origin.x - petWidth / 2,
        bounds.left,
        Math.max(bounds.left, bounds.right - petWidth)
      );
      pet.y = Math.max(0, origin.y - petHeight);
      pet.vx = 110 * (Math.random() > 0.5 ? 1 : -1);
      pet.vy = 80;
      pet.grounded = false;
      pet.idleUntil = 0;
      pet.thrown = true;
      pet.nextIdleCheckAt = performance.now() + idleIntervalMs();
      setVisualState("fall");
      setMouseIgnore(false);
    } else if (command.type === "wake" || command.type === "show") {
      clearSleepTimers();
      clearActionTimer();
      if (pet.y >= bounds.floor - petHeight - 2) placeAtFloor(pet.x);
      setVisualState("idle");
      setMenu(null);
      menuRef.current = null;
    } else if (command.type === "sleep") {
      clearSleepTimers();
      pet.vx = 0;
      pet.vy = 0;
      setVisualState("windDown");
      setMenu(null);
      menuRef.current = null;
      sleepTransitionTimerRef.current = window.setTimeout(() => {
        if (visualStateRef.current !== "windDown") return;
        setVisualState("sleep");
        sleepHideTimerRef.current = window.setTimeout(() => {
          if (visualStateRef.current === "sleep") window.deskPet.hideOverlay();
        }, 650);
      }, 1250);
    } else if (command.type === "rest") {
      clearSleepTimers();
      clearActionTimer();
      pet.vx = 0;
      pet.vy = 0;
      pet.idleUntil = 0;
      setVisualState("sleep");
      setMenu(null);
      menuRef.current = null;
    } else if (command.type === "home") {
      clearSleepTimers();
      clearActionTimer();
      placeAtFloor();
      startWalking(performance.now());
    } else if (command.type === "walk") {
      clearSleepTimers();
      clearActionTimer();
      pet.vx = walkSpeed() * pet.direction;
      pet.grounded = true;
      pet.idleUntil = 0;
      pet.thrown = false;
      pet.nextIdleCheckAt = performance.now() + idleIntervalMs();
      setVisualState("walk");
    } else if (command.type === "drop") {
      clearSleepTimers();
      clearActionTimer();
      pet.vy = 160;
      pet.grounded = false;
      pet.idleUntil = 0;
      setVisualState("fall");
    } else if (command.type === "action" && command.name) {
      clearSleepTimers();
      clearActionTimer();
      pet.vx = 0;
      pet.vy = 0;
      setActionOverride(command.name);
      actionUntilRef.current = performance.now() + 3200;
      actionTimerRef.current = window.setTimeout(() => {
        actionUntilRef.current = 0;
        setActionOverride("");
        actionTimerRef.current = null;
      }, 3200);
    }
    syncPetPosition();
  }

  const visualStateRef = useRef<VisualState>("idle");
  useEffect(() => {
    visualStateRef.current = visualState;
  }, [visualState]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const state = appStateRef.current;
      if (!state) return;

      const currentVisualState = visualStateRef.current;
      const mode =
        currentVisualState === "walk"
          ? "walking"
          : currentVisualState === "sleep"
            ? "sleeping"
            : currentVisualState === "windDown"
              ? "idle"
              : "idle";

      if (document.hidden && mode !== "sleeping") return;

      const now = Date.now();
      const currentWellbeing = ensureWellbeing(
        state.wellbeing,
        state.character
      );
      const elapsed = now - new Date(currentWellbeing.lastSimulatedAt).getTime();
      const nextWellbeing = simulateWellbeing(
        currentWellbeing,
        state.character,
        mode,
        elapsed,
        now
      );
      let finalWellbeing = nextWellbeing;
      if (currentWellbeing.energy > 20 && nextWellbeing.energy <= 20) {
        finalWellbeing = appendWellbeingEvent(
          nextWellbeing,
          "energy",
          "精力偏低，开始更容易想休息。",
          now
        );
      }
      window.deskPet.updateState({ wellbeing: finalWellbeing });
      if (
        currentWellbeing.energy > 0 &&
        nextWellbeing.energy <= 0 &&
        visualStateRef.current !== "sleep" &&
        visualStateRef.current !== "windDown"
      ) {
        void window.deskPet.overlayCommand({ type: "sleep" });
      }
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    window.deskPet.getState().then((state) => {
      if (!mounted) return;
      setAppState(state);
      setOverlaySettings(state.settings.overlay);
    });
    window.deskPet.getDisplayMetrics().then((nextMetrics) => {
      if (mounted) setMetrics(nextMetrics);
    });

    const unsubscribeState = window.deskPet.onStateChanged(setAppState);
    const unsubscribeSettings = window.deskPet.onOverlaySettings(setOverlaySettings);
    const unsubscribeDisplay = window.deskPet.onDisplayChanged(setMetrics);
    const unsubscribeCommands = window.deskPet.onOverlayCommand(handleCommand);

    return () => {
      mounted = false;
      unsubscribeState();
      unsubscribeSettings();
      unsubscribeDisplay();
      unsubscribeCommands();
    };
  }, [bounds.left, bounds.right, bounds.floor, petWidth, petHeight, overlaySettings?.walkSpeed]);

  useEffect(() => {
    menuRef.current = menu;
    if (menu) requestAnimationFrame(syncMenuPosition);
    if (!menu) {
      const hits = pointHitsPet(physics.current.x, physics.current.y);
      if (!hits) setMouseIgnore(true);
    }
  }, [menu]);

  useEffect(() => {
    if (!metrics || !appState) return;
    if (physics.current.x === 0 && physics.current.y === 0) {
      placeAtFloor();
      syncPetPosition();
      syncMenuPosition();
    }
  }, [metrics, appState, petWidth, petHeight, bounds.floor]);

  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      const hit = pointHitsPet(event.clientX, event.clientY);
      hoverRef.current = hit;
      if (menuRef.current) {
        if (hit) cancelMenuClose();
        else scheduleMenuClose();
      }
      if (!physics.current.dragging) setMouseIgnore(!hit);
    }

    function onMouseLeave() {
      hoverRef.current = false;
      if (!physics.current.dragging) setMouseIgnore(true);
    }

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseleave", onMouseLeave);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [petWidth, petHeight]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      const delta = Math.min(0.04, Math.max(0, (now - previous) / 1000));
      previous = now;
      const pet = physics.current;
      const settings = overlaySettings || {
        gravity: 1800,
        walkSpeed: 92
      };
      const gravityLocked = overlaySettings?.gravityLocked !== false;
      const friction = clamp(Number(overlaySettings?.friction ?? 45), 0, 100) / 100;

      if (!Number.isFinite(pet.x)) pet.x = Math.max(0, bounds.left);
      if (!Number.isFinite(pet.y)) pet.y = Math.max(0, bounds.floor - petHeight);
      if (!Number.isFinite(pet.vx)) pet.vx = 0;
      if (!Number.isFinite(pet.vy)) pet.vy = 0;
      if (pet.direction !== 1 && pet.direction !== -1) pet.direction = 1;
      if (pet.directionY !== 1 && pet.directionY !== -1) pet.directionY = -1;
      if (pet.vx > 0.5) pet.direction = 1;
      else if (pet.vx < -0.5) pet.direction = -1;
      syncFacing();

      if (pet.dragging) {
        setVisualState("drag");
      } else if (now < actionUntilRef.current) {
        pet.vx = 0;
        pet.vy = 0;
        setVisualState("idle");
      } else if (!gravityLocked) {
        if (
          visualStateRef.current === "sleep" ||
          visualStateRef.current === "windDown"
        ) {
          pet.vx = 0;
          pet.vy = 0;
        } else if (pet.idleUntil > now) {
          pet.vx = 0;
          pet.vy = 0;
          setVisualState("idle");
        } else {
          if (pet.idleUntil > 0) pet.idleUntil = 0;
          if (pet.thrown) {
            if (friction >= 1) {
              pet.vx = 0;
              pet.vy = 0;
              pet.thrown = false;
            } else if (friction > 0) {
              const damping = Math.pow(1 - friction, delta * 7);
              pet.vx *= damping;
              pet.vy *= damping;
              if (Math.hypot(pet.vx, pet.vy) < 18) {
                pet.vx = 0;
                pet.vy = 0;
                pet.thrown = false;
              }
            }
          }
          if (Math.abs(pet.vx) < 4 || Math.abs(pet.vy) < 4) {
            pet.vx = walkSpeed() * pet.direction;
            pet.vy = walkSpeed() * pet.directionY;
            pet.thrown = false;
          }

          pet.grounded = false;
          pet.x += pet.vx * delta;
          pet.y += pet.vy * delta;

          if (pet.x < bounds.left) {
            pet.x = bounds.left;
            pet.vx = Math.abs(pet.vx) * (pet.thrown ? Math.max(0, 1 - friction) : 1);
            pet.direction = 1;
          }
          const rightLimit = Math.max(bounds.left, bounds.right - petWidth);
          if (pet.x > rightLimit) {
            pet.x = rightLimit;
            pet.vx =
              -Math.abs(pet.vx) * (pet.thrown ? Math.max(0, 1 - friction) : 1);
            pet.direction = -1;
          }
          if (pet.y < 0) {
            pet.y = 0;
            pet.vy = Math.abs(pet.vy) * (pet.thrown ? Math.max(0, 1 - friction) : 1);
            pet.directionY = 1;
          }
          const ceilingLimit = Math.max(0, bounds.floor - petHeight);
          if (pet.y > ceilingLimit) {
            pet.y = ceilingLimit;
            pet.vy =
              -Math.abs(pet.vy) * (pet.thrown ? Math.max(0, 1 - friction) : 1);
            pet.directionY = -1;
          }

          if (
            overlaySettings?.idleActionEnabled &&
            now >= pet.nextIdleCheckAt
          ) {
            pet.nextIdleCheckAt = now + idleIntervalMs();
            if (Math.random() * 100 < idleActionChance()) {
              startIdleAction(now);
            }
          }
          if (pet.idleUntil <= now) setVisualState("walk");
        }
      } else {
        pet.vy += Number(settings.gravity || 1800) * delta;
        pet.x += pet.vx * delta;
        pet.y += pet.vy * delta;

        if (pet.x < bounds.left) {
          pet.x = bounds.left;
          pet.vx =
            Math.abs(pet.vx) * (pet.thrown ? Math.max(0, 1 - friction) : 1);
          pet.direction = 1;
        }
        const rightLimit = Math.max(bounds.left, bounds.right - petWidth);
        if (pet.x > rightLimit) {
          pet.x = rightLimit;
          pet.vx =
            -Math.abs(pet.vx) * (pet.thrown ? Math.max(0, 1 - friction) : 1);
          pet.direction = -1;
        }

        const floorY = bounds.floor - petHeight;
        if (pet.y >= floorY) {
          const wasFalling = pet.vy > 90;
          pet.y = floorY;
          pet.vy = 0;
          if (!pet.grounded && wasFalling) {
            pet.landedUntil = now + 280;
            pet.idleUntil = 0;
            pet.nextIdleCheckAt = pet.landedUntil + idleIntervalMs();
            setVisualState("land");
          }
          pet.grounded = true;

          if (pet.thrown) {
            if (friction >= 1) {
              pet.vx = 0;
              pet.thrown = false;
            } else if (friction > 0) {
              pet.vx *= Math.pow(1 - friction, delta * 7);
              if (Math.abs(pet.vx) < 18) {
                pet.vx = 0;
                pet.thrown = false;
              }
            }
          }

          if (
            visualStateRef.current === "sleep" ||
            visualStateRef.current === "windDown"
          ) {
            pet.vx = 0;
          } else if (pet.idleUntil > now) {
            pet.vx = 0;
            setVisualState("idle");
          } else if (now >= pet.landedUntil) {
            if (pet.thrown) {
              setVisualState("walk");
            } else if (pet.idleUntil > 0) {
              startWalking(now, Math.random() > 0.5 ? 1 : -1, false);
            } else if (!overlaySettings?.idleActionEnabled) {
              if (Math.abs(pet.vx) < 4) startWalking(now);
              setVisualState("walk");
            } else if (now >= pet.nextIdleCheckAt) {
              pet.nextIdleCheckAt = now + idleIntervalMs();
              if (Math.random() * 100 < idleActionChance()) {
                startIdleAction(now);
              } else {
                if (Math.abs(pet.vx) < 4) {
                  startWalking(now, Math.random() > 0.5 ? 1 : -1);
                } else {
                  setVisualState("walk");
                }
              }
            } else {
              if (Math.abs(pet.vx) < 4) startWalking(now);
              setVisualState("walk");
            }
          }
        } else {
          pet.grounded = false;
          if (pet.vy > 80) setVisualState("fall");
        }
      }

      syncPetPosition();
      syncFacing();
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [bounds.left, bounds.right, bounds.floor, petWidth, petHeight, overlaySettings]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const pet = physics.current;
    clearSleepTimers();
    clearActionTimer();
    pet.dragging = true;
    pet.dragOffsetX = event.clientX - pet.x;
    pet.dragOffsetY = event.clientY - pet.y;
    pet.lastPointerX = event.clientX;
    pet.lastPointerY = event.clientY;
    pet.lastPointerAt = performance.now();
    pet.vx = 0;
    pet.vy = 0;
    pet.idleUntil = 0;
    pet.thrown = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    setMouseIgnore(false);
    setMenu(null);
    menuRef.current = null;
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pet = physics.current;
    if (!pet.dragging) return;
    const now = performance.now();
    const delta = Math.max(8, now - pet.lastPointerAt);
    pet.vx = ((event.clientX - pet.lastPointerX) / delta) * 720;
    pet.vy = ((event.clientY - pet.lastPointerY) / delta) * 720;
    pet.x = clamp(event.clientX - pet.dragOffsetX, -petWidth * 0.2, window.innerWidth);
    pet.y = clamp(event.clientY - pet.dragOffsetY, 0, window.innerHeight - petHeight * 0.4);
    pet.lastPointerX = event.clientX;
    pet.lastPointerY = event.clientY;
    pet.lastPointerAt = now;
    syncPetPosition();
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const pet = physics.current;
    if (!pet.dragging) return;
    pet.dragging = false;
    pet.vx = clamp(pet.vx, -1500, 1500);
    pet.vy = clamp(pet.vy, -1200, 1600);
    pet.direction = pet.vx < 0 ? -1 : 1;
    pet.grounded = false;
    pet.thrown = true;
    setVisualState("fall");
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleContextMenu(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    cancelMenuClose();
    const nextMenu = { x: event.clientX, y: event.clientY };
    menuRef.current = nextMenu;
    setMenu(nextMenu);
    setMouseIgnore(false);
  }

  if (!appState || !activePet || !overlaySettings) return null;
  const currentImage =
    (activePet.animationMap as Record<string, string>)[visualState] ||
    (visualState === "idle" ? activePet.avatarUrl : "") ||
    "";

  return (
    <div className="overlay-root" style={{ pointerEvents: "none" }}>
      <div
        className={`overlay-pet-wrap ${
          facing < 0 ? "overlay-facing-left" : ""
        }`}
        ref={petWrapRef}
        style={{
          left: physics.current.x,
          top: physics.current.y,
          width: petWidth,
          height: petHeight,
          pointerEvents: "none"
        }}
      >
        {activePet.spine ? (
          <SpinePet
            skelUrl={activePet.spine.skelUrl}
            state={visualState}
            className={
              facing < 0
                ? "overlay-spine-pet overlay-spine-pet--left"
                : "overlay-spine-pet"
            }
            fitWidth={visualWidth}
            fitHeight={visualHeight}
            displayWidth={canvasWidth}
            displayHeight={canvasHeight}
            offsetX={activeRenderConfig?.offsetX}
            offsetY={activeRenderConfig?.offsetY}
            anchorBottom
            normalizeBodySize
            speedMultiplier={walkAnimationSpeed()}
            actionBindings={activePet.actionBindings}
            actionOverride={actionOverride}
            boneMap={activePet.boneMap}
            onSkeletonInfo={(info) => {
              const currentBindings = activePet.actionBindings || {};
              const inferredBindings = { ...currentBindings };
              for (const action of universalActions) {
                if (!inferredBindings[action.id]) {
                  const match = chooseBoundAnimation(
                    action.id,
                    undefined,
                    info.animations
                  );
                  if (match) inferredBindings[action.id] = match;
                }
              }
              const bindingsChanged =
                JSON.stringify(inferredBindings) !==
                JSON.stringify(currentBindings);
              const boneMapChanged =
                JSON.stringify(info.boneMap) !==
                JSON.stringify(activePet.boneMap || {});
              if (!bindingsChanged && !boneMapChanged) return;
              const pets = appStateRef.current?.pets.map((item) =>
                item.id === activePet.id
                  ? {
                      ...item,
                      actionBindings: inferredBindings,
                      boneMap: {
                        ...(item.boneMap || {}),
                        ...info.boneMap
                      },
                      spine: item.spine
                        ? {
                            ...item.spine,
                            animations: info.animations,
                            animationDurations: info.durations
                          }
                        : item.spine
                    }
                  : item
              );
              if (pets) void window.deskPet.updateState({ pets });
            }}
            onAnimationData={(items) => {
              const preferredNames = ["Special", "Relax", "Sit", "Idle"];
              const idleAnimation = items.find((item) =>
                preferredNames.some(
                  (name) => name.toLowerCase() === item.name.toLowerCase()
                )
              );
              if (idleAnimation && idleAnimation.duration > 0) {
                idleDurationRef.current = idleAnimation.duration * 1000;
                if (visualStateRef.current === "idle") {
                  const idleEnd = performance.now() + idleDurationRef.current;
                  physics.current.idleUntil = Math.max(
                    physics.current.idleUntil,
                    idleEnd
                  );
                }
              }
            }}
            fallback={
              <PetAvatar
                primary={activePet.accent}
                secondary={activePet.secondary}
                size={92 * scale}
                state={visualState === "windDown" ? "sleep" : visualState}
                facing={facing < 0 ? "left" : "right"}
              />
            }
          />
        ) : currentImage ? (
          <img
            className={[
              "overlay-pet-image",
              `overlay-pet-image--${visualState}`,
              physics.current.direction < 0 ? "overlay-pet-image--left" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            src={currentImage}
            alt={activePet.name}
            draggable={false}
          />
        ) : (
          <PetAvatar
            primary={activePet.accent}
            secondary={activePet.secondary}
            size={92 * scale}
            state={visualState === "windDown" ? "sleep" : visualState}
            facing={facing < 0 ? "left" : "right"}
          />
        )}
        <div
          ref={hitboxElementRef}
          className="overlay-hitbox-region"
          style={{
            left: hitboxOffsetX,
            top: hitboxOffsetY,
            width: petWidth,
            height: petHeight,
            pointerEvents: "auto"
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => window.deskPet.showControl()}
          onContextMenu={handleContextMenu}
        />
      </div>

      {menu && (
        <div
          ref={menuElementRef}
          className="overlay-menu"
          style={{
            left: menu.x,
            top: Math.min(menu.y, window.innerHeight - 360),
            pointerEvents: "auto"
          }}
          onMouseLeave={() => {
            scheduleMenuClose();
          }}
          onMouseEnter={() => {
            cancelMenuClose();
          }}
        >
          <button type="button" onClick={() => window.deskPet.showControl()}>
            <MousePointerClick size={16} />
            打开管理台
          </button>
          <button
            type="button"
            onClick={() => {
              void window.deskPet.openChat("text");
              setMenu(null);
            }}
          >
            <MessageCircle size={16} />
            文字对话
          </button>
          <button
            type="button"
            onClick={() => {
              void window.deskPet.openChat("voice");
              setMenu(null);
            }}
          >
            <Mic size={16} />
            语音对话
          </button>
          <button
            type="button"
            onClick={() => {
              handleCommand({ type: "home" });
              setMenu(null);
            }}
          >
            <Home size={16} />
            回到落点
          </button>
          <button
            type="button"
            onClick={() => {
              handleCommand({ type: "rest" });
              setMenu(null);
            }}
          >
            <Moon size={16} />
            桌面休眠
          </button>
          {universalActions
            .map((action) => ({
              action,
              animation:
                activePet.actionBindings?.[action.id] ||
                chooseBoundAnimation(
                  action.id,
                  activePet.actionBindings,
                  activePet.spine?.animations || []
                )
            }))
            .filter((item) => item.animation)
            .slice(0, 4)
            .map(({ action, animation }) => (
              <button
                type="button"
                key={action.id}
                onClick={() => {
                  handleCommand({ type: "action", name: animation });
                  setMenu(null);
                }}
              >
                <Moon size={16} />
                {action.label}
              </button>
            ))}
          <button
            type="button"
            onClick={() => {
              window.deskPet.showControl().then(() =>
                window.deskPet.updateState({ activeView: "wake" })
              );
              setMenu(null);
            }}
          >
            <DoorOpen size={16} />
            辅助窗口
          </button>
        </div>
      )}
    </div>
  );
}
