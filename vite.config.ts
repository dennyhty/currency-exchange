import { defineConfig } from 'vitest/config';

// GitHub project pages are served from /<repo>/, so assets must be built for that base.
const base = process.env.VITE_BASE ?? '/currency-exchange/';

export default defineConfig({
  base,
  define: {
    __BUILD_SHA__: JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 7)),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
