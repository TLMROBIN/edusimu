#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMPORT_MARKER="${PROJECT_ROOT}/.import-mingxing-public-courseware"
IMPORT_MINGXING=0
COURSEWARE_FIX_MARKER="${PROJECT_ROOT}/.apply-courseware-catalog-fixes"
APPLY_COURSEWARE_FIXES=0
PRODUCTION_COURSEWARE_INSPECT_MARKER="${PROJECT_ROOT}/.inspect-production-courseware"
PRODUCTION_COURSEWARE_DEPLOY_MARKER="${PROJECT_ROOT}/.deploy-production-courseware"
MISSING_THUMBNAILS_EXPORT_MARKER="${PROJECT_ROOT}/.export-production-missing-thumbnails"
MISSING_THUMBNAILS_APPLY_MARKER="${PROJECT_ROOT}/.apply-production-missing-thumbnails"
THUMBNAIL_AUDIT_EXPORT_MARKER="${PROJECT_ROOT}/.export-production-thumbnail-audit"
THUMBNAIL_AUDIT_APPLY_MARKER="${PROJECT_ROOT}/.apply-production-thumbnail-audit"
ZLMMXWL_MISSING_MARKER="${PROJECT_ROOT}/.import-zlmmxwl-missing"
MISSING_COURSEWARE_MARKER="${PROJECT_ROOT}/.import-missing-courseware"

if [[ -f "${MISSING_COURSEWARE_MARKER}" || -f "${ZLMMXWL_MISSING_MARKER}" ]]; then
  rm -f "${MISSING_COURSEWARE_MARKER}" "${ZLMMXWL_MISSING_MARKER}"
  echo "导入本地化后的所有新课件（敏行物理 + 题景未来课件）"
  cd "${PROJECT_ROOT}"
  EDUSIMU_BACKEND_DIR="/var/www/edusimu/backend" \
    /var/www/edusimu/backend/venv/bin/python \
    "${PROJECT_ROOT}/scripts/import_missing_courseware.py"
  exit $?
fi

if [[ -f "${THUMBNAIL_AUDIT_EXPORT_MARKER}" || -f "${THUMBNAIL_AUDIT_APPLY_MARKER}" ]]; then
  THUMBNAIL_AUDIT_ACTION="export"
  if [[ -f "${THUMBNAIL_AUDIT_APPLY_MARKER}" ]]; then
    THUMBNAIL_AUDIT_ACTION="apply"
  fi
  rm -f "${THUMBNAIL_AUDIT_EXPORT_MARKER}" "${THUMBNAIL_AUDIT_APPLY_MARKER}"
  cd "${PROJECT_ROOT}"
  EDUSIMU_BACKEND_DIR="/var/www/edusimu/backend" \
    /var/www/edusimu/backend/venv/bin/python \
    "${PROJECT_ROOT}/scripts/production_thumbnail_audit.py" "${THUMBNAIL_AUDIT_ACTION}"
  exit $?
fi

if [[ -f "${MISSING_THUMBNAILS_EXPORT_MARKER}" || -f "${MISSING_THUMBNAILS_APPLY_MARKER}" ]]; then
  THUMBNAIL_ACTION="export"
  if [[ -f "${MISSING_THUMBNAILS_APPLY_MARKER}" ]]; then
    THUMBNAIL_ACTION="apply"
  fi
  rm -f "${MISSING_THUMBNAILS_EXPORT_MARKER}" "${MISSING_THUMBNAILS_APPLY_MARKER}"
  cd "${PROJECT_ROOT}"
  EDUSIMU_BACKEND_DIR="/var/www/edusimu/backend" \
    /var/www/edusimu/backend/venv/bin/python \
    "${PROJECT_ROOT}/scripts/production_missing_thumbnails.py" "${THUMBNAIL_ACTION}"
  exit $?
fi

# Content-only operations must not rebuild or overwrite unrelated application code.
if [[ -f "${PRODUCTION_COURSEWARE_INSPECT_MARKER}" || -f "${PRODUCTION_COURSEWARE_DEPLOY_MARKER}" ]]; then
  COURSEWARE_ACTION="inspect"
  if [[ -f "${PRODUCTION_COURSEWARE_DEPLOY_MARKER}" ]]; then
    COURSEWARE_ACTION="apply"
  fi
  rm -f "${PRODUCTION_COURSEWARE_INSPECT_MARKER}" "${PRODUCTION_COURSEWARE_DEPLOY_MARKER}"
  cd "${PROJECT_ROOT}"
  EDUSIMU_BACKEND_DIR="/var/www/edusimu/backend" \
    /var/www/edusimu/backend/venv/bin/python \
    "${PROJECT_ROOT}/scripts/production_courseware_release.py" "${COURSEWARE_ACTION}"
  exit $?
fi

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
