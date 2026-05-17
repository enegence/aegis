import { useTheme } from '../../lib/theme';

// The three illustrated stick-figure trust badges from the original landing
// hero. Applies to OSS (self-hosted, open source, no passwords stored).
export default function TrustBadges() {
  const t = useTheme();
  const svg = { width: 80, height: 68, viewBox: '0 0 80 68', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' };
  const card: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    background: t.surface, border: `2px solid ${t.border}`,
    borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px',
    padding: '18px 22px', minWidth: 150, maxWidth: 180,
  };
  const title: React.CSSProperties = { fontFamily: "'Caveat',cursive", fontSize: 16, fontWeight: 700, color: t.ink, textAlign: 'center', lineHeight: 1.2 };
  const sub: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: t.muted, letterSpacing: '0.06em', textAlign: 'center', textTransform: 'uppercase' };

  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
      <div style={{ ...card, transform: 'rotate(-0.6deg)' }}>
        <svg {...svg}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
            const r = deg * Math.PI / 180;
            return <line key={i} x1={40 + Math.cos(r) * 10} y1={10 + Math.sin(r) * 10} x2={40 + Math.cos(r) * 17} y2={10 + Math.sin(r) * 17} stroke={t.accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />;
          })}
          <circle cx="40" cy="10" r="6" stroke={t.accent} strokeWidth="2" fill="none" />
          <circle cx="40" cy="10" r="2.5" stroke={t.accent} strokeWidth="1.5" fill="none" opacity="0.6" />
          <line x1="40" y1="16" x2="40" y2="34" stroke={t.accent} strokeWidth="2.2" strokeLinecap="round" />
          <line x1="40" y1="24" x2="44" y2="24" stroke={t.accent} strokeWidth="1.8" strokeLinecap="round" />
          <line x1="40" y1="29" x2="43" y2="29" stroke={t.accent} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="40" cy="44" r="7" stroke={t.ink} strokeWidth="2" fill="none" />
          <line x1="40" y1="51" x2="40" y2="62" stroke={t.ink} strokeWidth="2" strokeLinecap="round" />
          <path d="M40 55 Q42 48 40 37" stroke={t.ink} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M40 55 Q30 52 24 56" stroke={t.ink} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <line x1="40" y1="62" x2="34" y2="68" stroke={t.ink} strokeWidth="2" strokeLinecap="round" />
          <line x1="40" y1="62" x2="46" y2="68" stroke={t.ink} strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span style={title}>No passwords stored</span>
        <span style={sub}>Keys belong to you</span>
      </div>

      <div style={{ ...card, transform: 'rotate(0.4deg)' }}>
        <svg {...svg}>
          <defs><filter id="tb_b2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" /></filter></defs>
          <ellipse cx="40" cy="56" rx="28" ry="10" fill={t.accent} opacity="0.12" filter="url(#tb_b2)" />
          <rect x="12" y="38" width="56" height="14" rx="2" stroke={t.ink} strokeWidth="2" fill="none" />
          <rect x="12" y="52" width="56" height="10" rx="2" stroke={t.ink} strokeWidth="1.5" fill="none" />
          <circle cx="18" cy="45" r="2.5" fill={t.accent} opacity="0.8" />
          <circle cx="18" cy="57" r="2.5" fill={t.accent} opacity="0.5" />
          <line x1="25" y1="45" x2="46" y2="45" stroke={t.ink} strokeWidth="1.4" opacity="0.4" />
          <line x1="25" y1="57" x2="46" y2="57" stroke={t.ink} strokeWidth="1.4" opacity="0.4" />
          <circle cx="40" cy="11" r="7" stroke={t.ink} strokeWidth="2" fill="none" />
          <line x1="40" y1="18" x2="40" y2="34" stroke={t.ink} strokeWidth="2" strokeLinecap="round" />
          <path d="M40 24 Q30 20 26 24" stroke={t.ink} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M40 24 Q50 20 54 24" stroke={t.ink} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <line x1="40" y1="34" x2="34" y2="38" stroke={t.ink} strokeWidth="2" strokeLinecap="round" />
          <line x1="40" y1="34" x2="46" y2="38" stroke={t.ink} strokeWidth="2" strokeLinecap="round" />
          <line x1="54" y1="36" x2="54" y2="24" stroke={t.ink} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M54 24 L62 27 L54 30 Z" stroke={t.ink} strokeWidth="1.3" fill={t.accent} opacity="0.7" />
        </svg>
        <span style={title}>Self-hostable</span>
        <span style={sub}>Your hardware, your rules</span>
      </div>

      <div style={{ ...card, transform: 'rotate(-0.3deg)' }}>
        <svg {...svg}>
          <rect x="18" y="38" width="48" height="26" rx="2" stroke={t.ink} strokeWidth="2" fill="none" />
          <path d="M18 38 L14 22 L66 18 L66 38" stroke={t.ink} strokeWidth="2" fill="none" strokeLinejoin="round" />
          <line x1="14" y1="22" x2="66" y2="18" stroke={t.ink} strokeWidth="2" strokeLinecap="round" />
          <line x1="30" y1="36" x2="22" y2="24" stroke={t.accent} strokeWidth="1.3" opacity="0.55" strokeLinecap="round" />
          <line x1="42" y1="35" x2="40" y2="20" stroke={t.accent} strokeWidth="1.3" opacity="0.65" strokeLinecap="round" />
          <line x1="54" y1="36" x2="60" y2="24" stroke={t.accent} strokeWidth="1.3" opacity="0.55" strokeLinecap="round" />
          <text x="24" y="52" fontFamily="monospace" fontSize="7" fill={t.accent} opacity="0.75">{'{ }'}</text>
          <text x="42" y="58" fontFamily="monospace" fontSize="6" fill={t.ink} opacity="0.4">{'<>'}</text>
          <circle cx="42" cy="10" r="7" stroke={t.ink} strokeWidth="2" fill="none" />
          <path d="M42 17 Q42 24 38 30" stroke={t.ink} strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M42 22 Q50 22 56 26" stroke={t.ink} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M42 22 Q34 22 28 26" stroke={t.ink} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <line x1="38" y1="30" x2="33" y2="40" stroke={t.ink} strokeWidth="2" strokeLinecap="round" />
          <line x1="38" y1="30" x2="42" y2="40" stroke={t.ink} strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span style={title}>Open source core</span>
        <span style={sub}>Read every line</span>
      </div>
    </div>
  );
}
