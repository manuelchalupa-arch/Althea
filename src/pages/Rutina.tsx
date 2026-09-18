import { useEffect, useState } from 'react'
import { db, ensureSeeded } from '@/services/storage/db'
import type { Exercise } from '@/types'
import { DEFAULT_CYCLE, type CycleConfig } from '@/utils/cycle'
import { v4 as uuid } from 'uuid'
import { Plus, Trash2, Clock, AlertTriangle, History, Dumbbell, Search, Eye, Sparkles, X, Check, RefreshCw } from 'lucide-react'
import BrandIcon from '@/components/brand/BrandIcon'
import { IconDumbbell, IconFire, IconLightning, IconBody, IconTarget } from '@/components/brand/FitnessIcons'
import { AltheaCard, AltheaCardHeader, AltheaBadge, AltheaButton, AltheaSection } from '@/components/althea'
import { generateRoutineWithAI, isRoutineAIAvailable, type GeneratedRoutine, type UserWants } from '@/services/ai/routineBuilderIA'
import { parseDayMuscles, displayMuscle } from '@/utils/muscleMap'
import { getCycleFromProfile } from '@/utils/cycle'
import { getMethod } from '@/services/ai/trainingMethodsDB'
import * as Gym from '@/services/exerciseGym'

const WEEK_LABELS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

function getMethodDefaults(cycle: CycleConfig) {
  const method = cycle?.methodId ? getMethod(cycle.methodId) : undefined
  return {
    sets: method?.defaults.setsPerExercise ?? 3,
    reps: method?.defaults.repsRange?.[1] ?? 10,
    weight: 0,
  }
}

type RutinaData = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  rotationDays: number
  cycle: CycleConfig
  dayExercises: Record<number, {id:string; exId:string; sets:number; reps:number; weight:number; gifUrl?:string; name?:string; muscle?:string}[]>
}

