/**
 * License service - business logic for license operations
 */

import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/init.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

/**
 * Generate a new license key
 * Format: TLAT-XXXX-XXXX-XXXX-XXXX
 */
export function generateLicenseKey() {
  const segments = [];
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O, 0, I, 1 for clarity
  
  for (let i = 0; i < 4; i++) {
    let segment = '';
    for (let j = 0; j < 4; j++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    segments.push(segment);
  }
  
  return 'TLAT-' + segments.join('-');
}

/**
 * Create a new license
 */
export function createLicense({ productId = null, email, plan = 'standard', maxActivations = 1, expiresAt = null, metadata = null }) {
  const db = getDb();
  const licenseKey = generateLicenseKey();
  
  const stmt = db.prepare(`
    INSERT INTO licenses (license_key, product_id, email, plan, max_activations, expires_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    licenseKey,
    productId,
    email,
    plan,
    maxActivations,
    expiresAt,
    metadata ? JSON.stringify(metadata) : null
  );
  
  logAudit(result.lastInsertRowid, 'created', null, null, { email, plan, productId });
  
  return {
    id: result.lastInsertRowid,
    licenseKey,
    productId,
    email,
    plan,
    maxActivations,
    expiresAt
  };
}

/**
 * Get license by key
 */
export function getLicenseByKey(licenseKey) {
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM licenses WHERE license_key = ?`);
  return stmt.get(licenseKey);
}

/**
 * Get active activations for a license
 */
export function getActiveActivations(licenseId) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM activations 
    WHERE license_id = ? AND is_active = 1
  `);
  return stmt.all(licenseId);
}

/**
 * Check if a domain is a development/staging environment
 * These don't count toward the activation limit
 */
export function isDevEnvironment(domain) {
  if (!domain) return false;
  const d = domain.toLowerCase();
  
  // Localhost and local IPs
  if (d === 'localhost' || d === '127.0.0.1' || d.startsWith('192.168.') || d.startsWith('10.')) {
    return true;
  }
  
  // Common local/dev TLDs
  if (d.endsWith('.local') || d.endsWith('.test') || d.endsWith('.localhost') || d.endsWith('.dev')) {
    return true;
  }
  
  // Staging/dev subdomains
  if (d.startsWith('staging.') || d.startsWith('dev.') || d.startsWith('test.') || d.startsWith('local.')) {
    return true;
  }
  if (d.includes('.staging.') || d.includes('.dev.') || d.includes('.test.')) {
    return true;
  }
  
  // Common dev hosting patterns
  if (d.includes('.localwp.') || d.includes('.lndo.') || d.includes('.ddev.')) {
    return true;
  }
  
  return false;
}

/**
 * Activate a license for a domain
 * Dev/staging environments don't count toward activation limit
 */
export function activateLicense(licenseKey, domain, siteInfo = {}) {
  const db = getDb();
  const license = getLicenseByKey(licenseKey);
  
  if (!license) {
    return { success: false, error: 'invalid_key', message: 'License key not found' };
  }
  
  // Check expiration
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    return { success: false, error: 'expired', message: 'License has expired' };
  }
  
  // Check existing activations
  const activations = getActiveActivations(license.id);
  
  // Check if domain is already activated
  const existingActivation = activations.find(a => a.domain === domain);
  if (existingActivation) {
    // Reactivate/update heartbeat
    const updateStmt = db.prepare(`
      UPDATE activations 
      SET last_heartbeat = datetime('now'),
          wp_version = COALESCE(?, wp_version),
          plugin_version = COALESCE(?, plugin_version)
      WHERE id = ?
    `);
    updateStmt.run(siteInfo.wpVersion, siteInfo.pluginVersion, existingActivation.id);
    
    return {
      success: true,
      message: 'License already activated for this domain',
      activation: existingActivation,
      token: generateToken(license, domain),
      isDevEnvironment: isDevEnvironment(domain)
    };
  }
  
  // Check activation limit (dev environments don't count)
  const isDev = isDevEnvironment(domain);
  const productionActivations = activations.filter(a => !isDevEnvironment(a.domain));
  
  if (!isDev && productionActivations.length >= license.max_activations) {
    return { 
      success: false, 
      error: 'limit_reached', 
      message: `Maximum production activations (${license.max_activations}) reached. Dev/staging environments are unlimited.`,
      activations: activations.map(a => ({ 
        domain: a.domain, 
        activatedAt: a.activated_at,
        isDevEnvironment: isDevEnvironment(a.domain)
      }))
    };
  }
  
  // Create new activation
  const stmt = db.prepare(`
    INSERT INTO activations (license_id, domain, site_url, wp_version, plugin_version, last_heartbeat)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);
  
  const result = stmt.run(
    license.id,
    domain,
    siteInfo.siteUrl,
    siteInfo.wpVersion,
    siteInfo.pluginVersion
  );
  
  logAudit(license.id, 'activated', domain, siteInfo.ipAddress, siteInfo);
  
  // Calculate remaining (only count production activations)
  const newProductionCount = isDev ? productionActivations.length : productionActivations.length + 1;
  
  return {
    success: true,
    message: isDev 
      ? 'License activated for development environment (doesn\'t count toward limit)'
      : 'License activated successfully',
    activation: {
      id: result.lastInsertRowid,
      domain,
      activatedAt: new Date().toISOString(),
      isDevEnvironment: isDev
    },
    token: generateToken(license, domain),
    remaining: license.max_activations - newProductionCount,
    productionActivations: newProductionCount,
    devActivations: activations.filter(a => isDevEnvironment(a.domain)).length + (isDev ? 1 : 0)
  };
}

