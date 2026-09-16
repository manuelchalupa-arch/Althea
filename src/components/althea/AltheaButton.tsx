import type { ReactNode, ButtonHTMLAttributes } from 'react';

interface AltheaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

const variantStyles = {
  primary: 'bg-primary text-on-primary border border-outline-variant hover:opacity-90 shadow-md',
  secondary: 'bg-transparent text-on-surface border border-outline-variant hover:bg-surface-container-high',
  ghost: 'bg-transparent text-on-surface-variant hover:text-primary hover:bg-surface-container-high border border-transparent',
  danger: 'bg-error/15 text-error border border-error/40 hover:bg-error/25',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-xs',
  lg: 'px-5 py-2.5 text-xs',
};

export function AltheaButton({
  variant = 'primary', size = 'md', icon, iconPosition = 'left',
  loading, fullWidth, children, className = '', disabled, ...props
}: AltheaButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 font-label-md font-bold uppercase tracking-wider rounded transition-all
        ${variantStyles[variant]} ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.98]'}
        ${className}`}
      {...props}
    >
      {loading ? (
        <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
      ) : icon && iconPosition === 'left' ? (
        <span className="material-symbols-outlined text-[14px]">{icon}</span>
      ) : null}
      {children}
      {icon && iconPosition === 'right' && !loading && (
        <span className="material-symbols-outlined text-[14px]">{icon}</span>
      )}
    </button>
  );
}
