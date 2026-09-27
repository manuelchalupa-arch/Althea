import { useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface AltheaInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: string;
}

export function AltheaInput({ label, hint, error, icon, className = '', id, 'aria-invalid': ariaInvalid, 'aria-describedby': ariaDescribedBy, ...props }: AltheaInputProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const hintId = hint && !error ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId, ariaDescribedBy].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1.5">
      {label && <label className="text-aux" htmlFor={controlId}>{label}</label>}
      <div className="relative">
        {icon && (
          <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] text-on-surface-variant pointer-events-none">{icon}</span>
        )}
        <input
          id={controlId}
          aria-invalid={error ? true : ariaInvalid}
          aria-describedby={describedBy}
          className={`input font-body-md ${icon ? 'pl-10' : ''} ${error ? 'input-error' : ''} ${className}`}
          {...props}
        />
      </div>
      {hint && !error && <p id={hintId} className="font-body-md text-xs text-on-surface-variant">{hint}</p>}
      {error && <p id={errorId} className="font-body-md text-xs text-error" role="alert">{error}</p>}
    </div>
  );
}

interface AltheaSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function AltheaSelect({ label, options, className = '', id, ...props }: AltheaSelectProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  return (
    <div className="space-y-1.5">
      {label && <label className="text-aux" htmlFor={controlId}>{label}</label>}
      <div className="relative">
        <select id={controlId} className={`input font-body-md appearance-none cursor-pointer pr-9 ${className}`} {...props}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[16px] text-on-surface-variant pointer-events-none">expand_more</span>
      </div>
    </div>
  );
}

interface AltheaTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function AltheaTextarea({ label, className = '', id, ...props }: AltheaTextareaProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  return (
    <div className="space-y-1.5">
      {label && <label className="text-aux" htmlFor={controlId}>{label}</label>}
      <textarea id={controlId} className={`input font-body-md min-h-[88px] resize-y ${className}`} {...props} />
    </div>
  );
}
