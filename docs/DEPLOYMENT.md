# Deployment Guide - TLAT License Server

## Dokploy Deployment

### 1. Opret Application i Dokploy

1. Gå til https://dokploy.holstjensen.eu
2. Vælg projekt eller opret nyt: "TLAT"
3. Klik "Add Application"
4. Vælg "Docker Compose"
5. Source: GitHub → `mahope/tlat-license-server`
6. Branch: `main`

### 2. Environment Variables

Tilføj disse i Dokploy Environment settings:

```env
NODE_ENV=production
PORT=3100
JWT_SECRET=<generer-32-random-chars>
ADMIN_API_KEY=<generer-sikker-api-key>
ALLOWED_ORIGINS=https://tutor-tracking.com,https://*.tutor-tracking.com
```

**Generer secrets:**
```bash
# JWT_SECRET
openssl rand -hex 32

# ADMIN_API_KEY
openssl rand -base64 32
```

### 3. Domain Setup

1. I Dokploy → Application → Domains
2. Tilføj: `license.tutor-tracking.com`
3. Enable HTTPS (Let's Encrypt auto)

### 4. Volume for Database

Dokploy håndterer volumes automatisk via docker-compose.yml.
Database gemmes i `/app/data/licenses.db`.

### 5. Deploy

Klik "Deploy" i Dokploy. Første build tager ~2 min.

### 6. Verify

```bash
curl https://license.tutor-tracking.com/health
# {"status":"ok","timestamp":"..."}
```

---

## DNS Setup

Tilføj A-record:
```
license.tutor-tracking.com → 37.27.0.164
```

Eller CNAME til Dokploy load balancer hvis relevant.

---

## Post-Deploy Checklist

- [ ] Health endpoint returnerer 200
- [ ] Admin API virker med ADMIN_API_KEY
- [ ] HTTPS certifikat aktivt
- [ ] Opret første license via admin API

### Test Admin API

```bash
curl -X POST https://license.tutor-tracking.com/api/v1/admin/licenses \
  -H "Authorization: Bearer <ADMIN_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "mads@mahope.dk",
    "plan": "lifetime",
    "max_activations": 999
  }'
```

---

## Backup

SQLite database er i Docker volume `license-data`.

Cron backup script (kør på host):
```bash
# /etc/cron.daily/backup-tlat-license
docker cp tlat-license-server:/app/data/licenses.db /backup/tlat-$(date +%Y%m%d).db
```
