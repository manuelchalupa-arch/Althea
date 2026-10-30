import { useEffect, useState } from 'react'
import { db } from '@/services/storage/db'
import { MUSCLE_LIBRARY_GROUPS } from '@/data/muscleLibraryConfig'
import * as Gym from '@/services/exerciseGym'
import { effectiveBreakdown, listCustomExercises } from '@/services/training/customExercises'
import { exerciseMatches } from '@/services/training/exerciseSearch'
import { traditionalForGroup, CUSTOM_FORM_MUSCLES, CUSTOM_FORM_EQUIPMENT, CUSTOM_FORM_CATEGORIES, type TraditionalGroupId } from '@/data/traditionalCatalog'
import BibliotecaCustomForm from './BibliotecaCustomForm'
import type { CustomExercise } from '@/services/training/customExercises'
import { Search, Heart, Globe, WifiOff } from 'lucide-react'
import { AltheaCard, AltheaBadge, AltheaInput, AltheaEmpty, AltheaLoading } from '@/components/althea'
import { exercisePurpose, EXERCISE_PURPOSES, type ExercisePurpose } from '@/utils/stretching'
import { listSharedExercises } from '@/services/training/sharedExercises'

const PURPOSES = EXERCISE_PURPOSES
export default function Biblioteca(){
  const [selectedKey,setSelectedKey]=useState<string>('__all__')
  const [exercises,setExercises]=useState<Gym.Exercise[]>([])
  const [tradIds,setTradIds]=useState<Set<string>>(new Set())
  const [q,setQ]=useState('')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [detail,setDetail]=useState<Gym.Exercise|null>(null)
  const [showForm,setShowForm]=useState(false)
  const [editing,setEditing]=useState<CustomExercise|null>(null)
  const [favs,setFavs]=useState<string[]>([])
  const [onlyFavs,setOnlyFavs]=useState(false)
  const [purpose,setPurpose]=useState<ExercisePurpose>('conventional')
  const [showAll,setShowAll]=useState(false)
  // grupo muscular de cada id curado (el catálogo externo no lo trae)
  const [groupById,setGroupById]=useState<Record<string,TraditionalGroupId>>({})
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true

  useEffect(()=>{
    db.userProfile.get('me')
      .then(p => setFavs((p as { favoriteExercises?: string[] } | null)?.favoriteExercises || []))
      .catch(()=>{})
  },[])

  const toggleFav = async (id: string) => {
    const next = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id]
    setFavs(next)
    try {
      const p = await db.userProfile.get('me')
      if (p) { await db.userProfile.update('me', { favoriteExercises: next } as never) }
    } catch { /* noop */ }
  }

  const musclePct = (ex: Gym.Exercise)=> effectiveBreakdown(ex)

  // Síntesis: ejercicios curados + los propios del usuario, separados por finalidad.
  const load = async (group: string, allMode: boolean = showAll, p: ExercisePurpose = purpose)=>{
    setSelectedKey(group); setLoading(true); setError(null)
    const cacheKey = `trad:${p}:${group}${allMode ? ':all' : ''}`
    try{
      const all = await Gym.fetchAll()
      const catalog = all.exercises || []
      const curated = traditionalForGroup(catalog, '__all__')
      setGroupById(Object.fromEntries(curated.map(t => [t.exercise.id, t.group])) as Record<string,TraditionalGroupId>)
      let tradEx: Gym.Exercise[] = []
      if (p === 'conventional' && !allMode) {
        // Biblioteca curada por grupo: solo fuerza/hipertrofia/cardio.
        tradEx = curated
          .filter(t => (t.purpose ?? 'conventional') === 'conventional' && (group === '__all__' || t.group === group))
          .map(t => t.exercise)
      } else {
        // Categoría de finalidad: catálogo completo + curados de esa finalidad.
        const seen = new Set<string>()
        const add = (e: Gym.Exercise) => { if (!seen.has(e.id)) { seen.add(e.id); tradEx.push(e) } }
        catalog.filter(e => exercisePurpose(e) === p).forEach(add)
        curated.filter(t => (t.purpose ?? 'conventional') === p).forEach(t => add(t.exercise))
      }
      const customs = (await listCustomExercises(undefined, undefined).catch(()=>[]))
        .filter(e => exercisePurpose(e as unknown as { category?: string; exerciseObjective?: string }) === p)
      const shared = (await listSharedExercises().catch(()=>[]))
        .filter((e:any) => exercisePurpose(e as unknown as { category?: string; exerciseObjective?: string }) === p)
      setTradIds(new Set(tradEx.map(e => e.id)))
      const seenAll = new Set<string>()
      const merged: Gym.Exercise[] = []
      const pushAll = (arr: any[]) => {
        for (const e of arr) {
          if (!e?.id || seenAll.has(e.id)) {continue}
          seenAll.add(e.id)
          merged.push(e as Gym.Exercise)
        }
      }
      pushAll(tradEx)
      pushAll(customs)
      pushAll(shared)
      setExercises(merged)
      Gym.cacheSet(cacheKey, merged)
    }catch(e:any){
      const cached = Gym.cacheGet(cacheKey)
      if(cached){ setExercises(cached); setError('Mostrando caché offline (sin conexión).') }
      else {setError(e.message || 'Error al cargar')}
    }finally{ setLoading(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{ load('__all__', false, 'conventional') },[])

  const BODY_PART_GROUP: Record<string, TraditionalGroupId> = {
    legs: 'piernas', chest: 'pecho', back: 'espalda', core: 'core',
    shoulders: 'hombros-y-brazos', arms: 'hombros-y-brazos',
  }
  const groupOf = (ex: Gym.Exercise) =>
    groupById[ex.id] ?? BODY_PART_GROUP[ex.bodyPart] ?? '__all__'

  const filtered = exercises.filter(ex=>{
    // La finalidad manda: nunca se mezclan categorías.
    if (exercisePurpose(ex) !== purpose) {return false}
    if (selectedKey !== '__all__' && groupOf(ex) !== selectedKey) {return false}
    if(onlyFavs && !favs.includes(ex.id)) {return false}
    if(!q) {return true;}
    return exerciseMatches(ex, q)
  })

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
    load(selectedKey)
  }

  return (
    <div className="min-h-screen bg-transparent px-0 pt-2 pb-24 md:px-6 md:pt-6 md:pb-6 lg:px-8 lg:pt-8 lg:pb-8 sm:px-5 xl:px-10 2xl:px-12 w-full mx-auto space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-headline-lg text-lg font-semibold text-on-surface">Biblioteca</h1>
        <div className="flex items-center gap-2">
          <AltheaBadge variant="outline"><Globe size={12}/> {exercises.length || '…'} ejercicios</AltheaBadge>
          <button
            type="button"
            onClick={()=>{ setEditing(null); setShowForm(true) }}
            aria-label="Agregar ejercicio"
            className="shrink-0 px-3 min-h-[36px] rounded bg-primary text-on-primary text-sm font-medium"
          >
            + Agregar
          </button>
        </div>
      </div>
      <section aria-label="Grupos musculares" className="space-y-3">
        <h2 className="text-sm font-semibold text-on-surface">
          Elegí un grupo muscular
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          {MUSCLE_LIBRARY_GROUPS.map(group => (
            <button
              key={group.id}
              type="button"
              aria-pressed={selectedKey === group.id}
              onClick={() => void load(group.id, showAll, purpose)}
              className={[
                'min-h-24 rounded-xl border p-3 text-left',
                'transition-colors',
                selectedKey === group.id ? 'border-accent bg-accent/10' : 'border-outline-variant bg-surface-container',
              ].join(' ')}
            >
              {/* El botón se pinta oscuro por la regla global de botones: el
                  texto hereda ese color claro (text-on-surface quedaba negro
                  sobre negro y el título era invisible). */}
              <span className="block text-sm font-semibold text-inherit">
                {group.label}
              </span>
              <span className="mt-1 block text-xs text-inherit opacity-80">
                {group.description}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={selectedKey === '__all__'}
          onClick={() => void load('__all__', showAll, purpose)}
          className={`w-full py-3 min-h-[48px] rounded-xl border font-label-md text-[10px] font-semibold uppercase tracking-widest transition-colors ${selectedKey === '__all__' ? 'bg-primary text-on-surface border-primary' : 'bg-surface-container border-outline-variant text-on-surface-variant'}`}
        >
          Todos los grupos
        </button>
      </section>
      <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Síntesis de ejercicios tradicionales · sin variantes.</p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-3">
      {!online && <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-secondary bg-secondary/10 border border-secondary/40 rounded-lg p-2 flex items-center gap-2"><WifiOff size={14}/> Sin conexión — se muestra caché.</div>}
      {error && <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-error bg-error/10 border border-error/40 rounded-lg p-2">{error}</div>}

      {/* Separador */}
      <div className="h-px bg-outline-variant/40 my-2" />

      {/* Finalidad: la categoría filtra los ejercicios; los grupos musculares
          siguen todos visibles arriba. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label="Finalidad del ejercicio">
        {PURPOSES.map(p => (
          <button
            key={p.id}
            type="button"
            aria-pressed={purpose === p.id}
            onClick={() => {
              setPurpose(p.id); setShowAll(false); setOnlyFavs(false); setQ('')
              void load('__all__', false, p.id)
            }}
            className={`py-2.5 min-h-[48px] rounded-lg border font-label-md text-[11px] font-semibold uppercase tracking-widest transition-colors ${purpose === p.id ? 'bg-primary text-on-surface border-primary' : 'bg-surface-container-low/90 border-outline-variant text-on-surface-variant hover:border-primary/50'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Botón: todos los ejercicios de la finalidad elegida */}
      <button
        onClick={() => {
          const next = !showAll
          setShowAll(next)
          setOnlyFavs(false); setQ('')
          load('__all__', next, purpose)
        }}
        className={`w-full py-2.5 rounded-lg font-label-md text-[11px] font-semibold uppercase tracking-widest border flex items-center justify-center gap-2 min-h-[48px] transition-colors ${showAll ? 'bg-primary text-on-surface border-primary' : 'bg-surface-container-low/90 border-outline-variant text-on-surface-variant hover:border-primary/50'}`}
      >
        📋 {showAll ? `Mostrando todos (${exercises.length})` : 'Todos los ejercicios'}
      </button>

      {/* Separador */}
      <div className="h-px bg-outline-variant/40 my-2" />

      {/* Favoritos */}
      <div className="flex gap-2">
        <button onClick={()=>setOnlyFavs(v=>!v)} aria-pressed={onlyFavs} className={`flex-1 py-2 rounded-lg font-label-md text-[10px] font-semibold uppercase tracking-widest border flex items-center justify-center gap-1 min-h-[48px] ${onlyFavs ? 'bg-primary text-on-surface border-primary' : 'bg-surface-container-low/90 border-outline-variant text-on-surface-variant'}`}>
          <Heart size={12}/> Favoritos ({favs.length})
        </button>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3.5 text-on-surface-variant"/>
        <AltheaInput placeholder={`Filtrar en ${selectedKey==='__all__' ? 'todos' : selectedKey}...`} value={q} onChange={e=>setQ(e.target.value)} className="w-full bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded pl-9 p-3 font-body-md text-sm text-on-surface" />
      </div>

      {/* Resultados — solo consulta */}
      <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{loading ? 'Cargando ejercicios...' : `${filtered.length} ejercicios para consultar`}</div>

      <div className="grid gap-3">
        {loading && exercises.length===0 && <AltheaLoading lines={4} />}
        {filtered.map(ex=>(
          <div key={ex.id} onClick={()=>setDetail(ex)} className="rounded-xl border border-outline-variant/40 bg-surface-container p-3 sm:p-4 shadow-al-sm min-w-0 cursor-pointer active:bg-surface-container-low/50 transition-colors">
            <div className="flex gap-3 p-3">
              <div className="w-16 h-16 md:w-20 md:h-20 shrink-0 rounded-xl bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant flex items-center justify-center overflow-hidden relative">
                {(ex.gifUrl || ex.imageDataUrl) ? <img src={ex.gifUrl || ex.imageDataUrl} alt={ex.name} loading="lazy" onError={e=>{(e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).parentElement?.querySelector('.gif-fallback')?.classList.remove('hidden')}} className="w-full h-full object-contain" /> : <span className="font-label-md text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant text-center">Sin GIF</span>}
<span className="gif-fallback hidden absolute inset-0 flex items-center justify-center font-label-md text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant text-center">Sin GIF</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-body-md text-base text-on-surface font-medium flex items-center gap-2 flex-wrap">
                  <span className="truncate">{ex.name}</span>
                  {tradIds.has(ex.id) ? <AltheaBadge variant="outline" className="text-primary border-primary shrink-0 text-[11px]">Tradicional</AltheaBadge> : null}
                  {ex.origin==='USER_CREATED' ? <AltheaBadge variant="outline" className="text-primary border-primary shrink-0 text-[11px]">Mío</AltheaBadge> : null}
                </div>
                <div className="font-label-md text-[12px] font-semibold uppercase tracking-widest text-on-surface-variant">{ex.muscle} · {ex.equipment}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {musclePct(ex).slice(0,3).map(m=> (
                    <span key={m.name} className={`px-2 py-1 rounded border text-[11px] ${m.role==='Principal'?'bg-primary border-primary text-primary':'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant text-on-surface-variant'}`}>{m.name} {m.pct}%</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length===0 && !loading && <AltheaEmpty icon="search_off" title="Sin resultados" description="Probá otro grupo muscular o término de búsqueda." />}
      </div>
      </div>

      <div className="lg:col-span-4 space-y-3 hidden lg:block">
      <button onClick={()=>{ setEditing(null); setShowForm(true) }} className="w-full py-3 rounded bg-primary text-on-surface font-medium min-h-[48px]">+ Agregar ejercicio</button>
      <AltheaCard className="p-3">
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant font-medium">Síntesis</div>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">{filtered.length} de {exercises.length} ejercicios</div>
        <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-0.5">{selectedKey==='__all__' ? 'Todos los grupos' : selectedKey}</div>
        <div className="font-body-md text-[12px] text-on-surface-variant mt-2">Solo ejercicios tradicionales por grupo. Las variantes no se listan.</div>
      </AltheaCard>
      </div>

      </div>

      {/* Detalle solo informativo */}
      {detail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 althea-modal" onClick={()=>setDetail(null)}>
          <div onClick={e=>e.stopPropagation()} className="bg-surface-container-low/90 backdrop-blur-md border-t border-outline-variant rounded-t-2xl w-full max-w-lg lg:max-w-2xl max-h-[85vh] overflow-auto">
            <div className="relative w-full bg-black/40 border-b border-outline-variant flex items-center justify-center min-h-[240px] p-2">
              <span className="absolute font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">GIF no disponible</span>
              {(detail.gifUrl || detail.imageDataUrl) ? <img src={detail.gifUrl || detail.imageDataUrl} alt={detail.name} onError={e=>{(e.target as HTMLImageElement).style.display='none'}} className="relative max-w-full w-auto h-auto max-h-[55vh] object-contain" /> : null}
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-headline-lg text-base font-semibold text-on-surface flex-1">{detail.name}</h2>
                <button onClick={()=>toggleFav(detail.id)} aria-pressed={favs.includes(detail.id)} aria-label="Marcar favorito" className={`no-check p-2.5 rounded-lg border min-w-[44px] min-h-[44px] flex items-center justify-center ${favs.includes(detail.id) ? 'bg-primary/20 border-primary text-primary' : 'bg-surface border-outline-variant text-on-surface-variant'}`}>
                  <Heart size={18} fill={favs.includes(detail.id) ? 'currentColor' : 'none'} />
                </button>
              </div>
              <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{detail.muscle} · {detail.bodyPart} · {detail.equipment} · {detail.category}</p>
              <AltheaCard className="p-3">
                <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Músculos trabajados</div>
                <div className="mt-2 space-y-2">
                  {musclePct(detail).map(m=>(
                    <div key={m.name} className="flex items-center gap-2">
                      <span className="flex-1 font-body-md text-sm text-on-surface">{m.name} <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">· {m.role}</span></span>
                      <span className="font-body-md text-sm text-on-surface font-medium">{m.pct}%</span>
                      <div className="w-20 h-2 bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-full overflow-hidden"><div className={`h-full ${m.role==='Principal'?'bg-primary':'bg-primary'}`} style={{width:`${m.pct}%`}}/></div>
                    </div>
                  ))}
                </div>
                <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-2">Principal ~70% · Secundarios comparten ~30% (estimado orientativo).</p>
              </AltheaCard>
              <AltheaCard className="p-3">
                <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Cómo hacerlo</div>
                <ol className="list-decimal list-inside font-body-md text-sm text-on-surface space-y-1 mt-1">{detail.instructions.map((s,i)=><li key={i}>{s}</li>)}</ol>
              </AltheaCard>
              {detail.origin==='USER_CREATED' ? (
                <div className="flex gap-2">
                  <button onClick={()=>{ setEditing(detail as CustomExercise) }} className="flex-1 py-3 rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant font-body-md text-sm text-on-surface">Editar</button>
                  <button onClick={()=>handleDeleteCustom(detail)} className="flex-1 py-3 rounded bg-surface-container-low/90 backdrop-blur-sm border border-error/50 font-label-md text-[10px] font-semibold uppercase tracking-widest text-error">Eliminar</button>
                </div>
              ) : null}
              <button onClick={()=>setDetail(null)} className="w-full py-3 rounded bg-primary text-on-surface min-h-[48px]">Cerrar</button>
              <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-center">Solo informativo — sin copiar. Usá Rutina para agregar con selector inteligente.</p>
            </div>
          </div>
        </div>
      )}
      {showForm && (
        <BibliotecaCustomForm
          initial={editing}
          muscles={CUSTOM_FORM_MUSCLES}
          equipment={CUSTOM_FORM_EQUIPMENT}
          categories={CUSTOM_FORM_CATEGORIES}
          onSaved={()=>{ setShowForm(false); setEditing(null); setDetail(null); load(selectedKey) }}
          onClose={()=>{ setShowForm(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
