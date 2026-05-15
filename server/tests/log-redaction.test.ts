/**
 * Tests for structured redacted logging (Phase 5 Task 5).
 *
 * Verifies:
 *  - logger redacts password field
 *  - logger redacts nested email field
 *  - logger redacts apiKey field
 *  - logger does not redact non-sensitive fields (status, requestId)
 */

import { describe, it, expect } from 'vitest';
import { createLoggerConfig, REDACTED_PATHS } from '../src/logger.js';

describe('logger redaction config', () => {
  it('exports a redact paths array', () => {
    expect(Array.isArray(REDACTED_PATHS)).toBe(true);
    expect(REDACTED_PATHS.length).toBeGreaterThan(0);
  });

  it('redacts password field path', () => {
    expect(REDACTED_PATHS).toContain('password');
  });

  it('redacts nested email path', () => {
    const hasNestedEmail = REDACTED_PATHS.some(p => p.includes('email') || p === 'email');
    expect(hasNestedEmail).toBe(true);
  });

  it('redacts apiKey field', () => {
    const hasApiKey = REDACTED_PATHS.some(p => p.includes('apiKey'));
    expect(hasApiKey).toBe(true);
  });

  it('redacts req.headers.authorization', () => {
    expect(REDACTED_PATHS).toContain('req.headers.authorization');
  });

  it('redacts req.headers.cookie', () => {
    expect(REDACTED_PATHS).toContain('req.headers.cookie');
  });

  it('createLoggerConfig returns object with redact key', () => {
    const config = createLoggerConfig({ testing: false });
    expect(config).toHaveProperty('redact');
    expect((config.redact as { paths: string[] }).paths ?? config.redact).toBeDefined();
  });

  it('createLoggerConfig returns false in testing mode (disables logging)', () => {
    const config = createLoggerConfig({ testing: true });
    expect(config).toBe(false);
  });

  it('does not redact non-sensitive fields', () => {
    // status, requestId, latencyMs should NOT be in the redact list
    expect(REDACTED_PATHS).not.toContain('status');
    expect(REDACTED_PATHS).not.toContain('requestId');
    expect(REDACTED_PATHS).not.toContain('latencyMs');
  });
});
