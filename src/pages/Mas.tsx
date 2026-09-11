import { Link } from 'react-router-dom'
import { MAS_GROUPS } from '@/components/brand/icons'
import BrandIcon from '@/components/brand/BrandIcon'

// Menú / Biblioteca: única zona para áreas secundarias.
export default function Mas(){
  return (
    <div className="min-h-screen bg-bg p-4 pb-24 mx-auto max-w-lg lg:max-w-3xl space-y-5">
      <div>
        <h1 className="text-section">Menú</h1>
        <p className="text-aux text-textMuted">Todo lo secundario, en un solo lugar</p>
      </div>

      {MAS_GROUPS.map((g)=>(
        <section key={g.title}>
          <h2 className="text-aux font-medium tracking-wide mb-2">{g.title.toUpperCase()}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {g.items.map(({to,label,icon})=>(
              <Link
                key={to}
                to={to}
                aria-label={label}
                className="tpress group rounded-xl bg-surface border border-border p-3 flex flex-col items-center justify-center text-center gap-2 min-h-[100px]
                           hover:border-info/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
              >
                <BrandIcon name={icon} size={32} strokeWidth={1.75} className="text-textMain group-hover:text-info transition" />
                <span className="text-aux font-medium leading-tight">{label}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
