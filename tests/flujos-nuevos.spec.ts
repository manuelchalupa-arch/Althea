import { test, expect, type Page } from '@playwright/test'
import { seedBase } from './helpers/seed'

/**
 * Flujos nuevos de la fase de simplificación: Entrenar esencial + «Más
 * opciones», consulta de dolor post-ejercicio, finalización con retorno a
 * Inicio, y en Rutina: modalidad simplificada/asistida, superseries y
 * reordenamiento persistente. Recorre los 5 anchos requeridos (360–430) para
 * desborde horizontal y targets táctiles.
 *
 *   npx playwright test tests/flujos-nuevos.spec.ts --project=chromium --workers=2 --reporter=line
 */

const WIDTHS = [
  { w: 360, h: 800 },
  { w: 375, h: 812 },
  { w: 390, h: 844 },
  { w: 412, h: 915 },
  { w: 430, h: 932 },
]

const SHOTS = 'shots'

/** Sin desborde horizontal en el documento. */
async function expectNoOverflow(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(over, 'desborde horizontal').toBeLessThanOrEqual(1)
}

/** Cierra el descanso activo si está (doble toque, como pide el overlay). */
async function closeRestIfAny(page: Page) {
  const fin = page.locator('button[aria-label="Terminar descanso"]')
  try {
    await fin.waitFor({ state: 'visible', timeout: 4000 })
  } catch {
    return
  }
  await fin.click()
  await fin.click()
  await expect(fin).toBeHidden({ timeout: 10000 })
}

