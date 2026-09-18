export type PostView = {
  id: string;
  text: string;
  highlighted?: string;
  createdAt: number;
  source: "x" | "manual";
  author: string;
  authorName?: string;
  url?: string;
  lang: string;
  likes: number;
  impressions: number;
  product: string;
  intent: string;
  topic: string;
  sentiment: string;
  needs_reply: boolean;
  pricing_complaint: boolean;
  churn_risk: boolean;
  competitor_mention: boolean;
  urgency: number;
  confidence: Record<string, number>;
  evidence?: { sentences: [number, number][]; picks?: Partial<Record<string, { i: number; p: number }>> };
  latencyMs: number;
  inputTokens?: number;
};

export type FilterState = {
  q: string;
  source: string[];
  product: string[];
  intent: string[];
  topic: string[];
  sentiment: string[];
  author: string;
  needs_reply: boolean;
  pricing_complaint: boolean;
  churn_risk: boolean;
  competitor_mention: boolean;
  minUrgency: number;
  minLikes: number;
  sinceHours: number;
  sort: string;
};

export const EMPTY_FILTERS: FilterState = {
  q: "",
  source: [],
  product: [],
  intent: [],
  topic: [],
  sentiment: [],
  author: "",
  needs_reply: false,
  pricing_complaint: false,
  churn_risk: false,
  competitor_mention: false,
  minUrgency: 0,
  minLikes: 0,
  sinceHours: 24 * 30,
  sort: "newest",
};

export function toParams(f: FilterState) {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  for (const k of ["source", "product", "intent", "topic", "sentiment"] as const) if (f[k].length) p.set(k, f[k].join(","));
  if (f.author) p.set("author", f.author);
  for (const k of ["needs_reply", "pricing_complaint", "churn_risk", "competitor_mention"] as const) if (f[k]) p.set(k, "1");
  if (f.minUrgency) p.set("minUrgency", String(f.minUrgency));
  if (f.minLikes) p.set("minLikes", String(f.minLikes));
  if (f.sinceHours) p.set("sinceHours", String(f.sinceHours));
  if (f.sort) p.set("sort", f.sort);
  return p.toString();
}

export function activeFilterCount(f: FilterState) {
  return (
    (f.q.trim() ? 1 : 0) +
    f.source.length + f.product.length + f.intent.length + f.topic.length + f.sentiment.length +
    (f.author ? 1 : 0) +
    [f.needs_reply, f.pricing_complaint, f.churn_risk, f.competitor_mention].filter(Boolean).length +
    (f.minUrgency ? 1 : 0) + (f.minLikes ? 1 : 0)
  );
}

export type Facets = Record<"source" | "product" | "intent" | "topic" | "sentiment", Record<string, number>>;

export type Stats = {
  total: number;
  needsReply: number;
  avgUrgency: number;
  reach: number;
  likes: number;
  sentiment: { key: string; count: number }[];
  product: { key: string; count: number }[];
  authors: { key: string; count: number; likes?: number }[];
  perDay: { day: number; count: number }[];
  urgencyBands: number[];
  lastRun: { at: number; fetched: number } | null;
  aggregateMs: number;
};
