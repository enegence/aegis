import { useState, type CSSProperties, type ReactNode } from 'react';
import { useTheme, useTweaks } from '../../lib/theme';

interface InkButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  style?: CSSProperties;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  ariaBusy?: boolean;
  ariaLabel?: string;
}

export default function InkButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  style = {},
  type = 'button',
  disabled = false,
  ariaBusy,
  ariaLabel,
}: InkButtonProps) {
  const t = useTheme();
  const [tw] = useTweaks();
  const [hov, setHov] = useState(false);
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const isGhost = variant === 'ghost';
  const density = (tw.density as string) || 'comfortable';
  const btnShape = (tw.buttonShape as string) || 'sketchy';
  const sizes: Record<string, { padding: string; fontSize: number }> = {
    sm: { padding: density === 'compact' ? '4px 10px' : '6px 14px', fontSize: 14 },
    md: { padding: density === 'compact' ? '7px 16px' : '10px 22px', fontSize: 17 },
    lg: { padding: density === 'compact' ? '10px 24px' : '16px 36px', fontSize: 22 },
  };
  const radii: Record<string, string> = { sketchy: '3px 8px 3px 8px / 8px 3px 8px 3px', pill: '999px', sharp: '2px' };
  const sz = sizes[size] || sizes.md;
  return (
    <button
      type={type}
      disabled={disabled}
      aria-busy={ariaBusy}
      aria-label={ariaLabel}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: "'Caveat',cursive",
        fontWeight: 700,
        lineHeight: 1.4,
        fontSize: sz.fontSize,
        padding: sz.padding,
        background: isDanger ? t.danger : isPrimary ? t.ink : isGhost ? 'transparent' : t.surface,
        color: isPrimary || isDanger ? t.bg : t.ink,
        border: `2px solid ${isDanger ? t.danger : t.ink}`,
        borderRadius: radii[btnShape] || radii.sketchy,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transform: hov && !disabled ? 'translateY(-1px)' : 'none',
        transition: 'all 0.1s',
        letterSpacing: '0.02em',
        boxShadow: hov && !disabled
          ? `4px 4px 0 ${isDanger ? t.danger : t.accent}`
          : `3px 3px 0 ${isDanger ? t.danger + '88' : t.accent + '66'}`,
        outline: 'none',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
