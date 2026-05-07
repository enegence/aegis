import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { loadConfig, type AppConfig } from './config.js';
import { getDb, createTestDb, type AegisDb } from './db/index.js';
import authPlugin from './auth/plugin.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    db: AegisDb;
    requireAuth: (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}

export async function buildApp(overrides: Partial<AppConfig & { dbPath: string }> = {}) {
  const config = loadConfig(overrides);
  const app = Fastify({ logger: !config.testing });

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

  if (config.testing && overrides.dbPath === ':memory:') {
    const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
    migrate(db, { migrationsFolder: './drizzle' });
  }

  return app;
}

async function start() {
  const app = await buildApp();
  const config = loadConfig();

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`Aegis server listening on ${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  start();
}
