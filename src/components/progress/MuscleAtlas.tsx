import  { useId, useState } from 'react';
import {
  ATLAS_VIEWBOX,
  BODY_DETAIL,
  MIRROR_TRANSFORM,
  MUSCLE_REGIONS,
  SILHOUETTE,
  type AtlasView,
  type MuscleRegion,
} from './muscleGeometry';

/**
 * MUSCLE DATA — contrato de datos, separado de la geometría (muscleGeometry.ts).
 * El atlas NUNCA calcula trabajo, tendencia ni color: recibe el dato y lo pinta.
 * Los ids de `data` son ids de catálogo (padre, ej. "pectoralis-major") o de
 * región (ej. "pectoralis-major-sternal"). El dato de la región gana sobre el
 * del padre.
 */
export type MuscleTrendInput =
  | 'up' | 'flat' | 'down' | 'none'
  | 'aumento' | 'estable' | 'descenso' | 'sin-base'; // vocabulario del repo (MuscleTrend)

export interface MuscleDataPoint {
  muscleId: string;
  /** Trabajo del período actual (unidad libre: kg de volumen, series, %). */
  current: number;
  /** Trabajo del período anterior, misma unidad. */
  previous: number;
  /** Tendencia ya resuelta por quien provee el dato. */
  trend: MuscleTrendInput;
  /** 0–100. Solo modula la intensidad del relleno; no cambia el color. */
  activation?: number;
  exercises?: string[];
  /** Unidad a mostrar junto a current/previous (ej. "kg"). */
  unit?: string;
}

type VisualState = 'high' | 'mid' | 'low' | 'idle';

const STATE_OF: Record<MuscleTrendInput, VisualState> = {
  up: 'high', aumento: 'high',
  flat: 'mid', estable: 'mid',
  down: 'low', descenso: 'low',
  none: 'idle', 'sin-base': 'idle',
};

const STATE_LABEL: Record<VisualState, string> = {
  high: 'En aumento',
  mid: 'Estable',
  low: 'En descenso',
  idle: 'Sin datos',
};

export interface MuscleAtlasProps {
  view: AtlasView;
  onViewChange?: (view: AtlasView) => void;
  data: Record<string, MuscleDataPoint>;
  /** Región seleccionada (modo controlado). Si se omite, el atlas la gestiona. */
  selectedId?: string | null;
  onSelect?: (regionId: string | null) => void;
  /** Ancho máximo de la figura en px. */
  width?: number;
  /** 'below' muestra el detalle bajo la figura (a un costado en contenedores anchos). */
  detail?: 'below' | 'none';
  className?: string;
}

function lookup(region: MuscleRegion, data: Record<string, MuscleDataPoint>): MuscleDataPoint | undefined {
  return data[region.id] ?? (region.parent ? data[region.parent] : undefined);
}

function stateOf(point?: MuscleDataPoint): VisualState {
  return point ? STATE_OF[point.trend] ?? 'idle' : 'idle';
}

function fillOpacity(point?: MuscleDataPoint): number {
  if (!point || point.activation === undefined) {return 1;}
  const a = Math.max(0, Math.min(point.activation, 100));
  return 0.6 + 0.4 * (a / 100);
}

function variation(point: MuscleDataPoint): string {
  if (!point.previous) {return 'Sin base';}
  const pct = ((point.current - point.previous) / point.previous) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}

/**
 * MuscleAtlas — atlas muscular frente/espalda.
 * Cada región lleva data-muscle-id; izquierda y derecha comparten id y se
 * resaltan juntas. Estados: hover, focus, selected y color por tendencia
 * (rojo descenso / amarillo estable / verde aumento). Todo el color sale de
 * tokens CSS (--althea-muscle-*), aplicados en althea-components.css.
 */
