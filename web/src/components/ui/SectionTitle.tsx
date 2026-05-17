import type { ReactNode } from 'react';
import { useTheme, useTweaks } from '../../lib/theme';

interface SectionTitleProps {
  children: ReactNode;
  sub?: ReactNode;
}

export default function SectionTitle({ children, sub }: SectionTitleProps) {
  const t = useTheme();
  const [tw] = useTweaks();
  const scale = (tw.headingScale as number) || 1;
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontFamily: "'Caveat',cursive", fontSize: 34 * scale, fontWeight: 700, color: t.ink, margin: 0, lineHeight: 1 }}>
        {children}
      </h2>
      {sub && (
        <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.muted, margin: '4px 0 0', letterSpacing: '0.06em' }}>
          {sub}
        </p>
      )}
    </div>
  );
}
