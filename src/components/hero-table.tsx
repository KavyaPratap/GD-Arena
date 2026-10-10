"use client";

import { useEffect, useState } from "react";
import { Seat, TimerArc, layoutSeats } from "./table";
import type { PersonaId } from "@/lib/types";

const CAST: PersonaId[] = ["vikram", "ananya", "meera", "kabir"];
const LINES: Record<string, string> = {
  vikram: "Where is the hard evidence?",
  ananya: "Around 12 percent, actually.",
  meera: "May I add something small?",
  kabir: "Let me argue the opposite.",
};

/** Decorative, self-animating preview of the round table used on the landing page. */
export function HeroTable() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2300);
    return () => clearInterval(id);
  }, []);
  const seats = layoutSeats(CAST.length);
  const speaker = CAST[tick % CAST.length];
  return (
    <div className="hero-table" aria-hidden>
      <div className="table-surface">
        <div className="table-center">
          <TimerArc frac={0.62} time="03:12" phase="Live" />
        </div>
      </div>
      {seats.map((s) => {
        if (s.id === "student") return <Seat key="student" id="student" x={s.x} y={s.y} level={0.15} orb={76} />;
        if (s.id === "moderator") return <Seat key="mod" id="moderator" x={s.x} y={s.y} orb={76} />;
        const id = CAST[s.id as number];
        const speaking = id === speaker;
        return (
          <Seat
            key={id}
            id={id}
            x={s.x}
            y={s.y}
            speaking={speaking}
            bid={speaking ? 0 : ((tick + (s.id as number) * 3) % 7) / 9 + 0.15}
            bubble={speaking ? LINES[id] : undefined}
            orb={76}
          />
        );
      })}
    </div>
  );
}
