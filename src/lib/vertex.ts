import { GoogleAuth } from "google-auth-library";

/**
 * Server-side Vertex AI and Cloud TTS client for GD Arena.
 * Authenticates using Google Application Default Credentials, service account key file,
 * or gcloud CLI environment on Google Cloud.
 */

const PROJECT_ID = process.env.GCP_PROJECT_ID || "project-5d83834f-f05b-4854-823";
const LOCATION = process.env.GCP_LOCATION || "us-central1";

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getAccessToken(): Promise<string> {
  // Use in-memory cached token if valid for at least 5 minutes
  if (cachedToken && Date.now() < tokenExpiresAt - 300_000) {
    return cachedToken;
  }

  // 1. Try google-auth-library
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

  // 2. Fallback to gcloud CLI
  try {
    const { execSync } = await import("child_process");
    const cliToken = execSync("gcloud auth print-access-token", { encoding: "utf8", timeout: 4000 }).trim();
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

export interface VertexGenerateOptions {
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export async function generateWithVertex(
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>,
  options: VertexGenerateOptions = {},
): Promise<string> {
  const model = options.model || "gemini-2.5-flash";
  const token = await getAccessToken();

  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${model}:generateContent`;

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? 1024,
    },
  };

  if (options.systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: options.systemPrompt }],
    };
  }

  if (options.jsonMode) {
    (body.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": PROJECT_ID,
    },
    body: JSON.stringify(body),
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
  const token = await getAccessToken();
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
