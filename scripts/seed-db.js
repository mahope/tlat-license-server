/**
 * Seed the database with test data
 * Run: npm run db:seed
 */

import 'dotenv/config';
import { initDatabase } from '../src/db/init.js';
import { createLicense, activateLicense } from '../src/services/license.js';

await initDatabase();

console.log('Seeding database with test data...\n');

// Create test licenses
const licenses = [
  { email: 'test@example.com', plan: 'standard', maxActivations: 1 },
  { email: 'pro@example.com', plan: 'pro', maxActivations: 3 },
  { email: 'agency@example.com', plan: 'agency', maxActivations: 10 },
  { email: 'ltd@example.com', plan: 'lifetime', maxActivations: 5, expiresAt: null },
  { email: 'expired@example.com', plan: 'standard', maxActivations: 1, expiresAt: '2024-01-01' }
];

for (const data of licenses) {
  const license = createLicense(data);
  console.log(`Created: ${license.licenseKey} (${data.plan}) - ${data.email}`);
  
  // Activate some licenses
  if (data.email === 'test@example.com') {
    activateLicense(license.licenseKey, 'test.local', {
      siteUrl: 'https://test.local',
      wpVersion: '6.4',
      pluginVersion: '1.0.0'
    });
    console.log('  → Activated on test.local');
  }
  
  if (data.email === 'pro@example.com') {
    activateLicense(license.licenseKey, 'site1.example.com', { wpVersion: '6.4' });
    activateLicense(license.licenseKey, 'site2.example.com', { wpVersion: '6.3' });
    console.log('  → Activated on site1.example.com, site2.example.com');
  }
}

console.log('\n✓ Database seeded successfully');
process.exit(0);
