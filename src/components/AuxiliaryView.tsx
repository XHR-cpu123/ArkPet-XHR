import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppState } from "../types";

export function AuxiliaryView({ auxiliaryId }: { auxiliaryId: string }) {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    let mounted = true;
    window.deskPet.getState().then((nextState) => {
      if (mounted) setState(nextState);
    });
    const unsubscribe = window.deskPet.onStateChanged(setState);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const auxiliary = state?.auxiliaryWindows.find((item) => item.id === auxiliaryId);

  if (!auxiliary) {
    return (
      <main className="auxiliary-window auxiliary-window--missing">
        <h1>窗口配置不存在</h1>
        <button type="button" onClick={() => window.close()}>
          关闭
        </button>
      </main>
    );
  }

  return (
    <main className="auxiliary-window">
      <header className="auxiliary-header">
        <div>
          <span>桌宠临时落脚点</span>
          <h1>{auxiliary.title}</h1>
        </div>
        <button
          className="window-close"
          type="button"
          title="关闭窗口"
          onClick={() => window.close()}
        >
          <X size={18} />
        </button>
      </header>
      <article className="auxiliary-body">
        <p>{auxiliary.body}</p>
        <div className="auxiliary-decoration">
          <span />
          <span />
          <span />
        </div>
      </article>
      <footer className="auxiliary-footer">
        <span>{auxiliary.name}</span>
        <span>
          {auxiliary.width} x {auxiliary.height}
        </span>
      </footer>
    </main>
  );
}
