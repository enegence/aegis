import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const root = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), 'aegis-e2e-'));
const children = new Set();
let readyServer;
let shuttingDown = false;

const commonEnv = {
  ...process.env,
  NODE_ENV: 'test',
  AEGIS_HOST: '127.0.0.1',
  AEGIS_WORKER_ENABLED: 'false',
  AEGIS_SECRET_KEY: 'e2e-secret-key-0123456789abcdef0123456789abcdef0123456789abcdef',
  AEGIS_FIELD_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
};

function startAegis(name, port) {
  const dataDir = join(tempRoot, name);
  const child = spawn('node', ['server/dist/index.js'], {
    cwd: root,
    env: {
      ...commonEnv,
      AEGIS_PORT: String(port),
      AEGIS_APP_URL: `http://127.0.0.1:${port}`,
      AEGIS_DB_PATH: join(dataDir, 'aegis.db'),
      AEGIS_DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);

  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown && code !== 0) {
      console.error(`${name} server exited unexpectedly`, { code, signal });
      shutdown(1);
    }
  });

  return child;
}

async function waitForHealth(port) {
  const url = `http://127.0.0.1:${port}/health`;
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function seedOwner(port) {
  const res = await fetch(`http://127.0.0.1:${port}/api/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'E2E Owner',
      email: 'e2e@test.local',
      password: 'e2e-testpass-1234',
      timezone: 'UTC',
      deploymentMode: 'vault',
    }),
  });
  if (![201, 409].includes(res.status)) {
    throw new Error(`Owner seed failed with status ${res.status}: ${await res.text()}`);
  }
}

function startReadyServer() {
  readyServer = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ready');
  });
  readyServer.listen(8202, '127.0.0.1');
}

function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  if (readyServer) readyServer.close();
  rmSync(tempRoot, { recursive: true, force: true });
  process.exit(code);
}

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));

try {
  startAegis('fresh', 8200);
  startAegis('owner', 8201);
  await Promise.all([waitForHealth(8200), waitForHealth(8201)]);
  await seedOwner(8201);
  startReadyServer();
  console.log('Aegis e2e servers ready');
} catch (err) {
  console.error(err);
  shutdown(1);
}
