"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterBar } from "@/components/pulse/filter-bar";
import { PostCard } from "@/components/pulse/post-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SENTIMENT_META, compact, timeAgo } from "@/lib/labels";
import { EMPTY_FILTERS, activeFilterCount, toParams, type Facets, type FilterState, type PostView, type Stats } from "@/lib/types";

const PAGE = 30;

type Feed = { posts: PostView[]; facets: Facets; matched: number; sort: string; searchMs: number };

export default function Page() {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [stats, setStats] = useState<Stats | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const reqId = useRef(0);

  const params = useMemo(() => toParams(filters), [filters]);
  const patch = useCallback((p: Partial<FilterState>) => setFilters((f) => ({ ...f, ...p })), []);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    const [f, s] = await Promise.all([
      fetch(`/api/posts?${params}&limit=${PAGE}`).then((r) => r.json()),
      fetch(`/api/stats?${params}`).then((r) => r.json()),
    ]);
    if (id !== reqId.current) return; // a newer request finished first
    setFeed(f);
    setStats(s);
  }, [params]);

  // Debounced refetch on filter changes, plus a periodic refresh so new mentions show up on their own.
  useEffect(() => {
    const t = setTimeout(load, 120);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    const t = setInterval(() => {
      load();
      setNow(Date.now());
    }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function loadMore() {
    if (!feed || loadingMore) return;
    setLoadingMore(true);
    const more: Feed = await fetch(`/api/posts?${params}&limit=${PAGE}&offset=${feed.posts.length}`).then((r) => r.json());
    setFeed((cur) => (cur ? { ...cur, posts: [...cur.posts, ...more.posts] } : cur));
    setLoadingMore(false);
  }

  const active = activeFilterCount(filters);

  return (
    <div className="bg-background min-h-screen">
      <header className="bg-background/85 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            {/* the mark ships in two variants; each one is drawn for its own background */}
            <img src="/upstash-mark-light.svg" alt="" width={32} height={32} className="size-8 dark:hidden" />
            <img src="/upstash-mark-dark.svg" alt="" width={32} height={32} className="hidden size-8 dark:block" />
            <h1 className="text-[15px] font-semibold tracking-tight whitespace-nowrap">Upstash Pulse</h1>
          </div>
          <div className="relative ml-auto w-full max-w-xs">
            <svg viewBox="0 0 24 24" className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <Input
              value={filters.q}
              onChange={(e) => {
                const q = e.target.value;
                patch({ q, sort: q.trim() && filters.sort === "newest" ? "relevance" : !q.trim() && filters.sort === "relevance" ? "newest" : filters.sort });
              }}
              placeholder="Search"
              className="h-9 rounded-full pl-9"
            />
            {filters.q && (
              <button onClick={() => patch({ q: "" })} className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 text-xs" aria-label="Clear search">✕</button>
            )}
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Summary stats={stats} filters={filters} onFilter={patch} now={now} />

        <div className="mt-6">
          <FilterBar filters={filters} facets={feed?.facets} onChange={patch} onClear={() => setFilters({ ...EMPTY_FILTERS, sinceHours: filters.sinceHours })} />
        </div>

        <section className="bg-card mt-4 overflow-hidden rounded-2xl border">
          <div className="divide-y">
            {!feed && [0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 px-5 py-4"><Skeleton className="size-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div></div>
            ))}
            {feed?.posts.length === 0 && (
              <div className="text-muted-foreground px-5 py-16 text-center text-sm">
                {active ? "Nothing matches these filters." : "No mentions yet."}
              </div>
            )}
            {feed?.posts.map((p) => <PostCard key={p.id} post={p} filters={filters} onFilter={patch} />)}
          </div>
          {feed && feed.posts.length < feed.matched && (
            <div className="border-t p-3 text-center">
              <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : `Load ${Math.min(PAGE, feed.matched - feed.posts.length)} more (${feed.matched - feed.posts.length} left)`}
              </Button>
            </div>
          )}
        </section>

        <footer className="text-muted-foreground mt-8 text-center text-xs leading-relaxed">
          Mentions from X, classified by <a href="https://typesafe.ai" className="hover:text-foreground underline underline-offset-2">TypeSafe AI Jev</a>, stored and searched with{" "}
          <a href="https://upstash.com/docs/redis/search" className="hover:text-foreground underline underline-offset-2">Upstash Redis Search</a>.
        </footer>
      </main>
    </div>
  );
}

