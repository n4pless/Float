/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        drift: {
          bg:      '#08080a',   // --bg-base
          panel:   '#111114',   // --bg-surface
          surface: '#19191d',   // --bg-elevated
          input:   '#222226',   // --bg-hover
          active:  '#2a2a2f',   // --bg-active
          border:  'rgba(255,255,255,0.08)',   // --border-default
          'border-lt': 'rgba(255,255,255,0.14)', // --border-strong
          'border-sub': 'rgba(255,255,255,0.05)', // --border-subtle
        },
        txt: {
          0: '#fafafa',   // --text-primary
          1: '#a1a1aa',   // --text-secondary (zinc-400)
          2: '#71717a',   // --text-tertiary (zinc-500)
          3: '#3f3f46',   // --text-muted (zinc-700)
        },
        bull:   '#34d399',  // --success (emerald-400)
        bear:   '#f87171',  // --danger (red-400)
        accent: '#e4e4e7',  // --accent (zinc-200, neutral)
        purple: '#d4d4d8',  // --accent-hover (zinc-300)
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
