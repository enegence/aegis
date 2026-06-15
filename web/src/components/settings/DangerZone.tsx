import { useState } from 'react';
import { post } from '../../lib/api';
import { useTheme } from '../../lib/theme';
import { createActionButtonStyle, createInputStyle, toneBadgeStyle } from '../../lib/themeStyles';

interface DangerActionProps {
  label: string;
  description: string;
  confirmText: string;
  buttonLabel: string;
  onConfirm: () => Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
}

function DangerAction({ label, description, confirmText, buttonLabel, onConfirm, disabled, disabledReason }: DangerActionProps) {
  const t = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const matches = input.toLowerCase() === confirmText.toLowerCase();

  async function execute() {
    if (!matches) return;
    setLoading(true);
    setResult('');
    try {
      await onConfirm();
      setResult('Done.');
      setConfirming(false);
      setInput('');
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '14px 16px', background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, marginRight: '12px' }}>
          <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.05rem', fontWeight: 'bold', color: t.ink }}>{label}</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem', color: t.muted, marginTop: '2px', lineHeight: 1.4 }}>
            {disabled ? disabledReason : description}
          </div>
        </div>
        <button type="button" disabled={disabled} onClick={() => setConfirming(!confirming)} style={{ ...createActionButtonStyle(t, 'danger', !!disabled), flexShrink: 0 }}>
          {buttonLabel}
        </button>
      </div>

      {confirming && !disabled && (
        <div style={{ marginTop: '12px', padding: '12px', borderRadius: '4px', ...toneBadgeStyle(t, 'danger') }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem', marginBottom: '8px' }}>
            Type <strong>{confirmText}</strong> to confirm:
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              style={{ ...createInputStyle(t, { flex: 1 }), border: `1.5px solid ${t.danger}` }}
              aria-label={`Type ${confirmText} to confirm ${label}`}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={confirmText}
              autoFocus
            />
            <button type="button" onClick={execute} disabled={!matches || loading} style={createActionButtonStyle(t, 'danger', !matches || loading)}>
              {loading ? 'Working…' : 'Confirm'}
            </button>
          </div>
          {result && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem', color: t.danger, marginTop: '8px' }}>
              {result}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DangerZone() {
  const t = useTheme();

  return (
    <div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82rem', color: t.muted, marginBottom: '16px', padding: '12px 14px', background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: '4px', lineHeight: 1.6 }}>
        <strong>Before taking any action below, back up your data.</strong>
        <br />
        Back up <code>.env</code> and <code>data/aegis.db</code> together — neither is useful without the other.
        <br />
        <span style={{ fontSize: '0.75rem' }}>
          Quick backup:{' '}
          <code style={{ background: t.bg, padding: '1px 4px', borderRadius: '2px' }}>
            sqlite3 data/aegis.db ".backup 'backup/aegis.db'"
          </code>
          {' '}and copy <code>.env</code>.
        </span>
      </div>

      <div style={{ ...toneBadgeStyle(t, 'danger'), fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82rem', marginBottom: '16px', padding: '10px 14px', borderRadius: '4px', lineHeight: 1.5 }}>
        These actions are irreversible or hard to undo. Proceed with caution.
      </div>

      <DangerAction
        label="Clear Provider Credentials"
        description="Remove stored SMTP/Telegram/S3/Relay credentials from the database. Notifications and Packet Mirror will stop working."
        confirmText="clear credentials"
        buttonLabel="Clear Credentials"
        onConfirm={async () => { await post('/api/settings/danger/clear-credentials', {}); }}
      />

      <DangerAction
        label="Delete Local Packets"
        description="Delete all packet files from the local data directory. Packets stored in S3 are not affected."
        confirmText="delete packets"
        buttonLabel="Delete Packets"
        onConfirm={async () => { await post('/api/settings/danger/delete-packets', {}); }}
      />

      <DangerAction
        label="Factory Reset"
        description="Not yet available in this alpha release."
        confirmText="factory reset"
        buttonLabel="Reset"
        onConfirm={async () => {}}
        disabled={true}
        disabledReason="Factory reset is not available in alpha. Reinstall from scratch to reset."
      />
    </div>
  );
}
