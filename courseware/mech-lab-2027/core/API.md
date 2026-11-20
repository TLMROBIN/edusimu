# core API（v1.0，随 M01 样板冻结）

所有组件挂在 `window.ML`。加载顺序见 `build.py` 的 `CORE_JS`。改动须向后兼容；新增仪器放 `core/instruments/`。

## ml.js
| API | 说明 |
|---|---|
| `ML.h(sel, attrs?, ...children)` | 建 DOM。`sel` 如 `'button.btn.primary'`；attrs 支持 `html`/`text`/`style`(对象)/`class`/`data`/`onXxx` |
| `ML.$ / ML.$$ / ML.clear(el)` | 查询 / 清空 |
| `ML.bus.on(name, fn) → off` / `emit` | 事件总线。内置事件：`perf`(low)、`tab`(id)、`paper:graded`(qid, allRight) |
| `ML.store.init(slug, defaults) → data` | 唯一存档键 `lab3d:<slug>`；`defaults.v` 为版本号，版本不同则丢弃旧档 |
| `ML.store.set(patch)` / `save()` | 500 ms 节流写入；> 16 KB 时从 `answers` 最早的题开始丢 |
| `ML.toast(msg, 'ok'|'warn'|'err'|'info')` | 底部提示 |
| `ML.perf` | `.low` `.set(bool)` `.probe()` `.dpr()` `.reduced`（prefers-reduced-motion） |
| `ML.json(id)` | 读内联 `<script type="application/json" id=…>`：`ml-content`、`ml-questions` |

## math.js
`ML.math.tex(s)` 展开 `{{frac|分子|分母}}`、`{{sqrt|x}}`（可嵌套）；`frac(n,d)`；`sig(x,n)` 保留有效数字；`fix(x,d)`；`countSig(str)`；`parseNum(str)`（支持 `1.2×10^-3`）。

## physics.js（Node 可运行）
`ML.phys.rng(seed)` → `r()` ∈[0,1)、`r.gauss(σ)`、`r.int(a,b)`；`linfit(xs,ys)→{k,b,r2}`；`roundTo`、`mean`、`std`、`clamp`；`G = 9.80`。

## stage.js
| API | 说明 |
|---|---|
| `new ML.stage.Stage(container, {layers:['bg','fg'], onResize})` | 叠层画布，DPR 封顶，ResizeObserver 自适应；离开文档后自动回收 |
| `.on(layer, draw(ctx,w,h))` / `.invalidate(layer?)` / `.layer(name)` | 只重绘脏层；`invalidate` 合并到下一帧 |
| `new ML.stage.Loop(step(dt,t) → false 停)` / `.start()` `.stop()` | 按需 rAF，空闲零开销；dt 已封顶 0.05 s |
| `ML.stage.pointer(el, {down(p)→false 不接管, move(p,a), up(p,a), press(p)})` | 统一指针；`a.moved` `a.pressed`（长按 260 ms） |
| `new ML.stage.Magnifier(host, {zoom, size})` / `.show(canvases, x, y, dpr, label)` / `.hide()` | 手指上方 80 px 的放大镜 |
| `ML.stage.draw` | `rr` 圆角矩形、`grad` 线性渐变、`text`、`ring` 虚线圈 |

## chart.js
`new ML.Chart(container, {xLabel, yLabel, x:[min,max], y, height, paper, edit:{snap:[dx,dy], onChange}})`
- `.set(series, notes)`；series 项：`{pts:[[x,y]], color, fit, line:[[x1,y1],[x2,y2]], dash, bars, barW, mark:'x', hollow, label}`；`fit:true` 后 `series.fitResult = {k,b,r2}`
- 交互作图：`.addLine(p1,p2)`、`.setState({pts,line})`、`.slope()`

## paper.js
`new ML.Paper(container, questions, {title, onReplay(errorId)})`，题目格式见 SERIES §7.1。
题型：`choice` `multi` `text-choice`（行内选填）`numeric`（`answer` `tol` `sig` `unit` `show`）`expr`（`vars` `extra` `answer` 用 `+ - * / ^ ()` 书写，随机代入判等价）`plot`（`x` `y` `points` `snap` `ptTol` `slope` `tol` `lineInit`）。
`ML.expr.parse / evalNode / equal` 可单独用（无 eval，CSP 安全）。

