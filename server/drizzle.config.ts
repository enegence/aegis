import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    // Same rule as the server: new name first, then the old one (see src/env.ts).
    url: process.env.UNDERWING_DB_PATH || process.env.AEGIS_DB_PATH || './data/underwing.db',
  },
});
