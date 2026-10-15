import { AltheaBadge } from '@/components/althea'
import SemanticIcon from '@/components/ui/SemanticIcon'
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  type FeedbackCategory,
  type FeedbackStatus,
  type FeedbackSyncStatus,
} from '@/services/feedback/feedbackTypes'

const STATUS_VARIANT: Record<FeedbackStatus, 'warning' | 'primary' | 'success'> = {
  pendiente: 'warning',
  en_curso: 'primary',
  resuelta: 'success',
}

export function StatusBadge({ status }: { status: FeedbackStatus }) {
  return <AltheaBadge variant={STATUS_VARIANT[status] ?? 'default'}>{STATUS_LABELS[status] ?? status}</AltheaBadge>
}

export function CategoryBadge({ category }: { category: FeedbackCategory }) {
  const variant = category === 'error' ? 'danger' : category === 'propuesta' ? 'secondary' : 'outline'
  return <AltheaBadge variant={variant}>{CATEGORY_LABELS[category] ?? category}</AltheaBadge>
}

/** Estado de envío de un mensaje local. `synced` no muestra nada (es el caso
 *  normal): solo se señala lo que todavía NO está confirmado por Firestore. */
export function SyncChip({ status, onRetry }: { status: FeedbackSyncStatus; onRetry?: () => void }) {
  if (status === 'synced') { return null }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-tertiary">
        <SemanticIcon name="cloud_off" size={12} className="text-[12px]" ariaHidden />
        No enviado — se enviará al recuperar conexión
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-error">
      <SemanticIcon name="error" size={12} className="text-[12px]" ariaHidden />
      No se pudo enviar
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="underline underline-offset-2 hover:opacity-80 min-h-[24px]"
        >
          Reintentar
        </button>
      )}
    </span>
  )
}
