# Refreshing the Database Schema Snapshot

Keep a checked-in snapshot of your Supabase/Postgres schema so Codex (and teammates) can read it without direct DB access.

## What gets generated
- `docs/db-schema.json` — machine-readable snapshot (tables, columns, PKs, FKs, indexes)
- `docs/db-schema.md` — human-friendly Markdown summary

## One-time setup (already done)
- Script: `scripts/generateSchemaDoc.ts` (introspects via `information_schema`)
- NPM script: `db:schema:dump` in `backend/package.json`
- Drizzle config: `drizzle.config.ts` (optional but recommended)

## Prerequisites
- `backend/.env` contains a valid Postgres URL:
  - `DATABASE_URL="postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres?sslmode=require"`
- Network access to your Supabase instance

## Quick refresh (recommended)
```bash
cd backend
npm run db:schema:dump
```
This connects to `DATABASE_URL` and overwrites:
- `docs/db-schema.json`
- `docs/db-schema.md`

## End-to-end flow when schema changed
If you changed the TypeScript schema (`src/db/schema.ts`) and want to update the database before dumping a new snapshot:
```bash
cd backend
# 1) Generate SQL from Drizzle schema
npm run drizzle:generate
# 2) Apply migrations
npm run drizzle:migrate
# 3) (Optional) Browse with Drizzle Studio
npm run drizzle:studio
# 4) Dump refreshed schema snapshot for Codex
npm run db:schema:dump
```

## Verifying connectivity
- Test DB connection: `npm run db:test`
- Quick read of latest assessment logs: `npm run db:logs`

## Limiting to the `public` schema (optional)
By default, the snapshot includes all non-system schemas (e.g., Supabase `auth`, `storage`).
If you want to document only your app’s `public` schema, tweak the queries in `scripts/generateSchemaDoc.ts` by adding `where table_schema = 'public'` filters.

## Troubleshooting
- `DATABASE_URL is not set` — Ensure `.env` is present and the variable is defined.
- SSL errors — Use `?sslmode=require` with Supabase URLs.
- Permission issues — Confirm the Supabase role in `DATABASE_URL` can read `information_schema`.
- Script errors about Markdown backticks — Ensure you’re on the committed version of `scripts/generateSchemaDoc.ts`.

## Commit guidance
- It’s safe to commit the snapshot; it contains schema metadata, not secrets.
- If you prefer to keep it private, add `backend/docs/db-schema.*` to `.gitignore` and share ad-hoc when needed.

## Related scripts
- `npm run drizzle:generate` — build SQL from `src/db/schema.ts`
- `npm run drizzle:migrate` — apply migrations to your DB
- `npm run drizzle:studio` — browse data/schema
- `npm run db:test` — ping DB
- `npm run db:logs` — show latest `assessment_logs`
- `npm run db:schema:dump` — regenerate the schema snapshot

