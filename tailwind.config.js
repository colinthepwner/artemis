module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {

      colors: {
        ink: {
          950: '#07090c',
          900: '#0b0e12',
          850: '#10141a',
          800: '#151a21',
          750: '#1a2029',
          700: '#212934',
          600: '#2c3644'
        },
        mist: {
          50: '#eef1f6',
          200: '#c3cad6',
          400: '#8b96a8',
          500: '#667183',
          600: '#4a5464'
        },
        gold: {
          300: '#f2c77e',
          400: '#e6ad55',
          500: '#d99a3c',
          600: '#b87f2c',
          glow: 'rgba(230, 173, 85, 0.16)'
        },
        moss: { 400: '#7fb069', 500: '#619b4d' },
        ember: { 400: '#e06c55', 500: '#c9553f', 600: '#9c3a29' },
        sky: { 400: '#6aaee8' }
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'Consolas', 'monospace'],

        pixel: ['Silkscreen', '"Courier New"', 'monospace']
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }]
      },
      boxShadow: {
        panel: '0 0 0 1px rgba(255,255,255,0.045)',
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
