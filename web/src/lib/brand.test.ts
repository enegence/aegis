import { describe, it, expect } from 'vitest';
import { THEMES } from './theme';
import { BRAND_NAME, BRAND_TAGLINE, LOCKUP_ON_DARK, LOCKUP_ON_LIGHT, lockupForInk } from './brand';

describe('brand', () => {
  it('names the product and its line', () => {
    expect(BRAND_NAME).toBe('Underwing');
    expect(BRAND_TAGLINE).toBe('Leave word for the people you love.');
  });

  it('uses the light-ground lockup for dark ink themes', () => {
    expect(lockupForInk(THEMES.blueprint.ink)).toBe(LOCKUP_ON_LIGHT);
    expect(lockupForInk(THEMES.cream.ink)).toBe(LOCKUP_ON_LIGHT);
  });

  it('uses the on-dark lockup when the ink is light', () => {
    expect(lockupForInk(THEMES.midnight.ink)).toBe(LOCKUP_ON_DARK);
    expect(lockupForInk('#fff')).toBe(LOCKUP_ON_DARK);
  });

  it('falls back to the light-ground lockup for non-hex colours', () => {
    expect(lockupForInk('currentColor')).toBe(LOCKUP_ON_LIGHT);
    expect(lockupForInk('')).toBe(LOCKUP_ON_LIGHT);
  });
});
