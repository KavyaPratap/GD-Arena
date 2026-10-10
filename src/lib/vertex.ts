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

export async function getAccessToken(): Promise<string> {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error("Failed to retrieve Google Cloud access token. Ensure credentials are configured.");
  }
  return token.token;
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

/** Voice assignments for Google Cloud Text-to-Speech */
export const CLOUD_TTS_VOICES: Record<string, { en: string; hi: string; pitch: number; rate: number }> = {
  moderator: { en: "en-IN-Wavenet-D", hi: "hi-IN-Wavenet-D", pitch: -2.0, rate: 0.95 },
  vikram: { en: "en-IN-Wavenet-C", hi: "hi-IN-Wavenet-C", pitch: -1.5, rate: 1.15 },
  ananya: { en: "en-IN-Wavenet-A", hi: "hi-IN-Wavenet-A", pitch: 1.2, rate: 1.05 },
  meera: { en: "en-IN-Wavenet-B", hi: "hi-IN-Wavenet-B", pitch: 2.0, rate: 0.88 },
  rohan: { en: "en-IN-Journey-F", hi: "hi-IN-Wavenet-F", pitch: 0.0, rate: 1.1 },
  kabir: { en: "en-IN-Journey-D", hi: "hi-IN-Wavenet-C", pitch: -3.0, rate: 0.98 },
  sana: { en: "en-IN-Wavenet-A", hi: "hi-IN-Wavenet-A", pitch: 1.5, rate: 1.0 },
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
        pitch: cfg.pitch,
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
