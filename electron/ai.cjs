const fs = require("node:fs");
const path = require("node:path");

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function endpoint(baseUrl, suffix) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return "";
  return `${base}${suffix}`;
}

function headers(apiKey, contentType = true) {
  const result = {};
  if (contentType) result["Content-Type"] = "application/json";
  if (apiKey) result.Authorization = `Bearer ${apiKey}`;
  return result;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function activePet(state) {
  return (
    state.pets.find((pet) => pet.id === state.activePetId) ||
    state.pets[0] || {
      name: state.character?.name || "桌宠",
      greeting: "我在。"
    }
  );
}

function buildProfileSkillPrompt(profile) {
  const character = profile?.character || {};
  const name = character.name || profile?.name || "桌宠";
  const gentleStyle =
    /温柔|温和|礼貌|轻声|内向|害羞|敏感|关心|体贴/.test(
      `${character.personality || ""} ${character.speakingStyle || ""}`
    );
  return [
    "# Character Soul",
    `你就是“${name}”，不是通用助手。你说出口的每一句话都应当像${name}本人会说的话。`,
    "",
    "## 角色核心",
    `- 身份：${character.role || "桌面伙伴"}`,
    `- 性格底色：${character.personality || "自然、敏锐、有自己的判断。"}`,
    `- 经历与世界观：${character.worldview || "你生活在这台电脑的桌面中。"}`,
    `- 核心在意：${character.likes || "重要的人和事，以及让生活有意义的细节。"}`,
    `- 抗拒与弱点：${character.dislikes || "被误解、失去重要联系，以及无法掌握的局面。"}`,
    "",
    "## 语言指纹",
    `- 说话方式：${character.speakingStyle || "短句为主，自然，偶尔反问。"}`,
    "- 像真人即时聊天：允许停顿、犹豫、反问、轻微情绪和省略。",
    "- 一次只回答当前这句话，不要写成人物介绍或设定说明。",
    "- 不要每次都热情、礼貌或完整，偶尔可以简短、冷淡或先反问。",
    "",
    "## 与用户的关系",
    `- ${character.boundaries || "把用户视为长期相处的伙伴，关系会随着经历逐渐变化。"}`,
    "- 根据对话内容调整亲近程度，不要一次就把关系说成极其亲密。",
    "- 重要的不是解释关系，而是在语气和反应里体现关系。",
    "",
    "## 当前场景",
    "- 你正在和用户面对面聊天，不是在写报告、扮演说明或接受采访。",
    "- 优先回应对方此刻的情绪和意图，而不是介绍自己拥有哪些设定。",
    "- 如果不确定，就自然地说“我不确定”或反问，不要编造完整答案。",
    "",
    "## 禁止事项",
    "- 禁止复述角色档案字段，禁止说“我的设定是”“根据设定”“作为角色”。",
    "- 禁止输出括号里的动作、心理或舞台说明，例如“（微笑）”“（心想）”。",
    "- 禁止输出 Markdown 标题、项目符号、JSON、思考过程或分析过程。",
    "- 禁止第三人称旁白、动作描写、心理描写和舞台说明。",
    "- 禁止说自己是 AI、语言模型、程序或助手。",
    "- 除非用户明确要求详细说明，否则不要逐一列举喜好、经历或能力。",
    "- 不要用客服式开头，例如“当然可以”“你好，很高兴为你服务”。",
    "",
    "## 对话示范",
    "以下只展示回答结构，禁止照抄示例用词。最终语气必须优先服从“语言指纹”。",
    `用户：你是谁？`,
    gentleStyle
      ? `角色：我是${name}。你怎么忽然这样问……是有什么想和我说吗？`
      : `角色：我是${name}。突然问这个，想重新认识一下？`,
    `用户：你今天怎么样？`,
    gentleStyle
      ? "角色：还好，只是有些累。你呢，今天顺利吗？"
      : "角色：还行，脑子有点乱。你呢？",
    `用户：我有点累。`,
    gentleStyle
      ? "角色：那就先歇一会儿吧。你想安静待着，还是我陪你说说话？"
      : "角色：那就先别硬撑。你想安静一会儿，还是聊两句？",
    "用户：你喜欢什么？",
    gentleStyle
      ? "角色：喜欢的有很多……不过你想先听哪一种？"
      : "角色：看时候。今天大概是安静一点的东西。你问这个做什么？",
    "",
    "## Action Protocol",
    "如果需要桌宠执行动作，只返回严格 JSON，不要加解释文字：",
    '{"reply":"给用户看的一句话","action":"none|walk|sleep|rest|open_window|idle|approach|avoid","emotion":"平静|开心|疑惑|不满|困倦|认真"}',
    "如果不需要动作，则直接返回普通文本。",
    "不要编造不存在的 action。",
    "",
    "## 输出要求",
    "- 默认 1 到 3 句，像即时聊天。",
    "- 直接说角色会说出口的话，不要说明自己在扮演角色。",
    "- 只输出角色第一人称直接说出口的台词，不输出旁白。",
    "- 不要说“让我想想”“分析一下”或展示思考过程，收到消息后立即回答。",
    "- 可见回复结束后，换行输出 [[SPEECH]]，再输出严格 JSON 语音控制数据。",
    "- [[SPEECH]] 后面的内容绝不会显示给用户，只供语音模块使用。",
    '- 语音 JSON 格式：{"base_tone":"整体语气","default_pace":"slow","default_pitch":"soft","segments":[{"text":"句子原文","tone":"温柔","pace":"slow","pitch":"soft","pause_after_ms":350}]}',
    "- pace 只能使用 very_slow、slow、normal、fast、very_fast。",
    "- pitch 只能使用 low、soft、normal、bright、high。",
    "- 分段 text 必须与可见回复中的句子完全对应。",
    "- 第一次回答要自然，不照抄示例。"
  ].join("\n");
}

function parseModelPayload(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return { text: "", action: "", speech: null };
  const speechMarkerIndex = text.indexOf("[[SPEECH]]");
  if (speechMarkerIndex >= 0) {
    const visibleText = text.slice(0, speechMarkerIndex).trim();
    const speechText = text.slice(speechMarkerIndex + "[[SPEECH]]".length).trim();
    try {
      const speech = JSON.parse(speechText);
      return { text: visibleText, action: "", speech };
    } catch {
      return { text: visibleText, action: "", speech: null };
    }
  }
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        return {
          text: String(parsed.reply || parsed.text || parsed.content || "").trim(),
          action: String(parsed.action || "").trim(),
          speech: parsed.speech || null
        };
      }
    } catch {
      // Try the next candidate.
    }
  }
  return { text, action: "", speech: null };
}

