/* M09 scene — 用单摆测量重力加速度：RK4 非线性物理引擎 + 2.5D 实验台 + 游标卡尺/停表嵌用 + L-T² 拟合 + 诊断适配器。 */
(function (ML) {
  'use strict';
  var G = 9.80, RHO_AIR = 1.29, STEEL_D = 0.0190, STEEL_M = 0.028, FOAM_D = 0.0380, FOAM_M = 0.0025, DT = 1 / 240;

  function effectiveParams(opts) {
    opts = opts || {};
    var g = opts.g != null ? opts.g : G;
    var bob = opts.bob === 'foam' ? 'foam' : 'steel';
    var d = opts.d != null ? opts.d : (bob === 'foam' ? FOAM_D : STEEL_D);
    var r = d / 2;
    var m = opts.m != null ? opts.m : (bob === 'foam' ? FOAM_M : STEEL_M);
    var l = opts.l != null ? opts.l : 0.80;
    var ideal = !!opts.ideal;
    var pivot = opts.pivot === 'loose' ? 'loose' : 'clamp';
    var looseDelta = pivot === 'loose' ? (opts.looseDelta != null ? opts.looseDelta : 0.042) : 0;
    var LTrue = l + r;
    var LEff = LTrue + looseDelta;
    var V = (4 / 3) * Math.PI * r * r * r;
    var mAir = RHO_AIR * V;
    var mAdd = 0.5 * mAir;
    var gEff = ideal ? g : g * (m - mAir) / (m + mAdd);
    var cQuad = ideal ? 0 : (0.5 * RHO_AIR * 0.47 * Math.PI * r * r * LEff) / (m + mAdd);
    var bLin = ideal ? 0 : (bob === 'foam' ? 0.038 : 0.0005);
    return {
      g: g, bob: bob, d: d, r: r, m: m, l: l, ideal: ideal, pivot: pivot, looseDelta: looseDelta,
      LTrue: LTrue, LEff: LEff, gEff: gEff, cQuad: cQuad, bLin: bLin,
      T0: 2 * Math.PI * Math.sqrt(LTrue / g)
    };
  }

  function accel(theta, omega, p) {
    return -(p.gEff / p.LEff) * Math.sin(theta) - p.bLin * omega - p.cQuad * Math.abs(omega) * omega;
  }

  function tension(theta, omega, p) {
    return p.m * (p.gEff * Math.cos(theta) + p.LEff * omega * omega);
  }

  function createState(opts) {
    opts = opts || {};
    var deg = opts.thetaDeg != null ? opts.thetaDeg : 4;
    var th = deg * Math.PI / 180;
    return { t: 0, theta: th, omega: 0, theta0: th };
  }

  function rk4Step(st, p, dt) {
    dt = dt || DT;
    var th0 = st.theta, om0 = st.omega, t0 = st.t;
    var k1t = om0, k1o = accel(th0, om0, p);
    var th1 = th0 + 0.5 * dt * k1t, om1 = om0 + 0.5 * dt * k1o;
    var k2t = om1, k2o = accel(th1, om1, p);
    var th2 = th0 + 0.5 * dt * k2t, om2 = om0 + 0.5 * dt * k2o;
    var k3t = om2, k3o = accel(th2, om2, p);
    var th3 = th0 + dt * k3t, om3 = om0 + dt * k3o;
    var k4t = om3, k4o = accel(th3, om3, p);

    st.theta = th0 + (dt / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
    st.omega = om0 + (dt / 6) * (k1o + 2 * k2o + 2 * k3o + k4o);
    st.t = t0 + dt;

    var ev = { lowCross: null, highTurn: null };
    if ((th0 <= 0 && st.theta > 0) || (th0 >= 0 && st.theta < 0)) {
      var dTh = Math.abs(th0) + Math.abs(st.theta);
      var f = dTh > 0 ? Math.abs(th0) / dTh : 0;
      ev.lowCross = { t: t0 + f * dt, dir: st.theta > th0 ? 1 : -1, omega: om0 + f * (st.omega - om0) };
    }
    if (t0 > 0 && ((om0 > 0 && st.omega <= 0) || (om0 < 0 && st.omega >= 0))) {
      var dOm = Math.abs(om0) + Math.abs(st.omega);
      var f2 = dOm > 0 ? Math.abs(om0) / dOm : 0;
      ev.highTurn = { t: t0 + f2 * dt, theta: th0 + f2 * (st.theta - th0) };
    }
    return ev;
  }

  function simulatePeriod(opts) {
    opts = opts || {};
    var p = effectiveParams(opts);
    var st = createState(opts);
    var nCycles = opts.nCycles || 4;
    var leftTimes = [];
    var maxSteps = Math.ceil((nCycles + 2) * p.T0 * 1.5 / DT);
    for (var i = 0; i < maxSteps; i++) {
      var ev = rk4Step(st, p, DT);
      if (ev.lowCross && ev.lowCross.dir === -1) {
        leftTimes.push(ev.lowCross.t);
        if (leftTimes.length > nCycles) break;
      }
    }
    var T = leftTimes.length >= 2 ? (leftTimes[leftTimes.length - 1] - leftTimes[0]) / (leftTimes.length - 1) : p.T0;
    return { T: T, T0: p.T0, LTrue: p.LTrue, LEff: p.LEff, g: p.g, params: p };
  }

  function simulateTrace(opts, durationSec, sampleDt) {
    opts = opts || {};
    var p = effectiveParams(opts);
    var st = createState(opts);
    durationSec = durationSec || 4.5;
    sampleDt = sampleDt || 1 / 120;
    var sub = Math.max(1, Math.round(sampleDt / DT));
    var hStep = sampleDt / sub;
    var nSamples = Math.round(durationSec / sampleDt);
    var samples = [], lowCrossings = [], peaks = [], troughs = [];

    for (var i = 0; i <= nSamples; i++) {
      samples.push({ t: st.t, theta: st.theta, omega: st.omega, F: tension(st.theta, st.omega, p) });
      if (i === nSamples) break;
      for (var j = 0; j < sub; j++) {
        var ev = rk4Step(st, p, hStep);
        if (ev.lowCross) lowCrossings.push(ev.lowCross);
      }
    }

    for (var k = 1; k < samples.length - 1; k++) {
      var f0 = samples[k - 1].F, f1 = samples[k].F, f2 = samples[k + 1].F;
      if (f1 > f0 && f1 >= f2) {
        var den = f0 - 2 * f1 + f2;
        var shift = Math.abs(den) > 1e-12 ? 0.5 * (f0 - f2) / den : 0;
        peaks.push({ t: samples[k].t + shift * sampleDt, F: f1 });
      }
      if (f1 < f0 && f1 <= f2) {
        var den2 = f0 - 2 * f1 + f2;
        var shift2 = Math.abs(den2) > 1e-12 ? 0.5 * (f0 - f2) / den2 : 0;
        troughs.push({ t: samples[k].t + shift2 * sampleDt, F: f1 });
      }
    }
    var T_fromPeaks = peaks.length >= 2 ? 2 * (peaks[peaks.length - 1].t - peaks[0].t) / (peaks.length - 1) : p.T0;
    return { samples: samples, lowCrossings: lowCrossings, peaks: peaks, troughs: troughs, T_fromPeaks: T_fromPeaks, T0: p.T0, params: p };
  }

  function recordedLength(l, d, LMode) {
    if (LMode === 'l') return l;
    if (LMode === 'l+d') return l + d;
    return l + d / 2;
  }

  function calcG(L, T) {
    return 4 * Math.PI * Math.PI * L / (T * T);
  }

  function fitLT2(rows) {
    var xs = [], ys = [];
    for (var i = 0; i < rows.length; i++) {
      xs.push(rows[i].T * rows[i].T);
      ys.push(rows[i].L);
    }
    var fit = ML.phys.linfit(xs, ys);
    return { k: fit.k, b: fit.b, r2: fit.r2, gFit: 4 * Math.PI * Math.PI * fit.k };
  }

  function measureTrial(opts) {
    opts = opts || {};
    var sim = simulatePeriod(opts);
    var p = sim.params;
    var nMeas = opts.nMeasured || 30;
    var nTrue = opts.countOffset ? Math.max(1, nMeas + opts.countOffset) : nMeas;
    var totalTrue = nTrue * sim.T;
    var timingPos = opts.timingPos || 'low';
    var totalMeas = totalTrue;
    if (!p.ideal) {
      var rnd = ML.phys.rng(opts.seed || 17);
      var theta0 = (opts.thetaDeg != null ? opts.thetaDeg : 4) * Math.PI / 180;
      var vMax = Math.sqrt(Math.max(1e-6, 2 * p.gEff * p.LEff * (1 - Math.cos(theta0))));
      var aMax = Math.max(1e-4, p.gEff * Math.sin(theta0));
      var dx = 0.0018;
      var sigmaPos = timingPos === 'high' ? Math.sqrt(2 * dx / aMax) * 1.8 : dx / vMax;
      var sigmaEnd = Math.sqrt(sigmaPos * sigmaPos + 0.04 * 0.04);
      var err = (rnd.gauss(sigmaEnd) - rnd.gauss(sigmaEnd));
      totalMeas = Math.max(1, Math.round((totalTrue + err) * 10) / 10);
    } else {
      totalMeas = opts.roundStopwatch ? Math.round(totalTrue * 10) / 10 : totalTrue;
    }
    var TMeas = totalMeas / nMeas;
    var LRec = recordedLength(p.l, p.d, opts.LMode || 'l+r');
    var gMeas = calcG(LRec, TMeas);
    return {
      totalTime: totalMeas, nMeasured: nMeas, nTrue: nTrue,
      T: TMeas, TTrue: sim.T, T0: sim.T0,
      L: LRec, LTrue: p.LTrue, l: p.l, d: p.d,
      g: gMeas, params: p
    };
  }

  ML.pendulum = {
    G: G, DT: DT, STEEL_D: STEEL_D, FOAM_D: FOAM_D,
    effectiveParams: effectiveParams, accel: accel, tension: tension,
    createState: createState, rk4Step: rk4Step,
    simulatePeriod: simulatePeriod, simulateTrace: simulateTrace,
    recordedLength: recordedLength, calcG: calcG, fitLT2: fitLT2, measureTrial: measureTrial
  };
})(typeof window !== 'undefined' ? (window.ML = window.ML || {}) : (global.ML = global.ML || {}));

/* =========================================================================
 *  浏览器交互界面（Node 校验时跳过）
 * ========================================================================= */
(function (ML) {
  'use strict';
  if (typeof document === 'undefined') return;

  var h = ML.h, M = ML.math, P = ML.phys, D = ML.stage.draw, PM = ML.pendulum, GV = ML.gaugesView, GG = ML.gauges;
  var C = ML.json('ml-content'), Q = ML.json('ml-questions') || [];
  var S = ML.store.init(C.slug, {
    v: 1, tab: 'learn', learnPage: 0, mode: 'guided', ideal: false, timing: 'stopwatch',
    bench: { l: 0.80, dMm: 19.0, bob: 'steel', pivot: 'clamp', LMode: 'l+r', thetaDeg: 4, calDone: false },
    rows: [], answers: {}, done: {}
  });
  var ERR = {}; C.errors.forEach(function (e) { ERR[e.id] = e; });
  var PROC = {}; C.procedure.forEach(function (p) { PROC[p.id] = p; });
  var seedCounter = 29;
  var bench = null;

  /* 连续波形绘制组件（支持多条曲线、网格、标签与标注） */
  function drawWaveChart(container, series, opts) {
    opts = opts || {};
    var box = h('div.ml-chart');
    box.style.height = (opts.height || 215) + 'px';
    container.appendChild(box);
    var stg = new ML.stage.Stage(box, { layers: ['w'] });
    stg.on('w', function (ctx, w, hh) {
      var pad = { l: 50, r: 16, t: 22, b: 34 };
      var xMin = opts.x ? opts.x[0] : 0, xMax = opts.x ? opts.x[1] : 1;
      var yMin = Infinity, yMax = -Infinity;
      series.forEach(function (s) {
        (s.pts || []).forEach(function (pt) {
          if (pt[1] < yMin) yMin = pt[1];
          if (pt[1] > yMax) yMax = pt[1];
          if (!opts.x) { if (pt[0] < xMin) xMin = pt[0]; if (pt[0] > xMax) xMax = pt[0]; }
        });
      });
      if (opts.y) { yMin = opts.y[0]; yMax = opts.y[1]; }
      else {
        if (!isFinite(yMin)) { yMin = -1; yMax = 1; }
        var ys = Math.max(1e-6, yMax - yMin);
        yMin -= ys * 0.14; yMax += ys * 0.18;
      }
      var cw = Math.max(20, w - pad.l - pad.r), ch = Math.max(20, hh - pad.t - pad.b);
      function toX(x) { return pad.l + ((x - xMin) / Math.max(1e-9, xMax - xMin)) * cw; }
      function toY(y) { return pad.t + ch - ((y - yMin) / Math.max(1e-9, yMax - yMin)) * ch; }

      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
      ctx.strokeStyle = '#E3EAF3'; ctx.lineWidth = 1;
      for (var gx = 0; gx <= 4; gx++) {
        var xv = xMin + (xMax - xMin) * gx / 4, xpx = toX(xv);
        ctx.beginPath(); ctx.moveTo(xpx, pad.t); ctx.lineTo(xpx, pad.t + ch); ctx.stroke();
        D.text(ctx, xv.toFixed(1), xpx, pad.t + ch + 15, { align: 'center', size: 11, color: '#4A5B73' });
      }
      for (var gy = 0; gy <= 4; gy++) {
        var yv = yMin + (yMax - yMin) * gy / 4, ypx = toY(yv);
        ctx.beginPath(); ctx.moveTo(pad.l, ypx); ctx.lineTo(pad.l + cw, ypx); ctx.stroke();
        var dec = Math.abs(yMax - yMin) < 0.2 ? 3 : 1;
        D.text(ctx, yv.toFixed(dec), pad.l - 6, ypx + 4, { align: 'right', size: 11, color: '#4A5B73' });
      }
      if (yMin < 0 && yMax > 0) {
        var zy = toY(0);
        ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#94A3B8';
        ctx.beginPath(); ctx.moveTo(pad.l, zy); ctx.lineTo(pad.l + cw, zy); ctx.stroke(); ctx.restore();
      }
      ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + ch); ctx.lineTo(pad.l + cw, pad.t + ch); ctx.stroke();
      D.text(ctx, opts.xLabel || '', pad.l + cw, pad.t + ch + 28, { align: 'right', size: 12, weight: 600 });
      D.text(ctx, opts.yLabel || '', pad.l + 6, pad.t + 10, { size: 12, weight: 600 });

      ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t, cw, ch); ctx.clip();
      series.forEach(function (s) {
        if (!s.pts || s.pts.length < 2) return;
        ctx.strokeStyle = s.color || '#1661FF';
        ctx.lineWidth = 2;
        ctx.setLineDash(s.dash ? [6, 4] : []);
        ctx.beginPath();
        s.pts.forEach(function (pt, idx) {
          var qx = toX(pt[0]), qy = toY(pt[1]);
          if (idx === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      });
      (opts.notes || []).forEach(function (n) {
        var qx = toX(n.x), qy = toY(n.y);
        ctx.fillStyle = n.color || '#C7374B'; ctx.beginPath(); ctx.arc(qx, qy, 3.6, 0, Math.PI * 2); ctx.fill();
        D.text(ctx, n.text, qx, qy - 7, { align: 'center', size: 11, weight: 700, color: n.color || '#C7374B' });
      });
      ctx.restore();

      var ly = pad.t + 6;
      ctx.font = '600 11.5px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
      series.forEach(function (s) {
        if (!s.label) return;
        var tw = Math.min(cw - 32, ctx.measureText(s.label).width);
        var lx = Math.max(pad.l + 8, pad.l + cw - tw - 26);
        ctx.fillStyle = 'rgba(255,255,255,0.86)';
        ctx.fillRect(lx - 4, ly - 2, tw + 26, 16);
        ctx.fillStyle = s.color || '#1661FF'; ctx.fillRect(lx, ly + 5, 14, 3);
        D.text(ctx, s.label, lx + 18, ly + 10, { size: 11.5, color: '#10233F', maxW: cw - 30 });
        ly += 17;
      });
    });
  }

  /* =====================================================================
   *  游标卡尺测球径弹窗（嵌用 ML.gaugesView.GaugeBench）
   * ===================================================================== */
  function openCaliperModal(onConfirm, targetMm) {
    var old = document.querySelector('.ml-cal-modal');
    if (old) old.remove();
    var dTarget = targetMm || (bench && bench.b && bench.b.bob === 'foam' ? 38.0 : 19.0);
    var bName = dTarget > 25 ? '泡沫球' : '钢球';
    var dStr = dTarget.toFixed(1);
    var gHost = h('div');
    var inp = h('input.cal-inp', { type: 'text', value: '', placeholder: '如 ' + dStr, 'aria-label': '输入游标卡尺测得的' + bName + '直径' });
    var fb = h('div.cal-fb', '长按游标卡尺可呼出 3× 放大镜；10 分度游标卡尺不估读（精确到 0.1 mm）。');
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      document.removeEventListener('keydown', onKey);
      if (modal) { modal.remove(); modal = null; }
    }
    var modal = h('div.ml-modal.ml-cal-modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '游标卡尺测量摆球直径', onclick: function (e) { if (e.target === modal) close(); } },
      h('div.ml-modal-card',
        h('div.try-head',
          h('div', h('div.try-k', '仪器读数'), h('h2', '用 10 分度游标卡尺测量' + bName + '直径 d')),
          h('button.btn', { type: 'button', onclick: close }, '关闭')),
        gHost,
        h('div.cal-read-row',
          h('span', '测得' + bName + '直径 d ='), inp, h('span', 'mm'),
          h('button.btn.primary', { type: 'button', onclick: verify }, '确认读数'),
          h('button.btn', { type: 'button', onclick: function () { inp.value = dStr; verify(); } }, '填入 ' + dStr + ' mm 并确认')),
        fb));
    document.body.appendChild(modal);
    document.addEventListener('keydown', onKey);
    new GV.GaugeBench(gHost, { height: 270, state: { type: 'caliper', div: 10, valMm: dTarget, locked: true, hintAlign: false } });
    function verify() {
      var res = GG.caliper.diagnose(inp.value, dTarget, { div: 10, unit: 'mm' });
      fb.className = 'cal-fb ' + (res.ok ? 'ok' : 'bad');
      fb.textContent = (res.ok ? '✓ ' : '✕ ') + res.msg;
      if (res.ok) {
        ML.toast('游标卡尺读数正确：d = ' + dStr + ' mm（半径 r = ' + (dTarget / 2).toFixed(1) + ' mm = ' + (dTarget / 2000).toFixed(4) + ' m）', 'ok');
        setTimeout(function () { close(); if (onConfirm) onConfirm(dTarget); }, 350);
      }
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') verify(); });
  }

  /* =====================================================================
   *  ② 做·实验（虚拟实验台 + 停表/传感器 + L-T² 拟合）
   * ===================================================================== */
  function Bench(el) {
    var self = this; this.el = el;
    this.mode = S.mode || 'guided';
    this.timing = S.timing || 'stopwatch';
    this.speed = 1;
    this.rows = Array.isArray(S.rows) ? S.rows.slice() : [];
    var sb = S.bench || {};
    var lastRow = this.rows.length ? this.rows[this.rows.length - 1] : null;
    this.b = {
      l: sb.l != null ? sb.l : 0.80,
      dMm: sb.dMm != null ? sb.dMm : (sb.bob === 'foam' ? 38.0 : 19.0),
      bob: sb.bob || 'steel',
      pivot: sb.pivot || 'clamp',
      LMode: sb.LMode || 'l+r',
      thetaDeg: sb.thetaDeg != null ? sb.thetaDeg : 4,
      timingPos: sb.timingPos || 'low',
      calDone: !!sb.calDone,
      running: false,
      sim: null,
      params: null,
      t: 0,
      swActive: false,
      swStart: 0,
      swDir: -1,
      swCount: 0,
      lastCrossT: 0,
      countOffset: 0,
      autoTarget: 0,
      prevTheta: 0,
      trace: [],
      peaks: [],
      lastMeas: lastRow ? Object.assign({ src: this.timing }, lastRow) : null
    };
    var hasMeas = this.rows.length > 0;
    this.touched = {};
    this.done = { P2: this.b.calDone, P5: hasMeas, P6: hasMeas };

    var modeChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'guided' }, onclick: function () { self.setMode('guided'); } }, '引导模式'),
      h('button.chip', { type: 'button', data: { v: 'free' }, onclick: function () { self.setMode('free'); } }, '自由模式'));
    this.modeChips = modeChips;
    this.timingChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'stopwatch' }, onclick: function () { self.setTiming('stopwatch'); } }, '手动停表'),
      h('button.chip', { type: 'button', data: { v: 'sensor' }, onclick: function () { self.setTiming('sensor'); } }, '拉力传感器 F-t'));

    this.idealChip = h('button.chip', { type: 'button', title: '理想：无阻力、无浮力、无读数误差', onclick: function () {
      S.ideal = !S.ideal; ML.store.save();
      self.idealChip.classList.toggle('on', S.ideal);
      self.idealChip.textContent = S.ideal ? '理想条件' : '真实条件';
      self.stage.invalidate();
    } }, S.ideal ? '理想条件' : '真实条件');
    this.idealChip.classList.toggle('on', S.ideal);

    this.speedChip = h('button.chip', { type: 'button', onclick: function () {
      self.speed = self.speed === 1 ? 2 : self.speed === 2 ? 4 : 1;
      self.speedChip.textContent = '倍速 ×' + self.speed;
    } }, '倍速 ×1');

    this.bannerEl = h('div.bench-banner', { hidden: true });
    var topBar = h('div.bench-top', modeChips, this.timingChips, h('div.spacer'), this.idealChip, this.speedChip);
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
    this.loop = new ML.stage.Loop(function (dt) { return self.tick(dt); });
    this.bindPointer();
    this.setMode(this.mode, true);
    this.setTiming(this.timing, true);
    this.renderStageActs();
    this.updateDone();
    if (this.rows.length || this.b.lastMeas) this.renderAnalysis(true);
  }

  Bench.prototype.saveBench = function () {
    var b = this.b;
    ML.store.set({
      bench: { l: b.l, dMm: b.dMm, bob: b.bob, pivot: b.pivot, LMode: b.LMode, thetaDeg: b.thetaDeg, timingPos: b.timingPos, calDone: b.calDone },
      rows: this.rows
    });
  };
  Bench.prototype.setBanner = function (html) {
    this.bannerEl.hidden = !html;
    this.bannerEl.innerHTML = html || '';
    if (this.benchEl) this.benchEl.classList.toggle('has-banner', !!html);
  };
  Bench.prototype.guided = function () { return this.mode === 'guided'; };
  Bench.prototype.block = function (msg, errId) {
    ML.toast(msg, 'warn');
    this.setBanner('<b>先停一下：</b>' + msg + (errId ? ' <button class="link" type="button" data-try="' + errId + '">试一试：如果这样做会怎样 →</button>' : ''));
    var btn = ML.$('[data-try]', this.bannerEl);
    if (btn) btn.onclick = function () { openTry(errId); };
  };

  Bench.prototype.setMode = function (m, silent) {
    this.mode = m; S.mode = m; ML.store.save();
    ML.$$('.chip', this.modeChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === m); });
    if (m === 'guided' && this.b) {
      var b = this.b;
      b.pivot = 'clamp';
      b.bob = 'steel';
      b.dMm = 19.0;
      b.LMode = 'l+r';
      if (Math.abs(b.thetaDeg) > 5) b.thetaDeg = b.thetaDeg < 0 ? -4 : 4;
      b.countOffset = 0;
      b.timingPos = 'low';
      b.swBadStart = false;
      this.updateDone();
      this.saveBench();
      if (this.stage) this.stage.invalidate();
      this.renderStageActs();
    }
    if (!silent) { this.setBanner(null); ML.toast(m === 'guided' ? '引导模式：按实验规范校验每一步' : '自由模式：任意参数都可运行，由物理模型给出真实后果'); }
    this.renderStageActs();
    this.renderSide();
  };

  Bench.prototype.setTiming = function (t, silent) {
    this.timing = t; S.timing = t; ML.store.save();
    ML.$$('.chip', this.timingChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === t); });
    if (!silent) this.stopSwing();
    if (this.stage) this.stage.invalidate();
    this.renderStageActs();
    this.renderSide();
  };

  Bench.prototype.curD = function () { return this.b.bob === 'foam' ? PM.FOAM_D : PM.STEEL_D; };
  Bench.prototype.curLRec = function () { return PM.recordedLength(this.b.l, this.curD(), this.b.LMode); };

  Bench.prototype.setPivot = function (pv) {
    if (this.b.running) { ML.toast('请先停止摆动再调整悬点', 'warn'); return; }
    if (pv === 'loose' && this.guided()) {
      this.block('悬点不能仅绕在横杆上，要用铁夹夹紧，否则摆动中摆长会变化。', 'E4');
      return;
    }
    this.b.pivot = pv; this.touched.P1 = true; this.setBanner(null); this.updateDone(); this.saveBench(); this.stage.invalidate(); this.renderSide();
  };

  Bench.prototype.setBob = function (bob) {
    if (this.b.running) { ML.toast('请先停止摆动再换摆球', 'warn'); return; }
    if (bob === 'foam' && this.guided()) {
      this.block('泡沫球体积大、质量小，空气阻力和浮力影响很大，应选实心钢球。', 'E6');
      return;
    }
    this.b.bob = bob;
    this.b.dMm = bob === 'foam' ? 38.0 : 19.0;
    this.touched.P1 = true; this.setBanner(null); this.updateDone(); this.saveBench(); this.stage.invalidate(); this.renderSide();
  };

  Bench.prototype.setLength = function (l) {
    if (this.b.running) { ML.toast('请先停止摆动再调摆线长', 'warn'); return; }
    this.b.l = P.clamp(Math.round(l * 100) / 100, 0.50, 1.20);
    this.b.lastMeas = null; this.touched.P3 = true;
    this.updateDone(); this.saveBench(); this.stage.invalidate(); this.renderSide();
  };

  Bench.prototype.setLMode = function (lm) {
    if (lm !== 'l+r' && this.guided()) {
      this.block('摆长是从悬点到摆球球心的距离，应记录 L = l + d/2。', 'E3');
      return;
    }
    this.b.LMode = lm; this.touched.P3 = true;
    this.setBanner(null);
    if (this.b.lastMeas) {
      this.b.lastMeas.L = this.curLRec();
      this.b.lastMeas.g = PM.calcG(this.b.lastMeas.L, this.b.lastMeas.T);
      this.renderAnalysis(true);
    }
    this.updateDone(); this.saveBench(); this.renderSide();
  };

  Bench.prototype.setAngle = function (deg) {
    if (this.b.running) return;
    deg = P.clamp(Math.round(deg * 10) / 10, 3, 38);
    if (deg > 5 && this.guided()) {
      this.block('单摆做简谐运动的条件是摆角小于 5°，摆角过大周期会变长。', 'E5');
      return;
    }
    this.b.thetaDeg = deg; this.touched.P4 = true;
    this.setBanner(null);
    this.updateDone(); this.saveBench(); this.stage.invalidate('fg'); this.renderSide();
  };

  Bench.prototype.updateDone = function () {
    var b = this.b;
    this.done.P1 = !!this.touched.P1 && b.pivot === 'clamp' && b.bob === 'steel';
    this.done.P2 = b.calDone;
    this.done.P3 = !!this.touched.P3 && b.LMode === 'l+r';
    this.done.P4 = !!this.touched.P4 && Math.abs(b.thetaDeg) <= 5.01;
    this.done.P5 = (!!this.done.P5 || this.rows.length > 0) && b.timingPos !== 'high' && !b.countOffset && !b.swBadStart;
    this.done.P6 = !!this.done.P6 || !!b.lastMeas || this.rows.length > 0;
    this.done.P7 = this.rows.length >= 5;
    this.done.P8 = this.rows.length >= 2;
  };

  /* ---------- 舞台几何与绘制 ---------- */
  Bench.prototype.geo = function () {
    var w = this.stage.w, hh = this.stage.h;
    var px = this.timing === 'sensor' ? Math.round(w * 0.24) : Math.round(w * 0.48);
    var py = Math.max(46, hh * 0.13);
    var availH = Math.max(160, hh - py - 68);
    var ppm = availH / 1.26;
    if (this.timing === 'sensor' && Math.abs(this.b.thetaDeg) > 12) {
      var sDeg = Math.sin(Math.abs(this.b.thetaDeg) * Math.PI / 180);
      ppm = Math.min(ppm, (px - 24) / Math.max(0.2, (this.b.l + 0.03) * sDeg));
    }
    return { w: w, h: hh, px: px, py: py, ppm: ppm, availH: availH };
  };

  Bench.prototype.drawBg = function (ctx, w, hh) {
    var g = this.geo(), b = this.b, px = g.px, py = g.py, ppm = g.ppm;
    ctx.fillStyle = '#EAF1F8'; ctx.fillRect(0, 0, w, hh);

    // 桌面与铁架台
    var tableY = hh - 28;
    ctx.fillStyle = D.grad(ctx, 0, tableY, 0, hh, ['#E3C79A', '#C49F6B']);
    ctx.fillRect(0, tableY, w, 28);
    ctx.fillStyle = '#9F7C49'; ctx.fillRect(0, tableY, w, 2.5);

    var rodX = Math.max(24, px - (this.timing === 'sensor' ? 102 : 138));
    ctx.fillStyle = D.grad(ctx, rodX - 36, 0, rodX + 36, 0, ['#CBD5E1', '#94A3B8']);
    D.rr(ctx, rodX - 36, tableY - 12, 72, 12, 3); ctx.fill();
    ctx.strokeStyle = '#64748B'; ctx.stroke();
    ctx.fillStyle = D.grad(ctx, rodX - 5, 0, rodX + 5, 0, ['#DCE4EC', '#8E99A6']);
    ctx.fillRect(rodX - 5, py - 24, 10, tableY - 12 - (py - 24));
    ctx.strokeRect(rodX - 5, py - 24, 10, tableY - 12 - (py - 24));
    // 横梁
    ctx.fillStyle = D.grad(ctx, 0, py - 8, 0, py, ['#E2E8F0', '#94A3B8']);
    ctx.fillRect(rodX - 10, py - 8, px - rodX + 26, 8);
    ctx.strokeRect(rodX - 10, py - 8, px - rodX + 26, 8);
    // 十字夹
    ctx.fillStyle = '#3B4B60'; D.rr(ctx, rodX - 9, py - 12, 18, 16, 3); ctx.fill();

    // 悬点（铁夹 / 绕杆松动 / 拉力传感器）
    if (this.timing === 'sensor') {
      ctx.fillStyle = '#1E3A8A'; D.rr(ctx, px - 18, py - 14, 36, 18, 4); ctx.fill();
      ctx.fillStyle = '#12A9C4'; ctx.beginPath(); ctx.arc(px + 10, py - 5, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(px + 12, py - 14); ctx.quadraticCurveTo(px + 30, py - 30, px + 56, py - 24); ctx.stroke();
      ctx.lineWidth = 1;
      D.text(ctx, '拉力传感器', px + 22, py - 22, { size: 11, weight: 700, color: '#1661FF' });
    } else if (b.pivot === 'clamp') {
      ctx.fillStyle = '#3B4B60'; D.rr(ctx, px - 9, py - 10, 18, 13, 3); ctx.fill();
      D.text(ctx, '铁夹夹紧', px + 14, py - 12, { size: 11, weight: 600, color: '#17784F' });
    } else {
      ctx.fillStyle = '#E69B2D'; ctx.beginPath(); ctx.arc(px, py - 4, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py - 4, 9, 0.2, Math.PI * 1.6); ctx.stroke(); ctx.lineWidth = 1;
      D.text(ctx, '绕杆松动（易滑动）', px + 14, py - 12, { size: 11, weight: 700, color: '#C7374B' });
    }

    // 最低点竖直参考线 + 红色准线
    var r = this.curD() / 2;
    var eqY = py + (b.l + r) * ppm;
    ctx.save(); ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(16,35,63,0.28)';
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, Math.min(tableY - 8, eqY + 26)); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, eqY + 14); ctx.lineTo(px, eqY + 30); ctx.stroke();
    D.text(ctx, '最低点准线', px, eqY + 42, { align: 'center', size: 11, weight: 700, color: '#C7374B' });

    // 量角器弧线
    var arcR = Math.min(92, g.availH * 0.34);
    ctx.fillStyle = 'rgba(37,168,112,0.14)';
    ctx.beginPath(); ctx.moveTo(px, py);
    ctx.arc(px, py, arcR, Math.PI / 2 - 5 * Math.PI / 180, Math.PI / 2 + 5 * Math.PI / 180);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(px, py, arcR, Math.PI / 2 - 0.72, Math.PI / 2 + 0.72); ctx.stroke();
    [-35, -5, 0, 5, 35].forEach(function (dg) {
      var a = Math.PI / 2 + dg * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(a) * (arcR - 5), py + Math.sin(a) * (arcR - 5));
      ctx.lineTo(px + Math.cos(a) * (arcR + 4), py + Math.sin(a) * (arcR + 4));
      ctx.strokeStyle = Math.abs(dg) === 5 ? '#17784F' : '#64748B';
      ctx.stroke();
    });
    D.text(ctx, '<5° 简谐区', px + 12, py + arcR + 13, { size: 10.5, weight: 600, color: '#17784F' });

    // 左侧标尺示意摆长
    var sx = rodX + 18;
    ctx.strokeStyle = '#9AA8B8'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx, py); ctx.lineTo(sx, py + 1.20 * ppm); ctx.stroke();
    [0.50, 0.80, 1.00, 1.20].forEach(function (mVal) {
      var yy = py + mVal * ppm;
      if (yy < tableY - 4) {
        ctx.beginPath(); ctx.moveTo(sx - 4, yy); ctx.lineTo(sx + 6, yy); ctx.stroke();
        D.text(ctx, mVal.toFixed(2) + 'm', sx + 9, yy + 4, { size: 10, color: '#4A5B73' });
      }
    });
  };

  Bench.prototype.drawFg = function (ctx, w, hh) {
    var g = this.geo(), b = this.b, px = g.px, py = g.py, ppm = g.ppm;
    this.hot = [];
    var r = this.curD() / 2;
    var extraL = (b.pivot === 'loose' && b.running) ? 0.042 : 0;
    var LDraw = b.l + r + extraL;
    var th = b.running && b.sim ? b.sim.theta : (b.thetaDeg * Math.PI / 180);
    var bx = px + Math.sin(th) * LDraw * ppm;
    var by = py + Math.cos(th) * LDraw * ppm;
    var br = b.bob === 'foam' ? Math.max(13, r * ppm * 1.1) : Math.max(9.5, r * ppm * 1.15);

    // 摆线
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke();
    ctx.lineWidth = 1;

    // 摆球
    if (b.bob === 'foam') {
      ctx.fillStyle = D.grad(ctx, bx - br, by - br, bx + br, by + br, ['#FFFFFF', '#E6DEC8']);
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#B8A882'; ctx.lineWidth = 1.4; ctx.stroke();
    } else {
      ctx.fillStyle = D.grad(ctx, bx - br, by - br, bx + br, by + br, ['#DCE4EC', '#6E7B8A']);
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3B4B60'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath(); ctx.arc(bx - br * 0.32, by - br * 0.32, br * 0.25, 0, Math.PI * 2); ctx.fill();
    }

    // 最低点瞬时脉冲指示
    if (b.running && Math.abs(th) < 0.015) {
      ctx.strokeStyle = '#12A9C4'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(bx, by, br + 6, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
    }

    // 未摆动时可拖拽调节摆角
    var degNow = Math.abs(th * 180 / Math.PI);
    if (!b.running) {
      ctx.strokeStyle = degNow > 5 ? '#E69B2D' : '#12A9C4';
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(bx, by, br + 7, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      if (this.timing === 'sensor') {
        var tx = Math.min(w * 0.44 - 6, Math.max(64, bx));
        D.text(ctx, 'θ₀=' + degNow.toFixed(1) + '°(拖球调角)', tx, by - br - 10, {
          align: 'center', size: 11, weight: 700, color: degNow > 5 ? '#C7374B' : '#0E8CA3', maxW: 130
        });
      } else {
        D.text(ctx, 'θ₀ = ' + degNow.toFixed(1) + '°（拖摆球调角）', bx + br + 10, by - 4, {
          size: 11.5, weight: 700, color: degNow > 5 ? '#C7374B' : '#0E8CA3'
        });
      }
      this.hot.push({ id: 'bob', x: bx - br - 16, y: by - br - 16, w: (br + 16) * 2, h: (br + 16) * 2 });
    }

    // 信息面板（停表读数 / 力传感器实时波形）
    if (this.timing === 'stopwatch') {
      var cw = Math.min(220, w * 0.38), cx0 = w - cw - 12, cy0 = 12;
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = '#CBD5E1';
      D.rr(ctx, cx0, cy0, cw, 92, 12); ctx.fill(); ctx.stroke();
      var elapsed = b.swActive ? Math.max(0, b.t - b.swStart) : (b.lastMeas ? b.lastMeas.t : 0);
      var swTitle = b.timingPos === 'high' ? '机械停表 · 最高点计时(错E1)' : (b.countOffset ? '机械停表 · 按下数 1 (错E2)' : '机械停表 · 最低点从 0 数起');
      D.text(ctx, swTitle, cx0 + 10, cy0 + 18, { size: 11, weight: 700, color: (b.timingPos === 'high' || b.countOffset) ? '#C7374B' : '#1661FF', maxW: cw - 20 });
      D.text(ctx, elapsed.toFixed(1) + ' s', cx0 + 10, cy0 + 48, { size: 24, weight: 700, color: b.swActive ? '#C7374B' : '#10233F' });
      var shownN = b.swActive ? Math.max(0, b.swCount - (b.countOffset || 0)) : (b.lastMeas ? b.lastMeas.n : 0);
      D.text(ctx, '全振动计数 n = ' + shownN + ' 次', cx0 + 10, cy0 + 70, { size: 12, weight: 600, color: '#17784F' });
      D.text(ctx, '记录摆长 L = ' + (this.curLRec() * 100).toFixed(2) + ' cm', cx0 + 10, cy0 + 86, { size: 11, color: '#4A5B73' });
    } else {
      this.drawSensorScope(ctx, w, hh);
    }
  };

  Bench.prototype.drawSensorScope = function (ctx, w, hh) {
    var b = this.b;
    var sx = Math.round(w * 0.46), sy = 12, sw = w - sx - 12, sh = Math.max(140, hh - 74);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#B9C8DA';
    D.rr(ctx, sx, sy, sw, sh, 12); ctx.fill(); ctx.stroke();
    D.text(ctx, '拉力传感器 F − t 实时曲线（相邻波峰间隔 = T/2）', sx + 12, sy + 20, { size: 11.5, weight: 700, color: '#1661FF', maxW: sw - 24 });

    var px0 = sx + 46, px1 = sx + sw - 12, py0 = sy + 34, py1 = sy + sh - 32;
    var p = b.params || PM.effectiveParams(this.simOpts());
    var mg = p.m * p.gEff;
    var th0 = Math.max(2, Math.abs(b.thetaDeg || 4)) * Math.PI / 180;
    var dF = Math.max(3 * mg * (1 - Math.cos(th0)), 1e-5);
    var tr = b.trace || [];
    if (tr.length >= 2) {
      var obMin = Infinity, obMax = -Infinity;
      for (var k = 0; k < tr.length; k++) {
        if (tr[k].F < obMin) obMin = tr[k].F;
        if (tr[k].F > obMax) obMax = tr[k].F;
      }
      if (obMax - obMin > dF) dF = obMax - obMin;
    }
    var totalSpan = dF / 0.60;
    var fMid = mg + 0.5 * mg * (1 - Math.cos(th0));
    var fMin = fMid - totalSpan * 0.50, fMax = fMid + totalSpan * 0.50;

    ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1;
    ctx.strokeRect(px0, py0, px1 - px0, py1 - py0);
    var mgY = py1 - ((mg - fMin) / (fMax - fMin)) * (py1 - py0);
    ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#94A3B8';
    ctx.beginPath(); ctx.moveTo(px0, mgY); ctx.lineTo(px1, mgY); ctx.stroke();
    ctx.restore();
    D.text(ctx, 'mg', px0 - 6, mgY + 4, { align: 'right', size: 10.5, color: '#64748B' });
    D.text(ctx, fMax.toFixed(3), px0 - 6, py0 + 8, { align: 'right', size: 9.5, color: '#94A3B8' });
    D.text(ctx, fMin.toFixed(3), px0 - 6, py1, { align: 'right', size: 9.5, color: '#94A3B8' });
    var tEnd = tr.length ? tr[tr.length - 1].t : 5.0;
    var win = 5.0, tStart = Math.max(0, tEnd - win);
    function toX(t) { return px0 + ((t - tStart) / win) * (px1 - px0); }
    function toY(F) { return py1 - P.clamp((F - fMin) / (fMax - fMin), 0, 1) * (py1 - py0); }

    if (tr.length >= 2) {
      ctx.save();
      ctx.beginPath(); ctx.rect(px0, py0, px1 - px0, py1 - py0); ctx.clip();
      ctx.strokeStyle = '#1661FF'; ctx.lineWidth = 2;
      ctx.beginPath();
      var started = false;
      for (var i = 0; i < tr.length; i++) {
        if (tr[i].t < tStart - 0.05) continue;
        var xx = toX(tr[i].t), yy = toY(tr[i].F);
        if (!started) { ctx.moveTo(xx, yy); started = true; } else ctx.lineTo(xx, yy);
      }
      ctx.stroke();

      var visPeaks = b.peaks.filter(function (pk) { return pk.t >= tStart && pk.t <= tStart + win; });
      visPeaks.forEach(function (pk) {
        var xk = toX(pk.t), yk = toY(pk.F);
        ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.arc(xk, yk, 3.6, 0, Math.PI * 2); ctx.fill();
      });
      if (visPeaks.length >= 2) {
        var pA = visPeaks[visPeaks.length - 2], pB = visPeaks[visPeaks.length - 1];
        var xA = toX(pA.t), xB = toX(pB.t), yBar = py0 + 18;
        ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(xA, toY(pA.F) - 4); ctx.lineTo(xA, yBar); ctx.lineTo(xB, yBar); ctx.lineTo(xB, toY(pB.F) - 4); ctx.stroke();
        D.text(ctx, 'Δt = ' + (pB.t - pA.t).toFixed(3) + ' s = T/2', (xA + xB) / 2, yBar - 4, { align: 'center', size: 11, weight: 700, color: '#C7374B' });
      }
      ctx.restore();
    } else {
      D.text(ctx, '点击“由静止释放摆球”观察 F − t 波形', (px0 + px1) / 2, (py0 + py1) / 2, { align: 'center', size: 12.5, color: '#64748B' });
    }
    D.text(ctx, 't / s', px1, py1 + 18, { align: 'right', size: 11, color: '#4A5B73' });
  };

  /* ---------- 指针拖拉改摆角 ---------- */
  Bench.prototype.bindPointer = function () {
    var self = this, dragBob = false;
    ML.stage.pointer(this.stage.layer('fg').canvas, {
      down: function (p) {
        if (self.b.running) return false;
        var hit = false;
        (self.hot || []).forEach(function (r) {
          if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) hit = true;
        });
        if (!hit) return false;
        dragBob = true;
      },
      move: function (p, a) {
        if (!dragBob || !a.moved) return;
        var g = self.geo(), dx = p.x - g.px, dy = Math.max(16, p.y - g.py);
        var deg = Math.atan2(dx, dy) * 180 / Math.PI;
        deg = P.clamp(deg, -38, 38);
        var absDeg = Math.abs(deg);
        if (Math.abs(absDeg - 4) < 1.2) absDeg = 4;
        else if (Math.abs(absDeg - 35) < 1.5) absDeg = 35;
        self.b.thetaDeg = Math.round((deg < 0 ? -absDeg : absDeg) * 10) / 10;
        self.stage.invalidate('fg');
      },
      up: function (p, a) {
        if (!dragBob) return;
        dragBob = false;
        if (!a.moved) { self.startSwing(); return; }
        var absDeg = Math.abs(self.b.thetaDeg);
        if (absDeg > 5 && self.guided()) {
          self.b.thetaDeg = 4;
          self.block('单摆做简谐运动时摆角应小于 5°（引导模式下已帮你回到 4°）。', 'E5');
        } else {
          if (absDeg < 3) self.b.thetaDeg = self.b.thetaDeg < 0 ? -3 : 3;
          self.updateDone(); self.saveBench();
        }
        self.stage.invalidate('fg'); self.renderSide();
      }
    });
  };

  /* ---------- 物理运行与计时 ---------- */
  Bench.prototype.simOpts = function () {
    var b = this.b;
    return {
      l: b.l, d: this.curD(), bob: b.bob, pivot: b.pivot,
      thetaDeg: b.thetaDeg, ideal: S.ideal, LMode: b.LMode,
      countOffset: b.countOffset || 0, timingPos: b.timingPos || 'low'
    };
  };

  Bench.prototype.startSwing = function () {
    var self = this, b = this.b;
    if (this.guided()) {
      if (b.pivot !== 'clamp') { this.block('请先用铁夹夹紧悬点（不能绕杆松动）。', 'E4'); return; }
      if (b.bob !== 'steel') { this.block('请先选用质量大、体积小的实心钢球。', 'E6'); return; }
      if (!b.calDone) {
        ML.toast('先点击“游标卡尺测球径”测量钢球直径 d', 'warn');
        openCaliperModal(function (d) { b.dMm = d; b.calDone = true; self.updateDone(); self.saveBench(); self.renderSide(); }, 19.0);
        return;
      }
      if (b.LMode !== 'l+r') { this.block('摆长应记为 L = l + d/2（悬点到球心）。', 'E3'); return; }
      if (Math.abs(b.thetaDeg) > 5) {
        this.block('摆角应小于 5° 再释放。', 'E5');
        return;
      }
    }
    var opts = this.simOpts();
    b.params = PM.effectiveParams(opts);
    b.sim = PM.createState(opts);
    b.running = true;
    b.t = 0;
    b.swActive = false; b.swCount = 0; b.lastCrossT = 0; b.autoTarget = 0; b.swBadStart = false;
    b.trace = [{ t: 0, theta: b.sim.theta, omega: 0, F: PM.tension(b.sim.theta, 0, b.params) }];
    b.peaks = [];
    this.setBanner(null);
    this.loop.start();
    this.renderStageActs();
    this.renderSide();
  };

  Bench.prototype.stopSwing = function () {
    this.b.running = false;
    this.b.swActive = false;
    this.b.autoTarget = 0;
    this.loop.stop();
    this.stage.invalidate();
    this.renderStageActs();
    this.renderSide();
  };

  Bench.prototype.startManualSw = function () {
    var b = this.b;
    if (!b.running || b.swActive) return;
    var amp = Math.max(0.005, Math.abs(b.sim.theta0 || (b.thetaDeg * Math.PI / 180)));
    var offCenter = b.timingPos === 'high' || Math.abs(b.sim.theta) > Math.min(0.045, amp * 0.35);
    if (this.guided() && offCenter) { ML.toast('请在摆球经过最低点时开始计时。', 'warn'); return; }
    b.swActive = true;
    b.swStart = b.t;
    b.lastCrossT = b.t;
    b.swDir = b.sim.omega >= 0 ? 1 : -1;
    b.swCount = 0;
    b.autoTarget = 0;
    b.swBadStart = offCenter;
    if (b.swBadStart) {
      ML.toast('注意：你按表时摆球不在最低点（或设了最高点计时），会引入较大的计时误差！', 'warn');
    } else {
      ML.toast('已从最低点开始计时，请数全振动次数！', 'info');
    }
    this.renderStageActs();
  };

  Bench.prototype.stopManualSw = function () {
    var b = this.b;
    if (!b.swActive) return;
    if (b.swCount < 1) { ML.toast('至少完成 1 次全振动（同向再次过计时点）后再停表', 'warn'); return; }
    var nearLastCrossing = b.t - b.lastCrossT <= b.params.T0 * 0.06 &&
      (b.sim.omega >= 0 ? 1 : -1) === b.swDir;
    if (this.guided() && !nearLastCrossing) {
      ML.toast('请等摆球下一次沿计时起始方向经过最低点，再按停表。', 'warn'); return;
    }
    if (!nearLastCrossing && b.timingPos === 'low') b.swBadStart = true;
    var shownN = Math.max(1, b.swCount - (b.countOffset || 0));
    var dt = +(b.t - b.swStart).toFixed(1);
    if (!S.ideal && b.swBadStart) {
      var rErr = P.rng((seedCounter += 11)).gauss(0.16);
      dt = Math.max(0.5, +(dt + rErr).toFixed(1));
    }
    b.swActive = false;
    this.finishMeasurement(dt, shownN, 'stopwatch');
  };

  Bench.prototype.autoMeasure30 = function () {
    var b = this.b;
    if (!b.running) {
      this.startSwing();
      if (!b.running) return;
    }
    b.autoTarget = 30;
    b.swActive = false;
    b.swCount = 0;
    ML.toast('自动在最低点从 0 开始计时并完成 30 次全振动…', 'info');
    this.renderStageActs();
  };

  Bench.prototype.readSensorPeriod = function () {
    var b = this.b;
    if (b.peaks.length < 3) { ML.toast('等波形出现至少 3 个波峰再读取', 'warn'); return; }
    var n = b.peaks.length - 1;
    var halfAvg = (b.peaks[n].t - b.peaks[0].t) / n;
    var T = 2 * halfAvg;
    this.finishMeasurement(+(T * 10).toFixed(2), 10, 'sensor', T);
  };

  Bench.prototype.finishMeasurement = function (totalTime, nMeas, src, exactT) {
    var b = this.b;
    var T = exactT != null ? exactT : totalTime / nMeas;
    var L = this.curLRec();
    var g = PM.calcG(L, T);
    b.lastMeas = {
      l: b.l, d: this.curD(), L: L, LMode: b.LMode, bob: b.bob, pivot: b.pivot,
      thetaDeg: Math.abs(b.thetaDeg), t: totalTime, n: nMeas, T: T, g: g, src: src,
      tags: this.detectTags()
    };
    this.done.P5 = true;
    this.done.P6 = true;
    this.stopSwing();
    this.updateDone();
    this.renderSide();
    this.renderAnalysis(false);
    ML.toast('测得周期 T = ' + T.toFixed(3) + ' s，单组 g = ' + g.toFixed(2) + ' m/s²', 'ok');
  };

  Bench.prototype.detectTags = function () {
    var b = this.b, tags = [];
    if (b.swBadStart || b.timingPos === 'high') tags.push('E1');
    if (b.countOffset) tags.push('E2');
    if (b.LMode !== 'l+r') tags.push('E3');
    if (b.pivot === 'loose') tags.push('E4');
    if (Math.abs(b.thetaDeg) > 5.01) tags.push('E5');
    if (b.bob === 'foam') tags.push('E6');
    return tags;
  };

  Bench.prototype.tick = function (dt) {
    if (!this.el || !this.el.isConnected) return false;
    var b = this.b;
    if (!b.running || !b.sim) return false;
    var mult = b.autoTarget ? 10 : this.speed;
    var simDt = dt * mult;
    var steps = Math.max(1, Math.round(simDt / PM.DT));
    var hStep = simDt / steps;
    var lastSampleT = b.trace.length ? b.trace[b.trace.length - 1].t : 0;
    var minGap = (b.params ? b.params.T0 : 1.5) * 0.55;

    for (var i = 0; i < steps; i++) {
      var ev = PM.rk4Step(b.sim, b.params, hStep);
      b.t = b.sim.t;
      var useHigh = b.timingPos === 'high';
      var hitEv = useHigh
        ? (ev.highTurn && ev.highTurn.theta > 0 ? { t: ev.highTurn.t, dir: -1 } : null)
        : ev.lowCross;

      if (b.autoTarget && !b.swActive && hitEv && hitEv.dir === -1) {
        b.swActive = true;
        b.swStart = hitEv.t;
        b.lastCrossT = hitEv.t;
        b.swDir = -1;
        b.swCount = 0;
        b.swBadStart = useHigh;
        this.renderStageActs();
      } else if (b.swActive && hitEv && (useHigh || hitEv.dir === b.swDir)) {
        if (hitEv.t - b.swStart >= minGap && hitEv.t - (b.lastCrossT || b.swStart) >= minGap) {
          b.swCount++;
          b.lastCrossT = hitEv.t;
          var realTarget = b.autoTarget + (b.countOffset || 0);
          if (b.autoTarget && b.swCount >= realTarget) {
            var rawT = hitEv.t - b.swStart;
            var trial = PM.measureTrial(Object.assign({}, this.simOpts(), { nMeasured: 30, seed: (seedCounter += 7), roundStopwatch: true }));
            var useT = S.ideal ? Math.round(rawT * 10) / 10 : trial.totalTime;
            this.finishMeasurement(useT, 30, 'stopwatch');
            return false;
          }
        }
      }

      if (this.timing === 'sensor' && b.t - lastSampleT >= 1 / 90) {
        lastSampleT = b.t;
        var F = PM.tension(b.sim.theta, b.sim.omega, b.params);
        b.trace.push({ t: b.t, theta: b.sim.theta, omega: b.sim.omega, F: F });
        if (b.trace.length > 520) b.trace.shift();
        var len = b.trace.length;
        if (len >= 3 && b.trace[len - 2].F > b.trace[len - 3].F && b.trace[len - 2].F >= b.trace[len - 1].F) {
          b.peaks.push({ t: b.trace[len - 2].t, F: b.trace[len - 2].F });
          if (b.peaks.length > 16) b.peaks.shift();
        }
      }
    }
    this.stage.invalidate('fg');
    return true;
  };

  Bench.prototype.renderStageActs = function () {
    var self = this, b = this.b, box = this.stageActs;
    if (!box) return;
    ML.clear(box);
    if (!b.running) {
      box.appendChild(h('button.btn.primary.big', { type: 'button', onclick: function () { self.startSwing(); } }, '由静止释放摆球'));
      if (this.timing === 'stopwatch' && !this.guided()) {
        box.appendChild(h('button.btn.cyan', { type: 'button', onclick: function () { self.autoMeasure30(); } }, '自由演示：自动测 30 次'));
      }
      return;
    }
    if (this.timing === 'stopwatch') {
      if (b.autoTarget > 0) {
        box.appendChild(h('button.btn.cyan', { type: 'button', disabled: true }, '自动累积测 30 次中…'));
      } else if (!b.swActive) {
        var startLbl = b.timingPos === 'high'
          ? '过最高点：开始计时（错点 E1）'
          : '过最低点：开始计时（从 ' + (b.countOffset ? '1' : '0') + ' 数起）';
        box.appendChild(h('button.btn.primary.big', { type: 'button', onclick: function () { self.startManualSw(); } }, startLbl));
        if (!this.guided()) box.appendChild(h('button.btn.cyan', { type: 'button', onclick: function () { self.autoMeasure30(); } }, '自由演示：自动测完 30 次'));
      } else {
        var stopLbl = b.timingPos === 'high' ? '过最高点：停止计时' : '过最低点：停止计时';
        box.appendChild(h('button.btn.big.pulse', { type: 'button', onclick: function () { self.stopManualSw(); } }, stopLbl));
      }
      box.appendChild(h('button.btn', { type: 'button', onclick: function () { self.stopSwing(); } }, '停止'));
    } else {
      box.appendChild(h('button.btn.primary.big', { type: 'button', onclick: function () { self.readSensorPeriod(); } }, '读取 F−t 相邻峰距求周期'));
      box.appendChild(h('button.btn', { type: 'button', onclick: function () { self.stopSwing(); } }, '停止'));
    }
  };

  /* ---------- 右侧操作面板 ---------- */
  Bench.prototype.renderSide = function () {
    var self = this, b = this.b, side = this.side; if (!side) return;
    ML.clear(side);
    var row = function () { return h('div.side-row', Array.prototype.slice.call(arguments)); };
    function chip(label, on, act, dis) { return h('button.chip' + (on ? '.on' : ''), { type: 'button', onclick: act, disabled: !!dis }, label); }

    var ctl = h('div.side-ctl');
    ctl.appendChild(h('div.side-k', h('span', '器材与参数'), h('button.link.sm', { type: 'button', onclick: function () {
      openCaliperModal(function (d) { b.dMm = d; b.calDone = true; self.updateDone(); self.saveBench(); self.renderSide(); }, b.bob === 'foam' ? 38.0 : 19.0);
    } }, (b.calDone ? '✓ 球径 ' + b.dMm.toFixed(1) + ' mm' : '游标卡尺测球径 →'))));

    ctl.appendChild(row(h('span.side-l', '悬点'),
      chip('铁夹夹紧', b.pivot === 'clamp', function () { self.setPivot('clamp'); }, b.running),
      chip('绕杆松动', b.pivot === 'loose', function () { self.setPivot('loose'); }, b.running)));
    ctl.appendChild(row(h('span.side-l', '摆球'),
      chip('钢球(19mm)', b.bob === 'steel', function () { self.setBob('steel'); }, b.running),
      chip('泡沫球(38mm)', b.bob === 'foam', function () { self.setBob('foam'); }, b.running)));
    ctl.appendChild(row(h('span.side-l', '摆线 l'),
      chip('−', false, function () { self.setLength(b.l - 0.05); }, b.running),
      h('b.side-v', b.l.toFixed(2) + ' m'),
      chip('+', false, function () { self.setLength(b.l + 0.05); }, b.running),
      chip('0.50', Math.abs(b.l - 0.50) < 0.01, function () { self.setLength(0.50); }, b.running),
      chip('0.80', Math.abs(b.l - 0.80) < 0.01, function () { self.setLength(0.80); }, b.running),
      chip('1.10', Math.abs(b.l - 1.10) < 0.01, function () { self.setLength(1.10); }, b.running)));
    ctl.appendChild(row(h('span.side-l', '摆角 θ₀'),
      chip('4°', Math.abs(Math.abs(b.thetaDeg) - 4) < 0.5, function () { self.setAngle(4); }, b.running),
      chip('35°', Math.abs(Math.abs(b.thetaDeg) - 35) < 0.5, function () { self.setAngle(35); }, b.running),
      h('span.muted', '（或舞台拖摆球）')));
    ctl.appendChild(row(h('span.side-l', '摆长记法'),
      chip('l + d/2', b.LMode === 'l+r', function () { self.setLMode('l+r'); }),
      chip('只记 l', b.LMode === 'l', function () { self.setLMode('l'); }),
      chip('l + d', b.LMode === 'l+d', function () { self.setLMode('l+d'); })));
    if (!this.guided() && this.timing === 'stopwatch') {
      ctl.appendChild(row(h('span.side-l', '计时规则'),
        chip('最低点', b.timingPos !== 'high', function () { b.timingPos = 'low'; b.swBadStart = false; self.updateDone(); self.saveBench(); self.stage.invalidate('fg'); self.renderStageActs(); self.renderSide(); }, b.running),
        chip('最高点(E1)', b.timingPos === 'high', function () { b.timingPos = 'high'; self.updateDone(); self.saveBench(); self.stage.invalidate('fg'); self.renderStageActs(); self.renderSide(); }, b.running),
        chip('数 0 起', !b.countOffset, function () { b.countOffset = 0; self.updateDone(); self.saveBench(); self.stage.invalidate('fg'); self.renderStageActs(); self.renderSide(); }, b.running),
        chip('数 1 起(E2)', b.countOffset === -1, function () { b.countOffset = -1; self.updateDone(); self.saveBench(); self.stage.invalidate('fg'); self.renderStageActs(); self.renderSide(); }, b.running)));
    }

    ctl.appendChild(h('div.side-acts',
      h('button.btn.primary', { type: 'button', onclick: function () { self.recordCurrentRow(); }, disabled: !b.lastMeas }, '记入多组表 (' + this.rows.length + ')'),
      !this.guided() ? h('button.btn', { type: 'button', onclick: function () { self.collect5Groups(); } }, '自由演示：快速采齐 5 组') : null,
      h('button.btn.sm.full', { type: 'button', onclick: function () { self.resetAll(); } }, '清空数据表并复位')));
    side.appendChild(ctl);

    if (this.guided()) {
      side.appendChild(h('div.side-k', '实验步骤'));
      var ids = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'], curId = null;
      for (var i = 0; i < ids.length; i++) { if (!this.done[ids[i]]) { curId = ids[i]; break; } }
      var curEl = null;
      var ol = h('ol.steps', ids.map(function (id) {
        var p = PROC[id], ok = !!self.done[id], isCur = id === curId;
        var li = h('li' + (ok ? '.ok' : '') + (isCur ? '.cur' : ''),
          h('div.st-t', (ok ? '✓ ' : isCur ? '▸ ' : '') + p.title),
          h('div.st-how', { html: M.tex(p.how) }),
          p.why ? h('div.st-why', { html: M.tex('理由：' + p.why) }) : null,
          p.errorId ? h('button.link.sm', { type: 'button', onclick: function () { openTry(p.errorId); } }, '为什么？试一试 →') : null);
        if (isCur) curEl = li;
        return li;
      }));
      side.appendChild(ol);
      if (curEl) setTimeout(function () { if (ol.scrollHeight > ol.clientHeight + 4) ol.scrollTop = Math.max(0, curEl.offsetTop - ol.offsetTop - 4); }, 0);
    } else {
      var freeTags = this.detectTags();
      var tBox = h('div.ana-tags', { style: 'margin-top:4px' });
      if (freeTags.length) {
        freeTags.forEach(function (eid) {
          if (ERR[eid]) tBox.appendChild(h('button.tag.err', { type: 'button', onclick: function () { openTry(eid); } }, '⚠ ' + ERR[eid].name));
        });
      } else {
        tBox.appendChild(h('span.tag.ok', '✓ 当前参数与计时规范'));
      }
      side.appendChild(tBox);
      side.appendChild(h('div.side-tip', '自由模式：可任意改变摆角（35°）、悬点（绕杆松动）、泡沫球、摆长记法或计时规则，实验台与数据表会真实反映全部误差。'));
    }
  };

  Bench.prototype.recordCurrentRow = function () {
    var m = this.b.lastMeas;
    if (!m) { ML.toast('请先完成一次测量', 'warn'); return; }
    var entry = {
      l: m.l, d: m.d, LMode: m.LMode, L: m.L, T: m.T, t: m.t, n: m.n, g: m.g, tags: m.tags.slice()
    };
    var existIdx = -1;
    for (var i = 0; i < this.rows.length; i++) {
      if (Math.abs(this.rows[i].l - m.l) < 0.005) { existIdx = i; break; }
    }
    if (existIdx >= 0) {
      this.rows[existIdx] = entry;
      ML.toast('已更新线长 l = ' + m.l.toFixed(2) + ' m 的测量记录（请改变摆线长测下一组）', 'info');
    } else {
      this.rows.push(entry);
      if (this.rows.length > 8) this.rows.shift();
    }
    this.updateDone(); this.saveBench(); this.renderSide(); this.renderAnalysis(false);
  };

  Bench.prototype.collect5Groups = function () {
    var self = this, b = this.b;
    if (this.guided()) {
      if (b.pivot !== 'clamp') { this.block('请先用铁夹夹紧悬点。', 'E4'); return; }
      if (b.bob !== 'steel') { this.block('请先选用实心钢球。', 'E6'); return; }
      if (!b.calDone) {
        ML.toast('请先用游标卡尺测摆球直径 d', 'warn');
        openCaliperModal(function (d) { b.dMm = d; b.calDone = true; self.updateDone(); self.saveBench(); self.renderSide(); }, 19.0);
        return;
      }
      if (b.LMode !== 'l+r') { this.block('摆长应记为 L = l + d/2。', 'E3'); return; }
      if (Math.abs(b.thetaDeg) > 5) { this.block('摆角应控制在 5° 以内。', 'E5'); return; }
    }
    var ls = [0.50, 0.65, 0.80, 0.95, 1.10];
    var rows = [], curD = this.curD(), curTags = this.detectTags();
    for (var i = 0; i < ls.length; i++) {
      if (this.timing === 'sensor') {
        var simP = PM.simulatePeriod(Object.assign({}, this.simOpts(), { l: ls[i], nCycles: 6 }));
        var Ts = S.ideal ? simP.T : simP.T * (1 + P.rng(70 + i * 13).gauss(0.0005));
        var Ls = PM.recordedLength(ls[i], curD, b.LMode);
        rows.push({
          l: ls[i], d: curD, LMode: b.LMode, L: Ls, T: Ts, t: +(10 * Ts).toFixed(2), n: 10, g: PM.calcG(Ls, Ts), tags: curTags.slice()
        });
      } else {
        var opts = Object.assign({}, this.simOpts(), { l: ls[i], nMeasured: 30, seed: 50 + i * 11, roundStopwatch: true });
        var tr = PM.measureTrial(opts);
        rows.push({
          l: ls[i], d: tr.d, LMode: b.LMode, L: tr.L, T: tr.T, t: tr.totalTime, n: 30, g: tr.g, tags: curTags.slice()
        });
      }
    }
    this.rows = rows;
    b.lastMeas = Object.assign({}, rows[2], { src: this.timing });
    this.done.P5 = true; this.done.P6 = true;
    this.updateDone(); this.saveBench(); this.renderSide(); this.renderAnalysis(false);
    ML.toast('已用 RK4 模型测完 5 组摆长，下方查看 L − T² 拟合图像', 'ok');
  };

  Bench.prototype.resetAll = function () {
    this.stopSwing();
    this.rows = [];
    this.b.lastMeas = null;
    this.b.pivot = 'clamp'; this.b.bob = 'steel'; this.b.dMm = 19.0; this.b.LMode = 'l+r';
    this.b.thetaDeg = 4; this.b.l = 0.80; this.b.countOffset = 0; this.b.timingPos = 'low'; this.b.swBadStart = false;
    this.touched = {};
    this.done = { P2: this.b.calDone };
    this.analysis.hidden = true;
    this.setBanner(null);
    this.saveBench(); this.stage.invalidate(); this.renderStageActs(); this.renderSide();
  };

  /* ---------- 下方数据分析区（停表盘面 + 多组表 + L-T² 图） ---------- */
  Bench.prototype.renderAnalysis = function (noScroll) {
    var self = this, el = this.analysis, b = this.b, m = b.lastMeas;
    if (!m && !this.rows.length) { el.hidden = true; return; }
    el.hidden = false;
    ML.clear(el);

    var allTags = [];
    if (m && m.tags) allTags = allTags.concat(m.tags);
    this.rows.forEach(function (r) { if (r.tags) allTags = allTags.concat(r.tags); });
    allTags = allTags.filter(function (x, i, a) { return a.indexOf(x) === i && ERR[x]; });

    var tagBox = h('div.ana-tags');
    if (allTags.length) {
      tagBox.appendChild(h('span.tag.err', '⚠ 检测到操作偏差'));
      allTags.forEach(function (id) {
        tagBox.appendChild(h('button.tag', { type: 'button', onclick: function () { openTry(id); } }, ERR[id].name + ' → 看看后果'));
      });
    } else {
      tagBox.appendChild(h('span.tag.ok', '✓ 操作规范'));
    }
    el.appendChild(h('div.ana-head', h('h2.ana-h', '测量读数与 L − T² 数据分析'), tagBox));

    var leftCard = h('div.ana-card');
    if (m) {
      var devPct = ((m.g - PM.G) / PM.G * 100);
      var kpiCls = Math.abs(devPct) < 1.2 ? 'ok' : Math.abs(devPct) < 3.5 ? 'warn' : 'bad';
      leftCard.appendChild(h('h3', '本次测量读数（' + (m.src === 'sensor' ? '拉力传感器' : '机械停表') + '）'));
      leftCard.appendChild(h('div.ana-kpi',
        h('div.kpi-item', '记录摆长 L', h('b', (m.L * 100).toFixed(2) + ' cm')),
        h('div.kpi-item', '全振动时间 t (' + m.n + '次)', h('b', m.t.toFixed(1) + ' s')),
        h('div.kpi-item', '单摆周期 T', h('b', m.T.toFixed(3) + ' s')),
        h('div.kpi-item.' + kpiCls, '单组重力加速度 g', h('b', m.g.toFixed(2) + ' m/s²（' + (devPct >= 0 ? '+' : '') + devPct.toFixed(1) + '%）'))));
      if (m.src !== 'sensor') {
        var swHost = h('div');
        leftCard.appendChild(swHost);
        new GV.GaugeBench(swHost, { height: 196, state: { type: 'stopwatch', totalSec: Math.min(179, m.t), locked: true } });
      }
    } else {
      leftCard.appendChild(h('h3', '测量记录'));
    }

    if (this.rows.length) {
      var trs = this.rows.map(function (r, idx) {
        var dv = ((r.g - PM.G) / PM.G * 100);
        return h('tr' + (Math.abs(dv) > 2.5 ? '.hl' : ''),
          h('td', String(idx + 1)),
          h('td', (r.l * 100).toFixed(1)),
          h('td', (r.L * 100).toFixed(2)),
          h('td', r.T.toFixed(3)),
          h('td', (r.T * r.T).toFixed(3)),
          h('td', r.g.toFixed(2)));
      });
      leftCard.appendChild(h('div.tbl-wrap', h('table.dt.ana-tbl',
        h('tr', h('th', '#'), h('th', '线长 l/cm'), h('th', '记录 L/cm'), h('th', 'T/s'), h('th', 'T²/s²'), h('th', '单组 g')),
        trs)));
    }

    var rightCard = h('div.ana-card');
    rightCard.appendChild(h('h3', 'L − T² 图像法求重力加速度（g = 4π²k）'));
    if (this.rows.length >= 2) {
      var viewMode = this._chartMode || b.LMode;
      var zoomO = !!this._zoomOrigin && viewMode === 'compare';
      var swRow = h('div.side-row',
        h('span.side-l', '作图口径'),
        ['l+r', 'l', 'l+d', 'compare'].map(function (vm) {
          var lbl = vm === 'l+r' ? 'l + r (球心)' : vm === 'l' ? '只用 l (漏半径)' : vm === 'l+d' ? 'l + d (球下沿)' : '三条同图对比';
          return h('button.chip' + (viewMode === vm ? '.on' : ''), { type: 'button', onclick: function () { self._chartMode = vm; self.renderAnalysis(true); } }, lbl);
        }),
        viewMode === 'compare' ? h('button.chip' + (zoomO ? '.on' : ''), { type: 'button', onclick: function () { self._zoomOrigin = !self._zoomOrigin; self.renderAnalysis(true); } }, zoomO ? '返回全局视图' : '放大原点看 ±r 截距') : null);
      rightCard.appendChild(swRow);
      var chartBox = h('div');
      rightCard.appendChild(chartBox);
      var chartOpts = { xLabel: 'T² / s²', yLabel: 'L / m', height: 260, paper: true };
      if (zoomO) { chartOpts.x = [0, 0.35]; chartOpts.y = [-0.025, 0.095]; }
      var ch = new ML.Chart(chartBox, chartOpts);

      function mapRows(modeStr) {
        return self.rows.map(function (r) {
          var Lm = PM.recordedLength(r.l, r.d, modeStr);
          return { L: Lm, T: r.T, pt: [r.T * r.T, Lm] };
        });
      }
      if (viewMode === 'compare') {
        var rC = mapRows('l+r'), rL = mapRows('l'), rD = mapRows('l+d');
        var fC = PM.fitLT2(rC), fL = PM.fitLT2(rL);
        ch.set([
          { pts: rD.map(function (x) { return x.pt; }), fit: true, color: '#E69B2D', dash: true, label: 'l+d：g = ' + PM.fitLT2(rD).gFit.toFixed(3) },
          { pts: rC.map(function (x) { return x.pt; }), fit: true, color: '#25A870', label: 'l+r：g = ' + fC.gFit.toFixed(3) },
          { pts: rL.map(function (x) { return x.pt; }), fit: true, color: '#1661FF', dash: true, mark: 'x', label: '只用 l：g = ' + fL.gFit.toFixed(3) }
        ]);
        rightCard.appendChild(h('div.cmp-note', { html: '三条拟合线<b>彼此平行</b>（斜率 k 几乎相等），纵截距分别为 +r、0、−r；用斜率求出的 g ≈ <b>' + fL.gFit.toFixed(3) + ' m/s²</b>（漏加球半径时图像法仍精确！）' }));
      } else {
        var curRows = mapRows(viewMode);
        var fitRes = PM.fitLT2(curRows);
        var fitDev = ((fitRes.gFit - PM.G) / PM.G * 100);
        ch.set([{ pts: curRows.map(function (x) { return x.pt; }), fit: true, color: '#1661FF', label: '拟合斜率 k = ' + fitRes.k.toFixed(4) + ' m/s²' }]);
        rightCard.appendChild(h('div.cmp-note', { html: '拟合直线方程：L = <b>' + fitRes.k.toFixed(4) + '</b> T² ' + (fitRes.b >= 0 ? '+ ' : '− ') + Math.abs(fitRes.b).toFixed(4) + '　｜　g = 4π²k = <b>' + fitRes.gFit.toFixed(3) + ' m/s²</b>（相对真实值 9.80 m/s² 偏差 ' + (fitDev >= 0 ? '+' : '') + fitDev.toFixed(2) + '%）' }));
      }
    } else {
      rightCard.appendChild(h('div.cmp-note', '再记录至少 1 组不同摆长的数据（或点击右侧“快速采齐 5 组”），即可作 L − T² 拟合直线并由斜率求 g。'));
    }

    el.appendChild(h('div.ana-grid', leftCard, rightCard));
    if (!noScroll) el.scrollIntoView({ behavior: ML.perf.low ? 'auto' : 'smooth', block: 'nearest' });
  };

  /* =====================================================================
   *  ③ 诊·误差（四拍试一试 + 反推）
   * ===================================================================== */
  var adapter = {
    compare: function (err, area, done) {
      if (err.id === 'E1') {
        var gLow = [], gHigh = [], tLow = [], tHigh = [];
        for (var i = 1; i <= 20; i++) {
          var a = PM.measureTrial({ l: 0.80, d: PM.STEEL_D, thetaDeg: 4, timingPos: 'low', nMeasured: 30, seed: 100 + i });
          var b = PM.measureTrial({ l: 0.80, d: PM.STEEL_D, thetaDeg: 4, timingPos: 'high', nMeasured: 30, seed: 100 + i });
          gLow.push([i, a.g]); gHigh.push([i, b.g]);
          tLow.push(a.T); tHigh.push(b.T);
        }
        var ch1 = new ML.Chart(area, { xLabel: '测量次数', yLabel: '测得 g / (m·s⁻²)', height: 220, x: [0, 21], y: [9.45, 10.2] });
        ch1.set([
          { pts: gLow, color: '#25A870', label: '最低点 σ(T)=' + P.std(tLow).toFixed(4) + ' s' },
          { pts: gHigh, color: '#C7374B', mark: 'x', label: '最高点 σ(T)=' + P.std(tHigh).toFixed(4) + ' s' },
          { pts: [], line: [[0, PM.G], [21, PM.G]], color: '#10233F', dash: true }
        ]);
        area.appendChild(h('div.cmp-note', { html: '20 次重复测得 g 的标准差：最低点计时 <b>' + P.std(gLow.map(function (p) { return p[1]; })).toFixed(3) + '</b> m/s² vs 最高点计时 <b style="color:#C7374B">' + P.std(gHigh.map(function (p) { return p[1]; })).toFixed(3) + '</b> m/s²。' }));
      } else if (err.id === 'E2') {
        var rOk = PM.measureTrial({ l: 0.80, d: PM.STEEL_D, thetaDeg: 4, nMeasured: 30, ideal: true });
        var rBad = PM.measureTrial({ l: 0.80, d: PM.STEEL_D, thetaDeg: 4, nMeasured: 30, countOffset: -1, ideal: true });
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '计数方法'), h('th', '实际经历周期'), h('th', '停表读数 t / s'), h('th', '计算 T = t/30'), h('th', '测得 g / (m·s⁻²)')),
          h('tr', h('td', '从 “0” 数起（规范）'), h('td', '30 次'), h('td', rOk.totalTime.toFixed(2)), h('td', rOk.T.toFixed(4)), h('td', rOk.g.toFixed(3))),
          h('tr.hl', h('td', '按下即数 “1”'), h('td', '29 次'), h('td', rBad.totalTime.toFixed(2)), h('td', rBad.T.toFixed(4)), h('td', rBad.g.toFixed(3)))));
        area.appendChild(h('div.cmp-note', { html: '比值验证：g<sub>测</sub> / g<sub>真</sub> = ' + (rBad.g / rOk.g).toFixed(4) + '，理论 (30/29)² = ' + Math.pow(30 / 29, 2).toFixed(4) + '（偏大 +7.0%）。' }));
      } else if (err.id === 'E3') {
        var ls = [0.50, 0.65, 0.80, 0.95, 1.10];
        var ptsR = [], ptsL = [], ptsD = [], rR = [], rL = [], rD = [];
        ls.forEach(function (l) {
          var T = PM.simulatePeriod({ l: l, d: PM.STEEL_D, thetaDeg: 4, ideal: true }).T;
          var lr = l + PM.STEEL_D / 2, ld = l + PM.STEEL_D;
          ptsR.push([T * T, lr]); ptsL.push([T * T, l]); ptsD.push([T * T, ld]);
          rR.push({ L: lr, T: T }); rL.push({ L: l, T: T }); rD.push({ L: ld, T: T });
        });
        var fR = PM.fitLT2(rR), fL = PM.fitLT2(rL), fD = PM.fitLT2(rD);
        var zoomE3 = false;
        var swE3 = h('div.side-row',
          h('span.side-l', '视图'),
          h('button.chip.on', { type: 'button', onclick: function () { zoomE3 = false; drawE3(); } }, '5 组全局拟合'),
          h('button.chip', { type: 'button', onclick: function () { zoomE3 = true; drawE3(); } }, '原点截距放大（看 ±r 平行移位）'));
        var boxE3 = h('div');
        area.appendChild(swE3); area.appendChild(boxE3);
        function drawE3() {
          ML.$$('.chip', swE3).forEach(function (c, idx) { c.classList.toggle('on', (idx === 1) === zoomE3); });
          ML.clear(boxE3);
          var opts3 = { xLabel: 'T² / s²', yLabel: 'L / m', height: 215, paper: true };
          if (zoomE3) { opts3.x = [0, 0.35]; opts3.y = [-0.025, 0.095]; }
          var ch3 = new ML.Chart(boxE3, opts3);
          ch3.set([
            { pts: ptsD, fit: true, color: '#E69B2D', dash: true, label: 'l+d：斜率 g=' + fD.gFit.toFixed(3) + '（截距 +r）' },
            { pts: ptsR, fit: true, color: '#25A870', label: 'l+r：斜率 g=' + fR.gFit.toFixed(3) + '（过原点）' },
            { pts: ptsL, fit: true, color: '#1661FF', dash: true, mark: 'x', label: '只用 l：斜率 g=' + fL.gFit.toFixed(3) + '（截距 −r）' }
          ]);
        }
        drawE3();
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '口径'), h('th', '单组 l=0.50 m 算 g'), h('th', '5 组 L−T² 斜率算 g'), h('th', '图像纵截距')),
          h('tr', h('td', 'l + d/2（球心）'), h('td', PM.calcG(rR[0].L, rR[0].T).toFixed(3)), h('td', fR.gFit.toFixed(3)), h('td', fR.b.toFixed(4) + ' m')),
          h('tr.hl', h('td', '只用 l（漏半径）'), h('td', PM.calcG(rL[0].L, rL[0].T).toFixed(3) + '（偏小）'), h('td', fL.gFit.toFixed(3) + '（准确）'), h('td', fL.b.toFixed(4) + ' m')),
          h('tr.hl', h('td', 'l + d（球下沿）'), h('td', PM.calcG(rD[0].L, rD[0].T).toFixed(3) + '（偏大）'), h('td', fD.gFit.toFixed(3) + '（准确）'), h('td', fD.b.toFixed(4) + ' m'))));
      } else if (err.id === 'E4' || err.id === 'E5' || err.id === 'E6') {
        var badCfg = err.id === 'E4' ? { pivot: 'loose', ideal: true } : err.id === 'E5' ? { thetaDeg: 35, ideal: true } : { bob: 'foam', ideal: false };
        var goodCfg = err.id === 'E5' ? { thetaDeg: 4, ideal: true } : { ideal: err.id === 'E4' };
        var dur = err.id === 'E6' ? 14.0 : 6.0;
        var trG = PM.simulateTrace(Object.assign({ l: 0.80 }, goodCfg), dur, 1 / 60);
        var trB = PM.simulateTrace(Object.assign({ l: 0.80 }, badCfg), dur, 1 / 60);
        var normG = err.id === 'E5' ? 4 : 1, normB = err.id === 'E5' ? 35 : 1;
        drawWaveChart(area, [
          { pts: trG.samples.map(function (s) { return [s.t, (s.theta * 180 / Math.PI) / normG]; }), color: '#25A870', label: err.id === 'E4' ? '铁夹夹紧' : err.id === 'E5' ? '摆角 4°' : '钢球' },
          { pts: trB.samples.map(function (s) { return [s.t, (s.theta * 180 / Math.PI) / normB]; }), color: '#C7374B', dash: true, label: err.id === 'E4' ? '绕杆松动' : err.id === 'E5' ? '摆角 35°' : '泡沫球' }
        ], { xLabel: 't / s', yLabel: err.id === 'E5' ? '归一化角度 θ/θ₀' : '摆角 θ / °', height: 220, x: [0, dur] });
        var pG = PM.simulatePeriod(Object.assign({ l: 0.80 }, goodCfg));
        var pB = PM.simulatePeriod(Object.assign({ l: 0.80 }, badCfg));
        var gB = PM.calcG(pB.LTrue, pB.T);
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '条件'), h('th', '周期 T / s'), h('th', '用名义摆长算得 g / (m·s⁻²)'), h('th', '相对偏差')),
          h('tr', h('td', '规范操作'), h('td', pG.T.toFixed(4)), h('td', PM.calcG(pG.LTrue, pG.T).toFixed(3)), h('td', '基准')),
          h('tr.hl', h('td', err.name), h('td', pB.T.toFixed(4)), h('td', gB.toFixed(3)), h('td', ((gB - PM.G) / PM.G * 100).toFixed(2) + '%'))));
      }
      setTimeout(done, ML.perf.reduced ? 0 : 240);
    },
    show: function (c, vis) {
      var sh = c.show;
      if (sh.type === 'g-high') {
        vis.appendChild(h('div.cmp-split',
          h('div.cmp-box.good', '当地真实值', h('b', '9.80 m/s²')),
          h('div.cmp-box.bad', '该组实验结果（偏大）', h('b', '10.48 m/s²（+6.9%）'))));
      } else if (sh.type === 'lt2-shift' || sh.type === 'lt2-shift-up') {
        var ch = new ML.Chart(vis, { xLabel: 'T² / s²', yLabel: 'L / m', height: 210, paper: true, x: [0, 4.5], y: [-0.08, 1.15] });
        var ls = [0.50, 0.65, 0.80, 0.95, 1.10];
        var pts = ls.map(function (l) {
          var T = PM.simulatePeriod({ l: l, d: PM.STEEL_D, thetaDeg: 4, ideal: true }).T;
          return [T * T, sh.type === 'lt2-shift' ? l : l + PM.STEEL_D / 2 - 0.025];
        });
        ch.set([{ pts: pts, fit: true, color: '#1661FF', label: sh.type === 'lt2-shift' ? '以 l 作图（截距 < 0）' : '偏心摆球 L−T² 图' }]);
      } else if (sh.type === 'ft-curve') {
        var tr = PM.simulateTrace({ l: 0.80, d: PM.STEEL_D, thetaDeg: 5, ideal: true }, 3.2, 1 / 90);
        var notesF = tr.peaks.length >= 2 ? [
          { x: tr.peaks[0].t, y: tr.peaks[0].F, text: 't₁ = ' + tr.peaks[0].t.toFixed(2) + 's', color: '#C7374B' },
          { x: tr.peaks[1].t, y: tr.peaks[1].F, text: 't₂ = ' + tr.peaks[1].t.toFixed(2) + 's', color: '#C7374B' }
        ] : [];
        drawWaveChart(vis, [{ pts: tr.samples.map(function (s) { return [s.t, s.F]; }), color: '#1661FF', label: 'F−t 曲线（相邻峰距 = T/2）' }], { xLabel: 't / s', yLabel: 'F / N', height: 210, x: [0, 3.2], notes: notesF });
        vis.appendChild(h('div.try-actions', h('button.btn.sm', { type: 'button', onclick: function () {
          shell.go('bench');
          bench.setTiming('sensor');
          bench.setBanner('<b>拉力传感器 F − t 模式：</b>点击舞台下方“由静止释放摆球”，观察相邻波峰时间间隔 Δt = T/2。');
          shell.main.scrollTop = 0;
        } }, '去实验台切换到拉力传感器 F−t 模式 →')));
      }
    },
    restore: function () {
      if (!bench) return;
      bench.stopSwing();
      bench.setMode('guided');
      bench.b.pivot = 'clamp'; bench.b.bob = 'steel'; bench.b.dMm = 19.0; bench.b.LMode = 'l+r';
      bench.b.thetaDeg = 4; bench.b.countOffset = 0; bench.b.timingPos = 'low'; bench.b.swBadStart = false;
      bench.setBanner(null); bench.updateDone(); bench.saveBench(); bench.stage.invalidate(); bench.renderStageActs(); bench.renderSide();
    },
    replay: function (errId) {
      var e = ERR[errId]; if (!e) return;
      shell.go('bench');
      bench.stopSwing();
      bench.setMode('free', true);
      if (errId === 'E1' || errId === 'E2') bench.setTiming('stopwatch', true);
      var cfg = e.config || {};
      bench.b.calDone = true;
      bench.b.pivot = cfg.pivot || 'clamp';
      bench.b.bob = cfg.bob || 'steel';
      bench.b.dMm = bench.b.bob === 'foam' ? 38.0 : 19.0;
      bench.b.LMode = cfg.LMode || 'l+r';
      bench.b.thetaDeg = cfg.thetaDeg || 4;
      bench.b.countOffset = cfg.countOffset || 0;
      bench.b.timingPos = cfg.timingPos || 'low';
      bench.b.swBadStart = bench.b.timingPos === 'high';
      bench.updateDone();
      bench.saveBench();
      bench.stage.invalidate();
      bench.renderStageActs();
      bench.renderSide();
      bench.setBanner('<b>复现：' + e.name + '</b>　已切换到自由模式并预设对应条件（' + M.tex(e.trigger) + '），可释放摆球或点“快速采齐 5 组”观察真实后果。');
      shell.main.scrollTop = 0;
    }
  };
  function openTry(id) {
    var e = ERR[id];
    if (e) ML.TryIt(e, adapter, e.noteId && PROC[e.noteId] ? '<b>' + PROC[e.noteId].title + '：</b>' + PROC[e.noteId].how : '');
  }

  /* =====================================================================
   *  ① 学·原理：6 个交互小部件
   * ===================================================================== */
  function learnWidget(p, card) {
    if (!p.widget) return;
    var box = h('div.learn-widget'); card.appendChild(box);
    if (p.widget === 'angle-demo') {
      var deg = 4;
      var sw = h('div.side-row', h('span.side-l', '选摆角 θ₀'));
      var note = h('div.cmp-note');
      var tblWrap = h('div');
      [4, 10, 20, 35].forEach(function (d) {
        sw.appendChild(h('button.chip' + (d === deg ? '.on' : ''), { type: 'button', data: { d: String(d) }, onclick: function () { setD(d); } }, d + '°'));
      });
      box.appendChild(sw); box.appendChild(note); box.appendChild(tblWrap);
      function setD(d) {
        deg = d;
        ML.$$('.chip', sw).forEach(function (c) { c.classList.toggle('on', c.dataset.d === String(d)); });
        var rad = d * Math.PI / 180, s = Math.sin(rad);
        var sim = PM.simulatePeriod({ l: 0.80, d: PM.STEEL_D, thetaDeg: d, ideal: true, nCycles: 4 });
        var gMeas = PM.calcG(sim.LTrue, sim.T);
        var pctT = (sim.T - sim.T0) / sim.T0 * 100;
        note.innerHTML = 'θ₀ = <b>' + d + '°</b>（' + rad.toFixed(4) + ' rad），sinθ₀ = ' + s.toFixed(4) + '（两者偏差 ' + ((rad - s) / s * 100).toFixed(2) + '%）<br>' +
          '小角公式 T₀ = ' + sim.T0.toFixed(4) + ' s，RK4 实际周期 T = <b>' + sim.T.toFixed(4) + ' s</b>（<b>+' + pctT.toFixed(2) + '%</b>）→ 算得 g = <b>' + gMeas.toFixed(2) + ' m/s²</b>';
        ML.clear(tblWrap);
        var trs = [4, 10, 20, 35].map(function (ang) {
          var r0 = ang * Math.PI / 180, s0 = Math.sin(r0);
          var sm = PM.simulatePeriod({ l: 0.80, d: PM.STEEL_D, thetaDeg: ang, ideal: true, nCycles: 4 });
          var gm = PM.calcG(sm.LTrue, sm.T);
          return h('tr' + (ang === d ? '.hl' : ''),
            h('td', ang + '°'),
            h('td', ((r0 - s0) / s0 * 100).toFixed(2) + '%'),
            h('td', sm.T.toFixed(4) + ' s'),
            h('td', '+' + ((sm.T - sm.T0) / sm.T0 * 100).toFixed(2) + '%'),
            h('td', gm.toFixed(2) + ' m/s²'));
        });
        tblWrap.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '初始摆角 θ₀'), h('th', 'θ−sinθ 偏差'), h('th', 'RK4 周期 T'), h('th', '相对 T₀ 变长'), h('th', '按小角公式算 g')),
          trs));
      }
      setD(4);
    } else if (p.widget === 'caliper-bob-demo') {
      var l0 = 0.790, diameter = 0.019;
      var period = PM.simulatePeriod({ l: l0, d: diameter, thetaDeg: 4, ideal: true }).T;
      var swL = h('div.side-row', h('span.side-l', '从悬点量到哪里？'));
      var diagram = h('div');
      var info = h('div.cmp-note', { 'aria-live': 'polite' });
      box.appendChild(swL); box.appendChild(diagram); box.appendChild(info);
      var endpoints = [
        { mode: 'l', label: '球上沿', y: 82, formula: 'l', result: '少量一个半径，算出的 g 偏小' },
        { mode: 'l+r', label: '球心', y: 105, formula: 'l + d/2', result: '量到球心，得到实际摆长' },
        { mode: 'l+d', label: '球下沿', y: 128, formula: 'l + d', result: '多量一个半径，算出的 g 偏大' }
      ];
      endpoints.forEach(function (end) {
        swL.appendChild(h('button.chip', { type: 'button', data: { m: end.mode }, onclick: function () { pickL(end.mode); } }, end.label));
      });
      function pickL(mode) {
        var end = endpoints.filter(function (item) { return item.mode === mode; })[0];
        ML.$$('.chip', swL).forEach(function (c) {
          c.classList.toggle('on', c.dataset.m === mode);
          c.setAttribute('aria-pressed', String(c.dataset.m === mode));
        });
        var length = PM.recordedLength(l0, diameter, mode);
        diagram.innerHTML = '<svg viewBox="0 0 310 146" style="display:block;width:100%;height:146px" role="img" aria-label="测量线从悬点到' + end.label + '，摆球示意放大">' +
          '<path d="M72 14h64 M104 14v68" fill="none" stroke="#344865" stroke-width="3"/>' +
          '<circle cx="104" cy="105" r="23" fill="#dce7ef" stroke="#344865" stroke-width="2"/><circle cx="104" cy="105" r="2.5" fill="#344865"/>' +
          '<path d="M104 14h64 M104 ' + end.y + 'h64" stroke="#1661aa" stroke-dasharray="4 3"/>' +
          '<path d="M164 14h8 M168 14V' + end.y + ' M164 ' + end.y + 'h8" stroke="#1661aa" stroke-width="3" fill="none"/>' +
          '<circle cx="104" cy="' + end.y + '" r="4" fill="#c35117"/><g fill="#23364d" font-size="14"><text x="178" y="20">悬点</text><text x="178" y="' + (end.y + 4) + '">' + end.label + '</text></g></svg>';
        info.innerHTML = '同一只摆，周期不变。绳长 79.00 cm，球直径 1.90 cm（图中摆球放大）。<br>记录长度 ' +
          end.formula + ' = <b>' + (length * 100).toFixed(2) + ' cm</b>，代入 g = 4π²L/T² 得 <b>' +
          PM.calcG(length, period).toFixed(2) + ' m/s²</b>。' + end.result + '。';
      }
      pickL('l+r');
    } else if (p.widget === 'timing-pos-demo') {
      var dxMm = 1.5;
      var swPos = h('div.side-row', h('span.side-l', '位置判断偏差 Δx'),
        [1.5, 3.0].map(function (v) {
          return h('button.chip' + (v === dxMm ? '.on' : ''), { type: 'button', data: { v: String(v) }, onclick: function () {
            dxMm = v;
            ML.$$('.chip', swPos).forEach(function (c) { c.classList.toggle('on', c.dataset.v === String(v)); });
            stg.invalidate('bg');
          } }, '±' + v.toFixed(1) + ' mm');
        }));
      var stgW = h('div.m09-widget-stage');
      var cap = h('div.cmp-note');
      box.appendChild(swPos); box.appendChild(stgW); box.appendChild(cap);
      var stg = new ML.stage.Stage(stgW, { layers: ['bg'] });
      stg.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var p3 = PM.effectiveParams({ l: 0.80, d: PM.STEEL_D, thetaDeg: 4, ideal: true });
        var th0 = 4 * Math.PI / 180, dx = dxMm / 1000;
        var vMax = Math.sqrt(2 * p3.gEff * p3.LEff * (1 - Math.cos(th0)));
        var aMax = p3.gEff * Math.sin(th0);
        var dtLow = dx / vMax;
        var dtHigh = Math.sqrt(2 * dx / aMax) * 1.8;
        var px = w * 0.30, py = 20, Lpx = hh - 52, ang = 0.40;
        ctx.strokeStyle = '#94A3B8'; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + Lpx); ctx.stroke(); ctx.setLineDash([]);
        var xL = px, yL = py + Lpx, xH = px + Math.sin(ang) * Lpx, yH = py + Math.cos(ang) * Lpx;
        ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(xL, yL); ctx.moveTo(px, py); ctx.lineTo(xH, yH); ctx.stroke();
        ctx.fillStyle = '#25A870'; ctx.beginPath(); ctx.arc(xL, yL, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.arc(xH, yH, 10, 0, Math.PI * 2); ctx.fill();
        D.text(ctx, '最低点 v=' + vMax.toFixed(2) + 'm/s', xL, yL + 22, { align: 'center', size: 11.5, weight: 700, color: '#17784F' });
        D.text(ctx, '最高点 v=0', xH + 14, yH + 4, { size: 11.5, weight: 700, color: '#C7374B' });
        var bx = w * 0.54, bw = w - bx - 18;
        D.text(ctx, '位置判断偏差 ±' + dxMm.toFixed(1) + ' mm 引起的时间误差：', bx, 42, { size: 12, weight: 700 });
        var wLow = Math.max(12, bw * Math.min(0.3, dtLow / dtHigh));
        ctx.fillStyle = '#DCF4EA'; ctx.fillRect(bx, 58, wLow, 24);
        D.text(ctx, '最低点 Δt ≈ ' + dtLow.toFixed(3) + ' s', bx + wLow + 8, 75, { size: 12, weight: 700, color: '#17784F' });
        ctx.fillStyle = '#FDECEF'; ctx.fillRect(bx, 98, bw * 0.85, 24);
        D.text(ctx, '最高点 Δt ≈ ' + dtHigh.toFixed(3) + ' s（约 ' + (dtHigh / dtLow).toFixed(0) + ' 倍）', bx + 8, 115, { size: 12, weight: 700, color: '#C7374B' });
        cap.innerHTML = '模型计算（L = ' + p3.LTrue.toFixed(4) + ' m, θ₀ = 4°）：最低点速率 v<sub>max</sub> = ' + vMax.toFixed(3) + ' m/s，Δt = Δx/v ≈ ' + (dtLow * 1000).toFixed(1) + ' ms；最高点速度为 0，误差达 ' + (dtHigh * 1000).toFixed(0) + ' ms。';
      });
    } else if (p.widget === 'counting-demo') {
      var modeC = 'ok';
      var swC = h('div.side-row',
        h('button.chip.on', { type: 'button', data: { c: 'ok' }, onclick: function () { setC('ok'); } }, '规范：按下数 “0”，同向记 1'),
        h('button.chip', { type: 'button', data: { c: 'bad' }, onclick: function () { setC('bad'); } }, '错法：按下即数 “1”，数到 30'));
      var resC = h('div.cmp-note');
      box.appendChild(swC); box.appendChild(resC);
      function setC(m) {
        modeC = m;
        ML.$$('.chip', swC).forEach(function (c) { c.classList.toggle('on', c.dataset.c === m); });
        var tr = PM.measureTrial({ l: 0.80, d: PM.STEEL_D, thetaDeg: 4, nMeasured: 30, countOffset: m === 'bad' ? -1 : 0, ideal: true });
        resC.innerHTML = m === 'ok'
          ? '计数序列：<b>0</b>（按下）→ 1 → 2 → … → <b>30</b>（停表）｜ 实际经历 <b>30</b> 个周期，t = ' + tr.totalTime.toFixed(2) + ' s → T = ' + tr.T.toFixed(4) + ' s → g = <b>' + tr.g.toFixed(2) + ' m/s²</b>'
          : '计数序列：<b style="color:#C7374B">1</b>（按下）→ 2 → … → <b style="color:#C7374B">30</b>（停表）｜ 实际只摆了 <b>29</b> 个周期，t = ' + tr.totalTime.toFixed(2) + ' s，却除以 30 → T = ' + tr.T.toFixed(4) + ' s（偏小）→ g = <b style="color:#C7374B">' + tr.g.toFixed(2) + ' m/s²（偏大 +7.0%）</b>';
      }
      setC('ok');
    } else if (p.widget === 'lt2-demo') {
      var zoomL5 = false;
      var swL5 = h('div.side-row',
        h('span.side-l', '视图'),
        h('button.chip.on', { type: 'button', onclick: function () { zoomL5 = false; renderL5(); } }, '全局拟合直线'),
        h('button.chip', { type: 'button', onclick: function () { zoomL5 = true; renderL5(); } }, '放大原点看截距 −r'));
      var hostL5 = h('div');
      box.appendChild(swL5); box.appendChild(hostL5);
      var ls = [0.50, 0.65, 0.80, 0.95, 1.10];
      var sR = [], sL = [], rR = [], rL = [];
      ls.forEach(function (l) {
        var T = PM.simulatePeriod({ l: l, d: PM.STEEL_D, thetaDeg: 4, ideal: true }).T;
        sR.push([T * T, l + PM.STEEL_D / 2]); sL.push([T * T, l]);
        rR.push({ L: l + PM.STEEL_D / 2, T: T }); rL.push({ L: l, T: T });
      });
      function renderL5() {
        ML.$$('.chip', swL5).forEach(function (c, i) { c.classList.toggle('on', (i === 1) === zoomL5); });
        ML.clear(hostL5);
        var opts5 = { xLabel: 'T² / s²', yLabel: 'L / m', height: 220, paper: true };
        if (zoomL5) { opts5.x = [0, 0.35]; opts5.y = [-0.025, 0.095]; }
        var chL = new ML.Chart(hostL5, opts5);
        chL.set([
          { pts: sR, fit: true, color: '#25A870', label: '记 l+r（过原点）：g=' + PM.fitLT2(rR).gFit.toFixed(3) },
          { pts: sL, fit: true, color: '#1661FF', dash: true, mark: 'x', label: '只记 l（下移 −r）：g=' + PM.fitLT2(rL).gFit.toFixed(3) }
        ]);
      }
      renderL5();
    } else if (p.widget === 'sensor-demo') {
      var tr = PM.simulateTrace({ l: 0.80, d: PM.STEEL_D, thetaDeg: 8, ideal: true }, 4.2, 1 / 100);
      var notes = [];
      if (tr.peaks.length >= 2) {
        notes.push({ x: tr.peaks[0].t, y: tr.peaks[0].F, text: 't₁', color: '#C7374B' });
        notes.push({ x: tr.peaks[1].t, y: tr.peaks[1].F, text: 't₂ (间距 T/2)', color: '#C7374B' });
      }
      drawWaveChart(box, [{ pts: tr.samples.map(function (s) { return [s.t, s.F]; }), color: '#1661FF', label: '拉力传感器 F−t（T = 2(t₂−t₁) = ' + tr.T_fromPeaks.toFixed(3) + ' s）' }], { xLabel: 't / s', yLabel: 'F / N', height: 215, x: [0, 4.2], notes: notes });
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
        wrap.appendChild(h('p.muted', '每个“试一试”按四拍进行：布置 → 运行 → 对比 → 追问与揭示。所有后果都由 RK4 非线性单摆物理模型实时算出。'));
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
          var card = cardMap[id]; if (!card || card.classList.contains('done')) return;
          card.classList.add('done');
          var nm = ML.$('.err-name', card); if (nm && nm.textContent.indexOf('✓ ') !== 0) nm.textContent = '✓ ' + nm.textContent;
        });
        wrap.appendChild(grid);
        wrap.appendChild(h('h2.diag-h', 'B. 结果反推'));
        wrap.appendChild(h('p.muted', '观察异常实验结果或图像，反推错误原因并去实验台复现。'));
        var rev = h('div.rev'); wrap.appendChild(rev);
        ML.Reverse(rev, C.reverse, adapter);
      } },
      { id: 'paper', label: '练·真题', mount: function (el) { new ML.Paper(el, Q, { title: C.title.replace('实验：', '') + ' · 真题训练', onReplay: adapter.replay }); } }
    ]
  });
  ML.bus.on('tab', function (id) {
    if (id !== 'bench' && bench) bench.stopSwing();
  });
  shell.go(S.tab);
  ML.perf.probe();
  ML.m09 = { bench: function () { return bench; }, adapter: adapter, shell: shell };
})(window.ML);
