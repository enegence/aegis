import crypto from 'node:crypto';

/**
 * Derive a CSRF token deterministically from the session ID using HMAC-SHA256.
 * The token is tied to the session: no session = no valid CSRF token.
 */
export function deriveCsrfToken(sessionId: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(sessionId)
    .digest('hex');
}
