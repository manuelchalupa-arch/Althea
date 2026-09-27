import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MacroRing } from './MacroRing'
import type { MacroGoals, MacroTotals } from '@/services/nutrition/macroService'

const goals: MacroGoals = { calories: 2100, protein: 150, carbs: 220, fat: 70 }
const zero: MacroTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 }

function pct(node: Element, macro: string): number {
  return Number(node.querySelector(`[data-macro="${macro}"]`)?.getAttribute('data-percent'))
}

function isOver(node: Element, macro: string): boolean {
  return node.querySelector(`[data-macro="${macro}"]`)?.getAttribute('data-over') === 'true'
}

describe('MacroRing — círculo central de macronutrientes', () => {
  it('renderiza tres segmentos, uno por macronutriente', () => {
    const { container } = render(<MacroRing totals={zero} goals={goals} />)
    expect(container.querySelector('[data-macro="carbs"]')).toBeInTheDocument()
    expect(container.querySelector('[data-macro="protein"]')).toBeInTheDocument()
    expect(container.querySelector('[data-macro="fat"]')).toBeInTheDocument()
  })

  it('el día vacío deja los tres segmentos en 0 %', () => {
    const { container } = render(<MacroRing totals={zero} goals={goals} />)
    expect(pct(container, 'carbs')).toBe(0)
    expect(pct(container, 'protein')).toBe(0)
    expect(pct(container, 'fat')).toBe(0)
  })

  it('cada segmento usa su propio porcentaje, no una proporción compartida', () => {
    // 50/220 carbs, 80/150 proteína, 30/70 grasas
    const { container } = render(
      <MacroRing totals={{ calories: 1480, carbs: 50, protein: 80, fat: 30 }} goals={goals} />
    )
    expect(pct(container, 'carbs')).toBeCloseTo((50 / 220) * 100, 1)
    expect(pct(container, 'protein')).toBeCloseTo((80 / 150) * 100, 1)
    expect(pct(container, 'fat')).toBeCloseTo((30 / 70) * 100, 1)
    // los tres son distintos: no hay una sola proporcion para todos
    expect(pct(container, 'carbs')).not.toBe(pct(container, 'protein'))
    expect(pct(container, 'protein')).not.toBe(pct(container, 'fat'))
  })

  it('un segmento puede llegar a 100 % sin arrastrar a los otros', () => {
    const { container } = render(
      <MacroRing totals={{ calories: 1000, carbs: 220, protein: 0, fat: 0 }} goals={goals} />
    )
    expect(pct(container, 'carbs')).toBeCloseTo(100, 5)
    expect(pct(container, 'protein')).toBe(0)
    expect(pct(container, 'fat')).toBe(0)
  })

  it('más de 100 % se marca como excedente sin romper el círculo', () => {
    const { container } = render(
      <MacroRing totals={{ calories: 2400, carbs: 330, protein: 60, fat: 0 }} goals={goals} />
    )
    // el porcentaje real se conserva, sin recortarse al 100
    expect(pct(container, 'carbs')).toBeCloseTo(150, 1)
    expect(isOver(container, 'carbs')).toBe(true)
    // los otros no quedan marcados
    expect(isOver(container, 'protein')).toBe(false)
    // el svg sigue renderizando los tres arcos
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(6)
  })

  it('el arco se dibuja a partir del porcentaje real (dasharray proporcional)', () => {
    const { container } = render(
      <MacroRing totals={{ calories: 1100, carbs: 110, protein: 150, fat: 35 }} goals={goals} />
    )
    const arc = container.querySelector('[data-macro="carbs"] circle:nth-of-type(2)')
    const dash = arc?.getAttribute('stroke-dasharray') ?? ''
    // 110/220 = 50 % del perímetro, no un valor inventado ni completo
    expect(dash).not.toBe('')
    const [filled] = dash.split(' ').map(Number)
    const perimetro = 2 * Math.PI * 84
    expect(filled / perimetro).toBeCloseTo(0.5, 2)
  })

  it('las calorías se muestran como dato central, no como segmento', () => {
    const { getByText } = render(
      <MacroRing totals={{ calories: 1480, carbs: 50, protein: 80, fat: 30 }} goals={goals} />
    )
    expect(getByText('1.480')).toBeInTheDocument()
    expect(getByText(/de 2\.100 kcal/)).toBeInTheDocument()
  })

  it('objetivos sin valor no rompen el círculo (division por cero)', () => {
    const { container } = render(
      <MacroRing totals={{ calories: 100, carbs: 10, protein: 10, fat: 10 }} goals={{ calories: 0, carbs: 0, protein: 0, fat: 0 }} />
    )
    expect(pct(container, 'carbs')).toBe(0)
    expect(pct(container, 'protein')).toBe(0)
    expect(pct(container, 'fat')).toBe(0)
  })

  it('expone los tres porcentajes a lectores de pantalla', () => {
    const { container } = render(
      <MacroRing totals={{ calories: 1480, carbs: 50, protein: 80, fat: 30 }} goals={goals} />
    )
    const label = container.querySelector('svg')?.getAttribute('aria-label') ?? ''
    expect(label).toContain('Carbohidratos: 50 de 220 gramos')
    expect(label).toContain('Proteínas: 80 de 150 gramos')
    expect(label).toContain('Grasas: 30 de 70 gramos')
  })
})
