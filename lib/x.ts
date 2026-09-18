// Incremental fetch of public posts mentioning Upstash via the X API v2 recent search endpoint.
export const X_QUERY = "(upstash OR @upstash OR url:upstash OR qstash) -from:upstash -is:retweet";

export type Tweet = {
  id: string;
  text: string;
  author: string;
  authorName?: string;
  url: string;
  createdAt: number;
  likes: number;
  impressions: number;
  lang?: string;
};

type Page = {
  data?: { id: string; text: string; author_id: string; created_at: string; lang?: string; public_metrics?: Record<string, number> }[];
  includes?: { users?: { id: string; username: string; name?: string }[] };
  meta?: { newest_id?: string; next_token?: string; result_count: number };
  title?: string;
  detail?: string;
};

/**
 * Returns tweets newer than `sinceId`, newest first. With no `sinceId` it backfills
 * the last `backfillDays` days, paging until `maxTweets` to bound the pay-per-use bill.
 */
export async function fetchMentions(opts: { sinceId?: string; endTime?: number; backfillDays?: number; maxTweets?: number; archive?: boolean }) {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) throw new Error("X_BEARER_TOKEN is not set.");
  const maxTweets = opts.maxTweets ?? 200;
  const tweets: Tweet[] = [];
  let nextToken: string | undefined;
  let newestId: string | undefined;

  do {
    const params = new URLSearchParams({
      query: X_QUERY,
      max_results: "100",
      sort_order: "recency",
      "tweet.fields": "created_at,public_metrics,author_id,lang",
      expansions: "author_id",
      "user.fields": "username,name",
    });
    if (opts.sinceId) params.set("since_id", opts.sinceId);
    else params.set("start_time", new Date(Date.now() - (opts.backfillDays ?? 7) * 86_400_000).toISOString());
    if (opts.endTime) params.set("end_time", new Date(opts.endTime).toISOString());
    if (nextToken) params.set("next_token", nextToken);

    // The full-archive endpoint goes back further than 7 days but is rate limited harder, so pace it.
    const endpoint = opts.archive ? "all" : "recent";
    if (opts.archive && nextToken) await new Promise((r) => setTimeout(r, 1100));
    const res = await fetch(`https://api.x.com/2/tweets/search/${endpoint}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    let page = (await res.json()) as Page;
    if (res.status >= 500) {
      // The archive endpoint occasionally 500s on big pages; back off once and retry with a smaller page.
      await new Promise((r) => setTimeout(r, 3000));
      params.set("max_results", "50");
      const retry = await fetch(`https://api.x.com/2/tweets/search/${endpoint}?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      page = (await retry.json()) as Page;
      if (!retry.ok) throw new Error(`X API ${retry.status}: ${page.title ?? ""} ${page.detail ?? ""}`.trim());
    } else if (!res.ok) throw new Error(`X API ${res.status}: ${page.title ?? ""} ${page.detail ?? ""}`.trim());

    const users = new Map((page.includes?.users ?? []).map((u) => [u.id, u]));
    for (const t of page.data ?? []) {
      const u = users.get(t.author_id);
      const author = u?.username ?? t.author_id;
      tweets.push({
        id: t.id,
        text: t.text,
        author,
        authorName: u?.name,
        url: `https://x.com/${author}/status/${t.id}`,
        createdAt: Date.parse(t.created_at),
        likes: t.public_metrics?.like_count ?? 0,
        impressions: t.public_metrics?.impression_count ?? 0,
        lang: t.lang,
      });
    }
    newestId ??= page.meta?.newest_id;
    nextToken = page.meta?.next_token;
  } while (nextToken && tweets.length < maxTweets);

  return { tweets, newestId };
}
