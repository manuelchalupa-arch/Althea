import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, saveOnboardingDraft, getOnboardingDraft, clearOnboardingDraft } from '@/services/storage/db'
import { z } from 'zod'
import * as Gym from '@/services/exerciseGym'
import { CoachIntensity } from '@/types'

const OBJETIVOS = ['Perder grasa / bajar de peso','Ganar masa muscular','Aumentar fuerza','Mejorar resistencia','Mejorar condición física','Mejorar movilidad','Mantenerme','Recomposición corporal','Otro']
const NIVELES = ['Principiante','Intermedio','Avanzado']
const DIAS_LABELS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
const EQUIPAMIENTO = ['Barra','Mancuernas','Máquinas','Poleas','Peso corporal','Bandas elásticas','Kettlebell','Otro']
const COACH_INTENSIDAD: { value: CoachIntensity; label: string; description: string }[] = [
  { value: 'profesional', label: 'Profesional', description: 'Equilibrado y técnico, con exigencia medida' },
  { value: 'motivacional', label: 'Motivacional', description: 'Animador y de apoyo, celebra los logros' },
  { value: 'duro', label: 'Exigente', description: 'Directo y demandante, empuja al límite' },
  { value: 'extremo', label: 'Extremo', description: 'Máxima intensidad, sin excusas (con guardrails)' },
]

