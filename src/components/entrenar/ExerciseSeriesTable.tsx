import { useState, useEffect, useCallback } from 'react'

const EX_STATE_KEY = (today:string, exId:string) => `exstate:${today}:${exId}`

export default function ExerciseSeriesTable({ exerciseId, today, sets, plannedReps, plannedWeight, onComplete, onSkipSet, onAddSet, logs, initialCompleted, initialSkipped }:{ exerciseId:string; today:string; sets:number; plannedReps:number; plannedWeight:number; onComplete:(idx:number,w:number,r:number,neg?:any,obs?:string)=>void; onSkipSet?:(idx:number)=>void; onAddSet?:()=>void; logs:any[]; initialCompleted?:Record<number,{weight:number;reps:number}>; initialSkipped?:number[] }){
  const [refs,setRefs]=useState<Record<number,any>>({})
  const [weights,setWeights]=useState<Record<number,number>>({})
  const [reps,setReps]=useState<Record<number,number>>({})
  const [checks,setChecks]=useState<Record<number,boolean>>({})
  const [negEnabled,setNegEnabled]=useState(false)
  const [negReps,setNegReps]=useState('')
  const [negWeight,setNegWeight]=useState('')
  const [obs,setObs]=useState('')
  const [exInfo,setExInfo]=useState<any>(null)
  const [loaded,setLoaded]=useState(false)
  const [lastSession,setLastSession]=useState<{date:string; sets:{setNumber:number;weight:number;reps:number}[]} | null>(null)
  const [prevSessions,setPrevSessions]=useState<{date:string; totalVolume:number; setsCount:number}[]>([])

  const loadPersisted = useCallback(()=>{
    try{
      const raw = localStorage.getItem(EX_STATE_KEY(today, exerciseId))
      if(raw){
        const s = JSON.parse(raw)
        if(s.weights) setWeights(s.weights)
        if(s.reps) setReps(s.reps)
        if(s.checks) setChecks(s.checks)
        if(typeof s.negEnabled==='boolean') setNegEnabled(s.negEnabled)
        if(s.negReps) setNegReps(s.negReps)
        if(s.negWeight) setNegWeight(s.negWeight)
        if(s.obs) setObs(s.obs)
      }
    }catch{}
  }, [today, exerciseId])

  const savePersisted = useCallback((state:any)=>{
    try{ localStorage.setItem(EX_STATE_KEY(today, exerciseId), JSON.stringify(state)) }catch{}
  }, [today, exerciseId])

  useEffect(()=>{
    const load=async()=>{
      const { getLastSerieWithSource, getLastExecutionByExercise, unifiedCompletedSets } = await import('@/services/history')
      try{
        if(exerciseId.startsWith('custom/')){
          const { getCustomExercise } = await import('@/services/training/customExercises')
          const c = await getCustomExercise(exerciseId)
          if(c) setExInfo({ muscle: c.muscle, secondaryMuscles: c.secondaryMuscles, muscleBreakdown: c.muscleBreakdown })
        }
        const { fetchOne } = await import('@/services/exerciseGym')
        if(exerciseId.includes('/') && !exerciseId.startsWith('custom/')){
          const [m,slug]=exerciseId.split('/')
          const ex:any = await fetchOne(m,slug).catch(()=>null)
          if(ex) setExInfo(ex)
        }
      }catch{}
      const obj:Record<number,any>={}
      for(let i=0;i<sets;i++){
        const r=await getLastSerieWithSource(exerciseId, i+1)
        obj[i]=r
      }
      setRefs(obj)
      const last = await getLastExecutionByExercise(exerciseId)
      if(last) setLastSession(last)
      const all = await unifiedCompletedSets(exerciseId)
      const bySession = new Map<string, {totalVolume:number; setsCount:number; date:string}>()
      for(const s of all){
        const key = s.sessionId || s.createdAt.slice(0,10)
        const existing = bySession.get(key)
        const vol = s.weight * s.reps
        if(existing){ existing.totalVolume += vol; existing.setsCount++ }
        else bySession.set(key, { totalVolume: vol, setsCount: 1, date: s.createdAt.slice(0,10) })
      }
      const sessions = Array.from(bySession.values()).sort((a,b)=> b.date.localeCompare(a.date)).slice(0,5)
      setPrevSessions(sessions)
      const baseW:Record<number,number>={}, baseR:Record<number,number>={}, baseC:Record<number,boolean>={}
      for(let i=0;i<sets;i++){ baseW[i]=plannedWeight; baseR[i]=plannedReps; baseC[i]=false }
      setWeights(baseW); setReps(baseR); setChecks(baseC)
      loadPersisted()
      try{
        if(initialCompleted) for(const k of Object.keys(initialCompleted)){ const i=Number(k); baseW[i]=initialCompleted[i].weight; baseR[i]=initialCompleted[i].reps; baseC[i]=true }
        if(initialSkipped) for(const i of initialSkipped){ baseC[i]=false }
        setWeights({...baseW}); setReps({...baseR}); setChecks({...baseC})
      }catch{ /* noop */ }
      setLoaded(true)
    }
    load()
  },[exerciseId, sets, plannedReps, plannedWeight, loadPersisted, initialCompleted, initialSkipped])

  const parseKg = (v:string)=>{
    const n = Number(v)
    if(isNaN(n)) return 0
    return Math.round(n*10)/10
  }

  const persistAll = useCallback(()=>{
    savePersisted({ weights, reps, checks, negEnabled, negReps, negWeight, obs })
  }, [weights, reps, checks, negEnabled, negReps, negWeight, obs, savePersisted])

  useEffect(()=>{ if(loaded) persistAll() }, [weights, reps, checks, negEnabled, negReps, negWeight, obs, loaded, persistAll])

  if(!loaded) return <div className="space-y-3"><div className="h-8 bg-surface-container-low/90 border border-outline-variant rounded-lg animate-pulse"/></div>

  const romanNumerals = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX']
  const nextUncompletedIdx = Array.from({length:sets}).find((_, i)=> !checks[i] && !(initialSkipped||[]).includes(i))

  return (
    <div className="space-y-3">
      <div className="rounded bg-surface-container/60 border border-outline-variant/30 p-2">
        <div className="flex flex-wrap gap-1">
          {(() => {
            const bd = (exInfo as any)?.muscleBreakdown
            const pcts = (Array.isArray(bd) && bd.length > 0)
              ? bd.map((b:any)=> ({ n: b.name, p: b.pct }))
              : (()=>{ const m = exInfo?.muscle || 'General'; const secs = exInfo?.secondaryMuscles || []; return secs.length===0 ? [{n:m,p:100}] : secs.length===1 ? [{n:m,p:60},{n:secs[0],p:40}] : [{n:m,p:60},{n:secs[0],p:30},{n:secs[1],p:10}] })()
            return pcts.filter(x=>x.n).map(x=> <span key={x.n} className={`px-2 py-0.5 rounded-full border font-label-caps text-[10px] uppercase ${x.p>=60?'bg-primary-container/20 border-primary/40 text-primary':'bg-surface-container-high/30 border-outline-variant/40 text-on-surface-variant'}`}>{x.n}: {x.p}%</span>)
          })()}
        </div>
      </div>
      {lastSession && (
        <div className="rounded-lg bg-surface-container/60 border border-outline-variant/30 px-3 py-2">
          <span className="font-label-caps text-[10px] uppercase text-outline tracking-wider">Última sesión: <span className="text-on-surface font-semibold">{lastSession.date}</span></span>
          <span className="ml-2 text-[11px] text-on-surface-variant">({lastSession.sets.length} series)</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/40 text-outline font-label-caps text-[9px] uppercase tracking-wider">
              <th className="pb-2 px-1 font-semibold w-8">S</th>
              <th className="pb-2 px-2 font-semibold">ANTERIOR</th>
              <th className="pb-2 px-2 font-semibold text-center">REPS</th>
              <th className="pb-2 px-2 font-semibold text-center">KG</th>
              <th className="pb-2 px-1 text-center font-semibold w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {Array.from({length:sets}).map((_,si)=>{
              const ref:any = refs[si]
              const prevSet = lastSession?.sets.find(s=> s.setNumber === si+1)
              const w = weights[si] ?? plannedWeight
              const r = reps[si] ?? plannedReps
              const isDone = !!checks[si]
              const isActive = !isDone && si === nextUncompletedIdx
              const isSkipped = (initialSkipped||[]).includes(si)
              const roman = romanNumerals[si] || `${si+1}`
              return (
                <tr key={si} className={`transition-colors ${
                  isDone
                    ? 'bg-primary-container/5'
                    : isActive
                      ? 'bg-secondary/5'
                      : ''
                }`}>
                  <td className={`py-2.5 px-1 font-headline-sm text-[15px] ${isDone ? 'text-primary' : isActive ? 'text-secondary' : 'text-outline'}`}>
                    {roman}
                  </td>
                  <td className="py-2.5 px-2 text-[12px] text-on-surface-variant whitespace-nowrap">
                    {prevSet ? (
                      <span>{prevSet.weight}kg × {prevSet.reps}</span>
                    ) : ref && !ref.isSeed ? (
                      <span>{ref.weight}kg × {ref.reps}</span>
                    ) : (
                      <span className="text-outline">sin datos</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {isDone ? (
                      <span className="block text-center font-title-md text-[14px] text-on-surface font-medium">{r}</span>
                    ) : (
                      <input
                        type="number"
                        value={r}
                        onChange={e=>setReps({...reps, [si]: Number(e.target.value)})}
                        className="w-full px-2 py-1.5 bg-surface-container-highest border border-outline-variant/40 rounded font-title-md text-[14px] text-on-surface text-center"
                        placeholder="reps"
                        inputMode="numeric"
                        aria-label={`reps serie ${si+1}`}
                      />
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {isDone ? (
                      <span className="block text-center font-title-md text-[14px] text-on-surface font-medium">{w}</span>
                    ) : (
                      <input
                        type="number"
                        step="0.1"
                        value={w}
                        onChange={e=>setWeights({...weights, [si]: parseKg(e.target.value)})}
                        className="w-full px-2 py-1.5 bg-surface-container-highest border border-outline-variant/40 rounded font-title-md text-[14px] text-on-surface text-center"
                        placeholder="kg"
                        inputMode="decimal"
                        aria-label={`kilogramos serie ${si+1}`}
                      />
                    )}
                  </td>
                  <td className="py-2.5 px-1 text-center">
                    {isDone ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-primary-container text-on-primary-container border border-primary">
                        <span className="material-symbols-outlined text-[14px]">done</span>
                      </span>
                    ) : isSkipped ? (
                      <span className="text-[9px] text-outline">skip</span>
                    ) : (
                      <button onClick={(e)=>{
                        setChecks({...checks, [si]: true})
                        try{ e.currentTarget.classList.remove('flash-confirm'); void e.currentTarget.offsetWidth; e.currentTarget.classList.add('flash-confirm') }catch{ /* noop */ }
                        onComplete(si, parseKg(String(w)), r, negEnabled?{reps:Number(negReps)||0,weight:parseKg(negWeight)}:undefined, obs||undefined)
                      }} className="px-2 py-1 rounded bg-secondary text-on-secondary-fixed font-label-caps text-[9px] uppercase font-bold shadow-sm transition-all active:scale-95">
                        OK
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {onAddSet ? <button onClick={onAddSet} className="w-full py-2 rounded bg-surface-container border border-outline-variant/60 font-label-caps text-[10px] uppercase text-on-surface-variant transition-colors hover:border-secondary/40">+ Agregar serie</button> : null}
      {prevSessions.length > 1 && (
        <div className="rounded-lg bg-surface-container/40 border border-outline-variant/20 px-3 py-2">
          <span className="font-label-caps text-[9px] uppercase text-outline tracking-wider block mb-1.5">Progreso reciente</span>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {prevSessions.map((s,i)=>{
              const delta = i < prevSessions.length-1 ? s.totalVolume - prevSessions[i+1].totalVolume : 0
              return (
                <div key={i} className="flex-shrink-0 text-center">
                  <div className="text-[10px] text-on-surface-variant">{s.date.slice(5)}</div>
                  <div className="font-title-md text-[13px] text-on-surface font-medium">{Math.round(s.totalVolume)}kg</div>
                  {i < prevSessions.length-1 && (
                    <div className={`text-[9px] font-semibold ${delta > 0 ? 'text-primary' : delta < 0 ? 'text-danger' : 'text-outline'}`}>
                      {delta > 0 ? '+' : ''}{Math.round(delta)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div className="rounded-xl bg-surface-container/60 border border-outline-variant/30 p-3">
        <label className="flex items-center gap-3 font-body-md text-[15px] text-on-surface font-medium">
          <input type="checkbox" checked={negEnabled} onChange={e=>setNegEnabled(e.target.checked)} className="w-5 h-5 accent-primary" />
          Negativas
        </label>
        <div className={`grid grid-cols-2 gap-3 mt-3 ${!negEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
          <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">repes
            <input type="number" placeholder="repes" value={negReps} onChange={e=>setNegReps(e.target.value)} disabled={!negEnabled} className="w-full mt-2 bg-surface-container border border-outline-variant rounded p-3 font-body-md text-[15px] text-on-surface text-center text-lg disabled:opacity-50" inputMode="numeric"/>
          </label>
          <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">kilogramos
            <input type="number" step="0.1" placeholder="kilogramos" value={negWeight} onChange={e=>setNegWeight(e.target.value)} disabled={!negEnabled} className="w-full mt-2 bg-surface-container border border-outline-variant rounded p-3 font-body-md text-[15px] text-on-surface text-center text-lg disabled:opacity-50" inputMode="decimal"/>
          </label>
        </div>
      </div>
      <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider font-medium">Observaciones
        <textarea placeholder="RPE, molestias, técnica..." value={obs} onChange={e=>setObs(e.target.value)} rows={3} className="w-full mt-2 bg-surface-container border border-outline-variant rounded p-3 font-body-md text-[15px] text-on-surface leading-relaxed"/>
      </label>
    </div>
  )
}
