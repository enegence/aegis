export const themes = {
  blueprint: {
    bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A',
    muted: '#4A6B8A', surface: '#C8D9ED', border: '#8AAAC8',
    danger: '#C0392B',
  },
  cream: {
    bg: '#F7F4EE', ink: '#1C1917', accent: '#A0522D',
    muted: '#8B7355', surface: '#EDE9E0', border: '#C4B89A',
    danger: '#C0392B',
  },
  midnight: {
    bg: '#111111', ink: '#F0EBE0', accent: '#E8C840',
    muted: '#888880', surface: '#1E1E1E', border: '#333330',
    danger: '#E53935',
  },
} as const;

export type ThemeName = keyof typeof themes;
export type Theme = typeof themes[ThemeName];
