import { useState, useEffect } from 'react';
import type { DashboardSummary } from '@aegis/shared';
import { getDashboard } from '../lib/dashboard';
import CountdownCard from '../components/dashboard/CountdownCard';
import SystemHealthCard from '../components/dashboard/SystemHealthCard';
import SwitchSummaryCards from '../components/dashboard/SwitchSummaryCards';

interface Phase3DashboardExtra {
  latestPacket: { id: number; version: number; storageObjectKey: string | null; lastVerifiedAt: string | null; createdAt: string } | null;
  activeReleaseRun: { id: number; status: string; triggeringSwitchId: number } | null;
  recentAuditEvents: { eventType: string; createdAt: string }[];
}

const T = { bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A', border: '#8AAAC8' };

const T2 = { surface: '#C8D9ED', border: '#8AAAC8', accent: '#1A6B9A', ink: '#0B1C2C' };

function Phase3StatusCards({ extra }: { extra: Phase3DashboardExtra }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
      {/* Packet card */}
      <div style={{ background: T2.surface, border: `1px solid ${T2.border}`, borderRadius: 6, padding: 14, fontFamily: 'monospace' }}>
        <div style={{ fontSize: '0.75rem', color: '#4A6B8A', marginBottom: 4 }}>Latest Packet</div>
        {extra.latestPacket ? (
          <>
            <div style={{ fontSize: '0.88rem', color: T2.ink }}>v{extra.latestPacket.version}</div>
            <div style={{ fontSize: '0.72rem', color: '#4A6B8A' }}>
              {extra.latestPacket.storageObjectKey ? '✓ Synced to storage' : '⚠ Local only'}
            </div>
            {extra.latestPacket.lastVerifiedAt && (
              <div style={{ fontSize: '0.68rem', color: '#7f8c8d' }}>
                Verified {new Date(extra.latestPacket.lastVerifiedAt).toLocaleDateString()}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: '0.82rem', color: '#c0392b' }}>No packet generated</div>
        )}
      </div>

      {/* Release run card */}
      <div style={{ background: T2.surface, border: `1px solid ${T2.border}`, borderRadius: 6, padding: 14, fontFamily: 'monospace' }}>
        <div style={{ fontSize: '0.75rem', color: '#4A6B8A', marginBottom: 4 }}>Active Release</div>
        {extra.activeReleaseRun ? (
          <>
            <div style={{ fontSize: '0.88rem', color: '#c0392b' }}>⚠ Release in progress</div>
            <div style={{ fontSize: '0.72rem', color: '#4A6B8A' }}>
              Run #{extra.activeReleaseRun.id} — {extra.activeReleaseRun.status}
            </div>
          </>
        ) : (
          <div style={{ fontSize: '0.82rem', color: '#27ae60' }}>✓ No active release</div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState<(DashboardSummary & Phase3DashboardExtra) | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  async function load() {
    try {
      const data = await getDashboard() as DashboardSummary & Phase3DashboardExtra;
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
    <div>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '2rem', fontWeight: 'bold', color: T.ink, marginBottom: '4px' }}>
          Welcome back, {summary.ownerName}
        </h1>
        {/* Alpha warning */}
        <div style={{
          fontFamily: 'monospace', fontSize: '0.75rem', color: '#8B6914',
          background: '#FFFBEB', border: '1px solid #F0C040',
          borderRadius: '4px', padding: '8px 12px', marginBottom: '16px', lineHeight: 1.5,
        }}>
          <strong>Alpha release.</strong> Verify your deployment, backups, notifications, and packet sync before relying on this system for critical information delivery.
        </div>

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

        {(summary.latestPacket !== undefined || summary.activeReleaseRun !== undefined) && (
          <Phase3StatusCards extra={summary} />
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
