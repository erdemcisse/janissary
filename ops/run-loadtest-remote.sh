#!/usr/bin/env bash
set -euo pipefail

: "${GAME_URL:?Set GAME_URL, for example wss://game.example.com}"
: "${METRICS_TOKEN:?Copy METRICS_TOKEN securely from the server's /opt/janissary/.env}"

export LOADTEST_GENERATOR_DESCRIPTION=${LOADTEST_GENERATOR_DESCRIPTION:-"$(hostname), $(nproc) logical CPUs, $(free -h | awk '/^Mem:/ {print $2}') RAM"}
export LOADTEST_SERVER_DESCRIPTION=${LOADTEST_SERVER_DESCRIPTION:-"Hetzner CCX33, 8 dedicated vCPU / 32 GB, Germany"}
export LOADTEST_NETWORK_PATH=${LOADTEST_NETWORK_PATH:-"separate load-generator host over public WSS/TLS"}

pnpm install --frozen-lockfile
pnpm loadtest --count 1000 --duration 300 --url "${GAME_URL}"
