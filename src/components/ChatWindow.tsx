import { Send, Volume2, X } from "lucide-react";
import { useState, type CSSProperties, type FormEvent } from "react";
import { makeId } from "../lib/id";
import { useAppState } from "../state";
import type { ChatMessage } from "../types";
import { VoiceAgentPanel } from "./VoiceAgentPanel";

export function ChatWindow({ mode }: { mode: "text" | "voice" }) {
  const { state, updateState } = useAppState();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [audioSrc, setAudioSrc] = useState("");

  if (!state) return null;
  const dialogModule =
    state.customModules.find(
      (item) => item.id === state.settings.chat?.dialogModuleId
    ) || state.customModules[0];
  const activePet =
    state.pets.find((pet) => pet.id === state.activePetId) || state.pets[0];
  const voiceProfileId = activePet?.modulePlugins?.voiceProfileId || "";
  const aiModuleId = activePet?.modulePlugins?.aiModuleId || "";
  const style = {
    "--chat-bg": dialogModule?.background || "#f7f5ef",
    "--chat-border": dialogModule?.borderColor || "#d9d7d0",
    "--chat-radius": `${dialogModule?.borderRadius ?? 8}px`,
    "--chat-text": dialogModule?.textColor || "#172033",
    "--chat-user": dialogModule?.userBubbleColor || "#edf5ff",
    "--chat-assistant": dialogModule?.assistantBubbleColor || "#ffffff",
    "--chat-font": dialogModule?.fontFamily || "Microsoft YaHei UI",
    "--chat-bg-image": dialogModule?.backgroundImageUrl
      ? `url("${dialogModule.backgroundImageUrl}")`
      : "none",
    "--chat-user-image": dialogModule?.userBubbleImageUrl
      ? `url("${dialogModule.userBubbleImageUrl}")`
      : "none",
    "--chat-assistant-image": dialogModule?.assistantBubbleImageUrl
      ? `url("${dialogModule.assistantBubbleImageUrl}")`
      : "none"
  } as CSSProperties;

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;
    const userMessage: ChatMessage = {
      id: makeId("chat"),
      role: "user",
      content,
      createdAt: new Date().toISOString()
    };
    const assistantMessage: ChatMessage = {
      id: makeId("chat"),
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString()
    };
    const next = [...messages, userMessage];
    setMessages([...next, assistantMessage]);
    setDraft("");
    setBusy(true);
    const unsubscribe = window.deskPet.onChatStream(({ delta }) => {
      if (!delta) return;
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? { ...message, content: `${message.content}${delta}` }
            : message
        )
      );
    });
    try {
      const result = await window.deskPet.chatStream(
        next.map((message) => ({
          role: message.role,
          content: message.content
        })),
        aiModuleId
      );
      setMessages([
        ...next,
        {
          ...assistantMessage,
          content: result.text,
          source: result.source,
          warning: result.warning,
          speech: result.speech
        }
      ]);
    } finally {
      unsubscribe();
      setBusy(false);
    }
  }

  async function speakMessage(message: ChatMessage) {
    const result = await window.deskPet.voiceAgent.speak(message.content, {
      voiceProfileId,
      speech: message.speech
    });
    if (result.audioDataUrl) setAudioSrc(result.audioDataUrl);
  }

  return (
    <main className="chat-window-shell" style={style}>
      <header className="chat-window-header">
        <div>
          <strong>{mode === "voice" ? "语音对话" : "文字对话"}</strong>
          <span>{activePet?.name || "桌宠"}</span>
        </div>
        <select
          value={dialogModule?.id || ""}
          onChange={(event) =>
            updateState({
              settings: {
                ...state.settings,
                chat: {
                  ...state.settings.chat,
                  dialogModuleId: event.target.value
                }
              }
            })
          }
        >
          {state.customModules.map((module) => (
            <option value={module.id} key={module.id}>
              {module.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => window.close()}>
          <X size={17} />
        </button>
      </header>

      {mode === "voice" ? (
        <div className="chat-window-voice">
          <VoiceAgentPanel voiceProfileId={voiceProfileId} />
        </div>
      ) : (
        <>
          <div className="chat-window-messages">
            {messages.map((message) => (
              <div
                className={
                  message.role === "user"
                    ? "chat-window-row chat-window-row--user"
                    : "chat-window-row"
                }
                key={message.id}
              >
                <div className="chat-window-bubble">
                  <p>{message.content}</p>
                  {message.role === "assistant" && message.content && (
                    <button type="button" onClick={() => void speakMessage(message)}>
                      <Volume2 size={14} />
                      播放
                    </button>
                  )}
                  {message.warning && <small>{message.warning}</small>}
                </div>
              </div>
            ))}
          </div>
          <form className="chat-window-composer" onSubmit={sendMessage}>
            <input
              value={draft}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              placeholder="说点什么..."
            />
            <button type="submit" disabled={busy || !draft.trim()}>
              <Send size={16} />
            </button>
          </form>
        </>
      )}
      {audioSrc && <audio src={audioSrc} autoPlay controls />}
    </main>
  );
}
