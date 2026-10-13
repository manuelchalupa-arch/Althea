# Informe — Mejora del atlas muscular (Pantalla Progreso)

**Estado:** completado. Los 4 recursos gráficos de `src/assets/muscle-atlas/` están **en uso real** en el mapa de Progreso, con selección automática por el sexo persistido del perfil.

**Gate de calidad:** `tsc --noEmit` 0 · `eslint --max-warnings 0` 0 · `vitest run` 1384 pass / 0 fail / 16 skip · `vite build` OK (precache 111 entradas) · `check:release` OK (119 archivos, 0 claves).

**No se desplegó nada. No se commiteó nada.**

---

## 1. Qué se encontró (auditoría sobre el estado real del repo)

### 1.1 El abdomen no llegaba al atlas — dos bugs encadenados

| # | Bug | Efecto visible |
|---|-----|----------------|
| 1 | `MuscleGroup` **incluía** `'abdomen'`, pero `GROUP_MEMBERS` en `muscleGroups.ts` **no lo mapeaba** | El volumen abdominal se descartaba en `groupOfMuscle` → nunca sumaba a ningún grupo |
| 2 | `MUSCLE_CATALOG` **no tenía ninguna entrada con `group: 'CORE'`** | El atlas sólo genera datos para los ids del catálogo; las regiones del torso quedaban siempre en "Sin datos" |
| 3 | `rectus-abdominis` y `obliquus-externus` estaban clasificados como **`group: 'PECHO'`** | El volumen abdominal se le **sumaba al pecho**, inflando ese grupo |

Consecuencia: un usuario que entrenaba abdomen veía el pecho más activo y el torso siempre vacío.

### 1.2 El atlas ignoraba los músculos secundarios

`Progreso.tsx` construía el dato del atlas sólo con `byGroup` (peso de **primary ×1**). El resto del repo ya ponderaba `primary ×1 · secondary[0] ×0.5 · secondary[1] ×0.25` (`metrics.ts`), pero esa información **nunca llegaba al atlas**. Además `MuscleDataPoint.exercises` y `activation` se declaraban en el tipo pero **no se rellenaban nunca**, así que:
- `fillOpacity` devolvía siempre `1`;
- la fila "Ejercicios que lo activaron" **jamás aparecía**.

### 1.3 Tendencia con umbral distinto al resto del repo

`muscleGroups.resolveTrend` aplica `STABLE_THRESHOLD_PCT = 5`, pero `Progreso.tsx` comparaba en **estricto** (`> < =`). El atlas podía decir "Descenso" donde la comparación semanal decía "Estable".

### 1.4 Dos vocabularios de sexo conviviendo en la misma columna

`UserProfile.sex` es `'M' | 'F' | 'X'`, pero `Onboarding.tsx` escribía `'masculino' | 'femenino' | 'otro'` con un cast `as any`. `Perfil.tsx` leía y escribía `M/F/X`. Resultado: perfil con un sexo guardado que el selector de Perfil no podía mostrar.

### 1.5 Los 4 PNG: por qué se habían descartado, y por qué ese descarte estaba mal

Los archivos estaban en `src/assets/muscle-atlas/` y **ninguno los referenciaba**. La auditoría inicial los descartó por "proporción 1:1". Ese criterio era **incorrecto**:

| Observación | Resultado de la medición |
|-------------|--------------------------|
| Lienzo | 512×512 (1.0) — **pero la figura ocupa menos** |
| Figura medida píxel a píxel | 226×474 a 247×499 px → **proporción 0.45–0.51**, muy cerca del `viewBox` 200×400 (0.5) |
| Contenido real del archivo | Firma `FF D8 FF`: son **JPEG**, no PNG |
| Transparencia | JPEG no admite alfa; el damero está **horneado en los píxeles** |
| Marca de agua | Presente en la esquina inferior derecha de los cuatro |

Conclusión corregida: la proporción de la **figura** no era motivo de rechazo; lo que había que resolver era el **fondo horneado**, y eso se hizo en tiempo de ejecución (ver §2.4).

---

## 2. Qué se hizo

### 2.1 Fase 1 · Correcciones funcionales

