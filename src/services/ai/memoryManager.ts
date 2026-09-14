// MEMORY MANAGER — Memoria expandida: preferencias, patrones, historial
import { db } from '@/services/storage/db'
import { getAllDecisions, getAllAnswers } from './coachMemory'

export interface UserMemory {
  preferences: Record<string, unknown>
  patterns: {
    frequentExercises: string[]
    avoidedExercises: string[]
    preferredDuration: number | null
    commonPainAreas: string[]
    timePreferences: Record<string, number> // día → count
  }
  recentDecisions: Array<{ date: string; type: string; exercise?: string; motive?: string }>
  qaHistory: Record<string, { question: string; answer: string; date: string }>
  coachingStyle: {
    acceptedTone: string
    motivationalMessagesPreferred: boolean
    directnessPreference: number // 0-1
  }
}

/** Construir memoria del usuario desde datos acumulados */
export async function buildUserMemory(): Promise<UserMemory> {
  const decisions = await getAllDecisions()
  const answers = await getAllAnswers()

  // Patrones de ejercicios
  const exCounts: Record<string, number> = {}
  const avoided: Record<string, number> = {}
  for (const d of decisions) {
    if (d.exercise) {
      if (d.type === 'accept' || d.type === 'complete') {
        exCounts[d.exercise] = (exCounts[d.exercise] || 0) + 1
      }
      if (d.type === 'reject' || d.type === 'skip') {
        avoided[d.exercise] = (avoided[d.exercise] || 0) + 1
      }
    }
  }

  // Frecuencias de día
  const dayCounts: Record<string, number> = {}
  for (const d of decisions) {
    const dow = new Date(d.date).getDay()
    dayCounts[dow] = (dayCounts[dow] || 0) + 1
  }

  // Zonas de dolor frecuentes
  const painAreas: Record<string, number> = {}
  for (const d of decisions) {
    if (d.motive?.includes('dolor') || d.motive?.includes('molestia')) {
      const area = d.motive.split(' ').slice(1).join(' ')
      if (area) painAreas[area] = (painAreas[area] || 0) + 1
    }
  }

  // Preferencias de tono
  const tone = localStorage.getItem('coachIntensity') || 'ABUELITOS'
  const directness = tone === 'PSYCHO' ? 0.9 : tone === 'ARNOLD' ? 0.7 : tone === 'ABUELITOS' ? 0.5 : 0.3

  return {
    preferences: JSON.parse(localStorage.getItem('coachPrefs') || '{}'),
    patterns: {
      frequentExercises: Object.entries(exCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id),
      avoidedExercises: Object.entries(avoided).filter(([, c]) => c >= 2).map(([id]) => id),
      preferredDuration: null,
      commonPainAreas: Object.entries(painAreas).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([area]) => area),
      timePreferences: dayCounts,
    },
    recentDecisions: decisions.slice(-10).map(d => ({
      date: d.date,
      type: d.type,
      exercise: d.exercise,
      motive: d.motive,
    })),
    qaHistory: answers,
    coachingStyle: {
      acceptedTone: tone,
      motivationalMessagesPreferred: tone === 'PADELERO',
      directnessPreference: directness,
    },
  }
}
