import { buildFilter, getIndex, redis } from "@/lib/reviews";
import { parseFilters } from "@/lib/filters";

export const dynamic = "force-dynamic";

const SORTS: Record<string, object> = {
  newest: { orderBy: { createdAt: "DESC" } },
  likes: { orderBy: { likes: "DESC" } },
  reach: { orderBy: { impressions: "DESC" } },
  urgency: { orderBy: { urgency: "DESC" } },
  relevance: {},
};

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const f = parseFilters(p);
  const filter = buildFilter(f) as any;
  const sort = SORTS[p.get("sort") ?? ""] ? p.get("sort")! : f.q ? "relevance" : "newest";
  const limit = Math.min(Number(p.get("limit") ?? 30), 100);
  const offset = Number(p.get("offset") ?? 0);

  const index = await getIndex();
  const started = performance.now();
  const [hits, facets, matched] = await Promise.all([
    index.query({
      filter,
      limit,
      offset,
      ...SORTS[sort],
      ...(f.q.trim() ? { highlight: { fields: ["text"], preTag: "<mark>", postTag: "</mark>" } } : {}),
    } as any),
    index.aggregate({
      filter,
      aggregations: {
        source: { $terms: { field: "source", size: 5 } },
        product: { $terms: { field: "product", size: 20 } },
        intent: { $terms: { field: "intent", size: 20 } },
        topic: { $terms: { field: "topic", size: 20 } },
        sentiment: { $terms: { field: "sentiment", size: 5 } },
      },
    } as any),
    index.count({ filter }),
  ]);
  const searchMs = Math.round(performance.now() - started);
  const buckets = (name: string) =>
    Object.fromEntries(((facets as any)[name]?.buckets ?? []).map((b: any) => [b.key, b.docCount]));

  // With `highlight` on, Redis Search replaces the returned text with a marked *snippet*,
  // so the full documents are read back separately and the snippet is kept only for the
  // matched words (the client re-marks them in the full text).
  let posts = (hits as any[]).map((h) => ({ ...h.data, highlighted: f.q.trim() ? h.data?.text : undefined }));
  if (f.q.trim() && posts.length) {
    const full = await redis.json.mget<any[]>((hits as any[]).map((h) => h.key), "$");
    posts = posts.map((p, i) => ({ ...(full[i]?.[0] ?? p), highlighted: p.highlighted }));
  }

  return Response.json({
    posts,
    facets: Object.fromEntries(["source", "product", "intent", "topic", "sentiment"].map((k) => [k, buckets(k)])),
    matched: matched.count,
    sort,
    searchMs,
  });
}
