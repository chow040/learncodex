import { Pool } from 'pg';
import { env } from '../config/env.js';

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL not set');
}

const pool = new Pool({ connectionString: env.databaseUrl, max: 1 });

try {
  const { rows } = await pool.query(
    'SELECT id, symbol, created_at FROM assessment_logs ORDER BY created_at DESC LIMIT 5;',
  );
  console.table(rows);
} finally {
  await pool.end();
}
