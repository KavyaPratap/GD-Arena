/**
 * Report builder.
 *
 * Stage 1: deterministic heuristics over the real transcript so the evidence-linking UI is fully
 * functional. Stage 4 replaces `buildReport` with a Gemini structured-output analyst, but the OUTPUT
 * CONTRACT and the quote validator below stay identical: no quote, no claim.
 */
import { PERSONA_BY_ID } from "./personas";
import { countFillers, wordCount } from "./lang";
import type { BodyLanguage, BodyMoment, PersonaId, SessionRecord, SpeakerId, Turn } from "./types";

export interface Quote {
  turnId: number;
  speaker: SpeakerId;
  t: number;
  text: string;
  /** true when `text` was machine-checked to be a verbatim substring of the stored transcript turn */
  verified: boolean;
  /** AI turn that was cut off: the quote is only the part the student actually heard. */
  cutOff?: boolean;
}

export interface Feedback {
  id: string;
  title: string;
  score: number;
  verdict: "strong" | "okay" | "weak";
  summary: string;
  tryThis: string;
  evidence: Quote[];
}

export interface Opening {
  id: string;
  t: number;
  kind: "unchallenged_claim" | "long_silence" | "yielded";
  title: string;
  context: Quote;
  ideal: string;
}

export interface BodyCard {
  id: "eye" | "expression" | "posture" | "composure";
  title: string;
  /** null when there was not enough usable data to judge honestly */
  score: number | null;
  verdict: "strong" | "okay" | "weak" | "unknown";
  summary: string;
  tryThis: string;
  stats: { label: string; value: string }[];
}

export interface BodyReport {
  /** 0..100, from the cards that could be scored */
  overall: number | null;
  cards: BodyCard[];
  moments: BodyMoment[];
  /** Gemini's coaching paragraph grounded in the numbers above (when the analyst ran) */
  coaching?: string;
  seconds: number;
}

export interface Report {
  airtime: { id: SpeakerId; label: string; seconds: number; pct: number; turns: number }[];
  delivery: {
    wpm: number;
    fillers: { word: string; count: number }[];
    fillerTotal: number;
    avgTurnSec: number;
    longestSilenceSec: number;
    studentTurns: number;
    studentWords: number;
  };
  feedback: Feedback[];
  openings: Opening[];
  overall: number;
  strengths: string[];
  fixes: string[];
  /** who produced the scores: the Gemini analyst, or the offline keyword heuristics */
  source?: "gemini" | "heuristic";
  body?: BodyReport;
}

const clamp = (n: number, a = 0, b = 10) => Math.min(b, Math.max(a, n));
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function labelOf(id: SpeakerId): string {
  if (id === "student") return "You";
  if (id === "moderator") return "Mr. Iyer";
  return PERSONA_BY_ID[id as PersonaId]?.name ?? id;
}

/** The evidence guarantee: a quote is only accepted if it appears word-for-word in the turn it points to. */
export function verifyQuote(turns: Turn[], turnId: number, quote: string): boolean {
  const turn = turns.find((t) => t.id === turnId);
  if (!turn) return false;
  const hay = norm(turn.spokenText && turn.speaker !== "student" ? turn.text : turn.text);
  return hay.includes(norm(quote));
}

function excerpt(text: string, max = 190): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  let out = sentences[0] ?? text;
  for (let i = 1; i < sentences.length && (out + " " + sentences[i]).length <= max; i++) out += " " + sentences[i];
  if (out.length > max) out = out.slice(0, max).replace(/\s+\S*$/, "");
  return out.trim();
}

function mkQuote(turns: Turn[], t: Turn, cutOff = false): Quote {
  const raw = cutOff && t.spokenText ? t.spokenText : excerpt(t.text);
  const text = raw.trim();
  return { turnId: t.id, speaker: t.speaker, t: t.tStart, text, verified: verifyQuote(turns, t.id, text), cutOff: cutOff || undefined };
}

