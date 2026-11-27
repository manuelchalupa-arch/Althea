import { useEffect, useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { db, ensureSeeded } from '@/services/storage/db'
import type { Exercise } from '@/types'
import { DEFAULT_CYCLE, type CycleConfig, type LoadState, LOAD_STATE_LABEL, LOAD_STATE_COLOR, getWeekLoads } from '@/utils/cycle'
import { v4 as uuid } from 'uuid'
import { Plus, Trash2, Clock, AlertTriangle, History, Dumbbell, Search, Eye, Sparkles, X, Check, RefreshCw, ChevronUp, ChevronDown, GripVertical } from 'lucide-react'
import BrandIcon from '@/components/brand/BrandIcon'
import { IconDumbbell, IconFire, IconLightning, IconBody, IconTarget } from '@/components/brand/FitnessIcons'
import { AltheaCard, AltheaBadge, AltheaButton, AltheaEmpty, AltheaLoading, StatusTag, AltheaPanel, AltheaStatRow } from '@/components/althea'
import { generateRoutineWithAI, isRoutineAIAvailable, type GeneratedRoutine, type UserWants } from '@/services/ai/routineBuilderIA'
import { parseDayMuscles, displayMuscle } from '@/utils/muscleMap'
import { getActiveVersion, getCanonicalMethodId, PROFILE_SCOPE } from '@/services/planning/cycleVersions'
import { getMethod } from '@/services/ai/trainingMethodsDB'
import { selectMethods } from '@/services/ai/methodSelector'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'
import * as Gym from '@/services/exerciseGym'
import { exercisePurpose, EXERCISE_PURPOSES, type ExercisePurpose } from '@/utils/stretching'
import { displayEquipment, displayCategory, displayBodyPart, displayDifficulty } from '@/utils/exerciseLabels'
import { traditionalForGroup, CUSTOM_FORM_MUSCLES, CUSTOM_FORM_EQUIPMENT, CUSTOM_FORM_CATEGORIES } from '@/data/traditionalCatalog'
import BibliotecaCustomForm from './BibliotecaCustomForm'
import { PeriodizationEditor } from '@/components/recovery/PeriodizationEditor'
import { MAX_ROUTINES } from '@/services/storage/routineStore'
import { todayKey, addDaysToKey, toDateKey, daysBetween } from '@/utils/dates'
import { normFold } from '@/utils/format'

// ── Rutina simplificada ─────────────────────────────────────────────────────
// Vocabulario en español: claves de MUSCLE_ALIASES (muscleVocabulary) — el
// Atlas y Progreso resuelven sin traducción ni categorías duplicadas.
const SIMPLIFIED_MUSCLES: { value: string; label: string }[] = [
  { value: 'pectorales', label: 'Pectorales' },
  { value: 'dorsales', label: 'Dorsales' },
  { value: 'trapecios', label: 'Trapecios' },
  { value: 'deltoides anterior', label: 'Deltoides anterior' },
  { value: 'deltoides lateral', label: 'Deltoides lateral' },
  { value: 'deltoides posterior', label: 'Deltoides posterior' },
  { value: 'biceps', label: 'Bíceps' },
  { value: 'triceps', label: 'Tríceps' },
  { value: 'braquiorradial', label: 'Braquiorradial' },
  { value: 'antebrazos', label: 'Antebrazos' },
  { value: 'abdominales', label: 'Abdominales' },
  { value: 'oblicuos', label: 'Oblicuos' },
  { value: 'lumbar', label: 'Lumbar' },
  { value: 'gluteos', label: 'Glúteos' },
  { value: 'cuadriceps', label: 'Cuádriceps' },
  { value: 'isquiotibiales', label: 'Isquiotibiales' },
  { value: 'aductores', label: 'Aductores' },
  { value: 'abductores', label: 'Abductores' },
  { value: 'pantorrillas', label: 'Gemelos y sóleo' },
]
const SIMPLIFIED_BODY_PART: Record<string, string> = {
  pectorales: 'chest', dorsales: 'back', trapecios: 'back', lumbar: 'back',
  'deltoides anterior': 'arms', 'deltoides lateral': 'arms', 'deltoides posterior': 'arms',
  biceps: 'arms', triceps: 'arms', braquiorradial: 'arms', antebrazos: 'arms',
  abdominales: 'core', oblicuos: 'core',
  gluteos: 'legs', cuadriceps: 'legs', isquiotibiales: 'legs',
  aductores: 'legs', abductores: 'legs', pantorrillas: 'legs',
}

// Límites del bloque contiguo de superserie que contiene p (null = suelto).
function ssBounds(arr: { supersetId?: string | null }[], p: number): [number, number] {
  const id = arr[p]?.supersetId
  if (!id) { return [p, p] }
  let s = p, e = p
  while (s > 0 && arr[s - 1].supersetId === id) { s-- }
  while (e < arr.length - 1 && arr[e + 1].supersetId === id) { e++ }
  return [s, e]
}
// Renumera el orden dentro de cada run contiguo de bloques (0-based).
function renumberRuns<T extends { supersetId?: string | null; supersetOrder?: number | null }>(arr: T[]): T[] {
  const out = [...arr]
  let i = 0
  while (i < out.length) {
    const id = out[i].supersetId
    if (!id) { i++; continue }
    let j = i
    while (j + 1 < out.length && out[j + 1].supersetId === id) { j++ }
    for (let k = i; k <= j; k++) { out[k] = { ...out[k], supersetOrder: k - i } }
    i = j + 1
  }
  return out
}

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
  gifUrl?:string; name?:string; muscle?:string; imageDataUrl?:string; restSec?:number; restBetweenExercisesSec?:number; transitionRestSec?:number; seriesType?:string; tempo?:string; rir?:number; rpe?:number; notes?:string; routineExerciseId?:string
  /** Superserie (aditivo): bloque y orden dentro del bloque. */
  supersetId?:string | null; supersetOrder?:number | null
  sequenceRole?: 'warmup' | 'primary' | 'secondary' | 'cooldown'
  durationMin?: number
  /** Músculo secundario del ejercicio simplificado (opcional). */
  secondaryMuscle?:string | null
}
type RutinaData = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  rotationDays: number
  /** Fecha de revisión/vencimiento configurable (YYYY-MM-DD). */
  reviewDate?: string | null
  /** Posponer la revisión hasta esta fecha (YYYY-MM-DD). */
  reviewSnoozedUntil?: string | null
  /** Fecha en que el usuario ratificó la rutina vigente (YYYY-MM-DD). */
  reviewAcknowledgedAt?: string | null
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
    if (list.length > 0) {
      // Sin meta activa (o con id huérfano) la activa es la primera — el mismo
      // fallback que usa el render al deriving `active`. `updateActive` exige un
      // id concreto: con null hacía fn(undefined) y TODA edición reventaba.
      return { list, activeId: list.some(r=> r.id===activeId) ? activeId : list[0].id }
    }
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
  const [customs,setCustoms]=useState<{id:string; name:string; origin?:string}[]>([])
  const [routines,setRoutines]=useState<RutinaData[]>([])
  const [activeId,setActiveId]=useState<string | null>(null)
  const [, setRoutinesLoaded] = useState(false)
  const active = routines.find(r=>r.id===activeId) || routines[0]
  const [pickerFor,setPickerFor]=useState<number|null>(null)
  const [addingStretch,setAddingStretch]=useState(false)
  const [showNew,setShowNew]=useState(false)
  // Modalidad al crear: asistida (selector inteligente) o simplificada (manual).
  const [newMode,setNewMode]=useState<'asistida'|'simplificada'>('asistida')
  // Formulario "Rutina simplificada" abierto para un día (null = cerrado).
  const [manualFor,setManualFor]=useState<number|null>(null)
  // Borrador de selección para crear un bloque de superserie en un día.
  const [ssDraft,setSsDraft]=useState<{dayN:number; idxs:number[]}|null>(null)
  // Arrastre táctil (grip): índice actual mientras se arrastra.
  const dragRef=useRef<{dayN:number; idx:number}|null>(null)
  const [dragging,setDragging]=useState<number|null>(null)
  const [editingEx,setEditingEx]=useState<{dayN:number; idx:number} | null>(null)
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
  // Divulgación progresiva: parámetros y herramientas avanzadas plegados por
  // defecto (una pantalla = rutina y días; lo demás, cuando se necesita).
  const [showConfig,setShowConfig]=useState(false)
  const [showAdvanced,setShowAdvanced]=useState(false)
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
    let alive = true
    ensureSeeded().then(async()=>{
      const ex = await db.exercises.toArray()
      if (!alive) { return }
      setExercises(ex)
      db.customExercises.toArray()
        .then(cs=> { if (alive) { setCustoms(cs.map(c=>({id:c.id, name:c.name, origin:c.origin}))) } })
        .catch(()=>{})
      // Load routines from Dexie (with migration from localStorage)
      const { list, activeId: aid } = await loadRoutines()
      if (!alive) { return }
      setRoutines(list); setActiveId(aid); setRoutinesLoaded(true); loadVersions(aid)
      // si active no tiene cycle, intenta cargar de userProfile
      const p = await db.userProfile.get('me')
      if (!alive) { return }
      const pv = await getActiveVersion(PROFILE_SCOPE).catch(() => null)
      if (!alive) { return }
      const seedCycle = pv?.cycle ?? p?.cycle
      if(seedCycle && list.length===1 && JSON.stringify(list[0].cycle)===JSON.stringify(DEFAULT_CYCLE)){
        const upd = list.map(r=> r.id===aid ? {...r, cycle: seedCycle as CycleConfig} : r)
        setRoutines(upd); saveRoutines(upd, aid)
      }
    }).catch(()=>{})
    return () => { alive = false }
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

  // Secuencia de guardados: si llega un clic nuevo mientras el eco async de un
  // clic anterior todavía corre, el viejo NO escribe (evita pisar el estado).
  const saveSeq = useRef(0)
  const updateActive = (fn:(r:RutinaData)=>RutinaData)=>{
    const seq = ++saveSeq.current
    const changed = {...fn(routines.find(r=>r.id===activeId) as RutinaData), updatedAt: new Date().toISOString()}
    const next = routines.map(r=> r.id===activeId ? changed : r)
    setRoutines(next)
    // Versionado (ET13): si la rutina ya fue usada y cambió, se archiva vN.
    import('@/services/storage/routineStore').then(async ({ saveRoutineVersioned }) => {
      if (seq !== saveSeq.current) { return }
      try {
        const { saved } = await saveRoutineVersioned(changed as never)
        if (seq !== saveSeq.current) { return }
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
      if (seq !== saveSeq.current) { return }
      saveRoutines(next, activeId)
    }).catch(()=> { if (seq === saveSeq.current) { saveRoutines(next, activeId) } })
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
  // Campos de la tarjeta: series, reps y peso del ejercicio. Reps/peso se
  // aplican a todas las series (el detalle por serie vive en el editor).
  const setExerciseSets = (dayN:number, idx:number, raw:string)=>{
    const n = Math.max(1, Number(raw) || 1)
    updateActive(r=>{
      const a=[...(r.dayExercises[dayN]||[])]
      const cur=a[idx]
      if(!cur) {return r}
      const prev = seriesRowsOf(cur)
      const series = Array.from({length:n}, (_,k)=> prev[k] ?? {reps:cur.reps, weight:cur.weight ?? null})
      a[idx]={...cur, sets:n, series}
      return {...r, dayExercises:{...r.dayExercises, [dayN]:a}}
    })
  }
  const setExerciseReps = (dayN:number, idx:number, raw:string)=>{
    const reps = Number(raw)
    updateActive(r=>{
      const a=[...(r.dayExercises[dayN]||[])]
      const cur=a[idx]
      if(!cur) {return r}
      a[idx]={...cur, reps, series: Array.isArray(cur.series) ? cur.series.map(s=>({...s, reps})) : cur.series}
      return {...r, dayExercises:{...r.dayExercises, [dayN]:a}}
    })
  }
  const setExerciseWeight = (dayN:number, idx:number, raw:string)=>{
    const weight = raw === '' ? null : Number(raw)
    updateActive(r=>{
      const a=[...(r.dayExercises[dayN]||[])]
      const cur=a[idx]
      if(!cur) {return r}
      a[idx]={...cur, weight, series: Array.isArray(cur.series) ? cur.series.map(s=>({...s, weight})) : cur.series}
      return {...r, dayExercises:{...r.dayExercises, [dayN]:a}}
    })
  }

  const setActive = (id:string)=>{
    setActiveId(id)
    loadVersions(id)
    import('@/services/storage/routineStore').then(({ setActiveRoutineId }) => setActiveRoutineId(id))
    // La planificación canónica vive en cycleVersions; profile.cycle es solo
    // snapshot legacy de lectura (no se sincroniza ni se crea perfil acá).
    // Aviso global: Inicio (y demás lectores) recargan la rutina asignada.
    window.dispatchEvent(new Event('routineChange'))
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
    // Cada modalidad abre su forma de carga en el primer día: manual o selector.
    if(newMode==='simplificada'){ setManualFor(data.cycle.trainingDays[0]?.n ?? 1) }
    else { setPickerFor(data.cycle.trainingDays[0]?.n ?? 1) }
  }

  // Agrega un ejercicio desde el formulario simplificado. Reutiliza un custom
  // existente con el mismo nombre (sin duplicar) o crea uno nuevo.
  const addManualExercise = async (dayN:number, d:{name:string; sets:number; reps:number; weight:number|null; restSec:number; muscle:string; secondary:string|null}): Promise<boolean> => {
    const { createCustomExercise, updateCustomExercise } = await import('@/services/training/customExercises')
    const { DuplicateExerciseError } = await import('@/services/training/exerciseDuplicates')
    let exId = ''
    const customs = await db.customExercises.toArray().catch(()=> [])
    const found = customs.find(c=> !c.archived && normFold(c.name)===normFold(d.name))
    const pcts = d.secondary ? { primaryPct:70, secondaryPcts:[30] } : { primaryPct:100, secondaryPcts:[] as number[] }
    if(found){
      // Reutilización: actualiza la atribución muscular a lo elegido ahora.
      await updateCustomExercise(found.id, { muscle:d.muscle, secondaryMuscles: d.secondary?[d.secondary]:[], ...pcts }, { confirmDuplicate:true })
      exId = found.id
    } else {
      try{
        const c = await createCustomExercise({
          name:d.name, description:'Creado desde la rutina simplificada',
          bodyPart: SIMPLIFIED_BODY_PART[d.muscle] ?? 'core',
          muscle:d.muscle, secondaryMuscles: d.secondary?[d.secondary]:[],
          ...pcts, category:'strength', equipment:'other',
        })
        exId = c.id
      }catch(e){
        if(e instanceof DuplicateExerciseError){ exId = e.matches[0]?.id ?? '' }
        else { throw e }
      }
    }
    if(!exId){ return false }
    db.customExercises.toArray().then(cs=> setCustoms(cs.map(c=>({id:c.id, name:c.name, origin:c.origin})))).catch(()=>{})
    updateActive(r=> {
      const item: RutinaDayExercise = {
        id: uuid(), exId, sets:d.sets, reps:d.reps, weight:d.weight,
        name:d.name, muscle:d.muscle, secondaryMuscle:d.secondary,
        restSec:d.restSec, restBetweenExercisesSec:d.restSec,
        series: Array.from({length:d.sets},()=>({ reps:d.reps, weight:d.weight })),
      }
      return {...r, dayExercises:{...r.dayExercises, [dayN]:[...(r.dayExercises[dayN]||[]), item]}}
    })
    return true
  }

  // Chip SS: si el ejercicio ya está en bloque, lo saca (y disuelve si quedan
  // menos de 2); si no, alterna su selección en el borrador del día.
  const toggleSS = (dayN:number, idx:number) => {
    const arr = active?.dayExercises[dayN]||[]
    const it = arr[idx]
    if(!it) {return}
    if(it.supersetId){
      updateActive(r=>{
        const a=[...(r.dayExercises[dayN]||[])]
        const id=a[idx].supersetId as string
        const [,e]=ssBounds(a, idx)
        const item={...a[idx], supersetId:null, supersetOrder:null}
        const rest=[...a.slice(0,idx), ...a.slice(idx+1)]
        rest.splice(e, 0, item) // queda justo después del bloque: no lo parte
        let out=renumberRuns(rest)
        if(out.filter(x=>x.supersetId===id).length < 2){
          out=out.map(x=> x.supersetId===id ? {...x, supersetId:null, supersetOrder:null} : x)
        }
        return {...r, dayExercises:{...r.dayExercises, [dayN]:out}}
      })
      return
    }
    setSsDraft(prev=>{
      if(!prev || prev.dayN!==dayN) {return {dayN, idxs:[idx]}}
      return prev.idxs.includes(idx) ? {...prev, idxs:prev.idxs.filter(i=>i!==idx)} : {...prev, idxs:[...prev.idxs, idx]}
    })
  }

  // Crea el bloque: los seleccionados se vuelven contiguos en la posición del
  // primero y reciben un supersetId común (2, 3, 4+ sin límite).
  const createSSBlock = () => {
    if(!ssDraft || ssDraft.idxs.length<2 || !active) {return}
    const dayN=ssDraft.dayN
    const sel=[...ssDraft.idxs].sort((a,b)=>a-b)
    updateActive(r=>{
      const arr=[...(r.dayExercises[dayN]||[])]
      const items=sel.filter(i=> i>=0 && i<arr.length && !arr[i].supersetId).map(i=>arr[i])
      if(items.length<2) {return r}
      const id=uuid()
      const rest=arr.filter((_,i)=> !sel.includes(i))
      const at=Math.min(sel[0], rest.length)
      rest.splice(at, 0, ...items)
      const out=renumberRuns(rest.map((x,i)=> i>=at && i<at+items.length ? {...x, supersetId:id, supersetOrder:0} : x))
      return {...r, dayExercises:{...r.dayExercises, [dayN]:out}}
    })
    setSsDraft(null)
  }

  // Reordenar respetando bloques: la unidad es el bloque contiguo completo;
  // dentro de un bloque se reordenan sus integrantes (no se separan).
  // `until`: (drag) avanza en pasos hasta que la posición sea `until` dentro
  // de UNA sola actualización de estado (no se acumulan cierres stale).
  const moveExercise = (dayN:number, idx:number, dir:-1|1, until?:number) => {
    updateActive(r=>{
      let arr=[...(r.dayExercises[dayN]||[])]
      if(idx<0 || idx>=arr.length) {return r}
      let pos=idx
      const steps = until===undefined ? 1 : Math.abs(until-idx)
      for(let k=0;k<steps;k++){
        // Llegó (o se pasó, al saltar un bloque): no sigue en esa dirección.
        if(until!==undefined && (dir===1 ? pos>=until : pos<=until)) {break}
        const [s,e]=ssBounds(arr, pos)
        const within = dir===-1 ? pos>s : pos<e
        if(within){
          const j=pos+dir
          const tmp=arr[pos]; arr[pos]=arr[j]; arr[j]=tmp
          pos=j
          continue
        }
        const t = dir===-1 ? s-1 : e+1
        if(t<0 || t>=arr.length) {break}
        const [ts,te]=ssBounds(arr, t)
        const A=arr.slice(s,e+1), B=arr.slice(ts,te+1)
        arr = dir===-1
          ? [...arr.slice(0,ts), ...A, ...B, ...arr.slice(e+1)]
          : [...arr.slice(0,s), ...B, ...A, ...arr.slice(te+1)]
        pos = dir===-1 ? pos-(te-ts+1) : pos+(te-ts+1)
      }
      return {...r, dayExercises:{...r.dayExercises, [dayN]:renumberRuns(arr)}}
    })
  }

  // Arrastre táctil desde el grip: al cruzar otra fila, mueve la unidad.
  const onGripDown = (dayN:number, idx:number) => (e: React.PointerEvent) => {
    e.preventDefault()
    dragRef.current = {dayN, idx}
    setDragging(idx)
    try{ (e.target as HTMLElement).setPointerCapture(e.pointerId) }catch{ /* noop */ }
  }
  const onGripMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if(!d) {return}
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-exrow]') as HTMLElement | null
    if(!el) {return}
    const dayN = Number(el.dataset.day), idx = Number(el.dataset.idx)
    if(dayN!==d.dayN || !Number.isFinite(idx) || idx===d.idx) {return}
    // Hasta la fila objetivo en una sola actualización (sin cerrar stale).
    moveExercise(d.dayN, d.idx, idx>d.idx ? 1 : -1, idx)
    d.idx = idx
  }
  const onGripUp = (e: React.PointerEvent) => {
    dragRef.current = null
    setDragging(null)
    try{ (e.target as HTMLElement).releasePointerCapture(e.pointerId) }catch{ /* noop */ }
  }

  // Chromium suelta la captura del puntero cuando React reinserta la fila
  // durante el reorden: los pointermove/pointerup posteriores apuntan a otra
  // fila y el arrastre muere a mitad. Mientras haya arrastre activo escuchamos
  // también en window (idempotente: onGripMove ignora si idx no cambió).
  const gripHandlersRef = useRef({ move: (_e: React.PointerEvent) => {}, up: (_e: React.PointerEvent) => {} })
  gripHandlersRef.current = { move: onGripMove, up: onGripUp }
  const isDragging = dragging !== null
  useEffect(() => {
    if (!isDragging) { return }
    const move = (e: PointerEvent) => gripHandlersRef.current.move(e as unknown as React.PointerEvent)
    const up = (e: PointerEvent) => gripHandlersRef.current.up(e as unknown as React.PointerEvent)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [isDragging])

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
      <div className="min-h-screen bg-transparent pb-24 sm:px-5 lg:px-8 xl:px-10 2xl:px-12 w-full mx-auto pt-2 md:py-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center shrink-0">
            <Dumbbell size={24} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-headline-lg text-xl sm:text-2xl font-semibold text-on-surface tracking-tight flex items-center gap-2">
              <Dumbbell size={20} className="text-accent"/> Rutina
            </h1>
            <p className="font-body-md text-[14px] text-on-surface-variant mt-1">Organizá tus días de entrenamiento y series por ejercicio.</p>
          </div>
        </div>
        <AltheaEmpty
          icon="fitness_center"
          title="No hay rutinas guardadas"
          description="Creá tu primera rutina para organizar tus días de entrenamiento."
          action={<AltheaButton onClick={()=>setShowNew(true)} fullWidth size="lg"><Plus size={16}/> Nueva rutina</AltheaButton>}
          className="mt-6"
        />
        {showNew && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 althea-modal" onClick={()=>setShowNew(false)}>
            <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-md p-4 space-y-3">
              <h3 className="font-headline-lg text-base font-semibold text-on-surface">Crear nueva rutina</h3>
              <div className="flex gap-2" role="group" aria-label="Modalidad de rutina">
                <button type="button" aria-pressed={newMode==='asistida'} onClick={()=>setNewMode('asistida')} className={`flex-1 min-h-[48px] rounded border font-label-caps text-[10px] uppercase font-bold ${newMode==='asistida' ? 'bg-primary/20 border-primary text-primary' : 'bg-surface-container border-outline-variant text-on-surface-variant'}`}>Rutina asistida</button>
                <button type="button" aria-pressed={newMode==='simplificada'} onClick={()=>setNewMode('simplificada')} className={`flex-1 min-h-[48px] rounded border font-label-caps text-[10px] uppercase font-bold ${newMode==='simplificada' ? 'bg-primary/20 border-primary text-primary' : 'bg-surface-container border-outline-variant text-on-surface-variant'}`}>Rutina simplificada</button>
              </div>
              <p className="font-body-sm text-[12px] text-on-surface-variant">{newMode==='asistida' ? 'Armás la rutina con el selector inteligente de ejercicios.' : 'Ejercicios manuales: nombre, series, reps, peso, descanso y músculo.'}</p>
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
    <div className="min-h-screen bg-transparent px-0 pt-2 pb-24 md:px-6 md:pt-6 md:pb-6 lg:px-8 lg:pt-8 lg:pb-8 sm:px-5 xl:px-10 2xl:px-12 w-full mx-auto space-y-4">
      {new URLSearchParams(window.location.search).get('first') === '1' && (
        <div className="rounded-2xl border border-primary/40 bg-primary-container/15 p-4">
          <h1 className="font-headline-lg text-lg font-semibold text-on-surface">Tu perfil está listo</h1>
          <p className="font-body-md text-sm text-on-surface-variant mt-1">
            Todavía no hay rutina asignada. Elegí una existente, creá una nueva o generá la primera con IA; el calendario se arma desde esa rutina, no desde tu disponibilidad.
          </p>
        </div>
      )}
      {/* Selector superior */}
      <AltheaCard className="p-4 rounded-2xl shadow-al-sm border border-outline-variant/50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-label-caps text-[11px] uppercase text-on-surface-variant font-bold">Rutina activa</span>
              <span className="font-body-md text-base text-on-surface-variant">{active.rotationDays} días de rotación</span>
            </div>
          <button onClick={()=>setSelectorOpen(!selectorOpen)} aria-expanded={selectorOpen} className="mt-1 w-full flex items-center justify-between bg-surface/60 backdrop-blur-sm border border-outline-variant rounded-xl p-3 font-body-md text-base text-on-surface min-h-[48px]">
            <span className="font-medium text-left whitespace-normal break-words min-w-0">{active.name}</span>
            <span className="font-label-md text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">▼</span>
          </button>
        </div>
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
        <h1 className="font-headline-lg text-lg font-semibold text-on-surface flex items-center gap-2"><Dumbbell size={20} className="text-accent"/> {active.name}</h1>
        <AltheaBadge className="ml-auto" variant={estado==='Revisar' ? 'warning' : 'primary'}>{estado} · {daysElapsed}d</AltheaBadge>
      </div>

      {/* Configuración de la rutina — plegada por defecto: la pantalla se
          concentra en la rutina y sus días. El DOM permanece (los inputs
          siguen siendo localizables y editables). */}
      <AltheaCard className="space-y-2">
        <button onClick={()=>setShowConfig(v=>!v)} aria-expanded={showConfig} className="w-full flex items-center justify-between min-h-[44px] font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
          <span>Configuración de la rutina</span>
          <span>{showConfig ? 'Ocultar' : 'Ver'}</span>
        </button>
        <div className={showConfig ? 'space-y-2' : 'hidden'}>
        <div className="flex gap-3 items-center flex-wrap">
          <input value={active.name} onChange={e=> updateActive(r=> ({...r, name: e.target.value}))} aria-label="Nombre de la rutina" className="flex-1 min-w-0 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface font-medium min-h-[48px]" />
          <div className="flex gap-2 shrink-0">
            <AltheaButton variant="danger" onClick={()=>deleteRoutine(active.id)} className="min-h-[44px]"><Trash2 size={14}/> Eliminar</AltheaButton>
            <AltheaButton variant="secondary" onClick={()=>duplicateRoutine(active.id)} className="min-h-[44px]">Duplicar</AltheaButton>
          </div>
        </div>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><Clock size={12}/> Creada {new Date(active.createdAt).toLocaleDateString('es')} · {daysElapsed} días</div>
        <div className="flex gap-2 items-center">
          <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Período para revisar</span>
          <select value={active.rotationDays} onChange={e=> updateActive(r=> ({...r, rotationDays: Number(e.target.value)}))} aria-label="Período para revisar" className="ml-auto bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]">
            <option value={20}>20 días</option><option value={30}>30 días</option><option value={45}>45 días</option><option value={60}>60 días</option>
          </select>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Fecha de revisión</span>
          <input type="date" aria-label="Fecha de revisión" value={active.reviewDate ?? ''}
            onChange={e=> updateActive(r=> ({...r, reviewDate: e.target.value || null}))}
            className="sm:ml-auto bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]" />
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
        </div>
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
                <AltheaButton size="sm" className="shrink-0 !px-2 !py-1 !min-h-[44px] text-[11px]" onClick={()=>setPickerFor(d.n)}><Plus size={14}/> Ejercicios</AltheaButton>
                <AltheaButton size="sm" variant="secondary" className="shrink-0 !px-2 !py-1 !min-h-[44px] text-[11px]" aria-label="Agregar estiramiento" title="Agregar estiramiento" onClick={()=>{ setAddingStretch(true); setPickerFor(d.n) }}><Plus size={14}/> <span className="hidden md:inline">Estiramiento</span><span className="md:hidden">E</span></AltheaButton>
                <AltheaButton size="sm" variant="secondary" className="shrink-0 !px-2 !py-1 !min-h-[44px] text-[11px]" onClick={()=>setManualFor(d.n)}><Plus size={14}/> Manual</AltheaButton>
              </div>
              <div className="flex items-center gap-2">
                <StatusTag status="planned" />
                <span className="font-body-md text-xs text-on-surface-variant">{exs.length} ejercicio{exs.length===1?'':'s'} planificado{exs.length===1?'':'s'} · objetivo {exs.reduce((a,e)=>a+(e.sets||0),0)} series</span>
              </div>
              <div className="space-y-2">
                {ssDraft?.dayN===d.n && ssDraft.idxs.length>0 && (
                  <div className="rounded border border-secondary/40 bg-secondary-container/15 p-2 flex items-center gap-2 flex-wrap">
                    <span className="font-label-caps text-[10px] uppercase text-secondary">Superserie: {ssDraft.idxs.length} seleccionado{ssDraft.idxs.length===1?'':'s'}</span>
                    <button type="button" disabled={ssDraft.idxs.length<2} onClick={createSSBlock} className="min-h-[44px] px-3 rounded bg-secondary text-on-surface font-label-caps text-[10px] uppercase font-bold disabled:opacity-50">Crear bloque</button>
                    <button type="button" onClick={()=>setSsDraft(null)} className="min-h-[44px] px-3 rounded border border-outline-variant text-on-surface-variant font-label-caps text-[10px] uppercase">Cancelar</button>
                  </div>
                )}
                {exs.map((it,idx)=>{
                  const ex = exercises.find(e=>e.id===it.exId)
                  const isStr = (it as { isStretch?: boolean }).isStretch
                  const roleLabel = it.sequenceRole === 'warmup' ? 'Calentamiento y estiramiento' : it.sequenceRole === 'primary' ? 'Grupo muscular principal' : it.sequenceRole === 'secondary' ? 'Grupo muscular secundario' : it.sequenceRole === 'cooldown' ? 'Cardio suave' : null
                  const blkN = it.supersetId ? exs.filter(x=>x.supersetId===it.supersetId).length : 0
                  const inDraft = ssDraft?.dayN===d.n && ssDraft.idxs.includes(idx)
                  const label = ex?.name || it.name || it.exId
                  return (
                    <div key={it.id} data-exrow data-day={d.n} data-idx={idx} className={`rounded border p-2 space-y-1.5 ${isStr ? 'bg-[var(--althea-stretch)]/10 border-[var(--althea-stretch)]/40' : 'bg-surface/60 border-outline-variant'} ${dragging===idx ? 'opacity-60' : ''}`}>
                      <div className="flex items-start gap-1">
                        <button onPointerDown={onGripDown(d.n, idx)} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripUp} aria-label={`Reordenar ${label}`} title="Arrastrar para reordenar" className="shrink-0 w-9 h-9 rounded flex items-center justify-center text-on-surface-variant touch-none cursor-grab active:cursor-grabbing hover:bg-surface-container-high"><GripVertical size={16}/></button>
                        <div className="min-w-0 flex-1 pt-1.5">
                          <div className="font-body-md text-sm text-on-surface font-medium whitespace-normal break-words" title={label}>{label}</div>
                          {(isStr || it.supersetId || roleLabel) && (
                            <div className="flex items-center gap-1 flex-wrap mt-0.5">
                              {roleLabel && <span className="font-label-caps text-[9px] uppercase tracking-wider text-primary">{roleLabel}</span>}
                              {isStr && !roleLabel && <span className="font-label-caps text-[9px] uppercase tracking-wider text-[var(--althea-stretch)]">Estiramiento</span>}
                              {it.supersetId && <span className="shrink-0 px-1.5 py-0.5 rounded bg-secondary/15 border border-secondary/40 font-label-caps text-[9px] text-secondary uppercase font-semibold">SS {(it.supersetOrder ?? 0)+1}/{blkN}</span>}
                            </div>
                          )}
                        </div>
                        <button onClick={()=>setEditingEx({dayN:d.n, idx})} aria-label={`Editar ${label}`} title="Editar" className={`shrink-0 px-2.5 rounded-lg border font-label-caps text-[10px] uppercase font-bold min-h-[44px] ${isStr ? 'bg-[var(--althea-stretch)]/15 border-[var(--althea-stretch)]/40 text-[var(--althea-stretch)]' : 'bg-primary/15 border-primary/40 text-primary'}`}>Editar</button>
                        <button onClick={()=>{
                          updateActive(r=> ({...r, dayExercises: {...r.dayExercises, [d.n]: (r.dayExercises[d.n]||[]).filter((_,i)=>i!==idx)}}))
                        }} aria-label={`Quitar ${label}`} title="Quitar" className="text-on-surface-variant min-h-[44px] min-w-[44px] flex items-center justify-center"><Trash2 size={14}/></button>
                      </div>
                      <div className="grid grid-cols-[1fr_1.2fr_1fr] gap-1.5">
                        <label className="block min-w-0">
                          <span className="block font-label-caps text-[9px] uppercase tracking-normal text-on-surface-variant mb-0.5 whitespace-nowrap">Series</span>
                          <input type="number" min={1} value={it.sets || 1} onChange={e=>setExerciseSets(d.n, idx, e.target.value)} aria-label={`Series de ${label}`} title="Series" className="w-full min-w-0 bg-surface border border-outline-variant rounded-lg px-2 py-2 min-h-[40px] font-body-md text-sm text-on-surface text-center" />
                        </label>
                        <label className="block min-w-0">
                          <span className="block font-label-caps text-[9px] uppercase tracking-normal text-on-surface-variant mb-0.5 whitespace-nowrap">Repeticiones</span>
                          <input type="number" min={0} value={it.reps} onChange={e=>setExerciseReps(d.n, idx, e.target.value)} aria-label={`Repeticiones de ${label}`} title="Repeticiones" className="w-full min-w-0 bg-surface border border-outline-variant rounded-lg px-2 py-2 min-h-[40px] font-body-md text-sm text-on-surface text-center" />
                        </label>
                        <label className="block min-w-0">
                          <span className="block font-label-caps text-[9px] uppercase tracking-normal text-on-surface-variant mb-0.5 whitespace-nowrap">Peso</span>
                          <input type="number" step="0.5" value={it.weight ?? ''} onChange={e=>setExerciseWeight(d.n, idx, e.target.value)} aria-label={`Peso de ${label}`} title="Peso" placeholder="—" className="w-full min-w-0 bg-surface border border-outline-variant rounded-lg px-2 py-2 min-h-[40px] font-body-md text-sm text-on-surface text-center" />
                        </label>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button type="button" onClick={()=>toggleSS(d.n, idx)} aria-label={`Superserie ${label}`} aria-pressed={!!it.supersetId || !!inDraft} title="Superserie" className={`min-h-[36px] px-2.5 rounded border font-label-caps text-[10px] uppercase font-bold ${it.supersetId ? 'bg-secondary/20 border-secondary/50 text-secondary' : inDraft ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-surface-container border-outline-variant text-on-surface-variant'}`}>SS</button>
                        <button type="button" onClick={()=>moveExercise(d.n, idx, -1)} aria-label={`Subir ${label}`} title="Subir" className="w-10 h-9 rounded border border-outline-variant bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface"><ChevronUp size={16}/></button>
                        <button type="button" onClick={()=>moveExercise(d.n, idx, 1)} aria-label={`Bajar ${label}`} title="Bajar" className="w-10 h-9 rounded border border-outline-variant bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface"><ChevronDown size={16}/></button>
                        <button type="button" onClick={()=>setViewer((ex || { id: it.exId, slug: it.exId, name: label, muscle: it.muscle || '', bodyPart: '', equipment: '', category: '', secondaryMuscles: [], instructions: [], file: '', gifUrl: it.gifUrl || '', imageDataUrl: it.imageDataUrl }) as unknown as Gym.Exercise)} aria-label={`Ver demo de ${label}`} title="Ver demo" className="ml-auto w-10 h-9 rounded border border-outline-variant bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface"><Eye size={16}/></button>
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

      {/* Planificación avanzada — carga semanal y versiones, plegadas por
          defecto: no saturan la consulta/edición diaria de la rutina. */}
      <AltheaCard>
        <button onClick={()=>setShowAdvanced(v=>!v)} aria-expanded={showAdvanced} className="w-full flex items-center justify-between min-h-[44px] font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
          <span>Planificación avanzada — carga semanal y versiones</span>
          <span>{showAdvanced ? 'Ocultar' : 'Ver'}</span>
        </button>
      </AltheaCard>
      {showAdvanced && (<>
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
                }} aria-label={`Día de la semana ${w}`} className="flex-1 min-w-0 bg-surface border border-outline-variant rounded-lg p-2 font-body-md text-sm text-on-surface min-h-[48px]">
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
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
          Versiones{active.version ? ` · actual v${active.version}` : ''}{versions.length > 0 ? ` · ${versions.length} histórica(s)` : ' · sin versiones previas'}
        </div>
        {versionNotice && <p className="font-body-sm text-[12px] text-secondary mt-2">{versionNotice}</p>}
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
      </>)}

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
        <AltheaPanel>
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1 mb-3"><Dumbbell size={14}/> Stats de la rutina</div>
          <AltheaStatRow items={[
            { icon: 'rutinas', value: `${active.cycle.trainingDays.length}/semana`, label: 'Días de entrenamiento' },
            { icon: 'entrenar', value: Object.values(active.dayExercises).flat().length, label: 'Total ejercicios' },
            { icon: 'progreso', value: Object.values(active.dayExercises).flat().reduce((a, e) => a + (e.sets || 0), 0), label: 'Total series' },
          ]} />
        </AltheaPanel>
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 althea-modal" onClick={()=>setShowNew(false)}>
          <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-md p-4 space-y-3">
            <h3 className="font-headline-lg text-base font-semibold text-on-surface">Crear nueva rutina</h3>
            <div className="flex gap-2" role="group" aria-label="Modalidad de rutina">
              <button type="button" aria-pressed={newMode==='asistida'} onClick={()=>setNewMode('asistida')} className={`flex-1 min-h-[48px] rounded border font-label-caps text-[10px] uppercase font-bold ${newMode==='asistida' ? 'bg-primary/20 border-primary text-primary' : 'bg-surface-container border-outline-variant text-on-surface-variant'}`}>Rutina asistida</button>
              <button type="button" aria-pressed={newMode==='simplificada'} onClick={()=>setNewMode('simplificada')} className={`flex-1 min-h-[48px] rounded border font-label-caps text-[10px] uppercase font-bold ${newMode==='simplificada' ? 'bg-primary/20 border-primary text-primary' : 'bg-surface-container border-outline-variant text-on-surface-variant'}`}>Rutina simplificada</button>
            </div>
            <p className="font-body-sm text-[12px] text-on-surface-variant">{newMode==='asistida' ? 'Armás la rutina con el selector inteligente de ejercicios.' : 'Ejercicios manuales: nombre, series, reps, peso, descanso y músculo.'}</p>
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
                if(newMode==='simplificada'){ setManualFor(data.cycle.trainingDays[0]?.n ?? 1) }
                else { setPickerFor(data.cycle.trainingDays[0]?.n ?? 1) }
              }}>Crear rutina</AltheaButton>
            </div>
            {routines.length>=MAX_ROUTINES && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-error">Tenés {MAX_ROUTINES} rutinas guardadas. Para crear otra, eliminá una.</p>}
          </div>
        </div>
      )}

      {manualFor!==null && (
        <SimplifiedForm
          dayN={manualFor}
          onAdd={addManualExercise}
          onClose={()=>setManualFor(null)}
        />
      )}

      {pickerFor!==null && (
        <IntelligentPicker
          dayN={pickerFor}
          dayName={active.cycle.trainingDays.find(d=>d.n===pickerFor)?.name || ''}
          existingIds={(active.dayExercises[pickerFor]||[]).map(e=>e.exId)}
          initialPurpose={addingStretch ? 'stretch' : 'conventional'}
          onAdd={(exId,gifUrl,name,muscle,imageDataUrl,isStretch)=>{
            const d = getMethodDefaults(active.cycle)
            const isStr = !!isStretch
            updateActive(r=> ({...r, dayExercises: {...r.dayExercises, [pickerFor!]: [...(r.dayExercises[pickerFor!]||[]), { id: uuid(), exId, sets:d.sets, reps:d.reps, weight:d.weight, gifUrl, name, muscle, imageDataUrl, restBetweenExercisesSec: 120, isStretch: isStr, series: Array.from({length:d.sets},()=>({reps:d.reps, weight:d.weight})) }]}}))
            setPickerFor(null)
            setAddingStretch(false)
          }}
          onAddMany={(items)=>{
            const d = getMethodDefaults(active.cycle)
            updateActive(r=> {
              const already = new Set((r.dayExercises[pickerFor!]||[]).map(e=>e.exId))
              const toAdd = items.filter(i=> !already.has(i.exId)).map(i=> ({ id: uuid(), exId: i.exId, sets:d.sets, reps:d.reps, weight:d.weight, gifUrl: i.gifUrl, name: i.name, muscle: i.muscle, imageDataUrl: i.imageDataUrl, restBetweenExercisesSec: 120, isStretch: !!i.isStretch, series: Array.from({length:d.sets},()=>({reps:d.reps, weight:d.weight})) }))
              return {...r, dayExercises: {...r.dayExercises, [pickerFor!]: [...(r.dayExercises[pickerFor!]||[]), ...toAdd]}}
            })
            setPickerFor(null)
            setAddingStretch(false)
          }}
          onClose={()=>setPickerFor(null)}
          onView={setViewer}
        />
      )}

      {editingEx && (() => {
        const editIt = (active.dayExercises[editingEx.dayN] || [])[editingEx.idx]
        if (!editIt) { return null }
        const ex = exercises.find(e => e.id === editIt.exId) || customs.find(e => e.id === editIt.exId)
        const dayN = editingEx.dayN
        const idx = editingEx.idx
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 althea-modal" onClick={() => setEditingEx(null)}>
            <div onClick={e => e.stopPropagation()} className="bg-surface/95 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-lg text-base font-semibold text-on-surface">{ex?.name || editIt.name || editIt.exId}</h3>
                <button onClick={() => setEditingEx(null)} aria-label="Cerrar" title="Cerrar" className="w-11 h-11 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors"><X size={18}/></button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="block min-w-0">
                  <span className="block font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Series</span>
                  <input type="number" min={1} value={editIt.sets} onChange={e => setExerciseSets(dayN, idx, e.target.value)} aria-label="Series" className="w-full min-w-0 bg-surface border border-outline-variant rounded-lg p-2 font-body-md text-sm text-on-surface text-center min-h-[48px]" />
                </label>
                <label className="block min-w-0">
                  <span className="block font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Repeticiones</span>
                  <input type="number" min={0} value={editIt.reps} onChange={e => setExerciseReps(dayN, idx, e.target.value)} aria-label="Repeticiones" className="w-full min-w-0 bg-surface border border-outline-variant rounded-lg p-2 font-body-md text-sm text-on-surface text-center min-h-[48px]" />
                </label>
                <label className="block min-w-0">
                  <span className="block font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Peso</span>
                  <input type="number" step="0.5" value={editIt.weight ?? ''} onChange={e => setExerciseWeight(dayN, idx, e.target.value)} aria-label="Peso" placeholder="—" className="w-full min-w-0 bg-surface border border-outline-variant rounded-lg p-2 font-body-md text-sm text-on-surface text-center min-h-[48px]" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block min-w-0">
                  <span className="block font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Transición en superserie (s)</span>
                  <input type="number" min={0} max={120} step={5} value={editIt.transitionRestSec ?? 15} aria-label="Transición entre ejercicios de la superserie" onChange={e => {
                    const v = Math.max(0, Math.min(120, Number(e.target.value) || 0))
                    updateActive(r => {
                      const a = [...(r.dayExercises[dayN] || [])]
                      a[idx] = { ...a[idx], transitionRestSec: v }
                      return { ...r, dayExercises: { ...r.dayExercises, [dayN]: a } }
                    })
                  }} className="w-full min-w-0 bg-surface border border-outline-variant rounded-lg p-2 font-body-md text-sm text-on-surface text-center min-h-[48px]" />
                </label>
                <p className="self-end font-body-sm text-[11px] text-on-surface-variant pb-2">Se usa solo al pasar de un ejercicio a otro dentro del mismo bloque; el descanso principal queda para el cierre de ronda.</p>
              </div>
              <div className="border-t border-outline-variant/40 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-label-caps text-[10px] uppercase tracking-wider text-outline">Plan por serie</span>
                  <button onClick={() => addSeriesRow(dayN, idx)} aria-label="Agregar serie" className="rounded border border-outline-variant/60 px-2 py-1 min-h-[32px] font-label-caps text-[10px] uppercase text-on-surface-variant hover:border-secondary/50 hover:text-on-surface">+ Serie</button>
                </div>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-label-caps text-[9px] uppercase tracking-wider text-outline">
                    <span className="w-12 shrink-0">Serie</span>
                    <span className="flex-1">Reps</span>
                    <span className="flex-1">Peso</span>
                    <span className="w-10 shrink-0" aria-hidden="true" />
                  </div>
                  {seriesRowsOf(editIt).map((s, si) => {
                    const label = ex?.name || editIt.name || editIt.exId
                    return (
                      <div key={si} className="flex items-center gap-1.5">
                        <span className="w-12 shrink-0 font-label-caps text-[9px] uppercase text-outline">S{si + 1}</span>
                        <input type="number" value={s.reps} onChange={e => patchSeriesRow(dayN, idx, si, { reps: Number(e.target.value) })} aria-label={`Reps serie ${si + 1} de ${label}`} placeholder="Reps" className="w-full min-w-0 bg-surface border border-outline-variant rounded-lg px-2 py-2 min-h-[40px] font-label-md text-[11px] font-semibold text-on-surface-variant" />
                        <input type="number" step="0.5" value={s.weight ?? ''} onChange={e => patchSeriesRow(dayN, idx, si, { weight: e.target.value === '' ? null : Number(e.target.value) })} aria-label={`Peso serie ${si + 1} de ${label}`} placeholder="Peso" className="w-full min-w-0 bg-surface border border-outline-variant rounded-lg px-2 py-2 min-h-[40px] font-label-md text-[11px] font-semibold text-on-surface-variant" />
                        <button onClick={() => removeSeriesRow(dayN, idx, si)} aria-label={`Quitar serie ${si + 1} de ${label}`} className="shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center text-on-surface-variant hover:text-error" title="Quitar serie"><Trash2 size={13} /></button>
                      </div>
                    )
                  })}
                </div>
              </div>
              {/* Atribución muscular — solo ejercicios custom (editable después;
                  se refleja en db.customExercises para el Atlas de Progreso). */}
              {ex && (ex as { origin?: string }).origin === 'USER_CREATED' && (() => {
                const opts = editIt.muscle && !SIMPLIFIED_MUSCLES.some(m => m.value === editIt.muscle)
                  ? [...SIMPLIFIED_MUSCLES, { value: editIt.muscle, label: editIt.muscle }]
                  : SIMPLIFIED_MUSCLES
                const patchCustom = (patch: { muscle?: string; secondaryMuscles?: string[]; primaryPct?: number; secondaryPcts?: number[] }) => {
                  import('@/services/training/customExercises').then(({ updateCustomExercise }) =>
                    updateCustomExercise(ex.id, patch, { confirmDuplicate: true }).catch(() => { /* atribución best-effort */ })
                  ).catch(() => { /* noop */ })
                }
                const secOpts = editIt.secondaryMuscle && !SIMPLIFIED_MUSCLES.some(m => m.value === editIt.secondaryMuscle)
                  ? [...SIMPLIFIED_MUSCLES.filter(m => m.value !== editIt.muscle), { value: editIt.secondaryMuscle, label: editIt.secondaryMuscle }]
                  : SIMPLIFIED_MUSCLES.filter(m => m.value !== editIt.muscle)
                return (
                  <div className="border-t border-outline-variant/40 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="block space-y-1">
                      <span className="font-label-caps text-[10px] uppercase tracking-wider text-outline">Músculo principal</span>
                      <select value={editIt.muscle ?? ''} onChange={e => {
                        const v = e.target.value
                        const clearSec = editIt.secondaryMuscle === v
                        updateActive(r => {
                          const a = [...(r.dayExercises[dayN] || [])]
                          a[idx] = { ...a[idx], muscle: v, ...(clearSec ? { secondaryMuscle: null } : {}) }
                          return { ...r, dayExercises: { ...r.dayExercises, [dayN]: a } }
                        })
                        patchCustom({ muscle: v, ...(clearSec ? { secondaryMuscles: [], primaryPct: 100, secondaryPcts: [] } : {}) })
                      }} aria-label="Músculo principal" className="w-full bg-surface border border-outline-variant rounded-lg p-2 font-body-md text-sm text-on-surface min-h-[48px]">
                        <option value="">Sin asignar</option>
                        {opts.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="font-label-caps text-[10px] uppercase tracking-wider text-outline">Músculo secundario</span>
                      <select value={editIt.secondaryMuscle ?? ''} onChange={e => {
                        const v = e.target.value
                        updateActive(r => {
                          const a = [...(r.dayExercises[dayN] || [])]
                          a[idx] = { ...a[idx], secondaryMuscle: v || null }
                          return { ...r, dayExercises: { ...r.dayExercises, [dayN]: a } }
                        })
                        patchCustom(v
                          ? { secondaryMuscles: [v], primaryPct: 70, secondaryPcts: [30] }
                          : { secondaryMuscles: [], primaryPct: 100, secondaryPcts: [] })
                      }} aria-label="Músculo secundario" className="w-full bg-surface border border-outline-variant rounded-lg p-2 font-body-md text-sm text-on-surface min-h-[48px]">
                        <option value="">Ninguno</option>
                        {secOpts.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </label>
                  </div>
                )
              })()}
              <div className="flex justify-end">
                <button onClick={() => setEditingEx(null)} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-label-caps text-[10px] uppercase font-bold transition-colors min-h-[36px]">Guardar y cerrar</button>
              </div>
            </div>
          </div>
        )
      })()}

      {viewer && (
        <ExerciseViewer exercise={viewer} onClose={()=>setViewer(null)} onAdd={()=>{
          if(pickerFor!==null){
            const d = getMethodDefaults(active.cycle)
            updateActive(r=> ({...r, dayExercises: {...r.dayExercises, [pickerFor!]: [...(r.dayExercises[pickerFor!]||[]), { id: uuid(), exId: viewer.id, sets:d.sets, reps:d.reps, weight:d.weight, gifUrl: viewer.gifUrl, name: viewer.name, muscle: viewer.muscle, imageDataUrl: viewer.imageDataUrl, restBetweenExercisesSec: 120, series: Array.from({length:d.sets},()=>({reps:d.reps, weight:d.weight})) }]}}))
          }
          setViewer(null); setPickerFor(null)
        }} />
      )}

      {/* AI Generation Loading */}
      {aiLoading && !aiPreview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 althea-modal">
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 althea-modal" onClick={()=>setAiError(null)}>
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

// Formulario "Rutina simplificada": alta rápida de ejercicios manuales.
// Se mantiene abierto tras guardar para agregar varios sin recargar.
function SimplifiedForm({ dayN, onAdd, onClose }:{ dayN:number; onAdd:(dayN:number, d:{name:string; sets:number; reps:number; weight:number|null; restSec:number; muscle:string; secondary:string|null})=>Promise<boolean>; onClose:()=>void }){
  const [name,setName]=useState('')
  const [sets,setSets]=useState(3)
  const [reps,setReps]=useState(10)
  const [weight,setWeight]=useState('')
  const [rest,setRest]=useState(120)
  const [muscle,setMuscle]=useState('')
  const [secondary,setSecondary]=useState('')
  const [saving,setSaving]=useState(false)
  const [msg,setMsg]=useState<string|null>(null)

  const save = async ()=>{
    if(!name.trim()){ setMsg('Ingresá un nombre'); return }
    if(!muscle){ setMsg('Elegí el músculo principal'); return }
    if(secondary && secondary===muscle){ setMsg('El secundario debe ser distinto del principal'); return }
    setSaving(true); setMsg(null)
    try{
      const ok = await onAdd(dayN, {
        name:name.trim(), sets:Math.max(1,Math.min(20,Number(sets)||1)), reps:Math.max(1,Math.min(100,Number(reps)||1)),
        weight: weight.trim()==='' ? null : Number(weight),
        restSec: Math.max(0, Math.min(600, Number(rest)||0)),
        muscle, secondary: secondary||null,
      })
      if(ok){ setMsg(`"${name.trim()}" agregado al Día N°${dayN}.`); setName(''); setWeight('') }
      else { setMsg('No se pudo agregar: ya existe un ejercicio con ese nombre en la biblioteca.') }
    }catch(e){ setMsg(e instanceof Error ? e.message : 'No se pudo agregar el ejercicio') }
    finally{ setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 althea-modal" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} role="dialog" aria-label="Rutina simplificada" className="bg-surface/95 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-md max-h-[90vh] overflow-auto p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-headline-lg text-base font-semibold text-on-surface">Rutina simplificada — Día N°{dayN}</h3>
          <button onClick={onClose} aria-label="Cerrar formulario" className="w-11 h-11 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high"><X size={16}/></button>
        </div>
        <label className="block space-y-1">
          <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Nombre del ejercicio *</span>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Ej: Press plano con mancuernas" className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]"/>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Series</span>
            <input type="number" min={1} max={20} value={sets} onChange={e=>setSets(Number(e.target.value))} className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]"/>
          </label>
          <label className="block space-y-1">
            <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Reps</span>
            <input type="number" min={1} max={100} value={reps} onChange={e=>setReps(Number(e.target.value))} className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]"/>
          </label>
          <label className="block space-y-1">
            <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Peso (kg, vacío = sin peso)</span>
            <input type="number" min={0} step="0.5" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="—" className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]"/>
          </label>
          <label className="block space-y-1">
            <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Descanso (s)</span>
            <input type="number" min={0} max={600} step="15" value={rest} onChange={e=>setRest(Number(e.target.value))} className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]"/>
          </label>
        </div>
        <label className="block space-y-1">
          <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Músculo principal *</span>
          <select value={muscle} onChange={e=>{ setMuscle(e.target.value); if(secondary===e.target.value){setSecondary('')} }} required aria-label="Músculo principal" className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]">
            <option value="">Elegir músculo…</option>
            {SIMPLIFIED_MUSCLES.map(m=> <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Músculo secundario (opcional)</span>
          <select value={secondary} onChange={e=>setSecondary(e.target.value)} aria-label="Músculo secundario" className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface min-h-[48px]">
            <option value="">Ninguno</option>
            {SIMPLIFIED_MUSCLES.filter(m=> m.value!==muscle).map(m=> <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        {msg && <p role="status" className="font-body-sm text-[12px] text-secondary">{msg}</p>}
        <div className="flex gap-2">
          <AltheaButton variant="secondary" fullWidth onClick={onClose}>Listo</AltheaButton>
          <AltheaButton fullWidth onClick={save} disabled={saving}>{saving ? 'Agregando…' : 'Agregar ejercicio'}</AltheaButton>
        </div>
      </div>
    </div>
  )
}

function IntelligentPicker({dayN, dayName, existingIds, initialPurpose = 'conventional', onAdd, onAddMany, onClose, onView}:{dayN:number; dayName:string; existingIds:string[]; initialPurpose?:ExercisePurpose; onAdd:(exId:string,gifUrl:string,name:string,muscle:string,imageDataUrl?:string,isStretch?:boolean)=>void; onAddMany:(items:{exId:string;gifUrl:string;name:string;muscle:string;imageDataUrl?:string;isStretch?:boolean}[])=>void; onClose:()=>void; onView:(ex:Gym.Exercise)=>void}){
  // Memo para que el array sea estable entre renders (el efecto de carga sólo
  // debe re-ejecutarse si cambian los músculos del día, no en cada render).
  const muscles = useMemo(() => parseDayMuscles(dayName), [dayName])
  const [q,setQ]=useState('')
  const [purpose,setPurpose]=useState<ExercisePurpose>(initialPurpose)
  const [equipFilter,setEquipFilter]=useState('todos')
  const [muscleFilter,setMuscleFilter]=useState('todos')
  const [difficultyFilter,setDifficultyFilter]=useState('todos')
  const [selected,setSelected]=useState<string[]>([])
  const [items,setItems]=useState<Gym.Exercise[]>([])
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState<string|null>(null)
  const [methodHint,setMethodHint]=useState<{types:string[];avoid:string[]}|null>(null)
  const [showCreate,setShowCreate]=useState(false)
  const [reloadKey,setReloadKey]=useState(0)
  const existingSet = new Set(existingIds)
  useEffect(()=>{
    if(muscles.length===0 && purpose==='conventional') {return}
    let cancelled=false
    // Load method hint for exercise prioritization
    // Canónico-primero (FASE 1M-B): manda la versión activa; profile.cycle sólo
    // rellena cuando no existe versión (usuarios pre-versionado).
    db.userProfile.get('me').then(async p=>{
      if(cancelled) {return}
      const methodId = await getCanonicalMethodId(p ?? null).catch(()=>undefined)
      if(methodId){
        const m = getMethod(methodId)
        if(m) {setMethodHint({ types: m.exerciseSelection.primaryTypes, avoid: m.exerciseSelection.avoidExercises || [] })}
      }
    }).catch(()=>{})
    const load = async ()=>{
      setLoading(true); setErr(null); setSelected([])
      try{
        let merged:Gym.Exercise[] = []
        const seen=new Set<string>()
        if (purpose === 'conventional') {
          const results = await Promise.all(muscles.map(m=> Gym.fetchByMuscle(m).catch((): {exercises:Gym.Exercise[]}=> ({exercises:[]})) ))
          results.forEach(r=>{
            r.exercises?.forEach((ex:Gym.Exercise)=>{
              if(!seen.has(ex.id) && exercisePurpose(ex) === 'conventional'){
                seen.add(ex.id); merged.push(ex)
              }
            })
          })
        } else {
          // Calentamiento/estiramientos/movilidad: catálogo completo, así el
          // selector sigue ofreciendo todos los grupos musculares.
          const all = await Gym.fetchAll()
          const catalog = all.exercises || []
          const curated = traditionalForGroup(catalog, '__all__')
          const add = (ex:Gym.Exercise) => { if(!seen.has(ex.id) && exercisePurpose(ex) === purpose){ seen.add(ex.id); merged.push(ex) } }
          catalog.forEach(add)
          curated.forEach(t => add(t.exercise))
          merged.sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'es'))
        }
        try{
          const { listCustomExercises, matchesCustomFilter } = await import('@/services/training/customExercises')
          const customs:Gym.Exercise[] = []
          for(const m of muscles){ const cs = await listCustomExercises('muscle', m).catch(()=>[]); for(const c of cs){ if(!seen.has(c.id) && exercisePurpose(c as unknown as { category?: string; exerciseObjective?: string }) === purpose){ seen.add(c.id); customs.push(c as unknown as Gym.Exercise) } } }
          // Biblioteca compartida (creada por cualquier usuario): mismo criterio
          // músculo+finalidad; refresca la cache de Firestore y filtra en local.
          try{
            const { listSharedExercises } = await import('@/services/training/sharedExercises')
            const sh = await listSharedExercises()
            for(const c of sh){ if(!seen.has(c.id) && muscles.some(m=> matchesCustomFilter(c, 'muscle', m)) && exercisePurpose(c as unknown as { category?: string; exerciseObjective?: string }) === purpose){ seen.add(c.id); customs.push(c as unknown as Gym.Exercise) } }
          }catch{ /* noop */ }
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
  },[muscles, purpose, reloadKey])

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
  const addAllSelected = ()=>{ onAddMany(selected.filter(id=>!existingSet.has(id)).map(id=>{ const ex = items.find(e=>e.id===id)!; return { exId: ex.id, gifUrl: ex.gifUrl, name: ex.name, muscle: ex.muscle, imageDataUrl: ex.imageDataUrl, isStretch: purpose !== 'conventional' } })) }

  if(muscles.length===0 && purpose==='conventional'){
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 althea-modal" onClick={onClose}>
        <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border-t border-outline-variant rounded-t-2xl w-full max-w-lg lg:max-w-2xl p-4 space-y-3">
          <h3 className="font-body-md text-sm text-on-surface font-medium">Agregar a N°{dayN}</h3>
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Día: <b>{dayName || 'Sin nombre'}</b> — no detectamos grupo muscular.</p>
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Escribí el grupo en el nombre del día, ej: <b>Pecho + Tríceps</b>, <b>Espalda</b>, <b>Piernas</b>.</p>
          <AltheaButton fullWidth variant="secondary" onClick={onClose}>Cerrar</AltheaButton>
        </div>
      </div>
    )
  }

  // Portal a body: `.shell-content` (z-10) atrapa el z-index y la nav móvil queda encima.
  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[9999] p-0 sm:p-4 althea-modal" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="bg-surface/95 backdrop-blur-md border-t sm:border border-outline-variant rounded-t-2xl sm:rounded-2xl w-full max-w-lg lg:max-w-2xl max-h-[92dvh] overflow-auto p-3 sm:p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-headline-lg text-base font-semibold text-on-surface">Agregar ejercicio</h3>
            <span className="shrink-0 px-1.5 py-0.5 rounded bg-primary/10 border border-primary/40 font-label-caps text-[9px] text-primary uppercase font-semibold">Rutina asistida</span>
          </div>
          <button type="button" onClick={()=>setShowCreate(true)} className="shrink-0 px-3 min-h-[40px] rounded bg-primary text-on-primary font-label-md text-[12px] font-semibold">+ Crear ejercicio</button>
        </div>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Día: <b>{dayName}</b> → {muscles.map(m=> displayMuscle(m)).join(' + ')} <span className="text-on-surface-variant">({muscles.join(', ')})</span></div>
        <div className="flex gap-1 flex-wrap">
          {muscles.map(m=> <span key={m} className="px-2 py-1 rounded-full bg-primary border border-outline-variant font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface">{displayMuscle(m)}</span>)}
        </div>
        {existingSet.size > 0 && (
          <div className="rounded-lg bg-secondary/10 border border-secondary/30 p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-secondary">
            {existingSet.size} ejercicio{existingSet.size===1?'':'s'} ya presente{existingSet.size===1?'':'s'} en este día (marcad{existingSet.size===1?'o':'os'} en la lista).
          </div>
        )}
        <div className="flex gap-1 flex-wrap" role="group" aria-label="Finalidad del ejercicio">
          {EXERCISE_PURPOSES.map(p => (
            <button
              key={p.id}
              type="button"
              aria-pressed={purpose === p.id}
              onClick={() => { setPurpose(p.id); setMuscleFilter('todos'); setQ('') }}
              className={`px-3 py-2 min-h-[44px] rounded-full border font-label-md text-[10px] font-semibold uppercase tracking-widest ${purpose === p.id ? 'bg-primary text-on-surface border-primary' : 'bg-surface border-outline-variant text-on-surface-variant'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
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
                <button onClick={()=>toggleSelect(ex)} disabled={isExisting} className={`no-check shrink-0 m-3 w-6 h-6 rounded-full border flex items-center justify-center ${isExisting?'border-outline-variant':isSelected?'bg-primary border-primary text-on-surface':'border-outline-variant text-on-surface-variant'}`} aria-label={isExisting?`${ex.name} ya está en el día`:`Seleccionar ${ex.name}`} aria-pressed={isSelected}>
                  {isExisting ? <History size={12}/> : isSelected ? <Check size={12}/> : null}
                </button>
                <div className="flex flex-col sm:flex-row flex-1 min-w-0">
                  <div className="h-24 sm:h-28 sm:w-40 bg-surface/60 border-b sm:border-b-0 sm:border-r border-outline-variant flex items-center justify-center overflow-hidden shrink-0">
                    {(ex.gifUrl || ex.imageDataUrl) ? <img src={ex.gifUrl || ex.imageDataUrl} alt={ex.name} loading="lazy" className="w-full h-full object-contain" onError={e=>{ (e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }} /> : null}
                    <div className="hidden p-4 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-center">Vista alternativa — {ex.name}</div>
                  </div>
                  <div className="p-3 min-w-0">
                    <div className="font-body-md text-sm text-on-surface font-medium flex items-center gap-2 flex-wrap">
                      <span className="whitespace-normal break-words">{ex.name}</span>
                      {ex.origin==='USER_CREATED' ? <AltheaBadge variant="secondary" className="shrink-0 text-[10px]">Mío</AltheaBadge> : null}
                      {isExisting ? <AltheaBadge variant="outline" className="shrink-0 text-[10px]">En este día</AltheaBadge> : null}
                    </div>
                    <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">
                      <span className="text-primary">{displayMuscle(ex.muscle)}</span>{secs.length>0 ? <> + {secs.map(s=>displayMuscle(s)).join(' · ')}</> : null} · {displayEquipment(ex.equipment)}
                    </div>
                    {String(ex.exerciseDifficulty||'') && <div className="font-label-md text-[9px] font-semibold uppercase tracking-widest text-on-surface-variant mt-0.5">{displayDifficulty(ex.exerciseDifficulty)} · {displayCategory(ex.category)}</div>}
                    <div className="flex gap-2 mt-2">
                      <AltheaButton size="sm" variant="secondary" fullWidth onClick={()=> onView(ex)}><Eye size={14}/> Ver</AltheaButton>
                      <AltheaButton size="sm" fullWidth onClick={()=> onAdd(ex.id, ex.gifUrl, ex.name, ex.muscle, ex.imageDataUrl, purpose !== 'conventional')}>AGREGAR</AltheaButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )
          })}
        </div>
        <AltheaButton fullWidth variant="secondary" onClick={onClose}>Cerrar</AltheaButton>
        {showCreate && (
          <div onClick={(e)=>e.stopPropagation()}>
            <BibliotecaCustomForm
              muscles={CUSTOM_FORM_MUSCLES}
              equipment={CUSTOM_FORM_EQUIPMENT}
              categories={CUSTOM_FORM_CATEGORIES}
              onSaved={()=>{ setShowCreate(false); setReloadKey(k=>k+1) }}
              onClose={()=>setShowCreate(false)}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function ExerciseViewer({exercise, onClose, onAdd}:{exercise:Gym.Exercise; onClose:()=>void; onAdd?:()=>void}){
  const [err,setErr]=useState(false)
  const [loading,setLoading]=useState(true)
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-2 md:p-6 althea-modal" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-surface/80 backdrop-blur-md border-b border-outline-variant p-4 flex justify-between items-center">
          <div>
            <div className="font-headline-lg text-base font-semibold text-on-surface">{exercise.name}</div>
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{displayMuscle(exercise.muscle)} · {displayEquipment(exercise.equipment)} · {displayBodyPart(exercise.bodyPart)} · {displayCategory(exercise.category)}</div>
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
                <p className="font-body-md text-sm text-on-surface">Sin demo disponible</p>
                <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Este ejercicio no tiene animación cargada.</p>
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
          {onAdd && <AltheaButton fullWidth size="lg" onClick={onAdd}>AGREGAR A RUTINA</AltheaButton>}
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 althea-modal" onClick={onClose}>
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
                        <div className="font-body-md text-sm text-on-surface whitespace-normal break-words">{ex.name || ex.exId}</div>
                        {ex.sequenceRole && <div className="font-label-caps text-[9px] uppercase tracking-wider text-primary">{ex.sequenceRole === 'warmup' ? 'Calentamiento y estiramiento' : ex.sequenceRole === 'primary' ? 'Grupo muscular principal' : ex.sequenceRole === 'secondary' ? 'Grupo muscular secundario' : 'Cardio suave'}</div>}
                        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{ex.durationMin ? `1×${ex.durationMin} min suaves` : `${ex.muscle || '—'} · ${ex.sets}×${ex.reps}${ex.weight > 0 ? ` · ${ex.weight}kg` : ''}`}</div>
                      </div>
                      {ex.supersetId && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-secondary/15 border border-secondary/40 font-label-caps text-[9px] uppercase text-secondary">
                          SS {(ex.supersetOrder ?? 0) + 1}
                        </span>
                      )}
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
              {routine.explanation.priorities && routine.explanation.priorities.length > 0 && (
                <p className="font-body-md text-sm text-on-surface"><span className="font-medium">Prioridades:</span> {routine.explanation.priorities.join(', ')}</p>
              )}
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
  const [profile,setProfile]=useState<any>(null)
  const [goal,setGoal]=useState('hipertrofia')
  const [days,setDays]=useState<number[]>([])
  const [methodId,setMethodId]=useState<TrainingMethodId | ''>('')
  const [modality,setModality]=useState<'gym'|'crossfit'>('gym')
  const [equipmentMode,setEquipmentMode]=useState('profile')
  const [equipment,setEquipment]=useState<string[]>([])
  const [warmupEnabled,setWarmupEnabled]=useState(true)
  const [stretchingEnabled,setStretchingEnabled]=useState(false)
  const [cardioTiming,setCardioTiming]=useState<'none'|'start'|'end'|'both'>('none')
  const [cardioIntensity,setCardioIntensity]=useState<'light'|'hard'>('light')
  const [coachTone,setCoachTone]=useState('profesional')
  const [excludedText,setExcludedText]=useState('')
  const [historyOptions,setHistoryOptions]=useState<string[]>(['previousRoutine','pain','replaced','skipped','rating','loadsReps','observations'])
  const [error,setError]=useState('')

  const dayLabels=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
  const equipmentOptions=[
    {id:'barbell',label:'Barra'},{id:'dumbbell',label:'Mancuernas'},{id:'machine',label:'Máquinas'},
    {id:'cable',label:'Poleas'},{id:'bodyweight',label:'Peso corporal'},{id:'band',label:'Bandas'},
    {id:'kettlebell',label:'Kettlebell'},{id:'smith',label:'Smith'}
  ]
  const presets:Record<string,string[]> = {
    full_gym:['barbell','dumbbell','machine','cable','bodyweight','band','kettlebell','smith'],
    limited_gym:['barbell','dumbbell','bodyweight','band'],
    home:['dumbbell','band','bodyweight'],
    bodyweight:['bodyweight'],
    crossfit:['barbell','dumbbell','kettlebell','bodyweight','band'],
  }
  const methods = (() => {
    if(!profile) return [] as TrainingMethodId[]
    const trainingGoal = goal==='hipertrofia'?'hypertrophy':goal==='fuerza'?'strength':goal==='perdida_grasa'?'fat_loss':goal==='resistencia'?'general_health':'general_health'
    const recommendation=selectMethods({...profile,trainingGoal,availableDays:days,equipment} as any)
    const candidates=[recommendation.primary,...recommendation.secondary]
      .filter((id,index,arr)=>arr.indexOf(id)===index)
      .filter(id=>getMethod(id)?.category!=='structure' && getMethod(id)?.category!=='preparation')
    const fallback:TrainingMethodId[]=['hypertrophy','strength','functional','strength_endurance','hiit','cardio_endurance']
    for(const id of fallback){if(candidates.length>=3)break;if(!candidates.includes(id))candidates.push(id)}
    return candidates.slice(0,3)
  })()

  useEffect(()=>{
    let live=true
    db.userProfile.get('me').then(p=>{
      if(!live || !p)return
      setProfile(p)
      const legacyGoal=String(p.trainingGoal||p.goal||'')
      setGoal(legacyGoal.includes('strength')||legacyGoal.includes('fuerza')?'fuerza':legacyGoal.includes('fat_loss')||legacyGoal.includes('perdida')?'perdida_grasa':legacyGoal.includes('resistance')||legacyGoal.includes('resistencia')?'resistencia':'hipertrofia')
      const profileDays=Array.isArray(p.availableDays)?p.availableDays:Array.isArray(p.schedule?.availableDays)?p.schedule.availableDays:[]
      setDays([...new Set(profileDays.map(Number).filter((d:number)=>Number.isInteger(d)&&d>=0&&d<=6))])
      setModality(p.trainingModality==='crossfit'?'crossfit':'gym')
      const eqMap:Record<string,string>={barra:'barbell',mancuernas:'dumbbell',maquina:'machine',polea:'cable',peso_corporal:'bodyweight',banda:'band'}
      const eq=(Array.isArray(p.equipment)?p.equipment:[]).map((v:string)=>eqMap[v]||v)
      setEquipment(eq)
      const tone=String(p.coachTone||p.coachIntensity||'profesional').toLowerCase()
      setCoachTone(tone.includes('padelero')||tone.includes('motiv')?'motivacional':tone.includes('arnold')||tone==='duro'?'duro':tone.includes('psycho')||tone==='extremo'?'extremo':'profesional')
      setExcludedText([...(p.excludedMovements||[])].join(', '))
    }).catch(()=>{})
    return ()=>{live=false}
  },[])

  useEffect(()=>{
    if(!methodId && methods.length) setMethodId(methods[0])
  },[methods.join('|'),methodId])

  const toggleDay=(day:number)=>setDays(prev=>prev.includes(day)?prev.filter(d=>d!==day):[...prev,day].sort((a,b)=>a-b))
  const toggleEquipment=(id:string)=>setEquipment(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])
  const toggleHistory=(id:string)=>setHistoryOptions(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])
  const chooseEquipmentMode=(mode:string)=>{
    setEquipmentMode(mode)
    if(presets[mode])setEquipment(presets[mode])
    if(mode==='crossfit')setModality('crossfit')
    else if(mode!=='profile')setModality('gym')
    if(mode==='profile' && profile){
      const map:Record<string,string>={barra:'barbell',mancuernas:'dumbbell',maquina:'machine',polea:'cable',peso_corporal:'bodyweight',banda:'band'}
      setEquipment((profile.equipment||[]).map((v:string)=>map[v]||v))
    }
  }
  const submit=()=>{
    if(days.length===0){setError('Seleccioná al menos un día de entrenamiento.');setStep(0);return}
    if(!methodId){setError('Seleccioná un método de entrenamiento.');setStep(1);return}
    if(equipment.length===0){setError('Seleccioná el equipamiento disponible.');setStep(2);return}
    const excluded=excludedText.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean)
    const profileExcluded=Array.isArray(profile?.excludedMovements)?profile.excludedMovements:[]
    const dayCount=days.length
    const method=getMethod(methodId)
    const methodName=method?.nameEs||methodId
    const summary=[
      'Preferencias estructuradas del generador de rutinas.',
      `Objetivo: ${goal}.`,
      `Método elegido: ${methodName}.`,
      `Días: ${days.map(d=>dayLabels[d]).join(', ')}.`,
      `Modalidad: ${modality==='crossfit'?'CrossFit':'gimnasio'}.`,
      `Equipamiento disponible: ${equipment.join(', ')}.`,
      `Coach: ${coachTone}.`,
      `Calentamiento: ${warmupEnabled?'sí':'no'}; estiramientos: ${stretchingEnabled?'sí':'no'}.`,
      `Cardio: ${cardioTiming}; intensidad: ${cardioIntensity}.`,
      excluded.length? `No incluir movimientos: ${excluded.join(', ')}.`:'',
    ].filter(Boolean).join('\n')
    onGenerate({
      goal, daysPerWeek:dayCount, focus:'general', injuryNote:'',
      description:summary, level:profile?.experienceLevel||undefined,
      durationMin:Number(profile?.sessionDurationMin)||60, modality,
      allowedEquipment:equipment, excludedMovements:[...new Set([...profileExcluded,...excluded])],
      excludedExerciseIds:profile?.excludedExercises||[], availableDays:days,
      methodId, coachTone, historyOptions, equipmentLabel:equipmentMode,
      warmupEnabled, stretchingEnabled, cardioTiming, cardioIntensity
    })
  }

  const steps=['Objetivo y días','Método','Equipamiento','Preparación y cardio','Coach e historial','Exclusiones']
  const toggleCls=(active:boolean)=>`w-full text-left rounded-lg border p-3 min-h-[44px] ${active?'bg-primary/15 border-primary text-on-surface':'bg-surface border-outline-variant text-on-surface'}`
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-3 althea-modal" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Generador de rutina con IA" className="bg-surface/95 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-lg max-h-[92dvh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-outline-variant flex items-center justify-between shrink-0">
          <div><h3 className="font-headline-lg text-base font-semibold text-on-surface">Crear rutina con IA</h3><p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Paso {step+1} de {steps.length} · {steps[step]}</p></div>
          <button onClick={onClose} aria-label="Cerrar" className="w-10 h-10 rounded-lg border border-outline-variant flex items-center justify-center"><X size={16}/></button>
        </div>
        <div className="h-1 bg-surface-container shrink-0"><div className="h-full bg-primary" style={{width:`${((step+1)/steps.length)*100}%`}}/></div>
        <div className="p-4 space-y-3 overflow-y-auto min-h-0">
          {step===0 && <>
            <h4 className="font-body-md text-sm font-medium text-on-surface">Objetivo principal</h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['hipertrofia','Hipertrofia'],['fuerza','Fuerza'],['perdida_grasa','Pérdida de grasa'],['resistencia','Resistencia'],['general','Salud y condición general']
              ].map(([id,label])=><button key={id} type="button" onClick={()=>setGoal(id)} className={toggleCls(goal===id)} aria-pressed={goal===id}>{label}</button>)}
            </div>
            <h4 className="font-body-md text-sm font-medium text-on-surface pt-1">Días exactos disponibles</h4>
            <div className="grid grid-cols-4 gap-2">
              {dayLabels.map((label,d)=><button key={d} type="button" onClick={()=>toggleDay(d)} className={toggleCls(days.includes(d)}+" text-xs")} aria-pressed={days.includes(d)}>{label.slice(0,3)}</button>)}
            </div>
            <p className="font-body-sm text-[11px] text-on-surface-variant">Se respetarán estos días concretos en el calendario. Los demás quedarán como descanso.</p>
          </>}
          {step===1 && <>
            <h4 className="font-body-md text-sm font-medium text-on-surface">Elegí uno de los métodos compatibles con tu objetivo, nivel, días y equipamiento</h4>
            {methods.map((id,index)=>{
              const m=getMethod(id)
              return <button key={id} type="button" onClick={()=>setMethodId(id)} aria-pressed={methodId===id} className={toggleCls(methodId===id)}>
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{m?.nameEs||id}</span>{index===0&&<span className="text-[10px] uppercase tracking-wider text-primary">Recomendado</span>}</div>
                <p className="text-xs text-on-surface-variant mt-1">{m?.descriptionEs||m?.description||'Método de entrenamiento'}</p>
              </button>
            })}
            <p className="text-[11px] text-on-surface-variant">La distribución de grupos musculares la decide la IA según el método y la recuperación; no necesitás elegir músculos.</p>
          </>}
          {step===2 && <>
            <h4 className="font-body-md text-sm font-medium text-on-surface">¿Dónde y con qué equipamiento entrenás?</h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['profile','Usar mi perfil'],['full_gym','Gimnasio completo'],['limited_gym','Gimnasio limitado'],['home','Casa'],['bodyweight','Solo peso corporal'],['crossfit','Box de CrossFit'],['custom','Personalizado']
              ].map(([id,label])=><button key={id} type="button" onClick={()=>chooseEquipmentMode(id)} className={toggleCls(equipmentMode===id)}>{label}</button>)}
            </div>
            {equipmentMode==='custom' || equipmentMode==='profile' ? <div className="grid grid-cols-2 gap-2 pt-1">
              {equipmentOptions.map(e=><label key={e.id} className="flex items-center gap-2 text-xs text-on-surface"><input type="checkbox" checked={equipment.includes(e.id)} onChange={()=>toggleEquipment(e.id)}/>{e.label}</label>)}
            </div>:null}
            <p className="text-[11px] text-on-surface-variant">Solo se usarán ejercicios compatibles con el equipo seleccionado.</p>
          </>}
          {step===3 && <>
            <h4 className="font-body-md text-sm font-medium text-on-surface">Preparación de la sesión</h4>
            <label className="flex items-center gap-2 text-sm text-on-surface"><input type="checkbox" checked={warmupEnabled} onChange={e=>setWarmupEnabled(e.target.checked)}/> Incluir calentamiento</label>
            <label className="flex items-center gap-2 text-sm text-on-surface"><input type="checkbox" checked={stretchingEnabled} onChange={e=>setStretchingEnabled(e.target.checked)}/> Incluir estiramientos</label>
            <div className="border-t border-outline-variant pt-3 space-y-2">
              <h4 className="font-body-md text-sm font-medium text-on-surface">Cardio</h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['none','No incluir'],['start','Al inicio'],['end','Al final'],['both','Inicio y final']
                ].map(([id,label])=><button key={id} type="button" onClick={()=>setCardioTiming(id as any)} className={toggleCls(cardioTiming===id)}>{label}</button>)}
              </div>
              {cardioTiming!=='none'&&<div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={()=>setCardioIntensity('light')} className={toggleCls(cardioIntensity==='light')}>Suave</button>
                <button type="button" onClick={()=>setCardioIntensity('hard')} className={toggleCls(cardioIntensity==='hard')}>Intenso</button>
              </div>}
            </div>
          </>}
          {step===4 && <>
            <h4 className="font-body-md text-sm font-medium text-on-surface">Estilo del Coach</h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['profesional','Profesional'],['motivacional','Motivacional'],['duro','Exigente'],['extremo','Extremo']
              ].map(([id,label])=><button key={id} type="button" onClick={()=>setCoachTone(id)} className={toggleCls(coachTone===id)}>{label}</button>)}
            </div>
            <p className="text-[11px] text-on-surface-variant">El estilo modifica la comunicación y el énfasis metodológico, nunca las reglas de seguridad ni la prescripción científica.</p>
            <h4 className="font-body-md text-sm font-medium text-on-surface pt-1">¿Qué historial querés que use la IA?</h4>
            {[
              ['previousRoutine','Rutina anterior: evitar repeticiones sin motivo'],
              ['pain','Dolores registrados (siempre se consideran por seguridad)'],
              ['replaced','Ejercicios reemplazados y motivo'],
              ['skipped','Ejercicios omitidos'],
              ['rating','Valoración de las sesiones'],
              ['loadsReps','Pesos y repeticiones reales'],
              ['observations','Observaciones y comentarios']
            ].map(([id,label])=><label key={id} className="flex items-start gap-2 text-xs text-on-surface"><input type="checkbox" checked={historyOptions.includes(id)} disabled={id==='pain'} onChange={()=>toggleHistory(id)} className="mt-0.5"/><span>{label}</span></label>)}
          </>}
          {step===5 && <>
            <h4 className="font-body-md text-sm font-medium text-on-surface">Movimientos o ejercicios que no querés incluir</h4>
            <textarea value={excludedText} onChange={e=>setExcludedText(e.target.value)} rows={3} placeholder="Ej.: burpees, saltos, sentadilla con barra..." className="w-full bg-surface border border-outline-variant rounded-lg p-3 text-sm text-on-surface resize-none"/>
            <div className="rounded-lg bg-surface-container-low border border-outline-variant p-3 space-y-1 text-xs text-on-surface">
              <p><b>Objetivo:</b> {goal}</p><p><b>Días:</b> {days.map(d=>dayLabels[d]).join(', ')||'Sin seleccionar'}</p>
              <p><b>Método:</b> {getMethod(methodId||'hypertrophy')?.nameEs||'—'}</p><p><b>Modalidad:</b> {modality==='crossfit'?'CrossFit':'Gimnasio'}</p>
              <p><b>Equipo:</b> {equipment.join(', ')||'Sin seleccionar'}</p>
              <p><b>Coach:</b> {coachTone}</p>
              <p><b>Preparación:</b> {warmupEnabled?'Calentamiento ':' '}{stretchingEnabled?'Estiramientos':''} · Cardio: {cardioTiming}</p>
            </div>
          </>}
          {error&&<p role="alert" className="text-xs text-error">{error}</p>}
        </div>
        <div className="p-3 border-t border-outline-variant flex gap-2 shrink-0">
          {step>0&&<button type="button" onClick={()=>{setError('');setStep(step-1)}} className="px-4 py-3 rounded-lg border border-outline-variant text-sm text-on-surface">Atrás</button>}
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-lg border border-outline-variant text-sm text-on-surface">Cancelar</button>
          {step<5?<button type="button" onClick={()=>{setError('');if(step===0&&days.length===0){setError('Seleccioná al menos un día.');return}if(step===2&&equipment.length===0){setError('Seleccioná el equipamiento.');return}setStep(step+1)}} className="flex-1 py-3 rounded-lg bg-primary text-on-primary font-medium">Siguiente</button>
          :<button type="button" onClick={submit} className="flex-1 py-3 rounded-lg bg-primary text-on-primary font-medium flex items-center justify-center gap-1"><Sparkles size={14}/> Generar rutina</button>}
        </div>
      </div>
    </div>
  )
}
