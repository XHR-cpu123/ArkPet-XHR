import {
  AudioLines,
  Pencil,
  Plus,
  Save,
  Trash2,
  Volume2,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { makeId } from "../lib/id";
import { useAppState } from "../state";
import type { PetAsset, VoiceProfile } from "../types";
import { VoiceAgentPanel } from "./VoiceAgentPanel";

type VoiceDraft = {
  id: string;
  editingProfileId: string;
  name: string;
  samples: PetAsset[];
  activeSampleId: string;
  trainingClips: PetAsset[];
  trainingName: string;
  defaultAiModuleId: string;
  referenceText: string;
};

export function VoiceModuleView({
  selectedVoiceProfileId,
  onSelectVoiceProfile
}: {
  selectedVoiceProfileId: string;
  onSelectVoiceProfile: (profileId: string) => void;
}) {
  const { state, updateState } = useAppState();
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [audioSrc, setAudioSrc] = useState("");
  const [testText, setTestText] = useState("你好，我正在测试这个声音模块。");
  const [busy, setBusy] = useState(false);
  const [trainingRuntime, setTrainingRuntime] = useState<{
    ready: boolean;
    progress: number;
    phase: string;
    message: string;
  }>({
    ready: false,
    progress: 0,
    phase: "检查环境",
    message: "正在检查训练环境..."
  });

  if (!state) return null;
  const currentState = state;
  const voiceProfiles = currentState.voiceProfiles || [];
  const activePet =
    currentState.pets.find((pet) => pet.id === currentState.activePetId) ||
    currentState.pets[0];
  const boundVoiceProfile = voiceProfiles.find(
    (profile) => profile.id === activePet?.modulePlugins?.voiceProfileId
  );
  const hasVoicePlugin = Boolean(boundVoiceProfile);
  const selectedVoiceProfile =
    voiceProfiles.find((profile) => profile.id === selectedVoiceProfileId) ||
    voiceProfiles[0];
  const activeProfile =
    currentState.trainingProfiles.find(
      (profile) => profile.id === currentState.activeTrainingProfileId
    ) || currentState.trainingProfiles[0];

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const runtime = await window.deskPet.getVoiceTrainingRuntime();
      if (mounted) setTrainingRuntime(runtime);
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (!trainingRuntime.ready) void refresh();
    }, 3000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  function createDraft() {
    setDraft({
      id: makeId("voice-draft"),
      editingProfileId: "",
      name: `声音模块 ${voiceProfiles.length + 1}`,
      samples: [],
      activeSampleId: "",
      trainingClips: [],
      trainingName: `声音模块 ${voiceProfiles.length + 1} 声线`,
      defaultAiModuleId: "",
      referenceText: ""
    });
  }

  function editDraft(profile: VoiceProfile) {
    setDraft({
      id: makeId("voice-draft"),
      editingProfileId: profile.id,
      name: profile.name,
      samples: [...profile.samples],
      activeSampleId:
        profile.activeSampleId || profile.samples[0]?.id || "",
      trainingClips: [...(profile.trainingClips || [])],
      trainingName: profile.trainingName || `${profile.name} 声线`,
      defaultAiModuleId: profile.defaultAiModuleId || "",
      referenceText: profile.referenceText || ""
    });
    onSelectVoiceProfile(profile.id);
  }

  async function addSamples() {
    const current =
      draft ||
      {
        id: makeId("voice-draft"),
        editingProfileId: "",
        name: `声音模块 ${voiceProfiles.length + 1}`,
        samples: [] as PetAsset[],
        activeSampleId: "",
        trainingClips: [] as PetAsset[],
        trainingName: `声音模块 ${voiceProfiles.length + 1} 声线`,
        defaultAiModuleId: "",
        referenceText: ""
      };
    const result = await window.deskPet.stageVoiceSamples(current.id);
    if (result.canceled || !result.samples?.length) return;
    const samples = [...current.samples, ...result.samples];
    setDraft({
      ...current,
      samples,
      activeSampleId: current.activeSampleId || samples[0]?.id || ""
    });
  }

  async function removeSample(sample: PetAsset) {
    if (!draft) return;
    if (sample.relativePath.replace(/\\/g, "/").startsWith("voice-staging/")) {
      await window.deskPet.removeStagedVoiceSample(sample.relativePath);
    }
    const samples = draft.samples.filter((item) => item.id !== sample.id);
    setDraft({
      ...draft,
      samples,
      activeSampleId:
        draft.activeSampleId === sample.id
          ? samples[0]?.id || ""
          : draft.activeSampleId
    });
  }

  async function addTrainingClips() {
    if (!draft) return;
    const result = await window.deskPet.stageVoiceSamples(
      `${draft.id}-training`
    );
    if (result.canceled || !result.samples?.length) return;
    const clips = [...draft.trainingClips, ...result.samples];
    setDraft({ ...draft, trainingClips: clips });
    for (const clip of result.samples) {
      const transcription =
        await window.deskPet.transcribeVoiceTrainingSample(
          clip.relativePath
        );
      setDraft((current) =>
        current
          ? {
              ...current,
              trainingClips: current.trainingClips.map((item) =>
                item.id === clip.id
                  ? {
                      ...item,
                      transcript: transcription.text || "",
                      durationSeconds: transcription.durationSeconds || 0
                    }
                  : item
              )
            }
          : current
      );
    }
  }

  async function transcribeTrainingClip(clip: PetAsset) {
    const transcription =
      await window.deskPet.transcribeVoiceTrainingSample(clip.relativePath);
    if (!transcription.ok) {
      window.alert(transcription.error || "训练音频转写失败。");
      return;
    }
    setDraft((current) =>
      current
        ? {
            ...current,
            trainingClips: current.trainingClips.map((item) =>
              item.id === clip.id
                ? {
                    ...item,
                    transcript: transcription.text || "",
                    durationSeconds: transcription.durationSeconds || 0
                  }
                : item
            )
          }
        : current
    );
  }

  async function removeTrainingClip(clip: PetAsset) {
    if (!draft) return;
    if (clip.relativePath.replace(/\\/g, "/").startsWith("voice-staging/")) {
      await window.deskPet.removeStagedVoiceSample(clip.relativePath);
    }
    setDraft({
      ...draft,
      trainingClips: draft.trainingClips.filter((item) => item.id !== clip.id)
    });
  }

  async function prepareTraining() {
    if (!draft) return;
    const result = await window.deskPet.prepareVoiceTraining(
      draft.editingProfileId || draft.id,
      draft.trainingClips
    );
    if (!result.ok) {
      window.alert(result.error || "无法准备声线训练数据。");
      return;
    }
    window.alert(
      "声线档案已创建，训练音频和转写已经保存。下一步将接入正式微调执行器。"
    );
  }

  const trainingSeconds = (draft?.trainingClips || []).reduce(
    (total, clip) => total + Number(clip.durationSeconds || 0),
    0
  );
  const trainingRequirementsMet =
    Boolean(draft) &&
    (draft!.trainingClips.length >= 3 || trainingSeconds >= 60);
  const transcribedCount = (draft?.trainingClips || []).filter((clip) =>
    clip.transcript?.trim()
  ).length;
  const datasetProgress = !draft
    ? 0
    : Math.min(
        100,
        Math.round(
          (draft.trainingClips.length
            ? 30 +
              (transcribedCount / draft.trainingClips.length) * 40
            : 0) +
            (trainingRequirementsMet ? 30 : 0)
        )
      );
  const datasetPhase = !draft
    ? "尚未建立声线档案"
    : trainingRequirementsMet
      ? transcribedCount === draft.trainingClips.length
        ? "声线档案数据已就绪"
        : "等待完成音频转写"
      : "继续添加音频";

  async function cancelDraft() {
    if (draft) {
      await Promise.all(
        draft.samples
          .filter((sample) =>
            sample.relativePath
              .replace(/\\/g, "/")
              .startsWith("voice-staging/")
          )
          .map((sample) =>
            window.deskPet.removeStagedVoiceSample(sample.relativePath)
          )
      );
    }
    setDraft(null);
  }

  async function saveDraft() {
    if (!draft || !draft.samples.length) {
      window.alert("请先添加至少一个声音样本。");
      return;
    }
    const now = new Date().toISOString();
    const existing = voiceProfiles.find(
      (profile) => profile.id === draft.editingProfileId
    );
    const profile: VoiceProfile = {
      id: existing?.id || makeId("voice"),
      name: draft.name.trim() || "声音模块",
      samples: draft.samples,
      activeSampleId: draft.activeSampleId || draft.samples[0]?.id || "",
      trainingClips: draft.trainingClips,
      trainingName:
        draft.trainingName.trim() ||
        existing?.trainingName ||
        `${draft.name || "声音模块"} 声线`,
      trainingStatus: existing?.trainingStatus || "draft",
      trainedModels: existing?.trainedModels,
      defaultAiModuleId: draft.defaultAiModuleId,
      voiceId: existing?.voiceId || "",
      engineType: "gpt-sovits",
      baseUrl: existing?.baseUrl || "http://127.0.0.1:9880",
      model: existing?.model || "",
      apiKey: existing?.apiKey || "",
      localModelPath: existing?.localModelPath || "",
      referenceText: draft.referenceText,
      status: "ready",
      createdAt: existing?.createdAt || now
    };
    const nextProfiles = existing
      ? voiceProfiles.map((item) => (item.id === existing.id ? profile : item))
      : [profile, ...voiceProfiles];
    const nextTrainingProfiles = activeProfile
      ? currentState.trainingProfiles.map((item) =>
          item.id === activeProfile.id
            ? {
                ...item,
                voiceProfileIds: [
                  ...new Set([...(item.voiceProfileIds || []), profile.id])
                ],
                updatedAt: now
              }
            : item
        )
      : currentState.trainingProfiles;
    await updateState({
      voiceProfiles: nextProfiles,
      trainingProfiles: nextTrainingProfiles
    });
    onSelectVoiceProfile(profile.id);
    setDraft(null);
  }

  async function playSynthesized(profile: VoiceProfile) {
    if (!testText.trim() || busy) return;
    setBusy(true);
    try {
      const result = await window.deskPet.speak(
        testText,
        profile.voiceId,
        {
          baseUrl: profile.baseUrl,
          model: profile.model,
          apiKey: profile.apiKey,
          voiceId: profile.voiceId,
          voiceProfileId: profile.id,
          engineType: profile.engineType,
          referenceText: profile.referenceText
        }
      );
      if (result.ok && result.audioDataUrl) {
        setAudioSrc(result.audioDataUrl);
      } else {
        window.alert(result.error || "声音服务没有返回音频。");
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteProfile(profile: VoiceProfile) {
    if (!window.confirm(`确定删除声音模块“${profile.name}”吗？`)) return;
    await updateState({
      voiceProfiles: voiceProfiles.filter((item) => item.id !== profile.id),
      trainingProfiles: currentState.trainingProfiles.map((item) => ({
        ...item,
        voiceProfileIds: (item.voiceProfileIds || []).filter(
          (profileId) => profileId !== profile.id
        )
      }))
    });
    onSelectVoiceProfile("");
  }

  return (
    <div className="form-section">
      <div className="section-heading">
        <span className="section-kicker">声音模块</span>
        <h2>固定声音编辑区</h2>
        <p>
          新样本先进入编辑区，只有点击保存后才会出现在模块库。编辑过程中不会反复新增模块卡片。
        </p>
      </div>

      {hasVoicePlugin ? (
        <VoiceAgentPanel
          voiceProfileId={
            boundVoiceProfile?.id || selectedVoiceProfile?.id
          }
        />
      ) : (
        <section className="voice-agent-disabled">
          <strong>当前桌宠还没有绑定语音插件</strong>
          <span>
            请先在“桌宠唤醒 → 模组插件”中绑定声音模块。绑定后这里才会启用“听、想、说”语音对话。
          </span>
        </section>
      )}

      <section className="voice-workbench">
        <div className="voice-workbench-header">
          <div>
            <strong>{draft ? draft.name : "声音模块编辑区"}</strong>
            <span>
              {draft
                ? `${draft.samples.length} 个待保存样本`
                : "选择已有模块编辑，或新建一个模块"}
            </span>
          </div>
          {!draft && (
            <button className="primary-small" type="button" onClick={createDraft}>
              <Plus size={16} />
              新建声音模块
            </button>
          )}
        </div>

        {draft && (
          <div className="voice-draft-editor">
            <label>
              <span>模块名称</span>
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </label>
            <label>
              <span>参考音频原话</span>
              <input
                value={draft.referenceText}
                placeholder="可留空；填写后声线会更稳定"
                onChange={(event) =>
                  setDraft({ ...draft, referenceText: event.target.value })
                }
              />
            </label>
            <label>
              <span>默认 AI 模块</span>
              <select
                value={draft.defaultAiModuleId}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    defaultAiModuleId: event.target.value
                  })
                }
              >
                <option value="">未设置默认 AI 模块</option>
                {currentState.trainingProfiles
                  .filter((profile) => profile.status !== "draft")
                  .map((profile) => (
                    <option value={profile.id} key={profile.id}>
                      {profile.name}
                    </option>
                  ))}
              </select>
            </label>

            <div className="voice-sample-strip">
              {draft.samples.map((sample, index) => (
                <button
                  className={
                    draft.activeSampleId === sample.id
                      ? "voice-sample-chip voice-sample-chip--active"
                      : "voice-sample-chip"
                  }
                  key={sample.id}
                  type="button"
                  onClick={() => {
                    setDraft({ ...draft, activeSampleId: sample.id });
                    setAudioSrc(sample.url);
                  }}
                >
                  <AudioLines size={15} />
                  样本 {index + 1}
                  <Trash2
                    size={13}
                    onClick={(event) => {
                      event.stopPropagation();
                      void removeSample(sample);
                    }}
                  />
                </button>
              ))}
              {draft.samples.length === 0 && (
                <span className="empty-copy">还没有待保存的样本。</span>
              )}
            </div>

            <section className="voice-training-panel">
              <div className="voice-training-heading">
                <div>
                  <strong>声线训练</strong>
                  <span>
                    至少 3 段或总时长 1 分钟；Whisper 转写后可手动修改
                  </span>
                </div>
                <button type="button" onClick={() => void addTrainingClips()}>
                  <Plus size={15} />
                  添加训练音频
                </button>
              </div>
              <label className="voice-training-name">
                <span>声线名称</span>
                <input
                  value={draft.trainingName}
                  placeholder="例如：艾雅法拉专属声线"
                  onChange={(event) =>
                    setDraft({ ...draft, trainingName: event.target.value })
                  }
                />
              </label>
              <div className="voice-training-progress">
                <div>
                  <span>{trainingRuntime.phase}</span>
                  <strong>{Math.round(trainingRuntime.progress)}%</strong>
                </div>
                <span>
                  <i
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, trainingRuntime.progress)
                      )}%`
                    }}
                  />
                </span>
              </div>
              <div className="voice-training-progress voice-training-progress--dataset">
                <div>
                  <span>{datasetPhase}</span>
                  <strong>{datasetProgress}%</strong>
                </div>
                <span>
                  <i style={{ width: `${datasetProgress}%` }} />
                </span>
              </div>
              <div className="voice-training-clips">
                {draft.trainingClips.map((clip, index) => (
                  <article className="voice-training-clip" key={clip.id}>
                    <div>
                      <strong>训练音频 {index + 1}</strong>
                      <span>
                        {clip.durationSeconds
                          ? `${clip.durationSeconds.toFixed(1)} 秒`
                          : "正在读取时长"}
                      </span>
                    </div>
                    <textarea
                      value={clip.transcript || ""}
                      rows={2}
                      placeholder="等待 Whisper 转写，或手动填写这段音频的原话"
                      onChange={(event) => {
                        const transcript = event.target.value;
                        setDraft({
                          ...draft,
                          trainingClips: draft.trainingClips.map((item) =>
                            item.id === clip.id
                              ? { ...item, transcript }
                              : item
                          )
                        });
                      }}
                    />
                    <div className="voice-training-clip-actions">
                      <button
                        type="button"
                        onClick={() => void transcribeTrainingClip(clip)}
                      >
                        重新转写
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeTrainingClip(clip)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                ))}
                {draft.trainingClips.length === 0 && (
                  <p className="empty-copy">还没有训练音频。</p>
                )}
              </div>
              <div className="voice-training-footer">
                <span>
                  当前累计：{trainingSeconds.toFixed(1)} 秒 ·{" "}
                  {draft.trainingClips.length} 段
                </span>
                <button
                  className="primary-small"
                  type="button"
                  disabled={!trainingRequirementsMet || !trainingRuntime.ready}
                  onClick={() => void prepareTraining()}
                >
                  {trainingRuntime.ready ? "准备训练数据" : "等待 CUDA 12.8"}
                </button>
              </div>
              <p className="voice-training-runtime">{trainingRuntime.message}</p>
            </section>

            <div className="voice-draft-actions">
              <button type="button" onClick={() => void addSamples()}>
                <Plus size={16} />
                添加声音样本
              </button>
              <button
                className="primary-small"
                type="button"
                onClick={() => void saveDraft()}
              >
                <Save size={16} />
                保存声音模块
              </button>
              <button type="button" onClick={() => void cancelDraft()}>
                <X size={16} />
                取消
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="voice-test-panel">
        <div>
          <strong>
            当前测试：{selectedVoiceProfile?.name || "未选择声音模块"}
          </strong>
          <span>
            {selectedVoiceProfile
              ? `${selectedVoiceProfile.samples.length} 个样本 · 本机 GPT-SoVITS`
              : "保存声音模块后即可试听"}
          </span>
        </div>
        <textarea
          value={testText}
          onChange={(event) => setTestText(event.target.value)}
          rows={3}
          placeholder="输入要试听的话..."
        />
        <button
          className="primary-small"
          type="button"
          disabled={!selectedVoiceProfile || busy}
          onClick={() =>
            selectedVoiceProfile && void playSynthesized(selectedVoiceProfile)
          }
        >
          <Volume2 size={16} />
          {busy ? "正在合成..." : "播放试听"}
        </button>
      </div>

      <div className="voice-current-module">
        <div>
          <span>当前正在运行</span>
          <strong>{selectedVoiceProfile?.name || "未选择声音模块"}</strong>
          <small>
            {selectedVoiceProfile
              ? `${selectedVoiceProfile.samples.length} 个样本 · ${
                  currentState.trainingProfiles.find(
                    (item) =>
                      item.id === selectedVoiceProfile.defaultAiModuleId
                  )?.name || "未设置默认 AI 模块"
                }`
              : "请从左侧声音模块库中选择"}
          </small>
        </div>
        {selectedVoiceProfile && (
          <div className="voice-current-actions">
            <button
              type="button"
              onClick={() => void editDraft(selectedVoiceProfile)}
            >
              <Pencil size={15} />
              编辑
            </button>
            <button
              type="button"
              title="删除声音模块"
              onClick={() => void deleteProfile(selectedVoiceProfile)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>

      {audioSrc && (
        <audio className="audio-player" src={audioSrc} controls autoPlay />
      )}
    </div>
  );
}
