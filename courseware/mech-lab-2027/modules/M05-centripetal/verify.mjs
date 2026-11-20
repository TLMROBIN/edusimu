// M05 物理校验与真题自检：node verify.mjs（无依赖）。对应 SPEC §4。
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

const { centrip: MC, phys: P, expr, math } = globalThis.ML;
let fails = 0;
const check = (name, ok, info) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) fails++;
};
const rel = (x, y) => Math.abs(x - y) / Math.abs(y);
const pct = x => (x * 100).toFixed(4) + '%';

// 1. 装置 A 控制变量比值与组合比值校验
{
  const sBase = MC.simulateA({ mL: 'al', mR: 'al', slotL: 'inner', stepL: 0, stepR: 0, wCrank: 6.0, ideal: true }, 1);
  const sM = MC.simulateA({ mL: 'steel', mR: 'al', slotL: 'inner', stepL: 0, stepR: 0, wCrank: 6.0, ideal: true }, 1);
  const sR = MC.simulateA({ mL: 'al', mR: 'al', slotL: 'outer', stepL: 0, stepR: 0, wCrank: 6.0, ideal: true }, 1);
  const sW21 = MC.simulateA({ mL: 'al', mR: 'al', slotL: 'inner', stepL: 1, stepR: 0, wCrank: 6.0, ideal: true }, 1);
  const sW31 = MC.simulateA({ mL: 'al', mR: 'al', slotL: 'inner', stepL: 2, stepR: 0, wCrank: 6.0, ideal: true }, 1);
  const sComb = MC.simulateA({ mL: 'steel', mR: 'al', slotL: 'outer', stepL: 0, stepR: 1, wCrank: 6.0, ideal: true }, 1);

  const okBase = rel(sBase.divL, 1.0) < 0.001 && rel(sBase.divR, 1.0) < 0.001;
  const okRatios = rel(sM.ratioF, 2.0) < 0.001
    && rel(sR.ratioF, 2.0) < 0.001
    && rel(sW21.ratioF, 0.25) < 0.001
    && rel(sW31.ratioF, 1 / 9) < 0.001
    && rel(sComb.ratioF, 16.0) < 0.001;

  check('1 装置 A 基准与控制变量比值（2.000, 2.000, 0.2500, 1/9, 16.00）误差 < 0.1%',
    okBase && okRatios,
    `base=${sBase.divL.toFixed(3)}, Fm=${sM.ratioF.toFixed(4)}, Fr=${sR.ratioF.toFixed(4)}, 2:1=${sW21.ratioF.toFixed(4)}, 3:1=${sW31.ratioF.toFixed(4)}, comb=${sComb.ratioF.toFixed(3)}`);
}

// 2. 装置 A 误差模型：皮带打滑 E3、手摇不稳 E4、零偏+滞回 E5
{
  const sNoSlip = MC.simulateA({ mL: 'al', mR: 'al', slotL: 'inner', stepL: 0, stepR: 1, wCrank: 6.0, beltSlip: false, ideal: true }, 2);
  const sSlip = MC.simulateA({ mL: 'al', mR: 'al', slotL: 'inner', stepL: 0, stepR: 1, wCrank: 6.0, beltSlip: true, ideal: true }, 2);
  const drop = 1 - sSlip.FL / sNoSlip.FL;
  const dropTheo = 1 - Math.pow(1 - 0.18, 2); // 0.3276

  const stSample = MC.sampleA({ wCrank: 6.0, unsteadyCrank: false, ideal: false }, 25, 11);
  const unSample = MC.sampleA({ wCrank: 6.0, unsteadyCrank: true, ideal: false }, 25, 11);

  const sRestBad = MC.simulateA({ wCrank: 0, scaleBad: true, ideal: true }, 3);
  const sUpBad = MC.simulateA({ wCrank: 6.0, scaleBad: true, motionDir: 'up', ideal: true }, 3);
  const sDnBad = MC.simulateA({ wCrank: 6.0, scaleBad: true, motionDir: 'down', ideal: true }, 3);

  check('2a E3 皮带打滑 (slip=0.18) 向心力偏小 32.76%（误差 < 0.1%）',
    rel(drop, dropTheo) < 0.001,
    `drop=${pct(drop)} vs ${pct(dropTheo)}`);
  check('2b E4 摇动手柄转速不稳 (±22%) 显著增大读数离散度',
    unSample.stdL > 0.20 && unSample.stdL > stSample.stdL * 10,
    `σ_unsteady=${unSample.stdL.toFixed(3)} vs σ_steady=${stSample.stdL.toFixed(4)}`);
  check('2c E5 标尺零偏 (+0.60) 与套筒滞回 (±0.25) 破坏正比并产生 0.50 格滞回差',
    Math.abs(sRestBad.divL - 0.60) < 1e-9 && Math.abs((sDnBad.divL - sUpBad.divL) - 0.50) < 1e-9,
    `rest=${sRestBad.divL.toFixed(2)}, up=${sUpBad.divL.toFixed(2)}, down=${sDnBad.divL.toFixed(2)}`);
}

