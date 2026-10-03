export type PetAsset = {
  id: string;
  name: string;
  relativePath: string;
  url: string;
  size: number;
  durationSeconds?: number;
  transcript?: string;
  createdAt: string;
};

export type AnimationMap = {
  idle: string;
  walk: string;
  fall: string;
  land: string;
  drag: string;
  sleep: string;
};

export type SpineBundle = {
  skelUrl: string;
  atlasUrl: string;
  textureUrl: string;
  folder: string;
  animations: string[];
  animationDurations?: Record<string, number>;
};

export type SpinePartKind = "skeleton" | "atlas" | "texture";

export type SpineStagedPart = PetAsset & {
  kind: SpinePartKind;
};

export type BoneRoleMap = Partial<
  Record<
    | "root"
    | "hip"
    | "spine"
    | "chest"
    | "head"
    | "leftUpperLeg"
    | "leftLowerLeg"
    | "leftFoot"
    | "rightUpperLeg"
    | "rightLowerLeg"
    | "rightFoot"
    | "leftUpperArm"
    | "leftLowerArm"
    | "rightUpperArm"
    | "rightLowerArm",
    string
  >
>;

export type ActionBindings = Record<string, string>;

export type PetRenderConfig = {
  displayWidth: number;
  displayHeight: number;
  visualWidth?: number;
  visualHeight?: number;
  hitboxWidth: number;
  hitboxHeight: number;
  hitboxOffsetX: number;
  hitboxOffsetY: number;
  offsetX: number;
  offsetY: number;
};

export type PetModulePlugins = {
  voiceProfileId?: string;
  aiModuleId?: string;
  boundModuleIds?: string[];
  custom?: {
    source: "voice" | "ai" | "training";
    itemId: string;
  };
};

export type PetProfile = {
  id: string;
  name: string;
  title: string;
  description: string;
  accent: string;
  secondary: string;
  scale: number;
  greeting: string;
  hunger: number;
  hungerUpdatedAt?: string;
  avatarUrl?: string;
  assets: PetAsset[];
  animationMap: AnimationMap;
  spine?: SpineBundle;
  boneMap?: BoneRoleMap;
  actionBindings?: ActionBindings;
  modulePlugins?: PetModulePlugins;
  renderConfig?: PetRenderConfig;
  createdAt: string;
  updatedAt: string;
};

export type CharacterProfile = {
  name: string;
  role: string;
  personality: string;
  speakingStyle: string;
  worldview: string;
  likes: string;
  dislikes: string;
  boundaries: string;
  initiative: number;
  temperature: number;
  relationship: number;
  mood: string;
  energy: number;
};

export type TrainingDocument = {
  id: string;
  title: string;
  kind: "story" | "note" | "voice-transcript";
  content: string;
  createdAt: string;
};

export type MemoryRecord = {
  id: string;
  title: string;
  content: string;
  importance: number;
  createdAt: string;
};

export type VoiceProfile = {
  id: string;
  name: string;
  samples: PetAsset[];
  activeSampleId?: string;
  defaultAiModuleId?: string;
  voiceId: string;
  engineType?: "api" | "local" | "gpt-sovits";
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  localModelPath?: string;
  referenceText?: string;
  trainingClips?: PetAsset[];
  trainingName?: string;
  trainingStatus?: "draft" | "preparing" | "training" | "trained" | "error";
  trainedModels?: {
    gptPath: string;
    sovitsPath: string;
    trainedAt: string;
  };
  trainingError?: string;
  status?: "draft" | "analyzing" | "ready";
  createdAt: string;
};

export type LocalModelKind = "tts" | "asr" | "llm";

export type LocalModelFormat =
  | "gpt-sovits"
  | "whisper"
  | "safetensors"
  | "gguf"
  | "api"
  | "unknown";

export type LocalModelRecord = {
  id: string;
  name: string;
  kind: LocalModelKind;
  format: LocalModelFormat;
  sourcePath: string;
  companionPaths: string[];
  family?: string;
  parameterSize?: string;
  status: "ready" | "needs-files" | "invalid" | "unsupported";
  validationMessage: string;
  backend:
    | "gpt-sovits"
    | "transformers"
    | "llama.cpp"
    | "whisper"
    | "api"
    | "";
  modelId?: string;
  apiConfig?: ServiceConfig;
  createdAt: string;
  updatedAt: string;
};

