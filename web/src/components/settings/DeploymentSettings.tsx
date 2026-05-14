import { useState } from 'react';
import { put } from '../../lib/api';

const T = {
  bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A',
  surface: '#C8D9ED', border: '#8AAAC8', danger: '#C0392B',
  warn: '#8B6914',
};

interface DeploymentData {
  mode: string;
}

interface Props {
  data: DeploymentData;
  onSaved: () => void;
}

const MODES = [
  {
    id: 'vault',
    label: 'Vault Mode',
    description: 'Packets stay on this server. Release requires this host to be running when the switch fires.',
    limitation: 'No automated release if this host goes offline.',
    color: '#1A6B9A',
  },
  {
    id: 'dead_drop',
    label: 'Dead Drop',
    description: 'Encrypted packets are stored in S3-compatible storage. Release can proceed even if this host is gone.',
    limitation: 'Requires S3 credentials configured.',
    color: '#2E7D32',
  },
  {
    id: 'relay_monitoring',
    label: 'Relay Monitoring',
    description: 'An Aegis Relay service monitors your heartbeats. This does not automatically release — it only tracks.',
    limitation: 'Release execution still depends on this host unless Relay Escrow is also configured.',
    color: '#7B4F00',
  },
  {
    id: 'relay_escrow',
    label: 'Relay Escrow',
    description: 'Relay holds encrypted release material and can execute the release if this host is unavailable.',
    limitation: 'Requires a paired Aegis DMS Site Relay subscription and full escrow setup.',
    color: '#6A0DAD',
  },
];

export default function DeploymentSettings({ data, onSaved }: Props) {
  const [selected, setSelected] = useState(data.mode);
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const changed = selected !== data.mode;

  async function handleSave() {
    if (!acknowledged) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await put('/api/settings/deployment', { mode: selected });
      setSuccess('Deployment mode saved.');
      setAcknowledged(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const selectedMode = MODES.find(m => m.id === selected);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <p style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#4A6B8A', margin: 0 }}>
        Deployment mode determines how and where your packets are stored and how release is triggered.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {MODES.map(mode => (
          <button
            key={mode.id}
            type="button"
            onClick={() => { setSelected(mode.id); setAcknowledged(false); }}
            style={{
              padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
              background: selected === mode.id ? T.surface : T.bg,
              border: `2px solid ${selected === mode.id ? mode.color : T.border}`,
              borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
              outline: 'none',
            }}
          >
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.1rem', fontWeight: 'bold', color: mode.color, marginBottom: '4px' }}>
              {mode.label}
              {data.mode === mode.id && (
                <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', marginLeft: '8px', color: '#2E7D32' }}>active</span>
              )}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: T.ink, marginBottom: '6px', lineHeight: 1.4 }}>
              {mode.description}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: T.warn, lineHeight: 1.3 }}>
              ⚠ {mode.limitation}
            </div>
          </button>
        ))}
      </div>

      {changed && selectedMode && (
        <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontFamily: 'monospace', fontSize: '0.82rem', color: T.ink, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={e => setAcknowledged(e.target.checked)}
            style={{ marginTop: '2px', accentColor: T.accent }}
          />
          I understand the limitations of {selectedMode.label} and that this affects how my release will be executed.
        </label>
      )}

      {error && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: T.danger }}>{error}</div>}
      {success && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#2E7D32' }}>{success}</div>}

      {changed && (
        <button
          type="button"
          onClick={handleSave}
          disabled={!acknowledged || saving}
          style={{
            fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px', alignSelf: 'flex-start',
            background: (!acknowledged || saving) ? T.border : T.accent, color: '#fff',
            border: `1.5px solid ${T.accent}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
            cursor: (!acknowledged || saving) ? 'not-allowed' : 'pointer',
          }}
        >{saving ? 'Saving…' : 'Save Mode'}</button>
      )}
    </div>
  );
}