const STOP = new Set(["about", "their", "there", "which", "would", "could", "should", "these", "those", "think", "because", "being", "other", "where", "while", "really", "people"]);
const contentWords = (s: string) => new Set((s.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter((w) => !STOP.has(w)));

export function buildReport(s: SessionRecord): Report {
  const { turns, events, config } = s;
  const student = turns.filter((t) => t.speaker === "student");
  const discTurns = turns.filter((t) => t.tStart >= s.discStart - 0.01 && t.speaker !== "moderator");
  const panelNames = config.panel.map((p) => PERSONA_BY_ID[p].name.toLowerCase());
  const moderatorTurn = (kind: Turn["kind"]) => turns.find((t) => t.speaker === "moderator" && t.kind === kind);

  // ── airtime
  const secs = new Map<SpeakerId, number>();
  const counts = new Map<SpeakerId, number>();
  for (const t of turns) {
    if (t.speaker === "moderator") continue;
    secs.set(t.speaker, (secs.get(t.speaker) ?? 0) + Math.max(0, t.tEnd - t.tStart));
    counts.set(t.speaker, (counts.get(t.speaker) ?? 0) + 1);
  }
  const total = [...secs.values()].reduce((a, b) => a + b, 0) || 1;
  const airtime = (["student", ...config.panel] as SpeakerId[]).map((id) => ({
    id,
    label: labelOf(id),
    seconds: secs.get(id) ?? 0,
    pct: ((secs.get(id) ?? 0) / total) * 100,
    turns: counts.get(id) ?? 0,
  }));

  // ── delivery
  const studentWords = student.reduce((a, t) => a + wordCount(t.text), 0);
  const studentSecs = student.reduce((a, t) => a + Math.max(0.5, t.tEnd - t.tStart), 0);
  const fillerMap: Record<string, number> = {};
  for (const t of student) for (const [k, v] of Object.entries(countFillers(t.text))) fillerMap[k] = (fillerMap[k] ?? 0) + v;
  const fillers = Object.entries(fillerMap).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count);
  const marks = [s.discStart, ...student.flatMap((t) => [t.tStart, t.tEnd]), s.discEnd].sort((a, b) => a - b);
  let longest = 0;
  const gaps: { from: number; to: number }[] = [];
  const edges = [s.discStart, ...student.flatMap((t) => [t.tStart, t.tEnd]), s.discEnd];
  for (let i = 0; i < edges.length - 1; i += 2) {
    const g = edges[i + 1] - edges[i];
    gaps.push({ from: edges[i], to: edges[i + 1] });
    longest = Math.max(longest, g);
  }
  void marks;
  const delivery: Report["delivery"] = {
    wpm: studentSecs > 0 ? Math.round(studentWords / (studentSecs / 60)) : 0,
    fillers,
    fillerTotal: fillers.reduce((a, f) => a + f.count, 0),
    avgTurnSec: student.length ? studentSecs / student.length : 0,
    longestSilenceSec: longest,
    studentTurns: student.length,
    studentWords,
  };

  const verdict = (n: number): Feedback["verdict"] => (n >= 7 ? "strong" : n >= 4.5 ? "okay" : "weak");
  const fallbackQuote = (kind: Turn["kind"] = "floor_open") => {
    const m = moderatorTurn(kind) ?? turns[0];
    return m ? [mkQuote(turns, m)] : [];
  };
  const feedback: Feedback[] = [];

  // 1 ── starting the discussion
  {
    const first = discTurns[0];
    const firstStudent = student.find((t) => t.kind !== "closing");
    const delay = firstStudent ? firstStudent.tStart - s.discStart : Infinity;
    const wasFirst = first?.speaker === "student";
    const score = !firstStudent ? 1 : wasFirst ? 9 : delay < 30 ? 8 : delay < 75 ? 6 : delay < 150 ? 4 : 2;
    feedback.push({
      id: "starting",
      title: "Starting the discussion",
      score,
      verdict: verdict(score),
      summary: !firstStudent
        ? "You never took the floor during the open discussion, so nobody heard your opening."
        : wasFirst
          ? "You opened the discussion yourself, which is exactly what recruiters score highly."
          : `You first spoke ${Math.round(delay)}s after the floor opened, after ${first ? labelOf(first.speaker) : "others"} had already framed the topic.`,
      tryThis: "Use the 30s prep to write one stance + one reason. Open with: “Let me frame this: my view is X because Y.”",
      evidence: firstStudent ? [mkQuote(turns, firstStudent)] : fallbackQuote("floor_open"),
    });
  }

  // 2 ── quality of ideas
  {
    const re = /\b(for example|for instance|e\.g\.|such as|because|since|therefore|however|on the other hand|jaise|kyunki|udaharan|isliye)\b|\d+\s?(%|percent)/gi;
    const scored = student.filter((t) => t.kind !== "closing").map((t) => ({ t, m: (t.text.match(re) ?? []).length }));
    const perTurn = scored.length ? scored.reduce((a, x) => a + x.m, 0) / scored.length : 0;
    const avgWords = student.length ? studentWords / student.length : 0;
    const score = !scored.length ? 1 : clamp(3 + perTurn * 2.5 + (avgWords >= 25 ? 1.5 : 0) - (avgWords > 70 ? 1.5 : 0) - (avgWords < 10 ? 1.5 : 0));
    const best = [...scored].sort((a, b) => b.m - a.m || wordCount(b.t.text) - wordCount(a.t.text))[0];
    feedback.push({
      id: "ideas",
      title: "Quality of ideas",
      score,
      verdict: verdict(score),
      summary: !scored.length
        ? "No ideas were recorded from you to evaluate."
        : `You used ${perTurn.toFixed(1)} reasoning markers (because, for example, figures) per turn across ${scored.length} turns, averaging ${Math.round(avgWords)} words each.`,
      tryThis: "Structure each point as claim → reason → example. One concrete number or real case beats three adjectives.",
      evidence: best ? [mkQuote(turns, best.t)] : fallbackQuote("opening"),
    });
  }

  // 3 ── building on others
  {
    const refRe = /\b(agree|disagree|building on|build on|adding to|add to|you said|point about|as \w+ (said|mentioned|pointed)|jaise|ne kaha|sahi kaha|baat se|to add)\b/i;
    const refs = student.filter((t) => t.kind !== "closing" && (refRe.test(t.text) || panelNames.some((n) => t.text.toLowerCase().includes(n))));
    const eligible = student.filter((t) => t.kind !== "closing");
    const share = eligible.length ? refs.length / eligible.length : 0;
    const score = !eligible.length ? 1 : clamp(2 + share * 8);
    const ignored = eligible.find((t) => !refs.includes(t));
    feedback.push({
      id: "building",
      title: "Building on others",
      score,
      verdict: verdict(score),
      summary: !eligible.length
        ? "You didn't speak, so there was nothing to build on."
        : `${refs.length} of ${eligible.length} of your turns explicitly referenced another participant.`,
      tryThis: "Name the person, then add: “Building on Ananya's point about…, I'd add…”. It signals listening and earns goodwill.",
      evidence: refs[0] ? [mkQuote(turns, refs[0])] : ignored ? [mkQuote(turns, ignored)] : fallbackQuote("opening"),
    });
  }

  // 4 ── listening
  {
    const pairs: { s: Turn; ai: Turn; overlap: number }[] = [];
    for (const t of student) {
      const idx = turns.indexOf(t);
      const prev = [...turns.slice(Math.max(0, idx - 2), idx)].reverse().find((x) => x.speaker !== "student" && x.speaker !== "moderator");
      if (!prev || t.kind === "closing") continue;
      const a = contentWords(t.text);
      const b = contentWords(prev.text);
      const overlap = [...a].filter((w) => b.has(w)).length;
      pairs.push({ s: t, ai: prev, overlap });
    }
    const responsive = pairs.filter((p) => p.overlap >= 1);
    const share = pairs.length ? responsive.length / pairs.length : 0;
    const score = !pairs.length ? (student.length ? 4 : 1) : clamp(2 + share * 8);
    const miss = pairs.find((p) => p.overlap === 0);
    feedback.push({
      id: "listening",
      title: "Listening",
      score,
      verdict: verdict(score),
      summary: !pairs.length
        ? "There weren't enough exchanges to judge whether you listened."
        : `${responsive.length} of ${pairs.length} replies picked up concrete words or ideas from the speaker before you.`,
      tryThis: "Before you speak, repeat the last speaker's key word in your own sentence. If you can't, you probably weren't listening.",
      evidence: responsive[0]
        ? [mkQuote(turns, responsive[0].ai), mkQuote(turns, responsive[0].s)]
        : miss
          ? [mkQuote(turns, miss.ai), mkQuote(turns, miss.s)]
          : fallbackQuote("opening"),
    });
  }

  // 5 ── handling interruptions
  {
    const byAI = events.filter((e) => e.type === "ai_interrupts_student");
    const byYou = events.filter((e) => e.type === "student_barge_in");
    const held = byAI.filter((e) => e.outcome === "held").length;
    const yielded = byAI.filter((e) => e.outcome === "yielded").length;
    const score = byAI.length === 0 && byYou.length === 0 ? 6 : clamp(6 + Math.min(3, held * 1.5) - Math.min(3, yielded * 1.5) + Math.min(1, byYou.length * 0.5));
    const ev: Quote[] = [];
    const aiEv = byAI[0];
    if (aiEv) {
      const t = turns.find((x) => x.speaker === aiEv.persona && x.tStart >= aiEv.at - 0.5);
      if (t) ev.push(mkQuote(turns, t));
    } else if (byYou[0]) {
      const t = turns.find((x) => x.id === byYou[0].turnId);
      if (t) ev.push(mkQuote(turns, t, true));
    }
    feedback.push({
      id: "interruptions",
      title: "Handling interruptions",
      score,
      verdict: verdict(score),
      summary:
        byAI.length === 0 && byYou.length === 0
          ? "Nobody interrupted you and you didn't interrupt anyone. Raise the interruption level to actually test this skill."
          : `You were cut off ${byAI.length}× (held your ground ${held}×, yielded ${yielded}×) and you cut an AI participant off ${byYou.length}×.`,
      tryThis: "When interrupted, use a bridge: “Let me finish this one point, then I'll take yours.” Keep your pace calm and do not speed up.",
      evidence: ev.length ? ev : fallbackQuote("opening"),
    });
  }

  // 6 ── ending strongly
  {
    const closing = student.find((t) => t.kind === "closing");
    const w = closing ? wordCount(closing.text) : 0;
    const marker = closing ? /\b(to conclude|in conclusion|overall|to sum up|summary|finally|in short|isliye|toh matlab|mera view|my view)\b/i.test(closing.text) : false;
    const refsOthers = closing ? panelNames.some((n) => closing.text.toLowerCase().includes(n)) || /\b(everyone|others|agreed|balance)\b/i.test(closing.text) : false;
    const score = !closing ? 1 : clamp(2 + (w >= 20 && w <= 75 ? 3 : w >= 10 ? 1.5 : 0) + (marker ? 3 : 0) + (refsOthers ? 2 : 0));
    feedback.push({
      id: "ending",
      title: "Ending strongly",
      score,
      verdict: verdict(score),
      summary: !closing
        ? "You did not deliver a closing statement. The closing round is where evaluators decide what to remember about you."
        : `Your closing ran ${w} words${marker ? " with a clear conclusion marker" : " but never signalled a conclusion"}${refsOthers ? " and acknowledged the group." : "."}`,
      tryThis: "Close in 3 beats: your stance → the strongest reason → what the group agreed on. Aim for 20 to 25 seconds.",
      evidence: closing ? [mkQuote(turns, closing)] : fallbackQuote("closing"),
    });
  }

  // ── Ghost Replay: missed openings
  const openings: Opening[] = [];
  const topic = config.topic.replace(/[?.]+$/, "");
  turns.forEach((t, i) => {
    if (t.speaker === "student" || t.speaker === "moderator" || !t.claim || t.tStart < s.discStart) return;
    const answered = turns.slice(i + 1, i + 4).some((x) => x.speaker === "student");
    if (answered) return;
    const fig = t.text.match(/\d+(\.\d+)?\s?(%|percent|crore|lakh|million|billion|years?)/i)?.[0] ?? "that figure";
    const name = labelOf(t.speaker);
    openings.push({
      id: `claim-${t.id}`,
      t: t.tStart,
      kind: "unchallenged_claim",
      title: `${name} made a claim you never answered`,
      context: mkQuote(turns, t),
      ideal:
        t.lang === "hinglish"
          ? `${name}, aapne ${fig} bola, lekin yeh number is par depend karta hai ki ${topic} kaise implement hota hai. Short-term aur long-term ko alag dekhte hain, aur sabse zaroori sawaal yeh hai ki cost kaun uthata hai.`
          : `${name}, you cited ${fig}, but a figure like that depends entirely on how this is implemented. Let's separate short-term from long-term effects, and ask who actually bears the cost.`,
    });
  });
  gaps
    .filter((g) => g.to - g.from > 60 && g.from >= s.discStart)
    .forEach((g) => {
      const near = turns.find((x) => x.speaker !== "student" && x.speaker !== "moderator" && x.tStart >= g.from + (g.to - g.from) / 2) ?? turns.find((x) => x.speaker !== "student" && x.speaker !== "moderator" && x.tStart >= g.from);
      if (!near) return;
      openings.push({
        id: `silence-${Math.round(g.from)}`,
        t: near.tStart,
        kind: "long_silence",
        title: `You stayed silent for ${Math.round(g.to - g.from)}s`,
        context: mkQuote(turns, near),
        ideal: `Building on ${labelOf(near.speaker)}'s point, I'd like to add a structure: first the benefit, then the risk, then a practical way forward on ${topic}. Here is my view on the first part.`,
      });
    });
  events
    .filter((e) => e.type === "ai_interrupts_student" && e.outcome === "yielded")
    .forEach((e) => {
      const t = turns.find((x) => x.speaker === e.persona && x.tStart >= e.at - 0.5);
      if (!t) return;
      openings.push({
        id: `yield-${t.id}`,
        t: t.tStart,
        kind: "yielded",
        title: `You gave up the floor to ${labelOf(e.persona)}`,
        context: mkQuote(turns, t),
        ideal: "If I may finish my point: one more sentence and then I'll happily take your question. As I was saying, the key thing is the trade-off.",
      });
    });
  openings.sort((a, b) => a.t - b.t);

  const overall = Math.round((feedback.reduce((a, f) => a + f.score, 0) / feedback.length) * 10);
  const sorted = [...feedback].sort((a, b) => b.score - a.score);
  return {
    airtime,
    delivery,
    feedback,
    openings: openings.slice(0, 5),
    overall,
    strengths: sorted.filter((f) => f.score >= 6).slice(0, 3).map((f) => f.title),
    fixes: [...sorted].reverse().filter((f) => f.score < 6.5).slice(0, 3).map((f) => f.title),
    source: "heuristic",
    body: s.body ? buildBodyReport(s.body) : undefined,
  };
}

