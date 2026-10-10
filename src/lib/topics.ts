import type { GDFormat } from "./types";

export interface Topic {
  id: string;
  format: GDFormat;
  title: string;
  /** One-line hook shown on the card. */
  hook: string;
  /** Fact sheet for case-based GDs. */
  brief?: string;
}

export const FORMATS: { id: GDFormat; label: string; blurb: string }[] = [
  { id: "abstract", label: "Abstract", blurb: "One-liners that test structure and imagination." },
  { id: "controversial", label: "Controversial", blurb: "Polarising topics that test composure." },
  { id: "current", label: "Current affairs", blurb: "India-first topics with real numbers in play." },
  { id: "case", label: "Case-based", blurb: "A business scenario with a fact sheet." },
];

export const TOPICS: Topic[] = [
  { id: "zero", format: "abstract", title: "Zero is more powerful than one", hook: "Defend a paradox in under 30 seconds." },
  { id: "silence", format: "abstract", title: "Silence is louder than words", hook: "Where does restraint beat rhetoric?" },
  { id: "glass", format: "abstract", title: "Is the glass half-empty or half-full?", hook: "Optimism, framing and decisions." },
  { id: "grass", format: "abstract", title: "The grass is greener on the other side", hook: "Ambition vs. contentment." },

  { id: "influencers", format: "controversial", title: "Should social media influencers be regulated like advertisers?", hook: "Free speech vs. consumer protection." },
  { id: "coaching", format: "controversial", title: "Should entrance-exam coaching be banned?", hook: "Kota, equity and the pressure cooker." },
  { id: "wfo", format: "controversial", title: "Work from office vs remote: who actually wins?", hook: "Productivity, culture and cost." },
  { id: "fourday", format: "controversial", title: "Is a four-day work week realistic for India?", hook: "Output, labour law and competitiveness." },

  { id: "upi", format: "current", title: "UPI is everywhere: is India's digital payment boom sustainable?", hook: "Zero-MDR economics and fraud." },
  { id: "gig", format: "current", title: "Gig economy: freedom or exploitation?", hook: "Delivery partners, benefits and flexibility." },
  { id: "ai-jobs", format: "current", title: "AI will take entry-level jobs: should freshers worry?", hook: "Reskilling, hiring and the first rung." },
  { id: "foundation", format: "current", title: "Should India build its own foundation models?", hook: "Sovereignty vs. cost and talent." },

  {
    id: "runway",
    format: "case",
    title: "Your startup has 6 months of runway: cut costs or raise a down round?",
    hook: "Decide under pressure with limited facts.",
    brief:
      "SaaS startup, 40 employees, ₹1.2 Cr monthly burn, ₹7 Cr cash (≈6 months). Revenue ₹55 L/month growing 4% MoM. A VC offers ₹10 Cr at 40% lower valuation than last round. Cutting 30% of staff would extend runway to 9 months but slow product delivery.",
  },
  {
    id: "salary-day",
    format: "case",
    title: "A bank's app crashed on salary day: how do you respond?",
    hook: "Customers, regulators and employees all want answers.",
    brief:
      "A mid-size private bank's mobile app was down for 5 hours on the 1st of the month. 2.1 lakh customers affected, 14,000 complaints on social media, RBI has asked for an incident report within 48 hours. Root cause: a failed database migration.",
  },
  {
    id: "cloud-kitchen",
    format: "case",
    title: "Cloud kitchen expansion: tier-2 city or another metro?",
    hook: "Unit economics vs. market size.",
    brief:
      "A cloud-kitchen brand makes ₹18 L/month per outlet in Bengaluru with 11% margins. Tier-2 city outlets cost 40% less to run but average ₹9 L/month in sales. You can open 6 new outlets this year with ₹3 Cr.",
  },
];

export const GOALS = [
  "Start stronger",
  "Listen and build on others",
  "Speak less, say more",
  "Hold my ground",
  "End with a strong close",
];
