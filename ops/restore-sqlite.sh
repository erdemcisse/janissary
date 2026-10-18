#!/usr/bin/env bash
set -euo pipefail

if [[ ${1:-} != --confirm || -z ${2:-} ]]; then
  echo "Usage: sudo $0 --confirm /var/backups/janissary/janissary-TIMESTAMP.db.gz"
  exit 1
fi
snapshot=$2
app_dir=${JANISSARY_APP_DIR:-/opt/janissary}
database_path=${JANISSARY_DB_PATH:-${app_dir}/data/janissary.db}
if [[ ! -f ${snapshot} || ! -f ${snapshot}.sha256 ]]; then
  echo "Snapshot or checksum sidecar is missing"
  exit 1
fi
cd "${app_dir}"
sha256sum --check "${snapshot}.sha256"
temporary=$(mktemp "${app_dir}/data/.restore.XXXXXX.db")
trap 'rm -f "${temporary}"' EXIT
gzip -dc "${snapshot}" > "${temporary}"
[[ $(sqlite3 "${temporary}" "PRAGMA integrity_check;") == ok ]] || { echo "Restore candidate failed integrity check"; exit 1; }
docker compose stop server
if [[ -f ${database_path} ]]; then cp -a "${database_path}" "${database_path}.pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"; fi
install -o 1000 -g 1000 -m 0640 "${temporary}" "${database_path}"
rm -f "${database_path}-wal" "${database_path}-shm"
docker compose up -d server
docker compose ps server
