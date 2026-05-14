import SmtpSettingsForm from './SmtpSettingsForm';
import TelegramSettingsForm from './TelegramSettingsForm';
import TestNotificationPanel from './TestNotificationPanel';

const T = { ink: '#0B1C2C', surface: '#C8D9ED', border: '#8AAAC8' };

interface SmtpStatus {
  configured: boolean;
  hasPassword: boolean;
  host?: string | null;
  port?: number | null;
  user?: string | null;
  fromEmail?: string | null;
  secure?: boolean;
}

interface TelegramStatus {
  configured: boolean;
  hasBotToken: boolean;
  chatId?: string | null;
}

interface NotificationsData {
  smtp: SmtpStatus;
  telegram: TelegramStatus;
}

interface Props {
  data: NotificationsData;
  onSaved: () => void;
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '16px', background: T.surface, border: `1.5px solid ${T.border}`, borderRadius: '3px 8px 3px 8px / 8px 3px 8px 3px', marginBottom: '14px' }}>
      <h3 style={{ fontFamily: "'Caveat', cursive", fontSize: '1.1rem', fontWeight: 'bold', color: T.ink, margin: '0 0 12px' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function NotificationSettings({ data, onSaved }: Props) {
  return (
    <div>
      <SubSection title="Email (SMTP)">
        <SmtpSettingsForm status={{
          ...data.smtp,
          host: data.smtp.host ?? undefined,
          user: data.smtp.user ?? undefined,
          fromEmail: data.smtp.fromEmail ?? undefined,
          port: data.smtp.port ?? undefined,
        }} onSaved={onSaved} />
      </SubSection>
      <SubSection title="Telegram">
        <TelegramSettingsForm status={{
          ...data.telegram,
          chatId: data.telegram.chatId ?? undefined,
        }} onSaved={onSaved} />
      </SubSection>
      <SubSection title="Test Notification">
        <p style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#4A6B8A', marginTop: 0, marginBottom: '12px' }}>
          Send a test message to verify your notification provider is working.
        </p>
        <TestNotificationPanel />
      </SubSection>
    </div>
  );
}
