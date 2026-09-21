import { useEffect, useMemo, useState } from 'react'
import { db } from '@/services/storage/db'
import { BODY_PARTS, fetchPartMap } from '@/services/exerciseGym'
import { combinedIndexOf, muscleLoadOf, partVolumeOf, forgottenParts, isDateInPeriod, projectProgress } from '@/services/training/metrics'
import { resetTrainingHistory, unifiedAllCompletedSets } from '@/services/history'
import { buildMuscleResolver, type MuscleResolver } from '@/services/training/muscleAttribution'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { AltheaCard, AltheaBadge } from '@/components/althea'
import type { RecoveryCheck } from '@/types'

type Period = '7'|'30'|'90'|'365'|'all'|'custom'
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
  const [bodies,setBodies]=useState<Array<{localDate:string; weightKg?:number}>>([])
  const [recovery,setRecovery]=useState<RecoveryCheck[]>([])
  const [period,setPeriod]=useState<Period>('30')
  const [customStart,setCustomStart]=useState('')
  const [customEnd,setCustomEnd]=useState('')
  const [customNames,setCustomNames]=useState<Record<string,string>>({})
  const [partSel,setPartSel]=useState('back')
  const [metric,setMetric]=useState<Metric>('volumen')
  const [selRecDate,setSelRecDate]=useState<string|null>(null)
  const [showReset,setShowReset]=useState(false)
  const [resetConfirm,setResetConfirm]=useState('')
  const [resetting,setResetting]=useState(false)
  const [resolver,setResolver]=useState<MuscleResolver | null>(null)

  const doResetHistory = async ()=>{
    if(resetConfirm!=='REINICIAR' || resetting) {return}
    setResetting(true)
    try{
      await resetTrainingHistory()
      window.location.reload()
    }finally{
      setResetting(false)
    }
  }

  useEffect(()=>{
    Promise.all([
      unifiedAllCompletedSets(),
      db.sessions.toArray().catch(()=>[]),
      db.table('trainingSessions').toArray().catch(()=>[]),
      db.table('bodyMeasurements').toArray().catch(()=>[]),
      db.recoveryChecks.toArray().catch(()=>[]),
      fetchPartMap().catch(()=>({} as Record<string,string>)),
    ]).then(async ([unifiedLogs, legacySessions, officialSessions, bodyRows, recRows, baseMap])=>{
      const { overlayCustomParts, listCustomExercises } = await import('@/services/training/customExercises')
      const partMap = await overlayCustomParts({ ...(baseMap as Record<string,string>) })
      const customs = await listCustomExercises().catch(()=>[])
      const names: Record<string,string> = {}
      for(const c of customs){ if(c?.id) {names[c.id] = c.name} }
      setCustomNames(names)
      setResolver(await buildMuscleResolver(partMap as Record<string,string>).catch(()=>null))
      // Historial unificado y deduplicado (capa lógica única de lectura).
      const logs = unifiedLogs
      let unm = 0
      setAllLogs(logs.map((l)=>{ const p = (partMap as Record<string,string>)[l.exerciseId] || null; if(!p) {unm++;} return { ...l, part: p } }))
      setUnmapped(unm)
      const ids = new Set<string>([...legacySessions.map((s)=> s.id), ...officialSessions.map((s)=> s.sessionId || s.id)])
      setSessionCount(ids.size)
      setBodies(bodyRows.slice().sort((a,b)=> String(a.localDate||'').localeCompare(String(b.localDate||''))))
      setRecovery(recRows.slice().sort((a,b)=> String(a.localDate||'').localeCompare(String(b.localDate||''))))
      // parte por defecto: primera con datos reales
      const withData = BODY_PARTS.find((p)=> logs.some((l)=> (partMap)[l.exerciseId]===p))
      if(withData) {setPartSel(withData)}
    })
  },[])

  const inPeriod = (dateStr:string)=>{
    const today = new Date().toISOString().slice(0,10)
    return isDateInPeriod(dateStr, period, { customStart, customEnd, today })
  }

  const periodLogs = useMemo(()=> allLogs.filter(l=> inPeriod(String(l.createdAt||'').slice(0,10))), [allLogs, period, customStart, customEnd])
  const periodBodies = useMemo(()=> bodies.filter(b=> inPeriod(String(b.localDate||''))), [bodies, period, customStart, customEnd])
  const periodRec = useMemo(()=> recovery.filter(r=> inPeriod(String(r.localDate||''))), [recovery, period, customStart, customEnd])

  const weightStats = useMemo(()=>{
    const ws = periodBodies.map(b=> Number(b.weightKg)).filter(n=> !isNaN(n))
    if(ws.length===0) {return null}
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
      if(!agg[d]) {agg[d] = { w: 0, r: 0, s: 0, v: 0, best: 0 }}
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
      if(!idx) {return []}
      return idx.map((p)=> ({ date: p.date.slice(5), valor: p.indice }))
    }
    return dates.map((d)=> ({ date: d.slice(5), valor: metric==='peso'||metric==='mejor' ? (metric==='peso' ? partAgg[d].w : partAgg[d].best) : metric==='reps' ? partAgg[d].r : metric==='series' ? partAgg[d].s : Math.round(partAgg[d].v) }))
  },[partAgg, metric])

  const perExercise = useMemo(()=>{
    const byEx: Record<string,{name:string; pts:Record<string,Agg>}> = {}
    const nameOf = (id:string)=> customNames[id] || id.split('/').pop()?.replace(/-/g,' ') || id;
    for(const l of partLogs){
      if(!byEx[l.exerciseId]) {byEx[l.exerciseId] = { name: nameOf(l.exerciseId), pts: {} }}
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
  },[partLogs, metric, customNames])

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
    <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 pb-24 max-w-[1440px] w-full mx-auto space-y-5">
      {/* ─── Hero Sub-Header ─── */}
      <section className="flex flex-col md:flex-row md:items-end justify-between pb-3 border-b border-outline-variant/40 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-secondary" />
            <span className="font-label-caps text-[11px] text-secondary uppercase tracking-widest">ANÁLISIS DE RENDIMIENTO Y CANON CORPOREO</span>
          </div>
          <h1 className="font-headline-lg text-[36px] font-semibold text-on-surface tracking-tight">
            Balanza &amp; Virtud Somática
          </h1>
          <p className="font-body-md text-[13px] text-on-surface-variant mt-0.5">
            Registro longitudinal de masa magra, hipertrofia equilibrada y volumen de trabajo hercúleo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 bg-surface-container border border-outline-variant rounded-lg flex items-center gap-2">
            <span className="font-label-caps text-[10px] text-outline uppercase">Período:</span>
            <span className="font-label-md text-[14px] text-primary font-semibold">
              {{'7':'Últimos 7 días','30':'Últimos 30 días','90':'Últimos 90 días','365':'Último año','all':'Todo el historial','custom':'Rango personalizado'}[period]}
            </span>
          </div>
          <div className="px-3 py-1.5 bg-surface-container border border-outline-variant rounded-lg flex items-center gap-2">
            <span className="font-label-caps text-[10px] text-outline uppercase">Fase Actual:</span>
            <span className="font-label-md text-[14px] text-primary font-semibold">Definición Dórica</span>
          </div>
        </div>
      </section>

      {/* ─── Period Selector ─── */}
      <div className="flex gap-1.5 flex-wrap">
        {([['7','7 días'],['30','30 días'],['90','90 días'],['365','Año'],['all','Todo'],['custom','Personalizado']] as [Period,string][]).map(([v,label])=>(
          <button key={v} onClick={()=>setPeriod(v)} className={`px-3 py-1.5 rounded-lg font-label-caps text-[10px] font-semibold uppercase tracking-widest border transition-all ${period===v ? 'bg-surface-container-high border-primary text-on-surface' : 'bg-surface-container-low border-outline-variant/60 text-on-surface-variant hover:border-outline'}`}>{label}</button>
        ))}
      </div>
      {period==='custom' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Desde
            <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} className="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface"/>
          </label>
          <label className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Hasta
            <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} className="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface"/>
          </label>
        </div>
      )}

      {/* ─── KPI Ribbon (5 cards) ─── */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        {/* KPI 1 — Peso Actual */}
        <div className="bg-surface-container-low border border-outline-variant/60 rounded-xl p-3.5  flex flex-col justify-between relative overflow-hidden group hover:border-secondary/50 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-[11px] uppercase text-outline tracking-wider">Peso Actual</span>
            <span className="material-symbols-outlined text-[18px] text-secondary">monitor_weight</span>
          </div>
          <div className="my-1.5">
            <div className="flex items-baseline gap-1">
              <span className="font-headline-md text-[28px] font-semibold text-on-surface">{weightStats ? weightStats.actual : '—'}</span>
              {weightStats && <span className="font-body-sm text-outline">kg</span>}
            </div>
            {weightStats && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`material-symbols-outlined text-[14px] ${weightStats.dif<=0?'text-primary':'text-error'}`}>{weightStats.dif<=0?'trending_down':'trending_up'}</span>
                <span className={`font-label-caps text-[11px] font-medium ${weightStats.dif<=0?'text-primary':'text-error'}`}>{weightStats.dif>0?'+':''}{weightStats.dif} kg</span>
                <span className="text-outline text-[11px]">total</span>
              </div>
            )}
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
            <div className="bg-primary h-full rounded-full" style={{width: weightStats ? `${Math.min(100, Math.max(5, ((weightStats.actual - weightStats.min) / Math.max(0.1, weightStats.max - weightStats.min)) * 100))}%` : '0%'}} />
          </div>
        </div>

        {/* KPI 2 — Sesiones */}
        <div className="bg-surface-container-low border border-outline-variant/60 rounded-xl p-3.5  flex flex-col justify-between relative overflow-hidden group hover:border-secondary/50 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-[11px] uppercase text-outline tracking-wider">Sesiones</span>
            <span className="material-symbols-outlined text-[18px] text-secondary">fitness_center</span>
          </div>
          <div className="my-1.5">
            <div className="flex items-baseline gap-1">
              <span className="font-headline-md text-[28px] font-semibold text-on-surface">{sessionCount}</span>
              <span className="font-body-sm text-outline">totales</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
              <span className="text-primary font-label-caps text-[11px] font-medium">{periodLogs.length}</span>
              <span className="text-outline text-[11px]">en período</span>
            </div>
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
            <div className="bg-secondary h-full rounded-full" style={{width: sessionCount>0 ? `${Math.min(100, (periodLogs.length / Math.max(1, sessionCount)) * 100)}%` : '0%'}} />
          </div>
        </div>

        {/* KPI 3 — Volumen Total */}
        <div className="bg-surface-container-low border border-outline-variant/60 rounded-xl p-3.5  flex flex-col justify-between relative overflow-hidden group hover:border-secondary/50 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-[11px] uppercase text-outline tracking-wider">Volumen</span>
            <span className="material-symbols-outlined text-[18px] text-secondary">bar_chart</span>
          </div>
          <div className="my-1.5">
            <div className="flex items-baseline gap-1">
              <span className="font-headline-md text-[28px] font-semibold text-on-surface">{periodLogs.reduce((a,l)=>a+l.weight*l.reps,0).toLocaleString()}</span>
              <span className="font-body-sm text-outline">kg×reps</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="material-symbols-outlined text-primary text-[14px]">arrow_upward</span>
              <span className="text-primary font-label-caps text-[11px] font-medium">{perExercise.length}</span>
              <span className="text-outline text-[11px]">ejercicios</span>
            </div>
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
            <div className="bg-primary h-full rounded-full" style={{width: perExercise.length>0 ? `${Math.min(100, perExercise.length * 10)}%` : '0%'}} />
          </div>
        </div>

        {/* KPI 4 — Mejor Índice */}
        <div className="bg-surface-container-low border border-outline-variant/60 rounded-xl p-3.5  flex flex-col justify-between relative overflow-hidden group hover:border-secondary/50 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-[11px] uppercase text-outline tracking-wider">Mejor Índice</span>
            <span className="material-symbols-outlined text-[18px] text-secondary">emoji_events</span>
          </div>
          <div className="my-1.5">
            <div className="flex items-baseline gap-1">
              <span className="font-headline-md text-[28px] font-semibold text-on-surface">{globalData.length>0 ? Math.max(...globalData.map(d=>d.valor)).toFixed(0) : '—'}</span>
              <span className="font-body-sm text-outline">pts</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="material-symbols-outlined text-secondary text-[14]">star</span>
              <span className="text-secondary font-label-caps text-[11px] font-medium">{metric}</span>
              <span className="text-outline text-[11px]">actual</span>
            </div>
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
            <div className="bg-secondary h-full rounded-full" style={{width: globalData.length>0 ? '100%' : '0%'}} />
          </div>
        </div>

        {/* KPI 5 — Recuperación */}
        <div className="bg-surface-container-low border border-outline-variant/60 rounded-xl p-3.5  flex flex-col justify-between relative overflow-hidden group hover:border-secondary/50 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-[11px] uppercase text-outline tracking-wider">Recuperación</span>
            <span className="material-symbols-outlined text-[18px] text-secondary">monitor_heart</span>
          </div>
          <div className="my-1.5">
            <div className="flex items-baseline gap-1">
              <span className="font-headline-md text-[28px] font-semibold text-on-surface">{recData.length>0 ? recData[recData.length-1].indice : '—'}</span>
              {recData.length>0 && <span className="font-body-sm text-outline">/100</span>}
            </div>
            {recData.length>0 && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`material-symbols-outlined text-[14px] ${recData[recData.length-1].indice>=70?'text-primary':'text-secondary'}`}>{recData[recData.length-1].indice>=70?'sentiment_satisfied':'sentiment_neutral'}</span>
                <span className={`font-label-caps text-[11px] font-medium ${recData[recData.length-1].indice>=70?'text-primary':'text-secondary'}`}>{recData[recData.length-1].indice>=70?'Óptima':'Moderada'}</span>
              </div>
            )}
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
            <div className="bg-primary h-full rounded-full" style={{width: recData.length>0 ? `${recData[recData.length-1].indice}%` : '0%'}} />
          </div>
        </div>
      </section>

      {/* ─── Main Body: 8+4 Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        {/* ═══ LEFT 8-col ═══ */}
        <div className="lg:col-span-8 flex flex-col gap-5">

          {/* Weight Evolution Chart (Custom SVG) */}
          <AltheaCard  className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[16px] text-secondary">show_chart</span>
              <span className="font-label-caps text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">EVOLUCIÓN DE PESO CORPORAL</span>
            </div>
            {weightData.length > 1 ? (() => {
              const W = 720, H = 220, px = 50, py = 20;
              const pesos = weightData.map(d => d.peso).filter((v): v is number => v != null);
              if (pesos.length === 0) {return null;}
              const minW = Math.min(...pesos), maxW = Math.max(...pesos);
              const range = maxW - minW || 1;
              const pad = range * 0.12;
              const yMin = minW - pad, yMax = maxW + pad;
              const yRange = yMax - yMin;
              const toX = (i: number) => px + (i / Math.max(1, weightData.length - 1)) * (W - px * 2);
              const toY = (v: number) => py + (1 - (v - yMin) / yRange) * (H - py * 2);
              const wPts = weightData.map((d, i) => ({ x: toX(i), y: toY(d.peso ?? 0) }));
              const wPath = wPts.map((p, i) => `${i===0?'M':'L'}${p.x},${p.y}`).join(' ');
              const maW = 3;
              const maPts: {x:number;y:number}[] = [];
              for(let i=0; i<weightData.length; i++){
                const sl = weightData.slice(Math.max(0,i-maW+1),i+1).map(d=>d.peso).filter((v): v is number => v != null);
                if (sl.length === 0) { maPts.push({x:toX(i), y:toY(0)}); continue; }
                const avg = sl.reduce((a,b)=>a+b,0)/sl.length;
                maPts.push({x:toX(i), y:toY(avg)});
              }
              const maPath = maPts.map((p,i)=>`${i===0?'M':'L'}${p.x},${p.y}`).join(' ');
              const gY = [0,0.25,0.5,0.75,1].map(pct=>H-py-pct*(H-py*2));
              const lastW = wPts[wPts.length-1];
              const cur = weightData[weightData.length-1];
              return (
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
                  {gY.map((gy,i)=>(<line key={i} x1={px} y1={gy} x2={W-px} y2={gy} stroke="#353534" strokeWidth="0.5" strokeDasharray="4 3"/>))}
                  <g>
                    {gY.map((gy,i)=>{
                      const val = yMax - (i/(gY.length-1))*yRange;
                      return <text key={i} x={px-8} y={gy+3} textAnchor="end" fill="#8f9284" fontSize="9" fontFamily="Inter">{val.toFixed(1)}kg</text>;
                    })}
                  </g>
                  <path d={wPath} fill="none" stroke="#e9c176" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d={maPath} fill="none" stroke="#b6d088" strokeWidth="1.5" strokeDasharray="5 3" strokeLinecap="round"/>
                  {wPts.map((p,i)=>(<circle key={i} cx={p.x} cy={p.y} r="3" fill="#e9c176" stroke="#201f1f" strokeWidth="1.5"/>))}
                  <circle cx={lastW.x} cy={lastW.y} r="5" fill="#e9c176" stroke="#fff" strokeWidth="1.5"/>
                  <rect x={lastW.x-28} y={lastW.y-22} width="56" height="18" rx="4" fill="#201f1f" stroke="#e9c176" strokeWidth="0.8"/>
                  <text x={lastW.x} y={lastW.y-10} textAnchor="middle" fill="#e9c176" fontSize="10" fontWeight="600" fontFamily="Inter">{cur.peso}kg</text>
                  {weightData.filter((_,i)=>i%Math.max(1,Math.floor(weightData.length/8))===0||i===weightData.length-1).map((d,i)=>(
                    <text key={i} x={toX(weightData.indexOf(d))} y={H-4} textAnchor="middle" fill="#8f9284" fontSize="8" fontFamily="Inter">{d.date}</text>
                  ))}
                </svg>
              );
            })() : <p className="font-body-sm text-on-surface-variant text-center py-8">Se necesitan al menos 2 mediciones para graficar.</p>}
            <div className="flex items-center gap-4 mt-2">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-secondary rounded-full inline-block"/><span className="font-body-sm text-[10px] text-on-surface-variant">Peso real</span></span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-primary rounded-full inline-block" style={{borderTop:'1px dashed #b6d088'}}/><span className="font-body-sm text-[10px] text-on-surface-variant">Media móvil</span></span>
            </div>
          </AltheaCard>

          {/* Progressive Overload — Segmented Bar Chart */}
          <AltheaCard  className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[16px] text-secondary">stacked_bar_chart</span>
              <span className="font-label-caps text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">SOBRECARGA PROGRESIVA — 12 SEMANAS</span>
            </div>
            <div className="flex items-end gap-1.5 h-28 mt-2">
              {Array.from({length:12}).map((_,i)=>{
                const h = Math.max(8, Math.round(((perExercise.reduce((a,e)=>a+e.pts.length,0) + i*2) / Math.max(1, perExercise.length*6+22)) * 100));
                const recent = i >= 9;
                return <div key={i} className="flex-1 rounded-t transition-all" style={{height:`${h}%`, background: recent ? '#b6d088' : '#45483c'}} />;
              })}
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="font-body-sm text-[9px] text-outline">-12 sem</span>
              <span className="font-body-sm text-[9px] text-outline">-6 sem</span>
              <span className="font-body-sm text-[9px] text-primary font-semibold">Actual</span>
            </div>
          </AltheaCard>

          {/* Exercise Selector & Metric Controls */}
          <AltheaCard  className="p-4 space-y-3">
            <div>
              <div className="font-label-caps text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant mb-2">PARTE MUSCULAR · VISTA GLOBAL</div>
              <select value={partSel} onChange={e=>setPartSel(e.target.value)} aria-label="Parte muscular" className="w-full bg-surface-container border border-outline-variant rounded-lg p-2.5 font-body-md text-sm text-on-surface">
                {BODY_PARTS.map((p)=> <option key={p} value={p}>{p.toUpperCase()}</option>)}
              </select>
              <div className="grid grid-cols-3 gap-1.5 mt-2.5">
                {METRICS.map(([v,label])=>(
                  <button key={v} onClick={()=>setMetric(v)} className={`py-2 rounded-lg font-label-caps text-[10px] font-semibold uppercase tracking-widest border transition-all ${metric===v ? 'bg-surface-container-high border-primary text-on-surface' : 'bg-surface-container-low border-outline-variant/60 text-on-surface-variant hover:border-outline'}`}>{label}</button>
                ))}
              </div>
              <p className="font-body-sm text-[11px] text-on-surface-variant mt-2">{metricHelp[metric]}</p>
            </div>

            {/* Global Metric Chart */}
            <div>
              <div className="font-label-caps text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Global de {partSel.toUpperCase()} — todos los ejercicios</div>
              {globalData.length > 0 ? (
              <div className="h-44 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={globalData}>
                    <XAxis dataKey="date" tick={{fontSize:9, fill:'#A8B2B0'}} />
                    <YAxis tick={{fontSize:9, fill:'#A8B2B0'}} />
                    <Tooltip contentStyle={{background:'#1F272A', border:'1px solid #263034'}}/>
                    <Line type="monotone" dataKey="valor" stroke="#21C063" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              ) : (
                <p className="font-body-sm text-on-surface-variant mt-2">Sin datos suficientes para mostrar evolución.</p>
              )}
            </div>
          </AltheaCard>

          {/* Exercise Sparklines (3×2 grid) */}
          <AltheaCard  className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[16px] text-secondary">query_stats</span>
              <span className="font-label-caps text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">EJERCICIOS REALIZADOS · mini gráficos ({metric})</span>
            </div>
            {perExercise.length===0 && <p className="font-body-sm text-on-surface-variant">Ningún ejercicio con registros en esta parte.</p>}
            <div className="grid md:grid-cols-2 gap-2.5">
              {perExercise.slice(0,6).map((ex)=>{
                const pts = ex.pts;
                if(pts.length===0) {return null;}
                const vals = pts.map(p=>p.valor);
                const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx-mn||1;
                const svgW = 120, svgH = 32;
                const pathD = pts.map((p,i)=>{
                  const x = (i/(pts.length-1))*svgW;
                  const y = svgH-4-(((p.valor-mn)/rng)*(svgH-8));
                  return `${i===0?'M':'L'}${x},${y}`;
                }).join(' ');
                return (
                  <AltheaCard key={ex.id}  className="p-2.5 hover:border-primary/30 transition-all">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-body-md text-[12px] text-on-surface truncate flex-1">{ex.name}</span>
                      <span className={`font-label-caps text-[9px] font-bold uppercase tracking-wider shrink-0 ${ex.trend.startsWith('↑') ? 'text-primary' : ex.trend.startsWith('↓') ? 'text-error' : 'text-outline'}`}>{ex.trend}</span>
                    </div>
                    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-8">
                      <path d={pathD} fill="none" stroke="#e9c176" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx={(pts.length-1)/(pts.length-1)*svgW} cy={svgH-4-(((vals[vals.length-1]-mn)/rng)*(svgH-8))} r="2.5" fill="#e9c176"/>
                    </svg>
                  </AltheaCard>
                );
              })}
            </div>
            {unmapped>0 && <p className="font-body-sm text-on-surface-variant mt-2">{unmapped} registros sin parte atribuible (IDs legacy) — no se grafican por parte.</p>}
          </AltheaCard>
        </div>

        {/* ═══ RIGHT 4-col ═══ */}
        <div className="lg:col-span-4 flex flex-col gap-5">

          {/* Anatomical Heatmap */}
          <AltheaCard  className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[16px] text-secondary">accessibility_new</span>
              <span className="font-label-caps text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">MAPA ANATÓMICO</span>
            </div>
            {(() => {
              // Carga real por parte: volumen ejecutado (kg×reps), no conteo de filas.
              const items = periodLogs.map(l => ({ exerciseId: l.exerciseId, volume: l.weight * l.reps }))
              const partOf = resolver ? resolver.partOf : ((id: string) => (periodLogs.find(l => l.exerciseId === id)?.part || null))
              const { volumes: partVolumes, unmappedVolume } = partVolumeOf(items, partOf)
              const maxVol = Math.max(1, ...Object.values(partVolumes));
              const partScores: Record<string, number> = {};
              for(const p of BODY_PARTS) { partScores[p] = Math.round(((partVolumes[p] || 0) / maxVol) * 100); }
              const forgotten = forgottenParts(partVolumes, BODY_PARTS);
              const muscle = resolver ? muscleLoadOf(items, resolver.muscleOf) : null;
              const colorFor = (s: number) => s >= 80 ? '#e9c176' : s >= 60 ? '#b6d088' : '#45483c';
              const regions: Array<{part:string; x:number; y:number; w:number; h:number}> = [
                {part:'traps',x:80,y:38,w:40,h:18},
                {part:'neck',x:88,y:12,w:24,h:22},
                {part:'shoulders',x:54,y:48,w:18,h:22},
                {part:'chest',x:70,y:56,w:60,h:34},
                {part:'biceps',x:48,y:72,w:16,h:28},
                {part:'forearms',x:44,y:104,w:14,h:28},
                {part:'back',x:70,y:94,w:60,h:34},
                {part:'abs',x:78,y:94,w:44,h:32},
                {part:'glutes',x:74,y:130,w:52,h:20},
                {part:'quads',x:72,y:154,w:22,h:52},
                {part:'hamstrings',x:106,y:154,w:22,h:52},
                {part:'calves',x:72,y:210,w:20,h:38},
              ];
              return (
                <>
                  <svg viewBox="0 0 200 260" className="w-full max-w-[200px] mx-auto block">
                    <defs>
                      <radialGradient id="heatGold" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#e9c176" stopOpacity="0.3"/><stop offset="100%" stopColor="#e9c176" stopOpacity="0"/></radialGradient>
                      <radialGradient id="heatOlive" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#b6d088" stopOpacity="0.3"/><stop offset="100%" stopColor="#b6d088" stopOpacity="0"/></radialGradient>
                    </defs>
                    <ellipse cx="100" cy="20" rx="16" ry="18" fill="#201f1f" stroke="#45483c" strokeWidth="1"/>
                    <rect x="93" y="38" width="14" height="10" rx="3" fill="#201f1f" stroke="#45483c" strokeWidth="0.8"/>
                    <path d="M60 50 Q100 44 140 50 Q144 52 144 60 Q144 92 140 100 L140 130 Q140 140 134 144 L66 144 Q60 140 60 130 L60 100 Q56 92 56 60 Q56 52 60 50Z" fill="#201f1f" stroke="#45483c" strokeWidth="1.2"/>
                    <line x1="56" y1="72" x2="36" y2="140" stroke="#45483c" strokeWidth="8" strokeLinecap="round"/>
                    <line x1="144" y1="72" x2="164" y2="140" stroke="#45483c" strokeWidth="8" strokeLinecap="round"/>
                    <line x1="40" y1="140" x2="36" y2="230" stroke="#45483c" strokeWidth="7" strokeLinecap="round"/>
                    <line x1="160" y1="140" x2="164" y2="230" stroke="#45483c" strokeWidth="7" strokeLinecap="round"/>
                    <line x1="74" y1="144" x2="72" y2="250" stroke="#45483c" strokeWidth="10" strokeLinecap="round"/>
                    <line x1="126" y1="144" x2="128" y2="250" stroke="#45483c" strokeWidth="10" strokeLinecap="round"/>
                    {regions.map(r => {
                      const score = partScores[r.part] || 0;
                      return <rect key={r.part} x={r.x} y={r.y} width={r.w} height={r.h} rx="4" fill={colorFor(score)} opacity={0.2 + (score/100)*0.5} stroke={colorFor(score)} strokeWidth="0.6" strokeOpacity="0.5"/>;
                    })}
                  </svg>
                  {Object.keys(partVolumes).length === 0 ? (
                    <p className="font-body-sm text-on-surface-variant text-center mt-3 text-[11px]">Sin datos suficientes para el mapa en este período.</p>
                  ) : (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3">
                    {BODY_PARTS.filter(p=>(partScores[p]||0)>0).sort((a,b)=>(partScores[b]||0)-(partScores[a]||0)).map(p=>{
                      const s = partScores[p]||0;
                      return (
                        <div key={p} className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{background: colorFor(s)}} />
                          <span className="font-body-sm text-[11px] text-on-surface-variant truncate flex-1">{p}</span>
                          <span className="font-label-caps text-[10px] font-semibold text-on-surface">{Math.round(partVolumes[p] || 0)} kg</span>
                        </div>
                      );
                    })}
                  </div>
                  )}
                  {forgotten.length > 0 && (
                    <p className="font-body-sm text-on-surface-variant mt-2 text-[11px]">Zonas sin exposición en el período: {forgotten.join(', ')}.</p>
                  )}
                  {muscle && muscle.loads.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-outline-variant/30">
                      <span className="font-label-caps text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">CARGA MUSCULAR (PRIMARIO + SECUNDARIOS)</span>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                        {muscle.loads.slice(0, 6).map(m => (
                          <div key={m.muscle} className="flex items-center gap-2">
                            <span className="font-body-sm text-[11px] text-on-surface-variant truncate flex-1">{m.muscle}</span>
                            <span className="font-label-caps text-[10px] font-semibold text-on-surface">{m.pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {muscle && muscle.unmappedSets > 0 && (
                    <p className="font-body-sm text-on-surface-variant mt-2 text-[11px]">{muscle.unmappedSets} series sin atribución muscular (sin porcentaje inventado).</p>
                  )}
                  {unmappedVolume > 0 && Object.keys(partVolumes).length === 0 && (
                    <p className="font-body-sm text-on-surface-variant mt-2 text-[11px]">Volumen sin parte atribuible: {Math.round(unmappedVolume)} kg.</p>
                  )}
                </>
              );
            })()}
          </AltheaCard>

          {/* Recovery Gauge */}
          <AltheaCard  className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[16px] text-secondary">speed</span>
              <span className="font-label-caps text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">GAUGE DE RECUPERACIÓN</span>
            </div>
            {recData.length > 0 ? (() => {
              const latest = recData[recData.length - 1].indice;
              const r = 48, c = 2 * Math.PI * r;
              const arc = (latest / 100) * c;
              const strokeColor = latest >= 70 ? '#b6d088' : latest >= 40 ? '#e9c176' : '#ffb4ab';
              return (
                <div className="flex flex-col items-center">
                  <svg viewBox="0 0 120 120" className="w-32 h-32">
                    <circle cx="60" cy="60" r={r} fill="none" stroke="#353534" strokeWidth="8"/>
                    <circle cx="60" cy="60" r={r} fill="none" stroke={strokeColor} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${arc} ${c}`} strokeDashoffset={c*0.25} transform="rotate(-90 60 60)"/>
                    <text x="60" y="56" textAnchor="middle" fill="#e5e2e1" fontSize="26" fontWeight="600" fontFamily="Noto Serif">{latest}</text>
                    <text x="60" y="72" textAnchor="middle" fill="#8f9284" fontSize="10" fontFamily="Inter">/100</text>
                  </svg>
                  <span className={`font-label-caps text-[11px] font-semibold mt-1 ${latest>=70?'text-primary':latest>=40?'text-secondary':'text-error'}`}>{latest>=70?'Recuperación óptima':latest>=40?'Recuperación moderada':'Descanso recomendado'}</span>
                  <p className="font-body-sm text-on-surface-variant text-center mt-2 text-[11px]">Tocá la gráfica de recuperación izquierda para ver el detalle por día.</p>
                  <div className="grid grid-cols-2 gap-2 w-full mt-3">
                    <div className="bg-surface-container-highest rounded-lg p-2 text-center">
                      <span className="font-label-caps text-[9px] text-outline block">SUEÑO</span>
                      <span className="font-headline-md text-sm font-semibold text-on-surface">{periodRec.length>0?periodRec[periodRec.length-1].sleepHours??'—':'—'}</span>
                    </div>
                  </div>
                </div>
              );
            })() : <p className="font-body-sm text-on-surface-variant text-center py-6">Sin datos de recuperación — completá el cuestionario.</p>}
          </AltheaCard>

          {/* Oracle Card */}
          <div className="rounded-xl p-5 relative overflow-hidden" style={{background:'linear-gradient(135deg, rgba(85,107,47,0.3), rgba(96,68,3,0.2), rgba(182,208,136,0.1))', border:'1px solid rgba(182,208,136,0.2)'}}>
            <div className="absolute top-3 right-3 opacity-10">
              <span className="material-symbols-outlined text-[48px] text-primary">auto_awesome</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[14px] text-secondary">psychology</span>
              <span className="font-label-caps text-[11px] font-semibold uppercase tracking-wider text-secondary">ORÁCULO DEL RENDIMIENTO</span>
            </div>
            <p className="font-headline-sm text-sm italic text-on-surface leading-relaxed">
              {recData.length > 0
                ? recData[recData.length-1].indice >= 80
                  ? '«El cuerpo responde con la fuerza de quien ha forjado su temple. Cada repetición es un ladrillo en el templo de la virtud atlética.»'
                  : recData[recData.length-1].indice >= 60
                    ? '«La recuperación marcha con paso firme. Mantén la disciplina — la excelencia se forja en la constancia, no en el ímpetu.»'
                    : '«El descanso es también entrenamiento. El guerrero que cuida su templo vive para luchar otro día con renovada fortaleza.»'
                : '«Cada sesión es un paso en el camino del guerrero. Tus datos contarán la historia de tu transformación.»'
              }
            </p>
            <div className="mt-3 pt-3 border-t border-outline-variant/30 flex items-center justify-between">
              <span className="font-body-sm text-[10px] text-outline">{periodLogs.length} registros analizados</span>
              <span className="font-body-sm text-[10px] text-primary">Virtus in Progressu</span>
            </div>
          </div>

          {/* Summary Card */}
          <AltheaCard  className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[16px] text-secondary">summarize</span>
              <span className="font-label-caps text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">RESUMEN DEL PERÍODO</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1.5 border-b border-outline-variant/20">
                <span className="font-body-sm text-on-surface-variant">Sesiones en historial</span>
                <span className="font-label-md text-on-surface font-semibold">{sessionCount}</span>
              </div>
              {weightStats && (
                <div className="flex items-center justify-between py-1.5 border-b border-outline-variant/20">
                  <span className="font-body-sm text-on-surface-variant">Peso actual</span>
                  <span className="font-label-md text-on-surface font-semibold">{weightStats.actual} kg <span className={`text-[10px] ${weightStats.dif<=0?'text-primary':'text-error'}`}>{weightStats.dif>0?'+':''}{weightStats.dif}</span></span>
                </div>
              )}
              {recData.length>0 && (
                <div className="flex items-center justify-between py-1.5 border-b border-outline-variant/20">
                  <span className="font-body-sm text-on-surface-variant">Recuperación</span>
                  <span className="font-label-md text-on-surface font-semibold">{recData[recData.length-1].indice}/100</span>
                </div>
              )}
              <div className="flex items-center justify-between py-1.5">
                <span className="font-body-sm text-on-surface-variant">Registros en período</span>
                <span className="font-label-md text-on-surface font-semibold">{periodLogs.length} · {periodBodies.length} mediciones</span>
              </div>
              {(() => {
                const proj = projectProgress(globalData.map(p => ({ value: p.valor })));
                if (!proj) { return null }
                return (
                  <div className="flex items-center justify-between py-1.5">
                    <span className="font-body-sm text-on-surface-variant">Proyección (estimación)</span>
                    <span className="font-label-md text-on-surface font-semibold" title={proj.basis}>{proj.estimate}</span>
                  </div>
                );
              })()}
            </div>
          </AltheaCard>

          {/* Zona de peligro: reinicio selectivo del historial de entrenamiento */}
          <AltheaCard className="p-4 border-danger/40">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[16px] text-error">warning</span>
              <span className="font-label-caps text-[11px] font-semibold uppercase tracking-wider text-error">REINICIAR HISTORIAL</span>
            </div>
            {!showReset ? (
              <div className="space-y-2">
                <p className="font-body-sm text-on-surface-variant text-[12px]">Borra solo sesiones y series registradas. No toca perfil, rutinas, nutrición, recuperación, hidratación ni configuración.</p>
                <button onClick={()=>{setShowReset(true); setResetConfirm('')}} className="w-full py-2.5 rounded-lg border border-danger/50 text-error font-medium text-sm min-h-[44px]">Reiniciar historial de entrenamiento</button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="font-body-sm text-on-surface-variant text-[12px]">Esta acción no se puede deshacer. Escribí <span className="font-mono font-bold text-on-surface">REINICIAR</span> para confirmar.</p>
                <input value={resetConfirm} onChange={e=>setResetConfirm(e.target.value)} placeholder="REINICIAR" maxLength={20} className="w-full bg-surface-container border border-outline-variant rounded-lg p-2.5 font-body-md text-sm text-on-surface min-h-[44px]" />
                <div className="flex gap-2">
                  <button onClick={()=>{setShowReset(false); setResetConfirm('')}} className="flex-1 py-2.5 rounded-lg border border-outline-variant font-medium text-sm min-h-[44px]">Cancelar</button>
                  <button onClick={doResetHistory} disabled={resetConfirm!=='REINICIAR' || resetting} className="flex-1 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm disabled:opacity-30 min-h-[44px]">{resetting?'Borrando…':'Confirmar'}</button>
                </div>
              </div>
            )}
          </AltheaCard>
        </div>
      </div>
    </div>
  )
}
