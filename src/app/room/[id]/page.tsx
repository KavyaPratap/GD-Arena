"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Seat, TimerArc, AiBadge, hueOf, layoutSeats, nameOf } from "@/components/table";
import { fmtClock } from "@/lib/lang";
import { loadConfig } from "@/lib/storage";
import { useRoom } from "@/lib/useRoom";
import type { PersonaId, RoomConfig, Turn } from "@/lib/types";

const PHASE_LABEL: Record<string, string> = {
  lobby: "Ready",
  opening: "Opening",
  prep: "Silent prep",
  watch: "Fishbowl",
  discussion: "Live",
  closing: "Closing round",
  ended: "Done",
};

function RoomPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [cfg, setCfg] = useState<RoomConfig | null | undefined>(undefined);
  useEffect(() => setCfg(loadConfig(id)), [id]);

  if (cfg === undefined) return <div className="empty">Loading room…</div>;
  if (cfg === null)
    return (
      <div className="empty">
        <h1>Room not found</h1>
        <p style={{ margin: "12px 0 24px" }}>This room was created in another browser or has been cleared.</p>
        <Link className="btn btn-primary" href="/setup">
          Build a new room
        </Link>
      </div>
    );
  return <Room cfg={cfg} onEnded={() => router.replace(`/report/${cfg.id}`)} />;
}

export default function RoomPage() {
  return (
    <Suspense fallback={<div className="empty">Loading room…</div>}>
      <RoomPageInner />
    </Suspense>
  );
}

