#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"
bash ./scripts/deploy_live_backend.sh
bash ./scripts/deploy_live_frontend.sh --skip-build
systemctl is-active postgresql
systemctl is-active edusimu-backend
systemctl is-active nginx
