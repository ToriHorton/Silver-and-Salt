// Fail before tests/build if a clean install or local overlay differs from
// the reviewed shared dev artifacts. No network or credentials are needed.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url));
const json = (path) => JSON.parse(read(path));
const hash = (bytes, algorithm = "sha256", encoding = "hex") =>
  createHash(algorithm).update(bytes).digest(encoding);
const provenance = json("vendor/odla-build.json");
const manifest = json("package.json");
const lock = json("package-lock.json");
for (const artifact of provenance.packages) {
  const path = "vendor/" + artifact.file;
  const bytes = read(path);
  assert.equal(hash(bytes), artifact.sha256, path + " archive differs");
  assert.equal(manifest.dependencies[artifact.name], "file:" + path);
  const installedPath = "node_modules/" + artifact.name;
  const locked = lock.packages[installedPath];
  assert.equal(locked.version, artifact.version);
  assert.equal(locked.resolved, "file:" + path);
  assert.equal(locked.integrity, "sha512-" + hash(bytes, "sha512", "base64"));
  assert.equal(json(installedPath + "/package.json").version, artifact.version);
  for (const [entry, expected] of Object.entries(artifact.entries)) {
    assert.equal(hash(read(installedPath + "/" + entry)), expected, artifact.name + "/" + entry);
  }
}
console.log("Verified shared dev packages from " + provenance.sourceCommit);
