import { describe, it, expect } from 'vitest';
import { THEMES, TWEAK_DEFAULTS, resolveTheme, tweaksPanelEnabled } from './theme';

describe('resolveTheme', () => {
  it('returns blueprint by default', () => {
    expect(resolveTheme(TWEAK_DEFAULTS).bg).toBe('#DDE8F4');
    expect(resolveTheme(TWEAK_DEFAULTS).accent).toBe('#1A6B9A');
  });
  it('switches palette by theme key', () => {
    expect(resolveTheme({ ...TWEAK_DEFAULTS, theme: 'midnight' }).bg).toBe('#111111');
  });
  it('accentColor overrides theme accent', () => {
    expect(resolveTheme({ ...TWEAK_DEFAULTS, accentColor: '#FF0000' }).accent).toBe('#FF0000');
  });
  it('falls back to blueprint for unknown theme', () => {
    expect(resolveTheme({ ...TWEAK_DEFAULTS, theme: 'bogus' }).bg).toBe(THEMES.blueprint.bg);
  });
});

describe('tweaksPanelEnabled', () => {
  it('true when dev', () => {
    expect(tweaksPanelEnabled({ dev: true, search: '', ls: null })).toBe(true);
  });
  it('true when ?tweaks=1', () => {
    expect(tweaksPanelEnabled({ dev: false, search: '?tweaks=1', ls: null })).toBe(true);
  });
  it('true when localStorage flag set', () => {
    expect(tweaksPanelEnabled({ dev: false, search: '', ls: '1' })).toBe(true);
  });
  it('false in plain production', () => {
    expect(tweaksPanelEnabled({ dev: false, search: '', ls: null })).toBe(false);
  });
});
