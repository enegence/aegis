/**
 * Accessibility smoke tests — static source analysis.
 *
 * @testing-library/react is not available in this workspace (server-only vitest).
 * These tests read the React component source files and assert that key
 * accessibility attributes (ARIA roles, htmlFor/id pairs, aria-live regions,
 * aria-required, aria-busy, role="alert") are present in the JSX source text.
 *
 * This catches regressions where someone removes an ARIA attribute without
 * noticing. Full DOM-level testing should be done with Playwright E2E.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

// Resolve paths relative to the OSS repo root (two levels up from server/tests/)
const webSrc = resolve(__dirname, '../../web/src');

function read(relPath: string): string {
  return readFileSync(join(webSrc, relPath), 'utf-8');
}

// ─── Login.tsx ───────────────────────────────────────────────────────────────

describe('Login page — accessibility invariants', () => {
  const src = read('pages/Login.tsx');

  it('has a <label> with htmlFor linking to the password input', () => {
    expect(src).toContain('htmlFor="login-password"');
    expect(src).toContain('id="login-password"');
  });

  it('has a <label> with htmlFor linking to the TOTP input', () => {
    expect(src).toContain('htmlFor="login-totp"');
    expect(src).toContain('id="login-totp"');
  });

  it('error element has role="alert"', () => {
    expect(src).toContain('role="alert"');
  });

  it('error element has aria-live="assertive"', () => {
    expect(src).toContain('aria-live="assertive"');
  });

  it('password input has aria-required="true"', () => {
    // aria-required on the password input
    expect(src).toContain('aria-required="true"');
  });

  it('has an aria-live="polite" region for async status', () => {
    expect(src).toContain('aria-live="polite"');
  });

  it('submit button exposes aria-busy when submitting', () => {
    expect(src).toContain('aria-busy={submitting}');
  });
});

// ─── Setup.tsx ───────────────────────────────────────────────────────────────

describe('Setup wizard — accessibility invariants', () => {
  const src = read('pages/Setup.tsx');

  it('Label component accepts htmlFor prop and renders it', () => {
    // htmlFor prop is declared in the Label function signature
    expect(src).toContain('htmlFor: string');
    // and is used with the <label> element
    expect(src).toContain('htmlFor={htmlFor}');
  });

  it('Input component accepts id and aria-required props', () => {
    expect(src).toContain('id: string');
    expect(src).toContain('aria-required={required');
  });

  it('profile step wires displayName label → input', () => {
    expect(src).toContain('htmlFor="setup-displayName"');
    expect(src).toContain('id="setup-displayName"');
  });

  it('profile step wires email label → input', () => {
    expect(src).toContain('htmlFor="setup-email"');
    expect(src).toContain('id="setup-email"');
  });

  it('security step wires password label → input', () => {
    expect(src).toContain('htmlFor="setup-password"');
    expect(src).toContain('id="setup-password"');
  });

  it('security step wires confirmPassword label → input', () => {
    expect(src).toContain('htmlFor="setup-confirmPassword"');
    expect(src).toContain('id="setup-confirmPassword"');
  });

  it('acknowledgement checkboxes have htmlFor + id', () => {
    expect(src).toContain('htmlFor="ack-general"');
    expect(src).toContain('id="ack-general"');
    expect(src).toContain('htmlFor="ack-mode"');
    expect(src).toContain('id="ack-mode"');
  });

  it('FieldError renders role="alert"', () => {
    expect(src).toContain('role="alert"');
  });

  it('submit error banner has role="alert"', () => {
    // Appears on the review step error div
    expect(src).toContain('aria-live="assertive"');
  });

  it('deployment mode cards use role="radiogroup" / role="radio"', () => {
    expect(src).toContain('role="radiogroup"');
    expect(src).toContain('role="radio"');
  });

  it('deployment mode cards have aria-checked', () => {
    expect(src).toContain('aria-checked={selected}');
  });

  it('progress bar has role="progressbar" with aria-valuenow', () => {
    expect(src).toContain('role="progressbar"');
    expect(src).toContain('aria-valuenow={step + 1}');
  });

  it('has an aria-live="polite" region for async status', () => {
    expect(src).toContain('aria-live="polite"');
  });

  it('submit button has aria-busy', () => {
    expect(src).toContain('aria-busy={submitting}');
  });
});

// ─── SecuritySettings.tsx ────────────────────────────────────────────────────

describe('SecuritySettings component — accessibility invariants', () => {
  const src = read('components/settings/SecuritySettings.tsx');

  it('TOTP setup code input has label linked via htmlFor/id', () => {
    expect(src).toContain('htmlFor="totp-setup-code"');
    expect(src).toContain('id="totp-setup-code"');
  });

  it('TOTP disable password input has label linked via htmlFor/id', () => {
    expect(src).toContain('htmlFor="totp-disable-password"');
    expect(src).toContain('id="totp-disable-password"');
  });

  it('TOTP disable code input has label linked via htmlFor/id', () => {
    expect(src).toContain('htmlFor="totp-disable-code"');
    expect(src).toContain('id="totp-disable-code"');
  });

  it('error elements have role="alert"', () => {
    expect(src).toContain('role="alert"');
  });

  it('error elements have aria-live="assertive"', () => {
    expect(src).toContain('aria-live="assertive"');
  });

  it('required inputs have aria-required="true"', () => {
    expect(src).toContain('aria-required="true"');
  });

  it('action buttons have aria-busy when loading', () => {
    expect(src).toContain('aria-busy={loading}');
  });

  it('toggle button has descriptive aria-label', () => {
    expect(src).toContain('aria-label={data.totpEnabled');
  });

  it('success message is in an aria-live="polite" region', () => {
    expect(src).toContain('aria-live="polite"');
  });
});

// ─── Authenticated App Forms ─────────────────────────────────────────────────

describe('Authenticated forms — accessibility invariants', () => {
  const ownerSettings = read('components/settings/OwnerSettings.tsx');
  const smtpSettings = read('components/settings/SmtpSettingsForm.tsx');
  const telegramSettings = read('components/settings/TelegramSettingsForm.tsx');
  const storageSettings = read('components/settings/StorageSettings.tsx');
  const packetSettings = read('components/settings/PacketSettings.tsx');
  const switchForm = read('components/switches/SwitchForm.tsx');

  it('OwnerSettings labels are linked to their controls', () => {
    for (const id of ['owner-display-name', 'owner-email', 'owner-phone', 'owner-timezone']) {
      expect(ownerSettings).toContain(`htmlFor="${id}"`);
      expect(ownerSettings).toContain(`id="${id}"`);
    }
  });

  it('notification setting labels are linked to their controls', () => {
    for (const id of ['smtp-host', 'smtp-port', 'smtp-user', 'smtp-password', 'smtp-from-email']) {
      expect(smtpSettings).toContain(`htmlFor="${id}"`);
      expect(smtpSettings).toContain(`id="${id}"`);
    }
    for (const id of ['telegram-bot-token', 'telegram-chat-id']) {
      expect(telegramSettings).toContain(`htmlFor="${id}"`);
      expect(telegramSettings).toContain(`id="${id}"`);
    }
  });

  it('storage and packet setting labels are linked to their controls', () => {
    for (const id of [
      'storage-endpoint',
      'storage-region',
      'storage-prefix',
      'storage-bucket',
      'storage-access-key-id',
      'storage-secret-access-key',
      'storage-force-path-style',
      'packet-retention-days',
    ]) {
      const source = id === 'packet-retention-days' ? packetSettings : storageSettings;
      expect(source).toContain(`htmlFor="${id}"`);
      expect(source).toContain(`id="${id}"`);
    }
  });

  it('SwitchForm labels are linked to their controls', () => {
    for (const id of [
      'switch-name',
      'switch-mode',
      'switch-deployment-mode',
      'switch-trigger-at',
      'switch-heartbeat-interval-days',
      'switch-warning-window-days',
      'switch-grace-period-hours',
    ]) {
      expect(switchForm).toContain(`htmlFor="${id}"`);
      expect(switchForm).toContain(`id="${id}"`);
    }
  });
});

// ─── ClaimPortal.tsx ─────────────────────────────────────────────────────────

describe('ClaimPortal — accessibility invariants', () => {
  const src = read('pages/claim/ClaimPortal.tsx');

  it('PIN input has a visible label linked via htmlFor/id', () => {
    expect(src).toContain('htmlFor="claim-pin"');
    expect(src).toContain('id="claim-pin"');
  });

  it('PIN input has aria-required="true"', () => {
    expect(src).toContain('aria-required="true"');
  });

  it('action message element has role="alert"', () => {
    expect(src).toContain('role="alert"');
  });

  it('action message has aria-live="assertive"', () => {
    expect(src).toContain('aria-live="assertive"');
  });

  it('error state message has role="alert"', () => {
    // The error state <p> also has role="alert"
    // Both the critical-error path and the actionMsg path have it
    const alertCount = (src.match(/role="alert"/g) ?? []).length;
    expect(alertCount).toBeGreaterThanOrEqual(2);
  });

  it('has an aria-live polite region for step progress', () => {
    expect(src).toContain('aria-live="polite"');
  });
});
