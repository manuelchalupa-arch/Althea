# FASE 2 — CHECKPOINT FINAL

**Alcance:** certificación del cierre de FASE 2 (S1–S9)
**Fecha:** 2026-09-25
**Naturaleza:** verificación. No se modificó código durante este checkpoint.

---

## 1. Estado final de S1–S9

Las nueve subfases están cerradas. Ninguna quedó declarada abierta.

| Subfase | Tema | Estado declarado | Tests | Archivos |
|---------|------|------------------|-------|----------|
| S1 | Seguridad operativa P0 | CERRADO | 558 | 68 |
| S2 | Objetivo único canónico | CERRADO | 565 | 69 |
| S3 | Ciclos canónicos | CERRADO | 570 | 69 |
| S4 | Unificación de restricciones | CERRADA | 579 | 70 |
| S5 | Estado: Dexie / Zustand / localStorage | CERRADA | 583 | 71 |
| S6 | Preferencias del Coach | CERRADA | 594 | 72 |
| S7 | Fechas, hidratación y conversiones UTC | CERRADA | 633 | 78 |
| S8 | UX, accesibilidad e inconsistencias menores | CERRADA | 663 | 82 |
| S9 | Limpieza final, deuda residual y cierre | COMPLETADA | 671 | 84 |

**Crecimiento acumulado de FASE 2:** +113 tests y +16 archivos de test. La suite solo creció; no se eliminó ni se relajó ningún test en toda la fase.

**Verificación de estructura documental.** Los nueve reportes contienen objetivo, cambios, tests y gates. Los dos que no exponen una sección de tests separada (S1 y S5) sí tienen evidencia de test: S1 validó mediante `check:release` determinista más la suite completa, que es el gate apropiado para una subfase de escaneo de secretos; S5 agrego `src/stores/profile.test.ts` con 4 tests que fijan los invariantes de persistencia.

**Clasificación de deuda.** Todas las deudas residuales están clasificadas con el esquema A–H que S3 introdujo y S9 consolidó (A canónico, B fallback legacy, C runtime necesario, D compatibilidad, E dato distinto, F código muerto, G deuda futura, H falso positivo). No hay deudas sin clasificar.

**Deudas futuras presented as tales.** S9 §13 las titula explícitamente «No ejecutadas en S9. Ninguna bloquea FASE 2». Ninguna se describe como bug activo.

**Ausencia de contradicciones.** La cadena de conteos es monótona y cada baseline de subfase coincide con el resultado de la anterior. Los warnings de lint nunca parmesan de 215 (pre-fase) → 213 (constante durante S1–S8) → 211 (S9). Ninguna subfase introdujo warnings nuevos en ningún momento.

*Observación menor, no bloqueante:* S3 declara su resultado como «570/570 · 69 archivos» y S4 declara su baseline como «570/570 · 70 archivos». El conteo de tests coincide exactamente; difiere en un archivo de test sin tests nuevos. Es una discrepancia de registro, no una contradicción de estado, y no altera ningún criterio de cierre. No se modificó.

---

## 2. Cambios principales realizados durante FASE 2

**Seguridad (S1).** Eliminada la clave de Ninja que estaba embebida en `dist/`; el front dejó de leer claves Ninja por `import.meta.env` y las carga solo desde `localStorage` del usuario. `check-release.mjs` se amplió para detectar fugas Ninja, que antes no cubría. Eliminadas declaraciones de env muertas. Operaciones externas ejecutadas y verificadas: secret del Worker Groq cargado, Worker desplegado, `.env.production` creado con la URL pública del proxy, y prueba funcional Coach → Worker → Groq con HTTP 200 real.

**Canonización del objetivo (S2).** Creado `src/utils/trainingGoal.ts` con `resolveTrainingGoal` como resolvedor único, con precedencia canónico-primero y fallback al campo legacy.

**Canonización de ciclos (S3).** `cycleVersions` como fuente canónica, con `savePlanning` como único escritor. `PeriodizationEditor`, `Calendario` y `useTrainingSession` migrados a precedencia canónica.

