---
name: edusimu
description: 按教材章节组织的校内互动课件平台
colors:
  navigation-blue: "#1661FF"
  experiment-cyan: "#12A9C4"
  textbook-ink: "#10233F"
  supporting-ink: "#5F7694"
  page-blue: "#F3F8FD"
  page-blue-strong: "#E6F0FB"
  surface: "#FFFFFFC7"
  surface-strong: "#FFFFFFEB"
  border: "#547DAD2E"
  border-strong: "#2BA8C459"
  on-dark: "#F5FBFF"
  danger: "#C7374B"
  success: "#25A870"
  warning: "#E69B2D"
typography:
  display:
    fontFamily: "PingFang SC, Microsoft YaHei, Noto Sans SC, Segoe UI, sans-serif"
    fontSize: "clamp(32px, 4vw, 54px)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "0em"
  headline:
    fontFamily: "PingFang SC, Microsoft YaHei, Noto Sans SC, Segoe UI, sans-serif"
    fontSize: "clamp(24px, 4vw, 40px)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0em"
  title:
    fontFamily: "PingFang SC, Microsoft YaHei, Noto Sans SC, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0em"
  body:
    fontFamily: "PingFang SC, Microsoft YaHei, Noto Sans SC, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.8
    letterSpacing: "0em"
  label:
    fontFamily: "PingFang SC, Microsoft YaHei, Noto Sans SC, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.6
    letterSpacing: "0.02em"
  micro:
    fontFamily: "PingFang SC, Microsoft YaHei, Noto Sans SC, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.08em"
  mono:
    fontFamily: "SFMono-Regular, Consolas, Monaco, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "0em"
rounded:
  control: "14px"
  field: "16px"
  compact-card: "18px"
  card: "22px"
  panel: "24px"
  dialog: "26px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "28px"
  3xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.navigation-blue}"
    textColor: "{colors.on-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.textbook-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.textbook-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    height: "44px"
  chip:
    backgroundColor: "{colors.page-blue-strong}"
    textColor: "{colors.navigation-blue}"
    typography: "{typography.micro}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
  card:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.textbook-ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  navigation-active:
    backgroundColor: "{colors.page-blue-strong}"
    textColor: "{colors.navigation-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
---

# Design System: edusimu

## Overview

**Creative North Star: "互动实验台"**

edusimu 应像一张为课堂准备好的互动实验台：学生一眼知道课件在哪里、下一步可以触碰什么，教师也能快速完成制作、发布和管理。界面明快、精准、有秩序；现代感来自教材结构、操作反馈和数据状态，而不是视觉炫技。

现有代码中的冷蓝背景、导航蓝、实验青、中文无衬线字体和圆润控件构成识别基础。新界面采用结构分层：静态区域依靠底色、间距和清晰边界建立层级，阴影只服务于悬停、对话框和确有高度变化的状态。明确拒绝炫技型科技展示、低龄卡通化和拥挤灰暗的传统企业管理后台。

**Key Characteristics:**

- 学科、教材和章节始终是资源定位的主轴。
- 导航蓝负责主要行动，实验青负责互动与状态提示。
- 单一中文无衬线字体保持跨设备清晰与高效。
- 电脑与平板共享结构，学生可通过触控完成主要操作。
- 静态界面结构清楚，动效短促，并始终提供减少动态效果的降级。

## Colors

色板以清晰的冷色层级为基础：导航蓝推动行动，实验青提示互动，教材墨承载信息，浅蓝背景与半透明白色表面维持课堂环境中的可读性。

### Primary

- **导航蓝** (`navigation-blue`): 仅用于主要操作、当前选中项、关键链接和明确焦点，不作为大面积装饰底色。

### Secondary

- **实验青** (`experiment-cyan`): 用于互动状态、辅助进度和与导航蓝配合的局部强调，不与导航蓝争夺主要行动层级。

### Tertiary

- **成功绿、提醒橙、风险红** (`success`, `warning`, `danger`): 只表达可验证的系统状态；图标或文字必须与颜色同时出现。

### Neutral

