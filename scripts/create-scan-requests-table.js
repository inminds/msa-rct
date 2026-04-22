/**
 * Cria a tabela scan_requests no SQLite.
 * Executar uma vez: node scripts/create-scan-requests-table.js
 */
import Database from "better-sqlite3";

const db = new Database(".data/dev.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS scan_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requested_by TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_thayssa',
    rejected_by TEXT,
    rejection_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

console.log("Tabela scan_requests criada (ou já existia).");
db.close();
