import { useState, useEffect } from 'react';
import { get } from '../lib/api';
import OwnerSettings from '../components/settings/OwnerSettings';
import DeploymentSettings from '../components/settings/DeploymentSettings';
import NotificationSettings from '../components/settings/NotificationSettings';
import StorageSettings from '../components/settings/StorageSettings';
import RelaySettings from '../components/settings/RelaySettings';
import SecuritySettings from '../components/settings/SecuritySettings';
import PacketSettings from '../components/settings/PacketSettings';
import DangerZone from '../components/settings/DangerZone';

const T = {
  bg: '#DDE8F4', ink: '#0B1C2C', surface: '#C8D9ED', border: '#8AAAC8', accent: '#1A6B9A',
};

interface SettingsData {
  owner: { displayName: string; email: string; phone: string | null; timezone: string };
  deployment: { mode: string };
  notifications: {
    smtp: { configured: boolean; hasPassword: boolean; host?: string | null; port?: number | null; user?: string | null; fromEmail?: string | null; secure?: boolean };
    telegram: { configured: boolean; hasBotToken: boolean; chatId?: string | null };
  };
  storage: { s3Configured: boolean; bucket?: string | null; region?: string | null; prefix?: string | null; endpoint?: string | null; hasAccessKey: boolean; lastVerifiedAt?: string | null };
  relay: { enabled: boolean; relayUrl?: string | null; apiKeyConfigured: boolean; lastHeartbeatAt?: string | null };
  security: { totpEnabled: boolean };
  packets: { retentionDays: number | null };
}

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'deployment', label: 'Deployment' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'storage', label: 'Storage' },
  { id: 'relay', label: 'Relay' },
  { id: 'security', label: 'Security' },
  { id: 'packets', label: 'Packets' },
  { id: 'danger', label: 'Danger Zone' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const d = await get<SettingsData>('/api/settings');
      setData(d);
    } catch {
      setError('Failed to load settings');
    }
  }

  if (!data) {
    return (
      <div style={{ padding: '32px', fontFamily: 'monospace', color: T.ink }}>
        {error || 'Loading…'}
      </div>
    );
  }

  return (
    <div>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '2rem', fontWeight: 'bold', color: T.ink, marginBottom: '20px' }}>
          Settings
        </h1>

        {/* Tab bar */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '20px',
          borderBottom: `2px solid ${T.border}`, paddingBottom: '8px',
        }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontFamily: 'monospace', fontSize: '0.82rem', padding: '5px 12px',
                background: activeTab === tab.id ? T.ink : 'transparent',
                color: activeTab === tab.id ? T.bg : T.ink,
                border: `1.5px solid ${activeTab === tab.id ? T.ink : T.border}`,
                borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
                cursor: 'pointer',
                ...(tab.id === 'danger' && activeTab !== 'danger' ? { color: '#C0392B', borderColor: '#C0392B' } : {}),
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{
          padding: '20px', background: T.surface,
          border: `2px solid ${T.border}`,
          borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px',
        }}>
          <h2 style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '1.4rem', color: T.ink, margin: '0 0 16px' }}>
            {TABS.find(t => t.id === activeTab)?.label}
          </h2>

          {activeTab === 'profile' && (
            <OwnerSettings data={data.owner} onSaved={load} />
          )}
          {activeTab === 'deployment' && (
            <DeploymentSettings data={data.deployment} onSaved={load} />
          )}
          {activeTab === 'notifications' && (
            <NotificationSettings data={data.notifications} onSaved={load} />
          )}
          {activeTab === 'storage' && (
            <StorageSettings data={data.storage} onSaved={load} />
          )}
          {activeTab === 'relay' && (
            <RelaySettings data={data.relay} onSaved={load} />
          )}
          {activeTab === 'security' && (
            <SecuritySettings data={data.security} onSaved={load} />
          )}
          {activeTab === 'packets' && (
            <PacketSettings data={data.packets} onSaved={load} />
          )}
          {activeTab === 'danger' && (
            <DangerZone />
          )}
        </div>
      </div>
    </div>
  );
}
