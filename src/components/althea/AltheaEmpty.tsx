import type { ReactNode } from 'react';

interface AltheaEmptyProps {
  icon: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function AltheaEmpty({ icon, title, description, action, className = '' }: AltheaEmptyProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 text-center ${className}`}>
      <div className="w-16 h-16 rounded bg-surface-container-high border border-outline-variant flex items-center justify-center mb-4">
        <span className="material-symbols-outlined text-[28px] text-on-surface-variant">{icon}</span>
      </div>
      <h3 className="font-headline-md text-base font-semibold text-on-surface mb-1">{title}</h3>
      {description && <p className="font-body-md text-sm text-on-surface-variant max-w-[280px]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface AltheaLoadingProps {
  lines?: number;
  className?: string;
}

export function AltheaLoading({ lines = 3, className = '' }: AltheaLoadingProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-12 rounded bg-surface-container-high animate-pulse" style={{ width: `${70 + Math.random() * 30}%` }} />
      ))}
    </div>
  );
}
