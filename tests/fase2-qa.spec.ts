import { test, expect, type Page } from '@playwright/test'

/**
 * FASE 2 — QA de vista en anchos requeridos (360/375/390/393/412/430 + tablet +
 * escritorio) sobre datos LOCALES de pruebas.
 *
 * Técnica: modo offline (`althea:offlineMode`) para entrar sin credenciales y
 * siembra directa en IndexedDB `trainPWA` (perfil + rutina + sesión) — igual
 * que haría un usuario con datos ya cargados. NO usa cuentas reales, NO toca
 * Firestore: la app queda en modo local puro.
 */

const WIDTHS = [
  { w: 360, h: 800 },
  { w: 375, h: 812 },
  { w: 390, h: 844 },
  { w: 393, h: 852 },
  { w: 412, h: 915 },
  { w: 430, h: 932 },
  { w: 768, h: 1024 },
  { w: 1366, h: 768 },
]

const PAGES = [
  { path: '/', name: 'inicio' },
  { path: '/entrenar', name: 'entrenar' },
  { path: '/calendario', name: 'calendario' },
  { path: '/perfil', name: 'perfil' },
  { path: '/mas', name: 'mas' },
  { path: '/nutricion', name: 'nutricion' },
  { path: '/crossfit', name: 'crossfit' },
  { path: '/rutina', name: 'rutinas' },
]

import { seedBase } from './helpers/seed'

async function horizontalOverflow(page: Page): Promise<{ sw: number; iw: number }> {
  return page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }))
}

test.describe('FASE 2 — QA visual en anchos requeridos', () => {
  for (const size of WIDTHS) {
    test.describe(`${size.w}x${size.h}`, () => {
      test.use({ viewport: { width: size.w, height: size.h } })

      for (const p of PAGES) {
        test(`${p.name}: carga sin desbordamiento horizontal + captura`, async ({ page }) => {
          await seedBase(page)
          await page.goto(p.path)
          await page.waitForLoadState('networkidle')

          const dims = await horizontalOverflow(page)
          expect(dims.sw, `scrollWidth ${dims.sw} > viewport ${dims.iw} en ${p.path}`).toBeLessThanOrEqual(dims.iw + 1)

          await page.screenshot({
            path: `test-results/fase2-${size.w}-${p.name}.png`,
            fullPage: true,
          })
        })
      }
    })
  }
})

test.describe('FASE 2 — Navegación táctil (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('bottom nav visible con targets ≥44px', async ({ page }) => {
    await seedBase(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // El contenedor fijo aloja un único landmark nav interno; el nav ya no tiene
    // posicionamiento propio (evita dos barras inferiores superpuestas).
    const navContainer = page.locator('.app-mobile-nav')
    await expect(navContainer).toBeVisible()
    const nav = navContainer.getByRole('navigation', { name: 'Navegación principal' })
    await expect(nav).toBeVisible()
    expect(await nav.locator('.althea-nav-item__label').allTextContents()).toEqual([
      'Inicio', 'Entrenar', 'Nutrición', 'CrossFit', 'Más',
    ])

    const links = nav.locator('.althea-nav-item')
    const count = await links.count()
    expect(count).toBe(5)

    const small: string[] = []
    for (let i = 0; i < count; i++) {
      const el = links.nth(i)
      const box = await el.boundingBox()
      const label = ((await el.textContent()) || (await el.getAttribute('aria-label')) || '').trim().slice(0, 24)
      if (box && Math.min(box.width, box.height) < 44) {
        small.push(`${label}: ${Math.round(box.width)}x${Math.round(box.height)}`)
      }
    }
    expect(small).toEqual([])
  })

  test('recorrer Más → Rutinas funciona', async ({ page }) => {
    await seedBase(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('.app-mobile-nav').getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Más' }).click()
    await page.waitForURL('**/mas')
    await page.screenshot({ path: 'test-results/fase2-390-mas.png', fullPage: true })

    await page.getByRole('link', { name: 'Rutinas' }).first().click()
    await page.waitForURL('**/rutina')
    await page.screenshot({ path: 'test-results/fase2-390-rutinas.png', fullPage: true })

    const dims = await horizontalOverflow(page)
    expect(dims.sw).toBeLessThanOrEqual(dims.iw + 1)
  })
})


