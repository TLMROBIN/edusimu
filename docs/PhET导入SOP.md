# PhET 导入 SOP

本文件用于说明当前项目中 PhET 课件的标准导入处理流程，目标是保证：

- 只导入官方课件
- 不重复导入系统里本质相同的课件
- 课件可在局域网离线运行
- 标题、缩略图、章节绑定和描述都能落到系统规范

## 1. 总体流程

当前实际流程分为 6 步：

1. 从 PhET 官网元数据生成候选清单
2. 按实际 `project` 去重，筛掉系统里已有同内容课件
3. 下载官方 HTML 并做离线清洗
4. 导入数据库，按规则发布
5. 导后补标题、缩略图、章节绑定、描述
6. 做内容去重和运行时巡检

## 2. 数据源与基本规则

### 2.1 官方数据源

- 官网分类页：`https://phet.colorado.edu/en/simulations/filter?type=html`
- 官网元数据：`https://phet.colorado.edu/services/metadata/1.3/simulations?format=json&summary&includePrototypes`
- 本地 partner 元数据缓存：`/tmp/phet_partner_simulations.json`

### 2.2 当前规则

- 仅导入官方 HTML 课件
- 不导入 prototype
- 如果有官方 `zh_CN`，优先用官方中文课件
- 如果没有官方 `zh_CN`，课件保持英文，不伪造中文运行版本
- 即使课件本体为英文，系统标题允许单独汉化
- 去重以实际 PhET `project` 为准，不以标题为准
- 如果系统里已有同内容旧课件，保留旧课件，不再重复发布新课件

## 3. 第一步：生成可导入清单

### 3.1 非物理学科

使用脚本：

```bash
backend/venv/bin/python scripts/generate_phet_importable_lists.py \
  --database-url postgresql://edusimu:edusimu123@localhost:5432/edusimu
```

输出结果：

- 汇总文档：`docs/PhET非物理可导入清单.md`
- 明细 CSV：`docs/generated/phet_*.csv`

作用：

- 读取官网元数据
- 识别 `Math & Statistics`、`Chemistry`、`Earth & Space`、`Biology`
- 对照当前数据库中的 PhET `project`
- 区分“新增候选”和“系统已存在的交叉学科课件”

### 3.2 物理学科

当前物理导入主要由：

- `scripts/import_phet_physics_catalog.py`

负责从官方元数据中筛物理课件并直接导入。

## 4. 第二步：正式导入

### 4.1 物理批量导入

当前物理批量导入入口：

```bash
backend/venv/bin/python scripts/import_phet_physics_catalog.py \
  --metadata-file /tmp/phet_partner_simulations.json \
  --subject-id 4 \
  --creator admin \
  --force-publish
```

说明：

- `--force-publish` 允许管理员在校验未通过时强制发布
- 默认仍优先走正常校验发布
- 导入脚本内部会按 `project` 判重

### 4.2 非物理批量导入

当前非物理批量导入入口：

```bash
DATABASE_URL=postgresql://edusimu:edusimu123@localhost:5432/edusimu \
UPLOAD_DIR=/var/www/edusimu/backend/uploads \
backend/venv/bin/python scripts/import_phet_nonphysics_catalog.py --force-publish
```

说明：

- 学科映射为 `Math & Statistics -> math`、`Chemistry -> chemistry`、`Biology -> biology`、`Earth & Space -> geography`
- 仍按 `project` 判重，系统里已有同内容旧课件时直接跳过
- 会优先下载官方 `zh_CN` 版本；没有官方中文时保留英文课件
- 导入时同步补系统中文标题、官方缩略图、章节绑定和描述

### 4.3 单个课件导入

单个 HTML 导入底层入口：

```bash
backend/venv/bin/python scripts/import_phet_html.py ...
```

这个脚本负责：

- 下载或读取原始 HTML
- 做离线清洗
- 保存到 `uploads/`
- 写入数据库
- 触发校验和发布逻辑

