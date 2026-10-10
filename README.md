# GD Arena — The Voice-First Group Discussion Flight Simulator

> **A real-time multi-agent group discussion practice platform featuring autonomous AI participants, natural turn-taking, instant barge-in, English + Hinglish auto-detection, and machine-verified feedback with verbatim receipts.**

Built for **Problem Statement 2: GD Arena (Campus Placement GD Simulator)**.

---

## ⚡ Why GD Arena Outperforms Generic Chatbots

Most AI interview tools make a fundamental architectural mistake: they treat conversation as a sequential chatbot loop (`mic → speech-to-text → prompt LLM → text-to-speech`). That creates a voice assistant, **not a group discussion**.

In a real campus placement or corporate GD:
- Participants talk **to each other and debate points directly**, rather than waiting politely for the candidate to speak.
- Candidates must fight for airtime against aggressive competitors, extract insights from quiet peers, and handle interruptions.
- Turn-taking is governed by **friction, body language, intent, and pauses**—not turn-based turn orders.
- Evaluators reject students for either dominating without substance or remaining passive.

### Architectural Contrast

| Dimension | Generic Voice Chatbot | GD Arena (Flight Simulator) |
| :--- | :--- | :--- |
| **Interaction Model** | Sequential 1-on-1 Ping-Pong (`User ⇄ Bot`) | **Multi-Agent Round Table**: Autonomous agents challenge each other and the human simultaneously. |
| **Turn Taking** | Wait until user is fully silent | **Auction-Style Intent Bids**: Dynamic urgency curves recalculate every 100ms. |
| **Interruptions** | Audio collision or complete crash | **Instant Barge-In**: Sustained human speech aborts AI audio and truncates transcript to words actually heard. |
| **Language** | Rigid single-language models | **Real-time Code-Switching**: Auto-detects English vs natural romanized Hinglish (`hi-IN` / `en-IN`). |
| **Evaluation** | Hallucinated praise ("You spoke well!") | **The Evidence Guarantee**: 6 placement rubric scores strictly linked to machine-verified transcript quotes. |
| **Failure Mode** | Network drop = frozen screen | **Dual-Engine Resilience**: Seamless failover to deterministic local simulation with 0 downtime. |

---

## 🏗️ System Architecture

```
   ┌────────────────────────────────────────────────────────────────────────┐
   │                       BROWSER (Next.js 16 + React 19)                  │
   │  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
   │  │ Round Table UI   │    │  Web Audio VAD   │    │ Live Captions    │  │
   │  │ Intent Rings/Orb │    │  RMS Level Meter │    │ Web Speech API   │  │
   │  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘  │
   └───────────┼───────────────────────┼───────────────────────┼────────────┘
               │                       │                       │
               ▼                       ▼                       ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │             REAL-TIME FLOOR CONTROLLER (`RoomEngine`)                  │
   │  • State Machine: lobby → opening → prep (30s) → discussion → closing  │
   │  • Adaptive Endpointing (Patience slider + dynamic silence grace)      │
   │  • Auction Bidding Engine (Urgency, silence starvation, airtime caps)  │
   │  • Instant Barge-In (Truncates AI text to heard audio; cuts off TTS)   │
   │  • Silent Nudges (Airtime hogging warnings, filler alerts, lurker ping)│
   └───────────────────────────────────┬────────────────────────────────────┘
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            ▼                                                     ▼
┌────────────────────────────────────────┐    ┌────────────────────────────────────────┐
│     CLOUD AI SUITE (Server-Side)       │    │     OFFLINE DETERMINISTIC SIMULATION   │
│ • Google Vertex AI (Gemini 2.5/3.8)    │    │ • Dynamic Template Engine              │
│ • Cloud TTS (Chirp 3 HD Multi-Speaker) │    │ • Slot-Filling & Quote Extraction      │
│ • 6-Criteria Structured JSON Analyst   │    │ • Mathematical Rubric & Substring Verif│
│ • ADC / gcloud IAM Zero-Key Security   │    │ • Zero External API / Zero Latency     │
└────────────────────────────────────────┘    └────────────────────────────────────────┘
```

---

## 📐 Mathematical & Heuristic Foundations

### 1. Root Mean Square (RMS) Voice Activity Detection
The browser samples microphone input in real-time across Float32 PCM buffers to compute sound energy:

$$\text{RMS} = \sqrt{\frac{1}{N}\sum_{i=0}^{N-1} x_i^2}$$

During ambient calibration, the background noise floor is evaluated. The active speech threshold is dynamically set to:
$$\text{Threshold} = \max\left(0.025,\, \text{AverageAmbientRMS} \times 1.4\right)$$

### 2. Auction-Based Intent Urgency Bidding (`updateBids()`)
Every 100ms, each persona's raw target urgency (0.0 to 1.0) is calculated dynamically:

