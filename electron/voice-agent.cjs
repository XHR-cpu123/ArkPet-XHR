class VoiceAgent {
  constructor({ transcribe, reply, speak }) {
    this.transcribeProvider = transcribe;
    this.replyProvider = reply;
    this.speakProvider = speak;
  }

  async transcribe(audioBytes, options = {}) {
    return this.transcribeProvider(audioBytes, options);
  }

  async reply(text, options = {}) {
    return this.replyProvider(text, options);
  }

  async speak(text, options = {}) {
    return this.speakProvider(text, options);
  }

  async onUserAudio(audioBytes, options = {}) {
    const transcription = await this.transcribe(audioBytes, options);
    if (!transcription.ok || !transcription.text) {
      return {
        ok: false,
        error: transcription.error || "没有识别到有效语音。",
        transcription
      };
    }
    const reply = await this.reply(transcription.text, options);
    if (!reply.ok || !reply.text) {
      return {
        ok: false,
        error: reply.error || reply.warning || "对话模型没有返回文本。",
        transcription,
        reply
      };
    }
    const speech = await this.speak(reply.text, options);
    return {
      ok: speech.ok,
      transcript: transcription.text,
      reply: reply.text,
      source: reply.source,
      warning: reply.warning,
      audioDataUrl: speech.audioDataUrl,
      error: speech.error
    };
  }
}

module.exports = {
  VoiceAgent
};
