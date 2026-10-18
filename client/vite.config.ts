import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Do not silently move to 5174/5175 when an old client is still running;
  // that makes the owner test a stale build while the server stays on 9001.
  server: { port: 5173, strictPort: true },
  // Phase 8e-25 (A-004): the single eager entry bundled React, three.js, and
  // every overlay into one 1.2 MB minified chunk (349 KB gzip) — a cold-load
  // parse/compile tax on potato PCs. Split the two heavy vendors into their
  // own cacheable chunks; the UI overlays that are rarely opened (F8 playtest
  // panel, the Esc menu with its clan/social/cosmetics tabs) are loaded
  // lazily via React.lazy on top of this.
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // three.module.js + the examples (GLTFLoader, mergeGeometries,
          // SkeletonUtils) are ~600 KB minified of the old single chunk.
          three: ["three", "three/examples/jsm/loaders/GLTFLoader.js", "three/examples/jsm/utils/SkeletonUtils.js"],
          // React + react-dom are stable, cacheable, and shared by everything.
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
