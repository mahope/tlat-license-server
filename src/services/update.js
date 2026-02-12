/**
 * Update Service
 * 
 * Manages plugin versions, downloads, and update manifests
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const RELEASES_DIR = join(DATA_DIR, 'releases');
const MANIFESTS_FILE = join(DATA_DIR, 'update-manifest.json');

// JWT secret for download tokens (short-lived)
const DOWNLOAD_SECRET = process.env.JWT_SECRET || process.env.ADMIN_API_KEY || 'change-me-in-production';

/**
 * Load update manifest from disk
 */
function loadManifest() {
  if (!existsSync(MANIFESTS_FILE)) {
    // Create default manifest
    const defaultManifest = {
      plugins: {
        'tutor-lms-advanced-tracking': {
          name: 'Advanced Tutor LMS Stats Dashboard',
          slug: 'tutor-lms-advanced-tracking',
          latestVersion: '1.0.1',
          testedUpTo: '6.6',
          requiresWP: '5.0',
          requiresPHP: '7.4',
          homepage: 'https://tutor-tracking.com',
          authorName: 'Mads Holst Jensen',
          authorUrl: 'https://mahope.dk',
          bannerLow: 'https://tutor-tracking.com/assets/banner-772x250.jpg',
          bannerHigh: 'https://tutor-tracking.com/assets/banner-1544x500.jpg',
          versions: {
            '1.0.1': {
              releaseDate: '2026-02-12',
              changelog: '- Initial release with license validation\n- Course completion tracking\n- Student progress analytics\n- Funnel visualization\n- Cohort analysis\n- CSV/JSON export',
              downloadFile: 'tutor-lms-advanced-tracking-1.0.1.zip',
              sha256: null, // Will be set when zip is uploaded
              urgent: false
            }
          }
        }
      },
      updatedAt: new Date().toISOString()
    };
    
    writeFileSync(MANIFESTS_FILE, JSON.stringify(defaultManifest, null, 2));
    return defaultManifest;
  }
  
  return JSON.parse(readFileSync(MANIFESTS_FILE, 'utf8'));
}

/**
 * Compare semantic versions
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * Check if update is available
 */
export function checkForUpdate(slug, currentVersion) {
  const manifest = loadManifest();
  const plugin = manifest.plugins[slug];
  
  if (!plugin) {
    return {
      hasUpdate: false,
      error: 'plugin_not_found'
    };
  }

  const latestVersion = plugin.latestVersion;
  const hasUpdate = currentVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;
  
  const versionInfo = plugin.versions[latestVersion] || {};
  
  return {
    hasUpdate,
    newVersion: latestVersion,
    changelog: versionInfo.changelog,
    testedUpTo: plugin.testedUpTo,
    requiresWP: plugin.requiresWP,
    requiresPHP: plugin.requiresPHP,
    releaseDate: versionInfo.releaseDate,
    urgent: versionInfo.urgent || false
  };
}

/**
 * Get full plugin info for WordPress plugins_api
 */
export function getPluginInfo(slug) {
  const manifest = loadManifest();
  const plugin = manifest.plugins[slug];
  
  if (!plugin) return null;

  const latestVersionInfo = plugin.versions[plugin.latestVersion] || {};
  
  // Build sections HTML for WordPress
  const sections = {
    description: `<p>${plugin.name} extends Tutor LMS with advanced analytics and insights.</p>
<h4>Features</h4>
<ul>
<li>Course completion tracking</li>
<li>Student progress analytics</li>
<li>Funnel visualization</li>
<li>Cohort analysis</li>
<li>CSV/JSON export</li>
</ul>`,
    installation: `<ol>
<li>Upload the plugin files to the /wp-content/plugins/ directory</li>
<li>Activate the plugin through the 'Plugins' screen in WordPress</li>
<li>Go to Settings → TLAT License to enter your license key</li>
<li>Access analytics from the "TLAT Stats" menu</li>
</ol>`,
    changelog: formatChangelogHtml(plugin.versions),
    faq: `<h4>What WordPress versions are supported?</h4>
<p>WordPress ${plugin.requiresWP} or higher, tested up to ${plugin.testedUpTo}.</p>
<h4>Does this work with Tutor LMS Free?</h4>
<p>Yes! Both Free and Pro versions of Tutor LMS are supported.</p>`
  };

  return {
    name: plugin.name,
    slug: plugin.slug,
    version: plugin.latestVersion,
    author: `<a href="${plugin.authorUrl}">${plugin.authorName}</a>`,
    author_profile: plugin.authorUrl,
    requires: plugin.requiresWP,
    tested: plugin.testedUpTo,
    requires_php: plugin.requiresPHP,
    homepage: plugin.homepage,
    sections,
    banners: {
      low: plugin.bannerLow,
      high: plugin.bannerHigh
    },
    last_updated: latestVersionInfo.releaseDate,
    added: '2026-02-01',
    active_installs: 10,
    rating: 100,
    num_ratings: 1,
    downloaded: 50
  };
}

