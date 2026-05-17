import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useTheme } from '../lib/theme';
import { SketchCard } from '../components/ui';
import { AegisLockup } from '../components/brand';

interface LoginProps {
  onAuth: () => void;
}

export default function Login({ onAuth }: LoginProps) {
  const navigate = useNavigate();
  const t = useTheme();
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const focusRingStyle = { outline: `2px solid ${t.accent}`, outlineOffset: '2px' };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password, ...(requiresTotp ? { totpCode } : {}) }),
        headers: { 'Content-Type': 'application/json' },
      });
      onAuth();
      navigate('/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      if (msg.toLowerCase().includes('totp') || msg.toLowerCase().includes('2fa')) {
        setRequiresTotp(true);
        setError('TOTP code required');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const passwordDescribedBy = error && !requiresTotp ? 'login-error' : undefined;
  const totpDescribedBy = error && requiresTotp ? 'login-error' : undefined;

  const inputStyle: CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px',
    fontFamily: "'JetBrains Mono',monospace", fontSize: '0.88rem',
    background: t.bg, border: `1.5px solid ${t.border}`, borderRadius: 4, color: t.ink, outline: 'none',
  };
  const labelStyle: CSSProperties = {
    display: 'block', fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem', color: t.muted, marginBottom: 4,
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: t.bg, position: 'relative' }}>
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
        {submitting ? 'Logging in…' : ''}
      </div>

      <svg style={{ position: 'absolute', top: 24, left: 24, opacity: 0.15 }} width="80" height="80" viewBox="0 0 80 80" fill="none">
        <path d="M4 76 L4 4 L76 4" stroke={t.ink} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <circle cx="4" cy="4" r="4" fill={t.ink} />
      </svg>
      <svg style={{ position: 'absolute', bottom: 24, right: 24, opacity: 0.15, transform: 'rotate(180deg)' }} width="80" height="80" viewBox="0 0 80 80" fill="none">
        <path d="M4 76 L4 4 L76 4" stroke={t.ink} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <circle cx="4" cy="4" r="4" fill={t.ink} />
      </svg>

      <form onSubmit={handleSubmit} aria-label="Login form" style={{ width: '100%', maxWidth: 400 }}>
        <SketchCard style={{ padding: '32px 30px' }}>
          <div style={{ marginBottom: 18 }}>
            <AegisLockup size="sm" color={t.ink} />
          </div>
          <h1 style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '2rem', fontWeight: 'bold', color: t.ink, marginTop: 0, marginBottom: 20 }}>
            Welcome Back
          </h1>

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="login-password" style={labelStyle}>Passphrase</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              aria-required="true"
              aria-describedby={passwordDescribedBy}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              style={{ ...inputStyle, ...(focusedField === 'password' ? focusRingStyle : {}) }}
            />
          </div>

          {requiresTotp && (
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="login-totp" style={labelStyle}>TOTP code (6 digits)</label>
              <input
                id="login-totp"
                type="text"
                inputMode="numeric"
                value={totpCode}
                onChange={e => setTotpCode(e.target.value)}
                maxLength={6}
                aria-required="true"
                aria-describedby={totpDescribedBy}
                autoFocus
                onFocus={() => setFocusedField('totp')}
                onBlur={() => setFocusedField(null)}
                style={{ ...inputStyle, letterSpacing: 4, ...(focusedField === 'totp' ? focusRingStyle : {}) }}
              />
            </div>
          )}

          {error && (
            <div id="login-error" role="alert" aria-live="assertive" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82rem', color: t.danger, marginBottom: 10 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            aria-busy={submitting}
            disabled={submitting}
            onFocus={() => setFocusedField('submit')}
            onBlur={() => setFocusedField(null)}
            style={{
              width: '100%', padding: '12px 0',
              fontFamily: "'Caveat', cursive, sans-serif", fontSize: '1.2rem', fontWeight: 'bold',
              background: t.ink, color: t.bg,
              border: `2px solid ${t.ink}`, borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              ...(focusedField === 'submit' ? focusRingStyle : {}),
            }}
          >
            {submitting ? 'Logging in…' : 'Log In →'}
          </button>
        </SketchCard>
      </form>
    </div>
  );
}
