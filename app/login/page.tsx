import Link from "next/link";
import { Logo } from "@/components/Logo";
import { logIn } from "@/app/auth/actions";

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-sand px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 inline-block">
          <Logo dark size={22} />
        </Link>
        <h1 className="font-display text-2xl font-bold text-charcoal-text">Log in</h1>

        {searchParams.error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {searchParams.error}
          </p>
        )}

        <form action={logIn} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-charcoal-text">Email</span>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-charcoal-text/15 bg-white px-3 py-2 text-sm text-charcoal-text focus:border-blue-accent focus:outline-none focus:ring-1 focus:ring-blue-accent"
            />
          </label>
          <label className="block">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-charcoal-text">Password</span>
              <Link href="/forgot-password" className="text-xs font-medium text-blue-accent hover:text-blue-hover">
                Forgot password?
              </Link>
            </div>
            <input
              name="password"
              type="password"
              required
              className="w-full rounded-md border border-charcoal-text/15 bg-white px-3 py-2 text-sm text-charcoal-text focus:border-blue-accent focus:outline-none focus:ring-1 focus:ring-blue-accent"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-blue-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-hover"
          >
            Log in
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-grey-muted">
          New here?{" "}
          <Link href="/signup" className="font-medium text-blue-accent hover:text-blue-hover">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
