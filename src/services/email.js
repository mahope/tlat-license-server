/**
 * Email service using Resend API
 * 
 * Environment variables:
 * - RESEND_API_KEY: API key from resend.com
 * - EMAIL_FROM: Sender email (default: licenses@tutor-tracking.com)
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Tutor LMS Advanced Tracking <licenses@tutor-tracking.com>';

/**
 * Send an email via Resend API
 */
async function sendEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, skipping email send');
    console.log('Would have sent email:', { to, subject });
    return { success: false, reason: 'no_api_key' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Resend API error:', error);
      return { success: false, error };
    }

    const result = await response.json();
    console.log(`Email sent to ${to}:`, result.id);
    return { success: true, id: result.id };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send license delivery email to customer
 */
export async function sendLicenseEmail({ email, licenseKey, productName, licenseType }) {
  const isLifetime = licenseType === 'lifetime';
  const typeLabel = isLifetime ? 'Lifetime License' : 'Annual License';
  
  const subject = `Your ${productName} License Key`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Thank You for Your Purchase!</h1>
  </div>
  
  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      Your license for <strong>${productName}</strong> is ready to use.
    </p>
    
    <div style="background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">Your License Key</p>
      <code style="font-size: 20px; font-weight: bold; color: #333; background: #f0f0f0; padding: 10px 15px; border-radius: 5px; display: inline-block; letter-spacing: 1px;">${licenseKey}</code>
      <p style="margin: 10px 0 0 0; color: #666; font-size: 12px;">${typeLabel}</p>
    </div>
    
    <h2 style="color: #333; font-size: 18px; margin-top: 30px;">Getting Started</h2>
    <ol style="padding-left: 20px;">
      <li style="margin-bottom: 10px;">Install the plugin on your WordPress site</li>
      <li style="margin-bottom: 10px;">Go to <strong>Settings → TLAT License</strong></li>
      <li style="margin-bottom: 10px;">Enter your license key and click <strong>Activate</strong></li>
      <li style="margin-bottom: 10px;">Enjoy your advanced analytics! 📊</li>
    </ol>
    
    <div style="background: #e8f4f8; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0; border-radius: 0 5px 5px 0;">
      <p style="margin: 0; font-size: 14px;">
        <strong>Need the plugin?</strong><br>
        Download the latest version from your <a href="https://tutor-tracking.com/account" style="color: #667eea;">customer portal</a> or use the direct link in your receipt email.
      </p>
    </div>
    
    <h2 style="color: #333; font-size: 18px; margin-top: 30px;">Need Help?</h2>
    <p style="font-size: 14px;">
      Check out our <a href="https://tutor-tracking.com/docs" style="color: #667eea;">documentation</a> or reply to this email for support.
    </p>
    
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    
    <p style="color: #888; font-size: 12px; text-align: center; margin: 0;">
      © ${new Date().getFullYear()} Tutor LMS Advanced Tracking<br>
      Made with ❤️ by <a href="https://mahope.dk" style="color: #667eea;">Mahope</a>
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
Thank You for Your Purchase!

Your license for ${productName} is ready to use.

LICENSE KEY: ${licenseKey}
License Type: ${typeLabel}

GETTING STARTED:
1. Install the plugin on your WordPress site
2. Go to Settings → TLAT License
3. Enter your license key and click Activate
4. Enjoy your advanced analytics!

Need the plugin? Download from: https://tutor-tracking.com/account

NEED HELP?
Check our docs at https://tutor-tracking.com/docs or reply to this email.

---
© ${new Date().getFullYear()} Tutor LMS Advanced Tracking
Made with ❤️ by Mahope (https://mahope.dk)
  `.trim();

  return sendEmail({
    to: email,
    subject,
    html,
    text,
  });
}

/**
 * Send license renewal reminder
 */
export async function sendRenewalReminder({ email, licenseKey, productName, expiresAt }) {
  const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const subject = `Your ${productName} License Expires Soon`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #ffc107; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: #333; margin: 0; font-size: 22px;">⏰ License Expiring Soon</h1>
  </div>
  
  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">
      Your license for <strong>${productName}</strong> will expire on <strong>${expiryDate}</strong>.
    </p>
    
    <p style="font-size: 14px;">
      License: <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">${licenseKey}</code>
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="https://tutor-tracking.com/renew?key=${encodeURIComponent(licenseKey)}" 
         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
        Renew Now →
      </a>
    </div>
    
    <p style="font-size: 14px; color: #666;">
      Renew to keep your advanced analytics running and continue receiving updates.
    </p>
    
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    
    <p style="color: #888; font-size: 12px; text-align: center;">
      © ${new Date().getFullYear()} Tutor LMS Advanced Tracking
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
License Expiring Soon

Your license for ${productName} will expire on ${expiryDate}.

License: ${licenseKey}

Renew now: https://tutor-tracking.com/renew?key=${encodeURIComponent(licenseKey)}

Renew to keep your advanced analytics running and continue receiving updates.

---
© ${new Date().getFullYear()} Tutor LMS Advanced Tracking
  `.trim();

  return sendEmail({
    to: email,
    subject,
    html,
    text,
  });
}

/**
 * Send magic link for customer portal access
 */
export async function sendPortalMagicLink({ email, portalLink }) {
  const subject = 'Your Tutor LMS Advanced Tracking Portal Access';
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">🔐 Portal Access</h1>
  </div>
  
  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      Click the button below to access your license dashboard:
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${portalLink}" 
         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
        Access My Licenses →
      </a>
    </div>
    
    <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 0 5px 5px 0;">
      <p style="margin: 0; font-size: 14px;">
        <strong>⏰ This link expires in 30 minutes</strong><br>
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 20px;">
      Can't click the button? Copy and paste this link:<br>
      <a href="${portalLink}" style="color: #667eea; word-break: break-all; font-size: 12px;">${portalLink}</a>
    </p>
    
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    
    <p style="color: #888; font-size: 12px; text-align: center; margin: 0;">
      © ${new Date().getFullYear()} Tutor LMS Advanced Tracking<br>
      Made with ❤️ by <a href="https://mahope.dk" style="color: #667eea;">Mahope</a>
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
Portal Access

Click the link below to access your license dashboard:

${portalLink}

This link expires in 30 minutes.
If you didn't request this, you can safely ignore this email.

---
© ${new Date().getFullYear()} Tutor LMS Advanced Tracking
Made with ❤️ by Mahope (https://mahope.dk)
  `.trim();

  return sendEmail({
    to: email,
    subject,
    html,
    text,
  });
}

export default { sendLicenseEmail, sendRenewalReminder, sendPortalMagicLink };
