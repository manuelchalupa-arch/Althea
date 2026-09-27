import type { ReactNode } from 'react';

interface AltheaSectionProps {
  title: string;
  subtitle?: string;
  icon?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AltheaSection({ title, subtitle, icon, action, children, className = '' }: AltheaSectionProps) {
  return (
    <section className={className}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <span className="material-symbols-outlined text-[18px] text-primary shrink-0">{icon}</span>}
          <div className="min-w-0">
            <h2 className="text-section">{title}</h2>
            {subtitle && <p className="font-body-md text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}