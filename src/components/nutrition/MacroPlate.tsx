/** Misma forma que MacroTotals / MacroGoals de services/nutrition/macroService.ts (gramos y kcal). */
export interface MacroAmounts {
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
}

export type MacroPlateStatus = 'normal' | 'cerca' | 'alcanzado' | 'superado';

export interface MacroPlateProps {
  totals: MacroAmounts;
  goals: MacroAmounts;
  /** Ancho máximo en px. Escala con el contenedor. */
  size?: number;
  /** Leyenda con gramos consumidos / objetivo por macro. */
  showLegend?: boolean;
  className?: string;
}

const KCAL_PER_G = { carbs: 4, protein: 4, fat: 9 } as const;

/** Mismos umbrales que macroStatus() del repo. */
export function plateStatus(consumed: number, goal: number): MacroPlateStatus {
  if (goal <= 0) {return 'normal';}
  if (Math.round(consumed) > Math.round(goal)) {return 'superado';}
  if (Math.round(consumed) === Math.round(goal)) {return 'alcanzado';}
  if (consumed >= goal * 0.8) {return 'cerca';}
  return 'normal';
}

const STATUS_LABEL: Record<MacroPlateStatus, string> = {
  normal: 'En curso',
  cerca: 'Cerca del objetivo',
  alcanzado: 'Objetivo alcanzado',
  superado: 'Objetivo superado',
};

const R = 78;
const STROKE = 16;
const C = 2 * Math.PI * R;
const R_OUT = R + STROKE / 2 + 4; // arco de exceso, por fuera del anillo
const K_OUT = R_OUT / R;
const GAP = 5; // separación visual entre segmentos (unidades de arco)

interface Seg {
  key: 'carbs' | 'protein' | 'fat';
  label: string;
  cls: string;
  color: string;
}
const SEGS: Seg[] = [
  { key: 'carbs', label: 'Carbohidratos', cls: 'is-carb', color: 'var(--althea-primary)' },
  { key: 'protein', label: 'Proteínas', cls: 'is-protein', color: 'var(--althea-protein)' },
  { key: 'fat', label: 'Grasas', cls: 'is-fat', color: 'var(--althea-fat)' },
];

/**
 * MacroPlate — plato nutricional.
 * El anillo se divide en tres segmentos cuyo TAMAÑO es la proporción de
 * calorías de los OBJETIVOS del usuario (no siempre 40/40/20); el LLENADO de
 * cada segmento es consumido / objetivo de ese macro. En el centro van las
 * calorías. Estados: normal, cerca, alcanzado, superado (el exceso se marca
 * con un arco rojo exterior, el anillo nunca da más de una vuelta).
 * Presentacional: no lee datos, no calcula nada que no sea geometría.
 */
export function MacroPlate({ totals, goals, size = 280, showLegend = true, className }: MacroPlateProps) {
  const goalKcal = SEGS.reduce((a, s) => a + goals[s.key] * KCAL_PER_G[s.key], 0);
  const shares = SEGS.map((s) => (goalKcal > 0 ? (goals[s.key] * KCAL_PER_G[s.key]) / goalKcal : 1 / 3));
  const status = plateStatus(totals.calories, goals.calories);

  let offset = 0;
  const arcs = SEGS.map((s, i) => {
    const full = shares[i] * C;
    const len = Math.max(full - GAP, 0);
    const fill = goals[s.key] > 0 ? Math.min(totals[s.key] / goals[s.key], 1) : 0;
    const over = goals[s.key] > 0 && totals[s.key] > goals[s.key];
    const start = offset + GAP / 2;
    offset += full;
    return { ...s, start, len, fillLen: len * fill, over };
  });

  const kcal = Math.round(totals.calories).toLocaleString('es-AR');
  const kcalGoal = Math.round(goals.calories).toLocaleString('es-AR');

  return (
    <div
      className={`althea-plate${className ? ` ${className}` : ''}`}
      style={{ maxWidth: size }}
      role="img"
      aria-label={`Plato nutricional: ${kcal} de ${kcalGoal} kilocalorías. ${STATUS_LABEL[status]}. ` +
        SEGS.map((s) => `${s.label} ${Math.round(totals[s.key])} de ${Math.round(goals[s.key])} gramos`).join('; ')}
    >
      <svg className="althea-plate__svg" viewBox="0 0 200 200">
        <g transform="rotate(-90 100 100)">
          {arcs.map((a) => (
            <circle key={`t-${a.key}`} className="althea-plate__track" cx="100" cy="100" r={R} strokeWidth={STROKE}
              strokeDasharray={`${a.len} ${C - a.len}`} strokeDashoffset={-a.start} />
          ))}
          {arcs.map((a) => (
            <circle key={`f-${a.key}`} className="althea-plate__arc" cx="100" cy="100" r={R} strokeWidth={STROKE}
              stroke={a.color} strokeDasharray={`${a.fillLen} ${C - a.fillLen}`} strokeDashoffset={-a.start} />
          ))}
          {arcs.filter((a) => a.over).map((a) => (
            <circle key={`o-${a.key}`} className="althea-plate__over" cx="100" cy="100" r={R_OUT} strokeWidth={2}
              strokeDasharray={`${a.len * K_OUT} ${(C - a.len) * K_OUT}`} strokeDashoffset={-a.start * K_OUT} />
          ))}
        </g>
        <text className="althea-plate__kcal" x="100" y="102" textAnchor="middle" fontSize="34">{kcal}</text>
        <text className="althea-plate__unit" x="100" y="118" textAnchor="middle" fontSize="10.5">kcal · de {kcalGoal}</text>
        <text className={`althea-plate__goal althea-plate__status--${status}`} x="100" y="134" textAnchor="middle" fontSize="9.5" fontWeight="600">
          {STATUS_LABEL[status]}
        </text>
      </svg>
      {showLegend && (
        <ul className="althea-plate__legend">
          {SEGS.map((s, i) => (
            <li key={s.key}>
              <span className={`althea-plate__dot ${s.cls}`} aria-hidden="true" />
              <span>{s.label} <small>{Math.round(shares[i] * 100)}%</small></span>
              <span>{Math.round(totals[s.key])} <small>/ {Math.round(goals[s.key])} g</small></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MacroPlate;
