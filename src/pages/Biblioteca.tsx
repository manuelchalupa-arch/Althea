import { useEffect, useState } from 'react'
import { db } from '@/services/storage/db'
import { MUSCLE_LIBRARY_GROUPS } from '@/data/muscleLibraryConfig'
import * as Gym from '@/services/exerciseGym'
import { effectiveBreakdown, listCustomExercises } from '@/services/training/customExercises'
import { exerciseMatches } from '@/services/training/exerciseSearch'
import { traditionalForGroup, TRADITIONAL_GROUPS, CUSTOM_FORM_MUSCLES, CUSTOM_FORM_EQUIPMENT, CUSTOM_FORM_CATEGORIES, type TraditionalGroupId } from '@/data/traditionalCatalog'
import BibliotecaCustomForm from './BibliotecaCustomForm'
import type { CustomExercise } from '@/services/training/customExercises'
import { Search, Heart, Globe, WifiOff } from 'lucide-react'
import { AltheaCard, AltheaBadge, AltheaInput, AltheaEmpty, AltheaLoading } from '@/components/althea'
import { isStretchingExercise } from '@/utils/stretching'

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
  const [onlyStretch,setOnlyStretch]=useState(false)
  const [stretchMode,setStretchMode]=useState(false)
  const [showAll,setShowAll]=useState(false)
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

  // Síntesis: solo ejercicios tradicionales (lista curada) + los propios del usuario.
  const load = async (group: string, allMode: boolean = showAll)=>{
    setSelectedKey(group); setLoading(true); setError(null)
    const cacheKey = `trad:${group}${allMode ? ':all' : ''}`
    try{
      const all = await Gym.fetchAll()
      let tradEx: Gym.Exercise[] = []
      if (allMode) {
        // Mostrar toda la biblioteca externa (1323+) + curados
        tradEx = (all.exercises || []).slice()
      } else {
        const trad = traditionalForGroup(all.exercises || [], (group as TraditionalGroupId | '__all__'))
        tradEx = trad.map(t => t.exercise)
      }
      const customs = await listCustomExercises(undefined, undefined).catch(()=>[])
      setTradIds(new Set(tradEx.map(e => e.id)))
      setExercises([...tradEx, ...customs])
      Gym.cacheSet(cacheKey, [...tradEx, ...customs])
    }catch(e:any){
      const cached = Gym.cacheGet(cacheKey)
      if(cached){ setExercises(cached); setError('Mostrando caché offline (sin conexión).') }
      else {setError(e.message || 'Error al cargar')}
    }finally{ setLoading(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{ load('__all__') },[])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{ if (stretchMode) { load('__all__', showAll) } },[stretchMode])

  const filtered = exercises.filter(ex=>{
    const isStr = isStretchingExercise(ex as unknown as { pattern?: string; tags?: string[] })
    if (stretchMode && !isStr) {return false}
    if (stretchMode && selectedKey !== '__all__') {
      // filtrar por grupo muscular dentro de estiramientos
      const g = (ex as unknown as { group?: string }).group
      if (g !== selectedKey) {return false}
    }
    if(!stretchMode && onlyStretch && !isStr) {return false}
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
      <div className="flex items-center justify-between">
        <h1 className="font-headline-lg text-lg font-semibold text-on-surface">Biblioteca</h1>
        <AltheaBadge variant="outline"><Globe size={12}/> {exercises.length || '…'} ejercicios</AltheaBadge>
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
              onClick={() => void load(group.id)}
              className={[
                'min-h-24 rounded-xl border p-3 text-left',
                'transition-colors',
                selectedKey === group.id ? 'border-accent bg-accent/10' : 'border-outline-variant bg-surface-container',
              ].join(' ')}
            >
              <span className="block text-sm font-semibold text-on-surface">
                {group.label}
              </span>
              <span className="mt-1 block text-xs text-on-surface-variant">
                {group.description}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={selectedKey === '__all__'}
          onClick={() => void load('__all__')}
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

      {/* Botón: todos los ejercicios (biblioteca completa) */}
      <button
        onClick={() => {
          const next = !showAll
          setShowAll(next)
          setStretchMode(false); setOnlyFavs(false); setOnlyStretch(false); setQ('')
          load('__all__', next)
        }}
        className={`w-full py-2.5 rounded-lg font-label-md text-[11px] font-semibold uppercase tracking-widest border flex items-center justify-center gap-2 min-h-[48px] transition-colors ${showAll ? 'bg-primary text-on-surface border-primary' : 'bg-surface-container-low/90 border-outline-variant text-on-surface-variant hover:border-primary/50'}`}
      >
        📋 {showAll ? `Mostrando todos (${exercises.length})` : 'Todos los ejercicios'}
      </button>

      {/* Separador */}
      <div className="h-px bg-outline-variant/40 my-2" />

      {/* Botón: biblioteca de estiramientos */}
      <button
        onClick={() => {
          const next = !stretchMode
          setStretchMode(next)
          setShowAll(false); setOnlyFavs(false); setOnlyStretch(false); setQ('')
          if (next) { load('__all__', false) }
        }}
        aria-pressed={stretchMode}
        className={`w-full py-2.5 rounded-lg font-label-md text-[11px] font-semibold uppercase tracking-widest border flex items-center justify-center gap-2 min-h-[48px] transition-colors ${stretchMode ? 'bg-[var(--althea-stretch)] text-on-surface border-[var(--althea-stretch)]' : 'bg-surface-container-low/90 border-outline-variant text-on-surface-variant hover:border-[var(--althea-stretch)]/50'}`}
      >
        🧘 {stretchMode ? 'Viendo estiramientos' : 'Ejercicios de estiramiento'}
      </button>

      {/* Checkboxes de grupos musculares para filtrar estiramientos */}
      {stretchMode && (
        <div className="rounded-xl border border-[var(--althea-stretch)]/30 bg-[var(--althea-stretch)]/5 p-3 space-y-2">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-[var(--althea-stretch)]">Filtrar estiramientos por grupo muscular</div>
          <div className="grid grid-cols-2 gap-2">
            {TRADITIONAL_GROUPS.map((g) => (
              <label key={g.id} className="flex items-center gap-2 text-[12px] text-on-surface cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedKey === g.id}
                  onChange={(e) => {
                    if (e.target.checked) {
                      load(g.id, false)
                    } else {
                      load('__all__', false)
                    }
                  }}
                  className="w-4 h-4 accent-[var(--althea-stretch)]"
                />
                <span>{g.label}</span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-on-surface-variant">Tildá un grupo para filtrar; destildalo para ver todos los estiramientos.</p>
        </div>
      )}

      {/* Favoritos */}
      <div className="flex gap-2">
        <button onClick={()=>setOnlyFavs(v=>!v)} aria-pressed={onlyFavs} className={`flex-1 py-2 rounded-lg font-label-md text-[10px] font-semibold uppercase tracking-widest border flex items-center justify-center gap-1 min-h-[48px] ${onlyFavs ? 'bg-primary text-on-surface border-primary' : 'bg-surface-container-low/90 border-outline-variant text-on-surface-variant'}`}>
          <Heart size={12}/> Favoritos ({favs.length})
        </button>
        <button onClick={()=>setOnlyStretch(v=>!v)} aria-pressed={onlyStretch} className={`flex-1 py-2 rounded-lg font-label-md text-[10px] font-semibold uppercase tracking-widest border flex items-center justify-center gap-1 min-h-[48px] ${onlyStretch ? 'bg-[var(--althea-stretch)] text-on-surface border-[var(--althea-stretch)]' : 'bg-surface-container-low/90 border-outline-variant text-on-surface-variant'}`}>
          🧘 Estiramientos
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
