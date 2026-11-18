import { describe, it, expect } from 'vitest';
import { THEMES } from './theme';
import {
  BRAND_NAME, BRAND_TAGLINE, DEFAULT_RELAY_URL, HOSTED_SITE_HOST, HOSTED_SITE_URL, LOCKUP_ON_DARK, LOCKUP_ON_LIGHT,
  PACKET_DOWNLOAD_NAME, downloadNameFromHeader, lockupForInk,
} from './brand';

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

describe('hosted site address', () => {
  it('is written once and the relay URL follows it', () => {
    expect(HOSTED_SITE_HOST).toBe('underwing.life');
    expect(HOSTED_SITE_URL).toBe(`https://${HOSTED_SITE_HOST}`);
    expect(DEFAULT_RELAY_URL).toBe(HOSTED_SITE_URL);
  });
});

describe('downloadNameFromHeader', () => {
  it('uses the file name the server sends', () => {
    expect(downloadNameFromHeader('attachment; filename="underwing-packet-12.underwing.enc"', PACKET_DOWNLOAD_NAME))
      .toBe('underwing-packet-12.underwing.enc');
  });
  it('falls back when there is no header or no file name', () => {
    expect(downloadNameFromHeader(null, PACKET_DOWNLOAD_NAME)).toBe('underwing-packet.underwing.enc');
    expect(downloadNameFromHeader('attachment', PACKET_DOWNLOAD_NAME)).toBe('underwing-packet.underwing.enc');
  });
  it('ignores a name that tries to carry a path', () => {
    expect(downloadNameFromHeader('attachment; filename="../evil"', PACKET_DOWNLOAD_NAME)).toBe(PACKET_DOWNLOAD_NAME);
  });
});
