/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        drift: {
          bg:      '#0e0e11',   // Backpack L0 — true background
          panel:   '#141418',   // Backpack surface
          surface: '#1c1c24',   // Backpack elevated/hover
          input:   '#1c1c24',   // Input background
          active:  '#24242e',   // Active/pressed state
          border:  'rgba(255,255,255,0.06)',   // Backpack border
          'border-lt': 'rgba(255,255,255,0.10)', // Stronger border
          'border-sub': 'rgba(255,255,255,0.04)', // Ultra-subtle border
        },
        txt: {
          0: '#f5f5f7',   // Primary text
          1: '#8a8f98',   // Secondary text
          2: '#6c7080',   // Tertiary text
          3: '#4e5261',   // Muted text
        },
        bull:   '#24b47e',  // Backpack buy green
        bear:   '#f84960',  // Backpack sell red
        accent: '#5c8ae6',  // Backpack accent blue
        purple: '#9b7dff',  // Accent alt
        yellow: '#efa411',  // Warning
      },
      fontSize: {
        '2xs': ['10px', '14px'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '8px',
        xl: '8px',
      },
    },
  },
  plugins: [],
};
