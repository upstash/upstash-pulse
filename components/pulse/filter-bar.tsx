"use client";

import { useState } from "react";
import { FLAG_META, INTENT_META, PRODUCT_META, SORT_OPTIONS, TOPIC_LABEL } from "@/lib/labels";
import { activeFilterCount, EMPTY_FILTERS, type Facets, type FilterState } from "@/lib/types";

type Props = { filters: FilterState; facets?: Facets; onChange: (patch: Partial<FilterState>) => void; onClear: () => void };

const WINDOWS = [
  { key: 24, label: "Today" },
  { key: 24 * 7, label: "Week" },
  { key: 24 * 30, label: "Month" },
];

export function FilterBar({ filters, facets, onChange, onClear }: Props) {
  const [more, setMore] = useState(false);
  const active = activeFilterCount(filters);
  const toggleIn = (key: "product" | "intent" | "topic" | "sentiment", value: string) => {
    const cur = filters[key];
    onChange({ [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  };
  // Count of "advanced" filters, shown on the More button.
  const advanced = filters.intent.length + filters.topic.length + [filters.pricing_complaint, filters.churn_risk, filters.competitor_mention].filter(Boolean).length + (filters.minUrgency ? 1 : 0) + (filters.minLikes ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {/* what to show, on the left */}
        <div className="relative">
          <select
            value={filters.product.length === 1 ? filters.product[0] : ""}
            onChange={(e) => onChange({ product: e.target.value ? [e.target.value] : [] })}
            aria-label="Filter by product"
            className={`h-8 cursor-pointer appearance-none rounded-full border pr-8 pl-3.5 text-sm transition focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-hidden ${
              filters.product.length ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted"
            }`}
          >
            <option value="">All products</option>
            {Object.entries(PRODUCT_META).map(([k, m]) => (
              <option key={k} value={k}>{m.label}{facets?.product[k] ? ` (${facets.product[k]})` : ""}</option>
            ))}
          </select>
          <svg viewBox="0 0 24 24" aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 opacity-60" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
        <Pill active={filters.needs_reply} onClick={() => onChange({ needs_reply: !filters.needs_reply })}>
          Needs reply
        </Pill>
        <button
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-sm transition ${advanced ? "border-foreground bg-foreground text-background" : more ? "bg-muted" : "bg-background hover:bg-muted"}`}
        >
          More
          {advanced > 0 && <span className="tabular-nums opacity-70">{advanced}</span>}
          <svg viewBox="0 0 24 24" aria-hidden className={`size-3.5 opacity-60 transition-transform ${more ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {/* when, on the right */}
        <div className="ml-auto flex items-center gap-2">
          {active > 0 && (
            <button onClick={onClear} className="text-muted-foreground hover:text-foreground h-8 px-1 text-xs">
              Reset
            </button>
          )}
          <Segmented value={filters.sinceHours} options={WINDOWS} onChange={(v) => onChange({ sinceHours: v })} />
        </div>
      </div>

      {more && (
        <div className="bg-card animate-in fade-in slide-in-from-top-1 divide-y rounded-2xl border duration-150">
          <Row label="Intent">
            {Object.entries(INTENT_META).map(([k, m]) => (
              <Pill key={k} small active={filters.intent.includes(k)} onClick={() => toggleIn("intent", k)} count={facets?.intent[k]}>{m.label}</Pill>
            ))}
          </Row>
          <Row label="Topic">
            {Object.entries(TOPIC_LABEL).map(([k, label]) => (
              <Pill key={k} small active={filters.topic.includes(k)} onClick={() => toggleIn("topic", k)} count={facets?.topic[k]}>{label}</Pill>
            ))}
          </Row>
          <Row label="Signals">
            {(["pricing_complaint", "churn_risk", "competitor_mention"] as const).map((k) => (
              <Pill key={k} small active={filters[k]} onClick={() => onChange({ [k]: !filters[k] } as any)}>{FLAG_META[k].label}</Pill>
            ))}
            <Pill small active={filters.minUrgency >= 1.5} onClick={() => onChange({ minUrgency: filters.minUrgency >= 1.5 ? 0 : 1.5 })}>High urgency</Pill>
            <Pill small active={filters.minLikes >= 10} onClick={() => onChange({ minLikes: filters.minLikes >= 10 ? 0 : 10 })}>10+ likes</Pill>
          </Row>
          <Row label="Sort by">
            {SORT_OPTIONS.filter((o) => o.key !== "relevance" || filters.q.trim()).map((o) => (
              <Pill key={o.key} small active={filters.sort === o.key} onClick={() => onChange({ sort: o.key })}>{o.label}</Pill>
            ))}
          </Row>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-baseline sm:gap-4">
      <p className="text-muted-foreground w-16 shrink-0 text-xs font-medium sm:pt-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Pill({ children, active, onClick, small, count }: { children: React.ReactNode; active: boolean; onClick: () => void; small?: boolean; count?: number }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border transition ${small ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm"} ${active ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted"}`}
    >
      {children}
      {count != null && <span className={`tabular-nums ${active ? "opacity-70" : "text-muted-foreground"}`}>{count}</span>}
    </button>
  );
}

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { key: T; label: string; dot?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="bg-muted flex h-8 items-center gap-0.5 rounded-full p-0.5">
      {options.map((o) => (
        <button
          key={String(o.key)}
          onClick={() => onChange(o.key)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-sm transition ${value === o.key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {o.dot && <span className={`size-1.5 rounded-full ${o.dot}`} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
