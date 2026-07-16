---
target: 学生首页（/home）
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-16T23-19-00Z
slug: frontend-src-views-home-vue
---
Method: dual-agent (A: `/root/assessment_a_fresh` · B: `/root/assessment_b`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|------:|-----------|
| 1 | Visibility of System Status | 4/4 | 最近记录、学科、教材目录和课件资源均覆盖加载、成功、错误、空状态及重试。 |
| 2 | Match System / Real World | 3/4 | “学科—教材—章节—课件”符合学生心智模型；PhET、GeoGebra 仍是未解释术语。 |
| 3 | User Control and Freedom | 4/4 | 支持逐项移除与全部清空筛选、切换视图、返回及 URL 状态恢复。 |
| 4 | Consistency and Standards | 4/4 | 资源使用标准链接，按钮、焦点环、触控尺寸与状态语言一致。 |
| 5 | Error Prevention | 4/4 | 章节依赖禁用、路由参数清洗、请求竞态保护、错误脱敏和级联清理完整。 |
| 6 | Recognition Rather Than Recall | 4/4 | 最近课件、已选章节、教材路径、筛选条件和“打开课件”始终可见。 |
| 7 | Flexibility and Efficiency | 3/4 | 最近学习、搜索、组合筛选、可分享 URL 和两种视图齐全；来源筛选仍偏重。 |
| 8 | Aesthetic and Minimalist Design | 4/4 | 结构克制、任务优先，没有 hero 指标、玻璃、渐变、发光和装饰噪声。 |
| 9 | Error Recovery | 4/4 | 网络、权限、加载失败和无结果均有清晰中文说明与邻近恢复动作。 |
| 10 | Help and Documentation | 2/4 | 空状态与占位帮助优秀；课件来源术语与进一步帮助入口仍不足。 |
| **Total** | | **36/40** | **Excellent：无 P0/P1，可交付；剩余为下一轮局部优化。** |

## Anti-Patterns Verdict

**LLM assessment：通过。** 页面已经从“教育科技展示页”变成可信的课堂工具：深蓝顶栏、浅蓝结构面、单一行动色和短促状态反馈都服务于找课件。没有英文胶囊眉题、hero 指标、玻璃拟态、发光、装饰网格、渐变文字或静态宽阴影。品牌个性仍偏稳妥，但这属于校内工具的克制，不是 AI 模板感。

**Deterministic scan：通过。** Assessment B 对 `frontend/src/views/Home.vue` 重新运行检测器，退出码为 0，发现数为 0。检测器确认前几轮的字面颜色、字号阶梯和设计令牌漂移已清空；剩余问题来自人工信息架构判断，而非规则违例。

**Visual overlays：未注入。** 最终 critique 没有可靠的用户可见 overlay；回退证据为真实登录页面的桌面、768px 平板和 720px（1440px 页面 200% 缩放等效重排）检查、DOM 语义、计算样式、焦点、触控目标、URL 状态与控制台日志。页面在这些检查下无横向溢出，主要控件达到 44px，最终刷新无新增警告或错误。

## Overall Impression

首页的核心任务已经成立：学生可以继续最近课件，也可以从学科和教材章节快速进入资源；异常不会再伪装成“0 个课件”。最大的剩余机会不是继续加功能，而是降低“课件来源”在学生流程中的权重，并补足陌生术语说明。

## What's Working

1. **任务顺序正确。** “继续学习 / 选择学科与章节”先于完整资源目录，课堂恢复与课后发现都能快速开始。
2. **状态与恢复可靠。** 四类异步数据都有骨架、空、错和重试；旧请求不会覆盖新筛选，错误详情不会直接暴露给学生。
3. **触控与键盘基础扎实。** 原生按钮、RouterLink、`aria-pressed`、实时播报、3px 实色焦点环、44px 控件、减少动态效果和响应式布局均已落实。

## Cognitive Load

**中等偏低，8 项中约 1–2 项未完全通过。** 首屏主线、分区、持续上下文和渐进开放章节均表现良好。主要负担来自 9 个同权重学科，以及搜索、来源、章节、清除与视图切换同时出现；其中“来源”对普通学生的决策价值最低。

## Emotional Journey

- **进入：** 用途明确，界面安静可靠。
- **开始：** 有历史记录可一键继续；无记录时紧凑空状态自然引向资源目录。
- **定位：** 状态化 CTA 会聚焦学科或直接展开章节控件，选中状态同时有文字、边界和 ARIA 表达。
- **峰值：** 课件卡是标准链接并显式显示“打开课件”，平板不再依赖 hover 猜测。
- **异常：** 网络、权限、加载失败和无结果都有恢复路径，不会留下死路。
- **完成：** 结果数、可移除筛选芯片与打开动作形成清晰闭环。

## Priority Issues

### [P2] “课件来源”对学生主流程仍显得过重

- **Why it matters：** 学生优先按学科、教材和章节找内容；PhET、GeoGebra 是实现来源，不一定是自然分类。它增加一个同级决策，也引入陌生术语。
- **Fix：** 将来源收入“更多筛选”，或给选项补充一句可访问说明；默认突出学科与教材章节。
- **Suggested command：** `$impeccable distill frontend/src/views/Home.vue`

### [P2] 章节空状态标签存在轻微语义冲突

- **Why it matters：** 面板标签固定为“已选章节”，内容却可能是“尚未选择教材章节”，首次进入时两个描述互相抵触。
- **Fix：** 未选择时把标签切换为“待选章节”，选择后再显示“已选章节”。
- **Suggested command：** `$impeccable clarify frontend/src/views/Home.vue`

### [P2] 少量搜索结果时课件卡可能过宽

- **Why it matters：** `auto-fit` 会让 1–2 张卡片扩展到整行或半行，164px 缩略图容易变成过宽横幅，破坏图片构图和目录密度。
- **Fix：** 使用 `auto-fill` 保留稳定列宽，或为轨道设置合理最大宽度并左对齐。
- **Suggested command：** `$impeccable layout frontend/src/views/Home.vue`

## Persona Red Flags

**课堂平板学生“小宇”：** 现在能用状态化 CTA 直接进入学科或章节选择，显式“打开课件”也适合触控。剩余摩擦是来源筛选可能需要教师解释，以及少量结果时过宽卡片降低扫读效率。

**Jordan（第一次使用）：** “继续学习”“选择学科”和“打开课件”都很明确；仍可能把 PhET、GeoGebra 误解为学科、难度或教材版本。

**Sam（依赖键盘、低视力或屏幕阅读器）：** 资源链接、筛选芯片、分页和主要按钮已有清晰焦点与足够目标尺寸，状态信息不只靠颜色。最终上线前仍应对 Element Plus 级联选择器做一次真实屏幕阅读器的层级移动与关闭验收。

## Minor Observations

- “教育动画展示系统”准确但偏行政化，品牌记忆点有限。
- 移除学科会同步移除章节，逻辑正确；如真实测试出现困惑，可在操作后播报该级联变化。
- 前端构建仍提示两个既有大 chunk 超过 500kB；首页自身产物约 18kB，不是本轮首页重构的主要风险。
- PRODUCT.md 中的收藏、评价与学习记录尚未形成首页入口，但不妨碍当前“找课件并打开”的主任务。

## Questions to Consider

1. 学生是否真的会按 PhET、GeoGebra 查找课件，还是该筛选更适合教师或高级用户？
2. 未选择章节时，标签应显示“待选章节”，还是直接把整个面板命名为“按章节找课件”？
3. 只有一个课件结果时，是否仍应保持标准卡片宽度，而不是铺满整行？
