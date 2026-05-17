import type { ComponentType, CSSProperties, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme, useTweaks } from '../../lib/theme';
import { AegisLockup } from '../brand';
import { IconRelease } from '../icons';

export interface NavItem {
  key: string;
  label: string;
  to: string;
  Icon: ComponentType<{ size?: number; color?: string; style?: CSSProperties }>;
}

interface AppShellProps {
  children: ReactNode;
  navItems: NavItem[];
  releaseTo: string;
  statusLines?: string[];
  onLogout?: () => void;
}

const DEFAULT_STATUS = ['Status: Armed', 'Mode: Heartbeat', 'Dead drop: Synced ✓'];

export default function AppShell({ children, navItems, releaseTo, statusLines, onLogout }: AppShellProps) {
  const t = useTheme();
  const [tw] = useTweaks();
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarWidth = (tw.sidebarWidth as number) || 220;
  const logoSize = ((tw.logoSize as string) || 'sm') as 'sm' | 'md' | 'lg';
  const path = location.pathname;
  const onRelease = path === releaseTo || path.startsWith(releaseTo + '/');
  const lines = statusLines && statusLines.length ? statusLines : DEFAULT_STATUS;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: t.bg, color: t.ink }}>
      <aside
        style={{
          width: sidebarWidth,
          flexShrink: 0,
          background: t.surface,
          borderRight: `2px solid ${t.border}`,
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 0',
          transition: 'width 0.2s',
        }}
      >
        <div style={{ padding: '0 20px 28px', borderBottom: `1.5px dashed ${t.border}` }}>
          <div onClick={() => navigate(navItems[0]?.to ?? '/')} style={{ cursor: 'pointer' }}>
            <AegisLockup size={logoSize} color={t.ink} />
          </div>
        </div>
        <nav style={{ padding: '16px 12px', flex: 1 }}>
          {navItems.map(item => {
            const active = path === item.to || path.startsWith(item.to + '/');
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.to)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  fontFamily: "'Caveat',cursive",
                  fontSize: 20,
                  fontWeight: active ? 700 : 400,
                  padding: '9px 12px',
                  marginBottom: 4,
                  background: active ? t.ink : 'transparent',
                  color: active ? t.bg : t.ink,
                  border: `2px solid ${active ? t.ink : 'transparent'}`,
                  borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  transform: active ? 'rotate(-0.4deg)' : 'none',
                  transition: 'all 0.1s',
                }}
              >
                <item.Icon size={18} color={active ? t.bg : t.ink} style={{ opacity: active ? 1 : 0.65 }} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: '0 12px 12px' }}>
          <button
            onClick={() => navigate(releaseTo)}
            style={{
              width: '100%',
              fontFamily: "'Caveat',cursive",
              fontSize: 16,
              fontWeight: 700,
              padding: '10px 12px',
              background: onRelease ? t.danger : 'transparent',
              color: onRelease ? '#fff' : t.danger,
              border: `2px solid ${t.danger}`,
              borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
              cursor: 'pointer',
              transition: 'all 0.1s',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <IconRelease size={17} color={onRelease ? '#fff' : t.danger} />
            Release Mode
          </button>
        </div>
        <div style={{ padding: '12px 20px 0', borderTop: `1.5px dashed ${t.border}` }}>
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 9,
              color: t.muted,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              lineHeight: 1.6,
            }}
          >
            {lines.map((l, i) => (
              <span key={i}>
                {l}
                {i < lines.length - 1 && <br />}
              </span>
            ))}
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              style={{
                marginTop: 12,
                fontFamily: "'Caveat',cursive",
                fontSize: 15,
                fontWeight: 700,
                padding: '6px 12px',
                background: 'transparent',
                color: t.muted,
                border: `2px solid ${t.border}`,
                borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Log out
            </button>
          )}
        </div>
      </aside>

      <main style={{ flex: 1, padding: '36px 40px', maxWidth: 900, overflowY: 'auto' }}>{children}</main>
    </div>
  );
}
