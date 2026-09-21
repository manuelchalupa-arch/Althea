import { describe, it, expect } from 'vitest'
import src from '@/services/codulia.ts?raw'
import { getCoduliaKey } from '@/services/codulia'

describe('Seguridad — sin secretos embebidos (Codulia)', () => {
  it('el fuente no contiene claves ni lectura de env de build', () => {
    expect(src).not.toMatch(/VITE_CODULIA_API_KEY/)
    expect(src).not.toMatch(/sk-[A-Za-z0-9]/)
    expect(src).not.toMatch(/x-api-key['"]\s*:\s*['"][A-Za-z0-9]/)
  })

  it('sin clave explícita del usuario el servicio queda deshabilitado, no roto', () => {
    localStorage.clear()
    expect(getCoduliaKey()).toBe('')
  })
})
