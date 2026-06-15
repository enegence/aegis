import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        hand: ['Caveat', 'cursive'],
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        blueprint: {
          bg: 'rgb(var(--brand-bg) / <alpha-value>)',
          ink: 'rgb(var(--brand-ink) / <alpha-value>)',
          accent: 'rgb(var(--brand-accent) / <alpha-value>)',
          muted: 'rgb(var(--brand-muted) / <alpha-value>)',
          surface: 'rgb(var(--brand-surface) / <alpha-value>)',
          border: 'rgb(var(--brand-border) / <alpha-value>)',
          danger: 'rgb(var(--brand-danger) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
