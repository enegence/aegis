import type { NotificationRequest, NotificationResult } from './smtp.js';

export type { NotificationRequest, NotificationResult };

export interface TelegramConfig {
  botToken: string;   // never log this
  chatId: string;
}

interface TelegramApiResponse {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
}

function sanitizeTelegramError(err: unknown, config: TelegramConfig): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(new RegExp(config.botToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]')
    .replace(new RegExp(config.chatId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]');
}

export async function sendTelegramNotification(
  config: TelegramConfig,
  request: NotificationRequest,
): Promise<NotificationResult> {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: request.body,
        parse_mode: 'HTML',
      }),
    });

    const data = (await response.json()) as TelegramApiResponse;

    if (!response.ok || !data.ok) {
      return {
        ok: false,
        error: `Telegram API error: ${data.description ?? 'unknown error'}`,
      };
    }

    return {
      ok: true,
      externalId: String(data.result?.message_id ?? ''),
    };
  } catch (err) {
    return { ok: false, error: sanitizeTelegramError(err, config) };
  }
}

export async function testTelegramConnection(
  config: TelegramConfig,
): Promise<{ ok: boolean; message?: string }> {
  const url = `https://api.telegram.org/bot${config.botToken}/getMe`;

  try {
    const response = await fetch(url);
    const data = (await response.json()) as TelegramApiResponse;

    if (!response.ok || !data.ok) {
      return { ok: false, message: `Telegram API error: ${data.description ?? 'unknown error'}` };
    }

    return { ok: true, message: 'Telegram bot connection verified' };
  } catch (err) {
    return { ok: false, message: sanitizeTelegramError(err, config) };
  }
}
