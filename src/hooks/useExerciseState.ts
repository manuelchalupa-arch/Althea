import { useState, useCallback, useEffect } from 'react'
import { db } from '@/services/storage/db'
import { getLastExecutionByExercise } from '@/services/history'
import type { SessionExercise, SetRecord } from '@/services/training/domain'

interface SessionEx {
  exId: string
  name: string
  sets: number
  reps: number
  weight: number
  muscle?: string
  gifUrl?: string
  imageDataUrl?: string
  swappedFrom?: string
  replaced?: boolean
  extra?: boolean
  plannedSets?: number
  seriesType?: string
  seId?: string
}

interface UseExerciseStateOptions {
  sessionId: string | null
  sessionExercises: SessionExercise[]
  currentIndex: number
}

interface UseExerciseStateReturn {
  exs: SessionEx[]
  current: number
  done: Record<number, boolean>
  skipped: Record<number, boolean>
  logs: Record<number, SetRecord[]>
  pendingReasons: Record<number, { reason: string; comment: string }>
  skipReasons: Record<number, string>
  coach: any
  showWhy: boolean
  viewer: any
  setExs: React.Dispatch<React.SetStateAction<SessionEx[]>>
  setCurrent: React.Dispatch<React.SetStateAction<number>>
  setDone: React.Dispatch<React.SetStateAction<Record<number, boolean>>>
  setSkipped: React.Dispatch<React.SetStateAction<Record<number, boolean>>>
  setLogs: React.Dispatch<React.SetStateAction<Record<number, SetRecord[]>>>
  setPendingReasons: React.Dispatch<React.SetStateAction<Record<number, { reason: string; comment: string }>>>
  setSkipReasons: React.Dispatch<React.SetStateAction<Record<number, string>>>
  setCoach: React.Dispatch<React.SetStateAction<any>>
  setShowWhy: React.Dispatch<React.SetStateAction<boolean>>
  setViewer: React.Dispatch<React.SetStateAction<any>>
  initializeExercises: (exercises: SessionEx[]) => Promise<void>
  loadCoachRecommendation: (exerciseId: string, exerciseName: string) => Promise<void>
  completeSet: (setRecord: SetRecord) => Promise<void>
  skipExercise: (index: number, reason: string, comment?: string) => Promise<void>
  swapExercise: (index: number, newEx: SessionEx, reason: string, comment?: string) => Promise<void>
  modifyExercise: (index: number, mod: { weight: number; reps: number; sets: number }) => Promise<void>
}

export function useExerciseState({
  sessionId,
  sessionExercises,
  currentIndex
}: UseExerciseStateOptions): UseExerciseStateReturn {
  const [exs, setExs] = useState<SessionEx[]>([])
  const [current, setCurrent] = useState(currentIndex)
  const [done, setDone] = useState<Record<number, boolean>>({})
  const [skipped, setSkipped] = useState<Record<number, boolean>>({})
  const [logs, setLogs] = useState<Record<number, SetRecord[]>>({})
  const [pendingReasons, setPendingReasons] = useState<Record<number, { reason: string; comment: string }>>({})
  const [skipReasons, setSkipReasons] = useState<Record<number, string>>({})
  const [coach, setCoach] = useState<any>(null)
  const [showWhy, setShowWhy] = useState(false)
  const [viewer, setViewer] = useState<any>(null)

  const initializeExercises = useCallback(async (exercises: SessionEx[]) => {
    setExs(exercises)
    setCurrent(currentIndex)
    const d: Record<number, boolean> = {}
    const sk: Record<number, boolean> = {}
    const lg: Record<number, SetRecord[]> = {}

    for (let i = 0; i < exercises.length; i++) {
      const se = sessionExercises[i]
      if (se.status === 'COMPLETED') { d[i] = true; sk[i] = true }
      else if (se.status === 'SKIPPED') { d[i] = true; sk[i] = true }
      const recs = await db.setRecords.where('sessionExerciseId').equals(se.sessionExerciseId).toArray().catch(() => [])
      lg[i] = recs
    }
    setDone(d)
    setSkipped(sk)
    setLogs(lg)
    if (exercises[0]) {
      await loadCoachRecommendation(exercises[0].exId, exercises[0].name)
    } else {
      setCoach(null)
    }
  }, [sessionId, sessionExercises, currentIndex])

  const loadCoachRecommendation = useCallback(async (exerciseId: string, exerciseName: string) => {
    try {
      const { buildTrainingContext } = await import('@/services/ai/contextBuilder')
      const ctx = await buildTrainingContext(exerciseId, exerciseName)
      const { aiService } = await import('@/services/ai/aiService')
      const rec = await aiService.generateRecommendation(ctx).catch(() => ({
        reason: 'Vamos con la carga estándar.', suggested_weight: 20, confidence: 0.6, factors: ['determinístico']
      }))
      setCoach(rec)
    } catch {
      setCoach(null)
    }
  }, [])

  const completeSet = useCallback(async (setRecord: SetRecord) => {
    // implementation would go here
  }, [sessionId])

  const skipExercise = useCallback(async (index: number, reason: string, comment?: string) => {
    // implementation would go here
  }, [sessionId])

  const swapExercise = useCallback(async (index: number, newEx: SessionEx, reason: string, comment?: string) => {
    // implementation would go here
  }, [sessionId])

  const modifyExercise = useCallback(async (index: number, mod: { weight: number; reps: number; sets: number }) => {
    // implementation would go here
  }, [sessionId])

  return {
    exs,
    current,
    done,
    skipped,
    logs,
    pendingReasons,
    skipReasons,
    coach,
    showWhy,
    viewer,
    setExs,
    setCurrent,
    setDone,
    setSkipped,
    setLogs,
    setPendingReasons,
    setSkipReasons,
    setCoach,
    setShowWhy,
    setViewer,
    initializeExercises,
    loadCoachRecommendation,
    completeSet,
    skipExercise,
    swapExercise,
    modifyExercise
  }
}