#!/bin/bash

echo "=========================================="
echo "创建并运行独立初始化脚本"
echo "=========================================="
echo ""

INIT_SCRIPT="/tmp/init_db_standalone.py"

echo "步骤1: 创建初始化脚本..."
cat > $INIT_SCRIPT << 'EOF'
#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, '/var/www/edusimu/backend/app')

from database import engine, Base, SessionLocal, settings
from models import User, Subject
from auth import get_password_hash

def init_database():
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.username == settings.admin_username).first()
        if not admin:
            admin = User(
                username=settings.admin_username,
                password_hash=get_password_hash(settings.admin_password),
                role="admin",
                real_name="系统管理员",
                is_active=True
            )
            db.add(admin)
            print(f"创建管理员账号: {settings.admin_username}")
        
        subjects_data = [
            {"name": "chinese", "display_name": "语文", "sort_order": 1},
            {"name": "math", "display_name": "数学", "sort_order": 2},
            {"name": "english", "display_name": "英语", "sort_order": 3},
            {"name": "physics", "display_name": "物理", "sort_order": 4},
            {"name": "chemistry", "display_name": "化学", "sort_order": 5},
            {"name": "biology", "display_name": "生物", "sort_order": 6},
            {"name": "geography", "display_name": "地理", "sort_order": 7},
            {"name": "politics", "display_name": "政治", "sort_order": 8},
            {"name": "history", "display_name": "历史", "sort_order": 9},
        ]
        
        for subject_data in subjects_data:
            subject = db.query(Subject).filter(Subject.name == subject_data["name"]).first()
            if not subject:
                subject = Subject(**subject_data)
                db.add(subject)
                print(f"创建学科: {subject_data['display_name']}")
        
        db.commit()
        print("数据库初始化完成！")
        
    except Exception as e:
        print(f"初始化失败: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    init_database()
EOF

echo "步骤2: 运行初始化脚本..."
/var/www/edusimu/backend/venv/bin/python $INIT_SCRIPT

echo ""
echo "步骤3: 验证用户创建..."
sudo -u postgres psql -d edusimu -c "SELECT id, username, role, is_active FROM users;"

echo ""
echo "步骤4: 验证学科分类..."
sudo -u postgres psql -d edusimu -c "SELECT id, name, display_name FROM subjects ORDER BY sort_order;"

echo ""
echo "=========================================="
echo "完成！"
echo "=========================================="
echo ""
echo "管理员账号："
echo "  用户名: admin"
echo "  密码: admin123"
echo "  访问地址: http://$(hostname -I | awk '{print $1}'):3003"