## shell.js
- `new ML.Shell({title, sub, summary, tabs:[{id,label,mount(el)}]})`，`.go(id)`、`.summary(bool)`；分区首次显示时才 mount。
- `ML.Learn(el, pages, equipment, {onPage(page, card), onFinish})`：页对象 `{title, html, steps[], widget?}`，步骤逐条揭示。
- `ML.TryIt(err, adapter, noteHtml)`：四拍弹窗。adapter 需实现 `compare(err, area, done)`、`restore()`、可选 `replay(errId)`。
- `ML.Reverse(el, cases, adapter)`：adapter 需实现 `show(case, el)`、`replay(errId)`。

## instruments/tape-model.js（Node 可运行）
`ML.tape.run(params, seed)` → `{a, s(t), v(t), dots[], times[], tags[], T0, tRelease, tPower, tArrive, tStop, tOff, L, power, moving}`
params：`mode('cart'|'drop')` `bob('iron'|'al'|'wood')` `g` `v0` `timer('em'|'spark'|'none')` `power('ac8'|'ac220'|'dc8')` `M` `m` `theta(°)` `ideal` `freq` `near` `startAt` `order('power-first'|'release-first')` `lag` `caught` `threaded`。
其他：`accel(p)`、`tension(p)`、`compensateAngle(p)`、`powerCheck(p)`、`firstClearDot(dots, minGap)`、`measure(dots, {start, every, n, method:'origin'|'segment', ideal, seed}) → {idx, pos, segs, truePos}`、`analyze(segs, T) → {dx, vs, ts, aZhuCha, aTwoPoint, fit, k}`、`photogate(p, d) → {dt1, dt2, t, v1, v2, a1, a2, a, vTrue1, vTrue2}`。
M03（a-F-M）与 M07（竖直自由落体）复用：前者改 `M`/`m`/`theta`，后者需新增竖直模式（待做，接口保持 `run` 返回结构）。

## instruments/tape-view.js
`ML.tapeView.drawTape(ctx, o)`、`drawRuler(ctx, x0, y, w, zeroX, scale)`；
`new ML.tapeView.TapeStrip(container, {height, onTap(i), magLabel(x, strip)})` → `.set({dots, timer, count, labels, ruler, marks, blankText})`、`.fit()`、`.zoomTo(scale, sCenter)`；拖动平移、长按放大镜、点按选点。

## instruments/gauges-model.js（Node 可运行，挂载 `ML.gauges`）
为 M00 及 M02/M03/M06/M07/M08/M09 提供 5 类仪器的几何分解与错误诊断：
- `ML.gauges.ruler`（1 mm 分度，估读 0.1 mm）：`.decompose(lengthMm, startMm)`、`.diagnose(inputStr, lengthMm, {startMm, unit, tolMm})`
- `ML.gauges.caliper`（10/20/50 分度，不估读）：`.decompose(valMm, div)`（含 `.markPosMm(i)`、`.frameEdgeMm`）、`.diagnose(inputStr, valMm, {div, unit})`
- `ML.gauges.micrometer`（0.5 mm 螺距、50 格，估读 0.001 mm）：`.decompose(trueMm, zeroErrMm)`、`.diagnose(inputStr, trueMm, {zeroErrMm, unit, tolMm})`
- `ML.gauges.dynamometer`（0–5 N、0.1 N 分度，估读 0.01 N）：`.decompose(trueForceN, zeroOffsetN)`、`.diagnose(inputStr, trueForceN, {zeroOffsetN, tolN})`
- `ML.gauges.stopwatch`（小盘 15 min 含半分钟线 + 大盘 30 s/圈，0.1 s 分度，不估读）：`.decompose(totalSec)`、`.diagnose(inputStr, totalSec)`

## instruments/gauges-view.js（挂载 `ML.gaugesView`）
- 纯绘制函数：`drawRuler` / `drawCaliper` / `drawMicrometer` / `drawDynamometer` / `drawStopwatch(ctx, w, h, state)`
- 通用交互组件：`new ML.gaugesView.GaugeBench(container, {height, state, onChange(st)})` → `.set(patch)`、`.value()`；支持单指拖动改读数与按住呼出 3× 放大镜。
