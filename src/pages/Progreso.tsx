import { useEffect, useMemo, useState } from 'react'
import { db } from '@/services/storage/db'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type Period = '14'|'30'|'90'|'all'|'custom'
type Metric = 'volumen'|'mejor'|'series'

export default function Progresos(){
  const [allLogs,setAllLogs]=useState<{exerciseId:string; muscle:string; weight:number; reps:number; createdAt:string}[]>([])
  const [muscles,setMuscles]=useState<string[]>([])
  const [sessionCount,setSessionCount]=useState(0)
  const [bodies,setBodies]=useState<any[]>([])
  const [period,setPeriod]=useState<Period>('30')
  const [customStart,setCustomStart]=useState('')
  const [customEnd,setCustomEnd]=useState('')
  const [muscleSel,setMuscleSel]=useState('')
  const [metric,setMetric]=useState<Metric>('volumen')

  useEffect(()=>{
    Promise.all([
      db.setLogs.toArray().catch(()=>[]),
      db.table('setRecords').toArray().catch(()=>[]),
      db.exercises.toArray().catch(()=>[]),
      db.sessions.toArray().catch(()=>[]),
      db.table('trainingSessions').toArray().catch(()=>[]),
      db.table('bodyMeasurements').toArray().catch(()=>[]),
    ]).then(([legacyLogs, officialRecs, exs, legacySessions, officialSessions, bodyRows])=>{
      const exMap:Record<string,string> = {}
      ;(exs as any[]).forEach(e=> exMap[e.id]=e.groupMain || 'otros')
      const seen = new Set<string>()
      const logs = [
        ...(legacyLogs as any[]).map((l)=> ({ exerciseId: l.exerciseId, muscle: exMap[l.exerciseId] || 'otros', weight: l.weight, reps: l.reps, createdAt: l.createdAt })),
        ...(officialRecs as any[]).filter((r)=> r.status==='COMPLETED').map((r)=> ({ exerciseId: r.exerciseId, muscle: exMap[r.exerciseId] || 'otros', weight: r.actualWeight, reps: r.actualReps, createdAt: r.completedAt || r.createdAt })),
      ].filter((l)=>{ const k = `${l.exerciseId}|${l.createdAt}|${l.weight}|${l.reps}`; if(seen.has(k) || !l.createdAt) return false; seen.add(k); return true })
      setAllLogs(logs)
      const ms = Array.from(new Set(logs.map(l=> l.muscle))).sort()
      setMuscles(ms)
      if(!muscleSel && ms.length>0) setMuscleSel(ms[0])
      const ids = new Set<string>([...(legacySessions as any[]).map((s)=> s.id), ...(officialSessions as any[]).map((s)=> s.sessionId || s.id)])
      setSessionCount(ids.size)
      setBodies((bodyRows as any[]).slice().sort((a,b)=> String(a.localDate||'').localeCompare(String(b.localDate||''))))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  const inPeriod = (dateStr:string)=>{
    if(period==='all') return true
    const today = new Date().toISOString().slice(0,10)
    if(period==='custom'){
      if(customStart && dateStr < customStart) return false
      if(customEnd && dateStr > customEnd) return false
      return true
    }
    const days = Number(period)
    const cut = new Date(); cut.setDate(cut.getDate()-days+1)
    const cutStr = cut.toISOString().slice(0,10)
    return dateStr >= cutStr && dateStr <= today
  }

  const periodLogs = useMemo(()=> allLogs.filter(l=> inPeriod(String(l.createdAt||'').slice(0,10))), [allLogs, period, customStart, customEnd])
  const periodBodies = useMemo(()=> bodies.filter(b=> inPeriod(String(b.localDate||''))), [bodies, period, customStart, customEnd])

  const volumeData = useMemo(()=>{
    const byDate: Record<string,number> = {}
    for(const l of periodLogs){ const d=String(l.createdAt).slice(0,10); byDate[d]=(byDate[d]||0)+l.weight*l.reps }
    return Object.entries(byDate).sort(([a],[b])=> a.localeCompare(b)).map(([date,volumen])=>({date:date.slice(5), volumen: Math.round(volumen)}))
  },[periodLogs])

  const stats = useMemo(()=>{
    const totalVol = Math.round(periodLogs.reduce((a,l)=>a+l.weight*l.reps,0))
    const pr = periodLogs.length ? Math.max(...periodLogs.map(l=>l.weight)) : 0
    return { sesiones: sessionCount, volumen: totalVol, pr: periodLogs.length ? `${pr} kg` : '—' }
  },[periodLogs, sessionCount])

  const weightStats = useMemo(()=>{
    const ws = periodBodies.map(b=> Number(b.weightKg)).filter(n=> !isNaN(n))
    if(ws.length===0) return null
    const max = Math.max(...ws), min = Math.min(...ws)
    return { actual: ws[ws.length-1], inicial: ws[0], dif: Math.round((ws[ws.length-1]-ws[0])*10)/10, max, min, n: ws.length }
  },[periodBodies])

  const weightData = useMemo(()=> periodBodies.filter(b=> b.weightKg!=null).map(b=> ({ date: String(b.localDate).slice(5), peso: b.weightKg })),[periodBodies])

  const muscleLogs = useMemo(()=> periodLogs.filter(l=> l.muscle===muscleSel),[periodLogs, muscleSel])

  const globalData = useMemo(()=>{
    const agg: Record<string,{vol:number; best:number; series:number}> = {}
    for(const l of muscleLogs){
      const d = String(l.createdAt).slice(0,10)
      if(!agg[d]) agg[d] = { vol: 0, best: 0, series: 0 }
      agg[d].vol += l.weight*l.reps
      agg[d].best = Math.max(agg[d].best, l.weight)
      agg[d].series += 1
    }
    return Object.entries(agg).sort(([a],[b])=> a.localeCompare(b)).map(([date,v])=>({
      date: date.slice(5),
      valor: metric==='volumen' ? Math.round(v.vol) : metric==='mejor' ? v.best : v.series,
    }))
  },[muscleLogs, metric])

  const perExercise = useMemo(()=>{
    const byEx: Record<string,{name:string; pts:{date:string;valor:number}[]}> = {}
    for(const l of muscleLogs){
      if(!byEx[l.exerciseId]) byEx[l.exerciseId] = { name: l.exerciseId.split('/').pop()?.replace(/-/g,' ') || l.exerciseId, pts: [] }
      byEx[l.exerciseId].pts.push({ date: String(l.createdAt).slice(0,10), valor: Math.round(l.weight*l.reps) })
    }
    return Object.entries(byEx).map(([id, e])=>{
      const agg: Record<string,number> = {}
      for(const p of e.pts) agg[p.date]=(agg[p.date]||0)+p.valor
      const pts = Object.entries(agg).sort(([a],[b])=> a.localeCompare(b)).map(([date,valor])=>({ date: date.slice(5), valor }))
      // tendencia: media últimos 3 vs 3 anteriores
      let trend = '○ nuevo'
      if(pts.length>=4){
        const last3 = pts.slice(-3).reduce((a,p)=>a+p.valor,0)/3
        const prev3 = pts.slice(-6,-3).reduce((a,p)=>a+p.valor,0)/Math.max(1, Math.min(3, pts.length-3))
        if(last3 > prev3*1.05) trend = '↑ progresa'
        else if(last3 < prev3*0.95) trend = '↓ disminuye'
        else trend = '→ estable'
      } else if(pts.length>=2){
        trend = pts[pts.length-1].valor >= pts[0].valor ? '↑ progresa' : '↓ disminuye'
      }
      return { id, name: e.name, pts, trend }
    }).sort((a,b)=> a.name.localeCompare(b.name))
  },[muscleLogs])

  const metricUnit = metric==='volumen' ? 'kg' : metric==='mejor' ? 'kg máx' : 'series'

  return (
    <div className="min-h-screen bg-bg p-4 pb-24 max-w-lg lg:max-w-3xl mx-auto space-y-4">
      <h1 className="text-section">Progreso y estadísticas</h1>
      <p className="text-aux text-textMuted">Datos reales de ejecución — sin snapshots ficticios.</p>

      {/* Período único para toda la sección */}
      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux mb-2">Período</div>
        <div className="flex gap-1 flex-wrap">
          {([['14','14 días'],['30','30 días'],['90','90 días'],['all','Todo'],['custom','Personalizado']] as [Period,string][]).map(([v,label])=>(
            <button key={v} onClick={()=>setPeriod(v)} className={`px-3 py-1.5 rounded-lg text-aux border ${period===v ? 'bg-elevated border-info text-textMain' : 'bg-bg border-border text-textMuted'}`}>{label}</button>
          ))}
        </div>
        {period==='custom' && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <label className="text-aux">Desde<input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} className="w-full mt-1 bg-bg border border-border rounded-xl p-2 text-body"/></label>
            <label className="text-aux">Hasta<input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} className="w-full mt-1 bg-bg border border-border rounded-xl p-2 text-body"/></label>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux">Volumen en el período</div>
        <div className="h-44 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={volumeData.length?volumeData:[{date:'—',volumen:0}]}>
              <XAxis dataKey="date" tick={{fontSize:9, fill:'#A8B2B0'}} />
              <YAxis tick={{fontSize:9, fill:'#A8B2B0'}} />
              <Tooltip contentStyle={{background:'#1F272A', border:'1px solid #263034'}}/>
              <Line type="monotone" dataKey="volumen" stroke="#21C063" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {volumeData.length===0 && <p className="text-aux text-textMuted mt-1">Sin registros en este período.</p>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-surface border border-border p-3 text-center"><div className="text-aux">Sesiones</div><div className="text-subtitle">{stats.sesiones}</div></div>
        <div className="rounded-xl bg-surface border border-border p-3 text-center"><div className="text-aux">Volumen</div><div className="text-subtitle">{stats.volumen} kg</div></div>
        <div className="rounded-xl bg-surface border border-border p-3 text-center"><div className="text-aux">PR</div><div className="text-subtitle">{stats.pr}</div></div>
      </div>

      {/* PESO CORPORAL dedicado */}
      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux font-medium">PESO CORPORAL</div>
        {weightStats ? (
          <>
            <div className="grid grid-cols-5 gap-1 mt-2 text-center">
              {[['Actual',`${weightStats.actual} kg`],['Inicial',`${weightStats.inicial} kg`],['Dif.',`${weightStats.dif>0?'+':''}${weightStats.dif} kg`],['Máx',`${weightStats.max} kg`],['Mín',`${weightStats.min} kg`]].map(([k,v])=>(
                <div key={k} className="rounded-lg bg-bg border border-border p-1.5"><div className="text-aux">{k}</div><div className="text-body font-medium">{v}</div></div>
              ))}
            </div>
            <div className="h-44 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightData}>
                  <XAxis dataKey="date" tick={{fontSize:9, fill:'#A8B2B0'}} />
                  <YAxis tick={{fontSize:9, fill:'#A8B2B0'}} domain={['dataMin-1','dataMax+1']} />
                  <Tooltip contentStyle={{background:'#1F272A', border:'1px solid #263034'}}/>
                  <Line type="monotone" dataKey="peso" stroke="#38BDF0" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-aux text-textMuted mt-1">{weightStats.n} registros en el período · Grasa {(():string=>{ const b=periodBodies.filter(x=>x.bodyFatPct!=null).pop(); return b ? `${b.bodyFatPct}%` : '—' })()} · Cintura {(():string=>{ const b=periodBodies.filter(x=>x.waistCm!=null).pop(); return b ? `${b.waistCm} cm` : '—' })()}</p>
          </>
        ) : <p className="text-aux text-textMuted mt-1">Sin registros de peso en este período — cargá peso en Perfil.</p>}
      </div>

      {/* GRUPO MUSCULAR: global + minis */}
      <div className="rounded-xl bg-surface border border-border p-3 space-y-3">
        <div>
          <div className="text-aux font-medium">GRUPO MUSCULAR · VISTA GLOBAL</div>
          <div className="flex gap-2 mt-2">
            <select value={muscleSel} onChange={e=>setMuscleSel(e.target.value)} aria-label="Grupo muscular" className="flex-1 bg-bg border border-border rounded-xl p-2 text-body">
              {muscles.map(m=> <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="flex gap-1 mt-2">
            {([['volumen','Volumen'],['mejor','Mejor serie'],['series','Series']] as [Metric,string][]).map(([v,label])=>(
              <button key={v} onClick={()=>setMetric(v)} className={`flex-1 py-1.5 rounded-lg text-aux border ${metric===v ? 'bg-elevated border-info text-textMain' : 'bg-bg border-border text-textMuted'}`}>{label}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-aux">Global del grupo · {muscleSel.toUpperCase()} · {metric} ({metricUnit}) — agregado de todos sus ejercicios</div>
          <div className="h-44 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={globalData.length?globalData:[{date:'—',valor:0}]}>
                <XAxis dataKey="date" tick={{fontSize:9, fill:'#A8B2B0'}} />
                <YAxis tick={{fontSize:9, fill:'#A8B2B0'}} />
                <Tooltip contentStyle={{background:'#1F272A', border:'1px solid #263034'}}/>
                <Line type="monotone" dataKey="valor" stroke="#21C063" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {globalData.length===0 && <p className="text-aux text-textMuted mt-1">Sin historial para este grupo en el período.</p>}
        </div>

        <div>
          <div className="text-aux font-medium">POR EJERCICIO · mini gráficos individuales</div>
          {perExercise.length===0 && <p className="text-aux text-textMuted mt-1">Sin ejercicios con historial en este grupo.</p>}
          <div className="grid md:grid-cols-2 gap-2 mt-2">
            {perExercise.map((ex)=>(
              <div key={ex.id} className="rounded-xl bg-bg border border-border p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body text-sm truncate">{ex.name}</span>
                  <span className={`text-aux shrink-0 ${ex.trend.startsWith('↑') ? 'st-success-text' : ex.trend.startsWith('↓') ? 'st-error-text' : ''}`}>{ex.trend}</span>
                </div>
                <div className="h-16 mt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ex.pts}>
                      <XAxis dataKey="date" tick={{fontSize:8, fill:'#A8B2B0'}} interval="preserveStartEnd" />
                      <YAxis tick={{fontSize:8, fill:'#A8B2B0'}} width={28} />
                      <Tooltip contentStyle={{background:'#1F272A', border:'1px solid #263034'}}/>
                      <Line type="monotone" dataKey="valor" stroke="#38BDF0" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux">Historial y cambios de rutina</div>
        <p className="text-body mt-1">Rutina actual: {(():string=>{ try{ return JSON.parse(localStorage.getItem('rutina:meta')||'null')?.name || 'Rutina 1'}catch{return 'Rutina 1'}})()} · frecuencia {stats.sesiones} sesiones</p>
      </div>
    </div>
  )
}
