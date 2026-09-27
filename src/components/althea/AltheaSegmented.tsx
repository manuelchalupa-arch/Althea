interface AltheaSegmentedOption {
  id: string;
  label: string;
  icon?: string;
}

interface AltheaSegmentedProps {
  options: AltheaSegmentedOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  label?: string;
}

export function AltheaSegmented({ options, value, onChange, className = '', label }: AltheaSegmentedProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`althea-seg w-full sm:w-auto ${className}`}
    >
      {options.map(opt => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            className={active ? 'is-active flex-1 sm:flex-none' : 'flex-1 sm:flex-none'}
            onClick={() => onChange(opt.id)}
          >
            {opt.icon && <span className="material-symbols-outlined text-[15px] align-text-bottom mr-1">{opt.icon}</span>}
            {opt.label}
          </button>
        )
      })}
    </div>
  );
}