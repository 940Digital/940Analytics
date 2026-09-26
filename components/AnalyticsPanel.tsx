"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ANALYTICS_RANGES, fetchSiteAnalytics } from "@/lib/analytics/query";
import { AnalyticsRangeKey, EventRow, SessionRow, SiteAnalytics } from "@/lib/analytics/types";
import { Sparkline } from "./Sparkline";

type DetailStat = "visitors" | "bots" | "leads" | "social";

const STAT_DEFS: { key: DetailStat; label: string; color: string }[] = [
  { key: "visitors", label: "Visitors", color: "#3194E0" },
  { key: "bots", label: "Bots", color: "#7B7E85" },
  { key: "leads", label: "Lead Follow-Through", color: "#16A34A" },
  { key: "social", label: "Social Clicks", color: "#A855F7" },
];

function fmtDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function leadLabel(target: string | null): string {
  if (target === "phone_click") return "Phone tap";
  if (target === "email_click") return "Email click";
  if (!target || target === "form") return "Form submission";
  return "Form: " + target;
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
}: {
  siteId: string;
  /* The range lives with whoever owns the page, because the outcome charts
     sitting below this panel have to answer to the same buttons. */
  range: AnalyticsRangeKey;
  onRangeChange: (range: AnalyticsRangeKey) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<SiteAnalytics | null>(null);
  const [tab, setTab] = useState<"summary" | "details">("summary");
  const [detailStat, setDetailStat] = useState<DetailStat>("visitors");

  const load = useCallback(async () => {
    const d = await fetchSiteAnalytics(supabase, siteId, range);
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

      {tab === "summary" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard label="Visitors" value={totals.visitors.toLocaleString()} values={series.visitors} color="#3194E0" />
            <StatCard label="Bots" value={totals.bots.toLocaleString()} values={series.bots} color="#7B7E85" />
            <StatCard label="Avg. Time on Site" value={fmtDuration(totals.avgDuration)} />
            <StatCard label="Bounces" value={`${totals.bounces} (${totals.bounceRate.toFixed(0)}%)`} values={series.bounces} color="#DC2626" />
            <StatCard label="Lead Follow-Through" value={`${totals.leads} (${totals.leadRate.toFixed(0)}%)`} values={series.leads} color="#16A34A" />
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
          <DetailsTable stat={detailStat} raw={data.raw} />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, values, color }: { label: string; value: string; values?: number[]; color?: string }) {
  return (
    <div className="rounded-xl border border-grey-light p-3">
      <div className="text-xs text-grey-muted">{label}</div>
      <div className="text-lg font-semibold text-charcoal-text">{value}</div>
      {values && color && <Sparkline values={values} color={color} />}
    </div>
  );
}

function DetailsTable({ stat, raw }: { stat: DetailStat; raw: SiteAnalytics["raw"] }) {
  const rows = raw[stat];

  if (stat === "visitors" || stat === "bots") {
    const items = (rows as SessionRow[]).slice().sort((a, b) => b.session_start.localeCompare(a.session_start)).slice(0, 20);
    if (items.length === 0) return <p className="text-xs text-grey-muted">Nothing in this range yet.</p>;
    return (
      <div className="overflow-hidden rounded-xl border border-grey-light">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-grey-light text-grey-muted">
              <th className="px-3 py-1.5 font-medium">Time</th>
              <th className="px-3 py-1.5 font-medium">{stat === "visitors" ? "Duration" : "User Agent"}</th>
              {stat === "visitors" && <th className="px-3 py-1.5 font-medium">Bounced?</th>}
              <th className="px-3 py-1.5 font-medium">Referrer</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => (
              <tr key={i} className="border-b border-grey-light text-charcoal-text last:border-0">
                <td className="px-3 py-1.5">{fmtTime(r.session_start)}</td>
                <td className="px-3 py-1.5">
                  {stat === "visitors"
                    ? fmtDuration(r.duration_seconds ?? 0)
                    : (r.user_agent || "—").slice(0, 60)}
                </td>
                {stat === "visitors" && <td className="px-3 py-1.5">{r.is_bounce ? "Yes" : "No"}</td>}
                <td className="px-3 py-1.5">{r.referrer || "Direct"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const items = (rows as EventRow[]).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20);
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
              <td className="px-3 py-1.5">{stat === "leads" ? leadLabel(r.event_target) : r.event_target}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
