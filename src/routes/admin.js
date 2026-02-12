/**
 * Admin API routes
 * 
 * Protected endpoints for license management
 * Requires ADMIN_API_KEY in Authorization header
 */

import { Router } from 'express';
import * as licenseService from '../services/license.js';
import { getDb } from '../db/init.js';

const router = Router();

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'dev-admin-key';

/**
 * Admin auth middleware
 */
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  
  const token = authHeader.slice(7);
  if (token !== ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Invalid admin key' });
  }
  
  next();
}

router.use(requireAdmin);

/**
 * POST /api/v1/admin/licenses
 * Create a new license
 */
router.post('/licenses', (req, res) => {
  const { email, plan, max_activations, expires_at, metadata } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }
  
  try {
    const license = licenseService.createLicense({
      email,
      plan: plan || 'standard',
      maxActivations: max_activations || 1,
      expiresAt: expires_at || null,
      metadata
    });
    
    res.status(201).json(license);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/admin/licenses
 * List all licenses
 */
router.get('/licenses', (req, res) => {
  const db = getDb();
  const { email, plan, limit = 50, offset = 0 } = req.query;
  
  let query = 'SELECT * FROM licenses WHERE 1=1';
  const params = [];
  
  if (email) {
    query += ' AND email LIKE ?';
    params.push(`%${email}%`);
  }
  
  if (plan) {
    query += ' AND plan = ?';
    params.push(plan);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  
  const licenses = db.prepare(query).all(...params);
  
  // Get activation counts
  const enriched = licenses.map(license => {
    const activations = licenseService.getActiveActivations(license.id);
    return {
      ...license,
      activeActivations: activations.length,
      activations: activations.map(a => ({
        domain: a.domain,
        activatedAt: a.activated_at,
        lastHeartbeat: a.last_heartbeat
      }))
    };
  });
  
  res.json({ licenses: enriched, count: enriched.length });
});

/**
 * GET /api/v1/admin/licenses/:key
 * Get license details by key
 */
router.get('/licenses/:key', (req, res) => {
  const license = licenseService.getLicenseByKey(req.params.key);
  
  if (!license) {
    return res.status(404).json({ error: 'License not found' });
  }
  
  const activations = licenseService.getActiveActivations(license.id);
  
  res.json({
    ...license,
    activeActivations: activations.length,
    activations
  });
});

/**
 * DELETE /api/v1/admin/licenses/:key
 * Delete a license
 */
router.delete('/licenses/:key', (req, res) => {
  const db = getDb();
  const license = licenseService.getLicenseByKey(req.params.key);
  
  if (!license) {
    return res.status(404).json({ error: 'License not found' });
  }
  
  const stmt = db.prepare('DELETE FROM licenses WHERE id = ?');
  stmt.run(license.id);
  
  res.json({ success: true, message: 'License deleted' });
});

/**
 * PATCH /api/v1/admin/licenses/:key
 * Update a license
 */
router.patch('/licenses/:key', (req, res) => {
  const db = getDb();
  const license = licenseService.getLicenseByKey(req.params.key);
  
  if (!license) {
    return res.status(404).json({ error: 'License not found' });
  }
  
  const { plan, max_activations, expires_at, email } = req.body;
  const updates = [];
  const params = [];
  
  if (plan) {
    updates.push('plan = ?');
    params.push(plan);
  }
  if (max_activations) {
    updates.push('max_activations = ?');
    params.push(max_activations);
  }
  if (expires_at !== undefined) {
    updates.push('expires_at = ?');
    params.push(expires_at);
  }
  if (email) {
    updates.push('email = ?');
    params.push(email);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  
  updates.push("updated_at = datetime('now')");
  params.push(license.id);
  
  const stmt = db.prepare(`UPDATE licenses SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);
  
  res.json({ success: true, message: 'License updated' });
});

/**
 * GET /api/v1/admin/stats
 * Get overall statistics
 */
router.get('/stats', (req, res) => {
  const db = getDb();
  
  const totalLicenses = db.prepare('SELECT COUNT(*) as count FROM licenses').get().count;
  const totalActivations = db.prepare('SELECT COUNT(*) as count FROM activations WHERE is_active = 1').get().count;
  const expiredLicenses = db.prepare("SELECT COUNT(*) as count FROM licenses WHERE expires_at < datetime('now')").get().count;
  
  const byPlan = db.prepare(`
    SELECT plan, COUNT(*) as count 
    FROM licenses 
    GROUP BY plan
  `).all();
  
  const recentActivations = db.prepare(`
    SELECT a.domain, a.activated_at, l.license_key, l.email
    FROM activations a
    JOIN licenses l ON a.license_id = l.id
    WHERE a.is_active = 1
    ORDER BY a.activated_at DESC
    LIMIT 10
  `).all();
  
  res.json({
    totalLicenses,
    totalActivations,
    expiredLicenses,
    byPlan: Object.fromEntries(byPlan.map(p => [p.plan, p.count])),
    recentActivations
  });
});

export default router;
