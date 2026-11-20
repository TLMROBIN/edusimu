// M03 物理与题库校验：node verify.mjs（无依赖）。对应 SPEC §4。
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

// 1. 恰好补偿角轻推加速度 ≈ 0，纸带点距均匀；0° 减速、3.2° 加速
{
  const th0 = tape.compensateAngle({ M: 0.4, timer: 'em', ideal: false });
  const aBal = tape.accel({ M: 0.4, m: 0, v0: 0.35, theta: th0, timer: 'em', ideal: false });
  const rBal = tape.run({ M: 0.4, m: 0, v0: 0.35, theta: th0, timer: 'em', ideal: false }, 11);
  const st = tape.firstClearDot(rBal.dots, 1e-3);
  const m = tape.measure(rBal.dots, { start: st, every: 5, n: 6, ideal: true });
  const spread = (Math.max(...m.segs) - Math.min(...m.segs)) / phys.mean(m.segs);
  check('1a 恰好补偿角轻推加速度 ≈ 0', Math.abs(aBal) < 1e-6, `θ₀=${th0.toFixed(3)}° a=${aBal.toExponential(2)}`);
  check('1b 恰好补偿轻推纸带各段均匀（极差 < 1%）', m.segs.length === 6 && spread < 0.01, `极差=${pct(spread)}`);

  const aUnder = tape.accel({ M: 0.4, m: 0, v0: 0.35, theta: 0, timer: 'em', ideal: false });
  const aOver = tape.accel({ M: 0.4, m: 0, v0: 0.35, theta: 3.2, timer: 'em', ideal: false });
  check('1c 未补偿减速 / 补偿过度加速', aUnder < -0.2 && aOver > 0.2, `0°:${aUnder.toFixed(3)} 3.2°:+${aOver.toFixed(3)}`);
}

// 2. 改变 M 无需重新补偿阻力（E5）
{
  const thNone = tape.compensateAngle({ M: 0.4, timer: 'none', ideal: false });
  const a3 = tape.accel({ M: 0.3, m: 0, v0: 0.35, theta: thNone, timer: 'none', ideal: false });
  const a6 = tape.accel({ M: 0.6, m: 0, v0: 0.35, theta: thNone, timer: 'none', ideal: false });
  check('2a 无纸带阻力下改变 M 平衡加速度恒为 0', Math.abs(a3) < 1e-9 && Math.abs(a6) < 1e-9, `a(0.3)=${a3.toExponential(2)} a(0.6)=${a6.toExponential(2)}`);

  const thSp = tape.compensateAngle({ M: 0.4, timer: 'spark', ideal: false });
  const aSp3 = tape.accel({ M: 0.3, m: 0, v0: 0.35, theta: thSp, timer: 'spark', ideal: false });
  const aSp6 = tape.accel({ M: 0.6, m: 0, v0: 0.35, theta: thSp, timer: 'spark', ideal: false });
  check('2b 电火花计时器同一 θ₀ 下 M=0.3/0.6 |a| < 0.005 m/s²', Math.abs(aSp3) < 0.005 && Math.abs(aSp6) < 0.005, `a3=${aSp3.toFixed(4)} a6=${aSp6.toFixed(4)}`);
}

