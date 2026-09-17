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
      className="theme-toggle-btn group flex items-center justify-center w-9 h-9 rounded-lg hover:bg-surface-container-high/50 transition-colors"
      aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      type="button"
    >
      {theme === 'dark' ? (
        <IconSun className="w-5 h-5 text-secondary" />
      ) : (
        <IconMoon className="w-5 h-5 text-primary" />
      )}
    </button>
  );
}
