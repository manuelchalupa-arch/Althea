import { useState, useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, saveOnboardingDraft, getOnboardingDraft, clearOnboardingDraft } from '@/services/storage/db'
import { z } from 'zod'
import * as Gym from '@/services/exerciseGym'
import { traditionalItems, toggleGroupExcluded, TRADITIONAL_GROUPS, type TraditionalItem } from '@/data/traditionalCatalog'
import { CoachIntensity, Goal } from '@/types'
import { todayKey } from '@/utils/dates'
import { resolveTrainingGoal } from '@/utils/trainingGoal'
import { calcTDEE } from '@/utils/nutrition'
import { normalizeSex, SEX_LABEL, type SexCode } from '@/utils/sex'
import { prettyExId } from '@/utils/format'
import { AltheaAvatar } from '@/components/brand/AltheaAvatar'

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

const INPUT_CLS = 'w-full bg-surface border-2 border-outline rounded-lg p-3 min-h-[52px] font-body-md text-base text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30'

function StepSection({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-4 space-y-3">
      <div>
        <h2 className="font-label-caps text-[11px] font-bold uppercase tracking-widest text-primary">{title}</h2>
        {subtitle && <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block font-label-md text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1.5">{label}</span>
      {children}
    </label>
  )
}

const chipCls = (active: boolean) =>
  `min-w-[44px] min-h-[44px] px-3 py-1.5 rounded-full border font-label-md text-[10px] font-semibold uppercase tracking-widest transition-colors ${active ? 'bg-primary border-primary text-on-primary' : 'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant text-on-surface-variant'}`

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

  // Paso 6: Notificaciones + Dolencias + Restricciones + Excluidos + Datos cuantitativos
  const [nombre,setNombre]=useState('')
  const [email,setEmail]=useState('')
  // Sexo: vocabulario CANÓNICO ('M' | 'F' | 'X'), el mismo de UserProfile.sex.
  // Antes se guardaba 'masculino' | 'femenino' | 'otro' con un cast, con lo que
  // convivían dos vocabularios en la misma columna.
  const [sexo,setSexo]=useState<SexCode>('M')
  const [fechaNacimiento,setFechaNacimiento]=useState('')
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
  const [biblioMuscle,setBiblioMuscle]=useState('__all__')
  const [biblioItems,setBiblioItems]=useState<TraditionalItem[]>([])

  const edad = fechaNacimiento ? Math.floor((Date.now() - new Date(fechaNacimiento).getTime()) / (365.25 * 86400000)) : null

  const imc = altura && peso ? (Number(peso)/Math.pow(Number(altura)/100,2)).toFixed(1) : null
  const imcCat = imc ? (Number(imc)<18.5?'Bajo peso': Number(imc)<25?'Normopeso': Number(imc)<30?'Sobrepeso':'Obesidad') : null

  useEffect(()=>{
    if(showBiblio) {
      // Síntesis: solo ejercicios tradicionales (sin variantes del catálogo).
      // Se cargan todos una vez; el filtro por grupo se aplica al render.
      Gym.fetchAll()
        .then(r => setBiblioItems(traditionalItems(r.exercises || [])))
        .catch(()=>{})
    }
  },[showBiblio])

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
        if (d.sexo) { setSexo(normalizeSex(d.sexo)) }
        if (d.fechaNacimiento) { setFechaNacimiento(d.fechaNacimiento) }
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
      nombre, email, sexo, fechaNacimiento, altura, peso, pesoObjetivo,
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
        if(peso) {
          z.coerce.number().min(30).max(300).parse(Number(peso))
        }
        if(altura) {
          z.coerce.number().min(100).max(250).parse(Number(altura))
        }
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
    const weightNum = peso ? Number(peso) : undefined
    const heightNum = altura ? Number(altura) : undefined
    const bmi = (weightNum && heightNum) ? (weightNum / Math.pow(heightNum/100,2)).toFixed(2) : undefined
    const bmiCat = bmi ? (Number(bmi)<18.5?'Bajo peso': Number(bmi)<25?'Normopeso': Number(bmi)<30?'Sobrepeso':'Obesidad') : undefined

    // D11: Variantes de peso objetivo superior e inferior
    const weightLowerVariant = weightNum ? Math.round((weightNum * 0.95) * 10) / 10 : undefined
    const weightUpperVariant = weightNum ? Math.round((weightNum * 1.05) * 10) / 10 : undefined
    const chosenTargetWeight = pesoObjetivo ? Number(pesoObjetivo) : (weightNum ? (objPrincipal.includes('grasa') ? weightLowerVariant : objPrincipal.includes('masa') ? weightUpperVariant : weightNum) : undefined)

    // D11: Calorías y macronutrientes recomendados
    // Sólo cambia la comparación: la fórmula (Mifflin-St Jeor) es la misma.
    // `sexo` es ahora canónico, por eso se compara contra 'M'.
    const isMale = sexo === 'M'
    let caloriesTarget: number | undefined = undefined
    let proteinTarget: number | undefined = undefined
    let fatTarget: number | undefined = undefined
    let carbsTarget: number | undefined = undefined

    if (weightNum && heightNum) {
      const bmr = isMale ? (10 * weightNum + 6.25 * heightNum - 5 * (edad || 25) + 5) : (10 * weightNum + 6.25 * heightNum - 5 * (edad || 25) - 161)
      const tdee = calcTDEE(bmr, 'poco_activo', diasDisponibles.length) ?? Math.round(bmr * 1.375)
      caloriesTarget = objPrincipal.includes('grasa') ? tdee - 400 : objPrincipal.includes('masa') ? tdee + 300 : tdee
      proteinTarget = Math.round(weightNum * (objPrincipal.includes('masa') || objPrincipal.includes('grasa') ? 2.0 : 1.6))
      fatTarget = Math.round((caloriesTarget * 0.25) / 9)
      carbsTarget = Math.max(0, Math.round((caloriesTarget - (proteinTarget * 4 + fatTarget * 9)) / 4))
    }

    // Unificar restrictions en limitations para que methodSelector y otros consumidores las usen
    const allLimitations = [
      ...(hasPain==='Sí' ? ['dolor'] : []),
      ...restrictions
    ]

    const selectedGoal: Goal = objPrincipal.includes('masa')?'hipertrofia': objPrincipal.includes('grasa')?'perdida_peso':
          objPrincipal.includes('fuerza')?'fuerza': objPrincipal.includes('resistencia')?'resistencia':
          objPrincipal.includes('movilidad')?'movilidad': objPrincipal.includes('recomposición')?'recomposicion':'mantenimiento'

    const profile:any = await db.userProfile.get('me') || { id:'me', createdAt: new Date().toISOString() }
    const initialCycle = profile.cycle || { startDate: todayKey(), trainingDays:[{n:1,name:'Pecho + tríceps'},{n:2,name:'Espalda + bíceps'},{n:3,name:'Piernas'},{n:4,name:'Hombros + abdomen'}], weekMap:[null,1,2,null,3,4,null] }
    await db.userProfile.put({
      ...profile,
      displayName: nombre,
      name: nombre,
      email,
      sex: sexo,
      birthDate: fechaNacimiento || undefined,
      age: edad ?? undefined,
      heightCm: heightNum,
      weightKg: weightNum,
      targetWeightKg: chosenTargetWeight,
      targetWeightVariants: (weightLowerVariant && weightUpperVariant) ? { lower: weightLowerVariant, upper: weightUpperVariant } : undefined,
      nutritionTargets: (caloriesTarget && proteinTarget) ? { calories: caloriesTarget, protein: proteinTarget, carbs: carbsTarget, fats: fatTarget } : undefined,
      bmi,
      bmiCategory: bmiCat,
      bmiCalculatedAt: bmi ? new Date().toISOString() : undefined,
      goal: selectedGoal,
      trainingGoal: resolveTrainingGoal({ goal: selectedGoal, goalPrimary: objPrincipal }),
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
      cycle: initialCycle,
    } as any)
    // Escritura canónica de la planificación inicial (no-op si ya existe igual).
    try {
      const { savePlanning } = await import('@/services/planning/cycleVersions')
      await savePlanning({ cycle: initialCycle, note: 'Planificación inicial (onboarding)' })
    } catch { /* la planificación legacy ya quedó guardada arriba */ }
    if (weightNum || heightNum) {
      await db.table('bodyMeasurements').put({ id:`init-${Date.now()}`, localDate: todayKey(), weightKg: weightNum, heightCm: heightNum, createdAt: new Date().toISOString() }).catch(()=>{})
    }
    await clearOnboardingDraft()
    nav('/')
  }

  if (!draftLoaded) {
    return <div className="p-8 text-center">Cargando…</div>
  }

  return (
    <div className="min-h-screen flex flex-col bg-transparent sm:px-5 lg:px-8 mx-auto">
      {/* Un solo busto centrado arriba en todos los pasos (grande en el
          primero, donde la marca es el mensaje). El par responsive anterior
          se veia doble: althea-bust-img pisa hidden/lg:hidden de Tailwind. */}
      <div className="p-4 space-y-3">
        <div className="flex justify-center">
          <AltheaAvatar
            context="hero"
            size={step === 0 ? 80 : 56}
            alt="Busto clásico de Althea: figura de mármol con corona de laurel"
            className="shrink-0 object-contain"
          />
        </div>
        <div className="flex-1 min-w-0">
            <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"><span>PASO {step+1} DE {total}</span><span>{Math.round((step+1)/total*100)}%</span></div>
            <div className="h-2 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg overflow-hidden mt-1"><div className="h-full bg-primary" style={{width:`${(step+1)/total*100}%`}}/></div>
          </div>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-auto mx-auto w-full max-w-2xl">
        {/* PASO 0: OBJETIVO */}
        {step===0 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">¿Cuál es tu objetivo principal?</h1>
            <div className="grid gap-1">
              {OBJETIVOS.map(o=>(
                <button key={o} onClick={()=>setObjPrincipal(o)} className={`min-w-[44px] min-h-[44px] p-3 rounded-lg border text-left font-body-md text-sm text-on-surface ${objPrincipal===o?'bg-primary text-on-surface border-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{o} {objPrincipal===o&&'✓'}</button>
              ))}
            </div>
            {objPrincipal==='Otro' && <input value={objCustom} onChange={e=>setObjCustom(e.target.value)} placeholder="Especificá tu objetivo" className="w-full mt-2 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3 font-body-md text-sm text-on-surface"/>}
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-4">Objetivos secundarios</div>
            <div className="flex flex-wrap gap-1">
              {OBJETIVOS.filter(o=>o!==objPrincipal).map(o=>(
                <button key={o} onClick={()=>setObjSec(s=> s.includes(o)? s.filter(x=>x!==o):[...s,o])} className={chipCls(objSec.includes(o))}>{o}</button>
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
                <button key={d} onClick={()=>setDiasDisponibles(a=> a.includes(i)? a.filter(x=>x!==i):[...a,i])} className={`min-w-[44px] min-h-[44px] py-3 rounded-lg border font-body-md text-sm text-on-surface ${diasDisponibles.includes(i)?'bg-primary border-primary text-on-primary font-bold':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{d.slice(0,3)}</button>
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
                <button key={e} onClick={()=>setEquipamiento(a=> a.includes(e)? a.filter(x=>x!==e):[...a,e])} className={`min-w-[44px] min-h-[44px] px-3 py-2 rounded-lg border font-body-md text-sm text-on-surface ${equipamiento.includes(e)?'bg-primary border-primary text-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{e}</button>
              ))}
            </div>
          </div>
        )}

        {/* PASO 4: HORARIO */}
        {step===4 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">¿Cuándo y cuánto entrenás?</h1>
            <label className="block font-label-md text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">Horario habitual
              <input type="time" value={horarioEntreno} onChange={e=>setHorarioEntreno(e.target.value)} className={`mt-1.5 ${INPUT_CLS}`}/>
            </label>
            <label className="block font-label-md text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">Duración de sesión (min)
              <input type="number" value={duracionSesion} onChange={e=>setDuracionSesion(Number(e.target.value))} min={20} max={180} className={`mt-1.5 ${INPUT_CLS}`}/>
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
          <div className="space-y-4">
            <div>
              <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">Últimos datos para tu perfil</h1>
              <p className="font-body-sm text-sm text-on-surface-variant mt-1">Solo unos minutos: con esto personalizamos tu plan y tu coach.</p>
            </div>

            <StepSection title="Datos básicos" subtitle="Nombre y contacto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nombre *">
                  <input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Manuel" autoComplete="name" className={INPUT_CLS}/>
                </Field>
                <Field label="Correo electrónico *">
                  <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="manuel@mail.com" autoComplete="email" className={INPUT_CLS}/>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div id="ob-sexo" className="font-label-md text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1.5">Sexo</div>
                  <div className="flex gap-1.5" role="group" aria-labelledby="ob-sexo">
                    {(['M', 'F', 'X'] as const).map(s => (
                      <button key={s} type="button" onClick={() => setSexo(s)} aria-pressed={sexo === s} className={`flex-1 min-w-[44px] min-h-[44px] py-2.5 rounded-lg border font-body-md text-sm ${sexo === s ? 'bg-primary border-primary text-on-primary font-bold' : 'bg-surface-container-low/90 border-outline-variant text-on-surface'}`}>{SEX_LABEL[s]}</button>
                    ))}
                  </div>
                </div>
                <Field label={edad !== null ? `Fecha de nacimiento · ${edad} años` : 'Fecha de nacimiento'}>
                  <input type="date" value={fechaNacimiento} onChange={e=>setFechaNacimiento(e.target.value)} className={INPUT_CLS}/>
                </Field>
              </div>
              <div className="rounded-lg bg-surface-container-highest/60 p-2.5 font-body-sm text-xs text-on-surface-variant">
                Después configurás notificaciones (entreno, hidratación, check-in) en Perfil.
              </div>
            </StepSection>

            <StepSection title="Medidas corporales" subtitle="Opcional: mejora tus recomendaciones">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Peso kg">
                  <input value={peso} onChange={e=>setPeso(e.target.value)} type="number" step={0.1} inputMode="decimal" placeholder="80" className={INPUT_CLS}/>
                </Field>
                <Field label="Altura cm">
                  <input value={altura} onChange={e=>setAltura(e.target.value)} type="number" inputMode="numeric" placeholder="180" className={INPUT_CLS}/>
                </Field>
              </div>
              <Field label="Peso objetivo kg">
                <input value={pesoObjetivo} onChange={e=>setPesoObjetivo(e.target.value)} type="number" step={0.1} inputMode="decimal" placeholder="75" className={INPUT_CLS}/>
              </Field>
              <div className="rounded-lg bg-surface-container-highest/60 p-3 space-y-1">
                <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Tu IMC (calculado automáticamente)</div>
                {imc ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="font-headline-lg text-xl font-semibold text-on-surface">{imc}</span>
                      <span className="font-label-caps text-[10px] font-bold uppercase tracking-widest text-primary">{imcCat}</span>
                    </div>
                    <p className="font-body-sm text-xs text-on-surface-variant">Indicador orientativo: peso / altura².</p>
                  </>
                ) : (
                  <p className="font-body-sm text-xs text-on-surface-variant">Opcional: completa peso y altura para calcular IMC = peso / altura²</p>
                )}
                {pesoObjetivo && peso && <p className="font-body-sm text-xs text-on-surface-variant">Objetivo: {peso} → {pesoObjetivo} kg ({(Number(pesoObjetivo)-Number(peso)).toFixed(1)} kg)</p>}
              </div>
            </StepSection>

            <StepSection title="Contexto para el Coach" subtitle="Contale a tu entrenador virtual qué buscás">
              <textarea value={needs} onChange={e=>setNeeds(e.target.value)} placeholder="Quiero bajar grasa pero mantener músculo. Tengo poco tiempo..." rows={3} className={INPUT_CLS}/>
              <p className="font-body-sm text-xs text-on-surface-variant">Queda como contexto del Coach.</p>
            </StepSection>

            <StepSection title="Salud y limitaciones" subtitle="Para adaptar ejercicios, carga y sesiones">
              <div>
                <div id="ob-dolencia" className="font-label-md text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1.5">¿Tenés alguna dolencia o molestia?</div>
                <div className="flex gap-1.5" role="group" aria-labelledby="ob-dolencia">
                  {(['No','Sí'] as const).map(v=> (
                    <button key={v} type="button" onClick={()=>setHasPain(v)} aria-pressed={hasPain===v} className={`flex-1 min-w-[44px] min-h-[44px] py-3 rounded-lg border font-body-md text-sm ${hasPain===v?'bg-primary text-on-primary border-primary font-bold':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant text-on-surface'}`}>{v}</button>
                  ))}
                </div>
                {hasPain==='Sí' && (
                  <div className="mt-3 space-y-2">
                    <div className="font-label-md text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">¿Dónde?</div>
                    <div className="flex flex-wrap gap-1.5">
                      {['hombros','espalda','cuello','codos','muñecas','cadera','rodillas','tobillos','otra'].map(z=>(
                        <button key={z} type="button" onClick={()=>setPainAreas(a=> a.includes(z)? a.filter(x=>x!==z): [...a,z])} aria-pressed={painAreas.includes(z)} className={chipCls(painAreas.includes(z))}>{z}</button>
                      ))}
                    </div>
                    <input value={limDesc} onChange={e=>setLimDesc(e.target.value)} placeholder="Contanos cuál / detalles" className={INPUT_CLS}/>
                  </div>
                )}
              </div>
              <div className="pt-3 border-t border-outline-variant/30">
                <div className="font-label-md text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1.5">¿Tenés alguna restricción?</div>
                <div className="flex flex-wrap gap-1.5">
                  {['equipamiento','movimientos','ejercicios','tiempo','espacio'].map(r=>(
                    <button key={r} type="button" onClick={()=>setRestrictions(a=> a.includes(r)? a.filter(x=>x!==r): [...a,r])} aria-pressed={restrictions.includes(r)} className={chipCls(restrictions.includes(r))}>{r}</button>
                  ))}
                </div>
                <input value={restDesc} onChange={e=>setRestDesc(e.target.value)} placeholder="Otras restricciones" className={`mt-2 ${INPUT_CLS}`}/>
              </div>
            </StepSection>

            <StepSection title="Ejercicios que no querés hacer" subtitle="Se excluyen de recomendaciones y sustituciones">
              <button type="button" onClick={()=>setShowBiblio(true)} className="w-full min-h-[48px] py-3 rounded-lg bg-primary text-on-primary font-body-md text-sm font-semibold">Seleccionar ejercicios</button>
              {excluded.length>0 && (
                <div className="space-y-2">
                  <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Ejercicios excluidos ({excluded.length})</div>
                  {excluded.map(id=>(
                    <div key={id} className="flex items-center gap-2 bg-surface-container-highest/60 border border-outline-variant rounded-lg p-2">
                      <span className="flex-1 font-body-sm text-xs text-on-surface truncate capitalize">{prettyExId(id)}</span>
                      <button type="button" onClick={()=>setExcluded(e=> e.filter(x=>x!==id))} className="px-3 py-1 rounded-full bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Quitar</button>
                    </div>
                  ))}
                </div>
              )}
            </StepSection>

            {showBiblio && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 althea-modal" onClick={()=>setShowBiblio(false)}>
                <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border-t border-outline-variant rounded-t-2xl w-full max-w-lg lg:max-w-2xl max-h-[75vh] overflow-auto p-4 space-y-2">
                  <h3 className="font-headline-lg text-base font-semibold text-on-surface">Biblioteca</h3>
                  <select value={biblioMuscle} onChange={e=>setBiblioMuscle(e.target.value)} className="w-full bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-2 font-body-md text-sm text-on-surface">
                    <option value="__all__">Todos los grupos</option>
                    {TRADITIONAL_GROUPS.map(g=> <option key={g.id} value={g.id}>{g.label}</option>)}
                  </select>
                  <div className="flex flex-wrap gap-1.5">
                    {TRADITIONAL_GROUPS.map(g=>{
                      const items = biblioItems.filter(e=> e.group===g.id)
                      const n = items.filter(e=> excluded.includes(e.id)).length
                      const all = items.length>0 && n===items.length
                      return (
                        <button key={g.id} type="button" onClick={()=>setExcluded(toggleGroupExcluded(biblioItems, g.id, excluded))} aria-pressed={all} className={chipCls(all)}>{g.label} {n}/{items.length}</button>
                      )
                    })}
                  </div>
                  <div className="space-y-1 max-h-[50vh] overflow-auto">
                    {biblioItems.filter(e=> biblioMuscle==='__all__' || e.group===biblioMuscle).map(ex=>(
                      <div key={ex.id} className="rounded-lg bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-2 flex gap-2 items-center">
                        <img src={ex.gifUrl} alt={ex.name} className="w-16 h-16 rounded-lg object-contain bg-surface/60" loading="lazy" onError={e=> (e.target as HTMLImageElement).style.display='none'} />
                        <div className="flex-1 min-w-0">
                          <div className="font-body-md text-sm text-on-surface truncate flex items-center gap-1.5">{ex.name} <span className="font-label-md text-[9px] uppercase tracking-widest text-primary border border-primary/40 rounded px-1 py-0.5 shrink-0">Tradicional</span></div>
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
                  <button type="button" onClick={()=>setShowBiblio(false)} className="w-full min-h-[48px] py-3 rounded-lg bg-primary text-on-primary font-semibold">Listo</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-4 space-y-2">
        {err && <div className="rounded-lg bg-error/10 border border-error/30 p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-error">{err}</div>}
        <div className="flex gap-2">
          {step>0 && <button onClick={back} className="flex-1 py-4 rounded-lg bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant font-body-md text-sm text-on-surface">Atrás</button>}
          <button onClick={next} className="flex-1 py-4 rounded-lg bg-primary text-on-surface font-semibold">{step===6 ? 'COMENZAR →' : 'Siguiente →'}</button>
        </div>
      </div>
    </div>
  )
}