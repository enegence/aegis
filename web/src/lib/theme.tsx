import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

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

export function resolveTheme(tweaks: Tweaks): Theme {
  const base = THEMES[tweaks.theme as keyof typeof THEMES] || THEMES.blueprint;
  return { ...base, accent: (tweaks.accentColor as string) || base.accent };
}

export function tweaksPanelEnabled(env: { dev: boolean; search: string; ls: string | null }): boolean {
  return env.dev || /[?&]tweaks=1\b/.test(env.search) || env.ls === '1';
}

interface Ctx { theme: Theme; tweaks: Tweaks; setTweak: (k: string, v: unknown) => void; }
const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const devGate = tweaksPanelEnabled({
    dev: import.meta.env.DEV,
    search: typeof window !== 'undefined' ? window.location.search : '',
    ls: typeof window !== 'undefined' ? window.localStorage.getItem('aegis:tweaks') : null,
  });
  const [tweaks, setTweaks] = useState<Tweaks>(() => {
    if (devGate && typeof window !== 'undefined') {
      try { const s = window.localStorage.getItem('aegis:tweaks:state'); if (s) return { ...TWEAK_DEFAULTS, ...JSON.parse(s) }; } catch { /* ignore */ }
    }
    return { ...TWEAK_DEFAULTS };
  });
  const setTweak = useCallback((k: string, v: unknown) => {
    setTweaks(prev => {
      const next = { ...prev, [k]: v };
      if (devGate && typeof window !== 'undefined') {
        try { window.localStorage.setItem('aegis:tweaks:state', JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }, [devGate]);
  const theme = resolveTheme(tweaks);
  return <ThemeCtx.Provider value={{ theme, tweaks, setTweak }}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Theme {
  const c = useContext(ThemeCtx); if (!c) throw new Error('useTheme outside ThemeProvider'); return c.theme;
}
export function useTweaks(): [Tweaks, (k: string, v: unknown) => void] {
  const c = useContext(ThemeCtx); if (!c) throw new Error('useTweaks outside ThemeProvider'); return [c.tweaks, c.setTweak];
}
export function useTweaksPanelEnabled(): boolean {
  return tweaksPanelEnabled({
    dev: import.meta.env.DEV,
    search: typeof window !== 'undefined' ? window.location.search : '',
    ls: typeof window !== 'undefined' ? window.localStorage.getItem('aegis:tweaks') : null,
  });
}
