# 2027届 力学实验复习系列 · 总规范（SERIES v1.0）

> 由《总体方案 v0.2》定稿而来。所有模块 Agent 必须先读本文，再读本模块 `SPEC.md` 和 `core/API.md`。
> 本文与方案不一致处以本文为准（见末尾“相对 v0.2 的改动”）。

---

## 0. 范围与口径

| 项 | 结论 |
|---|---|
| 课件数量 | 10 个：M00–M09（M10 综合课、限时考核本期不做） |
| 发布 | 每个实验一个**单文件 HTML**，单独上传 edusimu，挂人教版对应章节（§8） |
| 教材口径 | 人教版 2019 版。电磁打点计时器：约 **8 V 交流**；电火花计时器：**220 V 交流**；打点周期 0.02 s（50 Hz） |
| 解析 | 每小问提交后**立即**判分并显示解析；无教师模式 |
| 题源 | ① PPTX《2027届高考物理大一轮复习课件+力学实验综合》原题；② 2024–2026 年**高考真题**（题库：`research/真题题库-2024-2026-力学实验.md`）。题库中 16 道“X 创新/迁移”真题按“最接近实验”并入 M01–M09 的“④ 练·真题”作为压轴迁移题。自编题一律标“原创”或“改编自××”，不得伪造出处 |
| 基线设备 | 联想 Tab M9，**2026-11-18 实测**（`docs/平板性能测试结果-20261118.md`）：Android 11 客户端 **WebView，Chrome 106**；8 核 / 4 GB；屏幕 1098×686 CSS、DPR 1.75；**内嵌窗口 1016×563 CSS**；检测页平均 33.6 fps、p95 帧时间 48.2 ms、> 50 ms 卡顿帧 0；最多 2 个触控点 |

---

## 1. 四区一卡（所有模块统一）

顶栏固定：课件标题 · 四个分区标签 · “小结卡”按钮。分区与存档同步，刷新回到上次位置。

| 分区 | 必须包含 | 交互要求 |
|---|---|---|
| **① 学·原理** | 目的 → 原理（分步揭示）→ 方法标签 → 器材卡 | 一页一个核心点，“上一步/下一步”翻页，不做长滚动 |
| **② 做·实验** | 虚拟实验台 + 步骤面板；**引导模式**（逐步校验、讲为什么）/ **自由模式**（不拦截、只记录） | 拖拽有吸附、所有拖拽都有按钮替代；按住出放大镜 |
| **③ 诊·误差** | A. 错误操作实验室（四拍“试一试”）；B. 结果反推（看坏结果 → 选原因 → 去实验台复现） | 后果必须由物理模型产生 |
| **④ 练·真题** | 仿纸质版式，题面上直接作答 | 填空软键盘、单/多选、符号拼式、坐标纸描点连线 |
| **小结卡** | 原理-步骤-注意事项及理由-误差-常考结论 | 任何分区可呼出；适合投屏 |

### 1.1 “试一试”固定四拍
1. **布置**：实验台进入“犯了这个错”的状态，顶部只提示“观察××有什么不同”。
2. **运行**：按物理模型真实产生结果。
3. **对比**：与正确操作结果上下对齐或叠画，差异处用标记圈出。
4. **追问 → 揭示**：先答一道选择题，再显示“为什么”和关联注意事项；一键“恢复正确操作”。

注意事项、错误操作实验室、自由模式纠错标签、反推案例**共用 `content.json` 里同一份 `errors[]` 数据**。

---

## 2. 运行约束（硬性）

| 约束 | 要求 |
|---|---|
| 离线 | 单文件；禁止 `http(s)://` 资源引用、CDN、在线字体、`fetch`/XHR/WebSocket、iframe；图片仅内联 SVG / Canvas / `data:` |
| CSP | 必须在平台隔离包装器策略下运行：`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'`。**注意没有 `unsafe-eval`：禁止 `eval`、`new Function`、字符串形式的 `setTimeout`** |
| 存档 | 只用**一个**键 `lab3d:<slug>`（包装器只桥接这个键，其他键会被静默丢弃），值为 ≤ 16 KB 的 JSON 对象；读写失败静默降级。`<slug>` 与上传时平台 slug 一致，见 §8 |
| 禁用 id | `left` `right` `eqb` `tabL` `tabR` `top`（包装器注入了针对它们的样式） |
| 体积 | 目标 ≤ 350 KB，硬上限 600 KB（build 检查） |
| 语法 | 内核 Chrome 106 支持 ES2020，但本系列仍按 ES2019 写（不用 `?.`、`??`，留余量给更旧的 WebView）；不用 ES module（全部挂在 `window.ML`）。禁用 Chrome 107+ 特性：CSS 嵌套、Popover、`@starting-style`、ES2023+ 新 API |
| 渲染 | 不用 3D/WebGL/Three.js、`backdrop-filter`、大面积 `filter: blur`、Canvas `shadowBlur`；不引 p5/MathJax/KaTeX/Chart.js |
| 字体 | 系统字体栈；公式用 `ML.math` 的 HTML 分式组件 |