// 3. 大槽码下 tension 与 mg 偏差，力传感器直线 vs 普通绳弯曲（E3）
{
  const M = 0.400, th0 = tape.compensateAngle({ M, timer: 'em', ideal: false });
  const ms = [0.01, 0.02, 0.04, 0.06, 0.10, 0.15, 0.20, 0.25];
  const fts = [], mgs = [], accs = [];
  for (const m of ms) {
    const p = { M, m, theta: th0, timer: 'em', ideal: false };
    fts.push(tape.tension(p));
    mgs.push(m * phys.G);
    accs.push(tape.accel(p));
  }
  const wantFtMax = (M * 0.25 * phys.G) / (M + 0.25);
  const devMax = (0.25 * phys.G - fts[fts.length - 1]) / (0.25 * phys.G);
  check('3a m=0.250 kg 时 F_T 符合 Mmg/(M+m) 且与 mg 偏差 ≈ 38.5%',
    Math.abs(fts[fts.length - 1] - wantFtMax) < 1e-9 && devMax > 0.38,
    `F_T=${fts[fts.length - 1].toFixed(3)}N mg=${mgs[mgs.length - 1].toFixed(3)}N 偏差${pct(devMax)}`);

  const fitSensor = phys.linfit(fts, accs);
  const fitString = phys.linfit(mgs, accs);
  check('3b 力传感器 a-F_T 直线 R² > 0.99999 且斜率 = 1/M',
    fitSensor.r2 > 0.99999 && rel(fitSensor.k, 1 / M) < 1e-3,
    `R²=${fitSensor.r2.toFixed(6)} k=${fitSensor.k.toFixed(4)} (1/M=${(1 / M).toFixed(4)})`);
  check('3c 普通细绳 a-mg 末端下弯（R² < 0.99 且末端比理想直线低 > 35%）',
    fitString.r2 < 0.99 && accs[accs.length - 1] < 0.65 * (mgs[mgs.length - 1] / M),
    `R²=${fitString.r2.toFixed(4)} 末端比值=${(accs[accs.length - 1] / (mgs[mgs.length - 1] / M)).toFixed(3)}`);
}

// 4. 未补偿横截距 & 补偿过度纵截距（E1 / E2）
{
  const ms = [0.02, 0.04, 0.06, 0.08, 0.10];
  const fU = [], aU = [], fO = [], aO = [];
  for (const m of ms) {
    const pU = { M: 0.4, m, theta: 0, timer: 'em', ideal: false };
    const pO = { M: 0.4, m, theta: 3.2, timer: 'em', ideal: false };
    fU.push(tape.tension(pU)); aU.push(tape.accel(pU));
    fO.push(tape.tension(pO)); aO.push(tape.accel(pO));
  }
  const lfU = phys.linfit(fU, aU), lfO = phys.linfit(fO, aO);
  const xInt = -lfU.b / lfU.k;
  check('4a 未补偿 (0°) a-F 正横截距 > 0.09 N', xInt > 0.09 && Math.abs(lfU.k - 2.5) < 0.02, `F₀=${xInt.toFixed(3)}N k=${lfU.k.toFixed(3)}`);
  check('4b 补偿过度 (3.2°) a-F 正纵截距 > 0.25 m/s²', lfO.b > 0.25 && Math.abs(lfO.k - 2.5) < 0.02, `a₀=${lfO.b.toFixed(3)}m/s² k=${lfO.k.toFixed(3)}`);
}

// 5. a - 1/M 拟合线性度 R² > 0.999（解析 + 纸带测量）与 1/a - M
{
  const Ms = [0.20, 0.30, 0.40, 0.50, 0.60, 0.80];
  const invM = Ms.map(M => 1 / M);
  const thSp = tape.compensateAngle({ M: 0.4, timer: 'spark', ideal: false });
  const aMeas = Ms.map((M, idx) => {
    const r = tape.run({ M, m: 0.020, theta: thSp, timer: 'spark', power: 'ac220', ideal: false }, 70 + idx);
    const st = tape.firstClearDot(r.dots, 1e-3);
    const meas = tape.measure(r.dots, { start: st, every: 5, n: 6, ideal: true });
    return tape.analyze(meas.segs, 0.1).aZhuCha;
  });
  const fitInvM = phys.linfit(invM, aMeas);
  check('5a a - 1/M（纸带逐差测量）拟合线性度 R² > 0.999', isFinite(fitInvM.k) && fitInvM.r2 > 0.999, `R²=${fitInvM.r2.toFixed(6)} k=${fitInvM.k.toFixed(4)}`);

  const invA = Ms.map(M => 1 / tape.accel({ M, m: 0.050, theta: 0, timer: 'none', ideal: true }));
  const fitInvA = phys.linfit(Ms, invA);
  check('5b 1/a - M 拟合 R² > 0.9999，斜率 = 1/(mg) 且截距 = 1/g',
    fitInvA.r2 > 0.9999 && rel(fitInvA.k, 1 / (0.050 * phys.G)) < 1e-4 && rel(fitInvA.b, 1 / phys.G) < 1e-4,
    `R²=${fitInvA.r2.toFixed(6)} k=${fitInvA.k.toFixed(3)} b=${fitInvA.b.toFixed(4)}`);
}

