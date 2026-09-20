import { useEffect, useState } from 'react'
import * as Gym from '@/services/exerciseGym'
import { effectiveBreakdown, listCustomExercises } from '@/services/training/customExercises'
import BibliotecaCustomForm from './BibliotecaCustomForm'
import type { CustomExercise } from '@/services/training/customExercises'
import { Search, Dumbbell, Layers, Box, Heart, Globe, WifiOff } from 'lucide-react'
import { AltheaCard, AltheaBadge, AltheaInput } from '@/components/althea'

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
        res = { exercises: (all.exercises || []).filter((e:any)=>{ if(!e || seen.has(e.id)) {return false;} seen.add(e.id); return true }) }
      }
      else if(t==='muscle') {res = await Gym.fetchByMuscle(key)}
      else if(t==='equipment') {res = await Gym.fetchByEquipment(key)}
      else if(t==='bodypart') {res = await Gym.fetchByBodyPart(key)}
      else if(t==='category') {res = await Gym.fetchByCategory(key)}
      const customs = await listCustomExercises(key==='__all__' ? undefined : t, key==='__all__' ? undefined : key).catch(()=>[])
      const merged = [...(res.exercises || []), ...customs].sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'es'))
      setExercises(merged)
      Gym.cacheSet(cacheKey, res.exercises)
    }catch(e:any){
      const cached = Gym.cacheGet(cacheKey)
      if(cached){ setExercises(cached); setError('Mostrando caché offline (sin conexión).') }
      else {setError(e.message || 'Error al cargar')}
    }finally{ setLoading(false) }
  }

  useEffect(()=>{ load('muscle','__all__') },[])

  const filtered = exercises.filter(ex=>{ if(!q) {return true;} const s=q.toLowerCase(); return ex.name.toLowerCase().includes(s) || String(ex.muscle||'').toLowerCase().includes(s) || String(ex.bodyPart||'').toLowerCase().includes(s) || String(ex.equipment||'').toLowerCase().includes(s) || String(ex.category||'').toLowerCase().includes(s) })

  const Chip = ({active, children, onClick}:{active:boolean; children:string; onClick:()=>void})=>(
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant whitespace-nowrap border ${active?'bg-primary text-on-surface border-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant text-on-surface-variant'}`}>{children}</button>
  )

  const handleDeleteCustom = async (ex: Gym.Exercise)=>{
    const mod = await import('@/services/training/customExercises')
    const withHistory = await mod.hasHistory(ex.id)
    const msg = withHistory
      ? 'Tiene historial: se archivará (desaparece de listas, historial intacto). ¿Continuar?'
      : '¿Eliminar este ejercicio? No se puede deshacer.'
    if(!confirm(msg)) {return}
    const res = await mod.deleteCustomExercise(ex.id)
    alert(res==='archived' ? 'Archivado: fuera de listas, historial intacto.' : 'Ejercicio eliminado.')
    setDetail(null)
    load(tab, selectedKey)
  }

  return (
    <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 pb-24 max-w-[1440px] w-full mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="font-headline-lg text-lg font-semibold text-on-surface">Biblioteca</h1>
        <AltheaBadge variant="outline"><Globe size={12}/> 1323 ejercicios</AltheaBadge>
      </div>
      <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant">Consulta técnica y % muscular — sin copiar.</p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-3">
      {!online && <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant bg-amber-900/30 border border-amber-800 rounded-lg p-2 flex items-center gap-2"><WifiOff size={14}/> Sin conexión — se muestra caché.</div>}
      {error && <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant bg-amber-900/30 border border-amber-800 rounded-lg p-2">{error}</div>}

      {/* Tabs (al entrar a cada filtro: selectedFilter = Todos) */}
      <div className="flex gap-1 p-1 rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant overflow-x-auto">
        <button onClick={()=>{ setTab('muscle'); load('muscle','__all__') }} className={`flex-1 py-2 rounded-lg font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center justify-center gap-1 ${tab==='muscle'?'bg-primary text-on-surface':'text-on-surface-variant'}`}><Heart size={12}/> Músculo</button>
        <button onClick={()=>{ setTab('equipment'); load('equipment','__all__') }} className={`flex-1 py-2 rounded-lg font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center justify-center gap-1 ${tab==='equipment'?'bg-primary text-on-surface':'text-on-surface-variant'}`}><Dumbbell size={12}/> Equipo</button>
        <button onClick={()=>{ setTab('bodypart'); load('bodypart','__all__') }} className={`flex-1 py-2 rounded-lg font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center justify-center gap-1 ${tab==='bodypart'?'bg-primary text-on-surface':'text-on-surface-variant'}`}><Layers size={12}/> Parte</button>
        <button onClick={()=>{ setTab('category'); load('category','__all__') }} className={`flex-1 py-2 rounded-lg font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center justify-center gap-1 ${tab==='category'?'bg-primary text-on-surface':'text-on-surface-variant'}`}><Box size={12}/> Categoría</button>
      </div>

      {/* Listado índices */}
      <AltheaCard className="p-3">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
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
          {(muscles.length===0 && tab==='muscle') && <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Cargando...</span>}
        </div>
      </AltheaCard>

      {/* Buscador + filtros avanzados */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3.5 text-on-surface-variant"/>
        <AltheaInput placeholder={`Filtrar en ${selectedKey==='__all__' ? 'todos' : selectedKey}...`} value={q} onChange={e=>setQ(e.target.value)} className="w-full bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded pl-9 p-3 font-body-md text-sm text-on-surface" />
      </div>
      <AltheaCard className="p-3">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Filtros avanzados · dificultad / patrón movimiento</div>
        <div className="flex gap-2 mt-2">
          <select onChange={e=>{
            const v=e.target.value; const el=document.getElementById('list-ex'); if(!el) {return;}
            // patrón simple: filtra por nombre
          }} className="flex-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            <option value="">Patrón: todos</option><option>push</option><option>pull</option><option>squat</option><option>hinge</option><option>core</option>
          </select>
          <select className="flex-1 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded p-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            <option>Dificultad: todos</option><option>principiante</option><option>intermedio</option><option>avanzado</option>
          </select>
        </div>
        <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant mt-1">Usa ExerciseGym + filtro local. Variantes: al ver detalle, sugiere mismo músculo/equipo.</p>
      </AltheaCard>

      {/* Resultados — solo consulta */}
      <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant">{loading ? 'Cargando ejercicios...' : `${filtered.length} ejercicios para consultar`}</div>

      <div className="grid gap-3">
        {filtered.map(ex=>(
          <div key={ex.id} onClick={()=>setDetail(ex)} className="  rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant overflow-hidden cursor-pointer active:bg-surface-container-low/90">
            <div className="flex gap-3 p-3">
              <div className="w-16 h-16 md:w-20 md:h-20 shrink-0 rounded-lg bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant flex items-center justify-center overflow-hidden">
                {(ex.gifUrl || ex.imageDataUrl) ? <img src={ex.gifUrl || ex.imageDataUrl} alt={ex.name} loading="lazy" onError={e=>{(e.target as HTMLImageElement).style.display='none'}} className="w-full h-full object-cover" /> : <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-[10px] text-center">GIF</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-body-md text-sm text-on-surface font-medium text-sm flex items-center gap-2"><span className="truncate">{ex.name}</span>{ex.origin==='USER_CREATED' ? <AltheaBadge variant="outline" className="text-primary border-primary shrink-0 text-[10px]">Mío</AltheaBadge> : null}</div>
                <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant text-xs">{ex.muscle} · {ex.equipment}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {musclePct(ex).slice(0,3).map(m=> (
                    <span key={m.name} className={`px-1.5 py-0.5 rounded border text-[10px] ${m.role==='Principal'?'bg-primary border-primary text-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant text-on-surface-variant'}`}>{m.name} {m.pct}%</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length===0 && !loading && <p className="font-body-md text-xs text-on-surface-variant text-center py-6">Sin resultados</p>}
      </div>
      </div>

      <div className="lg:col-span-4 space-y-3 hidden lg:block">
      <button onClick={()=>{ setEditing(null); setShowForm(true) }} className="w-full py-3 rounded bg-primary text-on-surface font-medium">+ Agregar ejercicio</button>
      <AltheaCard className="p-3">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant font-medium">Filtros</div>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant mt-1">{filtered.length} de {exercises.length} ejercicios</div>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant">{tab}: {selectedKey==='__all__' ? 'Todos' : selectedKey}</div>
      </AltheaCard>
      <AltheaCard className="p-3">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant font-medium">Índice</div>
        <div className="flex gap-2 overflow-x-auto pb-1 mt-2">
          <Chip active={selectedKey==='__all__'} onClick={()=>load(tab, '__all__')}>{`Todos (${exercises.length || '…'})`}</Chip>
          {tab==='muscle' && muscles.map(m=> <Chip key={m.muscle} active={selectedKey===m.muscle} onClick={()=>load('muscle', m.muscle)}>{`${m.muscle} (${m.count})`}</Chip>)}
          {tab==='equipment' && equipment.map(e=> <Chip key={e.equipment} active={selectedKey===e.equipment} onClick={()=>load('equipment', e.equipment)}>{`${e.equipment} (${e.count})`}</Chip>)}
          {tab==='bodypart' && bodyparts.map(b=> <Chip key={b.bodyPart} active={selectedKey===b.bodyPart} onClick={()=>load('bodypart', b.bodyPart)}>{`${b.bodyPart} (${b.count})`}</Chip>)}
          {tab==='category' && categories.map(c=> <Chip key={c.category} active={selectedKey===c.category} onClick={()=>load('category', c.category)}>{`${c.category} (${c.count})`}</Chip>)}
        </div>
      </AltheaCard>
      </div>

      </div>

      {/* Detalle solo informativo */}
      {detail && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={()=>setDetail(null)}>
          <div onClick={e=>e.stopPropagation()} className="bg-surface-container-low/90 backdrop-blur-md border-t border-outline-variant rounded-t-2xl w-full max-w-lg lg:max-w-2xl max-h-[85vh] overflow-auto">
            <div className="relative w-full bg-black/40 border-b border-outline-variant flex items-center justify-center min-h-[240px] p-2">
              <span className="absolute font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">GIF no disponible</span>
              {(detail.gifUrl || detail.imageDataUrl) ? <img src={detail.gifUrl || detail.imageDataUrl} alt={detail.name} onError={e=>{(e.target as HTMLImageElement).style.display='none'}} className="relative max-w-full w-auto h-auto max-h-[55vh] object-contain" /> : null}
            </div>
            <div className="p-4 space-y-3">
              <h2 className="font-headline-lg text-base font-semibold text-on-surface">{detail.name}</h2>
              <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant">{detail.muscle} · {detail.bodyPart} · {detail.equipment} · {detail.category}</p>
              <AltheaCard className="p-3">
                <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Músculos trabajados</div>
                <div className="mt-2 space-y-2">
                  {musclePct(detail).map(m=>(
                    <div key={m.name} className="flex items-center gap-2">
                      <span className="flex-1 font-body-md text-sm text-on-surface">{m.name} <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant">· {m.role}</span></span>
                      <span className="font-body-md text-sm text-on-surface font-medium">{m.pct}%</span>
                      <div className="w-20 h-2 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-full overflow-hidden"><div className={`h-full ${m.role==='Principal'?'bg-primary':'bg-primary'}`} style={{width:`${m.pct}%`}}/></div>
                    </div>
                  ))}
                </div>
                <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant mt-2">Principal ~70% · Secundarios comparten ~30% (estimado orientativo).</p>
              </AltheaCard>
              <AltheaCard className="p-3">
                <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Cómo hacerlo</div>
                <ol className="list-decimal list-inside font-body-md text-sm text-on-surface space-y-1 mt-1">{detail.instructions.map((s,i)=><li key={i}>{s}</li>)}</ol>
              </AltheaCard>
              {detail.origin==='USER_CREATED' ? (
                <div className="flex gap-2">
                  <button onClick={()=>{ setEditing(detail as CustomExercise) }} className="flex-1 py-3 rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant font-body-md text-sm text-on-surface">Editar</button>
                  <button onClick={()=>handleDeleteCustom(detail)} className="flex-1 py-3 rounded bg-surface-container-low/90 backdrop-blur-sm border border-danger/50 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Eliminar</button>
                </div>
              ) : null}
              <button onClick={()=>setDetail(null)} className="w-full py-3 rounded bg-primary text-on-surface">Cerrar</button>
              <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-on-surface-variant text-center">Solo informativo — sin copiar. Usá Rutina para agregar con selector inteligente.</p>
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
