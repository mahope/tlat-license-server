/**
 * Database initialization
 */

import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '../../data/licenses.db');

let db = null;

/**
 * Get database instance (singleton)
 */
export function getDb() {
  if (!db) {
    // Ensure data directory exists
    const dataDir = dirname(DB_PATH);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

/**
 * Initialize database schema
 */
export async function initDatabase() {
  const db = getDb();

  // Products table (for multi-plugin support)
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      current_version TEXT DEFAULT '1.0.0',
      download_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Licenses table
  db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT UNIQUE NOT NULL,
      product_id INTEGER,
      email TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'standard',
      max_activations INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    )
  `);

  // Activations table (tracks which domains are using a license)
  db.exec(`
    CREATE TABLE IF NOT EXISTS activations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id INTEGER NOT NULL,
      domain TEXT NOT NULL,
      site_url TEXT,
      wp_version TEXT,
      plugin_version TEXT,
      activated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_heartbeat TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      deactivated_at TEXT,
      FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE,
      UNIQUE(license_id, domain)
    )
  `);

  // Audit log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id INTEGER,
      action TEXT NOT NULL,
      domain TEXT,
      ip_address TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
    CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
    CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
    CREATE INDEX IF NOT EXISTS idx_licenses_product ON licenses(product_id);
    CREATE INDEX IF NOT EXISTS idx_activations_license ON activations(license_id);
    CREATE INDEX IF NOT EXISTS idx_activations_domain ON activations(domain);
    CREATE INDEX IF NOT EXISTS idx_audit_license ON audit_log(license_id);
  `);

  return db;
}

export default { getDb, initDatabase };
