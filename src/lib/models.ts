/**
 * Model registry for GD Arena.
 *
 * IDs were verified against https://ai.google.dev/gemini-api/docs/models on 2026-10-10.
 * Everything is pinned here (and overridable via env on the server) so that swapping a
 * model never requires touching business logic. Fallbacks are tried in order when a
 * call fails or exceeds its latency budget.
 *
 * NOTE: This file is consumed by the realtime backend (Stage 2+). In Stage 1 the
 * frontend runs on a local simulation engine and does not call any model yet.
 */

export type ModelRole =
  | "persona" // live dialogue for each AI participant (streamed text)
  | "director" // tiny/fast JSON call: who speaks next + intent
  | "stt_live" // streaming speech-to-text with language auto-detect
  | "stt_batch" // post-session word-level timestamps
  | "tts" // per-persona voices
  | "moderator_live" // optional native-audio moderator / fishbowl commentary
  | "analyst" // post-session report + Ghost Replay (structured output)
  | "embeddings"; // progress tracking / topic similarity

export interface ModelChoice {
  role: ModelRole;
  primary: string;
  fallbacks: string[];
  why: string;
}

export const MODELS: Record<ModelRole, ModelChoice> = {
  persona: {
    role: "persona",
    primary: "gemini-3.8-flash",
    fallbacks: ["gemini-3.5-flash", "gemini-2.5-flash"],
    why: "Fast, strong at role-play. Thinking set to `low` to keep first-token latency down.",
  },
  director: {
    role: "director",
    primary: "gemini-3.5-flash-lite",
    fallbacks: ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite"],
    why: "Small structured-JSON decision (who speaks, intent, urgency) must return in ~250 ms.",
  },
  stt_live: {
    role: "stt_live",
    primary: "gemini-3.5-transcribe-live",
    fallbacks: ["gemini-3.5-transcribe"],
    why: "Streaming transcription, utterance-level language detection and English/Hindi code-switching: this is what powers Hinglish auto-detect.",
  },
  stt_batch: {
    role: "stt_batch",
    primary: "gemini-3.5-transcribe",
    fallbacks: [],
    why: "Unary transcription with word-level timestamps + diarization for precise evidence clips.",
  },
  tts: {
    role: "tts",
    primary: "gemini-3.8-flash-tts",
    fallbacks: ["gemini-3.8-flash-lite-tts", "gemini-3.1-flash-tts-preview"],
    why: "130 languages, prebuilt + extended voice library. Lite variant is the low-latency fallback.",
  },
  moderator_live: {
    role: "moderator_live",
    primary: "gemini-3.8-live",
    fallbacks: ["gemini-3.1-flash-live-preview"],
    why: "Optional: native-audio Live API for the moderator and fishbowl coach whisper.",
  },
  analyst: {
    role: "analyst",
    primary: "gemini-3.8-flash",
    fallbacks: ["gemini-3.1-pro-preview"],
    why: "Structured outputs + thinking (`high`) for the evidence-linked report and Ghost Replay.",
  },
  embeddings: {
    role: "embeddings",
    primary: "gemini-embedding-2",
    fallbacks: ["gemini-embedding-001"],
    why: "Optional: cluster a student's habits and match drills across sessions.",
  },
};

/** Prebuilt Gemini TTS voice assigned to each seat (verify against the live voice list). */
export const GEMINI_VOICES = {
  moderator: "Charon",
  vikram: "Fenrir",
  ananya: "Kore",
  meera: "Aoede",
  rohan: "Puck",
  kabir: "Orus",
  sana: "Leda",
} as const;
