import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import Calendario from './Calendario'

const today = new Date().toISOString().slice(0, 10)
const todayDay = String(new Date().getDate())

async function openToday() {
  render(
    <MemoryRouter>
      <Calendario />
    </MemoryRouter>
  )
  await waitFor(() => {
    expect(screen.getByText('Calendario y recuperación')).toBeInTheDocument()
  })
  const btns = screen.getAllByRole('button')
  const todayBtn = btns.find(b => {
    const t = (b.textContent || '').trim()
    return t === todayDay || t.startsWith(todayDay + '✓') || t.startsWith(todayDay + ' ')
  })
  expect(todayBtn).toBeDefined()
  fireEvent.click(todayBtn!)
}

describe('FASE 1.6 — Calendario lee Recovery solo desde Dexie', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('espejo legacy en localStorage se ignora: muestra Sin datos', async () => {
    localStorage.setItem(
      'recovery:' + today,
      JSON.stringify({ energy: 9, fatigue: 1, stress: 1, score: 99 })
    )
    await openToday()
    await waitFor(() => {
      expect(screen.getAllByText(/Sin datos/).length).toBeGreaterThan(0)
    })
    expect(screen.queryByText(/99\/100/)).not.toBeInTheDocument()
  })

  it('dato real en Dexie se muestra', async () => {
    await db.recoveryChecks.put({
      id: today, localDate: today, energy: 8, fatigue: 2, stress: 3,
      motivation: 8, score: 80, color: 'green',
    } as never)
    await openToday()
    await waitFor(() => {
      expect(screen.getByText(/80\/100/)).toBeInTheDocument()
    })
  })

  it('día completo: ejercicios, volumen, cumplimiento, comidas y sueño', async () => {
    await db.trainingSessions.put({
      id: 'ts1', sessionId: 'ts1', userId: 'me', routineId: 'r1', routineName: 'R',
      plannedDay: 1, actualDay: 1, calendarDate: today,
      sessionStatus: 'COMPLETED', createdAt: `${today}T10:00:00Z`, updatedAt: `${today}T10:00:00Z`,
    } as never)
    await db.sessionExercises.put({
      sessionExerciseId: 'se1', sessionId: 'ts1', exerciseId: 'press',
      order: 0, planned: true, completed: true, status: 'COMPLETED',
      plannedSetCount: 2, actualSetCount: 2,
      plannedSets: [{ order: 1, reps: 8, weight: 80 }, { order: 2, reps: 8, weight: 80 }],
      createdAt: `${today}T10:00:00Z`, updatedAt: `${today}T10:00:00Z`,
    } as never)
    for (const order of [1, 2]) {
      await db.setRecords.put({
        setRecordId: `se1:set:${order}`, sessionId: 'ts1', sessionExerciseId: 'se1',
        exerciseId: 'press', order, setType: 'NORMAL',
        plannedReps: 8, plannedWeight: 80, actualReps: 8, actualWeight: 80,
        status: 'COMPLETED', completedAt: `${today}T10:05:00Z`,
        createdAt: `${today}T10:00:00Z`, updatedAt: `${today}T10:05:00Z`,
      } as never)
    }
    await db.nutritionDiary.put({
      id: 'd1', date: today, name: 'Pollo', mealType: 'almuerzo',
      servingLabel: '100g', amount: 100, unit: 'g',
      macros: { calories: 165, proteins: 31, carbs: 0, fats: 3.6 },
      addedAt: `${today}T13:00:00Z`,
    } as never)
    await db.recoveryChecks.put({
      id: today, localDate: today, energy: 8, fatigue: 2, stress: 3,
      motivation: 8, score: 80, color: 'green', sleepHours: 7.5, sleepQuality: 8,
    } as never)
    await openToday()
    await waitFor(() => {
      expect(screen.getByText(/1280 kg/)).toBeInTheDocument()
    })
    expect(screen.getByText(/2\/2 series/)).toBeInTheDocument()
    expect(screen.getByText(/100%/)).toBeInTheDocument()
    expect(screen.getByText(/165 kcal/)).toBeInTheDocument()
    expect(screen.getByText(/7\.5h/)).toBeInTheDocument()
  })
})
