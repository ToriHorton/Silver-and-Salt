// The public site manifest (_scripts/site-manifest.mjs): only files reachable
// from the entry pages ship; references resolve the way the Worker serves them.
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SEEDS, computeManifest, extractRefs, resolveRef } from "../_scripts/site-manifest.mjs";

const tracked = new Set(["index.html", "membership.html", "members/index.html", "assets/a.png", "styles.css", "faqs.html", "marketing/one-pager.html"]);

describe("resolveRef", () => {
  it("resolves clean urls, directories, root, and relative paths the way the site serves them", () => {
    expect(resolveRef("/membership", "index.html", tracked)).toBe("membership.html");
    expect(resolveRef("membership.html?tier=standard#top", "index.html", tracked)).toBe("membership.html");
    expect(resolveRef("members/", "index.html", tracked)).toBe("members/index.html");
    expect(resolveRef("/", "faqs.html", tracked)).toBe("index.html");
    expect(resolveRef("../assets/a.png", "members/index.html", tracked)).toBe("assets/a.png");
    expect(resolveRef("../styles.css", "marketing/one-pager.html", tracked)).toBe("styles.css");
  });
  it("never resolves outside the repo or to an untracked file", () => {
    expect(resolveRef("../../etc/passwd", "index.html", tracked)).toBeNull();
    expect(resolveRef("dashboard.html", "index.html", tracked)).toBeNull();
  });
});

describe("extractRefs", () => {
  it("finds html attributes, srcset, meta refresh, inline css and js, and skips external links", () => {
    const html = `<a href="https://x.test/a">x</a><a href="mailto:a@b.c">m</a><a href="/faqs">f</a>
      <img src="assets/a.png" srcset="assets/b.png 1x, assets/c.png 2x"><meta http-equiv="refresh" content="0; url=membership.html">
      <meta property="og:image" content="/assets/og.png"><style>.h{background:url("assets/bg.svg")}</style>
      <script>const p = "members/tori.jpg"; fetch("/api/config");</script>`;
    expect(extractRefs(html, "html")).toEqual(expect.arrayContaining(["/faqs", "assets/a.png", "assets/b.png", "assets/c.png", "membership.html", "/assets/og.png", "assets/bg.svg", "members/tori.jpg", "/api/config"]));
    expect(extractRefs(html, "html")).not.toEqual(expect.arrayContaining(["https://x.test/a", "mailto:a@b.c"]));
  });
});

describe("computeManifest", () => {
  it("ships the transitive closure of the entry pages and nothing else", () => {
    const root = mkdtempSync(join(tmpdir(), "ssc-manifest-"));
    const files = {
      "index.html": '<link href="styles.css"><a href="/membership">m</a><script src="org-data.js"></script>',
      "membership.html": '<img src="members/tori.jpg">',
      "styles.css": 'body{background:url(assets/bg.png)}',
      "org-data.js": 'const logo = "assets/founders/x.png";',
      "404.html": "lost", "join.html": "join", "admin/index.html": "admin", "members/index.html": "members",
      "members/tori.jpg": "jpg", "assets/bg.png": "png", "assets/founders/x.png": "png",
      "draft.html": '<a href="secret.pdf">only from a draft</a>', "secret.pdf": "pdf", "deck.pptx": "deck", "notes.md": "md",
    };
    for (const [p, body] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), body); }
    const { files: shipped, broken } = computeManifest({ root, tracked: new Set(Object.keys(files)), seeds: SEEDS });
    expect(shipped).toEqual(["404.html", "admin/index.html", "assets/bg.png", "assets/founders/x.png", "index.html", "join.html", "members/index.html", "members/tori.jpg", "membership.html", "org-data.js", "styles.css"]);
    expect(shipped).not.toEqual(expect.arrayContaining(["draft.html", "secret.pdf", "deck.pptx", "notes.md"]));
    expect(broken).toEqual([]);
  });
  it("refuses a missing entry page", () => {
    expect(() => computeManifest({ root: "/", tracked: new Set(["index.html"]), seeds: SEEDS })).toThrow(/seed page/);
  });
});
