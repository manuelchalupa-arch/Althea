import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { exportCSV } from './export'
import { toDateKey } from '@/utils/dates'

// Regresión S7 (origen: el `exportPDF` retirado).
//
// El bug era recortar el instante a 10 caracteres (`createdAt.slice(0,10)`), que
// devuelve el día UTC: un set hecho a las 21:30 en Argentina se exportaba con la
// fecha de mañana. Ese código leía además `db.setLogs`/`db.sessions`, capa legacy
// que desde el esquema v5 ya no registra sesiones.
//
// El motor vigente (`exportCSV`) no puede reproducir esa clase de bug: la columna
// `calendarDate` sale de `TrainingSession.calendarDate`, una clave de día civil
// ya persistida al crear la sesión. Este test fija ese comportamiento sobre la
// ruta que ahora alcanza la persona usuaria desde Perfil → «Tus datos».
const atLocal = (y: number, m: number, d: number, h: number, mi = 0) => new Date(y, m - 1, d, h, mi, 0, 0)

describe('exportCSV - la columna calendarDate es el día civil de la sesión', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('un set hecho a las 21:30 se exporta con su día civil, no con el día UTC', async () => {
    const createdAt = atLocal(2026, 3, 10, 21, 30).toISOString()
    expect(createdAt).toBe('2026-03-11T00:30:00.000Z') // su día UTC es mañana
    expect(toDateKey(createdAt)).toBe('2026-03-10') // su día civil es ese día

    await db.trainingSessions.put({
      id: 's1',
      sessionId: 's1',
      routineId: 'r1',
      routineName: 'Rutina',
      plannedDay: 1,
      actualDay: 1,
      // Clave de día civil persistida, no un ISO recortado.
      calendarDate: toDateKey(createdAt),
      weekNumber: 1,
      sessionStatus: 'COMPLETED',
      createdAt,
      updatedAt: createdAt,
    } as never)

    await db.setRecords.put({
      setRecordId: 'sr1',
      sessionId: 's1',
      sessionExerciseId: 'se1',
      exerciseId: 'press',
      order: 1,
      setType: 'NORMAL',
      plannedReps: 10,
      plannedWeight: 100,
      actualReps: 10,
      actualWeight: 100,
      status: 'COMPLETED',
      createdAt,
      updatedAt: createdAt,
    } as never)

    const csv = await (await exportCSV()).text()
    const header = csv.split('\n')[0].split(',')
    const dataRow = csv.split('\n').find(l => l.startsWith('sr1,'))

    expect(dataRow).toBeDefined()
    // Se mira SOLO la columna calendarDate: el resto de la fila son instantes
    // ISO crudos que deben preservarse tal cual para no perder fidelidad.
    const col = header.indexOf('calendarDate')
    expect(col).toBeGreaterThan(-1)
    expect(dataRow!.split(',')[col]).toBe('2026-03-10') // día civil, no el día UTC
  })
})