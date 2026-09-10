"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

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

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: businessName, pending_domain: domain },
      emailRedirectTo: `${getSiteUrl()}/auth/callback`,
    },
  });

  if (error) {
    redirect("/signup?error=" + encodeURIComponent(error.message));
  }

  // Email confirmation is on: no session yet, nothing to provision until they
  // confirm and log in for the first time.
  if (!data.session) {
    redirect("/signup?checkEmail=1");
  }

  // Confirmation is off (or auto-confirmed): provision their site now.
  const { error: siteError } = await supabase.from("sites").insert({
    account_id: data.user!.id,
    name: businessName,
    domain,
  });

  if (siteError && siteError.code !== "23505") {
    redirect("/signup?error=" + encodeURIComponent(siteError.message));
  }

  redirect("/dashboard");
}

export async function logIn(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  redirect("/dashboard");
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
