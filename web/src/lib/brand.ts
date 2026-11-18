// Underwing brand assets. Final art lives in web/public/brand as plain
// outlines with fixed colours, so the lockup is chosen by ground, not tinted.

export const BRAND_NAME = 'Underwing';
export const BRAND_TAGLINE = 'Leave word for the people you love.';

/**
 * The hosted Underwing site: where accounts live and the base URL a
 * self-hosted install links to for Relay. This is the one place the address is
 * written in the web app; it moves when the hosted site changes domain.
 */
export const HOSTED_SITE_HOST = 'aegisdms.life';
export const HOSTED_SITE_URL = `https://${HOSTED_SITE_HOST}`;
/** Relay is served from the hosted site itself, so its URL is the site URL. */
export const DEFAULT_RELAY_URL = HOSTED_SITE_URL;

/** File name for a downloaded packet when the server does not send one. */
export const PACKET_DOWNLOAD_NAME = 'underwing-packet.underwing.enc';

/** The file name in a Content-Disposition header, or the fallback when there is none. */
export function downloadNameFromHeader(header: string | null, fallback: string): string {
  const match = header ? /filename="([^"\\/]+)"/.exec(header) : null;
  return match ? match[1] : fallback;
}

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
