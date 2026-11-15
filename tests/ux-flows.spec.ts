import { test, expect, type Locator, type Page } from '@playwright/test'
import { seedBase } from './helpers/seed'

/**
 * Verificación de los 12 criterios de flujo del rediseño UX, recorridos de
 * punta a punta en cada ancho requerido (360–430px). Misma siembra local que
 * el resto de las specs: modo offline (`althea:offlineMode`) + escritura
 * directa en IndexedDB. NO usa cuentas reales, NO toca Firestore.
 *
 *   npx playwright test tests/ux-flows.spec.ts --project=chromium --workers=2
 */

const WIDTHS = [
  { w: 360, h: 800 },
  { w: 375, h: 812 },
  { w: 390, h: 844 },
  { w: 412, h: 915 },
  { w: 430, h: 932 },
]

const bottomNav = (page: Page) =>
  page.locator('nav[aria-label="Navegación principal"][class*="bottom-0"]')

/** Lado mínimo de un target táctil (debe ser ≥44px). */
async function minSide(loc: Locator): Promise<number> {
  const box = await loc.boundingBox()
  expect(box, 'el elemento no tiene caja visible').not.toBeNull()
  return Math.min(box!.width, box!.height)
}

/** Estado de la rutina de prueba tal como está en Dexie/IndexedDB. */
const snapshotRoutine = (page: Page) =>
  page.evaluate(async () => {
    const open = () => new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('trainPWA')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const idb = await open()
    const row = await new Promise<Record<string, unknown> | undefined>((res, rej) => {
      const rq = idb.transaction('routineStore', 'readonly').objectStore('routineStore').get('qa-routine')
      rq.onsuccess = () => res(rq.result as Record<string, unknown> | undefined)
      rq.onerror = () => rej(rq.error)
    })
    idb.close()
    return JSON.stringify(
      row ? { id: row.id, name: row.name, cycle: row.cycle, dayExercises: row.dayExercises } : null,
    )
  })

/** Cargas de documento reales (una por page.goto; la SPA no suma). */
const navEntries = (page: Page) => page.evaluate(() => performance.getEntriesByType('navigation').length)

