import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';

interface LoginProps {
  onAuth: () => void;
}

export default function Login({ onAuth }: LoginProps) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
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
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#DDE8F4' }}>
      <form onSubmit={handleSubmit} style={{
        width: '100%', maxWidth: 380, padding: 32,
        background: '#C8D9ED', border: '2px solid #8AAAC8',
        borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px',
      }}>
        <h1 style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '2rem', fontWeight: 'bold', color: '#0B1C2C', marginTop: 0, marginBottom: 24 }}>
          Welcome Back
        </h1>

        <input
          type="password"
          placeholder="Passphrase"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 12px', marginBottom: 12,
            fontFamily: 'monospace', fontSize: '0.88rem',
            background: '#DDE8F4', border: '1.5px solid #8AAAC8', borderRadius: 4, color: '#0B1C2C', outline: 'none',
          }}
        />

        {requiresTotp && (
          <input
            type="text"
            placeholder="6-digit TOTP code"
            value={totpCode}
            onChange={e => setTotpCode(e.target.value)}
            maxLength={6}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px', marginBottom: 12,
              fontFamily: 'monospace', fontSize: '0.88rem', letterSpacing: 4,
              background: '#DDE8F4', border: '1.5px solid #8AAAC8', borderRadius: 4, color: '#0B1C2C', outline: 'none',
            }}
          />
        )}

        {error && <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#C0392B', marginBottom: 10 }}>{error}</div>}

        <button type="submit" style={{
          width: '100%', padding: '12px 0',
          fontFamily: "'Caveat', cursive, sans-serif", fontSize: '1.2rem', fontWeight: 'bold',
          background: '#0B1C2C', color: '#DDE8F4',
          border: '2px solid #0B1C2C', borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
          cursor: 'pointer',
        }}>
          Log In →
        </button>
      </form>
    </div>
  );
}
