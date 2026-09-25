type Step = {
  id: string;
  title: string;
  status: string;
  completed_at: string | null;
};

/**
 * What a client wants from a project board is one line: how far along are we,
 * and what is being worked on now. The full list of thirteen tasks was true
 * but unreadable, so the rest is folded away behind a toggle.
 */
export function ProjectProgress({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return null;

  const live = steps.filter((s) => s.status !== "deleted");
  const done = live.filter((s) => s.status === "completed");
  const active = live.filter((s) => s.status === "active");
  const ahead = live.filter((s) => s.status !== "completed" && s.status !== "active");
  const pct = live.length === 0 ? 0 : Math.round((done.length / live.length) * 100);

  return (
    <section className="rounded-lg border border-charcoal-text/10 bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-grey-muted">
          Progress
        </h2>
        <p className="text-xs text-grey-muted">
          {done.length} of {live.length}
        </p>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-charcoal-text/10">
        <div
          className="h-full rounded-full bg-blue-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {active.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-blue-accent">
            Happening now
          </p>
          {active.map((s) => (
            <p key={s.id} className="mt-1 text-sm font-medium text-charcoal-text">
              {s.title}
            </p>
          ))}
        </div>
      ) : null}

      {ahead.length > 0 || done.length > 0 ? (
        <details className="group mt-4">
          <summary className="cursor-pointer list-none text-xs font-medium text-grey-muted hover:text-charcoal-text">
            <span className="group-open:hidden">Show every step</span>
            <span className="hidden group-open:inline">Hide</span>
          </summary>

          <ul className="mt-3 space-y-1.5">
            {done.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <span aria-hidden className="text-blue-accent">&#10003;</span>
                <span className="text-grey-muted line-through decoration-grey-light">
                  {s.title}
                </span>
              </li>
            ))}
            {ahead.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <span aria-hidden className="text-grey-light">&#9675;</span>
                <span className="text-grey-muted">{s.title}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
