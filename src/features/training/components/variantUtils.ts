export function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    equivalent: 'Equivalente',
    partial: 'Parcial',
    variant: 'Variante',
    regression: 'Regresion',
    progression: 'Progresion',
  }
  return labels[type] || type
}

export function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    equivalent: 'bg-primary/20 text-primary border-primary/30',
    partial: 'bg-secondary/20 text-secondary border-secondary/30',
    variant: 'bg-amber/20 text-amber border-amber/30',
    regression: 'bg-emerald/20 text-emerald border-emerald/30',
    progression: 'bg-purple/20 text-purple border-purple/30',
  }
  return colors[type] || 'bg-surface-container-high text-on-surface border-outline-variant'
}

export function getReasonIcon(reason: string): string {
  if (reason.includes('dolor') || reason.includes('Dolor')) return 'warning'
  if (reason.includes('equipamiento') || reason.includes('Equipamiento')) return 'weight'
  if (reason.includes('limitaci') || reason.includes('Limitaci')) return 'ban'
  if (reason.includes('progres') || reason.includes('Progres')) return 'trending_up'
  if (reason.includes('regres') || reason.includes('Regres')) return 'trending_down'
  return 'sync'
}