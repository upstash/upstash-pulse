"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FLAG_META, INTENT_META, PRODUCT_META, SENTIMENT_META, TOPIC_LABEL, compact, timeAgo, urgencyLabel } from "@/lib/labels";
import type { FilterState, PostView } from "@/lib/types";

const pct = (n?: number) => (n == null ? "" : `${Math.round(n * 100)}%`);

// Long posts are folded to keep the feed scannable; a search always shows everything.
const FOLD_CHARS = 520;

export function XLogo({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// The one signal worth surfacing on the card, strongest first.
function primarySignal(post: PostView) {
  if (post.churn_risk) return "churn_risk";
  if (post.needs_reply) return "needs_reply";
  if (post.pricing_complaint) return "pricing_complaint";
  if (post.competitor_mention) return "competitor_mention";
  return null;
}

export function PostCard({ post, filters, onFilter }: { post: PostView; filters: FilterState; onFilter: (patch: Partial<FilterState>) => void }) {
  const product = PRODUCT_META[post.product] ?? PRODUCT_META.general;
  const sentiment = SENTIMENT_META[post.sentiment] ?? SENTIMENT_META.neutral;
  const signal = primarySignal(post);
  const urgency = urgencyLabel(post.urgency);
  const why = evidenceText(post);
  const [expanded, setExpanded] = useState(false);
  const folded = post.text.length > FOLD_CHARS && !expanded && !post.highlighted;

  return (
    <article className="px-5 py-4">
      <div className="flex gap-3">
        <Avatar className="size-10 shrink-0">
          <AvatarImage src={`https://unavatar.io/x/${post.author}?fallback=false`} alt="" />
          <AvatarFallback className="text-xs font-semibold">{post.author.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm leading-tight">
            <span className="truncate font-semibold">{post.authorName ?? post.author}</span>
            <button onClick={() => onFilter({ author: filters.author === post.author ? "" : post.author })} className="text-muted-foreground truncate hover:underline" title="Only this author">
              @{post.author}
            </button>
            <time className="text-muted-foreground shrink-0" dateTime={new Date(post.createdAt).toISOString()} title={new Date(post.createdAt).toLocaleString()}>
              {timeAgo(post.createdAt)}
            </time>
            {post.url && (
              <a href={post.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground ml-auto shrink-0" title="Open on X">
                <XLogo />
              </a>
            )}
          </div>

          <div className={folded ? "relative max-h-44 overflow-hidden" : undefined}>
            <p className="mt-1 text-[15px] leading-relaxed break-words whitespace-pre-wrap">{renderBody(post)}</p>
            {folded && <div className="from-card pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t to-transparent" />}
          </div>
          {post.text.length > FOLD_CHARS && !post.highlighted && (
            <button onClick={() => setExpanded((v) => !v)} className="text-muted-foreground hover:text-foreground mt-1 text-sm">
              {expanded ? "Show less" : "Show more"}
            </button>
          )}

          <div className="text-muted-foreground mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <button onClick={() => onFilter({ sentiment: filters.sentiment.length === 1 && filters.sentiment[0] === post.sentiment ? [] : [post.sentiment] })} className="hover:text-foreground inline-flex items-center gap-1.5" title={`${pct(post.confidence?.sentiment)} confident`}>
              <span className={`size-2 rounded-full ${sentiment.dot}`} />
              {sentiment.label}
            </button>
            <button onClick={() => onFilter({ product: filters.product.length === 1 && filters.product[0] === post.product ? [] : [post.product] })} className="hover:text-foreground inline-flex items-center gap-1.5" title={`${pct(post.confidence?.product)} confident`}>
              <span className={`size-2 rounded-full ${product.color}`} />
              {product.label}
            </button>
            {signal && (
              <span className={`inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] font-medium ${FLAG_META[signal].className}`} title={`${pct(post.confidence?.[signal])} probability`}>
                {FLAG_META[signal].label}
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-3">
              {post.likes > 0 && <span title="Likes">♥ {compact(post.likes)}</span>}
              {post.impressions > 0 && <span title="Views">{compact(post.impressions)} views</span>}
            </span>
          </div>

        </div>
      </div>
    </article>
  );
}


/**
 * Redis Search returns a highlighted *snippet*, so we only take the marked words from it
 * and mark those in the full text ourselves. This keeps fuzzy matches ("uplaod" -> "upload").
 */
function highlightText(text: string, snippet?: string) {
  if (!snippet) return text;
  const words = new Set([...snippet.matchAll(/<mark>(.*?)<\/mark>/g)].map((m) => decode(m[1]).toLowerCase()).filter(Boolean));
  if (!words.size) return text;
  const re = new RegExp(`(${[...words].map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    words.has(part.toLowerCase()) ? (
      <mark key={i} className="rounded bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-500/40">{part}</mark>
    ) : (
      part
    ),
  );
}

function decode(s: string) {
  return s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** The sentences Jev chose, resolved back to text: one for sentiment, one for the badge shown. */
function evidenceText(post: PostView) {
  const e = post.evidence;
  const at = (key: string) => {
    const p = e?.picks?.[key];
    const span = p && e?.sentences[p.i];
    if (!span) return undefined;
    const trimmed = trimSpan(post.text, span);
    return { text: post.text.slice(trimmed[0], trimmed[1]), p: p.p, span: trimmed };
  };
  const signal = primarySignal(post);
  return {
    sentiment: post.sentiment === "neutral" ? undefined : at("sentiment"),
    signal: signal ? { key: signal, ...at(signal) } : undefined,
  };
}

/** Keeps the @mentions a reply opens with, and a trailing link, out of the highlight. */
function trimSpan(text: string, [start, end]: [number, number]): [number, number] {
  const slice = text.slice(start, end);
  const lead = /^(?:@[\w]+[\s,]+)+/.exec(slice)?.[0].length ?? 0;
  const tail = /(?:\s+https?:\/\/\S+)+$/.exec(slice)?.[0].length ?? 0;
  const s = start + lead;
  const e = end - tail;
  return e - s > 8 ? [s, e] : [start, end];
}

/**
 * Renders the post text, underlining the sentence behind the sentiment (and, when the post
 * needs a reply, the line to act on). Search highlighting still applies inside each piece.
 */
function renderBody(post: PostView) {
  const why = evidenceText(post);
  const marks: { start: number; end: number; title: string; className: string }[] = [];
  const sentiment = SENTIMENT_META[post.sentiment] ?? SENTIMENT_META.neutral;
  const signalMeta = why.signal ? FLAG_META[why.signal.key] : undefined;
  const sameSpan = why.signal?.span && why.sentiment?.span && why.signal.span[0] === why.sentiment.span[0];
  // The signal is the more specific finding, so it wins when both point at one sentence.
  if (why.signal?.span && signalMeta) {
    marks.push({
      start: why.signal.span[0],
      end: why.signal.span[1],
      title: sameSpan
        ? `${signalMeta.label} · ${pct(why.signal.p)} — also why ${post.sentiment}`
        : `Why ${signalMeta.label.toLowerCase()} · ${pct(why.signal.p)} confident`,
      className: signalMeta.highlight,
    });
  }
  if (why.sentiment && sentiment.highlight && !sameSpan) {
    marks.push({
      start: why.sentiment.span[0],
      end: why.sentiment.span[1],
      title: `Why ${post.sentiment} · ${pct(why.sentiment.p)} confident`,
      className: sentiment.highlight,
    });
  }
  if (!marks.length) return highlightText(post.text, post.highlighted);

  marks.sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let cursor = 0;
  marks.forEach((m, i) => {
    if (m.start < cursor) return; // overlapping spans: keep the first
    if (m.start > cursor) out.push(<span key={`t${i}`}>{highlightText(post.text.slice(cursor, m.start), post.highlighted)}</span>);
    out.push(
      <span key={`m${i}`} className={`box-decoration-clone rounded-[3px] px-0.5 py-[1px] ${m.className}`} title={m.title}>
        {highlightText(post.text.slice(m.start, m.end), post.highlighted)}
      </span>,
    );
    cursor = m.end;
  });
  if (cursor < post.text.length) out.push(<span key="tail">{highlightText(post.text.slice(cursor), post.highlighted)}</span>);
  return out;
}
