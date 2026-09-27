import type { ReactNode } from 'react';

interface AltheaKPICardProps {
  icon: string;
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; positive: boolean };
  color?: 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}

const colorMap = {
  primary: 'text-primary',
  success: 'text-secondary',
  warning: 'text-tertiary',
  danger: 'text-error',
};

export function AltheaKPICard({ icon, label, value, subtitle, trend, color = 'primary', className = '' }: AltheaKPICardProps) {
  return (
    <div className={`althea-level-2 p-5 ${className}`}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
          <span className="material-symbols-outlined text-[16px] text-primary">{icon}</span>
        </div>
        <span className="text-aux">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-headline-md text-2xl font-bold leading-none ${colorMap[color]}`}>{value}</p>
          {subtitle && <p className="font-body-md text-xs text-on-surface-variant mt-1 truncate">{subtitle}</p>}
        </div>
        {trend && (
          <span className={`font-label-md text-xs font-bold ${trend.positive ? 'text-secondary' : 'text-error'}`}>
            {trend.positive ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>
    </div>
  );
}

interface AltheaProgressProps {
  value: number;
  max?: number;
  color?: 'primary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const barColors = {
  primary: 'bg-primary',
  success: 'bg-secondary',
  warning: 'bg-tertiary',
  danger: 'bg-error',
};

export function AltheaProgress({ value, max = 100, color = 'primary', size = 'md', showLabel, className = '' }: AltheaProgressProps) {
  const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  return (
    <div className={className}>
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="text-aux">{value}/{max}</span>
          <span className="text-aux font-bold text-primary">{pct}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="w-full bg-surface-container-high rounded-full overflow-hidden"
        style={{ height: size === 'sm' ? 4 : size === 'md' ? 6 : 10 }}
      >
        <div className={`${barColors[color]} rounded-full transition-all duration-500`} style={{ width: `${pct}%`, height: '100%' }} />
      </div>
    </div>
  );
}