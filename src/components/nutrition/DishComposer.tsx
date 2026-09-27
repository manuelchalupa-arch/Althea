import { useState, type ReactNode } from 'react'
import { AltheaButton } from '@/components/althea'
import {
  interpretMeal,
  mealFromComponents,
  flattenComponents,
  setComponentQuantity,
  resolveComponentOption,
  dropComponent,
  componentQuantityLabel,
  componentTypeLabel,
  type MealInterpretation,
  type MealComponent,
} from '@/services/nutrition/mealInterpretation'
import { ingredientsOf, type DishDraft, type DishIngredient } from '@/services/nutrition/recipeInterpreter'
import type { Macros } from '@/services/nutrition/foodComposition'

// Etiquetas rápidas. NO son obligatorias: el campo de texto acepta cualquier
// nombre libre ("Pre-entrenamiento", "Comida 1", "Colación"...).
const QUICK_LABELS = [
  'Desayuno',
  'Almuerzo',
  'Merienda',
  'Cena',
  'Snack',
  'Pre-entrenamiento',
  'Post-entrenamiento',
  'Colación',
]

export interface DishSavePayload {
  name: string
  mealLabel: string
  ingredients: DishIngredient[]
  totals: Macros
}

export interface DishComposerProps {
  onSave: (payload: DishSavePayload) => void
  onCancel: () => void
  /** borrador a precargar (edición de una comida ya guardada) */
  initial?: DishDraft | null
  /** texto inicial del campo, usado al editar */
  initialText?: string
  /** etiqueta libre de la comida, para no perderla al editar */
  initialMealLabel?: string
  /** true cuando se está editando una comida ya guardada */
  isEditing?: boolean
  saving?: boolean
}

function parseNumber(value: string): number {
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function TotalCell({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="text-center">
      <div className="font-mono text-base font-bold text-on-surface leading-tight">
        {Math.round(value)}
        <span className="text-[10px] font-normal text-on-surface-variant"> {unit}</span>
      </div>
      <div className="font-label-caps text-[9px] uppercase text-on-surface-variant break-words leading-tight">{label}</div>
    </div>
  )
}

function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-label-caps text-[10px] uppercase tracking-wide text-on-surface-variant">{children}</span>
      {hint && <span className="font-body-sm text-[10px] text-on-surface-variant">{hint}</span>}
    </div>
  )
}

