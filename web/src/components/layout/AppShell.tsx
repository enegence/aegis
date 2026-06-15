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

export default function AppShell({ children, navItems, releaseTo, statusLines, onLogout }: AppShellProps) {
  const t = useTheme();
  const [tw] = useTweaks();
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarWidth = (tw.sidebarWidth as number) || 220;
  const logoSize = ((tw.logoSize as string) || 'sm') as 'sm' | 'md' | 'lg';
  const path = location.pathname;
  const onRelease = path === releaseTo || path.startsWith(releaseTo + '/');
  const lines = statusLines ?? [];
  const shellStyle = {
    '--app-sidebar-width': `${sidebarWidth}px`,
    background: t.bg,
    color: t.ink,
  } as CSSProperties;

  return (
    <div className="app-shell" style={shellStyle}>
      <aside
        className="app-shell__sidebar"
        style={{
          background: t.surface,
          borderColor: t.border,
        }}
      >
        <div className="app-shell__brand" style={{ borderBottom: `1.5px dashed ${t.border}` }}>
          <div onClick={() => navigate(navItems[0]?.to ?? '/')} style={{ cursor: 'pointer' }}>
            <AegisLockup size={logoSize} color={t.ink} />
          </div>
        </div>
        <nav className="app-shell__nav">
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
                  fontSize: 21,
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
        <div className="app-shell__release">
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
        <div className="app-shell__footer" style={{ borderTop: `1.5px dashed ${t.border}` }}>
          {lines.length > 0 && (
            <div
              className="app-shell__status"
              style={{
                color: t.muted,
              }}
            >
              {lines.map((l, i) => (
                <span key={i}>
                  {l}
                  {i < lines.length - 1 && <br />}
                </span>
              ))}
            </div>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              style={{
                marginTop: 12,
                fontFamily: "'Inter',system-ui,sans-serif",
                fontSize: 12,
                fontWeight: 600,
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

      <main className="app-shell__main">{children}</main>
    </div>
  );
}