export type AiModule = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "training" | "ready";
  sourceProfileId?: string;
  skillPrompt?: string;
  training?: {
    baseModel?: string;
    datasetPath?: string;
    configPath?: string;
    logPath?: string;
    outputPath?: string;
    progress?: number;
    startedAt?: string;
    finishedAt?: string;
    error?: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type TrainingProfile = {
  id: string;
  name: string;
  petId?: string;
  status: "draft" | "training" | "ready";
  localModelId?: string;
  character: CharacterProfile;
  documents: TrainingDocument[];
  memories: MemoryRecord[];
  voiceProfileIds: string[];
  aiModuleIds: string[];
  trainingConfig?: {
    baseModel: string;
    epochs: number;
    learningRate: number;
    batchSize: number;
    maxLength: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type AuxiliaryWindowConfig = {
  id: string;
  name: string;
  title: string;
  body: string;
  width: number;
  height: number;
  enabled: boolean;
};

export type ServiceConfig = {
  mode: "local" | "api";
  baseUrl: string;
  model: string;
  apiKey: string;
  voiceId?: string;
};

export type ThemeName = "default" | "violet" | "azure" | "jade";

export type CustomDialogModule = {
  id: string;
  name: string;
  description: string;
  kind: "dialog-box" | "interaction";
  moduleScope: "global" | "pet";
  moduleCategory:
    | "dialog-skin"
    | "auxiliary-window"
    | "interaction"
    | "external";
  enabled?: boolean;
  quickControl?: boolean;
  builtinType?: "auxiliary-window" | "climb-platforms" | "hunger-food";
  windowTitle?: string;
  windowBody?: string;
  windowWidth?: number;
  windowHeight?: number;
  climbChance?: number;
  climbJumpChance?: number;
  climbChainChance?: number;
  climbChainDecay?: number;
  climbHeightDecay?: number;
  climbJumpIntervalSeconds?: number;
  climbMaxWindows?: number;
  hungerDecayPerMinute?: number;
  foodSeekIntervalSeconds?: number;
  version?: string;
  author?: string;
  entry?: string;
  sourcePath?: string;
  contextMenuLabel: string;
  width: number;
  height: number;
  background: string;
  borderColor: string;
  borderRadius: number;
  textColor: string;
  userBubbleColor: string;
  assistantBubbleColor: string;
  fontFamily: string;
  customCss: string;
  backgroundImageUrl?: string;
  userBubbleImageUrl?: string;
  assistantBubbleImageUrl?: string;
  decorationImageUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type AppSettings = {
  appearance: {
    theme: ThemeName;
  };
  overlay: {
    visibleOnStart: boolean;
    alwaysOnTop: boolean;
    includeTaskbarArea: boolean;
    gravity: number;
    walkSpeed: number;
    scale: number;
    sleepAfterSeconds: number;
    idleActionEnabled: boolean;
    idleActionIntervalSeconds: number;
    idleActionChance: number;
    friction: number;
    bounce: number;
    wallBounce: number;
    groundBounce: number;
    gravityLocked: boolean;
    passThroughChance: number;
  };
  services: {
    llm: ServiceConfig;
    asr: ServiceConfig;
    tts: ServiceConfig;
  };
  chat: {
    dialogModuleId: string;
  };
};

export type LocalInferenceSelection = {
  llmModelId: string;
  asrModelId: string;
  ttsModelId: string;
};

export type ActivityRecord = {
  id: string;
  type: string;
  text: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  source?: string;
  warning?: string;
  speech?: SpeechPlan;
};

export type SpeechSegment = {
  text: string;
  tone?: string;
  pace?: "very_slow" | "slow" | "normal" | "fast" | "very_fast";
  pitch?: "low" | "soft" | "normal" | "bright" | "high";
  pause_after_ms?: number;
};

export type SpeechPlan = {
  base_tone?: string;
  default_pace?: SpeechSegment["pace"];
  default_pitch?: SpeechSegment["pitch"];
  segments?: SpeechSegment[];
};

export type WellbeingEvent = {
  id: string;
  type: string;
  text: string;
  createdAt: string;
};

export type WellbeingState = {
  energy: number;
  initiative: number;
  relationship: number;
  mood: string;
  moodScore: number;
  lastSimulatedAt: string;
  lastInteractionAt: string;
  lastPetAt: string;
  todayKey: string;
  today: {
    energyDelta: number;
    initiativeDelta: number;
    relationshipDelta: number;
    interactions: number;
    petCount: number;
  };
  recentEvents: WellbeingEvent[];
};

export type AppState = {
  version: number;
  activePetId: string;
  summonedPetIds: string[];
  activeView: string;
  pets: PetProfile[];
  character: CharacterProfile;
  wellbeing: WellbeingState;
  documents: TrainingDocument[];
  memories: MemoryRecord[];
  conversations: ChatMessage[];
  voiceProfiles: VoiceProfile[];
  localModels: LocalModelRecord[];
  localInference: LocalInferenceSelection;
  customModules: CustomDialogModule[];
  aiModules: AiModule[];
  trainingProfiles: TrainingProfile[];
  activeTrainingProfileId: string;
  auxiliaryWindows: AuxiliaryWindowConfig[];
  settings: AppSettings;
  activity: ActivityRecord[];
  stats: {
    wakeCount: number;
    releaseCount: number;
    chatCount: number;
    createdAt: string;
  };
};

export type DisplayMetrics = {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  workArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  scaleFactor: number;
};

export type OverlayCommand =
  | { type: "release"; petId?: string; origin?: { x: number; y: number } }
  | { type: "wake"; petId?: string }
  | { type: "sleep"; petId?: string }
  | { type: "rest"; petId?: string }
  | { type: "action"; petId?: string; name?: string }
  | { type: "home" }
  | { type: "walk" }
  | { type: "drop" }
  | { type: "show" };

export type ChatResult = {
  ok: boolean;
  text: string;
  source: string;
  action?: string;
  warning?: string;
  speech?: SpeechPlan;
};

export type TestResult = {
  ok: boolean;
  error?: string;
  data?: unknown;
};

export type VoiceResult = {
  ok: boolean;
  audioDataUrl?: string;
  error?: string;
};

export type VoiceAgentTurnResult = {
  ok: boolean;
  transcript?: string;
  reply?: string;
  source?: string;
  warning?: string;
  audioDataUrl?: string;
  error?: string;
};

export type DeskPetApi = {
  physicsDebug: boolean;
  debugPhysicsLog: (message: string) => void;
  getState: () => Promise<AppState>;
  updateState: (patch: Partial<AppState> | Record<string, unknown>) => Promise<AppState>;
  updateStateSync: (
    patch: Partial<AppState> | Record<string, unknown>
  ) => AppState;
  replaceState: (state: AppState) => Promise<AppState>;
  getDisplayMetrics: () => Promise<DisplayMetrics>;
  getDesktopIcons: () => Promise<
    Array<{
      name: string;
      foodPath: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }>
  >;
  consumeFood: (
    foodPath: string,
    options?: { allowOutsideDesktop?: boolean }
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  onFoodDrop: (
    callback: (payload: {
      ok: boolean;
      petId: string;
      fileName?: string;
      filePath?: string;
      error?: string;
    }) => void
  ) => () => void;
  getControlBounds: () => Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>;
  showControl: () => Promise<boolean>;
  hideControl: () => Promise<boolean>;
  quit: () => Promise<boolean>;
  overlayCommand: (command: OverlayCommand) => Promise<AppState>;
  hideOverlay: () => Promise<boolean>;
  setOverlayMouseIgnore: (ignore: boolean) => void;
  setOverlayFocusable: (focusable: boolean) => void;
  openAuxiliary: (id: string) => Promise<boolean>;
  openChat: (
    mode: "text" | "voice",
    dialogModuleId?: string
  ) => Promise<boolean>;
  importExternalModule: () => Promise<{
    canceled: boolean;
    module?: CustomDialogModule;
    error?: string;
  }>;
  openExternalModule: (moduleId: string) => Promise<boolean>;
  triggerExternalModule: (
    moduleId: string,
    petId?: string,
    origin?: {
      x: number;
      y: number;
      stepX?: number;
      stepY?: number;
    }
  ) => Promise<
    | boolean
    | { x: number; y: number; width: number; height: number }
  >;
  chooseModuleImage: (
    moduleId: string,
    slot: "background" | "user" | "assistant" | "decoration"
  ) => Promise<{ canceled: boolean; url?: string; error?: string }>;
  importPetAssets: (petId: string) => Promise<{
    canceled: boolean;
    assets?: PetAsset[];
    state?: AppState;
  }>;
  importSpine: (petId: string) => Promise<{
    canceled: boolean;
    spine?: SpineBundle;
    state?: AppState;
  }>;
  selectSpinePart: (
    kind: SpinePartKind,
    draftId: string
  ) => Promise<{
    canceled: boolean;
    part?: SpineStagedPart;
  }>;
  createPetFromSpine: (
    draftId: string,
    parts: Record<SpinePartKind, SpineStagedPart>,
    name?: string
  ) => Promise<{
    ok: boolean;
    petId?: string;
    state?: AppState;
    error?: string;
  }>;
  importVoiceSample: () => Promise<{
    canceled: boolean;
    samples?: PetAsset[];
    state?: AppState;
  }>;
  stageVoiceSamples: (draftId: string) => Promise<{
    canceled: boolean;
    samples?: PetAsset[];
  }>;
  removeStagedVoiceSample: (relativePath: string) => Promise<boolean>;
  transcribeVoiceTrainingSample: (relativePath: string) => Promise<{
    ok: boolean;
    text?: string;
    durationSeconds?: number;
    error?: string;
  }>;
  getVoiceTrainingRuntime: () => Promise<{
    ready: boolean;
    progress: number;
    phase: string;
    message: string;
    cuda?: string;
    device?: string;
  }>;
  prepareVoiceTraining: (
    profileId: string,
    clips: PetAsset[]
  ) => Promise<{ ok: boolean; datasetPath?: string; error?: string }>;
  chooseLocalModel: (
    kind: LocalModelKind,
    mode?: "file" | "folder"
  ) => Promise<{
    canceled: boolean;
    path?: string;
  }>;
  inspectLocalModel: (
    kind: LocalModelKind,
    sourcePath: string
  ) => Promise<{ ok: boolean; model?: LocalModelRecord; error?: string }>;
  addLocalModel: (model: LocalModelRecord) => Promise<AppState>;
  removeLocalModel: (modelId: string) => Promise<AppState>;
  importTrainingAudio: () => Promise<{
    canceled: boolean;
    ok?: boolean;
    text?: string;
    error?: string;
  }>;
  testService: (service: "llm" | "asr" | "tts") => Promise<TestResult>;
  chat: (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    aiModuleId?: string
  ) => Promise<ChatResult>;
  chatStream: (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    aiModuleId?: string
  ) => Promise<ChatResult>;
  onChatStream: (
    callback: (payload: { delta?: string }) => void
  ) => () => void;
  speak: (
    text: string,
    voiceId?: string,
    config?: {
      baseUrl?: string;
      model?: string;
      apiKey?: string;
      voiceId?: string;
      voiceProfileId?: string;
      engineType?: "api" | "local" | "gpt-sovits";
      referenceText?: string;
    }
  ) => Promise<VoiceResult>;
  voiceAgent: {
    setModel: (
      kind: LocalModelKind,
      modelId: string
    ) => Promise<AppState>;
    transcribe: (
      audioBytes: Uint8Array
    ) => Promise<{ ok: boolean; text?: string; error?: string }>;
    reply: (
      text: string,
      options?: { aiModuleId?: string }
    ) => Promise<ChatResult>;
    speak: (
      text: string,
      options?: { voiceProfileId?: string; speech?: SpeechPlan }
    ) => Promise<VoiceResult>;
    turn: (
      audioBytes: Uint8Array,
      options?: { voiceProfileId?: string }
    ) => Promise<VoiceAgentTurnResult>;
  };
  startTraining: (profileId: string) => Promise<{
    ok: boolean;
    moduleId?: string;
    logPath?: string;
    outputPath?: string;
    error?: string;
  }>;
  openTrainingFolder: (moduleId: string) => Promise<boolean>;
  getDataPaths: () => Promise<{
    dataPath: string;
    statePath: string;
    assetsPath: string;
    petStorePath: string;
  }>;
  syncPetStore: () => Promise<{ ok: boolean; count: number }>;
  openPetStore: () => Promise<boolean>;
  openDataFolder: () => Promise<boolean>;
  exportBackup: () => Promise<{ canceled: boolean; folder?: string }>;
  importBackup: () => Promise<{ canceled: boolean; state?: AppState }>;
  onStateChanged: (callback: (state: AppState) => void) => () => void;
  onOverlayCommand: (callback: (command: OverlayCommand) => void) => () => void;
  onOverlayMode: (callback: (mode: OverlayCommand["type"]) => void) => () => void;
  onOverlaySettings: (
    callback: (settings: AppSettings["overlay"]) => void
  ) => () => void;
  onClimbPlatformChanged: (
    callback: (payload: {
      id: string;
      petId: string;
      closed: boolean;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    }) => void
  ) => () => void;
  onDisplayChanged: (callback: (metrics: DisplayMetrics) => void) => () => void;
};
