import { NextResponse } from "next/server";
import { synthesizeSpeech, CLOUD_TTS_VOICES } from "@/lib/vertex";
import { clean, guard } from "@/lib/guard";

export async function POST(req: Request) {
  const g = await guard(req, { bucket: "tts", limit: 60, maxBytes: 8_000 });
  if (!g.ok) return g.res;

  try {
    const body = (g.body ?? {}) as Record<string, unknown>;
    const text = clean(body.text, 1500);
    const speaker = typeof body.speaker === "string" && body.speaker in CLOUD_TTS_VOICES ? body.speaker : "moderator";
    const lang = body.lang === "hinglish" ? "hinglish" : "en";

    if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 });

    const audioBase64 = await synthesizeSpeech(text, speaker, lang);

    return NextResponse.json({
      audioContent: audioBase64,
      format: "audio/mp3",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("API /api/tts error:", msg);
    return NextResponse.json({ error: "Speech synthesis failed" }, { status: 500 });
  }
}