for (const size of WIDTHS) {
  test.describe(`${size.w}x${size.h}`, () => {
    test.use({ viewport: { width: size.w, height: size.h } })

    test('12 criterios de flujo del rediseño', async ({ page }) => {
      test.setTimeout(240_000)

      await seedBase(page, { session: true })
      await page.goto('/')
      await expect(page.getByText('¡Hola, Nico!')).toBeVisible({ timeout: 30_000 })
      const routineBefore = await snapshotRoutine(page)

      // ── 1 · desde Inicio al entrenamiento en ≤2 interacciones ──
      await test.step('1 · CTA de Inicio → Entrenar en ≤2 interacciones', async () => {
        const cta = page.getByTestId('inicio-hero-cta')
        await expect(cta).toBeVisible({ timeout: 20_000 })
        expect(await minSide(cta)).toBeGreaterThanOrEqual(44)
        await cta.click()
        await page.waitForURL('**/entrenar')
        await expect(page.locator('button[aria-label="Finalizar entrenamiento"]').first()).toBeVisible({ timeout: 20_000 })
      })

      // ── 2 · la pantalla está centrada en el ejercicio actual ──
      await test.step('2 · ejercicio actual visible en pantalla', async () => {
        const badge = page.getByText('EJERCICIO 1 DE 2', { exact: true })
        await expect(badge).toBeVisible({ timeout: 20_000 })
        const card = page.locator('div.domain-training').filter({ hasText: 'EJERCICIO 1 DE 2' })
        await expect(card.locator('h2')).toBeVisible()
        expect((await card.locator('h2').innerText()).trim().length).toBeGreaterThan(0)
        // El encabezado del ejercicio cae dentro del primer viewport (sin scroll).
        const vp = page.viewportSize()!
        const box = await badge.boundingBox()
        expect(box!.y).toBeGreaterThanOrEqual(0)
        expect(box!.y).toBeLessThan(vp.height)
      })

      // ── 6 · un único Finalizar en toda la pantalla ──
      await test.step('6 · exactamente un botón Finalizar visible', async () => {
        const finish = page.locator('button[aria-label="Finalizar entrenamiento"]:visible')
        expect(await finish.count()).toBe(1)
        expect(await minSide(finish.first())).toBeGreaterThanOrEqual(44)
      })

      // ── 3 · registrar una serie sin salir de la pantalla ──
      await test.step('3 · registrar serie sin navegar', async () => {
        const confirm = page.locator('button[aria-label="Confirmar serie 1"]')
        await expect(confirm).toBeVisible({ timeout: 20_000 })
        expect(await minSide(confirm)).toBeGreaterThanOrEqual(44)
        await confirm.click()
        await expect(page).toHaveURL(/\/entrenar/)
        await expect(page.getByText('EJERCICIO 1 DE 2', { exact: true })).toBeVisible()
      })

      // ── 4 · el temporizador de descanso se consulta y se cierra ──
      await test.step('4 · temporizador consultable y cierre a doble toque', async () => {
        const fin = page.locator('button[aria-label="Terminar descanso"]')
        await expect(fin).toBeVisible({ timeout: 20_000 })
        await expect(page.locator('[role="timer"]')).toBeVisible()
        // Doble toque en menos de 3s (el overlay pide confirmación).
        await fin.click()
        await fin.click()
        await expect(fin).toBeHidden({ timeout: 10_000 })
        await expect(page).toHaveURL(/\/entrenar/)
      })

      // ── 5 · cambiar de ejercicio sin cambiar de pantalla ──
      await test.step('5 · cambio de ejercicio', async () => {
        const next = page.locator('button[aria-label="Ejercicio siguiente"]')
        await expect(next).toBeVisible({ timeout: 20_000 })
        await next.click()
        await expect(page.getByText('EJERCICIO 2 DE 2', { exact: true })).toBeVisible({ timeout: 20_000 })
        await expect(page).toHaveURL(/\/entrenar/)
        // Sigue habiendo un único Finalizar en el último ejercicio.
        expect(await page.locator('button[aria-label="Finalizar entrenamiento"]:visible').count()).toBe(1)
      })

      // ── 7 · la rutina guardada queda intacta ──
      await test.step('7 · rutina guardada intacta', async () => {
        const after = await snapshotRoutine(page)
        expect(after).toBe(routineBefore)
        const parsed = JSON.parse(after) as { cycle?: { trainingDays?: unknown[] } }
        expect(parsed.cycle?.trainingDays?.length).toBeGreaterThan(0)
      })

      // ── 8 · CrossFit integrado: ≤4 destinos visibles, resto plegado ──
      await test.step('8 · CrossFit con ≤4 apartados visibles', async () => {
        await page.goto('/crossfit')
        await expect(page.getByRole('heading', { name: 'CROSSFIT' })).toBeVisible({ timeout: 20_000 })
        const tabs = page.locator('[role="tab"]:visible')
        expect(await tabs.count()).toBe(3)
        const more = page.locator('button[aria-controls="cf-more-row"]')
        await expect(more).toHaveAttribute('aria-expanded', 'false')
        expect(await minSide(more)).toBeGreaterThanOrEqual(44)
        // Los 3 apartados + "Más" = 4 controles en la barra principal.
        const row = page.locator('[role="tablist"][aria-label="Apartados CrossFit"] > button')
        expect(await row.count()).toBe(4)
        await more.click()
        await expect(more).toHaveAttribute('aria-expanded', 'true')
        expect(await tabs.count()).toBe(8)
        await more.click()
        await expect(more).toHaveAttribute('aria-expanded', 'false')
        expect(await tabs.count()).toBe(3)
      })

      // ── 9 · hidratación accesible desde Inicio ──
      await test.step('9 · hidratación accesible desde Inicio', async () => {
        await page.goto('/')
        await expect(page.getByText('¡Hola, Nico!')).toBeVisible({ timeout: 20_000 })
        const readout = page.getByTestId('water-bottle-readout')
        await expect(readout).toBeVisible({ timeout: 20_000 })
        const before = (await readout.innerText()).trim()
        const add = page.getByTestId('water-bottle-add-static')
        await expect(add).toBeVisible({ timeout: 20_000 })
        expect(await minSide(add)).toBeGreaterThanOrEqual(44)
        await add.click()
        await expect(readout).not.toHaveText(before, { timeout: 15_000 })
      })

      // ── 12 · targets táctiles ≥44px en la navegación ──
      await test.step('12 · targets táctiles ≥44px', async () => {
        const nav = bottomNav(page)
        await expect(nav).toBeVisible()
        const links = nav.locator('a, button')
        expect(await links.count()).toBe(4)
        const small: string[] = []
        for (let i = 0; i < await links.count(); i++) {
          const el = links.nth(i)
          const side = await minSide(el)
          if (side < 44) {
            small.push(`${(await el.getAttribute('aria-label')) ?? ''}: ${Math.round(side)}px`)
          }
        }
        expect(small).toEqual([])
      })

      // ── 10 · el resto de secciones se alcanza desde Más ──
      await test.step('10 · Más → Rutinas', async () => {
        await bottomNav(page).getByRole('link', { name: 'Más' }).click()
        await page.waitForURL('**/mas')
        await page.getByRole('link', { name: 'Rutinas' }).first().click()
        await page.waitForURL('**/rutina')
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 })
      })

      // ── 11 · Perfil se abre sin recargar la aplicación ──
      await test.step('11 · Perfil sin recarga', async () => {
        const before = await navEntries(page)
        await bottomNav(page).getByRole('link', { name: 'Más' }).click()
        await page.waitForURL('**/mas')
        await page.getByRole('link', { name: /Perfil y configuraci/ }).first().click()
        await page.waitForURL('**/perfil')
        await expect(page.getByRole('button', { name: 'Datos personales' })).toBeVisible({ timeout: 20_000 })
        expect(await navEntries(page)).toBe(before)
      })
    })
  })
}

test.describe('Escritorio 1366×768', () => {
  test.use({ viewport: { width: 1366, height: 768 } })

  test('un único Finalizar y navegación lateral amplia', async ({ page }) => {
    test.setTimeout(120_000)
    await seedBase(page, { session: true })
    await page.goto('/entrenar')

    const finish = page.locator('button[aria-label="Finalizar entrenamiento"]:visible')
    await expect(finish.first()).toBeVisible({ timeout: 30_000 })
    expect(await finish.count()).toBe(1)

    const rail = page.locator('aside[aria-label="Menú lateral"]')
    await expect(rail).toBeVisible()
    // Primarios + módulos a la vista (sin pasar por "Más" en escritorio).
    expect(await rail.locator('a:visible').count()).toBeGreaterThanOrEqual(10)
    await expect(rail.getByRole('link', { name: 'Entrenar' })).toBeVisible()
    await expect(rail.getByRole('link', { name: 'Rutinas' })).toBeVisible()
  })
})
