#!/bin/bash

# =============================================================================
# SchroDrive — Deploy Script
# Deploys the SchroDrive container + compose stack to the remote server
#
# The stack lives at: /home/joseph/schrodingers-copy/docker-compose.yml
# Env file:          /home/joseph/schrodingers-copy/.env
#
# Usage:
#   ./deploy-schrodrive.sh                  # Deploy :latest
#   ./deploy-schrodrive.sh develop          # Deploy :develop
#   ./deploy-schrodrive.sh --compose-only   # Only sync compose + env
#   ./deploy-schrodrive.sh --test           # Deploy + run integration tests
# =============================================================================

set -euo pipefail

# Colours
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m' # No Colour

# Emojis
INFO="ℹ️"
SUCCESS="✅"
WARNING="⚠️"
ERROR="❌"
ROCKET="🚀"
DOCKER="🐳"
GEAR="⚙️"
TEST="🧪"

# Configuration
REMOTE_USER="joseph"
REMOTE_HOST="192.168.1.124"
SSH_PORT=22
MAIN_REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_HISTORY_FILE="$HOME/.schrodrive_deploy_history"

# Remote paths — the existing stack location
REMOTE_STACK_DIR="/home/joseph/schrodingers-copy"
REMOTE_COMPOSE_FILE="$REMOTE_STACK_DIR/docker-compose.yml"
REMOTE_ENV_FILE="$REMOTE_STACK_DIR/.env"

# Local files (named differently to remote)
LOCAL_COMPOSE_FILE="$MAIN_REPO_DIR/plex-compose.yml"
LOCAL_ENV_FILE="$MAIN_REPO_DIR/.env.plex"
LOCAL_CLOUD_LINKS_FILE="$MAIN_REPO_DIR/cloud_links.json"
LOCAL_WEBDAV_FILE="$MAIN_REPO_DIR/webdav.json"

# Docker image
GHCR_IMAGE="ghcr.io/moderniselife/schrodrive"
DEFAULT_TAG="latest"

# Load secrets from .env.plex (gitignored)
if [ -f "$MAIN_REPO_DIR/.env.plex" ]; then
    set -a
    source "$MAIN_REPO_DIR/.env.plex"
    set +a
fi

# Discord Webhook (loaded from .env.plex → DISCORD_DEPLOY_WEBHOOK)
DISCORD_WEBHOOK="${DISCORD_DEPLOY_WEBHOOK:-}"

# SchroDrive API port
SCHRODRIVE_PORT=8978

# ---------------------------------------------------------------------------
# CLI Arguments
# ---------------------------------------------------------------------------
IMAGE_TAG="${1:-$DEFAULT_TAG}"
COMPOSE_ONLY=false
RUN_TESTS=false

for arg in "$@"; do
    case $arg in
        --compose-only)
            COMPOSE_ONLY=true
            ;;
        --test)
            RUN_TESTS=true
            ;;
        develop|latest|main)
            IMAGE_TAG="$arg"
            ;;
    esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
section() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}${GEAR} $1 ${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}
success() { echo -e "${GREEN}${SUCCESS} $1${NC}"; }
info()    { echo -e "${BLUE}${INFO} $1${NC}"; }
warning() { echo -e "${YELLOW}${WARNING} $1${NC}"; }
error()   { echo -e "${RED}${ERROR} $1${NC}"; }
dim()     { echo -e "${DIM}   $1${NC}"; }

format_duration() {
    local secs=$1
    local mins=$(( secs / 60 ))
    local rem=$(( secs % 60 ))
    if [ "$mins" -gt 0 ]; then
        echo "${mins}m ${rem}s"
    else
        echo "${rem}s"
    fi
}

discord_send() {
    local payload="$1"
    curl -s -o /dev/null -X POST "$DISCORD_WEBHOOK" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>/dev/null || true
}

remote() {
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no -p $SSH_PORT "$REMOTE_USER@$REMOTE_HOST" "$@"
}

# ---------------------------------------------------------------------------
# Gather context
# ---------------------------------------------------------------------------
DEPLOY_START=$(date +%s)
DEPLOY_DATE=$(date '+%d %b %Y %H:%M:%S AEST')

