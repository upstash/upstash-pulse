import { classify } from "@/lib/classify";
import { getIndex, PREFIX, redis, type Post } from "@/lib/reviews";
import { fetchByIds, fetchMentions } from "@/lib/x";

const LAST_ID_KEY = "x:last_id";
const LAST_RUN_KEY = "x:last_run";
const LOCK_KEY = "x:ingest_lock";
const COOLDOWN_KEY = "x:ingest_cooldown";

export const maxDuration = 300;

// Called by a QStash schedule every 5 minutes (GET or POST). Fetches mentions newer than the last seen post,
// classifies each with Jev, and indexes them next to the manually pasted feedback.
export async function POST(request: Request) {
  return ingest(request);
}

export async function GET(request: Request) {
  return ingest(request);
}

/**
 * POST ?mode=repair re-fetches posts that were stored truncated (X only returns the first ~280
 * characters in `text`) and reclassifies the ones whose text actually changed.
 */
async function repair(all: boolean) {
  const index = await getIndex();
  const hits = await index.query({ filter: { createdAt: { $gte: 0 } }, orderBy: { createdAt: "DESC" }, limit: 1000 } as any);
  const posts = (hits as any[]).map((h) => h.data);
  // X caps posts at 280 *weighted* characters, and invisible joiners inflate that count, so a
  // cut post can be well under 280 actual characters. The cheap heuristic catches the obvious
  // ones; `?all=1` refetches everything, which costs one X read per post.
  const suspect = all
    ? posts
    : posts.filter((p: any) => {
        const t = p.text.trim();
        if (t.length >= 268 || /\u2026\s*$/.test(t)) return true;
        return t.length >= 180 && !/[.!?\u2026\)\]"\u201d]$/.test(t) && !/https?:\/\/\S+$/.test(t);
      });
  const texts = await fetchByIds(suspect.map((p: any) => p.id.replace(/^x-/, "")));

  const changed = suspect.filter((p: any) => {
    const full = texts.get(p.id.replace(/^x-/, ""));
    return full && full !== p.text;
  });
  const results = await Promise.allSettled(
    changed.map(async (p: any) => {
      const text = texts.get(p.id.replace(/^x-/, ""))!;
      const classification = await classify(text);
      await redis.json.set(PREFIX + p.id, "$", { ...p, text, ...classification } as any);
    }),
  );
  const failed = results.filter((r) => r.status === "rejected");
  if (changed.length) await index.waitIndexing();
  return Response.json({
    checked: suspect.length,
    repaired: changed.length - failed.length,
    failed: failed.map((f: any) => f.reason?.message ?? String(f.reason)).slice(0, 3),
  });
}

/** POST ?mode=reclassify re-runs Jev over already stored posts, keeping their text and metrics. */
async function reclassify(limit: number, force: boolean) {
  const index = await getIndex();
  const hits = await index.query({ filter: { createdAt: { $gte: 0 } }, orderBy: { createdAt: "DESC" }, limit: 1000 } as any);
  const todo = (hits as any[]).map((h) => h.data).filter((d) => {
      if (force || !d.evidence?.picks) return true;
      const { sentences = [], picks = {} } = d.evidence;
      // Redo anything whose spans are missing or point outside the sentence list.
      if (!sentences.length || !Object.keys(picks).length) return true;
      return Object.values(picks).some((p: any) => !sentences[p.i]);
    }).slice(0, limit);
  const results = await Promise.allSettled(
    todo.map(async (post: any) => {
      const classification = await classify(post.text);
      await redis.json.set(PREFIX + post.id, "$", { ...post, ...classification } as any);
    }),
  );
  const failed = results.filter((r) => r.status === "rejected");
  if (todo.length) await index.waitIndexing();
  return Response.json({
    reclassified: todo.length - failed.length,
    remaining: (hits as any[]).length - todo.length,
    failed: failed.map((f: any) => f.reason?.message ?? String(f.reason)).slice(0, 3),
  });
}

async function ingest(request: Request) {
  // The QStash schedule passes the secret as ?key=, manual calls as a bearer header.
  const secret = process.env.INGEST_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? new URL(request.url).searchParams.get("key");
  if (secret && given !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (new URL(request.url).searchParams.get("mode") === "repair") {
    return repair(new URL(request.url).searchParams.get("all") === "1");
  }
  if (new URL(request.url).searchParams.get("mode") === "reclassify") {
    const p = new URL(request.url).searchParams;
    return reclassify(Math.min(Number(p.get("limit") ?? 60), 200), p.get("force") === "1");
  }

  // Skip if a previous run is still going, and never fetch more often than once a minute,
  // so the endpoint can be called by a schedule without a shared secret.
  const locked = await redis.set(LOCK_KEY, Date.now(), { nx: true, ex: 300 });
  if (!locked) return Response.json({ skipped: "ingest already running" });
  const fresh = await redis.set(COOLDOWN_KEY, Date.now(), { nx: true, ex: 60 });
  if (!fresh) {
    await redis.del(LOCK_KEY);
    return Response.json({ skipped: "ran less than a minute ago" });
  }

  const started = performance.now();
  try {
    // ?mode=backfill&days=30 pulls history older than the oldest stored post via the full-archive
    // endpoint. The normal run fetches everything newer than the last seen id.
    const url = new URL(request.url);
    const backfill = url.searchParams.get("mode") === "backfill";
    const days = Math.min(Number(url.searchParams.get("days") ?? 30), 365);
    const sinceId = backfill ? undefined : ((await redis.get<string>(LAST_ID_KEY)) ?? undefined);
    const endTime = backfill ? await oldestStoredTime() : undefined;
    const { tweets, newestId } = await fetchMentions({ sinceId, endTime, backfillDays: backfill ? days : 7, maxTweets: backfill ? 2000 : 300, archive: backfill });

    const index = await getIndex();
    const results = await Promise.allSettled(
      tweets.map(async (t) => {
        const classification = await classify(t.text);
        const post: Post = {
          id: `x-${t.id}`,
          text: t.text,
          createdAt: t.createdAt,
          source: "x",
          author: t.author,
          authorName: t.authorName,
          url: t.url,
          lang: t.lang ?? "und",
          likes: t.likes,
          impressions: t.impressions,
          ...classification,
        };
        await redis.json.set(PREFIX + post.id, "$", post as any);
      }),
    );
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (tweets.length) await index.waitIndexing();
    // Only advance the cursor if everything was stored, so failures get retried next run.
    if (!backfill) {
      if (newestId && failed.length === 0) await redis.set(LAST_ID_KEY, newestId);
      await redis.set(LAST_RUN_KEY, { at: Date.now(), fetched: tweets.length });
    }

    return Response.json({
      fetched: tweets.length,
      indexed: tweets.length - failed.length,
      failed: failed.map((f) => f.reason?.message ?? String(f.reason)).slice(0, 5),
      sinceId: sinceId ?? null,
      newestId: newestId ?? sinceId ?? null,
      ms: Math.round(performance.now() - started),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    await redis.del(LOCK_KEY);
  }
}

async function oldestStoredTime() {
  const index = await getIndex();
  const [oldest] = await index.query({ filter: { source: { $eq: "x" } }, orderBy: { createdAt: "ASC" }, limit: 1, select: { createdAt: true } } as any);
  return oldest ? (oldest as any).data.createdAt - 1000 : undefined;
}
