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
      <div className="w-16 h-16 rounded-2xl bg-surface-container-low border border-outline-variant flex items-center justify-center mb-4 shadow-al-sm">
        <span className="material-symbols-outlined text-[28px] text-on-surface-variant">{icon}</span>
      </div>
      <h3 className="text-subtitle mb-1">{title}</h3>
      {description && <p className="font-body-md text-sm text-on-surface-variant max-w-[300px]">{description}</p>}
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
    <div className={`space-y-3 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-12 rounded-xl bg-surface-container-high animate-pulse" style={{ width: `${70 + Math.random() * 30}%` }} />
      ))}
    </div>
  );
}