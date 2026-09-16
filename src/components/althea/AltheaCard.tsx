import type { ReactNode } from 'react';

interface AltheaCardProps {
  children: ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
  hover?: boolean;
  onClick?: () => void;
}

const padMap = { sm: 'p-3.5', md: 'p-5', lg: 'p-6' };

export function AltheaCard({ children, className = '', padding = 'md', hover = false, onClick }: AltheaCardProps) {
  return (
    <div
      onClick={onClick}
      className={`marble-slab rounded ${padMap[padding]} ${hover ? 'hover:border-primary/50 transition-all cursor-pointer' : 'transition-colors'} ${className}`}
    >
      {children}
    </div>
  );
}

interface AltheaCardHeaderProps {
  title: string;
  subtitle?: string;
  icon?: string;
  action?: ReactNode;
  className?: string;
}

export function AltheaCardHeader({ title, subtitle, icon, action, className = '' }: AltheaCardHeaderProps) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      <div className="flex items-center gap-2.5">
        {icon && <span className="material-symbols-outlined text-[18px] text-primary">{icon}</span>}
        <div>
          <h3 className="font-headline-md text-sm font-semibold text-on-surface">{title}</h3>
          {subtitle && <p className="font-body-md text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
