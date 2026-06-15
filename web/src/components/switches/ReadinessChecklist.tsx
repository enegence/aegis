import type { SwitchReadiness, ReadinessCheck } from '@aegis/shared';
import { useTheme } from '../../lib/theme';
import { toneTextColor } from '../../lib/themeStyles';

const STATUS_ICON: Record<string, string> = {
  ready: '✓',
  warning: '⚠',
  not_ready: '✗',
};

function colorFor(status: string, success: string, warning: string, danger: string, ink: string): string {
  if (status === 'ready') return success;
  if (status === 'warning') return warning;
  if (status === 'not_ready') return danger;
  return ink;
}

function CheckItem({ check }: { check: ReadinessCheck }) {
  const t = useTheme();
  const color = colorFor(check.status, toneTextColor(t, 'success'), toneTextColor(t, 'warning'), t.danger, t.ink);
  return (
    <div style={{ padding: '6px 10px', borderLeft: `3px solid ${color}`, marginBottom: '6px', background: t.surface, borderRadius: '0 4px 4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color, fontWeight: 'bold', fontFamily: "'JetBrains Mono',monospace", fontSize: '0.85rem' }}>{STATUS_ICON[check.status]}</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.85rem', color: t.ink, fontWeight: check.required ? 600 : 400 }}>
          {check.label}
        </span>
        {!check.required && (
          <span style={{ fontFamily: "'Inter',system-ui,sans-serif", fontSize: '0.72rem', color: t.muted }}>(optional)</span>
        )}
      </div>
      {check.message && (
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', color: t.muted, marginTop: '2px', marginLeft: '18px' }}>
          {check.message}
        </div>
      )}
      {check.resolutionHint && check.status !== 'ready' && (
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem', color: t.accent, marginTop: '2px', marginLeft: '18px' }}>
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
  const t = useTheme();
  const overallColor = colorFor(readiness.status, toneTextColor(t, 'success'), toneTextColor(t, 'warning'), t.danger, t.ink);
  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: overallColor, fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {STATUS_ICON[readiness.status]} Readiness: {readiness.status.replace('_', ' ')}
      </div>
      {readiness.checks.map(c => <CheckItem key={c.id} check={c} />)}
    </div>
  );
}
