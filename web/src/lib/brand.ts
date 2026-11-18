// Underwing brand assets. Final art lives in web/public/brand as plain
// outlines with fixed colours, so the lockup is chosen by ground, not tinted.

export const BRAND_NAME = 'Underwing';
export const BRAND_TAGLINE = 'Leave word for the people you love.';

export const LOCKUP_ON_LIGHT = '/brand/lockup.svg';
export const LOCKUP_ON_DARK = '/brand/lockup-on-dark.svg';

/** Width divided by height of the lockup art (bird beside the name). */
export const LOCKUP_ASPECT = 725.29 / 178;

function relativeLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const raw = match[1];
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const int = Number.parseInt(full, 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Pick the lockup for the ground it sits on, judged by the ink colour drawn
 * on that ground: light ink means a dark ground, so the on-dark lockup.
 * Anything that is not a hex colour falls back to the light-ground lockup.
 */
export function lockupForInk(ink: string): string {
  const luminance = relativeLuminance(ink);
  return luminance !== null && luminance > 0.5 ? LOCKUP_ON_DARK : LOCKUP_ON_LIGHT;
}