SCHRODRIVE_DIR="$MAIN_REPO_DIR/SchroDrive"
if [ -d "$SCHRODRIVE_DIR/.git" ] || [ -f "$SCHRODRIVE_DIR/.git" ]; then
    GIT_BRANCH=$(git -C "$SCHRODRIVE_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    GIT_COMMIT=$(git -C "$SCHRODRIVE_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
    GIT_MSG=$(git -C "$SCHRODRIVE_DIR" log -1 --pretty=format:"%s" 2>/dev/null || echo "–")
    GIT_AUTHOR=$(git -C "$SCHRODRIVE_DIR" log -1 --pretty=format:"%an" 2>/dev/null || echo "Unknown")
    SD_VERSION=$(node -p "require('$SCHRODRIVE_DIR/package.json').version" 2>/dev/null || echo "?")
else
    GIT_BRANCH="unknown"; GIT_COMMIT="unknown"; GIT_MSG="–"; GIT_AUTHOR="Unknown"; SD_VERSION="?"
fi

AVG_DISPLAY="no data yet"
if [ -f "$DEPLOY_HISTORY_FILE" ] && [ -s "$DEPLOY_HISTORY_FILE" ]; then
    TOTAL=0; COUNT=0
    while IFS= read -r line; do TOTAL=$(( TOTAL + line )); COUNT=$(( COUNT + 1 )); done < "$DEPLOY_HISTORY_FILE"
    if [ "$COUNT" -gt 0 ]; then
        AVG=$(( TOTAL / COUNT ))
        AVG_DISPLAY="~$(format_duration $AVG) (over $COUNT deploys)"
    fi
fi

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo -e "${CYAN}"
echo "  ╔═══════════════════════════════════════════════════════════╗"
echo "  ║           SchröDrive Deploy Script v2.0                  ║"
echo "  ╠═══════════════════════════════════════════════════════════╣"
echo "  ║  Image:  ${GHCR_IMAGE}:${IMAGE_TAG}"
echo "  ║  Target: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_STACK_DIR}"
echo "  ╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

info "Branch: $GIT_BRANCH | Commit: $GIT_COMMIT | Version: $SD_VERSION"
info "Image tag: $IMAGE_TAG | Tests: $RUN_TESTS | Compose-only: $COMPOSE_ONLY"
echo ""

# ---------------------------------------------------------------------------
# Discord: deploying
# ---------------------------------------------------------------------------
discord_send "$(cat <<EOF
{
  "embeds": [{
    "title": "🚀 SchroDrive — Deploying",
    "description": "**$GIT_AUTHOR** kicked off a SchroDrive deployment.\nImage: \`$GHCR_IMAGE:$IMAGE_TAG\`",
    "color": 16750592,
    "fields": [
      { "name": "🌿 Branch", "value": "\`$GIT_BRANCH\`", "inline": true },
      { "name": "📝 Commit", "value": "\`$GIT_COMMIT\`", "inline": true },
      { "name": "🏷 Version", "value": "\`v$SD_VERSION\`", "inline": true },
      { "name": "💬 Message", "value": "$GIT_MSG", "inline": false },
      { "name": "⏱ Avg Deploy Time", "value": "$AVG_DISPLAY", "inline": true }
    ],
    "footer": { "text": "SchroDrive CI • $REMOTE_HOST" }
  }]
}
EOF
)"

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
section "Pre-flight Checks"

info "Checking SSH connectivity..."
if remote "echo 'connected'" > /dev/null 2>&1; then
    success "SSH connection to $REMOTE_HOST OK"
else
    error "Cannot connect to $REMOTE_HOST via SSH"
    exit 1
fi

info "Checking local files exist..."
for f in "$LOCAL_COMPOSE_FILE" "$LOCAL_ENV_FILE"; do
    if [ ! -f "$f" ]; then
        error "Missing: $f"
        exit 1
    fi
done
success "plex-compose.yml and .env.plex found"

info "Checking remote stack directory..."
if remote "test -d $REMOTE_STACK_DIR"; then
    success "Remote stack dir exists: $REMOTE_STACK_DIR"
else
    error "Remote stack directory not found: $REMOTE_STACK_DIR"
    exit 1
fi

