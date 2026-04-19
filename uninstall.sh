#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/perspective-push-bridge}"
SERVICE_NAME="${SERVICE_NAME:-perspective-push-bridge}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root." >&2
  exit 1
fi

systemctl disable --now "${SERVICE_NAME}" 2>/dev/null || true
rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
rm -rf "${INSTALL_DIR}"
echo "Removed ${SERVICE_NAME} and ${INSTALL_DIR}."
