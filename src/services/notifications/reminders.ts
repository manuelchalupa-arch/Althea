// CAPA COMÚN DE RECORDATORIOS (FASE FINAL R4).
//
// Lee las DOS tablas existentes — `notifConfigs` (sistema histórico, el único
// que hasta ahora disparaba) y `unifiedNotifConfigs` (sistema unificado, que
// hasta ahora solo gobernaba las acciones obligatorias) — sin migrarlas, sin
// cambiar identificadores y sin reescribir configuraciones: cada UI sigue
// escribiendo en su tabla de siempre. Normaliza ambos a un mismo modelo y
// aplica la regla EXPLÍCITA de conflicto:
//
//   Por (tipo, fecha y hora) se notifica UNA sola vez y con prioridad el
//   sistema histórico. Si el histórico no tiene nada habilitado/disparado a
//   esa hora, dispara el unificado. Los tipos sin equivalente histórico
//   (comer, preparar_habitacion, otro) disparan libremente. Los valores de
//   ambos sistemas se conservan siempre: nada se borra ni se apaga.
//
// El unificado NO aplica las "puertas de realidad" del histórico (p. ej. agua
// ya tomada): la UI de recordatorios promete que el aviso sigue igual
// (DailyRemindersConfig). Solo respeta día/hora/permiso y el gate de día de
// entrenamiento para tipo 'entrenamiento', igual que el histórico.
import {
  loadConfigs, firedId, localDateStr, localTimeStr, localDayIdx,
  type NotifConfig, type NotifKind,
} from './scheduler'
import { loadUnifiedConfigs, type UnifiedNotifConfig, type NotifType } from './unifiedNotifications'

export type ReminderKind = NotifKind | NotifType

export interface NormalizedReminder {
  source: 'legacy' | 'unified'
  id: string
  kind: ReminderKind
  title: string
  enabled: boolean
  times: string[]
  days: boolean[]
  extra?: string
}

// Tipos con equivalente en el sistema histórico: compiten por (tipo, hora).
export const LEGACY_OVERLAP: ReadonlySet<string> = new Set(['agua', 'recuperacion', 'entrenamiento'])

export function normalizeLegacy(cfgs: NotifConfig[]): NormalizedReminder[] {
  return cfgs.map((c) => ({
    source: 'legacy' as const, id: c.id, kind: c.kind, title: c.title,
    enabled: c.enabled, times: c.times, days: c.days, extra: c.extra,
  }))
}

export function normalizeUnified(cfgs: UnifiedNotifConfig[]): NormalizedReminder[] {
  return cfgs.map((c) => ({
    source: 'unified' as const, id: c.id, kind: c.type, title: c.title,
    enabled: c.enabled,
    // preparar_habitacion usa solo `time` (regla propia de esa tabla).
    times: c.type === 'preparar_habitacion' ? [c.time] : c.times,
    days: c.days,
  }))
}

// Lectura común de ambas tablas (compatibles con los datos ya existentes).
export async function loadReminders(): Promise<NormalizedReminder[]> {
  const [legacy, unified] = await Promise.all([loadConfigs(), loadUnifiedConfigs()])
  return [...normalizeLegacy(legacy), ...normalizeUnified(unified)]
}

// `(tipo|hora)` que el sistema histórico ya notificó hoy. Se construye con el
// set de disparos ACTUALIZADO (después de que el histórico corra).
export function legacyFiredKindTime(
  cfgs: Array<{ kind: string; times: string[]; id: string }>,
  date: string,
  fired: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>()
  for (const c of cfgs) {
    for (const t of c.times) {
      if (fired.has(firedId(c.id, date, t))) { out.add(`${c.kind}|${t}`) }
    }
  }
  return out
}

// Pura y testeable: recordatorios unificados que vencen AHORA, sin duplicar lo
// que el histórico ya notificó a la misma hora.
export function dueReminders(
  unified: NormalizedReminder[],
  now: Date,
  legacyKindTime: ReadonlySet<string>,
  isTrainingDay: (dateStr: string) => boolean = () => false,
  fired: ReadonlySet<string> = new Set(),
): NormalizedReminder[] {
  const date = localDateStr(now)
  const time = localTimeStr(now)
  const day = localDayIdx(now)
  return unified.filter((c) => {
    if (!c.enabled || !c.days[day]) { return false }
    if (c.kind === 'entrenamiento' && !isTrainingDay(date)) { return false }
    return c.times.some((t) => {
      if (t > time || fired.has(firedId(c.id, date, t))) { return false }
      // Regla de conflicto: el histórico tiene prioridad por (tipo, hora).
      if (LEGACY_OVERLAP.has(c.kind) && legacyKindTime.has(`${c.kind}|${t}`)) { return false }
      return true
    })
  })
}

// Cuerpo de la notificación unificada: reutiliza el del histórico cuando el
// tipo coincide; si no, el título.
export function unifiedBody(c: NormalizedReminder, legacyBody: (k: NotifKind) => string): string {
  return LEGACY_OVERLAP.has(c.kind) ? legacyBody(c.kind as NotifKind) : c.title
}
