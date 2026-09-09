import { useEffect, useState } from 'react'
import { db } from '@/services/storage/db'

function daysInMonth(y:number,m:number){ return new Date(y,m+1,0).getDate() }

export default function Calendario(){
  const now = new Date()
  const [y,m] = [now.getFullYear(), now.getMonth()]
  const [map,setMap]=useState<Record<string,number>>({})
  const [detail,setDetail]=useState<{date:string; scheduled:string; actual:string; changed:boolean; sessions:any[]; hydration:number; recovery:any} | null>(null)
  const [cycle,setCycle]=useState<any>(null)

  useEffect(()=>{
    db.sessions.toArray().then(s=>{
      const c: Record<string,number> = {}
      s.forEach(x=> c[x.localDate]=(c[x.localDate]||0)+1)
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
    const sessions = await db.sessions.where('localDate').equals(key).toArray()
    const hyd = await db.hydrationLogs.where('localDate').equals(key).toArray().then(a=> a.reduce((s,b)=>s+b.amountMl,0)).catch(()=>0)
    const rec = await db.recoveryChecks.get(key).catch(()=>null) || JSON.parse(localStorage.getItem(`recovery:${key}`)||'null')
    setDetail({date:key, scheduled, actual, changed, sessions, hydration: hyd, recovery: rec})
  }

  const dim = daysInMonth(y,m)
  const first = new Date(y,m,1).getDay()
  const todayStr = new Date().toISOString().slice(0,10)

  return (
    <div className="min-h-screen bg-bg p-4 pb-24 max-w-lg mx-auto space-y-4">
      <h1 className="text-section">Calendario</h1>
      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-body font-medium mb-3">{now.toLocaleDateString('es',{month:'long', year:'numeric'})}</div>
        <div className="grid grid-cols-7 gap-1 text-aux text-center">
          {['D','L','M','M','J','V','S'].map(d=> <div key={d} className="text-textMuted py-1">{d}</div>)}
          {Array.from({length:first}).map((_,i)=> <div key={'e'+i}/>)}
          {Array.from({length:dim}).map((_,i)=>{
            const d=i+1; const key=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
            const has=map[key]
            const override=localStorage.getItem(`session:override:${key}`)
            const isToday=key===todayStr
            return (
              <button key={d} onClick={()=>openDay(key)} className={`py-2 rounded-xl text-aux border ${has?'bg-action text-textMain border-action':'bg-bg border-border text-body'} ${isToday?'ring-2 ring-info':''} ${override?' ring-1 ring-amber-500':''}`}>
                {d}{has ? <span className="block text-[8px]">✓ {override?'↻':''}</span> : <span className="block text-[8px]">&nbsp;</span>}
              </button>
            )
          })}
        </div>
        <div className="text-aux text-textMuted mt-3 flex gap-2"><span className="w-3 h-3 bg-action rounded-full inline-block"></span> completado <span className="w-3 h-3 bg-amber-500 rounded-full inline-block ml-2"></span> cambiado</div>
      </div>

      {detail && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={()=>setDetail(null)}>
          <div onClick={e=>e.stopPropagation()} className="bg-bg border-t border-border rounded-t-2xl w-full max-w-lg max-h-[75vh] overflow-auto p-4 space-y-3">
            <h3 className="text-subtitle">{detail.date} — {detail.actual}</h3>
            <p className="text-aux">Programado: {detail.scheduled} {detail.changed && `→ Realizado: ${detail.actual} (cambiado)`}</p>
            <p className="text-aux">Sesiones: {detail.sessions.length} · Hidratación: {detail.hydration} ml · Recuperación: {detail.recovery ? `${detail.recovery.score||'?'} /100` : '—'}</p>
            {detail.sessions.length>0 && (
              <div className="rounded-xl bg-surface border border-border p-3">
                <div className="text-aux">Ejercicios registrados</div>
                {detail.sessions.map((s:any)=> <div key={s.id} className="text-aux">{s.localDate} — {s.id.slice(0,8)}</div>)}
              </div>
            )}
            <button onClick={()=>setDetail(null)} className="w-full py-3 rounded-xl bg-action text-textMain">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}
