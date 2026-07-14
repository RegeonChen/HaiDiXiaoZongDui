import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared')
    }
  },
  test: {
    environment: 'node',
    include: ['electron/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html']
    }
  }
});
