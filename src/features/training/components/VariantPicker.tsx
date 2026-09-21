import { useState, useEffect, useCallback } from 'react'
import { Dumbbell } from 'lucide-react'
import { AltheaButton } from '@/components/althea'
import { getVariantsForExercise, getVariantsForPain, type VariantOption, type VariantContext } from '@/services/ai/variantService'
import type { UserProfile } from '@/types'
import VariantItem from './VariantItem'
import { VariantList } from './VariantList'

interface VariantPickerProps {
  context: VariantContext | null
  userProfile: UserProfile | null
  onSelectVariant: (variant: VariantOption, decision: 'accepted' | 'modified') => void
  onClose: () => void
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    equivalent: 'Equivalente',
    partial: 'Parcial',
    variant: 'Variante',
    regression: 'Regresion',
    progression: 'Progresion',
  }
  return labels[type] || type
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    equivalent: 'bg-primary/20 text-primary border-primary/30',
    partial: 'bg-secondary/20 text-secondary border-secondary/30',
    variant: 'bg-amber/20 text-amber border-amber/30',
    regression: 'bg-emerald/20 text-emerald border-emerald/30',
    progression: 'bg-purple/20 text-purple border-purple/30',
  }
  return colors[type] || 'bg-surface-container-high text-on-surface border-outline-variant'
}

function getReasonIcon(reason: string): string {
  if (reason.includes('dolor') || reason.includes('Dolor')) return 'warning'
  if (reason.includes('equipamiento') || reason.includes('Equipamiento')) return 'weight'
  if (reason.includes('limitaci') || reason.includes('Limitaci')) return 'ban'
  if (reason.includes('progres') || reason.includes('Progres')) return 'trending_up'
  if (reason.includes('regres') || reason.includes('Regres')) return 'trending_down'
  return 'sync'
}

export function VariantPicker({ context, userProfile, onSelectVariant, onClose }: any) {
  const [variants, setVariants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadVariants = useCallback(async () => {
    if (!context) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      let variantsData
      if (context.reason === 'pain' && context.painLevel) {
        variantsData = await getVariantsForPain(
          context.originalExerciseId,
          context.painZone || '',
          context.painLevel,
          userProfile
        )
      } else {
        variantsData = await getVariantsForExercise(context, userProfile)
      }
      setVariants(variantsData)
    } catch (e) {
      setError('No se pudieron cargar las variantes')
      console.error('Error loading variants:', e)
    } finally {
      setLoading(false)
    }
  }, [context, userProfile])

  useEffect(() => {
    loadVariants()
  }, [loadVariants])

  // Sin contexto no hay picker: nunca bloquear la pantalla.
  if (!context) { return null }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-surface-container/95 backdrop-blur-md border border-outline-variant rounded-2xl w-full max-w-md p-5 space-y-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          </div>
          <p className="text-center text-on-surface-variant">Cargando variantes...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={onClose}>
        <div onClick={e => e.stopPropagation()} className="bg-surface/95 backdrop-blur-md border-t border-outline-variant rounded-t-2xl w-full max-w-md lg:max-w-xl max-h-[80vh] overflow-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-headline-lg text-base font-semibold text-on-surface">Variantes para {context.reason === 'pain' ? 'dolor' : context.reason}</h3>
            <button onClick={onClose} className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-high">
              x
            </button>
          </div>
          <div className="rounded-lg bg-error/15 border border-error/30 p-3 text-error text-sm">
            {error}
          </div>
          <div className="pt-2 border-t border-outline-variant/30">
            <AltheaButton variant="secondary" size="lg" className="w-full" onClick={onClose}>
              Cancelar
            </AltheaButton>
          </div>
        </div>
      </div>
    )
  }

  if (variants.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={onClose}>
        <div onClick={e => e.stopPropagation()} className="bg-surface/95 backdrop-blur-md border-t border-outline-variant rounded-t-2xl w-full max-w-md lg:max-w-xl max-h-[80vh] overflow-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-headline-lg text-base font-semibold text-on-surface">Sin variantes para {context.reason === 'pain' ? 'dolor' : context.reason}</h3>
            <button onClick={onClose} aria-label="Cerrar" className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-high min-w-[44px] min-h-[44px]">
              x
            </button>
          </div>
          <div className="flex flex-col items-center text-center gap-1 py-2">
            <Dumbbell className="w-10 h-10 opacity-50" />
            <p className="font-body-md text-sm">No hay variantes disponibles</p>
            <p className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">Probá con otra razón o ajustá filtros. Tu ejercicio original sigue intacto.</p>
          </div>
          <div className="pt-2 border-t border-outline-variant/30">
            <AltheaButton variant="secondary" size="lg" className="w-full" onClick={onClose}>
              Volver al ejercicio
            </AltheaButton>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-surface/95 backdrop-blur-md border-t border-outline-variant rounded-t-2xl w-full max-w-md lg:max-w-xl max-h-[80vh] overflow-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-headline-lg text-base font-semibold text-on-surface">Variantes para {context.reason === 'pain' ? 'dolor' : context.reason}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-high">
            x
          </button>
        </div>

        {context.painLevel && context.painZone ? (
          <div className="rounded-lg bg-warning/15 border border-warning/30 p-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <div>
                <div className="font-body-sm text-on-surface font-medium">Dolor {context.painLevel} en {context.painZone}</div>
                <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-0.5">Se muestran variantes que evitan esa zona</div>
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg bg-error/15 border border-error/30 p-3 text-error text-sm">
            {error}
          </div>
        ) : null}

        <div className="space-y-2 max-h-[60vh] overflow-auto">
          <VariantList variants={variants} onSelectVariant={onSelectVariant} />
        </div>

        <div className="pt-2 border-t border-outline-variant/30">
          <AltheaButton variant="secondary" size="lg" className="w-full" onClick={onClose}>
            Cancelar
          </AltheaButton>
        </div>
      </div>
    </div>
  )
}

export { type VariantOption, type VariantContext }