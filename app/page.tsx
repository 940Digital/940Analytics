import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ConstellationHero } from "@/components/ConstellationHero";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-sand">
      <section className="relative min-h-[480px] h-[68vh] w-full overflow-hidden bg-charcoal-dark">
        <ConstellationHero />

        <div className="hero-fade-in relative z-10 flex h-full flex-col">
          <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
            <Logo size={20} />
            <nav className="flex shrink-0 items-center gap-1.5 sm:gap-3">
              <Link
                href="/login"
                className="whitespace-nowrap px-1.5 py-2 text-xs font-medium text-grey-light hover:text-blue-accent sm:px-4 sm:text-sm"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="whitespace-nowrap rounded-md bg-blue-accent px-2.5 py-2 text-xs font-medium text-white hover:bg-blue-hover sm:px-4 sm:text-sm"
              >
                Get started free
              </Link>
            </nav>
          </header>

          <div className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center px-6 text-center">
            <h1 className="font-display text-4xl font-extrabold leading-tight text-white sm:text-5xl">
              Website analytics for small businesses.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-grey-light">
              See who's visiting your site. Bots filtered out automatically.
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
                className="rounded-md border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:border-blue-accent hover:text-blue-accent"
              >
                I already have one
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 py-20 sm:grid-cols-3">
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
