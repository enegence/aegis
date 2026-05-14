import { useState } from 'react';
import { post } from '../../lib/api';

const T = {
  bg: '#DDE8F4', ink: '#0B1C2C', surface: '#C8D9ED',
  border: '#8AAAC8', danger: '#C0392B', dangerBg: '#FDE8E8',
};

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
  const [confirming, setConfirming] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  const matches = input.toLowerCase() === confirmText.toLowerCase();

  async function execute() {
    if (!matches) return;
    setLoading(true); setResult('');
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
    <div style={{
      padding: '14px 16px', background: T.surface, border: `1.5px solid ${T.border}`,
      borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px', marginBottom: '12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, marginRight: '12px' }}>
          <div style={{ fontFamily: "'Caveat', cursive", fontSize: '1.05rem', fontWeight: 'bold', color: T.ink }}>
            {label}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#4A6B8A', marginTop: '2px', lineHeight: 1.4 }}>
            {disabled ? disabledReason : description}
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setConfirming(!confirming)}
          style={{
            fontFamily: 'monospace', fontSize: '0.82rem', padding: '6px 14px', flexShrink: 0,
            background: 'transparent', color: disabled ? T.border : T.danger,
            border: `1.5px solid ${disabled ? T.border : T.danger}`,
            borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          {buttonLabel}
        </button>
      </div>

      {confirming && !disabled && (
        <div style={{ marginTop: '12px', padding: '12px', background: T.dangerBg, borderRadius: '4px' }}>
          <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: T.danger, marginBottom: '8px' }}>
            Type <strong>{confirmText}</strong> to confirm:
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              style={{
                background: '#fff', border: `1.5px solid ${T.danger}`, color: T.ink,
                padding: '6px 10px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.85rem',
                outline: 'none', flex: 1,
              }}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={confirmText}
              autoFocus
            />
            <button
              type="button"
              onClick={execute}
              disabled={!matches || loading}
              style={{
                fontFamily: 'monospace', fontSize: '0.82rem', padding: '6px 14px',
                background: matches && !loading ? T.danger : '#ccc', color: '#fff',
                border: 'none', borderRadius: '4px',
                cursor: matches && !loading ? 'pointer' : 'not-allowed',
              }}
            >{loading ? 'Working…' : 'Confirm'}</button>
          </div>
          {result && (
            <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: T.danger, marginTop: '8px' }}>
              {result}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DangerZone() {
  return (
    <div>
      {/* Backup reminder */}
      <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#4A6B8A', marginBottom: '16px', padding: '12px 14px', background: T.surface, border: `1.5px solid ${T.border}`, borderRadius: '4px', lineHeight: 1.6 }}>
        <strong>Before taking any action below, back up your data.</strong>
        <br />
        Back up <code>.env</code> and <code>data/aegis.db</code> together — neither is useful without the other.
        <br />
        <span style={{ fontSize: '0.75rem' }}>
          Quick backup:{' '}
          <code style={{ background: T.bg, padding: '1px 4px', borderRadius: '2px' }}>
            sqlite3 data/aegis.db ".backup 'backup/aegis.db'"
          </code>
          {' '}and copy <code>.env</code>.
        </span>
      </div>

      <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#C0392B', marginBottom: '16px', padding: '10px 14px', background: '#FDE8E8', borderRadius: '4px', lineHeight: 1.5 }}>
        These actions are irreversible or hard to undo. Proceed with caution.
      </div>

      <DangerAction
        label="Clear Provider Credentials"
        description="Remove stored SMTP/Telegram/S3/Relay credentials from the database. Notifications and Dead Drop will stop working."
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
