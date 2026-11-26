import { useEffect, useMemo, useRef, useState } from 'react'
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
import GymPaymentCard from '@/components/gym/GymPaymentCard'
import ScienceTip from '@/components/home/ScienceTip'
import { AltheaPanel } from '@/components/althea'
import { getOverrideDay, getChangedData, setOverride, removeOverride, migrateSessionOverridesFromLocalStorage, getDayNotDone, setDayNotDone } from '@/services/storage/sessionOverrideStore'
import { useActiveTrainingSession } from '@/hooks/useActiveTrainingSession'
import { useVisibleSections } from '@/hooks/useVisibleSections'
import { todayKey, daysBetween, parseLocalDateKey, toLocalDateKey, weekdayOfKey, addDaysToKey, toDateKey, isDateKey, weekStartKey } from '@/utils/dates'
import type { ExpenditureResult } from '@/services/training/exerciseEnergy'

const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X']

/** Día de la rutina ACTIVA con sus ejercicios reales (selector de Inicio). */
type PlanDay = { n: number; name: string; exercises: { name: string; sets: number; reps: number }[] }

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
  const { hasActiveSession, session: activeSession } = useActiveTrainingSession()
  const { isVisible } = useVisibleSections()
  const todayStr = todayKey()
  const { dayName, dayNum, month } = formatAgendaDate(todayStr)
  const [cycle, setCycle] = useState(getCycleFromProfile(null))
  const [exNames, setExNames] = useState<{id:string; name:string; sets:number; reps:number; weight:number|null; restSec?:number; rpe?:number; muscle?:string}[]>([])
  const [routineReview, setRoutineReview] = useState<{ days: number; limit: number; reviewKey?: string; daysLeft?: number } | null>(null)
  const [routineBlocked, setRoutineBlocked] = useState(false)
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const [snoozeDays, setSnoozeDays] = useState(7)
  const [userName, setUserName] = useState('')
  const [activeMethodName, setActiveMethodName] = useState<string|null>(null)
  const [showChangeDay, setShowChangeDay] = useState(false)
  const [changeReason, setChangeReason] = useState('Cambio de horarios')
  const [changeComment, setChangeComment] = useState('')
  const [overrideDay, setOverrideDay] = useState<number|null>(null)
  const [planDays, setPlanDays] = useState<PlanDay[]>([])
  const [agendaReady, setAgendaReady] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [dayStatus, setDayStatus] = useState<Record<string,{planned:boolean; dayN:number|null; dayName:string|null; sessionStatus:string|null; overridden:boolean; notDone:boolean; volume?:number; rating?:number|null}>>({})
  const [gasto, setGasto] = useState<{ hoy: ExpenditureResult; semana: ExpenditureResult } | null>(null)
  const todayCompleted = dayStatus[todayStr]?.sessionStatus === 'COMPLETED'
  const todayNotDone = dayStatus[todayStr]?.notDone === true
  const [selectedDate] = useState<string>(todayStr)
  const [, setPreviewList] = useState<{id:string;name:string;sets:number;reps:number;weight:number|null;restSec?:number;seriesType?:string;muscle?:string}[]>([])
  const [, setPreviewName] = useState('')
  const [showCalendarPopover, setShowCalendarPopover] = useState(false)

  // Igual que ChatWidget: los efectos de abajo hacen setState tras awaits
  // (Dexie/imports dinámicos). Si el componente se desmonta antes de que
  // respondan (unmount del test, navegación rápida), el setState tardío
  // revienta con "window is not defined" (unhandled rejection en CI).
  const mountedRef = useRef(true)
  const startingRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const loadDay = async (cycleToUse:any, dayN:number | null)=>{
    const { getDayExercises } = await import('@/utils/routine')
    const list = await getDayExercises(dayN, cycleToUse)
    if (!mountedRef.current) { return }
    setExNames(list.map(x=> ({id:x.exId, name:x.name, sets:x.sets, reps:x.reps, weight:x.weight, restSec:x.restSec, rpe:x.rpe, muscle:x.muscle})))
  }

  // Días de la rutina asignada (no del ciclo canónico si no coinciden): el
  // selector debe mostrar lo que realmente se va a entrenar y con qué ejercicios.
  const loadPlan = async (cycleToUse:CycleConfig)=>{
    const [{ getAllRoutines, getActiveRoutineId }, { getDayExercises }] = await Promise.all([
      import('@/services/storage/routineStore'),
      import('@/utils/routine'),
    ])
    const list = await getAllRoutines()
    const activeId = await getActiveRoutineId()
    const active = list.find(r=>r.id===activeId) || list[0]
    const routineDays = Object.entries(active?.dayExercises || {})
      .filter(([, arr]) => Array.isArray(arr) && arr.length > 0)
      .map(([k]) => Number(k))
      .sort((a,b)=>a-b)
    const source = routineDays.length ? routineDays : cycleToUse.trainingDays.map(d=>d.n)
    const out: PlanDay[] = []
    for(const n of source){
      // getDayExercises decide la fuente real: rutina asignada si tiene el día,
      // plan legacy solo cuando no hay rutina; días sin ejercicios quedan en [].
      const exercises = await getDayExercises(n, cycleToUse)
      out.push({
        n,
        name: cycleToUse.trainingDays.find(d=>d.n===n)?.name
          || active?.cycle?.trainingDays?.find(d=>d.n===n)?.name
          || `Día N°${n}`,
        exercises: exercises.map(e=>({ name:e.name, sets:e.sets, reps:e.reps })),
      })
    }
    if (!mountedRef.current) { return }
    setPlanDays(out)
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
      const notDoneFlags = await Promise.all(weekKeys.map(k => getDayNotDone(k)))
      const surveys = await db.postWorkoutSurveys.toArray().catch(()=>[]) as Array<{calendarDate?: string; sessionRating?: number}>
      const ratingByDate: Record<string, number> = {}
      for(const sv of surveys){ if(sv.calendarDate && typeof sv.sessionRating === 'number'){ ratingByDate[sv.calendarDate] = sv.sessionRating } }
      const map: typeof dayStatus = {}
      for(let i = 0; i < weekKeys.length; i++){
        const iso = weekKeys[i]
        const dow = weekdayOfKey(iso)
        // El override ("Cambiar día") manda sobre el weekMap: el título del día
        // debe reflejar el día elegido, no el plan original.
        const n = overrides[i] ?? cycle.weekMap[dow] ?? null
        const nm = n ? cycle.trainingDays.find((d:any)=>d.n===n)?.name || `Día N°${n}` : null
        const sess = byDate[iso]
        map[iso] = {
          planned: n !== null && n !== undefined,
          dayN: n, dayName: nm,
          sessionStatus: sess?.sessionStatus || null,
          overridden: overrides[i] !== null && overrides[i] !== undefined,
          notDone: notDoneFlags[i],
          volume: sess?.totalVolume || undefined,
          rating: ratingByDate[iso] ?? null,
        }
      }
      if (!mountedRef.current) { return }
      setDayStatus(map)
    }
    loadWeek().catch(()=>{})
  },[cycle, weekKeys, overrideDay])

  const [activasHoy, setActivasHoy] = useState<number | null>(null)
  useEffect(()=>{
    let alive = true
    const load = async ()=>{
      const { computeExpenditure, loadWeightRows, weightForDate, crossfitEnergy } = await import('@/services/training/exerciseEnergy')
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
        const cfRows = await db.cfResults.where('date').equals(todayStr).toArray().catch(()=>[])
        const weight = weightForDate(weightRows, todayStr)
        // Deduplicación por identificador: una misma marca no se suma dos veces.
        const seen = new Set(hoy.sesiones.map(s => s.sessionId))
        let active = 0
        for (const r of cfRows) {
          if (seen.has(r.id)) { continue }
          const e = crossfitEnergy(r, weight)
          if (e && e.netKcal > 0) { active += e.netKcal; seen.add(r.id) }
        }
        for (const r of acts) {
          if (!r?.id || seen.has(r.id)) { continue }
          const v = r.activeKcal ?? r.netKcal ?? null
          if (typeof v === 'number' && v > 0) { active += v; seen.add(r.id) }
        }
        if(alive){ setActivasHoy(active > 0 ? Math.round(active * 10) / 10 : null) }
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
    import('@/utils/routine').then(({getDayExercises})=> getDayExercises(n, cycle).then(list=>{ if(mountedRef.current){ setPreviewList(list) } }).catch(()=>{ if(mountedRef.current){ setPreviewList([]) } }))
  },[selectedDate, cycle])

  useEffect(()=>{
    ensureSeeded().catch(()=>{})
    migrateSessionOverridesFromLocalStorage().catch(()=>{})
    const sync = async ()=>{
      const p = await db.userProfile.get('me')
      const c = await getCanonicalCycle(p!)
      if (!mountedRef.current) { return }
      setCycle(c)
      const override = await getOverrideDay(todayStr)
      const n = override !== null && override !== undefined ? override : getTrainingDayForDate(todayStr, c).n
      setOverrideDay(override)
      await Promise.all([loadDay(c, n), loadPlan(c)])
      if(mountedRef.current) { setAgendaReady(true) }
      if(c.methodId){
        const m = getMethod(c.methodId as TrainingMethodId)
        if(m) {setActiveMethodName(m.nameEs)}
      }
    }
    sync().catch(()=>{})
    // Cambiar la rutina asignada (Rutina → setActive) refresca esta pantalla
    // aunque Inicio siga montado: días, nombres y ejercicios salen de la rutina
    // activa, no de una copia del ciclo canónico.
    window.addEventListener('routineChange', sync)
    db.userProfile.get('me').then((p: any)=>{ const n = p?.displayName || p?.name; if(n && mountedRef.current) {setUserName(n)} }).catch(()=>{})
    return ()=>{ window.removeEventListener('routineChange', sync) }
  },[todayStr])

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

  const dayLabel = (n:number) => cycle.trainingDays.find(d=>d.n===n)?.name
    || planDays.find(d=>d.n===n)?.name
    || `Día N°${n}`
  const rawAgenda = getTrainingDayForDate(todayStr, cycle)
  const effectiveN = overrideDay ?? rawAgenda.n
  const effectiveInfo = effectiveN ? { n: effectiveN, name: dayLabel(effectiveN), isRest: false } : rawAgenda
  const agenda = effectiveInfo
  const isRest = !effectiveN ? true : (overrideDay ? false : rawAgenda.isRest)
  const isOverridden = overrideDay !== null && overrideDay !== rawAgenda.n
  // Días que ofrece el selector: los de la rutina asignada con ejercicios
  // reales; si la rutina todavía no tiene, cae a los días del ciclo.
  const selectorDays: PlanDay[] = planDays.length
    ? planDays
    : cycle.trainingDays.map(d=>({ n:d.n, name:d.name, exercises:[] }))

  // Un READY de otro día (o de otra fecha) no tiene trabajo hecho: al presionar
  // Comenzar se reemplaza por el día seleccionado. Un IN_PROGRESS/PAUSED sí se
  // conserva y se continúa para no perder registros.
  const canContinueSession = (s: {sessionStatus:string; calendarDate:string; actualDay:number|null}, n:number|null) =>
    s.sessionStatus !== 'READY' || (s.calendarDate === todayStr && s.actualDay === n)
  const isContinuable = agendaReady && !!activeSession && canContinueSession(activeSession, effectiveN)

  const startOrContinueTraining = async ()=>{
    if (routineBlocked && routineReview) {
      setSnoozeOpen(true)
      return
    }
    try{
      if(startingRef.current){ return }
      startingRef.current = true
      // Se relee la sesión activa y el día elegido: el estado de React puede no
      // haber cargado todavía y no debe decidir qué día se entrena.
      const { getActiveSession, transitionSession, clearActiveSession, createReadySession } = await import('@/services/training/sessionStore')
      const existing = await getActiveSession()
      const override = await getOverrideDay(todayStr)
      const n = override ?? rawAgenda.n
      if(existing && canContinueSession(existing, n)){ nav('/entrenar'); return }
      if(todayCompleted || todayNotDone){ return }
      const { getAllRoutines, getActiveRoutineId } = await import('@/services/storage/routineStore')
      const rawList = await getAllRoutines()
      const activeId = await getActiveRoutineId()
      const active:any = rawList?.find((r:any)=>r.id===activeId) || rawList?.[0]
      const { getDayExercises } = await import('@/utils/routine')
      const list = await getDayExercises(n, cycle)
      // Un día sin ejercicios no abre una sesión vacía ni muestra Entrenar.
      if(!list.length){ return }
      // READY de otro día/fecha: no hay series hechas, se descarta y se crea
      // la del día elegido. (IN_PROGRESS/PAUSED ya salieron por el return de arriba.)
      if(existing){
        await transitionSession(existing.sessionId, 'CANCELLED', { reason: 'Cambio de día antes de comenzar' })
        await clearActiveSession()
      }
      const dayName = n !== null ? dayLabel(n) : rawAgenda.name
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
        actualDayName: dayName ?? null,
        exercises: list.map((x:any)=> ({ exId: x.exId || x.id, name: x.name, sets: x.sets, reps: x.reps, weight: x.weight, muscle: x.muscle, gifUrl: x.gifUrl, imageDataUrl: x.imageDataUrl, routineExerciseId: x.routineExerciseId, restSec: x.restSec, restBetweenExercisesSec: x.restBetweenExercisesSec, transitionRestSec: x.transitionRestSec, seriesType: x.seriesType, tempo: x.tempo, rir: x.rir, rpe: x.rpe, notes: x.notes, supersetId: x.supersetId ?? null, supersetOrder: x.supersetOrder ?? null, plannedSets: x.series?.length ? x.series.map((s:any, k:number)=>({ order: k+1, reps: s.reps, weight: s.weight ?? null })) : undefined })),
        plannedMuscleGroups: [...new Set(list.map((x:any)=> x.muscle).filter((m:any): m is string => typeof m === 'string' && m.length > 0))],
        dayChangeReason: changed?.changeReason || (override !== null && override !== rawAgenda.n ? 'Cambio de día desde Inicio' : undefined),
        dayChangeComment: changed?.changeComment,
        weekNumber,
      })
      window.dispatchEvent(new Event('routineChange'))
      nav('/entrenar')
    }catch{ /* el usuario permanece en Inicio y puede reintentar */ }
    finally{ startingRef.current = false }
  }
  // Día no entrenado: se marca en calendario sin crear sesión ficticia ni
  // calorías. Es reversible y el próximo entreno sigue siendo el siguiente día.
  const markNotDone = async (notDone: boolean) => {
    try {
      await setDayNotDone(todayStr, notDone)
      setDayStatus(prev => ({ ...prev, [todayStr]: { ...prev[todayStr], notDone } }))
      window.dispatchEvent(new Event('routineChange'))
    } catch { /* noop */ }
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
  // Próximo entreno pendiente de la semana (desde mañana en adelante).
  const nextWorkoutKey = weekKeys.find(k => k > todayStr && dayStatus[k]?.planned && !dayStatus[k]?.notDone && dayStatus[k]?.sessionStatus !== 'COMPLETED') ?? null
  const gymKcalHoy = gasto?.hoy.totalKcal ?? null
  const totalDiaKcal = (gymKcalHoy !== null || activasHoy !== null)
    ? Math.round(((gymKcalHoy ?? 0) + (activasHoy ?? 0)) * 10) / 10
    : null

  // ── Layout único (desktop + mobile). Los 3 elementos principales
  // (hidratación, macros, mapa muscular) van en la primera fila del grid,
  // visible sin scroll en condiciones normales. En móvil se apilan en una
  // sola columna al comienzo del dashboard.
  return (
    <div className="min-h-screen bg-transparent">
      {routineReview && (
        <section role="alert" data-testid="routine-review-warning" className="rounded-xl border border-error/45 bg-error/10 px-5 py-4 flex flex-wrap items-start gap-4 shadow-al-sm">
          <SemanticIcon name="warning" size={20} className="text-error shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-label-caps text-[10px] uppercase tracking-widest text-error">Rutina a revisar</p>
            <p className="font-body-md text-sm text-on-surface mt-0.5 leading-relaxed">
              Tu rutina lleva <strong>{routineReview.days} días</strong> (límite {routineReview.limit})
              {routineReview.reviewKey ? <> · venció el <strong>{routineReview.reviewKey}</strong></> : null}: requiere revisión o modificación.
              {' '}Entrenar y el resto de la app siguen disponibles.
            </p>
          </div>
          <Link to="/rutina" aria-label="Revisar la rutina" className="shrink-0 min-h-[44px] px-4 py-2.5 rounded-xl border border-error/45 text-error font-label-caps text-[10px] uppercase font-bold tracking-wider hover:bg-error/10 transition-colors flex items-center gap-2">
            <SemanticIcon name="edit_square" size={16} ariaHidden />
            Revisar rutina
          </Link>
        </section>
      )}

      <main className="dashboard-main w-full min-w-0 space-y-6">

        {/* ─── HERO COMPACTO: saludo + estado del día + acciones ───
             sticky: las acciones (Continuar/Cambiar día) se mantienen visibles al hacer scroll. */}
        <AltheaPanel className="p-5 sm:p-6 space-y-4 shadow-al-sm border border-outline-variant/50 sticky top-0 z-30">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider flex-wrap gap-1.5 max-w-full whitespace-normal break-words text-left ${isRest ? 'bg-secondary/15 text-secondary border border-secondary/35' : 'bg-primary/10 text-primary border border-primary/35'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isRest ? 'bg-secondary' : 'bg-primary'}`}></span>
                  {isRest ? 'Descanso' : `Día N.º ${agenda.n} · ${agenda.name}`}
                </span>
              </div>
              <h1 className="font-headline-lg text-xl sm:text-2xl font-semibold text-on-surface tracking-tight">
                {userName ? `¡Hola, ${userName}!` : '¡Hola!'}
              </h1>
              <p className="font-body-md text-[13px] text-on-surface-variant mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>{isRest ? 'Recuperación y descanso activo' : `Entrenamiento: ${agenda.name}`}</span>
                <span className="opacity-50">·</span>
                <span>{dayName} {dayNum} de {month}</span>
                {activeMethodName && (
                  <>
                    <span className="opacity-50">·</span>
                    <span className="truncate">{activeMethodName}</span>
                  </>
                )}
              </p>
              {isOverridden && (
                <p className="font-label-caps text-[10px] text-secondary mt-1">Cambiado: original N.º {rawAgenda.n} {rawAgenda.name}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 w-full lg:w-auto shrink-0">
              <button onClick={()=> setShowCalendarPopover(!showCalendarPopover)}
                aria-label="Ver la semana"
                className="flex-1 lg:flex-none flex items-center justify-center gap-1.5 px-2 py-1.5 min-h-[44px] min-w-0 rounded-xl bg-surface-container border border-outline-variant/40 text-body-sm text-on-surface hover:border-primary/40 transition-colors cursor-pointer">
                <SemanticIcon name="date_range" size={16} className="text-outline shrink-0" ariaHidden />
                <span className="font-medium text-[12px] sm:text-body-sm truncate">Semana {Math.max(1, Math.floor(daysBetween((cycle as CycleConfig).startDate || todayStr, todayStr) / 7) + 1)}</span>
              </button>
              <button onClick={()=> setShowChangeDay(true)}
                data-testid="inicio-change-day-hero"
                aria-label="Cambiar el entrenamiento de hoy"
                className="flex-1 lg:flex-none flex items-center justify-center gap-1.5 px-2 py-1.5 min-h-[44px] min-w-0 rounded-xl bg-surface-container border border-outline-variant/40 text-body-sm text-on-surface hover:border-primary/40 transition-colors cursor-pointer">
                <SemanticIcon name="swap_horiz" size={16} className="text-outline shrink-0" ariaHidden />
                <span className="font-medium text-[12px] sm:text-body-sm truncate">Cambiar</span>
              </button>
              {todayCompleted && (
                <span data-testid="inicio-day-done" className="flex-1 lg:flex-none flex items-center justify-center gap-1.5 px-2 py-1.5 min-h-[44px] min-w-0 rounded-xl bg-primary-container/40 border border-primary/40 text-primary font-label-caps text-[10px] sm:text-[11px] uppercase font-bold text-center">
                  <SemanticIcon name="check_circle" size={17} className="shrink-0" />
                  <span className="truncate">Sesión completada</span>
                </span>
              )}
              {todayNotDone && !todayCompleted && !hasActiveSession && (
                <span data-testid="inicio-day-not-done" className="flex-1 lg:flex-none flex items-center justify-center gap-1.5 px-2 py-1.5 min-h-[44px] min-w-0 rounded-xl bg-surface-container border border-outline-variant/60 text-on-surface-variant font-label-caps text-[10px] sm:text-[11px] uppercase font-bold text-center">
                  <SemanticIcon name="block" size={16} className="shrink-0" />
                  <span>No realizado</span>
                </span>
              )}
              {(!isRest || hasActiveSession) && !todayCompleted && (!todayNotDone || hasActiveSession) && (isContinuable || exNames.length > 0) && <button onClick={()=>{ startOrContinueTraining() }}
                data-testid="inicio-hero-cta"
                aria-label={isContinuable ? 'Continuar entrenamiento' : 'Comenzar entrenamiento'}
                className="btn-primary flex-1 lg:flex-none justify-center min-w-0 px-2 gap-1.5 min-h-[44px]">
              <SemanticIcon name="electric_bolt" size={17} className="shrink-0" />
              <span className="tracking-wide uppercase font-semibold text-[11px] sm:text-[12px] truncate">{isContinuable ? 'Continuar' : 'Comenzar'}</span>
</button>
          }
            </div>
          </div>
        </AltheaPanel>

        {/* ─── CALENDARIO SEMANAL COMPACTO: 7 días con el plan real (ciclo + cambios de día) ─── */}
        <div data-testid="inicio-week-calendar" className="border border-outline-variant/40 rounded-2xl p-3 shadow-al-sm bg-surface-container">
          <div className="grid grid-cols-7 gap-1.5">
            {weekKeys.map((k)=>{
              const st = dayStatus[k]
              const isToday = k === todayStr
              const isNext = k === nextWorkoutKey
              const done = st?.sessionStatus === 'COMPLETED'
              const notDone = st?.notDone === true
              return (
                <div key={k} className={`rounded-lg border px-1 py-1.5 text-center min-w-0 ${isToday ? 'bg-primary/15 border-primary/50' : notDone ? 'bg-surface-container border-outline-variant/30 opacity-70' : isNext ? 'bg-secondary-container/20 border-secondary/40' : st?.planned ? 'bg-surface-container-high/30 border-outline-variant/30' : 'bg-transparent border-outline-variant/20'}`}>
                  <div className={`font-label-caps text-[9px] uppercase ${isToday ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>{isToday ? 'Hoy' : ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][weekdayOfKey(k)]}</div>
                  <div className="font-body-md text-[12px] font-semibold text-on-surface">{Number(k.slice(8))}</div>
                  <div className={`text-[9px] leading-tight break-words ${st?.planned ? 'text-on-surface' : 'text-on-surface-variant italic'}`} title={st?.planned ? (st.dayName || `Día ${st.dayN}`) : 'Descanso'}>
                    {st?.planned ? (st.dayName || `Día ${st.dayN}`) : 'Descanso'}
                  </div>
                  {done && <SemanticIcon name="check_circle" size={11} className="text-primary mx-auto" />}
                  {notDone && !done && <div className="font-label-caps text-[8px] uppercase text-on-surface-variant">No realizado</div>}
                  {isNext && !done && !notDone && <div className="font-label-caps text-[8px] uppercase text-secondary">Próximo</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Cuota del gimnasio — tira compacta: pago, vencimiento (+1 mes real) y aviso a 5 días */}
        <GymPaymentCard />

        {/* ─── FILA 1 — MÁXIMA PRIORIDAD: hidratación + gasto calórico ───
             Nutrición queda en segundo plano (MacroSummary vive en /nutricion). */}
        <section className="dashboard-top-grid grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Hidratación — tarjeta grande y destacada */}
          <div className="domain-hydration border border-outline-variant/40 rounded-2xl p-5 sm:p-6 space-y-4 min-w-0 shadow-al-sm bg-surface-container">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-secondary-container/40 border border-secondary/40 flex items-center justify-center shrink-0">
                  <SemanticIcon name="water_drop" size={20} className="text-secondary" />
                </div>
                <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold truncate">Hidratación</span>
              </div>
              {isVisible('nutrition') && <Link to="/nutricion" className="shrink-0 inline-flex items-center min-h-[44px] text-[10px] text-on-surface-variant font-label-caps hover:text-primary transition-colors">Nutrición →</Link>}
            </div>
            {/* Solo visual: el registro y la configuración viven en Nutrición. */}
            <WaterBottle size="sm" allowQuickAdd />
          </div>

          {isVisible('training') && (
          <div data-testid="inicio-gasto-calorico" className="domain-training border border-outline-variant/40 rounded-2xl p-5 sm:p-6 space-y-4 min-w-0 shadow-al-sm bg-surface-container">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary-container/40 border border-primary/40 flex items-center justify-center shrink-0">
                  <SemanticIcon name="local_fire_department" size={20} className="text-primary" />
                </div>
                <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold truncate">Gasto calórico</span>
              </div>
              {isVisible('calendar') && <Link to="/calendario" className="shrink-0 inline-flex items-center min-h-[44px] text-[10px] text-on-surface-variant font-label-caps hover:text-primary transition-colors">Historial →</Link>}
            </div>
            <p className="text-[11px] text-on-surface-variant border-t border-surface-bright pt-3">
              Estimación MET: duración × peso corporal.
            </p>
            {gasto === null ? (
              <p className="text-[12px] text-on-surface-variant">Cargando…</p>
            ) : (
              <div className="space-y-3">
                <GastoRow label="Gimnasio (base)" res={gasto.hoy} testId="inicio-gasto-hoy" />
                <GastoRow label="Semana (lun → hoy)" res={gasto.semana} testId="inicio-gasto-semana" hideEmptyNote={sinSesiones(gasto.hoy)} />
                <div className="flex items-center justify-between py-2" data-testid="inicio-activas-hoy">
                  <span className="text-[12px] text-on-surface-variant">Activas: CrossFit + libre</span>
                  <span className="font-mono text-sm text-secondary font-semibold">
                    {activasHoy !== null ? `${Math.round(activasHoy)} kcal` : 'sin datos'}
                  </span>
                </div>
                {totalDiaKcal !== null && totalDiaKcal > 0 && (
                  <div className="flex items-center justify-between border-t border-outline-variant/30 pt-2" data-testid="inicio-gasto-total">
                    <span className="text-[12px] text-on-surface font-medium">Total del día (base + activas)</span>
                    <span className="font-mono text-sm text-on-surface font-semibold">{Math.round(totalDiaKcal)} kcal</span>
                  </div>
                )}
              </div>
            )}
          </div>
          )}
        </section>

        {/* Consejo científico breve: uno por día, con fuente. */}
        <ScienceTip isRestDay={isRest} />

        {/* ─── FILA 2 — SECUNDARIA: entrenamiento, actividad, registros ─── */}
        <section className="dashboard-secondary-grid grid grid-cols-1 gap-6 lg:grid-cols-3 items-start">

          {/* Entrenamiento / sesión del día — ancho completo en lg.
              Tras completar se oculta la configuración (tabla de ejercicios),
              pero el card conserva el badge "SESIÓN COMPLETADA". */}
          <div className="domain-training lg:col-span-2 border border-outline-variant/40 rounded-2xl p-5 sm:p-6 space-y-4 min-w-0 shadow-al-sm bg-surface-container">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded bg-primary-container/30 text-primary border border-primary/30 font-label-caps text-[10px]">Sesión principal</span>
                  {!isRest && <span className="text-[12px] text-on-surface-variant">{activeMethodName || agenda.name}</span>}
                </div>
                <h2 className="font-headline-md text-headline-sm font-semibold text-on-surface">
                  {isRest ? 'Día de Recuperación Sacra' : `Sesión N.º ${agenda.n}: ${agenda.name}`}
                </h2>
                <p className="text-body-sm text-on-surface-variant">
                  {isRest ? 'Descanso activo — sauna, movilidad y reflexión' : `${exNames.length} ejercicios · ${exNames.reduce((a,e)=>a+e.sets,0)} series · ${activeMethodName || 'Enfoque hipertrofia clásica'}`}
                </p>
                {isOverridden && <p className="font-label-caps text-[10px] text-secondary mt-1">Cambiado: original N.º {rawAgenda.n} {rawAgenda.name}</p>}
              </div>
              <div className="shrink-0 flex flex-col gap-2">
                {todayCompleted && (
                  <span data-testid="inicio-start-done" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-container/40 border border-primary/40 text-primary font-label-md font-semibold">
                    <SemanticIcon name="check_circle" size={16} />
                    <span className="uppercase tracking-wider text-[12px] font-semibold">SESIÓN COMPLETADA</span>
                  </span>
                )}
                {/* Acciones Continuar/Cambiar día: solo en el hero (sticky), no duplicar acá. */}
              </div>
            </div>

            {!todayCompleted && (isRest ? (
              <p className="text-[11px] text-on-surface-variant border-t border-surface-bright pt-3 italic">
                «Descansa con propósito.»
              </p>
            ) : (
              <>
                {/* Lista compacta: solo lo necesario para saber qué toca hoy.
                    El detalle completo (series, descansos, edición) vive en /rutina. */}
                <ul className="divide-y divide-surface-bright">
                  {exNames.map((ex, i)=>{
                    return (
                      <li key={ex.id} className="flex items-center gap-2.5 py-2.5">
                        <span className="w-5 h-5 rounded bg-surface-container border border-secondary/30 flex items-center justify-center font-headline-sm text-[11px] text-secondary shrink-0">{ROMAN[i] || i+1}</span>
                        <p className="flex-1 min-w-0 text-on-surface font-medium text-body-sm whitespace-normal break-words">{ex.name}</p>
                        <span className="shrink-0 font-mono text-[12px] text-on-surface-variant">
                          {ex.sets}×{ex.reps || '—'}{(ex.weight ?? 0) > 0 ? ` · ${ex.weight} kg` : ''}
                        </span>
                      </li>
                    )
                  })}
                  {exNames.length === 0 && (
                    <li className="py-8 text-center text-on-surface-variant text-sm">Sin ejercicios programados. <Link to="/rutina" className="text-primary underline">Configurar rutina</Link></li>
                  )}
                </ul>
                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <Link to="/rutina" className="min-h-[44px] inline-flex items-center gap-1.5 px-3 rounded-lg border border-outline-variant/60 bg-surface-container-high/60 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface hover:text-primary">
                    <SemanticIcon name="edit" size={14} /> Editar en Rutinas
                  </Link>
                  {!todayNotDone && !hasActiveSession && (
                    <button type="button" data-testid="inicio-mark-not-done" onClick={()=>markNotDone(true)} className="min-h-[44px] inline-flex items-center gap-1.5 px-3 rounded-lg border border-outline-variant/60 bg-surface-container font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant hover:text-on-surface">
                      <SemanticIcon name="block" size={14} /> No realizado
                    </button>
                  )}
                  {todayNotDone && (
                    <button type="button" onClick={()=>markNotDone(false)} className="min-h-[44px] inline-flex items-center gap-1.5 px-3 rounded-lg border border-outline-variant/60 bg-surface-container font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant hover:text-on-surface">
                      Deshacer No realizado
                    </button>
                  )}
                </div>
              </>
            ))}
          </div>

          {/* Actividad libre — acceso rápido al registro de movimiento no fuerza */}
          <div className="lg:col-span-1 space-y-6">
            {/* Actividad libre */}
            <div className="domain-training border border-outline-variant/40 rounded-2xl p-5 sm:p-6 space-y-4 min-w-0 shadow-al-sm bg-surface-container">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-teal-700/20 border border-teal-700/30 flex items-center justify-center shrink-0">
                    <SemanticIcon name="directions_run" size={20} className="text-teal-600" />
                  </div>
                  <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold">Actividad libre</span>
                </div>
                <span className="shrink-0 font-label-caps text-[10px] text-on-surface-variant uppercase">Registro rápido</span>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Caminatas, deportes o movimiento fuera de la fuerza.
              </p>
              <Link
                to="/actividad"
                aria-label="Registrar actividad libre"
                data-testid="inicio-activity-btn"
                className="w-full min-h-[48px] rounded-xl bg-teal-700 text-white hover:bg-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 text-[12px] font-semibold tracking-wide uppercase flex items-center justify-center gap-2"
              >
                Actividad libre
              </Link>
            </div>
          </div>

        </section>

      </main>

      {/* Day Change Modal */}
      {showChangeDay && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowChangeDay(false)}>
          <div onClick={e=>e.stopPropagation()} data-testid="inicio-change-day-modal" className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-lg lg:max-w-2xl p-4 space-y-3 max-h-[85vh] overflow-auto">
            <h3 className="font-headline-md text-headline-sm font-semibold text-on-surface">Cambiar entrenamiento de hoy</h3>
            {rawAgenda.isRest ? (
              <div className="rounded bg-secondary/10 border border-secondary/30 p-3">
                <div className="font-label-caps text-[10px] text-secondary flex items-center gap-1"><BrandIcon name="alert" size={14}/> Este día estaba configurado como descanso.</div>
                <p className="text-[11px] text-on-surface-variant mt-1">Día no planificado: puede afectar la recuperación.</p>
              </div>
            ) : (
              <div className="rounded bg-secondary/10 border border-secondary/30 p-3">
                <div className="font-label-caps text-[10px] text-secondary flex items-center gap-1"><BrandIcon name="alert" size={14}/> Hoy estaba programado {rawAgenda.name}.</div>
                <p className="text-[11px] text-on-surface-variant">Este cambio altera la distribución semanal prevista.</p>
              </div>
            )}
            <p className="text-[11px] text-on-surface-variant">Seleccioná qué día querés realizar:</p>
            {selectorDays.map(d=>(
              <button key={d.n} data-testid={`inicio-change-day-${d.n}`} disabled={d.exercises.length===0} onClick={async()=>{
                const obs={ date: todayStr, plannedDay: rawAgenda.n, plannedName: rawAgenda.name, actualDay: d.n, actualName: d.name, changeReason, changeComment, changedByUser:true, at: new Date().toISOString()}
                await setOverride(todayStr, d.n, obs, obs)
                setOverrideDay(d.n)
                loadDay(cycle, d.n)
                window.dispatchEvent(new Event('routineChange'))
                setShowChangeDay(false)
              }} className={`w-full p-3 rounded border text-left flex items-center justify-between gap-3 ${effectiveN===d.n?'bg-primary text-on-surface border-primary':d.exercises.length===0?'bg-surface-container border-outline-variant/40 text-on-surface-variant/70':'bg-surface-container border-outline-variant text-on-surface'}`}>
                <span className="min-w-0">
                  <span className="text-sm">DÍA N.º {d.n} — {d.name}</span>
                  {d.exercises.length>0
                    ? <span className="block text-[10px] text-on-surface-variant">{d.exercises.length} {d.exercises.length===1?'ejercicio':'ejercicios'}: {d.exercises.map(e=>e.name).join(' · ')}</span>
                    : <span className="block text-[10px] text-on-surface-variant">Sin ejercicios en la rutina asignada</span>}
                </span>
                {effectiveN===d.n && <span className="shrink-0 text-[10px] font-label-caps text-on-surface-variant">· actual</span>}
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
              {weekKeys.map((k)=> {
                const st = dayStatus[k]
                const n = st?.dayN ?? null
                const dayName = st?.dayName ?? null
                const isToday = k === todayStr
                const isPast = new Date(k) < new Date(todayStr)
                const planned = n !== null && n !== undefined
                const exercises = planDays.find(d=>d.n===n)?.exercises || []
                return (
                  <div key={k} className={`flex items-center justify-between p-2.5 rounded border text-sm ${isToday ? 'bg-primary/20 border-primary/40' : isPast ? 'bg-surface-container border-outline-variant/20 opacity-60' : planned ? 'bg-surface-container-high/30 border-outline-variant/30' : 'bg-transparent border-outline-variant/20'}`}>
                    <div>
                      <div className="font-medium text-on-surface">{planned ? `Día ${n} — ${dayName || ''}` : 'Descanso'}</div>
                      <div className="text-[11px] text-on-surface-variant">{isToday ? 'Hoy' : k.slice(8)}</div>
                    </div>
                    {planned && exercises.length>0 && (
                      <div className="text-[9px] text-on-surface-variant small">
                        {exercises.map((e,i)=> `${e.name}(${e.sets}×${e.reps})${i<exercises.length-1?' · ':''}`) || '—'}
                      </div>
                    )}
                    {isToday && planned && <span className="text-[10px] font-label-caps text-primary">HOY</span>}
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
          ALTHEA · ENTRENAMIENTO Y NUTRICIÓN
        </p>
      </footer>

      {routineBlocked && routineReview && !hasActiveSession && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="routine-block-title">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-outline-variant p-5 space-y-4">
            <h2 id="routine-block-title" className="font-headline-md text-lg text-on-surface">Revisión de rutina requerida</h2>
            <p className="text-[12px] text-on-surface-variant">
              Rutina de <strong>{routineReview.days} días</strong> (límite {routineReview.limit}), vencida el <strong>{routineReview.reviewKey}</strong>.
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
