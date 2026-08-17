/** @type {import('tailwindcss').Config} */
export default {
  // app.html is the source shell (root index.html is build output — see vite.config.js).
  content: ['./app.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      keyframes: {
        // PALMS train: smoke puffing out of the funnel.
        puff: {
          '0%': { transform: 'translate(0, 0) scale(.5)', opacity: '0' },
          '20%': { opacity: '.8' },
          '100%': { transform: 'translate(-9px, -22px) scale(1.7)', opacity: '0' },
        },
      },
      animation: {
        puff: 'puff 2.4s ease-out infinite',
      },
    },
  },
  plugins: [],
};
