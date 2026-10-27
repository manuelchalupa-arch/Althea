export function isStretchingExercise(ex: { id?: string; name?: string; pattern?: string; tags?: string[]; equipment?: string; category?: string }): boolean {
  const id = (ex.id || '').toLowerCase()
  if (id.includes('stretch') || id.includes('movilidad') || id.includes('calentamiento')) { return true }
  const name = (ex.name || '').toLowerCase()
  if (name.includes('estiramiento') || name.includes('movilidad') || name.includes('calentamiento')) { return true }
  const p = (ex.pattern || '').toLowerCase()
  if (['stretch', 'mobilization', 'mobility', 'foam_rolling', 'dynamic'].includes(p)) { return true }
  const tags = (ex.tags || []).map((t) => t.toLowerCase())
  if (tags.includes('stretching') || tags.includes('estiramiento') || tags.includes('movilidad') || tags.includes('calentamiento')) { return true }
  const eq = (ex.equipment || '').toLowerCase()
  // aditamentos típicos de estiramiento/movilidad
  if (eq === 'banda' || eq === 'pelota' || eq === 'foam roller' || eq === 'foam_roller') { return true }
  const cat = (ex.category || '').toLowerCase()
  return cat === 'stretching'
}
