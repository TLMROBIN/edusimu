/* M02 scene — 探究弹簧弹力与形变量的关系：物理引擎（Node/浏览器通用）、2.5D 实验台、标尺放大、数据分析与误差诊断。 */
(function (ML) {
  'use strict';
  var P = ML.phys;
  var G_DEF = P.G || 9.80;
  var C_NL = 0.025;     // 超出弹性限度后二次塑性系数 (m/N^2)
  var D_GAP = 0.012;    // 指针与刻度尺尺面之间的垂直间隙 (m)
  var WEIGHT_M = 0.050; // 单个钩码质量 50 g (kg)

  var PRESETS = {
    std:   { id: 'std',   name: '标准弹簧 (49 N/m)',        short: '标准 49N/m',   l0Horiz: 0.140, k: 49.0, mSpring: 0.024, fYield: 4.00 },
    soft:  { id: 'soft',  name: '较软弹簧 (25 N/m)',        short: '较软 25N/m',   l0Horiz: 0.120, k: 25.0, mSpring: 0.015, fYield: 3.20 },
    stiff: { id: 'stiff', name: '较硬弹簧 (98 N/m)',        short: '较硬 98N/m',   l0Horiz: 0.110, k: 98.0, mSpring: 0.036, fYield: 6.00 },
    heavy: { id: 'heavy', name: '大自重对照 (49 N/m, 60 g)', short: '大自重 60g',   l0Horiz: 0.140, k: 49.0, mSpring: 0.060, fYield: 4.00 }
  };

  function getSpring(id) {
    var src = PRESETS[id] || PRESETS.std;
    return {
      id: src.id, name: src.name, short: src.short,
      l0Horiz: src.l0Horiz, k: src.k, mSpring: src.mSpring, fYield: src.fYield
    };
  }

  function selfStretch(spring, g) {
    g = g || G_DEF;
    return (spring.mSpring * g) / (2 * spring.k);
  }

  function l0Hang(spring, g) {
    return spring.l0Horiz + selfStretch(spring, g);
  }

  function elongation(spring, F, fMax) {
    F = Math.max(0, F || 0);
    var fPeak = Math.max(F, fMax || 0);
    var overloaded = F > spring.fYield;
    var xEl = overloaded
      ? F / spring.k + C_NL * Math.pow(F - spring.fYield, 2)
      : F / spring.k;
    var xPerm = fPeak > spring.fYield
      ? 0.55 * C_NL * Math.pow(fPeak - spring.fYield, 2)
      : 0;
    var xTotal = Math.max(xEl, F / spring.k + xPerm);
    return {
      xEl: xEl,
      xPerm: xPerm,
      xTotal: xTotal,
      overloaded: overloaded,
      damaged: fPeak > spring.fYield
    };
  }

  function lengthAt(spring, F, fMax, g) {
    return l0Hang(spring, g) + elongation(spring, F, fMax).xTotal;
  }

  function oscPos(yEq, amp, t, spring, mLoad) {
    if (!amp || t < 0) return yEq;
    var zeta = 0.22;
    var mEff = Math.max(0.02, (mLoad || 0) + spring.mSpring / 3);
    var w0 = Math.sqrt(spring.k / mEff);
    var wd = w0 * Math.sqrt(1 - zeta * zeta);
    var env = Math.exp(-zeta * w0 * t);
    if (env < 1e-4) return yEq;
    return yEq + amp * env * Math.cos(wd * t);
  }

  function readScale(trueL, opts, rng) {
    opts = opts || {};
    var tiltRad = ((opts.rulerTiltDeg || 0) * Math.PI) / 180;
    var viewRad = ((opts.viewAngleDeg || 0) * Math.PI) / 180;
    var val = trueL / Math.cos(tiltRad) + D_GAP * Math.tan(viewRad);
    if (!opts.ideal) {
      var r = rng || P.rng(opts.seed || 17);
      val += r.gauss(0.0002);
      if (opts.quantize !== false) val = Math.round(val * 10000) / 10000;
    }
    return val;
  }

  function measurePoint(spring, nWeights, opts) {
    opts = opts || {};
    var g = opts.g || G_DEF;
    var mLoad = nWeights * WEIGHT_M;
    var F = mLoad * g;
    var fMax = opts.fMax != null ? Math.max(F, opts.fMax) : F;
    var el = elongation(spring, F, fMax);
    var lEq = l0Hang(spring, g) + el.xTotal;
    var lInst = (opts.oscAmp && opts.oscT != null)
      ? oscPos(lEq, opts.oscAmp, opts.oscT, spring, mLoad)
      : lEq;
    var rng = opts.rng || P.rng((opts.seed || 31) + nWeights * 19);
    var lMeas = readScale(lInst, opts, rng);
    var l0Base = opts.l0Mode === 'horiz' ? spring.l0Horiz : l0Hang(spring, g);
    var l0Meas = opts.l0Meas != null ? opts.l0Meas : readScale(l0Base, {
      ideal: opts.ideal,
      rulerTiltDeg: opts.rulerTiltDeg || 0,
      viewAngleDeg: opts.l0ViewAngleDeg != null ? opts.l0ViewAngleDeg : (opts.viewAngleDeg || 0),
      quantize: opts.quantize
    }, P.rng((opts.seed || 31) + 7));
    var xMeas = lMeas - l0Meas;
    return {
      n: nWeights,
      mLoad: mLoad,
      F: F,
      lEq: lEq,
      lInst: lInst,
      l: lMeas,
      l0Used: l0Meas,
      x: xMeas,
      overloaded: el.overloaded,
      damaged: el.damaged,
      xPerm: el.xPerm
    };
  }

  function fitFL(rows) {
    var ls = [], fs = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r && isFinite(r.l) && isFinite(r.F)) { ls.push(r.l); fs.push(r.F); }
    }
    if (ls.length < 2) return { k: NaN, b: NaN, l0Fit: NaN, r2: NaN };
    var fit = P.linfit(ls, fs);
    return { k: fit.k, b: fit.b, l0Fit: fit.k ? -fit.b / fit.k : NaN, r2: fit.r2 };
  }

  function fitFX(rows) {
    var xs = [], fs = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r && isFinite(r.x) && isFinite(r.F)) { xs.push(r.x); fs.push(r.F); }
    }
    if (xs.length < 2) return { k: NaN, b: NaN, xIntercept: NaN, r2: NaN };
    var fit = P.linfit(xs, fs);
    return { k: fit.k, b: fit.b, xIntercept: fit.k ? -fit.b / fit.k : NaN, r2: fit.r2 };
  }

  function comboK(k1, k2, mode) {
    if (mode === 'parallel') return k1 + k2;
    return (k1 > 0 && k2 > 0) ? (k1 * k2) / (k1 + k2) : 0;
  }

  function analyzeWaterBucket(Vs, xs, rho, g) {
    rho = rho || 1000;
    g = g || G_DEF;
    var fit = P.linfit(Vs, xs); // x = fit.k * V + fit.b
    var k = fit.k > 0 ? (rho * g) / fit.k : NaN;
    var mBucket = (fit.k > 0 && isFinite(fit.b)) ? (fit.b * k) / g : NaN;
    return { fit: fit, k: k, mBucket: mBucket };
  }

  function sampleOscillatingSeries(spring, counts, opts) {
    opts = opts || {};
    var amp = opts.oscAmp != null ? opts.oscAmp : 0.015;
    var seed = opts.seed || 73;
    var rnd = P.rng(seed);
    var out = [];
    for (var i = 0; i < counts.length; i++) {
      var n = counts[i];
      var tSample = 0.08 + (i % 3) * 0.09 + rnd() * 0.14;
      var sign = i % 2 === 0 ? 1 : -1;
      out.push(measurePoint(spring, n, {
        ideal: !!opts.ideal,
        l0Mode: opts.l0Mode || 'hang',
        rulerTiltDeg: opts.rulerTiltDeg || 0,
        viewAngleDeg: opts.viewAngleDeg || 0,
        oscAmp: sign * amp,
        oscT: tSample,
        seed: seed + i * 29
      }));
    }
    return out;
  }

  ML.spring = {
    G: G_DEF,
    C_NL: C_NL,
    D_GAP: D_GAP,
    WEIGHT_M: WEIGHT_M,
    PRESETS: PRESETS,
    getSpring: getSpring,
    selfStretch: selfStretch,
    l0Hang: l0Hang,
    elongation: elongation,
    lengthAt: lengthAt,
    oscPos: oscPos,
    readScale: readScale,
    measurePoint: measurePoint,
    fitFL: fitFL,
    fitFX: fitFX,
    comboK: comboK,
    analyzeWaterBucket: analyzeWaterBucket,
    sampleOscillatingSeries: sampleOscillatingSeries
  };
})(typeof window !== 'undefined' ? (window.ML = window.ML || {}) : (globalThis.ML = globalThis.ML || {}));

/* =========================================================================
 *  浏览器交互界面（Node 校验不执行此部分）
 * ========================================================================= */
