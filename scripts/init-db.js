/**
 * Initialize the database
 * Run: npm run db:init
 */

import 'dotenv/config';
import { initDatabase } from '../src/db/init.js';

console.log('Initializing database...');
await initDatabase();
console.log('✓ Database initialized successfully');
process.exit(0);
