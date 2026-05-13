import type { SwitchReadiness, ReadinessCheck } from '@aegis/shared';

const T = { ink: '#0B1C2C', border: '#8AAAC8', surface: '#C8D9ED' };

const STATUS_COLOR: Record<string, string> = {
  ready: '#2E7D32',
  warning: '#8B6914',
  not_ready: '#C0392B',
};

const STATUS_ICON: Record<string, string> = {
  ready: '✓',
  warning: '⚠',
  not_ready: '✗',
};

function CheckItem({ check }: { check: ReadinessCheck }) {
  const color = STATUS_COLOR[check.status] ?? T.ink;
  return (
    <div style={{
      padding: '6px 10px',
      borderLeft: `3px solid ${color}`,
      marginBottom: '6px',
      background: T.surface,
      borderRadius: '0 4px 4px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color, fontWeight: 'bold', fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {STATUS_ICON[check.status]}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: T.ink, fontWeight: check.required ? 600 : 400 }}>
          {check.label}
        </span>
        {!check.required && (
          <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#4A6B8A' }}>(optional)</span>
        )}
      </div>
      {check.message && (
        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#4A6B8A', marginTop: '2px', marginLeft: '18px' }}>
          {check.message}
        </div>
      )}
      {check.resolutionHint && check.status !== 'ready' && (
        <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#1A6B9A', marginTop: '2px', marginLeft: '18px' }}>
          → {check.resolutionHint}
        </div>
      )}
    </div>
  );
}

interface Props {
  readiness: SwitchReadiness;
}

export default function ReadinessChecklist({ readiness }: Props) {
  const overallColor = STATUS_COLOR[readiness.status] ?? T.ink;
  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{
        fontFamily: 'monospace', fontSize: '0.8rem',
        color: overallColor, fontWeight: 'bold', marginBottom: '6px',
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        {STATUS_ICON[readiness.status]} Readiness: {readiness.status.replace('_', ' ')}
      </div>
      {readiness.checks.map(c => <CheckItem key={c.id} check={c} />)}
    </div>
  );
}
