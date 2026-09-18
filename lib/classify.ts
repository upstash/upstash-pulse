import { experimental_evaluate as evaluate } from "ai";
import { splitSentences } from "./sentences";

export const PRODUCTS = {
  redis: "Upstash Redis (serverless Redis, caching, KV, ratelimit)",
  qstash: "QStash (message queue, scheduling, cron)",
  workflow: "Upstash Workflow (durable long-running functions)",
  vector: "Upstash Vector (vector database, embeddings)",
  search: "Upstash Search or Redis Search (full-text / semantic search)",
  box: "Upstash Box (sandboxed cloud containers for agents)",
  blob: "Upstash Blob (object / file storage)",
  general: "Upstash as a company or platform, or no specific product",
} as const;

export const INTENTS = {
  praise: "positive feedback, recommendation or thanks",
  complaint: "reporting a problem, bug, outage or frustration",
  question: "asking how to do something or whether something is supported",
  feature_request: "asking for something that does not exist yet",
  comparison: "comparing with competitors or alternatives",
  news: "sharing an announcement, article, tutorial or launch",
  noise: "unrelated, spam, or a bare reaction with no substance",
} as const;

export const TOPICS = {
  pricing: "cost, plans, billing, free tier, value for money",
  performance: "latency, speed, throughput, cold starts",
  reliability: "downtime, data loss, errors, bugs",
  developer_experience: "API design, SDKs, docs, ease of setup",
  integrations: "Vercel, Next.js, Cloudflare, AI frameworks, other tools",
  ai_agents: "AI agents, LLM apps, RAG, MCP",
  support: "customer support or community help",
  security: "auth, compliance, data privacy",
  other: "anything that fits none of the other topics",
} as const;

export const SENTIMENTS = {
  positive: "the author is happy, impressed or recommending",
  neutral: "factual, mixed, or no clear emotion",
  negative: "the author is unhappy, frustrated or complaining",
} as const;

export const EVIDENCE_QUESTIONS = {
  sentiment: "Which single sentence of the post most determines the author's sentiment toward Upstash?",
  needs_reply: "Which single sentence would the Upstash team most need to reply to or act on?",
  churn_risk: "Which single sentence best shows the author might stop using Upstash or switch to something else?",
  pricing_complaint: "Which single sentence best shows a complaint about price or value for money?",
  competitor_mention: "Which single sentence mentions a competing product or service?",
} as const;

export type EvidenceKey = keyof typeof EVIDENCE_QUESTIONS;

/** Which sentence drove each assessment, as offsets into the original text. */
export type Evidence = {
  sentences: [number, number][];
  picks: Partial<Record<EvidenceKey, { i: number; p: number }>>;
};

export type Classification = {
  product: keyof typeof PRODUCTS;
  intent: keyof typeof INTENTS;
  topic: keyof typeof TOPICS;
  sentiment: keyof typeof SENTIMENTS;
  needs_reply: boolean;
  pricing_complaint: boolean;
  churn_risk: boolean;
  competitor_mention: boolean;
  urgency: number; // 0 (low) .. 2 (high), interpolated
  confidence: Record<string, number>;
  evidence: Evidence;
  latencyMs: number;
  inputTokens?: number;
};

export const MODEL = "typesafe-ai/jev";

const CONTEXT =
  "The text is a public post or piece of customer feedback about Upstash, a serverless data platform (Redis, QStash, Workflow, Vector, Search, Box, Blob).";

