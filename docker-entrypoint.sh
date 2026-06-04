#!/bin/bash
set -e

# Handle PUID/PGID
PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "
──────────────────────────────────────────
  SchroDrive Media Manager
  UID: ${PUID} | GID: ${PGID} | TZ: ${TZ}
──────────────────────────────────────────
"

# Update user/group IDs if they differ from defaults
if [ "$(id -u schrodrive)" != "${PUID}" ]; then
    usermod -u ${PUID} schrodrive
fi
if [ "$(id -g schrodrive)" != "${PGID}" ]; then
    groupmod -g ${PGID} schrodrive
fi

# Ensure config directory has default config if missing
if [ ! -f /config/config.json ]; then
    cp /app/config.example.json /config/config.json
    echo "Created default config at /config/config.json"
fi

# Ensure directory ownership (including /media for import worker)
chown -R schrodrive:schrodrive /config /app/logs 2>/dev/null || true
# Only chown top-level /media dirs — don't recurse into cloud mounts
for dir in /media/library /media/staging /media/downloads; do
    mkdir -p "$dir" 2>/dev/null || true
    chown schrodrive:schrodrive "$dir" 2>/dev/null || true
done

# Drop to app user and execute
exec gosu schrodrive "$@"
