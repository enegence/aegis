/**
 * The product is Underwing; this self-hosted app is Underwing Core.
 * Messages people read must carry the new name. The packet wire value
 * `aegis_core` keeps its old spelling on purpose and has its own tests.
 */
import { describe, it, expect } from 'vitest';
import { renderTemplate, type TemplatePurpose } from '../src/services/notification-templates.js';
import { buildNotificationPayload } from '../src/services/notification-delivery.js';
import { totpOtpauthUrl } from '../src/auth/totp.js';

const PURPOSES: TemplatePurpose[] = [
  'owner_test_notification',
  'owner_trip_reminder',
  'owner_heartbeat_reminder',
  'owner_warning_started',
  'owner_trigger_reached_local_only',
  'contact_claim_notification',
];

describe('brand name in messages', () => {
  it.each(PURPOSES)('%s uses Underwing and never the old name', (purpose) => {
    const { subject, body } = renderTemplate(purpose, {
      switchName: 'Main',
      nextActionAt: '2026-12-01T00:00:00.000Z',
      claimUrl: 'https://example.test/claim/token',
    });
    expect(subject.startsWith('Underwing: ')).toBe(true);
    expect(`${subject}\n${body}`).not.toMatch(/aegis/i);
  });

  it('the triggered notice says what happens next, with no development notes', () => {
    const { body } = renderTemplate('owner_trigger_reached_local_only', { switchName: 'Main' });
    expect(body).not.toMatch(/phase\s*\d/i);
    expect(body).toContain('claim link');
    expect(body).toContain('cancel the release');
  });

  it('no message uses an em dash', () => {
    for (const purpose of PURPOSES) {
      const { subject, body } = renderTemplate(purpose, { switchName: 'Main', claimUrl: 'https://example.test/claim/token' });
      expect(`${subject}\n${body}`).not.toContain('\u2014');
    }
  });

  it('claim notification names the Underwing estate plan', () => {
    const payload = buildNotificationPayload({
      ownerDisplayName: 'Owner',
      claimUrl: 'https://example.test/claim/token',
      claimExpiresAt: new Date('2026-12-01T00:00:00.000Z'),
    });
    expect(payload.textBody).toContain("Owner's Underwing estate plan");
    expect(payload.htmlBody).toContain('Underwing estate plan');
    expect(`${payload.subject}\n${payload.textBody}\n${payload.htmlBody}`).not.toMatch(/\bAegis\b/);
  });

  it('authenticator entry is labelled Underwing Core', () => {
    const url = new URL(totpOtpauthUrl('JBSWY3DPEHPK3PXP', 'owner@example.test'));
    expect(url.searchParams.get('issuer')).toBe('Underwing Core');
    expect(decodeURIComponent(url.pathname)).toContain('Underwing Core:owner@example.test');
  });
});
