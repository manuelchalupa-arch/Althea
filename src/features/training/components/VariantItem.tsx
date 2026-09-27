import { VariantOption } from '@/services/ai/variantService'
import { getTypeLabel, getTypeColor, getReasonLabel } from './variantUtils'

interface VariantItemProps {
  variant: VariantOption
  onSelect: () => void
}

function VariantItem({ variant, onSelect }: VariantItemProps) {
  return (
    <button
      onClick={onSelect}
      className="w-full relative rounded-xl border border-outline-variant bg-surface-container-low/60 p-3 text-left transition-colors hover:border-primary/50"
    >
      <div className="flex items-center gap-3">
        {variant.gifUrl && (
          <img
            src={variant.gifUrl}
            alt={variant.name}
            className="w-12 h-12 shrink-0 rounded-lg object-cover bg-surface/60"
            loading="lazy"
          />
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="font-body-md text-sm text-on-surface truncate">{variant.name}</div>
          <div className="flex flex-wrap gap-1">
            <span className={`px-2 py-0.5 rounded-full border text-[9px] font-label-md font-semibold uppercase ${getTypeColor(variant.type)}`}>
              {getTypeLabel(variant.type)}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[9px] font-label-md font-semibold uppercase text-on-surface-variant">
              {variant.muscle}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[9px] font-label-md font-semibold uppercase text-on-surface-variant">
              {variant.equipment}
            </span>
            {variant.pattern && (
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[9px] font-label-md font-semibold uppercase text-on-surface-variant">
                {variant.pattern}
              </span>
            )}
          </div>
          <div className="text-[10px] text-on-surface-variant truncate">{getReasonLabel(variant.reason)}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] font-label-md font-bold uppercase tracking-widest text-primary">{variant.score}%</div>
          <div className="text-[9px] text-on-surface-variant">compatibilidad</div>
        </div>
      </div>
    </button>
  )
}
export default VariantItem
