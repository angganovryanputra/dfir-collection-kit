import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(fileURLToPath(new URL(".", import.meta.url)), "./src") } },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], clearMocks: true, exclude: [...configDefaults.exclude, "e2e/**"] },
});
