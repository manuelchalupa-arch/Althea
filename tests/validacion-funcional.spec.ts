import { test, expect, type Page, type Locator } from '@playwright/test'
import { seedBase } from './helpers/seed'

/**
 * Validación funcional A–F (390×844) contra el flujo real, con datos en
 * IndexedDB: A) Entrenar esencial + «R» + descanso ±15s + Saltar; B) consulta
 * de dolor una sola vez por ejercicio con zona obligatoria; C) finalización con
 * fallo inyectado recuperable, anti-doble y retorno a Inicio sin reload; D)
 * rutinas simplificada/asistida editadas sin recargar; E) superseries de 2 y 4
 * ejercicios con alternancia y descansos diferenciados; F) reordenamiento
 * táctil (drag + botones ≥44px) persistente con integridad de bloques.
 *
 *   npx playwright test tests/validacion-funcional.spec.ts --project=chromium --workers=2 --reporter=line
 */

const SHOTS = 'shots'

/* ───────────────────────── Helpers ───────────────────────── */

/** Captura limpia: espera al splash y deja el scroll arriba. */
async function shot(page: Page, name: string) {
  await page.locator('[data-testid="mobile-splash"]').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false })
}

/** Recarga y espera a que la app deje de tapar la pantalla (splash). */
async function reloadClean(page: Page) {
  await page.reload()
  await page.locator('[data-testid="mobile-splash"]').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
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
async function confirmSet(page: Page, n: number) {
  await page.locator(`button[aria-label="Confirmar serie ${n}"]`).first().click()
  await closeRestIfAny(page)
  const pain = page.locator('[data-testid="pain-prompt"]')
  try {
    await pain.waitFor({ state: 'visible', timeout: 6000 })
  } catch {
    return
  }
  await page.locator('button[aria-label="No sentí dolor"]').click()
  await expect(pain).toBeHidden({ timeout: 10000 })
}

/** Confirma la serie n, verifica el TIPO de descanso y lo cierra. */
async function confirmRestKind(page: Page, n: number, kind: 'Descanso superserie' | 'Descanso de bloque') {
  await page.locator(`button[aria-label="Confirmar serie ${n}"]`).first().click()
  await expect(page.getByText(kind, { exact: true })).toBeVisible({ timeout: 20000 })
  await closeRestIfAny(page)
}

/** Lee una tabla entera de IndexedDB (trainPWA). */
async function readStore(page: Page, store: string): Promise<any[]> {
  return page.evaluate(async (store) => {
    const idb = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('trainPWA')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const rows = await new Promise<any[]>((res, rej) => {
      const rq = idb.transaction(store, 'readonly').objectStore(store).getAll()
      rq.onsuccess = () => res(rq.result as any[])
      rq.onerror = () => rej(rq.error)
    })
    idb.close()
    return rows
  }, store)
}

const painCount = async (page: Page) => (await readStore(page, 'painLogs')).length

/** Estado de la sesión sembrada (qa-s1) o de la única sesión existente. */
async function sessionStatus(page: Page) {
  const rows = await readStore(page, 'trainingSessions')
  const row = rows.find((r) => r.id === 'qa-s1') ?? rows[0]
  return (row?.sessionStatus as string) ?? null
}

/** Abre el selector de rutinas y pulsa «Nueva rutina». */
async function clickNuevaRutina(page: Page) {
  const toggle = page.locator('button[aria-expanded]').first()
  if (!(await page.getByRole('button', { name: /Nueva rutina/ }).first().isVisible().catch(() => false))) {
    await toggle.click()
  }
  await page.getByRole('button', { name: /Nueva rutina/ }).first().click()
}

/** Crea una rutina en modalidad «simplificada» y devuelve su formulario. */
async function createSimplified(page: Page, name: string): Promise<Locator> {
  await clickNuevaRutina(page)
  const modeGroup = page.locator('[role="group"][aria-label="Modalidad de rutina"]')
  await expect(modeGroup).toBeVisible()
  await modeGroup.getByRole('button', { name: 'Rutina simplificada' }).click()
  await page.getByPlaceholder(/Rutina de verano/).fill(name)
  await page.getByRole('button', { name: 'Crear rutina' }).click()
  const dialog = page.locator('[role="dialog"][aria-label="Rutina simplificada"]')
  await expect(dialog).toBeVisible({ timeout: 20000 })
  return dialog
}

/** Alta de ejercicio desde el formulario simplificado (nombre + datos + músculo). */
async function addSimplified(page: Page, dialog: Locator, opts: { name: string; sets?: number; reps?: number; weight?: number; rest?: number }) {
  await dialog.getByPlaceholder(/Press plano con mancuernas/).fill(opts.name)
  const nums = dialog.locator('input[type="number"]')
  if (opts.sets !== undefined) { await nums.nth(0).fill(String(opts.sets)) }
  if (opts.reps !== undefined) { await nums.nth(1).fill(String(opts.reps)) }
  if (opts.weight !== undefined) { await nums.nth(2).fill(String(opts.weight)) }
  if (opts.rest !== undefined) { await nums.nth(3).fill(String(opts.rest)) }
  await dialog.locator('select[aria-label="Músculo principal"]').selectOption('pectorales')
  await dialog.getByRole('button', { name: 'Agregar ejercicio' }).click()
  await expect(dialog.getByRole('button', { name: 'Agregar ejercicio' })).toBeEnabled({ timeout: 20000 })
}

/**
 * Fuerza el día planificado a N°1 (funciona también si hoy es descanso) y
 * arranca la sesión desde el CTA de Inicio.
 */
async function startDay1Session(page: Page) {
  await page.goto('/')
  await page.locator('[data-testid="mobile-splash"]').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
  await page.getByTestId('inicio-change-day-hero').click()
  await page.getByRole('button', { name: /DÍA N\.º 1/ }).click()
  const cta = page.getByTestId('inicio-hero-cta')
  await expect(cta).toBeVisible({ timeout: 20000 })
  await cta.click()
  await page.waitForURL((u) => u.pathname === '/entrenar', { timeout: 30000 })
}

/** Arrastra la fila `fromIdx` del día 1 hasta la posición `toIdx` (grip + puntero). */
async function dragRowTo(page: Page, fromIdx: number, toIdx: number) {
  const rows = page.locator('[data-exrow][data-day="1"]')
  // El punto de la caja tiene que caer SIEMPRE dentro de la fila: una fila al
  // borde del viewport queda bajo la barra de navegación fija y el hit-test
  // (elementFromPoint) no la encuentra. Centrarla resuelve ambos extremos.
  const center = (l: Locator) => l.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const grip = rows.nth(fromIdx).locator('button[aria-label^="Reordenar"]')
  await center(rows.nth(fromIdx))
  const g = (await grip.boundingBox())!
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  const step = toIdx > fromIdx ? 1 : -1
  for (let i = fromIdx + step; ; i += step) {
    const row = rows.nth(i)
    await center(row)
    const box = (await row.boundingBox())!
    // X alternada: tras el scroll el cursor ya queda sobre la fila destino y un
    // mouse.move al mismo punto NO genera eventos (se deduplican) → el cruce
    // nunca registraría. Con X distintas siempre hay movimiento real.
    const fx = i % 2 === 0 ? 0.65 : 0.35
    await page.mouse.move(box.x + box.width * fx, box.y + box.height / 2, { steps: 4 })
    await page.waitForTimeout(150)
    if (i === toIdx) { break }
  }
  await page.mouse.up()
  await page.waitForTimeout(500)
}

/** Nombres visibles de las filas del día 1, en orden. */
async function dayOrder(page: Page): Promise<string[]> {
  const rows = page.locator('[data-exrow][data-day="1"]')
  const n = await rows.count()
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.push(((await rows.nth(i).locator('.font-medium').first().textContent()) ?? '').trim())
  }
  return out
}

