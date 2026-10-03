import { clamp } from "./format";
import { makeId } from "./id";
import type { CharacterProfile, WellbeingState } from "../types";

export type ActivityMode = "walking" | "idle" | "sleeping" | "hidden";

export function ensureWellbeing(
  value: Partial<WellbeingState> | undefined,
  character: CharacterProfile
): WellbeingState {
  const now = new Date().toISOString();
  return {
    energy: Number(value?.energy ?? character.energy ?? 76),
    initiative: Number(value?.initiative ?? character.initiative ?? 58),
    relationship: Number(value?.relationship ?? character.relationship ?? 12),
    mood: value?.mood || character.mood || "平静",
    moodScore: Number(value?.moodScore ?? 61),
    lastSimulatedAt: value?.lastSimulatedAt || now,
    lastInteractionAt: value?.lastInteractionAt || now,
    lastPetAt:
      value?.lastPetAt || new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    todayKey: value?.todayKey || now.slice(0, 10),
    today: {
      energyDelta: Number(value?.today?.energyDelta || 0),
      initiativeDelta: Number(value?.today?.initiativeDelta || 0),
      relationshipDelta: Number(value?.today?.relationshipDelta || 0),
      interactions: Number(value?.today?.interactions || 0),
      petCount: Number(value?.today?.petCount || 0)
    },
    recentEvents: Array.isArray(value?.recentEvents)
      ? value.recentEvents
      : []
  };
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function moodLabel(score: number) {
  if (score < 24) return "疲惫";
  if (score < 43) return "低落";
  if (score < 66) return "平静";
  if (score < 84) return "开心";
  return "兴奋";
}

export function relationshipStage(value: number) {
  if (value < 20) return "陌生";
  if (value < 40) return "熟悉";
  if (value < 60) return "亲近";
  if (value < 80) return "信赖";
  return "默契";
}

export function calculateMoodScore(
  wellbeing: WellbeingState,
  now = Date.now()
) {
  const lastInteraction = new Date(wellbeing.lastInteractionAt).getTime();
  const minutesSinceInteraction = Number.isFinite(lastInteraction)
    ? Math.max(0, (now - lastInteraction) / 60000)
    : 999;
  const recentInteraction = Math.exp(-minutesSinceInteraction / 75) * 100;
  return clamp(
    wellbeing.energy * 0.45 +
      wellbeing.initiative * 0.2 +
      wellbeing.relationship * 0.25 +
      recentInteraction * 0.1,
    0,
    100
  );
}

export function withUpdatedMood(
  wellbeing: WellbeingState,
  now = Date.now()
): WellbeingState {
  const moodScore = calculateMoodScore(wellbeing, now);
  return {
    ...wellbeing,
    moodScore,
    mood: moodLabel(moodScore)
  };
}

export function simulateWellbeing(
  previous: WellbeingState,
  character: CharacterProfile,
  mode: ActivityMode,
  elapsedMs: number,
  now = Date.now()
): WellbeingState {
  const safeElapsed = clamp(elapsedMs, 0, 2 * 60 * 1000);
  const elapsedMinutes = safeElapsed / 60000;
  if (elapsedMinutes <= 0) return previous;

  const todayKey = dayKey(new Date(now));
  const resetDaily = previous.todayKey !== todayKey;
  let energy = Number(previous.energy ?? 76);
  let initiative = Number(previous.initiative ?? character.initiative ?? 58);
  let relationship = Number(previous.relationship ?? 12);
  let energyDelta = resetDaily ? 0 : Number(previous.today.energyDelta || 0);
  let initiativeDelta = resetDaily
    ? 0
    : Number(previous.today.initiativeDelta || 0);
  let relationshipDelta = resetDaily
    ? 0
    : Number(previous.today.relationshipDelta || 0);

  let energyChange = 0;
  if (mode === "walking") energyChange = -0.2 * elapsedMinutes;
  else if (mode === "idle") energyChange = -0.1 * elapsedMinutes;
  else if (mode === "sleeping") energyChange = 0.67 * elapsedMinutes;

  energy = clamp(energy + energyChange, 0, 100);
  energyDelta += energy - Number(previous.energy ?? energy);

  if (mode !== "sleeping") {
    const relationshipChange = 0.2 * (elapsedMinutes / 60);
    relationship = clamp(relationship + relationshipChange, 0, 100);
    relationshipDelta += relationshipChange;
  }

  const lastInteractionAt = new Date(previous.lastInteractionAt).getTime();
  const minutesSinceInteraction = Number.isFinite(lastInteractionAt)
    ? Math.max(0, (now - lastInteractionAt) / 60000)
    : 0;
  if (minutesSinceInteraction > 15 && mode !== "sleeping") {
    const floor = Math.max(20, Number(character.initiative ?? 58) - 15);
    const before = initiative;
    initiative = Math.max(
      floor,
      initiative - elapsedMinutes / 15
    );
    initiativeDelta += initiative - before;
  } else if (mode === "sleeping") {
    const base = Number(character.initiative ?? 58);
    const before = initiative;
    initiative += clamp(base - initiative, -0.2, 0.2) * elapsedMinutes;
    initiativeDelta += initiative - before;
  }

  const next = withUpdatedMood(
    {
      ...previous,
      energy,
      initiative,
      relationship,
      todayKey,
      today: {
        ...previous.today,
        energyDelta,
        initiativeDelta,
        relationshipDelta,
        interactions: resetDaily ? 0 : previous.today.interactions,
        petCount: resetDaily ? 0 : previous.today.petCount
      },
      lastSimulatedAt: new Date(now).toISOString()
    },
    now
  );

  return next;
}

export function recordWellbeingInteraction(
  previous: WellbeingState,
  character: CharacterProfile,
  kind: "chat" | "pet",
  now = Date.now()
): WellbeingState {
  const next = {
    ...previous,
    today: {
      ...previous.today,
      interactions:
        kind === "chat"
          ? previous.today.interactions + 1
          : previous.today.interactions,
      petCount:
        kind === "pet" ? previous.today.petCount + 1 : previous.today.petCount,
      relationshipDelta: previous.today.relationshipDelta,
      initiativeDelta: previous.today.initiativeDelta,
      energyDelta: previous.today.energyDelta
    }
  };

  if (kind === "chat") {
    next.relationship = clamp(previous.relationship + 0.3, 0, 100);
    next.initiative = clamp(
      previous.initiative + 2,
      0,
      100
    );
    next.today.relationshipDelta += 0.3;
    next.today.initiativeDelta += 2;
    next.lastInteractionAt = new Date(now).toISOString();
  } else {
    const lastPetAt = new Date(previous.lastPetAt).getTime();
    const canPet =
      !Number.isFinite(lastPetAt) || now - lastPetAt >= 30 * 60 * 1000;
    if (canPet) {
      next.relationship = clamp(previous.relationship + 0.2, 0, 100);
      next.initiative = clamp(previous.initiative + 1, 0, 100);
      next.today.relationshipDelta += 0.2;
      next.today.initiativeDelta += 1;
      next.lastPetAt = new Date(now).toISOString();
      next.lastInteractionAt = new Date(now).toISOString();
    }
  }

  return withUpdatedMood(next, now);
}

export function appendWellbeingEvent(
  wellbeing: WellbeingState,
  type: string,
  text: string,
  now = Date.now()
): WellbeingState {
  return {
    ...wellbeing,
    recentEvents: [
      {
        id: makeId("wellbeing"),
        type,
        text,
        createdAt: new Date(now).toISOString()
      },
      ...wellbeing.recentEvents
    ].slice(0, 40)
  };
}