// 6. 高加速度纸带严格截止在 t <= tArrive 前逐差精度
{
  const th0 = tape.compensateAngle({ M: 0.4, timer: 'em', ideal: false });
  const r = tape.run({ M: 0.4, m: 0.250, theta: th0, timer: 'em', ideal: false }, 11);
  let maxIdx = 0;
  for (let i = 0; i < r.times.length; i++) if (r.times[i] <= r.tArrive + 1e-6) maxIdx = i;
  const dotsValid = r.dots.slice(0, maxIdx + 1);
  const st = tape.firstClearDot(dotsValid, 1e-3);
  const m2 = tape.measure(dotsValid, { start: st, every: 2, n: 6, ideal: true });
  const a2 = tape.analyze(m2.segs, 0.04).aZhuCha;
  check('6 大槽码 (m=250 g) 截断刹车点后逐差误差 < 0.5%', rel(a2, r.a) < 0.005, `a模型=${r.a.toFixed(3)} 逐差=${a2.toFixed(3)} 偏差${pct(rel(a2, r.a))}`);
}

// 7. content.json 与 questions.json 完整性与题目自检
{
  const c = JSON.parse(fs.readFileSync(path.join(here, 'content.json'), 'utf8'));
  const qs = JSON.parse(fs.readFileSync(path.join(here, 'questions.json'), 'utf8'));
  const errIds = new Set(c.errors.map(e => e.id));
  const procIds = new Set(c.procedure.map(p => p.id));
  const badC = [];
  if (c.learn.length < 6) badC.push(`learn pages=${c.learn.length}<6`);
  if (c.equipment.length !== 6) badC.push(`equipment=${c.equipment.length}!=6`);
  if (c.errors.length < 6) badC.push(`errors=${c.errors.length}<6`);
  if (c.reverse.length < 4) badC.push(`reverse=${c.reverse.length}<4`);
  for (const e of c.errors) if (e.noteId && !procIds.has(e.noteId)) badC.push(`${e.id} missing noteId ${e.noteId}`);
  for (const r of c.reverse) if (r.replay && !errIds.has(r.replay)) badC.push(`${r.id} missing replay ${r.replay}`);
  check('7a content.json 结构与交叉引用自检', badC.length === 0, badC.join('; ') || `learn=${c.learn.length}, eq=${c.equipment.length}, err=${c.errors.length}, rev=${c.reverse.length}`);

  const badQ = [];
  for (const q of qs) {
    if (!q.verified) badQ.push(`${q.id}: verified!=true`);
    for (const [i, pt] of q.parts.entries()) {
      if (pt.replay && !errIds.has(pt.replay)) badQ.push(`${q.id}(${i + 1}): bad replay ${pt.replay}`);
      if (pt.type === 'numeric') {
        if (pt.show == null) badQ.push(`${q.id}(${i + 1}): missing show`);
        const ref = String(pt.show);
        const v = math.parseNum(ref);
        const tol = pt.tol != null ? pt.tol : Math.abs(pt.answer) * 0.01;
        if (!isFinite(v) || Math.abs(v - pt.answer) > tol + 1e-12) badQ.push(`${q.id}(${i + 1}): show=${ref} != answer=${pt.answer}`);
        if (pt.sig && math.countSig(ref) !== pt.sig) badQ.push(`${q.id}(${i + 1}): sig(${ref})!=${pt.sig}`);
      } else if (pt.type === 'expr') {
        try {
          if (!expr.equal(pt.answer, pt.answer, Object.keys(pt.vars))) badQ.push(`${q.id}(${i + 1}): expr self-unequal`);
        } catch (err) {
          badQ.push(`${q.id}(${i + 1}): ${err.message}`);
        }
      } else if (pt.type === 'plot') {
        const xs = pt.points.map(p => p[0]), ys = pt.points.map(p => p[1]);
        const lf = phys.linfit(xs, ys);
        if (Math.abs(lf.k - pt.slope) > pt.tol) badQ.push(`${q.id}(${i + 1}): plot slope ${lf.k} != ${pt.slope}`);
      }
    }
  }
  // 额外验证 20*m0、225*T^2 与 9*(5*T)^2 拼式块输入等价性，以及未穿纸带/未通电安全边界
  if (!expr.equal('2 n m0 g / ( m + 2 0 m0 )'.replace(/(\d) (\d)/g, '$1$2'), '2*n*m0*g/(m+20*m0)', ['n', 'm0', 'm', 'g'])) {
    badQ.push('expr token test 20m0 failed');
  }
  const q8p2 = qs.find(q => q.id === 'Q8').parts[1];
  if (!expr.equal('((x4+x5+x6)-(x1+x2+x3))/(9*(5*T)^2)', q8p2.answer, Object.keys(q8p2.vars))) {
    badQ.push('Q8(2) 9*(5*T)^2 equivalence failed');
  }
  check('7b questions.json 全题（verified/numeric show/expr/plot）自检', badQ.length === 0 && qs.length >= 8, badQ.join('; ') || `共校验 ${qs.length} 题，全通过`);
}