**`src/services/training/muscleGroups.ts`**
- `MUSCLE_GROUPS` ampliado con `'CORE'`.
- `GROUP_MEMBERS` ampliado con todos los alias del core (`abs`, `core`, `abdomen`, `abdominales`, `oblicuos`, `serrato`, y los nombres de catálogo).
- **Nuevo `resolveTrend(current, prior)` exportado**: fuente única de la tendencia con el umbral ±5%. `weeklyGroupComparison` migrado a usarlo.
- `weeklyGroupComparison` expone ahora `current.start` / `current.end`, para que el detalle del atlas corresponda a la misma ventana que el número que muestra.

**`src/services/training/muscleCatalog.ts`**
- Corregido el grupo de `rectus-abdominis` y `obliquus-externus`: **`'PECHO'` → `'CORE'`**.
- Añadida la entrada que faltaba: `serratus-anterior` (`group: 'CORE'`). 23 entradas, sin duplicados.

**`src/pages/Progreso.tsx`**
- La tendencia del atlas usa `resolveTrend` en vez de la comparación en estricto.
- Se propagan `exercises` y `activation` a cada `MuscleDataPoint` (antes nunca se enviaban).

### 2.2 Fase 2 · Sexo → modelo anatómico

**`src/utils/sex.ts` (nuevo)**
- `normalizeSex()` normaliza cualquier valor guardado (incluido el legacy `'masculino'/'femenino'/'otro'`) a `'M'|'F'|'X'`. Vacío y desconocido → `'X'` (figura neutral).
- **No es un campo nuevo**: es el mismo `sex` de siempre, con lectura tolerante.
- **No toca ninguna fórmula nutricional.**

**`src/pages/Onboarding.tsx`**
- El estado pasó a escribir directamente `'M'|'F'|'X'` (se eliminó el `as any`).
- El selector muestra "Masculino / Femenino / No especificado" sobre los códigos canónicos.
- `sexo` y `fechaNacimiento` ahora **se persisten en el borrador** y se restauran al retomar el onboarding (antes se perdían).
- La fórmula Mifflin-St Jeor **no cambió**: sólo se ajustó la comparación (`sexo === 'masculino'` → `sexo === 'M'`) para que siga produciendo el mismo resultado con el código normalizado.

**`src/pages/Perfil.tsx`**
- Al cargar, un valor legacy se normaliza al código canónico. Vacío sigue significando "sin definir".

### 2.3 Fase 3 · Músculos secundarios y ejercicios contribuyentes

**`src/components/progress/muscleContributions.ts` (nuevo)**
- `buildRegionContributions()` reparte el volumen por región con los **mismos pesos del resto del repo** (`primary ×1 · secondary[0] ×0.5 · secondary[1] ×0.25`), no pesos nuevos.
- Devuelve por región: volumen y ejercicios ordenados por aporte.
- Reglas anti-invención: ejercicio sin atribución → se ignora; músculo no anatómico (`cardio`, `cuerpo completo`) → no genera región; nombre desconocido → **no se inventa**.
- `relativeActivation()`: escala 0–100 relativa al período. **No es un porcentaje de fibra reclutada**, sólo modula la opacidad del relleno.

**`src/services/training/muscleAttribution.ts`**
- Nuevo `nameOf()` en el `MuscleResolver`, con la misma precedencia que `muscleOf` (custom → seed → biblioteca). Devuelve `null` si no se conoce.

**`src/pages/Progreso.tsx`**
- Calcula las contribuciones sobre **la misma ventana** que el "Trabajo actual" que muestra el atlas, y las pasa al detalle. La fila "Ejercicios que lo activaron" por fin recibe datos reales.

### 2.4 Fase 4 · Las figuras EN USO (activo)

#### 2.4.1 Mapeo imagen ↔ sexo ↔ vista

Los cuatro archivos se importan **estáticamente** (no por glob):

