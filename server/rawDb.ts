/**
 * rawDb.ts — abstração para queries SQL diretas.
 * Dev  (NODE_ENV=development): usa better-sqlite3 com .data/dev.db
 * Prod (NODE_ENV=production):  usa @neondatabase/serverless Pool com PostgreSQL
 *
 * API unificada: rawGet / rawAll / rawRun
 * Os parâmetros sempre usam `?` — a conversão para $N (pg) é automática.
 */

import { createRequire } from "module";

const _require = createRequire(import.meta.url);
const isDev = process.env.NODE_ENV === "development";
const SQLITE_PATH = process.env.SQLITE_DB_PATH ?? ".data/dev.db";

export type RawRow = Record<string, any>;

// ── SQLite (dev) ─────────────────────────────────────────────────────────────

let _sqliteDb: any = null;

function getSqliteDb() {
  if (!_sqliteDb) {
    const Database = _require("better-sqlite3");
    _sqliteDb = new Database(SQLITE_PATH);
  }
  return _sqliteDb;
}

// ── PostgreSQL (prod) ─────────────────────────────────────────────────────────

/** Convert SQLite ? placeholders → PostgreSQL $1, $2, … */
function toPg(sql: string): string {
  let i = 0;
  return sql
    .replace(/\?/g, () => `$${++i}`)
    .replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP")
    .replace(/AUTOINCREMENT/gi, "")
    .replace(/INTEGER PRIMARY KEY\b/gi, "SERIAL PRIMARY KEY");
}

async function pgPool() {
  const { pool } = await import("./db.js");
  return pool as import("pg").Pool;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function rawGet(sql: string, params: any[] = []): Promise<RawRow | undefined> {
  if (isDev) {
    return getSqliteDb().prepare(sql).get(...params) as RawRow | undefined;
  }
  const pool = await pgPool();
  const result = await pool.query(toPg(sql), params);
  return result.rows[0];
}

export async function rawAll(sql: string, params: any[] = []): Promise<RawRow[]> {
  if (isDev) {
    return getSqliteDb().prepare(sql).all(...params) as RawRow[];
  }
  const pool = await pgPool();
  const result = await pool.query(toPg(sql), params);
  return result.rows;
}

export async function rawRun(
  sql: string,
  params: any[] = []
): Promise<{ changes?: number; lastInsertRowid?: number | bigint }> {
  if (isDev) {
    const stmt = getSqliteDb().prepare(sql);
    const result = stmt.run(...params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }
  const pool = await pgPool();
  const result = await pool.query(toPg(sql), params);
  return { changes: result.rowCount ?? 0 };
}
