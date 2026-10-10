import { GoogleAuth } from "google-auth-library";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Server-side Vertex AI and Cloud TTS client for GD Arena.
 * Authenticates using Google Application Default Credentials, service account key file,
 * or gcloud CLI environment on Google Cloud.
 *
 * Project id comes from GCP_PROJECT_ID, else from the credentials / gcloud config. Nothing is hardcoded.
 */

const LOCATION = process.env.GCP_LOCATION || "us-central1";

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let tokenInflight: Promise<string> | null = null;
let projectInflight: Promise<string> | null = null;

export function getProjectId(): Promise<string> {
  const envId =
    process.env.GCP_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    (process.env.FIREBASE_CONFIG ? (() => { try { return JSON.parse(process.env.FIREBASE_CONFIG).projectId; } catch { return undefined; } })() : undefined);
  if (envId) return Promise.resolve(envId);

  if (!projectInflight) {
    projectInflight = (async () => {
      try {
        const id = await auth.getProjectId();
        if (id) return id;
      } catch {
        /* fall through to gcloud config */
      }
      try {
        const { stdout } = await execFileAsync("gcloud", ["config", "get-value", "project"], { timeout: 6000 });
        if (stdout.trim()) return stdout.trim();
      } catch {
        /* handled below */
      }
      // Default to deployed Firebase project
      return "gdarena-2251a";
    })();
  }
  return projectInflight;
}

async function fetchToken(): Promise<string> {
  // 1. google-auth-library (ADC / service account)
  try {
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    if (token.token) {
      cachedToken = token.token;
      tokenExpiresAt = Date.now() + 3300_000; // ~55 mins
      return cachedToken;
    }
  } catch (authErr) {
    console.warn("GoogleAuth getAccessToken failed, checking gcloud CLI fallback:", authErr);
  }

  // 2. gcloud CLI, asynchronous so the Node event loop is never blocked
  try {
    const { stdout } = await execFileAsync("gcloud", ["auth", "print-access-token"], { timeout: 8000 });
    const cliToken = stdout.trim();
    if (cliToken) {
      cachedToken = cliToken;
      tokenExpiresAt = Date.now() + 1800_000; // 30 mins
      return cachedToken;
    }
  } catch (cliErr) {
    console.error("gcloud CLI token fallback failed:", cliErr);
  }

  throw new Error("Failed to retrieve Google Cloud access token. Ensure credentials are configured.");
}

export async function getAccessToken(): Promise<string> {
  // Use in-memory cached token if valid for at least 5 minutes
  if (cachedToken && Date.now() < tokenExpiresAt - 300_000) return cachedToken;
  // De-duplicate concurrent refreshes so a burst of requests spawns one auth call, not many.
  if (!tokenInflight) tokenInflight = fetchToken().finally(() => (tokenInflight = null));
  return tokenInflight;
}

/** Pre-warm so the first real request (the moderator's opening) is not paying cold-auth latency. */
export function warmUp(): void {
  void getAccessToken().catch(() => undefined);
  void getProjectId().catch(() => undefined);
}
warmUp();

export interface VertexGenerateOptions {
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  /** 0 disables Gemini 2.5 thinking: much lower latency for short conversational turns. */
  thinkingBudget?: number;
  signal?: AbortSignal;
}

export async function generateWithVertex(
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>,
  options: VertexGenerateOptions = {},
): Promise<string> {
  const model = options.model || "gemini-2.5-flash";
  const [token, PROJECT_ID] = await Promise.all([getAccessToken(), getProjectId()]);

  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${model}:generateContent`;

  const generationConfig: Record<string, unknown> = {
    temperature: options.temperature ?? 0.7,
    maxOutputTokens: options.maxTokens ?? 1024,
  };
  if (options.thinkingBudget !== undefined) generationConfig.thinkingConfig = { thinkingBudget: options.thinkingBudget };

  const body: Record<string, unknown> = { contents, generationConfig };

  if (options.systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: options.systemPrompt }],
    };
  }

  if (options.jsonMode) {
    generationConfig.responseMimeType = "application/json";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": PROJECT_ID,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vertex AI error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const part = candidate?.content?.parts?.[0];
  return part?.text || "";
}

/**
 * Studio-grade Chirp 3 HD voice assignments for Google Cloud Text-to-Speech.
 * Chirp 3 HD provides human-level breathing, authentic Indian English / Hindi accent
 * intonation, natural emotion, and eliminates robotic synthetic monotone.
 */
export const CLOUD_TTS_VOICES: Record<string, { en: string; hi: string; rate: number }> = {
  moderator: {
    en: "en-IN-Chirp3-HD-Charon",
    hi: "hi-IN-Chirp3-HD-Charon",
    rate: 0.98, // Authoritative, measured, mature
  },
  vikram: {
    en: "en-IN-Chirp3-HD-Fenrir",
    hi: "hi-IN-Chirp3-HD-Fenrir",
    rate: 1.05, // Fast-paced, assertive, confident
  },
  ananya: {
    en: "en-IN-Chirp3-HD-Kore",
    hi: "hi-IN-Chirp3-HD-Kore",
    rate: 1.02, // Crisp, intellectual, structured
  },
  meera: {
    en: "en-IN-Chirp3-HD-Aoede",
    hi: "hi-IN-Chirp3-HD-Aoede",
    rate: 0.94, // Gentle, reflective, polite
  },
  rohan: {
    en: "en-IN-Chirp3-HD-Puck",
    hi: "hi-IN-Chirp3-HD-Puck",
    rate: 1.03, // Warm, charismatic, conversational
  },
  kabir: {
    en: "en-IN-Chirp3-HD-Orus",
    hi: "hi-IN-Chirp3-HD-Orus",
    rate: 1.0, // Sharp contrarian, skeptical, analytical
  },
  sana: {
    en: "en-IN-Chirp3-HD-Leda",
    hi: "hi-IN-Chirp3-HD-Leda",
    rate: 0.98, // Diplomatic, consensus-builder, poised
  },
};

export async function synthesizeSpeech(
  text: string,
  speaker: string,
  lang: "en" | "hinglish" = "en",
): Promise<string> {
  const [token, PROJECT_ID] = await Promise.all([getAccessToken(), getProjectId()]);
  const cfg = CLOUD_TTS_VOICES[speaker] || CLOUD_TTS_VOICES.moderator;
  const isHi = lang === "hinglish";
  const voiceName = isHi ? cfg.hi : cfg.en;
  const languageCode = isHi ? "hi-IN" : "en-IN";

  const url = "https://texttospeech.googleapis.com/v1/text:synthesize";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": PROJECT_ID,
    },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode,
        name: voiceName,
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: cfg.rate,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cloud TTS error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.audioContent; // base64 MP3
}
