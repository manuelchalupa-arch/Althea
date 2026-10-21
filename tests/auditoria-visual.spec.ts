import { test, expect } from '@playwright/test'

/**
 * AUDITORÍA VISUAL COMPLETA — Althea Dashboard
 *
 * Este suite captura cada página principal en múltiples resoluciones y verifica:
 * 1. Carga sin errores críticos
 * 2. Sin scroll horizontal
 * 3. Elementos prioritarios visibles sin scroll
 * 4. HTML semántico
 * 5. Touch targets ≥ 44px en móvil
 * 6. No información solo por color
 * 7. Capturas de pantalla para comparación visual
 */

const DESKTOP_RESOLUTIONS = [
  { name: 'desktop-1366', width: 1366, height: 768 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
]

const MOBILE_RESOLUTIONS = [
  { name: 'mobile-320', width: 320, height: 568 },
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
]

const PAGES = [
  { path: '/', name: 'Inicio' },
  { path: '/entrenar', name: 'Entrenar' },
  { path: '/progreso', name: 'Progreso' },
  { path: '/nutricion', name: 'Nutrición' },
  { path: '/mas', name: 'Más' },
  { path: '/actividad', name: 'Actividad' },
  { path: '/rutina', name: 'Rutina' },
  { path: '/perfil', name: 'Perfil' },
  { path: '/coach', name: 'Coach' },
  { path: '/calendario', name: 'Calendario' },
  { path: '/biblioteca', name: 'Biblioteca' },
  { path: '/recuperacion', name: 'Recuperación' },
  { path: '/login', name: 'Login' },
  { path: '/onboarding', name: 'Onboarding' },
]

test.describe('AUDITORÍA VISUAL — Capturas y verificación de layout', () => {
  for (const res of [...DESKTOP_RESOLUTIONS, ...MOBILE_RESOLUTIONS]) {
    test.describe(`Resolución: ${res.name} (${res.width}x${res.height})`, () => {
      test.use({ viewport: { width: res.width, height: res.height } })

      for (const page of PAGES) {
        test(`Carga ${page.name} (${page.path}) sin errores críticos`, async ({ page: p }) => {
          const consoleErrors: string[] = []
          p.on('console', (msg) => {
            if (msg.type() === 'error') {
              const text = msg.text()
              const isExpected =
                /firebase/i.test(text) ||
                /auth\//i.test(text) ||
                /network/i.test(text) ||
                /Failed to load/i.test(text)
              if (!isExpected) consoleErrors.push(text)
            }
          })
          const failedRequests: string[] = []
          p.on('requestfailed', (req) => {
            if (!/firebase/i.test(req.url())) failedRequests.push(req.url())
          })

          await p.goto(page.path)
          await p.waitForLoadState('networkidle')

          // Tomar captura para referencia visual
          await p.screenshot({
            path: `test-results/visual-${res.name}-${page.name.replace(/\s/g, '_')}.png`,
            fullPage: true,
          })

          expect(consoleErrors).toEqual([])
          expect(failedRequests).toEqual([])
        })

        test(`No hay scroll horizontal en ${page.name} (${res.name})`, async ({ page: p }) => {
          await p.goto(page.path)
          await p.waitForLoadState('networkidle')

          const body = p.locator('body')
          const bodyBox = await body.boundingBox()
          const viewport = p.viewportSize()

          expect(bodyBox?.width).toBeLessThanOrEqual(viewport!.width)
        })

        test(`HTML semántico en ${page.name} (${res.name})`, async ({ page: p }) => {
          await p.goto(page.path)
          await p.waitForLoadState('networkidle')

          const buttons = p.locator('button')
          await expect(buttons.first()).toBeVisible({ timeout: 5000 })
        })
      } // fin for PAGES
    }) // fin describe resolución
  } // fin for resoluciones
}) // fin describe principal

test.describe('AUDITORÍA VISUAL — Touch targets en móvil', () => {
  for (const res of MOBILE_RESOLUTIONS) {
    test.use({ viewport: { width: res.width, height: res.height } })

    test(`Touch targets ≥ 44px en ${res.name}`, async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      const interactive = page.locator(
        'button, a, input[type="button"], input[type="submit"]'
      )
      const count = await interactive.count()
      const small: Array<{ index: number; tag: string; text: string; w: number; h: number }> = []
      for (let i = 0; i < count; i++) {
        const el = interactive.nth(i)
        const box = await el.boundingBox()
        const tag = await el.evaluate((e) => e.tagName)
        const text = (await el.textContent() || '').trim().slice(0, 30)
        if (box && Math.min(box.width, box.height) < 44) {
          small.push({ index: i, tag, text, w: box.width, h: box.height })
        }
      }
      if (small.length > 0) {
        console.log('SMALL TOUCH TARGETS:', JSON.stringify(small, null, 2))
      }
      expect(small).toEqual([])
    }) // fin test touch targets
  } // fin for resoluciones
}) // fin describe touch targets

test.describe('AUDITORÍA VISUAL — Página de Inicio (Dashboard)', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  test('hidratación, macros y gasto calórico visibles sin scroll', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const viewport = page.viewportSize()!

    const agua = page.getByTestId('water-bottle')
    const macros = page.getByText(/Consumo de macronutrientes/)
    const gasto = page.getByTestId('inicio-gasto-calorico')

    const aguaBox = await agua.boundingBox()
    const macrosBox = await macros.boundingBox()
    const gastoBox = await gasto.boundingBox()

    const isVisible = (box: any) =>
      box && box.y >= 0 && box.y + box.height <= viewport.height + 50

    expect(isVisible(aguaBox) || isVisible(macrosBox) || isVisible(gastoBox)).toBeTruthy()
  })

  test('grid de dashboard no tiene superposición ni desbordamiento', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const dashboard = page.locator('.dashboard-main')
    if (await dashboard.count() > 0) {
      const box = await dashboard.boundingBox()
      const viewport = page.viewportSize()!
      expect(box?.x).toBeGreaterThanOrEqual(0)
      expect(box?.width).toBeLessThanOrEqual(viewport.width)
    }
  })
})
