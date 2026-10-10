# GD Arena — The Flight Simulator for Group Discussions

> **A voice-first group discussion practice room with autonomous AI participants, natural turn-taking, English + Hinglish auto-detect, and honest feedback with verbatim receipts.**

Built for **Problem Statement 2: GD Arena** (Campus Placement GD Simulator).

---

## 🎯 The Core Philosophy: Realism Over Chatbots

Most AI GD tools make a critical mistake: they treat the session as a sequential chatbot loop (`mic → STT → LLM → TTS`). That is a voice assistant, **not a group discussion**.

In a real GD:
- Participants talk **to each other**, not just to the student.
- People have **distinct agendas and habits** (the dominator, the data-driven skeptic, the quiet thinker, the anecdotal drifter).
- Turn-taking has **friction**: people raise their hand, gauge pauses, interrupt, and stop mid-word when cut off.
- The student needs **honest feedback with proof**: every claim must link to a quoted moment in the transcript.

---

## 🏗️ Architecture & Model Stack

```
   ┌──────────────────────────────────────────────────────────────┐
   │                    BROWSER (Next.js 16)                     │
   │  ┌──────────────┐   ┌───────────────┐   ┌────────────────┐   │
   │  │ Round Table  │   │  Silero VAD   │   │ Live Captions  │   │
   │  │  Intent/Orb  │   │ Level Meter   │   │  Notes / HUD   │   │
   │  └───────┬──────┘   └───────┬───────┘   └────────┬───────┘   │
   └──────────┼──────────────────┼────────────────────┼───────────┘
              │                  │                    │
              ▼                  ▼                    ▼
   ┌──────────────────────────────────────────────────────────────┐
   │         REALTIME FLOOR CONTROLLER ("Director Engine")        │
   │  • Floor State: FLOOR_STUDENT | FLOOR_AI | OPEN_FLOOR | MOD  │
   │  • Adaptive Endpointing (patience slider + semantic bounds)  │
   │  • Intent Bids (urgency calculation per persona)             │
   │  • Instant Barge-in (truncates AI text to heard audio)       │
   │  • Code-Switching Engine (English ↔ Hinglish auto-detect)    │
   └─────────────────────────────┬────────────────────────────────┘
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
┌──────────────────────────────┐          ┌──────────────────────────────┐
│       GEMINI AI SUITE        │          │    EVIDENCE-LINKED REPORT    │
│ • gemini-3.8-flash (Persona) │          │ • Airtime Donut & Delivery   │
│ • gemini-3.5-flash-lite (Dir)│          │ • 6-Point Placement Rubric   │
│ • gemini-3.5-transcribe-live │          │ • Machine-Verified Quotes    │
│ • gemini-3.8-flash-tts       │          │ • Ghost Replay ("What you   │
│ • gemini-3.8-live (Mod)      │          │   could have said" Spoken)   │
└──────────────────────────────┘          └──────────────────────────────┘
```

### 🧠 Model Selection & Registry (`src/lib/models.ts`)

| Role | Primary Model | Fallback | Purpose |
|---|---|---|---|
| **Persona Agent** | `gemini-3.8-flash` | `gemini-3.5-flash` | Character role-play, streaming tokens with `low` thinking latency. |
| **Director Engine** | `gemini-3.5-flash-lite` | `gemini-3.1-flash-lite` | Instant turn arbiter: computes who speaks next in ~200ms. |
| **Streaming STT** | `gemini-3.5-transcribe-live` | `gemini-3.5-transcribe` | Real-time code-switching between English and Hindi. |
| **Voice Synthesis** | `gemini-3.8-flash-tts` | `gemini-3.8-flash-lite-tts` | High-fidelity multi-speaker voices (Charon, Fenrir, Kore, Aoede, Puck, Orus, Leda). |
| **Live Moderator** | `gemini-3.8-live` | `gemini-3.1-flash-live` | Native audio bidirectional streaming for Mr. Iyer & Fishbowl commentary. |
| **Analyst / Report** | `gemini-3.8-flash` | `gemini-3.1-pro-preview` | Structured JSON generation for rubric scoring and Ghost Replay lines. |
| **Topic Embeddings**| `gemini-embedding-2` | `gemini-embedding-001` | Cross-session habit tracking and student rating progression. |

---

## 👥 The Panel & Personalities

Every participant has their own prompt vector, urgency, interruption propensity, and voice:

