# ALTHEA — DOCUMENTO DE CIERRE FINAL

**Fecha:** 2026-09-25
**Naturaleza:** incidente de cierre. Verificación y certificación. Sin reopening de FASE 2.
**Resultado:** **BLOQUEO EXTERNO — NO ES UN BLOQUEO DE CÓDIGO**

---

## 1. Estado final de FASE 2

FASE 2 (S1–S9) está **CERRADA** en código y verificada. No se modificó ninguna subfase durante este cierre.

El código está técnicamente cerrado: no hay bugs conocidos dentro del alcance, las fuentes de verdad están consolidadas, la compatibilidad legacy está documentada y la suite es reproducible. Los cinco gates pasan.

Lo que este documentoNO declara es el cierre absoluto del proyecto, porque existen dos credenciales históricamente expuestas que solo el propietario puede revocar desde las consolas de sus proveedores. Detallado en las secciones 5, 6 y 11.

---

## 2. Resumen de S1–S9

| Subfase | Tema | Estado | Tests |
|---------|------|--------|-------|
| S1 | Seguridad operativa P0 | CERRADO | 558 |
| S2 | Objetivo único canónico | CERRADO | 565 |
| S3 | Ciclos canónicos | CERRADO | 570 |
| S4 | Unificación de restricciones | CERRADA | 579 |
| S5 | Estado: Dexie / Zustand / localStorage | CERRADA | 583 |
| S6 | Preferencias del Coach | CERRADA | 594 |
| S7 | Fechas, hidratación y conversiones UTC | CERRADA | 633 |
| S8 | UX, accesibilidad e inconsistencias | CERRADA | 663 |
| S9 | Limpieza final, deuda residual y cierre | COMPLETADA | 671 |

Crecimiento acumulado: +113 tests, +16 archivos de test, sin eliminar ni relajar ningún test.

Nueve bugs funcionales fueron descubiertos y corregidos, entre ellos el más grave: la fecha civil calculada en UTC, que hacía que el producto mostrara el día siguiente durante 3 de cada 24 horas de uso. Se corrigieron tambien el revert silencioso del plan canónico en el editor de periodización, la regresión de agrupación semanal que detectó un test preexistente, y el detector de trastornos alimentarios ciego a acentos y género.

---

## 3. Gates finales

Ejecutados de nuevo en este cierre, sin modificar código.

| Gate | Resultado | Estado |
|------|-----------|--------|
| `npx tsc --noEmit` | exit 0, 0 errores | PASS |
| `vitest run` | 671/671 tests, 84/84 archivos | PASS |
| `npm run build` | PASS, 9.98s, PWA emitido | PASS |
| `npm run lint` | 0 errores / 211 warnings | PASS |
| `npm run check:release` | OK, 94 archivos sin claves | PASS |

El lint queda 2 warnings por debajo del baseline de 213, y esa diferencia son exactamente los dos `console.log` eliminados en S9. Ningún warning nuevo en toda FASE 2.

---

## 4. Estado de seguridad

**Lo que está verificado y seguro:**

- Ninguna credencial está embebida en `dist/`. `check:release` lo confirma sobre 94 archivos.
- El bundle no contiene el prefijo de clave de Groq, ni el nombre de variable de su API key, ni el dominio del proveedor de inferencia, ni tokens con forma de clave.
- El único hit relacionado con Ninja en el bundle es el **nombre** de la clave de almacenamiento local que la app usa para leer la clave del usuario en runtime. No es un valor.
- Ninguna variable de entorno de credenciales se lee desde el frontend. Las 12 lecturas de `import.meta.env` en producción son la URL pública del proxy y la configuración pública de Firebase.
- Ningún archivo `.env` está versionado. Los tres presentes están sin rastrear.
- El Worker de Groq lee su clave desde el secret server-side. No hay valor hardcodeado.

**Lo que NO está verificado:** que las dos credenciales históricamente expuestas hayan sido revocadas. Es el objeto de las secciones 5, 6 y 11.

---

## 5. Estado de Groq

**Estado: PENDIENTE DE REVOCACIÓN — ACCIÓN EXTERNA**

