# GD Arena — The Voice-First Group Discussion Flight Simulator

> **An autonomous, multi-agent group discussion simulator featuring real-time floor dynamics, on-device computer vision biometrics, instant acoustic barge-in, English + Hinglish code-switching, and machine-verified placement feedback with the Evidence Guarantee.**

Built for **Problem Statement 2: GD Arena (Campus Placement GD Simulator)**.

---

## 📑 Table of Contents
1. [Executive Summary & Competitive Architecture](#-executive-summary--competitive-architecture)
2. [End-to-End System Architecture](#-end-to-end-system-architecture)
3. [Mathematical & Algorithmic Foundations](#-mathematical--algorithmic-foundations)
   - [Acoustic VAD & Energy Thresholding](#1-acoustic-vad--ambient-energy-thresholding)
   - [Auction-Style Turn Bidding Dynamics](#2-auction-style-intent-urgency-bidding)
   - [Arbiter Floor Selection & Monopolization Dampening](#3-arbiter-floor-selection--anti-monopolization)
   - [Dynamic Pacing & Human Handover Grace Window](#4-dynamic-pacing--human-handover-grace-window)
   - [On-Device Computer Vision & Biometrics Math](#5-on-device-computer-vision--biometric-mathematics)
   - [The 6-Point Placement Rubric & Scoring Calculus](#6-the-6-point-placement-rubric--scoring-calculus)
   - [Body Language Report Card Scoring](#7-body-language-report-card-scoring-calculus)
4. [New Features & Engineering Fixes Changelog](#-new-features--engineering-fixes-changelog)
5. [Security, Privacy & Threat Model](#-security-privacy--threat-model)
6. [Multi-Agent Persona Matrix & Chirp 3 HD Casting](#-multi-agent-persona-matrix--chirp-3-hd-casting)
7. [Repository Structure & Codebase Guide](#-repository-structure--codebase-guide)
8. [Setup, Deployment & Offline Resilience](#-setup-deployment--offline-resilience)
9. [Evaluation & Compliance Checklist](#-evaluation--compliance-checklist)

---

## ⚡ Executive Summary & Competitive Architecture

Standard AI interview prep applications adopt a sequential 1-on-1 ping-pong loop:
$$\text{Microphone} \longrightarrow \text{STT} \longrightarrow \text{LLM Query} \longrightarrow \text{TTS}$$

This paradigm produces a polite conversational assistant, **not a high-stakes group discussion**. In corporate campus recruitment (McKinsey, BCG, Amazon, Goldman Sachs), group discussions evaluate how candidates handle:
1. **Airtime Monopolization**: Overcoming aggressive candidates who cut others off without substantiating arguments.
2. **Organic Floor Contention**: Reading micro-pauses, body language, and asserting oneself into an ongoing multi-way debate without waiting for explicit permission.
3. **Synthesis & Peer Building**: Linking arguments across multiple participants rather than merely responding to an interviewer prompt.
4. **Composure & Non-Verbal Presence**: Eye contact, posture uprightness, shoulder tilt, facial tension, and upper-body fidgeting under competitive pressure.

### Comparative Architectural Matrix

| Dimension | Generic Voice Chatbot | GD Arena (Real-Time Flight Simulator) |
| :--- | :--- | :--- |
| **Topology** | 1-on-1 Turn-Based Ping-Pong (`User ⇄ Bot`) | **Autonomous Multi-Agent Round Table**: 3–6 AI personas debate each other organically and challenge the human simultaneously. |
| **Floor Arbitration** | Wait until human stops speaking | **Continuous Urgency Auction**: 100ms EMA bidding curves factoring persona aggression, silence starvation, and airtime limits. |
| **Interruption Handling** | Audio collisions or browser lock-up | **Deterministic Instant Barge-In**: Sustained human speech aborts AI playback immediately and truncates stored transcript to words actually heard. |
| **Biometric Analysis** | None or invasive cloud video streaming | **100% On-Device Edge Vision**: MediaPipe Face (478 pts) & Pose (33 pts) running in WASM/WebGL; zero frames transmitted; adaptive baseline calibration. |
| **Speech Generation** | Synthetic, robotic browser speech | **Studio-Grade Chirp 3 HD Multi-Speaker**: Google Cloud TTS with authentic Indian English and Hindi prosody, pre-cached for zero latency. |
| **Language Support** | Rigid single-language models | **Real-Time Code-Switching**: Dynamic detection and generation in both English and romanized Hinglish (`en-IN` / `hi-IN`). |
| **Evaluation Honesty** | Hallucinated generalities ("Good job!") | **The Evidence Guarantee**: Every score strictly requires a verbatim, machine-verified transcript substring receipt. $\text{No Quote} \implies \text{No Claim}$. |
| **Resilience & Privacy** | Fails completely when offline | **Dual-Engine Failover**: Seamless client-side deterministic fallback engine ($<10\text{ms}$ latency) when cloud APIs are unreachable. |

---

## 🏗️ End-to-End System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT LAYER (Browser / Edge)                                  │
│                                                                                                  │
│   ┌──────────────────────────┐    ┌──────────────────────────┐    ┌──────────────────────────┐   │
│   │   Audio & VAD Pipeline   │    │  On-Device Vision AI     │    │  Interactive Cockpit UI  │   │
│   │  • Web Audio API Analyser│    │  • MediaPipe WASM/WebGL  │    │  • Radial Trig Seating   │   │
│   │  • Float32 PCM RMS Engine│    │  • 478 Face + 33 Pose LMs│    │  • SVG Dynamic Rings     │   │
│   │  • Web Speech Continuous │    │  • 25-Frame Baseline Cal │    │  • Live HUD & Coach Feed │   │
│   └────────────┬─────────────┘    └────────────┬─────────────┘    └────────────┬─────────────┘   │
└────────────────┼───────────────────────────────┼───────────────────────────────┼─────────────────┘
                 │                               │                               │                  
                 ▼                               ▼                               ▼                  
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             REAL-TIME FLOOR ENGINE (`RoomEngine`)                                │
│                                                                                                  │
│   • Hierarchical State Machine: [lobby → opening → prep(30s) → discussion → closing → report]    │
│   • Auction Bidding Arbiter: Urgency curves, silence starvation, peer mentions, airtime drag     │
│   • Handover Scheduler: Realistic ~1s human decision window, ~600ms AI-to-AI transition gap      │
│   • Mutex-Guarded Concurrency: Turn stampede lock (`busy` gate) preventing dual speech           │
│   • Instant Barge-In Controller: Web Audio mute + transcript truncation to heard words           │
│   • In-Memory Audio Cache & Moderator Audio Prefetcher                                           │
└────────────────────────────────────────┬─────────────────────────────────────────────────────────┘
                                         │
             ┌───────────────────────────┴───────────────────────────┐
             │                                                       │
             ▼                                                       ▼
┌────────────────────────────────────────┐  ┌──────────────────────────────────────────────────────┐
│       SERVER-SIDE SECURE PROXY         │  │           OFFLINE DETERMINISTIC RUNTIME              │
│       (Next.js Route Handlers)         │  │                                                      │
│                                        │  │ • Zero-Latency Local Fallback Engine                 │
│ • Proxy Guard (`guard.ts`):            │  │ • Regex-Based Reasoning & Structure Extractor        │
│   - Same-Origin / Sec-Fetch-Site Check │  │ • Welford Facial Expressiveness Variance             │
│   - Sliding-Window In-Memory Rate Limit│  │ • Deterministic Ghost Replay Synthesizer             │
│   - Strict 40KB–400KB Payload Cap      │  │ • Native Web Speech Synthesis Failover               │
│   - Control Char & Tag Sanitization    │  │ • 100% Client-Side In-Memory Evaluation              │
│ • Vertex AI Gateway (`vertex.ts`):     │  └──────────────────────────────────────────────────────┘
│   - Google Application Default Creds   │
│   - Gemini 2.5 / 3.8 Flash Generation  │
│   - Cloud TTS Chirp 3 HD Synthesis     │
└────────────────────────────────────────┘
```

---

## 📐 Mathematical & Algorithmic Foundations

### 1. Acoustic VAD & Ambient Energy Thresholding

The microphone stream is processed using the browser's Web Audio API (`AudioContext`, `AnalyserNode` with an FFT size of 2048) over `Float32Array` PCM buffers. The Root Mean Square (RMS) energy is computed as:

$$\text{RMS} = \sqrt{\frac{1}{N} \sum_{i=0}^{N-1} x_i^2}$$

During the calibration stage, the ambient room noise floor is sampled. The active speech threshold is dynamically set to prevent ambient HVAC or keyboard clicks from tripping turn detection:

$$\text{Threshold}_{\text{active}} = \max\left(0.025,\, \text{AmbientRMS}_{\text{mean}} \times 1.4\right)$$

Speech state transitions require hysteresis: voice onset triggers when $\text{RMS} > \text{Threshold}$ for $\ge 120\text{ms}$; silence requires $\text{RMS} < \text{Threshold}$ for $\ge 900\text{ms}$ before initiating floor transfer.

---

### 2. Auction-Style Intent Urgency Bidding

Unlike scripted bots, GD Arena executes a continuous auction every $100\text{ms}$ (`TICK_MS = 100`). Each AI persona $i$ computes a target urgency $\text{Target}_i \in [0.03, 1.0]$:

$$\text{Target}_i = \left(0.55 \cdot U_i\right) + \left(0.35 \cdot \text{clamp}\left(\frac{\Delta t_{\text{silent}, i}}{70}, 0, 1\right) \cdot B_{\text{quiet}, i}\right) - \left(0.40 \cdot \frac{\text{Airtime}_i}{\text{Airtime}_{\text{total}}}\right) + \text{Bonuses}$$

Where:
* **$U_i$**: Base persona aggressiveness trait ($0.90$ for Vikram, $0.20$ for Meera, $0.65$ for Ananya).
* **$\Delta t_{\text{silent}, i}$**: Elapsed seconds since persona $i$ last held the floor.
* **$B_{\text{quiet}, i}$**: Starvation multiplier ($1.8\times$ for Meera) ensuring quiet participants eventually demand the floor.
* **$\frac{\text{Airtime}_i}{\text{Airtime}_{\text{total}}}$**: Airtime drag penalizing over-talkers.
* **$\text{Bonuses}$**:
  * $+0.40$ if the immediate prior speaker mentioned persona $i$'s name (regex match `\bName\b`).
  * $+0.12$ for Kabir (Devil's Advocate) whenever a participant makes an unverified factual claim.
  * $= 1.0$ if persona $i$ currently holds the floor.

To create organic visual responsiveness, target bids are smoothed using an **Exponential Moving Average (EMA)**:

$$\text{Bid}_{i, t} = \text{Bid}_{i, t-1} + 0.12 \cdot \left(\text{Target}_i - \text{Bid}_{i, t-1}\right)$$

*This EMA value directly animates the pulsating SVG intent aura rings surrounding each avatar.*

---

### 3. Arbiter Floor Selection & Anti-Monopolization

When the floor becomes free, the Arbiter selects the winning bidder from candidates excluding the previous speaker:

$$\text{Score}_i = \text{Bid}_i + \text{Rand}(0, 0.25) + \text{StudentReactBonus}_i - P_{\text{recency}, i} - P_{\text{dominator}, i}$$

Where:
* **$\text{StudentReactBonus}_i = 0.5 \cdot U_i + 0.3 \cdot I_i$**: When the human student finishes speaking, assertive participants receive a priority boost to immediately validate, critique, or build upon the student's idea.
* **$P_{\text{recency}, i} = 0.45$**: Applied if persona $i$ spoke within the last 3 turns.
* **$P_{\text{dominator}, i} = 0.60$**: Applied if Vikram has already spoken in the last 3 turns, preventing conversation monopolization.

---

### 4. Dynamic Pacing & Human Handover Grace Window

In campus GDs, cutting in too quickly feels robotic, while waiting too long kills momentum. The decision window is calculated as:

$$\Delta t_{\text{handover}} = \text{BaseGap} \cdot \text{clamp}\left(\frac{\text{PatienceMs}}{900}, 0.6, 2.0\right) + \left(\text{Jitter} \pmod{180}\right)$$

$$\text{BaseGap} = \begin{cases} 920\text{ms} & \text{if human student just finished speaking} \\ 540\text{ms} & \text{between AI participants} \end{cases}$$

This gives the candidate a realistic **$850\text{ms} - 1050\text{ms}$ cognitive pause window** to breathe or continue speaking before AI competitors bid for the floor.

---

### 5. On-Device Computer Vision & Biometric Mathematics

GD Arena executes Google MediaPipe Vision Tasks (`FaceLandmarker` with 478 landmarks + 52 facial blendshapes + 4x4 transformation matrix, and `PoseLandmarker` with 33 landmarks) inside a background WebAssembly/WebGL thread.

```
       [Video Frame] (640x480 @ 8 FPS Face, 4 FPS Pose)
             │
             ├──► 4x4 Facial Matrix ──► Y-X-Z Euler Angles (Yaw, Pitch, Roll)
             │                                   │
             │                                   ▼
             ├──► 52 Blendshapes ──────► Eye Gaze & Facial Tension Classifier
             │                                   │
             │                                   ▼
             └──► 33 Pose Landmarks ───► Shoulder Drop & Wrist Velocity Engine
                                                 │
                                                 ▼
                                     [Per-User Baseline Calibrator]
                                      (Median of first 25 frames)
```

#### A. Adaptive Calibration Baseline
To account for varying webcam heights, laptop angles, and facial structures, the engine collects the first $N = 25$ valid frames and computes the per-user median baseline:

$$\text{Yaw}_0 = \text{Median}\left(\{\text{Yaw}_k\}_{k=1}^{25}\right), \quad \text{Pitch}_0 = \text{Median}\left(\{\text{Pitch}_k\}_{k=1}^{25}\right)$$
$$w_0 = \text{Median}\left(\{w_k\}_{k=1}^{25}\right), \quad \text{Drop}_0 = \text{Median}\left(\{\text{Drop}_k\}_{k=1}^{25}\right)$$

#### B. Head Pose & Eye Gaze Trigonometry
The facial transformation matrix $M \in \mathbb{R}^{4 \times 4}$ is decomposed into Euler angles:

$$\text{Yaw} = \text{atan2}(M_{2, 0}, M_{2, 2}) \cdot \frac{180}{\pi}$$
$$\text{Pitch} = \text{asin}(\text{clamp}(-M_{2, 1}, -1, 1)) \cdot \frac{180}{\pi}$$
$$\Delta\text{Yaw} = |\text{Yaw} - \text{Yaw}_0|, \quad \Delta\text{Pitch} = |\text{Pitch} - \text{Pitch}_0|$$

Iris and eyelid blendshapes are extracted:
$$\text{EyeDown} = \frac{B_{\text{lookDownL}} + B_{\text{lookDownR}}}{2}, \quad \text{EyeUp} = \frac{B_{\text{lookUpL}} + B_{\text{lookUpR}}}{2}$$
$$\text{EyeSide} = \frac{|(B_{\text{lookOutL}} + B_{\text{lookInR}}) - (B_{\text{lookInL}} + B_{\text{lookOutR}})|}{2}$$

The 3-way eye contact state machine is evaluated:
$$\text{GazeState} = \begin{cases} 
\text{Down} & \text{if } \text{EyeDown} > 0.50 \lor (\Delta\text{Pitch} > 20^\circ \land \text{EyeDown} > 0.25) \\ 
\text{Away} & \text{if } \neg\text{Down} \land (\Delta\text{Yaw} > 22^\circ \lor \text{EyeSide} > 0.50 \lor \text{EyeUp} > 0.65 \lor \Delta\text{Pitch} > 28^\circ) \\ 
\text{Contact} & \text{otherwise (facing camera/panel)}
\end{cases}$$

#### C. Facial Expressiveness & Welford's Variance Algorithm
A composite facial activation energy $E_t$ is computed from smile, brow elevation, and eye widening:
$$E_t = \text{Smile} + B_{\text{browInnerUp}} + \text{BrowOuterUp} + \text{EyeWide}$$

To track expressiveness over time without memory leaks or precision loss, **Welford's algorithm for online variance** is maintained:
$$d_t = E_t - \bar{E}_{t-1}, \quad \bar{E}_t = \bar{E}_{t-1} + \frac{d_t}{n}, \quad M_{2, t} = M_{2, t-1} + d_t (E_t - \bar{E}_t)$$
$$\sigma_E = \sqrt{\frac{M_{2, t}}{n - 1}}, \quad \text{Expressiveness} = \text{clamp}\left(\frac{\sigma_E}{0.18}, 0, 1\right)$$

#### D. Posture, Slouch & Gesture Tracking
From pose landmarks $P_{\text{nose}}, P_{\text{leftShoulder}}, P_{\text{rightShoulder}}, P_{\text{leftWrist}}, P_{\text{rightWrist}}$:
* Normalized shoulder width: $w = \|P_{\text{leftShoulder}} - P_{\text{rightShoulder}}\|_2$
* Shoulder midpoint: $\text{Mid}_Y = \frac{P_{\text{leftShoulder}, y} + P_{\text{rightShoulder}, y}}{2}$
* Normalized neck drop: $\text{Drop} = \frac{\text{Mid}_Y - P_{\text{nose}, y}}{w}$
* Shoulder tilt angle: $\theta_{\text{tilt}} = \text{atan2}(|P_{\text{leftShoulder}, y} - P_{\text{rightShoulder}, y}|, |P_{\text{leftShoulder}, x} - P_{\text{rightShoulder}, x}|) \cdot \frac{180}{\pi}$
* **Slouch Detection**:
  $$\text{Slouch} = (\text{Drop} < 0.78 \cdot \text{Drop}_0) \lor (\text{Mid}_Y - \text{Mid}_{Y, 0} > 0.07 \land w < 1.05 \cdot w_0)$$
* **Posture Score ($0 - 10$)**:
  $$\text{PostureScore} = \text{clamp}\left(10 - 8 \cdot \frac{t_{\text{slouch}}}{t_{\text{body}}} - 3 \cdot \frac{t_{\text{tilt} > 8^\circ}}{t_{\text{body}}} - 2 \cdot \text{FidgetScore},\, 0,\, 10\right)$$
* **Hand Gesturing**:
  $$\text{GestureActive} = \frac{\|W_t - W_{t-1}\|_2}{w} > 0.12$$

---

### 6. The 6-Point Placement Rubric & Scoring Calculus

The platform grades students across 6 industry-standard recruitment criteria:

#### Criterion 1: Starting the Discussion (Initiative & Framing)
Evaluates whether the candidate seized the floor during the crucial opening window:
$$\text{Score}_{\text{start}} = \begin{cases} 
1.0 & \text{if candidate never spoke} \\ 
9.0 & \text{if candidate spoke first overall} \\ 
8.0 & \text{if first speech delay } \Delta t_{\text{open}} < 30\text{s} \\ 
6.0 & \text{if } 30\text{s} \le \Delta t_{\text{open}} < 75\text{s} \\ 
4.0 & \text{if } 75\text{s} \le \Delta t_{\text{open}} < 150\text{s} \\ 
2.0 & \text{if } \Delta t_{\text{open}} \ge 150\text{s} 
\end{cases}$$

#### Criterion 2: Quality of Ideas (Reasoning & Evidence)
Extracts causal reasoning markers $M$ (`because`, `for example`, `such as`, `therefore`, `kyunki`, `jaise`) and empirical numerical figures:
$$\text{Score}_{\text{ideas}} = \text{clamp}\left(3.0 + 2.5 \cdot \bar{M}_{\text{turn}} + \delta_{\text{len}},\, 1.0,\, 10.0\right)$$
$$\delta_{\text{len}} = +1.5 \text{ (if avg words } \ge 25\text{)} - 1.5 \text{ (if avg words } > 70\text{ or } < 10\text{)}$$

#### Criterion 3: Building on Others (Collaborative Synthesis)
Evaluates explicit acknowledgment of peers by name or via conversational bridges (`building on`, `agree with`, `jaise unhone kaha`):
$$\text{Score}_{\text{building}} = \text{clamp}\left(2.0 + 8.0 \cdot \frac{\text{Turns}_{\text{referenced}}}{\text{Turns}_{\text{eligible}}},\, 1.0,\, 10.0\right)$$

#### Criterion 4: Active Listening (Semantic Responsiveness)
Computes content word set overlap (words $\ge 5$ letters, excluding stop words) between the student's turn $S$ and the immediate prior speaker's turn $P$:
$$\text{Overlap} = |W_S \cap W_P|$$
$$\text{Score}_{\text{listening}} = \text{clamp}\left(2.0 + 8.0 \cdot \frac{|\{\text{Turns with Overlap} \ge 1\}|}{|\text{Turns}_{\text{pairs}}|},\, 1.0,\, 10.0\right)$$

#### Criterion 5: Handling Interruptions (Composure Under Fire)
Tracks adversarial outcomes when AI cut off candidate vs when candidate barged in:
$$\text{Score}_{\text{interrupt}} = \text{clamp}\left(6.0 + \min(3, 1.5 \cdot \text{Held}) - \min(3, 1.5 \cdot \text{Yielded}) + \min(1, 0.5 \cdot \text{BargeIns}),\, 1.0,\, 10.0\right)$$

#### Criterion 6: Ending Strongly (The Conclusion Beat)
Scores the final closing round based on word count $W$, conclusion signposts (`in conclusion`, `to sum up`, `isliye`), and peer synthesis:
$$\text{Score}_{\text{ending}} = \text{clamp}\left(2.0 + \text{Bonus}_W + (3.0 \text{ if Signpost}) + (2.0 \text{ if PeerRef}),\, 1.0,\, 10.0\right)$$
$$\text{Bonus}_W = 3.0 \text{ (if } 20 \le W \le 75\text{)}, \quad 1.5 \text{ (if } 10 \le W < 20\text{)}$$

#### Overall Score Calculus:
$$\text{OverallScore} = \text{round}\left(\frac{1}{6} \sum_{k=1}^6 \text{Score}_k \times 10\right) \in [0, 100]$$

---

### 7. Body Language Report Card Scoring Calculus

When camera tracking is active, four additional biometric dimensions are scored:
1. **Eye Contact ($0-10$)**:
   $$\text{Score}_{\text{eye}} = \text{clamp}\left(\frac{\text{Contact}\%}{7} - \frac{\max(0, \text{Down}\% - 15)}{10},\, 0,\, 10\right)$$
2. **Expression & Presence ($0-10$)**:
   $$\text{Score}_{\text{expr}} = \text{clamp}\left(4.0 + 4.0 \cdot \text{Expressiveness} + 2.0 \cdot \frac{\min(\text{Smile}\%, 35)}{35} - \frac{\text{Tense}\%}{15},\, 0,\, 10\right)$$
3. **Posture ($0-10$)**:
   $$\text{Score}_{\text{posture}} = \text{PostureScore (calculated via Section 5.D)}$$
4. **Composure & Gestures ($0-10$)**:
   $$\text{Score}_{\text{composure}} = \text{clamp}\left(10 - 7 \cdot \text{Fidget} + (1.0 \text{ if } 5\% \le \text{Gesture}\% \le 45\% \text{ else } 0),\, 0,\, 10\right)$$

---

## 🛠️ New Features & Engineering Fixes Changelog

The following major systems, fixes, and optimizations were engineered:

### 1. On-Device Vision AI & Body Language Tracker (`src/lib/vision.ts`, `src/components/camera.tsx`)
* **Dual Landmarker Pipeline**: Bundled MediaPipe Face Mesh (478 pts) and Pose Landmarker (33 pts) running completely client-side in WebAssembly.
* **Zero Video Streaming**: Raw video frames are processed exclusively inside volatile browser memory and immediately garbage collected. **No image or video byte ever leaves the user's computer.**
* **Adaptive Baseline Learning**: Mitigates physical setup bias by establishing a 25-frame calibration baseline.
* **Body Language HUD & In-Room Controls**: Added floating camera toggle, live status indicators (`Calibrated`, `Eye Contact`, `Slouch Warning`), and mobile coaching chips.

### 2. Turn Stampede Elimination & Concurrency Locks (`src/lib/engine.ts`)
* **Problem**: In high-contention rounds, when silence was detected, multiple AI personas would simultaneously trigger API requests, causing speech collisions.
* **Fix**: Implemented a strict `busy` mutex lock across turn scheduling. All competing requests are rejected while an AI turn is planning or synthesizing:
  ```typescript
  if (this.busy || this.current || this.utterOpen) return;
  this.busy = true;
  ```
* **Human Floor Abort**: If a human candidate begins speaking while an AI turn is being generated, the pending generation is immediately discarded:
  ```typescript
  if (this.phase === "discussion" && (this.utterOpen || this.voiceActive || this.destroyed)) return;
  ```

### 3. Realistic GD Floor Pacing & Human Prioritization (`src/lib/engine.ts`)
* Replaced artificial instant turn-taking with human-calibrated pause dynamics:
  * **$850\text{ms} - 1050\text{ms}$ Handover Window**: Provides breathing space when a candidate stops talking before AI candidates evaluate the floor.
  * **$520\text{ms} - 720\text{ms}$ Inter-AI Latency**: Simulates natural competitive turn-taking between AI panelists.
* **Candidate Quoting Engine**: When a student finishes speaking, AI panelists are forced to prioritize the student's quote (`lastStudent ? pool.toStudent : ...`) rather than drifting into private AI-to-AI tangents.

### 4. Studio-Grade Voice Synthesis & Prefetch Architecture (`src/lib/engine.ts`, `src/lib/vertex.ts`)
* **Google Cloud TTS Chirp 3 HD**: Integrated high-definition neural voices (`en-IN-Chirp3-HD-*`) tailored for authentic Indian English cadence, pitch, and prosody.
* **Moderator Audio Prefetcher**: Prefetches opening lines, stage transitions, and closing calls into memory during room initialization, eliminating audio playback delays.

### 5. Hosted Site Proxy Guard & Security Hardening (`src/lib/guard.ts`)
* **Origin & Proxy Verification**: Validates requests using `origin`, `x-forwarded-host`, and standard browser `sec-fetch-site` headers.
* **Sliding-Window Rate Limiter**: Implemented in-memory sliding-window IP rate limiting with proactive map pruning to prevent denial-of-service abuse.
* **Prompt Injection Defense**: Sanitizes user-supplied transcript and topic strings by stripping ASCII/Unicode control characters and custom system delimiter tags (`<<<`, `>>>`, `<transcript>`, `<data>`).

### 6. Mobile Seating Geometry & UI Bug Fixes (`src/app/globals.css`, `src/components/table.tsx`)
* **Portrait Ellipse Table Layout**: Transformed circular seating into a vertical ellipse geometry on mobile screens ($<768\text{px}$) using dynamic trigonometric positioning.
* **Microphone Orb Collision Fix**: Eliminated overlapping between participant avatar cards and the center audio orb.
* **Dismissible STT Banner**: Replaced intrusive browser permission alerts with a non-blocking toast banner.
* **Custom Topic Input**: Enabled arbitrary custom debate topics on the Setup screen with dynamic Gemini briefing generation.

---

## 🛡️ Security, Privacy & Threat Model

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   SECURITY PERIMETER                                   │
├───────────────────────────────┬────────────────────────────────────────────────────────┤
│ THREAT VECTOR                 │ MITIGATION IMPLEMENTED                                 │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ Video & Facial Biometrics     │ 100% on-device MediaPipe WASM/WebGL execution. Raw      │
│ Eavesdropping / Surveillance  │ frames are never stored or transmitted over network.    │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ Audio Recording Leakage       │ In-memory Web Audio Float32 processing only. Zero raw  │
│                               │ microphone audio files are persisted on servers.       │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ Client Credential Exposure    │ Zero API keys in frontend code. All Google Cloud calls │
│                               │ route through server-side Next.js route handlers.      │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ Unauthenticated Endpoint Abuse│ Sliding-window IP rate limiting (`guard.ts`) + Same-   │
│ & DDoS                        │ Origin + Sec-Fetch-Site browser header validation.     │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ Prompt Injection via Speech   │ Sanitization regex removes control codes and system    │
│ or Topic Input                │ delimiters; prompts instruct model to treat as data.   │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ Hallucinated AI Feedback      │ The Evidence Guarantee: every rubric claim is verified │
│                               │ via verbatim transcript substring matching.            │
└───────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 👥 Multi-Agent Persona Matrix & Chirp 3 HD Casting

Each participant represents a distinct behavioral archetype typical of campus placement rounds:

| Persona | Archetype | Behavioral Profile | Urgency | Interrupt | Chirp 3 HD Voice | Speaking Rate |
| :--- | :--- | :--- | :---: | :---: | :--- | :---: |
| **Mr. Iyer** | Moderator | Authoritative, neutral timekeeper | $0.60$ | $0.20$ | `en-IN-Chirp3-HD-Charon` | $0.98\times$ |
| **Vikram** | The Dominator | Assertive, cites power metrics, challenges weak arguments | $0.90$ | $0.85$ | `en-IN-Chirp3-HD-Fenrir` | $1.05\times$ |
| **Ananya** | Data Analyst | Facts-first, demands proof and concrete numbers | $0.65$ | $0.40$ | `en-IN-Chirp3-HD-Kore` | $1.02\times$ |
| **Meera** | Quiet Thinker | Patient, enters late with high-impact holistic synthesis | $0.20$ | $0.10$ | `en-IN-Chirp3-HD-Aoede` | $0.94\times$ |
| **Rohan** | Storyteller | Charismatic, relies on case studies, prone to tangents | $0.55$ | $0.50$ | `en-IN-Chirp3-HD-Puck` | $1.03\times$ |
| **Kabir** | Contrarian | Skeptic, probes unexamined assumptions | $0.70$ | $0.65$ | `en-IN-Chirp3-HD-Orus` | $1.00\times$ |
| **Sana** | Diplomat | Builds consensus, structures group takeaways | $0.50$ | $0.35$ | `en-IN-Chirp3-HD-Leda` | $0.98\times$ |

---

## 📁 Repository Structure & Codebase Guide

```
GD-Arena/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── turn/route.ts        # Vertex AI Gemini turn generator & persona roleplay
│   │   │   ├── tts/route.ts         # Google Cloud TTS Chirp 3 HD voice synthesis endpoint
│   │   │   └── report/route.ts      # Vertex AI 6-rubric evaluator with Evidence Guarantee
│   │   ├── report/[id]/page.tsx     # Post-GD evaluation report, body metrics & Ghost Replay
│   │   ├── room/[id]/page.tsx       # Live round-table cockpit, floor controller & audio HUD
│   │   ├── setup/page.tsx           # Setup: topic picker, panelist selector & camera toggle
│   │   ├── globals.css              # Dark glassmorphism, responsive ellipse layout & aura rings
│   │   ├── layout.tsx               # Root layout with responsive viewport & theme metadata
│   │   └── page.tsx                 # Product landing page with feature demonstrations
│   ├── components/
│   │   ├── camera.tsx               # On-device video preview HUD & MediaPipe vision tracker
│   │   ├── report-view.tsx          # Interactive report view with verbatim evidence receipts
│   │   └── table.tsx                # Round-table seating renderer with dynamic SVG intent rings
│   └── lib/
│       ├── engine.ts                # Real-time RoomEngine: auction bids, barge-in, pacing
│       ├── guard.ts                 # Security guard: IP rate limiter, same-origin, sanitization
│       ├── lang.ts                  # Language detection (en vs hinglish) & filler word regex
│       ├── personas.ts              # Persona behavioral parameters, scripts & templates
│       ├── report.ts                # Deterministic scoring calculus & quote substring checker
│       ├── storage.ts               # Local browser session persistence (localStorage)
│       ├── types.ts                 # Domain models, biometric schemas & TypeScript interfaces
│       ├── vertex.ts                # Google Cloud Vertex AI & TTS client (ADC / IAM auth)
│       └── vision.ts                # MediaPipe Face & Pose vision tracker (WASM / WebGL)
├── public/                          # Static assets and WebAssembly binaries
├── firebase.json                    # Firebase Hosting & App Hosting configuration
├── .firebaserc                      # Firebase project configuration
├── next.config.ts                   # Next.js 16 configuration with Turbopack & remote patterns
├── tsconfig.json                    # TypeScript strict mode configuration
└── package.json                     # Project manifest and dependency declarations
```

---

## 🚀 Setup, Deployment & Offline Resilience

### 1. Prerequisites
* **Node.js**: `v20.x` or higher
* **npm**: `v10.x` or higher
* **Google Cloud SDK** (`gcloud`) *(optional, only needed for Cloud mode)*

### 2. Quick Installation
```bash
git clone https://github.com/kavya2201/GD-Arena.git
cd GD-Arena
npm install
```

### 3. Launching Development Server
```bash
npm run dev
```
Navigate to [http://localhost:3000](http://localhost:3000) in Google Chrome or any Chromium-based browser (recommended for Web Audio and Web Speech support).

### 4. Google Cloud Configuration (Optional)
To enable server-side Vertex AI Gemini and Chirp 3 HD voices:
```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project <YOUR_PROJECT_ID>
gcloud auth application-default set-quota-project <YOUR_PROJECT_ID>
```
*(If unconfigured, GD Arena automatically operates in full offline simulation mode).*

### 5. Dual-Engine Resilience Guarantee
If Google Cloud credentials expire, network drops, or rate limits are reached:
1. **Turn Generation**: Falls back to the client-side template filling engine using context quotes.
2. **Speech Synthesis**: Falls back to the browser's native `speechSynthesis` API.
3. **Report Generation**: Deterministic heuristic scoring evaluates the transcript in $<10\text{ms}$.
4. **Body Language**: Runs 100% on-device via WebAssembly regardless of network connectivity.

---

## 📋 Evaluation & Compliance Checklist

- [x] **Autonomous Multi-Agent Dynamics**: AI participants converse with each other without waiting for user prompts.
- [x] **Auction-Style Bidding Floor Control**: Continuous 100ms EMA urgency curves factoring silence starvation and airtime limits.
- [x] **Instant Acoustic Barge-In**: Sustained user speech cuts off AI audio and truncates transcripts to heard words.
- [x] **On-Device Vision Biometrics**: Face mesh (478 pts) and pose (33 pts) tracking eye contact, posture, slouch, expressiveness, and gestures with zero cloud video upload.
- [x] **Adaptive Per-User Calibration**: Computes a 25-frame baseline to eliminate camera angle and ergonomic bias.
- [x] **Realistic GD Decision Pacing**: Human handover window (~850ms–1050ms) prevents AI cutting in unnaturally fast.
- [x] **Turn Stampede Mutex Lock**: Concurrency gates ensure multiple AI personas never talk at once.
- [x] **Code-Switching Support**: Automatic detection and conversational generation in English and Hinglish (`en-IN` / `hi-IN`).
- [x] **Studio-Grade Voice Synthesis**: Google Cloud TTS Chirp 3 HD neural voices with authentic Indian prosody.
- [x] **The Evidence Guarantee**: Every placement rubric score is validated against a verbatim transcript substring.
- [x] **Ghost Replay**: Spoken counter-arguments synthesized for missed openings and unchallenged claims.
- [x] **Zero-Trust Security**: Same-origin enforcement, sliding-window rate limiting, input sanitization, and zero-key frontend architecture.
- [x] **Full Offline Resilience**: Deterministic local fallback engine ensures 100% functionality with zero downtime.

---

*Designed and engineered for placement aspirants.*
