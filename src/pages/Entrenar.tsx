import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { db, ensureSeeded } from '@/services/storage/db'
import { getCycleFromProfile } from '@/utils/cycle'
import { v4 as uuid } from 'uuid'
import { Eye, Clock, Check, ChevronRight, Zap, AlertTriangle, RotateCcw, XCircle } from 'lucide-react'
import { aiService } from '@/services/ai/aiService'
import { buildTrainingContext } from '@/services/ai/contextBuilder'
import * as Gym from '@/services/exerciseGym'
import { saveDecision } from '@/services/ai/coachMemory'
import { loadActiveSession, transitionSession, saveActiveSession, type ActiveSession, type SessionStatus } from '@/services/training/sessionMachine'

type SessionEx = { exId:string; name:string; sets:number; reps:number; weight:number; muscle?:string; gifUrl?:string; swappedFrom?:string; replaced?:boolean; extra?:boolean; plannedSets?:number; seriesType?:string }

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
  const [showModify,setShowModify]=useState(false)
  const [mod,setMod]=useState({weight:0,reps:0,sets:0, seriesType:'normal'})
  const [showObservation,setShowObservation]=useState(false)
  const [obsReasons,setObsReasons]=useState<string[]>([])
  const [obsComment,setObsComment]=useState('')
  const [showSwap,setShowSwap]=useState(false)
  const [swapOptions,setSwapOptions]=useState<Gym.Exercise[]>([])
  const [showSkipReason,setShowSkipReason]=useState(false)
  const [skipReason,setSkipReason]=useState('')
  // Estados para FINALIZAR ENTRENAMIENTO + máquina de estados
  const [showFinishModal,setShowFinishModal]=useState(false)
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
  const [resumeBanner,setResumeBanner]=useState<ActiveSession|null>(null)
  const [progressLines,setProgressLines]=useState<Record<string,string>>({})
  const loadedRef = useRef<string>('')

  const applySessionToState = async (sess: ActiveSession) => {
    loadedRef.current = sess.sessionId
    setSessionId(sess.sessionId)
    setSessionStatus(sess.sessionStatus)
    setSessionStartTime(sess.startedAt || sess.createdAt)
    setRutinaName(sess.routineName || 'Rutina')
    setRoutineId(sess.routineId)
    setDayName(sess.actualDayName || (sess.actualDay ? `Día N°${sess.actualDay}` : 'Descanso'))
    setPlannedDayN(sess.plannedDay)
    setActualDayN(sess.actualDay)
    setPlannedName(sess.plannedDayName || '')
    setWeekNumber(sess.weekNumber || 1)
    const list: SessionEx[] = (sess.exercises || []).map((x:any)=> ({
      exId: x.exId || x.id, name: x.name, sets: x.sets, reps: x.reps, weight: x.weight,
      muscle: x.muscle, gifUrl: x.gifUrl, plannedSets: x.sets,
    }))
    setExs(list); setCurrent(0); setDone({}); setSkipped({}); setLogs({})
    if(list[0]){
      const ctx:any = await buildTrainingContext(list[0].exId, list[0].name)
      const rec = await aiService.generateRecommendation(ctx).catch(()=> ({reason: `Vamos con ${list[0].weight}kg x ${list[0].reps} — ajustamos según cómo te sientas.`, suggested_weight:list[0].weight, confidence:0.6, factors:['determinístico']}))
      setCoach(rec)
    } else setCoach(null)
  }

  const load = async ()=>{
      // PRIORIDAD 1: sesion activa explicita (maquina de estados). Nunca recalcular calendario por encima.
      const explicit = loadActiveSession()
      if(loadedRef.current && explicit && explicit.sessionId===loadedRef.current && explicit.calendarDate===today) return
      if(explicit && explicit.calendarDate === today && ['READY','IN_PROGRESS','PAUSED','COMPLETING'].includes(explicit.sessionStatus)){
        try{
          let s = explicit
          if(s.sessionStatus === 'READY') s = transitionSession(s, 'IN_PROGRESS')
          await applySessionToState(s)
          return
        }catch{}
      }
      if(explicit && explicit.calendarDate !== today && ['IN_PROGRESS','PAUSED','READY'].includes(explicit.sessionStatus)){
        setResumeBanner(explicit)
      }
      // PRIORIDAD 2: legacy session:active (compatibilidad) -> migrar a READY->IN_PROGRESS
      const activeRaw = localStorage.getItem(`session:active:${today}`)
      if(activeRaw){
        try{
          const sess = JSON.parse(activeRaw)
          const { createReadySession } = await import('@/services/training/sessionMachine')
          const s = createReadySession({
            calendarDate: today,
            routineId: sess.routineId || 'r1',
            routineName: sess.routineName || 'Rutina',
            plannedDay: sess.scheduledDay ?? sess.dayN ?? null,
            plannedDayName: sess.scheduledName ?? null,
            actualDay: sess.dayN ?? null,
            actualDayName: sess.dayName ?? null,
            exercises: (sess.exercises || []).map((x:any)=> ({ exId: x.exId || x.id, name: x.name, sets: x.sets, reps: x.reps, weight: x.weight, muscle: x.muscle, gifUrl: x.gifUrl })),
          })
          const s2 = transitionSession(s, 'IN_PROGRESS')
          await applySessionToState(s2)
          return
        }catch{}
      }
      const rawList = JSON.parse(localStorage.getItem('rutinas:list')||'null')
      const activeId = localStorage.getItem('rutina:activeId')
      let active:any = rawList?.find((r:any)=>r.id===activeId) || rawList?.[0]
      if(!active){
        const p:any = await db.userProfile.get('me')
        active = { cycle: p?.cycle, name: 'Rutina' }
      }
      setRutinaName(active.name || 'Rutina')
      setRoutineId(active.id || 'r1')
      const cycle = active.cycle || getCycleFromProfile(await db.userProfile.get('me') as any)
      const dow = new Date().getDay()
      const override = localStorage.getItem(`session:override:${today}`)
      const n = override ? Number(override) : cycle.weekMap[dow]
      const schedN = cycle.weekMap[dow] ?? null
      const schedName = schedN ? cycle.trainingDays.find((d:any)=>d.n===schedN)?.name || `Día N°${schedN}` : null
      const dname = n ? cycle.trainingDays.find((d:any)=>d.n===n)?.name || `Día N°${n}` : 'Descanso'
      setDayName(dname)
      setPlannedDayN(schedN)
      setActualDayN(n)
      setPlannedName(schedName || '')
      const { getDayExercises } = await import('@/utils/routine')
      let list: SessionEx[] = (await getDayExercises(n, cycle)).map(x=> ({ exId: x.exId, name: x.name, sets: x.sets, reps: x.reps, weight: x.weight, muscle: x.muscle as any, gifUrl: (x as any).gifUrl, plannedSets: x.sets }))
      setExs(list); setCurrent(0); setDone({}); setSkipped({}); setLogs({})
      if(list.length>0){
        try{
          const { createReadySession } = await import('@/services/training/sessionMachine')
          const s = createReadySession({
            calendarDate: today, routineId: active.id || 'r1', routineName: active.name || 'Rutina',
            plannedDay: schedN, plannedDayName: schedName, actualDay: n, actualDayName: dname, exercises: list,
          })
          const s2 = transitionSession(s, 'IN_PROGRESS')
          loadedRef.current = s2.sessionId
          setSessionId(s2.sessionId); setSessionStatus('IN_PROGRESS'); setSessionStartTime(s2.startedAt || new Date().toISOString())
          setWeekNumber(s2.weekNumber || 1)
        }catch{}
      } else { setSessionStatus('PLANNED'); return }
      if(list[0]){
        const ctx:any = await buildTrainingContext(list[0].exId, list[0].name)
        const rec = await aiService.generateRecommendation(ctx).catch(()=> ({reason: `Vamos con ${list[0].weight}kg x ${list[0].reps}.`, suggested_weight:list[0].weight, confidence:0.6, factors:['determinístico']}))
        setCoach(rec)
      } else setCoach(null)
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
    const id = setInterval(()=> setRestSec(s=> s>0 ? s-1 : 0), 1000)
    return ()=>{ clearInterval(id); window.removeEventListener('storage', onStorage); window.removeEventListener('focus', onFocus); window.removeEventListener('routineChange', onCustom as any) }
  },[])

  const cur = exs[current]
  const progress = exs.length ? Math.round(Object.keys(done).filter(k=>done[Number(k)]).length / exs.length * 100) : 0

  const nextCoach = async (nextIdx:number)=>{
    if(nextIdx>=exs.length) return
    const nxt = exs[nextIdx]
    const hist = await db.setLogs.where('exerciseId').equals(nxt.exId).reverse().limit(3).toArray()
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
    if(!cur) return
    const arr = logs[current] || []
    arr[setIdx] = { weight:w, reps:r, rpe:7, neg, obs }
    setLogs({...logs, [current]: arr})
    const { v4: uuid } = await import('uuid')
    let session = await db.sessions.where('localDate').equals(today).first()
    if(!session){ session = { id: uuid(), localDate: today, startedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; await db.sessions.put(session) }
    await db.setLogs.put({ id: uuid(), sessionId: session.id, exerciseId: cur.exId, setNumber: setIdx+1, weight:w, reps:r, completed:true, createdAt: new Date().toISOString(), notes: obs || (neg?`neg:${neg.reps}x${neg.weight}`:undefined) } as any)
    // guarda negativa en campo separado si existe
    if(neg) localStorage.setItem(`neg:${today}:${cur.exId}:${setIdx}`, JSON.stringify(neg))
    if(obs) localStorage.setItem(`obs:${today}:${cur.exId}`, obs)
    if(arr.filter(Boolean).length===cur.sets){
      setDone({...done, [current]: true})
      saveDecision({ date: today, type:'accept', exercise: cur.name, reason: coach?.reason, contextSnapshot:{weight:w,reps:r}} as any)
      setRestSec(90)
      if(current < exs.length-1){
        setTimeout(()=>{ setCurrent(current+1); nextCoach(current+1) }, 800)
      }
      // guardar ejercicio NO finaliza la sesion: se usa el boton FINALIZAR ENTRENAMIENTO
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
    const muscleMap:any = { pecho:'pectorals', espalda:'lats', biceps:'biceps', triceps:'triceps', hombros:'delts', piernas:'quads', cuadriceps:'quads', gluteos:'glutes', isquios:'hamstrings' }
    const m = muscleMap[(cur.muscle||'').toLowerCase()] || 'pectorals'
    try{
      const res = await Gym.fetchByMuscle(m)
      // excluir el actual
      const opts = res.exercises.filter((e:any)=> e.id !== cur.exId && e.name !== cur.name).slice(0, 8)
      setSwapOptions(opts)
      setShowSwap(true)
    }catch{}
  }, [cur])

  const handleSwap = async (newEx:Gym.Exercise)=>{
    if(!cur) return
    // guarda estado del actual
    saveDecision({ date: today, type:'swap', exercise: cur.name, reason:`Cambiado a ${newEx.name}`, contextSnapshot:{ from:cur.exId, to:newEx.id }} as any)
    setExs(prev=> prev.map((ex,i)=> i===current ? { ...ex, exId: newEx.id, name: newEx.name, muscle: newEx.muscle, gifUrl: newEx.gifUrl, swappedFrom: cur.exId, replaced: true, plannedSets: ex.plannedSets ?? ex.sets } : ex ))
    setShowSwap(false)
    setSwapOptions([])
    // recarga coach para el nuevo
    const ctx:any = await buildTrainingContext(newEx.id, newEx.name)
    const rec = await aiService.generateRecommendation(ctx).catch(()=> ({reason:`Vamos con ${cur.weight}kg × ${cur.reps}.`, suggested_weight:cur.weight}))
    setCoach(rec)
    // se conserva historial Dexie y borrador del original: no mezclar, no borrar
  }

  const handleSkipWithReason = ()=>{
    setShowSkipReason(true)
  }

  const confirmSkip = async ()=>{
    if(!cur) return
    saveDecision({ date: today, type:'skip', exercise: cur.name, motive: skipReason, reason: coach?.reason, contextSnapshot:{} } as any)
    setSkipReasons((p)=> ({...p, [current]: skipReason}))
    setSkipped((p)=> ({...p, [current]: true}))
    setDone({...done, [current]: true})
    clearExState(today, cur.exId)
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
        const past = await db.setLogs.where('exerciseId').anyOf(exIds).filter(l=> l.completed && (l.createdAt||'').slice(0,10)!==today).toArray()
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
    // transicion controlada a COMPLETING (idempotente si ya esta)
    try{
      const cur = loadActiveSession()
      if(cur && (!sessionId || cur.sessionId===sessionId) && (cur.sessionStatus==='IN_PROGRESS' || cur.sessionStatus==='PAUSED' || cur.sessionStatus==='READY')) {
        const nx = transitionSession(cur, 'COMPLETING')
        setSessionStatus('COMPLETING')
        setSessionId(nx.sessionId)
      } else if(cur && cur.sessionId===(sessionId||cur.sessionId) && cur.sessionStatus==='COMPLETING') {
        setSessionStatus('COMPLETING')
      } else setSessionStatus('COMPLETING')
    }catch(e:any){ setFinishError(e?.message || 'No se pudo pasar a COMPLETING') }
    setShowFinishModal(true)
  }

  // Cierre atomico COMPLETING -> COMPLETED/PARTIAL. Si falla el guardado NO finaliza.
  const confirmFinish = async () => {
    setFinishError('')
    try{
      const s = computeSummary()
      for(const i of s.pendingIdx){
        const pr = pendingReasons[i]
        if(!pr || !pr.reason){ setFinishError(`Falta motivo para "${exs[i]?.name || 'ejercicio'}".`); return }
      }
      if(!sessionId) throw new Error('Sin sessionId: recargá la pestaña Entrenamiento antes de finalizar.')
      if(!routineId) throw new Error('Sesión sin rutina asociada.')
      const status = (s.pendingIdx.length===0 && s.skippedIdx.length===0) ? 'COMPLETED' : 'PARTIAL'
      const endTime = new Date().toISOString()
      const durMin = Math.max(0, Math.round((new Date(endTime).getTime()-new Date(sessionStartTime).getTime())/60000))
      const changedRaw = localStorage.getItem(`session:changed:${today}`)
      const changed = changedRaw ? JSON.parse(changedRaw) : null
      const exerciseRecords = s.perEx.map((p)=>{
        const pr = pendingReasons[p.i]
        const wasSkipped = !!p.skipped
        const skipped = !p.done || wasSkipped
        return {
          id: uuid(), sessionId, exerciseId: p.exId, exerciseName: p.name,
          plannedSets: p.plannedSets, completedSets: p.completedSets,
          plannedReps: exs[p.i]?.reps || 0,
          completedReps: ((logs[p.i]||[]).filter(Boolean) as any[]).map(x=> Number(x?.reps||0)),
          weightPerSet: ((logs[p.i]||[]).filter(Boolean) as any[]).map(x=> Number(x?.weight||0)),
          status: skipped ? 'NO_REALIZADO' : (p.replaced ? 'REEMPLAZADO' : (p.modified ? 'MODIFICADO' : 'COMPLETADO')),
          originalExerciseId: p.swappedFrom,
          notes: skipped ? [pr?.reason, pr?.comment].filter(Boolean).join(' — ') : (localStorage.getItem(`obs:${today}:${p.exId}`) || undefined),
          noRealizadoMotivo: skipped ? (wasSkipped ? (skipReasons[p.i] || pr?.reason) : pr?.reason) : undefined,
          noRealizadoComentario: skipped ? (wasSkipped ? (skipReasons[p.i] || pr?.comment) : pr?.comment) : undefined,
        }
      })
      const fs = finishSurvey || {}
      const record = {
        id: sessionId,
        calendarDate: today,
        routineId,
        weekNumber,
        plannedDay: plannedDayN,
        actualDay: actualDayN,
        plannedMuscleGroups: [],
        actualMuscleGroups: Array.from(new Set(exs.map(e=> e.muscle || 'general'))),
        startTime: sessionStartTime,
        endTime,
        durationMin: durMin,
        sessionStatus: status,
        exerciseRecords,
        plannedExerciseCount: s.plannedEx,
        completedExerciseCount: s.completedEx,
        skippedExerciseCount: s.pendingIdx.length + s.skippedIdx.length,
        modifiedExerciseCount: s.modified,
        replacedExerciseCount: s.replaced,
        extraExerciseCount: 0,
        plannedSets: s.plannedSets,
        completedSets: s.completedSets,
        totalReps: s.totalReps,
        totalVolume: s.totalVol,
        energy: Number(fs.energy ?? 5),
        fatigue: Number(fs.fatigue ?? 5),
        pain: Number(fs.pain ?? 0),
        mood: Number(fs.mood ?? 5),
        motivation: Number(fs.motivation ?? 5),
        effort: Number(fs.effort ?? 5),
        stress: Number(fs.stress ?? 5),
        painZone: fs.painZone || '',
        painDetail: fs.painDetail || '',
        generalNotes: fs.generalObservation || '',
        plannedDayName: plannedName || '',
        actualDayName: dayName || '',
        routineName: rutinaName || '',
        dayChangeReason: changed?.changeReason || '',
        dayChangeComment: changed?.changeComment || '',
        createdAt: sessionStartTime,
        updatedAt: endTime,
      }
      // 1) guardar sesion + memoria coach (atomico: si falla, no se transiciona)
      await db.table('trainingSessions').put(record as any)
      await db.table('coachMemory').put({ ...record, id: `obs-${today}`, type: 'observation', date: today } as any)
      // 2) actualizar secuencia semanal
      try{
        const seqId = `seq-${routineId}-w${weekNumber}`
        const prev:any = await db.table('weeklySequences').get(seqId).catch(()=>null)
        const done_days = Array.from(new Set([...(prev?.completedDays||[]), ...(actualDayN!=null?[actualDayN]:[])]))
        await db.table('weeklySequences').put({ id: seqId, cycleId: routineId, weekNumber, plannedDays: prev?.plannedDays||[], completedDays: done_days, partialDays: status==='PARTIAL' ? [...(prev?.partialDays||[]), actualDayN] : (prev?.partialDays||[]), createdAt: prev?.createdAt || new Date().toISOString() } as any)
      }catch{}
      // 3) limpiar borradores por ejercicio + legacy
      for(const ex of exs){ try{ localStorage.removeItem(`exstate:${today}:${ex.exId}`) }catch{} }
      localStorage.setItem(`observation:${today}`, JSON.stringify({ date: today, sessionId, ...record }))
      localStorage.removeItem(`session:active:${today}`)
      // 4) transicionar y cerrar sesion activa
      try{
        const cur = loadActiveSession()
        if(cur && cur.sessionId===sessionId) transitionSession(cur, status as any)
      }catch{}
      const { clearActiveSession } = await import('@/services/training/sessionMachine')
      clearActiveSession()
      setSessionStatus(status as any)
      setShowFinishModal(false)
      saveDecision({ date: today, type: status==='COMPLETED'?'accept':'skip', exercise: `Sesión ${rutinaName}`, reason: `Finalizada ${status} — Ej ${s.completedEx}/${s.plannedEx} (${s.exPct}%), Series ${s.completedSets}/${s.plannedSets} (${s.setPct}%)`, contextSnapshot: record } as any)
    }catch(e:any){ setFinishError(e?.message || 'Error al guardar. Reintentá sin perder datos.') }
  }

  const adoptResumeSession = async (sess: ActiveSession, andFinish: boolean) => {
    // reutiliza MISMO sessionId (no crea segunda sesion); migra borradores exstate a hoy
    for(const ex of (sess.exercises||[])){
      try{
        const oldK = `exstate:${sess.calendarDate}:${ex.exId}`
        const newK = `exstate:${today}:${ex.exId}`
        const raw = localStorage.getItem(oldK)
        if(raw && !localStorage.getItem(newK)) localStorage.setItem(newK, raw)
      }catch{}
    }
    const migrated: ActiveSession = { ...sess, calendarDate: today, updatedAt: new Date().toISOString() }
    saveActiveSession(migrated)
    setResumeBanner(null)
    await applySessionToState(migrated.sessionStatus==='READY' ? transitionSession(migrated,'IN_PROGRESS') : migrated)
    if(andFinish) setTimeout(()=> openFinishModal(), 400)
  }

  const abandonResume = async () => {
    try{
      const cur = loadActiveSession()
      if(cur && resumeBanner && cur.sessionId===resumeBanner.sessionId){
        try{ transitionSession(cur, 'ABANDONED') }catch{}
        const { clearActiveSession } = await import('@/services/training/sessionMachine')
        clearActiveSession()
      }
    }catch{}
    setResumeBanner(null)
  }

  const togglePause = async () => {
    try{
      const cur = loadActiveSession()
      if(!cur) return
      if(cur.sessionStatus==='IN_PROGRESS'){ const nx = transitionSession(cur,'PAUSED'); setSessionStatus('PAUSED'); saveActiveSession(nx) }
      else if(cur.sessionStatus==='PAUSED'){ const nx = transitionSession(cur,'IN_PROGRESS'); setSessionStatus('IN_PROGRESS'); saveActiveSession(nx) }
    }catch(e:any){ setFinishError(e?.message || 'No se pudo pausar') }
  }

  if(exs.length===0) return <div className="min-h-screen bg-bg p-4 pb-24 max-w-lg mx-auto"><p className="text-body">Hoy es descanso o sin ejercicios. Cambiá el día en Inicio.</p></div>

  return (
    <div className="min-h-screen bg-bg pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3">
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
          {restSec>0 && <div className="mt-2 flex items-center gap-2 text-aux bg-accentDark border border-border rounded-xl p-2"><Clock size={14}/> Descanso {Math.floor(restSec/60)}:{String(restSec%60).padStart(2,'0')} <button onClick={()=>setRestSec(0)} className="ml-auto text-info">Saltar</button></div>}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {resumeBanner && (
          <div className="rounded-2xl bg-amber-900/20 border border-amber-800 p-4 space-y-2">
            <div className="text-body font-medium">Tenés un entrenamiento en progreso ({resumeBanner.calendarDate}).</div>
            <div className="text-aux">{resumeBanner.routineName} — {resumeBanner.actualDayName} · estado {resumeBanner.sessionStatus}</div>
            <div className="flex gap-2">
              <button onClick={()=> adoptResumeSession(resumeBanner, false)} className="flex-1 py-2 rounded-xl bg-action text-textMain">Continuar</button>
              <button onClick={()=> adoptResumeSession(resumeBanner, true)} className="flex-1 py-2 rounded-xl bg-surface border border-border text-aux">Finalizar</button>
              <button onClick={abandonResume} className="flex-1 py-2 rounded-xl bg-bg border border-border text-aux">Abandonar</button>
            </div>
          </div>
        )}
        {(sessionStatus==='COMPLETED' || sessionStatus==='PARTIAL') && (
          <div className="rounded-2xl bg-accentDark border border-border p-4">
            <div className="text-body font-medium">{sessionStatus==='COMPLETED' ? 'Entrenamiento completado — 100%' : `Entrenamiento parcial — ${exs.length ? Math.round(Object.keys(done).filter(k=>done[Number(k)]).length/exs.length*100) : 0}%`}</div>
            <div className="text-aux">Sesión guardada en historial. Podés seguir navegando.</div>
          </div>
        )}
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
              logs={logs[current]||[]}
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
            <div onClick={e=>e.stopPropagation()} className="bg-bg border border-border rounded-2xl w-full max-w-lg p-4 space-y-3 max-h-[80vh] overflow-auto">
              <div className="flex justify-between items-center">
                <h3 className="text-subtitle">Cambiar ejercicio — {cur?.muscle || 'mismo grupo'}</h3>
                <button onClick={()=>{setShowSwap(false); setSwapOptions([])}} className="w-8 h-8 rounded-full bg-surface border border-border">✕</button>
              </div>
              <p className="text-aux">Elegí una alternativa del mismo grupo muscular</p>
              <div className="space-y-2 max-h-60 overflow-auto">
                {swapOptions.map((opt:any)=>(
                  <button key={opt.id} onClick={()=> handleSwap(opt)} className="w-full text-left p-3 rounded-xl bg-surface border border-border flex items-center gap-3 hover:bg-bg transition">
                    {opt.gifUrl && <img src={opt.gifUrl} alt={opt.name} className="w-12 h-12 rounded-lg object-cover"/>}
                    <div>
                      <div className="text-body font-medium">{opt.name}</div>
                      <div className="text-aux text-xs">{opt.muscle} · {opt.equipment}</div>
                    </div>
                  </button>
                ))}
              </div>
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

        {showFinishModal && (()=>{
          const s = computeSummary()
          const setSurvey = (k:string,v:any)=> setFinishSurvey((p)=> ({...p,[k]:v}))
          const scaleBtn = (k:string,n:number)=> (
            <button key={n} onClick={()=> setSurvey(k,n)} className={`flex-1 aspect-square rounded-xl border transition text-sm ${Number(finishSurvey[k])===n ? 'bg-action border-action text-textMain' : 'bg-surface border-border text-aux'}`}>{n}</button>
          )
          return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-bg border border-border rounded-2xl w-full max-w-lg p-4 space-y-4 max-h-[90vh] overflow-auto">
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

              <button onClick={confirmFinish} className="w-full py-3 rounded-xl bg-action text-textMain font-medium">
                {(s.pendingIdx.length===0 && s.skippedIdx.length===0) ? 'Confirmar — COMPLETED' : `Confirmar — PARTIAL (${s.exPct}%)`}
              </button>
              <button onClick={async()=>{ try{ const cur = loadActiveSession(); if(cur && cur.sessionStatus==='COMPLETING'){ transitionSession(cur,'IN_PROGRESS'); setSessionStatus('IN_PROGRESS') } }catch{} setShowFinishModal(false) }} className="w-full py-2 rounded-xl bg-surface border border-border text-aux">Volver al entrenamiento</button>
            </div>
          </div>
          )
        })()}
      </div>
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

function ExerciseSeriesTable({ exerciseId, today, sets, plannedReps, plannedWeight, onComplete, logs }:{ exerciseId:string; today:string; sets:number; plannedReps:number; plannedWeight:number; onComplete:(idx:number,w:number,r:number,neg?:any,obs?:string)=>void; logs:any[] }){
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
      setLoaded(true)
    }
    load()
  },[exerciseId, sets, plannedReps, plannedWeight, loadPersisted])

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
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
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
