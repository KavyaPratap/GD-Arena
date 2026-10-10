import { NextResponse } from "next/server";

/**
 * Shared protection for the paid AI endpoints (Gemini + Cloud TTS).
 *
 * - Same-origin check: blocks the trivial "curl it from anywhere" abuse and cross-site calls.
 * - Sliding-window rate limit per client IP, per bucket.
 * - Body size cap.
 *
 * NOTE: the limiter is in-memory, so it is per server instance. That is enough to stop casual abuse in
 * dev / single-instance hosting; for multi-instance production put a shared store (Redis / Upstash) behind
 * the same interface.
 */

interface Bucket {
  hits: number[];
}
const buckets = new Map<string, Bucket>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches from some browsers omit it on GET; POST normally sends it
  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host;
    const fwdHost = (req.headers.get("x-forwarded-host") ?? "").split(",")[0].trim();
    const rawHost = (req.headers.get("host") ?? "").split(",")[0].trim();
    if (fwdHost && originHost === fwdHost) return true;
    if (rawHost && originHost === rawHost) return true;

    // Standard browser security header for same-site requests
    const secFetch = req.headers.get("sec-fetch-site");
    if (secFetch === "same-origin" || secFetch === "same-site") return true;

    // Permitted hosted domains & local development hosts
    const h = originUrl.hostname.toLowerCase();
    if (
      h.endsWith(".web.app") ||
      h.endsWith(".firebaseapp.com") ||
      h.endsWith(".run.app") ||
      h === "localhost" ||
      h === "127.0.0.1" ||
      h.startsWith("192.168.") ||
      h.startsWith("10.") ||
      h.startsWith("172.")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export interface GuardOptions {
  bucket: string;
  /** max requests per window */
  limit: number;
  windowMs?: number;
  /** max request body in bytes */
  maxBytes?: number;
}

export type GuardResult = { ok: true; body: unknown } | { ok: false; res: NextResponse };

export async function guard(req: Request, opts: GuardOptions): Promise<GuardResult> {
  if (!sameOrigin(req)) return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  const windowMs = opts.windowMs ?? 60_000;
  const key = `${opts.bucket}:${clientIp(req)}`;
  const now = Date.now();
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= opts.limit) {
    buckets.set(key, b);
    const retry = Math.ceil((windowMs - (now - b.hits[0])) / 1000);
    return { ok: false, res: NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(retry) } }) };
  }
  b.hits.push(now);
  buckets.set(key, b);
  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.hits.length || now - v.hits[v.hits.length - 1] > windowMs) buckets.delete(k);

  const max = opts.maxBytes ?? 64_000;
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > max) return { ok: false, res: NextResponse.json({ error: "Payload too large" }, { status: 413 }) };
  try {
    const text = await req.text();
    if (text.length > max) return { ok: false, res: NextResponse.json({ error: "Payload too large" }, { status: 413 }) };
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, res: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) };
  }
}

/**
 * Prompt-injection hygiene for text that originates from the (untrusted) browser.
 * Strips control chars and our own delimiter tokens and caps length. The prompts also tell the model
 * to treat this content strictly as data.
 */
export function clean(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/<<<|>>>|<\/?transcript>|<\/?data>/gi, " ")
    .slice(0, max)
    .trim();
}
