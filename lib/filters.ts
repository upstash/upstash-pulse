import { FLAG_KEYS, type Filters } from "./reviews";

export function parseFilters(p: URLSearchParams): Filters & { q: string } {
  const list = (k: string) => p.get(k)?.split(",").filter(Boolean);
  return {
    q: p.get("q") ?? "",
    source: list("source"),
    product: list("product"),
    intent: list("intent"),
    topic: list("topic"),
    sentiment: list("sentiment"),
    author: p.get("author") ?? undefined,
    ...Object.fromEntries(FLAG_KEYS.map((k) => [k, p.get(k) === "1"])),
    minUrgency: Number(p.get("minUrgency") ?? 0),
    minLikes: Number(p.get("minLikes") ?? 0),
    sinceHours: Number(p.get("sinceHours") ?? 0),
  };
}

