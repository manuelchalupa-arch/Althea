import { AltheaMonogram } from './AltheaMonogram';

export type AltheaAvatarContext =
  | 'header'
  | 'avatar'
  | 'hero'
  | 'coach'
  | 'empty-state';

export interface AltheaAvatarProps {
  context?: AltheaAvatarContext;
  /** Tamaño del contenedor en px. Si se omite, usa el tamaño por defecto del contexto. */
  size?: number;
  /** Envuelve en un círculo con anillo (usado en header/nav). */
  ring?: boolean;
  className?: string;
  alt?: string;
}

/**
 * Mapea cada contexto al asset optimizado correspondiente.
 * Los archivos viven en assets/brand/. Rutas relativas a la raíz pública —
 * ajustar el prefijo de import si el bundler de Althea requiere otra convención.
 */
const ASSET_MAP: Record<AltheaAvatarContext, { base: string; defaultSize: number }> = {
  header: { base: 'althea-header-96', defaultSize: 40 },
  avatar: { base: 'althea-avatar-128', defaultSize: 64 },
  hero: { base: 'althea-hero-1000', defaultSize: 320 },
  coach: { base: 'althea-coach-480', defaultSize: 160 },
  'empty-state': { base: 'althea-empty-state-700', defaultSize: 200 },
};

const ASSET_BASE_PATH = '/assets/brand';

/**
 * AltheaAvatar
 * Único punto de acceso al busto de Althea en toda la app. Nunca importar el
 * PNG pesado directamente en una pantalla: usar este componente para que el
 * tamaño/formato correcto se resuelva según el contexto (header, avatar,
 * hero, coach, loading, pdf, empty-state).
 */
export function AltheaAvatar({
  context = 'avatar',
  size,
  ring = false,
  className,
  alt = 'Althea',
}: AltheaAvatarProps) {
  const { base, defaultSize } = ASSET_MAP[context];
  const finalSize = size ?? defaultSize;
  const isEmptyState = context === 'empty-state';

  const img = (
    <picture>
      <source srcSet={`${ASSET_BASE_PATH}/${base}.webp`} type="image/webp" />
      <img
        src={`${ASSET_BASE_PATH}/${base}.png`}
        alt={alt}
        width={finalSize}
        height={finalSize}
        loading={context === 'hero' || context === 'coach' ? 'eager' : 'lazy'}
        className={`althea-bust-img${isEmptyState ? ' althea-empty-watermark' : ''}${className ? ` ${className}` : ''}`}
        onError={(e) => {
          // Fallback silencioso: si el asset no fue copiado al repo, no romper el layout.
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    </picture>
  );

  if (!ring) {
    return (
      <span style={{ display: 'inline-block', width: finalSize, height: finalSize }}>
        {img}
      </span>
    );
  }

  return (
    <span
      className="althea-avatar-ring"
      style={{ width: finalSize, height: finalSize }}
    >
      {img}
    </span>
  );
}

/**
 * Variante segura de renderizar: usa el monograma en vez del busto cuando
 * el espacio es demasiado chico para que la fotografía se lea (< 40px) o
 * cuando se necesita un marcador puramente simbólico (favicon, badges).
 */
export function AltheaAvatarOrMark({ size = 24, ...rest }: AltheaAvatarProps) {
  if (size < 40) {return <AltheaMonogram size={size} variant="framed" />;}
  return <AltheaAvatar size={size} {...rest} />;
}

export default AltheaAvatar;
