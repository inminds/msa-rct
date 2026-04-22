/**
 * Cria a tabela ncm_changes no SQLite.
 * Executar uma vez: node scripts/create-ncm-changes-table.js
 */
import Database from "better-sqlite3";

const db = new Database(".data/dev.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS ncm_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ncm TEXT NOT NULL,
    field TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    scan_date TEXT NOT NULL,
    resolved_at TEXT
  );
`);

console.log("Tabela ncm_changes criada (ou já existia).");
db.close();
