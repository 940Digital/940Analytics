type Step = {
  id: string;
  title: string;
  status: string;
  completed_at: string | null;
};

/**
 * Every task, always. The list used to hide behind a toggle, which meant the
 * answer to "where are we" was one click away for no reason. It scrolls inside
 * a bounded height instead, stretching to match whatever sits beside it so the
 * two columns end level rather than one trailing off short.
 */
export function ProjectProgress({ steps }: { steps: Step[] }) {
  const live = steps.filter((s) => s.status !== "deleted");
  if (live.length === 0) return null;

  const done = live.filter((s) => s.status === "completed");
  const pct = Math.round((done.length / live.length) * 100);

  return (
    <section className="flex h-full max-h-[34rem] min-h-[18rem] flex-col rounded-lg border border-charcoal-text/10 bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-grey-muted">
          Progress
        </h2>
        <p className="text-xs text-grey-muted">
          {done.length} of {live.length}
        </p>
      </div>

      <div className="mt-3 h-1.5 shrink-0 overflow-hidden rounded-full bg-charcoal-text/10">
        <div
          className="h-full rounded-full bg-blue-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="-mr-2 mt-4 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-2">
        {live.map((s) => {
          const isDone = s.status === "completed";
          const isNow = s.status === "active";
          return (
            <li key={s.id} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden
                className={`mt-0.5 shrink-0 ${isDone ? "text-blue-accent" : "text-grey-light"}`}
              >
                {isDone ? "✓" : isNow ? "●" : "○"}
              </span>
              <span
                className={
                  isDone
                    ? "text-grey-muted line-through decoration-grey-light"
                    : isNow
                      ? "font-medium text-charcoal-text"
                      : "text-grey-muted"
                }
              >
                {s.title}
                {isNow ? (
                  <span className="ml-2 text-xs font-medium uppercase tracking-wide text-blue-accent">
                    now
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
