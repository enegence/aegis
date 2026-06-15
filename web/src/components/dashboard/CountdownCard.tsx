import { useState, useEffect } from 'react';
import type { Switch } from '@aegis/shared';
import { useTheme } from '../../lib/theme';
import { toneTextColor } from '../../lib/themeStyles';

function pad(n: number) { return String(n).padStart(2, '0'); }

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

interface Props {
  nextSwitch: Switch | null;
  nextActionAt: string | null;
}

export default function CountdownCard({ nextSwitch, nextActionAt }: Props) {
  const t = useTheme();
  const [remaining, setRemaining] = useState<number>(() => nextActionAt ? new Date(nextActionAt).getTime() - Date.now() : 0);

  useEffect(() => {
    if (!nextActionAt) return;
    const target = new Date(nextActionAt).getTime();
    const tick = () => setRemaining(target - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextActionAt]);

  if (!nextSwitch || !nextActionAt) {
    return (
      <div style={{ padding: '24px', background: t.surface, border: `2px dashed ${t.border}`, borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px', textAlign: 'center', fontFamily: "'JetBrains Mono',monospace", color: t.muted, marginBottom: '20px' }}>
        No active switches
      </div>
    );
  }

  const isPast = remaining <= 0;
  const accentColor = nextSwitch.status === 'warning' ? toneTextColor(t, 'warning') : t.accent;
  const label = nextSwitch.mode === 'heartbeat' ? (nextSwitch.status === 'warning' ? 'Grace expires' : 'Check-in due') : 'Trigger';

  return (
    <div style={{ padding: '24px', background: t.surface, border: `2px solid ${accentColor}`, borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px', marginBottom: '20px', textAlign: 'center' }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.7rem', color: t.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Courier New', monospace", fontSize: '2.8rem', fontWeight: 'bold', color: isPast ? t.danger : accentColor, letterSpacing: '0.04em', lineHeight: 1.1 }}>
        {isPast ? 'OVERDUE' : formatCountdown(remaining)}
      </div>
      <div style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '1rem', color: t.ink, marginTop: '6px' }}>
        {nextSwitch.name}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.7rem', color: t.muted, marginTop: '2px' }}>
        {new Date(nextActionAt).toLocaleString()}
      </div>
    </div>
  );
}
