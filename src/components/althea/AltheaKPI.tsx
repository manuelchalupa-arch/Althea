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
  success: 'text-primary',
  warning: 'text-secondary',
  danger: 'text-error',
};

export function AltheaKPICard({ icon, label, value, subtitle, trend, color = 'primary', className = '' }: AltheaKPICardProps) {
  return (
    <div className={`marble-slab rounded p-5 ${className}`}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded bg-primary/15 border border-primary/30 flex items-center justify-center">
          <span className="material-symbols-outlined text-[16px] text-primary">{icon}</span>
        </div>
        <span className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className={`font-headline-md text-2xl font-bold leading-none ${colorMap[color]}`}>{value}</p>
          {subtitle && <p className="font-body-md text-xs text-on-surface-variant mt-1">{subtitle}</p>}
        </div>
        {trend && (
          <span className={`font-label-md text-xs font-bold ${trend.positive ? 'text-primary' : 'text-error'}`}>
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
  success: 'bg-primary',
  warning: 'bg-secondary',
  danger: 'bg-error',
};

const barSizes = { sm: 'h-1', md: 'h-1.5', lg: 'h-2.5' };

export function AltheaProgress({ value, max = 100, color = 'primary', size = 'md', showLabel, className = '' }: AltheaProgressProps) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={className}>
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="font-label-caps text-[10px] text-on-surface-variant">{value}/{max}</span>
          <span className="font-label-caps text-[10px] font-bold text-primary">{pct}%</span>
        </div>
      )}
      <div className="w-full bg-surface-container-high rounded-full overflow-hidden" style={{ height: size === 'sm' ? 4 : size === 'md' ? 6 : 10 }}>
        <div className={`${barColors[color]} ${barSizes[size]} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
