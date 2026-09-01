module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {

      colors: {
        ink: {
          950: '#0a0a0a',
          900: '#0f0f0f',
          850: '#141414',
          800: '#1c1c1c',
          750: '#212121',
          700: '#2b2b2b',
          600: '#383838'
        },

        mist: {
          50: '#f2f2f2',
          100: '#e0e0e0',
          200: '#cccccc',
          300: '#b3b3b3',
          400: '#999999',
          500: '#757575',
          600: '#575757',
          700: '#3d3d3d'
        },
        gold: {
          300: '#f2c77e',
          400: '#e6ad55',
          500: '#d99a3c',
          600: '#b87f2c',
          glow: 'rgba(230, 173, 85, 0.16)'
        },
        moss: { 400: '#7fb069', 500: '#619b4d' },

        ember: { 400: '#e05e55', 500: '#c9483f', 600: '#9c3129' },
        sky: { 400: '#6aaee8' }
      },
      fontFamily: {

        display: ['Marcellus', 'Georgia', 'serif'],

        sans: ['"Recursive Variable"', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['"Recursive Variable"', 'Consolas', 'monospace'],

        pixel: ['Silkscreen', '"Courier New"', 'monospace']
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }]
      },
      boxShadow: {
        panel: '0 0 0 1px rgba(255,255,255,0.045)',

        'panel-edge': '8px 0 20px -8px rgba(0,0,0,0.4)',
        'chrome-edge': '0 8px 20px -8px rgba(0,0,0,0.4)',
        raised: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)',
        'glow-gold': '0 0 0 1px rgba(230,173,85,0.35), 0 0 18px rgba(230,173,85,0.12)',
        'glow-ember': '0 0 0 1px rgba(224,108,85,0.4), 0 0 18px rgba(224,108,85,0.12)'
      },
      transitionTimingFunction: {
        swift: 'cubic-bezier(0.22, 1, 0.36, 1)'
      }
    }
  },
  plugins: []
}
