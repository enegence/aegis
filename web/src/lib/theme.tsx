import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export interface Theme {
  bg: string; ink: string; accent: string; muted: string; surface: string; border: string; danger: string;
}

export const THEMES: Record<'blueprint' | 'cream' | 'midnight', Theme> = {
  blueprint: { bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A', muted: '#4A6B8A', surface: '#C8D9ED', border: '#8AAAC8', danger: '#C0392B' },
  cream:     { bg: '#F7F4EE', ink: '#1C1917', accent: '#A0522D', muted: '#8B7355', surface: '#EDE9E0', border: '#C4B89A', danger: '#C0392B' },
  midnight:  { bg: '#111111', ink: '#F0EBE0', accent: '#E8C840', muted: '#888880', surface: '#1E1E1E', border: '#333330', danger: '#E53935' },
};

export const TWEAK_DEFAULTS = {
  theme: 'blueprint', sketchIntensity: 'full', accentColor: '', tiltAmount: 1.25,
  headingScale: 1, cardStyle: 'sketchy', density: 'comfortable', showDoodles: true,
  buttonShape: 'sketchy', sidebarWidth: 220, logoSize: 'md',
};

export type Tweaks = typeof TWEAK_DEFAULTS & Record<string, unknown>;

/** Ungated localStorage key holding the end-user's theme choice. */
export const USER_THEME_KEY = 'aegis:theme';

/** Theme names exposed to end users via the Settings → Appearance section. */
export const USER_THEMES = ['blueprint', 'midnight'] as const;
export type UserTheme = (typeof USER_THEMES)[number];

/**
 * Resolve the initial Tweaks for the ThemeProvider.
 * Precedence (highest first):
 *  1. dev tweaks state (only when devGate) — preserves the dev TweaksPanel workflow
 *  2. aegis:theme user choice (ungated, any browser)
 *  3. blueprint default
 */
export function computeInitialTweaks(env: {
  devGate: boolean;
  devStateRaw: string | null;
  userTheme: string | null;
}): Tweaks {
  if (env.devGate && env.devStateRaw) {
    try {
      return { ...TWEAK_DEFAULTS, ...JSON.parse(env.devStateRaw) };
    } catch { /* ignore — fall through to user theme */ }
  }
  const base = { ...TWEAK_DEFAULTS };
  if (env.userTheme && env.userTheme in THEMES) {
    base.theme = env.userTheme;
  }
  return base;
}

export function resolveTheme(tweaks: Tweaks): Theme {
  const base = THEMES[tweaks.theme as keyof typeof THEMES] || THEMES.blueprint;
  return { ...base, accent: (tweaks.accentColor as string) || base.accent };
}

function hexToRgbChannels(hex: string): string {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;
  const int = Number.parseInt(value, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `${r} ${g} ${b}`;
}

export function tweaksPanelEnabled(env: { dev: boolean; search: string; ls: string | null }): boolean {
  return env.dev || /[?&]tweaks=1\b/.test(env.search) || env.ls === '1';
}

interface Ctx {
  theme: Theme;
  tweaks: Tweaks;
  setTweak: (k: string, v: unknown) => void;
  setUserTheme: (name: UserTheme) => void;
}
const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const devGate = tweaksPanelEnabled({
    dev: import.meta.env.DEV,
    search: typeof window !== 'undefined' ? window.location.search : '',
    ls: typeof window !== 'undefined' ? window.localStorage.getItem('aegis:tweaks') : null,
  });
  const [tweaks, setTweaks] = useState<Tweaks>(() =>
    computeInitialTweaks({
      devGate,
      devStateRaw: typeof window !== 'undefined' ? window.localStorage.getItem('aegis:tweaks:state') : null,
      userTheme: typeof window !== 'undefined' ? window.localStorage.getItem(USER_THEME_KEY) : null,
    }),
  );
  const setTweak = useCallback((k: string, v: unknown) => {
    setTweaks(prev => {
      const next = { ...prev, [k]: v };
      if (devGate && typeof window !== 'undefined') {
        try { window.localStorage.setItem('aegis:tweaks:state', JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }, [devGate]);
  const setUserTheme = useCallback((name: UserTheme) => {
    setTweaks(prev => ({ ...prev, theme: name }));
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(USER_THEME_KEY, name); } catch { /* ignore */ }
    }
  }, []);
  const theme = resolveTheme(tweaks);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--brand-bg', hexToRgbChannels(theme.bg));
    root.style.setProperty('--brand-ink', hexToRgbChannels(theme.ink));
    root.style.setProperty('--brand-accent', hexToRgbChannels(theme.accent));
    root.style.setProperty('--brand-muted', hexToRgbChannels(theme.muted));
    root.style.setProperty('--brand-surface', hexToRgbChannels(theme.surface));
    root.style.setProperty('--brand-border', hexToRgbChannels(theme.border));
    root.style.setProperty('--brand-danger', hexToRgbChannels(theme.danger));

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.bg);
  }, [theme]);

  return <ThemeCtx.Provider value={{ theme, tweaks, setTweak, setUserTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Theme {
  const c = useContext(ThemeCtx); if (!c) throw new Error('useTheme outside ThemeProvider'); return c.theme;
}
export function useTweaks(): [Tweaks, (k: string, v: unknown) => void] {
  const c = useContext(ThemeCtx); if (!c) throw new Error('useTweaks outside ThemeProvider'); return [c.tweaks, c.setTweak];
}
/** Current theme name + ungated, persisted setter for the Settings → Appearance UI. */
export function useUserTheme(): [string, (name: UserTheme) => void] {
  const c = useContext(ThemeCtx); if (!c) throw new Error('useUserTheme outside ThemeProvider'); return [c.tweaks.theme, c.setUserTheme];
}
export function useTweaksPanelEnabled(): boolean {
  return tweaksPanelEnabled({
    dev: import.meta.env.DEV,
    search: typeof window !== 'undefined' ? window.location.search : '',
    ls: typeof window !== 'undefined' ? window.localStorage.getItem('aegis:tweaks') : null,
  });
}
