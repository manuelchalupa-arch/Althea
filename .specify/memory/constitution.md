# Train-PWA Constitution

## Core Principles

### I. Offline-First (NON-NEGOTIABLE)
Toda funcionalidad esencial debe operar sin conexión. IndexedDB (Dexie.js) es la fuente de verdad local. El servidor es opcional y nunca bloquea el uso. Service Worker cachea shell + datos esenciales. Sincronización es cola de cambios (Local → Queue → Server → Confirm → Conflict Resolution), nunca re-envío total de DB.

### II. Local-First & Privacy-First
Datos almacenados por defecto en el dispositivo. Sin cuenta obligatoria. Sin trackers externos. Variables sensibles (salud, actividad sexual, dolor) nunca salen del dispositivo sin consentimiento explícito. Exportación JSON/CSV siempre disponible. Importación JSON como backup/restore.

### III. Mobile-First & Performance Budget
Diseño prioriza teléfonos (320-430px), navegación inferior a 1 mano, 2-3 taps a cualquier función. Presupuesto: <150KB JS inicial gzip, <1s TTFB en 3G lento, lazy loading + code splitting, sin imágenes pesadas ni video autoplay, SVG/iconos primero. PWA instalable (manifest + icons + splash).

### IV. Deterministic Rules Before AI
Cálculos (volumen = series×reps×peso, tonelaje, promedios, PR, cumplimiento) son código determinístico. IA no inventa números. IA = módulo independiente que interpreta/contextualiza/explica; la app funciona 100% sin IA. Proveedor AI intercambiable vía backend proxy, nunca claves en frontend.

### V. User Control & Transparency
Cada recomendación guarda fecha, motivo, datos usados y decisión del usuario (acepta/rechaza/modifica). Nunca control absoluto de IA. Recomendaciones etiquetadas como "Recomendación", con explicación "¿Por qué me recomienda esto?". No gamificación que incentive entrenar lesionado. Dolor importante ⇒ recomendar detener/modificar + consultar profesional, nunca diagnosticar.

## Additional Constraints

**Stack**: React 18 + TypeScript + Vite + Tailwind CSS + Dexie (IndexedDB) + Zustand (estado ligero) + Recharts/Chart.js + vite-plugin-pwa (Workbox). Hosting estático (Cloudflare Pages/Vercel/Netlify/GitHub Pages). Backend opcional Node+TS + Supabase free tier. Sin dependencias pagas obligatorias.

**Seguridad**: Nunca secretos en frontend/localStorage. Validar entradas, sanitizar, rate-limit si hay backend. Variables de entorno para proxies.

**Accesibilidad**: WCAG AA (contraste, targets táctiles ≥44px, labels ARIA, navegación teclado, no depender solo de color).

**Escalabilidad modular**: Separar `features/{training,nutrition,hydration,recovery,coach,progress}`, `services/{ai,storage,sync,notifications}`, `data/`, `workers/`. Cada módulo con contratos claros.

## Development Workflow

**Fases**: F1 MVP (PWA, IndexedDB, ejercicios, rutinas, registro, historial, progresión, calendario, dashboard) → F2 (hidratación, nutrición, recuperación, sueño, stats avanzadas) → F3 (motor recomendaciones, coach, periodización) → F4 (push, sync, backend, IA externa) → F5 (export avanzado, gamificación, análisis longitudinal).

**Calidad**: TDD donde aporte valor, tests de integración para storage/sync, type-safety estricto TS, code splitting verificado por bundle analyzer, Lighthouse PWA ≥90.

**Métrica de éxito**: Pantalla principal responde "¿Qué tengo que hacer hoy?" en <1s offline. Cualquier función crítica ≤2-3 interacciones.

## Governance

Esta constitución prevalece sobre cualquier spec/plan. Enmiendas requieren PR con justificación, impacto y plan de migración. Todo PR debe verificar compliance con I-V. Complejidad debe justificarse; preferir solución simple mantenible sobre feature excesiva.

**Version**: 1.0.0 | **Ratified**: 2026-09-07 | **Last Amended**: 2026-09-07
