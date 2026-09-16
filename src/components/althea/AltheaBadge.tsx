import type { ReactNode } from 'react';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'outline';

interface AltheaBadgeProps {
  variant?: BadgeVariant;
  size?: 'xs' | 'sm' | 'md';
  icon?: string;
  dot?: boolean;
  dotColor?: string;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-container-high border-outline-variant text-secondary',
  primary: 'bg-primary/15 border-primary/30 text-primary',
  success: 'bg-primary/14 border-primary/45 text-primary',
  warning: 'bg-secondary/12 border-secondary/45 text-secondary',
  danger: 'bg-error/14 border-error/45 text-error',
  outline: 'bg-transparent border-outline-variant text-on-surface-variant',
};

const sizeStyles = {
  xs: 'px-1.5 py-0.5 text-[9px]',
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1 text-xs',
};

export function AltheaBadge({ variant = 'default', size = 'sm', icon, dot, dotColor, children, className = '' }: AltheaBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border font-label-md font-bold uppercase tracking-wider
      ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}>
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor || 'bg-primary'} ${dot ? 'animate-pulse' : ''}`} />
      )}
      {icon && <span className="material-symbols-outlined text-[12px]">{icon}</span>}
      {children}
    </span>
  );
}

interface StatusTagProps {
  status: 'completed' | 'rest' | 'planned' | 'active' | 'skipped' | 'pending';
  className?: string;
}

const statusStyles: Record<string, string> = {
  completed: 'bg-primary/14 text-primary',
  rest: 'bg-surface-container text-secondary',
  planned: 'bg-surface-container text-on-surface-variant',
  active: 'bg-primary text-on-primary',
  skipped: 'bg-secondary/12 text-secondary',
  pending: 'bg-surface-container text-on-surface-variant',
};

const statusLabels: Record<string, string> = {
  completed: 'Completado',
  rest: 'Descanso',
  planned: 'Planificado',
  active: 'En Curso',
  skipped: 'Omitido',
  pending: 'Pendiente',
};

export function StatusTag({ status, className = '' }: StatusTagProps) {
  return (
    <span className={`status-tag ${statusStyles[status]} ${className}`}>
      {statusLabels[status]}
    </span>
  );
}
