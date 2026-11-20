/* M05 scene — 探究向心力大小与半径、角速度、质量的关系：物理引擎（Node/浏览器通用）、双实验台、学原理部件、四拍诊断与反推。 */
(function (ML) {
  'use strict';
  var P = ML.phys;
  var PULLEY_RADII = [0.020, 0.040, 0.060]; // 2 cm, 4 cm, 6 cm
  var BALLS = { al: 0.020, steel: 0.040, copper: 0.060 };
  var SLOT_R = { inner: 0.060, outer: 0.120, short: 0.060 };
  var K_SCALE = 0.0432; // N/div，基准 m=0.020, r=0.060, ω=6.0 -> F=0.0432 N = 1.00 格
  var SLIP_DEFAULT = 0.18;
  var ZERO_OFFSET_DIV = 0.60;
  var HYST_DIV = 0.25;
  var F_STATIC = 0.12;
  var FLAG_D = 0.0100;

  /* ---------- 装置 A：向心力演示器物理引擎 ---------- */
  function simulateA(opts, seed) {
    opts = opts || {};
    var ideal = !!opts.ideal;
    var rng = P.rng(seed || 17);
    var mL = opts.mL != null ? (typeof opts.mL === 'string' ? (BALLS[opts.mL] || 0.020) : opts.mL) : BALLS.al;
    var mR = opts.mR != null ? (typeof opts.mR === 'string' ? (BALLS[opts.mR] || 0.020) : opts.mR) : BALLS.al;
    var rL = opts.rL != null ? opts.rL : (SLOT_R[opts.slotL] || SLOT_R.inner);
    var rR = opts.rR != null ? opts.rR : SLOT_R.short;
    var stepL = P.clamp(opts.stepL != null ? opts.stepL : 0, 0, 2);
    var stepR = P.clamp(opts.stepR != null ? opts.stepR : 0, 0, 2);
    var RL = opts.RL != null ? opts.RL : PULLEY_RADII[stepL];
    var RR = opts.RR != null ? opts.RR : PULLEY_RADII[stepR];
    var wCrank = opts.wCrank != null ? opts.wCrank : 6.0;

    var factor = 1;
    if (opts.crankFactor != null) {
      factor = opts.crankFactor;
    } else if (opts.unsteadyCrank) {
      var t = opts.t != null ? opts.t : 0;
      var wave = 0.72 * Math.sin(2 * Math.PI * 0.85 * t + ((seed || 1) % 7)) + 0.28 * P.clamp(rng.gauss(0.85), -1, 1);
      factor = 1 + P.clamp(0.22 * wave, -0.22, 0.22);
    } else if (!ideal) {
      factor = 1 + P.clamp(rng.gauss(0.004), -0.012, 0.012);
    }

    var wR = wCrank * factor;
    var slip = opts.beltSlip ? (opts.slip != null ? opts.slip : SLIP_DEFAULT) : 0;
    var wLNom = wCrank * (RR / RL);
    var wLIdeal = wR * (RR / RL);
    var wL = wLIdeal * (1 - slip);

    var FL = mL * wL * wL * rL;
    var FR = mR * wR * wR * rR;
    var FLIdeal = mL * wLNom * wLNom * rL;
    var FRIdeal = mR * wCrank * wCrank * rR;

    var divLTrue = FL / K_SCALE;
    var divRTrue = FR / K_SCALE;
    var zeroOffL = opts.scaleBad ? ZERO_OFFSET_DIV : (opts.zeroOffsetDiv != null ? opts.zeroOffsetDiv : 0);
    var hystL = opts.scaleBad ? HYST_DIV : (opts.hystDiv != null ? opts.hystDiv : 0);
    var dir = opts.motionDir === 'down' ? -1 : 1;
    var divLEff = dir >= 0 ? Math.max(0, divLTrue - hystL) : (divLTrue + hystL);
    var jitterL = (!ideal && !opts.scaleBad && !opts.unsteadyCrank) ? P.clamp(rng.gauss(0.008), -0.02, 0.02) : 0;
    var jitterR = (!ideal && !opts.scaleBad && !opts.unsteadyCrank) ? P.clamp(rng.gauss(0.008), -0.02, 0.02) : 0;

    var divL = Math.max(0, divLEff + zeroOffL + jitterL);
    var divR = Math.max(0, divRTrue + jitterR);

    return {
      mL: mL, mR: mR, rL: rL, rR: rR, RL: RL, RR: RR, stepL: stepL, stepR: stepR,
      wCrank: wCrank, wL: wL, wR: wR, wLIdeal: wLIdeal, slip: slip,
      FL: FL, FR: FR, FLIdeal: FLIdeal, FRIdeal: FRIdeal,
      divL: divL, divR: divR, divLTrue: divLTrue, divRTrue: divRTrue,
      divLIdeal: FLIdeal / K_SCALE, divRIdeal: FRIdeal / K_SCALE,
      ratioF: divR > 1e-9 ? divL / divR : NaN,
      ratioTrue: FR > 1e-9 ? FL / FR : NaN,
      ratioIdeal: FRIdeal > 1e-9 ? FLIdeal / FRIdeal : NaN
    };
  }

  function sampleA(opts, nSamples, seed) {
    opts = opts || {};
    var n = nSamples || 25, baseSeed = seed || 31;
    var samples = [], divLs = [], divRs = [];
    for (var i = 0; i < n; i++) {
      var res = simulateA(Object.assign({}, opts, { t: i * 0.08 }), baseSeed + i * 13);
      samples.push({ t: +(i * 0.08).toFixed(2), wL: res.wL, wR: res.wR, divL: res.divL, divR: res.divR });
      divLs.push(res.divL);
      divRs.push(res.divR);
    }
    var mL = P.mean(divLs), mR = P.mean(divRs);
    return {
      samples: samples,
      meanL: mL, stdL: P.std(divLs),
      meanR: mR, stdR: P.std(divRs),
      ratioMean: mR > 1e-9 ? mL / mR : NaN
    };
  }

  /* ---------- 装置 B：力传感器 + 光电门物理引擎 ---------- */
  function simulateB(opts, seed) {
    opts = opts || {};
    var ideal = !!opts.ideal;
    var rng = P.rng(seed || 23);
    var m = opts.m != null ? opts.m : 0.100;
    var r = opts.r != null ? opts.r : 0.150;
    var d = opts.d != null ? opts.d : FLAG_D;
    var w = opts.w != null ? opts.w : 6.0;
    var fStatic = opts.trackFriction ? (opts.fStatic != null ? opts.fStatic : F_STATIC) : (opts.fStatic != null ? opts.fStatic : 0);

    var vTrue = w * r;
    var dtTrue = d / vTrue;
    var dt = ideal ? dtTrue : dtTrue * (1 + P.clamp(rng.gauss(0.0025), -0.006, 0.006));
    var vMeas = d / dt;
    var wMeas = vMeas / r;
    var FTheo = m * w * w * r;
    var noiseF = ideal ? 0 : P.clamp(rng.gauss(0.004), -0.012, 0.012);
    var F = FTheo > fStatic ? Math.max(0, FTheo - fStatic + noiseF) : 0;

    return {
      m: m, r: r, d: d, w: w, wMeas: wMeas,
      vTrue: vTrue, vMeas: vMeas, dt: dt, dtTrue: dtTrue,
      w2: wMeas * wMeas, invDt2: 1 / (dt * dt),
      F: F, FTheo: FTheo, fStatic: fStatic
    };
  }

  function sweepB(opts, ws, seed) {
    opts = opts || {};
    var arr = ws || [4, 5, 6, 7, 8, 9, 10];
    var baseSeed = seed || 41, rows = [];
    for (var i = 0; i < arr.length; i++) {
      rows.push(simulateB(Object.assign({}, opts, { w: arr[i] }), baseSeed + i * 17));
    }
    return rows;
  }

  function fitSensor(rows, xKey) {
    xKey = xKey || 'omega2';
    var xs = [], ys = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var x = xKey === 'invDt2' ? (r.invDt2 != null ? r.invDt2 : 1 / (r.dt * r.dt))
        : xKey === 'm' ? r.m
        : xKey === 'r' ? r.r
        : (r.w2 != null ? r.w2 : (r.wMeas != null ? r.wMeas * r.wMeas : r.w * r.w));
      xs.push(x);
      ys.push(r.F);
    }
    var fit = P.linfit(xs, ys);
    return {
      k: fit.k, b: fit.b, r2: fit.r2,
      xIntercept: Math.abs(fit.k) > 1e-12 ? -fit.b / fit.k : NaN,
      xKey: xKey, n: xs.length
    };
  }

  /* ---------- 2024 海南卷圆盘小圆柱辅助计算 ---------- */
  function hainan2024Disk(D, d, m, N, t) {
    var T = t / N;
    var w = 2 * Math.PI / T;
    var r = (D - d) / 2;
    var F = m * w * w * r;
    return { T: T, w: w, r: r, F: F };
  }

  ML.centrip = {
    PULLEY_RADII: PULLEY_RADII,
    BALLS: BALLS,
    SLOT_R: SLOT_R,
    K_SCALE: K_SCALE,
    SLIP_DEFAULT: SLIP_DEFAULT,
    ZERO_OFFSET_DIV: ZERO_OFFSET_DIV,
    HYST_DIV: HYST_DIV,
    F_STATIC: F_STATIC,
    FLAG_D: FLAG_D,
    simulateA: simulateA,
    sampleA: sampleA,
    simulateB: simulateB,
    sweepB: sweepB,
    fitSensor: fitSensor,
    hainan2024Disk: hainan2024Disk
  };
})(typeof window !== 'undefined' ? (window.ML = window.ML || {}) : (globalThis.ML = globalThis.ML || {}));

/* =========================================================================
 *  浏览器交互界面（Node 校验时不执行此部分）
 * ========================================================================= */
