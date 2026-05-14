import { useState, useEffect } from 'react';
import type { DashboardSummary } from '@aegis/shared';
import { getDashboard } from '../lib/dashboard';
import CountdownCard from '../components/dashboard/CountdownCard';
import SystemHealthCard from '../components/dashboard/SystemHealthCard';
import SwitchSummaryCards from '../components/dashboard/SwitchSummaryCards';

const T = { bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A', border: '#8AAAC8' };

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  async function load() {
    try {
      const data = await getDashboard();
      setSummary(data);
      setError('');
    } catch {
      setError('Failed to load dashboard');
    }
  }

  if (!summary) {
    return (
      <div style={{ padding: '32px', fontFamily: 'monospace', color: T.ink }}>
        {error || 'Loading…'}
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', background: T.bg, minHeight: '100vh' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '2rem', fontWeight: 'bold', color: T.ink, marginBottom: '4px' }}>
          Welcome back, {summary.ownerName}
        </h1>
        {error && (
          <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#C0392B', marginBottom: '12px' }}>{error}</div>
        )}

        {summary.activeSwitchCount === 0 ? (
          <div style={{
            padding: '40px', textAlign: 'center',
            border: `2px dashed ${T.border}`,
            borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px',
            fontFamily: 'monospace', color: '#4A6B8A',
            marginBottom: '20px',
          }}>
            <div style={{ fontSize: '1.1rem', marginBottom: '8px' }}>No active switches</div>
            <div style={{ fontSize: '0.8rem' }}>
              Go to <strong>Switches</strong> to create and arm your first deadman switch.
            </div>
          </div>
        ) : (
          <>
            <SwitchSummaryCards
              activeSwitchCount={summary.activeSwitchCount}
              warningSwitchCount={summary.warningSwitchCount}
              triggeredSwitchCount={summary.triggeredSwitchCount}
            />
            <CountdownCard nextSwitch={summary.nextSwitch} nextActionAt={summary.nextActionAt} />
          </>
        )}

        <SystemHealthCard health={summary.health} />

        {!summary.notificationsConfigured && (
          <div style={{
            marginTop: '16px', padding: '12px 16px',
            background: '#FFF3CD', border: '1.5px solid #8B6914',
            borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.82rem', color: '#5D4037',
          }}>
            ⚠ Notifications not configured — go to <strong>Settings</strong> to add SMTP or Telegram.
          </div>
        )}
      </div>
    </div>
  );
}
