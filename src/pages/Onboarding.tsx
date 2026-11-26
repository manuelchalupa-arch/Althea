import { useState, useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, saveOnboardingDraft, getOnboardingDraft, clearOnboardingDraft } from '@/services/storage/db'
import * as Gym from '@/services/exerciseGym'
import { traditionalItems, toggleGroupExcluded, TRADITIONAL_GROUPS, type TraditionalItem } from '@/data/traditionalCatalog'
import { CoachIntensity, Goal, ExperienceLevel } from '@/types'
import { resolveTrainingGoal } from '@/utils/trainingGoal'
import { prettyExId } from '@/utils/format'
import { AltheaAvatar } from '@/components/brand/AltheaAvatar'

const OBJETIVOS = ['Perder grasa / bajar de peso','Ganar masa muscular','Aumentar fuerza','Mejorar resistencia','Mejorar condición física','Mejorar movilidad','Mantenerme','Recomposición corporal','Otro']
const NIVELES: { label: string; value: ExperienceLevel; detail: string }[] = [
  { label: 'Principiante', value: 'beginner', detail: 'Menos de 6 meses de entreno consistente' },
  { label: 'Intermedio', value: 'intermediate', detail: '6 meses a 3 años' },
  { label: 'Avanzado', value: 'advanced', detail: 'Más de 3 años de entreno estructurado' },
]
const DIAS_LABELS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
const EQUIPAMIENTO: { label: string; value: string }[] = [
  { label: 'Barra', value: 'barra' },
  { label: 'Mancuernas', value: 'mancuernas' },
  { label: 'Máquinas', value: 'maquina' },
  { label: 'Poleas', value: 'polea' },
  { label: 'Peso corporal', value: 'peso_corporal' },
  { label: 'Bandas elásticas', value: 'banda' },
  { label: 'Kettlebell', value: 'kettlebell' },
]
const COACH_INTENSIDAD: { value: CoachIntensity; label: string; description: string }[] = [
  { value: 'profesional', label: 'Profesional', description: 'Equilibrado y técnico, con exigencia medida' },
  { value: 'motivacional', label: 'Motivacional', description: 'Animador y de apoyo, celebra los logros' },
  { value: 'duro', label: 'Exigente', description: 'Directo y demandante, empuja al límite' },
  { value: 'extremo', label: 'Extremo', description: 'Máxima intensidad, sin excusas (con guardrails)' },
]
const MOVIMIENTOS = ['Sentadilla', 'Peso muerto', 'Press banca', 'Dominadas', 'Burpees', 'Saltos', 'Zancadas']
const INTENSIDAD_ENTRENO = [1, 2, 3, 4, 5]

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
  const total=8
  const [err,setErr]=useState<string|null>(null)
  const [draftLoaded,setDraftLoaded]=useState(false)

  // Obligatorios: solo entrenamiento
  const [modalidad,setModalidad]=useState<'gym'|'crossfit'|''>('')
  const [objPrincipal,setObjPrincipal]=useState('')
  const [objCustom,setObjCustom]=useState('')
  const [nivel,setNivel]=useState<ExperienceLevel | ''>('')
  const [diasDisponibles,setDiasDisponibles]=useState<number[]>([])
  const [equipamiento,setEquipamiento]=useState<string[]>([])
  const [hasPain,setHasPain]=useState<'Sí'|'No'>('No')
  const [painAreas,setPainAreas]=useState<string[]>([])
  const [limDesc,setLimDesc]=useState('')
  const [restrictions,setRestrictions]=useState<string[]>([])
  const [restDesc,setRestDesc]=useState('')
  const [excludedMovements,setExcludedMovements]=useState<string[]>([])
  const [excluded,setExcluded]=useState<string[]>([])

  // Opcionales, después del acceso al entrenamiento
  const [objSec,setObjSec]=useState<string[]>([])
  const [duracionSesion,setDuracionSesion]=useState(60)
  const [horarioEntreno,setHorarioEntreno]=useState('18:00')
  const [coachIntensity,setCoachIntensity]=useState<CoachIntensity>('profesional')
  const [needs,setNeeds]=useState('')
  const [intensidadEntreno,setIntensidadEntreno]=useState<number>(3)
  const [availabilityNotes,setAvailabilityNotes]=useState('')

  // Biblioteca local (no se persiste en el perfil)
  const [showBiblio,setShowBiblio]=useState(false)
  const [biblioMuscle,setBiblioMuscle]=useState('__all__')
  const [biblioItems,setBiblioItems]=useState<TraditionalItem[]>([])

  useEffect(()=>{
    if(showBiblio) {
      Gym.fetchAll()
        .then(r => setBiblioItems(traditionalItems(r.exercises || [])))
        .catch(()=>{})
    }
  },[showBiblio])

  useEffect(() => {
    getOnboardingDraft().then(draft => {
      if (draft) {
        setStep(Math.min(Number(draft.step) || 0, total - 1))
        const d: any = draft.data
        if (d.modalidad) { setModalidad(d.modalidad) }
        if (d.objPrincipal) { setObjPrincipal(d.objPrincipal) }
        if (d.objCustom) { setObjCustom(d.objCustom) }
        if (d.objSec) { setObjSec(d.objSec) }
        if (d.nivel) { setNivel(NIVELES.find(n=> n.label.toLowerCase()===String(d.nivel).toLowerCase() || n.value===d.nivel)?.value || '') }
        if (d.diasDisponibles) { setDiasDisponibles(d.diasDisponibles) }
        if (d.equipamiento) { setEquipamiento(d.equipamiento) }
        if (d.duracionSesion) { setDuracionSesion(d.duracionSesion) }
        if (d.horarioEntreno) { setHorarioEntreno(d.horarioEntreno) }
        if (d.coachIntensity) { setCoachIntensity(d.coachIntensity) }
        if (d.needs) { setNeeds(d.needs) }
        if (d.hasPain) { setHasPain(d.hasPain) }
        if (d.painAreas) { setPainAreas(d.painAreas) }
        if (d.limDesc) { setLimDesc(d.limDesc) }
        if (d.restrictions) { setRestrictions(d.restrictions) }
        if (d.restDesc) { setRestDesc(d.restDesc) }
        if (d.excludedMovements) { setExcludedMovements(d.excludedMovements) }
        if (d.excluded) { setExcluded(d.excluded) }
        if (d.intensidadEntreno) { setIntensidadEntreno(d.intensidadEntreno) }
        if (d.availabilityNotes) { setAvailabilityNotes(d.availabilityNotes) }
      }
      setDraftLoaded(true)
    }).catch(() => setDraftLoaded(true))
  }, [])

  const persistDraft = () => {
    saveOnboardingDraft(step, {
      modalidad, objPrincipal, objCustom, objSec, nivel, diasDisponibles, equipamiento,
      duracionSesion, horarioEntreno, coachIntensity, needs, hasPain, painAreas,
      limDesc, restrictions, restDesc, excludedMovements, excluded,
      intensidadEntreno, availabilityNotes,
    })
  }

  const validate = ():boolean=>{
    try{
      if(step===0 && !modalidad) {throw new Error('Elegí tu modalidad de entrenamiento')}
      if(step===1){
        if(!objPrincipal) {throw new Error('Seleccioná tu objetivo principal')}
        if(objPrincipal==='Otro' && !objCustom.trim()) {throw new Error('Especificá tu objetivo personalizado')}
      }
      if(step===2 && !nivel) {throw new Error('Seleccioná tu nivel de experiencia')}
      if(step===3 && diasDisponibles.length===0) {throw new Error('Seleccioná al menos un día disponible')}
      if(step===4 && equipamiento.length===0) {throw new Error('Seleccioná al menos un equipamiento disponible')}
      if(step===6){
        if(!horarioEntreno) {throw new Error('Seleccioná tu horario habitual')}
        if(duracionSesion < 20 || duracionSesion > 180) {throw new Error('Duración entre 20 y 180 minutos')}
      }
      setErr(null); return true
    }catch(e:any){ setErr(e?.message || 'Revisá los datos'); return false }
  }

  const next = ()=>{
    if(!validate()) {return}
    persistDraft()
    if(step < total-1) {setStep(s=>s+1)}
    else {crear().catch((e:any) => setErr(e?.message || 'No se pudo guardar tu perfil. Intentá de nuevo.'))}
  }
  const back = ()=> { persistDraft(); setStep(s=> Math.max(0,s-1)) }

  const crear = async ()=>{
    const selectedGoal: Goal = objPrincipal.includes('masa')?'hipertrofia': objPrincipal.includes('grasa')?'perdida_peso':
      objPrincipal.includes('fuerza')?'fuerza': objPrincipal.includes('resistencia')?'resistencia':
      objPrincipal.includes('movilidad')?'movilidad': objPrincipal.includes('recomposición')?'recomposicion':'mantenimiento'
    const allLimitations = [
      ...(hasPain==='Sí' ? ['dolor'] : []),
      ...restrictions,
    ]

    // Merge aditivo: conservar perfiles existentes y sus datos históricos.
    // No se calculan BMI/macros y no se crea ninguna planificación ni rutina.
    const existing:any = await db.userProfile.get('me') || { id:'me', createdAt: new Date().toISOString() }
    await db.userProfile.put({
      ...existing,
      trainingGoal: resolveTrainingGoal({ goal: selectedGoal, goalPrimary: objPrincipal }),
      goal: selectedGoal,
      goalPrimary: objPrincipal, goalsSecondary: objSec, customGoal: objCustom,
      needsDescription: needs,
      limitations: allLimitations, painAreas, limitationDescription: limDesc,
      restrictions, restrictionDescription: restDesc,
      excludedExercises: excluded,
      excludedMovements,
      availabilityNotes,
      level: nivel === 'beginner' ? 'principiante' : nivel === 'advanced' ? 'avanzado' : 'intermedio',
      experienceLevel: nivel,
      availableDays: diasDisponibles,
      equipment: equipamiento,
      sessionDurationMin: duracionSesion,
      trainingTime: horarioEntreno,
      schedule: { ...(existing.schedule || {}), availableDays: diasDisponibles, preferredTime: horarioEntreno, sessionTimeAvailable: duracionSesion },
      trainingModality: modalidad || undefined,
      trainingIntensity: intensidadEntreno as 1|2|3|4|5,
      coachIntensity,
      coachTone: existing.coachTone || undefined,
      onboardingDone: true,
      updatedAt: new Date().toISOString(),
    } as any)
    await clearOnboardingDraft()
    // Alta terminada: ahora la persona elige o crea su primera rutina.
    nav('/rutina?first=1')
  }

  if (!draftLoaded) {
    return <div className="p-8 text-center">Cargando…</div>
  }

  return (
    <div className="min-h-screen flex flex-col bg-transparent sm:px-5 lg:px-8 mx-auto">
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
        {/* 0 · MODALIDAD (obligatorio) */}
        {step===0 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">¿Cómo entrenás?</h1>
            <div className="grid gap-1">
              {([
                { value: 'gym', label: 'Gimnasio tradicional', desc: 'Rutina con ejercicios y series en el gimnasio' },
                { value: 'crossfit', label: 'CrossFit', desc: 'WODs, metcon y trabajo funcional' },
              ] as const).map(m=>(
                <button key={m.value} onClick={()=>setModalidad(m.value)} className={`p-4 rounded-lg border text-left font-body-md text-sm text-on-surface ${modalidad===m.value?'bg-primary text-on-surface border-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>
                  <div className="flex items-center justify-between"><span className="font-semibold">{m.label}</span>{modalidad===m.value&&'✓'}</div>
                  <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 1 · OBJETIVO PRINCIPAL (obligatorio) */}
        {step===1 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">¿Cuál es tu objetivo principal?</h1>
            <div className="grid gap-1">
              {OBJETIVOS.map(o=>(
                <button key={o} onClick={()=>setObjPrincipal(o)} className={`min-w-[44px] min-h-[44px] p-3 rounded-lg border text-left font-body-md text-sm text-on-surface ${objPrincipal===o?'bg-primary text-on-surface border-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{o} {objPrincipal===o&&'✓'}</button>
              ))}
            </div>
            {objPrincipal==='Otro' && <input value={objCustom} onChange={e=>setObjCustom(e.target.value)} placeholder="Especificá tu objetivo" className={`mt-2 ${INPUT_CLS}`}/>}
          </div>
        )}

        {/* 2 · NIVEL (obligatorio) */}
        {step===2 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">¿Cuál es tu nivel de experiencia?</h1>
            <div className="grid gap-1">
              {NIVELES.map(n=>(
                <button key={n.value} onClick={()=>setNivel(n.value)} className={`p-4 rounded-lg border text-left font-body-md text-sm text-on-surface ${nivel===n.value?'bg-primary text-on-surface border-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>
                  <div className="font-semibold">{n.label}</div>
                  <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">{n.detail}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 3 · DÍAS DISPONIBLES (obligatorio; no son la planificación) */}
        {step===3 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">¿Qué días podés entrenar?</h1>
            <p className="font-body-sm text-sm text-on-surface-variant">Disponibilidad, no días fijos: la rutina que elijas después define el calendario.</p>
            <div className="grid grid-cols-4 gap-1">
              {DIAS_LABELS.map((d,i)=>(
                <button key={d} onClick={()=>setDiasDisponibles(a=> a.includes(i)? a.filter(x=>x!==i):[...a,i])} className={`min-w-[44px] min-h-[44px] py-3 rounded-lg border font-body-md text-sm text-on-surface ${diasDisponibles.includes(i)?'bg-primary border-primary text-on-primary font-bold':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{d.slice(0,3)}</button>
              ))}
            </div>
          </div>
        )}

        {/* 4 · EQUIPAMIENTO (obligatorio) */}
        {step===4 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">¿Qué equipamiento tenés disponible?</h1>
            <div className="flex flex-wrap gap-1">
              {EQUIPAMIENTO.map(e=>(
                <button key={e.value} onClick={()=>setEquipamiento(a=> a.includes(e.value)? a.filter(x=>x!==e.value):[...a,e.value])} className={`min-w-[44px] min-h-[44px] px-3 py-2 rounded-lg border font-body-md text-sm text-on-surface ${equipamiento.includes(e.value)?'bg-primary border-primary text-on-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>{e.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* 5 · RESTRICCIONES / DOLENCIAS / MOVIMIENTOS EXCLUIDOS (obligatorio) */}
        {step===5 && (
          <div className="space-y-4">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">Restricciones para entrenar</h1>
            <p className="font-body-sm text-sm text-on-surface-variant">Si no tenés ninguna, seguí adelante.</p>
            <StepSection title="Dolencias" subtitle=" Para adaptar ejercicios y sustituciones">
              <div className="flex gap-1.5" role="group" aria-label="¿Tenés alguna dolencia o molestia?">
                {(['No','Sí'] as const).map(v=> (
                  <button key={v} type="button" onClick={()=>setHasPain(v)} aria-pressed={hasPain===v} className={`flex-1 min-w-[44px] min-h-[44px] py-3 rounded-lg border font-body-md text-sm ${hasPain===v?'bg-primary text-on-primary border-primary font-bold':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant text-on-surface'}`}>{v}</button>
                ))}
              </div>
              {hasPain==='Sí' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {['hombros','espalda','cuello','codos','muñecas','cadera','rodillas','tobillos','otra'].map(z=>(
                      <button key={z} type="button" onClick={()=>setPainAreas(a=> a.includes(z)? a.filter(x=>x!==z): [...a,z])} aria-pressed={painAreas.includes(z)} className={chipCls(painAreas.includes(z))}>{z}</button>
                    ))}
                  </div>
                  <input value={limDesc} onChange={e=>setLimDesc(e.target.value)} placeholder="Contanos cuál / detalles" className={INPUT_CLS}/>
                </div>
              )}
            </StepSection>
            <StepSection title="Otras restricciones" subtitle="Equipamiento, tiempo, espacio o movimientos">
              <div className="flex flex-wrap gap-1.5">
                {['equipamiento','movimientos','ejercicios','tiempo','espacio'].map(r=>(
                  <button key={r} type="button" onClick={()=>setRestrictions(a=> a.includes(r)? a.filter(x=>x!==r): [...a,r])} aria-pressed={restrictions.includes(r)} className={chipCls(restrictions.includes(r))}>{r}</button>
                ))}
              </div>
              <input value={restDesc} onChange={e=>setRestDesc(e.target.value)} placeholder="Detalle de restricciones" className={INPUT_CLS}/>
            </StepSection>
            <StepSection title="Movimientos que no querés hacer" subtitle="Se excluyen de recomendaciones y sustituciones">
              <div className="flex flex-wrap gap-1.5">
                {MOVIMIENTOS.map(m=>(
                  <button key={m} type="button" onClick={()=>setExcludedMovements(a=> a.includes(m)? a.filter(x=>x!==m): [...a,m])} aria-pressed={excludedMovements.includes(m)} className={chipCls(excludedMovements.includes(m))}>{m}</button>
                ))}
              </div>
              <button type="button" onClick={()=>setShowBiblio(true)} className="w-full min-h-[48px] py-3 rounded-lg bg-primary text-on-primary font-body-md text-sm font-semibold">Excluir ejercicios específicos</button>
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
                  <button type="button" onClick={()=>setShowBiblio(false)} className="w-full min-h-[48px] py-3 rounded-lg bg-primary text-on-primary font-semibold">Listo</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 6 · PREFERENCIAS (opcional) */}
        {step===6 && (
          <div className="space-y-4">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">Preferencias (opcional)</h1>
            <StepSection title="Objetivos secundarios" subtitle="Podés dejarlos sin marcar">
              <div className="flex flex-wrap gap-1">
                {OBJETIVOS.filter(o=>o!==objPrincipal).map(o=>(
                  <button key={o} onClick={()=>setObjSec(s=> s.includes(o)? s.filter(x=>x!==o):[...s,o])} className={chipCls(objSec.includes(o))}>{o}</button>
                ))}
              </div>
            </StepSection>
            <StepSection title="Sesión y horario" subtitle="Sirven para ajustar ejercicios, series, descansos y transiciones">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Duración de sesión (min)">
                  <input type="number" value={duracionSesion} onChange={e=>setDuracionSesion(Number(e.target.value))} min={20} max={180} className={INPUT_CLS}/>
                </Field>
                <Field label="Horario habitual">
                  <input type="time" value={horarioEntreno} onChange={e=>setHorarioEntreno(e.target.value)} className={INPUT_CLS}/>
                </Field>
              </div>
              <Field label="Intensidad de entrenamiento (1 suave · 5 exigente)">
                <div className="flex flex-wrap gap-1.5">
                  {INTENSIDAD_ENTRENO.map(n=>(
                    <button key={n} type="button" onClick={()=>setIntensidadEntreno(n)} aria-pressed={intensidadEntreno===n} className={chipCls(intensidadEntreno===n)}>{n}</button>
                  ))}
                </div>
              </Field>
              <Field label="Disponibilidad variable (opcional)">
                <input value={availabilityNotes} onChange={e=>setAvailabilityNotes(e.target.value)} placeholder="Ej.: turnos rotativos, some fines de semana" className={INPUT_CLS}/>
              </Field>
            </StepSection>
            <StepSection title="Estilo del Coach" subtitle="Es el tono de las respuestas, no la intensidad del entrenamiento">
              <div className="grid gap-1">
                {COACH_INTENSIDAD.map(c=>(
                  <button key={c.value} onClick={()=>setCoachIntensity(c.value)} className={`p-3 rounded-lg border text-left font-body-md text-sm text-on-surface ${coachIntensity===c.value?'bg-primary text-on-surface border-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>
                    <div className="flex items-center justify-between"><span className="font-semibold">{c.label}</span>{coachIntensity===c.value&&'✓'}</div>
                    <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">{c.description}</div>
                  </button>
                ))}
              </div>
              <Field label="Necesidades para el Coach (opcional)">
                <textarea value={needs} onChange={e=>setNeeds(e.target.value)} placeholder="Contale qué buscás..." rows={3} className={INPUT_CLS}/>
              </Field>
            </StepSection>
          </div>
        )}

        {/* 7 · CIERRE */}
        {step===7 && (
          <div className="space-y-3">
            <h1 className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">Todo listo</h1>
            <p className="font-body-md text-sm text-on-surface-variant">
              Tu perfil de entrenamiento queda guardado. Todavía no hay rutina asignada: al terminar vas a elegir o crear la primera.
            </p>
            <StepSection title="Resumen">
              <ul className="font-body-sm text-sm text-on-surface space-y-1">
                <li>Modalidad: {modalidad==='crossfit'?'CrossFit':'Gimnasio tradicional'}</li>
                <li>Objetivo: {objCustom || objPrincipal}</li>
                <li>Nivel: {NIVELES.find(n=>n.value===nivel)?.label}</li>
                <li>Días disponibles: {diasDisponibles.length}</li>
                <li>Equipamiento: {equipamiento.length}</li>
                <li>Sesión: {duracionSesion} min</li>
              </ul>
            </StepSection>
            <p className="font-body-sm text-xs text-on-surface-variant">Datos físicos y nutricionales se completan después, en Perfil y Nutrición.</p>
          </div>
        )}
      </div>

      <div className="p-4 space-y-2">
        {err && <div className="rounded-lg bg-error/10 border border-error/30 p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-error">{err}</div>}
        <div className="flex gap-2">
          {step>0 && <button onClick={back} className="flex-1 py-4 rounded-lg bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant font-body-md text-sm text-on-surface">Atrás</button>}
          <button onClick={next} className="flex-1 py-4 rounded-lg bg-primary text-on-surface font-semibold">{step===7 ? 'COMENZAR →' : 'Siguiente →'}</button>
        </div>
      </div>
    </div>
  )
}
