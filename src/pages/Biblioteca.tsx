import { useEffect, useState } from 'react'
import * as Gym from '@/services/exerciseGym'
import { effectiveBreakdown, listCustomExercises } from '@/services/training/customExercises'
import BibliotecaCustomForm from './BibliotecaCustomForm'
import type { CustomExercise } from '@/services/training/customExercises'
import { Search, Dumbbell, Layers, Box, Heart, Globe, WifiOff } from 'lucide-react'

type Tab = 'muscle'|'equipment'|'bodypart'|'category'

export default function Biblioteca(){
  const [tab,setTab]=useState<Tab>('muscle')
  const [muscles,setMuscles]=useState<Gym.MuscleEntry[]>([])
  const [equipment,setEquipment]=useState<Gym.EquipmentEntry[]>([])
  const [bodyparts,setBodyparts]=useState<Gym.BodyPartEntry[]>([])
  const [categories,setCategories]=useState<Gym.CategoryEntry[]>([])
  const [selectedKey,setSelectedKey]=useState<string>('__all__')
  const [exercises,setExercises]=useState<Gym.Exercise[]>([])
  const [q,setQ]=useState('')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [detail,setDetail]=useState<Gym.Exercise|null>(null)
  const [showForm,setShowForm]=useState(false)
  const [editing,setEditing]=useState<CustomExercise|null>(null)
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true

  const musclePct = (ex: Gym.Exercise)=> effectiveBreakdown(ex)

  useEffect(()=>{
    // carga índices iniciales (cacheados por SW)
    Gym.fetchMuscles().then(setMuscles).catch(()=>{})
    Gym.fetchEquipment().then(setEquipment).catch(()=>{})
    Gym.fetchBodyParts().then(setBodyparts).catch(()=>{})
    Gym.fetchCategories().then(setCategories).catch(()=>{})
  },[])

  const load = async (t:Tab, key:string)=>{
    setSelectedKey(key); setLoading(true); setError(null)
    const cacheKey = `${t}:${key}`
    try{
      let res:any
      if(key==='__all__'){
        // Todos: union completa del nivel (una sola request, cacheada). Sin duplicados por id.
        const all = await Gym.fetchAll()
        const seen = new Set<string>()
        res = { exercises: (all.exercises || []).filter((e:any)=>{ if(!e || seen.has(e.id)) return false; seen.add(e.id); return true }) }
      }
      else if(t==='muscle') res = await Gym.fetchByMuscle(key)
      else if(t==='equipment') res = await Gym.fetchByEquipment(key)
      else if(t==='bodypart') res = await Gym.fetchByBodyPart(key)
      else if(t==='category') res = await Gym.fetchByCategory(key)
      const customs = await listCustomExercises(key==='__all__' ? undefined : t, key==='__all__' ? undefined : key).catch(()=>[])
      const merged = [...(res.exercises || []), ...customs].sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'es'))
      setExercises(merged)
      Gym.cacheSet(cacheKey, res.exercises)
    }catch(e:any){
      const cached = Gym.cacheGet(cacheKey)
      if(cached){ setExercises(cached); setError('Mostrando caché offline (sin conexión).') }
      else setError(e.message || 'Error al cargar')
    }finally{ setLoading(false) }
  }

  useEffect(()=>{ load('muscle','__all__') },[])

  const filtered = exercises.filter(ex=>{ if(!q) return true; const s=q.toLowerCase(); return ex.name.toLowerCase().includes(s) || String(ex.muscle||'').toLowerCase().includes(s) || String(ex.bodyPart||'').toLowerCase().includes(s) || String(ex.equipment||'').toLowerCase().includes(s) || String(ex.category||'').toLowerCase().includes(s) })

  const Chip = ({active, children, onClick}:{active:boolean; children:string; onClick:()=>void})=>(
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-aux whitespace-nowrap border ${active?'bg-action text-textMain border-action':'bg-surface border-border text-textMuted'}`}>{children}</button>
  )

  const handleDeleteCustom = async (ex: Gym.Exercise)=>{
    const mod = await import('@/services/training/customExercises')
    const withHistory = await mod.hasHistory(ex.id)
    const msg = withHistory
      ? 'Tiene historial: se archivará (desaparece de listas, historial intacto). ¿Continuar?'
      : '¿Eliminar este ejercicio? No se puede deshacer.'
    if(!confirm(msg)) return
    const res = await mod.deleteCustomExercise(ex.id)
    alert(res==='archived' ? 'Archivado: fuera de listas, historial intacto.' : 'Ejercicio eliminado.')
    setDetail(null)
    load(tab, selectedKey)
  }

  return (
    <div className="min-h-screen bg-bg p-4 pb-24 max-w-lg lg:max-w-3xl mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-section">Biblioteca</h1>
        <span className="text-aux bg-surface border border-border px-2 py-1 rounded-full flex items-center gap-1"><Globe size={12}/> 1323 ejercicios</span>
      </div>
      <p className="text-aux text-textMuted">Consulta técnica y % muscular — sin copiar.</p>
      <button onClick={()=>{ setEditing(null); setShowForm(true) }} className="w-full py-3 rounded-xl bg-action text-textMain font-medium">+ Agregar ejercicio</button>

      {!online && <div className="text-aux bg-amber-900/30 border border-amber-800 rounded-lg p-2 flex items-center gap-2"><WifiOff size={14}/> Sin conexión — se muestra caché.</div>}
      {error && <div className="text-aux bg-amber-900/30 border border-amber-800 rounded-lg p-2">{error}</div>}

      {/* Tabs (al entrar a cada filtro: selectedFilter = Todos) */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface border border-border overflow-x-auto">
        <button onClick={()=>{ setTab('muscle'); load('muscle','__all__') }} className={`flex-1 py-2 rounded-lg text-aux flex items-center justify-center gap-1 ${tab==='muscle'?'bg-action text-textMain':'text-textMuted'}`}><Heart size={12}/> Músculo</button>
        <button onClick={()=>{ setTab('equipment'); load('equipment','__all__') }} className={`flex-1 py-2 rounded-lg text-aux flex items-center justify-center gap-1 ${tab==='equipment'?'bg-action text-textMain':'text-textMuted'}`}><Dumbbell size={12}/> Equipo</button>
        <button onClick={()=>{ setTab('bodypart'); load('bodypart','__all__') }} className={`flex-1 py-2 rounded-lg text-aux flex items-center justify-center gap-1 ${tab==='bodypart'?'bg-action text-textMain':'text-textMuted'}`}><Layers size={12}/> Parte</button>
        <button onClick={()=>{ setTab('category'); load('category','__all__') }} className={`flex-1 py-2 rounded-lg text-aux flex items-center justify-center gap-1 ${tab==='category'?'bg-action text-textMain':'text-textMuted'}`}><Box size={12}/> Categoría</button>
      </div>

      {/* Listado índices */}
      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux mb-2">
          {tab==='muscle' && '19 músculos · ej: pectorals 158, biceps 151, abs 169'}
          {tab==='equipment' && '11 equipamientos · bodyweight 458, dumbbell 287 · /api/es/equipment/<equipment>.json'}
          {tab==='bodypart' && '7 partes · arms/legs/chest/back/core/shoulders/cardio'}
          {tab==='category' && 'strength/stretching/cardio/plyometrics'}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip active={selectedKey==='__all__'} onClick={()=>load(tab, '__all__')}>{`Todos (${exercises.length || '…'})`}</Chip>
          {tab==='muscle' && muscles.map(m=> <Chip key={m.muscle} active={selectedKey===m.muscle} onClick={()=>load('muscle', m.muscle)}>{`${m.muscle} (${m.count})`}</Chip>)}
          {tab==='equipment' && equipment.map(e=> <Chip key={e.equipment} active={selectedKey===e.equipment} onClick={()=>load('equipment', e.equipment)}>{`${e.equipment} (${e.count})`}</Chip>)}
          {tab==='bodypart' && bodyparts.map(b=> <Chip key={b.bodyPart} active={selectedKey===b.bodyPart} onClick={()=>load('bodypart', b.bodyPart)}>{`${b.bodyPart} (${b.count})`}</Chip>)}
          {tab==='category' && categories.map(c=> <Chip key={c.category} active={selectedKey===c.category} onClick={()=>load('category', c.category)}>{`${c.category} (${c.count})`}</Chip>)}
          {(muscles.length===0 && tab==='muscle') && <span className="text-aux">Cargando...</span>}
        </div>
      </div>

      {/* Buscador + filtros avanzados */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3.5 text-textMuted"/>
        <input placeholder={`Filtrar en ${selectedKey==='__all__' ? 'todos' : selectedKey}...`} value={q} onChange={e=>setQ(e.target.value)} className="w-full bg-surface border border-border rounded-xl pl-9 p-3 text-body" />
      </div>
      <div className="rounded-xl bg-surface border border-border p-3">
        <div className="text-aux">Filtros avanzados · dificultad / patrón movimiento</div>
        <div className="flex gap-2 mt-2">
          <select onChange={e=>{
            const v=e.target.value; const el=document.getElementById('list-ex'); if(!el) return;
            // patrón simple: filtra por nombre
          }} className="flex-1 bg-bg border border-border rounded-xl p-2 text-aux">
            <option value="">Patrón: todos</option><option>push</option><option>pull</option><option>squat</option><option>hinge</option><option>core</option>
          </select>
          <select className="flex-1 bg-bg border border-border rounded-xl p-2 text-aux">
            <option>Dificultad: todos</option><option>principiante</option><option>intermedio</option><option>avanzado</option>
          </select>
        </div>
        <p className="text-aux text-textMuted mt-1">Usa ExerciseGym + filtro local. Variantes: al ver detalle, sugiere mismo músculo/equipo.</p>
      </div>

      {/* Resultados — solo consulta */}
      <div className="text-aux text-textMuted">{loading ? 'Cargando ejercicios...' : `${filtered.length} ejercicios para consultar`}</div>

      <div className="grid gap-3">
        {filtered.map(ex=>(
          <div key={ex.id} onClick={()=>setDetail(ex)} className="rounded-xl bg-surface border border-border overflow-hidden cursor-pointer active:bg-bg">
            <div className="relative w-full aspect-[4/3] bg-bg border-b border-border flex items-center justify-center">
              <span className="absolute text-aux">GIF no disponible</span>
              {(ex.gifUrl || (ex as any).imageDataUrl) ? <img src={ex.gifUrl || (ex as any).imageDataUrl} alt={ex.name} loading="lazy" onError={e=>{(e.target as HTMLImageElement).style.display='none'}} className="relative w-full h-full object-contain" /> : null}
            </div>
            <div className="p-3">
              <div className="text-body font-medium flex items-center gap-2"><span className="truncate">{ex.name}</span>{(ex as any).origin==='USER_CREATED' ? <span className="text-aux px-2 py-0.5 rounded-full bg-elevated border border-info text-info shrink-0">Mío</span> : null}</div>
              <div className="text-aux text-textMuted">{ex.muscle} · {ex.equipment} · {ex.bodyPart}</div>
              <div className="text-aux mt-1">
                {musclePct(ex).map(m=> (
                  <span key={m.name} className={`inline-block mr-1 px-2 py-0.5 rounded-full border text-aux ${m.role==='Principal'?'bg-accentDark border-info text-info':'bg-bg border-border text-textMuted'}`}>{m.name} {m.pct}%</span>
                ))}
              </div>
            </div>
          </div>
        ))}
        {filtered.length===0 && !loading && <p className="text-muted text-center py-6">Sin resultados</p>}
      </div>

      {/* Detalle solo informativo */}
      {detail && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={()=>setDetail(null)}>
          <div onClick={e=>e.stopPropagation()} className="bg-bg border-t border-border rounded-t-2xl w-full max-w-lg lg:max-w-3xl max-h-[85vh] overflow-auto">
            <div className="relative w-full bg-black/40 border-b border-border flex items-center justify-center min-h-[240px] p-2">
              <span className="absolute text-aux">GIF no disponible</span>
              {(detail.gifUrl || (detail as any).imageDataUrl) ? <img src={detail.gifUrl || (detail as any).imageDataUrl} alt={detail.name} onError={e=>{(e.target as HTMLImageElement).style.display='none'}} className="relative max-w-full w-auto h-auto max-h-[55vh] object-contain" /> : null}
            </div>
            <div className="p-4 space-y-3">
              <h2 className="text-subtitle">{detail.name}</h2>
              <p className="text-aux text-textMuted">{detail.muscle} · {detail.bodyPart} · {detail.equipment} · {detail.category}</p>
              <div className="rounded-xl bg-surface border border-border p-3">
                <div className="text-aux">Músculos trabajados</div>
                <div className="mt-2 space-y-2">
                  {musclePct(detail).map(m=>(
                    <div key={m.name} className="flex items-center gap-2">
                      <span className="flex-1 text-body">{m.name} <span className="text-aux text-textMuted">· {m.role}</span></span>
                      <span className="text-body font-medium">{m.pct}%</span>
                      <div className="w-20 h-2 bg-bg border border-border rounded-full overflow-hidden"><div className={`h-full ${m.role==='Principal'?'bg-action':'bg-info'}`} style={{width:`${m.pct}%`}}/></div>
                    </div>
                  ))}
                </div>
                <p className="text-aux text-textMuted mt-2">Principal ~70% · Secundarios comparten ~30% (estimado orientativo).</p>
              </div>
              <div className="rounded-xl bg-surface border border-border p-3">
                <div className="text-aux">Cómo hacerlo</div>
                <ol className="list-decimal list-inside text-body space-y-1 mt-1">{detail.instructions.map((s,i)=><li key={i}>{s}</li>)}</ol>
              </div>
              {(detail as any).origin==='USER_CREATED' ? (
                <div className="flex gap-2">
                  <button onClick={()=>{ setEditing(detail as any) }} className="flex-1 py-3 rounded-xl bg-surface border border-border text-body">Editar</button>
                  <button onClick={()=>handleDeleteCustom(detail)} className="flex-1 py-3 rounded-xl bg-surface border border-danger/50 text-aux">Eliminar</button>
                </div>
              ) : null}
              <button onClick={()=>setDetail(null)} className="w-full py-3 rounded-xl bg-action text-textMain">Cerrar</button>
              <p className="text-aux text-textMuted text-center">Solo informativo — sin copiar. Usá Rutina para agregar con selector inteligente.</p>
            </div>
          </div>
        </div>
      )}
      {showForm && (
        <BibliotecaCustomForm
          initial={editing}
          muscles={muscles.map((m) => m.muscle)}
          equipment={equipment.map((e) => e.equipment)}
          categories={categories.map((c) => c.category)}
          onSaved={()=>{ setShowForm(false); setEditing(null); setDetail(null); load(tab, selectedKey) }}
          onClose={()=>{ setShowForm(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
