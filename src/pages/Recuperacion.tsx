import { useState, useEffect } from 'react'
import { recoveryIndex, recoveryColor } from '@/utils/calc'
import { db } from '@/services/storage/db'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { AltheaCard, AltheaCardHeader, AltheaBadge, StatusTag, AltheaProgress, AltheaButton } from '@/components/althea'

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
    <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 pb-24 max-w-[1440px] w-full mx-auto space-y-4">
      <h1 className="font-headline-lg text-lg font-semibold text-on-surface">Recuperación</h1>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-3">
      <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant font-medium">Check-in de hoy</div>
      <div className={`rounded p-5 text-center border ${color==='green'?'bg-emerald-900/30 border-emerald-800':color==='yellow'?'bg-amber-900/30 border-amber-800':'bg-red-900/30 border-red-800'}`}>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant opacity-70">RECUPERACIÓN</div>
        <div className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface mt-1 flex items-center justify-center gap-2">{score}/100 <span aria-hidden className={`inline-block w-3 h-3 rounded-full ${color==='green'?'bg-success':color==='yellow'?'bg-warning':'bg-danger'}`}></span></div>
        <div className="font-body-md text-sm text-on-surface opacity-80 mt-1">{color==='green'?'Normal':color==='yellow'?'Moderada':'Baja'} — {color==='green'?'Listo para entrenar':color==='yellow'?'Considerá bajar volumen':'Priorizá descanso'}</div>
      </div>

      <div className="  rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-3">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant font-medium">Cuestionario diario (1–10) — completalo cuando quieras</div>
        {FIELDS.map(([k,label])=>(
          <label key={k} className="block">
            <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"><span>{label}</span><span>{(vals as any)[k]}/10</span></div>
            <input type="range" min={1} max={10} value={Number((vals as any)[k])} onChange={e=>update(k, Number(e.target.value))} className="w-full accent-primary" />
          </label>
        ))}
        <label className="block font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Zona del dolor
          <input value={vals.painArea} onChange={e=>update('painArea', e.target.value)} placeholder="Ej: hombro derecho" maxLength={80} className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" />
        </label>
        <label className="block font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Observación del dolor
          <textarea value={vals.painObservation} onChange={e=>update('painObservation', e.target.value)} placeholder="Tipo de molestia, cuándo aparece…" rows={2} maxLength={300} className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" />
        </label>
        <button onClick={save} className="w-full py-3 rounded bg-primary text-on-surface font-medium">Guardar check-in</button>
        <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant">Se guarda automáticamente al presionar · actualiza recuperación, gráfico e IA. Índice orientativo, no diagnóstico médico.</p>
      </div>

      </div>
      <div className="lg:col-span-4 space-y-3 hidden lg:block">
        <div className={`rounded p-4 text-center border ${color==='green'?'bg-emerald-900/30 border-emerald-800':color==='yellow'?'bg-amber-900/30 border-amber-800':'bg-red-900/30 border-red-800'}`}>
          <div className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">{score}<span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-sm">/100</span></div>
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">{color==='green'?'Normal':color==='yellow'?'Moderada':'Baja'}</div>
        </div>
        <div className="  rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><AlertTriangle size={14}/> Último check-in</div>
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-sm">Hoy — {new Date().toLocaleDateString('es')}</div>
          <div className="font-body-md text-sm text-on-surface font-medium">Energía: {vals.energy}/10 · Fatiga: {vals.fatigue}/10</div>
        </div>
        <div className="  rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><Sparkles size={14}/> Tips de recuperación</div>
          <ul className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs space-y-1.5 list-disc list-inside">
            <li>Dormí 7–8h para óptima recuperación</li>
            <li>Mantené hidratación diaria</li>
            <li>Si el score &lt; 50, considerá descanso activo</li>
          </ul>
        </div>
      </div>

      </div>
    </div>
  )
}
