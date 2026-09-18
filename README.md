# Upstash Pulse

What people say about Upstash on X, classified by [Jev](https://typesafe.ai) and made filterable with
[Upstash Redis Search](https://upstash.com/docs/redis/search).

Every few minutes the app pulls new public posts mentioning Upstash, sends each one to Jev — TypeSafe AI's
"System One" evaluation model — and stores the post together with its typed classification as a single JSON
document in Upstash Redis. A Redis Search index over those documents powers the whole UI: full-text search,
facet counts, boolean and range filters, sorting and the dashboard aggregations.

Live: https://upstash-pulse.vercel.app

## How it works

```
X recent search ──▶ /api/ingest ──▶ Jev (one call, 11 questions) ──▶ redis.json.set ──▶ Redis Search index
   (since_id)        QStash cron                                                              │
                                                                                    /api/posts, /api/stats
```

1. **Fetch** — `lib/x.ts` calls `GET /2/tweets/search/recent` with `since_id`, so each run only reads posts
   newer than the last one seen. The cursor lives in Redis (`x:last_id`). A `?mode=backfill` run uses the
   full-archive endpoint to pull history older than the oldest stored post.
2. **Classify** — `lib/classify.ts` sends one `experimental_evaluate` call per post with nine typed questions
   (product, intent, topic, sentiment, needs reply, pricing complaint, churn risk, competitor mention,
   urgency). Jev answers all of them in one round trip, each with a probability.
3. **Explain** — the post is split into sentences (`lib/sentences.ts`), and those sentences become the
   options of five extra `choice` questions: *which sentence drove the sentiment / needs reply / churn risk /
   pricing complaint / competitor mention?* The chosen spans are stored as offsets, and the UI highlights
   them in the tweet. Single-sentence posts skip the questions and use their one sentence as evidence.
4. **Store** — the post plus its classification is one `redis.json.set` under `post:<id>`. There is no
   separate index write: Redis Search picks up keys matching the prefix.
5. **Serve** — `/api/posts` runs a query, a facet aggregation and a count in parallel; `/api/stats` runs one
   `aggregate()` for every number on the dashboard.

## Routes

| Route | What it does |
| --- | --- |
| `GET /api/posts` | Feed + facet counts. Filters: `q`, `product`, `intent`, `topic`, `sentiment`, `author`, the four signal flags, `minUrgency`, `minLikes`, `sinceHours`, `sort`, `limit`, `offset`. |
| `GET /api/stats` | Totals, sentiment split, per-product breakdown, top authors, per-day histogram. |
| `POST /api/ingest` | Fetch + classify + index new mentions. Called by a QStash schedule every 5 minutes. |
| `POST /api/ingest?mode=backfill&days=30` | Pull history older than the oldest stored post. |
| `POST /api/ingest?mode=reclassify&limit=200` | Re-run Jev over stored posts (add `&force=1` to redo ones that already have evidence). |

`/api/ingest` carries no secret. It takes a Redis lock and refuses to run more than once a minute, so it is
safe to expose to a scheduler; set `INGEST_SECRET` to require a bearer token as well.

## Running it

```bash
npm install
cp .env.example .env.local   # fill in the four values
npm run dev
```

Then seed some data:

```bash
curl -X POST 'http://localhost:3000/api/ingest?mode=backfill&days=30'
```

### Environment

| Variable | Where it comes from |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | the Redis database in the [Upstash console](https://console.upstash.com) |
| `AI_GATEWAY_API_KEY` | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) — how Jev is reached |
| `X_BEARER_TOKEN` | an app in the [X developer console](https://console.x.com), read-only |
| `INGEST_SECRET` | optional; when set, `/api/ingest` also requires `Authorization: Bearer …` |

### Scheduling

Point a QStash schedule at `/api/ingest` with cron `*/5 * * * *`. Reads are billed per post returned and
`since_id` means a quiet run returns nothing, so polling often costs close to nothing.

## Cost

- **X** — $0.005 per post read, $0.010 per author profile. At the volume "upstash" sees, roughly $0.15–0.45/day.
- **Jev** — $0.042 per 1M input tokens. About 2,500 input tokens per multi-sentence post, so a full
  reclassification of ~350 posts is under a cent.
- **Redis** — two commands per stored post, one query plus one aggregate per page view.

## Layout

```
app/
  api/posts    feed + facets
  api/stats    dashboard aggregations
  api/ingest   fetch, classify, backfill, reclassify
  page.tsx     the whole UI
components/pulse/
  post-card    one mention, with the evidence highlighting
  filter-bar   filters above the feed
lib/
  classify     the Jev call and its questions
  x            X API client
  sentences    sentence splitter with offsets
  reviews      Redis client, index schema, filter builder
  labels       display metadata for the vocabulary
```
