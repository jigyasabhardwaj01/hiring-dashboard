import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: { include: ['tests/**/*.test.ts'], setupFiles: ['tests/setup.ts'], testTimeout: 20000, server: { deps: { external: [/unpdf/, /mammoth/] } } },
});
