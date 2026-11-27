import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { exportJSON, importJSON } from '@/services/storage/exportImport'
import { todayKey } from '@/utils/dates'
import Inicio from '@/pages/Inicio'
import Calendario from '@/pages/Calendario'
import Perfil from '@/pages/Perfil'
import Mas from '@/pages/Mas'

vi.mock('@/services/ai/aiService', () => ({
  aiService: { getChatCompletion: vi.fn().mockResolvedValue({ content: '' }) },
}))

/**
 * Integridad de datos (auditoría Etapas 2 y 9):
 * 1) el respaldo exporta TODOS los dominios del usuario (incluidas las 7
 *    tablas que faltaban en R4) y una restauración sobre DB vacía devuelve
 *    exactamente los mismos datos;
 * 2) renderizar Inicio, Calendario y Perfil sobre datos sembrados no altera
 *    una sola fila (antes/después byte a byte).
 */

const today = todayKey()

// Una tabla representativa por dominio de la auditoría.
const TABLES = [
  'userProfile', 'routineStore', 'trainingSessions', 'sessionExercises', 'setRecords',
  'recoveryChecks', 'hydrationLogs', 'bodyMeasurements', 'nutritionDiary',
  'cfWods', 'cfSchedule', 'cfResults', 'cfMarks',
  'activitySessions', 'exerciseRecords', 'cycleVersions',
  'routines', 'sessions', 'setLogs',
  'feedbackThreads', 'feedbackMessages', 'feedbackOutbox',
  'restTimerState', 'cfTimerState', 'syncQueue', 'syncDeletes',
] as const

