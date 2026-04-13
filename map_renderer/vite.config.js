import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [vue()],
  root: path.join(__dirname, "src", "vue"),
  build: {
    outDir: path.join(__dirname, "dist-vue"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) {
            return "three-vendor";
          }
          if (id.includes("WireframeViewport3D.vue")) {
            return "viewport-3d";
          }
          if (id.includes("node_modules")) {
            return "vendor";
          }
          return undefined;
        }
      }
    }
  },
  server: {
    fs: {
      allow: [__dirname]
    }
  }
});