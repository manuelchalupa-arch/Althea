# Research – PWA Entrenamiento MVP

## Decisiones técnicas

### 1. PWA + Service Worker
**Decisión**: `vite-plugin-pwa` con Workbox `generateSW`, precache glob `**/*.{js,css,html,svg,woff2}` + runtime cache para `/assets/*`.
**Alternativas**: SW manual, Next.js PWA. **Por qué**: integración Vite cero-config, control de updates con `registerSW` y prompt "Nueva versión".
**Riesgo**: iOS no soporta periodic sync/background – degradación elegante.

### 2. IndexedDB via Dexie
**Decisión**: Dexie 4.x, DB `trainPWA` v1 con 11 tablas (ver data-model.md), migraciones versionadas.
**Alternativas**: idb, localForage. **Por qué**: Dexie ofrece queries indexadas, bulk ops, liveQuery para Zustand.
**Validación**: benchmark 5k SetLogs read <30ms en Moto G4 emulado.

### 3. Estado Zustand
**Decisión**: Zustand 5 con slices por dominio + persist middleware solo para prefs (no para datos Dexie).
**Alternativas**: Redux, Jotai. **Por qué**: <2KB, sin boilerplate, compatible con Dexie liveQuery.

### 4. Gráficos
**Decisión**: Recharts 2.x (ya usado en ohs-app) – ligero, responsive, sin canvas pesado.
**Alternativa**: Chart.js. **Por qué**: Recharts compone con React sin wrappers extra.

### 5. Drag&Drop
**Decisión**: `@dnd-kit/sortable` para reordenar RoutineExercises; fallback botones ↑/↓ si no hay pointer.
**Alternativa**: react-beautiful-dnd (deprecated).

### 6. Validación
**Decisión**: Zod 3.x para validar import JSON y seeds; sanitizar inputs con Zod+DOMPurify si hay HTML.
**Por qué**: type inference + mensajes en español.

### 7. Fechas
**Decisión**: `date-fns` + `localDate` string `YYYY-MM-DD` para agrupar calendario sin TZ bugs; `createdAt` ISO UTC para orden.

### 8. Notificaciones
**Decisión**: Notification API + Push via SW; limitar a 2/día con tabla `notificationLog`; suppress si `session.todayCompleted`.
**Por qué**: cumple FR-018 sin spam.

### 9. IA proxy
**Decisión**: Stub `services/ai/engine.ts` con interfaz `generateRecommendation(ctx): Recommendation`; F1 devuelve reglas locales; F4 cambia a fetch `/api/ai` sin tocar callers.
**Por qué**: satisface "cambiar proveedor sin modificar núcleo".

### 10. Hosting
**Decisión**: Build estático a Cloudflare Pages / Vercel / Netlify con `vite preview` local; `manifest.webmanifest` con `scope:/` `start_url:/?source=pwa`.

## Open items resueltos
- Icon maskable requerido para Android → generar 192/512 + 512 maskable.
- PDF export opcional en F5 – usar `jspdf` solo lazy.