| Participant | Role | Behavioral Signature | Persona Agenda |
|---|---|---|---|
| **Mr. Iyer** | Moderator | Neutral, authoritative | Enforces time, opens prep, calls on quiet members, redirects tangents. |
| **Vikram** | The Dominator | High urgency (0.9), cuts in | Holds the floor; steamrolls weak points; respects only evidence. |
| **Ananya** | The Data Nerd | Stat-obsessed, crisp | Cites statistics; demands proof for claims; concedes to verified numbers. |
| **Meera** | The Quiet One | Low urgency (0.2), rises over time | Speaks rarely; yields the deepest insight; draws out quiet members. |
| **Rohan** | The Drifter | Anecdotal, friendly | Drifts into relatable stories until the moderator pulls the room back. |
| **Kabir** | Devil's Advocate | Sharp, probing | Opposes the last speaker to test whether the student can defend their stance. |
| **Sana** | Consensus Builder | Diplomatic, structured | Models "building on others" by bridging contradictory arguments. |

---

## 🚦 Roadmap & Stage Progress

### ✅ Stage 1: Complete Frontend & Turn-Taking Simulation Engine *(COMPLETED)*
- **Interactive Round Table UI**: Radial seating, persona avatars with **intent rings** (fills as desire to speak rises) and dynamic voice rings.
- **Microphone Check & Calibration**: Auto-measures room ambient noise floor to set dynamic VAD sensitivity.
- **Adaptive Turn-Taking Engine (`RoomEngine`)**:
  - Live state machine: `lobby` → `opening` → `prep (30s)` → `discussion` → `closing` → `ended`.
  - Student **barge-in**: interrupts AI speech immediately, truncates the AI's transcript to what was heard.
  - No pile-ups: strict floor ownership token.
  - Multi-lingual auto-detection: detects English vs. Hinglish utterances on the fly.
  - Silent nudges (HUD toast): unobtrusively notifies "You haven't spoken in 3:00", airtime warnings, and filler word alerts.
  - Fallback typing mode: students with blocked mics can still join and type replies while AI speaks out loud.
  - Fishbowl mode: watch AI exchange points with coach whispers, then join the circle.
- **Evidence-Linked Report System**:
  - Overall Arena Score dial (0–100).
  - Airtime distribution (Donut chart & comparative bar graphs).
  - Delivery analytics: WPM, filler frequency, average turn duration, longest silence.
  - 6 placement rubric points: Starting discussion, Quality of ideas, Building on others, Listening, Handling interruptions, Ending strongly.
  - **The Evidence Guarantee**: Every feedback point carries a quote and a machine-validated `✓ verbatim match` tag. Clicking a quote jumps to the exact moment in the transcript.
  - **Ghost Replay**: Visual timeline of missed openings with spoken counter-arguments.
- **Sample Report Playground**: Dedicated `/report/demo` route with fully formed session data for instant reviewer evaluation.

### ✅ Stage 2: Google Cloud & Vertex AI Realtime Engine *(COMPLETED)*
- **Vertex AI Client (`src/lib/vertex.ts`)**:
  - Multi-tier authentication: Google Application Default Credentials (ADC), Service Account key, and Google OAuth tokens.
  - Model fallback chain: `gemini-3.8-flash` → `gemini-2.5-flash` → `gemini-2.5-flash-lite`, So there's no api key involved and hence no leakage problem.
- **Live Persona Turn Generator (`/api/turn`)**:
  - Dynamically prompts Gemini with the selected persona's private agenda, role, traits (urgency, interruption index), and conversational memory.
  - Supports English and natural romanized Hinglish code-switching based on student language detection.
- **Studio-Grade Chirp 3 HD Speech (`/api/tts`)**:
  - Replaced legacy mechanical synthesizers with Google's flagship **Chirp 3 HD** neural voices (`en-IN-Chirp3-HD-*` and `hi-IN-Chirp3-HD-*`).
  - True human cadence with natural breathing, authentic Indian English & Hindi intonation, and emotional nuance.
  - Persona Voice Matrix:
    - **Mr. Iyer (Moderator)**: `Chirp3-HD-Charon` (Authoritative, measured, mature)
    - **Vikram (Dominator)**: `Chirp3-HD-Fenrir` (Assertive, confident, rapid-fire)
    - **Ananya (Framework Thinker)**: `Chirp3-HD-Kore` (Crisp, intellectual, structured)
    - **Meera (Quiet Synthesizer)**: `Chirp3-HD-Aoede` (Gentle, thoughtful, polite)
    - **Rohan (Storyteller)**: `Chirp3-HD-Puck` (Warm, conversational, charismatic)
    - **Kabir (Skeptic)**: `Chirp3-HD-Orus` (Sharp, analytical, contrarian)
    - **Sana (Diplomat)**: `Chirp3-HD-Leda` (Poised, consensus-builder)
  - In-flight fetch cancellation on student barge-in and in-memory audio caching for instant response.
