import { useState } from 'react';
import { post, del } from '../../lib/api';
import { useTheme } from '../../lib/theme';
import { createActionButtonStyle, createInputStyle, createLabelStyle, toneTextColor } from '../../lib/themeStyles';

interface RelayData {
  enabled: boolean;
  relayUrl?: string | null;
  apiKeyConfigured: boolean;
  lastHeartbeatAt?: string | null;
  connectionId?: string | null;
}

interface Props {
  data: RelayData;
  onSaved: () => void;
}

export default function RelaySettings({ data, onSaved }: Props) {
  const t = useTheme();
  const inputStyle = createInputStyle(t);
  const labelStyle = createLabelStyle(t);
  const [relayUrl, setRelayUrl] = useState('');
  const [linkCode, setLinkCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testResult, setTestResult] = useState('');

  async function handleLinkExchange(e: React.FormEvent) {
    e.preventDefault();
    setLinking(true);
    setError('');
    setSuccess('');
    try {
      await post('/api/settings/relay/link-exchange', {
        relayUrl: relayUrl.trim(),
        code: linkCode.trim(),
      });
      setRelayUrl('');
      setLinkCode('');
      setSuccess('Relay linked successfully.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Link failed');
    } finally {
      setLinking(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult('');
    try {
      const result = await post<{ ok: boolean; message?: string }>('/api/settings/relay/test', {});
      setTestResult(result.ok ? 'Heartbeat sent' : `${result.message ?? 'Test failed'}`);
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  }

  async function handleUnlink() {
    if (!confirm('Unlink this Relay connection? You will need to generate a new link code to reconnect.')) return;
    setUnlinking(true);
    setError('');
    setSuccess('');
    try {
      await del('/api/settings/relay/unlink');
      setSuccess('Relay unlinked.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlink failed');
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', color: data.enabled ? toneTextColor(t, 'success') : toneTextColor(t, 'warning') }}>
        {data.enabled ? `Connected — ${data.relayUrl}` : 'Not connected'}
        {data.connectionId && <span style={{ marginLeft: '12px', color: t.muted }}>connection: {data.connectionId}</span>}
        {data.lastHeartbeatAt && <span style={{ marginLeft: '12px', color: t.muted }}>last heartbeat: {new Date(data.lastHeartbeatAt).toLocaleString()}</span>}
      </div>

      <div style={{ padding: '10px 14px', background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px', fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem', color: t.muted, lineHeight: 1.5 }}>
        To connect to Aegis Relay: create or log in to an account at{' '}
        <a href="https://aegisdms.life" target="_blank" rel="noreferrer" style={{ color: t.accent }}>
          aegisdms.life
        </a>
        , go to your account settings, and generate a link code. Paste the code and the Relay URL below.
        The link code is single-use and expires in 10 minutes.
      </div>

      {!data.enabled ? (
        <form onSubmit={handleLinkExchange} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label htmlFor="relay-url" style={labelStyle}>Relay URL</label>
            <input id="relay-url" style={inputStyle} type="url" value={relayUrl} onChange={e => setRelayUrl(e.target.value)} placeholder="https://relay.aegisdms.life" required />
          </div>

          <div>
            <label htmlFor="relay-link-code" style={labelStyle}>Link Code (from aegisdms.life)</label>
            <input id="relay-link-code" style={inputStyle} type="text" value={linkCode} onChange={e => setLinkCode(e.target.value)} placeholder="Paste your link code here" required />
          </div>

          {error && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: t.danger }}>{error}</div>}
          {success && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: toneTextColor(t, 'success') }}>{success}</div>}

          <div>
            <button type="submit" disabled={linking} style={createActionButtonStyle(t, 'primary', linking)}>
              {linking ? 'Linking…' : 'Link Relay'}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {error && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: t.danger }}>{error}</div>}
          {success && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: toneTextColor(t, 'success') }}>{success}</div>}

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={handleTest} disabled={testing} style={createActionButtonStyle(t, 'outline', testing)}>
              {testing ? 'Testing…' : 'Send Heartbeat'}
            </button>

            <button type="button" onClick={handleUnlink} disabled={unlinking} style={createActionButtonStyle(t, 'danger', unlinking)}>
              {unlinking ? 'Unlinking…' : 'Unlink Relay'}
            </button>

            {testResult && (
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: testResult === 'Heartbeat sent' ? toneTextColor(t, 'success') : t.danger }}>
                {testResult === 'Heartbeat sent' ? '✓' : '✗'} {testResult}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
