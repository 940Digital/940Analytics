import { SupabaseClient } from "@supabase/supabase-js";
import {
  AnalyticsBucket,
  AnalyticsRangeKey,
  EventRow,
  SessionBreakdownDay,
  SessionRow,
  SiteAnalytics,
} from "./types";

/**
 * Splits each session in the window into exactly one outcome bucket so the
 * three counts always sum to that day's total sessions:
 *   followedThrough — had a lead_submit event tied to it
 *   bounced         — no lead, but is_bounce
 *   other           — browsed without bouncing or converting
 */

export async function fetchSessionBreakdown(
  supabase: SupabaseClient,
  siteId: string,
  rangeKey: AnalyticsRangeKey = "month"
): Promise<SessionBreakdownDay[]> {
  /* Same buckets the rest of the panel uses, so the outcome chart and the
     stat cards above it always describe the same window. A fixed fortnight
     here meant picking "Year" moved four charts and left two behind. */
  const buckets = getAnalyticsBuckets(rangeKey);
  const since = buckets[0].start;

  const [{ data: sessions, error: sessErr }, { data: leadEvents, error: evtErr }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, session_start, is_bounce")
      .eq("site_id", siteId)
      .eq("is_bot", false)
      .gte("session_start", since),
    supabase
      .from("events")
      .select("session_id")
      .eq("site_id", siteId)
      .eq("event_type", "lead_submit")
      .gte("created_at", since),
  ]);
  if (sessErr) throw sessErr;
  if (evtErr) throw evtErr;

  const leadSessionIds = new Set(((leadEvents ?? []) as { session_id: string }[]).map((e) => e.session_id));

  const counts = buckets.map(() => ({ bounced: 0, followedThrough: 0, other: 0 }));
  for (const s of ((sessions ?? []) as { id: string; session_start: string; is_bounce: boolean }[])) {
    const i = bucketIndexFor(buckets, s.session_start);
    if (i < 0) continue;
    if (leadSessionIds.has(s.id)) counts[i].followedThrough += 1;
    else if (s.is_bounce) counts[i].bounced += 1;
    else counts[i].other += 1;
  }
  return buckets.map((b, i) => ({ date: b.start, label: b.label, ...counts[i] }));
}

export const ANALYTICS_RANGES: { key: AnalyticsRangeKey; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "2y", label: "2 Years" },
];

/** Daily buckets for week/month, monthly buckets for year/2y — same scheme the old client dashboard used. */
function getAnalyticsBuckets(rangeKey: AnalyticsRangeKey): AnalyticsBucket[] {
  const now = new Date();
  const buckets: AnalyticsBucket[] = [];
  if (rangeKey === "week" || rangeKey === "month") {
    const days = rangeKey === "week" ? 7 : 30;
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      buckets.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, start: start.toISOString(), end: end.toISOString() });
    }
  } else {
    const months = rangeKey === "year" ? 12 : 24;
    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      buckets.push({ label: start.toLocaleString("en-US", { month: "short" }), start: start.toISOString(), end: end.toISOString() });
    }
  }
  return buckets;
}

function bucketIndexFor(buckets: AnalyticsBucket[], iso: string): number {
  const t = new Date(iso).getTime();
  for (let i = 0; i < buckets.length; i++) {
    if (t >= new Date(buckets[i].start).getTime() && t < new Date(buckets[i].end).getTime()) return i;
  }
  return -1;
}

/**
 * Full analytics for one tracker site over a range — visitors, bots, avg time
 * on site, bounces, lead follow-through, and social clicks, bucketed for the
 * sparkline series plus raw rows for the details table. Ports the math that
 * used to live in the client-facing dashboard (now removed) so the CRM is the
 * only place this information lives.
 */

export async function fetchSiteAnalytics(supabase: SupabaseClient, siteId: string, rangeKey: AnalyticsRangeKey): Promise<SiteAnalytics> {
  const buckets = getAnalyticsBuckets(rangeKey);
  const since = buckets[0].start;

  const [{ data: sessions, error: sessErr }, { data: events, error: evtErr }] = await Promise.all([
    supabase
      .from("sessions")
      .select("session_start, duration_seconds, is_bounce, referrer, user_agent, is_bot")
      .eq("site_id", siteId)
      .gte("session_start", since),
    supabase.from("events").select("event_type, event_target, created_at").eq("site_id", siteId).gte("created_at", since),
  ]);
  if (sessErr) throw sessErr;
  if (evtErr) throw evtErr;

  const allSessions = (sessions ?? []) as (SessionRow & { is_bot: boolean })[];
  const allEvents = (events ?? []) as EventRow[];

  const visitors = allSessions.filter((s) => !s.is_bot);
  const bots = allSessions.filter((s) => s.is_bot);
  const leads = allEvents.filter((e) => e.event_type === "lead_submit");
  const social = allEvents.filter((e) => e.event_type === "social_click");

  function countSeries<T>(items: T[], dateField: (item: T) => string): number[] {
    const arr = new Array(buckets.length).fill(0);
    items.forEach((it) => {
      const idx = bucketIndexFor(buckets, dateField(it));
      if (idx !== -1) arr[idx] += 1;
    });
    return arr;
  }

  const visitorsSeries = countSeries(visitors, (s) => s.session_start);
  const botsSeries = countSeries(bots, (s) => s.session_start);
  const leadsSeries = countSeries(leads, (e) => e.created_at);
  const socialSeries = countSeries(social, (e) => e.created_at);

  const durationSums = new Array(buckets.length).fill(0);
  const durationCounts = new Array(buckets.length).fill(0);
  const bounceCounts = new Array(buckets.length).fill(0);
  visitors.forEach((s) => {
    const idx = bucketIndexFor(buckets, s.session_start);
    if (idx === -1) return;
    if (typeof s.duration_seconds === "number") {
      durationSums[idx] += s.duration_seconds;
      durationCounts[idx] += 1;
    }
    if (s.is_bounce) bounceCounts[idx] += 1;
  });
  const avgDurationSeries = buckets.map((_, i) => (durationCounts[i] ? durationSums[i] / durationCounts[i] : 0));

  const totalVisitors = visitors.length;
  const totalDuration = visitors.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
  const durationCount = visitors.filter((s) => typeof s.duration_seconds === "number").length;
  const avgDuration = durationCount ? totalDuration / durationCount : 0;
  const bounceCount = visitors.filter((s) => s.is_bounce).length;
  const bounceRate = totalVisitors ? (bounceCount / totalVisitors) * 100 : 0;
  const leadRate = totalVisitors ? (leads.length / totalVisitors) * 100 : 0;

  const socialCounts: Record<string, number> = {};
  social.forEach((e) => {
    const p = e.event_target || "other";
    socialCounts[p] = (socialCounts[p] || 0) + 1;
  });

  return {
    buckets,
    series: { visitors: visitorsSeries, bots: botsSeries, avgDuration: avgDurationSeries, bounces: bounceCounts, leads: leadsSeries, social: socialSeries },
    totals: {
      visitors: totalVisitors,
      bots: bots.length,
      avgDuration,
      bounces: bounceCount,
      bounceRate,
      leads: leads.length,
      leadRate,
      social: social.length,
      socialCounts,
    },
    raw: { visitors, bots, leads, social },
  };
}
