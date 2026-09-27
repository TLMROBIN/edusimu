#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMPORT_MARKER="${PROJECT_ROOT}/.import-mingxing-public-courseware"
IMPORT_MINGXING=0
COURSEWARE_FIX_MARKER="${PROJECT_ROOT}/.apply-courseware-catalog-fixes"
APPLY_COURSEWARE_FIXES=0

if [[ -f "${IMPORT_MARKER}" ]]; then
  IMPORT_MINGXING=1
  rm -f "${IMPORT_MARKER}"
fi
if [[ -f "${COURSEWARE_FIX_MARKER}" ]]; then
  APPLY_COURSEWARE_FIXES=1
  rm -f "${COURSEWARE_FIX_MARKER}"
fi

cd "${PROJECT_ROOT}"
bash ./scripts/deploy_live_backend.sh
bash ./scripts/deploy_live_frontend.sh --skip-build

if [[ "${IMPORT_MINGXING}" -eq 1 ]]; then
  echo "导入敏行物理公开课件到线上数据库"
  EDUSIMU_BACKEND_DIR="/var/www/edusimu/backend" \
    /var/www/edusimu/backend/venv/bin/python \
    "${PROJECT_ROOT}/scripts/import_mingxing_public_courseware.py" \
    --report "/var/www/edusimu/backend/mingxing-physics-import-report.json" || {
      status=$?
      if [[ "${status}" -ne 1 ]]; then
        exit "${status}"
      fi
      echo "部分敏行物理课件未通过离线校验；详见远端导入报告。"
    }
fi

if [[ "${APPLY_COURSEWARE_FIXES}" -eq 1 ]]; then
  echo "修复敏行物理目录并发布传送带模型模拟器"
  EDUSIMU_BACKEND_DIR="/var/www/edusimu/backend" \
    /var/www/edusimu/backend/venv/bin/python \
    "${PROJECT_ROOT}/scripts/apply_courseware_catalog_fixes.py" --apply
fi

systemctl is-active postgresql
systemctl is-active edusimu-backend
systemctl is-active nginx
