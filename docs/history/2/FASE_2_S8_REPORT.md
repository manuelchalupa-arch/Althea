# FASE 2 - S8 - REPORTE DE AUDITORIA DE UX, ACCESIBILIDAD E INCONSISTENCIAS MENORES

**Estado:** CERRADA
**Alcance:** auditar las deudas de UX, accesibilidad y consistencia visual marcadas explicitamente para S8, clasificarlas, corregir solo las que son de S8 y dejar documentado lo que no lo es. Sin dependencias nuevas, sin refactors, sin cambios de arquitectura, navegacion, modelo de datos ni diseno.
**Fecha de cierre:** 2026-09-25
**Prerrequisitos:** S1 a S7 cerradas. Este documento no reabre ninguna.

---

## 1. Objetivo

Cerrar la linea de deuda "UX pulido" de `FASE_2_PLAN.md` con criterio de aceptacion **"sin falsa funcionalidad"**: que ninguna pantalla ofrezca al usuario un control que no hace nada, ninguna etiqueta se quede sin asociar a su campo, y ningun activo declarado tenga un contenido que contradiga lo que promete.

Criterio de salida, verificado:

1. Todo control visible del header y del perfil corresponde a comportamiento real.
2. Todo `<label>` del set de componentes Althea esta asociado programaticamente a su control.
3. Los iconos que el manifest declara existen con las dimensiones que declara.
4. Los 213 warnings de ESLint preexistentes no crecen.

## 2. Alcance auditado y metodo

Origen de cada deuda auditada, para no inventar alcance:

| Fuente | Deuda declarada | Seccion |
|---|---|---|
| `FASE_2_PLAN.md` | `temple` decorativo sin falsa funcionalidad | U1 |
| `FASE_2_PLAN.md` | Default de objetivo en Perfil | U2 |
| `FASE_2_PLAN.md` | Icono PWA 1x1 | L196 |
| `FASE_2_S7_REPORT.md` (punto 3) | `AltheaInput` / `AltheaSelect` sin `htmlFor` | B |

Metodo: lectura del componente y sus consumidores reales, no del patron teorico.

- **Set Althea:** se busco cada `label` de los componentes base y se enumeraron los 5 consumidores reales (`Biblioteca.tsx:183`, `Perfil.tsx:720`, `Progreso.tsx:489`, `Progreso.tsx:490`, `Progreso.tsx:964`) para comprobar que ningun `id` fuera colisionar por el genero automatico.
- **Header:** se busco si existe algun estado de Coach (`coachEnabled`, `coachActivo`, `coachDisabled`, `isCoachAvailable`) que el badge pudiera reflejar. No existe ninguno.
- **Iconos:** se leyeron las cabeceras IHDR de los tres PNG y se rasterizo el `favicon.svg` existente con `sharp` (ya presente en `node_modules`) para medir el resultado antes de escribirlo.
- **Contraste negativo:** se recorrieron los 71 `<label>` del repositorio (3 en el set Althea, 68 en el resto) para comprobar que el defecto del set Althea no se reprodujera en otro sitio por el mismo motivo. Antes del cambio, ninguno de los 71 tenia `htmlFor`.

## 3. Clasificacion de hallazgos (A-F)

| # | Hallazgo | Clase | Veredicto |
|---|---|---|---|
| 1 | Set Althea: `<label>` sin `htmlFor`, control sin `id` | **B** | **Resuelto** |
| 2 | `hint` / `error` del `AltheaInput` no asociados por `aria-describedby` | **B** | **Resuelto** |
| 3 | Iconos `material-symbols` del set Althea anunciables como texto | **B** | **Resuelto** |
| 4 | Iconos PWA 1x1 contra un manifest que declara 192/512 | **A** | **Resuelto** |
| 5 | Header: `<form role="search">` sin `name`/`value`/`onChange`/`onSubmit` | **C** | **Resuelto** |
| 6 | Header: boton "Notificaciones" sin `onClick` | **C** | **Resuelto** |
| 7 | Header: punto `animate-pulse` fingiendo actividad en vivo del Coach | **C** | **Resuelto** |
| 8 | Perfil: default `hypertrophy` atribuido al usuario sin haberlo elegido | **C** | **Resuelto** |
| 9 | Header: avatar con `aria-label="Perfil"` que no es interactivo | **C** | **No resuelto -> E** |
| 10 | 71 `<label>` restantes del repositorio | **F** | Sin cambio |
| 11 | Glifo de `favicon.svg` y marca `Α` de temple | **F** | Sin cambio |
| 12 | 213 warnings de ESLint | **D** | No resuelto |
| 13 | Deudas S5 (`syncToLocalStorage`, cache, telemetria) | **D** | No resuelto |
| 14 | `getTodayLocalDate`, `migrateLocalStorage.ts` | **D** | No resuelto |

