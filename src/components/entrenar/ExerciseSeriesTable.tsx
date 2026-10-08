import { useState, useEffect, useCallback, useRef } from 'react'
import { toDateKey } from '@/utils/dates'
import { parseLoad, toKg, fromKg, formatLoad, roundLoad } from '@/services/training/loadModel'

const EX_STATE_KEY = (today:string, exId:string) => `exstate:${today}:${exId}`

/**
 * Peso informado → número para la UI. `0`, `null`, `undefined` o basura = "sin
 * peso" (input vacío, guardado null). Nunca se muestra 0 como si fuera un peso.
 */
const kgOrNull = (v:number|null|undefined):number|null=>{
  if(v === null || v === undefined) {return null}
  const n = Number(v)
  if(!Number.isFinite(n) || n === 0) {return null}
  return Math.round(n*10)/10
}

export default function ExerciseSeriesTable({ exerciseId, today, sets, plannedReps, plannedWeight, plannedSets, planMeta, onComplete, onAddSet, logs, initialCompleted, initialSkipped }:{ exerciseId:string; today:string; sets:number; plannedReps:number; plannedWeight:number|null; plannedSets?: Array<{ order: number; reps: number; weight: number|null; setType?: string }>; planMeta?: { restSec?: number; tempo?: string; rir?: number; rpe?: number; notes?: string }; onComplete:(idx:number,w:number|null,r:number,neg?:any,obs?:string,loadText?:string)=>void; onSkipSet?:(idx:number)=>void; onAddSet?:()=>void; logs:any[]; initialCompleted?:Record<number,{weight:number|null;reps:number}>; initialSkipped?:number[] }){
  const [refs,setRefs]=useState<Record<number,any>>({})
  const [weights,setWeights]=useState<Record<number,number|null>>({})
  const [reps,setReps]=useState<Record<number,number|null>>({})
  const [checks,setChecks]=useState<Record<number,boolean>>({})
  const [negEnabled,setNegEnabled]=useState(false)
  const [negReps,setNegReps]=useState('')
  const [negWeight,setNegWeight]=useState('')
  // Observación POR SERIE: cada serie tiene la suya; al confirmarla se limpia
  // el borrador para que el texto no se pegue en las series siguientes.
  const [obsBySet,setObsBySet]=useState<Record<number,string>>({})
  // Unidad de carga visible (KG/LB). El dato canónico almacenado es SIEMPRE kg:
  // loadModel convierte solo con equivalencia conocida y nunca reescribe el dato.
  const [loadUnit,setLoadUnit]=useState<'KG'|'LB'>(()=>{ try{ return localStorage.getItem('althea:loadUnit') === 'LB' ? 'LB' : 'KG' }catch{ return 'KG' } })
  // Texto tipeado por fila (visible mientras se escribe; al salir se re-normaliza).
  const [weightText,setWeightText]=useState<Record<number,string>>({})
  // Aviso por fila: carga sin equivalencia kg (no se inventa, no se guarda).
  const [loadHint,setLoadHint]=useState<Record<number,string>>({})
  // Valor + unidad originales tipeados con unidad distinta de kg (se preservan).
  const [loadOriginal,setLoadOriginal]=useState<Record<number,string>>({})
  const [exInfo,setExInfo]=useState<any>(null)
  const [loaded,setLoaded]=useState(false)
  const [lastSession,setLastSession]=useState<{date:string; sets:{setNumber:number;weight:number;reps:number}[]} | null>(null)
  const [prevSessions,setPrevSessions]=useState<{date:string; totalVolume:number; setsCount:number}[]>([])

  const migrateDraftOnce = useCallback(()=>{
    try{
      const raw = localStorage.getItem(EX_STATE_KEY(today, exerciseId))
      if(!raw) {return null}
      localStorage.removeItem(EX_STATE_KEY(today, exerciseId))
      return JSON.parse(raw)
    }catch{ return null }
  }, [today, exerciseId])

  // Filas donde el usuario tipeó valores a mano: se conservan ante cualquier
  // re-inicialización (cambios de initialCompleted/initialSkipped/log).
  const dirtyRef = useRef<{w:Set<number>, r:Set<number>}>({w:new Set(), r:new Set()})

  const getPlannedForIndex = useCallback((index:number) => {
    const order = index + 1
    const exact = plannedSets?.find((p) => Number(p.order) === order)
    const legacy = plannedSets?.find((p) => Number(p.order) === index)
    const positional = plannedSets?.[index]
    const source = exact ?? legacy ?? positional
    // Plan por serie manda: si la serie dice "sin peso" (null) se respeta y NO
    // se rellena ni con 0 ni con el peso de nivel ejercicio. El 0 también significa
    // "sin peso" (dato legado): jamás se muestra ni se guarda 0 como peso real.
    if(source){
      return {
        reps: Number(source.reps ?? plannedReps ?? 0),
        weight: kgOrNull(source.weight),
        setType: source.setType,
      }
    }
    return {
      reps: Number(plannedReps ?? 0),
      weight: kgOrNull(plannedWeight),
      setType: undefined,
    }
  }, [plannedSets, plannedReps, plannedWeight])

  useEffect(()=>{
    const load=async()=>{
      const { getLastSerieWithSource, getLastExecutionByExercise, unifiedCompletedSets } = await import('@/services/history')
      try{
        if(exerciseId.startsWith('custom/')){
          const { getCustomExercise } = await import('@/services/training/customExercises')
          const c = await getCustomExercise(exerciseId)
          if(c) {setExInfo({ muscle: c.muscle, secondaryMuscles: c.secondaryMuscles, muscleBreakdown: c.muscleBreakdown })}
        }
        const { fetchOne } = await import('@/services/exerciseGym')
        if(exerciseId.includes('/') && !exerciseId.startsWith('custom/')){
          const [m,slug]=exerciseId.split('/')
          const ex:any = await fetchOne(m,slug).catch(()=>null)
          if(ex) {setExInfo(ex)}
        }
      }catch{}
      const obj:Record<number,any>={}
      for(let i=0;i<sets;i++){
        const r=await getLastSerieWithSource(exerciseId, i+1)
        obj[i]=r
      }
      setRefs(obj)
      const last = await getLastExecutionByExercise(exerciseId)
      if(last) {setLastSession(last)}
      const all = await unifiedCompletedSets(exerciseId)
      const bySession = new Map<string, {totalVolume:number; setsCount:number; date:string}>()
      for(const s of all){
        const key = s.sessionId || toDateKey(s.createdAt)
        const existing = bySession.get(key)
        const vol = s.weight * s.reps
        if(existing){ existing.totalVolume += vol; existing.setsCount++ }
        else {bySession.set(key, { totalVolume: vol, setsCount: 1, date: toDateKey(s.createdAt) })}
      }
      const sessions = Array.from(bySession.values()).sort((a,b)=> b.date.localeCompare(a.date)).slice(0,5)
      setPrevSessions(sessions)
      const baseW:Record<number,number|null>={}, baseR:Record<number,number|null>={}, baseC:Record<number,boolean>={}
        for(let i=0;i<sets;i++){
        const planned = getPlannedForIndex(i)
        // null (sin peso informado) se respeta: nunca se convierte en 0.
        baseW[i]= planned.weight ?? null
        baseR[i]=planned.reps
        baseC[i]=false
      }
      try{
        if(initialCompleted) {for(const k of Object.keys(initialCompleted)){ const i=Number(k); baseW[i]=kgOrNull(initialCompleted[i].weight); baseR[i]=initialCompleted[i].reps; baseC[i]=true }}
        if(initialSkipped) {for(const i of initialSkipped){ baseC[i]=false }}
        const draft = migrateDraftOnce()
        if(draft){
          if(draft.weights) {for(const k of Object.keys(draft.weights)){ const i=Number(k); if(!baseC[i]) {const v=Number(draft.weights[k]); if(!isNaN(v) && v !== 0) {baseW[i]=v}} }}
          if(draft.reps) {for(const k of Object.keys(draft.reps)){ const i=Number(k); if(!baseC[i]) {const v=Number(draft.reps[k]); if(!isNaN(v)) {baseR[i]=v}} }}
        }
        // Re-inicialización sin borrar lo tipeado: lo que el usuario editó a mano
        // (dirty) se conserva mientras esa fila no esté confirmada.
        setWeights(prev=>{
          const next = {...baseW}
          for(const i of dirtyRef.current.w){ if(!baseC[i] && (i in prev)) { next[i] = prev[i] } }
          return next
        })
        setReps(prev=>{
          const next = {...baseR}
          for(const i of dirtyRef.current.r){ if(!baseC[i] && (i in prev)) { next[i] = prev[i] } }
          return next
        })
        setChecks(baseC)
      }catch{ /* noop */ }
      setLoaded(true)
    }
    load()
  },[exerciseId, sets, plannedReps, plannedWeight, plannedSets, getPlannedForIndex, migrateDraftOnce, initialCompleted, initialSkipped])

  // Al cambiar de ejercicio no se heredan observaciones ni cargas de otro.
  // Declarado ANTES de la semilla: el orden de los efectos limpia y luego siembra.
  useEffect(()=>{ setObsBySet({}); setWeightText({}); setLoadHint({}); setLoadOriginal({}) }, [exerciseId])

  // Semilla POR SERIE desde lo ya confirmado en BD (observation de cada SetRecord).
  useEffect(()=>{
    setObsBySet(prev=>{
      const next = {...prev}
      let changed = false
      logs.forEach((l, i)=>{
        if(!l) {return}
        const recorded = (l as { observation?: string; obs?: string }).observation ?? (l as { obs?: string }).obs
        if(recorded && !next[i]) { next[i] = String(recorded); changed = true }
      })
      return changed ? next : prev
    })
  },[logs])

  // Al cambiar de ejercicio, las marcas "editado a mano" no aplican más.
  useEffect(()=>{ dirtyRef.current = {w:new Set(), r:new Set()} }, [exerciseId])

  type WeightValue = number | null;

  const parseKg = (value: string): WeightValue => {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) { return null }

    const parsed = Number(normalized);

    if (!Number.isFinite(parsed) || parsed === 0) {
      return null;
    }

    return parsed;
  }

  // Cambia la unidad visible. Solo afecta la presentación: el estado en kg no se
  // toca, por eso se limpia el texto tipeado y se vuelve a derivar de kg.
  const toggleLoadUnit = (u:'KG'|'LB')=>{
    setLoadUnit(u); setWeightText({}); setLoadHint({})
    try{ localStorage.setItem('althea:loadUnit', u) }catch{ /* noop */ }
  }

  // kg almacenado → texto en la unidad visible (loadModel: equivalencia conocida).
  const displayWeight = (kgValue:number|null):string=>{
    if(kgValue === null || kgValue === undefined) {return ''}
    if(loadUnit === 'KG') {return String(kgValue)}
    const v = fromKg(kgValue, 'LB')
    return v === null ? String(kgValue) : String(roundLoad(v))
  }

  if(!loaded) {return <div className="space-y-3"><div className="h-8 bg-surface-container-low/90 border border-outline-variant rounded-lg animate-pulse"/></div>}

  const romanNumerals = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX']
  // Índice de la próxima serie sin confirmar (-1 = todas confirmadas).
  const nextUncompletedIdx = Array.from({length:sets}).findIndex((_, i)=> !checks[i] && !(initialSkipped||[]).includes(i))

  return (
    <div className="space-y-3">
      <div className="rounded bg-surface-container/60 border border-outline-variant/30 p-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 min-w-0">
          {(() => {
            const bd = (exInfo as any)?.muscleBreakdown
            const pcts = (Array.isArray(bd) && bd.length > 0) ? bd.map((b:any)=> ({ n: b.name, p: b.pct })) : []
            return pcts.filter(x=>x.n).map(x=> <span key={x.n} className={`px-2 py-0.5 rounded-full border font-label-caps text-[10px] uppercase ${x.p>=60?'bg-primary-container/20 border-primary/40 text-primary':'bg-surface-container-high/30 border-outline-variant/40 text-on-surface-variant'}`}>{x.n}: {x.p}%</span>)
          })()}
        </div>
        <div className="flex shrink-0 rounded border border-outline-variant/40 overflow-hidden" role="group" aria-label="Unidad de carga">
          {(['KG','LB'] as const).map(u=>(
            <button key={u} type="button" onClick={()=>toggleLoadUnit(u)} aria-pressed={loadUnit===u}
              className={`px-2.5 py-2 min-h-[36px] font-label-caps text-[10px] uppercase tracking-wider transition-colors ${loadUnit===u?'bg-secondary text-on-secondary-fixed':'text-outline hover:bg-surface-container-high/40'}`}>{u}</button>
          ))}
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
                <th className="pb-2 px-1 font-semibold w-8">N.º</th>
                <th className="pb-2 px-2 font-semibold">Última vez</th>
                <th className="pb-2 px-2 font-semibold text-center">Repeticiones</th>
                <th className="pb-2 px-2 font-semibold text-center">{loadUnit === 'KG' ? 'Kg' : 'Lb'}</th>
                <th className="pb-2 px-1 text-center font-semibold w-12"></th>
              </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {Array.from({length:sets}).map((_,si)=>{
              const ref:any = refs[si]
              const prevSet = lastSession?.sets.find(s=> s.setNumber === si+1)
              const w = weights[si]
              // null = campo vacío: NO se convierte en 0 (se usa el plan al confirmar).
              const r = reps[si] ?? plannedReps
              const repsRaw = reps[si] === undefined ? plannedReps : reps[si]
              const isDone = !!checks[si]
              const isActive = !isDone && si === nextUncompletedIdx
              const isSkipped = (initialSkipped||[]).includes(si)
              const roman = romanNumerals[si] || `${si+1}`
              const planFor = getPlannedForIndex(si)
              // Texto visible: lo tipeado (mientras se edita) o el kg almacenado
              // convertido a la unidad de carga activa.
              const displayW = weightText[si] !== undefined ? weightText[si] : displayWeight(w)
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
                    {planFor.setType && planFor.setType !== 'NORMAL' && (
                      <span className="block text-[8px] font-label-caps uppercase leading-tight text-secondary/90" title={`Tipo de serie: ${planFor.setType}`}>{String(planFor.setType).replace(/_/g,' ')}</span>
                    )}
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
                    <div className="flex flex-col items-center">
                      <input
                        type="number"
                        value={repsRaw ?? ''}
                        onChange={e=>{
                          const v = e.target.value
                          dirtyRef.current.r.add(si)
                          setReps({...reps, [si]: v === '' ? null : Number(v)})
                        }}
                        className="w-full min-w-[64px] px-2 py-2.5 min-h-[48px] bg-surface-container-highest border border-outline-variant/40 rounded text-[14px] text-on-surface text-center"
                        inputMode="numeric"
                        aria-label={`repeticiones serie ${si+1}`}
                      />
                      {r !== planFor.reps && <span className="mt-0.5 text-[9px] font-label-caps uppercase text-outline whitespace-nowrap">plan {planFor.reps}</span>}
                    </div>
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex flex-col items-center">
                      <input
                        type="text"
                        value={displayW}
                        onChange={e=>{
                          const val = e.target.value
                          dirtyRef.current.w.add(si)
                          setWeightText((prev)=>({...prev, [si]: val}))
                          if(val.trim() === '') {
                            setWeights((prev)=>({...prev, [si]: null}))
                            setLoadHint((prev)=>({...prev, [si]: ''}))
                            setLoadOriginal((prev)=>{ const n={...prev}; delete n[si]; return n })
                            return
                          }
                          // loadModel: parsea "45 lb", "2 placas", "80"… y convierte
                          // a kg SOLO con equivalencia conocida.
                          const typedUnit = /[a-zA-Z]/.test(val)
                          let load = parseLoad(val)
                          // Número solo con la unidad visible en LB = libras (el
                          // teclado no trae sufijo, la unidad activa manda).
                          if(!typedUnit && loadUnit === 'LB' && load.unit === 'KG') { load = { value: load.value, unit: 'LB' } }
                          const kgValue = toKg(load)
                          if(kgValue === null) {
                            // Sin equivalencia: no se inventa kg. El último peso
                            // válido se conserva y la fila avisa.
                            setLoadHint((prev)=>({...prev, [si]: formatLoad(load)}))
                            return
                          }
                          setLoadHint((prev)=>({...prev, [si]: ''}))
                          setLoadOriginal((prev)=>{
                            const n = {...prev}
                            if(typedUnit && load.unit !== 'KG') { n[si] = val.trim() } else { delete n[si] }
                            return n
                          })
                          const rounded = roundLoad(kgValue)
                          if(rounded === 0) {
                            // 0 tecleado = sin peso (mismo camino que borrar el campo)
                            setWeights((prev)=>({...prev, [si]: null}))
                            setWeightText((prev)=>{ const n={...prev}; delete n[si]; return n })
                            return
                          }
                          setWeights((prev)=>({...prev, [si]: rounded}))
                        }}
                        onBlur={()=>{ setWeightText((prev)=>{ const n={...prev}; delete n[si]; return n }) }}
                        className="w-full min-w-[64px] px-2 py-2.5 min-h-[48px] bg-surface-container-highest border border-outline-variant/40 rounded text-[14px] text-on-surface text-center"
                        inputMode="decimal"
                        aria-label={`kilogramos serie ${si+1}`}
                      />
                      {loadHint[si] && <span className="mt-0.5 text-[9px] font-label-caps uppercase text-error text-center whitespace-nowrap" title="Sin equivalencia en kg: no se guarda como peso">{loadHint[si]}</span>}
                      {!loadHint[si] && loadOriginal[si] && w !== null && <span className="mt-0.5 text-[9px] font-label-caps uppercase text-outline whitespace-nowrap">{loadOriginal[si]} → {w} kg</span>}
                      {w !== null && w !== planFor.weight && <span className="mt-0.5 text-[9px] font-label-caps uppercase text-outline whitespace-nowrap">{planFor.weight === null ? 'plan sin peso' : `plan ${planFor.weight}kg`}</span>}
                    </div>
                  </td>
                  <td className="py-2.5 px-1 text-center">
                    {isDone && !isSkipped ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-primary-container text-on-primary-container border border-primary">
                        <span className="material-symbols-outlined text-[14px]">done</span>
                      </span>
                    ) : isSkipped ? (
                      <span className="text-[9px] text-outline">omitida</span>
                    ) : null}
                    <div className="flex flex-col items-center gap-1 mt-1">
                      <button onClick={(e)=>{
                        setChecks({...checks, [si]: true})
                        try{ e.currentTarget.classList.remove('flash-confirm'); void e.currentTarget.offsetWidth; e.currentTarget.classList.add('flash-confirm') }catch{ /* noop */ }
                        const obsDeEstaSerie = obsBySet[si]
                        // La observación confirmada queda ligada a ESTA serie y el
                        // borrador se limpia para no arrastrarlo a la siguiente.
                        if(obsDeEstaSerie) { setObsBySet(prev=> ({ ...prev, [si]: '' })) }
                        onComplete(si, w, r, negEnabled?{reps:Number(negReps)||0,weight:parseKg(negWeight)}:undefined, obsDeEstaSerie||undefined, loadOriginal[si])
                      }} aria-label={`Confirmar serie ${si+1}`} className="px-4 py-3 min-h-[48px] min-w-[48px] rounded-lg bg-secondary text-on-secondary-fixed font-label-caps text-[11px] uppercase font-bold shadow-sm transition-all active:scale-95">
                        OK
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {onAddSet ? <button onClick={onAddSet} className="w-full min-h-[48px] py-2 rounded bg-surface-container border border-outline-variant/60 font-label-caps text-[10px] uppercase text-on-surface-variant transition-colors hover:border-secondary/40">+ Agregar serie</button> : null}
      {prevSessions.length > 1 && (
        <div className="rounded-lg bg-surface-container/40 border border-outline-variant/20 px-3 py-2">
          <span className="font-label-caps text-[9px] uppercase text-outline tracking-wider block mb-1.5">Progreso reciente</span>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {prevSessions.map((s,i)=>{
              const delta = i < prevSessions.length-1 ? s.totalVolume - prevSessions[i+1].totalVolume : 0
              return (
                <div key={i} className="flex-shrink-0 text-center">
                  <div className="text-[10px] text-on-surface-variant">{s.date.slice(5)}</div>
                  <div className="text-[13px] text-on-surface font-medium">{Math.round(s.totalVolume)}kg</div>
                  {i < prevSessions.length-1 && (
                    <div className={`text-[9px] font-semibold ${delta > 0 ? 'text-primary' : delta < 0 ? 'text-error' : 'text-outline'}`}>
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
          <input type="checkbox" checked={negEnabled} onChange={e=>setNegEnabled(e.target.checked)} className="w-6 h-6 accent-primary" />
          Negativas
        </label>
        <div className={`grid grid-cols-2 gap-3 mt-3 ${!negEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
          <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">repeticiones
            <input type="number" value={negReps} onChange={e=>setNegReps(e.target.value)} disabled={!negEnabled} className="w-full mt-2 bg-surface-container border border-outline-variant rounded p-3 font-body-md text-[15px] text-on-surface text-center text-lg disabled:opacity-50" inputMode="numeric"/>
          </label>
          <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider">kilogramos
            <input type="number" step="0.1" placeholder="kilogramos" value={negWeight} onChange={e=>setNegWeight(e.target.value)} disabled={!negEnabled} className="w-full mt-2 bg-surface-container border border-outline-variant rounded p-3 font-body-md text-[15px] text-on-surface text-center text-lg disabled:opacity-50" inputMode="decimal"/>
          </label>
        </div>
      </div>
      {planMeta && (planMeta.restSec || planMeta.tempo || planMeta.rir !== undefined || planMeta.rpe !== undefined || planMeta.notes) ? (
        <div className="rounded-lg bg-surface-container/60 border border-outline-variant/30 px-3 py-2 flex flex-wrap gap-x-3 gap-y-1 items-center">
          <span className="font-label-caps text-[9px] uppercase tracking-wider text-outline">Plan</span>
          {planMeta.restSec ? <span className="text-[11px] text-on-surface-variant">Descanso {planMeta.restSec}s</span> : null}
          {planMeta.tempo ? <span className="text-[11px] text-on-surface-variant">Tempo {planMeta.tempo}</span> : null}
          {planMeta.rir !== undefined ? <span className="text-[11px] text-on-surface-variant">RIR {planMeta.rir}</span> : null}
          {planMeta.rpe !== undefined ? <span className="text-[11px] text-on-surface-variant">RPE {planMeta.rpe}</span> : null}
          {planMeta.notes ? <span className="text-[11px] text-on-surface-variant italic">{planMeta.notes}</span> : null}
        </div>
      ) : null}
      {(() => {
        const activeObsIdx = nextUncompletedIdx >= 0 ? nextUncompletedIdx : Math.max(0, sets - 1)
        const obs = obsBySet[activeObsIdx] ?? ''
        return (
          <label className="font-label-caps text-[10px] uppercase text-outline tracking-wider font-medium">Observaciones serie {romanNumerals[activeObsIdx] || activeObsIdx + 1}
            <textarea placeholder="RPE, molestias, técnica..." value={obs} onChange={e=>setObsBySet(prev=> ({ ...prev, [activeObsIdx]: e.target.value }))} rows={3} className="w-full mt-2 bg-surface-container border border-outline-variant rounded p-3 font-body-md text-[15px] text-on-surface leading-relaxed"/>
          </label>
        )
      })()}
    </div>
  )
}
