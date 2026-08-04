import { defineConfig } from "vitest/config";

// Only the checked-in suite under tests/ is a test. Without this, vitest also
// globs dist/, where the build had been copying tests/ verbatim — so the same
// files ran twice, from a stale copy, and a transient failure in the stale run
// looked like a real regression. The build now excludes tests/ as well; this
// config is the second line of defence so a dist/ copy can never run again.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.mjs"],
    exclude: ["dist/**", "node_modules/**"],
    // Live dev calls include Calendar FreeBusy and odla-db round trips. Keep
    // the offline suite fast while giving deployed acceptance enough room for
    // normal network variance.
    testTimeout: process.env.ACCEPTANCE_URL ? 20_000 : 5_000,
  },
});
