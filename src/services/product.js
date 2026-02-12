/**
 * Product service - manage multiple plugins/products
 */

import { getDb } from '../db/init.js';

/**
 * Create a new product
 */
export function createProduct({ slug, name, description, currentVersion = '1.0.0', downloadUrl = null }) {
  const db = getDb();
  
  const stmt = db.prepare(`
    INSERT INTO products (slug, name, description, current_version, download_url)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(slug, name, description, currentVersion, downloadUrl);
  
  return {
    id: result.lastInsertRowid,
    slug,
    name,
    description,
    currentVersion,
    downloadUrl
  };
}

/**
 * Get product by ID
 */
export function getProductById(id) {
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM products WHERE id = ?`);
  return stmt.get(id);
}

/**
 * Get product by slug
 */
export function getProductBySlug(slug) {
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM products WHERE slug = ?`);
  return stmt.get(slug);
}

/**
 * Get all active products
 */
export function getAllProducts(includeInactive = false) {
  const db = getDb();
  const stmt = includeInactive
    ? db.prepare(`SELECT * FROM products ORDER BY name`)
    : db.prepare(`SELECT * FROM products WHERE is_active = 1 ORDER BY name`);
  return stmt.all();
}

/**
 * Update product
 */
export function updateProduct(id, updates) {
  const db = getDb();
  
  const fields = [];
  const values = [];
  
  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.currentVersion !== undefined) {
    fields.push('current_version = ?');
    values.push(updates.currentVersion);
  }
  if (updates.downloadUrl !== undefined) {
    fields.push('download_url = ?');
    values.push(updates.downloadUrl);
  }
  if (updates.isActive !== undefined) {
    fields.push('is_active = ?');
    values.push(updates.isActive ? 1 : 0);
  }
  
  if (fields.length === 0) {
    return getProductById(id);
  }
  
  fields.push('updated_at = datetime("now")');
  values.push(id);
  
  const stmt = db.prepare(`
    UPDATE products SET ${fields.join(', ')} WHERE id = ?
  `);
  
  stmt.run(...values);
  return getProductById(id);
}

/**
 * Delete product (soft delete by setting is_active = 0)
 */
export function deleteProduct(id) {
  return updateProduct(id, { isActive: false });
}

/**
 * Get license count per product
 */
export function getProductStats(productId) {
  const db = getDb();
  
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total_licenses,
      SUM(CASE WHEN expires_at IS NULL OR expires_at > datetime('now') THEN 1 ELSE 0 END) as active_licenses,
      SUM(CASE WHEN plan = 'lifetime' THEN 1 ELSE 0 END) as lifetime_licenses
    FROM licenses 
    WHERE product_id = ?
  `);
  
  return stmt.get(productId);
}

export default {
  createProduct,
  getProductById,
  getProductBySlug,
  getAllProducts,
  updateProduct,
  deleteProduct,
  getProductStats
};
