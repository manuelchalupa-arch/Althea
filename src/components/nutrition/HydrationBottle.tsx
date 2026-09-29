import React, { useId, useState } from 'react';

export interface HydrationBottleProps {
  /** ml consumidos. */
  current: number;
  /** ml objetivo del día. */
  goal: number;
  /** Ancho en px (alto = 2 × ancho). */
  width?: number;
  className?: string;
}

/* Geometría (viewBox 0 0 100 200): cuello 41–59, hombro, cuerpo 22–78, base en y=190. */
const BODY =
  'M41 20 H59 V38 C59 50 78 54 78 72 V178 Q78 190 66 190 H34 Q22 190 22 178 V72 C22 54 41 50 41 38 Z';
const WATER_TOP = 58; // nivel al 100 %
const WATER_BOTTOM = 190; // nivel al 0 %
const RANGE = WATER_BOTTOM - WATER_TOP;

/**
 * HydrationBottle — botella de cristal con tapa, reflejos, agua celeste con
 * menisco y sombra de apoyo. El nivel es proporcional a current/goal y se
 * mueve con transform (no con y/d) para animar suave en GPU.
 */
export function HydrationBottle({ current, goal, width = 96, className }: HydrationBottleProps) {
  const uid = useId().replace(/:/g, '');
  const frac = goal > 0 ? Math.max(0, Math.min(current / goal, 1)) : 0;
  const shift = (1 - frac) * RANGE;
  const ml = (n: number) => Math.round(n).toLocaleString('es-AR');

  return (
    <div
      className={`althea-bottle${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={`Hidratación: ${ml(current)} de ${ml(goal)} mililitros`}
    >
      <svg className="althea-bottle__svg" width={width} height={width * 2} viewBox="0 0 100 200">
        <defs>
          <clipPath id={`clip-${uid}`}><path d={BODY} /></clipPath>
          <linearGradient id={`water-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--althea-hydration)', stopOpacity: 0.78 }} />
            <stop offset="1" style={{ stopColor: 'var(--althea-hydration)', stopOpacity: 0.98 }} />
          </linearGradient>
          <linearGradient id={`glass-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="0.16" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="0.7" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.32" />
          </linearGradient>
        </defs>

        <ellipse cx="50" cy="193" rx="30" ry="3.4" fill="#000" opacity="0.14" />

        <g clipPath={`url(#clip-${uid})`}>
          <path d={BODY} fill="var(--althea-surface-2)" opacity="0.5" />
          <g className="althea-bottle__water" style={{ transform: `translateY(${shift}px)` }}>
            <rect x="0" y={WATER_TOP + 1} width="100" height="150" fill={`url(#water-${uid})`} />
            {/* superficie: elipse (vista levemente desde arriba) + línea de menisco */}
            <ellipse cx="50" cy={WATER_TOP + 1} rx="29" ry="2.6" fill="#fff" opacity="0.34" />
            <path d={`M21 ${WATER_TOP + 1} Q 50 ${WATER_TOP + 4.4} 79 ${WATER_TOP + 1}`} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1" />
            {/* luz dentro del agua */}
            <rect x="27" y={WATER_TOP + 8} width="4" height="90" rx="2" fill="#fff" opacity="0.16" />
          </g>
        </g>

        {/* cristal */}
        <path d={BODY} fill={`url(#glass-${uid})`} />
        <path d={BODY} fill="none" stroke="var(--althea-on-surface-muted)" strokeOpacity="0.55" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M27 76 V172" stroke="#fff" strokeOpacity="0.7" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M73 84 V150" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M45 26 V36" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" />

        {/* tapa */}
        <rect x="38" y="4" width="24" height="17" rx="3.5" fill="var(--althea-primary)" />
        <path d="M42 4.5 V20.5 M46 4.5 V20.5 M50 4.5 V20.5 M54 4.5 V20.5 M58 4.5 V20.5" stroke="#000" strokeOpacity="0.16" strokeWidth="0.9" />
        <rect x="38" y="4" width="24" height="3.6" rx="1.8" fill="#fff" opacity="0.18" />
        <rect x="39.5" y="20" width="21" height="2.2" rx="1" fill="var(--althea-on-surface-muted)" opacity="0.45" />
      </svg>

      <span className="althea-bottle__label">
        {ml(current)} <small>/ {ml(goal)} ml</small>
      </span>
    </div>
  );
}

export interface HydrationBottleConfig {
  id: string;
  /** "Botella 1", "Botella 2", ... editable por el usuario. */
  name?: string;
  /** 750, 1000, 2000, ... */
  capacityMl: number;
}

export interface HydrationQuickAddProps {
  /** Botellas configuradas (hasta 3). Cada una registra su capacidad completa. */
  bottles: HydrationBottleConfig[];
  onAddBottle: (bottle: HydrationBottleConfig) => void;
  /** Entrada libre (ej. 250 ml). */
  onAddMl: (ml: number) => void;
  disabled?: boolean;
  className?: string;
}

const fmtCap = (ml: number) => (ml >= 1000 ? `${(ml / 1000).toLocaleString('es-AR')} l` : `${ml} ml`);

/** Botellas configuradas + entrada libre en ml. */
export function HydrationQuickAdd({ bottles, onAddBottle, onAddMl, disabled, className }: HydrationQuickAddProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const ml = Math.round(Number(value));
    if (ml > 0) {onAddMl(ml);}
    setValue('');
    setOpen(false);
  };

  return (
    <div className={`althea-bottle__quick${className ? ` ${className}` : ''}`}>
      <div className="althea-bottle__quick-row">
        {bottles.slice(0, 3).map((b, i) => (
          <button key={b.id} type="button" className="althea-btn althea-btn-secondary" disabled={disabled} onClick={() => onAddBottle(b)}>
            {b.name ?? `Botella ${i + 1}`} · {fmtCap(b.capacityMl)}
          </button>
        ))}
      </div>
      {open ? (
        <form className="althea-bottle__quick-row" onSubmit={submit}>
          <input
            className="althea-bottle__input"
            autoFocus
            inputMode="numeric"
            aria-label="Mililitros a registrar"
            placeholder="ml (ej. 250)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit" className="althea-btn althea-btn-primary" disabled={disabled}>Registrar</button>
        </form>
      ) : (
        <button type="button" className="althea-btn althea-btn-primary" disabled={disabled} onClick={() => setOpen(true)}>
          + Registrar ml
        </button>
      )}
    </div>
  );
}

export default HydrationBottle;
