import { describe, it, expect } from 'vitest'
import { toMessage } from './auth'

describe('auth email (mensajes ES)', () => {
  it('mapea códigos conocidos', () => {
    expect(toMessage('auth/invalid-credential', 'x')).toBe('Correo o contraseña incorrectos.')
    expect(toMessage('auth/email-already-in-use', 'x')).toContain('ya está registrado')
    expect(toMessage('auth/weak-password', 'x')).toContain('6 caracteres')
  })
  it('fallback ante código desconocido', () => {
    expect(toMessage('auth/xyz', 'Sin conexión')).toBe('Sin conexión')
  })
})
