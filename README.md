# TLAT License Server

License server for **Tutor LMS Advanced Tracking** WordPress plugin.

Node.js/Express + SQLite for simple self-hosted license management.

## Features

- **License activation/deactivation** per domain
- **JWT tokens** for secure validation
- **Multi-site support** with configurable activation limits
- **Heartbeat tracking** for active installations
- **Admin API** for license management
- **Audit logging** for all license operations
- **Plans**: standard, pro, agency, lifetime

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your JWT_SECRET!

# Initialize database
npm run db:init

# (Optional) Seed test data
npm run db:seed

# Start server
npm start
# Or development mode with auto-reload:
npm run dev
```

Server runs on `http://localhost:3100` by default.

## API Endpoints

### Public Endpoints (Plugin → Server)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/license/activate` | Activate license for domain |
| POST | `/api/v1/license/deactivate` | Deactivate license |
| POST | `/api/v1/license/validate` | Validate license status |
| POST | `/api/v1/license/heartbeat` | Record heartbeat |
| GET | `/api/v1/license/status` | Quick status check |

### Admin Endpoints (Requires `Authorization: Bearer <ADMIN_API_KEY>`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/admin/licenses` | Create new license |
| GET | `/api/v1/admin/licenses` | List all licenses |
| GET | `/api/v1/admin/licenses/:key` | Get license details |
| PATCH | `/api/v1/admin/licenses/:key` | Update license |
| DELETE | `/api/v1/admin/licenses/:key` | Delete license |
| GET | `/api/v1/admin/stats` | Get statistics |

## Usage Examples

### Activate a license

```bash
curl -X POST http://localhost:3100/api/v1/license/activate \
  -H "Content-Type: application/json" \
  -d '{
    "license_key": "TLAT-XXXX-XXXX-XXXX-XXXX",
    "domain": "mysite.com",
    "site_url": "https://mysite.com",
    "wp_version": "6.4",
    "plugin_version": "1.0.0"
  }'
```

### Validate a license

```bash
curl -X POST http://localhost:3100/api/v1/license/validate \
  -H "Content-Type: application/json" \
  -d '{
    "license_key": "TLAT-XXXX-XXXX-XXXX-XXXX",
    "domain": "mysite.com"
  }'
```

### Create a license (admin)

```bash
curl -X POST http://localhost:3100/api/v1/admin/licenses \
  -H "Authorization: Bearer your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "plan": "pro",
    "max_activations": 3,
    "expires_at": "2026-12-31"
  }'
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3100 |
| `NODE_ENV` | Environment | development |
| `JWT_SECRET` | Secret for JWT tokens | **Must change!** |
| `DB_PATH` | SQLite database path | ./data/licenses.db |
| `ADMIN_API_KEY` | Admin API key | dev-admin-key |
| `ALLOWED_ORIGINS` | CORS origins (comma-sep) | * |

## Database Schema

### licenses
- `id`, `license_key`, `email`, `plan`, `max_activations`, `expires_at`, `created_at`, `updated_at`, `metadata`

### activations
- `id`, `license_id`, `domain`, `site_url`, `wp_version`, `plugin_version`, `activated_at`, `last_heartbeat`, `is_active`, `deactivated_at`

### audit_log
- `id`, `license_id`, `action`, `domain`, `ip_address`, `details`, `created_at`

## WordPress Plugin Integration

The WordPress plugin should call these endpoints:

1. **On license save** → `/activate`
2. **Daily cron** → `/heartbeat`
3. **On settings page load** → `/validate`
4. **On license removal** → `/deactivate`

See `class-license-validator.php` in the main plugin for integration code.

## Deployment

For production:

1. Set `NODE_ENV=production`
2. Use a strong `JWT_SECRET` (32+ random chars)
3. Set `ADMIN_API_KEY` to a secure value
4. Use reverse proxy (nginx) with HTTPS
5. Set `ALLOWED_ORIGINS` to your domain(s)

### Docker

```bash
# Build
docker build -t tlat-license-server .

# Run with docker-compose
docker-compose up -d

# Or standalone
docker run -d \
  -p 3100:3100 \
  -e JWT_SECRET=your-secret \
  -e ADMIN_API_KEY=your-admin-key \
  -v license-data:/app/data \
  tlat-license-server
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full Dokploy deployment guide.

### Systemd service

```ini
[Unit]
Description=TLAT License Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/tlat-license-server
ExecStart=/usr/bin/node src/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## License

MIT
