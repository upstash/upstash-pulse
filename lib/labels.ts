// Shared display metadata for the classification vocabulary. Colors follow the entity, never its rank.
export const PRODUCT_META: Record<string, { label: string; color: string }> = {
  redis: { label: "Redis", color: "bg-red-500" },
  qstash: { label: "QStash", color: "bg-blue-500" },
  workflow: { label: "Workflow", color: "bg-purple-500" },
  vector: { label: "Vector", color: "bg-orange-500" },
  search: { label: "Search", color: "bg-teal-500" },
  box: { label: "Box", color: "bg-pink-500" },
  blob: { label: "Blob", color: "bg-lime-600" },
  general: { label: "General", color: "bg-zinc-400" },
};

export const INTENT_META: Record<string, { label: string; icon: string }> = {
  praise: { label: "Praise", icon: "✨" },
  complaint: { label: "Complaint", icon: "⚠️" },
  question: { label: "Question", icon: "❓" },
  feature_request: { label: "Feature request", icon: "💡" },
  comparison: { label: "Comparison", icon: "⚖️" },
  news: { label: "News", icon: "📣" },
  noise: { label: "Noise", icon: "·" },
};

export const SENTIMENT_META: Record<string, { label: string; className: string; dot: string; highlight: string }> = {
  positive: { label: "Positive", className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", dot: "bg-emerald-500", highlight: "bg-emerald-500/15 dark:bg-emerald-400/20" },
  neutral: { label: "Neutral", className: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/30", dot: "bg-zinc-400", highlight: "" },
  negative: { label: "Negative", className: "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30", dot: "bg-rose-500", highlight: "bg-rose-500/15 dark:bg-rose-400/20" },
};

export const TOPIC_LABEL: Record<string, string> = {
  pricing: "Pricing",
  performance: "Performance",
  reliability: "Reliability",
  developer_experience: "DX",
  integrations: "Integrations",
  ai_agents: "AI agents",
  support: "Support",
  security: "Security",
  other: "Other",
};

export const FLAG_META: Record<string, { label: string; short: string; className: string; highlight: string }> = {
  needs_reply: { label: "Needs reply", short: "Reply", className: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40", highlight: "bg-amber-500/18 dark:bg-amber-400/25" },
  pricing_complaint: { label: "Pricing complaint", short: "Pricing complaint", className: "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/30", highlight: "bg-violet-500/18 dark:bg-violet-400/25" },
  churn_risk: { label: "Churn risk", short: "Churn risk", className: "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30", highlight: "bg-rose-500/18 dark:bg-rose-400/25" },
  competitor_mention: { label: "Competitor mentioned", short: "Competitor", className: "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30", highlight: "bg-sky-500/18 dark:bg-sky-400/25" },
};

export const SORT_OPTIONS = [
  { key: "newest", label: "Newest" },
  { key: "urgency", label: "Most urgent" },
  { key: "likes", label: "Most liked" },
  { key: "reach", label: "Most viewed" },
  { key: "relevance", label: "Relevance" },
];

export const TIME_WINDOWS = [
  { key: 24, label: "24h" },
  { key: 24 * 7, label: "7d" },
  { key: 24 * 30, label: "30d" },
  { key: 0, label: "All" },
];

export function urgencyLabel(u: number) {
  return u >= 1.5 ? "high" : u >= 0.75 ? "medium" : "low";
}

export function timeAgo(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function compact(n: number) {
  return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
