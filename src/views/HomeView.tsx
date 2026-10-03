import {
  Activity,
  Brain,
  CalendarClock,
  Heart,
  Hand,
  MessageCircle,
  Moon,
  Radio,
  TrendingUp,
  Volume2,
  Zap
} from "lucide-react";
import { PetAvatar } from "../components/PetAvatar";
import { SpinePet } from "../components/SpinePet";
import { formatTime } from "../lib/format";
import { useAppState } from "../state";
import {
  appendWellbeingEvent,
  ensureWellbeing,
  recordWellbeingInteraction,
  relationshipStage
} from "../lib/wellbeing";

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
        <span className={`meter-fill meter-fill--${tone}`} style={{ width: `${value}%` }} />
      </div>
      <strong>{Math.round(value)}%</strong>
    </div>
  );
}

export function HomeView() {
  const { state, updateState } = useAppState();
  if (!state) return null;
  const currentState = state;
  const pet =
    currentState.pets.find((item) => item.id === currentState.activePetId) ||
    currentState.pets[0];
  const wellbeing = ensureWellbeing(
    currentState.wellbeing,
    currentState.character
  );
  const minutesSinceInteraction = Math.max(
    0,
    (Date.now() - new Date(wellbeing.lastInteractionAt).getTime()) / 60000
  );
  const nextRelationshipStage =
    wellbeing.relationship < 20
      ? 20
      : wellbeing.relationship < 40
        ? 40
        : wellbeing.relationship < 60
          ? 60
          : wellbeing.relationship < 80
            ? 80
            : 100;

  async function petCompanion() {
    const now = Date.now();
    const next = recordWellbeingInteraction(
      wellbeing,
      currentState.character,
      "pet",
      now
    );
    if (next.lastPetAt !== wellbeing.lastPetAt) {
      await updateState({
        wellbeing: appendWellbeingEvent(
          next,
          "pet",
          "你摸了摸它，心情和主动性有小幅提升。",
          now
        )
      });
    }
  }

  return (
    <div className="home-layout">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="section-kicker">今天的桌宠</span>
          <h2>{pet.name}</h2>
          <p>{pet.description}</p>
          <div className="mood-line">
            <span>心情：{wellbeing.mood}</span>
            <span>精力：{Math.round(wellbeing.energy)}%</span>
            <span>
              关系：{relationshipStage(wellbeing.relationship)}
            </span>
          </div>
          <div className="character-meters">
            <Meter label="精力" value={wellbeing.energy} tone="green" />
            <Meter label="主动性" value={wellbeing.initiative} tone="orange" />
            <Meter label="关系" value={wellbeing.relationship} tone="blue" />
          </div>
          <div className="home-actions">
            <button type="button" onClick={petCompanion}>
              <Hand size={16} />
              摸摸头
            </button>
            <button
              type="button"
              onClick={() => updateState({ activeView: "training" })}
            >
              <MessageCircle size={16} />
              聊一会儿
            </button>
            <button
              type="button"
              onClick={() => window.deskPet.overlayCommand({ type: "rest" })}
            >
              <Moon size={16} />
              让它休息
            </button>
          </div>
        </div>
        <div className="hero-pet">
          <div className="hero-pet-platform" />
          {pet.spine ? (
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
      </section>

      <section className="overview-grid">
        <article className="info-panel">
          <div className="panel-heading">
            <CalendarClock size={18} />
            <h3>今天的精力</h3>
          </div>
          <div className="stat-stack">
            <div>
              <strong>{Math.round(wellbeing.energy)}</strong>
              <span>当前精力</span>
            </div>
            <div>
              <strong>{wellbeing.today.energyDelta.toFixed(1)}</strong>
              <span>今日变化</span>
            </div>
            <div>
              <strong>{state.stats.wakeCount}</strong>
              <span>唤醒次数</span>
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
            {relationshipStage(wellbeing.relationship)}
          </strong>
          <p>
            关系值 {wellbeing.relationship.toFixed(1)}，距离下一阶段还需要约{" "}
            {Math.max(0, nextRelationshipStage - wellbeing.relationship).toFixed(1)}。
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
            <em>{state.settings.services.llm.model || "未配置"}</em>
          </div>
          <div className="service-line">
            <Activity size={17} />
            <span>语音识别</span>
            <em>{state.settings.services.asr.model || "未配置"}</em>
          </div>
          <div className="service-line">
            <Volume2 size={17} />
            <span>语音合成</span>
            <em>{state.voiceProfiles[0]?.name || "等待声音样本"}</em>
          </div>
        </article>
      </section>

      <section className="activity-panel">
        <div className="panel-heading">
          <Zap size={18} />
          <h3>状态时间线</h3>
        </div>
        <div className="activity-list">
          {[...wellbeing.recentEvents, ...state.activity]
            .sort(
              (left, right) =>
                new Date(right.createdAt).getTime() -
                new Date(left.createdAt).getTime()
            )
            .slice(0, 8)
            .map((item) => (
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
