import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"

import { env } from "../config/env.js"

const pool = env.databaseUrl
  ? new Pool({ connectionString: env.databaseUrl, max: 5 })
  : null

export const db = pool ? drizzle(pool) : null

export const closeDb = async () => {
  if (pool) {
    await pool.end()
  }
}