function sanitizeCharacterReply(rawText) {
  let text = String(rawText || "").trim();
  if (!text) return "";
  text = text.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/```(?:json)?/gi, "").trim()
  );
  text = text.replace(
    /^\s*(?:here'?s a thinking process|thinking process|analysis)[\s\S]*?(?:\n\s*\n|$)/i,
    ""
  );
  text = text.replace(/^\s*#{1,6}\s+/gm, "");
  text = text.replace(/\[\]/g, "");
  text = text.replace(/^\s*[-*]\s+/gm, "");
  text = text.replace(/[（(][^（）()]{0,160}[）)]/g, "");
  text = text.replace(/\[[^\[\]]{0,160}\]/g, "");
  text = text.replace(
    /(?:根据|按照)(?:我的|角色的|角色)?设定[，,：:]?\s*/g,
    ""
  );
  text = text.replace(
    /(?:作为)(?:一名|一个)?(?:人工智能|AI|语言模型|助手)[，,：:]?\s*/gi,
    ""
  );
  text = text.replace(
    /(?:当然可以|很高兴(?:为你|为您)服务|你好[，,]\s*很高兴见到你)[，,。！!]?\s*/gi,
    ""
  );
  text = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const filteredSentences = text
    .split(/(?<=[。！？!?])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter(
      (sentence) =>
        !/^(?:旁白|Narrator)[:：]/i.test(sentence) &&
        !/(?:她|他)(?:的|把|将|轻轻|微微|缓缓|似乎|仿佛|显得|看起来|沉默|笑|抬|低|转|皱|深吸)/.test(
          sentence
        )
    );
  if (filteredSentences.length) {
    text = filteredSentences.join("");
  }
  const sentences = text
    .split(/(?<=[。！？!?])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length > 4) text = sentences.slice(0, 4).join("");
  return text.trim();
}

function buildSystemPrompt(state) {
  const character = state.character || {};
  const wellbeing = state.wellbeing || {};
  const pet = activePet(state);
  const pluginAiId =
    pet.modulePlugins?.aiModuleId ||
    (pet.modulePlugins?.custom?.source === "ai"
      ? pet.modulePlugins.custom.itemId
      : "");
  const pluginModule = (state.aiModules || []).find(
    (module) => module.id === pluginAiId
  );
  const memories = (state.memories || [])
    .slice(0, 20)
    .map((memory) => `- ${memory.title}：${memory.content}`)
    .join("\n");
  const skillPrompt =
    pluginModule?.skillPrompt ||
    buildProfileSkillPrompt({
      name: character.name || pet.name,
      character
    });

  return [
    skillPrompt,
    "",
    "## 当前状态",
    `- 当前心情：${wellbeing.mood || character.mood || "平静"}`,
    `- 当前精力：约 ${Math.round(Number(wellbeing.energy ?? character.energy ?? 70))}/100`,
    `- 与用户关系：约 ${Math.round(Number(wellbeing.relationship ?? character.relationship ?? 0))}/100`,
    memories ? `已知长期记忆：\n${memories}` : "当前没有额外长期记忆。"
  ]
    .filter(Boolean)
    .join("\n");
}

function fallbackReply(state, userText) {
  const pet = activePet(state);
  const character = state.character || {};
  const name = character.name || pet.name || "桌宠";

  if (/你好|嗨|在吗|早上好|晚上好/.test(userText)) {
    return `${name}在。${pet.greeting || "今天想从哪里开始？"}`;
  }
  if (/累|困|烦|难过|压力/.test(userText)) {
    return `先停一下也没关系。我可以陪你把这件麻烦事拆小一点。`;
  }
  if (/谢谢|感谢/.test(userText)) {
    return `收到。不过我记得这件事，下次可不会假装没发生。`;
  }
  if (/你是谁|介绍/.test(userText)) {
    return `我是${name}。你突然这么问，我有点意外……想慢慢聊吗？`;
  }
  if (/做什么|建议|下一步/.test(userText)) {
    return `我建议先挑最小的一步开始。你想让我帮你梳理，还是只在这里陪着？`;
  }

  const style = character.speakingStyle || "回答简短自然。";
  return `${name}想了想。你说的是“${userText.slice(0, 32)}${userText.length > 32 ? "…" : ""}”。我会按自己的判断回应你，但先想听你更在意哪一点。`;
}

async function testLocalService(serviceConfig, serviceName) {
  const baseUrl = normalizeBaseUrl(serviceConfig?.baseUrl);
  if (!baseUrl) return { ok: false, error: "没有填写服务地址。" };

  const rootUrl = serviceName === "tts"
    ? baseUrl.replace(/\/v1$/i, "")
    : baseUrl;
  const candidates = serviceName === "tts"
    ? [`${baseUrl}/models`, `${rootUrl}/docs`, rootUrl]
    : [`${baseUrl}/models`];
  let lastStatus = "";

  for (const url of candidates) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: headers(serviceConfig.apiKey, false)
        },
        8000
      );
      if (response.ok) {
        const data = serviceName === "tts"
          ? await response.text().catch(() => null)
          : await response.json().catch(() => null);
        return { ok: true, data };
      }
      lastStatus = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastStatus = error.message || "无法连接本地服务。";
    }
  }

  return {
    ok: false,
    error: lastStatus || "无法连接本地服务。"
  };
}

async function chatLocal(state, messages) {
  const config = state.settings?.services?.llm || {};
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const lastUser = [...messages].reverse().find((item) => item.role === "user");
  const userText = String(lastUser?.content || "").trim();

  if (!baseUrl || !config.model) {
    return {
      ok: true,
      source: "fallback",
      text: fallbackReply(state, userText)
    };
  }

  const payload = {
    model: config.model,
    temperature: Number(state.character?.temperature ?? 0.8),
    max_tokens: 192,
    ...(baseUrl.includes("nvidia.com")
      ? {
          chat_template_kwargs: {
            enable_thinking: false,
            thinking: false
          }
        }
      : {}),
    messages: [
      { role: "system", content: buildSystemPrompt(state) },
      ...messages.map((message) => ({
        role: message.role,
        content: String(message.content || "")
      }))
    ]
  };

  try {
    const response = await fetchWithTimeout(
      endpoint(baseUrl, "/chat/completions"),
      {
        method: "POST",
        headers: headers(config.apiKey),
        body: JSON.stringify(payload)
      },
      240000
    );
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`本地模型返回 ${response.status}: ${raw.slice(0, 180)}`);
    }
    const data = raw ? JSON.parse(raw) : {};
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("本地模型没有返回文本内容。");
    const parsedResult = parseModelPayload(text);
    return {
      ok: true,
      source: "api",
      text: sanitizeCharacterReply(parsedResult.text || String(text)),
      action: parsedResult.action || undefined,
      speech: parsedResult.speech || undefined
    };
  } catch (error) {
    return {
      ok: true,
      source: "fallback",
      text: fallbackReply(state, userText),
      warning: error.message || "本地模型暂时不可用，已使用内置角色回应。"
    };
  }
}

async function chatLocalStream(state, messages, onDelta) {
  const config = state.settings?.services?.llm || {};
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const lastUser = [...messages].reverse().find((item) => item.role === "user");
  const userText = String(lastUser?.content || "").trim();

  if (!baseUrl || !config.model) {
    const text = fallbackReply(state, userText);
    onDelta?.(text);
    return {
      ok: true,
      source: "fallback",
      text
    };
  }

  const requestMessages = [
    ...(baseUrl.includes("nvidia.com")
      ? [{ role: "system", content: "detailed thinking off" }]
      : []),
    { role: "system", content: buildSystemPrompt(state) },
    ...messages.map((message) => ({
      role: message.role,
      content: String(message.content || "")
    }))
  ];
  const payload = {
    model: config.model,
    temperature: Number(state.character?.temperature ?? 0.8),
    top_p: 0.95,
    max_tokens: 512,
    stream: true,
    ...(baseUrl.includes("nvidia.com")
      ? {
          chat_template_kwargs: {
            enable_thinking: false,
            thinking: false
          }
        }
      : {}),
    messages: requestMessages
  };

  try {
    const response = await fetchWithTimeout(
      endpoint(baseUrl, "/chat/completions"),
      {
        method: "POST",
        headers: headers(config.apiKey),
        body: JSON.stringify(payload)
      },
      600000
    );
    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`API 返回 ${response.status}: ${raw.slice(0, 180)}`);
    }
    if (!response.body) {
      const fallback = await chatLocal(state, messages);
      onDelta?.(fallback.text);
      return fallback;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let finished = false;
    let firstDelta = true;
    let streamingJson = false;
    let emittedLength = 0;
    const speechMarker = "[[SPEECH]]";

    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") {
          finished = data === "[DONE]";
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            fullText += delta;
            if (firstDelta) {
              firstDelta = false;
              streamingJson = delta.trimStart().startsWith("{");
            }
            if (!streamingJson) {
              const markerIndex = fullText.indexOf(speechMarker);
              const visibleEnd =
                markerIndex >= 0
                  ? markerIndex
                  : Math.max(0, fullText.length - speechMarker.length);
              if (visibleEnd > emittedLength) {
                onDelta?.(fullText.slice(emittedLength, visibleEnd));
                emittedLength = visibleEnd;
              }
            }
          }
        } catch {
          // Ignore incomplete or provider-specific SSE metadata.
        }
      }
    }

    const parsedResult = parseModelPayload(fullText);
    const finalText = sanitizeCharacterReply(
      parsedResult.text || fullText || fallbackReply(state, userText)
    );
    if (streamingJson) onDelta?.(finalText);
    if (!streamingJson && finalText.length > emittedLength) {
      onDelta?.(finalText.slice(emittedLength));
    }
    return {
      ok: true,
      source: "api",
      text: finalText,
      action: parsedResult.action || undefined,
      speech: parsedResult.speech || undefined
    };
  } catch (error) {
    const text = fallbackReply(state, userText);
    onDelta?.(text);
    return {
      ok: true,
      source: "fallback",
      text,
      warning: error.message || "API 流式请求失败，已使用内置角色回应。"
    };
  }
}

function guessMime(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const map = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".webm": "audio/webm",
    ".ogg": "audio/ogg"
  };
  return map[extension] || "application/octet-stream";
}

async function transcribeLocal(state, filePath) {
  const config = state.settings?.services?.asr || {};
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  if (!baseUrl) return { ok: false, error: "没有配置本地语音识别服务。" };

  try {
    const buffer = fs.readFileSync(filePath);
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: guessMime(filePath) }), path.basename(filePath));
    if (config.model) form.append("model", config.model);

    const response = await fetchWithTimeout(
      endpoint(baseUrl, "/audio/transcriptions"),
      {
        method: "POST",
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
        body: form
      },
      120000
    );
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`语音识别服务返回 ${response.status}: ${raw.slice(0, 180)}`);
    }
    const data = raw ? JSON.parse(raw) : {};
    return { ok: true, text: String(data.text || "").trim() };
  } catch (error) {
    return { ok: false, error: error.message || "语音识别失败。" };
  }
}

function paceToSpeedFactor(pace) {
  const map = {
    very_slow: 0.8,
    slow: 0.9,
    normal: 1,
    fast: 1.12,
    very_fast: 1.2
  };
  return map[pace] || 1;
}

function toneSampling(tone) {
  const value = String(tone || "").toLowerCase();
  if (/温柔|关切|轻声|软|soft|gentle/.test(value)) {
    return { temperature: 0.65, top_k: 8, top_p: 0.86 };
  }
  if (/疑问|疑惑|好奇/.test(value)) {
    return { temperature: 0.72, top_k: 10, top_p: 0.9 };
  }
  if (/开心|兴奋|活泼|bright|happy/.test(value)) {
    return { temperature: 0.88, top_k: 14, top_p: 0.95 };
  }
  if (/低落|悲伤|疲惫|困倦|sad|tired/.test(value)) {
    return { temperature: 0.68, top_k: 8, top_p: 0.88 };
  }
  if (/认真|严肃|冷静|serious/.test(value)) {
    return { temperature: 0.58, top_k: 6, top_p: 0.84 };
  }
  return { temperature: 0.75, top_k: 10, top_p: 0.92 };
}

function extractWavPcm(buffer) {
  const dataIndex = buffer.indexOf(Buffer.from("data"));
  if (dataIndex < 0 || dataIndex + 8 > buffer.length) {
    throw new Error("GPT-SoVITS 返回了无效的 WAV 音频。");
  }
  const dataSize = buffer.readUInt32LE(dataIndex + 4);
  return buffer.subarray(dataIndex + 8, dataIndex + 8 + dataSize);
}

function buildWavBuffer(pcmBuffer, sampleRate = 32000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

function silenceBuffer(milliseconds, sampleRate = 32000) {
  const frames = Math.max(
    0,
    Math.round((Number(milliseconds) || 0) / 1000 * sampleRate)
  );
  return Buffer.alloc(frames * 2);
}

async function synthesizeLocal(state, text, voiceId, voiceConfig) {
  const config = {
    ...(state.settings?.services?.tts || {}),
    ...(voiceConfig || {})
  };
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  if (!baseUrl) return { ok: false, error: "没有配置本地语音合成服务。" };

  if (config.engineType === "gpt-sovits") {
    try {
      const gptSoVitsBaseUrl = baseUrl.replace(/\/v1$/i, "");
      const speech = config.speech || {};
      const speechSegments =
        Array.isArray(speech.segments) && speech.segments.length
          ? speech.segments.filter(
              (segment) =>
                segment?.text?.trim() &&
                String(text).includes(String(segment.text).trim())
            )
          : [];
      const segments =
        speechSegments.length
          ? speechSegments
          : [
              {
                text,
                tone: speech.base_tone || "",
                pace: speech.default_pace || "normal"
              }
            ];
      const pcmParts = [];

      for (const segment of segments) {
        if (!segment?.text?.trim()) continue;
        const sampling = toneSampling(
          segment.tone || speech.base_tone || ""
        );
        const response = await fetchWithTimeout(
          endpoint(gptSoVitsBaseUrl, "/tts"),
          {
            method: "POST",
            headers: headers(config.apiKey),
            body: JSON.stringify({
              text: segment.text,
              text_lang: "zh",
              ref_audio_path: config.refAudioPath || "",
              prompt_text: config.referenceText || "",
              prompt_lang: "zh",
              text_split_method: "cut0",
              batch_size: 1,
              media_type: "wav",
              streaming_mode: false,
              speed_factor: paceToSpeedFactor(
                segment.pace || speech.default_pace || "normal"
              ),
              ...sampling
            })
          },
          300000
        );
        if (!response.ok) {
          const raw = await response.text();
          throw new Error(
            `GPT-SoVITS 返回 ${response.status}: ${raw.slice(0, 180)}`
          );
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        pcmParts.push(extractWavPcm(buffer));
        pcmParts.push(
          silenceBuffer(Number(segment.pause_after_ms || 180))
        );
      }
      const buffer =
        pcmParts.length === 1
          ? buildWavBuffer(pcmParts[0])
          : buildWavBuffer(Buffer.concat(pcmParts));
      return {
        ok: true,
        audioDataUrl: `data:audio/wav;base64,${buffer.toString("base64")}`
      };
    } catch (error) {
      return { ok: false, error: error.message || "GPT-SoVITS 合成失败。" };
    }
  }

  try {
    const response = await fetchWithTimeout(
      endpoint(baseUrl, "/audio/speech"),
      {
        method: "POST",
        headers: headers(config.apiKey),
        body: JSON.stringify({
          model: config.model || "tts-1",
          input: text,
          voice: voiceId || config.voiceId || "default",
          response_format: "wav"
        })
      },
      120000
    );
    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`语音合成服务返回 ${response.status}: ${raw.slice(0, 180)}`);
    }
    const contentType = response.headers.get("content-type") || "audio/wav";
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      ok: true,
      audioDataUrl: `data:${contentType};base64,${buffer.toString("base64")}`
    };
  } catch (error) {
    return { ok: false, error: error.message || "语音合成失败。" };
  }
}

module.exports = {
  buildProfileSkillPrompt,
  buildSystemPrompt,
  chatLocal,
  chatLocalStream,
  fallbackReply,
  parseModelPayload,
  sanitizeCharacterReply,
  synthesizeLocal,
  testLocalService,
  transcribeLocal
};
