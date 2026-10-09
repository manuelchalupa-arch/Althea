import { useEffect, useState } from 'react'
import { prettyExId } from '@/utils/format'
import { db } from '@/services/storage/db'
import { AltheaCard, AltheaCardHeader, AltheaBadge, AltheaButton, AltheaPanel, AltheaStatRow } from '@/components/althea'
import { RecoveryCheckForm } from '@/components/recovery/RecoveryCheckForm'
import { getOverrideDay, migrateSessionOverridesFromLocalStorage } from '@/services/storage/sessionOverrideStore'
import type { CycleConfig, LoadState } from '@/utils/cycle'
import { getLoadForDate, LOAD_STATE_LABEL, LOAD_STATE_COLOR } from '@/utils/cycle'
import { todayKey, weekdayOfKey } from '@/utils/dates'
import { getActiveVersion, PROFILE_SCOPE } from '@/services/planning/cycleVersions'
import { sessionEnergy, loadWeightRows, weightForDate, energyInsufficientReason, type EnergySession, type WeightRow } from '@/services/training/exerciseEnergy'
import { useIsMobile } from '@/hooks/useIsMobile'

type DaySession = EnergySession & {
  id: string
  localDate: string
  status: string
  routineName?: string
}

function daysInMonth(y:number,m:number){ return new Date(y,m+1,0).getDate() }

const LOAD_LABEL_COLOR: Record<LoadState, string> = {
  NORMAL: 'text-primary/60',
  SOBRECARGA: 'text-error',
  CARGA_REDUCIDA: 'text-tertiary',
  CARGA_CERO: 'text-on-surface-variant/60',
}

const statusBadgeVariant = (st: string): 'success' | 'warning' | 'danger' | 'outline' => {
  if (st === 'COMPLETED') { return 'success' }
  if (st === 'PARTIAL') { return 'warning' }
  if (st === 'ABANDONED') { return 'danger' }
  return 'outline'
}

