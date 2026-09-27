# Proveedor nutricional (FASE 3)

La UI (`Nutricion.tsx`) nunca llama a una API directamente: usa
`src/services/nutrition/foodProvider.ts`.

## Proveedores

| Proveedor | Estado | Configuración |
|-----------|--------|---------------|
| Codulia | Funcional con clave explícita | El usuario carga su propia `x-api-key` con `setFoodApiKey()` (solo su dispositivo). Sin clave → error honesto, sin alimentos inventados. |
| API Ninjas | Interfaz lista, **no desplegado** | Requiere proxy server-side (la clave no puede vivir en el frontend). `isConfigured()` es `false` hasta entonces. |

## Capacidades

- Buscar por texto → `provider.search(q)`
- Código de barras → `provider.barcode(code)` (endpoint Codulia `GET /foods/barcode/:code`; requiere clave; `null` si no existe)
- Detalle + porciones → `provider.detail(id)`
- Foto → `TOMAR FOTO` adjunta la imagen como evidencia y el usuario transcribe la etiqueta en el formulario manual. Un OCR real (p. ej. Tesseract) queda como mejora futura documentada; NO se simula.

## Reglas

- Ningún proveedor registra consumo: devuelven candidatos, el usuario confirma.
- Nunca inventar calorías/macros.
- La fuente canónica de registros sigue siendo Dexie (`nutritionDiary`).
