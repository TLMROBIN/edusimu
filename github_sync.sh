#!/bin/bash
# 自动提交并推送到 GitHub 的脚本
cd /home/binyu/文档/trae_projects/edusimu || exit 1

# 添加所有变更
git -c credential.helper= add .

# 检查是否有变更需要提交
if git -c credential.helper= status --porcelain | grep -q .; then
    # 获取当前时间作为提交信息
    COMMIT_MSG="Auto commit: $(date '+%Y-%m-%d %H:%M:%S')"
    # 也可以使用传入的参数作为提交信息
    if [ ! -z "$1" ]; then
        COMMIT_MSG="$1"
    fi
    
    echo "正在提交变更: $COMMIT_MSG"
    git -c credential.helper= commit -m "$COMMIT_MSG"
    
    echo "正在推送到 GitHub..."
    # 禁用 credential helper 避免挂起
    git -c credential.helper= push origin main
    echo "推送成功！"
else
    echo "没有需要提交的变更。"
fi
