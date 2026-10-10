import Link from "next/link";
import type { CSSProperties } from "react";
import { Nav } from "@/components/nav";
import { HeroTable } from "@/components/hero-table";
import { Avatar } from "@/components/table";
import { PERSONAS } from "@/lib/personas";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <section className="container hero" aria-labelledby="hero-title">
          <div>
            <span className="eyebrow">Voice-first GD practice · English + Hinglish</span>
            <h1 id="hero-title">
              Walk into your first GD already having <span className="grad-text">survived ten.</span>
            </h1>
            <p className="lead">
              A live round table with AI participants who interrupt, rebut each other and wait for pauses like real people. Afterwards you get
              honest feedback where every point links to the exact quote that earned it.
            </p>
            <div className="hero-cta">
              <Link href="/setup" className="btn btn-primary btn-lg" id="hero-enter">
                Enter the Arena →
              </Link>
              <Link href="/report/demo" className="btn btn-lg" id="hero-sample">
                See a sample report
              </Link>
            </div>
            <div className="hero-pills">
              <span className="chip">◆ Every other seat is clearly an AI</span>
              <span className="chip">Hindi / English auto-detect</span>
              <span className="chip">Barge-in: interrupt them mid-sentence</span>
            </div>
          </div>
          <HeroTable />
        </section>

        <section className="container section" aria-labelledby="how-title">
          <div className="section-head">
            <span className="eyebrow">How a session works</span>
            <h2 id="how-title">Structured like the real thing</h2>
            <p>Moderator, silent prep, timed discussion and a closing round. Nothing about it is a chatbot with a microphone.</p>
          </div>
          <div className="steps">
            {[
              ["Set the room", "Pick a topic or write your own, choose 3 to 5 AI participants, and decide how patient or brutal the panel should be."],
              ["Prep in silence", "Mr. Iyer opens the discussion and discloses the AI panel. You get 30 seconds to think, as in a real GD."],
              ["Hold your ground", "They wait for pauses, reply to each other, and stop when you cut in. Quiet nudges appear only on your screen."],
              ["Read the receipts", "Airtime, delivery and six rubric points, each tied to a quoted moment. Then replay what you could have said."],
            ].map(([t, d], i) => (
              <article className="glass step" key={t}>
                <div className="n">0{i + 1}</div>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="container section" aria-labelledby="panel-title">
          <div className="section-head">
            <span className="eyebrow">The panel</span>
            <h2 id="panel-title">Six personalities. Six agendas.</h2>
            <p>Each participant has its own instructions, its own voice and a private goal, so the room never collapses into one polite chatbot.</p>
          </div>
          <div className="persona-grid">
            {PERSONAS.map((p) => (
              <article className="glass persona-card" key={p.id} style={{ "--h": p.hue } as CSSProperties}>
                <Avatar id={p.id} size={58} />
                <div>
                  <h3>{p.name}</h3>
                  <div className="role">{p.role}</div>
                  <p>{p.tagline}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="container section" aria-labelledby="receipts-title">
          <div className="receipts">
            <div>
              <span className="eyebrow">Honest feedback</span>
              <div className="section-head" style={{ margin: 0 }}>
                <h2 id="receipts-title">No quote, no claim.</h2>
                <p>Most tools say “improve your listening.” GD Arena shows you the sentence where you stopped listening.</p>
              </div>
              <ul className="feature-list">
                <li>
                  <span>
                    <b>Verbatim evidence.</b> Every feedback point is machine-checked against the transcript before it is shown.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Ghost Replay.</b> A timeline of missed openings with the 15-second answer you could have given.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Silent nudges.</b> “You haven&apos;t spoken for 3:00.” Visible to you, inaudible to the room.
                  </span>
                </li>
              </ul>
            </div>
            <div className="glass card" style={{ margin: 0 }}>
              <div className="fb-head">
                <h3>Building on others</h3>
                <span className="score weak">3.2</span>
              </div>
              <p className="sum">1 of 5 of your turns explicitly referenced another participant.</p>
              <div className="quote" style={{ "--h": 190 } as CSSProperties}>
                <div className="q-meta">
                  Ananya · 02:21 <span className="ver">✓ verbatim match</span>
                </div>
                <q>Interesting claim: you said flexibility is the upside. Do you have a figure or a source for that?</q>
              </div>
              <div className="quote" style={{ "--h": 262 } as CSSProperties}>
                <div className="q-meta">
                  You · 02:44 <span className="ver">✓ verbatim match</span>
                </div>
                <q>Not exactly, but I read that most delivery partners work more than ten hours.</q>
              </div>
              <div className="try">Try this: “Building on Ananya&apos;s point about earnings variance, I&apos;d add…”</div>
            </div>
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="container">
          GD Arena · Every participant except you is an AI, and the app tells you so at every step. Built for campus placement practice.
        </div>
      </footer>
    </>
  );
}
