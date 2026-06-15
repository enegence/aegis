import { useState } from 'react';
import { put } from '../../lib/api';
import { useTheme } from '../../lib/theme';
import { createActionButtonStyle, createInputStyle, createLabelStyle, toneTextColor } from '../../lib/themeStyles';

interface TelegramStatus {
  configured: boolean;
  hasBotToken: boolean;
  chatId?: string;
}

interface Props {
  status: TelegramStatus;
  onSaved: () => void;
}

export default function TelegramSettingsForm({ status, onSaved }: Props) {
  const t = useTheme();
  const inputStyle = createInputStyle(t);
  const labelStyle = createLabelStyle(t);
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
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', marginBottom: '4px', color: status.configured ? toneTextColor(t, 'success') : toneTextColor(t, 'warning') }}>
        {status.configured ? 'Configured' : 'Not configured'}
      </div>

      <div>
        <label htmlFor="telegram-bot-token" style={labelStyle}>Bot token{status.hasBotToken ? ' (leave blank to keep existing)' : ''}</label>
        <input id="telegram-bot-token" style={inputStyle} type="password" value={botToken} onChange={e => setBotToken(e.target.value)} placeholder={status.hasBotToken ? '••••••••' : '1234567890:ABC...'} />
      </div>

      <div>
        <label htmlFor="telegram-chat-id" style={labelStyle}>Chat ID</label>
        <input id="telegram-chat-id" style={inputStyle} value={chatId} onChange={e => setChatId(e.target.value)} placeholder="-1001234567890" required />
      </div>

      {error && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: t.danger }}>{error}</div>}
      {success && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: toneTextColor(t, 'success') }}>{success}</div>}

      <button type="submit" disabled={saving} style={{ ...createActionButtonStyle(t, 'primary', saving), alignSelf: 'flex-start' }}>
        {saving ? 'Saving…' : 'Save Telegram'}
      </button>
    </form>
  );
}
