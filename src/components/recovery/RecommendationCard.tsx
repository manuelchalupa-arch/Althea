import { AlertCircle, Lightbulb, CheckCircle, XCircle, HelpCircle } from 'lucide-react'
import { AltheaButton, AltheaCard } from '@/components/althea'

export interface Recommendation {
  id: string
  type: 'recovery' | 'training' | 'nutrition' | 'sleep' | 'hydration'
  title: string
  description: string
  reasoning: string
  evidence: string[]
  action?: {
    label: string
    type: 'accept' | 'modify' | 'dismiss'
    payload?: any
  }
  severity: 'info' | 'warning' | 'critical'
  timestamp: string
}

interface RecommendationCardProps {
  recommendation: Recommendation
  onAction: (recommendationId: string, action: 'accept' | 'modify' | 'dismiss', payload?: any) => void
  showWhy?: boolean
  onToggleWhy?: () => void
}

const SEVERITY_COLORS = {
  info: 'border-primary/30 bg-primary/10 text-primary',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  critical: 'border-error/30 bg-error/10 text-error',
}

const SEVERITY_ICONS = {
  info: Lightbulb,
  warning: AlertCircle,
  critical: AlertCircle,
}

const TYPE_LABELS: Record<string, string> = {
  recovery: 'Recuperación',
  training: 'Entrenamiento',
  nutrition: 'Nutrición',
  sleep: 'Sueño',
  hydration: 'Hidratación',
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  recovery: Lightbulb,
  training: Lightbulb,
  nutrition: Lightbulb,
  sleep: Lightbulb,
  hydration: Lightbulb,
}

export function RecommendationCard({
  recommendation,
  onAction,
  showWhy = false,
  onToggleWhy,
}: RecommendationCardProps) {
  const SeverityIcon = SEVERITY_ICONS[recommendation.severity]
  const TypeIcon = TYPE_ICONS[recommendation.type]

  const handleAction = (action: 'accept' | 'modify' | 'dismiss') => {
    onAction(recommendation.id, action, recommendation.action?.payload)
  }

  return (
    <AltheaCard className={`p-4 transition-all ${SEVERITY_COLORS[recommendation.severity]}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 pt-0.5">
          <SeverityIcon className="text-lg" size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <TypeIcon className="text-primary" size={16} />
            <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-primary">
              {TYPE_LABELS[recommendation.type]}
            </span>
            <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
              {recommendation.severity.toUpperCase()}
            </span>
          </div>
          <h3 className="font-body-md text-lg font-semibold text-on-surface">{recommendation.title}</h3>
          <p className="font-body-md text-sm text-on-surface-variant mt-1">{recommendation.description}</p>

          {showWhy && (
            <div className="mt-3 pt-3 border-t border-outline-variant/30 space-y-2">
              <div className="flex items-center gap-2">
                <HelpCircle className="text-secondary" size={16} />
                <span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-secondary">¿POR QUÉ?</span>
              </div>
              <p className="font-body-md text-sm text-on-surface-variant ml-6">{recommendation.reasoning}</p>
              {recommendation.evidence.length > 0 && (
                <ul className="ml-6 space-y-1 list-disc list-inside">
                  {recommendation.evidence.map((e, i) => (
                    <li key={i} className="font-body-sm text-sm text-on-surface-variant">{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-outline-variant/30">
            <AltheaButton
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={() => handleAction('dismiss')}
            >
              <XCircle className="mr-1" size={14} /> Descartar
            </AltheaButton>
            {recommendation.action && (
              <AltheaButton
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => handleAction('modify')}
              >
                Modificar
              </AltheaButton>
            )}
            <AltheaButton
              size="sm"
              className="flex-1"
              onClick={() => handleAction('accept')}
            >
              <CheckCircle className="mr-1" size={14} /> Aceptar
            </AltheaButton>
            {onToggleWhy && (
              <AltheaButton
                variant="ghost"
                size="sm"
                onClick={onToggleWhy}
                className="w-auto px-3"
              >
                {showWhy ? 'Ocultar' : 'Ver'} <HelpCircle size={14} />
              </AltheaButton>
            )}
          </div>
        </div>
      </div>
    </AltheaCard>
  )
}

export default RecommendationCard