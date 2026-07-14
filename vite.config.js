import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(sourceRoot, "WebApp"),
  envDir: sourceRoot,
  publicDir: path.resolve(sourceRoot, "WebApp/public"),
  plugins: [react()],
  build: {
    outDir: path.resolve(sourceRoot, "dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
});
