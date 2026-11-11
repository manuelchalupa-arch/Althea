import { useState } from 'react'
import CrossfitInicio from './crossfit/CrossfitInicio'
import CrossfitWod from './crossfit/CrossfitWod'
import CrossfitConstructor from './crossfit/CrossfitConstructor'
import CrossfitBiblioteca from './crossfit/CrossfitBiblioteca'
import CrossfitMetodologia from './crossfit/CrossfitMetodologia'
import CrossfitProgramacion from './crossfit/CrossfitProgramacion'
import CrossfitProgreso from './crossfit/CrossfitProgreso'
import CrossfitBenchmarks from './crossfit/CrossfitBenchmarks'

export type CrossfitSectionId =
  | 'inicio'
  | 'wod'
  | 'programacion'
  | 'constructor'
  | 'biblioteca'
  | 'benchmarks'
  | 'progreso'
  | 'metodologia'

const SECTIONS: { id: CrossfitSectionId; label: string }[] = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'wod', label: 'WOD del día' },
  { id: 'programacion', label: 'Programación' },
  { id: 'constructor', label: 'Constructor' },
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'benchmarks', label: 'Benchmarks' },
  { id: 'progreso', label: 'Progreso' },
  { id: 'metodologia', label: 'Metodología' },
]

/**
 * Shell del módulo CrossFit: pestaña principal con navegación interna de
 * apartados. El acento de color lo aporta el shell de App.tsx vía
 * `data-section="crossfit"` (accentSectionForPath).
 */
export default function Crossfit() {
  const [section, setSection] = useState<CrossfitSectionId>('inicio')

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="font-label-caps text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">Módulo</p>
          <h1 className="font-headline text-2xl font-semibold tracking-wide text-on-surface">CROSSFIT</h1>
        </div>
      </header>

      <nav aria-label="Apartados CrossFit" className="border-b border-outline-variant/50">
        <div role="tablist" aria-label="Apartados CrossFit" className="flex gap-1 overflow-x-auto -mx-1 px-1">
          {SECTIONS.map((s) => {
            const active = s.id === section
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                id={`cf-tab-${s.id}`}
                aria-selected={active}
                aria-controls={`cf-panel-${s.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setSection(s.id)}
                className={`min-h-[44px] px-3 whitespace-nowrap font-label-md text-label-md tracking-wide border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-current text-on-surface font-semibold'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </nav>

      <div
        role="tabpanel"
        id={`cf-panel-${section}`}
        aria-labelledby={`cf-tab-${section}`}
        tabIndex={0}
        className="focus:outline-none"
      >
        {section === 'inicio' && <CrossfitInicio onNavigate={setSection} />}
        {section === 'wod' && <CrossfitWod onNavigate={setSection} />}
        {section === 'programacion' && <CrossfitProgramacion />}
        {section === 'constructor' && <CrossfitConstructor />}
        {section === 'biblioteca' && <CrossfitBiblioteca />}
        {section === 'benchmarks' && <CrossfitBenchmarks />}
        {section === 'progreso' && <CrossfitProgreso />}
        {section === 'metodologia' && <CrossfitMetodologia />}
      </div>
    </div>
  )
}
