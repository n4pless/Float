/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"SF Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        drift: {
          bg:      '#0D0D12',   // --bg-page
          panel:   '#14141B',   // --bg-surface
          surface: '#1C1C27',   // --bg-elevated
          input:   '#1A1A24',   // --bg-input
          active:  '#24242e',   // active/pressed
          border:  '#232334',   // --border-subtle (solid hex)
          'border-lt': '#3A3A52', // --border-active
          'border-sub': '#1a1a28', // ultra-subtle
        },
        txt: {
          0: '#E8E8ED',   // --text-primary
          1: '#6B6B80',   // --text-secondary
          2: '#6B6B80',   // same for compat
          3: '#4A4A5E',   // --text-muted
        },
        bull:   '#00D26A',  // --green-primary
        bear:   '#FF4D6A',  // --red-primary
        accent: '#4C8BF5',  // --blue-accent
        purple: '#9b7dff',  // Accent alt
        yellow: '#F0B90B',  // --yellow-badge
        'bull-bg': 'rgba(0,210,106,0.10)',   // --green-bg
        'bear-bg': 'rgba(255,77,106,0.10)',  // --red-bg
      },
      fontSize: {
        '2xs': ['10px', '14px'],
      },
      borderRadius: {
        none: '0px',
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',
        lg: '12px',
        xl: '12px',
      },
    },
  },
  plugins: [],
};
