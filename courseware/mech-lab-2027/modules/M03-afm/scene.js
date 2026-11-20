/* M03 scene — 探究加速度与力、质量的关系：实验台、纸带/光电门、图像分析、诊断适配器、讲解小部件。 */
(function (ML) {
  'use strict';
  var h = ML.h, M = ML.math, P = ML.phys, T = ML.tape, D = ML.stage.draw, TV = ML.tapeView;
  var C = ML.json('ml-content'), Q = ML.json('ml-questions') || [];
  var S = ML.store.init(C.slug, {
    v: 1, tab: 'learn', learnPage: 0, mode: 'guided', ideal: false,
    bench: { phase: 'balance', apparatus: 'timer', forceMode: 'string', timer: 'em', power: 'ac8', M: 0.400, m: 0, theta: 0 },
    answers: {}, done: {}
  });
  var ERR = {}; C.errors.forEach(function (e) { ERR[e.id] = e; });
  var PROC = {}; C.procedure.forEach(function (p) { PROC[p.id] = p; });
  var TIMER_NAME = { em: '电磁打点计时器', spark: '电火花计时器' };
  var POWER_NAME = { ac8: '交流 8 V', ac220: '交流 220 V', dc8: '直流 8 V' };
  var MASS_STEPS = [0, 0.010, 0.020, 0.030, 0.040, 0.060, 0.080, 0.100, 0.150, 0.200, 0.250];
  var seedCounter = 31;

  function cm(x) { return (x * 100).toFixed(2); }
  function sub(n) { return String(n).replace(/\d/g, function (d) { return '₀₁₂₃₄₅₆₇₈₉'[d]; }); }
  function roundDeg(th) { return Math.round(P.clamp(th, 0, 4.0) * 20) / 20; }

  /** 光电门通用解析计算：支持 p.startAt、v0 > 0（轻推）以及减速停下（a <= 0）的情形 */
  function gateMeasure(p, d) {
    p = T.withDefaults(p);
    var a = T.accel(p), v0 = p.v0 > 0 ? p.v0 : 0;
    var s0 = Math.max(0, p.startAt || 0);
    var p1 = 0.200 - s0, p2 = 0.600 - s0, x = p2 - p1;
    function tAt(s) {
      if (s <= 0) return Infinity;
      if (Math.abs(a) <= 1e-6) return v0 > 0 ? s / v0 : Infinity;
      if (a > 0) return (-v0 + Math.sqrt(Math.max(0, v0 * v0 + 2 * a * s))) / a;
      var disc = v0 * v0 + 2 * a * s;
      if (disc <= 0) return Infinity;
      return (-v0 + Math.sqrt(disc)) / a;
    }
    var t1a = tAt(p1), t1b = tAt(p1 + d), t2a = tAt(p2), t2b = tAt(p2 + d);
    var dt1 = isFinite(t1a) && isFinite(t1b) ? t1b - t1a : Infinity;
    var dt2 = isFinite(t2a) && isFinite(t2b) ? t2b - t2a : Infinity;
    var t = isFinite(t1a) && isFinite(t2a) ? t2a - t1a : Infinity;
    var v1 = isFinite(dt1) && dt1 > 0 ? d / dt1 : NaN;
    var v2 = isFinite(dt2) && dt2 > 0 ? d / dt2 : NaN;
    var a1 = isFinite(v1) && isFinite(v2) ? (v2 * v2 - v1 * v1) / (2 * x) : NaN;
    var a2 = isFinite(v1) && isFinite(v2) && isFinite(t) && t > 0 ? (v2 - v1) / t : NaN;
    return { a: a, d: d, p1: p1, p2: p2, x: x, dt1: dt1, dt2: dt2, t: t, v1: v1, v2: v2, a1: a1, a2: a2, tAt: tAt };
  }

  /** 有效打点截止下标：严格只取到 t <= tArrive，防止撞击或按住刹车点混入逐差法 */
  function maxValidDotIndex(run) {
    if (!run || !run.times || !run.times.length) return -1;
    var lim = run.tArrive + 1e-6, best = 0;
    for (var i = 0; i < run.times.length; i++) {
      if (run.times[i] <= lim) best = i;
      else break;
    }
    return best;
  }

  /** 截取运动中清晰的连续点并调用 ML.tape.measure + analyze */
  function measureRun(run, opts) {
    opts = opts || {};
    var maxIdx = maxValidDotIndex(run);
    var dots = run.dots.slice(0, maxIdx + 1);
    var start = opts.start != null ? opts.start : T.firstClearDot(dots, 1e-3);
    var reqEvery = opts.every || 5, every = reqEvery;
    if (dots.length - start < 4 * every + 1 && every > 2) every = 2;
    if (dots.length - start < 4 * every + 1 && every > 1) every = 1;
    var maxSegs = Math.floor((dots.length - 1 - start) / every);
    var n = Math.min(6, maxSegs >= 6 ? 6 : maxSegs >= 4 ? 4 : maxSegs);
    var m = T.measure(dots, { start: start, every: every, n: n, method: opts.method || 'origin', ideal: opts.ideal, seed: opts.seed || 7 });
    var Tc = (every === reqEvery && opts.Tcalc != null) ? opts.Tcalc : every * run.T0;
    var an = T.analyze(m.segs, Tc);
    return { dots: dots, start: start, every: every, Tc: Tc, m: m, an: an };
  }

  /* =====================================================================
   *  ② 做·实验
   * ===================================================================== */
  var bench = null;
  function Bench(el) {
    var self = this; this.el = el;
    this.mode = S.mode || 'guided';
    var sb = S.bench || {};
    this.phase = sb.phase || 'balance';
    this.apparatus = sb.apparatus || 'timer';
    this.forceMode = sb.forceMode || 'string';
    this.speed = 0.5;
    this.flag = 0.005;
    this.tapeSeq = 0;
    this.tapes = [];
    this.dataAF = [];
    this.dataAM = [];
    this.showDataset = false;
    this.afCompare = false;
    this.amView = 'inv'; // 'curve' | 'inv' | 'invA'
    this.balancedChecked = false;
    this.lastThetaForAM = null;
    this.banner = null;

    var modeChips = h('div.seg',
      chip('引导', 'guided', function (v) { self.setMode(v); }),
      chip('自由', 'free', function (v) { self.setMode(v); }));
    this.modeChips = modeChips;

    this.phaseChips = h('div.seg',
      chip('① 验平衡', 'balance', function (v) { self.setPhase(v); }),
      chip('② 探 a-F', 'af', function (v) { self.setPhase(v); }),
      chip('③ 探 a-1/M', 'am', function (v) { self.setPhase(v); }));

    this.appChips = h('div.seg',
      chip('打点计时器', 'timer', function (v) { self.setApparatus(v); }),
      chip('光电门', 'gate', function (v) { self.setApparatus(v); }));

    this.forceChips = h('div.seg',
      chip('普通细绳', 'string', function (v) { self.setForceMode(v); }),
      chip('力传感器', 'sensor', function (v) { self.setForceMode(v); }));

    function chip(label, v, fn) {
      return h('button.chip', { type: 'button', data: { v: v }, onclick: function () { fn(v); } }, label);
    }

    this.idealChip = h('button.chip', {
      type: 'button', title: '理想：无摩擦、无纸带阻力、无读数噪声',
      onclick: function () {
        S.ideal = !S.ideal; ML.store.save();
        self.idealChip.classList.toggle('on', S.ideal);
        self.idealChip.textContent = S.ideal ? '理想条件' : '真实条件';
        self.stage.invalidate();
        self.renderSide();
      }
    }, S.ideal ? '理想条件' : '真实条件');
    this.idealChip.classList.toggle('on', S.ideal);

    this.speedChip = h('button.chip', {
      type: 'button',
      onclick: function () {
        self.speed = self.speed === 1 ? 0.5 : self.speed === 0.5 ? 0.25 : 1;
        self.speedChip.textContent = '×' + self.speed;
      }
    }, '×0.5');

    this.bannerEl = h('div.bench-banner', { hidden: true });
    var topBar = h('div.bench-top', modeChips, this.phaseChips, this.appChips, this.forceChips, h('div.spacer'), this.idealChip, this.speedChip);

    this.stageWrap = h('div.bench-stage');
    this.holdBtn = h('button.btn.big.hold', { type: 'button', hidden: true, onclick: function () { self.hold(); } }, '按住小车');
    this.stageWrap.appendChild(this.holdBtn);
    this.stageWrap.appendChild(h('div.stage-hint', '拖动右侧垫块可调倾角 θ · 点击小车可轻推/释放'));

    this.side = h('aside.bench-side');
    this.analysis = h('section.analysis', { hidden: true });
    this.benchEl = h('div.bench', topBar, this.bannerEl, h('div.bench-row', this.stageWrap, this.side), this.analysis);
    el.appendChild(this.benchEl);

    this.stage = new ML.stage.Stage(this.stageWrap, { layers: ['bg', 'fg'] });
    this.stage.on('bg', function (ctx, w, hh) { self.drawBg(ctx, w, hh); });
    this.stage.on('fg', function (ctx, w, hh) { self.drawFg(ctx, w, hh); });
    this.loop = new ML.stage.Loop(function (dt) { return self.tick(dt); });
    this.bindPointer();

    this.reset({
      timer: sb.timer || 'em',
      power: sb.power || 'ac8',
      M: typeof sb.M === 'number' ? sb.M : 0.400,
      m: typeof sb.m === 'number' ? sb.m : (this.phase === 'balance' ? 0 : 0.020),
      theta: typeof sb.theta === 'number' ? sb.theta : 0
    });
    this.setMode(this.mode, true);
    this.syncTopChips();
    this.renderSide();
  }

  Bench.prototype.syncTopChips = function () {
    var self = this;
    ML.$$('.chip', this.modeChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === self.mode); });
    ML.$$('.chip', this.phaseChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === self.phase); });
    ML.$$('.chip', this.appChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === self.apparatus); });
    ML.$$('.chip', this.forceChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === self.forceMode); });
  };

  Bench.prototype.saveBench = function () {
    var b = this.b;
    ML.store.set({
      bench: {
        phase: this.phase, apparatus: this.apparatus, forceMode: this.forceMode,
        timer: b.timer, power: b.power, M: b.M, m: b.m, theta: b.theta
      }
    });
  };

  Bench.prototype.refAngle = function () {
    return roundDeg(T.compensateAngle({
      M: this.b ? this.b.M : 0.4,
      timer: this.apparatus === 'gate' ? 'none' : (this.b ? this.b.timer : 'em'),
      ideal: S.ideal
    }));
  };

  Bench.prototype.reset = function (keep) {
    keep = keep || {};
    var prev = this.b || {};
    this.b = {
      timer: keep.timer !== undefined ? keep.timer : (prev.timer || 'em'),
      power: keep.power !== undefined ? keep.power : (prev.power || 'ac8'),
      threaded: keep.threaded !== undefined ? keep.threaded : true,
      M: keep.M !== undefined ? keep.M : (prev.M != null ? prev.M : 0.400),
      m: keep.m !== undefined ? keep.m : (this.phase === 'balance' ? 0 : (prev.m > 0 ? prev.m : 0.020)),
      theta: keep.theta !== undefined ? keep.theta : (prev.theta != null ? prev.theta : 0),
      startAt: keep.startAt !== undefined ? keep.startAt : 0,
      v0: 0,
      powered: false, released: false, order: [], caught: false,
      running: false, t: 0, run: null, done: false, warn: '',
      recorded: false
    };
    this.gate = null;
    if (this.loop) this.loop.stop();
    if (this.holdBtn) this.holdBtn.hidden = true;
    if (this.stage) { this.stage.invalidate(); this.renderSide(); }
  };

  Bench.prototype.params = function (override) {
    var b = this.b;
    var p = {
      timer: this.apparatus === 'gate' ? 'none' : (b.timer || 'em'),
      power: this.apparatus === 'gate' ? 'ac220' : (b.power || 'ac8'),
      M: b.M,
      m: b.m,
      theta: b.theta,
      v0: b.v0 || 0,
      ideal: S.ideal,
      freq: 50,
      startAt: b.startAt,
      threaded: b.threaded,
      caught: b.caught,
      order: b.order[0] === 'release' ? 'release-first' : 'power-first',
      lag: b.lag
    };
    if (override) for (var k in override) p[k] = override[k];
    return p;
  };

  Bench.prototype.setMode = function (m, silent) {
    this.mode = m; S.mode = m; ML.store.save();
    this.syncTopChips();
    if (!silent) {
      this.setBanner(null);
      ML.toast(m === 'guided' ? '引导模式：逐步检验平衡阻力、控制变量与数据处理' : '自由模式：任意参数组合不拦截，真实物理运行', 'info');
    }
    this.renderSide();
  };

  Bench.prototype.setPhase = function (ph, silent) {
    this.phase = ph;
    this.setBanner(null);
    if (ph === 'balance') {
      this.reset({ m: 0, startAt: 0, threaded: true });
    } else if (ph === 'af') {
      var nextM = this.b.m > 0 ? this.b.m : 0.020;
      this.reset({ m: nextM, M: 0.400, startAt: 0, threaded: true });
    } else {
      this.lastThetaForAM = this.b.theta;
      this.reset({ m: 0.020, startAt: 0, threaded: true });
    }
    this.syncTopChips();
    this.saveBench();
    if (!silent) {
      if (ph === 'af' && this.mode === 'guided' && !this.isBalanced()) {
        this.showBalanceHint();
      }
      this.renderAnalysis();
    }
  };

  Bench.prototype.showBalanceHint = function () {
    var self = this, ref = this.refAngle();
    this.setBanner('<b>提醒：</b>当前倾角 θ = ' + this.b.theta.toFixed(2) + '° 尚未补偿阻力（参考平衡角约 ' + ref.toFixed(2) + '°）。建议先回“① 验平衡”轻推检验，或 <button class="link" type="button" id="m03-autobal">直接调至参考平衡角 (' + ref.toFixed(2) + '°)</button> / <button class="link" type="button" data-try="' + (this.b.theta > ref ? 'E2' : 'E1') + '">看未补偿会怎样 →</button>');
    var ab = ML.$('#m03-autobal', this.bannerEl);
    if (ab) ab.onclick = function () { self.setTheta(ref); self.balancedChecked = true; self.setBanner(null); ML.toast('已将木板倾角调至参考平衡角 ' + ref.toFixed(2) + '°', 'ok'); };
    var tb = ML.$('[data-try]', this.bannerEl);
    if (tb) tb.onclick = function () { openTry(tb.getAttribute('data-try')); };
  };

  Bench.prototype.isBalanced = function () {
    var a0 = T.accel({ M: this.b.M, m: 0, v0: 0.35, theta: this.b.theta, timer: this.apparatus === 'gate' ? 'none' : this.b.timer, ideal: S.ideal });
    return Math.abs(a0) <= 0.025;
  };

  Bench.prototype.setApparatus = function (a) {
    this.apparatus = a;
    this.syncTopChips();
    this.reset({ startAt: 0, threaded: true });
    this.saveBench();
    this.renderSide();
    this.renderAnalysis();
  };

  Bench.prototype.setForceMode = function (fm) {
    this.forceMode = fm;
    this.syncTopChips();
    this.saveBench();
    this.stage.invalidate();
    this.renderSide();
    if (this.showDataset) this.renderAnalysis();
  };

  Bench.prototype.setBanner = function (html) {
    this.bannerEl.hidden = !html;
    this.bannerEl.innerHTML = html || '';
    if (this.benchEl) this.benchEl.classList.toggle('has-banner', !!html);
  };

  Bench.prototype.block = function (msg, errId) {
    ML.toast(msg, 'warn');
    this.setBanner('<b>先停一下：</b>' + msg + (errId ? ' <button class="link" type="button" data-try="' + errId + '">试一试：如果这样做会怎样 →</button>' : ''));
    var btn = ML.$('[data-try]', this.bannerEl);
    if (btn) btn.onclick = function () { openTry(errId); };
  };

  /* ---------- 几何与 2.5D 绘制 ---------- */
  Bench.prototype.geo = function () {
    var w = this.stage.w, hh = this.stage.h;
    var k = Math.min(w / 1.36, hh / 0.86);
    var pivX = Math.max(0.18 * w, w * 0.5 - 0.45 * k);
    var pivY = hh * 0.52;
    return { w: w, h: hh, k: k, pivX: pivX, pivY: pivY, bLen: 1.02, boardT: 0.028, tableY: pivY + 0.028 * k };
  };

  Bench.prototype.visRad = function () {
    // 视觉倾角适当放大 2.0 倍，让 0°~4° 在小屏上也能清晰看出木板倾斜与垫块高度变化
    return (this.b.theta * 2.0) * Math.PI / 180;
  };

  Bench.prototype.drawBg = function (ctx, w, hh) {
    var g = this.geo(), k = g.k, ty = g.tableY;
    ctx.fillStyle = '#EAF1F8'; ctx.fillRect(0, 0, w, hh);
    // 实验室桌面与桌腿（左侧留出悬垂槽码空间）
    var tx0 = g.pivX + 0.03 * k, tw = Math.min(w - tx0 - 12, 1.02 * k);
    ctx.fillStyle = D.grad(ctx, 0, ty, 0, ty + 0.038 * k, ['#D5B88B', '#B8935D']);
    ctx.fillRect(tx0, ty, tw, 0.038 * k);
    ctx.fillStyle = '#9C7847'; ctx.fillRect(tx0, ty, tw, 2);
    // 桌腿
    ctx.fillStyle = D.grad(ctx, 0, ty + 0.038 * k, 0, hh, ['#AD8958', '#8C6B3F']);
    ctx.fillRect(tx0 + 0.08 * k, ty + 0.038 * k, 0.042 * k, hh - ty);
    ctx.fillRect(tx0 + tw - 0.12 * k, ty + 0.038 * k, 0.042 * k, hh - ty);
  };

  Bench.prototype.drawFg = function (ctx, w, hh) {
    var g = this.geo(), k = g.k, b = this.b, rad = this.visRad();
    var c = Math.cos(rad), s = Math.sin(rad);
    this.hot = [];

    function toWorld(lx, ly) {
      return { x: g.pivX + lx * k * c + ly * s, y: g.pivY - lx * k * s + ly * c };
    }

    // 1. 右端可调垫块（垫在 x = 0.88 m 处）
    var padLx = 0.88, padPos = toWorld(padLx, 0.028 * k);
    var padH = Math.max(0, g.tableY - padPos.y);
    var padW = 0.072 * k, padX = padPos.x - padW / 2;
    if (padH > 1.5) {
      ctx.fillStyle = D.grad(ctx, padX, g.tableY - padH, padX + padW, g.tableY, ['#7C93AA', '#53687E']);
      D.rr(ctx, padX, g.tableY - padH, padW, padH, 4); ctx.fill();
      ctx.strokeStyle = '#3B4B60'; ctx.lineWidth = 1; ctx.stroke();
      // 防滑条纹
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.moveTo(padX + 6, g.tableY - padH / 2); ctx.lineTo(padX + padW - 6, g.tableY - padH / 2); ctx.stroke();
    } else {
      ctx.strokeStyle = '#12A9C4'; ctx.setLineDash([4, 3]);
      ctx.strokeRect(padX, g.tableY - 12, padW, 12); ctx.setLineDash([]);
    }
    var padHitY = Math.min(g.tableY - 36, g.tableY - padH - 12);
    this.hot.push({ id: 'pad', x: padX - 12, y: padHitY, w: padW + 24, h: Math.max(48, padH + 30) });
    // 倾角标签 + 调平提示
    D.text(ctx, '垫块 θ = ' + b.theta.toFixed(2) + '°', padPos.x, g.tableY + 22, { align: 'center', size: 12, weight: 700, color: b.theta > 0 ? '#1661FF' : '#4A5B73' });
    if (!b.released && !b.running) {
      ctx.fillStyle = '#12A9C4';
      ctx.beginPath(); ctx.arc(padPos.x, g.tableY - padH - 2, 4, 0, Math.PI * 2); ctx.fill();
    }

    // 2. 旋转坐标系绘制长木板、小车、计时器、光电门、纸带
    ctx.save();
    ctx.translate(g.pivX, g.pivY);
    ctx.rotate(-rad);

    // 长木板
    ctx.fillStyle = D.grad(ctx, 0, 0, 0, g.boardT * k, ['#E6CBA2', '#D9B98C', '#C49F6B']);
    ctx.fillRect(0, 0, g.bLen * k, g.boardT * k);
    ctx.strokeStyle = '#A47D4B'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, g.bLen * k, g.boardT * k);

    // 滑轮（固定在木板左端）
    var pr = 0.022 * k, pxL = -0.014 * k, pyL = -0.003 * k;
    ctx.fillStyle = '#8E99A6'; ctx.fillRect(-0.02 * k, 0, 0.022 * k, 0.012 * k);
    ctx.fillStyle = D.grad(ctx, pxL - pr, pyL - pr, pxL + pr, pyL + pr, ['#DDE4EC', '#8E99A6']);
    ctx.beginPath(); ctx.arc(pxL, pyL, pr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4A5B73'; ctx.beginPath(); ctx.arc(pxL, pyL, pr * 0.28, 0, Math.PI * 2); ctx.fill();

    // 运动学位置：小车初始车尾在 0.84，车宽 0.14，车头在 0.70；向左运动 sNow
    var sNow = b.run ? b.run.s(b.t) : 0;
    var rear = 0.84 - b.startAt - sNow, cartW = 0.14, cartH = 0.044;
    var front = rear - cartW;
    var timerX = 0.94;

    // 光电门（光电门模式）
    if (this.apparatus === 'gate') {
      [0.20, 0.60].forEach(function (dist, i) {
        var gx = (0.70 - dist) * k;
        ctx.fillStyle = '#3B4B60'; D.rr(ctx, gx - 0.01 * k, -0.14 * k, 0.02 * k, 0.14 * k, 3); ctx.fill();
        ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.arc(gx, -0.09 * k, 3, 0, Math.PI * 2); ctx.fill();
        D.text(ctx, '门' + (i + 1), gx, -0.15 * k, { align: 'center', size: 11.5, weight: 700 });
      });
      D.text(ctx, 'x = 0.400 m', (0.70 - 0.40) * k, -0.185 * k, { align: 'center', size: 11, color: '#4A5B73' });
    }

    // 纸带（打点计时器模式）
    if (this.apparatus === 'timer') {
      var tapeEnd = Math.min(g.bLen + 0.04, rear + 0.92);
      if (b.threaded) {
        ctx.fillStyle = TV.PAPER; ctx.fillRect(rear * k, -0.020 * k, (tapeEnd - rear) * k, 0.011 * k);
        ctx.strokeStyle = '#CDBF98'; ctx.lineWidth = 1; ctx.strokeRect(rear * k, -0.020 * k, (tapeEnd - rear) * k, 0.011 * k);
        if (b.run && b.run.dots.length) {
          ctx.fillStyle = '#2B2B2B';
          for (var i = 0; i < b.run.dots.length; i++) {
            if (b.run.times[i] > b.t) break;
            var dx = (timerX - (sNow - b.run.dots[i])) * k;
            if (dx >= rear * k && dx <= tapeEnd * k) {
              ctx.beginPath(); ctx.arc(dx, -0.0145 * k, 1.3, 0, Math.PI * 2); ctx.fill();
            }
          }
        }
      }
      // 打点计时器
      var tx = timerX * k, tw2 = 0.095 * k, th2 = 0.062 * k;
      ctx.fillStyle = b.timer === 'spark'
        ? D.grad(ctx, 0, -th2, 0, 0, ['#F1F3F6', '#C9D1D9'])
        : D.grad(ctx, 0, -th2, 0, 0, ['#4F6A8A', '#2F4560']);
      D.rr(ctx, tx - tw2 / 2, -th2, tw2, th2, 5); ctx.fill();
      ctx.fillStyle = b.powered && (!b.run || b.run.power.prints) ? '#25A870' : b.powered ? '#E69B2D' : '#8E99A6';
      ctx.beginPath(); ctx.arc(tx + tw2 / 2 - 8, -th2 + 8, 3.5, 0, Math.PI * 2); ctx.fill();
      D.text(ctx, b.timer === 'spark' ? '电火花' : '电磁计时器', tx, -th2 - 7, { align: 'center', size: 11.5, weight: 600 });
      var twW = toWorld(timerX, -th2 / 2);
      this.hot.push({ id: 'timer', x: twW.x - tw2 / 2 - 6, y: twW.y - th2 / 2 - 14, w: tw2 + 12, h: th2 + 20 });
      if (!b.threaded) {
        ctx.fillStyle = TV.PAPER; ctx.strokeStyle = '#CDBF98';
        ctx.beginPath(); ctx.arc((timerX + 0.075) * k, -0.022 * k, 0.022 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        D.text(ctx, '点此穿纸带', (timerX + 0.075) * k, -0.052 * k, { align: 'center', size: 11, weight: 700, color: '#12A9C4' });
        var thW = toWorld(timerX + 0.075, -0.022 * k);
        this.hot.push({ id: 'thread', x: thW.x - 28, y: thW.y - 28, w: 56, h: 56 });
      }
    }

    // 小车
    var cx = front * k, cy = -cartH * k;
    ctx.fillStyle = D.grad(ctx, 0, cy, 0, -0.008 * k, ['#5C8DEB', '#2E5FBF']);
    D.rr(ctx, cx, cy, cartW * k, (cartH - 0.010) * k, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.32)'; ctx.fillRect(cx + 5, cy + 4, cartW * k - 10, 3);
    // 车轮
    ctx.fillStyle = '#2B2B2B';
    [0.03, cartW - 0.03].forEach(function (wx) {
      ctx.beginPath(); ctx.arc(cx + wx * k, -0.008 * k, 0.008 * k, 0, Math.PI * 2); ctx.fill();
    });
    // 车上增减砝码（超出基础 200 g 每 50 g 一块）
    var nCartW = Math.round((b.M - 0.200) / 0.050);
    for (var wi = 0; wi < nCartW; wi++) {
      var col = wi % 2, row = Math.floor(wi / 2);
      var wx2 = cx + 0.026 * k + col * 0.048 * k, wy2 = cy - (row + 1) * 0.010 * k;
      ctx.fillStyle = (wi + row) % 2 ? '#8E99A6' : '#AEB8C4';
      ctx.fillRect(wx2, wy2, 0.040 * k, 0.009 * k);
      ctx.strokeStyle = '#596574'; ctx.lineWidth = 0.8; ctx.strokeRect(wx2, wy2, 0.040 * k, 0.009 * k);
    }
    D.text(ctx, 'M=' + Math.round(b.M * 1000) + 'g', cx + cartW * k / 2, cy - Math.ceil(nCartW / 2) * 0.010 * k - 6, { align: 'center', size: 11.5, weight: 700, color: '#10233F' });

    // 光电门遮光片
    if (this.apparatus === 'gate') {
      ctx.fillStyle = '#10233F';
      ctx.fillRect(cx, cy - 0.042 * k, Math.max(2.5, this.flag * k), 0.042 * k);
    }

    // 轻推手推箭头提示
    if (b.running && b.v0 > 0 && b.t < b.run.tRelease + 0.35) {
      ctx.strokeStyle = '#E69B2D'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(rear * k + 26, -0.026 * k); ctx.lineTo(rear * k + 4, -0.026 * k);
      ctx.lineTo(rear * k + 11, -0.032 * k); ctx.moveTo(rear * k + 4, -0.026 * k); ctx.lineTo(rear * k + 11, -0.020 * k); ctx.stroke();
      D.text(ctx, '轻推', rear * k + 30, -0.022 * k, { size: 11.5, weight: 700, color: '#9A5A00' });
    }

    // 力传感器挂钩（车头左侧）
    var hookLx = front;
    if (this.forceMode === 'sensor') {
      var sx = (front - 0.034) * k, sw = 0.034 * k;
      ctx.fillStyle = D.grad(ctx, sx, -0.034 * k, sx, -0.016 * k, ['#12A9C4', '#0C7D92']);
      D.rr(ctx, sx, -0.034 * k, sw, 0.018 * k, 4); ctx.fill();
      ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1; ctx.stroke();
      hookLx = front - 0.034;
    }

    // 木板段细绳（与木板严格平行）
    var hookLy = -0.025 * k;
    if (b.m > 0) {
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(hookLx * k, hookLy); ctx.lineTo(pxL, hookLy); ctx.stroke();
    }

    // 小车热区（世界坐标）
    var cMidW = toWorld(front + cartW / 2, -cartH * k / 2);
    if (!b.running && !b.released) {
      this.hot.push({ id: 'cart', x: cMidW.x - cartW * k / 2 - 6, y: cMidW.y - cartH * k / 2 - 22, w: cartW * k + 12, h: cartH * k + 28 });
    }
    ctx.restore();

    // 3. 世界竖直细绳与槽码（或停放的槽码）
    var pulW = toWorld(-0.014, pyL), strX = pulW.x - pr, strY0 = pulW.y;
    var drop = (b.run ? b.run.s(b.t) : 0) * k * 0.24;
    if (b.m > 0) {
      var wy = strY0 + 0.095 * k + drop;
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(strX, strY0); ctx.lineTo(strX, wy); ctx.stroke();
      var cnt = Math.min(8, Math.max(1, Math.round(b.m / 0.025)));
      for (var j = 0; j < cnt; j++) {
        ctx.fillStyle = j % 2 ? '#8E99A6' : '#A7B1BC';
        ctx.fillRect(strX - 0.020 * k, wy + j * 0.008 * k, 0.040 * k, 0.007 * k);
      }
      D.text(ctx, 'm = ' + Math.round(b.m * 1000) + ' g', strX + 0.026 * k, wy + 12, { size: 12, weight: 700, color: '#10233F' });
      this.hot.push({ id: 'weights', x: strX - 0.04 * k, y: strY0, w: 0.12 * k, h: 0.26 * k });
    } else {
      var restX = g.pivX - 0.06 * k, restY = g.tableY + 0.06 * k;
      ctx.fillStyle = '#B8C2CC'; D.rr(ctx, restX - 18, restY, 36, 18, 3); ctx.fill();
      D.text(ctx, '未挂槽码', restX, restY + 32, { align: 'center', size: 11.5, color: '#4A5B73' });
      this.hot.push({ id: 'weights', x: restX - 28, y: restY - 12, w: 56, h: 52 });
    }

    // 4. 实时力传感器/拉力悬浮读数卡（左上角）
    var pCur = this.params();
    var curFt = b.m > 0 ? T.tension(pCur) : 0;
    var curMg = b.m * P.G;
    var hudText = this.forceMode === 'sensor'
      ? ('力传感器 F_T = ' + curFt.toFixed(3) + ' N' + (b.m > 0 ? '（mg=' + curMg.toFixed(3) + ' N）' : ''))
      : ('细绳重力近似 mg = ' + curMg.toFixed(3) + ' N' + (b.m > 0 ? '（实际 F_T=' + curFt.toFixed(3) + ' N）' : ''));
    var hudMaxW = (this.apparatus === 'gate' && this.gate) ? Math.min(Math.max(180, w - 292), 336) : Math.min(w - 24, 336);
    var gateBelow = this.apparatus === 'gate' && this.gate && w < 540;
    if (gateBelow) hudMaxW = Math.min(w - 24, 336);
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = this.forceMode === 'sensor' ? '#12A9C4' : '#DCE5F0';
    D.rr(ctx, 12, 12, hudMaxW, 30, 10); ctx.fill(); ctx.stroke();
    D.text(ctx, hudText, 22, 31, { size: 12.5, weight: 700, color: this.forceMode === 'sensor' ? '#0C7D92' : '#10233F', maxW: hudMaxW - 20 });

    // 5. 光电门读数窗
    if (this.apparatus === 'gate' && this.gate) this.drawGateReadout(ctx, g, gateBelow);

    // 6. 警告条
    if (b.warn) {
      var warnY = gateBelow ? 108 : (this.apparatus === 'gate' && this.gate ? 74 : 50);
      ctx.fillStyle = 'rgba(199,55,75,.92)'; D.rr(ctx, 12, warnY, w - 24, 34, 10); ctx.fill();
      D.text(ctx, b.warn, w / 2, warnY + 22, { align: 'center', size: 13.5, color: '#fff', weight: 700 });
    }
  };

  Bench.prototype.drawGateReadout = function (ctx, g, below) {
    var r = this.gate, shown = this.b.t - (this.b.run ? this.b.run.tRelease : 0);
    var p1 = r.p1 != null ? r.p1 : 0.20, p2 = r.p2 != null ? r.p2 : 0.60;
    var t1 = r.tAt(p1), t2 = r.tAt(p2);
    var bx = below ? 12 : Math.max(12, g.w - 270), by = below ? 48 : 12;
    ctx.fillStyle = '#10233F'; D.rr(ctx, bx, by, 258, 56, 10); ctx.fill();
    D.text(ctx, '数字计时器（门距 ' + r.x.toFixed(3) + ' m）', bx + 10, by + 17, { size: 11, color: '#9FB3CC' });
    D.text(ctx, 'Δt₁=' + (isFinite(t1) && shown >= t1 ? (r.dt1 * 1000).toFixed(2) + 'ms' : (this.b.done && !isFinite(t1) ? '未到达' : '---')), bx + 10, by + 40, { size: 13, color: '#7CF0B4', weight: 700 });
    D.text(ctx, 'Δt₂=' + (isFinite(t2) && shown >= t2 ? (r.dt2 * 1000).toFixed(2) + 'ms' : (this.b.done && !isFinite(t2) ? '未到达' : '---')), bx + 132, by + 40, { size: 13, color: '#7CF0B4', weight: 700 });
  };

  /* ---------- 指针交互 ---------- */
  Bench.prototype.bindPointer = function () {
    var self = this, dragKind = null, startX = 0, startY = 0, startVal = 0;
    ML.stage.pointer(this.stage.layer('fg').canvas, {
      down: function (p) {
        var hit = self.hitTest(p);
        dragKind = null;
        if (hit === 'pad' && !self.b.running && !self.b.released) {
          dragKind = 'pad'; startX = p.x; startY = p.y; startVal = self.b.theta;
        } else if (hit === 'cart' && !self.b.running && !self.b.released && self.apparatus !== 'gate') {
          dragKind = 'cart'; startX = p.x; startVal = self.b.startAt;
        }
      },
      move: function (p) {
        if (!dragKind) return;
        if (dragKind === 'pad') {
          var dy = startY - p.y, dx = startX - p.x;
          var delta = (dy * 0.045) + (dx * 0.012);
          self.setTheta(roundDeg(startVal + delta), true);
        } else if (dragKind === 'cart') {
          var g = self.geo();
          self.b.startAt = P.clamp(startVal + (startX - p.x) / g.k, 0, 0.32);
          self.stage.invalidate('fg');
        }
      },
      up: function (p, a) {
        if (dragKind && a.moved) {
          if (dragKind === 'cart' && self.b.startAt < 0.03) {
            self.b.startAt = 0; ML.toast('小车已靠近打点计时器', 'ok');
          }
          if (dragKind === 'pad') {
            self.saveBench(); self.renderSide();
          }
          dragKind = null; self.stage.invalidate(); return;
        }
        dragKind = null;
        var hit = self.hitTest(p);
        if (hit === 'cart') {
          if (self.b.m === 0) self.pushCart();
          else self.release();
        } else if (hit === 'thread') self.thread();
        else if (hit === 'timer') self.setTimer(self.b.timer === 'em' ? 'spark' : 'em');
        else if (hit === 'weights') {
          if (self.phase === 'balance' && self.mode === 'guided') {
            ML.toast('“① 验平衡”阶段应保持不挂槽码（m = 0）', 'warn'); return;
          }
          var idx = MASS_STEPS.indexOf(self.b.m);
          self.setSlotMass(MASS_STEPS[(idx + 1) % MASS_STEPS.length]);
        }
      }
    });
  };

  Bench.prototype.hitTest = function (p) {
    var hs = this.hot || [];
    for (var i = hs.length - 1; i >= 0; i--) {
      var r = hs[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r.id;
    }
    return null;
  };

  /* ---------- 控制操作 ---------- */
  Bench.prototype.setTimer = function (t) {
    if (this.b.released) return;
    this.b.timer = t;
    this.b.power = t === 'em' ? 'ac8' : 'ac220';
    this.b.powered = false;
    this.b.order = [];
    this.saveBench(); this.stage.invalidate(); this.renderSide();
  };

  Bench.prototype.setPower = function (p) {
    if (this.b.released) return;
    if (this.mode === 'guided') {
      var right = this.b.timer === 'em' ? 'ac8' : 'ac220';
      if (p !== right) {
        ML.toast(TIMER_NAME[this.b.timer] + '应接' + POWER_NAME[right], 'warn');
        return;
      }
    }
    this.b.power = p; this.b.powered = false; this.b.order = [];
    this.saveBench(); this.stage.invalidate(); this.renderSide();
  };

  Bench.prototype.thread = function () {
    if (this.b.released) return;
    if (this.b.threaded) {
      if (this.mode === 'free') {
        this.b.threaded = false;
        ML.toast('已取下纸带（自由模式可对比未穿纸带工况）', 'info');
        this.stage.invalidate(); this.renderSide();
      } else {
        ML.toast('引导模式下需保持穿好纸带', 'info');
      }
      return;
    }
    this.b.threaded = true;
    ML.toast('纸带已穿过限位孔并固定在小车尾部', 'ok');
    this.stage.invalidate(); this.renderSide();
  };

  Bench.prototype.setCartMass = function (Mval) {
    if (this.b.released) return;
    var oldM = this.b.M;
    this.b.M = Math.round(P.clamp(Mval, 0.200, 0.800) * 1000) / 1000;
    if (this.phase === 'am' && this.mode === 'guided' && Math.abs(oldM - this.b.M) > 1e-6) {
      this.setBanner(null);
    }
    this.saveBench(); this.stage.invalidate(); this.renderSide();
  };

  Bench.prototype.setSlotMass = function (mVal) {
    if (this.b.released) return;
    if (this.phase === 'balance' && this.mode === 'guided' && mVal > 0) {
      this.block('补偿阻力时必须取下槽码（m = 0）。', 'E4');
      return;
    }
    this.b.m = Math.round(P.clamp(mVal, 0, 0.250) * 1000) / 1000;
    this.saveBench(); this.stage.invalidate(); this.renderSide();
  };

  Bench.prototype.setTheta = function (th, silent) {
    if (this.b.released) return;
    this.b.theta = roundDeg(th);
    if (this.phase === 'am' && this.mode === 'guided' && this.lastThetaForAM != null && Math.abs(this.b.theta - this.lastThetaForAM) > 0.08 && !silent) {
      ML.toast('提示：改变小车质量 M 时，通常无需重调倾角 θ', 'info');
    }
    this.saveBench(); this.stage.invalidate();
    if (!silent) this.renderSide();
  };

  Bench.prototype.powerOn = function () {
    var b = this.b;
    if (b.powered) {
      if (!b.running) {
        b.powered = false;
        b.order = b.order.filter(function (x) { return x !== 'power'; });
        this.stage.invalidate(); this.renderSide();
      }
      return;
    }
    if (this.apparatus === 'timer') {
      var pc = T.powerCheck({ timer: b.timer, power: b.power });
      if (pc.blocked) {
        b.warn = '⚠ ' + pc.msg + ' 已自动断电。';
        this.stage.invalidate();
        var self = this; setTimeout(function () { self.b.warn = ''; self.stage.invalidate(); }, 3200);
        return;
      }
    }
    b.powered = true; b.order.push('power');
    if (b.running) { b.lag = b.t; this.rebuildRun(); }
    this.stage.invalidate(); this.renderSide();
  };

  Bench.prototype.pushCart = function () {
    var b = this.b; if (b.released) return;
    if (this.mode === 'guided') {
      if (this.apparatus === 'timer' && !b.threaded) { this.block('补偿阻力时必须先穿好纸带，使纸带阻力也一起被平衡。', 'E4'); return; }
      if (b.m > 0) { this.block('验平衡轻推前必须取下槽码（m = 0）。', 'E4'); return; }
      if (this.apparatus === 'timer' && !b.powered) { ML.toast('请先接通打点计时器电源，再轻推小车', 'warn'); return; }
    }
    b.v0 = 0.35;
    this.startMotion();
  };

  Bench.prototype.release = function () {
    var b = this.b; if (b.released) return;
    if (b.m === 0) { ML.toast('槽码质量为 0，若要检验平衡请点“轻推小车”或先挂槽码', 'warn'); return; }
    if (this.mode === 'guided') {
      if (this.apparatus === 'timer' && !b.threaded) { ML.toast('请先穿纸带', 'warn'); return; }
      if (this.apparatus === 'timer' && !b.powered) { ML.toast('应先接通电源，待打点稳定后再释放小车', 'warn'); return; }
      if (b.startAt > 0.03) { ML.toast('释放前建议将小车停在靠近打点计时器的位置', 'warn'); return; }
    }
    b.v0 = 0;
    this.startMotion();
  };

  Bench.prototype.startMotion = function () {
    var b = this.b;
    if (this.apparatus === 'gate') { b.powered = true; b.order = ['power']; }
    b.released = true; b.order.push('release'); b.running = true;
    b.lag = b.order[0] === 'power' ? 0.40 : (b.powered ? 0 : Infinity);
    b.t = b.order[0] === 'power' ? 0.40 : 0;
    this.rebuildRun();
    this.setBanner(null);
    this.renderSide();
    this.loop.start();
  };

  Bench.prototype.rebuildRun = function () {
    var b = this.b, p = this.params();
    if (b.order[0] === 'release') { p.order = 'release-first'; p.lag = b.powered ? b.lag : Infinity; }
    else { p.order = 'power-first'; p.lag = 0.40; }
    if (!b.powered) p.lag = Infinity;
    this.seed = this.seed || (seedCounter += 7);
    b.run = T.run(p, this.seed);
    if (this.apparatus === 'gate') {
      this.gate = gateMeasure(p, this.flag);
    }
  };

  Bench.prototype.hold = function () {
    var b = this.b; if (!b.running || !b.run) return;
    var sNow = b.run.s(b.t);
    if (sNow < 0.45 * b.run.L) { ML.toast('还没到滑轮前，再等一等', 'info'); return; }
    if (b.t > b.run.tArrive) return;
    b.caught = true; this.rebuildRun(); this.holdBtn.hidden = true;
    ML.toast('已在滑轮前稳稳按住小车', 'ok');
  };

  Bench.prototype.tick = function (dt) {
    var b = this.b; if (!b.running) return false;
    b.t += dt * this.speed;
    if (b.run) {
      var sNow = b.run.s(b.t);
      var win = !b.caught && b.run.moving && sNow >= 0.45 * b.run.L && b.t <= b.run.tArrive && b.run.v(b.t) > 0.05;
      if (this.holdBtn.hidden === win) this.holdBtn.hidden = !win;
    }
    var end = b.run ? b.run.tOff : 1.5;
    this.stage.invalidate('fg');
    if (b.t >= end) { b.t = end; b.running = false; this.finish(); return false; }
    return true;
  };

  Bench.prototype.finish = function () {
    var b = this.b; this.holdBtn.hidden = true; b.done = true;
    if (b.run && !b.run.moving) {
      ML.toast('合外力不足以克服阻力，小车未动（a = 0）', 'warn');
    } else if (b.run && !b.caught && b.run.moving && b.run.v(b.run.tArrive - 1e-4) > 0.02 && b.run.s(b.run.tArrive) >= b.run.L - 0.01) {
      b.warn = '小车撞上滑轮（提醒：在末端前按住可保护器材）';
      var self = this; setTimeout(function () { self.b.warn = ''; self.stage.invalidate(); }, 2500);
    }
    if (this.phase === 'balance' && this.isBalanced()) this.balancedChecked = true;
    this.renderSide(); this.stage.invalidate();
  };

  Bench.prototype.takeTape = function () {
    var b = this.b; if (!b.done || !b.run) return;
    var tape = {
      no: ++this.tapeSeq,
      run: b.run,
      timer: b.timer,
      threaded: b.threaded,
      phase: this.phase,
      M: b.M, m: b.m, theta: b.theta,
      forceMode: this.forceMode,
      ideal: S.ideal,
      F_mg: b.m * P.G,
      F_sensor: b.m > 0 ? T.tension(this.params()) : 0
    };
    this.tapes.push(tape); if (this.tapes.length > 4) this.tapes.shift();
    this.activeTape = tape;
    this.seed = 0;
    this.reset({ startAt: 0, threaded: true });
    this.showDataset = true;
    this.renderAnalysis({ scroll: true });
  };

  Bench.prototype.recordGate = function () {
    var b = this.b, g = this.gate;
    if (!b.done || !g) return;
    var aVal = b.run && !b.run.moving ? 0 : g.a1;
    if (!isFinite(aVal)) {
      ML.toast('未经过两道光电门，无法由光电门求得加速度', 'warn');
      return;
    }
    this.pushDataPoint({
      M: b.M, m: b.m, theta: b.theta,
      forceMode: this.forceMode, apparatus: 'gate', ideal: S.ideal,
      F_mg: b.m * P.G, F_sensor: b.m > 0 ? T.tension(this.params()) : 0,
      a: aVal, aTrue: b.run ? b.run.a : aVal
    });
    b.recorded = true;
    this.showDataset = true;
    this.renderSide();
    this.renderAnalysis({ scroll: true });
  };

  Bench.prototype.pushDataPoint = function (pt) {
    pt.F_used = pt.forceMode === 'sensor' ? pt.F_sensor : pt.F_mg;
    pt.invM = 1 / pt.M;
    pt.invA = pt.a > 0.01 ? 1 / pt.a : NaN;
    if (this.phase === 'am') {
      this.dataAM.push(pt);
    } else {
      this.dataAF.push(pt);
    }
    ML.toast('已记入数据：a = ' + pt.a.toFixed(3) + ' m/s²', 'ok');
  };

  Bench.prototype.quickBatchAF = function () {
    var b = this.b, list = [0.010, 0.020, 0.040, 0.060, 0.100, 0.150, 0.200, 0.250];
    this.dataAF = [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var p = { M: b.M, m: m, theta: b.theta, timer: this.apparatus === 'gate' ? 'none' : b.timer, power: b.timer === 'spark' ? 'ac220' : 'ac8', ideal: S.ideal };
      var aVal = 0;
      if (this.apparatus === 'gate') {
        var gm = gateMeasure(p, this.flag);
        aVal = isFinite(gm.a1) ? gm.a1 : Math.max(0, T.accel(p));
      } else {
        var r = T.run(p, 50 + i * 7);
        if (r.moving && r.dots.length > 10) aVal = measureRun(r, { ideal: S.ideal, seed: 50 + i }).an.aZhuCha;
      }
      var ft = T.tension(p), fmg = m * P.G;
      this.dataAF.push({
        M: b.M, m: m, theta: b.theta, forceMode: this.forceMode, apparatus: this.apparatus, ideal: S.ideal,
        F_mg: fmg, F_sensor: ft, F_used: this.forceMode === 'sensor' ? ft : fmg,
        a: aVal, aTrue: Math.max(0, T.accel(p)), invM: 1 / b.M, invA: aVal > 0.01 ? 1 / aVal : NaN
      });
    }
    this.showDataset = true;
    this.renderAnalysis({ scroll: true });
    ML.toast('已基于物理模型实时采集 8 组槽码数据（10 g ～ 250 g）', 'ok');
  };

  Bench.prototype.quickBatchAM = function () {
    var b = this.b, mFix = b.m > 0 ? b.m : 0.020, Ms = [0.200, 0.300, 0.400, 0.500, 0.600, 0.800];
    this.dataAM = [];
    for (var i = 0; i < Ms.length; i++) {
      var Mval = Ms[i];
      var p = { M: Mval, m: mFix, theta: b.theta, timer: this.apparatus === 'gate' ? 'none' : b.timer, power: b.timer === 'spark' ? 'ac220' : 'ac8', ideal: S.ideal };
      var aVal = 0;
      if (this.apparatus === 'gate') {
        var gm = gateMeasure(p, this.flag);
        aVal = isFinite(gm.a1) ? gm.a1 : Math.max(0, T.accel(p));
      } else {
        var r = T.run(p, 80 + i * 7);
        if (r.moving && r.dots.length > 10) aVal = measureRun(r, { ideal: S.ideal, seed: 80 + i }).an.aZhuCha;
      }
      var ft = T.tension(p), fmg = mFix * P.G;
      this.dataAM.push({
        M: Mval, m: mFix, theta: b.theta, forceMode: this.forceMode, apparatus: this.apparatus, ideal: S.ideal,
        F_mg: fmg, F_sensor: ft, F_used: this.forceMode === 'sensor' ? ft : fmg,
        a: aVal, aTrue: Math.max(0, T.accel(p)), invM: 1 / Mval, invA: aVal > 0.01 ? 1 / aVal : NaN
      });
    }
    this.showDataset = true;
    this.renderAnalysis({ scroll: true });
    ML.toast('已基于物理模型实时采集 6 组变质量数据（200 g ～ 800 g）', 'ok');
  };

  /* ---------- 嵌入式 20 分度游标卡尺读遮光片宽度弹窗（复用 ML.gaugesView） ---------- */
  function openGateCaliper(curM, onAdopt) {
    var modal = null;
    var st = {
      type: 'caliper',
      div: 20,
      valMm: Math.round(P.clamp((curM || 0.005) * 1000, 2, 30) * 20) / 20
    };
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      document.removeEventListener('keydown', onKey);
      if (modal) { modal.remove(); modal = null; }
    }
    document.addEventListener('keydown', onKey);
    var ctrl = h('div.side-row',
      h('button.chip', { type: 'button', onclick: function () { nudge(-0.05); } }, '−0.05 mm'),
      h('button.chip', { type: 'button', onclick: function () { nudge(0.05); } }, '+0.05 mm'),
      h('button.chip', { type: 'button', onclick: function () { setVal(5.10); } }, '预设 5.10 mm'),
      h('button.chip', { type: 'button', onclick: function () { setVal(10.00); } }, '预设 10.00 mm'));
    var box = h('div');
    var info = h('div.cmp-note');
    var adoptBtn = h('button.btn.primary', {
      type: 'button',
      onclick: function () {
        var v = gb.value();
        close();
        if (onAdopt) onAdopt(v);
      }
    }, '采用此遮光片宽度 d');
    modal = h('div.ml-modal', {
      role: 'dialog', 'aria-modal': 'true', 'aria-label': '20分度游标卡尺测遮光片宽度',
      onclick: function (e) { if (e.target === modal) close(); }
    },
      h('div.ml-modal-card.gauge-modal-card',
        h('div.try-head', h('div', h('div.try-k', '仪器读数复用'), h('h2', '20 分度游标卡尺测遮光片宽度 d（拖动量爪或长按放大）')), h('button.btn', { type: 'button', onclick: close }, '关闭')),
        ctrl, box, info, h('div.try-actions', adoptBtn)));
    document.body.appendChild(modal);
    var gb = new ML.gaugesView.GaugeBench(box, { height: 255, state: st, onChange: updateInfo });
    function updateInfo() {
      var val = gb.value();
      st.valMm = val;
      info.innerHTML = '20 分度游标卡尺（精确度 0.05 mm，不估读）：当前遮光片宽度 d = <b>' + val.toFixed(2) + ' mm</b>（' + (val / 10).toFixed(3) + ' cm）';
    }
    function setVal(v) {
      st.valMm = Math.round(P.clamp(v, 2, 30) * 20) / 20;
      gb.set({ type: 'caliper', div: 20, valMm: st.valMm });
      updateInfo();
    }
    function nudge(dv) { setVal((gb.value() || st.valMm) + dv); }
    updateInfo();
  }

  /* ---------- 右侧控制面板 ---------- */
  Bench.prototype.renderSide = function () {
    var self = this, b = this.b, side = this.side; if (!side) return;
    ML.clear(side);
    var ctl = h('div.side-ctl');
    function btn(label, on, act, dis) {
      return h('button.chip' + (on ? '.on' : ''), { type: 'button', onclick: act, disabled: dis != null ? dis : b.released }, label);
    }

    if (this.apparatus === 'timer') {
      ctl.appendChild(h('div.side-row',
        h('span.side-l', '计时器'),
        btn('电磁(8V~)', b.timer === 'em', function () { self.setTimer('em'); }),
        btn('电火花(220V~)', b.timer === 'spark', function () { self.setTimer('spark'); }),
        btn(b.threaded ? '已穿纸带' : '穿纸带', b.threaded, function () { self.thread(); })));
    } else {
      var presets = [0.002, 0.005, 0.010, 0.030];
      ctl.appendChild(h('div.side-row',
        h('span.side-l', '遮光片'),
        presets.map(function (d) {
          return btn((d * 1000) + 'mm', Math.abs(self.flag - d) < 1e-6, function () {
            self.flag = d; self.gate = null; self.renderSide(); self.stage.invalidate();
          });
        }),
        h('button.link.sm', {
          type: 'button', disabled: b.released,
          onclick: function () {
            openGateCaliper(self.flag, function (mm) {
              self.flag = Math.round(mm * 100) / 100000;
              self.gate = null;
              self.renderSide(); self.stage.invalidate();
              ML.toast('已采用卡尺测得遮光片宽度 d = ' + mm.toFixed(2) + ' mm', 'ok');
            });
          }
        }, presets.some(function (d) { return Math.abs(self.flag - d) < 1e-6; }) ? '用游标卡尺测 d →' : '卡尺 ' + (self.flag * 1000).toFixed(2) + 'mm →')));
    }

    ctl.appendChild(h('div.side-row',
      h('span.side-l', '小车 M'),
      btn('−', false, function () { self.setCartMass(b.M - 0.050); }),
      h('b.side-v', Math.round(b.M * 1000) + ' g'),
      btn('+', false, function () { self.setCartMass(b.M + 0.050); }),
      h('span.side-l', { style: { marginLeft: '4px', minWidth: '40px' } }, '槽码 m'),
      btn('−', false, function () {
        var idx = MASS_STEPS.indexOf(b.m);
        if (idx > 0) self.setSlotMass(MASS_STEPS[idx - 1]);
        else self.setSlotMass(b.m - 0.010);
      }),
      h('b.side-v', Math.round(b.m * 1000) + ' g'),
      btn('+', false, function () {
        var idx = MASS_STEPS.indexOf(b.m);
        if (idx >= 0 && idx + 1 < MASS_STEPS.length) self.setSlotMass(MASS_STEPS[idx + 1]);
        else self.setSlotMass(b.m + 0.010);
      })));

    var slider = h('input.theta-range', {
      type: 'range', min: '0', max: '4', step: '0.05', value: String(b.theta),
      disabled: b.released, 'aria-label': '垫块倾角',
      oninput: function (e) { self.setTheta(parseFloat(e.target.value), true); thVal.textContent = self.b.theta.toFixed(2) + '°'; },
      onchange: function () { self.renderSide(); }
    });
    var thVal = h('b.side-v', b.theta.toFixed(2) + '°');
    ctl.appendChild(h('div.side-row',
      h('span.side-l', '倾角 θ'),
      btn('−', false, function () { self.setTheta(b.theta - 0.05); }),
      slider, thVal,
      btn('+', false, function () { self.setTheta(b.theta + 0.05); })));

    // 动作区
    var act1 = this.apparatus === 'timer'
      ? h('button.btn' + (b.powered ? '.cyan' : ''), { type: 'button', onclick: function () { self.powerOn(); }, disabled: b.done }, b.powered ? '已通电' : '接通电源')
      : h('button.btn', { type: 'button', onclick: function () { self.setTheta(self.refAngle()); }, disabled: b.released }, '设为平衡角');
    var act2 = b.m === 0
      ? h('button.btn.primary', { type: 'button', onclick: function () { self.pushCart(); }, disabled: b.released }, '轻推小车 (m=0)')
      : h('button.btn.primary', { type: 'button', onclick: function () { self.release(); }, disabled: b.released }, '释放小车');
    var gateInvalid = this.apparatus === 'gate' && this.gate && b.run && b.run.moving && !isFinite(this.gate.a1);
    var act3 = this.apparatus === 'timer'
      ? h('button.btn', { type: 'button', onclick: function () { self.takeTape(); }, disabled: !b.done }, '取下纸带')
      : h('button.btn', { type: 'button', onclick: function () { self.recordGate(); }, disabled: !b.done || b.recorded || self.phase === 'balance' || gateInvalid }, b.recorded ? '已记入' : '记入数据表');
    var act4 = h('button.btn.sm', {
      type: 'button',
      onclick: function () { self.reset({ startAt: 0, threaded: true }); self.setBanner(null); }
    }, '复位准备下一组');
    ctl.appendChild(h('div.side-acts', act1, act2, act3, act4));

    // 光电门瞬时结果条 / 实时统计条
    var nCount = this.phase === 'am' ? this.dataAM.length : this.dataAF.length;
    var pNow = this.params();
    var stat = h('div.live-stat');
    if (this.apparatus === 'gate' && this.gate && b.done) {
      var g = this.gate;
      if (this.phase === 'balance' && b.m === 0) {
        if (!isFinite(g.dt1) || !isFinite(g.dt2)) {
          stat.appendChild(h('span', { html: '未经过两门：<b>阻力过大（补偿不足）</b>' }));
        } else {
          var relDt = Math.abs(g.dt2 - g.dt1) / Math.max(g.dt1, 1e-9);
          var balMsg = (relDt <= 0.03 || Math.abs(g.a) <= 0.025)
            ? '<b style="color:#17784F">Δt₁ ≈ Δt₂（已平衡）</b>'
            : (g.dt2 > g.dt1 ? '<b style="color:#9A5A00">Δt₂ &gt; Δt₁（偏小）</b>' : '<b style="color:#C7374B">Δt₂ &lt; Δt₁（偏大）</b>');
          stat.appendChild(h('span', { html: 'Δt₁=' + (g.dt1 * 1000).toFixed(2) + 'ms Δt₂=' + (g.dt2 * 1000).toFixed(2) + 'ms · ' + balMsg }));
        }
      } else {
        var aDisp = b.run && !b.run.moving ? '0.000 (未动)' : (isFinite(g.a1) ? g.a1.toFixed(3) : '未过门2');
        stat.appendChild(h('span', { html: 'v₁=' + (isFinite(g.v1) ? g.v1.toFixed(3) : '—') + '　v₂=' + (isFinite(g.v2) ? g.v2.toFixed(3) : '—') + '　<b>a=' + aDisp + '</b> m/s²' }));
      }
    } else {
      var fTxt = b.m > 0
        ? (this.forceMode === 'sensor' ? 'F_T=' + T.tension(pNow).toFixed(3) + ' N' : 'mg=' + (b.m * P.G).toFixed(3) + ' N')
        : '轻推验平衡态';
      stat.appendChild(h('span', { html: '<b>' + fTxt + '</b>　|　已记 <b>' + nCount + '</b> 组' }));
    }
    stat.appendChild(h('button.link.sm', {
      type: 'button',
      onclick: function () { self.showDataset = true; self.renderAnalysis({ scroll: true }); }
    }, '数据表与图像 →'));
    ctl.appendChild(stat);
    side.appendChild(ctl);

    if (this.mode === 'guided') {
      side.appendChild(h('div.side-k', '引导步骤'));
      var ids = this.phase === 'balance' ? ['P1', 'P2', 'P3'] : this.phase === 'af' ? ['P4', 'P6'] : ['P5', 'P6'];
      var doneMap = {
        P1: this.apparatus === 'gate' || (b.threaded && !!b.timer),
        P2: this.balancedChecked || (this.isBalanced() && b.theta > 0),
        P3: this.balancedChecked,
        P4: this.dataAF.length >= 3,
        P5: this.dataAM.length >= 3,
        P6: this.showDataset && ((this.phase === 'af' && this.dataAF.length >= 2) || (this.phase === 'am' && this.dataAM.length >= 2))
      };
      var curId = null;
      for (var k = 0; k < ids.length; k++) { if (!doneMap[ids[k]]) { curId = ids[k]; break; } }
      var stepsEl = h('ol.steps', ids.map(function (id) {
        var p = PROC[id], ok = !!doneMap[id], isCur = id === curId;
        return h('li' + (ok ? '.ok' : '') + (isCur ? '.cur' : ''),
          h('div.st-t', (ok ? '✓ ' : isCur ? '▸ ' : '') + p.title),
          h('div.st-how', { html: M.tex(p.how) }),
          p.why ? h('div.st-why', { html: M.tex('理由：' + p.why) }) : null,
          p.errorId ? h('button.link.sm', { type: 'button', onclick: function () { openTry(p.errorId); } }, '为什么？试一试 →') : null);
      }));
      side.appendChild(stepsEl);
    } else {
      side.appendChild(h('div.side-tip', '自由模式：任意倾角、槽码与质量均可直接运行。可把 θ 调为 0° 或 3.2° 观察 a-F 截距，或加到 250 g 对比细绳弯曲与力传感器直线。'));
    }
  };

  /* ---------- 下方纸带处理 + 实时数据表与图像 ---------- */
  Bench.prototype.renderAnalysis = function (opts) {
    opts = opts || {};
    var self = this, el = this.analysis;
    var hasTape = this.apparatus === 'timer' && this.tapes.length > 0;
    var activeList = this.phase === 'am' ? this.dataAM : this.dataAF;
    if (!hasTape && !this.showDataset && !activeList.length) { el.hidden = true; return; }
    el.hidden = false;
    ML.clear(el);

    if (hasTape) {
      var tape = this.activeTape || this.tapes[this.tapes.length - 1];
      this.renderTapeSection(el, tape);
    }
    this.renderDatasetSection(el);
    if (opts.scroll) el.scrollIntoView({ behavior: ML.perf.low ? 'auto' : 'smooth', block: 'start' });
  };

  Bench.prototype.renderTapeSection = function (el, tape) {
    var self = this, box = h('div.ana-block');
    var tapesBar = h('div.ana-tapes', h('b', '已打纸带：'), this.tapes.map(function (t) {
      return h('button.chip' + (t === tape ? '.on' : ''), { type: 'button', onclick: function () { self.activeTape = t; self.renderAnalysis(); } },
        '纸带' + t.no + '（' + (t.m === 0 ? '轻推 θ=' + t.theta.toFixed(2) + '°' : 'M=' + Math.round(t.M * 1000) + 'g, m=' + Math.round(t.m * 1000) + 'g') + '）');
    }));
    box.appendChild(h('div.ana-head', h('h2.ana-h', '纸带点迹分析'), tapesBar));

    // 自由模式共享 errors[] 诊断标签
    function renderFreeTags() {
      if (self.mode !== 'free') return;
      var tags = [];
      if (!tape.threaded) tags.push({ id: 'E4', cls: 'warn', text: '⚠ 未穿纸带 (E4)' });
      if (tape.threaded && tape.run.power.prints) {
        var aBal = T.accel({ M: tape.M, m: 0, v0: 0.35, theta: tape.theta, timer: tape.timer, ideal: tape.ideal });
        if (aBal < -0.025) tags.push({ id: 'E1', cls: 'warn', text: '⚠ 未补偿或补偿不足 (E1)' });
        else if (aBal > 0.025) tags.push({ id: 'E2', cls: 'warn', text: '⚠ 补偿阻力过度 (E2)' });
        if (tape.m > 0 && tape.forceMode === 'string' && tape.m / tape.M > 0.05) {
          tags.push({ id: 'E3', cls: 'warn', text: '⚠ m 未远小于 M (E3)' });
        }
        if (tape.phase === 'am') {
          tags.push({ id: 'E5', cls: 'info', text: 'ℹ 换 M 无需重调 θ (E5)' });
          tags.push({ id: 'E6', cls: 'info', text: 'ℹ 作 a-1/M 化曲为直 (E6)' });
        }
      }
      if (!tags.length) return;
      box.appendChild(h('div.ana-tags',
        h('span.muted', '现象诊断：'),
        tags.map(function (tg) {
          return h('button.tag.' + tg.cls, { type: 'button', onclick: function () { openTry(tg.id); } }, tg.text + ' →');
        })));
    }

    var dotsValid = tape.run.dots.slice(0, maxValidDotIndex(tape.run) + 1);
    if (!tape.threaded || !tape.run.power.prints) {
      renderFreeTags();
      box.appendChild(h('div.verdict.warn', !tape.threaded ? '本次未穿纸带，纸带上没有点。' : '电源未接通或接错（如直流电/电压不匹配），纸带上没有打点。'));
      el.appendChild(box);
      return;
    }
    if (!tape.run.moving || dotsValid.length < 6) {
      renderFreeTags();
      var zeroBox = h('div.verdict.warn', '合外力不足以克服阻力，小车始终静止未动（所有点叠在原点，a = 0.000 m/s²）。');
      if (tape.m > 0) {
        zeroBox.appendChild(h('button.btn.primary.sm', {
          style: { marginLeft: '10px' }, type: 'button', disabled: !!tape._recorded,
          onclick: function () {
            tape._recorded = true;
            self.pushDataPoint({
              M: tape.M, m: tape.m, theta: tape.theta,
              forceMode: tape.forceMode, apparatus: 'timer', ideal: tape.ideal,
              F_mg: tape.F_mg, F_sensor: tape.F_sensor,
              a: 0, aTrue: 0
            });
            self.renderAnalysis();
          }
        }, tape._recorded ? '✓ 已记入数据表' : '记入数据 (a = 0.000 m/s²)'));
      }
      box.appendChild(zeroBox);
      el.appendChild(box);
      return;
    }

    if (!tape._st) {
      var autoO = T.firstClearDot(dotsValid, 1e-3);
      var ev = 5;
      if (dotsValid.length - autoO < 4 * ev + 1) ev = 2;
      if (dotsValid.length - autoO < 4 * ev + 1) ev = 1;
      tape._st = { O: autoO, every: ev, method: 'origin', Tcalc: ev * 0.02 };
    }
    var st = tape._st;
    var mr = measureRun(tape.run, { start: st.O, every: st.every, method: st.method, Tcalc: st.Tcalc, ideal: tape.ideal, seed: 13 + st.O });
    st.every = mr.every; st.Tcalc = mr.Tc;
    var count = mr.m.idx, labels = count.map(function (_, i) { return i === 0 ? 'O' : String(i); });

    renderFreeTags();
    var stripWrap = h('div.ana-strip');
    box.appendChild(stripWrap);
    var strip = new TV.TapeStrip(stripWrap, {
      height: 112,
      onTap: function (i) {
        if (i <= maxValidDotIndex(tape.run)) { st.O = i; self.renderAnalysis(); }
      },
      magLabel: function (x, s) {
        var d = mr.dots, best = -1, bd = 26;
        for (var i = 0; i < d.length; i++) { var dist = Math.abs(s.X(d[i]) - x); if (dist < bd) { bd = dist; best = i; } }
        if (best >= 0 && best + 1 < d.length) return '点 #' + best + ' 间距 ' + ((d[best + 1] - d[best]) * 1000).toFixed(1) + ' mm';
        return '点选起点 O / 拖动观察';
      }
    });
    strip.set({ dots: mr.dots, timer: tape.timer, count: count, labels: labels, ruler: true });
    setTimeout(function () {
      if (!stripWrap.isConnected) return;
      strip.zoomTo(2600, mr.dots[Math.min(mr.dots.length - 1, st.O + Math.min(10, mr.dots.length - 1 - st.O))]);
    }, 25);

    var ctlRow = h('div.side-row.ana-ctl',
      h('span.side-l', '计数间隔'),
      [5, 2, 1].map(function (ev) {
        return h('button.chip' + (st.every === ev ? '.on' : ''), {
          type: 'button',
          onclick: function () { st.every = ev; st.Tcalc = ev * 0.02; self.renderAnalysis(); }
        }, ev === 1 ? '每点 (0.02s)' : '每' + ev + '点 (' + (ev * 0.02).toFixed(2) + 's)');
      }),
      h('span.side-l', { style: { marginLeft: '8px' } }, '测距'),
      h('button.chip' + (st.method === 'origin' ? '.on' : ''), { type: 'button', onclick: function () { st.method = 'origin'; self.renderAnalysis(); } }, '同一起点'),
      h('button.chip' + (st.method === 'segment' ? '.on' : ''), { type: 'button', onclick: function () { st.method = 'segment'; self.renderAnalysis(); } }, '逐段'));
    box.appendChild(ctlRow);

    if (mr.m.segs.length >= 2) {
      var segRow = h('tr', h('th', '段长 / cm'), mr.m.segs.map(function (x, i) { return h('td', 'x' + sub(i + 1) + '=' + cm(x)); }));
      var dxs = mr.m.segs.slice(1).map(function (x, i) { return x - mr.m.segs[i]; });
      var dxRow = h('tr', h('th', 'Δx / cm'), h('td', '—'), dxs.map(function (d) { return h('td', cm(d)); }));
      box.appendChild(h('div.tbl-wrap', h('table.dt', segRow, dxRow)));
    }

    if (tape.m === 0) {
      var aEst = mr.m.segs.length >= 4 ? mr.an.aZhuCha : tape.run.a;
      var cls = Math.abs(aEst) <= 0.025 ? 'ok' : (aEst < 0 ? 'warn' : 'bad');
      var msg = Math.abs(aEst) <= 0.025
        ? '✓ 点距基本均匀（a ≈ ' + aEst.toFixed(3) + ' m/s²），阻力补偿恰当！可以进入 ② 探 a-F 或 ③ 探 a-1/M。'
        : (aEst < 0 ? '! 点距逐渐变密（减速 a ≈ ' + aEst.toFixed(3) + ' m/s²）：补偿阻力不足，请适当增大倾角 θ。'
                    : '✕ 点距逐渐变疏（加速 a ≈ +' + aEst.toFixed(3) + ' m/s²）：补偿阻力过度，请适当减小倾角 θ。');
      var vb = h('div.verdict.' + cls, msg);
      if (cls === 'ok') {
        vb.appendChild(h('button.btn.primary.sm', { style: { marginLeft: '10px' }, type: 'button', onclick: function () { self.setPhase('af'); } }, '进入 ② 探 a-F →'));
      }
      box.appendChild(vb);
    } else if (mr.m.segs.length >= 4) {
      var aVal = mr.an.aZhuCha;
      var recBtn = h('button.btn.primary.sm', {
        type: 'button', disabled: !!tape._recorded,
        onclick: function () {
          tape._recorded = true;
          self.pushDataPoint({
            M: tape.M, m: tape.m, theta: tape.theta,
            forceMode: tape.forceMode, apparatus: 'timer', ideal: tape.ideal,
            F_mg: tape.F_mg, F_sensor: tape.F_sensor,
            a: aVal, aTrue: tape.run.a
          });
          self.renderAnalysis();
        }
      }, tape._recorded ? '✓ 已记入数据表' : '记入实验数据 (a = ' + aVal.toFixed(3) + ' m/s²)');
      box.appendChild(h('div.side-row', { style: { marginTop: '8px' } },
        h('span', { html: '逐差法求得：<b>a = ' + aVal.toFixed(3) + ' m/s²</b>（模型真值 ' + tape.run.a.toFixed(3) + ' m/s²）' }),
        recBtn));
    } else {
      box.appendChild(h('div.verdict.warn', '当前起点 O 之后不足 4 段连续区间，请点击左侧更早的点作为起点 O 或减小计数间隔（如每2点 / 每点）后用逐差法计算加速度。'));
    }
    el.appendChild(box);
  };

  Bench.prototype.renderDatasetSection = function (el) {
    var self = this, isAM = this.phase === 'am';
    var list = isAM ? this.dataAM : this.dataAF;
    var box = h('div.ana-block');
    var head = h('div.ana-head',
      h('h2.ana-h', isAM ? '③ 控 F 探 a-1/M 数据与图像' : '② 控 M 探 a-F 数据与图像'),
      h('div.side-row',
        h('button.btn.sm', {
          type: 'button',
          onclick: function () { if (isAM) self.quickBatchAM(); else self.quickBatchAF(); }
        }, isAM ? '一键采集 6 组变质量 (200~800g)' : '一键采集 8 组槽码 (10~250g)'),
        list.length ? h('button.btn.sm', {
          type: 'button',
          onclick: function () { if (isAM) self.dataAM = []; else self.dataAF = []; self.renderAnalysis(); }
        }, '清空数据') : null));
    box.appendChild(head);

    if (!list.length) {
      box.appendChild(h('div.muted', '暂无已记录数据。在上方释放小车测出加速度后点击“记入实验数据”，或直接点击右上“一键采集”生成实时物理模型数据对比规律。'));
      el.appendChild(box);
      return;
    }

    var grid = h('div.ana-grid');
    // 左：数据表
    var tblWrap = h('div.tbl-wrap');
    if (!isAM) {
      var rowsAF = list.map(function (d, idx) {
        return h('tr',
          h('td', String(idx + 1)),
          h('td', d.M.toFixed(3)),
          h('td', d.m.toFixed(3)),
          h('td', d.F_mg.toFixed(3)),
          h('td', d.F_sensor.toFixed(3)),
          h('td', h('b', d.a.toFixed(3))),
          h('td', h('button.link.sm', { type: 'button', onclick: function () { list.splice(idx, 1); self.renderAnalysis(); } }, '删')));
      });
      tblWrap.appendChild(h('table.dt', { style: { width: '100%' } },
        h('tr', h('th', '#'), h('th', 'M/kg'), h('th', 'm/kg'), h('th', 'mg/N'), h('th', 'F_T/N'), h('th', 'a/(m·s⁻²)'), h('th', '操作')),
        rowsAF));
    } else {
      var rowsAM = list.map(function (d, idx) {
        var fUse = self.forceMode === 'sensor' ? d.F_sensor : d.F_mg;
        return h('tr',
          h('td', String(idx + 1)),
          h('td', d.M.toFixed(3)),
          h('td', d.invM.toFixed(2)),
          h('td', fUse.toFixed(3)),
          h('td', h('b', d.a.toFixed(3))),
          h('td', (d.a * d.M).toFixed(3)),
          h('td', h('button.link.sm', { type: 'button', onclick: function () { list.splice(idx, 1); self.renderAnalysis(); } }, '删')));
      });
      tblWrap.appendChild(h('table.dt', { style: { width: '100%' } },
        h('tr', h('th', '#'), h('th', 'M/kg'), h('th', '1/M / kg⁻¹'), h('th', 'F/N'), h('th', 'a/(m·s⁻²)'), h('th', 'a·M'), h('th', '操作')),
        rowsAM));
    }
    grid.appendChild(tblWrap);

    // 右：实时图表
    var chartWrap = h('div');
    if (!isAM) {
      var swAF = h('div.side-row',
        h('button.chip' + (!this.afCompare ? '.on' : ''), { type: 'button', onclick: function () { self.afCompare = false; self.renderAnalysis(); } }, this.forceMode === 'sensor' ? '当前：力传感器 F_T' : '当前：槽码重力 mg'),
        h('button.chip' + (this.afCompare ? '.on' : ''), { type: 'button', onclick: function () { self.afCompare = true; self.renderAnalysis(); } }, '同屏对比：普通细绳弯曲 vs 力传感器直线'));
      chartWrap.appendChild(swAF);

      var ptsUsed = list.map(function (d) { return [self.forceMode === 'sensor' ? d.F_sensor : d.F_mg, d.a]; });
      var ptsMg = list.map(function (d) { return [d.F_mg, d.a]; });
      var ptsFt = list.map(function (d) { return [d.F_sensor, d.a]; });
      var maxF = Math.max(0.5, Math.max.apply(null, ptsMg.map(function (p) { return p[0]; })) * 1.1);
      var maxA = Math.max(1.0, Math.max.apply(null, ptsMg.map(function (p) { return p[1]; })) * 1.15);
      var chAF = new ML.Chart(chartWrap, { xLabel: 'F / N', yLabel: 'a / (m·s⁻²)', height: 260, paper: true, x: [0, maxF], y: [0, maxA] });
      var seriesAF = [];
      if (this.afCompare) {
        seriesAF.push({ pts: ptsFt, fit: ptsFt.length >= 2, color: '#1661FF', label: '力传感器 F_T' });
        seriesAF.push({ pts: ptsMg, color: '#C7374B', mark: 'x', label: '普通绳 mg (下弯)' });
      } else {
        seriesAF.push({ pts: ptsUsed, fit: ptsUsed.length >= 2, color: this.forceMode === 'sensor' ? '#12A9C4' : '#1661FF', label: this.forceMode === 'sensor' ? 'a - F_T' : 'a - mg' });
      }
      chAF.set(seriesAF);
      var rawFitPts = this.afCompare ? ptsFt : ptsUsed;
      var fitPts = rawFitPts.filter(function (p) { return p[1] > 1e-4; });
      if (fitPts.length >= 2) {
        var lf = P.linfit(fitPts.map(function (p) { return p[0]; }), fitPts.map(function (p) { return p[1]; }));
        var hasLargeM = list.some(function (d) { return d.m / d.M > 0.10; });
        var isCurvedMg = !this.afCompare && this.forceMode === 'string' && hasLargeM && lf.r2 < 0.996;
        var interceptNote;
        if (isCurvedMg) {
          var ftMoving = ptsFt.filter(function (p) { return p[1] > 1e-4; });
          var lfFt = ftMoving.length >= 2 ? P.linfit(ftMoving.map(function (p) { return p[0]; }), ftMoving.map(function (p) { return p[1]; })) : lf;
          interceptNote = '<b>大槽码下 a-mg 明显向下弯曲</b>（拟合易虚高纵截距），请切换“力传感器”或开启“同屏对比”检验直线！' +
            (Math.abs(lfFt.b) < 0.04 ? '（按真实拉力 F_T 拟合则过原点）' : (lfFt.b < -0.04 ? '（且存在补偿不足横截距）' : '（且存在补偿过度纵截距）'));
        } else {
          interceptNote = Math.abs(lf.b) < 0.04 ? '图线几乎过原点，阻力平衡良好。'
            : (lf.b < -0.04 ? '纵截距为负（交于 F 轴正半轴 F₀ ≈ ' + (-lf.b / lf.k).toFixed(3) + ' N）：补偿阻力不足！'
                             : '纵截距为正（a₀ ≈ ' + lf.b.toFixed(3) + ' m/s²）：补偿阻力过度！');
        }
        chartWrap.appendChild(h('div.cmp-note', { html: '线性拟合斜率 k = <b>' + lf.k.toFixed(3) + ' kg⁻¹</b>（理论 1/M = ' + (1 / list[0].M).toFixed(3) + ' kg⁻¹），R² = <b>' + lf.r2.toFixed(4) + '</b>。<br>' + interceptNote }));
      }
    } else {
      var swAM = h('div.side-row',
        h('button.chip' + (this.amView === 'curve' ? '.on' : ''), { type: 'button', onclick: function () { self.amView = 'curve'; self.renderAnalysis(); } }, 'a-M 曲线'),
        h('button.chip' + (this.amView === 'inv' ? '.on' : ''), { type: 'button', onclick: function () { self.amView = 'inv'; self.renderAnalysis(); } }, 'a-1/M 直线（化曲为直）'),
        h('button.chip' + (this.amView === 'invA' ? '.on' : ''), { type: 'button', onclick: function () { self.amView = 'invA'; self.renderAnalysis(); } }, '1/a-M 直线'));
      chartWrap.appendChild(swAM);

      if (this.amView === 'curve') {
        var ptsC = list.map(function (d) { return [d.M, d.a]; });
        var chC = new ML.Chart(chartWrap, { xLabel: 'M / kg', yLabel: 'a / (m·s⁻²)', height: 260, paper: true, x: [0, 0.9] });
        chC.set([{ pts: ptsC, color: '#E07B24', label: 'a - M（曲线，难直接判反比）' }]);
        chartWrap.appendChild(h('div.cmp-note', '直接作 a-M 图像是递减曲线，请切换到“a-1/M 直线”化曲为直！'));
      } else if (this.amView === 'inv') {
        var ptsI = list.map(function (d) { return [d.invM, d.a]; });
        var chI = new ML.Chart(chartWrap, { xLabel: '1/M / kg⁻¹', yLabel: 'a / (m·s⁻²)', height: 260, paper: true, x: [0, 5.5] });
        chI.set([{ pts: ptsI, fit: ptsI.length >= 2, color: '#1661FF', label: 'a - 1/M（化曲为直）' }]);
        if (ptsI.length >= 2) {
          var lfI = P.linfit(ptsI.map(function (p) { return p[0]; }), ptsI.map(function (p) { return p[1]; }));
          chartWrap.appendChild(h('div.cmp-note', { html: '化曲为直拟合：斜率 k = <b>' + lfI.k.toFixed(4) + ' N</b>，线性度 R² = <b>' + lfI.r2.toFixed(5) + '</b>' + (lfI.r2 > 0.999 ? '（R² &gt; 0.999，确证 a ∝ 1/M）' : '') }));
        }
      } else {
        var validInvA = list.filter(function (d) { return isFinite(d.invA); });
        var ptsIA = validInvA.map(function (d) { return [d.M, d.invA]; });
        var chIA = new ML.Chart(chartWrap, { xLabel: 'M / kg', yLabel: '1/a / (m·s⁻²)⁻¹', height: 260, paper: true, x: [0, 0.9] });
        chIA.set([{ pts: ptsIA, fit: ptsIA.length >= 2, color: '#25A870', label: '1/a - M 图像' }]);
        if (ptsIA.length >= 2) {
          var lfIA = P.linfit(ptsIA.map(function (p) { return p[0]; }), ptsIA.map(function (p) { return p[1]; }));
          chartWrap.appendChild(h('div.cmp-note', { html: '由 a = mg/(M+m) 得 1/a = M/(mg) + 1/g：斜率 k = <b>' + lfIA.k.toFixed(2) + '</b>，纵截距 b = <b>' + lfIA.b.toFixed(3) + '</b>（1/g ≈ 0.102），R² = <b>' + lfIA.r2.toFixed(5) + '</b>' }));
        }
      }
    }

    grid.appendChild(chartWrap);
    box.appendChild(grid);
    el.appendChild(box);
  };

  /* =====================================================================
   *  ③ 诊·误差：四拍试一试 & 结果反推适配器
   * ===================================================================== */
  function stripRow(area, label, cls, run, timer, extra) {
    var row = h('div.cmp-row', h('div.cmp-k.' + cls, label));
    area.appendChild(row);
    var s = new TV.TapeStrip(row, { height: 84 });
    s.set(Object.assign({ dots: run.dots.slice(0, maxValidDotIndex(run) + 1), timer: timer || 'em', blankText: '（纸带上没有点）' }, extra || {}));
    return s;
  }

  function fitBoth(strips, maxS) {
    return setTimeout(function () {
      strips.forEach(function (s) {
        if (!s || !s.stage || !s.stage.wrap || !s.stage.wrap.isConnected) return;
        s.scale = (Math.max(240, s.stage.w) - 40) / Math.max(0.12, maxS);
        s.offset = -0.004;
        s.stage.invalidate();
      });
    }, 25);
  }

  var adapter = {
    compare: function (err, area, done) {
      var timers = [];
      function defer(fn, ms) {
        var tid = setTimeout(function () { if (area && area.isConnected) fn(); }, ms);
        timers.push(tid);
        return tid;
      }
      var id = err.id, th0 = T.compensateAngle({ M: 0.4, timer: 'em', ideal: false });
      if (id === 'E1' || id === 'E2') {
        var badTh = id === 'E1' ? 0 : 3.2;
        var rGood = T.run({ M: 0.4, m: 0, v0: 0.35, theta: th0, timer: 'em', ideal: false }, 15);
        var rBad = T.run({ M: 0.4, m: 0, v0: 0.35, theta: badTh, timer: 'em', ideal: false }, 15);
        var s1 = stripRow(area, '恰当补偿(' + th0.toFixed(2) + '°)', 'good', rGood, 'em');
        var s2 = stripRow(area, (id === 'E1' ? '未补偿(0°)' : '补偿过度(3.2°)'), 'bad', rBad, 'em');
        timers.push(fitBoth([s1, s2], 0.72));

        var ms = [0.01, 0.02, 0.04, 0.06, 0.08, 0.10];
        var ptsGood = [], ptsBad = [];
        ms.forEach(function (m) {
          var pG = { M: 0.4, m: m, theta: th0, timer: 'em', ideal: false };
          var pB = { M: 0.4, m: m, theta: badTh, timer: 'em', ideal: false };
          ptsGood.push([T.tension(pG), T.accel(pG)]);
          ptsBad.push([T.tension(pB), Math.max(0, T.accel(pB))]);
        });
        var ch = new ML.Chart(area, { xLabel: 'F / N', yLabel: 'a / (m·s⁻²)', height: 220, paper: true, x: [0, 0.9], y: [0, 2.5] });
        var fitBadPts = ptsBad.filter(function (p) { return p[1] > 0.001; });
        var lfB = P.linfit(fitBadPts.map(function (p) { return p[0]; }), fitBadPts.map(function (p) { return p[1]; }));
        ch.set([
          { pts: ptsGood, fit: true, color: '#25A870', label: '恰当补偿（过原点）' },
          { pts: ptsBad, line: [[0, lfB.b], [0.85, lfB.k * 0.85 + lfB.b]], color: '#C7374B', mark: 'x', label: id === 'E1' ? '未补偿（正横截距）' : '过度（正纵截距）' }
        ], [id === 'E1' ? { x: -lfB.b / lfB.k + 0.02, y: 0.15, text: '横截距 F₀≈' + (-lfB.b / lfB.k).toFixed(2) + 'N', color: '#C7374B' } : { x: 0.03, y: lfB.b + 0.12, text: '纵截距 a₀≈' + lfB.b.toFixed(2) + 'm/s²', color: '#C7374B' }]);
        area.appendChild(h('div.cmp-note', id === 'E1'
          ? '不挂槽码轻推：0° 时受阻力减速，22.6 cm 就停下；作 a-F 图出现正横截距 F₀ ≈ 0.11 N。'
          : '不挂槽码轻推：3.2° 时点距越来越疏（a ≈ +0.28 m/s²）；作 a-F 图出现正纵截距 a₀ ≈ 0.28 m/s²。'));
        defer(done, 250);
      } else if (id === 'E3') {
        var th3 = T.compensateAngle({ M: 0.4, timer: 'em', ideal: S.ideal });
        var ms3 = [0.01, 0.02, 0.04, 0.06, 0.10, 0.15, 0.20, 0.25];
        var ptsMg = [], ptsFt = [], rows = [];
        ms3.forEach(function (m) {
          var p3 = { M: 0.4, m: m, theta: th3, timer: 'em', ideal: S.ideal };
          var a = T.accel(p3), ft = T.tension(p3), mg = m * P.G;
          ptsMg.push([mg, a]); ptsFt.push([ft, a]);
          rows.push(h('tr' + (m >= 0.10 ? '.hl' : ''),
            h('td', Math.round(m * 1000) + ' g'),
            h('td', (m / 0.4 * 100).toFixed(1) + '%'),
            h('td', mg.toFixed(3)),
            h('td', ft.toFixed(3)),
            h('td', ((mg - ft) / mg * 100).toFixed(1) + '%')));
        });
        var ch3 = new ML.Chart(area, { xLabel: 'F / N', yLabel: 'a / (m·s⁻²)', height: 220, paper: true, x: [0, 2.6], y: [0, 4.2] });
        ch3.set([
          { pts: ptsFt, fit: true, color: '#1661FF', label: '力传感器 F_T（直线）' },
          { pts: ptsMg, color: '#C7374B', mark: 'x', label: '普通细绳 mg（下弯）' }
        ]);
        area.appendChild(h('div.tbl-wrap', h('table.dt.cmp-table',
          h('tr', h('th', '槽码 m'), h('th', 'm / M'), h('th', 'mg / N'), h('th', '真实 F_T / N'), h('th.bad', '偏差 (mg−F_T)/mg')),
          rows)));
        defer(done, 250);
      } else if (id === 'E4') {
        var thNoTape = T.compensateAngle({ M: 0.4, timer: 'none', ideal: false });
        var rNoTapeAfter = T.run({ M: 0.4, m: 0, v0: 0.35, theta: thNoTape, timer: 'em', ideal: false }, 19);
        var rGood4 = T.run({ M: 0.4, m: 0, v0: 0.35, theta: th0, timer: 'em', ideal: false }, 19);
        var sA = stripRow(area, '穿纸带调平(' + th0.toFixed(2) + '°)', 'good', rGood4, 'em');
        var sB = stripRow(area, '未穿纸带调平(' + thNoTape.toFixed(2) + '°)', 'bad', rNoTapeAfter, 'em');
        timers.push(fitBoth([sA, sB], 0.72));
        var aMiss = T.accel({ M: 0.4, m: 0, v0: 0.35, theta: thNoTape, timer: 'em', ideal: false });
        var aWithM = T.accel({ M: 0.4, m: 0.02, theta: 0, timer: 'em', ideal: false });
        area.appendChild(h('div.cmp-note', { html: '① <b>未穿纸带调平：</b>只平衡了轨道摩擦（θ = ' + thNoTape.toFixed(2) + '°），正式实验穿上纸带后多出 f<sub>纸带</sub> = 0.030 N 阻力未被平衡，轻推减速 a = ' + aMiss.toFixed(3) + ' m/s²。<br>② <b>挂着槽码调平：</b>若挂着 20 g 槽码调到“匀速”，实际多抵消了 0.196 N 拉力，正式实验再用槽码重力当作合外力，相当于平白扣除 0.196 N 阻力（类似 θ = 0° 下 a = ' + aWithM.toFixed(3) + ' m/s² 偏小）。' }));
        defer(done, 250);
      } else if (id === 'E5') {
        var thSpark = T.compensateAngle({ M: 0.4, timer: 'spark', ideal: false });
        var r300 = T.run({ M: 0.3, m: 0, v0: 0.35, theta: thSpark, timer: 'spark', power: 'ac220', ideal: false }, 23);
        var r600 = T.run({ M: 0.6, m: 0, v0: 0.35, theta: thSpark, timer: 'spark', power: 'ac220', ideal: false }, 23);
        var s3 = stripRow(area, 'M = 0.300 kg', 'good', r300, 'spark');
        var s6 = stripRow(area, 'M = 0.600 kg', 'good', r600, 'spark');
        timers.push(fitBoth([s3, s6], 0.72));
        var m3 = measureRun(r300, { ideal: true }), m6 = measureRun(r600, { ideal: true });
        area.appendChild(h('div.cmp-note', { html: '同一倾角 θ₀ = ' + thSpark.toFixed(2) + '° 下：<br>M = 0.300 kg 时各段（cm）：' + m3.m.segs.slice(0, 5).map(cm).join('、') + '（a = ' + r300.a.toFixed(4) + ' m/s²）<br>M = 0.600 kg 时各段（cm）：' + m6.m.segs.slice(0, 5).map(cm).join('、') + '（a = ' + r600.a.toFixed(4) + ' m/s²）<br>两条纸带点距几乎完全均匀，无需重新补偿阻力！' }));
        defer(done, 250);
      } else if (id === 'E6') {
        var th6 = T.compensateAngle({ M: 0.4, timer: 'spark', ideal: S.ideal });
        var Ms = [0.20, 0.30, 0.40, 0.50, 0.60, 0.80];
        var ptsC = [], ptsL = [];
        Ms.forEach(function (Mval) {
          var a = T.accel({ M: Mval, m: 0.020, theta: th6, timer: 'spark', ideal: S.ideal });
          ptsC.push([Mval, a]); ptsL.push([1 / Mval, a]);
        });
        var split = h('div.cmp-split');
        var b1 = h('div.cmp-box', h('div.cmp-box-t', '直接作 a-M 图像（曲线，难定关系）'));
        var b2 = h('div.cmp-box', h('div.cmp-box-t', '化曲为直：a-1/M 图像（过原点直线）'));
        split.appendChild(b1); split.appendChild(b2); area.appendChild(split);
        var chA = new ML.Chart(b1, { xLabel: 'M / kg', yLabel: 'a / (m·s⁻²)', height: 210, paper: true, x: [0, 0.9], y: [0, 1.3] });
        chA.set([{ pts: ptsC, color: '#E07B24' }]);
        var chB = new ML.Chart(b2, { xLabel: '1/M / kg⁻¹', yLabel: 'a / (m·s⁻²)', height: 210, paper: true, x: [0, 5.5], y: [0, 1.3] });
        chB.set([{ pts: ptsL, fit: true, color: '#1661FF' }]);
        var lf6 = P.linfit(ptsL.map(function (p) { return p[0]; }), ptsL.map(function (p) { return p[1]; }));
        area.appendChild(h('div.cmp-note', '同一组数据：a-M 是向下弯曲曲线；改作 a-1/M 后线性度 R² = ' + lf6.r2.toFixed(5) + '，呈过原点直线，确证 a ∝ 1/M。'));
        defer(done, 250);
      }
      return function () {
        timers.forEach(function (tid) { clearTimeout(tid); });
        timers.length = 0;
      };
    },

    show: function (c, vis) {
      var sh = c.show, th0 = T.compensateAngle({ M: 0.4, timer: 'em', ideal: true });
      if (sh.type === 'af-under' || sh.type === 'af-over') {
        var badTh = sh.type === 'af-under' ? 0 : 3.2;
        var ms = [0.01, 0.02, 0.04, 0.06, 0.08, 0.10];
        var pts = ms.map(function (m) {
          var p = { M: 0.4, m: m, theta: badTh, timer: 'em', ideal: false };
          return [T.tension(p), Math.max(0, T.accel(p))];
        });
        var fp = pts.filter(function (q) { return q[1] > 0.001; });
        var lf = P.linfit(fp.map(function (q) { return q[0]; }), fp.map(function (q) { return q[1]; }));
        var ch = new ML.Chart(vis, { xLabel: 'F / N', yLabel: 'a / (m·s⁻²)', height: 220, paper: true, x: [0, 0.9], y: [0, 2.5] });
        ch.set([{ pts: pts, line: [[0, lf.b], [0.85, lf.k * 0.85 + lf.b]], color: '#C7374B' }]);
      } else if (sh.type === 'af-bend') {
        var msB = [0.01, 0.02, 0.04, 0.06, 0.10, 0.15, 0.20, 0.25];
        var ptsB = msB.map(function (m) {
          return [m * P.G, T.accel({ M: 0.4, m: m, theta: th0, timer: 'em', ideal: true })];
        });
        var chB = new ML.Chart(vis, { xLabel: 'F(mg) / N', yLabel: 'a / (m·s⁻²)', height: 220, paper: true, x: [0, 2.6], y: [0, 5.2] });
        chB.set([
          { pts: [], line: [[0, 0], [2.0, 2.0 / 0.4]], color: '#8E99A6', dash: true, label: '理想斜率 1/M' },
          { pts: ptsB, color: '#C7374B', label: '实测 a-mg（末端下弯）' }
        ]);
      } else if (sh.type === 'inv-a-M') {
        var Ms = [0.40, 0.50, 0.60, 0.75, 0.90];
        var ptsA = Ms.map(function (Mval) { return [Mval, 1 / T.accel({ M: Mval, m: 0.08, theta: 0, timer: 'none', ideal: true })]; });
        var ptsB = Ms.map(function (Mval) { return [Mval, 1 / T.accel({ M: Mval, m: 0.06, theta: 0, timer: 'none', ideal: true })]; });
        var chI = new ML.Chart(vis, { xLabel: 'M / kg', yLabel: '1/a / (m·s⁻²)⁻¹', height: 220, paper: true, x: [0, 1.0], y: [0, 1.8] });
        chI.set([
          { pts: ptsA, fit: true, color: '#1661FF', label: '甲组' },
          { pts: ptsB, fit: true, color: '#C7374B', label: '乙组' }
        ]);
      }
    },

    restore: function () {
      var ref = roundDeg(T.compensateAngle({ M: 0.4, timer: 'em', ideal: S.ideal }));
      if (!bench) {
        S.mode = 'guided';
        S.bench = Object.assign(S.bench || {}, { apparatus: 'timer', forceMode: 'string', timer: 'em', power: 'ac8', M: 0.400, theta: ref });
        ML.store.save();
        return;
      }
      bench.setBanner(null);
      bench.setMode('guided', true);
      bench.setApparatus('timer');
      bench.setForceMode('string');
      bench.reset({
        timer: 'em', power: 'ac8', threaded: true, M: 0.400,
        m: bench.phase === 'balance' ? 0 : 0.020,
        theta: ref, startAt: 0
      });
      bench.renderAnalysis();
    },

    replay: function (errId) {
      var e = ERR[errId]; if (!e) return;
      shell.go('bench');
      bench.setMode('free', true);
      bench.setApparatus('timer');
      if (errId === 'E1') {
        bench.setPhase('balance', true);
        bench.reset({ timer: 'em', power: 'ac8', threaded: true, M: 0.400, m: 0, theta: 0, startAt: 0 });
        bench.setForceMode('string');
        bench.setBanner('<b>复现：' + e.name + '</b>　已设为 θ = 0°、M = 400 g、m = 0。可直接点“轻推小车 (m=0)”看减速停下，或点击下方“数据表与图像 →”一键采集 8 组槽码观察横截距。');
      } else if (errId === 'E2') {
        bench.setPhase('af', true);
        bench.reset({ timer: 'em', power: 'ac8', threaded: true, M: 0.400, m: 0, theta: 3.2, startAt: 0 });
        bench.setForceMode('string');
        bench.setBanner('<b>复现：' + e.name + '</b>　已设为 θ = 3.20°（偏大）、m = 0。点“轻推小车 (m=0)”或一键采集槽码观察正纵截距。');
      } else if (errId === 'E3') {
        bench.setPhase('af', true);
        bench.reset({ timer: 'em', power: 'ac8', threaded: true, M: 0.400, m: 0.200, theta: bench.refAngle(), startAt: 0 });
        bench.setForceMode('string');
        bench.quickBatchAF();
        bench.afCompare = true; bench.renderAnalysis({ scroll: true });
        bench.setBanner('<b>复现：' + e.name + '</b>　已在下方生成 10 g ～ 250 g 实验数据并开启“普通细绳 vs 力传感器”同屏对比。');
      } else if (errId === 'E4') {
        bench.setPhase('balance', true);
        bench.reset({ timer: 'em', power: 'ac8', threaded: false, M: 0.400, m: 0, theta: 1.15, startAt: 0 });
        bench.setBanner('<b>复现：' + e.name + '</b>　未穿纸带时 θ = 1.15° 看似平衡；点“穿纸带”并通电轻推看是否减速。');
      } else if (errId === 'E5') {
        var th5 = roundDeg(T.compensateAngle({ M: 0.4, timer: 'spark', ideal: S.ideal }));
        bench.setPhase('am', true);
        bench.reset({ timer: 'spark', power: 'ac220', threaded: true, M: 0.600, m: 0, theta: th5, startAt: 0 });
        bench.setBanner('<b>复现：' + e.name + '</b>　保持同一平衡倾角 θ = ' + th5.toFixed(2) + '°，已把小车质量调为 600 g、槽码 0 g，直接“接通电源”后“轻推小车”看点迹是否仍均匀。');
      } else if (errId === 'E6') {
        var th6 = bench.refAngle();
        bench.setPhase('am', true);
        bench.reset({ timer: 'em', power: 'ac8', threaded: true, M: 0.400, m: 0.020, theta: th6, startAt: 0 });
        bench.quickBatchAM();
        bench.renderAnalysis({ scroll: true });
        bench.setBanner('<b>复现：' + e.name + '</b>　已在下方生成 6 组变质量数据，可一键在“a-M 曲线”与“a-1/M 直线”间切换。');
      }
      if (errId !== 'E3' && errId !== 'E6') {
        if (shell.main) shell.main.scrollTop = 0;
        window.scrollTo(0, 0);
      }
    }
  };

  function openTry(id) {
    var e = ERR[id];
    if (e) ML.TryIt(e, adapter, e.noteId && PROC[e.noteId] ? '<b>' + PROC[e.noteId].title + '：</b>' + PROC[e.noteId].how + ' ' + PROC[e.noteId].why : '');
  }

  /* =====================================================================
   *  ① 学·原理：交互小部件
   * ===================================================================== */
  function learnWidget(p, card) {
    var box = h('div.learn-widget');
    if (p.widget === 'compensate-demo') {
      card.appendChild(box);
      var state = { th: 'ok', M: 0.4 };
      var swTh = h('div.side-row',
        h('span.side-l', '垫高状态'),
        h('button.chip', { type: 'button', data: { t: 'zero' }, onclick: function () { state.th = 'zero'; upd(); } }, '未垫高 (0°)'),
        h('button.chip.on', { type: 'button', data: { t: 'ok' }, onclick: function () { state.th = 'ok'; upd(); } }, '恰好补偿 (1.22°)'),
        h('button.chip', { type: 'button', data: { t: 'over' }, onclick: function () { state.th = 'over'; upd(); } }, '补偿过度 (3.2°)'));
      var swM = h('div.side-row',
        h('span.side-l', '小车质量'),
        h('button.chip.on', { type: 'button', data: { m: '0.4' }, onclick: function () { state.M = 0.4; upd(); } }, 'M = 0.400 kg'),
        h('button.chip', { type: 'button', data: { m: '0.6' }, onclick: function () { state.M = 0.6; upd(); } }, 'M = 0.600 kg（重调了吗？）'));
      var stgWrap = h('div.comp-widget-stage');
      var stripBox = h('div');
      var note = h('div.cmp-note');
      box.appendChild(swTh); box.appendChild(swM); box.appendChild(stgWrap); box.appendChild(stripBox); box.appendChild(note);

      var stg = new ML.stage.Stage(stgWrap, { layers: ['bg'] });
      var strip = new TV.TapeStrip(stripBox, { height: 84 });
      var curInfo = { theta: 1.22, a: 0, gPar: 0, fRes: 0 };

      stg.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var rad = (curInfo.theta * 2.5) * Math.PI / 180;
        ctx.save(); ctx.translate(w * 0.14, hh * 0.72); ctx.rotate(-rad);
        ctx.fillStyle = '#D9B98C'; ctx.fillRect(0, 0, w * 0.72, 10);
        var cx = w * 0.34, cy = -32;
        ctx.fillStyle = D.grad(ctx, 0, cy, 0, 0, ['#5C8DEB', '#2E5FBF']);
        D.rr(ctx, cx - 34, cy, 68, 28, 5); ctx.fill();
        D.text(ctx, 'M=' + state.M.toFixed(1) + 'kg', cx, cy + 18, { align: 'center', size: 11.5, color: '#fff', weight: 700 });
        // 沿斜面下滑分力（向左）vs 阻力（向右）
        if (curInfo.gPar > 1e-4) {
          var lenG = Math.max(12, curInfo.gPar * 420);
          ctx.strokeStyle = '#2E9E5B'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(cx - 34, cy + 14); ctx.lineTo(cx - 34 - lenG, cy + 14);
          ctx.lineTo(cx - 28 - lenG, cy + 10); ctx.moveTo(cx - 34 - lenG, cy + 14); ctx.lineTo(cx - 28 - lenG, cy + 18); ctx.stroke();
          D.text(ctx, 'Mg sinθ=' + curInfo.gPar.toFixed(3) + 'N', cx - 38 - lenG, cy + 8, { align: 'right', size: 11.5, weight: 700, color: '#2E9E5B' });
        } else {
          D.text(ctx, 'Mg sinθ=0', cx - 42, cy + 18, { align: 'right', size: 11.5, weight: 700, color: '#2E9E5B' });
        }
        var lenF = Math.max(14, curInfo.fRes * 420);
        ctx.strokeStyle = '#E07B24'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx + 34, cy + 14); ctx.lineTo(cx + 34 + lenF, cy + 14);
        ctx.lineTo(cx + 28 + lenF, cy + 10); ctx.moveTo(cx + 34 + lenF, cy + 14); ctx.lineTo(cx + 28 + lenF, cy + 18); ctx.stroke();
        D.text(ctx, '阻力 f=' + curInfo.fRes.toFixed(3) + 'N', cx + 38 + lenF, cy + 8, { size: 11.5, weight: 700, color: '#E07B24' });
        ctx.restore();
      });

      function upd() {
        ML.$$('.chip', swTh).forEach(function (c) { c.classList.toggle('on', c.dataset.t === state.th); });
        ML.$$('.chip', swM).forEach(function (c) { c.classList.toggle('on', c.dataset.m === String(state.M)); });
        var th0 = T.compensateAngle({ M: 0.4, timer: 'spark', ideal: false });
        var th = state.th === 'zero' ? 0 : state.th === 'ok' ? th0 : 3.2;
        var run = T.run({ M: state.M, m: 0, v0: 0.35, theta: th, timer: 'spark', power: 'ac220', ideal: false }, 7);
        var rad = th * Math.PI / 180;
        curInfo.theta = th;
        curInfo.a = T.accel({ M: state.M, m: 0, v0: 0.35, theta: th, timer: 'spark', ideal: false });
        curInfo.gPar = state.M * P.G * Math.sin(rad);
        curInfo.fRes = 0.020 * state.M * P.G * Math.cos(rad) + 0.005;
        var dots = run.dots.slice(0, maxValidDotIndex(run) + 1);
        strip.set({ dots: dots, timer: 'spark' });
        setTimeout(function () {
          if (!stripBox.isConnected) return;
          strip.scale = (Math.max(240, strip.stage.w) - 40) / 0.72;
          strip.offset = -0.004; strip.stage.invalidate();
        }, 20);
        stg.invalidate('bg');
        note.innerHTML = '轻推后纸带加速度 a = <b>' + curInfo.a.toFixed(4) + ' m/s²</b>。' +
          (state.th === 'ok' ? '注意看：从 M = 0.4 kg 换到 0.6 kg，不用重调倾角，重力分力与摩擦力同时按比例增大，纸带点迹依然均匀！'
            : (state.th === 'zero' ? '未垫高时 Mg sinθ = 0，阻力使小车很快减速停下，点距越来越密。'
              : '垫得过高时 Mg sinθ &gt; f，不挂槽码也向左（往滑轮端）加速，点距越来越疏。'));
      }
      upd();
    } else if (p.widget === 'tension-demo') {
      card.appendChild(box);
      var mCur = 0.020, M0 = 0.400;
      var sw = h('div.side-row', h('span.side-l', '槽码 m'), [0.01, 0.02, 0.05, 0.10, 0.20].map(function (mv) {
        return h('button.chip' + (mv === mCur ? '.on' : ''), { type: 'button', data: { m: String(mv) }, onclick: function () { mCur = mv; upd(); } }, (mv * 1000) + ' g');
      }));
      var stgWrap = h('div.tens-widget-stage');
      var info = h('div.cmp-note');
      box.appendChild(sw); box.appendChild(stgWrap); box.appendChild(info);
      var stg = new ML.stage.Stage(stgWrap, { layers: ['bg'] });
      stg.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var th0 = T.compensateAngle({ M: M0, timer: 'spark', ideal: true });
        var a = T.accel({ M: M0, m: mCur, theta: th0, timer: 'spark', ideal: true });
        var ft = T.tension({ M: M0, m: mCur, theta: th0, timer: 'spark', ideal: true });
        var mg = mCur * P.G;
        // 左侧比值柱状条
        var maxW = Math.min(260, w * 0.46), x0 = 24;
        D.text(ctx, '槽码重力 mg = ' + mg.toFixed(3) + ' N', x0, 24, { size: 12, color: '#9A5A00', weight: 700 });
        ctx.fillStyle = '#E07B24'; ctx.fillRect(x0, 30, maxW, 20);
        var ftW = maxW * (ft / mg);
        D.text(ctx, '细绳实际拉力 F_T = ' + ft.toFixed(3) + ' N (' + (ft / mg * 100).toFixed(1) + '%)', x0, 68, { size: 12, color: '#1661FF', weight: 700 });
        ctx.fillStyle = '#1661FF'; ctx.fillRect(x0, 74, ftW, 20);
        D.text(ctx, '相对误差 (mg − F_T)/mg = m/(M+m) = ' + (mCur / (M0 + mCur) * 100).toFixed(1) + '%', x0, 122, { size: 12.5, weight: 700, color: '#C7374B' });
        // 右侧槽码失重示意图
        var rx = w * 0.78;
        ctx.fillStyle = '#8E99A6'; D.rr(ctx, rx - 20, 52, 40, 28, 4); ctx.fill();
        D.text(ctx, 'm', rx, 70, { align: 'center', size: 12, color: '#fff', weight: 700 });
        ctx.strokeStyle = '#1661FF'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(rx, 52); ctx.lineTo(rx, 24); ctx.stroke();
        D.text(ctx, 'F_T', rx + 8, 34, { size: 11.5, weight: 700, color: '#1661FF' });
        ctx.strokeStyle = '#2E9E5B';
        ctx.beginPath(); ctx.moveTo(rx, 80); ctx.lineTo(rx, 118); ctx.stroke();
        D.text(ctx, 'mg', rx + 8, 112, { size: 11.5, weight: 700, color: '#2E9E5B' });
        D.text(ctx, '向下加速 a=' + a.toFixed(2) + ' m/s²（失重）', rx, 138, { align: 'center', size: 11.5, color: '#4A5B73' });
      });
      function upd() {
        ML.$$('.chip', sw).forEach(function (c) { c.classList.toggle('on', c.dataset.m === String(mCur)); });
        var rel = mCur / (M0 + mCur) * 100;
        info.innerHTML = '小车 M = 400 g，槽码 m = <b>' + Math.round(mCur * 1000) + ' g</b>：' +
          (rel <= 5 ? '满足 m ≪ M（误差 ≤ 5%），可用 mg 近似代替绳拉力。'
                    : '<b>不满足 m ≪ M</b>（误差达 ' + rel.toFixed(1) + '%），用 mg 代替拉力已明显偏大，应改用<b>力传感器</b>直接测 F_T！');
        stg.invalidate('bg');
      }
      upd();
    } else if (p.widget === 'af-demo') {
      card.appendChild(box);
      var show = { ok: true, under: false, over: false, bend: true };
      var swAF = h('div.side-row',
        h('button.chip.on', { type: 'button', data: { k: 'ok' }, onclick: function () { show.ok = !show.ok; drawAF(); } }, '力传感器 / 正常直线'),
        h('button.chip.on', { type: 'button', data: { k: 'bend' }, onclick: function () { show.bend = !show.bend; drawAF(); } }, '普通绳大槽码弯曲'),
        h('button.chip', { type: 'button', data: { k: 'under' }, onclick: function () { show.under = !show.under; drawAF(); } }, '补偿不足 (横截距)'),
        h('button.chip', { type: 'button', data: { k: 'over' }, onclick: function () { show.over = !show.over; drawAF(); } }, '补偿过度 (纵截距)'));
      box.appendChild(swAF);
      var ch = new ML.Chart(box, { xLabel: 'F / N', yLabel: 'a / (m·s⁻²)', height: 220, paper: true, x: [0, 2.2], y: [0, 4.2] });
      function drawAF() {
        ML.$$('.chip', swAF).forEach(function (c) { c.classList.toggle('on', !!show[c.dataset.k]); });
        var th0 = T.compensateAngle({ M: 0.4, timer: 'em', ideal: false }), ms = [0.01, 0.02, 0.04, 0.06, 0.10, 0.15, 0.20];
        var ser = [];
        if (show.ok) ser.push({ pts: ms.map(function (m) { var pp = { M: 0.4, m: m, theta: th0, timer: 'em', ideal: false }; return [T.tension(pp), T.accel(pp)]; }), fit: true, color: '#1661FF', label: '传感器 F_T（直线）' });
        if (show.bend) ser.push({ pts: ms.map(function (m) { var pp = { M: 0.4, m: m, theta: th0, timer: 'em', ideal: false }; return [m * P.G, T.accel(pp)]; }), color: '#C7374B', mark: 'x', label: '普通绳 mg（下弯）' });
        if (show.under) ser.push({ pts: ms.slice(1, 6).map(function (m) { var pp = { M: 0.4, m: m, theta: 0, timer: 'em', ideal: false }; return [T.tension(pp), Math.max(0, T.accel(pp))]; }), fit: true, color: '#E07B24', label: '补偿不足(横截距)' });
        if (show.over) ser.push({ pts: ms.slice(0, 5).map(function (m) { var pp = { M: 0.4, m: m, theta: 3.2, timer: 'em', ideal: false }; return [T.tension(pp), T.accel(pp)]; }), fit: true, color: '#25A870', label: '补偿过度(纵截距)' });
        ch.set(ser);
      }
      drawAF();
    } else if (p.widget === 'am-demo') {
      card.appendChild(box);
      var modeAM = 'inv';
      var swAM = h('div.side-row',
        h('button.chip', { type: 'button', data: { v: 'curve' }, onclick: function () { modeAM = 'curve'; drawAM(); } }, 'a-M 曲线'),
        h('button.chip.on', { type: 'button', data: { v: 'inv' }, onclick: function () { modeAM = 'inv'; drawAM(); } }, 'a-1/M 直线'),
        h('button.chip', { type: 'button', data: { v: 'invA' }, onclick: function () { modeAM = 'invA'; drawAM(); } }, '1/a-M 直线'));
      box.appendChild(swAM);
      var chM = new ML.Chart(box, { xLabel: '1/M / kg⁻¹', yLabel: 'a / (m·s⁻²)', height: 215, paper: true, x: [0, 5.5] });
      function drawAM() {
        ML.$$('.chip', swAM).forEach(function (c) { c.classList.toggle('on', c.dataset.v === modeAM); });
        var Ms = [0.20, 0.30, 0.40, 0.50, 0.60, 0.80], th0 = T.compensateAngle({ M: 0.4, timer: 'spark', ideal: true });
        if (modeAM === 'curve') {
          chM.opts.xLabel = 'M / kg'; chM.opts.yLabel = 'a / (m·s⁻²)'; chM.opts.x = [0, 0.9];
          chM.set([{ pts: Ms.map(function (Mv) { return [Mv, T.accel({ M: Mv, m: 0.02, theta: th0, timer: 'spark', ideal: true })]; }), color: '#E07B24', label: 'a-M 曲线' }]);
        } else if (modeAM === 'inv') {
          chM.opts.xLabel = '1/M / kg⁻¹'; chM.opts.yLabel = 'a / (m·s⁻²)'; chM.opts.x = [0, 5.5];
          chM.set([{ pts: Ms.map(function (Mv) { return [1 / Mv, T.accel({ M: Mv, m: 0.02, theta: th0, timer: 'spark', ideal: true })]; }), fit: true, color: '#1661FF', label: 'a-1/M 过原点直线' }]);
        } else {
          chM.opts.xLabel = 'M / kg'; chM.opts.yLabel = '1/a / (m·s⁻²)⁻¹'; chM.opts.x = [0, 0.9];
          chM.set([
            { pts: Ms.map(function (Mv) { return [Mv, 1 / T.accel({ M: Mv, m: 0.04, theta: th0, timer: 'spark', ideal: true })]; }), fit: true, color: '#1661FF', label: 'm=40g（斜率小）' },
            { pts: Ms.map(function (Mv) { return [Mv, 1 / T.accel({ M: Mv, m: 0.02, theta: th0, timer: 'spark', ideal: true })]; }), fit: true, color: '#C7374B', label: 'm=20g（斜率大，同截距1/g）' }
          ]);
        }
      }
      drawAM();
    }
  }

  /* =====================================================================
   *  组装四区一卡
   * ===================================================================== */
  var shell = new ML.Shell({
    title: C.title, sub: C.sub, summary: C.summary,
    tabs: [
      { id: 'learn', label: '学·原理', mount: function (el) { ML.Learn(el, C.learn, C.equipment, { onPage: learnWidget, onFinish: function () { shell.go('bench'); } }); } },
      { id: 'bench', label: '做·实验', mount: function (el) { bench = new Bench(el); } },
      { id: 'diag', label: '诊·误差', mount: function (el) {
        var wrap = h('div.diag');
        el.appendChild(wrap);
        wrap.appendChild(h('h2.diag-h', 'A. 错误操作实验室'));
        wrap.appendChild(h('p.muted', '每个“试一试”按四拍进行：布置 → 运行 → 对比 → 追问与揭示。所有曲线、纸带均由物理模型实时算出。'));
        var grid = h('div.err-grid'), cardMap = {};
        C.errors.forEach(function (e) {
          var note = PROC[e.noteId];
          var card = h('div.err-card' + ((S.done || {})[e.id] ? '.done' : ''),
            h('div.err-name', ((S.done || {})[e.id] ? '✓ ' : '') + e.name),
            note ? h('div.err-note', { html: '<b>注意事项：</b>' + M.tex(note.how) }) : null,
            h('button.btn.primary.sm', { type: 'button', onclick: function () { openTry(e.id); } }, '试一试'));
          cardMap[e.id] = card;
          grid.appendChild(card);
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
        wrap.appendChild(h('p.muted', '看一张“出了问题”的实验图像，判断误差原因并回到实验台亲手复现。'));
        var rev = h('div.rev'); wrap.appendChild(rev);
        ML.Reverse(rev, C.reverse, adapter);
      } },
      { id: 'paper', label: '练·真题', mount: function (el) { new ML.Paper(el, Q, { title: C.title.replace('实验：', '') + ' · 练习', onReplay: adapter.replay }); } }
    ]
  });
  ML.bus.on('tab', function (tabId) {
    if (bench && bench.loop) bench.loop.setVisible(tabId === 'bench');
  });
  ML.bus.on('paper:graded', function () {});
  shell.go(S.tab);
  ML.perf.probe();
  ML.m03 = { bench: function () { return bench; }, adapter: adapter, shell: shell, gateMeasure: gateMeasure, measureRun: measureRun };
})(window.ML);
