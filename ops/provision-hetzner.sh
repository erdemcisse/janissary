#!/usr/bin/env bash
set -euo pipefail

: "${SSH_KEY_NAME:?Set SSH_KEY_NAME to an existing Hetzner SSH key name}"
: "${SSH_SOURCE_CIDR:?Set SSH_SOURCE_CIDR, for example 203.0.113.10/32}"
command -v hcloud >/dev/null || { echo "Install the official hcloud CLI first"; exit 1; }

server_name=${SERVER_NAME:-janissary-prod}
firewall_name=${FIREWALL_NAME:-janissary-public}
location=${HCLOUD_LOCATION:-nbg1}
server_type=${HCLOUD_SERVER_TYPE:-ccx33}

if hcloud server describe "${server_name}" >/dev/null 2>&1; then
  echo "Refusing to replace existing server ${server_name}"
  exit 1
fi
if ! hcloud firewall describe "${firewall_name}" >/dev/null 2>&1; then
  hcloud firewall create --name "${firewall_name}"
  hcloud firewall add-rule "${firewall_name}" --direction in --protocol tcp --port 22 --source-ips "${SSH_SOURCE_CIDR}" --description "Operator SSH"
  hcloud firewall add-rule "${firewall_name}" --direction in --protocol tcp --port 80 --source-ips 0.0.0.0/0 --source-ips ::/0 --description "HTTP redirect and ACME"
  hcloud firewall add-rule "${firewall_name}" --direction in --protocol tcp --port 443 --source-ips 0.0.0.0/0 --source-ips ::/0 --description "HTTPS and WebSocket"
  hcloud firewall add-rule "${firewall_name}" --direction in --protocol udp --port 443 --source-ips 0.0.0.0/0 --source-ips ::/0 --description "HTTP/3"
fi

hcloud server create \
  --name "${server_name}" \
  --type "${server_type}" \
  --image ubuntu-24.04 \
  --location "${location}" \
  --ssh-key "${SSH_KEY_NAME}" \
  --firewall "${firewall_name}" \
  --enable-backup \
  --enable-protection delete,rebuild \
  --label role=janissary-game

server_ip=$(hcloud server ip "${server_name}")
echo "Created ${server_name} (${server_type}, ${location}) at ${server_ip}."
echo "Human step: point the game's A/AAAA DNS records at this server, upload the repo to /opt/janissary, then run deploy.sh there."