**Unificación de restricciones (S4).** Creado `src/utils/restrictions.ts` con cuatro getters separados por dominio: `getTrainingLimitations`, `getPainAreas`, `getExcludedExercises` y `getNutritionRestrictions`. Eliminada la escritura contaminante en `Perfil` que mezclaba el legacy con el canónico.

**Consolidación del estado (S5).** Eliminado el espejo `trainpwa-profile` en localStorage: el perfil persistente vive solo en Dexie. `createContext` auditado y descartado (cero duplicación por React Context).

**Preferencias del Coach (S6).** `resolveCoachTone` en `coachPersonality.ts` como resolución única de tono, aplicado en `Coach.tsx`, `Perfil.tsx`, `chatContext.ts` y `coachCore.ts`. Conservado `coach-prefs` como almacén de patrones aprendidos, separado de la configuración.

**Capa central de fechas (S7).** Creado `src/utils/dates.ts` con `todayKey()`, `toDateKey()`, `weekdayOfKey()`, `parseLocalDateKey()` y `weekStartKey()`. 45 archivos de producción importan esta capa.

**UX y accesibilidad (S8).** `AltheaInput` con `useId()` y asociación `htmlFor`/`id` real. Eliminados el buscador y el botón de notificaciones muertos del header, y el pulso falso de estado. `Perfil` dejó de mostrar «Hipertrofia» por defecto. Iconos PWA regenerados en 192, 512 y 512 maskable.

**Limpieza final (S9).** Eliminados `getTodayLocalDate` y `syncToLocalStorage` (código muerto con prueba de ausencia total), más un import no usado y dos `console.log` de debug que imprimían datos de dolor. Corregidos el detector de TCA y la fecha de la migración. Alineado el color del manifest con el de la app. Hermetizado un test que dependía de red real.

---

## 3. Fuentes de verdad definitivas

Verificadas directamente contra el código, no contra los reportes.

| Concepto | Fuente canónica | Evidencia en código |
|----------|-----------------|---------------------|
| Ciclos | `cycleVersions` | 13 archivos consumidores; `savePlanning` como único escritor |
| Objetivo de entrenamiento | `trainingGoal` → `resolveTrainingGoal` (`utils/trainingGoal.ts:45`) | 10 archivos consumidores |
| Restricciones de entrenamiento | `limitations` vía `getTrainingLimitations` (`restrictions.ts:45`) | Getter canónico único |
| Dolor | `painAreas` vía `getPainAreas` (`restrictions.ts:54`) | Getter canónico único |
| Ejercicios excluidos | `excludedExercises` vía `getExcludedExercises` (`restrictions.ts:62`) | Getter canónico único |
| Nutrición | `nutritionPrefs.*` vía `getNutritionRestrictions` (`restrictions.ts:76`) | Dominio separado del entrenamiento, con documentación que prohíbe mezclar |
| Tono del Coach | `UserProfile.coachTone` vía `resolveCoachTone` (`coachPersonality.ts:261`) | 8 llamadas, cero resolución inline en la UI |
| Persistencia | Dexie | Las 20 escrituras restantes en localStorage son preferencias de UI, rate limits, banderas de migración, punteros revalidados contra Dexie, caché de red y las claves propias del usuario. Ninguna es dato de dominio duplicado |
| Fechas civiles | `src/utils/dates.ts` | 45 archivos importan la capa; `todayKey` y `toDateKey` canónicos |
| Timestamps reales | `toISOString()` sobre instantes, sin truncar | 87 asignaciones de instante real en campos `createdAt`/`updatedAt`/`startedAt` |
| Fallbacks legacy | Solo donde están justificados | `profile.cycle` (10), `routine.cycle` (2), `goalPrimary` (24), `prefs:global` (2), `trainpwa-profile` (2), todos con consumidor o propósito de compatibilidad |

**Antipatrón de fecha civil:** quedan 6 ocurrencias de `toISOString().slice(0,10)` en producción, y son exactamente las ya justificadas: `Inicio.tsx:783` (roundtrip UTC simétrico), `demoData.ts:43,81,221` (fixtures de demo) y `seeder.ts:21,88` (seeders). `migrateLocalStorage.ts`, que figuraba en esa lista hasta S9, ya no está.

