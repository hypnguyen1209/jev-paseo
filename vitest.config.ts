import { defineConfig } from "vitest/config";

// Only the pure logic modules are tested (no React Native / no daemon).
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
