import { useState } from 'react';
import { put } from '../../lib/api';

const T = {
  bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A',
  surface: '#C8D9ED', border: '#8AAAC8', danger: '#C0392B',
};

interface TelegramStatus {
  configured: boolean;
  hasBotToken: boolean;
  chatId?: string;
}

interface Props {
  status: TelegramStatus;
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

export default function TelegramSettingsForm({ status, onSaved }: Props) {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState(status.chatId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await put('/api/settings/notifications/telegram', { botToken, chatId });
      setBotToken('');
      setSuccess('Telegram settings saved.');
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

      <div>
        <label style={labelStyle}>
          Bot token{status.hasBotToken ? ' (leave blank to keep existing)' : ''}
        </label>
        <input
          style={inputStyle}
          type="password"
          value={botToken}
          onChange={e => setBotToken(e.target.value)}
          placeholder={status.hasBotToken ? '••••••••' : '1234567890:ABC...'}
        />
      </div>

      <div>
        <label style={labelStyle}>Chat ID</label>
        <input
          style={inputStyle}
          value={chatId}
          onChange={e => setChatId(e.target.value)}
          placeholder="-1001234567890"
          required
        />
      </div>

      {error && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: T.danger }}>{error}</div>}
      {success && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#2E7D32' }}>{success}</div>}

      <button type="submit" disabled={saving} style={{
        fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px', alignSelf: 'flex-start',
        background: saving ? T.border : T.accent, color: '#fff',
        border: `1.5px solid ${T.accent}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
        cursor: saving ? 'not-allowed' : 'pointer',
      }}>{saving ? 'Saving…' : 'Save Telegram'}</button>
    </form>
  );
}