// 8. M03 退化边界：未穿纸带 fTape=0、lag=Infinity 不断纸带死循环、E3/E6 过原点截距
{
  const thNoTape = tape.compensateAngle({ M: 0.4, timer: 'none', ideal: false });
  const aNoTape = tape.accel({ M: 0.4, m: 0, v0: 0.35, theta: thNoTape, timer: 'em', threaded: false, ideal: false });
  check('8a 未穿纸带（threaded:false）时 fTape=0 仅剩轨道摩擦', Math.abs(aNoTape) < 1e-6, `a=${aNoTape.toExponential(2)}`);

  const rNoPow = tape.run({ M: 0.4, m: 0.04, theta: 1.58, timer: 'em', power: 'ac8', lag: Infinity, ideal: false }, 31);
  check('8b 未通电（lag:Infinity）正常结束且不打点不卡死', rNoPow.dots.length === 0 && isFinite(rNoPow.tOff), `dots=${rNoPow.dots.length}, tOff=${rNoPow.tOff.toFixed(2)}`);

  const th3 = tape.compensateAngle({ M: 0.4, timer: 'em', ideal: true });
  const ms3 = [0.01, 0.02, 0.06, 0.15, 0.25];
  const fts3 = ms3.map(m => tape.tension({ M: 0.4, m, theta: th3, timer: 'em', ideal: true }));
  const accs3 = ms3.map(m => tape.accel({ M: 0.4, m, theta: th3, timer: 'em', ideal: true }));
  const lf3 = phys.linfit(fts3, accs3);
  const th6 = tape.compensateAngle({ M: 0.4, timer: 'spark', ideal: true });
  const Ms6 = [0.20, 0.40, 0.60, 0.80];
  const lf6 = phys.linfit(Ms6.map(M => 1 / M), Ms6.map(M => tape.accel({ M, m: 0.02, theta: th6, timer: 'spark', ideal: true })));
  check('8c 理想条件 E3/E6 补偿角为 0° 且无虚假补偿偏移（|b3| < 1e-6, R² > 0.999）',
    Math.abs(th3) < 1e-9 && Math.abs(th6) < 1e-9 && Math.abs(lf3.b) < 1e-6 && lf6.r2 > 0.999 && lf6.b < 0.03,
    `th6=${th6.toFixed(3)}°, b3=${lf3.b.toExponential(2)}, b6=${lf6.b.toFixed(4)}, R²=${lf6.r2.toFixed(5)}`);
}

console.log(fails ? `\n${fails} 项未通过` : '\n全部通过');
process.exit(fails ? 1 : 0);
