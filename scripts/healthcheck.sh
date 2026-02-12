#!/bin/bash
# TLAT License Server Health Check
# Usage: ./healthcheck.sh [--notify]
# 
# Checks server health and optionally sends alerts on failure.
# Exit codes: 0 = healthy, 1 = unhealthy

set -euo pipefail

# Configuration
HEALTH_URL="${HEALTH_URL:-https://licenses.holstjensen.eu/health}"
TIMEOUT=10
NOTIFY_WEBHOOK="${NOTIFY_WEBHOOK:-}"  # Optional: Discord/Slack webhook URL
ALERT_EMAIL="${ALERT_EMAIL:-}"         # Optional: Email for alerts

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

send_alert() {
    local message="$1"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Discord/Slack webhook
    if [[ -n "$NOTIFY_WEBHOOK" ]]; then
        curl -s -X POST "$NOTIFY_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"content\": \"🚨 **TLAT License Server Alert**\\n$message\\nTime: $timestamp\"}" \
            >/dev/null 2>&1 || log_warn "Failed to send webhook alert"
    fi
    
    # Email alert (requires mail command)
    if [[ -n "$ALERT_EMAIL" ]] && command -v mail &>/dev/null; then
        echo "$message" | mail -s "TLAT License Server Alert - $(date)" "$ALERT_EMAIL" \
            || log_warn "Failed to send email alert"
    fi
}

check_health() {
    local response
    local http_code
    
    # Make request and capture both body and status code
    response=$(curl -s -w "\n%{http_code}" --max-time "$TIMEOUT" "$HEALTH_URL" 2>&1) || {
        log_error "Failed to connect to $HEALTH_URL"
        return 1
    }
    
    # Split response body and HTTP code
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    # Check HTTP status
    if [[ "$http_code" != "200" ]]; then
        log_error "Health check failed: HTTP $http_code"
        return 1
    fi
    
    # Parse JSON response
    status=$(echo "$body" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    if [[ "$status" != "ok" ]]; then
        log_error "Health check failed: status='$status'"
        return 1
    fi
    
    log_info "Health check passed: $body"
    return 0
}

# Main
main() {
    local notify=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --notify)
                notify=true
                shift
                ;;
            *)
                echo "Usage: $0 [--notify]"
                exit 1
                ;;
        esac
    done
    
    log_info "Checking health of $HEALTH_URL..."
    
    if check_health; then
        exit 0
    else
        local error_msg="License server health check failed at $HEALTH_URL"
        log_error "$error_msg"
        
        if [[ "$notify" == true ]]; then
            send_alert "$error_msg"
        fi
        
        exit 1
    fi
}

main "$@"
