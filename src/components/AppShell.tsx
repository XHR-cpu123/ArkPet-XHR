import {
  Brain,
  Database,
  HardDrive,
  Home,
  Monitor,
  Puzzle,
  Power,
  Sparkles,
  Wand2
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { useAppState } from "../state";
import type { OverlayCommand } from "../types";
import { HomeView } from "../views/HomeView";
import { SettingsView } from "../views/SettingsView";
import { TrainingView } from "../views/TrainingView";
import { WakeView } from "../views/WakeView";
import { WorkshopView } from "../views/WorkshopView";
import { ModuleManagerView } from "../views/ModuleManagerView";

export type PetMode = "active" | "desktopSleeping" | "resting";

type NavItem = {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};

const navigation: NavItem[] = [
  { id: "home", label: "首页总览", icon: Home },
  { id: "wake", label: "桌宠行为控制", icon: Sparkles },
  { id: "workshop", label: "桌宠唤醒", icon: Wand2 },
  { id: "training", label: "个性化 AI 训练", icon: Brain },
  { id: "modules", label: "模组管理", icon: Puzzle },
  { id: "settings", label: "数据与设置", icon: Database }
];

function currentViewLabel(view: string) {
  return navigation.find((item) => item.id === view)?.label || "首页总览";
}

export function AppShell() {
  const { state, updateState } = useAppState();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme =
      state?.settings.appearance?.theme || "default";
  }, [state?.settings.appearance?.theme]);

  if (!state) {
    return (
      <div className="app-loading">
        <div className="loading-mark">桌</div>
        <p>正在读取本地数据...</p>
      </div>
    );
  }

  const currentState = state;
  const activePet =
    currentState.pets.find((pet) => pet.id === currentState.activePetId) ||
    currentState.pets[0];
  const selectedSummoned = currentState.summonedPetIds.includes(
    currentState.activePetId
  );
  const petMode: PetMode = selectedSummoned ? "active" : "resting";
  const view = state.activeView || "home";

  async function changeView(nextView: string) {
    await updateState({ activeView: nextView });
  }

  async function togglePetMode() {
    if (busy) return;
    setBusy(true);
    try {
      if (petMode === "active") {
        await window.deskPet.overlayCommand({
          type: "sleep",
          petId: currentState.activePetId
        } satisfies OverlayCommand);
      } else {
        await window.deskPet.overlayCommand({
          type: "release",
          petId: currentState.activePetId
        } satisfies OverlayCommand);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Monitor size={22} strokeWidth={2.2} />
          </div>
          <div>
            <strong>桌宠工房</strong>
            <span>本地角色工作台</span>
          </div>
        </div>

        <nav className="main-nav" aria-label="主导航">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "nav-item nav-item--active" : "nav-item"}
                onClick={() => changeView(item.id)}
                type="button"
              >
                <Icon size={19} strokeWidth={2} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <HardDrive size={17} />
          <div>
            <strong>仅保存在本机</strong>
            <span>关闭与重启后继续保留</span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="eyebrow">当前模块</span>
            <h1>{currentViewLabel(view)}</h1>
          </div>
          <div className="topbar-actions">
            <div className={petMode === "active" ? "state-chip state-chip--live" : "state-chip"}>
              <span className="state-dot" />
              {petMode === "active"
                ? "桌面活动中"
                : "休眠中"}
            </div>
            {view === "workshop" && (
              <button
                className="primary-action"
                type="button"
                disabled={busy}
                onClick={togglePetMode}
              >
                <Power size={17} />
                {petMode === "resting" ? "从窗口释放" : "收回并休眠"}
              </button>
            )}
          </div>
        </header>

        <section className="view-container">
          {view === "home" && <HomeView />}
          {view === "wake" && <WakeView petMode={petMode} />}
          {view === "workshop" && <WorkshopView />}
          {view === "training" && <TrainingView />}
          {view === "modules" && <ModuleManagerView />}
          {view === "settings" && <SettingsView />}
        </section>

        <footer className="status-footer">
          <span>当前角色：{activePet?.name || state.character.name}</span>
          <span>本地 AI：读取设置</span>
          <span>语音：等待引擎</span>
          <span>数据：正常</span>
        </footer>
      </main>
    </div>
  );
}
