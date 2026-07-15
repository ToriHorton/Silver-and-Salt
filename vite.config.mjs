// Scoped Preact build for the APP pages only (admin console, member area,
// join booking step). Marketing pages stay on the copy-through path in
// _scripts/build-site.sh; this build runs after it and drops island bundles
// into dist/assets/app/. Entry names are stable (no hash) because the HTML
// references them with the repo's ?v= cache-busting convention.
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: "dist/assets/app",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        admin: "src/app/admin/index.jsx",
        members: "src/app/members.jsx",
        "join-picker": "src/app/join-picker.jsx",
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunk-[hash].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
