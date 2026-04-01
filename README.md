# 教育动画展示系统

一个用于承载教学HTML动画的Web平台，支持学生交互、学习记录追踪和多学科分类。

## 功能特性

- **多学科支持**：语文、数学、英语、物理、化学、生物、地理、政治、历史
- **用户管理**：学生、教师、管理员三级权限体系
- **动画管理**：上传、发布、编辑、删除HTML动画
- **GeoGebra课件制作**：本地脚本编辑、离线预览、自动缩略图、回填编辑
- **学习追踪**：记录观看时长、交互次数、测验成绩
- **评价系统**：收藏、评分、评论功能
- **管理后台**：教师管理学生账号、查看学习统计
- **性能优化**：支持上百人并发访问

## 技术栈

### 后端
- **FastAPI**：高性能Python Web框架
- **PostgreSQL**：关系型数据库
- **SQLAlchemy**：ORM工具
- **JWT**：用户认证

### 前端
- **Vue 3**：渐进式JavaScript框架
- **Element Plus**：UI组件库
- **Vite**：构建工具
- **Pinia**：状态管理

### 服务器
- **Nginx**：Web服务器和反向代理
- **Systemd**：进程管理

## 快速开始

### 安装

1. 上传项目到服务器
2. 运行一键安装脚本：

```bash
sudo ./scripts/install.sh
```

### 访问系统

安装完成后，通过浏览器访问：
```
http://服务器IP地址
```

### 运行控制

推荐统一使用一个脚本管理启动、停止和状态：

```bash
./scripts/control.sh start
./scripts/control.sh stop
./scripts/control.sh restart
./scripts/control.sh status
```

兼容旧命令：

```bash
./scripts/start.sh
./scripts/stop.sh
```

### 导入 PhET 单文件 HTML

如果要把官方 PhET 单文件 HTML 导入到系统里，可以使用：

```bash
./backend/venv/bin/python ./scripts/import_phet_html.py \
  --source-url "https://phet.colorado.edu/sims/html/faradays-electromagnetic-lab/1.0.2/faradays-electromagnetic-lab_en.html" \
  --title "PhET 法拉第电磁实验室" \
  --subject-id 4 \
  --textbook-node-id 1009 \
  --creator admin \
  --grade-level "高二" \
  --keywords "PhET,电磁感应,感应电流方向,法拉第,虚拟实验" \
  --description "官方 PhET 仿真，用于探究感应电流方向、磁通量变化与电磁感应现象。" \
  --publish \
  --keep-processed ./tmp/faradays-electromagnetic-lab_edusimu.html
```

这个脚本会自动完成：
- 下载或读取本地 HTML
- 做一轮适配 EduSimu 的净化处理
- 复用后端现有的资源本地化和课件校验
- 导入数据库并在校验通过时直接发布

**默认管理员账号：**
- 用户名：`admin`
- 密码：`admin123`

### GeoGebra 课件制作与发布

系统已支持一个完全本地化的 GeoGebra 工作流：

- 后台新增 `GeoGebra 制作` 页面
- 左侧填写课件信息、GeoGebra 配置和脚本
- 右侧使用站内 `/geogebra` 离线运行库实时预览
- 上传时自动截取预览缩略图
- GeoGebra 课件支持再次回填到编辑器中继续修改

**课件一键发布：**

- 教师：点击“提交审核”即可生成 GeoGebra 课件并进入现有审核流程
- 管理员：可点击“一键发布”直接上线
- 已有 GeoGebra 课件可在动画管理页点击“GeoGebra 编辑”后再次更新并发布

**系统一键上线：**

```bash
chmod +x ./deploy_geogebra_feature.sh
./deploy_geogebra_feature.sh
```

请直接以普通用户执行，不要在脚本外层再套一层 `sudo`。

这个脚本会自动完成：
- 构建前端
- 确认 GeoGebra 离线运行库已打包进 `dist`
- 部署后端 GeoGebra 上传/编辑接口
- 部署前端页面和 `/geogebra` 本地资源
- 重启后端服务
- 检查健康接口和 GeoGebra 离线资源是否在线

**重要：首次登录后请立即修改管理员密码！**

## 项目结构

