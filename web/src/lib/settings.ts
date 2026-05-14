import { apiFetch, csrfFetch } from './api.js';

export interface SmtpSettings {
  host?: string;
  port?: number;
  user?: string;
  fromEmail?: string;
  secure?: boolean;
  hasPassword: boolean;
  configured: boolean;
}

export interface TelegramSettings {
  chatId?: string;
  hasBotToken: boolean;
  configured: boolean;
}

export interface NotificationSettings {
  smtp: SmtpSettings;
  telegram: TelegramSettings;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  return apiFetch<NotificationSettings>('/api/settings/notifications');
}

export async function saveSmtpSettings(input: Record<string, unknown>): Promise<SmtpSettings> {
  return csrfFetch<SmtpSettings>('/api/settings/notifications/smtp', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function saveTelegramSettings(input: Record<string, unknown>): Promise<TelegramSettings> {
  return csrfFetch<TelegramSettings>('/api/settings/notifications/telegram', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function testNotification(input: { channel: 'email' | 'telegram' }): Promise<{ ok: boolean; message?: string }> {
  return csrfFetch<{ ok: boolean; message?: string }>('/api/settings/notifications/test', {
    method: 'POST',
    body: JSON.stringify({ ...input, purpose: 'test' }),
  });
}
