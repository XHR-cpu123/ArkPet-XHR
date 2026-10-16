import { clamp } from "./format";
import type {
  CustomDialogModule,
  ModuleMetric,
  PetModuleStateValue,
  PetProfile
} from "../types";

export type ModuleStateMap = Record<
  string,
  Record<string, PetModuleStateValue>
>;

export type PetMetricSnapshot = {
  moduleId: string;
  moduleName: string;
  metric: ModuleMetric;
  value: number;
};

export function boundModules(
  pet: PetProfile,
  modules: CustomDialogModule[]
): CustomDialogModule[] {
  const boundIds = pet.modulePlugins?.boundModuleIds || [];
  return modules.filter(
    (module) => module.enabled !== false && boundIds.includes(module.id)
  );
}

export function readModuleMetric(
  pet: PetProfile,
  moduleId: string,
  metric: ModuleMetric
): number {
  const raw = pet.moduleState?.[moduleId]?.[metric.key];
  const value = Number(raw);
  if (Number.isFinite(value)) return value;
  return Number.isFinite(metric.max) ? Number(metric.max) : 0;
}

export function writeModuleMetric(
  moduleState: ModuleStateMap | undefined,
  moduleId: string,
  key: string,
  value: PetModuleStateValue
): ModuleStateMap {
  const current = moduleState || {};
  return {
    ...current,
    [moduleId]: {
      ...(current[moduleId] || {}),
      [key]: value
    }
  };
}

export function decayModuleMetrics(
  pet: PetProfile,
  modules: CustomDialogModule[],
  elapsedMinutes: number
): { moduleState: ModuleStateMap; changed: boolean } {
  let moduleState: ModuleStateMap = pet.moduleState || {};
  let changed = false;
  for (const module of boundModules(pet, modules)) {
    for (const metric of module.metrics || []) {
      const decay = Number(metric.decayPerMinute || 0);
      if (!Number.isFinite(decay) || decay <= 0) continue;
      const min = Number.isFinite(metric.min) ? Number(metric.min) : 0;
      const max = Number.isFinite(metric.max) ? Number(metric.max) : 100;
      const current = readModuleMetric(pet, module.id, metric);
      const next = clamp(current - decay * elapsedMinutes, min, max);
      if (Math.abs(next - current) < 0.001) continue;
      moduleState = writeModuleMetric(moduleState, module.id, metric.key, next);
      changed = true;
    }
  }
  return { moduleState, changed };
}

export function listPetMetrics(
  pet: PetProfile,
  modules: CustomDialogModule[]
): PetMetricSnapshot[] {
  const result: PetMetricSnapshot[] = [];
  for (const module of boundModules(pet, modules)) {
    for (const metric of module.metrics || []) {
      result.push({
        moduleId: module.id,
        moduleName: module.name,
        metric,
        value: readModuleMetric(pet, module.id, metric)
      });
    }
  }
  return result;
}

export function hasDialogueModule(pet: PetProfile): boolean {
  return Boolean(pet.modulePlugins?.aiModuleId);
}

export function hasVoiceModule(pet: PetProfile): boolean {
  return Boolean(pet.modulePlugins?.voiceProfileId);
}
