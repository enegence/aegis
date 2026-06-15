import { useState } from 'react';
import { put, post } from '../../lib/api';
import { useTheme } from '../../lib/theme';
import { createActionButtonStyle, createInputStyle, createLabelStyle, toneTextColor } from '../../lib/themeStyles';

interface StorageData {
  s3Configured: boolean;
  bucket?: string | null;
  region?: string | null;
  prefix?: string | null;
  endpoint?: string | null;
  hasAccessKey: boolean;
  lastVerifiedAt?: string | null;
}

interface Props {
  data: StorageData;
  onSaved: () => void;
}

export default function StorageSettings({ data, onSaved }: Props) {
  const t = useTheme();
  const inputStyle = createInputStyle(t);
  const labelStyle = createLabelStyle(t);
  const [endpoint, setEndpoint] = useState(data.endpoint ?? '');
  const [region, setRegion] = useState(data.region ?? 'us-east-1');
  const [bucket, setBucket] = useState(data.bucket ?? '');
  const [prefix, setPrefix] = useState(data.prefix ?? 'aegis');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [forcePathStyle, setForcePathStyle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testResult, setTestResult] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await put('/api/settings/storage/s3', {
        endpoint: endpoint || undefined,
        region,
        bucket,
        prefix,
        accessKeyId,
        secretAccessKey: secretAccessKey || undefined,
        forcePathStyle,
      });
      setAccessKeyId('');
      setSecretAccessKey('');
      setSuccess('Storage settings saved.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult('');
    try {
      const result = await post<{ ok: boolean; message?: string }>('/api/settings/storage/test', {});
      setTestResult(result.ok ? 'Connection successful' : `${result.message ?? 'Test failed'}`);
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', color: data.s3Configured ? toneTextColor(t, 'success') : toneTextColor(t, 'warning') }}>
        {data.s3Configured ? `Configured — bucket: ${data.bucket}` : 'Not configured'}
        {data.lastVerifiedAt && (
          <span style={{ marginLeft: '12px', color: t.muted }}>
            last verified: {new Date(data.lastVerifiedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem', color: t.muted, margin: 0, lineHeight: 1.5 }}>
        Required for Packet Mirror mode. Works with AWS S3, Cloudflare R2, MinIO, and Backblaze B2.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <label htmlFor="storage-endpoint" style={labelStyle}>S3 Endpoint (blank for AWS S3)</label>
          <input id="storage-endpoint" style={inputStyle} value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://your-account.r2.cloudflarestorage.com" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label htmlFor="storage-region" style={labelStyle}>Region</label>
            <input id="storage-region" style={inputStyle} value={region} onChange={e => setRegion(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="storage-prefix" style={labelStyle}>Prefix</label>
            <input id="storage-prefix" style={inputStyle} value={prefix} onChange={e => setPrefix(e.target.value)} />
          </div>
        </div>

        <div>
          <label htmlFor="storage-bucket" style={labelStyle}>Bucket</label>
          <input id="storage-bucket" style={inputStyle} value={bucket} onChange={e => setBucket(e.target.value)} required />
        </div>

        <div>
          <label htmlFor="storage-access-key-id" style={labelStyle}>Access Key ID{data.hasAccessKey ? ' (leave blank to keep existing)' : ''}</label>
          <input id="storage-access-key-id" style={inputStyle} value={accessKeyId} onChange={e => setAccessKeyId(e.target.value)} placeholder={data.hasAccessKey ? '••••••••' : 'Enter access key ID'} />
        </div>

        <div>
          <label htmlFor="storage-secret-access-key" style={labelStyle}>Secret Access Key{data.hasAccessKey ? ' (leave blank to keep existing)' : ''}</label>
          <input id="storage-secret-access-key" style={inputStyle} type="password" value={secretAccessKey} onChange={e => setSecretAccessKey(e.target.value)} placeholder={data.hasAccessKey ? '••••••••' : 'Enter secret access key'} />
        </div>

        <label htmlFor="storage-force-path-style" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: "'Inter',system-ui,sans-serif", fontSize: '0.82rem', color: t.ink, cursor: 'pointer' }}>
          <input id="storage-force-path-style" type="checkbox" checked={forcePathStyle} onChange={e => setForcePathStyle(e.target.checked)} style={{ accentColor: t.accent }} />
          Force path-style URLs (required for MinIO)
        </label>

        {error && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: t.danger }}>{error}</div>}
        {success && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: toneTextColor(t, 'success') }}>{success}</div>}

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" disabled={saving} style={createActionButtonStyle(t, 'primary', saving)}>
            {saving ? 'Saving…' : 'Save Storage'}
          </button>

          {data.s3Configured && (
            <button type="button" onClick={handleTest} disabled={testing} style={createActionButtonStyle(t, 'outline', testing)}>
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
          )}

          {testResult && (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: testResult === 'Connection successful' ? toneTextColor(t, 'success') : t.danger }}>
              {testResult === 'Connection successful' ? '✓' : '✗'} {testResult}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
