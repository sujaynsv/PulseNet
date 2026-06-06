/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      colors: {
        blood: {
          DEFAULT: '#c0192c',
          dark: '#8b0f1c',
          light: '#ff4d6d',
        },
        navy: {
          DEFAULT: '#0a0f2e',
          mid: '#111936',
          card: '#161d3f',
        },
      },
    },
  },
  plugins: [],
}
