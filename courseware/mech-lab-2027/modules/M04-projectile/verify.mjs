// M04 物理校验与真题自检：node verify.mjs（无依赖）。对应 SPEC §4。
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

const { proj: PR, phys: P, expr, math } = globalThis.ML;
let fails = 0;
const check = (name, ok, info) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) fails++;
};
const rel = (x, y) => Math.abs(x - y) / Math.abs(y);
const pct = x => (x * 100).toFixed(4) + '%';

// 1. 水平抛出轨迹 y = g x² / (2 v₀²) 与 y-x² 线性拟合
{
  const ch = PR.launchChute({ hDrop: 0.20, tiltDeg: 0, ideal: true }, 1);
  const g = ch.g, v0 = ch.v0;
  let maxRelErr = 0;
  const pts = [];
  for (const t of [0.06, 0.12, 0.18, 0.24, 0.30]) {
    const pt = ch.worldAtT(t);
    const yTheo = g * pt.x * pt.x / (2 * v0 * v0);
    maxRelErr = Math.max(maxRelErr, rel(pt.y, yTheo));
    pts.push(pt);
  }
  const an = PR.analyzeOriginPts(pts, g);
  const kTheo = g / (2 * v0 * v0);
  check('1a 水平抛出轨迹 y = g x²/(2v₀²) 误差 < 0.1%',
    maxRelErr < 0.001,
    `maxRelErr=${pct(maxRelErr)}`);
  check('1b y-x² 拟合斜率与初速度恢复误差 < 0.1%',
    rel(an.fit.k, kTheo) < 0.001 && rel(an.v0Fit, v0) < 0.001 && Math.abs(an.fit.b) < 1e-9,
    `k=${an.fit.k.toFixed(4)} vs ${kTheo.toFixed(4)}, v0=${an.v0Fit.toFixed(4)} vs ${v0.toFixed(4)}`);
}

// 2. 等水平间隔三点法 Δy = gT² 与 v_By 解析解比较
{
  const ch = PR.launchChute({ hDrop: 0.18, tiltDeg: 0, ideal: true }, 2);
  const g = ch.g, v0 = ch.v0, t1 = 0.12, Ttrue = 0.06;
  const pA = ch.worldAtT(t1), pB = ch.worldAtT(t1 + Ttrue), pC = ch.worldAtT(t1 + 2 * Ttrue);
  const tri = PR.analyzeThreePts(pA, pB, pC, g, true);
  const vByTrue = g * (t1 + Ttrue);
  check('2a 等水平间距三点法 T、v₀、v_By 误差 < 0.1%',
    rel(tri.T, Ttrue) < 0.001 && rel(tri.v0, v0) < 0.001 && rel(tri.vBy, vByTrue) < 0.001,
    `T=${tri.T.toFixed(5)} vs ${Ttrue}, v0=${tri.v0.toFixed(4)} vs ${v0.toFixed(4)}, vBy=${tri.vBy.toFixed(4)} vs ${vByTrue.toFixed(4)}`);
  check('2b 中段三点误把首点当零速起点的偏差检出（ratio ≠ 3 且 v0Wrong 偏小 > 15%）',
    Math.abs(tri.ratioBC_AB - 3) > 1.0 && (v0 - tri.v0Wrong) / v0 > 0.15,
    `yBC/yAB=${tri.ratioBC_AB.toFixed(2)}, v0Wrong=${tri.v0Wrong.toFixed(3)} vs ${v0.toFixed(3)}`);
}

// 3. 装置 A/B 末端水平 vs 上翘 5° 造成落地时间差与图像偏离
{
  let maxSyncDiff = 0;
  for (const H of [0.60, 0.80, 1.20]) {
    for (const v0 of [1.20, 1.80, 2.50]) {
      const s0 = PR.simulateAB({ H, v0, tiltDeg: 0, ideal: true }, 1);
      maxSyncDiff = Math.max(maxSyncDiff, Math.abs(s0.deltaT));
    }
  }
  const sUp = PR.simulateAB({ H: 0.80, v0: 1.80, tiltDeg: 5, ideal: true }, 1);
  const chUp = PR.launchChute({ tiltDeg: 5, ideal: true }, 1);
  const upPts = [0.05, 0.10, 0.16, 0.22, 0.28].map(t => chUp.worldAtT(t));
  const anUp = PR.analyzeOriginPts(upPts, chUp.g);
  check('3a 装置 A 水平抛出时不同高度与力度均严格同时落地',
    maxSyncDiff < 1e-12,
    `max |tA - tB|=${maxSyncDiff.toExponential(2)} s`);
  check('3b 末端上翘 5° 导致 A 晚于 B 落地且 y-x² 产生明显非零截距',
    sUp.deltaT > 0.015 && Math.abs(anUp.fit.b) > 0.005,
    `tA−tB=+${(sUp.deltaT * 1000).toFixed(2)} ms, y-x² 截距=${(anUp.fit.b * 100).toFixed(2)} cm`);
}

// 4. 坐标原点偏差 R 引起 y-x² 截距 −R（斜率不变、单点公式偏大）
{
  const chRim = PR.launchChute({ originMode: 'rim', ideal: true }, 1);
  const ptsRim = [0.06, 0.12, 0.18, 0.24, 0.32].map(y => chRim.hitAtPlateY(y));
  const anRim = PR.analyzeOriginPts(ptsRim, chRim.g);
  check('4 原点取在槽口下沿 O\'：y-x² 截距等于 −R、斜率求 v₀ 仍准、单点公式偏大',
    Math.abs(anRim.fit.b + PR.BALL_R) < 1e-9 && rel(anRim.v0Fit, chRim.v0) < 0.001 && anRim.v0SingleMean > chRim.v0 * 1.03,
    `b=${(anRim.fit.b * 100).toFixed(3)} cm (−R=${(-PR.BALL_R * 100).toFixed(2)}), v0Fit=${anRim.v0Fit.toFixed(4)}, v0Single=${anRim.v0SingleMean.toFixed(4)}`);
}

