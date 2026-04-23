import * as schema from "@shared/schema";
import Database from 'better-sqlite3';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import fs from 'fs';

let db: any;
let pool: any;

const isDev = process.env.NODE_ENV === 'development';

if (isDev) {
  // ✅ Development: SQLite (zero config, file-based)
  const db_path = './.data/dev.db';

  if (!fs.existsSync('./.data')) {
    fs.mkdirSync('./.data', { recursive: true });
  }

  const sqliteDb = new Database(db_path);
  sqliteDb.pragma('journal_mode = WAL'); // Better for concurrent access

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
  `);

  db = drizzleSqlite({ client: sqliteDb, schema });

  console.log(`✅ SQLite development database initialized at: ${db_path}`);
} else {
  // Production: PostgreSQL (Neon)
  neonConfig.webSocketConstructor = ws;

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set in production. Did you forget to provision a database?",
    );
  }

  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzleNeon({ client: pool, schema });

  console.log('✅ PostgreSQL production database initialized');
}

export { db, pool };
