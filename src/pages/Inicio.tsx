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
import { AltheaPanel, AltheaMetric, AltheaStatRow } from '@/components/althea'
import ActivityModal from '@/components/activity/ActivityModal'
import { MacroSummary } from '@/components/nutrition/MacroSummary'
import { getOverrideDay, getChangedData, setOverride, removeOverride, migrateSessionOverridesFromLocalStorage } from '@/services/storage/sessionOverrideStore'
import { useActiveTrainingSession } from '@/hooks/useActiveTrainingSession'
import { useVisibleSections } from '@/hooks/useVisibleSections'
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
  const { hasActiveSession } = useActiveTrainingSession()
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
  const [briefV2, setBriefV2] = useState<{progress?:{trend?:string;rate?:number};recovery?:{lastScore?:number;trend?:string};nutrition?:{tdee?:number;proteinPerKg?:number;gap?:string|null}}|null>(null)
  const [activeMethodName, setActiveMethodName] = useState<string|null>(null)
  const [showChangeDay, setShowChangeDay] = useState(false)
  const [changeReason, setChangeReason] = useState('Cambio de horarios')
  const [changeComment, setChangeComment] = useState('')
  const [overrideDay, setOverrideDay] = useState<number|null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [dayStatus, setDayStatus] = useState<Record<string,{planned:boolean; dayN:number|null; dayName:string|null; sessionStatus:string|null; overridden:boolean; volume?:number; rating?:number|null}>>({})
  const [gasto, setGasto] = useState<{ hoy: ExpenditureResult; semana: ExpenditureResult } | null>(null)
  const todayCompleted = dayStatus[todayStr]?.sessionStatus === 'COMPLETED'
  const [selectedDate] = useState<string>(todayStr)
  const [, setPreviewList] = useState<{id:string;name:string;sets:number;reps:number;weight:number|null;restSec?:number;seriesType?:string;muscle?:string}[]>([])
  const [, setPreviewName] = useState('')
  const [editingIdx, setEditingIdx] = useState<number|null>(null)
  const [editDraft, setEditDraft] = useState<{reps:number|''; weight:number|null; restSec:number|''}>({reps:0, weight:0, restSec:90})
  const [, setSavedIdx] = useState<number|null>(null)
  const [showCalendarPopover, setShowCalendarPopover] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)

  // Igual que ChatWidget: los efectos de abajo hacen setState tras awaits
  // (Dexie/imports dinámicos). Si el componente se desmonta antes de que
  // respondan (unmount del test, navegación rápida), el setState tardío
  // revienta con "window is not defined" (unhandled rejection en CI).
  const mountedRef = useRef(true)
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

  const saveExerciseEdit = async (idx:number)=>{
    const updated = [...exNames]
    updated[idx] = { ...updated[idx], reps: editDraft.reps === '' ? 0 : editDraft.reps, weight: editDraft.weight, restSec: editDraft.restSec === '' ? 90 : editDraft.restSec }
    setExNames(updated)
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
            const repsN = editDraft.reps === '' ? 0 : editDraft.reps
            const restN = editDraft.restSec === '' ? 90 : editDraft.restSec
            exArr[exInDay] = { ...prevEx, reps: repsN, weight: editDraft.weight ?? null, restSec: restN,
              series: Array.isArray(prevEx.series) ? prevEx.series.map(s=> ({ ...s, reps: repsN, weight: editDraft.weight ?? null })) : prevEx.series }
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
      if (!mountedRef.current) { return }
      setDayStatus(map)
    }
    loadWeek().catch(()=>{})
  },[cycle, weekKeys, overrideDay])

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
    import('@/utils/routine').then(({getDayExercises})=> getDayExercises(n, cycle).then(list=>{ if(mountedRef.current){ setPreviewList(list) } }).catch(()=>{ if(mountedRef.current){ setPreviewList([]) } }))
  },[selectedDate, cycle])

  useEffect(()=>{
    Promise.all([
      import('@/services/ai/progressAnalyzer').then(m=> m.analyzeGlobal()),
      import('@/services/ai/recoveryAnalyzer').then(m=> m.analyzeRecovery()),
      import('@/services/ai/nutritionEngine').then(m=> db.userProfile.get('me').then(p=> m.analyzeNutrition(p||{}))),
    ]).then(([prog, rec, nut])=>{
      if (!mountedRef.current) { return }
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
      if (!mountedRef.current) { return }
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
    db.userProfile.get('me').then((p: any)=>{ if(p?.name && mountedRef.current) {setUserName(p.name)} }).catch(()=>{})
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

  const rawAgenda = getTrainingDayForDate(todayStr, cycle)
  const effectiveN = overrideDay ?? rawAgenda.n
  const effectiveInfo = effectiveN ? { n: effectiveN, name: cycle.trainingDays.find(d=>d.n===effectiveN)?.name || rawAgenda.name, isRest: false } : rawAgenda
  const agenda = effectiveInfo
  const isRest = !effectiveN ? true : (overrideDay ? false : rawAgenda.isRest)
  const isOverridden = overrideDay !== null && overrideDay !== rawAgenda.n

  const startOrContinueTraining = async ()=>{
    if (routineBlocked && routineReview) {
      setSnoozeOpen(true)
      return
    }
    try{
      if(hasActiveSession){ nav('/entrenar'); return }
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
  const plannedRpes = exNames.map(e=> e.rpe).filter((v): v is number => typeof v === 'number' && v > 0)
  const todayRPE = plannedRpes.length > 0 ? plannedRpes.reduce((a,b)=> a + b, 0) / plannedRpes.length : null

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

        {/* ─── HERO COMPACTO: saludo + estado del día + acciones ─── */}
        <AltheaPanel className="p-5 sm:p-6 space-y-4 shadow-al-sm border border-outline-variant/50">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${isRest ? 'bg-secondary/15 text-secondary border border-secondary/35' : 'bg-primary/10 text-primary border border-primary/35'}`}>
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
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button onClick={()=> setShowCalendarPopover(!showCalendarPopover)}
                aria-label="Ver la semana"
                className="flex items-center gap-2 px-3 py-1.5 min-h-[44px] rounded-xl bg-surface-container border border-outline-variant/40 text-body-sm text-on-surface hover:border-primary/40 transition-colors cursor-pointer">
                <SemanticIcon name="date_range" size={16} className="text-outline" />
                <span className="font-medium text-body-sm">Semana {Math.max(1, Math.floor(daysBetween((cycle as CycleConfig).startDate || todayStr, todayStr) / 7) + 1)}</span>
              </button>
              <button onClick={()=> setShowChangeDay(true)}
                data-testid="inicio-change-day-hero"
                aria-label="Cambiar el entrenamiento de hoy"
                className="flex items-center gap-2 px-3 py-1.5 min-h-[44px] min-w-[44px] rounded-xl bg-surface-container border border-outline-variant/40 text-body-sm text-on-surface hover:border-primary/40 transition-colors cursor-pointer">
                <SemanticIcon name="swap_horiz" size={16} className="text-outline" />
                <span className="font-medium text-body-sm">Cambiar</span>
              </button>
              {todayCompleted && (
                <span data-testid="inicio-day-done" className="flex items-center gap-2 px-4 py-1.5 min-h-[44px] rounded-xl bg-primary-container/40 border border-primary/40 text-primary font-label-caps text-[11px] uppercase font-bold">
                  <SemanticIcon name="check_circle" size={17} />
                  Sesión completada
                </span>
              )}
              {(!isRest || hasActiveSession) && !todayCompleted && <button onClick={()=>{ startOrContinueTraining() }}
                data-testid="inicio-hero-cta"
                aria-label={hasActiveSession ? 'Continuar entrenamiento' : 'Comenzar entrenamiento'}
                className="btn-primary px-4 py-1.5 min-h-[44px]">
              <SemanticIcon name="electric_bolt" size={17} />
              <span className="tracking-wide uppercase font-semibold text-[12px]">{hasActiveSession ? 'Continuar' : 'Comenzar'}</span>
</button>
          }
            </div>
          </div>
        </AltheaPanel>

        {/* Cuota del gimnasio — tira compacta: pago, vencimiento (+1 mes real) y aviso a 5 días */}
        <GymPaymentCard />

        {/* ─── FILA 1 — MÁXIMA PRIORIDAD: hidratación, macros, gasto calórico ─── */}
        <section className="dashboard-top-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
            <WaterBottle size="sm" allowQuickAdd={false} />
          </div>

          {isVisible('nutrition') && (
          <div className="domain-nutrition border border-outline-variant/40 rounded-2xl p-5 sm:p-6 space-y-4 min-w-0 shadow-al-sm bg-surface-container">
            <MacroSummary size={170} />
          </div>
          )}

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
                <GastoRow label="Hoy" res={gasto.hoy} testId="inicio-gasto-hoy" />
                <GastoRow label="Semana (lun → hoy)" res={gasto.semana} testId="inicio-gasto-semana" hideEmptyNote={sinSesiones(gasto.hoy)} />
                <div className="flex items-center justify-between py-2" data-testid="inicio-activas-hoy">
                  <span className="text-[12px] text-on-surface-variant">Calorías activas registradas hoy</span>
                  <span className="font-mono text-sm text-secondary font-semibold">
                    {activasHoy !== null ? `${Math.round(activasHoy)} kcal` : 'sin datos'}
                  </span>
                </div>
              </div>
            )}
          </div>
          )}
        </section>

        {/* ─── FILA 2 — SECUNDARIA: entrenamiento, actividad, registros ─── */}
        <section className="dashboard-secondary-grid grid grid-cols-1 gap-6 lg:grid-cols-3 items-start">

          {/* Entrenamiento / sesión del día — ancho completo en lg */}
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
                {(!isRest || hasActiveSession) && !todayCompleted && (
                  <>
                    <button onClick={()=>{ startOrContinueTraining() }}
                      data-testid="inicio-start-training"
                      aria-label={hasActiveSession ? 'Continuar entrenamiento' : 'Comenzar entrenamiento'}
                      className="flex items-center gap-2 px-4 py-2 min-h-[48px] rounded-xl bg-primary-container hover:bg-tertiary-container text-on-primary-container border border-outline-variant/50 transition-all font-label-md active:scale-[0.98]">
                      <SemanticIcon name="play_arrow" size={18} className="text-secondary" />
                      <span className="uppercase tracking-wider text-[12px] font-semibold">{hasActiveSession ? 'CONTINUAR ENTRENAMIENTO' : 'COMENZAR ENTRENAMIENTO'}</span>
                    </button>
                    <button onClick={()=> setShowChangeDay(true)}
                      data-testid="inicio-change-day"
                      className="flex items-center gap-2 px-4 py-2 min-h-[48px] rounded-xl bg-surface-container border border-outline-variant text-on-surface font-label-md hover:bg-surface-container-high transition-colors">
                      Cambiar día
                    </button>
                  </>
                )}
              </div>
            </div>

            {isRest ? (
              <p className="text-[11px] text-on-surface-variant border-t border-surface-bright pt-3 italic">
                «Descansa con propósito.»
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant/30 text-on-surface-variant font-label-caps text-[10px] uppercase">
                        <th className="py-3 px-3">Ejercicio</th>
                        <th className="py-3 px-3 text-center">Series</th>
                        <th className="py-3 px-3 text-center">Reps</th>
                        <th className="py-3 px-3 text-right">Peso</th>
                        <th className="py-3 px-3 text-right">Descanso</th>
                        <th className="py-3 px-3 w-20"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-bright font-body-md text-body-sm">
                      {exNames.map((ex, i)=>{
                        const isEditing = editingIdx === i
                        return (
                          <tr key={ex.id} className={`hover:bg-surface-container/50 transition-colors group ${isEditing ? 'bg-surface-container/30' : ''}`}>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2.5">
                                <span className="w-5 h-5 rounded bg-surface-container border border-secondary/30 flex items-center justify-center font-headline-sm text-[11px] text-secondary">{ROMAN[i] || i+1}</span>
                                <div>
                                  <p className="text-on-surface font-medium text-body-sm group-hover:text-primary transition-colors">{ex.name}</p>
                                  {ex.muscle && <p className="font-label-caps text-[9px] text-on-surface-variant">{ex.muscle}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center font-semibold text-on-surface">{ex.sets}</td>
                            <td className="py-3 px-3 text-center">
                              {isEditing ? (
                                <input type="number" value={editDraft.reps} onChange={e=>setEditDraft(d=>({...d, reps: e.target.value === '' ? '' : Number(e.target.value)}))}
                                  className="w-14 bg-surface-container-high border border-primary/40 rounded px-1.5 py-0.5 text-center text-on-surface text-sm focus:outline-none focus:border-primary"/>
                              ) : (
                                <span className="text-on-surface">{ex.reps || '—'}</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right">
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
                            <td className="py-3 px-3 text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1">
                                  <input type="number" step="5" value={editDraft.restSec} onChange={e=>setEditDraft(d=>({...d, restSec: e.target.value === '' ? '' : Number(e.target.value)}))}
                                    className="w-14 bg-surface-container-high border border-primary/40 rounded px-1.5 py-0.5 text-right text-on-surface-variant text-sm focus:outline-none focus:border-primary"/>
                                  <span className="text-[10px] text-on-surface-variant">s</span>
                                </div>
                              ) : (
                                <span className="text-on-surface-variant">{ex.restSec ? `${ex.restSec}s` : '90s'}</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right">
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
                        <tr><td colSpan={6} className="py-8 text-center text-on-surface-variant text-sm">Sin ejercicios programados. <Link to="/rutina" className="text-primary underline">Configurar rutina</Link></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {exNames.length > 0 && (
                  <AltheaStatRow className="pt-4 border-t border-surface-bright" items={[
                    { icon: 'entrenar', value: `${Math.round(exNames.reduce((a,e)=>a+e.sets*(e.reps||8)*(e.weight||0),0)).toLocaleString('es-ES')} kg`, label: 'Volumen proyectado' },
                    { icon: 'progreso', value: todayRPE !== null && todayRPE !== undefined && todayRPE > 0 ? `${todayRPE.toFixed(1)}/10` : '—', label: 'Intensidad media (plan)' },
                    { icon: 'nutricion', value: `${Math.max(20, Math.round(exNames.reduce((a,e)=>a+e.sets*(e.restSec||90),0)/60 + exNames.length*3))} min`, label: 'Duración est.' },
                  ]} />
                )}
              </>
            )}
          </div>

          {/* Actividad libre y Registros de virtud — dos tarjetas en lg */}
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
              <button
                type="button"
                onClick={() => setActivityOpen(true)}
                aria-haspopup="dialog"
                aria-label="Registrar actividad libre"
                data-testid="inicio-activity-btn"
                className="w-full min-h-[48px] rounded-xl bg-teal-700 text-white hover:bg-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 text-[12px] font-semibold tracking-wide uppercase flex items-center justify-center gap-2"
              >
                Actividad libre
              </button>
            </div>

            {/* Registros de virtud */}
            <AltheaPanel className="domain-recovery p-5 shadow-al-sm border border-outline-variant/50">
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <SemanticIcon name="insights" size={18} className="text-secondary" />
                  <h3 className="font-headline-md text-title-md font-semibold text-on-surface tracking-wide">Virtud y volumen</h3>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                  value={briefV2?.recovery?.lastScore !== undefined ? (briefV2.recovery.lastScore >= 70 ? 'Áurea A+' : briefV2.recovery.lastScore >= 40 ? 'B+ Estable' : 'C Debe Descansar') : '—'}
                  label="Recuperación"
                />
              </div>
            </AltheaPanel>
          </div>

        </section>

      </main>

      {/* Day Change Modal */}
      {showChangeDay && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowChangeDay(false)}>
          <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-xl w-full max-w-lg lg:max-w-2xl p-4 space-y-3 max-h-[85vh] overflow-auto">
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
          ALTHEA · PALAESTRA DE ARETE
        </p>
      </footer>

      {activityOpen && (
        <ActivityModal onClose={() => setActivityOpen(false)} />
      )}

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