Leyenda: **A** bug funcional · **B** accesibilidad · **C** inconsistencia de UX · **D** deuda S9 · **E** fuera de alcance de S8 · **F** falso positivo.

## 4. Hallazgos con evidencia y cambios aplicados

### 4.1 Clase B - set Althea (`src/components/althea/AltheaInput.tsx`)

El componente renderizaba el label como hermano del control, nunca anidado, y sin `htmlFor`. Consecuencias concretas: hacer clic en el label no enfocaba el campo, y el control no tenia nombre accesible para un lector de pantalla. El prop `hint` y el prop `error` se pintaban como texto visual sin ningun vinculo con el control, y el icono de `material-symbols` se anunciaba como contenido.

Correccion aplicada en los tres componentes del archivo:

- `useId()` de React 18 genera un id por instancia; el prop `id` del consumidor tiene prioridad si se pasa, de modo que ningun consumidor existente puede colisionar.
- `<label htmlFor={controlId}>` y `id={controlId}` en el `input`, el `select` y el `textarea`.
- `hint` y `error` reciben id y se referencian desde `aria-describedby`, que se **combina** con cualquier `aria-describedby` que pase el consumidor. El `error` tiene prioridad sobre el `hint` y anade `aria-invalid="true"` y `role="alert"`.
- `aria-hidden="true"` en el icono del input y en el chevron del select.

### 4.2 Clase A - iconos PWA

Los tres PNG eran archivos validos de **70 bytes y 1x1 pixel**, mientras `public/manifest.webmanifest` declaraba `"192x192"` y `"512x512"`. El instalador de Android tomaba un icono de un pixel y lo estiraba.

Se regeneraron desde el `favicon.svg` que el proyecto ya tenia, sin disenar nada nuevo:

| Archivo | Antes | Ahora | Contenido verificado |
|---|---|---|---|
| `icon-192.png` | 70 B, 1x1 | 3546 B, 192x192 | glifo blanco 11.6% |
| `icon-512.png` | 70 B, 1x1 | 10773 B, 512x512 | glifo blanco 11.9% |
| `icon-512-maskable.png` | 70 B, 1x1 | 17563 B, 512x512 | glifo 7.6% sobre 38% de margen |

El `maskable` se genero con el contenido al 80% y centrado, que es la zona segura que exige el formato cuando el sistema aplica su recorte circular. El `manifest.webmanifest` no se toco: sus declaraciones ya eran correctas; el defecto estaba en los archivos.

### 4.3 Clase C - header sin falsa funcionalidad (`src/components/brand/temple.tsx`)

El header ofrecia tres cosas que no hacian nada:

1. **Buscador contextual.** `<form role="search">` cuyo input no tenia `name`, ni `value`, ni `onChange`, y cuyo form no tenia `onSubmit`: escribir y pulsar Enter no hacia nada. Ademas solo aparecia en `/biblioteca` y `/rutina`, dos rutas que ya traen su propio buscador. Se elimino el `<form>` y se conservo el `div` de layout con las mismas clases (`hidden md:flex flex-1 max-w-[420px]`), con lo que el header de las demas rutas se dibuja exactamente igual que antes. Se elimino tambien la variable `showSearch`, ya sin uso.
2. **Boton "Notificaciones."** Sin `onClick` ni destino. El producto si tiene sistema de notificaciones (`src/services/notifications/scheduler.ts`, `unifiedNotifications.ts`), asi que cablearlo no era un cambio S8: era funcionalidad nueva. Se elimino el boton.
3. **Badge "Coach activo".** El texto es cierto: existe motor local y fallback local, el Coach siempre responde. Lo que miente es el punto `animate-pulse`, que sugiere una conexion o actividad en vivo. Se comprobo que no existe ningun estado `coachEnabled` / `coachActivo` / `coachDisabled` / `isCoachAvailable` en todo `src/` al que ese punto pudiera estar atado. Se quito `animate-pulse` y se marco el punto como `aria-hidden="true"`. **El texto se conserva**: unirlo a un estado real (por ejemplo "Coach local" vs "Coach IA") es una decision de producto que queda anotada en la seccion 8.

