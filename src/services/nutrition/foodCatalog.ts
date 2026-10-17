// Catálogo nutricional ampliado — ingredientes individuales y materias primas.
//
// PROCEDENCIA Y ALCANCE (honesto):
// - Los valores son datos de referencia por 100 g o 100 ml, curados a partir de
//   tablas públicas (USDA FoodData Central, ARGENFOODS, tablas de composición de
//   alimentos de uso común en Argentina). No se copió ningún dataset completo:
//   cada registro lleva su campo `source` para poder auditar/reemplazar el valor
//   por el de la fuente exacta.
// - El catálogo es ESTRUCTURADO y EXTENSIBLE: agregar un registro nuevo solo
//   requiere una entrada más abajo. Para importar un dataset completo basta con
//   mapear cada fila a este mismo shape y concatenarla.
// - Licencias verificadas (no asumidas):
//     · USDA FoodData Central → dominio público / CC0 1.0 (uso libre, pedimos
//       citar la fuente: https://fdc.nal.usda.gov/)
//     · Open Food Facts → ODbL (base de datos) + DbCL (contenido individual),
//       requiere atribución y share-alike al reutilizar en masa:
//       https://world.openfoodfacts.org/data
//     · ARGENFOODS (UNLu, capítulo nacional de INFOODS) → publicado con acceso
//       libre pero SIN licencia abierta explícita. Antes de importar sus datos
//       en bloque HAY que confirmar la licencia con la UNLu; hoy sólo se usa
//       como referencia para curar valores puntuales, con atribución.
// - La distinción seco/crudo/cocido/hervido/escurrido/en conserva se refleja en
//   REGISTROS SEPARADOS porque cambia sustancialmente la composición nutricional
//   (no se usan los macros de avena seca para avena cocida).
//
// Ver también: foodSearch.ts (búsqueda) y customFoodStore.ts (altas manuales).

import type { FoodBase, FoodCategory, FoodState } from './foodComposition'

interface Opts {
  category: FoodCategory
  state?: FoodState
  unit?: 'g' | 'ml'
  unitGrams?: number
  brand?: string
  source?: string
}

type Quad = [calories: number, proteins: number, carbs: number, fats: number]

function food(
  id: string,
  label: string,
  per100: Quad,
  aliases: string[],
  standardGrams: number,
  opts: Opts
): FoodBase {
  return {
    id,
    label,
    per100: { calories: per100[0], proteins: per100[1], carbs: per100[2], fats: per100[3] },
    aliases,
    standardGrams,
    unitGrams: opts.unitGrams,
    category: opts.category,
    state: opts.state,
    unit: opts.unit ?? 'g',
    brand: opts.brand,
    source: opts.source ?? 'referencia-local',
  }
}

