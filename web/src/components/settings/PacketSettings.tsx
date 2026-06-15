import { useState } from 'react';
import { put } from '../../lib/api';
import { useTheme } from '../../lib/theme';
import { createActionButtonStyle, createInputStyle, createLabelStyle, toneTextColor } from '../../lib/themeStyles';

interface PacketsData {
  retentionDays: number | null;
}

interface Props {
  data: PacketsData;
  onSaved: () => void;
}

export default function PacketSettings({ data, onSaved }: Props) {
  const t = useTheme();
  const inputStyle = createInputStyle(t);
  const labelStyle = createLabelStyle(t);
  const [retentionDays, setRetentionDays] = useState(
    data.retentionDays != null ? String(data.retentionDays) : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
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
      <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82rem', color: t.muted, margin: 0, lineHeight: 1.5 }}>
        Packets are encrypted archives of your estate information built by the worker.
        Retention controls how long old packets are kept after a new one is generated.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label htmlFor="packet-retention-days" style={labelStyle}>Retention Days (blank = keep forever)</label>
          <input
            id="packet-retention-days"
            style={{ ...inputStyle, maxWidth: '200px' }}
            type="number"
            min={0}
            max={3650}
            value={retentionDays}
            onChange={e => setRetentionDays(e.target.value)}
            placeholder="e.g. 90"
          />
          {retentionDays && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', color: t.muted, marginTop: '4px' }}>
              Old packets deleted after {retentionDays} days
            </div>
          )}
        </div>

        {error && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: t.danger }}>{error}</div>}
        {success && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: toneTextColor(t, 'success') }}>{success}</div>}

        <button type="submit" disabled={saving} style={{ ...createActionButtonStyle(t, 'primary', saving), alignSelf: 'flex-start' }}>
          {saving ? 'Saving…' : 'Save Packets'}
        </button>
      </form>
    </div>
  );
}
