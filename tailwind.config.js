/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'discord': {
          '50': '#eef2ff',
          '100': '#e0e7ff',
          '200': '#c7d2fe',
          '300': '#a5b4fc',
          '400': '#818cf8',
          '500': '#6366f1',
          '600': '#5865f2',
          '700': '#4f46e5',
          '800': '#4338ca',
          '900': '#3730a3',
        },
        'dark': {
          '100': '#2b2d31',
          '200': '#1e1f22',
          '300': '#111214',
        }
      },
    },
  },
  plugins: [],
}