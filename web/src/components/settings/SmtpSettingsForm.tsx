import { useState } from 'react';
import { put } from '../../lib/api';

const T = {
  bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A',
  surface: '#C8D9ED', border: '#8AAAC8', danger: '#C0392B',
};

interface SmtpStatus {
  configured: boolean;
  hasPassword: boolean;
  host?: string;
  port?: number;
  user?: string;
  fromEmail?: string;
  secure?: boolean;
}

interface Props {
  status: SmtpStatus;
  onSaved: () => void;
}

const inputStyle = {
  width: '100%', background: T.bg, border: `1px solid ${T.border}`,
  color: T.ink, padding: '6px 10px', borderRadius: '4px',
  fontFamily: 'monospace', fontSize: '0.85rem', outline: 'none',
  boxSizing: 'border-box' as const,
};

const labelStyle = {
  fontFamily: 'monospace', fontSize: '0.72rem', color: '#4A6B8A',
  textTransform: 'uppercase' as const, letterSpacing: '0.04em',
  display: 'block', marginBottom: '3px',
};

export default function SmtpSettingsForm({ status, onSaved }: Props) {
  const [host, setHost] = useState(status.host ?? '');
  const [port, setPort] = useState(String(status.port ?? 587));
  const [user, setUser] = useState(status.user ?? '');
  const [password, setPassword] = useState('');
  const [fromEmail, setFromEmail] = useState(status.fromEmail ?? '');
  const [secure, setSecure] = useState(status.secure ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await put('/api/settings/notifications/smtp', { host, port: parseInt(port), user, password, fromEmail, secure });
      setPassword('');
      setSuccess('SMTP settings saved.');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{
        fontFamily: 'monospace', fontSize: '0.75rem', marginBottom: '4px',
        color: status.configured ? '#2E7D32' : '#8B6914',
      }}>
        {status.configured ? '✓ Configured' : '⚠ Not configured'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
        <div>
          <label style={labelStyle}>Host</label>
          <input style={inputStyle} value={host} onChange={e => setHost(e.target.value)} placeholder="smtp.example.com" required />
        </div>
        <div>
          <label style={labelStyle}>Port</label>
          <input style={inputStyle} type="number" value={port} onChange={e => setPort(e.target.value)} required />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Username</label>
        <input style={inputStyle} value={user} onChange={e => setUser(e.target.value)} placeholder="user@example.com" required />
      </div>

      <div>
        <label style={labelStyle}>
          Password{status.hasPassword ? ' (leave blank to keep existing)' : ''}
        </label>
        <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder={status.hasPassword ? '••••••••' : 'Enter password'} />
      </div>

      <div>
        <label style={labelStyle}>From email</label>
        <input style={inputStyle} type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)} required />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'monospace', fontSize: '0.82rem', color: T.ink, cursor: 'pointer' }}>
        <input type="checkbox" checked={secure} onChange={e => setSecure(e.target.checked)} style={{ accentColor: T.accent }} />
        Use TLS/SSL
      </label>

      {error && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: T.danger }}>{error}</div>}
      {success && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#2E7D32' }}>{success}</div>}

      <button type="submit" disabled={saving} style={{
        fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px', alignSelf: 'flex-start',
        background: saving ? T.border : T.accent, color: '#fff',
        border: `1.5px solid ${T.accent}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
        cursor: saving ? 'not-allowed' : 'pointer',
      }}>{saving ? 'Saving…' : 'Save SMTP'}</button>
    </form>
  );
}
