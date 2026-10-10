"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";
import { Avatar, AiBadge } from "@/components/table";
import { FORMATS, GOALS, TOPICS } from "@/lib/topics";
import { DEFAULT_CAST, PERSONAS, PERSONA_BY_ID } from "@/lib/personas";
import { newRoomId, saveConfig } from "@/lib/storage";
import type { GDFormat, Interruption, LangSetting, NudgeLevel, PersonaId, RoomConfig } from "@/lib/types";

const DURATIONS = [3, 5, 8, 10];
const LANGS: { id: LangSetting; label: string; hint: string }[] = [
  { id: "auto", label: "Auto-detect", hint: "English or Hinglish, matched to how you speak" },
  { id: "en", label: "English only", hint: "" },
  { id: "hinglish", label: "Hinglish", hint: "" },
];

export default function SetupPage() {
  const router = useRouter();
  const [format, setFormat] = useState<GDFormat>("abstract");
  const [topicId, setTopicId] = useState<string>("zero");
  const [custom, setCustom] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [brief, setBrief] = useState("");
  const [cast, setCast] = useState<PersonaId[]>(DEFAULT_CAST.slice(0, 4));
  const [mins, setMins] = useState(5);
  const [language, setLanguage] = useState<LangSetting>("auto");
  const [patience, setPatience] = useState(900);
  const [interruption, setInterruption] = useState<Interruption>("real");
  const [nudges, setNudges] = useState<NudgeLevel>("light");
  const [captions, setCaptions] = useState(true);
  const [fishbowl, setFishbowl] = useState(false);
  const [camera, setCamera] = useState(false);
  const [goal, setGoal] = useState(GOALS[1]);
  const [consent, setConsent] = useState(false);

  const topics = useMemo(() => TOPICS.filter((t) => t.format === format), [format]);
  const picked = TOPICS.find((t) => t.id === topicId);
  const topicText = useCustom ? custom.trim() : (picked?.title ?? "");
  const valid = topicText.length >= 6 && consent;

  const setSize = (n: number) => {
    setCast((prev) => {
      if (n <= prev.length) return prev.slice(0, n);
      const extra = DEFAULT_CAST.filter((p) => !prev.includes(p)).slice(0, n - prev.length);
      return [...prev, ...extra];
    });
  };
  const toggleCast = (id: PersonaId) => {
    setCast((prev) => {
      if (prev.includes(id)) return prev.length > 3 ? prev.filter((p) => p !== id) : prev;
      return prev.length >= 5 ? [...prev.slice(1), id] : [...prev, id];
    });
  };

  const start = () => {
    if (!valid) return;
    const cfg: RoomConfig = {
      id: newRoomId(),
      topic: topicText,
      topicId: useCustom ? undefined : topicId,
      format,
      caseBrief: useCustom ? brief.trim() || undefined : picked?.brief,
      fishbowl,
      panel: cast,
      durationSec: mins * 60,
      language,
      patienceMs: patience,
      interruption,
      nudges,
      captions,
      camera,
      goal,
      createdAt: Date.now(),
    };
    saveConfig(cfg);
    router.push(`/room/${cfg.id}`);
  };

  return (
    <>
      <Nav cta={false} />
      <main className="container page-pad">
        <div className="page-title">
          <span className="eyebrow">Step 1 · Set up the room</span>
          <h1>Build your panel</h1>
          <p>Choose what you will discuss, who you will face and how hard they push. Everything here is adjustable later in the room.</p>
        </div>

        <div className="setup-grid">
          <div>
            <section className="glass panel" aria-labelledby="s-topic">
              <h2 id="s-topic">
                <span className="num">1</span> Topic
              </h2>
              <p className="sub">Pick a format, choose a topic, or write your own.</p>
              <div className="row" role="tablist" aria-label="GD format">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    className="chip"
                    role="tab"
                    id={`format-${f.id}`}
                    aria-selected={format === f.id}
                    onClick={() => {
                      setFormat(f.id);
                      setUseCustom(false);
                      const first = TOPICS.find((t) => t.format === f.id);
                      if (first) setTopicId(first.id);
                    }}
                    title={f.blurb}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="topic-grid">
                {topics.map((t) => (
                  <button
                    key={t.id}
                    className="topic-card"
                    id={`topic-${t.id}`}
                    aria-pressed={!useCustom && topicId === t.id}
                    onClick={() => {
                      setTopicId(t.id);
                      setUseCustom(false);
                    }}
                  >
                    <b>{t.title}</b>
                    <span>{t.hook}</span>
                  </button>
                ))}
              </div>
              {!useCustom && picked?.brief ? (
                <div className="brief">
                  <b>Case facts: </b>
                  {picked.brief}
                </div>
              ) : null}

              <div className="field-label" id="custom-label">
                Or write your own topic
              </div>
              <input
                className={`input custom-topic ${useCustom ? "active" : ""}`}
                id="custom-topic"
                placeholder="e.g. Should colleges make attendance optional?"
                value={custom}
                maxLength={160}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setUseCustom(e.target.value.trim().length > 0);
                }}
                onFocus={() => custom.trim() && setUseCustom(true)}
                aria-labelledby="custom-label"
                style={{ marginTop: 6 }}
              />
              {useCustom ? (
                <>
                  <textarea
                    className="textarea"
                    placeholder="Optional: add case facts the panel should know (numbers, constraints, stakeholders)."
                    rows={3}
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    aria-label="Optional case facts"
                  />
                  <p className="sub" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
                    Using your custom topic. Pick a card above to switch back.
                  </p>
                </>
              ) : null}
            </section>

            <section className="glass panel" aria-labelledby="s-panel">
              <h2 id="s-panel">
                <span className="num">2</span> Panel
              </h2>
              <p className="sub">3 to 5 AI participants plus the moderator. Tap a card to swap someone in or out.</p>
              <div className="slider-row" style={{ marginTop: 0 }}>
                <label htmlFor="panel-size">
                  <span>Panel size</span>
                  <b>{cast.length} AI participants + moderator</b>
                </label>
                <input id="panel-size" type="range" min={3} max={5} value={cast.length} onChange={(e) => setSize(Number(e.target.value))} />
              </div>
              <div className="cast-grid">
                {PERSONAS.map((p) => (
                  <button
                    key={p.id}
                    className="cast-card"
                    id={`cast-${p.id}`}
                    aria-pressed={cast.includes(p.id)}
                    onClick={() => toggleCast(p.id)}
                    style={{ "--h": p.hue } as CSSProperties}
                  >
                    <Avatar id={p.id} size={44} />
                    <div>
                      <b>{p.name}</b>
                      <span>{p.role}</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="soon">
                ◌ Friends joining the same room (AI fills the empty seats): arriving in Stage 6.
              </div>
            </section>

            <section className="glass panel" aria-labelledby="s-rules">
              <h2 id="s-rules">
                <span className="num">3</span> Rules of the room
              </h2>
              <p className="sub">Real GDs differ. Tune the pressure to where you are right now.</p>

              <div className="field-label">Length</div>
              <div className="row">
                {DURATIONS.map((d) => (
                  <button key={d} className="chip" id={`dur-${d}`} aria-pressed={mins === d} onClick={() => setMins(d)}>
                    {d} min
                  </button>
                ))}
              </div>

              <div className="field-label">Language</div>
              <div className="row">
                {LANGS.map((l) => (
                  <button key={l.id} className="chip" id={`lang-${l.id}`} aria-pressed={language === l.id} onClick={() => setLanguage(l.id)}>
                    {l.label}
                  </button>
                ))}
              </div>
              <p className="sub" style={{ marginTop: 10, marginBottom: 0 }}>
                {language === "auto"
                  ? "The panel starts in English and switches to Hinglish the moment you do, and back."
                  : language === "hinglish"
                    ? "The whole panel speaks Hinglish from the start."
                    : "The panel stays in English."}
              </p>

              <div className="field-label">Interruptions</div>
              <div className="row">
                {(["calm", "real", "brutal"] as Interruption[]).map((i) => (
                  <button key={i} className="chip" id={`int-${i}`} aria-pressed={interruption === i} onClick={() => setInterruption(i)}>
                    {i === "calm" ? "Calm" : i === "real" ? "Realistic" : "Brutal"}
                  </button>
                ))}
              </div>

              <div className="slider-row">
                <label htmlFor="patience">
                  <span>Patience before the AI speaks (accessibility)</span>
                  <b>{(patience / 1000).toFixed(1)} s</b>
                </label>
                <input id="patience" type="range" min={500} max={3000} step={100} value={patience} onChange={(e) => setPatience(Number(e.target.value))} />
              </div>

              <div className="field-label">Silent nudges</div>
              <div className="row">
                {(["off", "light", "full"] as NudgeLevel[]).map((n) => (
                  <button key={n} className="chip" id={`nudge-${n}`} aria-pressed={nudges === n} onClick={() => setNudges(n)}>
                    {n === "off" ? "Off" : n === "light" ? "Light" : "Full coach"}
                  </button>
                ))}
              </div>

              <div className="field-label">Format extras</div>
              <div className="row">
                <button className="chip" id="toggle-fishbowl" aria-pressed={fishbowl} onClick={() => setFishbowl((v) => !v)}>
                  🐟 Fishbowl: watch first, then join
                </button>
                <button className="chip" id="toggle-captions" aria-pressed={captions} onClick={() => setCaptions((v) => !v)}>
                  Live captions
                </button>
                <button className="chip" id="toggle-camera" aria-pressed={camera} onClick={() => setCamera((v) => !v)} title="Eye contact, expression and posture, analysed on your device">
                  📷 Body-language coach (camera)
                </button>
              </div>
              {camera ? (
                <p className="sub" style={{ marginTop: 10, marginBottom: 0 }}>
                  Uses your camera to coach eye contact, expression, posture and gestures. Everything is analysed in your browser: no video or image is uploaded or stored, only summary numbers.
                </p>
              ) : null}

              <div className="field-label">What do you want to work on?</div>
              <div className="row">
                {GOALS.map((g) => (
                  <button key={g} className="chip" aria-pressed={goal === g} onClick={() => setGoal(g)}>
                    {g}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <aside className="glass summary" aria-label="Room summary">
            <h3>Your room</h3>
            <div className="sum-row">
              <span>Topic</span>
              <span>{topicText || "Choose a topic"}</span>
            </div>
            <div className="sum-row">
              <span>Panel</span>
              <span>{cast.map((id) => PERSONA_BY_ID[id].name).join(", ")}</span>
            </div>
            <div className="sum-row">
              <span>Moderator</span>
              <span>
                Mr. Iyer <AiBadge />
              </span>
            </div>
            <div className="sum-row">
              <span>Length</span>
              <span>{mins} min + closing round</span>
            </div>
            <div className="sum-row">
              <span>Language</span>
              <span>{language === "auto" ? "Auto-detect" : language === "en" ? "English" : "Hinglish"}</span>
            </div>
            <div className="sum-row">
              <span>Pressure</span>
              <span>
                {interruption}, {(patience / 1000).toFixed(1)}s patience
              </span>
            </div>
            <div className="sum-row">
              <span>Format</span>
              <span>{fishbowl ? "Fishbowl" : "Direct join"}</span>
            </div>
            <div className="sum-row">
              <span>Camera coach</span>
              <span>{camera ? "On (private, on-device)" : "Off"}</span>
            </div>
            <label className="consent">
              <input id="consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                <b>I understand every other participant is an AI.</b> I am the only human in this room. My microphone is used only for this session.
                {camera ? " My camera is analysed on this device only; no video is uploaded or saved." : ""}
              </span>
            </label>
            <button className="btn btn-primary btn-lg" style={{ width: "100%" }} id="start-room" disabled={!valid} onClick={start}>
              Take your seat →
            </button>
            {!valid ? (
              <p className="sub" style={{ marginTop: 10, marginBottom: 0, fontSize: 13 }}>
                {topicText.length < 6 ? "Choose or write a topic. " : ""}
                {!consent ? "Confirm the AI disclosure to continue." : ""}
              </p>
            ) : null}
          </aside>
        </div>
      </main>
    </>
  );
}
