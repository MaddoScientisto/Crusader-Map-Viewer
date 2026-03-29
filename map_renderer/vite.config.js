import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  root: path.join(__dirname, "src", "vue"),
  build: {
    outDir: path.join(__dirname, "dist-vue"),
    emptyOutDir: true
  },
  server: {
    fs: {
      allow: [__dirname]
    }
  }
});