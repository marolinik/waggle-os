import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
const sidecarTarget = process.env.SIDECAR_TARGET ?? "http://127.0.0.1:3333";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        target: sidecarTarget,
        changeOrigin: false,
      },
      "/health": {
        target: sidecarTarget,
        changeOrigin: false,
      },
      "/ws": {
        target: sidecarTarget.replace(/^http/, "ws"),
        ws: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        // Split the heaviest independent vendor libraries out of the single
        // ~1.9MB app chunk so they cache separately and don't gate first paint.
        // The React runtime + router stay in ONE chunk so context/singleton
        // init order can't break across a chunk boundary.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-")) return "vendor-charts";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return "vendor-react";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
