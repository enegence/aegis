import type { HealthStatus } from '@aegis/shared';

const T = { ink: '#0B1C2C', surface: '#C8D9ED', border: '#8AAAC8', muted: '#4A6B8A' };

const STATUS_COLOR: Record<string, string> = {
  ok: '#2E7D32',
  error: '#C0392B',
  not_configured: '#8B6914',
  degraded: '#8B6914',
};

const STATUS_LABEL: Record<string, string> = {
  ok: 'OK',
  error: 'Error',
  not_configured: 'Not configured',
  degraded: 'Degraded',
};

function HealthRow({ label, status }: { label: string; status: string }) {
  const color = STATUS_COLOR[status] ?? T.muted;
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0', borderBottom: `1px solid ${T.border}`,
    }}>
      <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: T.ink }}>{label}</span>
      <span style={{
        fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 'bold',
        color, textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>{STATUS_LABEL[status] ?? status}</span>
    </div>
  );
}

interface Props {
  health: HealthStatus;
}

export default function SystemHealthCard({ health }: Props) {
  return (
    <div style={{
      padding: '16px', background: T.surface,
      border: `2px solid ${T.border}`,
      borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px',
    }}>
      <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
        System health
      </div>
      <HealthRow label="Database" status={health.database} />
      <HealthRow label="Notifications" status={health.notifications} />
      <HealthRow label="Storage" status={health.storage} />
      <HealthRow label="Relay" status={health.relay} />
      <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: T.muted, marginTop: '8px' }}>
        v{health.version} · up {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m
      </div>
    </div>
  );
}
