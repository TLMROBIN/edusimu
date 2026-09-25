#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${EDUSIMU_PROJECT_ROOT:-/home/yub/文档/trae_projects/edusimu}"
BRANCH="${EDUSIMU_DEPLOY_BRANCH:-main}"
REMOTE="${EDUSIMU_DEPLOY_REMOTE:-origin}"
LOCK_FILE="${EDUSIMU_DEPLOY_LOCK:-/var/lock/edusimu-github-deploy.lock}"
NODE_BIN_DIR="${EDUSIMU_NODE_BIN_DIR:-/opt/node-current/bin}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This deploy script must run as root because it publishes into /var/www and restarts system services." >&2
  exit 1
fi

if [[ ! -d "${PROJECT_ROOT}/.git" ]]; then
  echo "Project root is not a Git checkout: ${PROJECT_ROOT}" >&2
  exit 1
fi

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another edusimu GitHub deploy is already running."
  exit 0
fi

PROJECT_USER="${EDUSIMU_PROJECT_USER:-$(stat -c %U "${PROJECT_ROOT}")}"
PATH="${NODE_BIN_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PATH

run_as_project_user() {
  sudo -u "${PROJECT_USER}" env PATH="${PATH}" HOME="$(getent passwd "${PROJECT_USER}" | cut -d: -f6)" "$@"
}

cd "${PROJECT_ROOT}"

if ! run_as_project_user git diff --quiet || ! run_as_project_user git diff --cached --quiet; then
  echo "Refusing to deploy over tracked local changes in ${PROJECT_ROOT}." >&2
  run_as_project_user git status --short >&2
  exit 1
fi

echo "[1/5] Fetch ${REMOTE}/${BRANCH}"
run_as_project_user git fetch --prune "${REMOTE}" "${BRANCH}"

LOCAL_HEAD="$(run_as_project_user git rev-parse HEAD)"
REMOTE_HEAD="$(run_as_project_user git rev-parse "${REMOTE}/${BRANCH}")"

if [[ "${LOCAL_HEAD}" == "${REMOTE_HEAD}" ]]; then
  echo "Already up to date: ${LOCAL_HEAD:0:7}"
  exit 0
fi

echo "[2/5] Fast-forward ${LOCAL_HEAD:0:7} -> ${REMOTE_HEAD:0:7}"
run_as_project_user git pull --ff-only "${REMOTE}" "${BRANCH}"

echo "[3/5] Build frontend dist on remote"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm not found in PATH=${PATH}" >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if (( NODE_MAJOR < 18 )); then
  echo "Node.js >= 18 is required for Vite; found $(node -v)." >&2
  exit 1
fi

if [[ -f frontend/package-lock.json ]]; then
  run_as_project_user bash -lc "cd '${PROJECT_ROOT}/frontend' && npm ci"
else
  run_as_project_user bash -lc "cd '${PROJECT_ROOT}/frontend' && npm install"
fi
run_as_project_user bash -lc "cd '${PROJECT_ROOT}/frontend' && VITE_PUBLIC_BASE=/edusimu/ npm run build"

echo "[4/5] Publish backend and frontend"
bash "${PROJECT_ROOT}/scripts/remote_deploy_bundle.sh"

echo "[5/5] Verify services"
systemctl is-active postgresql
systemctl is-active edusimu-backend
systemctl is-active nginx

echo "Deployed ${REMOTE_HEAD:0:7} from GitHub."
