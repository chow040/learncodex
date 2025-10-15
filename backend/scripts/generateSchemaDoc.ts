import 'dotenv/config'
import { Pool } from 'pg'
import fs from 'node:fs'
import path from 'node:path'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Create backend/.env and set it to your Supabase Postgres URL.')
  process.exit(1)
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 1 })

type ColumnRow = {
  table_schema: string
  table_name: string
  column_name: string
  data_type: string
  is_nullable: 'YES' | 'NO'
  column_default: string | null
  character_maximum_length: number | null
  numeric_precision: number | null
  numeric_scale: number | null
}

async function main() {
  const [tablesRes, colsRes, pksRes, fksRes, idxRes] = await Promise.all([
    pool.query(`
      select table_schema, table_name
      from information_schema.tables
      where table_schema not in ('pg_catalog','information_schema')
        and table_type='BASE TABLE'
      order by table_schema, table_name;
    `),
    pool.query<ColumnRow>(`
      select table_schema, table_name, column_name, data_type, is_nullable, column_default,
             character_maximum_length, numeric_precision, numeric_scale
      from information_schema.columns
      where table_schema not in ('pg_catalog','information_schema')
      order by table_schema, table_name, ordinal_position;
    `),
    pool.query(`
      select tc.table_schema, tc.table_name, kc.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kc
        on tc.constraint_name = kc.constraint_name
       and tc.table_schema = kc.table_schema
       and tc.table_name = kc.table_name
      where tc.constraint_type='PRIMARY KEY'
        and tc.table_schema not in ('pg_catalog','information_schema')
      order by tc.table_schema, tc.table_name, kc.ordinal_position;
    `),
    pool.query(`
      select tc.table_schema, tc.table_name, kcu.column_name,
             ccu.table_schema as foreign_table_schema,
             ccu.table_name as foreign_table_name,
             ccu.column_name as foreign_column_name
      from information_schema.table_constraints as tc
      join information_schema.key_column_usage as kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage as ccu
        on ccu.constraint_name = tc.constraint_name
       and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema not in ('pg_catalog','information_schema')
      order by tc.table_schema, tc.table_name, kcu.column_name;
    `),
    pool.query(`
      select schemaname, tablename, indexname, indexdef
      from pg_indexes
      where schemaname not in ('pg_catalog','information_schema')
      order by schemaname, tablename, indexname;
    `),
  ])

  const tables = tablesRes.rows as { table_schema: string; table_name: string }[]
  const columns = colsRes.rows
  const pks = pksRes.rows as { table_schema: string; table_name: string; column_name: string }[]
  const fks = fksRes.rows as {
    table_schema: string
    table_name: string
    column_name: string
    foreign_table_schema: string
    foreign_table_name: string
    foreign_column_name: string
  }[]
  const indexes = idxRes.rows as { schemaname: string; tablename: string; indexname: string; indexdef: string }[]

  const byTable = new Map<string, any>()
  for (const { table_schema, table_name } of tables) {
    byTable.set(`${table_schema}.${table_name}`, {
      schema: table_schema,
      name: table_name,
      columns: [] as any[],
      primaryKey: [] as string[],
      foreignKeys: [] as any[],
      indexes: [] as any[],
    })
  }

  for (const col of columns) {
    const key = `${col.table_schema}.${col.table_name}`
    if (!byTable.has(key)) continue
    byTable.get(key).columns.push({
      name: col.column_name,
      type: col.data_type,
      nullable: col.is_nullable === 'YES',
      default: col.column_default,
      maxLength: col.character_maximum_length,
      numericPrecision: col.numeric_precision,
      numericScale: col.numeric_scale,
    })
  }

  for (const pk of pks) {
    const key = `${pk.table_schema}.${pk.table_name}`
    if (!byTable.has(key)) continue
    byTable.get(key).primaryKey.push(pk.column_name)
  }

  for (const fk of fks) {
    const key = `${fk.table_schema}.${fk.table_name}`
    if (!byTable.has(key)) continue
    byTable.get(key).foreignKeys.push({
      column: fk.column_name,
      references: `${fk.foreign_table_schema}.${fk.foreign_table_name}(${fk.foreign_column_name})`,
    })
  }

  for (const idx of indexes) {
    const key = `${idx.schemaname}.${idx.tablename}`
    if (!byTable.has(key)) continue
    byTable.get(key).indexes.push({ name: idx.indexname, definition: idx.indexdef })
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    database: 'Supabase/Postgres (redacted)',
    tables: Array.from(byTable.values()).sort((a, b) =>
      a.schema === b.schema ? a.name.localeCompare(b.name) : a.schema.localeCompare(b.schema)
    ),
  }

  const outDir = path.resolve(process.cwd(), 'docs')
  fs.mkdirSync(outDir, { recursive: true })

  const jsonPath = path.join(outDir, 'db-schema.json')
  fs.writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2), 'utf8')

  const mdLines: string[] = []
  mdLines.push(`# Database Schema Snapshot`)
  mdLines.push(`Generated: ${snapshot.generatedAt}`)
  mdLines.push('')
  for (const t of snapshot.tables) {
    mdLines.push(`## ${t.schema}.${t.name}`)
    mdLines.push('')
    mdLines.push(`- Columns:`)
    for (const c of t.columns) {
      const details: string[] = []
      details.push(c.type)
      details.push(c.nullable ? 'nullable' : 'not null')
      if (c.default) details.push(`default: ${c.default}`)
      if (c.maxLength) details.push(`len: ${c.maxLength}`)
      if (c.numericPrecision != null) details.push(`prec: ${c.numericPrecision}`)
      if (c.numericScale != null) details.push(`scale: ${c.numericScale}`)
      mdLines.push(`  - \`${c.name}\`: ${details.join(', ')}`)
    }
    if (t.primaryKey?.length) {
      mdLines.push(`- Primary key: (${t.primaryKey.join(', ')})`)
    }
    if (t.foreignKeys?.length) {
      mdLines.push(`- Foreign keys:`)
      for (const fk of t.foreignKeys) {
        mdLines.push(`  - ${fk.column} → ${fk.references}`)
      }
    }
    if (t.indexes?.length) {
      mdLines.push(`- Indexes:`)
      for (const ix of t.indexes) {
        mdLines.push(`  - ${ix.name}: ${ix.definition}`)
      }
    }
    mdLines.push('')
  }

  const mdPath = path.join(outDir, 'db-schema.md')
  fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf8')

  console.log('Wrote schema snapshot:')
  console.log(`- ${path.relative(process.cwd(), jsonPath)}`)
  console.log(`- ${path.relative(process.cwd(), mdPath)}`)
}

main()
  .catch((err) => {
    console.error('Failed to generate schema snapshot:', err)
    process.exit(1)
  })
  .finally(async () => {
    await pool.end()
  })
