#!/usr/bin/env bash
set -euo pipefail

database_path=${JANISSARY_DB_PATH:-/opt/janissary/data/janissary.db}
backup_dir=${JANISSARY_BACKUP_DIR:-/var/backups/janissary}
retention_days=${JANISSARY_BACKUP_RETENTION_DAYS:-14}

install -d -m 0750 "${backup_dir}"
if [[ ! -f ${database_path} ]]; then
  echo "Database does not exist: ${database_path}"
  exit 1
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary=$(mktemp "${backup_dir}/.janissary-${timestamp}.XXXXXX.db")
snapshot="${backup_dir}/janissary-${timestamp}.db.gz"
trap 'rm -f "${temporary}"' EXIT

sqlite3 "${database_path}" ".timeout 10000" ".backup '${temporary}'"
integrity=$(sqlite3 "${temporary}" "PRAGMA integrity_check;")
if [[ ${integrity} != ok ]]; then
  echo "Backup integrity check failed: ${integrity}"
  exit 1
fi
gzip -9 -c "${temporary}" > "${snapshot}.tmp"
mv "${snapshot}.tmp" "${snapshot}"
sha256sum "${snapshot}" > "${snapshot}.sha256"
find "${backup_dir}" -maxdepth 1 -type f -name 'janissary-*.db.gz' -mtime "+${retention_days}" -delete
find "${backup_dir}" -maxdepth 1 -type f -name 'janissary-*.db.gz.sha256' -mtime "+${retention_days}" -delete

if [[ -n ${JANISSARY_BACKUP_COPY_TARGET:-} ]]; then
  rsync -a "${snapshot}" "${snapshot}.sha256" "${JANISSARY_BACKUP_COPY_TARGET}/"
fi
echo "Created ${snapshot}"
