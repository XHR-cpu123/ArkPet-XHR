import type { AppState, CustomDialogModule } from "../types";

function isUsableDialogModule(module: CustomDialogModule) {
  return module.kind === "dialog-box" && module.enabled !== false;
}

export function resolveDialogModule(
  state: Pick<AppState, "customModules" | "settings">
): CustomDialogModule | undefined {
  const selectedId = state.settings.chat?.dialogModuleId || "";
  return (
    state.customModules.find(
      (module) => module.id === selectedId && isUsableDialogModule(module)
    ) || state.customModules.find(isUsableDialogModule)
  );
}

export function listDialogModules(state: Pick<AppState, "customModules">) {
  return state.customModules.filter((module) => module.kind === "dialog-box");
}