export default function Onboarding(){
  const nav = useNavigate()
  const [step,setStep]=useState(0)
  const total=7
  const [err,setErr]=useState<string|null>(null)
  const [draftLoaded,setDraftLoaded]=useState(false)

  // Paso 0: Objetivo
  const [objPrincipal,setObjPrincipal]=useState('')
  const [objCustom,setObjCustom]=useState('')
  const [objSec,setObjSec]=useState<string[]>([])

  // Paso 1: Nivel
  const [nivel,setNivel]=useState('')

  // Paso 2: Días disponibles
  const [diasDisponibles,setDiasDisponibles]=useState<number[]>([])

  // Paso 3: Equipamiento
  const [equipamiento,setEquipamiento]=useState<string[]>([])

  // Paso 4: Horario
  const [horarioEntreno,setHorarioEntreno]=useState('18:00')
  const [duracionSesion,setDuracionSesion]=useState(60)

  // Paso 5: Coach (intensidad/estilo)
  const [coachIntensity,setCoachIntensity]=useState<CoachIntensity>('profesional')

  // Paso 6: Notificaciones + Dolencias + Restricciones + Excluidos + Datos opcionales
  const [nombre,setNombre]=useState('')
  const [email,setEmail]=useState('')
  const [altura,setAltura]=useState('')
  const [peso,setPeso]=useState('')
  const [pesoObjetivo,setPesoObjetivo]=useState('')
  const [needs,setNeeds]=useState('')
  const [hasPain,setHasPain]=useState<'Sí'|'No'>('No')
  const [painAreas,setPainAreas]=useState<string[]>([])
  const [limDesc,setLimDesc]=useState('')
  const [restrictions,setRestrictions]=useState<string[]>([])
  const [restDesc,setRestDesc]=useState('')
  const [excluded,setExcluded]=useState<string[]>([])
  const [showBiblio,setShowBiblio]=useState(false)
  const [biblioMuscle,setBiblioMuscle]=useState('pectorals')
  const [biblioItems,setBiblioItems]=useState<Gym.Exercise[]>([])

  const imc = altura && peso ? (Number(peso)/Math.pow(Number(altura)/100,2)).toFixed(1) : null
  const imcCat = imc ? (Number(imc)<18.5?'Bajo peso': Number(imc)<25?'Normopeso': Number(imc)<30?'Sobrepeso':'Obesidad') : null

  useEffect(()=>{
    if(showBiblio) {Gym.fetchByMuscle(biblioMuscle).then(r=>setBiblioItems(r.exercises.slice(0,30))).catch(()=>{})}
  },[biblioMuscle, showBiblio])

  // Cargar borrador de Dexie al iniciar
  useEffect(() => {
    getOnboardingDraft().then(draft => {
      if (draft) {
        setStep(draft.step)
        const d = draft.data
        if (d.objPrincipal) { setObjPrincipal(d.objPrincipal) }
        if (d.objCustom) { setObjCustom(d.objCustom) }
        if (d.objSec) { setObjSec(d.objSec) }
        if (d.nivel) { setNivel(d.nivel) }
        if (d.diasDisponibles) { setDiasDisponibles(d.diasDisponibles) }
        if (d.equipamiento) { setEquipamiento(d.equipamiento) }
        if (d.horarioEntreno) { setHorarioEntreno(d.horarioEntreno) }
        if (d.duracionSesion) { setDuracionSesion(d.duracionSesion) }
        if (d.coachIntensity) { setCoachIntensity(d.coachIntensity) }
        if (d.nombre) { setNombre(d.nombre) }
        if (d.email) { setEmail(d.email) }
        if (d.altura) { setAltura(d.altura) }
        if (d.peso) { setPeso(d.peso) }
        if (d.pesoObjetivo) { setPesoObjetivo(d.pesoObjetivo) }
        if (d.needs) { setNeeds(d.needs) }
        if (d.hasPain) { setHasPain(d.hasPain) }
        if (d.painAreas) { setPainAreas(d.painAreas) }
        if (d.limDesc) { setLimDesc(d.limDesc) }
        if (d.restrictions) { setRestrictions(d.restrictions) }
        if (d.restDesc) { setRestDesc(d.restDesc) }
        if (d.excluded) { setExcluded(d.excluded) }
      }
      setDraftLoaded(true)
    }).catch(() => setDraftLoaded(true))
  }, [])

  // Guardar borrador en Dexie en cada cambio de paso
  const persistDraft = () => {
    const data = {
      objPrincipal, objCustom, objSec,
      nivel, diasDisponibles, equipamiento,
      horarioEntreno, duracionSesion,
      coachIntensity,
      nombre, email, altura, peso, pesoObjetivo,
      needs, hasPain, painAreas, limDesc, restrictions, restDesc, excluded
    }
    saveOnboardingDraft(step, data)
  }

  const validate = ():boolean=>{
    try{
      if(step===0){
        if(!objPrincipal) {throw new Error('Seleccioná tu objetivo principal')}
        if(objPrincipal==='Otro' && !objCustom.trim()) {throw new Error('Especificá tu objetivo personalizado')}
      }
      if(step===1){
        if(!nivel) {throw new Error('Seleccioná tu nivel de experiencia')}
      }
      if(step===2){
        if(diasDisponibles.length===0) {throw new Error('Seleccioná al menos un día disponible')}
      }
      if(step===3){
        if(equipamiento.length===0) {throw new Error('Seleccioná al menos un equipamiento disponible')}
      }
      if(step===4){
        if(!horarioEntreno) {throw new Error('Seleccioná tu horario habitual')}
        if(duracionSesion < 20 || duracionSesion > 180) {throw new Error('Duración entre 20 y 180 minutos')}
      }
      if(step===5){
        // Coach step: all have defaults, no validation needed
      }
      if(step===6){
        if(!nombre.trim()) {throw new Error('Ingresá tu nombre')}
        z.string().email('Email inválido').parse(email)
        // peso y altura son opcionales en onboarding (se completan en Perfil)
        if(peso) {z.coerce.number().min(30).max(300).parse(Number(peso))}
        if(altura) {z.coerce.number().min(100).max(250).parse(Number(altura))}
        if(pesoObjetivo) {z.coerce.number().min(30).max(300).parse(Number(pesoObjetivo))}
      }
      setErr(null); return true
    }catch(e:any){ setErr(e.errors?.[0]?.message || e.message); return false }
  }

  const next = ()=>{
    if(!validate()) {return}
    persistDraft()
    if(step < total-1) {setStep(s=>s+1)}
    else {crear()}
  }
  const back = ()=> { persistDraft(); setStep(s=> Math.max(0,s-1)) }

  const crear = async ()=>{
    const bmi = altura && peso ? (Number(peso)/Math.pow(Number(altura)/100,2)).toFixed(2) : undefined
    const bmiCat = bmi ? (Number(bmi)<18.5?'Bajo peso': Number(bmi)<25?'Normopeso': Number(bmi)<30?'Sobrepeso':'Obesidad') : undefined

    // Unificar restrictions en limitations para que methodSelector y otros consumidores las usen
    const allLimitations = [
      ...(hasPain==='Sí' ? ['dolor'] : []),
      ...restrictions
    ]

    const profile:any = await db.userProfile.get('me') || { id:'me', createdAt: new Date().toISOString() }
    await db.userProfile.put({
      ...profile,
      displayName: nombre, email,
      heightCm: altura? Number(altura): undefined, weightKg: peso? Number(peso): undefined, targetWeightKg: pesoObjetivo? Number(pesoObjetivo): undefined,
      bmi, bmiCategory: bmiCat, bmiCalculatedAt: bmi ? new Date().toISOString() : undefined,
      goal: objPrincipal.includes('masa')?'hipertrofia': objPrincipal.includes('grasa')?'perdida_peso':
            objPrincipal.includes('fuerza')?'fuerza': objPrincipal.includes('resistencia')?'resistencia':
            objPrincipal.includes('movilidad')?'movilidad': objPrincipal.includes('recomposición')?'recomposicion':'mantenimiento',
      goalPrimary: objPrincipal, goalsSecondary: objSec, customGoal: objCustom,
      needsDescription: needs,
      limitations: allLimitations, painAreas, limitationDescription: limDesc,
      restrictions, restrictionDescription: restDesc,
      excludedExercises: excluded,
      coachContext: { needs, limitations: hasPain, excludedCount: excluded.length },
      level: nivel.toLowerCase() as any,
      availableDays: diasDisponibles,
      trainingTime: horarioEntreno,
      equipment: equipamiento.map(e=>e.toLowerCase().replace(' ','_')) as any,
      sessionDurationMin: duracionSesion,
      coachIntensity,
      onboardingDone: true,
      updatedAt: new Date().toISOString(),
      cycle: profile.cycle || { startDate: new Date().toISOString().slice(0,10), trainingDays:[{n:1,name:'Pecho + tríceps'},{n:2,name:'Espalda + bíceps'},{n:3,name:'Piernas'},{n:4,name:'Hombros + abdomen'}], weekMap:[null,1,2,null,3,4,null] }
    } as any)
    if(peso && altura){
      await db.table('bodyMeasurements').put({ id:`init-${Date.now()}`, localDate: new Date().toISOString().slice(0,10), weightKg: Number(peso), heightCm: Number(altura), createdAt: new Date().toISOString() }).catch(()=>{})
    }
    await clearOnboardingDraft()
    nav('/')
  }

  if (!draftLoaded) {
    return <div className="p-8 text-center">Cargando…</div>
  }

  return (
    <div className="min-h-screen flex flex-col bg-transparent max-w-lg md:max-w-3xl mx-auto">
      <div className="p-4">
        <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"><span>PASO {step+1} DE {total}</span><span>{Math.round((step+1)/total*100)}%</span></div>
        <div className="h-2 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg overflow-hidden mt-1"><div className="h-full bg-primary" style={{width:`${(step+1)/total*100}%`}}/></div>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {/* PASO 0: OBJETIVO */}
        {step===0 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">¿Cuál es tu objetivo principal?</h1>
            <div className="grid gap-1">
              {OBJETIVOS.map(o=>(
                <button key={o} onClick={()=>setObjPrincipal(o)} className={`p-3 rounded-lg border text-left font-body-md text-sm text-on-surface ${objPrincipal===o?'bg-primary text-on-surface border-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{o} {objPrincipal===o&&'✓'}</button>
              ))}
            </div>
            {objPrincipal==='Otro' && <input value={objCustom} onChange={e=>setObjCustom(e.target.value)} placeholder="Especificá tu objetivo" className="w-full mt-2 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/>}
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-4">Objetivos secundarios</div>
            <div className="flex flex-wrap gap-1">
              {OBJETIVOS.filter(o=>o!==objPrincipal).map(o=>(
                <button key={o} onClick={()=>setObjSec(s=> s.includes(o)? s.filter(x=>x!==o):[...s,o])} className={`px-3 py-1 rounded-full border font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${objSec.includes(o)?'bg-primary border-primary text-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{o}</button>
              ))}
            </div>
          </div>
        )}

        {/* PASO 1: NIVEL */}
        {step===1 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">¿Cuál es tu nivel de experiencia?</h1>
            <div className="grid gap-1">
              {NIVELES.map((n,i)=>(
                <button key={n} onClick={()=>setNivel(n)} className={`p-4 rounded-lg border text-left font-body-md text-sm text-on-surface ${nivel===n?'bg-primary text-on-surface border-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>
                  <div className="font-semibold">{n}</div>
                  <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">
                    {i===0?'Menos de 6 meses de entreno consistente':i===1?'6 meses a 3 años':'Más de 3 años de entreno estructurado'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PASO 2: DÍAS */}
        {step===2 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">¿Qué días podés entrenar?</h1>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Seleccioná todos los que apliquen</p>
            <div className="grid grid-cols-4 gap-1">
              {DIAS_LABELS.map((d,i)=>(
                <button key={d} onClick={()=>setDiasDisponibles(a=> a.includes(i)? a.filter(x=>x!==i):[...a,i])} className={`py-3 rounded-lg border font-body-md text-sm text-on-surface ${diasDisponibles.includes(i)?'bg-primary border-primary text-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{d.slice(0,3)}</button>
              ))}
            </div>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{diasDisponibles.length} día{diasDisponibles.length!==1?'s':''} seleccionado{diasDisponibles.length!==1?'s':''}</p>
          </div>
        )}

        {/* PASO 3: EQUIPAMIENTO */}
        {step===3 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">¿Qué equipamiento tenés disponible?</h1>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Seleccioná todos los que tengas acceso</p>
            <div className="flex flex-wrap gap-1">
              {EQUIPAMIENTO.map(e=>(
                <button key={e} onClick={()=>setEquipamiento(a=> a.includes(e)? a.filter(x=>x!==e):[...a,e])} className={`px-3 py-2 rounded-lg border font-body-md text-sm text-on-surface ${equipamiento.includes(e)?'bg-primary border-primary text-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{e}</button>
              ))}
            </div>
          </div>
        )}

        {/* PASO 4: HORARIO */}
        {step===4 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">¿Cuándo y cuánto entrenás?</h1>
            <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Horario habitual<input type="time" value={horarioEntreno} onChange={e=>setHorarioEntreno(e.target.value)} className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/></label>
            <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Duración de sesión (min)
              <input type="number" value={duracionSesion} onChange={e=>setDuracionSesion(Number(e.target.value))} min={20} max={180} className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/>
            </label>
          </div>
        )}

        {/* PASO 5: COACH */}
        {step===5 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">Configurá tu Coach</h1>
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Intensidad / Estilo</div>
            <div className="grid gap-1">
              {COACH_INTENSIDAD.map(c=>(
                <button key={c.value} onClick={()=>setCoachIntensity(c.value)} className={`p-3 rounded-lg border text-left font-body-md text-sm text-on-surface ${coachIntensity===c.value?'bg-primary text-on-surface border-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>
                  <div className="flex items-center justify-between"><span className="font-semibold">{c.label}</span>{coachIntensity===c.value&&'✓'}</div>
                  <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">{c.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PASO 6: NOTIFICACIONES + PERFIL COMPLETO */}
        {step===6 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">Últimos datos para tu perfil</h1>
            <div className="space-y-3 border-t border-outline-variant/30 pt-3">
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Notificaciones push</div>
              <p className="font-body-md text-sm text-on-surface-variant">Se configurarán recordatorios básicos (entreno, hidratación, check-in). Podés ajustarlos después en Perfil.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-outline-variant/30">
              <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Nombre<input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Manuel" className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/></label>
              <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Correo electrónico<input value={email} onChange={e=>setEmail(e.target.value)} placeholder="manuel@mail.com" className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Peso kg (opcional)<input value={peso} onChange={e=>setPeso(e.target.value)} type="number" step={0.1} placeholder="80" className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/></label>
              <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Altura cm (opcional)<input value={altura} onChange={e=>setAltura(e.target.value)} type="number" placeholder="180" className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/></label>
            </div>
            <label className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Peso objetivo kg (opcional)<input value={pesoObjetivo} onChange={e=>setPesoObjetivo(e.target.value)} type="number" step={0.1} placeholder="75" className="w-full mt-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/></label>
            <div className="rounded-lg bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3">
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Tu IMC</div>
              {imc ? <><div className="font-headline-lg text-base font-semibold text-on-surface">{imc}</div><div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{imcCat}</div><p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">El IMC es un indicador orientativo y no representa por sí solo la composición corporal ni el estado de salud.</p></> : <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Opcional: completa peso y altura para calcular IMC = peso / altura²</span>}
              {pesoObjetivo && peso && <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">Objetivo: {peso} → {pesoObjetivo} kg ({(Number(pesoObjetivo)-Number(peso)).toFixed(1)} kg)</div>}
            </div>
            <textarea value={needs} onChange={e=>setNeeds(e.target.value)} placeholder="Quiero bajar grasa pero mantener músculo. Tengo poco tiempo..." rows={3} className="w-full bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Se guardará como contexto para el Coach, no solo como texto.</p>

            <div className="pt-3 border-t border-outline-variant/30">
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">¿Tenés alguna dolencia o molestia?</div>
              <div className="flex gap-2">
                {(['No','Sí'] as const).map(v=> <button key={v} onClick={()=>setHasPain(v)} className={`flex-1 py-3 rounded-lg border ${hasPain===v?'bg-primary text-on-surface border-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{v}</button>)}
              </div>
              {hasPain==='Sí' && (
                <>
                  <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">¿Dónde?</div>
                  <div className="flex flex-wrap gap-1">
                    {['hombros','espalda','cuello','codos','muñecas','cadera','rodillas','tobillos','otra'].map(z=>(
                      <button key={z} onClick={()=>setPainAreas(a=> a.includes(z)? a.filter(x=>x!==z): [...a,z])} className={`px-3 py-1 rounded-full border font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${painAreas.includes(z)?'bg-primary border-primary text-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{z}</button>
                    ))}
                  </div>
                  <input value={limDesc} onChange={e=>setLimDesc(e.target.value)} placeholder="Contanos cuál / detalles" className="w-full mt-2 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/>
                </>
              )}
            </div>

            <div className="pt-3 border-t border-outline-variant/30">
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">¿Tenés alguna restricción?</div>
              <div className="flex flex-wrap gap-1">
                {['equipamiento','movimientos','ejercicios','tiempo','espacio'].map(r=>(
                  <button key={r} onClick={()=>setRestrictions(a=> a.includes(r)? a.filter(x=>x!==r): [...a,r])} className={`px-3 py-1 rounded-full border font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${restrictions.includes(r)?'bg-primary border-primary text-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{r}</button>
                ))}
              </div>
              <input value={restDesc} onChange={e=>setRestDesc(e.target.value)} placeholder="Otras restricciones" className="w-full mt-2 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/>
            </div>

            <div className="pt-3 border-t border-outline-variant/30">
              <h2 className="font-headline-lg text-base font-semibold text-on-surface">Ejercicios que no querés hacer</h2>
              <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Seleccioná desde la biblioteca. Se excluyen de recomendaciones y sustituciones.</p>
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
                      <option value="pectorals">Pecho</option><option value="biceps">Bíceps</option><option value="triceps">Tríceps</option><option value="abs">Abs</option><option value="quads">Piernas</option><option value="back">Espalda</option><option value="shoulders">Hombros</option>
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
                              if(e.target.checked) {setExcluded(a=> [...a, ex.id])}
                              else {setExcluded(a=> a.filter(x=>x!==ex.id))}
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