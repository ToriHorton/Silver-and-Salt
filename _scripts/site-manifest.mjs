#!/usr/bin/env node
// The public site manifest: every git-tracked file reachable by following
// links from the pages the Worker actually serves. Nothing else ships. A
// tracked file that no page references (a draft, a research note, a deck, a
// spec) is simply not part of the website, whatever its extension.
//
//   node _scripts/site-manifest.mjs            NUL-separated list on stdout, report on stderr
//   node _scripts/site-manifest.mjs --report   report only
//
// Seeds: the entry pages the Worker routes to. Everything else must be
// linked, directly or transitively, from one of them.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SEEDS = ["index.html", "404.html", "join.html", "admin/index.html", "members/index.html"];
const PARSE = new Set(["html", "htm", "css", "js", "mjs"]);
const LEAF = "png|jpg|jpeg|gif|svg|webp|avif|ico|pdf|json|xml|txt|webmanifest|woff|woff2|ttf|otf|mp4|webm|mp3|vtt|css|js|mjs|html";

const ext = (p) => (p.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
const external = (u) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);

/** Raw reference strings found in one file's text, by file type. */
export function extractRefs(text, type) {
  const refs = [];
  if (type === "html" || type === "htm") {
    for (const m of text.matchAll(/\b(?:href|src|poster|data-src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) refs.push(m[1] ?? m[2]);
    for (const m of text.matchAll(/\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) for (const part of (m[1] ?? m[2]).split(",")) refs.push(part.trim().split(/\s+/)[0]);
    for (const m of text.matchAll(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const v = m[1] ?? m[2];
      const url = v.match(/^\s*\d+\s*;\s*url\s*=\s*(.+)$/i)?.[1] ?? v;
      if (new RegExp(`\\.(${LEAF})(?:[?#].*)?$`, "i").test(url) || /^\//.test(url)) refs.push(url.trim());
    }
    // Inline <style> and <script> bodies use the CSS and JS rules below.
    for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) refs.push(...extractRefs(m[1], "css"));
    for (const m of text.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) refs.push(...extractRefs(m[1], "js"));
  }
  if (type === "css") for (const m of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/gi)) refs.push(m[1] ?? m[2] ?? m[3]);
  if (type === "js" || type === "mjs") {
    // Quoted local paths with a servable extension, or absolute site paths.
    for (const m of text.matchAll(new RegExp(`["'\`]((?:\\.{0,2}/)?[A-Za-z0-9_./-]+\\.(?:${LEAF}))["'\`]`, "g"))) refs.push(m[1]);
    for (const m of text.matchAll(/["'`](\/[A-Za-z0-9_./-]*)["'`]/g)) refs.push(m[1]);
  }
  return refs.filter((r) => typeof r === "string" && r.trim() && !external(r.trim()));
}

/** Resolve one reference from `from` (a repo-relative file) to a tracked file, or null. */
export function resolveRef(ref, from, tracked) {
  let u = ref.trim().replace(/[?#].*$/, "");
  try { u = decodeURIComponent(u); } catch { /* keep as is */ }
  if (!u) return null;
  const bases = u.startsWith("/") ? [""] : [posix.dirname(from), ""];
  for (const base of bases) {
    const p = posix.normalize(posix.join(base, u.replace(/^\//, ""))).replace(/^\.\/?/, "");
    if (p.startsWith("..")) continue;
    for (const c of [p, p.replace(/\/$/, "") + "/index.html", p === "" ? "index.html" : null, ext(p) ? null : p + ".html"]) {
      if (c && tracked.has(c)) return c;
    }
  }
  return null;
}

export function computeManifest({ root, tracked, seeds = SEEDS }) {
  const include = new Set(), broken = [], queue = [];
  for (const s of seeds) { if (!tracked.has(s)) throw new Error(`seed page is not tracked: ${s}`); queue.push(s); include.add(s); }
  while (queue.length) {
    const file = queue.shift();
    const type = ext(file);
    if (!PARSE.has(type)) continue;
    const text = readFileSync(join(root, file), "utf8");
    for (const ref of extractRefs(text, type)) {
      const target = resolveRef(ref, file, tracked);
      if (!target) { broken.push({ from: file, ref }); continue; }
      if (!include.has(target)) { include.add(target); queue.push(target); }
    }
  }
  return { files: [...include].sort(), broken };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const tracked = new Set(execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean)
    .filter((p) => existsSync(join(root, p)) && statSync(join(root, p)).isFile()));
  const { files, broken } = computeManifest({ root, tracked });
  const outside = files.filter((f) => /^(_|\.)|\.(md|py|sh|tsv|csv|xlsx|numbers|pptx|docx)$/i.test(f));
  const unreachableHtml = [...tracked].filter((p) => ext(p) === "html" && !files.includes(p)).sort();
  const report = [
    `site manifest: ${files.length} files reachable from ${SEEDS.length} entry pages`,
    ...(outside.length ? ["REACHABLE FROM A LIVE PAGE BUT OUTSIDE THE SITE (review the link):", ...outside.map((f) => `  ${f}`)] : []),
    ...(broken.length ? [`dangling local references (${broken.length}):`, ...broken.slice(0, 40).map((b) => `  ${b.from} -> ${b.ref}`)] : []),
    `tracked HTML not shipped (${unreachableHtml.length}): ${unreachableHtml.join(" ")}`,
  ];
  process.stderr.write(report.join("\n") + "\n");
  if (!process.argv.includes("--report")) process.stdout.write(files.join("\0") + (files.length ? "\0" : ""));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