---

## 4. Principales bugs funcionales descubiertos y corregidos

**B1 — Revert silencioso del plan canónico (S3).** `PeriodizationEditor` sembraba su estado con el snapshot legacy en vez de la versión canónica. Si el usuario abría el editor y guardaba, persistía el snapshot viejo, revirtiendo el plan canónico y creando una versión espuria. Corregido con precedencia canónico-primero.

**B2 — Fecha civil en UTC, la ventana de las 21:00 (S7).** `toISOString()` convertía a UTC, de modo que entre las 21:00 y las 23:59 en Argentina el producto le pasaba «mañana» al usuario donde debía pasar «hoy». El reporte de S7 lo dimensiona: **3 de cada 24 horas de uso**. Afectaba a calendario, rutina, exports y mas pantallas. Corregido con la capa central de fechas.

**B3 — Regresión de bucket semanal (S7, atrapada por un test preexistente).** La primera versión de la corrección de B2 restaba `weekdayOfKey()` en vez del offset desde el lunes, moviendo cada semana un día atrás. Lo detectó `prs.test.ts`, que ya existía. Se corrigió introduceciendo `weekStartKey` y el test volvió a pasar **sin ser modificado**.

**B4 — Tono legacy crudo sin `mapTone` (S6).** `coachCore` pasaba el valor legacy sin mapear, produciendo un tono incorrecto en el Coach.

**B5 — Escritura contaminante de restricciones (S4).** `Perfil` escribía el campo legacy contaminando el canónico. Un test existente incluso codificaba el bug.

**B6 — Campo sin etiqueta asociada (S8).** `AltheaInput` no tenía `htmlFor`, por lo que `getByLabelText` no encontraba el campo: fallo de accesibilidad real, no cosmético.

**B7 — Detector de TCA ciego (S9).** Los indicadores no coincidían con el texto real del usuario y la comparación no normalizaba acentos ni género. «compulsión» y «compulsiva» no disparaban la detección.

**B8 — Fecha UTC en la migración (S9).** `coachMemory.prefs:global` escribía el día UTC en un campo cuyo significado es día civil local, en un huso al oeste de UTC entre las 21:00 y la medianoche. Defecto latente que se activaba al re-ejecutar la migración en un entorno limpio.

**B9 — Test intermitente por red (S9).** Un test de S7 fallaba aproximadamente 1 de cada 3 corridas de suite completa por hacer `fetch` real a un CDN público, sin que eso afectara lo que verificaba. Corregido mockeando la red, sin tocar ninguna aserción.

---

## 5. Seguridad y release

**Estado del bundle.** `check:release` PASS: 94 archivos revisados en `dist/`, cero claves de API embebidas. El script cubre prefijos Groq, valores de `VITE_GROQ_API_KEY`, URLs de proxy y API, y referencias a servicios externos.

**Vía de las credenciales.** Groq se consume por proxy server-side con secret en el Worker, verificado operativo con HTTP 200. Ninja y Codulia se cargan solo desde `localStorage` del usuario en runtime, por lo que nunca entran al bundle. `codulia_api_key` se borra correctamente en `accountWipe`.

**Higiene de secretos durante el checkpoint.** No se inspeccionó ni se imprimió el valor de ninguna credencial. La revisión de `.env.local` se hizo exclusivamente por nombre de clave. No se rotó, no se eliminó y no se tocó ninguna credencial ni infraestructura de Cloudflare durante esta certificación.

**Pendiente operativo real, no resuelto por FASE 2.** S1 dejó dos revocaciones de credenciales como acción manual del usuario, y siguen pendientes:

1. **Clave Ninja** históricamente expuesta (identificada por hash e identificador, sin exponer el valor) en la consola del proveedor.
2. **Clave Groq** expuesta históricamente en la consola de Cloudflare/Groq, por higiene del valor antiguo.

La vía de código ya es segura en ambos casos: el bundle está limpio y las claves se leen en runtime. Lo que queda pendiente es la rotación del material de credencial, que ningún cambio de código puede sustituir. Se detalla en la sección 9.

