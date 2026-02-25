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
      },
      colors: {
        drift: {
          bg:      '#030712',   // gray-950
          panel:   '#0f1117',   // darker than gray-900
          surface: '#1a1d27',   // between gray-800 and gray-900
          input:   '#1f2937',   // gray-800
          border:  'rgba(255,255,255,0.08)',
          'border-lt': 'rgba(255,255,255,0.12)',
        },
        txt: {
          0: '#f9fafb',   // gray-50
          1: '#d1d5db',   // gray-300
          2: '#9ca3af',   // gray-400
          3: '#6b7280',   // gray-500
        },
        bull: '#31D0AA',
        bear: '#F84960',
        accent: '#6366F1',
        purple: '#B45BEE',
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
