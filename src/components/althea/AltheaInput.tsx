import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

interface AltheaInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: string;
}

export function AltheaInput({ label, hint, error, icon, className = '', ...props }: AltheaInputProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{label}</label>}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[16px] text-on-surface-variant">{icon}</span>
        )}
        <input
          className={`input font-body-md text-sm ${icon ? 'pl-9' : ''} ${error ? 'border-error' : ''} ${className}`}
          {...props}
        />
      </div>
      {hint && !error && <p className="font-body-md text-[11px] text-on-surface-variant">{hint}</p>}
      {error && <p className="font-body-md text-[11px] text-error">{error}</p>}
    </div>
  );
}

interface AltheaSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function AltheaSelect({ label, options, className = '', ...props }: AltheaSelectProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{label}</label>}
      <select className={`input font-body-md text-sm appearance-none cursor-pointer ${className}`} {...props}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

interface AltheaTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function AltheaTextarea({ label, className = '', ...props }: AltheaTextareaProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{label}</label>}
      <textarea className={`input font-body-md text-sm min-h-[80px] resize-y ${className}`} {...props} />
    </div>
  );
}
