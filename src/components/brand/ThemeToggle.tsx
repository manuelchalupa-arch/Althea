import { useState } from 'react';
import { getTheme, setAppearance, type Theme } from '@/utils/appearance';
import { IconSun, IconMoon } from './FitnessIcons';

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
      className="theme-toggle-btn group flex items-center gap-1.5"
      aria-label="Cambiar modo de iluminación helénica"
      type="button"
    >
      <span className="text-amber-500 group-hover:rotate-12 transition-transform dark:hidden">
        <IconSun className="w-5 h-5" />
      </span>
      <span className="text-primary group-hover:-rotate-12 transition-transform hidden dark:inline-block">
        <IconMoon className="w-5 h-5" />
      </span>
      <span className="font-label text-[11px] font-bold tracking-wider uppercase text-on-surface">
        {theme === 'dark' ? 'Luna' : 'Sol'}
      </span>
    </button>
  );
}
