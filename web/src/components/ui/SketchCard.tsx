import type { CSSProperties, ReactNode } from 'react';
import { useTheme, useTweaks } from '../../lib/theme';

interface SketchCardProps {
  children: ReactNode;
  style?: CSSProperties;
  tilt?: number;
}

export default function SketchCard({ children, style = {}, tilt = 0 }: SketchCardProps) {
  const t = useTheme();
  const [tw] = useTweaks();
  const cardStyle = (tw.cardStyle as string) || 'sketchy';
  const density = (tw.density as string) || 'comfortable';
  const tiltAmt = (tw.tiltAmount !== undefined ? (tw.tiltAmount as number) : 1) * tilt;
  const radii: Record<string, string> = {
    sketchy: '3px 10px 3px 10px / 10px 3px 10px 3px',
    sharp: '2px',
    pill: '16px',
  };
  const pad = density === 'compact' ? '12px 14px' : '20px 22px';
  return (
    <div
      style={{
        background: t.surface,
        border: `2px solid ${t.border}`,
        borderRadius: radii[cardStyle] || radii.sketchy,
        padding: pad,
        transform: tiltAmt ? `rotate(${tiltAmt}deg)` : 'none',
        transition: 'box-shadow 0.15s',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