// Migración no destructiva: si existe viejo formato, convertir a lista
async function loadRoutines(): Promise<{ list: RutinaData[]; activeId: string | null }> {
  try {
    const { getAllRoutines, getActiveRoutineId, migrateRoutinesFromLocalStorage } = await import('@/services/storage/routineStore')
    await migrateRoutinesFromLocalStorage()
    const list = await getAllRoutines()
    const activeId = await getActiveRoutineId()
    if (list.length > 0) return { list, activeId }
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
  const [newName,setNewName]=useState('')
  const [selectorOpen,setSelectorOpen]=useState(false)
  const [rotationRec,setRotationRec]=useState<string|null>(null)
  const [viewer,setViewer]=useState<Gym.Exercise|null>(null)
  const [aiLoading,setAiLoading]=useState(false)
  const [aiError,setAiError]=useState<string|null>(null)
  const [aiPreview,setAiPreview]=useState<GeneratedRoutine|null>(null)
  const [showQuestionnaire,setShowQuestionnaire]=useState(false)

  useEffect(()=>{
    ensureSeeded().then(async()=>{
      const ex = await db.exercises.toArray(); setExercises(ex)
      // Load routines from Dexie (with migration from localStorage)
      const { list, activeId: aid } = await loadRoutines()
      setRoutines(list); setActiveId(aid); setRoutinesLoaded(true)
      // si active no tiene cycle, intenta cargar de userProfile
      const p = await db.userProfile.get('me') as any
      if(p?.cycle && list.length===1 && JSON.stringify(list[0].cycle)===JSON.stringify(DEFAULT_CYCLE)){
        const upd = list.map(r=> r.id===aid ? {...r, cycle: p.cycle} : r)
        setRoutines(upd); saveRoutines(upd, aid)
      }
    })
  },[])

  // sync active cycle a userProfile para que Inicio/Entrenar/Coach usen rutina activa
  useEffect(()=>{
    if(!active) return
    db.userProfile.get('me').then(async p=>{
      const base = p ?? { id:'me', goal:'hipertrofia', level:'intermedio', availableDays:[1,3,5], trainingTime:'18:00', equipment:['barra'], units:{weight:'kg',liquid:'ml'}, lang:'es', coachIntensity:'profesional', onboardingDone:true, hydrationGoalMl:2500, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }
      if(JSON.stringify((base as any).cycle) !== JSON.stringify(active.cycle)){
        await db.userProfile.put({ ...base, cycle: active.cycle, updatedAt: new Date().toISOString() } as any)
      }
    })
    const days = Math.floor((Date.now() - new Date(active.createdAt).getTime())/86400000)
    if(days >= active.rotationDays){
      const hist = Object.values(active.dayExercises).flat().slice(0,3).map(x=> (x as any).name || x.exId).join(', ')
      setRotationRec(`Tu rutina "${active.name}" lleva ${days} días (límite ${active.rotationDays}). Ejercicios: ${hist || '—'}. Sugerencia: cambiar Press inclinado con barra por Press inclinado con mancuernas (mismo grupo pecho).`)
    } else setRotationRec(null)
  },[activeId, active?.cycle, active?.createdAt])

  const updateActive = (fn:(r:RutinaData)=>RutinaData)=>{
    const next = routines.map(r=> r.id===activeId ? {...fn(r), updatedAt: new Date().toISOString()} : r)
    setRoutines(next); saveRoutines(next, activeId)
  }
  const setActive = (id:string)=>{
    setActiveId(id)
    import('@/services/storage/routineStore').then(({ setActiveRoutineId }) => setActiveRoutineId(id))
    // sync cycle
    const r = routines.find(x=>x.id===id)
    if(r) db.userProfile.get('me').then(async p=>{
      const base = p ?? { id:'me', goal:'hipertrofia', level:'intermedio', availableDays:[1,3,5], trainingTime:'18:00', equipment:['barra'], units:{weight:'kg',liquid:'ml'}, lang:'es', coachIntensity:'profesional', onboardingDone:true, hydrationGoalMl:2500, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }
      await db.userProfile.put({ ...base, cycle: r.cycle, updatedAt: new Date().toISOString() } as any)
    })
  }
  const createNew = ()=>{
    if(routines.length>=4){
      alert('Tenés 4 rutinas guardadas.\nPara crear otra rutina, modificá o eliminá una de las existentes.')
      return
    }
    if(!newName.trim()){ alert('Ingresá un nombre'); return }
    const data: RutinaData = {
      id: uuid(), name: newName.trim(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      rotationDays: 30, cycle: DEFAULT_CYCLE, dayExercises: {}
    }
    const next = [...routines, data]
    setRoutines(next); setActiveId(data.id); saveRoutines(next, data.id); setNewName(''); setShowNew(false)
  }
  const deleteRoutine = (id:string)=>{
    if(!confirm('¿Eliminar esta rutina?\nEsta acción eliminará la rutina guardada y su configuración.')) return
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
        <h1 className="font-headline-lg text-lg font-semibold text-on-surface flex items-center gap-2"><Dumbbell size={20} className="text-primary"/> Rutina</h1>
        <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-2">No hay rutinas guardadas.</p>
        <button onClick={()=>setShowNew(true)} className="mt-4 w-full py-3 rounded bg-primary text-on-surface">+ Nueva rutina</button>
        {showNew && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowNew(false)}>
            <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-md p-4 space-y-3">
              <h3 className="font-headline-lg text-base font-semibold text-on-surface">Crear nueva rutina</h3>
              <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Nombre: Rutina de verano" className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface"/>
              <div className="flex gap-2">
                <button onClick={()=>setShowNew(false)} className="flex-1 py-3 rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant font-body-md text-sm text-on-surface">Cancelar</button>
                <button onClick={createNew} className="flex-1 py-3 rounded bg-primary text-on-surface">Crear rutina</button>
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
      <div className="rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Rutina:</div>
        <button onClick={()=>setSelectorOpen(!selectorOpen)} className="mt-1 w-full flex items-center justify-between bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface">
          <span className="font-medium">{active.name}</span>
          <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">▼</span>
        </button>
        {selectorOpen && (
          <div className="mt-2 rounded bg-surface/60 border border-outline-variant p-2 space-y-1">
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Seleccionar rutina</div>
            {routines.map(r=>(
              <label key={r.id} className="flex items-center gap-2 p-2 rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant cursor-pointer">
                <input type="radio" name="rutina" checked={r.id===activeId} onChange={()=>{ setActive(r.id); setSelectorOpen(false)}} />
                <span className="font-body-md text-sm text-on-surface flex-1">{r.name} {r.id===activeId && '●'}</span>
                <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{r.id===activeId ? 'activa' : ''}</span>
              </label>
            ))}
            <button onClick={()=>{ setSelectorOpen(false); setShowNew(true)}} className="w-full py-2 rounded bg-primary text-on-surface flex items-center justify-center gap-1"><Plus size={14}/> Nueva rutina</button>
            {isRoutineAIAvailable() && routines.length < 4 && (
              <button onClick={()=>{ setSelectorOpen(false); setShowQuestionnaire(true) }} className="w-full py-2 rounded bg-gradient-to-r from-amber-600 to-orange-500 text-white flex items-center justify-center gap-1 font-medium">
                <Sparkles size={14}/> Crear con IA
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <h1 className="font-headline-lg text-lg font-semibold text-on-surface flex items-center gap-2"><Dumbbell size={20} className="text-primary"/> {active.name}</h1>
        <span className={`ml-auto font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant px-2 py-1 rounded-full border ${estado==='Revisar'?'bg-amber-900/30 border-amber-800 text-amber-300':'bg-primary border-outline-variant text-primary'}`}>{estado} · {daysElapsed}d</span>
      </div>

      {/* Rutina actual */}
      <div className="rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2">
        <div className="flex gap-2 items-center">
          <input value={active.name} onChange={e=> updateActive(r=> ({...r, name: e.target.value}))} className="flex-1 bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface font-medium" />
          <button onClick={()=>deleteRoutine(active.id)} className="px-3 py-2 rounded bg-surface/60 border border-outline-variant font-body-md text-sm text-on-surface flex items-center gap-1"><Trash2 size={14}/> Eliminar</button>
        </div>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><Clock size={12}/> Creada {new Date(active.createdAt).toLocaleDateString('es')} · {daysElapsed} días</div>
        <div className="flex gap-2 items-center">
          <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Período para revisar</span>
          <select value={active.rotationDays} onChange={e=> updateActive(r=> ({...r, rotationDays: Number(e.target.value)}))} className="ml-auto bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface">
            <option value={20}>20 días</option><option value={30}>30 días</option><option value={45}>45 días</option><option value={60}>60 días</option>
          </select>
        </div>
        {rotationRec && (
          <div className="rounded bg-amber-900/20 border border-amber-800 p-3">
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-amber-300 flex items-center gap-1"><AlertTriangle size={12}/> Revisión inteligente</div>
            <p className="font-body-md text-sm text-on-surface mt-1">{rotationRec}</p>
            <div className="flex gap-1 mt-2">
              <button onClick={()=>{ alert('Recomendación aceptada — editá los ejercicios'); setRotationRec(null)}} className="flex-1 py-2 rounded-lg bg-primary text-on-surface">Aceptar</button>
              <button onClick={()=>setRotationRec(null)} className="flex-1 py-2 rounded-lg bg-surface border border-outline-variant font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Rechazar</button>
              <button onClick={()=>{ const n=prompt('Modificar días para revisar?'); if(n) updateActive(r=> ({...r, rotationDays: Number(n)}))}} className="flex-1 py-2 rounded-lg bg-surface/60 border border-outline-variant font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Modificar</button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-3">

      {/* Días N° */}
      <div className="space-y-3">
        {active.cycle.trainingDays.map(d=>{
          const exs = active.dayExercises[d.n] || []
          return (
            <div key={d.n} className="rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-on-surface font-bold font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface">N°{d.n}</div>
                  <input value={d.name} onChange={e=>{
                    updateActive(r=> ({...r, cycle: {...r.cycle, trainingDays: r.cycle.trainingDays.map(x=> x.n===d.n? {...x, name:e.target.value}:x)}}))
                  }} className="bg-surface/60 backdrop-blur-sm border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface" />
                </div>
                <button onClick={()=>setPickerFor(d.n)} className="px-3 py-1 rounded bg-primary text-on-surface flex items-center gap-1"><Plus size={12}/> Ejercicio</button>
              </div>
              <div className="space-y-2">
                {exs.map((it,idx)=>{
                  const ex = exercises.find(e=>e.id===it.exId) as any
                  return (
                    <div key={it.id} className="rounded bg-surface/60 border border-outline-variant p-3">
                      <div className="flex justify-between">
                        <span className="font-body-md text-sm text-on-surface font-medium">{ex?.name || (it as any).name || it.exId}</span>
                        <button onClick={()=>{
                          updateActive(r=> ({...r, dayExercises: {...r.dayExercises, [d.n]: (r.dayExercises[d.n]||[]).filter((_,i)=>i!==idx)}}))
                        }} className="text-on-surface-variant"><Trash2 size={14}/></button>
                      </div>
                      <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{ex?.groupMain || (it as any).muscle || 'grupo'} · {ex?.equipment || ''} · objetivo {it.sets}×{it.reps} · {it.weight}kg</div>
                       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 mt-2">
                        <input type="number" value={it.sets} onChange={e=>{
                          updateActive(r=>{ const a=[...(r.dayExercises[d.n]||[])]; (a[idx] as any).sets=Number(e.target.value); return {...r, dayExercises:{...r.dayExercises, [d.n]:a}}})
                        }} className="bg-surface border border-outline-variant rounded-lg p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant" placeholder="Series"/>
                        <input type="number" value={it.reps} onChange={e=>{
                          updateActive(r=>{ const a=[...(r.dayExercises[d.n]||[])]; (a[idx] as any).reps=Number(e.target.value); return {...r, dayExercises:{...r.dayExercises, [d.n]:a}}})
                        }} className="bg-surface border border-outline-variant rounded-lg p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant" placeholder="Reps"/>
                        <input type="number" value={it.weight} onChange={e=>{
                          updateActive(r=>{ const a=[...(r.dayExercises[d.n]||[])]; (a[idx] as any).weight=Number(e.target.value); return {...r, dayExercises:{...r.dayExercises, [d.n]:a}}})
                        }} className="bg-surface border border-outline-variant rounded-lg p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant" placeholder="Peso"/>
                      </div>
                    </div>
                  )
                })}
                {exs.length===0 && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-center py-2">Sin ejercicios. Agregá desde selector inteligente.</p>}
              </div>
            </div>
          )
        })}
        <button onClick={()=>{
          const n = Math.max(0,...active.cycle.trainingDays.map(d=>d.n))+1
          updateActive(r=> ({...r, cycle: {...r.cycle, trainingDays:[...r.cycle.trainingDays,{n, name:`Día N°${n}`} ]}}))
        }} className="w-full py-3 rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant font-body-md text-sm text-on-surface flex items-center justify-center gap-2"><Plus size={16}/> Agregar Día N°</button>
      </div>

      {/* Asignación calendario */}
      <div className="rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Asignación calendario</div>
        {WEEK_LABELS.map((w,i)=>(
          <div key={i} className="flex justify-between items-center bg-surface/60 backdrop-blur-sm border border-outline-variant rounded-lg p-2 mt-1">
            <span className="font-body-md text-sm text-on-surface">{w}</span>
            <select value={active.cycle.weekMap[i] ?? ''} onChange={e=>{
              const wm=[...active.cycle.weekMap]; wm[i]= e.target.value ? Number(e.target.value):null
              updateActive(r=> ({...r, cycle: {...r.cycle, weekMap: wm}}))
            }} className="bg-surface border border-outline-variant rounded-lg p-2 font-body-md text-sm text-on-surface">
              <option value="">Descanso</option>
              {active.cycle.trainingDays.map(d=> <option key={d.n} value={d.n}>N°{d.n} — {d.name}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div className="rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><History size={14}/> Historial de rutinas</div>
        <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Rutina activa {active.name} · {daysElapsed} días. Otras {routines.length-1} guardadas intactas. Historial sesiones/setLogs conservado por rutina.</p>
        <div className="mt-2 flex gap-1 flex-wrap">
          {routines.map(r=> <span key={r.id} className={`px-2 py-1 rounded-full border font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ${r.id===activeId?'bg-primary text-on-surface border-primary':'bg-surface/60 border-outline-variant'}`}>{r.name}</span>)}
        </div>
      </div>

      </div>

      <div className="lg:col-span-4 space-y-3 hidden lg:block">
        <div className="rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><Dumbbell size={14}/> Stats de la rutina</div>
          <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"><span>Días de entrenamiento</span><span className="font-body-md text-sm text-on-surface font-medium">{active.cycle.trainingDays.length}/semana</span></div>
          <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"><span>Total ejercicios</span><span className="font-body-md text-sm text-on-surface font-medium">{Object.values(active.dayExercises).flat().length}</span></div>
          <div className="flex justify-between font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"><span>Total series</span><span className="font-body-md text-sm text-on-surface font-medium">{Object.values(active.dayExercises).flat().reduce((a: number, e: any) => a + (e.sets || 0), 0)}</span></div>
        </div>
        {active.cycle.methodId && (() => {
          const m = getMethod(active.cycle.methodId)
          return m ? (
            <div className="rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2">
            <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-primary flex items-center gap-1"><Sparkles size={14}/> Método activo</div>
              <div className="font-body-md text-sm text-on-surface font-medium">{m.nameEs}</div>
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant leading-relaxed">{m.description.slice(0, 120)}…</div>
            </div>
          ) : null
        })()}
        <div className="rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><AlertTriangle size={14}/> Tips rápidos</div>
          <ul className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant space-y-1.5 list-disc list-inside">
            <li>Mantené hidratación durante la sesión</li>
            <li>Respetá los descansos entre series</li>
            <li>Registrá cada ejercicio para progresión</li>
          </ul>
        </div>
      </div>

      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowNew(false)}>
          <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-md p-4 space-y-3">
            <h3 className="font-headline-lg text-base font-semibold text-on-surface">Crear nueva rutina</h3>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Nombre:</p>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Rutina de verano" className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-sm text-on-surface"/>
            <div className="flex gap-2">
              <button onClick={()=>setShowNew(false)} className="flex-1 py-3 rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant font-body-md text-sm text-on-surface">Cancelar</button>
              <button onClick={()=>{
                if(routines.length>=4){ alert('Tenés 4 rutinas guardadas.\nPara crear otra rutina, modificá o eliminá una de las existentes.'); return}
                if(!newName.trim()){ alert('Ingresá un nombre'); return}
                const data: RutinaData = { id: uuid(), name: newName.trim(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), rotationDays:30, cycle: DEFAULT_CYCLE, dayExercises:{}}
                const next=[...routines,data]; setRoutines(next); setActiveId(data.id); saveRoutines(next,data.id); setNewName(''); setShowNew(false)
              }} className="flex-1 py-3 rounded bg-primary text-on-surface">Crear rutina</button>
            </div>
            {routines.length>=4 && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-amber-300">Tenés 4 rutinas guardadas. Para crear otra, eliminá una.</p>}
          </div>
        </div>
      )}

      {pickerFor!==null && (
        <IntelligentPicker
          dayN={pickerFor}
          dayName={active.cycle.trainingDays.find(d=>d.n===pickerFor)?.name || ''}
          onAdd={(exId,gifUrl,name,muscle,imageDataUrl)=>{
            const d = getMethodDefaults(active.cycle)
            updateActive(r=> ({...r, dayExercises: {...r.dayExercises, [pickerFor!]: [...(r.dayExercises[pickerFor!]||[]), { id: uuid(), exId, sets:d.sets, reps:d.reps, weight:d.weight, gifUrl, name, muscle, imageDataUrl } as any]}}))
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
            updateActive(r=> ({...r, dayExercises: {...r.dayExercises, [pickerFor!]: [...(r.dayExercises[pickerFor!]||[]), { id: uuid(), exId: viewer.id, sets:d.sets, reps:d.reps, weight:d.weight, gifUrl: viewer.gifUrl, name: viewer.name, muscle: viewer.muscle, imageDataUrl: (viewer as any).imageDataUrl } as any]}}))
          }
          setViewer(null); setPickerFor(null)
        }} />
      )}

      {/* AI Generation Loading */}
      {aiLoading && !aiPreview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-md p-6 space-y-4 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-amber-600 to-orange-500 flex items-center justify-center">
              <Sparkles size={32} className="text-white animate-pulse"/>
            </div>
            <h3 className="font-headline-lg text-base font-semibold text-on-surface">Coach IA está pensando…</h3>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Analizando tu perfil, historial y estilo de coaching para generar una rutina personalizada.</p>
            <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-600 to-orange-500 rounded-full animate-pulse" style={{width:'60%'}}/>
            </div>
          </div>
        </div>
      )}

      {/* AI Generation Error */}
      {aiError && !aiLoading && !aiPreview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setAiError(null)}>
          <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-md p-4 space-y-3">
            <h3 className="font-headline-lg text-base font-semibold text-on-surface text-red-400">Error al generar</h3>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{aiError}</p>
            <div className="flex gap-2">
              <button onClick={()=>setAiError(null)} className="flex-1 py-3 rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant font-body-md text-sm text-on-surface">Cerrar</button>
              <button onClick={()=>{ setAiError(null); setShowQuestionnaire(true) }} className="flex-1 py-3 rounded bg-primary text-on-surface">Reintentar</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Preview Modal */}
      {aiPreview && (
        <RoutineAIPreview
          routine={aiPreview}
          onConfirm={(name)=>{
            if(routines.length>=4){ alert('Tenés 4 rutinas guardadas.'); return }
            const data: RutinaData = {
              id: uuid(), name: name || aiPreview.name,
              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
              rotationDays: 30,
              cycle: { ...aiPreview.cycle, startDate: new Date().toISOString().slice(0, 10) },
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

function IntelligentPicker({dayN, dayName, onAdd, onClose, onView}:{dayN:number; dayName:string; onAdd:(exId:string,gifUrl:string,name:string,muscle:string,imageDataUrl?:string)=>void; onClose:()=>void; onView:(ex:Gym.Exercise)=>void}){
  const muscles = parseDayMuscles(dayName)
  const [q,setQ]=useState('')
  const [equipFilter,setEquipFilter]=useState('todos')
  const [items,setItems]=useState<Gym.Exercise[]>([])
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState<string|null>(null)
  const [methodHint,setMethodHint]=useState<{types:string[];avoid:string[]}|null>(null)
  useEffect(()=>{
    if(muscles.length===0) return
    let cancelled=false
    // Load method hint for exercise prioritization
    db.userProfile.get('me').then(p=>{
      if(cancelled) return
      const cycle = (p as any)?.cycle
      if(cycle?.methodId){
        import('@/services/ai/trainingMethodsDB').then(({ getMethod })=>{
          if(cancelled) return
          const m = getMethod(cycle.methodId)
          if(m) setMethodHint({ types: m.exerciseSelection.primaryTypes, avoid: m.exerciseSelection.avoidExercises || [] })
        })
      }
    }).catch(()=>{})
    const load = async ()=>{
      setLoading(true); setErr(null)
      try{
        const results = await Promise.all(muscles.map(m=> Gym.fetchByMuscle(m).catch(()=> ({exercises:[] as Gym.Exercise[]})) ))
        let merged:Gym.Exercise[] = []
        const seen=new Set<string>()
        results.forEach(r=>{
          (r as any).exercises?.forEach((ex:Gym.Exercise)=>{
            if(!seen.has(ex.id) && ex.muscle && muscles.includes(ex.muscle)){
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
        if(merged.length===0 && !cancelled) setErr('No encontramos ejercicios compatibles con este grupo muscular.\nProbá con otro grupo, equipamiento o término de búsqueda.')
        if(!cancelled) setItems(merged)
      }catch(e:any){ if(!cancelled) setErr(e.message) }
      finally{ if(!cancelled) setLoading(false) }
    }
    load()
    return ()=>{ cancelled=true }
  },[dayName])

  const filtered = items.filter(ex=>{
    if(equipFilter!=='todos' && ex.equipment !== equipFilter) return false
    if(q && !ex.name.toLowerCase().includes(q.toLowerCase())) return false
    if(methodHint?.avoid?.length && methodHint.avoid.some(a => ex.name.toLowerCase().includes(a.toLowerCase()))) return false
    return true
  })

  // Sort: method primaryTypes first
  const sorted = methodHint?.types?.length ? [...filtered].sort((a,b) => {
    const aMatch = methodHint.types.some(t => (a.category||'').toLowerCase().includes(t) || (a.name||'').toLowerCase().includes(t)) ? 0 : 1
    const bMatch = methodHint.types.some(t => (b.category||'').toLowerCase().includes(t) || (b.name||'').toLowerCase().includes(t)) ? 0 : 1
    return aMatch - bMatch
  }) : filtered

  if(muscles.length===0){
    return (
      <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={onClose}>
        <div onClick={e=>e.stopPropagation()} className="bg-surface/90 backdrop-blur-md border-t border-outline-variant rounded-t-2xl w-full max-w-lg lg:max-w-2xl p-4 space-y-3">
          <h3 className="font-body-md text-sm text-on-surface font-medium">Agregar a N°{dayN}</h3>
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Día: <b>{dayName || 'Sin nombre'}</b> — no detectamos grupo muscular.</p>
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Escribí el grupo en el nombre del día, ej: <b>Pecho + Tríceps</b>, <b>Espalda</b>, <b>Piernas</b>.</p>
          <button onClick={onClose} className="w-full py-3 rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant">Cerrar</button>
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
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-on-surface-variant"/>
          <input placeholder="Buscar dentro del grupo (ej: press)..." value={q} onChange={e=>setQ(e.target.value)} className="w-full bg-surface border border-outline-variant rounded pl-9 p-2 font-body-md text-sm text-on-surface"/>
        </div>
        <div className="flex gap-2">
          <select value={equipFilter} onChange={e=>setEquipFilter(e.target.value)} className="flex-1 bg-surface border border-outline-variant rounded p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            <option value="todos">Equipo: todos</option>
            <option value="barbell">Barra</option><option value="dumbbell">Mancuernas</option><option value="cable">Polea</option><option value="bodyweight">Peso corporal</option><option value="machine">Máquina</option><option value="band">Banda</option>
          </select>
          <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant self-center">{sorted.length} compatibles</span>
        </div>
        {methodHint && (
          <div className="rounded-lg bg-surface/60 border border-outline-variant p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            <span className="text-primary font-medium">Método:</span> priorizando {methodHint.types.join(', ')}
          </div>
        )}
        {loading && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-center py-4">Cargando GIFs desde ExerciseGymGifsDB…</p>}
        {err && !loading && sorted.length===0 && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-amber-300 text-center py-4 whitespace-pre-line">{err}</p>}
        {!loading && sorted.length===0 && !err && <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-center py-4">Sin ejercicios para este filtro. Probá otro equipamiento o búsqueda.</p>}
        <div className="grid grid-cols-1 gap-3 max-h-[45vh] overflow-auto pr-1">
          {sorted.slice(0,60).map(ex=>(
            <div key={ex.id} className="rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant overflow-hidden">
              <div className="h-36 bg-surface/60 border-b border-outline-variant flex items-center justify-center overflow-hidden">
                {(ex.gifUrl || (ex as any).imageDataUrl) ? <img src={ex.gifUrl || (ex as any).imageDataUrl} alt={ex.name} loading="lazy" className="w-full h-full object-cover" onError={e=>{ (e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }} /> : null}
                <div className="hidden p-4 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-center">Vista alternativa — {ex.name}</div>
              </div>
              <div className="p-3">
                <div className="font-body-md text-sm text-on-surface font-medium flex items-center gap-2"><span className="truncate">{ex.name}</span>{(ex as any).origin==='USER_CREATED' ? <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-primary px-2 py-0.5 rounded-full bg-surface-container-high border border-primary shrink-0">Mío</span> : null}</div>
                <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{displayMuscle(ex.muscle)} · {ex.equipment} · {ex.bodyPart}</div>
                <div className="flex gap-2 mt-2">
                  <button onClick={()=> onView(ex)} className="flex-1 py-2 rounded bg-surface/60 border border-outline-variant font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center justify-center gap-1"><Eye size={14}/> Ver ejercicio</button>
                  <button onClick={()=> onAdd(ex.id, ex.gifUrl, ex.name, ex.muscle, (ex as any).imageDataUrl)} className="flex-1 py-2 rounded bg-primary text-on-surface font-medium">AGREGAR</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="w-full py-3 rounded  bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant">Cerrar</button>
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
            {(!err && (exercise.gifUrl || (exercise as any).imageDataUrl)) ? (
              <img
                src={(exercise as any).imageDataUrl || exercise.gifUrl}
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
          <button onClick={onAdd} className="mt-3 w-full py-3 rounded bg-primary text-on-surface font-medium">AGREGAR A RUTINA</button>
        </div>
      </div>
    </div>
  )
}

function RoutineAIPreview({routine, onConfirm, onRegenerate, onClose}:{routine:GeneratedRoutine; onConfirm:(name:string)=>void; onRegenerate:()=>void; onClose:()=>void}){
  const [name,setName]=useState(routine.name)
  const method = routine.cycle.methodId ? getMethod(routine.cycle.methodId as any) : null
  const totalExercises = Object.values(routine.dayExercises).flat().length
  const totalSets = Object.values(routine.dayExercises).flat().reduce((a,e)=>a+(e.sets||0),0)
  const WEEK=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-0 md:p-4" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="bg-surface/60 border-t md:border border-outline-variant rounded-t-2xl md:rounded-2xl w-full max-w-lg lg:max-w-2xl max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-surface/80 backdrop-blur-md border-b border-outline-variant p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-600 to-orange-500 flex items-center justify-center"><Sparkles size={16} className="text-white"/></div>
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-600 to-orange-500 flex items-center justify-center"><Sparkles size={16} className="text-white"/></div>
            <div>
              <div className="font-headline-lg text-base font-semibold text-on-surface">Crear rutina con IA</div>
              <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Paso {step+1} de 4</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface border border-outline-variant flex items-center justify-center"><X size={16}/></button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-surface"><div className="h-full bg-gradient-to-r from-amber-600 to-orange-500 transition-all" style={{width:`${((step+1)/4)*100}%`}}/></div>

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
            {canGenerate && <button onClick={()=>onGenerate({ goal, daysPerWeek: days, focus, injuryNote: injury })} className="flex-1 py-3 rounded bg-gradient-to-r from-amber-600 to-orange-500 text-white font-medium flex items-center justify-center gap-1"><Sparkles size={14}/> Generar rutina</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
