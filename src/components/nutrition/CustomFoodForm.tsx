import { useState } from 'react'
import SemanticIcon from '@/components/ui/SemanticIcon'
import { AltheaButton } from '@/components/althea'
import {
  createCustomFood,
  validateCustomFoodInput,
  macroDiscrepancyWarning,
  normalizeToPer100,
  type CustomFood,
  type CustomFoodBasis,
  type CustomFoodInput,
  type CustomPortion,
} from '@/services/storage/customFoodStore'
import { sodiumToSalt, kjToKcal, type FoodCategory, type FoodState } from '@/services/nutrition/foodComposition'

// Alta manual de un alimento: el usuario carga sus propios macros cuando el
// alimento no está en el catálogo. Los macros se muestran normalizados a 100 g
// o 100 ml para que se vea cómo se va a calcular, sin importar la base elegida.

const CATEGORIES: Array<{ value: FoodCategory; label: string }> = [
  { value: 'cereal', label: 'Cereal / harina' },
  { value: 'legumbre', label: 'Legumbre' },
  { value: 'lacteo', label: 'Lácteo' },
  { value: 'carne', label: 'Carne' },
  { value: 'huevo', label: 'Huevo' },
  { value: 'pescado', label: 'Pescado' },
  { value: 'fruta', label: 'Fruta' },
  { value: 'verdura', label: 'Verdura' },
  { value: 'grasa', label: 'Grasa / aceite' },
  { value: 'condimento', label: 'Condimento' },
  { value: 'bebida', label: 'Bebida' },
  { value: 'endulzante', label: 'Endulzante' },
  { value: 'fruto-seco', label: 'Fruto seco' },
  { value: 'semilla', label: 'Semilla' },
  { value: 'panificado', label: 'Panificado' },
  { value: 'otro', label: 'Otro' },
]

const STATES: Array<{ value: FoodState; label: string }> = [
  { value: 'crudo', label: 'Crudo' },
  { value: 'seco', label: 'Seco' },
  { value: 'cocido', label: 'Cocido' },
  { value: 'hervido', label: 'Hervido' },
  { value: 'escurrido', label: 'Escurrido' },
  { value: 'en conserva', label: 'En conserva' },
  { value: 'listo', label: 'Listo para consumir' },
]

const BASIS: Array<{ value: CustomFoodBasis; label: string }> = [
  { value: 'per100g', label: 'Por 100 g' },
  { value: 'per100ml', label: 'Por 100 ml' },
  { value: 'perServing', label: 'Por porción' },
]

interface Props {
  onCreated: (food: CustomFood) => void
  onCancel: () => void
  /** nombre precargado (por ejemplo, el texto que no se reconoció). */
  initialName?: string
}

