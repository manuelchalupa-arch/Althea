import { test } from '@playwright/test'
import { seedBase } from './helpers/seed'

/**
 * Capturas comparativas UX (390×844) — misma siembra, mismo viewport.
 * Fase: `UX_PHASE=before|after` (define la carpeta de salida).
 *   npx playwright test tests/ux-shots.spec.ts --project=chromium
 */

const PHASE = process.env.UX_PHASE === 'after' ? 'after' : 'before'
const OUT = `ux-shots/${PHASE}`

const SHOTS = [
  { path: '/', name: 'inicio', session: false },
  { path: '/entrenar', name: 'entrenar', session: true },
  { path: '/crossfit', name: 'crossfit', session: false },
  { path: '/mas', name: 'mas', session: false },
  { path: '/perfil', name: 'perfil', session: false },
  { path: '/rutinas', name: 'rutinas', session: false },
]

test.use({ viewport: { width: 390, height: 844 } })

test.describe('Capturas UX', () => {
  for (const s of SHOTS) {
    test(`${s.name} (${PHASE})`, async ({ page }) => {
      await seedBase(page, { session: s.session })
      await page.goto(s.path)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(600)
      await page.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: true })
    })
  }
})
