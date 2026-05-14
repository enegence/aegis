const T = { ink: '#0B1C2C', accent: '#1A6B9A', surface: '#C8D9ED', border: '#8AAAC8', muted: '#4A6B8A' };

interface Props {
  activeSwitchCount: number;
  warningSwitchCount: number;
  triggeredSwitchCount: number;
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      padding: '16px', background: T.surface,
      border: `2px solid ${color}`,
      borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px',
      textAlign: 'center',
    }}>
      <div style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '2.4rem', fontWeight: 'bold', color }}>{value}</div>
      <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}

export default function SwitchSummaryCards({ activeSwitchCount, warningSwitchCount, triggeredSwitchCount }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
      <StatCard label="Active" value={activeSwitchCount} color={T.accent} />
      <StatCard label="Warning" value={warningSwitchCount} color="#8B6914" />
      <StatCard label="Triggered" value={triggeredSwitchCount} color="#C0392B" />
    </div>
  );
}