| Sexo | Vista | Archivo | Rol |
|------|-------|---------|-----|
| `M` | `front` | `src/assets/muscle-atlas/male-front.png` | figura masculina frontal |
| `M` | `back` | `src/assets/muscle-atlas/male-back.png` | figura masculina posterior |
| `F` | `front` | `src/assets/muscle-atlas/female-front.png` | figura femenina frontal |
| `F` | `back` | `src/assets/muscle-atlas/female-back.png` | figura femenina posterior |
| `X` | ambas | — | sin ilustración: se dibuja la silueta SVG neutra existente |

Comprobado en el DOM de la pantalla real (`data-testid` de cada `<image>`): `atlas-image-M-front`, `atlas-image-M-back`, `atlas-image-F-front`, `atlas-image-F-back`; `data-figure-asset` es `png` para M/F y `svg` para X.

#### 2.4.2 Selección automática por el sexo persistido

`Progreso.tsx` mantiene `atlasSex`, que se actualiza con `setAtlasSex(normalizeSex(profile?.sex))` dentro del bloque que ya leía `db.userProfile`. Es el **mismo** `sex` de siempre, sin campo nuevo, y ambas instancias del atlas (móvil y escritorio) reciben `sex={atlasSex}`. Si el perfil no tiene sexo, se usa `X` y se dibuja la silueta.

#### 2.4.3 Tecleo del fondo en tiempo de ejecución (`keyAtlasBackground`)

Los archivos son JPEG con el damero horneado. Antes de pintarlos se convierten a PNG con alfa real sobre un canvas, cacheados por archivo.

Se probaron y **se descartaron** dos criterios, ambos con verificación visual:

1. **Croma solo** (`r - b`): borraba todo píxel oscuro → pelo entero desaparecido y agujeros en pecho, rodillas y muslos.
2. **Croma + luminancia** (`r-b ≤ 6` y `L ≥ 220`): el 99% de los píxeles de croma bajo mide L ≥ 234 (fondo), pero los **destellos claros** de la ilustración (pelo, codos, rodillas, muñecas) caen en el mismo rango y se borraban, dejando manchas grises.

**Implementado: croma + luminancia + conectividad.** Un píxel es fondo sólo si es gris, claro **y** está unido al borde de la imagen por una inundación (BFS). El cuerpo es un bloque central rodeado por contornos oscuros, así que nada de su interior se alcanza; los destellos claros internos se conservan. La marca de agua, rodeada de damero, también queda fuera.

#### 2.4.4 Recorte de los rellenos a la silueta del cuerpo

La geometría de `MUSCLE_REGIONS` nació para la silueta SVG neutra. La ilustración del perfil tiene la cabeza más grande, las piernas más gruesas y los brazos ~12% más abiertos, así que algunos rellenos (antebrazos, pantorrillas) **se salían del cuerpo** y flotaban sobre el fondo.

Solución: un `<mask>` SVG cuyo contenido es la **misma imagen tecleada** con `filter: brightness(0) invert(1)` (todo píxel no transparente pasa a blanco opaco). El grupo de regiones se renderiza con `mask="url(#…)"`, de modo que **ningún relleno puede quedar fuera de la anatomía** y el recorte sigue el contorno real. Para `X` no se aplica máscara.

#### 2.4.5 Geometría de colocación (`atlasFigure.ts`)

- `BODY_TOP = 8`, `BODY_CENTER_X = 100`, `BODY_HEIGHT = 388.1`: caja del cuerpo dentro del `viewBox` `0 0 200 400`.
- `FIG_BOUNDS`: caja medida de la figura en cada lienzo (`male-front` 143,16,226×474; `male-back` 133,11,247×483; `female-front` 149,10,219×490; `female-back` 134,4,244×499).
- `layoutFor(file)` → `tx`, `ty`, `s` con **escala uniforme** (por altura, sin deformar el cuerpo) y centrado horizontal.
- El torso calza casi exacto (nW normalizado: 20% → SVG 0.273 vs PNG 0.274; 25% → 0.291 vs 0.291; 30% → 0.305 vs 0.312).

**No hay ningún gate** (`ATLAS_ASSETS_READY` no existe): M/F siempre renderizan ilustración; X siempre la silueta.

#### 2.4.6 Interactividad intacta

