// M02 物理校验与真题自检：node verify.mjs（无依赖）。对应 SPEC §4。
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const core = path.join(here, '..', '..', 'core');
for (const f of ['math.js', 'physics.js', 'paper.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(core, f), 'utf8'), { filename: f });
}
vm.runInThisContext(fs.readFileSync(path.join(here, 'scene.js'), 'utf8'), { filename: 'scene.js' });

const { spring: SP, phys: P, expr, math } = globalThis.ML;
let fails = 0;
const check = (name, ok, info) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) fails++;
};
const rel = (x, y) => Math.abs(x - y) / Math.abs(y);
const pct = x => (x * 100).toFixed(4) + '%';

// 1. 四种预设弹簧竖直悬挂原长 l0Hang 校验
{
  const g = SP.G;
  let maxErr = 0;
  for (const id of ['std', 'soft', 'stiff', 'heavy']) {
    const sp = SP.getSpring(id);
    const expected = sp.l0Horiz + (sp.mSpring * g) / (2 * sp.k);
    maxErr = Math.max(maxErr, Math.abs(SP.l0Hang(sp, g) - expected));
  }
  const heavy = SP.getSpring('heavy');
  const dlHeavy = SP.selfStretch(heavy, g);
  check('1 预设弹簧 l0Hang 与大自重弹簧 Δl_self = 0.60 cm 精确匹配',
    maxErr < 1e-12 && Math.abs(dlHeavy - 0.0060) < 1e-12,
    `maxErr=${maxErr.toExponential(2)}, heavy Δl_self=${(dlHeavy * 100).toFixed(3)} cm`);
}

// 2. 弹性限度内 fitFL 与 fitFX 拟合劲度系数及原长误差 < 0.1%
{
  let maxRelK = 0, maxRelL0 = 0;
  for (const id of ['std', 'soft', 'stiff']) {
    const sp = SP.getSpring(id);
    const rows = [];
    for (let n = 0; n <= 5; n++) rows.push(SP.measurePoint(sp, n, { ideal: true }));
    const fl = SP.fitFL(rows);
    const fx = SP.fitFX(rows);
    maxRelK = Math.max(maxRelK, rel(fl.k, sp.k), rel(fx.k, sp.k));
    maxRelL0 = Math.max(maxRelL0, rel(fl.l0Fit, SP.l0Hang(sp, SP.G)));
  }
  check('2 弹性限度内 fitFL / fitFX 拟合 k 与 l0 误差 < 0.1%',
    maxRelK < 0.001 && maxRelL0 < 0.001,
    `maxRelK=${pct(maxRelK)}, maxRelL0=${pct(maxRelL0)}`);
}

// 3. 大自重弹簧水平测原长：F-x 正横截距 = Δl_self (0.60 cm)，斜率 k 仍准确
{
  const heavy = SP.getSpring('heavy');
  const rows = [];
  for (let n = 0; n <= 6; n++) rows.push(SP.measurePoint(heavy, n, { ideal: true, l0Mode: 'horiz' }));
  const fx = SP.fitFX(rows);
  const dlSelf = SP.selfStretch(heavy, SP.G);
  check('3 大自重弹簧水平测原长 F-x 横截距 = Δl_self 且斜率准确 (< 0.1%)',
    Math.abs(fx.xIntercept - dlSelf) < 1e-9 && rel(fx.k, heavy.k) < 0.001,
    `xIntercept=${(fx.xIntercept * 100).toFixed(3)} cm vs ${(dlSelf * 100).toFixed(3)} cm, k=${fx.k.toFixed(3)}`);
}

// 4. 超出弹性限度：切线斜率 < 0.8*k，卸载后留有永久伸长 > 0
{
  const sp = SP.getSpring('std');
  const f1 = 4.41, f2 = 4.90;
  const x1 = SP.elongation(sp, f1, f1).xTotal;
  const x2 = SP.elongation(sp, f2, f2).xTotal;
  const kTan = (f2 - f1) / (x2 - x1);
  const lUnload = SP.lengthAt(sp, 0, f2, SP.G);
  const xPerm = lUnload - SP.l0Hang(sp, SP.G);
  check('4 超弹性限度后切线斜率 < 0.8*k 且卸载保留永久伸长 > 0',
    kTan < 0.8 * sp.k && xPerm > 0.005,
    `kTan=${kTan.toFixed(2)} N/m (< ${(0.8 * sp.k).toFixed(1)}), 卸载永久伸长=${(xPerm * 100).toFixed(2)} cm`);
}

