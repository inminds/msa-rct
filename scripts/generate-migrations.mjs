#!/usr/bin/env node
/**
 * Generate SQLite migrations for development
 * Run: node scripts/generate-migrations.mjs
 */

import { spawn } from 'child_process';
import { rmSync } from 'fs';
import path from 'path';

async function generate() {
    try {
        // Delete old migrations
        try {
            rmSync(path.join(process.cwd(), 'migrations'), { recursive: true });
            console.log('✅ Old migrations deleted');
        } catch (e) {
            // ignore
        }

        // Run drizzle-kit with NODE_ENV set
        console.log('📦 Generating SQLite migrations...');

        const proc = spawn('npx', ['drizzle-kit', 'generate'], {
            stdio: 'inherit',
            env: { ...process.env, NODE_ENV: 'development' },
            shell: true,
        });

        proc.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Migrations generated successfully!');
                process.exit(0);
            } else {
                console.error('❌ Failed to generate migrations');
                process.exit(1);
            }
        });
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

generate();
