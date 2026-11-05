import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js', 'mock/**/*.js'],
      exclude: ['src/index.js'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
    },
  },
});
