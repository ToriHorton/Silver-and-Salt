// Generate the dev dependency graph independently of the host's node_modules.
// The Linux toolchain matches odla-ai; vendored tarballs are deliberate dev
// inputs, not a published release. npm ci remains the installation command.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (!["update", "verify"].includes(mode)) throw new Error("Expected update or verify");
if (process.version !== "v24.13.0") throw new Error("Use Node 24.13.0");
const image = "node:24.13.0-bookworm-slim@sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f";
const temporary = mkdtempSync(join(tmpdir(), "chapter-dev-lock-"));
function npm(args, capture = false) {
  const linux = process.platform === "linux";
  if (!linux && !(process.platform === "darwin" && process.arch === "arm64")) {
    throw new Error("Use the pinned Linux toolchain or Apple Silicon container runtime");
  }
  const command = linux ? "npm" : "container";
  const commandArgs = linux ? args : [
    "run", "--rm", `--mount=type=bind,source=${temporary},target=/workspace`,
    "--workdir=/workspace", "--", image, "npm", ...args,
  ];
  const result = spawnSync(command, commandArgs, {
    cwd: temporary, encoding: "utf8", stdio: capture ? "pipe" : "inherit",
  });
  if (result.error || result.status !== 0) throw result.error ?? new Error("Lock command failed");
  return result.stdout?.trim();
}
try {
  for (const name of ["package.json", "package-lock.json", "vendor"]) {
    cpSync(join(root, name), join(temporary, name), { recursive: true });
  }
  if (npm(["--version"], true) !== "11.6.2") throw new Error("Use npm 11.6.2");
  npm(["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"]);
  npm(["ci", "--dry-run", "--ignore-scripts", "--no-audit", "--no-fund"]);
  const generated = readFileSync(join(temporary, "package-lock.json"), "utf8");
  const lock = join(root, "package-lock.json");
  if (mode === "verify" && generated !== readFileSync(lock, "utf8")) {
    throw new Error("Noncanonical lockfile; run npm run lock:update");
  }
  if (mode === "update") writeFileSync(lock, generated);
  console.log(`lock:${mode}: canonical Node 24.13.0 / npm 11.6.2 dev graph`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
