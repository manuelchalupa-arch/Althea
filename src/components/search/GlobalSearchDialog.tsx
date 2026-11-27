import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Dumbbell, Apple, ClipboardList, ArrowUpRight, LoaderCircle } from 'lucide-react'
import { db } from '@/services/storage/db'
import { getAllRoutines } from '@/services/storage/routineStore'
import { exerciseMatches } from '@/services/training/exerciseSearch'
import { searchFoodsLocal, type FoodSearchResult } from '@/services/nutrition/foodSearch'

type SearchKind = 'exercise' | 'food' | 'routine'
type SearchItem = {
  id: string
  name: string
  detail: string
  kind: SearchKind
}
type SearchResults = Record<SearchKind, SearchItem[]>

const EMPTY_RESULTS: SearchResults = { exercise: [], food: [], routine: [] }
const KIND_LABEL: Record<SearchKind, string> = {
  exercise: 'Ejercicio',
  food: 'Alimento',
  routine: 'Rutina',
}

function foodDetail(food: FoodSearchResult): string {
  const macros = food.per100
  return `${food.source === 'recipe' ? 'Receta' : 'Por 100 g'} · ${Math.round(macros.calories)} kcal · ${Math.round(macros.proteins)} g proteína`
}

export default function GlobalSearchDialog() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const total = results.exercise.length + results.food.length + results.routine.length
  const term = query.trim()

  const close = () => {
    setOpen(false)
    setQuery('')
    setResults(EMPTY_RESULTS)
    setLoading(false)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
      } else if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open || term.length < 2) {
      setResults(EMPTY_RESULTS)
      setLoading(false)
      return
    }

    let active = true
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true)
        try {
          const [baseExercises, customExercises, sharedExercises, foods, routines] = await Promise.all([
            db.exercises.toArray().catch(() => []),
            db.customExercises.toArray().catch(() => []),
            db.sharedExercises.toArray().catch(() => []),
            searchFoodsLocal(term, 6).catch(() => []),
            getAllRoutines().catch(() => []),
          ])

          const seen = new Set<string>()
          const exercises = [...baseExercises, ...customExercises, ...sharedExercises]
            .filter((exercise: any) => {
              if (!exercise?.id || seen.has(String(exercise.id))) { return false }
              seen.add(String(exercise.id))
              return exerciseMatches(exercise, term)
            })
            .slice(0, 6)
            .map((exercise: any) => ({
              id: String(exercise.id),
              name: String(exercise.name || 'Ejercicio'),
              detail: [exercise.muscle, exercise.equipment].filter(Boolean).join(' · ') || 'Biblioteca de ejercicios',
              kind: 'exercise' as const,
            }))

          const foodItems = foods.slice(0, 6).map((food) => ({
            id: food.id,
            name: food.label,
            detail: foodDetail(food),
            kind: 'food' as const,
          }))

          const normalized = term.toLocaleLowerCase('es')
          const routineItems = routines
            .filter((routine) => {
              const exerciseText = Object.values(routine.dayExercises || {}).flat()
                .map((exercise: any) => [exercise.name, exercise.muscle].filter(Boolean).join(' '))
                .join(' ')
              const text = `${routine.name} ${routine.description || ''} ${exerciseText}`.toLocaleLowerCase('es')
              return text.includes(normalized)
            })
            .slice(0, 6)
            .map((routine) => ({
              id: routine.id,
              name: routine.name,
              detail: `${Object.keys(routine.dayExercises || {}).length} días · Rutinas guardadas`,
              kind: 'routine' as const,
            }))

          if (active) {
            setResults({ exercise: exercises, food: foodItems, routine: routineItems })
          }
        } catch {
          if (active) { setResults(EMPTY_RESULTS) }
        } finally {
          if (active) { setLoading(false) }
        }
      })()
    }, 180)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [open, term])

  const sections = useMemo(() => ([
    { kind: 'exercise' as const, title: 'Ejercicios', icon: Dumbbell, items: results.exercise, destination: '/biblioteca' },
    { kind: 'food' as const, title: 'Alimentos', icon: Apple, items: results.food, destination: '/nutricion' },
    { kind: 'routine' as const, title: 'Rutinas', icon: ClipboardList, items: results.routine, destination: '/rutina' },
  ]), [results])

  const openResult = (item: SearchItem) => {
    const destination = item.kind === 'exercise' ? '/biblioteca' : item.kind === 'food' ? '/nutricion' : '/rutina'
    navigate(destination, { state: { globalSearchQuery: term, globalSearchKind: item.kind, globalSearchId: item.id } })
    close()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar ejercicios, alimentos y rutinas"
        title="Buscar en Althea (Ctrl+K)"
        aria-keyshortcuts="Control+K Meta+K"
        className="inline-flex items-center justify-center w-11 h-11 rounded-full border border-outline-variant/60 bg-surface text-on-surface-variant hover:border-primary/50 hover:text-on-surface transition-colors shrink-0"
      >
        <Search size={19} aria-hidden="true" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center bg-black/65 px-3 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] sm:pt-[8vh]"
          onMouseDown={(event) => { if (event.target === event.currentTarget) { close() } }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Búsqueda general de Althea"
            className="w-full max-w-2xl max-h-[calc(100dvh-24px)] overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-al-xl flex flex-col"
          >
            <div className="flex items-center gap-2 border-b border-outline-variant/50 p-3 sm:p-4">
              <Search size={20} className="text-primary shrink-0" aria-hidden="true" />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ejercicio, alimento o rutina..."
                aria-label="Buscar ejercicios, alimentos o rutinas"
                className="min-w-0 flex-1 bg-transparent text-base text-on-surface placeholder:text-on-surface-variant outline-none"
              />
              <button type="button" onClick={close} aria-label="Cerrar búsqueda" className="min-w-11 min-h-11 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container">
                <X size={19} />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4">
              {!term && (
                <p className="text-sm text-on-surface-variant">
                  Buscá en un solo lugar los ejercicios de la biblioteca, alimentos del catálogo y tus rutinas guardadas.
                </p>
              )}
              {term.length === 1 && (
                <p className="text-sm text-on-surface-variant">Escribí al menos dos caracteres.</p>
              )}
              {loading && (
                <div className="flex items-center gap-2 py-5 text-sm text-on-surface-variant" role="status">
                  <LoaderCircle size={17} className="animate-spin" /> Buscando en tus catálogos…
                </div>
              )}
              {!loading && term.length >= 2 && total === 0 && (
                <p className="py-5 text-center text-sm text-on-surface-variant">No se encontraron coincidencias locales para «{term}».</p>
              )}
              {!loading && sections.map((section) => section.items.length > 0 && (
                <section key={section.kind} aria-label={section.title}>
                  <div className="flex items-center gap-2 mb-2">
                    <section.icon size={17} className="text-primary" aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-on-surface">{section.title}</h2>
                    <span className="text-xs text-on-surface-variant">{section.items.length}</span>
                  </div>
                  <div className="space-y-1">
                    {section.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openResult(item)}
                        className="w-full min-h-12 flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-left hover:bg-surface-container hover:border-outline-variant/50 focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-on-surface truncate">{item.name}</span>
                          <span className="block text-xs text-on-surface-variant truncate">{item.detail}</span>
                        </span>
                        <span className="text-xs text-primary shrink-0">{KIND_LABEL[item.kind]}</span>
                        <ArrowUpRight size={16} className="text-on-surface-variant shrink-0" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <footer className="border-t border-outline-variant/50 px-3 py-2 text-[11px] text-on-surface-variant sm:px-4">
              Resultados locales · funciona sin conexión · Esc para cerrar
            </footer>
          </section>
        </div>
      )}
    </>
  )
}