- **教材墨** (`textbook-ink`): 标题、正文和高优先级数据的默认文字色。
- **辅助墨** (`supporting-ink`): 描述、元数据和次级提示；不得用于关键操作或低对比度占位文字。
- **课堂浅蓝** (`page-blue`, `page-blue-strong`): 页面底色和结构分区，不制造暖米色或纸张质感。
- **清晰表面** (`surface`, `surface-strong`): 卡片、表单和浮层表面；优先使用更不透明的强表面保证对比度。
- **冷蓝边界** (`border`, `border-strong`): 分隔结构和表达悬停、选中状态，边界永远服从内容层级。

**The Action Color Rule.** 导航蓝和实验青只出现在行动、选中和状态反馈上；如果一块颜色不能解释用户下一步或当前状态，就移除它。

**The Single Gradient Rule.** 导航蓝到实验青的渐变只允许出现在主要按钮或短小状态标记中；禁止渐变文字和大面积渐变装饰。

## Typography

**Display Font:** PingFang SC（依次回退到 Microsoft YaHei、Noto Sans SC、Segoe UI、sans-serif）
**Body Font:** PingFang SC（使用相同回退栈）
**Label/Mono Font:** SFMono-Regular（依次回退到 Consolas、Monaco、monospace；仅用于脚本与坐标编辑）

**Character:** 单一中文无衬线字体让学生在电脑和平板上快速辨认内容，也让教师后台保持稳定、熟悉的工具感。层级依靠字号、字重和留白，而不是混搭显示字体。

### Hierarchy

- **Display** (700, 54px max, line-height 1.08): 仅用于登录页等少数产品入口，不进入按钮、标签或数据区域。
- **Headline** (700, 40px max, line-height 1.15): 首页主任务和重要页面介绍；长中文标题必须在平板宽度内正常换行。
- **Title** (700, 20px, line-height 1.4): 页面分区、课件名称和主要面板标题。
- **Body** (400, 16px, line-height 1.8): 说明性正文；连续文字最大行长控制在 65–75ch。
- **Label** (600, 13px, letter-spacing 0.02em): 按钮、筛选器、表单说明和状态元数据。
- **Micro** (700, 12px, letter-spacing 0.08em): 仅用于真实系统标识或极短标签，不得成为每个区块的装饰性眉题。
- **Mono** (400, 13px, line-height 1.7): GeoGebra 脚本、坐标和技术日志，不用于普通界面文本。

**The One-Family Rule.** 产品界面始终以同一中文无衬线字体栈完成主要信息层级；禁止为了“科技感”把显示字体引入按钮、表格或表单。

**The Fixed UI Scale Rule.** 只有登录页和首页主标题可以使用已有的响应式字号；后台、播放器与密集工具界面使用固定字号，避免组件内标题随视口漂移。

## Elevation

edusimu 采用结构优先的混合层级。静态卡片和面板依靠浅蓝底色、强表面、1px 冷蓝边界与间距分区；阴影只在悬停、对话框、弹出层和需要明确高度变化的状态出现。现有宽柔阴影作为过渡令牌保留，但不得成为每个静态容器的默认装饰。

### Shadow Vocabulary

- **响应阴影** (`0 14px 32px rgba(23, 41, 70, 0.10)`): 悬停卡片、对话框和短暂抬升状态。
- **高层阴影** (`0 24px 60px rgba(28, 55, 90, 0.14)`): 仅用于模态层或确实覆盖主内容的浮层。
- **导航阴影** (`0 16px 40px rgba(14, 30, 58, 0.18)`): 深色顶栏与页面内容需要明确分离时使用。
- **行动阴影** (`0 12px 24px rgba(22, 97, 255, 0.22)`): 主要按钮的短暂悬停或按下反馈，不作为常驻光晕。

**The Structure-First Rule.** 静态表面默认无宽阴影；先用底色、间距和边界建立结构，再判断是否真的需要抬升。

**The One-Elevation Rule.** 同一组件不得同时依赖 1px 描边和 16px 以上模糊半径的宽阴影进行装饰；两者只能有一个承担主要层级。

## Components

组件应清楚直接，触控后立即反馈。所有互动组件必须具备默认、悬停、焦点、按下、禁用、加载和错误状态；学生端主要触控目标不得小于 44px。

### Buttons

