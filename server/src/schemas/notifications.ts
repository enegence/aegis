import { z } from 'zod';

export const SmtpSettingsInputSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  user: z.string().min(1),
  password: z.string().min(1),
  fromEmail: z.string().email(),
  secure: z.boolean().default(false),
});

// Response shape — never expose raw password
export const SmtpSettingsResponseSchema = z.object({
  host: z.string(),
  port: z.number().int(),
  user: z.string(),
  hasPassword: z.boolean(),
  fromEmail: z.string(),
  secure: z.boolean(),
});

export const TelegramSettingsInputSchema = z.object({
  botToken: z.string().min(1),
  chatId: z.string().min(1),
});

// Response shape — never expose raw botToken
export const TelegramSettingsResponseSchema = z.object({
  hasBotToken: z.boolean(),
  chatId: z.string(),
});

export const TestNotificationInputSchema = z.object({
  channel: z.enum(['email', 'telegram']),
  purpose: z.literal('test'),
});

export const NotificationChannelPreferenceSchema = z.object({
  channel: z.enum(['email', 'sms', 'telegram']),
  enabled: z.boolean(),
});

export type SmtpSettingsInput = z.infer<typeof SmtpSettingsInputSchema>;
export type SmtpSettingsResponse = z.infer<typeof SmtpSettingsResponseSchema>;
export type TelegramSettingsInput = z.infer<typeof TelegramSettingsInputSchema>;
export type TelegramSettingsResponse = z.infer<typeof TelegramSettingsResponseSchema>;
export type TestNotificationInput = z.infer<typeof TestNotificationInputSchema>;
export type NotificationChannelPreference = z.infer<typeof NotificationChannelPreferenceSchema>;
