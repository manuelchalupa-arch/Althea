import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'

// Los tests corren en paralelo (pool: forks). Bajo carga de CPU, un render con
// efectos async puede tardar más que el `asyncUtilTimeout` por defecto de
// testing-library (1s) y producir un fallo INTERMITENTE que no reproduce en
// aislamiento. Se sube a 3s: suficiente para eliminar el flakiness sin esconder
// un fallo real, que seguiría apareciendo dentro de ese margen.
configure({ asyncUtilTimeout: 3000 })

// localStorage mínimo para node (sessionStore lo usa para activeSessionId).
const store = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  },
  writable: true,
  configurable: true,
})