// ───────────────────────────── body language ─────────────────────────────

const pct = (n: number) => `${Math.round(n)}%`;
const bverdict = (n: number): BodyCard["verdict"] => (n >= 7 ? "strong" : n >= 4.5 ? "okay" : "weak");

export function buildBodyReport(b: BodyLanguage): BodyReport {
  const cards: BodyCard[] = [];
  const faceOk = b.facePct >= 40;

  // Eye contact: in a real GD you glance at people, so ~65-75% facing the panel is the sweet spot.
  if (faceOk) {
    const score = clamp(b.eyeContactPct / 7 - Math.max(0, b.lookingDownPct - 15) / 10);
    const main =
      b.lookingDownPct > 20
        ? `You looked down for ${pct(b.lookingDownPct)} of the time, which reads as reading notes or low confidence.`
        : b.lookingAwayPct > 25
          ? `Your eyes drifted off to the side ${pct(b.lookingAwayPct)} of the time.`
          : `You faced the panel ${pct(b.eyeContactPct)} of the time.`;
    cards.push({
      id: "eye",
      title: "Eye contact",
      score,
      verdict: bverdict(score),
      summary: `${main} Roughly 60 to 75% is the sweet spot: steady, with natural glances at whoever you are addressing.`,
      tryThis: "Land each key sentence on one person's face for a full beat, then move on. Keep notes face-up at eye level, not in your lap.",
      stats: [
        { label: "Facing panel", value: pct(b.eyeContactPct) },
        { label: "Looking down", value: pct(b.lookingDownPct) },
        { label: "Looking away", value: pct(b.lookingAwayPct) },
      ],
    });

    const eScore = clamp(4 + b.expressiveness * 4 + (Math.min(b.smilePct, 35) / 35) * 2 - b.tensePct / 15);
    cards.push({
      id: "expression",
      title: "Expression & presence",
      score: eScore,
      verdict: bverdict(eScore),
      summary:
        b.tensePct > 25
          ? `You looked tense or frowning ${pct(b.tensePct)} of the time; it can read as defensive even when your words are calm.`
          : b.expressiveness < 0.25
            ? `Your face stayed quite flat (${pct(b.neutralPct)} neutral). Flat delivery makes strong points land softer.`
            : `Good facial range: ${pct(b.smilePct)} warm, ${pct(b.tensePct)} tense, with natural variation.`,
      tryThis: "Smile briefly when you agree or open a point, and relax your brow when you disagree: it keeps challenges polite and credible.",
      stats: [
        { label: "Warm / smiling", value: pct(b.smilePct) },
        { label: "Tense", value: pct(b.tensePct) },
        { label: "Expressiveness", value: `${Math.round(b.expressiveness * 100)}/100` },
      ],
    });
  } else {
    for (const [id, title] of [
      ["eye", "Eye contact"],
      ["expression", "Expression & presence"],
    ] as const) {
      cards.push({
        id,
        title,
        score: null,
        verdict: "unknown",
        summary: `Your face was visible only ${pct(b.facePct)} of the time, so this cannot be judged fairly.`,
        tryThis: "Sit so your face is centred and well lit, about an arm's length from the camera.",
        stats: [{ label: "Face visible", value: pct(b.facePct) }],
      });
    }
  }

  if (b.bodyVisiblePct >= 25) {
    const pScore = b.postureScore;
    cards.push({
      id: "posture",
      title: "Posture",
      score: pScore,
      verdict: bverdict(pScore),
      summary:
        b.slouchPct > 25
          ? `You slouched for ${pct(b.slouchPct)} of the time. Slumping shrinks your presence on camera and in a real room.`
          : b.shoulderTiltDeg > 8
            ? `Your shoulders were tilted about ${b.shoulderTiltDeg.toFixed(0)}°. Level shoulders look more composed.`
            : `Upright and composed: slouching only ${pct(b.slouchPct)} of the time.`,
      tryThis: "Sit tall with both feet down and shoulders level. Lean in slightly (not back) when making your main point.",
      stats: [
        { label: "Slouching", value: pct(b.slouchPct) },
        { label: "Leaning in", value: pct(b.leanInPct) },
        { label: "Shoulder tilt", value: `${b.shoulderTiltDeg.toFixed(1)}°` },
      ],
    });
    const cScore = clamp(10 - b.fidget * 7 + (b.gesturePct >= 5 && b.gesturePct <= 45 ? 1 : 0));
    cards.push({
      id: "composure",
      title: "Composure & gestures",
      score: cScore,
      verdict: bverdict(cScore),
      summary:
        b.fidget > 0.55
          ? `Your upper body was restless (${Math.round(b.fidget * 100)}/100). Fidgeting leaks nervousness.`
          : b.gesturePct < 5
            ? "You were calm, but your hands stayed out of play. Purposeful gestures add emphasis and energy."
            : `Calm and expressive: gesturing ${pct(b.gesturePct)} of the time with little restlessness.`,
      tryThis: "Keep hands visible and use one clear gesture per key point (counting a list, showing contrast). Park them still between points.",
      stats: [
        { label: "Restlessness", value: `${Math.round(b.fidget * 100)}/100` },
        { label: "Gesturing", value: pct(b.gesturePct) },
      ],
    });
  } else {
    for (const [id, title] of [
      ["posture", "Posture"],
      ["composure", "Composure & gestures"],
    ] as const) {
      cards.push({
        id,
        title,
        score: null,
        verdict: "unknown",
        summary: `Your shoulders were in frame only ${pct(b.bodyVisiblePct)} of the time. Step back so your head, shoulders and hands are visible.`,
        tryThis: "Position the camera so it frames you from the chest up, with room for your hands.",
        stats: [{ label: "Upper body in frame", value: pct(b.bodyVisiblePct) }],
      });
    }
  }

  const scored = cards.filter((c): c is BodyCard & { score: number } => c.score !== null);
  return {
    overall: scored.length ? Math.round((scored.reduce((a, c) => a + c.score, 0) / scored.length) * 10) : null,
    cards,
    moments: b.moments,
    seconds: b.seconds,
  };
}

