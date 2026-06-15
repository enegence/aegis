import type { Switch } from '@aegis/shared';
import { useTheme } from '../../lib/theme';

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

function getNextActionDate(sw: Switch): string | null {
  if (sw.mode === 'heartbeat' && sw.status === 'warning' && sw.nextCheckInDueAt) {
    const graceEnd = new Date(sw.nextCheckInDueAt).getTime() + sw.gracePeriodHours * 3600000;
    return new Date(graceEnd).toISOString();
  }
  return sw.triggerAt ?? sw.nextCheckInDueAt;
}

function statusColor(status: string, accent: string, muted: string, danger: string): string {
  if (status === 'draft' || status === 'cancelled') return muted;
  if (status === 'armed') return accent;
  if (status === 'warning') return '#9A5A00';
  if (status === 'completed') return '#1F8B4C';
  if (status === 'paused') return muted;
  return danger;
}

export default function SwitchCard({ sw, selected, onSelect }: Props) {
  const t = useTheme();
  const color = statusColor(sw.status, t.accent, t.muted, t.danger);

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '12px 14px',
        background: selected ? t.bg : t.surface,
        border: `2px solid ${selected ? t.accent : t.border}`,
        borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
        cursor: 'pointer',
        marginBottom: '8px',
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '1.1rem', fontWeight: 'bold', color: t.ink }}>
            {sw.name}
          </span>
          <span style={{ marginLeft: '8px', fontFamily: "'JetBrains Mono',monospace", fontSize: '0.7rem', background: color, color: t.bg, padding: '1px 6px', borderRadius: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {sw.status}
          </span>
        </div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.7rem', color: t.muted, textAlign: 'right' }}>
          <div>{sw.mode} · {sw.deploymentMode.replace('_', ' ')}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '4px', marginTop: '6px' }}>
        <Stat label="Next action" value={fmt(getNextActionDate(sw))} />
        <Stat label="Last check-in" value={fmt(sw.lastCheckInAt)} />
        <Stat label="Contacts" value={String(sw.selectedContactIds.length)} />
        <Stat label="Estate items" value={String(sw.selectedEstateItemIds.length)} />
      </div>
    </div>
  );

  function Stat({ label, value }: { label: string; value: string }) {
    return (
      <div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.65rem', color: t.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: t.ink }}>
          {value}
        </div>
      </div>
    );
  }
}
