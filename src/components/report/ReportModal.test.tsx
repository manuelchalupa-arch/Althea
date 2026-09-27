import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { ReportModal } from '@/components/report/ReportModal'
import { isCompleteReport, categoriesForSection, generateReport, REPORT_SECTION_IDS } from '@/services/report/reportService'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'

const TODAY = todayKey()

describe('secciones de informe', () => {
  it('son exactamente 4', () => {
    expect(REPORT_SECTION_IDS).toEqual(['mediciones', 'entrenamiento', 'nutricion', 'recuperacion'])
  })

  it('entrenamiento expande a las 3 subcategorías internas', () => {
    expect(categoriesForSection('entrenamiento')).toEqual(['entrenamiento', 'fuerza', 'musculos'])
  })

  it('las demás se mapean 1:1', () => {
    expect(categoriesForSection('mediciones')).toEqual(['mediciones'])
    expect(categoriesForSection('nutricion')).toEqual(['nutricion'])
    expect(categoriesForSection('recuperacion')).toEqual(['recuperacion'])
  })

  it('las 4 secciones = informe completo', () => {
    expect(isCompleteReport(['mediciones', 'entrenamiento', 'fuerza', 'musculos', 'nutricion', 'recuperacion'])).toBe(true)
  })

  it('3 secciones no es informe completo', () => {
    expect(isCompleteReport(['mediciones', 'entrenamiento', 'fuerza', 'musculos', 'nutricion'])).toBe(false)
  })

  it('faltando fuerza/músculos tampoco es completo', () => {
    expect(isCompleteReport(['mediciones', 'entrenamiento', 'nutricion', 'recuperacion'])).toBe(false)
  })
})

