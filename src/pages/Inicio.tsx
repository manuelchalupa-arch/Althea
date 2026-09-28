import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db, ensureSeeded } from '@/services/storage/db'
import { getCycleFromProfile, getTrainingDayForDate, formatAgendaDate } from '@/utils/cycle'
import { getCanonicalCycle } from '@/services/planning/cycleVersions'
import { aiService } from '@/services/ai/aiService'
import { buildTrainingContext } from '@/services/ai/contextBuilder'
import { detectCapabilities } from '@/services/ai/capabilities'
import { getMethod } from '@/services/ai/trainingMethodsDB'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'
import type { CycleConfig } from '@/utils/cycle'
import BrandIcon from '@/components/brand/BrandIcon'
import { WaterBottle } from '@/components/recovery/WaterBottle'
import { BottleConfigEditor } from '@/components/recovery/BottleConfigEditor'
import { getOverrideDay, getChangedData, setOverride, removeOverride, migrateSessionOverridesFromLocalStorage } from '@/services/storage/sessionOverrideStore'
import { useActiveTrainingSession } from '@/hooks/useActiveTrainingSession'
import { todayKey, daysBetween, parseLocalDateKey, toLocalDateKey, weekdayOfKey, addDaysToKey, toDateKey, isDateKey } from '@/utils/dates'

const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X']

function SessionStatusIcon({ status }: { status: string | null }) {
  if (!status) {return <span className="material-symbols-outlined text-outline" style={{ fontSize: 15 }}>schedule</span>}
  const map: Record<string, { icon: string; color: string }> = {
    COMPLETED: { icon: 'check_circle', color: 'text-primary' },
    PARTIAL: { icon: 'do_not_disturb_on', color: 'text-secondary' },
    CANCELLED: { icon: 'cancel', color: 'text-error' },
    ABANDONED: { icon: 'radio_button_unchecked', color: 'text-outline' },
    IN_PROGRESS: { icon: 'play_circle', color: 'text-secondary' },
    PAUSED: { icon: 'pause_circle', color: 'text-secondary' },
    COMPLETING: { icon: 'hourglass_top', color: 'text-primary' },
    READY: { icon: 'schedule', color: 'text-primary' },
  }
  const s = map[status] || { icon: 'schedule', color: 'text-outline' }
  return <span className={`material-symbols-outlined ${s.color} animate-pulse`} style={{ fontSize: 15 }}>{s.icon}</span>
}

