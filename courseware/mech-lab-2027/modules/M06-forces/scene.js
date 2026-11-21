/* M06 scene — 探究两个互成角度的力的合成规律：物理引擎（Node/浏览器通用）、俯视 2.5D 实验台、测力计读数嵌用、学原理、四拍诊断与反推。 */
(function (ML) {
  'use strict';
  var P = ML.phys;
  var L0 = 0.080;       // 橡皮条原长 8.0 cm
  var K_BAND = 50.0;    // 橡皮条劲度系数 50.0 N/m
  var Y_O = 0.160;      // 标准结点 O 距图钉 A(0, 0) 的距离 16.0 cm
  var F_EQ_STD = K_BAND * (Y_O - L0); // 4.00 N
  var RANGE_MAX = 5.0;  // 弹簧测力计量程 0–5 N

  function rubberBandForce(kx, ky, kBand, l0) {
    kBand = kBand != null ? kBand : K_BAND;
    l0 = l0 != null ? l0 : L0;
    var L = Math.hypot(kx, ky);
    var dL = Math.max(0, L - l0);
    var mag = kBand * dL;
    var ux = L > 1e-9 ? kx / L : 0;
    var uy = L > 1e-9 ? ky / L : 1;
    return {
      L: L, dL: dL, mag: mag,
      fx: mag * ux, fy: mag * uy,
      angleDeg: Math.atan2(ux, uy) * 180 / Math.PI
    };
  }

  function twoForceEquilibrium(F_eq, theta1Deg, theta2Deg) {
    var t1 = theta1Deg * Math.PI / 180;
    var t2 = theta2Deg * Math.PI / 180;
    var sinSum = Math.sin(t1 + t2);
    var F1 = Math.abs(sinSum) < 1e-9 ? NaN : F_eq * Math.sin(t2) / sinSum;
    var F2 = Math.abs(sinSum) < 1e-9 ? NaN : F_eq * Math.sin(t1) / sinSum;
    var alphaDeg = theta1Deg + theta2Deg;
    var overRange = !isFinite(F1) || !isFinite(F2) || F1 > RANGE_MAX || F2 > RANGE_MAX;
    return {
      F1: F1, F2: F2,
      theta1Deg: theta1Deg, theta2Deg: theta2Deg,
      alphaDeg: alphaDeg, overRange: overRange
    };
  }

  function dynamicEquilibrium(F_eq, theta1Deg, theta2Deg) {
    var t1 = theta1Deg * Math.PI / 180;
    var t2 = theta2Deg * Math.PI / 180;
    var s12 = Math.sin(t1 + t2);
    var F1 = Math.abs(s12) < 1e-9 ? NaN : F_eq * Math.sin(t2) / s12;
    var F2 = Math.abs(s12) < 1e-9 ? NaN : F_eq * Math.sin(t1) / s12;
    var F2Min = F_eq * Math.sin(t1);
    return {
      F1: F1, F2: F2, F2Min: F2Min,
      sumAngleDeg: theta1Deg + theta2Deg,
      isPerp: Math.abs(theta1Deg + theta2Deg - 90) < 1e-6
    };
  }

  function symmetricForce(F_eq, alphaDeg) {
    var half = (alphaDeg / 2) * Math.PI / 180;
    var c = Math.cos(half);
    return c > 1e-6 ? F_eq / (2 * c) : NaN;
  }

  /* 学生拉拽模型：手的位置决定测力计方向与伸长量，结点由三力合力驱动。 */
  var METER_REST = 0.080; // 细绳、外壳与未拉伸弹簧的等效长度 8 cm
  var METER_K = 35.0;     // 测力计弹簧劲度系数 35 N/m
  function meterTension(knot, hand) {
    var dx = hand.x - knot.x, dy = hand.y - knot.y;
    var dist = Math.hypot(dx, dy);
    var mag = Math.max(0, (dist - METER_REST) * METER_K);
    return { dist: dist, mag: mag, ux: dist > 1e-9 ? dx / dist : 0, uy: dist > 1e-9 ? dy / dist : 1 };
  }
  function pullForces(knot, hands) {
    var band = rubberBandForce(knot.x, knot.y, K_BAND, L0);
    var L = Math.max(1e-9, Math.hypot(knot.x, knot.y));
    var fx = -band.mag * knot.x / L, fy = -band.mag * knot.y / L;
    var meters = hands.map(function (hand) {
      var t = meterTension(knot, hand);
      fx += t.mag * t.ux; fy += t.mag * t.uy;
      return t;
    });
    return { band: band, meters: meters, fx: fx, fy: fy, mag: Math.hypot(fx, fy) };
  }
  function stepPullKnot(knot, velocity, hands, dt) {
    var f = pullForces(knot, hands);
    var mass = 0.035, damping = 9.0;
    velocity.x += f.fx / mass * dt;
    velocity.y += f.fy / mass * dt;
    var damp = Math.exp(-damping * dt);
    velocity.x *= damp; velocity.y *= damp;
    knot.x = P.clamp(knot.x + velocity.x * dt, -0.15, 0.15);
    knot.y = P.clamp(knot.y + velocity.y * dt, 0.065, 0.29);
    f.speed = Math.hypot(velocity.x, velocity.y);
    return f;
  }
  function equilibriumHands(target, theta1Deg, theta2Deg) {
    var two = twoForceEquilibrium(K_BAND * (Math.hypot(target.x, target.y) - L0), theta1Deg, theta2Deg);
    var d1 = METER_REST + two.F1 / METER_K, d2 = METER_REST + two.F2 / METER_K;
    var r1 = theta1Deg * Math.PI / 180, r2 = theta2Deg * Math.PI / 180;
    return [
      { x: target.x - Math.sin(r1) * d1, y: target.y + Math.cos(r1) * d1 },
      { x: target.x + Math.sin(r2) * d2, y: target.y + Math.cos(r2) * d2 }
    ];
  }

  function solveExperiment(params, seed) {
    params = params || {};
    var kBand = params.kBand != null ? params.kBand : K_BAND;
    var l0 = params.l0 != null ? params.l0 : L0;
    var knotO = params.knotO || { x: 0, y: Y_O };
    var bandStd = rubberBandForce(knotO.x, knotO.y, kBand, l0);
    var F_eq = params.F_eq != null ? params.F_eq : bandStd.mag;
    var theta1Deg = params.theta1Deg != null ? params.theta1Deg : 35;
    var theta2Deg = params.theta2Deg != null ? params.theta2Deg : 45;
    var two = twoForceEquilibrium(F_eq, theta1Deg, theta2Deg);

    var ideal = !!params.ideal;
    var rng = P.rng(seed || 19);
    var liftDeg = params.liftDeg != null ? params.liftDeg : 0;
    var cosLift = Math.max(0.2, Math.cos(liftDeg * Math.PI / 180));
    var fCase = params.fCase != null ? params.fCase : (liftDeg > 0 ? 0.10 : 0);
    var zeroErr1 = params.zeroErr1 != null ? params.zeroErr1 : 0;
    var zeroErr2 = params.zeroErr2 != null ? params.zeroErr2 : 0;
    var zeroErrS = params.zeroErrS != null ? params.zeroErrS : 0;
    var markDist = params.markDist != null ? params.markDist : 0.120;
    var sigmaPos = ideal ? 0 : (params.sigmaPos != null ? params.sigmaPos : 0.0015);
    var sigmaForce = ideal ? 0 : (params.sigmaForce != null ? params.sigmaForce : 0.010);

    var F1True = two.F1;
    var F2True = two.F2;
    var F1Read = F1True / cosLift + fCase + zeroErr1 + (sigmaForce > 0 ? rng.gauss(sigmaForce) : 0);
    var F2Read = F2True / cosLift + fCase + zeroErr2 + (sigmaForce > 0 ? rng.gauss(sigmaForce) : 0);

    var dAng1 = sigmaPos > 0 ? Math.atan2(rng.gauss(sigmaPos), markDist) * 180 / Math.PI : 0;
    var dAng2 = sigmaPos > 0 ? Math.atan2(rng.gauss(sigmaPos), markDist) * 180 / Math.PI : 0;
    var theta1Meas = theta1Deg + dAng1;
    var theta2Meas = theta2Deg + dAng2;

    var r1 = theta1Meas * Math.PI / 180;
    var r2 = theta2Meas * Math.PI / 180;
    var fxTh = -F1Read * Math.sin(r1) + F2Read * Math.sin(r2);
    var fyTh = F1Read * Math.cos(r1) + F2Read * Math.cos(r2);
    var magTh = Math.hypot(fxTh, fyTh);
    var angTh = Math.atan2(fxTh, fyTh) * 180 / Math.PI;

    var off = params.knotOffset || { dx: 0, dy: 0 };
    var kx = knotO.x + (off.dx || 0);
    var ky = knotO.y + (off.dy || 0);
    var bandAct = rubberBandForce(kx, ky, kBand, l0);
    var liftS = params.liftSingleDeg != null ? params.liftSingleDeg : 0;
    var cosLiftS = Math.max(0.2, Math.cos(liftS * Math.PI / 180));
    var fCaseS = liftS > 0 ? (params.fCase != null ? params.fCase : 0.10) : 0;
    var magAct = bandAct.mag / cosLiftS + fCaseS + zeroErrS + (sigmaForce > 0 ? rng.gauss(sigmaForce) : 0);
    var dAngS = sigmaPos > 0 ? Math.atan2(rng.gauss(sigmaPos), markDist) * 180 / Math.PI : 0;
    var angAct = bandAct.angleDeg + dAngS;
    var rAct = angAct * Math.PI / 180;
    var fxAct = magAct * Math.sin(rAct);
    var fyAct = magAct * Math.cos(rAct);

    var dot = (fxTh * fxAct + fyTh * fyAct) / Math.max(1e-12, magTh * magAct);
    var angleDiffDeg = Math.acos(P.clamp(dot, -1, 1)) * 180 / Math.PI;
    var relMagErr = Math.abs(magTh - magAct) / Math.max(1e-9, magAct);
    var signedRelMagErr = (magTh - magAct) / Math.max(1e-9, magAct);
    var overRange = two.overRange || F1Read > RANGE_MAX || F2Read > RANGE_MAX || magAct > RANGE_MAX;

    return {
      F_eq: F_eq,
      F1True: F1True, F2True: F2True,
      F1Read: F1Read, F2Read: F2Read,
      theta1True: theta1Deg, theta2True: theta2Deg,
      theta1Meas: theta1Meas, theta2Meas: theta2Meas,
      alphaDeg: theta1Deg + theta2Deg,
      F_theory: { fx: fxTh, fy: fyTh, mag: magTh, angleDeg: angTh },
      F_actual: { fx: fxAct, fy: fyAct, mag: magAct, angleDeg: angAct, knotX: kx, knotY: ky },
      relMagErr: relMagErr,
      signedRelMagErr: signedRelMagErr,
      angleDiffDeg: angleDiffDeg,
      overRange: overRange
    };
  }

  ML.forces = {
    L0: L0, K_BAND: K_BAND, Y_O: Y_O, F_EQ_STD: F_EQ_STD, RANGE_MAX: RANGE_MAX,
    rubberBandForce: rubberBandForce,
    twoForceEquilibrium: twoForceEquilibrium,
    dynamicEquilibrium: dynamicEquilibrium,
    symmetricForce: symmetricForce,
    METER_REST: METER_REST, METER_K: METER_K,
    meterTension: meterTension, pullForces: pullForces,
    stepPullKnot: stepPullKnot, equilibriumHands: equilibriumHands,
    solveExperiment: solveExperiment
  };
})(typeof window !== 'undefined' ? (window.ML = window.ML || {}) : (globalThis.ML = globalThis.ML || {}));

/* =========================================================================
 *  浏览器交互界面（Node 校验不执行此部分）
 * ========================================================================= */
