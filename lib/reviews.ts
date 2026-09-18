import { Redis, s } from "@upstash/redis";
import type { Classification } from "./classify";

export const redis = Redis.fromEnv();

export const PREFIX = "post:";
export const INDEX = "posts";

export const schema = s.object({
  text: s.string(),
  source: s.keyword(), // "x" | "manual"
  author: s.keyword(),
  lang: s.keyword(),
  likes: s.number("U64"),
  impressions: s.number("U64"),
  product: s.keyword(),
  intent: s.keyword(),
  topic: s.keyword(),
  sentiment: s.keyword(),
  needs_reply: s.boolean(),
  pricing_complaint: s.boolean(),
  churn_risk: s.boolean(),
  competitor_mention: s.boolean(),
  urgency: s.number("F64"),
  createdAt: s.number("U64"),
});

export type Post = Classification & {
  id: string;
  text: string;
  createdAt: number;
  source: "x" | "manual";
  author: string;
  authorName?: string;
  url?: string;
  lang: string;
  likes: number;
  impressions: number;
};

let ready: Promise<unknown> | null = null;
export function getIndex() {
  ready ??= redis.search.createIndex({ name: INDEX, prefix: PREFIX, dataType: "json", existsOk: true, schema });
  return ready.then(() => redis.search.index({ name: INDEX, schema }));
}

export type Filters = {
  q?: string;
  source?: string[];
  product?: string[];
  intent?: string[];
  topic?: string[];
  sentiment?: string[];
  author?: string;
  needs_reply?: boolean;
  pricing_complaint?: boolean;
  churn_risk?: boolean;
  competitor_mention?: boolean;
  minUrgency?: number;
  minLikes?: number;
  sinceHours?: number;
};

export const FLAG_KEYS = ["needs_reply", "pricing_complaint", "churn_risk", "competitor_mention"] as const;

export function buildFilter(f: Filters) {
  // createdAt >= 0 matches every document, so an empty filter set still lists everything.
  const must: Record<string, unknown>[] = [{ createdAt: { $gte: f.sinceHours ? Date.now() - f.sinceHours * 3_600_000 : 0 } }];
  if (f.q?.trim()) must.push({ text: { $smart: f.q.trim() } });
  for (const k of ["source", "product", "intent", "topic", "sentiment"] as const) {
    if (f[k]?.length) must.push({ [k]: { $in: f[k] } });
  }
  if (f.author) must.push({ author: { $eq: f.author } });
  for (const k of FLAG_KEYS) if (f[k]) must.push({ [k]: { $eq: true } });
  if (f.minUrgency) must.push({ urgency: { $gte: f.minUrgency } });
  if (f.minLikes) must.push({ likes: { $gte: f.minLikes } });
  return { $must: must };
}
