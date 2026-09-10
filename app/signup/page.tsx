import Link from "next/link";
import { Logo } from "@/components/Logo";
import { signUp, resendConfirmation } from "@/app/auth/actions";

export default function SignupPage({
  searchParams,
}: {
  searchParams: { error?: string; checkEmail?: string; email?: string; resendError?: string; resent?: string };
}) {
  if (searchParams.checkEmail) {
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
            We sent you a confirmation link. Click it and you'll land straight
            in your dashboard with your tracking snippet ready to go.
          </p>

          {searchParams.resent && (
            <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              Sent again — check your inbox (and spam folder).
            </p>
          )}
          {searchParams.resendError && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {searchParams.resendError}
            </p>
          )}

          {searchParams.email && (
            <form action={resendConfirmation} className="mt-5">
              <input type="hidden" name="email" value={searchParams.email} />
              <button
                type="submit"
                className="text-sm font-medium text-blue-accent hover:text-blue-hover"
              >
                Didn't get it? Resend the email
              </button>
            </form>
          )}
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
        <h1 className="font-display text-2xl font-bold text-charcoal-text">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-grey-muted">
          Free to start. Takes about a minute.
        </p>

        {searchParams.error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {searchParams.error}
          </p>
        )}

        <form action={signUp} className="mt-6 space-y-4">
          <Field label="Business name" name="businessName" placeholder="Acme Roofing" />
          <Field
            label="Website domain"
            name="domain"
            placeholder="acmeroofing.com"
            hint="Where you'll add the tracking snippet."
          />
          <Field label="Email" name="email" type="email" placeholder="you@business.com" />
          <Field label="Password" name="password" type="password" placeholder="At least 6 characters" />

          <button
            type="submit"
            className="w-full rounded-md bg-blue-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-hover"
          >
            Create account
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-grey-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-blue-accent hover:text-blue-hover">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-charcoal-text">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required
        minLength={type === "password" ? 6 : undefined}
        className="w-full rounded-md border border-charcoal-text/15 bg-white px-3 py-2 text-sm text-charcoal-text placeholder:text-grey-light focus:border-blue-accent focus:outline-none focus:ring-1 focus:ring-blue-accent"
      />
      {hint && <span className="mt-1 block text-xs text-grey-muted">{hint}</span>}
    </label>
  );
}
