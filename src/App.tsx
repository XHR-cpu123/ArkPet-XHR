import { AppShell } from "./components/AppShell";
import { StateProvider } from "./state";

export function App() {
  return (
    <StateProvider>
      <AppShell />
    </StateProvider>
  );
}