// 3. 装置 B 数字化拟合（F-ω²、F-1/Δt²、F-m、F-r）与静摩擦 E6
{
  const m = 0.100, r = 0.150, d = 0.0100;
  const rows = MC.sweepB({ m, r, d, ideal: true }, [4, 5, 6, 7, 8, 9, 10], 5);
  const fW2 = MC.fitSensor(rows, 'omega2');
  const fDt = MC.fitSensor(rows, 'invDt2');

  const rowsM = [0.050, 0.100, 0.150].map((mv, i) => MC.simulateB({ m: mv, r, d, w: 6.0, ideal: true }, 10 + i));
  const fM = MC.fitSensor(rowsM, 'm');
  const rowsR = [0.080, 0.120, 0.160, 0.200].map((rv, i) => MC.simulateB({ m, r: rv, d, w: 6.0, ideal: true }, 20 + i));
  const fR = MC.fitSensor(rowsR, 'r');

  const rowsFric = MC.sweepB({ m, r, d, trackFriction: true, ideal: true }, [4, 5, 6, 7, 8, 9, 10], 5);
  const sLowFric = MC.simulateB({ m, r, d, w: 2.0, trackFriction: true, ideal: true }, 5);
  const fFric = MC.fitSensor(rowsFric, 'omega2');
  const w02Theo = MC.F_STATIC / (m * r);

  check('3a 装置 B 理想拟合 F-ω² 与 F-1/Δt² 斜率误差 < 0.1%',
    rel(fW2.k, m * r) < 0.001 && Math.abs(fW2.b) < 1e-9 && rel(fDt.k, m * d * d / r) < 0.001 && rel(fM.k, 36 * r) < 0.001 && rel(fR.k, m * 36) < 0.001,
    `k_w2=${fW2.k.toFixed(5)} vs ${(m * r).toFixed(5)}, k_dt=${fDt.k.toExponential(4)}`);
  check('3b E6 导轨静摩擦产生精确正横截距 fStatic/(mr)=8.0 且斜率 mr 不变',
    sLowFric.F === 0 && rel(fFric.k, m * r) < 0.001 && rel(fFric.xIntercept, w02Theo) < 0.001,
    `k=${fFric.k.toFixed(5)}, xInt=${fFric.xIntercept.toFixed(4)} vs ${w02Theo.toFixed(4)}, F(ω=2)=${sLowFric.F}`);
}

// 4. 2024 海南卷圆盘小圆柱模型校验
{
  const hRes = MC.hainan2024Disk(0.4202, 0.0162, 0.0300, 10, 62.8);
  check('4 hainan2024Disk(0.4202, 0.0162, 0.0300, 10, 62.8) 复现 ω=1.0, F≈6.06×10⁻³ N',
    Math.abs(hRes.w - 1.0) < 0.002 && Math.abs(hRes.r - 0.2020) < 1e-9 && rel(hRes.F, 6.06e-3) < 0.002,
    `T=${hRes.T.toFixed(2)}, ω=${hRes.w.toFixed(4)}, r=${hRes.r.toFixed(4)}, F=${hRes.F.toExponential(3)}`);
}

