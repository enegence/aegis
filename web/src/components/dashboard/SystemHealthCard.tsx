import type { HealthStatus } from '@aegis/shared';
import { useTheme } from '../../lib/theme';
import { toneTextColor } from '../../lib/themeStyles';

const STATUS_LABEL: Record<string, string> = {
  ok: 'OK',
  error: 'Error',
  not_configured: 'Not configured',
  degraded: 'Degraded',
};

function colorFor(status: string, success: string, warning: string, danger: string, muted: string): string {
  if (status === 'ok') return success;
  if (status === 'error') return danger;
  if (status === 'not_configured' || status === 'degraded') return warning;
  return muted;
}

function HealthRow({ label, status }: { label: string; status: string }) {
  const t = useTheme();
  const color = colorFor(status, toneTextColor(t, 'success'), toneTextColor(t, 'warning'), t.danger, t.muted);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${t.border}` }}>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82rem', color: t.ink }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem', fontWeight: 'bold', color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {STATUS_LABEL[status] ?? status}
      </span>
    </div>
  );
}

interface Props {
  health: HealthStatus;
}

export default function SystemHealthCard({ health }: Props) {
  const t = useTheme();
  return (
    <div style={{ padding: '16px', background: t.surface, border: `2px solid ${t.border}`, borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px' }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.7rem', color: t.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
        System health
      </div>
      <HealthRow label="Database" status={health.database} />
      <HealthRow label="Notifications" status={health.notifications} />
      <HealthRow label="Storage" status={health.storage} />
      <HealthRow label="Relay" status={health.relay} />
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.7rem', color: t.muted, marginTop: '8px' }}>
        v{health.version} · up {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m
      </div>
    </div>
  );
}
