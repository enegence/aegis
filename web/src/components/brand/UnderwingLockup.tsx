import { useTheme } from '../../lib/theme';
import { BRAND_NAME, BRAND_TAGLINE, LOCKUP_ASPECT, lockupForInk } from '../../lib/brand';

interface UnderwingLockupProps {
  size?: 'sm' | 'md' | 'lg';
  /** Ink colour of the ground the lockup sits on. Picks the light or on-dark art and tints the line under it. */
  color?: string;
}

// Paper bird beside the Underwing name, with the line under it.
export default function UnderwingLockup({ size = 'md', color = 'currentColor' }: UnderwingLockupProps) {
  const t = useTheme();
  const ink = color === 'currentColor' ? t.ink : color;
  const widths: Record<string, number> = { sm: 148, md: 176, lg: 288 };
  const w = widths[size] || 176;
  const tagSizes: Record<string, number> = { sm: 10, md: 11, lg: 13 };
  const ts = tagSizes[size] || 11;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, maxWidth: '100%' }}>
      <img
        src={lockupForInk(ink)}
        alt={BRAND_NAME}
        width={w}
        height={Math.round(w / LOCKUP_ASPECT)}
        style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
      />
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: ts,
          lineHeight: 1.4,
          color,
          opacity: 0.6,
          letterSpacing: '0.02em',
          maxWidth: w,
          textWrap: 'balance',
          textAlign: 'left',
          paddingLeft: 2,
        }}
      >
        {BRAND_TAGLINE}
      </div>
    </div>
  );
}
