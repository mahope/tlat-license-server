# Publishing Guide: License Server

Complete guide for deploying and managing your multi-product WordPress license server.

## 1. Deploy to Dokploy

### Create Application in Dokploy

1. Go to **Dokploy** → **Applications** → **Create**
2. **Name:** `license-server`
3. **Build Type:** `Dockerfile`
4. **Dockerfile Path:** `./Dockerfile`
5. **Git Provider:** GitHub
6. **Repository:** `mahope/tlat-license-server`
7. **Branch:** `main`

### Set Environment Variables

In Dokploy → Application → **Environment**:

```env
NODE_ENV=production
PORT=3100
JWT_SECRET=<random-32+-character-string>
ADMIN_API_KEY=<random-32+-character-string>
ALLOWED_ORIGINS=https://your-wordpress-site.com,https://another-site.com
DB_PATH=/app/data/licenses.db
```

**Generate secrets:**
```bash
# JWT Secret
openssl rand -hex 32

# Admin API Key
openssl rand -hex 32
```

### Configure Domain

1. **Domains** → Add domain: `license.holstjensen.eu` (or your choice)
2. Enable **HTTPS** (auto Let's Encrypt)
3. Set **Port:** `3100`

### Persistent Storage

1. **Volumes** → Add volume
2. **Host Path:** `/var/lib/dokploy/license-data`
3. **Container Path:** `/app/data`
4. This ensures database persists across deploys

### Deploy

Click **Deploy** and wait for build to complete.

---

## 2. Set Up Products

After deployment, create your products:

### Create Tutor LMS Advanced Tracking

```bash
curl -X POST https://license.holstjensen.eu/api/v1/admin/products \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  -d '{
    "slug": "tutor-lms-advanced-tracking",
    "name": "Tutor LMS Advanced Tracking",
    "description": "Advanced course tracking for Tutor LMS",
    "currentVersion": "1.0.1"
  }'
```

### Create WP Dev System (example)

```bash
curl -X POST https://license.holstjensen.eu/api/v1/admin/products \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  -d '{
    "slug": "wp-dev-system",
    "name": "WP Dev System",
    "description": "Docker-based WordPress development environment",
    "currentVersion": "1.0.0"
  }'
```

### List All Products

```bash
curl https://license.holstjensen.eu/api/v1/admin/products \
  -H "x-api-key: YOUR_ADMIN_API_KEY"
```

---

## 3. Create Licenses

### Create Lifetime License

```bash
curl -X POST https://license.holstjensen.eu/api/v1/admin/licenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -d '{
    "email": "customer@example.com",
    "product_slug": "tutor-lms-advanced-tracking",
    "plan": "lifetime",
    "max_activations": 1
  }'
```

Response:
```json
{
  "id": 1,
  "licenseKey": "TLAT-XXXX-XXXX-XXXX-XXXX",
  "productId": 1,
  "email": "customer@example.com",
  "plan": "lifetime",
  "maxActivations": 1,
  "expiresAt": null
}
```

### Create Annual License

```bash
curl -X POST https://license.holstjensen.eu/api/v1/admin/licenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -d '{
    "email": "customer@example.com",
    "product_slug": "tutor-lms-advanced-tracking",
    "plan": "annual",
    "max_activations": 1,
    "expires_at": "2027-02-12T00:00:00Z"
  }'
```

---

## 4. WordPress Plugin Integration

### In Your Plugin's License Validator

```php
class License_Validator {
    private $api_url = 'https://license.holstjensen.eu/api/v1/license';
    private $product_slug = 'tutor-lms-advanced-tracking';
    
    public function validate($license_key) {
        $response = wp_remote_post($this->api_url . '/validate', [
            'body' => json_encode([
                'license_key' => $license_key,
                'domain' => parse_url(home_url(), PHP_URL_HOST),
                'product_slug' => $this->product_slug
            ]),
            'headers' => ['Content-Type' => 'application/json'],
            'timeout' => 15
        ]);
        
        if (is_wp_error($response)) {
            return ['valid' => false, 'error' => 'connection_error'];
        }
        
        return json_decode(wp_remote_retrieve_body($response), true);
    }
    
    public function activate($license_key) {
        $response = wp_remote_post($this->api_url . '/activate', [
            'body' => json_encode([
                'license_key' => $license_key,
                'domain' => parse_url(home_url(), PHP_URL_HOST),
                'site_url' => home_url(),
                'wp_version' => get_bloginfo('version'),
                'plugin_version' => TLAT_VERSION
            ]),
            'headers' => ['Content-Type' => 'application/json'],
            'timeout' => 15
        ]);
        
        return json_decode(wp_remote_retrieve_body($response), true);
    }
}
```

---

## 5. Stripe Integration (Future)

For automated license creation on purchase:

1. Create Stripe webhook endpoint in server
2. On `checkout.session.completed`:
   - Extract customer email and product from metadata
   - Call `createLicense()` with product_id
   - Email license key to customer

---

## 6. Admin Dashboard (Future)

Consider building a simple admin UI:
- List/search licenses
- View activation status
- Revoke/extend licenses
- Product statistics

---

## API Reference

### Public Endpoints (no auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/license/activate` | Activate license for domain |
| POST | `/api/v1/license/deactivate` | Deactivate license |
| POST | `/api/v1/license/validate` | Validate license (+ product check) |
| POST | `/api/v1/license/heartbeat` | Record plugin heartbeat |

### Admin Endpoints (requires `Authorization: Bearer API_KEY`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/licenses` | List all licenses |
| POST | `/api/v1/admin/licenses` | Create license |
| GET | `/api/v1/admin/licenses/:key` | Get license details |
| PATCH | `/api/v1/admin/licenses/:key` | Update license |
| DELETE | `/api/v1/admin/licenses/:key` | Delete license |
| GET | `/api/v1/admin/stats` | Overall statistics |

### Product Endpoints (requires `x-api-key` header)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/products` | List all products |
| POST | `/api/v1/admin/products` | Create product |
| GET | `/api/v1/admin/products/:id` | Get product details |
| PATCH | `/api/v1/admin/products/:id` | Update product |
| DELETE | `/api/v1/admin/products/:id` | Soft-delete product |

---

## Troubleshooting

### License not validating

1. Check `product_slug` matches exactly
2. Verify domain is activated
3. Check license hasn't expired
4. Verify API URL is correct (https)

### Database issues

```bash
# SSH into Dokploy server
docker exec -it <container> sh

# Check database
sqlite3 /app/data/licenses.db ".tables"
sqlite3 /app/data/licenses.db "SELECT * FROM products"
```

### Reset database (caution!)

```bash
rm /var/lib/dokploy/license-data/licenses.db
# Redeploy to recreate schema
```
