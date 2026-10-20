import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { db } from '@/services/storage/db'
import ActivityModal from './ActivityModal'
import ActivityWorkspace from './ActivityWorkspace'
import {
  getGpsTrackState,
  startGpsTrack,
  pauseGpsTrack,
  resumeGpsTrack,
  stopGpsTrack,
  subscribeGpsTrack,
} from '@/services/activity/gpsTracker'

vi.mock('@/services/ai/aiService', () => ({
  aiService: { getChatCompletion: vi.fn().mockResolvedValue({ content: '' }) },
}))

async function clearActivity() {
  await db.activitySessions.clear().catch(() => {})
}

function mockGeolocation() {
  let nextId = 1
  const watches = new Map<number, { ok: PositionCallback; err?: PositionErrorCallback }>()
  const geo = {
    watchPosition: vi.fn((ok: PositionCallback, err?: PositionErrorCallback) => {
      const id = nextId++
      watches.set(id, { ok, err })
      return id
    }),
    clearWatch: vi.fn((id: number) => { watches.delete(id) }),
    __watches: watches,
  }
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true, writable: true })
  return geo
}

function fixAt(geo: ReturnType<typeof mockGeolocation>, lat: number, lon: number, speed: number | null, accuracy = 5) {
  fixAt.t += 5000
  const now = Date.now() + fixAt.t
  for (const [, w] of geo.__watches) {
    w.ok({
      coords: {
        latitude: lat, longitude: lon, accuracy, speed,
        altitude: null, altitudeAccuracy: null, heading: null,
      },
      timestamp: now,
    } as GeolocationPosition)
  }
}
fixAt.t = 0

