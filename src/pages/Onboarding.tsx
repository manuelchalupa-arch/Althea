import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { z } from 'zod'
import * as Gym from '@/services/exerciseGym'

const OBJETIVOS = ['Perder grasa / bajar de peso','Ganar masa muscular','Aumentar fuerza','Mejorar resistencia','Mejorar condición física','Mejorar movilidad','Mantenerme','Recomposición corporal','Otro']

export default function Onboarding(){
  const nav = useNavigate()
  const [step,setStep]=useState(0)
  const total=7
  const [err,setErr]=useState<string|null>(null)

  // Paso 1
  const [nombre,setNombre]=useState(localStorage.getItem('onboard:nombre')||'')
  const [email,setEmail]=useState(localStorage.getItem('onboard:email')||'')
  // Paso 2
  const [altura,setAltura]=useState(localStorage.getItem('onboard:altura')||'')
  const [peso,setPeso]=useState(localStorage.getItem('onboard:peso')||'')
  const [pesoObjetivo,setPesoObjetivo]=useState(localStorage.getItem('onboard:pesoObjetivo')||'')
  // Paso 3
  const [objPrincipal,setObjPrincipal]=useState(localStorage.getItem('onboard:objPrincipal')||'Ganar masa muscular')
  const [objCustom,setObjCustom]=useState(localStorage.getItem('onboard:objCustom')||'')
  const [objSec,setObjSec]=useState<string[]>(()=>{ try{return JSON.parse(localStorage.getItem('onboard:objSec')||'[]')}catch{return []}})
  // Paso 4
  const [needs,setNeeds]=useState(localStorage.getItem('onboard:needs')||'')
  // Paso 5
  const [hasPain,setHasPain]=useState(localStorage.getItem('onboard:hasPain')||'No')
  const [painAreas,setPainAreas]=useState<string[]>(()=>{ try{return JSON.parse(localStorage.getItem('onboard:painAreas')||'[]')}catch{return []}})
  const [limDesc,setLimDesc]=useState(localStorage.getItem('onboard:limDesc')||'')
  const [restrictions,setRestrictions]=useState<string[]>(()=>{ try{return JSON.parse(localStorage.getItem('onboard:restrictions')||'[]')}catch{return []}})
  const [restDesc,setRestDesc]=useState(localStorage.getItem('onboard:restDesc')||'')
  // Paso 6
  const [excluded,setExcluded]=useState<string[]>(()=>{ try{return JSON.parse(localStorage.getItem('onboard:excluded')||'[]')}catch{return []}})
  const [showBiblio,setShowBiblio]=useState(false)
  const [biblioMuscle,setBiblioMuscle]=useState('biceps')
  const [biblioItems,setBiblioItems]=useState<Gym.Exercise[]>([])

  useEffect(()=>{
    if(showBiblio) Gym.fetchByMuscle(biblioMuscle).then(r=>setBiblioItems(r.exercises.slice(0,30))).catch(()=>{})
  },[biblioMuscle, showBiblio])

  const imc = altura && peso ? (Number(peso)/Math.pow(Number(altura)/100,2)).toFixed(1) : null
  const imcCat = imc ? (Number(imc)<18.5?'Bajo peso': Number(imc)<25?'Normopeso': Number(imc)<30?'Sobrepeso':'Obesidad') : null

  const validate = ():boolean=>{
    try{
      if(step===0){
        if(!nombre.trim()) throw new Error('Ingresá tu nombre')
        z.string().email('Email inválido').parse(email)
      }
      if(step===1){
        if(peso) z.coerce.number().min(30).max(300).parse(Number(peso))
        if(altura) z.coerce.number().min(100).max(250).parse(Number(altura))
        if(pesoObjetivo) z.coerce.number().min(30).max(300).parse(Number(pesoObjetivo))
        if(peso && Number(peso)<=0) throw new Error('Peso inválido')
        if(altura && Number(altura)<=0) throw new Error('Altura inválida')
        if(pesoObjetivo && Number(pesoObjetivo)<=0) throw new Error('Peso objetivo inválido')
      }
      if(step===2 && objPrincipal==='Otro' && !objCustom.trim()) throw new Error('Especificá tu objetivo')
      setErr(null); return true
    }catch(e:any){ setErr(e.errors?.[0]?.message || e.message); return false }
  }

  const next = ()=>{
    if(!validate()) return
    // persist draft
    localStorage.setItem('onboard:nombre', nombre); localStorage.setItem('onboard:email', email)
    localStorage.setItem('onboard:altura', altura); localStorage.setItem('onboard:peso', peso); localStorage.setItem('onboard:pesoObjetivo', pesoObjetivo)
    localStorage.setItem('onboard:objPrincipal', objPrincipal); localStorage.setItem('onboard:objCustom', objCustom); localStorage.setItem('onboard:objSec', JSON.stringify(objSec))
    localStorage.setItem('onboard:needs', needs)
    localStorage.setItem('onboard:hasPain', hasPain); localStorage.setItem('onboard:painAreas', JSON.stringify(painAreas)); localStorage.setItem('onboard:limDesc', limDesc)
    localStorage.setItem('onboard:restrictions', JSON.stringify(restrictions)); localStorage.setItem('onboard:restDesc', restDesc)
    localStorage.setItem('onboard:excluded', JSON.stringify(excluded))
    if(step < total-1) setStep(s=>s+1)
    else crear()
  }
  const back = ()=> setStep(s=> Math.max(0,s-1))

  const crear = async ()=>{
    const bmi = altura && peso ? (Number(peso)/Math.pow(Number(altura)/100,2)).toFixed(2) : undefined
    const bmiCat = bmi ? (Number(bmi)<18.5?'Bajo peso': Number(bmi)<25?'Normopeso': Number(bmi)<30?'Sobrepeso':'Obesidad') : undefined
    const profile:any = await db.userProfile.get('me') || { id:'me', createdAt: new Date().toISOString() }
    await db.userProfile.put({
      ...profile,
      displayName: nombre, email,
      heightCm: altura? Number(altura): undefined, weightKg: peso? Number(peso): undefined, targetWeightKg: pesoObjetivo? Number(pesoObjetivo): undefined,
      bmi, bmiCategory: bmiCat, bmiCalculatedAt: new Date().toISOString(),
      goal: objPrincipal.includes('masa')?'hipertrofia': objPrincipal.includes('grasa')?'perdida_peso':'mantenimiento',
      goalPrimary: objPrincipal, goalsSecondary: objSec, customGoal: objCustom,
      needsDescription: needs,
      limitations: hasPain==='Sí' ? ['dolor'] : [], painAreas, limitationDescription: limDesc,
      restrictions, restrictionDescription: restDesc,
      excludedExercises: excluded,
      coachContext: { needs, limitations: hasPain, excludedCount: excluded.length },
      onboardingDone: true,
      updatedAt: new Date().toISOString(),
      cycle: profile.cycle || { startDate: new Date().toISOString().slice(0,10), trainingDays:[{n:1,name:'Pecho + tríceps'},{n:2,name:'Espalda + bíceps'},{n:3,name:'Piernas'},{n:4,name:'Hombros + abdomen'}], weekMap:[null,1,2,null,3,4,null] }
    } as any)
    if(peso && altura){
      await db.table('bodyMeasurements').put({ id:`init-${Date.now()}`, localDate: new Date().toISOString().slice(0,10), weightKg: Number(peso), heightCm: Number(altura), createdAt: new Date().toISOString() }).catch(()=>{})
    }
    nav('/')
  }

  return (
    <div className="min-h-screen flex flex-col bg-transparent max-w-lg md:max-w-3xl mx-auto">
      <div className="p-4">
        <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"><span>PASO {step+1} DE {total}</span><span>{Math.round((step+1)/total*100)}%</span></div>
        <div className="h-2 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg overflow-hidden mt-1"><div className="h-full bg-primary" style={{width:`${(step+1)/total*100}%`}}/></div>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {step===0 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">¿Cómo te llamás?</h1>
            <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Nombre<input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Manuel" className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/></label>
            <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Correo electrónico<input value={email} onChange={e=>setEmail(e.target.value)} placeholder="manuel@mail.com" className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/></label>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Usaremos tu email como identificador. Validamos formato.</p>
          </div>
        )}

        {step===1 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">Datos físicos</h1>
            <div className="grid grid-cols-2 gap-2">
              <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Peso kg<input value={peso} onChange={e=>setPeso(e.target.value)} type="number" step={0.1} placeholder="80" className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/></label>
              <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Altura cm<input value={altura} onChange={e=>setAltura(e.target.value)} type="number" placeholder="180" className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/></label>
              <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant col-span-2">Peso objetivo kg (opcional)<input value={pesoObjetivo} onChange={e=>setPesoObjetivo(e.target.value)} type="number" step={0.1} placeholder="75" className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/></label>
            </div>
            <div className="rounded-lg bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3">
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Tu IMC</div>
              {imc ? <><div className="font-headline-lg text-base font-semibold text-on-surface">{imc}</div><div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{imcCat}</div><p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">El IMC es un indicador orientativo y no representa por sí solo la composición corporal ni el estado de salud.</p></> : <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Completa peso y altura para calcular IMC = peso / altura²</span>}
              {pesoObjetivo && peso && <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">Objetivo: {peso} → {pesoObjetivo} kg ({(Number(pesoObjetivo)-Number(peso)).toFixed(1)} kg)</div>}
            </div>
          </div>
        )}

        {step===2 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">¿Cuál es tu objetivo?</h1>
            <div className="grid gap-1">
              {OBJETIVOS.map(o=>(
                <button key={o} onClick={()=>setObjPrincipal(o)} className={`p-3 rounded-lg border text-left font-body-md text-sm text-on-surface ${objPrincipal===o?'bg-primary text-on-surface border-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{o} {objPrincipal===o&&'✓'}</button>
              ))}
            </div>
            {objPrincipal==='Otro' && <input value={objCustom} onChange={e=>setObjCustom(e.target.value)} placeholder="Especificá tu objetivo" className="w-full bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/>}
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Secundarios</div>
            <div className="flex flex-wrap gap-1">
              {OBJETIVOS.filter(o=>o!==objPrincipal).map(o=>(
                <button key={o} onClick={()=>setObjSec(s=> s.includes(o)? s.filter(x=>x!==o):[...s,o])} className={`px-3 py-1 rounded-full border font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${objSec.includes(o)?'bg-primary border-primary text-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{o}</button>
              ))}
            </div>
          </div>
        )}

        {step===3 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">Contanos qué necesitás</h1>
            <textarea value={needs} onChange={e=>setNeeds(e.target.value)} placeholder="Quiero bajar grasa pero mantener músculo. Tengo poco tiempo..." rows={5} className="w-full bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Se guardará como contexto para el Coach, no solo como texto.</p>
          </div>
        )}

        {step===4 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">Dolencias y restricciones</h1>
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">¿Tenés alguna dolencia o molestia?</div>
            <div className="flex gap-2">
              {['No','Sí'].map(v=> <button key={v} onClick={()=>setHasPain(v)} className={`flex-1 py-3 rounded-lg border ${hasPain===v?'bg-primary text-on-surface border-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{v}</button>)}
            </div>
            {hasPain==='Sí' && (
              <>
                <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">¿Dónde?</div>
                <div className="flex flex-wrap gap-1">
                  {['hombros','espalda','cuello','codos','muñecas','cadera','rodillas','tobillos','otra'].map(z=>(
                    <button key={z} onClick={()=>setPainAreas(a=> a.includes(z)? a.filter(x=>x!==z): [...a,z])} className={`px-3 py-1 rounded-full border font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${painAreas.includes(z)?'bg-primary border-primary text-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{z}</button>
                  ))}
                </div>
                <input value={limDesc} onChange={e=>setLimDesc(e.target.value)} placeholder="Contanos cuál" className="w-full bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/>
              </>
            )}
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">¿Tenés alguna restricción?</div>
            <div className="flex flex-wrap gap-1">
              {['equipamiento','movimientos','ejercicios','tiempo','espacio'].map(r=>(
                <button key={r} onClick={()=>setRestrictions(a=> a.includes(r)? a.filter(x=>x!==r): [...a,r])} className={`px-3 py-1 rounded-full border font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${restrictions.includes(r)?'bg-primary border-primary text-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{r}</button>
              ))}
            </div>
            <input value={restDesc} onChange={e=>setRestDesc(e.target.value)} placeholder="Otras restricciones" className="w-full bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/>
          </div>
        )}

        {step===5 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">Ejercicios que no querés hacer</h1>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Seleccioná desde la biblioteca. Se excluyen de recomendaciones normales.</p>
            <button onClick={()=>setShowBiblio(true)} className="w-full py-3 rounded-lg bg-primary text-on-surface">Seleccionar ejercicios</button>
            {excluded.length>0 && (
              <div className="rounded-lg bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2">
                <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Ejercicios excluidos ({excluded.length})</div>
                {excluded.map(id=>(
                  <div key={id} className="flex items-center gap-2 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded-lg p-2">
                    <span className="flex-1 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant truncate">{id}</span>
                    <button onClick={()=>setExcluded(e=> e.filter(x=>x!==id))} className="px-3 py-1 rounded-full bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Quitar</button>
                  </div>
                ))}
              </div>
            )}
            {showBiblio && (
              <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={()=>setShowBiblio(false)}>
                <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border-t border-outline-variant rounded-t-2xl w-full max-w-lg lg:max-w-2xl max-h-[75vh] overflow-auto p-4 space-y-2">
                  <h3 className="font-headline-lg text-base font-semibold text-on-surface">Biblioteca</h3>
                  <select value={biblioMuscle} onChange={e=>setBiblioMuscle(e.target.value)} className="w-full bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-2 font-body-md text-sm text-on-surface">
                    <option value="biceps">Bíceps</option><option value="pectorals">Pecho</option><option value="quads">Piernas</option><option value="abs">Abs</option><option value="triceps">Tríceps</option>
                  </select>
                  <div className="space-y-1 max-h-[50vh] overflow-auto">
                    {biblioItems.map(ex=>(
                      <div key={ex.id} className="rounded-lg bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-2 flex gap-2 items-center">
                        <img src={ex.gifUrl} alt={ex.name} className="w-16 h-16 rounded-lg object-cover bg-surface/60" loading="lazy" onError={e=> (e.target as HTMLImageElement).style.display='none'} />
                        <div className="flex-1 min-w-0">
                          <div className="font-body-md text-sm text-on-surface truncate">{ex.name}</div>
                          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{ex.muscle} · {ex.equipment}</div>
                        </div>
                        <label className="flex items-center gap-1 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                          <input type="checkbox" checked={excluded.includes(ex.id)} onChange={e=>{
                            if(e.target.checked) setExcluded(a=> [...a, ex.id])
                            else setExcluded(a=> a.filter(x=>x!==ex.id))
                          }} />
                          No quiero
                        </label>
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>setShowBiblio(false)} className="w-full py-3 rounded-lg bg-primary text-on-surface">Listo</button>
                </div>
              </div>
            )}
          </div>
        )}

        {step===6 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">Resumen de tu perfil</h1>
            <div className="rounded-lg bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-1 font-body-md text-sm text-on-surface">
              <Row label="Nombre" value={nombre}/>
              <Row label="Email" value={email}/>
              <Row label="Peso/Altura" value={`${peso||'—'}kg / ${altura||'—'}cm`}/>
              <Row label="Peso objetivo" value={pesoObjetivo ? `${pesoObjetivo} kg` : '—'}/>
              <Row label="IMC" value={imc ? `${imc} ${imcCat}`: '—'}/>
              <Row label="Objetivo" value={objPrincipal}/>
              <Row label="Necesidades" value={needs.slice(0,40)||'—'}/>
              <Row label="Excluidos" value={`${excluded.length} ejercicios`}/>
            </div>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">El Coach usará esto + historial para personalizar. No se inventan datos faltantes.</p>
          </div>
        )}
      </div>

      <div className="p-4 space-y-2">
        {err && <div className="rounded-lg bg-red-900/30 border border-red-800 p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-red-300">{err}</div>}
        <div className="flex gap-2">
          {step>0 && <button onClick={back} className="flex-1 py-4 rounded-lg bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant font-body-md text-sm text-on-surface">Atrás</button>}
          <button onClick={next} className="flex-1 py-4 rounded-lg bg-primary text-on-surface font-semibold">{step===6 ? 'COMENZAR →' : 'Siguiente →'}</button>
        </div>
      </div>
    </div>
  )
}
function Row({label,value}:{label:string;value:string}){ return <div className="flex justify-between border-b border-outline-variant/50 py-1"><span className="text-on-surface-variant">{label}</span><span className="font-medium truncate max-w-[60%] text-right">{value}</span></div>}