// 5. E2 随机高度 vs E6 粗糙斜槽同位置释放 vs E5 背板偏斜
{
  const vRand = [], vRough = [];
  for (let i = 1; i <= 10; i++) {
    vRand.push(PR.launchChute({ randomHeight: true, ideal: true }, 10 + i * 13).v0);
    vRough.push(PR.launchChute({ chuteRough: true, randomHeight: false, ideal: true }, 10 + i * 13).v0);
  }
  const ptsRough = [0.06, 0.12, 0.18, 0.24, 0.30].map(y => PR.launchChute({ chuteRough: true, ideal: true }, 1).hitAtPlateY(y));
  const anRough = PR.analyzeOriginPts(ptsRough, PR.G);
  const ptsTiltBoard = [0.08, 0.14, 0.20, 0.28, 0.36].map(y => PR.launchChute({ plumbCalibrated: false, ideal: false }, 1).hitAtPlateY(y));
  const anTiltBoard = PR.analyzeOriginPts(ptsTiltBoard, PR.G);
  const chNorm = PR.launchChute({ plumbCalibrated: true, ideal: true }, 1);
  check('5a E2 随机高度初速度离散；E6 粗糙斜槽同位置释放完全重合',
    P.std(vRand) > 0.15 && P.std(vRough) < 1e-12 && anRough.fit.r2 > 0.999999,
    `σ随机=${P.std(vRand).toFixed(3)}, σ粗糙同位置=${P.std(vRough).toExponential(2)}, R²=${anRough.fit.r2.toFixed(6)}`);
  check('5b E5 背板未用重锤线调竖直引起 v₀ 明显偏差 (> 5%)',
    rel(anTiltBoard.v0Fit, chNorm.v0) > 0.05,
    `偏斜测得 v0=${anTiltBoard.v0Fit.toFixed(3)} vs 真实 ${chNorm.v0.toFixed(3)} (${pct(rel(anTiltBoard.v0Fit, chNorm.v0))})`);
}

// 6. 2026 北京卷 y/x - x 图像求抛出点坐标验证
{
  const ch = PR.launchChute({ hDrop: 0.20, ideal: true }, 1);
  const g = ch.g, v0 = ch.v0, t0 = 0.10;
  const pOprime = ch.worldAtT(t0);
  const shifted = [0.15, 0.20, 0.25, 0.30, 0.35].map(t => {
    const w = ch.worldAtT(t);
    return { x: w.x - pOprime.x, y: w.y - pOprime.y };
  });
  const res = PR.yxLine(shifted, g);
  check('6 y/x - x 图像反推抛出点 (−b/2k, −b²/4k) 误差 < 0.1%',
    rel(res.x0, -pOprime.x) < 0.001 && rel(res.y0, -pOprime.y) < 0.001 && rel(res.v0, v0) < 0.001,
    `反推(${(res.x0 * 100).toFixed(2)}, ${(res.y0 * 100).toFixed(2)}) cm vs 真值(${(-pOprime.x * 100).toFixed(2)}, ${(-pOprime.y * 100).toFixed(2)}) cm`);
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
  }
  for (const p of content.procedure) {
    if (p.errorId && !errIds.has(p.errorId)) cBad.push(`proc ${p.id} bad errorId`);
  }
  for (const r of content.reverse) {
    if (r.replay && !errIds.has(r.replay)) cBad.push(`rev ${r.id} bad replay`);
  }

  const qBad = [];
  for (const q of qs) {
    if (!q.verified) qBad.push(`${q.id}: verified !== true`);
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
      } else if (pt.type === 'choice' || pt.type === 'text-choice') {
        if (!(pt.answer >= 0 && pt.answer < pt.options.length)) qBad.push(`${where}: choice OOB`);
      } else if (pt.type === 'multi') {
        if (!Array.isArray(pt.answer) || pt.answer.some(a => !(a >= 0 && a < pt.options.length))) qBad.push(`${where}: multi OOB`);
      }
    }
  }
  // 额外校验学生常用快捷拼式（如 - b ÷ 2 k、- b ² ÷ 4 k）
  const g3p4 = expr.equal('- b ÷ 2 k', '-b/(2*k)', ['b', 'k']);
  const g3p5 = expr.equal('- b ² ÷ 4 k', '-b^2/(4*k)', ['b', 'k']);
  check('7a content.json 引用完整且 errors ≥ 6、reverse ≥ 4',
    cBad.length === 0 && content.errors.length >= 6 && content.reverse.length >= 4,
    cBad.join('; ') || `errors=${content.errors.length}, reverse=${content.reverse.length}`);
  check('7b questions.json 全题自检（≥8道、全verified、show/有效数字/表达式/作图）',
    qs.length >= 8 && qBad.length === 0 && g3p4 && g3p5,
    qBad.join('; ') || `共校验 ${qs.length} 题，快捷拼式=${g3p4 && g3p5}`);
}

console.log(fails ? `\n${fails} 项未通过` : '\n全部通过');
process.exit(fails ? 1 : 0);
