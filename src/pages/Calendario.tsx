import { useEffect, useState } from 'react'
import { db } from '@/services/storage/db'
import { Dumbbell, Clock, AlertTriangle } from 'lucide-react'
import { AltheaCard, AltheaCardHeader, AltheaBadge, StatusTag } from '@/components/althea'
import { RecoveryCheckForm } from '@/components/recovery/RecoveryCheckForm'
import { getOverrideDay, migrateSessionOverridesFromLocalStorage } from '@/services/storage/sessionOverrideStore'
import type { CycleConfig } from '@/utils/cycle'

function daysInMonth(y:number,m:number){ return new Date(y,m+1,0).getDate() }

export default function Calendario(){
  const now = new Date()
  const [y,m] = [now.getFullYear(), now.getMonth()]
  const [map,setMap]=useState<Record<string,number>>({})
  const [detail,setDetail]=useState<{date:string; scheduled:string; actual:string; changed:boolean; sessions:any[]; hydration:number; recovery:any; meals?:number; calories?:number} | null>(null)
  const [cycle,setCycle]=useState<CycleConfig | null>(null)
  const [monthOverrides,setMonthOverrides]=useState<Record<string,boolean>>({})
  const [showCheckin,setShowCheckin]=useState(false)
  const [todayScore,setTodayScore]=useState<number|null>(null)

  useEffect(()=>{
    migrateSessionOverridesFromLocalStorage()
    Promise.all([db.sessions.toArray().catch(()=>[]), db.trainingSessions.toArray().catch(()=>[])]).then(([legacy, official])=>{
      const c: Record<string,number> = {}
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
        Promise.all([getAllRoutines(), getActiveRoutineId()]).then(([raw, activeId]) => {
          const active=raw?.find((r)=>r.id===activeId) || raw?.[0]
          if(active) {setCycle(active.cycle as CycleConfig)}
          else {
            db.userProfile.get('me').then(p=> setCycle((p?.cycle as CycleConfig) || null))
          }
        })
      ).catch(()=>{})
    }catch{}
  },[])

  useEffect(()=>{
    const loadTodayScore = async () => {
      const r = await db.recoveryChecks.get(todayStr).catch(()=>null)
      setTodayScore(typeof r?.score === 'number' ? r.score : null)
    }
    loadTodayScore()
    const onRec = () => loadTodayScore()
    window.addEventListener('recoveryChange', onRec)
    return () => window.removeEventListener('recoveryChange', onRec)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  useEffect(()=>{
    const daysInM = new Date(y, m + 1, 0).getDate()
    const keys = Array.from({length: daysInM}, (_, i) => {
      const d = i + 1
      return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    })
    Promise.all(keys.map(k => getOverrideDay(k))).then(results => {
      const ov: Record<string, boolean> = {}
      results.forEach((r, i) => { if (r != null) {ov[keys[i]] = true} })
      setMonthOverrides(ov)
    })
  }, [y, m])

  const openDay = async (key:string)=>{
    const d=new Date(key+'T12:00:00')
    const dow=d.getDay()
    const scheduledN = cycle?.weekMap?.[dow]
    const scheduled = scheduledN ? cycle.trainingDays.find((x)=>x.n===scheduledN)?.name || `Día N°${scheduledN}` : 'Descanso'
    const overrideVal = await getOverrideDay(key)
    const actualN = overrideVal != null ? overrideVal : scheduledN
    const actual = actualN ? cycle?.trainingDays.find((x)=>x.n===actualN)?.name || `Día N°${actualN}` : 'Descanso'
    const changed = overrideVal != null && overrideVal !== scheduledN
    const [legacySessions, officialSessions] = await Promise.all([
      db.sessions.where('localDate').equals(key).toArray().catch(()=>[]),
      db.trainingSessions.where('calendarDate').equals(key).toArray().catch(()=>[]),
    ])
    const sessions = [
      ...legacySessions.map((s)=> ({ id: s.id, localDate: s.localDate, status: s.finishedAt ? 'COMPLETED' : 'ABANDONED' })),
      ...officialSessions.map((s)=> ({ id: s.sessionId || s.id, localDate: s.calendarDate, status: s.sessionStatus, routineName: s.routineName })),
    ]
    // Detalle por sesión: ejercicios, series, volumen y cumplimiento (solo lectura).
    const prettyId = (id: string) => String(id).split('/').pop()?.replace(/-/g, ' ') || String(id)
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
        ? ses.map(e => prettyId(String((e as { exerciseId?: string }).exerciseId || '')))
        : [...new Set(logs.map(l => prettyId(String((l as { exerciseId?: string }).exerciseId || ''))))]
      const planned = ses.reduce((a, e) => a + Number((e as { plannedSetCount?: number }).plannedSetCount || 0), 0)
      const doneCount = done.length + logs.filter(l => (l as { completed?: boolean }).completed).length
      return {
        ...s,
        exercises: exNames.filter(Boolean),
        volume: Math.round(vol * 10) / 10,
        setsDone: doneCount,
        setsPlanned: planned || undefined,
        compliance: planned > 0 ? Math.round((doneCount / planned) * 100) : undefined,
      }
    }))
    const hyd = await db.hydrationLogs.where('localDate').equals(key).toArray().then(a=> a.reduce((s,b)=>s+b.amountMl,0)).catch(()=>0)
    // Solo Dexie: sin dato → Sin datos (sin fallback a localStorage).
    const rec = await db.recoveryChecks.get(key).catch(()=>null)
    const diary = await db.nutritionDiary.where('date').equals(key).toArray().catch(() => [])
    const dayCalories = diary.reduce((a, e) => a + Number((e as { macros?: { calories?: number } }).macros?.calories || 0), 0)
    setDetail({date:key, scheduled, actual, changed, sessions: detailed, hydration: hyd, recovery: rec, meals: diary.length, calories: Math.round(dayCalories)})
  }

  const dim = daysInMonth(y,m)
  const first = new Date(y,m,1).getDay()
  const todayStr = new Date().toISOString().slice(0,10)

  return (
    <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 pb-24 max-w-[1440px] w-full mx-auto space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-headline-lg text-lg font-semibold text-on-surface">Calendario y recuperación</h1>
          {todayScore !== null && (
            <span className="px-2.5 py-1.5 rounded-lg bg-surface-container border border-outline-variant font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Hoy: {todayScore}/100</span>
          )}
        </div>
        <button onClick={()=>setShowCheckin(true)} className="w-full sm:w-auto sm:min-w-[280px] sm:mx-auto flex items-center justify-center gap-2 px-4 py-3 min-h-[52px] rounded-xl bg-primary text-on-primary font-label-caps text-[12px] uppercase font-bold tracking-widest shadow-sm transition-all active:scale-[0.98]">
          <span className="material-symbols-outlined text-[20px]">favorite</span>
          Recuperación
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-3">
      <div className="  rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3">
        <div className="font-body-md text-sm text-on-surface font-medium mb-3">{now.toLocaleDateString('es',{month:'long', year:'numeric'})}</div>
        <div className="grid grid-cols-7 gap-1 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-center">
          {['D','L','M','M','J','V','S'].map(d=> <div key={d} className="text-on-surface-variant py-1">{d}</div>)}
          {Array.from({length:first}).map((_,i)=> <div key={'e'+i}/>)}
          {Array.from({length:dim}).map((_,i)=>{
            const d=i+1; const key=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
            const has=map[key]
            const override=monthOverrides[key]
            const isToday=key===todayStr
            return (
              <button key={d} onClick={()=>openDay(key)} className={`py-2 rounded font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant border ${has?'bg-primary text-on-surface border-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant font-body-md text-sm text-on-surface'} ${isToday?'ring-2 ring-info':''} ${override?' ring-1 ring-amber-500':''}`}>
                {d}{has ? <span className="block text-[8px]">✓ {override?'↻':''}</span> : <span className="block text-[8px]">&nbsp;</span>}
              </button>
            )
          })}
        </div>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant mt-3 flex gap-2"><span className="w-3 h-3 bg-primary rounded-full inline-block"></span> completado <span className="w-3 h-3 bg-amber-500 rounded-full inline-block ml-2"></span> cambiado</div>
      </div>

      </div>
      <div className="lg:col-span-4 space-y-3 hidden lg:block">
        <div className="  rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><Dumbbell size={14}/> Resumen del mes</div>
          <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"><span>Días con sesión</span><span className="font-body-md text-sm text-on-surface font-medium">{Object.keys(map).filter(k=> k.startsWith(`${y}-${String(m+1).padStart(2,'0')}`)).length}</span></div>
          <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"><span>Total sesiones</span><span className="font-body-md text-sm text-on-surface font-medium">{Object.values(map).reduce((a,b)=>a+b, 0)}</span></div>
        </div>
        <div className="  rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><Clock size={14}/> Próximas sesiones</div>
          {cycle?.trainingDays.length ?? 0 > 0 ? (
            <div className="space-y-1.5">
              {cycle!.trainingDays.slice(0, 4).map((d) => (
                <div key={d.n} className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs">
                  <span>N°{d.n} — {d.name}</span>
                  <span className="text-primary">Activo</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs text-on-surface-variant">Sin rutina activa</div>
          )}
        </div>
        <div className="  rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><AlertTriangle size={14}/> Tips rápidos</div>
          <ul className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs space-y-1.5 list-disc list-inside">
            <li>Registra cada sesión para progresión</li>
            <li>Los días marcados indican rutina completada</li>
            <li>Usá el override para sesiones movidas</li>
          </ul>
        </div>
      </div>

      </div>

      {detail && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={()=>setDetail(null)}>
          <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border-t border-outline-variant rounded-t-2xl w-full max-w-lg lg:max-w-2xl max-h-[75vh] overflow-auto p-4 space-y-3">
            <h3 className="font-headline-lg text-base font-semibold text-on-surface">{detail.date} — {detail.actual}</h3>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Programado: {detail.scheduled} {detail.changed && `→ Realizado: ${detail.actual} (cambiado)`}</p>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Sesiones: {detail.sessions.length} · Hidratación: {detail.hydration} ml · Recuperación: {typeof detail.recovery?.score === 'number' ? `${detail.recovery.score}/100` : 'Sin datos'}</p>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Comidas: {detail.meals ?? 0}{detail.calories ? ` · ${detail.calories} kcal` : ''} · Sueño: {typeof detail.recovery?.sleepHours === 'number' ? `${detail.recovery.sleepHours}h (calidad ${detail.recovery.sleepQuality ?? '—'}/10)` : 'Sin datos'}</p>
            {detail.sessions.length>0 && (
              <div className="  rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2">
                <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Ejercicios registrados</div>
                {detail.sessions.map((s:any)=>{ const st = String(s.status || ''); const cls = st==='COMPLETED' ? 'st-completed' : st==='PARTIAL' ? 'st-partial' : st==='CANCELLED' ? 'st-cancelled' : st==='ABANDONED' ? 'st-abandoned' : 'st-pending'; return (
                  <div key={s.id} className="space-y-1">
                    <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-2"><span className={`px-2 py-0.5 rounded-lg border font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${cls}`}>{st || '—'}</span><span>{s.localDate}{s.routineName ? ` · ${s.routineName}` : ''}</span></div>
                    <div className="font-body-sm text-[12px] text-on-surface-variant pl-1">
                      {(s.exercises || []).join(' · ') || 'Sin detalle de ejercicios'}
                      {s.volume > 0 && <span> · {s.volume} kg</span>}
                      {s.setsDone > 0 && <span> · {s.setsDone}{s.setsPlanned ? `/${s.setsPlanned}` : ''} series</span>}
                      {typeof s.compliance === 'number' && <span> · {s.compliance}%</span>}
                    </div>
                  </div>
                ) })}
              </div>
            )}
            <button onClick={()=>setDetail(null)} className="w-full py-3 rounded bg-primary text-on-surface">Cerrar</button>
          </div>
        </div>
      )}

      {showCheckin && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-6" onClick={()=>setShowCheckin(false)}>
          <div onClick={e=>e.stopPropagation()} className="bg-surface border border-outline-variant rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[85vh] overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-3 pb-safe">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">favorite</span>
                <h3 className="font-headline-lg text-base font-semibold text-on-surface">Recuperación de hoy</h3>
              </div>
              <button onClick={()=>setShowCheckin(false)} aria-label="Cerrar recuperación" className="p-2 min-w-[44px] min-h-[44px] rounded-lg border border-outline-variant text-on-surface-variant hover:text-on-surface flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Solo registra tu estado. No modifica tu rutina.</p>
            <RecoveryCheckForm onSaved={()=>setShowCheckin(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
