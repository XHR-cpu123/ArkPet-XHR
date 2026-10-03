const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const STATE_FILE = "desk-pet-state.json";

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function createDefaultState() {
  const petId = id("pet");

  return {
    version: 15,
    activePetId: petId,
    summonedPetIds: [petId],
    activeView: "home",
    pets: [
      {
        id: petId,
        name: "阿洛",
        title: "待替换的原创占位角色",
        description:
          "先用程序内绘制的临时小人验证重力、拖动、落点、行走和窗口交互。",
        accent: "#2f7df6",
        secondary: "#f59f38",
        scale: 1,
        greeting: "我在这里。今天想先做什么？",
        hunger: 100,
        hungerUpdatedAt: new Date().toISOString(),
        assets: [],
        animationMap: {
          idle: "",
          walk: "",
          fall: "",
          land: "",
          drag: "",
          sleep: ""
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    character: {
      name: "阿洛",
      role: "桌面伙伴",
      personality: "好奇、直接、有一点自己的主见。会认真回应，但不机械服从。",
      speakingStyle: "短句为主，偶尔反问。开心时会变得更活泼，不滥用口头禅。",
      worldview: "生活在一台本地电脑里，把桌面当作自己的小世界。",
      likes: "重要的人和事，以及能让日常变得更好的细节。",
      dislikes: "被误解、失去重要的联系，以及无法掌握的局面。",
      boundaries: "把用户视为长期相处的伙伴，尊重彼此空间，关系随经历变化。",
      initiative: 58,
      temperature: 0.82,
      relationship: 12,
      mood: "平静",
      energy: 76
    },
    wellbeing: {
      energy: 76,
      initiative: 58,
      relationship: 12,
      mood: "平静",
      moodScore: 61,
      lastSimulatedAt: new Date().toISOString(),
      lastInteractionAt: new Date().toISOString(),
      lastPetAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      todayKey: new Date().toISOString().slice(0, 10),
      today: {
        energyDelta: 0,
        initiativeDelta: 0,
        relationshipDelta: 0,
        interactions: 0,
        petCount: 0
      },
      recentEvents: []
    },
    documents: [],
    memories: [
      {
        id: id("memory"),
        title: "第一条记忆",
        content: "这里会保存用户手动确认的重要对话和角色设定。",
        importance: 3,
        createdAt: new Date().toISOString()
      }
    ],
    conversations: [],
    voiceProfiles: [],
    localModels: [],
    localInference: {
      llmModelId: "",
      asrModelId: "",
      ttsModelId: ""
    },
    customModules: [
      {
        id: id("dialog"),
        name: "对话框皮肤",
        description: "所有角色固定使用的基础对话气泡样式。",
        kind: "dialog-box",
        moduleScope: "pet",
        moduleCategory: "dialog-skin",
        contextMenuLabel: "打开默认对话框",
        width: 460,
        height: 620,
        background: "#f7f5ef",
        borderColor: "#d9d7d0",
        borderRadius: 8,
        textColor: "#172033",
        userBubbleColor: "#edf5ff",
        assistantBubbleColor: "#ffffff",
        fontFamily: "Microsoft YaHei UI",
        customCss: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: "builtin-aux-temp",
        name: "临时落脚点",
        description: "打开一个普通窗口作为桌宠的临时落脚点。",
        kind: "interaction",
        moduleScope: "global",
        moduleCategory: "auxiliary-window",
        enabled: true,
        quickControl: false,
        builtinType: "auxiliary-window",
        windowTitle: "临时落脚点",
        windowBody: "桌宠可以借助这个窗口移动到桌面上的其他位置。",
        windowWidth: 520,
        windowHeight: 340,
        contextMenuLabel: "打开临时落脚点",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: "builtin-aux-note",
        name: "纸条窗口",
        description: "显示一张可以随时打开的纸条。",
        kind: "interaction",
        moduleScope: "global",
        moduleCategory: "auxiliary-window",
        enabled: true,
        quickControl: false,
        builtinType: "auxiliary-window",
        windowTitle: "一张没有用的纸条",
        windowBody: "如果你看见这张纸条，说明辅助窗口已经能正常打开和关闭。",
        windowWidth: 420,
        windowHeight: 300,
        contextMenuLabel: "打开纸条窗口",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: "builtin-aux-platform",
        name: "高处平台",
        description: "提供一个较高的桌面平台。",
        kind: "interaction",
        moduleScope: "global",
        moduleCategory: "auxiliary-window",
        enabled: true,
        quickControl: false,
        builtinType: "auxiliary-window",
        windowTitle: "临时高处",
        windowBody: "后续可以让桌宠借助这类窗口移动到桌面上的其他位置。",
        windowWidth: 520,
        windowHeight: 340,
        contextMenuLabel: "打开高处平台",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    aiModules: [],
    trainingProfiles: [],
    activeTrainingProfileId: "",
    auxiliaryWindows: [
      {
        id: id("aux"),
        name: "纸条窗口",
        title: "一张没有用的纸条",
        body: "如果你看见这张纸条，说明辅助窗口已经能正常打开和关闭。",
        width: 420,
        height: 300,
        enabled: true
      },
      {
        id: id("aux"),
        name: "高处平台",
        title: "临时高处",
        body: "后续可以让桌宠借助这类窗口移动到桌面上的其他位置。",
        width: 520,
        height: 340,
        enabled: true
      }
    ],
    settings: {
      appearance: {
        theme: "default"
      },
      overlay: {
        visibleOnStart: true,
        alwaysOnTop: true,
        includeTaskbarArea: true,
        gravity: 1800,
        walkSpeed: 63,
        scale: 1,
        sleepAfterSeconds: 90,
        idleActionEnabled: true,
        idleActionIntervalSeconds: 20,
        idleActionChance: 50,
        friction: 45,
        bounce: 55,
        wallBounce: 55,
        groundBounce: 45,
        gravityLocked: true,
        passThroughChance: 50
      },
      services: {
        llm: {
          mode: "local",
          baseUrl: "http://127.0.0.1:11434/v1",
          model: "qwen2.5:7b",
          apiKey: ""
        },
        asr: {
          mode: "local",
          baseUrl: "http://127.0.0.1:8000/v1",
          model: "whisper-1",
          apiKey: ""
        },
        tts: {
          mode: "local",
          baseUrl: "http://127.0.0.1:9880/v1",
          model: "",
          voiceId: "",
          apiKey: ""
        }
      },
      chat: {
        dialogModuleId: ""
      }
    },
    activity: [
      {
        id: id("activity"),
        type: "system",
        text: "本地数据仓库已初始化。",
        createdAt: new Date().toISOString()
      }
    ],
    stats: {
      wakeCount: 0,
      releaseCount: 0,
      chatCount: 0,
      createdAt: new Date().toISOString()
    }
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeDeep(base, patch) {
  if (!isObject(patch)) return patch;
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isObject(value) && isObject(result[key])) {
      result[key] = mergeDeep(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function ensureShape(raw) {
  const defaults = createDefaultState();
  const hadWellbeing = isObject(raw?.wellbeing);
  const merged = mergeDeep(defaults, raw || {});
  if (!hadWellbeing) {
    merged.wellbeing.energy = Number(merged.character.energy ?? 76);
    merged.wellbeing.initiative = Number(merged.character.initiative ?? 58);
    merged.wellbeing.relationship = Number(merged.character.relationship ?? 12);
    merged.wellbeing.mood = merged.character.mood || "平静";
  }
  if (Number(merged.version || 1) < 2) {
    merged.settings.overlay.walkSpeed = Math.max(
      30,
      Math.round(Number(merged.settings.overlay.walkSpeed || 92) * 0.68)
    );
    merged.version = 2;
  }
  if (Number(merged.version || 1) < 3) {
    merged.version = 3;
  }
  if (Number(merged.version || 1) < 4) {
    merged.version = 4;
  }
  if (Number(merged.version || 1) < 5) {
    merged.version = 5;
  }
  if (Number(merged.version || 1) < 6) {
    merged.version = 6;
  }
  if (Number(merged.version || 1) < 7) {
    merged.version = 7;
  }
  if (Number(merged.version || 1) < 8) {
    merged.settings.overlay.wallBounce = Number(
      merged.settings.overlay.bounce ?? 55
    );
    merged.settings.overlay.groundBounce = Math.round(
      Number(merged.settings.overlay.bounce ?? 55) * 0.82
    );
    merged.version = 8;
  }
  if (Number(merged.version || 1) < 9) {
    merged.version = 9;
  }
  if (Number(merged.version || 1) < 10) {
    merged.aiModules = Array.isArray(merged.aiModules) ? merged.aiModules : [];
    merged.version = 10;
  }
  if (Number(merged.version || 1) < 11) {
    merged.version = 11;
  }
  if (Number(merged.version || 1) < 12) {
    merged.settings.appearance = {
      theme: "default",
      ...(isObject(merged.settings.appearance)
        ? merged.settings.appearance
        : {})
    };
    merged.version = 12;
  }
  if (Number(merged.version || 1) < 13) {
    for (const pet of Array.isArray(merged.pets) ? merged.pets : []) {
      pet.hunger = Math.max(
        0,
        Math.min(100, Number(pet.hunger ?? 100))
      );
      if (
        !Number.isFinite(new Date(pet.hungerUpdatedAt).getTime())
      ) {
        pet.hungerUpdatedAt = new Date().toISOString();
      }
    }
    const activePet =
      merged.pets?.find((pet) => pet.id === merged.activePetId) ||
      merged.pets?.[0];
    if (activePet) {
      activePet.modulePlugins = isObject(activePet.modulePlugins)
        ? activePet.modulePlugins
        : {};
      activePet.modulePlugins.boundModuleIds = Array.from(
        new Set([
          ...(Array.isArray(activePet.modulePlugins.boundModuleIds)
            ? activePet.modulePlugins.boundModuleIds
            : []),
          "builtin-hunger-food"
        ])
      );
    }
    merged.version = 13;
  }
  if (Number(merged.version || 1) < 14) {
    const climbModule = merged.customModules?.find(
      (module) => module.builtinType === "climb-platforms"
    );
    if (climbModule && Number(climbModule.climbJumpIntervalSeconds || 0) >= 30) {
      climbModule.climbJumpIntervalSeconds = 3;
    }
    merged.version = 14;
  }
  if (Number(merged.version || 1) < 15) {
    const climbModule = merged.customModules?.find(
      (module) => module.builtinType === "climb-platforms"
    );
    if (climbModule) {
      climbModule.climbChainChance = 90;
      climbModule.climbChainDecay = 0.65;
      climbModule.climbHeightDecay = 0.8;
    }
    merged.version = 15;
  }
  for (const pet of Array.isArray(merged.pets) ? merged.pets : []) {
    if (!isObject(pet.renderConfig)) continue;
    pet.renderConfig.visualWidth =
      Number(pet.renderConfig.visualWidth) ||
      Number(pet.renderConfig.hitboxWidth) ||
      104;
    pet.renderConfig.visualHeight =
      Number(pet.renderConfig.visualHeight) ||
      Number(pet.renderConfig.hitboxHeight) ||
      134;
  }
  merged.aiModules = Array.isArray(merged.aiModules) ? merged.aiModules : [];
  if (!Array.isArray(merged.pets) || merged.pets.length === 0) {
    merged.pets = defaults.pets;
    merged.activePetId = defaults.activePetId;
  }
  if (!merged.pets.some((pet) => pet.id === merged.activePetId)) {
    merged.activePetId = merged.pets[0].id;
  }
  merged.summonedPetIds = Array.isArray(merged.summonedPetIds)
    ? merged.summonedPetIds.filter((petId) =>
        merged.pets.some((pet) => pet.id === petId)
      )
    : [merged.activePetId];
  merged.activity = Array.isArray(merged.activity) ? merged.activity.slice(0, 60) : [];
  merged.memories = Array.isArray(merged.memories) ? merged.memories : [];
  merged.documents = Array.isArray(merged.documents) ? merged.documents : [];
  merged.conversations = Array.isArray(merged.conversations)
    ? merged.conversations.slice(-80)
    : [];
  merged.voiceProfiles = Array.isArray(merged.voiceProfiles)
    ? merged.voiceProfiles
    : [];
  for (const profile of merged.voiceProfiles) {
    profile.name = profile.name || "声音模块";
    profile.samples = Array.isArray(profile.samples) ? profile.samples : [];
    profile.voiceId = profile.voiceId || "";
    profile.engineType =
      profile.engineType === "local"
        ? "local"
        : profile.engineType === "gpt-sovits"
          ? "gpt-sovits"
          : "api";
    if (profile.engineType === "gpt-sovits" && profile.baseUrl) {
      profile.baseUrl = String(profile.baseUrl).replace(/\/v1\/?$/i, "");
    }
    profile.status =
      profile.status === "ready"
        ? "ready"
        : profile.status === "analyzing"
          ? "analyzing"
          : "draft";
    profile.activeSampleId =
      profile.activeSampleId &&
      profile.samples.some((sample) => sample.id === profile.activeSampleId)
        ? profile.activeSampleId
        : profile.samples[0]?.id || "";
    profile.defaultAiModuleId = String(profile.defaultAiModuleId || "");
    profile.trainingClips = Array.isArray(profile.trainingClips)
      ? profile.trainingClips
      : [];
    profile.trainingName = String(
      profile.trainingName || `${profile.name} 声线`
    );
    profile.trainingStatus =
      profile.trainingStatus === "trained" ||
      profile.trainingStatus === "training" ||
      profile.trainingStatus === "preparing" ||
      profile.trainingStatus === "error"
        ? profile.trainingStatus
        : "draft";
    profile.trainingError = String(profile.trainingError || "");
  }
  merged.localModels = Array.isArray(merged.localModels)
    ? merged.localModels
    : [];
  merged.localInference = isObject(merged.localInference)
    ? {
        llmModelId: String(merged.localInference.llmModelId || ""),
        asrModelId: String(merged.localInference.asrModelId || ""),
        ttsModelId: String(merged.localInference.ttsModelId || "")
      }
    : {
        llmModelId: "",
        asrModelId: "",
        ttsModelId: ""
      };
  merged.customModules = Array.isArray(merged.customModules)
    ? merged.customModules
    : [];
  merged.customModules = merged.customModules.filter(
    (module) =>
      !["builtin-aux-temp", "builtin-aux-note", "builtin-aux-platform"].includes(
        module.id
      )
  );
  const builtInModules = [
    {
      id: "builtin-climb-platforms",
      name: "攀爬平台模组",
      description: "重力状态下自动寻找落脚点，并生成最多两个攀爬窗口。",
      kind: "interaction",
      moduleScope: "pet",
      moduleCategory: "interaction",
      enabled: true,
      quickControl: false,
      builtinType: "climb-platforms",
      windowTitle: "攀爬落脚点",
      windowBody: "桌宠会尝试爬到这扇窗上。",
      windowWidth: 520,
      windowHeight: 340,
      climbChance: 55,
      climbJumpChance: 65,
      climbChainChance: 90,
      climbChainDecay: 0.65,
      climbHeightDecay: 0.8,
      climbJumpIntervalSeconds: 3,
      climbMaxWindows: 2,
      contextMenuLabel: "生成攀爬窗口"
    },
    {
      id: "builtin-hunger-food",
      name: "吃饭模组",
      description:
        "显示饥饿值，并主动寻找桌面上的 .food 文件；饥饿时会借助攀爬和跳跃获得食物。",
      kind: "interaction",
      moduleScope: "pet",
      moduleCategory: "interaction",
      enabled: true,
      quickControl: false,
      builtinType: "hunger-food",
      hungerDecayPerMinute: 1,
      foodSeekIntervalSeconds: 8,
      contextMenuLabel: "查看饥饿值"
    }
  ];
  for (const builtin of builtInModules) {
    if (!merged.customModules.some((module) => module.id === builtin.id)) {
      merged.customModules.push({
        ...builtin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }
  for (const module of merged.customModules) {
    if (
      module.moduleCategory === "dialog-skin" &&
      ["默认对话框", "默认对话框皮肤"].includes(module.name)
    ) {
      module.name = "对话框皮肤";
    }
    module.moduleScope =
      module.moduleScope === "global" ||
      module.builtinType === "auxiliary-window"
        ? "global"
        : "pet";
    module.moduleCategory =
      module.moduleCategory === "dialog-skin" ||
      module.moduleCategory === "auxiliary-window" ||
      module.moduleCategory === "interaction" ||
      module.moduleCategory === "external"
        ? module.moduleCategory
        : module.kind === "dialog-box"
          ? "dialog-skin"
          : module.builtinType === "auxiliary-window"
            ? "auxiliary-window"
            : "external";
    module.contextMenuLabel = String(
      module.contextMenuLabel ||
        (module.kind === "dialog-box" ? "打开对话框" : "打开交互模组")
    );
    module.enabled = module.enabled !== false;
    module.quickControl = module.quickControl === true;
    module.builtinType =
      module.builtinType === "auxiliary-window" ||
      module.builtinType === "climb-platforms" ||
      module.builtinType === "hunger-food"
        ? module.builtinType
        : undefined;
    module.windowTitle = String(module.windowTitle || module.name || "");
    module.windowBody = String(module.windowBody || module.description || "");
    module.windowWidth = Number(module.windowWidth) || 420;
    module.windowHeight = Number(module.windowHeight) || 320;
    module.climbChance = Math.max(
      0,
      Math.min(100, Number(module.climbChance ?? 55))
    );
    module.climbJumpChance = Math.max(
      0,
      Math.min(100, Number(module.climbJumpChance ?? 65))
    );
    module.climbChainChance = Math.max(
      0,
      Math.min(100, Number(module.climbChainChance ?? 90))
    );
    module.climbChainDecay = Math.max(
      0,
      Math.min(1, Number(module.climbChainDecay ?? 0.65))
    );
    module.climbHeightDecay = Math.max(
      0,
      Math.min(1, Number(module.climbHeightDecay ?? 0.8))
    );
    module.climbJumpIntervalSeconds = Math.max(
      1,
      Number(module.climbJumpIntervalSeconds || 3)
    );
    module.climbMaxWindows = Math.max(
      1,
      Math.min(4, Number(module.climbMaxWindows || 2))
    );
    module.hungerDecayPerMinute = Math.max(
      0,
      Number(module.hungerDecayPerMinute ?? 1)
    );
    module.foodSeekIntervalSeconds = Math.max(
      3,
      Number(module.foodSeekIntervalSeconds || 8)
    );
    module.backgroundImageUrl = String(module.backgroundImageUrl || "");
    module.userBubbleImageUrl = String(module.userBubbleImageUrl || "");
    module.assistantBubbleImageUrl = String(
      module.assistantBubbleImageUrl || ""
    );
    module.decorationImageUrl = String(module.decorationImageUrl || "");
  }
  const defaultDialogModuleId =
    merged.customModules.find((item) => item.kind === "dialog-box")?.id || "";
  merged.settings.chat = {
    dialogModuleId:
      merged.settings?.chat?.dialogModuleId &&
      merged.customModules.some(
        (item) => item.id === merged.settings.chat.dialogModuleId
      )
        ? merged.settings.chat.dialogModuleId
        : defaultDialogModuleId
  };
  if (isObject(merged.settings?.services)) {
    for (const serviceName of ["llm", "asr", "tts"]) {
      const service = isObject(merged.settings.services[serviceName])
        ? merged.settings.services[serviceName]
        : {};
      service.mode = service.mode === "api" ? "api" : "local";
      service.baseUrl = String(service.baseUrl || "");
      service.model = String(service.model || "");
      service.apiKey = String(service.apiKey || "");
      if (serviceName === "tts") {
        service.voiceId = String(service.voiceId || "");
      }
      merged.settings.services[serviceName] = service;
    }
  }
  for (const model of merged.localModels) {
    if (model.format !== "api" || isObject(model.apiConfig)) continue;
    const service = merged.settings?.services?.[model.kind];
    if (
      service &&
      service.baseUrl === model.sourcePath &&
      (!model.modelId || service.model === model.modelId)
    ) {
      model.apiConfig = {
        ...service,
        mode: "api"
      };
    }
  }
  merged.trainingProfiles = Array.isArray(merged.trainingProfiles)
    ? merged.trainingProfiles
    : [];
  for (const profile of merged.trainingProfiles) {
    profile.localModelId = String(profile.localModelId || "");
    profile.character = isObject(profile.character)
      ? profile.character
      : merged.character;
    profile.documents = Array.isArray(profile.documents)
      ? profile.documents
      : [];
    profile.memories = Array.isArray(profile.memories) ? profile.memories : [];
    profile.voiceProfileIds = Array.isArray(profile.voiceProfileIds)
      ? profile.voiceProfileIds
      : [];
    profile.aiModuleIds = Array.isArray(profile.aiModuleIds)
      ? profile.aiModuleIds
      : [];
    profile.trainingConfig = isObject(profile.trainingConfig)
      ? {
          baseModel: profile.trainingConfig.baseModel || "Qwen/Qwen2.5-7B-Instruct",
          epochs: Number(profile.trainingConfig.epochs) || 3,
          learningRate: Number(profile.trainingConfig.learningRate) || 0.0002,
          batchSize: Number(profile.trainingConfig.batchSize) || 1,
          maxLength: Number(profile.trainingConfig.maxLength) || 1024
        }
      : {
          baseModel: "Qwen/Qwen2.5-7B-Instruct",
          epochs: 3,
          learningRate: 0.0002,
          batchSize: 1,
          maxLength: 1024
        };
  }
  if (merged.trainingProfiles.length === 0) {
    merged.activeTrainingProfileId = "";
  } else if (
    !merged.trainingProfiles.some(
      (profile) => profile.id === merged.activeTrainingProfileId
    )
  ) {
    merged.activeTrainingProfileId = merged.trainingProfiles[0].id;
  }
  merged.wellbeing.recentEvents = Array.isArray(merged.wellbeing.recentEvents)
    ? merged.wellbeing.recentEvents.slice(0, 40)
    : [];
  if (!Number.isFinite(new Date(merged.wellbeing.lastSimulatedAt).getTime())) {
    merged.wellbeing.lastSimulatedAt = new Date().toISOString();
  }
  if (!Number.isFinite(new Date(merged.wellbeing.lastInteractionAt).getTime())) {
    merged.wellbeing.lastInteractionAt = new Date().toISOString();
  }
  merged.auxiliaryWindows = Array.isArray(merged.auxiliaryWindows)
    ? merged.auxiliaryWindows
    : defaults.auxiliaryWindows;
  for (const pet of merged.pets || []) {
    if (!isObject(pet.modulePlugins)) continue;
    if (
      pet.modulePlugins.voiceProfileId &&
      !merged.voiceProfiles.some(
        (profile) => profile.id === pet.modulePlugins.voiceProfileId
      )
    ) {
      pet.modulePlugins.voiceProfileId =
        merged.voiceProfiles.length === 1
          ? merged.voiceProfiles[0].id
          : undefined;
    }
    if (
      pet.modulePlugins.aiModuleId &&
      !merged.trainingProfiles.some(
        (profile) => profile.id === pet.modulePlugins.aiModuleId
      )
    ) {
      pet.modulePlugins.aiModuleId =
        merged.trainingProfiles.length === 1
          ? merged.trainingProfiles[0].id
          : undefined;
    }
    pet.modulePlugins.boundModuleIds = Array.isArray(
      pet.modulePlugins.boundModuleIds
    )
      ? pet.modulePlugins.boundModuleIds.filter((moduleId) =>
          merged.customModules.some((module) => module.id === moduleId)
        )
      : [];
  }
  return merged;
}

class Store {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.filePath = path.join(userDataPath, STATE_FILE);
    this.assetsPath = path.join(userDataPath, "assets");
    this.petStorePath = path.join(userDataPath, "pet-store");
    this.state = createDefaultState();
  }

  load() {
    fs.mkdirSync(this.userDataPath, { recursive: true });
    fs.mkdirSync(this.assetsPath, { recursive: true });
    fs.mkdirSync(this.petStorePath, { recursive: true });

    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, "utf8");
        const parsed = JSON.parse(content);
        const previousVersion = Number(parsed.version || 1);
        this.state = ensureShape(parsed);
        if (this.state.version !== previousVersion) this.save();
      } else {
        this.state = ensureShape(createDefaultState());
        this.save();
      }
    } catch (error) {
      const brokenPath = `${this.filePath}.broken-${Date.now()}`;
      try {
        if (fs.existsSync(this.filePath)) fs.copyFileSync(this.filePath, brokenPath);
      } catch {
        // The original data remains untouched if preserving a broken copy fails.
      }
      this.state = createDefaultState();
      this.state.activity.unshift({
        id: id("activity"),
        type: "error",
        text: `数据文件读取失败，已创建新状态。原文件保留在 ${brokenPath}`,
        createdAt: new Date().toISOString()
      });
      this.save();
    }

    this.loadPetStore();
    this.save();
    return this.state;
  }

  save() {
    fs.mkdirSync(this.userDataPath, { recursive: true });
    fs.mkdirSync(this.petStorePath, { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(this.state, null, 2), "utf8");
    fs.renameSync(tempPath, this.filePath);
    this.syncPetStore();
  }

  syncPetStore() {
    fs.mkdirSync(this.petStorePath, { recursive: true });
    const currentIds = new Set(this.state.pets.map((pet) => pet.id));
    for (const pet of this.state.pets) {
      const filePath = path.join(this.petStorePath, `${pet.id}.json`);
      const tempPath = `${filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(pet, null, 2), "utf8");
      fs.renameSync(tempPath, filePath);
    }
    for (const entry of fs.readdirSync(this.petStorePath)) {
      if (!entry.endsWith(".json")) continue;
      const petId = entry.slice(0, -5);
      if (!currentIds.has(petId)) {
        fs.rmSync(path.join(this.petStorePath, entry), { force: true });
      }
    }
    return this.state.pets.length;
  }

  loadPetStore() {
    fs.mkdirSync(this.petStorePath, { recursive: true });
    const knownIds = new Set(this.state.pets.map((pet) => pet.id));
    for (const entry of fs.readdirSync(this.petStorePath)) {
      if (!entry.endsWith(".json")) continue;
      try {
        const pet = JSON.parse(
          fs.readFileSync(path.join(this.petStorePath, entry), "utf8")
        );
        if (pet?.id && !knownIds.has(pet.id)) {
          this.state.pets.push(pet);
          knownIds.add(pet.id);
        }
      } catch {
        // Keep the main state usable if one character file is damaged.
      }
    }
    if (!this.state.pets.some((pet) => pet.id === this.state.activePetId)) {
      this.state.activePetId = this.state.pets[0]?.id || this.state.activePetId;
    }
  }

  get() {
    return structuredClone(this.state);
  }

  replace(nextState) {
    this.state = ensureShape(nextState);
    this.save();
    return this.get();
  }

  update(patch) {
    this.state = ensureShape(mergeDeep(this.state, patch));
    this.save();
    return this.get();
  }

  addActivity(type, text) {
    this.state.activity.unshift({
      id: id("activity"),
      type,
      text,
      createdAt: new Date().toISOString()
    });
    this.state.activity = this.state.activity.slice(0, 60);
  }

  mutate(mutator) {
    const draft = this.get();
    mutator(draft);
    this.state = ensureShape(draft);
    this.save();
    return this.get();
  }
}

module.exports = {
  Store,
  STATE_FILE,
  createDefaultState,
  id,
  mergeDeep
};
