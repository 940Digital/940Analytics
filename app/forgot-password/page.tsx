import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requestPasswordReset } from "@/app/auth/actions";

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string; sent?: string };
}) {
  if (searchParams.sent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-sand px-6">
        <div className="w-full max-w-sm text-center">
          <Link href="/" className="mb-8 inline-block">
            <Logo dark size={22} />
          </Link>
          <h1 className="font-display text-xl font-bold text-charcoal-text">
            Check your email
          </h1>
          <p className="mt-3 text-sm text-grey-muted">
            If there's an account for that address, we sent a link to reset
            your password. Click it to choose a new one.
          </p>
          <p className="mt-6 text-center text-sm text-grey-muted">
            <Link href="/login" className="font-medium text-blue-accent hover:text-blue-hover">
              Back to log in
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-sand px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 inline-block">
          <Logo dark size={22} />
        </Link>
        <h1 className="font-display text-2xl font-bold text-charcoal-text">Reset your password</h1>
        <p className="mt-1 text-sm text-grey-muted">
          Enter your email and we'll send you a reset link.
        </p>

        {searchParams.error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {searchParams.error}
          </p>
        )}

        <form action={requestPasswordReset} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-charcoal-text">Email</span>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-charcoal-text/15 bg-white px-3 py-2 text-sm text-charcoal-text focus:border-blue-accent focus:outline-none focus:ring-1 focus:ring-blue-accent"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-blue-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-hover"
          >
            Send reset link
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-grey-muted">
          <Link href="/login" className="font-medium text-blue-accent hover:text-blue-hover">
            Back to log in
          </Link>
        </p>
      </div>
    </main>
  );
}
