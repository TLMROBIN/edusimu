# M00 基础仪器与读数 · SPEC v1.0

> 通用仪器读数实训模块，并将五类仪器的分解/诊断模型与 2.5D 交互视图沉淀入 `core/instruments/gauges-model.js` 与 `core/instruments/gauges-view.js`，供 M02/M03/M06/M07/M08/M09 复用。
> slug：`mech-lab-m00`；挂载：人教版 必修第三册 第十一章 3（兼挂 必修第一册 第一章 3）；产出：`dist/M00-基础仪器与读数.html`

---

## 1. 教学目标（对应高考考点）
1. **分清“估读”与“不估读”**：
   - 最小分度带“1”字（1 mm 刻度尺、0.01 mm 螺旋测微器、0.1 N 弹簧测力计）：**必须估读到最小分度的下一位**（对齐整刻线也要补 `0`）。
   - 游标卡尺（10/20/50 分度，精度 0.1/0.05/0.02 mm）、机械停表（分度 0.1 s）：**不估读**，但精度末尾的 `0` 不能省（如 `10.00 mm`）。
2. **游标卡尺三看清**：看清分度数（10/20/50）→ 看清**游标 0 刻线**左侧的主尺整毫米（不要看成金属框左边缘）→ 找准对齐的第 `k` 条刻线 → `读数 = 主尺整毫米 + k × 分度值`。
3. **螺旋测微器两重点**：看清固定刻度下排 `0.5 mm` **半毫米刻线**是否露出（接近 `0` 刻度时结合可动刻度是否过 `0` 交叉检验）→ 估读千分位（`× 0.01 mm` 后多估一位）→ 存在零点误差时 `真实值 = 测量示数 − 零误差`（带正负号）。
4. **机械停表与弹簧测力计**：停表先看小表盘整数分与**半分钟红线**（决定大表盘读 `0~30 s` 还是 `30~60 s`），注意 `1 min = 60 s` 六十进制；测力计注意校零与 `0.01 N` 估读。
5. **非零起点测量**：刻度尺起点不在 `0` 刻度时，`长度 = 末端刻度 − 起始刻度`。

---

## 2. 公共模型与接口（`core/instruments/gauges-model.js` & `gauges-view.js`）

### 2.1 `ML.gauges`
- `ruler.decompose(lengthMm, startMm)` / `ruler.diagnose(inputStr, lengthMm, {startMm, unit, tolMm})`
- `caliper.decompose(valMm, div)` / `caliper.diagnose(inputStr, valMm, {div, unit})`
- `micrometer.decompose(trueMm, zeroErrMm)` / `micrometer.diagnose(inputStr, trueMm, {zeroErrMm, unit, tolMm})`
- `dynamometer.decompose(trueForceN, zeroOffsetN)` / `dynamometer.diagnose(inputStr, trueForceN, {zeroOffsetN, tolN})`
- `stopwatch.decompose(totalSec)` / `stopwatch.diagnose(inputStr, totalSec)`

所有 `diagnose` 返回 `{ ok, okVal, okSig, code, msg, errorId }`，可精准识别错因并定位到对应 `errors[]` 条目（`E1–E7`）。

### 2.2 `ML.gaugesView`
- 2.5D 绘制函数：`drawRuler` / `drawCaliper` / `drawMicrometer` / `drawDynamometer` / `drawStopwatch`
- 通用交互组件：`new ML.gaugesView.GaugeBench(container, {height, state, onChange})`

---

## 3. 界面与交互（四区一卡）

### 3.1 学·原理（6 页，分步揭示）
- L1 读数总原则：估读与有效数字
- L2 毫米刻度尺与弹簧测力计（含 `ruler-dyn-demo`）
- L3 游标卡尺原理与 10/20/50 分度（含 `caliper-demo`）
- L4 螺旋测微器与零点误差（含 `micrometer-demo`）
- L5 机械停表与托盘天平（含 `stopwatch-demo`）
- L6 五大仪器读数规则速查总表
器材认识卡 6 张（毫米刻度尺、游标卡尺、螺旋测微器、弹簧测力计、机械停表、托盘天平）。

### 3.2 做·实验（1016×563 一屏布局）
- **顶栏**：引导模式 / 自由模式；五大仪器切换（游标卡尺 / 螺旋测微器 / 毫米刻度尺 / 弹簧测力计 / 机械停表）；仪器选项（如 10/20/50 分度、零误差开关、单位 mm/cm）；“随机出题”。
- **左侧交互台**：`GaugeBench` 画布，支持单指拖动量爪/螺杆/挂钩/指针改变被测值，长按呼出 3× 放大镜；自带局部放大视窗。
- **右侧操作面板**：`− / +` 微调与“例题预设”快捷键、读数输入框（配物理数字小键盘）、“判分与错因诊断”按钮（调用 `ML.gauges.*.diagnose`；错时给出具体错误类型与“为什么？试一试 →”入口）、引导步骤 `P1–P8` 实时打卡。

### 3.3 诊·误差
**A. 错误操作实验室（`errors[]`，7 项）**：
- `E1` 游标卡尺：多估读一位或漏写精度末尾 0
- `E2` 游标卡尺：把主尺读在游标框左边缘而非 0 刻线
- `E3` 螺旋测微器：漏看或误加 0.5 mm 半毫米刻线
- `E4` 刻度尺/千分尺/测力计：对齐刻线时漏写估读位“0”
- `E5` 螺旋测微器/测力计：未调零或零点误差符号算反
- `E6` 机械停表：忽略小表盘半分钟刻线（少加或多加 30 s）
- `E7` 毫米刻度尺：非零起点直接读末端刻度

**B. 结果反推（`reverse[]`，4 项）**：
- `R1` 10 分度游标卡尺读成 `19.00 mm`（多估读）
- `R2` 游标卡尺少读约 `2.0 mm`（误读框左边缘）
- `R3` 螺旋测微器相差 `0.500 mm`（半毫米刻线判断错）
- `R4` 机械停表少读了 `30.0 s`（忽略半分钟红线）

### 3.4 练·真题
全部来自 `research/真题题库-2024-2026-力学实验.md` 与课件原题（13 题，均 `verified: true`），每题均配精确刻线位置的 SVG 插图。

---

## 4. 校验（`verify.mjs`）
1. 游标卡尺 10/20/50 分度分解、格式化及 5 类错误诊断（`E_CAL_EST` / `E_CAL_PREC` / `E_CAL_EDGE` / `E_CAL_DIV` / `E_UNIT`）。
2. 螺旋测微器半毫米刻线边界（`7.415`、`6.860`、`8.260`、`2.207`、`6.995` vs `7.000`）与零误差诊断（`E_MIC_HALF` / `E_MIC_ZERO` / `E_MIC_EST`）。
3. 毫米刻度尺非零起点与估读诊断（`E_RULER_ZERO` / `E_RULER_EST` / `E_RULER_OVER`）。
4. 弹簧测力计 `0.01 N` 估读与零误差诊断（`E_DYN_EST` / `E_DYN_ZERO`）。
5. 机械停表半分钟线与六十进制诊断（`E_SW_HALF` / `E_SW_MIN` / `E_SW_PREC`）。
6. `questions.json` 全部题目有效数字与答案自洽校验。
