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
    setSaving(true); setError(''); setSuccess('');
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
    setTesting(true); setTestResult('');
    try {
      const result = await post<{ ok: boolean; message?: string }>('/api/settings/storage/test', {});
      setTestResult(result.ok ? '✓ Connection successful' : `✗ ${result.message ?? 'Test failed'}`);
    } catch (err) {
      setTestResult(`✗ ${err instanceof Error ? err.message : 'Test failed'}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: data.s3Configured ? '#2E7D32' : '#8B6914' }}>
        {data.s3Configured ? `✓ Configured — bucket: ${data.bucket}` : '⚠ Not configured'}
        {data.lastVerifiedAt && (
          <span style={{ marginLeft: '12px', color: '#4A6B8A' }}>
            last verified: {new Date(data.lastVerifiedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <p style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#4A6B8A', margin: 0, lineHeight: 1.5 }}>
        Required for Dead Drop mode. Works with AWS S3, Cloudflare R2, MinIO, and Backblaze B2.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <label style={labelStyle}>S3 Endpoint (blank for AWS S3)</label>
          <input style={inputStyle} value={endpoint} onChange={e => setEndpoint(e.target.value)}
            placeholder="https://your-account.r2.cloudflarestorage.com" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={labelStyle}>Region</label>
            <input style={inputStyle} value={region} onChange={e => setRegion(e.target.value)} required />
          </div>
          <div>
            <label style={labelStyle}>Prefix</label>
            <input style={inputStyle} value={prefix} onChange={e => setPrefix(e.target.value)} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Bucket</label>
          <input style={inputStyle} value={bucket} onChange={e => setBucket(e.target.value)} required />
        </div>

        <div>
          <label style={labelStyle}>Access Key ID{data.hasAccessKey ? ' (leave blank to keep existing)' : ''}</label>
          <input style={inputStyle} value={accessKeyId} onChange={e => setAccessKeyId(e.target.value)}
            placeholder={data.hasAccessKey ? '••••••••' : 'Enter access key ID'} />
        </div>

        <div>
          <label style={labelStyle}>Secret Access Key{data.hasAccessKey ? ' (leave blank to keep existing)' : ''}</label>
          <input style={inputStyle} type="password" value={secretAccessKey} onChange={e => setSecretAccessKey(e.target.value)}
            placeholder={data.hasAccessKey ? '••••••••' : 'Enter secret access key'} />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'monospace', fontSize: '0.82rem', color: T.ink, cursor: 'pointer' }}>
          <input type="checkbox" checked={forcePathStyle} onChange={e => setForcePathStyle(e.target.checked)} style={{ accentColor: T.accent }} />
          Force path-style URLs (required for MinIO)
        </label>

        {error && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: T.danger }}>{error}</div>}
        {success && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#2E7D32' }}>{success}</div>}

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button type="submit" disabled={saving} style={{
            fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px',
            background: saving ? T.border : T.accent, color: '#fff',
            border: `1.5px solid ${T.accent}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}>{saving ? 'Saving…' : 'Save Storage'}</button>

          {data.s3Configured && (
            <button type="button" onClick={handleTest} disabled={testing} style={{
              fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px',
              background: 'transparent', color: T.accent,
              border: `1.5px solid ${T.accent}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
              cursor: testing ? 'not-allowed' : 'pointer',
            }}>{testing ? 'Testing…' : 'Test Connection'}</button>
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