```
edusimu/
├── backend/                    # 后端服务
│   ├── app/
│   │   ├── main.py            # FastAPI应用入口
│   │   ├── database.py        # 数据库连接
│   │   ├── models.py          # 数据模型
│   │   ├── schemas.py         # 数据验证
│   │   ├── auth.py            # 认证逻辑
│   │   ├── init_db.py         # 数据库初始化
│   │   └── routers/           # API路由
│   ├── uploads/               # 动画文件存储
│   ├── requirements.txt       # Python依赖
│   └── .env                   # 环境变量
│
├── frontend/                  # 前端应用
│   ├── src/
│   │   ├── views/            # 页面组件
│   │   ├── components/       # 通用组件
│   │   ├── router/           # 路由配置
│   │   ├── stores/           # 状态管理
│   │   └── assets/           # 静态资源
│   ├── package.json          # Node.js依赖
│   └── vite.config.js        # Vite配置
│
├── nginx/                     # Nginx配置
│   ├── edusimu.conf          # 站点配置
│   └── edusimu-backend.service # Systemd服务
│
├── docs/                      # 文档
│   ├── 部署指南.md
│   ├── 使用手册.md
│   ├── 教师操作手册.md
│   └── 搭建思路文档.md
│
├── scripts/                   # 部署脚本
│   ├── install.sh            # 一键安装
│   ├── start.sh              # 启动服务
│   └── stop.sh               # 停止服务
│
└── README.md                  # 项目说明
```

## 主要功能

### 学生端
- 按学科浏览动画
- 搜索动画
- 观看动画并交互
- 收藏动画
- 评分和评论
- 查看个人学习记录

### 教师端
- 数据统计总览
- 批量创建学生账号
- 上传HTML动画
- 管理动画（发布/下架/删除）
- 查看学生学习记录
- 导出学习数据

### 管理员
- 管理教师账号
- 审核动画
- 系统配置
- 查看系统日志

## API文档

启动后端服务后，访问：
```
http://服务器IP地址/api/docs
```

查看完整的API文档（Swagger UI）。

## 数据库设计

### 核心表
- `users`：用户表（学生、教师、管理员）
- `subjects`：学科分类表
- `animations`：动画表
- `favorites`：收藏表
- `ratings`：评分评论表
- `view_history`：观看历史表
- `animation_interactions`：交互记录表

详细设计见 `docs/搭建思路文档.md`

## 部署文档

详细的部署说明请查看：
- [部署指南](docs/部署指南.md)
- [使用手册](docs/使用手册.md)
- [教师操作手册](docs/教师操作手册.md)
- [系统接手与维护指南](docs/系统接手与维护指南.md)
- [运维与更新手册](docs/运维与更新手册.md)
- [整机迁移与换机手册](docs/整机迁移与换机手册.md)
- [远端同步](docs/远端同步.md)

## 开发环境

### 后端开发

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

说明：
- 开发环境默认读取 `backend/.env`，当前默认数据库为本地 SQLite：`backend/edusimu.db`
- 应用启动时会自动建表并初始化管理员账号和学科数据，不需要手动执行 `init_db.py`
- 如果要切换到 PostgreSQL，只需要修改 `backend/.env` 里的 `DATABASE_URL`

### 前端开发

```bash
cd frontend
npm install
npm run dev
```

说明：
- Vite 开发服务器已代理 `/api` 和 `/uploads` 到 `http://localhost:8000`
- 如果旧的 `frontend/dist` 是 root 生成的，`npm run build` 可能会因为权限失败；开发验证可先执行 `npx vite build --outDir dist-local`

## 系统要求

- **操作系统**：Ubuntu 20.04/22.04 LTS
- **内存**：至少 2GB RAM（推荐 4GB+）
- **存储**：至少 10GB 可用空间
- **CPU**：建议 2核以上
- **并发**：支持 100+ 用户同时访问

## 性能参数

- 数据库连接池：20个连接，最大溢出40个
- 文件上传限制：50MB
- Token有效期：24小时
- 静态文件缓存：30天

## 安全建议

1. 修改默认管理员密码
2. 修改数据库默认密码
3. 配置防火墙规则
4. 定期备份数据库
5. 使用HTTPS（生产环境）

## 许可证

本项目仅供教育用途。

## 联系方式

- 项目文档：`/var/www/edusimu/docs/`
- 配置文件：`/var/www/edusimu/backend/.env`

## 更新日志

### v1.0.0 (2026-03-04)
- 初始版本发布
- 完整的用户管理系统
- 动画上传与管理
- 学习记录追踪
- 多学科支持
- 响应式界面设计
