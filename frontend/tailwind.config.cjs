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
          bg:      '#0e0f14',   // --bg-base (Backpack L0)
          panel:   '#14151b',   // --bg-surface (Backpack L2)
          surface: '#202127',   // --bg-elevated (Backpack L1)
          input:   '#202127',   // --bg-hover
          active:  '#2a2b33',   // --bg-active
          border:  'rgba(255,255,255,0.10)',   // --border-default
          'border-lt': 'rgba(255,255,255,0.15)', // --border-strong
          'border-sub': 'rgba(255,255,255,0.06)', // --border-subtle
        },
        txt: {
          0: '#f4f4f6',   // --text-primary
          1: '#969faf',   // --text-secondary
          2: '#75798a',   // --text-tertiary
          3: '#5d606f',   // --text-muted
        },
        bull:   '#00c278',  // --success (Backpack green)
        bear:   '#ff575a',  // --danger (Backpack red)
        accent: '#4c94ff',  // --accent (Backpack blue)
        purple: '#9b7dff',  // --accent-alt (purple)
        yellow: '#efa411',  // --warning (Backpack yellow)
      },
      fontSize: {
        '2xs': ['10px', '14px'],
      },
      borderRadius: {
        xl: '0.75rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.3), 0 1px 2px -1px rgba(0,0,0,0.3)',
      },
    },
  },
  plugins: [],
};
