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

# Ensure directory ownership
chown -R schrodrive:schrodrive /config /app/logs 2>/dev/null || true

# Drop to app user and execute
exec gosu schrodrive "$@"
