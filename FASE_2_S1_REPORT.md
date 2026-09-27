# FASE 2-S1 — REPORTE (Seguridad Operativa P0)

> **Ámbito**: F2-S1 (dentro de FASE 2 del plan de migración/limpieza de estado).
> **Estado**: **CÓDIGO COMPLETO y verificado; OPERACIONES EXTERNAS GROQ COMPLETADAS** (Worker desplegado, proxy funcional); **NINJA: rotación/revocación de clave aún MANUAL** (requiere consola del proveedor — ver §7).
> **FASE 2 global**: **en curso** — sólo S1 ejecutado; S2–S9 pendientes de autorización.
> **Deploy / rotación de claves / `wrangler secret`**: GROQ **REALIZADO** (verificado funcionalmente); NINJA rotación **PENDIENTE INTERVENCIÓN MANUAL** (consola proveedor, fuera del alcance del agente).
> **Fecha**: 2026-09-24/25

---

## 1. Fuente de verdad / Objetivo
- Según `FASE_2_PLAN.md` **F2-S1 (SEGURIDAD OPERATIVA P0)**: eliminar el riesgo de fuga de secretos (Ninja inlineada en `dist/`, Groq operativo).
- Invariante: **ningún secreto en `src/`**; los gates no dependen de claves.
- Aceptación: `dist/` sin keys reales; front sin `X-Api-Key` secreto embutido; Worker con secret por env.

## 2. Resultado
- `dist/` **sin claves embebidas** (verificado por `check:release` sobre 95 `.js` + grep determinista SimpleMatch/regex): `gsk_`, `VITE_GROQ_API_KEY`, `VITE_NINJA_API_KEY`, `VITE_CALORIE_NINJAS_KEY` → **0 coincidencias**.
- Los únicos hits de `X-Api-Key`/`NINJA_API_KEY` en `dist/` son **referencias de código runtime** (header `"X-Api-Key": s` con valor desde localStorage; y el match insensible a mayúsculas contra el key de localStorage del usuario `althea:ninja_api_key`). **Ninguno es una clave real embebida** (regex de valor 24+ chars → 0).
- Front **ya no lee claves vía `import.meta.env`** en `ninjaService.ts`/`foodProvider.ts` (0 ocurrencias). Ambas claves se cargan **sólo** desde `localStorage` (runtime, key propia del usuario por dispositivo).

## 3. Archivos modificados
| Archivo | Cambio |
|---|---|
| `src/services/nutrition/ninjaService.ts` | `getNinjaKey()` ahora **solo localStorage**; eliminado fallback `import.meta.env.VITE_NINJA_API_KEY`. |
| `src/services/nutrition/foodProvider.ts` | `getCalorieNinjasKey()` ahora **solo localStorage**; eliminado fallback `import.meta.env.VITE_CALORIE_NINJAS_KEY`. |
| `src/vite-env.d.ts` | Eliminadas declaraciones de env `VITE_NINJA_API_KEY` y `VITE_CALORIE_NINJAS_KEY` (muertas). |
| `scripts/check-release.mjs` | PATTERNS ampliados: Ninja/CalorieNinjas (`X-Api-Key` con **valor embebido** vía regex de ≥24/≥40 chars, `VITE_NINJA_API_KEY`, `VITE_CALORIE_NINJAS_KEY`); la rutina ya no asume sólo Groq. |

No tocados: `worker/` (solo se desplegó el código ya implementado), `.env*`, ninguna migración.

> **Nota operativa**: se creó `.env.production` con la URL pública del Worker (no es un secreto; el front la necesita en build). No contiene claves.

## 4. Gates
| Gate | Resultado |
|---|---|
| `npm test` | ✅ **558 tests → PASS** (68 archivos) |
| `npx tsc --noEmit` | ✅ **CLEAN** (RC=0) |
| `npm run build` | ✅ **PASS** (`tsc && vite build`; PWA v0.21.2; generateSW; 92 precache entries; `dist/sw.js`+`workbox` OK) |
| `npm run lint` | ✅ **0 errores** (RC=1 sólo por umbral `--max-warnings 0`; **213 warnings preexistentes**, ninguno nuevo — incluso 2 menos que el baseline de 215) |
| `npm run check:release` | ✅ **OK: sin claves de API embebidas en dist/ (95 archivos revisados)** |
| Verificación determinista de `dist/` | ✅ 0 claves Groq/Ninja embebidas |

