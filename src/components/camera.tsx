"use client";

import { useEffect, useRef, useState } from "react";
import { BodyTracker, type LiveVision } from "@/lib/vision";

/** Owns the on-device BodyTracker for the lifetime of the room. Does nothing when `enabled` is false. */
export function useBodyTracker(enabled: boolean) {
  const tracker = useRef<BodyTracker | null>(null);
  const [live, setLive] = useState<LiveVision | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const t = new BodyTracker();
    tracker.current = t;
    const unsub = t.subscribe((l) => setLive({ ...l }));
    void t.start();
    return () => {
      unsub();
      t.stop();
      tracker.current = null;
    };
  }, [enabled]);

  return { tracker, live };
}

const EYE_LABEL: Record<LiveVision["eye"], string> = { contact: "Eye contact", down: "Looking down", away: "Looking away", none: "Eyes" };
const POSTURE_LABEL: Record<LiveVision["posture"], string> = { good: "Posture good", slouch: "Sit up", "lean-in": "Leaning in", tilted: "Level shoulders", none: "Posture" };
const EXPR_LABEL: Record<LiveVision["expression"], string> = { smile: "Warm", tense: "Relax brow", neutral: "Neutral", none: "Face" };

const STATUS_TEXT: Partial<Record<LiveVision["status"], string>> = {
  starting: "Starting camera…",
  "loading-model": "Loading vision model…",
  denied: "Camera blocked. Allow it in site settings, or continue without.",
  unavailable: "No camera found.",
  "model-error": "Preview only: the analysis model could not load.",
};

/** Mirrored self-view with live, private coaching chips. Video stays on the device. */
export function SelfView({ tracker, live, large = false }: { tracker: React.RefObject<BodyTracker | null>; live: LiveVision | null; large?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const status = live?.status ?? "starting";

  useEffect(() => {
    const el = ref.current;
    const t = tracker.current;
    t?.attach(el);
    return () => t?.attach(null);
  }, [tracker, status]);

  const running = status === "running";
  const showVideo = status !== "denied" && status !== "unavailable";
  const cls = (ok: boolean, bad: boolean) => (bad ? "bad" : ok ? "ok" : "");

  return (
    <div className={`selfview ${large ? "large" : ""}`} aria-label="Your camera (private, on-device)">
      <div className="frame">
        {showVideo ? <video ref={ref} muted playsInline autoPlay aria-label="Your camera preview" /> : <div className="novideo">📷</div>}
        <span className="privacy" title="Analysis runs in your browser. No video is uploaded or saved.">
          ● On-device · not recorded
        </span>
      </div>
      {STATUS_TEXT[status] ? (
        <div className="sv-status">{STATUS_TEXT[status]}</div>
      ) : running ? (
        <div className="sv-chips" aria-live="off">
          {!live?.face ? (
            <span className="svc bad">Face not visible</span>
          ) : !live.calibrated ? (
            <span className="svc">Calibrating… sit naturally</span>
          ) : (
            <>
              <span className={`svc ${cls(live.eye === "contact", live.eye === "down" || live.eye === "away")}`}>{EYE_LABEL[live.eye]}</span>
              <span className={`svc ${cls(live.expression === "smile", live.expression === "tense")}`}>{EXPR_LABEL[live.expression]}</span>
              {live.body ? <span className={`svc ${cls(live.posture === "good", live.posture === "slouch")}`}>{POSTURE_LABEL[live.posture]}</span> : <span className="svc">Show shoulders</span>}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
