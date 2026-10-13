import { clamp } from "./format";
import type { PetProfile } from "../types";

 const DESKTOP_RELATIONSHIP_PER_HOUR = 1.6;

function dayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function ensurePetCompanionState(
  pet: PetProfile,
  now = Date.now()
): PetProfile {
  const currentDay = dayKey(now);
  return {
    ...pet,
    desktopRelationship: clamp(
      Number(pet.desktopRelationship ?? 12),
      0,
      100
    ),
    desktopSecondsToday:
      pet.desktopDayKey === currentDay
        ? Math.max(0, Number(pet.desktopSecondsToday || 0))
        : 0,
    desktopSecondsTotal: Math.max(
      0,
      Number(pet.desktopSecondsTotal || 0)
    ),
    desktopDayKey: currentDay,
    desktopSampleAt: pet.desktopSampleAt || new Date(now).toISOString()
  };
}

export function addPetRelationship(
  pet: PetProfile,
  amount: number,
  now = Date.now()
) {
  const current = ensurePetCompanionState(pet, now);
  return {
    ...current,
    desktopRelationship: clamp(
      Number(current.desktopRelationship || 0) + amount,
      0,
      100
    )
  };
}

export function trackPetDesktopTime(
  pet: PetProfile,
  active: boolean,
  now = Date.now()
) {
  const current = ensurePetCompanionState(pet, now);
  const sampleAt = new Date(current.desktopSampleAt || now).getTime();
  const elapsedMinutes = Number.isFinite(sampleAt)
    ? clamp((now - sampleAt) / 60000, 0, 5)
    : 0;
  if (!active) {
    return {
      ...current,
      desktopSampleAt: new Date(now).toISOString()
    };
  }
  const elapsedSeconds = elapsedMinutes * 60;
  return {
    ...current,
    desktopRelationship: clamp(
      Number(current.desktopRelationship || 0) +
        (elapsedMinutes / 60) * DESKTOP_RELATIONSHIP_PER_HOUR,
      0,
      100
    ),
    desktopSecondsToday: Number(current.desktopSecondsToday || 0) + elapsedSeconds,
    desktopSecondsTotal: Number(current.desktopSecondsTotal || 0) + elapsedSeconds,
    desktopSampleAt: new Date(now).toISOString()
  };
}