(function (ML) {
  'use strict';
  if (typeof document === 'undefined') return;

  var h = ML.h, M = ML.math, P = ML.phys, FF = ML.forces, D = ML.stage.draw;
  var GV = ML.gaugesView, GG = ML.gauges;
  var C = ML.json('ml-content'), Q = ML.json('ml-questions') || [];
  var S = ML.store.init(C.slug, {
    v: 1, tab: 'learn', learnPage: 0, mode: 'guided', ideal: false,
    stage: 'cal', answers: {}, done: {}
  });
  var ERR = {}; C.errors.forEach(function (e) { ERR[e.id] = e; });
  var PROC = {}; C.procedure.forEach(function (p) { PROC[p.id] = p; });
  var seedCounter = 23;
  var bench = null;

  /* ---------- 共用 2.5D 绘制辅助 ---------- */
  function drawArrow(ctx, x1, y1, x2, y2, color, lw, headLen) {
    lw = lw || 2.2; headLen = headLen || 9;
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 1) return;
    var ux = dx / len, uy = dy / len;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - ux * (headLen * 0.5), y2 - uy * (headLen * 0.5)); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ux * headLen - uy * (headLen * 0.44), y2 - uy * headLen + ux * (headLen * 0.44));
    ctx.lineTo(x2 - ux * headLen + uy * (headLen * 0.44), y2 - uy * headLen - ux * (headLen * 0.44));
    ctx.closePath(); ctx.fill();
  }

  function drawSpring(ctx, x1, y1, x2, y2, coils, amp, col) {
    var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    var ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    ctx.strokeStyle = col || '#596574'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x1, y1);
    for (var i = 1; i < coils * 2; i++) {
      var f = i / (coils * 2);
      var side = (i % 2 === 1 ? 1 : -1) * amp;
      ctx.lineTo(x1 + ux * L * f + nx * side, y1 + uy * L * f + ny * side);
    }
    ctx.lineTo(x2, y2); ctx.stroke();
  }

  /* 从挂钩端 (hx, hy) 沿方向 angleRad 绘制 2.5D 弹簧测力计 */
  function drawDyn2D(ctx, hx, hy, angleRad, dispN, label, opts) {
    opts = opts || {};
    var bodyLen = opts.bodyLen || 112, bodyW = opts.bodyW || 28;
    var hookGap = 14, showN = P.clamp(dispN, -0.3, 5.4);
    var over = dispN > 5.0;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angleRad);

    // 若抬离木板，先画木板面投影阴影
    if (opts.liftDeg && opts.liftDeg > 0) {
      ctx.save();
      ctx.translate(8, 8);
      ctx.fillStyle = 'rgba(16,35,63,0.14)';
      D.rr(ctx, -bodyW / 2, hookGap, bodyW, bodyLen, 6);
      ctx.fill();
      ctx.restore();
    }

    // 挂钩连杆
    ctx.strokeStyle = '#6E7B8A'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, hookGap); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.stroke();

    // 测力计壳体
    ctx.fillStyle = D.grad(ctx, -bodyW / 2, 0, bodyW / 2, 0, ['#F8FAFC', '#DCE4EC', '#C7D3E0']);
    D.rr(ctx, -bodyW / 2, hookGap, bodyW, bodyLen, 6);
    ctx.fill();
    ctx.strokeStyle = over ? '#C7374B' : '#7E8C9B';
    ctx.lineWidth = over ? 1.8 : 1.2;
    ctx.stroke();

    // 刻度窗口
    var winX = -10, winY = hookGap + 12, winW = 20, winH = bodyLen - 26;
    ctx.fillStyle = '#fff'; ctx.fillRect(winX, winY, winW, winH);
    ctx.strokeStyle = '#B9C8DA'; ctx.lineWidth = 0.8; ctx.strokeRect(winX, winY, winW, winH);

    // 内部弹簧与刻度（0 在拉环端，5 在挂钩端，与高精度校准窗一致）
    var y0 = winY + winH - 8, y5 = winY + 8;
    var ptrY = y0 - (P.clamp(showN, 0, 5.15) / 5.0) * (y0 - y5);
    ctx.save();
    ctx.globalAlpha = 0.45;
    drawSpring(ctx, -4.5, winY + winH - 2, -4.5, Math.min(winY + winH - 6, ptrY + 2), 6, 2.0, '#8E99A6');
    ctx.restore();

    ctx.strokeStyle = '#10233F'; ctx.lineWidth = 0.8;
    for (var n = 0; n <= 25; n++) {
      var yy = y0 - (n / 25) * (y0 - y5);
      var isMaj = n % 5 === 0;
      ctx.beginPath(); ctx.moveTo(winX + 1, yy); ctx.lineTo(winX + (isMaj ? 7 : 4), yy); ctx.stroke();
      if (isMaj && (n % 10 === 0 || n === 25)) {
        ctx.save();
        ctx.translate(winX + winW - 5, yy);
        ctx.rotate(-angleRad);
        D.text(ctx, String(n / 5), 0, 2.8, { align: 'center', size: 7.5, weight: 700, color: '#10233F' });
        ctx.restore();
      }
    }

    // 红色指针
    ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(winX - 1, ptrY); ctx.lineTo(winX + winW + 1, ptrY); ctx.stroke();

    // 尾端拉环（手拉把手）
    var ringY = hookGap + bodyLen + 12;
    ctx.strokeStyle = opts.active ? '#1661FF' : '#12A9C4'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, ringY, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = opts.active ? 'rgba(22,97,255,0.18)' : 'rgba(18,169,196,0.16)';
    ctx.beginPath(); ctx.arc(0, ringY, 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 标签放在拉环外侧（水平正放）
    var endDist = hookGap + bodyLen + 12;
    var gx = hx - Math.sin(angleRad) * endDist;
    var gy = hy + Math.cos(angleRad) * endDist;
    if (label) {
      var isHoriz = Math.abs(Math.sin(angleRad)) > 0.85;
      var lx = isHoriz
        ? hx - Math.sin(angleRad) * (hookGap + bodyLen * 0.50)
        : hx - Math.sin(angleRad) * (hookGap + bodyLen * 0.48) + Math.cos(angleRad) * (opts.labelSide || 24);
      var ly = isHoriz
        ? hy - 26
        : hy + Math.cos(angleRad) * (hookGap + bodyLen * 0.48) + Math.sin(angleRad) * (opts.labelSide || 24);
      D.text(ctx, label + ' = ' + dispN.toFixed(2) + ' N', lx, ly, {
        align: isHoriz ? 'center' : ((opts.labelSide || 24) < 0 ? 'right' : 'left'),
        size: 11.5, weight: 700,
        color: over ? '#C7374B' : '#10233F'
      });
    }
    return { gx: gx, gy: gy };
  }

  /* =====================================================================
   *  测力计高精度读数弹窗（嵌用 ML.gaugesView.GaugeBench）
   * ===================================================================== */
  function openDynModal(trueForceN, zeroOffsetN, title) {
    var old = document.querySelector('.ml-dyn-modal');
    if (old) old.remove();
    var targetStr = trueForceN.toFixed(2);
    var gHost = h('div');
    var inp = h('input.cal-inp', { type: 'text', value: '', placeholder: '如 ' + targetStr, 'aria-label': '输入弹簧测力计读数' });
    var fb = h('div.cal-fb', '长按测力计或右侧放大窗可呼出 3× 放大镜；分度值 0.1 N，须估读到 0.01 N。');
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      document.removeEventListener('keydown', onKey);
      if (modal) { modal.remove(); modal = null; }
    }
    var modal = h('div.ml-modal.ml-dyn-modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '弹簧测力计读数校准', onclick: function (e) { if (e.target === modal) close(); } },
      h('div.ml-modal-card',
        h('div.try-head',
          h('div', h('div.try-k', '仪器精准读数'), h('h2', title || '0–5 N 弹簧测力计读数（估读到 0.01 N）')),
          h('button.btn', { type: 'button', onclick: close }, '关闭')),
        gHost,
        h('div.cal-read-row',
          h('span', '真实拉力读数 ='), inp, h('span', 'N'),
          h('button.btn.primary', { type: 'button', onclick: verify }, '核对读数'),
          h('button.btn', { type: 'button', onclick: function () { inp.value = targetStr; verify(); } }, '填入参考值 ' + targetStr + ' N')),
        fb));
    document.body.appendChild(modal);
    document.addEventListener('keydown', onKey);
    new GV.GaugeBench(gHost, { height: 264, state: { type: 'dynamometer', trueForceN: trueForceN, zeroOffsetN: zeroOffsetN || 0, locked: true } });
    function verify() {
      var res = GG.dynamometer.diagnose(inp.value, trueForceN, { zeroOffsetN: zeroOffsetN || 0, tolN: 0.02 });
      fb.className = 'cal-fb ' + (res.ok ? 'ok' : 'bad');
      fb.textContent = (res.ok ? '✓ ' : '✕ ') + res.msg;
      if (res.ok) ML.toast('测力计读数校验正确：' + targetStr + ' N', 'ok');
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') verify(); });
  }

  /* =====================================================================
   *  ② 做·实验（俯视 2.5D 木板实验台）
   * ===================================================================== */
  function Bench(el) {
    var self = this; this.el = el;
    this.mode = S.mode || 'guided';
    this.stageId = S.stage || 'cal'; // 'cal' | 'two' | 'single' | 'plot'
    this.trials = [];
    this.st = {
      calDone: false,
      calPullN: 2.00,
      zeroErr1: 0,
      zeroErr2: 0,
      theta1Deg: 35,
      theta2Deg: 45,
      pullPct: 1.0,
      liftDeg: 0,
      markDist: 0.120,
      twoRecorded: false,
      twoSnap: null,
      singleKnotX: 0,
      singleKnotY: FF.Y_O,
      singleRecorded: false,
      singleSnap: null,
      lastResult: null,
      lastSeed: 31
    };
    this.done = { P1: false, P2: false, P3: false, P4: false, P5: false, P6: false, P7: false };

    this.modeChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'guided' }, onclick: function () { self.setMode('guided'); } }, '引导模式'),
      h('button.chip', { type: 'button', data: { v: 'free' }, onclick: function () { self.setMode('free'); } }, '自由模式'));

    this.stageChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'cal' }, onclick: function () { self.setStage('cal'); } }, '① 对拉校准'),
      h('button.chip', { type: 'button', data: { v: 'two' }, onclick: function () { self.setStage('two'); } }, '② 双计互拉'),
      h('button.chip', { type: 'button', data: { v: 'single' }, onclick: function () { self.setStage('single'); } }, '③ 单计等效'),
      h('button.chip', { type: 'button', data: { v: 'plot' }, onclick: function () { self.setStage('plot'); } }, '④ 作图检验'));

    this.idealChip = h('button.chip', {
      type: 'button', title: '理想条件：无描点随机偏移与读数抖动',
      onclick: function () {
        S.ideal = !S.ideal; ML.store.save();
        self.idealChip.classList.toggle('on', S.ideal);
        self.idealChip.textContent = S.ideal ? '理想条件' : '真实条件';
        self.stage.invalidate();
        self.renderSide();
      }
    }, S.ideal ? '理想条件' : '真实条件');
    this.idealChip.classList.toggle('on', S.ideal);

    this.bannerEl = h('div.bench-banner', { hidden: true });
    var topBar = h('div.bench-top', this.modeChips, this.stageChips, h('div.spacer'), this.idealChip);
    this.stageWrap = h('div.bench-stage');
    this.stageActs = h('div.stage-acts');
    this.stageWrap.appendChild(this.stageActs);
    this.side = h('aside.bench-side');
    this.analysis = h('section.analysis', { hidden: true });
    this.benchEl = h('div.bench', topBar, this.bannerEl, h('div.bench-row', this.stageWrap, this.side), this.analysis);
    el.appendChild(this.benchEl);

    this.stage = new ML.stage.Stage(this.stageWrap, { layers: ['bg', 'fg'] });
    this.stage.on('bg', function (ctx, w, hh) { self.drawBg(ctx, w, hh); });
    this.stage.on('fg', function (ctx, w, hh) { self.drawFg(ctx, w, hh); });
    this.mag = new ML.stage.Magnifier(this.stageWrap, { zoom: 3, size: 136 });
    this.bindPointer();
    this.setMode(this.mode, true);
    this.setStage(this.stageId, true);
  }

  Bench.prototype.guided = function () { return this.mode === 'guided'; };
  Bench.prototype.setBanner = function (html) {
    this.bannerEl.hidden = !html;
    this.bannerEl.innerHTML = html || '';
    if (this.benchEl) this.benchEl.classList.toggle('has-banner', !!html);
  };
  Bench.prototype.block = function (msg, errId) {
    ML.toast(msg, 'warn');
    this.setBanner('<b>先停一下：</b>' + msg + (errId ? ' <button class="link" type="button" data-try="' + errId + '">为什么？试一试 →</button>' : ''));
    var btn = ML.$('[data-try]', this.bannerEl);
    if (btn) btn.onclick = function () { openTry(errId); };
  };

  Bench.prototype.setMode = function (m, silent) {
    this.mode = m; S.mode = m; ML.store.save();
    ML.$$('.chip', this.modeChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === m); });
    if (m === 'guided' && this.st) {
      this.st.liftDeg = 0;
      this.st.markDist = 0.120;
      this.st.singleKnotX = 0;
      this.st.singleKnotY = FF.Y_O;
      var two = FF.twoForceEquilibrium(FF.F_EQ_STD, this.st.theta1Deg, this.st.theta2Deg);
      if (two.overRange) { this.st.theta1Deg = 35; this.st.theta2Deg = 45; }
    }
    if (!silent) {
      this.setBanner(null);
      ML.toast(m === 'guided' ? '引导模式：按规范步骤完成，误操作会提示原因' : '自由模式：可故意制造未调零、抬起、短细绳或 O 点偏移，观察真实偏差');
    }
    this.stage.invalidate();
    this.renderStageActs();
    this.renderSide();
  };

  Bench.prototype.setStage = function (id, silent) {
    var st = this.st;
    if (!silent && this.guided()) {
      if (id === 'two' && !st.calDone) {
        this.block('请先在“① 对拉校准”中完成弹簧测力计水平对拉检验并调零。', 'E2');
        return;
      }
      if (id === 'single' && !st.twoRecorded) {
        this.block('请先在“② 双计互拉”中将结点拉至 O 点并记录 F₁、F₂ 与方向点 P₁、P₂。', 'E4');
        return;
      }
      if (id === 'plot' && (!st.twoRecorded || !st.singleRecorded)) {
        this.block('请先完成双计互拉（②）与单计等效至同一 O 点（③），再进入作图对比！', 'E1');
        return;
      }
    }
    this.stageId = id; S.stage = id; ML.store.save();
    ML.$$('.chip', this.stageChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === id); });
    if (id === 'plot') this.computeResult();
    if (!silent) this.setBanner(null);
    this.stage.invalidate();
    this.renderStageActs();
    this.renderSide();
  };

  Bench.prototype.computeResult = function () {
    var st = this.st;
    var off = { dx: st.singleKnotX, dy: st.singleKnotY - FF.Y_O };
    st.lastSeed = (seedCounter += 7);
    var res = FF.solveExperiment({
      theta1Deg: st.theta1Deg, theta2Deg: st.theta2Deg,
      zeroErr1: st.zeroErr1, zeroErr2: st.zeroErr2,
      liftDeg: st.liftDeg, markDist: st.markDist,
      knotOffset: off, ideal: S.ideal
    }, st.lastSeed);
    st.lastResult = res;
    if (!st.twoSnap) st.twoSnap = res;
    if (!st.singleSnap) st.singleSnap = res;
    return res;
  };

  Bench.prototype.recordTrial = function () {
    var res = this.computeResult(), st = this.st;
    var tags = [];
    if (Math.hypot(st.singleKnotX, st.singleKnotY - FF.Y_O) > 0.002) tags.push('E1');
    if (Math.abs(st.zeroErr1) > 0.01 || Math.abs(st.zeroErr2) > 0.01) tags.push('E2');
    if (st.liftDeg > 1) tags.push('E3');
    if (st.markDist < 0.05) tags.push('E4');
    if (res.overRange || res.alphaDeg < 25) tags.push('E5');
    this.trials.push({
      idx: this.trials.length + 1,
      theta1: st.theta1Deg, theta2: st.theta2Deg, alpha: res.alphaDeg,
      F1: res.F1Read, F2: res.F2Read,
      F_th: res.F_theory.mag, F_act: res.F_actual.mag,
      relErrPct: res.relMagErr * 100, angDiff: res.angleDiffDeg,
      overRange: res.overRange, tags: tags
    });
    this.done.P6 = true;
    if (this.trials.length >= 2) this.done.P7 = true;
    this.renderAnalysis(true);
    ML.toast('已记录第 ' + this.trials.length + ' 组实验数据并更新下方分析图', 'ok');
    this.renderSide();
  };

  /* ---------- 几何映射 ---------- */
  Bench.prototype.geo = function (w, hh) {
    var padX = 16, padY = 12;
    var boardW = Math.min(w - padX * 2, 620), boardH = Math.max(200, hh - padY - 46);
    var bx = (w - boardW) / 2, by = padY;
    var paperPad = 12;
    var px = bx + paperPad, py = by + paperPad, pw = boardW - paperPad * 2, ph = boardH - paperPad * 2;
    var ppm = Math.min(pw / 0.44, ph / 0.37);
    var ax = px + pw * 0.50, ay = py + Math.max(16, ph * 0.06);
    return { w: w, h: hh, bx: bx, by: by, bw: boardW, bh: boardH, px: px, py: py, pw: pw, ph: ph, ax: ax, ay: ay, ppm: ppm };
  };

  Bench.prototype.toPx = function (g, xm, ym) {
    return [g.ax + xm * g.ppm, g.ay + ym * g.ppm];
  };

  /* ---------- 静态背景层（木板 + 白纸 + 1 cm 网格 + 图钉 A） ---------- */
  Bench.prototype.drawBg = function (ctx, w, hh) {
    if (w < 80 || hh < 80) return;
    ctx.fillStyle = '#EAF1F8'; ctx.fillRect(0, 0, w, hh);
    var g = this.geo(w, hh);

    // 2.5D 方木板厚度投影与木纹底色
    ctx.fillStyle = '#B8915C';
    D.rr(ctx, g.bx + 4, g.by + 6, g.bw, g.bh, 10); ctx.fill();
    ctx.fillStyle = D.grad(ctx, g.bx, g.by, g.bx + g.bw, g.by + g.bh, ['#E5CCA3', '#D9B98C', '#CCA56E']);
    D.rr(ctx, g.bx, g.by, g.bw, g.bh, 10); ctx.fill();
    ctx.strokeStyle = '#9F7C49'; ctx.lineWidth = 1.5; ctx.stroke();

    // 白纸与四角图钉
    ctx.fillStyle = '#FFFFFF';
    D.rr(ctx, g.px, g.py, g.pw, g.ph, 4); ctx.fill();
    ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 1; ctx.stroke();
    [[g.px + 10, g.py + 10], [g.px + g.pw - 10, g.py + 10], [g.px + 10, g.py + g.ph - 10], [g.px + g.pw - 10, g.py + g.ph - 10]].forEach(function (pt) {
      ctx.fillStyle = '#8E99A6'; ctx.beginPath(); ctx.arc(pt[0], pt[1], 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#DCE4EC'; ctx.beginPath(); ctx.arc(pt[0] - 1, pt[1] - 1, 1.8, 0, Math.PI * 2); ctx.fill();
    });

    if (this.stageId === 'cal') return;

    // 白纸上的浅蓝 2 cm 标度格
    ctx.save();
    ctx.beginPath(); D.rr(ctx, g.px + 1, g.py + 1, g.pw - 2, g.ph - 2, 4); ctx.clip();
    var step2 = 0.02 * g.ppm;
    ctx.strokeStyle = 'rgba(18,169,196,0.12)'; ctx.lineWidth = 0.8;
    for (var x = g.ax; x < g.px + g.pw; x += step2) { ctx.beginPath(); ctx.moveTo(x, g.py); ctx.lineTo(x, g.py + g.ph); ctx.stroke(); }
    for (x = g.ax - step2; x > g.px; x -= step2) { ctx.beginPath(); ctx.moveTo(x, g.py); ctx.lineTo(x, g.py + g.ph); ctx.stroke(); }
    for (var y = g.ay; y < g.py + g.ph; y += step2) { ctx.beginPath(); ctx.moveTo(g.px, y); ctx.lineTo(g.px + g.pw, y); ctx.stroke(); }

    // 标准 AO 参考虚线与目标 O 点圆圈
    var oPt = this.toPx(g, 0, FF.Y_O);
    ctx.strokeStyle = 'rgba(148,163,184,0.65)'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(g.ax, g.ay); ctx.lineTo(g.ax, g.py + g.ph - 12); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#12A9C4'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(oPt[0], oPt[1], 7, 0, Math.PI * 2); ctx.stroke();
    D.text(ctx, 'O', oPt[0] - 14, oPt[1] + 4, { align: 'right', size: 12, weight: 700, color: '#0E8CA3' });

    // 固定图钉 A
    ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.arc(g.ax, g.ay, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(g.ax - 1.5, g.ay - 1.5, 2, 0, Math.PI * 2); ctx.fill();
    D.text(ctx, 'A (图钉)', g.ax + 10, g.ay + 4, { size: 11.5, weight: 700, color: '#10233F' });

    // 右上角标度尺标
    D.text(ctx, '标度：1 cm = 1.0 N', g.px + g.pw - 14, g.py + 22, { align: 'right', size: 11, weight: 700, color: '#4A5B73' });
    ctx.restore();
  };

  /* ---------- 动态前景层 ---------- */
  Bench.prototype.drawFg = function (ctx, w, hh) {
    this.hot = [];
    if (w < 80 || hh < 80) return;
    var g = this.geo(w, hh), st = this.st;

    if (this.stageId === 'cal') {
      this.drawCalStage(ctx, g);
      return;
    }

    var oPt = this.toPx(g, 0, FF.Y_O);
    if (this.stageId === 'two') {
      var ky = FF.L0 + (FF.Y_O - FF.L0) * st.pullPct;
      var kPt = this.toPx(g, 0, ky);
      var atO = Math.abs(st.pullPct - 1.0) < 0.025;

      // 橡皮条 A -> 结点
      ctx.strokeStyle = '#7A5C3E'; ctx.lineWidth = P.clamp(5.2 - st.pullPct * 1.4, 3.0, 5.5); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(g.ax, g.ay); ctx.lineTo(kPt[0], kPt[1]); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.fillStyle = atO ? '#25A870' : '#E69B2D';
      ctx.beginPath(); ctx.arc(kPt[0], kPt[1], 4.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.2; ctx.stroke();
      D.text(ctx, atO ? '结点已到位 O ✓' : '拉动把手使结点到达 O', kPt[0] + 10, kPt[1] - 6, {
        size: 11.5, weight: 700, color: atO ? '#17784F' : '#9A5A00'
      });

      var bandCur = FF.rubberBandForce(0, ky, FF.K_BAND, FF.L0);
      var two = FF.twoForceEquilibrium(bandCur.mag, st.theta1Deg, st.theta2Deg);
      var cosL = Math.max(0.2, Math.cos(st.liftDeg * Math.PI / 180));
      var fCase = st.liftDeg > 0 ? 0.10 : 0;
      var disp1 = two.F1 / cosL + fCase + st.zeroErr1;
      var disp2 = two.F2 / cosL + fCase + st.zeroErr2;

      var r1 = st.theta1Deg * Math.PI / 180, r2 = st.theta2Deg * Math.PI / 180;
      var strLenPx = Math.min(g.ppm * st.markDist * 0.42, 38);
      var hx1 = kPt[0] - Math.sin(r1) * strLenPx, hy1 = kPt[1] + Math.cos(r1) * strLenPx;
      var hx2 = kPt[0] + Math.sin(r2) * strLenPx, hy2 = kPt[1] + Math.cos(r2) * strLenPx;

      // 细绳与方向描点 P₁、P₂
      ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(kPt[0], kPt[1]); ctx.lineTo(hx1, hy1); ctx.moveTo(kPt[0], kPt[1]); ctx.lineTo(hx2, hy2); ctx.stroke();
      var mDistPx = st.markDist * g.ppm * 0.38;
      var p1x = kPt[0] - Math.sin(r1) * mDistPx, p1y = kPt[1] + Math.cos(r1) * mDistPx;
      var p2x = kPt[0] + Math.sin(r2) * mDistPx, p2y = kPt[1] + Math.cos(r2) * mDistPx;
      [[p1x, p1y, 'P₁'], [p2x, p2y, 'P₂']].forEach(function (pt, idx) {
        ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.arc(pt[0], pt[1], 3.4, 0, Math.PI * 2); ctx.fill();
        D.text(ctx, pt[2], pt[0] + (idx === 0 ? -10 : 10), pt[1] - 8, { align: idx === 0 ? 'right' : 'left', size: 11, weight: 700, color: '#C7374B' });
      });

      var dLen = Math.min(92, Math.max(66, g.ph * 0.25));
      var g1 = drawDyn2D(ctx, hx1, hy1, r1, disp1, 'F₁', { bodyLen: dLen, liftDeg: st.liftDeg, labelSide: -22, active: this._dragId === 'h1' });
      var g2 = drawDyn2D(ctx, hx2, hy2, -r2, disp2, 'F₂', { bodyLen: dLen, liftDeg: st.liftDeg, labelSide: 22, active: this._dragId === 'h2' });
      this.hot.push({ id: 'h1', x: g1.gx - 26, y: g1.gy - 26, w: 52, h: 52, label: '拖动 F₁ 测力计' });
      this.hot.push({ id: 'h2', x: g2.gx - 26, y: g2.gy - 26, w: 52, h: 52, label: '拖动 F₂ 测力计' });

      if (st.liftDeg > 0) D.text(ctx, '⚠ 测力计向上抬起 ' + st.liftDeg + '°', g.px + 12, g.py + 22, { size: 12, weight: 700, color: '#C7374B' });
      if (st.markDist < 0.05) D.text(ctx, '⚠ 短细绳（描点离 O 仅 2.5 cm）', g.px + 12, g.py + 38, { size: 11.5, weight: 700, color: '#C7374B' });
      if (two.overRange || disp1 > 5.0 || disp2 > 5.0) {
        D.text(ctx, '⚠ 拉力超过 5.0 N 量程上限！', g.px + g.pw / 2, g.py + g.ph - 12, { align: 'center', size: 12.5, weight: 700, color: '#C7374B' });
      }
      return;
    }

    if (this.stageId === 'single') {
      var kPtS = this.toPx(g, st.singleKnotX, st.singleKnotY);
      var distO = Math.hypot(st.singleKnotX, st.singleKnotY - FF.Y_O);
      var atOS = distO < 0.0025;
      ctx.strokeStyle = '#7A5C3E'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(g.ax, g.ay); ctx.lineTo(kPtS[0], kPtS[1]); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.fillStyle = atOS ? '#25A870' : '#C7374B';
      ctx.beginPath(); ctx.arc(kPtS[0], kPtS[1], 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.2; ctx.stroke();

      var bS = FF.rubberBandForce(st.singleKnotX, st.singleKnotY, FF.K_BAND, FF.L0);
      var radS = Math.atan2(-bS.fx, bS.fy);
      var strS = 24;
      var hxs = kPtS[0] - Math.sin(radS) * strS, hys = kPtS[1] + Math.cos(radS) * strS;
      ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(kPtS[0], kPtS[1]); ctx.lineTo(hxs, hys); ctx.stroke();
      var gS = drawDyn2D(ctx, hxs, hys, radS, bS.mag, "F'", { bodyLen: Math.min(92, g.ph * 0.25), labelSide: 26, active: this._dragId === 'hS' });
      this.hot.push({ id: 'hS', x: gS.gx - 28, y: gS.gy - 28, w: 56, h: 56, label: '拖动单只测力计' });
      D.text(ctx, atOS ? '✓ 结点与 O 点重合（等效替代成立）' : '⚠ 结点偏离 O 点 ' + (distO * 100).toFixed(1) + ' cm!', kPtS[0] + 12, kPtS[1] - 4, {
        size: 11.5, weight: 700, color: atOS ? '#17784F' : '#C7374B'
      });
      return;
    }

    // ④ 作图检验：在白纸上按标度绘制 F₁、F₂、虚线平行四边形、蓝 F、绿/红 F'
    var res = st.lastResult || this.computeResult();
    var scPx = 0.022 * g.ppm; // 1.0 N 在纸面上的矢量图长度（按清晰比例展示）
    scPx = Math.min(scPx, (g.py + g.ph - oPt[1] - 26) / Math.max(4.2, res.F_theory.mag, res.F_actual.mag));
    // 橡皮条
    ctx.strokeStyle = '#7A5C3E'; ctx.lineWidth = 3.8;
    ctx.beginPath(); ctx.moveTo(g.ax, g.ay); ctx.lineTo(oPt[0], oPt[1]); ctx.stroke();
    ctx.fillStyle = '#12A9C4'; ctx.beginPath(); ctx.arc(oPt[0], oPt[1], 4.2, 0, Math.PI * 2); ctx.fill();

    var t1r = res.theta1Meas * Math.PI / 180, t2r = res.theta2Meas * Math.PI / 180;
    var f1x = -res.F1Read * Math.sin(t1r) * scPx, f1y = res.F1Read * Math.cos(t1r) * scPx;
    var f2x = res.F2Read * Math.sin(t2r) * scPx, f2y = res.F2Read * Math.cos(t2r) * scPx;
    var fxThPx = f1x + f2x, fyThPx = f1y + f2y;
    var rAct = res.F_actual.angleDeg * Math.PI / 180;
    var fxAcPx = res.F_actual.mag * Math.sin(rAct) * scPx, fyAcPx = res.F_actual.mag * Math.cos(rAct) * scPx;

    // 平行四边形虚线辅助线
    ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = '#64748B'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(oPt[0] + f1x, oPt[1] + f1y); ctx.lineTo(oPt[0] + fxThPx, oPt[1] + fyThPx);
    ctx.moveTo(oPt[0] + f2x, oPt[1] + f2y); ctx.lineTo(oPt[0] + fxThPx, oPt[1] + fyThPx);
    ctx.stroke(); ctx.restore();

    // F₁ 与 F₂ 实线箭头
    drawArrow(ctx, oPt[0], oPt[1], oPt[0] + f1x, oPt[1] + f1y, '#12A9C4', 2.2);
    D.text(ctx, 'F₁=' + res.F1Read.toFixed(2) + 'N', oPt[0] + f1x - 8, oPt[1] + f1y + 12, { align: 'right', size: 11, weight: 700, color: '#0E8CA3' });
    drawArrow(ctx, oPt[0], oPt[1], oPt[0] + f2x, oPt[1] + f2y, '#E07B24', 2.2);
    D.text(ctx, 'F₂=' + res.F2Read.toFixed(2) + 'N', oPt[0] + f2x + 8, oPt[1] + f2y + 12, { size: 11, weight: 700, color: '#C25E0A' });

    // F' (实际单拉，绿色) 与 F (理论对角线，蓝色/红色)
    var okMatch = res.relMagErr < 0.03 && res.angleDiffDeg < 2.5;
    drawArrow(ctx, oPt[0], oPt[1], oPt[0] + fxAcPx, oPt[1] + fyAcPx, '#25A870', 2.8);
    D.text(ctx, "F'=" + res.F_actual.mag.toFixed(2) + 'N', oPt[0] + fxAcPx - 10, oPt[1] + fyAcPx + 14, { align: 'right', size: 12, weight: 700, color: '#17784F' });

    drawArrow(ctx, oPt[0], oPt[1], oPt[0] + fxThPx, oPt[1] + fyThPx, okMatch ? '#1661FF' : '#C7374B', 2.4);
    D.text(ctx, 'F=' + res.F_theory.mag.toFixed(2) + 'N', oPt[0] + fxThPx + 10, oPt[1] + fyThPx + 14, { size: 12, weight: 700, color: okMatch ? '#1661FF' : '#C7374B' });

    D.text(ctx, (okMatch ? '✓ 理论 F 与实际 F\' 基本重合' : '⚠ 存在显著偏差：ΔF/F\' = ' + (res.relMagErr * 100).toFixed(1) + '%, Δθ = ' + res.angleDiffDeg.toFixed(1) + '°'),
      g.px + 26, g.py + g.ph - 12, { size: 12, weight: 700, color: okMatch ? '#17784F' : '#C7374B' });
  };

  Bench.prototype.drawCalStage = function (ctx, g) {
    var st = this.st, cy = g.py + g.ph * 0.50, cx = g.px + g.pw * 0.50;
    D.text(ctx, '水平对拉校准：两只测力计挂钩互勾，检验空载调零与对拉示数一致性', cx, g.py + 28, { align: 'center', size: 12.5, weight: 700, color: '#10233F' });

    var gap = 6;
    var disp1 = st.calPullN + st.zeroErr1;
    var disp2 = st.calPullN + st.zeroErr2;
    // 左表向右拉，挂钩在右 (cx - gap)，角度 = +pi/2 (hook at origin, body extends left along -x)
    var gL = drawDyn2D(ctx, cx - gap, cy, Math.PI / 2, disp1, '甲表', { bodyLen: 124, labelSide: -30, active: this._dragId === 'calPull' });
    // 右表向左拉，挂钩在左 (cx + gap)，角度 = -pi/2 (body extends right along +x)
    var gR = drawDyn2D(ctx, cx + gap, cy, -Math.PI / 2, disp2, '乙表', { bodyLen: 124, labelSide: 30, active: this._dragId === 'calPull' });

    // 互勾连接环
    ctx.strokeStyle = '#12A9C4'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - gap, cy); ctx.lineTo(cx + gap, cy); ctx.stroke();

    this.hot.push({ id: 'calPull', x: gL.gx - 28, y: gL.gy - 28, w: 56, h: 56, label: '拖动改对拉拉力' });
    this.hot.push({ id: 'calPull', x: gR.gx - 28, y: gR.gy - 28, w: 56, h: 56, label: '拖动改对拉拉力' });

    var diff = Math.abs(disp1 - disp2);
    var zeroBad = Math.abs(st.zeroErr1) >= 0.01 || Math.abs(st.zeroErr2) >= 0.01;
    var status = diff < 0.02 && !zeroBad;
    var calMsg = status
      ? '✓ 两表读数完全一致（' + disp1.toFixed(2) + ' N = ' + disp2.toFixed(2) + ' N），零点已对齐'
      : (diff >= 0.02
          ? '⚠ 对拉示数不等（甲 ' + disp1.toFixed(2) + ' N vs 乙 ' + disp2.toFixed(2) + ' N，差 ' + diff.toFixed(2) + ' N）——需调零！'
          : '⚠ 两表均未调零（各偏 +' + st.zeroErr1.toFixed(2) + ' N，示数虚高）——需水平调零！');
    D.text(ctx, calMsg, cx, cy + 78, { align: 'center', size: 12.5, weight: 700, color: status ? '#17784F' : '#C7374B' });
    D.text(ctx, '提示：可左右拖动任意测力计拉环改变对拉力，长按呼出 3× 放大镜看刻度', cx, g.py + g.ph - 14, { align: 'center', size: 11.5, color: '#4A5B73' });
  };

  /* ---------- 指针与 3× 放大镜 ---------- */
  Bench.prototype.bindPointer = function () {
    var self = this, dragId = null, magOn = false, x0 = 0, y0 = 0, pull0 = 0, knot0X = 0, knot0Y = 0;
    this._dragId = null;

    function showMag(p) {
      var cvs = [self.stage.layer('bg').canvas, self.stage.layer('fg').canvas];
      var g = self.geo(self.stage.w, self.stage.h), st = self.st;
      var lbl = '';
      if (self.stageId === 'cal') lbl = '甲 ' + (st.calPullN + st.zeroErr1).toFixed(2) + 'N | 乙 ' + (st.calPullN + st.zeroErr2).toFixed(2) + 'N';
      else if (self.stageId === 'two') {
        var bandCur = FF.rubberBandForce(0, FF.L0 + (FF.Y_O - FF.L0) * st.pullPct, FF.K_BAND, FF.L0);
        var two = FF.twoForceEquilibrium(bandCur.mag, st.theta1Deg, st.theta2Deg);
        lbl = 'F₁ ' + two.F1.toFixed(2) + 'N | F₂ ' + two.F2.toFixed(2) + 'N';
      } else {
        var xm = ((p.x - g.ax) / g.ppm * 100).toFixed(1), ym = ((p.y - g.ay) / g.ppm * 100).toFixed(1);
        lbl = '(' + xm + ', ' + ym + ') cm';
      }
      self.mag.show(cvs, p.x, p.y, self.stage.dpr, lbl);
    }

    ML.stage.pointer(this.stage.layer('fg').canvas, {
      down: function (p) {
        var hs = self.hot || [];
        dragId = null; magOn = false;
        for (var i = hs.length - 1; i >= 0; i--) {
          var r = hs[i];
          if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) { dragId = r.id; break; }
        }
        self._dragId = dragId;
        x0 = p.x; y0 = p.y; pull0 = self.st.calPullN;
        knot0X = self.st.singleKnotX; knot0Y = self.st.singleKnotY;
        if (dragId) self.stage.invalidate('fg');
      },
      move: function (p, a) {
        if (magOn || a.pressed) { showMag(p); return; }
        if (!dragId) return;
        var g = self.geo(self.stage.w, self.stage.h), st = self.st;
        if (dragId === 'calPull') {
          var cx = g.px + g.pw * 0.50;
          var d0 = Math.abs(x0 - cx), dNow = Math.abs(p.x - cx);
          st.calPullN = P.clamp(Math.round((pull0 + (dNow - d0) * 0.025) * 20) / 20, 0.50, 3.50);
          self.stage.invalidate('fg'); self.renderSide();
        } else if (dragId === 'h1' || dragId === 'h2') {
          var ky = FF.L0 + (FF.Y_O - FF.L0) * st.pullPct;
          var kPt = self.toPx(g, 0, ky);
          var dx = p.x - kPt[0], dy = Math.max(18, p.y - kPt[1]);
          if (dragId === 'h1') {
            var ang1 = P.clamp(Math.round(Math.atan2(-dx, dy) * 180 / Math.PI), 9, 75);
            if (self.guided() && ang1 + st.theta2Deg > 115) ang1 = Math.max(15, 115 - st.theta2Deg);
            st.theta1Deg = ang1;
          } else {
            var ang2 = P.clamp(Math.round(Math.atan2(dx, dy) * 180 / Math.PI), 9, 75);
            if (self.guided() && st.theta1Deg + ang2 > 115) ang2 = Math.max(15, 115 - st.theta1Deg);
            st.theta2Deg = ang2;
          }
          var dist = Math.hypot(p.x - kPt[0], p.y - kPt[1]);
          var baseDist = Math.min(g.ppm * st.markDist * 0.42, 38) + Math.min(92, Math.max(66, g.ph * 0.25)) + 26;
          var pct = P.clamp(0.60 + 0.40 * (dist / Math.max(60, baseDist)), 0.55, 1.06);
          if (Math.abs(pct - 1.0) < 0.08) pct = 1.0;
          st.pullPct = pct;
          self.stage.invalidate('fg'); self.renderSide();
        } else if (dragId === 'hS') {
          var xm = P.clamp(knot0X + (p.x - x0) / g.ppm, -0.04, 0.04);
          var ym = P.clamp(knot0Y + (p.y - y0) / g.ppm, 0.11, 0.21);
          if (Math.hypot(xm, ym - FF.Y_O) < 0.006) { xm = 0; ym = FF.Y_O; }
          st.singleKnotX = xm; st.singleKnotY = ym;
          self.stage.invalidate('fg'); self.renderSide();
        }
      },
      press: function (p) {
        magOn = true;
        showMag(p);
      },
      up: function () {
        magOn = false;
        self.mag.hide();
        dragId = null; self._dragId = null;
        self.stage.invalidate('fg');
      }
    });
  };

  /* ---------- 舞台底部快捷操作条（按钮替代拖拽） ---------- */
  Bench.prototype.renderStageActs = function () {
    var self = this, box = this.stageActs, st = this.st;
    ML.clear(box);
    if (this.stageId === 'cal') {
      box.appendChild(h('button.btn.sm', { type: 'button', onclick: function () { st.calPullN = st.calPullN > 2.5 ? 1.50 : 2.50; self.stage.invalidate('fg'); self.renderSide(); } }, '切换对拉力度'));
      box.appendChild(h('button.btn.primary.sm', { type: 'button', onclick: function () {
        st.zeroErr1 = 0; st.zeroErr2 = 0; st.calDone = true; self.done.P1 = true;
        self.stage.invalidate('fg'); self.renderSide();
        ML.toast('两只测力计已完成调零与对拉校准 ✓', 'ok');
      } }, '一键水平调零并确认'));
      box.appendChild(h('button.btn.sm', { type: 'button', onclick: function () { openDynModal(st.calPullN, st.zeroErr1, '弹簧测力计（甲）刻度放大读数'); } }, '测力计读数窗'));
    } else if (this.stageId === 'two') {
      box.appendChild(h('button.btn.sm', { type: 'button', onclick: function () { st.pullPct = 1.0; self.stage.invalidate('fg'); self.renderSide(); ML.toast('结点已对齐 O 点', 'ok'); } }, '拉到 O 点'));
      box.appendChild(h('button.btn.sm', { type: 'button', onclick: function () {
        var b = FF.rubberBandForce(0, FF.L0 + (FF.Y_O - FF.L0) * st.pullPct, FF.K_BAND, FF.L0);
        var two = FF.twoForceEquilibrium(b.mag, st.theta1Deg, st.theta2Deg);
        openDynModal(two.F1, st.zeroErr1, '读出左表 F₁ 示数（估读到 0.01 N）');
      } }, '读 F₁ 表盘'));
      box.appendChild(h('button.btn.cyan.sm', { type: 'button', onclick: function () {
        if (Math.abs(st.pullPct - 1.0) > 0.03) { ML.toast('请先点“拉到 O 点”或拖动使结点到达 O', 'warn'); return; }
        var two = FF.twoForceEquilibrium(FF.F_EQ_STD, st.theta1Deg, st.theta2Deg);
        if (self.guided() && two.overRange) { self.block('当前夹角过大导致分力超过 5.0 N 量程，请减小两力夹角。', 'E5'); return; }
        st.twoRecorded = true;
        self.done.P2 = true; self.done.P3 = st.liftDeg === 0; self.done.P4 = st.markDist >= 0.08;
        self.setStage('single');
        ML.toast('已记录 O 点、F₁/F₂ 示数及方向点 P₁/P₂，进入单计等效拉伸', 'ok');
      } }, '记录并进入 ③ 单计等效 →'));
    } else if (this.stageId === 'single') {
      box.appendChild(h('button.btn.sm', { type: 'button', onclick: function () { st.singleKnotX = 0; st.singleKnotY = FF.Y_O; self.stage.invalidate('fg'); self.renderSide(); ML.toast('单计已将结点拉到同一 O 点', 'ok'); } }, '精准拉到 O 点'));
      if (!this.guided()) {
        box.appendChild(h('button.btn.sm', { type: 'button', onclick: function () { st.singleKnotX = 0.008; st.singleKnotY = FF.Y_O + 0.014; self.stage.invalidate('fg'); self.renderSide(); } }, '故意偏移 O 点 (E1)'));
      }
      box.appendChild(h('button.btn.cyan.sm', { type: 'button', onclick: function () {
        var dist = Math.hypot(st.singleKnotX, st.singleKnotY - FF.Y_O);
        if (self.guided() && dist > 0.003) { self.block('用单只测力计拉橡皮条时必须拉到与刚才完全重合的 O 点！', 'E1'); return; }
        st.singleRecorded = true; self.done.P5 = dist <= 0.003;
        self.setStage('plot');
        ML.toast('已记录单拉 F\' 与 AO 方向，完成平行四边形作图检验', 'ok');
      } }, '记录并作图检验 →'));
    } else if (this.stageId === 'plot') {
      box.appendChild(h('button.btn.primary.sm', { type: 'button', onclick: function () { self.recordTrial(); } }, '记录本组并展开分析'));
      box.appendChild(h('button.btn.sm', { type: 'button', onclick: function () {
        st.twoRecorded = false; st.singleRecorded = false; st.lastResult = null;
        st.theta1Deg = 30; st.theta2Deg = 50; st.pullPct = 1.0;
        self.setStage('two');
      } }, '换新角度再做一组'));
    }
  };

  /* ---------- 右侧控制面板 ---------- */
  Bench.prototype.renderSide = function () {
    var self = this, side = this.side, st = this.st;
    if (!side) return;
    ML.clear(side);
    function row() { return h('div.side-row', Array.prototype.slice.call(arguments)); }
    function chip(label, on, fn, aria) {
      var attrs = { type: 'button', onclick: fn };
      if (aria) attrs['aria-label'] = aria;
      return h('button.chip' + (on ? '.on' : ''), attrs, label);
    }

    var ctl = h('div.side-ctl');
    if (this.stageId === 'cal') {
      ctl.appendChild(h('div.side-k', '① 对拉校准参数'));
      ctl.appendChild(row(h('span.side-l', '零点偏差'),
        chip('正常 0.00 N', st.zeroErr1 === 0 && st.zeroErr2 === 0, function () { st.zeroErr1 = 0; st.zeroErr2 = 0; self.stage.invalidate('fg'); self.renderSide(); }),
        chip('甲 +0.30 N', st.zeroErr1 > 0.1 && Math.abs(st.zeroErr2) < 0.05, function () {
          if (self.guided()) { self.block('使用前必须水平调零，消除零点误差。', 'E2'); return; }
          st.zeroErr1 = 0.30; st.zeroErr2 = 0; self.stage.invalidate('fg'); self.renderSide();
        }),
        chip('双表 +0.30 N', st.zeroErr1 > 0.1 && st.zeroErr2 > 0.1, function () {
          if (self.guided()) { self.block('使用前必须水平调零，消除零点误差。', 'E2'); return; }
          st.zeroErr1 = 0.30; st.zeroErr2 = 0.30; self.stage.invalidate('fg'); self.renderSide();
        })));
      ctl.appendChild(row(h('span.side-l', '对拉力度'),
        chip('−', false, function () { st.calPullN = P.clamp(st.calPullN - 0.5, 0.5, 3.5); self.stage.invalidate('fg'); self.renderSide(); }, '减小对拉拉力'),
        h('b.side-v', st.calPullN.toFixed(2) + ' N'),
        chip('+', false, function () { st.calPullN = P.clamp(st.calPullN + 0.5, 0.5, 3.5); self.stage.invalidate('fg'); self.renderSide(); }, '增大对拉拉力')));
      ctl.appendChild(h('div.m06-readout', {
        html: '甲表：<b>' + (st.calPullN + st.zeroErr1).toFixed(2) + ' N</b>　｜　乙表：<b>' + (st.calPullN + st.zeroErr2).toFixed(2) + ' N</b><br>' +
          '差值：' + Math.abs(st.zeroErr1 - st.zeroErr2).toFixed(2) + ' N（需两表均调零一致）'
      }));
    } else if (this.stageId === 'two' || this.stageId === 'single' || this.stageId === 'plot') {
      ctl.appendChild(h('div.side-k', '分力角度与实验条件'));
      ctl.appendChild(row(h('span.side-l', '左角 θ₁'),
        chip('−5°', false, function () { st.theta1Deg = P.clamp(st.theta1Deg - 5, 9, 75); if (self.stageId === 'plot') self.computeResult(); self.stage.invalidate('fg'); self.renderSide(); }, '减小左角 θ₁'),
        h('b.side-v', st.theta1Deg + '°'),
        chip('+5°', false, function () {
          var next = P.clamp(st.theta1Deg + 5, 9, 75);
          if (self.guided() && next + st.theta2Deg > 115) { self.block('两分力夹角过大易超 5 N 量程，建议保持在 60°～120° 内。', 'E5'); return; }
          st.theta1Deg = next; if (self.stageId === 'plot') self.computeResult(); self.stage.invalidate('fg'); self.renderSide();
        }, '增大左角 θ₁')));
      ctl.appendChild(row(h('span.side-l', '右角 θ₂'),
        chip('−5°', false, function () { st.theta2Deg = P.clamp(st.theta2Deg - 5, 9, 75); if (self.stageId === 'plot') self.computeResult(); self.stage.invalidate('fg'); self.renderSide(); }, '减小右角 θ₂'),
        h('b.side-v', st.theta2Deg + '°'),
        chip('+5°', false, function () {
          var next = P.clamp(st.theta2Deg + 5, 9, 75);
          if (self.guided() && st.theta1Deg + next > 115) { self.block('两分力夹角过大易超 5 N 量程，建议保持在 60°～120° 内。', 'E5'); return; }
          st.theta2Deg = next; if (self.stageId === 'plot') self.computeResult(); self.stage.invalidate('fg'); self.renderSide();
        }, '增大右角 θ₂')));
      if (!this.guided()) {
        ctl.appendChild(row(h('span.side-l', '错误注入'),
          chip(st.liftDeg ? '抬起22°' : '平行0°', st.liftDeg > 0, function () { st.liftDeg = st.liftDeg ? 0 : 22; if (self.stageId === 'plot') self.computeResult(); self.stage.invalidate('fg'); self.renderSide(); }),
          chip(st.markDist < 0.05 ? '短绳2.5cm' : '长绳12cm', st.markDist < 0.05, function () { st.markDist = st.markDist < 0.05 ? 0.120 : 0.025; if (self.stageId === 'plot') self.computeResult(); self.stage.invalidate('fg'); self.renderSide(); }),
          chip('145°超程', st.theta1Deg + st.theta2Deg >= 140, function () { st.theta1Deg = 72.5; st.theta2Deg = 72.5; if (self.stageId === 'plot') self.computeResult(); self.stage.invalidate('fg'); self.renderSide(); })));
      }
      var two = FF.twoForceEquilibrium(FF.F_EQ_STD, st.theta1Deg, st.theta2Deg);
      var res = st.lastResult;
      var roClass = (two.overRange || (res && res.relMagErr > 0.04)) ? 'm06-readout.warn' : 'm06-readout';
      if (this.stageId === 'plot' && res) {
        ctl.appendChild(h('div.' + roClass, {
          html: 'F₁ = <b>' + res.F1Read.toFixed(2) + ' N</b>, F₂ = <b>' + res.F2Read.toFixed(2) + ' N</b> (α=' + res.alphaDeg.toFixed(1) + '°)<br>' +
            '理论 F = <b>' + res.F_theory.mag.toFixed(2) + ' N</b> ｜ 实际 F\' = <b>' + res.F_actual.mag.toFixed(2) + ' N</b> (误差 ' + (res.relMagErr * 100).toFixed(1) + '%)'
        }));
      } else {
        ctl.appendChild(h('div.' + roClass, {
          html: '夹角 α = ' + (st.theta1Deg + st.theta2Deg).toFixed(1) + '° ｜ F₁ ≈ <b>' + two.F1.toFixed(2) + ' N</b>, F₂ ≈ <b>' + two.F2.toFixed(2) + ' N</b>' +
            (two.overRange ? '<br><b>⚠ 超出 5.0 N 量程！</b>' : '')
        }));
      }
    }

    ctl.appendChild(h('div.side-acts',
      h('button.btn', { type: 'button', onclick: function () {
        if (self.guided()) {
          if (!st.calDone) { self.block('请先在“① 对拉校准”中完成水平调零并点击“校准合格，进入双拉”。', 'E2'); return; }
          if (!st.twoRecorded) { self.block('请先在“② 双计互拉”中记录两分力 F₁、F₂ 与方向点。', 'E4'); return; }
          if (!st.singleRecorded) { self.block('请先在“③ 单计等效”将结点拉至 O 点并记录 F\'，再查看对比分析！', 'E1'); return; }
        }
        self.recordTrial();
      } }, '查看数据分析'),
      h('button.btn', { type: 'button', onclick: function () {
        st.calDone = false; st.zeroErr1 = 0; st.zeroErr2 = 0; st.liftDeg = 0; st.markDist = 0.120;
        st.theta1Deg = 35; st.theta2Deg = 45; st.pullPct = 1.0; st.singleKnotX = 0; st.singleKnotY = FF.Y_O;
        st.twoRecorded = false; st.singleRecorded = false; st.lastResult = null;
        self.setStage('cal', true); self.setBanner(null); self.stage.invalidate(); self.renderStageActs(); self.renderSide();
      } }, '重置实验台')));
    side.appendChild(ctl);

    if (this.guided()) {
      side.appendChild(h('div.side-k', '实验步骤'));
      var ids = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
      var curId = null;
      for (var i = 0; i < ids.length; i++) { if (!this.done[ids[i]]) { curId = ids[i]; break; } }
      var ol6 = h('ol.steps', ids.map(function (id) {
        var p = PROC[id], ok = !!self.done[id], isCur = id === curId;
        return h('li' + (ok ? '.ok' : '') + (isCur ? '.cur' : ''),
          h('div.st-t', (ok ? '✓ ' : isCur ? '▸ ' : '') + p.title),
          h('div.st-how', { html: M.tex(p.how) }),
          p.why ? h('div.st-why', { html: M.tex('理由：' + p.why) }) : null,
          p.errorId ? h('button.link.sm', { type: 'button', onclick: function () { openTry(p.errorId); } }, '为什么？试一试 →') : null);
      }));
      side.appendChild(ol6);
      var curLi6 = ol6.querySelector('li.cur');
      if (curLi6) {
        if (ol6.scrollHeight > ol6.clientHeight) ol6.scrollTop = Math.max(0, curLi6.offsetTop - ol6.offsetTop - 8);
        else if (side.scrollHeight > side.clientHeight) side.scrollTop = Math.max(0, curLi6.offsetTop - side.offsetTop - 44);
      }
    } else {
      side.appendChild(h('div.side-tip', '自由模式：可关闭“调零”或切换“抬起 22° / 短绳 2.5 cm / 145° 超程 / 结点偏移 O 点”，然后点“查看数据分析”看物理模型真实后果！'));
    }
  };

  /* ---------- 下方数据分析区（默认 hidden，记录或展开时显示） ---------- */
  Bench.prototype.renderAnalysis = function (scroll) {
    var el = this.analysis;
    el.hidden = false;
    ML.clear(el);
    var last = this.trials[this.trials.length - 1];
    var tags = last ? last.tags : [];

    el.appendChild(h('div.ana-head',
      h('h2.ana-h', '力的合成实验数据与夹角量程分析'),
      h('button.btn.sm', { type: 'button', onclick: function () { el.hidden = true; } }, '收起分析区')));

    var tagBar = h('div.ana-tags');
    if (tags.length) {
      tagBar.appendChild(h('span.tag.err', '⚠ 最近一组存在操作误差'));
      tags.forEach(function (id) {
        tagBar.appendChild(h('button.tag', { type: 'button', onclick: function () { openTry(id); } }, ERR[id].name + ' → 试一试'));
      });
    } else {
      tagBar.appendChild(h('span.tag.ok', '✓ 操作规范：理论合力 F 与单拉实际值 F\' 在允许误差内重合'));
    }
    el.appendChild(tagBar);

    var tblRows = this.trials.map(function (r) {
      var bad = r.overRange || r.relErrPct > 4 || r.angDiff > 2.5;
      return h('tr' + (bad ? '.hl' : ''),
        h('td', String(r.idx)),
        h('td', r.theta1 + '° / ' + r.theta2 + '° (' + r.alpha.toFixed(0) + '°)'),
        h('td', r.F1.toFixed(2)),
        h('td', r.F2.toFixed(2)),
        h('td', r.F_th.toFixed(2)),
        h('td', r.F_act.toFixed(2)),
        h('td', r.relErrPct.toFixed(1) + '%'),
        h('td', r.angDiff.toFixed(1) + '°'),
        h('td', r.overRange ? '超 5N 量程' : (bad ? '偏差较大' : '合格 ✓')));
    });

    var tblBox = h('div.ana-block',
      h('h3', { html: '实验记录表（标准 F<sub>eq</sub> = 4.00 N）' }),
      h('div.tbl-wrap', { tabindex: '0', role: 'region', 'aria-label': '力的合成实验数据表' },
        h('table.dt.ana-tbl',
          h('tr', h('th', '组'), h('th', 'θ₁/θ₂ (α)'), h('th', 'F₁/N'), h('th', 'F₂/N'), h('th', '理论 F/N'), h('th', "实际 F'/N"), h('th', '大小误差'), h('th', '偏角'), h('th', '判定')),
          tblRows)));

    var chartBox = h('div.ana-block', h('h3', { html: '等大对称分力随夹角 α 变化曲线（F<sub>eq</sub> = 4.00 N）' }));
    var ch = new ML.Chart(chartBox, { xLabel: '两分力夹角 α / °', yLabel: '分力 F / N', height: 224, x: [20, 160], y: [0, 8] });
    var curvePts = [], rangeLine = [[20, 5], [160, 5]];
    for (var a = 20; a <= 155; a += 5) curvePts.push([a, FF.symmetricForce(FF.F_EQ_STD, a)]);
    var recPts = this.trials.map(function (r) { return [r.alpha, Math.max(r.F1, r.F2)]; });
    var rangeAngle = 2 * Math.acos(FF.F_EQ_STD / (2 * FF.RANGE_MAX)) * 180 / Math.PI;
    var series = [
      { pts: curvePts, color: '#1661FF', label: '对称分力 F = Feq / (2 cos(α/2))' },
      { pts: [], line: rangeLine, dash: true, color: '#C7374B', label: '5.0 N 量程（临界角约 ' + rangeAngle.toFixed(2) + '°）' }
    ];
    if (recPts.length) series.push({ pts: recPts, color: '#25A870', mark: 'x', label: '实测分力 max(F₁,F₂)' });
    ch.set(series);

    el.appendChild(h('div.ana-grid', tblBox, chartBox));
    if (scroll) el.scrollIntoView({ behavior: ML.perf.low ? 'auto' : 'smooth', block: 'start' });
  };

  /* =====================================================================
   *  ③ 诊·误差：四拍试一试 & 结果反推适配器
   * ===================================================================== */
  function drawVectorCompare(ctx, w, hh, res, title, badNote) {
    ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
    D.text(ctx, title, 12, 20, { size: 12.5, weight: 700, color: '#10233F' });
    var ax = w * 0.44, ay = 34, oy = 84, sc = Math.min(20, (hh - oy - 26) / Math.max(4.6, res.F_theory.mag, res.F_actual.mag));
    ctx.strokeStyle = '#7A5C3E'; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, oy); ctx.stroke();
    ctx.fillStyle = '#12A9C4'; ctx.beginPath(); ctx.arc(ax, oy, 3.5, 0, Math.PI * 2); ctx.fill();
    D.text(ctx, 'A', ax + 8, ay + 4, { size: 11, weight: 700 });
    D.text(ctx, 'O', ax - 10, oy + 4, { align: 'right', size: 11, weight: 700 });

    var r1 = res.theta1Meas * Math.PI / 180, r2 = res.theta2Meas * Math.PI / 180;
    var f1x = -res.F1Read * Math.sin(r1) * sc, f1y = res.F1Read * Math.cos(r1) * sc;
    var f2x = res.F2Read * Math.sin(r2) * sc, f2y = res.F2Read * Math.cos(r2) * sc;
    var rA = res.F_actual.angleDeg * Math.PI / 180;
    var fax = res.F_actual.mag * Math.sin(rA) * sc, fay = res.F_actual.mag * Math.cos(rA) * sc;

    ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(ax + f1x, oy + f1y); ctx.lineTo(ax + f1x + f2x, oy + f1y + f2y);
    ctx.moveTo(ax + f2x, oy + f2y); ctx.lineTo(ax + f1x + f2x, oy + f1y + f2y); ctx.stroke(); ctx.restore();

    drawArrow(ctx, ax, oy, ax + f1x, oy + f1y, '#12A9C4', 1.8, 7);
    drawArrow(ctx, ax, oy, ax + f2x, oy + f2y, '#E07B24', 1.8, 7);
    drawArrow(ctx, ax, oy, ax + fax, oy + fay, '#25A870', 2.6, 8);
    drawArrow(ctx, ax, oy, ax + f1x + f2x, oy + f1y + f2y, badNote ? '#C7374B' : '#1661FF', 2.2, 8);

    D.text(ctx, '理论 F = ' + res.F_theory.mag.toFixed(2) + ' N', w - 12, 48, { align: 'right', size: 12, weight: 700, color: badNote ? '#C7374B' : '#1661FF' });
    D.text(ctx, "实际 F' = " + res.F_actual.mag.toFixed(2) + ' N', w - 12, 68, { align: 'right', size: 12, weight: 700, color: '#17784F' });
    D.text(ctx, '偏差 ' + (res.relMagErr * 100).toFixed(1) + '% | 偏角 ' + res.angleDiffDeg.toFixed(1) + '°', w - 12, 88, { align: 'right', size: 11.5, color: '#4A5B73' });
    if (badNote) D.text(ctx, badNote, 12, hh - 10, { size: 11.5, weight: 700, color: '#C7374B' });
  }

  var adapter = {
    compare: function (err, area, done) {
      var tids = [];
      function defer(fn, ms) {
        var id = setTimeout(function () { if (area && area.isConnected) fn(); }, ms);
        tids.push(id);
      }
      var resGood = FF.solveExperiment({ ideal: true }, 1);
      if (err.id === 'E1' || err.id === 'E2' || err.id === 'E3') {
        var cfg = err.config || {};
        var resBad = FF.solveExperiment(Object.assign({ ideal: true }, cfg), 1);
        var split = h('div.cmp-split');
        var wG = h('div.try-stage-wrap'), wB = h('div.try-stage-wrap');
        split.appendChild(wG); split.appendChild(wB); area.appendChild(split);
        var sG = new ML.stage.Stage(wG, { layers: ['bg'] }), sB = new ML.stage.Stage(wB, { layers: ['bg'] });
        var tagMsg = err.id === 'E1' ? '⚠ 单拉偏移 1.6 cm：F\' 变为 4.71 N' : err.id === 'E2' ? '⚠ 零误差 +0.30 N：F 偏大至 4.46 N' : '⚠ 抬起 22°+摩擦：F > F\' (+11.7%)';
        sG.on('bg', function (ctx, w, hh) { drawVectorCompare(ctx, w, hh, resGood, '正确操作（理想参照）', null); });
        sB.on('bg', function (ctx, w, hh) { drawVectorCompare(ctx, w, hh, resBad, '错误：' + err.name, tagMsg); });
        area.appendChild(h('div.cmp-note', { html: '物理模型实测：正确操作大小误差 0.0%；错误操作导致理论 F 与实际 F\' 相差 <b>' + (resBad.relMagErr * 100).toFixed(1) + '%</b>，方向偏离 <b>' + resBad.angleDiffDeg.toFixed(1) + '°</b>。' }));
        defer(done, 120);
      } else if (err.id === 'E4') {
        var longPts = [], shortPts = [], longAng = [], shortAng = [];
        for (var i = 0; i < 12; i++) {
          var rL = FF.solveExperiment({ markDist: 0.120, ideal: false }, 50 + i * 17);
          var rS = FF.solveExperiment({ markDist: 0.025, ideal: false }, 50 + i * 17);
          longPts.push([rL.F_theory.fx, rL.F_theory.fy]);
          shortPts.push([rS.F_theory.fx, rS.F_theory.fy]);
          longAng.push(rL.theta1Meas); shortAng.push(rS.theta1Meas);
        }
        var ch4 = new ML.Chart(area, { xLabel: 'Fₓ / N', yLabel: 'Fᵧ / N', height: 215, paper: true, x: [-0.8, 0.8], y: [3.3, 4.7] });
        ch4.set([
          { pts: longPts, color: '#25A870', label: '长绳 12 cm（σ_θ = ' + P.std(longAng).toFixed(2) + '°）' },
          { pts: shortPts, color: '#C7374B', mark: 'x', label: '短绳 2.5 cm（σ_θ = ' + P.std(shortAng).toFixed(2) + '°）' }
        ]);
        area.appendChild(h('div.cmp-note', '同样 1.5 mm 铅笔点抖动下，2.5 cm 短绳的方向角标准差是 12.0 cm 长绳的 ' + (P.std(shortAng) / P.std(longAng)).toFixed(1) + ' 倍！'));
        defer(done, 120);
      } else if (err.id === 'E5') {
        var ch5 = new ML.Chart(area, { xLabel: '两分力夹角 α / °', yLabel: '对称分力 F₁=F₂ / N', height: 210, x: [15, 160], y: [0, 8] });
        var pts5 = [];
        for (var a = 20; a <= 150; a += 5) pts5.push([a, FF.symmetricForce(FF.F_EQ_STD, a)]);
        var p145 = FF.twoForceEquilibrium(FF.F_EQ_STD, 72.5, 72.5), p18 = FF.twoForceEquilibrium(FF.F_EQ_STD, 9, 9);
        ch5.set([
          { pts: pts5, color: '#1661FF', label: 'F(α) 变化曲线' },
          { pts: [], line: [[15, 5], [160, 5]], dash: true, color: '#C7374B', label: '5.0 N 量程上限' },
          { pts: [[145, p145.F1], [18, p18.F1]], color: '#C7374B', mark: 'x', label: '145°(6.65 N超程) 与 18°(狭长)' }
        ]);
        area.appendChild(h('div.cmp-note', '夹角 145° 时分力高达 ' + p145.F1.toFixed(2) + ' N（远超 5 N 量程）；夹角 18° 时作图误差被 1/sin 18° ≈ 3.2 倍放大。'));
        defer(done, 120);
      } else if (err.id === 'E6') {
        var resAsym = FF.solveExperiment({ theta1Deg: 30, theta2Deg: 50, ideal: true }, 1);
        var wrap6 = h('div.try-stage-wrap'); area.appendChild(wrap6);
        var s6 = new ML.stage.Stage(wrap6, { layers: ['bg'] });
        s6.on('bg', function (ctx, w, hh) { drawVectorCompare(ctx, w, hh, resAsym, '非直角不等分力（θ₁=30°, θ₂=50°, F₁=3.11 N, F₂=2.03 N）', null); });
        area.appendChild(h('div.cmp-note', '无需夹角 90° 或 F₁ = F₂：非对称 30°+50° 同样得出 F = ' + resAsym.F_theory.mag.toFixed(2) + ' N 与 F\' = ' + resAsym.F_actual.mag.toFixed(2) + ' N 精准重合！'));
        defer(done, 120);
      }
      return function () {
        tids.forEach(function (id) { clearTimeout(id); });
        tids.length = 0;
      };
    },
    show: function (c, vis) {
      var sh = c.show || {};
      var wrap = h('div.rev-stage-wrap'); vis.appendChild(wrap);
      var stg = new ML.stage.Stage(wrap, { layers: ['bg'] });
      if (sh.type === 'diagram-ff' || sh.type === 'diagram-lift') {
        var isLift = sh.type === 'diagram-lift';
        var res = isLift
          ? FF.solveExperiment({ liftDeg: 22, fCase: 0.10, ideal: true }, 1)
          : FF.solveExperiment({ theta1Deg: 35, theta2Deg: 45, zeroErr1: 0.12, zeroErr2: -0.04, ideal: true }, 1);
        stg.on('bg', function (ctx, w, hh) {
          drawVectorCompare(ctx, w, hh, res, isLift ? '结果：F = 4.47 N 明显大于 F\' = 4.00 N' : '白纸作图结果：F 与 F\' 对照', null);
        });
      } else if (sh.type === 'dynamic-tri') {
        stg.on('bg', function (ctx, w, hh) {
          ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
          var ox = 90, oy = 32, fEqPx = 116;
          drawArrow(ctx, ox, oy, ox, oy + fEqPx, '#25A870', 2.8, 9);
          D.text(ctx, 'Feq (恒定)', ox - 8, oy + fEqPx * 0.55, { align: 'right', size: 12, weight: 700, color: '#17784F' });
          var th1 = 35 * Math.PI / 180;
          ctx.strokeStyle = '#12A9C4'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(ox, oy + fEqPx); ctx.lineTo(ox + 160 * Math.sin(th1), oy + fEqPx - 160 * Math.cos(th1)); ctx.stroke(); ctx.setLineDash([]);
          D.text(ctx, 'F₁ 方向线 (θ₁=35°)', ox + 108, oy + 26, { size: 11.5, weight: 700, color: '#0E8CA3' });
          var pLen = fEqPx * Math.sin(th1), px = ox + pLen * Math.cos(th1), py = oy + pLen * Math.sin(th1);
          drawArrow(ctx, ox, oy, px, py, '#1661FF', 2.6, 8);
          D.text(ctx, 'F₂(min) ⊥ F₁', px + 8, py + 4, { size: 12, weight: 700, color: '#1661FF' });
          [20, 80].forEach(function (t2d) {
            var d = FF.dynamicEquilibrium(FF.F_EQ_STD, 35, t2d);
            var l2 = (d.F2 / FF.F_EQ_STD) * fEqPx, r2 = t2d * Math.PI / 180;
            drawArrow(ctx, ox, oy, ox + l2 * Math.sin(r2), oy + l2 * Math.cos(r2), '#C7374B', 1.6, 7);
          });
          D.text(ctx, 'θ₂=55° 时垂线段最短（F₂ 最小）', w - 14, hh - 14, { align: 'right', size: 12, weight: 700, color: '#1661FF' });
        });
      } else if (sh.type === 'pair-pull') {
        stg.on('bg', function (ctx, w, hh) {
          ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
          var cx = w / 2, cy = hh * 0.48;
          drawDyn2D(ctx, cx - 6, cy, Math.PI / 2, 2.20, '甲', { bodyLen: 108, labelSide: -24 });
          drawDyn2D(ctx, cx + 6, cy, -Math.PI / 2, 2.00, '乙', { bodyLen: 108, labelSide: 24 });
          D.text(ctx, '不同拉力下始终差 0.20 N（例：2.20 N vs 2.00 N；3.70 N vs 3.50 N）', cx, hh - 16, { align: 'center', size: 12, weight: 700, color: '#C7374B' });
        });
      }
    },
    restore: function () {
      if (!bench) { S.mode = 'guided'; ML.store.save(); return; }
      bench.setMode('guided', true); bench.resetExperiment(false);
    },
    replay: function (errId) {
      var e = ERR[errId]; if (!e) return;
      shell.go('bench');
      if (bench.applyReplay) bench.applyReplay(errId, e);
      if (shell.main) shell.main.scrollTop = 0;
    }
  };

  function openTry(id) {
    var e = ERR[id];
    if (e) ML.TryIt(e, adapter, e.noteId && PROC[e.noteId] ? '<b>' + PROC[e.noteId].title + '：</b>' + PROC[e.noteId].how + ' ' + PROC[e.noteId].why : '');
  }

  /* =====================================================================
   *  ① 学·原理：6 页交互小部件
   * ===================================================================== */
  var learnStopFn = null;
  function learnWidget(p, card) {
    if (learnStopFn) { learnStopFn(); learnStopFn = null; }
    var box = h('div.learn-widget');
    card.appendChild(box);

    if (p.widget === 'equiv-demo') {
      var mode = 'two';
      var bar = h('div.side-row',
        h('button.chip.on', { type: 'button', onclick: function () { setM('two', 0); } }, '两只测力计互拉至 O'),
        h('button.chip', { type: 'button', onclick: function () { setM('single', 1); } }, '一只测力计拉至同一 O'));
      var wrap = h('div.m06-w-stage.short'); box.appendChild(bar); box.appendChild(wrap);
      var stg = new ML.stage.Stage(wrap, { layers: ['bg'] });
      stg.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var ax = w * 0.48, ay = 22, oy = 84;
        ctx.strokeStyle = '#94A3B8'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(ax, oy); ctx.lineTo(ax, hh - 16); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = '#7A5C3E'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, oy); ctx.stroke();
        ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.arc(ax, ay, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#25A870'; ctx.beginPath(); ctx.arc(ax, oy, 4.5, 0, Math.PI * 2); ctx.fill();
        D.text(ctx, 'A', ax + 10, ay + 4, { size: 12, weight: 700 });
        D.text(ctx, '同一结点 O', ax - 10, oy + 4, { align: 'right', size: 12, weight: 700, color: '#17784F' });
        if (mode === 'two') {
          drawArrow(ctx, ax, oy, ax - 54, oy + 72, '#12A9C4', 2.4, 8);
          drawArrow(ctx, ax, oy, ax + 64, oy + 62, '#E07B24', 2.4, 8);
          D.text(ctx, 'F₁、F₂ 共同把橡皮条拉长 8.0 cm 到 O', ax, hh - 10, { align: 'center', size: 12, weight: 700, color: '#1661FF' });
        } else {
          drawArrow(ctx, ax, oy, ax, oy + 82, '#25A870', 2.8, 9);
          D.text(ctx, "F' 单独拉橡皮条到同一 O 点（作用效果完全等效）", ax, hh - 10, { align: 'center', size: 12, weight: 700, color: '#17784F' });
        }
      });
      function setM(m, idx) { mode = m; ML.$$('.chip', bar).forEach(function (c, i) { c.classList.toggle('on', i === idx); }); stg.invalidate('bg'); }
    } else if (p.widget === 'ffprime-demo') {
      var resFF = FF.solveExperiment({ theta1Deg: 35, theta2Deg: 45, zeroErr1: 0.14, zeroErr2: -0.05, ideal: true }, 1);
      var wrapF = h('div.m06-w-stage'); box.appendChild(wrapF);
      var stgF = new ML.stage.Stage(wrapF, { layers: ['bg'] });
      stgF.on('bg', function (ctx, w, hh) {
        drawVectorCompare(ctx, w, hh, resFF, "绿色 F' 沿 AO（实际值） vs 蓝色 F 为平行四边形对角线（理论值）", null);
      });
    } else if (p.widget === 'dyn-demo') {
      var gbHost = h('div'), zErr = 0, fVal = 2.87;
      var barD = h('div.side-row',
        h('button.chip.on', { type: 'button', onclick: function () { setD(2.87, 0, 0); } }, '标准已调零 (2.87 N)'),
        h('button.chip', { type: 'button', onclick: function () { setD(2.87, 0.30, 1); } }, '未调零 (+0.30 N 偏置)'),
        h('button.chip', { type: 'button', onclick: function () { setD(2.00, 0, 2); } }, '整数刻线估读 (2.00 N)'));
      box.appendChild(barD); box.appendChild(gbHost);
      var gb = new GV.GaugeBench(gbHost, { height: 224, state: { type: 'dynamometer', trueForceN: fVal, zeroOffsetN: zErr } });
      function setD(f, z, idx) {
        fVal = f; zErr = z;
        ML.$$('.chip', barD).forEach(function (c, i) { c.classList.toggle('on', i === idx); });
        gb.set({ trueForceN: f, zeroOffsetN: z });
      }
    } else if (p.widget === 'diagram-demo') {
      var wrapD = h('div.m06-w-stage.short'); box.appendChild(wrapD);
      var stgD = new ML.stage.Stage(wrapD, { layers: ['bg'] });
      stgD.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(24, 24); ctx.lineTo(64, 24); ctx.moveTo(24, 20); ctx.lineTo(24, 28); ctx.moveTo(64, 20); ctx.lineTo(64, 28); ctx.stroke();
        D.text(ctx, '标度：1 cm = 1.0 N', 72, 28, { size: 12, weight: 700 });
        var ox = w * 0.45, oy = 32;
        ctx.fillStyle = '#10233F'; ctx.beginPath(); ctx.arc(ox, oy, 3.5, 0, Math.PI * 2); ctx.fill();
        D.text(ctx, 'O', ox - 10, oy + 4, { align: 'right', size: 12, weight: 700 });
        drawArrow(ctx, ox, oy, ox - 56, oy + 80, '#12A9C4', 2.2, 8);
        drawArrow(ctx, ox, oy, ox + 72, oy + 52, '#E07B24', 2.2, 8);
        ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#64748B'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(ox - 56, oy + 80); ctx.lineTo(ox + 16, oy + 132); ctx.lineTo(ox + 72, oy + 52); ctx.stroke(); ctx.restore();
        drawArrow(ctx, ox, oy, ox + 16, oy + 132, '#1661FF', 2.6, 9);
        D.text(ctx, '实线带箭头表力矢量，虚线表平行四边形辅助线', w - 16, hh - 12, { align: 'right', size: 11.5, weight: 700, color: '#1661FF' });
      });
    } else if (p.widget === 'ops-demo') {
      var modeO = 'lift';
      var barO = h('div.side-row',
        h('button.chip.on', { type: 'button', onclick: function () { selO('lift', 0); } }, '抬起 22° vs 平行'),
        h('button.chip', { type: 'button', onclick: function () { selO('mark', 1); } }, '短绳 2.5 cm vs 长绳'),
        h('button.chip', { type: 'button', onclick: function () { selO('ang', 2); } }, '夹角 145° 超量程'));
      var noteO = h('div.cmp-note');
      box.appendChild(barO); box.appendChild(noteO);
      function selO(m, idx) {
        modeO = m; ML.$$('.chip', barO).forEach(function (c, i) { c.classList.toggle('on', i === idx); });
        if (m === 'lift') {
          var rL = FF.solveExperiment({ liftDeg: 22, fCase: 0.10, ideal: true }, 1);
          noteO.innerHTML = '抬起 22° 并产生 0.10 N 摩擦时，平行四边形合力 F = <b>' + rL.F_theory.mag.toFixed(2) + ' N</b> > 单拉 F\' = <b>' + rL.F_actual.mag.toFixed(2) + ' N</b>（偏差 +' + (rL.relMagErr * 100).toFixed(1) + '%）。';
        } else if (m === 'mark') {
          noteO.innerHTML = '铅笔点偏差 1.5 mm：在 12.0 cm 长绳下角误差仅 <b>0.72°</b>；若缩成 2.5 cm 短绳，角误差放大到 <b>3.44°</b>（4.8 倍）！';
        } else {
          var rA = FF.twoForceEquilibrium(FF.F_EQ_STD, 72.5, 72.5);
          noteO.innerHTML = '当 F<sub>eq</sub> = 4.00 N 且两力夹角拉到 145° 时，两分力 F₁ = F₂ = <b>' + rA.F1.toFixed(2) + ' N</b>，严重超出 5.0 N 量程！';
        }
      }
      selO('lift', 0);
    } else if (p.widget === 'dynamic-demo') {
      var th2 = 55, sweeping = false;
      var rng = h('input', { type: 'range', min: '20', max: '85', step: '1', value: '55', 'aria-label': '调节 F₂ 角度 θ₂', style: { flex: '1', minWidth: '120px' }, oninput: function () { sweeping = false; sweepBtn.textContent = '演示旋转扫描'; th2 = parseInt(rng.value, 10); upd(); } });
      var perpBtn = h('button.chip.on', { type: 'button', onclick: function () { sweeping = false; sweepBtn.textContent = '演示旋转扫描'; th2 = 55; rng.value = '55'; upd(); } }, '直达 F₂ ⊥ F₁ (θ₂=55°)');
      var sweepBtn = h('button.chip', { type: 'button', onclick: function () {
        sweeping = !sweeping;
        sweepBtn.textContent = sweeping ? '停止扫描' : '演示旋转扫描';
        if (sweeping) { if (th2 >= 84) th2 = 20; lpTri.start(); } else lpTri.stop();
      } }, '演示旋转扫描');
      var infoD = h('div.cmp-note');
      var wrapTri = h('div.m06-w-stage.short');
      box.appendChild(h('div.side-row', h('span.side-l', '转动 θ₂'), rng, perpBtn, sweepBtn));
      box.appendChild(wrapTri); box.appendChild(infoD);
      var stgTri = new ML.stage.Stage(wrapTri, { layers: ['bg'] });
      var lpTri = new ML.stage.Loop(function (dt) {
        if (!sweeping || !wrapTri.isConnected) { sweeping = false; return false; }
        th2 = Math.min(85, th2 + dt * 22);
        rng.value = String(Math.round(th2));
        upd();
        if (th2 >= 85) { sweeping = false; sweepBtn.textContent = '演示旋转扫描'; return false; }
        return true;
      });
      learnStopFn = function () { sweeping = false; lpTri.stop(); sweepBtn.textContent = '演示旋转扫描'; };
      stgTri.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var d = FF.dynamicEquilibrium(FF.F_EQ_STD, 35, th2);
        var nearPerp = d.isPerp || Math.abs(35 + th2 - 90) < 0.8;
        var ox = w * 0.34, oy = 24, fEqPx = hh - 52;
        drawArrow(ctx, ox, oy, ox, oy + fEqPx, '#25A870', 2.8, 9);
        D.text(ctx, 'Feq = 4.00 N', ox - 8, oy + fEqPx * 0.52, { align: 'right', size: 11.5, weight: 700, color: '#17784F' });
        var l2 = (d.F2 / FF.F_EQ_STD) * fEqPx, r2 = th2 * Math.PI / 180;
        var tip2x = ox + l2 * Math.sin(r2), tip2y = oy + l2 * Math.cos(r2);
        drawArrow(ctx, ox, oy, tip2x, tip2y, nearPerp ? '#1661FF' : '#E07B24', 2.6, 8);
        drawArrow(ctx, tip2x, tip2y, ox, oy + fEqPx, '#12A9C4', 2.2, 8);
        if (nearPerp) D.text(ctx, '90°', tip2x - 16, tip2y + 4, { align: 'right', size: 10.5, weight: 700, color: '#1661FF' });
        D.text(ctx, 'F₂ = ' + d.F2.toFixed(2) + ' N', tip2x + 8, tip2y, { size: 12, weight: 700, color: nearPerp ? '#1661FF' : '#C25E0A' });
        D.text(ctx, 'F₁ = ' + d.F1.toFixed(2) + ' N', (tip2x + ox) / 2 + 12, (tip2y + oy + fEqPx) / 2 + 6, { size: 11.5, weight: 700, color: '#0E8CA3' });
      });
      function upd() {
        var d = FF.dynamicEquilibrium(FF.F_EQ_STD, 35, th2);
        var nearPerp = d.isPerp || Math.abs(35 + th2 - 90) < 0.8;
        perpBtn.classList.toggle('on', nearPerp);
        infoD.innerHTML = 'θ₁ = 35°, θ₂ = <b>' + Math.round(th2) + '°</b>（两力夹角 ' + Math.round(35 + th2) + '°）：F₂ = <b>' + d.F2.toFixed(2) + ' N</b>，理论最小值 F<sub>2,min</sub> = ' + d.F2Min.toFixed(2) + ' N' + (nearPerp ? ' <b style="color:#17784F">✓ 垂直最小!</b>' : '');
        stgTri.invalidate('bg');
      }
      upd();
    }
  }

  /* =====================================================================
   *  组装四区一卡
   * ===================================================================== */
  var shell = new ML.Shell({
    title: C.title, sub: C.sub, summary: C.summary,
    tabs: [
      { id: 'learn', label: '学·原理', mount: function (el) { ML.Learn(el, C.learn, C.equipment, { onPage: learnWidget, onFinish: function () { shell.go('bench'); } }); } },
      { id: 'bench', label: '做·实验', mount: function (el) { bench = new ML.M06StudentBench(el); } },
      { id: 'diag', label: '诊·误差', mount: function (el) {
        var wrap = h('div.diag'); el.appendChild(wrap);
        wrap.appendChild(h('h2.diag-h', 'A. 错误操作实验室'));
        wrap.appendChild(h('p.muted', '每个“试一试”按四拍进行：布置 → 运行 → 对比 → 追问与揭示。所有矢量偏差与散度均由物理模型实时算出。'));
        var grid = h('div.err-grid'), cardMap = {};
        C.errors.forEach(function (e) {
          var note = PROC[e.noteId];
          var card = h('div.err-card' + ((S.done || {})[e.id] ? '.done' : ''),
            h('div.err-name', ((S.done || {})[e.id] ? '✓ ' : '') + e.name),
            note ? h('div.err-note', { html: '<b>注意事项：</b>' + M.tex(note.how) }) : null,
            h('button.btn.primary.sm', { type: 'button', onclick: function () { openTry(e.id); } }, '试一试'));
          cardMap[e.id] = card; grid.appendChild(card);
        });
        ML.bus.on('try:done', function (id) {
          var card = cardMap[id];
          if (!card || card.classList.contains('done')) return;
          card.classList.add('done');
          var nameEl = ML.$('.err-name', card);
          if (nameEl && nameEl.textContent.indexOf('✓ ') !== 0) nameEl.textContent = '✓ ' + nameEl.textContent;
        });
        wrap.appendChild(grid);
        wrap.appendChild(h('h2.diag-h', 'B. 结果反推'));
        wrap.appendChild(h('p.muted', '先根据异常现象或矢量图判断原因，再去实验台亲手复现。'));
        var rev = h('div.rev'); wrap.appendChild(rev);
        ML.Reverse(rev, C.reverse, adapter);
      } },
      { id: 'paper', label: '练·真题', mount: function (el) { new ML.Paper(el, Q, { title: C.title.replace('实验：', '') + ' · 练习', onReplay: adapter.replay }); } }
    ]
  });
  ML.bus.on('tab', function (tabId) {
    if (tabId !== 'learn' && learnStopFn) learnStopFn();
    if (tabId !== 'bench' && bench && bench.mag) bench.mag.hide();
  });
  setTimeout(function () { shell.go(S.tab); }, 0);
  ML.perf.probe();
  ML.m06 = { bench: function () { return bench; }, adapter: adapter, shell: shell };
})(typeof window !== 'undefined' ? (window.ML = window.ML || {}) : (globalThis.ML = globalThis.ML || {}));
