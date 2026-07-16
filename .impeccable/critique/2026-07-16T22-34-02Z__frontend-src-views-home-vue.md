---
target: 学生首页（/home）
total_score: 20
p0_count: 0
p1_count: 4
timestamp: 2026-07-16T22-34-02Z
slug: frontend-src-views-home-vue
---
Method: dual-agent (A: `/root/assessment_a` · B: `/root/assessment_b`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|------:|-----------|
| 1 | Visibility of System Status | 2/4 | 有筛选标签、选中态和分页，但加载、失败与空结果没有用户可见状态。 |
| 2 | Match System / Real World | 3/4 | 学科、教材、章节符合学生心智模型；“智能课件中枢”和英文眉题偏平台语言。 |
| 3 | User Control and Freedom | 2/4 | 可清空搜索、重置筛选和切换视图；筛选使用 `router.replace`，浏览器后退不能逐步撤销。 |
| 4 | Consistency and Standards | 2/4 | Element Plus 提供基础一致性，但当前视觉与 DESIGN.md 冲突，卡片又被当成无语义按钮。 |
| 5 | Error Prevention | 2/4 | 来源和教材使用受限控件，但教材筛选依赖先选学科，界面没有明确说明或禁用原因。 |
| 6 | Recognition Rather Than Recall | 3/4 | 搜索、筛选和已选标签可见；课件卡没有“开始互动”动作提示，来源术语未解释。 |
| 7 | Flexibility and Efficiency | 2/4 | 支持回车搜索、URL 状态、分页和视图偏好；没有最近学习、收藏或快速继续入口。 |
| 8 | Aesthetic and Minimalist Design | 2/4 | 分区清楚，但平台标题、hero、三指标、学科卡、筛选和资源同时竞争注意力。 |
| 9 | Error Recovery | 0/4 | 四类请求失败只写 `console.error`，学生会看到 0 或空白，没有原因、重试或恢复建议。 |
| 10 | Help and Documentation | 2/4 | 副标题和占位符提供基础说明；缺少“先选学科再选章节”等情境帮助。 |
| **Total** | | **20/40** | **Acceptable：结构可用，但学生首要任务、异常状态和可访问性需显著改进。** |

## Anti-Patterns Verdict

**LLM assessment:** 未通过。首页使用 `SMART COURSEWARE HUB` 英文胶囊眉题、三张大数字指标卡、玻璃面板、模糊、蓝青渐变、光球、装饰网格，以及卡片描边叠加宽阴影。这些特征共同形成明显的 AI 科技产品皮肤，却没有帮助学生更快按教材章节找到课件。真正的学生任务被平台介绍和指标推到首屏之后。

**Deterministic scan:** 检测器退出码为 2，共发现 6 条 advisory：4 条未纳入 DESIGN.md 前言的字面颜色（Home.vue:141、487、540、574）和 2 条不在字号阶梯中的 26px / 17px（Home.vue:578、679）。其中 Home.vue:574 的 `rgba(28, 55, 90, 0.14)` 已在 DESIGN.md 的 Elevation 中作为高层阴影记录，属于设计系统检测的可能误报；其余 5 条是有效的令牌漂移证据。检测器没有覆盖人工审阅发现的交互语义、静默失败、认知负荷和任务优先级问题。

**Visual overlays:** 已尝试浏览器取证，但 Codex Browser 只提供只读 evaluate，没有可变脚本注入接口；因此没有启动 Impeccable live server，也没有可靠的用户可见 overlay。访问 `/home` 被鉴权守卫重定向到 `/login`。登录页的 DOM、全页截图和计算样式确认了全局“浅蓝网格 + 半透明面板 + 宽阴影 + 英文眉题 + 蓝青渐变”语法确实在运行，而非死代码。

## Overall Impression

首页已经有一个可用的资源目录骨架：学科、教材章节、来源、搜索、URL 状态和两种视图都存在。最大机会不是继续装饰，而是把它从“课件平台展示页”改成“学生 30 秒内打开本节课课件的任务页”。

## What's Working

1. **教材上下文可保留。** 学科、来源、教材路径、关键词、页码和视图模式进入 URL，已选条件又以文字标签显示，适合重新定位。
2. **资源信息基本贴近任务。** 标题、教材路径、来源、观看数和评分都在卡片或列表中；无缩略图时使用结构化占位，没有手绘插图噪音。
3. **已有平板结构基础。** 900px 以下筛选按钮全宽、列表改单列、视图切换全宽，课件卡本身也有较大的触控区域。

## Cognitive Load

**6/8 项失败，高认知负荷。** 失败项是单一焦点、分块、视觉层级、一次一件事、最少选择和渐进披露；视觉分组与工作记忆支持通过。`subjects` 全量渲染，一旦超过 4 个学科就越过工作记忆阈值；`pageSize = 20` 又让资源区一次出现最多 20 个同权重选择。深色指标卡和装饰层级比教材定位任务更抢眼。

## Emotional Journey

- **进入:** 精致但冷，像平台演示；学生先被要求理解系统，而不是开始学习。
- **定位:** 学科导航出现后方向变清楚，但教材筛选的前置条件没有解释。
- **正反馈:** 选中标签和当前筛选指标提供一定掌控感。
- **低谷:** 网络或接口失败静默变成“0 个课件/空白”，学生可能误以为老师没有发布资源。
- **峰值:** 整张资源卡可点击，进入课件路径短；但没有明确“开始互动”信号。
- **结束:** 没有最近学习、收藏或课后继续入口，未兑现课堂—课后连续性。

## Priority Issues

### [P1] 找课件主任务被品牌 hero 和三张指标卡压到首屏下方

- **Why it matters:** 课堂平板要求几十秒内进入指定章节；900px 以下三张至少 132px 高的指标卡纵向堆叠，会把资源区推到多屏之后。
- **Fix:** 把首页顶部改为“当前教材路径 + 学科/章节选择 + 搜索”的紧凑任务条；删除或折叠不影响学生决策的指标。
- **Suggested command:** `$impeccable distill frontend/src/views/Home.vue`

### [P1] 加载、空结果和接口失败没有用户可见状态

- **Why it matters:** 失败被伪装成 0 或空白，学生无法区分“没有课件”和“网络出错”，课堂中会直接卡住。
- **Fix:** 增加骨架屏；区分首次空、筛选空、网络失败；提供“清除筛选”和“重新加载”；使用可聚焦、`aria-live` 的文字状态并保留当前筛选。
- **Suggested command:** `$impeccable harden frontend/src/views/Home.vue`

### [P1] 核心卡片是点击型容器，键盘和屏幕阅读器流程不成立

- **Why it matters:** 学科卡和课件卡只有 `@click`，没有链接/按钮语义、键盘事件或焦点；图片没有 `alt`；搜索图标按钮缺少明确名称；选中学科未暴露 `aria-pressed`。
- **Fix:** 资源改为真实链接，筛选卡改为按钮；加入清晰焦点环、`aria-pressed`、图片替代文本和搜索按钮名称；提升 `#999` 与 `#7288a3` 元数据对比度。
- **Suggested command:** `$impeccable audit frontend/src/views/Home.vue`

### [P1] 20 个资源与无上限学科保持同一权重，缺乏课堂优先路径

- **Why it matters:** 学生要找的是老师当前讲的章节，不是浏览全站资源目录；当前界面要求同时扫描大量卡片。
- **Fix:** 先显示最近打开、本章推荐或教师指定，全部资源后置；学科超过 4 项时分组；选学科后再展开教材章节并明确依赖关系。
- **Suggested command:** `$impeccable shape 学生首页的课堂快速找课件流程`

### [P2] 视觉和文案面向“管理平台”，不面向学生学习

- **Why it matters:** 英文眉题、“智能课件中枢”“统一管理课件”、大指标和玻璃科技装饰共同制造距离感，也违反新 DESIGN.md。
- **Fix:** 删除英文眉题、装饰网格和光球；取消静态卡片“描边 + 宽阴影”；改用平面浅蓝结构和单一行动色；标题改为“找课件”，辅助文案直接提示先选学科和章节。
- **Suggested command:** `$impeccable quieter frontend/src/App.vue frontend/src/assets/style.css frontend/src/views/Home.vue`

## Persona Red Flags

**课堂平板学生“小宇”:** 老师说“打开物理必修二第五章”后，他需要在 30 秒内进入课件。当前路径先经过品牌顶栏、hero 和三张纵向指标卡；教材筛选未解释前置条件。网络失败时空白会被理解为“老师没发”，被打断后也没有“继续上次课件”。

**Jordan（第一次使用）:** 5 秒内看到的是“智能课件中枢”和“统一管理”，不知道学生第一步。`PhET`、`GeoGebra`、`HTML` 未解释；课件卡可点却没有“开始互动”；教材控件为空时也没有“请先选学科”。

**Sam（依赖无障碍）:** Tab 无法聚焦学科卡和课件卡；缩略图缺少替代文本；搜索图标按钮没有明确名称；颜色和位移承担学科选中态；多个 12px 元数据低于 4.5:1；没有 `prefers-reduced-motion` 降级。

## Minor Observations

- `viewMode` 同时保存到 localStorage 和 URL，恢复能力好，但双状态源增加同步复杂度。
- 未知 `source_type` 一律显示“原创”，可能把异常数据误标为真实来源。
- “欢迎, 用户名”混用英文逗号，应改为中文逗号。
- “退出”使用高饱和危险按钮并常驻顶栏，视觉权重高于“个人中心”，也容易在平板上误触。
- 共享样式对所有 `.el-card/.el-dialog/.el-menu` 强制宽阴影和模糊，局部页面难以遵守 Structure-First 规则。

## Questions to Consider

1. 如果老师已经指定本节课章节，首页是否应直接打开“本章课件”，而不是让学生再次从全站目录筛选？
2. 三个 hero 指标中，哪一个会改变学生下一步决策？如果答案是“都不会”，为什么它们占据首屏？
3. 首页的核心身份是“资源目录”还是“继续学习面板”？课堂和课后是否应有不同默认排序？
4. 对学生而言，`PhET / GeoGebra / 原创` 真的是首要筛选维度，还是教师、章节和最近使用更重要？
