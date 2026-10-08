/** Nombre legible de un ejercicio a partir de su id (mismo criterio en toda la app). */
export function prettyExId(id: string | number): string {
  const raw = String(id)
  const short = raw.split('/').pop()?.replace(/-/g, ' ')
  return short ? short : raw
}

/** Separa los diacriticos (NFD) y los elimina: "café" -> "cafe". */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Minusculas + sin acentos. Forma canonica para busqueda y matching. */
export function normFold(s: string): string {
  return stripAccents(s.toLowerCase())
}
