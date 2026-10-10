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
  /** Opt-in on-device camera analysis (eye contact, expression, posture). Video never leaves the browser. */
  camera?: boolean;
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

export type BodyMomentKind = "away" | "down" | "slouch" | "tense" | "smile" | "fidget";

export interface BodyMoment {
  /** seconds since session start */
  t: number;
  kind: BodyMomentKind;
  label: string;
}

/**
 * Aggregated, on-device body-language measurements. Only these numbers are stored; no frames or video.
 * All percentages are of the analysed time (seconds).
 */
export interface BodyLanguage {
  seconds: number;
  /** % of analysed time a face was visible */
  facePct: number;
  /** % of time the head/eyes were pointed at the camera (proxy for eye contact with the panel) */
  eyeContactPct: number;
  lookingDownPct: number;
  lookingAwayPct: number;
  smilePct: number;
  tensePct: number;
  neutralPct: number;
  /** 0..1, how much facial expression varied (flat delivery scores low) */
  expressiveness: number;
  /** % of time shoulders/upper body were visible */
  bodyVisiblePct: number;
  /** 0..10 */
  postureScore: number;
  slouchPct: number;
  leanInPct: number;
  shoulderTiltDeg: number;
  /** 0..1 restless upper-body movement */
  fidget: number;
  /** % of time hands were visibly moving (gesturing) */
  gesturePct: number;
  moments: BodyMoment[];
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
  body?: BodyLanguage;
}
