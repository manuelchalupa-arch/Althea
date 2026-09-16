import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { db, ensureSeeded } from '@/services/storage/db'
import { getCycleFromProfile } from '@/utils/cycle'
import { v4 as uuid } from 'uuid'
import { Eye, Clock, Check, ChevronRight, Zap, AlertTriangle, RotateCcw, XCircle } from 'lucide-react'
import BrandIcon from '@/components/brand/BrandIcon'
import { AltheaCard, AltheaCardHeader, AltheaBadge, StatusTag, AltheaProgress, AltheaButton } from '@/components/althea'
import { aiService } from '@/services/ai/aiService'
import { buildTrainingContext } from '@/services/ai/contextBuilder'
import { getMethod } from '@/services/ai/trainingMethodsDB'
import * as Gym from '@/services/exerciseGym'
import { saveDecision } from '@/services/ai/coachMemory'
import { loadActiveSession, saveActiveSession, type ActiveSession } from '@/services/training/sessionMachine'
import { getActiveSession, transitionSession } from '@/services/training/sessionStore'
import type { SessionStatus, TrainingSession, SessionExercise } from '@/services/training/domain'

type SessionEx = { exId:string; name:string; sets:number; reps:number; weight:number; muscle?:string; gifUrl?:string; imageDataUrl?:string; swappedFrom?:string; replaced?:boolean; extra?:boolean; plannedSets?:number; seriesType?:string; seId?:string }

const PERSIST_KEY = (today:string, exId:string) => `exstate:${today}:${exId}`

function loadExState(today:string, exId:string){
  try{ return JSON.parse(localStorage.getItem(PERSIST_KEY(today, exId))||'null') }catch{ return null }
}
function saveExState(today:string, exId:string, state:any){
  localStorage.setItem(PERSIST_KEY(today, exId), JSON.stringify(state))
}
function clearExState(today:string, exId:string){
  localStorage.removeItem(PERSIST_KEY(today, exId))
}

