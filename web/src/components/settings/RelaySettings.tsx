import { useEffect, useState } from 'react';
import { get, post, del } from '../../lib/api';
import { useTheme } from '../../lib/theme';
import { createActionButtonStyle, createInputStyle, createLabelStyle, toneTextColor } from '../../lib/themeStyles';

interface RelayData {
  enabled: boolean;
  relayUrl?: string | null;
  apiKeyConfigured: boolean;
  lastHeartbeatAt?: string | null;
  lastHeartbeatError?: string | null;
  connectionId?: string | null;
}

interface SwitchSummary { id: number; name: string; deploymentMode: string }

/** POST /api/settings/relay/escrow-upload response (server/src/routes/settings.ts). */
interface EscrowUploadResult {
  relayPacketId: string;
  version: number;
  duplicate: boolean;
  keyId: string;
  releaseKey: string;
}

const UPLOAD_ERRORS: Record<string, string> = {
  relay_not_linked: 'Link this instance to Aegis Relay first.',
  switch_not_relay_escrow: 'That switch is not in Relay Escrow mode.',
  switch_not_found: 'Switch not found.',
  packet_unavailable: 'Could not build a packet for this switch. Check that it has contacts and estate items selected.',
  packet_build_failed: 'Could not build a packet for this switch. Check that it has contacts and estate items selected.',
  relay_unreachable: 'Aegis Relay could not be reached. Check your connection and try again.',
  relay_rejected: 'Aegis Relay rejected the upload.',
};

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
  const [escrowSwitches, setEscrowSwitches] = useState<SwitchSummary[]>([]);
  const [escrowSwitchId, setEscrowSwitchId] = useState<number | ''>('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [upload, setUpload] = useState<EscrowUploadResult | null>(null);

  useEffect(() => {
    if (!data.enabled) return;
    get<SwitchSummary[]>('/api/switches')
      .then((list) => {
        const escrow = list.filter((sw) => sw.deploymentMode === 'relay_escrow');
        setEscrowSwitches(escrow);
        if (escrow.length > 0) setEscrowSwitchId(escrow[0].id);
      })
      .catch(() => setEscrowSwitches([]));
  }, [data.enabled]);

  async function handleEscrowUpload() {
    if (escrowSwitchId === '') return;
    setUploading(true);
    setUploadError('');
    setUpload(null);
    try {
      setUpload(await post<EscrowUploadResult>('/api/settings/relay/escrow-upload', { switchId: escrowSwitchId }));
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setUploadError(UPLOAD_ERRORS[code] ?? (code || 'Upload failed'));
    } finally {
      setUploading(false);
    }
  }

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
        {data.enabled && data.lastHeartbeatError && <span style={{ marginLeft: '12px', color: t.danger }}>last heartbeat failed: {data.lastHeartbeatError.replace('http_', 'HTTP ')}</span>}
      </div>
      {data.enabled && (
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem', color: t.muted }}>
          This instance sends a heartbeat to Relay automatically every few minutes while the server is running.
        </div>
      )}

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

          <div style={{ marginTop: '8px', padding: '10px 14px', border: `1.5px solid ${t.border}`, borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px' }}>
            <div style={{ fontFamily: "'Caveat',cursive", fontSize: '1.2rem', fontWeight: 700, color: t.ink, marginBottom: '6px' }}>Relay Escrow packet</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', color: t.muted, lineHeight: 1.5, marginBottom: '8px' }}>
              Relay Escrow lets Aegis Relay release your packet if this server goes offline. Upload the current packet for a Relay Escrow switch,
              then in the Aegis Relay web app open Relay → Escrow, choose this packet, and paste the release key below as the escrow material.
              Re-upload and update escrow after you change the switch&apos;s contents.
            </div>
            {escrowSwitches.length === 0 ? (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', color: t.muted }}>
                No switch uses Relay Escrow yet. Set a switch&apos;s deployment mode to Relay Escrow to upload its packet.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label htmlFor="escrow-switch" style={labelStyle}>Switch</label>
                  <select id="escrow-switch" style={inputStyle} value={escrowSwitchId} onChange={(e) => setEscrowSwitchId(Number(e.target.value))}>
                    {escrowSwitches.map((sw) => <option key={sw.id} value={sw.id}>{sw.name}</option>)}
                  </select>
                </div>
                <button type="button" onClick={handleEscrowUpload} disabled={uploading} style={createActionButtonStyle(t, 'primary', uploading)}>
                  {uploading ? 'Uploading…' : 'Upload packet to Relay'}
                </button>
              </div>
            )}
            {uploadError && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: t.danger, marginTop: '8px' }}>{uploadError}</div>}
            {upload && (
              <div style={{ marginTop: '10px', fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem', color: t.ink }}>
                <div style={{ color: toneTextColor(t, 'success'), marginBottom: '6px' }}>
                  {upload.duplicate ? 'Relay already had this packet.' : `Uploaded as version ${upload.version}.`} Relay packet: {upload.relayPacketId}
                </div>
                <label htmlFor="escrow-release-key" style={labelStyle}>Release key (paste into Aegis Relay as escrow material)</label>
                <input id="escrow-release-key" style={inputStyle} readOnly value={upload.releaseKey} onFocus={(e) => e.currentTarget.select()} />
                <div style={{ color: t.danger, fontSize: '0.72rem', marginTop: '4px' }}>
                  Anyone with this key and the packet can read it. Paste it only into Aegis Relay, then close this page.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
