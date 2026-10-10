import type { Lang } from "./types";

const HINGLISH_MARKERS = new Set([
  "hai", "hain", "nahi", "nahin", "kya", "toh", "aur", "bhi", "matlab", "yaar", "lekin",
  "kyunki", "isliye", "mujhe", "hum", "ye", "yeh", "woh", "mein", "karna", "karte", "accha",
  "achha", "bilkul", "sahi", "galat", "bhai", "kuch", "log", "hota", "hoga", "tha", "thi",
  "raha", "rahi", "bahut", "sabse", "zyada", "jyada", "kaise", "kyun", "agar", "phir", "abhi",
  "dekho", "sunno", "samajh", "baat", "aapne", "aap", "main", "mera", "meri", "unka", "uska",
]);

/** Cheap client-side language detection. The backend uses gemini-3.5-transcribe-live for the real thing. */
export function detectLang(text: string): Lang {
  if (/[\u0900-\u097F]/.test(text)) return "hinglish";
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length < 3) return "en";
  const hits = words.filter((w) => HINGLISH_MARKERS.has(w)).length;
  return hits >= 2 && hits / words.length > 0.1 ? "hinglish" : "en";
}

export const FILLERS = [
  "um", "umm", "uh", "uhh", "like", "basically", "actually", "you know", "matlab",
  "so yeah", "kind of", "sort of", "i mean",
];

export function wordCount(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}

export function countFillers(text: string): Record<string, number> {
  const lower = ` ${text.toLowerCase().replace(/[^a-z\u0900-\u097F' ]/g, " ")} `;
  const out: Record<string, number> = {};
  for (const f of FILLERS) {
    const re = new RegExp(`\\s${f}\\s`, "g");
    const n = (lower.match(re) ?? []).length;
    if (n) out[f] = n;
  }
  return out;
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
