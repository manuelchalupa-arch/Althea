/**
 * Un consejo científico breve por día, con fuente verificable.
 * Reglas: menos de 20 palabras, nunca inventar estudios, rotación diaria sin
 * repetir al día siguiente y tema adaptado al contexto (entreno vs descanso).
 * El acceso al estudio es secundario (enlace PubMed), no el centro.
 */
type TipTopic = 'training' | 'nutrition' | 'recovery'

interface Tip {
  id: string
  topic: TipTopic
  text: string
  citation: string
  url: string
}

const TIPS: Tip[] = [
  {
    id: 'ss-time',
    topic: 'training',
    text: 'Las superseries ahorran tiempo y, con volumen igualado, la hipertrofia es similar.',
    citation: 'Estudio de superseries, 2025 (PMID 39903375)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/39903375/',
  },
  {
    id: 'volume',
    topic: 'training',
    text: 'Más series semanales por músculo suelen dar más hipertrofia, con retornos decrecientes.',
    citation: 'Revisión de volumen, fuerza e hipertrofia, 2023 (PMC10579494)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10579494/',
  },
  {
    id: 'protein',
    topic: 'nutrition',
    text: 'Apuntá a 1,4–2,0 g de proteína por kg por día; 1,6 g/kg cubre a la mayoría.',
    citation: 'ISSN Protein and Exercise, 2017 (PMID 28642676)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/28642676/',
  },
  {
    id: 'fat',
    topic: 'nutrition',
    text: 'Grasas: 20–35 % de las calorías diarias; el resto, carbohidratos según tu entrenamiento.',
    citation: 'Thomas, Erdman y Burke, 2016 (PMID 26920240)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/26920240/',
  },
  {
    id: 'wearable',
    topic: 'recovery',
    text: 'El gasto del reloj es una estimación: usalo como tendencia, no como medida exacta.',
    citation: 'Revisión de wearables, 2024 (PMID 39080098)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/39080098/',
  },
  {
    id: 'bmr',
    topic: 'recovery',
    text: 'Tu gasto en reposo se estima con Mifflin-St Jeor; no es una medición directa.',
    citation: 'Mifflin et al., 1990 (PMID 2305711)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
  },
]

export default function ScienceTip({ isRestDay }: { isRestDay: boolean }) {
  const preferred: TipTopic[] = isRestDay ? ['recovery', 'nutrition', 'training'] : ['training', 'nutrition', 'recovery']
  // Orden estable por tema + día: el índice avanza cada día, así que no se
  // repite el mismo consejo en días consecutivos.
  const ordered = preferred.flatMap(topic => TIPS.filter(t => t.topic === topic))
  const day = Math.floor(Date.now() / 86400000)
  const tip = ordered[day % ordered.length]

  return (
    <section className="rounded-2xl border border-outline-variant/40 bg-surface-container px-4 py-3 shadow-al-sm" aria-label="Consejo científico del día">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="shrink-0 mt-0.5 text-secondary" aria-hidden="true">✦</span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-snug text-on-surface">{tip.text}</p>
          <details className="mt-1">
            <summary className="font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant cursor-pointer min-h-[28px] flex items-center">
              Fuente
            </summary>
            <a href={tip.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-[32px] text-[11px] text-primary underline underline-offset-2">
              {tip.citation}
            </a>
          </details>
        </div>
      </div>
    </section>
  )
}
