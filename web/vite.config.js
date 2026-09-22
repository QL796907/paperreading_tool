import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const dir = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(dir, "..", "package.json"), "utf8"));

export default defineConfig({
  root: dir,
  base: "./",
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || "1.0.0"),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3780",
        timeout: 0,
      },
    },
  },
  build: {
    outDir: path.join(dir, "dist"),
    emptyOutDir: true,
  },
});
