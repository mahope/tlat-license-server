# TLAT License Server - Monitoring & Backup Guide

## Health Check Monitoring

### Quick Test
```bash
./scripts/healthcheck.sh
```

### Automated Monitoring with Cron
Add to crontab (`crontab -e`):

```cron
# Health check every 5 minutes
*/5 * * * * /path/to/tlat-license-server/scripts/healthcheck.sh --notify >> /var/log/tlat-healthcheck.log 2>&1
```

### With Alerts
Set environment variables for notifications:

```bash
# Discord/Slack webhook
export NOTIFY_WEBHOOK="https://discord.com/api/webhooks/..."

# Or email alerts
export ALERT_EMAIL="alerts@example.com"

./scripts/healthcheck.sh --notify
```

### Systemd Timer (Alternative to Cron)

Create `/etc/systemd/system/tlat-healthcheck.service`:
```ini
[Unit]
Description=TLAT License Server Health Check
After=network.target

[Service]
Type=oneshot
ExecStart=/opt/tlat-license-server/scripts/healthcheck.sh --notify
Environment=NOTIFY_WEBHOOK=https://discord.com/api/webhooks/...
```

Create `/etc/systemd/system/tlat-healthcheck.timer`:
```ini
[Unit]
Description=Run TLAT health check every 5 minutes

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tlat-healthcheck.timer
```

### External Uptime Monitoring

For production, use external monitoring services:

1. **UptimeRobot** (Free tier available)
   - Monitor URL: `https://licenses.holstjensen.eu/health`
   - Check interval: 5 minutes
   - Expected response: `{"status":"ok"...}`

2. **Better Uptime** 
3. **Pingdom**
4. **Cloudflare Health Checks** (if using Cloudflare)

---

## Database Backup

### Quick Backup
```bash
./scripts/backup-db.sh
```

### Options
```bash
# Custom retention (default: 30 days)
./scripts/backup-db.sh --retention 90

# Custom paths
./scripts/backup-db.sh --db /path/to/licenses.db --backup-dir /backups
```

### Automated Backups with Cron

```cron
# Daily backup at 3 AM
0 3 * * * /path/to/tlat-license-server/scripts/backup-db.sh >> /var/log/tlat-backup.log 2>&1

# Weekly full backup to offsite (Sundays at 4 AM)
0 4 * * 0 /path/to/tlat-license-server/scripts/backup-db.sh && \
  rsync -az /path/to/data/backups/ offsite:/backups/tlat/
```

### Docker Backup

If running in Docker, backup the mounted volume:

```bash
# Using docker exec
docker exec tlat-license-server /app/scripts/backup-db.sh

# Or backup the volume directly
docker cp tlat-license-server:/app/data/licenses.db ./licenses_backup_$(date +%Y%m%d).db
```

### Restore from Backup

```bash
# Stop the server first
docker-compose stop

# Decompress backup
gunzip -k backups/licenses_backup_20260213_030000.db.gz

# Replace database
cp backups/licenses_backup_20260213_030000.db data/licenses.db

# Start server
docker-compose start

# Verify
curl https://licenses.holstjensen.eu/health
```

### Offsite Backup

For disaster recovery, sync backups to external storage:

```bash
# S3 (using AWS CLI)
aws s3 sync /path/to/data/backups/ s3://your-bucket/tlat-backups/

# Backblaze B2
b2 sync /path/to/data/backups/ b2://your-bucket/tlat-backups/

# rsync to another server
rsync -avz /path/to/data/backups/ user@backup-server:/backups/tlat/
```

---

## Alerting Integration

### Discord Webhook
1. Create webhook in Discord server settings
2. Set `NOTIFY_WEBHOOK` environment variable
3. Alerts include timestamp and error details

### Slack Webhook
1. Create incoming webhook in Slack app settings
2. Works with same `NOTIFY_WEBHOOK` variable

### Custom Integration
Modify `scripts/healthcheck.sh` `send_alert()` function for:
- PagerDuty
- Opsgenie  
- Telegram
- SMS (Twilio)

---

## Monitoring Dashboard

For visualizing uptime and performance:

1. **Grafana + Prometheus**
   - Expose `/metrics` endpoint (future enhancement)
   - Create dashboards for request latency, error rates

2. **Simple Status Page**
   - Use statuspage.io or instatus.com
   - Point to health endpoint

---

## Troubleshooting

### Health check fails
1. Check if server is running: `docker ps` or `systemctl status tlat-license-server`
2. Check logs: `docker logs tlat-license-server` or `journalctl -u tlat-license-server`
3. Test connectivity: `curl -v https://licenses.holstjensen.eu/health`

### Backup fails
1. Check disk space: `df -h`
2. Check SQLite file: `ls -la data/licenses.db`
3. Check permissions: ensure scripts are executable

### Database corruption
1. Stop server
2. Run integrity check: `sqlite3 data/licenses.db "PRAGMA integrity_check;"`
3. If corrupt, restore from latest backup