/** Confirma la serie n, cierra el descanso y responde «No» al dolor si aparece. */
async function confirmSet(page: Page, n: number, painShot?: string) {
  await page.locator(`button[aria-label="Confirmar serie ${n}"]`).first().click()
  await closeRestIfAny(page)
  const pain = page.locator('[data-testid="pain-prompt"]')
  try {
    await pain.waitFor({ state: 'visible', timeout: 6000 })
  } catch {
    return
  }
  // Captura el prompt de dolor mientras está visible (antes de responder).
  if (painShot) {
    await pain.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${painShot}.png`, fullPage: false })
  }
  await page.locator('button[aria-label="No sentí dolor"]').click()
  await expect(pain).toBeHidden({ timeout: 10000 })
}

/** Estado de la sesión sembrada tal como está en IndexedDB. */
const sessionStatus = (page: Page) =>
  page.evaluate(async () => {
    const idb = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('trainPWA')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const row = await new Promise<Record<string, unknown> | undefined>((res, rej) => {
      const rq = idb.transaction('trainingSessions', 'readonly').objectStore('trainingSessions').get('qa-s1')
      rq.onsuccess = () => res(rq.result as Record<string, unknown> | undefined)
      rq.onerror = () => rej(rq.error)
    })
    idb.close()
    return (row?.sessionStatus as string) ?? null
  })

/** Abre el selector de rutinas y pulsa «Nueva rutina» (dentro del desplegable). */
async function clickNuevaRutina(page: Page) {
  const toggle = page.locator('button[aria-expanded]').first()
  if (!(await page.getByRole('button', { name: /Nueva rutina/ }).first().isVisible().catch(() => false))) {
    await toggle.click()
  }
  await page.getByRole('button', { name: /Nueva rutina/ }).first().click()
}

/**
 * Captura limpia: espera a que el splash móvil (overlay por documento) termine
 * y deja el scroll arriba; si no, la sale tapada por el logo.
 */
async function shot(page: Page, name: string) {
  await page.locator('[data-testid="mobile-splash"]').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false })
}

for (const size of WIDTHS) {
  test.describe(`${size.w}x${size.h}`, () => {
    test.use({ viewport: { width: size.w, height: size.h } })

    test('Entrenar esencial, dolor por ejercicio y finalización a Inicio', async ({ page }) => {
      test.setTimeout(240_000)
      await seedBase(page, { session: true })
      await page.goto('/entrenar')

      // ── Esenciales visibles; secundarios solo tras «⋯ Más opciones» ──
      const confirm1 = page.locator('button[aria-label="Confirmar serie 1"]').first()
      await expect(confirm1).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText(/EJERCICIO 1 DE 2/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Saltar', exact: true }).first()).toBeVisible()
      await expect(page.getByText(/EJERCICIO 2 DE 2/)).toHaveCount(0)
      await expectNoOverflow(page)

      const more = page.locator('button[aria-label="Más opciones de la sesión"]')
      await expect(more).toHaveAttribute('aria-expanded', 'false')
      // El secundario «Agregar ejercicio» está plegado.
      await expect(page.getByRole('button', { name: 'Agregar ejercicio', exact: true })).toHaveCount(0)
      await more.click()
      await expect(more).toHaveAttribute('aria-expanded', 'true')
      await expect(page.getByRole('button', { name: 'Agregar ejercicio', exact: true }).first()).toBeVisible()
      await expectNoOverflow(page)
      await more.click()
      await expect(more).toHaveAttribute('aria-expanded', 'false')

      if (size.w === 390) {
        await shot(page, 'entrenar-esencial-390')
      }

      // ── Serie del ejercicio 1 + consulta de dolor (una sola vez) ──
      await confirmSet(page, 1)
      // Al terminar el ejercicio aparece la consulta de dolor (una sola vez).
      await confirmSet(page, 2, size.w === 390 ? 'entrenar-dolor-390' : undefined)
      // Tras responder, la app avanza sola al ejercicio 2.
      await expect(page.getByText(/EJERCICIO 2 DE 2/)).toBeVisible({ timeout: 20_000 })
      // En el ejercicio 2 la consulta vuelve a salir (es por ejercicio) y
      // confirmSet la responde automáticamente.
      await confirmSet(page, 1)
      await confirmSet(page, 2)

      // ── Finalizar → confirmación → Inicio por router (sin recarga) ──
      const navBefore = await page.evaluate(() => performance.getEntriesByType('navigation').length)
      const finish = page.locator('button[aria-label="Finalizar entrenamiento"]:visible')
      await expect(finish).toHaveCount(1)
      await finish.first().click()
      const confirmBtn = page.getByRole('button', { name: /Confirmar . COMPLETADO/ })
      await expect(confirmBtn).toBeVisible({ timeout: 20_000 })
      await confirmBtn.click()
      await page.waitForURL((u) => u.pathname === '/', { timeout: 30_000 })
      await expect(page.getByText('¡Hola, Nico!')).toBeVisible({ timeout: 30_000 })
      // La SPA siguió viva: no hubo recarga de documento.
      expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(navBefore)
      // Sesión guardada como COMPLETED.
      await expect.poll(() => sessionStatus(page), { timeout: 15_000 }).toBe('COMPLETED')
      await expectNoOverflow(page)
      if (size.w === 390) {
        await shot(page, 'inicio-post-final-390')
      }
    })
  })
}

test.describe('Rutina — flujos nuevos (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('simplificada, superserie y reordenamiento persisten; badge asistida', async ({ page }) => {
    test.setTimeout(240_000)
    await seedBase(page)
    await page.goto('/rutina')

    // ── Crear en modo «Rutina simplificada» ──
    await clickNuevaRutina(page)
    const modeGroup = page.locator('[role="group"][aria-label="Modalidad de rutina"]')
    await expect(modeGroup).toBeVisible()
    await modeGroup.getByRole('button', { name: 'Rutina simplificada' }).click()
    await page.getByPlaceholder(/Rutina de verano/).fill('Rutina E2E')
    await page.getByRole('button', { name: 'Crear rutina' }).click()

    const dialog = page.locator('[role="dialog"][aria-label="Rutina simplificada"]')
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    await expectNoOverflow(page)

    const addExercise = async (name: string) => {
      await dialog.getByPlaceholder(/Press plano con mancuernas/).fill(name)
      await dialog.locator('select[aria-label="Músculo principal"]').selectOption('pectorales')
      await dialog.getByRole('button', { name: 'Agregar ejercicio' }).click()
      // El alta persiste la rutina antes de re-habilitar el botón.
      await expect(dialog.getByRole('button', { name: 'Agregar ejercicio' })).toBeEnabled({ timeout: 20_000 })
    }
    await addExercise('Press E2E A')
    await addExercise('Press E2E B')
    await shot(page, 'rutina-simplificada-390')
    await dialog.getByRole('button', { name: 'Cerrar formulario' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByText('Press E2E A')).toBeVisible()
    await expect(page.getByText('Press E2E B')).toBeVisible()

    // ── Reordenar con botones (≥44px) y persistir tras recarga ──
    const downA = page.locator('button[aria-label="Bajar Press E2E A"]')
    await expect(downA).toBeVisible()
    const box = await downA.boundingBox()
    expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44)
    await downA.click()
    const rows = page.locator('[data-exrow][data-day="1"] .font-medium')
    await expect(rows.first()).toHaveText('Press E2E B')
    await page.reload()
    await expect(page.getByText('Press E2E B')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-exrow][data-day="1"] .font-medium').first()).toHaveText('Press E2E B')
    await expect(page.getByText('Rutina activa')).toBeVisible()
    await shot(page, 'rutina-reordenamiento-390')

    // ── Superserie: seleccionar ambos, crear bloque, badges ──
    await page.locator('button[aria-label="Superserie Press E2E B"]').click()
    await page.locator('button[aria-label="Superserie Press E2E A"]').click()
    await expect(page.getByText(/Superserie: 2 seleccionados/)).toBeVisible()
    await expectNoOverflow(page)
    await shot(page, 'rutina-superserie-390')
    await page.getByRole('button', { name: 'Crear bloque' }).click()
    await expect(page.getByText('SS 1/2')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('SS 2/2')).toBeVisible()
    // Persiste tras recarga.
    await page.reload()
    await expect(page.getByText('SS 1/2')).toBeVisible({ timeout: 30_000 })

    // ── Modalidad asistida: el selector de Biblioteca queda identificado ──
    await clickNuevaRutina(page)
    await page.locator('[role="group"][aria-label="Modalidad de rutina"]')
      .getByRole('button', { name: 'Rutina asistida' }).click()
    await page.getByPlaceholder(/Rutina de verano/).fill('Rutina Asistida E2E')
    await page.getByRole('button', { name: 'Crear rutina' }).click()
    // Cierra el form simplificado si quedó abierto de la rutina anterior.
    const leftover = page.locator('[role="dialog"][aria-label="Rutina simplificada"]')
    if (await leftover.isVisible().catch(() => false)) {
      await leftover.getByRole('button', { name: 'Cerrar formulario' }).click()
    }
    const pickerBtn = page.getByRole('button', { name: 'Ejercicio', exact: true }).first()
    await expect(pickerBtn).toBeVisible({ timeout: 20_000 })
    await pickerBtn.click()
    await expect(page.getByText('Rutina asistida').last()).toBeVisible({ timeout: 20_000 })
    await expectNoOverflow(page)
    await shot(page, 'rutina-asistida-390')
  })
})
