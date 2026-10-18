#!/usr/bin/env bash
set -euo pipefail

cd "${JANISSARY_APP_DIR:-/opt/janissary}"
before=$(docker compose ps -q server)
[[ -n ${before} ]] || { echo "Server container is not running"; exit 1; }
before_started=$(docker inspect --format '{{.State.StartedAt}}' "${before}")
docker kill "${before}" >/dev/null
for attempt in $(seq 1 30); do
  sleep 2
  after=$(docker compose ps -q server)
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${after}" 2>/dev/null || true)
  after_started=$(docker inspect --format '{{.State.StartedAt}}' "${after}" 2>/dev/null || true)
  if [[ -n ${after} && ${after_started} != "${before_started}" && ${health} == healthy ]]; then
    echo "PASS: Docker restarted the killed server container and health is green"
    exit 0
  fi
done
echo "FAIL: server did not recover within 60 seconds"
exit 1