(function (ML) {
  'use strict';
  if (typeof document === 'undefined') return;

  var h = ML.h, M = ML.math, P = ML.phys, MC = ML.centrip, D = ML.stage.draw, GV = ML.gaugesView, GG = ML.gauges;
  var C = ML.json('ml-content'), Q = ML.json('ml-questions') || [];
  var S = ML.store.init(C.slug || 'mech-lab-m05', {
    v: 1, tab: 'learn', learnPage: 0, mode: 'guided', ideal: false, app: 'A', answers: {}, done: {}
  });
  var ERR = {}; C.errors.forEach(function (e) { ERR[e.id] = e; });
  var PROC = {}; C.procedure.forEach(function (p) { PROC[p.id] = p; });
  var seedCounter = 53;
  var bench = null;
  var learnStopFn = null, learnResumeFn = null;

  var BALL_META = {
    al: { name: 'A 球 (m)', short: 'A · m', c1: '#E2EBF3', c2: '#9AA8B8', r: 10 },
    steel: { name: 'B 球 (2m)', short: 'B · 2m', c1: '#B8C4D0', c2: '#5E6B78', r: 10 },
    copper: { name: 'C 球 (3m)', short: 'C · 3m', c1: '#F2BC79', c2: '#B56822', r: 10 }
  };

  function drawBall(ctx, x, y, r, c1, c2) {
    r = Math.max(2, r);
    ctx.fillStyle = D.grad(ctx, x - r * 0.5, y - r * 0.6, x + r * 0.8, y + r * 0.8, [c1, c2]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(16,35,63,0.28)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, Math.max(1, r * 0.24), 0, Math.PI * 2); ctx.fill();
  }

  function drawGradScale(ctx, cx, baseY, divVal, maxDiv, pxPerDiv, title) {
    var colW = 20, maxH = maxDiv * pxPerDiv;
    var showDiv = Math.min(maxDiv, Math.max(0, divVal));
    var risePx = showDiv * pxPerDiv;
    // 套筒底座（加宽至 44px 以完整包住标签与数值）
    ctx.fillStyle = D.grad(ctx, cx - 22, baseY, cx + 22, baseY, ['#C9D1D9', '#8E99A6']);
    D.rr(ctx, cx - 22, baseY, 44, 54, 5); ctx.fill();
    ctx.strokeStyle = '#596574'; ctx.lineWidth = 1.2; ctx.stroke();
    // 标尺导轨框（避免 0 格时右侧刻度浮空）
    ctx.fillStyle = '#F8FBFF';
    ctx.fillRect(cx - colW / 2, baseY - maxH, colW, maxH);
    ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 1;
    ctx.strokeRect(cx - colW / 2, baseY - maxH, colW, maxH);
    // 露出标尺（黑白相间等分格）
    if (risePx > 0.5) {
      ctx.save();
      ctx.beginPath(); ctx.rect(cx - colW / 2, baseY - risePx, colW, risePx); ctx.clip();
      var nBlocks = Math.ceil(showDiv);
      for (var i = 0; i < nBlocks; i++) {
        var yBot = baseY - i * pxPerDiv, yTop = yBot - pxPerDiv;
        ctx.fillStyle = (i % 2 === 0) ? '#1E293B' : '#FFFFFF';
        ctx.fillRect(cx - colW / 2, yTop, colW, pxPerDiv);
      }
      ctx.restore();
      ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.2;
      ctx.strokeRect(cx - colW / 2, baseY - risePx, colW, risePx);
    }
    // 刻度线与数字（0..maxDiv）
    for (var k = 0; k <= maxDiv; k += 2) {
      var ky = baseY - k * pxPerDiv;
      ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(cx + colW / 2 + 2, ky); ctx.lineTo(cx + colW / 2 + 7, ky); ctx.stroke();
      if (k > 0 && k <= Math.ceil(showDiv) + 2 && ky > baseY - maxH - 4) {
        D.text(ctx, String(k), cx + colW / 2 + 9, ky + 3, { size: 9.5, color: '#4A5B73' });
      }
    }
    D.text(ctx, title, cx, baseY + 17, { align: 'center', size: 10.5, weight: 700, color: '#10233F' });
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    D.rr(ctx, cx - 19, baseY + 23, 38, 17, 4); ctx.fill();
    D.text(ctx, divVal.toFixed(2) + ' 格', cx, baseY + 35, { align: 'center', size: 10, weight: 700, color: divVal > maxDiv ? '#C7374B' : '#1661FF' });
    if (divVal > maxDiv) D.text(ctx, '超量程', cx, baseY - maxH - 6, { align: 'center', size: 10, weight: 700, color: '#C7374B' });
  }

  /* =====================================================================
   *  10 分度游标卡尺弹窗（装置 B 测量 d）
   * ===================================================================== */
  function openCaliperModal(onConfirm, targetMm) {
    var old = document.querySelector('.ml-cal-modal');
    if (old) old.remove();
    var dTarget = targetMm || 10.0;
    var dStr = dTarget.toFixed(1);
    var gHost = h('div');
    var inp = h('input.cal-inp', { type: 'text', value: '', placeholder: '如 ' + dStr, 'aria-label': '输入游标卡尺测得的遮光条宽度' });
    var fb = h('div.cal-fb', '长按游标卡尺可呼出 3× 放大镜；10 分度游标卡尺不估读，精确到 0.1 mm（如 10.0 mm）。');
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      document.removeEventListener('keydown', onKey);
      if (modal) { modal.remove(); modal = null; }
    }
    var modal = h('div.ml-modal.ml-cal-modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '游标卡尺测量遮光条宽度', onclick: function (e) { if (e.target === modal) close(); } },
      h('div.ml-modal-card',
        h('div.try-head',
          h('div', h('div.try-k', '仪器读数'), h('h2', '用 10 分度游标卡尺测量遮光条宽度 d')),
          h('button.btn', { type: 'button', onclick: close }, '关闭')),
        gHost,
        h('div.cal-read-row',
          h('span', '测得遮光条宽度 d ='), inp, h('span', 'mm'),
          h('button.btn.primary', { type: 'button', onclick: verify }, '确认读数'),
          h('button.btn', { type: 'button', onclick: function () { inp.value = dStr; verify(); } }, '填入 ' + dStr + ' mm 并确认')),
        fb));
    document.body.appendChild(modal);
    document.addEventListener('keydown', onKey);
    new GV.GaugeBench(gHost, { height: 260, state: { type: 'caliper', div: 10, valMm: dTarget, locked: true, hintAlign: false } });
    function verify() {
      var res = GG.caliper.diagnose(inp.value, dTarget, { div: 10, unit: 'mm' });
      fb.className = 'cal-fb ' + (res.ok ? 'ok' : 'bad');
      fb.textContent = (res.ok ? '✓ ' : '✕ ') + res.msg;
      if (res.ok) {
        ML.toast('遮光条宽度已记录：d = ' + dStr + ' mm（' + (dTarget / 1000).toFixed(4) + ' m）', 'ok');
        setTimeout(function () { close(); if (onConfirm) onConfirm(dTarget); }, 320);
      }
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') verify(); });
  }

  /* =====================================================================
   *  ② 做·实验台（装置 A 向心力演示器 + 装置 B 力传感器光电门）
   * ===================================================================== */
  function Bench(el) {
    var self = this; this.el = el;
    this.mode = S.mode || 'guided';
    this.app = S.app || 'A';
    this.rowsA = [];
    this.rowsB = [];

    this.stA = {
      preset: 'Fm', // 'Fm' | 'Fr' | 'Fw'
      mL: 'steel', mR: 'al',
      slotL: 'inner',
      stepL: 0, stepR: 0,
      wCrank: 6.0,
      running: false, holding: false,
      thetaL: 0, thetaR: 0, thetaCrank: 0, t: 0,
      beltSlip: false, unsteadyCrank: false, scaleBad: false,
      dispDivL: 0, dispDivR: 0, lastSim: null
    };
    this.stB = {
      m: 0.100, r: 0.150, dMm: 10.0, calDone: false, w: 6.0,
      trackFriction: false,
      running: false, hasRun: false, theta: -Math.PI * 0.75, flashT: 0,
      chartX: 'omega2',
      lastSim: null
    };
    this.doneA = { P1: true, P2: true };
    this.doneB = {};

    var modeChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'guided' }, onclick: function () { self.setMode('guided'); } }, '引导模式'),
      h('button.chip', { type: 'button', data: { v: 'free' }, onclick: function () { self.setMode('free'); } }, '自由模式'));
    this.modeChips = modeChips;

    this.appChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'A' }, onclick: function () { self.setApp('A'); } }, '装置 A：向心力演示器'),
      h('button.chip', { type: 'button', data: { v: 'B' }, onclick: function () { self.setApp('B'); } }, '装置 B：力传感器+光电门'));

    this.idealChip = h('button.chip', {
      type: 'button', title: '理想条件：无读数与计时随机噪声',
      onclick: function () {
        S.ideal = !S.ideal; ML.store.save();
        self.idealChip.classList.toggle('on', S.ideal);
        self.idealChip.textContent = S.ideal ? '理想条件' : '真实条件';
        self.refreshReadout(); self.stage.invalidate('fg');
      }
    }, S.ideal ? '理想条件' : '真实条件');
    this.idealChip.classList.toggle('on', S.ideal);

    this.anaBtn = h('button.btn.sm', {
      type: 'button', hidden: true,
      onclick: function () {
        self.analysis.hidden = !self.analysis.hidden;
        if (!self.analysis.hidden) { self.renderAnalysis(false); }
        else { self.updateAnaBtn(); }
      }
    }, '查看数据分析');

    this.bannerEl = h('div.bench-banner', { hidden: true });
    var topBar = h('div.bench-top', modeChips, this.appChips, h('div.spacer'), this.idealChip, this.anaBtn);
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
    this.mag = new ML.stage.Magnifier(this.stageWrap, { zoom: 3, size: 142 });
    this.loop = new ML.stage.Loop(function (dt) { return self.tick(dt); });
    this.hot = [];
    this.bindPointer();
    this.setMode(this.mode, true);
    this.setApp(this.app, true);
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
  Bench.prototype.updateAnaBtn = function () {
    var cnt = this.app === 'A' ? this.rowsA.length : this.rowsB.length;
    this.anaBtn.hidden = cnt === 0;
    this.anaBtn.textContent = (this.analysis.hidden ? '查看数据分析' : '收起数据分析') + ' (' + cnt + ')';
  };

  Bench.prototype.setMode = function (m, silent) {
    this.mode = m; S.mode = m; ML.store.save();
    ML.$$('.chip', this.modeChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === m); });
    if (m === 'guided') {
      var sa = this.stA, sb = this.stB;
      sa.beltSlip = false; sa.unsteadyCrank = false; sa.scaleBad = false;
      sb.trackFriction = false;
      this.applyPresetA(sa.preset, true);
    }
    if (!silent) {
      this.setBanner(null);
      ML.toast(m === 'guided' ? '引导模式：严格按控制变量法规范步骤操作' : '自由模式：可自由组合参数或制造打滑/零漂/静摩擦等故障');
    }
    this.stage.invalidate();
    this.renderStageActs();
    this.renderSide();
  };

  Bench.prototype.setApp = function (a, silent) {
    this.app = a; S.app = a; ML.store.save();
    ML.$$('.chip', this.appChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === a); });
    this.loop.stop();
    this.stA.running = false; this.stA.holding = false;
    this.stB.running = false;
    this.analysis.hidden = true;
    this.updateAnaBtn();
    if (!silent) this.setBanner(null);
    this.stage.invalidate();
    this.renderStageActs();
    this.renderSide();
  };

  Bench.prototype.applyPresetA = function (pre, silent) {
    var sa = this.stA;
    sa.preset = pre;
    if (pre === 'Fm') {
      sa.mL = 'steel'; sa.mR = 'al'; sa.slotL = 'inner'; sa.stepL = 0; sa.stepR = 0;
    } else if (pre === 'Fr') {
      sa.mL = 'al'; sa.mR = 'al'; sa.slotL = 'outer'; sa.stepL = 0; sa.stepR = 0;
    } else {
      sa.mL = 'al'; sa.mR = 'al'; sa.slotL = 'inner'; sa.stepL = 0; sa.stepR = 1;
    }
    this.doneA.P2 = true; this.doneA.P3 = true;
    if (!silent) {
      this.refreshReadout();
      this.stage.invalidate();
      this.renderSide();
    }
  };

  Bench.prototype.detectTagsA = function () {
    var sa = this.stA, tags = [];
    var mSame = sa.mL === sa.mR, rSame = sa.slotL === 'inner', wSame = sa.stepL === sa.stepR;
    var nDiff = (mSame ? 0 : 1) + (rSame ? 0 : 1) + (wSame ? 0 : 1);
    if (nDiff > 1) tags.push('E1');
    if (sa.preset === 'Fw' && sa.stepL > sa.stepR) tags.push('E2');
    if (sa.beltSlip) tags.push('E3');
    if (sa.unsteadyCrank) tags.push('E4');
    if (sa.scaleBad) tags.push('E5');
    return tags;
  };

  Bench.prototype.curSimA = function (tVal) {
    var sa = this.stA;
    return MC.simulateA({
      mL: sa.mL, mR: sa.mR, slotL: sa.slotL, stepL: sa.stepL, stepR: sa.stepR,
      wCrank: sa.wCrank, beltSlip: sa.beltSlip, unsteadyCrank: sa.unsteadyCrank, scaleBad: sa.scaleBad,
      ideal: S.ideal, t: tVal != null ? tVal : sa.t
    }, seedCounter);
  };

  Bench.prototype.curSimB = function () {
    var sb = this.stB;
    return MC.simulateB({
      m: sb.m, r: sb.r, d: sb.dMm / 1000, w: sb.w,
      trackFriction: sb.trackFriction, ideal: S.ideal
    }, seedCounter);
  };

  Bench.prototype.refreshReadout = function () {
    if (this.app === 'A') {
      var sa = this.stA;
      var sim = this.curSimA();
      sa.lastSim = sim;
      if (sa.running || sa.holding) {
        sa.dispDivL = sim.divL;
        sa.dispDivR = sim.divR;
      } else {
        sa.dispDivL = sa.scaleBad ? MC.ZERO_OFFSET_DIV : 0;
        sa.dispDivR = 0;
      }
    } else {
      this.stB.lastSim = this.curSimB();
    }
  };

  /* ---------- 物理动画推进（按需启动，静止即停） ---------- */
  Bench.prototype.tick = function (dt) {
    if (this.app === 'A') {
      var sa = this.stA;
      if (!sa.running && !sa.holding) {
        this.refreshReadout();
        this.stage.invalidate('fg');
        return false;
      }
      sa.t += dt;
      seedCounter = (seedCounter + 1) % 997 + 1;
      var sim = this.curSimA(sa.t);
      sa.lastSim = sim;
      sa.thetaL = (sa.thetaL + sim.wL * dt) % (Math.PI * 2);
      sa.thetaR = (sa.thetaR + sim.wR * dt) % (Math.PI * 2);
      sa.thetaCrank = (sa.thetaCrank + sim.wR * dt) % (Math.PI * 2);
      var kBlend = Math.min(1, dt * 10);
      sa.dispDivL += (sim.divL - sa.dispDivL) * kBlend;
      sa.dispDivR += (sim.divR - sa.dispDivR) * kBlend;
      this.updateLiveText();
      this.stage.invalidate('fg');
      return true;
    }
    var sb = this.stB;
    if (!sb.running) return false;
    var prev = sb.theta;
    sb.theta = (sb.theta + sb.w * dt) % (Math.PI * 2);
    if (prev > Math.PI * 1.5 && sb.theta <= Math.PI * 0.5) {
      sb.flashT = 0.22;
      sb.lastSim = this.curSimB();
      this.updateLiveText();
    }
    if (sb.flashT > 0) sb.flashT = Math.max(0, sb.flashT - dt);
    this.stage.invalidate('fg');
    return true;
  };

  Bench.prototype.startA = function (holdMode) {
    var sa = this.stA;
    if (holdMode) sa.holding = true; else sa.running = true;
    this.doneA.P4 = true;
    this.loop.start();
    this.renderStageActs();
    this.renderSide();
  };

  Bench.prototype.stopA = function (holdOnly) {
    var sa = this.stA;
    if (holdOnly) sa.holding = false; else { sa.running = false; sa.holding = false; }
    if (!sa.running && !sa.holding) {
      this.loop.stop();
      this.refreshReadout();
      this.stage.invalidate('fg');
    }
    this.renderStageActs();
    this.renderSide();
  };

  Bench.prototype.recordA = function () {
    var sa = this.stA;
    if (!sa.running && !sa.holding) {
      if (this.guided()) { this.block('请先摇动手柄转动起来，稳定后再用放大镜读数并记入对比表。', 'E4'); return; }
      this.startA(false);
    }
    var res = sa.unsteadyCrank ? MC.sampleA({
      mL: sa.mL, mR: sa.mR, slotL: sa.slotL, stepL: sa.stepL, stepR: sa.stepR,
      wCrank: sa.wCrank, beltSlip: sa.beltSlip, unsteadyCrank: true, scaleBad: sa.scaleBad, ideal: S.ideal
    }, 15, seedCounter) : null;
    var sim = this.curSimA(sa.t);
    var dL = res ? res.meanL : sim.divL;
    var dR = res ? res.meanR : sim.divR;
    var tags = this.detectTagsA();
    var pname = sa.preset === 'Fm' ? '探 F-m' : sa.preset === 'Fr' ? '探 F-r' : '探 F-ω';
    this.rowsA.push({
      preset: pname,
      mL: sim.mL, mR: sim.mR, rL: sim.rL, rR: sim.rR, RL: sim.RL, RR: sim.RR,
      wL: sim.wL, wR: sim.wR, divL: dL, divR: dR,
      ratioF: dR > 1e-6 ? dL / dR : NaN,
      ratioIdeal: sim.ratioIdeal,
      tags: tags
    });
    this.doneA.P5 = true;
    this.analysis.hidden = false;
    this.updateAnaBtn();
    this.renderSide();
    this.renderAnalysis(false);
    ML.toast('已记入对比表（第 ' + this.rowsA.length + ' 组）', 'ok');
  };

  Bench.prototype.recordB = function () {
    var sb = this.stB;
    if (this.guided() && !sb.calDone) {
      ML.toast('请先用游标卡尺测量遮光条宽度 d', 'warn');
      openCaliperModal(function (d) { sb.dMm = d; sb.calDone = true; bench.doneB.P6 = true; bench.renderSide(); }, 10.0);
      return;
    }
    var sim = this.curSimB();
    sb.hasRun = true;
    sb.lastSim = sim;
    this.rowsB.push(Object.assign({}, sim, { friction: sb.trackFriction }));
    this.doneB.P6 = true;
    this.analysis.hidden = false;
    this.updateAnaBtn();
    this.renderSide();
    this.renderAnalysis(false);
    ML.toast('已采集 ω = ' + sb.w.toFixed(1) + ' rad/s 数据', 'ok');
  };

  Bench.prototype.sweepBAll = function () {
    var sb = this.stB;
    if (this.guided() && !sb.calDone) {
      ML.toast('请先用游标卡尺测量遮光条宽度 d', 'warn');
      openCaliperModal(function (d) { sb.dMm = d; sb.calDone = true; bench.sweepBAll(); }, 10.0);
      return;
    }
    var ws = [4, 5, 6, 7, 8, 9, 10];
    var rows = MC.sweepB({
      m: sb.m, r: sb.r, d: sb.dMm / 1000, trackFriction: sb.trackFriction, ideal: S.ideal
    }, ws, seedCounter);
    this.rowsB = rows.map(function (rw) { return Object.assign({}, rw, { friction: sb.trackFriction }); });
    sb.hasRun = true;
    sb.lastSim = this.rowsB[this.rowsB.length - 1];
    this.doneB.P6 = true;
    this.analysis.hidden = false;
    this.updateAnaBtn();
    this.renderSide();
    this.renderAnalysis(false);
    ML.toast('已完成 7 组扫速采集（ω = 4~10 rad/s）', 'ok');
  };

  /* ---------- 几何映射 ---------- */
  Bench.prototype.geoA = function (w, hh) {
    var cxL = Math.round(w * 0.28), cxR = Math.round(w * 0.68);
    var slotY = Math.round(hh * 0.22);
    var scaleBaseY = Math.round(hh * 0.56);
    var pulleyY = Math.round(hh * 0.77);
    var crankX = Math.min(w - 34, cxR + Math.round(w * 0.20));
    var pxPerDiv = Math.max(8, Math.min(13.5, (scaleBaseY - slotY - 22) / 10.5));
    return { w: w, h: hh, cxL: cxL, cxR: cxR, slotY: slotY, scaleBaseY: scaleBaseY, pulleyY: pulleyY, crankX: crankX, pxPerDiv: pxPerDiv };
  };

  Bench.prototype.geoB = function (w, hh) {
    var cx = Math.round(w * 0.44), cy = Math.round(hh * 0.46);
    var Rmax = Math.min(w * 0.34, hh * 0.36);
    var pxPerM = Rmax / 0.20;
    return { w: w, h: hh, cx: cx, cy: cy, Rmax: Rmax, pxPerM: pxPerM };
  };

  /* ---------- 静态背景层 ---------- */
  Bench.prototype.drawBg = function (ctx, w, hh) {
    if (w < 80 || hh < 80) return;
    ctx.fillStyle = '#EAF1F8'; ctx.fillRect(0, 0, w, hh);
    if (this.app === 'A') {
      var g = this.geoA(w, hh);
      // 底座
      ctx.fillStyle = D.grad(ctx, 0, hh - 34, 0, hh - 10, ['#C9D1D9', '#8E99A6']);
      D.rr(ctx, 20, hh - 34, w - 40, 22, 6); ctx.fill();
      ctx.strokeStyle = '#596574'; ctx.lineWidth = 1.4; ctx.stroke();
      // 左右立柱与中轴
      [g.cxL, g.cxR].forEach(function (cx) {
        ctx.fillStyle = D.grad(ctx, cx - 7, 0, cx + 7, 0, ['#B0BCC9', '#6E7B8A']);
        ctx.fillRect(cx - 7, g.slotY + 12, 14, hh - 34 - g.slotY - 12);
      });
      // 中央标尺支撑架
      var midX = Math.round((g.cxL + g.cxR) / 2);
      ctx.fillStyle = '#DCE4EC';
      D.rr(ctx, midX - 66, g.scaleBaseY - 8, 132, 68, 8); ctx.fill();
      ctx.strokeStyle = '#9AA8B8'; ctx.stroke();
      // 右端齿轮箱
      ctx.fillStyle = D.grad(ctx, 0, g.pulleyY - 16, 0, g.pulleyY + 16, ['#DCE4EC', '#9AA8B8']);
      D.rr(ctx, g.cxR + 30, g.pulleyY - 14, g.crankX - g.cxR - 30, 28, 5); ctx.fill();
      ctx.strokeStyle = '#596574'; ctx.stroke();
      D.text(ctx, '提示：长按黑白标尺呼出 3× 放大镜 · 点塔轮或球槽可直接切换', 14, 18, { size: 11.5, color: '#4A5B73' });
      return;
    }

    var b = this.geoB(w, hh);
    // 圆形实验平台底座
    ctx.fillStyle = D.grad(ctx, b.cx - b.Rmax - 36, b.cy - b.Rmax - 36, b.cx + b.Rmax + 36, b.cy + b.Rmax + 36, ['#F7FAFD', '#DCE5F0']);
    ctx.beginPath(); ctx.arc(b.cx, b.cy, b.Rmax + 30, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9AA8B8'; ctx.lineWidth = 2; ctx.stroke();
    // 同心半径刻度环 (8, 12, 16, 20 cm)
    [0.08, 0.12, 0.16, 0.20].forEach(function (rm) {
      var rp = rm * b.pxPerM;
      ctx.strokeStyle = 'rgba(18,169,196,0.28)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(b.cx, b.cy, rp, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      var angL = Math.PI * 0.68;
      D.text(ctx, (rm * 100).toFixed(0) + 'cm', b.cx + Math.cos(angL) * rp, b.cy + Math.sin(angL) * rp + 4, { align: 'center', size: 10, color: '#4A5B73' });
    });
    D.text(ctx, '提示：左右拖动滑块调半径 r · 长按刻度尺呼出 3× 放大镜', 14, 18, { size: 11.5, color: '#4A5B73' });
  };

  /* ---------- 动态前景层 ---------- */
  Bench.prototype.drawFg = function (ctx, w, hh) {
    this.hot = [];
    if (w < 80 || hh < 80) return;
    if (this.app === 'A') { this.drawFgA(ctx, w, hh); return; }
    this.drawFgB(ctx, w, hh);
  };

  Bench.prototype.drawFgA = function (ctx, w, hh) {
    var g = this.geoA(w, hh), sa = this.stA;
    var rUnit = Math.min(72, Math.round(w * 0.11));

    // 1. 顶部旋转长槽 / 短槽与小球
    var cosL = Math.cos(sa.thetaL), cosR = Math.cos(sa.thetaR);
    var slotWL = rUnit * 2 + 28, slotWR = rUnit + 26;
    // 长槽本体
    ctx.fillStyle = D.grad(ctx, 0, g.slotY - 8, 0, g.slotY + 8, ['#C9D1D9', '#8E99A6']);
    D.rr(ctx, g.cxL - slotWL * 0.72, g.slotY - 8, slotWL * 1.44, 16, 5); ctx.fill();
    ctx.strokeStyle = '#596574'; ctx.lineWidth = 1.2; ctx.stroke();
    // 短槽本体
    D.rr(ctx, g.cxR - slotWR * 0.72, g.slotY - 8, slotWR * 1.44, 16, 5); ctx.fill();
    ctx.stroke();

    // 槽位热区与指示
    var rInPx = rUnit * 0.62, rOutPx = rUnit * 1.18;
    var ballLx = g.cxL + cosL * (sa.slotL === 'outer' ? rOutPx : rInPx);
    var ballRx = g.cxR + cosR * rInPx;
    var bMetaL = BALL_META[sa.mL], bMetaR = BALL_META[sa.mR];

    // 左槽内外标志（与静止位置一致的 +rInPx / +rOutPx 两侧提示）
    ctx.strokeStyle = '#12A9C4'; ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.arc(g.cxL + rInPx, g.slotY - 12, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.cxL + rOutPx, g.slotY - 12, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    this.hot.push({ id: 'slotInner', x: g.cxL + rInPx - 16, y: g.slotY - 28, w: 32, h: 36 });
    this.hot.push({ id: 'slotOuter', x: g.cxL + rOutPx - 16, y: g.slotY - 28, w: 32, h: 36 });

    drawBall(ctx, ballLx, g.slotY - 12, bMetaL.r, bMetaL.c1, bMetaL.c2);
    drawBall(ctx, ballRx, g.slotY - 12, bMetaR.r, bMetaR.c1, bMetaR.c2);
    this.hot.push({ id: 'ballL', x: ballLx - 18, y: g.slotY - 30, w: 36, h: 36 });
    this.hot.push({ id: 'ballR', x: ballRx - 18, y: g.slotY - 30, w: 36, h: 36 });

    D.text(ctx, '长槽（' + (sa.slotL === 'outer' ? '外侧 2r' : '内侧 r') + ' · ' + bMetaL.short + '）', g.cxL, g.slotY - 26, { align: 'center', size: 11.5, weight: 700, color: '#10233F' });
    D.text(ctx, '短槽（r · ' + bMetaR.short + '）', g.cxR, g.slotY - 26, { align: 'center', size: 11.5, weight: 700, color: '#10233F' });

    // 2. 中间双黑白等分标尺（最大可视 10 格，支持长按放大镜）
    var midX = Math.round((g.cxL + g.cxR) / 2);
    var sLx = midX - 34, sRx = midX + 34;
    drawGradScale(ctx, sLx, g.scaleBaseY, sa.dispDivL, 10, g.pxPerDiv, '左标尺');
    drawGradScale(ctx, sRx, g.scaleBaseY, sa.dispDivR, 10, g.pxPerDiv, '右标尺');
    this.hot.push({ id: 'scales', x: midX - 70, y: g.scaleBaseY - 110, w: 140, h: 165 });

    // 3. 底部三层塔轮 + 皮带
    var widths = [24, 42, 60];
    var stepH = 14;
    for (var i = 0; i < 3; i++) {
      var py = g.pulleyY - 22 + i * (stepH + 2);
      var wL = widths[i], wR = widths[i];
      var onL = i === sa.stepL, onR = i === sa.stepR;
      ctx.fillStyle = onL ? '#DBEAFE' : '#C9D1D9';
      D.rr(ctx, g.cxL - wL / 2, py, wL, stepH, 3); ctx.fill();
      ctx.strokeStyle = onL ? '#1661FF' : '#596574'; ctx.lineWidth = onL ? 2 : 1.1; ctx.stroke();
      ctx.fillStyle = onR ? '#DBEAFE' : '#C9D1D9';
      D.rr(ctx, g.cxR - wR / 2, py, wR, stepH, 3); ctx.fill();
      ctx.strokeStyle = onR ? '#1661FF' : '#596574'; ctx.lineWidth = onR ? 2 : 1.1; ctx.stroke();
      // 旋转条纹指示转速
      var phL = ((sa.thetaL / (Math.PI * 2)) % 1) * wL;
      var phR = ((sa.thetaR / (Math.PI * 2)) % 1) * wR;
      ctx.strokeStyle = 'rgba(16,35,63,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(g.cxL - wL / 2 + phL, py + 2); ctx.lineTo(g.cxL - wL / 2 + phL, py + stepH - 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(g.cxR - wR / 2 + phR, py + 2); ctx.lineTo(g.cxR - wR / 2 + phR, py + stepH - 2); ctx.stroke();
      this.hot.push({ id: 'pL' + i, x: g.cxL - 36, y: py, w: 72, h: stepH + 2, step: i });
      this.hot.push({ id: 'pR' + i, x: g.cxR - 36, y: py, w: 72, h: stepH + 2, step: i });
    }
    // 传动皮带
    var yBL = g.pulleyY - 22 + sa.stepL * (stepH + 2) + stepH / 2;
    var yBR = g.pulleyY - 22 + sa.stepR * (stepH + 2) + stepH / 2;
    var hwL = widths[sa.stepL] / 2, hwR = widths[sa.stepR] / 2;
    ctx.strokeStyle = sa.beltSlip ? '#C7374B' : '#7A5C3E';
    ctx.lineWidth = 3.2;
    ctx.setLineDash(sa.beltSlip ? [7, 4] : []);
    ctx.beginPath();
    if (sa.beltSlip) {
      ctx.moveTo(g.cxL - hwL, yBL - 4); ctx.quadraticCurveTo(midX, (yBL + yBR) / 2 + 12, g.cxR + hwR, yBR - 4);
      ctx.moveTo(g.cxL + hwL, yBL + 4); ctx.quadraticCurveTo(midX, (yBL + yBR) / 2 + 18, g.cxR - hwR, yBR + 4);
    } else {
      ctx.moveTo(g.cxL - hwL, yBL - 4); ctx.lineTo(g.cxR + hwR, yBR - 4);
      ctx.moveTo(g.cxL + hwL, yBL + 4); ctx.lineTo(g.cxR - hwR, yBR + 4);
    }
    ctx.stroke(); ctx.setLineDash([]);
    var pLblY = g.pulleyY + 38;
    [
      [g.cxL, '左塔轮 R=' + (MC.PULLEY_RADII[sa.stepL] * 100).toFixed(0) + 'cm', '#1661FF', 84],
      [g.cxR, '右塔轮 R=' + (MC.PULLEY_RADII[sa.stepR] * 100).toFixed(0) + 'cm', '#1661FF', 84]
    ].forEach(function (it) {
      ctx.fillStyle = 'rgba(255,255,255,0.90)';
      D.rr(ctx, it[0] - it[3] / 2, pLblY - 11, it[3], 16, 4); ctx.fill();
      D.text(ctx, it[1], it[0], pLblY, { align: 'center', size: 11, weight: 700, color: it[2] });
    });
    if (sa.beltSlip) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      D.rr(ctx, midX - 58, pLblY - 11, 116, 16, 4); ctx.fill();
      D.text(ctx, '皮带松弛打滑 (-18%)', midX, pLblY, { align: 'center', size: 11, weight: 700, color: '#C7374B' });
    }

    // 4. 右侧摇动手柄
    var cY = g.pulleyY + Math.sin(sa.thetaCrank) * 20;
    ctx.strokeStyle = '#4A5B73'; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(g.crankX, g.pulleyY); ctx.lineTo(g.crankX + 12, cY); ctx.stroke();
    ctx.fillStyle = (sa.running || sa.holding) ? '#1661FF' : '#C7374B';
    D.rr(ctx, g.crankX + 8, cY - 8, 16, 16, 4); ctx.fill();
    D.text(ctx, '按住摇柄', g.crankX + 4, g.pulleyY - 28, { align: 'center', size: 10.5, weight: 700, color: '#4A5B73' });
    this.hot.push({ id: 'crank', x: g.crankX - 18, y: g.pulleyY - 36, w: 56, h: 72 });
  };

  Bench.prototype.drawFgB = function (ctx, w, hh) {
    var b = this.geoB(w, hh), sb = this.stB;
    var sim = sb.lastSim || this.curSimB();
    var rPx = sb.r * b.pxPerM;

    // 外侧固定光电门（位于右侧 x = b.cx + rPx, y = b.cy）
    var gx = b.cx + rPx, gy = b.cy;
    ctx.fillStyle = sb.flashT > 0 ? '#25A870' : '#334155';
    D.rr(ctx, gx - 10, gy - 26, 20, 12, 3); ctx.fill();
    D.rr(ctx, gx - 10, gy + 14, 20, 12, 3); ctx.fill();
    ctx.strokeStyle = sb.flashT > 0 ? '#7CF0B4' : 'rgba(199,55,75,0.45)';
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx, gy - 14); ctx.lineTo(gx, gy + 14); ctx.stroke();
    D.text(ctx, '光电门', gx + 14, gy - 18, { size: 11, weight: 700, color: '#10233F' });

    // 旋转臂与标尺
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.rotate(sb.theta);
    // 旋臂导轨
    ctx.fillStyle = D.grad(ctx, 0, -10, 0, 10, ['#E2E8F0', '#94A3B8']);
    D.rr(ctx, -28, -10, b.Rmax + 44, 20, 6); ctx.fill();
    ctx.strokeStyle = '#596574'; ctx.lineWidth = 1.2; ctx.stroke();
    // 刻度线（cm）
    for (var cm = 4; cm <= 20; cm += 2) {
      var kx = (cm / 100) * b.pxPerM;
      ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(kx, -10); ctx.lineTo(kx, -4); ctx.stroke();
    }
    // 中心力传感器与拉杆
    ctx.strokeStyle = '#1661FF'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(rPx, 0); ctx.stroke();
    ctx.fillStyle = '#1661FF';
    D.rr(ctx, -16, -14, 32, 28, 6); ctx.fill();
    D.text(ctx, 'F', 0, 4, { align: 'center', size: 13, weight: 700, color: '#fff' });
    // 滑块与遮光条
    ctx.fillStyle = sb.m >= 0.14 ? '#B56822' : sb.m >= 0.09 ? '#5E6B78' : '#9AA8B8';
    D.rr(ctx, rPx - 14, -13, 28, 26, 4); ctx.fill();
    ctx.strokeStyle = '#10233F'; ctx.stroke();
    // 遮光片
    ctx.fillStyle = '#10233F';
    ctx.fillRect(rPx - 2.5, -20, 5, 14);
    ctx.restore();

    // 滑块拖拽热区（停止时可在水平轴附近拖动）
    var sx = b.cx + Math.cos(sb.theta) * rPx, sy = b.cy + Math.sin(sb.theta) * rPx;
    this.hot.push({ id: 'sliderB', x: sx - 24, y: sy - 24, w: 48, h: 48 });

    // 右上角实时数字化表头 HUD
    var activeB = sb.running || sb.hasRun || this.rowsB.length > 0;
    var hx = w - 168, hy = 12;
    ctx.fillStyle = '#0F1C2E';
    D.rr(ctx, hx, hy, 154, 102, 10); ctx.fill();
    ctx.strokeStyle = '#29405E'; ctx.stroke();
    D.text(ctx, activeB ? '数字化采集表头' : '数字化表头（静止待机）', hx + 10, hy + 18, { size: 11, weight: 700, color: '#9FB3CC' });
    D.text(ctx, 'F = ' + (activeB ? sim.F.toFixed(3) : '0.000') + ' N', hx + 10, hy + 40, { size: 13.5, weight: 700, color: activeB ? '#7CF0B4' : '#94A3B8' });
    D.text(ctx, 'Δt = ' + (activeB ? (sim.dt * 1000).toFixed(2) + ' ms' : '— ms'), hx + 10, hy + 60, { size: 12.5, weight: 600, color: activeB ? '#84B5FF' : '#94A3B8' });
    D.text(ctx, 'v = ' + (activeB ? sim.vMeas.toFixed(2) : '0.00') + ' m/s', hx + 10, hy + 78, { size: 12, color: activeB ? '#E2E8F0' : '#94A3B8' });
    D.text(ctx, 'r = ' + (sb.r * 100).toFixed(1) + ' cm' + (sb.trackFriction ? ' · 含静摩擦' : ''), hx + 10, hy + 94, { size: 11, color: sb.trackFriction ? '#FF8A9B' : '#9FB3CC' });
  };

  /* ---------- 指针交互（点击热区 / 拖拽半径 / 长按 3× 放大镜） ---------- */
  Bench.prototype.bindPointer = function () {
    var self = this, dragTarget = null, dragStartX = 0, dragStartY = 0, dragStartR = 0.15;
    function hitAt(p) {
      for (var i = self.hot.length - 1; i >= 0; i--) {
        var b = self.hot[i];
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
      }
      return null;
    }
    ML.stage.pointer(this.stage.el, {
      down: function (p) {
        dragTarget = hitAt(p);
        dragStartX = p.x;
        dragStartY = p.y;
        dragStartR = self.stB.r;
        if (self.app === 'A' && dragTarget && dragTarget.id === 'crank') {
          self.startA(true);
        }
      },
      move: function (p, a) {
        if (a.pressed) {
          var lbl = '';
          if (self.app === 'A') {
            var sim = self.stA.lastSim || self.curSimA();
            var g = self.geoA(self.stage.w, self.stage.h);
            lbl = p.x < (g.cxL + g.cxR) / 2 ? ('左标尺 ' + sim.divL.toFixed(2) + ' 格') : ('右标尺 ' + sim.divR.toFixed(2) + ' 格');
          } else {
            lbl = 'r = ' + (self.stB.r * 100).toFixed(1) + ' cm';
          }
          self.mag.show([self.stage.layer('bg').canvas, self.stage.layer('fg').canvas], p.x, p.y, self.stage.dpr, lbl);
          return;
        }
        if (self.app === 'B' && dragTarget && dragTarget.id === 'sliderB' && a.moved && !self.stB.running) {
          var gb = self.geoB(self.stage.w, self.stage.h);
          var th = self.stB.theta;
          var dr = ((p.x - dragStartX) * Math.cos(th) + (p.y - dragStartY) * Math.sin(th)) / gb.pxPerM;
          self.stB.r = P.clamp(Math.round((dragStartR + dr) * 100) / 100, 0.08, 0.20);
          self.refreshReadout();
          self.stage.invalidate('fg');
          self.updateLiveText();
        }
      },
      press: function (p) {
        var lbl = self.app === 'A'
          ? ('左 ' + self.stA.dispDivL.toFixed(2) + ' | 右 ' + self.stA.dispDivR.toFixed(2))
          : ('r = ' + (self.stB.r * 100).toFixed(1) + ' cm');
        self.mag.show([self.stage.layer('bg').canvas, self.stage.layer('fg').canvas], p.x, p.y, self.stage.dpr, lbl);
      },
      up: function (p, a) {
        self.mag.hide();
        if (self.app === 'A' && dragTarget && dragTarget.id === 'crank') {
          self.stopA(true);
        }
        if (a.moved || a.pressed || !dragTarget) { dragTarget = null; return; }
        var id = dragTarget.id; dragTarget = null;
        if (self.app === 'A') {
          var sa = self.stA;
          if (id === 'slotInner' || id === 'slotOuter') {
            self.setSlotL(id === 'slotOuter' ? 'outer' : 'inner');
          } else if (id === 'ballL') {
            var order = ['al', 'steel', 'copper'];
            self.setBall('L', order[(order.indexOf(sa.mL) + 1) % 3]);
          } else if (id === 'ballR') {
            var orderR = ['al', 'steel', 'copper'];
            self.setBall('R', orderR[(orderR.indexOf(sa.mR) + 1) % 3]);
          } else if (id.indexOf('pL') === 0) {
            self.setStep('L', parseInt(id.slice(2), 10));
          } else if (id.indexOf('pR') === 0) {
            self.setStep('R', parseInt(id.slice(2), 10));
          }
        }
      }
    });
  };

  Bench.prototype.setBall = function (side, val) {
    var sa = this.stA;
    if (this.guided() && sa.preset !== 'Fm' && ((side === 'L' && val !== sa.mR) || (side === 'R' && val !== sa.mL))) {
      this.block('当前为“' + (sa.preset === 'Fr' ? '探 F-r' : '探 F-ω') + '”实验，必须保持左、右两球质量相同！', 'E1');
      return;
    }
    if (side === 'L') sa.mL = val; else sa.mR = val;
    this.refreshReadout(); this.stage.invalidate('fg'); this.renderSide();
  };

  Bench.prototype.setSlotL = function (val) {
    var sa = this.stA;
    if (this.guided() && sa.preset !== 'Fr' && val === 'outer') {
      this.block('当前实验必须控制左、右运动半径相等（均取 r），不能改到外侧 2r！', 'E1');
      return;
    }
    sa.slotL = val;
    this.refreshReadout(); this.stage.invalidate('fg'); this.renderSide();
  };

  Bench.prototype.setStep = function (side, idx) {
    var sa = this.stA;
    if (this.guided() && sa.preset !== 'Fw' && ((side === 'L' && idx !== sa.stepR) || (side === 'R' && idx !== sa.stepL))) {
      this.block('当前实验必须控制两球角速度相同（塔轮选同一层 1:1）！', 'E1');
      return;
    }
    if (side === 'L') sa.stepL = idx; else sa.stepR = idx;
    this.doneA.P3 = true;
    this.refreshReadout(); this.stage.invalidate('fg'); this.renderSide();
  };

  Bench.prototype.renderStageActs = function () {
    var self = this;
    ML.clear(this.stageActs);
    if (this.app === 'A') {
      var sa = this.stA;
      var runBtn = h('button.btn.primary.big', {
        type: 'button',
        onclick: function () { if (sa.running) self.stopA(false); else self.startA(false); }
      }, sa.running ? '停止摇动' : '匀速摇动手柄');
      var recBtn = h('button.btn.cyan.big', { type: 'button', onclick: function () { self.recordA(); } }, '记入对比表');
      this.stageActs.appendChild(runBtn);
      this.stageActs.appendChild(recBtn);
    } else {
      var sb = this.stB;
      var runB = h('button.btn.primary.big', {
        type: 'button',
        onclick: function () {
          sb.running = !sb.running;
          if (sb.running) { sb.hasRun = true; self.loop.start(); } else self.loop.stop();
          self.renderStageActs(); self.renderSide();
        }
      }, sb.running ? '停止转动' : '启动旋转');
      var capB = h('button.btn.cyan.big', { type: 'button', onclick: function () { self.recordB(); } }, '采集当前组');
      this.stageActs.appendChild(runB);
      this.stageActs.appendChild(capB);
    }
  };

  Bench.prototype.updateLiveText = function () {
    if (!this.liveEl) return;
    if (this.app === 'A') {
      var sa = this.stA, sim = sa.lastSim || this.curSimA();
      var rStr = (sa.running || sa.holding) && sim.divR > 1e-6 ? (sa.dispDivL / sa.dispDivR).toFixed(2) + ' : 1' : '—';
      this.liveEl.innerHTML = 'ω<sub>左</sub> = <b>' + sim.wL.toFixed(1) + '</b>, ω<sub>右</sub> = <b>' + sim.wR.toFixed(1) + '</b> rad/s<br>' +
        '左标尺 = <b>' + sa.dispDivL.toFixed(2) + '</b> 格 ｜ 右标尺 = <b>' + sa.dispDivR.toFixed(2) + '</b> 格 ｜ 比值 = <b>' + rStr + '</b>';
    } else {
      var sb = this.stB, simB = sb.lastSim || this.curSimB();
      var activeB = sb.running || sb.hasRun || this.rowsB.length > 0;
      this.liveEl.innerHTML = activeB
        ? ('F = <b>' + simB.F.toFixed(3) + ' N</b> ｜ Δt = <b>' + (simB.dt * 1000).toFixed(2) + ' ms</b> ｜ ω = <b>' + simB.wMeas.toFixed(2) + ' rad/s</b>')
        : ('静止待机（未旋转）：预设 ω = <b>' + sb.w.toFixed(1) + ' rad/s</b> ｜ 点“启动旋转”或“采集当前组”测 <i>F</i> 与 Δt');
    }
  };

  /* ---------- 右侧操作栏 ---------- */
  Bench.prototype.renderSide = function () {
    var self = this, side = this.side;
    ML.clear(side);
    var ctl = h('div.side-ctl');
    function chip(label, on, fn, aria) {
      var attrs = { type: 'button', onclick: fn };
      if (aria) attrs['aria-label'] = aria;
      return h('button.chip' + (on ? '.on' : ''), attrs, label);
    }
    function row() { return h.apply(null, ['div.side-row'].concat([].slice.call(arguments))); }

    if (this.app === 'A') {
      var sa = this.stA;
      ctl.appendChild(row(
        chip('① 探 F-m', sa.preset === 'Fm', function () { self.applyPresetA('Fm'); }),
        chip('② 探 F-r', sa.preset === 'Fr', function () { self.applyPresetA('Fr'); }),
        chip('③ 探 F-ω', sa.preset === 'Fw', function () { self.applyPresetA('Fw'); })));
      ctl.appendChild(row(h('span.side-l', '左球'),
        chip('A · m', sa.mL === 'al', function () { self.setBall('L', 'al'); }),
        chip('B · 2m', sa.mL === 'steel', function () { self.setBall('L', 'steel'); }),
        chip('C · 3m', sa.mL === 'copper', function () { self.setBall('L', 'copper'); })));
      ctl.appendChild(row(h('span.side-l', '右球'),
        chip('A · m', sa.mR === 'al', function () { self.setBall('R', 'al'); }),
        chip('B · 2m', sa.mR === 'steel', function () { self.setBall('R', 'steel'); }),
        chip('C · 3m', sa.mR === 'copper', function () { self.setBall('R', 'copper'); })));
      ctl.appendChild(row(h('span.side-l', '左槽位'),
        chip('内侧 r', sa.slotL === 'inner', function () { self.setSlotL('inner'); }),
        chip('外侧 2r', sa.slotL === 'outer', function () { self.setSlotL('outer'); }),
        h('span.muted', '右: 短槽 r')));
      ctl.appendChild(row(h('span.side-l', '左塔轮'),
        [0, 1, 2].map(function (i) { return chip((i + 1) * 2 + 'cm', sa.stepL === i, function () { self.setStep('L', i); }); })));
      ctl.appendChild(row(h('span.side-l', '右塔轮'),
        [0, 1, 2].map(function (i) { return chip((i + 1) * 2 + 'cm', sa.stepR === i, function () { self.setStep('R', i); }); })));
      ctl.appendChild(row(h('span.side-l', '手柄转速'),
        [6, 9, 12].map(function (w) {
          return chip(w + ' rad/s', sa.wCrank === w, function () { sa.wCrank = w; self.refreshReadout(); self.stage.invalidate('fg'); self.renderSide(); });
        })));

      if (!this.guided()) {
        ctl.appendChild(row(h('span.side-l', '故障模拟'),
          chip('皮带打滑', sa.beltSlip, function () { sa.beltSlip = !sa.beltSlip; self.refreshReadout(); self.stage.invalidate('fg'); self.renderSide(); }),
          chip('转速不稳', sa.unsteadyCrank, function () { sa.unsteadyCrank = !sa.unsteadyCrank; self.refreshReadout(); self.stage.invalidate('fg'); self.renderSide(); }),
          chip('未调零+滞回', sa.scaleBad, function () { sa.scaleBad = !sa.scaleBad; self.refreshReadout(); self.stage.invalidate('fg'); self.renderSide(); })));
      }
      this.liveEl = h('div.m05-readout');
      this.refreshReadout();
      this.updateLiveText();
      ctl.appendChild(this.liveEl);

      ctl.appendChild(h('div.side-acts',
        h('button.btn', { type: 'button', onclick: function () { self.recordA(); } }, '记入对比表 (' + this.rowsA.length + ')'),
        h('button.btn', { type: 'button', onclick: function () {
          self.stopA(false); self.rowsA = []; self.analysis.hidden = true; self.updateAnaBtn(); self.setBanner(null); self.renderSide();
        } }, '清空重测')));
    } else {
      var sb = this.stB;
      ctl.appendChild(row(h('span.side-l', '滑块 m'),
        [0.050, 0.100, 0.150].map(function (mv) {
          return chip((mv * 1000).toFixed(0) + 'g', Math.abs(sb.m - mv) < 1e-4, function () { sb.m = mv; self.refreshReadout(); self.stage.invalidate('fg'); self.renderSide(); });
        })));
      ctl.appendChild(row(h('span.side-l', '半径 r'),
        chip('−2cm', false, function () { sb.r = P.clamp(+(sb.r - 0.02).toFixed(2), 0.08, 0.20); self.refreshReadout(); self.stage.invalidate('fg'); self.renderSide(); }, '减小半径 2 厘米'),
        h('span.side-v', (sb.r * 100).toFixed(1) + ' cm'),
        chip('+2cm', false, function () { sb.r = P.clamp(+(sb.r + 0.02).toFixed(2), 0.08, 0.20); self.refreshReadout(); self.stage.invalidate('fg'); self.renderSide(); }, '增大半径 2 厘米')));
      ctl.appendChild(row(h('span.side-l', '角速度 ω'),
        [4, 6, 8, 10, 12].map(function (w) {
          return chip(String(w), sb.w === w, function () { sb.w = w; self.refreshReadout(); self.stage.invalidate('fg'); self.renderSide(); });
        })));
      ctl.appendChild(row(h('span.side-l', '遮光条 d'),
        chip(sb.calDone ? '✓ 已测 d = 10.0 mm' : '用游标卡尺测 d', sb.calDone, function () {
          openCaliperModal(function (d) { sb.dMm = d; sb.calDone = true; self.doneB.P6 = true; self.renderSide(); }, 10.0);
        })));
      if (!this.guided()) {
        ctl.appendChild(row(h('span.side-l', '导轨摩擦'),
          chip('静摩擦 f₀ = 0.12 N', sb.trackFriction, function () { sb.trackFriction = !sb.trackFriction; self.refreshReadout(); self.stage.invalidate('fg'); self.renderSide(); })));
      }
      this.liveEl = h('div.m05-readout');
      this.refreshReadout();
      this.updateLiveText();
      ctl.appendChild(this.liveEl);

      ctl.appendChild(h('div.side-acts',
        h('button.btn.primary', { type: 'button', onclick: function () { self.sweepBAll(); } }, '自动扫速采 7 组'),
        h('button.btn', { type: 'button', onclick: function () {
          self.loop.stop(); sb.running = false; sb.hasRun = false; sb.lastSim = null; sb.theta = -Math.PI * 0.75;
          self.rowsB = []; self.analysis.hidden = true; self.updateAnaBtn(); self.setBanner(null); self.stage.invalidate('fg'); self.renderStageActs(); self.renderSide();
        } }, '清空重测')));
    }
    side.appendChild(ctl);

    if (this.guided()) {
      side.appendChild(h('div.side-k', '实验步骤'));
      var ids = this.app === 'A' ? ['P1', 'P2', 'P3', 'P4', 'P5'] : ['P6'];
      var doneMap = this.app === 'A' ? this.doneA : this.doneB;
      var curId = null;
      for (var k = 0; k < ids.length; k++) { if (!doneMap[ids[k]]) { curId = ids[k]; break; } }
      var olA = h('ol.steps', ids.map(function (id) {
        var p = PROC[id], ok = !!doneMap[id], isCur = id === curId;
        return h('li' + (ok ? '.ok' : '') + (isCur ? '.cur' : ''),
          h('div.st-t', (ok ? '✓ ' : isCur ? '▸ ' : '') + p.title),
          h('div.st-how', { html: M.tex(p.how) }),
          p.why ? h('div.st-why', { html: M.tex('理由：' + p.why) }) : null,
          p.errorId ? h('button.link.sm', { type: 'button', onclick: function () { openTry(p.errorId); } }, '为什么？试一试 →') : null);
      }));
      side.appendChild(olA);
      var curLi = olA.querySelector('li.cur');
      if (curLi && side.scrollHeight > side.clientHeight) {
        side.scrollTop = Math.max(0, curLi.offsetTop - side.offsetTop - 44);
      }
    } else {
      side.appendChild(h('div.side-tip', this.app === 'A'
        ? '自由模式：可同时改动多变量或开启皮带打滑、转速波动、标尺零偏，再记入对比表观察偏差！'
        : '自由模式：可开启导轨静摩擦 f₀ = 0.12 N 并自动扫速作图，观察 F-ω² 图像横截距变化！'));
    }
  };

  /* ---------- 下方数据分析区 ---------- */
  Bench.prototype.renderAnalysis = function (noScroll) {
    var self = this, el = this.analysis;
    el.hidden = false;
    ML.clear(el);

    if (this.app === 'A') {
      var allTagsA = [];
      this.rowsA.forEach(function (r) { (r.tags || []).forEach(function (t) { if (allTagsA.indexOf(t) < 0) allTagsA.push(t); }); });
      var tagBoxA = h('div.ana-tags');
      if (allTagsA.length) {
        tagBoxA.appendChild(h('span.tag.err', '⚠ 检测到实验偏差'));
        allTagsA.forEach(function (id) { tagBoxA.appendChild(h('button.tag', { type: 'button', onclick: function () { openTry(id); } }, ERR[id].name + ' → 试一试')); });
      } else {
        tagBoxA.appendChild(h('span.tag.ok', '✓ 控制变量与装置操作规范'));
      }
      el.appendChild(h('div.ana-head', h('h2.ana-h', '装置 A · 向心力演示器对比数据表'), tagBoxA));
      var trsA = this.rowsA.map(function (r, idx) {
        var dev = isFinite(r.ratioF) && r.ratioIdeal > 0 ? Math.abs(r.ratioF - r.ratioIdeal) / r.ratioIdeal : 0;
        return h('tr' + ((r.tags && r.tags.length) || dev > 0.08 ? '.hl' : ''),
          h('td', String(idx + 1)),
          h('td', r.preset),
          h('td', (r.mL * 1000).toFixed(0) + 'g / ' + (r.rL * 100).toFixed(0) + 'cm / ' + (r.RL * 100).toFixed(0) + 'cm'),
          h('td', (r.mR * 1000).toFixed(0) + 'g / ' + (r.rR * 100).toFixed(0) + 'cm / ' + (r.RR * 100).toFixed(0) + 'cm'),
          h('td', r.divL.toFixed(2)),
          h('td', r.divR.toFixed(2)),
          h('td', isFinite(r.ratioF) ? r.ratioF.toFixed(2) + ' : 1' : '—'),
          h('td', r.ratioIdeal.toFixed(2) + ' : 1'));
      });
      el.appendChild(h('div.tbl-wrap', { tabindex: '0', role: 'region', 'aria-label': '向心力演示器对比数据表' },
        h('table.dt.ana-tbl',
          h('tr', h('th', '#'), h('th', '探究组'), h('th', '左 (m / r / R)'), h('th', '右 (m / r / R)'), h('th', '左格数'), h('th', '右格数'), h('th', { html: '实测比 F<sub>左</sub>:F<sub>右</sub>' }), h('th', '理论比')),
          trsA)));
      if (!noScroll) el.scrollIntoView({ behavior: ML.perf.low ? 'auto' : 'smooth', block: 'nearest' });
      return;
    }

    var rowsB = this.rowsB;
    var hasFric = rowsB.some(function (r) { return r.friction; });
    var tagBoxB = h('div.ana-tags');
    if (hasFric) {
      tagBoxB.appendChild(h('span.tag.err', '⚠ 存在导轨静摩擦'));
      tagBoxB.appendChild(h('button.tag', { type: 'button', onclick: function () { openTry('E6'); } }, ERR.E6.name + ' → 试一试'));
    } else {
      tagBoxB.appendChild(h('span.tag.ok', '✓ 光电门与力传感器数据规范'));
    }
    el.appendChild(h('div.ana-head', h('h2.ana-h', '装置 B · 力传感器与光电门数据分析'), tagBoxB));

    var leftCard = h('div.ana-card');
    leftCard.appendChild(h('h3', '采集数据表（d = ' + this.stB.dMm.toFixed(1) + ' mm）'));
    var trsB = rowsB.map(function (r, idx) {
      return h('tr',
        h('td', String(idx + 1)),
        h('td', (r.m * 1000).toFixed(0)),
        h('td', (r.r * 100).toFixed(1)),
        h('td', (r.dt * 1000).toFixed(2)),
        h('td', r.wMeas.toFixed(2)),
        h('td', r.w2.toFixed(1)),
        h('td', (r.invDt2 / 1e4).toFixed(2)),
        h('td', r.F.toFixed(3)));
    });
    leftCard.appendChild(h('div.tbl-wrap', { tabindex: '0', role: 'region', 'aria-label': '力传感器与光电门测量数据表' },
      h('table.dt.ana-tbl',
        h('tr', h('th', '#'), h('th', 'm/g'), h('th', 'r/cm'), h('th', 'Δt/ms'), h('th', 'ω/(rad/s)'), h('th', 'ω²'), h('th', '1/Δt²(×10⁴)'), h('th', 'F/N')),
        trsB)));

    var rightCard = h('div.ana-card');
    rightCard.appendChild(h('h3', '图像法处理：化曲为直'));
    if (rowsB.length >= 2) {
      var modeB = this.stB.chartX || 'omega2';
      rightCard.appendChild(h('div.side-row',
        h('span.side-l', '坐标模式'),
        [['omega', 'F − ω（曲线）'], ['omega2', 'F − ω²（直线拟合）'], ['invDt2', 'F − 1/Δt²（直线拟合）']].map(function (it) {
          return h('button.chip' + (modeB === it[0] ? '.on' : ''), {
            type: 'button',
            onclick: function () { self.stB.chartX = it[0]; self.renderAnalysis(true); }
          }, it[1]);
        })));
      var chBox = h('div'); rightCard.appendChild(chBox);
      if (modeB === 'omega') {
        var chW = new ML.Chart(chBox, { xLabel: 'ω / (rad·s⁻¹)', yLabel: 'F / N', height: 235, paper: true });
        chW.set([{ pts: rowsB.map(function (r) { return [r.wMeas, r.F]; }), color: '#1661FF', label: 'F − ω 非线性抛物线' }]);
        rightCard.appendChild(h('div.formula', '直接作 F − ω 图像为曲线，难以定量检验二次方关系，请切换为 F − ω² 或 F − 1/Δt² 化曲为直。'));
      } else {
        var fitRes = MC.fitSensor(rowsB, modeB);
        var ptsF = rowsB.map(function (r) { return [modeB === 'invDt2' ? r.invDt2 : r.w2, r.F]; });
        var chL = new ML.Chart(chBox, {
          xLabel: modeB === 'invDt2' ? '1/Δt² / s⁻²' : 'ω² / (rad²·s⁻²)',
          yLabel: 'F / N', height: 235, paper: true
        });
        chL.set([{ pts: ptsF, fit: true, color: '#1661FF', label: '拟合斜率 k = ' + fitRes.k.toExponential(3) }]);
        var r0 = rowsB[0], isInv = modeB === 'invDt2', kTheo = isInv ? (r0.m * r0.d * r0.d / r0.r) : (r0.m * r0.r);
        rightCard.appendChild(h('div.formula', {
          html: '拟合斜率 k = <b>' + fitRes.k.toExponential(3) + '</b>（理论 ' + (isInv ? 'md²/r' : 'mr') + ' = ' + kTheo.toExponential(3) + '），R² = ' + fitRes.r2.toFixed(4) +
            '<br>纵截距 b = <b>' + fitRes.b.toFixed(3) + ' N</b>' +
            (fitRes.b < -0.03 ? ('，横截距 ' + (isInv ? '(1/Δt²)₀ = <b>' + fitRes.xIntercept.toFixed(1) + ' s⁻²</b>' : 'ω₀² = <b>' + fitRes.xIntercept.toFixed(2) + ' rad²·s⁻²</b>')) : '')
        }));
        if (fitRes.b < -0.03) {
          rightCard.appendChild(h('div.warnline', isInv
            ? ('⚠ 出现正横截距（F = (md²/r)/Δt² − f静），表明导轨存在静摩擦 f静 ≈ ' + (-fitRes.b).toFixed(2) + ' N，但斜率 k = md²/r 仍精确！')
            : ('⚠ 出现正横截距（F = mrω² − f静），表明导轨存在静摩擦 f静 ≈ ' + (-fitRes.b).toFixed(2) + ' N，但斜率 k = mr 仍精确！')));
        }
      }
    } else {
      rightCard.appendChild(h('div.cmp-note', '再采集不同转速的数据（或点“自动扫速采 7 组”），即可作 F − ω² 线性拟合图。'));
    }

    el.appendChild(h('div.ana-grid', leftCard, rightCard));
    if (!noScroll) el.scrollIntoView({ behavior: ML.perf.low ? 'auto' : 'smooth', block: 'nearest' });
  };

  /* =====================================================================
   *  ③ 诊·误差：四拍试一试 & 结果反推适配器
   * ===================================================================== */
  function makeTryStage(area, height) {
    var wrap = h('div.try-stage-wrap');
    if (height) wrap.style.height = height + 'px';
    area.appendChild(wrap);
    return new ML.stage.Stage(wrap, { layers: ['bg'] });
  }

  var adapter = {
    compare: function (err, area, done) {
      var tids = [];
      function defer(fn, ms) {
        var id = setTimeout(function () { if (area && area.isConnected) fn(); }, ms);
        tids.push(id);
      }
      if (err.id === 'E1') {
        var sOk = MC.simulateA({ mL: 'al', mR: 'al', slotL: 'inner', stepL: 0, stepR: 1, ideal: true }, 1);
        var sBad = MC.simulateA({ mL: 'steel', mR: 'al', slotL: 'outer', stepL: 0, stepR: 1, ideal: true }, 1);
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '实验方案（目标：探 F-ω）'), h('th', '左球配置'), h('th', '左格数'), h('th', '右格数'), h('th', { html: '实测比 F<sub>左</sub>:F<sub>右</sub>' })),
          h('tr', h('td', '规范（控制 m、r 不变）'), h('td', 'A · m · 内侧 r · 轮 2cm'), h('td', sOk.divL.toFixed(2)), h('td', sOk.divR.toFixed(2)), h('td', sOk.ratioF.toFixed(2) + ' : 1（纯 ω² 比）')),
          h('tr.hl', h('td', '错误（多改了 m 与 r）'), h('td', 'B · 2m · 外侧 2r · 轮 2cm'), h('td', sBad.divL.toFixed(2)), h('td', sBad.divR.toFixed(2)), h('td', sBad.ratioF.toFixed(2) + ' : 1（混杂乘积！）'))));
        area.appendChild(h('div.cmp-note', '未控制变量时，比值变成 2(m) × 2(r) × 4(ω²) = 16.00 : 1，无法单独验证 F ∝ ω²。'));
        defer(done, 120);
      } else if (err.id === 'E2') {
        var sGood = MC.simulateA({ mL: 'al', mR: 'al', slotL: 'inner', stepL: 0, stepR: 1, wCrank: 6.0, ideal: true }, 2);
        var sRev = MC.simulateA({ mL: 'al', mR: 'al', slotL: 'inner', stepL: 1, stepR: 0, wCrank: 6.0, ideal: true }, 2);
        var stg2 = makeTryStage(area, 182);
        stg2.on('bg', function (ctx, w, hh) {
          ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
          D.text(ctx, '正确 R左:R右 = 1:2 (ω=6 rad/s)', w * 0.25, 20, { align: 'center', size: 12, weight: 700, color: '#17784F' });
          drawGradScale(ctx, w * 0.18, 118, sGood.divL, 5, 15, '左');
          drawGradScale(ctx, w * 0.32, 118, sGood.divR, 5, 15, '右');
          D.text(ctx, '弄反 R左:R右 = 2:1 (同速 ω=6)', w * 0.75, 20, { align: 'center', size: 12, weight: 700, color: '#C7374B' });
          drawGradScale(ctx, w * 0.68, 118, sRev.divL, 5, 15, '左');
          drawGradScale(ctx, w * 0.82, 118, sRev.divR, 5, 15, '右');
        });
        area.appendChild(h('div.cmp-note', { html: '皮带不打滑时 ω ∝ 1/R：把 R<sub>左</sub>:R<sub>右</sub> 套成 2:1 后，左轮反而转得更慢（ω<sub>左</sub>:ω<sub>右</sub> = 1:2），标尺露格比倒置为 1 : 4！' }));
        defer(done, 120);
      } else if (err.id === 'E3') {
        var ws3 = [4, 6, 8, 10], pOk = [], pSlip = [];
        ws3.forEach(function (w) {
          var a = MC.simulateA({ wCrank: w, beltSlip: false, ideal: true }, 3);
          var b = MC.simulateA({ wCrank: w, beltSlip: true, ideal: true }, 3);
          pOk.push([w, a.divL]); pSlip.push([w, b.divL]);
        });
        var ch3 = new ML.Chart(area, { xLabel: '手柄角速度 ω / (rad·s⁻¹)', yLabel: '左侧标尺格数', height: 210, paper: true, x: [3, 11], y: [0, 3.2] });
        ch3.set([
          { pts: pOk, color: '#25A870', label: '皮带不打滑（理论值）' },
          { pts: pSlip, color: '#C7374B', mark: 'x', label: '皮带打滑 18%（格数偏小 32.8%）' }
        ]);
        area.appendChild(h('div.cmp-note', '从动轮角速度变为 0.82 倍时，向心力变为 0.82² = 0.6724 倍，稳定偏小 32.76%。'));
        defer(done, 120);
      } else if (err.id === 'E4') {
        var sSt = MC.sampleA({ wCrank: 6.0, unsteadyCrank: false, ideal: false }, 25, 11);
        var sUn = MC.sampleA({ wCrank: 6.0, unsteadyCrank: true, ideal: false }, 25, 11);
        var ch4 = new ML.Chart(area, { xLabel: '时间 t / s', yLabel: '左标尺示数 / 格', height: 210, x: [0, 2.0], y: [0.4, 1.8] });
        ch4.set([
          { pts: sSt.samples.map(function (q) { return [q.t, q.divL]; }), color: '#25A870', label: '匀速摇动 σ=' + sSt.stdL.toFixed(3) + ' 格' },
          { pts: sUn.samples.map(function (q) { return [q.t, q.divL]; }), color: '#C7374B', mark: 'x', label: '转速不稳 ±22% σ=' + sUn.stdL.toFixed(3) + ' 格' }
        ]);
        area.appendChild(h('div.cmp-note', '因为 F ∝ ω²，±22% 的手摇转速起伏造成左标尺剧烈跳动（σ = ' + sUn.stdL.toFixed(3) + ' 格），无法准确读数。'));
        defer(done, 120);
      } else if (err.id === 'E5') {
        var ws5 = [0, 4, 6, 8, 10], gPts = [], upPts = [], dnPts = [];
        ws5.forEach(function (w) {
          gPts.push([w * w, MC.simulateA({ wCrank: w, scaleBad: false, ideal: true }, 5).divL]);
          upPts.push([w * w, MC.simulateA({ wCrank: w, scaleBad: true, motionDir: 'up', ideal: true }, 5).divL]);
          dnPts.push([w * w, MC.simulateA({ wCrank: w, scaleBad: true, motionDir: 'down', ideal: true }, 5).divL]);
        });
        var ch5 = new ML.Chart(area, { xLabel: 'ω² / (rad²·s⁻²)', yLabel: '左标尺读数 / 格', height: 210, paper: true, x: [0, 110], y: [0, 4.0] });
        ch5.set([
          { pts: gPts, fit: true, color: '#25A870', label: '正常调零（过原点）' },
          { pts: upPts, fit: true, color: '#C7374B', mark: 'x', label: '未调零+升速滞回 (+0.60−0.25)' },
          { pts: dnPts, fit: true, color: '#E69B2D', dash: true, label: '未调零+降速滞回 (+0.60+0.25)' }
        ]);
        area.appendChild(h('div.cmp-note', '零偏 +0.60 格使图像不过原点，套筒静摩擦 ±0.25 格导致升速与降速读数出现 0.50 格滞回差。'));
        defer(done, 120);
      } else if (err.id === 'E6') {
        var rOk = MC.sweepB({ m: 0.100, r: 0.150, trackFriction: false, ideal: true }, [4, 5, 6, 7, 8, 9, 10], 7);
        var rFr = MC.sweepB({ m: 0.100, r: 0.150, trackFriction: true, ideal: true }, [4, 5, 6, 7, 8, 9, 10], 7);
        var fOk = MC.fitSensor(rOk, 'omega2'), fFr = MC.fitSensor(rFr, 'omega2');
        var ch6 = new ML.Chart(area, { xLabel: 'ω² / (rad²·s⁻²)', yLabel: 'F / N', height: 210, paper: true, x: [0, 110], y: [-0.05, 1.6] });
        ch6.set([
          { pts: rOk.map(function (q) { return [q.w2, q.F]; }), fit: true, color: '#25A870', label: '无摩擦：k=' + fOk.k.toFixed(4) + ', 横截距=0' },
          { pts: rFr.map(function (q) { return [q.w2, q.F]; }), fit: true, color: '#C7374B', mark: 'x', label: '含静摩擦 0.12N：k=' + fFr.k.toFixed(4) + ', ω₀²=' + fFr.xIntercept.toFixed(1) }
        ]);
        area.appendChild(h('div.cmp-note', '含静摩擦时 F-ω² 直线出现正横截距 ω₀² = f静/(mr) = ' + fFr.xIntercept.toFixed(1) + ' rad²/s²，而斜率 k = mr = ' + fFr.k.toFixed(4) + ' kg·m 完全保持不变！'));
        defer(done, 120);
      }
      return function () {
        tids.forEach(function (id) { clearTimeout(id); });
        tids.length = 0;
      };
    },
    show: function (c, vis) {
      var sh = c.show || {};
      if (sh.type === 'scale-ratio') {
        var s = MC.simulateA({ mL: 'al', mR: 'al', slotL: 'inner', stepL: 1, stepR: 0, wCrank: 12.0, ideal: true }, 1);
        var wrap = h('div.rev-stage-wrap'); wrap.style.height = '184px'; vis.appendChild(wrap);
        var stg = new ML.stage.Stage(wrap, { layers: ['bg'] });
        stg.on('bg', function (ctx, w, hh) {
          ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
          drawGradScale(ctx, w * 0.34, 98, s.divL, 5, 14, '左标尺');
          drawGradScale(ctx, w * 0.66, 98, s.divR, 5, 14, '右标尺');
          D.text(ctx, '实测格数比 n左 : n右 = 1 : 4', w * 0.5, 174, { align: 'center', size: 12, weight: 700, color: '#C7374B' });
        });
      } else if (sh.type === 'fw-curve') {
        var rows2 = MC.sweepB({ m: 0.100, r: 0.150, ideal: true }, [2, 4, 6, 8, 10, 12], 1);
        var ch2 = new ML.Chart(vis, { xLabel: 'ω / (rad·s⁻¹)', yLabel: 'F / N', height: 185, paper: true });
        ch2.set([{ pts: rows2.map(function (r) { return [r.w, r.F]; }), color: '#1661FF', label: '实测 F-ω 曲线（非直线）' }]);
      } else if (sh.type === 'fw2-intercept') {
        var rows3 = MC.sweepB({ m: 0.100, r: 0.150, trackFriction: true, ideal: true }, [4, 5, 6, 7, 8, 9, 10], 1);
        var ch3 = new ML.Chart(vis, { xLabel: 'ω² / (rad²·s⁻²)', yLabel: 'F / N', height: 185, paper: true, x: [0, 110], y: [-0.05, 1.6] });
        ch3.set([{ pts: rows3.map(function (r) { return [r.w2, r.F]; }), fit: true, color: '#C7374B', label: 'F-ω² 图（存在正横截距 ω₀²）' }]);
      } else if (sh.type === 'hainan-disk') {
        var wrap4 = h('div.rev-stage-wrap'); wrap4.style.height = '136px'; vis.appendChild(wrap4);
        var stg4 = new ML.stage.Stage(wrap4, { layers: ['bg'] });
        stg4.on('bg', function (ctx, w, hh) {
          ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
          var cx = w * 0.42, cy = hh * 0.52, R = 50;
          ctx.fillStyle = '#EEF2F6'; ctx.strokeStyle = '#596574'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#10233F'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
          drawBall(ctx, cx + R - 9, cy, 9, '#F2BC79', '#B56822');
          ctx.strokeStyle = '#1661FF'; ctx.setLineDash([3, 2]);
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R - 9, cy); ctx.stroke(); ctx.setLineDash([]);
          D.text(ctx, '盘直径 D，小圆柱直径 d（外壁齐平盘缘）', cx + R + 18, cy - 6, { size: 12, weight: 700 });
          D.text(ctx, '转动半径 r = ?', cx + R + 18, cy + 16, { size: 12, weight: 700, color: '#1661FF' });
        });
      }
    },
    restore: function () {
      if (!bench) { S.mode = 'guided'; ML.store.save(); return; }
      bench.loop.stop();
      bench.setMode('guided');
      bench.stA.running = false; bench.stA.holding = false;
      bench.stB.running = false;
      bench.setBanner(null);
      bench.refreshReadout(); bench.stage.invalidate(); bench.renderStageActs(); bench.renderSide();
    },
    replay: function (errId) {
      var e = ERR[errId]; if (!e) return;
      shell.go('bench');
      bench.loop.stop();
      bench.setMode('free', true);
      var cfg = e.config || {};
      if (cfg.app === 'B') {
        bench.setApp('B', true);
        bench.stB.trackFriction = !!cfg.trackFriction;
        bench.stB.calDone = true;
        bench.refreshReadout(); bench.stage.invalidate(); bench.renderStageActs(); bench.renderSide();
        bench.setBanner('<b>复现：' + e.name + '</b>　已开启导轨静摩擦 f₀ = 0.12 N，点击“自动扫速采 7 组”观察 F-ω² 正横截距。');
      } else {
        bench.setApp('A', true);
        var sa = bench.stA;
        sa.preset = cfg.preset || 'Fw';
        sa.mL = cfg.mL || 'al'; sa.mR = cfg.mR || 'al';
        sa.slotL = cfg.slotL || 'inner';
        sa.stepL = cfg.stepL != null ? cfg.stepL : 0;
        sa.stepR = cfg.stepR != null ? cfg.stepR : 0;
        sa.beltSlip = !!cfg.beltSlip;
        sa.unsteadyCrank = !!cfg.unsteadyCrank;
        sa.scaleBad = !!cfg.scaleBad;
        if (errId === 'E2') sa.wCrank = 12;
        bench.refreshReadout(); bench.stage.invalidate(); bench.renderStageActs(); bench.renderSide();
        bench.setBanner('<b>复现：' + e.name + '</b>　已按故障预设实验台，点击“匀速摇动手柄”并记入对比表查看后果。');
      }
      if (shell.main) shell.main.scrollTop = 0;
    }
  };

  function openTry(id) {
    var e = ERR[id];
    if (e) ML.TryIt(e, adapter, e.noteId && PROC[e.noteId] ? '<b>' + PROC[e.noteId].title + '：</b>' + PROC[e.noteId].how : '');
  }

  /* =====================================================================
   *  ① 学·原理：6 页交互小部件
   * ===================================================================== */
  function learnWidget(p, card) {
    if (learnStopFn) { learnStopFn(); learnStopFn = null; }
    learnResumeFn = null;
    if (!p.widget) return;
    var box = h('div.learn-widget'); card.appendChild(box);

    if (p.widget === 'var-demo') {
      var modeV = 'Fm';
      var bar = h('div.side-row',
        h('button.chip.on', { type: 'button', data: { m: 'Fm' }, onclick: function () { pick('Fm'); } }, '① 探 F-m（控制 r, ω）'),
        h('button.chip', { type: 'button', data: { m: 'Fr' }, onclick: function () { pick('Fr'); } }, '② 探 F-r（控制 m, ω）'),
        h('button.chip', { type: 'button', data: { m: 'Fw' }, onclick: function () { pick('Fw'); } }, '③ 探 F-ω（控制 m, r）'));
      var split = h('div.cmp-split');
      var note = h('div.cmp-note');
      box.appendChild(bar); box.appendChild(split); box.appendChild(note);
      function pick(m) {
        modeV = m;
        ML.$$('.chip', bar).forEach(function (c) { c.classList.toggle('on', c.dataset.m === m); });
        var cfg = m === 'Fm' ? { mL: 'steel', mR: 'al', slotL: 'inner', stepL: 0, stepR: 0 }
          : m === 'Fr' ? { mL: 'al', mR: 'al', slotL: 'outer', stepL: 0, stepR: 0 }
          : { mL: 'al', mR: 'al', slotL: 'inner', stepL: 0, stepR: 1 };
        var s = MC.simulateA(Object.assign(cfg, { ideal: true }), 1);
        ML.clear(split);
        split.appendChild(h('div.cmp-box', '左侧（长槽）', h('b', 'm=' + (s.mL * 1000).toFixed(0) + 'g · r=' + (s.rL * 100).toFixed(0) + 'cm · ω=' + s.wL.toFixed(0) + ' rad/s'), '露格：' + s.divL.toFixed(2) + ' 格'));
        split.appendChild(h('div.cmp-box.good', '右侧（短槽）与比值', h('b', 'm=' + (s.mR * 1000).toFixed(0) + 'g · r=' + (s.rR * 100).toFixed(0) + 'cm · ω=' + s.wR.toFixed(0) + ' rad/s'), '露格：' + s.divR.toFixed(2) + ' 格 ｜ 比值 ' + s.ratioF.toFixed(2) + ' : 1'));
        note.innerHTML = m === 'Fm' ? '<b>控制 r、ω 相同</b>：B 球质量是A 球的 2 倍 ⇒ 向心力之比 F<sub>左</sub> : F<sub>右</sub> = <b>2 : 1</b>。'
          : m === 'Fr' ? '<b>控制 m、ω 相同</b>：长槽外侧半径 2r 是短槽 r 的 2 倍 ⇒ 向心力之比 F<sub>左</sub> : F<sub>右</sub> = <b>2 : 1</b>。'
          : '<b>控制 m、r 相同</b>：塔轮半径比 1:2 使 ω<sub>左</sub>:ω<sub>右</sub> = 2:1 ⇒ 向心力之比 F<sub>左</sub> : F<sub>右</sub> = <b>4 : 1</b>。';
      }
      pick(modeV);
    } else if (p.widget === 'pulley-demo') {
      var stL = 0, stR = 1, thL = 0, thR = 0, playing = true;
      var bar2 = h('div.side-row', h('span.side-l', '左塔轮'),
        [0, 1, 2].map(function (i) { return h('button.chip' + (i === stL ? '.on' : ''), { type: 'button', data: { s: 'L', i: String(i) }, onclick: function () { stL = i; sync2(); } }, (i + 1) * 2 + 'cm'); }),
        h('span.side-l', { style: { minWidth: '46px' } }, '右塔轮'),
        [0, 1, 2].map(function (i) { return h('button.chip' + (i === stR ? '.on' : ''), { type: 'button', data: { s: 'R', i: String(i) }, onclick: function () { stR = i; sync2(); } }, (i + 1) * 2 + 'cm'); }));
      var wrap2 = h('div.m05-w-stage.short'), note2 = h('div.cmp-note');
      box.appendChild(bar2); box.appendChild(wrap2); box.appendChild(note2);
      var stg2 = new ML.stage.Stage(wrap2, { layers: ['bg'] });
      var lp2 = new ML.stage.Loop(function (dt) {
        if (!playing || !wrap2.isConnected) return false;
        var s = MC.simulateA({ stepL: stL, stepR: stR, wCrank: 4.0, ideal: true }, 1);
        thL = (thL + s.wL * dt) % (Math.PI * 2);
        thR = (thR + s.wR * dt) % (Math.PI * 2);
        stg2.invalidate('bg');
        return true;
      });
      learnStopFn = function () { playing = false; lp2.stop(); };
      learnResumeFn = function () { if (wrap2.isConnected && !playing) { playing = true; lp2.start(); } };
      stg2.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var rLpx = (stL + 1) * 18, rRpx = (stR + 1) * 18, cy = hh * 0.50, xL = w * 0.28, xR = w * 0.72;
        ctx.strokeStyle = '#7A5C3E'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(xL, cy - rLpx); ctx.lineTo(xR, cy - rRpx); ctx.moveTo(xL, cy + rLpx); ctx.lineTo(xR, cy + rRpx); ctx.stroke();
        [[xL, rLpx, thL, '左轮'], [xR, rRpx, thR, '右轮']].forEach(function (it) {
          ctx.fillStyle = '#DCE4EC'; ctx.strokeStyle = '#1661FF'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(it[0], cy, it[1], 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(it[0], cy); ctx.lineTo(it[0] + Math.cos(it[2]) * it[1], cy + Math.sin(it[2]) * it[1]); ctx.stroke();
          D.text(ctx, it[3], it[0], cy + it[1] + 15, { align: 'center', size: 11.5, weight: 700 });
        });
      });
      function sync2() {
        ML.$$('.chip', bar2).forEach(function (c) {
          c.classList.toggle('on', (c.dataset.s === 'L' && +c.dataset.i === stL) || (c.dataset.s === 'R' && +c.dataset.i === stR));
        });
        var RL = MC.PULLEY_RADII[stL] * 100, RR = MC.PULLEY_RADII[stR] * 100;
        var ratioW = RR / RL;
        note2.innerHTML = '边缘线速度相等 v<sub>左</sub> = v<sub>右</sub> ⇒ <b>ω<sub>左</sub> : ω<sub>右</sub> = R<sub>右</sub> : R<sub>左</sub> = ' + RR.toFixed(0) + ' : ' + RL.toFixed(0) +
          ' = ' + ratioW.toFixed(2) + ' : 1</b> ⇒ 同质量同半径下 F<sub>左</sub> : F<sub>右</sub> = <b>' + (ratioW * ratioW).toFixed(2) + ' : 1</b>';
      }
      sync2();
      lp2.start();
    } else if (p.widget === 'scale-demo') {
      var presets = [['1:1', 0, 0, 'al', 'inner'], ['2:1 (换质量)', 0, 0, 'steel', 'inner'], ['2:1 (换半径)', 0, 0, 'al', 'outer'], ['4:1 (换塔轮)', 0, 1, 'al', 'inner'], ['1:4 (塔轮反套)', 1, 0, 'al', 'inner']];
      var cur = 3;
      var bar3 = h('div.side-row', presets.map(function (it, idx) {
        return h('button.chip' + (idx === cur ? '.on' : ''), { type: 'button', onclick: function () { cur = idx; render3(); } }, it[0]);
      }));
      var wrap3 = h('div.m05-w-stage.short'), note3 = h('div.cmp-note');
      box.appendChild(bar3); box.appendChild(wrap3); box.appendChild(note3);
      var stg3 = new ML.stage.Stage(wrap3, { layers: ['bg'] });
      stg3.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var pr = presets[cur];
        var s = MC.simulateA({ stepL: pr[1], stepR: pr[2], mL: pr[3], mR: 'al', slotL: pr[4], wCrank: pr[1] > pr[2] ? 12 : 6, ideal: true }, 1);
        var pxD3 = Math.min(18, Math.max(12, (hh - 82) / 5));
        drawGradScale(ctx, w * 0.35, hh - 62, s.divL, 5, pxD3, '左标尺');
        drawGradScale(ctx, w * 0.65, hh - 62, s.divR, 5, pxD3, '右标尺');
      });
      function render3() {
        ML.$$('.chip', bar3).forEach(function (c, i) { c.classList.toggle('on', i === cur); });
        var pr = presets[cur];
        var s = MC.simulateA({ stepL: pr[1], stepR: pr[2], mL: pr[3], mR: 'al', slotL: pr[4], wCrank: pr[1] > pr[2] ? 12 : 6, ideal: true }, 1);
        note3.innerHTML = '左标尺露出 <b>' + s.divL.toFixed(2) + '</b> 格（F<sub>左</sub> = ' + s.FL.toFixed(4) + ' N），右标尺露出 <b>' + s.divR.toFixed(2) + '</b> 格（F<sub>右</sub> = ' + s.FR.toFixed(4) + ' N），比值 <b>' + s.ratioF.toFixed(2) + ' : 1</b>。';
        stg3.invalidate('bg');
      }
      render3();
    } else if (p.widget === 'gate-demo') {
      var w4 = 6.0, r4 = 0.15;
      var bar4 = h('div.side-row', h('span.side-l', '参数'),
        [4, 6, 8, 10].map(function (wv) { return h('button.chip' + (wv === w4 ? '.on' : ''), { type: 'button', data: { w: String(wv) }, onclick: function () { w4 = wv; up4(); } }, 'ω=' + wv); }),
        [0.10, 0.15, 0.20].map(function (rv) { return h('button.chip' + (rv === r4 ? '.on' : ''), { type: 'button', data: { r: String(rv) }, onclick: function () { r4 = rv; up4(); } }, 'r=' + (rv * 100) + 'cm'); }));
      var gbHost = h('div'), note4 = h('div.cmp-note');
      box.appendChild(bar4); box.appendChild(gbHost); box.appendChild(note4);
      new GV.GaugeBench(gbHost, { height: 230, state: { type: 'caliper', div: 10, valMm: 10.0, hintAlign: true, locked: true } });
      function up4() {
        ML.$$('.chip', bar4).forEach(function (c) {
          c.classList.toggle('on', (+c.dataset.w === w4) || (Math.abs(+c.dataset.r - r4) < 1e-4));
        });
        var s = MC.simulateB({ m: 0.100, r: r4, d: 0.0100, w: w4, ideal: true }, 1);
        note4.innerHTML = '游标卡尺读出遮光条 d = <b>10.0 mm</b>（m = 0.100 kg）：Δt = <b>' + (s.dt * 1000).toFixed(2) + ' ms</b> ⇒ v = d/Δt = <b>' + s.vMeas.toFixed(2) + ' m/s</b> ⇒ F = md²/(rΔt²) = <b>' + s.F.toFixed(3) + ' N</b>。';
      }
      up4();
    } else if (p.widget === 'chart-demo') {
      var mode5 = 'fw';
      var bar5 = h('div.side-row',
        h('button.chip.on', { type: 'button', onclick: function () { sel5('fw', 0); } }, 'F − ω（曲线）'),
        h('button.chip', { type: 'button', onclick: function () { sel5('fw2', 1); } }, 'F − ω²（过原点直线）'),
        h('button.chip', { type: 'button', onclick: function () { sel5('fric', 2); } }, '含静摩擦 F − ω²（正横截距）'));
      var chHost = h('div'); box.appendChild(bar5); box.appendChild(chHost);
      var rowsClean = MC.sweepB({ m: 0.100, r: 0.150, ideal: true }, [4, 5, 6, 7, 8, 9, 10], 1);
      var rowsFric = MC.sweepB({ m: 0.100, r: 0.150, trackFriction: true, ideal: true }, [4, 5, 6, 7, 8, 9, 10], 1);
      function sel5(m, idx) {
        mode5 = m;
        ML.$$('.chip', bar5).forEach(function (c, i) { c.classList.toggle('on', i === idx); });
        ML.clear(chHost);
        if (m === 'fw') {
          var ch = new ML.Chart(chHost, { xLabel: 'ω / (rad·s⁻¹)', yLabel: 'F / N', height: 210, paper: true });
          ch.set([{ pts: rowsClean.map(function (r) { return [r.w, r.F]; }), color: '#1661FF', label: 'F ∝ ω² 抛物线' }]);
        } else if (m === 'fw2') {
          var ch2 = new ML.Chart(chHost, { xLabel: 'ω² / (rad²·s⁻²)', yLabel: 'F / N', height: 210, paper: true, x: [0, 110], y: [0, 1.6] });
          ch2.set([{ pts: rowsClean.map(function (r) { return [r.w2, r.F]; }), fit: true, color: '#25A870', label: 'F − ω² 过原点直线（斜率 k = mr = 0.0150）' }]);
        } else {
          var ch3 = new ML.Chart(chHost, { xLabel: 'ω² / (rad²·s⁻²)', yLabel: 'F / N', height: 210, paper: true, x: [0, 110], y: [-0.05, 1.6] });
          ch3.set([
            { pts: rowsClean.map(function (r) { return [r.w2, r.F]; }), fit: true, color: '#25A870', label: '无摩擦（过原点）' },
            { pts: rowsFric.map(function (r) { return [r.w2, r.F]; }), fit: true, color: '#C7374B', mark: 'x', label: '含静摩擦（正横截距 ω₀²=8.0，斜率不变）' }
          ]);
        }
      }
      sel5('fw', 0);
    } else if (p.widget === 'alt-demo') {
      var mode6 = 'hainan';
      var bar6 = h('div.side-row',
        h('button.chip.on', { type: 'button', onclick: function () { sel6('hainan', 0); } }, '2024 海南·圆盘小圆柱'),
        h('button.chip', { type: 'button', onclick: function () { sel6('beijing', 1); } }, '2025 北京·纸带圆周'),
        h('button.chip', { type: 'button', onclick: function () { sel6('cone', 2); } }, '圆锥摆验证'));
      var wrap6 = h('div.m05-w-stage.short'), note6 = h('div.cmp-note');
      box.appendChild(bar6); box.appendChild(wrap6); box.appendChild(note6);
      var stg6 = new ML.stage.Stage(wrap6, { layers: ['bg'] });
      stg6.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        if (mode6 === 'hainan') {
          var cx = 110, cy = hh * 0.5, R = 56;
          ctx.fillStyle = '#EEF2F6'; ctx.strokeStyle = '#596574'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          drawBall(ctx, cx + R - 10, cy, 10, '#F2BC79', '#B56822');
          ctx.strokeStyle = '#1661FF'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R - 10, cy); ctx.stroke();
          D.text(ctx, 'r = (D − d) / 2', cx + R + 20, cy + 4, { size: 13, weight: 700, color: '#1661FF' });
        } else if (mode6 === 'beijing') {
          ctx.fillStyle = '#EEF2F6'; ctx.strokeStyle = '#596574'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(86, hh * 0.52, 46, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#F6F1E3'; ctx.strokeStyle = '#BFAF86';
          ctx.fillRect(86, hh * 0.52 - 56, 220, 20); ctx.strokeRect(86, hh * 0.52 - 56, 220, 20);
          D.text(ctx, '逐差法 → 切向 aτ；vB² / R → 向心 an', 196, hh * 0.52 + 24, { size: 12.5, weight: 700, color: '#1661FF' });
        } else {
          ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(110, 20); ctx.lineTo(174, 126); ctx.stroke();
          ctx.strokeStyle = '#94A3B8'; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(110, 20); ctx.lineTo(110, 126); ctx.lineTo(174, 126); ctx.stroke(); ctx.setLineDash([]);
          drawBall(ctx, 174, 126, 9, '#8E99A6', '#4A5B73');
          D.text(ctx, 'mg tanθ = m (4π²/T²) L sinθ ⇒ m 消去', 200, 82, { size: 12.5, weight: 700, color: '#17784F' });
        }
      });
      function sel6(m, idx) {
        mode6 = m;
        ML.$$('.chip', bar6).forEach(function (c, i) { c.classList.toggle('on', i === idx); });
        note6.innerHTML = m === 'hainan' ? '<b>2024 海南卷</b>：D = 42.02 cm, d = 16.2 mm, 10 周 62.8 s ⇒ r = (D−d)/2 = 0.2020 m，ω = 1.0 rad/s，F ≈ 6.1×10⁻³ N。'
          : m === 'beijing' ? '<b>2025 北京卷</b>：圆盘边缘拉纸带，逐差法得边缘切向加速度 a<sub>τ</sub> = 0.81 m/s²，B 点线速度 v<sub>B</sub> = 0.40 m/s ⇒ a<sub>n</sub> = v<sub>B</sub>²/R = 1.6 m/s²。'
          : '<b>圆锥摆</b>：测 N 圈时间 t 得 T = t/N，代入 g = 4π²L cosθ / T² 比对当地重力加速度，无需天平测质量。';
        stg6.invalidate('bg');
      }
      sel6('hainan', 0);
    }
  }

  /* =====================================================================
   *  组装四区一卡外壳
   * ===================================================================== */
  var shell = new ML.Shell({
    title: C.title, sub: C.sub, summary: C.summary,
    tabs: [
      { id: 'learn', label: '学·原理', mount: function (el) { ML.Learn(el, C.learn, C.equipment, { onPage: learnWidget, onFinish: function () { shell.go('bench'); } }); } },
      { id: 'bench', label: '做·实验', mount: function (el) { bench = new Bench(el); } },
      { id: 'diag', label: '诊·误差', mount: function (el) {
        var wrap = h('div.diag'); el.appendChild(wrap);
        wrap.appendChild(h('h2.diag-h', 'A. 错误操作实验室'));
        wrap.appendChild(h('p.muted', '每个“试一试”按四拍进行：布置 → 运行 → 对比 → 追问与揭示。所有数据与曲线均由物理模型实时算出。'));
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
        wrap.appendChild(h('p.muted', '先根据异常现象或图像判断原因，再去实验台亲手复现。'));
        var rev = h('div.rev'); wrap.appendChild(rev);
        ML.Reverse(rev, C.reverse, adapter);
      } },
      { id: 'paper', label: '练·真题', mount: function (el) { new ML.Paper(el, Q, { title: C.title + ' · 真题训练', onReplay: adapter.replay }); } }
    ]
  });
  ML.bus.on('tab', function (tabId) {
    if (tabId === 'learn') {
      if (learnResumeFn) learnResumeFn();
    } else if (learnStopFn) {
      learnStopFn();
    }
    if (tabId !== 'bench' && bench && bench.loop) {
      bench.loop.stop();
      bench.stA.running = false; bench.stA.holding = false;
      bench.stB.running = false;
    }
  });
  shell.go(S.tab);
  ML.perf.probe();
  ML.m05 = { bench: function () { return bench; }, adapter: adapter, shell: shell };
})(typeof window !== 'undefined' ? (window.ML = window.ML || {}) : (globalThis.ML = globalThis.ML || {}));
