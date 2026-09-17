import { useEffect, useState } from 'react'
import { db } from '@/services/storage/db'
import { Dumbbell, Clock, AlertTriangle } from 'lucide-react'
import { AltheaCard, AltheaCardHeader, AltheaBadge, StatusTag } from '@/components/althea'

function daysInMonth(y:number,m:number){ return new Date(y,m+1,0).getDate() }

export default function Calendario(){
  const now = new Date()
  const [y,m] = [now.getFullYear(), now.getMonth()]
  const [map,setMap]=useState<Record<string,number>>({})
  const [detail,setDetail]=useState<{date:string; scheduled:string; actual:string; changed:boolean; sessions:any[]; hydration:number; recovery:any} | null>(null)
  const [cycle,setCycle]=useState<any>(null)

  useEffect(()=>{
    Promise.all([db.sessions.toArray().catch(()=>[]), db.table('trainingSessions').toArray().catch(()=>[])]).then(([legacy, official])=>{
      const c: Record<string,number> = {}
      const seen = new Set<string>()
      // Unión oficial + legacy: misma fecha+id cuenta una vez (migración copia sin borrar).
      for(const x of [...(legacy as any[]).map((s)=> ({ date: s.localDate, id: s.id })), ...(official as any[]).map((s)=> ({ date: s.calendarDate, id: s.sessionId || s.id }))]){
        const k = `${x.date}|${x.id}`
        if(seen.has(k) || !x.date) continue
        seen.add(k)
        c[x.date]=(c[x.date]||0)+1
      }
      setMap(c)
    })
    try{
      const raw=JSON.parse(localStorage.getItem('rutinas:list')||'null')
      const activeId=localStorage.getItem('rutina:activeId')
      const active=raw?.find((r:any)=>r.id===activeId) || raw?.[0]
      if(active) setCycle(active.cycle)
      else {
        db.userProfile.get('me').then(p=> setCycle((p as any)?.cycle || null))
      }
    }catch{}
  },[])

  const openDay = async (key:string)=>{
    const d=new Date(key+'T12:00:00')
    const dow=d.getDay()
    const scheduledN = cycle?.weekMap?.[dow]
    const scheduled = scheduledN ? cycle.trainingDays.find((x:any)=>x.n===scheduledN)?.name || `Día N°${scheduledN}` : 'Descanso'
    const override = localStorage.getItem(`session:override:${key}`)
    const actualN = override ? Number(override) : scheduledN
    const actual = actualN ? cycle?.trainingDays.find((x:any)=>x.n===actualN)?.name || `Día N°${actualN}` : 'Descanso'
    const changed = !!override && override!==String(scheduledN)
    const [legacySessions, officialSessions] = await Promise.all([
      db.sessions.where('localDate').equals(key).toArray().catch(()=>[]),
      db.table('trainingSessions').where('calendarDate').equals(key).toArray().catch(()=>[]),
    ])
    const sessions = [
      ...(legacySessions as any[]).map((s)=> ({ id: s.id, localDate: s.localDate, status: s.finishedAt ? 'COMPLETED' : 'ABANDONED' })),
      ...(officialSessions as any[]).map((s)=> ({ id: s.sessionId || s.id, localDate: s.calendarDate, status: s.sessionStatus, routineName: s.routineName })),
    ]
    const hyd = await db.hydrationLogs.where('localDate').equals(key).toArray().then(a=> a.reduce((s,b)=>s+b.amountMl,0)).catch(()=>0)
    const rec = await db.recoveryChecks.get(key).catch(()=>null) || JSON.parse(localStorage.getItem(`recovery:${key}`)||'null')
    setDetail({date:key, scheduled, actual, changed, sessions, hydration: hyd, recovery: rec})
  }

  const dim = daysInMonth(y,m)
  const first = new Date(y,m,1).getDay()
  const todayStr = new Date().toISOString().slice(0,10)

  return (
    <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 pb-24 max-w-[1440px] w-full mx-auto space-y-4">
      <h1 className="font-headline-lg text-lg font-semibold text-on-surface">Calendario</h1>
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
            const override=localStorage.getItem(`session:override:${key}`)
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
          {cycle?.trainingDays?.length > 0 ? (
            <div className="space-y-1.5">
              {cycle.trainingDays.slice(0, 4).map((d: any) => (
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
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Sesiones: {detail.sessions.length} · Hidratación: {detail.hydration} ml · Recuperación: {detail.recovery ? `${detail.recovery.score||'?'} /100` : '—'}</p>
            {detail.sessions.length>0 && (
              <div className="  rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3">
                <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Ejercicios registrados</div>
                {detail.sessions.map((s:any)=>{ const st = String(s.status || ''); const cls = st==='COMPLETED' ? 'st-completed' : st==='PARTIAL' ? 'st-partial' : st==='CANCELLED' ? 'st-cancelled' : st==='ABANDONED' ? 'st-abandoned' : 'st-pending'; return <div key={s.id} className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-2"><span className={`px-2 py-0.5 rounded-lg border font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${cls}`}>{st || '—'}</span><span>{s.localDate}{s.routineName ? ` · ${s.routineName}` : ''}</span></div> })}
              </div>
            )}
            <button onClick={()=>setDetail(null)} className="w-full py-3 rounded bg-primary text-on-surface">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}
