// M08 物理校验：node verify.mjs（无依赖）。对应 SPEC §4。
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

const { m08phys: PH, phys, expr, math, gauges } = globalThis.ML;
let fails = 0;
const check = (name, ok, info) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) fails++;
};
const rel = (x, y) => Math.abs(x - y) / Math.abs(y);
const pct = x => (x * 100).toFixed(3) + '%';

// The moving cart's center reaches 0.505 m when its front touches the stationary cart.
{
  const r = PH.airtrackRun({ ideal: true, tiltDeg: 1.35 });
  const start = 0.18;
  const contact = 0.60 - 0.095;
  const expected = Math.sqrt(r.v0 ** 2 + 2 * r.a * (contact - start));
  const atContact = start + r.v0 * r.tContact + 0.5 * r.a * r.tContact ** 2;
  check('倾斜导轨：接触时的滑块中心位置与碰前速度一致',
    Math.abs(r.xContact - contact) < 1e-9 && Math.abs(atContact - contact) < 1e-9 &&
    Math.abs(r.v1AtC - expected) < 1e-9);
}

// 1. 斜槽弹性碰撞（m1 > m2）：动量守恒 < 0.1%，且 OP + OM = ON
{
  const solo = PH.chuteCollide({ m1: 0.045, m2: 0, ideal: true });
  const col = PH.chuteCollide({ m1: 0.045, m2: 0.015, e: 0.98, ideal: true });
  const chk = PH.chuteCheck(0.045, 0.015, solo.xP, col.xM, col.xN);
  check('1a 斜槽弹性碰撞 m₁>m₂：m₁·OP = m₁·OM + m₂·ON 偏差 < 0.1%', Math.abs(chk.relErr) < 0.001, `偏差=${pct(Math.abs(chk.relErr))}`);
  check('1b 斜槽弹性碰撞：OP + OM = ON 偏差 < 0.1%', Math.abs(chk.elDiff) < 0.001, `OP+OM=${(chk.elSum * 100).toFixed(2)}cm ON=${(col.xN * 100).toFixed(2)}cm`);
}

// 2. 斜槽非弹性碰撞（m1 > m2, e = 0.75）：动量仍守恒 < 0.1%，但 OP + OM ≠ ON
{
  const solo = PH.chuteCollide({ m1: 0.045, m2: 0, ideal: true });
  const col = PH.chuteCollide({ m1: 0.045, m2: 0.012, e: 0.75, ideal: true });
  const chk = PH.chuteCheck(0.045, 0.012, solo.xP, col.xM, col.xN);
  check('2a 斜槽非弹性碰撞 m₁>m₂：m₁·OP = m₁·OM + m₂·ON 偏差 < 0.1%', Math.abs(chk.relErr) < 0.001, `偏差=${pct(Math.abs(chk.relErr))}`);
  check('2b 斜槽非弹性碰撞：OP + OM ≠ ON（差 > 5%）', Math.abs(chk.elDiff) > 0.05, `偏差=${pct(Math.abs(chk.elDiff))}`);
}

// 3. m1 < m2 时入射球速度反向（v1' < 0）且动量验证失真
{
  const solo = PH.chuteCollide({ m1: 0.015, m2: 0, ideal: true });
  const bad = PH.chuteCollide({ m1: 0.015, m2: 0.045, e: 0.98, ideal: true });
  const chk = PH.chuteCheck(0.015, 0.045, solo.xP, bad.xM, bad.xN);
  check('3a m₁ < m₂ 时入射球碰撞后速度反向（v₁′ < 0）', bad.v1After < 0 && bad.rebound === true, `v₁′=${bad.v1After.toFixed(3)} m/s`);
  check('3b m₁ < m₂ 经反弹再滑落后动量式严重失真（偏差 > 10%）', Math.abs(chk.relErr) > 0.10, `偏差=${pct(Math.abs(chk.relErr))}`);
}

