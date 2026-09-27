import type { ReactNode } from 'react';

export interface AltheaTabDef {
  id: string;
  label: string;
  icon?: string;
  content: ReactNode;
}

interface AltheaTabsProps {
  tabs: AltheaTabDef[];
  active?: string;
  onActiveChange?: (id: string) => void;
  className?: string;
}

export function AltheaTabs({ tabs, active, onActiveChange, className = '' }: AltheaTabsProps) {
  const current = active ?? tabs[0]?.id ?? '';
  return (
    <div className={className}>
      <div className="althea-tabs" role="tablist" aria-label="Secciones">
        {tabs.map(tab => {
          const selected = tab.id === current;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              className="althea-tab"
              onClick={() => onActiveChange?.(tab.id)}
            >
              {tab.icon && <span className="material-symbols-outlined text-[16px] align-text-bottom mr-1">{tab.icon}</span>}
              {tab.label}
            </button>
          )
        })}
      </div>
      {tabs.find(t => t.id === current)?.content && (
        <div role="tabpanel" id={`panel-${current}`} aria-labelledby={`tab-${current}`} className="temple-rise pt-4">
          {tabs.find(t => t.id === current)!.content}
        </div>
      )}
    </div>
  );
}