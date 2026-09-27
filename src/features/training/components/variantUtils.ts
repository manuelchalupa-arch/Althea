export function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    equivalent: 'Equivalente',
    partial: 'Parcial',
    variant: 'Variante',
    regression: 'Regresión',
    progression: 'Progresión',
  }
  return labels[type] || type
}

// Tokens Althea reales (amber/emerald/purple no existen en el palette → muertos)
export function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    equivalent: 'bg-primary/15 text-primary border-primary/30',
    partial: 'bg-secondary/15 text-secondary border-secondary/30',
    variant: 'bg-tertiary/15 text-tertiary border-tertiary/30',
    regression: 'bg-secondary-container text-on-secondary-container border-secondary/35',
    progression: 'bg-primary-container text-on-primary-container border-primary/35',
  }
  return colors[type] || 'bg-surface-container-high text-on-surface border-outline-variant'
}

// Claves cortas del motor → texto legible. Si ya viene una frase (dolor severo…) se muestra tal cual.
export function getReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    pain: 'Dolor',
    equipment: 'Equipamiento',
    limitation: 'Limitación',
    dislike: 'Preferencia',
    user_request: 'Pedido tuyo',
    fatigue: 'Fatiga',
    progression: 'Progresión',
    regression: 'Regresión',
  }
  if (labels[reason]) {return labels[reason]}
  return reason
}