// 5. content.json 与 questions.json 全量自动核验
{
  const content = JSON.parse(fs.readFileSync(path.join(here, 'content.json'), 'utf8'));
  const qs = JSON.parse(fs.readFileSync(path.join(here, 'questions.json'), 'utf8'));
  const errIds = new Set(content.errors.map(e => e.id));
  const procIds = new Set(content.procedure.map(p => p.id));
  const cBad = [];
  for (const e of content.errors) {
    if (e.noteId && !procIds.has(e.noteId)) cBad.push(`error ${e.id} bad noteId`);
    if (!(e.ask && e.ask.answer >= 0 && e.ask.answer < e.ask.options.length)) cBad.push(`error ${e.id} ask OOB`);
  }
  for (const p of content.procedure) {
    if (p.errorId && !errIds.has(p.errorId)) cBad.push(`proc ${p.id} bad errorId`);
  }
  for (const r of content.reverse) {
    if (r.replay && !errIds.has(r.replay)) cBad.push(`rev ${r.id} bad replay`);
    if (!Array.isArray(r.answer) || r.answer.some(a => a < 0 || a >= r.options.length)) cBad.push(`rev ${r.id} answer OOB`);
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
          const vKeys = Object.keys(pt.vars);
          if (vKeys.some(k => !/^[A-Za-z][A-Za-z0-9_]*$/.test(k))) qBad.push(`${where}: non-ASCII vars key`);
          if (!expr.equal(pt.answer, pt.answer, vKeys)) qBad.push(`${where}: expr self`);
        } catch (e) { qBad.push(`${where}: ${e.message}`); }
      } else if (pt.type === 'plot') {
        const lf = P.linfit(pt.points.map(p => p[0]), pt.points.map(p => p[1]));
        if (Math.abs(lf.k - pt.slope) > pt.tol) qBad.push(`${where}: plot slope ${lf.k} vs ${pt.slope}`);
        if (pt.lineInit) {
          const initK = (pt.lineInit[1][1] - pt.lineInit[0][1]) / (pt.lineInit[1][0] - pt.lineInit[0][0]);
          if (Math.abs(initK - pt.slope) <= pt.tol) qBad.push(`${where}: lineInit slope too close`);
        }
      } else if (pt.type === 'choice' || pt.type === 'text-choice') {
        if (!(pt.answer >= 0 && pt.answer < pt.options.length)) qBad.push(`${where}: choice OOB`);
      } else if (pt.type === 'multi') {
        if (!Array.isArray(pt.answer) || pt.answer.some(a => !(a >= 0 && a < pt.options.length))) qBad.push(`${where}: multi OOB`);
      }
    }
  }

  // 额外校验学生拼式等价性（G1(3), Y3(2), Y5(2), Y6(2)）
  const e1 = expr.equal('m * w ² × ( D − d ) ÷ 2', 'm*w^2*(D-d)/2', ['m', 'w', 'D', 'd']);
  const e2 = expr.equal('m × d ² ÷ ( r × dt ² )', 'm*d^2/(r*dt^2)', ['m', 'd', 'r', 'dt']);
  const e3 = expr.equal('w0 ² × r ÷ g', 'w0^2*r/g', ['w0', 'r', 'g']);
  const e4 = expr.equal('4 × π ² × L × cosTheta ÷ T ²', '4*pi^2*L*cosTheta/T^2', ['L', 'cosTheta', 'T']);

  check('5a content.json 引用完整且 errors ≥ 6、reverse ≥ 4',
    cBad.length === 0 && content.errors.length >= 6 && content.reverse.length >= 4,
    cBad.join('; ') || `errors=${content.errors.length}, reverse=${content.reverse.length}`);
  check('5b questions.json 全题自检（8道、全verified、有效数字/表达式/作图/拼式）',
    qs.length >= 8 && qBad.length === 0 && e1 && e2 && e3 && e4,
    qBad.join('; ') || `共校验 ${qs.length} 题，拼式=${e1 && e2 && e3 && e4}`);
}

console.log(fails ? `\n${fails} 项未通过` : '\n全部通过');
process.exit(fails ? 1 : 0);
