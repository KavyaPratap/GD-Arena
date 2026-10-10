/**
 * RoomEngine: the Stage 1 floor-control simulation.
 *
 * It runs entirely in the browser so the UI can be built and judged without a backend.
 * The public surface (Snapshot, events, submitText, begin, ...) is intentionally the same shape the
 * realtime gateway will emit in Stage 2, so the UI will not change when the engine is swapped for a
 * WebSocket client.
 *
 * What is real here:   mic permission handling, level-based voice detection, live captions
 *                      (Web Speech API), barge-in, patience, nudges, timer, closing round.
 * What is simulated:   the AI participants' words (scripted per persona) and their voices
 *                      (browser speechSynthesis). Gemini models replace both in Stage 2.
 */
import { MODERATOR, MOD_LINES, PERSONA_BY_ID, WHISPERS, fillTemplate } from "./personas";
import { detectLang, wordCount, countFillers } from "./lang";
import { saveSession } from "./storage";
import type { BodyLanguage, InterruptionEvent, Lang, PersonaId, RoomConfig, SpeakerId, Turn, TurnKind } from "./types";

export type Phase = "lobby" | "opening" | "prep" | "watch" | "discussion" | "closing" | "ended";
export type FloorKind = "none" | "student" | "ai" | "moderator";

export interface Health {
  mic: "idle" | "ok" | "denied" | "unavailable";
  stt: "idle" | "ok" | "unsupported";
  tts: "ok" | "unsupported";
  net: "online" | "offline";
}

export interface Nudge {
  id: number;
  kind: string;
  text: string;
  until: number;
}

export interface Snapshot {
  phase: Phase;
  elapsed: number;
  prepLeft: number;
  discussionLeft: number;
  closingLeft: number;
  studentClosing: boolean;
  floor: { kind: FloorKind; id?: SpeakerId };
  bids: Partial<Record<PersonaId, number>>;
  turns: Turn[];
  liveCaption: string;
  studentSpeaking: boolean;
  micLevel: number;
  threshold: number;
  detectedLang: Lang;
  nudge: Nudge | null;
  airtime: Partial<Record<SpeakerId, number>>;
  health: Health;
  watchDone: boolean;
  paused: boolean;
}

interface Current {
  speaker: PersonaId | "moderator";
  turn: Turn;
  chars: number;
  startedAt: number;
  done: boolean;
  abort?: () => void;
  finish: (cancelled: boolean) => void;
}

