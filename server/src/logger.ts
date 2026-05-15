/**
 * Structured redacted logging configuration for Aegis OSS.
 *
 * Wraps Fastify's built-in pino logger with a redact list that prevents
 * sensitive fields from appearing in log output. Pass the result of
 * createLoggerConfig() directly to Fastify's `logger` option.
 */

/**
 * Pino redact paths. Any field matching these paths will be replaced with
 * "[Redacted]" in all log output, including nested objects.
 *
 * Convention:
 *  - Plain paths like 'password' catch top-level fields.
 *  - '*.field' catches the field one level deep in any object.
 *  - Specific known request paths are listed explicitly.
 */
export const REDACTED_PATHS: string[] = [
  // Auth / session fields
  'password',
  'passwordHash',
  'sessionId',
  'csrfToken',
  'req.headers.authorization',
  'req.headers.cookie',
  // API keys and secrets
  '*.apiKey',
  '*.apiSecret',
  '*.secretAccessKey',
  '*.accessKeyId',
  '*.s3SecretKey',
  '*.s3AccessKey',
  // Encryption keys
  '*.packetKey',
  '*.releaseKey',
  '*.encryptionKey',
  '*.totpSecret',
  '*.keyMaterialEncrypted',
  // PII fields
  '*.email',
  '*.phone',
  '*.fullName',
  '*.institutionName',
  '*.fullNameEncrypted',
  '*.emailEncrypted',
  '*.phoneEncrypted',
];

export interface LoggerConfigOptions {
  testing: boolean;
  prettyPrint?: boolean;
}

/**
 * Returns a pino logger configuration for use with Fastify's `logger` option.
 *
 * In testing mode, returns `false` to silence all log output during tests.
 * In production/development mode, returns a pino config with redact paths.
 */
export function createLoggerConfig(opts: LoggerConfigOptions): false | object {
  if (opts.testing) {
    return false;
  }

  const transport =
    opts.prettyPrint
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        }
      : undefined;

  return {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: REDACTED_PATHS,
      censor: '[Redacted]',
    },
    serializers: {
      req(req: { method: string; url: string; id: string }) {
        return {
          method: req.method,
          url: req.url,
          requestId: req.id,
        };
      },
      res(reply: { statusCode: number }) {
        return { statusCode: reply.statusCode };
      },
    },
    ...(transport ? { transport } : {}),
  };
}