## 3. 渲染与性能
- 2.5D 教材插图风：侧视/俯视，器材 1–2 层线性渐变 + 细高光，无纹理图。
- 分层画布：`ML.stage.Layer`，静态层只在尺寸变化时重绘，动态层只画运动物体，UI 用 DOM。
- 按需渲染：`ML.stage.Loop` 物理静止即停 rAF；物理固定步长（1/240 s），渲染跟随帧率。
- 物理按真实 `dt` 推进（M9 实际约 30–34 fps，不能假设 60 fps）；单帧 dt 上限 0.05 s。
- 低性能模式：首 60 帧测帧率，平均 < 28 fps（低于 M9 基线）自动开启（DPR 上限 1.25、关过渡动画），顶栏“流畅”可手动切换；`prefers-reduced-motion` 时关非必要动画。
- DPR 上限 1.5（M9 原生 1.75）；画布随 `ResizeObserver` 自适应。
- 内存（4 GB）：临时画布（弹窗、对比图）离开文档后由 `ML.stage` 自动断开监听并释放位图；不保留无界的轨迹/历史数组。

## 4. 触控
- Pointer Events；实验台 `touch-action:none`，其他区域可滚动。
- 热区 ≥ 44 px；拖拽有吸附点，松手有反馈。
- 精细读数用按住出现的放大镜（3 倍，在手指上方 80 px）。
- 布局基准为 **1016×563 CSS（M9 内嵌窗口）**：做·实验分区的实验台 + 操作面板必须一屏放下、无纵向滚动（`max-height:640px` 横屏紧凑样式）；竖屏或宽 < 900 时实验台在上、面板在下。
- 只用单指点按/拖拽，不设计多指手势（设备最多 2 个触控点）。

## 5. 物理准确性
- 所有数据由物理模型实时产生，无预制结果；误差源（阻力、读数噪声、反应时间、频率偏差）参数化，可在“理想 / 真实”间切换；随机数可设种子。
- 每个模块 `verify.mjs`（Node ≥ 18 直接运行、无依赖）比对模拟与解析解；`build.py` 会运行它，不通过不出包。

## 6. 视觉
- 主色导航蓝 `#1661FF`；实验青 `#12A9C4`（可交互器材高亮）；教材墨 `#10233F`；页面底 `#F3F8FD`；成功 `#25A870` / 警告 `#E69B2D` / 错误 `#C7374B`，状态必须同时配图标或文字。
- 器材：木板 `#D9B98C`、铝 `#C9D1D9`、钢 `#8E99A6`、橡皮条 `#7A5C3E`；纸带 `#F6F1E3`、点迹 `#2B2B2B`；力矢量：重力绿 `#2E9E5B`、拉力蓝 `#1661FF`、摩擦橙 `#E07B24`。
- 不做发光、玻璃、渐变文字；面板圆角 22–24 px（小控件 12 px）；动画 150–250 ms。
- 真题区仿纸质：米白底 `#FBFAF5`、宋体系题干、题号/分值/下划线空格。

## 7. 工程结构与构建

```
courseware/mech-lab-2027/
├─ SERIES.md                  # 本文
├─ build.py                   # Python 标准库；内联合并 → dist/，并做检查
├─ core/                      # 公共库（API 见 core/API.md，冻结后改动须向后兼容）
│  ├─ API.md
│  ├─ base.css  paper.css
│  ├─ ml.js                   # 命名空间、DOM 助手、存档、事件、提示、性能模式
│  ├─ math.js                 # 分式/上下标 HTML、有效数字、格式化
│  ├─ physics.js              # 种子随机、高斯噪声、最小二乘（Node 可运行）
│  ├─ stage.js                # 分层画布、按需循环、拖拽、放大镜
│  ├─ chart.js                # 坐标图：描点、拟合线、叠图、交互作图
│  ├─ paper.js                # 纸质题渲染与判分、软键盘、符号拼式
│  ├─ shell.js                # 四区一卡外壳、翻页讲解、四拍试一试、反推
│  └─ instruments/
│     ├─ tape-model.js        # 打点计时器 + 纸带物理（Node 可运行）
│     └─ tape-view.js         # 纸带绘制、刻度尺、计数点选择
├─ modules/Mxx-name/
│  ├─ SPEC.md  content.json  questions.json  scene.js  scene.css(可选)  verify.mjs
├─ research/                  # 真题检索结果
└─ dist/                      # 产出 Mxx-<标题>.html
```

- 构建：`python3 build.py M01`（或 `all`）。检查项：外链与禁用 API 扫描、禁用 id、体积、JSON 结构、`verify.mjs`。
- 模块 Agent 只改自己的 `modules/Mxx/`；公共库问题提给 core 维护者。

