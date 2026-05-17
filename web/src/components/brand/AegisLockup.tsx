import AegisMascot from './AegisMascot';
import { useTheme } from '../../lib/theme';

interface AegisLockupProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

export default function AegisLockup({ size = 'md', color = 'currentColor' }: AegisLockupProps) {
  const t = useTheme();
  const accent = t.accent;
  const heights: Record<string, number> = { sm: 36, md: 56, lg: 80 };
  const h = heights[size] || 56;
  const tagSizes: Record<string, number> = { sm: 10, md: 13, lg: 16 };
  const ts = tagSizes[size] || 13;
  const badgeW = h * 1.85;
  const badgeH = badgeW * (56 / 140);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      {/* AEGIS badge — hand-drawn stamp, tilted askew, sitting above the DMS wordmark */}
      <div style={{ transform: 'rotate(-4deg)', marginBottom: h * 0.06, marginLeft: h * 0.18 }}>
        <svg width={badgeW} height={badgeH} viewBox="0 0 140 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* impact ticks — left */}
          <line x1="13" y1="15" x2="3" y2="11" stroke={color} strokeWidth="2.4" strokeLinecap="round" opacity="0.45" />
          <line x1="12" y1="28" x2="1" y2="28" stroke={color} strokeWidth="2.4" strokeLinecap="round" opacity="0.45" />
          <line x1="13" y1="41" x2="3" y2="45" stroke={color} strokeWidth="2.4" strokeLinecap="round" opacity="0.45" />
          {/* impact ticks — right */}
          <line x1="127" y1="15" x2="137" y2="11" stroke={color} strokeWidth="2.4" strokeLinecap="round" opacity="0.45" />
          <line x1="128" y1="28" x2="139" y2="28" stroke={color} strokeWidth="2.4" strokeLinecap="round" opacity="0.45" />
          <line x1="127" y1="41" x2="137" y2="45" stroke={color} strokeWidth="2.4" strokeLinecap="round" opacity="0.45" />
          {/* wobbly hand-drawn box */}
          <path
            d="M18 11 Q70 7 122 9 Q126 28 124 47 Q70 51 18 48 Q14 28 18 11 Z"
            fill="none"
            stroke={color}
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* AEGIS hand-lettering */}
          <text
            x="71"
            y="37"
            textAnchor="middle"
            fontFamily="'Caveat',cursive"
            fontSize="30"
            fontWeight="700"
            fill={color}
            style={{ letterSpacing: '1px' }}
          >
            AEGIS
          </text>
          {/* blue underline accents */}
          <path d="M40 42 Q55 45 69 42" stroke={accent} strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.75" />
          <path d="M73 43 Q87 40 101 43" stroke={accent} strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.75" />
        </svg>
      </div>

      <AegisMascot height={h} color={color} />
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: ts,
          color,
          opacity: 0.6,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          paddingLeft: 2,
        }}
      >
        Digital Legacy System
      </div>
    </div>
  );
}