// 4. 气垫导轨：弹簧弹开、粘扣完全非弹性、等质量弹性碰、导轨倾斜
{
  const sp = PH.airtrackRun({ airMode: 'spring', m1: 0.200, m2: 0.100, d1: 0.00686, d2: 0.010, ideal: true });
  check('4a 气垫导轨弹簧弹开：m₁d₁/t₁ = m₂d₂/t₂ 偏差 < 0.1%', Math.abs(sp.relErr) < 0.001, `p₁=${sp.p1.toFixed(4)} p₂=${sp.p2.toFixed(4)} 偏差=${pct(Math.abs(sp.relErr))}`);

  const inel = PH.airtrackRun({ airMode: 'inelastic', m1: 0.200, m2: 0.100, ideal: true });
  const wantEk = 0.200 / 0.300;
  check('4b 粘扣完全非弹性碰撞：Ek′/Ek₀ = m₁/(m₁+m₂)', rel(inel.ekRatio, wantEk) < 0.001, `比值=${inel.ekRatio.toFixed(4)} 理论=${wantEk.toFixed(4)}`);

  const eq = PH.airtrackRun({ airMode: 'elastic', m1: 0.200, m2: 0.200, d1: 0.010, d2: 0.010, ideal: true });
  check('4c 等质量弹性碰：t₂ = t₁（偏差 < 0.1%）', rel(eq.dt2, eq.dt1) < 0.001, `t₁=${(eq.dt1 * 1000).toFixed(2)}ms t₂=${(eq.dt2 * 1000).toFixed(2)}ms`);

  const tilt06 = PH.airtrackRun({ airMode: 'level', tiltDeg: 0.6, ideal: true });
  const tilt = PH.airtrackRun({ airMode: 'level', tiltDeg: 1.35, ideal: true });
  check('4d 导轨未调水平（+0.6° / +1.35°）：两门遮光时间不等且返回 v₀', tilt06.dt2 > tilt06.dt1 * 1.02 && tilt.dt2 > tilt.dt1 * 1.05 && tilt.v0 === 0.80, `+0.6°:${(tilt06.dt1 * 1000).toFixed(2)}→${(tilt06.dt2 * 1000).toFixed(2)}ms +1.35°:${(tilt.dt1 * 1000).toFixed(2)}→${(tilt.dt2 * 1000).toFixed(2)}ms`);
}

// 5. 同位置释放 vs 变位置释放散布半径 + 最小包围圆包住全部点
{
  const rFixed = [], rJitter = [];
  let allInside = true;
  for (let s = 1; s <= 20; s++) {
    const a = PH.chuteSeries({ m1: 0.045, m2: 0, releaseJitter: false, ideal: false, seed: s * 17 }, 10);
    const b = PH.chuteSeries({ m1: 0.045, m2: 0, releaseJitter: true, ideal: false, seed: s * 17 }, 10);
    rFixed.push(a.P.r);
    rJitter.push(b.P.r);
    for (const d of a.pDots) if (Math.hypot(d.x - a.P.cx, d.y - a.P.cy) > a.P.r + 1e-8) allInside = false;
    for (const d of b.pDots) if (Math.hypot(d.x - b.P.cx, d.y - b.P.cy) > b.P.r + 1e-8) allInside = false;
  }
  const mFix = phys.mean(rFixed), mJit = phys.mean(rJitter);
  check('5a 固定释放最小圆半径 < 变位置释放的 1/3', mJit > mFix * 3, `固定均半径=${(mFix * 100).toFixed(2)}cm 变位置=${(mJit * 100).toFixed(2)}cm`);
  check('5b 最小包围圆精确包含全部落点', allInside, '20 组 × 10 发全部点位于圆内');
}

