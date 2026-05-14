import { useState } from 'react';
import { put } from '../../lib/api';

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

interface PacketsData {
  retentionDays: number | null;
}

interface Props {
  data: PacketsData;
  onSaved: () => void;
}

export default function PacketSettings({ data, onSaved }: Props) {
  const [retentionDays, setRetentionDays] = useState(
    data.retentionDays != null ? String(data.retentionDays) : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      const days = retentionDays.trim() === '' ? null : parseInt(retentionDays, 10);
      await put('/api/settings/packets', { retentionDays: days });
      setSuccess('Packet settings saved.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <p style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#4A6B8A', margin: 0, lineHeight: 1.5 }}>
        Packets are encrypted archives of your estate information built by the worker.
        Retention controls how long old packets are kept after a new one is generated.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Retention Days (blank = keep forever)</label>
          <input
            style={{ ...inputStyle, maxWidth: '200px' }}
            type="number"
            min={0}
            max={3650}
            value={retentionDays}
            onChange={e => setRetentionDays(e.target.value)}
            placeholder="e.g. 90"
          />
          {retentionDays && (
            <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#4A6B8A', marginTop: '4px' }}>
              Old packets deleted after {retentionDays} days
            </div>
          )}
        </div>

        {error && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: T.danger }}>{error}</div>}
        {success && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#2E7D32' }}>{success}</div>}

        <button type="submit" disabled={saving} style={{
          fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px', alignSelf: 'flex-start',
          background: saving ? T.border : T.accent, color: '#fff',
          border: `1.5px solid ${T.accent}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
          cursor: saving ? 'not-allowed' : 'pointer',
        }}>{saving ? 'Saving…' : 'Save Packets'}</button>
      </form>
    </div>
  );
}