type SRResult = { isFinal: boolean; 0: { transcript: string } };
interface SREvent {
  resultIndex: number;
  results: ArrayLike<SRResult>;
}
interface SR {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

const PREP_SECONDS = 30;
const WATCH_TURNS = 6;
const CLOSING_SECONDS = 25;
const TICK_MS = 100;
const CLAIM_RE = /\d+(\.\d+)?\s?(%|percent|crore|lakh|million|billion|years?)/i;

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export class RoomEngine {
  readonly cfg: RoomConfig;
  turns: Turn[] = [];
  events: InterruptionEvent[] = [];

  private listeners = new Set<(s: Snapshot) => void>();
  private phase: Phase = "lobby";
  private lang: Lang;
  private started = false;
  private destroyed = false;
  private t0 = 0;
  private paused = false;
  private pausedAt = 0;
  private pausedTotal = 0;
  private interval?: ReturnType<typeof setInterval>;
  private turnSeq = 0;
  private health: Health = { mic: "idle", stt: "idle", tts: "ok", net: "online" };

  // microphone
  private stream?: MediaStream;
  private audioCtx?: AudioContext;
  private analyser?: AnalyserNode;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private rms = 0;
  private level = 0;
  private threshold = 0.035;
  private calib: number[] = [];
  private loudMs = 0;
  private voiceActive = false;
  private lastVoiceAt = 0;

  // recognition
  private recog?: SR;
  private recogWanted = false;
  private lastRecogAt = 0;

  // student utterance
  private utterOpen = false;
  private utterText = "";
  private interim = "";
  private utterStartSec = 0;
  private interruptedThisUtter = false;

  // floor
  private current: Current | null = null;
  private lastAnyEnd = 0;
  private chain = 0;
  private suppressBargeUntil = 0;
  private lastSpokeAt: Partial<Record<SpeakerId, number>> = {};
  private bids: Partial<Record<PersonaId, number>> = {};
  private used = new Set<string>();
  private gapJitter = 0;
  private pendingRedirect = false;

  // phase bookkeeping
  private busy = false;
  private prepLeft = PREP_SECONDS;
  private discStart = 0;
  private discEnd = 0;
  private warned = false;
  private watchCount = 0;
  private watchDone = false;
  private closingLeft = CLOSING_SECONDS;
  private studentClosingActive = false;
  private resolveStudentClosing?: () => void;
  private lastStudentEnd = 0;
  private lastInvite = -1e9;

  // nudges
  private nudge: Nudge | null = null;
  private nudgeSeq = 0;
  private nudgeCool: Record<string, number> = {};

  // tts
  private voices: SpeechSynthesisVoice[] = [];
  private onVoices = () => {
    this.voices = window.speechSynthesis.getVoices();
  };
  private onOffline = () => this.setPaused(true);
  private onOnline = () => this.setPaused(false);

  constructor(cfg: RoomConfig) {
    this.cfg = cfg;
    this.lang = cfg.language === "hinglish" ? "hinglish" : "en";
    if (typeof window !== "undefined") {
      if ("speechSynthesis" in window) {
        this.voices = window.speechSynthesis.getVoices();
        window.speechSynthesis.addEventListener("voiceschanged", this.onVoices);
      } else {
        this.health.tts = "unsupported";
      }
      window.addEventListener("offline", this.onOffline);
      window.addEventListener("online", this.onOnline);
      if (!navigator.onLine) this.health.net = "offline";
    }
  }

  // ───────────────────────────── public api ─────────────────────────────

  subscribe(fn: (s: Snapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  /** Ask for the microphone and start metering. Safe to call in the lobby. */
  async initMic(): Promise<void> {
    // Warm the moderator's voice while the student is still on the lobby screen, so the opening is
    // human-sounding from the first word instead of waiting on a cold server round-trip.
    this.prefetchModerator("start");
    if (!navigator.mediaDevices?.getUserMedia) {
      this.health.mic = "unavailable";
      this.startTick();
      this.emit();
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (this.destroyed) {
        this.stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx();
      const src = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      src.connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize) as Float32Array<ArrayBuffer>;
      this.health.mic = "ok";
    } catch (e) {
      const name = (e as DOMException)?.name;
      this.health.mic = name === "NotFoundError" || name === "OverconstrainedError" ? "unavailable" : "denied";
    }
    this.startTick();
    this.emit();
  }

  /** Must be called from a user gesture (unlocks audio + speech). */
  async begin(): Promise<void> {
    if (this.started || this.destroyed) return;
    this.started = true;
    this.t0 = performance.now();
    this.lastAnyEnd = performance.now();
    if (this.audioCtx?.state === "suspended") void this.audioCtx.resume();
    this.unlockTTS();
    this.startRecognition();
    this.startTick();

    const mins = Math.round(this.cfg.durationSec / 60);
    this.busy = true;
    this.phase = "opening";
    await this.say("moderator", MOD_LINES[this.modLang()].opening(this.cfg.topic, mins, this.cfg.fishbowl), { kind: "opening" });
    if (this.destroyed) return;
    this.busy = false;
    this.lastAnyEnd = performance.now();
    if (this.cfg.fishbowl) {
      this.phase = "watch";
    } else {
      this.phase = "prep";
      this.prepLeft = PREP_SECONDS;
    }
    this.emit();
  }

  skipPrep() {
    if (this.phase === "prep") this.prepLeft = 0;
  }

  /** Fishbowl: the student walks into the circle. */
  async joinCircle() {
    if (this.phase !== "watch" || !this.watchDone) return;
    this.cancelCurrent();
    this.busy = true;
    await this.say("moderator", MOD_LINES[this.modLang()].fishbowlJoin, { kind: "floor_open" });
    this.beginDiscussion();
  }

  /** Student typed instead of spoke (mic denied, noisy room, accessibility). */
  submitText(text: string) {
    const clean = text.trim();
    if (!clean) return;
    const inDiscussion = this.phase === "discussion";
    const inClosing = this.phase === "closing" && this.studentClosingActive;
    if (!inDiscussion && !inClosing) return;
    if (this.current) this.bargeIn();
    const now = this.nowSec();
    const dur = Math.max(2, wordCount(clean) * 0.4);
    this.commitStudent(clean, now - dur, now, true);
  }

  skipToClosing() {
    if (this.phase === "discussion" && !this.busy) void this.runClosing();
  }

  endNow() {
    this.cancelCurrent();
    this.busy = false;
    this.studentClosingActive = false;
    this.resolveStudentClosing?.();
    this.finish();
  }

  setPatience(ms: number) {
    (this.cfg as { patienceMs: number }).patienceMs = ms;
  }

  /** Supplies the on-device body-language summary that is saved with the session when it ends. */
  setBodyProvider(fn: () => BodyLanguage | undefined) {
    this.bodyProvider = fn;
  }

  destroy() {
    this.destroyed = true;
    if (this.interval) clearInterval(this.interval);
    this.recogWanted = false;
    try {
      this.recog?.stop();
    } catch {
      /* already stopped */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.audioCtx?.close().catch(() => undefined);
    if (typeof window !== "undefined") {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.removeEventListener("voiceschanged", this.onVoices);
      }
      window.removeEventListener("offline", this.onOffline);
      window.removeEventListener("online", this.onOnline);
    }
    this.listeners.clear();
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private nowSec(): number {
    if (!this.started) return 0;
    const base = this.paused ? this.pausedAt : performance.now();
    return (base - this.t0 - this.pausedTotal) / 1000;
  }

  private modLang(): Lang {
    return this.lang;
  }

  private topicShort(): string {
    const t = this.cfg.topic.replace(/[?.]+$/, "");
    return t.length > 80 ? t.slice(0, 77) + "…" : t;
  }

  private startTick() {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), TICK_MS);
  }

  private emit() {
    if (this.destroyed) return;
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }

  private airtime(): Partial<Record<SpeakerId, number>> {
    const out: Partial<Record<SpeakerId, number>> = {};
    for (const t of this.turns) {
      if (t.speaker === "moderator") continue;
      out[t.speaker] = (out[t.speaker] ?? 0) + Math.max(0, t.tEnd - t.tStart);
    }
    return out;
  }

  private snapshot(): Snapshot {
    const now = this.nowSec();
    let floor: Snapshot["floor"] = { kind: "none" };
    if (this.current) floor = { kind: this.current.speaker === "moderator" ? "moderator" : "ai", id: this.current.speaker };
    else if (this.utterOpen) floor = { kind: "student", id: "student" };
    const discussionLeft =
      this.phase === "discussion"
        ? Math.max(0, this.cfg.durationSec - (now - this.discStart))
        : this.phase === "closing" || this.phase === "ended"
          ? 0
          : this.cfg.durationSec;
    return {
      phase: this.phase,
      elapsed: now,
      prepLeft: Math.max(0, this.prepLeft),
      discussionLeft,
      closingLeft: Math.max(0, this.closingLeft),
      studentClosing: this.studentClosingActive,
      floor,
      bids: { ...this.bids },
      turns: [...this.turns],
      liveCaption: (this.utterText + " " + this.interim).trim(),
      studentSpeaking: this.voiceActive,
      micLevel: this.level,
      threshold: this.threshold,
      detectedLang: this.lang,
      nudge: this.nudge && now < this.nudge.until ? this.nudge : null,
      airtime: this.airtime(),
      health: { ...this.health },
      watchDone: this.watchDone,
      paused: this.paused,
    };
  }

  private setPaused(p: boolean) {
    this.health.net = p ? "offline" : "online";
    if (!this.started || this.phase === "ended") {
      this.emit();
      return;
    }
    if (p === this.paused) return;
    this.paused = p;
    if (p) {
      this.pausedAt = performance.now();
      if ("speechSynthesis" in window) window.speechSynthesis.pause();
    } else {
      this.pausedTotal += performance.now() - this.pausedAt;
      this.lastAnyEnd = performance.now();
      if ("speechSynthesis" in window) window.speechSynthesis.resume();
    }
    this.emit();
  }

  // ───────────────────────────── recognition ─────────────────────────────

  private startRecognition() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SR;
      webkitSpeechRecognition?: new () => SR;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (this.health.mic !== "ok") return;
    if (!Ctor) {
      this.health.stt = "unsupported";
      return;
    }
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = this.cfg.language === "hinglish" ? "hi-IN" : "en-IN";
    r.onresult = (e) => this.onRecog(e);
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.health.stt = "unsupported";
        this.recogWanted = false;
      }
    };
    r.onend = () => {
      if (this.recogWanted && !this.destroyed) {
        try {
          r.start();
        } catch {
          /* restart race */
        }
      }
    };
    this.recog = r;
    this.recogWanted = true;
    try {
      r.start();
      this.health.stt = "ok";
    } catch {
      this.health.stt = "unsupported";
    }
  }

  private onRecog(e: SREvent) {
    if (this.paused) return;
    if (!(this.phase === "discussion" || (this.phase === "closing" && this.studentClosingActive))) return;
    // If an AI is currently speaking, user voice triggers immediate barge-in so their opening words aren't lost
    if (this.current) {
      if (performance.now() > this.suppressBargeUntil) {
        this.bargeIn();
      } else {
        return;
      }
    }
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const text = res[0].transcript;
      if (res.isFinal) {
        this.utterText = (this.utterText + " " + text).trim();
      } else {
        interim += text;
      }
    }
    this.interim = interim;
    this.lastRecogAt = performance.now();
    if (!this.utterOpen) this.openUtterance();
  }

  // ───────────────────────────── voice activity ─────────────────────────────

  private sampleMic(dt: number) {
    if (!this.analyser || !this.buf) {
      this.rms = 0;
      this.level = this.level * 0.8;
      return;
    }
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    this.rms = Math.sqrt(sum / this.buf.length);
    this.level = this.level * 0.6 + clamp(this.rms * 9, 0, 1) * 0.4;

    if (!this.started) {
      // Calibrate against the room's noise floor while the student is on the lobby screen.
      this.calib.push(this.rms);
      if (this.calib.length > 40) this.calib.shift();
      const sorted = [...this.calib].sort((a, b) => a - b);
      const noise = sorted[Math.floor(sorted.length * 0.5)] ?? 0.01;
      this.threshold = clamp(noise * 3.2, 0.02, 0.12);
    }
    void dt;
  }

  private updateVoice(dt: number) {
    const aiAudible = !!this.current;
    // Without headphones the AI's own voice leaks into the mic. Stricter threshold + longer hold while an
    // AI is audible so it does not mistake itself for the student and cut itself off.
    const thr = this.threshold * (aiAudible ? 2.6 : 1);
    const loud = this.rms > thr;
    this.loudMs = loud ? Math.min(1000, this.loudMs + dt) : Math.max(0, this.loudMs - dt * 2);
    const need = aiAudible ? 420 : 180;
    const recogFresh = !aiAudible && performance.now() - this.lastRecogAt < 900;
    this.voiceActive = this.loudMs >= need || recogFresh;
    if (this.voiceActive) this.lastVoiceAt = performance.now();
  }

  private openUtterance() {
    this.utterOpen = true;
    this.utterStartSec = this.nowSec();
    this.interruptedThisUtter = false;
  }

  private looksIncomplete(text: string): boolean {
    return /(\b(and|but|so|because|or|also|toh|aur|lekin|kyunki|that|which|like|the|a|to|of|in|if)\s*|[,…-])$/i.test(text.trim());
  }

  private maybeCommitUtterance() {
    if (!this.utterOpen) return;
    const now = performance.now();
    const silent = now - this.lastVoiceAt;
    const text = (this.utterText + " " + this.interim).trim();
    const endpoint = this.cfg.patienceMs + (text && this.looksIncomplete(text) ? 900 : 0);
    if (silent < endpoint) return;
    if (text) {
      const tEnd = this.nowSec() - silent / 1000;
      this.commitStudent(text, this.utterStartSec, Math.max(this.utterStartSec + 0.5, tEnd), false);
    } else if (silent > this.cfg.patienceMs + 1500) {
      // Noise with no words: discard so it never reaches the transcript.
      this.resetUtterance();
    }
  }

  private resetUtterance() {
    this.utterOpen = false;
    this.utterText = "";
    this.interim = "";
  }

  private commitStudent(text: string, tStart: number, tEnd: number, typed: boolean) {
    const lang = detectLang(text);
    const turn: Turn = {
      id: ++this.turnSeq,
      speaker: "student",
      text,
      tStart,
      tEnd,
      lang,
      kind: this.phase === "closing" ? "closing" : "normal",
      typed: typed || undefined,
    };
    this.turns.push(turn);
    this.resetUtterance();
    this.chain = 0;
    this.lastAnyEnd = performance.now();
    this.lastStudentEnd = tEnd;
    this.lastSpokeAt.student = tEnd;
    this.gapJitter = 80 + Math.random() * 150;
    if (this.cfg.language === "auto") {
      const recent = this.turns.filter((t) => t.speaker === "student").slice(-2);
      const hits = recent.filter((t) => t.lang === "hinglish").length;
      this.lang = hits >= 1 && (recent.length === 1 || hits === recent.length || lang === "hinglish") ? "hinglish" : "en";
    }
    if (this.phase === "closing" && this.studentClosingActive) {
      this.studentClosingActive = false;
      this.resolveStudentClosing?.();
    }
    this.emit();
  }

  // ───────────────────────────── speech output ─────────────────────────────

  private unlockTTS() {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      this.health.tts = "unsupported";
    }
  }

  private voiceFor(speaker: PersonaId | "moderator"): SpeechSynthesisVoice | undefined {
    const wantHi = this.lang === "hinglish";
    const prefix = wantHi ? ["hi", "en-in"] : ["en-in", "en-gb", "en-us", "en"];
    let pool: SpeechSynthesisVoice[] = [];
    for (const p of prefix) {
      pool = this.voices.filter((v) => v.lang.toLowerCase().startsWith(p));
      if (pool.length) break;
    }
    if (!pool.length) pool = this.voices;
    const gender = speaker === "moderator" ? MODERATOR.gender : PERSONA_BY_ID[speaker].gender;
    const female = /female|woman|zira|heera|neerja|samantha|aria|jenny|susan|hazel|libby|sonia|veena|kalpana|swara|hindi/i;
    const male = /\bmale\b|david|mark|ravi|hemant|george|guy|ryan|daniel|brian|prabhat|madhur/i;
    const gendered = pool.filter((v) => (gender === "f" ? female.test(v.name) && !/\bmale\b/i.test(v.name) : male.test(v.name)));
    const use = gendered.length ? gendered : pool;
    if (!use.length) return undefined;
    const seats = ["moderator", ...this.cfg.panel] as string[];
    return use[Math.max(0, seats.indexOf(speaker)) % use.length];
  }

  private currentAudio: HTMLAudioElement | null = null;
  private audioCache = new Map<string, string>();
  private ttsInflight = new Map<string, Promise<string | null>>();
  private bodyProvider?: () => BodyLanguage | undefined;

  private ttsKey(speaker: PersonaId | "moderator", text: string): string {
    return `${speaker}:${this.lang}:${text.trim()}`;
  }

  /**
   * Cloud TTS with a shared cache, request de-duplication and one retry. Resolves null only when speech
   * genuinely could not be produced, which is the only case that falls back to the robotic browser voice.
   */
  private fetchTTS(speaker: PersonaId | "moderator", text: string): Promise<string | null> {
    const key = this.ttsKey(speaker, text);
    const hit = this.audioCache.get(key);
    if (hit) return Promise.resolve(hit);
    const running = this.ttsInflight.get(key);
    if (running) return running;
    const lang = this.lang;
    const p = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 12000);
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, speaker, lang }),
            signal: ctl.signal,
          });
          if (res.ok) {
            const d = await res.json();
            if (d?.audioContent) {
              this.audioCache.set(key, d.audioContent);
              return d.audioContent as string;
            }
          }
          if (res.status === 429 || res.status === 403 || res.status === 400) break;
        } catch {
          /* timeout or network: retry once */
        } finally {
          clearTimeout(timer);
        }
      }
      return null;
    })().finally(() => this.ttsInflight.delete(key));
    this.ttsInflight.set(key, p);
    return p;
  }

  private prefetchTTS(speaker: PersonaId | "moderator", text: string) {
    if (typeof window === "undefined" || this.destroyed || this.health.net !== "online") return;
    void this.fetchTTS(speaker, text);
  }

  private prefetchModerator(which: "start" | "discussion") {
    const L = MOD_LINES[this.lang];
    if (which === "start") {
      const mins = Math.round(this.cfg.durationSec / 60);
      this.prefetchTTS("moderator", L.opening(this.cfg.topic, mins, this.cfg.fishbowl));
      this.prefetchTTS("moderator", this.cfg.fishbowl ? L.fishbowlJoin : L.floorOpen);
    } else {
      [L.warn, L.closingCall, L.studentCall, L.outro, L.invite].forEach((l) => this.prefetchTTS("moderator", l));
    }
  }

  /**
   * Ask Gemini for what this persona would really say right now (or their closing statement). Audio is
   * returned in the same round-trip and cached, so playback starts the instant the line is ready.
   * Falls back to the scripted line if the model is slow or unreachable.
   */
  private async llmLine(id: PersonaId, kind: "normal" | "closing", fallback: string): Promise<string> {
    if (this.health.net !== "online" || typeof window === "undefined") return fallback;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3200);
    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: this.cfg.topic,
          caseBrief: this.cfg.caseBrief,
          panel: this.cfg.panel,
          turns: this.turns.slice(-10),
          speaker: id,
          lang: this.lang,
          kind,
          withAudio: true,
        }),
        signal: controller.signal,
      });
      if (!res.ok) return fallback;
      const data = await res.json();
      if (typeof data?.text !== "string" || !data.text.trim()) return fallback;
      if (data.audioContent) this.audioCache.set(this.ttsKey(id, data.text), data.audioContent);
      return data.text;
    } catch {
      return fallback;
    } finally {
      clearTimeout(timeout);
    }
  }

  private playSynth(cur: Current, text: string, speaker: PersonaId | "moderator") {
    const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
    if (!synth || this.health.tts === "unsupported") {
      setTimeout(() => cur.finish(false), Math.max(1500, wordCount(text) * 380));
      return;
    }
    const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
    const persona = speaker === "moderator" ? MODERATOR : PERSONA_BY_ID[speaker];
    const voice = this.voiceFor(speaker);
    let offset = 0;
    sentences.forEach((s, i) => {
      const u = new SpeechSynthesisUtterance(s.trim());
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? (this.lang === "hinglish" ? "hi-IN" : "en-IN");
      u.pitch = persona.voice.pitch;
      u.rate = persona.voice.rate;
      const base = offset;
      u.onboundary = (ev) => {
        cur.chars = base + ev.charIndex;
      };
      u.onend = () => {
        if (i === sentences.length - 1) cur.finish(false);
      };
      u.onerror = (ev) => {
        if (ev.error === "canceled" || ev.error === "interrupted") return;
        this.health.tts = "unsupported";
        cur.finish(false);
      };
      offset += s.length;
      synth.speak(u);
    });
    setTimeout(() => cur.finish(false), Math.max(4000, wordCount(text) * 650) + 4000);
  }

  private say(
    speaker: PersonaId | "moderator",
    text: string,
    opts: { kind?: TurnKind; whisper?: string } = {},
  ): Promise<void> {
    return new Promise((resolve) => {
      this.busy = true;
      const start = this.nowSec();
      const turn: Turn = {
        id: ++this.turnSeq,
        speaker,
        text,
        tStart: start,
        tEnd: start,
        lang: this.lang,
        kind: opts.kind ?? "normal",
        whisper: opts.whisper,
        claim: CLAIM_RE.test(text) || undefined,
      };
      this.turns.push(turn);

      const cur: Current = {
        speaker,
        turn,
        chars: 0,
        startedAt: performance.now(),
        done: false,
        finish: () => undefined,
      };
      let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
      cur.finish = (cancelled: boolean) => {
        if (cur.done) return;
        cur.done = true;
        this.busy = false;
        if (this.currentAudio) {
          try {
            this.currentAudio.pause();
          } catch {
            /* noop */
          }
          this.currentAudio = null;
        }
        if (fallbackTimer) clearTimeout(fallbackTimer);
        turn.tEnd = this.nowSec();
        if (cancelled) {
          const frac = clamp((performance.now() - cur.startedAt) / Math.max(1, wordCount(text) * 380), 0, 0.95);
          const chars = cur.chars > 0 ? cur.chars : Math.floor(text.length * frac);
          const cut = text.slice(0, Math.max(8, chars));
          turn.spokenText = cut.replace(/\s+\S*$/, "").trim() || cut.trim();
          turn.interruptedAt = turn.tEnd;
        }
        if (this.current === cur) this.current = null;
        this.lastSpokeAt[speaker] = turn.tEnd;
        this.lastAnyEnd = performance.now();
        this.gapJitter = Math.random() * 700;
        this.emit();
        resolve();
      };
      this.current = cur;
      this.emit();

      // Cloud TTS (Chirp 3 HD) first for human-realistic speech; browser voice is only the last resort.
      if (typeof window !== "undefined" && this.health.net === "online") {
        const playAudioBase64 = (base64: string) => {
          if (cur.done) return;
          try {
            const audio = new Audio("data:audio/mp3;base64," + base64);
            this.currentAudio = audio;
            audio.ontimeupdate = () => {
              if (audio.duration) {
                cur.chars = Math.floor(text.length * (audio.currentTime / audio.duration));
              }
            };
            audio.onended = () => {
              this.currentAudio = null;
              cur.chars = text.length;
              cur.finish(false);
            };
            audio.onerror = () => {
              this.currentAudio = null;
              this.playSynth(cur, text, speaker);
            };
            audio.play().catch(() => {
              this.currentAudio = null;
              this.playSynth(cur, text, speaker);
            });
          } catch {
            this.playSynth(cur, text, speaker);
          }
        };

        const cachedBase64 = this.audioCache.get(this.ttsKey(speaker, text));
        if (cachedBase64) {
          playAudioBase64(cachedBase64);
        } else {
          void this.fetchTTS(speaker, text).then((b64) => {
            if (cur.done) return;
            if (b64) playAudioBase64(b64);
            else this.playSynth(cur, text, speaker);
          });
        }
      } else {
        this.playSynth(cur, text, speaker);
      }
    });
  }

  private cancelCurrent() {
    if (!this.current) return;
    if (this.current.abort) {
      try {
        this.current.abort();
      } catch {
        /* noop */
      }
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
      } catch {
        /* noop */
      }
      this.currentAudio = null;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    this.current.finish(true);
  }

  private bargeIn() {
    const cur = this.current;
    if (!cur) return;
    this.cancelCurrent();
    this.events.push({
      at: this.nowSec(),
      type: "student_barge_in",
      persona: cur.speaker,
      turnId: cur.turn.id,
    });
    this.chain = 0;
  }

  // ───────────────────────────── discussion logic ─────────────────────────────

  private updateBids() {
    const now = this.nowSec();
    const air = this.airtime();
    const total = Object.values(air).reduce((a, b) => a + (b ?? 0), 0) || 1;
    const last = this.turns[this.turns.length - 1];
    for (const id of this.cfg.panel) {
      const p = PERSONA_BY_ID[id];
      const since = now - (this.lastSpokeAt[id] ?? 0);
      const quietBoost = id === "meera" ? 1.8 : 1;
      let target = p.traits.urgency * 0.55 + clamp(since / 70, 0, 1) * 0.35 * quietBoost - ((air[id] ?? 0) / total) * 0.4;
      if (last && last.speaker !== id && new RegExp(`\\b${p.name}\\b`, "i").test(last.text)) target += 0.4;
      if (id === "kabir" && last && last.speaker !== "kabir") target += 0.12;
      if (this.current?.speaker === id) target = 1;
      target = clamp(target, 0.03, 1);
      const prev = this.bids[id] ?? target;
      this.bids[id] = prev + (target - prev) * 0.12;
    }
  }

  private chooseSpeaker(exclude?: SpeakerId): PersonaId | null {
    const last = this.turns[this.turns.length - 1];
    const prevSpeakers = this.turns.slice(-3).map((t) => t.speaker);
    const cands = this.cfg.panel.filter((id) => id !== exclude && id !== last?.speaker);
    if (!cands.length) return null;
    let best: PersonaId = cands[0];
    let bestScore = -1e9;
    for (const id of cands) {
      let s = (this.bids[id] ?? 0.3) + Math.random() * 0.25;
      // If student just spoke, boost assertive candidates to immediately challenge/build on their point
      if (last?.speaker === "student") {
        const p = PERSONA_BY_ID[id];
        s += (p.traits.urgency * 0.5 + p.traits.interrupts * 0.3);
      }
      // Recency penalty so Vikram or any single persona doesn't dominate every round
      if (prevSpeakers.includes(id)) s -= 0.45;
      if (id === "vikram" && prevSpeakers.filter((sp) => sp === "vikram").length >= 1) s -= 0.6;
      if (s > bestScore) {
        bestScore = s;
        best = id;
      }
    }
    return best;
  }

  private quoteOf(text: string): string {
    const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => wordCount(s) >= 3);
    const s = (sentences[sentences.length - 1] ?? text).replace(/[“”"]/g, "");
    const words = s.trim().split(/\s+/);
    const q = words.slice(0, 9).join(" ").replace(/[.,;:!?]+$/, "");
    return words.length > 9 ? q + "…" : q;
  }

  private buildLine(id: PersonaId, whisperOut: { text?: string; drift?: boolean }): string {
    const p = PERSONA_BY_ID[id];
    const pool = p.lines[this.lang];
    const last = this.turns[this.turns.length - 1];
    const lastStudent = last?.speaker === "student" ? last : undefined;
    const lastAI = last && last.speaker !== "student" && last.speaker !== "moderator" ? PERSONA_BY_ID[last.speaker as PersonaId] : undefined;
    const vars: Record<string, string> = {
      topic: this.topicShort(),
      quote: lastStudent ? this.quoteOf(lastStudent.text) : "",
      name: lastAI?.name ?? "everyone",
    };

    let source: string[];
    if (lastStudent) {
      // Human student just spoke: ALWAYS address their specific quote, NEVER drift
      source = pool.toStudent;
    } else if (pool.drift && Math.random() < p.traits.drift) {
      source = pool.drift;
      whisperOut.text = WHISPERS.drift;
      whisperOut.drift = true;
    } else if (lastAI && Math.random() < 0.65) {
      source = pool.toAI;
      whisperOut.text = WHISPERS.toAI(p.name, lastAI.name);
    } else {
      source = pool.open;
      whisperOut.text = WHISPERS.open;
    }
    const fresh = source.filter((s) => !this.used.has(s));
    const chosen = pick(fresh.length ? fresh : source);
    this.used.add(chosen);
    const line = fillTemplate(chosen, vars);
    if (CLAIM_RE.test(line)) whisperOut.text = WHISPERS.claim;
    return line;
  }

  private async aiTurn(kindOverride?: TurnKind) {
    if (this.busy || this.current || this.utterOpen) return;
    this.busy = true;
    try {
      const last = this.turns[this.turns.length - 1];
      // After a tangent, the moderator steps in 60% of the time.
      if (this.pendingRedirect) {
        this.pendingRedirect = false;
        await this.say("moderator", MOD_LINES[this.lang].redirect(this.topicShort()), { kind: "redirect" });
        this.chain = 0;
        return;
      }
      const id = this.chooseSpeaker(last?.speaker);
      if (!id) return;
      const w: { text?: string; drift?: boolean } = {};
      let line = this.buildLine(id, w);
      line = await this.llmLine(id, "normal", line);

      // The student started talking while the model was thinking: never talk over them.
      if (this.phase === "discussion" && (this.utterOpen || this.voiceActive || this.destroyed)) return;

      this.pendingRedirect = !!w.drift && Math.random() < 0.6;
      this.chain++;
      await this.say(id, line, { kind: kindOverride ?? "normal", whisper: this.phase === "watch" ? w.text : undefined });
    } finally {
      this.busy = false;
      this.lastAnyEnd = performance.now();
    }
  }

  private maybeInterrupt() {
    if (this.cfg.interruption === "calm" || this.current || this.busy || !this.utterOpen || this.interruptedThisUtter) return;
    // Don't interrupt if student is typing or hasn't spoken long enough
    if (!this.voiceActive) return;
    const monologueSeconds = this.nowSec() - this.utterStartSec;
    const threshold = this.cfg.interruption === "brutal" ? 25 : 45;
    if (monologueSeconds < threshold) return;

    // Pick an interrupter fairly, not always Vikram!
    const candidates = this.cfg.panel.filter((id) => PERSONA_BY_ID[id].traits.interrupts >= 0.6);
    if (!candidates.length) return;
    const cand = candidates[Math.floor(Math.random() * candidates.length)];

    this.interruptedThisUtter = true;
    this.suppressBargeUntil = performance.now() + 2800;
    const pool = PERSONA_BY_ID[cand].lines[this.lang];
    const inter = pool.interject ? pick(pool.interject) : "";
    const w: { text?: string } = {};
    const line = `${inter} ${this.buildLine(cand, w)}`.trim();
    const start = this.nowSec();
    const ev: InterruptionEvent = { at: start, type: "ai_interrupts_student", persona: cand, turnId: this.turnSeq + 1 };
    this.events.push(ev);
    this.busy = true;
    void this.say(cand, line, { kind: "normal" }).finally(() => {
      this.busy = false;
    });
    setTimeout(() => {
      ev.outcome = this.voiceActive ? "held" : "yielded";
    }, 3000);
  }

  private freeFloor() {
    if (this.busy || this.current || this.utterOpen) return;
    const last = this.turns[this.turns.length - 1];
    const now = performance.now();
    const gap = now - this.lastAnyEnd;
    const sinceStudent = this.nowSec() - Math.max(this.lastStudentEnd, this.discStart);

    // Draw the human in when they have been silent for too long.
    if (sinceStudent > 80 && this.chain >= 1 && this.nowSec() - this.lastInvite > 90 && last?.speaker !== "moderator" && gap > this.cfg.patienceMs) {
      this.lastInvite = this.nowSec();
      this.busy = true;
      void this.say("moderator", MOD_LINES[this.lang].invite, { kind: "invite" }).then(() => {
        this.busy = false;
        this.chain = 0;
      });
      return;
    }

    const afterStudent = last?.speaker === "student";
    // Real GD floor dynamic: ~1 second decision window (~850ms - 1050ms) after human, ~520ms - 720ms between AI turns
    const scale = clamp(this.cfg.patienceMs / 900, 0.6, 2.0);
    const baseGap = afterStudent ? 920 : 540;
    const needed = baseGap * scale + (this.gapJitter % 180);
    if (gap < needed) return;
    void this.aiTurn();
  }

  private tick() {
    if (this.destroyed) return;
    this.sampleMic(TICK_MS);
    if (!this.started || this.paused || this.phase === "ended") {
      this.emit();
      return;
    }
    this.updateVoice(TICK_MS);
    this.updateBids();
    const now = this.nowSec();
    if (this.current) this.current.turn.tEnd = now;

    switch (this.phase) {
      case "prep": {
        this.prepLeft -= TICK_MS / 1000;
        if (this.prepLeft <= 0 && !this.busy) {
          this.busy = true;
          void this.say("moderator", MOD_LINES[this.lang].floorOpen, { kind: "floor_open" }).then(() => this.beginDiscussion());
        }
        break;
      }
      case "watch": {
        if (!this.busy && !this.current && !this.watchDone) {
          if (this.watchCount >= WATCH_TURNS) {
            this.watchDone = true;
          } else if (performance.now() - this.lastAnyEnd > 1100 + this.gapJitter) {
            this.watchCount++;
            void this.aiTurn("watch");
          }
        }
        break;
      }
      case "discussion": {
        if (this.busy) break;
        // barge-in: sustained student voice while an AI speaks
        if (this.current && this.voiceActive && performance.now() > this.suppressBargeUntil) {
          this.bargeIn();
          this.openUtterance();
        }
        if (this.voiceActive && !this.utterOpen && !this.current) this.openUtterance();
        this.maybeCommitUtterance();
        this.maybeInterrupt();
        this.freeFloor();
        this.evalNudges(now);
        const left = this.cfg.durationSec - (now - this.discStart);
        if (left <= 60 && !this.warned && left > 0) {
          this.warned = true;
          void this.say("moderator", MOD_LINES[this.lang].warn, { kind: "warn" });
        }
        if (left <= 0 && !this.current) void this.runClosing();
        break;
      }
      case "closing": {
        if (this.studentClosingActive) {
          if (this.voiceActive && !this.utterOpen) this.openUtterance();
          this.maybeCommitUtterance();
          if (!this.utterOpen) this.closingLeft -= TICK_MS / 1000;
          if (this.closingLeft <= 0 && !this.utterOpen) {
            this.studentClosingActive = false;
            this.resolveStudentClosing?.();
          }
        }
        break;
      }
      default:
        break;
    }
    this.emit();
  }

  private beginDiscussion() {
    this.busy = false;
    this.prefetchModerator("discussion");
    this.phase = "discussion";
    this.discStart = this.nowSec();
    this.lastStudentEnd = this.discStart;
    this.lastAnyEnd = performance.now();
    this.chain = 0;
    this.gapJitter = 500;
    this.emit();
  }

  private async runClosing() {
    if (this.busy && this.phase !== "discussion") return;
    this.busy = true;
    this.discEnd = this.nowSec();
    this.phase = "closing";
    this.cancelCurrent();
    this.resetUtterance();
    const L = MOD_LINES[this.lang];
    // Every panelist's closing is written by Gemini from what was actually said, generated in parallel
    // while the moderator calls time. The scripted lines remain only as an offline fallback.
    const closings = new Map<PersonaId, Promise<string>>();
    for (const seat of this.cfg.panel) {
      const scripted = fillTemplate(pick(PERSONA_BY_ID[seat].lines[this.lang].closing), { topic: this.topicShort() });
      closings.set(seat, this.llmLine(seat, "closing", scripted));
    }
    await this.say("moderator", L.closingCall, { kind: "closing" });
    const order: (PersonaId | "student")[] = [...this.cfg.panel];
    order.sort(() => Math.random() - 0.5);
    order.splice(Math.floor(Math.random() * (order.length + 1)), 0, "student");
    for (const seat of order) {
      if (this.destroyed || this.isEnded()) return;
      if (seat === "student") {
        await this.say("moderator", L.studentCall, { kind: "closing" });
        this.closingLeft = CLOSING_SECONDS;
        this.studentClosingActive = true;
        this.lastAnyEnd = performance.now();
        this.lastVoiceAt = 0;
        await new Promise<void>((res) => (this.resolveStudentClosing = res));
      } else {
        const line = await (closings.get(seat) ?? Promise.resolve(fillTemplate(pick(PERSONA_BY_ID[seat].lines[this.lang].closing), { topic: this.topicShort() })));
        await this.say(seat, line, { kind: "closing" });
      }
    }
    if (this.isEnded()) return;
    await this.say("moderator", L.outro, { kind: "outro" });
    this.finish();
  }

  private isEnded(): boolean {
    return this.phase === "ended";
  }

  private finish() {
    if (this.phase === "ended") return;
    if (!this.discEnd) this.discEnd = this.nowSec();
    this.phase = "ended";
    this.recogWanted = false;
    try {
      this.recog?.stop();
    } catch {
      /* noop */
    }
    saveSession({
      config: this.cfg,
      turns: this.turns,
      events: this.events,
      discStart: this.discStart,
      discEnd: this.discEnd,
      endedAt: Date.now(),
      detectedLang: this.lang,
      body: this.bodyProvider?.(),
    });
    this.emit();
  }

  // ───────────────────────────── nudges ─────────────────────────────

  private evalNudges(now: number) {
    if (this.cfg.nudges === "off") return;
    const full = this.cfg.nudges === "full";
    const fire = (kind: string, text: string, cool: number) => {
      if (now - (this.nudgeCool[kind] ?? -1e9) < cool) return;
      this.nudgeCool[kind] = now;
      this.nudge = { id: ++this.nudgeSeq, kind, text, until: now + 9 };
    };
    const disc = now - this.discStart;
    const since = now - Math.max(this.lastStudentEnd, this.discStart);
    const m = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

    if (since >= 180) fire("silent", `You haven't spoken for ${m(since)}. Find a gap and add a point.`, 120);
    else if (full && since >= 90 && disc >= 90) fire("quiet", `${m(since)} of silence from you. Try building on the last speaker.`, 100);

    const air = this.airtime();
    const total = Object.values(air).reduce((a, b) => a + (b ?? 0), 0);
    if (disc > 60 && total > 20 && (air.student ?? 0) / total > 0.6) {
      fire("hog", `You hold ${Math.round(((air.student ?? 0) / total) * 100)}% of the airtime. Invite someone in.`, 90);
    }

    if (full) {
      const claim = [...this.turns].reverse().find((t) => t.claim && t.speaker !== "moderator" && t.speaker !== "student");
      if (claim) {
        const age = now - claim.tEnd;
        const answered = this.turns.some((t) => t.speaker === "student" && t.tStart > claim.tStart);
        if (age > 15 && age < 70 && !answered) {
          fire("claim", `${PERSONA_BY_ID[claim.speaker as PersonaId].name} cited a figure. Challenge it or build on it.`, 80);
        }
      }
      const studentText = this.turns.filter((t) => t.speaker === "student").slice(-3).map((t) => t.text).join(" ");
      const f = Object.values(countFillers(studentText)).reduce((a, b) => a + b, 0);
      if (f >= 5) fire("filler", `${f} filler words in your last few turns. Pause instead of filling.`, 150);
    }
    if (this.cfg.durationSec - disc <= 60) fire("wrap", "60 seconds left. Start shaping your closing line.", 200);
  }
}
