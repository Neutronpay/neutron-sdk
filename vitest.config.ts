import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only run tests from the tests/ directory
    // Exclude integration tests (standalone scripts that need API keys)
    include: ["tests/**/*.test.ts"],
    exclude: ["test/**", "node_modules/**"],
  },
});