| Campo | Valor |
|-------|-------|
| Proveedor | GroqCloud |
| Credencial | API key de organización, prefijo `gsk_` |
| Identificador no secreto | hash SHA-256 prefijo `643284B314`, longitud 56 |
| Dónde se usó | Secret del Worker `althea-groq-proxy` |
| Vía actual | Proxy server-side. Correcta y verificada |
| Estado de revocación | **NO REVOCADA** |

**Por qué no se pudo hacer desde el entorno:**

- No existe CLI oficial de Groq para gestión de keys. Se comprobó: no hay binario `groq` en el sistema, no está declarado en el proyecto, y el SDK oficial expone solo inferencia, no gestión de credenciales.
- No existe API pública de Groq para revocar keys. La gestión ocurre exclusivamente en la consola web, y está restringida a propietarios del equipo o usuarios con rol de desarrollador.
- No hay sesión autenticada disponible en este entorno.
- No se inventó ningún endpoint ni se intentó scraping.

**Vía oficial de remediación (documentación de Groq, sección de respuesta a incidentes):** revocar la key en la consola, rotar a una nueva y volver a desplegar el secret.

---

## 6. Estado de Ninja / CalorieNinjas

**Estado: PENDIENTE DE INVALIDACIÓN — ACCIÓN EXTERNA**

| Campo | Valor |
|-------|-------|
| Proveedor | CalorieNinjas |
| Credencial | API key, prefijo `FpM+` |
| Identificador no secreto | hash SHA-256 prefijo `0F2320EB06`, longitud 40 |
| Dónde se usó | Clave propia del usuario, leída en runtime desde almacenamiento local |
| Vía actual | Clave del usuario en su dispositivo. Correcta y verificada |
| Estado de invalidación | **NO INVALIDADA** |

**Aclaración de proveedor.** Hay dos servicios distintos en el código y conviene no confundirlos: `foodProvider.ts` usa CalorieNinjas, mientras que `ninjaService.ts` usa un servicio homónimo distinto. La credencial expuesta históricamente es la de **CalorieNinjas**, que es la que queda referenciada en los archivos de entorno.

**La integración está viva, no es residuo.** Se comprobó en el código: la pantalla de Nutrición importa el proveedor, expone la configuración de la clave y ejecuta búsquedas con ella. El proveedor se marca como configurado cuando la clave está presente. Por tanto **no se eliminó la dependencia**: hacerlo habría roto una funcionalidad en uso, y la credencial sigue siendo necesaria para quienes la tengan configurada.

**Por qué no se pudo hacer desde el entorno:** la invalidación de la key en CalorieNinjas se realiza desde la consola de la cuenta, mediante la función de cambio de API key, que invalida la existente. No hay API pública de revocación ni CLI. No hay sesión autenticada. No se inventó ninguna vía.

---

## 7. Estado del Worker

**Operativo y correctamente configurado.** Verificado en este cierre:

| Comprobación | Resultado |
|---------------|-----------|
| Worker desplegado y respondiendo | GET → HTTP 405 (solo acepta POST) |
| CORS preflight | OPTIONS → HTTP 204 |
| Lectura de la credencial | `env.GROQ_API_KEY`, secret server-side |
| Credencial hardcodeada | Ninguna |
| Secret en el frontend | Ninguno |
| Dominio del proveedor de inferencia en el bundle | Ninguno |
| URL pública del proxy en el bundle | 1 hit, esperado: es una URL, no un secreto |
| Arquitectura modificada | No. Sin cambios |

El Worker no se invocó con ninguna credencial durante la verificación. Las pruebas GET y OPTIONS solo confirman que el Worker está vivo y enruta correctamente; no consumen inferencia.

**No se rotó ningún secreto a valores inventados**, tal como se instruyo directamente. No había una clave nueva legítima que instalar, y generar un valor falso habría dejado el Coach roto.

---

## 8. Estado del bundle

**Limpio.** 63 archivos de distribución revisados con 9 patrones de detección, más los 94 que cubre el script oficial.

