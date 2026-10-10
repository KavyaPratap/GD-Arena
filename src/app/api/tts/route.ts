import { NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/vertex";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, speaker, lang } = body as {
      text: string;
      speaker: string;
      lang?: "en" | "hinglish";
    };

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const audioBase64 = await synthesizeSpeech(text, speaker || "moderator", lang || "en");

    return NextResponse.json({
      audioContent: audioBase64,
      format: "audio/mp3",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("API /api/tts error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
