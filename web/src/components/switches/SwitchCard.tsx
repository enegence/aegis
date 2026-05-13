import type { Switch } from '@aegis/shared';

const T = {
  ink: '#0B1C2C', accent: '#1A6B9A', muted: '#4A6B8A',
  surface: '#C8D9ED', border: '#8AAAC8', danger: '#C0392B',
};

const STATUS_COLOR: Record<string, string> = {
  draft: T.muted, armed: T.accent, warning: '#8B6914',
  triggered: T.danger, cascade_active: T.danger,
  completed: '#2E7D32', cancelled: T.muted, paused: '#6B7A8A', failed: T.danger,
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

interface Props {
  sw: Switch;
  selected: boolean;
  onSelect: () => void;
}

export default function SwitchCard({ sw, selected, onSelect }: Props) {
  const statusColor = STATUS_COLOR[sw.status] ?? T.muted;
  return (
    <div
      onClick={onSelect}
      style={{
        padding: '12px 14px',
        background: selected ? '#B8CBE0' : T.surface,
        border: `2px solid ${selected ? T.accent : T.border}`,
        borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
        cursor: 'pointer',
        marginBottom: '8px',
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '1.1rem', fontWeight: 'bold', color: T.ink }}>
            {sw.name}
          </span>
          <span style={{
            marginLeft: '8px', fontFamily: 'monospace', fontSize: '0.7rem',
            background: statusColor, color: '#fff',
            padding: '1px 6px', borderRadius: '3px',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {sw.status}
          </span>
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: T.muted, textAlign: 'right' }}>
          <div>{sw.mode} · {sw.deploymentMode.replace('_', ' ')}</div>
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '4px', marginTop: '6px',
      }}>
        <Stat label="Next action" value={fmt(sw.triggerAt ?? sw.nextCheckInDueAt)} />
        <Stat label="Last check-in" value={fmt(sw.lastCheckInAt)} />
        <Stat label="Contacts" value={String(sw.selectedContactIds.length)} />
        <Stat label="Estate items" value={String(sw.selectedEstateItemIds.length)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: T.ink }}>
        {value}
      </div>
    </div>
  );
}
