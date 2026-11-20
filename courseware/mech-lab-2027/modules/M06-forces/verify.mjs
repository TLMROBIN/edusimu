// M06 物理校验与真题自检：node verify.mjs（无依赖）。对应 SPEC §4。
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const core = path.join(here, '..', '..', 'core');
for (const f of ['math.js', 'physics.js', 'paper.js', 'instruments/gauges-model.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(core, f), 'utf8'), { filename: f });
}
vm.runInThisContext(fs.readFileSync(path.join(here, 'scene.js'), 'utf8'), { filename: 'scene.js' });

const { forces: FF, phys: P, expr, math, gauges } = globalThis.ML;
let fails = 0;
const check = (name, ok, info) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) fails++;
};
const pct = x => (x * 100).toFixed(4) + '%';

// 1. 理想条件下任意有效夹角（35°+45°、30°+50°、25°+65°）理论合力 F 与实际值 F' 误差 < 0.1%
{
  const cases = [[35, 45], [30, 50], [25, 65]];
  let maxMagErr = 0, maxAngErr = 0;
  for (const [t1, t2] of cases) {
    const res = FF.solveExperiment({ theta1Deg: t1, theta2Deg: t2, ideal: true }, 1);
    maxMagErr = Math.max(maxMagErr, res.relMagErr);
    maxAngErr = Math.max(maxAngErr, res.angleDiffDeg);
  }
  check('1 任意有效角度理想合成 F 与 F\' 相对误差 < 0.1%',
    maxMagErr < 0.001 && maxAngErr < 0.1,
    `maxMagErr=${pct(maxMagErr)}, maxAngErr=${maxAngErr.toFixed(6)}°`);
}

// 2. E1 单计拉结点偏移（dx=0.008 m, dy=0.014 m）导致相对误差 > 10%
{
  const e1 = FF.solveExperiment({ knotOffset: { dx: 0.008, dy: 0.014 }, ideal: true }, 1);
  check('2 E1 单计结点偏移 1.6 cm 引起相对误差 > 10%',
    e1.relMagErr > 0.10 && e1.angleDiffDeg > 2.0,
    `F=${e1.F_theory.mag.toFixed(3)} N vs F'=${e1.F_actual.mag.toFixed(3)} N, relErr=${pct(e1.relMagErr)}, Δθ=${e1.angleDiffDeg.toFixed(2)}°`);
}

// 3. E2 未调零 (+0.30 N) 与 E3 抬起 22°+壳体摩擦均导致偏差 > 5%，且 E3 满足 F > F'
{
  const e2 = FF.solveExperiment({ zeroErr1: 0.30, zeroErr2: 0.30, ideal: true }, 1);
  const e3 = FF.solveExperiment({ liftDeg: 22, fCase: 0.10, ideal: true }, 1);
  check('3a E2 零点误差 +0.30 N 引起合力偏差 > 5%',
    e2.relMagErr > 0.05 && e2.F_theory.mag > e2.F_actual.mag,
    `F=${e2.F_theory.mag.toFixed(3)} N vs F'=${e2.F_actual.mag.toFixed(3)} N (${pct(e2.relMagErr)})`);
  check('3b E3 抬起 22°+摩擦 0.10 N 引起理论合力 F 显著大于 F\' (> 5%)',
    e3.relMagErr > 0.05 && e3.F_theory.mag > e3.F_actual.mag,
    `F=${e3.F_theory.mag.toFixed(3)} N > F'=${e3.F_actual.mag.toFixed(3)} N (${pct(e3.relMagErr)})`);
}

// 4. E4 短细绳 (0.025 m) 多随机种子角度散度 > 3.5× 长细绳 (0.120 m)
{
  const longAngles = [], shortAngles = [];
  for (let i = 0; i < 60; i++) {
    const seed = 100 + i * 19;
    longAngles.push(FF.solveExperiment({ markDist: 0.120, ideal: false }, seed).theta1Meas);
    shortAngles.push(FF.solveExperiment({ markDist: 0.025, ideal: false }, seed).theta1Meas);
  }
  const sdLong = P.std(longAngles), sdShort = P.std(shortAngles);
  const ratio = sdShort / sdLong;
  check('4 E4 短细绳 (2.5 cm) 角度散度 > 3.5× 长细绳 (12 cm)',
    ratio > 3.5,
    `σ_short=${sdShort.toFixed(3)}°, σ_long=${sdLong.toFixed(3)}°, ratio=${ratio.toFixed(2)}×`);
}

