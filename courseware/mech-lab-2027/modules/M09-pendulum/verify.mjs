import fs from 'fs';
import path from 'path';
import url from 'url';
import vm from 'vm';

const DIR = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '../..');

global.window = global;
global.ML = global.ML || {};

for (const f of ['math.js', 'physics.js', 'paper.js', 'instruments/gauges-model.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), { filename: f });
}
vm.runInThisContext(fs.readFileSync(path.join(DIR, 'scene.js'), 'utf8'), { filename: 'scene.js' });

const P = global.ML.pendulum;
const M = global.ML.math;
const PH = global.ML.phys;
const EX = global.ML.expr;
const GAU = global.ML.gauges;

let fails = 0;
function ok(name, cond, detail) {
  if (cond) {
    console.log('✓ ' + name + (detail ? ' — ' + detail : ''));
  } else {
    fails++;
    console.error('✗ ' + name + (detail ? ' — ' + detail : ''));
  }
}
function rel(a, b) {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
}

console.log('=== M09 单摆实验物理引擎与题库校验 ===');

// 1. 小摆角 4° RK4 周期偏差 < 0.1%
const sim4 = P.simulatePeriod({ l: 0.80, d: P.STEEL_D, thetaDeg: 4, ideal: true, nCycles: 6 });
const T0_4 = 2 * Math.PI * Math.sqrt(sim4.LTrue / P.G);
const g4 = P.calcG(sim4.LTrue, sim4.T);
ok(
  '小摆角 4° RK4 周期与 2π√(L/g) 偏差 < 0.1%',
  rel(sim4.T, T0_4) < 0.001 && rel(sim4.T, sim4.T0) < 0.001 && rel(g4, P.G) < 0.002,
  `T=${sim4.T.toFixed(5)}s, T0=${T0_4.toFixed(5)}s, 偏差=${(rel(sim4.T, T0_4) * 100).toFixed(4)}%, g=${g4.toFixed(4)}`
);

// 2. 大摆角 35° RK4 周期符合 1 + θ0²/16 增大幅度（与一阶近似 < 0.1%，与四阶椭圆积分 < 0.02%），且按简谐公式算出 g 偏小
const theta35 = 35 * Math.PI / 180;
const sim35 = P.simulatePeriod({ l: 0.80, d: P.STEEL_D, thetaDeg: 35, ideal: true, nCycles: 6 });
const ratio35 = sim35.T / sim35.T0;
const approx35 = 1 + (theta35 * theta35) / 16;
const ellip35 = 1 + (theta35 * theta35) / 16 + (11 * Math.pow(theta35, 4)) / 3072;
const g35 = P.calcG(sim35.LTrue, sim35.T);
ok(
  '大摆角 35° RK4 周期符合 1 + θ0²/16 (<0.1%) 与四阶椭圆积分 (<0.02%) 且 g 偏小',
  rel(ratio35, approx35) < 0.001 && rel(ratio35, ellip35) < 0.0002 && ratio35 > 1.02 && g35 < P.G * 0.96,
  `T/T0=${ratio35.toFixed(6)}, 一阶=${approx35.toFixed(6)}, 四阶=${ellip35.toFixed(6)}, 四阶偏差=${(rel(ratio35, ellip35) * 100).toFixed(4)}%, g=${g35.toFixed(4)}`
);

// 3. 把按下停表误记为第 1 次：(n-1) 误记为 n，g测 / g真 = (n/(n-1))²
const trialMis = P.measureTrial({
  l: 0.80,
  d: P.STEEL_D,
  thetaDeg: 4,
  nMeasured: 30,
  countOffset: -1,
  timingPos: 'low',
  LMode: 'l+r',
  ideal: true,
  roundStopwatch: false
});
const gRatioMis = trialMis.g / P.G;
const expectMis = Math.pow(30 / 29, 2);
ok(
  '(n-1) 误记为 n 时 g测/g真 = (n/(n-1))²',
  trialMis.nMeasured === 30 && trialMis.nTrue === 29 && rel(gRatioMis, expectMis) < 0.001,
  `g测=${trialMis.g.toFixed(4)}, 比值=${gRatioMis.toFixed(5)}, 理论(30/29)²=${expectMis.toFixed(5)}`
);

// 4. 漏加球半径 l 时单组 g 偏小，5 组 L-T² 拟合斜率求出 g 与真实 g 偏差 < 0.2%
const ls = [0.50, 0.65, 0.80, 0.95, 1.10];
const rowsMissingR = ls.map(function (l) {
  const s = P.simulatePeriod({ l: l, d: P.STEEL_D, thetaDeg: 4, ideal: true, nCycles: 6 });
  return { L: P.recordedLength(l, P.STEEL_D, 'l'), T: s.T };
});
const gSingleMissingR = P.calcG(rowsMissingR[0].L, rowsMissingR[0].T);
const fitMissingR = P.fitLT2(rowsMissingR);
ok(
  '漏加球半径单组 g 偏小，5 组 L-T² 拟合斜率求 g 偏差 < 0.2%',
  gSingleMissingR < P.G * 0.99 && rel(fitMissingR.gFit, P.G) < 0.002 && fitMissingR.b < -0.005 && fitMissingR.r2 > 0.9999,
  `单组(0.50m)g=${gSingleMissingR.toFixed(4)}, 拟合g=${fitMissingR.gFit.toFixed(4)}, 截距b=${fitMissingR.b.toFixed(5)}m, 偏差=${(rel(fitMissingR.gFit, P.G) * 100).toFixed(4)}%`
);

// 5. 拉力传感器 F-t 每周期 2 个拉力峰值（相邻波峰间距 = T/2）
const sim8 = P.simulatePeriod({ l: 0.80, d: P.STEEL_D, thetaDeg: 8, ideal: true, nCycles: 6 });
const trace = P.simulateTrace({ l: 0.80, d: P.STEEL_D, thetaDeg: 8, ideal: true }, 6.0, 1 / 240);
const peakIntervals = [];
for (let i = 1; i < trace.peaks.length; i++) {
  peakIntervals.push(trace.peaks[i].t - trace.peaks[i - 1].t);
}
const avgHalfT = peakIntervals.reduce((a, b) => a + b, 0) / peakIntervals.length;
ok(
  '拉力传感器 F-t 每周期 2 个峰值（峰间距 = T/2）',
  trace.peaks.length >= 6 && rel(avgHalfT, sim8.T / 2) < 0.004 && rel(trace.T_fromPeaks, sim8.T) < 0.004,
  `峰值数=${trace.peaks.length}, 峰间距=${avgHalfT.toFixed(4)}s, T/2=${(sim8.T / 2).toFixed(4)}s, T_peak=${trace.T_fromPeaks.toFixed(4)}s`
);

// 6. 误差机理附加校验：E1 最高点散度 > 最低点、E4 悬点松动 T 变大、E6 泡沫球阻尼与周期变大、游标卡尺判定
function stdDev(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, x) => s + (x - mean) * (x - mean), 0) / arr.length);
}
const timesLow = [];
const timesHigh = [];
for (let seed = 1; seed <= 20; seed++) {
  timesLow.push(P.measureTrial({ l: 0.80, d: P.STEEL_D, thetaDeg: 4, nMeasured: 30, timingPos: 'low', ideal: false, seed: seed, roundStopwatch: false }).totalTime);
  timesHigh.push(P.measureTrial({ l: 0.80, d: P.STEEL_D, thetaDeg: 4, nMeasured: 30, timingPos: 'high', ideal: false, seed: seed, roundStopwatch: false }).totalTime);
}
ok(
  'E1 最高点计时离散度显著大于最低点',
  stdDev(timesHigh) > stdDev(timesLow) * 2.5,
  `σ_low=${stdDev(timesLow).toFixed(4)}s, σ_high=${stdDev(timesHigh).toFixed(4)}s`
);

