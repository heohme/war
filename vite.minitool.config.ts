import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: "public",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [react()],
  build: {
    target: ["es2017", "chrome61"],
    outDir: "dist-minitool",
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(import.meta.dirname, "minitool/entry.tsx"),
      name: "SouDaCheMiniTool",
      formats: ["iife"],
      fileName: () => "assets/app.js",
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => assetInfo.name?.endsWith(".css") ? "assets/style.css" : "assets/[name][extname]",
      },
    },
  },
});