/** Convierte un input de texto a número o null si está vacío (vacío ≠ 0). */
function parseField(value: string): number | null {
  const t = value.trim()
  if (t === '') { return null }
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function CustomFoodForm({ onCreated, onCancel, initialName }: Props) {
  const [name, setName] = useState(initialName ?? '')
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState<FoodCategory | ''>('')
  const [state, setState] = useState<FoodState | ''>('')
  const [basis, setBasis] = useState<CustomFoodBasis>('per100g')
  const [calories, setCalories] = useState('')
  const [proteins, setProteins] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fats, setFats] = useState('')
  const [servingGrams, setServingGrams] = useState('')
  const [aliases, setAliases] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Nutrientes OPCIONALES (vacío = desconocido, no 0).
  const [showExtra, setShowExtra] = useState(false)
  const [fiber, setFiber] = useState('')
  const [sugars, setSugars] = useState('')
  const [addedSugars, setAddedSugars] = useState('')
  const [saturatedFat, setSaturatedFat] = useState('')
  const [transFat, setTransFat] = useState('')
  const [sodium, setSodium] = useState('')
  const [salt, setSalt] = useState('')
  const [energyKj, setEnergyKj] = useState('')
  const [barcode, setBarcode] = useState('')
  const [portions, setPortions] = useState<Array<{ label: string; grams: string }>>([])

  const buildInput = (): CustomFoodInput => {
    const portionRows: CustomPortion[] = portions
      .filter(p => p.label.trim() !== '' || p.grams.trim() !== '')
      .map(p => ({ label: p.label, grams: parseField(p.grams) ?? NaN }))
    return {
      name,
      brand: brand.trim() || undefined,
      category: (category || undefined) as FoodCategory | undefined,
      state: (state || undefined) as FoodState | undefined,
      basis,
      unit: basis === 'per100ml' ? 'ml' : 'g',
      calories: parseField(calories),
      proteins: parseField(proteins),
      carbs: parseField(carbs),
      fats: parseField(fats),
      servingGrams: basis === 'perServing' ? parseField(servingGrams) : undefined,
      aliases: aliases.split(',').map(a => a.trim()).filter(Boolean),
      fiber: parseField(fiber),
      sugars: parseField(sugars),
      addedSugars: parseField(addedSugars),
      saturatedFat: parseField(saturatedFat),
      transFat: parseField(transFat),
      sodium: parseField(sodium),
      salt: parseField(salt),
      energyKj: parseField(energyKj),
      barcode: barcode.trim() || undefined,
      portions: portionRows.length > 0 ? portionRows : undefined,
    }
  }

  // Cálculo directo en cada render: es una función pura de unos pocos campos y
  // no vale la pena memoizar (evita el warning de dependencias del hook).
  const currentInput = buildInput()
  const currentValid = validateCustomFoodInput(currentInput)
  const preview = currentValid.length > 0 ? null : normalizeToPer100(currentInput).per100

  const warning = preview ? macroDiscrepancyWarning(preview) : null

  const submit = async () => {
    const input = buildInput()
    const errs = validateCustomFoodInput(input)
    if (errs.length > 0) { setErrors(errs); return }
    setErrors([])
    setSaving(true)
    try {
      const created = await createCustomFood(input)
      onCreated(created)
    } catch (e: unknown) {
      setErrors([e instanceof Error ? e.message : 'No se pudo guardar el alimento'])
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="althea-level-3 p-4 space-y-3" data-testid="custom-food-form">
      <div className="font-label-caps text-[10px] uppercase tracking-wide text-on-surface-variant">
        Crear alimento manualmente
      </div>

      <div className="space-y-1">
        <label htmlFor="cf-name" className="text-aux">Nombre</label>
        <input id="cf-name" value={name} onChange={e => setName(e.target.value)} aria-label="Nombre del alimento"
          className="input w-full min-h-[44px]" placeholder="Yogur de coco, pan casero…" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="cf-brand" className="text-aux">Marca (opcional)</label>
          <input id="cf-brand" value={brand} onChange={e => setBrand(e.target.value)} aria-label="Marca"
            className="input w-full min-h-[44px]" placeholder="Sin marca" />
        </div>
        <div className="space-y-1">
          <label htmlFor="cf-basis" className="text-aux">Base de cálculo</label>
          <select id="cf-basis" value={basis} onChange={e => setBasis(e.target.value as CustomFoodBasis)}
            aria-label="Base de cálculo" className="input w-full min-h-[44px]">
            {BASIS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
      </div>

      {basis === 'perServing' && (
        <div className="space-y-1">
          <label htmlFor="cf-serving" className="text-aux">Peso de la porción ({basis === 'perServing' ? 'g o ml' : ''})</label>
          <input id="cf-serving" type="number" min={0} step="1" value={servingGrams}
            onChange={e => setServingGrams(e.target.value)} aria-label="Peso de la porción"
            className="input w-full min-h-[44px]" placeholder="ej. 30" />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="space-y-1">
          <label htmlFor="cf-cal" className="text-aux">Calorías</label>
          <input id="cf-cal" type="number" min={0} step="1" value={calories} onChange={e => setCalories(e.target.value)}
            aria-label="Calorías" className="input w-full min-h-[44px]" placeholder="kcal" />
        </div>
        <div className="space-y-1">
          <label htmlFor="cf-prot" className="text-aux">Proteínas</label>
          <input id="cf-prot" type="number" min={0} step="0.1" value={proteins} onChange={e => setProteins(e.target.value)}
            aria-label="Proteínas" className="input w-full min-h-[44px]" placeholder="g" />
        </div>
        <div className="space-y-1">
          <label htmlFor="cf-carb" className="text-aux">Carbohidratos</label>
          <input id="cf-carb" type="number" min={0} step="0.1" value={carbs} onChange={e => setCarbs(e.target.value)}
            aria-label="Carbohidratos" className="input w-full min-h-[44px]" placeholder="g" />
        </div>
        <div className="space-y-1">
          <label htmlFor="cf-fat" className="text-aux">Grasas</label>
          <input id="cf-fat" type="number" min={0} step="0.1" value={fats} onChange={e => setFats(e.target.value)}
            aria-label="Grasas" className="input w-full min-h-[44px]" placeholder="g" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="cf-cat" className="text-aux">Categoría (opcional)</label>
          <select id="cf-cat" value={category} onChange={e => setCategory(e.target.value as FoodCategory | '')}
            aria-label="Categoría" className="input w-full min-h-[44px]">
            <option value="">Sin categoría</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="cf-state" className="text-aux">Estado (opcional)</label>
          <select id="cf-state" value={state} onChange={e => setState(e.target.value as FoodState | '')}
            aria-label="Estado de preparación" className="input w-full min-h-[44px]">
            <option value="">Sin especificar</option>
            {STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="cf-aliases" className="text-aux">Sinónimos (opcional, separados por coma)</label>
        <input id="cf-aliases" value={aliases} onChange={e => setAliases(e.target.value)} aria-label="Sinónimos"
          className="input w-full min-h-[44px]" placeholder="yogur coco, coco yogur" />
      </div>

      <div className="space-y-1">
        <label htmlFor="cf-barcode" className="text-aux">Código de barras (opcional)</label>
        <input id="cf-barcode" value={barcode} onChange={e => setBarcode(e.target.value)} aria-label="Código de barras"
          inputMode="numeric" className="input w-full min-h-[44px]" placeholder="ej. 7791234567890" />
      </div>

      <button
        type="button"
        onClick={() => setShowExtra(v => !v)}
        data-testid="cf-extra-toggle"
        className="althea-chip text-[11px] inline-flex items-center gap-1"
      >
        <SemanticIcon name={showExtra ? 'expand_less' : 'expand_more'} size={14} />
        Nutrientes adicionales (opcional)
      </button>

      {showExtra && (
        <div className="space-y-3" data-testid="cf-extra">
          <p className="font-body-sm text-[10px] text-on-surface-variant">
            Dejá vacío lo que no figure en la etiqueta. Un dato vacío se guarda como desconocido, nunca como 0.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="space-y-1">
              <label htmlFor="cf-fiber" className="text-aux">Fibra (g)</label>
              <input id="cf-fiber" type="number" min={0} step="0.1" value={fiber} onChange={e => setFiber(e.target.value)}
                aria-label="Fibra" className="input w-full min-h-[44px]" />
            </div>
            <div className="space-y-1">
              <label htmlFor="cf-sugars" className="text-aux">Azúcares totales (g)</label>
              <input id="cf-sugars" type="number" min={0} step="0.1" value={sugars} onChange={e => setSugars(e.target.value)}
                aria-label="Azúcares totales" className="input w-full min-h-[44px]" />
            </div>
            <div className="space-y-1">
              <label htmlFor="cf-addsugars" className="text-aux">Azúcares añadidos (g)</label>
              <input id="cf-addsugars" type="number" min={0} step="0.1" value={addedSugars} onChange={e => setAddedSugars(e.target.value)}
                aria-label="Azúcares añadidos" className="input w-full min-h-[44px]" />
            </div>
            <div className="space-y-1">
              <label htmlFor="cf-satfat" className="text-aux">Grasas saturadas (g)</label>
              <input id="cf-satfat" type="number" min={0} step="0.1" value={saturatedFat} onChange={e => setSaturatedFat(e.target.value)}
                aria-label="Grasas saturadas" className="input w-full min-h-[44px]" />
            </div>
            <div className="space-y-1">
              <label htmlFor="cf-transfat" className="text-aux">Grasas trans (g)</label>
              <input id="cf-transfat" type="number" min={0} step="0.1" value={transFat} onChange={e => setTransFat(e.target.value)}
                aria-label="Grasas trans" className="input w-full min-h-[44px]" />
            </div>
            <div className="space-y-1">
              <label htmlFor="cf-kj" className="text-aux">Energía (kJ)</label>
              <input id="cf-kj" type="number" min={0} step="1" value={energyKj} onChange={e => setEnergyKj(e.target.value)}
                aria-label="Energía en kilojoules" className="input w-full min-h-[44px]" />
              {parseField(energyKj) !== null && (
                <span className="font-body-sm text-[10px] text-on-surface-variant">
                  ≈ {kjToKcal(parseField(energyKj) as number)} kcal (no sobrescribe las kcal cargadas)
                </span>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="cf-sodium" className="text-aux">Sodio (mg)</label>
              <input id="cf-sodium" type="number" min={0} step="1" value={sodium} onChange={e => setSodium(e.target.value)}
                aria-label="Sodio" className="input w-full min-h-[44px]" />
            </div>
            <div className="space-y-1">
              <label htmlFor="cf-salt" className="text-aux">Sal (g)</label>
              <input id="cf-salt" type="number" min={0} step="0.01" value={salt} onChange={e => setSalt(e.target.value)}
                aria-label="Sal" className="input w-full min-h-[44px]" />
              {parseField(sodium) !== null && (
                <button
                  type="button"
                  onClick={() => setSalt(String(sodiumToSalt(parseField(sodium) as number)))}
                  data-testid="cf-salt-from-sodium"
                  className="font-body-sm text-[10px] underline text-on-surface-variant"
                >
                  ≈ sal desde sodio ({sodiumToSalt(parseField(sodium) as number)} g)
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-aux">Porciones alternativas (opcional)</span>
              <button
                type="button"
                onClick={() => setPortions(prev => [...prev, { label: '', grams: '' }])}
                data-testid="cf-portion-add"
                className="althea-chip text-[11px] inline-flex items-center gap-1"
              >
                <SemanticIcon name="add" size={14} /> Agregar porción
              </button>
            </div>
            {portions.map((p, i) => (
              <div key={i} className="flex items-center gap-2" data-testid={`cf-portion-${i}`}>
                <input
                  value={p.label}
                  onChange={e => setPortions(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                  aria-label={`Nombre de la porción ${i + 1}`}
                  className="input flex-1 min-h-[44px]" placeholder="ej. 1 taza, 1 unidad" />
                <input
                  type="number" min={0} step="1" value={p.grams}
                  onChange={e => setPortions(prev => prev.map((x, j) => j === i ? { ...x, grams: e.target.value } : x))}
                  aria-label={`Gramos de la porción ${i + 1}`}
                  className="input w-[90px] min-h-[44px] text-right" placeholder="g" />
                <button
                  type="button"
                  onClick={() => setPortions(prev => prev.filter((_, j) => j !== i))}
                  aria-label={`Quitar porción ${i + 1}`}
                  data-testid={`cf-portion-remove-${i}`}
                  className="p-2 text-on-surface-variant"
                >
                  <SemanticIcon name="delete" size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {preview && (
        <div className="font-body-sm text-[11px] text-on-surface-variant" data-testid="cf-preview">
          Normalizado a 100 {basis === 'per100ml' ? 'ml' : 'g'}: {Math.round(preview.calories)} kcal · P{preview.proteins}g · C{preview.carbs}g · G{preview.fats}g
        </div>
      )}

      {warning && (
        <div role="alert" className="font-body-sm text-xs bg-tertiary/10 border border-tertiary/30 rounded-lg p-2 text-on-surface" data-testid="cf-warning">
          {warning}
        </div>
      )}

      {errors.length > 0 && (
        <ul role="alert" className="font-body-sm text-xs text-error space-y-1" data-testid="cf-errors">
          {errors.map(e => <li key={e}>• {e}</li>)}
        </ul>
      )}

      <p className="font-body-sm text-[10px] text-on-surface-variant">
        Un campo vacío no es 0: escribí 0 explícito si el alimento no aporta ese macro.
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <AltheaButton variant="secondary" size="md" fullWidth onClick={onCancel}>Cancelar</AltheaButton>
        <AltheaButton variant="primary" size="md" fullWidth loading={saving} onClick={submit} data-testid="cf-save">
          Guardar alimento
        </AltheaButton>
      </div>
    </div>
  )
}

export default CustomFoodForm
