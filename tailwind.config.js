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
        // PALMS train: a small chug so the whole train looks like it is
        // rolling, and smoke puffing out of the funnel.
        chug: {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '25%': { transform: 'translateY(-1.5px) rotate(-.4deg)' },
          '50%': { transform: 'translateY(0) rotate(0deg)' },
          '75%': { transform: 'translateY(-1px) rotate(.4deg)' },
        },
        puff: {
          '0%': { transform: 'translate(0, 0) scale(.5)', opacity: '0' },
          '20%': { opacity: '.8' },
          '100%': { transform: 'translate(-9px, -22px) scale(1.7)', opacity: '0' },
        },
      },
      animation: {
        chug: 'chug .6s ease-in-out infinite',
        puff: 'puff 2.4s ease-out infinite',
      },
    },
  },
  plugins: [],
};
