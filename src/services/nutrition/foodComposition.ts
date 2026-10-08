import { stripAccents } from '@/utils/format'
// Composición de alimentos — tabla local de referencia, valores por 100 g.
//
// Estos valores son datos de referencia publiqueos (tablas composicion de
// alimentos, porcion cocida) y NO son datos inventados para rellenar la
// pantalla. Se usan cuando el usuario escribe una comida en texto libre y no
// hay ningun proveedor externo configurado: la app debe funcionar sin APIs externas.
//
// Formato: `per100` es el aporte de 100 g del alimento tal como se consume
// (cocido, sin aceite agregado salvo que el propio alimento lo incluya).
// `standardGrams` es la porcion estandar que se asume cuando el usuario no
// escribe cantidad. `unitGrams` solo existe en alimentos contables, para poder
// interpretar "2 huevos".

export interface Macros {
  calories: number
  proteins: number
  carbs: number
  fats: number
}

export interface FoodBase {
  id: string
  label: string
  per100: Macros
  /** sinonimos normalizados (sin acentos, minusculas) para interpretar texto */
  aliases: string[]
  /** porcion estandar asumida si el usuario no indica cantidad */
  standardGrams: number
  /** gramos de una unidad, solo para alimentos contables ("2 huevos") */
  unitGrams?: number
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Escala la composicion de 100 g a una cantidad concreta en gramos. */
export function scaleMacros(per100: Macros, grams: number): Macros {
  const f = grams / 100
  return {
    calories: Math.round(per100.calories * f),
    proteins: round1(per100.proteins * f),
    carbs: round1(per100.carbs * f),
    fats: round1(per100.fats * f),
  }
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce<Macros>(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      proteins: round1(acc.proteins + m.proteins),
      carbs: round1(acc.carbs + m.carbs),
      fats: round1(acc.fats + m.fats),
    }),
    { calories: 0, proteins: 0, carbs: 0, fats: 0 }
  )
}

