import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuxiliaryView } from "./components/AuxiliaryView";
import { ChatWindow } from "./components/ChatWindow";
import { MultiPetOverlay } from "./components/MultiPetOverlay";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element.");

const params = new URLSearchParams(window.location.search);
const view = params.get("view") || "";

let content = <App />;
if (view === "overlay") {
  document.documentElement.classList.add("overlay-document");
  document.body.classList.add("overlay-document");
  content = <MultiPetOverlay />;
} else if (view.startsWith("aux:")) {
  content = <AuxiliaryView auxiliaryId={view.slice(4)} />;
} else if (view.startsWith("chat:")) {
  content = <ChatWindow mode={view.slice(5) === "voice" ? "voice" : "text"} />;
}

createRoot(root).render(<StrictMode>{content}</StrictMode>);
