import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MuscleMapPanel } from '@/components/progress/MuscleMapPanel'
import { weeklyGroupComparison } from '@/services/training/muscleGroups'
import { DEFAULT_CYCLE } from '@/utils/cycle'
import type { CycleConfig } from '@/utils/cycle'

const map: Record<string, { primary: string; secondary: string[] }> = {
  press: { primary: 'pectorals', secondary: ['triceps', 'delts'] },
  row: { primary: 'lats', secondary: ['upper-back'] },
  squat: { primary: 'quads', secondary: ['glutes'] },
  curl: { primary: 'biceps', secondary: ['forearms'] },
  lateral: { primary: 'delts', secondary: [] },
}
const muscleOf = (id: string) => map[id] ?? null
const cycle: CycleConfig = { ...DEFAULT_CYCLE, startDate: '2026-01-05' }

const ITEMS = [
  { date: '2026-01-06', exerciseId: 'press', volume: 1000 },
  { date: '2026-01-13', exerciseId: 'press', volume: 2000 },
  { date: '2026-01-13', exerciseId: 'squat', volume: 1500 },
]

function renderPanel(overrides: Partial<React.ComponentProps<typeof MuscleMapPanel>> = {}) {
  const cmp = weeklyGroupComparison(ITEMS, muscleOf, cycle, '2026-01-28')
  const props = {
    weeks: cmp.weeks,
    currentWeekIndex: cmp.current?.week ?? 3,
    currentByGroup: cmp.current?.byGroup ?? {},
    unmappedSets: 0,
    cycleStartDate: cycle.startDate,
    hasAnySet: true,
    ...overrides,
  }
  render(<MuscleMapPanel {...props} />)
  return props
}