test.describe('FASE 2 — Accesibilidad de búsqueda y Más (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('búsqueda general mantiene el foco dentro del diálogo y permite cerrarlo', async ({ page }) => {
    await seedBase(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Buscar ejercicios, alimentos y rutinas' }).click()
    const dialog = page.getByRole('dialog', { name: 'Búsqueda general de Althea' })
    await expect(dialog).toBeVisible()
    const searchInput = dialog.getByRole('searchbox', { name: 'Buscar ejercicios, alimentos o rutinas' })
    const closeButton = dialog.getByRole('button', { name: 'Cerrar búsqueda' })
    await expect(searchInput).toBeFocused()

    await closeButton.focus()
    await page.keyboard.press('Tab')
    await expect(searchInput).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(closeButton).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('Más mantiene el foco dentro de notificaciones y cierra con Escape', async ({ page }) => {
    await seedBase(page)
    await page.goto('/mas')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /notificaciones y recordatorios/i }).click()
    const dialog = page.getByRole('dialog', { name: 'Notificaciones y recordatorios' })
    await expect(dialog).toBeVisible()
    const focusable = dialog.locator(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )
    const count = await focusable.count()
    expect(count).toBeGreaterThan(1)
    await focusable.first().focus()
    await page.keyboard.press('Shift+Tab')
    await expect(focusable.last()).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(focusable.first()).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('CrossFit presenta Hoy y WOD; las herramientas quedan agrupadas', async ({ page }) => {
    await seedBase(page)
    await page.goto('/crossfit')
    await page.waitForLoadState('networkidle')

    const tablist = page.getByRole('tablist', { name: 'Apartados CrossFit' }).first()
    await expect(tablist.getByRole('tab', { name: 'Hoy' })).toBeVisible()
    await expect(tablist.getByRole('tab', { name: 'WOD' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Programación' })).toHaveCount(0)

    await tablist.getByRole('button', { name: /Herramientas/ }).click()
    await expect(page.getByRole('tab', { name: 'Programación' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Biblioteca' })).toBeVisible()
  })
})

test.describe('FASE 2 — Sesión en curso y finalización (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Entrenar adopta la sesión IN_PROGRESS y abre el FinishModal', async ({ page }) => {
    await seedBase(page, { session: true })
    await page.goto('/entrenar')
    await page.waitForLoadState('networkidle')

    // R6: todas las variantes del control comparten aria-label accesible.
    const finishBtn = page.locator('button[aria-label="Finalizar entrenamiento"]:visible').first()
    await expect(finishBtn).toBeVisible({ timeout: 20000 })

    let dims = await horizontalOverflow(page)
    expect(dims.sw, 'scroll horizontal en sesión').toBeLessThanOrEqual(dims.iw + 1)
    await page.screenshot({ path: 'test-results/fase2-390-sesion.png', fullPage: true })

    await finishBtn.click()
    const heading = page.getByRole('heading', { name: 'Finalizar entrenamiento' })
    await expect(heading).toBeVisible({ timeout: 15000 })
    await page.screenshot({ path: 'test-results/fase2-390-finishmodal.png' })
  })

  test('el descanso obligatorio bloquea el avance al siguiente ejercicio', async ({ page }) => {
    await seedBase(page, { session: true })
    await page.goto('/entrenar')
    await page.waitForLoadState('networkidle')

    const currentExercise = page.getByRole('heading', { name: 'Press banca', exact: true })
    await expect(currentExercise).toBeVisible({ timeout: 20000 })
    await page.getByLabel('Confirmar serie 1').click()

    // La fixture tiene dos series: al confirmar la primera debe comenzar
    // el descanso entre series antes de permitir cambiar de ejercicio.
    await expect(page.getByLabel('Terminar descanso')).toBeVisible({ timeout: 15000 })
    await page.getByLabel('Ejercicio siguiente').click()
    await expect(currentExercise).toBeVisible()
  })
})

test.describe('FASE 2 — Persistencia local (390px)', () => {  test.use({ viewport: { width: 390, height: 844 } })

  test('recargar la aplicación conserva perfil y rutina en IndexedDB', async ({ page }) => {
    await seedBase(page)
    await page.goto('/')
    await expect(page.getByText('¡Hola, Nico!')).toBeVisible({ timeout: 20000 })

    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('¡Hola, Nico!')).toBeVisible({ timeout: 20000 })

    // Verificación directa de la base tras la reapertura.
    const displayName = await page.evaluate(async () => {
      const idb = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('trainPWA')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const row = await new Promise<{ displayName?: string } | undefined>((res, rej) => {
        const tx = idb.transaction('userProfile', 'readonly')
        const rq = tx.objectStore('userProfile').get('me')
        rq.onsuccess = () => res(rq.result as { displayName?: string })
        rq.onerror = () => rej(rq.error)
      })
      idb.close()
      return row?.displayName
    })
    expect(displayName).toBe('Nico')
  })
})

test.describe('FASE FINAL — R5: Cambiar día sin reiniciar (1366px)', () => {
  test.use({ viewport: { width: 1366, height: 768 } })

  test('aplica el override de día sin location.reload y conserva la sesión', async ({ page }) => {
    await seedBase(page, { session: true })

    // Rutina activa con ciclo: prerequisite del flujo "Cambiar día".
    await page.evaluate(async () => {
      const open = () => new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('trainPWA')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const idb = await open()
      const row = await new Promise<Record<string, unknown> | undefined>((res, rej) => {
        const rq = idb.transaction('routineStore', 'readwrite').objectStore('routineStore').get('qa-routine')
        rq.onsuccess = () => res(rq.result as Record<string, unknown> | undefined)
        rq.onerror = () => rej(rq.error)
      })
      await new Promise<void>((res, rej) => {
        const tx = idb.transaction('routineStore', 'readwrite')
        const os = tx.objectStore('routineStore')
        os.put({ ...row, cycle: { trainingDays: [{ n: 1, name: 'Pecho' }, { n: 2, name: 'Espalda' }] } })
        os.put({ id: 'meta:activeId', activeId: 'qa-routine' })
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      idb.close()
    })

    page.on('dialog', (d) => d.accept('2'))
    await page.goto('/entrenar')
    await page.waitForLoadState('networkidle')

    // La acción está dentro del grupo plegado "Más opciones de la sesión"
    // para evitar saturar la vista; el test debe abrirlo antes de usarla.
    await page.locator('button[aria-label="Más opciones de la sesión"]:visible').last().click()
    const btn = page.getByRole('button', { name: 'Cambiar día de entrenamiento' })
    await expect(btn).toBeVisible({ timeout: 20000 })

    // Marcador anti-reload: si la app se reinicia, desaparece.
    await page.evaluate(() => { (window as unknown as { __r5?: string }).__r5 = 'vivo' })

    await btn.click()

    // Override persistido en Dexie (sessionOverrides[fecha] = 2).
    const today = await page.evaluate(() => {
      const pad = (n: number) => String(n).padStart(2, '0')
      const d = new Date()
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    })
    await expect.poll(async () => page.evaluate(async (date) => {
      const idb = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('trainPWA')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const row = await new Promise<{ overrideDay?: number } | undefined>((res, rej) => {
        const rq = idb.transaction('sessionOverrides', 'readonly').objectStore('sessionOverrides').get(date)
        rq.onsuccess = () => res(rq.result as { overrideDay?: number } | undefined)
        rq.onerror = () => rej(rq.error)
      })
      idb.close()
      return row?.overrideDay ?? null
    }, today), { timeout: 10000 }).toBe(2)

    // Sin reinicio de la aplicación y con la sesión intacta.
    expect(await page.evaluate(() => (window as unknown as { __r5?: string }).__r5)).toBe('vivo')
    expect(await page.evaluate(() => localStorage.getItem('althea:session:activeId'))).toBe('qa-s1')
    await expect(page.getByRole('heading', { name: 'Pecho' })).toBeVisible({ timeout: 10000 })

    const dims = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
    expect(dims.sw).toBeLessThanOrEqual(dims.iw + 1)
    await page.screenshot({ path: 'test-results/fasefinal-r5-cambiardia.png', fullPage: true })
  })
})
