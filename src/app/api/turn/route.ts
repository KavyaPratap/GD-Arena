import { NextResponse } from "next/server";
import { generateWithVertex } from "@/lib/vertex";
import { PERSONA_BY_ID } from "@/lib/personas";
import type { PersonaId, Turn } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { topic, panel, turns, speaker, lang } = body as {
      topic: string;
      panel: PersonaId[];
      turns: Turn[];
      speaker?: PersonaId;
      lang?: "en" | "hinglish";
    };

    const chosenSpeaker: PersonaId =
      speaker && panel.includes(speaker)
        ? speaker
        : panel[Math.floor(Math.random() * panel.length)] || "vikram";

    const persona = PERSONA_BY_ID[chosenSpeaker];
    const isHinglish = lang === "hinglish";

    const recentTurns = turns.slice(-6).map((t) => {
      const name = t.speaker === "student" ? "Human Student" : t.speaker;
      return `${name}: ${t.spokenText || t.text}`;
    });

    const systemPrompt = `You are roleplaying as ${persona.name} (${persona.role}) in a competitive campus placement Group Discussion.
Your personality and behavioral traits:
- Urgency: ${persona.traits.urgency}
- Interruption propensity: ${persona.traits.interrupts}
- Private agenda: "${persona.agenda}"
- Tagline: "${persona.tagline}"

Ground rules:
1. Speak in ${isHinglish ? "natural conversational Hinglish (Hindi + English mix, romanized)" : "natural conversational English"}.
2. Keep your response concise: 1 to 3 punchy sentences (20 to 50 words max).
3. Do NOT lecture. Respond directly to what someone just said, agree/disagree/probe/build, or advance your private agenda.
4. If someone made an unsupported claim, challenge it. If you have data, cite a realistic figure.
5. Sound like an ambitious college student in a real GD, not a polite AI assistant.`;

    const userPrompt = `Topic: "${topic}"

Recent discussion so far:
${recentTurns.length ? recentTurns.join("\n") : "(The floor just opened)"}

Now it is your turn to speak as ${persona.name}. Deliver your line:`;

    const reply = await generateWithVertex(
      [{ role: "user", parts: [{ text: userPrompt }] }],
      {
        systemPrompt,
        model: "gemini-2.5-flash",
        temperature: 0.85,
        maxTokens: 150,
      },
    );

    const cleanText = reply.replace(/^["'\s]+|["'\s]+$/g, "").replace(/^[A-Za-z]+:\s*/, "");
    const claim = /\d+(\.\d+)?\s?(%|percent|crore|lakh|million|billion|years?)/i.test(cleanText);

    return NextResponse.json({
      speaker: chosenSpeaker,
      text: cleanText,
      claim,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("API /api/turn error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
