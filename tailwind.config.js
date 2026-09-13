/** @type {import('tailwindcss').Config} */
// Design tokens Althea — Olympian Precision (stitch): valores en CSS vars (index.css).
// :root = Deep Navy #080E18/#0E141E · .light = sand. Mismo producto, dos templos.
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
        disabledBg: v('--surface-2'),
        althea: {
          deep: '#080E18',
          navy: '#0E141E',
          card: 'rgba(14,20,30,0.82)',
          steel: '#4682B4',
          ocean: '#19376D',
          dusk: '#7B9EB8',
          ivory: '#FAF6F0',
          gold: '#E8D5B5',
        }
      },
      borderRadius: { md: '6px', lg: '8px', xl: '10px', '2xl': '12px' },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"','Inter','system-ui','sans-serif'],
        serif: ['"EB Garamond"','serif'],
      },
      spacing: { '4': '4px','8':'8px','12':'12px','16':'16px','20':'20px','24':'24px','32':'32px' }
    }
  },
  plugins: []
}