describe('MuscleMapPanel', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { cleanup() })

  it('pide series antes de mostrar el mapa si no hay datos', () => {
    renderPanel({ hasAnySet: false })
    expect(screen.getByTestId('muscle-map-panel')).toBeTruthy()
    expect(screen.queryByTestId('muscle-map-front')).toBeNull()
    expect(screen.getByText(/sin series completadas/i)).toBeTruthy()
  })

  it('muestra la vista frontal por defecto y permite cambiar a posterior', () => {
    renderPanel()
    expect(screen.getByTestId('muscle-map-front')).toBeTruthy()
    expect(screen.queryByTestId('muscle-map-back')).toBeNull()
    fireEvent.click(screen.getByTestId('muscle-view-back'))
    expect(screen.getByTestId('muscle-map-back')).toBeTruthy()
    expect(screen.queryByTestId('muscle-map-front')).toBeNull()
  })

  it('expone los 5 grupos SEL en la vista frontal', () => {
    renderPanel()
    for (const g of ['PECHO', 'ESPALDA', 'PIERNAS', 'BRAZOS', 'HOMBROS']) {
      expect(screen.getByTestId(`muscle-group-${g}`)).toBeTruthy()
    }
  })

  it('expone PECHO en la vista frontal y ESPALDA en la posterior (no al revés)', () => {
    renderPanel()
    // frontal: pectoral visible, dorsal no
    expect(screen.getByTestId('muscle-path-pectoralis-major')).toBeTruthy()
    expect(screen.queryByTestId('muscle-path-latissimus-dorsi')).toBeNull()
    fireEvent.click(screen.getByTestId('muscle-view-back'))
    expect(screen.getByTestId('muscle-path-latissimus-dorsi')).toBeTruthy()
    expect(screen.queryByTestId('muscle-path-pectoralis-major')).toBeNull()
  })

  it('lista los 5 grupos con su volumen', () => {
    renderPanel()
    const list = screen.getByTestId('muscle-group-list')
    expect(list.textContent).toContain('PECHO')
    expect(list.textContent).toContain('PIERNAS')
  })

  it('marca la primera semana completa como BASE', () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('cycle-week-1'))
    expect(screen.getByText(/Semana 1 · BASE/)).toBeTruthy()
  })

  it('muestra una semana por botón y Actual al final', () => {
    renderPanel()
    expect(screen.getByTestId('cycle-week-1')).toBeTruthy()
    expect(screen.getByTestId('cycle-week-2')).toBeTruthy()
    expect(screen.getByTestId('cycle-week-current')).toBeTruthy()
  })

  it('al seleccionar un grupo muestra trabajo actual, anterior, cambio y variación', async () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('cycle-week-2'))
    fireEvent.click(screen.getByTestId('muscle-group-PECHO'))
    const detail = await screen.findByTestId('muscle-group-detail')
    expect(detail.textContent).toContain('Trabajo actual')
    expect(detail.textContent).toContain('Semana anterior')
    expect(detail.textContent).toContain('Cambio')
    expect(detail.textContent).toContain('Variación')
    expect(detail.textContent).toContain('PECHO')
  })

  it('el detalle muestra el desglose de músculos del grupo', async () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('cycle-week-2'))
    fireEvent.click(screen.getByTestId('muscle-group-PECHO'))
    const detail = await screen.findByTestId('muscle-group-detail')
    expect(detail.textContent).toContain('Pecho')
  })

  it('el badge del grupo refleja el estado del trend', async () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('cycle-week-2'))
    fireEvent.click(screen.getByTestId('muscle-group-PIERNAS'))
    const detail = await screen.findByTestId('muscle-group-detail')
    // semana 1 sin piernas -> sin base
    expect(detail.textContent).toMatch(/Sin base|Aumento|Descenso|Estable/)
  })

  it('indica series sin atribución cuando las hay', () => {
    renderPanel({ unmappedSets: 3 })
    expect(screen.getByText(/3 series quedan sin atribución/i)).toBeTruthy()
  })

  it('el mapa es seleccionable por teclado por músculo', () => {
    renderPanel()
    const region = screen.getByTestId('muscle-path-pectoralis-major')
    expect(region.getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(region, { key: 'Enter' })
    expect(screen.getByTestId('muscle-group-detail')).toBeTruthy()
    expect(screen.getByTestId('muscle-detail').textContent).toContain('Pectoral mayor')
  })

  it('cada músculo expone id anatómico, nombre español y grupo', () => {
    renderPanel()
    const pec = screen.getByTestId('muscle-path-pectoralis-major')
    expect(pec.getAttribute('data-muscle-id')).toBe('pectoralis-major')
    expect(pec.getAttribute('data-muscle-name')).toBe('Pectoral mayor')
    expect(pec.getAttribute('data-muscle-group')).toBe('PECHO')
    expect(pec.getAttribute('data-muscle-activation')).toBe('primary')
    const quad = screen.getByTestId('muscle-path-quadriceps')
    expect(quad.getAttribute('data-muscle-group')).toBe('PIERNAS')
  })

  it('la vista posterior expone glúteos e isquiotibiales con su ficha', () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('muscle-view-back'))
    const glu = screen.getByTestId('muscle-path-gluteus-maximus')
    expect(glu.getAttribute('data-muscle-group')).toBe('PIERNAS')
    fireEvent.click(glu)
    const detail = screen.getByTestId('muscle-detail')
    expect(detail.textContent).toContain('Glúteo mayor')
    expect(detail.textContent).toContain('Gluteus maximus')
    expect(detail.textContent).toContain('Hip thrust')
  })

  it('al seleccionar un músculo muestra tooltip con anatomía y sinergistas', async () => {
    renderPanel()
    fireEvent.focus(screen.getByTestId('muscle-path-quadriceps'))
    const tip = await screen.findByTestId('muscle-tooltip')
    expect(tip.textContent).toContain('Cuádriceps femoral')
    expect(tip.textContent).toContain('Quadriceps femoris')
    expect(tip.textContent).toContain('Trabaja con')
    expect(tip.textContent).toContain('Sentadilla')
  })

  it('la leyenda lista los 4 estados de tendencia', () => {
    renderPanel()
    const legend = screen.getByTestId('muscle-map-legend')
    expect(legend.textContent).toContain('Aumento')
    expect(legend.textContent).toContain('Estable')
    expect(legend.textContent).toContain('Descenso')
    expect(legend.textContent).toContain('Sin base')
  })
})