(function (ML) {
  'use strict';
  if (typeof document === 'undefined') return;

  var h = ML.h, M = ML.math, P = ML.phys, SP = ML.spring, D = ML.stage.draw, GV = ML.gaugesView, GG = ML.gauges;
  var C = ML.json('ml-content'), Q = ML.json('ml-questions') || [];
  var S = ML.store.init(C.slug, {
    v: 1, tab: 'learn', learnPage: 0, mode: 'guided', ideal: false,
    springId: 'std', answers: {}, done: {}
  });
  var ERR = {}; C.errors.forEach(function (e) { ERR[e.id] = e; });
  var PROC = {}; C.procedure.forEach(function (p) { PROC[p.id] = p; });
  var bench = null;
  var shell = null;

  function cmStr(m) { return isFinite(m) ? (m * 100).toFixed(2) : '—'; }

  /* ---------- 弹簧与刻度尺绘制共用函数 ---------- */
  function drawCoilSpring(ctx, x, yTop, yBot, wHalf, coils, color) {
    var len = Math.max(24, yBot - yTop);
    var lead = 8;
    var body = len - 2 * lead;
    ctx.strokeStyle = color || '#3B4B60';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yTop + lead);
    for (var i = 0; i < coils; i++) {
      var t0 = i / coils, t1 = (i + 0.25) / coils, t2 = (i + 0.75) / coils, t3 = (i + 1) / coils;
      ctx.lineTo(x - wHalf, yTop + lead + body * t1);
      ctx.lineTo(x + wHalf, yTop + lead + body * t2);
      ctx.lineTo(x, yTop + lead + body * t3);
      void t0;
    }
    ctx.lineTo(x, yBot);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function drawVerticalRuler(ctx, rx, yTop, ppm, maxCm, tiltDeg) {
    var rad = -(tiltDeg || 0) * Math.PI / 180;
    var rW = 36, rH = (maxCm / 100) * ppm + 14;
    ctx.save();
    ctx.translate(rx, yTop);
    ctx.rotate(rad);
    ctx.fillStyle = D.grad(ctx, 0, 0, rW, 0, ['#FFFFFF', '#E9EFF6']);
    D.rr(ctx, 0, -6, rW, rH + 6, 4);
    ctx.fill();
    ctx.strokeStyle = tiltDeg ? '#C7374B' : '#9AA8B8';
    ctx.lineWidth = tiltDeg ? 1.5 : 1.1;
    ctx.stroke();
    ctx.strokeStyle = '#10233F';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var mm = 0; mm <= maxCm * 10; mm++) {
      var yy = (mm / 1000) * ppm;
      var tl = mm % 10 === 0 ? 15 : (mm % 5 === 0 ? 10 : 6);
      ctx.moveTo(0, yy);
      ctx.lineTo(tl, yy);
    }
    ctx.stroke();
    for (var c = 0; c <= maxCm; c += 5) {
      D.text(ctx, String(c), 18, (c / 100) * ppm + 4, { size: 10.5, weight: 700, color: '#10233F' });
    }
    D.text(ctx, 'cm', rW - 4, 10, { align: 'right', size: 9.5, color: '#4A5B73' });
    ctx.restore();
  }

  /* ---------- 刻度尺规范读数弹窗（嵌用 ML.gaugesView.GaugeBench） ---------- */
  function openRulerModal(targetCmStr, targetMm, onConfirm) {
    var old = document.querySelector('.ml-ruler-modal');
    if (old) old.remove();
    var gHost = h('div');
    var inp = h('input.cal-inp', { type: 'text', value: '', placeholder: '如 ' + targetCmStr, 'aria-label': '输入毫米刻度尺读数（cm）' });
    var fb = h('div.cal-fb', '长按刻度尺可呼出 3× 放大镜；最小分度 1 mm，须估读到 0.01 cm（保留两位小数）。');
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      document.removeEventListener('keydown', onKey);
      if (modal) { modal.remove(); modal = null; }
    }
    var modal = h('div.ml-modal.ml-ruler-modal', {
      role: 'dialog', 'aria-modal': 'true', 'aria-label': '毫米刻度尺规范读数',
      onclick: function (e) { if (e.target === modal) close(); }
    },
      h('div.ml-modal-card',
        h('div.try-head',
          h('div', h('div.try-k', '仪器规范读数'), h('h2', '毫米刻度尺指针位置读数（单位：cm）')),
          h('button.btn', { type: 'button', onclick: close }, '关闭')),
        gHost,
        h('div.cal-read-row',
          h('span', '读得刻度 l ='), inp, h('span', 'cm'),
          h('button.btn.primary', { type: 'button', onclick: verify }, '核对读数'),
          h('button.btn', { type: 'button', onclick: function () { inp.value = targetCmStr; verify(); } }, '填入 ' + targetCmStr + ' cm')),
        fb));
    document.body.appendChild(modal);
    document.addEventListener('keydown', onKey);
    new GV.GaugeBench(gHost, { height: 250, state: { type: 'ruler', startMm: 0, lengthMm: targetMm, locked: true } });
    function verify() {
      var res = GG.ruler.diagnose(inp.value, targetMm, { startMm: 0, unit: 'cm', tolMm: 0.15 });
      fb.className = 'cal-fb ' + (res.ok ? 'ok' : 'bad');
      fb.textContent = (res.ok ? '✓ ' : '✕ ') + res.msg;
      if (res.ok) {
        ML.toast('刻度尺读数规范：' + targetCmStr + ' cm（保留两位小数）', 'ok');
        if (onConfirm) onConfirm(targetCmStr);
      }
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') verify(); });
  }

  /* =====================================================================
   *  ② 做·实验台
   * ===================================================================== */
  function Bench(el) {
    var self = this;
    this.el = el;
    this.mode = S.mode || 'guided';
    this.springId = S.springId || 'std';
    this.spring = SP.getSpring(this.springId);
    this.nWeights = 0;
    this.fMax = 0;
    this.l0Mode = 'hang';      // 'hang' | 'horiz'
    this.viewAngleDeg = 0;     // 0 | 18 | -18
    this.rulerTiltDeg = 0;     // 0 | 12
    this.l0Measured = null;    // m (已测量并记录的原长)
    this.rows = [];
    this.chartMode = 'fx';     // 'fx' | 'fl'
    this.showAna = false;
    this.badConnect = false;

    // 振动与拖拽状态
    this.oscAmp = 0;
    this.oscT = 0;
    this.oscSampleMode = false;
    this.drag = null;          // { kind: 'tray'|'stack', x, y }
    this.magLocked = false;
    this.seedCounter = 41;

    this.done = {
      P1: true, P2: false, P3: true, P4: true,
      P5: true, P6: true, P7: false, P8: false
    };

    var modeChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'guided' }, onclick: function () { self.setMode('guided'); } }, '引导模式'),
      h('button.chip', { type: 'button', data: { v: 'free' }, onclick: function () { self.setMode('free'); } }, '自由模式'));
    this.modeChips = modeChips;

    this.springChips = h('div.seg',
      ['std', 'soft', 'stiff', 'heavy'].map(function (id) {
        return h('button.chip', {
          type: 'button', data: { s: id },
          onclick: function () { self.setSpring(id); }
        }, SP.PRESETS[id].short);
      }));

    this.idealChip = h('button.chip', {
      type: 'button', title: '理想条件：无读数高斯噪声',
      onclick: function () {
        self.pendingReading = null;
        S.ideal = !S.ideal; ML.store.save();
        self.idealChip.classList.toggle('on', S.ideal);
        self.idealChip.textContent = S.ideal ? '理想条件' : '真实条件';
        self.stage.invalidate('fg');
        self.renderSide();
      }
    }, S.ideal ? '理想条件' : '真实条件');
    this.idealChip.classList.toggle('on', S.ideal);

    this.bannerEl = h('div.bench-banner', { hidden: true });
    var topBar = h('div.bench-top', modeChips, this.springChips, h('div.spacer'), this.idealChip);
    this.stageWrap = h('div.bench-stage');
    this.magBtn = h('button.chip', {
      type: 'button', 'aria-label': '切换指针放大镜',
      onclick: function () {
        self.magLocked = !self.magLocked;
        self.magBtn.classList.toggle('on', self.magLocked);
        self.magBtn.textContent = self.magLocked ? '🔍 放大镜已开' : '🔍 指针放大镜';
        self.updateStickyMag();
      }
    }, '🔍 指针放大镜');
    this.stageWrap.appendChild(h('div.stage-tools', this.magBtn));

    this.side = h('aside.bench-side');
    this.analysis = h('section.analysis', { hidden: true });
    this.benchEl = h('div.bench', topBar, this.bannerEl, h('div.bench-row', this.stageWrap, this.side), this.analysis);
    el.appendChild(this.benchEl);

    this.stage = new ML.stage.Stage(this.stageWrap, {
      layers: ['bg', 'fg'],
      onResize: function () { if (self.magLocked) self.updateStickyMag(); }
    });
    this.stage.on('bg', function (ctx, w, hh) { self.drawBg(ctx, w, hh); });
    this.stage.on('fg', function (ctx, w, hh) { self.drawFg(ctx, w, hh); });
    this.mag = new ML.stage.Magnifier(this.stageWrap, { zoom: 3, size: 150 });
    this.loop = new ML.stage.Loop(function (dt) { return self.tick(dt); });
    this.bindPointer();

    this.setMode(this.mode, true);
    this.setSpring(this.springId, true);
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

  Bench.prototype.settleNow = function () {
    this.loop.stop();
    this.oscAmp = 0;
    this.oscT = 0;
    this.oscSampleMode = false;
    if (this.mag && !this.magLocked) this.mag.hide();
    if (this.stage) this.stage.invalidate('fg');
  };

  Bench.prototype.curForce = function () {
    return this.nWeights * SP.WEIGHT_M * SP.G;
  };

  Bench.prototype.curElong = function () {
    return SP.elongation(this.spring, this.curForce(), this.fMax);
  };

  Bench.prototype.curLengthEq = function () {
    return SP.l0Hang(this.spring, SP.G) + this.curElong().xTotal;
  };

  Bench.prototype.curLengthInst = function () {
    var lEq = this.curLengthEq();
    if (!this.oscAmp) return lEq;
    return SP.oscPos(lEq, this.oscAmp, this.oscT, this.spring, this.nWeights * SP.WEIGHT_M);
  };

  Bench.prototype.curReading = function (seedOffset) {
    var lInst = this.curLengthInst();
    return SP.readScale(lInst, {
      ideal: S.ideal || this.guided(),
      viewAngleDeg: this.viewAngleDeg,
      rulerTiltDeg: this.rulerTiltDeg,
      seed: this.seedCounter + (seedOffset || 0)
    });
  };

  Bench.prototype.setMode = function (m, silent) {
    this.pendingReading = null;
    this.mode = m; S.mode = m; ML.store.save();
    ML.$$('.chip', this.modeChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === m); });
    if (m === 'guided') {
      this.l0Mode = 'hang';
      this.viewAngleDeg = 0;
      this.rulerTiltDeg = 0;
      this.badConnect = false;
      var maxAllowedN = Math.floor(this.spring.fYield / (SP.WEIGHT_M * SP.G));
      if (this.nWeights > maxAllowedN || this.fMax > this.spring.fYield) {
        this.nWeights = Math.min(this.nWeights, maxAllowedN);
        this.fMax = this.curForce();
      }
      this.settleNow();
    }
    if (!silent) {
      this.setBanner(null);
      ML.toast(m === 'guided' ? '引导模式：按实验规范校验每一步' : '自由模式：可自由制造超限、水平原长、俯视、倾尺、未静读数等误差');
    }
    this.updateDone();
    this.stage.invalidate();
    this.renderSide();
  };

  Bench.prototype.setSpring = function (id, silent) {
    this.springId = id; S.springId = id; ML.store.save();
    this.spring = SP.getSpring(id);
    ML.$$('.chip', this.springChips).forEach(function (c) { c.classList.toggle('on', c.dataset.s === id); });
    this.resetExperiment(true);
    if (!silent) {
      this.setBanner(null);
      ML.toast('已切换为：' + this.spring.name + '（弹性限度 ' + this.spring.fYield.toFixed(1) + ' N）');
    }
  };

  Bench.prototype.resetExperiment = function (keepSpring) {
    this.loop.stop();
    this.oscAmp = 0; this.oscT = 0;
    this.oscSampleMode = false;
    this.nWeights = 0; this.fMax = 0;
    if (!keepSpring) {
      this.l0Mode = 'hang';
      this.viewAngleDeg = 0;
      this.rulerTiltDeg = 0;
      this.badConnect = false;
    }
    this.l0Measured = null;
    this.pendingReading = null;
    this.rows = [];
    this.showAna = false;
    this.analysis.hidden = true;
    ML.clear(this.analysis);
    this.updateDone();
    this.stage.invalidate();
    this.renderSide();
  };

  Bench.prototype.setWeights = function (nTarget) {
    var n = P.clamp(Math.round(nTarget), 0, 10);
    if (n === this.nWeights) return;
    var nextF = n * SP.WEIGHT_M * SP.G;
    if (this.guided() && nextF > this.spring.fYield) {
      this.block('继续加挂将使拉力 (' + nextF.toFixed(2) + ' N) 超过弹性限度 (' + this.spring.fYield.toFixed(2) + ' N)，弹簧会永久变形！', 'E1');
      return;
    }
    var prevN = this.nWeights;
    this.pendingReading = null;
    this.nWeights = n;
    if (nextF > this.fMax) this.fMax = nextF;
    this.seedCounter += 7;
    this.oscAmp = (n > prevN ? 1 : -1) * 0.015;
    this.oscT = 0;
    this.loop.start();
    this.setBanner(null);
    this.updateDone();
    this.stage.invalidate('fg');
    this.renderSide();
  };

  Bench.prototype.tick = function (dt) {
    if (!this.oscAmp) return false;
    this.oscT += dt;
    var lEq = this.curLengthEq();
    var lNow = this.curLengthInst();
    if (this.oscT > 0.25 && Math.abs(lNow - lEq) < 0.00008) {
      this.oscAmp = 0;
      this.oscT = 0;
      this.stage.invalidate('fg');
      this.renderSide();
      if (this.magLocked) this.updateStickyMag();
      return false;
    }
    this.stage.invalidate('fg');
    this.updateReadout();
    if (this.magLocked) this.updateStickyMag();
    return true;
  };

  Bench.prototype.measureL0 = function () {
    if (this.guided()) {
      if (this.nWeights > 0) {
        this.block('请先取下全部钩码（n = 0），在自然竖直悬挂状态下测原长 l₀。', 'E2');
        return;
      }
      if (this.oscAmp) {
        this.block('请等弹簧完全静止后再读取原长 l₀。', 'E3');
        return;
      }
    }
    var lBase = this.l0Mode === 'horiz' ? this.spring.l0Horiz : this.curLengthEq();
    if (this.nWeights > 0 && this.l0Mode === 'hang') lBase = this.curLengthInst();
    var readingSeed = this.seedCounter;
    if (!this.guided()) this.seedCounter++;
    var measured = SP.readScale(lBase, {
      ideal: S.ideal || this.guided(),
      viewAngleDeg: this.viewAngleDeg,
      rulerTiltDeg: this.rulerTiltDeg,
      seed: readingSeed
    });
    if (this.guided()) {
      this.pendingReading = { kind: 'l0', expected: measured };
      this.renderSide(); ML.toast('请从标尺读取原长，以 cm 为单位保留两位小数。', 'info'); return;
    }
    this.l0Measured = measured;
    this.updateDone();
    this.renderSide();
    ML.toast((this.l0Mode === 'horiz' ? '水平平放' : '竖直悬挂') + '测得原长 l₀ = ' + cmStr(this.l0Measured) + ' cm', this.l0Mode === 'horiz' ? 'warn' : 'ok');
  };

  Bench.prototype.recordRow = function () {
    if (this.guided()) {
      if (!this.l0Measured) {
        this.block('请先点击“测原长 l₀”测出弹簧自然原长。', 'E2');
        return;
      }
      if (this.oscAmp) {
        this.block('弹簧仍在上下振动中，请等待完全静止后再读数！', 'E3');
        return;
      }
      if (this.curForce() > this.spring.fYield) {
        this.block('当前拉力已超弹性限度，数据不再符合胡克定律。', 'E1');
        return;
      }
    }
    var l0 = this.l0Measured != null ? this.l0Measured : SP.l0Hang(this.spring, SP.G);
    if (this.l0Measured == null) this.l0Measured = l0;
    var wasOsc = !!this.oscAmp;
    var lMeas = this.curReading(this.guided() ? 0 : this.rows.length * 13);
    var F = this.curForce();
    var tags = [];
    if (F > this.spring.fYield || this.fMax > this.spring.fYield) tags.push('E1');
    if (this.l0Mode === 'horiz') tags.push('E2');
    if (wasOsc) tags.push('E3');
    if (this.viewAngleDeg !== 0) tags.push('E4');
    if (this.rulerTiltDeg !== 0) tags.push('E5');
    var row = { n: this.nWeights, F: F, l: lMeas, l0: l0, x: lMeas - l0,
      overloaded: F > this.spring.fYield, osc: wasOsc, tags: tags };
    if (this.guided()) {
      this.pendingReading = { kind: 'row', expected: lMeas, row: row };
      this.renderSide(); ML.toast('请从指针与毫米刻度尺读数，估读到 0.01 cm 后提交。', 'info'); return;
    }
    this.commitRow(row);
  };

  Bench.prototype.commitRow = function (row) {
    var idx = -1;
    for (var i = 0; i < this.rows.length; i++) {
      if (this.rows[i].n === row.n) { idx = i; break; }
    }
    if (idx >= 0) this.rows[idx] = row;
    else {
      this.rows.push(row);
      this.rows.sort(function (a, b) { return a.n - b.n; });
    }
    this.updateDone();
    this.renderSide();
    if (this.showAna) this.renderAnalysis(true);
    ML.toast('已记录 n=' + row.n + '（F=' + row.F.toFixed(2) + ' N, l=' + cmStr(row.l) + ' cm）', row.tags.length ? 'warn' : 'ok');
  };

  Bench.prototype.confirmReading = function (value) {
    var p = this.pendingReading; if (!p) return;
    if (this.oscAmp || this.nWeights !== (p.kind === 'l0' ? 0 : p.row.n)) {
      this.pendingReading = null;
      this.renderSide();
      ML.toast('装置状态已改变，请按当前画面重新记录并读数。', 'warn');
      return;
    }
    var v = Number(value);
    if (!isFinite(v) || Math.abs(v - p.expected * 100) > 0.011) {
      ML.toast('读数不符。请正视指针，毫米尺以 cm 记录时保留两位小数。', 'warn'); return;
    }
    this.pendingReading = null;
    if (p.kind === 'l0') {
      this.l0Measured = v / 100; this.updateDone(); this.renderSide();
      ML.toast('原长读数已记录：l₀ = ' + v.toFixed(2) + ' cm', 'ok');
    } else {
      p.row.l = v / 100; p.row.x = p.row.l - p.row.l0; this.commitRow(p.row);
    }
  };

  Bench.prototype.collectSix = function () {
    if (this.guided()) {
      this.settleNow();
      if (!this.l0Measured) this.measureL0();
    }
    var l0 = this.l0Measured != null ? this.l0Measured : (this.l0Mode === 'horiz' ? this.spring.l0Horiz : SP.l0Hang(this.spring, SP.G));
    this.l0Measured = l0;
    var counts = [0, 1, 2, 3, 4, 5];
    var maxN = this.nWeights > 5 ? this.nWeights : 5;
    if (!this.guided() && maxN > 5) {
      counts = [];
      for (var k = 0; k <= maxN; k++) counts.push(k);
    }
    var out = [], fPeak = this.nWeights > 5 ? 0 : this.fMax;
    var oscUse = !this.guided() && !!(this.oscAmp || this.oscSampleMode);
    if (oscUse) {
      var oscPts = SP.sampleOscillatingSeries(this.spring, counts, {
        ideal: S.ideal,
        l0Mode: this.l0Mode,
        l0Meas: l0,
        oscAmp: this.oscAmp || 0.015,
        rulerTiltDeg: this.rulerTiltDeg,
        viewAngleDeg: this.viewAngleDeg,
        seed: this.seedCounter
      });
      for (var i = 0; i < oscPts.length; i++) {
        var mpOsc = oscPts[i];
        var tOsc = ['E3'];
        if (mpOsc.overloaded || mpOsc.damaged) tOsc.push('E1');
        if (this.l0Mode === 'horiz') tOsc.push('E2');
        if (this.viewAngleDeg !== 0) tOsc.push('E4');
        if (this.rulerTiltDeg !== 0) tOsc.push('E5');
        out.push({ n: mpOsc.n, F: mpOsc.F, l: mpOsc.l, l0: l0, x: mpOsc.l - l0, overloaded: mpOsc.overloaded, osc: true, tags: tOsc });
      }
      if (!this.oscAmp) { this.oscAmp = 0.015; this.oscT = 0; this.loop.start(); }
    } else {
      for (var i = 0; i < counts.length; i++) {
        var nw = counts[i];
        var F = nw * SP.WEIGHT_M * SP.G;
        if (F > fPeak) fPeak = F;
        var mp = SP.measurePoint(this.spring, nw, {
          ideal: S.ideal,
          l0Mode: this.l0Mode,
          l0Meas: l0,
          fMax: fPeak,
          rulerTiltDeg: this.rulerTiltDeg,
          viewAngleDeg: this.viewAngleDeg,
          seed: this.seedCounter + i * 23
        });
        var tags = [];
        if (mp.overloaded || mp.damaged) tags.push('E1');
        if (this.l0Mode === 'horiz') tags.push('E2');
        if (this.viewAngleDeg !== 0) tags.push('E4');
        if (this.rulerTiltDeg !== 0) tags.push('E5');
        out.push({ n: nw, F: mp.F, l: mp.l, l0: l0, x: mp.l - l0, overloaded: mp.overloaded, osc: false, tags: tags });
      }
    }
    this.rows = out;
    this.showAna = true;
    this.updateDone();
    this.renderSide();
    this.renderAnalysis(false);
    ML.toast(oscUse ? ('已按振动未静止状态采样 ' + out.length + ' 组数据，线性相关系数明显下降') : ('已采齐 ' + out.length + ' 组实验数据，下方已生成拟合图像'), oscUse ? 'warn' : 'ok');
  };

  Bench.prototype.updateDone = function () {
    this.done.P1 = true;
    this.done.P2 = this.l0Measured != null && this.l0Mode === 'hang';
    this.done.P3 = this.rulerTiltDeg === 0;
    this.done.P4 = !this.oscAmp;
    this.done.P5 = this.viewAngleDeg === 0;
    this.done.P6 = this.curForce() <= this.spring.fYield;
    this.done.P7 = this.rows.length >= 6;
    this.done.P8 = this.rows.length >= 6 && this.showAna;
  };

  /* ---------- 舞台几何与绘制 ---------- */
  Bench.prototype.geo = function (w, hh) {
    var tableY = hh - 26;
    var yTop = 34;
    var availH = Math.max(140, tableY - yTop - 92);
    var ppm = Math.min(820, availH / 0.41);
    var rodX = Math.max(46, Math.round(w * 0.20));
    var springX = Math.max(rodX + 68, Math.round(w * 0.41));
    var rulerX = springX + 62;
    var trayX = Math.max(rulerX + 66, Math.round(w * 0.72));
    trayX = Math.min(w - 72, trayX);
    return {
      w: w, h: hh, tableY: tableY, yTop: yTop, ppm: ppm,
      rodX: rodX, springX: springX, rulerX: rulerX, trayX: trayX
    };
  };

  Bench.prototype.drawBg = function (ctx, w, hh) {
    if (w < 80 || hh < 80) return;
    var g = this.geo(w, hh);
    ctx.fillStyle = '#EAF1F8'; ctx.fillRect(0, 0, w, hh);

    // 实验桌
    ctx.fillStyle = D.grad(ctx, 0, g.tableY, 0, hh, ['#DFC295', '#C29A63']);
    ctx.fillRect(0, g.tableY, w, 26);
    ctx.fillStyle = '#9F7C49'; ctx.fillRect(0, g.tableY, w, 2);

    // 铁架台（底座 + 竖杆 + 横梁）
    ctx.fillStyle = D.grad(ctx, g.rodX - 42, 0, g.rodX + 42, 0, ['#CBD5E1', '#8E99A6']);
    D.rr(ctx, g.rodX - 42, g.tableY - 12, 84, 12, 3); ctx.fill();
    ctx.strokeStyle = '#64748B'; ctx.stroke();
    ctx.fillStyle = D.grad(ctx, g.rodX - 5, 0, g.rodX + 5, 0, ['#DCE4EC', '#8E99A6']);
    ctx.fillRect(g.rodX - 5, g.yTop - 16, 10, g.tableY - 12 - (g.yTop - 16));
    ctx.strokeRect(g.rodX - 5, g.yTop - 16, 10, g.tableY - 12 - (g.yTop - 16));
    ctx.fillStyle = D.grad(ctx, 0, g.yTop - 10, 0, g.yTop - 2, ['#E2E8F0', '#94A3B8']);
    ctx.fillRect(g.rodX - 10, g.yTop - 10, g.rulerX - g.rodX + 48, 8);
    ctx.strokeRect(g.rodX - 10, g.yTop - 10, g.rulerX - g.rodX + 48, 8);
    ctx.fillStyle = '#3B4B60'; D.rr(ctx, g.rodX - 9, g.yTop - 14, 18, 16, 3); ctx.fill();
    ctx.fillStyle = '#3B4B60'; D.rr(ctx, g.springX - 8, g.yTop - 12, 16, 14, 3); ctx.fill();

    // 悬点零基准线
    ctx.save(); ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(22,97,255,0.35)';
    ctx.beginPath(); ctx.moveTo(g.springX - 24, g.yTop); ctx.lineTo(g.rulerX, g.yTop); ctx.stroke();
    ctx.restore();

    // 右侧竖直毫米刻度尺（0 在上方对齐悬点）
    var maxCm = Math.min(45, Math.floor((g.tableY - g.yTop - 18) / g.ppm * 100 / 5) * 5);
    drawVerticalRuler(ctx, g.rulerX, g.yTop, g.ppm, Math.max(25, maxCm), this.rulerTiltDeg);
    if (this.rulerTiltDeg) {
      D.text(ctx, '⚠ 刻度尺倾斜 ' + this.rulerTiltDeg + '°', g.rulerX + 46, g.yTop + 18, { size: 11.5, weight: 700, color: '#C7374B' });
    }
    if (this.l0Mode === 'horiz') {
      D.text(ctx, '⚠ 按水平原长 l₀ = ' + cmStr(this.spring.l0Horiz) + ' cm 计算', 12, 20, { size: 11.5, weight: 700, color: '#C7374B' });
    }

    // 钩码托盘（右下桌面）
    ctx.fillStyle = '#E2E8F0';
    D.rr(ctx, g.trayX - 38, g.tableY - 10, 76, 10, 4); ctx.fill();
    ctx.strokeStyle = '#64748B'; ctx.stroke();
    D.text(ctx, '50 g 钩码盘', g.trayX, g.tableY + 16, { align: 'center', size: 11, weight: 600, color: '#4A5B73' });
  };

  Bench.prototype.drawFg = function (ctx, w, hh) {
    if (w < 80 || hh < 80) return;
    var g = this.geo(w, hh);
    this.hot = [];
    var lInst = this.curLengthInst();
    var yBot = Math.min(g.tableY - 24, g.yTop + lInst * g.ppm);
    var damaged = this.fMax > this.spring.fYield;
    var overloaded = this.curForce() > this.spring.fYield;

    // 弹簧本体（超弹性限度变红）
    drawCoilSpring(ctx, g.springX, g.yTop, yBot, 13, 14, damaged ? '#C7374B' : '#3B4B60');

    // 指针（伸向右侧毫米刻度尺，保留微小物理间隙）
    var ptrEndX = g.rulerX - 3;
    ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(g.springX, yBot); ctx.lineTo(ptrEndX, yBot); ctx.stroke();
    ctx.fillStyle = '#C7374B';
    ctx.beginPath(); ctx.moveTo(ptrEndX + 2, yBot); ctx.lineTo(ptrEndX - 7, yBot - 4); ctx.lineTo(ptrEndX - 7, yBot + 4); ctx.closePath(); ctx.fill();
    if (this.rulerTiltDeg) {
      var rulerFaceX = g.rulerX + Math.max(0, yBot - g.yTop) * Math.tan(Math.abs(this.rulerTiltDeg) * Math.PI / 180);
      ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(ptrEndX + 2, yBot); ctx.lineTo(rulerFaceX, yBot); ctx.stroke();
      ctx.restore();
    }

    // 视差视线示意（俯视/仰视）
    if (this.viewAngleDeg !== 0) {
      var viewRad = this.viewAngleDeg * Math.PI / 180;
      var eyeX = g.rulerX - 66, eyeY = yBot - Math.tan(viewRad) * 66;
      var hitY = yBot + (SP.D_GAP * Math.tan(viewRad)) * g.ppm;
      ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(eyeX, eyeY); ctx.lineTo(g.rulerX + 4, hitY); ctx.stroke();
      ctx.restore();
      D.text(ctx, (this.viewAngleDeg > 0 ? '俯视 +' : '仰视 ') + this.viewAngleDeg + '°', eyeX - 4, eyeY - 4, { align: 'right', size: 11, weight: 700, color: '#C7374B' });
    }

    // 挂钩与所挂 50 g 钩码叠放
    var hookY = yBot + 10;
    ctx.strokeStyle = '#4A5B73'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(g.springX, yBot); ctx.lineTo(g.springX, hookY); ctx.arc(g.springX, hookY + 3, 4, -Math.PI / 2, Math.PI * 1.1); ctx.stroke();

    var compact = this.nWeights > 6;
    var wStackH = compact ? 5.5 : 8.5, wGap = compact ? 1.0 : 1.5, wHalf = 14;
    for (var i = 0; i < this.nWeights; i++) {
      var wy = hookY + 6 + i * (wStackH + wGap);
      if (wy + wStackH > g.tableY - 2) break;
      ctx.fillStyle = D.grad(ctx, g.springX - wHalf, wy, g.springX + wHalf, wy, ['#D6DEE8', '#8E99A6']);
      D.rr(ctx, g.springX - wHalf, wy, wHalf * 2, wStackH, 2); ctx.fill();
      ctx.strokeStyle = '#4A5B73'; ctx.lineWidth = 1; ctx.stroke();
    }
    var stackBotY = hookY + 6 + this.nWeights * (wStackH + wGap);
    this.hot.push({
      id: 'hook',
      x: g.springX - 34, y: yBot - 10, w: 68, h: Math.max(54, stackBotY - yBot + 24)
    });

    if (this.nWeights > 0) {
      D.text(ctx, this.nWeights + '×50g', g.springX - 20, hookY + 14, { align: 'right', size: 11, weight: 700, color: '#10233F' });
    }

    // 右下托盘中的备用钩码（可拖到挂钩上）
    var avail = Math.max(0, 10 - this.nWeights);
    if (avail > 0) {
      var showCount = Math.min(4, avail);
      for (var j = 0; j < showCount; j++) {
        var ty = g.tableY - 19 - j * 9.5;
        ctx.fillStyle = D.grad(ctx, g.trayX - wHalf, ty, g.trayX + wHalf, ty, ['#DCE4EC', '#8E99A6']);
        D.rr(ctx, g.trayX - wHalf, ty, wHalf * 2, 8.5, 2); ctx.fill();
        ctx.strokeStyle = '#12A9C4'; ctx.lineWidth = 1.2; ctx.stroke();
      }
      D.text(ctx, '拖钩码到挂钩（余' + avail + '）', g.trayX, g.tableY - 24 - showCount * 9.5, { align: 'center', size: 11, weight: 700, color: '#0E8CA3' });
      this.hot.push({ id: 'tray', x: g.trayX - 38, y: g.tableY - 72, w: 76, h: 68 });
    }

    // 标尺按住放大提示区
    this.hot.push({ id: 'ruler', x: g.rulerX - 18, y: g.yTop, w: 74, h: g.tableY - g.yTop });

    // 超限 / 振动状态标签
    if (overloaded || damaged) {
      D.text(ctx, overloaded ? '⚠ 超出弹性限度！' : '⚠ 已产生永久伸长', g.springX, g.yTop - 16, { align: 'center', size: 11.5, weight: 700, color: '#C7374B' });
    } else if (this.oscAmp) {
      D.text(ctx, '弹簧振动中，请等待静止…', g.springX, g.yTop - 16, { align: 'center', size: 11.5, weight: 700, color: '#E69B2D' });
    }

    // 正在拖拽的钩码 + 挂钩吸附环
    if (this.drag) {
      ctx.strokeStyle = '#12A9C4'; ctx.setLineDash([4, 3]); ctx.lineWidth = 2;
      var snapTargetY = this.drag.kind === 'tray' ? stackBotY : g.tableY - 20;
      var snapTargetX = this.drag.kind === 'tray' ? g.springX : g.trayX;
      ctx.beginPath(); ctx.arc(snapTargetX, snapTargetY, 24, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = D.grad(ctx, this.drag.x - 16, this.drag.y - 5, this.drag.x + 16, this.drag.y - 5, ['#E2E8F0', '#64748B']);
      D.rr(ctx, this.drag.x - 16, this.drag.y - 5, 32, 10, 2); ctx.fill();
      ctx.strokeStyle = '#1661FF'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  };

  Bench.prototype.pointerPosForMag = function () {
    var g = this.geo(this.stage.w, this.stage.h);
    var lInst = this.curLengthInst();
    var yBot = Math.min(g.tableY - 24, g.yTop + lInst * g.ppm);
    return { x: g.rulerX + 6, y: yBot };
  };

  Bench.prototype.updateStickyMag = function () {
    if (!this.magLocked) { this.mag.hide(); return; }
    var pos = this.pointerPosForMag();
    var lShow = this.curReading(0);
    this.mag.show([this.stage.layer('bg').canvas, this.stage.layer('fg').canvas], pos.x, pos.y, this.stage.dpr, this.guided() ? '从指针与标尺读数' : 'l ≈ ' + cmStr(lShow) + ' cm');
  };

  Bench.prototype.bindPointer = function () {
    var self = this;
    function hitHot(p, id) {
      for (var i = 0; i < (self.hot || []).length; i++) {
        var r = self.hot[i];
        if (r.id === id && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return true;
      }
      return false;
    }
    ML.stage.pointer(this.stage.el, {
      down: function (p) {
        if (hitHot(p, 'tray') && self.nWeights < 10) {
          self.drag = { kind: 'tray', x: p.x, y: p.y };
          self.stage.invalidate('fg');
          return;
        }
        if (hitHot(p, 'hook') && self.nWeights > 0) {
          self.drag = { kind: 'stack', x: p.x, y: p.y };
          self.stage.invalidate('fg');
          return;
        }
        if (hitHot(p, 'ruler')) {
          self.drag = { kind: 'mag', x: p.x, y: p.y };
          return;
        }
        return false;
      },
      move: function (p, a) {
        if (!self.drag) return;
        if (self.drag.kind === 'mag') {
          if (a.pressed) {
            var lShow = self.curReading(0);
            self.mag.show([self.stage.layer('bg').canvas, self.stage.layer('fg').canvas], p.x, p.y, self.stage.dpr, self.guided() ? '从指针与标尺读数' : 'l ≈ ' + cmStr(lShow) + ' cm');
          }
          return;
        }
        self.drag.x = p.x; self.drag.y = p.y;
        self.stage.invalidate('fg');
      },
      press: function (p) {
        var lShow = self.curReading(0);
        self.mag.show([self.stage.layer('bg').canvas, self.stage.layer('fg').canvas], p.x, p.y, self.stage.dpr, self.guided() ? '从指针与标尺读数' : 'l ≈ ' + cmStr(lShow) + ' cm');
      },
      up: function (p) {
        var d = self.drag; self.drag = null;
        if (!self.magLocked) self.mag.hide();
        if (!d) return;
        var g = self.geo(self.stage.w, self.stage.h);
        if (d.kind === 'tray') {
          var lInst = self.curLengthInst();
          var hookY = g.yTop + lInst * g.ppm + 10;
          if (Math.hypot(p.x - g.springX, p.y - hookY) < 90 || p.x < g.rulerX + 10) {
            self.setWeights(self.nWeights + 1);
          }
        } else if (d.kind === 'stack') {
          if (p.x > g.rulerX + 10 || Math.abs(p.x - g.springX) > 48) {
            self.setWeights(self.nWeights - 1);
          }
        }
        self.stage.invalidate('fg');
      }
    });
  };

  /* ---------- 侧栏与数据分析 ---------- */
  Bench.prototype.updateReadout = function () {
    if (!this.readoutEl) return;
    var F = this.curForce();
    var lShow = this.curReading(0);
    var l0Ref = this.l0Measured;
    var xShow = l0Ref != null ? lShow - l0Ref : NaN;
    var overloaded = F > this.spring.fYield;
    var damaged = this.fMax > this.spring.fYield;

    var statusHtml = overloaded ? '<span class="warn-txt">⚠ 超出弹性限度</span>'
      : damaged ? '<span class="warn-txt">⚠ 存在永久伸长</span>'
      : this.oscAmp ? '<span style="color:#9A5A00;font-weight:700">振动中…</span>'
      : '<span style="color:#17784F;font-weight:700">静止 ✓</span>';

    this.readoutEl.innerHTML = '钩码 <b>' + this.nWeights + ' 个</b>（<i>F</i> = <b>' + F.toFixed(2) + ' N</b>） · ' + statusHtml + '<br>' +
      (this.guided()
        ? '长度读数请从指针与标尺获得并手工提交；已记原长 <b>' + (l0Ref != null ? cmStr(l0Ref) + ' cm' : '未测') + '</b>。'
        : '示数 <i>l</i> = <b>' + cmStr(lShow) + ' cm</b> · 原长 <i>l</i>₀ = <b>' + (l0Ref != null ? cmStr(l0Ref) + ' cm' : '未测') + '</b> · 伸长 <i>x</i> = <b>' + (isFinite(xShow) ? cmStr(xShow) + ' cm' : '—') + '</b>');
  };

  Bench.prototype.renderSide = function () {
    var self = this, side = this.side;
    ML.clear(side);
    this.readoutEl = h('div.m02-readout');
    this.updateReadout();
    side.appendChild(this.readoutEl);

    var ctl = h('div.side-ctl');
    if (this.pendingReading) {
      var readingInput = h('input', { type: 'text', inputmode: 'decimal', placeholder: '例如 13.14', 'aria-label': '弹簧长度读数（cm）', style: { width: '100px' } });
      ctl.appendChild(h('div.side-row', h('span.side-l', this.pendingReading.kind === 'l0' ? '原长 l₀' : '当前长度 l'), readingInput, h('span', 'cm'),
        h('button.btn.primary.sm', { type: 'button', onclick: function () { self.confirmReading(readingInput.value); } }, '提交读数')));
      ctl.appendChild(h('div.side-tip', '请正视指针，借助标尺放大观察；毫米刻度尺以 cm 记录时要保留两位小数。'));
    }
    ctl.appendChild(h('div.side-row',
      h('span.side-l', '钩码'),
      h('button.chip', { type: 'button', 'aria-label': '减少1个50g钩码', disabled: this.nWeights <= 0, onclick: function () { self.setWeights(self.nWeights - 1); } }, '−1 钩码'),
      h('b.side-v', this.nWeights + ' 个'),
      h('button.chip', { type: 'button', 'aria-label': '增加1个50g钩码', disabled: this.nWeights >= 10, onclick: function () { self.setWeights(self.nWeights + 1); } }, '+1 钩码'),
      h('button.chip', { type: 'button', disabled: this.nWeights === 0, onclick: function () { self.setWeights(0); } }, '清空')));

    ctl.appendChild(h('div.side-row',
      h('span.side-l', '原长'),
      h('button.chip' + (this.l0Measured != null && this.l0Mode === 'hang' ? '.on' : ''), {
        type: 'button',
        onclick: function () {
          self.l0Mode = 'hang';
          if (self.nWeights === 0 && !self.oscAmp) self.measureL0();
          else { self.updateDone(); self.stage.invalidate(); self.renderSide(); }
        }
      }, '竖直测 l₀'),
      h('button.chip' + (this.l0Mode === 'horiz' ? '.on' : ''), {
        type: 'button',
        onclick: function () {
          if (self.guided()) { self.block('弹簧有自重，必须竖直悬挂测自然原长 l₀，不能水平平放测量！', 'E2'); return; }
          self.l0Mode = 'horiz'; self.measureL0(); self.stage.invalidate();
        }
      }, '水平测 l₀'),
      h('button.chip', {
        type: 'button',
        onclick: function () {
          var lmMm = Math.round(self.curReading(0) * 10000) / 10;
          openRulerModal((lmMm / 10).toFixed(2), lmMm);
        }
      }, '标尺练读')));

    ctl.appendChild(h('div.side-row',
      h('span.side-l', '视线'),
      h('button.chip' + (this.viewAngleDeg === 0 ? '.on' : ''), {
        type: 'button',
        onclick: function () { self.viewAngleDeg = 0; self.updateDone(); self.stage.invalidate('fg'); self.renderSide(); }
      }, '正视 0°'),
      h('button.chip' + (this.viewAngleDeg === 18 ? '.on' : ''), {
        type: 'button',
        onclick: function () {
          if (self.guided()) { self.block('读数时眼睛必须正视指针与刻度线，俯视会引起偏大视差！', 'E4'); return; }
          self.viewAngleDeg = self.viewAngleDeg === 18 ? 0 : 18;
          self.updateDone(); self.stage.invalidate('fg'); self.renderSide();
        }
      }, '俯视 +18°'),
      h('button.chip' + (this.rulerTiltDeg === 12 ? '.on' : ''), {
        type: 'button',
        onclick: function () {
          if (self.guided()) { self.block('毫米刻度尺必须竖直放置，倾斜会使读数偏大、k 偏小！', 'E5'); return; }
          self.rulerTiltDeg = self.rulerTiltDeg ? 0 : 12;
          self.updateDone(); self.stage.invalidate(); self.renderSide();
        }
      }, this.rulerTiltDeg ? '已倾斜 12°' : '尺竖直 0°')));

    ctl.appendChild(h('div.side-acts',
      h('button.btn.primary', { type: 'button', onclick: function () { self.recordRow(); } }, '记录当前数据'),
      !this.guided() ? h('button.btn', { type: 'button', onclick: function () { self.collectSix(); } }, '自由演示：采齐 6 组') : null,
      h('button.btn.cyan', {
        type: 'button',
        disabled: this.rows.length < 2,
        onclick: function () {
          self.showAna = !self.showAna;
          if (self.showAna) self.renderAnalysis(false);
          else { self.analysis.hidden = true; self.renderSide(); }
        }
      }, this.showAna ? '收起分析' : '查看数据分析 (' + this.rows.length + ')'),
      h('button.btn', { type: 'button', onclick: function () { self.resetExperiment(false); ML.toast('已更换新弹簧并清零数据'); } }, '换新弹簧/重置')));
    side.appendChild(ctl);

    if (this.guided()) {
      side.appendChild(h('div.side-k', '实验步骤'));
      var ids = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
      var curId = null;
      for (var i = 0; i < ids.length; i++) { if (!this.done[ids[i]]) { curId = ids[i]; break; } }
      var ol = h('ol.steps', ids.map(function (id) {
        var p = PROC[id], ok = !!self.done[id], isCur = id === curId;
        return h('li' + (ok ? '.ok' : '') + (isCur ? '.cur' : ''),
          h('div.st-t', (ok ? '✓ ' : isCur ? '▸ ' : '') + p.title),
          h('div.st-how', { html: M.tex(p.how) }),
          p.why ? h('div.st-why', { html: M.tex('理由：' + p.why) }) : null,
          p.errorId ? h('button.link.sm', { type: 'button', onclick: function () { openTry(p.errorId); } }, '为什么？试一试 →') : null);
      }));
      side.appendChild(ol);
      var curLi = ol.querySelector('li.cur');
      if (curLi && side.scrollHeight > side.clientHeight) {
        side.scrollTop = Math.max(0, curLi.offsetTop - side.offsetTop - 44);
      }
    } else {
      var overloaded = this.curForce() > this.spring.fYield;
      var damaged = this.fMax > this.spring.fYield;
      var tags = [];
      if (damaged || overloaded) tags.push('E1');
      if (this.l0Mode === 'horiz') tags.push('E2');
      if (this.oscAmp || this.oscSampleMode) tags.push('E3');
      if (this.viewAngleDeg !== 0) tags.push('E4');
      if (this.rulerTiltDeg !== 0) tags.push('E5');
      var tBox = h('div.ana-tags');
      if (tags.length) {
        tags.forEach(function (eid) {
          tBox.appendChild(h('button.tag.err', { type: 'button', onclick: function () { openTry(eid); } }, '⚠ ' + ERR[eid].name));
        });
      } else {
        tBox.appendChild(h('span.tag.ok', '✓ 当前操作参数规范'));
      }
      side.appendChild(tBox);
      side.appendChild(h('div.side-tip', '自由模式：可故意挂满 10 个钩码超弹性限度、水平测 l₀、俯视 18°、倾斜刻度尺或振动中读数，再看下方拟合图像变化。'));
    }
  };

  Bench.prototype.renderAnalysis = function (noScroll) {
    var self = this, el = this.analysis;
    if (!this.rows.length) { el.hidden = true; return; }
    this.showAna = true;
    el.hidden = false;
    ML.clear(el);

    var tagSet = [];
    this.rows.forEach(function (r) {
      (r.tags || []).forEach(function (t) { if (tagSet.indexOf(t) < 0 && ERR[t]) tagSet.push(t); });
    });
    if (this.badConnect && tagSet.indexOf('E6') < 0) tagSet.push('E6');

    var tagBar = h('div.ana-tags');
    if (tagSet.length) {
      tagBar.appendChild(h('span.tag.err', '⚠ 数据存在操作偏差'));
      tagSet.forEach(function (id) {
        tagBar.appendChild(h('button.tag', { type: 'button', onclick: function () { openTry(id); } }, ERR[id].name + ' → 试一试'));
      });
    } else {
      tagBar.appendChild(h('span.tag.ok', '✓ 数据采集规范'));
    }
    el.appendChild(h('div.ana-head',
      h('h2.ana-h', '弹簧实验数据与图像拟合（' + this.spring.name + '）'),
      h('div.side-row', tagBar, h('button.btn.sm', {
        type: 'button',
        onclick: function () { self.showAna = false; el.hidden = true; self.renderSide(); }
      }, '收起分析'))));

    // 左卡：数据表
    var leftCard = h('div.ana-card');
    leftCard.appendChild(h('h3', '实验记录表（已测原长 l₀ = ' + cmStr(this.rows[0].l0) + ' cm）'));
    var trs = this.rows.map(function (r, idx) {
      var st = r.overloaded ? '超限!' : r.osc ? '振动采样' : '正常';
      var ratio = r.x > 0.002 ? (r.F / r.x).toFixed(1) : '—';
      return h('tr' + ((r.overloaded || r.osc) ? '.hl' : ''),
        h('td', String(idx + 1)),
        h('td', String(r.n)),
        h('td', r.F.toFixed(2)),
        h('td', cmStr(r.l)),
        h('td', cmStr(r.x)),
        h('td', ratio),
        h('td', st));
    });
    leftCard.appendChild(h('div.tbl-wrap', { tabindex: '0', role: 'region', 'aria-label': '弹簧实验数据表' },
      h('table.dt.ana-tbl',
        h('tr', h('th', '组次'), h('th', '钩码'), h('th', 'F / N'), h('th', 'l / cm'), h('th', 'x / cm'), h('th', 'F/x'), h('th', '状态')),
        trs)));

    // 右卡：F-x / F-l 拟合图
    var rightCard = h('div.ana-card');
    var modeRow = h('div.side-row',
      h('button.chip' + (this.chartMode === 'fx' ? '.on' : ''), { type: 'button', onclick: function () { self.chartMode = 'fx'; self.renderAnalysis(true); } }, 'F − x 图像'),
      h('button.chip' + (this.chartMode === 'fl' ? '.on' : ''), { type: 'button', onclick: function () { self.chartMode = 'fl'; self.renderAnalysis(true); } }, 'F − l 图像'),
      h('button.chip' + (this.badConnect ? '.on' : ''), {
        type: 'button',
        onclick: function () { self.badConnect = !self.badConnect; self.renderAnalysis(true); }
      }, this.badConnect ? '折线硬连中 (错E6)' : '对比：折线硬连'));
    rightCard.appendChild(modeRow);

    var linRows = this.rows.filter(function (r) { return !r.overloaded; });
    var overRows = this.rows.filter(function (r) { return r.overloaded; });
    var chartHost = h('div');
    rightCard.appendChild(chartHost);

    var series = [];
    var fitInfoHtml = '';
    if (this.chartMode === 'fx') {
      var linPts = linRows.map(function (r) { return [r.x, r.F]; });
      var overPts = overRows.map(function (r) { return [r.x, r.F]; });
      var ffx = SP.fitFX(linRows.length >= 2 ? linRows : this.rows);
      series.push({
        pts: linPts, fit: !this.badConnect && linPts.length >= 2, color: '#1661FF',
        label: '线性段拟合 k = ' + (isFinite(ffx.k) ? ffx.k.toFixed(2) : '—') + ' N/m'
      });
      if (overPts.length) {
        series.push({ pts: overPts, color: '#C7374B', mark: 'x', label: '超限点（向 x 轴弯曲，应舍去）' });
      }
      if (this.badConnect) {
        for (var bi = 1; bi < this.rows.length; bi++) {
          series.push({ pts: [], line: [[this.rows[bi - 1].x, this.rows[bi - 1].F], [this.rows[bi].x, this.rows[bi].F]], color: '#C7374B', dash: true });
        }
      }
      var chX = new ML.Chart(chartHost, { xLabel: '伸长量 x / m', yLabel: '弹力 F / N', height: 240, paper: true });
      chX.set(series);
      fitInfoHtml = '<i>F</i>-<i>x</i> 线性段斜率 <b><i>k</i> = ' + (isFinite(ffx.k) ? ffx.k.toFixed(2) : '—') + ' N/m</b>（理论 ' + this.spring.k.toFixed(1) + ' N/m），<i>x</i> 轴截距 = <b>' + cmStr(ffx.xIntercept) + ' cm</b>，<i>R</i>² = ' + (isFinite(ffx.r2) ? ffx.r2.toFixed(5) : '—');
    } else {
      var linPtsL = linRows.map(function (r) { return [r.l, r.F]; });
      var overPtsL = overRows.map(function (r) { return [r.l, r.F]; });
      var ffl = SP.fitFL(linRows.length >= 2 ? linRows : this.rows);
      series.push({
        pts: linPtsL, fit: !this.badConnect && linPtsL.length >= 2, color: '#25A870',
        label: '线性段拟合 k = ' + (isFinite(ffl.k) ? ffl.k.toFixed(2) : '—') + ' N/m'
      });
      if (overPtsL.length) {
        series.push({ pts: overPtsL, color: '#C7374B', mark: 'x', label: '超限点（向 l 轴弯曲）' });
      }
      if (this.badConnect) {
        for (var bj = 1; bj < this.rows.length; bj++) {
          series.push({ pts: [], line: [[this.rows[bj - 1].l, this.rows[bj - 1].F], [this.rows[bj].l, this.rows[bj].F]], color: '#C7374B', dash: true });
        }
      }
      var chL = new ML.Chart(chartHost, { xLabel: '总长度 l / m', yLabel: '弹力 F / N', height: 240, paper: true });
      chL.set(series);
      fitInfoHtml = '<i>F</i>-<i>l</i> 线性段斜率 <b><i>k</i> = ' + (isFinite(ffl.k) ? ffl.k.toFixed(2) : '—') + ' N/m</b>，横轴截距（拟合原长）= <b>' + cmStr(ffl.l0Fit) + ' cm</b>（真实悬挂原长 ' + cmStr(SP.l0Hang(this.spring, SP.G)) + ' cm），<i>R</i>² = ' + (isFinite(ffl.r2) ? ffl.r2.toFixed(5) : '—');
    }
    rightCard.appendChild(h('div.formula', { html: fitInfoHtml }));
    if (this.l0Mode === 'horiz') {
      rightCard.appendChild(h('div.warnline', { html: '⚠ 水平测原长使 <i>F</i>-<i>x</i> 在正半轴产生截距 Δ<i>l</i><sub>自重</sub> ≈ ' + cmStr(SP.selfStretch(this.spring, SP.G)) + ' cm，但斜率 <i>k</i> 依然准确！' }));
    }
    if (overRows.length) {
      rightCard.appendChild(h('div.warnline', '⚠ 末端数据已超出弹性限度，图线明显向横轴弯曲，求劲度系数时已自动剔除超限点。'));
    }

    el.appendChild(h('div.ana-grid', leftCard, rightCard));
    this.renderSide();
    if (!noScroll) el.scrollIntoView({ behavior: ML.perf.low ? 'auto' : 'smooth', block: 'nearest' });
  };

  /* =====================================================================
   *  ③ 诊·误差：四拍试一试 & 结果反推适配器
   * ===================================================================== */
  var adapter = {
    compare: function (err, area, done) {
      var tids = [], loops = [];
      function defer(fn, ms) {
        var id = setTimeout(function () { if (area && area.isConnected) fn(); }, ms);
        tids.push(id);
      }

      if (err.id === 'E1') {
        var sp1 = SP.getSpring('std');
        var ptsEl = [], ptsActual = [], ptsUnload = [];
        for (var n = 0; n <= 10; n++) {
          var F = n * SP.WEIGHT_M * SP.G;
          ptsEl.push([F / sp1.k, F]);
          ptsActual.push([SP.elongation(sp1, F, F).xTotal, F]);
        }
        var fPeak = 10 * SP.WEIGHT_M * SP.G;
        for (var nu = 10; nu >= 0; nu -= 2) {
          var Fu = nu * SP.WEIGHT_M * SP.G;
          ptsUnload.push([SP.elongation(sp1, Fu, fPeak).xTotal, Fu]);
        }
        var ch1 = new ML.Chart(area, { xLabel: '伸长量 x / m', yLabel: '弹力 F / N', height: 215, paper: true, x: [0, 0.135], y: [0, 5.2] });
        ch1.set([
          { pts: ptsEl, line: [[0, 0], [0.105, 0.105 * sp1.k]], color: '#25A870', label: '弹性限度内（F = kx，直线）' },
          { pts: ptsActual, color: '#C7374B', mark: 'x', label: '超限加载（4.90 N > 4.00 N，向 x 轴弯曲）' },
          { pts: ptsUnload, color: '#E69B2D', dash: true, line: [ptsUnload[0], ptsUnload[ptsUnload.length - 1]], label: '卸载回 0 N（永久伸长 1.11 cm）' }
        ]);
        var xPermCm = cmStr(SP.elongation(sp1, 0, fPeak).xPerm);
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '状态'), h('th', '4.90 N 时总伸长'), h('th', '切线劲度 dF/dx'), h('th', '卸载回 0 N 剩余伸长')),
          h('tr', h('td', '弹性限度内理想线'), h('td', '10.00 cm'), h('td', '49.0 N/m'), h('td', '0.00 cm')),
          h('tr.hl', h('td', '超弹性限度加载'), h('td', cmStr(SP.elongation(sp1, fPeak, fPeak).xTotal) + ' cm'), h('td', '15.3 N/m（弯曲!）'), h('td', xPermCm + ' cm（永久变形）'))));
        defer(done, 120);
      } else if (err.id === 'E2') {
        var sp2 = SP.getSpring('heavy');
        var ptsH = [], ptsZ = [], rowsH = [], rowsZ = [];
        for (var n2 = 0; n2 <= 6; n2++) {
          var mH = SP.measurePoint(sp2, n2, { ideal: true, l0Mode: 'hang' });
          var mZ = SP.measurePoint(sp2, n2, { ideal: true, l0Mode: 'horiz' });
          ptsH.push([mH.x * 100, mH.F]); ptsZ.push([mZ.x * 100, mZ.F]);
          rowsH.push(mH); rowsZ.push(mZ);
        }
        var fH = SP.fitFX(rowsH), fZ = SP.fitFX(rowsZ);
        var ch2 = new ML.Chart(area, { xLabel: '记录伸长量 x / cm', yLabel: '弹力 F / N', height: 210, paper: true, x: [0, 7.2], y: [-0.4, 3.2] });
        ch2.set([
          { pts: ptsH, fit: true, color: '#25A870', label: '竖直测 l₀：过原点，k=' + fH.k.toFixed(1) + ' N/m' },
          { pts: ptsZ, fit: true, color: '#C7374B', mark: 'x', label: '水平测 l₀：x 截距=+' + (fZ.xIntercept * 100).toFixed(2) + ' cm，k=' + fZ.k.toFixed(1) + ' N/m' }
        ]);
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '测原长方式 (60 g 弹簧)'), h('th', '原长读数 l₀'), h('th', 'F-x 图像 x 轴截距'), h('th', '拟合斜率 k'), h('th', '单点 F/x (1钩码)')),
          h('tr', h('td', '竖直悬挂测 l₀'), h('td', cmStr(SP.l0Hang(sp2, SP.G)) + ' cm'), h('td', '0.00 cm'), h('td', fH.k.toFixed(2) + ' N/m'), h('td', (rowsH[1].F / rowsH[1].x).toFixed(1) + ' N/m')),
          h('tr.hl', h('td', '水平平放测 l₀'), h('td', cmStr(sp2.l0Horiz) + ' cm'), h('td', '+' + (fZ.xIntercept * 100).toFixed(2) + ' cm'), h('td', fZ.k.toFixed(2) + ' N/m（准确）'), h('td', (rowsZ[1].F / rowsZ[1].x).toFixed(1) + ' N/m（偏小）'))));
        defer(done, 120);
      } else if (err.id === 'E3') {
        var sp3 = SP.getSpring('std');
        var oscWrap = h('div.try-stage-wrap'); oscWrap.style.height = '135px'; area.appendChild(oscWrap);
        var stg3 = new ML.stage.Stage(oscWrap, { layers: ['bg'] });
        var tOscNow = 0;
        var lp3 = new ML.stage.Loop(function (dt) {
          if (!oscWrap.isConnected) return false;
          tOscNow += dt;
          stg3.invalidate('bg');
          if (tOscNow >= 2.2) return false;
          return true;
        });
        loops.push(lp3);
        lp3.start();
        stg3.on('bg', function (ctx, w, hh) {
          ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
          var padL = 56, padR = 16, midY = hh * 0.54, gw = w - padL - padR;
          ctx.strokeStyle = '#94A3B8'; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(padL, midY); ctx.lineTo(padL + gw, midY); ctx.stroke(); ctx.setLineDash([]);
          D.text(ctx, '平衡位置', padL - 6, midY + 4, { align: 'right', size: 10.5, color: '#4A5B73' });
          D.text(ctx, '挂钩码后的阻尼上下振动 Δx(t)', padL, 16, { size: 11.5, weight: 700, color: '#1661FF' });
          ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 2; ctx.beginPath();
          var maxT = 2.2;
          for (var i = 0; i <= 120; i++) {
            var tt = (i / 120) * Math.min(maxT, tOscNow + 0.05);
            var dy = SP.oscPos(0, 0.015, tt, sp3, 0.20);
            var px = padL + (tt / maxT) * gw, py = midY - dy * 2400;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        });

        var good3 = [], bad3 = SP.sampleOscillatingSeries(sp3, [1, 2, 3, 4, 5, 6], { ideal: true, oscAmp: 0.015, seed: 83 });
        for (var i3 = 1; i3 <= 6; i3++) {
          good3.push(SP.measurePoint(sp3, i3, { ideal: true }));
        }
        var fG3 = SP.fitFX(good3), fB3 = SP.fitFX(bad3);
        var ch3 = new ML.Chart(area, { xLabel: '伸长量 x / m', yLabel: '弹力 F / N', height: 185, paper: true, x: [0, 0.08], y: [0, 3.2] });
        ch3.set([
          { pts: good3.map(function (r) { return [r.x, r.F]; }), fit: true, color: '#25A870', label: '静止后读数 (R²=' + fG3.r2.toFixed(5) + ')' },
          { pts: bad3.map(function (r) { return [r.x, r.F]; }), fit: true, color: '#C7374B', mark: 'x', label: '振动中读数 (R²=' + fB3.r2.toFixed(4) + ')' }
        ]);
        defer(done, 150);
      } else if (err.id === 'E4') {
        var sp4 = SP.getSpring('std');
        var stg4 = makeTryStage(area, 145);
        stg4.on('bg', function (ctx, w, hh) {
          ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
          var rx = Math.round(w * 0.64), pxTip = rx - 34, py = Math.round(hh * 0.50);
          ctx.fillStyle = '#E9EFF6'; ctx.strokeStyle = '#9AA8B8'; ctx.fillRect(rx, 14, 34, hh - 28); ctx.strokeRect(rx, 14, 34, hh - 28);
          for (var k = -4; k <= 4; k++) {
            var yk = py + k * 11;
            ctx.strokeStyle = '#10233F'; ctx.beginPath(); ctx.moveTo(rx, yk); ctx.lineTo(rx + (k === 0 ? 15 : 8), yk); ctx.stroke();
          }
          D.text(ctx, '0 在上 ↓', rx + 40, 26, { size: 11, color: '#4A5B73' });
          ctx.strokeStyle = '#10233F'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(pxTip - 50, py); ctx.lineTo(pxTip, py); ctx.stroke();
          ctx.strokeStyle = '#25A870'; ctx.lineWidth = 1.8; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(pxTip - 110, py); ctx.lineTo(rx, py); ctx.stroke();
          var hitY = py + 28;
          ctx.strokeStyle = '#C7374B'; ctx.beginPath(); ctx.moveTo(pxTip - 110, py - 42); ctx.lineTo(rx, hitY); ctx.stroke(); ctx.setLineDash([]);
          D.text(ctx, '正视 0°（准确）', pxTip - 116, py + 4, { align: 'right', size: 11.5, weight: 700, color: '#17784F' });
          D.text(ctx, '俯视 +18°', pxTip - 116, py - 38, { align: 'right', size: 11.5, weight: 700, color: '#C7374B' });
          D.text(ctx, '真实刻度', rx + 40, py + 4, { size: 11, weight: 700, color: '#17784F' });
          D.text(ctx, '俯视读数 (+0.39 cm)', rx + 40, hitY + 4, { size: 11, weight: 700, color: '#C7374B' });
        });
        var p4Ok = [], p4Bad = [];
        for (var i4 = 0; i4 <= 5; i4++) {
          var rO4 = SP.measurePoint(sp4, i4, { ideal: true, viewAngleDeg: 0 });
          var rB4 = SP.measurePoint(sp4, i4, { ideal: true, viewAngleDeg: 18 });
          p4Ok.push([rO4.l * 100, rO4.F]); p4Bad.push([rB4.l * 100, rB4.F]);
        }
        var ch4 = new ML.Chart(area, { xLabel: '长度读数 l / cm', yLabel: '弹力 F / N', height: 175, paper: true, x: [13.5, 20.5], y: [0, 2.7] });
        ch4.set([
          { pts: p4Ok, fit: true, color: '#25A870', label: '正视 0°：l₀ = 14.24 cm' },
          { pts: p4Bad, fit: true, color: '#C7374B', mark: 'x', label: '俯视 +18°：读数系统偏大 +0.39 cm' }
        ]);
        defer(done, 120);
      } else if (err.id === 'E5') {
        var sp5 = SP.getSpring('std');
        var rOk5 = [], rBad5 = [];
        for (var i5 = 0; i5 <= 6; i5++) {
          rOk5.push(SP.measurePoint(sp5, i5, { ideal: true, rulerTiltDeg: 0 }));
          rBad5.push(SP.measurePoint(sp5, i5, { ideal: true, rulerTiltDeg: 12 }));
        }
        var fO5 = SP.fitFX(rOk5), fB5 = SP.fitFX(rBad5);
        var ch5 = new ML.Chart(area, { xLabel: '伸长量 x / m', yLabel: '弹力 F / N', height: 205, paper: true, x: [0, 0.068], y: [0, 3.2] });
        ch5.set([
          { pts: rOk5.map(function (r) { return [r.x, r.F]; }), fit: true, color: '#25A870', label: '刻度尺竖直：k = ' + fO5.k.toFixed(2) + ' N/m' },
          { pts: rBad5.map(function (r) { return [r.x, r.F]; }), fit: true, color: '#C7374B', mark: 'x', label: '倾斜 12°：k = ' + fB5.k.toFixed(2) + ' N/m（偏小 2.2%）' }
        ]);
        area.appendChild(h('div.cmp-note', { html: '斜尺读数 <i>x</i><sub>测</sub> = <i>x</i><sub>真</sub> / cos12° ≈ 1.022 <i>x</i><sub>真</sub>，所以测得斜率 <i>k</i><sub>测</sub> = <i>k</i> cos12° = <b>' + fB5.k.toFixed(2) + ' N/m</b>（比真值 49.00 N/m 偏小 2.19%）。' }));
        defer(done, 120);
      } else if (err.id === 'E6') {
        var sp6 = SP.getSpring('std');
        var raw6 = [];
        for (var i6 = 1; i6 <= 6; i6++) {
          var mp6 = SP.measurePoint(sp6, i6, { ideal: true });
          if (i6 === 3) mp6.x += 0.0042; // 故意混入 1 个读错的坏点
          if (i6 === 6) mp6 = SP.measurePoint(sp6, 10, { ideal: true }); // 混入 1 个超限弯曲点
          raw6.push(mp6);
        }
        var good6 = raw6.filter(function (_, idx) { return idx !== 2 && idx !== 5; });
        var fG6 = SP.fitFX(good6);
        var series6 = [
          { pts: good6.map(function (r) { return [r.x, r.F]; }), fit: true, color: '#25A870', label: '舍坏点与超限点拟合：k = ' + fG6.k.toFixed(1) + ' N/m' },
          { pts: [raw6[2], raw6[5]].map(function (r) { return [r.x, r.F]; }), color: '#C7374B', mark: 'x', label: '坏点 / 超限点（折线硬连会严重失真）' }
        ];
        for (var bi6 = 1; bi6 < raw6.length; bi6++) {
          series6.push({ pts: [], line: [[raw6[bi6 - 1].x, raw6[bi6 - 1].F], [raw6[bi6].x, raw6[bi6].F]], color: '#E69B2D', dash: true });
        }
        var ch6 = new ML.Chart(area, { xLabel: '伸长量 x / m', yLabel: '弹力 F / N', height: 215, paper: true, x: [0, 0.13], y: [0, 5.2] });
        ch6.set(series6);
        area.appendChild(h('div.cmp-note', '橙色折线把失误坏点和超限点硬连在一起，局部斜率剧烈失真；绿色平滑直线舍去坏点后准确恢复 k = 49.0 N/m。'));
        defer(done, 120);
      }

      return function () {
        tids.forEach(function (tid) { clearTimeout(tid); });
        tids.length = 0;
        loops.forEach(function (lp) { lp.stop(); });
        loops.length = 0;
      };
    },
    show: function (c, vis) {
      var sh = c.show || {};
      if (sh.type === 'fx-intercept') {
        var spH = SP.getSpring('heavy');
        var ptsH = [];
        for (var i = 0; i <= 5; i++) {
          var m = SP.measurePoint(spH, i, { ideal: true, l0Mode: 'horiz' });
          ptsH.push([m.x * 100, m.F]);
        }
        var ch = new ML.Chart(vis, { xLabel: 'x / cm', yLabel: 'F / N', height: 185, paper: true, x: [0, 6.0], y: [-0.35, 2.8] });
        ch.set([{ pts: ptsH, fit: true, color: '#C7374B', label: 'F-x 图（横截距 x₀ = +0.60 cm）' }]);
      } else if (sh.type === 'fx-bend') {
        var spB = SP.getSpring('std');
        var ptsB = [];
        for (var j = 0; j <= 10; j++) {
          var F = j * SP.WEIGHT_M * SP.G;
          ptsB.push([SP.elongation(spB, F, F).xTotal * 100, F]);
        }
        var ch2 = new ML.Chart(vis, { xLabel: 'x / cm', yLabel: 'F / N', height: 185, paper: true, x: [0, 13.0], y: [0, 5.2] });
        ch2.set([
          { pts: [], line: [[0, 0], [10.4, 5.1]], color: '#94A3B8', dash: true, label: '线性参考线' },
          { pts: ptsB, color: '#C7374B', label: '实测数据（F > 4.00 N 后向 x 轴弯曲）' }
        ]);
      } else if (sh.type === 'xv-bucket') {
        var Vs = [0, 50, 100, 150, 200, 250, 300];
        var ptsV = Vs.map(function (v) { return [v, 0.56 + 0.02 * v]; });
        var ch3 = new ML.Chart(vis, { xLabel: '加水量 V / mL', yLabel: '伸长量 x / cm', height: 185, paper: true, x: [0, 320], y: [0, 7.0] });
        ch3.set([{ pts: ptsV, fit: true, color: '#1661FF', label: 'x-V 图像（截距 0.56 cm，斜率 200 m⁻²）' }]);
      } else if (sh.type === 'fl-vs-fx') {
        var spF = SP.getSpring('heavy');
        var ptsFL = [], ptsFX = [];
        for (var q = 0; q <= 5; q++) {
          var mf = SP.measurePoint(spF, q, { ideal: true, l0Mode: 'horiz' });
          ptsFL.push([mf.l * 100, mf.F]);
          ptsFX.push([mf.x * 100, mf.F]);
        }
        var ch4 = new ML.Chart(vis, { xLabel: '长度或伸长量 / cm', yLabel: 'F / N', height: 185, paper: true, x: [0, 21], y: [-0.4, 2.8] });
        ch4.set([
          { pts: ptsFX, fit: true, color: '#C7374B', label: '甲：F-x（截距 +0.60 cm）' },
          { pts: ptsFL, fit: true, color: '#25A870', label: '乙：F-l（截距 l₀ = 14.60 cm）' }
        ]);
      }
    },
    restore: function () {
      if (!bench) { S.mode = 'guided'; ML.store.save(); return; }
      bench.setMode('guided');
      bench.setSpring('std', true);
      bench.setBanner(null);
    },
    replay: function (errId) {
      var e = ERR[errId]; if (!e) return;
      shell.go('bench');
      bench.settleNow();
      bench.setMode('free', true);
      var cfg = e.config || {};
      bench.setSpring(cfg.springId || 'std', true);
      bench.l0Mode = cfg.l0Mode || 'hang';
      bench.viewAngleDeg = cfg.viewAngleDeg || 0;
      bench.rulerTiltDeg = cfg.rulerTiltDeg || 0;
      bench.badConnect = !!cfg.badLineConnect;
      if (cfg.weights) {
        bench.nWeights = cfg.weights;
        bench.fMax = cfg.weights * SP.WEIGHT_M * SP.G;
      }
      bench.oscSampleMode = !!cfg.oscillating;
      if (cfg.oscillating) {
        bench.nWeights = 4;
        bench.oscAmp = 0.015;
        bench.oscT = 0;
        bench.loop.start();
      }
      bench.updateDone();
      bench.stage.invalidate();
      bench.renderSide();
      bench.setBanner('<b>复现：' + e.name + '</b>　已切换为自由模式并预设条件，可点击“一键采齐 6 组”或增减钩码直接观察图像与数据变化。');
      if (shell.main) shell.main.scrollTop = 0;
    }
  };

  function makeTryStage(area, height) {
    var wrap = h('div.try-stage-wrap');
    if (height) wrap.style.height = height + 'px';
    area.appendChild(wrap);
    return new ML.stage.Stage(wrap, { layers: ['bg'] });
  }

  function openTry(id) {
    var e = ERR[id];
    if (e) ML.TryIt(e, adapter, e.noteId && PROC[e.noteId] ? '<b>' + PROC[e.noteId].title + '：</b>' + PROC[e.noteId].how : '');
  }

  /* =====================================================================
   *  ① 学·原理：6 页交互小部件
   * ===================================================================== */
  function learnWidget(p, card) {
    if (!p.widget) return;
    var box = h('div.learn-widget'); card.appendChild(box);
    if (p.widget === 'hooke-demo') {
      var nw = 2, sp = SP.getSpring('std');
      var sw = h('div.side-row', h('span.side-l', '挂钩码数'));
      [0, 1, 2, 3, 4, 5].forEach(function (n) {
        sw.appendChild(h('button.chip' + (n === nw ? '.on' : ''), { type: 'button', data: { n: String(n) }, onclick: function () { sel(n); } }, n + ' 个'));
      });
      var stgW = h('div.m02-w-stage');
      var cap = h('div.cmp-note');
      box.appendChild(sw); box.appendChild(stgW); box.appendChild(cap);
      var stg = new ML.stage.Stage(stgW, { layers: ['bg'] });
      stg.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var F = nw * SP.WEIGHT_M * SP.G;
        var l0 = SP.l0Hang(sp, SP.G), lNow = SP.lengthAt(sp, F, F, SP.G), x = lNow - l0;
        var sx = Math.round(w * 0.34), yTop = 18, ppm = (hh - 54) / 0.23;
        var y0 = yTop + l0 * ppm, yN = yTop + lNow * ppm;
        ctx.fillStyle = '#596574'; ctx.fillRect(sx - 28, yTop - 6, 56, 6);
        drawCoilSpring(ctx, sx, yTop, yN, 12, 12, '#1661FF');
        ctx.strokeStyle = '#94A3B8'; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(sx + 16, y0); ctx.lineTo(sx + 120, y0); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, yN); ctx.lineTo(sx + 92, yN); ctx.stroke();
        drawVerticalRuler(ctx, sx + 92, yTop, ppm, 22, 0);
        for (var i = 0; i < nw; i++) {
          ctx.fillStyle = '#8E99A6'; ctx.fillRect(sx - 11, yN + 5 + i * 7, 22, 5.5);
        }
        D.text(ctx, '原长 l₀ = ' + cmStr(l0) + ' cm', sx + 136, y0 + 4, { size: 11.5, color: '#4A5B73' });
        if (nw > 0) D.text(ctx, '伸长 x = ' + cmStr(x) + ' cm', sx + 136, yN + 4, { size: 12, weight: 700, color: '#C7374B' });
      });
      function sel(n) {
        nw = n;
        ML.$$('.chip', sw).forEach(function (c) { c.classList.toggle('on', c.dataset.n === String(n)); });
        var F = nw * SP.WEIGHT_M * SP.G;
        var x = SP.elongation(sp, F, F).xTotal;
        cap.innerHTML = '钩码 <b>' + nw + ' 个</b>：弹力 <i>F</i> = <b>' + F.toFixed(2) + ' N</b>，伸长量 <i>x</i> = <b>' + cmStr(x) + ' cm</b>' +
          (nw > 0 ? '，比值 <i>F</i>/<i>x</i> = <b>' + (F / x).toFixed(1) + ' N/m</b>（保持恒定！）' : '（未挂钩码时自然伸长 <i>x</i> = 0.00 cm）');
        stg.invalidate('bg');
      }
      sel(2);
    } else if (p.widget === 'selfweight-demo') {
      var l0Mode = 'hang', spId = 'heavy';
      var bar = h('div.side-row',
        h('button.chip.on', { type: 'button', data: { m: 'hang' }, onclick: function () { l0Mode = 'hang'; update(); } }, '竖直悬挂测 l₀（规范）'),
        h('button.chip', { type: 'button', data: { m: 'horiz' }, onclick: function () { l0Mode = 'horiz'; update(); } }, '水平平放测 l₀（偏误）'),
        h('button.chip.on', { type: 'button', data: { s: 'heavy' }, onclick: function () { spId = spId === 'heavy' ? 'std' : 'heavy'; update(); } }, '弹簧：大自重 60 g'));
      var chHost = h('div'), note = h('div.cmp-note');
      box.appendChild(bar); box.appendChild(chHost); box.appendChild(note);
      function update() {
        var bs = ML.$$('.chip', bar);
        bs[0].classList.toggle('on', l0Mode === 'hang');
        bs[1].classList.toggle('on', l0Mode === 'horiz');
        bs[2].textContent = '弹簧：' + (spId === 'heavy' ? '大自重 60 g' : '轻弹簧 24 g');
        var sp = SP.getSpring(spId), pH = [], pZ = [], rH = [], rZ = [];
        for (var i = 0; i <= 5; i++) {
          var mh = SP.measurePoint(sp, i, { ideal: true, l0Mode: 'hang' });
          var mz = SP.measurePoint(sp, i, { ideal: true, l0Mode: 'horiz' });
          pH.push([mh.x * 100, mh.F]); pZ.push([mz.x * 100, mz.F]);
          rH.push(mh); rZ.push(mz);
        }
        var fZ = SP.fitFX(rZ);
        ML.clear(chHost);
        var ch = new ML.Chart(chHost, { xLabel: '伸长量 x / cm', yLabel: 'F / N', height: 190, paper: true, x: [0, 6.2], y: [-0.35, 2.7] });
        var ser = [{ pts: pH, fit: true, color: '#25A870', label: '竖直测 l₀（过原点，k=49.0 N/m）' }];
        if (l0Mode === 'horiz') ser.push({ pts: pZ, fit: true, color: '#C7374B', mark: 'x', label: '水平测 l₀（截距 +' + (fZ.xIntercept * 100).toFixed(2) + ' cm，k=49.0 N/m）' });
        ch.set(ser);
        note.innerHTML = l0Mode === 'hang'
          ? '竖直悬挂测出 <i>l</i>₀ = ' + cmStr(SP.l0Hang(sp, SP.G)) + ' cm，已经把自重伸长 Δ<i>l</i><sub>自重</sub> = ' + cmStr(SP.selfStretch(sp, SP.G)) + ' cm 扣除，<i>F</i>-<i>x</i> 直线严格过原点。'
          : '水平平放原长 ' + cmStr(sp.l0Horiz) + ' cm 未扣除自重伸长，<i>F</i>-<i>x</i> 在横轴正半轴产生截距 <b>+' + cmStr(SP.selfStretch(sp, SP.G)) + ' cm</b>，但直线斜率依然等于 <b>49.0 N/m</b>！';
      }
      update();
    } else if (p.widget === 'ruler-demo') {
      var curLen = 31.4;
      var presets = [18.5, 24.0, 31.4];
      var barR = h('div.side-row', h('span.side-l', '示例刻度'));
      var gbHost = h('div');
      var inpR = h('input.cal-inp', { type: 'text', value: '', placeholder: '如 3.14', 'aria-label': '输入毫米刻度尺读数（cm）' });
      var fbR = h('div.cal-fb', '最小分度 1 mm，估读到 0.01 cm（对齐整刻线如 2.40 cm 须补 0）；长按尺面可看 3× 放大镜。');
      box.appendChild(barR); box.appendChild(gbHost);
      box.appendChild(h('div.cal-read-row', h('span', '你的读数 l ='), inpR, h('span', 'cm'),
        h('button.btn.primary.sm', { type: 'button', onclick: checkR }, '核对读数')));
      box.appendChild(fbR);
      var gb = new GV.GaugeBench(gbHost, { height: 245, state: { type: 'ruler', startMm: 0, lengthMm: curLen, locked: false }, onChange: function (st) { curLen = st.lengthMm; } });
      presets.forEach(function (mm) {
        barR.appendChild(h('button.chip' + (mm === curLen ? '.on' : ''), {
          type: 'button', data: { m: String(mm) },
          onclick: function () {
            curLen = mm;
            ML.$$('.chip', barR).forEach(function (c) { c.classList.toggle('on', c.dataset.m === String(mm)); });
            gb.set({ lengthMm: mm });
            inpR.value = ''; fbR.className = 'cal-fb'; fbR.textContent = '已切换到新位置，请估读到 0.01 cm。';
          }
        }, (mm / 10).toFixed(2) + ' cm'));
      });
      function checkR() {
        var res = GG.ruler.diagnose(inpR.value, curLen, { startMm: 0, unit: 'cm', tolMm: 0.15 });
        fbR.className = 'cal-fb ' + (res.ok ? 'ok' : 'bad');
        fbR.textContent = (res.ok ? '✓ ' : '✕ ') + res.msg;
      }
      inpR.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkR(); });
    } else if (p.widget === 'chart-demo') {
      var modeC = 'fx', spC = SP.getSpring('std');
      var barC = h('div.side-row',
        h('button.chip.on', { type: 'button', onclick: function () { modeC = 'fx'; drawC(); } }, 'F − x 图像（过原点）'),
        h('button.chip', { type: 'button', onclick: function () { modeC = 'fl'; drawC(); } }, 'F − l 图像（横截距 = l₀）'));
      var chHostC = h('div'), noteC = h('div.cmp-note');
      box.appendChild(barC); box.appendChild(chHostC); box.appendChild(noteC);
      var ptsC = [];
      for (var ic = 0; ic <= 6; ic++) ptsC.push(SP.measurePoint(spC, ic, { ideal: true }));
      function drawC() {
        ML.$$('.chip', barC).forEach(function (c, i) { c.classList.toggle('on', (i === 0 && modeC === 'fx') || (i === 1 && modeC === 'fl')); });
        ML.clear(chHostC);
        var ch = new ML.Chart(chHostC, {
          xLabel: modeC === 'fx' ? '伸长量 x / cm' : '弹簧总长 l / cm',
          yLabel: '弹力 F / N', height: 195, paper: true,
          x: modeC === 'fx' ? [0, 7.0] : [13.5, 21.0], y: [0, 3.2]
        });
        ch.set([{
          pts: ptsC.map(function (r) { return [(modeC === 'fx' ? r.x : r.l) * 100, r.F]; }),
          fit: true, color: modeC === 'fx' ? '#1661FF' : '#25A870',
          label: modeC === 'fx' ? 'F = kx，斜率 k = 49.0 N/m' : 'F = k(l − l₀)，l 轴截距 = 14.24 cm'
        }]);
        noteC.innerHTML = modeC === 'fx'
          ? '作 <i>F</i>-<i>x</i> 图像（<i>x</i> = <i>l</i> − <i>l</i>₀）：过原点直线，斜率 <i>k</i> = Δ<i>F</i>/Δ<i>x</i> = 49.0 N/m。'
          : '作 <i>F</i>-<i>l</i> 图像：不用先测 <i>l</i>₀ 也能作图，直线斜率仍等于 <b><i>k</i> = 49.0 N/m</b>，与横轴交点直接给出自然原长 <i>l</i>₀ = 14.24 cm。';
      }
      drawC();
    } else if (p.widget === 'limit-demo') {
      var spL = SP.getSpring('std'), nwL = 6, fMaxL = nwL * SP.WEIGHT_M * SP.G, unloaded = false;
      var barL = h('div.side-row',
        h('button.chip', { type: 'button', onclick: function () { nwL = 6; fMaxL = nwL * SP.WEIGHT_M * SP.G; unloaded = false; drawL(); } }, '限度内 6 码 (2.94 N)'),
        h('button.chip.on', { type: 'button', onclick: function () { nwL = 10; fMaxL = nwL * SP.WEIGHT_M * SP.G; unloaded = false; drawL(); } }, '超限 10 码 (4.90 N)'),
        h('button.chip', { type: 'button', onclick: function () { nwL = 0; unloaded = true; drawL(); } }, '卸载回 0 N'));
      var chHostL = h('div'), noteL = h('div.cmp-note');
      box.appendChild(barL); box.appendChild(chHostL); box.appendChild(noteL);
      function drawL() {
        var bs = ML.$$('.chip', barL);
        bs[0].classList.toggle('on', !unloaded && nwL === 6);
        bs[1].classList.toggle('on', !unloaded && nwL === 10);
        bs[2].classList.toggle('on', unloaded);
        ML.clear(chHostL);
        var ptsAll = [], curF = nwL * SP.WEIGHT_M * SP.G;
        var maxLoadK = unloaded ? Math.round(fMaxL / (SP.WEIGHT_M * SP.G)) : nwL;
        for (var k = 0; k <= maxLoadK; k++) {
          var fk = k * SP.WEIGHT_M * SP.G;
          ptsAll.push([SP.elongation(spL, fk, fk).xTotal * 100, fk]);
        }
        var xPermCm = SP.elongation(spL, 0, fMaxL).xPerm * 100;
        var ser = [
          { pts: [], line: [[0, 0], [10.4, 5.1]], color: '#25A870', dash: true, label: '胡克定律理想直线 (k=49 N/m)' },
          { pts: ptsAll, color: '#C7374B', label: fMaxL > spL.fYield ? '实际加载点（4.00 N 以上向 x 轴弯曲）' : '实际加载点（弹性限度内线性）' }
        ];
        if (unloaded) {
          var uPts = [[SP.elongation(spL, fMaxL, fMaxL).xTotal * 100, fMaxL], [SP.elongation(spL, 0, fMaxL).xTotal * 100, 0]];
          ser.push({ pts: uPts, line: uPts, color: '#E69B2D', label: xPermCm > 0.001 ? ('卸载回 0 N：永久伸长 ' + cmStr(SP.elongation(spL, 0, fMaxL).xPerm) + ' cm') : '卸载回 0 N：完全恢复原长' });
        }
        var ch = new ML.Chart(chHostL, { xLabel: '伸长量 x / cm', yLabel: 'F / N', height: 190, paper: true, x: [0, 13.0], y: [0, 5.2] });
        ch.set(ser);
        noteL.innerHTML = unloaded
          ? (xPermCm > 0.001
              ? '曾超限加载至 ' + fMaxL.toFixed(2) + ' N 后卸载回 0 N，弹簧仍保留 <b>' + cmStr(SP.elongation(spL, 0, fMaxL).xPerm) + ' cm</b> 的永久塑性伸长！'
              : '此前仅加载至 ' + fMaxL.toFixed(2) + ' N（未超 4.00 N 限度），卸载后永久伸长为 <b>0.00 cm</b>。先点“超限 10 码”再卸载即可观察永久变形。')
          : (curF > spL.fYield ? '当前 4.90 N > 4.00 N：曲线斜率明显变小，<b>向 x 轴（横轴）方向弯曲</b>。' : '当前 2.94 N ≤ 4.00 N：处于弹性限度内，严格沿绿色直线上升。');
      }
      drawL();
    } else if (p.widget === 'variant-demo') {
      var vMode = 'bucket', k1 = 40, k2 = 60;
      var barV = h('div.side-row',
        h('button.chip.on', { type: 'button', data: { v: 'bucket' }, onclick: function () { vMode = 'bucket'; renderV(); } }, '① 水桶加水 x-V'),
        h('button.chip', { type: 'button', data: { v: 'comp' }, onclick: function () { vMode = 'comp'; renderV(); } }, '② 压缩 F-l 图'),
        h('button.chip', { type: 'button', data: { v: 'combo' }, onclick: function () { vMode = 'combo'; renderV(); } }, '③ 串并联等效 k'));
      var vBody = h('div');
      box.appendChild(barV); box.appendChild(vBody);
      function renderV() {
        ML.$$('.chip', barV).forEach(function (c) { c.classList.toggle('on', c.dataset.v === vMode); });
        ML.clear(vBody);
        if (vMode === 'bucket') {
          var bRes = SP.analyzeWaterBucket([0, 5e-5, 10e-5, 15e-5, 20e-5, 25e-5], [0.0056, 0.0156, 0.0256, 0.0356, 0.0456, 0.0556], 1000, 9.8);
          var chV = new ML.Chart(vBody, { xLabel: '加水体积 V / mL', yLabel: '伸长 x / cm', height: 180, paper: true, x: [0, 280], y: [0, 6.2], legendPos: 'br' });
          chV.set([{ pts: [0, 50, 100, 150, 200, 250].map(function (v) { return [v, 0.56 + 0.02 * v]; }), fit: true, color: '#1661FF', label: '斜率 200 m⁻² ⇒ k = ' + bRes.k.toFixed(0) + ' N/m' }]);
          vBody.appendChild(h('div.cmp-note', { html: M.tex('2025 四川真题模型：<i>x</i> = {{frac|<i>ρg</i>|<i>k</i>}}<i>V</i> + {{frac|<i>m</i><sub>桶</sub><i>g</i>|<i>k</i>}}，代入斜率 200 m⁻² 得 <i>k</i> = <b>' + bRes.k.toFixed(1) + ' N/m</b>，截距 0.0056 m 得 <i>m</i><sub>桶</sub> = <b>' + bRes.mBucket.toFixed(3) + ' kg</b>。') }));
        } else if (vMode === 'comp') {
          var chC = new ML.Chart(vBody, { xLabel: '弹簧长度 l / mm', yLabel: '压力 F / N', height: 180, paper: true, x: [6, 20], y: [0, 2.2] });
          chC.set([{ pts: [[7.6, 1.84], [10.1, 1.38], [12.6, 0.92], [15.1, 0.46], [17.6, 0]], fit: true, color: '#25A870', label: '斜率绝对值 k = 184 N/m，原长 l₀ = 17.6 mm' }]);
          vBody.appendChild(h('div.cmp-note', '2025 重庆真题模型：弹簧受压时 F = k(l₀ − l)，F-l 图向下倾斜，斜率绝对值为劲度系数 k，l 轴截距即原长 l₀。'));
        } else {
          var ctlV = h('div.side-row',
            h('span.side-l', 'k₁ = ' + k1),
            h('button.chip', { type: 'button', onclick: function () { k1 = k1 === 40 ? 60 : k1 === 60 ? 80 : 40; renderV(); } }, '切换 k₁'),
            h('span.side-l', 'k₂ = ' + k2),
            h('button.chip', { type: 'button', onclick: function () { k2 = k2 === 60 ? 120 : k2 === 120 ? 40 : 60; renderV(); } }, '切换 k₂'));
          vBody.appendChild(ctlV);
          vBody.appendChild(h('div.cmp-split',
            h('div.cmp-box.good', '串联等效（更软）', h('b', { html: 'k<sub>串</sub> = ' + SP.comboK(k1, k2, 'series').toFixed(1) + ' N/m' }), h('span', { html: '1/k<sub>串</sub> = 1/k₁ + 1/k₂' })),
            h('div.cmp-box', '并联等效（更硬）', h('b', { html: 'k<sub>并</sub> = ' + SP.comboK(k1, k2, 'parallel').toFixed(1) + ' N/m' }), h('span', { html: 'k<sub>并</sub> = k₁ + k₂' }))));
        }
      }
      renderV();
    }
  }

  /* =====================================================================
   *  组装四区一卡
   * ===================================================================== */
  shell = new ML.Shell({
    title: C.title, sub: C.sub, summary: C.summary,
    tabs: [
      { id: 'learn', label: '学·原理', mount: function (el) { ML.Learn(el, C.learn, C.equipment, { onPage: learnWidget, onFinish: function () { shell.go('bench'); } }); } },
      { id: 'bench', label: '做·实验', mount: function (el) { bench = new Bench(el); } },
      { id: 'diag', label: '诊·误差', mount: function (el) {
        var wrap = h('div.diag'); el.appendChild(wrap);
        wrap.appendChild(h('h2.diag-h', 'A. 错误操作实验室'));
        wrap.appendChild(h('p.muted', '每个“试一试”按四拍进行：布置 → 运行 → 对比 → 追问与揭示。所有数据与图像均由物理模型实时生成。'));
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
          var nm = ML.$('.err-name', card);
          if (nm && nm.textContent.indexOf('✓ ') !== 0) nm.textContent = '✓ ' + nm.textContent;
        });
        wrap.appendChild(grid);
        wrap.appendChild(h('h2.diag-h', 'B. 结果反推'));
        wrap.appendChild(h('p.muted', '观察异常实验图像或结果，反推操作原因，并可一键回到实验台复现。'));
        var rev = h('div.rev'); wrap.appendChild(rev);
        ML.Reverse(rev, C.reverse, adapter);
      } },
      { id: 'paper', label: '练·真题', mount: function (el) {
        new ML.Paper(el, Q, { title: C.title.replace('实验：', '') + ' · 真题训练', onReplay: adapter.replay });
      } }
    ]
  });

  ML.bus.on('tab', function (id) {
    if (id !== 'bench' && bench) {
      bench.magLocked = false;
      if (bench.magBtn) {
        bench.magBtn.classList.remove('on');
        bench.magBtn.textContent = '🔍 指针放大镜';
      }
      bench.settleNow();
    }
  });

  shell.go(S.tab);
  ML.perf.probe();
  ML.m02 = { bench: function () { return bench; }, adapter: adapter, shell: shell };
})(typeof window !== 'undefined' ? window.ML : null);
