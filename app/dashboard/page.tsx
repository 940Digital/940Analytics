import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { logOut, createSite } from "@/app/auth/actions";
import { SnippetBox } from "@/components/SnippetBox";
import { ProjectProgress } from "@/components/ProjectProgress";
import { SessionChart } from "@/components/SessionChart";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { error?: string; passwordUpdated?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: sites } = await supabase
    .from("sites")
    .select("id, name, domain, created_at")
    .eq("account_id", user.id)
    .order("created_at", { ascending: true });

  const site = sites?.[0] ?? null;

  let sessions: { id: string; session_start: string; is_bot: boolean; is_bounce: boolean | null; referrer: string | null }[] = [];
  // Matches SessionChart's own default range (30 days, day buckets) exactly,
  // so its first client render can reuse this instead of opening on a
  // spinner and refetching data the page already has.
  let chartInitialSessions: { id: string; session_start: string; is_bot: boolean; is_bounce: boolean | null; referrer: string | null }[] = [];

  if (site) {
    const { data } = await supabase
      .from("sessions")
      .select("id, session_start, is_bot, is_bounce, referrer")
      .eq("site_id", site.id)
      .order("session_start", { ascending: false })
      .limit(25);
    sessions = data ?? [];

    const chartSince = new Date();
    chartSince.setDate(chartSince.getDate() - 29);
    chartSince.setHours(0, 0, 0, 0);
    const chartAll: typeof chartInitialSessions = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: page, error } = await supabase
        .from("sessions")
        .select("id, session_start, is_bot, is_bounce, referrer")
        .eq("site_id", site.id)
        .gte("session_start", chartSince.toISOString())
        .order("session_start", { ascending: true })
        .range(offset, offset + 999);
      if (error || !page) break;
      chartAll.push(...page);
      if (page.length < 1000) break;
    }
    chartInitialSessions = chartAll;
  }

  let projectSteps: { id: string; title: string; status: string; completed_at: string | null }[] = [];

  if (site) {
    const { data: website } = await supabase
      .from("crm_websites")
      .select("id")
      .eq("site_id", site.id)
      .maybeSingle();

    if (website) {
      const { data: project } = await supabase
        .from("crm_projects")
        .select("id")
        .eq("website_id", website.id)
        .eq("is_cancelled", false)
        .maybeSingle();

      if (project) {
        const { data: steps } = await supabase
          .from("crm_project_steps")
          .select("id, title, status, completed_at")
          .eq("project_id", project.id)
          .order("position", { ascending: true });
        projectSteps = steps ?? [];
      }
    }
  }

  return (
    <main className="min-h-screen bg-sand">
      <header className="border-b border-charcoal-text/10 bg-white/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Logo dark size={20} />
          <form action={logOut}>
            <button className="text-sm text-grey-muted hover:text-charcoal-text">Log out</button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        {searchParams.error && (
          <p className="mb-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {searchParams.error}
          </p>
        )}
        {searchParams.passwordUpdated && (
          <p className="mb-6 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            Password updated.
          </p>
        )}

        {!site ? (
          <OnboardingCard />
        ) : (
          <>
            <div className="mb-8 flex items-baseline justify-between">
              <div>
                <h1 className="font-display text-2xl font-bold text-charcoal-text">
                  {site.name}
                </h1>
                <p className="text-sm text-grey-muted">{site.domain}</p>
              </div>
            </div>

            <ProjectProgress steps={projectSteps} />

            <section className="rounded-lg border border-charcoal-text/10 bg-white p-5">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-grey-muted">
                Your tracking snippet
              </h2>
              <p className="mt-2 text-sm text-grey-muted">
                Paste this right before the closing <code>&lt;/body&gt;</code> tag on every page
                you want tracked.
              </p>
              <SnippetBox siteId={site.id} />
            </section>

            <section className="mt-6">
              <SessionChart siteId={site.id} initialSessions={chartInitialSessions} />
            </section>

            <section className="mt-10">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-grey-muted">
                Recent sessions
              </h2>
              <div className="mt-3 overflow-hidden rounded-lg border border-charcoal-text/10 bg-white">
                {sessions.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-grey-muted">
                    No sessions yet. Once your snippet is live on{" "}
                    <span className="font-medium text-charcoal-text">{site.domain}</span>, real
                    visits will start showing up here within a minute or two.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-charcoal-text/10 text-left text-xs uppercase tracking-wide text-grey-muted">
                        <th className="px-4 py-2 font-medium">Time</th>
                        <th className="px-4 py-2 font-medium">Referrer</th>
                        <th className="px-4 py-2 font-medium">Outcome</th>
                        <th className="px-4 py-2 font-medium">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr key={s.id} className="border-b border-charcoal-text/5 last:border-0">
                          <td className="px-4 py-2.5 text-charcoal-text">
                            {new Date(s.session_start).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-grey-muted">
                            {s.referrer || "Direct"}
                          </td>
                          <td className="px-4 py-2.5 text-grey-muted">
                            {s.is_bounce ? "Bounced" : "Browsed"}
                          </td>
                          <td className="px-4 py-2.5">
                            {s.is_bot ? (
                              <span className="rounded-full bg-grey-light/40 px-2 py-0.5 text-xs font-medium text-grey-muted">
                                Bot filtered
                              </span>
                            ) : (
                              <span className="rounded-full bg-blue-accent/10 px-2 py-0.5 text-xs font-medium text-blue-accent">
                                Human
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function OnboardingCard() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-2xl font-bold text-charcoal-text">
        Let's set up your site
      </h1>
      <p className="mt-2 text-sm text-grey-muted">
        One site, one snippet. You can add more later.
      </p>
      <form action={createSite} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-charcoal-text">
            Business name
          </span>
          <input
            name="businessName"
            required
            className="w-full rounded-md border border-charcoal-text/15 bg-white px-3 py-2 text-sm focus:border-blue-accent focus:outline-none focus:ring-1 focus:ring-blue-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-charcoal-text">
            Website domain
          </span>
          <input
            name="domain"
            placeholder="acmeroofing.com"
            required
            className="w-full rounded-md border border-charcoal-text/15 bg-white px-3 py-2 text-sm focus:border-blue-accent focus:outline-none focus:ring-1 focus:ring-blue-accent"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-blue-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-hover"
        >
          Create site
        </button>
      </form>
    </div>
  );
}
