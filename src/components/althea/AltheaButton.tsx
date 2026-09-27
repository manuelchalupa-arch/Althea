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

const variantClass = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-xs min-h-8',
  md: 'px-4 py-2 min-h-10',
  lg: 'px-6 py-3 min-h-11',
};

export function AltheaButton({
  variant = 'primary', size = 'md', icon, iconPosition = 'left',
  loading, fullWidth, children, className = '', disabled, ...props
}: AltheaButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`${variantClass[variant]} ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}`}
      {...props}
    >
      {loading ? (
        <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
      ) : icon && iconPosition === 'left' ? (
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
      ) : null}
      {children}
      {icon && iconPosition === 'right' && !loading && (
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
      )}
    </button>
  );
}