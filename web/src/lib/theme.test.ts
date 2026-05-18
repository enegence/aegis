import { describe, it, expect } from 'vitest';
import { THEMES, TWEAK_DEFAULTS, resolveTheme, tweaksPanelEnabled, computeInitialTweaks, USER_THEME_KEY } from './theme';

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

describe('USER_THEME_KEY', () => {
  it('is the ungated user theme localStorage key', () => {
    expect(USER_THEME_KEY).toBe('aegis:theme');
  });
});

describe('computeInitialTweaks', () => {
  it('defaults to blueprint when nothing stored', () => {
    const t = computeInitialTweaks({ devGate: false, devStateRaw: null, userTheme: null });
    expect(t.theme).toBe('blueprint');
  });
  it('applies user theme from aegis:theme when not dev-gated', () => {
    const t = computeInitialTweaks({ devGate: false, devStateRaw: null, userTheme: 'midnight' });
    expect(t.theme).toBe('midnight');
  });
  it('ignores an unknown user theme value and falls back to blueprint', () => {
    const t = computeInitialTweaks({ devGate: false, devStateRaw: null, userTheme: 'bogus' });
    expect(t.theme).toBe('blueprint');
  });
  it('dev tweaks state wins over user theme when dev-gated', () => {
    const t = computeInitialTweaks({ devGate: true, devStateRaw: '{"theme":"cream"}', userTheme: 'midnight' });
    expect(t.theme).toBe('cream');
  });
  it('valid dev state path wins entirely even if it lacks a theme key', () => {
    const t = computeInitialTweaks({ devGate: true, devStateRaw: '{}', userTheme: 'midnight' });
    expect(t.theme).toBe('blueprint');
  });
  it('falls through to user theme when dev state is unparseable', () => {
    const t = computeInitialTweaks({ devGate: true, devStateRaw: 'not json', userTheme: 'midnight' });
    expect(t.theme).toBe('midnight');
  });
  it('returns a full Tweaks object preserving other defaults', () => {
    const t = computeInitialTweaks({ devGate: false, devStateRaw: null, userTheme: 'midnight' });
    expect(t.density).toBe(TWEAK_DEFAULTS.density);
    expect(t.sketchIntensity).toBe(TWEAK_DEFAULTS.sketchIntensity);
  });
  it('does not mutate TWEAK_DEFAULTS', () => {
    computeInitialTweaks({ devGate: false, devStateRaw: null, userTheme: 'midnight' });
    expect(TWEAK_DEFAULTS.theme).toBe('blueprint');
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
