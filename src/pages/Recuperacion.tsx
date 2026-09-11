import { useState, useEffect } from 'react'
import { recoveryIndex, recoveryColor } from '@/utils/calc'
import { db } from '@/services/storage/db'

// Cuestionario de recuperación (nombres internos estables, etiquetas en español).
// Positivas: energy, mood, motivation · Negativas: fatigue, pain, perceivedExertion, stress.
// painArea/painObservation son descriptivas. Fórmula documentada en utils/calc.ts.
const FIELDS: [string,string][] = [
  ['energy','Energía'],['fatigue','Fatiga'],['pain','Dolor'],['mood','Estado de ánimo'],
  ['motivation','Motivación'],['perceivedExertion','Esfuerzo percibido'],['stress','Estrés'],
]

export default function Recuperacion(){
  const today = new Date().toISOString().slice(0,10)
  const [vals,setVals]=useState({ energy:7, fatigue:4, pain:2, mood:7, motivation:7, perceivedExertion:5, stress:3, painArea:'', painObservation:'' })
  const [score,setScore]=useState(0)
  const [color,setColor]=useState<'green'|'yellow'|'red'>('green')

  useEffect(()=>{
    db.recoveryChecks.get(today).then(r=>{
      if(r && (r as any).energy !== undefined){
        const v = {
          energy: Number((r as any).energy ?? 7), fatigue: Number((r as any).fatigue ?? 4),
          pain: Number((r as any).pain ?? (r as any).soreness ?? 2), mood: Number((r as any).mood ?? 7),
          motivation: Number((r as any).motivation ?? 7), perceivedExertion: Number((r as any).perceivedExertion ?? 5),
          stress: Number((r as any).stress ?? 3), painArea: String((r as any).painArea ?? ''), painObservation: String((r as any).painObservation ?? ''),
        }
        setVals(v)
        const s = typeof (r as any).score === 'number' ? (r as any).score : recoveryIndex(v)
        setScore(s); setColor(recoveryColor(s))
      }
      else {
        const saved = localStorage.getItem('recovery:'+today)
        if(saved){
          try{
            const v = { ...vals, ...JSON.parse(saved) }
            setVals(v)
            const s = recoveryIndex(v)
            setScore(s); setColor(recoveryColor(s))
          }catch{ /* noop */ }
        } else {
          const s = recoveryIndex(vals)
          setScore(s); setColor(recoveryColor(s))
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  const update = (k:string, v:number|string)=>{
    const nv = { ...vals, [k]: v } as typeof vals
    setVals(nv)
    const s = recoveryIndex(nv)
    setScore(s); setColor(recoveryColor(s))
  }

  const save = async ()=>{
    localStorage.setItem('recovery:'+today, JSON.stringify(vals))
    await db.recoveryChecks.put({ id: today, localDate: today, ...vals, score, color } as never)
    try{ window.dispatchEvent(new Event('recoveryChange')) }catch{ /* noop */ }
    alert(`Guardado: ${score}/100 — disponible para IA y gráficos`)
  }

  return (
    <div className="min-h-screen bg-bg p-4 pb-24 max-w-lg lg:max-w-3xl mx-auto space-y-4">
      <h1 className="text-section">Recuperación</h1>
      <div className={`rounded-xl p-5 text-center border ${color==='green'?'bg-emerald-900/30 border-emerald-800':color==='yellow'?'bg-amber-900/30 border-amber-800':'bg-red-900/30 border-red-800'}`}>
        <div className="text-aux opacity-70">RECUPERACIÓN</div>
        <div className="text-title mt-1 flex items-center justify-center gap-2">{score}/100 <span aria-hidden className={`inline-block w-3 h-3 rounded-full ${color==='green'?'bg-success':color==='yellow'?'bg-warning':'bg-danger'}`}></span></div>
        <div className="text-body opacity-80 mt-1">{color==='green'?'Normal':color==='yellow'?'Moderada':'Baja'} — {color==='green'?'Listo para entrenar':color==='yellow'?'Considerá bajar volumen':'Priorizá descanso'}</div>
      </div>

      <div className="rounded-xl bg-surface border border-border p-3 space-y-3">
        <div className="text-aux font-medium">Cuestionario diario (1–10) — completalo cuando quieras</div>
        {FIELDS.map(([k,label])=>(
          <label key={k} className="block">
            <div className="flex justify-between text-aux"><span>{label}</span><span>{(vals as any)[k]}/10</span></div>
            <input type="range" min={1} max={10} value={Number((vals as any)[k])} onChange={e=>update(k, Number(e.target.value))} className="w-full accent-action" />
          </label>
        ))}
        <label className="block text-aux">Zona del dolor
          <input value={vals.painArea} onChange={e=>update('painArea', e.target.value)} placeholder="Ej: hombro derecho" maxLength={80} className="w-full mt-1 bg-bg border border-border rounded-xl p-2 text-body" />
        </label>
        <label className="block text-aux">Observación del dolor
          <textarea value={vals.painObservation} onChange={e=>update('painObservation', e.target.value)} placeholder="Tipo de molestia, cuándo aparece…" rows={2} maxLength={300} className="w-full mt-1 bg-bg border border-border rounded-xl p-2 text-body" />
        </label>
        <button onClick={save} className="w-full py-3 rounded-xl bg-action text-textMain font-medium">Guardar check-in</button>
        <p className="text-aux text-textMuted">Se guarda automáticamente al presionar · actualiza recuperación, gráfico e IA. Índice orientativo, no diagnóstico médico.</p>
      </div>
    </div>
  )
}