describe('ReportModal', () => {
  beforeEach(async () => { await Promise.all(db.tables.map(t => t.clear())) })
  afterEach(() => { cleanup() })

  it('ofrece solo 3 períodos: semanal, mensual, personalizado', () => {
    render(<ReportModal open onClose={() => {}} />)
    expect(screen.getByTestId('report-period-7')).toBeTruthy()
    expect(screen.getByTestId('report-period-30')).toBeTruthy()
    expect(screen.getByTestId('report-period-custom')).toBeTruthy()
    expect(screen.queryByTestId('report-period-all')).toBeNull()
    expect(screen.queryByTestId('report-period-365')).toBeNull()
  })

  it('muestra las 4 secciones seleccionables', () => {
    render(<ReportModal open onClose={() => {}} />)
    for (const s of REPORT_SECTION_IDS) {
      expect(screen.getByTestId(`report-section-${s}`)).toBeTruthy()
    }
  })

  it('no muestra INFORME COMPLETO con una sola sección', () => {
    render(<ReportModal open onClose={() => {}} />)
    expect(screen.queryByTestId('report-complete-badge')).toBeNull()
  })

  it('muestra INFORME COMPLETO al seleccionar las 4', () => {
    render(<ReportModal open onClose={() => {}} />)
    // 'entrenamiento' viene activa por defecto: añadir las otras 3 completa el informe.
    for (const s of ['mediciones', 'nutricion', 'recuperacion']) {
      fireEvent.click(screen.getByTestId(`report-section-${s}`).querySelector('input')!)
    }
    expect(screen.getByTestId('report-complete-badge')).toBeTruthy()
  })

  it('deseleccionar una sección vuelve a informe parcial', () => {
    render(<ReportModal open onClose={() => {}} />)
    for (const s of ['mediciones', 'nutricion', 'recuperacion']) {
      fireEvent.click(screen.getByTestId(`report-section-${s}`).querySelector('input')!)
    }
    fireEvent.click(screen.getByTestId('report-section-entrenamiento').querySelector('input')!)
    expect(screen.queryByTestId('report-complete-badge')).toBeNull()
  })

  it('pide fechas cuando el período es personalizado', () => {
    render(<ReportModal open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('report-period-custom'))
    expect(screen.getByText('Desde')).toBeTruthy()
    expect(screen.getByText('Hasta')).toBeTruthy()
  })

  it('genera un informe real de mediciones', async () => {
    await db.bodyMeasurements.bulkPut([
      { id: 'm1', localDate: TODAY, weightKg: 80, bodyFatPct: 20, waistCm: 90, createdAt: new Date().toISOString() },
      { id: 'm2', localDate: TODAY, weightKg: 78.5, bodyFatPct: 19.2, waistCm: 88, createdAt: new Date().toISOString() },
    ] as never)
    render(<ReportModal open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('report-section-mediciones').querySelector('input')!)
    fireEvent.click(screen.getByTestId('report-generate'))
    // 'Mediciones' ya existe en el selector: esperar el contenido del informe.
    await waitFor(() => {
      expect(screen.getByText(/mediciones en el período/i)).toBeTruthy()
    }, { timeout: 8000 })
    const box = screen.getByText(/mediciones en el período/i).closest('section') as HTMLElement
    expect(box.textContent).toContain('80')
    expect(box.textContent).toContain('78.5')
    expect(box.textContent).toContain('-1.5 kg')
    expect(box.textContent).toContain('Cintura: 90 → 88 cm')
  })

  it('valida el período personalizado sin fechas', async () => {
    render(<ReportModal open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('report-period-custom'))
    fireEvent.click(screen.getByTestId('report-generate'))
    await waitFor(() => {
      expect(screen.getByText(/indicá inicio y fin/i)).toBeTruthy()
    })
  })

  it('descarga un PDF real con los datos del período y muestra el archivo', async () => {
    await db.bodyMeasurements.bulkPut([
      { id: 'p1', localDate: TODAY, weightKg: 80, bodyFatPct: 20, waistCm: 90, createdAt: new Date().toISOString() },
      { id: 'p2', localDate: TODAY, weightKg: 78.5, bodyFatPct: 19.2, waistCm: 88, createdAt: new Date().toISOString() },
    ] as never)
    const created: Blob[] = []
    const urls: string[] = []
    const createObjectURL = vi.fn((b: Blob) => { created.push(b); urls.push(`blob:althea/${urls.length}`); return urls[urls.length - 1] })
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<ReportModal open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('report-section-mediciones').querySelector('input')!)
    fireEvent.click(screen.getByTestId('report-generate'))
    await waitFor(() => { expect(screen.getByTestId('report-download')).toBeTruthy() }, { timeout: 8000 })

    fireEvent.click(screen.getByTestId('report-download'))
    await waitFor(() => { expect(screen.getByTestId('report-download-ok')).toBeTruthy() })

    expect(created).toHaveLength(1)
    expect(created[0].type).toBe('application/pdf')
    const head = new TextDecoder('latin1').decode(new Uint8Array(await created[0].arrayBuffer()).slice(0, 8))
    expect(head).toBe('%PDF-1.4')
    expect(click).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('report-download-ok').textContent).toMatch(/althea-informe-30-\d{4}-\d{2}-\d{2}\.pdf/)

    click.mockRestore()
    vi.unstubAllGlobals()
  })

  it('no permite descargar un período vacío', async () => {
    render(<ReportModal open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('report-section-mediciones').querySelector('input')!)
    fireEvent.click(screen.getByTestId('report-generate'))
    await waitFor(() => { expect(screen.getByTestId('report-download')).toBeTruthy() }, { timeout: 8000 })
    expect((screen.getByTestId('report-download') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/período vacío/i)).toBeTruthy()
  })

  it('informa el error si el navegador bloquea la descarga', async () => {
    await db.bodyMeasurements.put({ id: 'e1', localDate: TODAY, weightKg: 80, createdAt: new Date().toISOString() } as never)
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:althea/err'), revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('descarga bloqueada') })
    render(<ReportModal open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('report-section-mediciones').querySelector('input')!)
    fireEvent.click(screen.getByTestId('report-generate'))
    await waitFor(() => { expect(screen.getByTestId('report-download')).toBeTruthy() }, { timeout: 8000 })
    fireEvent.click(screen.getByTestId('report-download'))
    await waitFor(() => { expect(screen.getByTestId('report-download-error')).toBeTruthy() })
    expect(screen.getByTestId('report-download-error').textContent).toContain('descarga bloqueada')
    expect(screen.queryByTestId('report-download-ok')).toBeNull()
    click.mockRestore()
    vi.unstubAllGlobals()
  })

  it('no renderiza nada cuando está cerrado', () => {
    const { container } = render(<ReportModal open={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('generateReport con mediciones', () => {
  beforeEach(async () => { await Promise.all(db.tables.map(t => t.clear())) })

  it('devuelve mediciones null si no hay registros', async () => {
    const r = await generateReport({ period: '7', categories: ['mediciones'], today: TODAY })
    expect(r.mediciones).toBeUndefined()
    expect(r.isEmpty).toBe(true)
  })

  it('excluye registros demo', async () => {
    await db.bodyMeasurements.put({ id: 'd1', localDate: TODAY, weightKg: 99, isDemo: true, createdAt: new Date().toISOString() } as never)
    const r = await generateReport({ period: '7', categories: ['mediciones'], today: TODAY })
    expect(r.mediciones).toBeUndefined()
  })

  it('marca completo=false con una sola categoría', async () => {
    const r = await generateReport({ period: '7', categories: ['mediciones'], today: TODAY })
    expect(r.completo).toBe(false)
  })

  it('marca completo=true con las 6 categorías', async () => {
    const r = await generateReport({ period: '7', categories: ['mediciones', 'entrenamiento', 'fuerza', 'musculos', 'nutricion', 'recuperacion'], today: TODAY })
    expect(r.completo).toBe(true)
  })
})
