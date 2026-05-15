import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';

interface LoginProps {
  onAuth: () => void;
}

const focusRingStyle = {
  outline: '2px solid #1A6B9A',
  outlineOffset: '2px',
};

export default function Login({ onAuth }: LoginProps) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#DDE8F4' }}>
      {/* aria-live region for async status messages */}
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
        {submitting ? 'Logging in…' : ''}
      </div>

      <form onSubmit={handleSubmit} aria-label="Login form" style={{
        width: '100%', maxWidth: 380, padding: 32,
        background: '#C8D9ED', border: '2px solid #8AAAC8',
        borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px',
      }}>
        <h1 style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '2rem', fontWeight: 'bold', color: '#0B1C2C', marginTop: 0, marginBottom: 24 }}>
          Welcome Back
        </h1>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="login-password" style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.82rem', color: '#4A6B8A', marginBottom: 4 }}>
            Passphrase
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            aria-required="true"
            aria-describedby={passwordDescribedBy}
            onFocus={() => setFocusedField('password')}
            onBlur={() => setFocusedField(null)}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px',
              fontFamily: 'monospace', fontSize: '0.88rem',
              background: '#DDE8F4', border: '1.5px solid #8AAAC8', borderRadius: 4, color: '#0B1C2C', outline: 'none',
              ...(focusedField === 'password' ? focusRingStyle : {}),
            }}
          />
        </div>

        {requiresTotp && (
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="login-totp" style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.82rem', color: '#4A6B8A', marginBottom: 4 }}>
              TOTP code (6 digits)
            </label>
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
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                fontFamily: 'monospace', fontSize: '0.88rem', letterSpacing: 4,
                background: '#DDE8F4', border: '1.5px solid #8AAAC8', borderRadius: 4, color: '#0B1C2C', outline: 'none',
                ...(focusedField === 'totp' ? focusRingStyle : {}),
              }}
            />
          </div>
        )}

        {error && (
          <div
            id="login-error"
            role="alert"
            aria-live="assertive"
            style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#C0392B', marginBottom: 10 }}
          >
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
            background: '#0B1C2C', color: '#DDE8F4',
            border: '2px solid #0B1C2C', borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1,
            ...(focusedField === 'submit' ? focusRingStyle : {}),
          }}
        >
          {submitting ? 'Logging in…' : 'Log In →'}
        </button>
      </form>
    </div>
  );
}