// ───────────────────────────── Gemini analyst merge ─────────────────────────────

interface AiFeedback {
  id?: string;
  title?: string;
  score?: number;
  summary?: string;
  tryThis?: string;
  evidence?: { turnId?: number; text?: string }[];
}
interface AiOpening {
  id?: string;
  title?: string;
  contextTurnId?: number;
  ideal?: string;
}
export interface AiReport {
  strengths?: string[];
  fixes?: string[];
  bodyLanguageCoaching?: string;
  feedback?: AiFeedback[];
  openings?: AiOpening[];
}

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => str(x, 140)).filter(Boolean).slice(0, n) : []);

/**
 * Overlays the Gemini analyst onto the deterministic report. The evidence guarantee still holds: every quote
 * must be a verbatim substring of the student's own turn, or it is discarded and the heuristic evidence for
 * that criterion is kept. Airtime/delivery numbers always stay measured, never model-written.
 */
export function mergeAiReport(base: Report, ai: AiReport, s: SessionRecord): Report {
  const turns = s.turns;
  const feedback: Feedback[] = base.feedback.map((bf) => {
    const af = (ai.feedback ?? []).find((x) => x.id === bf.id);
    if (!af) return bf;

    const evidence: Quote[] = [];
    for (const ev of (af.evidence ?? []).slice(0, 2)) {
      const text = str(ev.text, 400);
      const turn = turns.find((t) => t.id === ev.turnId);
      if (!text || !turn || turn.speaker !== "student" || !verifyQuote(turns, turn.id, text)) continue;
      evidence.push({ turnId: turn.id, speaker: turn.speaker, t: turn.tStart, text, verified: true });
    }

    const score = typeof af.score === "number" && Number.isFinite(af.score) ? clamp(af.score) : bf.score;
    return {
      id: bf.id,
      title: bf.title,
      score,
      verdict: verdict10(score),
      summary: str(af.summary) || bf.summary,
      tryThis: str(af.tryThis) || bf.tryThis,
      evidence: evidence.length ? evidence : bf.evidence,
    };
  });

  const openings: Opening[] = [];
  for (const ao of (ai.openings ?? []).slice(0, 5)) {
    const turn = turns.find((t) => t.id === ao.contextTurnId);
    const ideal = str(ao.ideal, 600);
    if (!turn || !ideal) continue;
    openings.push({
      id: `ai-${turn.id}-${openings.length}`,
      t: turn.tStart,
      kind: "unchallenged_claim",
      title: str(ao.title, 140) || "A moment you could have jumped in",
      context: mkQuote(turns, turn),
      ideal,
    });
  }
  openings.sort((a, b) => a.t - b.t);

  const overall = Math.round((feedback.reduce((a, f) => a + f.score, 0) / feedback.length) * 10);
  const strengths = strs(ai.strengths, 4);
  const fixes = strs(ai.fixes, 4);
  const coaching = str(ai.bodyLanguageCoaching, 700);

  return {
    ...base,
    feedback,
    overall,
    openings: openings.length ? openings : base.openings,
    strengths: strengths.length ? strengths : base.strengths,
    fixes: fixes.length ? fixes : base.fixes,
    source: "gemini",
    body: base.body ? { ...base.body, coaching: coaching || undefined } : base.body,
  };
}

const verdict10 = (n: number): Feedback["verdict"] => (n >= 7 ? "strong" : n >= 4.5 ? "okay" : "weak");
