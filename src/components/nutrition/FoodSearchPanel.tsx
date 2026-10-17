import { useCallback, useEffect, useRef, useState } from 'react'
import SemanticIcon from '@/components/ui/SemanticIcon'
import { AltheaButton } from '@/components/althea'
import { searchFoodsLocal, searchExternalFoodsDetailed, type FoodSearchResult } from '@/services/nutrition/foodSearch'
import { loadUsdaFoods, usdaMeta } from '@/services/nutrition/usdaFoods'
import { CustomFoodForm } from './CustomFoodForm'

// Búsqueda de alimentos para armar una comida a mano.
// Orden: personalizados → catálogo/recetas → USDA → (a pedido) en línea → alta manual.
// Cada resultado se agrega con la cantidad indicada; la cantidad es explícita.

const SOURCE_LABEL: Record<FoodSearchResult['source'], string> = {
  custom: 'Personalizado',
  catalog: 'Catálogo',
  recipe: 'Receta',
  usda: 'USDA',
  external: 'En línea',
}

function extrasLine(r: FoodSearchResult): string | null {
  const bits: string[] = []
  const e = r.extras
  if (e?.fiber !== undefined) { bits.push(`fibra ${e.fiber}g`) }
  if (e?.sugars !== undefined) { bits.push(`azúcares ${e.sugars}g`) }
  if (e?.saturatedFat !== undefined) { bits.push(`saturadas ${e.saturatedFat}g`) }
  if (e?.sodium !== undefined) { bits.push(`sodio ${Math.round(e.sodium)}mg`) }
  return bits.length ? bits.join(' · ') : null
}

interface Props {
  onPick: (result: FoodSearchResult, grams: number) => void
  /** nombre precargado para el alta manual (por ejemplo, el texto no reconocido) */
  suggestedName?: string
}

