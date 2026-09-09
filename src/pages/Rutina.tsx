import { useEffect, useState } from 'react'
import { db, ensureSeeded } from '@/services/storage/db'
import type { Exercise } from '@/types'
import { DEFAULT_CYCLE, type CycleConfig } from '@/utils/cycle'
import { v4 as uuid } from 'uuid'
import { Plus, Trash2, Clock, AlertTriangle, History, Dumbbell, Search, Eye } from 'lucide-react'
import { parseDayMuscles, displayMuscle } from '@/utils/muscleMap'
import * as Gym from '@/services/exerciseGym'

const WEEK_LABELS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

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
function loadRoutines(): { list: RutinaData[]; activeId: string | null } {
  try{
    const rawList = localStorage.getItem('rutinas:list')
    if(rawList){
      const parsed = JSON.parse(rawList)
      if(Array.isArray(parsed) && parsed.length>0){
        const activeId = localStorage.getItem('rutina:activeId') || parsed[0].id
        return { list: parsed, activeId }
      }
    }
    // migrar viejo
    const oldMeta = JSON.parse(localStorage.getItem('rutina:meta')||'null')
    const oldEx = JSON.parse(localStorage.getItem('rutina:ex')||'null')
    const oldCycleRaw = localStorage.getItem('rutina:ex') ? null : null
    // cycle viene de userProfile, lo cargará luego
    if(oldMeta){
      const data: RutinaData = {
        id: oldMeta.id || 'r1',
        name: oldMeta.name || 'Rutina 1',
        createdAt: oldMeta.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rotationDays: oldMeta.rotationDays || 30,
        cycle: DEFAULT_CYCLE,
        dayExercises: oldEx || {}
      }
      localStorage.setItem('rutinas:list', JSON.stringify([data]))
      localStorage.setItem('rutina:activeId', data.id)
      return { list: [data], activeId: data.id }
    }
  }catch{}
  const def: RutinaData = {
    id: 'r1', name: 'Rutina 1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    rotationDays: 30, cycle: DEFAULT_CYCLE, dayExercises: {}
  }
  return { list: [def], activeId: def.id }
}

function saveRoutines(list: RutinaData[], activeId: string | null){
  localStorage.setItem('rutinas:list', JSON.stringify(list))
  if(activeId) localStorage.setItem('rutina:activeId', activeId)
  // compat: también guarda en viejo keys para no perder si algo lee viejo
  const active = list.find(r=>r.id===activeId) || list[0]
  if(active){
    localStorage.setItem('rutina:meta', JSON.stringify({ id:active.id, name:active.name, createdAt:active.createdAt, rotationDays:active.rotationDays }))
    localStorage.setItem('rutina:ex', JSON.stringify(active.dayExercises))
  }
}