/**
 * Format changelog as HTML for WordPress
 */
function formatChangelogHtml(versions) {
  const sortedVersions = Object.keys(versions).sort((a, b) => compareVersions(b, a));
  
  let html = '';
  for (const version of sortedVersions) {
    const info = versions[version];
    html += `<h4>${version} - ${info.releaseDate}</h4>\n<ul>\n`;
    
    const lines = info.changelog.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const text = line.replace(/^-\s*/, '');
      html += `<li>${text}</li>\n`;
    }
    html += '</ul>\n';
  }
  
  return html;
}

/**
 * Generate signed download URL
 */
export function getSignedDownloadUrl(slug, version, licenseKey, domain) {
  const baseUrl = process.env.BASE_URL || 'https://licenses.holstjensen.eu';
  
  // Create short-lived JWT token (1 hour)
  const token = jwt.sign(
    {
      slug,
      version,
      domain,
      licenseKey: licenseKey.substring(0, 8) + '...', // Partial for logging
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
    },
    DOWNLOAD_SECRET,
    { algorithm: 'HS256' }
  );

  return `${baseUrl}/api/v1/update/download/${slug}/${version}?token=${token}`;
}

/**
 * Validate download token
 */
export function validateDownloadToken(token, slug, version) {
  try {
    const decoded = jwt.verify(token, DOWNLOAD_SECRET);
    
    if (decoded.slug !== slug) {
      return { valid: false, error: 'slug_mismatch', message: 'Token not valid for this plugin' };
    }
    
    if (decoded.version !== version) {
      return { valid: false, error: 'version_mismatch', message: 'Token not valid for this version' };
    }
    
    return { 
      valid: true, 
      domain: decoded.domain,
      licenseKey: decoded.licenseKey
    };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { valid: false, error: 'token_expired', message: 'Download link has expired. Request a new one.' };
    }
    return { valid: false, error: 'invalid_token', message: 'Invalid download token' };
  }
}

/**
 * Get download file path
 */
export function getDownloadPath(slug, version) {
  const manifest = loadManifest();
  const plugin = manifest.plugins[slug];
  
  if (!plugin || !plugin.versions[version]) {
    return null;
  }

  const filename = plugin.versions[version].downloadFile;
  const filePath = join(RELEASES_DIR, slug, filename);
  
  if (!existsSync(filePath)) {
    return null;
  }

  return filePath;
}

/**
 * Get file hash for verification
 */
export function getFileHash(slug, version) {
  const manifest = loadManifest();
  const plugin = manifest.plugins[slug];
  
  if (!plugin || !plugin.versions[version]) {
    return null;
  }

  // Return stored hash or calculate on the fly
  if (plugin.versions[version].sha256) {
    return { sha256: plugin.versions[version].sha256 };
  }

  const filePath = getDownloadPath(slug, version);
  if (!filePath) return null;

  const fileBuffer = readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  
  return { sha256: hash };
}

/**
 * Get changelog for all versions
 */
export function getChangelog(slug) {
  const manifest = loadManifest();
  const plugin = manifest.plugins[slug];
  
  if (!plugin) return null;

  return Object.entries(plugin.versions)
    .map(([version, info]) => ({
      version,
      releaseDate: info.releaseDate,
      changes: info.changelog.split('\n').filter(l => l.trim()).map(l => l.replace(/^-\s*/, '')),
      urgent: info.urgent || false
    }))
    .sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * Log download for analytics
 */
export function logDownload(slug, version, domain, ip) {
  // For now, just log to console. Could be expanded to store in DB
  console.log(`[DOWNLOAD] ${slug}@${version} by ${domain} from ${ip} at ${new Date().toISOString()}`);
}
