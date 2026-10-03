const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { spawn } = require("node:child_process");

class LocalInferenceManager {
  constructor({ pythonPath, scriptPath, cwd, logPath }) {
    this.pythonPath = pythonPath;
    this.scriptPath = scriptPath;
    this.cwd = cwd;
    this.logPath = logPath;
    this.workers = new Map();
  }

  findSelectedModel(state, kind, explicitModelId = "") {
    const settingKey =
      kind === "llm"
        ? "llmModelId"
        : kind === "asr"
          ? "asrModelId"
          : "ttsModelId";
    const modelId = explicitModelId || state.localInference?.[settingKey];
    if (!modelId) return null;
    return (
      (state.localModels || []).find(
        (model) =>
          model.id === modelId &&
          model.kind === kind &&
          model.format !== "api"
      ) || null
    );
  }

  getWorker(kind, model) {
    const key = `${kind}:${model.sourcePath}:${model.modelId || ""}`;
    const existing = this.workers.get(key);
    if (existing) return existing;
    const worker = this.startWorker(kind, model);
    worker.startPromise.catch(() => {
      this.workers.delete(key);
    });
    this.workers.set(key, worker);
    return worker;
  }

  startWorker(kind, model) {
    let nextId = 1;
    const pending = new Map();
    const worker = {
      process: null,
      ready: false,
      startPromise: null,
      pending,
      stderr: "",
      nextId
    };

    const failPending = (error) => {
      for (const entry of pending.values()) entry.reject(error);
      pending.clear();
    };

    worker.startPromise = new Promise((resolve, reject) => {
      worker.process = spawn(
        this.pythonPath,
        [
          this.scriptPath,
          "--kind",
          kind,
          "--source-path",
          model.sourcePath,
          "--model-id",
          model.modelId || ""
        ],
        {
          cwd: this.cwd,
          windowsHide: true,
          env: {
            ...process.env,
            CUDA_VISIBLE_DEVICES: "-1",
            PYTHONIOENCODING: "utf-8"
          },
          stdio: ["pipe", "pipe", "pipe"]
        }
      );

      const logStream = fs.createWriteStream(this.logPath, { flags: "a" });
      const lines = readline.createInterface({ input: worker.process.stdout });
      lines.on("line", (line) => {
        let payload;
        try {
          payload = JSON.parse(line);
        } catch {
          logStream.write(`${line}\n`);
          return;
        }
        if (payload.type === "ready") {
          worker.ready = true;
          resolve(worker);
          return;
        }
        if (payload.type === "error") {
          const error = new Error(payload.error || "本地模型加载失败。");
          if (!worker.ready) reject(error);
          failPending(error);
          return;
        }
        const request = pending.get(payload.id);
        if (!request) return;
        pending.delete(payload.id);
        if (payload.error) {
          request.reject(new Error(payload.error));
        } else {
          request.resolve(payload);
        }
      });
      worker.process.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        worker.stderr = `${worker.stderr}${text}`.slice(-6000);
        logStream.write(text);
      });
      worker.process.once("error", (error) => {
        if (!worker.ready) reject(error);
        failPending(error);
      });
      worker.process.once("exit", (code) => {
        const detail = worker.stderr.trim().split(/\r?\n/).slice(-4).join(" ");
        const error = new Error(
          detail || `本地模型进程已退出，退出码 ${code ?? "未知"}。`
        );
        if (!worker.ready) reject(error);
        failPending(error);
        this.workers.delete(`${kind}:${model.sourcePath}:${model.modelId || ""}`);
        logStream.end();
      });
    });

    worker.request = async (payload) => {
      await worker.startPromise;
      const requestId = worker.nextId++;
      return new Promise((resolve, reject) => {
        worker.pending.set(requestId, { resolve, reject });
        worker.process.stdin.write(
          `${JSON.stringify({ id: requestId, ...payload })}\n`
        );
      });
    };

    return worker;
  }

  async chat(state, messages, options = {}) {
    const model = this.findSelectedModel(
      state,
      "llm",
      options.modelId || ""
    );
    if (!model) return null;
    const worker = this.getWorker("llm", model);
    const result = await worker.request({
      messages,
      temperature: Number(state.character?.temperature ?? 0.8),
      max_new_tokens: 160
    });
    return {
      ok: true,
      source: "local-model",
      text: String(result.text || "").trim()
    };
  }

  async transcribe(state, filePath) {
    const model = this.findSelectedModel(state, "asr");
    if (!model) return null;
    const worker = this.getWorker("asr", model);
    const result = await worker.request({ audio_path: filePath });
    return {
      ok: true,
      text: String(result.text || "").trim()
    };
  }

  preload(state, kind) {
    const model = this.findSelectedModel(state, kind);
    if (!model || model.status !== "ready") return null;
    return this.getWorker(kind, model).startPromise;
  }

  stopAll() {
    for (const worker of this.workers.values()) {
      try {
        worker.process?.kill();
      } catch {
        // The worker may have already exited.
      }
    }
    this.workers.clear();
  }
}

module.exports = {
  LocalInferenceManager
};
