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
import { useAtlasFigure, type AtlasSex } from './atlasFigure';

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
  /** Valor de la métrica elegida en el período analizado (volumen kg, series o reps). */
  current: number;
  /** Valor de la misma métrica en el período previo comparable (0 si no hay). */
  previous: number;
  /** Tendencia ya resuelta por quien provee el dato. */
  trend: MuscleTrendInput;
  /** 0–100. Intensidad relativa del trabajo actual (0 = sin trabajo, 100 = máximo del período). */
  intensity?: number;
  exercises?: string[];
  /** Unidad a mostrar junto a current/previous (ej. "kg"). */
  unit?: string;
  /** Series completadas atribuidas a la región en el período. */
  sets?: number;
  /** Repeticiones registradas atribuidas a la región en el período. */
  reps?: number;
  /** Fechas YYYY-MM-DD con actividad en la región. */
  days?: string[];
  /** Métrica que colorea el mapa en esta consulta. */
  metric?: 'volumen' | 'series' | 'reps';
  /** Valor de esa métrica para la región (igual a `current`). */
  metricValue?: number;
  /**
   * Por qué una región con intensidad 0 sigue gris. Distingue tres estados que
   * NO son el mismo:
   * - 'ok'                 → no hay series del período: sin actividad.
   * - 'sin-atribucion'     → el período tiene series pero ninguna se pudo
   *                          atribuir a una región: es un hueco del mapeo,
   *                          no ausencia de entrenamiento.
   * - 'sin-alcance'        → hay regiones con trabajo, esta no registra
   *                          volumen atribuible (p. ej. sólo series sin carga).
   */
  emptyReason?: 'ok' | 'sin-atribucion' | 'sin-alcance';
}

const STATE_LABEL: Record<MuscleTrendInput, string> = {
  up: 'En aumento', aumento: 'En aumento',
  flat: 'Estable', estable: 'Estable',
  down: 'En descenso', descenso: 'En descenso',
  none: 'Sin base', 'sin-base': 'Sin base',
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
  /**
   * Sexo del perfil. `M` y `F` renderizan la ilustración correspondiente de
   * `src/assets/muscle-atlas/` (ya tecleada para dejar el fondo transparente).
   * `X` dibuja la silueta SVG neutra. Ver atlasFigure.ts.
   */
  sex?: AtlasSex;
  className?: string;
}

function lookup(region: MuscleRegion, data: Record<string, MuscleDataPoint>): MuscleDataPoint | undefined {
  return data[region.id] ?? (region.parent ? data[region.parent] : undefined);
}

function visualState(point?: MuscleDataPoint): 'active-high' | 'active-mid' | 'active-low' | 'idle' {
  if (!point) { return 'idle' }
  const intensity = point.intensity ?? 0
  if (intensity === 0) { return 'idle' }
  if (intensity >= 67) { return 'active-high' }
  if (intensity >= 34) { return 'active-mid' }
  return 'active-low'
}

function fillOpacity(point?: MuscleDataPoint): number {
  if (!point || point.intensity === undefined) { return 1; }
  const a = Math.max(0, Math.min(point.intensity, 100));
  return 0.4 + 0.6 * (a / 100);
}

function intensityLabel(intensity?: number): string {
  if (!intensity || intensity === 0) { return 'Sin trabajo' }
  if (intensity >= 67) { return 'Alta' }
  if (intensity >= 34) { return 'Moderada' }
  return 'Baja'
}

/** Motivo textual de un músculo gris: no es lo mismo no haber entrenado. */
function emptyLabel(point?: MuscleDataPoint): string {
  if (!point || point.emptyReason === undefined || point.emptyReason === 'ok') {
    return 'Sin trabajo en este período.'
  }
  if (point.emptyReason === 'sin-atribucion') {
    return 'Hay series en este período, pero ninguna se pudo atribuir a un músculo: falta información de la correspondencia ejercicio–músculo.'
  }
  return 'Este músculo no tiene volumen atribuible en el período (puede haber entrenado sólo con series sin carga registrada).'
}