const simLoose = P.simulatePeriod({ l: 0.80, d: P.STEEL_D, thetaDeg: 4, pivot: 'loose', ideal: false, nCycles: 6 });
ok(
  'E4 悬点松动有效摆长变大、周期变长',
  simLoose.T > sim4.T && P.calcG(sim4.LTrue, simLoose.T) < P.G,
  `T_loose=${simLoose.T.toFixed(4)}s > T_clamp=${sim4.T.toFixed(4)}s`
);

const traceFoam = P.simulateTrace({ l: 0.80, bob: 'foam', thetaDeg: 10, ideal: false }, 8.0, 1 / 120);
const maxAmpStart = Math.max(...traceFoam.samples.slice(0, 180).map((s) => Math.abs(s.theta)));
const maxAmpEnd = Math.max(...traceFoam.samples.slice(-180).map((s) => Math.abs(s.theta)));
ok(
  'E6 泡沫球受空气阻力振幅明显衰减且周期略增',
  maxAmpEnd < maxAmpStart * 0.92 && traceFoam.params.gEff < P.G,
  `初段最大角=${(maxAmpStart * 180 / Math.PI).toFixed(2)}°, 末段=${(maxAmpEnd * 180 / Math.PI).toFixed(2)}°, gEff=${traceFoam.params.gEff.toFixed(4)}`
);

const calCheck = GAU.caliper.diagnose('19.0', 19.0, { div: 10, unit: 'mm' });
ok('游标卡尺 19.0 mm 读数诊断通过', !!calCheck.ok, JSON.stringify(calCheck));

// 7. content.json & questions.json 全题自检
const content = JSON.parse(fs.readFileSync(path.join(DIR, 'content.json'), 'utf8'));
const questions = JSON.parse(fs.readFileSync(path.join(DIR, 'questions.json'), 'utf8'));

const errIds = new Set((content.errors || []).map((e) => e.id));
ok('content.json errors>=6 且 reverse>=4', (content.errors || []).length >= 6 && (content.reverse || []).length >= 4,
  `errors=${(content.errors || []).length}, reverse=${(content.reverse || []).length}`);

