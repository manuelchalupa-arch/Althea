import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'worker/**/*.test.ts'],
    pool: 'forks',
    globals: true,
    // Margen por test para que la ejecución en paralelo bajo carga no provoque
    // timeouts intermitentes. Ver src/test/setup.ts (asyncUtilTimeout).
    testTimeout: 20000,
    hookTimeout: 20000,
    typecheck: {
      tsconfig: './tsconfig.json'
    }
  },
})
