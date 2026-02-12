#!/bin/bash
# TLAT License Server SQLite Backup Script
# Usage: ./backup-db.sh [--retention DAYS]
#
# Creates timestamped backups of the SQLite database with automatic retention.
# Backups are compressed with gzip and verified for integrity.

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="${DATA_DIR:-$PROJECT_DIR/data}"
DB_FILE="${DB_FILE:-$DATA_DIR/licenses.db}"
BACKUP_DIR="${BACKUP_DIR:-$DATA_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"  # Default: keep 30 days of backups

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --retention)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        --db)
            DB_FILE="$2"
            shift 2
            ;;
        --backup-dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        *)
            echo "Usage: $0 [--retention DAYS] [--db PATH] [--backup-dir PATH]"
            exit 1
            ;;
    esac
done

# Verify database exists
if [[ ! -f "$DB_FILE" ]]; then
    log_error "Database file not found: $DB_FILE"
    exit 1
fi

# Create backup directory if needed
mkdir -p "$BACKUP_DIR"

# Generate backup filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/licenses_backup_$TIMESTAMP.db"
BACKUP_GZ="$BACKUP_FILE.gz"

log_info "Starting backup of $DB_FILE"
log_info "Backup destination: $BACKUP_GZ"

# Perform safe backup using SQLite's .backup command
# This ensures a consistent snapshot even if the database is in use
if command -v sqlite3 &>/dev/null; then
    log_info "Using SQLite backup command for safe snapshot..."
    sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
else
    log_warn "sqlite3 not found, using file copy (may be inconsistent if DB is in use)"
    cp "$DB_FILE" "$BACKUP_FILE"
fi

# Verify backup integrity
if command -v sqlite3 &>/dev/null; then
    log_info "Verifying backup integrity..."
    INTEGRITY=$(sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;")
    if [[ "$INTEGRITY" != "ok" ]]; then
        log_error "Backup integrity check failed: $INTEGRITY"
        rm -f "$BACKUP_FILE"
        exit 1
    fi
    log_info "Backup integrity verified: OK"
fi

# Compress backup
log_info "Compressing backup..."
gzip "$BACKUP_FILE"

# Calculate sizes
ORIG_SIZE=$(du -h "$DB_FILE" | cut -f1)
BACKUP_SIZE=$(du -h "$BACKUP_GZ" | cut -f1)
log_info "Original size: $ORIG_SIZE, Compressed: $BACKUP_SIZE"

# Clean up old backups
if [[ $RETENTION_DAYS -gt 0 ]]; then
    log_info "Cleaning up backups older than $RETENTION_DAYS days..."
    find "$BACKUP_DIR" -name "licenses_backup_*.db.gz" -mtime +$RETENTION_DAYS -delete -print | while read f; do
        log_info "Deleted old backup: $f"
    done
fi

# List current backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "licenses_backup_*.db.gz" | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "unknown")

log_info "Backup complete!"
log_info "Total backups: $BACKUP_COUNT, Total size: $TOTAL_SIZE"
log_info "Latest backup: $BACKUP_GZ"

# Output JSON for automation
echo "{\"status\":\"success\",\"file\":\"$BACKUP_GZ\",\"size\":\"$BACKUP_SIZE\",\"count\":$BACKUP_COUNT}"
