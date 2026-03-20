#!/bin/bash

set -e

echo "=========================================="
echo "教育动画展示系统 - 安装脚本"
echo "=========================================="

if [ "$EUID" -ne 0 ]; then
  echo "请使用root权限运行此脚本"
  exit 1
fi

PROJECT_DIR="/var/www/edusimu"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "1. 更新系统包..."
apt-get update

echo "2. 安装必要软件..."
apt-get install -y python3 python3-pip python3-venv nodejs npm postgresql postgresql-contrib nginx

echo "3. 配置PostgreSQL数据库..."
sudo -u postgres psql -c "CREATE DATABASE edusimu;"
sudo -u postgres psql -c "CREATE USER edusimu WITH PASSWORD 'edusimu123';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE edusimu TO edusimu;"
sudo -u postgres psql -c "ALTER USER edusimu CREATEDB;"

echo "4. 创建项目目录..."
mkdir -p $PROJECT_DIR
mkdir -p $PROJECT_DIR/backend/uploads

echo "5. 复制项目文件..."
cp -r $CURRENT_DIR/backend/* $PROJECT_DIR/backend/
cp -r $CURRENT_DIR/frontend $PROJECT_DIR/

echo "6. 安装Python依赖..."
cd $PROJECT_DIR/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "7. 初始化数据库..."
python init_db.py

echo "8. 安装前端依赖并构建..."
cd $PROJECT_DIR/frontend
npm install
npm run build

echo "9. 配置Nginx..."
cp $CURRENT_DIR/nginx/edusimu.conf /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/edusimu.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t

echo "10. 配置Systemd服务..."
cp $CURRENT_DIR/nginx/edusimu-backend.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable edusimu-backend
systemctl start edusimu-backend
systemctl restart nginx

echo "=========================================="
echo "安装完成！"
echo "=========================================="
echo ""
echo "默认管理员账号："
echo "  用户名: admin"
echo "  密码: admin123"
echo ""
echo "请访问: http://$(hostname -I | awk '{print $1}')"
echo ""
echo "后续操作："
echo "1. 登录系统并修改管理员密码"
echo "2. 创建教师账号"
echo "3. 批量创建学生账号"
echo "4. 上传教学动画"
echo ""
echo "日志位置："
echo "  后端日志: journalctl -u edusimu-backend"
echo "  Nginx日志: /var/log/nginx/"
echo "=========================================="