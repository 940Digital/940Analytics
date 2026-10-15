/* One login across 940Analytics and the CRM.
 *
 * Both apps use the same Supabase project, so they already write the same
 * session cookie. A cookie is only shared between hosts when it is scoped to
 * their common parent domain, 940analytics.com. On any other host (localhost,
 * the vercel.app names, Preview deployments) a Domain attribute would make the
 * browser reject the cookie, so there it stays host-only. */
const SHARED = "940analytics.com";

function bare(host: string | null | undefined) {
  return (host ?? "").split(":")[0].toLowerCase();
}

export function isSharedHost(host: string | null | undefined): boolean {
  const h = bare(host);
  return h === SHARED || h.endsWith("." + SHARED);
}

export function sharedCookieDomain(host: string | null | undefined): string | undefined {
  return isSharedHost(host) ? "." + SHARED : undefined;
}

/** Where the master account belongs: the CRM. */
export function crmHomeUrl(host: string | null | undefined): string {
  return isSharedHost(host) ? `https://crm.${SHARED}/accounts` : "https://94-d-crm-beta.vercel.app/accounts";
}
