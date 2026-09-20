import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { db, ensureSeeded } from '@/services/storage/db'
import { useRestTimer } from '@/hooks/useRestTimer'
import { useExerciseState } from '@/hooks/useExerciseState'
import { useTrainingSession } from '@/hooks/useTrainingSession'
import { usePainAlert } from '@/hooks/usePainAlert'
import { getCycleFromProfile, type CycleConfig } from '@/utils/cycle'

import { Check, AlertTriangle, RotateCcw } from 'lucide-react'

import ResultPanel from '@/components/entrenar/ResultPanel'
import { ExerciseHeader, ExerciseHeaderInline } from '@/components/entrenar/ExerciseHeader'
import ExerciseSeriesTable from '@/components/entrenar/ExerciseSeriesTable'
import { ModifyModal, ViewerModal, SwapModal, SkipReasonModal, CancelModal, AbandonModal, AddExtraModal, FinishModal } from '@/components/entrenar/SessionModals'

import { aiService } from '@/services/ai/aiService'
import { buildTrainingContext } from '@/services/ai/contextBuilder'
import { getMethod } from '@/services/ai/trainingMethodsDB'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'
import { getOverrideDay, getChangedData, setOverride, migrateSessionOverridesFromLocalStorage } from '@/services/storage/sessionOverrideStore'
import { loadActiveSession, saveActiveSession, clearActiveSession, getActiveSession, transitionSession, type ActiveSession } from '@/services/training/sessionStore'
import * as Gym from '@/services/exerciseGym'
import { saveDecision } from '@/services/ai/coachMemory'
import type { SubstitutionReason } from '@/services/ai/substitutionEngine'
import type { SessionStatus, TrainingSession, SessionExercise } from '@/services/training/domain'
import { getVariantsForPain, getVariantsForExercise, type VariantOption, type VariantContext } from '@/services/ai/variantService'
import PainToggle from '@/features/training/components/PainToggle'
import { VariantPicker } from '@/features/training/components/VariantPicker'

type SessionEx = { exId:string; name:string; sets:number; reps:number; weight:number; muscle?:string; gifUrl?:string; imageDataUrl?:string; swappedFrom?:string; replaced?:boolean; extra?:boolean; plannedSets?:number; seriesType?:string; seId?:string }

