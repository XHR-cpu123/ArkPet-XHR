import {
  Activity,
  Brain,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Heart,
  Hand,
  MessageCircle,
  Moon,
  Radio,
  TrendingUp,
  Volume2,
  Zap
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PetAvatar } from "../components/PetAvatar";
import { SpinePet } from "../components/SpinePet";
import { formatTime } from "../lib/format";
import {
  addPetRelationship,
  ensurePetCompanionState
} from "../lib/petCompanion";
import { useAppState } from "../state";
import type { PetProfile } from "../types";
import {
  appendWellbeingEvent,
  ensureWellbeing,
  recordWellbeingInteraction,
  relationshipStage
} from "../lib/wellbeing";

type TimelineItem = {
  id: string;
  text: string;
  createdAt: string;
};

function Meter({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "blue" | "orange" | "green";
}) {
  return (
    <div className="meter-row">
      <span>{label}</span>
      <div className="meter-track">
        <span
          className={`meter-fill meter-fill--${tone}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <strong>{Math.round(value)}%</strong>
    </div>
  );
}

function formatDuration(seconds: number) {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} 分钟`;
  return `${hours} 小时 ${minutes} 分钟`;
}

function relationshipTarget(value: number) {
  if (value < 20) return 20;
  if (value < 40) return 40;
  if (value < 60) return 60;
  if (value < 80) return 80;
  return 100;
}

function PetHero({
  pet,
  energy,
  initiative,
  relationship,
  mood,
  active
}: {
  pet: PetProfile;
  energy: number;
  initiative: number;
  relationship: number;
  mood: string;
  active: boolean;
}) {
  const companion = ensurePetCompanionState(pet);
  return (
    <article className="hero-page">
      <div className="hero-copy">
        <span className="section-kicker">今天的桌宠</span>
        <h2>{pet.name}</h2>
        <p>{pet.description}</p>
        <div className="mood-line">
          <span>心情：{mood}</span>
          <span>精力：{Math.round(energy)}%</span>
          <span>关系：{relationshipStage(relationship)}</span>
        </div>
        <div className="desktop-companion-line">
          今天在桌面陪伴了{" "}
          <strong>{formatDuration(companion.desktopSecondsToday || 0)}</strong>
          ，累计{" "}
          <strong>{formatDuration(companion.desktopSecondsTotal || 0)}</strong>
        </div>
        <div className="character-meters">
          <Meter label="精力" value={energy} tone="green" />
          <Meter label="主动性" value={initiative} tone="orange" />
          <Meter label="关系" value={relationship} tone="blue" />
        </div>
      </div>
      <div className="hero-pet">
        <div className="hero-pet-platform" />
        {!active ? (
          <div className="hero-pet-placeholder" />
        ) : pet.spine ? (
          <SpinePet
            skelUrl={pet.spine.skelUrl}
            state="idle"
            className="hero-spine-pet"
            fallback={
              <PetAvatar
                primary={pet.accent}
                secondary={pet.secondary}
                size={156}
                state="idle"
              />
            }
          />
        ) : pet.avatarUrl ? (
          <img src={pet.avatarUrl} alt={pet.name} className="hero-pet-image" />
        ) : (
          <PetAvatar
            primary={pet.accent}
            secondary={pet.secondary}
            size={156}
            state="idle"
          />
        )}
      </div>
    </article>
  );
}

export function HomeView() {
  const { state, updateState } = useAppState();
  const [petPage, setPetPage] = useState(0);
  const swipeStartRef = useRef<number | null>(null);
  const activePageAlignedRef = useRef(false);
  const currentState = state;
  const summoned = new Set(currentState?.summonedPetIds || []);
  const availablePets = currentState
    ? [
        ...currentState.pets.filter((pet) => summoned.has(pet.id)),
        ...currentState.pets.filter((pet) => !summoned.has(pet.id))
      ]
    : [];

  useEffect(() => {
    if (petPage < availablePets.length) return;
    setPetPage(0);
  }, [availablePets.length, petPage]);

  useEffect(() => {
    if (!currentState || activePageAlignedRef.current) return;
    const activeIndex = availablePets.findIndex(
      (pet) => pet.id === currentState.activePetId
    );
    if (activeIndex >= 0) {
      setPetPage(activeIndex);
      activePageAlignedRef.current = true;
    }
  }, [currentState?.activePetId, availablePets]);

  if (!currentState || availablePets.length === 0) return null;

  const stateSnapshot = currentState;
  const pet = availablePets[petPage] || availablePets[0];
  const petCompanionState = ensurePetCompanionState(pet);
  const relationship = Number(petCompanionState.desktopRelationship ?? 12);
  const wellbeing = ensureWellbeing(
    currentState.wellbeing,
    currentState.character
  );
  const minutesSinceInteraction = Math.max(
    0,
    (Date.now() - new Date(wellbeing.lastInteractionAt).getTime()) / 60000
  );
  const nextRelationshipStage = relationshipTarget(relationship);
  const timeline: TimelineItem[] = [
    {
      id: `desktop-${pet.id}-${petCompanionState.desktopDayKey || ""}`,
      text: `${pet.name} 今天在桌面上陪伴了 ${formatDuration(
        petCompanionState.desktopSecondsToday || 0
      )}，关系提升到 ${relationship.toFixed(1)}。`,
      createdAt: new Date().toISOString()
    },
    ...wellbeing.recentEvents,
    ...currentState.activity
  ]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime()
    )
    .slice(0, 8);

  function goToPage(index: number) {
    if (availablePets.length <= 1) return;
    const nextIndex =
      (index + availablePets.length) % availablePets.length;
    setPetPage(nextIndex);
    const nextPet = availablePets[nextIndex];
    if (nextPet) void updateState({ activePetId: nextPet.id });
  }

  async function petCompanion() {
    const now = Date.now();
    const next = recordWellbeingInteraction(
      wellbeing,
      stateSnapshot.character,
      "pet",
      now
    );
    if (next.lastPetAt !== wellbeing.lastPetAt) {
      await updateState({
        activePetId: pet.id,
        pets: stateSnapshot.pets.map((item) =>
          item.id === pet.id ? addPetRelationship(item, 0.5, now) : item
        ),
        wellbeing: appendWellbeingEvent(
          next,
          "pet",
          `你摸了摸 ${pet.name}，关系和主动性有小幅提升。`,
          now
        )
      });
    }
  }

  return (
    <div className="home-layout">
      <section className="hero-panel hero-panel--carousel">
        <button
          className="hero-page-arrow hero-page-arrow--prev"
          type="button"
          aria-label="上一只桌宠"
          disabled={availablePets.length <= 1}
          onClick={() => goToPage(petPage - 1)}
        >
          <ChevronLeft size={20} />
        </button>
        <div
          className="hero-pages-viewport"
          onPointerDown={(event) => {
            swipeStartRef.current = event.clientX;
          }}
          onPointerUp={(event) => {
            const start = swipeStartRef.current;
            swipeStartRef.current = null;
            if (start === null) return;
            const delta = event.clientX - start;
            if (Math.abs(delta) < 42) return;
            goToPage(delta < 0 ? petPage + 1 : petPage - 1);
          }}
          onPointerCancel={() => {
            swipeStartRef.current = null;
          }}
        >
          <div
            className="hero-pages-track"
            style={{ transform: `translateX(-${petPage * 100}%)` }}
          >
            {availablePets.map((item) => {
              const statistics = ensurePetCompanionState(item);
              return (
                <PetHero
                  key={item.id}
                  pet={item}
                  energy={wellbeing.energy}
                  initiative={wellbeing.initiative}
                  relationship={Number(statistics.desktopRelationship ?? 12)}
                  mood={wellbeing.mood}
                  active={item.id === pet.id}
                />
              );
            })}
          </div>
        </div>
        <button
          className="hero-page-arrow hero-page-arrow--next"
          type="button"
          aria-label="下一只桌宠"
          disabled={availablePets.length <= 1}
          onClick={() => goToPage(petPage + 1)}
        >
          <ChevronRight size={20} />
        </button>
        {availablePets.length > 1 && (
          <div className="hero-page-dots" aria-label="桌宠分页">
            {availablePets.map((item, index) => (
              <button
                key={item.id}
                className={
                  index === petPage
                    ? "hero-page-dot hero-page-dot--active"
                    : "hero-page-dot"
                }
                type="button"
                aria-label={`切换到 ${item.name}`}
                onClick={() => goToPage(index)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="home-actions home-actions--below-hero">
        <button type="button" onClick={() => void petCompanion()}>
          <Hand size={16} />
          摸摸 {pet.name}
        </button>
        <button
          type="button"
          onClick={() =>
            updateState({ activePetId: pet.id, activeView: "training" })
          }
        >
          <MessageCircle size={16} />
          聊一会儿
        </button>
        <button
          type="button"
          onClick={() =>
            window.deskPet.overlayCommand({ type: "rest", petId: pet.id })
          }
        >
          <Moon size={16} />
          让它休息
        </button>
      </div>

      <section className="overview-grid">
        <article className="info-panel">
          <div className="panel-heading">
            <CalendarClock size={18} />
            <h3>今天的陪伴</h3>
          </div>
          <div className="stat-stack">
            <div>
              <strong>
                {formatDuration(petCompanionState.desktopSecondsToday || 0)}
              </strong>
              <span>今日桌面时长</span>
            </div>
            <div>
              <strong>
                {formatDuration(petCompanionState.desktopSecondsTotal || 0)}
              </strong>
              <span>累计桌面时长</span>
            </div>
            <div>
              <strong>{Math.round(wellbeing.energy)}</strong>
              <span>当前精力</span>
            </div>
          </div>
        </article>

        <article className="info-panel">
          <div className="panel-heading">
            <TrendingUp size={18} />
            <h3>心情与主动性</h3>
          </div>
          <strong className="status-value">{wellbeing.mood}</strong>
          <p>
            主动性 {Math.round(wellbeing.initiative)}。
            {minutesSinceInteraction < 15
              ? "最近刚互动过，它更愿意做出反应。"
              : "已经有一段时间没互动，它会逐渐安静下来。"}
          </p>
        </article>

        <article className="info-panel">
          <div className="panel-heading">
            <Heart size={18} />
            <h3>关系进度</h3>
          </div>
          <strong className="status-value">
            {relationshipStage(relationship)}
          </strong>
          <p>
            {pet.name} 的关系值 {relationship.toFixed(1)}，距离下一阶段还需要约{" "}
            {Math.max(0, nextRelationshipStage - relationship).toFixed(1)}。
            桌面陪伴时间越长，关系会持续提升。
          </p>
        </article>

        <article className="info-panel service-panel">
          <div className="panel-heading">
            <Radio size={18} />
            <h3>本地能力</h3>
          </div>
          <div className="service-line">
            <Brain size={17} />
            <span>对话模型</span>
            <em>{currentState.settings.services.llm.model || "未配置"}</em>
          </div>
          <div className="service-line">
            <Activity size={17} />
            <span>语音识别</span>
            <em>{currentState.settings.services.asr.model || "未配置"}</em>
          </div>
          <div className="service-line">
            <Volume2 size={17} />
            <span>语音合成</span>
            <em>{currentState.voiceProfiles[0]?.name || "等待声音样本"}</em>
          </div>
        </article>
      </section>

      <section className="activity-panel">
        <div className="panel-heading">
          <Zap size={18} />
          <h3>{pet.name} 的经历</h3>
        </div>
        <div className="activity-list">
          {timeline.map((item) => (
            <div className="activity-item" key={item.id}>
              <span>{item.text}</span>
              <time>{formatTime(item.createdAt)}</time>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