### 4.4 Clase C - objetivo del perfil (`src/pages/Perfil.tsx`)

```ts
// antes
const goal = GOAL_MAP[profile?.trainingGoal] || GOAL_MAP.hypertrophy
// despues
const goal = profile?.trainingGoal ? GOAL_MAP[profile.trainingGoal] : undefined
```

`profile` arranca en `null` y se carga de forma asincrona desde Dexie (`db.userProfile.get('me')`). Con el `|| GOAL_MAP.hypertrophy`, el primer render ya pintaba "Hipertrofia" como si fuera el objetivo del usuario, y se mantenia para siempre en un perfil sin `trainingGoal`. Era informacion que el usuario nunca eligio. Ahora el badge solo se renderiza con un objetivo real, y un `trainingGoal` desconocido no cae a Hipertrofia. Se marco el icono del badge como `aria-hidden="true"`.

## 5. Falsos positivos y preservados por contrato

- **Falso positivo: 68 labels del repositorio.** Ninguno comparte el defecto del set Althea: envuelven su control, es decir, usan asociacion implicita, que es valida en HTML. Verificado sobre los archivos con mas etiquetas (`Perfil.tsx` 12, `BibliotecaCustomForm.tsx` 12, `Onboarding.tsx` 10, `SessionModals.tsx` 8). Convertirlos a `htmlFor`/`id` habria sido un refactor masivo sin ganho real: los 5 consumidores reales del set Althea ya quedaron cubiertos.
- **Falso positivo: glifo de `favicon.svg` y marca `Α`.** Ambos son validos. El `favicon.svg` contiene U+1F4AA (biceps) y temple usa U+0391 (alfa griego, la marca de la marca). El `??` que aparecia era mojibake de la consola al volcar el archivo, no un archivo roto. Antes de usar el SVG como fuente de los iconos se midio el resultado renderizado: glifo centrado en (95.6, 97.5) sobre un lienzo de 192, es decir, centrado.
- **Falso positivo: los logs `Operation failed ... Error: fail`.** Salen durante la suite y son de un test de operaciones fallidas, no de S8.
- **Preservado por contrato (E): avatar del header.** Es un `div` con `aria-label="Perfil"` que no es interactivo. Corregirlo exige decided si es un enlace y adonde navega: es exactamente el tipo de cambio de navegacion que S8 prohibe. Se documenta, no se toca.
- **Preservado por contrato (D): 213 warnings.** S3 y S4 los declararon como deuda general S8/S9 sin concretizar ninguno como S8. Bajar el numero exigiria refactors de estilo en 265 archivos.
- **Preservado por contrato (D): deudas S5 y patrones de S7.** `syncToLocalStorage`, cache de workouts, `getTodayLocalDate`, `migrateLocalStorage.ts:346` y los 7 `toISOString().slice` legitimos que S7 documento como fixtures, seeders, demos y un round-trip UTC en Inicio quedan intactos.

## 6. Tests agregados

30 tests nuevos en 4 archivos. Cubren los cuatro hallazgos resueltos y, en dos casos, evitan que el defecto vuelva.

| Archivo | Tests | Que fija |
|---|---|---|
| `src/components/althea/AltheaInput.a11y.test.tsx` | 15 | `getByLabelText` encuentra el campo en los 3 componentes; `htmlFor` === `id`; dos instancias no comparten id; el `id` del consumidor se respeta; `hint` y `error` asociados y combinables con `aria-describedby` externo; `aria-invalid`; el `error` anula al `hint`; iconos `aria-hidden` |
| `src/components/brand/temple.header.test.tsx` | 6 | No hay `role="search"` ni boton "Notificaciones" en `/`, `/biblioteca` ni `/rutina`; no existe `.animate-pulse`; el punto es `aria-hidden`; el header sigue funcionando (identidad, seccion, toggle de tema) |
| `src/pages/Perfil.goalBadge.test.tsx` | 5 | Sin perfil no se inventa Hipertrofia; con objetivo guardado se muestra ese y no otro; `hypertrophy` real se sigue mostrando; objetivo desconocido y objetivo ausente tampoco inventan nada |
| `src/services/pwaIcons.test.ts` | 4 | El manifest declara los 3 iconos esperados; cada PNG existe y su IHDR coincide exactamente con el `sizes` declarado; ninguno es 1x1; el maskable fue regenerado |

