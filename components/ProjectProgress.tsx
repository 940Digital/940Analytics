type Step = {
  id: string;
  title: string;
  status: string;
  completed_at: string | null;
};

export function ProjectProgress({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return null;

  const active = steps.filter((s) => s.status === "active");
  const completed = steps.filter((s) => s.status === "completed");

  return (
    <section className="mb-10 rounded-lg border border-charcoal-text/10 bg-white p-5">
      <h2 className="font-display text-sm font-bold uppercase tracking-wide text-grey-muted">
        Project progress
      </h2>
      <p className="mt-1 text-sm text-grey-muted">
        A running list of what we're working on for your site.
      </p>

      <ul className="mt-4 space-y-2">
        {active.map((step) => (
          <li
            key={step.id}
            className="flex items-center gap-3 rounded-md border border-blue-accent/20 bg-blue-accent/5 px-3 py-2"
          >
            <span className="rounded-full bg-blue-accent px-2 py-0.5 text-xs font-medium text-white">
              In progress
            </span>
            <span className="text-sm font-medium text-charcoal-text">{step.title}</span>
          </li>
        ))}
        {completed.map((step) => (
          <li
            key={step.id}
            className="flex items-center gap-3 rounded-md border border-charcoal-text/10 px-3 py-2"
          >
            <span className="text-blue-accent">✓</span>
            <span className="text-sm text-grey-muted line-through decoration-grey-light">
              {step.title}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
