import { useEffect, useMemo, useState } from 'react'
import { db } from '@/services/storage/db'
import { BODY_PARTS, fetchPartMap } from '@/services/exerciseGym'
import { combinedIndexOf } from '@/services/training/metrics'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type Period = '14'|'30'|'90'|'all'|'custom'
type Metric = 'peso'|'reps'|'series'|'volumen'|'mejor'|'indice'

const METRICS: [Metric,string,string][] = [
  ['peso','Peso','kg máx/día'],
  ['reps','Repeticiones','suma/día'],
  ['series','Series','conteo/día'],
  ['volumen','Volumen','kg/día'],
  ['mejor','Mejor serie','kg×reps máx'],
  ['indice','Índice','base 100'],
]

export default function Progresos(){
  const [allLogs,setAllLogs]=useState<{exerciseId:string; part:string|null; weight:number; reps:number; createdAt:string}[]>([])
  const [unmapped,setUnmapped]=useState(0)
  const [sessionCount,setSessionCount]=useState(0)
  const [bodies,setBodies]=useState<any[]>([])
  const [recovery,setRecovery]=useState<any[]>([])
  const [period,setPeriod]=useState<Period>('30')
  const [customStart,setCustomStart]=useState('')
  const [customEnd,setCustomEnd]=useState('')
  const [partSel,setPartSel]=useState('back')
  const [metric,setMetric]=useState<Metric>('volumen')
  const [selRecDate,setSelRecDate]=useState<string|null>(null)

  useEffect(()=>{
    Promise.all([
      db.setLogs.toArray().catch(()=>[]),
      db.table('setRecords').toArray().catch(()=>[]),
      db.sessions.toArray().catch(()=>[]),
      db.table('trainingSessions').toArray().catch(()=>[]),
      db.table('bodyMeasurements').toArray().catch(()=>[]),
      db.recoveryChecks.toArray().catch(()=>[]),
      fetchPartMap().catch(()=>({} as Record<string,string>)),
    ]).then(([legacyLogs, officialRecs, legacySessions, officialSessions, bodyRows, recRows, partMap])=>{
      const seen = new Set<string>()
      const logs = [
        ...(legacyLogs as any[]).map((l)=> ({ exerciseId: l.exerciseId, weight: l.weight, reps: l.reps, createdAt: l.createdAt })),
        ...(officialRecs as any[]).filter((r)=> r.status==='COMPLETED').map((r)=> ({ exerciseId: r.exerciseId, weight: r.actualWeight, reps: r.actualReps, createdAt: r.completedAt || r.createdAt })),
      ].filter((l)=>{ const k = `${l.exerciseId}|${l.createdAt}|${l.weight}|${l.reps}`; if(seen.has(k) || !l.createdAt || !l.exerciseId) return false; seen.add(k); return true })
      let unm = 0
      setAllLogs(logs.map((l)=>{ const p = (partMap as Record<string,string>)[l.exerciseId] || null; if(!p) unm++; return { ...l, part: p } }))
      setUnmapped(unm)
      const ids = new Set<string>([...(legacySessions as any[]).map((s)=> s.id), ...(officialSessions as any[]).map((s)=> s.sessionId || s.id)])
      setSessionCount(ids.size)
      setBodies((bodyRows as any[]).slice().sort((a,b)=> String(a.localDate||'').localeCompare(String(b.localDate||''))))
      setRecovery((recRows as any[]).slice().sort((a,b)=> String(a.localDate||'').localeCompare(String(b.localDate||''))))
      // parte por defecto: primera con datos reales
      const withData = BODY_PARTS.find((p)=> logs.some((l)=> (partMap as Record<string,string>)[l.exerciseId]===p))
      if(withData) setPartSel(withData)
    })
  },[])

  const inPeriod = (dateStr:string)=>{
    if(period==='all') return true
    const today = new Date().toISOString().slice(0,10)
    if(period==='custom'){
      if(customStart && dateStr < customStart) return false
      if(customEnd && dateStr > customEnd) return false
      return true
    }
    const cut = new Date(); cut.setDate(cut.getDate()-Number(period)+1)
    const cutStr = cut.toISOString().slice(0,10)
    return dateStr >= cutStr && dateStr <= today
  }

  const periodLogs = useMemo(()=> allLogs.filter(l=> inPeriod(String(l.createdAt||'').slice(0,10))), [allLogs, period, customStart, customEnd])
  const periodBodies = useMemo(()=> bodies.filter(b=> inPeriod(String(b.localDate||''))), [bodies, period, customStart, customEnd])
  const periodRec = useMemo(()=> recovery.filter(r=> inPeriod(String(r.localDate||''))), [recovery, period, customStart, customEnd])

  const weightStats = useMemo(()=>{
    const ws = periodBodies.map(b=> Number(b.weightKg)).filter(n=> !isNaN(n))
    if(ws.length===0) return null
    return { actual: ws[ws.length-1], inicial: ws[0], dif: Math.round((ws[ws.length-1]-ws[0])*10)/10, max: Math.max(...ws), min: Math.min(...ws) }
  },[periodBodies])
  const weightData = useMemo(()=> periodBodies.filter(b=> b.weightKg!=null).map(b=> ({ date: String(b.localDate).slice(5), peso: b.weightKg })),[periodBodies])

  const recData = useMemo(()=> periodRec.map(r=> ({ date: String(r.localDate).slice(5), full: String(r.localDate), indice: Number(r.score ?? 0) })),[periodRec])
  const selRec = useMemo(()=> selRecDate ? periodRec.find(r=> String(r.localDate)===selRecDate) ?? null : null,[periodRec, selRecDate])

  // ---- Parte seleccionada: solo ejercicios REALMENTE realizados (§16)
  type Agg = { w:number; r:number; s:number; v:number; best:number }
  const partLogs = useMemo(()=> periodLogs.filter(l=> l.part===partSel),[periodLogs, partSel])
  const partAgg = useMemo(()=>{
    const agg: Record<string,Agg> = {}
    for(const l of partLogs){
      const d = String(l.createdAt).slice(0,10)
      if(!agg[d]) agg[d] = { w: 0, r: 0, s: 0, v: 0, best: 0 }
      agg[d].w = Math.max(agg[d].w, l.weight)
      agg[d].r += l.reps
      agg[d].s += 1
      agg[d].v += l.weight*l.reps
      agg[d].best = Math.max(agg[d].best, l.weight*l.reps)
    }
    return agg
  },[partLogs])

  const globalData = useMemo(()=>{
    const dates = Object.keys(partAgg).sort()
    if(metric==='indice'){
      const pts = dates.map((d)=> ({ date: d, w: partAgg[d].w, r: partAgg[d].r, s: partAgg[d].s, v: partAgg[d].v }))
      const idx = combinedIndexOf(pts)
      if(!idx) return []
      return idx.map((p)=> ({ date: p.date.slice(5), valor: p.indice }))
    }
    return dates.map((d)=> ({ date: d.slice(5), valor: metric==='peso'||metric==='mejor' ? (metric==='peso' ? partAgg[d].w : partAgg[d].best) : metric==='reps' ? partAgg[d].r : metric==='series' ? partAgg[d].s : Math.round(partAgg[d].v) }))
  },[partAgg, metric])

  const perExercise = useMemo(()=>{
    const byEx: Record<string,{name:string; pts:Record<string,Agg>}> = {}
    for(const l of partLogs){
      if(!byEx[l.exerciseId]) byEx[l.exerciseId] = { name: l.exerciseId.split('/').pop()?.replace(/-/g,' ') || l.exerciseId, pts: {} }
      const d = String(l.createdAt).slice(0,10)
      const a = byEx[l.exerciseId].pts[d] || (byEx[l.exerciseId].pts[d] = { w: 0, r: 0, s: 0, v: 0, best: 0 })
      a.w = Math.max(a.w, l.weight); a.r += l.reps; a.s += 1; a.v += l.weight*l.reps; a.best = Math.max(a.best, l.weight*l.reps)
    }
    const valOf = (a:Agg)=> metric==='peso' ? a.w : metric==='reps' ? a.r : metric==='series' ? a.s : metric==='volumen' ? Math.round(a.v) : metric==='mejor' ? a.best : 0
    return Object.entries(byEx).map(([id,e])=>{
      const dates = Object.keys(e.pts).sort()
      if(metric==='indice'){
        const idx = combinedIndexOf(dates.map((d)=> ({ date: d, w: e.pts[d].w, r: e.pts[d].r, s: e.pts[d].s, v: e.pts[d].v })))
        const pts = idx ? idx.map((p)=> ({ date: p.date.slice(5), valor: p.indice })) : []
        return { id, name: e.name, pts, trend: pts.length<2 ? '○ nuevo' : pts[pts.length-1].valor>=pts[0].valor ? '↑ progresa' : '↓ disminuye' }
      }
      const pts = dates.map((d)=> ({ date: d.slice(5), valor: valOf(e.pts[d]) }))
      let trend = '○ nuevo'
      if(pts.length>=4){
        const l3 = pts.slice(-3).reduce((a,p)=>a+p.valor,0)/3
        const p3 = pts.slice(-6,-3).reduce((a,p)=>a+p.valor,0)/Math.max(1, Math.min(3, pts.length-3))
        trend = l3 > p3*1.05 ? '↑ progresa' : l3 < p3*0.95 ? '↓ disminuye' : '→ estable'
      } else if(pts.length>=2){ trend = pts[pts.length-1].valor >= pts[0].valor ? '↑ progresa' : '↓ disminuye' }
      return { id, name: e.name, pts, trend }
    }).sort((a,b)=> a.name.localeCompare(b.name))
  },[partLogs, metric])

  const metricHelp: Record<string,string> = {
    peso: 'Peso máximo del día (kg).',
    reps: 'Suma de repeticiones del día.',
    series: 'Cantidad de series del día.',
    volumen: 'Suma de kg×reps del día.',
    mejor: 'Mejor serie del día (máx kg×reps).',
    indice: 'Índice combinado: 100 × media de (peso, reps, series, volumen) normalizados contra el primer día. Componentes en 0 se excluyen. Recalculable desde el historial.',
  }

  const ES_LABELS: Record<string,string> = { energy:'Energía', fatigue:'Fatiga', pain:'Dolor', mood:'Estado de ánimo', motivation:'Motivación', perceivedExertion:'Esfuerzo percibido', stress:'Estrés', sleepQuality:'Calidad sueño', soreness:'Dolor muscular', digestion:'Digestión', hydration:'Hidratación', sleepHours:'Horas sueño', painArea:'Zona del dolor', painObservation:'Observación del dolor' }

  return (
    <div className="min-h-screen bg-bg p-4 pb-24 max-w-lg lg:max-w-3xl mx-auto space-y-4">
      <h1 className="text-section">Progreso y estadísticas</h1>
      <p className="text-aux text-textMuted">Datos reales de ejecución — sin snapshots ficticios.</p>

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

      {/* PESO + RECUPERACIÓN 50/50 */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-surface border border-border p-3">
          <div className="text-aux font-medium">PESO CORPORAL</div>
          {weightStats ? (
            <>
              <div className="grid grid-cols-5 gap-1 mt-2 text-center">
                {[['Actual',`${weightStats.actual}kg`],['Inicial',`${weightStats.inicial}kg`],['Dif.',`${weightStats.dif>0?'+':''}${weightStats.dif} kg`],['Máx',`${weightStats.max}kg`],['Mín',`${weightStats.min}kg`]].map(([k,v])=>(
                  <div key={k} className="rounded-lg bg-bg border border-border p-1"><div className="text-aux">{k}</div><div className="text-body text-sm font-medium">{v}</div></div>
                ))}
              </div>
              <div className="h-36 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weightData}>
                    <XAxis dataKey="date" tick={{fontSize:9, fill:'#A8B2B0'}} />
                    <YAxis tick={{fontSize:9, fill:'#A8B2B0'}} domain={['dataMin-1','dataMax+1']} />
                    <Tooltip contentStyle={{background:'#1F272A', border:'1px solid #263034'}}/>
                    <Line type="monotone" dataKey="peso" stroke="#38BDF0" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : <p className="text-aux text-textMuted mt-1">Sin datos suficientes — cargá peso en Perfil.</p>}
        </div>

        <div className="rounded-xl bg-surface border border-border p-3">
          <div className="text-aux font-medium">RECUPERACIÓN · índice 0–100</div>
          {recData.length>0 ? (
            <>
              <div className="text-subtitle mt-1">{recData[recData.length-1].indice}/100</div>
              <div className="h-36 mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={recData} onClick={(s:any)=>{ if(s && s.activeLabel){ const f=recData.find(r=>r.date===s.activeLabel); if(f) setSelRecDate(f.full) } }}>
                    <XAxis dataKey="date" tick={{fontSize:9, fill:'#A8B2B0'}} />
                    <YAxis tick={{fontSize:9, fill:'#A8B2B0'}} domain={[0,100]} />
                    <Tooltip contentStyle={{background:'#1F272A', border:'1px solid #263034'}}/>
                    <Line type="monotone" dataKey="indice" stroke="#21C063" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-aux text-textMuted">Tocá un punto para ver el detalle.</p>
              {selRec && (
                <div className="mt-2 rounded-xl bg-bg border border-border p-2">
                  <div className="text-aux font-medium">{String(selRec.localDate)} — Recuperación: {selRec.score}/100</div>
                  <div className="grid grid-cols-2 gap-x-3 mt-1">
                    {Object.keys(ES_LABELS).filter((k)=> selRec[k]!==undefined && selRec[k]!==null && selRec[k]!=='' && k!=='sleepHours').map((k)=>(
                      <div key={k} className="text-aux">{ES_LABELS[k]}: <span className="text-body">{String(selRec[k])}{['energy','fatigue','pain','mood','motivation','perceivedExertion','stress','sleepQuality','soreness','digestion','hydration'].includes(k) ? '/10' : ''}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : <p className="text-aux text-textMuted mt-1">Sin datos suficientes — completá el cuestionario en Recuperación.</p>}
        </div>
      </div>

      {/* PARTE MUSCULAR */}
      <div className="rounded-xl bg-surface border border-border p-3 space-y-3">
        <div>
          <div className="text-aux font-medium">PARTE MUSCULAR · VISTA GLOBAL</div>
          <select value={partSel} onChange={e=>setPartSel(e.target.value)} aria-label="Parte muscular" className="w-full mt-2 bg-bg border border-border rounded-xl p-2 text-body">
            {BODY_PARTS.map((p)=> <option key={p} value={p}>{p.toUpperCase()}</option>)}
          </select>
          <div className="grid grid-cols-3 gap-1 mt-2">
            {METRICS.map(([v,label])=>(
              <button key={v} onClick={()=>setMetric(v)} className={`py-1.5 rounded-lg text-aux border ${metric===v ? 'bg-elevated border-info text-textMain' : 'bg-bg border-border text-textMuted'}`}>{label}</button>
            ))}
          </div>
          <p className="text-aux text-textMuted mt-1">{metricHelp[metric]}</p>
        </div>

        <div>
          <div className="text-aux">Global de {partSel.toUpperCase()} — agregado de todos sus ejercicios con registros</div>
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
          {globalData.length===0 && <p className="text-aux text-textMuted mt-1">Sin datos suficientes para esta parte en el período.</p>}
        </div>

        <div>
          <div className="text-aux font-medium">EJERCICIOS REALIZADOS · mini gráficos ({metric})</div>
          {perExercise.length===0 && <p className="text-aux text-textMuted mt-1">Ningún ejercicio con registros en esta parte.</p>}
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
          {unmapped>0 && <p className="text-aux text-textMuted mt-1">{unmapped} registros sin parte atribuible (IDs legacy) — no se grafican por parte.</p>}
        </div>
      </div>

      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux">Sesiones registradas</div>
        <p className="text-body mt-1">{sessionCount} sesiones en el historial</p>
      </div>
    </div>
  )
}
