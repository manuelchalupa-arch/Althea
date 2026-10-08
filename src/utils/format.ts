/** Nombre legible de un ejercicio a partir de su id (mismo criterio en toda la app). */
export function prettyExId(id: string | number): string {
  const raw = String(id)
  const short = raw.split('/').pop()?.replace(/-/g, ' ')
  return short ? short : raw
}
