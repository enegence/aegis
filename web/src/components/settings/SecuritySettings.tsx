import { useNavigate } from 'react-router-dom';

const T = {
  ink: '#0B1C2C', accent: '#1A6B9A', surface: '#C8D9ED',
  border: '#8AAAC8', bg: '#DDE8F4',
};

interface SecurityData {
  totpEnabled: boolean;
}

interface Props {
  data: SecurityData;
}

export default function SecuritySettings({ data }: Props) {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* TOTP */}
      <div style={{
        padding: '14px 16px', background: T.surface, border: `1.5px solid ${T.border}`,
        borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.05rem', fontWeight: 'bold', color: T.ink }}>
            Two-Factor Authentication
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: data.totpEnabled ? '#2E7D32' : '#8B6914', marginTop: '2px' }}>
            {data.totpEnabled ? '✓ Enabled — TOTP required on login' : '⚠ Not enabled'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/settings/security/totp')}
          style={{
            fontFamily: 'monospace', fontSize: '0.82rem', padding: '6px 14px',
            background: data.totpEnabled ? 'transparent' : T.accent,
            color: data.totpEnabled ? T.accent : '#fff',
            border: `1.5px solid ${T.accent}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
            cursor: 'pointer',
          }}
        >
          {data.totpEnabled ? 'Manage' : 'Enable'}
        </button>
      </div>

      {/* Sessions */}
      <div style={{
        padding: '14px 16px', background: T.surface, border: `1.5px solid ${T.border}`,
        borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
      }}>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.05rem', fontWeight: 'bold', color: T.ink, marginBottom: '4px' }}>
          Active Session
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#4A6B8A', lineHeight: 1.5 }}>
          Your current session is active. Sessions expire after 30 days of inactivity.
          Logging out will revoke this session immediately.
        </div>
      </div>

      {/* Password change */}
      <div style={{
        padding: '14px 16px', background: T.surface, border: `1.5px solid ${T.border}`,
        borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
        opacity: 0.6,
      }}>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.05rem', fontWeight: 'bold', color: T.ink, marginBottom: '4px' }}>
          Change Passphrase
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#4A6B8A' }}>
          Password change is not yet available in this alpha release. Reinstall with a new passphrase if needed.
        </div>
      </div>
    </div>
  );
}
