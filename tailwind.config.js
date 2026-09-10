/** @type {import('tailwindcss').Config} */
// Design tokens Althea: los valores viven en CSS vars (index.css).
// :root = dark navy · .light = sand. Mismo producto, dos temas.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('--bg'),
        surface: v('--surface'),
        card: v('--surface'),
        elevated: v('--surface-2'),
        accentDark: v('--tint'),
        accentDark2: v('--tint'),
        action: v('--primary'),
        primary: v('--primary'),
        info: v('--info'),
        success: v('--success'),
        warning: v('--warning'),
        danger: v('--danger'),
        border: v('--border'),
        textMain: v('--text'),
        textMuted: v('--text-2'),
        textFaint: v('--text-3'),
        disabled: v('--text-3'),
        disabledBg: v('--surface-2')
      },
      borderRadius: { md: '6px', lg: '8px', xl: '10px', '2xl': '12px' },
      fontFamily: { sans: ['Roboto','system-ui','sans-serif'] },
      spacing: { '4': '4px','8':'8px','12':'12px','16':'16px','20':'20px','24':'24px','32':'32px' }
    }
  },
  plugins: []
}
