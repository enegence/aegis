#!/usr/bin/env bash
# Underwing Core: interactive setup script
# Generates .env with strong secrets, creates data directory, and prints next steps.
set -euo pipefail

BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

# The hosted Underwing site (Relay, Hosted, managed delivery).
HOSTED_SITE_URL="https://underwing.life"

say()  { echo -e "${CYAN}${BOLD}[underwing]${RESET} $*"; }
ok()   { echo -e "${GREEN}✓${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
die()  { echo -e "${RED}✗${RESET} $*"; exit 1; }

print_smtp_guidance() {
  echo ""
  say "Email delivery guidance"
  echo "  • Easiest self-hosted path: Gmail with a Google App Password."
  echo "    Host: smtp.gmail.com  Port: 587  SSL/TLS: false"
  echo "    Use the generated 16-character App Password, not your Google password."
  echo "  • Other SMTP-friendly options: SMTP2GO, Resend, Brevo, MailerSend,"
  echo "    SendGrid, Mailgun, and Postmark."
  echo "  • If you do not want to manage SMTP at all, Underwing Relay/Hosted includes"
  echo "    managed delivery. See: ${HOSTED_SITE_URL}"
  echo ""
}

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  Underwing Core: Self-Hosted Setup${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
say "This script will:"
echo "  • Generate cryptographically secure secrets for new installs"
echo "  • Preserve existing secrets when updating an existing .env"
echo "  • Create a .env file with your configuration"
echo "  • Create the ./data directory for the database and packets"
echo "  • Print Docker Compose next steps"
echo ""

# ── Check for existing .env ───────────────────────────────────────────────────

read_env_value() {
  local key="$1"
  if [[ -f ".env" ]]; then
    grep -E "^${key}=" .env | tail -n 1 | cut -d= -f2- || true
  fi
}

# Settings are named UNDERWING_*. A .env written before the rename uses
# AEGIS_* for the same settings, so read the new name first, then the old one.
read_setting() {
  local name="$1"
  local value
  value="$(read_env_value "UNDERWING_${name}")"
  if [[ -z "${value}" ]]; then
    value="$(read_env_value "AEGIS_${name}")"
  fi
  printf '%s' "${value}"
}

EXISTING_SECRET_KEY="$(read_setting "SECRET_KEY")"
EXISTING_FIELD_KEY="$(read_setting "FIELD_ENCRYPTION_KEY")"

# New installs use data/underwing.db. An install set up before the rename has
# data/aegis.db: keep pointing at that file, never start a second database.
DB_FILE="underwing.db"
EXISTING_DB=false
if [[ -f "./data/underwing.db" || -f "./data/underwing.db-wal" || -f "./data/underwing.db-shm" ]]; then
  EXISTING_DB=true
elif [[ -f "./data/aegis.db" || -f "./data/aegis.db-wal" || -f "./data/aegis.db-shm" ]]; then
  EXISTING_DB=true
  DB_FILE="aegis.db"
fi

if [[ -f ".env" ]]; then
  warn ".env already exists."
  if [[ "${EXISTING_DB}" == "true" ]]; then
    warn "Existing data/${DB_FILE} found. Setup will preserve existing encryption/session secrets."
  fi
  read -rp "  Overwrite it? [y/N] " overwrite
  if [[ ! "${overwrite}" =~ ^[Yy]$ ]]; then
    die "Aborted. Existing .env preserved."
  fi
fi

# ── Secret generation ─────────────────────────────────────────────────────────

gen_secret() {
  local nbytes="${1:-32}"
  if command -v openssl &>/dev/null; then
    openssl rand -hex "${nbytes}"
  elif command -v node &>/dev/null; then
    node -e "process.stdout.write(require('crypto').randomBytes(${nbytes}).toString('hex'))"
  else
    head -c "${nbytes}" /dev/urandom | od -A n -t x1 | tr -d ' \n'
  fi
}

say "Generating secrets…"
SECRET_KEY="$(gen_secret 64)"
FIELD_KEY="$(gen_secret 32)"
SECRET_STATUS="generated"
FIELD_KEY_STATUS="generated"
if [[ -n "${EXISTING_SECRET_KEY}" ]]; then
  SECRET_KEY="${EXISTING_SECRET_KEY}"
  SECRET_STATUS="preserved from existing .env"
fi
if [[ -n "${EXISTING_FIELD_KEY}" ]]; then
  FIELD_KEY="${EXISTING_FIELD_KEY}"
  FIELD_KEY_STATUS="preserved from existing .env"
fi
ok "UNDERWING_SECRET_KEY ${SECRET_STATUS}"
ok "UNDERWING_FIELD_ENCRYPTION_KEY ${FIELD_KEY_STATUS}"

# ── App URL and port ──────────────────────────────────────────────────────────

echo ""
say "App configuration"
read -rp "  Public app URL used in claim links [http://localhost:8000]: " APP_URL
APP_URL="${APP_URL:-http://localhost:8000}"
APP_URL="${APP_URL%/}"
if [[ ! "${APP_URL}" =~ ^https?:// ]]; then
  die "App URL must start with http:// or https://."
fi
read -rp "  Port [8000]: " APP_PORT
APP_PORT="${APP_PORT:-8000}"
if [[ ! "${APP_PORT}" =~ ^[0-9]+$ ]] || (( APP_PORT < 1 || APP_PORT > 65535 )); then
  die "Port must be a number from 1 to 65535."
fi

OPEN_URL="${APP_URL}"

# ── Optional providers ────────────────────────────────────────────────────────

echo ""
say "Optional providers (can be configured later in Settings)"
print_smtp_guidance

SMTP_SECTION=""
read -rp "  Configure SMTP now? [y/N] " do_smtp
if [[ "${do_smtp}" =~ ^[Yy]$ ]]; then
  read -rp "    SMTP host: " SMTP_HOST
  read -rp "    SMTP port [587]: " SMTP_PORT
  SMTP_PORT="${SMTP_PORT:-587}"
  read -rp "    SMTP user (username/email): " SMTP_USER
  read -rsp "    SMTP password: " SMTP_PASS
  echo ""
  read -rp "    From email: " SMTP_FROM
  SMTP_SECURE_DEFAULT="false"
  if [[ "${SMTP_PORT}" == "465" ]]; then
    SMTP_SECURE_DEFAULT="true"
  fi
  read -rp "    Use SSL/TLS? [${SMTP_SECURE_DEFAULT}]: " SMTP_SECURE
  SMTP_SECURE="${SMTP_SECURE:-${SMTP_SECURE_DEFAULT}}"
  if [[ "${SMTP_SECURE}" =~ ^[Yy]$ ]]; then
    SMTP_SECURE="true"
  elif [[ "${SMTP_SECURE}" =~ ^[Nn]$ ]]; then
    SMTP_SECURE="false"
  fi
  if [[ ! "${SMTP_SECURE}" =~ ^(true|false)$ ]]; then
    die "SMTP SSL/TLS must be true or false."
  fi
  SMTP_SECTION="UNDERWING_SMTP_HOST=${SMTP_HOST}
UNDERWING_SMTP_PORT=${SMTP_PORT}
UNDERWING_SMTP_USER=${SMTP_USER}
UNDERWING_SMTP_PASSWORD=${SMTP_PASS}
UNDERWING_SMTP_FROM=${SMTP_FROM}
UNDERWING_SMTP_SECURE=${SMTP_SECURE}"
  ok "SMTP configured"
else
  SMTP_SECTION="# UNDERWING_SMTP_HOST=
# UNDERWING_SMTP_PORT=587
# UNDERWING_SMTP_USER=
# UNDERWING_SMTP_PASSWORD=
# UNDERWING_SMTP_FROM=
# UNDERWING_SMTP_SECURE=false"
  warn "SMTP skipped. Configure it in Settings → Notifications after first login, or use Underwing Relay/Hosted for managed delivery."
fi

TG_SECTION=""
read -rp "  Configure Telegram now? [y/N] " do_telegram
if [[ "${do_telegram}" =~ ^[Yy]$ ]]; then
  read -rsp "    Telegram bot token: " TG_TOKEN
  echo ""
  read -rp "    Telegram chat ID: " TG_CHAT
  TG_SECTION="UNDERWING_TELEGRAM_BOT_TOKEN=${TG_TOKEN}
UNDERWING_TELEGRAM_CHAT_ID=${TG_CHAT}"
  ok "Telegram configured"
else
  TG_SECTION="# UNDERWING_TELEGRAM_BOT_TOKEN=
# UNDERWING_TELEGRAM_CHAT_ID="
  warn "Telegram skipped. Configure it in Settings → Notifications after first login."
fi

S3_SECTION=""
read -rp "  Configure S3-compatible Packet Mirror storage now? [y/N] " do_s3
if [[ "${do_s3}" =~ ^[Yy]$ ]]; then
  read -rp "    S3 endpoint (blank for AWS S3): " S3_ENDPOINT
  read -rp "    S3 region [us-east-1]: " S3_REGION
  S3_REGION="${S3_REGION:-us-east-1}"
  read -rp "    S3 bucket name: " S3_BUCKET
  read -rp "    S3 access key ID: " S3_KEY_ID
  read -rsp "    S3 secret access key: " S3_SECRET
  echo ""
  read -rp "    S3 key prefix [underwing]: " S3_PREFIX
  S3_PREFIX="${S3_PREFIX:-underwing}"
  S3_SECTION="UNDERWING_S3_ENDPOINT=${S3_ENDPOINT}
UNDERWING_S3_REGION=${S3_REGION}
UNDERWING_S3_BUCKET=${S3_BUCKET}
UNDERWING_S3_ACCESS_KEY_ID=${S3_KEY_ID}
UNDERWING_S3_SECRET_ACCESS_KEY=${S3_SECRET}
UNDERWING_S3_PREFIX=${S3_PREFIX}"
  ok "S3 storage configured"
else
  S3_SECTION="# UNDERWING_S3_ENDPOINT=
# UNDERWING_S3_REGION=us-east-1
# UNDERWING_S3_BUCKET=
# UNDERWING_S3_ACCESS_KEY_ID=
# UNDERWING_S3_SECRET_ACCESS_KEY=
# UNDERWING_S3_PREFIX=underwing"
  warn "S3 skipped. Configure it in Settings → Storage after first login."
fi

# ── Write .env ────────────────────────────────────────────────────────────────

say "Writing .env…"
cat > .env <<EOF
# Underwing Core configuration, generated by setup.sh
# Keep this file private. Back it up securely.
NODE_ENV=production

UNDERWING_PORT=${APP_PORT}
UNDERWING_HOST_PORT=${APP_PORT}
UNDERWING_HOST=0.0.0.0
UNDERWING_APP_URL=${APP_URL}
UNDERWING_DB_PATH=/data/${DB_FILE}
UNDERWING_DATA_DIR=/data

# Secrets: never share these
UNDERWING_SECRET_KEY=${SECRET_KEY}
UNDERWING_FIELD_ENCRYPTION_KEY=${FIELD_KEY}

# Notifications
${SMTP_SECTION}

${TG_SECTION}

# Storage (Packet Mirror)
${S3_SECTION}
EOF

ok ".env written"

# ── Create data directory ─────────────────────────────────────────────────────

mkdir -p ./data/packets
ok "./data directory created"

# ── Detect stale running container ────────────────────────────────────────────

RUNNING_COMPOSE_CONTAINER=false
if command -v docker &>/dev/null; then
  # The compose service is "underwing"; it was "aegis" before the rename.
  if docker compose ps --services --filter status=running 2>/dev/null | grep -qxE "underwing|aegis"; then
    RUNNING_COMPOSE_CONTAINER=true
  fi
fi

# ── Print next steps ──────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}${BOLD}Setup complete!${RESET}"
echo ""
if [[ "${RUNNING_COMPOSE_CONTAINER}" == "true" ]]; then
  warn "Underwing Core is already running. Existing Docker containers keep their old port and environment until restarted."
  echo ""
fi
echo -e "  ${BOLD}Start with Docker Compose:${RESET}"
echo "    ./start.sh"
echo ""
echo -e "  ${BOLD}Then open your browser at:${RESET}"
echo "    ${OPEN_URL}"
echo ""
echo -e "  ${BOLD}The first visit will guide you through owner account creation.${RESET}"
echo ""
echo -e "${YELLOW}${BOLD}Important security reminders:${RESET}"
echo -e "  ${YELLOW}•${RESET} Your .env contains secrets. Keep it private and back it up securely."
echo -e "  ${YELLOW}•${RESET} Your database and data directory contain encrypted but sensitive application state."
echo -e "  ${YELLOW}•${RESET} Vault Mode alone does not guarantee automated release if this host goes offline."
echo -e "  ${YELLOW}•${RESET} Back up your .env and data/ together. Neither is useful without the other."
echo -e "  ${YELLOW}•${RESET} If SMTP setup is more work than you want, Underwing Relay/Hosted includes managed delivery:"
echo -e "    ${HOSTED_SITE_URL}"
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
