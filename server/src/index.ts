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
import authPlugin from './auth/plugin.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { estateRoutes } from './routes/estate.js';
import { contactRoutes } from './routes/contacts.js';
import { switchRoutes } from './routes/switches.js';
import { settingsRoutes } from './routes/settings.js';

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
  await app.register(estateRoutes);
  await app.register(contactRoutes);
  await app.register(switchRoutes);
  await app.register(settingsRoutes);

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
