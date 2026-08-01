import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
  },
});