/**
 * Deactivate a license for a domain
 */
export function deactivateLicense(licenseKey, domain, ipAddress = null) {
  const db = getDb();
  const license = getLicenseByKey(licenseKey);
  
  if (!license) {
    return { success: false, error: 'invalid_key', message: 'License key not found' };
  }
  
  const stmt = db.prepare(`
    UPDATE activations 
    SET is_active = 0, deactivated_at = datetime('now')
    WHERE license_id = ? AND domain = ? AND is_active = 1
  `);
  
  const result = stmt.run(license.id, domain);
  
  if (result.changes === 0) {
    return { success: false, error: 'not_found', message: 'No active activation found for this domain' };
  }
  
  logAudit(license.id, 'deactivated', domain, ipAddress, null);
  
  const remaining = getActiveActivations(license.id).length;
  
  return {
    success: true,
    message: 'License deactivated successfully',
    remaining: license.max_activations - remaining
  };
}

/**
 * Validate a license (with optional token verification and product check)
 */
export function validateLicense(licenseKey, domain, token = null, productSlug = null) {
  const license = getLicenseByKey(licenseKey);
  
  if (!license) {
    return { valid: false, error: 'invalid_key', message: 'License key not found' };
  }
  
  // Check product match if productSlug provided
  if (productSlug && license.product_id) {
    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(license.product_id);
    if (product && product.slug !== productSlug) {
      return { 
        valid: false, 
        error: 'product_mismatch', 
        message: `License is for ${product.name}, not ${productSlug}` 
      };
    }
  }
  
  // Check expiration
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    return { valid: false, error: 'expired', message: 'License has expired', expiredAt: license.expires_at };
  }
  
  // Check if domain is activated
  const activations = getActiveActivations(license.id);
  const activation = activations.find(a => a.domain === domain);
  
  if (!activation) {
    return { 
      valid: false, 
      error: 'not_activated', 
      message: 'License not activated for this domain'
    };
  }
  
  // Verify token if provided
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.domain !== domain || decoded.licenseKey !== licenseKey) {
        return { valid: false, error: 'token_mismatch', message: 'Token does not match domain/license' };
      }
    } catch (err) {
      return { valid: false, error: 'invalid_token', message: 'Invalid or expired token' };
    }
  }
  
  // Get product info if available
  let productInfo = null;
  if (license.product_id) {
    const db = getDb();
    const product = db.prepare('SELECT slug, name, current_version FROM products WHERE id = ?').get(license.product_id);
    if (product) {
      productInfo = {
        slug: product.slug,
        name: product.name,
        latestVersion: product.current_version
      };
    }
  }
  
  return {
    valid: true,
    license: {
      plan: license.plan,
      email: license.email,
      expiresAt: license.expires_at,
      maxActivations: license.max_activations,
      currentActivations: activations.length
    },
    product: productInfo,
    activation: {
      domain: activation.domain,
      activatedAt: activation.activated_at
    }
  };
}

/**
 * Record heartbeat from a site
 */
export function recordHeartbeat(licenseKey, domain, siteInfo = {}) {
  const db = getDb();
  const license = getLicenseByKey(licenseKey);
  
  if (!license) {
    return { success: false, error: 'invalid_key' };
  }
  
  const stmt = db.prepare(`
    UPDATE activations 
    SET last_heartbeat = datetime('now'),
        wp_version = COALESCE(?, wp_version),
        plugin_version = COALESCE(?, plugin_version)
    WHERE license_id = ? AND domain = ? AND is_active = 1
  `);
  
  const result = stmt.run(
    siteInfo.wpVersion,
    siteInfo.pluginVersion,
    license.id,
    domain
  );
  
  if (result.changes === 0) {
    return { success: false, error: 'not_activated', message: 'No active activation for this domain' };
  }
  
  // Check if license is still valid
  const isExpired = license.expires_at && new Date(license.expires_at) < new Date();
  
  return {
    success: true,
    valid: !isExpired,
    expiresAt: license.expires_at,
    plan: license.plan
  };
}

/**
 * Generate JWT token for activated domain
 */
function generateToken(license, domain) {
  return jwt.sign(
    {
      licenseKey: license.license_key,
      domain,
      plan: license.plan,
      exp: license.expires_at 
        ? Math.floor(new Date(license.expires_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year default
    },
    JWT_SECRET
  );
}

/**
 * Log audit event
 */
function logAudit(licenseId, action, domain, ipAddress, details) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO audit_log (license_id, action, domain, ip_address, details)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(licenseId, action, domain, ipAddress, details ? JSON.stringify(details) : null);
}

export default {
  generateLicenseKey,
  createLicense,
  getLicenseByKey,
  getActiveActivations,
  activateLicense,
  deactivateLicense,
  validateLicense,
  recordHeartbeat,
  isDevEnvironment
};
