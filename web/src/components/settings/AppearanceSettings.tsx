// Settings → Appearance: end-user theme toggle (Blueprint / Midnight).
// Persisted ungated via useUserTheme → localStorage 'aegis:theme'. Applies live.
// The Settings page wrapper renders the "Appearance" heading, so none here.
import { THEMES, USER_THEMES, useTheme, useUserTheme, type UserTheme } from '../../lib/theme';

const LABELS: Record<UserTheme, string> = { blueprint: 'Blueprint', midnight: 'Midnight' };

export default function AppearanceSettings() {
  const t = useTheme();
  const [current, setUserTheme] = useUserTheme();

  return (
    <div>
      <p style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: t.muted, margin: '0 0 16px' }}>
        Choose the theme used across the app on this browser.
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {USER_THEMES.map(name => {
          const p = THEMES[name];
          const active = current === name;
          return (
            <button
              key={name}
              type="button"
              aria-pressed={active}
              onClick={() => setUserTheme(name)}
              style={{
                cursor: 'pointer', padding: 12, textAlign: 'left', width: 180,
                background: active ? t.bg : 'transparent',
                border: `2px solid ${active ? t.accent : t.border}`,
                borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
                transition: 'all 0.1s',
              }}
            >
              <div
                aria-hidden
                style={{
                  height: 56, borderRadius: 4, marginBottom: 10,
                  background: p.bg, border: `1px solid ${p.border}`,
                  display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px',
                }}
              >
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: p.accent }} />
                <span style={{ flex: 1, height: 8, borderRadius: 4, background: p.ink, opacity: 0.85 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '1.15rem', fontWeight: 'bold', color: t.ink }}>
                  {LABELS[name]}
                </span>
                {active && (
                  <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: t.accent }}>ACTIVE</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
