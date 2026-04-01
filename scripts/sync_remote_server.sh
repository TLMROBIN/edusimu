#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

REMOTE_HOST="${REMOTE_HOST:-10.50.159.62}"
REMOTE_USER="${REMOTE_USER:-yub}"
REMOTE_PORT="${REMOTE_PORT:-22}"
REMOTE_SOURCE_DIR="${REMOTE_SOURCE_DIR:-/home/yub/文档/trae_projects/edusimu}"
REMOTE_TARGET="${REMOTE_USER}@${REMOTE_HOST}"
SSH_OPTS=(-p "${REMOTE_PORT}" -o StrictHostKeyChecking=accept-new)

if ! command -v ssh >/dev/null 2>&1; then
  echo "未找到 ssh，请先安装 OpenSSH 客户端。" >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "未找到 rsync，请先安装 rsync。" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm，请先安装 Node.js / npm。" >&2
  exit 1
fi

echo "[1/5] 本机构建前端 dist"
(
  cd "${PROJECT_ROOT}/frontend"
  npm run build
)

echo "[2/5] 同步源码到远端工作区 ${REMOTE_TARGET}:${REMOTE_SOURCE_DIR}"
ssh "${SSH_OPTS[@]}" "${REMOTE_TARGET}" "mkdir -p '${REMOTE_SOURCE_DIR}'"
rsync -az --delete \
  -e "ssh -p ${REMOTE_PORT} -o StrictHostKeyChecking=accept-new" \
  --exclude '.git' \
  --exclude 'backend/venv' \
  --exclude 'backend/uploads' \
  --exclude 'frontend/node_modules' \
  --exclude 'tmp' \
  --exclude '*.pyc' \
  --exclude '__pycache__/' \
  "${PROJECT_ROOT}/" "${REMOTE_TARGET}:${REMOTE_SOURCE_DIR}/"

echo "[3/5] 远端发布并验收"
ssh -tt "${SSH_OPTS[@]}" "${REMOTE_TARGET}" \
  "sudo bash '${REMOTE_SOURCE_DIR}/scripts/remote_deploy_bundle.sh'"

echo "远端同步发布完成: http://${REMOTE_HOST}:3003"
