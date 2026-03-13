/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          50:  '#F6F6FA',
          100: '#EDEDF2',
          200: '#D8D8E0',
          300: '#A0A0AA',
          400: '#747480',
          500: '#4A4A55',
          600: '#2E2E38',
          700: '#23232C',
          800: '#1A1A22',
          900: '#0F0F14',
        },
        teal: {
          300: '#FFE600',
          400: '#FFE600',
          500: '#E6CF00',
          600: '#CCB800',
        },
        dark: {
          bg:      '#1A1A22',
          surface: '#23232C',
          border:  '#2E2E38',
          deeper:  '#0F0F14',
          text:    '#F6F6FA',
          muted:   '#747480',
        },
        ey: {
          yellow: '#FFE600',
          dark:   '#2E2E38',
          gray:   '#747480',
          light:  '#F6F6FA',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', 'monospace'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
