#!/usr/bin/env bash
set -euo pipefail

# Perspective Agents push bridge installer.
# Run on the machine that runs your OpenClaw gateway.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/taylorarndt/perspective-push-bridge/main/install.sh | bash
#
# Required environment:
#   RELAY_AUTH    Shared auth token for the push relay (get yours from the
#                 Perspective Agents app → Help → Background push notifications).
#
# Optional overrides:
#   RELAY_URL     Push relay endpoint (default: Techopolis-hosted).
#   WATCH_DIRS    Colon-separated list of OpenClaw session dirs to watch.
#                 (default: $HOME/.openclaw/agents/main/sessions)
#   INSTALL_DIR   Where to install (default: /opt/perspective-push-bridge)
#   SERVICE_NAME  systemd unit name (default: perspective-push-bridge)

INSTALL_DIR="${INSTALL_DIR:-/opt/perspective-push-bridge}"
SERVICE_NAME="${SERVICE_NAME:-perspective-push-bridge}"
RELAY_URL_DEFAULT="http://66.212.21.208:8799/notify"
WATCH_DIRS_DEFAULT="${HOME}/.openclaw/agents/main/sessions"
RAW_BASE="${RAW_BASE:-https://raw.githubusercontent.com/taylorarndt/perspective-push-bridge/main}"

RELAY_URL="${RELAY_URL:-$RELAY_URL_DEFAULT}"
RELAY_AUTH="${RELAY_AUTH:-}"
WATCH_DIRS="${WATCH_DIRS:-$WATCH_DIRS_DEFAULT}"

log() { printf '==> %s\n' "$*"; }
err() { printf 'error: %s\n' "$*" >&2; }

need_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    err "Please run as root (try: sudo bash)."
    exit 1
  fi
}

require_auth() {
  if [[ -z "${RELAY_AUTH}" ]]; then
    err "RELAY_AUTH is not set."
    err "Get your token from Perspective Agents → Help → Background push notifications,"
    err "then rerun the installer with it, e.g.:"
    err "  curl -sSL ${RAW_BASE}/install.sh | sudo RELAY_AUTH=<token> bash"
    exit 1
  fi
}

ensure_node() {
  if ! command -v node >/dev/null 2>&1; then
    log "Installing Node.js 20.x via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
}

download_watcher() {
  log "Downloading watcher to ${INSTALL_DIR}/watcher.mjs..."
  mkdir -p "${INSTALL_DIR}"
  curl -fsSL "${RAW_BASE}/watcher.mjs" -o "${INSTALL_DIR}/watcher.mjs"
}

write_env() {
  local env_file="${INSTALL_DIR}/.env"
  log "Writing ${env_file}..."
  cat > "${env_file}" <<EOF
RELAY_URL=${RELAY_URL}
RELAY_AUTH=${RELAY_AUTH}
WATCH_DIRS=${WATCH_DIRS}
OFFSETS_PATH=${INSTALL_DIR}/offsets.json
NOTIFY_TITLE=Perspective Agents
GATEWAY_LABEL=$(hostname)
EOF
  chmod 600 "${env_file}"
}

write_service() {
  local unit="/etc/systemd/system/${SERVICE_NAME}.service"
  log "Writing ${unit}..."
  cat > "${unit}" <<EOF
[Unit]
Description=Perspective Agents push bridge
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=/usr/bin/env node ${INSTALL_DIR}/watcher.mjs
Restart=on-failure
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
EOF
}

start_service() {
  log "Reloading systemd and starting ${SERVICE_NAME}..."
  systemctl daemon-reload
  systemctl enable --now "${SERVICE_NAME}"
  sleep 1
  systemctl status "${SERVICE_NAME}" --no-pager | head -10 || true
}

main() {
  need_root
  require_auth
  ensure_node
  download_watcher
  write_env
  write_service
  start_service
  log "Done. Tail logs with: journalctl -u ${SERVICE_NAME} -f"
}

main "$@"
