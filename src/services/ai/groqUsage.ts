const STORAGE_KEY = 'groq:usage'
const FREE_TIER = { rpm: 30, tpm: 8000, rpd: 1000 }

interface UsageWindow {
  minuteStart: number
  minuteCount: number
  minuteTokens: number
  day: string
  dayCount: number
}

function now(): number { return Date.now() }
function todayStr(): string { return new Date().toISOString().slice(0, 10) }

function load(): UsageWindow {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {return JSON.parse(raw)}
  } catch {}
  return { minuteStart: now(), minuteCount: 0, minuteTokens: 0, day: todayStr(), dayCount: 0 }
}

function save(w: UsageWindow) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(w)) } catch {}
}

function resetMinuteIfNeeded(w: UsageWindow): UsageWindow {
  if (now() - w.minuteStart > 60_000) {
    return { ...w, minuteStart: now(), minuteCount: 0, minuteTokens: 0 }
  }
  return w
}

function resetDayIfNeeded(w: UsageWindow): UsageWindow {
  if (w.day !== todayStr()) {
    return { ...w, day: todayStr(), dayCount: 0 }
  }
  return w
}

export function canMakeRequest(): { ok: boolean; reason?: string } {
  let w = load()
  w = resetMinuteIfNeeded(w)
  w = resetDayIfNeeded(w)

  if (w.dayCount >= FREE_TIER.rpd) {return { ok: false, reason: 'Límite diario alcanzado (1000 requests). Se renueva mañana.' }}
  if (w.minuteCount >= FREE_TIER.rpm) {return { ok: false, reason: 'Límite por minuto alcanzado (30 RPM). Esperá ~60 segundos.' }}
  return { ok: true }
}

export function recordRequest(estimatedTokens: number = 300) {
  let w = load()
  w = resetMinuteIfNeeded(w)
  w = resetDayIfNeeded(w)
  w.minuteCount++
  w.minuteTokens += estimatedTokens
  w.dayCount++
  save(w)
}

export function getUsage(): { dayPct: number; dayUsed: number; dayTotal: number; minuteUsed: number; minuteTotal: number; minuteTokens: number; minuteTokensTotal: number } {
  let w = load()
  w = resetMinuteIfNeeded(w)
  w = resetDayIfNeeded(w)
  save(w)
  return {
    dayPct: Math.round((w.dayCount / FREE_TIER.rpd) * 100),
    dayUsed: w.dayCount,
    dayTotal: FREE_TIER.rpd,
    minuteUsed: w.minuteCount,
    minuteTotal: FREE_TIER.rpm,
    minuteTokens: w.minuteTokens,
    minuteTokensTotal: FREE_TIER.tpm,
  }
}

export function getResetInfo(): { nextMinuteReset: string; nextDayReset: string } {
  let w = load()
  const msSinceMinute = now() - w.minuteStart
  const msToMinuteReset = Math.max(0, 60_000 - msSinceMinute)
  const nowDate = new Date()
  const tomorrow = new Date(nowDate)
  tomorrow.setHours(24, 0, 0, 0)
  const msToDayReset = tomorrow.getTime() - nowDate.getTime()
  return {
    nextMinuteReset: `${Math.ceil(msToMinuteReset / 1000)}s`,
    nextDayReset: `${Math.ceil(msToDayReset / 60_000)}min`,
  }
}
