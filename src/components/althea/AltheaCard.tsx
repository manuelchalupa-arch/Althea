import type { ReactNode } from 'react';

interface AltheaCardProps {
  children: ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg' | 'none';
  hover?: boolean;
  onClick?: () => void;
  level?: 1 | 2 | 3 | 4;
}

const padMap = { sm: 'p-3.5', md: 'p-5', lg: 'p-6', none: '' };
const levelMap: Record<number, string> = {
  1: 'althea-level-1',
  2: 'althea-level-2',
  3: 'althea-level-3',
  4: 'althea-level-4',
};

export function AltheaCard({ children, className = '', padding = 'md', hover = false, onClick, level = 2 }: AltheaCardProps) {
  return (
    <div
      onClick={onClick}
      className={`${levelMap[level]} ${padMap[padding]} ${hover ? 'hover:border-primary/60 hover:shadow-al-md transition-all cursor-pointer' : 'transition-colors'} ${className}`}
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
    <div className={`flex items-center justify-between gap-3 mb-4 ${className}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <span className="material-symbols-outlined text-[18px] text-primary shrink-0">{icon}</span>}
        <div className="min-w-0">
          <h3 className="font-headline-md text-on-surface truncate">{title}</h3>
          {subtitle && <p className="font-body-md text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}