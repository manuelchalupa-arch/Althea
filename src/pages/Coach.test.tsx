import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import { db } from '@/services/storage/db'
import Coach from './Coach'

// Pantalla real del Coach: la respuesta del asistente queda registrada con las
// fuentes que USÓ (sourcesUsed[]), no con el listado general de la app.

async function clearAll() {
  await Promise.all(db.tables.map(t => t.clear()))
  localStorage.clear()
}

describe('Coach — respuesta con evidencia visible', () => {
  beforeEach(async () => { await clearAll() })

  it('muestra las fuentes usadas debajo de la respuesta que las citó', async () => {
    const user = userEvent.setup()
    render(<Coach />)

    const input = await screen.findByLabelText('Mensaje para el Coach')
    await user.type(input, 'quiero hipertrofia, ¿cuántas series por semana?')
    await user.click(screen.getByLabelText('Enviar mensaje'))

    const sources = await screen.findByTestId('message-sources', undefined, { timeout: 15000 })
    expect(sources.textContent ?? '').toContain('Fuentes usadas en esta respuesta')
    // al menos una fuente real, con su nivel de evidencia
    const items = await screen.findAllByTestId('message-source')
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].textContent ?? '').toMatch(/\[1\]/)
    // la respuesta no puede citar ids crudos (fueron reescritos a [n])
    const bubbles = screen.getAllByText(/quiero|hipertrofia|series/i)
    expect(bubbles.length).toBeGreaterThan(0)
  }, 30000)

  it('una consulta sin evidencia responde sin inventar fuentes', async () => {
    const user = userEvent.setup()
    render(<Coach />)

    const input = await screen.findByLabelText('Mensaje para el Coach')
    const consulta = 'zxcvbnm qwertyuiop'
    await user.type(input, consulta)
    await user.click(screen.getByLabelText('Enviar mensaje'))

    await waitFor(() => {
      expect(screen.getByText(consulta)).toBeInTheDocument()
    }, { timeout: 15000 })
    // la respuesta local declara que no hay evidencia en vez de inventar una
    await waitFor(() => {
      expect(screen.getByText(/No tengo evidencia en la biblioteca/i)).toBeInTheDocument()
    }, { timeout: 15000 })
    expect(screen.queryByTestId('message-sources')).not.toBeInTheDocument()
  }, 30000)
})
