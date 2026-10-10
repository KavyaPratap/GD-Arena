"use client";

import { Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Nav } from "@/components/nav";
import { AiBadge, hueOf } from "@/components/table";
import { fmtClock } from "@/lib/lang";
import { buildReport, labelOf, mergeAiReport, type AiReport, type Opening, type Quote, type Report as ReportData } from "@/lib/report";
import { SAMPLE_SESSION } from "@/lib/sample";
import { loadAiReport, loadSession, saveAiReport } from "@/lib/storage";
import type { SessionRecord } from "@/lib/types";

function ReportPageInner() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionRecord | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) setSession(id === "demo" ? SAMPLE_SESSION : loadSession(id));
    });
    return () => {
      active = false;
    };
  }, [id]);

  if (session === undefined) return <div className="empty">Loading report…</div>;
  if (session === null)
    return (
      <>
        <Nav />
        <div className="empty">
          <h1>No report found</h1>
          <p style={{ margin: "12px 0 24px" }}>This session was run in another browser, or the data was cleared.</p>
          <Link className="btn btn-primary" href="/setup">
            Start a new discussion
          </Link>
        </div>
      </>
    );
  return <Report session={session} />;
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="empty">Loading report…</div>}>
      <ReportPageInner />
    </Suspense>
  );
}

function Dial({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const col = value >= 70 ? "hsl(152 68% 56%)" : value >= 45 ? "hsl(38 96% 62%)" : "hsl(355 86% 67%)";
  return (
    <div className="dial" role="img" aria-label={`Overall score ${value} out of 100`}>
      <svg width="170" height="170" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(250 30% 60% / 0.18)" strokeWidth="9" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={col} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)" }} />
      </svg>
      <div className="center">
        <div>
          <b>{value}</b>
          <span>Arena score</span>
        </div>
      </div>
    </div>
  );
}

function getDonutSegments(items: { id: string; pct: number; hue: number }[], c: number) {
  let running = 0;
  return items.map((it) => {
    const len = (it.pct / 100) * c;
    const offset = running;
    running += len;
    return { ...it, len, offset };
  });
}

function Donut({ items }: { items: { id: string; pct: number; hue: number }[] }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const segments = getDonutSegments(items, c);
  return (
    <svg viewBox="0 0 100 100" width="180" height="180" role="img" aria-label="Airtime share by participant">
      <g transform="rotate(-90 50 50)">
        <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(250 30% 60% / 0.12)" strokeWidth="14" />
        {segments.map((s) => (
          <circle key={s.id} cx="50" cy="50" r={r} fill="none" stroke={`hsl(${s.hue} 85% 62%)`} strokeWidth="14" strokeDasharray={`${Math.max(0, s.len - 1.2)} ${c}`} strokeDashoffset={-s.offset} />
        ))}
      </g>
    </svg>
  );
}

function QuoteCard({ q, onJump }: { q: Quote; onJump: (id: number) => void }) {
  return (
    <button className="quote" style={{ "--h": hueOf(q.speaker) } as CSSProperties} onClick={() => onJump(q.turnId)} title="Jump to this moment in the transcript">
      <div className="q-meta">
        <span>
          {labelOf(q.speaker)}
          {q.speaker !== "student" ? " (AI)" : ""} · {fmtClock(q.t)}
        </span>
        <span className={`ver ${q.verified ? "" : "no"}`}>{q.verified ? "✓ verbatim match" : "✕ unverified"}</span>
      </div>
      <q>
        {q.text}
        {q.cutOff ? "…" : ""}
      </q>
      {q.cutOff ? <div style={{ fontSize: 12, color: "var(--bad)", marginTop: 4 }}>You cut this participant off here.</div> : null}
    </button>
  );
}

let hearAudio: HTMLAudioElement | null = null;

