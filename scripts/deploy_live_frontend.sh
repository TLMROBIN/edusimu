#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_FRONTEND_DIR="${PROJECT_ROOT}/frontend"
LIVE_FRONTEND_DIR="/var/www/edusimu/frontend/dist"
BUILD_USER="${SUDO_USER:-$(stat -c %U "${PROJECT_ROOT}")}"
SKIP_BUILD=0

if [[ "${1:-}" == "--skip-build" ]]; then
  SKIP_BUILD=1
  shift
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "未找到 rsync，请先安装 rsync。" >&2
  exit 1
fi

if [[ "${SKIP_BUILD}" -eq 0 ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "未找到 npm，请先安装 Node.js / npm。" >&2
    exit 1
  fi

  NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
  if (( NODE_MAJOR < 18 )); then
    echo "当前 Node.js 版本过低: $(node -v)" >&2
    echo "Vite 5 需要 Node.js >= 18。若你是在远端发布，请改用本机构建后同步并执行 --skip-build。" >&2
    exit 1
  fi

  echo "[1/3] 构建前端 dist"
  if [[ "${EUID}" -eq 0 && "${BUILD_USER}" != "root" ]]; then
    sudo -u "${BUILD_USER}" bash -lc "cd '${SOURCE_FRONTEND_DIR}' && VITE_PUBLIC_BASE=/edusimu/ npm run build"
  else
    cd "${SOURCE_FRONTEND_DIR}"
    VITE_PUBLIC_BASE=/edusimu/ npm run build
  fi
else
  echo "[1/3] 跳过前端构建，直接发布现有 dist"
  if [[ ! -d "${SOURCE_FRONTEND_DIR}/dist" ]]; then
    echo "未找到 ${SOURCE_FRONTEND_DIR}/dist，请先在本机构建前端。" >&2
    exit 1
  fi
fi

echo "[2/3] 同步 dist 到线上目录 ${LIVE_FRONTEND_DIR}"
if [[ "${EUID}" -ne 0 ]]; then
  sudo mkdir -p "${LIVE_FRONTEND_DIR}"
  sudo rsync -a --delete "${SOURCE_FRONTEND_DIR}/dist/" "${LIVE_FRONTEND_DIR}/"
  sudo chown -R www-data:www-data /var/www/edusimu/frontend
else
  mkdir -p "${LIVE_FRONTEND_DIR}"
  rsync -a --delete "${SOURCE_FRONTEND_DIR}/dist/" "${LIVE_FRONTEND_DIR}/"
  chown -R www-data:www-data /var/www/edusimu/frontend
fi

echo "[3/3] 校验线上 GeoGebraCreator 构建文件"
ls -lt "${LIVE_FRONTEND_DIR}"/assets/GeoGebraCreator-* "${LIVE_FRONTEND_DIR}/index.html"
echo "前端发布完成。若页面仍显示旧内容，请执行 Ctrl+F5 强制刷新浏览器缓存。"
