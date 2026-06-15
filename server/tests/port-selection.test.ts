import { describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { findAvailablePort } from '../src/index.js';

function listenOnRandomPort(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer();

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Expected TCP address'));
        return;
      }

      resolve({
        port: address.port,
        close: () => new Promise<void>((closeResolve, closeReject) => {
          server.close(err => err ? closeReject(err) : closeResolve());
        }),
      });
    });
  });
}

describe('port selection', () => {
  it('returns the requested port when it is available', async () => {
    const reserved = await listenOnRandomPort();
    const port = reserved.port;
    await reserved.close();

    const selected = await findAvailablePort(port, '127.0.0.1', 1);
    expect(selected).toBe(port);
  });

  it('falls forward when the requested port is unavailable', async () => {
    const occupied = await listenOnRandomPort();
    try {
      const selected = await findAvailablePort(occupied.port, '127.0.0.1', 2);
      expect(selected).toBe(occupied.port + 1);
    } finally {
      await occupied.close();
    }
  });
});
