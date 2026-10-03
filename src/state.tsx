import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { AppState } from "./types";

type StateContextValue = {
  state: AppState | null;
  updateState: (patch: Record<string, unknown>) => Promise<AppState>;
  replaceState: (state: AppState) => Promise<AppState>;
  refresh: () => Promise<void>;
};

const StateContext = createContext<StateContextValue | null>(null);

export function StateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    let mounted = true;
    window.deskPet.getState().then((nextState) => {
      if (mounted) setState(nextState);
    });
    const unsubscribe = window.deskPet.onStateChanged((nextState) => {
      if (mounted) setState(nextState);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<StateContextValue>(
    () => ({
      state,
      async updateState(patch) {
        const nextState = await window.deskPet.updateState(patch);
        setState(nextState);
        return nextState;
      },
      async replaceState(nextState) {
        const stateValue = await window.deskPet.replaceState(nextState);
        setState(stateValue);
        return stateValue;
      },
      async refresh() {
        setState(await window.deskPet.getState());
      }
    }),
    [state]
  );

  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
}

export function useAppState() {
  const context = useContext(StateContext);
  if (!context) throw new Error("useAppState must be used inside StateProvider.");
  return context;
}
