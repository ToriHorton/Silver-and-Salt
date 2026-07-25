import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

// The app islands are Preact, and @odla-ai/chapter's UI is authored against
// Preact directly, so component tests render through the same aliasing the
// production build uses (react/react-dom -> preact/compat via the preset).
export default defineConfig({
  plugins: [preact()],
  test: {
    include: ["test/**/*.test.{mjs,jsx}"],
    environment: "node",
  },
});
