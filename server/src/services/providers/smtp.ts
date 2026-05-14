import nodemailer from 'nodemailer';

export interface NotificationRequest {
  to: string;         // recipient email or chat ID
  subject?: string;   // email subject
  body: string;       // message body (plain text)
  purpose: 'test' | 'reminder' | 'warning' | 'triggered';
  switchId?: number;
  contactId?: number;
}

export interface NotificationResult {
  ok: boolean;
  externalId?: string;
  error?: string;     // sanitized, no PII
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;  // never log this
  fromEmail: string;
  secure?: boolean;
}

function sanitizeSmtpError(err: unknown, config: SmtpConfig): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Remove any credentials or addresses from error message
  return raw
    .replace(new RegExp(config.password.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]')
    .replace(new RegExp(config.user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]');
}

export async function sendSmtpNotification(
  config: SmtpConfig,
  request: NotificationRequest,
): Promise<NotificationResult> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? config.port === 465,
    auth: {
      user: config.user,
      pass: config.password,
    },
  });

  try {
    const info = await transport.sendMail({
      from: config.fromEmail,
      to: request.to,
      subject: request.subject ?? `Aegis notification: ${request.purpose}`,
      text: request.body,
    });
    return { ok: true, externalId: info.messageId };
  } catch (err) {
    return { ok: false, error: sanitizeSmtpError(err, config) };
  }
}

export async function testSmtpConnection(
  config: SmtpConfig,
): Promise<{ ok: boolean; message?: string }> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? config.port === 465,
    auth: {
      user: config.user,
      pass: config.password,
    },
  });

  try {
    await transport.verify();
    return { ok: true, message: 'SMTP connection verified' };
  } catch (err) {
    return { ok: false, message: sanitizeSmtpError(err, config) };
  }
}
