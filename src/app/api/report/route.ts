import { NextResponse } from "next/server";
import { generateWithVertex } from "@/lib/vertex";
import type { SessionRecord } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const session = (await req.json()) as SessionRecord;
    const { config, turns } = session;

    const transcriptDump = turns
      .map((t) => `[ID:${t.id}][t=${Math.round(t.tStart)}s][${t.speaker}]: ${t.spokenText || t.text}`)
      .join("\n");

    const systemPrompt = `You are a strict, senior campus placement GD evaluator at top consulting and product companies.
Analyze the student's performance in this group discussion based on the 6 standard GD rubric criteria:
1. starting: Starting the discussion (did they open early, set a clear frame?)
2. ideas: Quality of ideas (substance, statistics, structure, real-world examples)
3. building: Building on others (referencing others by name, synthesizing)
4. listening: Active listening (addressing points made right before them)
5. interruptions: Handling interruptions (holding ground politely without panic)
6. ending: Ending strongly (summarizing, balanced conclusion)

CRITICAL RULES FOR EVIDENCE:
- Every criterion must include 1 or 2 EXACT, VERBATIM quotes from the transcript with the exact turn ID.
- Do NOT fabricate or alter words in quotes.
- Also identify 2 to 3 "missed openings" (where the student stayed silent or let a false claim pass) with an ideal 15-second counter-line.

Output strictly valid JSON with this exact schema:
{
  "overallScore": number (0-100),
  "strengths": string[],
  "fixes": string[],
  "feedback": [
    {
      "id": "starting" | "ideas" | "building" | "listening" | "interruptions" | "ending",
      "title": string,
      "score": number (0.0 - 10.0),
      "verdict": "strong" | "okay" | "weak",
      "summary": string,
      "tryThis": string,
      "evidence": [
        { "turnId": number, "speaker": string, "t": number, "text": string }
      ]
    }
  ],
  "openings": [
    {
      "id": string,
      "t": number,
      "title": string,
      "contextTurnId": number,
      "ideal": string
    }
  ]
}`;

    const prompt = `Topic: "${config.topic}"
Format: ${config.format}
Goal: ${config.goal}

Full Transcript:
${transcriptDump}

Evaluate the student now in strict JSON format.`;

    const raw = await generateWithVertex(
      [{ role: "user", parts: [{ text: prompt }] }],
      {
        systemPrompt,
        model: "gemini-2.5-flash",
        temperature: 0.2,
        jsonMode: true,
        maxTokens: 2048,
      },
    );

    const reportJson = JSON.parse(raw);
    return NextResponse.json(reportJson);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("API /api/report error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
