import { useState, useCallback, useRef, useEffect } from 'react'
import { db } from '@/services/storage/db'
import { loadActiveSession, saveActiveSession, clearActiveSession, getActiveSession, transitionSession, type ActiveSession } from '@/services/training/sessionStore'
import type { SessionStatus, TrainingSession } from '@/services/training/domain'
import { getOverrideDay, getChangedData } from '@/services/storage/sessionOverrideStore'
import { getCycleFromProfile, type CycleConfig } from '@/utils/cycle'
import { getMethod } from '@/services/ai/trainingMethodsDB'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'

interface ResumeBannerData {
  sessionId: string
  calendarDate: string
  routineName: string
  dayName: string
  status: string
  exerciseCount: number
}

interface UseTrainingSessionOptions {
  today: string
  onSessionLoaded?: (session: TrainingSession) => void
  onResumeBanner?: (banner: ResumeBannerData | null) => void
  onError?: (error: string) => void
}

interface UseTrainingSessionReturn {
  session: TrainingSession | null
  sessionStatus: SessionStatus
  isLoading: boolean
  isStarting: boolean
  isSaving: boolean
  routineName: string
  dayName: string
  plannedDayN: number | null
  actualDayN: number | null
  plannedName: string
  routineId: string
  weekNumber: number
  resumeBanner: ResumeBannerData | null
  volumeAlerts: string[]
  progressLines: Record<string, string>
  loadSession: () => Promise<void>
  startSession: () => Promise<void>
  resumeSession: (sessionId: string, andFinish: boolean) => Promise<void>
  abandonResume: () => Promise<void>
  finishSession: (status: SessionStatus, survey: Record<string, any>) => Promise<void>
  adoptResumeSession: (sess: { sessionId: string }, andFinish: boolean) => Promise<void>
  clearResumeBanner: () => void
  setSession: (session: TrainingSession | null) => void
  setResumeBanner: (banner: ResumeBannerData | null) => void
  setSessionStatus: React.Dispatch<React.SetStateAction<SessionStatus>>
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  setIsStarting: React.Dispatch<React.SetStateAction<boolean>>
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>
  setVolumeAlerts: React.Dispatch<React.SetStateAction<string[]>>
  setProgressLines: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setRoutineName: (name: string) => void
  setRoutineId: (id: string) => void
  setWeekNumber: (num: number) => void
  setPlannedDayN: (n: number | null) => void
  setActualDayN: (n: number | null) => void
  setPlannedName: (name: string) => void
  setDayName: (name: string) => void
}