export default function Entrenar(){
  const today = new Date().toISOString().slice(0,10)
  const [exs,setExs]=useState<SessionEx[]>([])
  const [current,setCurrent]=useState(0)
  const [done,setDone]=useState<Record<number,boolean>>({})
  const [skipped,setSkipped]=useState<Record<number,boolean>>({})
  const [logs,setLogs]=useState<Record<number,any[]>>({})
  const [coach,setCoach]=useState<any>(null)
  const [showWhy,setShowWhy]=useState(false)
  const [viewer,setViewer]=useState<Gym.Exercise|null>(null)
  const [rutinaName,setRutinaName]=useState('Rutina')
  const [dayName,setDayName]=useState('')
  const [restSec,setRestSec]=useState(0)
  const [restPaused,setRestPaused]=useState(false)
  const [restFlash,setRestFlash]=useState(false)
  const restPausedRef=useRef(false)
  const restSecRef=useRef(0)
  restSecRef.current = restSec
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
  const [painAlert,setPainAlert]=useState<{zone:string;detail:string}|null>(null)
  const [painAns,setPainAns]=useState('')
  const [safetyAlert,setSafetyAlert]=useState<{severity:'info'|'warning'|'critical'; message:string; referral?:string}|null>(null)
  // Estados para FINALIZAR ENTRENAMIENTO + máquina de estados
  const [showFinishModal,setShowFinishModal]=useState(false)
  const [isSaving,setIsSaving]=useState(false)
  const [isStarting,setIsStarting]=useState(false)
  const finishingAt=useRef(0)
  const [finishSurvey,setFinishSurvey]=useState<Record<string,any>>({
    sessionRating: 3, pain: 0, painZone: '', painDetail: '', comment: ''
  })
  const [pendingReasons,setPendingReasons]=useState<Record<number,{reason:string; comment:string}>>({})
  const [skipReasons,setSkipReasons]=useState<Record<number,string>>({})
  const methodIdRef=useRef<string|null>(null)
  const [sessionStartTime,setSessionStartTime]=useState<string>(new Date().toISOString())
  const [sessionId,setSessionId]=useState<string>('')
  const [sessionStatus,setSessionStatus]=useState<SessionStatus>('PLANNED')
  const sessionStatusRef=useRef<SessionStatus>('PLANNED')
  sessionStatusRef.current = sessionStatus
  const [plannedDayN,setPlannedDayN]=useState<number|null>(null)
  const [actualDayN,setActualDayN]=useState<number|null>(null)
  const [plannedName,setPlannedName]=useState<string>('')
  const [routineId,setRoutineId]=useState<string>('')
  const [weekNumber,setWeekNumber]=useState<number>(1)
  const [volumeAlerts,setVolumeAlerts]=useState<string[]>([])
  const [musclePct,setMusclePct]=useState<Array<{m:string; pct:number}>>([])
  const [finishError,setFinishError]=useState<string>('')
  const [resumeBanner,setResumeBanner]=useState<null | { sessionId: string; calendarDate: string; routineName: string; dayName: string; status: string; exerciseCount: number }>(null)
  const [progressLines,setProgressLines]=useState<Record<string,string>>({})
  const loadedRef = useRef<string>('')
  const [session,setSession]=useState<TrainingSession|null>(null)
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

  // Carga un TrainingSession oficial + SessionExercises + SetRecords a estado de vista.
  // Los indices (done/skipped/logs) son DERIVADOS para la UI; la fuente es el store.
  const applyStoreSession = async (storeS: import('@/services/training/domain').TrainingSession) => {
    loadedRef.current = storeS.sessionId
    setSessionId(storeS.sessionId)
    setSessionStatus(storeS.sessionStatus)
    setSession(storeS)
    setSessionStartTime(storeS.startedAt || storeS.createdAt)
    setRutinaName(storeS.routineName || 'Rutina')
    setRoutineId(storeS.routineId)
    setDayName(storeS.actualDayName || (storeS.actualDay != null ? `Día N°${storeS.actualDay}` : 'Descanso'))
    setPlannedDayN(storeS.plannedDay)
    setActualDayN(storeS.actualDay)
    setPlannedName(storeS.plannedDayName || '')
    setWeekNumber(storeS.weekNumber || 1)
    const { getSessionExercises, getSetRecords } = await import('@/services/training/sessionStore')
    const seList = await getSessionExercises(storeS.sessionId)
    setSessionExercises(seList)
    // nombres/musculo del espejo (metadatos UI, no fuente)
    let meta: Record<string, { name: string; muscle?: string; gifUrl?: string; imageDataUrl?: string }> = {}
    try {
      const raw = localStorage.getItem(`althea:session:active:ex:${storeS.sessionId}`) || localStorage.getItem(`session:active:${today}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        const arr = parsed.exercises || parsed
        if (Array.isArray(arr)) for (const x of arr) meta[x.exId || x.id] = { name: x.name, muscle: x.muscle, gifUrl: x.gifUrl, imageDataUrl: x.imageDataUrl }
      }
    } catch { /* noop */ }
    const list: SessionEx[] = seList.map((se, idx) => ({
      exId: se.exerciseId,
      name: meta[se.exerciseId]?.name || se.exerciseId,
      sets: Math.max(se.plannedSetCount, se.actualSetCount, 1),
      reps: se.plannedSets[0]?.reps ?? 0,
      weight: se.plannedSets[0]?.weight ?? 0,
      muscle: meta[se.exerciseId]?.muscle,
      gifUrl: meta[se.exerciseId]?.gifUrl,
      imageDataUrl: meta[se.exerciseId]?.imageDataUrl,
      plannedSets: se.plannedSetCount,
      seId: se.sessionExerciseId,
      swappedFrom: se.replacement?.originalExerciseId,
      replaced: se.status === 'REPLACED',
      extra: se.status === 'EXTRA',
    }))
    const seMap: Record<number, string> = {}
    const d: Record<number, boolean> = {}
    const sk: Record<number, boolean> = {}
    const lg: Record<number, unknown[]> = {}
    for (let i = 0; i < seList.length; i++) {
      const se = seList[i]
      seMap[i] = se.sessionExerciseId
      const recs = await getSetRecords(se.sessionExerciseId)
      const doneRecs = recs.filter((r) => r.status === 'COMPLETED')
      const skippedRecs = recs.filter((r) => r.status === 'SKIPPED')
      lg[i] = [
        ...doneRecs.map((r) => ({ weight: r.actualWeight, reps: r.actualReps, setType: r.setType, observation: r.observation })),
        ...skippedRecs.map((r) => ({ weight: r.actualWeight ?? r.plannedWeight ?? 0, reps: r.actualReps ?? r.plannedReps ?? 0, setType: r.setType, observation: r.observation, skipped: true })),
      ]
      if (se.status === 'COMPLETED') d[i] = true
      if (se.status === 'SKIPPED') { sk[i] = true; d[i] = true }
    }
    const restoredIndex = Math.min(storeS.currentExerciseIndex ?? 0, list.length - 1)
    setSeIdByIndex(seMap)
    setExs(list); setCurrent(restoredIndex); setDone(d); setSkipped(sk); setLogs(lg as Record<number, unknown[]>)
    if (list[0]) {
      const ctx: unknown = await buildTrainingContext(list[0].exId, list[0].name)
      const rec = await aiService.generateRecommendation(ctx as never).catch(() => ({ reason: `Vamos con ${list[0].weight}kg x ${list[0].reps}.`, suggested_weight: list[0].weight, confidence: 0.6, factors: ['determinístico'] }))
      setCoach(rec)
    } else setCoach(null)
  }

  const load = async () => {
      const { getActiveSession, getSession, getSessionExercises: getSE } = await import('@/services/training/sessionStore')
      // PRIORIDAD 1: sesion activa por activeSessionId (nunca calendario por encima).
      const active = await getActiveSession().catch(() => null)
      if (active && active.calendarDate === today && ['READY', 'IN_PROGRESS', 'PAUSED', 'COMPLETING'].includes(active.sessionStatus)) {
        // Verificar que la sesion tenga ejercicios en la DB antes de usarla.
        const seCount = await getSE(active.sessionId).then(l => l.length).catch(() => 0)
        if (seCount > 0) {
          if (active.sessionStatus === 'READY') {
            setReadyPlan({ sessionId: active.sessionId, routineName: active.routineName || 'Rutina', plannedDayN: active.plannedDay, plannedName: active.plannedDayName || '', actualDayN: active.actualDay, actualName: active.actualDayName || '', isResume: false })
          }
          await applyStoreSession(active)
          return
        }
        // Sesion sin ejercicios en DB → limpiar y caer al plan de rutina.
        const { clearActiveSession } = await import('@/services/training/sessionMachine')
        clearActiveSession()
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
      const rawList = JSON.parse(localStorage.getItem('rutinas:list') || 'null')
      const activeId = localStorage.getItem('rutina:activeId')
      const activeR: unknown = (rawList as Array<{ id: string }> | null)?.find((r) => r.id === activeId) || (rawList as Array<unknown>)?.[0]
      const prof = await db.userProfile.get('me') as unknown
      const routine = (activeR as { cycle?: unknown; name?: string; id?: string } | null) || { cycle: (prof as { cycle?: unknown })?.cycle, name: 'Rutina' }
      const cycle = (routine as { cycle?: unknown }).cycle || getCycleFromProfile(prof as never)
      methodIdRef.current = (cycle as any)?.methodId || null
      const cyc = cycle as { weekMap: (number | null)[]; trainingDays: Array<{ n: number; name: string }>; startDate?: string }
      const dow = new Date().getDay()
      const override = localStorage.getItem(`session:override:${today}`)
      const n = override ? Number(override) : cyc.weekMap[dow]
      const schedN = cyc.weekMap[dow] ?? null
      const schedName = schedN ? cyc.trainingDays.find((dd) => dd.n === schedN)?.name || `Día N°${schedN}` : null
      const dname = n ? cyc.trainingDays.find((dd) => dd.n === n)?.name || `Día N°${n}` : 'Descanso'
      const changedRaw = localStorage.getItem(`session:changed:${today}`)
      const changed = changedRaw ? JSON.parse(changedRaw) as { changeReason?: string; changeComment?: string } : null
      const { getDayExercises } = await import('@/utils/routine')
      const found = await getDayExercises(n, cycle)
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
      const rawList = JSON.parse(localStorage.getItem('rutinas:list') || 'null')
      const a = rawList?.find((r: { id: string }) => r.id === localStorage.getItem('rutina:activeId'))
      const start = new Date((a?.cycle?.startDate as string) || today)
      return Math.max(1, Math.floor((new Date(today).getTime() - start.getTime()) / (7 * 86400000)) + 1)
    } catch { return 1 } })()
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
    ensureSeeded().then(()=> load())
    const onStorage = (e:StorageEvent)=>{ if(e.key?.startsWith('session:override:')){ loadedRef.current=''; load() } }
    const onFocus = ()=> load()
    const onCustom = ()=>{ loadedRef.current=''; load() }
    const onBeforeUnload = (e: BeforeUnloadEvent)=>{
      if(['IN_PROGRESS','PAUSED','COMPLETING'].includes(sessionStatusRef.current)){
        e.preventDefault(); e.returnValue = ''
      }
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    window.addEventListener('routineChange', onCustom as any)
    window.addEventListener('beforeunload', onBeforeUnload)
    const id = setInterval(()=>{ if(restPausedRef.current) return; if(restSecRef.current>0){ restSecRef.current -= 1; setRestSec(restSecRef.current); if(restSecRef.current===0) setRestFlash(true) } }, 1000)
    return ()=>{ clearInterval(id); window.removeEventListener('storage', onStorage); window.removeEventListener('focus', onFocus); window.removeEventListener('routineChange', onCustom as any); window.removeEventListener('beforeunload', onBeforeUnload) }
  },[])

  const cur = exs[current]
  useEffect(()=>{
    const run = async ()=>{
      setPainAlert(null)
      if(!cur?.muscle) return
      try{
        const { painMatchesMuscle } = await import('@/services/ai/coachInsights')
        const { getAnswer } = await import('@/services/ai/coachMemory')
        const surveys: any[] = await db.table('postWorkoutSurveys').toArray().catch(()=>[])
        for(const s of surveys){
          const zone = String(s.painZone || s.painDetail || '').trim()
          if(!zone || Number(s.pain) <= 0) continue
          if(!painMatchesMuscle(zone, cur.muscle || '')) continue
          const ans = await getAnswer(`pain:${zone.toLowerCase()}`).catch(()=>null)
          if(!ans){ setPainAlert({ zone, detail: String(s.painDetail || '') }); return }
        }
      }catch{ /* noop */ }
    }
    run()
  },[current, exs])
  const tableInitial = useMemo(()=>{
    const arr = logs[current] || []
    const completed: Record<number,{weight:number;reps:number}> = {}
    const skipped: number[] = []
    arr.forEach((v: unknown, i: number)=>{
      if(!v) return
      const s = v as { skipped?: boolean; weight?: number; reps?: number }
      if(s.skipped) skipped.push(i)
      else completed[i] = { weight: Number(s.weight ?? 0), reps: Number(s.reps ?? 0) }
    })
    return { completed, skipped }
  },[logs, current])
  const progress = exs.length ? Math.round(Object.keys(done).filter(k=>done[Number(k)]).length / exs.length * 100) : 0
  const completedSets = Object.keys(logs).reduce((sum, k) => sum + (logs[Number(k)]?.length ?? 0), 0)
  const totalSets = exs.reduce((sum, ex) => sum + (ex.plannedSets ?? ex.sets), 0)

  const nextCoach = async (nextIdx:number)=>{
    if(nextIdx>=exs.length) return
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
    if(!cur || !session) return
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
      const existing = await db.table('negativeSets').where('sessionExerciseId').equals(seId).toArray().catch(()=>[])
      if(existing.length===0){
        await saveNegatives({ sessionId: session.sessionId, sessionExerciseId: seId, exerciseId: cur.exId, quantity: Number(neg.reps)||0, weight: Number(neg.weight)||0, observation: obs || undefined })
      }
    }
    if(obs) await saveExerciseObservation({ sessionId: session.sessionId, sessionExerciseId: seId, exerciseId: cur.exId, text: obs }).catch(()=>null)
    // vista local
    const arr = [...(logs[current] || [])]
    arr[setIdx] = { weight:w, reps:r, setType, obs }
    const nlogs = {...logs, [current]: arr}
    setLogs(nlogs)
    await updateSession(session.sessionId, { currentExerciseId: cur.exId, currentExerciseIndex: current, currentSetIndex: setIdx + 1 }).catch(()=>null)
    const recs = await getSetRecords(seId).catch(()=>[])
    const plannedCount = exs[current]?.plannedSets ?? cur.sets
    const doneCount = recs.filter(x=> x.status==='COMPLETED').length
    if(doneCount>=plannedCount && plannedCount>0){
      setDone({...done, [current]: true})
      saveDecision({ date: today, type:'accept', exercise: cur.name, reason: coach?.reason, contextSnapshot:{weight:w,reps:r}} as never)
      const methodRest = methodIdRef.current ? (getMethod(methodIdRef.current as any)?.defaults.restSeconds ?? 90) : 90
      setRestSec(methodRest); setRestFlash(false); setRestPaused(false); restPausedRef.current=false; try{ if(navigator.vibrate) navigator.vibrate(12) }catch{ /* noop */ }
      if(current < exs.length-1){
        setTimeout(()=>{ setCurrent(current+1); nextCoach(current+1) }, 800)
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
    if(!cur) return
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
        const direct = await Gym.fetchOne(mm,slug).catch(()=>null) as any
        if(direct?.gifUrl){ setViewer(direct); return }
      }catch{}
    }
    const muscleMap:any = { pecho:'pectorals', espalda:'lats', biceps:'biceps', triceps:'triceps', hombros:'delts', piernas:'quads', cuadriceps:'quads', gluteos:'glutes', isquios:'hamstrings' }
    const m = muscleMap[(cur.muscle||'').toLowerCase()] || 'pectorals'
    try{
      const directId = seedMap[cur.exId]
      if(directId){
        const [mm,slug]=directId.split('/')
        const ex = await Gym.fetchOne(mm,slug).catch(()=>null) as any
        if(ex?.gifUrl){ setViewer(ex); return }
      }
      const res = await Gym.fetchByMuscle(m)
      const target = cur.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      const targetWords = target.split(/\s+/)
      let best:any=null, bestScore=-1
      for(const ex of res.exercises){
        const name = ex.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        let score=0
        for(const w of targetWords){ if(name.includes(w)) score+=2; if(ex.slug.includes(w)) score+=1 }
        if(target.includes('inclinado') && name.includes('inclinado')) score+=5
        if(target.includes('banca') && name.includes('banca')) score+=3
        if(target.includes('mancuerna') && name.includes('mancuerna')) score+=3
        if(score>bestScore){ bestScore=score; best=ex }
      }
      if(best && bestScore>1) setViewer(best)
      else setViewer({ id: cur.exId, name: cur.name, muscle:m, bodyPart:'chest', equipment:'barbell', category:'strength', secondaryMuscles:[], instructions:[], file:'', gifUrl: (cur as any).gifUrl||'' } as any)
    }catch{
      setViewer({ id: cur.exId, name: cur.name, muscle:m, bodyPart:'chest', equipment:'barbell', category:'strength', secondaryMuscles:[], instructions:[], file:'', gifUrl:''} as any)
    }
  }

  const loadSwapOptions = useCallback(async ()=>{
    if(!cur) return
    setSwapLoading(true); setSwapExplain(null)
    try{
      const muscleMap:any = { pecho:'pectorals', espalda:'lats', biceps:'biceps', triceps:'triceps', hombros:'delts', piernas:'quads', cuadriceps:'quads', gluteos:'glutes', isquios:'hamstrings' }
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
        db.table('setRecords').where('exerciseId').anyOf(ids).toArray().catch(()=>[]),
        db.setLogs.where('exerciseId').anyOf(ids).toArray().catch(()=>[]),
      ])
      const counts: Record<string,number> = {}
      for(const r of [...(recs as any[]), ...(logs as any[])] as any[]){ const k=r.exerciseId; counts[k]=(counts[k]||0)+1 }
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
          const reason = swapReason === 'Molestia / dolor' ? 'pain' : swapReason === 'Falta de equipamiento' ? 'equipment' : 'user_request'
          const subResult = await findAlternatives(cur.exId, pool, reason as any, profile || {})
          const mapped = subResult.alternatives.map(a => ({
            exercise: { ...a.exercise, gifUrl: (a.exercise as any).gifUrl || '' } as Gym.Exercise,
            score: a.score,
            factors: [{ key:'reason', label:'Razón', detail:a.reason, state:'match' as const }],
            sharedMuscles: 1,
            sameEquipment: true,
            historyCount: 0,
          }))
          if(mapped.length > ranked.length) ranked = mapped
        }catch{ /* noop */ }
      }
      setSwapOptions(ranked)
      setShowSwap(true)
    }catch{ /* noop */ }finally{ setSwapLoading(false) }
  }, [cur, swapReason])

  const handleSwap = async (newEx:Gym.Exercise)=>{
    if(!cur || !session) return
    const seId = seIdByIndex[current]
    if(!seId) return
    const reason = swapReason || 'Cambio durante la sesión'
    const { replaceSessionExercise } = await import('@/services/training/sessionStore')
    // historial separado: el original conserva el suyo; el nuevo muestra el propio (§23)
    await replaceSessionExercise(seId, newEx.id, reason, swapComment || undefined)
    saveDecision({ date: today, type:'swap', exercise: cur.name, reason:`Cambiado a ${newEx.name}: ${reason}`, contextSnapshot:{ from:cur.exId, to:newEx.id }} as never)
    setExs(prev=> prev.map((ex,i)=> i===current ? { ...ex, exId: newEx.id, name: newEx.name, muscle: newEx.muscle, gifUrl: newEx.gifUrl, swappedFrom: cur.exId, replaced: true, plannedSets: ex.plannedSets ?? ex.sets, seId } : ex ))
    setLogs((p)=>{ const n={...p}; delete n[current]; return n })
    setDone((p)=>{ const n={...p}; delete n[current]; return n })
    setShowSwap(false)
    setSwapOptions([])
    setSwapReason(''); setSwapComment('')
    try{ localStorage.removeItem(`exstate:${today}:${cur.exId}`) }catch{ /* noop */ }
    const ctx: unknown = await buildTrainingContext(newEx.id, newEx.name)
    const rec = await aiService.generateRecommendation(ctx as never).catch(()=> ({reason:`Vamos con ${cur.weight}kg x ${cur.reps}.`, suggested_weight:cur.weight}))
    setCoach(rec)
  }

  const handleSkipWithReason = ()=>{
    setShowSkipReason(true)
  }

  const confirmSkip = async ()=>{
    if(!cur || !session) return
    const seId = seIdByIndex[current]
    const reason = skipReason.trim() || 'Decidí no realizarlo'
    if(seId){
      const { skipSessionExercise } = await import('@/services/training/sessionStore')
      await skipSessionExercise(seId, reason, undefined).catch(()=>null)
    }
    saveDecision({ date: today, type:'skip', exercise: cur.name, motive: reason, reason: coach?.reason, contextSnapshot:{} } as never)
    setSkipReasons((p)=> ({...p, [current]: reason}))
    setSkipped((p)=> ({...p, [current]: true}))
    setDone({...done, [current]: true})
    try{ localStorage.removeItem(`exstate:${today}:${cur.exId}`) }catch{ /* noop */ }
    setShowSkipReason(false)
    setSkipReason('')
    if(current < exs.length-1) { setCurrent(current+1); nextCoach(current+1) }
    // si era el ultimo, el usuario finaliza con el boton FINALIZAR ENTRENAMIENTO
  }

  const INCOMPLETE_REASONS = ['No tuve tiempo','Falta de equipamiento','Cansancio','Dolor/molestia','Falta de energía','Cambié el entrenamiento','Decidí no realizarlo','Otro']

  // Resumen calculado: ejercicios/series planificadas vs realizadas, reps, volumen, duracion
  const computeSummary = () => {
    const plannedEx = exs.length
    const doneIdx: number[] = []
    const pendingIdx: number[] = []
    const skippedIdx: number[] = []
    exs.forEach((_,i)=> { if(skipped[i]) skippedIdx.push(i); else if(done[i]) doneIdx.push(i); else pendingIdx.push(i) })
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
    if(exs.length===0) return
    if(Date.now()-finishingAt.current<3000) return
    finishingAt.current = Date.now()
    setFinishError('')
    const s = computeSummary()
    const skippedWithReason: Record<number,string> = {}
    for(const i of s.skippedIdx){ skippedWithReason[i] = skipReasons[i] || '' }
    const init: Record<number,{reason:string; comment:string}> = { ...pendingReasons }
    for(const i of s.pendingIdx){
      if(!init[i]) init[i] = { reason: '', comment: skipReasons[i] || '' }
      else if(!init[i].comment && skipReasons[i]) init[i] = { ...init[i], comment: skipReasons[i] }
    }
    setPendingReasons(init)
    // % muscular real (volumen por musculo de series ejecutadas)
    try{
      const volByMuscle: Record<string,number> = {}
      exs.forEach((ex,i)=>{
        const arr = (logs[i]||[]).filter(Boolean)
        if(arr.length===0) return
        let v = 0
        for(const st of arr) v += Number(st?.reps||0)*Number(st?.weight||0)
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
        if(exIds.length===0) continue
        const legacyPast = await db.setLogs.where('exerciseId').anyOf(exIds).filter(l=> l.completed && (l.createdAt||'').slice(0,10)!==today).toArray().catch(()=>[])
        const officialPast = await db.table('setRecords').where('exerciseId').anyOf(exIds).toArray().then((rows)=> (rows as Array<{status:string; completedAt?:string; createdAt:string}>).filter(r=> r.status==='COMPLETED' && (r.completedAt||r.createdAt||'').slice(0,10)!==today).map(r=> ({ createdAt: r.completedAt||r.createdAt }))).catch(()=>[])
        const past = [...legacyPast, ...officialPast]
        const byDay: Record<string,number> = {}
        for(const l of past){ const d=(l.createdAt||'').slice(0,10); byDay[d]=(byDay[d]||0)+1 }
        const days = Object.keys(byDay).sort().slice(-3)
        if(days.length>=2){
          const avg = days.reduce((a,d)=>a+byDay[d],0)/days.length
          const todaySets = exs.reduce((a,ex,i)=> a + (((ex.muscle||'general').toLowerCase()===m) ? (logs[i]||[]).filter(Boolean).length : 0), 0)
          if(todaySets > avg*1.5) alerts.push(`Volumen elevado en ${m}: ${todaySets} series hoy vs prom. ${avg.toFixed(1)} por sesión.`)
          const lastDay = days[days.length-1]
          const gapDays = Math.round((new Date(today).getTime()-new Date(lastDay).getTime())/86400000)
          if(gapDays<=1) alerts.push(`Frecuencia alta en ${m}: última sesión ${lastDay} (hace ${gapDays} día(s)).`)
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
            } else prog[ex.exId] = `Última vez ${last.date}: ${last.sets[0]?.reps}x${last.sets[0]?.weight}kg`
          } else if(!last) prog[ex.exId] = 'Sin registros anteriores.'
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
        } else setSessionStatus('COMPLETING')
      } else setSessionStatus('COMPLETING')
    }catch(e:any){ setFinishError(e?.message || 'No se pudo pasar a COMPLETING') }
    setShowFinishModal(true)
  }

  // Cierre atomico COMPLETING -> COMPLETED/PARTIAL. Si falla el guardado NO finaliza.
  // Cierre atomico COMPLETING -> COMPLETED/PARTIAL (§17: si falla, queda COMPLETING y reintentable).
  const confirmFinish = async () => {
    if(isSaving) return
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
        if(!routineId || exs.length===0) throw new Error('Sin sesión activa: recargá la pestaña Entrenamiento antes de finalizar.')
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
        if(seId) await store.skipSessionExercise(seId, pr.reason, pr.comment || undefined).catch(()=>null)
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
      const changedRaw = localStorage.getItem(`session:changed:${today}`)
      const changed = changedRaw ? JSON.parse(changedRaw) as { changeReason?: string; changeComment?: string } : null
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
      if(!cur) throw new Error('La sesión desapareció del almacén.')
      const items = await store.getSessionExercises(sess.sessionId)
      const preErrs = validateBeforeFinish({ ...cur, sessionStatus: status }, items)
      if(preErrs.length>0) throw new Error(preErrs.join(' · '))
      // 4) transicion final + semana + memoria (si algo falla acá, el catch mantiene COMPLETING)
      await store.transitionSession(sess.sessionId, status)
      try{
        const seqId = `seq-${routineId}-w${weekNumber}`
        const prev: unknown = await db.table('weeklySequences').get(seqId).catch(()=>null)
        const p = (prev || {}) as { completedDays?: number[]; partialDays?: number[]; plannedDays?: number[]; createdAt?: string }
        const done_days = Array.from(new Set([...(p.completedDays||[]), ...(actualDayN!=null?[actualDayN]:[])]))
        await db.table('weeklySequences').put({ id: seqId, cycleId: routineId, weekNumber, plannedDays: p.plannedDays||[], completedDays: done_days, partialDays: status==='PARTIAL' ? [...(p.partialDays||[]), ...(actualDayN!=null?[actualDayN]:[])] : (p.partialDays||[]), createdAt: p.createdAt || new Date().toISOString() } as never)
      }catch{ /* noop */ }
      try{ await db.table('coachMemory').put({ id: `obs-${today}`, type: 'observation', date: today, sessionId: sess.sessionId, sessionStatus: status, routineName: rutinaName, ...({}) } as never) }catch{ /* noop */ }
      for(const ex of exs){ try{ localStorage.removeItem(`exstate:${today}:${ex.exId}`) }catch{ /* noop */ } }
      try{ localStorage.setItem(`althea:result:${today}`, JSON.stringify({ date: today, sessionId: sess.sessionId, sessionStatus: status, exPct: s.exPct, setPct: s.setPct, completedEx: s.completedEx, plannedEx: s.plannedEx, completedSets: s.completedSets, plannedSets: s.plannedSets, totalVol: s.totalVol, totalReps: s.totalReps, durMin: s.durMin, survey: { sessionRating: Number(fs.sessionRating??3), pain: Number(fs.pain??0) }, highlights: Object.values(progressLines) })) }catch{ /* noop */ }
      try{ if(navigator.vibrate) navigator.vibrate([20,40,20]) }catch{ /* noop */ }
      localStorage.removeItem(`session:active:${today}`)
      try{
        const { clearActiveSession } = await import('@/services/training/sessionMachine')
        clearActiveSession()
      }catch{ /* noop */ }
      setSessionStatus(status)
      setShowFinishModal(false)
      setIsSaving(false)
      saveDecision({ date: today, type: status==='COMPLETED'?'accept':'skip', exercise: `Sesión ${rutinaName}`, reason: `Finalizada ${status} — Ej ${s.completedEx}/${s.plannedEx} (${s.exPct}%), Series ${s.completedSets}/${s.plannedSets} (${s.setPct}%)`, contextSnapshot:{} } as never)
    }catch(e: unknown){ setFinishError(e instanceof Error ? e.message : 'Error al guardar. Reintentá sin perder datos.'); setIsSaving(false) }
  }

  // COMENZAR: READY existente -> IN_PROGRESS, o plan pendiente -> crea (recupera activa, §10).
  const startSession = async () => {
    if(isStarting) return
    setIsStarting(true)
    setFinishError('')
    try{
      const store = await import('@/services/training/sessionStore')
      const { saveActiveSession } = await import('@/services/training/sessionMachine')
      const existing = await store.getActiveSession().catch(()=>null)
      if(existing && existing.sessionStatus==='READY'){
        const nx = await store.transitionSession(existing.sessionId, 'IN_PROGRESS')
        const prevMirror = loadActiveSession()
        saveActiveSession({ ...(prevMirror || {}), sessionId: nx.sessionId, calendarDate: nx.calendarDate, routineId: nx.routineId, routineName: nx.routineName || '', plannedDay: nx.plannedDay, plannedDayName: nx.plannedDayName, actualDay: nx.actualDay, actualDayName: nx.actualDayName, plannedMuscleGroups: [], actualMuscleGroups: [], exercises: prevMirror?.exercises || [], sessionStatus: 'IN_PROGRESS', statusHistory: [], startedAt: nx.startedAt, createdAt: nx.createdAt, updatedAt: nx.updatedAt } as never)
        setReadyPlan(null)
        await applyStoreSession(nx)
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
      saveActiveSession({
        sessionId: created.sessionId, calendarDate: today, routineId: created.routineId, routineName: created.routineName || rp.routineName,
        plannedDay: created.plannedDay, plannedDayName: created.plannedDayName, actualDay: created.actualDay, actualDayName: created.actualDayName,
        plannedMuscleGroups: [], actualMuscleGroups: [], exercises: rp.pending.exercises,
        sessionStatus: 'READY', statusHistory: [], createdAt: created.createdAt, updatedAt: created.createdAt,
      } as never)
      const nx = await store.transitionSession(created.sessionId, 'IN_PROGRESS')
      setReadyPlan(null)
      await applyStoreSession(nx)
    }catch(e: unknown){ setFinishError(e instanceof Error ? e.message : 'No se pudo comenzar la sesión.') }finally{ setIsStarting(false) }
  }

  const adoptResumeSession = async (sess: { sessionId: string }, andFinish: boolean) => {
    // Reanudación EXCLUSIVA por sessionId (§11). Misma sesión, sin duplicar.
    try{
      const store = await import('@/services/training/sessionStore')
      const full = await store.getSession(sess.sessionId)
      if(!full){ setFinishError('La sesión a retomar ya no existe.'); return }
      if(full.sessionStatus==='PAUSED') await store.transitionSession(full.sessionId, 'IN_PROGRESS')
      setResumeBanner(null)
      const fresh = await store.getSession(sess.sessionId)
      if(fresh) await applyStoreSession(fresh)
      try{
        const { saveActiveSession } = await import('@/services/training/sessionMachine')
        const cur = await store.getSession(sess.sessionId)
        if(cur) saveActiveSession({ sessionId: cur.sessionId, calendarDate: cur.calendarDate, routineId: cur.routineId, routineName: cur.routineName || '', plannedDay: cur.plannedDay, plannedDayName: cur.plannedDayName, actualDay: cur.actualDay, actualDayName: cur.actualDayName, plannedMuscleGroups: [], actualMuscleGroups: [], exercises: [], sessionStatus: cur.sessionStatus, statusHistory: [], createdAt: cur.createdAt, updatedAt: cur.updatedAt } as never)
      }catch{ /* noop */ }
      if(andFinish) setTimeout(()=> openFinishModal(), 400)
    }catch(e: unknown){ setFinishError(e instanceof Error ? e.message : 'No se pudo retomar la sesión.') }
  }

  const abandonResume = async () => {
    setShowAbandon(true)
  }

  const confirmAbandon = async () => {
    if(!abandonReason.trim()){ setFinishError('Indicá el motivo del abandono.'); return }
    try{
      const store = await import('@/services/training/sessionStore')
      const targetId = resumeBanner?.sessionId || session?.sessionId
      if(!targetId) return
      await store.transitionSession(targetId, 'ABANDONED', { reason: abandonReason.trim(), comment: abandonComment.trim() || undefined })
      try{
        const { clearActiveSession } = await import('@/services/training/sessionMachine')
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
        const { clearActiveSession } = await import('@/services/training/sessionMachine')
        clearActiveSession()
      }catch{ /* noop */ }
      setShowCancel(false)
      setSession(null); setSessionId(''); setSessionStatus('CANCELLED'); setReadyPlan(null)
      setExs([]); setDone({}); setSkipped({}); setLogs({})
    }catch(e: unknown){ setFinishError(e instanceof Error ? e.message : 'No se pudo cancelar la sesión.') }
  }

  const togglePause = async () => {
    try{
      if(!session) return
      const store = await import('@/services/training/sessionStore')
      const cur = await store.getSession(session.sessionId)
      if(!cur) return
      if(cur.sessionStatus==='IN_PROGRESS'){ const nx = await store.transitionSession(cur.sessionId,'PAUSED'); setSession(nx); setSessionStatus('PAUSED') }
      else if(cur.sessionStatus==='PAUSED'){ const nx = await store.transitionSession(cur.sessionId,'IN_PROGRESS'); setSession(nx); setSessionStatus('IN_PROGRESS') }
    }catch(e: unknown){ setFinishError(e instanceof Error ? e.message : 'No se pudo pausar') }
  }

  // Serie individual omitida (SKIPPED) sin saltear todo el ejercicio.
  const skipSetRow = async (setIdx: number) => {
    if(!session) return
    const seId = seIdByIndex[current]
    if(!seId) return
    const { skipSetRecord, getSetRecords } = await import('@/services/training/sessionStore')
    await skipSetRecord(seId, setIdx + 1).catch(()=>null)
    const recs = await getSetRecords(seId).catch(()=>[])
    const arr = [...(logs[current] || [])]
    arr[setIdx] = { skipped: true }
    setLogs({ ...logs, [current]: arr })
    const plannedCount = exs[current]?.plannedSets ?? 0
    if(recs.filter(x=> x.status==='COMPLETED').length + recs.filter(x=> x.status==='SKIPPED').length >= plannedCount && plannedCount>0){
      const allSkipped = recs.length>0 && recs.every(x=> x.status==='SKIPPED')
      if(!allSkipped) setDone({ ...done, [current]: true })
    }
  }

  // Agregar serie extra a la sesión (la rutina no cambia, §24).
  const addSetRow = async () => {
    if(!session || !cur) return
    const seId = seIdByIndex[current]
    if(!seId) return
    const { addExtraSet } = await import('@/services/training/sessionStore')
    await addExtraSet(seId, cur.reps, cur.weight, 'NORMAL').catch(()=>null)
    setExs(prev => prev.map((ex, i) => i === current ? { ...ex, sets: ex.sets + 1 } : ex))
    setDone((p)=>{ const n={...p}; delete n[current]; return n })
  }

  // Agregar ejercicio EXTRA (no planificado, §22): picker del mismo grupo + motivo.
  const openAddExtra = async () => {
    if(!cur) return
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
    if(!session) return
    if(!addExReason.trim()){ setFinishError('Indicá el motivo del ejercicio extra.'); return }
    const { addExtraExercise, logEvent } = await import('@/services/training/sessionStore')
    const methodDef = methodIdRef.current ? getMethod(methodIdRef.current as any)?.defaults : undefined
    const exSets = methodDef?.setsPerExercise ?? 3
    const exReps = methodDef?.repsRange?.[1] ?? 10
    const created = await addExtraExercise(session.sessionId, { exId: opt.id, name: opt.name, sets: exSets, reps: exReps, weight: 0, muscle: opt.muscle })
    await logEvent(session.sessionId, 'EXERCISE_ADDED', { metadata: { reason: addExReason.trim(), comment: addExComment.trim() || undefined } }).catch(()=>null)
    saveDecision({ date: today, type:'modify', exercise: opt.name, reason:`EXTRA: ${addExReason.trim()}`, contextSnapshot:{} } as never)
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
          <section className="bg-surface-container-low border border-outline-variant/50 rounded-xl p-6 stone-slab relative overflow-hidden">
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
            <button onClick={startSession} disabled={isStarting} className="w-full py-3 px-5 rounded bg-primary hover:bg-primary-fixed text-on-primary font-label-caps text-[10px] uppercase font-bold tracking-widest transition-all active:scale-[0.98] shadow-sm mt-4 relative z-10 disabled:opacity-50">{isStarting ? 'Iniciando…' : 'COMENZAR ENTRENAMIENTO'}</button>
            <button onClick={openCancelModal} className="w-full py-2 px-3 rounded bg-surface-container border border-outline-variant/60 font-label-caps text-[10px] uppercase text-on-surface-variant mt-2 relative z-10">Cancelar</button>
          </section>
        </div>
        {showCancel && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowCancel(false)}>
            <div onClick={(e)=>e.stopPropagation()} className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-md p-4 space-y-3">
              <h3 className="font-headline-lg text-base font-semibold text-on-surface">Cancelar entrenamiento</h3>
              <select value={cancelReason} onChange={(e)=>setCancelReason(e.target.value)} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface">
                <option value="">Seleccioná motivo…</option>
                {['Falta de tiempo','Cansancio','Indisposición','Cambio de planes','Falta de equipamiento','Falta de disponibilidad','Otro'].map((r)=>(<option key={r} value={r}>{r}</option>))}
              </select>
              <textarea value={cancelComment} onChange={(e)=>setCancelComment(e.target.value)} placeholder="Comentario (opcional)" rows={2} maxLength={300} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface"/>
              <div className="flex gap-2">
                <button onClick={confirmCancel} className="flex-1 py-3 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Confirmar cancelación</button>
                <button onClick={()=>setShowCancel(false)} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Volver</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if(exs.length===0) return <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 pb-24 max-w-[1440px] w-full mx-auto"><p className="font-body-md text-[15px] text-on-surface">Hoy es descanso o sin ejercicios. Cambiá el día en Inicio.</p></div>
  return (
    <div className="min-h-screen bg-transparent pb-24">
      <div className="max-w-[1440px] w-full mx-auto p-4 md:p-6 lg:p-8 space-y-4">
        {/* Resume Banner */}
        {resumeBanner && (
          <div className="rounded-xl bg-secondary-container/20 border border-secondary/30 p-4 space-y-2">
            <div className="font-body-md text-[15px] text-on-surface font-medium">Tenés un entrenamiento en progreso ({resumeBanner.calendarDate}).</div>
            <div className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">{resumeBanner.routineName} — {resumeBanner.dayName} · estado {resumeBanner.status} · {resumeBanner.exerciseCount} ejercicios</div>
            <div className="flex gap-2">
              <button onClick={()=> adoptResumeSession(resumeBanner, false)} className="flex-1 py-2 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Continuar</button>
              <button onClick={()=> adoptResumeSession(resumeBanner, true)} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Finalizar</button>
              <button onClick={abandonResume} className="flex-1 py-2 rounded bg-surface-container/60 border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Abandonar</button>
            </div>
          </div>
        )}
        {(sessionStatus==='COMPLETED' || sessionStatus==='PARTIAL') && <ResultPanel today={today} sessionStatus={sessionStatus} />}

        {/* Session Hero Header */}
        <section className="bg-surface-container-low border border-outline-variant/50 rounded-xl p-6 stone-slab relative overflow-hidden">
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
              <button onClick={()=>{
                const raw=JSON.parse(localStorage.getItem('rutinas:list')||'null')
                const activeId=localStorage.getItem('rutina:activeId')
                const active:any=raw?.find((r:any)=>r.id===activeId)
                if(!active) return
                const todayStr=new Date().toISOString().slice(0,10)
                const choice=prompt(`Cambiar día — elegí N°:\n${active.cycle.trainingDays.map((d:any)=>`${d.n} — ${d.name}`).join('\n')}\nEscribí N°:`)
                if(choice){
                  const n=Number(choice)
                  if(active.cycle.trainingDays.find((d:any)=>d.n===n)){
                    localStorage.setItem(`session:override:${today}`, String(n))
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

        {restFlash && restSec===0 && <button onClick={()=>setRestFlash(false)} className="w-full flex items-center justify-center gap-2 font-body-md text-[15px] text-on-surface st-completed border rounded p-2 fade-in"><Check size={14}/> Descanso terminado — a entrenar</button>}

        {/* Main Grid: 8-col exercise + 4-col sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* 8-col: Active Exercise + Upcoming */}
          <div className="lg:col-span-8 space-y-6">
            {/* Active Exercise Card */}
            {cur && (
              <div className="bg-surface-container-low border border-secondary/40 rounded-xl stone-slab plinth-active overflow-hidden">
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
                      <button onClick={async()=>{ const v=painAns.trim(); if(!v) return; const { saveAnswer } = await import('@/services/ai/coachMemory'); await saveAnswer(`pain:${painAlert.zone.toLowerCase()}`, `¿Cómo está hoy la molestia en ${painAlert.zone}?`, v); setPainAlert(null); setPainAns(''); runSafetyCheck() }} className="px-3 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Guardar</button>
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
                <div className="px-6 pb-4 flex gap-2">
                  <button onClick={()=>{ setMod({weight:cur.weight,reps:cur.reps,sets:cur.sets, seriesType:'Normal'}); setShowModify(true)}} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant/60 font-label-caps text-[10px] uppercase text-on-surface-variant transition-colors hover:border-secondary/40">Modificar</button>
                  <button onClick={handleSkipWithReason} className="flex-1 py-2 rounded bg-surface-container/60 border border-outline-variant/60 font-label-caps text-[10px] uppercase text-on-surface-variant transition-colors hover:border-secondary/40">Saltar</button>
                </div>

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
                      <div key={origIdx} className="bg-surface-container-low border border-outline-variant/50 rounded-xl p-5 stone-slab hover:border-secondary/40 transition-colors group cursor-pointer" onClick={()=>{ setCurrent(origIdx); nextCoach(origIdx) }}>
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
              <div className="bg-surface-container-low border border-outline-variant/60 rounded-xl p-6 stone-slab flex flex-col items-center text-center relative overflow-hidden">
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
                    <circle className="text-secondary transition-all duration-1000" cx="80" cy="80" fill="transparent" r="70" stroke="currentColor" strokeDasharray={440} strokeDashoffset={440 - (440 * restSec / (methodIdRef.current ? (getMethod(methodIdRef.current as any)?.defaults.restSeconds ?? 90) : 90))} strokeLinecap="round" strokeWidth="6" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <button onClick={()=>{ const v=!restPaused; setRestPaused(v); restPausedRef.current=v }} aria-label={restPaused?'Reanudar descanso':'Pausar descanso'} className="text-[44px] leading-none font-semibold text-on-surface font-mono tracking-tight bg-transparent border-none cursor-pointer hover:text-secondary transition-colors">
                      {Math.floor(restSec/60)}:{String(restSec%60).padStart(2,'0')}
                    </button>
                    <span className="font-label-caps text-[10px] text-primary tracking-widest mt-1">{restPaused ? 'PAUSADO' : 'RESPIRA HONDO'}</span>
                  </div>
                </div>
                {/* Timer adjust buttons */}
                <div className="grid grid-cols-3 gap-2 w-full mt-4">
                  <button onClick={()=>setRestSec((s)=>Math.max(0,s-15))} className="px-2 py-1.5 rounded bg-surface-container border border-outline-variant/60 hover:border-secondary text-on-surface-variant hover:text-on-surface font-label-md text-[14px] transition-all active:scale-95">-15s</button>
                  <button onClick={()=>setRestSec((s)=>s+30)} className="px-2 py-1.5 rounded bg-surface-container border border-outline-variant/60 hover:border-secondary text-on-surface-variant hover:text-on-surface font-label-md text-[14px] transition-all active:scale-95">+30s</button>
                  <button onClick={()=>{ setRestSec(0); setRestFlash(false) }} className="px-2 py-1.5 rounded bg-secondary-container/50 border border-secondary/40 text-secondary hover:bg-secondary hover:text-on-secondary-fixed font-label-caps text-[10px] uppercase font-bold transition-all active:scale-95">SALTAR</button>
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
            <div className="bg-surface-container-low border border-primary/30 rounded-xl p-5 stone-slab mt-auto">
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

        {showModify && cur && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowModify(false)}>
            <div onClick={e=>e.stopPropagation()} className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-md p-4 space-y-3">
              <h3 className="font-headline-lg text-base font-semibold text-on-surface">Modificar {cur.name}</h3>
              <div className="grid grid-cols-3 gap-2">
                <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Peso<input type="number" value={mod.weight} onChange={e=>setMod({...mod, weight:Number(e.target.value)})} className="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/></label>
                <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Reps<input type="number" value={mod.reps} onChange={e=>setMod({...mod, reps:Number(e.target.value)})} className="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/></label>
                <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Series<input type="number" value={mod.sets} onChange={e=>setMod({...mod, sets:Number(e.target.value)})} className="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/></label>
              </div>
              <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Tipo de serie
                <select onChange={e=> setMod({...mod, seriesType: e.target.value} as any)} className="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface">
                  <option>Normal</option><option>Ascendente</option><option>Descendente</option><option>Piramidal</option><option>DropSet</option><option>Otra</option>
                </select>
              </label>
              <button onClick={async ()=>{
                setExs(prev => prev.map((ex, i) => i === current ? { ...ex, weight: mod.weight, reps: mod.reps, sets: mod.sets } : ex))
                const seId = seIdByIndex[current]
                if(seId){
                  const { db: dexieDb } = await import('@/services/storage/db')
                  const se = await dexieDb.table('sessionExercises').get(seId).catch(()=>null) as any
                  if(se){
                    const newPlannedSets = Array.from({length: mod.sets}, (_:any, i:number) => ({
                      order: i,
                      reps: mod.reps,
                      weight: mod.weight,
                      setType: (mod.seriesType || 'NORMAL').toUpperCase().replace(' ','_'),
                    }))
                    await dexieDb.table('sessionExercises').put({ ...se, plannedSetCount: mod.sets, plannedSets: newPlannedSets, updatedAt: new Date().toISOString() })
                  }
                }
                saveDecision({ date: today, type:'modify', exercise: cur.name, reason:`Modificado a ${mod.weight}kg × ${mod.reps} × ${mod.sets}`, contextSnapshot:{mod}} as any)
                setShowModify(false)
              }} className="w-full py-3 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Aplicar</button>
            </div>
          </div>
        )}

        {viewer && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2" onClick={()=>setViewer(null)}>
            <div onClick={e=>e.stopPropagation()} className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
              <div className="p-4 flex justify-between"><span className="font-headline-lg text-base font-semibold text-on-surface">{viewer.name}</span><button onClick={()=>setViewer(null)} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center"><BrandIcon name="close" size={16}/></button></div>
              <div className="p-4">
                <div className="rounded bg-surface-container-low border border-outline-variant flex items-center justify-center min-h-[300px] p-2">
                  {viewer.gifUrl ? <img src={viewer.gifUrl} alt={viewer.name} className="max-w-full max-h-[60vh] object-contain"/> : <span className="font-label-caps text-[10px] uppercase text-on-surface-variant">Sin GIF</span>}
                </div>
                <div className="font-label-caps text-[10px] uppercase text-on-surface-variant mt-2">{viewer.muscle} · {viewer.equipment}</div>
                <ol className="list-decimal list-inside font-body-md text-[15px] text-on-surface mt-1">{viewer.instructions?.slice(0,4).map((s,i)=><li key={i}>{s}</li>)}</ol>
              </div>
            </div>
          </div>
        )}

        {showSwap && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>{setShowSwap(false); setSwapOptions([])}}>
            <div onClick={e=>e.stopPropagation()} className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-lg lg:max-w-2xl p-4 space-y-3 max-h-[80vh] overflow-auto">
              <div className="flex justify-between items-center">
                <h3 className="font-headline-lg text-base font-semibold text-on-surface">Cambiar ejercicio — {cur?.muscle || 'mismo grupo'}</h3>
                <button onClick={()=>{setShowSwap(false); setSwapOptions([])}} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center"><BrandIcon name="close" size={16}/></button>
              </div>
              <p className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">Elegí una alternativa del mismo grupo muscular</p>
              <div className="space-y-2 max-h-60 overflow-auto">
                {swapLoading && <p className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">Calculando similitud…</p>}
                {!swapLoading && swapOptions.length===0 && <p className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">Sin alternativas en este grupo muscular.</p>}
                {!swapLoading && swapOptions.length>0 && <div className="font-label-caps text-[10px] uppercase text-secondary tracking-wider font-semibold">Mejor reemplazo · {swapOptions[0].score}%</div>}
                {!swapLoading && swapOptions.slice(0,1).map((r)=>(
                  <div key={r.exercise.id} className="rounded bg-surface-container-high border border-primary/40 p-3">
                    <button onClick={()=> handleSwap(r.exercise)} className="w-full text-left flex items-center gap-3">
                      {r.exercise.gifUrl ? <img src={r.exercise.gifUrl} alt={r.exercise.name} className="w-12 h-12 rounded-lg object-cover"/> : null}
                      <div className="flex-1 min-w-0"><div className="font-body-md text-[15px] text-on-surface font-medium truncate">{r.exercise.name}</div><div className="font-label-caps text-[10px] uppercase text-on-surface-variant">{r.exercise.muscle} · {r.exercise.equipment}</div></div>
                      <span className="font-headline-sm text-[20px] font-semibold text-on-surface shrink-0">{r.score}%</span>
                    </button>
                    <button onClick={()=> setSwapExplain(swapExplain===r.exercise.id?null:r.exercise.id)} className="font-label-caps text-[10px] text-secondary underline mt-1">Por qué este %</button>
                    {swapExplain===r.exercise.id && (<ul className="mt-1 space-y-0.5">{r.factors.map((f)=>(<li key={f.key} className="font-label-caps text-[10px] uppercase text-on-surface-variant">{f.state==='match'?'✓':f.state==='miss'?'✕':f.state==='partial'?'◐':'—'} {f.label} — {f.detail}</li>))}</ul>)}
                  </div>
                ))}
                {!swapLoading && swapOptions.length>1 && <div className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider font-medium pt-1">Otras alternativas</div>}
                {!swapLoading && swapOptions.slice(1).map((r)=>(
                  <div key={r.exercise.id} className="rounded bg-surface-container border border-outline-variant p-3">
                    <button onClick={()=> handleSwap(r.exercise)} className="w-full text-left flex items-center gap-3">
                      {r.exercise.gifUrl ? <img src={r.exercise.gifUrl} alt={r.exercise.name} className="w-12 h-12 rounded-lg object-cover"/> : null}
                      <div className="flex-1 min-w-0"><div className="font-body-md text-[15px] text-on-surface font-medium truncate">{r.exercise.name}</div><div className="font-label-caps text-[10px] uppercase text-on-surface-variant">{r.exercise.muscle} · {r.exercise.equipment}</div></div>
                      <span className="font-headline-sm text-[20px] font-semibold text-on-surface shrink-0">{r.score}%</span>
                    </button>
                    <button onClick={()=> setSwapExplain(swapExplain===r.exercise.id?null:r.exercise.id)} className="font-label-caps text-[10px] text-secondary underline mt-1">Por qué este %</button>
                    {swapExplain===r.exercise.id && (<ul className="mt-1 space-y-0.5">{r.factors.map((f)=>(<li key={f.key} className="font-label-caps text-[10px] uppercase text-on-surface-variant">{f.state==='match'?'✓':f.state==='miss'?'✕':f.state==='partial'?'◐':'—'} {f.label} — {f.detail}</li>))}</ul>)}
                  </div>
                ))}
              </div>
              <select value={swapReason} onChange={(e)=>setSwapReason(e.target.value)} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface">
                <option value="">Motivo del cambio…</option>
                {['Molestia / dolor','Falta de equipamiento','Prefiero otra variante','Recomendación del coach','Otro'].map((r)=>(<option key={r} value={r}>{r}</option>))}
              </select>
              <textarea value={swapComment} onChange={(e)=>setSwapComment(e.target.value)} placeholder="Comentario (opcional)" rows={2} maxLength={300} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
              <button onClick={()=>{setShowSwap(false); setSwapOptions([])}} className="w-full py-2 rounded bg-surface-container border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Cancelar</button>
            </div>
          </div>
        )}

        {showSkipReason && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowSkipReason(false)}>
            <div onClick={e=>e.stopPropagation()} className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-md p-4 space-y-3">
              <h3 className="font-headline-lg text-base font-semibold text-on-surface">Saltar {cur?.name}</h3>
              <p className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">Motivo (opcional)</p>
              <textarea value={skipReason} onChange={e=>setSkipReason(e.target.value)} placeholder="Ej: molestia en hombro, sin equipamiento, fatiga..." rows={3} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
              <div className="flex gap-2">
                <button onClick={confirmSkip} className="flex-1 py-3 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Confirmar salto</button>
                <button onClick={()=>{setShowSkipReason(false); setSkipReason('')}} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {showCancel && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowCancel(false)}>
            <div onClick={(e)=>e.stopPropagation()} className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-md p-4 space-y-3">
              <h3 className="font-headline-lg text-base font-semibold text-on-surface">Cancelar entrenamiento</h3>
              <p className="font-body-sm text-[13px] text-on-surface-variant">La cancelación requiere justificación y queda registrada.</p>
              <select value={cancelReason} onChange={(e)=>setCancelReason(e.target.value)} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface">
                <option value="">Seleccioná motivo…</option>
                {['Falta de tiempo','Cansancio','Indisposición','Cambio de planes','Falta de equipamiento','Falta de disponibilidad','Otro'].map((r)=>(<option key={r} value={r}>{r}</option>))}
              </select>
              <textarea value={cancelComment} onChange={(e)=>setCancelComment(e.target.value)} placeholder="Comentario (opcional)" rows={2} maxLength={300} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
              <div className="flex gap-2">
                <button onClick={confirmCancel} className="flex-1 py-3 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Confirmar cancelación</button>
                <button onClick={()=>setShowCancel(false)} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Volver</button>
              </div>
            </div>
          </div>
        )}

        {showAbandon && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowAbandon(false)}>
            <div onClick={(e)=>e.stopPropagation()} className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-md p-4 space-y-3">
              <h3 className="font-headline-lg text-base font-semibold text-on-surface">Abandonar entrenamiento</h3>
              <p className="font-body-sm text-[13px] text-on-surface-variant">Se conservan las series y ejercicios ya registrados. El abandono queda como dato histórico.</p>
              <select value={abandonReason} onChange={(e)=>setAbandonReason(e.target.value)} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface">
                <option value="">Seleccioná motivo…</option>
                {['Falta de tiempo','Cansancio','Dolor/molestia','Indisposición','Cambio de planes','Falta de equipamiento','Otro'].map((r)=>(<option key={r} value={r}>{r}</option>))}
              </select>
              <textarea value={abandonComment} onChange={(e)=>setAbandonComment(e.target.value)} placeholder="Comentario (opcional)" rows={2} maxLength={300} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
              <div className="flex gap-2">
                <button onClick={confirmAbandon} className="flex-1 py-3 rounded bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold">Confirmar abandono</button>
                <button onClick={()=>setShowAbandon(false)} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant font-label-caps text-[10px] uppercase text-on-surface-variant">Volver</button>
              </div>
            </div>
          </div>
        )}

        {showAddEx && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowAddEx(false)}>
            <div onClick={(e)=>e.stopPropagation()} className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-lg lg:max-w-2xl p-4 space-y-3 max-h-[80vh] overflow-auto">
              <div className="flex justify-between items-center">
                <h3 className="font-headline-lg text-base font-semibold text-on-surface">Agregar ejercicio EXTRA</h3>
                <button onClick={()=>setShowAddEx(false)} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center"><BrandIcon name="close" size={16}/></button>
              </div>
              <p className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">No planificado · quedará marcado EXTRA con su motivo.</p>
              <select value={addExReason} onChange={(e)=>setAddExReason(e.target.value)} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface">
                <option value="">Motivo del agregado…</option>
                {['Quiero trabajar más este grupo','Me siento con energía','Recomendación del coach','Recuperar ejercicio pendiente','Otro'].map((r)=>(<option key={r} value={r}>{r}</option>))}
              </select>
              <textarea value={addExComment} onChange={(e)=>setAddExComment(e.target.value)} placeholder="Comentario (opcional)" rows={2} maxLength={300} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
              <div className="space-y-2 max-h-60 overflow-auto">
                {addExOptions.map((opt: Gym.Exercise)=>(
                  <button key={opt.id} onClick={()=>confirmAddExtra(opt)} className="w-full text-left p-3 rounded bg-surface-container border border-outline-variant flex items-center gap-3 hover:bg-surface-container-high/40 transition">
                    {opt.gifUrl ? <img src={opt.gifUrl} alt={opt.name} className="w-12 h-12 rounded-lg object-cover"/> : null}
                    <div>
                      <div className="font-body-md text-[15px] text-on-surface font-medium">{opt.name}</div>
                      <div className="font-label-caps text-[10px] uppercase text-on-surface-variant">{opt.muscle} · {opt.equipment}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {showFinishModal && (()=>{
          const s = computeSummary()
          const setSurvey = (k:string,v:any)=> setFinishSurvey((p)=> ({...p,[k]:v}))
          return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-container/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-lg lg:max-w-2xl p-4 space-y-4 max-h-[90vh] overflow-auto">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-lg text-base font-semibold text-on-surface">Finalizar entrenamiento</h3>
                <span className="px-3 py-1 rounded-full bg-secondary-container/20 border border-secondary/30 text-secondary font-label-caps text-[10px] uppercase">COMPLETING</span>
              </div>

              <div className="bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant/50 rounded-lg p-3">
                <div className="font-label-caps text-[10px] uppercase text-secondary font-semibold tracking-wider mb-2">RESUMEN</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Rutina</span><span className="font-body-md text-[15px] text-on-surface text-right">{rutinaName}</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Semana</span><span className="font-body-md text-[15px] text-on-surface text-right">{weekNumber}</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Día planificado</span><span className="font-body-md text-[15px] text-on-surface text-right">{plannedDayN!=null ? `N°${plannedDayN} ${plannedName}` : '—'}</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Día realizado</span><span className="font-body-md text-[15px] text-on-surface text-right">{actualDayN!=null ? `N°${actualDayN} ${dayName}` : dayName}</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios planificados</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.plannedEx}</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios completados</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.completedEx}</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios no realizados</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.pendingIdx.length}</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios omitidos</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.skippedIdx.length}</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios modificados</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.modified}</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios reemplazados</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.replaced}</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Series planificadas</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.plannedSets}</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Series realizadas</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.completedSets}</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Repeticiones</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.totalReps}</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Volumen</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.totalVol} kg</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Duración</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.durMin} min</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Ejercicios</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.exPct}%</span>
                  <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Series</span><span className="font-body-md text-[15px] text-on-surface text-right">{s.setPct}%</span>
                </div>
                {(s.pendingIdx.length===0 && s.skippedIdx.length===0)
                  ? <p className="font-label-caps text-[10px] text-primary mt-2">Todos los ejercicios planificados fueron registrados.</p>
                  : <p className="font-label-caps text-[10px] text-secondary mt-2">Entrenamiento parcial — {s.exPct}% · El entrenamiento tiene ejercicios pendientes.</p>}
              </div>

              {s.pendingIdx.length>0 && (
                <div className="rounded bg-surface-container border border-outline-variant p-3 space-y-3">
                  <div className="font-label-caps text-[10px] uppercase text-secondary font-semibold tracking-wider">Ejercicios pendientes — ¿Qué ocurrió?</div>
                  {s.pendingIdx.map((i)=>(
                    <div key={i} className="rounded bg-surface-container-high/30 border border-outline-variant/30 p-3 space-y-2">
                      <div className="font-body-md text-[15px] text-on-surface font-medium">{exs[i]?.name} no fue realizado.</div>
                      <div className="font-label-caps text-[10px] uppercase text-on-surface-variant">Planificado: {exs[i]?.sets} series · Realizado: {((logs[i]||[]).filter(Boolean) as any[]).length} series</div>
                      <select value={pendingReasons[i]?.reason || ''} onChange={(e)=> setPendingReasons((p)=> ({...p, [i]: { reason: e.target.value, comment: p[i]?.comment || '' }}))} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface">
                        <option value="">Seleccioná motivo…</option>
                        {INCOMPLETE_REASONS.map((r)=> <option key={r} value={r}>{r}</option>)}
                      </select>
                      <textarea value={pendingReasons[i]?.comment || ''} onChange={(e)=> setPendingReasons((p)=> ({...p, [i]: { reason: p[i]?.reason || '', comment: e.target.value }}))} placeholder="Observación / explicación" rows={2} maxLength={500} className="w-full bg-surface-container border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
                    </div>
                  ))}
                </div>
              )}

              {s.skippedIdx.length>0 && (
                <div className="rounded bg-surface-container border border-outline-variant p-3 space-y-1">
                  <div className="font-label-caps text-[10px] uppercase text-on-surface-variant font-semibold tracking-wider">Omitidos durante la sesión (con motivo)</div>
                  {s.skippedIdx.map((i)=> <p key={i} className="font-body-sm text-[13px] text-on-surface-variant">{exs[i]?.name} — {skipReasons[i] || pendingReasons[i]?.comment || 'sin motivo'}</p>)}
                </div>
              )}

              {musclePct.length>0 && (
                <div className="rounded bg-surface-container border border-outline-variant p-3 space-y-1">
                  <div className="font-label-caps text-[10px] uppercase text-secondary font-semibold tracking-wider mb-1">Trabajo muscular real</div>
                  {musclePct.map((x)=>(
                    <div key={x.m} className="flex items-center gap-2 text-sm">
                      <span className="font-label-caps text-[10px] uppercase text-on-surface-variant w-24 capitalize">{x.m}</span>
                      <div className="flex-1 h-2 bg-surface-container-highest rounded-full overflow-hidden"><div className="h-2 bg-primary rounded-full" style={{width: `${x.pct}%`}}/></div>
                      <span className="font-body-md text-[15px] text-on-surface w-10 text-right">{x.pct}%</span>
                    </div>
                  ))}
                </div>
              )}

              {volumeAlerts.length>0 && (
                <div className="rounded bg-secondary-container/20 border border-secondary/30 p-3 space-y-1">
                  <div className="font-label-caps text-[10px] uppercase text-secondary font-semibold tracking-wider">Alertas de volumen / frecuencia</div>
                  {volumeAlerts.map((a,i)=> <p key={i} className="font-body-sm text-[13px] text-on-surface-variant">{a}</p>)}
                </div>
              )}

              {Object.keys(progressLines).length>0 && (
                <div className="rounded bg-surface-container border border-outline-variant p-3 space-y-1">
                  <div className="font-label-caps text-[10px] uppercase text-on-surface-variant font-semibold tracking-wider mb-1">Progreso vs anterior</div>
                  {Object.entries(progressLines).map(([k,v])=> <p key={k} className="font-body-sm text-[13px] text-on-surface-variant">{v}</p>)}
                </div>
              )}

              <div className="rounded bg-surface-container border border-outline-variant p-3 space-y-3">
                <div className="font-label-caps text-[10px] uppercase text-secondary font-semibold tracking-wider">Encuesta post-entrenamiento</div>
                {/* Pregunta 1: ¿Cómo fue la sesión? */}
                <div>
                  <label className="font-label-caps text-[10px] uppercase text-on-surface-variant block mb-2">¿Cómo fue la sesión?</label>
                  <div className="flex gap-2">
                    {[
                      { v:1, emoji:'😫', label:'Mala' },
                      { v:2, emoji:'😔', label:'Regular' },
                      { v:3, emoji:'😐', label:'Normal' },
                      { v:4, emoji:'😊', label:'Buena' },
                      { v:5, emoji:'🤩', label:'Excelente' },
                    ].map(({ v, emoji, label })=>(
                      <button key={v} onClick={()=> setSurvey('sessionRating', v)}
                        className={`flex-1 flex flex-col items-center gap-1 py-2 rounded border transition text-sm ${Number(finishSurvey.sessionRating)===v ? 'bg-primary border-primary text-on-primary' : 'bg-surface-container-high/30 border-outline-variant text-on-surface-variant'}`}>
                        <span className="text-lg">{emoji}</span>
                        <span className="font-label-caps text-[10px]">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Pregunta 2: ¿Dolor? */}
                <div>
                  <label className="font-label-caps text-[10px] uppercase text-on-surface-variant block mb-2">¿Dolor durante o después?</label>
                  <div className="flex gap-2">
                    <button onClick={()=> setSurvey('pain', 0)}
                      className={`flex-1 py-2 rounded border transition text-sm ${Number(finishSurvey.pain)===0 ? 'bg-primary border-primary text-on-primary' : 'bg-surface-container-high/30 border-outline-variant text-on-surface-variant'}`}>
                      No
                    </button>
                    <button onClick={()=> setSurvey('pain', 1)}
                      className={`flex-1 py-2 rounded border transition text-sm ${Number(finishSurvey.pain)===1 ? 'bg-primary border-primary text-on-primary' : 'bg-surface-container-high/30 border-outline-variant text-on-surface-variant'}`}>
                      Sí
                    </button>
                  </div>
                  {Number(finishSurvey.pain)===1 && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input value={finishSurvey.painZone || ''} onChange={(e)=> setSurvey('painZone', e.target.value)} placeholder="Zona del dolor" maxLength={80} className="bg-surface-container-high/30 border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
                      <input value={finishSurvey.painDetail || ''} onChange={(e)=> setSurvey('painDetail', e.target.value)} placeholder="Tipo de dolor" maxLength={140} className="bg-surface-container-high/30 border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
                    </div>
                  )}
                </div>
                {/* Pregunta 3: Comentario libre */}
                <textarea value={finishSurvey.comment || ''} onChange={(e)=> setSurvey('comment', e.target.value)} placeholder="¿Algo que quieras decirle al Coach?" rows={2} maxLength={500} className="w-full bg-surface-container-high/30 border border-outline-variant rounded p-2 font-body-md text-[15px] text-on-surface"/>
              </div>

              {finishError && <p className="text-sm text-red-400">{finishError}</p>}

              <button onClick={confirmFinish} disabled={isSaving} className="w-full py-3 px-5 rounded bg-primary hover:bg-primary-fixed text-on-primary font-label-caps text-[10px] uppercase font-bold tracking-widest transition-all active:scale-[0.98] shadow-sm disabled:opacity-50">
                {isSaving ? 'Guardando…' : ((s.pendingIdx.length===0 && s.skippedIdx.length===0) ? 'Confirmar — COMPLETED' : `Confirmar — PARTIAL (${s.exPct}%)`)}
              </button>
              <button onClick={async()=>{ try{ const store = await import('@/services/training/sessionStore'); const targetId = session?.sessionId || sessionId; if(targetId){ const cur = await store.getSession(targetId).catch(()=>null); if(cur && cur.sessionStatus==='COMPLETING'){ const nx = await store.transitionSession(targetId,'IN_PROGRESS'); setSession(nx); setSessionStatus('IN_PROGRESS') } } }catch{ /* noop */ } setShowFinishModal(false) }} className="w-full py-2.5 rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant/50 font-label-caps text-[10px] uppercase text-on-surface-variant">Volver al entrenamiento</button>
            </div>
          </div>
          )
        })()}
      </div>
    </div>
  )
}

function ResultPanel({ today, sessionStatus }:{ today:string; sessionStatus:string }){
  let r: null | { exPct:number; setPct:number; completedEx:number; plannedEx:number; completedSets:number; plannedSets:number; totalVol:number; totalReps:number; durMin:number; survey:{sessionRating:number;pain:number}; highlights:string[] } = null
  try{ const raw = localStorage.getItem(`althea:result:${today}`); if(raw) r = JSON.parse(raw) }catch{ /* noop */ }
  if(!r) return (
    <div className="bg-surface-container-low border border-outline-variant/50 rounded-xl p-6 stone-slab">
      <div className="font-body-md text-[15px] text-on-surface font-medium">{sessionStatus==='COMPLETED' ? 'Entrenamiento completado — 100%' : 'Entrenamiento parcial'}</div>
      <div className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">Sesión guardada en historial.</div>
    </div>
  )
  const stats = [
    { k:'Ejercicios', v:`${r.completedEx}/${r.plannedEx}` },
    { k:'Series', v:`${r.completedSets}/${r.plannedSets}` },
    { k:'Cumplimiento', v:`${r.exPct}%` },
    { k:'Duración', v:`${r.durMin} min` },
    { k:'Volumen', v:`${r.totalVol} kg` },
    { k:'Reps', v:`${r.totalReps}` },
  ]
  return (
    <div className="bg-surface-container-low border border-outline-variant/50 rounded-xl p-6 stone-slab space-y-3 fade-in">
      <div>
        <div className="font-headline-lg text-lg font-semibold text-on-surface">Esto es lo que hiciste</div>
        <div className="font-label-caps text-[10px] uppercase text-on-surface-variant tracking-wider">{sessionStatus==='COMPLETED' ? 'Sesión completada — 100%' : `Sesión parcial — ${r.exPct}%`} · Valoración {r.survey.sessionRating}/5{r.survey.pain ? ' · Dolor reportado' : ''}</div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s)=>(
          <div key={s.k} className="bg-surface-container-high/30 border border-outline-variant/40 rounded-lg p-3 text-center">
            <div className="font-label-caps text-[10px] uppercase text-outline tracking-wider">{s.k}</div>
            <div className="font-headline-sm text-[20px] font-semibold text-on-surface">{s.v}</div>
          </div>
        ))}
      </div>
      {r.highlights.length>0 && (
        <div className="rounded bg-surface-container/60 border border-outline-variant/30 p-3 space-y-1">
          <div className="font-label-caps text-[10px] uppercase text-secondary font-semibold tracking-wider">Logros y progreso</div>
          {r.highlights.slice(0,5).map((h,i)=>(<p key={i} className="font-body-sm text-[13px] text-primary">{h}</p>))}
        </div>
      )}
    </div>
  )
}

function ExerciseHeader({ name, muscle, secondary }: { name:string; muscle?:string; secondary?:string[] }){
  const secs = secondary || []
  const pcts = secs.length===0 ? [{n:muscle||'General', p:100}] : secs.length===1 ? [{n:muscle, p:60},{n:secs[0], p:40}] : [{n:muscle,p:60},{n:secs[0],p:30},{n:secs[1],p:10}]
  return (
    <div className="rounded bg-surface-container/60 border border-outline-variant/30 p-2">
      <div className="font-body-md text-[15px] text-on-surface font-medium">{name}</div>
      <div className="flex flex-wrap gap-1 mt-1">
        {pcts.filter(x=>x.n).map(x=> (
          <span key={x.n} className={`px-2 py-0.5 rounded-full border font-label-caps text-[10px] uppercase ${x.p>=60?'bg-primary-container/20 border-primary/40 text-primary':'bg-surface-container-high/30 border-outline-variant/40 text-on-surface-variant'}`}>{x.n}: {x.p}%</span>
        ))}
      </div>
    </div>
  )
}
function ExerciseHeaderInline({ exId, fallbackMuscle }:{ exId:string; fallbackMuscle?:string }){
  const [info,setInfo]=useState<any>(null)
  useEffect(()=>{
    let cancelled=false
    const load=async()=>{
      if(exId.includes('/')){
        try{
          const [m,slug]=exId.split('/')
          const ex:any = await Gym.fetchOne(m,slug).catch(()=>null)
          if(ex && !cancelled) setInfo(ex)
        }catch{}
      } else {
        // busca en pectorals como fallback
        try{
          const res=await Gym.fetchByMuscle('pectorals').catch(()=>null) as any
          const found=res?.exercises.find((e:any)=> e.id===exId)
          if(found && !cancelled) setInfo(found)
        }catch{}
      }
    }
    load()
    return ()=>{ cancelled=true }
  },[exId])
  const muscle = info?.muscle || fallbackMuscle || 'General'
  const secondary = info?.secondaryMuscles || []
  const pcts = secondary.length===0 ? [{n:muscle, p:100}] : secondary.length===1 ? [{n:muscle,p:60},{n:secondary[0],p:40}] : [{n:muscle,p:60},{n:secondary[0],p:30},{n:secondary[1],p:10}]
  return (
    <span className="inline-flex flex-wrap gap-1">
      {pcts.filter(x=>x.n).map(x=> (
        <span key={x.n} className="px-1.5 py-0.5 rounded-full bg-surface-container-high/30 border border-outline-variant/40 font-label-caps text-[10px] uppercase text-on-surface-variant">{x.n}: {x.p}%</span>
      ))}
    </span>
  )
}

const EX_STATE_KEY = (today:string, exId:string) => `exstate:${today}:${exId}`

function ExerciseSeriesTable({ exerciseId, today, sets, plannedReps, plannedWeight, onComplete, onSkipSet, onAddSet, logs, initialCompleted, initialSkipped }:{ exerciseId:string; today:string; sets:number; plannedReps:number; plannedWeight:number; onComplete:(idx:number,w:number,r:number,neg?:any,obs?:string)=>void; onSkipSet?:(idx:number)=>void; onAddSet?:()=>void; logs:any[]; initialCompleted?:Record<number,{weight:number;reps:number}>; initialSkipped?:number[] }){
  const [refs,setRefs]=useState<Record<number,any>>({})
  const [weights,setWeights]=useState<Record<number,number>>({})
  const [reps,setReps]=useState<Record<number,number>>({})
  const [checks,setChecks]=useState<Record<number,boolean>>({})
  const [negEnabled,setNegEnabled]=useState(false)
  const [negReps,setNegReps]=useState('')
  const [negWeight,setNegWeight]=useState('')
  const [obs,setObs]=useState('')
  const [exInfo,setExInfo]=useState<any>(null)
  const [loaded,setLoaded]=useState(false)
  const [lastSession,setLastSession]=useState<{date:string; sets:{setNumber:number;weight:number;reps:number}[]} | null>(null)
  const [prevSessions,setPrevSessions]=useState<{date:string; totalVolume:number; setsCount:number}[]>([])

  // persist helpers
  const loadPersisted = useCallback(()=>{
    try{
      const raw = localStorage.getItem(EX_STATE_KEY(today, exerciseId))
      if(raw){
        const s = JSON.parse(raw)
        if(s.weights) setWeights(s.weights)
        if(s.reps) setReps(s.reps)
        if(s.checks) setChecks(s.checks)
        if(typeof s.negEnabled==='boolean') setNegEnabled(s.negEnabled)
        if(s.negReps) setNegReps(s.negReps)
        if(s.negWeight) setNegWeight(s.negWeight)
        if(s.obs) setObs(s.obs)
      }
    }catch{}
  }, [today, exerciseId])

  const savePersisted = useCallback((state:any)=>{
    try{ localStorage.setItem(EX_STATE_KEY(today, exerciseId), JSON.stringify(state)) }catch{}
  }, [today, exerciseId])

  useEffect(()=>{
    const load=async()=>{
      const { getLastSerieWithSource, getLastExecutionByExercise, unifiedCompletedSets } = await import('@/services/history')
      try{
        if(exerciseId.startsWith('custom/')){
          const { getCustomExercise } = await import('@/services/training/customExercises')
          const c = await getCustomExercise(exerciseId)
          if(c) setExInfo({ muscle: c.muscle, secondaryMuscles: c.secondaryMuscles, muscleBreakdown: c.muscleBreakdown })
        }
        const { fetchOne } = await import('@/services/exerciseGym')
        if(exerciseId.includes('/') && !exerciseId.startsWith('custom/')){
          const [m,slug]=exerciseId.split('/')
          const ex:any = await fetchOne(m,slug).catch(()=>null)
          if(ex) setExInfo(ex)
        }
      }catch{}
      // refs per set (last serie data)
      const obj:Record<number,any>={}
      for(let i=0;i<sets;i++){
        const r=await getLastSerieWithSource(exerciseId, i+1)
        obj[i]=r
      }
      setRefs(obj)
      // last full session for this exercise
      const last = await getLastExecutionByExercise(exerciseId)
      if(last) setLastSession(last)
      // last 5 sessions for mini progress
      const all = await unifiedCompletedSets(exerciseId)
      const bySession = new Map<string, {totalVolume:number; setsCount:number; date:string}>()
      for(const s of all){
        const key = s.sessionId || s.createdAt.slice(0,10)
        const existing = bySession.get(key)
        const vol = s.weight * s.reps
        if(existing){ existing.totalVolume += vol; existing.setsCount++ }
        else bySession.set(key, { totalVolume: vol, setsCount: 1, date: s.createdAt.slice(0,10) })
      }
      const sessions = Array.from(bySession.values()).sort((a,b)=> b.date.localeCompare(a.date)).slice(0,5)
      setPrevSessions(sessions)
      // init with plan, then overlay persisted
      const baseW:Record<number,number>={}, baseR:Record<number,number>={}, baseC:Record<number,boolean>={}
      for(let i=0;i<sets;i++){ baseW[i]=plannedWeight; baseR[i]=plannedReps; baseC[i]=false }
      setWeights(baseW); setReps(baseR); setChecks(baseC)
      loadPersisted()
      // registros oficiales (fuente de verdad ante recarga): pisan borrador
      try{
        if(initialCompleted) for(const k of Object.keys(initialCompleted)){ const i=Number(k); baseW[i]=initialCompleted[i].weight; baseR[i]=initialCompleted[i].reps; baseC[i]=true }
        if(initialSkipped) for(const i of initialSkipped){ baseC[i]=false }
        setWeights({...baseW}); setReps({...baseR}); setChecks({...baseC})
      }catch{ /* noop */ }
      setLoaded(true)
    }
    load()
  },[exerciseId, sets, plannedReps, plannedWeight, loadPersisted, initialCompleted, initialSkipped])

  const parseKg = (v:string)=>{
    const n = Number(v)
    if(isNaN(n)) return 0
    return Math.round(n*10)/10
  }

  const persistAll = useCallback(()=>{
    savePersisted({ weights, reps, checks, negEnabled, negReps, negWeight, obs })
  }, [weights, reps, checks, negEnabled, negReps, negWeight, obs, savePersisted])

  // auto-save on any change
  useEffect(()=>{ if(loaded) persistAll() }, [weights, reps, checks, negEnabled, negReps, negWeight, obs, loaded, persistAll])

  if(!loaded) return <div className="space-y-3"><div className="h-8 bg-surface-container-low/90 border border-outline-variant rounded-lg animate-pulse"/></div>

  const romanNumerals = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX']

  // Determine which set is the next uncompleted one for the active row highlight
  const nextUncompletedIdx = Array.from({length:sets}).find((_, i)=> !checks[i] && !(initialSkipped||[]).includes(i))

  return (
    <div className="space-y-3">
      {/* Muscle breakdown tags */}
      <div className="rounded bg-surface-container/60 border border-outline-variant/30 p-2">
        <div className="flex flex-wrap gap-1">
          {(() => {
            const bd = (exInfo as any)?.muscleBreakdown
            const pcts = (Array.isArray(bd) && bd.length > 0)
              ? bd.map((b:any)=> ({ n: b.name, p: b.pct }))
              : (()=>{ const m = exInfo?.muscle || 'General'; const secs = exInfo?.secondaryMuscles || []; return secs.length===0 ? [{n:m,p:100}] : secs.length===1 ? [{n:m,p:60},{n:secs[0],p:40}] : [{n:m,p:60},{n:secs[0],p:30},{n:secs[1],p:10}] })()
            return pcts.filter(x=>x.n).map(x=> <span key={x.n} className={`px-2 py-0.5 rounded-full border font-label-caps text-[10px] uppercase ${x.p>=60?'bg-primary-container/20 border-primary/40 text-primary':'bg-surface-container-high/30 border-outline-variant/40 text-on-surface-variant'}`}>{x.n}: {x.p}%</span>)
          })()}
        </div>
      </div>
      {/* Last session reference */}
      {lastSession && (
        <div className="rounded-lg bg-surface-container/60 border border-outline-variant/30 px-3 py-2">
          <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Última sesión: <span className="text-on-surface font-semibold">{lastSession.date}</span></span>
          <span className="ml-2 text-[11px] text-on-surface-variant">({lastSession.sets.length} series)</span>
        </div>
      )}
      {/* Series table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/40 text-outline font-label-caps text-[9px] uppercase tracking-wider">
              <th className="pb-2 px-1 font-semibold w-8">S</th>
              <th className="pb-2 px-2 font-semibold">ANTERIOR</th>
              <th className="pb-2 px-2 font-semibold text-center">REPS</th>
              <th className="pb-2 px-2 font-semibold text-center">KG</th>
              <th className="pb-2 px-1 text-center font-semibold w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {Array.from({length:sets}).map((_,si)=>{
              const ref:any = refs[si]
              const prevSet = lastSession?.sets.find(s=> s.setNumber === si+1)
              const w = weights[si] ?? plannedWeight
              const r = reps[si] ?? plannedReps
              const isDone = !!checks[si]
              const isActive = !isDone && si === nextUncompletedIdx
              const isSkipped = (initialSkipped||[]).includes(si)
              const roman = romanNumerals[si] || `${si+1}`
              return (
                <tr key={si} className={`transition-colors ${
                  isDone
                    ? 'bg-primary-container/5'
                    : isActive
                      ? 'bg-secondary/5'
                      : ''
                }`}>
                  <td className={`py-2.5 px-1 font-headline-sm text-[15px] ${isDone ? 'text-primary' : isActive ? 'text-secondary' : 'text-outline'}`}>
                    {roman}
                  </td>
                  <td className="py-2.5 px-2 text-[12px] text-on-surface-variant whitespace-nowrap">
                    {prevSet ? (
                      <span>{prevSet.weight}kg × {prevSet.reps}</span>
                    ) : ref && !ref.isSeed ? (
                      <span>{ref.weight}kg × {ref.reps}</span>
                    ) : (
                      <span className="text-outline">sin datos</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {isDone ? (
                      <span className="block text-center font-title-md text-[14px] text-on-surface font-medium">{r}</span>
                    ) : (
                      <input
                        type="number"
                        value={r}
                        onChange={e=>setReps({...reps, [si]: Number(e.target.value)})}
                        className="w-full px-2 py-1.5 bg-surface-container-highest border border-outline-variant/40 rounded font-title-md text-[14px] text-on-surface text-center"
                        placeholder="reps"
                        inputMode="numeric"
                        aria-label={`reps serie ${si+1}`}
                      />
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {isDone ? (
                      <span className="block text-center font-title-md text-[14px] text-on-surface font-medium">{w}</span>
                    ) : (
                      <input
                        type="number"
                        step="0.1"
                        value={w}
                        onChange={e=>setWeights({...weights, [si]: parseKg(e.target.value)})}
                        className="w-full px-2 py-1.5 bg-surface-container-highest border border-outline-variant/40 rounded font-title-md text-[14px] text-on-surface text-center"
                        placeholder="kg"
                        inputMode="decimal"
                        aria-label={`kilogramos serie ${si+1}`}
                      />
                    )}
                  </td>
                  <td className="py-2.5 px-1 text-center">
                    {isDone ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-primary-container text-on-primary-container border border-primary">
                        <span className="material-symbols-outlined text-[14px]">done</span>
                      </span>
                    ) : isSkipped ? (
                      <span className="text-[9px] text-outline">skip</span>
                    ) : (
                      <button onClick={(e)=>{
                        setChecks({...checks, [si]: true})
                        try{ e.currentTarget.classList.remove('flash-confirm'); void e.currentTarget.offsetWidth; e.currentTarget.classList.add('flash-confirm') }catch{ /* noop */ }
                        onComplete(si, parseKg(String(w)), r, negEnabled?{reps:Number(negReps)||0,weight:parseKg(negWeight)}:undefined, obs||undefined)
                      }} className="px-2 py-1 rounded bg-secondary text-on-secondary-fixed font-label-caps text-[9px] uppercase font-bold shadow-sm transition-all active:scale-95">
                        OK
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {onAddSet ? <button onClick={onAddSet} className="w-full py-2 rounded bg-surface-container border border-outline-variant/60 font-label-caps text-[10px] uppercase text-on-surface-variant transition-colors hover:border-secondary/40">+ Agregar serie</button> : null}
      {/* Mini progress history */}
      {prevSessions.length > 1 && (
        <div className="rounded-lg bg-surface-container/40 border border-outline-variant/20 px-3 py-2">
          <span className="font-label-caps text-[9px] uppercase text-outline tracking-wider block mb-1.5">Progreso reciente</span>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {prevSessions.map((s,i)=>{
              const delta = i < prevSessions.length-1 ? s.totalVolume - prevSessions[i+1].totalVolume : 0
              return (
                <div key={i} className="flex-shrink-0 text-center">
                  <div className="text-[10px] text-on-surface-variant">{s.date.slice(5)}</div>
                  <div className="font-title-md text-[13px] text-on-surface font-medium">{Math.round(s.totalVolume)}kg</div>
                  {i < prevSessions.length-1 && (
                    <div className={`text-[9px] font-semibold ${delta > 0 ? 'text-primary' : delta < 0 ? 'text-danger' : 'text-outline'}`}>
                      {delta > 0 ? '+' : ''}{Math.round(delta)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {/* Negativas por ejercicio */}
      <div className="rounded-xl bg-surface-container/60 border border-outline-variant/30 p-3">
        <label className="flex items-center gap-3 font-body-md text-[15px] text-on-surface font-medium">
          <input type="checkbox" checked={negEnabled} onChange={e=>setNegEnabled(e.target.checked)} className="w-5 h-5 accent-primary" />
          Negativas
        </label>
        <div className={`grid grid-cols-2 gap-3 mt-3 ${!negEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
          <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">repes
            <input type="number" placeholder="repes" value={negReps} onChange={e=>setNegReps(e.target.value)} disabled={!negEnabled} className="w-full mt-2 bg-surface-container border border-outline-variant rounded p-3 font-body-md text-[15px] text-on-surface text-center text-lg disabled:opacity-50" inputMode="numeric"/>
          </label>
          <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">kilogramos
            <input type="number" step="0.1" placeholder="kilogramos" value={negWeight} onChange={e=>setNegWeight(e.target.value)} disabled={!negEnabled} className="w-full mt-2 bg-surface-container border border-outline-variant rounded p-3 font-body-md text-[15px] text-on-surface text-center text-lg disabled:opacity-50" inputMode="decimal"/>
          </label>
        </div>
      </div>
      <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider font-medium">Observaciones
        <textarea placeholder="RPE, molestias, técnica..." value={obs} onChange={e=>setObs(e.target.value)} rows={3} className="w-full mt-2 bg-surface-container border border-outline-variant rounded p-3 font-body-md text-[15px] text-on-surface leading-relaxed"/>
      </label>
    </div>
  )
}
