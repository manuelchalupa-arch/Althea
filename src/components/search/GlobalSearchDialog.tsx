import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Dumbbell, Apple, ClipboardList, ArrowUpRight, LoaderCircle } from 'lucide-react'
import { db } from '@/services/storage/db'
import { addDiaryEntry, nowLocalTime } from '@/services/storage/diaryStore'
import { todayKey } from '@/utils/dates'
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

export default function GlobalSearchDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLElement | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS)
  const [foodRecords, setFoodRecords] = useState<FoodSearchResult[]>([])
  const [foodToLog, setFoodToLog] = useState<FoodSearchResult | null>(null)
  const [foodAmount, setFoodAmount] = useState('100')
  const [foodSaving, setFoodSaving] = useState(false)
  const [foodError, setFoodError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const total = results.exercise.length + results.food.length + results.routine.length
  const term = query.trim()

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') { return }
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable?.length) { return }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const close = () => {
    setQuery('')
    setResults(EMPTY_RESULTS)
    setFoodRecords([])
    setFoodToLog(null)
    setFoodError(null)
    setLoading(false)
    onClose()
  }

  useEffect(() => {
    setFoodToLog(null)
    setFoodError(null)
    if (term.length < 2) {
      setResults(EMPTY_RESULTS)
      setFoodRecords([])
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
            setFoodRecords(foods)
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
  }, [term])

  const sections = useMemo(() => ([
    { kind: 'exercise' as const, title: 'Ejercicios', icon: Dumbbell, items: results.exercise },
    { kind: 'food' as const, title: 'Alimentos', icon: Apple, items: results.food },
    { kind: 'routine' as const, title: 'Rutinas', icon: ClipboardList, items: results.routine },
  ]), [results])

  const openResult = (item: SearchItem) => {
    const destination = item.kind === 'exercise'
      ? `/biblioteca?buscar=${encodeURIComponent(term)}`
      : '/rutina'
    navigate(destination, { state: { globalSearchQuery: term, globalSearchKind: item.kind, globalSearchId: item.id } })
    close()
  }

  const registerFood = async () => {
    if (!foodToLog) { return }
    const amount = Number(foodAmount.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
      setFoodError('Ingresá una cantidad entre 1 y 10.000 g/ml.')
      return
    }
    setFoodSaving(true)
    setFoodError(null)
    try {
      const date = todayKey()
      const factor = amount / 100
      const macros = {
        calories: foodToLog.per100.calories * factor,
        proteins: foodToLog.per100.proteins * factor,
        carbs: foodToLog.per100.carbs * factor,
        fats: foodToLog.per100.fats * factor,
      }
      const addedAt = new Date().toISOString()
      await addDiaryEntry({
        id: `global-food-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        name: foodToLog.label,
        mealType: 'Comida',
        servingLabel: `${amount} ${foodToLog.unit}`,
        amount,
        unit: foodToLog.unit,
        time: nowLocalTime(),
        macros,
        ingredients: [{
          foodId: foodToLog.id,
          label: foodToLog.label,
          grams: amount,
          calories: macros.calories,
          proteins: macros.proteins,
          carbs: macros.carbs,
          fats: macros.fats,
        }],
        addedAt,
      })
      navigate('/nutricion', { state: { globalSearchAddedFood: foodToLog.label } })
      close()
    } catch (error) {
      setFoodError(error instanceof Error ? error.message : 'No se pudo registrar el alimento.')
    } finally {
      setFoodSaving(false)
    }
  }

  return (
    <>
      <div
          className="fixed inset-0 z-[90] flex items-start justify-center bg-black/65 px-3 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] sm:pt-[8vh]"
          onMouseDown={(event) => { if (event.target === event.currentTarget) { close() } }}
        >
          <section
            ref={(node) => { dialogRef.current = node }}
            role="dialog"
            aria-modal="true"
            aria-label="Búsqueda general de Althea"
            onKeyDown={handleDialogKeyDown}
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

              {foodToLog && (
                <section className="rounded-xl border border-outline-variant bg-surface-container p-3 sm:p-4 space-y-3" aria-label="Registrar alimento en nutrición">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-on-surface-variant">Registrar en Nutrición</p>
                    <h2 className="text-base font-semibold text-on-surface break-words">{foodToLog.label}</h2>
                    <p className="text-xs text-on-surface-variant">
                      Por 100 {foodToLog.unit}: {Math.round(foodToLog.per100.calories)} kcal · P {Math.round(foodToLog.per100.proteins)} g · C {Math.round(foodToLog.per100.carbs)} g · G {Math.round(foodToLog.per100.fats)} g
                    </p>
                  </div>
                  <label className="block text-sm text-on-surface" htmlFor="global-food-amount">Cantidad ({foodToLog.unit})</label>
                  <input
                    id="global-food-amount"
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    value={foodAmount}
                    onChange={event => setFoodAmount(event.target.value)}
                    className="w-full min-h-12 rounded-lg border border-outline-variant bg-surface px-3 text-base text-on-surface"
                  />
                  {foodError && <p role="alert" className="text-sm text-error">{foodError}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setFoodToLog(null)} className="min-h-11 rounded-lg border border-outline-variant px-4 text-sm text-on-surface">Volver a resultados</button>
                    <button type="button" onClick={() => { void registerFood() }} disabled={foodSaving} className="min-h-11 flex-1 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary disabled:opacity-50">
                      {foodSaving ? 'Registrando…' : 'Registrar alimento'}
                    </button>
                  </div>
                </section>
              )}
              {!loading && !foodToLog && sections.map((section) => section.items.length > 0 && (
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
                        onClick={() => {
                          if (item.kind === 'food') {
                            const food = foodRecords.find(result => result.id === item.id)
                            if (food) {
                              setFoodToLog(food)
                              setFoodAmount(String(food.standardGrams || 100))
                              setFoodError(null)
                            }
                          } else {
                            openResult(item)
                          }
                        }}
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
    </>
  )
}
