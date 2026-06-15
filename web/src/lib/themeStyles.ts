import type { CSSProperties } from 'react';
import type { Theme } from './theme';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

function isDarkTheme(theme: Theme): boolean {
  return theme.bg.toLowerCase() === '#111111';
}

export function toneTextColor(theme: Theme, tone: Exclude<Tone, 'neutral'>): string {
  if (tone === 'danger') return theme.danger;
  if (tone === 'warning') return isDarkTheme(theme) ? theme.accent : '#9A5A00';
  if (tone === 'info') return isDarkTheme(theme) ? '#9BC3E8' : theme.accent;
  return isDarkTheme(theme) ? '#8FE3A4' : '#1F8B4C';
}

export function toneBadgeStyle(theme: Theme, tone: Tone): CSSProperties {
  const dark = isDarkTheme(theme);

  switch (tone) {
    case 'success':
      return dark
        ? { background: 'rgba(72, 124, 82, 0.26)', border: '1px solid rgba(143, 227, 164, 0.22)', color: '#8FE3A4' }
        : { background: '#DCEFE3', border: '1px solid #B8D8BF', color: '#1F8B4C' };
    case 'warning':
      return dark
        ? { background: 'rgba(232, 200, 64, 0.16)', border: '1px solid rgba(232, 200, 64, 0.24)', color: theme.accent }
        : { background: '#F6E8C9', border: '1px solid #E3C891', color: '#9A5A00' };
    case 'danger':
      return dark
        ? { background: 'rgba(229, 57, 53, 0.16)', border: '1px solid rgba(255, 139, 135, 0.22)', color: '#FF8B87' }
        : { background: '#F6D7D3', border: '1px solid #E6B1A8', color: theme.danger };
    case 'info':
      return dark
        ? { background: 'rgba(112, 146, 198, 0.18)', border: '1px solid rgba(155, 195, 232, 0.24)', color: '#9BC3E8' }
        : { background: '#D6E7F3', border: '1px solid #B8D0E5', color: theme.accent };
    case 'neutral':
    default:
      return dark
        ? { background: 'rgba(51, 51, 48, 0.7)', border: '1px solid rgba(136, 136, 128, 0.2)', color: theme.muted }
        : { background: theme.surface, border: `1px solid ${theme.border}`, color: theme.muted };
  }
}

export function createInputStyle(theme: Theme, overrides: CSSProperties = {}): CSSProperties {
  return {
    width: '100%',
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    color: theme.ink,
    padding: '6px 10px',
    borderRadius: '4px',
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: '0.85rem',
    outline: 'none',
    boxSizing: 'border-box',
    ...overrides,
  };
}

export function createLabelStyle(theme: Theme): CSSProperties {
  return {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: '0.72rem',
    color: theme.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    display: 'block',
    marginBottom: '3px',
  };
}

export function createActionButtonStyle(
  theme: Theme,
  variant: 'primary' | 'secondary' | 'danger' | 'outline',
  disabled = false,
): CSSProperties {
  const baseColor = variant === 'danger' ? theme.danger : variant === 'primary' ? theme.ink : theme.border;
  const color = variant === 'danger'
    ? theme.danger
    : variant === 'primary'
    ? theme.bg
    : variant === 'outline'
    ? theme.accent
    : theme.ink;

  return {
    fontFamily: "'Inter',system-ui,sans-serif",
    fontSize: '0.82rem',
    fontWeight: 600,
    padding: '7px 14px',
    background: disabled
      ? theme.border
      : variant === 'primary'
      ? theme.ink
      : variant === 'danger'
      ? 'transparent'
      : variant === 'outline'
      ? 'transparent'
      : theme.surface,
    color: disabled ? theme.bg : color,
    border: `1.5px solid ${disabled ? theme.border : baseColor}`,
    borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.1s, border-color 0.1s, color 0.1s',
  };
}