// 6. 末端不水平 (+12° / +18°) 与 桌面高度 H 对照误区
{
  const sUp = PH.chuteCollide({ m1: 0.045, m2: 0, tiltDeg: 12, ideal: true });
  const cUp = PH.chuteCollide({ m1: 0.045, m2: 0.015, e: 0.75, tiltDeg: 12, ideal: true });
  const chkUp = PH.chuteCheck(0.045, 0.015, sUp.xP, cUp.xM, cUp.xN);
  const ratioErr = rel(cUp.xN / sUp.xP, cUp.v2After / sUp.vStart);
  check('6a 末端上翘 +12° 时飞行时间不等、射程不成正比且动量偏差 > 1%', cUp.tN > sUp.tP && sUp.tP > cUp.tM && ratioErr > 0.03 && Math.abs(chkUp.relErr) > 0.01, `tM=${cUp.tM.toFixed(3)}s tP=${sUp.tP.toFixed(3)}s tN=${cUp.tN.toFixed(3)}s 射程比偏${pct(ratioErr)} 动量偏${pct(Math.abs(chkUp.relErr))}`);

  const s8 = PH.chuteCollide({ m1: 0.045, m2: 0, H: 0.80, ideal: true });
  const c8 = PH.chuteCollide({ m1: 0.045, m2: 0.015, e: 1, H: 0.80, ideal: true });
  const chk8 = PH.chuteCheck(0.045, 0.015, s8.xP, c8.xM, c8.xN);
  check('6b 改变桌面高度 H = 0.80 m 仍精确满足动量守恒', Math.abs(chk8.relErr) < 0.001, `偏差=${pct(Math.abs(chk8.relErr))}`);

  const sUp18 = PH.chuteCollide({ m1: 0.045, m2: 0, tiltDeg: 18, ideal: true });
  const cUp18 = PH.chuteCollide({ m1: 0.045, m2: 0.015, e: 0.75, tiltDeg: 18, ideal: true });
  const chkUp18 = PH.chuteCheck(0.045, 0.015, sUp18.xP, cUp18.xM, cUp18.xN);
  check('6c 末端上翘 +18° (E3) 动量偏差比 +12° 更显著', Math.abs(chkUp18.relErr) > Math.abs(chkUp.relErr), `+12°=${pct(Math.abs(chkUp.relErr))} +18°=${pct(Math.abs(chkUp18.relErr))}`);
}

// 7. questions.json 全题自检（verified, numeric show+sig, expr 等价性，仪器真题读数）
{
  const qs = JSON.parse(fs.readFileSync(path.join(here, 'questions.json'), 'utf8'));
  const bad = [];
  for (const q of qs) {
    if (!q.verified) bad.push(`${q.id}: verified=false`);
    for (const [i, pt] of q.parts.entries()) {
      if (pt.type === 'numeric') {
        if (pt.show == null) bad.push(`${q.id}(${i + 1}): missing show`);
        const ref = String(pt.show);
        const v = math.parseNum(ref);
        const tol = pt.tol != null ? pt.tol : Math.abs(pt.answer) * 0.01;
        if (!isFinite(v) || Math.abs(v - pt.answer) > tol + 1e-12) bad.push(`${q.id}(${i + 1}): value mismatch ref=${ref}`);
        if (pt.sig && math.countSig(ref) !== pt.sig) bad.push(`${q.id}(${i + 1}): sig mismatch ref=${ref}`);
      } else if (pt.type === 'expr') {
        try {
          if (!expr.equal(pt.answer, pt.answer, Object.keys(pt.vars))) bad.push(`${q.id}(${i + 1}): expr self-unequal`);
        } catch (e) { bad.push(`${q.id}(${i + 1}): ${e.message}`); }
      }
    }
  }
  const cal1 = gauges.caliper.diagnose('0.99', 9.9, { div: 10, unit: 'cm' });
  const cal2 = gauges.caliper.diagnose('10.0', 10.0, { div: 10, unit: 'mm' });
  const mic1 = gauges.micrometer.diagnose('6.860', 6.860, { zeroErrMm: 0, unit: 'mm' });
  const exprOk = expr.equal('-m*l2+M*l3', 'M*l3-m*l2', ['m', 'M', 'l2', 'l3']) &&
                 expr.equal('(m*d)/t2 - (m*d)/t1', 'm*(d/t2-d/t1)', ['m', 'd', 't1', 't2']);
  check('7a questions.json 全题（≥8题）数值、show 与表达式自洽', qs.length >= 8 && bad.length === 0 && exprOk, bad.join('; ') || `共校验 ${qs.length} 题`);
  check('7b 真题游标卡尺(0.99cm/10.0mm)与螺旋测微器(6.860mm)读数模型一致', cal1.ok && cal2.ok && mic1.ok, '0.99cm / 10.0mm / 6.860mm');
}

console.log(fails ? `\n${fails} 项未通过` : '\n全部通过');
process.exit(fails ? 1 : 0);
