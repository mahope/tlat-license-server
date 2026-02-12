/**
 * Rate limiting middleware
 * 
 * Different limits for different endpoint types:
 * - License API: moderate limits to allow legitimate plugin requests
 * - Admin API: higher limits for dashboard operations
 * - Activation: strict limits to prevent abuse
 */

import rateLimit from 'express-rate-limit';

/**
 * Normalize IPv6 addresses to prevent bypass
 * Converts IPv6-mapped IPv4 (::ffff:1.2.3.4) to IPv4 format
 */
const normalizeIp = (ip) => {
  if (!ip) return 'unknown';
  // Handle IPv6-mapped IPv4 addresses
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  // For IPv6, use first 64 bits (network prefix) to group requests
  if (ip.includes(':')) {
    const parts = ip.split(':').slice(0, 4);
    return parts.join(':');
  }
  return ip;
};

// Key generator: use normalized IP + domain for license endpoints
const licenseKeyGenerator = (req) => {
  const domain = req.body?.domain || req.query?.domain || 'unknown';
  const ip = normalizeIp(req.ip);
  return `${ip}-${domain}`;
};

/**
 * General API rate limit
 * 100 requests per 15 minutes per IP
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'rate_limited',
    message: 'Too many requests, please try again later',
    retryAfter: 15 * 60
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
});

/**
 * License activation rate limit
 * Stricter: 10 activations per hour per IP
 * Prevents abuse of activation endpoint
 */
export const activationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: licenseKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: 'activation_rate_limited',
    message: 'Too many activation attempts. Please wait before trying again.',
    retryAfter: 60 * 60
  }
});

/**
 * Validation/heartbeat rate limit
 * More lenient: 60 requests per minute per IP+domain
 * Allows frequent validation checks from plugins
 */
export const validationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  keyGenerator: licenseKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  message: {
    valid: false,
    error: 'validation_rate_limited',
    message: 'Too many validation requests. Please slow down.',
    retryAfter: 60
  }
});

/**
 * Admin API rate limit
 * Higher limits for admin operations: 200 per 15 minutes
 */
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'admin_rate_limited',
    message: 'Too many admin requests. Please try again later.',
    retryAfter: 15 * 60
  }
});

/**
 * Strict limiter for sensitive operations
 * 5 requests per 5 minutes (for potential future use like password reset)
 */
export const strictLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'strict_rate_limited',
    message: 'Rate limit exceeded for this operation.',
    retryAfter: 5 * 60
  }
});
