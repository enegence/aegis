import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';

interface LoginProps {
  onAuth: () => void;
  mode: 'setup' | 'login';
}

export default function Login({ onAuth, mode }: LoginProps) {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'setup') {
        await apiFetch('/api/auth/setup', { method: 'POST', body: JSON.stringify({ displayName, email, password, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
      } else {
        await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
      }
      onAuth();
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#DDE8F4' }}>
      <form onSubmit={handleSubmit} className="w-full max-w-md p-8" style={{
        background: '#C8D9ED', border: '2px solid #8AAAC8',
        borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px',
      }}>
        <h1 className="font-hand text-4xl font-bold mb-6" style={{ color: '#0B1C2C' }}>
          {mode === 'setup' ? 'Set Up Aegis' : 'Welcome Back'}
        </h1>

        {mode === 'setup' && (
          <>
            <input type="text" placeholder="Your name" value={displayName} onChange={e => setDisplayName(e.target.value)}
              className="w-full font-mono text-sm p-3 mb-3 rounded border outline-none" style={{ background: '#DDE8F4', borderColor: '#8AAAC8', color: '#0B1C2C' }} />
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full font-mono text-sm p-3 mb-3 rounded border outline-none" style={{ background: '#DDE8F4', borderColor: '#8AAAC8', color: '#0B1C2C' }} />
          </>
        )}

        <input type="password" placeholder="Passphrase" value={password} onChange={e => setPassword(e.target.value)}
          className="w-full font-mono text-sm p-3 mb-4 rounded border outline-none" style={{ background: '#DDE8F4', borderColor: '#8AAAC8', color: '#0B1C2C' }} />

        {error && <div className="font-mono text-sm mb-3" style={{ color: '#C0392B' }}>{error}</div>}

        <button type="submit" className="w-full font-hand text-xl font-bold p-3 cursor-pointer transition-all" style={{
          background: '#0B1C2C', color: '#DDE8F4',
          border: '2px solid #0B1C2C',
          borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
          boxShadow: '3px 3px 0 #1A6B9A66',
        }}>
          {mode === 'setup' ? 'Create Account →' : 'Log In →'}
        </button>
      </form>
    </div>
  );
}