ok('questions.json 题目总数 >= 8 且全部 verified', questions.length >= 8 && questions.every((q) => q.verified === true),
  `total=${questions.length}`);

for (const q of questions) {
  let qOk = true;
  let why = '';
  if (!q.id || !q.source || !q.stem || !Array.isArray(q.parts) || !q.parts.length || !(q.explain || q.parts.every((p) => p.explain))) {
    qOk = false;
    why = '缺少核心字段';
  }
  if (q.replay && q.replay.err && !errIds.has(q.replay.err)) {
    qOk = false;
    why = 'replay.err 不在 content.errors 中: ' + q.replay.err;
  }
  for (let pi = 0; pi < (q.parts || []).length; pi++) {
    const pt = q.parts[pi];
    if (pt.replay && !errIds.has(pt.replay)) {
      qOk = false;
      why = `part ${pi} replay=${pt.replay} 不在 content.errors 中`;
      break;
    }
    if (pt.type === 'numeric') {
      if (pt.show === undefined) {
        qOk = false;
        why = `part ${pi} numeric 缺少 show`;
        break;
      }
      const num = M.parseNum(String(pt.show));
      const tol = pt.tol === undefined ? 0 : pt.tol;
      if (isNaN(num) || Math.abs(num - pt.answer) > tol + 1e-12) {
        qOk = false;
        why = `part ${pi} show=${pt.show} (${num}) 与 answer=${pt.answer}±${tol} 不匹配`;
        break;
      }
      if (pt.sig !== undefined && M.countSig(String(pt.show)) !== pt.sig) {
        qOk = false;
        why = `part ${pi} show=${pt.show} 有效数字=${M.countSig(String(pt.show))} != sig=${pt.sig}`;
        break;
      }
    } else if (pt.type === 'expr') {
      const varsArg = Array.isArray(pt.vars) ? pt.vars : Object.keys(pt.vars || {});
      if (!EX.equal(String(pt.answer), String(pt.answer), varsArg)) {
        qOk = false;
        why = `part ${pi} answer=${pt.answer} 自判失败`;
        break;
      }
      for (const acc of pt.accept || []) {
        if (!EX.equal(String(acc), String(pt.answer), varsArg)) {
          qOk = false;
          why = `part ${pi} accept=${acc} 与 answer=${pt.answer} 不等价`;
          break;
        }
      }
      if (!qOk) break;
    } else if (pt.type === 'choice' || pt.type === 'text-choice') {
      if (!Array.isArray(pt.options) || !Number.isInteger(pt.answer) || pt.answer < 0 || pt.answer >= pt.options.length) {
        qOk = false;
        why = `part ${pi} choice answer=${pt.answer} 越界`;
        break;
      }
    } else if (pt.type === 'multi') {
      if (!Array.isArray(pt.options) || !Array.isArray(pt.answer) || !pt.answer.length || pt.answer.some((idx) => !Number.isInteger(idx) || idx < 0 || idx >= pt.options.length)) {
        qOk = false;
        why = `part ${pi} multi answer=${JSON.stringify(pt.answer)} 无效`;
        break;
      }
    } else if (pt.type === 'plot') {
      const pts = pt.points || [];
      const xRange = pt.x || [];
      const yRange = pt.y || [];
      if (pts.length < 4 || !(xRange[1] > xRange[0]) || !(yRange[1] > yRange[0])) {
        qOk = false;
        why = `part ${pi} plot 坐标或点数无效`;
        break;
      }
      const inRange = pts.every(([x, y]) => x >= xRange[0] && x <= xRange[1] && y >= yRange[0] && y <= yRange[1]);
      const fit = PH.linfit(pts.map((p) => p[0]), pts.map((p) => p[1]));
      const slopeKey = fit.k !== undefined ? fit.k : (fit.m !== undefined ? fit.m : fit.slope);
      const li = pt.lineInit || [];
      const initSlope = li.length === 2 && li[1][0] !== li[0][0] ? (li[1][1] - li[0][1]) / (li[1][0] - li[0][0]) : NaN;
      const initOut = isFinite(initSlope) && Math.abs(initSlope - pt.slope) > (pt.tol || 0.1);
      if (!inRange || Math.abs(slopeKey - pt.slope) > (pt.tol || 0.1) || !initOut) {
        qOk = false;
        why = `part ${pi} plot fitSlope=${slopeKey} initSlope=${initSlope} vs slope=${pt.slope}±${pt.tol}`;
        break;
      }
    } else {
      qOk = false;
      why = `part ${pi} 未知 type=${pt.type}`;
      break;
    }
  }
  ok(`题 ${q.id} (${q.source})`, qOk, why || `${q.parts.length} 空自检通过`);
}

console.log(fails ? '\n' + fails + ' 项未通过' : '\n全部通过');
process.exit(fails ? 1 : 0);
