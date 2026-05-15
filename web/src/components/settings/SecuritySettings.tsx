import { useState } from 'react';
import { post } from '../../lib/api';

const T = {
  ink: '#0B1C2C', accent: '#1A6B9A', surface: '#C8D9ED',
  border: '#8AAAC8', bg: '#DDE8F4', danger: '#C0392B',
};

const inputStyle = {
  background: T.bg, border: `1px solid ${T.border}`, color: T.ink,
  padding: '6px 10px', borderRadius: '4px', fontFamily: 'monospace',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' as const,
};

const labelStyle = {
  fontFamily: 'monospace', fontSize: '0.72rem', color: '#4A6B8A',
  textTransform: 'uppercase' as const, letterSpacing: '0.04em',
  display: 'block', marginBottom: '3px',
};

interface SecurityData {
  totpEnabled: boolean;
}

interface Props {
  data: SecurityData;
  onSaved: () => void;
}

type TotpMode = 'idle' | 'setup' | 'disable';

interface SetupState {
  secret: string;
  otpauthUrl: string;
}

export default function SecuritySettings({ data, onSaved }: Props) {
  const [mode, setMode] = useState<TotpMode>('idle');
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function startSetup() {
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await post<{ secret: string; otpauthUrl: string }>('/api/security/totp/start', {});
      setSetup(res);
      setMode('setup');
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start setup');
    } finally {
      setLoading(false);
    }
  }

  async function confirmSetup() {
    setLoading(true); setError(''); setSuccess('');
    try {
      await post('/api/security/totp/confirm', { code });
      setSuccess('TOTP enabled.');
      setMode('idle');
      setSetup(null);
      setCode('');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  async function disableTotp() {
    setLoading(true); setError(''); setSuccess('');
    try {
      await post('/api/security/totp/disable', { password, code });
      setSuccess('TOTP disabled.');
      setMode('idle');
      setCode('');
      setPassword('');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable TOTP');
    } finally {
      setLoading(false);
    }
  }

  function cancel() {
    setMode('idle');
    setSetup(null);
    setCode('');
    setPassword('');
    setError('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* TOTP card */}
      <div style={{
        padding: '14px 16px', background: T.surface, border: `1.5px solid ${T.border}`,
        borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: mode !== 'idle' ? '14px' : 0 }}>
          <div>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.05rem', fontWeight: 'bold', color: T.ink }}>
              Two-Factor Authentication
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: data.totpEnabled ? '#2E7D32' : '#8B6914', marginTop: '2px' }}>
              {data.totpEnabled ? '✓ Enabled — TOTP required on login' : '⚠ Not enabled'}
            </div>
          </div>
          {mode === 'idle' && (
            <button
              type="button"
              onClick={() => data.totpEnabled ? setMode('disable') : startSetup()}
              disabled={loading}
              aria-busy={loading}
              aria-label={data.totpEnabled ? 'Disable two-factor authentication' : 'Enable two-factor authentication'}
              style={{
                fontFamily: 'monospace', fontSize: '0.82rem', padding: '6px 14px',
                background: data.totpEnabled ? 'transparent' : T.accent,
                color: data.totpEnabled ? T.danger : '#fff',
                border: `1.5px solid ${data.totpEnabled ? T.danger : T.accent}`,
                borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? '…' : data.totpEnabled ? 'Disable' : 'Enable'}
            </button>
          )}
        </div>

        {/* Setup flow */}
        {mode === 'setup' && setup && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#4A6B8A', margin: 0, lineHeight: 1.5 }}>
              Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.),
              or enter the secret manually.
            </p>

            {/* QR code via Google Charts API is not used — show secret + otpauth link */}
            <div style={{
              padding: '10px 14px', background: T.bg, border: `1px solid ${T.border}`,
              borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.82rem',
            }}>
              <div style={{ ...labelStyle, marginBottom: '4px' }}>Manual entry secret</div>
              <code aria-label="TOTP manual entry secret" style={{ wordBreak: 'break-all', letterSpacing: '0.1em', color: T.ink }}>
                {setup.secret}
              </code>
            </div>

            <div style={{
              padding: '10px 14px', background: T.bg, border: `1px solid ${T.border}`,
              borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#4A6B8A',
            }}>
              <div style={{ ...labelStyle, marginBottom: '4px' }}>Or open in app:</div>
              <a href={setup.otpauthUrl} aria-label="Open TOTP configuration in authenticator app" style={{ color: T.accent, wordBreak: 'break-all' }}>
                {setup.otpauthUrl}
              </a>
            </div>

            <div style={{ maxWidth: '200px' }}>
              <label htmlFor="totp-setup-code" style={labelStyle}>Enter 6-digit code to confirm</label>
              <input
                id="totp-setup-code"
                style={{ ...inputStyle, width: '100%', letterSpacing: '0.2em', textAlign: 'center' }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                aria-required="true"
                aria-describedby={error ? 'totp-setup-error' : undefined}
                autoFocus
              />
            </div>

            {error && (
              <div id="totp-setup-error" role="alert" aria-live="assertive" style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: T.danger }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={confirmSetup} disabled={code.length !== 6 || loading} aria-busy={loading} style={{
                fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px',
                background: code.length === 6 && !loading ? T.accent : T.border, color: '#fff',
                border: `1.5px solid ${T.accent}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
                cursor: code.length === 6 && !loading ? 'pointer' : 'not-allowed',
              }}>{loading ? 'Verifying…' : 'Activate TOTP'}</button>
              <button type="button" onClick={cancel} style={{
                fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px',
                background: 'transparent', color: '#4A6B8A',
                border: `1.5px solid ${T.border}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
                cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Disable flow */}
        {mode === 'disable' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: T.danger, margin: 0 }}>
              Disabling TOTP removes the second factor from your login. Confirm with your password and current TOTP code.
            </p>

            <div>
              <label htmlFor="totp-disable-password" style={labelStyle}>Passphrase</label>
              <input
                id="totp-disable-password"
                style={{ ...inputStyle, width: '100%', maxWidth: '300px' }}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Your login passphrase"
                aria-required="true"
                aria-describedby={error ? 'totp-disable-error' : undefined}
              />
            </div>

            <div style={{ maxWidth: '200px' }}>
              <label htmlFor="totp-disable-code" style={labelStyle}>Current TOTP code</label>
              <input
                id="totp-disable-code"
                style={{ ...inputStyle, width: '100%', letterSpacing: '0.2em', textAlign: 'center' }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                aria-required="true"
                aria-describedby={error ? 'totp-disable-error' : undefined}
              />
            </div>

            {error && (
              <div id="totp-disable-error" role="alert" aria-live="assertive" style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: T.danger }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={disableTotp} disabled={!password || code.length !== 6 || loading} aria-busy={loading} style={{
                fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px',
                background: password && code.length === 6 && !loading ? T.danger : T.border, color: '#fff',
                border: `1.5px solid ${T.danger}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
                cursor: password && code.length === 6 && !loading ? 'pointer' : 'not-allowed',
              }}>{loading ? 'Disabling…' : 'Disable TOTP'}</button>
              <button type="button" onClick={cancel} style={{
                fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px',
                background: 'transparent', color: '#4A6B8A',
                border: `1.5px solid ${T.border}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
                cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Success and idle-mode error/success live region */}
        <div aria-live="polite" aria-atomic="true">
          {success && mode === 'idle' && (
            <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#2E7D32', marginTop: '8px' }}>{success}</div>
          )}
        </div>
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