| Patrón | Hits en `dist/` |
|---------|-----------------|
| Prefijo de clave de Groq | 0 |
| Variable de API key de Groq | 0 |
| Dominio del proveedor de inferencia | 0 |
| Variable de API key de Ninja (en mayúsculas) | 0 |
| Referencia a CalorieNinjas | 0 |
| Token Bearer con valor | 0 |
| Patrón de clave con 20+ caracteres | 0 |
| Header de API con valor embebido | 0 |
| Clave de Codulia con valor | 0 |
| Nombre de clave de almacenamiento local | 1, benigno: es el nombre, no el valor |

Ningún archivo de credenciales está versionado. Los archivos de entorno presentes no están rastreados por Git.

---

## 9. Estado de Git

**Sin cambios inexplicados, sin artefactos, sin borrados.**

| Categoría | Cantidad | Interpretación |
|-----------|----------|----------------|
| Modificados | 108 | Trabajo de FASE 2, archivo por archivo explicable por subfase |
| Sin rastrear | 76 | 24 tests nuevos, 18 reportes, 33 fuentes nuevas creadas por FASE 2, 1 archivo de entorno |
| Borrados | 0 | Nada eliminado |
| Artefactos de build sin ignorar | 0 | `dist/` correctamente ignorado |
| Temporales (log, tmp, bak) | 0 | Ninguno |
| Secretos rastreados | 0 | Ninguno |

La comprobación de diferencias no reporta conflictos de fusión ni errores de espacios; solo avisos de normalización de fines de línea CRLF/LF, propios de Windows y sin efecto sobre el contenido.

**Observación, sin acción:** el archivo de entorno de producción no está en la lista de ignorados, aunque tampoco está versionado. Su única variable es la URL pública del proxy, no un secreto, de modo que no hay exposición de credencial. Se deja constancia sin modificar nada, por instrucción de no seguir tocando el proyecto.

---

## 10. Acciones externas realizadas

Durante FASE 2, en S1, y verificadas en su momento:

1. Secreto de Groq cargado en el Worker.
2. Worker de Groq desplegado.
3. Archivo de entorno de producción creado con la URL pública del proxy.
4. Prueba funcional de extremo a extremo Coach → Worker → Groq, con respuesta correcta del proveedor y contenido generado.
5. Verificación de que el preflight CORS responde y que los métodos incorrectos se rechazan.
6. Verificación de que la clave de Ninja dejó de leerse desde variables de entorno en el frontend.
7. Confirmación de que el bundle no contiene credenciales.

En este cierre se repitieron las verificaciones 2, 5, 6 y 7, con resultado idéntico.

---

## 11. Acciones externas pendientes

Estas dos acciones **no pueden realizarse desde este entorno**. Requieren acceso a las consolas de los proveedores. No son trabajo de código y ninguna modificación del proyecto las resuelve.

### Acción externa 1 — Groq

- **Proveedor:** GroqCloud
- **Acción:** revocar la API key expuesta históricamente y, si se desea continuar usando el Coach, generar una nueva
- **Dónde:** consola de Groq, sección de API Keys
- **Acceso requerido:** propietario del equipo o usuario con rol de desarrollador
- **Cómo verificar que quedó invalidada:** la clave deja de responder con HTTP 401. Si se generó una nueva, actualizar el secret del Worker, redesplegar y comprobar que el Coach vuelve a responder; la clave antigua debe seguir dando 401

### Acción externa 2 — CalorieNinjas

- **Proveedor:** CalorieNinjas
- **Acción:** usar la función de cambio de API key de la cuenta, que invalida la clave existente
- **Dónde:** consola de la cuenta de CalorieNinjas
- **Acceso requerido:** titular de la cuenta
- **Cómo verificar que quedó invalidada:** una petición a la API de nutrición con la clave antigua devuelve error de autenticación. Quienes tengan una clave configurada en su dispositivo deberán introducir la nueva en la pantalla de Nutrición; la app no almacena ni distribuye claves por sí misma

**Nota sobre el orden.** Si se genera una clave nueva de Groq, es necesario actualizar el secret del Worker antes de eliminar la antigua, porque el Coach depende de ella. La clave nueva debe introducirse únicamente como secret del Worker, nunca en el repositorio.

