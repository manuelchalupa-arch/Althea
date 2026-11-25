import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'

vi.mock('@/services/exerciseGym', () => ({
  fetchAll: async () => ({ exercises: [] }),
  fetchByMuscle: async () => ({ exercises: [] }),
  fetchOne: async () => null,
  cacheSet: () => {},
  cacheGet: () => null,
}))

import Entrenar from './Entrenar'

type Seed = { exId: string; name: string; sets: number; reps: number; weight: number; supersetId?: string | null; supersetOrder?: number | null; restSec?: number }

async function startSession(exercises: Seed[]) {
  const { createReadySession, transitionSession } = await import('@/services/training/sessionStore')
  const created = await createReadySession({
    calendarDate: todayKey(), routineId: 'r1', routineName: 'Rutina',
    plannedDay: 1, plannedDayName: 'Piernas', actualDay: 1, actualDayName: 'Piernas',
    exercises: exercises as never,
  })
  await transitionSession(created.sessionId, 'IN_PROGRESS')
  return created.sessionId
}

const answerNo = async () => {
  const prompt = await screen.findByTestId('pain-prompt', undefined, { timeout: 10000 })
  expect(prompt).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('No sentí dolor'))
}

const currentBadge = () => screen.getByText(/EJERCICIO \d+ DE \d+/).textContent || ''
const expectCurrent = async (n: number, total: number) => {
  await waitFor(() => expect(currentBadge()).toContain(`EJERCICIO ${n} DE ${total}`), { timeout: 10000 })
}

