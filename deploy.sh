#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root from /opt/janissary: sudo ./deploy.sh"
  exit 1
fi
existing_value() {
  [[ -f .env ]] || return 0
  awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' .env
}

domain=${DOMAIN:-$(existing_value DOMAIN)}
supabase_url=${SUPABASE_URL:-$(existing_value SUPABASE_URL)}
supabase_anon_key=${SUPABASE_ANON_KEY:-$(existing_value SUPABASE_ANON_KEY)}
token_secret=${TOKEN_SECRET:-$(existing_value TOKEN_SECRET)}
metrics_token=${METRICS_TOKEN:-$(existing_value METRICS_TOKEN)}

if [[ ! ${domain} =~ ^[A-Za-z0-9.-]+$ || ${domain} != *.* ]]; then
  echo "DOMAIN must be a DNS hostname already pointing at this VPS"
  exit 1
fi
if [[ ! ${supabase_url} =~ ^https://[A-Za-z0-9.-]+\.supabase\.co$ ]]; then
  echo "SUPABASE_URL must be the Frankfurt project's https://*.supabase.co URL"
  exit 1
fi
if [[ ${#supabase_anon_key} -lt 20 || ${supabase_anon_key} == *$'\n'* ]]; then
  echo "SUPABASE_ANON_KEY is required and must not contain newlines"
  exit 1
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl docker.io docker-compose-v2 openssl rsync sqlite3
systemctl enable --now docker

if [[ -z ${token_secret} ]]; then token_secret=$(openssl rand -base64 48); fi
if [[ -z ${metrics_token} ]]; then metrics_token=$(openssl rand -base64 48); fi
if [[ ${#token_secret} -lt 32 || ${token_secret} == *$'\n'* || ${token_secret} =~ (change-me|replace-with|example|default) ]]; then
  echo "TOKEN_SECRET must be a non-placeholder value of at least 32 characters"
  exit 1
fi
if [[ ${#metrics_token} -lt 32 || ${metrics_token} == *$'\n'* || ${metrics_token} =~ (change-me|replace-with|example|default) ]]; then
  echo "METRICS_TOKEN must be a non-placeholder value of at least 32 characters"
  exit 1
fi

install -d -m 0750 data /var/backups/janissary
umask 077
printf '%s\n' \
  "DOMAIN=${domain}" \
  "TOKEN_SECRET=${token_secret}" \
  "METRICS_TOKEN=${metrics_token}" \
  "PUBLIC_ORIGIN=https://${domain}" \
  "TRUST_PROXY=1" \
  "SUPABASE_URL=${supabase_url}" \
  "SUPABASE_ANON_KEY=${supabase_anon_key}" \
  "AUTH_REDIRECT_URL=https://${domain}/" > .env
chmod 0600 .env

install -m 0644 ops/janissary-backup.service /etc/systemd/system/janissary-backup.service
install -m 0644 ops/janissary-backup.timer /etc/systemd/system/janissary-backup.timer
systemctl daemon-reload
systemctl enable --now janissary-backup.timer

docker compose config --quiet
docker compose pull caddy
docker compose up -d --build --remove-orphans
docker compose ps
echo "Deployment started. Verify: curl -fsS https://${domain}/health"
echo "METRICS_TOKEN was stored only in $(pwd)/.env; use it from a separate load generator."
