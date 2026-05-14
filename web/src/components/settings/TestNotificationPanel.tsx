import { useState } from 'react';
import { testNotification } from '../../lib/settings';

const T = {
  ink: '#0B1C2C', accent: '#1A6B9A', border: '#8AAAC8',
  surface: '#C8D9ED', danger: '#C0392B',
};

export default function TestNotificationPanel() {
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
        <select
          value={channel}
          onChange={e => setChannel(e.target.value as 'email' | 'telegram')}
          style={{
            background: T.surface, border: `1px solid ${T.border}`,
            color: T.ink, padding: '6px 10px', borderRadius: '4px',
            fontFamily: 'monospace', fontSize: '0.85rem', outline: 'none',
          }}
        >
          <option value="email">Email (SMTP)</option>
          <option value="telegram">Telegram</option>
        </select>

        <button
          onClick={sendTest}
          disabled={sending}
          style={{
            fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px',
            background: sending ? T.border : T.accent, color: '#fff',
            border: `1.5px solid ${T.accent}`,
            borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
            cursor: sending ? 'not-allowed' : 'pointer',
          }}
        >{sending ? 'Sending…' : 'Send test'}</button>
      </div>

      {result && (
        <div style={{
          marginTop: '10px', fontFamily: 'monospace', fontSize: '0.82rem',
          color: result.ok ? '#2E7D32' : T.danger,
        }}>
          {result.ok ? '✓' : '✗'} {result.message}
        </div>
      )}
    </div>
  );
}
