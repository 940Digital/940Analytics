/**
 * Shared rules for turning a folder of static files into a review snapshot.
 * Used by the uploader in the app; scripts/push-site.mjs keeps its own copy
 * because it runs standalone under plain node.
 */

export const SKIP_DIRS = [".git", "node_modules", ".next", ".vercel"];
export const SKIP_FILES = [".DS_Store", "Thumbs.db"];
export const DEFAULT_EXCLUDE = ["blueprint.html"];
export const MAX_ASSET = 6 * 1024 * 1024;

export const TEXT_ASSET = /\.(css|js|json|svg|txt|xml|webmanifest)$/i;

const TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  mp4: "video/mp4",
  webmanifest: "application/manifest+json",
};

export function typeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return TYPES[ext] || "application/octet-stream";
}

export function isHtml(path: string): boolean {
  return /\.html?$/i.test(path);
}

export function skip(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((p) => SKIP_DIRS.includes(p))) return true;
  return SKIP_FILES.includes(parts[parts.length - 1]);
}

/**
 * The home page's <title> is the business name, which reads badly in a row of
 * tabs next to About and Services. Every other page is "About | Azekah Group",
 * so splitting on the pipe leaves the right word standing alone.
 */
export function titleOf(html: string, path: string): string {
  const file = path.split("/").pop() || path;
  if (file.toLowerCase().startsWith("index")) return "Home";

  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return file;

  const decoded = m[1]
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&rsquo;/g, "’")
    .replace(/&ndash;/g, "–")
    .split("|")[0]
    .trim();

  return decoded || file;
}

/** index first, then alphabetical, which is the order a person reads a site. */
export function pageOrder(a: string, b: string): number {
  const rank = (p: string) => ((p.split("/").pop() || "").toLowerCase().startsWith("index") ? 0 : 1);
  return rank(a) - rank(b) || a.localeCompare(b);
}

/** Strips the folder the person picked, so paths match what the HTML asks for. */
export function relativePath(fullPath: string): string {
  const parts = fullPath.split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : fullPath;
}