export const FOODS: FoodBase[] = [
  {
    id: 'fideos',
    label: 'Fideos',
    per100: { calories: 158, proteins: 5.8, carbs: 30.9, fats: 0.9 },
    aliases: ['fideos', 'pasta', 'tallarines', 'espaguetis'],
    standardGrams: 180,
  },
  {
    id: 'arroz',
    label: 'Arroz',
    per100: { calories: 130, proteins: 2.7, carbs: 28.2, fats: 0.3 },
    aliases: ['arroz', 'arroz blanco'],
    standardGrams: 200,
  },
  {
    id: 'papa',    label: 'Papa',
    per100: { calories: 93, proteins: 2.5, carbs: 20.1, fats: 0.1 },
    aliases: ['papa', 'papas', 'patata'],
    standardGrams: 200,
  },
  {
    id: 'pure-papa',
    label: 'Puré de papa',
    per100: { calories: 100, proteins: 2, carbs: 18, fats: 3.5 },
    aliases: ['pure', 'pure de papa', 'pure de papas'],
    standardGrams: 200,
  },
  {
    id: 'carne-picada',
    label: 'Carne picada',
    per100: { calories: 215, proteins: 26, carbs: 0, fats: 11.8 },
    aliases: ['carne picada', 'carne molida', 'carne cortada', 'picada', 'molida'],
    standardGrams: 100,
  },
  {
    id: 'carne',
    label: 'Carne',
    per100: { calories: 190, proteins: 27, carbs: 0, fats: 9 },
    aliases: ['carne', 'bistec', 'pecheto', 'bondiola'],
    standardGrams: 120,
  },
  {
    id: 'pollo',
    label: 'Pollo',
    per100: { calories: 165, proteins: 31, carbs: 0, fats: 3.6 },
    aliases: ['pollo', 'pechuga de pollo', 'pechuga'],
    standardGrams: 120,
  },
  {
    id: 'salsa-tomate',
    label: 'Salsa de tomate',
    per100: { calories: 40, proteins: 1.2, carbs: 8, fats: 0.3 },
    aliases: ['salsa de tomate', 'tomate triturado', 'pure de tomate'],
    standardGrams: 120,
  },
  {
    id: 'cebolla',
    label: 'Cebolla',
    per100: { calories: 40, proteins: 1.1, carbs: 9.3, fats: 0.1 },
    aliases: ['cebolla', 'cebollas'],
    standardGrams: 30,
  },
  {
    id: 'zanahoria',
    label: 'Zanahoria',
    per100: { calories: 41, proteins: 0.9, carbs: 9.6, fats: 0.2 },
    aliases: ['zanahoria', 'zanahorias'],
    standardGrams: 50,
  },
  {
    id: 'queso-rallado',
    label: 'Queso rallado',
    per100: { calories: 402, proteins: 25, carbs: 1.3, fats: 33 },
    aliases: ['queso rallado', 'queso enhebrado'],
    standardGrams: 20,
  },
  {
    id: 'huevo',
    label: 'Huevo',
    per100: { calories: 155, proteins: 12.6, carbs: 1.1, fats: 10.6 },
    aliases: ['huevo', 'huevos'],
    standardGrams: 50,
    unitGrams: 50,
  },
  {
    id: 'pan-rallado',
    label: 'Pan rallado',
    per100: { calories: 395, proteins: 13, carbs: 71, fats: 5.3 },
    aliases: ['pan rallado', 'rallado', 'miga'],
    standardGrams: 30,
  },
  {
    id: 'aceite',
    label: 'Aceite',
    per100: { calories: 884, proteins: 0, carbs: 0, fats: 100 },
    aliases: ['aceite', 'aceite de oliva', 'aceite de coccion'],
    standardGrams: 8,
  },
  {
    id: 'lechuga',
    label: 'Lechuga',
    per100: { calories: 15, proteins: 1.4, carbs: 2.9, fats: 0.2 },
    aliases: ['lechuga', 'lechugas'],
    standardGrams: 100,
  },
  {
    id: 'tomate',
    label: 'Tomate',
    per100: { calories: 18, proteins: 0.9, carbs: 3.9, fats: 0.2 },
    aliases: ['tomate', 'tomates'],
    standardGrams: 150,
  },
  {
    id: 'yogur',
    label: 'Yogur',
    per100: { calories: 60, proteins: 3.5, carbs: 4.7, fats: 3.3 },
    aliases: ['yogur', 'yogurt', 'yoghur', 'yogur natural'],
    standardGrams: 200,
  },
  {
    id: 'banana',
    label: 'Banana',
    per100: { calories: 89, proteins: 1.1, carbs: 22.8, fats: 0.3 },
    aliases: ['banana', 'bananas', 'platano'],
    standardGrams: 100,
    unitGrams: 100,
  },
  {
    id: 'pan',
    label: 'Pan',
    per100: { calories: 265, proteins: 9, carbs: 49, fats: 3.2 },
    aliases: ['pan', 'pan blanco', 'marraqueta', 'flautitas'],
    standardGrams: 80,
  },
  {
    id: 'arroz-blanco-cocido-pilaf',
    label: 'Arroz pilaf',
    per100: { calories: 175, proteins: 4, carbs: 32, fats: 3.2 },
    aliases: ['pilaf', 'arroz pilaf'],
    standardGrams: 200,
  },
  // ── Comidas compuestas (recetario) ────────────────────────────────────────
  {
    id: 'pan-hamburguesa',
    label: 'Pan de hamburguesa',
    per100: { calories: 275, proteins: 9, carbs: 49, fats: 5 },
    aliases: ['pan de hamburguesa', 'pan hamburguesa', 'bun'],
    standardGrams: 55,
    unitGrams: 55,
  },
  {
    id: 'medallon-carne',
    label: 'Medallón de carne',
    per100: { calories: 250, proteins: 26, carbs: 0, fats: 16 },
    aliases: ['medallon', 'medallon de carne', 'carne de hamburguesa'],
    standardGrams: 110,
    unitGrams: 110,
  },
  {
    id: 'masa-pizza',
    label: 'Masa de pizza',
    per100: { calories: 260, proteins: 9, carbs: 50, fats: 3 },
    aliases: ['masa de pizza', 'masa pizza'],
    standardGrams: 150,
  },
  {
    id: 'masa-empanada',
    label: 'Masa de empanada',
    per100: { calories: 380, proteins: 8, carbs: 50, fats: 15 },
    aliases: ['masa de empanada', 'masa empanada', 'tapa de empanada'],
    standardGrams: 55,
  },
  {
    id: 'masa-hojaldre',
    label: 'Masa hojaldrada',
    per100: { calories: 440, proteins: 7, carbs: 45, fats: 25 },
    aliases: ['masa hojaldrada', 'masa de tarta', 'masa tarta', 'masa para tarta'],
    standardGrams: 60,
  },
  {
    id: 'jamon',
    label: 'Jamón',
    per100: { calories: 145, proteins: 21, carbs: 2, fats: 6 },
    aliases: ['jamon', 'jamon cocido', 'jamon de pavo'],
    standardGrams: 40,
  },
  // ── Quesos: el término generico "queso" queda SIN TIPO hasta que el usuario
  //    elija. Nunca se convierte solo en "queso rallado". ──────────────────
  {
    id: 'queso',
    label: 'Queso',
    per100: { calories: 300, proteins: 25, carbs: 2, fats: 21 },
    aliases: ['queso'],
    standardGrams: 30,
  },
  {
    id: 'mozzarella',
    label: 'Mozzarella',
    per100: { calories: 280, proteins: 28, carbs: 3, fats: 17 },
    aliases: ['mozzarella', 'muzzarella', 'queso mozzarella'],
    standardGrams: 30,
  },
  {
    id: 'cheddar',
    label: 'Cheddar',
    per100: { calories: 403, proteins: 25, carbs: 1, fats: 33 },
    aliases: ['cheddar'],
    standardGrams: 25,
  },
  {
    id: 'queso-crema',
    label: 'Queso cremoso',
    per100: { calories: 250, proteins: 6, carbs: 4, fats: 24 },
    aliases: ['queso cremoso', 'queso crema', 'queso untable', 'cream cheese'],
    standardGrams: 30,
  },
]

const BY_ID = new Map(FOODS.map(f => [f.id, f]))

export function getFood(id: string): FoodBase | undefined {
  return BY_ID.get(id)
}

/** Normaliza texto de entrada: minusculas, sin acentos, solo alfanumerico. */
export function normalizeDishText(text: string): string {
  return stripAccents(text.toLowerCase())
    // separa digitos de letras para que "200g" quede como dos tokens
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Busca el alimento cuyo alias aparece como palabra completa en el texto. */
export function findFoodInText(text: string): { food: FoodBase; alias: string } | null {
  const padded = ` ${text} `
  let best: { food: FoodBase; alias: string } | null = null
  for (const food of FOODS) {
    for (const alias of food.aliases) {
      if (!padded.includes(` ${alias} `)) { continue }
      if (!best || alias.length > best.alias.length) { best = { food, alias } }
    }
  }
  return best
}

/** Busca un alimento por su etiqueta o alias exacto. */
export function findFoodByLabel(label: string): FoodBase | undefined {
  const n = normalizeDishText(label)
  if (!n) { return undefined }
  for (const food of FOODS) {
    if (food.aliases.includes(n) || normalizeDishText(food.label) === n) { return food }
  }
  return undefined
}