export default function Inicio(){
  const nav = useNavigate()
  // Sesión activa canónica (no finalizada): fuente de verdad de "hay sesión".
  const { hasActiveSession } = useActiveTrainingSession()
  const todayStr = todayKey()
  const { dayName, dayNum, month } = formatAgendaDate(todayStr)
  const [cycle, setCycle] = useState(getCycleFromProfile(null))
  const [userName, setUserName] = useState('')
  const [exNames, setExNames] = useState<{id:string; name:string; sets:number; reps:number; weight:number|null; restSec?:number; rpe?:number; muscle?:string}[]>([])
  const [addingWater, setAddingWater] = useState(false)
  const [waterVersion, setWaterVersion] = useState(0)
  const [routineReview, setRoutineReview] = useState<{ days: number; limit: number; reviewKey?: string; daysLeft?: number } | null>(null)
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
  const todayCompleted = dayStatus[todayStr]?.sessionStatus === 'COMPLETED'
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [previewList, setPreviewList] = useState<{id:string;name:string;sets:number;reps:number;weight:number|null;restSec?:number;seriesType?:string;muscle?:string}[]>([])
  const [previewName, setPreviewName] = useState('')
  const [editingIdx, setEditingIdx] = useState<number|null>(null)
  const [editDraft, setEditDraft] = useState<{reps:number; weight:number|null; restSec:number}>({reps:0, weight:0, restSec:90})
  const [savedIdx, setSavedIdx] = useState<number|null>(null)
  const [showCalendarPopover, setShowCalendarPopover] = useState(false)

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
          planned: n != null,
          dayN: n, dayName: nm,
          sessionStatus: sess?.sessionStatus || null,
          overridden: overrides[i] != null,
          volume: sess?.totalVolume || undefined,
          rating: ratingByDate[iso] ?? null,
        }
      }
      setDayStatus(map)
    }
    loadWeek().catch(()=>{})
  },[cycle, weekKeys, overrideDay])

  useEffect(()=>{
    const dow = weekdayOfKey(selectedDate)
    const n = cycle.weekMap[dow] ?? null
    if(n == null){ setPreviewList([]); setPreviewName('Descanso'); return }
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
      const n = override != null ? override : getTrainingDayForDate(todayStr, c).n
      setOverrideDay(override)
      loadDay(c, n)
      if(c.methodId){
        const m = getMethod(c.methodId as TrainingMethodId)
        if(m) {setActiveMethodName(m.nameEs)}
      }
    }).catch(()=>{})
    db.userProfile.get('me').then((p: any)=>{ if(p?.name) {setUserName(p.name)} }).catch(()=>{})
  },[])

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
        if(!reviewKey) {setRoutineReview(null); return}
        const daysLeft = daysBetween(today, reviewKey)
        if(daysLeft > 0) {setRoutineReview(null); return}
        const days = r.createdAt ? daysBetween(toDateKey(r.createdAt), today) : limit
        setRoutineReview({ days, limit, reviewKey, daysLeft })
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
  const completedCount = Object.values(dayStatus).filter(s=> s.sessionStatus==='COMPLETED').length
  const totalCount = Object.values(dayStatus).filter(s=> s.planned).length
  const weekVolume = Object.values(dayStatus).reduce((a,s)=> a + (s.volume||0), 0)
  const maxDayVol = Math.max(1, ...Object.values(dayStatus).map(s=> s.volume||0))
  // Intensidad media PROYECTADA del día: promedio del RPE planificado en la
  // rutina (no existe RPE ejecutado en el registro de series).
  const plannedRpes = exNames.map(e=> e.rpe).filter((v): v is number => typeof v === 'number' && v > 0)
  const todayRPE = plannedRpes.length > 0 ? plannedRpes.reduce((a,b)=> a + b, 0) / plannedRpes.length : null

  return (
    <div className="min-h-screen bg-transparent space-y-3">
      {routineReview && (
        <section role="alert" data-testid="routine-review-warning" className="rounded-lg border border-error/45 bg-error/10 px-4 py-3 flex flex-wrap items-start gap-3">
          <span className="material-symbols-outlined text-error" style={{ fontSize: 20 }} aria-hidden="true">warning</span>
          <div className="min-w-0 flex-1">
            <p className="font-label-caps text-[10px] uppercase tracking-widest text-error">Rutina a revisar</p>
            <p className="font-body-md text-sm text-on-surface mt-0.5">
              Tu rutina lleva <strong>{routineReview.days} días</strong> (límite {routineReview.limit})
              {routineReview.reviewKey ? <> · venció el <strong>{routineReview.reviewKey}</strong></> : null}: requiere revisión o modificación.
              {' '}Entrenar y el resto de la app siguen disponibles.
            </p>
          </div>
          <Link to="/rutina" aria-label="Revisar la rutina" className="shrink-0 min-h-[44px] px-3 py-2 rounded-lg border border-error/45 text-error font-label-caps text-[10px] uppercase font-bold tracking-wider hover:bg-error/10 transition-colors flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden="true">edit_square</span>
            Revisar rutina
          </Link>
        </section>
      )}
      {/* Hero compacto: saludo + qué hacer hoy + acciones del día (E1, E2) */}
      <section className="marble-panel p-4">
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
              <span className="material-symbols-outlined text-outline" style={{ fontSize: 16 }}>date_range</span>
              <span className="font-medium text-body-sm">Semana {Math.max(1, Math.floor(daysBetween((cycle as CycleConfig).startDate || todayStr, todayStr) / 7) + 1)}</span>
            </button>
            <button onClick={()=> setShowChangeDay(true)}
              aria-label="Cambiar el entrenamiento de hoy"
              className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] min-w-[44px] rounded bg-surface-container border border-outline-variant/40 text-body-sm text-on-surface hover:border-primary/40 transition-colors cursor-pointer">
              <span className="material-symbols-outlined text-outline" style={{ fontSize: 16 }}>swap_horiz</span>
              <span className="font-medium text-body-sm hidden sm:inline">Cambiar día</span>
