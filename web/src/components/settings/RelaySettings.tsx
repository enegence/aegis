import { useState } from 'react';
import { put, post } from '../../lib/api';

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
}

interface Props {
  data: RelayData;
  onSaved: () => void;
}

export default function RelaySettings({ data, onSaved }: Props) {
  const [relayUrl, setRelayUrl] = useState(data.relayUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testResult, setTestResult] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      await put('/api/settings/relay', {
        relayUrl: relayUrl || undefined,
        apiKey: apiKey || undefined,
      });
      setApiKey('');
      setSuccess('Relay settings saved.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: data.enabled ? '#2E7D32' : '#8B6914' }}>
        {data.enabled ? `✓ Connected — ${data.relayUrl}` : '⚠ Not connected'}
        {data.lastHeartbeatAt && (
          <span style={{ marginLeft: '12px', color: '#4A6B8A' }}>
            last heartbeat: {new Date(data.lastHeartbeatAt).toLocaleString()}
          </span>
        )}
      </div>

      <div style={{
        padding: '10px 14px', background: T.surface, border: `1.5px solid ${T.border}`,
        borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
        fontFamily: 'monospace', fontSize: '0.78rem', color: '#4A6B8A', lineHeight: 1.5,
      }}>
        Guided Relay connection requires an Aegis DMS Site Relay subscription.
        Manual entry is available below for advanced self-hosted setups.
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <label style={labelStyle}>Relay URL</label>
          <input style={inputStyle} type="url" value={relayUrl} onChange={e => setRelayUrl(e.target.value)}
            placeholder="https://relay.example.com" />
        </div>

        <div>
          <label style={labelStyle}>
            API Key{data.apiKeyConfigured ? ' (leave blank to keep existing)' : ''}
          </label>
          <input style={inputStyle} type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder={data.apiKeyConfigured ? '••••••••' : 'Enter API key'} />
        </div>

        {error && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: T.danger }}>{error}</div>}
        {success && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#2E7D32' }}>{success}</div>}

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button type="submit" disabled={saving} style={{
            fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px',
            background: saving ? T.border : T.accent, color: '#fff',
            border: `1.5px solid ${T.accent}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}>{saving ? 'Saving…' : 'Save Relay'}</button>

          {data.enabled && (
            <button type="button" onClick={handleTest} disabled={testing} style={{
              fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px',
              background: 'transparent', color: T.accent,
              border: `1.5px solid ${T.accent}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
              cursor: testing ? 'not-allowed' : 'pointer',
            }}>{testing ? 'Testing…' : 'Send Heartbeat'}</button>
          )}

          {testResult && (
            <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: testResult.startsWith('✓') ? '#2E7D32' : T.danger }}>
              {testResult}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
