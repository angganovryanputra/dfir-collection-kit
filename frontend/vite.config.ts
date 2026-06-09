import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // All third-party packages must live in a single chunk.
          //
          // Many React-ecosystem packages (Radix UI, react-hook-form, cmdk,
          // vaul, next-themes, react-router, @tanstack/react-query, etc.) call
          // React.createContext() / React.forwardRef() at module top-level.
          // Splitting them across Rollup chunks causes a TDZ initialisation
          // error in the browser ("can't access property 'createContext' of
          // undefined") because cross-chunk bindings for the CJS default export
          // of React may be unresolved when those modules are first evaluated.
          // A single vendor chunk guarantees React is fully initialised before
          // any dependent package runs.
          if (id.includes("node_modules/")) {
            return "vendor";
          }
        },
      },
    },
  },
}));