async function seedRepresentative() {
  await db.userProfile.put({
    id: 'me', displayName: 'Nico', weightKg: 80, heightCm: 175,
    bodyFatPct: 18.5, muscleMassKg: 34, onboardingDone: true,
  } as never)
  await db.routineStore.put({
    id: 'r1', name: 'Push/Pull', updatedAt: '2026-11-01T10:00:00Z',
    dayExercises: { 1: [{ exId: 'press', name: 'Press banca', sets: 3, reps: 8, weight: 70 }] },
  } as never)
  await db.routineStore.put({
    id: 'meta:activeId', activeId: 'r1',
    createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z',
  } as never)
  await db.trainingSessions.put({
    id: 'ts1', sessionId: 'ts1', userId: 'me', routineId: 'r1',
    plannedDay: 1, actualDay: 1, calendarDate: today, sessionStatus: 'COMPLETED',
    plannedSets: 3, startedAt: `${today}T10:00:00Z`, endedAt: `${today}T10:40:00Z`,
    createdAt: `${today}T10:00:00Z`, updatedAt: `${today}T10:40:00Z`,
  } as never)
  await db.sessionExercises.put({
    sessionExerciseId: 'se1', sessionId: 'ts1', exerciseId: 'press',
    order: 0, planned: true, completed: true, status: 'COMPLETED',
    plannedSetCount: 3, actualSetCount: 3, plannedSets: [],
    createdAt: `${today}T10:00:00Z`, updatedAt: `${today}T10:00:00Z`,
  } as never)
  await db.setRecords.put({
    setRecordId: 'sr1', sessionId: 'ts1', sessionExerciseId: 'se1', exerciseId: 'press',
    order: 1, setType: 'NORMAL', plannedReps: 8, plannedWeight: 70,
    actualReps: 8, actualWeight: 70, status: 'COMPLETED',
    completedAt: `${today}T10:05:00Z`, createdAt: `${today}T10:00:00Z`, updatedAt: `${today}T10:05:00Z`,
  } as never)
  await db.recoveryChecks.put({
    id: today, localDate: today, energy: 8, fatigue: 2, stress: 3,
    motivation: 8, score: 80, color: 'green',
  } as never)
  await db.hydrationLogs.put({
    id: 'h1', localDate: today, amountMl: 500, createdAt: `${today}T09:00:00Z`,
  } as never)
  await db.bodyMeasurements.put({
    id: 'bm1', localDate: today, weightKg: 80, heightCm: 175,
    bodyFatPct: 18.5, muscleMassKg: 34, createdAt: `${today}T08:00:00Z`,
  } as never)
  await db.nutritionDiary.put({
    id: 'nd1', date: today, name: 'Pollo', mealType: 'almuerzo',
    servingLabel: '100g', amount: 100, unit: 'g',
    macros: { calories: 165, proteins: 31, carbs: 0, fats: 3.6 },
    addedAt: `${today}T13:00:00Z`,
  } as never)
  await db.cfWods.put({
    id: 'wod1', name: 'Fran', format: 'FOR_TIME', updatedAt: `${today}T10:00:00Z`,
  } as never)
  await db.cfSchedule.put({
    id: 'sch1', date: today, kind: 'wod', updatedAt: `${today}T10:00:00Z`,
  } as never)
  await db.cfResults.put({
    id: 'cf1', date: today, wodName: 'Fran', format: 'FOR_TIME', level: 'rx',
    scoreText: '7:32', timeSec: 452, isBenchmark: true,
    createdAt: `${today}T11:00:00Z`, updatedAt: `${today}T11:00:00Z`,
  } as never)
  await db.cfMarks.put({
    id: 'mk1', movement: 'backSquat', reps: 1, valueKg: 140, date: today,
    createdAt: `${today}T11:00:00Z`, updatedAt: `${today}T11:00:00Z`,
  } as never)
  await db.activitySessions.put({
    id: 'act1', userId: 'me', activityId: 'correr', calendarDate: today,
    startedAt: `${today}T08:00:00Z`, durationMinutes: 30, distanceMeters: 5000,
    createdAt: `${today}T08:30:00Z`, updatedAt: `${today}T08:30:00Z`,
  } as never)
  await db.exerciseRecords.put({
    id: 'er1', sessionId: 'ts1', exerciseId: 'press', bestWeight: 70,
    createdAt: `${today}T10:00:00Z`,
  } as never)
  await db.cycleVersions.put({
    id: 'cv1', scope: 'user', status: 'active', effectiveFrom: today,
    createdAt: `${today}T07:00:00Z`,
  } as never)
  // Tablas heredadas: se conservan para compatibilidad de instalaciones antiguas.
  await db.routines.put({
    id: 'legacy-r1', name: 'Rutina heredada', createdAt: `${today}T07:00:00Z`, updatedAt: `${today}T07:00:00Z`,
  } as never)
  await db.sessions.put({
    id: 'legacy-s1', routineId: 'legacy-r1', localDate: today,
    startedAt: `${today}T10:00:00Z`, createdAt: `${today}T10:00:00Z`, updatedAt: `${today}T10:10:00Z`,
  } as never)
  await db.setLogs.put({
    id: 'legacy-set1', sessionId: 'legacy-s1', exerciseId: 'press',
    createdAt: `${today}T10:05:00Z`, reps: 8, weight: 70,
  } as never)
  await db.feedbackThreads.put({
    id: 'feedback-t1', ownerId: 'me', category: 'duda', subject: 'Prueba',
    status: 'pendiente', createdAt: `${today}T10:00:00Z`, updatedAt: `${today}T10:00:00Z`,
    lastActivityAt: `${today}T10:00:00Z`, lastMessagePreview: 'Consulta',
    lastMessageAuthorRole: 'user', messageCount: 1, unreadForOwner: 0, unreadForAdmin: 1,
  } as never)
  await db.feedbackMessages.put({
    id: 'feedback-m1', threadId: 'feedback-t1', ownerId: 'me', authorId: 'me',
    authorRole: 'user', text: 'Consulta de prueba', createdAt: `${today}T10:00:00Z`,
    readByOwner: true, readByAdmin: false, syncStatus: 'pending',
  } as never)
  await db.feedbackOutbox.put({
    id: 'message:feedback-m1', kind: 'message', docId: 'feedback-m1', threadId: 'feedback-t1',
    payload: { message: { id: 'feedback-m1' } }, status: 'pending', attempts: 0,
    createdAt: `${today}T10:00:00Z`, updatedAt: `${today}T10:00:00Z`,
  } as never)
  await db.restTimerState.put({
    id: 'rest-1', endsAt: null, pausedRemainingSec: 45, flash: false,
    updatedAt: `${today}T10:00:00Z`,
  })
  await db.cfTimerState.put({
    id: 'cf-timer-1', format: 'FOR_TIME', startedAtMs: 0, accumulatedMs: 0,
    running: false, round: 1, movementIdx: 0, intervalIdx: 0,
    updatedAt: `${today}T10:00:00Z`,
  } as never)
  // Se conservan las operaciones offline y las marcas de borrado para que una
  // restauración no pierda escrituras pendientes ni permita resurrecciones.
  await db.syncQueue.put({
    id: 'routineStore:r1', table: 'routineStore', key: 'r1', status: 'pending',
    attempts: 0, createdAt: `${today}T10:00:00Z`, updatedAt: `${today}T10:00:00Z`,
  } as never)
  await db.syncDeletes.put({
    table: 'sessions', docId: 'legacy-deleted', deletedAt: `${today}T10:00:00Z`,
  } as never)
}