---

## 6. Tests y reproducibilidad

**Estado:** 671 tests en 84 archivos, 671/671 en verde.

**Reproducibilidad.** La suite completa se ejecutó de forma repetida durante S9 y de nuevo en este checkpoint, con resultado idéntico. La intermitencia que existía al cierre de S8 (un test de S7 dependiente de red) quedó resuelta en S9: se verificó con 6 corridas aisladas y 3 corridas de suite completa limpias, frente a un fallo aproximado por cada 3 corridas antes del cambio.

**Ningún test eliminado ni relajado en FASE 2.** La cifra de tests creció de 558 a 671. El único test borrado fue el bloque de 2 tests que cubría `getTodayLocalDate`, una función eliminada por estar muerta; ese test verificaba código que ya no existe, no comportamiento.

**Disciplina de regresión.** En S7, un test preexistente detectó una regresión introducida durante esa misma subfase y la corrigió sin necesidad de modificar el test. Ese es el mecanismo funcionando como debe.

---

## 7. Gates finales

Ejecutados en este checkpoint, sin modificar código.

| Gate | Comando | Resultado | Esperado | Veredicto |
|------|---------|-----------|----------|-----------|
| Tipos | `npx tsc --noEmit` | exit 0, 0 errores | 0 | ✅ |
| Tests | `vitest run` | 671/671, 84/84 archivos | 671/671, 84 | ✅ |
| Build | `npm run build` | PASS, 9.39s, `sw.js` y `workbox` emitidos | PASS | ✅ |
| Lint | `npm run lint` | 0 errores / 211 warnings | 0 errores | ✅ |
| Release | `npm run check:release` | PASS, 94 archivos | PASS | ✅ |

**Sobre el gate de lint.** El script usa `--max-warnings 0`, así que devuelve exit 1 por diseño mientras existan warnings. La medición se hizo con `eslint --format json` sumando `errorCount` y `warningCount`: 0 errores y 211 warnings, es decir, 2 por debajo del baseline de 213 y ninguno nuevo. Los 2 menos son exactamente los `console.log` eliminados en S9. No se silenció ninguna regla ni se añadió `eslint-disable` en FASE 2.

**No se hizo ningun cambio para mejorar metricas.** Los cinco gates cumplian los criterios de cierre en su primera ejecucion; no hubo correcciones que hacer.

---

## 8. Deudas futuras no bloqueantes

Revisión de las 9 deudas documentadas en S9 §13. **Ninguna se resuelve aquí.**

| # | Deuda | Motivo | Impacto actual | ¿Bloquea FASE 2? | Hilo de trabajo |
|---|-------|--------|----------------|-------------------|-----------------|
| 1 | `.env.local` con `VITE_GROQ_API_KEY` y `VITE_NINJA_API_KEY` sin lectores de código | Restos de un diseño que pasó a runtime | Ninguno en la app: nadie las lee. Higiene de disco de desarrollo | **No** | Higiene de credenciales (operativa) |
| 2 | `src/global.d.ts` declara 3 matchers de jest-dom a mano | Shim escrito antes de adopted de la Entry de `vitest` | Ninguno en runtime. Fricción al escribir tests nuevos | **No** | Infraestructura de tests |
| 3 | `profile.cycle` y `routine.cycle` coexisten con `cycleVersions` | Compatibilidad deliberada con datos previos | Ninguno: el canónico gana por precedencia y el legacy degrada limpio | **No** | Deprecación planificada (ya decidida en S3) |
| 4 | Atajo `water250` en el manifest | Resto de una versión anterior de la app | Ninguno: sin lector | **No** | Limpieza de superficie |
| 5 | `skipWaiting` del Service Worker sin coordenadas | Semántica de actualización nunca decidida | Actualizaciones no deterministas; sin fallo conocido | **No** | Decisión de producto |
| 6 | 211 warnings de lint | Deuda técnica preexistente, en su mayoría `any` y dependencias de efectos | Ninguno funcional; constante desde 213 | **No** | Campaña de calidad por módulo |
| 7 | Duplicación de IMC y otros cálculos derivados | Dos cálculos del mismo valor en módulos distintos | Riesgo de divergencia numérica, no divergencia observada | **No** | Consolidación en `utils/` |
| 8 | Tests con I/O de red real | `exerciseGym` habla con un CDN público | La instancia conocida se corrigió en S9; la exposición sistémica persiste | **No** | Infraestructura de tests |
| 9 | `experienceLevel` sin escritor | Campo heredado sin expositor actual en UI | 50 lecturas lo consumen como entrada válida del dominio | **No** | Decisión de producto |

