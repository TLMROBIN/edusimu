// M07 物理与真题校验：node verify.mjs（无依赖）。对应 SPEC §4。
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const core = path.join(here, '..', '..', 'core');
for (const f of ['math.js', 'physics.js', 'paper.js', 'instruments/tape-model.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(core, f), 'utf8'), { filename: f });
}
const { tape, phys, expr, math } = globalThis.ML;
let fails = 0;
const check = (name, ok, info) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) fails++;
};
const rel = (x, y) => Math.abs(x - y) / Math.abs(y);
const pct = x => (x * 100).toFixed(3) + '%';

function analyzeDrop(run, { startIdx, ideal = true, seed = 7, speedMethod = 'mid', useTapeA = false } = {}) {
  const dots = run.dots, times = run.times, T0 = run.T0 || 0.02, gLoc = phys.G;
  const st = startIdx != null ? startIdx : tape.firstClearDot(dots, 1e-3);
  let endIdx = st;
  for (let i = st + 1; i < dots.length; i++) {
    if (times[i] <= run.tArrive + 1e-6 && dots[i] <= run.L - 0.022) endIdx = i;
    else break;
  }
  const countN = Math.min(24, endIdx - st);
  const meas = tape.measure(dots.slice(st, st + countN + 1), { start: 0, every: 1, n: countN, method: 'origin', ideal, seed });
  const pos = meas.pos, ts = [], vs = [];
  for (let i = 1; i < pos.length - 1; i++) {
    ts.push(i * T0);
    vs.push((pos[i + 1] - pos[i - 1]) / (2 * T0));
  }
  const aTape = phys.linfit(ts, vs).k;
  const gUsed = useTapeA ? aTape : gLoc;
  const rows = [];
  for (let i = 1; i < pos.length - 1; i++) {
    const hVal = pos[i];
    const vMid = (pos[i + 1] - pos[i - 1]) / (2 * T0);
    const vUsed = speedMethod === 'sqrt2gh' ? Math.sqrt(2 * gLoc * hVal) : speedMethod === 'gt' ? gLoc * i * T0 : vMid;
    const ep = gUsed * hVal, ek = 0.5 * vUsed * vUsed;
    rows.push({ n: i, h: hVal, v: vUsed, ep, ek, ratio: ek / ep, eta: Math.abs(ep - ek) / ep });
  }
  const fitHalf = phys.linfit(rows.map(r => r.h), rows.map(r => r.ek));
  const d12Mm = (dots[st + 1] - dots[st]) * 1000;
  return { st, d12Mm, aTape, rows, fitHalf };
}

// 1. 理想落体首两点间距 ≈ 1.96 mm
{
  const r = tape.run({ mode: 'drop', bob: 'iron', ideal: true, order: 'power-first', lag: 0.40 }, 1);
  const st = tape.firstClearDot(r.dots, 1e-3);
  const d12 = (r.dots[st + 1] - r.dots[st]) * 1000;
  check('1a 理想落体首两点间距 ≈ 1.96 mm', Math.abs(d12 - 1.96) < 0.05, `Δs₁₂=${d12.toFixed(3)} mm (理论 1.960 mm)`);
}

// 2. 理想 ½vₙ²/(g hₙ) 偏差 < 0.5%
{
  const r = tape.run({ mode: 'drop', bob: 'iron', ideal: true, order: 'power-first', lag: 0.40 }, 1);
  const res = analyzeDrop(r, { ideal: true });
  const tail = res.rows.filter(x => x.n >= 4);
  const maxDev = Math.max(...tail.map(x => Math.abs(x.ratio - 1)));
  const slopeDev = rel(res.fitHalf.k, phys.G);
  check('2a 理想条件 ½vₙ²/(g·hₙ) 偏差 < 0.5% (n≥4)', maxDev < 0.005, `最大偏差 ${pct(maxDev)}`);
  check('2b 理想条件 ½v²-h 拟合斜率与 g 偏差 < 0.5%', slopeDev < 0.005, `斜率=${res.fitHalf.k.toFixed(4)} g=${phys.G.toFixed(2)} 偏差${pct(slopeDev)}`);
}

