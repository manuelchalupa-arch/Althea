import { useState } from 'react';
import { getTheme, setAppearance, type Theme } from '@/utils/appearance';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setAppearance(next, 'm');
  };

  return (
    <button
      onClick={toggle}
      className="theme-toggle-btn group"
      aria-label="Cambiar modo de iluminación helénica"
      type="button"
    >
      <span className="material-symbols-outlined icon-sun text-amber-500 group-hover:rotate-12 transition-transform dark:hidden">
        light_mode
      </span>
      <span className="material-symbols-outlined icon-moon text-primary group-hover:-rotate-12 transition-transform hidden dark:inline-block">
        dark_mode
      </span>
      <span className="font-label text-[11px] font-bold tracking-wider uppercase text-on-surface">
        {theme === 'dark' ? 'Luna' : 'Sol'}
      </span>
    </button>
  );
}
