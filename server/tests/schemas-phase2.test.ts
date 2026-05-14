import { describe, it, expect } from 'vitest';
import { CreateSwitchInputSchema, UpdateSwitchInputSchema } from '../src/schemas/switches.js';
import {
  SmtpSettingsInputSchema,
  TelegramSettingsInputSchema,
} from '../src/schemas/notifications.js';
import { ReadinessCheckSchema, SwitchReadinessSchema } from '../src/schemas/readiness.js';

// A date safely in the future for trip-mode tests
const FUTURE_DATE = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

describe('CreateSwitchInputSchema', () => {
  it('accepts valid trip switch with triggerAt', () => {
    const result = CreateSwitchInputSchema.safeParse({
      name: 'My Trip Switch',
      mode: 'trip',
      triggerAt: FUTURE_DATE,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid heartbeat switch with heartbeatIntervalDays', () => {
    const result = CreateSwitchInputSchema.safeParse({
      name: 'My Heartbeat Switch',
      mode: 'heartbeat',
      heartbeatIntervalDays: 30,
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults: deploymentMode=vault, gracePeriodHours=72, warningWindowDays=3', () => {
    const result = CreateSwitchInputSchema.safeParse({
      name: 'Default Test',
      mode: 'heartbeat',
      heartbeatIntervalDays: 7,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deploymentMode).toBe('vault');
      expect(result.data.gracePeriodHours).toBe(72);
      expect(result.data.warningWindowDays).toBe(3);
      expect(result.data.selectedContactIds).toEqual([]);
      expect(result.data.selectedEstateItemIds).toEqual([]);
    }
  });

  it('rejects trip mode without triggerAt', () => {
    const result = CreateSwitchInputSchema.safeParse({
      name: 'Missing TriggerAt',
      mode: 'trip',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('triggerAt');
    }
  });

  it('rejects heartbeat mode without heartbeatIntervalDays', () => {
    const result = CreateSwitchInputSchema.safeParse({
      name: 'Missing Interval',
      mode: 'heartbeat',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('heartbeatIntervalDays');
    }
  });

  it('rejects gracePeriodHours = 0', () => {
    const result = CreateSwitchInputSchema.safeParse({
      name: 'Bad Grace Period',
      mode: 'heartbeat',
      heartbeatIntervalDays: 7,
      gracePeriodHours: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects warningWindowDays < 0', () => {
    const result = CreateSwitchInputSchema.safeParse({
      name: 'Bad Warning Window',
      mode: 'heartbeat',
      heartbeatIntervalDays: 7,
      warningWindowDays: -1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts warningWindowDays = 0', () => {
    const result = CreateSwitchInputSchema.safeParse({
      name: 'Zero Warning',
      mode: 'heartbeat',
      heartbeatIntervalDays: 7,
      warningWindowDays: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid deploymentMode values', () => {
    const modes = ['vault', 'dead_drop', 'relay_monitoring', 'relay_escrow', 'hosted'] as const;
    for (const deploymentMode of modes) {
      const result = CreateSwitchInputSchema.safeParse({
        name: `Mode ${deploymentMode}`,
        mode: 'heartbeat',
        heartbeatIntervalDays: 7,
        deploymentMode,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects old deploymentMode values', () => {
    const oldModes = ['local_only', 'relay'];
    for (const deploymentMode of oldModes) {
      const result = CreateSwitchInputSchema.safeParse({
        name: 'Old Mode',
        mode: 'heartbeat',
        heartbeatIntervalDays: 7,
        deploymentMode,
      });
      expect(result.success).toBe(false);
    }
  });
});

describe('SmtpSettingsInputSchema', () => {
  it('accepts valid SMTP settings', () => {
    const result = SmtpSettingsInputSchema.safeParse({
      host: 'smtp.example.com',
      port: 587,
      user: 'user@example.com',
      password: 'secret',
      fromEmail: 'noreply@example.com',
      secure: false,
    });
    expect(result.success).toBe(true);
  });

  it('defaults secure to false', () => {
    const result = SmtpSettingsInputSchema.safeParse({
      host: 'smtp.example.com',
      port: 465,
      user: 'user@example.com',
      password: 'secret',
      fromEmail: 'noreply@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.secure).toBe(false);
    }
  });

  it('rejects port 0', () => {
    const result = SmtpSettingsInputSchema.safeParse({
      host: 'smtp.example.com',
      port: 0,
      user: 'user@example.com',
      password: 'secret',
      fromEmail: 'noreply@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects port > 65535', () => {
    const result = SmtpSettingsInputSchema.safeParse({
      host: 'smtp.example.com',
      port: 65536,
      user: 'user@example.com',
      password: 'secret',
      fromEmail: 'noreply@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid fromEmail', () => {
    const result = SmtpSettingsInputSchema.safeParse({
      host: 'smtp.example.com',
      port: 587,
      user: 'user@example.com',
      password: 'secret',
      fromEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = SmtpSettingsInputSchema.safeParse({ host: 'smtp.example.com' });
    expect(result.success).toBe(false);
  });

  it('accepts empty password so the API can keep an existing secret', () => {
    const result = SmtpSettingsInputSchema.safeParse({
      host: 'smtp.example.com',
      port: 587,
      user: 'user@example.com',
      password: '',
      fromEmail: 'noreply@example.com',
    });
    expect(result.success).toBe(true);
  });
});

describe('TelegramSettingsInputSchema', () => {
  it('accepts valid Telegram settings', () => {
    const result = TelegramSettingsInputSchema.safeParse({
      botToken: '123456:ABCdef',
      chatId: '-100123456789',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing botToken', () => {
    const result = TelegramSettingsInputSchema.safeParse({ chatId: '-100123' });
    expect(result.success).toBe(false);
  });

  it('rejects missing chatId', () => {
    const result = TelegramSettingsInputSchema.safeParse({ botToken: '123456:ABCdef' });
    expect(result.success).toBe(false);
  });

  it('accepts empty botToken so the API can keep an existing secret', () => {
    const result = TelegramSettingsInputSchema.safeParse({
      botToken: '',
      chatId: '-100123',
    });
    expect(result.success).toBe(true);
  });
});

describe('ReadinessCheckSchema', () => {
  it('accepts valid readiness check', () => {
    const result = ReadinessCheckSchema.safeParse({
      id: 'smtp_configured',
      label: 'SMTP Configured',
      status: 'ready',
      required: true,
      message: 'SMTP is configured',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional resolutionHint', () => {
    const result = ReadinessCheckSchema.safeParse({
      id: 'smtp_configured',
      label: 'SMTP Configured',
      status: 'not_ready',
      required: true,
      message: 'SMTP not configured',
      resolutionHint: 'Go to Settings > Notifications',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resolutionHint).toBe('Go to Settings > Notifications');
    }
  });

  it('rejects invalid status value', () => {
    const result = ReadinessCheckSchema.safeParse({
      id: 'test',
      label: 'Test',
      status: 'unknown',
      required: false,
      message: 'msg',
    });
    expect(result.success).toBe(false);
  });
});

describe('SwitchReadinessSchema', () => {
  it('accepts valid switch readiness output', () => {
    const result = SwitchReadinessSchema.safeParse({
      switchId: 1,
      status: 'warning',
      checks: [
        {
          id: 'contacts',
          label: 'Contacts assigned',
          status: 'not_ready',
          required: true,
          message: 'No contacts assigned',
          resolutionHint: 'Add at least one contact',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts readiness without switchId (global check)', () => {
    const result = SwitchReadinessSchema.safeParse({
      status: 'ready',
      checks: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.switchId).toBeUndefined();
    }
  });
});