/** Plays a suggested line in the natural Chirp voice; the robotic browser voice is only an offline fallback. */
async function hear(text: string, lang: "en" | "hinglish") {
  if (typeof window === "undefined") return;
  hearAudio?.pause();
  window.speechSynthesis?.cancel();
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, speaker: "moderator", lang }),
    });
    const data = res.ok ? await res.json() : null;
    if (data?.audioContent) {
      hearAudio = new Audio("data:audio/mp3;base64," + data.audioContent);
      await hearAudio.play();
      return;
    }
  } catch {
    /* fall through to the browser voice */
  }
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "hinglish" ? "hi-IN" : "en-IN";
  u.rate = 0.98;
  window.speechSynthesis.speak(u);
}

function Report({ session }: { session: SessionRecord }) {
  const base = useMemo(() => buildReport(session), [session]);
  const [ai, setAi] = useState<AiReport | null>(() => (session.sample ? null : loadAiReport(session.config.id)));
  const [analysing, setAnalysing] = useState(false);
  const report: ReportData = useMemo(() => (ai ? mergeAiReport(base, ai, session) : base), [base, ai, session]);

  // Ask the Gemini analyst for the real evaluation. Cached per session so reloading never re-bills; the
  // offline heuristic report is shown instantly and replaced when the analyst answers.
  useEffect(() => {
    if (session.sample || !session.turns.some((t) => t.speaker === "student")) return;
    if (loadAiReport(session.config.id)) return;
    const ctl = new AbortController();
    Promise.resolve().then(() => setAnalysing(true));
    fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
      signal: ctl.signal,
    })
      .then((r) => (r.ok ? (r.json() as Promise<AiReport>) : null))
      .then((data) => {
        if (data && Array.isArray(data.feedback)) {
          setAi(data);
          saveAiReport(session.config.id, data);
        }
      })
      .catch(() => undefined)
      .finally(() => setAnalysing(false));
    return () => ctl.abort();
  }, [session]);

  const [hl, setHl] = useState<number | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const span = Math.max(1, session.discEnd - session.discStart);
  const studentTurns = session.turns.filter((t) => t.speaker === "student" && t.tStart >= session.discStart && t.tStart <= session.discEnd);

  const jump = (turnId: number) => {
    setHl(turnId);
    document.getElementById(`turn-${turnId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setHl((h) => (h === turnId ? null : h)), 3500);
  };

  const pos = (t: number) => `${Math.min(100, Math.max(0, ((t - session.discStart) / span) * 100))}%`;
  const noSpeech = report.delivery.studentTurns === 0;

  return (
    <>
      <Nav />
      <main className="container page-pad">
        <div className="page-title">
          {session.sample ? (
            <span className="sample-tag" id="sample-tag">
              ◔ Sample session with scripted data: run your own to get a real report
            </span>
          ) : (
            <span className="eyebrow">Your report</span>
          )}
          <h1 style={{ marginTop: 14 }}>{session.config.topic}</h1>
          <p>
            Goal for this session: <b style={{ color: "var(--text)" }}>{session.config.goal}</b>. Every point below is tied to a quoted moment: click a quote to jump to it in the transcript.
          </p>
          {!session.sample ? (
            <p className={`source-tag ${analysing ? "busy" : report.source}`} id="source-tag" role="status">
              {analysing
                ? "◌ The Gemini analyst is reading your transcript… (showing a quick offline estimate meanwhile)"
                : report.source === "gemini"
                  ? "✓ Analysed by Gemini. Every quote was machine-checked against your transcript."
                  : "△ Offline estimate: the AI analyst was unavailable, so scores come from simple keyword rules. Treat them as rough."}
            </p>
          ) : null}
        </div>

        <section className="glass report-hero" style={{ marginTop: 28 }} aria-label="Summary">
          <Dial value={report.overall} />
          <div className="two-col">
            <div>
              <div className="field-label" style={{ marginTop: 0 }}>
                Strengths
              </div>
              <div className="chips-col">
                {report.strengths.length ? report.strengths.map((s) => <span className="chip on" key={s}>✓ {s}</span>) : <span className="chip">None yet. Build one this session.</span>}
              </div>
            </div>
            <div>
              <div className="field-label" style={{ marginTop: 0 }}>
                Fix first
              </div>
              <div className="chips-col">
                {report.fixes.length ? report.fixes.map((s) => <span className="chip" key={s}>↗ {s}</span>) : <span className="chip">Nothing urgent.</span>}
              </div>
            </div>
          </div>
        </section>

        {noSpeech ? (
          <div className="brief" style={{ marginTop: 18 }}>
            You didn&apos;t say anything in this session, so the scores reflect that honestly. Try again and speak, or type if your mic is blocked.
          </div>
        ) : null}

        <div className="report-layout">
          <div>
            <section className="glass card" aria-labelledby="air-h">
              <h2 id="air-h">Who spoke how much</h2>
              <p className="sub">Airtime across the open discussion and closing round.</p>
              <div className="airtime-wrap">
                <Donut items={report.airtime.map((a) => ({ id: a.id, pct: a.pct, hue: hueOf(a.id) }))} />
                <div className="bars">
                  {report.airtime.map((a) => (
                    <div className="bar-row" key={a.id} style={{ "--h": hueOf(a.id), "--w": a.pct } as CSSProperties}>
                      <span>
                        {a.label} {a.id !== "student" ? <AiBadge /> : null}
                      </span>
                      <div className="track">
                        <div className="fill" />
                      </div>
                      <b>{Math.round(a.pct)}%</b>
                    </div>
                  ))}
                </div>
              </div>
              <div className="stat-grid">
                <div className="stat">
                  <b>{report.delivery.wpm || "—"}</b>
                  <span>words per minute (ideal 120 to 160)</span>
                </div>
                <div className="stat">
                  <b>{report.delivery.fillerTotal}</b>
                  <span>
                    filler words{report.delivery.fillers[0] ? ` (“${report.delivery.fillers[0].word}” most)` : ""}
                  </span>
                </div>
                <div className="stat">
                  <b>{Math.round(report.delivery.avgTurnSec)}s</b>
                  <span>average turn length</span>
                </div>
                <div className="stat">
                  <b>{fmtClock(report.delivery.longestSilenceSec)}</b>
                  <span>longest stretch without speaking</span>
                </div>
              </div>
            </section>

            <h2 style={{ fontSize: 26, margin: "30px 0 14px" }} id="rubric-h">
              Feedback with receipts
            </h2>
            {report.feedback.map((f) => (
              <article className="glass fb" key={f.id} id={`fb-${f.id}`}>
                <div className="fb-head">
                  <h3>{f.title}</h3>
                  <span className={`score ${f.verdict}`}>{f.score.toFixed(1)}</span>
                </div>
                <p className="sum">{f.summary}</p>
                {f.evidence.map((q) => (
                  <QuoteCard key={`${f.id}-${q.turnId}`} q={q} onJump={jump} />
                ))}
                <div className="try">
                  <b>Try this: </b>
                  {f.tryThis}
                </div>
              </article>
            ))}

            {report.body ? (
              <section className="glass card" style={{ marginTop: 30 }} aria-labelledby="body-h" id="body-language">
                <h2 id="body-h">
                  Body language <AiBadge label="Vision" />
                </h2>
                <p className="sub">
                  Measured on your device from the camera across {fmtClock(report.body.seconds)} of live discussion. No video or image was uploaded or saved: only these numbers.
                  {report.body.overall !== null ? ` Presence score: ${report.body.overall}/100.` : ""}
                </p>
                {report.body.coaching ? <div className="brief" style={{ marginTop: 0, marginBottom: 16 }}>{report.body.coaching}</div> : null}
                {report.body.cards.map((c) => (
                  <article className="fb" key={c.id} id={`body-${c.id}`} style={{ marginBottom: 14 }}>
                    <div className="fb-head">
                      <h3>{c.title}</h3>
                      <span className={`score ${c.verdict}`}>{c.score === null ? "—" : c.score.toFixed(1)}</span>
                    </div>
                    <p className="sum">{c.summary}</p>
                    <div className="stat-grid" style={{ margin: "10px 0" }}>
                      {c.stats.map((s) => (
                        <div className="stat" key={s.label}>
                          <b>{s.value}</b>
                          <span>{s.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="try">
                      <b>Try this: </b>
                      {c.tryThis}
                    </div>
                  </article>
                ))}
                {report.body.moments.length ? (
                  <>
                    <div className="field-label">Notable moments</div>
                    <div className="chips-col">
                      {report.body.moments.map((m, i) => (
                        <span className={`chip body-moment ${m.kind === "smile" ? "on" : ""}`} key={`${m.t}-${i}`}>
                          {fmtClock(m.t)} · {m.label}
                        </span>
                      ))}
                    </div>
                  </>
                ) : null}
              </section>
            ) : session.config.camera && !session.sample ? (
              <div className="brief" style={{ marginTop: 24 }}>
                The camera was on, but too little of your face was visible during the live discussion to say anything honest about body language. Sit centred, well lit, about an arm&apos;s length away, and try again.
              </div>
            ) : null}

            <section className="glass card" style={{ marginTop: 30 }} aria-labelledby="ghost-h" id="ghost">
              <h2 id="ghost-h">Ghost Replay: what you could have said</h2>
              <p className="sub">
                Red markers are openings you missed. {report.source === "gemini" ? "The suggested lines were written by Gemini in your own register." : "These suggested lines are generic templates because the AI analyst was unavailable."}
              </p>
              {report.openings.length === 0 ? (
                <p className="sub">No clear missed openings detected. Nice. Try the Brutal setting for a tougher room.</p>
              ) : (
                <>
                  <div className="timeline" aria-label="Timeline of missed openings">
                    <div className="rail" />
                    {studentTurns.map((t) => (
                      <span key={t.id} className="you" style={{ left: pos(t.tStart), width: `max(4px, ${((t.tEnd - t.tStart) / span) * 100}%)` }} title={`You spoke at ${fmtClock(t.tStart)}`} />
                    ))}
                    {report.openings.map((o, i) => (
                      <button
                        key={o.id}
                        className={`mark ${openId === o.id ? "on" : ""}`}
                        style={{ left: pos(o.t) }}
                        aria-label={`Missed opening at ${fmtClock(o.t)}`}
                        onClick={() => {
                          setOpenId(o.id);
                          document.getElementById(`op-${o.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  {report.openings.map((o: Opening, i) => (
                    <div className={`opening ${openId === o.id ? "on" : ""}`} id={`op-${o.id}`} key={o.id}>
                      <h4>
                        <span>
                          {i + 1}. {o.title}
                        </span>
                        <time>at {fmtClock(o.t)}</time>
                      </h4>
                      <QuoteCard q={o.context} onJump={jump} />
                      <div className="ideal">
                        <small>What you could have said</small>
                        {o.ideal}
                        <div style={{ marginTop: 10 }}>
                          <button className="btn btn-sm" onClick={() => hear(o.ideal, session.detectedLang)}>
                            ▶ Hear it
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </section>

            <div className="row" style={{ marginTop: 10 }}>
              <Link className="btn btn-primary btn-lg" href="/setup" id="again">
                Run another discussion →
              </Link>
              <Link className="btn btn-lg" href="/">
                Home
              </Link>
            </div>
          </div>

          <aside className="glass side-sticky" aria-label="Full transcript">
            <h3 style={{ padding: "16px 18px 10px", fontSize: 16 }}>Full transcript</h3>
            <div className="transcript">
              {session.turns.map((t) => (
                <div id={`turn-${t.id}`} key={t.id} className={`tline ${hl === t.id ? "hl" : ""}`} style={{ "--h": hueOf(t.speaker) } as CSSProperties}>
                  <div className="meta">
                    <span>
                      {labelOf(t.speaker)} {t.speaker !== "student" ? "· AI" : ""}
                    </span>
                    <time>{fmtClock(t.tStart)}</time>
                  </div>
                  {t.interruptedAt && t.spokenText ? (
                    <>
                      {t.spokenText}… <span className="cut">(cut off)</span>
                    </>
                  ) : (
                    t.text
                  )}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
