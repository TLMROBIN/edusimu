#!/usr/bin/env python3
"""
动画批量导入工具
用于将现有的HTML动画文件批量导入到系统中
"""

import os
import sys
import csv
import time
import random
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, settings
from app.models import Animation, Subject, User
from app.auth import get_password_hash

def get_subject_id_map(db):
    """获取学科ID映射"""
    subjects = db.query(Subject).all()
    return {s.name: s.id for s in subjects}

def import_single_animation(db, file_path, metadata, creator_id):
    """导入单个动画文件"""
    try:
        subject_name = metadata.get('subject', 'physics')
        subject_map = get_subject_id_map(db)
        
        if subject_name not in subject_map:
            print(f"  警告: 学科 '{subject_name}' 不存在，使用默认学科 'physics'")
            subject_name = 'physics'
        
        subject_id = subject_map[subject_name]
        
        upload_dir = os.path.join(settings.upload_dir, str(subject_id))
        os.makedirs(upload_dir, exist_ok=True)
        
        timestamp = int(time.time() * 1000)
        random_id = random.randint(1000, 9999)
        filename = f"{timestamp}_{random_id}.html"
        dest_path = os.path.join(upload_dir, filename)
        
        import shutil
        shutil.copy2(file_path, dest_path)
        
        file_size = os.path.getsize(dest_path)
        
        animation = Animation(
            title=metadata.get('title', Path(file_path).stem),
            subject_id=subject_id,
            description=metadata.get('description', ''),
            file_path=dest_path,
            grade_level=metadata.get('grade_level', ''),
            keywords=metadata.get('keywords', ''),
            source_type=metadata.get('source_type', 'original'),
            is_published=metadata.get('is_published', True),
            file_size=file_size,
            created_by=creator_id
        )
        
        db.add(animation)
        db.commit()
        db.refresh(animation)
        
        print(f"  ✓ 导入成功: {animation.title} (ID: {animation.id})")
        return True
        
    except Exception as e:
        print(f"  ✗ 导入失败: {str(e)}")
        db.rollback()
        return False

def import_from_directory(db, directory, creator_id, default_metadata=None):
    """从目录批量导入动画"""
    if default_metadata is None:
        default_metadata = {}
    
    directory = Path(directory)
    if not directory.exists():
        print(f"错误: 目录 '{directory}' 不存在")
        return 0
    
    html_files = list(directory.glob("**/*.html"))
    
    if not html_files:
        print(f"警告: 目录 '{directory}' 中没有找到HTML文件")
        return 0
    
    print(f"\n找到 {len(html_files)} 个HTML文件")
    print("开始导入...\n")
    
    success_count = 0
    for idx, html_file in enumerate(html_files, 1):
        print(f"[{idx}/{len(html_files)}] 处理文件: {html_file.name}")
        
        metadata = default_metadata.copy()
        
        parent_dir = html_file.parent.name
        if parent_dir in ['chinese', 'math', 'english', 'physics', 'chemistry', 
                          'biology', 'geography', 'politics', 'history']:
            metadata['subject'] = parent_dir
        
        if import_single_animation(db, str(html_file), metadata, creator_id):
            success_count += 1
    
    print(f"\n导入完成: 成功 {success_count}/{len(html_files)}")
    return success_count

def import_from_csv(db, csv_file, creator_id):
    """从CSV文件导入动画"""
    csv_path = Path(csv_file)
    if not csv_path.exists():
        print(f"错误: CSV文件 '{csv_file}' 不存在")
        return 0
    
    print(f"\n从CSV文件导入: {csv_path}")
    
    success_count = 0
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        
        print(f"找到 {len(rows)} 条记录\n")
        
        for idx, row in enumerate(rows, 1):
            print(f"[{idx}/{len(rows)}] 处理: {row.get('title', row.get('file', 'Unknown'))}")
            
            file_path = row.get('file', '')
            if not os.path.exists(file_path):
                print(f"  ✗ 文件不存在: {file_path}")
                continue
            
            metadata = {
                'title': row.get('title', Path(file_path).stem),
                'subject': row.get('subject', 'physics'),
                'description': row.get('description', ''),
                'grade_level': row.get('grade_level', ''),
                'keywords': row.get('keywords', ''),
                'is_published': row.get('is_published', 'true').lower() == 'true'
            }
            
            if import_single_animation(db, file_path, metadata, creator_id):
                success_count += 1
    
    print(f"\n导入完成: 成功 {success_count}/{len(rows)}")
    return success_count

def create_teacher_account(db, username, password, real_name):
    """创建教师账号"""
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        print(f"教师账号 '{username}' 已存在")
        return existing.id
    
    teacher = User(
        username=username,
        password_hash=get_password_hash(password),
        role='teacher',
        real_name=real_name,
        is_active=True
    )
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    
    print(f"创建教师账号: {username} (ID: {teacher.id})")
    return teacher.id

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='教育动画批量导入工具')
    parser.add_argument('--mode', choices=['directory', 'csv'], default='directory',
                       help='导入模式: directory(目录) 或 csv(CSV文件)')
    parser.add_argument('--path', required=True, help='目录路径或CSV文件路径')
    parser.add_argument('--creator', type=int, help='创建者用户ID')
    parser.add_argument('--subject', default='physics', help='默认学科分类')
    parser.add_argument('--published', action='store_true', default=True,
                       help='导入后是否发布')
    parser.add_argument('--create-teacher', action='store_true',
                       help='创建示例教师账号')
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("教育动画批量导入工具")
    print("=" * 60)
    
    db = SessionLocal()
    
    try:
        if args.create_teacher:
            teacher_id = create_teacher_account(db, 'teacher', 'teacher123', '演示教师')
        elif args.creator:
            teacher_id = args.creator
        else:
            admin = db.query(User).filter(User.role == 'admin').first()
            if not admin:
                print("错误: 未找到管理员账号，请先初始化数据库")
                return
            teacher_id = admin.id
            print(f"使用管理员账号作为创建者 (ID: {teacher_id})")
        
        default_metadata = {
            'subject': args.subject,
            'is_published': args.published
        }
        
        if args.mode == 'directory':
            import_from_directory(db, args.path, teacher_id, default_metadata)
        elif args.mode == 'csv':
            import_from_csv(db, args.path, teacher_id)
        
        print("\n" + "=" * 60)
        print("导入完成！")
        print("=" * 60)
        
    except KeyboardInterrupt:
        print("\n\n用户取消操作")
        db.rollback()
    except Exception as e:
        print(f"\n错误: {str(e)}")
        db.rollback()
    finally:
        db.close()

if __name__ == '__main__':
    main()
