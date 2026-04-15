/**
 * Clear Data Script
 * Removes all uploads, NCM items, and tributes from the development database
 * Run: npm run clear-data
 */

import { db } from './db';
import { uploads, ncmItems, tributes } from '@shared/schema';

async function clearData() {
    try {
        console.log('🗑️  Starting database cleanup...');

        // Delete in correct order due to foreign key constraints
        console.log('🗑️  Deleting tributes...');
        await db.delete(tributes);

        console.log('🗑️  Deleting NCM items...');
        await db.delete(ncmItems);

        console.log('🗑️  Deleting uploads...');
        await db.delete(uploads);

        console.log('✅ All data cleared successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error clearing data:', error);
        process.exit(1);
    }
}

clearData();