# ---------------------------------------------------------------------------
# Backup existing config on remote
# ---------------------------------------------------------------------------
section "Backing Up Remote Config"

info "Creating backup of current compose + env..."
remote "
    cd $REMOTE_STACK_DIR
    BACKUP_DIR=.backups/\$(date +%Y%m%d_%H%M%S)
    mkdir -p \$BACKUP_DIR
    cp docker-compose.yml \$BACKUP_DIR/ 2>/dev/null || true
    cp .env \$BACKUP_DIR/ 2>/dev/null || true
    echo \"Backup saved to: $REMOTE_STACK_DIR/\$BACKUP_DIR\"
    # Keep only last 10 backups
    cd .backups && ls -dt */ 2>/dev/null | tail -n +11 | xargs rm -rf 2>/dev/null || true
"
success "Remote config backed up"

# ---------------------------------------------------------------------------
# Upload compose + env files
# ---------------------------------------------------------------------------
section "Uploading Configuration"

info "Copying plex-compose.yml → remote docker-compose.yml..."
scp -P $SSH_PORT "$LOCAL_COMPOSE_FILE" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_COMPOSE_FILE" && \
    success "plex-compose.yml → $REMOTE_COMPOSE_FILE" || \
    { error "Failed to upload compose file"; exit 1; }

info "Copying .env.plex → remote .env..."
scp -P $SSH_PORT "$LOCAL_ENV_FILE" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_ENV_FILE" && \
    success ".env.plex → $REMOTE_ENV_FILE" || \
    { error "Failed to upload env file"; exit 1; }

if [ -f "$LOCAL_CLOUD_LINKS_FILE" ]; then
    info "Copying cloud_links.json → remote stack directory..."
    scp -P $SSH_PORT "$LOCAL_CLOUD_LINKS_FILE" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_STACK_DIR/cloud_links.json" && \
        success "cloud_links.json → $REMOTE_STACK_DIR/cloud_links.json" || \
        warning "Failed to upload cloud_links.json (non-fatal)"
fi

if [ -f "$LOCAL_WEBDAV_FILE" ]; then
    info "Copying webdav.json → remote stack directory..."
    scp -P $SSH_PORT "$LOCAL_WEBDAV_FILE" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_STACK_DIR/webdav.json" && \
        success "webdav.json → $REMOTE_STACK_DIR/webdav.json" || \
        warning "Failed to upload webdav.json (non-fatal)"
fi

if [ "$COMPOSE_ONLY" = true ]; then
    success "Compose-only mode — files synced, skipping container deployment"
    DEPLOY_END=$(date +%s)
    DEPLOY_DURATION=$(( DEPLOY_END - DEPLOY_START ))
    success "Done in $(format_duration $DEPLOY_DURATION)"
    exit 0
fi

# ---------------------------------------------------------------------------
# Update image tag in remote compose file
# ---------------------------------------------------------------------------
section "Deploying SchroDrive (:$IMAGE_TAG)"

info "Setting image tag to :$IMAGE_TAG in remote docker-compose.yml..."
remote "sed -i 's|image: ghcr.io/moderniselife/schrodrive:.*|image: ghcr.io/moderniselife/schrodrive:$IMAGE_TAG|' $REMOTE_COMPOSE_FILE"
success "Image tag set to :$IMAGE_TAG"

# ---------------------------------------------------------------------------
# Pull image + restart stack
# ---------------------------------------------------------------------------
info "Pulling $GHCR_IMAGE:$IMAGE_TAG..."
remote "docker pull $GHCR_IMAGE:$IMAGE_TAG" && \
    success "Image pulled successfully" || \
    { error "Failed to pull image. Has the build completed on GitHub Actions?"; exit 1; }

info "Stopping old stack (including pd_zurg if still present)..."
remote "
    cd $REMOTE_STACK_DIR

    # Stop pd_zurg first if it exists (it will fail to start anyway)
    docker stop pd_zurg 2>/dev/null && echo 'Stopped pd_zurg' || true
    docker rm pd_zurg 2>/dev/null && echo 'Removed pd_zurg container' || true

    # Stop torbox-media-center if still running
    docker stop torbox-media-center 2>/dev/null && echo 'Stopped torbox-media-center' || true
    docker rm torbox-media-center 2>/dev/null && echo 'Removed torbox-media-center container' || true
