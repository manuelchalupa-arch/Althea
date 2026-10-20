/**
 * GPS Tracker — seguimiento en primer plano para actividades exteriores.
 *
 * Singleton a nivel de módulo: el estado sobrevive al desmontaje de la
 * página/modal, así que cerrar la ventana NO elimina ni reinicia la sesión.
 * Cerrar solo pausa explícitamente si estaba grabando (el componente decide
 * y lo informa); los puntos ya registrados se conservan.
 *
 * Los puntos exactos permanecen locales: solo el resumen (distancia,
 * tiempo activo) se persiste con la sesión.
 */

import { haversineMeters } from './activityService'

export type GpsTrackStatus = 'idle' | 'active' | 'paused'

export interface GpsTrackSnapshot {
  status: GpsTrackStatus
  activityId: string | null
  points: number
  distanceMeters: number
  /** Segundos activos acumulados (excluye pausas). */
  activeSeconds: number
  /** Velocidad instantánea en km/h, o null sin datos suficientes. */
  speedKmh: number | null
  startedAt: string | null
}

/** Precisión máxima aceptada para acumular distancia (metros). */
const MAX_ACCEPTABLE_ACCURACY_M = 50

interface Fix { lat: number; lon: number; time: number }

let status: GpsTrackStatus = 'idle'
let activityId: string | null = null
let startedAt: string | null = null
let watchId: number | null = null
let segmentStart: number | null = null
let activeSeconds = 0
let distanceMeters = 0
let pointCount = 0
let speedKmh: number | null = null
let lastFix: Fix | null = null

type Listener = (s: GpsTrackSnapshot) => void
const listeners = new Set<Listener>()

export function getGpsTrackState(): GpsTrackSnapshot {
  return {
    status, activityId, points: pointCount, distanceMeters: Math.round(distanceMeters),
    activeSeconds: Math.round(activeSeconds + currentSegmentSeconds()),
    speedKmh, startedAt,
  }
}

function emit() {
  const s = getGpsTrackState()
  for (const fn of listeners) {
    try { fn(s) } catch { /* noop */ }
  }
}

export function subscribeGpsTrack(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function currentSegmentSeconds(): number {
  if (status !== 'active' || segmentStart === null) { return 0 }
  return Math.max(0, (Date.now() - segmentStart) / 1000)
}

function closeSegment() {
  activeSeconds += currentSegmentSeconds()
  segmentStart = null
}

function clearWatch() {
  if (watchId !== null) {
    try { navigator.geolocation.clearWatch(watchId) } catch { /* noop */ }
    watchId = null
  }
}

function onPosition(pos: GeolocationPosition) {
  if (status !== 'active') { return }
  const coordsSpeed = pos.coords.speed
  if (coordsSpeed !== null && Number.isFinite(coordsSpeed) && coordsSpeed >= 0) {
    speedKmh = Math.round(coordsSpeed * 3.6 * 10) / 10
  }
  const acc = pos.coords.accuracy
  if (acc !== null && Number.isFinite(acc) && acc > MAX_ACCEPTABLE_ACCURACY_M) {
    return
  }
  const fix: Fix = { lat: pos.coords.latitude, lon: pos.coords.longitude, time: pos.timestamp }
  const prev = lastFix
  lastFix = fix
  pointCount++
  if (prev && pos.timestamp > prev.time) {
    const dt = (pos.timestamp - prev.time) / 1000
    if (dt > 0) {
      const d = haversineMeters(prev.lat, prev.lon, fix.lat, fix.lon)
      distanceMeters += d
      if (coordsSpeed === null || !Number.isFinite(coordsSpeed)) {
        speedKmh = Math.round(((d / dt) * 3.6) * 10) / 10
      }
    }
  }
  emit()
}

function onError(err: GeolocationPositionError) {
  void err
  emit()
}

function armWatch() {
  watchId = navigator.geolocation.watchPosition(onPosition, onError, {
    enableHighAccuracy: true, maximumAge: 1000, timeout: 15000,
  })
}

/**
 * Inicia una sesión de seguimiento. Si ya hay una activa o pausada para la
 * misma actividad, la conserva (no duplica). Lanza Error si no hay GPS.
 */
export function startGpsTrack(nextActivityId: string): void {
  if (!('geolocation' in navigator)) {
    throw new Error('Tu navegador no soporta geolocalización')
  }
  if (status !== 'idle') { return }
  activityId = nextActivityId
  startedAt = new Date().toISOString()
  activeSeconds = 0
  distanceMeters = 0
  pointCount = 0
  speedKmh = null
  lastFix = null
  status = 'active'
  segmentStart = Date.now()
  armWatch()
  emit()
}

/** Pausa el seguimiento conservando puntos, distancia y tiempo. */
export function pauseGpsTrack(): void {
  if (status !== 'active') { return }
  closeSegment()
  clearWatch()
  status = 'paused'
  emit()
}

/** Reanuda una sesión pausada sin perder lo registrado. */
export function resumeGpsTrack(): void {
  if (status !== 'paused') { return }
  if (!('geolocation' in navigator)) {
    throw new Error('Tu navegador no soporta geolocalización')
  }
  status = 'active'
  segmentStart = Date.now()
  armWatch()
  emit()
}

export interface GpsTrackSummary {
  distanceMeters: number
  activeSeconds: number
  points: number
  startedAt: string | null
  activityId: string | null
}

/** Finaliza y devuelve el resumen; reinicia el tracker a idle. */
export function stopGpsTrack(): GpsTrackSummary {
  closeSegment()
  clearWatch()
  const summary: GpsTrackSummary = {
    distanceMeters: Math.round(distanceMeters),
    activeSeconds: Math.round(activeSeconds),
    points: pointCount,
    startedAt,
    activityId,
  }
  status = 'idle'
  activityId = null
  startedAt = null
  activeSeconds = 0
  distanceMeters = 0
  pointCount = 0
  speedKmh = null
  lastFix = null
  emit()
  return summary
}

/** Descarta la sesión sin resumen (el usuario la cancela). */
export function discardGpsTrack(): void {
  stopGpsTrack()
}