// 5. 刻度尺倾斜 12° 使测得 k = k * cos(12°)；俯视 18° 视差偏移 +dGap * tan(18°)
{
  const sp = SP.getSpring('std');
  const rowsTilt = [];
  for (let n = 0; n <= 6; n++) rowsTilt.push(SP.measurePoint(sp, n, { ideal: true, rulerTiltDeg: 12 }));
  const fxTilt = SP.fitFX(rowsTilt);
  const kExpected = sp.k * Math.cos(12 * Math.PI / 180);
  const l0True = SP.l0Hang(sp, SP.G);
  const lParallax = SP.readScale(l0True, { ideal: true, viewAngleDeg: 18 });
  const shiftExpected = SP.D_GAP * Math.tan(18 * Math.PI / 180);
  check('5 刻度尺倾斜 12° 使 k_测 = k·cos12°；俯视 18° 视差偏移精确',
    rel(fxTilt.k, kExpected) < 0.001 && Math.abs((lParallax - l0True) - shiftExpected) < 1e-9,
    `k_tilt=${fxTilt.k.toFixed(3)} vs ${kExpected.toFixed(3)}, parallax=+${((lParallax - l0True) * 100).toFixed(3)} cm`);
}

// 6. 阻尼振动收敛与未静止读数 (E3) 方差增大、R² 明显下降
{
  const sp = SP.getSpring('std');
  const y0 = 0.20;
  const yEarly = SP.oscPos(y0, 0.015, 0.12, sp, 0.20);
  const ySettled = SP.oscPos(y0, 0.015, 3.5, sp, 0.20);
  const good = [1, 2, 3, 4, 5, 6].map(n => SP.measurePoint(sp, n, { ideal: true }));
  const bad = SP.sampleOscillatingSeries(sp, [1, 2, 3, 4, 5, 6], { ideal: true, oscAmp: 0.015, seed: 83 });
  const fg = SP.fitFX(good), fb = SP.fitFX(bad);
  check('6 阻尼振动衰减收敛且未静止读数降低 R²',
    Math.abs(yEarly - y0) > 0.001 && Math.abs(ySettled - y0) < 1e-4 && fg.r2 > 0.9999 && fb.r2 < 0.97,
    `R²静止=${fg.r2.toFixed(6)}, R²振动中=${fb.r2.toFixed(4)}`);
}

// 7. 2025 四川水桶加水与双弹簧串并联公式
{
  const Vs = [0, 5e-5, 10e-5, 15e-5, 20e-5, 25e-5];
  const xs = Vs.map(v => 0.0056 + 200 * v);
  const res = SP.analyzeWaterBucket(Vs, xs, 1000, 9.8);
  const kSer = SP.comboK(40, 60, 'series');
  const kPar = SP.comboK(40, 60, 'parallel');
  check('7 2025 四川水桶模型 (k=49 N/m, m=0.028 kg) 与双弹簧串并联',
    rel(res.k, 49) < 1e-6 && rel(res.mBucket, 0.028) < 1e-6 && Math.abs(kSer - 24) < 1e-9 && Math.abs(kPar - 100) < 1e-9,
    `k=${res.k.toFixed(2)}, m=${res.mBucket.toFixed(4)} kg, k_ser=${kSer}, k_par=${kPar}`);
}

