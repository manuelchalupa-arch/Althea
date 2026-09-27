import type { ReactNode } from 'react';

type BadgeVariant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline';

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
  primary: 'bg-primary/10 border-primary/35 text-primary',
  secondary: 'bg-secondary/10 border-secondary/35 text-secondary',
  success: 'bg-secondary/10 border-secondary/40 text-secondary',
  warning: 'bg-tertiary/10 border-tertiary/40 text-tertiary',
  danger: 'bg-error/15 border-error/40 text-error',
  outline: 'bg-transparent border-outline-variant text-on-surface-variant',
};

const sizeStyles = {
  xs: 'px-1.5 py-0.5 text-[9px]',
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1 text-xs',
};

export function AltheaBadge({ variant = 'default', size = 'sm', icon, dot, dotColor, children, className = '' }: AltheaBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-label-md font-bold uppercase tracking-wider
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
  completed: 'st-completed',
  rest: 'status-tag--rest',
  planned: 'status-tag--planned',
  active: 'status-tag--active',
  skipped: 'status-tag--skipped',
  pending: 'st-pending',
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