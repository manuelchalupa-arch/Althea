// Meal Understanding — interpretación estructurada de una comida en texto libre.
//
// SEPARA dos responsabilidades (arquitectura del producto):
//   1. Meal Understanding  → acá: qué componentes tiene la comida, qué cantidad
//      tiene cada uno y si algo quedó ambiguo.
//   2. Nutrition Resolution → foodComposition.ts: macros por gramos.
//
// Reglas duras del producto:
// - Una comida compuesta NO se descompone en "ingredientes sueltos" sueltos:
//   la hamburguesa es el plato principal y su pan/medallón son SU composición.
// - Un término genérico ("queso") NUNCA se convierte en uno específico
//   ("queso rallado"): queda "Queso — tipo no especificado" + pregunta.
// - Sin cantidad escrita: porción estándar marcada como ESTIMADA, editable.
// - Los macros salen de aritmética sobre la tabla local, nunca de un LLM.

import {
  FOODS,
  getFood,
  normalizeDishText,
  scaleMacros,
  sumMacros,
  type FoodBase,
  type Macros,
} from './foodComposition'

export type MealComponentType = 'dish' | 'ingredient' | 'topping' | 'condiment' | 'beverage'
export type MealComponentSource = 'recipe' | 'food' | 'user'
export type MealUnit = 'g' | 'unidad'

export interface MealOption {
  id: string
  label: string
}

export interface MealComponent {
  id: string
  type: MealComponentType
  /** id en la tabla de composición; null solo en el plato (es un contenedor) */
  canonicalFoodId: string | null
  displayName: string
  /** gramos que alimentan el cálculo nutricional */
  grams: number
  /** cantidad que ve el usuario (unidades si unit === 'unidad') */
  quantity: number
  unit: MealUnit
  /** true cuando el usuario NO escribió la cantidad */
  quantityEstimated: boolean
  preparation?: string
  confidence: number
  source: MealComponentSource
  macros: Macros
  /** variantes disponibles cuando el término es ambiguo */
  options?: MealOption[]
  /** composición de un plato compuesto (hamburguesa → pan + medallón) */
  children?: MealComponent[]
}

export interface MealAmbiguity {
  componentId: string
  kind: 'type'
  question: string
  options: MealOption[]
}

export interface MealInterpretation {
  originalText: string
  mealName: string
  components: MealComponent[]
  totals: Macros
  confidence: number
  ambiguities: MealAmbiguity[]
  needsConfirmation: boolean
  hasEstimatedQuantities: boolean
  hasExplicitAmount: boolean
}

// ── Términos genéricos: tienen variantes en la biblioteca pero el usuario no
//    especificó cuál. Se pregunta, no se adivina. ────────────────────────────
const AMBIGUOUS_TERMS: Record<string, { question: string; options: MealOption[] }> = {
  queso: {
    question: '¿Qué tipo de queso usaste?',
    options: [
      { id: 'queso', label: 'Queso (sin especificar)' },
      { id: 'queso-crema', label: 'Queso cremoso' },
      { id: 'mozzarella', label: 'Mozzarella' },
      { id: 'cheddar', label: 'Cheddar' },
      { id: 'queso-rallado', label: 'Queso rallado' },
    ],
  },
}

// ── Catálogo de preparaciones compuestas (extensible) ───────────────────────
export interface RecipeItem {
  foodId: string
  grams?: number
  units?: number
  type?: MealComponentType
}

export interface Recipe {
  id: string
  name: string
  aliases: string[]
  items: RecipeItem[]
}