## 5. Problemas encontrados / cómo se resolvieron
1. **Clave Ninja inlineada en `dist/` (fuga real del estado previo)** → se elimina el fallback `import.meta.env` en `ninjaService.ts` y `foodProvider.ts`; las claves ahora sólo viven en `localStorage` del usuario.
2. **`check-release.mjs` no detectaba fugas Ninja** (sólo Groq) → PATTERNS ampliados; sin falsos positivos porque se agenda por valor embebido y no por el literal de header (que el código envía en runtime).
3. **Declaraciones de env muertas** (`VITE_NINJA_API_KEY`, `VITE_CALORIE_NINJAS_KEY`) → eliminadas de `vite-env.d.ts`.
4. **3 hits residuales en `dist/` tras el build** → auditados: son código runtime (header + localStorage key), no secretos.

## 6. Pendientes operativos (NO ejecutados)
- **Rotación / regeneración de claves** Ninja y Groq (la Ninja pudo quedar expuesta en `dist/` histórico → **rotar**).
- **`wrangler secret put GROQ_API_KEY`** y **deploy del worker** (manual, requiere acceso Cloudflare).
- Configuración de `VITE_GROQ_PROXY_URL` en producción si se usa el proxy Groq.
- Opcional de S1: evaluar proxy Ninja en el worker (no requerido; localStorage-directo es la vía actual y segura en bundle).

## 7. Rollback
- Deshabilitar proxy → **fallback local ya existente** (front → API Ninja/Groq directamente con key de usuario en localStorage). Ningún cambio en S1 rompe ese path, y el front sigue siendo funcional offline/local.

## 8. Decisiones tomadas
- Mantener **localStorage como única vía** para claves Ninja/CalorieNinjas (sin proxy Ninja por ahora): elimina el riesgo del bundle sin añadir complejidad de worker adicional.
- La clave Groq **siguen** vía proxy server-side (env secret), como diseño vigente.

## 9. Confirmaiones de cierre de S1
- ✅ `dist/` sin keys reales (Groq y Ninja).
- ✅ Front sin `X-Api-Key` secreto embebido.
- ✅ Ningún secreto en `src/`.
- ✅ Gates no dependen de claves.
- ✅ Worker (Groq) usa `secret` por env (aún NO desplegado/rotado).

## 10. OPERACIONES EXTERNAS — estado real (autorizadas y ejecutadas) — CIERRE 2026-09-25

### GROQ — CIERRE OPERATIVO COMPLETO (verificado, no simulado)
| Paso | Operación | Estado |
|---|---|---|
| 1 | Verificar Cloudflare Worker config | ✅ `worker/wrangler.toml`: `althea-groq-proxy`, `main=src/index.js`, `compatibility_date 2025-09-01`, `vars GROQ_URL` + `CORS_ORIGIN="*"`. |
| 2 | Autenticación Cloudflare | ✅ `wrangler whoami` → autenticado (`manuelchalupa@gmail.com`). |
| 3 | Cargar secret `GROQ_API_KEY` en Worker | ✅ `wrangler secret put` (interactivo por el usuario; el agente nunca vio el valor). Un primer intento quedó con valor **vacío** (detección en vivo: el Worker respondía `empty`); tras reintento manual correcto, el proxy respondió `200` a Groq. |
| 4 | Desplegar Worker | ✅ `wrangler deploy` → `https://althea-groq-proxy.manuelchalupa.workers.dev` (Version ID `f002bc67-…` reportado por el usuario y confirmado operativo). |
| 5 | Configurar `VITE_GROQ_PROXY_URL` | ✅ Creado `.env.production` con la **URL pública real** (no secreto). El hosting actual de Althea es **Firebase Hosting** (`firebase.json` → `public: dist`, deploy estático, sin CI): no se inventó otro proveedor. Build local `npm run build` (mode production) la incorpora — verificado 1 hit en `dist/`. |
| 6 | Prueba funcional Coach → Worker → Groq | ✅ **HTTP 200** con `openai/gpt-oss-20b` (modelo real del Coach); respuesta de contenido generada por Groq; `OPTIONS` → 204; `GET` → 405; uso reportado por la API de Groq. |
| 7 | Front sin llamada directa a Groq | ✅ `src/` sin `api.groq.com`, `gsk_`, `VITE_GROQ_API_KEY` (0 ocurrencias salvo comentario y assert de test). |
| 8 | Revocar clave Groq anteriormente expuesta | ⚠️ **MANUAL al usuario** — la rotación/revocación final en consola de Cloudflare/Groq es responsabilidad del usuario (el agente no puede ni debe tocar la clave de otro entorno). |

