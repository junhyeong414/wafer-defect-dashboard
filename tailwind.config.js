/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#f8fafc',
        panel: '#ffffff',
        line: '#e2e8f0',
        signal: '#2563eb',
        mint: '#64b893',
        cyan: '#2f80c5',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(37,99,235,.08), 0 10px 32px rgba(15,23,42,.08)',
      },
    },
  },
  plugins: [],
}
