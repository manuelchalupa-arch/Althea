import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { db, ensureSeeded } from '@/services/storage/db'
import { getCycleFromProfile } from '@/utils/cycle'
import { v4 as uuid } from 'uuid'
import { Eye, Clock, Check, ChevronRight, Zap, AlertTriangle, RotateCcw, XCircle } from 'lucide-react'
import { aiService } from '@/services/ai/aiService'
import { buildTrainingContext } from '@/services/ai/contextBuilder'
import * as Gym from '@/services/exerciseGym'
import { saveDecision } from '@/services/ai/coachMemory'
import { loadActiveSession, saveActiveSession, type ActiveSession } from '@/services/training/sessionMachine'
import { getActiveSession, transitionSession } from '@/services/training/sessionStore'
import type { SessionStatus, TrainingSession, SessionExercise } from '@/services/training/domain'

type SessionEx = { exId:string; name:string; sets:number; reps:number; weight:number; muscle?:string; gifUrl?:string; swappedFrom?:string; replaced?:boolean; extra?:boolean; plannedSets?:number; seriesType?:string; seId?:string }

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
  // Estados para FINALIZAR ENTRENAMIENTO + máquina de estados
  const [showFinishModal,setShowFinishModal]=useState(false)
  const [isSaving,setIsSaving]=useState(false)
  const [isStarting,setIsStarting]=useState(false)
  const finishingAt=useRef(0)
  const [finishSurvey,setFinishSurvey]=useState<Record<string,any>>({
    energy: 5, fatigue: 5, pain: 0, mood: 5,
    motivation: 5, effort: 5, stress: 5,
    painZone: '', painDetail: '',
    generalObservation: ''
  })
  const [pendingReasons,setPendingReasons]=useState<Record<number,{reason:string; comment:string}>>({})
  const [skipReasons,setSkipReasons]=useState<Record<number,string>>({})
  const [sessionStartTime,setSessionStartTime]=useState<string>(new Date().toISOString())
  const [sessionId,setSessionId]=useState<string>('')
  const [sessionStatus,setSessionStatus]=useState<SessionStatus>('PLANNED')
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
    let meta: Record<string, { name: string; muscle?: string; gifUrl?: string }> = {}
    try {
      const raw = localStorage.getItem(`althea:session:active:ex:${storeS.sessionId}`) || localStorage.getItem(`session:active:${today}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        const arr = parsed.exercises || parsed
        if (Array.isArray(arr)) for (const x of arr) meta[x.exId || x.id] = { name: x.name, muscle: x.muscle, gifUrl: x.gifUrl }
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
      lg[i] = doneRecs.map((r) => ({ weight: r.actualWeight, reps: r.actualReps, setType: r.setType, observation: r.observation }))
      if (se.status === 'COMPLETED') d[i] = true
      if (se.status === 'SKIPPED') { sk[i] = true; d[i] = true }
    }
    setSeIdByIndex(seMap)
    setExs(list); setCurrent(0); setDone(d); setSkipped(sk); setLogs(lg as Record<number, unknown[]>)
    if (list[0]) {
      const ctx: unknown = await buildTrainingContext(list[0].exId, list[0].name)
      const rec = await aiService.generateRecommendation(ctx as never).catch(() => ({ reason: `Vamos con ${list[0].weight}kg x ${list[0].reps}.`, suggested_weight: list[0].weight, confidence: 0.6, factors: ['determinístico'] }))
      setCoach(rec)
    } else setCoach(null)
  }

  const load = async () => {
      const { getActiveSession, getSession } = await import('@/services/training/sessionStore')
      // PRIORIDAD 1: sesion activa por activeSessionId (nunca calendario por encima).
      const active = await getActiveSession().catch(() => null)
      if (active && active.calendarDate === today && ['READY', 'IN_PROGRESS', 'PAUSED', 'COMPLETING'].includes(active.sessionStatus)) {
        if (active.sessionStatus === 'READY') {
          // §7: la sesion existe pero NO inicio -> pantalla COMENZAR.
          setReadyPlan({ sessionId: active.sessionId, routineName: active.routineName || 'Rutina', plannedDayN: active.plannedDay, plannedName: active.plannedDayName || '', actualDayN: active.actualDay, actualName: active.actualDayName || '', isResume: false })
          await applyStoreSession(active)
          return
        }
        await applyStoreSession(active)
        return
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
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    window.addEventListener('routineChange', onCustom as any)
    const id = setInterval(()=>{ if(restPausedRef.current) return; if(restSecRef.current>0){ restSecRef.current -= 1; setRestSec(restSecRef.current); if(restSecRef.current===0) setRestFlash(true) } }, 1000)
    return ()=>{ clearInterval(id); window.removeEventListener('storage', onStorage); window.removeEventListener('focus', onFocus); window.removeEventListener('routineChange', onCustom as any) }
  },[])

  const cur = exs[current]
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
      setRestSec(90); setRestFlash(false); setRestPaused(false); restPausedRef.current=false; try{ if(navigator.vibrate) navigator.vibrate(12) }catch{ /* noop */ }
      if(current < exs.length-1){
        setTimeout(()=>{ setCurrent(current+1); nextCoach(current+1) }, 800)
      }
      // guardar ejercicio NO finaliza la sesion: se usa FINALIZAR ENTRENAMIENTO
    }
  }

  const openViewer = async ()=>{
    if(!cur) return
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
      if(cur.exId.includes('/')){
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
      const { rankReplacements } = await import('@/services/training/similarity')
      setSwapOptions(rankReplacements(orig, res.exercises, (id)=> counts[id]||0).slice(0, 12))
      setShowSwap(true)
    }catch{ /* noop */ }finally{ setSwapLoading(false) }
  }, [cur])

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
        energy: Number(fs.energy ?? 5), fatigue: Number(fs.fatigue ?? 5),
        pain: Number(fs.pain ?? 0), mood: Number(fs.mood ?? 5),
        motivation: Number(fs.motivation ?? 5), perceivedExertion: Number(fs.effort ?? 5),
        stress: Number(fs.stress ?? 5),
        painArea: String(fs.painZone || ''), painObservation: String(fs.painDetail || fs.generalObservation || ''),
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
        generalObservation: String(fs.generalObservation || ''),
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
      try{ localStorage.setItem(`althea:result:${today}`, JSON.stringify({ date: today, sessionId: sess.sessionId, sessionStatus: status, exPct: s.exPct, setPct: s.setPct, completedEx: s.completedEx, plannedEx: s.plannedEx, completedSets: s.completedSets, plannedSets: s.plannedSets, totalVol: s.totalVol, totalReps: s.totalReps, durMin: s.durMin, survey: { energy: Number(fs.energy??5), fatigue: Number(fs.fatigue??5), pain: Number(fs.pain??0), mood: Number(fs.mood??5) }, highlights: Object.values(progressLines) })) }catch{ /* noop */ }
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
    const created = await addExtraExercise(session.sessionId, { exId: opt.id, name: opt.name, sets: 3, reps: 10, weight: 20, muscle: opt.muscle })
    await logEvent(session.sessionId, 'EXERCISE_ADDED', { metadata: { reason: addExReason.trim(), comment: addExComment.trim() || undefined } }).catch(()=>null)
    saveDecision({ date: today, type:'modify', exercise: opt.name, reason:`EXTRA: ${addExReason.trim()}`, contextSnapshot:{} } as never)
    setExs(prev => [...prev, { exId: opt.id, name: opt.name, sets: 3, reps: 10, weight: 20, muscle: opt.muscle, gifUrl: opt.gifUrl, plannedSets: 0, seId: created.sessionExerciseId, extra: true }])
    setSeIdByIndex(prev => ({ ...prev, [Object.keys(prev).length]: created.sessionExerciseId }))
    setShowAddEx(false)
    setAddExReason(''); setAddExComment('')
  }

  if(readyPlan && !session){
    const rp = readyPlan
    return (
      <div className="min-h-screen bg-bg pb-24">
        <div className="max-w-lg lg:max-w-3xl mx-auto px-4 py-6 space-y-4">
          <div className="text-aux">ENTRENAR · {rp.routineName}</div>
          <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
            <h2 className="text-title">{rp.sessionId ? 'Sesión preparada' : 'Plan de hoy'}</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-aux">Día planificado</span><span className="text-body text-right">{rp.plannedDayN!=null ? `N°${rp.plannedDayN} ${rp.plannedName}` : '—'}</span>
              <span className="text-aux">Día a realizar</span><span className="text-body text-right">{rp.actualDayN!=null ? `N°${rp.actualDayN} ${rp.actualName}` : 'Descanso'}</span>
              <span className="text-aux">Ejercicios</span><span className="text-body text-right">{exs.length}</span>
            </div>
            {(rp.reason || rp.comment) && (
              <div className="rounded-xl bg-amber-900/20 border border-amber-800 p-3">
                <div className="text-aux text-amber-300">Cambio de día: {rp.reason || '—'}</div>
                {rp.comment ? <p className="text-aux mt-1">{rp.comment}</p> : null}
              </div>
            )}
            {rp.plannedDayN!==rp.actualDayN && rp.plannedDayN!=null && (
              <p className="text-aux text-sm">Hoy estaba planificado {rp.plannedName} y vas a realizar {rp.actualName}. Quedará registrado para análisis.</p>
            )}
            <div className="space-y-1.5">
              {exs.map((ex,i)=>(
                <div key={i} className="flex items-center gap-2 text-body text-sm">
                  <span className="w-1.5 h-1.5 bg-action rounded-full"></span>{ex.name} <span className="text-aux">· {ex.sets}x{ex.reps}</span>
                </div>
              ))}
            </div>
            {finishError ? <p className="text-sm text-red-400">{finishError}</p> : null}
            <button onClick={startSession} disabled={isStarting} className="w-full py-3 rounded-xl bg-action text-textMain font-medium disabled:opacity-50">{isStarting ? 'Iniciando…' : 'COMENZAR ENTRENAMIENTO'}</button>
            <button onClick={openCancelModal} className="w-full py-2 rounded-xl bg-surface border border-border text-aux">Cancelar</button>
          </div>
        </div>
        {showCancel && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowCancel(false)}>
            <div onClick={(e)=>e.stopPropagation()} className="bg-bg border border-border rounded-2xl w-full max-w-md p-4 space-y-3">
              <h3 className="text-subtitle">Cancelar entrenamiento</h3>
              <select value={cancelReason} onChange={(e)=>setCancelReason(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-2 text-body">
                <option value="">Seleccioná motivo…</option>
                {['Falta de tiempo','Cansancio','Indisposición','Cambio de planes','Falta de equipamiento','Falta de disponibilidad','Otro'].map((r)=>(<option key={r} value={r}>{r}</option>))}
              </select>
              <textarea value={cancelComment} onChange={(e)=>setCancelComment(e.target.value)} placeholder="Comentario (opcional)" rows={2} maxLength={300} className="w-full bg-surface border border-border rounded-xl p-2 text-body"/>
              <div className="flex gap-2">
                <button onClick={confirmCancel} className="flex-1 py-3 rounded-xl bg-action text-textMain">Confirmar cancelación</button>
                <button onClick={()=>setShowCancel(false)} className="flex-1 py-2 rounded-xl bg-surface border border-border text-aux">Volver</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if(exs.length===0) return <div className="min-h-screen bg-bg p-4 pb-24 max-w-lg lg:max-w-3xl mx-auto"><p className="text-body">Hoy es descanso o sin ejercicios. Cambiá el día en Inicio.</p></div>
  return (
    <div className="min-h-screen bg-bg pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg border-b border-border">
        <div className="max-w-lg lg:max-w-3xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-aux">ENTRENAR · {rutinaName}</div>
              <div className="text-subtitle">{dayName}</div>
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
              }} className="text-aux text-info underline text-xs mt-1">Cambiar día de entrenamiento</button>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-aux bg-surface border border-border px-3 py-1 rounded-full">{Object.keys(done).length}/{exs.length} · {progress}%</div>
              <button onClick={openFinishModal} className="px-4 py-2 rounded-xl bg-action text-textMain font-medium text-sm flex items-center gap-2">
                <Check className="w-4 h-4"/> FINALIZAR ENTRENAMIENTO
              </button>
            </div>
          </div>
          <div className="mt-2 h-2 bg-surface border border-border rounded-full overflow-hidden flex">
            {exs.map((_,i)=> <div key={i} className={`flex-1 ${done[i]?'bg-action': i===current?'bg-info':'bg-transparent'}`} />)}
          </div>
          {restSec>0 && <div className="mt-2 flex items-center gap-2 text-aux bg-surface border border-border rounded-xl px-2 py-1.5"><button onClick={()=>{ const v=!restPaused; setRestPaused(v); restPausedRef.current=v }} aria-label={restPaused?'Reanudar descanso':'Pausar descanso'} className="px-2 py-1 rounded-lg bg-bg border border-border text-body">{restPaused ? '▶' : '⏸'}</button><Clock size={14}/><span className="text-body font-medium tabular-nums">{Math.floor(restSec/60)}:{String(restSec%60).padStart(2,'0')}</span><span>Descanso</span><span className="ml-auto flex gap-1"><button onClick={()=>setRestSec((s)=>Math.max(0,s-15))} className="px-2 py-1 rounded-lg bg-bg border border-border">−15</button><button onClick={()=>setRestSec((s)=>s+30)} className="px-2 py-1 rounded-lg bg-bg border border-border">+30</button><button onClick={()=>{ setRestSec(0); setRestFlash(false) }} className="px-2 py-1 rounded-lg bg-bg border border-border text-info">Saltar</button></span></div>}
          {restFlash && restSec===0 && <button onClick={()=>setRestFlash(false)} className="mt-2 w-full flex items-center justify-center gap-2 text-body st-completed border rounded-xl p-2 fade-in"><Check size={14}/> Descanso terminado — a entrenar</button>}
          {(sessionStatus==='IN_PROGRESS' || sessionStatus==='PAUSED') && (
            <div className="mt-2 flex gap-2">
              <button onClick={openCancelModal} className="flex-1 py-1.5 rounded-xl bg-surface border border-border text-aux text-sm">Cancelar sesión</button>
              <button onClick={()=>{ setAbandonReason(''); setAbandonComment(''); setShowAbandon(true) }} className="flex-1 py-1.5 rounded-xl bg-surface border border-border text-aux text-sm">Abandonar</button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg lg:max-w-3xl mx-auto px-4 py-4 space-y-4">
        {resumeBanner && (
          <div className="rounded-2xl bg-amber-900/20 border border-amber-800 p-4 space-y-2">
            <div className="text-body font-medium">Tenés un entrenamiento en progreso ({resumeBanner.calendarDate}).</div>
            <div className="text-aux">{resumeBanner.routineName} — {resumeBanner.dayName} · estado {resumeBanner.status} · {resumeBanner.exerciseCount} ejercicios</div>
            <div className="flex gap-2">
              <button onClick={()=> adoptResumeSession(resumeBanner, false)} className="flex-1 py-2 rounded-xl bg-action text-textMain">Continuar</button>
              <button onClick={()=> adoptResumeSession(resumeBanner, true)} className="flex-1 py-2 rounded-xl bg-surface border border-border text-aux">Finalizar</button>
              <button onClick={abandonResume} className="flex-1 py-2 rounded-xl bg-bg border border-border text-aux">Abandonar</button>
            </div>
          </div>
        )}
        {(sessionStatus==='COMPLETED' || sessionStatus==='PARTIAL') && <ResultPanel today={today} sessionStatus={sessionStatus} />}
        {(sessionStatus==='IN_PROGRESS' || sessionStatus==='PAUSED') && exs.length>0 && (
          <div className="flex items-center gap-2">
            <span className={`text-aux px-3 py-1 rounded-full border ${sessionStatus==='PAUSED' ? 'bg-amber-900/20 border-amber-800 text-amber-300' : 'bg-surface border-border'}`}>Estado: {sessionStatus}</span>
            <button onClick={togglePause} className="px-3 py-1 rounded-full bg-surface border border-border text-aux">{sessionStatus==='PAUSED' ? 'Continuar' : 'Pausar'}</button>
          </div>
        )}
        {/* Lista ejercicios */}
        <div className="space-y-2">
          {exs.map((ex,i)=>(
            <div key={i} className={`rounded-xl border p-3 flex items-center gap-3 ${i===current?'bg-surface border-info':'bg-bg border-border'} ${done[i]?'opacity-60':''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-aux ${done[i]?'bg-action text-textMain': i===current?'bg-info text-bg':'bg-surface border border-border'}`}>{done[i] ? <Check size={14}/> : i+1}</div>
              <div className="flex-1" onClick={()=> setCurrent(i)}>
                <div className="text-body font-medium">{ex.name}</div>
                <div className="text-aux">{ex.sets}×{ex.reps} · {ex.weight}kg {ex.muscle && `· ${ex.muscle}`}</div>
              </div>
              <button onClick={()=>{ setCurrent(i); nextCoach(i) }} className="text-aux text-info"><ChevronRight size={16}/></button>
              {done[i] && <span className="text-aux text-action">✓</span>}
            </div>
          ))}
        </div>

        {/* Ejercicio actual */}
        {cur && (
          <div className="rounded-2xl bg-surface border border-border p-4 space-y-4 shadow-sm">
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1">
                <div className="text-aux tracking-widest text-[11px]">AHORA · {cur.sets} series</div>
                <div className="text-title leading-tight mt-1">{cur.name}</div>
                <div className="text-aux mt-1">{cur.reps} repes · {cur.weight} kilogramos objetivo</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={openViewer} className="shrink-0 px-3 py-2 rounded-xl bg-bg border border-border text-aux flex items-center gap-1 hover:bg-surface transition"><Eye size={14}/> Ver</button>
                <button onClick={loadSwapOptions} className="shrink-0 px-3 py-2 rounded-xl bg-bg border border-border text-aux flex items-center gap-1 hover:bg-surface transition"><RotateCcw size={14}/> Cambiar</button>
              </div>
            </div>

            <div className="rounded-xl bg-accentDark border border-border p-3">
              <div className="text-aux text-info flex items-center gap-1"><Zap size={12}/> COACH</div>
              <p className="text-body mt-1">{coach ? (coach.suggested_weight ? `${coach.suggested_weight}kg — ${coach.reason}` : coach.reason) : `Vamos con ${cur.weight}kg × ${cur.reps}.`}</p>
              <button onClick={()=>setShowWhy(s=>!s)} className="text-aux text-info mt-1">¿Por qué?</button>
              {showWhy && <p className="text-aux mt-1 bg-bg border border-border rounded-lg p-2">{coach?.factors?.join(' · ') || 'Volumen y técnica estables.'}</p>}
              <div className="mt-2 flex gap-1">
                <button onClick={()=>{ setMod({weight:cur.weight,reps:cur.reps,sets:cur.sets, seriesType:'Normal'}); setShowModify(true)}} className="flex-1 py-2 rounded-xl bg-surface border border-border text-aux">Modificar</button>
                <button onClick={handleSkipWithReason} className="flex-1 py-2 rounded-xl bg-bg border border-border text-aux"><XCircle size={14} className="inline mr-1"/> Saltar</button>
              </div>
            </div>

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

            <div className="rounded-xl bg-amber-900/20 border border-amber-800 p-2 flex gap-2 text-aux">
              <AlertTriangle size={14} className="text-amber-300 mt-0.5"/> Si hay dolor importante, detené y consultá profesional. Podés saltar el ejercicio.
            </div>
          </div>
        )}

        {showModify && cur && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowModify(false)}>
            <div onClick={e=>e.stopPropagation()} className="bg-bg border border-border rounded-2xl w-full max-w-md p-4 space-y-3">
              <h3 className="text-subtitle">Modificar {cur.name}</h3>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-aux">Peso<input type="number" value={mod.weight} onChange={e=>setMod({...mod, weight:Number(e.target.value)})} className="w-full mt-1 bg-surface border border-border rounded-xl p-2 text-body"/></label>
                <label className="text-aux">Reps<input type="number" value={mod.reps} onChange={e=>setMod({...mod, reps:Number(e.target.value)})} className="w-full mt-1 bg-surface border border-border rounded-xl p-2 text-body"/></label>
                <label className="text-aux">Series<input type="number" value={mod.sets} onChange={e=>setMod({...mod, sets:Number(e.target.value)})} className="w-full mt-1 bg-surface border border-border rounded-xl p-2 text-body"/></label>
              </div>
              <label className="text-aux">Tipo de serie
                <select onChange={e=> setMod({...mod, seriesType: e.target.value} as any)} className="w-full mt-1 bg-surface border border-border rounded-xl p-2 text-body">
                  <option>Normal</option><option>Ascendente</option><option>Descendente</option><option>Piramidal</option><option>DropSet</option><option>Otra</option>
                </select>
              </label>
              <button onClick={()=>{
                exs[current].weight = mod.weight; exs[current].reps = mod.reps; exs[current].sets = mod.sets; setExs([...exs])
                saveDecision({ date: today, type:'modify', exercise: cur.name, reason:`Modificado a ${mod.weight}kg × ${mod.reps}`, contextSnapshot:{mod}} as any)
                setShowModify(false)
              }} className="w-full py-3 rounded-xl bg-action text-textMain">Aplicar</button>
            </div>
          </div>
        )}

        {viewer && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2" onClick={()=>setViewer(null)}>
            <div onClick={e=>e.stopPropagation()} className="bg-bg border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
              <div className="p-4 flex justify-between"><span className="text-subtitle">{viewer.name}</span><button onClick={()=>setViewer(null)} className="w-8 h-8 rounded-full bg-surface border border-border">✕</button></div>
              <div className="p-4">
                <div className="rounded-xl bg-surface border border-border flex items-center justify-center min-h-[300px] p-2">
                  {viewer.gifUrl ? <img src={viewer.gifUrl} alt={viewer.name} className="max-w-full max-h-[60vh] object-contain"/> : <span className="text-aux">Sin GIF</span>}
                </div>
                <div className="text-aux mt-2">{viewer.muscle} · {viewer.equipment}</div>
                <ol className="list-decimal list-inside text-body mt-1">{viewer.instructions?.slice(0,4).map((s,i)=><li key={i}>{s}</li>)}</ol>
              </div>
            </div>
          </div>
        )}

        {showSwap && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>{setShowSwap(false); setSwapOptions([])}}>
            <div onClick={e=>e.stopPropagation()} className="bg-bg border border-border rounded-2xl w-full max-w-lg lg:max-w-3xl p-4 space-y-3 max-h-[80vh] overflow-auto">
              <div className="flex justify-between items-center">
                <h3 className="text-subtitle">Cambiar ejercicio — {cur?.muscle || 'mismo grupo'}</h3>
                <button onClick={()=>{setShowSwap(false); setSwapOptions([])}} className="w-8 h-8 rounded-full bg-surface border border-border">✕</button>
              </div>
              <p className="text-aux">Elegí una alternativa del mismo grupo muscular</p>
              <div className="space-y-2 max-h-60 overflow-auto">
                {swapLoading && <p className="text-aux">Calculando similitud…</p>}
                {!swapLoading && swapOptions.length===0 && <p className="text-aux">Sin alternativas en este grupo muscular.</p>}
                {!swapLoading && swapOptions.length>0 && <div className="text-aux font-medium">Mejor reemplazo · {swapOptions[0].score}%</div>}
                {!swapLoading && swapOptions.slice(0,1).map((r)=>(
                  <div key={r.exercise.id} className="rounded-xl bg-elevated border border-info/40 p-3">
                    <button onClick={()=> handleSwap(r.exercise)} className="w-full text-left flex items-center gap-3">
                      {r.exercise.gifUrl ? <img src={r.exercise.gifUrl} alt={r.exercise.name} className="w-12 h-12 rounded-lg object-cover"/> : null}
                      <div className="flex-1 min-w-0"><div className="text-body font-medium truncate">{r.exercise.name}</div><div className="text-aux text-xs">{r.exercise.muscle} · {r.exercise.equipment}</div></div>
                      <span className="text-subtitle shrink-0">{r.score}%</span>
                    </button>
                    <button onClick={()=> setSwapExplain(swapExplain===r.exercise.id?null:r.exercise.id)} className="text-aux text-info text-xs mt-1">Por qué este %</button>
                    {swapExplain===r.exercise.id && (<ul className="mt-1 space-y-0.5">{r.factors.map((f)=>(<li key={f.key} className="text-aux text-xs">{f.state==='match'?'✓':f.state==='miss'?'✕':f.state==='partial'?'◐':'—'} {f.label} — {f.detail}</li>))}</ul>)}
                  </div>
                ))}
                {!swapLoading && swapOptions.length>1 && <div className="text-aux font-medium pt-1">Otras alternativas</div>}
                {!swapLoading && swapOptions.slice(1).map((r)=>(
                  <div key={r.exercise.id} className="rounded-xl bg-surface border border-border p-3">
                    <button onClick={()=> handleSwap(r.exercise)} className="w-full text-left flex items-center gap-3">
                      {r.exercise.gifUrl ? <img src={r.exercise.gifUrl} alt={r.exercise.name} className="w-12 h-12 rounded-lg object-cover"/> : null}
                      <div className="flex-1 min-w-0"><div className="text-body font-medium truncate">{r.exercise.name}</div><div className="text-aux text-xs">{r.exercise.muscle} · {r.exercise.equipment}</div></div>
                      <span className="text-subtitle shrink-0">{r.score}%</span>
                    </button>
                    <button onClick={()=> setSwapExplain(swapExplain===r.exercise.id?null:r.exercise.id)} className="text-aux text-info text-xs mt-1">Por qué este %</button>
                    {swapExplain===r.exercise.id && (<ul className="mt-1 space-y-0.5">{r.factors.map((f)=>(<li key={f.key} className="text-aux text-xs">{f.state==='match'?'✓':f.state==='miss'?'✕':f.state==='partial'?'◐':'—'} {f.label} — {f.detail}</li>))}</ul>)}
                  </div>
                ))}
              </div>
              <select value={swapReason} onChange={(e)=>setSwapReason(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-2 text-body">
                <option value="">Motivo del cambio…</option>
                {['Molestia / dolor','Falta de equipamiento','Prefiero otra variante','Recomendación del coach','Otro'].map((r)=>(<option key={r} value={r}>{r}</option>))}
              </select>
              <textarea value={swapComment} onChange={(e)=>setSwapComment(e.target.value)} placeholder="Comentario (opcional)" rows={2} maxLength={300} className="w-full bg-surface border border-border rounded-xl p-2 text-body"/>
              <button onClick={()=>{setShowSwap(false); setSwapOptions([])}} className="w-full py-2 rounded-xl bg-surface border border-border text-aux">Cancelar</button>
            </div>
          </div>
        )}

        {showSkipReason && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowSkipReason(false)}>
            <div onClick={e=>e.stopPropagation()} className="bg-bg border border-border rounded-2xl w-full max-w-md p-4 space-y-3">
              <h3 className="text-subtitle">Saltar {cur?.name}</h3>
              <p className="text-aux">Motivo (opcional)</p>
              <textarea value={skipReason} onChange={e=>setSkipReason(e.target.value)} placeholder="Ej: molestia en hombro, sin equipamiento, fatiga..." rows={3} className="w-full bg-surface border border-border rounded-xl p-2 text-body"/>
              <div className="flex gap-2">
                <button onClick={confirmSkip} className="flex-1 py-3 rounded-xl bg-action text-textMain">Confirmar salto</button>
                <button onClick={()=>{setShowSkipReason(false); setSkipReason('')}} className="flex-1 py-2 rounded-xl bg-surface border border-border text-aux">Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {showCancel && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowCancel(false)}>
            <div onClick={(e)=>e.stopPropagation()} className="bg-bg border border-border rounded-2xl w-full max-w-md p-4 space-y-3">
              <h3 className="text-subtitle">Cancelar entrenamiento</h3>
              <p className="text-aux">La cancelación requiere justificación y queda registrada.</p>
              <select value={cancelReason} onChange={(e)=>setCancelReason(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-2 text-body">
                <option value="">Seleccioná motivo…</option>
                {['Falta de tiempo','Cansancio','Indisposición','Cambio de planes','Falta de equipamiento','Falta de disponibilidad','Otro'].map((r)=>(<option key={r} value={r}>{r}</option>))}
              </select>
              <textarea value={cancelComment} onChange={(e)=>setCancelComment(e.target.value)} placeholder="Comentario (opcional)" rows={2} maxLength={300} className="w-full bg-surface border border-border rounded-xl p-2 text-body"/>
              <div className="flex gap-2">
                <button onClick={confirmCancel} className="flex-1 py-3 rounded-xl bg-action text-textMain">Confirmar cancelación</button>
                <button onClick={()=>setShowCancel(false)} className="flex-1 py-2 rounded-xl bg-surface border border-border text-aux">Volver</button>
              </div>
            </div>
          </div>
        )}

        {showAbandon && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowAbandon(false)}>
            <div onClick={(e)=>e.stopPropagation()} className="bg-bg border border-border rounded-2xl w-full max-w-md p-4 space-y-3">
              <h3 className="text-subtitle">Abandonar entrenamiento</h3>
              <p className="text-aux">Se conservan las series y ejercicios ya registrados. El abandono queda como dato histórico.</p>
              <select value={abandonReason} onChange={(e)=>setAbandonReason(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-2 text-body">
                <option value="">Seleccioná motivo…</option>
                {['Falta de tiempo','Cansancio','Dolor/molestia','Indisposición','Cambio de planes','Falta de equipamiento','Otro'].map((r)=>(<option key={r} value={r}>{r}</option>))}
              </select>
              <textarea value={abandonComment} onChange={(e)=>setAbandonComment(e.target.value)} placeholder="Comentario (opcional)" rows={2} maxLength={300} className="w-full bg-surface border border-border rounded-xl p-2 text-body"/>
              <div className="flex gap-2">
                <button onClick={confirmAbandon} className="flex-1 py-3 rounded-xl bg-action text-textMain">Confirmar abandono</button>
                <button onClick={()=>setShowAbandon(false)} className="flex-1 py-2 rounded-xl bg-surface border border-border text-aux">Volver</button>
              </div>
            </div>
          </div>
        )}

        {showAddEx && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowAddEx(false)}>
            <div onClick={(e)=>e.stopPropagation()} className="bg-bg border border-border rounded-2xl w-full max-w-lg lg:max-w-3xl p-4 space-y-3 max-h-[80vh] overflow-auto">
              <div className="flex justify-between items-center">
                <h3 className="text-subtitle">Agregar ejercicio EXTRA</h3>
                <button onClick={()=>setShowAddEx(false)} className="w-8 h-8 rounded-full bg-surface border border-border">✕</button>
              </div>
              <p className="text-aux">No planificado · quedará marcado EXTRA con su motivo.</p>
              <select value={addExReason} onChange={(e)=>setAddExReason(e.target.value)} className="w-full bg-surface border border-border rounded-xl p-2 text-body">
                <option value="">Motivo del agregado…</option>
                {['Quiero trabajar más este grupo','Me siento con energía','Recomendación del coach','Recuperar ejercicio pendiente','Otro'].map((r)=>(<option key={r} value={r}>{r}</option>))}
              </select>
              <textarea value={addExComment} onChange={(e)=>setAddExComment(e.target.value)} placeholder="Comentario (opcional)" rows={2} maxLength={300} className="w-full bg-surface border border-border rounded-xl p-2 text-body"/>
              <div className="space-y-2 max-h-60 overflow-auto">
                {addExOptions.map((opt: Gym.Exercise)=>(
                  <button key={opt.id} onClick={()=>confirmAddExtra(opt)} className="w-full text-left p-3 rounded-xl bg-surface border border-border flex items-center gap-3 hover:bg-bg transition">
                    {opt.gifUrl ? <img src={opt.gifUrl} alt={opt.name} className="w-12 h-12 rounded-lg object-cover"/> : null}
                    <div>
                      <div className="text-body font-medium">{opt.name}</div>
                      <div className="text-aux text-xs">{opt.muscle} · {opt.equipment}</div>
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
          const scaleBtn = (k:string,n:number)=> (
            <button key={n} onClick={()=> setSurvey(k,n)} className={`flex-1 aspect-square rounded-xl border transition text-sm ${Number(finishSurvey[k])===n ? 'bg-action border-action text-textMain' : 'bg-surface border-border text-aux'}`}>{n}</button>
          )
          return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-bg border border-border rounded-2xl w-full max-w-lg lg:max-w-3xl p-4 space-y-4 max-h-[90vh] overflow-auto">
              <div className="flex items-center justify-between">
                <h3 className="text-subtitle">Finalizar entrenamiento</h3>
                <span className="text-aux px-3 py-1 rounded-full bg-surface border border-border">COMPLETING</span>
              </div>

              <div className="rounded-xl bg-surface border border-border p-3">
                <div className="text-aux font-medium mb-2">RESUMEN</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-aux">Rutina</span><span className="text-body text-right">{rutinaName}</span>
                  <span className="text-aux">Semana</span><span className="text-body text-right">{weekNumber}</span>
                  <span className="text-aux">Día planificado</span><span className="text-body text-right">{plannedDayN!=null ? `N°${plannedDayN} ${plannedName}` : '—'}</span>
                  <span className="text-aux">Día realizado</span><span className="text-body text-right">{actualDayN!=null ? `N°${actualDayN} ${dayName}` : dayName}</span>
                  <span className="text-aux">Ejercicios planificados</span><span className="text-body text-right">{s.plannedEx}</span>
                  <span className="text-aux">Ejercicios completados</span><span className="text-body text-right">{s.completedEx}</span>
                  <span className="text-aux">Ejercicios no realizados</span><span className="text-body text-right">{s.pendingIdx.length}</span>
                  <span className="text-aux">Ejercicios omitidos</span><span className="text-body text-right">{s.skippedIdx.length}</span>
                  <span className="text-aux">Ejercicios modificados</span><span className="text-body text-right">{s.modified}</span>
                  <span className="text-aux">Ejercicios reemplazados</span><span className="text-body text-right">{s.replaced}</span>
                  <span className="text-aux">Series planificadas</span><span className="text-body text-right">{s.plannedSets}</span>
                  <span className="text-aux">Series realizadas</span><span className="text-body text-right">{s.completedSets}</span>
                  <span className="text-aux">Repeticiones</span><span className="text-body text-right">{s.totalReps}</span>
                  <span className="text-aux">Volumen</span><span className="text-body text-right">{s.totalVol} kg</span>
                  <span className="text-aux">Duración</span><span className="text-body text-right">{s.durMin} min</span>
                  <span className="text-aux">Ejercicios</span><span className="text-body text-right">{s.exPct}%</span>
                  <span className="text-aux">Series</span><span className="text-body text-right">{s.setPct}%</span>
                </div>
                {(s.pendingIdx.length===0 && s.skippedIdx.length===0)
                  ? <p className="text-aux text-action mt-2">Todos los ejercicios planificados fueron registrados.</p>
                  : <p className="text-aux text-amber-300 mt-2">Entrenamiento parcial — {s.exPct}% · El entrenamiento tiene ejercicios pendientes.</p>}
              </div>

              {s.pendingIdx.length>0 && (
                <div className="rounded-xl bg-surface border border-border p-3 space-y-3">
                  <div className="text-aux font-medium">Ejercicios pendientes — ¿Qué ocurrió?</div>
                  {s.pendingIdx.map((i)=>(
                    <div key={i} className="rounded-xl bg-bg border border-border p-3 space-y-2">
                      <div className="text-body font-medium">{exs[i]?.name} no fue realizado.</div>
                      <div className="text-aux text-xs">Planificado: {exs[i]?.sets} series · Realizado: {((logs[i]||[]).filter(Boolean) as any[]).length} series</div>
                      <select value={pendingReasons[i]?.reason || ''} onChange={(e)=> setPendingReasons((p)=> ({...p, [i]: { reason: e.target.value, comment: p[i]?.comment || '' }}))} className="w-full bg-surface border border-border rounded-xl p-2 text-body">
                        <option value="">Seleccioná motivo…</option>
                        {INCOMPLETE_REASONS.map((r)=> <option key={r} value={r}>{r}</option>)}
                      </select>
                      <textarea value={pendingReasons[i]?.comment || ''} onChange={(e)=> setPendingReasons((p)=> ({...p, [i]: { reason: p[i]?.reason || '', comment: e.target.value }}))} placeholder="Observación / explicación" rows={2} maxLength={500} className="w-full bg-surface border border-border rounded-xl p-2 text-body"/>
                    </div>
                  ))}
                </div>
              )}

              {s.skippedIdx.length>0 && (
                <div className="rounded-xl bg-surface border border-border p-3 space-y-1">
                  <div className="text-aux font-medium">Omitidos durante la sesión (con motivo)</div>
                  {s.skippedIdx.map((i)=> <p key={i} className="text-aux text-sm">{exs[i]?.name} — {skipReasons[i] || pendingReasons[i]?.comment || 'sin motivo'}</p>)}
                </div>
              )}

              {musclePct.length>0 && (
                <div className="rounded-xl bg-surface border border-border p-3 space-y-1">
                  <div className="text-aux font-medium mb-1">Trabajo muscular real</div>
                  {musclePct.map((x)=>(
                    <div key={x.m} className="flex items-center gap-2 text-sm">
                      <span className="text-aux w-24 capitalize">{x.m}</span>
                      <div className="flex-1 h-2 bg-bg border border-border rounded-full overflow-hidden"><div className="h-full bg-action" style={{width: `${x.pct}%`}}/></div>
                      <span className="text-body w-10 text-right">{x.pct}%</span>
                    </div>
                  ))}
                </div>
              )}

              {volumeAlerts.length>0 && (
                <div className="rounded-xl bg-amber-900/20 border border-amber-800 p-3 space-y-1">
                  <div className="text-aux text-amber-300 font-medium">Alertas de volumen / frecuencia</div>
                  {volumeAlerts.map((a,i)=> <p key={i} className="text-aux text-sm">{a}</p>)}
                </div>
              )}

              {Object.keys(progressLines).length>0 && (
                <div className="rounded-xl bg-surface border border-border p-3 space-y-1">
                  <div className="text-aux font-medium mb-1">Progreso vs anterior</div>
                  {Object.entries(progressLines).map(([k,v])=> <p key={k} className="text-aux text-sm">{v}</p>)}
                </div>
              )}

              <div className="rounded-xl bg-surface border border-border p-3 space-y-3">
                <div className="text-aux font-medium">Encuesta post-entrenamiento</div>
                {[['energy','Energía'],['fatigue','Cansancio'],['pain','Dolor'],['mood','Ánimo'],['motivation','Motivación'],['effort','Esfuerzo percibido'],['stress','Estrés']].map(([k,label])=>(
                  <div key={k}>
                    <label className="text-aux text-sm block mb-1">{label} ({k==='pain' ? '0–10' : '1–10'})</label>
                    <div className="flex gap-1">{Array.from({length:10},(_,j)=> (k==='pain'? j : j+1)).map((n)=> scaleBtn(k,n))}</div>
                  </div>
                ))}
                {Number(finishSurvey.pain)>3 && (
                  <div className="grid grid-cols-2 gap-2">
                    <input value={finishSurvey.painZone || ''} onChange={(e)=> setSurvey('painZone', e.target.value)} placeholder="Zona del dolor" maxLength={80} className="bg-bg border border-border rounded-xl p-2 text-body"/>
                    <input value={finishSurvey.painDetail || ''} onChange={(e)=> setSurvey('painDetail', e.target.value)} placeholder="Tipo de dolor" maxLength={140} className="bg-bg border border-border rounded-xl p-2 text-body"/>
                  </div>
                )}
                <textarea value={finishSurvey.generalObservation || ''} onChange={(e)=> setSurvey('generalObservation', e.target.value)} placeholder="Observación general de la sesión" rows={2} maxLength={500} className="w-full bg-bg border border-border rounded-xl p-2 text-body"/>
              </div>

              {finishError && <p className="text-sm text-red-400">{finishError}</p>}

              <button onClick={confirmFinish} disabled={isSaving} className="w-full py-3 rounded-xl bg-action text-textMain font-medium disabled:opacity-50">
                {isSaving ? 'Guardando…' : ((s.pendingIdx.length===0 && s.skippedIdx.length===0) ? 'Confirmar — COMPLETED' : `Confirmar — PARTIAL (${s.exPct}%)`)}
              </button>
              <button onClick={async()=>{ try{ const store = await import('@/services/training/sessionStore'); const targetId = session?.sessionId || sessionId; if(targetId){ const cur = await store.getSession(targetId).catch(()=>null); if(cur && cur.sessionStatus==='COMPLETING'){ const nx = await store.transitionSession(targetId,'IN_PROGRESS'); setSession(nx); setSessionStatus('IN_PROGRESS') } } }catch{ /* noop */ } setShowFinishModal(false) }} className="w-full py-2 rounded-xl bg-surface border border-border text-aux">Volver al entrenamiento</button>
            </div>
          </div>
          )
        })()}
      </div>
    </div>
  )
}

function ResultPanel({ today, sessionStatus }:{ today:string; sessionStatus:string }){
  let r: null | { exPct:number; setPct:number; completedEx:number; plannedEx:number; completedSets:number; plannedSets:number; totalVol:number; totalReps:number; durMin:number; survey:{energy:number;fatigue:number;pain:number;mood:number}; highlights:string[] } = null
  try{ const raw = localStorage.getItem(`althea:result:${today}`); if(raw) r = JSON.parse(raw) }catch{ /* noop */ }
  if(!r) return (
    <div className="rounded-2xl bg-surface border border-border p-4">
      <div className="text-body font-medium">{sessionStatus==='COMPLETED' ? 'Entrenamiento completado — 100%' : 'Entrenamiento parcial'}</div>
      <div className="text-aux">Sesión guardada en historial.</div>
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
    <div className="rounded-2xl bg-surface border border-border p-4 space-y-3 fade-in">
      <div>
        <div className="text-section">Esto es lo que hiciste</div>
        <div className="text-aux">{sessionStatus==='COMPLETED' ? 'Sesión completada — 100%' : `Sesión parcial — ${r.exPct}%`} · Energía {r.survey.energy}/10 · Cansancio {r.survey.fatigue}/10</div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s)=>(
          <div key={s.k} className="rounded-xl bg-bg border border-border p-2 text-center">
            <div className="text-aux">{s.k}</div>
            <div className="text-subtitle">{s.v}</div>
          </div>
        ))}
      </div>
      {r.highlights.length>0 && (
        <div className="rounded-xl bg-bg border border-border p-3 space-y-1">
          <div className="text-aux font-medium">Logros y progreso</div>
          {r.highlights.slice(0,5).map((h,i)=>(<p key={i} className="text-aux st-success-text text-sm">{h}</p>))}
        </div>
      )}
    </div>
  )
}

function ExerciseHeader({ name, muscle, secondary }: { name:string; muscle?:string; secondary?:string[] }){
  const secs = secondary || []
  const pcts = secs.length===0 ? [{n:muscle||'General', p:100}] : secs.length===1 ? [{n:muscle, p:60},{n:secs[0], p:40}] : [{n:muscle,p:60},{n:secs[0],p:30},{n:secs[1],p:10}]
  return (
    <div className="rounded-xl bg-bg border border-border p-2">
      <div className="text-body font-medium">{name}</div>
      <div className="flex flex-wrap gap-1 mt-1">
        {pcts.filter(x=>x.n).map(x=> (
          <span key={x.n} className={`px-2 py-0.5 rounded-full border text-aux ${x.p>=60?'bg-accentDark border-info text-info':'bg-surface border-border text-textMuted'}`}>{x.n}: {x.p}%</span>
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
        <span key={x.n} className="px-1.5 py-0.5 rounded-full bg-surface border border-border text-aux text-[11px]">{x.n}: {x.p}%</span>
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
      const { getLastSerieWithSource } = await import('@/services/history')
      try{
        const { fetchOne } = await import('@/services/exerciseGym')
        if(exerciseId.includes('/')){
          const [m,slug]=exerciseId.split('/')
          const ex:any = await fetchOne(m,slug).catch(()=>null)
          if(ex) setExInfo(ex)
        }
      }catch{}
      const obj:Record<number,any>={}
      for(let i=0;i<sets;i++){
        const r=await getLastSerieWithSource(exerciseId, i+1)
        obj[i]=r
      }
      setRefs(obj)
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

  if(!loaded) return <div className="space-y-3"><div className="h-8 bg-surface border border-border rounded-xl animate-pulse"/></div>

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-bg border border-border p-2">
        <div className="flex flex-wrap gap-1">
          {(() => {
            const m = exInfo?.muscle || 'General'
            const secs = exInfo?.secondaryMuscles || []
            const pcts = secs.length===0 ? [{n:m,p:100}] : secs.length===1 ? [{n:m,p:60},{n:secs[0],p:40}] : [{n:m,p:60},{n:secs[0],p:30},{n:secs[1],p:10}]
            return pcts.filter(x=>x.n).map(x=> <span key={x.n} className={`px-2 py-0.5 rounded-full border text-aux text-xs ${x.p>=60?'bg-accentDark border-info text-info':'bg-surface border-border text-textMuted'}`}>{x.n}: {x.p}%</span>)
          })()}
        </div>
      </div>
      {/* Tabla en columnas — Entrenamiento */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr className="text-aux text-[11px] tracking-widest">
                <th className="p-2 font-medium">SERIE</th>
                <th className="p-2 font-medium">HISTORIAL</th>
                <th className="p-2 font-medium">REPES</th>
                <th className="p-2 font-medium">KILOGRAMOS</th>
                <th className="p-2 font-medium">✓</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Array.from({length:sets}).map((_,si)=>{
                const ref:any = refs[si]
                const w = weights[si] ?? plannedWeight
                const r = reps[si] ?? plannedReps
                const isDone = !!checks[si]
                return (
                  <tr key={si} className={isDone?'bg-accentDark/50':''}>
                    <td className="p-2 text-center font-medium">{si+1}</td>
                    <td className="p-2 text-aux text-center whitespace-nowrap">{ref ? `${ref.reps} repes · ${ref.weight} kg` : `${plannedReps} · ${plannedWeight} kg`}{ref?.isSeed ? ' · base' : ''}</td>
                    <td className="p-1"><input type="number" value={r} onChange={e=>setReps({...reps, [si]: Number(e.target.value)})} className="w-full bg-bg border border-border rounded-lg p-2 text-body text-center" placeholder="repes" inputMode="numeric" aria-label="repes"/></td>
                    <td className="p-1"><input type="number" step="0.1" value={w} onChange={e=>setWeights({...weights, [si]: parseKg(e.target.value)})} className="w-full bg-bg border border-border rounded-lg p-2 text-body text-center" placeholder="kilogramos" inputMode="decimal" aria-label="kilogramos"/></td>
                    <td className="p-2 text-center">
                      <input type="checkbox" checked={!!checks[si]} onChange={e=>{
                        const checked=e.target.checked
                        setChecks({...checks, [si]: checked})
                        if(checked) onComplete(si, parseKg(String(w)), r, negEnabled ? {reps: Number(negReps)||0, weight: parseKg(negWeight)} : undefined , obs || undefined)
                        else setChecks({...checks, [si]: false})
                      }} className="w-5 h-5 accent-action" aria-label="completada"/>
                      {!checks[si] && onSkipSet ? <button onClick={()=> onSkipSet(si)} className="block mx-auto mt-1 text-aux text-info text-xs underline">omitir</button> : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {(()=>{ const order = Array.from({length:sets}).map((_,i)=>i); const next = order.find((i)=> !checks[i] && !(initialSkipped||[]).includes(i)); if(next===undefined) return null; return (<button onClick={(e)=>{ const w=weights[next]??plannedWeight; const r=reps[next]??plannedReps; setChecks({...checks,[next]:true}); try{ e.currentTarget.classList.remove('flash-confirm'); void e.currentTarget.offsetWidth; e.currentTarget.classList.add('flash-confirm') }catch{ /* noop */ } onComplete(next, parseKg(String(w)), r, negEnabled?{reps:Number(negReps)||0,weight:parseKg(negWeight)}:undefined, obs||undefined) }} className="btn-primary w-full">CONFIRMAR SERIE {next+1}</button>) })()}
      {onAddSet ? <button onClick={onAddSet} className="w-full py-2 rounded-xl bg-surface border border-border text-aux text-sm">+ Agregar serie (queda en la sesión, no en la rutina)</button> : null}
      {/* Negativas por ejercicio */}
      <div className="rounded-2xl bg-bg border border-border p-3">
        <label className="flex items-center gap-3 text-body font-medium">
          <input type="checkbox" checked={negEnabled} onChange={e=>setNegEnabled(e.target.checked)} className="w-5 h-5 accent-action" />
          Negativas
        </label>
        <div className={`grid grid-cols-2 gap-3 mt-3 ${!negEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
          <label className="text-aux">repes
            <input type="number" placeholder="repes" value={negReps} onChange={e=>setNegReps(e.target.value)} disabled={!negEnabled} className="w-full mt-2 bg-surface border border-border rounded-xl p-3 text-body text-center text-lg disabled:opacity-50" inputMode="numeric"/>
          </label>
          <label className="text-aux">kilogramos
            <input type="number" step="0.1" placeholder="kilogramos" value={negWeight} onChange={e=>setNegWeight(e.target.value)} disabled={!negEnabled} className="w-full mt-2 bg-surface border border-border rounded-xl p-3 text-body text-center text-lg disabled:opacity-50" inputMode="decimal"/>
          </label>
        </div>
      </div>
      <label className="text-aux font-medium">Observaciones
        <textarea placeholder="RPE, molestias, técnica..." value={obs} onChange={e=>setObs(e.target.value)} rows={3} className="w-full mt-2 bg-surface border border-border rounded-xl p-3 text-body leading-relaxed"/>
      </label>
      <p className="text-aux text-textMuted">Historial agnóstico a rutina — ID_ejercicio {exerciseId} · serie por serie · semilla múltiplo 5</p>
    </div>
  )
}