"

info "Bringing up the full stack with new compose..."
remote "
    cd $REMOTE_STACK_DIR
    docker compose down --remove-orphans 2>/dev/null || true

    # Create Plex container but don't start it yet.
    # Start all other services first — SchrosDrive needs to pre-warm its cache
    # before Plex scans directories (otherwise Plex sees empty mounts and
    # deletes library items).
    docker compose up -d --scale plex=0 2>/dev/null || docker compose up -d
    docker compose create plex 2>/dev/null || true
    docker update --restart=no plex 2>/dev/null || true
    echo ''
    echo '=== Container Status ==='
    docker compose ps
    echo ''
    echo '⏳ Plex is CREATED but NOT STARTED — deploy script will start it after SchrosDrive pre-warm completes.'
"

DEPLOY_RESULT=$?

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
section "Health Check"

info "Waiting for SchroDrive to start..."
MAX_RETRIES=30
RETRY_DELAY=2
HEALTHY=false

for i in $(seq 1 $MAX_RETRIES); do
    HEALTH=$(curl -s --connect-timeout 2 "http://$REMOTE_HOST:$SCHRODRIVE_PORT/health" 2>/dev/null || echo "")
    if echo "$HEALTH" | grep -q '"ok":true'; then
        success "SchroDrive is healthy! (attempt $i/$MAX_RETRIES)"
        HEALTHY=true
        break
    fi

    if [ $i -eq $MAX_RETRIES ]; then
        error "SchroDrive failed to become healthy after $(( MAX_RETRIES * RETRY_DELAY ))s"
        warning "Container logs:"
        remote "docker logs schrodrive --tail=40 2>&1"
    fi

    dim "Waiting... (attempt $i/$MAX_RETRIES)"
    sleep $RETRY_DELAY
done

if [ "$HEALTHY" = true ]; then
    info "SchroDrive API status:"
    curl -s "http://$REMOTE_HOST:$SCHRODRIVE_PORT/api/status" 2>/dev/null | python3 -m json.tool 2>/dev/null || \
        warning "Could not parse status response"
fi

# ---------------------------------------------------------------------------
# Start Plex
# ---------------------------------------------------------------------------
section "Starting Plex"

if [ "$HEALTHY" = true ]; then
    info "SchröDrive is healthy — FUSE mounts are up. Starting Plex..."
    info "(Cloud-links pre-warm runs in the background — can take hours, Plex doesn't need to wait for it)"
    remote "docker start plex 2>/dev/null && echo 'Plex started' || echo 'Failed to start Plex'"
    sleep 5
    remote "docker ps --format '{{.Names}} {{.Status}}' | grep plex || echo 'Plex not running'"
else
    warning "SchröDrive not healthy — starting Plex anyway (may see empty libraries)"
    remote "docker start plex 2>/dev/null && echo 'Plex started' || echo 'Failed to start Plex'"
fi

# ---------------------------------------------------------------------------
# Integration tests (optional)
# ---------------------------------------------------------------------------
if [ "$RUN_TESTS" = true ] && [ "$HEALTHY" = true ]; then
    section "${TEST} Running Integration Tests"

    if command -v bun &> /dev/null && [ -f "$SCHRODRIVE_DIR/tests/integration.test.ts" ]; then
        info "Running tests against http://$REMOTE_HOST:$SCHRODRIVE_PORT..."
        cd "$SCHRODRIVE_DIR"
        SCHRODRIVE_URL="http://$REMOTE_HOST:$SCHRODRIVE_PORT" bun run test:integration || \
            warning "Some integration tests failed"
        cd "$MAIN_REPO_DIR"
    else
        warning "Bun not installed or test file not found — skipping"
        info "Run manually: cd SchroDrive && SCHRODRIVE_URL=http://$REMOTE_HOST:$SCHRODRIVE_PORT bun run test:integration"
    fi
fi

# ---------------------------------------------------------------------------
# Timing + history
# ---------------------------------------------------------------------------
DEPLOY_END=$(date +%s)
DEPLOY_DURATION=$(( DEPLOY_END - DEPLOY_START ))
DURATION_FMT=$(format_duration $DEPLOY_DURATION)

