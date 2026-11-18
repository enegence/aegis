/**
 * The product is Underwing; this self-hosted app is Underwing Core.
 * Messages people read must carry the new name. Identifiers (cookies, env
 * vars, the packet wire value `aegis_core`) keep their old spelling on purpose
 * and are covered by their own tests.
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