---

## 12. Conclusión final

El proyecto Althea queda con el **código técnicamente cerrado y el release limpio**:

- FASE 2 cerrada, verificada documentalmente y por gates.
- Cinco gates en verde, sin warnings nuevos, sin regresiones.
- Bundle sin credenciales, con el único hit identificado siendo un nombre de clave de almacenamiento y no un valor.
- Worker operativo, con la credencial en secret server-side y sin nada expuesto en el frontend.
- Git sin cambios inexplicados, sin artefactos y sin archivos de credenciales versionados.
- Ninguna acción técnica pendiente en el proyecto.

Y con **dos acciones externas pendientes** que este entorno no puede ejecutar.

Conviene distinguir con precisión, porque son cosas distintas: **el código está seguro** y **las credenciales históricamente expuestas están revocadas** son dos afirmaciones diferentes. La primera está verificada y es cierta. La segunda es falsa hoy, y depende de dos acciones manuales en consolas de terceros.

Por eso no corresponde declarar cierre final completo. Declaro:

# BLOQUEO EXTERNO — NO ES UN BLOQUEO DE CÓDIGO

Dos revocaciones de credenciales requieren acceso a las cuentas de Groq y CalorieNinjas, que este entorno no tiene y que no deben resolverse inventando vías, endpoints o valores. No se modificó el código para simular que el problema estaba resuelto, porque el problema no está en el código.

Una vez revocadas ambas credenciales en sus respectivas consolas, y actualizada la clave de Groq en el secret del Worker si se genero una nueva, el proyecto queda en estado de cierre final completo sin ninguna accion adicional.

---

## 13. Verificación local de las credenciales y gates (2026-09-28)

Todo lo que puede verificarse **sin acceso a las consolas** quedó ejecutado y en verde. No se tocó ningún valor de credencial: ni se leyó, ni se copió, ni se modificó, ni se expuso.

| Verificación local | Resultado |
|---|---|
| Claves `VITE_GROQ_API_KEY` y `VITE_NINJA_API_KEY` presentes en `dist/` | **No aparecen en ningún archivo de `dist/`** |
| Referencias a esas claves en el frontend (`src/`) | Ninguna lectura; sólo el comentario de `vite-env.d.ts` y la aserción de `ChatWidget.test.tsx` que comprueba su ausencia |
| Claves con forma de secreto (`gsk_…`, `sk-…`, `AIza…`) en el árbol rastreado | Ninguna |
| `.env.local` / `.env.production` versionados | No; ambos están en `.gitignore` |
| Worker | Lee `GROQ_API_KEY` sólo de `env` (secret de Cloudflare); `wrangler.toml` sólo documenta cómo setearlo |
| API de nutrición | La clave la introduce el usuario en su dispositivo (`localStorage`), nunca se distribuye con la app |
| Uso actual del frontend | Sólo `VITE_GROQ_PROXY_URL` (URL pública, no secreto) y la config pública de Firebase |

Consecuencia: **la única barrera entre el proyecto y el cierre completo son las dos revocaciones externas de §11.** La acción localmente posible está completa; los valores históricos permanecen en los `.env` locales sin versionar porque siguen siendo necesarios para verificar que la clave vieja devuelve 401 tras la revocación.

### Gates re-ejecutados (2026-09-28)

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0, 0 errores |
| `npm test` (vitest run) | **124 archivos / 1041 tests declarados / 1041 ejecutados / 1041 aprobados / 0 fallidos** |
| `npm run build` | PASS, PWA emitido (71 entradas de precache) |
| `npm run lint` | **exit 0 — 0 errores / 0 warnings** (los 166 warnings históricos: 104 `curly` + 42 `eqeqeq` + 17 `react-hooks/exhaustive-deps` + 3 `no-console` fueron corregidos; `eslint.config.mjs` sin cambios, ningún archivo excluido, ninguna regla desactivada) |
| `npm run check:release` | OK: sin claves de API embebidas en `dist/` (70 archivos revisados) |

---

## 14. Lighthouse y T032 (2026-09-28)

