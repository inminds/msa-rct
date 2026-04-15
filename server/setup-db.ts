/**
 * Database Setup Script
 * Initializes SQLite schema for local development
 * Run: npx tsx server/setup-db.ts
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

async function setupDatabase() {
    try {
        // Ensure .data directory exists
        if (!fs.existsSync('./.data')) {
            fs.mkdirSync('./.data', { recursive: true });
            console.log('✅ Created .data directory');
        }

        // Initialize SQLite
        const sqlite = new Database('./.data/dev.db');
        sqlite.pragma('journal_mode = WAL');

        console.log('📦 Setting up database schema...');

        // Create tables with SQLite-compatible syntax
        const statements = [
            // Users table
            `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR PRIMARY KEY,
        email VARCHAR UNIQUE,
        first_name VARCHAR,
        last_name VARCHAR,
        profile_image_url VARCHAR,
        role VARCHAR DEFAULT 'USER',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

            // Sessions table
            `CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR PRIMARY KEY,
        sess TEXT NOT NULL,
        expire TIMESTAMP NOT NULL
      )`,

            // Uploads table
            `CREATE TABLE IF NOT EXISTS uploads (
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
      )`,

            // NCM Items table
            `CREATE TABLE IF NOT EXISTS ncm_items (
        id VARCHAR PRIMARY KEY,
        ncm_code VARCHAR(8) NOT NULL,
        description TEXT,
        product_name TEXT,
        upload_id VARCHAR NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (upload_id) REFERENCES uploads(id)
      )`,

            // Tributes table
            `CREATE TABLE IF NOT EXISTS tributes (
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
      )`,

            // Law change logs table
            `CREATE TABLE IF NOT EXISTS law_change_logs (
        id VARCHAR PRIMARY KEY,
        tribute VARCHAR NOT NULL,
        jurisdiction VARCHAR NOT NULL,
        description TEXT NOT NULL,
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        previous_content TEXT,
        new_content TEXT,
        source_url TEXT
      )`,

            // Create index for sessions
            `CREATE INDEX IF NOT EXISTS IDX_session_expire ON sessions(expire)`,
        ];

        // Execute all statements
        for (const stmt of statements) {
            sqlite.exec(stmt);
        }

        console.log('✅ Database schema created successfully!');
        console.log('📁 Database file: .data/dev.db');
        console.log('✏️  You can now run: npm run dev');
        sqlite.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Database setup failed:', error);
        process.exit(1);
    }
}

setupDatabase();
