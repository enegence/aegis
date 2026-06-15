import { useState, useEffect } from 'react';
import type { DashboardSummary } from '@aegis/shared';
import { getDashboard } from '../lib/dashboard';
import CountdownCard from '../components/dashboard/CountdownCard';
import SystemHealthCard from '../components/dashboard/SystemHealthCard';
import SwitchSummaryCards from '../components/dashboard/SwitchSummaryCards';
import { useTheme } from '../lib/theme';
import { toneBadgeStyle, toneTextColor } from '../lib/themeStyles';

interface Phase3DashboardExtra {
  latestPacket: { id: number; version: number; storageObjectKey: string | null; lastVerifiedAt: string | null; createdAt: string } | null;
  activeReleaseRun: { id: number; status: string; triggeringSwitchId: number } | null;
  recentAuditEvents: { eventType: string; createdAt: string }[];
}

function Phase3StatusCards({ extra }: { extra: Phase3DashboardExtra }) {
  const t = useTheme();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
      {/* Packet card */}
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 6, padding: 14, fontFamily: "'JetBrains Mono',monospace" }}>
        <div style={{ fontSize: '0.75rem', color: t.muted, marginBottom: 4 }}>Latest Packet</div>
        {extra.latestPacket ? (
          <>
            <div style={{ fontSize: '0.88rem', color: t.ink }}>v{extra.latestPacket.version}</div>
            <div style={{ fontSize: '0.72rem', color: t.muted }}>
              {extra.latestPacket.storageObjectKey ? '✓ Synced to storage' : '⚠ Local only'}
            </div>
            {extra.latestPacket.lastVerifiedAt && (
              <div style={{ fontSize: '0.68rem', color: t.muted }}>
                Verified {new Date(extra.latestPacket.lastVerifiedAt).toLocaleDateString()}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: '0.82rem', color: t.danger }}>No packet generated</div>
        )}
      </div>

      {/* Release run card */}
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 6, padding: 14, fontFamily: "'JetBrains Mono',monospace" }}>
        <div style={{ fontSize: '0.75rem', color: t.muted, marginBottom: 4 }}>Active Release</div>
        {extra.activeReleaseRun ? (
          <>
            <div style={{ fontSize: '0.88rem', color: t.danger }}>⚠ Release in progress</div>
            <div style={{ fontSize: '0.72rem', color: t.muted }}>
              Run #{extra.activeReleaseRun.id} — {extra.activeReleaseRun.status}
            </div>
          </>
        ) : (
          <div style={{ fontSize: '0.82rem', color: toneTextColor(t, 'success') }}>✓ No active release</div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const t = useTheme();
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
      <div style={{ padding: '32px', fontFamily: "'JetBrains Mono',monospace", color: t.ink }}>
        {error || 'Loading…'}
      </div>
    );
  }

  return (
    <div>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '2rem', fontWeight: 'bold', color: t.ink, marginBottom: '4px' }}>
          Welcome back, {summary.ownerName}
        </h1>
        {/* Alpha warning */}
        <div style={{ ...toneBadgeStyle(t, 'warning'), fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', borderRadius: '4px', padding: '8px 12px', marginBottom: '16px', lineHeight: 1.5 }}>
          <strong>Alpha release.</strong> Verify your deployment, backups, notifications, and packet sync before relying on this system for critical information delivery.
        </div>

        {error && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82rem', color: t.danger, marginBottom: '12px' }}>{error}</div>
        )}

        {summary.activeSwitchCount === 0 ? (
          <div style={{
            padding: '40px', textAlign: 'center',
            border: `2px dashed ${t.border}`,
            borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px',
            fontFamily: "'JetBrains Mono',monospace", color: t.muted,
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
          <div style={{ ...toneBadgeStyle(t, 'warning'), marginTop: '16px', padding: '12px 16px', borderRadius: '4px', fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82rem' }}>
            ⚠ Notifications not configured — go to <strong>Settings</strong> to add SMTP or Telegram.
          </div>
        )}
      </div>
    </div>
  );
}