/** One Jev round trip: nine typed questions against the same post. */
export async function classify(text: string): Promise<Classification> {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error("AI_GATEWAY_API_KEY is not set, so Jev cannot classify this post.");
  }
  const started = performance.now();
  // With more than one sentence we also ask Jev which sentence drove the sentiment and which
  // one the team would need to act on. Same state, same round trip: the sentences become the
  // options of two extra choice questions.
  const sentences = splitSentences(text);
  const options = Object.fromEntries(sentences.map((s, i) => [`s${i}`, s.text]));
  type ChoiceQ = { type: "choice"; instructions: string; criteria: Record<string, string> };
  const evidenceQuestions: Record<string, ChoiceQ> =
    sentences.length > 1
      ? Object.fromEntries(
          Object.entries(EVIDENCE_QUESTIONS).map(([key, instructions]) => [
            `${key}_evidence`,
            { type: "choice" as const, instructions, criteria: options },
          ]),
        )
      : {};
  const result = await evaluate({
    model: MODEL,
    state: { context: CONTEXT, post: text },
    questions: {
      product: { type: "choice", instructions: "Which Upstash product is the post mainly about?", criteria: PRODUCTS },
      intent: { type: "choice", instructions: "What is the author trying to do with this post?", criteria: INTENTS },
      topic: { type: "choice", instructions: "What is the main topic of the post?", criteria: TOPICS },
      sentiment: { type: "choice", instructions: "What is the author's sentiment toward Upstash?", criteria: SENTIMENTS },
      needs_reply: {
        type: "boolean",
        instructions: "Should someone from Upstash reply to this post (a question, a problem, or a complaint that deserves an answer)?",
      },
      pricing_complaint: { type: "boolean", instructions: "Is the author complaining about price or value for money?" },
      churn_risk: { type: "boolean", instructions: "Is the author likely to stop using Upstash or switch to a competitor?" },
      competitor_mention: { type: "boolean", instructions: "Does the post mention a competing product or service (e.g. Redis Cloud, AWS, Vercel KV, Supabase, E2B, Daytona, Pinecone)?" },
      ...evidenceQuestions,
      urgency: {
        type: "score",
        instructions: "How urgently should the Upstash team act on this?",
        criteria: ["low: no action needed", "medium: worth a look this week", "high: act today, customer is blocked or public damage is likely"],
      },
    },
  });
  const latencyMs = Math.round(performance.now() - started);
  const a = result.answers as Record<string, any>;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const choice = (k: string) => ({ value: a[k].choice, p: r3(a[k].probabilities?.[a[k].choice] ?? 1) });
  const bool = (k: string) => ({ value: a[k].probability >= 0.5, p: r3(a[k].probability) });
  const product = choice("product"), intent = choice("intent"), topic = choice("topic"), sentiment = choice("sentiment");
  const needs_reply = bool("needs_reply"), pricing_complaint = bool("pricing_complaint"), churn_risk = bool("churn_risk"), competitor_mention = bool("competitor_mention");
  const pick = (k: string) => {
    const ans = a[k];
    if (!ans?.choice) return undefined;
    const i = Number(String(ans.choice).slice(1));
    return Number.isInteger(i) && i >= 0 && i < sentences.length ? { i, p: r3(ans.probabilities?.[ans.choice] ?? 1) } : undefined;
  };
  // Always stored, so a post that has been through this version is recognisable even when it
  // is a single sentence and there was nothing to choose between.
  const picks: Evidence["picks"] = {};
  if (sentences.length > 1) {
    for (const key of Object.keys(EVIDENCE_QUESTIONS) as EvidenceKey[]) {
      const p = pick(`${key}_evidence`);
      if (p) picks[key] = p;
    }
  } else {
    // One sentence: it is its own evidence, so the UI highlights consistently without a
    // question Jev cannot get wrong. The probability is the assessment's own confidence.
    const own: Record<EvidenceKey, number> = {
      sentiment: sentiment.p,
      needs_reply: needs_reply.p,
      churn_risk: churn_risk.p,
      pricing_complaint: pricing_complaint.p,
      competitor_mention: competitor_mention.p,
    };
    for (const [key, p] of Object.entries(own) as [EvidenceKey, number][]) picks[key] = { i: 0, p };
  }
  const evidence: Evidence = { sentences: sentences.map((s) => [s.start, s.end] as [number, number]), picks };

  return {
    product: product.value,
    intent: intent.value,
    topic: topic.value,
    sentiment: sentiment.value,
    needs_reply: needs_reply.value,
    pricing_complaint: pricing_complaint.value,
    churn_risk: churn_risk.value,
    competitor_mention: competitor_mention.value,
    urgency: r3(a.urgency.score),
    confidence: {
      product: product.p,
      intent: intent.p,
      topic: topic.p,
      sentiment: sentiment.p,
      needs_reply: needs_reply.p,
      pricing_complaint: pricing_complaint.p,
      churn_risk: churn_risk.p,
      competitor_mention: competitor_mention.p,
    },
    evidence,
    latencyMs,
    inputTokens: result.usage?.inputTokens,
  };
}