export function useTrainingSession({
  today,
  onSessionLoaded,
  onResumeBanner,
  onError
}: UseTrainingSessionOptions): UseTrainingSessionReturn {
  const [session, setSession] = useState<TrainingSession | null>(null)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('PLANNED')
  const [isLoading, setIsLoading] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [routineName, setRoutineName] = useState('Rutina')
  const [dayName, setDayName] = useState('')
  const [plannedDayN, setPlannedDayN] = useState<number | null>(null)
  const [actualDayN, setActualDayN] = useState<number | null>(null)
  const [plannedName, setPlannedName] = useState('')
  const [routineId, setRoutineId] = useState<string>('')
  const [weekNumber, setWeekNumber] = useState<number>(1)
  const [resumeBanner, setResumeBannerState] = useState<ResumeBannerData | null>(null)
  const [volumeAlerts, setVolumeAlerts] = useState<string[]>([])
  const [progressLines, setProgressLines] = useState<Record<string, string>>({})
  const methodIdRef = useRef<TrainingMethodId | null>(null)

  const loadSession = useCallback(async () => {
    setIsLoading(true)
    try {
      const activeSession = await loadActiveSession()
      if (!activeSession) {
        setIsLoading(false)
        return
      }
      const sess = activeSession as unknown as TrainingSession
      const prof = await db.userProfile.get('me')
      const cycle = getCycleFromProfile(prof ?? null)
      const override = await getOverrideDay(today)
      const n = override != null ? override : (cycle.weekMap[new Date().getDay()] ?? null)
      const schedN = cycle.weekMap[new Date().getDay()] ?? null
      const schedName = schedN ? cycle.trainingDays.find(d => d.n === schedN)?.name || `Día N°${schedN}` : null
      const dname = n ? cycle.trainingDays.find(d => d.n === n)?.name ?? `Día N°${n}` : 'Descanso'
      const changed = await getChangedData(today) as { changeReason?: string; changeComment?: string } | null

      const { getDayExercises } = await import('@/utils/routine')
      await getDayExercises(n, cycle)
      setRoutineName((sess as any).routineName || 'Rutina')
      setRoutineId((sess as any).routineId || 'r1')
      setPlannedDayN(schedN)
      setActualDayN(n)
      setPlannedName(schedName || '')

      setSession(sess)
      setSessionStatus(sess.sessionStatus)
      onSessionLoaded?.(sess)

      if (['IN_PROGRESS', 'PAUSED', 'COMPLETING'].includes(sess.sessionStatus)) {
        const banner: ResumeBannerData = {
          sessionId: sess.sessionId,
          calendarDate: sess.calendarDate,
          routineName: sess.routineName || 'Rutina',
          dayName: sess.actualDayName ?? '',
          status: sess.sessionStatus,
          exerciseCount: sess.plannedExerciseCount ?? 0
        }
        setResumeBannerState(banner)
        onResumeBanner?.(banner)
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Error al cargar sesión')
    } finally {
      setIsLoading(false)
    }
  }, [today, onSessionLoaded, onResumeBanner, onError])

  const startSession = useCallback(async () => {
    if (isStarting) {return}
    setIsStarting(true)
    try {
      const { getAllRoutines, getActiveRoutineId } = await import('@/services/storage/routineStore')
      const rawList = await getAllRoutines()
      const activeId = await getActiveRoutineId()
      const activeR = rawList?.find(r => r.id === activeId) || rawList?.[0]
      const prof = await db.userProfile.get('me')
      const routine = activeR || { cycle: prof?.cycle, name: 'Rutina' }
      const cycle = routine.cycle || getCycleFromProfile(prof ?? null)
      methodIdRef.current = (cycle as CycleConfig)?.methodId as TrainingMethodId || null

      const n = actualDayN
      const { getDayExercises } = await import('@/utils/routine')
      const list = await getDayExercises(n, cycle)
      const { createReadySession } = await import('@/services/training/sessionStore')
      const changed = await getChangedData(today)
      const weekNumber = (() => {
        try {
          const start = new Date((cycle as CycleConfig).startDate || today)
          const now = new Date(today)
          return Math.max(1, Math.floor((now.getTime() - start.getTime()) / (7 * 86400000)) + 1)
        } catch { return 1 }
      })()
      await createReadySession({
        calendarDate: today,
        routineId: activeR?.id || 'r1',
        routineName: activeR?.name || 'Rutina',
        plannedDay: plannedDayN,
        plannedDayName: plannedName,
        actualDay: n,
        actualDayName: dayName,
        exercises: list.map(x => ({ exId: x.exId || x.id, name: x.name, sets: x.sets, reps: x.reps, weight: x.weight, muscle: x.muscle, gifUrl: x.gifUrl, imageDataUrl: x.imageDataUrl })),
        dayChangeReason: changed?.changeReason || (plannedDayN !== actualDayN ? 'Cambio de día' : undefined),
        dayChangeComment: changed?.changeComment,
        weekNumber,
      })
      setResumeBannerState(null)
      setIsStarting(false)
      loadSession()
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'No se pudo comenzar la sesión.')
      setIsStarting(false)
    }
  }, [today, actualDayN, plannedDayN, plannedName, dayName, loadSession, onError])

  const resumeSession = useCallback(async (sessionId: string, andFinish: boolean) => {
    try {
      const { getSession } = await import('@/services/training/sessionStore')
      const fresh = await getSession(sessionId)
      if (fresh) {
        await saveActiveSession({
          sessionId: fresh.sessionId, calendarDate: fresh.calendarDate, routineId: fresh.routineId,
          routineName: fresh.routineName ?? '', plannedDay: fresh.plannedDay, plannedDayName: fresh.plannedDayName ?? '',
          actualDay: fresh.actualDay, actualDayName: fresh.actualDayName ?? '', plannedMuscleGroups: [],
          actualMuscleGroups: [], exercises: [], sessionStatus: fresh.sessionStatus,
          statusHistory: [], createdAt: fresh.createdAt, updatedAt: fresh.updatedAt
        })
      }
      if (andFinish) {setTimeout(() => { /* openFinishModal */ }, 400)}
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'No se pudo retomar la sesión.')
    }
  }, [onError])

  const abandonResume = useCallback(async () => {
    setResumeBannerState(null)
    try {
      const { clearActiveSession } = await import('@/services/training/sessionStore')
      await clearActiveSession()
    } catch { /* noop */ }
  }, [])

  const finishSession = useCallback(async (status: SessionStatus, survey: Record<string, any>) => {
    setIsSaving(true)
    try {
      await transitionSession(session!.sessionId, status)
      setSessionStatus(status)
      setIsSaving(false)
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Error al guardar.')
      setIsSaving(false)
    }
  }, [session, onError])

  const adoptResumeSession = useCallback(async (sess: { sessionId: string }, andFinish: boolean) => {
    try {
      const { getSession } = await import('@/services/training/sessionStore')
      const fresh = await getSession(sess.sessionId)
      if (fresh) {
        await saveActiveSession({
          sessionId: fresh.sessionId, calendarDate: fresh.calendarDate, routineId: fresh.routineId,
          routineName: fresh.routineName ?? '', plannedDay: fresh.plannedDay, plannedDayName: fresh.plannedDayName ?? '',
          actualDay: fresh.actualDay, actualDayName: fresh.actualDayName ?? '', plannedMuscleGroups: [],
          actualMuscleGroups: [], exercises: [], sessionStatus: fresh.sessionStatus,
          statusHistory: [], createdAt: fresh.createdAt, updatedAt: fresh.updatedAt
        })
      }
      if (andFinish) {setTimeout(() => { /* openFinishModal */ }, 400)}
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'No se pudo retomar la sesión.')
    }
  }, [onError])

  const clearResumeBanner = useCallback(() => {
    setResumeBannerState(null)
    onResumeBanner?.(null)
  }, [onResumeBanner])

  const setResumeBanner = useCallback((banner: ResumeBannerData | null) => {
    setResumeBannerState(banner)
    onResumeBanner?.(banner)
  }, [onResumeBanner])

  return {
    session,
    sessionStatus,
    isLoading,
    isStarting,
    isSaving,
    routineName,
    dayName,
    plannedDayN,
    actualDayN,
    plannedName,
    routineId,
    weekNumber,
    resumeBanner,
    volumeAlerts,
    progressLines,
    loadSession,
    startSession,
    resumeSession,
    abandonResume,
    finishSession,
    adoptResumeSession,
    clearResumeBanner,
    setSession,
    setResumeBanner,
    setSessionStatus,
    setIsLoading,
    setIsStarting,
    setIsSaving,
    setVolumeAlerts,
    setProgressLines,
    setRoutineName,
    setRoutineId,
    setWeekNumber,
    setPlannedDayN,
    setActualDayN,
    setPlannedName,
    setDayName
  }
}