// 3. 真实铁锤能耗损 < 2%
{
  const r = tape.run({ mode: 'drop', bob: 'iron', timer: 'em', ideal: false }, 11);
  const res = analyzeDrop(r, { ideal: true });
  const modelLoss = 1 - r.a / phys.G;
  const measLoss = 1 - res.fitHalf.k / phys.G;
  check('3 真实铁锤能耗损 < 2%', modelLoss < 0.02 && measLoss < 0.02, `模型损耗=${pct(modelLoss)} 拟合损耗=${pct(measLoss)}`);
}

// 4. 真实木块损耗 > 15%
{
  const r = tape.run({ mode: 'drop', bob: 'wood', timer: 'em', ideal: false }, 11);
  const res = analyzeDrop(r, { ideal: true });
  const modelLoss = 1 - r.a / phys.G;
  const measLoss = 1 - res.fitHalf.k / phys.G;
  check('4 真实木块损耗 > 15%', modelLoss > 0.15 && measLoss > 0.15, `模型损耗=${pct(modelLoss)} 拟合损耗=${pct(measLoss)}`);
}

// 5. 用自身 a 代替 g 的恒等偏差 < 0.2%
{
  const r = tape.run({ mode: 'drop', bob: 'wood', timer: 'em', ideal: false }, 11);
  const res = analyzeDrop(r, { ideal: true, useTapeA: true });
  const slopeDev = rel(res.fitHalf.k, res.aTape);
  const aDev = rel(res.aTape, r.a);
  const exactPts = [];
  for (let i = 4; i <= 13; i++) {
    const t = i * r.T0, hEx = r.s(r.tRelease + t);
    const vEx = (r.s(r.tRelease + t + r.T0) - r.s(r.tRelease + t - r.T0)) / (2 * r.T0);
    exactPts.push(rel(0.5 * vEx * vEx, res.aTape * hEx));
  }
  const maxExactDev = Math.max(...exactPts);
  check('5 用纸带自身 a 代替 g 恒等偏差 < 0.2%', slopeDev < 0.002 && aDev < 0.002 && maxExactDev < 0.002,
    `a_tape=${res.aTape.toFixed(4)} (真实=${r.a.toFixed(4)}) 斜率偏差=${pct(slopeDev)} 点恒等偏差=${pct(maxExactDev)}`);
}

// 6. 先释放后通电 & 错用 √(2gh)
{
  const rLate = tape.run({ mode: 'drop', bob: 'iron', ideal: true, order: 'release-first', lag: 0.12 }, 3);
  const resLate = analyzeDrop(rLate, { startIdx: 0, ideal: true });
  const ekGtEp = resLate.rows.every(x => x.ek > x.ep);
  check('6a 先释放后通电首两点 ≫ 2 mm 且 ΔEₖ > ΔEₚ', resLate.d12Mm > 15 && ekGtEp, `Δs₁₂=${resLate.d12Mm.toFixed(2)} mm`);

  const rWood = tape.run({ mode: 'drop', bob: 'wood', timer: 'em', ideal: false }, 7);
  const resBadV = analyzeDrop(rWood, { ideal: true, speedMethod: 'sqrt2gh' });
  const resGt = analyzeDrop(rWood, { ideal: true, speedMethod: 'gt' });
  const maxFakeErr = Math.max(...resBadV.rows.map(x => x.eta));
  const minGtDev = Math.min(...resGt.rows.map(x => x.eta));
  check('6b 错用 v=√(2gh) 误差恒为 0，木块错用 v=gt 偏差 > 20%', maxFakeErr < 1e-9 && minGtDev > 0.20,
    `√2gh=${maxFakeErr.toExponential(2)}, min gt偏差=${pct(minGtDev)}`);

  const rNear = tape.run({ mode: 'drop', bob: 'iron', timer: 'em', ideal: false, caught: true }, 23);
  const rFar = tape.run({ mode: 'drop', bob: 'iron', timer: 'em', ideal: false, caught: true, startAt: 0.28, near: false }, 23);
  const resN = analyzeDrop(rNear, { ideal: true }), resF = analyzeDrop(rFar, { ideal: true });
  check('6c E5 靠近与远离计时器有效落体点数与最大下落高度不同',
    resN.rows.length > resF.rows.length && resN.rows[resN.rows.length - 1].h > resF.rows[resF.rows.length - 1].h + 0.15,
    `near=${resN.rows.length + 2}点/${resN.rows[resN.rows.length - 1].h.toFixed(2)}m, far=${resF.rows.length + 2}点/${resF.rows[resF.rows.length - 1].h.toFixed(2)}m`);
}

