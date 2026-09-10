"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Supabase's raw auth error messages/codes aren't something to show someone
// signing up for the first time. This maps every failure we've actually seen
// (plus the reasonable ones we haven't) to something a customer understands,
// including Supabase's own per-address send cooldown - resubmitting signup
// or hitting "resend" too soon returns a 429 with a wait time in the message,
// which otherwise shows up as an unexplained silent failure to send.
function friendlyAuthError(error: unknown, context: "signup" | "login" = "signup") {
  if (!(error instanceof AuthError)) {
    // Not a Supabase auth error at all - a thrown network/fetch failure
    // (offline, DNS hiccup, Supabase itself down) rather than an API
    // response. AuthError always has a message; anything else won't.
    return "Couldn't reach the server. Check your connection and try again.";
  }

  const code = (error as { code?: string }).code;
  const message = error.message || "";

  // Per-address cooldown on confirmation/resend emails (429). Supabase's
  // message names the exact wait: "For security purposes, you can only
  // request this after 57 seconds." Surface that number if we can find it.
  if (code === "over_email_send_rate_limit" || /security purposes/i.test(message)) {
    const seconds = message.match(/(\d+)\s*seconds?/i)?.[1];
    return seconds
      ? `You just requested this - please wait ${seconds} seconds before trying again.`
      : "You just requested this - please wait a minute before trying again.";
  }

  // Project-wide email send limit (shared SMTP quota, not specific to this
  // address). Same customer-facing advice: wait and retry.
  if (code === "over_email_send_rate_limit" || /email rate limit exceeded/i.test(message)) {
    return "Too many emails sent recently. Please wait a few minutes and try again.";
  }

  // General API rate limiting, unrelated to email.
  if (code === "over_request_rate_limit" || error.status === 429) {
    return "Too many attempts. Please wait a minute and try again.";
  }

  if (code === "user_already_exists" || code === "email_exists" || /already registered/i.test(message)) {
    return context === "signup"
      ? "An account with that email already exists. Try logging in instead."
      : message;
  }

  if (code === "weak_password" || /password should be/i.test(message)) {
    return "Password needs to be at least 6 characters.";
  }

  if (code === "email_address_invalid" || code === "validation_failed" || /invalid.*email/i.test(message)) {
    return "That doesn't look like a valid email address.";
  }

  if (code === "signup_disabled") {
    return "Signups are temporarily unavailable. Please try again shortly.";
  }

  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "Incorrect email or password.";
  }

  if (code === "email_not_confirmed") {
    return "Please confirm your email first - check your inbox for the confirmation link.";
  }

  if (error.status && error.status >= 500) {
    return "Something went wrong on our end. Please try again in a moment.";
  }

  // Fall back to Supabase's own message rather than hiding it - better an
  // unpolished message than a silent, unexplained failure.
  return message || "Something went wrong. Please try again.";
}

function cleanDomain(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

// Supabase's confirmation email links to the project's Auth "Site URL" by
// default, which is shared with 940digital.com's own Supabase Auth usage
// and points there - not here. Passing emailRedirectTo explicitly is the
// fix; it still has to be added to the project's Auth > URL Configuration
// > Redirect URLs allowlist or Supabase silently falls back to Site URL
// again (that allowlist isn't reachable through any available API/DB
// tool, so this needs to be added by hand once, in the Supabase dashboard).
function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : "http://localhost:3300";
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const businessName = String(formData.get("businessName") || "").trim();
  const domain = cleanDomain(String(formData.get("domain") || ""));

  if (!email || !password || !businessName || !domain) {
    redirect("/signup?error=" + encodeURIComponent("Please fill in every field."));
  }

  const supabase = createClient();

  let data;
  try {
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: businessName, pending_domain: domain },
        emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      },
    });
    if (result.error) {
      redirect("/signup?error=" + encodeURIComponent(friendlyAuthError(result.error, "signup")));
    }
    data = result.data;
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    redirect("/signup?error=" + encodeURIComponent(friendlyAuthError(err, "signup")));
  }

  // Email confirmation is on: no session yet, nothing to provision until they
  // confirm and log in for the first time.
  if (!data.session) {
    redirect("/signup?checkEmail=1&email=" + encodeURIComponent(email));
  }

  // Confirmation is off (or auto-confirmed): provision their site now.
  const { error: siteError } = await supabase.from("sites").insert({
    account_id: data.user!.id,
    name: businessName,
    domain,
  });

  if (siteError && siteError.code !== "23505") {
    redirect(
      "/signup?error=" +
        encodeURIComponent(
          "Your account was created, but we couldn't save your site. Add it from the dashboard."
        )
    );
  }

  redirect("/dashboard");
}

export async function logIn(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const supabase = createClient();
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      redirect("/login?error=" + encodeURIComponent(friendlyAuthError(error, "login")));
    }
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    redirect("/login?error=" + encodeURIComponent(friendlyAuthError(err, "login")));
  }

  redirect("/dashboard");
}

export async function resendConfirmation(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  if (!email) redirect("/signup?checkEmail=1");

  const supabase = createClient();
  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${getSiteUrl()}/auth/callback` },
    });
    if (error) {
      redirect(
        "/signup?checkEmail=1&resendError=" + encodeURIComponent(friendlyAuthError(error, "signup"))
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    redirect(
      "/signup?checkEmail=1&resendError=" + encodeURIComponent(friendlyAuthError(err, "signup"))
    );
  }

  redirect("/signup?checkEmail=1&resent=1");
}

export async function logOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createSite(formData: FormData) {
  const businessName = String(formData.get("businessName") || "").trim();
  const domain = cleanDomain(String(formData.get("domain") || ""));

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!businessName || !domain) {
    redirect("/dashboard?error=" + encodeURIComponent("Please fill in every field."));
  }

  const { error } = await supabase.from("sites").insert({
    account_id: user.id,
    name: businessName,
    domain,
  });

  if (error) {
    redirect("/dashboard?error=" + encodeURIComponent(error.message));
  }

  redirect("/dashboard");
}
