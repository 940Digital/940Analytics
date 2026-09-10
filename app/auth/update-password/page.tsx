import Link from "next/link";
import { Logo } from "@/components/Logo";
import { updatePassword } from "@/app/auth/actions";

export default function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-sand px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 inline-block">
          <Logo dark size={22} />
        </Link>
        <h1 className="font-display text-2xl font-bold text-charcoal-text">Choose a new password</h1>

        {searchParams.error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {searchParams.error}
          </p>
        )}

        <form action={updatePassword} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-charcoal-text">New password</span>
            <input
              name="password"
              type="password"
              required
              minLength={6}
              placeholder="At least 6 characters"
              className="w-full rounded-md border border-charcoal-text/15 bg-white px-3 py-2 text-sm text-charcoal-text placeholder:text-grey-light focus:border-blue-accent focus:outline-none focus:ring-1 focus:ring-blue-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-charcoal-text">Confirm password</span>
            <input
              name="confirm"
              type="password"
              required
              minLength={6}
              className="w-full rounded-md border border-charcoal-text/15 bg-white px-3 py-2 text-sm text-charcoal-text focus:border-blue-accent focus:outline-none focus:ring-1 focus:ring-blue-accent"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-blue-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-hover"
          >
            Update password
          </button>
        </form>
      </div>
    </main>
  );
}