function Summary({ stats, filters, onFilter, now }: { stats?: Stats; filters: FilterState; onFilter: (p: Partial<FilterState>) => void; now: number }) {
  const days = useMemo(() => fillDays(stats?.perDay ?? [], filters.sinceHours), [stats, filters.sinceHours]);
  const max = Math.max(1, ...days.map((d) => d.count));
  const synced = stats?.lastRun && now - stats.lastRun.at < 15 * 60_000;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-muted-foreground text-sm">What people are saying about Upstash on X</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <Stat value={stats ? compact(stats.total) : "–"} label="mentions" />
            <Stat value={stats ? compact(stats.needsReply) : "–"} label="need a reply" onClick={() => onFilter({ needs_reply: !filters.needs_reply })} active={filters.needs_reply} />
          </div>
        </div>
        <div className="w-full sm:w-56">
          <div className="flex h-10 items-end gap-[2px]" role="img" aria-label={`Mentions per day: ${days.map((d) => d.count).join(", ")}`}>
            {days.map((d) => (
              <div key={d.day} className="flex h-full flex-1 items-end" title={`${new Date(d.day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${d.count}`}>
                <div className="bg-foreground/70 hover:bg-foreground w-full rounded-t-[2px] transition-colors" style={{ height: `${Math.max(d.count ? 8 : 3, (d.count / max) * 100)}%` }} />
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-1.5 flex items-center justify-end gap-1.5 text-[11px]">
            <span className={`size-1.5 rounded-full ${synced ? "bg-emerald-500" : "bg-zinc-400"}`} />
            {stats?.lastRun ? `synced ${timeAgo(stats.lastRun.at)} ago` : "not synced"}
          </p>
        </div>
      </div>

      <SentimentBar stats={stats} filters={filters} onFilter={onFilter} />
    </section>
  );
}

const SENTIMENTS = ["positive", "neutral", "negative"] as const;

/** The sentiment split doubles as the sentiment filter: click a segment or a legend item. */
function SentimentBar({ stats, filters, onFilter }: { stats?: Stats; filters: FilterState; onFilter: (p: Partial<FilterState>) => void }) {
  const counts = Object.fromEntries((stats?.sentiment ?? []).map((s) => [s.key, s.count])) as Record<string, number>;
  const total = SENTIMENTS.reduce((a, k) => a + (counts[k] ?? 0), 0);
  const selected = filters.sentiment[0];
  const toggle = (k: string) => onFilter({ sentiment: selected === k ? [] : [k] });

  return (
    <div>
      <div className="flex h-2.5 gap-[3px]" role="img" aria-label={`Sentiment: ${SENTIMENTS.map((k) => `${counts[k] ?? 0} ${k}`).join(", ")}`}>
        {total === 0 ? (
          <div className="bg-muted h-full w-full rounded-full" />
        ) : (
          SENTIMENTS.map((k) => {
            const n = counts[k] ?? 0;
            if (!n) return null;
            const dimmed = selected && selected !== k;
            return (
              <button
                key={k}
                onClick={() => toggle(k)}
                title={`${SENTIMENT_META[k].label}: ${n}`}
                aria-label={`Filter by ${SENTIMENT_META[k].label.toLowerCase()} mentions`}
                aria-pressed={selected === k}
                style={{ width: `${(n / total) * 100}%` }}
                className={`h-full rounded-full transition-opacity ${SENTIMENT_META[k].dot} ${dimmed ? "opacity-25 hover:opacity-50" : "hover:opacity-80"}`}
              />
            );
          })
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {SENTIMENTS.map((k) => {
          const n = counts[k] ?? 0;
          const active = selected === k;
          return (
            <button
              key={k}
              onClick={() => toggle(k)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 transition ${active ? "font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              <span className={`size-2 rounded-full ${SENTIMENT_META[k].dot} ${selected && !active ? "opacity-40" : ""}`} />
              <span className="tabular-nums">{total ? Math.round((n / total) * 100) : 0}%</span>
              {SENTIMENT_META[k].label.toLowerCase()}
            </button>
          );
        })}
        {selected && (
          <button onClick={() => onFilter({ sentiment: [] })} className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline">
            show all
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label, dot, onClick, active }: { value: string; label: string; dot?: string; onClick?: () => void; active?: boolean }) {
  const Cmp: any = onClick ? "button" : "div";
  return (
    <Cmp onClick={onClick} className={`flex items-baseline gap-1.5 rounded-md text-left ${onClick ? "hover:opacity-80" : ""} ${active ? "underline decoration-2 underline-offset-4" : ""}`}>
      {dot && <span className={`mb-0.5 inline-block size-2 self-center rounded-full ${dot}`} />}
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      <span className="text-muted-foreground text-sm">{label}</span>
    </Cmp>
  );
}

function fillDays(perDay: { day: number; count: number }[], sinceHours: number) {
  const DAY = 86_400_000;
  const n = sinceHours ? Math.max(2, Math.min(30, Math.ceil(sinceHours / 24))) : 30;
  const today = Math.floor(Date.now() / DAY) * DAY;
  const byDay = new Map(perDay.map((d) => [Math.floor(d.day / DAY) * DAY, d.count]));
  return Array.from({ length: n }, (_, i) => {
    const day = today - (n - 1 - i) * DAY;
    return { day, count: byDay.get(day) ?? 0 };
  });
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
  }
  return (
    <button onClick={toggle} aria-label="Toggle theme" className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-full border transition">
      {dark ? (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
    </button>
  );
}