</button>
             {todayCompleted && (
               <span data-testid="inicio-day-done" className="flex items-center gap-1.5 px-3.5 py-1.5 min-h-[44px] rounded bg-primary-container/40 border border-primary/40 text-primary font-label-caps text-[11px] uppercase font-bold">
                 <span className="material-symbols-outlined" style={{ fontSize: 17 }}>check_circle</span>
                 Sesión completada
               </span>
             )}
             {(!isRest || hasActiveSession) && !todayCompleted && <button onClick={()=>{ startOrContinueTraining() }}
               data-testid="inicio-hero-cta"
               aria-label={hasActiveSession ? 'Continuar entrenamiento' : 'Comenzar entrenamiento'}
               className="btn-primary px-3.5 py-1.5 min-h-[44px]">
             <span className="material-symbols-outlined" style={{ fontSize: 17 }}>electric_bolt</span>
             <span className="tracking-wide uppercase font-semibold text-[12px]">{hasActiveSession ? 'Continuar' : 'Comenzar'}</span>
</button>
          }
          </div>
         </div>
      </section>

      {/* 2. MICROCICLO SEMANAL (7-DAY STRIP) — una sola fila compacta */}
      <section className="border border-outline-variant/30 rounded-lg px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 text-[11px] mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-label-caps text-[11px] uppercase text-secondary font-semibold shrink-0">Microciclo</span>
            <span className="text-body-sm text-on-surface-variant truncate">· {completedCount}/{totalCount} sesiones</span>
          </div>
          <span className="font-label-caps text-[11px] text-primary uppercase font-medium shrink-0">Volumen: {weekVolume > 0 ? `${weekVolume.toLocaleString()} kg` : '—'}</span>
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
                  <span className={`font-label-caps text-[9px] font-semibold truncate min-w-0 ${isToday ? 'text-secondary font-bold' : 'text-on-surface-variant'}`}>{dayLabel} {dayNum}</span>
                  {isCompleted ? (
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: 14 }}>check_circle</span>
                  ) : isRestDay ? (
                    <span className="material-symbols-outlined text-secondary" style={{ fontSize: 15 }}>spa</span>
                  ) : isActive ? (
                    <span className="material-symbols-outlined text-secondary animate-pulse" style={{ fontSize: 15 }}>play_circle</span>
                  ) : (
                    <span className="material-symbols-outlined text-outline" style={{ fontSize: 15 }}>schedule</span>
                  )}
                </div>
                <div className="min-w-0 w-full">
                  <p className={`font-label-md text-[12px] font-medium truncate ${isToday ? 'text-on-surface font-semibold' : 'text-on-surface'}`}>
                    {st?.dayName || (isRestDay ? 'Descanso' : '—')}
                  </p>
                  {st?.volume ? (
                    <p className={`text-[10px] truncate ${isToday ? 'text-primary' : 'text-on-surface-variant'}`}>{st.volume.toLocaleString()} kg{st.rating ? ` · ★ ${st.rating}/5` : ''}</p>
                  ) : isRestDay ? (
                    <p className="text-[10px] text-secondary truncate">Ayuno &amp; Reflexión</p>
                  ) : (
                    <p className="text-[10px] text-on-surface-variant truncate">Sin datos</p>
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
          <button onClick={()=>setWeekOffset(o=>o-1)} aria-label="Semana anterior" className="min-h-[44px] min-w-[44px] px-2 py-1 rounded bg-surface-container border border-outline-variant hover:bg-surface-container-high transition-colors">‹</button>
          <span className="self-center">{weekOffset===0 ? 'Esta semana' : weekOffset>0 ? `+${weekOffset} sem` : `${-weekOffset} sem atrás`}</span>
          <button onClick={()=>setWeekOffset(o=>o+1)} aria-label="Semana siguiente" className="min-h-[44px] min-w-[44px] px-2 py-1 rounded bg-surface-container border border-outline-variant hover:bg-surface-container-high transition-colors">›</button>
        </div>
      </section>

      {/* 3. BENTO CORE: WORKOUT (LEFT 8) + WIDGETS (RIGHT 4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* LEFT 8: WORKOUT CARD — ¿Qué tengo que hacer hoy? */}
        <div className="lg:col-span-8  border border-outline-variant/40 rounded-lg p-4 space-y-3">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">¿Qué tengo que hacer hoy?</div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-surface-bright">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-primary-container/30 text-primary border border-primary/30 font-label-caps text-[10px] uppercase">SESIÓN PRINCIPAL</span>
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
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
                <span className="uppercase tracking-wider text-[12px] font-semibold">SESIÓN COMPLETADA</span>
              </span>
            )}
            {(!isRest || hasActiveSession) && !todayCompleted && (
            <button onClick={()=>{ startOrContinueTraining() }}
              data-testid="inicio-start-training"
              aria-label={hasActiveSession ? 'Continuar entrenamiento' : 'Comenzar entrenamiento'}
              className="self-start sm:self-center flex items-center gap-1.5 px-3.5 py-1.5 min-h-[44px] rounded bg-primary-container hover:bg-tertiary-container text-on-primary-container border border-outline-variant/50 transition-all font-label-md text-label-md active:scale-[0.98]">
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: 16 }}>play_arrow</span>
                <span className="uppercase tracking-wider text-[12px] font-semibold">{hasActiveSession ? 'CONTINUAR ENTRENAMIENTO' : 'COMENZAR ENTRENAMIENTO'}</span>
              </button>
            )}
          </div>

          {isRest ? (
            <p className="text-[12px] text-on-surface-variant italic border-t border-surface-bright pt-3">
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
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3 border-t border-surface-bright">
                  <div className="p-2.5 rounded bg-surface-container border border-outline-variant/20">
                    <span className="font-label-caps text-[9px] text-on-surface-variant uppercase">VOLUMEN PROYECTADO</span>
                    <p className="font-headline-sm text-headline-sm text-on-surface font-semibold mt-0.5">{Math.round(exNames.reduce((a,e)=>a+e.sets*(e.reps||8)*(e.weight||0),0)).toLocaleString()} <span className="text-[12px] text-secondary font-normal">kg</span></p>
                  </div>
                  <div className="p-2.5 rounded bg-surface-container border border-outline-variant/20">
                    <span className="font-label-caps text-[9px] text-on-surface-variant uppercase">INTENSIDAD MEDIA (PLAN)</span>
                    <p className="font-headline-sm text-headline-sm text-primary font-semibold mt-0.5">{todayRPE != null && todayRPE > 0 ? todayRPE.toFixed(1) : '—'} <span className="text-[12px] text-on-surface-variant font-normal">/ 10 RPE</span></p>
                  </div>
                  <div className="p-2.5 rounded bg-surface-container border border-outline-variant/20">
                    <span className="font-label-caps text-[9px] text-on-surface-variant uppercase">DURACIÓN EST.</span>
                    <p className="font-headline-sm text-headline-sm text-on-surface font-semibold mt-0.5">{Math.max(20, Math.round(exNames.reduce((a,e)=>a+e.sets*(e.restSec||90),0)/60 + exNames.length*3))} <span className="text-[12px] text-secondary font-normal">min</span></p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT 4: WIDGETS */}
        <div className="lg:col-span-4 space-y-4">
          {/* WIDGET 1: RECUPERACIÓN ARETE */}
           <div className="border border-outline-variant/40 rounded-lg p-3.5 sm:p-4 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>favorite</span>
                <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold">RECUPERACIÓN ARETE</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-secondary-container/50 border border-secondary/40 text-secondary font-label-caps text-[9px] font-bold">
                {briefV2?.recovery?.lastScore !== undefined ? (briefV2.recovery.lastScore >= 70 ? 'NIVEL ÁUREO' : briefV2.recovery.lastScore >= 40 ? 'EN PROCESO' : 'NECESITA DESCANSO') : 'SIN DATOS'}
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
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: 18 }}>water_drop</span>
                <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold">Hidratación</span>
              </div>
              <Link to="/nutricion" className="inline-flex items-center min-h-[44px] text-[10px] text-on-surface-variant font-label-caps uppercase hover:text-primary transition-colors">Nutrición ?</Link>
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
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: 20 }}>psychology</span>
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
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>arrow_forward</span>
              </Link>
            </div>
          </div>

          {/* WIDGET 4: COACH STATUS */}
          {briefScore !== null && (
            <Link to="/coach" className="block  border border-outline-variant/40 rounded-lg p-3.5 sm:p-4 space-y-2 hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary" style={{ fontSize: 18 }}>chat</span>
                  <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold">COACH IA · ESTADO {briefScore}/100</span>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 16 }}>chevron_right</span>
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
                      {briefV2.progress.trend==='improving'?'? Progresando':briefV2.progress.trend==='declining'?'? Bajando':'? Estable'}
                    </span>
                  )}
                  {briefV2.nutrition?.gap && (
                    <span className="px-2 py-0.5 rounded-full bg-secondary/20 text-secondary text-[10px] font-label-caps">
                      ? {briefV2.nutrition.gap.length > 30 ? briefV2.nutrition.gap.slice(0,30)+'…' : briefV2.nutrition.gap}
                    </span>
                  )}
                </div>
              )}
            </Link>
          )}
        </div>
      </div>

      {/* 4. BOTTOM SECTION: REGISTROS DE VIRTUD & VOLUMEN SEMANAL */}
      <section className="border border-outline-variant/40 rounded-lg p-4 sm:p-5 space-y-3 mt-4">
        <div className="flex items-center justify-between border-b border-surface-bright pb-2.5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary" style={{ fontSize: 18 }}>insights</span>
            <h3 className="font-headline-md text-title-md font-semibold text-on-surface tracking-wide">Registros de Virtud & Volumen Semanal</h3>
          </div>
          <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">CICLO OLÍMPICO</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded bg-surface-container border border-outline-variant/20 space-y-1">
            <span className="font-label-caps text-[10px] uppercase text-on-surface-variant">SOBRECARGA PROGRESIVA</span>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-md text-headline-sm font-bold text-primary">{briefV2?.progress?.rate !== undefined ? `${briefV2.progress.rate >= 0 ? '+' : ''}${briefV2.progress.rate.toFixed(1)}%` : 'Sin datos'}</span>
              <span className="text-[11px] text-on-surface-variant">vs sem. ant.</span>
            </div>
            <div className="w-full bg-surface-bright h-1 rounded-full overflow-hidden mt-1.5">
                <div className="bg-primary h-full" style={{ width: briefV2?.progress?.rate !== undefined ? `${Math.min(100, Math.max(6, Math.abs(briefV2.progress.rate) * 10))}%` : '0%' }}></div>
              </div>
          </div>
          <div className="p-3 rounded bg-surface-container border border-outline-variant/20 space-y-1">
            <span className="font-label-caps text-[10px] uppercase text-on-surface-variant">DÍAS COMPLETADOS</span>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-md text-headline-sm font-bold text-on-surface">{completedCount > 0 ? completedCount : '—'}</span>
              <span className="text-[11px] text-secondary font-medium">Días</span>
            </div>
            <div className="w-full bg-surface-bright h-1 rounded-full overflow-hidden mt-1.5">
              <div className="bg-secondary h-full" style={{ width: `${Math.min(100, completedCount * 20)}%` }}></div>
            </div>
          </div>
          <div className="p-3 rounded bg-surface-container border border-outline-variant/20 space-y-1">
            <span className="font-label-caps text-[10px] uppercase text-on-surface-variant">ADHERENCIA AL PLAN</span>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-md text-headline-sm font-bold text-primary">{totalCount > 0 ? Math.round(completedCount/totalCount*100) : 0}%</span>
              <span className="text-[11px] text-on-surface-variant">{completedCount === totalCount ? 'Sin faltas' : `${totalCount - completedCount} pendientes`}</span>
            </div>
            <div className="w-full bg-surface-bright h-1 rounded-full overflow-hidden mt-1.5">
              <div className="bg-primary-container h-full" style={{ width: `${totalCount > 0 ? completedCount/totalCount*100 : 0}%` }}></div>
            </div>
          </div>
          <div className="p-3 rounded bg-surface-container border border-outline-variant/20 space-y-1">
            <span className="font-label-caps text-[10px] uppercase text-on-surface-variant">CALIDAD DE RECUPERACIÓN</span>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-md text-headline-sm font-bold text-secondary">{briefV2?.recovery?.lastScore !== undefined ? (briefV2.recovery.lastScore >= 70 ? 'Áurea A+' : briefV2.recovery.lastScore >= 40 ? 'B+ Estable' : 'C Debe Descansar') : 'Sin datos'}</span>
              <span className="text-[11px] text-on-surface-variant">Sueño / HRV</span>
            </div>
            <div className="w-full bg-surface-bright h-1 rounded-full overflow-hidden mt-1.5">
              <div className="bg-secondary h-full" style={{ width: `${briefV2?.recovery?.lastScore ?? 0}%` }}></div>
            </div>
          </div>
        </div>
      </section>

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
                {effectiveN===d.n && <span className="text-[10px] font-label-caps text-on-surface-variant">? actual</span>}
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
                const dateStr = dayDate.toISOString().slice(0,10)
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
              <button onClick={()=>setWeekOffset(w=>w-1)} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant text-on-surface-variant text-sm">? Anterior</button>
              <button onClick={()=>setWeekOffset(0)} className="flex-1 py-2 rounded bg-primary text-on-primary text-sm font-medium">Esta semana</button>
              <button onClick={()=>setWeekOffset(w=>w+1)} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant text-on-surface-variant text-sm">Siguiente ?</button>
            </div>
            <button onClick={()=>setShowCalendarPopover(false)} className="w-full py-2 rounded bg-surface-container border border-outline-variant text-on-surface-variant text-[11px] font-label-caps uppercase">Cerrar</button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="pt-4 pb-6 text-center space-y-3 mt-4">
        <p className="font-label-caps text-[10px] tracking-widest text-on-surface-variant uppercase">
          ALTHEA PLATFORM · PALAESTRA DE ARETE
        </p>
      </footer>
    </div>
  )
}


