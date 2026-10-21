import { test, expect } from '@playwright/test'

/**
 * Auditoría de la página de inicio (Dashboard) de Althea con Playwright.
 *
 * NOTA: El dashboard de Althea requiere autenticación previa (Firebase Auth)
 * y onboarding completado antes de mostrar el contenido. Sin credenciales
 * reales, la app redirige a /login o /onboarding. Por eso este suite se divide
 * en:
 *   1. Tests de carga base (sin auth): verifican que la app arranca, no hay
 *      errores críticos de renderizado, y los touch targets en móvil.
 *   2. Test de dashboard (requiere auth): se documenta abajo cómo ejecutarlo
 *      una vez que tengas una sesión válida.
 *
 * Comandos:
 *   npm run playwright          (todos los navegadores)
 *   npm run playwright:headed   (ver el navegador)
 *   npm run playwright:ui       (interfaz visual de Playwright)
 *   npx playwright test --project=mobile-chrome   (solo móvil Chrome)
 */

test.describe('Auditoría base — carga de la app (sin auth)', () => {
  test('la aplicación carga y renderiza sin bloquear', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // La app debe renderizar algo visible (login, onboarding o dashboard)
    const body = page.locator('body')
    await expect(body).toBeVisible()
  })

  test('no hay errores críticos de JavaScript que rompan el renderizado', async ({ page }) => {
    const criticalErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        // Ignorar errores de Firebase/red esperados sin credenciales reales
        const isFirebaseOrNetwork =
          /firebase/i.test(text) || /auth\//i.test(text) || /network/i.test(text) || /Failed to load/i.test(text)
        if (!isFirebaseOrNetwork) criticalErrors.push(text)
      }
    })
    const failedRequests: string[] = []
    page.on('requestfailed', (req) => {
      const url = req.url()
      // Ignorar peticiones de Firebase esperadas sin auth
      if (!/firebase/i.test(url)) failedRequests.push(url)
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    expect(criticalErrors).toEqual([])
    expect(failedRequests).toEqual([])
  })

  test('no hay scroll horizontal en ningún viewport', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const body = page.locator('body')
    const bodyBox = await body.boundingBox()
    const viewport = page.viewportSize()

    expect(bodyBox?.width).toBeLessThanOrEqual(viewport!.width)
  })

  test('HTML semántico: hay al menos un botón <button> interactivo visible', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const buttons = page.locator('button')
    await expect(buttons.first()).toBeVisible()
  })

  test('touch targets ≥ 44px en viewport móvil', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const viewport = page.viewportSize()
    if (!viewport || viewport.width > 768) {
      test.skip() // solo aplica en móviles
    }

    const interactive = page.locator('button, a, input[type="button"], input[type="submit"]')
    const count = await interactive.count()
    for (let i = 0; i < count; i++) {
      const el = interactive.nth(i)
      const box = await el.boundingBox()
      if (box) {
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
      }
    }
  })
})

test.describe('Auditoría — Dashboard de Inicio (requiere autenticación)', () => {
  test.skip(true, 'Requiere sesión de Firebase válida y onboarding completado.')

  test.skip(true, [
    'Cómo habilitar la auditoría del dashboard con sesión:',
    '  1. Inicia sesión manualmente en el navegador: http://localhost:5173/login',
    '  2. Completa el onboarding si se solicita.',
    '  3. Guarda el estado de sesión:',
    '     npx playwright test --save-storage=auth.json',
    '  4. Ejecuta los tests del dashboard con ese estado:',
    '     npx playwright test --storageState=auth.json --grep "Dashboard"',
  ].join('\n'))
})
