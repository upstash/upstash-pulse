import { buildFilter, getIndex, redis } from "@/lib/reviews";
import { parseFilters } from "@/lib/filters";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

// Dashboard numbers: one Redis Search aggregate call over the current filter.
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const f = parseFilters(p);
  const filter = buildFilter(f) as any;
  // The sentiment split ignores the sentiment filter, so the bar keeps its proportions
  // (and stays usable as a switch) once one segment is selected.
  const sentimentFilter = buildFilter({ ...f, sentiment: undefined }) as any;
  const index = await getIndex();
  const started = performance.now();
  const [agg, sentimentAgg, needsReply, lastRun] = await Promise.all([
    index.aggregate({
      filter,
      aggregations: {
        total: { $count: { field: "createdAt" } },
        avgUrgency: { $avg: { field: "urgency" } },
        reach: { $sum: { field: "impressions" } },
        likes: { $sum: { field: "likes" } },
        product: { $terms: { field: "product", size: 20 } },
        authors: { $terms: { field: "author", size: 6 }, $aggs: { likes: { $sum: { field: "likes" } } } },
        perDay: { $histogram: { field: "createdAt", interval: DAY } },
        urgencyBands: { $range: { field: "urgency", ranges: [{ to: 0.75 }, { from: 0.75, to: 1.5 }, { from: 1.5 }] } },
      },
    } as any),
    index.aggregate({ filter: sentimentFilter, aggregations: { sentiment: { $terms: { field: "sentiment", size: 5 } } } } as any),
    index.count({ filter: { $must: [...filter.$must, { needs_reply: { $eq: true } }] } as any }),
    redis.get<{ at: number; fetched: number }>("x:last_run"),
  ]);
  const a = agg as any;
  const terms = (k: string) => (a[k]?.buckets ?? []).map((b: any) => ({ key: b.key, count: b.docCount, likes: b.likes?.value }));
  return Response.json({
    total: a.total?.value ?? 0,
    needsReply: needsReply.count,
    avgUrgency: a.avgUrgency?.value ?? 0,
    reach: a.reach?.value ?? 0,
    likes: a.likes?.value ?? 0,
    sentiment: ((sentimentAgg as any).sentiment?.buckets ?? []).map((b: any) => ({ key: b.key, count: b.docCount })),
    product: terms("product"),
    authors: terms("authors"),
    perDay: (a.perDay?.buckets ?? []).map((b: any) => ({ day: b.key, count: b.docCount })),
    urgencyBands: (a.urgencyBands?.buckets ?? []).map((b: any) => b.docCount),
    lastRun,
    aggregateMs: Math.round(performance.now() - started),
  });
}
