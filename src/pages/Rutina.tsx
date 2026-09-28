import { useEffect, useState, useMemo } from 'react'
import { db, ensureSeeded } from '@/services/storage/db'
import type { Exercise, UserProfile } from '@/types'
import { DEFAULT_CYCLE, type CycleConfig, type LoadState, LOAD_STATE_LABEL, LOAD_STATE_COLOR, getWeekLoads } from '@/utils/cycle'
import { v4 as uuid } from 'uuid'
import { Plus, Trash2, Clock, AlertTriangle, History, Dumbbell, Search, Eye, Sparkles, X, Check, RefreshCw } from 'lucide-react'
import BrandIcon from '@/components/brand/BrandIcon'
import { IconDumbbell, IconFire, IconLightning, IconBody, IconTarget } from '@/components/brand/FitnessIcons'
import { AltheaCard, AltheaBadge, AltheaButton, AltheaEmpty, AltheaLoading, StatusTag } from '@/components/althea'
import { generateRoutineWithAI, isRoutineAIAvailable, type GeneratedRoutine, type UserWants } from '@/services/ai/routineBuilderIA'
import { parseDayMuscles, displayMuscle } from '@/utils/muscleMap'
import { getActiveVersion, PROFILE_SCOPE } from '@/services/planning/cycleVersions'
import { getMethod } from '@/services/ai/trainingMethodsDB'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'
import * as Gym from '@/services/exerciseGym'
import { PeriodizationEditor } from '@/components/recovery/PeriodizationEditor'
import { MAX_ROUTINES } from '@/services/storage/routineStore'
import { todayKey, addDaysToKey, toDateKey, daysBetween } from '@/utils/dates'

const WEEK_LABELS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

// (E) Fecha de revisión por defecto al crear: creación + período de rotación.
const defaultReviewDate = (createdAtISO: string, rotationDays: number) => addDaysToKey(toDateKey(createdAtISO), rotationDays)

function getMethodDefaults(cycle: CycleConfig) {
  const method = cycle?.methodId ? getMethod(cycle.methodId) : undefined
  return {
    sets: method?.defaults.setsPerExercise ?? 3,
    reps: method?.defaults.repsRange?.[1] ?? 10,
    // Sin peso informado = null (nunca 0 por defecto).
    weight: null as number | null,
  }
}

type RutinaSeriesPlan = { reps: number; weight: number | null }
type RutinaDayExercise = {
  id:string; exId:string; sets:number; reps:number;
  /** null = sin peso informado. Nunca se escribe 0 por dejar el campo vacío. */
  weight:number | null;
  /** Plan POR SERIE: fuente de verdad cuando existe. */
  series?: RutinaSeriesPlan[]
  gifUrl?:string; name?:string; muscle?:string; imageDataUrl?:string; restSec?:number; seriesType?:string; tempo?:string; rir?:number; rpe?:number; notes?:string; routineExerciseId?:string
}
type RutinaData = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  rotationDays: number
  /** Fecha de revisión/vencimiento configurable (YYYY-MM-DD). */
  reviewDate?: string | null
  cycle: CycleConfig
  dayExercises: Record<number, RutinaDayExercise[]>
  version?: number
  archived?: boolean
}

// Texto de diferencia entre versiones para comparar sin modificar nada.
function diffText(d: { added: { day: number; name: string }[]; removed: { day: number; name: string }[]; changed: { day: number; name: string; from: string; to: string }[] }): string {
  const parts: string[] = []
  for (const a of d.added) { parts.push(`+ día ${a.day}: ${a.name}`) }
  for (const r of d.removed) { parts.push(`− día ${r.day}: ${r.name}`) }
  for (const c of d.changed) { parts.push(`~ día ${c.day}: ${c.name} (${c.from} → ${c.to})`) }
  return parts.length ? parts.join(' · ') : 'Sin diferencias.'
}

// Migración no destructiva: si existe viejo formato, convertir a lista
async function loadRoutines(): Promise<{ list: RutinaData[]; activeId: string | null }> {
  try {
    const { getAllRoutines, getActiveRoutineId, migrateRoutinesFromLocalStorage } = await import('@/services/storage/routineStore')
    await migrateRoutinesFromLocalStorage()
    const list = await getAllRoutines()
    const activeId = await getActiveRoutineId()
    if (list.length > 0) {return { list, activeId }}
  } catch {}
  const def: RutinaData = {
    id: 'r1', name: 'Rutina 1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    rotationDays: 30, cycle: DEFAULT_CYCLE, dayExercises: {}
  }
  return { list: [def], activeId: def.id }
}

async function saveRoutines(list: RutinaData[], activeId: string | null){
  try {
    const { saveAllRoutines } = await import('@/services/storage/routineStore')
    await saveAllRoutines(list, activeId)
  } catch {}
}