function variation(point: MuscleDataPoint): string {
  if (!point.previous) { return 'Sin base' }
  const pct = ((point.current - point.previous) / point.previous) * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(0)}%`
}

/**
 * MuscleAtlas — atlas muscular frente/espalda.
 * Cada región lleva data-muscle-id; izquierda y derecha comparten id y se
 * resaltan juntas. Estados: hover, focus, selected y color por INTENSIDAD de
 * trabajo registrado en el período (no por tendencia): gris = sin trabajo,
 * VERDE = intensidad baja, amarillo = moderada, ROJO = alta. La tendencia
 * histórica se informa en el detalle, nunca en el color. Todo el color sale de
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
  sex = 'X',
  className,
}: MuscleAtlasProps) {
  const uid = useId().replace(/:/g, '');
  const shadeId = `althea-shade-${uid}`;
  const maskId = `althea-body-mask-${uid}`;
  const [hovered, setHovered] = useState<string | null>(null);
  const [innerSelected, setInnerSelected] = useState<string | null>(null);
  const selected = selectedId !== undefined ? selectedId : innerSelected;

  // Figura del perfil: ilustración tecleada para M/F, silueta SVG para X.
  const figure = useAtlasFigure(sex, view);

  const regions = MUSCLE_REGIONS[view];
  const lines = BODY_DETAIL[view];
  const hasFigure = Boolean(figure.url && figure.layout);
  const figureTransform = figure.layout
    ? `translate(${figure.layout.tx} ${figure.layout.ty}) scale(${figure.layout.s})`
    : undefined;

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
        const state = visualState(point);
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
            aria-label={mirrored ? undefined : `${region.label}, ${intensityLabel(point?.intensity).toLowerCase()}`}
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
          data-figure={sex}
          data-figure-asset={figure.url ? 'png' : 'svg'}
          aria-label={`Mapa muscular, vista ${view === 'front' ? 'frontal' : 'posterior'}`}
          className="althea-atlas__svg"
        >
          <defs>
            <linearGradient id={shadeId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
              <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.2" />
            </linearGradient>
            {hasFigure && (
              /*
               * MÁSCARA DE SILUETA. La geometría de regiones nació para la
               * silueta SVG neutra; la ilustración del perfil tiene la cabeza
               * más grande, las piernas más gruesas y los brazos más abiertos,
               * así que algunos rellenos se salían del cuerpo. Se recortan con
               * el propio alfa de la imagen tecleada: `brightness(0) invert(1)`
               * convierte cada píxel no transparente en blanco opaco, y el
               * fondo ya transparente queda fuera. Así ningún relleno puede
               * flotar fuera del cuerpo, y el recorte sigue la anatomía real.
               */
              <mask
                id={maskId}
                maskUnits="userSpaceOnUse"
                x={-40}
                y={-20}
                width={280}
                height={440}
                data-testid={`atlas-mask-${sex}-${view}`}
              >
                <image
                  href={figure.url!}
                  x={0}
                  y={0}
                  width={figure.layout!.canvasW}
                  height={figure.layout!.canvasH}
                  transform={figureTransform}
                  style={{ filter: 'brightness(0) invert(1)' }}
                  aria-hidden="true"
                />
              </mask>
            )}
          </defs>
          {hasFigure && (
            // Figura del perfil. La imagen se coloca con la geometría medida
            // de cada archivo (escala uniforme, sin deformar el cuerpo).
            <image
              className="althea-atlas__figure-image"
              href={figure.url!}
              x={0}
              y={0}
              width={figure.layout!.canvasW}
              height={figure.layout!.canvasH}
              transform={figureTransform}
              pointerEvents="none"
              data-testid={`atlas-image-${sex}-${view}`}
              aria-hidden="true"
            />
          )}
          {!hasFigure && (
            <g className="althea-atlas__silhouette" aria-hidden="true">
              <path d={SILHOUETTE} />
              <path d={SILHOUETTE} transform={MIRROR_TRANSFORM} />
            </g>
          )}
          <g mask={hasFigure ? `url(#${maskId})` : undefined}>
            {renderHalf(false)}
            {renderHalf(true)}
            {!figure.url && (
              <g className="althea-atlas__lines" aria-hidden="true">
                {lines.center.map((d, i) => <path key={i} d={d} />)}
              </g>
            )}
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
  const visual = visualState(point);
  const hasWork = !!point && (point.intensity ?? 0) > 0;
  const noBaseline = hasWork && (!point || point.trend === 'sin-base' || point.trend === 'none');
  return (
    <div className="althea-atlas__card">
      <div className="althea-atlas__card-head">
        <strong>{region.label}</strong>
        <span className={`althea-atlas__badge is-${visual}`}>{intensityLabel(point?.intensity)}</span>
      </div>
      {!hasWork ? (
        <p className="althea-atlas__hint">{emptyLabel(point)}</p>
      ) : (
        <dl className="althea-atlas__rows">
          <div><dt>Intensidad</dt><dd>{intensityLabel(point!.intensity)}</dd></div>
          <div><dt>Trabajo actual</dt><dd>{point!.current.toLocaleString('es-AR')}{point!.unit ? ` ${point!.unit}` : ''}</dd></div>
          <div><dt>Series</dt><dd>{(point!.sets ?? 0).toLocaleString('es-AR')}</dd></div>
          <div><dt>Repeticiones</dt><dd>{(point!.reps ?? 0).toLocaleString('es-AR')}</dd></div>
          <div><dt>Días con actividad</dt><dd>{(point!.days ?? []).length}</dd></div>
          <div><dt>Periodo anterior</dt><dd>{point!.previous.toLocaleString('es-AR')}{point!.unit ? ` ${point!.unit}` : ''}</dd></div>
          <div><dt>Variación</dt><dd>{variation(point!)}</dd></div>
          <div><dt>Tendencia</dt><dd>{STATE_LABEL[point!.trend]}</dd></div>
          {noBaseline && (
            <div className="althea-atlas__note"><dt>Base histórica</dt><dd>Sin período previo comparable.</dd></div>
          )}
          {point!.exercises && point!.exercises.length > 0 && (
            <div className="althea-atlas__exercises">
              <dt>Ejercicios que lo activaron</dt>
              <dd>{point!.exercises.slice(0, 4).join(' · ')}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

export default MuscleAtlas;