## 5. 第三步：离线清洗

核心脚本：

- `scripts/import_phet_html.py`

当前离线清洗规则：

- 保留 PhET 启动脚本和运行时依赖
- 精确移除统计与追踪脚本
- 当前重点移除对象：
  - `yotta`
  - Cloudflare beacon
- 不再粗暴删除可能影响启动的脚本片段

这是之前“新导入课件卡加载”问题的关键修复点。  
历史问题原因是：清洗逻辑误删了 PhET 核心启动脚本。

## 6. 第四步：导后修正

### 6.1 补中文标题和官方缩略图

脚本：

- `scripts/update_phet_titles_thumbnails.py`

作用：

- 对已导入课件补系统标题汉化
- 从官方 `simImages` 下载缩略图

### 6.2 重绑章节和修正描述

脚本：

- `scripts/remap_physics_courseware.py`

作用：

- 根据当前映射规则重新绑定章节
- 统一描述为简洁、真实的课件功能说明

章节绑定原则：

- 优先绑定到最贴近教材内容的节
- 确实没有合适节点时，才回退到兜底章节
- 当前物理兜底节点为：
  - `必修第一册 / 拓展：PhET 仿真 / PhET 物理仿真`

## 7. 第五步：历史课件重处理

### 7.1 批量重做离线修复

脚本：

- `scripts/reprocess_phet_offline.py`
- `scripts/reprocess_existing_phet_by_project.py`

作用：

- 用官方原始 `runUrl` 重新拉取 HTML
- 重新应用新的离线清洗逻辑
- 覆盖旧的本地文件

适用场景：

- 批量导入后发现普遍卡加载
- 清洗规则有变更
- 需要把旧课件统一升级到新的离线口径

## 8. 第六步：去重与巡检

### 8.1 内容去重

脚本：

- `scripts/dedupe_animations_by_content.py`

规则：

- 优先从 HTML 中提取 `window.phet.chipper.project`
- 同一 `project` 视为同一课件
- 保留最旧记录，删除后导入的重复记录

### 8.2 运行时巡检

脚本：

- `scripts/audit_courseware_runtime.js`

作用：

- 通过站点实际 `/uploads/...` URL 打开课件
- 检查运行时报错、加载失败、外链依赖问题
- 用真实部署环境验证，不只看静态文件

## 9. 当前相关文件

- 候选清单生成：`scripts/generate_phet_importable_lists.py`
- 非物理清单：`docs/PhET非物理可导入清单.md`
- 物理批量导入：`scripts/import_phet_physics_catalog.py`
- 非物理批量导入：`scripts/import_phet_nonphysics_catalog.py`
- 单课件导入/离线清洗：`scripts/import_phet_html.py`
- 离线重处理：`scripts/reprocess_phet_offline.py`
- 老记录按项目重处理：`scripts/reprocess_existing_phet_by_project.py`
- 标题/缩略图补齐：`scripts/update_phet_titles_thumbnails.py`
- 章节/描述重绑：`scripts/remap_physics_courseware.py`
- 内容去重：`scripts/dedupe_animations_by_content.py`
- 运行时巡检：`scripts/audit_courseware_runtime.js`

## 10. 实操顺序建议

后续新批次导入时，建议固定按这个顺序执行：

1. 先生成候选清单，确认哪些是新增、哪些是已存在交叉学科课件
2. 再执行导入，导入时按 `project` 判重
3. 导完后补标题和缩略图
4. 再做章节绑定和描述修正
5. 然后做内容去重
6. 最后跑运行时巡检

## 11. 当前已知边界

- `Earth & Space` 当前按地理学科导入，并绑定到地理教材目录；系统里仍没有独立的“地球与空间科学”学科
- 官方元数据和 partner 元数据存在轻微差异，当前已发现 `normal-modes`、`sound-waves` 只出现在官网元数据里，不在本地 partner 缓存中
- 标题汉化和章节绑定目前仍有一部分是规则映射，不是完全自动理解
