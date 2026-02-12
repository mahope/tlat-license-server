/**
 * Webhook handlers for external services
 */

import { Router } from 'express';
import crypto from 'crypto';
import { createLicense } from '../services/license.js';
import { getProductBySlug } from '../services/product.js';

const router = Router();

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * Verify Stripe webhook signature
 */
function verifyStripeSignature(payload, signature) {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn('STRIPE_WEBHOOK_SECRET not set, skipping signature verification');
    return true;
  }

  const elements = signature.split(',');
  const signatureMap = {};
  for (const element of elements) {
    const [key, value] = element.split('=');
    signatureMap[key] = value;
  }

  const timestamp = signatureMap['t'];
  const signatures = Object.entries(signatureMap)
    .filter(([k]) => k.startsWith('v1'))
    .map(([, v]) => v);

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', STRIPE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest('hex');

  return signatures.some(sig => crypto.timingSafeEqual(
    Buffer.from(sig),
    Buffer.from(expectedSignature)
  ));
}

/**
 * POST /api/v1/webhooks/stripe
 * Handle Stripe webhook events
 */
router.post('/stripe', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const rawBody = JSON.stringify(req.body);

  // Verify signature in production
  if (process.env.NODE_ENV === 'production' && STRIPE_WEBHOOK_SECRET) {
    try {
      if (!verifyStripeSignature(rawBody, signature)) {
        console.error('Invalid Stripe webhook signature');
        return res.status(400).json({ error: 'invalid_signature' });
      }
    } catch (err) {
      console.error('Signature verification failed:', err);
      return res.status(400).json({ error: 'signature_verification_failed' });
    }
  }

  const event = req.body;
  console.log(`Stripe webhook received: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutCompleted(session);
        break;
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object;
        await handleSubscriptionCreated(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'webhook_handler_error' });
  }
});

/**
 * Handle successful checkout
 */
async function handleCheckoutCompleted(session) {
  console.log('Processing checkout.session.completed:', session.id);

  const customerEmail = session.customer_email || session.customer_details?.email;
  if (!customerEmail) {
    console.error('No customer email in session');
    return;
  }

  // Get product slug from metadata
  const productSlug = session.metadata?.product_slug || 'tutor-lms-tracking';
  const licenseType = session.metadata?.license_type || 'lifetime';

  // Find product
  const product = getProductBySlug(productSlug);
  if (!product) {
    console.error(`Product not found: ${productSlug}`);
    return;
  }

  // Determine expiration (lifetime = null, annual = 1 year)
  let expiresAt = null;
  if (licenseType === 'annual') {
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    expiresAt = expiry.toISOString();
  }

  // Create license
  const license = createLicense({
    productId: product.id,
    email: customerEmail,
    maxActivations: 1,
    expiresAt,
    metadata: {
      stripe_session_id: session.id,
      stripe_customer_id: session.customer,
      license_type: licenseType
    }
  });

  console.log(`License created: ${license.licenseKey} for ${customerEmail}`);
  
  // TODO: Send license key email to customer
}

/**
 * Handle subscription created (for annual licenses)
 */
async function handleSubscriptionCreated(subscription) {
  console.log('Processing customer.subscription.created:', subscription.id);
  // License is created in checkout.session.completed
  // This is for tracking/logging only
}

/**
 * Handle subscription deleted (expired/cancelled)
 */
async function handleSubscriptionDeleted(subscription) {
  console.log('Processing customer.subscription.deleted:', subscription.id);
  // TODO: Mark license as expired/inactive
  // For now, licenses remain valid until explicit deactivation
}

export default router;
