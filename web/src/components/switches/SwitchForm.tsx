import { useState, useEffect } from 'react';
import { get, post, put } from '../../lib/api';
import type { Switch, Contact, EstateItem } from '@aegis/shared';

const T = {
  bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A',
  surface: '#C8D9ED', border: '#8AAAC8', danger: '#C0392B',
};

const DEPLOYMENT_COPY: Record<string, string> = {
  vault: 'Vault Mode stores and organizes your legacy information locally. It does not guarantee automated release if this machine is offline, destroyed, inaccessible, or unable to notify your contacts.',
  dead_drop: 'Dead Drop mode uploads an encrypted packet to S3-compatible storage. Your release material survives server loss, but automated notification may still require this host.',
  relay_monitoring: 'Relay Monitoring lets Aegis Relay detect when you go offline and send alerts. Final release may still require your local host.',
  relay_escrow: 'Relay Escrow enables Aegis Relay to execute your release policy if you remain offline beyond your threshold. Requires explicit trust acknowledgement.',
  hosted: 'Hosted mode delegates full release management to Aegis DMS servers. No local host required.',
};

interface Props {
  existing?: Switch;
  onSaved: (sw: Switch) => void;
  onCancel: () => void;
}

const inputStyle = {
  width: '100%', background: T.bg, borderColor: T.border,
  color: T.ink, padding: '6px 10px', borderRadius: '4px',
  fontFamily: 'monospace', fontSize: '0.85rem', border: `1px solid ${T.border}`,
  outline: 'none', boxSizing: 'border-box' as const,
};

const labelStyle = {
  fontFamily: 'monospace', fontSize: '0.75rem', color: '#4A6B8A',
  textTransform: 'uppercase' as const, letterSpacing: '0.04em',
  display: 'block', marginBottom: '4px',
};

