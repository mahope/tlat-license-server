/**
 * Customer API routes
 * 
 * Public endpoints for customers to manage their licenses
 * Uses magic link authentication (email verification)
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/init.js';
import { sendPortalMagicLink } from '../services/email.js';
import { generalLimiter } from '../middleware/rate-limit.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const PORTAL_URL = process.env.PORTAL_URL || 'https://tutor-tracking.com/portal';

/**
 * Generate a magic link token (30 minutes expiry)
 */
function generateMagicToken(email) {
  return jwt.sign(
    { email, type: 'portal_access' },
    JWT_SECRET,
    { expiresIn: '30m' }
  );
}

/**
 * Verify magic link token
 */
function verifyMagicToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'portal_access') {
      return null;
    }
    return decoded;
  } catch (err) {
    return null;
  }
}

/**
 * POST /api/v1/customer/login
 * Request magic link to access license portal
 * 
 * Body: { email: string }
 * Response: { success: true, message: 'Check your email' }
 */
router.post('/login', generalLimiter, async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({
      success: false,
      error: 'missing_email',
      message: 'Email is required'
    });
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      error: 'invalid_email',
      message: 'Invalid email format'
    });
  }
  
  // Check if email has any licenses
  const db = getDb();
  const licenses = db.prepare('SELECT id FROM licenses WHERE email = ? LIMIT 1').get(email.toLowerCase());
  
  // Always return success to prevent email enumeration
  // But only send email if licenses exist
  if (licenses) {
    const token = generateMagicToken(email.toLowerCase());
    const portalLink = `${PORTAL_URL}?token=${token}`;
    
    try {
      await sendPortalMagicLink({ email: email.toLowerCase(), portalLink });
    } catch (err) {
      console.error('Failed to send magic link email:', err);
      // Still return success to prevent enumeration
    }
  }
  
  res.json({
    success: true,
    message: 'If this email has associated licenses, you will receive a login link shortly.'
  });
});

/**
 * GET /api/v1/customer/licenses
 * Get all licenses for authenticated customer
 * 
 * Query: { token: string }
 * Response: { licenses: [...] }
 */
router.get('/licenses', (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'missing_token',
      message: 'Authentication token required. Request a login link first.'
    });
  }
  
  const decoded = verifyMagicToken(token);
  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: 'invalid_token',
      message: 'Invalid or expired token. Please request a new login link.'
    });
  }
  
  const db = getDb();
  
  // Get all licenses for this email
  const licenses = db.prepare(`
    SELECT l.*, p.name as product_name, p.slug as product_slug, p.current_version
    FROM licenses l
    LEFT JOIN products p ON l.product_id = p.id
    WHERE l.email = ?
    ORDER BY l.created_at DESC
  `).all(decoded.email);
  
  // Enrich with activation data
  const enrichedLicenses = licenses.map(license => {
    const activations = db.prepare(`
      SELECT domain, site_url, activated_at, last_heartbeat, wp_version, plugin_version
      FROM activations
      WHERE license_id = ? AND is_active = 1
    `).all(license.id);
    
    const isExpired = license.expires_at && new Date(license.expires_at) < new Date();
    
    return {
      id: license.id,
      licenseKey: license.license_key,
      plan: license.plan,
      status: isExpired ? 'expired' : 'active',
      maxActivations: license.max_activations,
      expiresAt: license.expires_at,
      createdAt: license.created_at,
      product: license.product_name ? {
        name: license.product_name,
        slug: license.product_slug,
        currentVersion: license.current_version
      } : null,
      activations: activations.map(a => ({
        domain: a.domain,
        siteUrl: a.site_url,
        activatedAt: a.activated_at,
        lastHeartbeat: a.last_heartbeat,
        wpVersion: a.wp_version,
        pluginVersion: a.plugin_version
      }))
    };
  });
  
  res.json({
    success: true,
    email: decoded.email,
    licenses: enrichedLicenses
  });
});

/**
 * GET /api/v1/customer/download
 * Get download link for latest plugin version
 * 
 * Query: { token: string, product: string }
 */
router.get('/download', (req, res) => {
  const { token, product } = req.query;
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'missing_token',
      message: 'Authentication token required'
    });
  }
  
  const decoded = verifyMagicToken(token);
  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: 'invalid_token',
      message: 'Invalid or expired token'
    });
  }
  
  const db = getDb();
  
  // Verify user has a license for this product
  const license = db.prepare(`
    SELECT l.id, p.slug, p.current_version, p.download_url
    FROM licenses l
    JOIN products p ON l.product_id = p.id
    WHERE l.email = ? AND p.slug = ?
    LIMIT 1
  `).get(decoded.email, product || 'tutor-lms-tracking');
  
  if (!license) {
    return res.status(403).json({
      success: false,
      error: 'no_license',
      message: 'No valid license found for this product'
    });
  }
  
  // Generate time-limited download token (1 hour)
  const downloadToken = jwt.sign(
    { 
      email: decoded.email, 
      product: license.slug,
      type: 'download'
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  
  res.json({
    success: true,
    product: license.slug,
    version: license.current_version,
    downloadUrl: license.download_url || `https://tutor-tracking.com/download/${license.slug}/${license.current_version}?token=${downloadToken}`,
    expiresIn: '1 hour'
  });
});

/**
 * Middleware to verify customer token from Authorization header or query
 */
export function requireCustomerAuth(req, res, next) {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'missing_token',
      message: 'Authentication required'
    });
  }
  
  const decoded = verifyMagicToken(token);
  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: 'invalid_token',
      message: 'Invalid or expired token'
    });
  }
  
  req.customerEmail = decoded.email;
  next();
}

export default router;
