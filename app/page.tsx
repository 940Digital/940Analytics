import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-sand">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo dark size={24} />
        <nav className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-medium text-charcoal-text hover:text-blue-accent"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-charcoal-dark px-4 py-2 text-sm font-medium text-white hover:bg-charcoal-mid"
          >
            Get started free
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-20 pt-16 text-center">
        <h1 className="font-display text-4xl font-extrabold leading-tight text-charcoal-text sm:text-5xl">
          Know who's actually visiting your site.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-grey-muted">
          One line of code. Real visitor sessions, filtered clean of bots and
          scrapers, in a dashboard built for people who don't have time to
          learn analytics software.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-md bg-blue-accent px-6 py-3 text-sm font-semibold text-white hover:bg-blue-hover"
          >
            Create your free account
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-charcoal-text/15 px-6 py-3 text-sm font-semibold text-charcoal-text hover:border-blue-accent hover:text-blue-accent"
          >
            I already have one
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-24 sm:grid-cols-3">
        <Feature
          title="2-minute setup"
          body="Sign up, paste one snippet before </body>, done. No config, no tagging plan."
        />
        <Feature
          title="Bots filtered out"
          body="Scrapers, headless browsers, and known bot traffic are caught automatically and kept out of your real numbers."
        />
        <Feature
          title="Built for owners, not analysts"
          body="Sessions, bounce, and where people came from — nothing you need a manual to read."
        />
      </section>

      <footer className="border-t border-charcoal-text/10 py-8 text-center text-sm text-grey-muted">
        <Logo dark size={16} /> is built by{" "}
        <a
          href="https://www.940digital.com"
          className="font-medium text-blue-accent hover:text-blue-hover"
        >
          940Digital
        </a>
      </footer>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-charcoal-text/10 bg-white/60 p-6">
      <h3 className="font-display font-bold text-charcoal-text">{title}</h3>
      <p className="mt-2 text-sm text-grey-muted">{body}</p>
    </div>
  );
}
