#!/usr/bin/env node
/**
 * Push a static site into a 940Analytics review.
 *
 *   node scripts/push-site.mjs --dir "../azekah-group" --title "Azekah Group copy review"
 *   node scripts/push-site.mjs --dir "../azekah-group" --review <uuid>
 *   node scripts/push-site.mjs --dir "../azekah-group" --review <uuid> --dry-run
 *
 * Signs in as the master account and writes the pages and their assets
 * straight to Supabase, so there is no service key anywhere and row level
 * security is still the thing deciding what may be written.
 *
 * HTML goes in raw. The reviewer strips scripts and rewrites nothing until
 * it serves a page, which means the annotation layer can change without
 * anybody having to push a site again.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, basename, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";

const SKIP_DIRS = new Set([".git", "node_modules", ".next", ".vercel", ".DS_Store"]);
const MAX_ASSET = 6 * 1024 * 1024;

const TEXT = /\.(css|js|json|svg|txt|xml|webmanifest)$/i;
const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".webmanifest": "application/manifest+json",
};

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function env(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function walk(dir, root = dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, root, out);
    else out.push({ full, rel: relative(root, full).split("\\").join("/"), size: st.size });
  }
  return out;
}

function titleOf(html, fallback, rel) {
  /* The home page's title is the business name, which is a poor tab label
     next to About and Services. Every other page reads "About | Azekah
     Group", so splitting on the pipe gives the right word on its own. */
  if (rel && basename(rel).startsWith("index")) return "Home";

  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return fallback;
  return m[1]
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&rsquo;/g, "\u2019")
    .split("|")[0]
    .trim() || fallback;
}

async function main() {
  const dir = resolve(arg("dir") || ".");
  const reviewArg = arg("review");
  const title = arg("title");
  const exclude = (arg("exclude", "blueprint.html") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!existsSync(dir)) {
    console.error(`No such folder: ${dir}`);
    process.exit(1);
  }
  if (!reviewArg && !title) {
    console.error("Pass --review <uuid> to refresh one, or --title to make a new one.");
    process.exit(1);
  }

  const cfg = { ...env(join(process.cwd(), ".env.local")), ...process.env };
  const url = cfg.NEXT_PUBLIC_SUPABASE_URL;
  const key = cfg.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY. Run this from the 940-analytics folder.");
    process.exit(1);
  }

  const files0 = walk(dir);
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    const pg = files0.filter(
      (f) => extname(f.rel).toLowerCase() === ".html" && !exclude.includes(basename(f.rel))
    );
    const as = files0.filter((f) => extname(f.rel).toLowerCase() !== ".html");
    console.log(`Would push ${pg.length} pages and ${as.length} assets from ${dir}\n`);
    for (const f of pg) {
      console.log(`  page  ${f.rel.padEnd(24)} ${titleOf(readFileSync(f.full, "utf8"), f.rel, f.rel)}`);
    }
    let bytes = 0;
    for (const f of as) bytes += f.size;
    for (const f of as) {
      const over = f.size > MAX_ASSET ? "  OVER LIMIT" : "";
      console.log(`  asset ${f.rel.padEnd(34)} ${(f.size / 1024).toFixed(0)}KB${over}`);
    }
    console.log(`\nTotal asset weight: ${(bytes / 1e6).toFixed(2)}MB`);
    console.log(`Excluded: ${exclude.join(", ") || "nothing"}`);
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const email = cfg.REVIEW_EMAIL || (await rl.question("940Analytics email: "));
  const password = cfg.REVIEW_PASSWORD || (await rl.question("Password: "));
  rl.close();

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (authError || !auth?.user) {
    console.error("Sign in failed:", authError?.message || "unknown");
    process.exit(1);
  }

  const files = walk(dir);
  const pages = files.filter(
    (f) => extname(f.rel).toLowerCase() === ".html" && !exclude.includes(basename(f.rel))
  );
  const assets = files.filter((f) => extname(f.rel).toLowerCase() !== ".html");

  if (pages.length === 0) {
    console.error("No HTML pages found.");
    process.exit(1);
  }

  let reviewId = reviewArg;
  if (!reviewId) {
    const { data, error } = await supabase
      .from("rv_reviews")
      .insert({ title, created_by: auth.user.id, note: arg("note") })
      .select("id")
      .single();
    if (error) {
      console.error("Could not create the review:", error.message);
      process.exit(1);
    }
    reviewId = data.id;
    console.log(`Created review ${reviewId}`);
  }

  /* index first, then alphabetical, which is the order a person reads a site */
  pages.sort((a, b) => {
    const ai = basename(a.rel).startsWith("index") ? -1 : 0;
    const bi = basename(b.rel).startsWith("index") ? -1 : 0;
    return ai - bi || a.rel.localeCompare(b.rel);
  });

  for (let i = 0; i < pages.length; i++) {
    const html = readFileSync(pages[i].full, "utf8");
    const { error } = await supabase.from("rv_pages").upsert(
      {
        review_id: reviewId,
        path: pages[i].rel,
        title: titleOf(html, pages[i].rel, pages[i].rel),
        html,
        sort: i,
      },
      { onConflict: "review_id,path" }
    );
    if (error) {
      console.error(`  page ${pages[i].rel}: ${error.message}`);
      process.exit(1);
    }
    console.log(`  page  ${pages[i].rel}`);
  }

  let skipped = 0;
  for (const a of assets) {
    if (a.size > MAX_ASSET) {
      console.warn(`  skip  ${a.rel} (${(a.size / 1e6).toFixed(1)}MB, over the limit)`);
      skipped++;
      continue;
    }
    const ext = extname(a.rel).toLowerCase();
    const isText = TEXT.test(a.rel);
    const data = isText
      ? readFileSync(a.full, "utf8")
      : readFileSync(a.full).toString("base64");

    const { error } = await supabase.from("rv_assets").upsert(
      {
        review_id: reviewId,
        path: a.rel,
        content_type: TYPES[ext] || "application/octet-stream",
        data,
      },
      { onConflict: "review_id,path" }
    );
    if (error) {
      console.error(`  asset ${a.rel}: ${error.message}`);
      process.exit(1);
    }
  }

  console.log(
    `\n${pages.length} pages, ${assets.length - skipped} assets pushed.\n` +
      `Review: /review/${reviewId}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