export function FoodSearchPanel({ onPick, suggestedName }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodSearchResult[]>([])
  const [gramsBy, setGramsBy] = useState<Record<string, string>>({})
  const [searching, setSearching] = useState(false)
  const [externalBusy, setExternalBusy] = useState(false)
  const [externalMsg, setExternalMsg] = useState<string | null>(null)
  const [dbReady, setDbReady] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const debounceRef = useRef<number | null>(null)

  // Carga diferida del catálogo USDA (≈5 MB) al abrir la búsqueda. No bloquea la
  // pantalla: cuando termina, si hay una consulta activa, se vuelve a buscar.
  useEffect(() => {
    let alive = true
    void loadUsdaFoods().then(() => { if (alive) { setDbReady(true) } })
    return () => { alive = false }
  }, [])

  const runLocal = useCallback(async (q: string) => {
    setSearching(true)
    try {
      setResults(await searchFoodsLocal(q))
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) { window.clearTimeout(debounceRef.current) }
    const q = query.trim()
    if (!q) { setResults([]); return }
    debounceRef.current = window.setTimeout(() => { void runLocal(q) }, 200)
    return () => { if (debounceRef.current) { window.clearTimeout(debounceRef.current) } }
    // `dbReady` en las deps: al terminar la carga de USDA se repite la búsqueda.
  }, [query, runLocal, dbReady])

  const searchOnline = async () => {
    const q = query.trim()
    if (!q) { return }
    setExternalBusy(true)
    setExternalMsg(null)
    try {
      const outcome = await searchExternalFoodsDetailed(q)
      if (outcome.status === 'ok') {
        setResults(prev => {
          const seen = new Set(prev.map(r => r.id))
          return [...prev, ...outcome.results.filter(r => !seen.has(r.id))]
        })
      } else if (outcome.status === 'empty') {
        setExternalMsg('La búsqueda en línea no encontró resultados para ese texto.')
      } else {
        setExternalMsg(outcome.message ?? 'No se pudo consultar la búsqueda en línea. Podés crear el alimento manualmente.')
      }
    } finally {
      setExternalBusy(false)
    }
  }

  const pick = (r: FoodSearchResult) => {
    const raw = gramsBy[r.id]
    const n = raw !== undefined && raw.trim() !== '' ? Number(raw.replace(',', '.')) : NaN
    const grams = Number.isFinite(n) && n > 0 ? n : r.standardGrams
    onPick(r, grams)
  }

  const meta = usdaMeta()

  return (
    <div className="space-y-3" data-testid="food-search">
      <div className="space-y-1">
        <label htmlFor="food-search-input" className="text-aux">Agregar un alimento</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="food-search-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Yogur de coco, avena, pechuga de pollo…"
            aria-label="Buscar alimento"
            className="input flex-1 min-h-[44px]"
          />
          <AltheaButton variant="secondary" size="sm" onClick={searchOnline} loading={externalBusy} data-testid="food-search-online">
            Buscar en línea
          </AltheaButton>
        </div>
      </div>

      {searching && (
        <div className="font-body-sm text-xs text-on-surface-variant" data-testid="food-search-searching">
          Buscando…
        </div>
      )}

      {externalMsg && (
        <div role="status" className="font-body-sm text-xs text-tertiary" data-testid="food-search-external-msg">
          {externalMsg}
        </div>
      )}

      {!searching && results.length === 0 && query.trim() !== '' && (
        <div className="font-body-sm text-xs text-on-surface-variant" data-testid="food-search-empty">
          Sin resultados. Probá “Buscar en línea” o creá el alimento manualmente.
        </div>
      )}

      {results.length > 0 && (
        <ul className="space-y-1.5" data-testid="food-search-results">
          {results.map(r => {
            return (
              <li key={r.id} data-testid={`food-result-${r.id}`} data-source={r.source}
                className="p-2 rounded-lg border border-outline-variant/40 bg-surface-container/40 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-body-md text-sm text-on-surface font-medium truncate">{r.label}</div>
                    <div className="font-body-sm text-[10px] text-on-surface-variant">
                      {SOURCE_LABEL[r.source]} · {Math.round(r.per100.calories)} kcal/100{r.unit}
                      {r.state ? ` · ${r.state}` : ''}
                    </div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={gramsBy[r.id] ?? ''}
                    placeholder={String(r.standardGrams)}
                    onChange={e => setGramsBy(prev => ({ ...prev, [r.id]: e.target.value }))}
                    aria-label={`Cantidad en ${r.unit} de ${r.label}`}
                    className="input w-[80px] min-h-[44px] text-right font-mono text-sm"
                  />
                  <span className="font-mono text-[10px] text-on-surface-variant">{r.unit}</span>
                  <AltheaButton variant="primary" size="sm" onClick={() => pick(r)} data-testid={`food-add-${r.id}`}>
                    Agregar
                  </AltheaButton>
                </div>
                {extrasLine(r) && (
                  <div className="font-body-sm text-[10px] text-on-surface-variant" data-testid={`food-extras-${r.id}`}>
                    {extrasLine(r)}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          data-testid="food-search-create"
          className="althea-chip text-[11px] inline-flex items-center gap-1"
        >
          <SemanticIcon name="add" size={14} /> Crear alimento manualmente
        </button>
      )}

      {showForm && (
        <CustomFoodForm
          initialName={suggestedName}
          onCancel={() => setShowForm(false)}
          onCreated={food => {
            setShowForm(false)
            setQuery(food.name)
            const standardGrams = food.basis === 'perServing' && food.servingGrams ? food.servingGrams : 100
            onPick(
              {
                id: food.id,
                label: food.name,
                source: 'custom',
                unit: food.unit,
                per100: food.per100,
                standardGrams,
              },
              standardGrams
            )
          }}
        />
      )}

      {meta && (
        <p className="font-body-sm text-[10px] text-on-surface-variant" data-testid="food-search-attribution">
          {meta.count.toLocaleString('es')} alimentos USDA · dominio público (CC0) · {meta.sources.map(s => s.dataType).join(', ')}
        </p>
      )}
    </div>
  )
}

export default FoodSearchPanel
