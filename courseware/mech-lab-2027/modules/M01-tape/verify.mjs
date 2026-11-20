// M01 物理校验：node verify.mjs（无依赖）。对应 SPEC §5。
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const core = path.join(here, '..', '..', 'core');
for (const f of ['math.js', 'physics.js', 'paper.js', 'instruments/tape-model.js']) vm.runInThisContext(fs.readFileSync(path.join(core, f), 'utf8'), { filename: f });
const { tape, phys, expr, math } = globalThis.ML;
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); if (!ok) fails++; };
const rel = (x, y) => Math.abs(x - y) / Math.abs(y);
const pct = x => (x * 100).toFixed(3) + '%';

// 1 理想：逐差与 v-t 斜率
{
  const r = tape.run({ ideal: true }, 1);
  const start = tape.firstClearDot(r.dots, 1e-3);
  const m = tape.measure(r.dots, { start, every: 5, n: 6, ideal: true });
  const an = tape.analyze(m.segs, 5 * r.T0);
  check('1a 理想逐差 a 偏差 < 0.5%', rel(an.aZhuCha, r.a) < 0.005, `a模型=${r.a.toFixed(4)} 逐差=${an.aZhuCha.toFixed(4)} 偏差${pct(rel(an.aZhuCha, r.a))}`);
  check('1b 理想 v-t 斜率偏差 < 0.5%', rel(an.fit.k, r.a) < 0.005, `斜率=${an.fit.k.toFixed(4)}`);
  check('1c 6 段齐全', m.segs.length === 6, `段数=${m.segs.length}`);
}
// 2 同一起点 vs 逐段
{
  const A = [], B = [];
  for (let s = 1; s <= 200; s++) {
    const r = tape.run({}, s); const start = tape.firstClearDot(r.dots, 1e-3);
    A.push(tape.analyze(tape.measure(r.dots, { start, n: 6, method: 'origin', seed: s * 3 }).segs, 0.1).aZhuCha);
    B.push(tape.analyze(tape.measure(r.dots, { start, n: 6, method: 'segment', seed: s * 3 }).segs, 0.1).aZhuCha);
  }
  check('2 同一起点 a 的标准差 < 逐段', phys.std(A) < phys.std(B), `σ同一起点=${phys.std(A).toFixed(4)} σ逐段=${phys.std(B).toFixed(4)}`);
}
// 3 先释放后通电
{
  const ok = tape.run({}, 2), bad = tape.run({ order: 'release-first' }, 2);
  check('3 先释放后通电：首点已运动、点数更少', bad.v(bad.tPower) > 0 && bad.dots.length < ok.dots.length, `首点速度=${bad.v(bad.tPower).toFixed(3)} 点数 ${bad.dots.length} vs ${ok.dots.length}`);
}
// 4 T 取错
{
  const r = tape.run({ ideal: true }, 1); const m = tape.measure(r.dots, { start: tape.firstClearDot(r.dots), ideal: true });
  const ratio = tape.analyze(m.segs, 0.02).aZhuCha / tape.analyze(m.segs, 0.1).aZhuCha;
  check('4 T 取 0.02 s → a 为 25 倍', Math.abs(ratio - 25) < 0.025, `比值=${ratio.toFixed(4)}`);
}
// 5 频率 51 Hz 按 50 Hz 计算
{
  const r = tape.run({ ideal: true, freq: 51 }, 1); const m = tape.measure(r.dots, { start: tape.firstClearDot(r.dots), ideal: true });
  const ratio = tape.analyze(m.segs, 0.1).aZhuCha / r.a, want = (50 / 51) ** 2;
  check('5 51 Hz 按 50 Hz 计算 → a 偏小 (50/51)²', rel(ratio, want) < 0.005, `比值=${ratio.toFixed(4)} 理论=${want.toFixed(4)}`);
}
// 6 光电门
{
  const n = tape.photogate({}, 0.002), w = tape.photogate({}, 0.030);
  check('6a d=2mm 两种算法偏差 < 0.5%', rel(n.a1, n.a) < 0.005 && rel(n.a2, n.a) < 0.005, `a=${n.a.toFixed(4)} a1=${n.a1.toFixed(4)} a2=${n.a2.toFixed(4)}`);
  check('6b d=30mm (v2−v1)/t 偏小 > 1%，v²法 < 0.5%', w.a2 < w.a && rel(w.a2, w.a) > 0.01 && rel(w.a1, w.a) < 0.005, `a1=${w.a1.toFixed(4)} a2=${w.a2.toFixed(4)} 偏差${pct(rel(w.a2, w.a))}`);
}
// 7 补偿阻力误区
{
  const th = tape.compensateAngle({});
  const p = { theta: th }, want = 0.05 * phys.G / 0.45;
  check('7a 恰好补偿时 a = mg/(M+m)', rel(tape.accel(p), want) < 1e-4, `θ=${th.toFixed(3)}° a=${tape.accel(p).toFixed(4)}`);
  const r = tape.run({ timer: 'em', ideal: false }, 5);
  const noJ = r.dots.slice(); // 去掉抖动看 Δx：用 s(t) 直接采样
  const st = tape.firstClearDot(r.dots, 1e-3), T = 0.1, segs = [];
  for (let i = 0; i < 6; i++) segs.push(r.s(r.times[st] + (i + 1) * T) - r.s(r.times[st] + i * T));
  const dx = segs.slice(1).map((x, i) => x - segs[i]);
  const spread = (Math.max(...dx) - Math.min(...dx)) / phys.mean(dx);
  check('7b 有阻力不补偿时 Δx 仍恒定（极差 < 1%）', spread < 0.01, `Δx 相对极差=${pct(spread)}; 点数 ${noJ.length}`);
}
// 8 电源与边界防护
{
  const a = tape.run({ power: 'dc8' }, 1), b = tape.run({ timer: 'spark', power: 'ac8' }, 1), c = tape.run({ power: 'ac220' }, 1), d = tape.run({ timer: 'spark', power: 'ac220' }, 1);
  const noPow = tape.run({ order: 'power-first', lag: Infinity, m: 0.05 }, 1);
  const stuck = tape.run({ m: 0.01, caught: false }, 1);
  check('8 直流/电火花8V 无点；电磁220V 阻止；电火花220V 正常；断电不死循环；拉不动不误标 E7',
    a.dots.length === 0 && b.dots.length === 0 && c.power.blocked && d.dots.length > 40 &&
    noPow.dots.length === 0 && !stuck.moving && !stuck.tags.includes('E7'),
    `电火花220V 点数=${d.dots.length}`);
}
// 9 表达式解析器（隐式乘法优先级与 sqrt）
{
  check('9a x2 ÷ 2 T 等价于 x2/(2*T)', expr.equal('x2 ÷ 2 T', 'x2/(2*T)', ['x2', 'T']));
  check('9b (x6 − x4) ÷ 10 T 等价于 (x6-x4)/(10*T)', expr.equal('( x6 − x4 ) ÷ 10 T', '(x6-x4)/(10*T)', ['x4', 'x6', 'T']));
  check('9c 逐差式 225 T² 等价性', expr.equal('((x4+x5+x6)-(x1+x2+x3)) ÷ 225 T²', '((x4+x5+x6)-(x1+x2+x3))/(225*T^2)', ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'T']));
  check('9d 显式 * 仍保持左结合', expr.equal('x2 / 2 * T', '(x2/2)*T', ['x2', 'T']) && !expr.equal('x2 / 2 * T', 'x2/(2*T)', ['x2', 'T']));
  check('9e sqrt 解析求值正确', expr.equal('x * √( g ÷ 2 y )', 'x*sqrt(g/(2*y))', ['x', 'g', 'y']));
}
// 10 E4 密集点方差与真题数值/表达式自检
{
  const A = [], B = [];
  for (let s = 1; s <= 20; s++) {
    const rr = tape.run({ ideal: false }, 100 + s), st0 = tape.firstClearDot(rr.dots, 1e-3);
    const ga = tape.analyze(tape.measure(rr.dots, { start: st0, every: 5, n: 6, seed: s * 7 }).segs, 0.1);
    const ba = tape.analyze(tape.measure(rr.dots, { start: Math.max(0, st0 - 3 - ((s * 7) % 10)), every: 5, n: 6, seed: s * 7 }).segs, 0.1);
    A.push(ga.aZhuCha); B.push(ba.aZhuCha);
  }
  check('10a E4 从密集点取 O 的 a 标准差 > 清晰点', phys.std(B) > phys.std(A) * 2, `σ清晰=${phys.std(A).toFixed(4)} σ密集=${phys.std(B).toFixed(4)}`);

  const qs = JSON.parse(fs.readFileSync(path.join(here, 'questions.json'), 'utf8'));
  let qBad = [];
  for (const q of qs) {
    if (!q.verified) continue;
    for (const [i, pt] of q.parts.entries()) {
      if (pt.type === 'numeric') {
        const ref = String(pt.show != null ? pt.show : (pt.sig ? math.sig(pt.answer, pt.sig) : pt.answer));
        const v = math.parseNum(ref), tol = pt.tol != null ? pt.tol : Math.abs(pt.answer) * 0.01;
        const okV = isFinite(v) && Math.abs(v - pt.answer) <= tol + 1e-12;
        const okS = pt.sig ? math.countSig(ref) === pt.sig : true;
        if (!okV || !okS) qBad.push(`${q.id}(${i + 1}): ref=${ref}`);
      } else if (pt.type === 'expr') {
        try {
          if (!expr.equal(pt.answer, pt.answer, Object.keys(pt.vars))) qBad.push(`${q.id}(${i + 1}): expr unequal`);
        } catch (e) { qBad.push(`${q.id}(${i + 1}): ${e.message}`); }
      }
    }
  }
  check('10b questions.json 数值有效数字与表达式自洽', qBad.length === 0, qBad.join('; ') || `共校验 ${qs.length} 题`);
}
console.log(fails ? `\n${fails} 项未通过` : '\n全部通过');
process.exit(fails ? 1 : 0);