function Room({ cfg, onEnded }: { cfg: RoomConfig; onEnded: () => void }) {
  const { snap, engine } = useRoom(cfg);
  const [typed, setTyped] = useState("");
  const [drawer, setDrawer] = useState(true);
  const [tab, setTab] = useState<"transcript" | "notes">("transcript");
  const [notes, setNotes] = useState("");
  const [capSize, setCapSize] = useState<"small" | "normal" | "large">("normal");
  const [highContrast, setHighContrast] = useState(false);
  const [patience, setPatience] = useState(cfg.patienceMs);
  const txRef = useRef<HTMLDivElement>(null);

  const seats = useMemo(() => layoutSeats(cfg.panel.length), [cfg.panel.length]);

  useEffect(() => {
    if (snap?.phase === "ended") {
      const t = setTimeout(onEnded, 900);
      return () => clearTimeout(t);
    }
  }, [snap?.phase, onEnded]);

  useEffect(() => {
    txRef.current?.scrollTo({ top: txRef.current.scrollHeight, behavior: "smooth" });
  }, [snap?.turns.length, tab]);

  if (!snap) return <div className="empty">Preparing the room…</div>;

  const e = engine.current;
  const { phase, health, floor } = snap;
  const lastTurn: Turn | undefined = snap.turns[snap.turns.length - 1];
  const speakingId = floor.kind === "ai" || floor.kind === "moderator" ? floor.id : undefined;
  const studentTalking = floor.kind === "student" || snap.studentSpeaking;

  // timer
  let frac = 1;
  let time = fmtClock(cfg.durationSec);
  if (phase === "prep") {
    frac = snap.prepLeft / 30;
    time = fmtClock(snap.prepLeft);
  } else if (phase === "discussion") {
    frac = snap.discussionLeft / cfg.durationSec;
    time = fmtClock(snap.discussionLeft);
  } else if (phase === "closing") {
    frac = snap.studentClosing ? snap.closingLeft / 25 : 0;
    time = snap.studentClosing ? fmtClock(snap.closingLeft) : "00:00";
  }

  const justCut = (id: PersonaId | "moderator") => {
    const t = [...snap.turns].reverse().find((x) => x.speaker === id);
    return !!t?.interruptedAt && snap.elapsed - t.interruptedAt < 1.2;
  };

  // captions
  let capWho: string | null = null;
  let capHue = 250;
  let capText: React.ReactNode = null;
  if (speakingId && lastTurn && lastTurn.speaker === speakingId) {
    capWho = nameOf(speakingId);
    capHue = hueOf(speakingId);
    capText = lastTurn.text;
  } else if (studentTalking && snap.liveCaption) {
    capWho = "You";
    capHue = 262;
    capText = <span className="interim">{snap.liveCaption}</span>;
  } else if (studentTalking) {
    capWho = "You";
    capHue = 262;
    capText = <span className="idle">Listening to you…{health.stt === "unsupported" ? " (captions unavailable in this browser: type below)" : ""}</span>;
  } else if (phase === "prep") {
    capText = <span className="idle">Silent prep. Use the notes tab to jot down one stance and one reason. The floor opens when the timer ends.</span>;
  } else if (phase === "discussion") {
    capText = <span className="idle">The floor is open. Speak when you are ready, or type below.</span>;
  } else if (phase === "watch") {
    capText = <span className="idle">Fishbowl: watch how the panel exchanges points. Join the circle when you are ready.</span>;
  } else if (phase === "closing" && snap.studentClosing) {
    capWho = "Your closing statement";
    capText = <span className="idle">Conclude in about 20 seconds: your stance, your strongest reason, what the group agreed on.</span>;
  } else if (phase === "opening") {
    capText = <span className="idle">Mr. Iyer is opening the discussion…</span>;
  }
  const whisper = phase === "watch" && lastTurn?.whisper ? lastTurn.whisper : null;

  const micBad = health.mic === "denied" || health.mic === "unavailable";
  const canType = (phase === "discussion" && !!e) || (phase === "closing" && snap.studentClosing);

  const submit = () => {
    if (!typed.trim()) return;
    e?.submitText(typed);
    setTyped("");
  };

  return (
    <div className={`room ${highContrast ? "hc" : ""}`}>
      <header className="topbar">
        <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
          <Link href="/" className="logo" aria-label="GD Arena home">
            <span className="logo-mark" aria-hidden />
          </Link>
          <div className="t-topic" title={cfg.topic}>
            {cfg.topic}
          </div>
        </div>
        <div className="right">
          <span className="pill human" title="Every participant except you is an AI">
            ◆ You are the only human
          </span>
          <span className="pill" id="lang-pill" title="Detected from how you speak">
            🌐 {snap.detectedLang === "hinglish" ? "Hinglish" : "English"}
            {cfg.language === "auto" ? " · auto" : ""}
          </span>
          <span className={`pill ${health.net === "offline" ? "bad" : micBad ? "warn" : ""}`} id="health-pill">
            <i />
            {health.net === "offline" ? "Offline" : micBad ? "Typing mode" : "Live"}
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => setDrawer((d) => !d)} id="toggle-drawer">
            {drawer ? "Hide" : "Show"} panel
          </button>
          <button className="btn btn-sm btn-danger" id="end-session" onClick={() => e?.endNow()}>
            End
          </button>
        </div>
      </header>

      <div className="stage">
        <div className="stage-main">
          {health.net === "offline" ? (
            <div className="banner" role="alert">
              Connection lost. The session is paused and your transcript is safe. It resumes automatically when you are back online.
            </div>
          ) : micBad ? (
            <div className="banner info" role="status">
              {health.mic === "denied"
                ? "Microphone is blocked, so you are in typing mode. The panel still speaks out loud. Allow the mic in your browser's site settings to talk."
                : "No microphone was found, so you are in typing mode. The panel still speaks out loud."}
            </div>
          ) : health.stt === "unsupported" && phase !== "lobby" ? (
            <div className="banner info" role="status">
              Live captions of your voice need Chrome or Edge. You can still talk, and you can type your replies below.
            </div>
          ) : health.tts === "unsupported" ? (
            <div className="banner info" role="status">
              Voice playback is unavailable in this browser. Read the panel&apos;s lines in the captions.
            </div>
          ) : null}

          {snap.nudge ? (
            <div className="toast" role="status" aria-live="polite" key={snap.nudge.id}>
              {snap.nudge.text}
            </div>
          ) : null}

          <div className="table-area">
            <div className="table-wrap">
              <div className="table-surface">
                <div className="table-center">
                  <div>
                    <TimerArc frac={frac} time={time} phase={PHASE_LABEL[phase]} />
                  </div>
                </div>
              </div>
              {seats.map((s) => {
                if (s.id === "student")
                  return <Seat key="student" id="student" x={s.x} y={s.y} speaking={studentTalking} level={snap.micLevel} />;
                if (s.id === "moderator")
                  return <Seat key="mod" id="moderator" x={s.x} y={s.y} speaking={speakingId === "moderator"} cut={justCut("moderator")} />;
                const pid = cfg.panel[s.id as number];
                return (
                  <Seat
                    key={pid}
                    id={pid}
                    x={s.x}
                    y={s.y}
                    speaking={speakingId === pid}
                    bid={snap.bids[pid] ?? 0}
                    cut={justCut(pid)}
                  />
                );
              })}
            </div>
          </div>

          {cfg.captions ? (
            <div className={`captions ${capSize === "normal" ? "" : capSize}`} style={{ "--h": capHue } as CSSProperties} aria-live="polite" id="captions">
              {capWho ? <span className="who">{capWho}</span> : null}
              {capText}
              {whisper ? <div className="whisper tline" style={{ marginTop: 10, textAlign: "left" }}><span className="whisper" style={{ margin: 0 }}>Coach whisper: {whisper}</span></div> : null}
            </div>
          ) : (
            <div style={{ height: 20 }} />
          )}
        </div>

        <aside className={`drawer ${drawer ? "open" : ""}`} style={drawer ? undefined : { display: "none" }} aria-label="Transcript and notes">
          <div className="row" style={{ padding: "14px 14px 0" }}>
            <button className="chip" aria-pressed={tab === "transcript"} onClick={() => setTab("transcript")} id="tab-transcript">
              Transcript
            </button>
            <button className="chip" aria-pressed={tab === "notes"} onClick={() => setTab("notes")} id="tab-notes">
              Notes
            </button>
          </div>
          {tab === "transcript" ? (
            <div className="transcript" ref={txRef} id="transcript" style={{ paddingTop: 12 }}>
              {snap.turns.length === 0 ? <p className="idle" style={{ color: "var(--faint)", fontSize: 14 }}>The transcript appears here as the discussion happens.</p> : null}
              {snap.turns.map((t) => (
                <div className="tline" key={t.id} style={{ "--h": hueOf(t.speaker) } as CSSProperties}>
                  <div className="meta">
                    <span>
                      {nameOf(t.speaker)} {t.speaker !== "student" ? "· AI" : t.typed ? "· typed" : ""}
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
              {snap.liveCaption && studentTalking ? (
                <div className="tline" style={{ "--h": 262, opacity: 0.6 } as CSSProperties}>
                  <div className="meta">
                    <span>You</span>
                    <time>live</time>
                  </div>
                  {snap.liveCaption}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ padding: 14, flex: 1, display: "flex" }}>
              <textarea
                className="textarea"
                style={{ margin: 0, flex: 1, resize: "none" }}
                placeholder="Private notes. Stance, reason, one example, one number…"
                value={notes}
                onChange={(ev) => setNotes(ev.target.value)}
                aria-label="Private notes"
                id="notes"
              />
            </div>
          )}
        </aside>
      </div>

      <footer className="controls">
        <div className="meter" aria-label="Microphone level">
          <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 28 }}>Mic</span>
          <div className="bar" style={{ "--lvl": snap.micLevel, "--thr": Math.min(1, snap.threshold * 9) } as CSSProperties}>
            <span />
            <em />
          </div>
        </div>

        <div className="typebox">
          <input
            className="input"
            id="type-input"
            placeholder={canType ? "Type your reply and press Enter…" : "Typing opens when the floor is yours"}
            value={typed}
            disabled={!canType}
            onChange={(ev) => setTyped(ev.target.value)}
            onKeyDown={(ev) => ev.key === "Enter" && submit()}
            aria-label="Type a reply"
          />
          <button className="btn btn-sm" onClick={submit} disabled={!canType || !typed.trim()} id="send-typed">
            Send
          </button>
        </div>

        <div className="patience">
          <label htmlFor="live-patience">AI patience: {(patience / 1000).toFixed(1)}s</label>
          <input
            id="live-patience"
            type="range"
            min={500}
            max={3000}
            step={100}
            value={patience}
            onChange={(ev) => {
              const v = Number(ev.target.value);
              setPatience(v);
              e?.setPatience(v);
            }}
          />
        </div>

        <div className="row" style={{ gap: 6 }}>
          <button className="chip" onClick={() => setCapSize((s) => (s === "small" ? "normal" : s === "normal" ? "large" : "small"))} aria-label="Change caption size" id="cap-size">
            Aa {capSize}
          </button>
          <button className="chip" aria-pressed={highContrast} onClick={() => setHighContrast((v) => !v)} id="contrast">
            Contrast
          </button>
          {phase === "prep" ? (
            <button className="btn btn-sm" onClick={() => e?.skipPrep()} id="skip-prep">
              Skip prep
            </button>
          ) : null}
          {phase === "discussion" ? (
            <button className="btn btn-sm" onClick={() => e?.skipToClosing()} id="skip-closing">
              Go to closing round
            </button>
          ) : null}
          {phase === "watch" ? (
            <button className="btn btn-sm btn-primary" disabled={!snap.watchDone} onClick={() => void e?.joinCircle()} id="join-circle">
              {snap.watchDone ? "Join the circle →" : "Watching…"}
            </button>
          ) : null}
        </div>
      </footer>

      {phase === "lobby" ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="lobby-title">
          <div className="glass lobby-card">
            <span className="eyebrow">Mic check</span>
            <h2 id="lobby-title" style={{ marginTop: 8 }}>
              Take your seat
            </h2>
            <p>{cfg.topic}</p>
            <div className="meter" aria-label="Microphone level">
              <div className="bar" style={{ "--lvl": snap.micLevel, "--thr": Math.min(1, snap.threshold * 9) } as CSSProperties}>
                <span />
                <em />
              </div>
            </div>
            <p style={{ fontSize: 13, color: "var(--faint)" }} id="mic-state">
              {health.mic === "ok"
                ? "Say something. The bar should move past the orange line."
                : health.mic === "denied"
                  ? "Microphone blocked. You can still play in typing mode."
                  : health.mic === "unavailable"
                    ? "No microphone found. You can still play in typing mode."
                    : "Waiting for microphone permission…"}
            </p>
            <ul className="lobby-list">
              <li>
                <b className="ok">◆</b>
                <span>
                  <b>The other participants are AI.</b> You are the only human. Mr. Iyer will say so again when he opens.
                </span>
              </li>
              <li>
                <b className="ok">◆</b>
                <span>Use headphones if you can. Otherwise the AI voices leak into your mic.</span>
              </li>
              <li>
                <b className="ok">◆</b>
                <span>Speak over an AI to interrupt it. It stops mid-sentence.</span>
              </li>
              <li>
                <b className={health.stt === "unsupported" ? "warn-text" : "ok"}>◆</b>
                <span>Live captions use your browser&apos;s speech recognition (Chrome or Edge works best).</span>
              </li>
            </ul>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn btn-primary btn-lg" id="join-room" onClick={() => void e?.begin()}>
                {health.mic === "ok" ? "Join the circle →" : "Continue in typing mode →"}
              </button>
              <Link className="btn btn-lg btn-ghost" href="/setup">
                Back
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {phase === "ended" ? (
        <div className="overlay">
          <div className="glass lobby-card">
            <h2>Discussion over</h2>
            <p style={{ margin: "10px 0 6px" }}>
              <AiBadge label="Analyst" /> is reading the transcript…
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
