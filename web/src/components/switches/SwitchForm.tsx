import { useState, useEffect } from 'react';
import { get, post, put } from '../../lib/api';
import type { Switch, Contact, EstateItem } from '@aegis/shared';
import { useTheme } from '../../lib/theme';
import { createActionButtonStyle, createInputStyle, createLabelStyle, toneTextColor } from '../../lib/themeStyles';

const DEPLOYMENT_COPY: Record<string, string> = {
  vault: 'Vault Mode stores and organizes your legacy information locally. It does not guarantee automated release if this machine is offline, destroyed, inaccessible, or unable to notify your contacts.',
  dead_drop: 'Packet Mirror uploads an encrypted packet to S3-compatible storage. Your release material survives server loss, but automated notification may still require this host.',
  relay_monitoring: 'Relay Monitoring lets Aegis Relay detect when you go offline and send alerts. Final release may still require your local host.',
  relay_escrow: 'Relay Escrow enables Aegis Relay to execute your release policy if you remain offline beyond your threshold. Requires explicit trust acknowledgement.',
  hosted: 'Hosted mode delegates full release management to Aegis DMS servers. No local host required.',
};

interface Props {
  existing?: Switch;
  onSaved: (sw: Switch) => void;
  onCancel: () => void;
}

export default function SwitchForm({ existing, onSaved, onCancel }: Props) {
  const t = useTheme();
  const inputStyle = createInputStyle(t);
  const labelStyle = createLabelStyle(t);
  const [name, setName] = useState(existing?.name ?? '');
  const [mode, setMode] = useState<'trip' | 'heartbeat'>(existing?.mode ?? 'heartbeat');
  const [deploymentMode, setDeploymentMode] = useState<string>(existing?.deploymentMode ?? 'vault');
  const [triggerAt, setTriggerAt] = useState(existing?.triggerAt ? existing.triggerAt.slice(0, 16) : '');
  const [heartbeatIntervalDays, setHeartbeatIntervalDays] = useState(String(existing?.heartbeatIntervalDays ?? 7));
  const [warningWindowDays, setWarningWindowDays] = useState(String(existing?.warningWindowDays ?? 3));
  const [gracePeriodHours, setGracePeriodHours] = useState(String(existing?.gracePeriodHours ?? 72));
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>(existing?.selectedContactIds ?? []);
  const [selectedEstateItemIds, setSelectedEstateItemIds] = useState<number[]>(existing?.selectedEstateItemIds ?? []);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [estateItems, setEstateItems] = useState<EstateItem[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([get<Contact[]>('/api/contacts'), get<EstateItem[]>('/api/estate-items')])
      .then(([contactRows, estateRows]) => {
        setContacts(Array.isArray(contactRows) ? contactRows : []);
        setEstateItems(Array.isArray(estateRows) ? estateRows : []);
      })
      .catch(() => {
        setContacts([]);
        setEstateItems([]);
      });
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
      triggerAt: mode === 'trip' && triggerAt ? new Date(triggerAt).toISOString() : undefined,
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
        <label htmlFor="switch-name" style={labelStyle}>Name</label>
        <input id="switch-name" style={inputStyle} value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Primary switch" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label htmlFor="switch-mode" style={labelStyle}>Mode</label>
          <select id="switch-mode" style={inputStyle} value={mode} onChange={e => setMode(e.target.value as 'trip' | 'heartbeat')}>
            <option value="heartbeat">Heartbeat</option>
            <option value="trip">Trip (date-based)</option>
          </select>
        </div>
        <div>
          <label htmlFor="switch-deployment-mode" style={labelStyle}>Deployment mode</label>
          <select id="switch-deployment-mode" style={inputStyle} value={deploymentMode} onChange={e => setDeploymentMode(e.target.value)}>
            <option value="vault">Vault</option>
            <option value="dead_drop">Packet Mirror</option>
            <option value="relay_monitoring">Relay Monitoring</option>
            <option value="relay_escrow">Relay Escrow</option>
            <option value="hosted">Hosted</option>
          </select>
        </div>
      </div>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', color: t.muted, padding: '8px 10px', background: t.surface, borderRadius: '4px', borderLeft: `3px solid ${t.accent}` }}>
        {DEPLOYMENT_COPY[deploymentMode]}
      </div>

      {mode === 'trip' && (
        <div>
          <label htmlFor="switch-trigger-at" style={labelStyle}>Trigger date/time</label>
          <input id="switch-trigger-at" style={inputStyle} type="datetime-local" value={triggerAt} onChange={e => setTriggerAt(e.target.value)} required />
        </div>
      )}

      {mode === 'heartbeat' && (
        <div>
          <label htmlFor="switch-heartbeat-interval-days" style={labelStyle}>Heartbeat interval (days)</label>
          <input id="switch-heartbeat-interval-days" style={inputStyle} type="number" min={1} max={365} value={heartbeatIntervalDays} onChange={e => setHeartbeatIntervalDays(e.target.value)} required />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label htmlFor="switch-warning-window-days" style={labelStyle}>Warning window (days)</label>
          <input id="switch-warning-window-days" style={inputStyle} type="number" min={0} value={warningWindowDays} onChange={e => setWarningWindowDays(e.target.value)} />
        </div>
        <div>
          <label htmlFor="switch-grace-period-hours" style={labelStyle}>Grace period (hours)</label>
          <input id="switch-grace-period-hours" style={inputStyle} type="number" min={1} value={gracePeriodHours} onChange={e => setGracePeriodHours(e.target.value)} />
        </div>
      </div>

      {contacts.length > 0 && (
        <div>
          <div style={labelStyle}>Contacts to notify</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {contacts.map(c => {
              const active = selectedContactIds.includes(c.id);
              return (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: "'Inter',system-ui,sans-serif", fontSize: '0.8rem', color: t.ink, cursor: 'pointer', padding: '3px 8px', borderRadius: '4px', background: active ? `${t.accent}22` : t.bg, border: `1px solid ${active ? t.accent : t.border}` }}>
                  <input type="checkbox" checked={active} onChange={() => setSelectedContactIds(toggleId(selectedContactIds, c.id))} style={{ accentColor: t.accent }} />
                  {c.fullName}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {estateItems.length > 0 && (
        <div>
          <div style={labelStyle}>Estate items to include</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {estateItems.map(item => {
              const active = selectedEstateItemIds.includes(item.id);
              return (
                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: "'Inter',system-ui,sans-serif", fontSize: '0.8rem', color: t.ink, cursor: 'pointer', padding: '3px 8px', borderRadius: '4px', background: active ? `${t.accent}22` : t.bg, border: `1px solid ${active ? t.accent : t.border}` }}>
                  <input type="checkbox" checked={active} onChange={() => setSelectedEstateItemIds(toggleId(selectedEstateItemIds, item.id))} style={{ accentColor: t.accent }} />
                  {item.category}: {item.title}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {error && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: t.danger }}>{error}</div>}

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={createActionButtonStyle(t, 'secondary', false)}>Cancel</button>
        <button type="submit" disabled={saving} style={createActionButtonStyle(t, 'primary', saving)}>
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Create switch'}
        </button>
      </div>
    </form>
  );
}