$$\text{Target}_i = \left(0.55 \times U_i\right) + \left(0.35 \times \text{clamp}\left(\frac{\Delta t_{\text{silent}}}{70}, 0, 1\right) \times B_{\text{quiet}}\right) - \left(0.40 \times \frac{\text{Airtime}_i}{\text{Total Airtime}}\right) + \text{Bonuses}$$

* **$U_i$**: Base persona urgency ($0.90$ for Vikram, $0.20$ for Meera, $0.50$ for Sana).
* **$\Delta t_{\text{silent}}$**: Elapsed seconds since this persona last held the floor.
* **$B_{\text{quiet}}$**: Quiet persona starvation accelerator ($1.8\times$ boost for Meera).
* **Bonuses**:
  * $+0.40$ if someone mentions their name (detected via `\bName\b` regex).
  * $+0.12$ for Kabir (Devil's Advocate) whenever someone finishes a strong assertion.
* **Exponential Moving Average (EMA) Smoothing**:
  $$\text{Bid}_{t} = \text{Bid}_{t-1} + 0.12 \times (\text{Target} - \text{Bid}_{t-1})$$
  *(Drives the glowing SVG intent rings around participant avatars).*

### 3. Arbiter Selection Function (`chooseSpeaker()`)
$$\text{Score}_i = \text{Bid}_i + \text{Random}(0, 0.25) - P_{\text{recency}} - P_{\text{dominator}}$$
* Candidates exclude the current speaker (no self-loops).
* $P_{\text{recency}} = 0.45$ if persona spoke within the last 3 turns.
* $P_{\text{dominator}} = 0.60$ if Vikram already spoke in the last 3 turns (prevents monopolization).

### 4. Human Grace Window
To prevent cutting candidates off mid-thought while catching their breath:
$$\text{NeededSilence} = \begin{cases} 
\max(2.4\text{s},\, \text{Patience} \times 1.5) + \text{Jitter} & \text{if human just finished} \\ 
(\text{Patience} \times 2.5) + \text{Jitter} & \text{if AI chain } \ge 2 \\ 
(\text{Patience} \times 1.2) + \text{Jitter} & \text{default} 
\end{cases}$$

### 5. Delivery & Speech Analytics
* **Words Per Minute (WPM)**:
  $$\text{WPM} = \text{round}\left(\frac{\text{StudentTotalWords}}{\text{StudentSpeakingSeconds} / 60}\right)$$
* **Airtime Distribution**:
  $$\text{Airtime}\% = \left(\frac{\text{Seconds Spoken by Participant}}{\sum \text{Seconds Spoken by All}}\right) \times 100$$
* **Filler Word Tracking**: Real-time regex extraction for `"um"`, `"uh"`, `"like"`, `"basically"`, `"actually"`, `"matlab"`, `"toh"`.

---

## 👥 Persona Matrix & Voice Casting

Every participant embodies a realistic psychological archetype found in campus placement GDs:

| Persona | Role | Behavioral Signature | Urgency | Chirp 3 HD Voice | Vocal Persona |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Mr. Iyer** | Moderator | Neutral, authoritative timekeeper | $0.60$ | `en-IN-Chirp3-HD-Charon` | Measured ($0.98\times$ rate), mature |
| **Vikram** | The Dominator | High urgency, steamrolls weak points | $0.90$ | `en-IN-Chirp3-HD-Fenrir` | Fast ($1.05\times$), assertive |
| **Ananya** | Data Nerd | Cites stats, demands factual proof | $0.65$ | `en-IN-Chirp3-HD-Kore` | Crisp ($1.02\times$), intellectual |
| **Meera** | Quiet Thinker | Silent early, delivers deep synthesis | $0.20$ | `en-IN-Chirp3-HD-Aoede` | Gentle ($0.94\times$), reflective |
| **Rohan** | Anecdotal | Charismatic stories, prone to drift | $0.55$ | `en-IN-Chirp3-HD-Puck` | Conversational ($1.03\times$), warm |
| **Kabir** | Contrarian | Probing skeptic, challenges consensus | $0.70$ | `en-IN-Chirp3-HD-Orus` | Sharp ($1.00\times$), analytical |
| **Sana** | Diplomat | Builds on others, seeks consensus | $0.50$ | `en-IN-Chirp3-HD-Leda` | Poised ($0.98\times$), collaborative |

---

## 📊 The 6-Point Placement Rubric & Evidence Guarantee

Most AI report tools hallucinate feedback. GD Arena enforces a strict **Evidence Guarantee**:
$$\text{No Quote} \implies \text{No Claim}$$
Every score in the post-discussion report is bound to an exact timestamp and machine-verified transcript quote:

1. **Starting the Discussion (Frame & Initiative)**: Scores early opening initiative. Opening within 30s grants up to 9/10; passive waiting degrades to 1/10.
2. **Quality of Ideas (Reasoning & Data)**: Evaluates ratio of causal markers (`because`, `for example`, `therefore`, `such as`) and concrete figures.
3. **Building on Others (Synthesis)**: Measures explicit references to peers (`"Building on Ananya's point..."`).
4. **Active Listening (Semantic Responsiveness)**: Cross-references content-word overlap against the immediate prior speaker.
5. **Handling Interruptions (Composure under Fire)**: Tracks outcomes when cut off—whether the student held their ground calmly or yielded immediately.
6. **Ending Strongly (The Conclusion Beat)**: Evaluates closing round duration, synthesis markers (`in conclusion`, `to summarize`), and acknowledgement of group consensus.

### Ghost Replay ("What You Could Have Said")
Identifies points where the candidate remained silent during a weak claim or let an opportunity pass, and synthesizes a spoken, actionable counter-argument to demonstrate how to seize the floor.

---

## 🛡️ Zero-API Fallback & Enterprise Security

### 1. 100% Offline Simulation Mode
GD Arena does not collapse when disconnected from the cloud:
* **Slot-Filling Context Engine**: Generates dynamic responses locally by extracting recent quotes (`quoteOf()`), topic hooks, and peer names.
* **Deterministic Lexical Evaluator**: Generates the complete 6-rubric report, airtime donut, delivery metrics, and Ghost Replay entirely client-side using JavaScript in $<10\,\text{ms}$.
* **Native Browser Voice Fallback**: Seamlessly switches to native `speechSynthesis` if cloud voices are unreachable.

### 2. Zero-Trust Security & Privacy
* **Zero Client-Side Credentials**: No API keys or service account tokens are exposed to the browser. All cloud communications route through server-side Next.js route handlers (`/api/turn`, `/api/tts`, `/api/report`).
* **Audio Privacy**: Audio is processed entirely **in-memory** within the browser's Web Audio sandbox. Raw audio streams are never stored or transmitted to external servers.
* **Local Session Storage**: Transcripts and reports reside exclusively in the user's browser `localStorage`.
* **Bounded Execution**: Strict client-side `AbortController` timeouts (2.0s for turns, 8.5s for TTS) ensure the room never freezes even under adverse network conditions.

---

## 🛠️ Complete Technology Stack

* **Frontend & Architecture**: Next.js 16 (App Router, Turbopack), React 19, TypeScript 5.
* **Styling**: Vanilla CSS Design System with dark glassmorphism, responsive radial table layout, and dynamic SVG intent rings.
* **Browser Audio Engine**: Web Audio API (`AudioContext`, `AnalyserNode`, Float32Array RMS processing), Web Speech API (`webkitSpeechRecognition`).
* **Generative Models**: Google Vertex AI (`gemini-2.5-flash`, `gemini-3.8-flash`), structured JSON decoding.
* **Speech Synthesis**: Google Cloud Text-to-Speech **Chirp 3 HD Studio Models** (`en-IN` and `hi-IN`).
* **Authentication**: `google-auth-library` Application Default Credentials (ADC) + `gcloud` IAM token fallback.

---

## 🚀 Getting Started

### 1. Installation
```bash
npm install
```

### 2. Google Cloud Setup (Optional for Cloud Mode)
To use Google Cloud Chirp 3 HD voices and live Gemini turn generation:
```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project <YOUR_PROJECT_ID>
gcloud auth application-default set-quota-project <YOUR_PROJECT_ID>
```
*(If unconfigured, GD Arena automatically operates in full offline simulation mode).*

### 3. Launch Development Server
```bash
npm run dev
```

### 4. Direct Evaluation Routes
* **Landing Page**: [http://localhost:3000](http://localhost:3000)
* **Room Setup (Topic & Panel Selection)**: [http://localhost:3000/setup](http://localhost:3000/setup)
* **Sample Report (Evidence Verification Playground)**: [http://localhost:3000/report/demo](http://localhost:3000/report/demo)

---

## 📋 Evaluation Checklist

- [x] **Autonomous Multi-Agent Room**: AI participants converse with each other without waiting for user prompts.
- [x] **Auction-Style Turn Bidding**: Visual intent rings representing dynamic urgency and silence accumulation.
- [x] **Instant Barge-In**: Cuts off AI speech immediately and freezes transcript to heard words.
- [x] **Code-Switching**: Dynamic English and Hinglish auto-detection and conversational generation.
- [x] **Studio-Grade Voice Synthesis**: Chirp 3 HD multi-speaker voices with authentic Indian English and Hindi prosody.
- [x] **Evidence-Linked Report**: Every feedback item validated with verbatim transcript substrings.
- [x] **Ghost Replay**: Spoken counter-lines for missed opportunities and unchallenged assertions.
- [x] **Dual-Mode Resilience**: Seamless execution with or without cloud connectivity.
