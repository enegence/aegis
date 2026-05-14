import { useState, useEffect } from 'react';
import { get, post } from '../lib/api';

const T = { bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A', surface: '#C8D9ED', border: '#8AAAC8' };

interface ReleaseStatus {
  activeRun: {
    id: number;
    triggeringSwitchId: number;
    status: string;
    activePacketId: number | null;
    currentContactClaimId: number | null;
    suppressedSwitchIds: number[];
    startedAt: string;
  } | null;
  currentClaim: {
    id: number;
    status: string;
    contactId: number;
    notifiedAt: string | null;
    expiresAt: string;
  } | null;
  claimCount: number;
}

interface RunListItem {
  id: number;
  triggeringSwitchId: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 20, marginBottom: 16, fontFamily: 'monospace' }}>
      <h3 style={{ margin: '0 0 12px', color: T.accent, fontSize: '0.95rem' }}>{title}</h3>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: '#1A6B9A', cascade_active: '#8e44ad', completed: '#27ae60',
    cancelled: '#7f8c8d', failed: '#c0392b',
  };
  return (
    <span style={{
      background: colors[status] ?? '#7f8c8d', color: '#fff',
      padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem',
    }}>
      {status}
    </span>
  );
}

export default function Release() {
  const [status, setStatus] = useState<ReleaseStatus | null>(null);
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [simResult, setSimResult] = useState<{ valid: boolean; issues: string[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        get<ReleaseStatus>('/api/release/status'),
        get<{ runs: RunListItem[] }>('/api/release/runs'),
      ]);
      setStatus(s);
      setRuns(r.runs.slice().reverse()); // most recent first
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function cancelRun(id: number) {
    setActionMsg('');
    try {
      await post(`/api/release/runs/${id}/cancel`, {});
      setActionMsg('Release run cancelled.');
      await load();
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : 'Cancel failed');
    }
  }

  async function simulate() {
    setSimResult(null);
    try {
      const res = await post<{ valid: boolean; issues: string[] }>('/api/release/simulate', {});
      setSimResult(res);
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : 'Simulate failed');
    }
  }

  if (loading) return <div style={{ padding: 32, fontFamily: 'monospace', color: T.ink }}>Loading…</div>;
  if (error) return <div style={{ padding: 32, fontFamily: 'monospace', color: '#c0392b' }}>{error}</div>;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 760, fontFamily: 'monospace', color: T.ink }}>
      <h2 style={{ margin: '0 0 20px', color: T.accent }}>Release Management</h2>

      {actionMsg && (
        <p style={{ background: '#fde8e8', color: '#c0392b', padding: '8px 12px', borderRadius: 4, marginBottom: 16 }}>
          {actionMsg}
        </p>
      )}

      {/* Active release run */}
      <Card title="Active Release Run">
        {status?.activeRun ? (
          <>
            <p style={{ margin: '0 0 6px' }}>
              Run #{status.activeRun.id} — <StatusBadge status={status.activeRun.status} />
            </p>
            <p style={{ margin: '0 0 4px', fontSize: '0.82rem', color: '#4A6B8A' }}>
              Triggering switch: #{status.activeRun.triggeringSwitchId}
            </p>
            <p style={{ margin: '0 0 4px', fontSize: '0.82rem', color: '#4A6B8A' }}>
              Started: {new Date(status.activeRun.startedAt).toLocaleString()}
            </p>
            {status.currentClaim && (
              <p style={{ margin: '4px 0', fontSize: '0.82rem', color: '#4A6B8A' }}>
                Current claim: #{status.currentClaim.id} ({status.currentClaim.status}) —
                expires {new Date(status.currentClaim.expiresAt).toLocaleString()}
              </p>
            )}
            {status.activeRun.suppressedSwitchIds.length > 0 && (
              <p style={{ margin: '4px 0', fontSize: '0.82rem', color: '#4A6B8A' }}>
                Suppressed switches: {status.activeRun.suppressedSwitchIds.join(', ')}
              </p>
            )}
            <button
              onClick={() => cancelRun(status.activeRun!.id)}
              style={{
                marginTop: 10, background: '#c0392b', color: '#fff', border: 'none',
                borderRadius: 4, padding: '6px 14px', fontFamily: 'monospace', fontSize: '0.82rem', cursor: 'pointer',
              }}
            >
              Cancel Release Run
            </button>
          </>
        ) : (
          <p style={{ color: '#4A6B8A', margin: 0 }}>No active release run.</p>
        )}
      </Card>

      {/* Simulate */}
      <Card title="Release Simulation">
        <p style={{ margin: '0 0 10px', fontSize: '0.84rem', color: '#4A6B8A' }}>
          Validate your switch configuration without sending real notifications.
        </p>
        <button
          onClick={simulate}
          style={{
            background: T.accent, color: '#fff', border: 'none', borderRadius: 4,
            padding: '7px 14px', fontFamily: 'monospace', fontSize: '0.82rem', cursor: 'pointer',
          }}
        >
          Run simulation
        </button>
        {simResult && (
          <div style={{ marginTop: 12, padding: 10, background: simResult.valid ? '#e8f5e9' : '#fde8e8', borderRadius: 4, fontSize: '0.82rem' }}>
            <strong style={{ color: simResult.valid ? '#27ae60' : '#c0392b' }}>
              {simResult.valid ? '✓ Configuration valid' : '✗ Issues found'}
            </strong>
            {simResult.issues.map((iss, i) => (
              <p key={i} style={{ margin: '4px 0', color: '#c0392b' }}>• {iss}</p>
            ))}
          </div>
        )}
      </Card>

      {/* Run history */}
      <Card title="Run History">
        {runs.length === 0 ? (
          <p style={{ color: '#4A6B8A', margin: 0 }}>No release runs yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, color: '#4A6B8A' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>ID</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Switch</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '4px 8px' }}>#{r.id}</td>
                  <td style={{ padding: '4px 8px' }}>#{r.triggeringSwitchId}</td>
                  <td style={{ padding: '4px 8px' }}><StatusBadge status={r.status} /></td>
                  <td style={{ padding: '4px 8px' }}>{new Date(r.startedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
