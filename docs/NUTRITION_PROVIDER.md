# Estimación nutricional (local)

> **Nota de estado (2026-10).** Este documento antes describía un *proveedor
> nutricional externo* (Codulia / API Ninjas) a través de
> `src/services/nutrition/foodProvider.ts`. Ese módulo **no existe** y su
> eliminación fue deliberada: la estimación se resuelve **100 % en el
> dispositivo**, sin claves de API ni salidas de datos. Los tests lo fijan:
>
> - `Nutricion.dishes.test.tsx` comprueba que no exista ningún proveedor externo
>   (`codulia`, `nutritionApi`, `ninjaService`, `foodProvider`) ni claves en
>   `localStorage`.
> - `systemPrompt.test.ts` comprueba que el prompt del Coach no mencione Codulia.

## Arquitectura actual

La UI (`Nutricion.tsx`) no llama a ninguna API. La estimación va por compositor:

| Pieza | Ruta | Rol |
|---|---|---|
| Composición de alimentos | `services/nutrition/foodComposition.ts` | Tabla local `FOODS` (por 100 g), búsqueda por texto y por etiqueta. |
| Interpretación de platos | `services/nutrition/mealInterpretation.ts` | Descompone el texto del plato en componentes. |
| Receta y edición de ida y vuelta | `services/nutrition/recipeInterpreter.ts` | Normaliza, escala gramos y calcula los totales del plato. |
| Cálculo de macros | `services/nutrition/macroService.ts` | Suma del día, metas y estado (`cerca` / `alcanzado` / `excedido`). |
| Componedor de UI | `components/nutrition/DishComposer.tsx` | Entrada de texto y confirmación antes de guardar. |

## Reglas

- **Ningún proveedor registra consumo**: el compositor devuelve candidatos y la
  persona confirma antes de que nada llegue al diario.
- **Nunca inventar calorías ni macros**: si un alimento no está en la tabla local,
  se informa la limitación en vez de fabricar un valor.
- **La fuente canónica de registros es Dexie** (`nutritionDiary`), indexada por
  fecha y tipo de comida.
- **Todo ocurre en el dispositivo**: sin claves, sin red, sin teletransporte.

## Migración de un respaldo antiguo

Un `localStorage` con `codulia_api_key` (de instalaciones previas) se limpia en
`accountWipe.ts`, que lo incluye en su lista de claves retiradas.