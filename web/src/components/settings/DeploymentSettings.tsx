import { useState } from 'react';
import { put } from '../../lib/api';
import { useTheme } from '../../lib/theme';
import { createActionButtonStyle, toneBadgeStyle, toneTextColor } from '../../lib/themeStyles';

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
    tone: 'info' as const,
  },
  {
    id: 'dead_drop',
    label: 'Packet Mirror',
    description: 'Encrypted packets are mirrored to S3-compatible storage. The ciphertext survives if this host is lost.',
    limitation: 'Requires S3 credentials configured.',
    tone: 'success' as const,
  },
  {
    id: 'relay_monitoring',
    label: 'Relay Monitoring',
    description: 'An Aegis Relay service monitors your heartbeats. This does not automatically release — it only tracks.',
    limitation: 'Release execution still depends on this host unless Relay Escrow is also configured.',
    tone: 'warning' as const,
  },
  {
    id: 'relay_escrow',
    label: 'Relay Escrow',
    description: 'Relay holds encrypted release material and can execute the release if this host is unavailable.',
    limitation: 'Requires a paired Aegis DMS Site Relay subscription and full escrow setup.',
    tone: 'danger' as const,
  },
];

export default function DeploymentSettings({ data, onSaved }: Props) {
  const t = useTheme();
  const [selected, setSelected] = useState(data.mode);
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const changed = selected !== data.mode;

  async function handleSave() {
    if (!acknowledged) return;
    setSaving(true);
    setError('');
    setSuccess('');
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
      <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82rem', color: t.muted, margin: 0 }}>
        Deployment mode determines how and where your packets are stored and how release is triggered.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {MODES.map(mode => {
          const active = selected === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => { setSelected(mode.id); setAcknowledged(false); }}
              style={{
                padding: '12px 14px',
                textAlign: 'left',
                cursor: 'pointer',
                background: active ? t.surface : t.bg,
                border: `2px solid ${active ? toneTextColor(t, mode.tone === 'info' ? 'info' : mode.tone) : t.border}`,
                borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
                outline: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '4px', flexWrap: 'wrap' }}>
                <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.1rem', fontWeight: 'bold', color: active ? t.ink : toneTextColor(t, mode.tone === 'info' ? 'info' : mode.tone) }}>
                  {mode.label}
                </div>
                {data.mode === mode.id && (
                  <span style={{ ...toneBadgeStyle(t, 'success'), fontFamily: "'Inter',system-ui,sans-serif", fontSize: '0.68rem', fontWeight: 700, padding: '2px 6px', borderRadius: 999 }}>
                    active
                  </span>
                )}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', color: t.ink, marginBottom: '6px', lineHeight: 1.4 }}>
                {mode.description}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem', color: toneTextColor(t, 'warning'), lineHeight: 1.3 }}>
                {mode.limitation}
              </div>
            </button>
          );
        })}
      </div>

      {changed && selectedMode && (
        <label htmlFor="deployment-acknowledgement" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontFamily: "'Inter',system-ui,sans-serif", fontSize: '0.82rem', color: t.ink, cursor: 'pointer' }}>
          <input id="deployment-acknowledgement" type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} style={{ marginTop: '2px', accentColor: t.accent }} />
          I understand the limitations of {selectedMode.label} and that this affects how my release will be executed.
        </label>
      )}

      {error && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: t.danger }}>{error}</div>}
      {success && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: toneTextColor(t, 'success') }}>{success}</div>}

      {changed && (
        <button type="button" onClick={handleSave} disabled={!acknowledged || saving} style={{ ...createActionButtonStyle(t, 'primary', !acknowledged || saving), alignSelf: 'flex-start' }}>
          {saving ? 'Saving…' : 'Save Mode'}
        </button>
      )}
    </div>
  );
}
