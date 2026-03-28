import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        arena: {
          bg:      '#07070f',
          surface: '#0f0f1a',
          card:    '#13131f',
          border:  '#1e1e2e',
          muted:   '#2a2a3e',
        },
        style: {
          anxious:      '#f59e0b',
          avoidant:     '#3b82f6',
          secure:       '#10b981',
          disorganized: '#a855f7',
        },
        stage: {
          strangers:  '#374151',
          matched:    '#1d4ed8',
          talking:    '#0369a1',
          flirting:   '#7c3aed',
          dating:     '#be185d',
          committed:  '#b45309',
          engaged:    '#d97706',
          married:    '#ca8a04',
          broken_up:  '#dc2626',
          divorced:   '#991b1b',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':    'fadeIn 0.4s ease-in',
        'slide-up':   'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}

export default config