describe('Entrenar — superseries', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
  })

  it('bloque de 2 con 2 rondas: alterna A1→B1→A2→B2, descansos etiquetados y dolor al cerrar el bloque', async () => {
    const sid = await startSession([
      { exId: 'a', name: 'Ej A', sets: 2, reps: 8, weight: 60, supersetId: 'ss1', supersetOrder: 0 },
      { exId: 'b', name: 'Ej B', sets: 2, reps: 8, weight: 60, supersetId: 'ss1', supersetOrder: 1, restSec: 60 },
      { exId: 'c', name: 'Ej C', sets: 1, reps: 8, weight: 60 },
    ])
    render(<MemoryRouter><Entrenar /></MemoryRouter>)
    await screen.findByLabelText('kilogramos serie 1', undefined, { timeout: 10000 })

    // A1: badge de bloque visible; al terminar la serie pasa a B (no al siguiente suelto).
    expect(screen.getByText('SUPERSERIE 1/2')).toBeInTheDocument()
    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    // Descanso de transición dentro del bloque (label propio).
    await screen.findAllByText(/DESCANSO SUPERSERIE/i, undefined, { timeout: 10000 })
    await expectCurrent(2, 3)
    expect(screen.getByText('SUPERSERIE 2/2')).toBeInTheDocument()
    // Sin consulta de dolor a mitad de bloque.
    expect(screen.queryByTestId('pain-prompt')).not.toBeInTheDocument()

    // B1 → fin de ronda: vuelve a A (queda serie 2) con descanso de bloque.
    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    await screen.findAllByText(/DESCANSO DE BLOQUE/i, undefined, { timeout: 10000 })
    await expectCurrent(1, 3)
    expect(screen.queryByTestId('pain-prompt')).not.toBeInTheDocument()

    // A2 → siguiente ronda en B.
    fireEvent.click(await screen.findByLabelText('Confirmar serie 2', undefined, { timeout: 10000 }))
    await expectCurrent(2, 3)

    // B2 → bloque completo: una consulta por ejercicio del bloque, en orden A→B.
    fireEvent.click(await screen.findByLabelText('Confirmar serie 2', undefined, { timeout: 10000 }))
    await answerNo()
    await waitFor(() => expect(screen.getByText(/Terminaste Ej B/)).toBeInTheDocument(), { timeout: 10000 })
    await answerNo()
    // Respondidas ambas → avanza al ejercicio suelto siguiente.
    await expectCurrent(3, 3)

    // Series asociadas al ejercicio correcto (id de bloque en la sesión).
    const ses = (await db.trainingSessions.get(sid)) as never as { exercises?: { exId: string; supersetId?: string | null }[] } | undefined
    void ses
    const records = await db.setRecords.toArray()
    expect(records.filter((r) => r.exerciseId === 'a')).toHaveLength(2)
    expect(records.filter((r) => r.exerciseId === 'b')).toHaveLength(2)
    const { getSessionExercises } = await import('@/services/training/sessionStore')
    const ses2 = await getSessionExercises(sid)
    expect(ses2.find((e) => e.exerciseId === 'a')?.supersetId).toBe('ss1')
    expect(ses2.find((e) => e.exerciseId === 'b')?.supersetId).toBe('ss1')
    expect(ses2.find((e) => e.exerciseId === 'c')?.supersetId).toBeFalsy()
  }, 60000)

  it('bloque de 3: A→B→C en ronda y una consulta por integrante al cerrar', async () => {
    await startSession([
      { exId: 'a', name: 'Ej A', sets: 1, reps: 8, weight: 60, supersetId: 'ss3', supersetOrder: 0 },
      { exId: 'b', name: 'Ej B', sets: 1, reps: 8, weight: 60, supersetId: 'ss3', supersetOrder: 1 },
      { exId: 'c', name: 'Ej C', sets: 1, reps: 8, weight: 60, supersetId: 'ss3', supersetOrder: 2 },
      { exId: 'd', name: 'Ej D', sets: 1, reps: 8, weight: 60 },
    ])
    render(<MemoryRouter><Entrenar /></MemoryRouter>)
    await screen.findByLabelText('kilogramos serie 1', undefined, { timeout: 10000 })

    expect(screen.getByText('SUPERSERIE 1/3')).toBeInTheDocument()
    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    await expectCurrent(2, 4)
    expect(screen.getByText('SUPERSERIE 2/3')).toBeInTheDocument()
    expect(screen.queryByTestId('pain-prompt')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    await expectCurrent(3, 4)
    expect(screen.getByText('SUPERSERIE 3/3')).toBeInTheDocument()
    expect(screen.queryByTestId('pain-prompt')).not.toBeInTheDocument()
    // Fin de bloque: consultas A, B y C en orden, luego el suelto D.
    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    await answerNo()
    await waitFor(() => expect(screen.getByText(/Terminaste Ej B/)).toBeInTheDocument(), { timeout: 10000 })
    await answerNo()
    await waitFor(() => expect(screen.getByText(/Terminaste Ej C/)).toBeInTheDocument(), { timeout: 10000 })
    await answerNo()
    await expectCurrent(4, 4)
  }, 60000)

  it('bloque de 4+: alterna los 4 antes de repetir y cierra con 4 consultas', async () => {    await startSession([
      { exId: 'a', name: 'Ej A', sets: 1, reps: 8, weight: 60, supersetId: 'ss4', supersetOrder: 0 },
      { exId: 'b', name: 'Ej B', sets: 1, reps: 8, weight: 60, supersetId: 'ss4', supersetOrder: 1 },
      { exId: 'c', name: 'Ej C', sets: 1, reps: 8, weight: 60, supersetId: 'ss4', supersetOrder: 2 },
      { exId: 'd', name: 'Ej D', sets: 1, reps: 8, weight: 60, supersetId: 'ss4', supersetOrder: 3 },
    ])
    render(<MemoryRouter><Entrenar /></MemoryRouter>)
    await screen.findByLabelText('kilogramos serie 1', undefined, { timeout: 10000 })

    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    await expectCurrent(2, 4)
    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    await expectCurrent(3, 4)
    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    await expectCurrent(4, 4)
    // Cierre del bloque: 4 consultas en orden.
    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    for (const name of ['Ej A', 'Ej B', 'Ej C', 'Ej D']) {
      await waitFor(() => expect(screen.getByText(`Terminaste ${name}`)).toBeInTheDocument(), { timeout: 10000 })
      await answerNo()
    }
    // Último ejercicio de la sesión: sin destino siguiente, sin error.
    await waitFor(() => expect(screen.queryByTestId('pain-prompt')).not.toBeInTheDocument(), { timeout: 10000 })
  }, 60000)

  it('3 ejercicios × 3 series: A1→B1→C1→descanso→A2→B2→C2→descanso→A3→B3→C3', async () => {
    await startSession([
      { exId: 'a', name: 'Curl barra', sets: 3, reps: 10, weight: 20, supersetId: 'ss3x3', supersetOrder: 0 },
      { exId: 'b', name: 'Curl polea', sets: 3, reps: 10, weight: 15, supersetId: 'ss3x3', supersetOrder: 1 },
      { exId: 'c', name: 'Curl mancuerna', sets: 3, reps: 10, weight: 12, supersetId: 'ss3x3', supersetOrder: 2 },
    ])
    render(<MemoryRouter><Entrenar /></MemoryRouter>)
    await screen.findByLabelText('kilogramos serie 1', undefined, { timeout: 10000 })

    const expectedOrder = [1, 2, 3, 1, 2, 3, 1, 2, 3]
    for (let step = 0; step < expectedOrder.length; step++) {
      await expectCurrent(expectedOrder[step], 3)
      const setN = Math.floor(step / 3) + 1
      fireEvent.click(await screen.findByLabelText(`Confirmar serie ${setN}`, undefined, { timeout: 10000 }))
      // Al cerrar cada ronda (C1 y C2) se abre el descanso principal del bloque.
      if (expectedOrder[step] === 3 && step < expectedOrder.length - 1) {
        await screen.findAllByText(/DESCANSO DE BLOQUE/i, undefined, { timeout: 10000 })
      }
    }
    // Bloque completo: consultas A, B y C en orden (misma lógica de cierre).
    for (const name of ['Curl barra', 'Curl polea', 'Curl mancuerna']) {
      await waitFor(() => expect(screen.getByText(`Terminaste ${name}`)).toBeInTheDocument(), { timeout: 10000 })
      await answerNo()
    }
  }, 90000)

  it('saltar un integrante avanza dentro del bloque y no lo repite en la ronda siguiente', async () => {
    const sid = await startSession([
      { exId: 'a', name: 'Ej A', sets: 3, reps: 8, weight: 60, supersetId: 'sss', supersetOrder: 0 },
      { exId: 'b', name: 'Ej B', sets: 3, reps: 8, weight: 60, supersetId: 'sss', supersetOrder: 1 },
      { exId: 'c', name: 'Ej C', sets: 3, reps: 8, weight: 60, supersetId: 'sss', supersetOrder: 2 },
    ])
    render(<MemoryRouter><Entrenar /></MemoryRouter>)
    await screen.findByLabelText('kilogramos serie 1', undefined, { timeout: 10000 })

    // A1 → B
    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    await expectCurrent(2, 3)
    // Se salta B: sus series pendientes quedan omitidas.
    fireEvent.click(screen.getAllByText('Saltar')[0])
    fireEvent.click(await screen.findByText('Confirmar salto'))
    await expectCurrent(3, 3)
    // C1 cierra la ronda → vuelve a A (B no tiene series pendientes).
    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    await expectCurrent(1, 3)
    // A2 salta directamente a C2: el bloque nunca vuelve a B.
    fireEvent.click(await screen.findByLabelText('Confirmar serie 2', undefined, { timeout: 10000 }))
    await expectCurrent(3, 3)

    const { getSessionExercises, getSetRecords } = await import('@/services/training/sessionStore')
    const ses = await getSessionExercises(sid)
    const b = ses.find(e => e.exerciseId === 'b')
    const recs = await getSetRecords(b!.sessionExerciseId)
    expect(recs.every(r => r.status === 'SKIPPED')).toBe(true)
    expect(b?.status).toBe('SKIPPED')
  }, 60000)

  it('series desiguales (A3/B2/C1): completa pendientes en orden y el panel refleja el estado real', async () => {
    const sid = await startSession([
      { exId: 'a', name: 'Ej A', sets: 3, reps: 8, weight: 60, supersetId: 'ss-u', supersetOrder: 0 },
      { exId: 'b', name: 'Ej B', sets: 2, reps: 8, weight: 60, supersetId: 'ss-u', supersetOrder: 1 },
      { exId: 'c', name: 'Ej C', sets: 1, reps: 8, weight: 60, supersetId: 'ss-u', supersetOrder: 2 },
    ])
    render(<MemoryRouter><Entrenar /></MemoryRouter>)
    await screen.findByLabelText('kilogramos serie 1', undefined, { timeout: 10000 })

    // Panel con datos reales: grupo, actual, serie y próximo.
    expect(screen.getByTestId('superset-panel')).toBeInTheDocument()
    expect(screen.getByText(/SUPERSERIE 1 · GRUPO A/)).toBeInTheDocument()
    expect(screen.getByTestId('superset-current').textContent).toContain('Ahora: A1 Ej A — serie 1 de 3')
    expect(screen.getByTestId('superset-next').textContent).toContain('Siguiente: B1')
    expect(screen.getByTestId('superset-round').textContent).toBe('Ronda 1 de 3')

    // A1 → B1 → C1 → A2 → B2 → A3 (C no tiene segunda serie: no se espera).
    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    await expectCurrent(2, 3)
    expect(screen.getByTestId('superset-current').textContent).toContain('Ahora: B1 Ej B — serie 1 de 2')
    expect(screen.getByTestId('superset-next').textContent).toContain('Siguiente: C1')

    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    await expectCurrent(3, 3)
    expect(screen.getByTestId('superset-next').textContent).toContain('Siguiente: A2')

    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    await expectCurrent(1, 3)
    expect(screen.getByTestId('superset-round').textContent).toBe('Ronda 2 de 3')
    expect(screen.getByTestId('superset-next').textContent).toContain('Siguiente: B2')

    fireEvent.click(await screen.findByLabelText('Confirmar serie 2', undefined, { timeout: 10000 }))
    await expectCurrent(2, 3)
    expect(screen.getByTestId('superset-next').textContent).toContain('Siguiente: A3')

    fireEvent.click(await screen.findByLabelText('Confirmar serie 2', undefined, { timeout: 10000 }))
    await expectCurrent(1, 3)
    expect(screen.getByTestId('superset-round').textContent).toBe('Ronda 3 de 3')
    expect(screen.getByTestId('superset-current').textContent).toContain('Ahora: A3 Ej A — serie 3 de 3')

    // A3 cierra el bloque: consultas A → B → C.
    fireEvent.click(await screen.findByLabelText('Confirmar serie 3', undefined, { timeout: 10000 }))
    for (const name of ['Ej A', 'Ej B', 'Ej C']) {
      await waitFor(() => expect(screen.getByText(`Terminaste ${name}`)).toBeInTheDocument(), { timeout: 10000 })
      await answerNo()
    }

    // Cada serie quedó registrada en su ejercicio, sin omitir ni repetir.
    const records = await db.setRecords.toArray()
    const completed = (id: string) => records.filter(r => r.exerciseId === id && r.status === 'COMPLETED').length
    expect(completed('a')).toBe(3)
    expect(completed('b')).toBe(2)
    expect(completed('c')).toBe(1)
    expect(sid).toBeTruthy()
  }, 90000)

  it('recarga en medio de la superserie: continúa en el punto correcto y no repite series', async () => {
    const sid = await startSession([
      { exId: 'a', name: 'Ej A', sets: 2, reps: 8, weight: 60, supersetId: 'ss-r', supersetOrder: 0 },
      { exId: 'b', name: 'Ej B', sets: 2, reps: 8, weight: 60, supersetId: 'ss-r', supersetOrder: 1 },
      { exId: 'c', name: 'Ej C', sets: 1, reps: 8, weight: 60 },
    ])
    const first = render(<MemoryRouter><Entrenar /></MemoryRouter>)
    await screen.findByLabelText('kilogramos serie 1', undefined, { timeout: 10000 })
    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    await expectCurrent(2, 3)
    // La posición quedó persistida (A1 hecho → el punto es B).
    await waitFor(async () => {
      const s = (await db.trainingSessions.get(sid)) as never as { currentExerciseIndex?: number } | undefined
      expect(s?.currentExerciseIndex).toBe(1)
    }, { timeout: 10000 })
    first.unmount()

    render(<MemoryRouter><Entrenar /></MemoryRouter>)
    await screen.findByLabelText('kilogramos serie 1', undefined, { timeout: 10000 })
    await expectCurrent(2, 3)
    expect(screen.getByTestId('superset-current').textContent).toContain('Ahora: B1 Ej B — serie 1 de 2')
    expect(screen.getByTestId('superset-next').textContent).toContain('Siguiente: A2')

    // B1 → vuelve a A por la serie 2 (A1 no se repite).
    fireEvent.click(await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 }))
    await expectCurrent(1, 3)
    expect(screen.getByTestId('superset-current').textContent).toContain('Ahora: A2 Ej A — serie 2 de 2')
    expect(screen.queryByLabelText('Confirmar serie 1')).not.toBeInTheDocument()

    const records = await db.setRecords.toArray()
    const aRecords = records.filter(r => r.exerciseId === 'a')
    expect(aRecords).toHaveLength(2) // 1 hecha + 1 pendiente: nada duplicado
    expect(aRecords.filter(r => r.status === 'COMPLETED')).toHaveLength(1)
  }, 90000)
})
