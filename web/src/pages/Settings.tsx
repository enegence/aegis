import { useState, useEffect } from 'react';
import { get } from '../lib/api';
import SmtpSettingsForm from '../components/settings/SmtpSettingsForm';
import TelegramSettingsForm from '../components/settings/TelegramSettingsForm';
import TestNotificationPanel from '../components/settings/TestNotificationPanel';

const T = {
  bg: '#DDE8F4', ink: '#0B1C2C', surface: '#C8D9ED', border: '#8AAAC8',
};

interface NotifStatus {
  smtp: {
    configured: boolean; hasPassword: boolean;
    host?: string; port?: number; user?: string; fromEmail?: string; secure?: boolean;
  };
  telegram: { configured: boolean; hasBotToken: boolean; chatId?: string };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '20px', background: T.surface,
      border: `2px solid ${T.border}`,
      borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px',
      marginBottom: '20px',
    }}>
      <h2 style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '1.4rem', color: T.ink, margin: '0 0 14px' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function Settings() {
  const [status, setStatus] = useState<NotifStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await get<NotifStatus>('/api/settings/notifications');
      setStatus(data);
    } catch {
      setError('Failed to load settings');
    }
  }

  if (!status) {
    return (
      <div style={{ padding: '32px', fontFamily: 'monospace', color: T.ink }}>
        {error || 'Loading…'}
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', background: T.bg, minHeight: '100vh' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '2rem', fontWeight: 'bold', color: T.ink, marginBottom: '20px' }}>
          Settings
        </h1>

        <Section title="SMTP (Email)">
          <SmtpSettingsForm status={status.smtp} onSaved={load} />
        </Section>

        <Section title="Telegram">
          <TelegramSettingsForm status={status.telegram} onSaved={load} />
        </Section>

        <Section title="Test Notification">
          <p style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#4A6B8A', marginTop: 0, marginBottom: '12px' }}>
            Send a test message to verify your notification provider is working.
          </p>
          <TestNotificationPanel />
        </Section>
      </div>
    </div>
  );
}