export default function SwitchForm({ existing, onSaved, onCancel }: Props) {
  const [name, setName] = useState(existing?.name ?? '');
  const [mode, setMode] = useState<'trip' | 'heartbeat'>(existing?.mode ?? 'heartbeat');
  const [deploymentMode, setDeploymentMode] = useState<string>(existing?.deploymentMode ?? 'vault');
  const [triggerAt, setTriggerAt] = useState(
    existing?.triggerAt ? existing.triggerAt.slice(0, 16) : ''
  );
  const [heartbeatIntervalDays, setHeartbeatIntervalDays] = useState(
    String(existing?.heartbeatIntervalDays ?? 7)
  );
  const [warningWindowDays, setWarningWindowDays] = useState(
    String(existing?.warningWindowDays ?? 3)
  );
  const [gracePeriodHours, setGracePeriodHours] = useState(
    String(existing?.gracePeriodHours ?? 72)
  );
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>(
    existing?.selectedContactIds ?? []
  );
  const [selectedEstateItemIds, setSelectedEstateItemIds] = useState<number[]>(
    existing?.selectedEstateItemIds ?? []
  );
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [estateItems, setEstateItems] = useState<EstateItem[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    get<{ contacts: Contact[] }>('/api/contacts').then(r => setContacts(r.contacts)).catch(() => {});
    get<{ items: EstateItem[] }>('/api/estate-items').then(r => setEstateItems(r.items)).catch(() => {});
  }, []);

  function toggleId<T extends number>(ids: T[], id: T): T[] {
    return ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const payload = {
      name,
      mode,
      deploymentMode,
      triggerAt: mode === 'trip' && triggerAt ? triggerAt : undefined,
      heartbeatIntervalDays: mode === 'heartbeat' ? parseInt(heartbeatIntervalDays) : undefined,
      warningWindowDays: parseInt(warningWindowDays),
      gracePeriodHours: parseInt(gracePeriodHours),
      selectedContactIds,
      selectedEstateItemIds,
    };
    try {
      const saved = existing
        ? await put<Switch>(`/api/switches/${existing.id}`, payload)
        : await post<Switch>('/api/switches', payload);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Primary switch" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Mode</label>
          <select style={inputStyle} value={mode} onChange={e => setMode(e.target.value as 'trip' | 'heartbeat')}>
            <option value="heartbeat">Heartbeat</option>
            <option value="trip">Trip (date-based)</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Deployment mode</label>
          <select style={inputStyle} value={deploymentMode} onChange={e => setDeploymentMode(e.target.value)}>
            <option value="vault">Vault</option>
            <option value="dead_drop">Dead Drop</option>
            <option value="relay_monitoring">Relay Monitoring</option>
            <option value="relay_escrow">Relay Escrow</option>
            <option value="hosted">Hosted</option>
          </select>
        </div>
      </div>

      <div style={{
        fontFamily: 'monospace', fontSize: '0.75rem', color: '#4A6B8A',
        padding: '8px 10px', background: '#B8CBE0',
        borderRadius: '4px', borderLeft: `3px solid ${T.accent}`,
      }}>
        {DEPLOYMENT_COPY[deploymentMode]}
      </div>

      {mode === 'trip' && (
        <div>
          <label style={labelStyle}>Trigger date/time</label>
          <input style={inputStyle} type="datetime-local" value={triggerAt} onChange={e => setTriggerAt(e.target.value)} required />
        </div>
      )}

      {mode === 'heartbeat' && (
        <div>
          <label style={labelStyle}>Heartbeat interval (days)</label>
          <input style={inputStyle} type="number" min={1} max={365} value={heartbeatIntervalDays}
            onChange={e => setHeartbeatIntervalDays(e.target.value)} required />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Warning window (days)</label>
          <input style={inputStyle} type="number" min={0} value={warningWindowDays}
            onChange={e => setWarningWindowDays(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Grace period (hours)</label>
          <input style={inputStyle} type="number" min={0} value={gracePeriodHours}
            onChange={e => setGracePeriodHours(e.target.value)} />
        </div>
      </div>

      {contacts.length > 0 && (
        <div>
          <label style={labelStyle}>Contacts to notify</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {contacts.map(c => (
              <label key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                fontFamily: 'monospace', fontSize: '0.8rem', color: T.ink,
                cursor: 'pointer',
                padding: '3px 8px', borderRadius: '4px',
                background: selectedContactIds.includes(c.id) ? T.accent + '22' : T.bg,
                border: `1px solid ${selectedContactIds.includes(c.id) ? T.accent : T.border}`,
              }}>
                <input
                  type="checkbox"
                  checked={selectedContactIds.includes(c.id)}
                  onChange={() => setSelectedContactIds(toggleId(selectedContactIds, c.id))}
                  style={{ accentColor: T.accent }}
                />
                {c.fullName}
              </label>
            ))}
          </div>
        </div>
      )}

      {estateItems.length > 0 && (
        <div>
          <label style={labelStyle}>Estate items to include</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {estateItems.map(item => (
              <label key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                fontFamily: 'monospace', fontSize: '0.8rem', color: T.ink,
                cursor: 'pointer',
                padding: '3px 8px', borderRadius: '4px',
                background: selectedEstateItemIds.includes(item.id) ? T.accent + '22' : T.bg,
                border: `1px solid ${selectedEstateItemIds.includes(item.id) ? T.accent : T.border}`,
              }}>
                <input
                  type="checkbox"
                  checked={selectedEstateItemIds.includes(item.id)}
                  onChange={() => setSelectedEstateItemIds(toggleId(selectedEstateItemIds, item.id))}
                  style={{ accentColor: T.accent }}
                />
                {item.category}: {item.title}
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: T.danger }}>{error}</div>}

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={{
          fontFamily: 'monospace', fontSize: '0.85rem', padding: '6px 16px',
          background: T.surface, border: `1.5px solid ${T.border}`,
          borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
          color: T.ink, cursor: 'pointer',
        }}>Cancel</button>
        <button type="submit" disabled={saving} style={{
          fontFamily: 'monospace', fontSize: '0.85rem', padding: '6px 16px',
          background: saving ? T.border : T.accent, color: '#fff',
          border: `1.5px solid ${saving ? T.border : T.accent}`,
          borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
          cursor: saving ? 'not-allowed' : 'pointer',
        }}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Create switch'}</button>
      </div>
    </form>
  );
}