**Ninguna de las 9 bloquea el cierre**, y cada una cumple al menos uno de los cuatro criterios establecidos: no produce un bug funcional conocido, tiene comportamiento documentado, existe compatibilidad deliberada, o requiere una decisión de producto posterior.

---

## 9. Riesgos conocidos restantes

**R1 — Credenciales expuestas históricamente sin rotar (riesgo real, prioritario).** Las dos revocaciones pendientes de S1 siguen abiertas. El código es seguro: el bundle está limpio y las claves se leen en runtime desde el `localStorage` del usuario. El riesgo residual es que el material de credencial antiguo siga siendo válido fuera del bundle. **No lo resuelve FASE 2 y ningún cambio de código lo resuelve**: requiere acción manual del usuario en las consolas de los proveedores. Es el único elemento de esta lista que no es puramente técnico.

**R2 — Semántica de actualización del Service Worker sin decidir.** El `skipWaiting` sin coordenadas produce actualizaciones no deterministas. No hay fallo conocido, pero el comportamiento no está fijado por contrato.

**R3 — Deuda de tipos y `any`.** 211 warnings, en su mayoría `any` y dependencias de efectos. No afectan la corrección en runtime, pero reducen la capacidad de detección de errores del compilador.

**R4 — Superficie de red en tests.** `exerciseGym` y los tests que lo consumen pueden reintroducir intermitencia en CI. Se corrigió la instancia conocida; el patrón sigue presente en el módulo.

**R5 — Registros de deprecación sin resolver.** `profile.cycle`, `routine.cycle` y `goalPrimary` se leen todavía. Son compatibles y seguros por precedencia, pero mantienen dos caminos de lectura en el código.

**R6 — Discrepancia documental menor.** El conteo de archivos de test en el cierre de S3 (69) y en el baseline de S4 (70) difiere en uno, con el conteo de tests idéntico. No afecta ningún criterio de cierre ni se corrigió, por instrucción de no modificar durante la certificación.

---

## 10. Declaración final

Criterios verificados de forma simultánea:

| Criterio | Estado |
|----------|--------|
| S1–S9 cerradas | ✅ Verificado documentalmente en los 9 reportes |
| Sin bugs conocidos dentro del alcance de FASE 2 | ✅ 9 bugs encontrados y corregidos; ninguno abierto |
| Fuentes de verdad consolidadas | ✅ 11 invariantes verificadas contra el código |
| Compatibilidad legacy documentada | ✅ §10 de S9 y §3 de este reporte |
| Deudas futuras identificadas | ✅ 9 clasificadas y evaluadas, ninguna bloqueante |
| Suite completa reproducible | ✅ 671/671, verificado en corridas repetidas |
| `tsc` correcto | ✅ exit 0 |
| Build correcto | ✅ PASS, PWA emitido |
| Lint correcto | ✅ 0 errores, sin warnings nuevos |
| `check:release` correcto | ✅ PASS, 94 archivos sin claves embebidas |

Los diez criterios se cumplen. No queda ningún trabajo de FASE 2 pendiente.

Las nueve deudas futuras quedan registradas y evaluadas: ninguna bloquea este cierre. La revocación de las dos credenciales expuestas históricamente es acción operativa del usuario y está documentada como riesgo R1; no constituye trabajo de FASE 2, porque la vía de código que FASE 2 cerró ya es segura.

# FASE 2 — CERRADA

---

*Checkpoint de certificación. Verificación documental, de fuentes de verdad y de release. Sin cambios de código.*
