/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#2e7d32', light: '#43a047', dark: '#1b5e20' },
      },
    },
  },
  plugins: [],
}
