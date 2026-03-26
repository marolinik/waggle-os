import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  root: path.resolve(__dirname, "apps/web"),
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3333",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:3333",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:3333",
        ws: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web/src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  css: {
    postcss: path.resolve(__dirname, "apps/web"),
  },
}));