/** Fila de componente: cantidad en su propia unidad + opción si hay duda. */
function ComponentRow({
  c,
  ambiguities,
  onQuantity,
  onOption,
  onDrop,
}: {
  c: MealComponent
  ambiguities: MealInterpretation['ambiguities']
  onQuantity: (id: string, value: string) => void
  onOption: (id: string, optionId: string) => void
  onDrop: (id: string) => void
}) {
  const amb = ambiguities.find(a => a.componentId === c.id)
  const typeLabel = amb ? componentTypeLabel(c, ambiguities) : ''
  return (
    <li className="p-2 rounded-lg border border-outline-variant/40 bg-surface-container/40 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-body-md text-sm text-on-surface font-medium">
            {c.displayName}
            {typeLabel && (
              <span className="ml-1.5 font-body-sm text-[10px] font-normal text-tertiary" data-testid="component-type">
                · {typeLabel}
              </span>
            )}
          </div>
          <div className="font-body-sm text-[10px] text-on-surface-variant" data-testid="component-quantity">
            {componentQuantityLabel(c)}
          </div>
          <div className="font-mono text-[10px] text-on-surface-variant" data-testid="ingredient-macros">
            {Math.round(c.macros.calories)} kcal · P{Math.round(c.macros.proteins)}g C{Math.round(c.macros.carbs)}g G{Math.round(c.macros.fats)}g
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            min={0}
            step={5}
            value={c.quantity}
            onChange={e => onQuantity(c.id, e.target.value)}
            aria-label={c.unit === 'g' ? `Cantidad en gramos de ${c.displayName}` : `Cantidad en unidades de ${c.displayName}`}
            className="input w-[76px] min-h-[48px] text-right font-mono text-sm"
          />
          <span className="font-mono text-[10px] text-on-surface-variant">{c.unit === 'g' ? 'g' : 'un.'}</span>
          <button
            type="button"
            onClick={() => onDrop(c.id)}
            aria-label={`Quitar ${c.displayName}`}
            className="w-12 h-12 shrink-0 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:text-error hover:border-error flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      {amb && (
        <div className="rounded-lg bg-tertiary/10 border border-tertiary/30 p-2 space-y-2" data-testid="dish-ambiguity">
          <div className="font-body-sm text-xs text-on-surface">{amb.question}</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={amb.question}>
            {amb.options.map(o => (
              <button
                key={o.id}
                type="button"
                aria-pressed={false}
                onClick={() => onOption(c.id, o.id)}
                className="althea-chip text-[11px]"
                data-testid={`dish-option-${o.id}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </li>
  )
}

export function DishComposer({ onSave, onCancel, initial, initialText, initialMealLabel, isEditing, saving }: DishComposerProps) {
  const [text, setText] = useState(initialText ?? initial?.name ?? '')
  const [meal, setMeal] = useState<MealInterpretation | null>(() => {
    if (!initial || initial.ingredients.length === 0) { return null }
    return mealFromComponents(initialText ?? initial.name, initial.name, initial.ingredients)
  })
  const [error, setError] = useState<string | null>(null)
  const [mealLabel, setMealLabel] = useState(initialMealLabel?.trim() || 'Comida')
  const [name, setName] = useState(initial?.name ?? '')

  const runInterpret = () => {
    const parsed = interpretMeal(text)
    if (!parsed) {
      setMeal(null)
      setError(
        'No pude identificar los ingredientes. Probá con más detalle: “fideos con boloñesa”, “pastel de papa con queso” o “200 g de pollo”.'
      )
      return
    }
    setError(null)
    setMeal(parsed)
    setName(parsed.mealName)
  }

  const changeQuantity = (id: string, value: string) => {
    setMeal(prev => (prev ? setComponentQuantity(prev, id, parseNumber(value)) : prev))
  }

  const chooseOption = (id: string, optionId: string) => {
    setMeal(prev => (prev ? resolveComponentOption(prev, id, optionId) : prev))
  }

  const dropOne = (id: string) => {
    setMeal(prev => (prev ? dropComponent(prev, id) : prev))
  }

  const submit = () => {
    if (!meal) { return }
    const ingredients = ingredientsOf(meal)
    if (ingredients.length === 0 || meal.needsConfirmation) { return }
    onSave({
      name: name.trim() || meal.mealName,
      mealLabel: mealLabel.trim() || 'Comida',
      ingredients,
      totals: meal.totals,
    })
  }

  const dish = meal ? meal.components.find(c => c.type === 'dish') ?? null : null
  const dishChildren = dish ? dish.children ?? [] : []
  const composition = meal ? (dish ? meal.components.filter(c => c.type !== 'dish') : meal.components) : []
  const blocked = meal?.needsConfirmation === true

  return (
    <div className="space-y-4" data-testid="dish-composer">
      {/* Campo principal: ¿Qué vas a comer? */}
      <div className="space-y-2">
        <label htmlFor="dish-text" className="font-headline-sm text-title-md text-on-surface">
          ¿Qué vas a comer?
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="dish-text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runInterpret() } }}
            placeholder="fideos con boloñesa, pastel de papa con queso, 200 g de pollo…"
            aria-label="Qué vas a comer"
            className="flex-1 min-w-0 min-h-[56px] bg-surface border border-outline-variant rounded-xl px-4 font-body-md text-base text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 transition-colors"
          />
          <AltheaButton
            variant="primary"
            size="lg"
            className="min-h-[56px] sm:w-auto"
            icon="auto_awesome"
            onClick={runInterpret}
            disabled={!text.trim()}
          >
            Interpretar
          </AltheaButton>
        </div>
        <p className="font-body-sm text-[11px] text-on-surface-variant">
          Escribí el plato en palabras. Althea estima los ingredientes y una porción estándar.
        </p>
        {error && (
          <div
            role="alert"
            className="font-body-sm text-xs bg-secondary/10 border border-secondary/30 rounded-lg p-3 text-on-surface"
          >
            {error}
          </div>
        )}
      </div>

      {/* Confirmación antes de guardar: plato + composición, editable */}
      {meal && flattenComponents(meal.components).length > 0 && (
        <div className="althea-level-3 p-4 space-y-4" data-testid="dish-review">
          <div className="space-y-1">
            <label htmlFor="dish-name" className="text-aux">
              Nombre de la comida
            </label>
            <input
              id="dish-name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="input w-full min-h-[48px]"
              placeholder="Fideos con boloñesa y queso rallado"
            />
          </div>

          {meal.hasEstimatedQuantities && (
            <div className="font-body-sm text-[11px] text-tertiary" data-testid="dish-estimated">
              Cantidades estimadas
            </div>
          )}

          {dishChildren.length > 0 && (
            <div className="space-y-2">
              <SectionTitle hint="composición del plato">Plato principal</SectionTitle>
              <ul className="space-y-2">
                {dishChildren.map(c => (
                  <ComponentRow key={c.id} c={c} ambiguities={meal.ambiguities} onQuantity={changeQuantity} onOption={chooseOption} onDrop={dropOne} />
                ))}
              </ul>
            </div>
          )}

          {composition.length > 0 && (
            <div className="space-y-2">
              <SectionTitle>{dishChildren.length > 0 ? 'Composición' : 'Ingredientes'}</SectionTitle>
              <ul className="space-y-2">
                {composition.map(c => (
                  <ComponentRow key={c.id} c={c} ambiguities={meal.ambiguities} onQuantity={changeQuantity} onOption={chooseOption} onDrop={dropOne} />
                ))}
              </ul>
            </div>
          )}

          {blocked && (
            <div
              role="alert"
              data-testid="dish-blocked"
              className="font-body-sm text-xs bg-tertiary/10 border border-tertiary/30 rounded-lg p-3 text-on-surface"
            >
              Falta confirmar un ingrediente antes de guardar.
            </div>
          )}

          {/* Total de la comida */}
          <div className="rounded-xl border border-primary/30 bg-primary/8 p-3 overflow-hidden">
            <div className="text-aux mb-1">Total de la comida</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="dish-totals">
              <div data-testid="dish-total-calories"><TotalCell label="Calorías" value={meal.totals.calories} unit="kcal" /></div>
              <div data-testid="dish-total-protein"><TotalCell label="Proteínas" value={meal.totals.proteins} unit="g" /></div>
              <div data-testid="dish-total-carbs"><TotalCell label="Carbohidratos" value={meal.totals.carbs} unit="g" /></div>
              <div data-testid="dish-total-fat"><TotalCell label="Grasas" value={meal.totals.fats} unit="g" /></div>
            </div>
          </div>

          <p className="font-body-sm text-[11px] text-on-surface-variant text-center">
            Estimación nutricional. Podés ajustar ingredientes o cantidades.
          </p>

          {/* Etiqueta libre de la comida */}
          <div className="space-y-2">
            <label htmlFor="meal-label" className="text-aux">
              Nombre de la comida del día
            </label>
            <input
              id="meal-label"
              value={mealLabel}
              onChange={e => setMealLabel(e.target.value)}
              className="input w-full min-h-[48px]"
              placeholder="Comida, Pre-entrenamiento, Colación…"
            />
            <div className="flex flex-wrap gap-1.5">
              {QUICK_LABELS.map(label => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setMealLabel(label)}
                  aria-pressed={mealLabel === label}
                  className={`althea-chip text-[11px] ${mealLabel === label ? 'is-active' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <AltheaButton variant="secondary" size="lg" fullWidth className="min-h-[52px]" onClick={onCancel}>
              {isEditing ? 'Cancelar' : 'Editar'}
            </AltheaButton>
            <AltheaButton
              variant="primary"
              size="lg"
              fullWidth
              className="min-h-[52px]"
              icon={isEditing ? 'save' : 'add'}
              loading={saving}
              disabled={blocked}
              onClick={submit}
              data-testid="dish-save"
            >
              {isEditing ? 'Guardar cambios' : 'Agregar al día'}
            </AltheaButton>
          </div>
        </div>
      )}
    </div>
  )
}

export default DishComposer