// 5. E5 夹角 145° 超 5 N 量程；动态平衡在 θ₁+θ₂=90° 严格取最小值 F_eq sin θ₁
{
  const e5 = FF.solveExperiment({ theta1Deg: 72.5, theta2Deg: 72.5, ideal: true }, 1);
  const th1 = 35;
  const at90 = FF.dynamicEquilibrium(FF.F_EQ_STD, th1, 90 - th1);
  let minF2 = Infinity, argMin = -1;
  for (let th2 = 10; th2 <= 85; th2 += 1) {
    const d = FF.dynamicEquilibrium(FF.F_EQ_STD, th1, th2);
    if (d.F2 < minF2) { minF2 = d.F2; argMin = th2; }
  }
  const f2TheoMin = FF.F_EQ_STD * Math.sin(th1 * Math.PI / 180);
  check('5a E5 145° 对称拉开超出 5 N 量程 (overRange=true)',
    e5.overRange && e5.F1True > 5.0 && e5.F2True > 5.0,
    `F₁=F₂=${e5.F1True.toFixed(3)} N > 5.0 N`);
  check('5b 动态平衡保持 F₁ 方向不变时，F₂ 严格在 θ₁+θ₂=90° 处取得极小值 F_eq sin θ₁',
    argMin === 90 - th1 && Math.abs(at90.F2 - f2TheoMin) < 1e-12 && at90.isPerp,
    `argMin θ₂=${argMin}°, F₂_min=${at90.F2.toFixed(4)} N (理论=${f2TheoMin.toFixed(4)} N)`);
}

// 6. 弹簧测力计读数校验（0.01 N 估读精度）
{
  const dOk = gauges.dynamometer.diagnose('2.00', 2.00, { zeroOffsetN: 0 });
  const dNoEst = gauges.dynamometer.diagnose('2.0', 2.00, { zeroOffsetN: 0 });
  check('6 共享测力计模型正确识别 0.01 N 估读与缺估读',
    dOk.ok && !dNoEst.ok && dNoEst.code === 'E_DYN_EST',
    `2.00→${dOk.code}, 2.0→${dNoEst.code}`);
}

// 7. content.json 与 questions.json 全题自检
{
  const content = JSON.parse(fs.readFileSync(path.join(here, 'content.json'), 'utf8'));
  const qs = JSON.parse(fs.readFileSync(path.join(here, 'questions.json'), 'utf8'));
  const errIds = new Set(content.errors.map(e => e.id));
  const procIds = new Set(content.procedure.map(p => p.id));
  const cBad = [];
  for (const e of content.errors) {
    if (e.noteId && !procIds.has(e.noteId)) cBad.push(`error ${e.id} bad noteId`);
    if (!(e.ask && e.ask.answer >= 0 && e.ask.answer < e.ask.options.length)) cBad.push(`error ${e.id} bad ask.answer`);
  }
  for (const p of content.procedure) {
    if (p.errorId && !errIds.has(p.errorId)) cBad.push(`proc ${p.id} bad errorId`);
  }
  for (const r of content.reverse) {
    if (r.replay && !errIds.has(r.replay)) cBad.push(`rev ${r.id} bad replay`);
    if (!Array.isArray(r.answer) || r.answer.some(a => !(a >= 0 && a < r.options.length))) cBad.push(`rev ${r.id} bad answer`);
  }

  const qBad = [];
  for (const q of qs) {
    if (q.verified !== true) qBad.push(`${q.id}: verified !== true`);
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
        const varKeys = Object.keys(pt.vars || {});
        if (!varKeys.length || varKeys.some(k => !/^[A-Za-z][A-Za-z0-9_]*$/.test(k))) {
          qBad.push(`${where}: vars keys must be pure ASCII`);
        }
        try {
          if (!expr.equal(pt.answer, pt.answer, varKeys)) qBad.push(`${where}: expr self`);
          if (!expr.equal('√( F1 ² + F2 ² )', pt.answer, varKeys)) qBad.push(`${where}: token form`);
        } catch (e) { qBad.push(`${where}: ${e.message}`); }
      } else if (pt.type === 'plot') {
        const lf = P.linfit(pt.points.map(p => p[0]), pt.points.map(p => p[1]));
        if (Math.abs(lf.k - pt.slope) > pt.tol) qBad.push(`${where}: plot slope ${lf.k} vs ${pt.slope}`);
        if (pt.lineInit) {
          const initK = (pt.lineInit[1][1] - pt.lineInit[0][1]) / (pt.lineInit[1][0] - pt.lineInit[0][0]);
          if (Math.abs(initK - pt.slope) <= pt.tol) qBad.push(`${where}: lineInit slope ${initK} too close to ${pt.slope}`);
        }
      } else if (pt.type === 'choice' || pt.type === 'text-choice') {
        if (!(pt.answer >= 0 && pt.answer < pt.options.length)) qBad.push(`${where}: choice OOB`);
      } else if (pt.type === 'multi') {
        if (!Array.isArray(pt.answer) || pt.answer.some(a => !(a >= 0 && a < pt.options.length))) qBad.push(`${where}: multi OOB`);
      }
    }
  }
  check('7a content.json 引用完整且 errors ≥ 6、reverse ≥ 4',
    cBad.length === 0 && content.errors.length >= 6 && content.reverse.length >= 4,
    cBad.join('; ') || `errors=${content.errors.length}, reverse=${content.reverse.length}`);
  check('7b questions.json 全题自检（≥8道、全verified、show/有效数字/表达式/作图）',
    qs.length >= 8 && qBad.length === 0,
    qBad.join('; ') || `共校验 ${qs.length} 题`);
}

console.log(fails ? `\n${fails} 项未通过` : '\n全部通过');
process.exit(fails ? 1 : 0);