export const RECIPES: Recipe[] = [
  {
    id: 'fideos-bolonesa',
    name: 'Fideos con boloñesa',
    aliases: ['fideos con bolonesa', 'fideos a la bolonesa', 'pasta a la bolonesa', 'fideos con boloñesa', 'pasta con salsa'],
    items: [
      { foodId: 'fideos', grams: 180 },
      { foodId: 'carne-picada', grams: 100 },
      { foodId: 'salsa-tomate', grams: 120 },
      { foodId: 'cebolla', grams: 30 },
    ],
  },
  {
    id: 'hamburguesa',
    name: 'Hamburguesa',
    aliases: ['hamburguesa'],
    items: [
      { foodId: 'pan-hamburguesa', units: 1 },
      { foodId: 'medallon-carne', units: 1 },
    ],
  },
  {
    id: 'pizza',
    name: 'Pizza',
    aliases: ['pizza casera', 'pizza'],
    items: [
      { foodId: 'masa-pizza', grams: 150 },
      { foodId: 'salsa-tomate', grams: 80 },
      { foodId: 'mozzarella', grams: 100 },
    ],
  },
  {
    id: 'pastel-papa',
    name: 'Pastel de papa',
    aliases: ['pastel de papa', 'pastel de papas', 'papas a la parmesana', 'pastel de papas con carne'],
    items: [
      { foodId: 'papa', grams: 300 },
      { foodId: 'carne-picada', grams: 120 },
      { foodId: 'cebolla', grams: 40 },
    ],
  },
  {
    id: 'milanesa',
    name: 'Milanesa',
    aliases: ['milanesa de carne', 'milanesa', 'milanesas'],
    items: [
      { foodId: 'carne', grams: 120 },
      { foodId: 'huevo', grams: 50 },
      { foodId: 'pan-rallado', grams: 30 },
      { foodId: 'aceite', grams: 8 },
    ],
  },
  {
    id: 'tarta-papa',
    name: 'Tarta de papa',
    aliases: ['tarta de papa', 'tarta de papas'],
    items: [
      { foodId: 'masa-hojaldre', grams: 60 },
      { foodId: 'papa', grams: 200 },
      { foodId: 'huevo', grams: 50 },
    ],
  },
  {
    id: 'empanada',
    name: 'Empanada',
    aliases: ['empanada', 'empanadas'],
    items: [
      { foodId: 'masa-empanada', grams: 55 },
      { foodId: 'carne-picada', grams: 60 },
      { foodId: 'cebolla', grams: 15 },
    ],
  },
  {
    id: 'guiso-carne',
    name: 'Guiso de carne',
    aliases: ['guiso de carne', 'guiso con verduras', 'guiso'],
    items: [
      { foodId: 'carne-picada', grams: 100 },
      { foodId: 'papa', grams: 150 },
      { foodId: 'zanahoria', grams: 50 },
      { foodId: 'cebolla', grams: 30 },
    ],
  },
  {
    id: 'sandwich-miga',
    name: 'Sándwich de miga',
    aliases: ['sandwich de miga', 'sándwich de miga', 'sandwich'],
    items: [
      { foodId: 'pan', grams: 80 },
      { foodId: 'jamon', grams: 40 },
      { foodId: 'lechuga', grams: 20 },
      { foodId: 'tomate', grams: 30 },
    ],
  },
  {
    id: 'ensalada-compuesta',
    name: 'Ensalada compuesta',
    aliases: ['ensalada compuesta', 'ensalada mixta'],
    items: [
      { foodId: 'lechuga', grams: 100 },
      { foodId: 'tomate', grams: 150 },
      { foodId: 'huevo', grams: 50 },
      { foodId: 'zanahoria', grams: 50 },
    ],
  },
  {
    id: 'ensalada-lechuga-tomate',
    name: 'Ensalada de lechuga y tomate',
    aliases: ['ensalada de lechuga y tomate', 'ensalada de lechuga', 'ensalada de tomate', 'ensalada'],
    items: [
      { foodId: 'lechuga', grams: 100 },
      { foodId: 'tomate', grams: 150 },
    ],
  },
  {
    id: 'arroz-pollo',
    name: 'Arroz con pollo',
    aliases: ['arroz con pollo', 'pollo con arroz'],
    items: [
      { foodId: 'arroz', grams: 200 },
      { foodId: 'pollo', grams: 120 },
    ],
  },
  {
    id: 'pollo-pure',
    name: 'Pollo con puré',
    aliases: ['pollo con pure', 'pure con pollo'],
    items: [
      { foodId: 'pollo', grams: 130 },
      { foodId: 'pure-papa', grams: 200 },
    ],
  },
  {
    id: 'yogur-banana',
    name: 'Yogur con banana',
    aliases: ['yogur con banana', 'banana con yogur'],
    items: [
      { foodId: 'yogur', grams: 200 },
      { foodId: 'banana', grams: 100 },
    ],
  },
  {
    id: 'tostada-huevo',
    name: 'Tostada con huevo',
    aliases: ['tostada con huevo', 'huevo con tostada', 'tostadas con huevo'],
    items: [
      { foodId: 'pan', grams: 80 },
      { foodId: 'huevo', grams: 50 },
    ],
  },
  {
    id: 'locro',
    name: 'Locro',
    aliases: ['locro', 'locro criollo', 'locro argentino'],
    items: [
      { foodId: 'zapallo', grams: 200 },
      { foodId: 'maiz', grams: 80 },
      { foodId: 'poroto', grams: 60 },
      { foodId: 'carne-picada', grams: 100 },
      { foodId: 'cebolla', grams: 40 },
      { foodId: 'panceta', grams: 30 },
    ],
  },
  {
    id: 'carbonada',
    name: 'Carbonada',
    aliases: ['carbonada', 'carbonada criolla'],
    items: [
      { foodId: 'carne-picada', grams: 120 },
      { foodId: 'papa', grams: 150 },
      { foodId: 'zanahoria', grams: 60 },
      { foodId: 'zapallo', grams: 100 },
      { foodId: 'cebolla', grams: 30 },
      { foodId: 'salsa-tomate', grams: 80 },
    ],
  },
  {
    id: 'matambre-arrollado',
    name: 'Matambre arrollado',
    aliases: ['matambre arrollado', 'matambre', 'matambre a la pizza'],
    items: [
      { foodId: 'carne', grams: 150 },
      { foodId: 'huevo', grams: 50 },
      { foodId: 'zanahoria', grams: 30 },
      { foodId: 'morron', grams: 20 },
    ],
  },
  {
    id: 'sorrentinos',
    name: 'Sorrentinos',
    aliases: ['sorrentinos', 'sorrentinos de ricota', 'sorrentinos de jamón y mozzarella'],
    items: [
      { foodId: 'fideos', grams: 180 },
      { foodId: 'queso-crema', grams: 80 },
      { foodId: 'jamon', grams: 40 },
      { foodId: 'salsa-tomate', grams: 100 },
    ],
  },
  {
    id: 'noquis',
    name: 'Ñoquis',
    aliases: ['ñoquis', 'noquis', 'ñoquis de papa', 'gnocchi'],
    items: [
      { foodId: 'papa', grams: 250 },
      { foodId: 'harina', grams: 60 },
      { foodId: 'huevo', grams: 50 },
      { foodId: 'salsa-tomate', grams: 100 },
    ],
  },
  {
    id: 'milanesa-napolitana',
    name: 'Milanesa a la napolitana',
    aliases: ['milanesa a la napolitana', 'milanesa napolitana', 'napolitana'],
    items: [
      { foodId: 'carne', grams: 120 },
      { foodId: 'huevo', grams: 50 },
      { foodId: 'pan-rallado', grams: 30 },
      { foodId: 'salsa-tomate', grams: 80 },
      { foodId: 'mozzarella', grams: 60 },
      { foodId: 'aceite', grams: 8 },
    ],
  },
  {
    id: 'revuelto-gramajo',
    name: 'Revuelto Gramajo',
    aliases: ['revuelto gramajo', 'gramajo', 'revuelto de papa y huevo'],
    items: [
      { foodId: 'huevo', grams: 100 },
      { foodId: 'papa', grams: 150 },
      { foodId: 'jamon', grams: 40 },
      { foodId: 'aceite', grams: 10 },
    ],
  },
  {
    id: 'colchon-arvejas',
    name: 'Colchón de arvejas',
    aliases: ['colchon de arvejas', 'colchón de arvejas', 'arvejas con huevo'],
    items: [
      { foodId: 'arvejas', grams: 150 },
      { foodId: 'huevo', grams: 50 },
      { foodId: 'cebolla', grams: 30 },
      { foodId: 'papa', grams: 100 },
    ],
  },
  {
    id: 'pastel-choclo',
    name: 'Pastel de choclo',
    aliases: ['pastel de choclo', 'choclo con carne', 'pastel de choclo con carne'],
    items: [
      { foodId: 'choclo', grams: 200 },
      { foodId: 'carne-picada', grams: 100 },
      { foodId: 'cebolla', grams: 40 },
      { foodId: 'huevo', grams: 50 },
    ],
  },
  {
    id: 'berenjenas-escabeche',
    name: 'Berenjenas en escabeche',
    aliases: ['berenjenas en escabeche', 'berenjenas escabechadas', 'escabeche de berenjenas'],
    items: [
      { foodId: 'berenjena', grams: 200 },
      { foodId: 'aceite', grams: 30 },
      { foodId: 'vinagre', grams: 20 },
      { foodId: 'ajo', grams: 5 },
    ],
  },
  {
    id: 'ensalada-rusa',
    name: 'Ensalada rusa',
    aliases: ['ensalada rusa', 'ensalada rusa con mayonesa', 'ensaladilla rusa'],
    items: [
      { foodId: 'papa', grams: 150 },
      { foodId: 'zanahoria', grams: 50 },
      { foodId: 'arvejas', grams: 50 },
      { foodId: 'mayonesa', grams: 40 },
    ],
  },
  {
    id: 'vitel-tone',
    name: 'Vitel toné',
    aliases: ['vitel toné', 'vitel tone', 'ternera con salsa de atún', 'vitel toné frío'],
    items: [
      { foodId: 'carne', grams: 120 },
      { foodId: 'atun', grams: 60 },
      { foodId: 'mayonesa', grams: 30 },
      { foodId: 'crema', grams: 30 },
    ],
  },
  {
    id: 'polenta-tuco',
    name: 'Polenta con tuco',
    aliases: ['polenta con tuco', 'polenta', 'polenta con salsa'],
    items: [
      { foodId: 'polenta', grams: 200 },
      { foodId: 'salsa-tomate', grams: 120 },
      { foodId: 'carne-picada', grams: 80 },
      { foodId: 'queso-rallado', grams: 30 },
    ],
  },
  {
    id: 'chupin-pescado',
    name: 'Chupín de pescado',
    aliases: ['chupin de pescado', 'chupín de pescado', 'chupin', 'pescado en salsa'],
    items: [
      { foodId: 'pescado', grams: 150 },
      { foodId: 'salsa-tomate', grams: 100 },
      { foodId: 'papa', grams: 100 },
      { foodId: 'cebolla', grams: 30 },
      { foodId: 'morron', grams: 30 },
    ],
  },
  {
    id: 'empanada-salteña',
    name: 'Empanada salteña',
    aliases: ['empanada salteña', 'empanadas salteñas', 'salteñas'],
    items: [
      { foodId: 'masa-empanada', grams: 55 },
      { foodId: 'carne-picada', grams: 70 },
      { foodId: 'cebolla', grams: 20 },
      { foodId: 'huevo', grams: 25 },
      { foodId: 'papa', grams: 30 },
    ],
  },
  {
    id: 'empanada-tucumana',
    name: 'Empanada tucumana',
    aliases: ['empanada tucumana', 'empanadas tucumanas', 'tucumanas'],
    items: [
      { foodId: 'masa-empanada', grams: 55 },
      { foodId: 'carne-picada', grams: 70 },
      { foodId: 'cebolla', grams: 20 },
      { foodId: 'huevo', grams: 25 },
      { foodId: 'comino', grams: 2 },
    ],
  },
]

