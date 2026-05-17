import AegisMascot from './AegisMascot';

interface AegisLockupProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

export default function AegisLockup({ size = 'md', color = 'currentColor' }: AegisLockupProps) {
  const heights: Record<string, number> = { sm: 36, md: 56, lg: 80 };
  const h = heights[size] || 56;
  const tagSizes: Record<string, number> = { sm: 10, md: 13, lg: 16 };
  const ts = tagSizes[size] || 13;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
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