El test del set Althea usa `getByLabelText`, la misma consulta que **no encontraba** el campo mientras el componente no tuvo `htmlFor`. Es la regresion directa de la deuda que S7 traspaso a S8.

Nota de infraestructura, no modificada en S8: `src/global.d.ts:5-10` declara a mano solo tres matchers de jest-dom (`toBeInTheDocument`, `toHaveClass`, `toBeDisabled`), y el `tsconfig` apunta al entry raiz del paquete en vez de `@testing-library/jest-dom/vitest`. Cualquier otro matcher no tipa. Los tests de S8 se ajustaron a esa limitacion en vez de cambiar la config global. Queda anotado en la seccion 8.

## 7. Resultado de gates

| Gate | Baseline S7 | Resultado S8 | Veredicto |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errores | 0 errores | PASS |
| `npx vitest run` | 633/633 en 78 archivos | **663/663 en 82 archivos** | PASS (+30 tests) |
| `npm run build` | PASS | PASS en 23.35s, PWA v0.21.2, `dist/sw.js` y `dist/workbox-89e594d6.js` emitidos | PASS |
| `npm run lint` | 0 errores / 213 warnings | **0 errores / 213 warnings** | PASS (sin warnings nuevos) |

`npm run lint` termina con codigo 1 en ambos casos, y tambien en S7, por el `--max-warnings 0` del script frente a los 213 warnings preexistentes. El conteo real se tomo del formato JSON de ESLint sobre 265 archivos. Los 7 archivos tocados por S8 suman **0 errores y 0 warnings**.

Los iconos regenerados aparecen en `dist/icons/` con sus tamanos reales, y el service worker se emitio sin errores.

## 8. Deudas NO resueltas

Para S9 o fuera de alcance, sin accion en S8:

1. **Avatar del header no interactivo** con `aria-label="Perfil"`. Requiere una decision de navegacion.
2. **Badge "Coach activo" como texto estatico.** El pulso ya no miente, pero el texto sigue sin derivar de un estado real. La mejora natural es diferenciar "Coach local" de "Coach IA" segun `isRoutineAIAvailable`, lo cual es producto.
3. **213 warnings de ESLint** en 265 archivos. Deuda general declarada en S3 y S4.
4. **Deudas S5** completas: `syncToLocalStorage`, cache de workouts, telemetria, `codulia_api_key`, `experienceLevel` / `coachLevel`.
5. **`getTodayLocalDate`** y `migrateLocalStorage.ts:346`, mas los `toISOString().slice` de fixtures, seeders y demos que S7 documento como legitimos.
6. **Perfil: 68 labels de otros componentes** que usan asociacion implicita. Correctos, pero no uniformes con el set Althea ya corregido.
7. **`src/global.d.ts`** declara 3 matchers de jest-dom a mano. Deberia usar `@testing-library/jest-dom/vitest` para que el proyecto pueda escribir `toHaveTextContent` y similares sin tropezar con `tsc`. Cambio de infraestructura, deliberadamente fuera de S8.

## 9. Conclusion de cierre

**S8 queda CERRADA.** Se resolvieron 8 hallazgos: 4 de accesibilidad (asociacion label/control en el set Althea, `aria-describedby` para hint y error, iconos decorativos silenciados) y 4 de clase A/C (iconos PWA reales, buscador muerto, boton de notificaciones muerto, pulso que fingia estado en vivo, y el objetivo atribuido al usuario sin que lo hubiera elegido).

Ningun hallazgo resolvio mas de lo que permitia su clase. El set Althea cambio su firma interna pero no su API publica ni el contrato de props: los 5 consumidores existentes compilan sin modificacion y el `id` del consumidor tiene prioridad sobre el id automatico. El header perdio controles, no comportamiento. El manifest no se toco porque era correcto; los archivos que lo contradecian si.

Verificacion de no-regresion: 663 tests en 82 archivos, 0 errores de tipos, build PWA emitido, 0 errores y 0 warnings nuevos de lint. El unico numero que se movio respecto a S7 es el de tests, que subio de 633 a 663.

**S9 no se inicia aqui.**
