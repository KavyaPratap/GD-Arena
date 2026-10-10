"use client";

import { useEffect, useRef, useState } from "react";
import { RoomEngine, type Snapshot } from "./engine";
import type { RoomConfig } from "./types";

/** Binds a RoomEngine to React. In Stage 2 this hook swaps to a WebSocket-backed engine with the same shape. */
export function useRoom(cfg: RoomConfig | null) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const ref = useRef<RoomEngine | null>(null);

  useEffect(() => {
    if (!cfg) return;
    const engine = new RoomEngine(cfg);
    ref.current = engine;
    const unsub = engine.subscribe(setSnap);
    void engine.initMic();
    return () => {
      unsub();
      engine.destroy();
      ref.current = null;
    };
  }, [cfg]);

  return { snap, engine: ref };
}
