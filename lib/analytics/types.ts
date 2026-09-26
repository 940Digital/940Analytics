/* The analytics shapes, shared with the CRM. Both apps read the same two
   tables, so the client dashboard and the account page can now show the
   same numbers instead of each computing its own idea of a visit. */

export interface SessionBreakdownDay {
  /** ISO start of the bucket: a day for week/month, a month for year/2y. */
  date: string;
  /** Axis tick for that bucket, already formatted for its granularity. */
  label: string;
  bounced: number;
  followedThrough: number;
  other: number;
}
export type AnalyticsRangeKey = "week" | "month" | "year" | "2y";
export interface AnalyticsBucket {
  label: string;
  start: string;
  end: string;
}
export interface SessionRow {
  session_start: string;
  duration_seconds: number | null;
  is_bounce: boolean;
  referrer: string | null;
  user_agent: string | null;
}
export interface EventRow {
  event_type: string;
  event_target: string | null;
  created_at: string;
}
export interface AnalyticsSeries {
  visitors: number[];
  bots: number[];
  avgDuration: number[];
  bounces: number[];
  leads: number[];
  social: number[];
}
export interface AnalyticsTotals {
  visitors: number;
  bots: number;
  avgDuration: number;
  bounces: number;
  bounceRate: number;
  leads: number;
  leadRate: number;
  social: number;
  socialCounts: Record<string, number>;
}
export interface SiteAnalytics {
  buckets: AnalyticsBucket[];
  series: AnalyticsSeries;
  totals: AnalyticsTotals;
  raw: {
    visitors: SessionRow[];
    bots: SessionRow[];
    leads: EventRow[];
    social: EventRow[];
  };
}
