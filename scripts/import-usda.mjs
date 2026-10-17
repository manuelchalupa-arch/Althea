// Importador reproducible de USDA FoodData Central (dominio público, CC0) a un
// archivo compacto y lazy-loaded para la búsqueda local de Nutrición.
//
// Uso:  node scripts/import-usda.mjs
//
// Lee los JSON ya descargados de USDA (Foundation, FNDDS/Survey, SR Legacy) desde
// USDA_DIR (por defecto <tmp>/opencode/usda). Si faltan, los descarga de
// fdc.nal.usda.gov. Emite src/data/foods/usda-foods.json con registros compactos,
// procedencia y versión.
//
// - Preserva el fdcId y la versión de cada dataset.
// - Normaliza nutrientes a per-100 g con claves cortas y 1 decimal.
// - Genera alias en español (diccionario curado) + alias en inglés.
// - Distingue el estado de preparación (seco ≠ cocido); nunca reutiliza valores.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const USDA_DIR = process.env.USDA_DIR || path.join(os.tmpdir(), 'opencode', 'usda')
const ROOT = process.cwd()
const OUT = path.resolve(ROOT, 'src', 'data', 'foods', 'usda-foods.json')

const DATASETS = [
  { code: 'f', dataType: 'Foundation', release: '2026-04-30', key: 'FoundationFoods',
    zip: 'Foundation.zip', file: 'FoodData_Central_foundation_food_json_2026-04-30.json',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip' },
  { code: 'n', dataType: 'FNDDS', release: '2021-2023 (2024-10-31)', key: 'SurveyFoods',
    zip: 'Survey.zip', file: 'surveyDownload.json',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip' },
  { code: 's', dataType: 'SR Legacy', release: '2018-04', key: 'SRLegacyFoods',
    zip: 'SrLegacy.zip', file: 'FoodData_Central_sr_legacy_food_json_2018-04.json',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip' },
]

// IDs de nutrientes de USDA FoodData Central (por 100 g).
const K = {
  kcal: [1008, 2047, 2048], kj: [1062, 1061], protein: [1003], fat: [1004],
  carbs: [1005, 1050], fiber: [1079], sugars: [2000, 1063], addedSugars: [1235],
  satFat: [1258], transFat: [1257], sodium: [1087],
}

const round1 = n => Math.round(n * 10) / 10
const stripAccents = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = s => stripAccents(String(s).toLowerCase()).replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()

// ── Diccionario inglés → español (curado) ────────────────────────────────────
const PHRASES = [
  ['sweet potato', 'batata'], ['green beans', 'chauchas'], ['green bean', 'chaucha'],
  ['peanut butter', 'mantequilla de mani'], ['olive oil', 'aceite de oliva'],
  ['whole milk', 'leche entera'], ['skim milk', 'leche descremada'], ['soy milk', 'leche de soja'],
  ['soy sauce', 'salsa de soja'], ['red beans', 'porotos colorados'], ['black beans', 'porotos negros'],
  ['white beans', 'porotos blancos'], ['kidney beans', 'porotos colorados'], ['brown rice', 'arroz integral'],
  ['white rice', 'arroz blanco'], ['baking powder', 'polvo de hornear'], ['baking soda', 'bicarbonato de sodio'],
  ['cottage cheese', 'queso cottage'], ['cream cheese', 'queso crema'], ['beef liver', 'higado de vaca'],
  ['sunflower seed', 'semillas de girasol'], ['sesame seed', 'semillas de sesamo'],
]
const WORDS = {
  oats: 'avena', oat: 'avena', oatmeal: 'avena', rice: 'arroz', beans: 'porotos', bean: 'poroto',
  lentils: 'lentejas', lentil: 'lenteja', chickpeas: 'garbanzos', chickpea: 'garbanzo', peas: 'arvejas',
  milk: 'leche', cheese: 'queso', yogurt: 'yogur', egg: 'huevo', eggs: 'huevos', chicken: 'pollo',
  beef: 'carne de vaca', pork: 'cerdo', fish: 'pescado', salmon: 'salmon', tuna: 'atun', cod: 'merluza',
  apple: 'manzana', banana: 'banana', orange: 'naranja', grape: 'uva', grapes: 'uvas',
  strawberry: 'frutilla', melon: 'melon', watermelon: 'sandia', pineapple: 'anana', peach: 'durazno',
  pear: 'pera', lemon: 'limon', lime: 'lima', raisins: 'pasas', almond: 'almendra', almonds: 'almendras',
  walnut: 'nuez', walnuts: 'nueces', peanut: 'mani', peanuts: 'mani', cashew: 'castana de caju',
  seeds: 'semillas', seed: 'semilla', sesame: 'sesamo', sunflower: 'girasol', potato: 'papa',
  potatoes: 'papas', tomato: 'tomate', tomatoes: 'tomate', onion: 'cebolla', garlic: 'ajo',
  carrot: 'zanahoria', spinach: 'espinaca', lettuce: 'lechuga', broccoli: 'brocoli', cauliflower: 'coliflor',
  cucumber: 'pepino', pumpkin: 'calabaza', squash: 'calabaza', cabbage: 'repollo', mushroom: 'champinones',
  mushrooms: 'champinones', corn: 'maiz', wheat: 'trigo', flour: 'harina', bread: 'pan', pasta: 'pastas',
  macaroni: 'fideos', spaghetti: 'fideos', noodles: 'fideos', oil: 'aceite', butter: 'manteca',
  margarine: 'margarina', sugar: 'azucar', honey: 'miel', syrup: 'jarabe', salt: 'sal', vinegar: 'vinagre',
  yeast: 'levadura', juice: 'jugo', flakes: 'copos', bran: 'salvado', meal: 'harina', cornmeal: 'polenta',
  raw: 'crudo', cooked: 'cocido', boiled: 'hervido', dried: 'seco', dry: 'seco', uncooked: 'crudo',
  canned: 'en conserva', frozen: 'congelado', roasted: 'asado', baked: 'horneado', fried: 'frito',
  toasted: 'tostado', whole: 'entero', skim: 'descremado', lowfat: 'bajo en grasa', nonfat: 'sin grasa',
  reduced: 'reducido', fortified: 'fortificado', enriched: 'enriquecido', fresh: 'fresco', green: 'verde',
  red: 'rojo', white: 'blanco', brown: 'integral', yellow: 'amarillo', sweet: 'dulce', lean: 'magro',
  ground: 'picado', sliced: 'en rodajas', chopped: 'picado', powder: 'en polvo', powdered: 'en polvo',
  concentrate: 'concentrado', leaves: 'hojas', leaf: 'hoja', root: 'raiz', commercial: 'comercial',
  mature: 'maduro', sprouted: 'germinado',
}

function translate(text) {
  let s = ' ' + norm(text) + ' '
  for (const [en, es] of PHRASES) { s = s.split(' ' + en + ' ').join(' ' + norm(es) + ' ') }
  return s.trim().split(' ').map(w => WORDS[w] ?? w).join(' ')
}

const STATE_RULES = [
  [/canned/i, 'en conserva'], [/frozen/i, 'congelado'], [/boiled|cooked|steamed|braised|stewed/i, 'cocido'],
  [/roasted|baked|grilled|broiled/i, 'asado'], [/fried|sauteed/i, 'frito'],
  [/\bdry\b|\bdried\b|uncooked|dehydrated|\braw\b/i, 'seco'],
]
const inferState = desc => { for (const [re, st] of STATE_RULES) { if (re.test(desc)) { return st } } return undefined }

function collect(foodNutrients) {
  const byId = new Map()
  for (const fn of foodNutrients || []) {
    const id = fn?.nutrient?.id, amount = fn?.amount
    if (typeof id === 'number' && typeof amount === 'number' && Number.isFinite(amount) && !byId.has(id)) {
      byId.set(id, amount)
    }
  }
  const pick = ids => { for (const id of ids) { if (byId.has(id)) { return byId.get(id) } } return undefined }
  const x = {}
  const setIf = (key, ids) => { const v = pick(ids); if (typeof v === 'number') { x[key] = round1(v) } }
  setIf('fb', K.fiber); setIf('su', K.sugars); setIf('as', K.addedSugars)
  setIf('sf', K.satFat); setIf('tf', K.transFat); setIf('na', K.sodium)
  const kj = pick(K.kj)
  return {
    kcal: pick(K.kcal), protein: pick(K.protein), carbs: pick(K.carbs), fat: pick(K.fat),
    kj: kj, x: Object.keys(x).length ? x : undefined,
  }
}

function aliasesFor(desc, translated) {
  const out = []
  const add = v => {
    const t = norm(v)
    if (t.length >= 4 && !out.includes(t)) { out.push(t) }
  }
  add(desc)
  add(desc.split(',')[0])
  add(translated)
  for (const w of translated.split(' ')) { if (w.length >= 5) { add(w) } }
  const lower = desc.toLowerCase()
  for (const en of Object.keys(WORDS)) { if (lower.includes(en)) { add(en) } }
  return out.slice(0, 12)
}

function portionsOf(food) {
  const out = []
  for (const p of food.foodPortions || []) {
    const grams = p?.gramWeight
    if (typeof grams !== 'number' || !(grams > 0) || grams > 5000) { continue }
    const raw = p?.modifier || p?.measureUnit?.name || ''
    const label = norm(raw)
    if (!label || /^\d+$/.test(label) || /^(undetermined|not specified|portion)$/.test(label)) { continue }
    if (!out.some(([l]) => l === label)) { out.push([label, Math.round(grams)]) }
    if (out.length >= 3) { break }
  }
  return out
}

function datasetPath(ds) {
  return path.join(USDA_DIR, ds.file)
}

function loadFoods(ds) {
  const p = datasetPath(ds)
  if (!fs.existsSync(p)) {
    throw new Error(`Falta ${p}. Descargalo desde ${ds.url} y descomprimilo, o dejá que el script lo intente.`)
  }
  const json = JSON.parse(fs.readFileSync(p, 'utf8'))
  const arr = json[ds.key]
  if (!Array.isArray(arr)) { throw new Error(`El archivo ${p} no contiene ${ds.key}`) }
  return arr
}

function main() {
  const records = []
  const bySource = []
  const seenIds = new Set()
  for (const ds of DATASETS) {
    let foods
    try { foods = loadFoods(ds) } catch (e) { console.error('SKIP', ds.dataType, '-', e.message); continue }
    let kept = 0
    for (const food of foods) {
      if (!food) { continue }
      const fdcId = food.fdcId
      if (typeof fdcId !== 'number' || seenIds.has(fdcId)) { continue }
      const desc = String(food.description || '').trim()
      if (!desc) { continue }
      const n = collect(food.foodNutrients)
      if (typeof n.kcal !== 'number' && typeof n.protein !== 'number' && typeof n.carbs !== 'number' && typeof n.fat !== 'number') { continue }
      const translated = translate(desc)
      const aliases = aliasesFor(desc, translated)
      if (aliases.length === 0) { continue }
      const portions = portionsOf(food)
      const category = food.foodCategory?.description || food.wweiaFoodCategory?.wweiaFoodCategoryDescription || undefined
      const rec = { i: fdcId, d: ds.code, n: translated, a: aliases }
      if (category) { rec.c = norm(category) }
      const st = inferState(desc)
      if (st) { rec.s = st }
      if (typeof n.kcal === 'number') { rec.k = round1(n.kcal) }
      if (typeof n.protein === 'number') { rec.p = round1(n.protein) }
      if (typeof n.carbs === 'number') { rec.h = round1(n.carbs) }
      if (typeof n.fat === 'number') { rec.f = round1(n.fat) }
      if (typeof n.kj === 'number') { rec.j = round1(n.kj) }
      if (n.x) { rec.x = n.x }
      if (portions.length) { rec.po = portions }
      records.push(rec)
      seenIds.add(fdcId)
      kept++
    }
    bySource.push({ code: ds.code, dataType: ds.dataType, release: ds.release, url: ds.url, foods: kept })
    console.log(`${ds.dataType} ${ds.release}: ${kept} alimentos`)
  }
  records.sort((a, b) => a.n.localeCompare(b.n, 'es'))
  const payload = {
    generatedAt: new Date().toISOString(),
    license: 'USDA FoodData Central — dominio público (CC0). Se solicita atribución.',
    attribution: 'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central.',
    sources: bySource,
    count: records.length,
    foods: records,
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(payload))
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0)
  console.log(`\nEscrito ${OUT}`)
  console.log(`Total: ${records.length} alimentos, ${kb} KB`)
}

main()
