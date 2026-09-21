import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db, ensureSeeded } from '@/services/storage/db'
import { getCycleFromProfile, getTrainingDayForDate, formatAgendaDate } from '@/utils/cycle'
import { aiService } from '@/services/ai/aiService'
import { buildTrainingContext } from '@/services/ai/contextBuilder'
import { detectCapabilities } from '@/services/ai/capabilities'
import { getMethod } from '@/services/ai/trainingMethodsDB'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'
import type { CycleConfig } from '@/utils/cycle'
import BrandIcon from '@/components/brand/BrandIcon'
import { getOverrideDay, getChangedData, setOverride, removeOverride, migrateSessionOverridesFromLocalStorage } from '@/services/storage/sessionOverrideStore'

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
  const todayStr = new Date().toISOString().slice(0,10)
  const { dayName, dayNum, month } = formatAgendaDate(todayStr)
  const [cycle, setCycle] = useState(getCycleFromProfile(null))
  const [exNames, setExNames] = useState<{id:string; name:string; sets:number; reps:number; weight:number; restSec?:number; muscle?:string}[]>([])
  const [hydration, setHydration] = useState<number | null>(null)
  const [hasActiveSession, setHasActiveSession] = useState(false)
  const [briefScore, setBriefScore] = useState<number|null>(null)
  const [briefWarn, setBriefWarn] = useState<string|null>(null)
  const [briefV2, setBriefV2] = useState<{progress?:{trend?:string;rate?:number};recovery?:{lastScore?:number;trend?:string};nutrition?:{tdee?:number;proteinPerKg?:number;gap?:string|null}}|null>(null)
  const [activeMethodName, setActiveMethodName] = useState<string|null>(null)
  const [showChangeDay, setShowChangeDay] = useState(false)
  const [changeReason, setChangeReason] = useState('Cambio de horarios')
  const [changeComment, setChangeComment] = useState('')
  const [overrideDay, setOverrideDay] = useState<number|null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [dayStatus, setDayStatus] = useState<Record<string,{planned:boolean; dayN:number|null; dayName:string|null; sessionStatus:string|null; overridden:boolean; volume?:number; rpe?:number}>>({})
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [previewList, setPreviewList] = useState<{id:string;name:string;sets:number;reps:number;weight:number;restSec?:number;seriesType?:string;muscle?:string}[]>([])
  const [previewName, setPreviewName] = useState('')
  const [editingIdx, setEditingIdx] = useState<number|null>(null)
  const [editDraft, setEditDraft] = useState<{reps:number; weight:number; restSec:number}>({reps:0, weight:0, restSec:90})
  const [savedIdx, setSavedIdx] = useState<number|null>(null)
  const [showCalendarPopover, setShowCalendarPopover] = useState(false)

  const loadDay = async (cycleToUse:any, dayN:number | null)=>{
    const { getDayExercises } = await import('@/utils/routine')
    const list = await getDayExercises(dayN, cycleToUse)
    setExNames(list.map(x=> ({id:x.exId, name:x.name, sets:x.sets, reps:x.reps, weight:x.weight, restSec:x.restSec, muscle:x.muscle})))
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
            exArr[exInDay] = { ...exArr[exInDay], reps: editDraft.reps, weight: editDraft.weight, restSec: editDraft.restSec }
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
  const isoOf = (d:Date)=> `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const weekKeys = useMemo(()=>{
    const base = new Date(todayStr+'T12:00:00')
    const dowMon0 = (base.getDay()+6)%7
    const mon = new Date(base); mon.setDate(base.getDate()-dowMon0+weekOffset*7)
    return Array.from({length:7},(_,i)=>{ const dt=new Date(mon); dt.setDate(mon.getDate()+i); return isoOf(dt) })
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
      const map: typeof dayStatus = {}
      for(let i = 0; i < weekKeys.length; i++){
        const iso = weekKeys[i]
        const dow = new Date(iso+'T12:00:00').getDay()
        const n = cycle.weekMap[dow] ?? null
        const nm = n ? cycle.trainingDays.find((d:any)=>d.n===n)?.name || `Día N°${n}` : null
        const sess = byDate[iso]
        map[iso] = {
          planned: n != null,
          dayN: n, dayName: nm,
          sessionStatus: sess?.sessionStatus || null,
          overridden: overrides[i] != null,
          volume: sess?.totalVolume || undefined,
          rpe: sess?.avgRPE || undefined,
        }
      }
      setDayStatus(map)
    }
    loadWeek()
  },[cycle, weekKeys, overrideDay])

  useEffect(()=>{
    const dow = new Date(selectedDate+'T12:00:00').getDay()
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
    ensureSeeded()
    migrateSessionOverridesFromLocalStorage()
    db.userProfile.get('me').then(async p=>{
      const c = getCycleFromProfile(p!)
      setCycle(c)
      const override = await getOverrideDay(todayStr)
      const n = override != null ? override : getTrainingDayForDate(todayStr, c).n
      setOverrideDay(override)
      loadDay(c, n)
      if(c.methodId){
        const m = getMethod(c.methodId as TrainingMethodId)
        if(m) {setActiveMethodName(m.nameEs)}
      }
    })
    // Leer hidratación desde Dexie (fuente de verdad)
    import('@/services/storage/db').then(({ db })=>{
      db.hydrationLogs.where('localDate').equals(todayStr).toArray().then((rows)=>{
        const total = rows.reduce((sum:number, r:any)=> sum + (r.amountMl || 0), 0)
        setHydration(total)
      }).catch(()=> setHydration(null))
    }).catch(()=>{})
    import('@/services/training/sessionStore').then(({ getActiveSession })=> getActiveSession().then((s)=> setHasActiveSession(!!s && s.calendarDate===todayStr)).catch(()=>{})).catch(()=>{})
  },[])

  const rawAgenda = getTrainingDayForDate(todayStr, cycle)
  const effectiveN = overrideDay ?? rawAgenda.n
  const effectiveInfo = effectiveN ? { n: effectiveN, name: cycle.trainingDays.find(d=>d.n===effectiveN)?.name || rawAgenda.name, isRest: false } : rawAgenda
  const agenda = effectiveInfo
  const isRest = !effectiveN ? true : (overrideDay ? false : rawAgenda.isRest)
  const isOverridden = overrideDay !== null && overrideDay !== rawAgenda.n
  const completedCount = Object.values(dayStatus).filter(s=> s.sessionStatus==='COMPLETED').length
  const totalCount = Object.values(dayStatus).filter(s=> s.planned).length
  const weekVolume = Object.values(dayStatus).reduce((a,s)=> a + (s.volume||0), 0)

  return (
    <div className="min-h-screen bg-transparent pb-24">
      {/* Greek Meander Bar Accent */}
      <div className="w-full h-2  rounded-sm" />

      {/* 1. HEADER BANNER: PALAESTRA OLÍMPICA */}
      <section className="border border-outline-variant/40 rounded-lg p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative overflow-hidden mt-4">
        <div className="relative z-10 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-headline-lg text-headline-md sm:text-headline-lg font-semibold text-on-surface tracking-tight">
              Palaestra Olímpica
            </h1>
            <span className="px-2 py-0.5 rounded bg-secondary-container/40 border border-secondary/50 text-secondary font-label-caps text-[10px] uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
              {isRest ? 'DÍA DE DESCANSO' : `DÍA N.º ${agenda.n} · EN CURSO`}
            </span>
          </div>
          <p className="font-body-md text-body-sm text-on-surface-variant flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary" style={{ fontSize: 16 }}>calendar_today</span>
            {dayName} {dayNum} de {month} · <span className="text-on-surface font-medium">{cycle.methodId && activeMethodName ? activeMethodName : 'Microciclo de Arete & Hipertrofia Clásica'}</span>
          </p>
          {isOverridden && (
            <p className="font-label-caps text-[10px] text-secondary">Cambiado: original N.º {rawAgenda.n} {rawAgenda.name}</p>
          )}
        </div>
        <div className="relative z-10 flex flex-wrap items-center gap-2.5">
          <button onClick={()=> setShowCalendarPopover(!showCalendarPopover)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container border border-outline-variant/40 text-body-sm text-on-surface hover:border-primary/40 transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: 16 }}>date_range</span>
            <span className="font-medium text-body-sm">Semana {Math.max(1, Math.floor((Date.now() - new Date((cycle as CycleConfig).startDate || todayStr).getTime()) / (7*86400000)) + 1)}</span>
          </button>
          <button onClick={async()=>{
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
              const start = new Date((cycle as any).startDate || todayStr)
              const now = new Date(todayStr)
              return Math.max(1, Math.floor((now.getTime()-start.getTime())/(7*86400000))+1)
            }catch{ return 1 } })()
            await createReadySession({
              calendarDate: todayStr,
              routineId: active?.id || 'r1',
              routineName: active?.name || 'Rutina',
              plannedDay: rawAgenda.n ?? null,
              plannedDayName: rawAgenda.name ?? null,
              actualDay: n ?? null,
              actualDayName: agenda.name ?? null,
              exercises: list.map((x:any)=> ({ exId: x.exId || x.id, name: x.name, sets: x.sets, reps: x.reps, weight: x.weight, muscle: x.muscle, gifUrl: x.gifUrl, imageDataUrl: x.imageDataUrl })),
              dayChangeReason: changed?.changeReason || (isOverridden ? 'Cambio de día desde Inicio' : undefined),
              dayChangeComment: changed?.changeComment,
              weekNumber,
            })
            window.dispatchEvent(new Event('routineChange'))
            nav('/entrenar')
          }} className="flex items-center gap-2 px-4 py-2 rounded bg-primary-container hover:bg-tertiary-container text-on-primary-container border border-outline-variant/60 shadow-md hover:border-secondary transition-all font-label-md text-label-md active:scale-[0.98]">
            <span className="material-symbols-outlined text-secondary" style={{ fontSize: 18 }}>electric_bolt</span>
            <span className="tracking-wide uppercase font-semibold">{hasActiveSession ? 'CONTINUAR' : 'ENTRENAR'}</span>
          </button>
        </div>
      </section>

      {/* 2. MICROCICLO SEMANAL (7-DAY STRIP) */}
      <section className="border border-outline-variant/30 rounded-lg p-3 sm:p-3.5 space-y-2.5 mt-4">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2">
            <span className="font-label-caps text-[11px] uppercase text-secondary font-semibold">DISTRIBUCIÓN DEL MICROCICLO</span>
            <span className="text-body-sm text-on-surface-variant">· {completedCount} de {totalCount} sesiones completadas</span>
          </div>
          <span className="font-label-caps text-[11px] text-primary uppercase font-medium">Volumen Semanal: {weekVolume > 0 ? `${weekVolume.toLocaleString()} kg` : '—'}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {weekKeys.map((iso)=>{
            const st = dayStatus[iso]
            const isToday = iso === todayStr
            const dow = new Date(iso+'T12:00:00')
            const dayLabel = dow.toLocaleDateString('es',{weekday:'short'}).replace('.','').toUpperCase()
            const dayNum = dow.getDate()
            const isCompleted = st?.sessionStatus === 'COMPLETED'
            const isRestDay = !st?.planned
            const isActive = isToday || st?.sessionStatus === 'IN_PROGRESS' || st?.sessionStatus === 'PAUSED'
            const pct = st?.volume ? Math.min(100, Math.round(st.volume / 80)) : 0

            return (
              <div key={iso} className={`p-2 rounded flex flex-col justify-between h-20 ${
                isToday ? 'bg-surface-container-high border-2 border-secondary/80 shadow-md relative' :
                isCompleted ? 'bg-surface-container border border-outline-variant/20' :
                'bg-surface-container border border-outline-variant/20 opacity-80'
              }`}>
                {isToday && <span className="absolute -top-2 right-1.5 px-1 py-0.2 rounded bg-secondary text-on-secondary font-label-caps text-[9px] font-bold tracking-wider">HOY</span>}
                <div className="flex items-center justify-between">
                  <span className={`font-label-caps text-[10px] font-semibold ${isToday ? 'text-secondary font-bold' : 'text-on-surface-variant'}`}>{dayLabel} {dayNum}</span>
                  {isCompleted ? (
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: 15 }}>check_circle</span>
                  ) : isRestDay ? (
                    <span className="material-symbols-outlined text-secondary" style={{ fontSize: 15 }}>spa</span>
                  ) : isActive ? (
                    <span className="material-symbols-outlined text-secondary animate-pulse" style={{ fontSize: 15 }}>play_circle</span>
                  ) : (
                    <span className="material-symbols-outlined text-outline" style={{ fontSize: 15 }}>schedule</span>
                  )}
                </div>
                <div>
                  <p className={`font-label-md text-[12px] font-medium truncate ${isToday ? 'text-white font-semibold' : 'text-on-surface'}`}>
                    {st?.dayName || (isRestDay ? 'Descanso' : '—')}
                  </p>
                  {st?.volume ? (
                    <p className={`text-[10px] ${isToday ? 'text-primary' : 'text-on-surface-variant'}`}>{st.volume.toLocaleString()} kg{st.rpe ? ` · RPE ${st.rpe}` : ''}</p>
                  ) : isRestDay ? (
                    <p className="text-[10px] text-secondary">Ayuno & Reflexión</p>
                  ) : (
                    <p className="text-[10px] text-on-surface-variant">Sin datos</p>
                  )}
                </div>
                <div className="w-full bg-surface-bright h-1 rounded-full overflow-hidden">
                  <div className={`h-full ${isCompleted ? 'bg-primary-container w-full' : pct > 0 ? 'bg-primary-container' : 'bg-outline-variant'}`} style={{ width: isCompleted ? '100%' : pct > 0 ? `${pct}%` : '0%' }}></div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 font-label-caps text-[10px] text-on-surface-variant">
          <button onClick={()=>setWeekOffset(o=>o-1)} className="px-2 py-0.5 rounded bg-surface-container border border-outline-variant hover:bg-surface-container-high transition-colors">‹ Ant</button>
          <span className="self-center">{weekOffset===0 ? 'Esta semana' : weekOffset>0 ? `+${weekOffset} sem` : `${-weekOffset} sem atrás`}</span>
          <button onClick={()=>setWeekOffset(o=>o+1)} className="px-2 py-0.5 rounded bg-surface-container border border-outline-variant hover:bg-surface-container-high transition-colors">Sig ›</button>
        </div>
      </section>

      {/* 3. BENTO CORE: WORKOUT (LEFT 8) + WIDGETS (RIGHT 4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
        {/* LEFT 8: WORKOUT CARD — ¿Qué tengo que hacer hoy? */}
        <div className="lg:col-span-8  border border-outline-variant/40 rounded-lg p-4 sm:p-5 space-y-4">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">¿Qué tengo que hacer hoy?</div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-surface-bright">
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
            {!isRest && (
              <button onClick={async()=>{
                const { getAllRoutines, getActiveRoutineId } = await import('@/services/storage/routineStore')
                const rawList = await getAllRoutines()
                const activeId = await getActiveRoutineId()
const active = rawList?.find((r)=>r.id===activeId) || rawList?.[0]
                const n = effectiveN
                const { getDayExercises } = await import('@/utils/routine')
                const list = await getDayExercises(n, cycle)
                const { createReadySession } = await import('@/services/training/sessionStore')
                const changed = await getChangedData(todayStr)
                const weekNumber = (()=>{ try{
const start = new Date((cycle as CycleConfig).startDate || todayStr)
                  const now = new Date(todayStr)
                  return Math.max(1, Math.floor((now.getTime()-start.getTime())/(7*86400000))+1)
                }catch{ return 1 } })()
                await createReadySession({
                  calendarDate: todayStr, routineId: active?.id || 'r1', routineName: active?.name || 'Rutina',
                  plannedDay: rawAgenda.n ?? null, plannedDayName: rawAgenda.name ?? null,
                  actualDay: n ?? null, actualDayName: agenda.name ?? null,
exercises: list.map((x)=> ({ exId: x.exId || x.id, name: x.name, sets: x.sets, reps: x.reps, weight: x.weight, muscle: x.muscle, gifUrl: x.gifUrl, imageDataUrl: x.imageDataUrl })),
                  dayChangeReason: changed?.changeReason || (isOverridden ? 'Cambio de día desde Inicio' : undefined),
                  dayChangeComment: changed?.changeComment, weekNumber,
                })
                window.dispatchEvent(new Event('routineChange'))
                nav('/entrenar')
              }} className="self-start sm:self-center flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-primary-container hover:bg-tertiary-container text-on-primary-container border border-outline-variant/50 transition-all font-label-md text-label-md active:scale-[0.98]">
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: 16 }}>play_arrow</span>
                <span className="uppercase tracking-wider text-[12px] font-semibold">{hasActiveSession ? 'CONTINUAR' : 'LANZAR SESIÓN'}</span>
              </button>
            )}
          </div>

          {isRest ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded bg-surface-container border border-outline-variant/20">
                  <span className="font-label-caps text-[9px] text-on-surface-variant uppercase">Próximo Entrenamiento</span>
                  <p className="font-headline-sm text-headline-sm text-on-surface font-semibold mt-0.5">Día N.º {cycle.trainingDays[0]?.n} — {cycle.trainingDays[0]?.name}</p>
                </div>
                <div className="p-3 rounded bg-surface-container border border-outline-variant/20">
                  <span className="font-label-caps text-[9px] text-on-surface-variant uppercase">Hidratación Hoy</span>
                  <p className="font-headline-sm text-headline-sm text-on-surface font-semibold mt-0.5">{hydration !== null ? <>{hydration} / 2500 <span className="text-[12px] text-secondary font-normal">ml</span></> : 'Sin datos'}</p>
                </div>
              </div>
              <p className="text-[11px] text-on-surface-variant italic border-t border-surface-bright pt-3">
                «La recuperación es donde se forja la verdadera fuerza. Descansa con propósito.»
              </p>
            </div>
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
                                <input type="number" step="0.5" value={editDraft.weight} onChange={e=>setEditDraft(d=>({...d, weight: Number(e.target.value)}))}
                                  className="w-16 bg-surface-container-high border border-primary/40 rounded px-1.5 py-0.5 text-right text-secondary text-sm focus:outline-none focus:border-primary"/>
                                <span className="text-[10px] text-on-surface-variant">kg</span>
                              </div>
                            ) : (
                              <span className={`font-medium ${ex.weight > 0 ? 'text-secondary' : 'text-on-surface-variant italic'}`}>{ex.weight > 0 ? `${ex.weight} kg` : 'sin peso'}</span>
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
                                <button onClick={()=>saveExerciseEdit(i)} className="px-2 py-0.5 rounded bg-primary text-on-primary text-[10px] font-label-caps uppercase font-bold hover:bg-primary/80 transition-colors">Guardar</button>
                                <button onClick={()=>setEditingIdx(null)} className="px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant text-on-surface-variant text-[10px] font-label-caps uppercase hover:bg-surface-container transition-colors">Cancelar</button>
                              </div>
                            ) : (
                              <button onClick={()=>{ setEditingIdx(i); setEditDraft({reps: ex.reps || 0, weight: ex.weight || 0, restSec: ex.restSec || 90}) }}
                                className="px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant text-on-surface-variant text-[10px] font-label-caps uppercase hover:border-primary hover:text-primary transition-all active:scale-[0.97]">
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
                    <span className="font-label-caps text-[9px] text-on-surface-variant uppercase">INTENSIDAD MEDIA</span>
                    <p className="font-headline-sm text-headline-sm text-primary font-semibold mt-0.5">8.2 <span className="text-[12px] text-on-surface-variant font-normal">/ 10 RPE</span></p>
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
                  <span className="font-headline-md text-headline-sm font-bold text-white">{briefV2?.recovery?.lastScore ?? '—'}</span>
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

          {/* WIDGET 2: HIDRATACIÓN & NÉCTAR */}
           <div className="border border-outline-variant/40 rounded-lg p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: 20 }}>water_drop</span>
                <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold">HIDRATACIÓN & NÉCTAR</span>
              </div>
              <span className="text-[11px] text-secondary font-medium">{hydration !== null ? `${Math.round(hydration/25)}% Objetivo` : 'Sin datos'}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-1">
                <span className="font-headline-md text-headline-sm font-bold text-on-surface">{hydration !== null ? (hydration/1000).toFixed(1) : '—'}</span>
                <span className="text-body-sm text-on-surface-variant">/ 2.5 L</span>
              </div>
              <span className="font-label-caps text-[10px] text-primary uppercase font-semibold">+Electrolitos</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({length:5}).map((_,i)=>{
                const filled = (hydration ?? 0) >= (i+1)*500
                const partial = !filled && (hydration ?? 0) > i*500
                return (
                  <div key={i} className={`p-1.5 rounded border flex flex-col items-center ${filled ? 'bg-primary-container/30 border-primary/40' : partial ? 'bg-primary-container/20 border-primary/20' : 'bg-surface-container border-outline-variant/30 opacity-60'}`}>
                    <span className={`material-symbols-outlined ${filled ? 'text-primary' : partial ? 'text-primary-fixed-dim' : 'text-outline'}`} style={{ fontSize: 15 }}>water_drop</span>
                    <span className="text-[9px] text-on-surface mt-0.5 font-label-caps">{(i+1)*500}ml</span>
                  </div>
                )
              })}
            </div>
            <button
              onClick={()=>{
                const addMl = 250
                import('@/services/recovery/recoveryService').then(({ addHydration, getTodayHydration })=>{
                  addHydration(addMl)
                    .then(()=> getTodayHydration())
                    .then(setHydration)
                    .catch(()=>{})
                }).catch(()=>{})
              }}
              className="w-full py-2 rounded-lg bg-primary-container/30 border border-primary/40 text-primary font-label-caps text-[10px] uppercase font-bold hover:bg-primary-container/50 transition-colors active:scale-[0.98]"
            >
              + 250 ml
            </button>
            <Link to="/nutricion" className="block text-center text-[9px] text-on-surface-variant font-label-caps uppercase hover:text-primary transition-colors">
              Ver Nutrición →
            </Link>
          </div>

          {/* WIDGET 3: ORÁCULO VIRTUOSO */}
           <div className="border border-secondary/30 rounded-lg p-3.5 sm:p-4 space-y-2.5 relative overflow-hidden bg-gradient-to-b from-surface-container-low to-surface-container">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-surface-container-high border border-secondary/50 flex-shrink-0 flex items-center justify-center">
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: 20 }}>psychology</span>
              </div>
              <div>
                <h3 className="font-headline-sm text-body-md font-semibold text-secondary tracking-wide">Oráculo Virtuoso</h3>
                <p className="font-label-caps text-[9px] text-primary uppercase font-medium">CONSEJO DE LA PALAESTRA</p>
              </div>
            </div>
            <p className="font-headline-sm text-[12px] leading-relaxed text-on-surface/90 italic pt-0.5">
              «Ningún ciudadano tiene derecho a ser un aficionado en el entrenamiento físico. Qué desgracia envejecer sin ver la belleza y fuerza de la que el cuerpo es capaz.»
            </p>
            <p className="text-right font-label-caps text-[10px] text-secondary font-semibold">— Sócrates</p>
            <div className="pt-2 border-t border-outline-variant/20 flex justify-between items-center">
              <span className="text-[10px] text-on-surface-variant">Respuesta adaptada a tus métricas</span>
              <Link to="/coach" className="inline-flex items-center gap-1 text-primary hover:text-secondary transition-colors font-label-caps text-[10px] uppercase font-bold">
                <span>Consultar al Oráculo</span>
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
                      {briefV2.progress.trend==='improving'?'↑ Progresando':briefV2.progress.trend==='declining'?'↓ Bajando':'→ Estable'}
                    </span>
                  )}
                  {briefV2.nutrition?.gap && (
                    <span className="px-2 py-0.5 rounded-full bg-secondary/20 text-secondary text-[10px] font-label-caps">
                      ⚠ {briefV2.nutrition.gap.length > 30 ? briefV2.nutrition.gap.slice(0,30)+'…' : briefV2.nutrition.gap}
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
              <div className="bg-primary h-full" style={{ width: briefV2?.progress?.trend === 'improving' ? '72%' : briefV2?.progress?.trend === 'declining' ? '35%' : '0%' }}></div>
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
                {effectiveN===d.n && <span className="text-[10px] font-label-caps text-on-surface-variant">● actual</span>}
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
              <button onClick={()=>setWeekOffset(w=>w-1)} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant text-on-surface-variant text-sm">← Anterior</button>
              <button onClick={()=>setWeekOffset(0)} className="flex-1 py-2 rounded bg-primary text-on-primary text-sm font-medium">Esta semana</button>
              <button onClick={()=>setWeekOffset(w=>w+1)} className="flex-1 py-2 rounded bg-surface-container border border-outline-variant text-on-surface-variant text-sm">Siguiente →</button>
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
