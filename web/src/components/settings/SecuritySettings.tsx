import { useState } from 'react';
import { post } from '../../lib/api';
import { useTheme } from '../../lib/theme';
import { createActionButtonStyle, createInputStyle, createLabelStyle, toneTextColor } from '../../lib/themeStyles';

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
  const t = useTheme();
  const inputStyle = createInputStyle(t);
  const labelStyle = createLabelStyle(t);
  const [mode, setMode] = useState<TotpMode>('idle');
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function startSetup() {
    setLoading(true);
    setError('');
    setSuccess('');
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
    setLoading(true);
    setError('');
    setSuccess('');
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
    setLoading(true);
    setError('');
    setSuccess('');
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
      <div style={{ padding: '14px 16px', background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: mode !== 'idle' ? '14px' : 0 }}>
          <div>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.05rem', fontWeight: 'bold', color: t.ink }}>
              Two-Factor Authentication
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem', color: data.totpEnabled ? toneTextColor(t, 'success') : toneTextColor(t, 'warning'), marginTop: '2px' }}>
              {data.totpEnabled ? 'Enabled — TOTP required on login' : 'Not enabled'}
            </div>
          </div>
          {mode === 'idle' && (
            <button
              type="button"
              onClick={() => data.totpEnabled ? setMode('disable') : startSetup()}
              disabled={loading}
              aria-busy={loading}
              aria-label={data.totpEnabled ? 'Disable two-factor authentication' : 'Enable two-factor authentication'}
              style={createActionButtonStyle(t, data.totpEnabled ? 'danger' : 'primary', loading)}
            >
              {loading ? '…' : data.totpEnabled ? 'Disable' : 'Enable'}
            </button>
          )}
        </div>

        {mode === 'setup' && setup && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82rem', color: t.muted, margin: 0, lineHeight: 1.5 }}>
              Scan the QR code with your authenticator app, or enter the secret manually.
            </p>

            <div style={{ padding: '10px 14px', background: t.bg, border: `1px solid ${t.border}`, borderRadius: '4px', fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82rem' }}>
              <div style={{ ...labelStyle, marginBottom: '4px' }}>Manual entry secret</div>
              <code aria-label="TOTP manual entry secret" style={{ wordBreak: 'break-all', letterSpacing: '0.1em', color: t.ink }}>
                {setup.secret}
              </code>
            </div>

            <div style={{ padding: '10px 14px', background: t.bg, border: `1px solid ${t.border}`, borderRadius: '4px', fontSize: '0.75rem', fontFamily: "'JetBrains Mono',monospace", color: t.muted }}>
              <div style={{ ...labelStyle, marginBottom: '4px' }}>Or open in app</div>
              <a href={setup.otpauthUrl} aria-label="Open TOTP configuration in authenticator app" style={{ color: t.accent, wordBreak: 'break-all' }}>
                {setup.otpauthUrl}
              </a>
            </div>

            <div style={{ maxWidth: '200px' }}>
              <label htmlFor="totp-setup-code" style={labelStyle}>Enter 6-digit code to confirm</label>
              <input
                id="totp-setup-code"
                style={{ ...inputStyle, letterSpacing: '0.2em', textAlign: 'center' }}
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
              <div id="totp-setup-error" role="alert" aria-live="assertive" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: t.danger }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={confirmSetup} disabled={code.length !== 6 || loading} aria-busy={loading} style={createActionButtonStyle(t, 'primary', code.length !== 6 || loading)}>
                {loading ? 'Verifying…' : 'Activate TOTP'}
              </button>
              <button type="button" onClick={cancel} style={createActionButtonStyle(t, 'secondary', false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {mode === 'disable' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82rem', color: t.danger, margin: 0 }}>
              Disabling TOTP removes the second factor from your login. Confirm with your password and current TOTP code.
            </p>

            <div>
              <label htmlFor="totp-disable-password" style={labelStyle}>Passphrase</label>
              <input
                id="totp-disable-password"
                style={{ ...inputStyle, maxWidth: '300px' }}
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
                style={{ ...inputStyle, letterSpacing: '0.2em', textAlign: 'center' }}
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
              <div id="totp-disable-error" role="alert" aria-live="assertive" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: t.danger }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={disableTotp} disabled={!password || code.length !== 6 || loading} aria-busy={loading} style={createActionButtonStyle(t, 'danger', !password || code.length !== 6 || loading)}>
                {loading ? 'Disabling…' : 'Disable TOTP'}
              </button>
              <button type="button" onClick={cancel} style={createActionButtonStyle(t, 'secondary', false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div aria-live="polite" aria-atomic="true">
          {success && mode === 'idle' && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: toneTextColor(t, 'success'), marginTop: '8px' }}>{success}</div>
          )}
        </div>
      </div>

      <div style={{ padding: '14px 16px', background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px' }}>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.05rem', fontWeight: 'bold', color: t.ink, marginBottom: '4px' }}>
          Active Session
        </div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem', color: t.muted, lineHeight: 1.5 }}>
          Your current session is active. Sessions expire after 30 days of inactivity.
          Logging out will revoke this session immediately.
        </div>
      </div>

      <div style={{ padding: '14px 16px', background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px', opacity: 0.72 }}>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.05rem', fontWeight: 'bold', color: t.ink, marginBottom: '4px' }}>
          Change Passphrase
        </div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem', color: t.muted }}>
          Password change is not yet available in this alpha release. Reinstall with a new passphrase if needed.
        </div>
      </div>
    </div>
  );
}
