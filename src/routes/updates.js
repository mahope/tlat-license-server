/**
 * Plugin Update API routes
 * 
 * Endpoints for WordPress plugin update system integration
 * Works with pre_set_site_transient_update_plugins filter
 */

import { Router } from 'express';
import * as updateService from '../services/update.js';
import * as licenseService from '../services/license.js';
import { validationLimiter } from '../middleware/rate-limit.js';

const router = Router();

/**
 * POST /api/v1/update/check
 * Check for plugin updates
 * 
 * WordPress sends: plugin slug, current version, license key, domain
 * Returns: update info if available, or current version info
 * 
 * Rate limited to prevent abuse
 */
router.post('/check', validationLimiter, (req, res) => {
  const { 
    slug = 'tutor-lms-advanced-tracking',
    version: currentVersion,
    license_key,
    domain,
    wp_version,
    php_version
  } = req.body;

  // Get update info (works even without license for version check)
  const updateInfo = updateService.checkForUpdate(slug, currentVersion);
  
  // If license provided, validate it for download access
  let licenseValid = false;
  let downloadUrl = null;
  
  if (license_key && domain) {
    const licenseResult = licenseService.validateLicense(license_key, domain);
    licenseValid = licenseResult.valid;
    
    if (licenseValid && updateInfo.hasUpdate) {
      // Generate signed download URL
      downloadUrl = updateService.getSignedDownloadUrl(
        slug, 
        updateInfo.newVersion, 
        license_key,
        domain
      );
    }
  }

  res.json({
    success: true,
    slug,
    currentVersion: currentVersion || 'unknown',
    latestVersion: updateInfo.newVersion,
    hasUpdate: updateInfo.hasUpdate,
    updateInfo: updateInfo.hasUpdate ? {
      version: updateInfo.newVersion,
      downloadUrl,
      changelog: updateInfo.changelog,
      testedUpTo: updateInfo.testedUpTo,
      requiresWP: updateInfo.requiresWP,
      requiresPHP: updateInfo.requiresPHP,
      releaseDate: updateInfo.releaseDate,
      urgent: updateInfo.urgent || false
    } : null,
    licenseValid
  });
});

/**
 * GET /api/v1/update/info/:slug
 * Get full plugin info for WordPress plugin API
 * 
 * Returns data compatible with plugins_api filter
 */
router.get('/info/:slug', (req, res) => {
  const { slug } = req.params;
  
  const info = updateService.getPluginInfo(slug);
  
  if (!info) {
    return res.status(404).json({
      success: false,
      error: 'plugin_not_found',
      message: `Plugin ${slug} not found`
    });
  }

  // Return WordPress-compatible plugin info
  res.json(info);
});

/**
 * GET /api/v1/update/download/:slug/:version
 * Download plugin zip with signed token
 * 
 * Query params: token (signed download token from /check)
 */
router.get('/download/:slug/:version', (req, res) => {
  const { slug, version } = req.params;
  const { token } = req.query;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'missing_token',
      message: 'Download token required. Get it from /api/v1/update/check'
    });
  }

  // Validate download token
  const validation = updateService.validateDownloadToken(token, slug, version);
  
  if (!validation.valid) {
    return res.status(403).json({
      success: false,
      error: validation.error,
      message: validation.message
    });
  }

  // Get download path
  const downloadPath = updateService.getDownloadPath(slug, version);
  
  if (!downloadPath) {
    return res.status(404).json({
      success: false,
      error: 'file_not_found',
      message: `Version ${version} not found for ${slug}`
    });
  }

  // Log download for analytics
  updateService.logDownload(slug, version, validation.domain, req.ip);

  // Send file
  res.download(downloadPath, `${slug}-${version}.zip`);
});

/**
 * GET /api/v1/update/changelog/:slug
 * Get changelog for all versions
 */
router.get('/changelog/:slug', (req, res) => {
  const { slug } = req.params;
  const changelog = updateService.getChangelog(slug);
  
  if (!changelog) {
    return res.status(404).json({
      success: false,
      error: 'not_found',
      message: `Changelog not found for ${slug}`
    });
  }

  res.json({
    success: true,
    slug,
    changelog
  });
});

/**
 * GET /api/v1/update/hash/:slug/:version
 * Get file hash for verification
 */
router.get('/hash/:slug/:version', (req, res) => {
  const { slug, version } = req.params;
  const hash = updateService.getFileHash(slug, version);
  
  if (!hash) {
    return res.status(404).json({
      success: false,
      error: 'not_found'
    });
  }

  res.json({
    success: true,
    slug,
    version,
    hash: hash.sha256,
    algorithm: 'sha256'
  });
});

export default router;
