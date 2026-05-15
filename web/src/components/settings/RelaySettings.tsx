import { useState } from 'react';
import { post, del } from '../../lib/api';

const T = {
  bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A',
  surface: '#C8D9ED', border: '#8AAAC8', danger: '#C0392B',
};

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
    setLinking(true); setError(''); setSuccess('');
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
    setTesting(true); setTestResult('');
    try {
      const result = await post<{ ok: boolean; message?: string }>('/api/settings/relay/test', {});
      setTestResult(result.ok ? '✓ Heartbeat sent' : `✗ ${result.message ?? 'Test failed'}`);
    } catch (err) {
      setTestResult(`✗ ${err instanceof Error ? err.message : 'Test failed'}`);
    } finally {
      setTesting(false);
    }
  }

  async function handleUnlink() {
    if (!confirm('Unlink this Relay connection? You will need to generate a new link code to reconnect.')) return;
    setUnlinking(true); setError(''); setSuccess('');
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
      {/* Connection status */}
      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: data.enabled ? '#2E7D32' : '#8B6914' }}>
        {data.enabled ? `✓ Connected — ${data.relayUrl}` : '⚠ Not connected'}
        {data.connectionId && (
          <span style={{ marginLeft: '12px', color: '#4A6B8A' }}>
            connection: {data.connectionId}
          </span>
        )}
        {data.lastHeartbeatAt && (
          <span style={{ marginLeft: '12px', color: '#4A6B8A' }}>
            last heartbeat: {new Date(data.lastHeartbeatAt).toLocaleString()}
          </span>
        )}
      </div>

      {/* Instructions */}
      <div style={{
        padding: '10px 14px', background: T.surface, border: `1.5px solid ${T.border}`,
        borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
        fontFamily: 'monospace', fontSize: '0.78rem', color: '#4A6B8A', lineHeight: 1.5,
      }}>
        To connect to Aegis Relay: log in to <strong>aegis-dms.com</strong>, go to your account settings,
        and generate a link code. Paste the code and the Relay URL below.
        The link code is single-use and expires in 10 minutes.
      </div>

      {!data.enabled ? (
        /* Link form — shown when not yet connected */
        <form onSubmit={handleLinkExchange} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={labelStyle}>Relay URL</label>
            <input
              style={inputStyle}
              type="url"
              value={relayUrl}
              onChange={e => setRelayUrl(e.target.value)}
              placeholder="https://relay.aegis-dms.com"
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Link Code (from aegis-dms.com)</label>
            <input
              style={inputStyle}
              type="text"
              value={linkCode}
              onChange={e => setLinkCode(e.target.value)}
              placeholder="Paste your link code here"
              required
            />
          </div>

          {error && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: T.danger }}>{error}</div>}
          {success && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#2E7D32' }}>{success}</div>}

          <div>
            <button type="submit" disabled={linking} style={{
              fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px',
              background: linking ? T.border : T.accent, color: '#fff',
              border: `1.5px solid ${T.accent}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
              cursor: linking ? 'not-allowed' : 'pointer',
            }}>{linking ? 'Linking…' : 'Link Relay'}</button>
          </div>
        </form>
      ) : (
        /* Connected state — test + unlink buttons */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {error && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: T.danger }}>{error}</div>}
          {success && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#2E7D32' }}>{success}</div>}

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button type="button" onClick={handleTest} disabled={testing} style={{
              fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px',
              background: 'transparent', color: T.accent,
              border: `1.5px solid ${T.accent}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
              cursor: testing ? 'not-allowed' : 'pointer',
            }}>{testing ? 'Testing…' : 'Send Heartbeat'}</button>

            <button type="button" onClick={handleUnlink} disabled={unlinking} style={{
              fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px',
              background: 'transparent', color: T.danger,
              border: `1.5px solid ${T.danger}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
              cursor: unlinking ? 'not-allowed' : 'pointer',
            }}>{unlinking ? 'Unlinking…' : 'Unlink Relay'}</button>

            {testResult && (
              <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: testResult.startsWith('✓') ? '#2E7D32' : T.danger }}>
                {testResult}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