async function snapshot(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const t of TABLES) {
    const rows = JSON.parse(JSON.stringify(await (db.table(t) as any).toArray()))
    rows.sort((a: unknown, b: unknown) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    out[t] = JSON.stringify(rows)
  }
  return out
}

describe('Respaldo/restauración verificable (Etapa 2)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    await db.delete()
    await db.open()
  })

  it('exporta las 7 tablas que faltaban (R4) con sus datos', async () => {
    await seedRepresentative()
    const data = JSON.parse(await (await exportJSON()).text())
    expect(data.cfWods.map((r: any) => r.id)).toContain('wod1')
    expect(data.routineStoreMeta).toContainEqual(expect.objectContaining({ id: 'meta:activeId', activeId: 'r1' }))
    expect(data.cfSchedule.map((r: any) => r.id)).toContain('sch1')
    expect(data.cfResults.map((r: any) => r.id)).toContain('cf1')
    expect(data.cfMarks.map((r: any) => r.id)).toContain('mk1')
    expect(data.activitySessions.map((r: any) => r.id)).toContain('act1')
    expect(data.exerciseRecords.map((r: any) => r.id)).toContain('er1')
    expect(data.cycleVersions.map((r: any) => r.id)).toContain('cv1')
    expect(data.legacyRoutines.map((r: any) => r.id)).toContain('legacy-r1')
    expect(data.legacySessions.map((r: any) => r.id)).toContain('legacy-s1')
    expect(data.legacySetLogs.map((r: any) => r.id)).toContain('legacy-set1')
    expect(data.feedbackThreads.map((r: any) => r.id)).toContain('feedback-t1')
    expect(data.feedbackMessages.map((r: any) => r.id)).toContain('feedback-m1')
    expect(data.feedbackOutbox.map((r: any) => r.id)).toContain('message:feedback-m1')
    expect(data.restTimerState.map((r: any) => r.id)).toContain('rest-1')
    expect(data.cfTimerState.map((r: any) => r.id)).toContain('cf-timer-1')
    expect(data.syncQueue.map((r: any) => r.id)).toContain('routineStore:r1')
    expect(data.syncDeletes).toEqual(expect.arrayContaining([expect.objectContaining({ table: 'sessions', docId: 'legacy-deleted' })]))
    // Formato v5 y esquema Dexie v29; las copias anteriores siguen siendo compatibles.
    expect(data.metadata.version).toBe(5)
    expect(data.metadata.schemaVersion).toBe(29)
  })

  it('combinar conserva borrados pendientes de otro dispositivo ante colisión de IDs autonuméricos', async () => {
    await db.syncDeletes.put({
      table: 'routines', docId: 'deleted-from-backup', deletedAt: `${today}T09:00:00Z`,
    }, 1)
    const file = new File([await (await exportJSON()).text()], 'sync-deletes.json', { type: 'application/json' })

    // Simula otro dispositivo que reutilizó el mismo contador local para otro borrado.
    await db.syncDeletes.delete(1)
    await db.syncDeletes.put({
      table: 'nutritionDiary', docId: 'local-deletion', deletedAt: `${today}T10:00:00Z`,
    }, 1)

    const result = await importJSON(file)
    expect(result.success, JSON.stringify({ errors: result.errors, verification: result.verification })).toBe(true)

    const markers = await db.syncDeletes.toArray()
    expect(markers).toHaveLength(2)
    expect(markers).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'nutritionDiary', docId: 'local-deletion' }),
      expect.objectContaining({ table: 'routines', docId: 'deleted-from-backup' }),
    ]))
    expect(result.imported.syncDeletes).toBe(1)
  })

  it('combinar preserva los datos locales si una clave ya existe', async () => {
    await seedRepresentative()
    const file = new File([await (await exportJSON()).text()], 'backup.json', { type: 'application/json' })

    // El archivo contiene Fran, pero esta instalación ya tiene otro contenido
    // local con el mismo ID. Combinar debe preservar la versión local.
    await db.cfWods.put({
      id: 'wod1', name: 'WOD local conservado', format: 'FOR_TIME',
      updatedAt: `${today}T12:00:00Z`,
    } as never)

    const result = await importJSON(file, { mode: 'merge', confirmOverwrite: true })
    expect(result.success, JSON.stringify({ errors: result.errors, verification: result.verification })).toBe(true)
    expect(await db.cfWods.get('wod1')).toMatchObject({ name: 'WOD local conservado' })
  })


  it('rechaza respaldos v5 incompletos o con conteos incorrectos sin modificar los datos locales', async () => {
    await seedRepresentative()
    const before = await snapshot()
    const exported = JSON.parse(await (await exportJSON()).text())

    const missingTable = JSON.parse(JSON.stringify(exported))
    delete missingTable.hydrationBottleLogs

    const wrongCount = JSON.parse(JSON.stringify(exported))
    wrongCount.metadata.recordCounts.nutritionDiary += 1

    for (const invalidData of [missingTable, wrongCount]) {
      const file = new File([JSON.stringify(invalidData)], 'backup-incompleto.json', { type: 'application/json' })
      const result = await importJSON(file)
      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(await snapshot()).toEqual(before)
    }
  })

  it('exportar → borrar todo → importar restaura idénticos los datos representativos', async () => {
    await seedRepresentative()
    const before = await snapshot()

    const file = new File([await (await exportJSON()).text()], 'backup.json', { type: 'application/json' })

    // Borrado total de la base (simula dispositivo nuevo / pérdida de datos).
    await db.delete()
    await db.open()
    for (const t of TABLES) { expect(await (db.table(t) as any).count()).toBe(0) }

    const result = await importJSON(file)
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])

    const after = await snapshot()
    expect(after).toEqual(before)
    expect(await db.routineStore.get('meta:activeId')).toMatchObject({ activeId: 'r1' })

    // Verificación puntual de valores clave (no solo conteos).
    const profile = await db.userProfile.get('me')
    expect(profile).toMatchObject({ displayName: 'Nico', bodyFatPct: 18.5, muscleMassKg: 34 })
    const cf = await db.cfResults.get('cf1')
    expect(cf).toMatchObject({ scoreText: '7:32', isBenchmark: true })
    const act = await db.activitySessions.get('act1')
    expect(act).toMatchObject({ durationMinutes: 30, distanceMeters: 5000 })
  })
})

