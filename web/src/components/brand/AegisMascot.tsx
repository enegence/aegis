interface AegisMascotProps {
  height?: number;
  color?: string;
}

// Aegis DMS — Stick Figure Mascot + Wordmark
// The "D" in DMS is a dead stick figure head with X eyes
export default function AegisMascot({ height = 80, color = 'currentColor' }: AegisMascotProps) {
  return (
    <svg width={height * 2.4} height={height} viewBox="0 0 192 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* ── D-HEAD ── slightly wobbly D shape = face */}
      <path
        d="M 8 5 L 7 55 C 10 58 16 59 22 58 C 38 55 48 44 47 30 C 46 15 35 5 21 5 Z"
        fill="none"
        stroke={color}
        strokeWidth="2.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Left X eye */}
      <line x1="13" y1="19" x2="21" y2="27" stroke={color} strokeWidth="2.3" strokeLinecap="round" />
      <line x1="21" y1="19" x2="13" y2="27" stroke={color} strokeWidth="2.3" strokeLinecap="round" />
      {/* Right X eye */}
      <line x1="26" y1="19" x2="34" y2="27" stroke={color} strokeWidth="2.3" strokeLinecap="round" />
      <line x1="34" y1="19" x2="26" y2="27" stroke={color} strokeWidth="2.3" strokeLinecap="round" />
      {/* Flat dead mouth */}
      <line x1="16" y1="38" x2="34" y2="37" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* ── STICK FIGURE BODY ── */}
      {/* Torso */}
      <line x1="20" y1="58" x2="19" y2="68" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
      {/* Left arm — sprawling up-left */}
      <line x1="19" y1="62" x2="3" y2="53" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Right arm — sprawling right */}
      <line x1="19" y1="62" x2="37" y2="51" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Left leg */}
      <line x1="19" y1="68" x2="8" y2="78" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Right leg */}
      <line x1="19" y1="68" x2="30" y2="78" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* ── M — hand-drawn strokes matching D style ── */}
      <path
        d="M56,57 Q54,32 55,8 Q68,26 81,43 Q94,24 106,8 Q107,32 107,57"
        fill="none"
        stroke={color}
        strokeWidth="2.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* ── S — hand-drawn double-bowl curve ── */}
      <path
        d="M165,16 Q170,5 145,5 Q120,5 121,24 Q122,35 145,37 Q170,39 168,53 Q166,63 142,63 Q118,63 116,52"
        fill="none"
        stroke={color}
        strokeWidth="2.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
