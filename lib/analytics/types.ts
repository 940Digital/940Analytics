/* The analytics shapes, shared with the CRM. Both apps read the same two
   tables and compute every figure with the same siteMetrics.ts, so the client
   dashboard and the account page show the same numbers. */

/** One bucket of the outcome charts. Built by computeSiteMetrics (siteMetrics.ts). */
export type { OutcomeDay as SessionBreakdownDay } from "./siteMetrics";

export type AnalyticsRangeKey = "week" | "month" | "year" | "2y";