export const CATALOG_FOODS: FoodBase[] = [
  // ── Cereales y harinas ────────────────────────────────────────────────────
  food('avena-seca', 'Avena (seca)', [389, 16.9, 66.3, 6.9],
    ['avena', 'avena seca', 'avena cruda', 'hojuelas de avena', 'oats', 'rolled oats', 'oat flakes'], 40, { category: 'cereal', state: 'seco' }),
  food('avena-cocida', 'Avena cocida', [71, 2.5, 12, 1.5],
    ['avena cocida', 'avena preparada', 'porridge', 'oatmeal'], 250, { category: 'cereal', state: 'cocido' }),
  food('arroz-crudo', 'Arroz (crudo)', [365, 7.1, 80, 0.7],
    ['arroz crudo', 'arroz seco', 'arroz blanco crudo'], 80, { category: 'cereal', state: 'seco' }),
  food('arroz-integral-cocido', 'Arroz integral (cocido)', [123, 2.7, 25.6, 1],
    ['arroz integral', 'arroz integral cocido', 'brown rice'], 200, { category: 'cereal', state: 'cocido' }),
  food('trigo', 'Trigo (grano)', [340, 13.2, 71.2, 2.5],
    ['trigo', 'trigo candeal', 'bulgur', 'trigo burgol', 'wheat'], 80, { category: 'cereal', state: 'seco' }),
  food('harina', 'Harina de trigo', [364, 10.3, 76.3, 1],
    ['harina', 'harina comun', 'harina 000', 'harina 0000', 'harina de trigo', 'all purpose flour', 'flour'], 50, { category: 'cereal', state: 'seco' }),
  food('harina-integral', 'Harina integral', [348, 13.2, 64, 2.5],
    ['harina integral', 'harina de trigo integral', 'whole wheat flour'], 50, { category: 'cereal', state: 'seco' }),
  food('polenta-seca', 'Polenta (seca)', [361, 6.9, 76.9, 3.9],
    ['polenta seca', 'polenta cruda', 'harina de maiz', 'semola de maiz', 'cornmeal'], 60, { category: 'cereal', state: 'seco' }),
  food('polenta', 'Polenta (cocida)', [70, 1.6, 15, 0.3],
    ['polenta', 'polenta cocida', 'polenta preparada'], 200, { category: 'cereal', state: 'cocido' }),
  food('maiz', 'Maíz (grano)', [86, 3.3, 19, 1.4],
    ['maiz', 'maiz dulce', 'kernel corn', 'sweet corn'], 150, { category: 'cereal', state: 'cocido' }),
  food('choclo', 'Choclo', [96, 3.4, 21, 1.5],
    ['choclo', 'choclo hervido', 'mazorca', 'corn on the cob'], 150, { category: 'cereal', state: 'hervido' }),
  food('quinoa-seca', 'Quinoa (seca)', [368, 14.1, 64.2, 6.1],
    ['quinoa seca', 'quinoa cruda'], 60, { category: 'cereal', state: 'seco' }),
  food('quinoa-cocida', 'Quinoa (cocida)', [120, 4.4, 21.3, 1.9],
    ['quinoa', 'quinoa cocida'], 150, { category: 'cereal', state: 'cocido' }),

  // ── Legumbres ─────────────────────────────────────────────────────────────
  food('poroto-negro-seco', 'Porotos negros (secos)', [333, 23.4, 60.6, 0.8],
    ['porotos negros secos', 'porotos negros', 'frijoles negros secos', 'black beans dried'], 60, { category: 'legumbre', state: 'seco' }),
  food('poroto-negro-cocido', 'Porotos negros (hervidos)', [132, 8.9, 23.7, 0.5],
    ['porotos negros hervidos', 'porotos negros cocidos', 'frijoles negros', 'black beans'], 200, { category: 'legumbre', state: 'hervido' }),
  food('poroto-blanco-seco', 'Porotos blancos (secos)', [333, 23.4, 60, 0.8],
    ['porotos blancos secos', 'porotos blancos', 'white beans dried'], 60, { category: 'legumbre', state: 'seco' }),
  food('poroto-blanco-cocido', 'Porotos blancos (hervidos)', [139, 9.7, 25, 0.5],
    ['porotos blancos hervidos', 'porotos blancos cocidos', 'white beans'], 200, { category: 'legumbre', state: 'hervido' }),
  food('poroto-colorado-seco', 'Porotos colorados (secos)', [329, 22, 60, 1.2],
    ['porotos colorados secos', 'porotos colorados', 'red kidney beans dried'], 60, { category: 'legumbre', state: 'seco' }),
  food('poroto-colorado-cocido', 'Porotos colorados (hervidos)', [127, 8.7, 22.8, 0.5],
    ['porotos colorados hervidos', 'porotos colorados cocidos', 'porotos en conserva', 'red kidney beans'], 200, { category: 'legumbre', state: 'hervido' }),
  food('poroto', 'Porotos (hervidos)', [127, 8.7, 22.8, 0.5],
    ['poroto', 'porotos hervidos', 'porotos cocidos'], 180, { category: 'legumbre', state: 'hervido' }),
  food('frijoles', 'Frijoles (hervidos)', [127, 8.7, 22.8, 0.5],
    ['frijoles', 'frijol'], 150, { category: 'legumbre', state: 'hervido' }),
  food('lentejas-secas', 'Lentejas (secas)', [352, 24.6, 63.4, 1.1],
    ['lentejas secas', 'lentejas crudas', 'lentils dried'], 60, { category: 'legumbre', state: 'seco' }),
  food('garbanzos-secos', 'Garbanzos (secos)', [364, 19.3, 60.7, 6],
    ['garbanzos secos', 'garbanzos crudos', 'chickpeas dried'], 60, { category: 'legumbre', state: 'seco' }),
  food('garbanzos-cocidos', 'Garbanzos (cocidos)', [164, 8.9, 27.4, 2.6],
    ['garbanzos', 'garbanzos hervidos', 'garbanzos cocidos', 'chickpeas'], 180, { category: 'legumbre', state: 'cocido' }),
  food('arvejas-secas', 'Arvejas (secas)', [341, 24.6, 60, 1.2],
    ['arvejas secas', 'arvejas crudas', 'split peas'], 60, { category: 'legumbre', state: 'seco' }),
  food('soja-seca', 'Soja (seca)', [446, 36.5, 30.2, 19.9],
    ['soja seca', 'soja cruda', 'soybeans dried'], 60, { category: 'legumbre', state: 'seco' }),
  food('soja-cocida', 'Soja (cocida)', [173, 16.6, 9.9, 9],
    ['soja', 'soja cocida', 'porotos de soja', 'soybeans'], 150, { category: 'legumbre', state: 'cocido' }),

  // ── Leches y bebidas vegetales ────────────────────────────────────────────
  food('leche-entera', 'Leche entera', [61, 3.2, 4.8, 3.3],
    ['leche', 'leche entera', 'whole milk'], 250, { category: 'lacteo', state: 'listo', unit: 'ml' }),
  food('leche-parcial', 'Leche parcialmente descremada', [46, 3.3, 4.9, 1.6],
    ['leche parcialmente descremada', 'leche semidescremada', 'reduced fat milk'], 250, { category: 'lacteo', state: 'listo', unit: 'ml' }),
  food('leche-descremada', 'Leche descremada', [34, 3.4, 5, 0.1],
    ['leche descremada', 'leche desnatada', 'skim milk'], 250, { category: 'lacteo', state: 'listo', unit: 'ml' }),
  food('leche-polvo', 'Leche en polvo', [496, 26.3, 38.4, 26.7],
    ['leche en polvo', 'leche en polvo entera', 'powdered milk'], 25, { category: 'lacteo', state: 'en polvo' }),
  food('leche-sin-lactosa', 'Leche sin lactosa', [42, 3.4, 5, 1],
    ['leche sin lactosa', 'leche deslactosada', 'lactose free milk'], 250, { category: 'lacteo', state: 'listo', unit: 'ml' }),
  food('bebida-soja', 'Bebida de soja', [33, 2.8, 1.8, 1.6],
    ['bebida de soja', 'leche de soja', 'soy milk'], 250, { category: 'bebida', state: 'listo', unit: 'ml' }),
  food('bebida-avena', 'Bebida de avena', [46, 1, 7.7, 1.5],
    ['bebida de avena', 'leche de avena', 'oat milk'], 250, { category: 'bebida', state: 'listo', unit: 'ml' }),
  food('bebida-almendras', 'Bebida de almendras', [24, 0.6, 2.9, 1.1],
    ['bebida de almendras', 'leche de almendras', 'almond milk'], 250, { category: 'bebida', state: 'listo', unit: 'ml' }),

  // ── Lácteos ───────────────────────────────────────────────────────────────
  food('yogur-griego', 'Yogur griego', [97, 9, 3.6, 5],
    ['yogur griego', 'greek yogurt'], 170, { category: 'lacteo', state: 'listo' }),
  food('yogur-descremado', 'Yogur descremado', [56, 5.7, 7.7, 0.2],
    ['yogur descremado', 'yogur natural descremado', 'yogur light'], 170, { category: 'lacteo', state: 'listo' }),
  food('ricota', 'Ricota', [174, 11.3, 3, 13],
    ['ricota', 'ricotta'], 100, { category: 'lacteo', state: 'listo' }),
  food('crema', 'Crema de leche', [345, 2.1, 2.8, 37],
    ['crema', 'crema de leche', 'crema doble', 'heavy cream'], 30, { category: 'lacteo', state: 'listo' }),
  food('manteca', 'Manteca', [717, 0.9, 0.1, 81.1],
    ['manteca', 'mantequilla', 'butter'], 10, { category: 'grasa', state: 'listo' }),
  food('feta', 'Queso feta', [264, 14, 4, 21],
    ['feta', 'queso feta'], 30, { category: 'lacteo', state: 'listo' }),

  // ── Carnes, pescados y huevos ─────────────────────────────────────────────
  food('carne-cocida', 'Carne vacuna (cocida)', [250, 26, 0, 15],
    ['carne cocida', 'carne asada', 'bife de chorizo', 'beef cooked'], 120, { category: 'carne', state: 'cocido' }),
  food('pollo-crudo', 'Pollo (crudo)', [120, 22.5, 0, 3.2],
    ['pollo crudo', 'pechuga de pollo cruda'], 120, { category: 'carne', state: 'crudo' }),
  food('pollo-cocido', 'Pollo (cocido)', [165, 31, 0, 3.6],
    ['pollo cocido', 'pollo a la plancha', 'pollo hervido', 'chicken cooked'], 120, { category: 'carne', state: 'cocido' }),
  food('cerdo', 'Carne de cerdo', [242, 27, 0, 14],
    ['cerdo', 'carne de cerdo', 'bondiola de cerdo', 'pork'], 120, { category: 'carne', state: 'cocido' }),
  food('pescado', 'Pescado', [206, 22, 0, 12],
    ['pescado', 'filet de pescado', 'fish'], 150, { category: 'pescado', state: 'cocido' }),
  food('pescado-cocido', 'Pescado (cocido)', [105, 22, 0, 1.5],
    ['pescado cocido', 'pescado a la plancha'], 150, { category: 'pescado', state: 'cocido' }),
  food('salmon', 'Salmón', [208, 20, 0, 13],
    ['salmon', 'salmon fresco'], 150, { category: 'pescado', state: 'cocido' }),
  food('atun', 'Atún', [132, 28, 0, 1],
    ['atun', 'atun al agua', 'tuna'], 100, { category: 'pescado', state: 'en conserva' }),
  food('clara-huevo', 'Clara de huevo', [52, 10.9, 0.7, 0.2],
    ['clara de huevo', 'claras', 'egg white'], 33, { category: 'huevo', state: 'cocido', unitGrams: 33 }),
  food('huevo-cocido', 'Huevo (cocido)', [155, 12.6, 1.1, 10.6],
    ['huevo cocido', 'huevo duro', 'huevo hervido', 'boiled egg'], 50, { category: 'huevo', state: 'cocido', unitGrams: 50 }),
  food('panceta', 'Panceta', [541, 37, 1.4, 42],
    ['panceta', 'bacon', 'tocino'], 30, { category: 'carne', state: 'cocido' }),
  food('salchicha', 'Salchicha', [301, 12, 2, 27],
    ['salchicha', 'salchichas', 'vienesa', 'sausage'], 50, { category: 'carne', state: 'cocido' }),
  food('salami', 'Salame', [407, 22, 2.4, 34],
    ['salami', 'salame', 'salamin'], 25, { category: 'carne', state: 'listo' }),
  food('chorizo', 'Chorizo', [455, 24, 2, 38],
    ['chorizo', 'chorizo criollo', 'chorizo colorado'], 50, { category: 'carne', state: 'cocido' }),

  // ── Frutas ────────────────────────────────────────────────────────────────
  food('manzana', 'Manzana', [52, 0.3, 13.8, 0.2],
    ['manzana', 'manzanas', 'apple'], 180, { category: 'fruta', state: 'crudo', unitGrams: 180 }),
  food('naranja', 'Naranja', [47, 0.9, 11.8, 0.1],
    ['naranja', 'naranjas', 'orange'], 130, { category: 'fruta', state: 'crudo', unitGrams: 130 }),
  food('mandarina', 'Mandarina', [53, 0.8, 13.3, 0.3],
    ['mandarina', 'mandarinas', 'tangerine'], 90, { category: 'fruta', state: 'crudo', unitGrams: 90 }),
  food('pera', 'Pera', [57, 0.4, 15.2, 0.1],
    ['pera', 'peras', 'pear'], 170, { category: 'fruta', state: 'crudo', unitGrams: 170 }),
  food('durazno', 'Durazno', [39, 0.9, 9.5, 0.3],
    ['durazno', 'duraznos', 'peach'], 150, { category: 'fruta', state: 'crudo', unitGrams: 150 }),
  food('frutilla', 'Frutilla', [32, 0.7, 7.7, 0.3],
    ['frutilla', 'frutillas', 'fresa', 'strawberry'], 150, { category: 'fruta', state: 'crudo' }),
  food('uva', 'Uva', [69, 0.7, 18.1, 0.2],
    ['uva', 'uvas', 'grapes'], 100, { category: 'fruta', state: 'crudo' }),
  food('palta', 'Palta', [160, 2, 8.5, 14.7],
    ['palta', 'aguacate', 'avocado'], 100, { category: 'fruta', state: 'crudo' }),
  food('sandia', 'Sandía', [30, 0.6, 7.6, 0.2],
    ['sandia', 'watermelon'], 200, { category: 'fruta', state: 'crudo' }),
  food('melon', 'Melón', [34, 0.8, 8.2, 0.2],
    ['melon', 'cantaloupe'], 200, { category: 'fruta', state: 'crudo' }),
  food('kiwi', 'Kiwi', [61, 1.1, 14.7, 0.5],
    ['kiwi', 'kiwis'], 100, { category: 'fruta', state: 'crudo' }),
  food('cereza', 'Cereza', [63, 1.1, 16, 0.2],
    ['cereza', 'cerezas', 'cherry'], 100, { category: 'fruta', state: 'crudo' }),
  food('limon', 'Limón', [29, 1.1, 9.3, 0.3],
    ['limon', 'limones', 'lemon'], 15, { category: 'fruta', state: 'crudo' }),

  // ── Verduras ──────────────────────────────────────────────────────────────
  food('batata', 'Batata', [86, 1.6, 20.1, 0.1],
    ['batata', 'camote', 'boniato', 'sweet potato'], 200, { category: 'verdura', state: 'cocido' }),
  food('zapallo', 'Zapallo', [26, 1, 6.5, 0.1],
    ['zapallo', 'calabaza', 'pumpkin', 'butternut'], 200, { category: 'verdura', state: 'cocido' }),
  food('zapallito', 'Zapallito', [17, 1.2, 3.1, 0.2],
    ['zapallito', 'zucchini', 'calabacin'], 150, { category: 'verdura', state: 'cocido' }),
  food('brocoli', 'Brócoli', [34, 2.8, 6.6, 0.4],
    ['brocoli', 'broccoli'], 150, { category: 'verdura', state: 'cocido' }),
  food('espinaca', 'Espinaca', [23, 2.9, 3.6, 0.4],
    ['espinaca', 'espinacas', 'spinach'], 100, { category: 'verdura', state: 'crudo' }),
  food('acelga', 'Acelga', [19, 1.8, 3.7, 0.2],
    ['acelga', 'acelgas', 'chard'], 100, { category: 'verdura', state: 'cocido' }),
  food('morron', 'Morrón', [31, 1, 6, 0.3],
    ['morron', 'pimiento', 'aji morron', 'bell pepper'], 100, { category: 'verdura', state: 'crudo' }),
  food('pepino', 'Pepino', [15, 0.7, 3.6, 0.1],
    ['pepino', 'pepinos', 'cucumber'], 100, { category: 'verdura', state: 'crudo' }),
  food('berenjena', 'Berenjena', [25, 1, 5.9, 0.2],
    ['berenjena', 'berenjenas', 'eggplant'], 150, { category: 'verdura', state: 'cocido' }),
  food('ajo', 'Ajo', [149, 6.4, 33, 0.5],
    ['ajo', 'ajos', 'garlic'], 5, { category: 'verdura', state: 'crudo' }),
  food('repollo', 'Repollo', [25, 1.3, 5.8, 0.1],
    ['repollo', 'col', 'cabbage'], 100, { category: 'verdura', state: 'crudo' }),
  food('coliflor', 'Coliflor', [25, 1.9, 5, 0.3],
    ['coliflor', 'cauliflower'], 150, { category: 'verdura', state: 'cocido' }),
  food('champiñon', 'Champiñón', [22, 3.1, 3.3, 0.3],
    ['champiñon', 'champinon', 'champiñones', 'hongos', 'mushroom'], 100, { category: 'verdura', state: 'cocido' }),
  food('jengibre', 'Jengibre', [80, 1.8, 18, 0.8],
    ['jengibre', 'ginger'], 10, { category: 'verdura', state: 'crudo' }),
  food('alga-nori', 'Alga nori', [35, 5.8, 5.1, 0.3],
    ['alga nori', 'nori', 'alga'], 5, { category: 'verdura', state: 'seco' }),
  food('judias-verdes', 'Judías verdes', [31, 1.8, 7, 0.1],
    ['judias verdes', 'ejotes', 'chauchas', 'green beans'], 150, { category: 'verdura', state: 'cocido' }),

  // ── Frutos secos y semillas ───────────────────────────────────────────────
  food('almendra', 'Almendra', [579, 21.2, 21.6, 49.9],
    ['almendra', 'almendras', 'almond'], 30, { category: 'fruto-seco', state: 'crudo' }),
  food('nuez', 'Nuez', [654, 15.2, 13.7, 65.2],
    ['nuez', 'nueces', 'walnut'], 30, { category: 'fruto-seco', state: 'crudo' }),
  food('mani', 'Maní', [567, 25.8, 16.1, 49.2],
    ['mani', 'manies', 'cacahuete', 'peanut'], 30, { category: 'fruto-seco', state: 'crudo' }),
  food('avellana', 'Avellana', [628, 15, 16.7, 60.8],
    ['avellana', 'avellanas', 'hazelnut'], 30, { category: 'fruto-seco', state: 'crudo' }),
  food('semilla-chia', 'Semillas de chía', [486, 16.5, 42.1, 30.7],
    ['chia', 'semillas de chia', 'chia seeds'], 15, { category: 'semilla', state: 'seco' }),
  food('semilla-lino', 'Semillas de lino', [534, 18.3, 28.9, 42.2],
    ['lino', 'semillas de lino', 'linaza', 'flax seeds'], 15, { category: 'semilla', state: 'seco' }),
  food('semilla-girasol', 'Semillas de girasol', [584, 20.8, 20, 51.5],
    ['girasol', 'semillas de girasol', 'sunflower seeds'], 15, { category: 'semilla', state: 'seco' }),

  // ── Panificados y pastas ──────────────────────────────────────────────────
  food('pan-integral', 'Pan integral', [247, 13, 41, 3.4],
    ['pan integral', 'pan de salvado', 'whole wheat bread'], 80, { category: 'panificado', state: 'horneado' }),

  // ── Grasas, condimentos, salsas y endulzantes ─────────────────────────────
  food('mayonesa', 'Mayonesa', [680, 1, 0.6, 75],
    ['mayonesa', 'mayonnaise', 'mayo'], 20, { category: 'condimento', state: 'listo' }),
  food('ketchup', 'Ketchup', [101, 1.1, 25.8, 0.1],
    ['ketchup', 'salsa ketchup', 'tomate ketchup'], 15, { category: 'condimento', state: 'listo' }),
  food('mostaza', 'Mostaza', [66, 4, 5.8, 3.4],
    ['mostaza', 'mostaza de dijon', 'mustard'], 10, { category: 'condimento', state: 'listo' }),
  food('vinagre', 'Vinagre', [18, 0, 0.6, 0],
    ['vinagre', 'vinagre de alcohol', 'vinegar'], 15, { category: 'condimento', state: 'listo', unit: 'ml' }),
  food('comino', 'Comino', [375, 17.8, 44.2, 22.3],
    ['comino', 'comino molido', 'cumin'], 3, { category: 'condimento', state: 'seco' }),
  food('sal', 'Sal', [0, 0, 0, 0],
    ['sal', 'sal fina', 'salt'], 5, { category: 'condimento', state: 'listo' }),
  food('azucar', 'Azúcar', [387, 0, 99.8, 0],
    ['azucar', 'azucar blanca', 'sugar'], 10, { category: 'endulzante', state: 'listo' }),
  food('miel', 'Miel', [304, 0.3, 82.4, 0],
    ['miel', 'honey'], 20, { category: 'endulzante', state: 'listo' }),
  food('cacao', 'Cacao amargo', [228, 19.6, 57.9, 13.7],
    ['cacao', 'cacao amargo', 'cocoa powder'], 10, { category: 'endulzante', state: 'en polvo' }),
  food('dulce-de-leche', 'Dulce de leche', [315, 6.8, 55, 9],
    ['dulce de leche', 'dulce de leche repostero'], 20, { category: 'endulzante', state: 'listo' }),
  food('mermelada', 'Mermelada', [278, 0.4, 69, 0.1],
    ['mermelada', 'jalea', 'jam'], 20, { category: 'endulzante', state: 'listo' }),
  food('vino', 'Vino', [83, 0.1, 2.6, 0],
    ['vino', 'vino tinto', 'wine'], 150, { category: 'bebida', state: 'listo', unit: 'ml' }),
]
