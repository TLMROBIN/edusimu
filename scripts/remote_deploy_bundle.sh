#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
if [[ -f "${PROJECT_ROOT}/.deploy-frontend-only" ]]; then
  rm -f "${PROJECT_ROOT}/.deploy-frontend-only"
  exec /bin/bash "${PROJECT_ROOT}/scripts/deploy_live_frontend.sh" --skip-build
fi

if [[ -f "${PROJECT_ROOT}/.deploy-tongjiang-isolation" ]]; then
  rm -f "${PROJECT_ROOT}/.deploy-tongjiang-isolation"
  exec /bin/bash "${PROJECT_ROOT}/scripts/deploy_tongjiang_isolation.sh"
fi
if [[ -f "${PROJECT_ROOT}/.deploy-nginx-3003" ]]; then
  rm -f "${PROJECT_ROOT}/.deploy-nginx-3003"
  exec /bin/bash "${PROJECT_ROOT}/scripts/deploy_nginx_3003.sh"
fi
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
DESCRIPTION_CLEANUP_INSPECT_MARKER="${PROJECT_ROOT}/.inspect-courseware-descriptions"
DESCRIPTION_CLEANUP_APPLY_MARKER="${PROJECT_ROOT}/.cleanup-courseware-descriptions"
MINGXING_DESCRIPTION_INSPECT_MARKER="${PROJECT_ROOT}/.inspect-mingxing-descriptions"
MINGXING_DESCRIPTION_BACKFILL_MARKER="${PROJECT_ROOT}/.backfill-mingxing-descriptions"
UNIT_REVIEW_INSPECT_MARKER="${PROJECT_ROOT}/.inspect-unit-review-courseware"
UNIT_REVIEW_IMPORT_MARKER="${PROJECT_ROOT}/.import-unit-review-courseware"
TABLET_DIAGNOSTIC_INSPECT_MARKER="${PROJECT_ROOT}/.inspect-tablet-diagnostic-courseware"
TABLET_DIAGNOSTIC_IMPORT_MARKER="${PROJECT_ROOT}/.import-tablet-diagnostic-courseware"
TABLET_DIAGNOSTIC_UNPUBLISH_MARKER="${PROJECT_ROOT}/.unpublish-tablet-diagnostic-courseware"
TABLET_MAINTENANCE_MARKER="${PROJECT_ROOT}/.tablet-maintenance-action"
MECHANICS_LAB_MARKER="${PROJECT_ROOT}/.import-mechanics-lab"

if [[ -f "${MECHANICS_LAB_MARKER}" ]]; then
  rm -f "${MECHANICS_LAB_MARKER}"
  cd "${PROJECT_ROOT}"
  EDUSIMU_BACKEND_DIR="/var/www/edusimu/backend" \
    /var/www/edusimu/backend/venv/bin/python \
    "${PROJECT_ROOT}/scripts/import_mechanics_lab.py" apply
  exit $?
fi

if [[ -f "${TABLET_DIAGNOSTIC_INSPECT_MARKER}" || -f "${TABLET_DIAGNOSTIC_IMPORT_MARKER}" || -f "${TABLET_DIAGNOSTIC_UNPUBLISH_MARKER}" ]]; then
  TABLET_DIAGNOSTIC_ACTION="inspect"
  if [[ -f "${TABLET_DIAGNOSTIC_IMPORT_MARKER}" ]]; then
    TABLET_DIAGNOSTIC_ACTION="apply"
  fi
  if [[ -f "${TABLET_DIAGNOSTIC_UNPUBLISH_MARKER}" ]]; then
    TABLET_DIAGNOSTIC_ACTION="unpublish"
  fi
  rm -f "${TABLET_DIAGNOSTIC_INSPECT_MARKER}" "${TABLET_DIAGNOSTIC_IMPORT_MARKER}" "${TABLET_DIAGNOSTIC_UNPUBLISH_MARKER}"
  echo "核对并维护平板性能检测课件"
  cd "${PROJECT_ROOT}"
  EDUSIMU_BACKEND_DIR="/var/www/edusimu/backend" \
    /var/www/edusimu/backend/venv/bin/python \
    "${PROJECT_ROOT}/scripts/import_tablet_diagnostic.py" "${TABLET_DIAGNOSTIC_ACTION}"
  exit $?
