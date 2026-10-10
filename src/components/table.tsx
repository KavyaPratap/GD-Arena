"use client";

import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { MODERATOR, PERSONA_BY_ID } from "@/lib/personas";
import type { PersonaId, SpeakerId } from "@/lib/types";

/** True on phone-width viewports. Server-render safe: starts false, corrects on hydration. */
export function useIsNarrow(maxWidth = 640): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(`(max-width: ${maxWidth}px)`).matches,
    () => false,
  );
}

export function AiBadge({ label = "AI" }: { label?: string }) {
  return (
    <span className="ai-badge" title="This participant is an AI">
      ◆ {label}
    </span>
  );
}

export function hueOf(id: SpeakerId): number {
  if (id === "student") return 262;
  if (id === "moderator") return MODERATOR.hue;
  return PERSONA_BY_ID[id as PersonaId].hue;
}

export function nameOf(id: SpeakerId): string {
  if (id === "student") return "You";
  if (id === "moderator") return MODERATOR.name;
  return PERSONA_BY_ID[id as PersonaId].name;
}

export function Avatar({ id, size = 72 }: { id: SpeakerId; size?: number }) {
  const label = id === "student" ? "YOU" : nameOf(id).replace("Mr. ", "").slice(0, 1);
  const style = { "--h": hueOf(id), "--size": `${size}px` } as CSSProperties;
  return (
    <div className="avatar" style={style} aria-hidden>
      {label}
    </div>
  );
}

interface SeatProps {
  id: SpeakerId;
  x: number;
  y: number;
  speaking?: boolean;
  bid?: number;
  level?: number;
  cut?: boolean;
  bubble?: ReactNode;
  orb?: number;
}

export function Seat({ id, x, y, speaking, bid = 0, level = 0, cut, bubble, orb = 84 }: SeatProps) {
  const isAI = id !== "student";
  const persona = id !== "student" && id !== "moderator" ? PERSONA_BY_ID[id as PersonaId] : null;
  const style = { left: `${x}%`, top: `${y}%`, "--h": hueOf(id) } as CSSProperties;
  const orbStyle = { "--orb": `${orb}px`, "--bid": bid, "--lvl": level, "--h": hueOf(id) } as CSSProperties;
  return (
    <div className="seat" style={style} data-seat={id}>
      {bubble ? <div className="bubble">{bubble}</div> : null}
      <div className={`orb ${speaking ? "speaking" : ""} ${cut ? "cut" : ""} ${id === "student" ? "you" : ""}`} style={orbStyle}>
        {persona ? <span className="intent" aria-hidden /> : null}
        <span className="ring" aria-hidden />
        <Avatar id={id} size={orb - 14} />
      </div>
      <div className="name">
        {nameOf(id)} {isAI ? <AiBadge /> : null}
      </div>
      <div className="trait">{persona ? persona.role : id === "moderator" ? MODERATOR.role : "Human participant"}</div>
    </div>
  );
}

/**
 * Seats evenly around an ellipse. 90° is the bottom (the student), the moderator sits opposite.
 * `narrow` switches to a tall ellipse that fits a portrait phone screen.
 */
export function layoutSeats(aiCount: number, narrow = false): { id: "student" | "moderator" | number; x: number; y: number }[] {
  const total = aiCount + 2;
  const out: { id: "student" | "moderator" | number; x: number; y: number }[] = [];
  const modIdx = Math.floor(total / 2);
  const rx = narrow ? 36 : 41;
  const ry = narrow ? 41 : 40;
  let ai = 0;
  for (let k = 0; k < total; k++) {
    const theta = ((90 + (k * 360) / total) * Math.PI) / 180;
    const x = 50 + rx * Math.cos(theta);
    const y = 50 + ry * Math.sin(theta);
    if (k === 0) out.push({ id: "student", x, y });
    else if (k === modIdx) out.push({ id: "moderator", x, y });
    else out.push({ id: ai++, x, y });
  }
  return out;
}

export function TimerArc({ frac, time, phase }: { frac: number; time: string; phase: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="timer-arc" role="timer" aria-label={`${phase} ${time}`}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <defs>
          <linearGradient id="timerGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(262 92% 72%)" />
            <stop offset="100%" stopColor="hsl(174 82% 56%)" />
          </linearGradient>
        </defs>
        <circle className="track" cx="50" cy="50" r={r} fill="none" strokeWidth="3" />
        <circle
          className="prog"
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, frac)))}
        />
      </svg>
      <div>
        <div className="phase">{phase}</div>
        <div className="time">{time}</div>
      </div>
    </div>
  );
}
