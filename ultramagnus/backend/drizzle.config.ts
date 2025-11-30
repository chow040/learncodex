import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

if (!process.env.DATABASE_URL) {
  console.warn('[drizzle] DATABASE_URL is not set. Drizzle commands will fail until provided.');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
    ssl: {
      rejectUnauthorized: false
    }
  },
  verbose: true,
  strict: true
});