fi

if [[ -f "${TABLET_MAINTENANCE_MARKER}" ]]; then
  MAINTENANCE_ACTION="$(cat "${TABLET_MAINTENANCE_MARKER}")"
  rm -f "${TABLET_MAINTENANCE_MARKER}"
  echo "执行平板适配与性能标签维护: ${MAINTENANCE_ACTION}"
  cd "${PROJECT_ROOT}"
  EDUSIMU_BACKEND_DIR="/var/www/edusimu/backend" \
    /var/www/edusimu/backend/venv/bin/python \
    "${PROJECT_ROOT}/scripts/apply_tablet_and_thumbnail_maintenance.py" "${MAINTENANCE_ACTION}"
  exit $?
fi

if [[ -f "${MINGXING_DESCRIPTION_INSPECT_MARKER}" || -f "${MINGXING_DESCRIPTION_BACKFILL_MARKER}" ]]; then
  MINGXING_DESCRIPTION_ACTION="inspect"
  if [[ -f "${MINGXING_DESCRIPTION_BACKFILL_MARKER}" ]]; then
    MINGXING_DESCRIPTION_ACTION="apply"
  fi
  rm -f "${MINGXING_DESCRIPTION_INSPECT_MARKER}" "${MINGXING_DESCRIPTION_BACKFILL_MARKER}"
  echo "为敏行物理课件补写中文内容说明"
  cd "${PROJECT_ROOT}"
  EDUSIMU_BACKEND_DIR="/var/www/edusimu/backend" \
    /var/www/edusimu/backend/venv/bin/python \
    "${PROJECT_ROOT}/scripts/backfill_mingxing_descriptions.py" "${MINGXING_DESCRIPTION_ACTION}"
  exit $?
fi

if [[ -f "${DESCRIPTION_CLEANUP_INSPECT_MARKER}" || -f "${DESCRIPTION_CLEANUP_APPLY_MARKER}" ]]; then
  DESCRIPTION_CLEANUP_ACTION="inspect"
  if [[ -f "${DESCRIPTION_CLEANUP_APPLY_MARKER}" ]]; then
    DESCRIPTION_CLEANUP_ACTION="apply"
  fi
  rm -f "${DESCRIPTION_CLEANUP_INSPECT_MARKER}" "${DESCRIPTION_CLEANUP_APPLY_MARKER}"
  echo "清理课件说明中的英文导入来源信息"
  cd "${PROJECT_ROOT}"
  EDUSIMU_BACKEND_DIR="/var/www/edusimu/backend" \
    /var/www/edusimu/backend/venv/bin/python \
    "${PROJECT_ROOT}/scripts/cleanup_courseware_descriptions.py" "${DESCRIPTION_CLEANUP_ACTION}"
  exit $?
fi

if [[ -f "${UNIT_REVIEW_INSPECT_MARKER}" || -f "${UNIT_REVIEW_IMPORT_MARKER}" ]]; then
  UNIT_REVIEW_ACTION="inspect"
  if [[ -f "${UNIT_REVIEW_IMPORT_MARKER}" ]]; then
    UNIT_REVIEW_ACTION="apply"
  fi
  rm -f "${UNIT_REVIEW_INSPECT_MARKER}" "${UNIT_REVIEW_IMPORT_MARKER}"
  echo "核对并登记三套单元复习课件"
  cd "${PROJECT_ROOT}"
  EDUSIMU_BACKEND_DIR="/var/www/edusimu/backend" \
    /var/www/edusimu/backend/venv/bin/python \
    "${PROJECT_ROOT}/scripts/import_unit_review_courseware.py" "${UNIT_REVIEW_ACTION}"
  exit $?
fi

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
