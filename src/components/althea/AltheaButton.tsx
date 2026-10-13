import type { ReactNode, ButtonHTMLAttributes } from 'react';
import SemanticIcon from '../ui/SemanticIcon';

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
        <span aria-hidden className="inline-flex items-center justify-center animate-spin" style={{ width: 14, height: 14 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </span>
      ) : icon && iconPosition === 'left' ? (
        <SemanticIcon name={icon} size={16} className="text-[16px]" ariaHidden />
      ) : null}
      {children}
      {icon && iconPosition === 'right' && !loading && (
        <SemanticIcon name={icon} size={16} className="text-[16px]" ariaHidden />
      )}
    </button>
  );
}