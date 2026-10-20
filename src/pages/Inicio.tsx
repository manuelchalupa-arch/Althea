import { useEffect, useMemo, useState } from 'react'
import SemanticIcon from '../components/ui/SemanticIcon';
import { Link, useNavigate } from 'react-router-dom'
import { db, ensureSeeded } from '@/services/storage/db'
import { getCycleFromProfile, getTrainingDayForDate, formatAgendaDate } from '@/utils/cycle'
import { getCanonicalCycle } from '@/services/planning/cycleVersions'

import { getMethod } from '@/services/ai/trainingMethodsDB'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'
import type { CycleConfig } from '@/utils/cycle'
import BrandIcon from '@/components/brand/BrandIcon'
import { WaterBottle } from '@/components/recovery/WaterBottle'
import { BottleConfigEditor } from '@/components/recovery/BottleConfigEditor'
import { AltheaPanel, AltheaMetric, AltheaStatRow } from '@/components/althea'
import ActivityModal from '@/components/activity/ActivityModal'
import { getOverrideDay, getChangedData, setOverride, removeOverride, migrateSessionOverridesFromLocalStorage } from '@/services/storage/sessionOverrideStore'
import { useActiveTrainingSession } from '@/hooks/useActiveTrainingSession'
import { useIsMobile } from '@/hooks/useIsMobile'
import { todayKey, daysBetween, parseLocalDateKey, toLocalDateKey, weekdayOfKey, addDaysToKey, toDateKey, isDateKey, weekStartKey } from '@/utils/dates'
import type { ExpenditureResult } from '@/services/training/exerciseEnergy'

const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X']

/** Fila del gasto calórico: valor real o estado honesto, nunca números inventados. */
function sinSesiones(r: ExpenditureResult | null | undefined): boolean {
  return !!r && r.totalKcal === null && r.motivo === 'SIN_SESIONES'
}

function GastoRow({ label, res, testId, hideEmptyNote = false }: { label: string; res: ExpenditureResult; testId: string; hideEmptyNote?: boolean }) {
  const sinDatos = res.totalKcal === null && res.motivo !== 'SIN_SESIONES'
  if (sinDatos) {
    return (
      <div data-testid={testId} className="flex items-center justify-between gap-3 rounded bg-surface-container px-2.5 py-2">
        <span className="font-label-caps text-[9px] text-on-surface-variant uppercase">{label}</span>
        <span data-testid={`${testId}-sin-datos`} className="text-[11px] text-on-surface-variant italic text-right">Sin datos suficientes para estimar</span>
      </div>
    )
  }
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-3 rounded bg-surface-container px-2.5 py-2">
      <span className="font-label-caps text-[9px] text-on-surface-variant uppercase">{label}</span>
      <span className="text-right">
        <span data-testid={`${testId}-kcal`} className="font-headline-sm text-on-surface font-semibold">{Math.round(res.totalKcal ?? 0)} <span className="text-[11px] text-primary font-normal">kcal</span></span>
        <span data-testid={`${testId}-min`} className="block text-[10px] text-on-surface-variant">
          {res.totalMinutes !== null ? `${Math.round(res.totalMinutes)} min de sesión` : hideEmptyNote ? '' : 'Sin sesiones registradas'}
        </span>
      </span>
    </div>
  )
}