Ejecutado **localmente en este entorno** sobre `npm run preview` + Chrome headless (CDP `:9222`), con **Lighthouse 11.7.1** (`npx -y lighthouse@11`).

**Nota metodológica:** Lighthouse ≥12 eliminó la categoría `pwa`; el criterio del spec (Lighthouse PWA ≥90) sólo es ejecutable con LH 11.

| Criterio T032 | Resultado | Estado |
|---|---|---|
| `npm run build` sin errores | PASS, PWA emitido (71 entradas de precache) | **PASS** |
| Lighthouse PWA ≥90 | **100 / 100** (manifest instalable, service worker, splash, viewport, maskable icon, themed omnibox = 1) | **PASS** |
| Lighthouse Performance ≥85 (SC-001) | **75 / 100** — FCP 2,8 s · LCP 5,3 s (score 0,21) · TBT 10 ms · CLS 0,031 · TTI 4,4 s | **NO PASS** |
| Bundle inicial <150 KB gzip | JS inicial de la ruta `/` ≈ **400 KB gzip** (dominado por `vendor-other` 199 KB gz y `vendor-transformers` que se descarga al inicio) | **NO PASS** |
| `quickstart.md` existe | Sí: `.specify/specs/001-pwa-entrenamiento-mvp/quickstart.md` (la nota previa de tasks.md que decía "no existe" era incorrecta) | **PASS** |

### Cómo reproducirlo (lo que debe ejecutar una persona)

```powershell
npm run build
npm run preview            # serve dist con SW activo (puerto 5173/5174 según disponibilidad)
# Chrome headless con CDP (PowerShell, otra terminal):
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --remote-debugging-port=9222 --user-data-dir="$env:TEMP\lhp" --no-sandbox about:blank
npx -y lighthouse@11 http://localhost:5173 --port=9222 --only-categories=pwa,performance --output=json --output-path=lh.json
# lea lh.json → categories.pwa.score (≥0,90) y categories.performance.score (≥0,85)
```

Verificación complementaria en línea: `npm run lint` (exit 0), `npm test`, `npx tsc --noEmit`, `npm run check:release`.

### Estado real de T032 (cierre definitivo 2026-10-01)

**CERRADA con bloqueador arquitectónico documentado** (ver `docs/PENDIENTES_OTRO_AGENTE.md` P1): re-medición con la misma metodología → PWA 100/100 · Performance 72/100 (FCP 2,9 s · LCP 6,5 s · TBT 10 ms · CLS 0 · TTI 4,6 s); JS inicial ≈280 KB gzip con piso arquitectónico medido (react 44.7 + router 13.5 + dexie 31.6 + firebase 140 + index 73.9). Los umbrales Performance ≥85 e inicial <150 KB requieren diferir Firebase/Dexie del arranque (riesgo funcional, decisión de otro agente).

---

## 15. Decisión estructural de `src/services/logger.ts` (2026-09-28)

Al llevar `npm run lint` a exit 0 quedó un conflicto real entre la política del proyecto y un comportamiento cerrado:

- `eslint.config.mjs` aplica `no-console: ['warn', { allow: ['warn', 'error'] }]` a **todo** `src/` (los `.test.ts` están exentos).
- `logger.ts` escribía **todos** los niveles a consola (`console.debug`, `console.info`, `console.log` en la línea 74) y `logger.test.ts` lo verificaba.

**Resolución (sin tocar la config, sin `eslint-disable`, sin ocultar el warning):** `logger` escribe a consola **sólo `warn` y `error`** (lo que la política permite) y los niveles `debug`/`info` se emiten al **pipeline de listeners estructurados** (`addListener`), que es el sink real del logger. Se actualizó `logger.test.ts` al contrato corregido: los tests de `debug`/`info` ahora verifican que la entrada llega a los listeners (mensaje, contexto y nivel) **y** que no escribe a consola; los de `warn`/`error` siguen verificando la consola. Cobertura intacta: 124 archivos / 1041 tests en verde.

---

*Documento de cierre final. Verificación de release, bundle, Git y Worker. La única modificación de código de este documento es la decisión estructural de §15 (logger) y la corrección de warnings de lint descrita en §13.*
