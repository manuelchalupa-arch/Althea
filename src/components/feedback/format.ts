/** Formato compacto de fecha/hora para los mensajes de Feedback. */
export function formatStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) { return '' }
  const date = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`
}

/** "Hace 5 min" / fecha completa para listados. */
export function formatActivity(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) { return '' }
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) { return 'Ahora' }
  if (diff < 3_600_000) { return `Hace ${Math.floor(diff / 60_000)} min` }
  if (diff < 86_400_000) { return `Hace ${Math.floor(diff / 3_600_000)} h` }
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}