describe('Render de páginas no muta datos (Etapa 9)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    await db.delete()
    await db.open()
    await seedRepresentative()
  })


  it('Más mantiene accesibles sus accesos y abre un diálogo de notificaciones usable en móvil', async () => {
    render(<MemoryRouter><Mas /></MemoryRouter>)

    const openButton = await screen.findByRole('button', { name: /notificaciones y recordatorios/i })
    expect(openButton.className).toContain('min-h-[48px]')

    fireEvent.click(openButton)
    const dialog = await screen.findByRole('dialog', { name: 'Notificaciones y recordatorios' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')

    const closeButton = screen.getByRole('button', { name: 'Cerrar notificaciones y recordatorios' })
    expect(closeButton.className).toContain('min-h-[44px]')

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Notificaciones y recordatorios' })).not.toBeInTheDocument()
    })
  }, 30000)

  it('Inicio, Calendario y Perfil dejan intactas las tablas sembradas', async () => {
    const before = await snapshot()

    render(<MemoryRouter><Inicio /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('¡Hola, Nico!')).toBeInTheDocument()
    })
    const dashboardSummary = document.querySelector('[data-testid="inicio-dashboard-summaries"]')
    const weekCalendar = document.querySelector('[data-testid="inicio-week-calendar"]')
    expect(dashboardSummary).not.toBeNull()
    expect(weekCalendar).not.toBeNull()
    expect(dashboardSummary!.compareDocumentPosition(weekCalendar!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const stickyHero = document.querySelector('[data-testid="inicio-hero-sticky"]')
    expect(stickyHero?.className).toContain('top-[calc(var(--safe-top)+56px)]')

    render(<MemoryRouter><Calendario /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('Calendario y recuperación')).toBeInTheDocument()
    })
    // Abrir el detalle del día dispara todas las consultas del día (incluida cfResults).
    const btn = screen.getAllByRole('button').find(b => b.getAttribute('data-date') === today)
    if (btn) { fireEvent.click(btn) }

    render(<MemoryRouter><Perfil /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('Datos personales')).toBeInTheDocument()
    })

    const after = await snapshot()
    expect(after).toEqual(before)
  }, 30000)
})
