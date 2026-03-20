#!/bin/bash

set -euo pipefail

ACTION="${1:-}"
SERVICES=("postgresql" "edusimu-backend" "nginx")

if [[ -z "$ACTION" ]]; then
  echo "用法: ./scripts/control.sh {start|stop|restart|status}"
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  SUDO="sudo"
else
  SUDO=""
fi

run_systemctl() {
  local action="$1"
  local service="$2"
  if [[ -n "$SUDO" ]]; then
    $SUDO systemctl "$action" "$service"
  else
    systemctl "$action" "$service"
  fi
}

show_status() {
  for service in "${SERVICES[@]}"; do
    if [[ -n "$SUDO" ]]; then
      $SUDO systemctl --no-pager --lines=0 status "$service" || true
    else
      systemctl --no-pager --lines=0 status "$service" || true
    fi
    echo
  done
}

case "$ACTION" in
  start)
    echo "启动教育动画展示系统..."
    run_systemctl start postgresql
    run_systemctl start edusimu-backend
    run_systemctl start nginx
    echo "系统已启动"
    echo "访问地址: http://$(hostname -I | awk '{print $1}')"
    ;;
  stop)
    echo "停止教育动画展示系统..."
    run_systemctl stop nginx
    run_systemctl stop edusimu-backend
    run_systemctl stop postgresql
    echo "系统已停止"
    ;;
  restart)
    echo "重启教育动画展示系统..."
    run_systemctl restart postgresql
    run_systemctl restart edusimu-backend
    run_systemctl restart nginx
    echo "系统已重启"
    echo "访问地址: http://$(hostname -I | awk '{print $1}')"
    ;;
  status)
    show_status
    ;;
  *)
    echo "不支持的操作: $ACTION"
    echo "用法: ./scripts/control.sh {start|stop|restart|status}"
    exit 1
    ;;
esac
