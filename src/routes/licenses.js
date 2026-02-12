/**
 * License API routes
 * 
 * Public endpoints for plugin license validation
 */

import { Router } from 'express';
import * as licenseService from '../services/license.js';

const router = Router();

/**
 * POST /api/v1/license/activate
 * Activate a license for a domain
 */
router.post('/activate', (req, res) => {
  const { license_key, domain, site_url, wp_version, plugin_version } = req.body;
  
  if (!license_key || !domain) {
    return res.status(400).json({
      success: false,
      error: 'missing_params',
      message: 'license_key and domain are required'
    });
  }
  
  const result = licenseService.activateLicense(license_key, domain, {
    siteUrl: site_url,
    wpVersion: wp_version,
    pluginVersion: plugin_version,
    ipAddress: req.ip
  });
  
  const status = result.success ? 200 : (result.error === 'invalid_key' ? 404 : 400);
  res.status(status).json(result);
});

/**
 * POST /api/v1/license/deactivate
 * Deactivate a license for a domain
 */
router.post('/deactivate', (req, res) => {
  const { license_key, domain } = req.body;
  
  if (!license_key || !domain) {
    return res.status(400).json({
      success: false,
      error: 'missing_params',
      message: 'license_key and domain are required'
    });
  }
  
  const result = licenseService.deactivateLicense(license_key, domain, req.ip);
  
  const status = result.success ? 200 : (result.error === 'invalid_key' ? 404 : 400);
  res.status(status).json(result);
});

/**
 * POST /api/v1/license/validate
 * Validate a license (check if valid and activated for domain)
 */
router.post('/validate', (req, res) => {
  const { license_key, domain, token } = req.body;
  
  if (!license_key || !domain) {
    return res.status(400).json({
      valid: false,
      error: 'missing_params',
      message: 'license_key and domain are required'
    });
  }
  
  const result = licenseService.validateLicense(license_key, domain, token);
  
  res.status(result.valid ? 200 : 400).json(result);
});

/**
 * POST /api/v1/license/heartbeat
 * Record heartbeat from active installation
 */
router.post('/heartbeat', (req, res) => {
  const { license_key, domain, wp_version, plugin_version } = req.body;
  
  if (!license_key || !domain) {
    return res.status(400).json({
      success: false,
      error: 'missing_params',
      message: 'license_key and domain are required'
    });
  }
  
  const result = licenseService.recordHeartbeat(license_key, domain, {
    wpVersion: wp_version,
    pluginVersion: plugin_version
  });
  
  res.status(result.success ? 200 : 400).json(result);
});

/**
 * GET /api/v1/license/status
 * Quick status check for a license (requires X-License-Key header)
 */
router.get('/status', (req, res) => {
  const licenseKey = req.headers['x-license-key'];
  const domain = req.query.domain;
  
  if (!licenseKey) {
    return res.status(401).json({
      valid: false,
      error: 'missing_key',
      message: 'X-License-Key header required'
    });
  }
  
  if (!domain) {
    return res.status(400).json({
      valid: false,
      error: 'missing_domain',
      message: 'domain query parameter required'
    });
  }
  
  const result = licenseService.validateLicense(licenseKey, domain);
  res.status(result.valid ? 200 : 400).json(result);
});

export default router;