Verificado en el navegador sobre la pantalla real: 42 grupos `[data-muscle-id]` en frente y 46 en espalda, con `role="button"`, `tabIndex`, `aria-pressed` y `aria-label`. Clic en `pectoralis-major-sternal` → el panel de detalle muestra *"Pectoral mayor · porción esternal · Sin datos · Trabajo actual 0 kg · Semana anterior 0 kg · Variación: Sin base · Tendencia: Sin datos"*, y quedan seleccionados **2** nodos (lado espejo). El `<image>` lleva `pointerEvents="none"`, así que no roba los clics.

#### 2.4.7 `vite.config.ts`

Los cuatro PNG se **pre-cachean** (se quita el `globIgnores` de `assets/male-*` / `assets/female-*` que los excluía cuando no se usaban). Suman ~170 KB y hacen que el atlas funcione sin conexión. Precache: **107 → 111 entradas**. Los cuatro aparecen en `dist/assets/` y en el manifest de `dist/sw.js`.

### 2.5 Fase 5 · Pruebas

Nuevas: `src/utils/sex.test.ts`, `src/components/progress/muscleContributions.test.ts` (9), `src/components/progress/atlasFigure.test.ts` (12), `src/components/progress/MuscleAtlas.figure.test.tsx` (8). Ampliadas: `muscleGroups.test.ts`.

Cubren: normalización de sexo (incluido legacy y basura), modelo anatómico, CORE y sus alias, corrección del grupo de recto/oblicuo, `resolveTrend` con umbral (incluido el caso estricto de ±5% exacto), ponderación por rol, ejercicios ordenados, no-invención, `relativeActivation` acotada, los cuatro archivos realmente empaquetados, y que M/F renderizan `<image>` con `href`/`transform` correctos mientras X dibuja la silueta sin imagen.

**Se corrigió 1 test que codificaba el bug**: `muscleGroups.test.ts` afirmaba que `groupOfMuscle('abs')` devuelve `null`. Esa asertación **era el bug**. Ahora espera `'CORE'`.

---

## 3. Verificación visual (obligatoria, hecha en navegador)

Las capturas se tomaron sobre la **pantalla real de Progreso** (`/progresos`), con perfil sembrado en IndexedDB y el componente `Progreso` completo montado. Se usó Chrome vía CDP (`Page.captureScreenshot`) porque bajo `--virtual-time-budget` las transacciones de IndexedDB no avanzan.

| Combinación | `data-figure` / `data-figure-asset` | `<image>` | `<mask>` | Regiones |
|-------------|--------------------------------------|-----------|----------|----------|
| M · Frente (escritorio 1300px) | `M` / `png` | `atlas-image-M-front` | 1 | 42 |
| M · Espalda (escritorio) | `M` / `png` | `atlas-image-M-back` | 1 | 46 |
| M · Frente (móvil 390px) | `M` / `png` | `atlas-image-M-front` | 1 | 42 |
| F · Frente (escritorio) | `F` / `png` | `atlas-image-F-front` | 1 | 42 |
| F · Espalda (escritorio) | `F` / `png` | `atlas-image-F-back` | 1 | 46 |
| X · Frente (móvil) | `X` / `svg` | ninguno | 0 | 42 |

Comprobado en pantalla: fondo limpio (sin damero ni marca de agua), pelo y sombras conservados, ningún relleno flotando fuera del cuerpo, y clic en región que abre el detalle.

---

## 4. Defectos y limitaciones

### 4.1 Comprobados (verificados midiendo o mirando)

| # | Limitación | Detalle |
|---|------------|---------|
| 1 | **Divergencia anatómica figura↔geometría** | La ilustración tiene la cabeza más grande, las piernas más gruesas y los brazos ~12% más abiertos que la silueta SVG. El torso calza; los rellenos de brazos/piernas quedan algo más estrechos o anchos que el músculo dibujado. Se mitigó recortando con la máscara, no se eliminó. |
| 2 | **Marca de agua** | Presente en los píxeles originales (esquina inferior derecha de los cuatro). Con el tecleo + la máscara **no es visible en pantalla**, pero sigue existiendo en el archivo fuente. |
| 3 | **Bordes suaves del tecleo** | JPEG no tiene alfa: los bordes del cuerpo se reconstruyen por croma+luminancia y quedan algo difuminados. |
| 4 | **Píxeles degradados cerca del borde** | Quedan algunas manchas tenues junto a manos y tobillos donde la ilustración tiene destellos casi grises pegados al contorno. |
| 5 | **Puntos oscuros que sí son contenido real** | El oscuro en la coronilla de las vistas posteriores y en la femenina frontal es el **moño** y el pelo del propio original, no un artefacto del tecleo (verificado contra el archivo fuente). |
| 6 | **El recorte depende de la máscara** | Los rellenos se limitan al contorno de la figura. Un músculo cuya región quede mayoritariamente fuera del cuerpo se ve recortado, no reposicionado. |

