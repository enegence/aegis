#!/usr/bin/env bash
# Start Underwing Core with Docker Compose, preferring the configured host port and
# temporarily falling forward if that local port is unavailable.
set -euo pipefail

BOLD='\033[1m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RESET='\033[0m'

say()  { echo -e "${CYAN}${BOLD}[underwing]${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
ok()   { echo -e "${GREEN}✓${RESET} $*"; }

read_env() {
  local key="$1"
  local value=""
  if [[ -f ".env" ]]; then
    value="$(grep -E "^${key}=" .env | tail -n 1 | cut -d= -f2- || true)"
  fi
  printf '%s' "${!key:-${value}}"
}

# Settings are named UNDERWING_*. A .env written before the rename uses
# AEGIS_* for the same settings, so read the new name first, then the old one.
read_setting() {
  local name="$1"
  local default="${2:-}"
  local value
  value="$(read_env "UNDERWING_${name}")"
  if [[ -z "${value}" ]]; then
    value="$(read_env "AEGIS_${name}")"
  fi
  printf '%s' "${value:-${default}}"
}

CONTAINER_PORT="$(read_setting "PORT" "8000")"
REQUESTED_HOST_PORT="$(read_setting "HOST_PORT" "${CONTAINER_PORT}")"
HOST_PORT="${REQUESTED_HOST_PORT}"

port_is_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :${port}" | awk 'NR > 1 { found = 1 } END { exit found ? 0 : 1 }'
  else
    (echo >"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1
  fi
}

# True when the port is held by this project's own container. No service name
# is given, so this matches the "underwing" service and also a container still
# running from before the rename, when the service was called "aegis".
port_is_used_by_current_underwing() {
  local port="$1"
  local container_ids container_id
  container_ids="$(docker compose ps -q 2>/dev/null || true)"
  for container_id in ${container_ids}; do
    if docker inspect -f '{{range $containerPort, $bindings := .NetworkSettings.Ports}}{{range $bindings}}{{println .HostPort}}{{end}}{{end}}' "${container_id}" 2>/dev/null \
      | grep -qx "${port}"; then
      return 0
    fi
  done
  return 1
}

if [[ ! "${HOST_PORT}" =~ ^[0-9]+$ ]] || (( HOST_PORT < 1 || HOST_PORT > 65535 )); then
  echo "Invalid host port: ${HOST_PORT}" >&2
  exit 1
fi

while port_is_in_use "${HOST_PORT}"; do
  if port_is_used_by_current_underwing "${HOST_PORT}"; then
    break
  fi
  HOST_PORT=$((HOST_PORT + 1))
  if (( HOST_PORT > 65535 )); then
    echo "No available host port found after ${REQUESTED_HOST_PORT}" >&2
    exit 1
  fi
done

if [[ "${HOST_PORT}" != "${REQUESTED_HOST_PORT}" ]]; then
  warn "Host port ${REQUESTED_HOST_PORT} is in use; using ${HOST_PORT} for this start."
  warn "The configured port remains ${REQUESTED_HOST_PORT}; next start will try it again first."
fi

say "Building and starting Underwing Core with Docker Compose..."
# --remove-orphans replaces a container left over from the old "aegis" service
# instead of leaving it running beside the new one on the same data.
UNDERWING_HOST_PORT="${HOST_PORT}" docker compose up -d --build --force-recreate --remove-orphans

APP_URL="$(read_setting "APP_URL" "http://localhost")"
APP_URL="${APP_URL%/}"
OPEN_URL="${APP_URL}"
if [[ "${APP_URL}" =~ ^http://(localhost|127\.0\.0\.1|0\.0\.0\.0)$ ]] && [[ "${HOST_PORT}" != "80" ]]; then
  OPEN_URL="${APP_URL}:${HOST_PORT}"
elif [[ "${APP_URL}" =~ ^https://(localhost|127\.0\.0\.1|0\.0\.0\.0)$ ]] && [[ "${HOST_PORT}" != "443" ]]; then
  OPEN_URL="${APP_URL}:${HOST_PORT}"
fi

ok "Underwing Core started on host port ${HOST_PORT} (container port ${CONTAINER_PORT})."
echo ""
echo -e "  ${BOLD}Open:${RESET} ${OPEN_URL}"
