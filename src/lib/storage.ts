import type { RoomConfig, SessionRecord } from "./types";
import type { AiReport } from "./report";

const cfgKey = (id: string) => `gdarena:config:${id}`;
const sesKey = (id: string) => `gdarena:session:${id}`;
const aiKey = (id: string) => `gdarena:ai:${id}`;
const INDEX_KEY = "gdarena:sessions";

function safeGet<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the app keeps working without persistence */
  }
}

export const saveConfig = (c: RoomConfig) => safeSet(cfgKey(c.id), c);
export const loadConfig = (id: string) => safeGet<RoomConfig>(cfgKey(id));
export const loadSession = (id: string) => safeGet<SessionRecord>(sesKey(id));
export const loadAiReport = (id: string) => safeGet<AiReport>(aiKey(id));
export const saveAiReport = (id: string, r: AiReport) => safeSet(aiKey(id), r);

export function saveSession(s: SessionRecord) {
  safeSet(sesKey(s.config.id), s);
  const idx = safeGet<string[]>(INDEX_KEY) ?? [];
  if (!idx.includes(s.config.id)) safeSet(INDEX_KEY, [s.config.id, ...idx].slice(0, 50));
}

export function listSessions(): SessionRecord[] {
  const idx = safeGet<string[]>(INDEX_KEY) ?? [];
  return idx.map((id) => loadSession(id)).filter((x): x is SessionRecord => !!x);
}

export function newRoomId(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}