- **AI Placement Analyst (`/api/report`)**:
  - Structured JSON evaluation endpoint evaluating student performance against 6 criteria with exact transcript quote extraction.
- **Resilient Fallback**: If an API call is delayed or offline, the client seamlessly falls back to the local simulation without UI interruption.

### 🔄 Stage 3: Deep Evidence Extraction & Persuadable Personas *(Next)*
- Persona dynamic stance matrix: AI participants shift their opinion when presented with real data and concrete logic.
- Cloud Storage audio slice player for one-click playback of student's spoken audio evidence clips.

### 🔄 Stage 4: Multi-Session Habit Tracking & Placement Readiness Rating
- Cross-session progress dashboard tracking Elo-like Arena Rating.
- Habit metrics: opening speed trends, filler word reduction, interruption resilience over time.

### 🔄 Stage 5: Multi-Human Room (Friends Joining)
- WebRTC / LiveKit room where 1–3 friends join, and AI participants fill the remaining seats.

---

## 🔑 Google Cloud & Firebase Authentication Setup

To authenticate your local environment, run these commands in your terminal:

```bash
# 1. Login with your Google Cloud account
gcloud auth login xxxxxxxxxxxxxxx@gmail.com

# 2. Set Application Default Credentials so Next.js can call Vertex AI & Cloud TTS
gcloud auth application-default login

# 3. Set the default project and quota project
gcloud config set project project-xxxxxx
gcloud auth application-default set-quota-project project-xxxxxx

# 4. Optional: Firebase CLI setup (for Firestore & Hosting)
npx firebase-tools login
npx firebase-tools use xxxxxxxxxxxx
```

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (Turbopack, App Router, TypeScript)
- **Styling**: Vanilla CSS Design System with dark glassmorphic round-table aesthetics, Outfit & Inter Google Fonts.
- **Audio Processing**: Web Audio API, AnalyserNode, AudioWorklet, browser SpeechRecognition & SpeechSynthesis fallback.
- **Cloud & AI (Google Cloud)**:
  - Gemini 3.8 Flash, Gemini 3.5 Flash-Lite, Gemini 3.5 Transcribe Live, Gemini 3.8 Flash TTS.
  - Firebase Hosting, Cloud Run (asia-south1), Cloud Storage.

---

## 🚀 Running Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run development server**:
   ```bash
   npm run dev
   ```

3. **Open the application**:
   - Landing page: [http://localhost:3000](http://localhost:3000)
   - Setup room: [http://localhost:3000/setup](http://localhost:3000/setup)
   - Sample report: [http://localhost:3000/report/demo](http://localhost:3000/report/demo)

4. **Run production build**:
   ```bash
   npm run build
   npm run start
   ```

---

## 🏆 Hackathon Alignment Checklist

- [x] **Set up a room**: Curated topic list across 4 formats (Abstract, Controversial, Current, Case-based) + custom topic, panel size 3–5 + moderator.
- [x] **Live spoken discussion**: Voice detection, speech recognition, live transcript, spoken AI replies.
- [x] **Natural turn-taking**: Intent rings, patience endpointing, barge-in cutoff, AI participants talking to each other.
- [x] **Structured GD**: Mr. Iyer opens, 30s prep, timed floor, 1-minute warning, formal closing round.
- [x] **Evidence-linked report**: Airtime breakdown, 6 GD skills, and every single feedback point backed by a verified quote.
- [x] **Distinct personalities**: 6 separate personas with behavioral vectors, private agendas, and distinct voices.
- [x] **Resilience**: Mic denied typing fallback, offline auto-pause, unsupported browser alerts.
- [x] **Clear AI disclosure**: Transparent onboarding consent, persistent AI badges on avatars and transcripts.
- [x] **Make it yours**: English + Hinglish auto-detect, Fishbowl mode, Ghost Replay, silent nudges.
