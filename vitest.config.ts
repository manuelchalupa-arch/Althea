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
    // La app es Argentina-céntrica: la "fecha civil local" (S7) se define sobre
    // America/Buenos_Aires. Fijar TZ aquí hace los tests deterministas en
    // cualquier máquina (local o runner CI, que por defecto corre en UTC).
    env: { TZ: 'America/Argentina/Buenos_Aires' },
    // Margen por test para que la ejecución en paralelo bajo carga no provoque
    // timeouts intermitentes. Ver src/test/setup.ts (asyncUtilTimeout).
    testTimeout: 20000,
    hookTimeout: 20000,
    typecheck: {
      tsconfig: './tsconfig.json'
    }
  },
})
