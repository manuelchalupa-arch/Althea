# Reestructuración de la pantalla de Nutrición

## Cambios

1. **Entrada de comida por texto.** La pantalla abre con “¿Qué vas a comer?”. El usuario
   escribe el plato en palabras y un intérprete local y determinista devuelve los
   ingredientes con cantidad. No hay IA externa, ni pago, ni fotografía, ni análisis de
   imágenes.
2. **Nada se guarda solo.** Antes de persistir se muestra nombre, ingredientes,
   cantidades, calorías, proteínas, carbohidratos y grasas, con la leyenda
   “Estimación nutricional. Podés ajustar ingredientes o cantidades.”.
3. **Círculo central de macros.** Tres segmentos concéntricos independientes
   (carbohidratos verde, proteínas coral, grasas amarillo), cada uno con su propio
   porcentaje sobre el objetivo real. Las calorías van como dato central, no como
   segmento. Superar 100 % se marca como excedente sin romper el arco.
4. **Tabla objetivo vs. consumo.** Columnas `CALORÍAS | GRASAS | CARBOHIDRATOS |
   PROTEÍNAS` y filas `OBJETIVO DIARIO | CONSUMO DIARIO`, con el estado de cada macro
   (cerca, alcanzado, excedido).
5. **Diario libre con CRUD.** Lista de comidas del día con hora, desglose de
   ingredientes, editar cantidades y eliminar. Editar recalcula los macros al instante y
   no duplica el registro.
6. **Objetivos reales.** Se reutiliza `getMacroGoals()` (TMB/TDEE + objetivo del
   perfil). Sin peso y altura se muestran metas de referencia con la aclaración
   explícita de que no son datos del usuario.
7. **Día local.** El día va de 00:00:00 a 00:00:00 local usando `todayKey()`; si la app
   queda abierta y cambia el día, los consumos arrancan en cero. Nunca se trunca en
   UTC.
8. **Sin proveedores pagos.** Se retiró de la pantalla el flujo de fotografía y el de
   API Ninjas. Codulia queda como búsqueda opcional de alimentos puntuales y el flujo
   principal funciona completo sin ninguna clave.
9. **Contexto conservado en segundo nivel.** TDEE, TMB, IMC, peso, adherencia,
   hidratación, sugerencias del motor nutricional, adherencia diaria, gráfico de 7 días
   y alimentos frecuentes, todos leídos de datos reales.

## Archivos

Creados:

- `src/services/nutrition/foodComposition.ts` — tabla local de alimentos con valores por
  100 g, porciones estándar, `scaleMacros`, `sumMacros`, `getFood`,
  `findFoodInText`, `findFoodByLabel`, `normalizeDishText`.
- `src/services/nutrition/recipeInterpreter.ts` — recetas base, modificadores,
  cantidades explícitas, recálculo, `dishFromEntry`/`toDishIngredients` para editar
  comidas guardadas.
- `src/components/nutrition/MacroRing.tsx` — círculo de tres segmentos.
- `src/components/nutrition/DishComposer.tsx` — campo de texto, revisión editable,
  cantidades, etiqueta libre de comida.
- `src/services/nutrition/recipeInterpreter.test.ts`
- `src/components/nutrition/MacroRing.test.tsx`
- `src/pages/Nutricion.dishes.test.tsx`
- `NUTRICION_REDESIGN_REPORT.md`

Modificados:

- `src/pages/Nutricion.tsx` — reescrita con el orden círculo → tabla → entrada →
  comidas del día.
- `src/services/nutrition/macroService.ts` — `filterEntriesByDay`, `macroPercent`.
- `src/services/nutrition/macroService.test.ts` — límites del día y `macroPercent`.
- `src/services/storage/diaryStore.ts` — `DiaryIngredientRecord` (con `foodId`),
  `time` e `ingredients` opcionales en `DiaryEntry`, `updateDiaryEntry`,
  `diaryEntryTime`, `nowLocalTime`.
- `src/index.css` — tokens `--c-macro-carbs-rgb`, `--c-macro-protein-rgb`,
  `--c-macro-fat-rgb` en claro y oscuro.
- `tailwind.config.js` — utilidades `macro-carbs`, `macro-protein`, `macro-fat`.

## Funcionalidad

- Escribir “fideos con boloñesa”, “pastel de papa con queso”, “200 g de pollo”,
  “2 huevos”, “media porción de fideos” y similares produce ingredientes y cantidades
  correctos.
- Recetas cubiertas: fideos con boloñesa, pastel de papa, milanesa, ensalada, arroz con
  pollo, pollo con puré, yogur con banana, tostada con huevo.
- Cambiar un ingrediente recalcula los totales de la comida al instante.
- Guardar, editar y eliminar funcionan contra Dexie (`nutritionDiary`) y refrescan
  círculo, tabla y lista sin recargar la página.
- El texto no reconocido devuelve un mensaje pidiendo más detalle en lugar de inventar
  un plato.
- Sin clave de Codulia la pantalla opera completa; el buscador solo ofrece configurar
  esa clave opcional.
- No se incorporan datos de ejemplo: lo que no está cargado por el usuario no se
  muestra, y las metas de referencia están rotuladas como tales.

## Tests

- `npm test` — 717/717 en 87 archivos.
- `src/services/nutrition/recipeInterpreter.test.ts` — 22/22: recetas obligatorias,
  cantidades explícitas, modificadores, recálculo, texto no reconocido, normalización.
- `src/components/nutrition/MacroRing.test.tsx` — 9/9: tres segmentos, porcentajes
  independientes, 100 % en uno sin arrastrar a los otros, >100 % como excedente,
  `dasharray` proporcional, calorías centrales, objetivos en cero, accesibilidad.
- `src/pages/Nutricion.dishes.test.tsx` — 10/10: día vacío, revisión previa a guardar,
  funcionamiento sin proveedor, edición con recálculo, eliminación, objetivos reales,
  metas de referencia rotuladas, día nuevo en cero, consistencia círculo/tabla/Dexie y
  excedente de objetivo.
- `src/services/nutrition/macroService.test.ts` — 15/15, incluye límite del día
  00:00:00–00:00:00 sin mezcla entre días y `macroPercent` con división por cero.

## Gates

| Gate | Resultado |
| --- | --- |
| `npx tsc --noEmit` | PASS (0 errores) |
| `npx vitest run` | PASS — 717/717 tests, 87 archivos |
| `npm run build` | PASS — PWA generada, 91 entradas en precache |
| `npm run check:release` | PASS — sin claves embebidas en `dist/` (94 archivos) |
| `npm run lint` | FAIL — 204 warnings preexistentes en archivos ajenos a Nutrición |

Detalle de `npm run lint`: el proyecto corre ESLint con `--max-warnings 0` y ya tenía
204 advertencias (`curly`, `eqeqeq`) en archivos que no pertenecen a esta
reestructuración. Los archivos de Nutrición quedan limpios: 0 warnings en
`src/pages/Nutricion.tsx`, `src/pages/Nutricion.dishes.test.tsx`,
`src/components/nutrition/` y `src/services/nutrition/macroService.ts`,
`foodComposition.ts` y `recipeInterpreter.ts`. No se modificaron los archivos con
advertencias porque están fuera del alcance pedido.
