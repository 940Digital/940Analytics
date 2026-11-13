"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ANALYTICS_RANGES, fetchSiteMetrics } from "@/lib/analytics/query";
import { AnalyticsRangeKey } from "@/lib/analytics/types";
import { LEAD_KIND_LABEL, MetricEvent, MetricSession, MetricTile, SiteMetrics, fmtDuration, metricTiles } from "@/lib/analytics/siteMetrics";
import { Sparkline } from "./Sparkline";

type DetailStat = "visitors" | "bots" | "leads" | "social";

const STAT_DEFS: { key: DetailStat; label: string; color: string }[] = [
  { key: "visitors", label: "Visitors", color: "#3194E0" },
  { key: "bots", label: "Bots", color: "#7B7E85" },
  { key: "leads", label: "Lead Follow-Through", color: "#16A34A" },
  { key: "social", label: "Social Clicks", color: "#A855F7" },
];

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Everything the old client-facing dashboard showed for a tracked site —
 * visitors, bots, avg time on site, bounces, lead follow-through, and social
 * clicks — now the CRM's only home for this data. Reused wherever a tracker
 * site is known (currently the account detail page).
 */
export function AnalyticsPanel({
  siteId,
  range,
  onRangeChange,
  view,
}: {
  siteId: string;
  /* When set, only that view renders and the panel's own range and tab buttons
     are left out, so a parent can host it as one tab among several. */
  view?: "summary" | "details";
  /* The range lives with whoever owns the page, because the outcome charts
     sitting below this panel have to answer to the same buttons. */
  range: AnalyticsRangeKey;
  onRangeChange: (range: AnalyticsRangeKey) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<SiteMetrics | null>(null);
  const [tabState, setTab] = useState<"summary" | "details">("summary");
  const tab = view ?? tabState;
  const [detailStat, setDetailStat] = useState<DetailStat>("visitors");

  const load = useCallback(async () => {
    const d = await fetchSiteMetrics(supabase, siteId, range);
    setData(d);
  }, [supabase, siteId, range]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(load, 45000);
    return () => clearInterval(id);
  }, [load]);

  if (!data) return <p className="text-xs text-grey-muted">Loading analytics…</p>;

  const { totals, series } = data;
  const platforms = Object.keys(totals.socialCounts).sort((a, b) => totals.socialCounts[b] - totals.socialCounts[a]);

  return (
    <div>
      {view ? null : (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-sand p-1">
          {ANALYTICS_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => onRangeChange(r.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                range === r.key ? "bg-white text-charcoal-text shadow-sm" : "text-grey-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg bg-sand p-1">
          {(["summary", "details"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                tab === t ? "bg-white text-charcoal-text shadow-sm" : "text-grey-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      )}

      {tab === "summary" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {metricTiles(data).map((tile) => (
              <StatCard key={tile.key} tile={tile} values={TILE_SERIES[tile.key] ? series[TILE_SERIES[tile.key]!] : undefined} color={TILE_COLOR[tile.key]} />
            ))}
          </div>
          <div className="mt-5">
            <h3 className="mb-2 text-xs font-medium text-grey-muted">Social clicks — {totals.social.toLocaleString()}</h3>
            {platforms.length > 0 ? (
              <div className="space-y-1">
                {platforms.map((p) => (
                  <div key={p} className="flex justify-between text-xs">
                    <span className="text-charcoal-text">{p}</span>
                    <span className="text-grey-muted">{totals.socialCounts[p]}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-grey-muted">No social clicks yet.</p>
            )}
          </div>
        </>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap gap-1">
            {STAT_DEFS.map((def) => (
              <button
                key={def.key}
                onClick={() => setDetailStat(def.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  detailStat === def.key ? "bg-blue-accent text-white" : "bg-sand text-grey-muted"
                }`}
              >
                {def.label}
              </button>
            ))}
          </div>
          <DetailsTable stat={detailStat} rows={data.rows} />
        </div>
      )}
    </div>
  );
}

const BOT_REASON: Record<string, string> = {
  flagged: "Known bot",
  "user agent": "Known fetcher",
  "data center": "Data center, no action",
  "same-second burst": "Link preview burst",
};

const TILE_SERIES: Partial<Record<MetricTile["key"], keyof SiteMetrics["series"]>> = {
  visitors: "visitors",
  bots: "bots",
  bounces: "bounces",
  leads: "leads",
};
const TILE_COLOR: Partial<Record<MetricTile["key"], string>> = {
  visitors: "#3194E0",
  bots: "#7B7E85",
  bounces: "#DC2626",
  leads: "#16A34A",
};

function StatCard({ tile, values, color }: { tile: MetricTile; values?: number[]; color?: string }) {
  return (
    <div className="rounded-xl border border-grey-light p-3" title={tile.help}>
      <div className="flex items-center gap-1 text-xs text-grey-muted">
        <span>{tile.label}</span>
        <span aria-hidden className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-grey-light text-[9px] leading-none">?</span>
        <span className="sr-only">{tile.help}</span>
      </div>
      <div className="text-lg font-semibold text-charcoal-text">{tile.value}</div>
      <div className="text-[11px] text-grey-muted">{tile.sub}</div>
      {values && color && <Sparkline values={values} color={color} />}
    </div>
  );
}

function DetailsTable({ stat, rows: all }: { stat: DetailStat; rows: SiteMetrics["rows"] }) {
  if (stat === "visitors" || stat === "bots") {
    const items = (all[stat] as (MetricSession & { bot_reason?: string })[])
      .slice()
      .sort((a, b) => b.session_start.localeCompare(a.session_start))
      .slice(0, 20);
    if (items.length === 0) return <p className="text-xs text-grey-muted">Nothing in this range yet.</p>;
    return (
      <div className="overflow-hidden rounded-xl border border-grey-light">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-grey-light text-grey-muted">
              <th className="px-3 py-1.5 font-medium">Time</th>
              <th className="px-3 py-1.5 font-medium">{stat === "visitors" ? "Duration" : "Why"}</th>
              {stat === "visitors" && <th className="px-3 py-1.5 font-medium">Bounced?</th>}
              <th className="px-3 py-1.5 font-medium">{stat === "visitors" ? "Referrer" : "User agent"}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b border-grey-light text-charcoal-text last:border-0">
                <td className="px-3 py-1.5">{fmtTime(r.session_start)}</td>
                <td className="px-3 py-1.5">{stat === "visitors" ? fmtDuration(r.duration_seconds ?? 0) : BOT_REASON[r.bot_reason ?? "flagged"] ?? r.bot_reason}</td>
                {stat === "visitors" && <td className="px-3 py-1.5">{r.is_bounce ? "Yes" : "No"}</td>}
                <td className="px-3 py-1.5">
                  {stat === "visitors" ? r.referrer || "Direct" : (r.user_agent || "Unknown").slice(0, 60)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const items = (all[stat] as (MetricEvent & { kind?: keyof typeof LEAD_KIND_LABEL })[])
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20);
  if (items.length === 0) return <p className="text-xs text-grey-muted">Nothing in this range yet.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-grey-light">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-grey-light text-grey-muted">
            <th className="px-3 py-1.5 font-medium">Time</th>
            <th className="px-3 py-1.5 font-medium">{stat === "leads" ? "Type" : "Platform"}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={i} className="border-b border-grey-light text-charcoal-text last:border-0">
              <td className="px-3 py-1.5">{fmtTime(r.created_at)}</td>
              <td className="px-3 py-1.5">
                {stat === "leads" && r.kind ? LEAD_KIND_LABEL[r.kind] + (r.kind === "form" && r.event_target ? `: ${r.event_target}` : "") : r.event_target}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
