import { SupabaseClient } from "@supabase/supabase-js";
import { AnalyticsRangeKey } from "./types";
import { METRIC_EVENT_TYPES, MetricEvent, MetricSession, SiteMetrics, computeSiteMetrics, rangeBuckets } from "./siteMetrics";

export const ANALYTICS_RANGES: { key: AnalyticsRangeKey; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "2y", label: "2 Years" },
];

const METRIC_SESSION_COLUMNS = "id, session_start, duration_seconds, is_bounce, is_bot, user_agent, referrer, channel, landing_page, city, region";
const PAGE = 1000;

/* PostgREST caps a response at 1000 rows, which a busy site passes within a year. */
async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/**
 * The single loader behind every headline figure: the Totals tiles, the
 * outcome charts and the PDF report. It fetches raw rows and hands them to
 * computeSiteMetrics (lib/analytics/siteMetrics.ts, the same file the CRM uses), which holds the definitions.
 */
export async function fetchSiteMetrics(supabase: SupabaseClient, siteId: string, rangeKey: AnalyticsRangeKey): Promise<SiteMetrics> {
  const buckets = rangeBuckets(rangeKey);
  const since = buckets[0].start;
  const [sessions, events] = await Promise.all([
    fetchAllRows<MetricSession>((from, to) =>
      supabase.from("sessions").select(METRIC_SESSION_COLUMNS).eq("site_id", siteId).gte("session_start", since).order("session_start").range(from, to)
    ),
    fetchAllRows<MetricEvent>((from, to) =>
      supabase
        .from("events")
        .select("session_id, event_type, event_target, created_at")
        .eq("site_id", siteId)
        .in("event_type", [...METRIC_EVENT_TYPES])
        .gte("created_at", since)
        .order("created_at")
        .range(from, to)
    ),
  ]);
  return computeSiteMetrics(sessions, events, buckets);
}
