import type { ReactNode } from 'react';
import { useTheme } from '../../lib/theme';

interface StatPillProps {
  label: ReactNode;
  value: ReactNode;
  accent?: string;
}

export default function StatPill({ label, value, accent }: StatPillProps) {
  const t = useTheme();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: t.surface,
        border: `2px solid ${t.border}`,
        borderRadius: '4px 10px 4px 10px / 10px 4px 10px 4px',
        padding: '10px 18px',
        minWidth: 90,
        transform: 'rotate(-0.3deg)',
      }}
    >
      <span style={{ fontFamily: "'Caveat',cursive", fontSize: 28, fontWeight: 700, color: accent || t.ink, lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: t.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>
        {label}
      </span>
    </div>
  );
}