export default function Inicio(){
  const nav = useNavigate()
  // Sesión activa canónica (no finalizada): fuente de verdad de "hay sesión".
  const { hasActiveSession } = useActiveTrainingSession()
  // Presentación mobile (Stitch). En jsdom no hay matchMedia → false → desktop.
  const isMobile = useIsMobile()
  const todayStr = todayKey()
  const { dayName, dayNum, month } = formatAgendaDate(todayStr)
  const [cycle, setCycle] = useState(getCycleFromProfile(null))
  const [userName, setUserName] = useState('')
  const [exNames, setExNames] = useState<{id:string; name:string; sets:number; reps:number; weight:number|null; restSec?:number; rpe?:number; muscle?:string}[]>([])
  const [addingWater, setAddingWater] = useState(false)
  const [waterVersion, setWaterVersion] = useState(0)
  const [routineReview, setRoutineReview] = useState<{ days: number; limit: number; reviewKey?: string; daysLeft?: number } | null>(null)
  const [routineBlocked, setRoutineBlocked] = useState(false)
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const [snoozeDays, setSnoozeDays] = useState(7)
  const [briefScore, setBriefScore] = useState<number|null>(null)
  const [briefWarn, setBriefWarn] = useState<string|null>(null)
  const [briefV2, setBriefV2] = useState<{progress?:{trend?:string;rate?:number};recovery?:{lastScore?:number;trend?:string};nutrition?:{tdee?:number;proteinPerKg?:number;gap?:string|null}}|null>(null)
  const [activeMethodName, setActiveMethodName] = useState<string|null>(null)
  const [showChangeDay, setShowChangeDay] = useState(false)
  const [changeReason, setChangeReason] = useState('Cambio de horarios')
  const [changeComment, setChangeComment] = useState('')
  const [overrideDay, setOverrideDay] = useState<number|null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [dayStatus, setDayStatus] = useState<Record<string,{planned:boolean; dayN:number|null; dayName:string|null; sessionStatus:string|null; overridden:boolean; volume?:number; rating?:number|null}>>({})
  // Gasto calórico del ejercicio: mismo motor que historial e informes (PDF).
  const [gasto, setGasto] = useState<{ hoy: ExpenditureResult; semana: ExpenditureResult } | null>(null)
  const todayCompleted = dayStatus[todayStr]?.sessionStatus === 'COMPLETED'
  const [selectedDate] = useState<string>(todayStr)
  const [, setPreviewList] = useState<{id:string;name:string;sets:number;reps:number;weight:number|null;restSec?:number;seriesType?:string;muscle?:string}[]>([])
  const [, setPreviewName] = useState('')
  const [editingIdx, setEditingIdx] = useState<number|null>(null)
  const [editDraft, setEditDraft] = useState<{reps:number; weight:number|null; restSec:number}>({reps:0, weight:0, restSec:90})
  const [, setSavedIdx] = useState<number|null>(null)
  const [showCalendarPopover, setShowCalendarPopover] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)

  const loadDay = async (cycleToUse:any, dayN:number | null)=>{
    const { getDayExercises } = await import('@/utils/routine')
    const list = await getDayExercises(dayN, cycleToUse)
    setExNames(list.map(x=> ({id:x.exId, name:x.name, sets:x.sets, reps:x.reps, weight:x.weight, restSec:x.restSec, rpe:x.rpe, muscle:x.muscle})))
  }

  const saveExerciseEdit = async (idx:number)=>{
    const updated = [...exNames]
    updated[idx] = { ...updated[idx], reps: editDraft.reps, weight: editDraft.weight, restSec: editDraft.restSec }
    setExNames(updated)
    // Persist to routineStore (Dexie)
    try{
      const { getAllRoutines, getActiveRoutineId, saveAllRoutines } = await import('@/services/storage/routineStore')
      const rawList = await getAllRoutines()
      const activeId = await getActiveRoutineId()
      const activeIdx = rawList?.findIndex((r:any)=>r.id===activeId) ?? 0
      if(rawList && rawList[activeIdx]){
        const dayN = effectiveN
        if(dayN && rawList[activeIdx].dayExercises?.[dayN]){
          const exArr = rawList[activeIdx].dayExercises[dayN]
          const targetId = updated[idx].id
          const exInDay = exArr.findIndex((e:any)=> (e.exId || e.id) === targetId)
          if(exInDay >= 0){
            const prevEx = exArr[exInDay]
            exArr[exInDay] = { ...prevEx, reps: editDraft.reps, weight: editDraft.weight ?? null, restSec: editDraft.restSec,
              // Si el día define plan por serie, se actualiza cada serie (la serie
              // es la fuente de verdad; si no, el escalar quedaría ignorado).
              series: Array.isArray(prevEx.series) ? prevEx.series.map(s=> ({ ...s, reps: editDraft.reps, weight: editDraft.weight ?? null })) : prevEx.series }
            rawList[activeIdx].dayExercises[dayN] = exArr
            await saveAllRoutines(rawList, activeId)
          }
        }
      }
    }catch{}
    setEditingIdx(null)
    setSavedIdx(idx)
    setTimeout(()=> setSavedIdx(null), 1500)
  }
  const weekKeys = useMemo(()=>{
    const base = parseLocalDateKey(todayStr)
    const mon = new Date(base)
    mon.setDate(base.getDate() - weekdayOfKey(todayStr) + weekOffset*7)
    return Array.from({length:7},(_,i)=>{ const dt=new Date(mon); dt.setDate(mon.getDate()+i); return toLocalDateKey(dt) })
  },[todayStr, weekOffset])

  useEffect(()=>{
    const loadWeek = async ()=>{
      const sessions = await db.trainingSessions.toArray().catch(()=>[])
      const byDate: Record<string,any> = {}
      for(const s of sessions){
        const k = s.calendarDate
        if(!k) {continue}
        const prev = byDate[k]
        if(!prev || String(s.updatedAt||'') > String(prev.updatedAt||'')) {byDate[k] = s}
      }
      const overrides = await Promise.all(weekKeys.map(k => getOverrideDay(k)))
      // Valoración real de la sesión (encuesta post-entreno), por fecha.
      const surveys = await db.postWorkoutSurveys.toArray().catch(()=>[]) as Array<{calendarDate?: string; sessionRating?: number}>
      const ratingByDate: Record<string, number> = {}
      for(const sv of surveys){ if(sv.calendarDate && typeof sv.sessionRating === 'number'){ ratingByDate[sv.calendarDate] = sv.sessionRating } }
      const map: typeof dayStatus = {}
      for(let i = 0; i < weekKeys.length; i++){
        const iso = weekKeys[i]
        const dow = weekdayOfKey(iso)
        const n = cycle.weekMap[dow] ?? null
        const nm = n ? cycle.trainingDays.find((d:any)=>d.n===n)?.name || `Día N°${n}` : null
        const sess = byDate[iso]
        map[iso] = {
          planned: n !== null && n !== undefined,
          dayN: n, dayName: nm,
          sessionStatus: sess?.sessionStatus || null,
          overridden: overrides[i] !== null && overrides[i] !== undefined,
          volume: sess?.totalVolume || undefined,
          rating: ratingByDate[iso] ?? null,
        }
      }
      setDayStatus(map)
    }
    loadWeek().catch(()=>{})
  },[cycle, weekKeys, overrideDay])

  // Gasto calórico del ejercicio (fecha actual + semana en curso, lun→hoy).
  // Un solo motor (exerciseEnergy) compartido con historial e informes PDF.
  // Calorías activas: sesiones de fuerza (netKcal, sin reposo) + sesiones de
  // Actividad (activeKcal del snapshot). Nunca brutas ni TDEE: no duplican.
  const [activasHoy, setActivasHoy] = useState<number | null>(null)
  useEffect(()=>{
    let alive = true
    const load = async ()=>{
      const { computeExpenditure, loadWeightRows } = await import('@/services/training/exerciseEnergy')
      const [sessions, weightRows] = await Promise.all([
        db.trainingSessions.toArray().catch(()=>[]),
        loadWeightRows(),
      ])
      const desde = weekStartKey(todayStr)
      const hoy = computeExpenditure({ from: todayStr, to: todayStr, sessions, weightRows })
      const semana = computeExpenditure({ from: desde, to: todayStr, sessions, weightRows })
      if(alive){ setGasto({ hoy, semana }) }
      try {
        const { getActivityHistoryBetween } = await import('@/services/activity/activityService')
        const acts = await getActivityHistoryBetween(todayStr, todayStr)
        const strengthActive = hoy.sesiones.reduce((a, s) => a + (Number(s.netKcal) > 0 ? s.netKcal : 0), 0)
        const sportActive = acts.reduce((a, r) => {
          const v = r.activeKcal ?? r.netKcal ?? null
          return a + (typeof v === 'number' && v > 0 ? v : 0)
        }, 0)
        const total = Math.round((strengthActive + sportActive) * 10) / 10
        if(alive){ setActivasHoy((strengthActive + sportActive) > 0 ? total : null) }
      } catch { if(alive){ setActivasHoy(null) } }
    }
    load().catch(()=>{})
    const onChange = ()=>{ load().catch(()=>{}) }
    window.addEventListener('althea:session-changed', onChange)
    window.addEventListener('focus', onChange)
    return ()=>{ alive = false; window.removeEventListener('althea:session-changed', onChange); window.removeEventListener('focus', onChange) }
  },[todayStr])

  useEffect(()=>{
    const dow = weekdayOfKey(selectedDate)
    const n = cycle.weekMap[dow] ?? null
    if(n === null || n === undefined){ setPreviewList([]); setPreviewName('Descanso'); return }
    setPreviewName(cycle.trainingDays.find((d:any)=>d.n===n)?.name || `Día N°${n}`)
    import('@/utils/routine').then(({getDayExercises})=> getDayExercises(n, cycle).then(setPreviewList).catch(()=>setPreviewList([])))
  },[selectedDate, cycle])

  useEffect(()=>{
    import('@/services/ai/globalScore').then(({ buildGlobalScore })=> buildGlobalScore().then((g)=> setBriefScore(g.score)).catch(()=>{}))
    import('@/services/ai/coachInsights').then(({ buildInsights })=> buildInsights().then((all)=>{ const w = all.find((i)=> i.level==='warn'); setBriefWarn(w ? w.title : null) }).catch(()=>{}))
    Promise.all([
      import('@/services/ai/progressAnalyzer').then(m=> m.analyzeGlobal()),
      import('@/services/ai/recoveryAnalyzer').then(m=> m.analyzeRecovery()),
      import('@/services/ai/nutritionEngine').then(m=> db.userProfile.get('me').then(p=> m.analyzeNutrition(p||{}))),
    ]).then(([prog, rec, nut])=>{
      setBriefV2({
        progress: { trend: prog.trend, rate: prog.rate },
        recovery: { lastScore: rec.lastScore ?? undefined, trend: rec.trend },
        nutrition: { tdee: nut.tdee ?? undefined, proteinPerKg: nut.proteinPerKg ?? undefined, gap: nut.gap },
      })
    }).catch(()=>{})
  },[])

  useEffect(()=>{
    ensureSeeded().catch(()=>{})
    migrateSessionOverridesFromLocalStorage().catch(()=>{})
    db.userProfile.get('me').then(async p=>{
      const c = await getCanonicalCycle(p!)
      setCycle(c)
      const override = await getOverrideDay(todayStr)
      const n = override !== null && override !== undefined ? override : getTrainingDayForDate(todayStr, c).n
      setOverrideDay(override)
      loadDay(c, n)
      if(c.methodId){
        const m = getMethod(c.methodId as TrainingMethodId)
        if(m) {setActiveMethodName(m.nameEs)}
      }
    }).catch(()=>{})
    db.userProfile.get('me').then((p: any)=>{ if(p?.name) {setUserName(p.name)} }).catch(()=>{})
  },[todayStr])

  // Revisión de la rutina (E): fecha configurable `reviewDate`; si no existe,
  // fallback createdAt + rotationDays. Aviso NO bloqueante (nunca impide entrenar)
  // y reactivo: se re-evalúa al cambiar la rutina, al recuperar foco y por hora.
  useEffect(()=>{
    let alive = true
    const evaluate = async ()=>{
      try{
        const { getActiveRoutine } = await import('@/services/storage/routineStore')
        const r = await getActiveRoutine()
        if(!alive) {return}
        if(!r?.createdAt && !r?.reviewDate) {setRoutineReview(null); return}
        const limit = Number(r.rotationDays) > 0 ? Number(r.rotationDays) : 30
        const today = todayKey()
        const fallbackKey = r.createdAt ? addDaysToKey(toDateKey(r.createdAt), limit) : null
        const reviewKey = (r.reviewDate && isDateKey(r.reviewDate)) ? r.reviewDate : fallbackKey
        const snoozedUntil = r.reviewSnoozedUntil && isDateKey(r.reviewSnoozedUntil) ? r.reviewSnoozedUntil : null
        if (snoozedUntil && daysBetween(today, snoozedUntil) > 0) {
          setRoutineReview(null)
          setRoutineBlocked(false)
          return
        }
        // Ratificación vigente: si ratificó después del vencimiento, no avisa
        // de nuevo hasta el próximo ciclo (reviewDate ya se actualizó).
        if (r.reviewAcknowledgedAt && r.reviewAcknowledgedAt >= (reviewKey ?? '')) {
          setRoutineReview(null)
          setRoutineBlocked(false)
          return
        }
        if(!reviewKey) {setRoutineReview(null); setRoutineBlocked(false); return}
        const daysLeft = daysBetween(today, reviewKey)
        if(daysLeft > 0) {setRoutineReview(null); setRoutineBlocked(false); return}
        const days = r.createdAt ? daysBetween(toDateKey(r.createdAt), today) : limit
        setRoutineReview({ days, limit, reviewKey, daysLeft })
        setRoutineBlocked(true)
      }catch{ if(alive) {setRoutineReview(null)} }
    }
    evaluate()
    const onChange = ()=>{ evaluate() }
    window.addEventListener('routineChange', onChange)
    window.addEventListener('focus', onChange)
    window.addEventListener('althea:session-changed', onChange)
    const timer = setInterval(evaluate, 60 * 60 * 1000)
    return ()=>{
      alive = false
      clearInterval(timer)
      window.removeEventListener('routineChange', onChange)
      window.removeEventListener('focus', onChange)
      window.removeEventListener('althea:session-changed', onChange)
    }
  },[])

  // Hidratación: la botella es la única fuente de verdad (db.hydrationBottleLogs
  // + espejo legacy). Acá solo se fuerza la relectura tras un registro rápido.
  const addWater = async (ml: number) => {
    setAddingWater(true)
    try {
      const { addHydrationMl } = await import('@/services/recovery/hydrationBottles')
      await addHydrationMl(ml)
      setWaterVersion(v => v + 1)
    } catch { /* la botella muestra el error */ }
    finally { setAddingWater(false) }
  }

  const rawAgenda = getTrainingDayForDate(todayStr, cycle)
  const effectiveN = overrideDay ?? rawAgenda.n
  const effectiveInfo = effectiveN ? { n: effectiveN, name: cycle.trainingDays.find(d=>d.n===effectiveN)?.name || rawAgenda.name, isRest: false } : rawAgenda
  const agenda = effectiveInfo
  const isRest = !effectiveN ? true : (overrideDay ? false : rawAgenda.isRest)
  const isOverridden = overrideDay !== null && overrideDay !== rawAgenda.n

  // (D) Único punto de creación de sesión: INICIO. Con sesión activa solo
  // navega (la sesión es la fuente de verdad); sin sesión, crea la inicial.
  const startOrContinueTraining = async ()=>{
    if (routineBlocked && routineReview) {
      setSnoozeOpen(true)
      return
    }
    try{
      if(hasActiveSession){ nav('/entrenar'); return }
      // Día ya completado: nunca se crea una segunda sesión para la misma fecha
      // (el resultado queda en Progreso/Calendario; Entrenar no se ofrece).
      if(todayCompleted){ return }
      const { getAllRoutines, getActiveRoutineId } = await import('@/services/storage/routineStore')
      const rawList = await getAllRoutines()
      const activeId = await getActiveRoutineId()
      const active:any = rawList?.find((r:any)=>r.id===activeId) || rawList?.[0]
      const n = effectiveN
      const { getDayExercises } = await import('@/utils/routine')
      const list = await getDayExercises(n, cycle)
      const { createReadySession } = await import('@/services/training/sessionStore')
      const changed = await getChangedData(todayStr)
      const weekNumber = (()=>{ try{
        const start = (cycle as CycleConfig).startDate || todayStr
        return Math.max(1, Math.floor(daysBetween(start, todayStr)/(7))+1)
      }catch{ return 1 } })()
      await createReadySession({
        calendarDate: todayStr,
        routineId: active?.id || 'r1',
        routineName: active?.name || 'Rutina',
        plannedDay: rawAgenda.n ?? null,
        plannedDayName: rawAgenda.name ?? null,
        actualDay: n ?? null,
        actualDayName: agenda.name ?? null,
        exercises: list.map((x:any)=> ({ exId: x.exId || x.id, name: x.name, sets: x.sets, reps: x.reps, weight: x.weight, muscle: x.muscle, gifUrl: x.gifUrl, imageDataUrl: x.imageDataUrl, routineExerciseId: x.routineExerciseId, restSec: x.restSec, seriesType: x.seriesType, tempo: x.tempo, rir: x.rir, rpe: x.rpe, notes: x.notes, plannedSets: x.series?.length ? x.series.map((s:any, k:number)=>({ order: k+1, reps: s.reps, weight: s.weight ?? null })) : undefined })),
        plannedMuscleGroups: [...new Set(list.map((x:any)=> x.muscle).filter((m:any): m is string => typeof m === 'string' && m.length > 0))],
        dayChangeReason: changed?.changeReason || (isOverridden ? 'Cambio de día desde Inicio' : undefined),
        dayChangeComment: changed?.changeComment,
        weekNumber,
      })
      window.dispatchEvent(new Event('routineChange'))
      nav('/entrenar')
    }catch{ /* el usuario permanece en Inicio y puede reintentar */ }
  }
  const ratifyRoutine = async () => {
    try {
      const { getAllRoutines, getActiveRoutineId, saveAllRoutines } = await import('@/services/storage/routineStore')
      const list = await getAllRoutines()
      const aid = await getActiveRoutineId()
      const idx = list.findIndex((r: any) => r.id === aid)
      if (idx >= 0) {
        const r: any = list[idx]
        const newReview = addDaysToKey(todayKey(), Number(r.rotationDays) > 0 ? Number(r.rotationDays) : 30)
        list[idx] = { ...r, reviewDate: newReview, reviewAcknowledgedAt: todayKey(), reviewSnoozedUntil: null, updatedAt: new Date().toISOString() }
        await saveAllRoutines(list, aid)
        window.dispatchEvent(new Event('routineChange'))
      }
    } catch { /* noop */ }
    setRoutineReview(null)
    setRoutineBlocked(false)
    setSnoozeOpen(false)
  }

  const snoozeRoutine = async (days: number) => {
    try {
      const { getAllRoutines, getActiveRoutineId, saveAllRoutines } = await import('@/services/storage/routineStore')
      const list = await getAllRoutines()
      const aid = await getActiveRoutineId()
      const idx = list.findIndex((r: any) => r.id === aid)
      if (idx >= 0) {
        const r: any = list[idx]
        const until = addDaysToKey(todayKey(), days)
        list[idx] = { ...r, reviewSnoozedUntil: until, updatedAt: new Date().toISOString() }
        await saveAllRoutines(list, aid)
        window.dispatchEvent(new Event('routineChange'))
      }
    } catch { /* noop */ }
    setRoutineReview(null)
    setRoutineBlocked(false)
    setSnoozeOpen(false)
  }
  const completedCount = Object.values(dayStatus).filter(s => s.sessionStatus === 'COMPLETED').length
  const totalCount = Object.values(dayStatus).filter(s => s.planned).length
  const weekVolume = Object.values(dayStatus).reduce((a,s)=> a + (s.volume||0), 0)
  const maxDayVol = Math.max(1, ...Object.values(dayStatus).map(s=> s.volume||0))
  // Intensidad media PROYECTADA del día: promedio del RPE planificado en la
  // rutina (no existe RPE ejecutado en el registro de series).
  const plannedRpes = exNames.map(e=> e.rpe).filter((v): v is number => typeof v === 'number' && v > 0)
  const todayRPE = plannedRpes.length > 0 ? plannedRpes.reduce((a,b)=> a + b, 0) / plannedRpes.length : null

  if (isMobile) {
    const weekNumber = Math.max(1, Math.floor(daysBetween((cycle as CycleConfig).startDate || todayStr, todayStr) / 7) + 1)
    const plannedVolume = Math.round(exNames.reduce((a,e)=>a+e.sets*(e.reps||8)*(e.weight||0),0))
    const plannedDuration = Math.max(20, Math.round(exNames.reduce((a,e)=>a+e.sets*(e.restSec||90),0)/60 + exNames.length*3))
    return (
      <div className="space-y-2">
        {routineReview && (
          <section role="alert" data-testid="routine-review-warning" className="rounded-xl border border-error/45 bg-error/10 px-3 py-2.5 flex items-start gap-2.5">
            <SemanticIcon name="warning" size={18} className="text-error" ariaHidden />
            <div className="min-w-0 flex-1">
              <p className="font-label-caps text-[10px] uppercase tracking-widest text-error">Rutina a revisar</p>
              <p className="text-[12px] text-on-surface mt-0.5">Lleva <strong>{routineReview.days} días</strong> (límite {routineReview.limit}). Requiere revisión o modificación.</p>
            </div>
            <Link to="/rutina" aria-label="Revisar la rutina" className="shrink-0 min-h-[44px] px-2.5 py-2 rounded-lg border border-error/45 text-error text-[10px] uppercase font-bold flex items-center">Revisar</Link>
          </section>
        )}

        {/* 1. Sesión programada / descanso + CTA principal */}
        <section className="rounded-xl border border-outline-variant/40 bg-surface-container p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">{dayName} {dayNum} · {month}</p>
              <h1 className="font-headline-lg text-2xl font-semibold text-on-surface tracking-tight truncate">{userName ? `¡Hola, ${userName}!` : '¡Hola!'}</h1>
            </div>
            <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${isRest ? 'bg-secondary/15 text-secondary border border-secondary/35' : 'bg-primary/10 text-primary border border-primary/35'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isRest ? 'bg-secondary' : 'bg-primary'}`}></span>
              {isRest ? 'Descanso' : `Día N.º ${agenda.n}`}
            </span>
          </div>
          <div className="space-y-0.5">
            <h2 className="font-headline-md text-lg font-semibold text-on-surface">{isRest ? 'Recuperación y descanso activo' : `Sesión ${agenda.n} · ${agenda.name}`}</h2>
            <p className="text-[12px] text-on-surface-variant">{isRest ? 'Sauna, movilidad y reflexión.' : `${exNames.length} ejercicios · ${exNames.reduce((a,e)=>a+e.sets,0)} series · ${cycle.methodId && activeMethodName ? activeMethodName : 'Hipertrofia clásica'}`}</p>
            {isOverridden && <p className="font-label-caps text-[10px] text-secondary mt-0.5">Cambiado: original N.º {rawAgenda.n} {rawAgenda.name}</p>}
          </div>
          {todayCompleted ? (
            <span data-testid="inicio-day-done" className="flex items-center justify-center gap-1.5 w-full min-h-[48px] rounded-lg bg-primary-container/40 border border-primary/40 text-primary font-label-caps text-[12px] uppercase font-bold">
              <SemanticIcon name="check_circle" size={18} /> Sesión completada
            </span>
          ) : ((!isRest || hasActiveSession) && (
            <button onClick={()=>{ startOrContinueTraining() }} data-testid="inicio-hero-cta" aria-label={hasActiveSession ? 'Continuar entrenamiento' : 'Comenzar entrenamiento'} className="btn-primary w-full min-h-[48px] justify-center">
              <SemanticIcon name="electric_bolt" size={18} />
              <span className="tracking-wide uppercase font-semibold text-[13px]">{hasActiveSession ? 'Continuar entrenamiento' : 'Comenzar entrenamiento'}</span>
            </button>
          ))}
          <div className="flex gap-2">
            <button onClick={()=>setShowCalendarPopover(true)} aria-label="Ver la semana" className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg bg-surface-container-high border border-outline-variant/40 text-[12px] text-on-surface">
              <SemanticIcon name="date_range" size={16} className="text-outline" /> Semana {weekNumber}
            </button>
            <button onClick={()=>setShowChangeDay(true)} aria-label="Cambiar el entrenamiento de hoy" className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg bg-surface-container-high border border-outline-variant/40 text-[12px] text-on-surface">
              <SemanticIcon name="swap_horiz" size={16} className="text-outline" /> Cambiar día
            </button>
            <button
              type="button"
              onClick={() => setActivityOpen(true)}
              aria-haspopup="dialog"
              aria-label="Registrar actividad libre"
              data-testid="inicio-activity-btn"
              className="flex-1 flex items-center justify-center min-h-[44px] rounded-lg bg-teal-700 text-white hover:bg-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 text-[12px] font-semibold tracking-wide uppercase"
            >
              Actividad libre
            </button>
          </div>
        </section>

        {/* 2. Biometría & balance diario */}
        <section className="space-y-2">
          <h3 className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant px-1">Biometría &amp; balance diario</h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-2.5 space-y-1">
              <SemanticIcon name="favorite" size={16} className="text-primary" />
              <p className="font-metric-mobile text-xl text-on-surface leading-none">{briefV2?.recovery?.lastScore ?? '—'}</p>
              <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">Recuperación</p>
            </div>
            <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-2.5 space-y-1">
              <SemanticIcon name="restaurant" size={16} className="text-secondary" />
              <p className="font-metric-mobile text-xl text-on-surface leading-none">{briefV2?.nutrition?.tdee ? Math.round(briefV2.nutrition.tdee) : '—'}</p>
              <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">Nutrición kcal</p>
            </div>
            <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-2.5 space-y-1">
              <SemanticIcon name="local_fire_department" size={16} className="text-primary" />
              <p className="font-metric-mobile text-xl text-on-surface leading-none">{typeof gasto?.hoy.totalKcal === 'number' ? Math.round(gasto.hoy.totalKcal) : '—'}</p>
              <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">Gasto hoy kcal</p>
            </div>
          </div>

          <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <SemanticIcon name="water_drop" size={16} className="text-secondary" />
                <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold">Hidratación</span>
              </div>
              <Link to="/nutricion" className="text-[10px] text-on-surface-variant font-label-caps uppercase">Nutrición →</Link>
            </div>
            <WaterBottle size="md" allowQuickAdd refreshKey={waterVersion} />
            <BottleConfigEditor />
            <button onClick={()=> addWater(250)} disabled={addingWater} data-testid="inicio-add-water-250" className="w-full min-h-[44px] rounded-lg bg-primary-container/30 border border-primary/40 text-primary font-label-caps text-[10px] uppercase font-bold disabled:opacity-50">
              {addingWater ? 'Guardando…' : '+ 250 ml'}
            </button>
          </div>

          <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <SemanticIcon name="favorite" size={16} className="text-primary" />
                <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold">Recuperación Arete</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-secondary-container/50 border border-secondary/40 text-secondary font-label-caps text-[9px] font-bold">
                {briefV2?.recovery?.lastScore !== undefined ? (briefV2.recovery.lastScore >= 70 ? 'Nivel áureo' : briefV2.recovery.lastScore >= 40 ? 'En proceso' : 'Necesita descanso') : 'Sin datos'}
              </span>
            </div>
            <p className="text-[11px] text-on-surface-variant">Completá el check-in de recuperación para una lectura real.</p>
            <Link to="/recuperacion" className="inline-flex items-center min-h-[44px] text-[11px] text-primary font-label-caps uppercase">Abrir check-in →</Link>
          </div>
        </section>

        {/* 3. Estructura de carga: sesión de hoy */}
        <section className="rounded-xl border border-outline-variant/40 bg-surface-container p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">Estructura de carga</h3>
            {todayCompleted && <span className="text-[10px] text-primary font-label-caps uppercase font-bold">Completada</span>}
          </div>
          {isRest ? (
            <p className="text-[12px] text-on-surface-variant italic">«La recuperación es donde se forja la verdadera fuerza. Descansa con propósito.»</p>
          ) : (
            <>
              <ul className="divide-y divide-surface-bright">
                {exNames.map((ex, i)=>(
                  <li key={ex.id} className="py-2 flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded bg-surface-container-high border border-secondary/30 flex items-center justify-center font-headline-sm text-[10px] text-secondary shrink-0">{ROMAN[i] || i+1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-on-surface font-medium truncate">{ex.name}</p>
                      {ex.muscle && <p className="font-label-caps text-[9px] text-on-surface-variant">{ex.muscle}</p>}
                    </div>
                    <span className="font-metric-mobile text-[12px] text-on-surface-variant shrink-0">{ex.sets}×{ex.reps || '—'} · {(ex.weight ?? 0) > 0 ? `${ex.weight} kg` : 'sin peso'}</span>
                  </li>
                ))}
                {exNames.length === 0 && (
                  <li className="py-4 text-center text-on-surface-variant text-sm">Sin ejercicios programados. <Link to="/rutina" className="text-primary underline">Configurar rutina</Link></li>
                )}
              </ul>
              {todayCompleted ? (
                <span data-testid="inicio-start-done" className="flex items-center justify-center gap-1.5 w-full min-h-[44px] rounded-lg bg-primary-container/40 border border-primary/40 text-primary font-label-caps text-[11px] uppercase font-bold">
                  <SemanticIcon name="check_circle" size={16} /> Sesión completada
                </span>
              ) : (exNames.length > 0 && (!isRest || hasActiveSession) && (
                <button onClick={()=>{ startOrContinueTraining() }} data-testid="inicio-start-training" aria-label={hasActiveSession ? 'Continuar entrenamiento' : 'Comenzar entrenamiento'} className="flex items-center justify-center gap-1.5 w-full min-h-[48px] rounded-lg bg-primary-container hover:bg-tertiary-container text-on-primary-container border border-outline-variant/50 font-label-caps text-[12px] uppercase font-bold">
                  <SemanticIcon name="play_arrow" size={18} className="text-secondary" />
                  {hasActiveSession ? 'Continuar entrenamiento' : 'Comenzar entrenamiento'}
                </button>
              ))}
              {exNames.length > 0 && (
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-surface-bright text-center">
                  <div>
                    <p className="font-metric-mobile text-sm text-on-surface">{plannedVolume.toLocaleString('es-ES')} kg</p>
                    <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">Vol. proy.</p>
                  </div>
                  <div>
                    <p className="font-metric-mobile text-sm text-on-surface">{todayRPE !== null && todayRPE > 0 ? `${todayRPE.toFixed(1)}/10` : '—'}</p>
                    <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">Intensidad</p>
                  </div>
                  <div>
                    <p className="font-metric-mobile text-sm text-on-surface">{plannedDuration} min</p>
                    <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">Duración est.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* 4. Microciclo semanal */}
        <section className="rounded-xl border border-outline-variant/40 bg-surface-container p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-label-caps text-[11px] text-secondary font-semibold">Microciclo · {completedCount}/{totalCount}</span>
            <span className="font-label-caps text-[11px] text-primary font-medium">Vol: {weekVolume > 0 ? `${weekVolume.toLocaleString('es-ES')} kg` : '—'}</span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekKeys.map((iso)=>{
              const st = dayStatus[iso]
              const isToday = iso === todayStr
              const dow = parseLocalDateKey(iso)
              const dayLabel = dow.toLocaleDateString('es',{weekday:'narrow'}).toUpperCase()
              const dayNumCell = dow.getDate()
              const isCompleted = st?.sessionStatus === 'COMPLETED'
              const isRestDay = !st?.planned
              return (
                <div key={iso} className={`rounded p-1 flex flex-col items-center gap-1 min-w-0 ${isToday ? 'bg-surface-container-high border border-secondary/70' : 'bg-surface-container-high/40 border border-outline-variant/20'}`}>
                  <span className={`font-label-caps text-[9px] font-semibold ${isToday ? 'text-secondary' : 'text-on-surface-variant'}`}>{dayLabel}{dayNumCell}</span>
                  {isCompleted ? (
                    <SemanticIcon name="check_circle" size={14} className="text-primary" />
                  ) : isRestDay ? (
                    <SemanticIcon name="spa" size={14} className="text-secondary" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-center gap-3">
            <button onClick={()=>setWeekOffset(o=>o-1)} aria-label="Semana anterior" className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded bg-surface-container-high border border-outline-variant/40 text-on-surface-variant">‹</button>
            <span className="font-label-caps text-[10px] text-on-surface-variant">{weekOffset===0 ? 'Esta semana' : weekOffset>0 ? `+${weekOffset} sem` : `${-weekOffset} sem atrás`}</span>
            <button onClick={()=>setWeekOffset(o=>o+1)} aria-label="Semana siguiente" className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded bg-surface-container-high border border-outline-variant/40 text-on-surface-variant">›</button>
          </div>
        </section>

        {/* 5. Resumen: gasto calórico real */}
        <section data-testid="inicio-gasto-calorico" className="rounded-xl border border-outline-variant/40 bg-surface-container p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <SemanticIcon name="local_fire_department" size={16} className="text-primary" />
              <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold">Gasto calórico</span>
            </div>
            <Link to="/calendario" className="text-[10px] text-on-surface-variant font-label-caps">Historial →</Link>
          </div>
          {gasto === null ? (
            <p className="text-[12px] text-on-surface-variant">Cargando…</p>
          ) : (
            <div className="space-y-2">
              <GastoRow label="Hoy" res={gasto.hoy} testId="inicio-gasto-hoy" />
              <GastoRow label="Semana (lun → hoy)" res={gasto.semana} testId="inicio-gasto-semana" hideEmptyNote={sinSesiones(gasto.hoy)} />
              <div className="flex items-center justify-between py-1" data-testid="inicio-activas-hoy">
                <span className="text-[12px] text-on-surface-variant">Calorías activas registradas hoy</span>
                <span className="font-mono text-sm text-secondary font-semibold">
                  {activasHoy !== null ? `${Math.round(activasHoy)} kcal` : 'sin datos'}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* 6. Registros de virtud */}
        <section className="rounded-xl border border-outline-variant/40 bg-surface-container p-3 space-y-3">
          <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2">
            <div className="flex items-center gap-1.5">
              <SemanticIcon name="insights" size={16} className="text-secondary" />
              <h3 className="font-headline-md text-base font-semibold text-on-surface">Registros de virtud</h3>
            </div>
            <span className="font-label-caps text-[9px] text-on-surface-variant uppercase">Ciclo olímpico</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AltheaMetric value={briefV2?.progress?.rate !== undefined ? `${briefV2.progress.rate >= 0 ? '+' : ''}${briefV2.progress.rate.toFixed(1)}%` : 'Sin datos'} label="Sobrecarga progresiva" delta={briefV2?.progress?.rate} deltaSuffix="%" />
            <AltheaMetric value={completedCount > 0 ? completedCount : '—'} unit="días" label="Días completados" />
            <AltheaMetric value={`${totalCount > 0 ? Math.round(completedCount/totalCount*100) : 0}%`} label="Adherencia al plan" />
            <AltheaMetric value={briefV2?.recovery?.lastScore !== undefined ? (briefV2.recovery.lastScore >= 70 ? 'Áurea A+' : briefV2.recovery.lastScore >= 40 ? 'B+ Estable' : 'C Debe Descansar') : 'Sin datos'} label="Calidad de recuperación" />
          </div>
        </section>

        {/* 7. Coach */}
        {briefScore !== null && (
          <Link to="/coach" className="block rounded-xl border border-outline-variant/40 bg-surface-container p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <SemanticIcon name="chat" size={16} className="text-secondary" />
                <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold">Coach IA · Estado {briefScore}/100</span>
              </div>
              <SemanticIcon name="chevron_right" size={16} className="text-on-surface-variant" />
            </div>
            {briefWarn ? <p className="text-[11px] text-on-surface">{briefWarn}</p> : <p className="text-[11px] text-on-surface-variant">Todo estable por acá.</p>}
          </Link>
        )}

        {/* Modales → bottom sheets */}
        {showChangeDay && (
          <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 althea-modal" onClick={()=>setShowChangeDay(false)}>
            <div onClick={e=>e.stopPropagation()} className="bg-surface border-t border-outline-variant rounded-t-2xl w-full max-w-lg p-4 space-y-3 max-h-[85vh] overflow-auto">
              <div className="mx-auto w-10 h-1 rounded-full bg-outline-variant/60" aria-hidden="true"></div>
              <h3 className="font-headline-md text-lg font-semibold text-on-surface">Cambiar entrenamiento de hoy</h3>
              <div className="rounded bg-secondary/10 border border-secondary/30 p-3">
                <div className="font-label-caps text-[10px] text-secondary flex items-center gap-1"><BrandIcon name="alert" size={14}/> {rawAgenda.isRest ? 'Este día estaba configurado como descanso.' : `Hoy estaba programado ${rawAgenda.name}.`}</div>
                <p className="text-[11px] text-on-surface-variant mt-1">{rawAgenda.isRest ? 'Estás intentando entrenar en un día no planificado. Esto puede reducir recuperación.' : 'Este cambio altera la distribución semanal prevista.'}</p>
              </div>
              <p className="text-[11px] text-on-surface-variant">Seleccioná qué día querés realizar:</p>
              {cycle.trainingDays.map(d=>(
                <button key={d.n} onClick={async()=>{
                  const obs={ date: todayStr, plannedDay: rawAgenda.n, plannedName: rawAgenda.name, actualDay: d.n, actualName: d.name, changeReason, changeComment, changedByUser:true, at: new Date().toISOString()}
                  await setOverride(todayStr, d.n, obs, obs)
                  setOverrideDay(d.n)
                  loadDay(cycle, d.n)
                  window.dispatchEvent(new Event('routineChange'))
                  setShowChangeDay(false)
                }} className={`w-full p-3 rounded border text-left flex items-center justify-between min-h-[44px] ${effectiveN===d.n?'bg-primary text-on-surface border-primary':'bg-surface-container border-outline-variant text-on-surface'}`}>
                  <span className="text-sm">DÍA N.º {d.n} — {d.name}</span>
                  {effectiveN===d.n && <span className="text-[10px] font-label-caps">actual</span>}
                </button>
              ))}
              <div className="p-3 bg-surface-container border border-outline-variant rounded space-y-2">
                <div className="text-[11px] text-on-surface-variant">¿Por qué cambias?</div>
                <select value={changeReason} onChange={e=>setChangeReason(e.target.value)} className="w-full bg-surface-container-low border border-outline-variant rounded p-2 text-sm text-on-surface">
                  <option>Cambio de horarios</option><option>No pude entrenar el día original</option><option>Me siento recuperado</option><option>Necesidad personal</option><option>Disponibilidad de gimnasio</option><option>Reprogramación</option><option>Otro</option>
                </select>
                <textarea value={changeComment} onChange={e=>setChangeComment(e.target.value)} placeholder="Observación / explicación" rows={2} className="w-full bg-surface-container-low border border-outline-variant rounded p-2 text-sm text-on-surface"/>
              </div>
              <button onClick={async()=>{
                await removeOverride(todayStr)
                setOverrideDay(null)
                loadDay(cycle, rawAgenda.n)
                window.dispatchEvent(new Event('routineChange'))
                setShowChangeDay(false)
              }} className="w-full min-h-[44px] rounded bg-surface-container border border-outline-variant text-on-surface-variant text-[11px] font-label-caps uppercase">Volver al programado ({rawAgenda.n? `N.º ${rawAgenda.n} ${rawAgenda.name}` : 'Descanso'})</button>
              <button onClick={()=>setShowChangeDay(false)} className="w-full min-h-[44px] rounded bg-surface-container border border-outline-variant text-on-surface-variant text-[11px] font-label-caps uppercase">Cancelar</button>
            </div>
          </div>
        )}

        {showCalendarPopover && (
          <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 althea-modal" onClick={()=>setShowCalendarPopover(false)}>
            <div onClick={e=>e.stopPropagation()} className="bg-surface border-t border-outline-variant rounded-t-2xl w-full max-w-md p-4 space-y-3 max-h-[85vh] overflow-auto">
              <div className="mx-auto w-10 h-1 rounded-full bg-outline-variant/60" aria-hidden="true"></div>
              <h3 className="font-headline-md text-lg font-semibold text-on-surface">Vista semanal</h3>
              <div className="space-y-1.5">
                {cycle.trainingDays.map((d:any)=>{
                  const dayDate = new Date((cycle as any).startDate || todayStr)
                  dayDate.setDate(dayDate.getDate() + (d.n - 1) + (weekOffset * 7))
                  const dateStr = toLocalDateKey(dayDate)
                  const isToday = dateStr === todayStr
                  const isPast = new Date(dateStr) < new Date(todayStr)
                  return (
                    <div key={d.n} className={`flex items-center justify-between p-2.5 rounded border text-sm ${isToday ? 'bg-primary/20 border-primary/40' : isPast ? 'bg-surface-container border-outline-variant/20 opacity-60' : 'bg-surface-container border-outline-variant/40'}`}>
                      <div>
                        <div className="font-medium text-on-surface">Día {d.n} — {d.name}</div>
                        <div className="text-[11px] text-on-surface-variant">{dateStr}</div>
                      </div>
                      {isToday && <span className="text-[10px] font-label-caps text-primary">HOY</span>}
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-2">
                <button onClick={()=>setWeekOffset(w=>w-1)} className="flex-1 min-h-[44px] rounded bg-surface-container border border-outline-variant text-on-surface-variant text-sm">‹ Anterior</button>
                <button onClick={()=>setWeekOffset(0)} className="flex-1 min-h-[44px] rounded bg-primary text-on-primary text-sm font-medium">Esta semana</button>
                <button onClick={()=>setWeekOffset(w=>w+1)} className="flex-1 min-h-[44px] rounded bg-surface-container border border-outline-variant text-on-surface-variant text-sm">Siguiente ›</button>
              </div>
              <button onClick={()=>setShowCalendarPopover(false)} className="w-full min-h-[44px] rounded bg-surface-container border border-outline-variant text-on-surface-variant text-[11px] font-label-caps uppercase">Cerrar</button>
            </div>
          </div>
        )}

      <footer className="pt-2 pb-2 text-center">
        <p className="font-label-caps text-[10px] tracking-widest text-on-surface-variant uppercase">ALTHEA PLATFORM · PALAESTRA DE ARETE</p>
      </footer>

      {activityOpen && (
        <ActivityModal onClose={() => setActivityOpen(false)} />
      )}

      {routineBlocked && routineReview && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="routine-block-title">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-outline-variant p-5 space-y-4">
            <h2 id="routine-block-title" className="font-headline-md text-lg text-on-surface">Revisión de rutina requerida</h2>
            <p className="text-[12px] text-on-surface-variant">
              Tu rutina lleva <strong>{routineReview.days} días</strong> (límite {routineReview.limit}); venció el <strong>{routineReview.reviewKey}</strong>.
              Antes de entrenar debés ratificarla o posponer la revisión.
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={ratifyRoutine} className="min-h-[44px] rounded-lg bg-primary text-on-primary font-label-caps text-[12px] uppercase font-bold">Ratificar rutina</button>
              <button onClick={() => setSnoozeOpen(true)} className="min-h-[44px] rounded-lg bg-surface-container border border-outline-variant text-on-surface font-label-caps text-[12px] uppercase">Posponer revisión</button>
            </div>
          </div>
        </div>
      )}

      {snoozeOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="snooze-title">
          <div className="w-full max-w-sm rounded-2xl bg-surface border border-outline-variant p-5 space-y-4">
            <h2 id="snooze-title" className="font-headline-md text-lg text-on-surface">Posponer revisión</h2>
            <p className="text-[12px] text-on-surface-variant">¿Por cuánto tiempo?</p>
            <div className="grid grid-cols-2 gap-2">
              {[{d:7,l:'1 semana'},{d:14,l:'2 semanas'},{d:30,l:'1 mes'},{d:60,l:'2 meses'}].map(o=>(
                <button key={o.d} onClick={()=>setSnoozeDays(o.d)} className={`min-h-[44px] rounded-lg border text-[12px] font-label-caps uppercase ${snoozeDays===o.d?'bg-primary text-on-primary border-primary':'bg-surface-container border-outline-variant text-on-surface'}`}>{o.l}</button>
              ))}
            </div>
            <input type="number" min={1} max={365} value={snoozeDays} onChange={(e) => setSnoozeDays(Math.max(1, Math.min(365, Number(e.target.value) || 7)))} className="w-full min-h-[44px] rounded-lg bg-surface-container border border-outline-variant px-3 text-on-surface" aria-label="Días a posponer" />
            <div className="flex gap-2">
              <button onClick={()=>setSnoozeOpen(false)} className="flex-1 min-h-[44px] rounded-lg bg-surface-container border border-outline-variant text-on-surface-variant font-label-caps text-[11px] uppercase">Cancelar</button>
              <button onClick={()=>snoozeRoutine(snoozeDays)} className="flex-1 min-h-[44px] rounded-lg bg-primary text-on-primary font-label-caps text-[11px] uppercase font-bold">Posponer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

  return (
    <div className="min-h-screen bg-transparent space-y-3">
      {routineReview && (
        <section role="alert" data-testid="routine-review-warning" className="rounded-lg border border-error/45 bg-error/10 px-4 py-3 flex flex-wrap items-start gap-3">
          <SemanticIcon name="warning" size={20} className="text-error" ariaHidden />
          <div className="min-w-0 flex-1">
            <p className="font-label-caps text-[10px] uppercase tracking-widest text-error">Rutina a revisar</p>
            <p className="font-body-md text-sm text-on-surface mt-0.5">
              Tu rutina lleva <strong>{routineReview.days} días</strong> (límite {routineReview.limit})
              {routineReview.reviewKey ? <> · venció el <strong>{routineReview.reviewKey}</strong></> : null}: requiere revisión o modificación.
              {' '}Entrenar y el resto de la app siguen disponibles.
            </p>
          </div>
          <Link to="/rutina" aria-label="Revisar la rutina" className="shrink-0 min-h-[44px] px-3 py-2 rounded-lg border border-error/45 text-error font-label-caps text-[10px] uppercase font-bold tracking-wider hover:bg-error/10 transition-colors flex items-center gap-1.5">
            <SemanticIcon name="edit_square" size={15} ariaHidden />
            Revisar rutina
          </Link>
        </section>
      )}
      {/* Hero compacto: saludo + qué hacer hoy + acciones del día (E1, E2) */}
      <AltheaPanel className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-headline-lg text-xl sm:text-2xl font-semibold text-on-surface tracking-tight">
                {userName ? `¡Hola, ${userName}!` : '¡Hola!'}
              </h1>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${isRest ? 'bg-secondary/15 text-secondary border border-secondary/35' : 'bg-primary/10 text-primary border border-primary/35'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isRest ? 'bg-secondary' : 'bg-primary'}`}></span>
                {isRest ? 'Descanso' : `Día N.º ${agenda.n} · ${agenda.name}`}
              </span>
            </div>
            <p className="font-body-md text-[13px] text-on-surface-variant mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{isRest ? 'Recuperación y descanso activo' : `Entrenamiento: ${agenda.name}`}</span>
              <span className="opacity-50">·</span>
              <span>{dayName} {dayNum} de {month}</span>
              <span className="opacity-50">·</span>
              <span className="truncate">{cycle.methodId && activeMethodName ? activeMethodName : 'Microciclo de Arete & Hipertrofia Clásica'}</span>
            </p>
            {isOverridden && (
              <p className="font-label-caps text-[10px] text-secondary mt-0.5">Cambiado: original N.º {rawAgenda.n} {rawAgenda.name}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button onClick={()=> setShowCalendarPopover(!showCalendarPopover)}
              aria-label="Ver la semana"
              className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] rounded bg-surface-container border border-outline-variant/40 text-body-sm text-on-surface hover:border-primary/40 transition-colors cursor-pointer">
              <SemanticIcon name="date_range" size={16} className="text-outline" />
              <span className="font-medium text-body-sm">Semana {Math.max(1, Math.floor(daysBetween((cycle as CycleConfig).startDate || todayStr, todayStr) / 7) + 1)}</span>
            </button>
            <button onClick={()=> setShowChangeDay(true)}
              aria-label="Cambiar el entrenamiento de hoy"
              className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] min-w-[44px] rounded bg-surface-container border border-outline-variant/40 text-body-sm text-on-surface hover:border-primary/40 transition-colors cursor-pointer">
              <SemanticIcon name="swap_horiz" size={16} className="text-outline" />
              <span className="font-medium text-body-sm hidden sm:inline">Cambiar día</span>
</button>
            <button
              type="button"
              onClick={() => setActivityOpen(true)}
              aria-haspopup="dialog"
              aria-label="Registrar actividad libre"
              data-testid="inicio-activity-btn-desktop"
              className="flex items-center px-3 py-1.5 min-h-[44px] rounded bg-teal-700 text-white hover:bg-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 transition-colors cursor-pointer">
              <span className="font-semibold text-body-sm tracking-wide uppercase">Actividad libre</span>
            </button>
             {todayCompleted && (
               <span data-testid="inicio-day-done" className="flex items-center gap-1.5 px-3.5 py-1.5 min-h-[44px] rounded bg-primary-container/40 border border-primary/40 text-primary font-label-caps text-[11px] uppercase font-bold">
                 <SemanticIcon name="check_circle" size={17} />
                 Sesión completada
               </span>
             )}
             {(!isRest || hasActiveSession) && !todayCompleted && <button onClick={()=>{ startOrContinueTraining() }}
               data-testid="inicio-hero-cta"
               aria-label={hasActiveSession ? 'Continuar entrenamiento' : 'Comenzar entrenamiento'}
               className="btn-primary px-3.5 py-1.5 min-h-[44px]">
             <SemanticIcon name="electric_bolt" size={17} />
             <span className="tracking-wide uppercase font-semibold text-[12px]">{hasActiveSession ? 'Continuar' : 'Comenzar'}</span>
</button>
          }
          </div>
          </div>
       </AltheaPanel>

      {/* 2. MICROCICLO SEMANAL (7-DAY STRIP) — una sola fila compacta */}
      <section className="border border-outline-variant/30 rounded-lg px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 text-[11px] mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-label-caps text-[11px] text-secondary font-semibold shrink-0">Microciclo</span>
            <span className="text-body-sm text-on-surface-variant truncate">· {completedCount}/{totalCount} sesiones</span>
          </div>
          <span className="font-label-caps text-[11px] text-primary font-medium shrink-0 whitespace-nowrap">Volumen: {weekVolume > 0 ? `${weekVolume.toLocaleString('es-ES')} kg` : '—'}</span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {weekKeys.map((iso)=>{
            const st = dayStatus[iso]
            const isToday = iso === todayStr
            const dow = parseLocalDateKey(iso)
            const dayLabel = dow.toLocaleDateString('es',{weekday:'short'}).replace('.','').toUpperCase()
            const dayNum = dow.getDate()
            const isCompleted = st?.sessionStatus === 'COMPLETED'
            const isRestDay = !st?.planned
            const isActive = isToday || st?.sessionStatus === 'IN_PROGRESS' || st?.sessionStatus === 'PAUSED'
            const pct = st?.volume ? Math.min(100, Math.round(st.volume / maxDayVol * 100)) : 0

            return (
              <div key={iso} className={`p-1.5 rounded flex flex-col justify-between min-h-16 min-w-0 ${
                isToday ? 'bg-surface-container-high border-2 border-secondary/80 shadow-md relative' :
                isCompleted ? 'bg-surface-container border border-outline-variant/20' :
                'bg-surface-container border border-outline-variant/20 opacity-80'
              }`}>
                {isToday && <span className="absolute -top-2 right-1 px-1 py-0.5 rounded bg-secondary text-on-secondary font-label-caps text-[9px] font-bold tracking-wider">HOY</span>}
                <div className="flex items-center justify-between gap-1">
                  <span className={`font-label-caps text-[9px] font-semibold break-words min-w-0 ${isToday ? 'text-secondary font-bold' : 'text-on-surface-variant'}`}>{dayLabel} {dayNum}</span>
                  {isCompleted ? (
                    <SemanticIcon name="check_circle" size={14} className="text-primary" />
                  ) : isRestDay ? (
                    <SemanticIcon name="spa" size={15} className="text-secondary" />
                  ) : isActive ? (
                    <SemanticIcon name="play_circle" size={15} className="text-secondary animate-pulse" />
                  ) : (
                    <SemanticIcon name="schedule" size={15} className="text-outline" />
                  )}
                </div>
                <div className="min-w-0 w-full">
                  <p className={`font-label-md text-[12px] font-medium break-words leading-tight ${isToday ? 'text-on-surface font-semibold' : 'text-on-surface'}`}>
                    {st?.dayName || (isRestDay ? 'Descanso' : '—')}
                  </p>
                  {st?.volume ? (
                    <p className={`text-[10px] break-words leading-tight ${isToday ? 'text-primary' : 'text-on-surface-variant'}`}>{st.volume.toLocaleString('es-ES')} kg{st.rating ? ` · ★ ${st.rating}/5` : ''}</p>
                  ) : isRestDay ? (
                    <p className="text-[10px] text-secondary break-words leading-tight">Ayuno &amp; Reflexión</p>
                  ) : (
                    <p className="text-[10px] text-on-surface-variant break-words leading-tight">Sin datos</p>
                  )}
                </div>
                <div className="w-full bg-surface-bright h-1 rounded-full overflow-hidden">
                  <div className={`h-full ${isCompleted ? 'bg-primary-container w-full' : pct > 0 ? 'bg-primary-container' : 'bg-outline-variant'}`} style={{ width: isCompleted ? '100%' : pct > 0 ? `${pct}%` : '0%' }}></div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-label-caps text-[10px] text-on-surface-variant">
          <button onClick={()=>setWeekOffset(o=>o-1)} aria-label="Semana anterior" className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 py-1 rounded bg-surface-container border border-outline-variant hover:bg-surface-container-high transition-colors">‹</button>
          <span className="self-center">{weekOffset===0 ? 'Esta semana' : weekOffset>0 ? `+${weekOffset} sem` : `${-weekOffset} sem atrás`}</span>
          <button onClick={()=>setWeekOffset(o=>o+1)} aria-label="Semana siguiente" className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 py-1 rounded bg-surface-container border border-outline-variant hover:bg-surface-container-high transition-colors">›</button>
        </div>
      </section>

      {/* 3. WORKOUT CARD — ancho completo (reflow C2/I1: se elimina el bento 8/4
          que dejaba un hueco vacío de ~1378px junto a la columna de widgets). */}
      <div className="border border-outline-variant/40 rounded-lg p-4 space-y-3">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">¿Qué tengo que hacer hoy?</div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-surface-bright">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-primary-container/30 text-primary border border-primary/30 font-label-caps text-[10px]">Sesión principal</span>
                {!isRest && <span className="text-[12px] text-on-surface-variant">{activeMethodName || agenda.name}</span>}
              </div>
              <h2 className="font-headline-md text-headline-sm font-semibold text-on-surface">
                {isRest ? 'Día de Recuperación Sacra' : `Sesión N.º ${agenda.n}: ${agenda.name}`}
              </h2>
              <p className="text-body-sm text-on-surface-variant">
                {isRest ? 'Descanso activo — sauna, movilidad y reflexión' : `${exNames.length} ejercicios · ${exNames.reduce((a,e)=>a+e.sets,0)} series · ${activeMethodName || 'Enfoque hipertrofia clásica'}`}
              </p>
            </div>
            {todayCompleted && (
              <span data-testid="inicio-start-done" className="self-start sm:self-center flex items-center gap-1.5 px-3.5 py-1.5 min-h-[44px] rounded bg-primary-container/40 border border-primary/40 text-primary font-label-md text-label-md font-semibold">
                <SemanticIcon name="check_circle" size={16} />
                <span className="uppercase tracking-wider text-[12px] font-semibold">SESIÓN COMPLETADA</span>
              </span>
            )}
            {(!isRest || hasActiveSession) && !todayCompleted && (
            <button onClick={()=>{ startOrContinueTraining() }}
              data-testid="inicio-start-training"
              aria-label={hasActiveSession ? 'Continuar entrenamiento' : 'Comenzar entrenamiento'}
              className="self-start sm:self-center flex items-center gap-1.5 px-3.5 py-1.5 min-h-[44px] rounded bg-primary-container hover:bg-tertiary-container text-on-primary-container border border-outline-variant/50 transition-all font-label-md text-label-md active:scale-[0.98]">
                <SemanticIcon name="play_arrow" size={16} className="text-secondary" />
                <span className="uppercase tracking-wider text-[12px] font-semibold">{hasActiveSession ? 'CONTINUAR ENTRENAMIENTO' : 'COMENZAR ENTRENAMIENTO'}</span>
              </button>
            )}
          </div>

          {isRest ? (
            <p className="text-[11px] text-on-surface-variant border-t border-surface-bright pt-2.5">
              «La recuperación es donde se forja la verdadera fuerza. Descansa con propósito.»
            </p>
          ) : (
            <>
              {/* Exercise Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/30 text-on-surface-variant font-label-caps text-[10px] uppercase">
                      <th className="py-2 px-2.5">Ejercicio</th>
                      <th className="py-2 px-2.5 text-center">Series</th>
                      <th className="py-2 px-2.5 text-center">Reps</th>
                      <th className="py-2 px-2.5 text-right">Peso</th>
                      <th className="py-2 px-2.5 text-right">Descanso</th>
                      <th className="py-2 px-2.5 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-bright font-body-md text-body-sm">
                    {exNames.map((ex, i)=>{
                      const isEditing = editingIdx === i
                      return (
                        <tr key={ex.id} className={`hover:bg-surface-container/50 transition-colors group ${isEditing ? 'bg-surface-container/30' : ''}`}>
                          <td className="py-2.5 px-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className="w-5 h-5 rounded bg-surface-container border border-secondary/30 flex items-center justify-center font-headline-sm text-[11px] text-secondary">{ROMAN[i] || i+1}</span>
                              <div>
                                <p className="text-on-surface font-medium text-body-sm group-hover:text-primary transition-colors">{ex.name}</p>
                                {ex.muscle && <p className="font-label-caps text-[9px] text-on-surface-variant">{ex.muscle}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-2.5 text-center font-semibold text-on-surface">{ex.sets}</td>
                          <td className="py-2.5 px-2.5 text-center">
                            {isEditing ? (
                              <input type="number" value={editDraft.reps} onChange={e=>setEditDraft(d=>({...d, reps: Number(e.target.value)}))}
                                className="w-14 bg-surface-container-high border border-primary/40 rounded px-1.5 py-0.5 text-center text-on-surface text-sm focus:outline-none focus:border-primary"/>
                            ) : (
                              <span className="text-on-surface">{ex.reps || '—'}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <input type="number" step="0.5" value={editDraft.weight ?? ''} onChange={e=>setEditDraft(d=>({...d, weight: e.target.value === '' ? null : Number(e.target.value)}))}
                                  className="w-16 bg-surface-container-high border border-primary/40 rounded px-1.5 py-0.5 text-right text-secondary text-sm focus:outline-none focus:border-primary"/>
                                <span className="text-[10px] text-on-surface-variant">kg</span>
                              </div>
                            ) : (
                              <span className={`font-medium ${(ex.weight ?? 0) > 0 ? 'text-secondary' : 'text-on-surface-variant italic'}`}>{(ex.weight ?? 0) > 0 ? `${ex.weight} kg` : 'sin peso'}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <input type="number" step="5" value={editDraft.restSec} onChange={e=>setEditDraft(d=>({...d, restSec: Number(e.target.value)}))}
                                  className="w-14 bg-surface-container-high border border-primary/40 rounded px-1.5 py-0.5 text-right text-on-surface-variant text-sm focus:outline-none focus:border-primary"/>
                                <span className="text-[10px] text-on-surface-variant">s</span>
                              </div>
                            ) : (
                              <span className="text-on-surface-variant">{ex.restSec ? `${ex.restSec}s` : '90s'}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={()=>saveExerciseEdit(i)} className="px-2.5 py-0.5 min-h-[44px] min-w-[44px] rounded bg-primary text-on-primary text-[10px] font-label-caps uppercase font-bold hover:bg-primary/80 transition-colors">Guardar</button>
                                <button onClick={()=>setEditingIdx(null)} className="px-2.5 py-0.5 min-h-[44px] min-w-[44px] rounded bg-surface-container-high border border-outline-variant text-on-surface-variant text-[10px] font-label-caps uppercase hover:bg-surface-container transition-colors">Cancelar</button>
                              </div>
                            ) : (
                              <button onClick={()=>{ setEditingIdx(i); setEditDraft({reps: ex.reps || 0, weight: ex.weight ?? null, restSec: ex.restSec || 90}) }}
                                className="px-2 py-0.5 min-h-[44px] min-w-[44px] rounded bg-surface-container-high border border-outline-variant text-on-surface-variant text-[10px] font-label-caps uppercase hover:border-primary hover:text-primary transition-all active:scale-[0.97]">
                                <SemanticIcon name="edit" size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {exNames.length === 0 && (
                      <tr><td colSpan={6} className="py-6 text-center text-on-surface-variant text-sm">Sin ejercicios programados. <Link to="/rutina" className="text-primary underline">Configurar rutina</Link></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* KPI Summary */}
              {exNames.length > 0 && (
                <AltheaStatRow className="pt-3 border-t border-surface-bright" items={[
                  { icon: 'entrenar', value: `${Math.round(exNames.reduce((a,e)=>a+e.sets*(e.reps||8)*(e.weight||0),0)).toLocaleString('es-ES')} kg`, label: 'Volumen proyectado' },
                  { icon: 'progreso', value: todayRPE !== null && todayRPE !== undefined && todayRPE > 0 ? `${todayRPE.toFixed(1)}/10` : '—', label: 'Intensidad media (plan)' },
                  { icon: 'nutricion', value: `${Math.max(20, Math.round(exNames.reduce((a,e)=>a+e.sets*(e.restSec||90),0)/60 + exNames.length*3))} min`, label: 'Duración est.' },
                ]} />
              )}
            </>
          )}
        </div>

      {/* 4. WIDGETS — banda responsive (reflow C2/I1). items-start: cada widget
          conserva su altura natural, sin estirarse para rellenar. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 items-start gap-3">
          {/* WIDGET 0: GASTO CALÓRICO DEL EJERCICIO (sesiones reales) */}
          <div data-testid="inicio-gasto-calorico" className="border border-outline-variant/40 rounded-lg p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <SemanticIcon name="local_fire_department" size={18} className="text-primary" />
                <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold">Gasto calórico del ejercicio</span>
              </div>
              <Link to="/calendario" className="shrink-0 inline-flex items-center min-h-[44px] text-[10px] text-on-surface-variant font-label-caps hover:text-primary transition-colors">Historial →</Link>
            </div>
            <p className="text-[11px] text-on-surface-variant border-t border-surface-bright pt-2">
              Estimación MET sobre tus sesiones registradas (duración medida × peso corporal).
            </p>
            {gasto === null ? (
              <p className="text-[12px] text-on-surface-variant">Cargando…</p>
            ) : (
              <div className="space-y-2">
                <GastoRow label="Hoy" res={gasto.hoy} testId="inicio-gasto-hoy" />
                <GastoRow label="Semana (lun → hoy)" res={gasto.semana} testId="inicio-gasto-semana" hideEmptyNote={sinSesiones(gasto.hoy)} />
                <div className="flex items-center justify-between py-1" data-testid="inicio-activas-hoy">
                  <span className="text-[12px] text-on-surface-variant">Calorías activas registradas hoy</span>
                  <span className="font-mono text-sm text-secondary font-semibold">
                    {activasHoy !== null ? `${Math.round(activasHoy)} kcal` : 'sin datos'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* WIDGET 1: RECUPERACIÓN ARETE */}
           <div className="border border-outline-variant/40 rounded-lg p-3.5 sm:p-4 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SemanticIcon name="favorite" size={20} className="text-primary" />
                <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold">RECUPERACIÓN ARETE</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-secondary-container/50 border border-secondary/40 text-secondary font-label-caps text-[9px] font-bold">
                {briefV2?.recovery?.lastScore !== undefined ? (briefV2.recovery.lastScore >= 70 ? 'Nivel áureo' : briefV2.recovery.lastScore >= 40 ? 'En proceso' : 'Necesita descanso') : 'Sin datos'}
              </span>
            </div>
            <div className="flex items-center gap-3 py-1">
              <div className="relative w-16 h-16 rounded-full border-4 border-surface-bright flex items-center justify-center bg-surface-container flex-shrink-0">
                <div className="text-center">
                  <span className="font-headline-md text-headline-sm font-bold text-on-surface">{briefV2?.recovery?.lastScore ?? '—'}</span>
                  <span className="block text-[9px] font-label-caps text-secondary">/100</span>
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <div>
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span className="text-on-surface-variant">Variabilidad Cardíaca (HRV)</span>
                    <span className="text-primary font-semibold">Sin datos</span>
                  </div>
                  <div className="w-full bg-surface-bright h-1 rounded-full overflow-hidden">
                    <div className="bg-primary h-full w-[0%]"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span className="text-on-surface-variant">Sueño Profundo (REM)</span>
                    <span className="text-secondary font-semibold">Sin datos</span>
                  </div>
                  <div className="w-full bg-surface-bright h-1 rounded-full overflow-hidden">
                    <div className="bg-secondary h-full w-[0%]"></div>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-on-surface-variant border-t border-surface-bright pt-2.5 italic">
              Completá el check-in de recuperación para una lectura real.
            </p>
          </div>

          {/* WIDGET 2: HIDRATACIÓN — botella grande, medida en botellas/objetivo */}
          <div className="border border-outline-variant/40 rounded-lg p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SemanticIcon name="water_drop" size={18} className="text-secondary" />
                <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold">Hidratación</span>
              </div>
              <Link to="/nutricion" className="inline-flex items-center min-h-[44px] text-[10px] text-on-surface-variant font-label-caps hover:text-primary transition-colors">Nutrición →</Link>
            </div>
            <WaterBottle size="lg" allowQuickAdd refreshKey={waterVersion} />
            {/* (G) Configuración de las 3 botellas disponible en el propio widget */}
            <BottleConfigEditor />
            <button
              onClick={()=> addWater(250)}
              disabled={addingWater}
              data-testid="inicio-add-water-250"
              className="w-full py-1.5 min-h-[44px] rounded-lg bg-primary-container/30 border border-primary/40 text-primary font-label-caps text-[10px] uppercase font-bold hover:bg-primary-container/50 transition-colors active:scale-[0.98] disabled:opacity-50"
            >
              {addingWater ? 'Guardando…' : '+ 250 ml'}
            </button>
          </div>

          {/* WIDGET 3: ORÁCULO VIRTUOSO */}
           <div className="border border-secondary/30 rounded-lg p-3.5 sm:p-4 space-y-2.5 relative overflow-hidden bg-gradient-to-b from-surface-container-low to-surface-container">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-surface-container-high border border-secondary/50 flex-shrink-0 flex items-center justify-center">
                <SemanticIcon name="psychology" size={20} className="text-secondary" />
              </div>
              <div>
                <h3 className="font-headline-sm text-body-md font-semibold text-secondary tracking-wide">Asistente</h3>
                <p className="font-label-caps text-[9px] text-primary uppercase font-medium">CONSEJO DE ENTRENAMIENTO</p>
              </div>
            </div>
            <p className="font-headline-sm text-[12px] leading-relaxed text-on-surface/90 italic pt-0.5">
              «Ningún ciudadano tiene derecho a ser un aficionado en el entrenamiento físico. Qué desgracia envejecer sin ver la belleza y fuerza de la que el cuerpo es capaz.»
            </p>
            <p className="text-right font-label-caps text-[10px] text-secondary font-semibold">— Sócrates</p>
            <div className="pt-2 border-t border-outline-variant/20 flex justify-between items-center">
              <span className="text-[10px] text-on-surface-variant">Respuesta adaptada a tus métricas</span>
              <Link to="/coach" className="inline-flex items-center gap-1 min-h-[44px] text-primary hover:text-secondary transition-colors font-label-caps text-[10px] uppercase font-bold">
                <span>Abrir Asistente</span>
                <SemanticIcon name="arrow_forward" size={13} />
              </Link>
            </div>
          </div>

          {/* WIDGET 4: COACH STATUS */}
          {briefScore !== null && (
            <Link to="/coach" className="block  border border-outline-variant/40 rounded-lg p-3.5 sm:p-4 space-y-2 hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SemanticIcon name="chat" size={18} className="text-secondary" />
                  <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold">COACH IA · ESTADO {briefScore}/100</span>
                </div>
                <SemanticIcon name="chevron_right" size={16} className="text-on-surface-variant" />
              </div>
              {briefWarn ? (
                <p className="text-[11px] text-on-surface">{briefWarn}</p>
              ) : (
                <p className="text-[11px] text-on-surface-variant">Todo estable por acá.</p>
              )}
              {briefV2 && (
                <div className="flex flex-wrap gap-1.5">
                  {briefV2.progress && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-label-caps ${briefV2.progress.trend==='improving'?'bg-primary/20 text-primary':briefV2.progress.trend==='declining'?'bg-error/20 text-error':'bg-secondary/20 text-secondary'}`}>
                      {briefV2.progress.trend==='improving'?'↑ Progresando':briefV2.progress.trend==='declining'?'↓ Bajando':'→ Estable'}
                    </span>
                  )}
                  {briefV2.nutrition?.gap && (
                    <span className="px-2 py-0.5 rounded-full bg-secondary/20 text-secondary text-[10px] font-label-caps">
                      Ajuste: {briefV2.nutrition.gap.length > 30 ? briefV2.nutrition.gap.slice(0,30)+'…' : briefV2.nutrition.gap}
                    </span>
                  )}
                </div>
              )}
            </Link>
          )}
      </div>

      {/* 5. BOTTOM SECTION: REGISTROS DE VIRTUD & VOLUMEN SEMANAL */}
      <AltheaPanel className="mt-4">
        <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <SemanticIcon name="insights" size={18} className="text-secondary" />
            <h3 className="font-headline-md text-title-md font-semibold text-on-surface tracking-wide">Registros de Virtud & Volumen Semanal</h3>
          </div>
          <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">CICLO OLÍMPICO</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <AltheaMetric
            value={briefV2?.progress?.rate !== undefined ? `${briefV2.progress.rate >= 0 ? '+' : ''}${briefV2.progress.rate.toFixed(1)}%` : 'Sin datos'}
            label="Sobrecarga progresiva"
            delta={briefV2?.progress?.rate}
            deltaSuffix="%"
          />
          <AltheaMetric
            value={completedCount > 0 ? completedCount : '—'}
            unit="días"
            label="Días completados"
          />
          <AltheaMetric
            value={`${totalCount > 0 ? Math.round(completedCount/totalCount*100) : 0}%`}
            label="Adherencia al plan"
          />
          <AltheaMetric
            value={briefV2?.recovery?.lastScore !== undefined ? (briefV2.recovery.lastScore >= 70 ? 'Áurea A+' : briefV2.recovery.lastScore >= 40 ? 'B+ Estable' : 'C Debe Descansar') : 'Sin datos'}
            label="Calidad de recuperación"
          />
        </div>
      </AltheaPanel>

      {/* Day Change Modal */}
      {showChangeDay && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowChangeDay(false)}>
          <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-lg lg:max-w-2xl p-4 space-y-3 max-h-[85vh] overflow-auto">
            <h3 className="font-headline-md text-headline-sm font-semibold text-on-surface">Cambiar entrenamiento de hoy</h3>
            {rawAgenda.isRest ? (
              <div className="rounded bg-secondary/10 border border-secondary/30 p-3">
                <div className="font-label-caps text-[10px] text-secondary flex items-center gap-1"><BrandIcon name="alert" size={14}/> Este día estaba configurado como descanso.</div>
                <p className="text-[11px] text-on-surface-variant mt-1">Estás intentando entrenar en un día no planificado. Esto puede reducir recuperación.</p>
              </div>
            ) : (
              <div className="rounded bg-secondary/10 border border-secondary/30 p-3">
                <div className="font-label-caps text-[10px] text-secondary flex items-center gap-1"><BrandIcon name="alert" size={14}/> Hoy estaba programado {rawAgenda.name}.</div>
                <p className="text-[11px] text-on-surface-variant">Este cambio altera la distribución semanal prevista.</p>
              </div>
            )}
            <p className="text-[11px] text-on-surface-variant">Seleccioná qué día querés realizar:</p>
            {cycle.trainingDays.map(d=>(
              <button key={d.n} onClick={async()=>{
                const obs={ date: todayStr, plannedDay: rawAgenda.n, plannedName: rawAgenda.name, actualDay: d.n, actualName: d.name, changeReason, changeComment, changedByUser:true, at: new Date().toISOString()}
                await setOverride(todayStr, d.n, obs, obs)
                setOverrideDay(d.n)
                loadDay(cycle, d.n)
                window.dispatchEvent(new Event('routineChange'))
                setShowChangeDay(false)
              }} className={`w-full p-3 rounded border text-left flex items-center justify-between ${effectiveN===d.n?'bg-primary text-on-surface border-primary':'bg-surface-container border-outline-variant text-on-surface'}`}>
                <span className="text-sm">DÍA N.º {d.n} — {d.name}</span>
                {effectiveN===d.n && <span className="text-[10px] font-label-caps text-on-surface-variant">· actual</span>}
              </button>
            ))}
            <div className="p-3 bg-surface-container border border-outline-variant rounded space-y-2">
              <div className="text-[11px] text-on-surface-variant">¿Por qué cambias?</div>
              <select value={changeReason} onChange={e=>setChangeReason(e.target.value)} className="w-full bg-surface-container-low border border-outline-variant rounded p-2 text-sm text-on-surface">
                <option>Cambio de horarios</option><option>No pude entrenar el día original</option><option>Me siento recuperado</option><option>Necesidad personal</option><option>Disponibilidad de gimnasio</option><option>Reprogramación</option><option>Otro</option>
              </select>
              <textarea value={changeComment} onChange={e=>setChangeComment(e.target.value)} placeholder="Observación / explicación" rows={2} className="w-full bg-surface-container-low border border-outline-variant rounded p-2 text-sm text-on-surface"/>
            </div>
            <button onClick={async()=>{
              await removeOverride(todayStr)
              setOverrideDay(null)
              loadDay(cycle, rawAgenda.n)
              window.dispatchEvent(new Event('routineChange'))
              setShowChangeDay(false)
            }} className="w-full py-2 rounded bg-surface-container border border-outline-variant text-on-surface-variant text-[11px] font-label-caps uppercase">Volver al programado ({rawAgenda.n? `N.º ${rawAgenda.n} ${rawAgenda.name}` : 'Descanso'})</button>
            <button onClick={()=>setShowChangeDay(false)} className="w-full py-2 rounded bg-surface-container border border-outline-variant text-on-surface-variant text-[11px] font-label-caps uppercase">Cancelar</button>
          </div>
        </div>
      )}

      {/* Calendar Popover */}
      {showCalendarPopover && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowCalendarPopover(false)}>
          <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-md p-4 space-y-3 max-h-[85vh] overflow-auto">
            <h3 className="font-headline-md text-headline-sm font-semibold text-on-surface">Vista semanal</h3>
            <div className="space-y-1.5">
              {cycle.trainingDays.map((d:any)=>{
                const dayDate = new Date((cycle as any).startDate || todayStr)
                dayDate.setDate(dayDate.getDate() + (d.n - 1) + (weekOffset * 7))
                const dateStr = toLocalDateKey(dayDate)
                const isToday = dateStr === todayStr
                const isPast = new Date(dateStr) < new Date(todayStr)
                return (
                  <div key={d.n} className={`flex items-center justify-between p-2.5 rounded border text-sm ${isToday ? 'bg-primary/20 border-primary/40' : isPast ? 'bg-surface-container border-outline-variant/20 opacity-60' : 'bg-surface-container border-outline-variant/40'}`}>
                    <div>
                      <div className="font-medium text-on-surface">Día {d.n} — {d.name}</div>
                      <div className="text-[11px] text-on-surface-variant">{dateStr}</div>
                    </div>
                    {isToday && <span className="text-[10px] font-label-caps text-primary">HOY</span>}
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setWeekOffset(w=>w-1)} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant text-on-surface-variant text-sm">‹ Anterior</button>
              <button onClick={()=>setWeekOffset(0)} className="flex-1 py-2 rounded bg-primary text-on-primary text-sm font-medium">Esta semana</button>
              <button onClick={()=>setWeekOffset(w=>w+1)} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant text-on-surface-variant text-sm">Siguiente ›</button>
            </div>
            <button onClick={()=>setShowCalendarPopover(false)} className="w-full py-2 rounded bg-surface-container border border-outline-variant text-on-surface-variant text-[11px] font-label-caps uppercase">Cerrar</button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="pt-4 pb-6 text-center space-y-3 mt-4">
        <p className="font-label-caps text-[10px] tracking-widest text-on-surface-variant uppercase">
          ALTHEA PLATFORM A� PALAESTRA DE ARETE
        </p>
      </footer>

      {activityOpen && (
        <ActivityModal onClose={() => setActivityOpen(false)} />
      )}
    </div>
  )
}