const COUNT_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, medio: 0.5, media: 0.5, mitad: 0.5,
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
}

const GRAM_UNITS = new Set(['g', 'gr', 'grs', 'gramo', 'gramos'])
const KG_UNITS = new Set(['kg', 'kilo', 'kilos'])

function toNumber(token: string): number | null {
  const n = Number(token.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Unidades solo cuando la cantidad vino expresada en unidades ("2 huevos"). */
function quantityOf(grams: number, units?: number): { quantity: number; unit: MealUnit } {
  if (units !== undefined) { return { quantity: units, unit: 'unidad' } }
  return { quantity: grams, unit: 'g' }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function baseComponent(
  food: FoodBase,
  grams: number,
  opts: {
    type: MealComponentType
    source: MealComponentSource
    estimated: boolean
    confidence: number
    units?: number
  }
): MealComponent {
  const g = Math.max(0, Math.round(grams))
  const { quantity, unit } = quantityOf(g, opts.units)
  const ambiguity = AMBIGUOUS_TERMS[food.id]
  return {
    id: `comp-${food.id}`,
    type: opts.type,
    canonicalFoodId: food.id,
    displayName: food.label,
    grams: g,
    quantity,
    unit,
    quantityEstimated: opts.estimated,
    confidence: opts.confidence,
    source: opts.source,
    macros: scaleMacros(food.per100, g),
    options: ambiguity ? ambiguity.options : undefined,
  }
}

/** Todas las apariciones de alimentos, con la cantidad detectada si la hay. */
export function scanFoods(text: string): Array<{ food: FoodBase; explicit?: { grams: number; units?: number } }> {
  const tokens = text.split(' ').filter(Boolean)
  // El alias más largo primero: "queso rallado" debe ganarle a "queso".
  const foods = [...FOODS].sort(
    (a, b) => Math.max(...b.aliases.map(x => x.length)) - Math.max(...a.aliases.map(x => x.length))
  )
  const found: Array<{ food: FoodBase; explicit?: { grams: number; units?: number }; at: number }> = []
  const taken = new Array<boolean>(tokens.length).fill(false)

  for (const food of foods) {
    const aliases = [...food.aliases].sort((a, b) => b.length - a.length)
    for (const alias of aliases) {
      const aliasTokens = alias.split(' ')
      for (let i = 0; i + aliasTokens.length <= tokens.length; i++) {
        let free = false
        for (let k = 0; k < aliasTokens.length; k++) {
          if (taken[i + k] || tokens[i + k] !== aliasTokens[k]) { free = true; break }
        }
        if (free) { continue }
        for (let k = 0; k < aliasTokens.length; k++) { taken[i + k] = true }
        found.push({ food, explicit: readAmountBefore(tokens, i, food), at: i })
      }
    }
  }
  // Los componentes quedan en el orden en que el usuario los escribió.
  return found.sort((a, b) => a.at - b.at)
}

/** Lee la cantidad inmediatamente anterior al alimento. */
function readAmountBefore(tokens: string[], index: number, food: FoodBase): { grams: number; units?: number } | undefined {
  const prev = index > 0 ? tokens[index - 1] : ''
  const prev2 = index > 1 ? tokens[index - 2] : ''
  const prev3 = index > 2 ? tokens[index - 3] : ''

  // "media porcion de fideos"
  if (prev === 'de' && prev2 === 'porcion') {
    if (COUNT_WORDS[prev3] === 0.5) { return { grams: food.standardGrams / 2 } }
    if (COUNT_WORDS[prev3] === 1) { return { grams: food.standardGrams } }
  }
  // "200 g de pollo" | "1 kg de fideos"
  if (prev === 'de') {
    const unit = prev2
    const value = toNumber(prev3)
    if (value !== null) {
      if (KG_UNITS.has(unit)) { return { grams: value * 1000 } }
      if (GRAM_UNITS.has(unit)) { return { grams: value } }
      if (unit === 'de' || unit === '') { return undefined }
    }
  }
  // "2 huevos" (alimento contable)
  const count = COUNT_WORDS[prev]
  if (count !== undefined) {
    if (prev2 === 'de' || prev2 === 'y' || prev2 === 'con' || food.unitGrams) {
      if (food.unitGrams) { return { grams: count * food.unitGrams, units: count } }
    }
  }
  const bare = toNumber(prev)
  if (bare !== null && food.unitGrams) { return { grams: bare * food.unitGrams, units: bare } }
  return undefined
}

function findRecipe(text: string): { recipe: Recipe; alias: string } | null {
  let best: { recipe: Recipe; alias: string } | null = null
  for (const recipe of RECIPES) {
    for (const alias of recipe.aliases) {
      if (!text.includes(alias)) { continue }
      if (!best || alias.length > best.alias.length) { best = { recipe, alias } }
    }
  }
  return best
}

export function cleanMealName(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ')
  if (!t) { return 'Comida' }
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function ambiguityOf(component: MealComponent): MealAmbiguity | null {
  if (!component.canonicalFoodId) { return null }
  const term = AMBIGUOUS_TERMS[component.canonicalFoodId]
  if (!term) { return null }
  return { componentId: component.id, kind: 'type', question: term.question, options: term.options }
}

function collectAmbiguities(components: MealComponent[]): MealAmbiguity[] {
  const out: MealAmbiguity[] = []
  for (const c of components) {
    if (c.children) { out.push(...collectAmbiguities(c.children)) }
    const a = ambiguityOf(c)
    if (a) { out.push(a) }
  }
  return out
}

/** Hojas con valor nutricional: el plato contenedor no suma dos veces. */
export function flattenComponents(components: MealComponent[]): MealComponent[] {
  const out: MealComponent[] = []
  for (const c of components) {
    if (c.children && c.children.length > 0) { out.push(...flattenComponents(c.children)) }
    else { out.push(c) }
  }
  return out
}

function summarize(components: MealComponent[]): { estimated: boolean; explicit: boolean } {
  const leaves = flattenComponents(components)
  return {
    estimated: leaves.some(c => c.quantityEstimated),
    explicit: leaves.some(c => !c.quantityEstimated),
  }
}

function totalsOf(components: MealComponent[]): Macros {
  return sumMacros(flattenComponents(components).map(c => c.macros))
}

/**
 * Interpreta una comida escrita en texto libre.
 * Devuelve null cuando no reconoce ningún alimento ni receta.
 */
export function interpretMeal(input: string): MealInterpretation | null {
  const text = normalizeDishText(input)
  if (!text) { return null }

  const components: MealComponent[] = []
  let rest = text
  let hasExplicitAmount = false
  let confidence = 0.4

  const matched = findRecipe(text)
  if (matched) {
    confidence = 0.92
    rest = text.replace(matched.alias, ' ').replace(/\s+/g, ' ').trim()
    const children: MealComponent[] = []
    for (const item of matched.recipe.items) {
      const food = getFood(item.foodId)
      if (!food) { continue }
      const grams = item.units !== undefined
        ? item.units * (food.unitGrams ?? food.standardGrams)
        : (item.grams ?? food.standardGrams)
      children.push(baseComponent(food, grams, {
        type: item.type ?? 'ingredient',
        source: 'recipe',
        estimated: true,
        confidence: 0.9,
        units: item.units,
      }))
    }
    components.push({
      id: `dish-${matched.recipe.id}`,
      type: 'dish',
      canonicalFoodId: null,
      displayName: matched.recipe.name,
      grams: children.reduce((a, c) => a + c.grams, 0),
      quantity: children.length,
      unit: 'g',
      quantityEstimated: true,
      confidence: 0.95,
      source: 'recipe',
      macros: sumMacros(children.map(c => c.macros)),
      children,
    })
  }

  // Componentes fuera de la receta: toppings, condimentos o alimentos sueltos.
  const scanned = scanFoods(rest)
  if (scanned.length > 0 && !matched) { confidence = Math.max(confidence, 0.75) }

  const dishIndex = components.findIndex(c => c.type === 'dish')

  // 1) Cantidad explícita del usuario: pisa la porción de la receta y nunca
  //    deja dos entradas del mismo alimento dentro del plato.
  const explicitByFood = new Map<string, MealComponent>()
  for (const s of scanned) {
    if (!s.explicit) { continue }
    hasExplicitAmount = true
    explicitByFood.set(s.food.id, baseComponent(s.food, s.explicit.grams, {
      type: 'topping',
      source: 'user',
      estimated: false,
      confidence: 0.95,
      units: s.explicit.units,
    }))
  }

  if (dishIndex >= 0) {
    const dish = components[dishIndex]
    const used = new Set<string>()
    const children = (dish.children ?? []).map(c => {
      const override = c.canonicalFoodId ? explicitByFood.get(c.canonicalFoodId) : undefined
      if (!override) { return c }
      if (c.canonicalFoodId) { used.add(c.canonicalFoodId) }
      return { ...override, id: c.id, type: c.type }
    })
    for (const [foodId, comp] of explicitByFood) {
      if (!used.has(foodId)) { components.push(comp) }
    }
    components[dishIndex] = {
      ...dish,
      children,
      grams: children.reduce((a, c) => a + c.grams, 0),
      macros: sumMacros(children.map(c => c.macros)),
    }
  } else {
    for (const [, comp] of explicitByFood) { components.push(comp) }
  }

  // 2) Sin cantidad escrita: porción estándar del alimento, marcada como
  //    estimada. Si el alimento ya está en el plato no se duplica.
  const present = new Set(
    flattenComponents(components).map(c => c.canonicalFoodId).filter((x): x is string => !!x)
  )
  for (const s of scanned) {
    if (s.explicit) { continue }
    if (present.has(s.food.id)) { continue }
    components.push(baseComponent(s.food, s.food.standardGrams, {
      type: 'topping',
      source: 'food',
      estimated: true,
      confidence: 0.7,
    }))
    present.add(s.food.id)
  }

  if (components.length === 0) { return null }

  const ambiguities = collectAmbiguities(components)
  const summary = summarize(components)
  if (ambiguities.length > 0) { confidence = Math.min(confidence, 0.6) }

  return {
    originalText: input,
    mealName: cleanMealName(input),
    components,
    totals: totalsOf(components),
    confidence: round2(confidence),
    ambiguities,
    needsConfirmation: ambiguities.length > 0,
    hasEstimatedQuantities: summary.estimated,
    hasExplicitAmount,
  }
}

// ── Edición sobre la interpretación (pantalla de confirmación) ──────────────

function replaceComponent(
  components: MealComponent[],
  id: string,
  next: MealComponent
): MealComponent[] {
  return components.map(c => {
    if (c.id === id) { return next }
    if (c.children) { return { ...c, children: replaceComponent(c.children, id, next) } }
    return c
  })
}

function removeComponent(components: MealComponent[], id: string): MealComponent[] {
  const out: MealComponent[] = []
  for (const c of components) {
    if (c.id === id) { continue }
    if (c.children) {
      const kids = removeComponent(c.children, id)
      if (kids.length === 0) { continue }
      out.push({ ...c, children: kids, macros: sumMacros(kids.map(k => k.macros)), grams: kids.reduce((a, k) => a + k.grams, 0) })
    } else {
      out.push(c)
    }
  }
  return out
}

function withMeta(components: MealComponent[], originalText: string, mealName: string, explicit: boolean): MealInterpretation {
  const ambiguities = collectAmbiguities(components)
  const summary = summarize(components)
  return {
    originalText,
    mealName,
    components,
    totals: totalsOf(components),
    confidence: components.length === 0 ? 0 : 0.8,
    ambiguities,
    needsConfirmation: ambiguities.length > 0,
    hasEstimatedQuantities: summary.estimated,
    hasExplicitAmount: explicit,
  }
}

/** Cambia los gramos de un componente y recalcula sus macros. */
export function setComponentGrams(meal: MealInterpretation, id: string, grams: number): MealInterpretation {
  return applyQuantity(meal, id, grams, 'g')
}

/**
 * Cambia la cantidad en la unidad en la que se muestra el componente:
 * gramos → gramos; unidades → multiplica por el peso de una unidad.
 */
export function setComponentQuantity(meal: MealInterpretation, id: string, value: number): MealInterpretation {
  const current = flattenComponents(meal.components).find(c => c.id === id)
  if (!current) { return meal }
  return applyQuantity(meal, id, value, current.unit)
}

function applyQuantity(meal: MealInterpretation, id: string, value: number, unit: MealUnit): MealInterpretation {
  const current = flattenComponents(meal.components).find(c => c.id === id)
  if (!current || !current.canonicalFoodId) { return meal }
  const food = getFood(current.canonicalFoodId)
  if (!food) { return meal }
  const safe = Math.max(0, Number.isFinite(value) ? value : 0)
  const grams = unit === 'unidad'
    ? Math.round(safe * (food.unitGrams ?? food.standardGrams))
    : Math.round(safe)
  const next: MealComponent = {
    ...current,
    grams,
    quantity: safe,
    unit,
    macros: scaleMacros(food.per100, grams),
    source: 'user',
  }
  return withMeta(replaceComponent(meal.components, id, next), meal.originalText, meal.mealName, meal.hasExplicitAmount)
}

/** Resuelve una ambigüedad eligiendo una variante de la biblioteca. */
export function resolveComponentOption(meal: MealInterpretation, id: string, optionId: string): MealInterpretation {
  const leaves = flattenComponents(meal.components)
  const current = leaves.find(c => c.id === id)
  if (!current) { return meal }
  const food = getFood(optionId)
  if (!food) { return meal }
  const g = current.grams > 0 ? current.grams : food.standardGrams
  const { quantity, unit } = quantityOf(g, current.unit === 'unidad' ? current.quantity : undefined)
  const next: MealComponent = {
    ...current,
    canonicalFoodId: food.id,
    displayName: food.label,
    grams: g,
    quantity,
    unit,
    macros: scaleMacros(food.per100, g),
    source: 'user',
    confidence: 0.95,
    options: undefined,
  }
  return withMeta(replaceComponent(meal.components, id, next), meal.originalText, meal.mealName, meal.hasExplicitAmount)
}

/** Quita un componente de la interpretación. */
export function dropComponent(meal: MealInterpretation, id: string): MealInterpretation | null {
  const components = removeComponent(meal.components, id)
  if (flattenComponents(components).length === 0) { return null }
  return withMeta(components, meal.originalText, meal.mealName, meal.hasExplicitAmount)
}

/** Reconstruye una interpretación a partir de componentes planos ya guardados. */
export function mealFromComponents(
  originalText: string,
  mealName: string,
  items: Array<{ foodId: string; label: string; grams: number; macros: Macros }>
): MealInterpretation {
  const components: MealComponent[] = items.map(i => {
    const food = getFood(i.foodId)
    // Reconstruye la unidad natural solo si los gramos son exactos múltiplos
    // del peso de una unidad (55 g = 1 pan); si no, se muestra en gramos.
    let quantity = i.grams
    let unit: MealUnit = 'g'
    if (food?.unitGrams && i.grams > 0 && i.grams % food.unitGrams === 0) {
      quantity = i.grams / food.unitGrams
      unit = 'unidad'
    }
    return {
      id: `comp-${i.foodId}`,
      type: 'ingredient' as MealComponentType,
      canonicalFoodId: food ? food.id : null,
      displayName: i.label,
      grams: i.grams,
      quantity,
      unit,
      quantityEstimated: false,
      confidence: 1,
      source: 'user' as MealComponentSource,
      macros: i.macros,
      options: food ? AMBIGUOUS_TERMS[food.id]?.options : undefined,
    }
  })
  return withMeta(components, originalText, mealName, true)
}

/** Etiqueta de cantidad para la revisión: "1 unidad estimada" / "30 g". */
export function componentQuantityLabel(c: MealComponent): string {
  if (c.unit === 'unidad') {
    const noun = c.quantity === 1 ? 'unidad' : 'unidades'
    const est = c.quantityEstimated ? (c.quantity === 1 ? ' estimada' : ' estimadas') : ''
    return `${c.quantity} ${noun}${est}`
  }
  return c.quantityEstimated ? `${c.quantity} g · cantidad estimada` : `${c.quantity} g`
}

/** El tipo resuelto, o el aviso explícito de ambigüedad. */
export function componentTypeLabel(c: MealComponent, ambiguities: MealAmbiguity[]): string {
  if (ambiguities.some(a => a.componentId === c.id)) { return 'tipo no especificado' }
  return c.type === 'dish' ? 'plato principal' : c.type
}
