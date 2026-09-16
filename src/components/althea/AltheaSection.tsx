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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {icon && <span className="material-symbols-outlined text-[18px] text-primary">{icon}</span>}
          <div>
            <h2 className="font-headline-lg text-lg font-semibold text-on-surface">{title}</h2>
            {subtitle && <p className="font-body-md text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