export function MuscleAtlas({
  view,
  onViewChange,
  data,
  selectedId,
  onSelect,
  width = 240,
  detail = 'below',
  className,
}: MuscleAtlasProps) {
  const uid = useId().replace(/:/g, '');
  const shadeId = `althea-shade-${uid}`;
  const [hovered, setHovered] = useState<string | null>(null);
  const [innerSelected, setInnerSelected] = useState<string | null>(null);
  const selected = selectedId !== undefined ? selectedId : innerSelected;

  const regions = MUSCLE_REGIONS[view];
  const lines = BODY_DETAIL[view];

  function select(id: string) {
    const next = selected === id ? null : id;
    if (selectedId === undefined) {setInnerSelected(next);}
    onSelect?.(next);
  }

  const activeId = hovered ?? selected;
  const activeRegion = regions.find((r) => r.id === activeId) ?? null;
  const activePoint = activeRegion ? lookup(activeRegion, data) : undefined;

  const renderHalf = (mirrored: boolean) => (
    <g transform={mirrored ? MIRROR_TRANSFORM : undefined} aria-hidden={mirrored || undefined}>
      {regions.map((region) => {
        const point = lookup(region, data);
        const state = stateOf(point);
        const isSelected = selected === region.id;
        const isHovered = hovered === region.id;
        const cls = [
          'althea-atlas__muscle',
          `is-${state}`,
          isSelected ? 'is-selected' : '',
          isHovered ? 'is-hovered' : '',
        ].filter(Boolean).join(' ');
        return (
          <g
            key={region.id}
            className={cls}
            data-muscle-id={region.id}
            data-side={mirrored ? 'right' : 'left'}
            role={mirrored ? undefined : 'button'}
            tabIndex={mirrored ? undefined : 0}
            aria-pressed={mirrored ? undefined : isSelected}
            aria-label={mirrored ? undefined : `${region.label}, ${STATE_LABEL[state].toLowerCase()}`}
            onMouseEnter={() => setHovered(region.id)}
            onMouseLeave={() => setHovered(null)}
            onFocus={mirrored ? undefined : () => setHovered(region.id)}
            onBlur={mirrored ? undefined : () => setHovered(null)}
            onClick={() => select(region.id)}
            onKeyDown={
              mirrored
                ? undefined
                : (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      select(region.id);
                    }
                  }
            }
          >
            <path className="althea-atlas__fill" d={region.d} style={{ fillOpacity: fillOpacity(point) }} />
            <path className="althea-atlas__fibers" d={region.fibers} />
            <path className="althea-atlas__shade" d={region.d} fill={`url(#${shadeId})`} />
          </g>
        );
      })}
      <g className="althea-atlas__lines">
        {lines.mirrored.map((d, i) => <path key={i} d={d} />)}
      </g>
    </g>
  );

  return (
    <div className={`althea-atlas-wrap${className ? ` ${className}` : ''}`}>
    <div className="althea-atlas">
      <div className="althea-atlas__figure" style={{ maxWidth: width }}>
        {onViewChange && (
          <div className="althea-toolbar althea-atlas__views" role="tablist" aria-label="Vista del mapa muscular">
            {(['front', 'back'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                className="althea-toolbar__item"
                aria-selected={view === v}
                onClick={() => onViewChange(v)}
              >
                {v === 'front' ? 'Frente' : 'Espalda'}
              </button>
            ))}
          </div>
        )}
        <svg
          viewBox={ATLAS_VIEWBOX}
          role="group"
          aria-label={`Mapa muscular, vista ${view === 'front' ? 'frontal' : 'posterior'}`}
          className="althea-atlas__svg"
        >
          <defs>
            <linearGradient id={shadeId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
              <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <g className="althea-atlas__silhouette" aria-hidden="true">
            <path d={SILHOUETTE} />
            <path d={SILHOUETTE} transform={MIRROR_TRANSFORM} />
          </g>
          {renderHalf(false)}
          {renderHalf(true)}
          <g className="althea-atlas__lines" aria-hidden="true">
            {lines.center.map((d, i) => <path key={i} d={d} />)}
          </g>
        </svg>
      </div>

      {detail === 'below' && (
        <div className="althea-atlas__detail-panel" role="status" aria-live="polite">
          {!activeRegion ? (
            <p className="althea-atlas__hint">Tocá un músculo para ver su detalle.</p>
          ) : (
            <MuscleDetail region={activeRegion} point={activePoint} />
          )}
        </div>
      )}
    </div>
    </div>
  );
}

function MuscleDetail({ region, point }: { region: MuscleRegion; point?: MuscleDataPoint }) {
  const state = stateOf(point);
  return (
    <div className="althea-atlas__card">
      <div className="althea-atlas__card-head">
        <strong>{region.label}</strong>
        <span className={`althea-atlas__badge is-${state}`}>{STATE_LABEL[state]}</span>
      </div>
      {!point ? (
        <p className="althea-atlas__hint">Sin datos en este período.</p>
      ) : (
        <dl className="althea-atlas__rows">
          <div><dt>Trabajo actual</dt><dd>{point.current.toLocaleString('es-AR')}{point.unit ? ` ${point.unit}` : ''}</dd></div>
          <div><dt>Semana anterior</dt><dd>{point.previous.toLocaleString('es-AR')}{point.unit ? ` ${point.unit}` : ''}</dd></div>
          <div><dt>Variación</dt><dd>{variation(point)}</dd></div>
          <div><dt>Tendencia</dt><dd>{STATE_LABEL[state]}</dd></div>
          {point.exercises && point.exercises.length > 0 && (
            <div className="althea-atlas__exercises">
              <dt>Ejercicios que lo activaron</dt>
              <dd>{point.exercises.slice(0, 4).join(' · ')}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

export default MuscleAtlas;
