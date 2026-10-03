import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Mic,
  Package,
  Plus,
  Trash2,
  Volume2
} from "lucide-react";
import { useState } from "react";
import { useAppState } from "../state";
import type {
  LocalModelKind,
  LocalModelRecord,
  ServiceConfig
} from "../types";

const modelKinds: Array<{
  id: LocalModelKind;
  label: string;
  description: string;
  icon: typeof Package;
}> = [
  {
    id: "tts",
    label: "语音合成",
    description: "可选：已训练的 .ckpt + .pth 声线权重",
    icon: Volume2
  },
  {
    id: "asr",
    label: "语音识别",
    description: "Whisper 模型文件夹",
    icon: Mic
  },
  {
    id: "llm",
    label: "对话模型",
    description: ".safetensors 或 .gguf",
    icon: Cpu
  }
];

function statusText(model: LocalModelRecord) {
  if (model.status === "ready") return "可用";
  if (model.status === "needs-files") return "缺少文件";
  if (model.status === "unsupported") return "暂未适配";
  return "文件异常";
}

export function ModelManagerView() {
  const { state, updateState } = useAppState();
  const [busyKind, setBusyKind] = useState<LocalModelKind | "">("");

  if (!state) return null;
  const models = state.localModels || [];
  const localInference = state.localInference || {
    llmModelId: "",
    asrModelId: "",
    ttsModelId: ""
  };

  async function saveServiceMode(
    service: LocalModelKind,
    mode: "local" | "api"
  ) {
    const config = state?.settings.services[service];
    await updateState({
      settings: {
        ...state?.settings,
        services: {
          ...state?.settings.services,
          [service]: {
            ...config,
            mode
          }
        }
      }
    });
  }

  async function saveServiceField(
    service: LocalModelKind,
    patch: Partial<ServiceConfig>
  ) {
    const config = state?.settings.services[service];
    await updateState({
      settings: {
        ...state?.settings,
        services: {
          ...state?.settings.services,
          [service]: {
            ...config,
            ...patch,
            mode: "api"
          }
        }
      }
    });
  }

  async function importModel(
    kind: LocalModelKind,
    mode?: "file" | "folder"
  ) {
    if (busyKind) return;
    setBusyKind(kind);
    try {
      const selection = await window.deskPet.chooseLocalModel(kind, mode);
      if (selection.canceled || !selection.path) return;
      const result = await window.deskPet.inspectLocalModel(
        kind,
        selection.path
      );
      const model = result.model;
      if (!result.ok || !model) {
        window.alert(result.error || "无法识别这个模型文件。");
        return;
      }
      const nextModels = models.filter(
        (item) =>
          !(
            item.kind === model.kind &&
            item.sourcePath === model.sourcePath
          )
      );
      await updateState({ localModels: [model, ...nextModels] });
    } finally {
      setBusyKind("");
    }
  }

  return (
    <div className="form-section model-manager">
      <div className="section-heading">
        <span className="section-kicker">本地模型</span>
        <h2>模型文件检查与挂载</h2>
        <p>
          软件不负责下载模型。你选择已经下载好的本地文件或文件夹后，它会识别格式、检查必需文件并登记到本地模型库。
        </p>
      </div>

      <div className="model-kind-grid">
        {modelKinds.map((kind) => {
          const Icon = kind.icon;
          const count = models.filter((model) => model.kind === kind.id).length;
          return (
            <article className="model-kind-card" key={kind.id}>
              <div className="model-kind-heading">
                <span className="model-kind-icon">
                  <Icon size={19} />
                </span>
                <div>
                  <strong>{kind.label}</strong>
                  <span>{kind.description}</span>
                </div>
                <em>{count}</em>
              </div>
              <div className="model-mode-toggle">
                <button
                  className={
                    (state.settings.services[kind.id].mode || "local") ===
                    "local"
                      ? "model-mode-button model-mode-button--active"
                      : "model-mode-button"
                  }
                  type="button"
                  onClick={() => void saveServiceMode(kind.id, "local")}
                >
                  本地模式
                </button>
                <button
                  className={
                    state.settings.services[kind.id].mode === "api"
                      ? "model-mode-button model-mode-button--active"
                      : "model-mode-button"
                  }
                  type="button"
                  onClick={() => void saveServiceMode(kind.id, "api")}
                >
                  API 模式
                </button>
              </div>
              {state.settings.services[kind.id].mode === "api" ? (
                <div className="model-api-fields">
                  <label>
                    <span>服务地址</span>
                    <input
                      defaultValue={
                        state.settings.services[kind.id].baseUrl
                      }
                      onBlur={(event) =>
                        void saveServiceField(kind.id, {
                          baseUrl: event.target.value
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>
                      {kind.id === "tts" ? "声线 ID" : "模型名称"}
                    </span>
                    <input
                      defaultValue={
                        kind.id === "tts"
                          ? state.settings.services[kind.id].voiceId || ""
                          : state.settings.services[kind.id].model
                      }
                      onBlur={(event) =>
                        void saveServiceField(
                          kind.id,
                          kind.id === "tts"
                            ? { voiceId: event.target.value }
                            : { model: event.target.value }
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>API Key</span>
                    <input
                      type="password"
                      defaultValue={
                        state.settings.services[kind.id].apiKey
                      }
                      onBlur={(event) =>
                        void saveServiceField(kind.id, {
                          apiKey: event.target.value
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await window.deskPet.testService(kind.id);
                      window.alert(
                        result.ok
                          ? "API 连接正常"
                          : result.error || "API 连接失败"
                      );
                    }}
                  >
                    测试 API 连接
                  </button>
                </div>
              ) : kind.id === "llm" ? (
                <div className="model-kind-actions">
                  <button
                    type="button"
                    disabled={Boolean(busyKind)}
                    onClick={() => void importModel(kind.id, "file")}
                  >
                    <Plus size={15} />
                    选择单个 .safetensors
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busyKind)}
                    onClick={() => void importModel(kind.id, "folder")}
                  >
                    <Plus size={15} />
                    选择完整模型文件夹
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(busyKind)}
                  onClick={() => void importModel(kind.id)}
                >
                  <Plus size={16} />
                  {busyKind === kind.id ? "正在检查..." : "选择本地模型"}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <section className="model-family-panel">
        <div className="panel-heading">
          <Package size={18} />
          <h3>对话模型适配</h3>
        </div>
        <div className="model-family-list">
          <span className="model-family-chip model-family-chip--primary">Qwen</span>
          <span className="model-family-chip model-family-chip--primary">
            DeepSeek
          </span>
          <span className="model-family-chip">GGUF</span>
          <span className="model-family-chip">Llama</span>
          <span className="model-family-chip">Mistral</span>
          <span className="model-family-chip">Gemma</span>
        </div>
        <p>
          Qwen 与 DeepSeek 作为首版重点适配；GGUF、Llama、Mistral 和 Gemma
          保留同样的接入位置，后续增加适配包即可启用。
        </p>
      </section>

      <div className="model-library-list">
        {models.map((model) => (
          <article className="model-library-item" key={model.id}>
            <span
              className={
                model.status === "ready"
                  ? "model-status-icon model-status-icon--ready"
                  : "model-status-icon"
              }
            >
              {model.status === "ready" ? (
                <CheckCircle2 size={18} />
              ) : (
                <AlertTriangle size={18} />
              )}
            </span>
            <div>
              <strong>{model.name}</strong>
              <span>
                {modelKinds.find((kind) => kind.id === model.kind)?.label} ·{" "}
                {model.format.toUpperCase()} · {statusText(model)}
                {model.parameterSize ? ` · ${model.parameterSize}` : ""}
              </span>
              <code>{model.sourcePath}</code>
              <p>{model.validationMessage}</p>
              <button
                className={
                  (model.kind === "llm" &&
                    localInference.llmModelId === model.id) ||
                  (model.kind === "asr" &&
                    localInference.asrModelId === model.id) ||
                  (model.kind === "tts" &&
                    localInference.ttsModelId === model.id)
                    ? "model-use-button model-use-button--active"
                    : "model-use-button"
                }
                type="button"
                disabled={model.status !== "ready"}
                onClick={() =>
                  void window.deskPet.voiceAgent.setModel(model.kind, model.id)
                }
              >
                {model.kind === "llm"
                  ? "设为当前对话模型"
                  : model.kind === "asr"
                    ? "设为当前识别模型"
                    : "设为当前声线模型"}
              </button>
            </div>
            <button
              type="button"
              title="从模型库移除"
              onClick={() =>
                void updateState({
                  localModels: models.filter((item) => item.id !== model.id)
                })
              }
            >
              <Trash2 size={16} />
            </button>
          </article>
        ))}
        {models.length === 0 && (
          <p className="empty-copy">还没有导入本地模型。</p>
        )}
      </div>
    </div>
  );
}