### 4.2 Supuestos (no comprobados, declarados como tales)

| # | Supuesto | Por qué es un supuesto |
|---|----------|------------------------|
| 1 | La correspondencia región SVG ↔ músculo ilustrado es aproximada | Sólo se midieron perfiles de anchura y se verificó visualmente el torso y los grandes grupos. **No** se validó cada región una por una contra la anatomía dibujada. |
| 2 | La inundación no alcanza interior del cuerpo | Se verificó en los cuatro archivos, pero no hay garantía formal: si un futuro asset tuviera un hueco claro conectado al borde, se borraría. |
| 3 | `BG_LUM_MIN = 220` vale para los cuatro archivos | Se midió sobre estos cuatro (p1 = 234). Un asset con damero más oscuro requeriría revisarlo. |
| 4 | Rendimiento del tecleo en dispositivos modestos | La inundación recorre 262 144 píxeles por archivo, una sola vez y cacheada. No se midió en hardware real. |
| 5 | El JPEG reencodeado a PNG por canvas no degrada perceptiblemente | Se juzgó visualmente; no hay medición objetiva (ΔE, SSIM). |

---

## 5. Archivos tocados en este trabajo

**Nuevos**
- `src/utils/sex.ts` + `src/utils/sex.test.ts`
- `src/components/progress/atlasFigure.ts` + `atlasFigure.test.ts`
- `src/components/progress/muscleContributions.ts` + `muscleContributions.test.ts`
- `src/components/progress/MuscleAtlas.figure.test.tsx`
- `docs/MAPA_MUSCULAR.json` (especificación de partida)

**Modificados**
- `src/services/training/muscleGroups.ts` · `muscleGroups.test.ts` · `muscleCatalog.ts`
- `src/services/training/muscleAttribution.ts`
- `src/components/progress/MuscleAtlas.tsx`
- `src/pages/Progreso.tsx` · `Onboarding.tsx` · `Perfil.tsx`
- `vite.config.ts`

**Sin cambios (a propósito)**
- `src/assets/muscle-atlas/*.png` — los cuatro archivos originales **no se sustituyeron ni se reexportaron**.

---

## 6. Lo que NO se hizo (a propósito)

- **No se pidieron imágenes nuevas** ni se sustituyeron los cuatro archivos.
- **No se dejó ningún gate** tipo `ATLAS_ASSETS_READY=false` ni equivalente.
- **No se rechazaron por proporción 1:1**: se midió la figura y se usaron.
- **No se volvió al SVG para M/F**: la silueta sólo se dibuja para `X`.
- **No se deformó la anatomía**: la escala es uniforme (por altura); lo que sobresale se recorta con máscara, no se estira.
- **No se añadieron dependencias** (el tecleo usa canvas nativo; la verificación visual se hizo con CDP sobre el WebSocket que ya trae Node 24).
- **No se migraron componentes** ni se tocó nada fuera del atlas.
- **No se modificaron fórmulas nutricionales.**
- **No se añadió un segundo campo de sexo.**
- **No se inventaron contornos ni se declaró correspondencia anatómica** que no esté medida: las divergencias reales están listadas en §4.1.

---

## 7. Pendiente

- 7 pruebas de integración WGER siguen **pendientes** por falta de credenciales (`WGER_TEST_USERNAME` / `WGER_TEST_PASSWORD`).
- **No desplegar.** El bloqueo de producción descrito en `docs/RELEASE_REPORT.md` sigue vigente.