const rowName = (page: Page, i: number) =>
  page.locator('[data-exrow][data-day="1"]').nth(i).locator('.font-medium').first()

/* ───────────────────────── Tests ───────────────────────── */

test.describe('Validación funcional A–F (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('A — Entrenar esencial: esenciales, modo R, descanso ±15s, progreso y Saltar', async ({ page }) => {
    test.setTimeout(300_000)
    await seedBase(page, { session: true })
    await page.goto('/entrenar')

    // ── Esenciales visibles; secundarios solo tras «⋯ Más opciones» ──
    await expect(page.getByText(/EJERCICIO 1 DE 2/)).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('heading', { name: 'Press banca' }).first()).toBeVisible()
    await expect(page.getByText('Serie 0/2', { exact: true })).toBeVisible()
    const confirm1 = page.locator('button[aria-label="Confirmar serie 1"]')
    await expect(confirm1).toBeVisible()
    await expect(confirm1).toContainText('Registrar')
    await expect(page.getByRole('button', { name: 'Saltar', exact: true }).first()).toBeVisible()
    const rBox = page.locator('input[aria-label="modo R serie 1"]')
    await expect(rBox).toBeVisible()
    const more = page.locator('button[aria-label="Más opciones de la sesión"]')
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('button', { name: 'Agregar ejercicio', exact: true })).toHaveCount(0)
    await more.click()
    await expect(more).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('button', { name: 'Agregar ejercicio', exact: true }).first()).toBeVisible()
    await more.click()
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(over, 'desborde horizontal').toBeLessThanOrEqual(1)
    await shot(page, 'vf-esencial')

    // ── Barra inferior: Progreso 0/2 + FINALIZAR ──
    const bar = page.locator('div.fixed').filter({ hasText: 'FINALIZAR' })
    await expect(bar).toHaveCount(1)
    await expect(bar.getByText('Progreso', { exact: true })).toBeVisible()
    await expect(bar.getByText('0% — 0/2', { exact: true })).toBeVisible()

    // ── Modo R (marca «R» en el input) + datos de la serie ──
    await rBox.check()
    await expect(rBox).toBeChecked()
    await expect(page.locator('input[aria-label="repeticiones serie 1"]')).toHaveClass(/pl-5/)
    await page.locator('input[aria-label="repeticiones serie 1"]').fill('6')
    await page.locator('input[aria-label="kilogramos serie 1"]').fill('75')

    // ── Registrar → descanso con ajuste ±15s ──
    await confirm1.click()
    const overlay = page.locator('[role="dialog"][aria-label="Descanso entre series"]')
    await expect(overlay).toBeVisible({ timeout: 20000 })
    const timer = overlay.locator('[role="timer"]')
    const parse = (t: string | null) => {
      const [m, s] = (t ?? '').trim().split(':').map(Number)
      return m * 60 + s
    }
    const t0 = parse(await timer.textContent())
    await overlay.getByRole('button', { name: 'Agregar 15 segundos' }).click()
    const t1 = parse(await timer.textContent())
    expect(t1 - t0, 'ajuste +15s').toBeGreaterThanOrEqual(12)
    expect(t1 - t0, 'ajuste +15s').toBeLessThanOrEqual(16)
    await expect(overlay.getByRole('button', { name: 'Restar 15 segundos' })).toBeVisible()
    await shot(page, 'vf-descanso')
    await closeRestIfAny(page)
    await expect(overlay).toBeHidden()

    // ── Nunca consulta de dolor entre series; la serie queda registrada ──
    await expect(page.locator('[data-testid="pain-prompt"]')).toHaveCount(0)
    await expect
      .poll(
        async () =>
          (await readStore(page, 'setRecords')).filter(
            (r) => r.sessionExerciseId === 'qa-se1' && r.actualWeight === 75 && r.status === 'COMPLETED',
          ).length,
        { timeout: 20000 },
      )
      .toBe(1)
    const rec = (await readStore(page, 'setRecords')).find((r) => r.sessionExerciseId === 'qa-se1' && r.actualWeight === 75)!
    expect(rec.actualReps).toBe(6)
    expect(rec.modeR).toBe(true)
    await expect(page.getByText('Serie 1/2', { exact: true })).toBeVisible()
    await expect(bar.getByText('0% — 0/2', { exact: true })).toBeVisible()

    // ── Serie 2 → consulta al terminar el ejercicio → avance al siguiente ──
    await confirmSet(page, 2)
    await closeRestIfAny(page)
    await expect(page.getByText(/EJERCICIO 2 DE 2/)).toBeVisible({ timeout: 20000 })
    await expect(bar.getByText('50% — 1/2', { exact: true })).toBeVisible()

    // ── Saltar con motivo → ejercicio omitido ──
    await page.getByRole('button', { name: 'Saltar', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: 'Saltar Remo con barra' })).toBeVisible({ timeout: 15000 })
    await shot(page, 'vf-saltar')
    await page.getByRole('button', { name: 'Confirmar salto' }).click()
    await expect
      .poll(
        async () => {
          const rows = await readStore(page, 'sessionExercises')
          return rows.find((r) => r.sessionExerciseId === 'qa-se2')?.status
        },
        { timeout: 20000 },
      )
      .toBe('SKIPPED')
    await expect(bar.getByText('100% — 2/2', { exact: true })).toBeVisible()
  })

  test('B — Dolor: una vez por ejercicio, zona obligatoria y sin registro sin respuesta', async ({ page }) => {
    test.setTimeout(300_000)
    await seedBase(page, { session: true })
    await page.goto('/entrenar')
    const pain = page.locator('[data-testid="pain-prompt"]')

    // ── Entre series NUNCA pregunta ──
    await page.locator('button[aria-label="Confirmar serie 1"]').click()
    await expect(pain).toHaveCount(0)
    await closeRestIfAny(page)

    // ── Al terminar el ejercicio: consulta única, aún sin registro ──
    await page.locator('button[aria-label="Confirmar serie 2"]').click()
    await expect(pain).toBeVisible({ timeout: 20000 })
    await expect(pain).toContainText('Terminaste Press banca')
    expect(await painCount(page), 'sin respuesta → sin registro').toBe(0)
    await shot(page, 'vf-dolor-si')

    // ── Sí → zona obligatoria (Guardar y seguir deshabilitado hasta elegir) ──
    await pain.getByRole('button', { name: 'Sí sentí dolor' }).click()
    const guardar = page.getByRole('button', { name: /Guardar y seguir/ })
    await expect(guardar).toBeDisabled()
    await pain.locator('select[aria-label="Zona con dolor"]').selectOption({ index: 1 })
    await expect(guardar).toBeEnabled()
    await guardar.click()
    await expect(pain).toHaveCount(0, { timeout: 15000 })
    await expect.poll(async () => painCount(page), { timeout: 15000 }).toBe(1)
    const log = (await readStore(page, 'painLogs'))[0]
    expect(log.exerciseId).toBe('press')
    expect(log.zone).toBeTruthy()
    await closeRestIfAny(page)
    await expect(page.getByText(/EJERCICIO 2 DE 2/)).toBeVisible({ timeout: 20000 })

    // ── Recarga: NO vuelve a preguntar por el ejercicio 1 ──
    await reloadClean(page)
    await closeRestIfAny(page)
    await expect(page.getByText(/EJERCICIO 2 DE 2/)).toBeVisible({ timeout: 30000 })
    await expect(pain).toHaveCount(0)
    expect(await painCount(page)).toBe(1)

    // ── Ejercicio 2: serie 1 sin consulta; serie 2 consulta → «No» no escribe ──
    await page.locator('button[aria-label="Confirmar serie 1"]').click()
    await expect(pain).toHaveCount(0)
    await closeRestIfAny(page)
    await page.locator('button[aria-label="Confirmar serie 2"]').click()
    await expect(pain).toBeVisible({ timeout: 20000 })
    await expect(pain).toContainText('Terminaste Remo con barra')
    expect(await painCount(page), 'aún sin respuesta: nada nuevo').toBe(1)
    await shot(page, 'vf-dolor-no')
    await page.locator('button[aria-label="No sentí dolor"]').click()
    await expect(pain).toHaveCount(0, { timeout: 15000 })
    expect(await painCount(page), 'No no escribe registro').toBe(1)
  })

  test('C — Finalización: fallo inyectado recuperable, anti-doble y retorno a Inicio sin reload', async ({ page }) => {
    test.setTimeout(300_000)
    await seedBase(page, { session: true })
    // Inyección de fallo: cualquier transacción readwrite falla mientras
    // __failWrites esté activo (se cuenta cada intento).
    await page.addInitScript(() => {
      const w = window as any
      w.__failWrites = false
      w.__writeAttempts = 0
      const orig = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: any[]) {
        if (args[1] !== 'readonly') {
          w.__writeAttempts += 1
          if (w.__failWrites) { throw new Error('Fallo inyectado de red (prueba)') }
        }
        return orig.apply(this, args as any)
      } as any
    })
    await page.goto('/entrenar')

    // ── Sesión completa: 2 ejercicios × 2 series ──
    await confirmSet(page, 1)
    await confirmSet(page, 2)
    await closeRestIfAny(page)
    await expect(page.getByText(/EJERCICIO 2 DE 2/)).toBeVisible({ timeout: 20000 })
    await confirmSet(page, 1)
    await confirmSet(page, 2)
    await closeRestIfAny(page)
    const bar = page.locator('div.fixed').filter({ hasText: 'FINALIZAR' })
    await expect(bar.getByText('100% — 2/2', { exact: true })).toBeVisible()

    // ── Fallo al guardar: error visible, sesión recuperable, modal abierto ──
    const finish = page.locator('button[aria-label="Finalizar entrenamiento"]:visible')
    await expect(finish).toHaveCount(1)
    await finish.first().click()
    const confirmBtn = page.getByRole('button', { name: /Confirmar — COMPLETADO/ })
    await expect(confirmBtn).toBeVisible({ timeout: 20000 })
    await page.evaluate(() => {
      const w = window as any
      w.__failWrites = true
      w.__writeAttempts = 0
    })
    await confirmBtn.click()
    const err = page.locator('div.althea-modal p.text-error')
    await expect(err).toBeVisible({ timeout: 20000 })
    const errText = ((await err.textContent()) ?? '').trim()
    expect(errText.length, 'error visible').toBeGreaterThan(0)
    const attempts = await page.evaluate(() => (window as any).__writeAttempts)
    expect(attempts, 'intentó escribir y falló').toBeGreaterThanOrEqual(1)
    expect(await sessionStatus(page), 'sesión no completada').not.toBe('COMPLETED')
    await expect(confirmBtn).toBeEnabled({ timeout: 10000 })
    await shot(page, 'vf-fallo-finalizar')

    // ── Recuperación: reintento con doble clic → guarda UNA vez ──
    await page.evaluate(() => {
      const w = window as any
      w.__failWrites = false
      w.__writeAttempts = 0
    })
    const navBefore = await page.evaluate(() => performance.getEntriesByType('navigation').length)
    await confirmBtn.dblclick()
    await page.waitForURL((u) => u.pathname === '/', { timeout: 30000 })
    // SPA viva: no hubo recarga de documento.
    expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(navBefore)
    await expect(page.getByTestId('inicio-day-done')).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('inicio-hero-cta')).toHaveCount(0)
    await expect.poll(() => sessionStatus(page), { timeout: 15000 }).toBe('COMPLETED')
    const events = (await readStore(page, 'sessionEvents')).filter((e) => e.type === 'SESSION_COMPLETED')
    expect(events.length, 'una sola finalización').toBe(1)
    const doneSets = (await readStore(page, 'setRecords')).filter((r) => r.status === 'COMPLETED')
    expect(doneSets.length).toBe(4)
    expect((await readStore(page, 'trainingSessions')).length, 'sin sesión extra').toBe(1)
    await shot(page, 'vf-inicio-completado')

    // ── /entrenar sin sesión activa vuelve a Inicio y no ofrece sesión ──
    await page.goto('/entrenar')
    await page.waitForURL((u) => u.pathname === '/', { timeout: 30000 })
    await expect(page.getByTestId('inicio-day-done')).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('inicio-hero-cta')).toHaveCount(0)
    await shot(page, 'vf-entrenar-redirect')
  })

  test('D — Rutinas: simplificada editada, asistida con badge, sembrada intacta', async ({ page }) => {
    test.setTimeout(300_000)
    await seedBase(page)
    await page.goto('/rutina')

    // La sección «Configuración de la rutina» nace plegada (DOM con display:none).
    const expandConfig = async () => {
      const t = page.getByRole('button', { name: /Configuración de la rutina/ })
      if ((await t.getAttribute('aria-expanded')) === 'false') { await t.click() }
    }

    // ── Crear en modo «Rutina simplificada» (nombre libre) ──
    const dialog = await createSimplified(page, 'Rutina Edit E2E')

    // ── Músculo principal obligatorio ──
    await dialog.getByPlaceholder(/Press plano con mancuernas/).fill('Edit Ex A')
    await dialog.getByRole('button', { name: 'Agregar ejercicio' }).click()
    await expect(dialog.getByText('Elegí el músculo principal')).toBeVisible()
    await dialog.locator('select[aria-label="Músculo principal"]').selectOption('pectorales')
    await dialog.getByRole('button', { name: 'Agregar ejercicio' }).click()
    await expect(dialog.getByRole('button', { name: 'Agregar ejercicio' })).toBeEnabled({ timeout: 20000 })

    // ── Catálogo en español sin duplicados ──
    const catalog = await readStore(page, 'exercises')
    expect(catalog.length).toBeGreaterThanOrEqual(50)
    const catNames = catalog.map((e) => e.name)
    expect(new Set(catNames).size, 'catálogo sin nombres duplicados').toBe(catNames.length)
    const muscleOpts = await dialog.locator('select[aria-label="Músculo principal"] option').allTextContents()
    expect(new Set(muscleOpts).size).toBe(muscleOpts.length)
    await dialog.getByRole('button', { name: 'Cerrar formulario' }).click()
    await expect(dialog).toBeHidden()

    // ── Alta por «Manual» (día 1) sin recargar ──
    await page.getByRole('button', { name: 'Manual', exact: true }).first().click()
    await expect(dialog).toBeVisible({ timeout: 15000 })
    await addSimplified(page, dialog, { name: 'Edit Ex B' })
    await dialog.getByRole('button', { name: 'Cerrar formulario' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Edit Ex A', { exact: true })).toBeVisible()
    await expect(page.getByText('Edit Ex B', { exact: true })).toBeVisible()
    await shot(page, 'vf-rutina-edit')

    // ── Editar peso en vivo → persiste en IndexedDB sin recargar ──
    await page.getByRole('button', { name: 'Editar Edit Ex A' }).click()
    await expect(page.locator('input[aria-label="Peso"]')).toBeVisible({ timeout: 15000 })
    await page.locator('input[aria-label="Peso"]').fill('55')
    await expect
      .poll(
        async () => {
          const r = (await readStore(page, 'routineStore')).find((x) => x.name === 'Rutina Edit E2E')
          return r?.dayExercises?.[1]?.find((i: any) => i.name === 'Edit Ex A')?.weight
        },
        { timeout: 20000 },
      )
      .toBe(55)
    await page.getByRole('button', { name: 'Guardar y cerrar' }).click()
    await expect(page.getByRole('button', { name: 'Editar Edit Ex A' })).toBeVisible()

    // ── Renombrar la rutina en vivo ──
    await expandConfig()
    await page.locator('input[aria-label="Nombre de la rutina"]').fill('Rutina Edit E2E 2')
    await expect
      .poll(async () => (await readStore(page, 'routineStore')).some((x) => x.name === 'Rutina Edit E2E 2'), { timeout: 20000 })
      .toBe(true)

    // ── Recarga: reabrir la edición y ver el peso 55 ──
    await reloadClean(page)
    await expandConfig()
    await expect(page.locator('input[aria-label="Nombre de la rutina"]')).toHaveValue('Rutina Edit E2E 2', { timeout: 30000 })
    await expect(page.getByText('Edit Ex A', { exact: true })).toBeVisible()
    await expect(page.getByText('Edit Ex B', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Editar Edit Ex A' }).click()
    await expect(page.locator('input[aria-label="Peso"]')).toHaveValue('55')
    await page.locator('button[aria-label="Cerrar"]').click()
    await expect(page.getByRole('button', { name: 'Editar Edit Ex A' })).toBeVisible()

    // ── Modalidad asistida: badge en el selector de Biblioteca ──
    await clickNuevaRutina(page)
    await page
      .locator('[role="group"][aria-label="Modalidad de rutina"]')
      .getByRole('button', { name: 'Rutina asistida' })
      .click()
    await page.getByPlaceholder(/Rutina de verano/).fill('Rutina Asist E2E')
    await page.getByRole('button', { name: 'Crear rutina' }).click()
    const leftover = page.locator('[role="dialog"][aria-label="Rutina simplificada"]')
    if (await leftover.isVisible().catch(() => false)) {
      await leftover.getByRole('button', { name: 'Cerrar formulario' }).click()
    }
    const pickerBtn = page.getByRole('button', { name: 'Ejercicio', exact: true }).first()
    await expect(pickerBtn).toBeVisible({ timeout: 20000 })
    await pickerBtn.click()
    await expect(page.getByText('Rutina asistida').last()).toBeVisible({ timeout: 20000 })
    await shot(page, 'vf-rutina-asistida')

    // ── Recarga: sigue activa la asistida ──
    await reloadClean(page)
    await expandConfig()
    await expect(page.locator('input[aria-label="Nombre de la rutina"]')).toHaveValue('Rutina Asist E2E', { timeout: 30000 })

    // ── Reutilizar la simplificada sin recargar ──
    const toggle = page.locator('button[aria-expanded]').first()
    if ((await toggle.getAttribute('aria-expanded')) === 'false') { await toggle.click() }
    await page.getByText('Rutina Edit E2E 2', { exact: true }).click()
    await expandConfig()
    await expect(page.locator('input[aria-label="Nombre de la rutina"]')).toHaveValue('Rutina Edit E2E 2', { timeout: 30000 })
    await expect(page.getByText('Edit Ex A', { exact: true })).toBeVisible()

    // ── La rutina sembrada queda intacta ──
    const qa = (await readStore(page, 'routineStore')).find((r) => r.id === 'qa-routine')
    expect(qa?.name).toBe('QA Rutina')
    expect(qa?.dayExercises?.[1]?.length).toBe(1)
    expect(qa?.dayExercises?.[1]?.[0]?.exId).toBe('press')

    // ── Perfil ──
    await page.goto('/')
    await page.locator('[data-testid="mobile-splash"]').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
    await expect(page.getByText('¡Hola, Nico!')).toBeVisible({ timeout: 30000 })
    await shot(page, 'vf-inicio-nico')
  })

  test('E — Superserie de 2: alternancia A→B, descansos diferenciados y dolor al cerrar', async ({ page }) => {
    test.setTimeout(300_000)
    await seedBase(page)
    await page.goto('/rutina')

    const dialog = await createSimplified(page, 'SS2 E2E')
    await addSimplified(page, dialog, { name: 'SS2 Ej A', sets: 2, reps: 8, weight: 60, rest: 15 })
    await addSimplified(page, dialog, { name: 'SS2 Ej B', sets: 2, reps: 8, weight: 60, rest: 15 })
    await dialog.getByRole('button', { name: 'Cerrar formulario' }).click()
    await expect(dialog).toBeHidden()

    // ── Bloque de2 ejercicios ──
    await page.locator('button[aria-label="Superserie SS2 Ej A"]').click()
    await page.locator('button[aria-label="Superserie SS2 Ej B"]').click()
    await expect(page.getByText(/Superserie: 2 seleccionados/)).toBeVisible()
    await page.getByRole('button', { name: 'Crear bloque' }).click()
    await expect(page.getByText('SS 1/2')).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('SS 2/2')).toBeVisible()
    await shot(page, 'vf-ss2-rutina')

    // ── Persiste tras recarga: supersetId + orden en IndexedDB ──
    await reloadClean(page)
    await expect(page.getByText('SS 1/2')).toBeVisible({ timeout: 30000 })
    await expect
      .poll(
        async () => {
          const r = (await readStore(page, 'routineStore')).find((x) => x.name === 'SS2 E2E')
          const items = r?.dayExercises?.[1] ?? []
          return (
            items.length === 2 &&
            !!items[0].supersetId &&
            items[0].supersetId === items[1].supersetId &&
            items[0].supersetOrder === 0 &&
            items[1].supersetOrder === 1
          )
        },
        { timeout: 20000 },
      )
      .toBe(true)

    // ── Arrancar la sesión (día N°1 forzado) ──
    await startDay1Session(page)
    await expect(page.getByText(/EJERCICIO 1 DE 2/)).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('heading', { name: 'SS2 Ej A' }).first()).toBeVisible()

    // ── Ronda 1: A1 → ss → B1 → block (fin de ronda) ──
    // La alternancia del bloque es por SERIE: cada «Registrar» salta al
    // siguiente ejercicio con series pendientes dentro del bloque.
    await confirmRestKind(page, 1, 'Descanso superserie')
    await expect(page.getByText(/EJERCICIO 2 DE 2/)).toBeVisible({ timeout: 20000 })
    await confirmRestKind(page, 1, 'Descanso de bloque')
    await expect(page.getByText(/EJERCICIO 1 DE 2/)).toBeVisible({ timeout: 20000 })

    // ── Ronda 2: A2 → ss → B2 cierra el bloque (sin descanso) → cola de dolor ──
    await confirmRestKind(page, 2, 'Descanso superserie')
    await expect(page.getByText(/EJERCICIO 2 DE 2/)).toBeVisible({ timeout: 20000 })
    await page.locator('button[aria-label="Confirmar serie 2"]').first().click()
    const pain = page.locator('[data-testid="pain-prompt"]')
    await expect(pain).toBeVisible({ timeout: 20000 })
    await expect(pain).toContainText('Terminaste SS2 Ej A')
    expect(await painCount(page), 'sin respuesta → sin registro').toBe(0)
    await shot(page, 'vf-ss2-dolor')

    // ── Sí + zona obligatoria ──
    await pain.getByRole('button', { name: 'Sí sentí dolor' }).click()
    const guardar = page.getByRole('button', { name: /Guardar y seguir/ })
    await expect(guardar).toBeDisabled()
    await pain.locator('select[aria-label="Zona con dolor"]').selectOption({ index: 1 })
    await expect(guardar).toBeEnabled()
    await guardar.click()
    await expect(pain).toContainText('Terminaste SS2 Ej B', { timeout: 20000 })
    await page.locator('button[aria-label="No sentí dolor"]').click()
    await expect(pain).toHaveCount(0, { timeout: 15000 })

    // ── Verificación en IndexedDB ──
    await expect.poll(async () => painCount(page), { timeout: 15000 }).toBe(1)
    const rows = await readStore(page, 'trainingSessions')
    const sess = rows.find((r) => r.routineName === 'SS2 E2E')!
    expect(sess.sessionStatus).toBe('IN_PROGRESS')
    const sex = (await readStore(page, 'sessionExercises')).filter((x) => x.sessionId === sess.sessionId).sort((a, b) => a.order - b.order)
    expect(sex.length).toBe(2)
    expect(sex[0].supersetId).toBeTruthy()
    expect(sex[0].supersetId).toBe(sex[1].supersetId)
    expect(sex.map((x) => x.supersetOrder)).toEqual([0, 1])
    const doneSets = (await readStore(page, 'setRecords')).filter((r) => r.sessionId === sess.sessionId && r.status === 'COMPLETED')
    expect(doneSets.length).toBe(4)
    const painLog = (await readStore(page, 'painLogs'))[0]
    expect(painLog.exerciseId).toBe(sex[0].exerciseId)
    const bar = page.locator('div.fixed').filter({ hasText: 'FINALIZAR' })
    await expect(bar.getByText('100% — 2/2', { exact: true })).toBeVisible()
    await shot(page, 'vf-ss2-final')

    // ── Recarga: la consulta no vuelve ──
    await reloadClean(page)
    await closeRestIfAny(page)
    await expect(page.locator('[data-testid="pain-prompt"]')).toHaveCount(0, { timeout: 20000 })
    expect(await painCount(page)).toBe(1)
    await shot(page, 'vf-ss2-recarga')
  })

  test('E — Superserie de 4: alternancia A→B→C→D y cola de dolor por ejercicio', async ({ page }) => {
    test.setTimeout(300_000)
    await seedBase(page)
    await page.goto('/rutina')

    const dialog = await createSimplified(page, 'SS4 E2E')
    for (const n of ['SS4 Ej A', 'SS4 Ej B', 'SS4 Ej C', 'SS4 Ej D']) {
      await addSimplified(page, dialog, { name: n, sets: 2, reps: 8, weight: 60, rest: 15 })
    }
    await dialog.getByRole('button', { name: 'Cerrar formulario' }).click()
    await expect(dialog).toBeHidden()

    // ── Bloque de4 ejercicios ──
    for (const n of ['SS4 Ej A', 'SS4 Ej B', 'SS4 Ej C', 'SS4 Ej D']) {
      await page.locator(`button[aria-label="Superserie ${n}"]`).click()
    }
    await expect(page.getByText(/Superserie: 4 seleccionados/)).toBeVisible()
    await page.getByRole('button', { name: 'Crear bloque' }).click()
    await expect(page.getByText('SS 1/4')).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('SS 4/4')).toBeVisible()
    await shot(page, 'vf-ss4-rutina')

    await reloadClean(page)
    await expect(page.getByText('SS 1/4')).toBeVisible({ timeout: 30000 })

    await startDay1Session(page)
    await expect(page.getByText(/EJERCICIO 1 DE 4/)).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('heading', { name: 'SS4 Ej A' }).first()).toBeVisible()

    // ── Ronda 1: A1→B1→C1 con descanso superserie; D1 cierra con descanso de bloque ──
    // La alternancia del bloque es por SERIE (no por ejercicio completo).
    await confirmRestKind(page, 1, 'Descanso superserie')
    await expect(page.getByText(/EJERCICIO 2 DE 4/)).toBeVisible({ timeout: 20000 })
    await confirmRestKind(page, 1, 'Descanso superserie')
    await expect(page.getByText(/EJERCICIO 3 DE 4/)).toBeVisible({ timeout: 20000 })
    await confirmRestKind(page, 1, 'Descanso superserie')
    await expect(page.getByText(/EJERCICIO 4 DE 4/)).toBeVisible({ timeout: 20000 })
    await confirmRestKind(page, 1, 'Descanso de bloque')
    await expect(page.getByText(/EJERCICIO 1 DE 4/)).toBeVisible({ timeout: 20000 })

    // ── Ronda 2: A2→B2→C2→D2 completa el bloque → cola de dolor A→B→C→D ──
    await confirmRestKind(page, 2, 'Descanso superserie')
    await expect(page.getByText(/EJERCICIO 2 DE 4/)).toBeVisible({ timeout: 20000 })
    await confirmRestKind(page, 2, 'Descanso superserie')
    await expect(page.getByText(/EJERCICIO 3 DE 4/)).toBeVisible({ timeout: 20000 })
    await confirmRestKind(page, 2, 'Descanso superserie')
    await expect(page.getByText(/EJERCICIO 4 DE 4/)).toBeVisible({ timeout: 20000 })
    await page.locator('button[aria-label="Confirmar serie 2"]').first().click()
    const pain = page.locator('[data-testid="pain-prompt"]')
    await expect(pain).toBeVisible({ timeout: 20000 })
    await expect(pain).toContainText('Terminaste SS4 Ej A')
    expect(await painCount(page)).toBe(0)
    await shot(page, 'vf-ss4-dolor')

    await pain.getByRole('button', { name: 'Sí sentí dolor' }).click()
    const guardar = page.getByRole('button', { name: /Guardar y seguir/ })
    await expect(guardar).toBeDisabled()
    await pain.locator('select[aria-label="Zona con dolor"]').selectOption({ index: 1 })
    await expect(guardar).toBeEnabled()
    await guardar.click()
    await expect(pain).toContainText('Terminaste SS4 Ej B', { timeout: 20000 })
    await page.locator('button[aria-label="No sentí dolor"]').click()
    await expect(pain).toContainText('Terminaste SS4 Ej C', { timeout: 20000 })
    await page.locator('button[aria-label="No sentí dolor"]').click()
    await expect(pain).toContainText('Terminaste SS4 Ej D', { timeout: 20000 })
    await page.locator('button[aria-label="No sentí dolor"]').click()
    await expect(pain).toHaveCount(0, { timeout: 15000 })

    // ── Verificación en IndexedDB:8 registros,4 ejercicios en bloque,1 dolor ──
    await expect.poll(async () => painCount(page), { timeout: 15000 }).toBe(1)
    const rows = await readStore(page, 'trainingSessions')
    const sess = rows.find((r) => r.routineName === 'SS4 E2E')!
    expect(sess.sessionStatus).toBe('IN_PROGRESS')
    const sex = (await readStore(page, 'sessionExercises')).filter((x) => x.sessionId === sess.sessionId).sort((a, b) => a.order - b.order)
    expect(sex.length).toBe(4)
    expect(sex.every((x) => !!x.supersetId && x.supersetId === sex[0].supersetId)).toBe(true)
    expect(sex.map((x) => x.supersetOrder)).toEqual([0, 1, 2, 3])
    const doneSets = (await readStore(page, 'setRecords')).filter((r) => r.sessionId === sess.sessionId && r.status === 'COMPLETED')
    expect(doneSets.length).toBe(8)
    expect((await readStore(page, 'setRecords')).filter((r) => r.sessionId === sess.sessionId && r.status === 'PENDING').length).toBe(0)
    const bar = page.locator('div.fixed').filter({ hasText: 'FINALIZAR' })
    await expect(bar.getByText('100% — 4/4', { exact: true })).toBeVisible()
    await shot(page, 'vf-ss4-final')
  })

  test('F — Reordenamiento táctil: drag + botones ≥44px, persistencia e integridad de bloques', async ({ page }) => {
    test.setTimeout(300_000)
    await seedBase(page, { session: true })

    // ── Día 1 de la rutina sembrada: Press +3 filas de prueba ──
    await page.evaluate(
      () =>
        new Promise<void>((res, rej) => {
          const open = indexedDB.open('trainPWA')
          open.onerror = () => rej(open.error)
          open.onsuccess = () => {
            const idb = open.result
            try {
              const tx = idb.transaction('routineStore', 'readwrite')
              const store = tx.objectStore('routineStore')
              const g = store.get('qa-routine')
              g.onsuccess = () => {
                const r: any = g.result
                const base = r.dayExercises?.[1] ?? []
                r.dayExercises = {
                  ...r.dayExercises,
                  1: [
                    ...base,
                    { id: 'ord-e2', exId: 'ord-e2', name: 'Ord E2', sets: 3, reps: 8, weight: 40, restSec: 60, muscle: 'pectorales' },
                    { id: 'ord-e3', exId: 'ord-e3', name: 'Ord E3', sets: 3, reps: 8, weight: 40, restSec: 60, muscle: 'pectorales' },
                    { id: 'ord-e4', exId: 'ord-e4', name: 'Ord E4', sets: 3, reps: 8, weight: 40, restSec: 60, muscle: 'pectorales' },
                  ],
                }
                store.put(r)
              }
              tx.oncomplete = () => { idb.close(); res() }
              tx.onerror = () => { idb.close(); rej(tx.error) }
            } catch (e) { idb.close(); rej(e) }
          }
        }),
    )
    await page.goto('/rutina')
    await page.locator('[data-testid="mobile-splash"]').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
    await expect(page.locator('[data-exrow][data-day="1"]')).toHaveCount(4, { timeout: 30000 })
    expect(await dayOrder(page)).toEqual(['Press banca', 'Ord E2', 'Ord E3', 'Ord E4'])

    // ── Targets táctiles ≥44px ──
    for (const name of ['Reordenar Ord E3', 'Subir Ord E3', 'Bajar Ord E3']) {
      const box = await page.locator(`button[aria-label="${name}"]`).boundingBox()
      expect(Math.min(box!.width, box!.height), `${name} ≥44px`).toBeGreaterThanOrEqual(44)
    }

    // ── Drag: principio ──
    await dragRowTo(page, 3, 0)
    expect(await dayOrder(page)).toEqual(['Ord E4', 'Press banca', 'Ord E2', 'Ord E3'])
    // ── Drag: final ──
    await dragRowTo(page, 0, 3)
    expect(await dayOrder(page)).toEqual(['Press banca', 'Ord E2', 'Ord E3', 'Ord E4'])
    // ── Drag: intermedio ──
    await dragRowTo(page, 2, 1)
    expect(await dayOrder(page)).toEqual(['Press banca', 'Ord E3', 'Ord E2', 'Ord E4'])
    await shot(page, 'vf-orden-drag')

    // ── Botones Subir/Bajar hasta el final ──
    await page.locator('button[aria-label="Bajar Press banca"]').click()
    expect(await dayOrder(page)).toEqual(['Ord E3', 'Press banca', 'Ord E2', 'Ord E4'])
    await page.locator('button[aria-label="Bajar Press banca"]').click()
    await page.locator('button[aria-label="Bajar Press banca"]').click()
    expect(await dayOrder(page)).toEqual(['Ord E3', 'Ord E2', 'Ord E4', 'Press banca'])
    await page.locator('button[aria-label="Subir Press banca"]').click()
    expect(await dayOrder(page)).toEqual(['Ord E3', 'Ord E2', 'Press banca', 'Ord E4'])

    // ── Persistencia tras recarga ──
    await reloadClean(page)
    await expect(page.locator('[data-exrow][data-day="1"]')).toHaveCount(4, { timeout: 30000 })
    expect(await dayOrder(page)).toEqual(['Ord E3', 'Ord E2', 'Press banca', 'Ord E4'])

    // ── Superserie contigua E3+E2 ──
    await page.locator('button[aria-label="Superserie Ord E3"]').click()
    await page.locator('button[aria-label="Superserie Ord E2"]').click()
    await expect(page.getByText(/Superserie: 2 seleccionados/)).toBeVisible()
    await page.getByRole('button', { name: 'Crear bloque' }).click()
    await expect(page.getByText('SS 1/2')).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('SS 2/2')).toBeVisible()
    await reloadClean(page)
    await expect(page.getByText('SS 1/2')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('SS 2/2')).toBeVisible()

    // ── Mover una fila libre salta el bloque COMO UNIDAD (no lo rompe) ──
    // Estado: Press en pos 2; el bloque E3+E2 ocupa 0-1. «Subir» lo salta
    // hacia arriba, «Bajar» desde el nuevo inicio lo salta hacia abajo, y un
    // «Subir» final vuelve al estado que exige la integridad (Press primero).
    await page.locator('button[aria-label="Subir Press banca"]').click()
    expect(await dayOrder(page)).toEqual(['Press banca', 'Ord E3', 'Ord E2', 'Ord E4'])
    await expect(page.getByText('SS 1/2')).toBeVisible()
    await expect(page.getByText('SS 2/2')).toBeVisible()
    await page.locator('button[aria-label="Bajar Press banca"]').click()
    expect(await dayOrder(page)).toEqual(['Ord E3', 'Ord E2', 'Press banca', 'Ord E4'])
    await expect(page.getByText('SS 1/2')).toBeVisible()
    await expect(page.getByText('SS 2/2')).toBeVisible()
    await page.locator('button[aria-label="Subir Press banca"]').click()
    expect(await dayOrder(page)).toEqual(['Press banca', 'Ord E3', 'Ord E2', 'Ord E4'])
    await expect(page.getByText('SS 1/2')).toBeVisible()
    await expect(page.getByText('SS 2/2')).toBeVisible()
    await shot(page, 'vf-ss-orden')

    // ── Integridad en IndexedDB ──
    await reloadClean(page)
    const r = (await readStore(page, 'routineStore')).find((x) => x.id === 'qa-routine')!
    const items = r.dayExercises?.[1] ?? []
    expect(items.map((i: any) => i.name)).toEqual(['Press banca', 'Ord E3', 'Ord E2', 'Ord E4'])
    const ss = items.filter((i: any) => i.supersetId)
    expect(ss.length).toBe(2)
    expect(ss[0].name).toBe('Ord E3')
    expect(ss[1].name).toBe('Ord E2')
    expect(ss[0].supersetId).toBe(ss[1].supersetId)
    expect(ss.map((i: any) => i.supersetOrder)).toEqual([0, 1])
    expect(items.find((i: any) => i.name === 'Press banca').supersetId ?? null).toBeNull()

    // ── La sesión iniciada NO cambió con la rutina ──
    const ses = (await readStore(page, 'trainingSessions')).find((s) => s.id === 'qa-s1')!
    expect(ses.sessionStatus).toBe('IN_PROGRESS')
    const sex = (await readStore(page, 'sessionExercises')).filter((x) => x.sessionId === 'qa-s1').sort((a, b) => a.order - b.order)
    expect(sex.map((x) => x.exerciseId)).toEqual(['press', 'remo'])
    expect(sex.map((x) => x.exerciseName)).toEqual(['Press banca', 'Remo con barra'])
    expect((await readStore(page, 'setRecords')).filter((x) => x.sessionId === 'qa-s1' && x.status === 'PENDING').length).toBe(2)

    await page.goto('/entrenar')
    await expect(page.getByText(/EJERCICIO 1 DE 2/)).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('heading', { name: 'Press banca' }).first()).toBeVisible()
    await expect(page.getByText('Serie 0/2', { exact: true })).toBeVisible()
    await shot(page, 'vf-sesion-intacta')
  })
})
