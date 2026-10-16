import { clamp } from "./format";
import {
  calculateMoodScore,
  ensureWellbeing,
  moodLabel
} from "./wellbeing";
import type { CharacterProfile, PetProfile, PetVitals } from "../types";

const DESKTOP_RELATIONSHIP_PER_HOUR = 1.6;
const MAX_CATCH_UP_MS = 2 * 60 * 1000;

function dayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function ensurePetVitals(
  pet: PetProfile,
  character: CharacterProfile
): PetVitals {
  if (pet.vitals) return pet.vitals;
  const base = ensureWellbeing(undefined, character);
  const legacyRelationship = Number(pet.desktopRelationship);
  return {
    ...base,
    relationship: Number.isFinite(legacyRelationship)
      ? legacyRelationship
      : base.relationship,
    secondsToday: Math.max(0, Number(pet.desktopSecondsToday || 0)),
    secondsTotal: Math.max(0, Number(pet.desktopSecondsTotal || 0))
  };
}

export function advancePetVitals(
  vitals: PetVitals,
  character: CharacterProfile,
  active: boolean,
  now = Date.now()
): PetVitals {
  const sampleAt = new Date(vitals.lastSimulatedAt || now).getTime();
  const rawElapsedMs = Number.isFinite(sampleAt)
    ? Math.max(0, now - sampleAt)
    : 0;
  const elapsedMinutes = clamp(rawElapsedMs, 0, MAX_CATCH_UP_MS) / 60000;
  const currentDay = dayKey(now);
  const rollover = vitals.todayKey !== currentDay;

  const previousEnergy = Number(vitals.energy ?? 76);
  let energy = previousEnergy;
  let initiative = Number(vitals.initiative ?? 58);
  let relationship = Number(vitals.relationship ?? 12);
  let energyDelta = rollover ? 0 : Number(vitals.today?.energyDelta || 0);
  let initiativeDelta = rollover
    ? 0
    : Number(vitals.today?.initiativeDelta || 0);
  let relationshipDelta = rollover
    ? 0
    : Number(vitals.today?.relationshipDelta || 0);

  const energyChange = active ? -0.2 * elapsedMinutes : 0.67 * elapsedMinutes;
  energy = clamp(energy + energyChange, 0, 100);
  energyDelta += energy - previousEnergy;

  if (active) {
    const relationshipChange =
      (elapsedMinutes / 60) * DESKTOP_RELATIONSHIP_PER_HOUR;
    relationship = clamp(relationship + relationshipChange, 0, 100);
    relationshipDelta += relationshipChange;
  }

  const lastInteractionAt = new Date(vitals.lastInteractionAt || now).getTime();
  const minutesSinceInteraction = Number.isFinite(lastInteractionAt)
    ? Math.max(0, (now - lastInteractionAt) / 60000)
    : 0;
  if (active && minutesSinceInteraction > 15) {
    const floor = Math.max(20, Number(character.initiative ?? 58) - 15);
    const before = initiative;
    initiative = Math.max(floor, initiative - elapsedMinutes / 15);
    initiativeDelta += initiative - before;
  } else if (!active) {
    const base = Number(character.initiative ?? 58);
    const before = initiative;
    initiative += clamp(base - initiative, -0.2, 0.2) * elapsedMinutes;
    initiativeDelta += initiative - before;
  }

  const elapsedSeconds = active ? elapsedMinutes * 60 : 0;
  const advanced: PetVitals = {
    ...vitals,
    energy,
    initiative,
    relationship,
    todayKey: currentDay,
    secondsToday:
      (rollover ? 0 : Math.max(0, Number(vitals.secondsToday || 0))) +
      elapsedSeconds,
    secondsTotal:
      Math.max(0, Number(vitals.secondsTotal || 0)) + elapsedSeconds,
    today: {
      ...(rollover
        ? {
            energyDelta: 0,
            initiativeDelta: 0,
            relationshipDelta: 0,
            interactions: 0,
            petCount: 0
          }
        : vitals.today),
      energyDelta,
      initiativeDelta,
      relationshipDelta
    },
    lastSimulatedAt: new Date(now).toISOString()
  };
  const moodScore = calculateMoodScore(advanced, now);
  return { ...advanced, moodScore, mood: moodLabel(moodScore) };
}
