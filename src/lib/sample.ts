import type { SessionRecord, Turn } from "./types";

/**
 * A fixed, clearly-labelled sample session so the report and Ghost Replay can be explored without
 * running a discussion first (`/report/demo`). Never mixed with real sessions.
 */
const T = (id: number, speaker: Turn["speaker"], tStart: number, tEnd: number, text: string, extra: Partial<Turn> = {}): Turn => ({
  id,
  speaker,
  text,
  tStart,
  tEnd,
  lang: "en",
  kind: "normal",
  ...extra,
});

export const SAMPLE_SESSION: SessionRecord = {
  sample: true,
  detectedLang: "en",
  endedAt: 0,
  discStart: 42,
  discEnd: 462,
  config: {
    id: "demo",
    topic: "Gig economy: freedom or exploitation?",
    topicId: "gig",
    format: "current",
    fishbowl: false,
    panel: ["vikram", "ananya", "meera", "kabir"],
    durationSec: 420,
    language: "auto",
    patienceMs: 900,
    interruption: "real",
    nudges: "full",
    captions: true,
    goal: "Listen and build on others",
    createdAt: 0,
  },
  events: [
    { at: 188, type: "ai_interrupts_student", persona: "vikram", turnId: 9, outcome: "yielded" },
    { at: 301, type: "student_barge_in", persona: "kabir", turnId: 13 },
  ],
  turns: [
    T(1, "moderator", 0, 28, "Good morning, everyone. I'm Mr. Iyer, your moderator. Before we begin: every other participant in this room is an AI. You are the only human here, and this is a safe place to practise. Today's topic is: Gig economy: freedom or exploitation?", { kind: "opening" }),
    T(2, "moderator", 40, 44, "Preparation time is over. The floor is open. Please begin.", { kind: "floor_open" }),
    T(3, "vikram", 46, 62, "Let me be direct: on this topic, most people are overcomplicating it. The core issue is incentives, and everything else follows."),
    T(4, "ananya", 64, 82, "Let's ground this in numbers. Around 12 percent of the workforce is already affected by this shift, so this isn't hypothetical."),
    T(5, "kabir", 85, 98, "Everyone seems to agree here, which usually means nobody has tested the opposite. So let me."),
    T(6, "student", 112, 138, "I think gig work gives people flexibility, like a student can earn in the evening. But basically the problem is that there is no safety net, um, no insurance and no sick leave."),
    T(7, "ananya", 141, 158, "You said “I think gig work gives people flexibility, like a student…”. Do you have a figure or a source for that?"),
    T(8, "student", 164, 176, "Not exactly, but I read that most delivery partners work more than ten hours."),
    T(9, "vikram", 188, 201, "Sorry, let me jump in. “Not exactly” is not good enough. Where is the hard evidence?", { spokenText: "Sorry, let me jump in. “Not exactly” is not good enough." , interruptedAt: 196 }),
    T(10, "meera", 232, 247, "I liked what you said: “most delivery partners work more than ten hours”. I'd add that we shouldn't ignore the quieter side effects."),
    T(11, "kabir", 262, 277, "Let me play devil's advocate on that. What if the opposite is true and flexibility is the whole point?"),
    T(12, "ananya", 281, 298, "Building on the numbers, if we look at the 20 percent variance in earnings, the effect is smaller than claimed."),
    T(13, "kabir", 301, 308, "Ananya, that sounds nice, but who loses under your proposal?", { spokenText: "Ananya, that sounds nice, but who", interruptedAt: 305 }),
    T(14, "student", 306, 331, "Ananya's point about earnings variance is important, because a fixed minimum per delivery would reduce that variance. For example, Karnataka's gig worker law already pushes platforms to contribute to a welfare fund."),
    T(15, "sana", 340, 356, "That's a good point: “a fixed minimum per delivery”. It connects with what others said earlier."),
    T(16, "moderator", 402, 408, "One minute remaining. Start moving towards your conclusions.", { kind: "warn" }),
    T(17, "moderator", 462, 470, "Time. Let's move to the closing round. Each participant gets about twenty seconds for a final statement.", { kind: "closing" }),
    T(18, "student", 489, 512, "To conclude, gig work is freedom with no floor. Ananya showed the earnings are volatile, Kabir asked who loses, so I think the balanced answer is flexibility plus a minimum safety net.", { kind: "closing" }),
    T(19, "moderator", 540, 548, "Thank you, everyone. That concludes the discussion. Your report is being prepared.", { kind: "outro" }),
  ],
};
