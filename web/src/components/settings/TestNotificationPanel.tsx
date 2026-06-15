import { useState } from 'react';
import { testNotification } from '../../lib/settings';
import { useTheme } from '../../lib/theme';
import { createActionButtonStyle, createInputStyle, createLabelStyle, toneTextColor } from '../../lib/themeStyles';

export default function TestNotificationPanel() {
  const t = useTheme();
  const selectStyle = createInputStyle(t, { width: 'auto', minWidth: 180 });
  const labelStyle = createLabelStyle(t);
  const [channel, setChannel] = useState<'email' | 'telegram'>('email');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function sendTest() {
    setSending(true);
    setResult(null);
    try {
      const response = await testNotification({ channel });
      setResult({
        ok: response.ok,
        message: response.message ?? `Test ${channel} sent successfully.`,
      });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Send failed' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <label htmlFor="test-notification-channel" style={labelStyle}>Channel</label>
          <select id="test-notification-channel" value={channel} onChange={e => setChannel(e.target.value as 'email' | 'telegram')} style={selectStyle}>
            <option value="email">Email (SMTP)</option>
            <option value="telegram">Telegram</option>
          </select>
        </div>

        <button onClick={sendTest} disabled={sending} style={createActionButtonStyle(t, 'outline', sending)}>
          {sending ? 'Sending…' : 'Send test'}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: '10px', fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82rem', color: result.ok ? toneTextColor(t, 'success') : t.danger }}>
          {result.ok ? '✓' : '✗'} {result.message}
        </div>
      )}
    </div>
  );
}
