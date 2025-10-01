import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        'slate-950': '#0b1120',
      },
      boxShadow: {
        card: '0 20px 45px -25px rgba(15, 23, 42, 0.65)',
      },
    },
  },
  plugins: [],
}

export default config
