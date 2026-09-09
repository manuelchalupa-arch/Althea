import { useState, useEffect } from 'react'
import { recoveryScore, recoveryColor } from '@/utils/calc'
import { db } from '@/services/storage/db'
import { v4 as uuid } from 'uuid'

export default function Recuperacion(){
  const [vals,setVals]=useState({ energy:7, fatigue:4, stress:3, sleepQuality:7, soreness:3, motivation:7, digestion:7, hydration:7, sleepHours:7.5 })
  const [score,setScore]=useState(78)
  const [color,setColor]=useState<'green'|'yellow'|'red'>('green')
  const today = new Date().toISOString().slice(0,10)

  useEffect(()=>{
    db.recoveryChecks.get(today).then(r=>{
      if(r){ const v={ energy:r.energy, fatigue:r.fatigue, stress:r.stress, sleepQuality:r.sleepQuality, soreness:r.soreness, motivation:r.motivation, digestion:r.digestion, hydration:r.hydration, sleepHours:r.sleepHours }; setVals(v); setScore(r.score); setColor(r.color) }
      else {
        const saved = localStorage.getItem('recovery:'+today)
        if(saved){ const v=JSON.parse(saved); setVals(v); const s=recoveryScore(v); setScore(s); setColor(recoveryColor(s)) }
      }
    })
  },[])

  const update = (k:string, v:number)=>{
    const nv={...vals, [k]:v}
    // @ts-ignore
    setVals(nv)
    const s=recoveryScore(nv as any)
    setScore(s); setColor(recoveryColor(s))
  }
  const save = async ()=>{
    localStorage.setItem('recovery:'+today, JSON.stringify(vals))
    await db.recoveryChecks.put({ id: today, localDate: today, ...vals, score, color })
    // también guarda sueño separado para tendencias
    try{ await db.hydrationLogs.put({ id: uuid(), localDate: today, amountMl: vals.hydration*250, time: new Date().toISOString() }) }catch{}
    alert(`Guardado: ${score}/100 ${color==='green'?'🟢':color==='yellow'?'🟡':'🔴'} — también en IndexedDB para agenda`)
  }

  const sliders: [string,string][] = [
    ['energy','Energía'],['fatigue','Cansancio'],['stress','Estrés'],['sleepQuality','Calidad sueño'],['soreness','Dolor muscular'],['motivation','Motivación'],['digestion','Digestión'],['hydration','Hidratación']
  ]

  const [hydrationMl,setHydrationMl]=useState(0)
  useEffect(()=>{
    db.hydrationLogs.where('localDate').equals(today).toArray().then(arr=>{
      const total = arr.reduce((a,b)=>a+b.amountMl,0)
      setHydrationMl(total)
    })
  },[])
  const addWater = async (ml:number)=>{
    await db.hydrationLogs.put({ id: uuid(), localDate: today, amountMl: ml, time: new Date().toISOString() })
    const arr = await db.hydrationLogs.where('localDate').equals(today).toArray()
    setHydrationMl(arr.reduce((a,b)=>a+b.amountMl,0))
  }

  return (
    <div className="min-h-screen bg-bg p-4 pb-24 max-w-lg mx-auto space-y-4">
      <h1 className="text-section">Recuperación</h1>
      <div className={`rounded-xl p-5 text-center border ${color==='green'?'bg-emerald-900/30 border-emerald-800':color==='yellow'?'bg-amber-900/30 border-amber-800':'bg-red-900/30 border-red-800'}`}>
        <div className="text-aux opacity-70">RECUPERACIÓN</div>
        <div className="text-title mt-1">{score}/100 {color==='green'?'🟢':color==='yellow'?'🟡':'🔴'}</div>
        <div className="text-body opacity-80 mt-1">{color==='green'?'Normal':color==='yellow'?'Moderada':'Baja'} — {color==='green'?'Listo para entrenar':color==='yellow'?'Considerá bajar volumen':'Priorizá descanso'}</div>
      </div>

      <div className="rounded-xl bg-surface border border-border p-3 space-y-3">
        <div className="text-aux">Hidratación hoy</div>
        <div className="flex justify-between items-center">
          <span className="text-body">{hydrationMl} / 2500 ml</span>
          <span className="text-aux">{Math.round(hydrationMl/25)}%</span>
        </div>
        <div className="h-2 bg-bg border border-border rounded-full overflow-hidden"><div className="h-full bg-info" style={{width: `${Math.min(100, hydrationMl/25)}%`}}/></div>
        <div className="flex gap-2">
          <button onClick={()=>addWater(250)} className="flex-1 py-2 rounded-xl bg-surface border border-border text-aux">+250 ml</button>
          <button onClick={()=>addWater(500)} className="flex-1 py-2 rounded-xl bg-surface border border-border text-aux">+500 ml</button>
          <button onClick={()=>addWater(750)} className="flex-1 py-2 rounded-xl bg-action text-textMain">+750 ml</button>
        </div>
        <p className="text-aux text-textMuted">Registro vasos/ml · objetivo 2500 ml · El coach detecta si tomás menos los días de entreno.</p>
      </div>

      <div className="rounded-xl bg-surface border border-border p-3 space-y-3">
        {sliders.map(([k,label])=>(
          <label key={k} className="block">
            <div className="flex justify-between text-aux"><span>{label}</span><span>{(vals as any)[k]}/10</span></div>
            <input type="range" min={1} max={10} value={(vals as any)[k]} onChange={e=>update(k, Number(e.target.value))} className="w-full accent-action" />
          </label>
        ))}
        <label className="block text-aux">Horas sueño
          <input type="number" step={0.5} value={vals.sleepHours} onChange={e=>update('sleepHours', Number(e.target.value))} className="w-full mt-1 bg-bg border border-border rounded-xl p-2 text-body" />
        </label>
        <button onClick={save} className="w-full py-3 rounded-xl bg-action text-textMain font-medium">Guardar check-in</button>
        <p className="text-aux text-textMuted">Índice orientativo, no diagnóstico médico. Dolores severos: consultar profesional.</p>
      </div>
    </div>
  )
}
