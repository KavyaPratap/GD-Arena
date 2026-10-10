export type PersonaId = "vikram" | "ananya" | "meera" | "rohan" | "kabir" | "sana";
export type SpeakerId = PersonaId | "moderator" | "student";
export type Lang = "en" | "hinglish";
export type LangSetting = "auto" | Lang;
export type GDFormat = "abstract" | "controversial" | "current" | "case";
export type Interruption = "calm" | "real" | "brutal";
export type NudgeLevel = "off" | "light" | "full";

export interface RoomConfig {
  id: string;
  topic: string;
  topicId?: string;
  format: GDFormat;
  caseBrief?: string;
  fishbowl: boolean;
  panel: PersonaId[];
  durationSec: number;
  language: LangSetting;
  /** How long the AI waits after a pause before speaking. */
  patienceMs: number;
  interruption: Interruption;
  nudges: NudgeLevel;
  captions: boolean;
  goal: string;
  createdAt: number;
}

export type TurnKind = "opening" | "floor_open" | "normal" | "closing" | "redirect" | "invite" | "warn" | "outro" | "watch";

export interface Turn {
  id: number;
  speaker: SpeakerId;
  text: string;
  /** seconds since session start */
  tStart: number;
  tEnd: number;
  lang: Lang;
  kind: TurnKind;
  claim?: boolean;
  /** AI turn that was cut off: the part the student actually heard. */
  spokenText?: string;
  interruptedAt?: number;
  /** Fishbowl coach whisper. */
  whisper?: string;
  typed?: boolean;
}

export interface InterruptionEvent {
  at: number;
  type: "ai_interrupts_student" | "student_barge_in";
  persona: PersonaId | "moderator";
  turnId: number;
  outcome?: "yielded" | "held";
}

export interface SessionRecord {
  config: RoomConfig;
  turns: Turn[];
  events: InterruptionEvent[];
  discStart: number;
  discEnd: number;
  endedAt: number;
  detectedLang: Lang;
  sample?: boolean;
}