// 8. content.json 与 questions.json 全题自检
{
  const content = JSON.parse(fs.readFileSync(path.join(here, 'content.json'), 'utf8'));
  const qs = JSON.parse(fs.readFileSync(path.join(here, 'questions.json'), 'utf8'));
  const errIds = new Set(content.errors.map(e => e.id));
  const procIds = new Set(content.procedure.map(p => p.id));
  const cBad = [];
  for (const e of content.errors) {
    if (e.noteId && !procIds.has(e.noteId)) cBad.push(`error ${e.id} bad noteId`);
    if (!(e.ask.answer >= 0 && e.ask.answer < e.ask.options.length)) cBad.push(`error ${e.id} ask OOB`);
  }
  for (const p of content.procedure) {
    if (p.errorId && !errIds.has(p.errorId)) cBad.push(`proc ${p.id} bad errorId`);
  }
  for (const r of content.reverse) {
    if (r.replay && !errIds.has(r.replay)) cBad.push(`rev ${r.id} bad replay`);
    if (r.answer.some(a => !(a >= 0 && a < r.options.length))) cBad.push(`rev ${r.id} answer OOB`);
  }

  const qBad = [];
  for (const q of qs) {
    if (!q.verified) qBad.push(`${q.id}: verified !== true`);
    if (!q.source) qBad.push(`${q.id}: missing source`);
    for (const [i, pt] of q.parts.entries()) {
      const where = `${q.id}(${i + 1})`;
      if (pt.replay && !errIds.has(pt.replay)) qBad.push(`${where}: bad replay ${pt.replay}`);
      if (pt.type === 'numeric') {
        if (pt.show == null) qBad.push(`${where}: missing show`);
        const ref = String(pt.show);
        const v = math.parseNum(ref);
        const tol = pt.tol != null ? pt.tol : Math.abs(pt.answer) * 0.01;
        if (!isFinite(v) || Math.abs(v - pt.answer) > tol + 1e-12) qBad.push(`${where}: val ${ref} vs ${pt.answer}`);
        if (pt.sig && math.countSig(ref) !== pt.sig) qBad.push(`${where}: sig ${math.countSig(ref)} vs ${pt.sig}`);
      } else if (pt.type === 'expr') {
        try {
          if (!expr.equal(pt.answer, pt.answer, Object.keys(pt.vars))) qBad.push(`${where}: expr self`);
          if (pt.show) {
            const normShow = pt.show.replace(/−/g, '-').replace(/÷/g, '/').replace(/×/g, '*');
            if (!expr.equal(normShow, pt.answer, Object.keys(pt.vars))) qBad.push(`${where}: show mismatch`);
          }
        } catch (e) { qBad.push(`${where}: ${e.message}`); }
      } else if (pt.type === 'plot') {
        const lf = P.linfit(pt.points.map(p => p[0]), pt.points.map(p => p[1]));
        if (Math.abs(lf.k - pt.slope) > pt.tol) qBad.push(`${where}: plot slope ${lf.k} vs ${pt.slope}`);
        if (pt.lineInit) {
          const kInit = (pt.lineInit[1][1] - pt.lineInit[0][1]) / (pt.lineInit[1][0] - pt.lineInit[0][0]);
          if (Math.abs(kInit - pt.slope) <= pt.tol) qBad.push(`${where}: lineInit slope ${kInit} too close to ${pt.slope}`);
        }
      } else if (pt.type === 'choice' || pt.type === 'text-choice') {
        if (!(pt.answer >= 0 && pt.answer < pt.options.length)) qBad.push(`${where}: choice OOB`);
      } else if (pt.type === 'multi') {
        if (!Array.isArray(pt.answer) || pt.answer.some(a => !(a >= 0 && a < pt.options.length))) qBad.push(`${where}: multi OOB`);
      }
    }
  }
  const y2p1 = expr.equal('(F2 - F1) ÷ (l2 - l1)', '(F2-F1)/(l2-l1)', ['F1', 'F2', 'l1', 'l2']);
  const y2p2 = expr.equal('k1 × k2 ÷ (k1 + k2)', 'k1*k2/(k1+k2)', ['k1', 'k2']);
  check('8a content.json 引用完整且 errors ≥ 6、reverse ≥ 4',
    cBad.length === 0 && content.errors.length >= 6 && content.reverse.length >= 4,
    cBad.join('; ') || `errors=${content.errors.length}, reverse=${content.reverse.length}`);
  check('8b questions.json 全题自检（9道、全verified、show/有效数字/表达式/作图）',
    qs.length >= 9 && qBad.length === 0 && y2p1 && y2p2,
    qBad.join('; ') || `共校验 ${qs.length} 题，快捷拼式=${y2p1 && y2p2}`);
}

console.log(fails ? `\n${fails} 项未通过` : '\n全部通过');
process.exit(fails ? 1 : 0);
