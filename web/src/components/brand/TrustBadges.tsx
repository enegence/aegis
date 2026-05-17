import type { CSSProperties } from 'react';
import { useTheme } from '../../lib/theme';

// Tinted line-art via CSS mask — keeps the illustration in the active ink
// color across blueprint/cream/midnight themes. Mirrors the SaaS Landing
// MaskArt so the trust badges are visually identical across both repos.
function MaskArt({ src, color, style }: { src: string; color: string; style?: CSSProperties }) {
  return (
    <div
      role="img"
      style={{
        backgroundColor: color,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        ...style,
      }}
    />
  );
}

// The three illustrated trust badges from the original landing hero.
// Applies to OSS (self-hosted, open source, no passwords stored) and is
// shown on Setup Step 0. Kept byte-aligned with the SaaS Landing badge block.
export default function TrustBadges() {
  const t = useTheme();
  const card: CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    background: t.surface, border: `2px solid ${t.border}`,
    borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px',
    padding: '18px 22px', minWidth: 160, maxWidth: 190,
  };
  const title: CSSProperties = { fontFamily: "'Caveat',cursive", fontSize: 16, fontWeight: 700, color: t.ink, textAlign: 'center', lineHeight: 1.2 };
  const sub: CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: t.muted, letterSpacing: '0.06em', textAlign: 'center', textTransform: 'uppercase' };

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
      <div style={{ ...card, transform: 'rotate(-0.6deg)' }}>
        <MaskArt src="/illustrations/no-passwords.png" color={t.ink} style={{ width: 116, height: 100 }} />
        <span style={title}>No passwords stored</span>
        <span style={sub}>Keys belong to you</span>
      </div>

      <div style={{ ...card, transform: 'rotate(0.4deg)' }}>
        <MaskArt src="/illustrations/self-hostable.png" color={t.ink} style={{ width: 116, height: 100 }} />
        <span style={title}>Self-hostable</span>
        <span style={sub}>Your hardware, your rules</span>
      </div>

      <div style={{ ...card, transform: 'rotate(-0.3deg)' }}>
        <MaskArt src="/illustrations/open-source-core.png" color={t.ink} style={{ width: 116, height: 100 }} />
        <span style={title}>Open source core</span>
        <span style={sub}>Read every line</span>
      </div>
    </div>
  );
}
