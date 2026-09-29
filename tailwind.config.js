const { fontFamily } = require('tailwindcss/defaultTheme');

/** Blush / lavender / ivory design system. Neutrals (slate) and status colours are re-tinted so every
 *  existing utility class picks up the new look without touching component logic. */
module.exports = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', ...fontFamily.sans],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(110,40,66,0.04), 0 8px 24px -8px rgba(110,40,66,0.10)',
        lift: '0 2px 4px rgba(110,40,66,0.05), 0 16px 32px -12px rgba(110,40,66,0.18)',
      },
      colors: {
        ivory: '#fdf9f6',
        blush: { 50: '#fff5f7', 100: '#ffe8ee', 200: '#ffd0dd', 300: '#f9aac0', 400: '#f07fa0', 500: '#e0567f', 600: '#c93f6a', 700: '#a63056', 800: '#862b4c', 900: '#6e2842' },
        lav: { 50: '#f7f4fd', 100: '#ece6fa', 200: '#dcd2f5', 300: '#c3b1ec', 400: '#a68fe0', 500: '#8a71d0', 600: '#7357b8', 700: '#5e4695', 800: '#4d3b78', 900: '#3d2f5f' },
        slate: { 50: '#faf6f7', 100: '#f3ecee', 200: '#e7dde1', 300: '#d5c7cd', 400: '#94838d', 500: '#75646f', 600: '#5f4f5a', 700: '#483b45', 800: '#33272f', 900: '#221a20' },
        emerald: { 50: '#eff8f3', 100: '#dcf0e4', 200: '#bce2cb', 500: '#5fae86', 600: '#3f9068', 700: '#2f7553', 800: '#285e45' },
        amber: { 50: '#fff8ea', 100: '#ffefcf', 200: '#f8dc9f', 500: '#dfa03c', 600: '#c4831f', 700: '#9c6614', 800: '#7d5210', 900: '#5f3f0e' },
        rose: { 50: '#fdf1f0', 100: '#fbe2e0', 200: '#f4c5c1', 500: '#d0605a', 600: '#b94a45', 700: '#9a3b37', 800: '#7f312e' },
      },
    },
  },
  plugins: [],
};
