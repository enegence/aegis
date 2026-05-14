import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { loadConfig, type AppConfig } from './config.js';
import { getDb, createTestDb, type AegisDb } from './db/index.js';
import { createLoggerConfig } from './logger.js';
import authPlugin from './auth/plugin.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { estateRoutes } from './routes/estate.js';
import { contactRoutes } from './routes/contacts.js';
import { switchRoutes } from './routes/switches.js';
import { settingsRoutes } from './routes/settings.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { packetRoutes } from './routes/packets.js';
import { claimRoutes } from './routes/claim.js';
import { releaseRoutes } from './routes/release.js';
import { auditRoutes } from './routes/audit.js';
import { securityRoutes } from './routes/security.js';
import { exportRoutes } from './routes/export.js';
import { startWorker, type WorkerHandle } from './worker/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    db: AegisDb;
    requireAuth: (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
    requireCsrf: (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}

export async function buildApp(overrides: Partial<AppConfig & { dbPath: string }> = {}) {
  const config = loadConfig(overrides);
  const loggerConfig = createLoggerConfig({ testing: !!config.testing });
  const app = Fastify({ logger: loggerConfig as any });

  const db = config.testing && overrides.dbPath === ':memory:'
    ? createTestDb()
    : getDb(config.dbPath);

  await app.register(cookie, { secret: config.secretKey });
  await app.register(cors, {
    origin: config.testing ? true : config.appUrl,
    credentials: true,
  });
  await app.register(formbody);

  app.decorate('config', config);
  app.decorate('db', db);

  await app.register(authPlugin);
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(estateRoutes);
  await app.register(contactRoutes);
  await app.register(switchRoutes);
  await app.register(settingsRoutes);
  await app.register(dashboardRoutes, { prefix: '/api' });
  await app.register(packetRoutes);
  await app.register(claimRoutes);
  await app.register(releaseRoutes);
  await app.register(auditRoutes);
  await app.register(securityRoutes);
  await app.register(exportRoutes);

  if (config.testing && overrides.dbPath === ':memory:') {
    const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
    migrate(db, { migrationsFolder: './drizzle' });
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const staticDir = resolve(__dirname, '../static');
  if (existsSync(staticDir)) {
    await app.register(fastifyStatic, {
      root: staticDir,
      prefix: '/',
      wildcard: false,
    });

    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api/') || req.url === '/health') {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

async function start() {
  const app = await buildApp();
  const config = loadConfig();

  // Ensure data directory exists
  const { mkdirSync } = await import('fs');
  const { join: pathJoin } = await import('path');
  try {
    mkdirSync(pathJoin(config.dataDir, 'packets'), { recursive: true });
  } catch (err) {
    console.error(`FATAL: cannot create data directory at ${config.dataDir}/packets:`, err);
    process.exit(1);
  }

  let workerHandle: WorkerHandle | null = null;

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`Aegis server listening on ${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  if (process.env.AEGIS_WORKER_ENABLED === 'true') {
    workerHandle = startWorker(app.db, {
      syncConfig: {
        fieldEncryptionKey: config.fieldEncryptionKey,
        dataDir: config.dataDir,
      },
    });
    console.log('[worker] started');
  }

  const shutdown = async () => {
    if (workerHandle) {
      await workerHandle.stop();
      console.log('[worker] stopped');
    }
    await app.close();
    process.exit(0);
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  start();
}
