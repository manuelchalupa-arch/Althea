/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0B1014',
        surface: '#1F272A',
        card: '#1F272A',
        accentDark: '#144D37',
        accentDark2: '#155037',
        action: '#1E3A5F',
        info: '#38BDF0',
        border: '#263034',
        textMain: '#F1F5F3',
        textMuted: '#A8B2B0',
        disabled: '#7A8B8A',
        disabledBg: '#2A3538'
      },
      borderRadius: { md: '8px', lg: '12px', xl: '16px', '2xl': '20px' },
      fontFamily: { sans: ['Roboto','system-ui','sans-serif'] },
      spacing: { '4': '4px','8':'8px','12':'12px','16':'16px','20':'20px','24':'24px','32':'32px' }
    }
  },
  plugins: []
}
