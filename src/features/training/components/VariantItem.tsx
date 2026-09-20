import { VariantOption } from '@/services/ai/variantService'
import { getTypeLabel, getReasonIcon } from './variantUtils'

interface VariantItemProps {
  variant: VariantOption
  onSelect: () => void
}

function VariantItem({ variant, onSelect }: VariantItemProps) {
  const typeClass = 'variant-type-' + variant.type
  return (
    <button
      onClick={onSelect}
      className="w-full relative rounded-xl border p-3 space-y-2 text-left transition-colors hover:border-primary/50"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {variant.gifUrl && (
            <img
              src={variant.gifUrl}
              alt={variant.name}
              className="w-12 h-12 rounded-lg object-cover bg-surface/60"
              loading="lazy"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-body-md text-sm text-on-surface truncate">{variant.name}</div>
            <div className="flex flex-wrap gap-1 mt-1">
              <span className={'px-2 py-0.5 rounded-full text-[9px] font-label-md font-semibold uppercase ' + 'variant-type-' + variant.type}>
                {getTypeLabel(variant.type)}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[9px] font-label-md font-semibold uppercase text-on-surface-variant">
                {variant.muscle}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[9px] font-label-md font-semibold uppercase text-on-surface-variant">
                {variant.equipment}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[9px] font-label-md font-semibold uppercase text-on-surface-variant">
                {variant.pattern}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-label-md font-semibold uppercase tracking-widest">
          <span className="text-primary font-bold">{variant.score}%</span>
          <span className="text-on-surface-variant">compatibilidad</span>
        </div>
        <div className="text-[10px] text-on-surface-variant italic">{getReasonIcon(variant.reason)} {variant.reason}</div>
      </div>
      </button>
    )
  }
export default VariantItem