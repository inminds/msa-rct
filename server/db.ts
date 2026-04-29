import * as schema from "@shared/schema";
import { createRequire } from "module";
import pg from 'pg';
const { Pool } = pg;
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import fs from 'fs';

const _require = createRequire(import.meta.url);

let db: any;
let pool: any;

const isDev = process.env.NODE_ENV === 'development';
const SQLITE_PATH = process.env.SQLITE_DB_PATH ?? './.data/dev.db';

if (isDev) {
  // ✅ Development: SQLite (zero config, file-based)
  const { drizzle: drizzleSqlite } = _require('drizzle-orm/better-sqlite3');
  const Database = _require('better-sqlite3');

  const dataDir = SQLITE_PATH.substring(0, SQLITE_PATH.lastIndexOf('/'));
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const sqliteDb = new Database(SQLITE_PATH);
  sqliteDb.pragma('journal_mode = WAL');

  // Auto-create tables (idempotent)
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR PRIMARY KEY,
      email VARCHAR UNIQUE,
      first_name VARCHAR,
      last_name VARCHAR,
      profile_image_url VARCHAR,
      role VARCHAR DEFAULT 'USER',
      password_hash VARCHAR,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      sid VARCHAR PRIMARY KEY,
      sess TEXT NOT NULL,
      expire TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS IDX_session_expire ON sessions(expire);
    CREATE TABLE IF NOT EXISTS uploads (
      id VARCHAR PRIMARY KEY,
      filename TEXT NOT NULL,
      file_type VARCHAR NOT NULL,
      description TEXT,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      user_id VARCHAR NOT NULL,
      status VARCHAR DEFAULT 'PENDING',
      processed_at TIMESTAMP,
      error_message TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS ncm_items (
      id VARCHAR PRIMARY KEY,
      ncm_code VARCHAR(8) NOT NULL,
      description TEXT,
      product_name TEXT,
      upload_id VARCHAR NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      econet_status VARCHAR DEFAULT 'PENDING',
      econet_scanned_at TIMESTAMP,
      econet_matched_ncm VARCHAR,
      FOREIGN KEY (upload_id) REFERENCES uploads(id)
    );
    CREATE TABLE IF NOT EXISTS tributes (
      id VARCHAR PRIMARY KEY,
      type VARCHAR NOT NULL,
      rate REAL,
      jurisdiction VARCHAR NOT NULL,
      law_source TEXT,
      effective_from TIMESTAMP,
      effective_to TIMESTAMP,
      ncm_item_id VARCHAR NOT NULL,
      validated TIMESTAMP,
      validated_by VARCHAR,
      FOREIGN KEY (ncm_item_id) REFERENCES ncm_items(id),
      FOREIGN KEY (validated_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS law_change_logs (
      id VARCHAR PRIMARY KEY,
      tribute VARCHAR NOT NULL,
      jurisdiction VARCHAR NOT NULL,
      description TEXT NOT NULL,
      detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      previous_content TEXT,
      new_content TEXT,
      source_url TEXT
    );
    CREATE TABLE IF NOT EXISTS ncm_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ncm VARCHAR NOT NULL,
      field VARCHAR NOT NULL,
      old_value TEXT,
      new_value TEXT,
      status VARCHAR NOT NULL DEFAULT 'pending',
      scan_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reports (
      id VARCHAR PRIMARY KEY,
      name TEXT NOT NULL,
      type VARCHAR NOT NULL,
      format VARCHAR NOT NULL,
      status VARCHAR NOT NULL DEFAULT 'pending',
      file_path TEXT,
      created_by VARCHAR,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      error_message TEXT,
      download_count INTEGER NOT NULL DEFAULT 0,
      downloaded_by VARCHAR
    );
    CREATE TABLE IF NOT EXISTS scan_schedule (
      id INTEGER PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      frequency VARCHAR NOT NULL DEFAULT 'weekly',
      day_of_week INTEGER DEFAULT 1,
      day_of_month INTEGER DEFAULT 1,
      hour INTEGER NOT NULL DEFAULT 8,
      minute INTEGER NOT NULL DEFAULT 0,
      mode VARCHAR NOT NULL DEFAULT 'incompletos',
      updated_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS scan_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requested_by VARCHAR NOT NULL,
      mode VARCHAR NOT NULL DEFAULT 'incompletos',
      ncms TEXT,
      status VARCHAR NOT NULL DEFAULT 'pending_thayssa',
      rejected_by VARCHAR,
      rejection_note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requested_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      category TEXT NOT NULL,
      details TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category);
  `);

  db = drizzleSqlite({ client: sqliteDb, schema });

  // Column migrations for existing DBs
  const reportCols = (sqliteDb.pragma('table_info(reports)') as { name: string }[]).map((c: any) => c.name);
  if (!reportCols.includes('download_count'))
    sqliteDb.exec("ALTER TABLE reports ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0");
  if (!reportCols.includes('downloaded_by'))
    sqliteDb.exec("ALTER TABLE reports ADD COLUMN downloaded_by VARCHAR");

  const userCols = (sqliteDb.pragma('table_info(users)') as { name: string }[]).map((c: any) => c.name);
  if (!userCols.includes('password_hash'))
    sqliteDb.exec("ALTER TABLE users ADD COLUMN password_hash VARCHAR");

  const scanReqCols = (sqliteDb.pragma('table_info(scan_requests)') as { name: string }[]).map((c: any) => c.name);
  if (!scanReqCols.includes('ncms'))
    sqliteDb.exec("ALTER TABLE scan_requests ADD COLUMN ncms TEXT");

  // ── Migração: padronizar IDs legados dos usuários seed para UUID ──────────
  // Roda apenas se o ID antigo ainda existir — idempotente, seguro em todo boot.
  const SEED_ID_MIGRATION: Record<string, string> = {
    "thayssa":       "10000000-0000-4000-8000-000000000001",
    "yuri":          "10000000-0000-4000-8000-000000000002",
    "admin-inminds": "10000000-0000-4000-8000-000000000003",
  };

  for (const [oldId, newId] of Object.entries(SEED_ID_MIGRATION)) {
    const exists = sqliteDb.prepare("SELECT id FROM users WHERE id = ?").get(oldId);
    if (!exists) continue; // já migrado ou nunca existiu

    // Desativa FK temporariamente para poder atualizar PK + FKs sem ordem obrigatória
    sqliteDb.pragma("foreign_keys = OFF");
    try {
      sqliteDb.transaction(() => {
        sqliteDb.prepare("UPDATE users         SET id            = ? WHERE id            = ?").run(newId, oldId);
        sqliteDb.prepare("UPDATE uploads       SET user_id       = ? WHERE user_id       = ?").run(newId, oldId);
        sqliteDb.prepare("UPDATE tributes      SET validated_by  = ? WHERE validated_by  = ?").run(newId, oldId);
        sqliteDb.prepare("UPDATE scan_requests SET requested_by  = ? WHERE requested_by  = ?").run(newId, oldId);
        sqliteDb.prepare("UPDATE scan_requests SET rejected_by   = ? WHERE rejected_by   = ?").run(newId, oldId);
        sqliteDb.prepare("UPDATE audit_logs    SET user_id       = ? WHERE user_id       = ?").run(newId, oldId);
        sqliteDb.prepare("UPDATE reports       SET created_by    = ? WHERE created_by    = ?").run(newId, oldId);
        sqliteDb.prepare("UPDATE reports       SET downloaded_by = ? WHERE downloaded_by = ?").run(newId, oldId);
      })();
      console.log(`[migration] ID "${oldId}" → UUID ${newId}`);
    } finally {
      sqliteDb.pragma("foreign_keys = ON");
    }
  }

  console.log(`✅ SQLite development database initialized at: ${SQLITE_PATH}`);
} else {
  // Production: PostgreSQL (Neon)
  neonConfig.webSocketConstructor = ws;

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set in production. Did you forget to provision a database?",
    );
  }

  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzlePg({ client: pool, schema });

  // Ensure extra tables (not in Drizzle schema) exist in PostgreSQL
  // Fire-and-forget — runs before first request thanks to Node.js event loop
  pool.query(`
    CREATE TABLE IF NOT EXISTS ncm_changes (
      id SERIAL PRIMARY KEY,
      ncm VARCHAR NOT NULL,
      field VARCHAR NOT NULL,
      old_value TEXT,
      new_value TEXT,
      status VARCHAR NOT NULL DEFAULT 'pending',
      scan_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reports (
      id VARCHAR PRIMARY KEY,
      name TEXT NOT NULL,
      type VARCHAR NOT NULL,
      format VARCHAR NOT NULL,
      status VARCHAR NOT NULL DEFAULT 'pending',
      file_path TEXT,
      created_by VARCHAR,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      error_message TEXT,
      download_count INTEGER NOT NULL DEFAULT 0,
      downloaded_by VARCHAR
    );
    CREATE TABLE IF NOT EXISTS scan_requests (
      id SERIAL PRIMARY KEY,
      requested_by VARCHAR NOT NULL,
      mode VARCHAR NOT NULL DEFAULT 'incompletos',
      status VARCHAR NOT NULL DEFAULT 'pending_thayssa',
      rejected_by VARCHAR,
      rejection_note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR;
  `).catch((err: Error) => {
    console.warn('[db] Aviso ao criar tabelas extras no PostgreSQL:', err.message);
  });

  console.log('✅ PostgreSQL production database initialized');
}

export { db, pool };