export default function Calendario(){
  const now = new Date()
  const [selectedDate,setSelectedDate]=useState<string | null>(null)
  const [view,setView]=useState<{y:number; m:number}>(()=>({ y: now.getFullYear(), m: now.getMonth() }))
  const { y, m } = view
  const [map,setMap]=useState<Record<string,number>>({})
  const [detail,setDetail]=useState<{date:string; scheduled:string; actual:string; changed:boolean; sessions:any[]; hydration:number; recovery:any; meals?:number; calories?:number; macros?:{proteins:number; carbs:number; fats:number}} | null>(null)
  const [cycle,setCycle]=useState<CycleConfig | null>(null)
  const [monthOverrides,setMonthOverrides]=useState<Record<string,boolean>>({})
  const [showCheckin,setShowCheckin]=useState(false)
  const [todayScore,setTodayScore]=useState<number|null>(null)
  const [,setTodaySleep]=useState<number|null>(null)
  const [todayHydration,setTodayHydration]=useState(0)

  const isMobile = useIsMobile()

  const todayStr = selectedDate ?? todayKey()

  useEffect(()=>{
    migrateSessionOverridesFromLocalStorage()
    Promise.all([db.sessions.toArray().catch(()=>[]), db.trainingSessions.toArray().catch(()=>[])]).then(([legacy, official])=>{
      const c: Record<string, number> = {}
      const seen = new Set<string>()
      // Unión oficial + legacy: misma fecha+id cuenta una vez (migración copia sin borrar).
      for(const x of [...legacy.map((s)=> ({ date: s.localDate, id: s.id })), ...official.map((s)=> ({ date: s.calendarDate, id: s.sessionId || s.id }))]){
        const k = `${x.date}|${x.id}`
        if(seen.has(k) || !x.date) {continue}
        seen.add(k)
        c[x.date]=(c[x.date]||0)+1
      }
      setMap(c)
    })
    try{
      import('@/services/storage/routineStore').then(({ getAllRoutines, getActiveRoutineId }) =>
        Promise.all([getAllRoutines(), getActiveRoutineId()]).then(async ([raw, activeId]) => {
          const active=raw?.find((r)=>r.id===activeId) || raw?.[0]
          const pv = await getActiveVersion(PROFILE_SCOPE)
          if(pv?.cycle) {setCycle(pv.cycle as CycleConfig)}
          else if(active) {setCycle(active.cycle as CycleConfig)}
          else {
            db.userProfile.get('me').then(p=> setCycle((p?.cycle as CycleConfig) || null))
          }
        })
      ).catch(()=>{})
    }catch{}
  },[selectedDate])

  useEffect(()=>{
    const loadRecovery = async () => {
      const targetDate = selectedDate ?? todayStr
      const r = await db.recoveryChecks.get(targetDate).catch(()=>null)
      setTodayScore(typeof r?.score === 'number' ? r.score : null)
      setTodaySleep(typeof (r as { sleepHours?: number } | null)?.sleepHours === 'number' ? (r as { sleepHours: number }).sleepHours : null)
      const hyd = await db.hydrationLogs.where('localDate').equals(targetDate).toArray()
        .then(a => a.filter(h => (h as { isDemo?: boolean }).isDemo !== true).reduce((s, b) => s + Number(b.amountMl || 0), 0))
        .catch(()=>0)
      setTodayHydration(hyd)
    }
    loadRecovery()
    const onRec = () => loadRecovery()
    window.addEventListener('recoveryChange', onRec)
    return () => window.removeEventListener('recoveryChange', onRec)
  }, [selectedDate, todayStr])

  useEffect(()=>{
    const daysInM = new Date(y, m + 1, 0).getDate()
    const keys = Array.from({length: daysInM}, (_, i) => {
      const d = i + 1
      return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    })
    Promise.all(keys.map(k => getOverrideDay(k))).then(results => {
      const ov: Record<string, boolean> = {}
      results.forEach((r, i) => { if (r !== null && r !== undefined) {ov[keys[i]] = true} })
      setMonthOverrides(ov)
    })
  }, [y, m])

  const changeMonth = (delta: number) => {
    setView(v => {
      const d = new Date(v.y, v.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
    setDetail(null)
    setSelectedDate(null)
  }

  const openDay = async (key:string)=>{
    const dow=weekdayOfKey(key)
    const scheduledN = cycle?.weekMap?.[dow]
    const scheduled = scheduledN ? cycle.trainingDays.find((x)=>x.n===scheduledN)?.name || `Día N°${scheduledN}` : 'Descanso'
    const load = cycle ? getLoadForDate(key, cycle) : 'NORMAL' as const
    const overrideVal = await getOverrideDay(key)
    const actualN = overrideVal !== null && overrideVal !== undefined ? overrideVal : scheduledN
    const actual = actualN ? cycle?.trainingDays.find((x)=>x.n===actualN)?.name || `Día N°${actualN}` : 'Descanso'
    const changed = overrideVal !== null && overrideVal !== undefined && overrideVal !== scheduledN
    const [legacySessions, officialSessions] = await Promise.all([
      db.sessions.where('localDate').equals(key).toArray().catch(()=>[]),
      db.trainingSessions.where('calendarDate').equals(key).toArray().catch(()=>[]),
    ])
    const sessions: DaySession[] = [
      ...legacySessions.map((s)=> {
        const id = String(s.id); const date = String(s.localDate)
        const status = s.finishedAt ? 'COMPLETED' : 'ABANDONED'
        return { id, localDate: date, status, sessionId: id, calendarDate: date, sessionStatus: status }
      }),
      ...officialSessions.map((s)=> ({
        id: s.sessionId || s.id, localDate: s.calendarDate, status: s.sessionStatus, routineName: s.routineName,
        sessionId: s.sessionId || s.id, calendarDate: s.calendarDate, sessionStatus: s.sessionStatus,
        startedAt: s.startedAt, completedAt: s.completedAt, endedAt: s.endedAt, completingAt: s.completingAt,
        pausedAt: s.pausedAt, resumedAt: s.resumedAt, totalPausedDurationSec: s.totalPausedDurationSec, isDemo: s.isDemo,
      })),
    ]
    // Gasto calórico del ejercicio del día: mismo motor que Inicio y los informes PDF.
    const weightRows: WeightRow[] = await loadWeightRows()
    // Detalle por sesión: ejercicios, series, volumen y cumplimiento (solo lectura).
    const detailed = await Promise.all(sessions.map(async (s) => {
      const [ses, recs, logs] = await Promise.all([
        db.sessionExercises.where('sessionId').equals(s.id).toArray().catch(() => []),
        db.setRecords.where('sessionId').equals(s.id).toArray().catch(() => []),
        db.setLogs.where('sessionId').equals(s.id).toArray().catch(() => []),
      ])
      const done = recs.filter(r => (r as { status?: string }).status === 'COMPLETED')
      const vol = done.reduce((a, r) => a + Number((r as { actualWeight?: number }).actualWeight || 0) * Number((r as { actualReps?: number }).actualReps || 0), 0)
        + logs.filter(l => (l as { completed?: boolean }).completed).reduce((a, l) => a + Number((l as { weight?: number }).weight || 0) * Number((l as { reps?: number }).reps || 0), 0)
      const exNames = ses.length > 0
        ? ses.map(e => prettyExId(String((e as { exerciseId?: string }).exerciseId || '')))
        : [...new Set(logs.map(l => prettyExId(String((l as { exerciseId?: string }).exerciseId || ''))))]
      const planned = ses.reduce((a, e) => a + Number((e as { plannedSetCount?: number }).plannedSetCount || 0), 0)
      const doneCount = done.length + logs.filter(l => (l as { completed?: boolean }).completed).length
      // Gasto calórico de ESTA sesión con el motor central (nunca inventado).
      const weight = weightForDate(weightRows, s.localDate)
      const energy = sessionEnergy(s, weight)
      const motivo = energyInsufficientReason(s, weight)
      return {
        ...s,
        exercises: exNames.filter(Boolean),
        volume: Math.round(vol * 10) / 10,
        setsDone: doneCount,
        setsPlanned: planned || undefined,
        compliance: planned > 0 ? Math.round((doneCount / planned) * 100) : undefined,
        kcal: energy?.kcal ?? null,
        durationMinutes: energy?.durationMinutes ?? null,
        gastoSinDatos: motivo === 'SIN_PESO' || motivo === 'SIN_DURACION',
      }
    }))
    const hyd = await db.hydrationLogs.where('localDate').equals(key).toArray().then(a=> a.reduce((s,b)=>s+b.amountMl,0)).catch(()=>0)
    // Solo Dexie: sin dato → Sin datos (sin fallback a localStorage).
    const rec = await db.recoveryChecks.get(key).catch(()=>null)
    const diary = await db.nutritionDiary.where('date').equals(key).toArray().catch(() => [])
    const dayCalories = diary.reduce((a, e) => a + Number((e as { macros?: { calories?: number } }).macros?.calories || 0), 0)
    // Macros reales del día (suma de comidas registradas; sin dato = 0, sin inventar).
    let proteins = 0, carbs = 0, fats = 0
    for(const e of diary){
      const mc = (e as { macros?: { proteins?: number; carbs?: number; fats?: number } }).macros
      proteins += Number(mc?.proteins || 0); carbs += Number(mc?.carbs || 0); fats += Number(mc?.fats || 0)
    }
    setDetail({date:key, scheduled, actual, changed, sessions: detailed, hydration: hyd, recovery: rec, meals: diary.length, calories: Math.round(dayCalories), load,
      macros: { proteins: Math.round(proteins), carbs: Math.round(carbs), fats: Math.round(fats) }} as never)
  }

  // Gasto del día (historial): misma suma que muestra Inicio para la misma fecha.
  const sesionesGasto = detail ? (detail.sessions as Array<{ kcal?: number | null; gastoSinDatos?: boolean }>) : []
  const gastoDia = sesionesGasto.reduce((a, s) => a + (typeof s.kcal === 'number' ? s.kcal : 0), 0)
  const hayGasto = sesionesGasto.some(s => typeof s.kcal === 'number')
  const gastoSinDatosDelDia = !hayGasto && sesionesGasto.some(s => s.gastoSinDatos)

  const dim = daysInMonth(y,m)
  const first = new Date(y,m,1).getDay()
  const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}`
  const monthSessions = Object.keys(map).filter(k => k.startsWith(monthPrefix)).length
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const monthHeader = cap(new Date(y, m, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' }))

  const headerCard = (
    <AltheaCard padding="md" className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="material-symbols-outlined text-primary text-[22px] shrink-0">favorite</span>
          <h1 className="font-headline-lg text-lg font-semibold text-on-surface">Calendario y recuperación</h1>
        </div>
        {todayScore !== null ? (
          <AltheaBadge variant="primary" icon="monitor_heart" size="sm">Score: {todayScore}/100</AltheaBadge>
        ) : (
          <AltheaBadge variant="outline" icon="timelapse" size="sm">Sin check-in</AltheaBadge>
        )}
      </div>
      <div className="font-body-sm text-[13px] text-on-surface-variant flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px]">water_drop</span>
        {todayHydration > 0 ? `Agua: ${(todayHydration / 1000).toFixed(1)} L` : 'Agua: Sin datos'}
      </div>
      <AltheaButton icon="favorite" fullWidth onClick={()=>setShowCheckin(true)} className="sm:w-auto sm:min-w-[280px] min-h-[52px]">
        Recuperación
      </AltheaButton>
    </AltheaCard>
  )

  const monthCard = (
    <AltheaCard className="space-y-3">
        <AltheaCardHeader
          icon="calendar_month"
          title={monthHeader}
          action={
            <div className="flex items-center gap-1.5">
              <AltheaButton variant="ghost" size="md" icon="chevron_left" aria-label="Mes anterior" onClick={()=>changeMonth(-1)} className="w-12 h-12 shrink-0"><span className="sr-only">Mes anterior</span></AltheaButton>
              <AltheaButton variant="ghost" size="md" icon="chevron_right" aria-label="Mes siguiente" onClick={()=>changeMonth(1)} className="w-12 h-12 shrink-0"><span className="sr-only">Mes siguiente</span></AltheaButton>
            </div>
          }
        />
        <div className="grid grid-cols-7 gap-1 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-center">
          {['D','L','M','M','J','V','S'].map((d,i)=> <div key={'wd'+i} className="text-on-surface-variant py-1">{d}</div>)}
          {Array.from({length:first}).map((_,i)=> <div key={'e'+i}/>)}
          {Array.from({length:dim}).map((_,i)=>{
            const d=i+1; const key=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
            const has=map[key]
            const override=monthOverrides[key]
            const isToday=key===todayStr
            const load = cycle ? getLoadForDate(key, cycle) : 'NORMAL'
            const highlight = isToday || override ? `ring-2 ${override ? 'ring-tertiary' : 'ring-on-surface'}` : ''
            const loadLabelCls = has ? 'text-on-primary/70' : (LOAD_LABEL_COLOR[load] ?? 'text-primary/60')
            return (
              <button key={d} data-date={key} aria-label={key} onClick={()=>openDay(key)} className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[48px] rounded-lg font-label-md text-[10px] font-semibold uppercase tracking-widest border transition-colors ${highlight} ${has?'bg-primary text-on-surface border-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant text-on-surface'}`}>
                <span>{d}</span>
                <span className={`block text-[7px] font-label-caps uppercase tracking-wider leading-none ${loadLabelCls}`}>{LOAD_STATE_LABEL[load].slice(0,4)}</span>
                {has ? <span className="block text-[8px] leading-none">✓{override?'↻':''}</span> : null}
              </button>
            )
          })}
        </div>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1 mt-1">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-primary rounded-full inline-block"></span> completado</span>
          <span className="flex items-center gap-1.5 ml-3"><span className="w-3 h-3 bg-tertiary rounded-full inline-block"></span> cambiado</span>
        </div>
        {monthSessions === 0 && (
          <p className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant text-center py-2">Sin sesiones registradas este mes</p>
        )}
    </AltheaCard>
  )

  const sideCards = (
    <>
        <AltheaPanel>
          <AltheaCardHeader icon="summarize" title="Resumen del mes" />
          <AltheaStatRow items={[
            { icon: 'calendario', value: monthSessions, label: 'Días con sesión' },
            { icon: 'rutinas', value: Object.values(map).reduce((a,b)=>a+b, 0), label: 'Total sesiones' },
          ]} />
        </AltheaPanel>
        <AltheaCard className="space-y-2">
          <AltheaCardHeader icon="schedule" title="Próximas sesiones" />
          {(cycle?.trainingDays.length ?? 0) > 0 ? (
            <div className="space-y-1.5">
              {cycle!.trainingDays.slice(0, 4).map((d) => (
                <div key={d.n} className="flex justify-between items-center gap-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                  <span className="truncate">N°{d.n} — {d.name}</span>
                  <span className="text-primary shrink-0">Activo</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Sin rutina activa</p>
          )}
        </AltheaCard>
        <AltheaCard className="space-y-2">
          <AltheaCardHeader icon="tips_and_updates" title="Tips rápidos" />
          <ul className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant space-y-1.5 list-disc list-inside">
            <li>Registrá cada sesión para progresión</li>
            <li>Los días marcados indican rutina completada</li>
            <li>Usá el override para sesiones movidas</li>
          </ul>
        </AltheaCard>
    </>
  )

  const detailSheet = detail && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 althea-modal" onClick={()=>setDetail(null)}>
          <div onClick={e=>e.stopPropagation()} className="bg-surface/95 backdrop-blur-md border-t border-outline-variant rounded-t-2xl w-full max-w-lg lg:max-w-2xl max-h-[75vh] overflow-auto p-4 space-y-3 pb-safe">
            <h3 className="font-headline-lg text-base font-semibold text-on-surface">{detail.date} — {detail.actual}</h3>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Programado: {detail.scheduled} {detail.changed && `→ Realizado: ${detail.actual} (cambiado)`}</p>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-2">Carga: <span className={`px-2 py-0.5 rounded-full border text-[9px] font-semibold ${LOAD_STATE_COLOR[(detail as { load?: string }).load as LoadState] ?? LOAD_STATE_COLOR.NORMAL}`}>{LOAD_STATE_LABEL[(detail as { load?: string }).load as LoadState] ?? (detail as { load?: string }).load}</span></p>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Sesiones: {detail.sessions.length}{detail.sessions.length === 0 && detail.actual !== 'Descanso' ? ' · Sesión pendiente de registrar' : ''} · Hidratación: {detail.hydration > 0 ? `${detail.hydration} ml` : 'Sin datos'} · Recuperación: {typeof detail.recovery?.score === 'number' ? `${detail.recovery.score}/100` : 'Sin datos'}</p>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
              Gasto calórico del ejercicio:{' '}
              {hayGasto ? (
                <span data-testid="dia-gasto-total" className="text-primary font-semibold">{Math.round(gastoDia)} kcal</span>
              ) : gastoSinDatosDelDia ? (
                <span data-testid="dia-gasto-sin-datos" className="italic">Sin datos suficientes para estimar</span>
              ) : (
                <span data-testid="dia-gasto-vacio" className="italic">Sin sesiones registradas</span>
              )}
            </p>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Comidas: {detail.meals ?? 0}{detail.calories ? ` · ${detail.calories} kcal` : ' · Sin comidas registradas'}{detail.macros ? ` · P ${detail.macros.proteins}g · C ${detail.macros.carbs}g · G ${detail.macros.fats}g` : ''} · Sueño: {typeof detail.recovery?.sleepHours === 'number' ? `${detail.recovery.sleepHours}h (calidad ${detail.recovery.sleepQuality ?? '—'}/10)` : 'Sin datos'}</p>
            {detail.sessions.length>0 && (
              <AltheaCard className="space-y-2">
                <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Ejercicios registrados</p>
                {detail.sessions.map((s:any)=>{ const st = String(s.status || ''); return (
                  <div key={s.id} className="space-y-1">
                    <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-2 flex-wrap">
                      <AltheaBadge variant={statusBadgeVariant(st)} size="xs">{st || '—'}</AltheaBadge>
                      <span>{s.localDate}{s.routineName ? ` · ${s.routineName}` : ''}</span>
                    </div>
                    <p className="font-body-sm text-[12px] text-on-surface-variant pl-1">
                      {(s.exercises || []).join(' · ') || 'Sin detalle de ejercicios'}
                      {s.volume > 0 && <span> · {s.volume} kg</span>}
                      {s.setsDone > 0 && <span> · {s.setsDone}{s.setsPlanned ? `/${s.setsPlanned}` : ''} series</span>}
                      {typeof s.compliance === 'number' && <span> · {s.compliance}%</span>}
                      {s.kcal !== null && (
                        <span data-testid="sesion-gasto"> · {Math.round(s.kcal)} kcal{s.durationMinutes ? ` · ${Math.round(s.durationMinutes)} min` : ''}</span>
                      )}
                    </p>
                    {s.kcal === null && s.gastoSinDatos && (
                      <p data-testid="sesion-gasto-sin-datos" className="font-body-sm text-[12px] text-on-surface-variant italic pl-1">
                        Sin datos suficientes para estimar el gasto de esta sesión.
                      </p>
                    )}
                  </div>
                ) })}
              </AltheaCard>
            )}
            {detail.sessions.length===0 && (
              <div className="rounded-lg border border-outline-variant/40 bg-surface-container/60 p-3">
                <p className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">Sin sesiones registradas este día</p>
                <p className="font-body-sm text-[12px] text-on-surface-variant mt-1">
                  {detail.actual !== 'Descanso' ? `Programado como «${detail.actual}»: todavía no se registró.` : 'Día de descanso.'}
                </p>
              </div>
            )}
            <AltheaButton fullWidth size="lg" onClick={()=>setDetail(null)} className="min-h-[48px]">Cerrar</AltheaButton>
          </div>
        </div>
  )

  const checkinSheet = showCheckin && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-6 althea-modal" onClick={()=>setShowCheckin(false)}>
          <div onClick={e=>e.stopPropagation()} className="bg-surface border border-outline-variant rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[85vh] overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-3 pb-safe">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">favorite</span>
                <h3 className="font-headline-lg text-base font-semibold text-on-surface">Recuperación</h3>
              </div>
              <button onClick={()=>setShowCheckin(false)} aria-label="Cerrar recuperación" className="p-2 min-w-[48px] min-h-[48px] rounded-lg border border-outline-variant text-on-surface-variant hover:text-on-surface flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Solo registra tu estado. No modifica tu rutina.</p>
            <RecoveryCheckForm onSaved={()=>setShowCheckin(false)} />
          </div>
        </div>
  )

  if (isMobile) {
    return (
      <div className="space-y-2">
        {headerCard}
        {monthCard}
        {sideCards}
        {detailSheet}
        {checkinSheet}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 pb-24 max-w-[1440px] w-full mx-auto space-y-4">
      {headerCard}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-3">{monthCard}</div>
        <div className="lg:col-span-4 space-y-3">{sideCards}</div>
      </div>
      {detailSheet}
      {checkinSheet}
    </div>
  )
}