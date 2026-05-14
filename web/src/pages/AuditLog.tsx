import { useState, useEffect } from 'react';
import { get } from '../lib/api';

const T = { bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A', surface: '#C8D9ED', border: '#8AAAC8' };

interface AuditEvent {
  id: number;
  switchId: number | null;
  eventType: string;
  actorType: string;
  actorId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  switch_armed: '#1A6B9A',
  switch_cancelled: '#7f8c8d',
  release_run_created: '#8e44ad',
  cascade_started: '#8e44ad',
  cascade_escalated: '#e67e22',
  cascade_failed_all_contacts_exhausted: '#c0392b',
  claim_opened: '#1A6B9A',
  claim_accepted: '#27ae60',
  claim_acknowledged: '#27ae60',
  release_run_cancelled: '#7f8c8d',
  packet_generated: '#2980b9',
  packet_uploaded: '#2980b9',
};

export default function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filtered, setFiltered] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterActor, setFilterActor] = useState('');

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let evts = events;
    if (filterType) evts = evts.filter((e) => e.eventType.includes(filterType));
    if (filterActor) evts = evts.filter((e) => e.actorType === filterActor);
    setFiltered(evts);
  }, [events, filterType, filterActor]);

  async function load() {
    setLoading(true);
    try {
      const data = await get<{ events: AuditEvent[] }>('/api/audit-log?limit=200');
      setEvents(data.events);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    window.open('/api/audit-log/export', '_blank');
  }

  if (loading) return <div style={{ padding: 32, fontFamily: 'monospace', color: T.ink }}>Loading…</div>;
  if (error) return <div style={{ padding: 32, fontFamily: 'monospace', color: '#c0392b' }}>{error}</div>;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900, fontFamily: 'monospace', color: T.ink }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, color: T.accent }}>Audit Log</h2>
        <button
          onClick={handleExport}
          style={{
            background: T.accent, color: '#fff', border: 'none', borderRadius: 4,
            padding: '6px 14px', fontFamily: 'monospace', fontSize: '0.82rem', cursor: 'pointer',
          }}
        >
          Export JSON
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Filter by event type…"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: '0.82rem', border: `1px solid ${T.border}`, borderRadius: 4, flex: 1, minWidth: 200 }}
        />
        <select
          value={filterActor}
          onChange={(e) => setFilterActor(e.target.value)}
          style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: '0.82rem', border: `1px solid ${T.border}`, borderRadius: 4 }}
        >
          <option value="">All actors</option>
          <option value="owner">owner</option>
          <option value="system">system</option>
          <option value="contact">contact</option>
        </select>
        <button
          onClick={() => { setFilterType(''); setFilterActor(''); }}
          style={{ background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 4, padding: '5px 10px', fontFamily: 'monospace', fontSize: '0.82rem', cursor: 'pointer', color: '#4A6B8A' }}
        >
          Clear
        </button>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: '#4A6B8A' }}>No events found.</p>
      ) : (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: T.border, color: T.ink }}>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Time</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Event</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Actor</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Switch</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((evt) => (
                <tr key={evt.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: '#4A6B8A' }}>
                    {new Date(evt.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <span style={{
                      background: EVENT_TYPE_COLORS[evt.eventType] ?? '#7f8c8d',
                      color: '#fff', padding: '1px 6px', borderRadius: 3, fontSize: '0.72rem',
                    }}>
                      {evt.eventType}
                    </span>
                  </td>
                  <td style={{ padding: '6px 10px', color: '#4A6B8A' }}>{evt.actorType}</td>
                  <td style={{ padding: '6px 10px', color: '#4A6B8A' }}>
                    {evt.switchId != null ? `#${evt.switchId}` : '—'}
                  </td>
                  <td style={{ padding: '6px 10px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.ink }}>
                    {evt.metadata ? JSON.stringify(evt.metadata) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 12, fontSize: '0.75rem', color: '#4A6B8A' }}>
        Showing {filtered.length} of {events.length} events. All metadata is redacted of PII.
      </p>
    </div>
  );
}
