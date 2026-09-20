import { VariantOption } from '@/services/ai/variantService'
import VariantItem from './VariantItem'

interface VariantListProps {
  variants: VariantOption[]
  onSelectVariant: (variant: VariantOption, decision: 'accepted' | 'modified') => void
}

export function VariantList({ variants, onSelectVariant }: VariantListProps) {
  return (
    <div className="space-y-2 max-h-[60vh] overflow-auto">
      {variants.map((variant, i) => (
        <VariantItem
          key={variant.exerciseId}
          variant={variant}
          onSelect={() => onSelectVariant(variant, 'accepted')}
        />
      ))}
    </div>
  )
}