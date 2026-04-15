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

  // Ensure database exists
  if (!fs.existsSync('./.data/dev.db')) {
    console.warn('⚠️  Database file not found. Run: npm run setup-dev');
  }

  const sqliteDb = new Database(db_path);
  sqliteDb.pragma('journal_mode = WAL'); // Better for concurrent access

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