describe('ActivityModal', () => {
  beforeEach(clearActivity)

  it('muestra dialog accesible con título y botón cerrar', () => {
    render(<ActivityModal onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(within(dialog).getAllByRole('heading', { name: 'Actividad libre' }).length).toBeGreaterThanOrEqual(1)
    expect(within(dialog).getByLabelText('Cerrar actividad')).toBeInTheDocument()
  })

  it('Escape llama onClose', () => {
    const onClose = vi.fn()
    render(<ActivityModal onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('se monta con portal en document.body, fuera del stacking context de la página', () => {
    const host = document.createElement('div')
    host.style.position = 'relative'
    host.style.zIndex = '10'
    document.body.appendChild(host)
    const { unmount } = render(<ActivityModal onClose={() => {}} />, { container: host })
    const dialog = screen.getByRole('dialog')
    expect(document.body.contains(dialog)).toBe(true)
    expect(host.contains(dialog)).toBe(false)
    unmount()
    document.body.removeChild(host)
  })

  it('usa sheet de viewport dinámico en móvil con scroll interno', () => {
    render(<ActivityModal onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toMatch(/h-\[100dvh\]/)
    const scroller = dialog.querySelector('.overflow-y-auto')
    expect(scroller).not.toBeNull()
  })

  it('clic en el fondo cierra, clic en el contenido no', () => {
    const onClose = vi.fn()
    render(<ActivityModal onClose={onClose} />)
    const dialog = screen.getByRole('dialog')
    const overlay = dialog.parentElement as HTMLElement
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('contiene la funcionalidad completa: catálogo, fecha, RPE, guardar e historial', () => {
    render(<ActivityModal onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    const q = within(dialog)
    expect(q.getByLabelText('Actividad')).toBeInTheDocument()
    expect(q.getByLabelText('Fecha')).toBeInTheDocument()
    expect(q.getByLabelText('Hora')).toBeInTheDocument()
    expect(q.getByLabelText('Duración (minutos)')).toBeInTheDocument()
    expect(q.getByRole('group', { name: /Esfuerzo percibido/ })).toBeInTheDocument()
    expect(q.getByRole('button', { name: 'Guardar sesión' })).toBeInTheDocument()
  })

  it('la escala tiene exactamente 1–5, con 1 verde y 5 rojo', () => {
    render(<ActivityModal onClose={() => {}} />)
    const group = within(screen.getByRole('dialog')).getByRole('group', { name: /Esfuerzo percibido/ })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['1', '2', '3', '4', '5'])
    expect(buttons[0].className).toContain('bg-green-600')
    expect(buttons[4].className).toContain('bg-red-600')
  })

  it('el selector guarda el valor elegido y muestra su descripción', async () => {
    render(<ActivityModal onClose={() => {}} />)
    const group = within(screen.getByRole('dialog')).getByRole('group', { name: /Esfuerzo percibido/ })
    fireEvent.click(within(group).getByRole('button', { name: /Esfuerzo 4/ }))
    expect(screen.getByText('4 · Intenso')).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: /Esfuerzo 4/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('guardar con RPE 4 persiste el valor y aparece en el historial', async () => {
    render(<ActivityModal onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    const q = within(dialog)
    fireEvent.change(q.getByLabelText('Actividad'), { target: { value: 'caminar' } })
    const group = q.getByRole('group', { name: /Esfuerzo percibido/ })
    fireEvent.click(within(group).getByRole('button', { name: /Esfuerzo 4/ }))
    fireEvent.click(q.getByRole('button', { name: 'Guardar sesión' }))
    await waitFor(() => {
      expect(screen.getByText('Sesión guardada en tu historial.')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText(/RPE 4/)).toBeInTheDocument()
    })
  })

  it('cerrar y reabrir no pierde el historial', async () => {
    const { unmount } = render(<ActivityModal onClose={() => {}} />)
    const q = within(screen.getByRole('dialog'))
    fireEvent.change(q.getByLabelText('Actividad'), { target: { value: 'caminar' } })
    fireEvent.click(q.getByRole('button', { name: 'Guardar sesión' }))
    await waitFor(() => {
      expect(screen.getByText('Sesión guardada en tu historial.')).toBeInTheDocument()
    })
    unmount()
    render(<ActivityModal onClose={() => {}} />)
    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByText(/RPE 3/)).toBeInTheDocument()
    })
  })
})

describe('ActivityWorkspace — distancia por actividad', () => {
  beforeEach(clearActivity)

  it('muestra distancia en correr y la oculta en fútbol', () => {
    render(<ActivityModal onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    const q = within(dialog)
    fireEvent.change(q.getByLabelText('Actividad'), { target: { value: 'correr' } })
    expect(q.getByLabelText('Distancia (km, opcional)')).toBeInTheDocument()
    fireEvent.change(q.getByLabelText('Actividad'), { target: { value: 'futbol' } })
    expect(q.queryByLabelText('Distancia (km, opcional)')).not.toBeInTheDocument()
  })

  it('cinta muestra pendiente y bici fija muestra vatios', () => {
    render(<ActivityModal onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    const q = within(dialog)
    fireEvent.change(q.getByLabelText('Actividad'), { target: { value: 'cinta_correr' } })
    expect(q.getByLabelText(/Pendiente/)).toBeInTheDocument()
    fireEvent.change(q.getByLabelText('Actividad'), { target: { value: 'bicicleta_fija' } })
    expect(q.getByLabelText(/Potencia/)).toBeInTheDocument()
    expect(q.getByLabelText(/máquina/)).toBeInTheDocument()
  })

  it('guarda distancia manual con resumen de método y km', async () => {
    render(<ActivityModal onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    const q = within(dialog)
    fireEvent.change(q.getByLabelText('Actividad'), { target: { value: 'correr' } })
    fireEvent.change(q.getByLabelText('Distancia (km, opcional)'), { target: { value: '5' } })
    fireEvent.click(q.getByRole('button', { name: 'Guardar sesión' }))
    await waitFor(() => {
      expect(screen.getByText('Sesión guardada en tu historial.')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText(/5 km \(manual\)/)).toBeInTheDocument()
    })
  })
})

describe('gpsTracker — la sesión sobrevive al modal', () => {
  let geo: ReturnType<typeof mockGeolocation>

  beforeEach(() => {
    geo = mockGeolocation()
    stopGpsTrack()
  })

  afterEach(() => {
    stopGpsTrack()
  })

  it('start → pause conserva puntos, distancia y tiempo', () => {
    startGpsTrack('correr')
    expect(getGpsTrackState().status).toBe('active')
    fixAt(geo, -34.6, -58.38, 3)
    fixAt(geo, -34.6005, -58.38, 3)
    pauseGpsTrack()
    const s = getGpsTrackState()
    expect(s.status).toBe('paused')
    expect(s.points).toBeGreaterThan(0)
    expect(s.distanceMeters).toBeGreaterThan(0)
  })

  it('cerrar la ventana (unmount) no detiene ni reinicia el seguimiento', async () => {
    startGpsTrack('correr')
    fixAt(geo, -34.6, -58.38, 3)
    const { unmount } = render(<ActivityWorkspace />)
    unmount()
    const s = getGpsTrackState()
    expect(s.status).toBe('active')
    expect(s.points).toBeGreaterThan(0)
  })

  it('resume continúa sin perder lo registrado y stop devuelve resumen', () => {
    startGpsTrack('correr')
    fixAt(geo, -34.6, -58.38, 3)
    pauseGpsTrack()
    const pausedPoints = getGpsTrackState().points
    resumeGpsTrack()
    expect(getGpsTrackState().status).toBe('active')
    fixAt(geo, -34.601, -58.38, 3)
    const summary = stopGpsTrack()
    expect(summary.points).toBeGreaterThanOrEqual(pausedPoints)
    expect(getGpsTrackState().status).toBe('idle')
  })

  it('los suscriptores reciben actualizaciones', () => {
    const seen: string[] = []
    const off = subscribeGpsTrack((s) => seen.push(s.status))
    startGpsTrack('caminar')
    pauseGpsTrack()
    off()
    expect(seen).toContain('active')
    expect(seen).toContain('paused')
  })
})
