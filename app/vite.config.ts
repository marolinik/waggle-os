import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Prevent vite from obscuring Rust errors
  clearScreen: false,

  build: {
    // Output to dist/ for both Tauri and web mode
    outDir: "dist",
    // Generate source maps for debugging (stripped by Tauri for production)
    sourcemap: true,
    rollupOptions: {
      // Mark Tauri packages as external — they're loaded dynamically at runtime
      // and only available in the Tauri desktop environment
      external: [
        /^@tauri-apps\/.*/,
      ],
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          markdown: ['marked', 'dompurify'],
        },
      },
    },
  },

  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
});
