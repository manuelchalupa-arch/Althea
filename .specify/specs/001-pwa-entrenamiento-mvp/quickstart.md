# Quickstart – PWA Entrenamiento

## Requisitos
- Node 20+, pnpm/npm
- Chrome/Edge para PWA install test

## Instalación
```bash
cd train-pwa
npm install
npm run dev      # http://localhost:5173
npm run build    # vite build + pwa precache
npm run preview  # sirve build con SW activo
npx vitest run   # tests
```

## Verificar PWA
1. `npm run build && npm run preview`
2. Chrome DevTools → Application → Manifest → debe mostrar icons + display standalone
3. Lighthouse → PWA ≥90
4. Offline: DevTools → Network offline → recargar → app shell debe cargar + IndexedDB datos visibles
5. Install: barra de dirección → Install icon

## Demo data
Más → Cargar datos de demostración (inserta 4 semanas de sesiones) / Eliminar datos demo.

## Export/Import
Más → Exportar JSON → descarga `trainpwa-backup-YYYY-MM-DD.json`
Más → Importar JSON → selecciona archivo → valida + restaura.

## Estructura seeds
`src/data/exercises.json` contiene 80 ejercicios; editado genera nuevo seed con `npm run seed:exercises`.
