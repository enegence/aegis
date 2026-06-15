import { useTheme } from '../../lib/theme';
import { toneTextColor } from '../../lib/themeStyles';

interface Props {
  activeSwitchCount: number;
  warningSwitchCount: number;
  triggeredSwitchCount: number;
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const t = useTheme();
  return (
    <div style={{ padding: '16px', background: t.surface, border: `2px solid ${color}`, borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px', textAlign: 'center' }}>
      <div style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '2.4rem', fontWeight: 'bold', color }}>{value}</div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.7rem', color: t.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}

export default function SwitchSummaryCards({ activeSwitchCount, warningSwitchCount, triggeredSwitchCount }: Props) {
  const t = useTheme();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
      <StatCard label="Active" value={activeSwitchCount} color={t.accent} />
      <StatCard label="Warning" value={warningSwitchCount} color={toneTextColor(t, 'warning')} />
      <StatCard label="Triggered" value={triggeredSwitchCount} color={t.danger} />
    </div>
  );
}
