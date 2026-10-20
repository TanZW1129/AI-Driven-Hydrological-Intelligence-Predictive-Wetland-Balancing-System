/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          950: '#05080f',
          900: '#0a1020',
          800: '#111a2e',
          700: '#1a2540',
        },
        water: {
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
        },
        phase: {
          normal: '#22c55e',
          predischarge: '#3b82f6',
          peakshaving: '#f59e0b',
          recovery: '#a855f7',
          lockout: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