export default function Entrenar(){
  const today = new Date().toISOString().slice(0,10)

  // Training session lifecycle hook
  const {
    session,
    sessionStatus,
    isLoading,
    isStarting,
    isSaving,
    routineName: rutinaName,
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
    setRoutineName: setRutinaName,
    setRoutineId,
    setWeekNumber,
    setPlannedDayN,
    setActualDayN,
    setPlannedName,
    setDayName,
  } = useTrainingSession({
    today,
    onSessionLoaded: async (storeS) => {
      // Fetch session exercises and initialize exercise state
      const { getSessionExercises, getSetRecords } = await import('@/services/training/sessionStore')
      const seList = await getSessionExercises(storeS.sessionId)
      // Build SessionEx array from session exercises
      const { db } = await import('@/services/storage/db')
      let meta: Record<string, { name: string; muscle?: string; gifUrl?: string; imageDataUrl?: string }> = {}
      try {
        const exIds = seList.map((e: any) => e.exId || e.exerciseId).filter(Boolean)
        if (exIds.length) {
          const [seedExs, customExs] = await Promise.all([
            db.exercises.where('id').anyOf(exIds).toArray().catch(() => []),
            db.customExercises.where('id').anyOf(exIds).toArray().catch(() => []),
          ])
          for (const e of [...seedExs, ...customExs] as Array<{id:string; name:string; muscle?:string; muscleGroup?:string; gifUrl?:string; imageDataUrl?:string}>) {meta[e.id] = { name: e.name, muscle: e.muscle || e.muscleGroup, gifUrl: e.gifUrl, imageDataUrl: e.imageDataUrl }}
        }
      } catch { /* noop */ }
      const exercises: SessionEx[] = seList.map((se, idx) => {
        const m = meta[se.exerciseId]
        const plannedReps = se.plannedSets[0]?.reps ?? 0
        const plannedWeight = se.plannedSets[0]?.weight ?? 0
        return {
          exId: se.exerciseId,
          name: m?.name || se.exerciseId,
          sets: Math.max(se.plannedSetCount, se.actualSetCount, 1),
          reps: plannedReps,
          weight: plannedWeight,
          muscle: m?.muscle,
          gifUrl: m?.gifUrl,
          imageDataUrl: m?.imageDataUrl,
          plannedSets: se.plannedSetCount,
          seId: se.sessionExerciseId,
          swappedFrom: se.replacement?.originalExerciseId,
          replaced: se.status === 'REPLACED',
          extra: se.status === 'EXTRA',
        }
      })
      await initializeExercises(exercises)
    },
    onResumeBanner: (b) => { /* resume banner callback */ },
    onError: (e) => console.error('Training session error:', e),
  })

  // Exercise state hook
  const {
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
    modifyExercise,
  } = useExerciseState({
    sessionId: '', // Will be updated when session loads
    sessionExercises: [],
    currentIndex: 0,
  })

  const { restSec, restPaused, restFlash, startRest, pauseRest, resumeRest, adjustRest, skipRest, dismissFlash } = useRestTimer()

  // Sync sessionStatusRef with hook's sessionStatus
  useEffect(() => {
    sessionStatusRef.current = sessionStatus
  }, [sessionStatus])

  const [showModify,setShowModify]=useState(false)
  const [mod,setMod]=useState({weight:0,reps:0,sets:0, seriesType:'normal'})
  const [showObservation,setShowObservation]=useState(false)
  const [obsReasons,setObsReasons]=useState<string[]>([])
  const [obsComment,setObsComment]=useState('')
  const [showSwap,setShowSwap]=useState(false)
  const [swapOptions,setSwapOptions]=useState<import('@/services/training/similarity').SimilarityResult[]>([])
  const [swapExplain,setSwapExplain]=useState<string|null>(null)
  const [swapLoading,setSwapLoading]=useState(false)
  const [showSkipReason,setShowSkipReason]=useState(false)
  const [skipReason,setSkipReason]=useState('')
  
  const [painAns,setPainAns]=useState('')
  const [safetyAlert,setSafetyAlert]=useState<{severity:'info'|'warning'|'critical'; message:string; referral?:string}|null>(null)
  // Estados para FINALIZAR ENTRENAMIENTO + máquina de estados
  const [showFinishModal,setShowFinishModal]=useState(false)
  
  const finishingAt=useRef(0)
  const [finishSurvey,setFinishSurvey]=useState<Record<string,any>>({
    sessionRating: 3, pain: 0, painZone: '', painDetail: '', comment: ''
  })
  const methodIdRef=useRef<TrainingMethodId|null>(null)
  const [sessionStartTime,setSessionStartTime]=useState<string>(new Date().toISOString())
  const [sessionId,setSessionId]=useState<string>('')
  const sessionStatusRef=useRef<SessionStatus>('PLANNED')
  sessionStatusRef.current = sessionStatus
  const [musclePct,setMusclePct]=useState<Array<{m:string; pct:number}>>([])
  const [finishError,setFinishError]=useState<string>('')
  const loadedRef = useRef<string>('')
  const [sessionExercises,setSessionExercises]=useState<SessionExercise[]>([])
  const [seIdByIndex,setSeIdByIndex]=useState<Record<number,string>>({})
  const [readyPlan,setReadyPlan]=useState<null | { sessionId: string|null; routineName: string; plannedDayN: number|null; plannedName: string; actualDayN: number|null; actualName: string; reason?: string; comment?: string; isResume: boolean; pending?: { routineId: string; exercises: Array<{exId:string;name:string;sets:number;reps:number;weight:number;muscle?:string;gifUrl?:string}>; weekNumber: number } }>(null)
  const [showCancel,setShowCancel]=useState(false)
  const [cancelReason,setCancelReason]=useState('')
  const [cancelComment,setCancelComment]=useState('')
  const [showAbandon,setShowAbandon]=useState(false)
  const [abandonReason,setAbandonReason]=useState('')
  const [abandonComment,setAbandonComment]=useState('')
  const [showAddEx,setShowAddEx]=useState(false)
  const [addExOptions,setAddExOptions]=useState<Gym.Exercise[]>([])
  const [addExReason,setAddExReason]=useState('')
  const [addExComment,setAddExComment]=useState('')
  const [swapReason,setSwapReason]=useState('')
  const [swapComment,setSwapComment]=useState('')

  // Variant picker state
  const [showVariantPicker,setShowVariantPicker]=useState(false)
  const [variantContext,setVariantContext]=useState<VariantContext | null>(null)
  
  // Pain toggle state
  const [currentPainExercise,setCurrentPainExercise]=useState<{exerciseId:string; exerciseName:string; seId:string} | null>(null)

  const load = async () => {
      const { getActiveSession, getSession, getSessionExercises: getSE } = await import('@/services/training/sessionStore')
      // PRIORIDAD 1: sesion activa por activeSessionId (nunca calendario por encima).
      const active = await getActiveSession().catch(() => null)
      if (active && active.calendarDate === today && ['READY', 'IN_PROGRESS', 'PAUSED', 'COMPLETING'].includes(active.sessionStatus)) {
        // Verificar que la sesion tenga ejercicios en la DB antes de usarla.
        const seCount = await getSE(active.sessionId).then(l => l.length).catch(() => 0)
        if (seCount > 0) {
          // Verificar si la rutina de la sesion activa coincide con la rutina de hoy
          const { getAllRoutines, getActiveRoutineId } = await import('@/services/storage/routineStore')
          const rawList = await getAllRoutines()
          const activeId = await getActiveRoutineId()
          const todayRoutine = rawList?.find((r: { id: string }) => r.id === activeId) || rawList?.[0]
          const dow = new Date().getDay()
          const override = await getOverrideDay(today)
          const cyc = todayRoutine?.cycle
          const todayDayN = override ? Number(override) : cyc?.weekMap?.[dow] ?? null
          // Si la sesion activa es de otro dia de rutina, limpiar y crear nueva
          if (active.actualDay != null && todayDayN != null && active.actualDay !== todayDayN) {
            const { clearActiveSession } = await import('@/services/training/sessionStore')
            clearActiveSession()
          } else {
            if (active.sessionStatus === 'READY') {
              setReadyPlan({ sessionId: active.sessionId, routineName: active.routineName || 'Rutina', plannedDayN: active.plannedDay, plannedName: active.plannedDayName || '', actualDayN: active.actualDay, actualName: active.actualDayName || '', isResume: false })
            }
            setSession(active)
setSessionStatus(active.sessionStatus)
setRutinaName(active.routineName || 'Rutina')
setRoutineId(active.routineId)
setDayName(active.actualDayName || (active.actualDay != null ? `Día N°${active.actualDay}` : 'Descanso'))
setPlannedDayN(active.plannedDay)
setActualDayN(active.actualDay)
setPlannedName(active.plannedDayName || '')
setWeekNumber(active.weekNumber || 1)
setSessionStartTime(active.startedAt || active.createdAt)
setSessionId(active.sessionId)
setSessionStatus(active.sessionStatus)
// Exercise initialization will be triggered by useExerciseState hook
            return
          }
        } else {
          // Sesion sin ejercicios en DB → limpiar y caer al plan de rutina.
          const { clearActiveSession } = await import('@/services/training/sessionStore')
          clearActiveSession()
        }
      }
      if (active && active.calendarDate !== today && ['IN_PROGRESS', 'PAUSED', 'READY'].includes(active.sessionStatus)) {
        // Banner por sessionId (no por fecha): continuar / finalizar / abandonar.
        const { getSessionExercises } = await import('@/services/training/sessionStore')
        const seList = await getSessionExercises(active.sessionId).catch(() => [])
        setResumeBanner({ sessionId: active.sessionId, calendarDate: active.calendarDate, routineName: active.routineName || 'Rutina', dayName: active.actualDayName || '', status: active.sessionStatus, exerciseCount: seList.length } as never)
      }
      // PRIORIDAD 2: espejos legacy (migran a plan pendiente, NO crean sesion).
      const legacyMirror: unknown = (() => { try {
        const raw = localStorage.getItem(`session:active:${today}`)
        return raw ? JSON.parse(raw) : null
      } catch { return null } })()
      const legacy = legacyMirror as null | { routineId?: string; routineName?: string; scheduledDay?: number; scheduledName?: string; dayN?: number; dayName?: string; dayChangeReason?: string; dayChangeComment?: string; exercises?: Array<{ exId?: string; id?: string; name: string; sets: number; reps: number; weight: number; muscle?: string; gifUrl?: string }> }
      if (legacy && legacy.exercises && legacy.exercises.length > 0) {
        buildPendingPlan({
          routineId: legacy.routineId || 'r1', routineName: legacy.routineName || 'Rutina',
          plannedDay: legacy.scheduledDay ?? legacy.dayN ?? null, plannedName: legacy.scheduledName ?? null,
          actualDay: legacy.dayN ?? null, actualName: legacy.dayName ?? null,
          reason: legacy.dayChangeReason, comment: legacy.dayChangeComment,
          exercises: legacy.exercises.map((x) => ({ exId: x.exId || x.id || '', name: x.name, sets: x.sets, reps: x.reps, weight: x.weight, muscle: x.muscle, gifUrl: x.gifUrl })),
        })
        return
      }
      // PRIORIDAD 3-5: rutina / calendario / descanso -> plan pendiente (COMENZAR crea la sesion).
      const { getAllRoutines: getRoutinesForPlan, getActiveRoutineId: getActiveIdForPlan } = await import('@/services/storage/routineStore')
      const rawList = await getRoutinesForPlan()
      const activeId = await getActiveIdForPlan()
      const activeR: unknown = (rawList as Array<{ id: string }> | null)?.find((r) => r.id === activeId) || (rawList as Array<unknown>)?.[0]
      const prof = await db.userProfile.get('me') as unknown
      const routine = (activeR as { cycle?: unknown; name?: string; id?: string } | null) || { cycle: (prof as { cycle?: unknown })?.cycle, name: 'Rutina' }
      const cycle = (routine as { cycle?: unknown }).cycle || getCycleFromProfile(prof as never)
      methodIdRef.current = (cycle as CycleConfig)?.methodId as TrainingMethodId || null
      const cyc = cycle as CycleConfig
      const dow = new Date().getDay()
      const override = await getOverrideDay(today)
      const n = override != null ? override : cyc.weekMap[dow]
      const schedN = cyc.weekMap[dow] ?? null
      const schedName = schedN ? cyc.trainingDays.find((dd) => dd.n === schedN)?.name || `Día N°${schedN}` : null
      const dname = n ? cyc.trainingDays.find((dd) => dd.n === n)?.name || `Día N°${n}` : 'Descanso'
      const changed = await getChangedData(today) as { changeReason?: string; changeComment?: string } | null
      const { getDayExercises } = await import('@/utils/routine')
      const found = await getDayExercises(n, cyc)
      setRutinaName((routine as { name?: string }).name || 'Rutina')
      setRoutineId((routine as { id?: string }).id || 'r1')
      setDayName(dname)
      setPlannedDayN(schedN)
      setActualDayN(n)
      setPlannedName(schedName || '')
      if (found.length === 0) { setExs([]); setSessionStatus('PLANNED'); setReadyPlan(null); return }
      buildPendingPlan({
        routineId: (routine as { id?: string }).id || 'r1', routineName: (routine as { name?: string }).name || 'Rutina',
        plannedDay: schedN, plannedName: schedName, actualDay: n, actualName: dname,
        reason: changed?.changeReason || (override ? 'Cambio de día desde Inicio' : undefined),
        comment: changed?.changeComment,
        exercises: found.map((x) => ({ exId: x.exId, name: x.name, sets: x.sets, reps: x.reps, weight: x.weight, muscle: x.muscle as string, gifUrl: (x as { gifUrl?: string }).gifUrl })),
      })
  }

  const buildPendingPlan = (p: {
    routineId: string; routineName: string;
    plannedDay: number | null; plannedName: string | null;
    actualDay: number | null; actualName: string | null;
    reason?: string; comment?: string;
    exercises: Array<{ exId: string; name: string; sets: number; reps: number; weight: number; muscle?: string; gifUrl?: string }>;
  }) => {
    setSession(null); setSessionId(''); setSessionStatus('PLANNED')
    setRutinaName(p.routineName); setRoutineId(p.routineId)
    setDayName(p.actualName || 'Descanso')
    setPlannedDayN(p.plannedDay); setActualDayN(p.actualDay); setPlannedName(p.plannedName || '')
    const weekNumber = (() => { try {
      const rawListSync = import('@/services/storage/routineStore')
      // Use a cached value if available, otherwise default to 1
      return 1 // Will be recalculated async below
    } catch { return 1 } })()
    // Recalculate week number asynchronously
    import('@/services/storage/routineStore').then(({ getAllRoutines, getActiveRoutineId }) =>
      Promise.all([getAllRoutines(), getActiveRoutineId()]).then(([list, aid]) => {
        const a = list?.find((r: { id: string }) => r.id === aid)
        const start = new Date((a?.cycle?.startDate as string) || today)
        setWeekNumber(Math.max(1, Math.floor((new Date(today).getTime() - start.getTime()) / (7 * 86400000)) + 1))
      })
    )
    setWeekNumber(weekNumber)
    setExs(p.exercises.map((x) => ({ ...x, plannedSets: x.sets })))
    setCurrent(0); setDone({}); setSkipped({}); setLogs({}); setSeIdByIndex({})
    setReadyPlan({
      sessionId: null, routineName: p.routineName,
      plannedDayN: p.plannedDay, plannedName: p.plannedName || '',
      actualDayN: p.actualDay, actualName: p.actualName || '',
      reason: p.reason, comment: p.comment, isResume: false,
      pending: { routineId: p.routineId, exercises: p.exercises, weekNumber },
    })
  }

  // carga inicial + escucha cambios de día desde Inicio
  useEffect(()=>{
    migrateSessionOverridesFromLocalStorage()
    ensureSeeded().then(()=> loadSession())
    const onFocus = ()=> loadSession()
    const onCustom = ()=>{ loadedRef.current=''; loadSession() }
    const onBeforeUnload = (e: BeforeUnloadEvent)=>{
      if(['IN_PROGRESS','PAUSED','COMPLETING'].includes(sessionStatusRef.current)){
        e.preventDefault(); e.returnValue = ''
      }
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('routineChange', onCustom as EventListener)
    window.addEventListener('beforeunload', onBeforeUnload)
    return ()=>{ window.removeEventListener('focus', onFocus); window.removeEventListener('routineChange', onCustom as EventListener); window.removeEventListener('beforeunload', onBeforeUnload) }
  },[loadSession])

  const cur = exs[current]

  // Pain alert hook
  const { painAlert, dismissPainAlert } = usePainAlert({
    currentExercise: cur,
    enabled: true
  })

  const tableInitial = useMemo(()=>{
    const arr = logs[current] || []
    const completed: Record<number,{weight:number;reps:number}> = {}
    const skipped: number[] = []
    arr.forEach((v: unknown, i: number)=>{
      if(!v) {return}
      const s = v as { skipped?: boolean; weight?: number; reps?: number }
      if(s.skipped) {skipped.push(i)}
      else {completed[i] = { weight: Number(s.weight ?? 0), reps: Number(s.reps ?? 0) }}
    })
    return { completed, skipped }
  },[logs, current])
  const progress = exs.length ? Math.round(Object.keys(done).filter(k=>done[Number(k)]).length / exs.length * 100) : 0
  const completedSets = Object.keys(logs).reduce((sum, k) => sum + (logs[Number(k)]?.length ?? 0), 0)
  const totalSets = exs.reduce((sum, ex) => sum + (ex.plannedSets ?? ex.sets), 0)

  const nextCoach = async (nextIdx:number)=>{
    if(nextIdx>=exs.length) {return}
    const nxt = exs[nextIdx]
    const { unifiedCompletedSets } = await import('@/services/history')
    const hist = (await unifiedCompletedSets(nxt.exId)).slice(-3)
    if(hist.length===0){
      setCoach({ reason:`Primera vez con ${nxt.name}. Empezamos conservador con ${nxt.weight}kg y vemos cómo respondés.`, suggested_weight:nxt.weight, isQuestion:false })
    } else {
      const ctx:any = await buildTrainingContext(nxt.exId, nxt.name)
      // fatiga acumulada
      const totalDone = Object.keys(done).length
      ctx.fatiga = totalDone>=2 ? 'moderada' : ctx.fatiga
      const rec = await aiService.generateRecommendation(ctx).catch(()=> ({reason:`Vamos con ${nxt.weight}kg × ${nxt.reps}.`, suggested_weight:nxt.weight}))
      setCoach(rec)
    }
  }

  const handleSetDone = async (setIdx:number, w:number, r:number, neg?:{reps:number; weight:number}, obs?:string)=>{
    if(!cur || !session) {return}
    const seId = seIdByIndex[current]
    if(!seId) { setFinishError('Sin SessionExercise para este ejercicio: recargá la pestaña.'); return }
    const { confirmSetRecord, saveNegatives, saveExerciseObservation, updateSession, getSetRecords } = await import('@/services/training/sessionStore')
    const setType = ((cur.seriesType || 'Normal') as string).toUpperCase().replace(' ', '_') as import('@/services/training/domain').SetType
    // upsert idempotente por setRecordId: recargar nunca duplica (§18)
    await confirmSetRecord({
      sessionId: session.sessionId, sessionExerciseId: seId, exerciseId: cur.exId,
      order: setIdx + 1, actualReps: r, actualWeight: w, setType, observation: obs || undefined,
    })
    // negativas: solo existen si el usuario las registra; una por ejercicio (§27)
    if(neg && (Number(neg.reps) > 0 || Number(neg.weight) > 0)){
      const existing = await db.negativeSets.where('sessionExerciseId').equals(seId).toArray().catch(()=>[])
      if(existing.length===0){
        await saveNegatives({ sessionId: session.sessionId, sessionExerciseId: seId, exerciseId: cur.exId, quantity: Number(neg.reps)||0, weight: Number(neg.weight)||0, observation: obs || undefined })
      }
    }
    if(obs) {await saveExerciseObservation({ sessionId: session.sessionId, sessionExerciseId: seId, exerciseId: cur.exId, text: obs }).catch(()=>null)}
    // vista local
    const arr = [...(logs[current] || [])]
    const now = new Date().toISOString()
    arr[setIdx] = { 
      weight: w, 
      reps: r, 
      setType: 'NORMAL',
      obs,
      setRecordId: '',
      sessionId: session?.sessionId || '',
      sessionExerciseId: seId,
      exerciseId: cur?.exId || '',
      order: setIdx,
      plannedReps: 0,
      plannedWeight: 0,
      actualReps: r,
      actualWeight: w,
      status: 'COMPLETED' as const,
      createdAt: now,
      updatedAt: now,
    }
    const nlogs = {...logs, [current]: arr}
    setLogs(nlogs)
    await updateSession(session.sessionId, { currentExerciseId: cur.exId, currentExerciseIndex: current, currentSetIndex: setIdx + 1 }).catch(()=>null)
    const recs = await getSetRecords(seId).catch(()=>[])
    const plannedCount = exs[current]?.plannedSets ?? cur.sets
    const doneCount = recs.filter(x=> x.status==='COMPLETED').length
    if(doneCount>=plannedCount && plannedCount>0){
      setDone({...done, [current]: true})
      saveDecision({ date: today, type:'accept', exercise: cur.name, reason: coach?.reason, contextSnapshot:{weight:w,reps:r}})
      const methodRest = methodIdRef.current ? (getMethod(methodIdRef.current)?.defaults.restSeconds ?? 90) : 90
      startRest(methodRest); try{ if(navigator.vibrate) {navigator.vibrate(12)} }catch{ /* noop */ }
      if(current < exs.length-1){
        // No auto-advance: user clicks "Continuar" button
      }
      // guardar ejercicio NO finaliza la sesion: se usa FINALIZAR ENTRENAMIENTO
    }
  }

  const runSafetyCheck = async (painValue?: number) => {
    try{
      const profile = await db.userProfile.get('me')
      const today2 = new Date().toISOString().slice(0,10)
      const rec: any = await db.recoveryChecks.get(today2) || JSON.parse(localStorage.getItem('recovery:'+today2)||'null')
      const { check } = await import('@/services/ai/safetyLayer')
      const result = await check({
        recovery: rec ? { pain: rec.pain ?? 0, fatigue: rec.fatigue ?? 5, energy: rec.energy ?? 5 } : undefined,
        sessionPain: painValue,
        userProfile: profile || {},
        qaHistory: undefined,
      })
      if(result.severity !== 'info'){
        setSafetyAlert({ severity: result.severity, message: result.message, referral: result.professionalReferral })
      } else {
        setSafetyAlert(null)
      }
    }catch{ /* noop */ }
  }

  const openViewer = async ()=>{
    if(!cur) {return}
    if(cur.exId.startsWith('custom/')){
      try{
        const { getCustomExercise } = await import('@/services/training/customExercises')
        const c = await getCustomExercise(cur.exId)
        if(c){ setViewer({ ...c, gifUrl: c.gifUrl || c.imageDataUrl || '' } as unknown as Gym.Exercise); return }
      }catch{ /* noop */ }
    }
    const seedMap:any = {
      'ex-001':'pectorals/barbell-bench-press',
      'ex-002':'pectorals/dumbbell-bench-press',
      'ex-003':'pectorals/cable-bench-press',
      'ex-004':'lats/pull-up',
      'ex-005':'lats/cable-pulldown',
      'ex-006':'quads/barbell-squat',
      'ex-007':'quads/leg-press',
      'ex-008':'hamstrings/barbell-deadlift',
      'ex-010':'delts/barbell-military-press'
    }
    if(cur.exId.includes('/')){
      try{
        const [mm,slug]=cur.exId.split('/')
        const direct = await Gym.fetchOne(mm,slug).catch(()=>null)
        if(direct?.gifUrl){ setViewer(direct); return }
      }catch{}
    }
    const muscleMap:any = { pecho:'pectorals', espalda:'lats', biceps:'biceps', triceps:'triceps', hombros:'delts', piernas:'quads', cuadriceps:'quads', gluteos:'glutes', isquios:'hamstrings' }
    const m = muscleMap[(cur.muscle||'').toLowerCase()] || 'pectorals'
    try{
      const directId = seedMap[cur.exId]
      if(directId){
        const [mm,slug]=directId.split('/')
        const ex = await Gym.fetchOne(mm,slug).catch(()=>null)
        if(ex?.gifUrl){ setViewer(ex); return }
      }
      const res = await Gym.fetchByMuscle(m)
      const target = cur.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      const targetWords = target.split(/\s+/)
      let best:any=null, bestScore=-1
      for(const ex of res.exercises){
        const name = ex.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        let score=0
        for(const w of targetWords){ if(name.includes(w)) {score+=2;} if(ex.slug.includes(w)) {score+=1} }
        if(target.includes('inclinado') && name.includes('inclinado')) {score+=5}
        if(target.includes('banca') && name.includes('banca')) {score+=3}
        if(target.includes('mancuerna') && name.includes('mancuerna')) {score+=3}
        if(score>bestScore){ bestScore=score; best=ex }
      }
      if(best && bestScore>1) {setViewer(best)}
      else {setViewer({ id: cur.exId, slug: cur.exId, name: cur.name, muscle:m, bodyPart:'chest', equipment:'barbell', category:'strength', secondaryMuscles:[], instructions:[], file:'', gifUrl: cur.gifUrl||'' } as Gym.Exercise)}
    }catch{
      setViewer({ id: cur.exId, slug: cur.exId, name: cur.name, muscle:m, bodyPart:'chest', equipment:'barbell', category:'strength', secondaryMuscles:[], instructions:[], file:'', gifUrl:''} as Gym.Exercise)
    }
  }

  const loadSwapOptions = useCallback(async ()=>{
    if(!cur) {return}
    setSwapLoading(true); setSwapExplain(null)
    try{
    const muscleMap: Record<string, string> = { pecho:'pectorals', espalda:'lats', biceps:'biceps', triceps:'triceps', hombros:'delts', piernas:'quads', cuadriceps:'quads', gluteos:'glutes', isquios:'hamstrings' }
      const m = muscleMap[(cur.muscle||'').toLowerCase()] || 'pectorals'
      const res = await Gym.fetchByMuscle(m)
      let original: Gym.Exercise | null = null
      if(cur.exId.startsWith('custom/')){
        try{ const { getCustomExercise } = await import('@/services/training/customExercises'); original = await getCustomExercise(cur.exId) as unknown as Gym.Exercise }catch{ /* noop */ }
      }
      else if(cur.exId.includes('/')){
        try{ const [mm,slug]=cur.exId.split('/'); original = await Gym.fetchOne(mm,slug).catch(()=>null) as unknown as Gym.Exercise }catch{ /* noop */ }
      }
      const orig: Gym.Exercise = original || { id: cur.exId, slug: cur.exId, name: cur.name, muscle: cur.muscle || m, bodyPart: '', equipment: '', category: '', secondaryMuscles: [], instructions: [], file: '', gifUrl: cur.gifUrl || '' }
      const ids = res.exercises.map(e=>e.id)
      const [recs, logs] = await Promise.all([
        db.setRecords.where('exerciseId').anyOf(ids).toArray().catch(()=>[]),
        db.setLogs.where('exerciseId').anyOf(ids).toArray().catch(()=>[]),
      ])
      const counts: Record<string,number> = {}
      for(const r of [...recs, ...logs]){ const k=(r as {exerciseId:string}).exerciseId; counts[k]=(counts[k]||0)+1 }
      const { listCustomExercises } = await import('@/services/training/customExercises')
      const customs = await listCustomExercises('muscle', orig.muscle).catch(()=>[])
      const pool = [...res.exercises, ...(customs as unknown as Gym.Exercise[])]
      const { rankReplacements } = await import('@/services/training/similarity')
      let ranked = rankReplacements(orig, pool, (id)=> counts[id]||0).slice(0, 12)
      // Fallback: si similarity no da buenos resultados, usar substitutionEngine multi-factor
      if(ranked.length === 0 || ranked[0].score < 40){
        try{
          const { findAlternatives } = await import('@/services/ai/substitutionEngine')
          const profile = await db.userProfile.get('me')
          const reason = (swapReason === 'Molestia / dolor' ? 'pain' : swapReason === 'Falta de equipamiento' ? 'equipment' : 'user_request') as SubstitutionReason
          const subResult = await findAlternatives(cur.exId, pool, reason, profile || {})
          const mapped = subResult.alternatives.map(a => ({
            exercise: { ...a.exercise, gifUrl: a.exercise.gifUrl || '' } as Gym.Exercise,
            score: a.score,
            factors: [{ key:'reason', label:'Razón', detail:a.reason, state:'match' as const }],
            sharedMuscles: 1,
            sameEquipment: true,
            historyCount: 0,
          }))
          if(mapped.length > ranked.length) {ranked = mapped}
        }catch{ /* noop */ }
      }
      setSwapOptions(ranked)
      setShowSwap(true)
    }catch{ /* noop */ }finally{ setSwapLoading(false) }
  }, [cur, swapReason])

  const handleSwap = async (newEx:Gym.Exercise)=>{
    if(!cur || !session) {return}
    const seId = seIdByIndex[current]
    if(!seId) {return}
    const reason = swapReason || 'Cambio durante la sesión'
    const { replaceSessionExercise } = await import('@/services/training/sessionStore')
    // historial separado: el original conserva el suyo; el nuevo muestra el propio (§23)
    await replaceSessionExercise(seId, newEx.id, reason, swapComment || undefined)
    saveDecision({ date: today, type:'swap', exercise: cur.name, reason:`Cambiado a ${newEx.name}: ${reason}`, contextSnapshot:{ from:cur.exId, to:newEx.id }})
    setExs(prev=> prev.map((ex,i)=> i===current ? { ...ex, exId: newEx.id, name: newEx.name, muscle: newEx.muscle, gifUrl: newEx.gifUrl, swappedFrom: cur.exId, replaced: true, plannedSets: ex.plannedSets ?? ex.sets, seId } : ex ))
    setLogs((p)=>{ const n={...p}; delete n[current]; return n })
    setDone((p)=>{ const n={...p}; delete n[current]; return n })
    setShowSwap(false)
    setSwapOptions([])
    setSwapReason(''); setSwapComment('')
    try{ localStorage.removeItem(`exstate:${today}:${cur.exId}`) }catch{ /* noop */ }
    const ctx = await buildTrainingContext(newEx.id, newEx.name)
    const rec = await aiService.generateRecommendation(ctx).catch(()=> ({reason:`Vamos con ${cur.weight}kg x ${cur.reps}.`, suggested_weight:cur.weight}))
    setCoach(rec)
  }

  // Pain Toggle Handlers
  const handleOpenPainToggle = useCallback((exerciseId: string, exerciseName: string, seId: string) => {
    setCurrentPainExercise({ exerciseId, exerciseName, seId })
  }, [])

  const handlePainChange = useCallback(async (level: string, zone?: string, notes?: string) => {
    if (!currentPainExercise) return
    // The PainToggle component handles saving to PainLog internally
    // We just need to update local state if needed
    console.log('Pain level changed:', level, 'zone:', zone)
  }, [currentPainExercise])

  const handlePainVariantRequest = useCallback(() => {
    if (!currentPainExercise) return
    const context: VariantContext = {
      originalExerciseId: currentPainExercise.exerciseId,
      reason: 'pain',
      painZone: currentPainExercise.exerciseName, // will be overridden by pain zone
      painLevel: 'moderate', // default, will be updated by pain toggle
    }
    setVariantContext(context)
    setShowVariantPicker(true)
    setCurrentPainExercise(null)
  }, [])

  // Variant Picker Handlers
  const handleVariantSelect = useCallback(async (variant: VariantOption, decision: 'accepted' | 'modified') => {
    if (!cur || !session) return
    const seId = seIdByIndex[current]
    if (!seId) return

    const reason = variantContext?.reason === 'pain' ? 'Molestia / dolor' : 'Cambio durante la sesión'
    const { replaceSessionExercise } = await import('@/services/training/sessionStore')
    await replaceSessionExercise(seIdByIndex[current], variant.exerciseId, reason, `Variante seleccionada: ${variant.name} (${variant.reason})`)

    saveDecision({ 
      date: today, 
      type: 'swap', 
      exercise: cur.name, 
      reason: `Variante por ${variantContext?.reason}: ${variant.name} (score: ${variant.score}%)`, 
      contextSnapshot: { from: cur.exId, to: variant.exerciseId, variant: variant.name, score: variant.score }
    })

    // Update local state
    const variantEx = exs.find(e => e.exId === variant.exerciseId)
    setExs(prev => prev.map((ex, i) => i === current ? { 
      ...ex, 
      exId: variant.exerciseId, 
      name: variant.name, 
      muscle: variantEx?.muscle || '', 
      gifUrl: variantEx?.gifUrl, 
      swappedFrom: cur.exId, 
      replaced: true, 
      plannedSets: ex.plannedSets ?? ex.sets, 
      seId 
    } : ex ))
    setLogs((p) => { const n = {...p}; delete n[current]; return n })
    setDone((p) => { const n = {...p}; delete n[current]; return n })
    
    setShowVariantPicker(false)
    setVariantContext(null)
    
    // Refresh coach recommendation
    const ctx = await buildTrainingContext(variant.exerciseId, variant.name)
    const rec = await aiService.generateRecommendation(ctx).catch(() => ({ reason: `Vamos con ${cur.weight}kg x ${cur.reps}.`, suggested_weight: cur.weight }))
    setCoach(rec)
  }, [cur, session, current, today, variantContext])

  const handleOpenVariantPicker = useCallback((context: VariantContext) => {
    setVariantContext(context)
    setShowVariantPicker(true)
  }, [])

  const handleSkipWithReason = ()=>{
    setShowSkipReason(true)
  }

  const confirmSkip = async ()=>{
    if(!cur || !session) {return}
    const seId = seIdByIndex[current]
    const reason = skipReason.trim() || 'Decidí no realizarlo'
    if(seId){
      const { skipSessionExercise } = await import('@/services/training/sessionStore')
      await skipSessionExercise(seId, reason, undefined).catch(()=>null)
    }
    saveDecision({ date: today, type:'skip', exercise: cur.name, motive: reason, reason: coach?.reason, contextSnapshot:{} })
    setSkipReasons((p)=> ({...p, [current]: reason}))
    setSkipped((p)=> ({...p, [current]: true}))
    setDone({...done, [current]: true})
    try{ localStorage.removeItem(`exstate:${today}:${cur.exId}`) }catch{ /* noop */ }
    setShowSkipReason(false)
    setSkipReason('')
    if(current < exs.length-1) { setCurrent(current+1); nextCoach(current+1) }
    // si era el ultimo, el usuario finaliza con el boton FINALIZAR ENTRENAMIENTO
  }

  // Resumen calculado: ejercicios/series planificadas vs realizadas, reps, volumen, duracion
  const computeSummary = () => {
    const plannedEx = exs.length
    const doneIdx: number[] = []
    const pendingIdx: number[] = []
    const skippedIdx: number[] = []
    exs.forEach((_,i)=> { if(skipped[i]) {skippedIdx.push(i);} else if(done[i]) {doneIdx.push(i);} else {pendingIdx.push(i)} })
    let plannedSets = 0, completedSets = 0, totalReps = 0, totalVol = 0
    const perEx = exs.map((ex,i)=>{
      const planned = ex.plannedSets ?? ex.sets
      plannedSets += planned
      const arr = logs[i] || []
      const real = arr.filter(Boolean)
      completedSets += real.length
      let r = 0, v = 0
      for(const s of real){ const rr = Number(s?.reps||0), ww = Number(s?.weight||0); r += rr; v += rr*ww }
      totalReps += r; totalVol += v
      return {
        i, exId: ex.exId, name: ex.name, plannedSets: planned, completedSets: real.length,
        reps: r, volume: Math.round(v*10)/10, done: !!done[i],
        replaced: !!ex.swappedFrom, swappedFrom: ex.swappedFrom, skipped: !!skipped[i],
        modified: (ex.plannedSets ?? ex.sets) !== ex.sets,
      }
    })
    const exPct = plannedEx ? Math.round(doneIdx.length/plannedEx*100) : 0
    const setPct = plannedSets ? Math.round(completedSets/plannedSets*100) : 0
    const durMin = Math.max(0, Math.round((Date.now()-new Date(sessionStartTime).getTime())/60000))
    return {
      plannedEx, completedEx: doneIdx.length, pendingIdx, skippedIdx, perEx,
      plannedSets, completedSets, totalReps, totalVol: Math.round(totalVol*10)/10,
      exPct, setPct, durMin,
      replaced: exs.filter(e=>e.swappedFrom).length,
      modified: exs.filter(e=> (e.plannedSets ?? e.sets) !== e.sets).length,
    }
  }

  // IN_PROGRESS -> COMPLETING: calcula resumen, detecta pendientes, % muscular, alertas, progreso
  const openFinishModal = async () => {
    if(exs.length===0) {return}
    if(Date.now()-finishingAt.current<3000) {return}
    finishingAt.current = Date.now()
    setFinishError('')
    const s = computeSummary()
    const skippedWithReason: Record<number,string> = {}
    for(const i of s.skippedIdx){ skippedWithReason[i] = skipReasons[i] || '' }
    const init: Record<number,{reason:string; comment:string}> = { ...pendingReasons }
    for(const i of s.pendingIdx){
      if(!init[i]) {init[i] = { reason: '', comment: skipReasons[i] || '' }}
      else if(!init[i].comment && skipReasons[i]) {init[i] = { ...init[i], comment: skipReasons[i] }}
    }
    setPendingReasons(init)
    // % muscular real (volumen por musculo de series ejecutadas)
    try{
      const volByMuscle: Record<string,number> = {}
      exs.forEach((ex,i)=>{
        const arr = (logs[i]||[]).filter(Boolean)
        if(arr.length===0) {return}
        let v = 0
        for(const st of arr) {v += Number(st?.reps||0)*Number(st?.weight||0)}
        const m = (ex.muscle || 'general').toLowerCase()
        volByMuscle[m] = (volByMuscle[m]||0)+v
      })
      const tot = Object.values(volByMuscle).reduce((a,b)=>a+b,0)
      setMusclePct(Object.entries(volByMuscle).map(([m,v])=> ({ m, pct: tot? Math.round(v/tot*100):0 })).sort((a,b)=>b.pct-a.pct))
    }catch{}
    // Alertas volumen/frecuencia vs historial (ultimas 3 sesiones del mismo musculo)
    try{
      const alerts: string[] = []
      const muscles = Array.from(new Set(exs.map(e=> (e.muscle||'general').toLowerCase())))
      for(const m of muscles){
        const exIds = exs.filter(e=> (e.muscle||'general').toLowerCase()===m).map(e=>e.exId)
        if(exIds.length===0) {continue}
        const legacyPast = await db.setLogs.where('exerciseId').anyOf(exIds).filter(l=> l.completed && (l.createdAt||'').slice(0,10)!==today).toArray().catch(()=>[])
        const officialPast = await db.setRecords.where('exerciseId').anyOf(exIds).toArray().then((rows)=> (rows as Array<{status:string; completedAt?:string; createdAt:string}>).filter(r=> r.status==='COMPLETED' && (r.completedAt||r.createdAt||'').slice(0,10)!==today).map(r=> ({ createdAt: r.completedAt||r.createdAt }))).catch(()=>[])
        const past = [...legacyPast, ...officialPast]
        const byDay: Record<string,number> = {}
        for(const l of past){ const d=(l.createdAt||'').slice(0,10); byDay[d]=(byDay[d]||0)+1 }
        const days = Object.keys(byDay).sort().slice(-3)
        if(days.length>=2){
          const avg = days.reduce((a,d)=>a+byDay[d],0)/days.length
          const todaySets = exs.reduce((a,ex,i)=> a + (((ex.muscle||'general').toLowerCase()===m) ? (logs[i]||[]).filter(Boolean).length : 0), 0)
          if(todaySets > avg*1.5) {alerts.push(`Volumen elevado en ${m}: ${todaySets} series hoy vs prom. ${avg.toFixed(1)} por sesión.`)}
          const lastDay = days[days.length-1]
          const gapDays = Math.round((new Date(today).getTime()-new Date(lastDay).getTime())/86400000)
          if(gapDays<=1) {alerts.push(`Frecuencia alta en ${m}: última sesión ${lastDay} (hace ${gapDays} día(s)).`)}
        }
      }
      // progreso por ejercicio vs ultima ejecucion real (excluye hoy)
      const prog: Record<string,string> = {}
      for(const ex of exs){
        try{
          const { getLastExecutionByExercise } = await import('@/services/history')
          const last:any = await getLastExecutionByExercise(ex.exId)
          if(last && last.date!==today && last.sets?.length){
            const arr = (logs[exs.indexOf(ex)]||[]).filter(Boolean)
            if(arr.length>0){
              const lw = Number(last.sets[0]?.weight||0), lr = Number(last.sets[0]?.reps||0)
              const cw = Number(arr[0]?.weight||0), cr = Number(arr[0]?.reps||0)
              const dw = Math.round((cw-lw)*10)/10, dr = cr-lr
              prog[ex.exId] = `Última vez ${last.date}: ${lr}x${lw}kg → hoy ${cr}x${cw}kg (${dr>=0?'+':''}${dr} reps, ${dw>=0?'+':''}${dw} kg)`
            } else {prog[ex.exId] = `Última vez ${last.date}: ${last.sets[0]?.reps}x${last.sets[0]?.weight}kg`}
          } else if(!last) {prog[ex.exId] = 'Sin registros anteriores.'}
        }catch{}
      }
      setProgressLines(prog)
      setVolumeAlerts(alerts)
    }catch{}
    // transicion controlada a COMPLETING via store central (idempotente si ya esta)
    try{
      const store = await import('@/services/training/sessionStore')
      const targetId = session?.sessionId || sessionId
      if(targetId){
        const cur = await store.getSession(targetId).catch(()=>null)
        if(cur && (cur.sessionStatus==='IN_PROGRESS' || cur.sessionStatus==='PAUSED' || cur.sessionStatus==='READY')){
          const nx = await store.transitionSession(targetId, 'COMPLETING')
          setSession(nx); setSessionStatus('COMPLETING'); setSessionId(nx.sessionId)
        } else {setSessionStatus('COMPLETING')}
      } else {setSessionStatus('COMPLETING')}
    }catch(e:any){ setFinishError(e?.message || 'No se pudo pasar a COMPLETING') }
    setShowFinishModal(true)
  }

  // Cierre atomico COMPLETING -> COMPLETED/PARTIAL. Si falla el guardado NO finaliza.
  // Cierre atomico COMPLETING -> COMPLETED/PARTIAL (§17: si falla, queda COMPLETING y reintentable).
  const confirmFinish = async () => {
    if(isSaving) {return}
    setIsSaving(true)
    setFinishError('')
    try{
      const store = await import('@/services/training/sessionStore')
      // 0) Resolver sesion aunque el estado local se haya perdido (recarga, foco, etc.)
      let sess = session
      const targetId = sess?.sessionId || sessionId
      if(!sess && targetId){
        sess = await store.getSession(targetId).catch(()=>null)
        if(sess){ setSession(sess); setSessionId(sess.sessionId) }
      }
      if(!sess){
        // Recuperacion: crea la sesion desde lo visible para no perder el trabajo
        if(!routineId || exs.length===0) {throw new Error('Sin sesión activa: recargá la pestaña Entrenamiento antes de finalizar.')}
        const created = await store.createSession({ routineId, routineName: rutinaName||'Rutina', plannedDay: plannedDayN, plannedDayName: plannedName||null, actualDay: actualDayN, actualDayName: dayName||null, calendarDate: today, weekNumber, plannedExercises: exs.map(x=>({exId:x.exId,name:x.name,sets:x.plannedSets??x.sets,reps:x.reps,weight:x.weight,muscle:x.muscle,gifUrl:x.gifUrl})) })
        sess = await store.transitionSession(created.sessionId,'IN_PROGRESS')
        setSession(sess); setSessionId(sess.sessionId)
      }
      // Asegurar COMPLETING de forma idempotente antes de cerrar
      const fresh0 = await store.getSession(sess.sessionId).catch(()=>null)
      if(fresh0 && (fresh0.sessionStatus==='IN_PROGRESS'||fresh0.sessionStatus==='PAUSED'||fresh0.sessionStatus==='READY')){
        sess = await store.transitionSession(sess.sessionId,'COMPLETING'); setSession(sess); setSessionStatus('COMPLETING')
      } else if(fresh0 && fresh0.sessionStatus!=='COMPLETING'){
        throw new Error(`La sesión está en estado ${fresh0.sessionStatus}: no se puede finalizar desde ahí.`)
      }
      const seList = await store.getSessionExercises(sess.sessionId)
      const allSets: import('@/services/training/domain').SetRecord[] = []
      for(const se of seList){ const rs = await store.getSetRecords(se.sessionExerciseId).catch(()=>[]); allSets.push(...rs) }
      const s = computeSummary()
      for(const i of s.pendingIdx){
        const pr = pendingReasons[i]
        if(!pr || !pr.reason){ setFinishError(`Falta motivo para "${exs[i]?.name || 'ejercicio'}".`); setIsSaving(false); return }
      }
      // pendientes declarados -> SKIPPED con motivo (conserva series hechas, §6)
      for(const i of s.pendingIdx){
        const seId = seIdByIndex[i]
        const pr = pendingReasons[i]
        if(seId) {await store.skipSessionExercise(seId, pr.reason, pr.comment || undefined).catch(()=>null)}
      }
      const { validateSurvey } = await import('@/services/training/domain')
      const fs = finishSurvey || {}
      const surveyInput = {
        sessionId: sess.sessionId, userId: 'me', calendarDate: today,
        sessionRating: Number(fs.sessionRating ?? 3),
        pain: Number(fs.pain ?? 0),
        painZone: String(fs.painZone || ''),
        painDetail: String(fs.painDetail || ''),
        comment: String(fs.comment || ''),
      }
      const surveyErrs = validateSurvey(surveyInput)
      if(surveyErrs.length>0){ setFinishError('Encuesta incompleta: ' + surveyErrs.join(', ')); setIsSaving(false); return }
      const status = (s.pendingIdx.length===0 && s.skippedIdx.length===0) ? 'COMPLETED' : 'PARTIAL'
      // 1) encuesta primero (fuente única PostWorkoutSurvey)
      const survey = await store.saveSurvey(surveyInput)
      // 2) contadores recalculados desde registros (no de la vista)
      const { completionOf, volumeOf } = await import('@/services/training/metrics')
      const freshSE = await store.getSessionExercises(sess.sessionId)
      const freshSets: import('@/services/training/domain').SetRecord[] = []
      for(const se of freshSE){ freshSets.push(...await store.getSetRecords(se.sessionExerciseId).catch(()=>[])) }
      const comp = completionOf(freshSE, freshSets)
      const vol = volumeOf(freshSets)
      const changed = await getChangedData(today) as { changeReason?: string; changeComment?: string } | null
      await store.updateSession(sess.sessionId, {
        completedExerciseCount: comp.completedEx,
        skippedExerciseCount: freshSE.filter(e=> e.status==='SKIPPED').length,
        modifiedExerciseCount: s.modified,
        replacedExerciseCount: freshSE.filter(e=> e.status==='REPLACED').length,
        extraExerciseCount: freshSE.filter(e=> e.status==='EXTRA').length,
        plannedSets: comp.plannedSets, completedSets: comp.completedSets,
        totalReps: vol.reps, totalVolume: vol.volume,
        actualMuscleGroups: Array.from(new Set(exs.map(e=> e.muscle || 'general'))),
        generalObservation: String(fs.comment || ''),
        surveyId: survey.surveyId,
        dayChange: (changed?.changeReason || sess.dayChange?.reason) ? { reason: changed?.changeReason || sess.dayChange?.reason || '', comment: changed?.changeComment ?? sess.dayChange?.comment, at: new Date().toISOString() } : sess.dayChange,
      })
      // 3) Tanner: regla §12 antes de transicionar
      const { validateBeforeFinish } = await import('@/services/training/domain')
      const cur = await store.getSession(sess.sessionId)
      if(!cur) {throw new Error('La sesión desapareció del almacén.')}
      const items = await store.getSessionExercises(sess.sessionId)
      const preErrs = validateBeforeFinish({ ...cur, sessionStatus: status }, items)
      if(preErrs.length>0) {throw new Error(preErrs.join(' · '))}
      // 4) transicion final + semana + memoria (si algo falla acá, el catch mantiene COMPLETING)
      await store.transitionSession(sess.sessionId, status)
      try{
        const seqId = `seq-${routineId}-w${weekNumber}`
        const prev: unknown = await db.weeklySequences.get(seqId).catch(()=>null)
        const p = (prev || {}) as { completedDays?: number[]; partialDays?: number[]; plannedDays?: number[]; createdAt?: string }
        const done_days = Array.from(new Set([...(p.completedDays||[]), ...(actualDayN!=null?[actualDayN]:[])]))
        await db.weeklySequences.put({ id: seqId, cycleId: routineId, weekNumber, startDate: '', plannedDays: p.plannedDays||[], completedDays: done_days, partialDays: status==='PARTIAL' ? [...(p.partialDays||[]), ...(actualDayN!=null?[actualDayN]:[])] : (p.partialDays||[]), createdAt: p.createdAt || new Date().toISOString() })
      }catch{ /* noop */ }
      try{ await db.coachMemory.put({ id: `obs-${today}`, type: 'observation', date: today, sessionId: sess.sessionId, sessionStatus: status, routineName: rutinaName }) }catch{ /* noop */ }
      for(const ex of exs){ try{ localStorage.removeItem(`exstate:${today}:${ex.exId}`) }catch{ /* noop */ } }
      try{ localStorage.setItem(`althea:result:${today}`, JSON.stringify({ date: today, sessionId: sess.sessionId, sessionStatus: status, exPct: s.exPct, setPct: s.setPct, completedEx: s.completedEx, plannedEx: s.plannedEx, completedSets: s.completedSets, plannedSets: s.plannedSets, totalVol: s.totalVol, totalReps: s.totalReps, durMin: s.durMin, survey: { sessionRating: Number(fs.sessionRating??3), pain: Number(fs.pain??0) }, highlights: Object.values(progressLines) })) }catch{ /* noop */ }
      try{ if(navigator.vibrate) {navigator.vibrate([20,40,20])} }catch{ /* noop */ }
      localStorage.removeItem(`session:active:${today}`)
      try{
        const { clearActiveSession } = await import('@/services/training/sessionStore')
        clearActiveSession()
      }catch{ /* noop */ }
      setSessionStatus(status)
      setShowFinishModal(false)
      setIsSaving(false)
      saveDecision({ date: today, type: status==='COMPLETED'?'accept':'skip', exercise: `Sesión ${rutinaName}`, reason: `Finalizada ${status} — Ej ${s.completedEx}/${s.plannedEx} (${s.exPct}%), Series ${s.completedSets}/${s.plannedSets} (${s.setPct}%)`, contextSnapshot:{} })
    }catch(e: unknown){ setFinishError(e instanceof Error ? e.message : 'Error al guardar. Reintentá sin perder datos.'); setIsSaving(false) }
  }

  // COMENZAR: READY existente -> IN_PROGRESS, o plan pendiente -> crea (recupera activa, §10).
  const localStartSession = async () => {
    if(isStarting) {return}
    setIsStarting(true)
    setFinishError('')
    try{
      const store = await import('@/services/training/sessionStore')
      const { saveActiveSession } = await import('@/services/training/sessionStore')
      const existing = await store.getActiveSession().catch(()=>null)
      if(existing && existing.sessionStatus==='READY'){
        const nx = await store.transitionSession(existing.sessionId, 'IN_PROGRESS')
        const prevMirror = await loadActiveSession()
        await saveActiveSession({ ...(prevMirror || {}), sessionId: nx.sessionId, calendarDate: nx.calendarDate, routineId: nx.routineId, routineName: nx.routineName || '', plannedDay: nx.plannedDay, plannedDayName: nx.plannedDayName, actualDay: nx.actualDay, actualDayName: nx.actualDayName, plannedMuscleGroups: [], actualMuscleGroups: [], exercises: prevMirror?.exercises || [], sessionStatus: 'IN_PROGRESS', statusHistory: [], startedAt: nx.startedAt, createdAt: nx.createdAt, updatedAt: nx.updatedAt } as never)
        setReadyPlan(null)
setSession(nx)
setSessionStatus(nx.sessionStatus)
setRutinaName(nx.routineName || 'Rutina')
setRoutineId(nx.routineId)
setDayName(nx.actualDayName || (nx.actualDay != null ? `Día N°${nx.actualDay}` : 'Descanso'))
setPlannedDayN(nx.plannedDay)
setActualDayN(nx.actualDay)
setPlannedName(nx.plannedDayName || '')
setWeekNumber(nx.weekNumber || 1)
setSessionStartTime(nx.startedAt || nx.createdAt)
setSessionId(nx.sessionId)
setSessionStatus(nx.sessionStatus)
        return
      }
      if(existing){ setFinishError('Ya existe una sesión activa: finalizala o abandonala antes de comenzar otra.'); return }
      const rp = readyPlan
      if(!rp?.pending){ setFinishError('Sin plan pendiente para comenzar.'); return }
      const created = await store.createSession({
        routineId: rp.pending.routineId, routineName: rp.routineName,
        plannedDay: rp.plannedDayN, plannedDayName: rp.plannedName || null,
        actualDay: rp.actualDayN, actualDayName: rp.actualName || null,
        calendarDate: today, weekNumber,
        dayChange: rp.reason ? { reason: rp.reason, comment: rp.comment } : undefined,
        plannedExercises: rp.pending.exercises,
      })
      await saveActiveSession({
        sessionId: created.sessionId, calendarDate: today, routineId: created.routineId, routineName: created.routineName || rp.routineName,
        plannedDay: created.plannedDay, plannedDayName: created.plannedDayName, actualDay: created.actualDay, actualDayName: created.actualDayName,
        plannedMuscleGroups: [], actualMuscleGroups: [], exercises: rp.pending.exercises,
        sessionStatus: 'READY', statusHistory: [], createdAt: created.createdAt, updatedAt: created.createdAt,
      } as ActiveSession)
      const nx = await store.transitionSession(created.sessionId, 'IN_PROGRESS')
      setReadyPlan(null)
setSession(nx)
setSessionStatus(nx.sessionStatus)
setRutinaName(nx.routineName || 'Rutina')
setRoutineId(nx.routineId)
setDayName(nx.actualDayName || (nx.actualDay != null ? `Día N°${nx.actualDay}` : 'Descanso'))
setPlannedDayN(nx.plannedDay)
setActualDayN(nx.actualDay)
setPlannedName(nx.plannedDayName || '')
setWeekNumber(nx.weekNumber || 1)
setSessionStartTime(nx.startedAt || nx.createdAt)
setSessionId(nx.sessionId)
setSessionStatus(nx.sessionStatus)
    }catch(e: unknown){ setFinishError(e instanceof Error ? e.message : 'No se pudo comenzar la sesión.') }finally{ setIsStarting(false) }
  }

  const localAdoptResumeSession = async (sess: { sessionId: string }, andFinish: boolean) => {
    // Reanudación EXCLUSIVA por sessionId (§11). Misma sesión, sin duplicar.
    try{
      const store = await import('@/services/training/sessionStore')
      const full = await store.getSession(sess.sessionId)
      if(!full){ setFinishError('La sesión a retomar ya no existe.'); return }
      if(full.sessionStatus==='PAUSED') {await store.transitionSession(full.sessionId, 'IN_PROGRESS')}
      setResumeBanner(null)
      const fresh = await store.getSession(sess.sessionId)
      if(fresh) {
        setSession(fresh)
        setSessionStatus(fresh.sessionStatus)
        setRutinaName(fresh.routineName || 'Rutina')
        setRoutineId(fresh.routineId)
        setDayName(fresh.actualDayName || (fresh.actualDay != null ? `Día N°${fresh.actualDay}` : 'Descanso'))
        setPlannedDayN(fresh.plannedDay)
        setActualDayN(fresh.actualDay)
        setPlannedName(fresh.plannedDayName || '')
        setWeekNumber(fresh.weekNumber || 1)
        setSessionStartTime(fresh.startedAt || fresh.createdAt)
        setSessionId(fresh.sessionId)
        setSessionStatus(fresh.sessionStatus)
      }
      try{
        const { saveActiveSession } = await import('@/services/training/sessionStore')
        const cur = await store.getSession(sess.sessionId)
        if(cur) {await saveActiveSession({ sessionId: cur.sessionId, calendarDate: cur.calendarDate, routineId: cur.routineId, routineName: cur.routineName || '', plannedDay: cur.plannedDay, plannedDayName: cur.plannedDayName, actualDay: cur.actualDay, actualDayName: cur.actualDayName, plannedMuscleGroups: [], actualMuscleGroups: [], exercises: [], sessionStatus: cur.sessionStatus, statusHistory: [], createdAt: cur.createdAt, updatedAt: cur.updatedAt } as ActiveSession)}
      }catch{ /* noop */ }
      if(andFinish) {setTimeout(()=> openFinishModal(), 400)}
    }catch(e: unknown){ setFinishError(e instanceof Error ? e.message : 'No se pudo retomar la sesión.') }
  }

  const localAbandonResume = async () => {
    setShowAbandon(true)
  }

  const confirmAbandon = async () => {
    if(!abandonReason.trim()){ setFinishError('Indicá el motivo del abandono.'); return }
    try{
      const store = await import('@/services/training/sessionStore')
      const targetId = resumeBanner?.sessionId || session?.sessionId
      if(!targetId) {return}
      await store.transitionSession(targetId, 'ABANDONED', { reason: abandonReason.trim(), comment: abandonComment.trim() || undefined })
      try{
        const { clearActiveSession } = await import('@/services/training/sessionStore')
        clearActiveSession()
      }catch{ /* noop */ }
      setResumeBanner(null)
      setShowAbandon(false)
      setAbandonReason(''); setAbandonComment('')
      setSession(null); setSessionId(''); setSessionStatus('ABANDONED')
      setExs([]); setDone({}); setSkipped({}); setLogs({})
    }catch(e: unknown){ setFinishError(e instanceof Error ? e.message : 'No se pudo abandonar la sesión.') }
  }

  const openCancelModal = () => { setCancelReason(''); setCancelComment(''); setShowCancel(true) }

  const confirmCancel = async () => {
    if(!cancelReason.trim()){ setFinishError('Indicá el motivo de la cancelación.'); return }
    try{
      const store = await import('@/services/training/sessionStore')
      const targetId = session?.sessionId || readyPlan?.sessionId || null
      if(targetId){
        const cur = await store.getSession(targetId)
        if(cur && (cur.sessionStatus==='READY' || cur.sessionStatus==='IN_PROGRESS' || cur.sessionStatus==='PAUSED')){
          await store.transitionSession(targetId, 'CANCELLED', { reason: cancelReason.trim(), comment: cancelComment.trim() || undefined })
        }
      }
      try{
        const { clearActiveSession } = await import('@/services/training/sessionStore')
        clearActiveSession()
      }catch{ /* noop */ }
      setShowCancel(false)
      setSession(null); setSessionId(''); setSessionStatus('CANCELLED'); setReadyPlan(null)
      setExs([]); setDone({}); setSkipped({}); setLogs({})
    }catch(e: unknown){ setFinishError(e instanceof Error ? e.message : 'No se pudo cancelar la sesión.') }
  }

  const togglePause = async () => {
    try{
      if(!session) {return}
      const store = await import('@/services/training/sessionStore')
      const cur = await store.getSession(session.sessionId)
      if(!cur) {return}
      if(cur.sessionStatus==='IN_PROGRESS'){ const nx = await store.transitionSession(cur.sessionId,'PAUSED'); setSession(nx); setSessionStatus('PAUSED') }
      else if(cur.sessionStatus==='PAUSED'){ const nx = await store.transitionSession(cur.sessionId,'IN_PROGRESS'); setSession(nx); setSessionStatus('IN_PROGRESS') }
    }catch(e: unknown){ setFinishError(e instanceof Error ? e.message : 'No se pudo pausar') }
  }

  // Serie individual omitida (SKIPPED) sin saltear todo el ejercicio.
  const skipSetRow = async (setIdx: number) => {
    if(!session) {return}
    const seId = seIdByIndex[current]
    if(!seId) {return}
    const { skipSetRecord, getSetRecords } = await import('@/services/training/sessionStore')
    await skipSetRecord(seId, setIdx + 1).catch(()=>null)
    const recs = await getSetRecords(seId).catch(()=>[])
    const arr = [...(logs[current] || [])]
    const now = new Date().toISOString()
    arr[setIdx] = { 
      skipped: true, 
      setRecordId: '', 
      sessionId: session?.sessionId || '', 
      sessionExerciseId: seId, 
      exerciseId: cur?.exId || '', 
      order: setIdx, 
      setType: 'NORMAL' as const, 
      plannedReps: 0, 
      plannedWeight: 0, 
      actualReps: 0, 
      actualWeight: 0, 
      status: 'SKIPPED' as const,
      createdAt: now,
      updatedAt: now,
    }
    setLogs({ ...logs, [current]: arr })
    const plannedCount = exs[current]?.plannedSets ?? 0
    if(recs.filter(x=> x.status==='COMPLETED').length + recs.filter(x=> x.status==='SKIPPED').length >= plannedCount && plannedCount>0){
      const allSkipped = recs.length>0 && recs.every(x=> x.status==='SKIPPED')
      if(!allSkipped) {setDone({ ...done, [current]: true })}
    }
  }

  // Agregar serie extra a la sesión (la rutina no cambia, §24).
  const addSetRow = async () => {
    if(!session || !cur) {return}
    const seId = seIdByIndex[current]
    if(!seId) {return}
    const { addExtraSet } = await import('@/services/training/sessionStore')
    await addExtraSet(seId, cur.reps, cur.weight, 'NORMAL').catch(()=>null)
    setExs(prev => prev.map((ex, i) => i === current ? { ...ex, sets: ex.sets + 1 } : ex))
    setDone((p)=>{ const n={...p}; delete n[current]; return n })
  }

  // Agregar ejercicio EXTRA (no planificado, §22): picker del mismo grupo + motivo.
  const openAddExtra = async () => {
    if(!cur) {return}
    setAddExReason(''); setAddExComment('')
    const muscleMap: Record<string,string> = { pecho:'pectorals', espalda:'lats', biceps:'biceps', triceps:'triceps', hombros:'delts', piernas:'quads', cuadriceps:'quads', gluteos:'glutes', isquios:'hamstrings' }
    const m = muscleMap[(cur.muscle||'').toLowerCase()] || 'pectorals'
    try{
      const res = await Gym.fetchByMuscle(m)
      const existing = new Set(exs.map(e=> e.exId))
      setAddExOptions(res.exercises.filter((e: { id: string })=> !existing.has(e.id)).slice(0, 8))
      setShowAddEx(true)
    }catch{ /* noop */ }
  }

  const confirmAddExtra = async (opt: Gym.Exercise) => {
    if(!session) {return}
    if(!addExReason.trim()){ setFinishError('Indicá el motivo del ejercicio extra.'); return }
    const { addExtraExercise, logEvent } = await import('@/services/training/sessionStore')
    const methodDef = methodIdRef.current ? getMethod(methodIdRef.current)?.defaults : undefined
    const exSets = methodDef?.setsPerExercise ?? 3
    const exReps = methodDef?.repsRange?.[1] ?? 10
    const created = await addExtraExercise(session.sessionId, { exId: opt.id, name: opt.name, sets: exSets, reps: exReps, weight: 0, muscle: opt.muscle })
    await logEvent(session.sessionId, 'EXERCISE_ADDED', { metadata: { reason: addExReason.trim(), comment: addExComment.trim() || undefined } }).catch(()=>null)
    saveDecision({ date: today, type:'modify', exercise: opt.name, reason:`EXTRA: ${addExReason.trim()}`, contextSnapshot:{} })
    setExs(prev => [...prev, { exId: opt.id, name: opt.name, sets: exSets, reps: exReps, weight: 0, muscle: opt.muscle, gifUrl: opt.gifUrl, plannedSets: 0, seId: created.sessionExerciseId, extra: true }])
    setSeIdByIndex(prev => ({ ...prev, [Object.keys(prev).length]: created.sessionExerciseId }))
    setShowAddEx(false)
    setAddExReason(''); setAddExComment('')
  }

  if(readyPlan && !session){
    const rp = readyPlan
    return (
      <div className="min-h-screen bg-transparent pb-24">
        <div className="max-w-[1440px] w-full mx-auto p-4 md:p-6 lg:p-8 space-y-4">
          <div className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">ENTRENAR · {rp.routineName}</div>
          <section className="bg-surface-container-low border border-outline-variant/50 rounded-xl p-6  relative overflow-hidden">
            <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary-container/10 rounded-full blur-3xl pointer-events-none" />
            <h2 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface relative z-10">{rp.sessionId ? 'Sesión preparada' : 'Plan de hoy'}</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-4 relative z-10">
              <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Día planificado</span><span className="font-body-md text-[15px] text-on-surface text-right">{rp.plannedDayN!=null ? `N°${rp.plannedDayN} ${rp.plannedName}` : '—'}</span>
              <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Día a realizar</span><span className="font-body-md text-[15px] text-on-surface text-right">{rp.actualDayN!=null ? `N°${rp.actualDayN} ${rp.actualName}` : 'Descanso'}</span>
              <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios</span><span className="font-body-md text-[15px] text-on-surface text-right">{exs.length}</span>
            </div>
            {(rp.reason || rp.comment) && (
              <div className="rounded bg-secondary-container/20 border border-secondary/30 p-3 mt-4 relative z-10">
                <div className="font-label-caps text-[10px] uppercase text-secondary font-semibold tracking-wider">Cambio de día: {rp.reason || '—'}</div>
                {rp.comment ? <p className="font-body-sm text-[13px] text-on-surface-variant mt-1">{rp.comment}</p> : null}
              </div>
            )}
            {rp.plannedDayN!==rp.actualDayN && rp.plannedDayN!=null && (
              <p className="font-body-sm text-[13px] text-on-surface-variant mt-4 relative z-10">Hoy estaba planificado {rp.plannedName} y vas a realizar {rp.actualName}. Quedará registrado para análisis.</p>
            )}
            <div className="space-y-1.5 mt-4 relative z-10">
              {exs.map((ex,i)=>(
                <div key={i} className="flex items-center gap-2 font-body-md text-[15px] text-on-surface">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full shrink-0"></span>{ex.name} <span className="font-label-caps text-[10px] uppercase text-on-surface-variant">· {ex.sets}x{ex.reps}</span>
                </div>
              ))}
            </div>
            {finishError ? <p className="text-sm text-red-400 mt-4 relative z-10">{finishError}</p> : null}
            <button onClick={localStartSession} disabled={isStarting} className="w-full py-3 px-5 rounded bg-primary hover:bg-primary-fixed text-on-primary font-label-caps text-[10px] uppercase font-bold tracking-widest transition-all active:scale-[0.98] shadow-sm mt-4 relative z-10 disabled:opacity-50">{isStarting ? 'Iniciando…' : 'COMENZAR ENTRENAMIENTO'}</button>
            <button onClick={openCancelModal} className="w-full py-2 px-3 rounded bg-surface-container border border-outline-variant/60 font-label-caps text-[10px] uppercase text-on-surface-variant mt-2 relative z-10">Cancelar</button>
          </section>
        </div>
        <CancelModal show={showCancel} onClose={()=>setShowCancel(false)} reason={cancelReason} setReason={setCancelReason} comment={cancelComment} setComment={setCancelComment} onConfirm={confirmCancel} />
      </div>
    )
  }

  if(exs.length===0) {return <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 pb-24 max-w-[1440px] w-full mx-auto"><p className="font-body-md text-[15px] text-on-surface">Hoy es descanso o sin ejercicios. Cambiá el día en Inicio.</p></div>}
  if(sessionStatus==='COMPLETED' || sessionStatus==='PARTIAL') {return (
    <div className="min-h-screen bg-transparent pb-24">
      <div className="max-w-[1440px] w-full mx-auto p-4 md:p-6 lg:p-8 space-y-4">
        <ResultPanel today={today} sessionStatus={sessionStatus} />
      </div>
    </div>
  )}
  return (
    <div className="min-h-screen bg-transparent pb-24">
      <div className="max-w-[1440px] w-full mx-auto p-4 md:p-6 lg:p-8 space-y-4">
        {/* Resume Banner */}
        {resumeBanner && (
          <div className="rounded-xl bg-secondary-container/20 border border-secondary/30 p-4 space-y-2">
            <div className="font-body-md text-[15px] text-on-surface font-medium">Tenés un entrenamiento en progreso ({resumeBanner.calendarDate}).</div>
            <div className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">{resumeBanner.routineName} — {resumeBanner.dayName} · estado {resumeBanner.status} · {resumeBanner.exerciseCount} ejercicios</div>
            <div className="flex gap-2">
              <button onClick={()=> localAdoptResumeSession(resumeBanner, false)} className="flex-1 py-2 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Continuar</button>
              <button onClick={()=> localAdoptResumeSession(resumeBanner, true)} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Finalizar</button>
              <button onClick={localAbandonResume} className="flex-1 py-2 rounded bg-surface-container/60 border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Abandonar</button>
            </div>
          </div>
        )}
        {/* Session Hero Header */}
        <section className="bg-surface-container-low border border-outline-variant/50 rounded-xl p-6  relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary-container/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="px-2.5 py-0.5 rounded-lg bg-secondary-container/40 border border-secondary/40 text-secondary font-label-caps text-[10px] uppercase tracking-widest">
                  ENTRENAR · {rutinaName}
                </span>
                <span className="font-body-sm text-[13px] text-outline">Semana {weekNumber}</span>
              </div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                {dayName}
              </h1>
              <button onClick={async()=>{
                const { getAllRoutines, getActiveRoutineId } = await import('@/services/storage/routineStore')
                const raw = await getAllRoutines()
                const activeId = await getActiveRoutineId()
                const active:any=raw?.find((r:any)=>r.id===activeId)
                if(!active) {return}
                const todayStr=new Date().toISOString().slice(0,10)
                const choice=prompt(`Cambiar día — elegí N°:\n${active.cycle.trainingDays.map((d:any)=>`${d.n} — ${d.name}`).join('\n')}\nEscribí N°:`)
                if(choice){
                  const n=Number(choice)
                  if(active.cycle.trainingDays.find((d:any)=>d.n===n)){
                    await setOverride(today, n, null, null)
                    window.dispatchEvent(new Event('routineChange'))
                    location.reload()
                  }
                }
              }} className="hidden md:inline font-body-sm text-[13px] text-primary underline mt-1">Cambiar día de entrenamiento</button>
            </div>
            <div className="flex items-center gap-2.5">
              <button onClick={openCancelModal} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container border border-outline-variant/60 text-on-surface-variant hover:text-secondary hover:border-secondary/40 font-label-md text-[14px] transition-colors">
                <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                <span className="hidden sm:inline">Cancelar sesión</span>
              </button>
              <button onClick={()=>{ setAbandonReason(''); setAbandonComment(''); setShowAbandon(true) }} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container border border-outline-variant/60 text-on-surface-variant hover:text-secondary hover:border-secondary/40 font-label-md text-[14px] transition-colors">
                <span className="material-symbols-outlined text-[18px]">reorder</span>
                <span className="hidden sm:inline">Abandonar</span>
              </button>
              <button onClick={openFinishModal} className="flex items-center gap-1.5 px-4 py-2 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold tracking-widest shadow-sm transition-all active:scale-[0.98]">
                <Check size={14}/> <span className="hidden sm:inline">FINALIZAR</span><span className="sm:hidden">FIN</span>
              </button>
            </div>
          </div>
          {/* Metrics row + progress bar */}
          <div className="mt-6 pt-5 border-t border-outline-variant/30 grid grid-cols-1 md:grid-cols-4 gap-4 items-center relative z-10">
            <div className="flex flex-col">
              <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="font-headline-sm text-[20px] font-semibold text-secondary">{Object.keys(done).length}</span>
                <span className="font-body-md text-[15px] text-outline">/ {exs.length}</span>
              </div>
              <span className="font-label-caps text-[10px] text-primary mt-0.5">{progress}% de Virtud Cumplida</span>
            </div>
            <div className="flex flex-col">
              <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Series Hechas</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="font-headline-sm text-[20px] font-semibold text-secondary">{completedSets}</span>
                <span className="font-body-md text-[15px] text-outline">/ {totalSets}</span>
              </div>
            </div>
            {(sessionStatus==='IN_PROGRESS' || sessionStatus==='PAUSED') && (
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full border font-label-caps text-[10px] uppercase ${sessionStatus==='PAUSED' ? 'bg-secondary-container/20 border-secondary/30 text-secondary' : 'bg-primary-container/20 border-primary/30 text-primary'}`}>Estado: {sessionStatus}</span>
                <button onClick={togglePause} className="px-3 py-1 rounded-full bg-surface-container border border-outline-variant/60 font-label-caps text-[10px] uppercase text-on-surface-variant hover:border-secondary/40 transition-colors">{sessionStatus==='PAUSED' ? 'Continuar' : 'Pausar'}</button>
              </div>
            )}
          </div>
          <div className="mt-5 w-full bg-surface-container-lowest h-2.5 rounded-full overflow-hidden flex gap-1 p-0.5 border border-outline-variant/40 relative z-10">
            {exs.map((_,i)=> <div key={i} className={`h-full rounded-full transition-all ${done[i]?'bg-primary': i===current?'bg-secondary animate-pulse':'bg-surface-container-high'}`} style={{flex:1}} />)}
          </div>
        </section>

        {restFlash && restSec===0 && <button onClick={dismissFlash} className="w-full flex items-center justify-center gap-2 font-body-md text-[15px] text-on-surface st-completed border rounded p-2 fade-in"><Check size={14}/> Descanso terminado — a entrenar</button>}

        {/* Main Grid: 8-col exercise + 4-col sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* 8-col: Active Exercise + Upcoming */}
          <div className="lg:col-span-8 space-y-6">
            {/* Active Exercise Card */}
            {cur && (
              <div className="bg-surface-container-low border border-secondary/40 rounded-xl   overflow-hidden">
                {/* Exercise Header Strip */}
                <div className="p-6 pb-4 border-b border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-container-low/80">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded bg-primary-container/20 border border-primary/40 font-label-caps text-[10px] text-primary uppercase font-semibold">
                        EJERCICIO {current+1} DE {exs.length}
                      </span>
                      <span className="text-outline text-[13px]">• {cur.sets} series</span>
                    </div>
                    <h2 className="font-headline-md text-[24px] text-on-surface">
                      {cur.name}
                    </h2>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={openViewer} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container border border-outline-variant hover:border-secondary/60 text-secondary font-label-md text-[14px] transition-colors whitespace-nowrap">
                      <span className="material-symbols-outlined text-[18px]">visibility</span>
                      <span>Ver</span>
                    </button>
                    <button onClick={loadSwapOptions} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container border border-outline-variant hover:border-secondary/60 text-secondary font-label-md text-[14px] transition-colors whitespace-nowrap">
                      <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                      <span>Cambiar</span>
                    </button>
                  </div>
                </div>

                {/* Architectural Cue — Coach */}
                <div className="px-6 py-3 bg-surface-container/60 border-b border-outline-variant/30 flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary" style={{fontVariationSettings: "'FILL' 1"}}>lightbulb</span>
                  <p className="font-body-sm text-[13px] text-on-surface-variant">
                    <strong className="text-secondary font-medium">Clave de Virtud:</strong>{' '}
                    {coach ? (coach.suggested_weight ? `${coach.suggested_weight}kg — ${coach.reason}` : coach.reason) : `Vamos con ${cur.weight}kg × ${cur.reps}.`}
                  </p>
                  <button onClick={()=>setShowWhy(s=>!s)} className="ml-auto font-label-caps text-[10px] text-secondary underline">¿Por qué?</button>
                </div>
                {showWhy && (
                  <div className="px-6 py-2 bg-surface-container-high/30 border-b border-outline-variant/30">
                    <p className="font-body-sm text-[13px] text-on-surface-variant italic">{coach?.factors?.join(' · ') || 'Volumen y técnica estables.'}</p>
                  </div>
                )}

                {/* Pain Alert */}
                {painAlert && (
                  <div className="mx-6 mt-4 rounded bg-secondary-container/20 border border-secondary/30 p-3 space-y-2">
                    <div className="font-body-md text-[15px] text-on-surface font-medium">La última vez registraste molestias en {painAlert.zone}. ¿Cómo está hoy?</div>
                    <div className="flex gap-1">
                      <input value={painAns} onChange={e=>setPainAns(e.target.value)} placeholder="Bien / sigue molestando…" maxLength={200} className="flex-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
                      <button onClick={async()=>{ const v=painAns.trim(); if(!v) {return;} const { saveAnswer } = await import('@/services/ai/coachMemory'); await saveAnswer(`pain:${painAlert.zone.toLowerCase()}`, `¿Cómo está hoy la molestia en ${painAlert.zone}?`, v); dismissPainAlert(); setPainAns(''); runSafetyCheck() }} className="px-3 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Guardar</button>
                    </div>
                  </div>
                )}

                {/* Safety Alert */}
                {safetyAlert && (
                  <div className={`mx-6 mt-4 rounded border p-3 flex items-start gap-2 ${
                    safetyAlert.severity==='critical' ? 'bg-red-900/30 border-red-700' : 'bg-secondary-container/20 border-secondary/30'
                  }`}>
                    <AlertTriangle size={14} className={`mt-0.5 ${safetyAlert.severity==='critical'?'text-red-400':'text-secondary'}`}/>
                    <div className="font-body-md text-[15px] text-on-surface">
                      <span className="font-medium">{safetyAlert.message}</span>
                      {safetyAlert.referral && <span className="font-label-caps text-[10px] uppercase text-on-surface-variant"> Consultá con {safetyAlert.referral}.</span>}
                    </div>
                  </div>
                )}

                {/* Pain Toggle — registrar dolor/molestia para este ejercicio */}
                {cur && (
                  <PainToggle
                    sessionId={sessionId}
                    exerciseId={cur.exId}
                    exerciseName={cur.name}
                    initialLevel="none"
                    onPainChange={(level, zone, notes) => {
                      console.log('Pain changed:', level, zone, notes)
                    }}
                    onOpenVariants={() => {
                      if (!cur) return
                      const context: VariantContext = {
                        originalExerciseId: cur.exId,
                        reason: 'pain',
                        painZone: '', // will be filled by PainToggle
                        painLevel: 'moderate',
                      }
                      setVariantContext(context)
                      setShowVariantPicker(true)
                    }}
                  />
                )}

                {/* Series Data Table */}
                <div className="p-6">
                  <ExerciseSeriesTable
                    key={cur.exId}
                    exerciseId={cur.exId}
                    today={today}
                    sets={cur.sets}
                    plannedReps={cur.reps}
                    plannedWeight={cur.weight}
                    onComplete={(si,w,r,neg,obs)=> handleSetDone(si,w,r,neg,obs)}
                    onSkipSet={(si)=> skipSetRow(si)}
                    onAddSet={addSetRow}
                    logs={logs[current]||[]}
                    initialCompleted={tableInitial.completed}
                    initialSkipped={tableInitial.skipped}
                  />
                </div>

                {/* Modify + Skip buttons */}
                {!done[current] ? (
                  <div className="px-6 pb-4 flex gap-2">
                    <button onClick={()=>{ setMod({weight:cur.weight,reps:cur.reps,sets:cur.sets, seriesType:'Normal'}); setShowModify(true)}} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant/60 font-label-caps text-[10px] uppercase text-on-surface-variant transition-colors hover:border-secondary/40">Modificar</button>
                    <button onClick={handleSkipWithReason} className="flex-1 py-2 rounded bg-surface-container/60 border border-outline-variant/60 font-label-caps text-[10px] uppercase text-on-surface-variant transition-colors hover:border-secondary/40">Saltar</button>
                  </div>
                ) : (
                  <div className="px-6 pb-4 flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button onClick={()=>{
                        if(current < exs.length-1){ setCurrent(current+1); nextCoach(current+1) }
                      }} className={`flex-1 py-3 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold tracking-widest transition-all active:scale-[0.98] shadow-sm ${current < exs.length-1 ? '' : 'hidden'}`}>
                        <span className="flex items-center justify-center gap-2"><Check size={14}/> Continuar al siguiente</span>
                      </button>
                      <button onClick={openFinishModal} className="flex-1 py-3 rounded bg-surface-container border border-primary/40 text-primary font-label-caps text-[10px] uppercase font-bold tracking-widest transition-all active:scale-[0.98]">
                        <span className="flex items-center justify-center gap-2"><Check size={14}/> Finalizar entrenamiento</span>
                      </button>
                    </div>
                    <button onClick={()=> setDone((p)=>{ const n={...p}; delete n[current]; return n })} className="w-full py-1.5 rounded border border-outline-variant/40 font-label-caps text-[10px] uppercase text-outline hover:text-on-surface-variant hover:border-outline-variant transition-colors">
                      <span className="flex items-center justify-center gap-1.5"><RotateCcw size={11}/> Desmarcar ejercicio</span>
                    </button>
                  </div>
                )}

                <div className="mx-6 mb-6 rounded bg-secondary-container/20 border border-secondary/30 p-2 flex gap-2 font-body-sm text-[13px] text-on-surface-variant">
                  <AlertTriangle size={14} className="text-secondary mt-0.5 shrink-0"/> Si hay dolor importante, detené y consultá profesional. Podés saltar el ejercicio.
                </div>
              </div>
            )}

            {/* Upcoming Exercises */}
            {exs.filter((_,i)=> i > current && !done[i]).length > 0 && (
              <div>
                <h3 className="font-label-caps text-[10px] uppercase text-outline tracking-wider mb-3">SIGUIENTES EJERCICIOS</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {exs.filter((_,i)=> i > current && !done[i]).map((ex, fi)=>{
                    const origIdx = exs.indexOf(ex)
                    return (
                      <div key={origIdx} className="bg-surface-container-low border border-outline-variant/50 rounded-xl p-5  hover:border-secondary/40 transition-colors group cursor-pointer" onClick={()=>{ setCurrent(origIdx); nextCoach(origIdx) }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant font-label-caps text-[10px] text-secondary uppercase">SIGUIENTE · EJERCICIO {fi+2}</span>
                          <span className="font-label-caps text-[10px] text-outline">{ex.sets} Series × {ex.reps} reps</span>
                        </div>
                        <h3 className="font-headline-sm text-[20px] text-on-surface group-hover:text-primary transition-colors">{ex.name}</h3>
                        <p className="font-body-sm text-[13px] text-outline mt-1.5">{ex.weight}kg · {ex.muscle || ''}</p>
                        <div className="mt-4 flex items-center justify-between pt-3 border-t border-outline-variant/30">
                          <span className="font-label-caps text-[10px] text-on-surface-variant">Descanso asignado: 90s</span>
                          <span className="material-symbols-outlined text-secondary text-[20px]">arrow_forward</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 4-col: Sidebar */}
          <div className="lg:col-span-4 space-y-5 lg:sticky lg:top-6 lg:self-start">
            {/* Rest Timer Widget */}
            {restSec > 0 && (
              <div className="bg-surface-container-low border border-outline-variant/60 rounded-xl p-6  flex flex-col items-center text-center relative overflow-hidden">
                <div className="w-full flex items-center justify-between pb-3 border-b border-outline-variant/30 mb-5">
                  <span className="font-label-caps text-[10px] uppercase text-secondary font-semibold tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">hourglass_top</span>
                    RELOJ DE RECUPERACIÓN
                  </span>
                </div>
                {/* Circular Timer SVG */}
                <div className="relative w-44 h-44 flex items-center justify-center my-2">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                    <circle className="text-surface-container-highest" cx="80" cy="80" fill="transparent" r="70" stroke="currentColor" strokeWidth="6" />
                    <circle className="text-secondary transition-all duration-1000" cx="80" cy="80" fill="transparent" r="70" stroke="currentColor" strokeDasharray={440} strokeDashoffset={440 - (440 * restSec / (methodIdRef.current ? (getMethod(methodIdRef.current)?.defaults.restSeconds ?? 90) : 90))} strokeLinecap="round" strokeWidth="6" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <button onClick={()=> restPaused ? resumeRest() : pauseRest()} aria-label={restPaused?'Reanudar descanso':'Pausar descanso'} className="text-[44px] leading-none font-semibold text-on-surface font-mono tracking-tight bg-transparent border-none cursor-pointer hover:text-secondary transition-colors">
                      {Math.floor(restSec/60)}:{String(restSec%60).padStart(2,'0')}
                    </button>
                    <span className="font-label-caps text-[10px] text-primary tracking-widest mt-1">{restPaused ? 'PAUSADO' : 'RESPIRA HONDO'}</span>
                  </div>
                </div>
                {/* Timer adjust buttons */}
                <div className="grid grid-cols-3 gap-2 w-full mt-4">
                  <button onClick={()=>adjustRest(-15)} className="px-2 py-1.5 rounded bg-surface-container border border-outline-variant/60 hover:border-secondary text-on-surface-variant hover:text-on-surface font-label-md text-[14px] transition-all active:scale-95">-15s</button>
                  <button onClick={()=>adjustRest(30)} className="px-2 py-1.5 rounded bg-surface-container border border-outline-variant/60 hover:border-secondary text-on-surface-variant hover:text-on-surface font-label-md text-[14px] transition-all active:scale-95">+30s</button>
                  <button onClick={skipRest} className="px-2 py-1.5 rounded bg-secondary-container/50 border border-secondary/40 text-secondary hover:bg-secondary hover:text-on-secondary-fixed font-label-caps text-[10px] uppercase font-bold transition-all active:scale-95">SALTAR</button>
                </div>
              </div>
            )}

            {/* Oracular Coach */}
            {coach && (
              <div className="bg-surface-container-high/40 border border-secondary/30 rounded-xl p-5 relative overflow-hidden">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary-container/60 border border-secondary/40 flex items-center justify-center text-secondary shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                  </div>
                  <div>
                    <span className="font-label-caps text-[10px] uppercase text-secondary font-semibold tracking-wider block">
                      Voz del Mentor
                    </span>
                    <p className="font-headline-sm text-[16px] leading-snug text-on-surface mt-1 italic" style={{fontFamily: 'Noto Serif, serif'}}>
                      "{coach.reason}"
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <span className="font-body-sm text-[12px] text-outline">
                        {coach.suggested_weight ? `Peso sugerido: ${coach.suggested_weight}kg` : 'Basado en tu técnica actual'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Mini Summary */}
            <div className="bg-surface-container-low border border-primary/30 rounded-xl p-5  mt-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="font-label-caps text-[10px] uppercase text-primary tracking-wider font-semibold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]" style={{fontVariationSettings: "'FILL' 1"}}>workspace_premium</span>
                  RESUMEN DE VIRTUD
                </span>
                <span className="px-2 py-0.5 rounded bg-primary-container/30 text-primary font-label-caps text-[10px]">HOY</span>
              </div>
              <div className="space-y-2 my-3 text-[15px]">
                <div className="flex justify-between text-on-surface-variant font-body-md">
                  <span>Ejercicios Concluidos</span>
                  <strong className="text-on-surface">{Object.keys(done).filter(k=>done[Number(k)]).length} de {exs.length}</strong>
                </div>
                <div className="flex justify-between text-on-surface-variant font-body-md">
                  <span>Progreso</span>
                  <strong className="text-on-surface">{progress}%</strong>
                </div>
              </div>
              <button onClick={openFinishModal} className="w-full py-2 px-3 rounded bg-primary hover:bg-primary-fixed text-on-primary font-label-caps text-[10px] uppercase font-bold tracking-widest transition-all active:scale-[0.98] shadow-sm">
                CONFIRMAR Y GUARDAR EN EL TEMPLO
              </button>
            </div>
          </div>
        </div>{/* fin grid desktop */}

        {/* Fixed-bottom FINALIZAR bar — mobile only, during active session */}
        {(sessionStatus==='IN_PROGRESS' || sessionStatus==='PAUSED' || sessionStatus==='COMPLETING') && (
          <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-surface-container/95 backdrop-blur-sm border-t border-outline-variant/50 px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">Progreso</div>
              <div className="font-body-md text-[15px] text-on-surface font-medium">{progress}% — {Object.keys(done).filter(k=>done[Number(k)]).length}/{exs.length} ejercicios</div>
            </div>
            <button onClick={openFinishModal} className="flex items-center gap-1.5 px-5 py-2.5 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold tracking-widest shadow-sm transition-all active:scale-[0.98] shrink-0">
              <Check size={14}/> FINALIZAR
            </button>
          </div>
        )}

        <ModifyModal show={showModify && !!cur} onClose={()=>setShowModify(false)} exerciseName={cur?.name||''} mod={mod} setMod={setMod} onApply={async ()=>{
                setExs(prev => prev.map((ex, i) => i === current ? { ...ex, weight: mod.weight, reps: mod.reps, sets: mod.sets } : ex))
                const seId = seIdByIndex[current]
                if(seId){
                  const se = await db.sessionExercises.get(seId).catch(()=>null)
                  if(se){
                    const newPlannedSets = Array.from({length: mod.sets}, (_:unknown, i:number) => ({
                      order: i,
                      reps: mod.reps,
                      weight: mod.weight,
                      setType: ((mod.seriesType || 'NORMAL').toUpperCase().replace(' ','_')) as import('@/services/training/domain').SetType,
                    }))
                    await db.sessionExercises.put({ ...se, plannedSetCount: mod.sets, plannedSets: newPlannedSets, updatedAt: new Date().toISOString() })
                  }
                }
                saveDecision({ date: today, type:'modify', exercise: cur!.name, reason:`Modificado a ${mod.weight}kg × ${mod.reps} × ${mod.sets}`, contextSnapshot:{mod}})
                setShowModify(false)
              }} />

        <ViewerModal viewer={viewer} onClose={()=>setViewer(null)} />

        <SwapModal show={showSwap} onClose={()=>{setShowSwap(false); setSwapOptions([])}} muscleName={cur?.muscle} swapLoading={swapLoading} swapOptions={swapOptions} swapExplain={swapExplain} setSwapExplain={setSwapExplain} onSwap={handleSwap} swapReason={swapReason} setSwapReason={setSwapReason} swapComment={swapComment} setSwapComment={setSwapComment} />

        <SkipReasonModal show={showSkipReason} onClose={()=>setShowSkipReason(false)} exerciseName={cur?.name} skipReason={skipReason} setSkipReason={setSkipReason} onConfirm={confirmSkip} />

        <CancelModal show={showCancel} onClose={()=>setShowCancel(false)} reason={cancelReason} setReason={setCancelReason} comment={cancelComment} setComment={setCancelComment} onConfirm={confirmCancel} />

        <AbandonModal show={showAbandon} onClose={()=>setShowAbandon(false)} reason={abandonReason} setReason={setAbandonReason} comment={abandonComment} setComment={setAbandonComment} onConfirm={confirmAbandon} />

        <AddExtraModal show={showAddEx} onClose={()=>setShowAddEx(false)} options={addExOptions} reason={addExReason} setReason={setAddExReason} comment={addExComment} setComment={setAddExComment} onAdd={confirmAddExtra} />
        <FinishModal show={showFinishModal} onClose={()=>setShowFinishModal(false)} summary={computeSummary()} rutinaName={rutinaName} weekNumber={weekNumber} plannedDayN={plannedDayN} plannedName={plannedName} actualDayN={actualDayN} dayName={dayName} exs={exs} logs={logs} pendingReasons={pendingReasons} setPendingReasons={setPendingReasons} skipReasons={skipReasons} musclePct={musclePct} volumeAlerts={volumeAlerts} progressLines={progressLines} finishSurvey={finishSurvey} setFinishSurvey={setFinishSurvey} finishError={finishError} isSaving={isSaving} onConfirm={confirmFinish} session={session} sessionId={sessionId} setSession={setSession} setSessionStatus={setSessionStatus} />

        {/* Variant Picker Modal */}
        <VariantPicker
          context={variantContext}
          userProfile={null}
          onSelectVariant={handleVariantSelect}
          onClose={() => { setShowVariantPicker(false); setVariantContext(null) }}
          isLoading={showVariantPicker}
        />
      </div>
    </div>
  )
}