echo "$DEPLOY_DURATION" >> "$DEPLOY_HISTORY_FILE"
if [ -f "$DEPLOY_HISTORY_FILE" ]; then
    LINES=$(wc -l < "$DEPLOY_HISTORY_FILE" | tr -d ' ')
    if [ "$LINES" -gt 20 ]; then
        tail -20 "$DEPLOY_HISTORY_FILE" > "${DEPLOY_HISTORY_FILE}.tmp" && mv "${DEPLOY_HISTORY_FILE}.tmp" "$DEPLOY_HISTORY_FILE"
    fi
fi

TOTAL=0; COUNT=0
while IFS= read -r line; do TOTAL=$(( TOTAL + line )); COUNT=$(( COUNT + 1 )); done < "$DEPLOY_HISTORY_FILE"
NEW_AVG=$(( TOTAL / COUNT ))
NEW_AVG_FMT="~$(format_duration $NEW_AVG) (over $COUNT deploys)"

# ---------------------------------------------------------------------------
# Final summary
# ---------------------------------------------------------------------------
section "Deploy Complete"

if [ "$HEALTHY" = true ]; then
    echo -e "${GREEN}"
    echo "  ╔═══════════════════════════════════════════════════════════╗"
    echo "  ║  ${SUCCESS}  SchroDrive deployed successfully!                    ║"
    echo "  ╠═══════════════════════════════════════════════════════════╣"
    echo "  ║  Stack:    $REMOTE_STACK_DIR"
    echo "  ║  Image:    $GHCR_IMAGE:$IMAGE_TAG"
    echo "  ║  Version:  v$SD_VERSION"
    echo "  ║  API:      http://$REMOTE_HOST:$SCHRODRIVE_PORT"
    echo "  ║  Duration: $DURATION_FMT"
    echo "  ╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    discord_send "$(cat <<EOF
{
  "embeds": [{
    "title": "✅ SchroDrive — Deployed",
    "description": "SchroDrive **v$SD_VERSION** is live on \`$REMOTE_HOST\`.\nImage: \`$GHCR_IMAGE:$IMAGE_TAG\`\nStack: \`$REMOTE_STACK_DIR\`",
    "color": 3066993,
    "fields": [
      { "name": "🌿 Branch", "value": "\`$GIT_BRANCH\`", "inline": true },
      { "name": "📝 Commit", "value": "\`$GIT_COMMIT\`", "inline": true },
      { "name": "🏷 Version", "value": "\`v$SD_VERSION\`", "inline": true },
      { "name": "💬 Message", "value": "$GIT_MSG", "inline": false },
      { "name": "⏱ This Deploy", "value": "$DURATION_FMT", "inline": true },
      { "name": "📊 Avg Deploy", "value": "$NEW_AVG_FMT", "inline": true },
      { "name": "🖥 Host", "value": "$REMOTE_HOST:$SCHRODRIVE_PORT", "inline": true }
    ],
    "footer": { "text": "SchroDrive CI • Deployed by $GIT_AUTHOR" },
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }]
}
EOF
)"
else
    echo -e "${RED}"
    echo "  ╔═══════════════════════════════════════════════════════════╗"
    echo "  ║  ${ERROR}  SchroDrive deploy had issues                        ║"
    echo "  ║  Container may not be healthy — check logs               ║"
    echo "  ╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    discord_send "$(cat <<EOF
{
  "embeds": [{
    "title": "⚠️ SchroDrive — Deploy Issues",
    "description": "Deployment completed but SchroDrive may not be healthy.\nImage: \`$GHCR_IMAGE:$IMAGE_TAG\`",
    "color": 15158332,
    "fields": [
      { "name": "🌿 Branch", "value": "\`$GIT_BRANCH\`", "inline": true },
      { "name": "📝 Commit", "value": "\`$GIT_COMMIT\`", "inline": true },
      { "name": "⏱ Elapsed", "value": "$DURATION_FMT", "inline": true }
    ],
    "footer": { "text": "SchroDrive CI • Deployed by $GIT_AUTHOR" },
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }]
}
EOF
)"
    exit 1
fi
