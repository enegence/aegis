import type { CSSProperties, ReactNode } from 'react';

interface IconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

interface DrawIconProps extends IconProps {
  children: ReactNode;
  viewBox?: string;
}

export function DrawIcon({ children, size = 20, color, style = {}, viewBox = '0 0 24 24' }: DrawIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      stroke={color || 'currentColor'}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function IconHeartbeat({ size = 20, color, style }: IconProps) {
  return (
    <DrawIcon size={size} color={color} style={style}>
      <path d="M1 12 Q3 12 5 12 Q6.5 12 7.5 7 Q9 2 10.5 7 Q12 12 13 15 Q14 18 15.5 14 Q17 9 18.5 12 L23 12" strokeWidth="2.1" />
    </DrawIcon>
  );
}

export function IconPlane({ size = 20, color, style }: IconProps) {
  return (
    <DrawIcon size={size} color={color} style={style}>
      <path d="M21.5 3.5 L3 10.5 L10 13.5 L13 21.5 L16.5 12.5 Z" />
      <line x1="10" y1="13.5" x2="16.5" y2="12.5" strokeWidth="1.5" />
    </DrawIcon>
  );
}

export function IconDashboard({ size = 20, color, style }: IconProps) {
  const c = color || 'currentColor';
  return (
    <DrawIcon size={size} color={color} style={style}>
      <path d="M4 19 Q4 13 12 13 Q20 13 20 19" strokeWidth="1.5" />
      <path d="M7.5 19 Q7.5 16 12 16 Q16.5 16 16.5 19" strokeWidth="1.4" />
      <line x1="12" y1="13" x2="12" y2="5" strokeWidth="2" />
      <path d="M8.5 8 Q12 3.5 15.5 8" strokeWidth="1.5" />
      <circle cx="12" cy="19" r="1.3" fill={c} stroke="none" />
    </DrawIcon>
  );
}

export function IconLegacy({ size = 20, color, style }: IconProps) {
  return (
    <DrawIcon size={size} color={color} style={style}>
      <path d="M7 3.5 Q6 3.5 5 4.5 Q4 5.5 5.5 6.5 Q4 7.5 5.5 8.5 L5.5 19 Q5.5 21 8 21 L18 21 Q19.5 21 19.5 19 L19.5 4 Q19.5 3.5 18.5 3.5 Z" />
      <path d="M5.5 6.5 Q7 7 8.5 6.5 Q9.5 5.5 9.5 3.5" strokeWidth="1.5" />
      <line x1="9" y1="11" x2="16.5" y2="11" strokeWidth="1.5" />
      <line x1="9" y1="14" x2="16.5" y2="14" strokeWidth="1.5" />
      <line x1="9" y1="17" x2="13.5" y2="17" strokeWidth="1.5" />
    </DrawIcon>
  );
}

export function IconContacts({ size = 20, color, style }: IconProps) {
  return (
    <DrawIcon size={size} color={color} style={style}>
      <circle cx="8.5" cy="7" r="3.2" />
      <path d="M2 20 Q2 14 8.5 14 Q10 14 11 14.5" />
      <circle cx="16.5" cy="8" r="2.7" />
      <path d="M12 20 Q12 14.5 16.5 14.5 Q21 14.5 22 19" />
    </DrawIcon>
  );
}

export function IconTrigger({ size = 20, color, style }: IconProps) {
  const c = color || 'currentColor';
  return (
    <DrawIcon size={size} color={color} style={style}>
      <rect x="7" y="2" width="10" height="10" rx="3" />
      <line x1="12" y1="12" x2="12" y2="22" />
      <line x1="8.5" y1="15" x2="15.5" y2="15" strokeWidth="1.4" strokeDasharray="2 1.5" />
      <circle cx="12" cy="7" r="2" fill={c} stroke="none" />
    </DrawIcon>
  );
}

export function IconDeployment({ size = 20, color, style }: IconProps) {
  const c = color || 'currentColor';
  return (
    <DrawIcon size={size} color={color} style={style}>
      <rect x="2.5" y="3" width="19" height="5" rx="1.5" />
      <rect x="2.5" y="10" width="19" height="5" rx="1.5" />
      <rect x="2.5" y="17" width="19" height="4.5" rx="1.5" />
      <circle cx="6" cy="5.5" r="1.1" fill={c} stroke="none" />
      <circle cx="6" cy="12.5" r="1.1" fill={c} stroke="none" />
      <line x1="9.5" y1="5.5" x2="16" y2="5.5" strokeWidth="1.3" />
      <line x1="9.5" y1="12.5" x2="16" y2="12.5" strokeWidth="1.3" />
    </DrawIcon>
  );
}

export function IconRelease({ size = 20, color, style }: IconProps) {
  const c = color || 'currentColor';
  return (
    <DrawIcon size={size} color={color} style={style}>
      <path d="M2 20 Q1 21.5 3 21.5 L21 21.5 Q23 21.5 22 20 L13 4 Q12 2 11 4 Z" strokeWidth="2" />
      <line x1="12" y1="9.5" x2="12" y2="15.5" strokeWidth="2.3" />
      <circle cx="12" cy="18" r="1.1" fill={c} stroke="none" />
    </DrawIcon>
  );
}

export function IconNoPassword({ size = 20, color, style }: IconProps) {
  return (
    <DrawIcon size={size} color={color} style={style}>
      <rect x="3.5" y="10.5" width="17" height="11" rx="2.5" />
      <path d="M7.5 10.5 L7.5 7 Q7.5 3 12 3 Q16.5 3 16.5 7" strokeWidth="1.7" strokeDasharray="2.5 2" />
      <circle cx="12" cy="16" r="2.2" />
      <line x1="12" y1="18.2" x2="12" y2="20.5" strokeWidth="1.9" />
    </DrawIcon>
  );
}

export function IconSelfHost({ size = 20, color, style }: IconProps) {
  return (
    <DrawIcon size={size} color={color} style={style}>
      <path d="M2 11.5 L12 3 L22 11.5" />
      <path d="M4.5 10 L4.5 21 L19.5 21 L19.5 10" />
      <rect x="9" y="14.5" width="6" height="6.5" rx="1" />
      <path d="M16 11 Q19 8 19 5" strokeWidth="1.3" />
      <path d="M17.5 12.5 Q22 9 22 4.5" strokeWidth="1.1" opacity="0.7" />
    </DrawIcon>
  );
}

export function IconOpenSource({ size = 20, color, style }: IconProps) {
  return (
    <DrawIcon size={size} color={color} style={style}>
      <circle cx="6" cy="4.5" r="2.3" />
      <circle cx="18" cy="9" r="2.3" />
      <circle cx="6" cy="19.5" r="2.3" />
      <line x1="6" y1="6.8" x2="6" y2="17.2" />
      <path d="M6 8 Q8 8 10 7 Q14 5 15.7 7" />
    </DrawIcon>
  );
}

export function IconShield({ size = 20, color, style }: IconProps) {
  return (
    <DrawIcon size={size} color={color} style={style}>
      <path d="M12 2 Q18.5 4.5 20.5 8.5 Q20.5 16.5 12 21.5 Q3.5 16.5 3.5 8.5 Q5.5 4.5 12 2 Z" />
    </DrawIcon>
  );
}

export function IconCheck({ size = 20, color, style }: IconProps) {
  return (
    <DrawIcon size={size} color={color} style={style}>
      <path d="M4 12.5 Q7 15 10 19 Q15.5 11 20.5 5.5" strokeWidth="2.5" />
    </DrawIcon>
  );
}

export function IconCloud({ size = 20, color, style }: IconProps) {
  return (
    <DrawIcon size={size} color={color} style={style}>
      <path d="M6 19 Q3 19 3 15.5 Q3 12 6.5 11.5 Q6.5 6 12 6 Q17 6 17.5 11 Q21 11.5 21 15.5 Q21 19 18 19" />
      <path d="M12 22 L12 13" />
      <path d="M9 15.5 L12 12.5 L15 15.5" />
    </DrawIcon>
  );
}

export function IconEye({ size = 20, color, style }: IconProps) {
  const c = color || 'currentColor';
  return (
    <DrawIcon size={size} color={color} style={style}>
      <path d="M1 12 Q5 5.5 12 5.5 Q19 5.5 23 12 Q19 18.5 12 18.5 Q5 18.5 1 12 Z" />
      <circle cx="12" cy="12" r="3.3" />
      <circle cx="12" cy="12" r="1.2" fill={c} stroke="none" />
    </DrawIcon>
  );
}

export function IconSkull({ size = 20, color, style }: IconProps) {
  return (
    <DrawIcon size={size} color={color} style={style}>
      <path d="M12 2.5 Q18.5 2.5 19.5 9.5 Q20 14 17 16 L17 20 L7 20 L7 16 Q4 14 4.5 9.5 Q5.5 2.5 12 2.5 Z" />
      <line x1="7" y1="17.5" x2="17" y2="17.5" strokeWidth="1.4" />
      <line x1="10" y1="20" x2="10" y2="17.5" strokeWidth="1.4" />
      <line x1="14" y1="20" x2="14" y2="17.5" strokeWidth="1.4" />
      <path d="M9 11 L11 13 M11 11 L9 13" strokeWidth="1.6" />
      <path d="M13 11 L15 13 M15 11 L13 13" strokeWidth="1.6" />
      <path d="M10 16 Q12 14.5 14 16" strokeWidth="1.4" />
    </DrawIcon>
  );
}

export function IconSettings({ size = 20, color, style }: IconProps) {
  return (
    <DrawIcon size={size} color={color} style={style}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12 M5.6 5.6 L7.8 7.8 M16.2 16.2 L18.4 18.4 M18.4 5.6 L16.2 7.8 M7.8 16.2 L5.6 18.4" strokeWidth="1.5" />
    </DrawIcon>
  );
}
