/**
 * On-device body-language analysis for GD Arena.
 *
 * Runs MediaPipe Face Landmarker (478 landmarks + 52 blendshapes + head pose) and Pose Landmarker entirely
 * in the browser. No frame is ever uploaded or stored; only the aggregate BodyLanguage numbers are kept.
 *
 * What is measured (and what each number honestly means):
 *  - eye contact   : head pose + iris/eyelid blendshapes pointed at the camera (a proxy for facing the panel)
 *  - looking down  : eyes/head angled down (notes, phone, nerves)
 *  - expression    : smile / tense (brow-down, lip-press, frown, squint) / neutral, plus how much it varies
 *  - posture       : shoulder tilt, head sinking toward the shoulders, leaning in or back (vs. a baseline
 *                    captured when the user first sits down)
 *  - restlessness  : upper-body motion energy; gesturing = visible wrist motion
 *
 * All thresholds are relative to a per-user baseline, so camera angle and face shape matter far less.
 */
import type { FaceLandmarker, PoseLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { BodyLanguage, BodyMoment, BodyMomentKind } from "./types";

export type VisionStatus = "idle" | "starting" | "loading-model" | "running" | "denied" | "unavailable" | "model-error";

export interface LiveVision {
  status: VisionStatus;
  face: boolean;
  body: boolean;
  eye: "contact" | "down" | "away" | "none";
  expression: "smile" | "tense" | "neutral" | "none";
  posture: "good" | "slouch" | "lean-in" | "tilted" | "none";
  calibrated: boolean;
}

const WASM_BASE = "/mediapipe/wasm";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const FACE_INTERVAL_MS = 120; // ~8 fps
const POSE_EVERY = 2; // pose at ~4 fps
const BASELINE_SAMPLES = 25;

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const deg = (r: number) => (r * 180) / Math.PI;

const MOMENT_RULES: Record<BodyMomentKind, { minSec: number; label: (d: number) => string }> = {
  away: { minSec: 4, label: (d) => `Eyes drifted off to the side for ${d}s` },
  down: { minSec: 4, label: (d) => `Looked down for ${d}s` },
  slouch: { minSec: 8, label: (d) => `Slouched for ${d}s` },
  tense: { minSec: 6, label: (d) => `Looked tense or frowning for ${d}s` },
  smile: { minSec: 3, label: (d) => `Warm, confident smile for ${d}s` },
  fidget: { minSec: 6, label: (d) => `Restless movement for ${d}s` },
};

export class BodyTracker {
  readonly live: LiveVision = { status: "idle", face: false, body: false, eye: "none", expression: "none", posture: "none", calibrated: false };

  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private face: FaceLandmarker | null = null;
  private pose: PoseLandmarker | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private listeners = new Set<(l: LiveVision) => void>();
  private lastEmit = 0;
  private lastTs = 0;
  private lastTick = 0;
  private tickN = 0;
  private stopped = false;

  private active = false;
  private clock: () => number = () => 0;

  // baseline
  private yawBase: number[] = [];
  private pitchBase: number[] = [];
  private yaw0 = 0;
  private pitch0 = 0;
  private bodyBase: { w: number; drop: number; midY: number }[] = [];
  private b0: { w: number; drop: number; midY: number } | null = null;
  private faceCalibrated = false;

  // accumulators (seconds)
  private secs = 0;
  private faceSecs = 0;
  private contactSecs = 0;
  private downSecs = 0;
  private awaySecs = 0;
  private smileSecs = 0;
  private tenseSecs = 0;
  private neutralSecs = 0;
  private bodySecs = 0;
  private slouchSecs = 0;
  private leanSecs = 0;
  private tiltBadSecs = 0;
  private tiltSum = 0;
  private gestureSecs = 0;
  private motionSum = 0;
  private motionN = 0;
  private exprN = 0;
  private exprMean = 0;
  private exprM2 = 0;
  private prevPose: { mx: number; my: number; nx: number; ny: number; lw?: { x: number; y: number }; rw?: { x: number; y: number } } | null = null;

  private moments: BodyMoment[] = [];
  private runs: Partial<Record<BodyMomentKind, { start: number; startClock: number } | undefined>> = {};
  private poseCache: { ok: boolean; slouch: boolean; lean: boolean; tilt: number; tiltBad: boolean; motion: number; gesturing: boolean } | null = null;

  /** Start camera + models. Safe to call without a <video>; call attach() when the element exists. */
  async start(): Promise<void> {
    if (this.stream || this.stopped) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      this.setStatus("unavailable");
      return;
    }
    this.setStatus("starting");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false });
    } catch (e) {
      const name = (e as DOMException)?.name;
      this.setStatus(name === "NotFoundError" || name === "OverconstrainedError" ? "unavailable" : "denied");
      return;
    }
    if (this.stopped) {
      this.stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.bindVideo();
    this.setStatus("loading-model");
    try {
      await this.loadModels();
    } catch (e) {
      console.warn("Body-language models failed to load; camera preview still works.", e);
      this.setStatus("model-error");
      return;
    }
    if (this.stopped) return;
    this.setStatus("running");
    this.timer = setInterval(() => this.tick(), FACE_INTERVAL_MS);
  }

  attach(video: HTMLVideoElement | null) {
    this.video = video;
    this.bindVideo();
  }

  private bindVideo() {
    const v = this.video;
    if (!v || !this.stream) return;
    if (v.srcObject !== this.stream) {
      v.srcObject = this.stream;
      v.muted = true;
      v.playsInline = true;
      void v.play().catch(() => undefined);
    }
  }

  private async loadModels() {
    const { FilesetResolver, FaceLandmarker, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    const mk = async <T,>(make: (delegate: "GPU" | "CPU") => Promise<T>): Promise<T> => {
      try {
        return await make("GPU");
      } catch {
        return make("CPU");
      }
    };
    [this.face, this.pose] = await Promise.all([
      mk((delegate) =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL, delegate },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        }),
      ),
      mk((delegate) =>
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: POSE_MODEL, delegate },
          runningMode: "VIDEO",
          numPoses: 1,
        }),
      ),
    ]);
  }

  /** Only time inside the live discussion counts toward the report; the baseline is learned from the first seconds anyway. */
  setActive(active: boolean, clock: () => number) {
    this.active = active;
    this.clock = clock;
    if (!active) this.closeAllRuns();
  }

  subscribe(fn: (l: LiveVision) => void): () => void {
    this.listeners.add(fn);
    fn(this.live);
    return () => this.listeners.delete(fn);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.closeAllRuns();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    try {
      this.face?.close();
      this.pose?.close();
    } catch {
      /* already closed */
    }
    this.face = null;
    this.pose = null;
    this.listeners.clear();
  }

  private setStatus(s: VisionStatus) {
    this.live.status = s;
    this.emit(true);
  }

  private emit(force = false) {
    const now = performance.now();
    if (!force && now - this.lastEmit < 400) return;
    this.lastEmit = now;
    this.listeners.forEach((l) => l(this.live));
  }

  // ───────────────────────── frame loop ─────────────────────────

  private tick() {
    const v = this.video;
    if (!v || !this.face || v.readyState < 2 || v.videoWidth === 0) return;
    const nowMs = performance.now();
    const dt = this.lastTick ? Math.min(0.5, (nowMs - this.lastTick) / 1000) : FACE_INTERVAL_MS / 1000;
    this.lastTick = nowMs;
    const ts = Math.max(nowMs, this.lastTs + 1);
    this.lastTs = ts;
    this.tickN++;

    let faceRes;
    try {
      faceRes = this.face.detectForVideo(v, ts);
    } catch {
      return;
    }
    if (this.pose && this.tickN % POSE_EVERY === 0) {
      try {
        const poseRes = this.pose.detectForVideo(v, ts + 0.5);
        this.poseCache = this.readPose(poseRes.landmarks?.[0], dt * POSE_EVERY);
      } catch {
        /* skip this frame */
      }
    }

    const lm = faceRes.faceLandmarks?.[0];
    const cats = faceRes.faceBlendshapes?.[0]?.categories;
    const mat = faceRes.facialTransformationMatrixes?.[0]?.data;
    const haveFace = !!(lm && cats && mat);

    this.live.face = haveFace;
    this.live.body = !!this.poseCache?.ok;

    let eye: LiveVision["eye"] = "none";
    let expr: LiveVision["expression"] = "none";

    if (haveFace) {
      const bs: Record<string, number> = {};
      for (const c of cats!) bs[c.categoryName] = c.score;
      const avg = (a: string, b: string) => ((bs[a] ?? 0) + (bs[b] ?? 0)) / 2;

      // head pose (Y-X-Z Euler from the column-major 4x4 transform)
      const yaw = deg(Math.atan2(mat![8], mat![10]));
      const pitch = deg(Math.asin(clamp(-mat![9], -1, 1)));

      if (!this.faceCalibrated) {
        this.yawBase.push(yaw);
        this.pitchBase.push(pitch);
        if (this.yawBase.length >= BASELINE_SAMPLES) {
          const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
          this.yaw0 = med(this.yawBase);
          this.pitch0 = med(this.pitchBase);
          this.faceCalibrated = true;
          this.live.calibrated = true;
        }
      }
      const yawDev = Math.abs(yaw - this.yaw0);
      const pitchDev = Math.abs(pitch - this.pitch0);

      const eyeDown = avg("eyeLookDownLeft", "eyeLookDownRight");
      const eyeUp = avg("eyeLookUpLeft", "eyeLookUpRight");
      const side = Math.abs((bs.eyeLookOutLeft ?? 0) + (bs.eyeLookInRight ?? 0) - (bs.eyeLookInLeft ?? 0) - (bs.eyeLookOutRight ?? 0)) / 2;

      const down = eyeDown > 0.5 || (pitchDev > 20 && eyeDown > 0.25);
      const away = !down && (yawDev > 22 || side > 0.5 || eyeUp > 0.65 || pitchDev > 28);
      eye = down ? "down" : away ? "away" : "contact";

      const smile = avg("mouthSmileLeft", "mouthSmileRight");
      const brow = avg("browDownLeft", "browDownRight");
      const tense = brow > 0.45 || avg("mouthPressLeft", "mouthPressRight") > 0.5 || avg("mouthFrownLeft", "mouthFrownRight") > 0.4 || avg("eyeSquintLeft", "eyeSquintRight") > 0.55;
      expr = smile > 0.4 ? "smile" : tense ? "tense" : "neutral";

      if (this.active && this.faceCalibrated) {
        this.secs += dt;
        this.faceSecs += dt;
        if (eye === "contact") this.contactSecs += dt;
        else if (eye === "down") this.downSecs += dt;
        else this.awaySecs += dt;
        if (expr === "smile") this.smileSecs += dt;
        else if (expr === "tense") this.tenseSecs += dt;
        else this.neutralSecs += dt;

        // Welford running variance of a composite "facial animation" signal
        const e = smile + (bs.browInnerUpLeft ?? bs.browInnerUp ?? 0) + avg("browOuterUpLeft", "browOuterUpRight") + avg("eyeWideLeft", "eyeWideRight");
        this.exprN++;
        const d = e - this.exprMean;
        this.exprMean += d / this.exprN;
        this.exprM2 += d * (e - this.exprMean);

        this.trackRun("away", eye === "away");
        this.trackRun("down", eye === "down");
        this.trackRun("tense", expr === "tense");
        this.trackRun("smile", expr === "smile");
      }
    } else if (this.active && this.faceCalibrated) {
      this.secs += dt; // face missing still counts as time, so facePct reflects it
      this.closeRun("away");
      this.closeRun("down");
      this.closeRun("tense");
      this.closeRun("smile");
    }

    const pc = this.poseCache;
    if (this.active && pc?.ok) {
      this.trackRun("slouch", pc.slouch);
      this.trackRun("fidget", pc.motion > 0.05);
    }

    this.live.eye = eye;
    this.live.expression = expr;
    this.live.posture = !pc?.ok ? "none" : pc.slouch ? "slouch" : pc.lean ? "lean-in" : pc.tiltBad ? "tilted" : "good";
    this.emit();
  }

  private readPose(lm: NormalizedLandmark[] | undefined, dt: number) {
    if (!lm || lm.length < 13) {
      this.prevPose = null;
      return { ok: false, slouch: false, lean: false, tilt: 0, tiltBad: false, motion: 0, gesturing: false };
    }
    const nose = lm[0];
    const ls = lm[11];
    const rs = lm[12];
    const vis = (p: NormalizedLandmark) => p.visibility ?? 1;
    const inFrame = (p: NormalizedLandmark) => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1;
    const ok = vis(ls) > 0.5 && vis(rs) > 0.5 && vis(nose) > 0.5 && inFrame(ls) && inFrame(rs);
    if (!ok) {
      this.prevPose = null;
      return { ok: false, slouch: false, lean: false, tilt: 0, tiltBad: false, motion: 0, gesturing: false };
    }
    const w = Math.max(0.05, Math.hypot(ls.x - rs.x, ls.y - rs.y));
    const midX = (ls.x + rs.x) / 2;
    const midY = (ls.y + rs.y) / 2;
    const drop = (midY - nose.y) / w; // how tall the neck/head sits above the shoulders
    const tilt = deg(Math.atan2(Math.abs(ls.y - rs.y), Math.abs(ls.x - rs.x)));

    if (!this.b0) {
      this.bodyBase.push({ w, drop, midY });
      if (this.bodyBase.length >= BASELINE_SAMPLES) {
        const med = (k: "w" | "drop" | "midY") => [...this.bodyBase].map((b) => b[k]).sort((a, b) => a - b)[Math.floor(this.bodyBase.length / 2)];
        this.b0 = { w: med("w"), drop: med("drop"), midY: med("midY") };
      }
    }
    const b0 = this.b0;
    const slouch = !!b0 && (drop < b0.drop * 0.78 || (midY - b0.midY > 0.07 && w < b0.w * 1.05));
    const lean = !!b0 && w > b0.w * 1.2;
    const tiltBad = tilt > 8;

    // restlessness: normalised displacement between consecutive pose samples
    const lw = vis(lm[15]) > 0.5 ? { x: lm[15].x, y: lm[15].y } : undefined;
    const rw = vis(lm[16]) > 0.5 ? { x: lm[16].x, y: lm[16].y } : undefined;
    let motion = 0;
    let gesturing = false;
    const cur = { mx: midX, my: midY, nx: nose.x, ny: nose.y, lw, rw };
    if (this.prevPose) {
      const p = this.prevPose;
      motion = (Math.abs(cur.mx - p.mx) + Math.abs(cur.my - p.my) + Math.abs(cur.nx - p.nx) + Math.abs(cur.ny - p.ny)) / w;
      const hand = (a?: { x: number; y: number }, b?: { x: number; y: number }) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) / w : 0);
      gesturing = hand(cur.lw, p.lw) > 0.12 || hand(cur.rw, p.rw) > 0.12;
    }
    this.prevPose = cur;

    if (this.active && b0) {
      this.bodySecs += dt;
      if (slouch) this.slouchSecs += dt;
      if (lean) this.leanSecs += dt;
      if (tiltBad) this.tiltBadSecs += dt;
      this.tiltSum += tilt * dt;
      if (gesturing) this.gestureSecs += dt;
      this.motionSum += Math.min(0.2, motion);
      this.motionN++;
    }
    return { ok: true, slouch, lean, tilt, tiltBad, motion, gesturing };
  }

  // ───────────────────────── moments ─────────────────────────

  private trackRun(kind: BodyMomentKind, on: boolean) {
    const r = this.runs[kind];
    if (on && !r) this.runs[kind] = { start: this.clock(), startClock: performance.now() };
    else if (!on && r) this.closeRun(kind);
  }

  private closeRun(kind: BodyMomentKind) {
    const r = this.runs[kind];
    if (!r) return;
    this.runs[kind] = undefined;
    const dur = Math.round((performance.now() - r.startClock) / 1000);
    const rule = MOMENT_RULES[kind];
    if (dur >= rule.minSec) this.moments.push({ t: r.start, kind, label: rule.label(dur) });
  }

  private closeAllRuns() {
    (Object.keys(MOMENT_RULES) as BodyMomentKind[]).forEach((k) => this.closeRun(k));
  }

  // ───────────────────────── result ─────────────────────────

  /** Aggregate numbers only. Returns undefined when too little usable data was captured to say anything honest. */
  summary(): BodyLanguage | undefined {
    this.closeAllRuns();
    if (this.secs < 15 || this.faceSecs < 8) return undefined;
    const pctF = (s: number) => (this.faceSecs > 0 ? (s / this.faceSecs) * 100 : 0);
    const pctB = (s: number) => (this.bodySecs > 0 ? (s / this.bodySecs) * 100 : 0);
    const std = this.exprN > 1 ? Math.sqrt(this.exprM2 / (this.exprN - 1)) : 0;
    const fidget = this.motionN ? clamp(this.motionSum / this.motionN / 0.05, 0, 1) : 0;
    const slouchF = this.bodySecs > 0 ? this.slouchSecs / this.bodySecs : 0;
    const tiltF = this.bodySecs > 0 ? this.tiltBadSecs / this.bodySecs : 0;
    const hasBody = this.bodySecs >= 8;
    const postureScore = hasBody ? clamp(10 - slouchF * 8 - tiltF * 3 - fidget * 2, 0, 10) : 0;

    return {
      seconds: Math.round(this.secs),
      facePct: (this.faceSecs / this.secs) * 100,
      eyeContactPct: pctF(this.contactSecs),
      lookingDownPct: pctF(this.downSecs),
      lookingAwayPct: pctF(this.awaySecs),
      smilePct: pctF(this.smileSecs),
      tensePct: pctF(this.tenseSecs),
      neutralPct: pctF(this.neutralSecs),
      expressiveness: clamp(std / 0.18, 0, 1),
      bodyVisiblePct: (this.bodySecs / this.secs) * 100,
      postureScore,
      slouchPct: pctB(this.slouchSecs),
      leanInPct: pctB(this.leanSecs),
      shoulderTiltDeg: this.bodySecs > 0 ? this.tiltSum / this.bodySecs : 0,
      fidget,
      gesturePct: pctB(this.gestureSecs),
      moments: [...this.moments].sort((a, b) => a.t - b.t).slice(0, 14),
    };
  }
}