### 7.1 数据格式
**content.json**
```jsonc
{
  "slug": "mech-lab-m01", "title": "…", "chapter": "…",
  "learn": [{ "id", "title", "html", "steps": ["分步揭示的 html", …] }],
  "methods": ["逐差法", …],
  "equipment": [{ "id", "name", "html" }],
  "procedure": [{ "id", "title", "how", "why", "errorId"? }],   // 引导步骤，同时是“注意事项”来源
  "errors": [{
    "id", "name", "trigger",            // trigger: 学生如何亲手犯这个错
    "config": {…},                      // 交给 scene 的参数改动
    "observe",                          // 第 1 拍提示语
    "consequence",                      // 可见后果（揭示时显示）
    "ask": { "stem", "options": [], "answer": idx },
    "why", "noteId", "questionIds": []
  }],
  "reverse": [{ "id", "stem", "show": {…}, "options": [], "answer": [idx], "why", "replay": "errorId" }],
  "summary": { "principle", "steps": [], "notes": [{ "do", "why" }], "errors": [], "conclusions": [] }
}
```
**questions.json**
```jsonc
[{ "id", "source": "2025·全国卷·第22题" | "原创" | "改编自…", "verified": true,
   "stem": "html（插图用内联 SVG）",
   "parts": [{ "label": "(1)", "type": "choice|multi|numeric|expr|text-choice|plot",
     "prompt": "html", "options"?, "answer", "tol"?, "sig"?, "unit"?,
     "vars"?: {"x1":"x₁"…}, "points"?, "slope"?, "rubric"?, "explain": "html", "replay"?: "errorId" }] }]
```

## 8. 人教版挂载与 slug

| 课件 | 标题 | 挂载章节 | slug |
|---|---|---|---|
| M00 | 基础仪器与读数 | 必修三 第十一章 3；可兼挂 必修一 第一章 3 | mech-lab-m00 |
| M01 | 实验：探究小车速度随时间变化的规律 | 必修一 第二章 1 | mech-lab-m01 |
| M02 | 实验：探究弹簧弹力与形变量的关系 | 必修一 第三章 1 | mech-lab-m02 |
| M03 | 实验：探究加速度与力、质量的关系 | 必修一 第四章 2 | mech-lab-m03 |
| M04 | 实验：探究平抛运动的特点 | 必修二 第五章 3 | mech-lab-m04 |
| M05 | 探究向心力大小与半径、角速度、质量的关系 | 必修二 第六章 2 | mech-lab-m05 |
| M06 | 实验：探究两个互成角度的力的合成规律 | 必修一 第三章 4 | mech-lab-m06 |
| M07 | 实验：验证机械能守恒定律 | 必修二 第八章 5 | mech-lab-m07 |
| M08 | 实验：验证动量守恒定律 | 选必一 第一章 4 | mech-lab-m08 |
| M09 | 实验：用单摆测量重力加速度 | 选必一 第二章 5 | mech-lab-m09 |

## 9. 制作流程
阶段 1 core + M01（纸带引擎先行）→ **阶段 2 M01 黄金样板验收 + M00（完成游标卡尺、螺旋测微器、秒表、弹簧测力计通用读数组件并沉淀入 `core/instruments/`）** → 阶段 3 并行 M03/M07/M04/M08/M09 → 阶段 4 M02/M06/M05 → 阶段 5 全系列验收上传。
（说明：M03/M07/M08/M09 均需嵌用游标卡尺、螺旋测微器或秒表读数组件，故阶段 3 并行开发前必须先完成 M00 及其 `core/instruments/` 接口冻结。）

## 10. 每模块验收清单（DoD）
- [ ] 四区一卡齐全；每条注意事项有“理由”和可触发的“试一试”
- [ ] 错误操作 ≥ 4、反推 ≥ 2，后果由物理模型产生
- [ ] 真题与来源逐空一致，插图 SVG 重绘，来源真实；`verified:false` 的题不得进入 dist
- [ ] `verify.mjs` 通过；`build.py` 检查通过（零外链、≤ 600 KB、无禁用 API/id）
- [ ] 严格 CSP 隔离 iframe 与断网下正常
- [ ] M9 实测：1016×563 窗口内做·实验一屏可操作；动画与拖动 p95 帧时间 ≤ 50 ms、无 > 100 ms 卡顿帧；空闲无持续重绘；首屏可交互 ≤ 2 s
- [ ] 刷新后恢复到上次分区与作答记录

## 相对 v0.2 的改动
1. 存档键由 `mechlab:<slug>` 改为 **`lab3d:<slug>`**：`scripts/tongjiang_isolated_wrapper.html` 只桥接这个键。
2. CSP 明确无 `unsafe-eval`：符号拼式题自写解析器判等价，禁止 `new Function`。
3. 语法基线 ES2019、不用 ES module，所有公共组件挂 `window.ML`。
4. 题源扩为 2024–2026 年高考真题；体积硬上限统一为 600 KB（v0.2 DoD 中“800 KB”作废）。
5. M01 先于 M00 制作（纸带引擎先行）。