- **Shape:** 紧凑圆角矩形（14px），主要触控高度至少 44px；只把标签、筛选胶囊做成全圆角。
- **Primary:** 导航蓝为基础，可在单一主要行动上使用导航蓝到实验青的短渐变；文字使用深色表面上的高对比白色。
- **Hover / Focus:** 150–250ms 内完成颜色、轻微位移或焦点环反馈；焦点环使用 3px 实色导航蓝，确保与相邻背景至少达到 3:1，不依赖阴影猜测焦点。
- **Secondary:** 强表面配教材墨和冷蓝边界，不使用常驻宽阴影。
- **Danger:** 风险红只用于不可逆或高风险操作，并配合明确动词与确认信息。

### Chips

- **Style:** 全圆角（999px）、短文本、浅蓝或低透明导航蓝底；芯片表达筛选、身份或状态，不作为普通按钮的默认形状。
- **State:** 选中态同时改变底色、文字或图标，不能只靠色相变化。

### Cards / Containers

- **Corner Style:** 课件卡片使用 22px，结构面板使用 24px；紧凑日志和状态项使用 14–18px。
- **Background:** 静态区域优先使用强表面；透明度不得削弱正文和占位文字对比度。
- **Shadow Strategy:** 静态无宽阴影，悬停与浮层引用 Elevation 中的响应阴影。
- **Border:** 1px 冷蓝边界用于分隔；选中态可使用更强冷蓝边界。
- **Internal Padding:** 紧凑内容 16–18px，标准卡片 20px，主任务面板 24–28px。

### Inputs / Fields

- **Style:** 强表面、1px 冷蓝边界、16px 圆角，主要输入高度至少 44px。
- **Focus:** 3px 实色导航蓝焦点环并加强边界；焦点必须在浅色和深色邻接区域都达到至少 3:1。
- **Error / Disabled:** 错误态同时使用风险色、文字说明和必要图标；禁用态降低强调但保持标签可读。

### Navigation

- **Style:** 顶栏以深蓝表面承载全局身份与页面入口，侧栏或标签导航使用浅色结构面。当前项使用导航蓝文字与浅蓝/实验青背景提示。
- **Responsive:** 900px 以下顶栏允许换行，管理导航转为可横向滚动的单行入口，页面主要操作改为全宽触控按钮。

### Courseware Resource Card

课件资源卡由 170px 桌面缩略图（900px 以下为 148px）、清晰标题、教材路径和最少量元数据组成。悬停可轻微抬升，但默认状态必须先靠标题、章节与间距建立层级；无缩略图时使用浅蓝结构占位，不使用手绘插图。

### Animation Player

播放模式把课件本身置于最高层级，内容框铺满可用视口。退出控制可短暂浮动，但必须可发现、可触控，并在 768px 与 1180px 两类播放器断点下保持可用。

## Do's and Don'ts

### Do:

- **Do** 让学科、教材和章节成为首页筛选、资源卡和播放入口的主要信息线索。
- **Do** 使用导航蓝表达主要行动，使用实验青表达互动与辅助状态，并为所有状态提供文字或图标说明。
- **Do** 以底色、间距和 1px 冷蓝边界组织静态结构，只在状态变化和浮层中使用阴影。
- **Do** 确保文字与状态信息达到 WCAG 2.1 AA 对比度，并在 200% 缩放下保持可读、可操作。
- **Do** 保证学生能在课堂平板上通过触控完成主要操作，并为所有动画提供 `prefers-reduced-motion` 降级。

### Don't:

- **Don't** 做“依靠大量渐变、发光和玻璃效果吸引注意的炫技型科技展示页”。
- **Don't** 做“颜色与装饰过度幼稚的低龄卡通学习站”。
- **Don't** 做“拥挤、灰暗，并让表格与表单压倒主要任务的传统企业管理后台”。
- **Don't** 使用渐变文字、装饰性网格背景、重复英文眉题或无意义光晕制造科技感。
- **Don't** 在静态卡片上同时叠加 1px 描边和宽柔阴影，也不要把卡片、输入框或对话框做成 32px 以上圆角。
- **Don't** 只用颜色表达成功、警告、错误、选中或禁用状态。
