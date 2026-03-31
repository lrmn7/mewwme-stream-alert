import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 10000,
    // Run tests sequentially to avoid port/storage conflicts
    fileParallelism: false,
  },
});