// 7. 倾斜气垫导轨光电门
{
  const sinTh = 0.06, cosTh = Math.sqrt(1 - sinTh * sinTh), d = 0.002, L = 0.40;
  const a = phys.G * sinTh;
  const s1 = 0.16, s2 = s1 + L, tAt = s => Math.sqrt(2 * s / a);
  const v1 = d / (tAt(s1 + d) - tAt(s1)), v2 = d / (tAt(s2 + d) - tAt(s2));
  const ratio = (0.5 * (v2 * v2 - v1 * v1)) / (phys.G * L * sinTh);
  check('7 倾斜气垫导轨理想 ½(v₂²−v₁²)/(gLsinθ) 偏差 < 0.5%', Math.abs(ratio - 1) < 0.005, `比值=${ratio.toFixed(5)} cosθ=${cosTh.toFixed(4)}`);
}

// 8. content.json & questions.json 全部自检
{
  const content = JSON.parse(fs.readFileSync(path.join(here, 'content.json'), 'utf8'));
  const qs = JSON.parse(fs.readFileSync(path.join(here, 'questions.json'), 'utf8'));
  const errIds = new Set((content.errors || []).map(e => e.id));
  const qBad = [];
  for (const q of qs) {
    if (!q.verified) { qBad.push(`${q.id}: verified!=true`); continue; }
    for (const [i, pt] of q.parts.entries()) {
      if (pt.replay && !errIds.has(pt.replay)) qBad.push(`${q.id}(${i + 1}): replay ${pt.replay} 不存在`);
      if (pt.type === 'numeric') {
        if (pt.show == null) qBad.push(`${q.id}(${i + 1}): 缺少 show`);
        const ref = String(pt.show != null ? pt.show : pt.answer);
        const v = math.parseNum(ref), tol = pt.tol != null ? pt.tol : Math.abs(pt.answer) * 0.01;
        if (!isFinite(v) || Math.abs(v - pt.answer) > tol + 1e-12) qBad.push(`${q.id}(${i + 1}): val ref=${ref} ans=${pt.answer}`);
        if (pt.sig && math.countSig(ref) !== pt.sig) qBad.push(`${q.id}(${i + 1}): sig ref=${ref} want=${pt.sig}`);
      } else if (pt.type === 'expr') {
        try {
          if (!expr.equal(pt.answer, pt.answer, Object.keys(pt.vars))) qBad.push(`${q.id}(${i + 1}): expr unequal`);
        } catch (e) { qBad.push(`${q.id}(${i + 1}): ${e.message}`); }
      } else if (pt.type === 'plot') {
        const fit = phys.linfit(pt.points.map(p => p[0]), pt.points.map(p => p[1]));
        if (Math.abs(fit.k - pt.slope) > pt.tol) qBad.push(`${q.id}(${i + 1}): plot slope ${fit.k.toFixed(3)} vs ${pt.slope}`);
        if (!Array.isArray(pt.lineInit) || pt.lineInit.length < 2) {
          qBad.push(`${q.id}(${i + 1}): missing lineInit`);
        } else {
          const k0 = (pt.lineInit[1][1] - pt.lineInit[0][1]) / (pt.lineInit[1][0] - pt.lineInit[0][0]);
          if (Math.abs(k0 - pt.slope) <= pt.tol) qBad.push(`${q.id}(${i + 1}): lineInit already within tol (${k0.toFixed(2)})`);
        }
      } else if (pt.type === 'choice' || pt.type === 'text-choice') {
        if (!(0 <= pt.answer && pt.answer < pt.options.length)) qBad.push(`${q.id}(${i + 1}): answer out of range`);
      } else if (pt.type === 'multi') {
        if (pt.answer.some(a => !(0 <= a && a < pt.options.length))) qBad.push(`${q.id}(${i + 1}): multi answer out of range`);
      }
    }
  }
  check('8 questions.json 全题自检（verified/show/有效数字/表达式/作图/replay）', qBad.length === 0, qBad.join('; ') || `共校验 ${qs.length} 题`);
}

console.log(fails ? `\n${fails} 项未通过` : '\n全部通过');
process.exit(fails ? 1 : 0);
