import type { PageRow } from "@/app/review/[id]/ReviewClient";

/**
 * Which page of the snapshot a link in the frame was pointing at.
 *
 * Snapshot paths are files ("services.html"), but the sites these come from are
 * deployed with clean URLs and link to "/services". Matching on the stem covers
 * both, and the last segment covers a link written with a directory in front of
 * it that the snapshot flattened away.
 */
export function pageForPath(pages: PageRow[], raw: string): PageRow | undefined {
  const norm = (p: string) => p.replace(/^\.?\//, "").replace(/\/+$/, "").toLowerCase();
  const stem = (p: string) => norm(p).replace(/\.html?$/, "");
  const want = norm(raw.split("#")[0].split("?")[0]);
  if (want === "" || want === "index") return pages.find((p) => stem(p.path) === "index");
  return (
    pages.find((p) => norm(p.path) === want) ??
    pages.find((p) => stem(p.path) === stem(want)) ??
    pages.find((p) => stem(p.path).split("/").pop() === stem(want).split("/").pop())
  );
}