export default function RutinaPage(){
  const [exercises,setExercises]=useState<Exercise[]>([])
  const [routines,setRoutines]=useState<RutinaData[]>(()=> loadRoutines().list)
  const [activeId,setActiveId]=useState<string | null>(()=> loadRoutines().activeId)
  const active = routines.find(r=>r.id===activeId) || routines[0]
  const [pickerFor,setPickerFor]=useState<number|null>(null)
  const [showNew,setShowNew]=useState(false)
  const [newName,setNewName]=useState('')
  const [selectorOpen,setSelectorOpen]=useState(false)
  const [rotationRec,setRotationRec]=useState<string|null>(null)
  const [viewer,setViewer]=useState<Gym.Exercise|null>(null)

  useEffect(()=>{
    ensureSeeded().then(async()=>{
      const ex = await db.exercises.toArray(); setExercises(ex)
      // si active no tiene cycle, intenta cargar de userProfile
      const p = await db.userProfile.get('me') as any
      if(p?.cycle && routines.length===1 && JSON.stringify(routines[0].cycle)===JSON.stringify(DEFAULT_CYCLE)){
        const upd = routines.map(r=> r.id===activeId ? {...r, cycle: p.cycle} : r)
        setRoutines(upd); saveRoutines(upd, activeId)
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
    setActiveId(id); localStorage.setItem('rutina:activeId', id)
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
      <div className="min-h-screen bg-bg p-4 pb-24 max-w-lg mx-auto">
        <h1 className="text-section flex items-center gap-2"><Dumbbell size={20} className="text-action"/> Rutina</h1>
        <p className="text-aux text-textMuted mt-2">No hay rutinas guardadas.</p>
        <button onClick={()=>setShowNew(true)} className="mt-4 w-full py-3 rounded-xl bg-action text-textMain">+ Nueva rutina</button>
        {showNew && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowNew(false)}>
            <div onClick={e=>e.stopPropagation()} className="bg-bg border border-border rounded-2xl w-full max-w-md p-4 space-y-3">
              <h3 className="text-subtitle">Crear nueva rutina</h3>
              <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Nombre: Rutina de verano" className="w-full bg-surface border border-border rounded-xl p-3 text-body"/>
              <div className="flex gap-2">
                <button onClick={()=>setShowNew(false)} className="flex-1 py-3 rounded-xl bg-surface border border-border text-body">Cancelar</button>
                <button onClick={createNew} className="flex-1 py-3 rounded-xl bg-action text-textMain">Crear rutina</button>
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
    <div className="min-h-screen bg-bg p-4 pb-24 max-w-lg mx-auto space-y-4">
      {/* Selector superior */}
      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux">Rutina:</div>
        <button onClick={()=>setSelectorOpen(!selectorOpen)} className="mt-1 w-full flex items-center justify-between bg-bg border border-border rounded-xl p-3 text-body">
          <span className="font-medium">{active.name}</span>
          <span className="text-aux">▼</span>
        </button>
        {selectorOpen && (
          <div className="mt-2 rounded-xl bg-bg border border-border p-2 space-y-1">
            <div className="text-aux">Seleccionar rutina</div>
            {routines.map(r=>(
              <label key={r.id} className="flex items-center gap-2 p-2 rounded-xl bg-surface border border-border cursor-pointer">
                <input type="radio" name="rutina" checked={r.id===activeId} onChange={()=>{ setActive(r.id); setSelectorOpen(false)}} />
                <span className="text-body flex-1">{r.name} {r.id===activeId && '●'}</span>
                <span className="text-aux">{r.id===activeId ? 'activa' : ''}</span>
              </label>
            ))}
            <button onClick={()=>{ setSelectorOpen(false); setShowNew(true)}} className="w-full py-2 rounded-xl bg-action text-textMain flex items-center justify-center gap-1"><Plus size={14}/> Nueva rutina</button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <h1 className="text-section flex items-center gap-2"><Dumbbell size={20} className="text-action"/> {active.name}</h1>
        <span className={`ml-auto text-aux px-2 py-1 rounded-full border ${estado==='Revisar'?'bg-amber-900/30 border-amber-800 text-amber-300':'bg-accentDark border-border text-info'}`}>{estado} · {daysElapsed}d</span>
      </div>

      {/* Rutina actual */}
      <div className="rounded-xl bg-surface border border-border p-3 space-y-2">
        <div className="flex gap-2 items-center">
          <input value={active.name} onChange={e=> updateActive(r=> ({...r, name: e.target.value}))} className="flex-1 bg-bg border border-border rounded-xl p-2 text-body font-medium" />
          <button onClick={()=>deleteRoutine(active.id)} className="px-3 py-2 rounded-xl bg-bg border border-border text-body flex items-center gap-1"><Trash2 size={14}/> Eliminar</button>
        </div>
        <div className="text-aux flex items-center gap-1"><Clock size={12}/> Creada {new Date(active.createdAt).toLocaleDateString('es')} · {daysElapsed} días</div>
        <div className="flex gap-2 items-center">
          <span className="text-aux">Período para revisar</span>
          <select value={active.rotationDays} onChange={e=> updateActive(r=> ({...r, rotationDays: Number(e.target.value)}))} className="ml-auto bg-bg border border-border rounded-xl p-2 text-body">
            <option value={20}>20 días</option><option value={30}>30 días</option><option value={45}>45 días</option><option value={60}>60 días</option>
          </select>
        </div>
        {rotationRec && (
          <div className="rounded-xl bg-amber-900/20 border border-amber-800 p-3">
            <div className="text-aux text-amber-300 flex items-center gap-1"><AlertTriangle size={12}/> Revisión inteligente</div>
            <p className="text-body mt-1">{rotationRec}</p>
            <div className="flex gap-1 mt-2">
              <button onClick={()=>{ alert('Recomendación aceptada — editá los ejercicios'); setRotationRec(null)}} className="flex-1 py-2 rounded-lg bg-action text-textMain">Aceptar</button>
              <button onClick={()=>setRotationRec(null)} className="flex-1 py-2 rounded-lg bg-surface border border-border text-aux">Rechazar</button>
              <button onClick={()=>{ const n=prompt('Modificar días para revisar?'); if(n) updateActive(r=> ({...r, rotationDays: Number(n)}))}} className="flex-1 py-2 rounded-lg bg-bg border border-border text-aux">Modificar</button>
            </div>
          </div>
        )}
      </div>

      {/* Días N° */}
      <div className="space-y-3">
        {active.cycle.trainingDays.map(d=>{
          const exs = active.dayExercises[d.n] || []
          return (
            <div key={d.n} className="rounded-xl bg-surface border border-border p-3 space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-accentDark flex items-center justify-center text-info font-bold text-aux">N°{d.n}</div>
                  <input value={d.name} onChange={e=>{
                    updateActive(r=> ({...r, cycle: {...r.cycle, trainingDays: r.cycle.trainingDays.map(x=> x.n===d.n? {...x, name:e.target.value}:x)}}))
                  }} className="bg-bg border border-border rounded-xl p-2 text-body" />
                </div>
                <button onClick={()=>setPickerFor(d.n)} className="px-3 py-1 rounded-xl bg-action text-textMain flex items-center gap-1"><Plus size={12}/> Ejercicio</button>
              </div>
              <div className="space-y-2">
                {exs.map((it,idx)=>{
                  const ex = exercises.find(e=>e.id===it.exId) as any
                  return (
                    <div key={it.id} className="rounded-xl bg-bg border border-border p-3">
                      <div className="flex justify-between">
                        <span className="text-body font-medium">{ex?.name || (it as any).name || it.exId}</span>
                        <button onClick={()=>{
                          updateActive(r=> ({...r, dayExercises: {...r.dayExercises, [d.n]: (r.dayExercises[d.n]||[]).filter((_,i)=>i!==idx)}}))
                        }} className="text-textMuted"><Trash2 size={14}/></button>
                      </div>
                      <div className="text-aux text-textMuted">{ex?.groupMain || (it as any).muscle || 'grupo'} · {ex?.equipment || ''} · objetivo {it.sets}×{it.reps} · {it.weight}kg</div>
                      <div className="grid grid-cols-3 gap-1 mt-2">
                        <input type="number" value={it.sets} onChange={e=>{
                          updateActive(r=>{ const a=[...(r.dayExercises[d.n]||[])]; (a[idx] as any).sets=Number(e.target.value); return {...r, dayExercises:{...r.dayExercises, [d.n]:a}}})
                        }} className="bg-surface border border-border rounded-lg p-2 text-aux" placeholder="Series"/>
                        <input type="number" value={it.reps} onChange={e=>{
                          updateActive(r=>{ const a=[...(r.dayExercises[d.n]||[])]; (a[idx] as any).reps=Number(e.target.value); return {...r, dayExercises:{...r.dayExercises, [d.n]:a}}})
                        }} className="bg-surface border border-border rounded-lg p-2 text-aux" placeholder="Reps"/>
                        <input type="number" value={it.weight} onChange={e=>{
                          updateActive(r=>{ const a=[...(r.dayExercises[d.n]||[])]; (a[idx] as any).weight=Number(e.target.value); return {...r, dayExercises:{...r.dayExercises, [d.n]:a}}})
                        }} className="bg-surface border border-border rounded-lg p-2 text-aux" placeholder="Peso"/>
                      </div>
                    </div>
                  )
                })}
                {exs.length===0 && <p className="text-aux text-textMuted text-center py-2">Sin ejercicios. Agregá desde selector inteligente.</p>}
              </div>
            </div>
          )
        })}
        <button onClick={()=>{
          const n = Math.max(0,...active.cycle.trainingDays.map(d=>d.n))+1
          updateActive(r=> ({...r, cycle: {...r.cycle, trainingDays:[...r.cycle.trainingDays,{n, name:`Día N°${n}`} ]}}))
        }} className="w-full py-3 rounded-xl bg-surface border border-border text-body flex items-center justify-center gap-2"><Plus size={16}/> Agregar Día N°</button>
      </div>

      {/* Asignación calendario */}
      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux">Asignación calendario</div>
        {WEEK_LABELS.map((w,i)=>(
          <div key={i} className="flex justify-between items-center bg-bg border border-border rounded-lg p-2 mt-1">
            <span className="text-body">{w}</span>
            <select value={active.cycle.weekMap[i] ?? ''} onChange={e=>{
              const wm=[...active.cycle.weekMap]; wm[i]= e.target.value ? Number(e.target.value):null
              updateActive(r=> ({...r, cycle: {...r.cycle, weekMap: wm}}))
            }} className="bg-surface border border-border rounded-lg p-2 text-body">
              <option value="">Descanso</option>
              {active.cycle.trainingDays.map(d=> <option key={d.n} value={d.n}>N°{d.n} — {d.name}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux flex items-center gap-1"><History size={14}/> Historial de rutinas</div>
        <p className="text-aux text-textMuted">Rutina activa {active.name} · {daysElapsed} días. Otras {routines.length-1} guardadas intactas. Historial sesiones/setLogs conservado por rutina.</p>
        <div className="mt-2 flex gap-1 flex-wrap">
          {routines.map(r=> <span key={r.id} className={`px-2 py-1 rounded-full border text-aux ${r.id===activeId?'bg-action text-textMain border-action':'bg-bg border-border'}`}>{r.name}</span>)}
        </div>
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowNew(false)}>
          <div onClick={e=>e.stopPropagation()} className="bg-bg border border-border rounded-2xl w-full max-w-md p-4 space-y-3">
            <h3 className="text-subtitle">Crear nueva rutina</h3>
            <p className="text-aux">Nombre:</p>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Rutina de verano" className="w-full bg-surface border border-border rounded-xl p-3 text-body"/>
            <div className="flex gap-2">
              <button onClick={()=>setShowNew(false)} className="flex-1 py-3 rounded-xl bg-surface border border-border text-body">Cancelar</button>
              <button onClick={()=>{
                if(routines.length>=4){ alert('Tenés 4 rutinas guardadas.\nPara crear otra rutina, modificá o eliminá una de las existentes.'); return}
                if(!newName.trim()){ alert('Ingresá un nombre'); return}
                const data: RutinaData = { id: uuid(), name: newName.trim(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), rotationDays:30, cycle: DEFAULT_CYCLE, dayExercises:{}}
                const next=[...routines,data]; setRoutines(next); setActiveId(data.id); saveRoutines(next,data.id); setNewName(''); setShowNew(false)
              }} className="flex-1 py-3 rounded-xl bg-action text-textMain">Crear rutina</button>
            </div>
            {routines.length>=4 && <p className="text-aux text-amber-300">Tenés 4 rutinas guardadas. Para crear otra, eliminá una.</p>}
          </div>
        </div>
      )}

      {pickerFor!==null && (
        <IntelligentPicker
          dayN={pickerFor}
          dayName={active.cycle.trainingDays.find(d=>d.n===pickerFor)?.name || ''}
          onAdd={(exId,gifUrl,name,muscle)=>{
            updateActive(r=> ({...r, dayExercises: {...r.dayExercises, [pickerFor!]: [...(r.dayExercises[pickerFor!]||[]), { id: uuid(), exId, sets:3, reps:10, weight:40, gifUrl, name, muscle } as any]}}))
            setPickerFor(null)
          }}
          onClose={()=>setPickerFor(null)}
          onView={setViewer}
        />
      )}

      {viewer && (
        <ExerciseViewer exercise={viewer} onClose={()=>setViewer(null)} onAdd={()=>{
          if(pickerFor!==null){
            updateActive(r=> ({...r, dayExercises: {...r.dayExercises, [pickerFor!]: [...(r.dayExercises[pickerFor!]||[]), { id: uuid(), exId: viewer.id, sets:3, reps:10, weight:40, gifUrl: viewer.gifUrl, name: viewer.name, muscle: viewer.muscle } as any]}}))
          }
          setViewer(null); setPickerFor(null)
        }} />
      )}
    </div>
  )
}

function IntelligentPicker({dayN, dayName, onAdd, onClose, onView}:{dayN:number; dayName:string; onAdd:(exId:string,gifUrl:string,name:string,muscle:string)=>void; onClose:()=>void; onView:(ex:Gym.Exercise)=>void}){
  const muscles = parseDayMuscles(dayName)
  const [q,setQ]=useState('')
  const [equipFilter,setEquipFilter]=useState('todos')
  const [items,setItems]=useState<Gym.Exercise[]>([])
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState<string|null>(null)
  useEffect(()=>{
    if(muscles.length===0) return
    let cancelled=false
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
    return true
  })

  if(muscles.length===0){
    return (
      <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={onClose}>
        <div onClick={e=>e.stopPropagation()} className="bg-bg border-t border-border rounded-t-2xl w-full max-w-lg p-4 space-y-3">
          <h3 className="text-body font-medium">Agregar a N°{dayN}</h3>
          <p className="text-aux">Día: <b>{dayName || 'Sin nombre'}</b> — no detectamos grupo muscular.</p>
          <p className="text-aux text-textMuted">Escribí el grupo en el nombre del día, ej: <b>Pecho + Tríceps</b>, <b>Espalda</b>, <b>Piernas</b>.</p>
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-surface border border-border">Cerrar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="bg-bg border-t border-border rounded-t-2xl w-full max-w-lg max-h-[80vh] overflow-auto p-4 space-y-3">
        <h3 className="text-subtitle">Agregar ejercicio</h3>
        <div className="text-aux">Día: <b>{dayName}</b> → {muscles.map(m=> displayMuscle(m)).join(' + ')} <span className="text-textMuted">({muscles.join(', ')})</span></div>
        <div className="flex gap-1 flex-wrap">
          {muscles.map(m=> <span key={m} className="px-2 py-1 rounded-full bg-accentDark border border-border text-aux text-info">{displayMuscle(m)}</span>)}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-textMuted"/>
          <input placeholder="Buscar dentro del grupo (ej: press)..." value={q} onChange={e=>setQ(e.target.value)} className="w-full bg-surface border border-border rounded-xl pl-9 p-2 text-body"/>
        </div>
        <div className="flex gap-2">
          <select value={equipFilter} onChange={e=>setEquipFilter(e.target.value)} className="flex-1 bg-surface border border-border rounded-xl p-2 text-aux">
            <option value="todos">Equipo: todos</option>
            <option value="barbell">Barra</option><option value="dumbbell">Mancuernas</option><option value="cable">Polea</option><option value="bodyweight">Peso corporal</option><option value="machine">Máquina</option><option value="band">Banda</option>
          </select>
          <span className="text-aux self-center">{filtered.length} compatibles</span>
        </div>
        {loading && <p className="text-aux text-center py-4">Cargando GIFs desde ExerciseGymGifsDB…</p>}
        {err && !loading && filtered.length===0 && <p className="text-aux text-amber-300 text-center py-4 whitespace-pre-line">{err}</p>}
        {!loading && filtered.length===0 && !err && <p className="text-aux text-center py-4">Sin ejercicios para este filtro. Probá otro equipamiento o búsqueda.</p>}
        <div className="grid grid-cols-1 gap-3 max-h-[45vh] overflow-auto pr-1">
          {filtered.slice(0,60).map(ex=>(
            <div key={ex.id} className="rounded-xl bg-surface border border-border overflow-hidden">
              <div className="h-36 bg-bg border-b border-border flex items-center justify-center overflow-hidden">
                {ex.gifUrl ? <img src={ex.gifUrl} alt={ex.name} loading="lazy" className="w-full h-full object-cover" onError={e=>{ (e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }} /> : null}
                <div className="hidden p-4 text-aux text-center">Vista alternativa — {ex.name}</div>
              </div>
              <div className="p-3">
                <div className="text-body font-medium">{ex.name}</div>
                <div className="text-aux text-textMuted">{displayMuscle(ex.muscle)} · {ex.equipment} · {ex.bodyPart}</div>
                <div className="flex gap-2 mt-2">
                  <button onClick={()=> onView(ex)} className="flex-1 py-2 rounded-xl bg-bg border border-border text-aux flex items-center justify-center gap-1"><Eye size={14}/> Ver ejercicio</button>
                  <button onClick={()=> onAdd(ex.id, ex.gifUrl, ex.name, ex.muscle)} className="flex-1 py-2 rounded-xl bg-action text-textMain font-medium">AGREGAR</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="w-full py-3 rounded-xl bg-surface border border-border">Cerrar</button>
      </div>
    </div>
  )
}

function ExerciseViewer({exercise, onClose, onAdd}:{exercise:Gym.Exercise; onClose:()=>void; onAdd:()=>void}){
  const [err,setErr]=useState(false)
  const [loading,setLoading]=useState(true)
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-2 md:p-6" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="bg-bg border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-bg border-b border-border p-4 flex justify-between items-center">
          <div>
            <div className="text-subtitle">{exercise.name}</div>
            <div className="text-aux text-textMuted">{displayMuscle(exercise.muscle)} · {exercise.equipment} · {exercise.bodyPart} · {exercise.category}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center text-body">✕</button>
        </div>
        <div className="p-4">
          <div className="rounded-xl bg-surface border border-border overflow-hidden flex items-center justify-center min-h-[280px] md:min-h-[400px] p-2">
            {loading && !err && <span className="text-aux">Cargando ejercicio...</span>}
            {!err ? (
              <img
                src={exercise.gifUrl}
                alt={exercise.name}
                className="max-w-full max-h-[60vh] md:max-h-[65vh] w-auto h-auto object-contain"
                onLoad={()=>setLoading(false)}
                onError={()=>{ setErr(true); setLoading(false)}}
              />
            ) : (
              <div className="text-center p-6">
                <p className="text-body">No se pudo cargar la animación.</p>
                <p className="text-aux text-textMuted">Podés continuar agregando el ejercicio a la rutina.</p>
              </div>
            )}
          </div>
          {exercise.instructions?.length>0 && (
            <div className="mt-3 rounded-xl bg-surface border border-border p-3">
              <div className="text-aux">Instrucciones</div>
              <ol className="list-decimal list-inside text-body space-y-1 mt-1">
                {exercise.instructions.map((s,i)=><li key={i}>{s}</li>)}
              </ol>
            </div>
          )}
          <button onClick={onAdd} className="mt-3 w-full py-3 rounded-xl bg-action text-textMain font-medium">AGREGAR A RUTINA</button>
        </div>
      </div>
    </div>
  )
}