### NINJA
| Paso | Operación | Estado |
|---|---|---|
| 1 | Identificar clave Ninja históricamente expuesta | ✅ Detectada en `.env.local`: `VITE_NINJA_API_KEY`, len=40, prefijo `FpM+…`, sha256[0:10]=`0F2320EB06` (sin exponer valor). |
| 2 | Rotarla/revocarla en el proveedor | ⛔ **MANUAL al usuario** — requiere consola del proveedor Ninja (login del usuario). |
| 3 | Verificar que el código NO lea `VITE_*` para Ninja | ✅ 0 ocurrencias de `import.meta.env` en `ninjaService.ts`/`foodProvider.ts` (S1) |
| 4 | No introducir nuevas claves en el bundle | ✅ dist/ verificado limpio |
| 5 | `npm run check:release` | ✅ OK: 95 archivos, sin claves embebidas |

### Evidencia de no-fuga en archivos versionados
- `git grep` sobre prefijos `gsk_`, `X-Api-Key`, `VITE_NINJA_API_KEY`, `VITE_CALORIE_NINJAS_KEY` → **0 hits**; único hit de `VITE_GROQ_API_KEY` es el **assert de test** `ChatWidget.test.tsx:25` (`not.toContain(...)`), no un valor real.
- `.env`, `.env.local` y `dist/` en `.gitignore` y no trackeables (verificado con `git check-ignore`).
- **⚠️ Riesgo de chat**: en una iteración previa el usuario pegó material de claves en la conversación (prefijos `gsk_` y `FpM+…`). El agente **no los** almacenó ni usó. Si esas claves son válidas deben considerarse **comprometidas → rotar** en consola.

### Verificaciones de cierre del bundle `dist/` (post-build) — fetcheadas de archivos reales
- [x] dist sin `gsk_` → 0 hits
- [x] dist sin `VITE_GROQ_API_KEY` → 0 hits
- [x] dist sin `VITE_NINJA_API_KEY` → 0 hits
- [x] dist sin `VITE_CALORIE_NINJAS_KEY` → 0 hits
- [x] dist sin `api.groq.com` → 0 hits
- [x] dist con URL real del proxy (`https://althea-groq-proxy.manuelchalupa.workers.dev`) → **1 hit** (en `index-*.js`: reemplazo en build de `VITE_GROQ_PROXY_URL`)
- [x] ninguna clave secreta en archivos versionados (git grep, prefijos+test only)
- [x] **proxy Groq operativo** → ✅ `HTTP 200` real desde el Worker desplegado (respuesta JSON de Groq con contenido y uso de tokens)

---

### Estado de gates (ejecutados tras cierre operativo, 2026-09-25)
| Gate | Resultado |
|---|---|
| `npm test` | ✅ **558** tests / **68** archivos PASS |
| `npx tsc --noEmit` | ✅ CLEAN |
| `npm run build` | ✅ PASS (PWA v0.21.2, 92 precache, `dist/sw.js` + workbox) |
| `npm run lint` | ✅ 0 errores (213 warnings preexistentes; RC=1 sólo por `--max-warnings 0`) |
| `npm run check:release` | ✅ OK — 95 archivos, dist/ sin claves embebidas |

### Qué falta para declarar S1 P0 COMPLETAMENTE cerrado (solo acciones del usuario en consolas)
1. **Revocación NINJA** (clave sha `0F2320EB06…`, prefijo `FpM+…`, len=40) en consola del proveedor — la vía de código en el bundle ya es segura (localStorage runtime).
2. **Revocación/rotación de la clave Groq expuesta históricamente** (sha `643284B314…`, prefijo `gsk_`, len=56) en consola de Cloudflare/Groq, si aún no se hizo. El proxy Worker ya funciona con su secret; esta acción es higiene residual del valor histórico expuesto.

### Próximo paso (NO ejecutado, pendiente de autorización)
- Ejecutar las acciones de consola NINJA/GROQ por parte del usuario, **o** autorizar continuar con **F2-S2 (Objetivo Único P1)** con el cierre operativo de S1-GROQ completo y el cierre de NINJA limitado a la revocación manual.