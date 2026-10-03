import { Bot, Mic, Square } from "lucide-react";
import { useRef, useState } from "react";
import type { VoiceAgentTurnResult } from "../types";

export function VoiceAgentPanel({
  voiceProfileId
}: {
  voiceProfileId?: string;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VoiceAgentTurnResult | null>(null);
  const [stage, setStage] = useState<"idle" | "asr" | "llm" | "tts">("idle");
  const [progress, setProgress] = useState({ asr: 0, llm: 0, tts: 0 });
  const [audioSrc, setAudioSrc] = useState("");

  async function startRecording() {
    if (recording || busy) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void processAudio();
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setResult(null);
      setStage("idle");
      setProgress({ asr: 0, llm: 0, tts: 0 });
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "无法打开麦克风。"
      );
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
    setRecording(false);
  }

  async function processAudio() {
    if (!chunksRef.current.length) return;
    setBusy(true);
    setStage("asr");
    setProgress({ asr: 12, llm: 0, tts: 0 });
    try {
      const blob = new Blob(chunksRef.current, {
        type: chunksRef.current[0]?.type || "audio/webm"
      });
      const audioBytes = new Uint8Array(await blob.arrayBuffer());
      const transcription = await window.deskPet.voiceAgent.transcribe(
        audioBytes
      );
      if (!transcription.ok || !transcription.text) {
        setResult({
          ok: false,
          error: transcription.error || "没有识别到有效语音。"
        });
        setStage("idle");
        return;
      }
      setResult({ ok: true, transcript: transcription.text });
      setProgress({ asr: 100, llm: 8, tts: 0 });
      setStage("llm");

      const reply = await window.deskPet.voiceAgent.reply(
        transcription.text
      );
      if (!reply.ok || !reply.text) {
        setResult({
          ok: false,
          transcript: transcription.text,
          error: reply.warning || "对话模型没有返回文本。"
        });
        setStage("idle");
        return;
      }
      setResult({
        ok: true,
        transcript: transcription.text,
        reply: reply.text,
        source: reply.source
      });
      setProgress({ asr: 100, llm: 100, tts: 10 });
      setStage("tts");

      const speech = await window.deskPet.voiceAgent.speak(reply.text, {
        voiceProfileId,
        speech: reply.speech
      });
      setResult({
        ok: speech.ok,
        transcript: transcription.text,
        reply: reply.text,
        source: reply.source,
        warning: reply.warning,
        audioDataUrl: speech.audioDataUrl,
        error: speech.error
      });
      if (speech.audioDataUrl) {
        setAudioSrc(speech.audioDataUrl);
        setProgress({ asr: 100, llm: 100, tts: 100 });
        setStage("idle");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="voice-agent-panel">
      <div className="voice-agent-heading">
        <span className="voice-agent-icon">
          <Bot size={20} />
        </span>
        <div>
          <strong>ASR · LLM · TTS</strong>
          <span>语音识别 → 大语言模型 → 语音合成</span>
        </div>
        <button
          className={recording ? "voice-agent-record voice-agent-record--active" : "voice-agent-record"}
          type="button"
          disabled={busy}
          onClick={() => (recording ? stopRecording() : void startRecording())}
        >
          {recording ? <Square size={16} /> : <Mic size={16} />}
          {busy ? "正在处理..." : recording ? "结束录音" : "开始对话"}
        </button>
      </div>

      <div className="voice-agent-steps">
        <div
          className={`voice-agent-step ${
            result?.transcript ? "voice-agent-step--done" : ""
          } ${stage === "asr" ? "voice-agent-step--active" : ""}`}
        >
          <span>1</span>
          <strong>ASR 语音识别</strong>
          <p>{result?.transcript || "等待语音输入"}</p>
          <div className="voice-agent-progress">
            <span style={{ width: `${progress.asr}%` }} />
          </div>
        </div>
        <div
          className={`voice-agent-step ${
            result?.reply ? "voice-agent-step--done" : ""
          } ${stage === "llm" ? "voice-agent-step--active" : ""}`}
        >
          <span>2</span>
          <strong>LLM 生成回复</strong>
          <p>{result?.reply || "等待对话模型"}</p>
          <div className="voice-agent-progress">
            <span style={{ width: `${progress.llm}%` }} />
          </div>
        </div>
        <div
          className={`voice-agent-step ${
            result?.audioDataUrl ? "voice-agent-step--done" : ""
          } ${stage === "tts" ? "voice-agent-step--active" : ""}`}
        >
          <span>3</span>
          <strong>TTS 宠物发声</strong>
          <p>{result?.audioDataUrl ? "语音已生成并播放" : "等待语音合成"}</p>
          <div className="voice-agent-progress">
            <span style={{ width: `${progress.tts}%` }} />
          </div>
        </div>
      </div>

      {result?.error && <p className="voice-agent-error">{result.error}</p>}
      {result?.source && (
        <small className="voice-agent-source">
          回复来源：{result.source}
        </small>
      )}
      {audioSrc && (
        <audio className="audio-player" src={audioSrc} controls autoPlay />
      )}
    </section>
  );
}
