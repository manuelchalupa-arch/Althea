import { useState } from 'react'
import { AltheaBadge } from '@/components/althea/AltheaBadge'
import { AltheaCard } from '@/components/althea/AltheaCard'
import { AltheaEmpty } from '@/components/althea/AltheaEmpty'
import { CF_MOVEMENTS, findCfMovement, normalizeCfText } from '@/services/crossfit/cfMovementCatalog'
import type { CfCategory, CfMovementDef } from '@/services/crossfit/cfMovementCatalog'
import type { CfLevel, CfModality } from '@/services/crossfit/types'

type CfCategoryFilter = CfCategory | 'todos'

const CATEGORY_TABS: ReadonlyArray<{ value: CfCategoryFilter; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'gimnasia', label: 'Gimnasia' },
  { value: 'weightlifting', label: 'Weightlifting' },
  { value: 'metcon', label: 'MetCon' },
  { value: 'complementario', label: 'Complementarios' },
]

const MODALITY_VARIANT: Record<CfModality, 'primary' | 'secondary' | 'warning'> = {
  G: 'secondary',
  M: 'primary',
  W: 'warning',
}

const SCALE_ORDER: readonly CfLevel[] = ['rx', 'scaled', 'beginner', 'adapted']
const SCALE_LABEL: Record<CfLevel, string> = {
  rx: 'RX / Avanzado',
  scaled: 'Intermedio / Scaled',
  beginner: 'Principiante / Beginner',
  adapted: 'Adaptación (movilidad o lesión)',
}

function MovementDetail({ movement }: { movement: CfMovementDef }) {
  const scaleRows = SCALE_ORDER.flatMap((key) => {
    const value = movement.scale[key]
    return value ? [{ key, label: SCALE_LABEL[key], value }] : []
  })

  return (
    <div className="mt-3 space-y-4 border-t border-outline-variant pt-3">
      <p className="text-sm text-on-surface-variant">{movement.description}</p>

      <div className="space-y-1.5">
        <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Técnica</p>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-on-surface">
          {movement.technique.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
      </div>

      <div className="space-y-1.5">
        <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Músculos</p>
        <p className="text-sm text-on-surface">{movement.muscles.join(' · ')}</p>
      </div>

      <div className="space-y-1.5">
        <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Errores frecuentes</p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-on-surface">
          {movement.errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Variantes</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-on-surface">
            {movement.variants.map((v, i) => <li key={i}>{v}</li>)}
          </ul>
        </div>
        <div className="space-y-1.5">
          <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Progresiones</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-on-surface">
            {movement.progressions.map((v, i) => <li key={i}>{v}</li>)}
          </ul>
        </div>
        <div className="space-y-1.5">
          <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Regresiones</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-on-surface">
            {movement.regressions.map((v, i) => <li key={i}>{v}</li>)}
          </ul>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Demanda</p>
        <p className="text-sm text-on-surface">Cardio {movement.cardio} · Coordinación {movement.coordination}</p>
        {movement.mobility.length > 0 && (
          <p className="text-sm text-on-surface">Movilidad: {movement.mobility.join(' · ')}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Escalado</p>
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-outline-variant/50">
            {scaleRows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="w-2/5 py-2 pr-3 align-top font-label-md text-xs uppercase tracking-wide text-on-surface-variant">
                  {row.label}
                </th>
                <td className="py-2 text-on-surface">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {movement.scale.adapted && (
          <p className="text-xs text-aux">
            Las adaptaciones son orientativas y no reemplazan una evaluación profesional ante dolor o lesión.
          </p>
        )}
      </div>
    </div>
  )
}

/** Biblioteca de movimientos CrossFit (solo lectura) sobre el catálogo estático cfMovementCatalog. */
export default function CrossfitBiblioteca() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CfCategoryFilter>('todos')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const inCategory = category === 'todos' ? CF_MOVEMENTS : CF_MOVEMENTS.filter((m) => m.category === category)
  const q = normalizeCfText(query.trim())
  let filtered = inCategory
  if (q) {
    filtered = inCategory.filter(
      (m) => normalizeCfText(m.name).includes(q) || m.aliases.some((a) => normalizeCfText(a).includes(q)),
    )
    // Coincidencia exacta (nombre o alias) arriba del resto.
    const exact = findCfMovement(query)
    if (exact && filtered.some((m) => m.id === exact.id)) {
      filtered = [exact, ...filtered.filter((m) => m.id !== exact.id)]
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-headline text-lg font-semibold text-on-surface">Biblioteca CrossFit</h2>
        <p className="text-sm text-on-surface-variant">Buscá por nombre o alias (también en español) y filtrá por categoría.</p>
      </div>

      {/* Buscador */}
      <div className="space-y-1.5">
        <label htmlFor="cf-buscar" className="font-label-md text-xs text-on-surface">Buscar movimiento</label>
        <input
          id="cf-buscar"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ej.: dominada, snatch, remo…"
          className="min-h-[44px] w-full rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface placeholder:text-on-surface-variant"
        />
      </div>

      {/* Filtro por categoría */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
        {CATEGORY_TABS.map((tab) => {
          const active = category === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(tab.value)}
              className={`min-h-[44px] rounded-lg border px-3 font-label-md text-label-md transition active:scale-[0.98] ${
                active
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-outline-variant bg-surface-container text-on-surface-variant'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <p className="text-aux text-[10px]">
        {filtered.length} {filtered.length === 1 ? 'movimiento' : 'movimientos'}
      </p>

      {/* Lista */}
      {filtered.length === 0 ? (
        <AltheaEmpty
          icon="search"
          title="Sin movimientos"
          description="No encontramos nada con esa búsqueda. Probá con otro término o cambiá el filtro de categoría."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => {
            const isExpanded = expandedId === m.id
            const panelId = `cf-det-${m.id}`
            return (
              <AltheaCard key={m.id} padding="sm">
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                  className="flex min-h-[44px] w-full items-center gap-3 text-left"
                >
                  <AltheaBadge variant={MODALITY_VARIANT[m.modality]} size="xs">{m.modality}</AltheaBadge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-headline text-sm font-semibold text-on-surface">{m.name}</span>
                    <span className="block truncate font-label-md text-xs capitalize text-on-surface-variant">
                      {m.level} · {m.equipment.join(' · ')}
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 font-bold text-primary">{isExpanded ? '−' : '+'}</span>
                </button>
                {isExpanded && (
                  <div id={panelId}>
                    <MovementDetail movement={m} />
                  </div>
                )}
              </AltheaCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
