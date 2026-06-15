import { useState } from 'react';
import { put } from '../../lib/api';
import { useTheme } from '../../lib/theme';
import { createActionButtonStyle, createInputStyle, createLabelStyle, toneTextColor } from '../../lib/themeStyles';

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

export default function SmtpSettingsForm({ status, onSaved }: Props) {
  const t = useTheme();
  const inputStyle = createInputStyle(t);
  const labelStyle = createLabelStyle(t);
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
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', marginBottom: '4px', color: status.configured ? toneTextColor(t, 'success') : toneTextColor(t, 'warning') }}>
        {status.configured ? 'Configured' : 'Not configured'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
        <div>
          <label htmlFor="smtp-host" style={labelStyle}>Host</label>
          <input id="smtp-host" style={inputStyle} value={host} onChange={e => setHost(e.target.value)} placeholder="smtp.example.com" required />
        </div>
        <div>
          <label htmlFor="smtp-port" style={labelStyle}>Port</label>
          <input id="smtp-port" style={inputStyle} type="number" value={port} onChange={e => setPort(e.target.value)} required />
        </div>
      </div>

      <div>
        <label htmlFor="smtp-user" style={labelStyle}>Username</label>
        <input id="smtp-user" style={inputStyle} value={user} onChange={e => setUser(e.target.value)} placeholder="user@example.com" required />
      </div>

      <div>
        <label htmlFor="smtp-password" style={labelStyle}>Password{status.hasPassword ? ' (leave blank to keep existing)' : ''}</label>
        <input id="smtp-password" style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={status.hasPassword ? '••••••••' : 'Enter password'} />
      </div>

      <div>
        <label htmlFor="smtp-from-email" style={labelStyle}>From email</label>
        <input id="smtp-from-email" style={inputStyle} type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)} required />
      </div>

      <label htmlFor="smtp-secure" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: "'Inter',system-ui,sans-serif", fontSize: '0.82rem', color: t.ink, cursor: 'pointer' }}>
        <input id="smtp-secure" type="checkbox" checked={secure} onChange={e => setSecure(e.target.checked)} style={{ accentColor: t.accent }} />
        Use TLS/SSL
      </label>

      {error && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: t.danger }}>{error}</div>}
      {success && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: toneTextColor(t, 'success') }}>{success}</div>}

      <button type="submit" disabled={saving} style={{ ...createActionButtonStyle(t, 'primary', saving), alignSelf: 'flex-start' }}>
        {saving ? 'Saving…' : 'Save SMTP'}
      </button>
    </form>
  );
}
