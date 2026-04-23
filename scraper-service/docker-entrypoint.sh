#!/usr/bin/env bash
# Launches an Xvfb virtual framebuffer so Chromium can run in "headed" mode
# inside a container with no physical display. Headed Chromium clears
# Cloudflare challenges substantially more reliably than `headless: 'new'`.
#
# If SCRAPE_HEADLESS=true, we skip Xvfb entirely and let Chromium run
# headless as before.
set -euo pipefail

# Clean up stale Chromium singleton locks left behind if the previous
# container was killed ungracefully. These files are hostname-scoped, so a
# new container (with a new hostname) would otherwise refuse to reuse the
# profile. They are only lock sentinels — no cookies / storage lives here.
PROFILE_DIR="${CHROME_USER_DATA_DIR:-/app/.chrome-profile}"
if [[ -d "$PROFILE_DIR" ]]; then
  rm -f \
    "$PROFILE_DIR/SingletonLock" \
    "$PROFILE_DIR/SingletonCookie" \
    "$PROFILE_DIR/SingletonSocket" \
    "$PROFILE_DIR"/Singleton* \
    2>/dev/null || true
  echo "[entrypoint] Cleared stale Chromium singleton locks in ${PROFILE_DIR}"
fi

if [[ "${SCRAPE_HEADLESS:-false}" == "true" ]]; then
  echo "[entrypoint] SCRAPE_HEADLESS=true — skipping Xvfb, running headless"
  exec node src/index.js
fi

DISPLAY_NUM="${DISPLAY_NUM:-99}"
SCREEN_SIZE="${SCREEN_SIZE:-1920x1080x24}"

echo "[entrypoint] Starting Xvfb on :${DISPLAY_NUM} (${SCREEN_SIZE})"
Xvfb ":${DISPLAY_NUM}" -screen 0 "${SCREEN_SIZE}" -ac +extension GLX +render -noreset &
XVFB_PID=$!

# Give Xvfb a moment to come up.
sleep 1

# Propagate signals so `docker stop` is graceful.
trap 'kill -TERM "$XVFB_PID" 2>/dev/null || true' TERM INT

export DISPLAY=":${DISPLAY_NUM}"
echo "[entrypoint] DISPLAY=${DISPLAY}; launching worker"

exec node src/index.js