export default function RutinaPage(){
  const [exercises,setExercises]=useState<Exercise[]>([])
  const [routines,setRoutines]=useState<RutinaData[]>([])
  const [activeId,setActiveId]=useState<string | null>(null)
  const [routinesLoaded, setRoutinesLoaded] = useState(false)
  const active = routines.find(r=>r.id===activeId) || routines[0]
  const [pickerFor,setPickerFor]=useState<number|null>(null)
  const [showNew,setShowNew]=useState(false)
  // (E) Fecha de revisión al crear la rutina (configurable; vacío = creación + 30 días)
  const [newReviewDate,setNewReviewDate]=useState(()=>addDaysToKey(todayKey(),30))
  const [newName,setNewName]=useState('')
  const [selectorOpen,setSelectorOpen]=useState(false)
  const [rotationRec,setRotationRec]=useState<string|null>(null)
  const [viewer,setViewer]=useState<Gym.Exercise|null>(null)
  const [aiLoading,setAiLoading]=useState(false)
  const [aiError,setAiError]=useState<string|null>(null)
  const [aiPreview,setAiPreview]=useState<GeneratedRoutine|null>(null)
  const [showQuestionnaire,setShowQuestionnaire]=useState(false)
  const [showPeriodization,setShowPeriodization]=useState(false)
  const [versions,setVersions]=useState<RutinaData[]>([])
  const [versionNotice,setVersionNotice]=useState<string|null>(null)
  const [compareId,setCompareId]=useState<string|null>(null)

  const loadVersions = (id: string | null) => {
    if (!id) { setVersions([]); return }
    import('@/services/storage/routineStore').then(({ listRoutineVersions }) =>
      listRoutineVersions(id).then(v => {
        setVersions(v as unknown as RutinaData[])
        setCompareId(prev => prev ?? null)
      }).catch(() => {})
    ).catch(() => {})
  }

  useEffect(()=>{
    ensureSeeded().then(async()=>{
      const ex = await db.exercises.toArray(); setExercises(ex)
      // Load routines from Dexie (with migration from localStorage)
      const { list, activeId: aid } = await loadRoutines()
      setRoutines(list); setActiveId(aid); setRoutinesLoaded(true); loadVersions(aid)
      // si active no tiene cycle, intenta cargar de userProfile
      const p = await db.userProfile.get('me')
      const pv = await getActiveVersion(PROFILE_SCOPE).catch(() => null)
      const seedCycle = pv?.cycle ?? p?.cycle
      if(seedCycle && list.length===1 && JSON.stringify(list[0].cycle)===JSON.stringify(DEFAULT_CYCLE)){
        const upd = list.map(r=> r.id===aid ? {...r, cycle: seedCycle as CycleConfig} : r)
        setRoutines(upd); saveRoutines(upd, aid)
      }
    })
  },[])

  // sync active cycle a userProfile para que Inicio/Entrenar/Coach usen rutina activa
  useEffect(()=>{
    if(!active) {return}
    // FASE 1M-B — eliminada la sincronizacion legacy de cycle a userProfile.
    // El ciclo canonico vive en cycleVersions (saveRoutineVersioned/savePlanning);
    // profile.cycle queda como snapshot heredado de SOLO LECTURA (fallback).
    const days = Math.floor((Date.now() - new Date(active.createdAt).getTime())/86400000)
    if(days >= active.rotationDays){
      const hist = Object.values(active.dayExercises).flat().slice(0,3).map(x=> x.name || x.exId).join(', ')
      setRotationRec(`Tu rutina "${active.name}" lleva ${days} días (límite ${active.rotationDays}). Ejercicios: ${hist || '—'}. Sugerencia: revisá si algún ejercicio se estancó o molesta y considerá una variante del mismo grupo. Nada cambia sin tu decisión.`)
    } else {setRotationRec(null)}
  },[activeId, active])

  const updateActive = (fn:(r:RutinaData)=>RutinaData)=>{
    const changed = {...fn(routines.find(r=>r.id===activeId) as RutinaData), updatedAt: new Date().toISOString()}
    const next = routines.map(r=> r.id===activeId ? changed : r)
    setRoutines(next)
    // Versionado (ET13): si la rutina ya fue usada y cambió, se archiva vN.
    import('@/services/storage/routineStore').then(async ({ saveRoutineVersioned }) => {
      try {
        const { saved } = await saveRoutineVersioned(changed as never)
        const version = (saved as unknown as { version?: number }).version
        if (version) {
          const withV = next.map(r=> r.id===activeId ? {...r, version} : r)
          setRoutines(withV)
          saveRoutines(withV, activeId)
          setVersionNotice(`Versión v${version} guardada (anterior preservada).`)
          loadVersions(activeId)
          return
        }
      } catch { /* noop */ }
      saveRoutines(next, activeId)
    }).catch(()=> saveRoutines(next, activeId))
  }
  // ---- Plan POR SERIE: cada serie guarda sus propias reps/weight (C) -------
  const seriesRowsOf = (it: RutinaDayExercise): RutinaSeriesPlan[] =>
    Array.isArray(it.series) && it.series.length > 0
      ? it.series
      : Array.from({ length: Math.max(1, it.sets || 1) }, () => ({ reps: it.reps, weight: it.weight ?? null }))

  const writeSeries = (dayN:number, idx:number, rows: RutinaSeriesPlan[])=>{
    updateActive(r=>{
      const a=[...(r.dayExercises[dayN]||[])]
      const cur=a[idx]
      if(!cur) {return r}
      const clean = rows.length>0 ? rows : [{reps: cur.reps, weight: cur.weight ?? null}]
      a[idx]={...cur, sets: clean.length, reps: clean[0].reps, weight: clean[0].weight, series: clean}
      return {...r, dayExercises:{...r.dayExercises, [dayN]:a}}
    })
  }
  const patchSeriesRow = (dayN:number, idx:number, row:number, patch:Partial<RutinaSeriesPlan>)=>{
    const ex = (routines.find(r=>r.id===activeId) as RutinaData | undefined)?.dayExercises[dayN]?.[idx]
    if(!ex) {return}
    const rows = seriesRowsOf(ex).map((s,i)=> i===row ? {...s, ...patch} : s)
    writeSeries(dayN, idx, rows)
  }
  const addSeriesRow = (dayN:number, idx:number)=>{
    const ex = (routines.find(r=>r.id===activeId) as RutinaData | undefined)?.dayExercises[dayN]?.[idx]
    if(!ex) {return}
    const rows = seriesRowsOf(ex)
    writeSeries(dayN, idx, [...rows, {reps: rows[rows.length-1]?.reps ?? ex.reps, weight: rows[rows.length-1]?.weight ?? ex.weight ?? null}])
  }
  const removeSeriesRow = (dayN:number, idx:number, row:number)=>{
    const ex = (routines.find(r=>r.id===activeId) as RutinaData | undefined)?.dayExercises[dayN]?.[idx]
    if(!ex) {return}
    writeSeries(dayN, idx, seriesRowsOf(ex).filter((_,i)=> i!==row))
  }

  const setActive = (id:string)=>{
    setActiveId(id)
    loadVersions(id)
    import('@/services/storage/routineStore').then(({ setActiveRoutineId }) => setActiveRoutineId(id))
    // sync cycle
    const r = routines.find(x=>x.id===id)
    if(r) {db.userProfile.get('me').then(async p=>{
      const base: UserProfile = p ?? { id:'me', goal:'hipertrofia', trainingGoal:'hypertrophy', level:'intermedio', availableDays:[1,3,5], trainingTime:'18:00', equipment:['barra'], units:{weight:'kg',liquid:'ml'}, lang:'es', coachIntensity:'profesional', onboardingDone:true, hydrationGoalMl:2500, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }
      await db.userProfile.put({ ...base, cycle: r.cycle, updatedAt: new Date().toISOString() })
    })}
  }
  const createNew = ()=>{
    if(routines.length>=MAX_ROUTINES){
      alert(`Tenés ${MAX_ROUTINES} rutinas guardadas.\nPara crear otra rutina, modificá o eliminá una de las existentes.`)
      return
    }
    if(!newName.trim()){ alert('Ingresá un nombre'); return }
    const createdISO = new Date().toISOString()
    const data: RutinaData = {
      id: uuid(), name: newName.trim(), createdAt: createdISO, updatedAt: createdISO,
      rotationDays: 30, reviewDate: newReviewDate || defaultReviewDate(createdISO, 30), cycle: DEFAULT_CYCLE, dayExercises: {}
    }
    const next = [...routines, data]
    setRoutines(next); setActiveId(data.id); saveRoutines(next, data.id); setNewName(''); setShowNew(false); setNewReviewDate(addDaysToKey(todayKey(),30))
  }
  const duplicateRoutine = (id:string)=>{
    const src = routines.find(r=>r.id===id)
    if(!src) {return}
    import('@/services/storage/routineStore').then(async ({ MAX_ROUTINES }) => {
      if(routines.length>=MAX_ROUTINES){
        alert(`Tenés ${MAX_ROUTINES} rutinas guardadas.\nPara crear otra rutina, modificá o eliminá una de las existentes.`)
        return
      }
      const copyISO = new Date().toISOString()
      const copy: RutinaData = {
        ...JSON.parse(JSON.stringify(src)),
        id: uuid(), name: `${src.name} (copia)`,
        createdAt: copyISO, updatedAt: copyISO,
        // La copia es una rutina nueva: su revisión vuelve a crear + período.
        reviewDate: defaultReviewDate(copyISO, Number(src.rotationDays) || 30),
      }
      const next = [...routines, copy]
      setRoutines(next); setActiveId(copy.id); saveRoutines(next, copy.id)
    }).catch(()=>{})
  }
  const deleteRoutine = async (id:string)=>{
    if(!confirm('¿Eliminar esta rutina?\nEsta acción eliminará la rutina guardada y su configuración.')) {return}
    try {
      const { deleteRoutine: removeRoutine } = await import('@/services/storage/routineStore')
      await removeRoutine(id)
    } catch { /* noop */ }
    const next = routines.filter(r=>r.id!==id)
    let nextActive = activeId
    if(id===activeId){
      nextActive = next[0]?.id || null
    }
    setRoutines(next); setActiveId(nextActive); saveRoutines(next, nextActive)
    if(next.length===0){
      // queda sin rutina, muestra crear
      setShowNew(true)
    }
  }

  if(!active){
    return (
      <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 pb-24 max-w-[1440px] w-full mx-auto">
        <div className="flex items-center gap-2">
          <h1 className="font-headline-lg text-lg font-semibold text-on-surface flex items-center gap-2"><Dumbbell size={20} className="text-primary"/> Rutina</h1>
        </div>
        <AltheaEmpty
          icon="fitness_center"
          title="No hay rutinas guardadas"
          description="Creá tu primera rutina para organizar tus días de entrenamiento."
          action={<AltheaButton onClick={()=>setShowNew(true)} fullWidth size="lg"><Plus size={16}/> Nueva rutina</AltheaButton>}
          className="mt-6"
        />
        {showNew && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowNew(false)}>
            <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-md p-4 space-y-3">
              <h3 className="font-headline-lg text-base font-semibold text-on-surface">Crear nueva rutina</h3>
              <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Nombre: Rutina de verano" className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]"/>
              <label className="block space-y-1">
                <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Fecha de revisión</span>
                <input type="date" aria-label="Fecha de revisión al crear" value={newReviewDate} onChange={e=>setNewReviewDate(e.target.value)} className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]" />
                <span className="block font-body-sm text-[12px] text-on-surface-variant">El aviso se muestra en Inicio; nunca bloquea el entrenamiento.</span>
              </label>
              <div className="flex gap-2">
                <AltheaButton variant="secondary" fullWidth onClick={()=>setShowNew(false)}>Cancelar</AltheaButton>
                <AltheaButton fullWidth onClick={createNew}>Crear rutina</AltheaButton>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const daysElapsed = Math.floor((Date.now() - new Date(active.createdAt).getTime())/86400000)
  const estado = daysElapsed >= active.rotationDays ? 'Revisar' : daysElapsed >= active.rotationDays*0.8 ? 'Próximo a revisar' : 'Activa'

  return (
    <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 pb-24 max-w-[1440px] w-full mx-auto space-y-4">
      {/* Selector superior */}
      <AltheaCard className="p-3">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Rutina:</div>
        <button onClick={()=>setSelectorOpen(!selectorOpen)} aria-expanded={selectorOpen} className="mt-1 w-full flex items-center justify-between bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]">
          <span className="font-medium">{active.name}</span>
          <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">▼</span>
        </button>
        {selectorOpen && (
          <div className="mt-2 rounded bg-surface/60 border border-outline-variant p-2 space-y-1">
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Seleccionar rutina</div>
            {routines.map(r=>(
              <label key={r.id} className="flex items-center gap-2 p-2 rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant cursor-pointer min-h-[48px]">
                <input type="radio" name="rutina" checked={r.id===activeId} onChange={()=>{ setActive(r.id); setSelectorOpen(false)}} />
                <span className="font-body-md text-sm text-on-surface flex-1">{r.name} {r.id===activeId && '●'}</span>
                <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{r.id===activeId ? 'activa' : ''}</span>
              </label>
            ))}
            <AltheaButton fullWidth variant="primary" size="sm" onClick={()=>{ setSelectorOpen(false); setShowNew(true)}}><Plus size={14}/> Nueva rutina</AltheaButton>
            {isRoutineAIAvailable() && routines.length < 4 && (
              <AltheaButton fullWidth variant="secondary" size="sm" onClick={()=>{ setSelectorOpen(false); setShowQuestionnaire(true) }}>
                <Sparkles size={14}/> Crear con IA
              </AltheaButton>
            )}
          </div>
        )}
      </AltheaCard>

      <div className="flex items-center gap-2">
        <h1 className="font-headline-lg text-lg font-semibold text-on-surface flex items-center gap-2"><Dumbbell size={20} className="text-primary"/> {active.name}</h1>
        <AltheaBadge className="ml-auto" variant={estado==='Revisar' ? 'warning' : 'primary'}>{estado} · {daysElapsed}d</AltheaBadge>
      </div>

      {/* Rutina actual */}
      <AltheaCard className="space-y-2">
        <div className="flex gap-2 items-center">
          <input value={active.name} onChange={e=> updateActive(r=> ({...r, name: e.target.value}))} aria-label="Nombre de la rutina" className="flex-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface font-medium min-h-[48px]" />
          <AltheaButton variant="danger" onClick={()=>deleteRoutine(active.id)}><Trash2 size={14}/> Eliminar</AltheaButton>
          <AltheaButton variant="secondary" onClick={()=>duplicateRoutine(active.id)}>Duplicar</AltheaButton>
        </div>
        {versionNotice && (
          <p className="font-body-sm text-[12px] text-secondary">{versionNotice}</p>
        )}
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><Clock size={12}/> Creada {new Date(active.createdAt).toLocaleDateString('es')} · {daysElapsed} días</div>
        <div className="flex gap-2 items-center">
          <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Período para revisar</span>
          <select value={active.rotationDays} onChange={e=> updateActive(r=> ({...r, rotationDays: Number(e.target.value)}))} aria-label="Período para revisar" className="ml-auto bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]">
            <option value={20}>20 días</option><option value={30}>30 días</option><option value={45}>45 días</option><option value={60}>60 días</option>
          </select>
        </div>
        <div className="flex gap-2 items-center">
          <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Fecha de revisión</span>
          <input type="date" aria-label="Fecha de revisión" value={active.reviewDate ?? ''}
            onChange={e=> updateActive(r=> ({...r, reviewDate: e.target.value || null}))}
            className="ml-auto bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]" />
        </div>
        <p className="font-body-sm text-[12px] text-on-surface-variant">
          {(() => {
            const reviewKey = active.reviewDate || defaultReviewDate(active.createdAt, active.rotationDays)
            const left = daysBetween(todayKey(), reviewKey)
            return <span data-testid="routine-review-info">Vence el <strong>{reviewKey}</strong> ({left > 0 ? `en ${left} días` : `hace ${Math.abs(left)} días`}) · </span>
          })()}
          el aviso aparece en Inicio y nunca bloquea el entrenamiento.
        </p>
        {rotationRec && (
          <div className="rounded bg-tertiary/10 border border-tertiary/40 p-3">
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-tertiary flex items-center gap-1"><AlertTriangle size={12}/> Revisión inteligente</div>
            <p className="font-body-md text-sm text-on-surface mt-1">{rotationRec}</p>
            <div className="flex gap-1 mt-2">
              <AltheaButton size="sm" fullWidth onClick={()=>{ alert('Recomendación aceptada — editá los ejercicios'); setRotationRec(null)}}>Aceptar</AltheaButton>
              <AltheaButton size="sm" variant="secondary" fullWidth onClick={()=>setRotationRec(null)}>Rechazar</AltheaButton>
              <AltheaButton size="sm" variant="ghost" fullWidth onClick={()=>{ const n=prompt('Modificar días para revisar?'); if(n) {updateActive(r=> ({...r, rotationDays: Number(n)}))}}}>Modificar</AltheaButton>
            </div>
          </div>
        )}
      </AltheaCard>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-3">

      {/* Días N° */}
      <div className="space-y-3">
        {active.cycle.trainingDays.map(d=>{
          const exs = active.dayExercises[d.n] || []
          return (
            <AltheaCard key={d.n} className="space-y-3">
              <div className="flex justify-between items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-on-surface font-bold font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface">N°{d.n}</div>
                  <input value={d.name} onChange={e=>{
                    updateActive(r=> ({...r, cycle: {...r.cycle, trainingDays: r.cycle.trainingDays.map(x=> x.n===d.n? {...x, name:e.target.value}:x)}}))
                  }} aria-label={`Nombre del día N°${d.n}`} className="bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface min-h-[44px]" />
                </div>
                <AltheaButton size="sm" onClick={()=>setPickerFor(d.n)}><Plus size={14}/> Ejercicio</AltheaButton>
              </div>
              <div className="flex items-center gap-2">
                <StatusTag status="planned" />
                <span className="font-body-md text-xs text-on-surface-variant">{exs.length} ejercicio{exs.length===1?'':'s'} planificado{exs.length===1?'':'s'} · objetivo {exs.reduce((a,e)=>a+(e.sets||0),0)} series</span>
              </div>
              <div className="space-y-2">
                {exs.map((it,idx)=>{
                  const ex = exercises.find(e=>e.id===it.exId)
                  return (
                    <div key={it.id} className="rounded bg-surface/60 border border-outline-variant p-3">
                      <div className="flex justify-between">
                        <span className="font-body-md text-sm text-on-surface font-medium">{ex?.name || it.name || it.exId}</span>
                        <button onClick={()=>{
                          updateActive(r=> ({...r, dayExercises: {...r.dayExercises, [d.n]: (r.dayExercises[d.n]||[]).filter((_,i)=>i!==idx)}}))
                        }} aria-label={`Quitar ${ex?.name || it.name || it.exId}`} className="text-on-surface-variant min-h-[44px] min-w-[44px] flex items-center justify-center"><Trash2 size={14}/></button>
                      </div>
                      <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{ex?.groupMain || it.muscle || 'grupo'} · {ex?.equipment || ''} · objetivo {it.sets}×{it.reps} · {(it.weight ?? 0) > 0 ? `${it.weight}kg` : 'sin peso'}</div>
                       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 mt-2">
                        <input type="number" value={it.sets} onChange={e=>{
                          updateActive(r=>{
                            const a=[...(r.dayExercises[d.n]||[])]
                            const cur={...a[idx]}
                            const n=Math.max(1, Number(e.target.value)||1)
                            // Cambiar la cantidad de series ajusta el plan por serie
                            // (conserva las existentes y agrega/quit del final).
                            const prev = Array.isArray(cur.series) && cur.series.length
                              ? cur.series
                              : Array.from({length: cur.sets||1}, ()=>({reps: cur.reps, weight: cur.weight ?? null}))
                            const next = Array.from({length: n}, (_,k)=> prev[k] ?? {reps: cur.reps, weight: cur.weight ?? null})
                            a[idx]={...cur, sets:n, series: next}
                            return {...r, dayExercises:{...r.dayExercises, [d.n]:a}}
                          })
                        }} aria-label={`Series de ${ex?.name || it.name || it.exId}`} className="bg-surface border border-outline-variant rounded-lg p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant min-h-[48px]" placeholder="Series"/>
                        <input type="number" value={it.reps} onChange={e=>{
                          updateActive(r=>{
                            const a=[...(r.dayExercises[d.n]||[])]
                            const cur={...a[idx]}
                            const reps=Number(e.target.value)
                            a[idx]={...cur, reps, series: Array.isArray(cur.series) ? cur.series.map(s=>({...s, reps})) : cur.series}
                            return {...r, dayExercises:{...r.dayExercises, [d.n]:a}}
                          })
                        }} aria-label={`Repeticiones de ${ex?.name || it.name || it.exId}`} className="bg-surface border border-outline-variant rounded-lg p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant min-h-[48px]" placeholder="Reps"/>
                        <input type="number" value={it.weight ?? ''} onChange={e=>{
                          const v = e.target.value === '' ? null : Number(e.target.value)
                          updateActive(r=>{ const a=[...(r.dayExercises[d.n]||[])]; a[idx]={...a[idx], weight:v, series: Array.isArray(a[idx].series) ? a[idx].series!.map(s=>({...s, weight:v})) : a[idx].series }; return {...r, dayExercises:{...r.dayExercises, [d.n]:a}}})
                        }} aria-label={`Peso de ${ex?.name || it.name || it.exId}`} className="bg-surface border border-outline-variant rounded-lg p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant min-h-[48px]" placeholder="Peso"/>
                      </div>
                      {/* Plan POR SERIE: reps y peso propios de cada serie (C) */}
                      <div className="mt-3 border-t border-outline-variant/40 pt-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-label-caps text-[10px] uppercase tracking-wider text-outline">Plan por serie</span>
                          <button onClick={()=>addSeriesRow(d.n, idx)} aria-label={`Agregar serie a ${ex?.name || it.name || it.exId}`} className="rounded border border-outline-variant/60 px-2 py-1 min-h-[32px] font-label-caps text-[10px] uppercase text-on-surface-variant hover:border-secondary/50 hover:text-on-surface">+ Serie</button>
                        </div>
                        <div className="mt-2 space-y-1.5">
                          {seriesRowsOf(it).map((s, si)=>{
                            const label = ex?.name || it.name || it.exId
                            return (
                              <div key={si} className="flex items-center gap-1.5">
                                <span className="w-12 shrink-0 font-label-caps text-[9px] uppercase text-outline">S{si+1}</span>
                                <input type="number" value={s.reps} onChange={e=>patchSeriesRow(d.n, idx, si, {reps: Number(e.target.value)})} aria-label={`Reps serie ${si+1} de ${label}`} placeholder="Reps" className="w-full min-w-0 bg-surface border border-outline-variant rounded-lg px-2 py-2 min-h-[40px] font-label-md text-[11px] font-semibold text-on-surface-variant"/>
                                <input type="number" step="0.5" value={s.weight ?? ''} onChange={e=>patchSeriesRow(d.n, idx, si, {weight: e.target.value === '' ? null : Number(e.target.value)})} aria-label={`Peso serie ${si+1} de ${label}`} placeholder="Peso" className="w-full min-w-0 bg-surface border border-outline-variant rounded-lg px-2 py-2 min-h-[40px] font-label-md text-[11px] font-semibold text-on-surface-variant"/>
                                <button onClick={()=>removeSeriesRow(d.n, idx, si)} aria-label={`Quitar serie ${si+1} de ${label}`} className="shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center text-on-surface-variant hover:text-error" title="Quitar serie"><Trash2 size={13}/></button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      {/* Descanso y objetivos del ejercicio: viajan a la sesión (FASE cadena de datos) */}
                      <div className="mt-3 border-t border-outline-variant/40 pt-2">
                        <span className="font-label-caps text-[10px] uppercase tracking-wider text-outline">Descanso y objetivos</span>
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
                          <label className="font-label-caps text-[9px] uppercase text-outline tracking-wider">Descanso (s)
                            <input type="number" value={it.restSec ?? ''} onChange={e=>{
                              const v = e.target.value === '' ? undefined : Math.max(0, Number(e.target.value))
                              updateActive(r=>{ const a=[...(r.dayExercises[d.n]||[])]; a[idx]={...a[idx], restSec: v}; return {...r, dayExercises:{...r.dayExercises, [d.n]:a}} })
                            }} aria-label={`Descanso en segundos de ${ex?.name || it.name || it.exId}`} placeholder="90" className="w-full mt-1 bg-surface border border-outline-variant rounded-lg px-2 py-2 min-h-[44px] font-label-md text-[11px] font-semibold text-on-surface-variant" inputMode="numeric"/>
                          </label>
                          <label className="font-label-caps text-[9px] uppercase text-outline tracking-wider">Tipo de serie
                            <select value={it.seriesType || 'Normal'} onChange={e=>{
                              const v = e.target.value
                              updateActive(r=>{ const a=[...(r.dayExercises[d.n]||[])]; a[idx]={...a[idx], seriesType: v}; return {...r, dayExercises:{...r.dayExercises, [d.n]:a}} })
                            }} aria-label={`Tipo de serie de ${ex?.name || it.name || it.exId}`} className="w-full mt-1 bg-surface border border-outline-variant rounded-lg px-2 py-2 min-h-[44px] font-label-md text-[11px] font-semibold text-on-surface-variant">
                              <option>Normal</option><option>Ascendente</option><option>Descendente</option><option>Piramidal</option><option>DropSet</option><option>Otra</option>
                            </select>
                          </label>
                          <label className="font-label-caps text-[9px] uppercase text-outline tracking-wider">Tempo
                            <input type="text" value={it.tempo ?? ''} onChange={e=>{
                              const v = e.target.value.trim() || undefined
                              updateActive(r=>{ const a=[...(r.dayExercises[d.n]||[])]; a[idx]={...a[idx], tempo: v}; return {...r, dayExercises:{...r.dayExercises, [d.n]:a}} })
                            }} aria-label={`Tempo de ${ex?.name || it.name || it.exId}`} placeholder="3-1-1" className="w-full mt-1 bg-surface border border-outline-variant rounded-lg px-2 py-2 min-h-[44px] font-label-md text-[11px] font-semibold text-on-surface-variant"/>
                          </label>
                          <label className="font-label-caps text-[9px] uppercase text-outline tracking-wider">RIR
                            <input type="number" value={it.rir ?? ''} onChange={e=>{
                              const v = e.target.value === '' ? undefined : Number(e.target.value)
                              updateActive(r=>{ const a=[...(r.dayExercises[d.n]||[])]; a[idx]={...a[idx], rir: v}; return {...r, dayExercises:{...r.dayExercises, [d.n]:a}} })
                            }} aria-label={`RIR de ${ex?.name || it.name || it.exId}`} placeholder="—" className="w-full mt-1 bg-surface border border-outline-variant rounded-lg px-2 py-2 min-h-[44px] font-label-md text-[11px] font-semibold text-on-surface-variant" inputMode="numeric"/>
                          </label>
                          <label className="font-label-caps text-[9px] uppercase text-outline tracking-wider">RPE
                            <input type="number" value={it.rpe ?? ''} onChange={e=>{
                              const v = e.target.value === '' ? undefined : Number(e.target.value)
                              updateActive(r=>{ const a=[...(r.dayExercises[d.n]||[])]; a[idx]={...a[idx], rpe: v}; return {...r, dayExercises:{...r.dayExercises, [d.n]:a}} })
                            }} aria-label={`RPE de ${ex?.name || it.name || it.exId}`} placeholder="—" className="w-full mt-1 bg-surface border border-outline-variant rounded-lg px-2 py-2 min-h-[44px] font-label-md text-[11px] font-semibold text-on-surface-variant" inputMode="numeric"/>
                          </label>
                          <label className="font-label-caps text-[9px] uppercase text-outline tracking-wider">Notas
                            <input type="text" value={it.notes ?? ''} onChange={e=>{
                              const v = e.target.value.trim() || undefined
                              updateActive(r=>{ const a=[...(r.dayExercises[d.n]||[])]; a[idx]={...a[idx], notes: v}; return {...r, dayExercises:{...r.dayExercises, [d.n]:a}} })
                            }} aria-label={`Notas de ${ex?.name || it.name || it.exId}`} placeholder="—" className="w-full mt-1 bg-surface border border-outline-variant rounded-lg px-2 py-2 min-h-[44px] font-label-md text-[11px] font-semibold text-on-surface-variant"/>
                          </label>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {exs.length===0 && <AltheaEmpty icon="exercise" title={`Día N°${d.n} sin ejercicios`} description="Agregá ejercicios desde el selector inteligente según el grupo muscular del día." className="py-6" />}
              </div>
            </AltheaCard>
          )
        })}
        <AltheaButton
          fullWidth
          size="lg"
          variant="secondary"
          onClick={()=>{
          const n = Math.max(0,...active.cycle.trainingDays.map(d=>d.n))+1
          updateActive(r=> ({...r, cycle: {...r.cycle, trainingDays:[...r.cycle.trainingDays,{n, name:`Día N°${n}`} ]}}))
        }}><Plus size={16}/> Agregar Día N°</AltheaButton>
      </div>

      {/* Asignación calendario — estado de carga por día (NORMAL/SOBRECARGA/CARGA_REDUCIDA/CARGA_CERO) */}
      <AltheaCard>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Asignación calendario — carga semanal</div>
        <p className="font-body-sm text-[11px] text-on-surface-variant mt-1">Representa la planificación, no modifica pesos/repeticiones. Carga cero = día sin carga planificada.</p>
        {WEEK_LABELS.map((w,i)=>{
          const load = getWeekLoads(active.cycle)[i]
          return (
            <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded-lg p-2 mt-2">
              <div className="flex items-center gap-2">
                <span className="font-body-md text-sm text-on-surface w-10">{w}</span>
                <span className={`px-2 py-0.5 rounded-full border text-[9px] font-label-caps uppercase font-semibold tracking-wider ${LOAD_STATE_COLOR[load]}`}>{LOAD_STATE_LABEL[load]}</span>
              </div>
              <div className="flex gap-2">
                <select value={active.cycle.weekMap[i] ?? ''} onChange={e=>{
                  const wm=[...active.cycle.weekMap]; wm[i]= e.target.value ? Number(e.target.value):null
                  updateActive(r=> ({...r, cycle: {...r.cycle, weekMap: wm}}))
                }} aria-label={`Día de la semana ${w}`} className="flex-1 bg-surface border border-outline-variant rounded-lg p-2 font-body-md text-sm text-on-surface min-h-[48px]">
                  <option value="">Descanso</option>
                  {active.cycle.trainingDays.map(d=> <option key={d.n} value={d.n}>N°{d.n} — {d.name}</option>)}
                </select>
                <select value={load} onChange={e=>{
                  const loads = getWeekLoads(active.cycle).slice() as LoadState[]
                  loads[i] = e.target.value as LoadState
                  updateActive(r=> ({...r, cycle: {...r.cycle, weekLoads: loads}}))
                }} aria-label={`Nivel de carga del ${w}`} className="w-36 bg-surface border border-outline-variant rounded-lg p-2 font-label-md text-[10px] font-semibold uppercase text-on-surface min-h-[48px]">
                  <option value="NORMAL">Normal</option>
                  <option value="SOBRECARGA">Sobrecarga</option>
                  <option value="CARGA_REDUCIDA">Carga reducida</option>
                  <option value="CARGA_CERO">Carga cero</option>
                </select>
              </div>
            </div>
          )
        })}
      </AltheaCard>

      <AltheaCard>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><History size={14}/> Historial de rutinas</div>
        <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Rutina activa {active.name} · {daysElapsed} días. Otras {routines.length-1} guardadas intactas. Historial sesiones/setLogs conservado por rutina.</p>
        <div className="mt-2 flex gap-1 flex-wrap">
          {routines.map(r=> <span key={r.id} className={`px-2 py-1 rounded-full border font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${r.id===activeId?'bg-primary text-on-surface border-primary':'bg-surface/60 border-outline-variant'}`}>{r.name}</span>)}
        </div>
      </AltheaCard>

      <AltheaCard>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
          Versiones{active.version ? ` · actual v${active.version}` : ''}{versions.length > 0 ? ` · ${versions.length} histórica(s)` : ' · sin versiones previas'}
        </div>
        {versions.length > 0 && (
          <div className="mt-2 space-y-2">
            <div className="flex gap-1 flex-wrap">
              {versions.map(v=> <span key={v.id} className="px-2 py-1 rounded-full border bg-surface/60 border-outline-variant font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">v{v.version ?? '?'} · {new Date(v.updatedAt).toLocaleDateString('es')}</span>)}
            </div>
            <label className="block font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Comparar con actual
              <select value={compareId ?? ''} onChange={async e=>{
                const id = e.target.value || null
                setCompareId(id)
                if(id){
                  const { diffRoutines } = await import('@/services/storage/routineStore')
                  const old = versions.find(v=>v.id===id)
                  if(old){ setVersionNotice(diffText(diffRoutines(old as never, active as never))) }
                } else { setVersionNotice(null) }
              }} aria-label="Comparar con versión" className="w-full mt-1 bg-surface/60 border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]">
                <option value="">Sin comparar</option>
                {versions.map(v=> <option key={v.id} value={v.id}>v{v.version ?? '?'} · {new Date(v.updatedAt).toLocaleDateString('es')}</option>)}
              </select>
            </label>
          </div>
        )}
      </AltheaCard>

      <AltheaCard>
        <button onClick={()=>setShowPeriodization(v=>!v)} aria-expanded={showPeriodization} className="w-full flex items-center justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
          <span>Periodización avanzada (solo planificación futura)</span>
          <span>{showPeriodization ? 'Ocultar' : 'Ver'}</span>
        </button>
        {showPeriodization && (
          <div className="mt-3">
            <PeriodizationEditor onClose={()=>setShowPeriodization(false)} />
          </div>
        )}
      </AltheaCard>

      </div>

      <div className="lg:col-span-4 space-y-3 hidden lg:block">
        <AltheaCard className="space-y-2">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><Dumbbell size={14}/> Stats de la rutina</div>
          <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"><span>Días de entrenamiento</span><span className="font-body-md text-sm text-on-surface font-medium">{active.cycle.trainingDays.length}/semana</span></div>
          <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"><span>Total ejercicios</span><span className="font-body-md text-sm text-on-surface font-medium">{Object.values(active.dayExercises).flat().length}</span></div>
          <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"><span>Total series</span><span className="font-body-md text-sm text-on-surface font-medium">{Object.values(active.dayExercises).flat().reduce((a, e) => a + (e.sets || 0), 0)}</span></div>
        </AltheaCard>
        {active.cycle.methodId && (() => {
          const m = getMethod(active.cycle.methodId)
          return m ? (
            <AltheaCard className="space-y-2">
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-primary flex items-center gap-1"><Sparkles size={14}/> Método activo</div>
              <div className="font-body-md text-sm text-on-surface font-medium">{m.nameEs}</div>
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant leading-relaxed">{m.description.slice(0, 120)}…</div>
            </AltheaCard>
          ) : null
        })()}
        <AltheaCard className="space-y-2">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><AlertTriangle size={14}/> Tips rápidos</div>
          <ul className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant space-y-1.5 list-disc list-inside">
            <li>Mantené hidratación durante la sesión</li>
            <li>Respetá los descansos entre series</li>
            <li>Registrá cada ejercicio para progresión</li>
          </ul>
        </AltheaCard>
      </div>

      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowNew(false)}>
          <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-md p-4 space-y-3">
            <h3 className="font-headline-lg text-base font-semibold text-on-surface">Crear nueva rutina</h3>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Nombre:</p>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Rutina de verano" className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]"/>
            <label className="block space-y-1">
              <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Fecha de revisión</span>
              <input type="date" aria-label="Fecha de revisión al crear" value={newReviewDate} onChange={e=>setNewReviewDate(e.target.value)} className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]" />
              <span className="block font-body-sm text-[12px] text-on-surface-variant">El aviso se muestra en Inicio; nunca bloquea el entrenamiento.</span>
            </label>
            <div className="flex gap-2">
              <AltheaButton variant="secondary" fullWidth onClick={()=>setShowNew(false)}>Cancelar</AltheaButton>
              <AltheaButton fullWidth onClick={()=>{
                if(routines.length>=MAX_ROUTINES){ alert(`Tenés ${MAX_ROUTINES} rutinas guardadas.\nPara crear otra rutina, modificá o eliminá una de las existentes.`); return}
                if(!newName.trim()){ alert('Ingresá un nombre'); return}
                const createdISO2 = new Date().toISOString()
                const data: RutinaData = { id: uuid(), name: newName.trim(), createdAt: createdISO2, updatedAt: createdISO2, rotationDays:30, reviewDate: newReviewDate || defaultReviewDate(createdISO2, 30), cycle: DEFAULT_CYCLE, dayExercises:{}}
                const next=[...routines,data]; setRoutines(next); setActiveId(data.id); saveRoutines(next,data.id); setNewName(''); setShowNew(false); setNewReviewDate(addDaysToKey(todayKey(),30))
              }}>Crear rutina</AltheaButton>
            </div>
            {routines.length>=MAX_ROUTINES && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-error">Tenés {MAX_ROUTINES} rutinas guardadas. Para crear otra, eliminá una.</p>}
          </div>
        </div>
      )}

      {pickerFor!==null && (
        <IntelligentPicker
          dayN={pickerFor}
          dayName={active.cycle.trainingDays.find(d=>d.n===pickerFor)?.name || ''}
          existingIds={(active.dayExercises[pickerFor]||[]).map(e=>e.exId)}
          onAdd={(exId,gifUrl,name,muscle,imageDataUrl)=>{
            const d = getMethodDefaults(active.cycle)
            updateActive(r=> ({...r, dayExercises: {...r.dayExercises, [pickerFor!]: [...(r.dayExercises[pickerFor!]||[]), { id: uuid(), exId, sets:d.sets, reps:d.reps, weight:d.weight, gifUrl, name, muscle, imageDataUrl, series: Array.from({length:d.sets},()=>({reps:d.reps, weight:d.weight})) }]}}))
            setPickerFor(null)
          }}
          onAddMany={(items)=>{
            const d = getMethodDefaults(active.cycle)
            updateActive(r=> {
              const already = new Set((r.dayExercises[pickerFor!]||[]).map(e=>e.exId))
              const toAdd = items.filter(i=> !already.has(i.exId)).map(i=> ({ id: uuid(), exId: i.exId, sets:d.sets, reps:d.reps, weight:d.weight, gifUrl: i.gifUrl, name: i.name, muscle: i.muscle, imageDataUrl: i.imageDataUrl, series: Array.from({length:d.sets},()=>({reps:d.reps, weight:d.weight})) }))
              return {...r, dayExercises: {...r.dayExercises, [pickerFor!]: [...(r.dayExercises[pickerFor!]||[]), ...toAdd]}}
            })
            setPickerFor(null)
          }}
          onClose={()=>setPickerFor(null)}
          onView={setViewer}
        />
      )}

      {viewer && (
        <ExerciseViewer exercise={viewer} onClose={()=>setViewer(null)} onAdd={()=>{
          if(pickerFor!==null){
            const d = getMethodDefaults(active.cycle)
            updateActive(r=> ({...r, dayExercises: {...r.dayExercises, [pickerFor!]: [...(r.dayExercises[pickerFor!]||[]), { id: uuid(), exId: viewer.id, sets:d.sets, reps:d.reps, weight:d.weight, gifUrl: viewer.gifUrl, name: viewer.name, muscle: viewer.muscle, imageDataUrl: viewer.imageDataUrl, series: Array.from({length:d.sets},()=>({reps:d.reps, weight:d.weight})) }]}}))
          }
          setViewer(null); setPickerFor(null)
        }} />
      )}

      {/* AI Generation Loading */}
      {aiLoading && !aiPreview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-md p-6 space-y-4 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Sparkles size={32} className="text-on-primary animate-pulse"/>
            </div>
            <h3 className="font-headline-lg text-base font-semibold text-on-surface">Coach IA está pensando…</h3>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Analizando tu perfil, historial y estilo de coaching para generar una rutina personalizada.</p>
            <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full animate-pulse" style={{width:'60%'}}/>
            </div>
          </div>
        </div>
      )}

      {/* AI Generation Error */}
      {aiError && !aiLoading && !aiPreview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setAiError(null)}>
          <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-md p-4 space-y-3">
            <h3 className="font-headline-lg text-base font-semibold text-on-surface text-error">Error al generar</h3>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{aiError}</p>
            <div className="flex gap-2">
              <AltheaButton variant="secondary" fullWidth onClick={()=>setAiError(null)}>Cerrar</AltheaButton>
              <AltheaButton fullWidth onClick={()=>{ setAiError(null); setShowQuestionnaire(true) }}>Reintentar</AltheaButton>
            </div>
          </div>
        </div>
      )}

      {/* AI Preview Modal */}
      {aiPreview && (
        <RoutineAIPreview
          routine={aiPreview}
          onConfirm={(name)=>{
            if(routines.length>=MAX_ROUTINES){ alert(`Tenés ${MAX_ROUTINES} rutinas guardadas.`); return }
            const createdISO3 = new Date().toISOString()
            const data: RutinaData = {
              id: uuid(), name: name || aiPreview.name,
              createdAt: createdISO3, updatedAt: createdISO3,
              rotationDays: 30,
              reviewDate: defaultReviewDate(createdISO3, 30),
              cycle: { ...aiPreview.cycle, startDate: todayKey() },
              dayExercises: aiPreview.dayExercises
            }
            const next = [...routines, data]
            setRoutines(next); setActiveId(data.id); saveRoutines(next, data.id)
            setAiPreview(null)
          }}
          onRegenerate={()=>{ setAiPreview(null); setShowQuestionnaire(true) }}
          onClose={()=>setAiPreview(null)}
        />
      )}

      {/* AI Micro-Questionnaire */}
      {showQuestionnaire && (
        <RoutineAIQuestionnaire
          onGenerate={async(wants: UserWants)=>{
            setShowQuestionnaire(false)
            setAiLoading(true); setAiError(null)
            try{ const r = await generateRoutineWithAI(wants); setAiPreview(r) }
            catch(e:any){ setAiError(e.message) }
            finally{ setAiLoading(false) }
          }}
          onClose={()=>setShowQuestionnaire(false)}
        />
      )}
    </div>
  )
}

function IntelligentPicker({dayN, dayName, existingIds, onAdd, onAddMany, onClose, onView}:{dayN:number; dayName:string; existingIds:string[]; onAdd:(exId:string,gifUrl:string,name:string,muscle:string,imageDataUrl?:string)=>void; onAddMany:(items:{exId:string;gifUrl:string;name:string;muscle:string;imageDataUrl?:string}[])=>void; onClose:()=>void; onView:(ex:Gym.Exercise)=>void}){
  // Memo para que el array sea estable entre renders (el efecto de carga sólo
  // debe re-ejecutarse si cambian los músculos del día, no en cada render).
  const muscles = useMemo(() => parseDayMuscles(dayName), [dayName])
  const [q,setQ]=useState('')
  const [equipFilter,setEquipFilter]=useState('todos')
  const [muscleFilter,setMuscleFilter]=useState('todos')
  const [difficultyFilter,setDifficultyFilter]=useState('todos')
  const [selected,setSelected]=useState<string[]>([])
  const [items,setItems]=useState<Gym.Exercise[]>([])
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState<string|null>(null)
  const [methodHint,setMethodHint]=useState<{types:string[];avoid:string[]}|null>(null)
  const existingSet = new Set(existingIds)
  useEffect(()=>{
    if(muscles.length===0) {return}
    let cancelled=false
    // Load method hint for exercise prioritization
    db.userProfile.get('me').then(p=>{
      if(cancelled) {return}
      const cycle = p?.cycle
      if(cycle?.methodId){
        import('@/services/ai/trainingMethodsDB').then(({ getMethod })=>{
          if(cancelled) {return}
          const m = getMethod(cycle.methodId as TrainingMethodId)
          if(m) {setMethodHint({ types: m.exerciseSelection.primaryTypes, avoid: m.exerciseSelection.avoidExercises || [] })}
        })
      }
    }).catch(()=>{})
    const load = async ()=>{
      setLoading(true); setErr(null); setSelected([])
      try{
        const results = await Promise.all(muscles.map(m=> Gym.fetchByMuscle(m).catch((): {exercises:Gym.Exercise[]}=> ({exercises:[]})) ))
        let merged:Gym.Exercise[] = []
        const seen=new Set<string>()
        results.forEach(r=>{
          r.exercises?.forEach((ex:Gym.Exercise)=>{
            if(!seen.has(ex.id)){
              seen.add(ex.id); merged.push(ex)
            }
          })
        })
        try{
          const { listCustomExercises } = await import('@/services/training/customExercises')
          const customs:Gym.Exercise[] = []
          for(const m of muscles){ const cs = await listCustomExercises('muscle', m).catch(()=>[]); for(const c of cs){ if(!seen.has(c.id)){ seen.add(c.id); customs.push(c as unknown as Gym.Exercise) } } }
          merged.push(...customs)
          merged.sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'es'))
        }catch{ /* noop */ }
        if(merged.length===0 && !cancelled) {setErr('No encontramos ejercicios compatibles con este grupo muscular.\nProbá con otro grupo, equipamiento o término de búsqueda.')}
        if(!cancelled) {setItems(merged)}
      }catch(e:any){ if(!cancelled) {setErr(e.message)} }
      finally{ if(!cancelled) {setLoading(false)} }
    }
    load()
    return ()=>{ cancelled=true }
  },[muscles])

  const availableMuscles = Array.from(new Set(items.map(ex=>ex.muscle))).sort((a,b)=> displayMuscle(a).localeCompare(displayMuscle(b), 'es'))

  const filtered = items.filter(ex=>{
    if(muscleFilter!=='todos' && ex.muscle !== muscleFilter && !(ex.secondaryMuscles||[]).includes(muscleFilter)) {return false}
    if(equipFilter!=='todos' && ex.equipment !== equipFilter) {return false}
    if(difficultyFilter!=='todos' && String(ex.exerciseDifficulty||'').toLowerCase() !== difficultyFilter.toLowerCase()) {return false}
    if(q){
      const s=q.toLowerCase()
      const inName = (ex.name||'').toLowerCase().includes(s)
      const inMuscle = (ex.muscle||'').toLowerCase().includes(s)
      const inSecondary = (ex.secondaryMuscles||[]).some(m=> m.toLowerCase().includes(s))
      const inEquip = (ex.equipment||'').toLowerCase().includes(s)
      const inBody = (ex.bodyPart||'').toLowerCase().includes(s)
      const inCat = (ex.category||'').toLowerCase().includes(s)
      if(!(inName||inMuscle||inSecondary||inEquip||inBody||inCat)) {return false}
    }
    if(methodHint?.avoid?.length && methodHint.avoid.some(a => ex.name.toLowerCase().includes(a.toLowerCase()))) {return false}
    return true
  })

  // Sort: method primaryTypes first
  const sorted = methodHint?.types?.length ? [...filtered].sort((a,b) => {
    const aMatch = methodHint.types.some(t => (a.category||'').toLowerCase().includes(t) || (a.name||'').toLowerCase().includes(t)) ? 0 : 1
    const bMatch = methodHint.types.some(t => (b.category||'').toLowerCase().includes(t) || (b.name||'').toLowerCase().includes(t)) ? 0 : 1
    return aMatch - bMatch
  }) : filtered

  const toggleSelect = (ex:Gym.Exercise)=>{ setSelected(prev=> prev.includes(ex.id) ? prev.filter(id=>id!==ex.id) : [...prev, ex.id]) }
  const addAllSelected = ()=>{ onAddMany(selected.filter(id=>!existingSet.has(id)).map(id=>{ const ex = items.find(e=>e.id===id)!; return { exId: ex.id, gifUrl: ex.gifUrl, name: ex.name, muscle: ex.muscle, imageDataUrl: ex.imageDataUrl } })) }

  if(muscles.length===0){
    return (
      <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={onClose}>
        <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border-t border-outline-variant rounded-t-2xl w-full max-w-lg lg:max-w-2xl p-4 space-y-3">
          <h3 className="font-body-md text-sm text-on-surface font-medium">Agregar a N°{dayN}</h3>
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Día: <b>{dayName || 'Sin nombre'}</b> — no detectamos grupo muscular.</p>
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Escribí el grupo en el nombre del día, ej: <b>Pecho + Tríceps</b>, <b>Espalda</b>, <b>Piernas</b>.</p>
          <AltheaButton fullWidth variant="secondary" onClick={onClose}>Cerrar</AltheaButton>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border-t border-outline-variant rounded-t-2xl w-full max-w-lg lg:max-w-2xl max-h-[80vh] overflow-auto p-4 space-y-3">
        <h3 className="font-headline-lg text-base font-semibold text-on-surface">Agregar ejercicio</h3>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Día: <b>{dayName}</b> → {muscles.map(m=> displayMuscle(m)).join(' + ')} <span className="text-on-surface-variant">({muscles.join(', ')})</span></div>
        <div className="flex gap-1 flex-wrap">
          {muscles.map(m=> <span key={m} className="px-2 py-1 rounded-full bg-primary border border-outline-variant font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface">{displayMuscle(m)}</span>)}
        </div>
        {existingSet.size > 0 && (
          <div className="rounded-lg bg-secondary/10 border border-secondary/30 p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-secondary">
            {existingSet.size} ejercicio{existingSet.size===1?'':'s'} ya presente{existingSet.size===1?'':'s'} en este día (marcad{existingSet.size===1?'o':'os'} en la lista).
          </div>
        )}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-on-surface-variant"/>
          <input placeholder="Buscar por nombre, músculo, equipo..." value={q} onChange={e=>setQ(e.target.value)} className="w-full bg-surface border border-outline-variant rounded pl-9 p-3 font-body-md text-sm text-on-surface min-h-[48px]"/>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={muscleFilter} onChange={e=>setMuscleFilter(e.target.value)} aria-label="Filtrar por músculo" className="bg-surface border border-outline-variant rounded p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant min-h-[48px]">
            <option value="todos">Músculo: todos</option>
            {availableMuscles.map(m=> <option key={m} value={m}>{displayMuscle(m)}</option>)}
          </select>
          <select value={equipFilter} onChange={e=>setEquipFilter(e.target.value)} aria-label="Filtrar por equipamiento" className="bg-surface border border-outline-variant rounded p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant min-h-[48px]">
            <option value="todos">Equipo: todos</option>
            <option value="barbell">Barra</option><option value="dumbbell">Mancuernas</option><option value="cable">Polea</option><option value="bodyweight">Peso corporal</option><option value="machine">Máquina</option><option value="band">Banda</option>
          </select>
          <select value={difficultyFilter} onChange={e=>setDifficultyFilter(e.target.value)} aria-label="Filtrar por dificultad" className="bg-surface border border-outline-variant rounded p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant min-h-[48px]">
            <option value="todos">Dificultad: todas</option>
            <option value="principiante">Principiante</option><option value="intermedio">Intermedio</option><option value="avanzado">Avanzado</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant self-center">{sorted.length} compatibles · {selected.length} seleccionado{selected.length===1?'':'s'}</span>
          {selected.length>0 && (
            <AltheaButton size="sm" onClick={addAllSelected}><Check size={14}/> Agregar {selected.length} seleccionado{selected.length===1?'':'s'}</AltheaButton>
          )}
        </div>
        {methodHint && (
          <div className="rounded-lg bg-surface/60 border border-outline-variant p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            <span className="text-primary font-medium">Método:</span> priorizando {methodHint.types.join(', ')}
          </div>
        )}
        {loading && <AltheaLoading lines={3} />}
        {err && !loading && sorted.length===0 && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-error text-center py-4 whitespace-pre-line">{err}</p>}
        {!loading && sorted.length===0 && !err && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-center py-4">Sin ejercicios para este filtro. Probá otro equipamiento o búsqueda.</p>}
        <div className="grid grid-cols-1 gap-3 max-h-[45vh] overflow-auto pr-1">
          {sorted.slice(0,60).map(ex=>{
            const isExisting = existingSet.has(ex.id)
            const isSelected = selected.includes(ex.id)
            const secs = (ex.secondaryMuscles||[]).slice(0,2)
            return (
            <div key={ex.id} className={`rounded  bg-surface-container-low/90 backdrop-blur-sm border ${isSelected?'border-primary':'border-outline-variant'} overflow-hidden ${isExisting?'opacity-60':''}`}>
              <div className="flex items-start">
                <button onClick={()=>toggleSelect(ex)} disabled={isExisting} className={`shrink-0 m-3 w-6 h-6 rounded-full border flex items-center justify-center ${isExisting?'border-outline-variant':isSelected?'bg-primary border-primary text-on-surface':'border-outline-variant text-on-surface-variant'}`} aria-label={isExisting?`${ex.name} ya está en el día`:`Seleccionar ${ex.name}`} aria-pressed={isSelected}>
                  {isExisting ? <History size={12}/> : isSelected ? <Check size={12}/> : null}
                </button>
                <div className="flex flex-col sm:flex-row flex-1 min-w-0">
                  <div className="h-24 sm:h-28 sm:w-40 bg-surface/60 border-b sm:border-b-0 sm:border-r border-outline-variant flex items-center justify-center overflow-hidden shrink-0">
                    {(ex.gifUrl || ex.imageDataUrl) ? <img src={ex.gifUrl || ex.imageDataUrl} alt={ex.name} loading="lazy" className="w-full h-full object-cover" onError={e=>{ (e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }} /> : null}
                    <div className="hidden p-4 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-center">Vista alternativa — {ex.name}</div>
                  </div>
                  <div className="p-3 min-w-0">
                    <div className="font-body-md text-sm text-on-surface font-medium flex items-center gap-2 flex-wrap">
                      <span className="truncate">{ex.name}</span>
                      {ex.origin==='USER_CREATED' ? <AltheaBadge variant="secondary" className="shrink-0 text-[10px]">Mío</AltheaBadge> : null}
                      {isExisting ? <AltheaBadge variant="outline" className="shrink-0 text-[10px]">En este día</AltheaBadge> : null}
                    </div>
                    <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">
                      <span className="text-primary">{displayMuscle(ex.muscle)}</span>{secs.length>0 ? <> + {secs.map(s=>displayMuscle(s)).join(' · ')}</> : null} · {ex.equipment}
                    </div>
                    {String(ex.exerciseDifficulty||'') && <div className="font-label-md text-[9px] font-semibold uppercase tracking-widest text-on-surface-variant mt-0.5">{ex.exerciseDifficulty} · {ex.category}</div>}
                    <div className="flex gap-2 mt-2">
                      <AltheaButton size="sm" variant="secondary" fullWidth onClick={()=> onView(ex)}><Eye size={14}/> Ver</AltheaButton>
                      <AltheaButton size="sm" fullWidth onClick={()=> onAdd(ex.id, ex.gifUrl, ex.name, ex.muscle, ex.imageDataUrl)}>AGREGAR</AltheaButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )
          })}
        </div>
        <AltheaButton fullWidth variant="secondary" onClick={onClose}>Cerrar</AltheaButton>
      </div>
    </div>
  )
}

function ExerciseViewer({exercise, onClose, onAdd}:{exercise:Gym.Exercise; onClose:()=>void; onAdd:()=>void}){
  const [err,setErr]=useState(false)
  const [loading,setLoading]=useState(true)
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-2 md:p-6" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-surface/80 backdrop-blur-md border-b border-outline-variant p-4 flex justify-between items-center">
          <div>
            <div className="font-headline-lg text-base font-semibold text-on-surface">{exercise.name}</div>
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{displayMuscle(exercise.muscle)} · {exercise.equipment} · {exercise.bodyPart} · {exercise.category}</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-surface border border-outline-variant flex items-center justify-center font-body-md text-sm text-on-surface"><BrandIcon name="close" size={16}/></button>
        </div>
        <div className="p-4">
          <div className="rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant overflow-hidden flex items-center justify-center min-h-[280px] md:min-h-[400px] p-2">
            {loading && !err && <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Cargando ejercicio...</span>}
            {(!err && (exercise.gifUrl || exercise.imageDataUrl)) ? (
              <img
                src={exercise.imageDataUrl || exercise.gifUrl}
                alt={exercise.name}
                className="max-w-full max-h-[60vh] md:max-h-[65vh] w-auto h-auto object-contain"
                onLoad={()=>setLoading(false)}
                onError={()=>{ setErr(true); setLoading(false)}}
              />
            ) : (
              <div className="text-center p-6">
                <p className="font-body-md text-sm text-on-surface">No se pudo cargar la animación.</p>
                <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Podés continuar agregando el ejercicio a la rutina.</p>
              </div>
            )}
          </div>
          {exercise.instructions?.length>0 && (
            <div className="mt-3 rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3">
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Instrucciones</div>
              <ol className="list-decimal list-inside font-body-md text-sm text-on-surface space-y-1 mt-1">
                {exercise.instructions.map((s,i)=><li key={i}>{s}</li>)}
              </ol>
            </div>
          )}
          <AltheaButton fullWidth size="lg" onClick={onAdd}>AGREGAR A RUTINA</AltheaButton>
        </div>
      </div>
    </div>
  )
}

function RoutineAIPreview({routine, onConfirm, onRegenerate, onClose}:{routine:GeneratedRoutine; onConfirm:(name:string)=>void; onRegenerate:()=>void; onClose:()=>void}){
  const [name,setName]=useState(routine.name)
  const method = routine.cycle.methodId ? getMethod(routine.cycle.methodId) : null
  const totalExercises = Object.values(routine.dayExercises).flat().length
  const totalSets = Object.values(routine.dayExercises).flat().reduce((a,e)=>a+(e.sets||0),0)
  const WEEK=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-0 md:p-4" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="bg-surface/60 border-t md:border border-outline-variant rounded-t-2xl md:rounded-2xl w-full max-w-lg lg:max-w-2xl max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-surface/80 backdrop-blur-md border-b border-outline-variant p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center"><Sparkles size={16} className="text-on-primary"/></div>
            <div>
              <div className="font-headline-lg text-base font-semibold text-on-surface">Rutina generada por IA</div>
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{method?.nameEs || routine.cycle.methodId} · {routine.cycle.trainingDays.length} días</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface border border-outline-variant flex items-center justify-center"><X size={16}/></button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2 p-4">
          <div className="rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 text-center">
            <div className="text-lg font-bold text-primary">{routine.cycle.trainingDays.length}</div>
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Días/semana</div>
          </div>
          <div className="rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 text-center">
            <div className="text-lg font-bold text-primary">{totalExercises}</div>
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Ejercicios</div>
          </div>
          <div className="rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 text-center">
            <div className="text-lg font-bold text-primary">{totalSets}</div>
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Series totales</div>
          </div>
        </div>

        {/* Method + justification */}
        {routine.cycle.methodJustification && (
          <div className="mx-4 rounded bg-primary border border-outline-variant p-3">
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-primary">¿Por qué este método?</div>
            <p className="font-body-md text-sm text-on-surface mt-1">{routine.cycle.methodJustification}</p>
          </div>
        )}

        {/* Calendar week map */}
        <div className="px-4 mt-3">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1">Calendario semanal</div>
          <div className="grid grid-cols-7 gap-1">
            {WEEK.map((w,i)=>{
              const dayN = routine.cycle.weekMap[i]
              const day = routine.cycle.trainingDays.find(d=>d.n===dayN)
              return (
                <div key={i} className={`rounded-lg p-2 text-center text-xs ${dayN !== null ? 'bg-primary/20 border border-primary/40 text-primary' : 'bg-surface border border-outline-variant font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant'}`}>
                  <div className="font-medium">{w}</div>
                  <div className="mt-0.5">{dayN !== null ? `N°${dayN}` : '—'}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Days with exercises */}
        <div className="p-4 space-y-3">
          {routine.cycle.trainingDays.map(d=>{
            const exs = routine.dayExercises[d.n] || []
            return (
              <div key={d.n} className="rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-on-surface font-bold font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface">N°{d.n}</div>
                  <div className="font-body-md text-sm text-on-surface font-medium">{d.name}</div>
                  <span className="ml-auto font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{exs.length} ejercicios</span>
                </div>
                <div className="space-y-1">
                  {exs.map((ex,i)=>(
                    <div key={i} className="flex items-center gap-2 bg-surface/60 rounded-lg p-2 border border-outline-variant">
                      <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant w-5">{i+1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-body-md text-sm text-on-surface truncate">{ex.name || ex.exId}</div>
                        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{ex.muscle || '—'} · {ex.sets}×{ex.reps}{ex.weight > 0 ? ` · ${ex.weight}kg` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Explanation */}
        {routine.explanation && (
          <div className="mx-4 mb-4 rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2">
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-primary flex items-center gap-1"><Sparkles size={12}/> Explicación del Coach IA</div>
            <div className="space-y-1">
              {routine.explanation.goal && <p className="font-body-md text-sm text-on-surface"><span className="font-medium">Objetivo:</span> {routine.explanation.goal}</p>}
              {routine.explanation.method && <p className="font-body-md text-sm text-on-surface"><span className="font-medium">Método:</span> {routine.explanation.method}</p>}
              {routine.explanation.distribution && <p className="font-body-md text-sm text-on-surface"><span className="font-medium">Distribución:</span> {routine.explanation.distribution}</p>}
              {routine.explanation.intensity && <p className="font-body-md text-sm text-on-surface"><span className="font-medium">Intensidad:</span> {routine.explanation.intensity}</p>}
              {routine.explanation.progression && <p className="font-body-md text-sm text-on-surface"><span className="font-medium">Progresión:</span> {routine.explanation.progression}</p>}
            </div>
            {routine.explanation.keyFeatures?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {routine.explanation.keyFeatures.map((f,i)=>(
                  <span key={i} className="px-2 py-0.5 rounded-full bg-primary border border-outline-variant font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{f}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Name input + actions */}
        <div className="sticky bottom-0 bg-surface/80 backdrop-blur-md border-t border-outline-variant p-4 space-y-3">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre de la rutina" className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface"/>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-3 rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant font-body-md text-sm text-on-surface flex items-center justify-center gap-1"><X size={14}/> Descartar</button>
            <button onClick={onRegenerate} className="py-3 px-4 rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant font-body-md text-sm text-on-surface flex items-center justify-center gap-1"><RefreshCw size={14}/></button>
            <button onClick={()=>onConfirm(name)} className="flex-[2] py-3 rounded bg-primary text-on-surface font-medium flex items-center justify-center gap-1"><Check size={14}/> Guardar rutina</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RoutineAIQuestionnaire({onGenerate, onClose}:{onGenerate:(wants:UserWants)=>void; onClose:()=>void}){
  const [step,setStep]=useState(0)
  const [goal,setGoal]=useState('hipertrofia')
  const [days,setDays]=useState(4)
  const [focus,setFocus]=useState('general')
  const [injury,setInjury]=useState('')

  const goals = [
    { id:'hipertrofia', label:'Hipertrofia', desc:'Más músculo y tamaño', icon:<IconDumbbell className="w-5 h-5" /> },
    { id:'fuerza', label:'Fuerza', desc:'Más peso en compuestos', icon:<IconFire className="w-5 h-5" /> },
    { id:'perdida_grasa', label:'Pérdida de grasa', desc:'Definición y calorías', icon:<IconLightning className="w-5 h-5" /> },
    { id:'resistencia', label:'Resistencia', desc:'Más repeticiones y stamina', icon:<IconBody className="w-5 h-5" /> },
    { id:'general', label:'General', desc:'Fitness y bienestar', icon:<IconTarget className="w-5 h-5" /> },
  ]
  const focuses = [
    { id:'general', label:'General', desc:'Todos los grupos musculares' },
    { id:'tren_superior', label:'Tren superior', desc:'Pecho, espalda, hombros, brazos' },
    { id:'tren_inferior', label:'Tren inferior', desc:'Piernas, glúteos, gemelos' },
    { id:'empuje_tirón', label:'Empuje / Tirón', desc:'Días divididos por patrón' },
    { id:'cuerpo_completo', label:'Cuerpo completo', desc:'Todos los músculos cada día' },
  ]

  const GOAL_MAP: Record<string, string> = {
    hipertrofia: 'Hipertrofia — volumen y crecimiento muscular',
    fuerza: 'Fuerza — maksimizar carga en ejercicios compuestos',
    perdida_grasa: 'Pérdida de grasa — déficit calórico y quema',
    resistencia: 'Resistencia muscular — repeticiones altas y endurecimiento',
    general: 'Fitness general — salud, bienestar y rendimiento',
  }

  const canNext = step < 3
  const canGenerate = step === 3

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-0 md:p-4" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="bg-surface/60 border-t md:border border-outline-variant rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-surface/80 backdrop-blur-md border-b border-outline-variant p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center"><Sparkles size={16} className="text-on-primary"/></div>
            <div>
              <div className="font-headline-lg text-base font-semibold text-on-surface">Crear rutina con IA</div>
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Paso {step+1} de 4</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface border border-outline-variant flex items-center justify-center"><X size={16}/></button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-surface"><div className="h-full bg-gradient-to-r from-primary to-secondary transition-all" style={{width:`${((step+1)/4)*100}%`}}/></div>

        {/* Step 0: Goal */}
        {step===0 && (
          <div className="p-4 space-y-3">
            <h3 className="font-body-md text-sm text-on-surface font-medium">¿Qué buscás con esta rutina?</h3>
            <div className="space-y-2">
              {goals.map(g=>(
                <button key={g.id} onClick={()=>setGoal(g.id)} className={`w-full text-left rounded border p-3 flex items-center gap-3 transition-all ${goal===g.id ? 'bg-primary/20 border-primary' : 'bg-surface border-outline-variant hover:border-outline-variant'}`}>
                  <span className="text-primary">{g.icon}</span>
                  <div>
                    <div className="font-body-md text-sm text-on-surface font-medium">{g.label}</div>
                    <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{g.desc}</div>
                  </div>
                  {goal===g.id && <Check size={16} className="ml-auto text-primary"/>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Days */}
        {step===1 && (
          <div className="p-4 space-y-3">
            <h3 className="font-body-md text-sm text-on-surface font-medium">¿Cuántos días por semana entrenás?</h3>
            <div className="grid grid-cols-5 gap-2">
              {[2,3,4,5,6].map(d=>(
                <button key={d} onClick={()=>setDays(d)} className={`py-4 rounded border text-center font-bold text-lg transition-all ${days===d ? 'bg-primary text-on-surface border-primary' : 'bg-surface border-outline-variant font-body-md text-sm text-on-surface'}`}>
                  {d}
                </button>
              ))}
            </div>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-center">{days === 2 ? 'Tren superior / Tren inferior' : days === 3 ? 'Empuje / Tirón / Piernas' : days === 4 ? 'Upper/Lower o Push/Pull/Legs+' : days === 5 ? 'Cuerpo completo + énfasis' : 'Push/Pull/Legs, 2x cada uno'}</p>
          </div>
        )}

        {/* Step 2: Focus */}
        {step===2 && (
          <div className="p-4 space-y-3">
            <h3 className="font-body-md text-sm text-on-surface font-medium">¿Qué enfoque preferís?</h3>
            <div className="space-y-2">
              {focuses.map(f=>(
                <button key={f.id} onClick={()=>setFocus(f.id)} className={`w-full text-left rounded border p-3 transition-all ${focus===f.id ? 'bg-primary/20 border-primary' : 'bg-surface border-outline-variant'}`}>
                  <div className="font-body-md text-sm text-on-surface font-medium">{f.label}</div>
                  <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{f.desc}</div>
                  {focus===f.id && <Check size={14} className="mt-1 text-primary"/>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Injuries */}
        {step===3 && (
          <div className="p-4 space-y-3">
            <h3 className="font-body-md text-sm text-on-surface font-medium">¿Tenés alguna lesión o limitación?</h3>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">La IA evitará ejercicios que puedan empeorar tu condición.</p>
            <textarea value={injury} onChange={e=>setInjury(e.target.value)} placeholder="Ej: dolor en hombro derecho, rodilla sensible, nada..." className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface h-24 resize-none"/>
            <div className="flex gap-2">
              <button onClick={()=>setInjury('')} className={`px-3 py-2 rounded border font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${!injury ? 'bg-primary/20 border-primary text-primary' : 'bg-surface border-outline-variant'}`}>Ninguna</button>
              <button onClick={()=>setInjury('hombro')} className={`px-3 py-2 rounded border font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${injury==='hombro' ? 'bg-primary/20 border-primary text-primary' : 'bg-surface border-outline-variant'}`}>Hombro</button>
              <button onClick={()=>setInjury('rodilla')} className={`px-3 py-2 rounded border font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${injury==='rodilla' ? 'bg-primary/20 border-primary text-primary' : 'bg-surface border-outline-variant'}`}>Rodilla</button>
              <button onClick={()=>setInjury('espalda baja')} className={`px-3 py-2 rounded border font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${injury==='espalda baja' ? 'bg-primary/20 border-primary text-primary' : 'bg-surface border-outline-variant'}`}>Espalda</button>
            </div>
          </div>
        )}

        {/* Summary + actions */}
        <div className="sticky bottom-0 bg-surface/80 backdrop-blur-md border-t border-outline-variant p-4 space-y-3">
          {step===3 && (
            <div className="rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant space-y-1">
              <div><span className="font-medium font-body-md text-sm text-on-surface">Objetivo:</span> {GOAL_MAP[goal]}</div>
              <div><span className="font-medium font-body-md text-sm text-on-surface">Días:</span> {days}/semana</div>
              <div><span className="font-medium font-body-md text-sm text-on-surface">Enfoque:</span> {focuses.find(f=>f.id===focus)?.label}</div>
              {injury && <div><span className="font-medium font-body-md text-sm text-on-surface">Lesión:</span> {injury}</div>}
            </div>
          )}
          <div className="flex gap-2">
            {step > 0 && <button onClick={()=>setStep(step-1)} className="py-3 px-4 rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant font-body-md text-sm text-on-surface">Atrás</button>}
            <button onClick={onClose} className="flex-1 py-3 rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant font-body-md text-sm text-on-surface">Cancelar</button>
            {canNext && <button onClick={()=>setStep(step+1)} className="flex-1 py-3 rounded bg-primary text-on-surface font-medium">Siguiente</button>}
            {canGenerate && <button onClick={()=>onGenerate({ goal, daysPerWeek: days, focus, injuryNote: injury })} className="flex-1 py-3 rounded bg-gradient-to-r from-primary to-secondary text-on-primary font-medium flex items-center justify-center gap-1"><Sparkles size={14}/> Generar rutina</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
