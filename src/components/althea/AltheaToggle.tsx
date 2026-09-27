interface AltheaToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function AltheaToggle({ checked, onChange, label, description, disabled, className = '', id }: AltheaToggleProps) {
  const uid = id || `toggle-${label?.replace(/\s+/g, '-').toLowerCase() || Math.random().toString(36).slice(2, 8)}`
  return (
    <label
      htmlFor={uid}
      className={`flex items-center gap-3 cursor-pointer select-none ${disabled ? 'opacity-50' : ''} ${className}`}
    >
      <button
        id={uid}
        role="switch"
        type="button"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
          checked ? 'bg-primary border-primary' : 'bg-surface-container-high border-outline'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow-sm transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="font-label-md text-sm text-on-surface block">{label}</span>}
          {description && <span className="font-body-md text-xs text-on-surface-variant block">{description}</span>}
        </span>
      )}
    </label>
  );
}