/* M01 scene — 探究小车速度随时间变化的规律：实验台、纸带处理、光电门、诊断适配器、讲解小部件。 */
(function (ML) {
  'use strict';
  var h = ML.h, M = ML.math, P = ML.phys, T = ML.tape, D = ML.stage.draw, TV = ML.tapeView;
  var C = ML.json('ml-content'), Q = ML.json('ml-questions') || [];
  var S = ML.store.init(C.slug, { v: 1, tab: 'learn', learnPage: 0, mode: 'guided', ideal: false, bench: { timer: null, power: null, m: 0, near: false }, answers: {}, done: {} });
  var ERR = {}; C.errors.forEach(function (e) { ERR[e.id] = e; });
  var PROC = {}; C.procedure.forEach(function (p) { PROC[p.id] = p; });
  var TIMER_NAME = { em: '电磁打点计时器', spark: '电火花计时器' }, POWER_NAME = { ac8: '交流 8 V', ac220: '交流 220 V', dc8: '直流 8 V' };
  var seedCounter = 11;
  function noteOf(e) { var p = PROC[e.noteId]; return p ? p.how + ' ' + p.why : ''; }
  function cm(x) { return (x * 100).toFixed(2); }

  /* =====================================================================
   *  ② 做·实验
   * ===================================================================== */
  var bench = null;
  function Bench(el) {
    var self = this; this.el = el;
    this.mode = S.mode || 'guided'; this.apparatus = 'timer'; this.speed = 0.5; this.flag = 0.005; this.freq = 50;
    this.tapes = []; this.tapeSeq = 0; this.banner = null; this.showComp = false;
    // 顶栏
    var modeChips = h('div.seg', chip('引导模式', 'guided'), chip('自由模式', 'free'));
    function chip(label, v) { return h('button.chip', { type: 'button', data: { v: v }, onclick: function () { self.setMode(v); } }, label); }
    this.modeChips = modeChips;
    this.appChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'timer' }, onclick: function () { self.setApparatus('timer'); } }, '打点计时器'),
      h('button.chip', { type: 'button', data: { v: 'gate' }, onclick: function () { self.setApparatus('gate'); } }, '光电门'));
    this.freqChip = h('button.chip.freq-warn', { type: 'button', hidden: true, title: '点击恢复 50 Hz', onclick: function () { self.freq = 50; self.setBanner(null); self.reset(); ML.toast('已恢复标准电源频率 50 Hz', 'ok'); } }, '频率 51 Hz');
    this.idealChip = h('button.chip', { type: 'button', title: '理想：无阻力、无读数噪声', onclick: function () { S.ideal = !S.ideal; ML.store.save(); self.idealChip.classList.toggle('on', S.ideal); self.idealChip.textContent = S.ideal ? '理想条件' : '真实条件'; self.stage.invalidate(); } }, S.ideal ? '理想条件' : '真实条件');
    this.idealChip.classList.toggle('on', S.ideal);
    this.speedChip = h('button.chip', { type: 'button', onclick: function () { self.speed = self.speed === 1 ? 0.5 : self.speed === 0.5 ? 0.25 : 1; self.speedChip.textContent = '播放 ×' + self.speed; } }, '播放 ×0.5');
    this.bannerEl = h('div.bench-banner', { hidden: true });
    var top = h('div.bench-top', modeChips, this.appChips, this.freqChip, h('div.spacer'), this.idealChip, this.speedChip);
    this.stageWrap = h('div.bench-stage');
    this.side = h('aside.bench-side');
    this.holdBtn = h('button.btn.big.hold', { type: 'button', hidden: true, onclick: function () { self.hold(); } }, '按住小车');
    this.stageWrap.appendChild(this.holdBtn);
    this.analysis = h('section.analysis', { hidden: true });
    this.benchEl = h('div.bench', top, this.bannerEl, h('div.bench-row', this.stageWrap, this.side), this.analysis);
    el.appendChild(this.benchEl);
    this.stage = new ML.stage.Stage(this.stageWrap, { layers: ['bg', 'fg'] });
    this.stage.on('bg', function (ctx, w, hh) { self.drawBg(ctx, w, hh); });
    this.stage.on('fg', function (ctx, w, hh) { self.drawFg(ctx, w, hh); });
    this.loop = new ML.stage.Loop(function (dt) { return self.tick(dt); });
    this.bindPointer();
    this.reset();  // 先建好 this.b / this.done，setMode→renderSide 与首帧绘制都依赖它
    var savedBench = S.bench ? { timer: S.bench.timer || null, power: S.bench.power || null, m: typeof S.bench.m === 'number' ? S.bench.m : 0, near: !!S.bench.near } : null;
    this.setMode(this.mode, true);
    this.setApparatus('timer');
    if (savedBench) {
      this.b.timer = savedBench.timer; this.b.power = savedBench.power;
      this.b.m = savedBench.m; this.b.startAt = savedBench.near ? 0 : 0.30;
      this.check(true); this.stage.invalidate();
    }
  }
  Bench.prototype.updateFreqChip = function () {
    if (!this.freqChip) return;
    this.freqChip.hidden = this.freq === 50;
    this.freqChip.textContent = '电源 ' + this.freq + ' Hz（恢复 50 Hz）';
  };
  Bench.prototype.saveBench = function () {
    var b = this.b;
    ML.store.set({ bench: { timer: b.timer, power: b.power, m: b.m, near: b.startAt < 0.03 } });
  };
  Bench.prototype.reset = function (opts) {
    opts = opts || {};
    this.freq = 50;
    this.b = { timer: null, power: null, threaded: false, m: 0, startAt: this.apparatus === 'gate' ? 0 : 0.30, theta: 0, powered: false, released: false, order: [], caught: false, running: false, t: 0, run: null, done: false, powerT: null, warn: '' };
    this.pendingTags = [];
    if (!opts.keepDone) this.done = {};
    this.updateFreqChip();
    if (this.loop) this.loop.stop();
    if (this.holdBtn) this.holdBtn.hidden = true;
    if (this.stage) { this.stage.invalidate(); this.renderSide(); }
  };
  Bench.prototype.params = function () {
    var b = this.b;
    return { timer: b.timer || 'em', power: b.power || 'ac8', M: 0.4, m: b.m || 0, theta: b.theta || 0, ideal: S.ideal, freq: this.freq || 50, startAt: b.startAt, threaded: b.threaded, caught: b.caught,
      order: b.order[0] === 'release' ? 'release-first' : 'power-first', lag: b.lag, near: b.startAt < 0.03 };
  };
  Bench.prototype.setMode = function (m, silent) {
    this.mode = m; S.mode = m; ML.store.save();
    ML.$$('.chip', this.modeChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === m); });
    if (!silent) { this.showComp = false; this.reset(); this.setBanner(null); ML.toast(m === 'guided' ? '引导模式：按步骤操作，做错会提示原因' : '自由模式：不拦截任何操作，结果按物理真实产生'); }
    this.renderSide();
  };
  Bench.prototype.setApparatus = function (a) {
    this.apparatus = a; ML.$$('.chip', this.appChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === a); });
    this.showComp = false; this.gate = null; this.reset(); this.renderSide(); this.analysis.hidden = a !== 'timer' || !this.tapes.length;
  };
  Bench.prototype.setBanner = function (html) {
    this.bannerEl.hidden = !html;
    this.bannerEl.innerHTML = html || '';
    if (this.benchEl) this.benchEl.classList.toggle('has-banner', !!html);
  };

  /* ---------- 几何 ---------- */
  Bench.prototype.geo = function () {
    var w = this.stage.w, hh = this.stage.h, k = w / 1.36, ox = 0.11 * k;
    return { k: k, X: function (x) { return ox + x * k; }, top: Math.min(hh * 0.46, 0.30 * k + 60), w: w, h: hh, timerX: 0.08, cart0: 0.16, pulley: 1.12 };
  };
  Bench.prototype.cartRear = function () { var b = this.b; return 0.16 + b.startAt + (b.run ? b.run.s(b.t) : 0); };
  /* ---------- 静态层 ---------- */
  Bench.prototype.drawBg = function (ctx, w, hh) {
    var g = this.geo(), X = g.X, k = g.k, top = g.top;
    ctx.fillStyle = '#EAF1F8'; ctx.fillRect(0, 0, w, hh);
    // 桌面
    ctx.fillStyle = D.grad(ctx, 0, top + 0.03 * k, 0, hh, ['#C9A97A', '#B48F5C']); ctx.fillRect(0, top + 0.03 * k, X(1.13), hh);
    ctx.fillStyle = '#A5814F'; ctx.fillRect(0, top + 0.03 * k, X(1.13), 3);
    // 长木板
    ctx.fillStyle = D.grad(ctx, 0, top, 0, top + 0.03 * k, ['#E6CBA2', '#D9B98C', '#C49F6B']);
    ctx.fillRect(X(-0.02), top, (1.14) * k, 0.03 * k);
    // 滑轮
    if (this.apparatus) {
      var px = X(g.pulley), py = top - 0.005 * k, r = 0.028 * k;
      ctx.fillStyle = '#8E99A6'; ctx.fillRect(px - 3, py, 6, 0.04 * k);
      ctx.fillStyle = D.grad(ctx, px - r, py - r, px + r, py + r, ['#D5DCE3', '#8E99A6']); ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#596574'; ctx.beginPath(); ctx.arc(px, py, r * 0.25, 0, Math.PI * 2); ctx.fill();
    }
    if (this.apparatus === 'gate') this.drawGates(ctx, g);
  };
  Bench.prototype.drawGates = function (ctx, g) {
    var X = g.X, k = g.k, top = g.top, self = this;
    [0.20, 0.60].forEach(function (p, i) {
      var x = X(0.16 + 0.16 + p);  // 遮光片在车头处，前沿位置 = 车尾 + 0.16
      ctx.fillStyle = '#3B4B60'; D.rr(ctx, x - 0.012 * k, top - 0.16 * k, 0.024 * k, 0.16 * k, 4); ctx.fill();
      ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.arc(x, top - 0.11 * k, 3, 0, Math.PI * 2); ctx.fill();
      D.text(ctx, '光电门' + (i + 1), x, top - 0.17 * k, { align: 'center', size: 12, weight: 600 });
    });
    D.text(ctx, '相距 x = 0.400 m', X(0.32 + 0.4), top - 0.21 * k, { align: 'center', size: 12, color: '#4A5B73' });
    void self;
  };
  /* ---------- 动态层 ---------- */
  Bench.prototype.drawFg = function (ctx, w, hh) {
    var g = this.geo(), X = g.X, k = g.k, top = g.top, b = this.b, self = this;
    this.hot = [];
    var rear = this.cartRear(), cartW = 0.16, cartH = 0.055;
    // 纸带（打点计时器模式）
    if (this.apparatus === 'timer') {
      var tapeL = 0.9, left = Math.max(-0.08, rear - tapeL), ty = top - 0.022 * k;
      if (b.threaded) {
        ctx.fillStyle = TV.PAPER; ctx.fillRect(X(left), ty, (rear - left) * k, 0.012 * k);
        ctx.strokeStyle = '#CDBF98'; ctx.strokeRect(X(left), ty, (rear - left) * k, 0.012 * k);
        if (b.run) {
          var sNow = b.run.s(b.t); ctx.fillStyle = '#2B2B2B';
          for (var i = 0; i < b.run.dots.length; i++) { if (b.run.times[i] > b.t) break; var dx = X(g.timerX + sNow - b.run.dots[i]); if (dx > X(left)) { ctx.beginPath(); ctx.arc(dx, ty + 0.006 * k, 1.2, 0, Math.PI * 2); ctx.fill(); } }
        }
      } else {
        // 纸带卷放在计时器左侧
        ctx.fillStyle = TV.PAPER; ctx.strokeStyle = '#CDBF98'; ctx.beginPath(); ctx.arc(X(-0.04), top + 0.06 * k, 0.03 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        D.text(ctx, '纸带', X(-0.04), top + 0.115 * k, { align: 'center', size: 12 });
        this.hot.push({ id: 'thread', x: X(-0.09), y: top + 0.02 * k, w: Math.max(44, 0.1 * k), h: Math.max(44, 0.1 * k), label: '穿纸带' });
      }
      this.drawTimer(ctx, g);
      this.drawPower(ctx, g);
    }
    // 小车
    var cx = X(rear), cy = top - cartH * k;
    ctx.fillStyle = D.grad(ctx, 0, cy, 0, cy + cartH * k, ['#5C8DEB', '#2E5FBF']);
    D.rr(ctx, cx, cy, cartW * k, (cartH - 0.012) * k, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(cx + 6, cy + 4, cartW * k - 12, 3);
    ctx.fillStyle = '#2B2B2B';
    [0.035, 0.125].forEach(function (wx) { ctx.beginPath(); ctx.arc(cx + wx * k, top - 0.008 * k, 0.009 * k, 0, Math.PI * 2); ctx.fill(); });
    if (this.apparatus === 'gate') { ctx.fillStyle = '#10233F'; ctx.fillRect(cx + cartW * k - 3, cy - 0.04 * k, Math.max(2, this.flag * k), 0.04 * k); D.text(ctx, '遮光片 d=' + (this.flag * 1000) + 'mm', cx + cartW * k, cy - 0.05 * k, { align: 'center', size: 11 }); }
    if (!b.running && !b.released) {
      var ch = Math.max(44, cartH * k + 16);
      this.hot.push({ id: 'cart', x: cx - 6, y: top - ch + 6, w: Math.max(44, cartW * k + 12), h: ch, label: '小车' });
    }
    // 细绳 + 槽码
    var px = X(g.pulley), py = top - 0.005 * k, r = 0.028 * k;
    var drop = (b.run ? b.run.s(b.t) : 0) * k * 0.4;  // 示意：竖直下降按 0.4 比例显示
    if (b.m > 0) {
      ctx.strokeStyle = '#4A4A4A'; ctx.lineWidth = 1.2; ctx.beginPath();
      ctx.moveTo(cx + cartW * k, cy + 0.02 * k); ctx.lineTo(px, py - r); ctx.moveTo(px + r, py); ctx.lineTo(px + r, py + 0.12 * k + drop); ctx.stroke();
      var n = Math.round(b.m / 0.01), wy = py + 0.12 * k + drop;
      for (var j = 0; j < Math.min(n, 10); j++) { ctx.fillStyle = j % 2 ? '#8E99A6' : '#A7B1BC'; ctx.fillRect(px + r - 0.022 * k, wy + j * 0.009 * k, 0.044 * k, 0.008 * k); }
      D.text(ctx, '槽码 ' + Math.round(b.m * 1000) + ' g', px + r - 0.03 * k, wy + 0.03 * k, { size: 12, align: 'right' });
    } else {
      ctx.fillStyle = '#A7B1BC'; ctx.fillRect(px + 0.01 * k, top + 0.06 * k, 0.05 * k, 0.03 * k);
      D.text(ctx, '槽码', px + 0.035 * k, top + 0.115 * k, { align: 'center', size: 12 });
    }
    this.hot.push({ id: 'weights', x: px - 10, y: top + 0.02 * k, w: 0.12 * k, h: Math.max(60, 0.25 * k), label: '槽码' });
    // 位置提示
    if (!b.released && this.apparatus === 'timer') {
      ctx.strokeStyle = 'rgba(18,169,196,.6)'; ctx.setLineDash([4, 4]); ctx.strokeRect(X(0.16) - 3, cy - 4, cartW * k + 6, cartH * k + 4); ctx.setLineDash([]);
      D.text(ctx, '靠近计时器位置', X(0.24), cy - 8, { align: 'center', size: 11, color: '#12A9C4' });
    }
    if (b.warn) { ctx.fillStyle = 'rgba(199,55,75,.92)'; D.rr(ctx, 12, 12, w - 24, 34, 10); ctx.fill(); D.text(ctx, b.warn, w / 2, 34, { align: 'center', size: 14, color: '#fff', weight: 700 }); }
    if (this.apparatus === 'gate' && this.gate) this.drawGateReadout(ctx, g);
    void self;
  };
  Bench.prototype.drawTimer = function (ctx, g) {
    var X = g.X, k = g.k, top = g.top, b = this.b, x = X(0.02), y = top - 0.07 * k, w = 0.12 * k, hh = 0.07 * k;
    var type = b.timer || 'em';
    ctx.fillStyle = type === 'spark' ? D.grad(ctx, 0, y, 0, y + hh, ['#F1F3F6', '#C9D1D9']) : D.grad(ctx, 0, y, 0, y + hh, ['#4F6A8A', '#2F4560']);
    D.rr(ctx, x, y, w, hh, 6); ctx.fill();
    ctx.fillStyle = b.powered && b.run && b.run.power.prints ? '#25A870' : b.powered ? '#E69B2D' : '#8E99A6';
    ctx.beginPath(); ctx.arc(x + w - 10, y + 10, 4, 0, Math.PI * 2); ctx.fill();
    D.text(ctx, b.timer ? TIMER_NAME[b.timer] : '打点计时器（点选类型）', x + w / 2, y - 6, { align: 'center', size: 12, weight: 600, color: b.timer ? '#10233F' : '#12A9C4' });
    this.hot.push({ id: 'timer', x: x - 6, y: y - 20, w: Math.max(44, w + 12), h: Math.max(44, hh + 26), label: '计时器' });
  };
  Bench.prototype.drawPower = function (ctx, g) {
    var X = g.X, k = g.k, top = g.top, b = this.b, x = X(0.02), y = top + 0.09 * k, w = 0.26 * k, hh = 0.11 * k;
    ctx.fillStyle = D.grad(ctx, 0, y, 0, y + hh, ['#F7F9FB', '#D7DEE6']); D.rr(ctx, x, y, w, hh, 8); ctx.fill();
    ctx.strokeStyle = '#9AA8B8'; ctx.stroke();
    D.text(ctx, '学生电源', x + 8, y + 16, { size: 12, weight: 700 });
    D.text(ctx, b.power ? POWER_NAME[b.power] : '未选择档位', x + 8, y + 34, { size: 13, weight: 700, color: b.power ? (b.power === 'dc8' ? '#C7374B' : '#1661FF') : '#E69B2D' });
    // 开关
    var sx = x + w - 0.06 * k, sy = y + hh / 2;
    ctx.fillStyle = b.powered ? '#25A870' : '#8E99A6'; D.rr(ctx, sx - 16, sy - 10, 32, 20, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.powered ? sx + 6 : sx - 6, sy, 7, 0, Math.PI * 2); ctx.fill();
    D.text(ctx, b.powered ? '开' : '关', sx, sy + 24, { align: 'center', size: 11 });
    // 导线
    ctx.strokeStyle = b.power === 'dc8' ? '#C7374B' : '#1C1C1C'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 30, y); ctx.bezierCurveTo(x + 20, y - 0.04 * k, x + 50, top - 0.02 * k, X(0.06), top - 0.03 * k); ctx.stroke(); ctx.lineWidth = 1;
    this.hot.push({ id: 'power', x: x, y: y, w: Math.max(44, w - 0.1 * k), h: Math.max(44, hh), label: '电源档位' });
    this.hot.push({ id: 'switch', x: sx - 26, y: sy - 22, w: 52, h: 44, label: '电源开关' });
  };
  Bench.prototype.drawGateReadout = function (ctx, g) {
    var r = this.gate, x = g.X(0.38), y = g.top + 0.09 * g.k;
    var bw = Math.min(g.w - x - 12, Math.max(296, 0.58 * g.k)), bh = Math.max(54, 0.12 * g.k);
    ctx.fillStyle = '#10233F'; D.rr(ctx, x, y, bw, bh, 8); ctx.fill();
    var shown = this.b.t;
    var t1 = r.tAt(0.20), t2 = r.tAt(0.60);
    D.text(ctx, '数字计时器', x + 12, y + 18, { size: 11, color: '#9FB3CC' });
    var colW = (bw - 20) / 3;
    D.text(ctx, 'Δt₁=' + (shown > t1 ? M.sig(r.dt1 * 1000, 4) + 'ms' : '---'), x + 12, y + 40, { size: 12.5, color: '#7CF0B4', weight: 700 });
    D.text(ctx, 'Δt₂=' + (shown > t2 ? M.sig(r.dt2 * 1000, 4) + 'ms' : '---'), x + 12 + colW, y + 40, { size: 12.5, color: '#7CF0B4', weight: 700 });
    D.text(ctx, 't=' + (shown > t2 ? M.sig(r.t * 1000, 4) + 'ms' : '---'), x + 12 + colW * 2, y + 40, { size: 12.5, color: '#7CF0B4', weight: 700 });
  };

  /* ---------- 交互 ---------- */
  Bench.prototype.bindPointer = function () {
    var self = this, dragging = false, startX = 0, start0 = 0;
    ML.stage.pointer(this.stage.layer('fg').canvas, {
      down: function (p) {
        var hit = self.hitTest(p);
        dragging = self.apparatus === 'timer' && hit === 'cart' && !self.b.released; startX = p.x; start0 = self.b.startAt; self._down = hit;
      },
      move: function (p) {
        if (!dragging) return;
        var g = self.geo(); self.b.startAt = P.clamp(start0 + (p.x - startX) / g.k, 0, 0.45);
        self.stage.invalidate('fg');
      },
      up: function (p, a) {
        if (dragging && a.moved) {
          dragging = false;
          if (self.b.startAt < 0.03) { self.b.startAt = 0; ML.toast('小车已靠近打点计时器', 'ok'); }
          self.check(); self.stage.invalidate('fg'); return;
        }
        dragging = false;
        var hit = self.hitTest(p);
        if (hit === 'cart') {
          if (self.apparatus === 'gate') self.launchGate();
          else self.release();
        }
        else if (hit === 'timer') self.setTimer(self.b.timer === 'em' ? 'spark' : 'em');
        else if (hit === 'power') {
          if (self.guided() && self.b.timer === 'spark') self.setPower('ac220');
          else { var order = ['ac8', 'ac220', 'dc8'], i = order.indexOf(self.b.power); self.setPower(order[(i + 1) % 3]); }
        }
        else if (hit === 'switch') self.powerOn();
        else if (hit === 'thread') self.thread();
        else if (hit === 'weights') {
          var nextM = self.b.m >= 0.10 ? 0.02 : Math.round(((self.b.m || 0) + 0.02) * 100) / 100;
          self.setMass(nextM);
        }
      }
    });
  };
  Bench.prototype.hitTest = function (p) {
    var hs = this.hot || [];
    for (var i = hs.length - 1; i >= 0; i--) { var r = hs[i]; if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r.id; }
    return null;
  };
  Bench.prototype.block = function (msg, errId) {
    var self = this;
    ML.toast(msg, 'warn');
    this.setBanner('<b>先停一下：</b>' + msg + (errId ? ' <button class="link" type="button" data-try="' + errId + '">试一试：如果这样做会怎样 →</button>' : ''));
    var btn = ML.$('[data-try]', this.bannerEl); if (btn) btn.onclick = function () { openTry(errId); };
    void self;
  };
  Bench.prototype.guided = function () { return this.mode === 'guided'; };
  Bench.prototype.setTimer = function (t) {
    if (this.b.released) return; this.b.timer = t; this.b.power = this.b.power && this.guided() ? null : this.b.power; this.b.powered = false;
    this.done.P1 = true; this.check(); this.stage.invalidate();
  };
  Bench.prototype.setPower = function (p) {
    var b = this.b; if (b.released) return;
    if (!b.timer) { ML.toast('先选打点计时器', 'warn'); return; }
    if (this.guided()) {
      var right = b.timer === 'em' ? 'ac8' : 'ac220';
      if (p !== right) { this.block(TIMER_NAME[b.timer] + '应接' + POWER_NAME[right] + '。' + T.powerCheck({ timer: b.timer, power: p }).msg, 'E2'); return; }
    }
    b.power = p; b.powered = false; this.setBanner(null); this.check(); this.stage.invalidate();
  };
  Bench.prototype.thread = function () { if (this.b.released) return; this.b.threaded = true; ML.toast(this.b.timer === 'spark' ? '纸带已穿过限位孔，墨粉纸盘夹在两条纸带之间' : '纸带已穿过限位孔，压在复写纸下面', 'ok'); this.check(); this.stage.invalidate(); };
  Bench.prototype.setMass = function (m) { if (this.b.released) return; this.b.m = P.clamp(Math.round(m * 100) / 100, 0, 0.1); this.check(); this.stage.invalidate(); };
  Bench.prototype.missing = function () {
    var b = this.b, miss = [];
    if (!b.timer) miss.push('选打点计时器'); if (!b.power) miss.push('接电源'); if (!b.threaded) miss.push('穿纸带'); if (!b.m) miss.push('挂槽码');
    return miss;
  };
  Bench.prototype.powerOn = function () {
    var b = this.b;
    if (b.powered) {
      if (!b.running) {
        b.powered = false;
        var pi = b.order.indexOf('power');
        if (pi >= 0) b.order.splice(pi, 1);
        this.renderSide(); this.stage.invalidate();
      }
      return;
    }
    if (!b.timer || !b.power) { ML.toast('先选计时器并接好电源', 'warn'); return; }
    if (this.guided()) {
      var miss = this.missing(); if (miss.length) { ML.toast('还没完成：' + miss.join('、'), 'warn'); return; }
      if (b.startAt > 0.03) { this.block('释放前小车应停在靠近打点计时器的位置。' + PROC.P5.why, 'E6'); return; }
    }
    var pc = T.powerCheck({ timer: b.timer, power: b.power });
    if (pc.blocked) { b.warn = '⚠ ' + pc.msg + ' 已自动断电。'; this.addTag('E2'); this.stage.invalidate(); var self = this; setTimeout(function () { self.b.warn = ''; self.stage.invalidate(); }, 3500); return; }
    b.powered = true; if (b.order.indexOf('power') < 0) b.order.push('power'); b.powerT = b.running ? b.t : null;
    if (b.running) { b.lag = b.t; this.rebuild(); }
    this.check(); this.stage.invalidate();
  };
  Bench.prototype.launchGate = function () {
    var b = this.b;
    if (!b.m) { ML.toast('先挂槽码', 'warn'); return; }
    b.startAt = 0; b.powered = true; b.order = ['power']; b.timer = 'none'; b.power = 'ac220'; b.threaded = true; b.caught = true;
    this.release();
  };
  Bench.prototype.release = function () {
    var b = this.b; if (b.released) return;
    if (!b.m) { ML.toast('还没挂槽码，小车不会动', 'warn'); return; }
    if (this.apparatus === 'timer' && T.powerCheck({ timer: b.timer || 'em', power: b.power || 'ac8' }).blocked) {
      b.warn = '⚠ 电磁打点计时器接 220 V 会烧毁线圈，已阻止运行！';
      this.addTag('E2'); ML.toast('电压远超额定，无法运行', 'err');
      this.stage.invalidate();
      var selfW = this; setTimeout(function () { selfW.b.warn = ''; selfW.stage.invalidate(); }, 3500);
      return;
    }
    if (this.guided()) {
      var miss = this.missing(); if (miss.length) { ML.toast('还没完成：' + miss.join('、'), 'warn'); return; }
      if (b.startAt > 0.03) { this.block('释放前小车应停在靠近打点计时器的位置。' + PROC.P5.why, 'E6'); return; }
      if (!b.powered) { this.block('应先接通电源，待打点稳定后再释放小车。' + PROC.P6.why, 'E1'); return; }
    }
    b.released = true; b.order.push('release'); b.running = true;
    if (!b.powered) { b.lag = Infinity; }
    else if (b.order[0] === 'power') b.lag = 0.40;
    else b.lag = 0;
    // 先通电时小车在 lag 后才动：把动画时间直接从通电时刻算起
    b.t = (b.powered && b.order[0] === 'power') ? 0.40 : 0;
    this.rebuild(); this.setBanner(null);
    if (b.run && !b.run.moving && !b.run.power.blocked) {
      b.warn = '拉不动：槽码重力不足以克服阻力（可增加槽码或切换理想条件）';
      ML.toast('拉不动！槽码重力不足以克服阻力', 'warn');
    }
    this.loop.start();
  };
  Bench.prototype.rebuild = function () {
    var b = this.b, p = this.params();
    if (!b.powered) { p.order = 'release-first'; p.lag = Infinity; }
    else if (b.order[0] === 'release') { p.order = 'release-first'; p.lag = b.lag; }
    else { p.order = 'power-first'; p.lag = 0.40; }
    this.seed = this.seed || (seedCounter += 7);
    b.run = T.run(p, this.seed);
    if (this.apparatus === 'gate') {
      var a = b.run.a, gr = T.photogate(Object.assign({}, p, { timer: 'none' }), this.flag);
      gr.tAt = a > 1e-6 ? function (s) { return b.run.tRelease + Math.sqrt(2 * s / a); } : function () { return Infinity; };
      this.gate = gr;
    }
  };
  Bench.prototype.hold = function () {
    var b = this.b; if (!b.running) return;
    var s = b.run.s(b.t);
    if (s < 0.5 * b.run.L) { ML.toast('还没到滑轮前，再等一等', 'info'); return; }
    if (b.t > b.run.tArrive) return;
    b.caught = true; this.rebuild(); this.holdBtn.hidden = true; ML.toast('按住了小车', 'ok');
  };
  Bench.prototype.tick = function (dt) {
    var b = this.b; if (!b.running) return false;
    b.t += dt * this.speed;
    if (b.run && this.apparatus === 'timer') {
      var sNow = b.run.s(b.t), win = !b.caught && b.run.moving && sNow >= 0.5 * b.run.L && b.t <= b.run.tArrive;
      if (this.holdBtn.hidden === win) this.holdBtn.hidden = !win;
    }
    var end = b.run ? b.run.tOff : 2;
    this.stage.invalidate('fg');
    if (b.t >= end) { b.t = end; b.running = false; this.finish(); return false; }
    return true;
  };
  Bench.prototype.finish = function () {
    var b = this.b; this.holdBtn.hidden = true; b.done = true;
    if (!b.caught && b.run.moving) { b.warn = '小车撞上滑轮，槽码落地！'; this.addTag('E7'); var self = this; setTimeout(function () { self.b.warn = ''; self.stage.invalidate(); }, 3000); }
    this.done.P6 = b.order[0] === 'power'; this.done.P7 = b.caught;
    if (this.apparatus === 'gate') { this.renderSide(); this.stage.invalidate(); return; }
    this.check(true); this.stage.invalidate();
  };
  Bench.prototype.addTag = function (id) { this.pendingTags = this.pendingTags || []; if (this.pendingTags.indexOf(id) < 0) this.pendingTags.push(id); };
  Bench.prototype.takeTape = function () {
    var b = this.b; if (!b.done) return;
    var tags = (b.run.tags || []).concat(this.pendingTags || []).filter(function (x, i, a) { return a.indexOf(x) === i && ERR[x]; });
    if (!b.threaded) tags = tags.filter(function (x) { return x !== 'E1'; });
    var tape = { no: ++this.tapeSeq, run: b.run, timer: b.timer, tags: tags, threaded: b.threaded };
    this.tapes.push(tape); if (this.tapes.length > 3) this.tapes.shift();
    this.pendingTags = []; this.seed = 0;
    this.done.P8 = true;
    this.reset({ keepDone: true });
    ana.show(tape, this);
    if (!tape.run.moving && !tape.run.power.blocked && tape.run.power.prints) {
      ML.toast('槽码太轻拉不动小车，纸带上只有重叠静止点', 'warn');
    } else {
      ML.toast('已取下纸带，下面开始处理纸带', 'ok');
    }
  };
  Bench.prototype.check = function (skipSave) {
    var b = this.b;
    this.done.P1 = !!b.timer; this.done.P2 = !!b.power && T.powerCheck({ timer: b.timer, power: b.power }).prints; this.done.P3 = b.threaded; this.done.P4 = b.m > 0; this.done.P5 = b.startAt < 0.03;
    if (!skipSave) this.saveBench();
    this.renderSide();
  };
  /* ---------- 侧栏 ---------- */
  Bench.prototype.renderSide = function () {
    var self = this, b = this.b, side = this.side; if (!side) return;
    ML.clear(side);
    if (this.apparatus === 'gate') { this.renderGateSide(side); return; }
    var row = function () { return h('div.side-row', Array.prototype.slice.call(arguments)); };
    function btn(label, on, act, cls) { return h('button.chip' + (on ? '.on' : '') + (cls || ''), { type: 'button', onclick: act, disabled: b.released }, label); }
    var ctl = h('div.side-ctl');
    ctl.appendChild(h('div.side-k', '器材与操作'));
    ctl.appendChild(row(h('span.side-l', '计时器'), btn('电磁', b.timer === 'em', function () { self.setTimer('em'); }), btn('电火花', b.timer === 'spark', function () { self.setTimer('spark'); })));
    ctl.appendChild(row(h('span.side-l', '电源'), btn('交流 8 V', b.power === 'ac8', function () { self.setPower('ac8'); }), btn('交流 220 V', b.power === 'ac220', function () { self.setPower('ac220'); }), btn('直流 8 V', b.power === 'dc8', function () { self.setPower('dc8'); })));
    ctl.appendChild(row(h('span.side-l', '纸带'), btn(b.threaded ? '已穿好' : '穿纸带', b.threaded, function () { self.thread(); })));
    ctl.appendChild(row(h('span.side-l', '槽码'), btn('−', false, function () { self.setMass(b.m - 0.01); }), h('b.side-v', Math.round(b.m * 1000) + ' g'), btn('+', false, function () { self.setMass((b.m || 0.04) + 0.01); })));
    ctl.appendChild(row(h('span.side-l', '小车'), btn('靠近计时器', b.startAt < 0.03, function () { if (!b.released) { b.startAt = 0; self.check(); self.stage.invalidate(); } }), btn('木板中部', b.startAt >= 0.03, function () { if (!b.released) { b.startAt = 0.30; self.check(); self.stage.invalidate(); } })));
    if (this.showComp) {
      var thComp = T.compensateAngle({});
      ctl.appendChild(row(h('span.side-l', '垫高'),
        btn('0° 水平', (b.theta || 0) < 0.1, function () { if (!b.released) { b.theta = 0; self.renderSide(); self.stage.invalidate(); } }),
        btn('1.58° 补偿', (b.theta || 0) > 0.5, function () { if (!b.released) { b.theta = thComp; self.renderSide(); self.stage.invalidate(); } })));
    }
    ctl.appendChild(h('div.side-acts',
      h('button.btn' + (b.powered ? '.cyan' : ''), { type: 'button', onclick: function () { self.powerOn(); }, disabled: b.done }, b.powered ? '电源已接通' : '接通电源'),
      h('button.btn.primary', { type: 'button', onclick: function () { self.release(); }, disabled: b.released }, '释放小车'),
      h('button.btn', { type: 'button', onclick: function () { self.takeTape(); }, disabled: !b.done }, '关闭电源，取下纸带'),
      h('button.btn.sm', { type: 'button', onclick: function () { self.reset(); self.saveBench(); self.setBanner(null); } }, '重新装置')));
    side.appendChild(ctl);
    if (this.guided()) {
      side.appendChild(h('div.side-k', '实验步骤'));
      var allIds = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11'];
      var curId = null;
      for (var k = 0; k < allIds.length; k++) { if (!this.done[allIds[k]]) { curId = allIds[k]; break; } }
      var curEl = null;
      var stepsEl = h('ol.steps', allIds.map(function (id) {
        var p = PROC[id], ok = !!self.done[id], isCur = id === curId;
        var li = h('li' + (ok ? '.ok' : '') + (isCur ? '.cur' : ''),
          h('div.st-t', (ok ? '✓ ' : isCur ? '▸ ' : '') + p.title),
          h('div.st-how', { html: M.tex(p.how) + (p.why ? '<div class="st-why">理由：' + M.tex(p.why) + '</div>' : '') }),
          p.errorId ? h('button.link.sm', { type: 'button', onclick: function () { openTry(p.errorId); } }, '为什么？试一试 →') : null);
        if (isCur) curEl = li;
        return li;
      }));
      side.appendChild(stepsEl);
      if (curEl) setTimeout(function () { if (stepsEl.scrollHeight > stepsEl.clientHeight + 4) stepsEl.scrollTop = Math.max(0, curEl.offsetTop - stepsEl.offsetTop - 4); }, 0);
    } else {
      side.appendChild(h('div.side-tip', '自由模式：任何顺序都可以操作，系统不拦截。取下纸带后，若操作有问题会在纸带旁挂上“本次操作有问题”的标签。'));
    }
  };
  Bench.prototype.renderGateSide = function (side) {
    var self = this, b = this.b, r = this.gate;
    side.appendChild(h('div.side-k', '光电门测速'));
    side.appendChild(h('div.side-row', h('span.side-l', '遮光片宽 d'), [0.002, 0.005, 0.010, 0.030].map(function (d) {
      return h('button.chip' + (self.flag === d ? '.on' : ''), { type: 'button', disabled: b.released, onclick: function () { self.flag = d; self.renderSide(); self.stage.invalidate(); } }, (d * 1000) + ' mm');
    })));
    side.appendChild(h('div.side-row', h('span.side-l', '槽码'), h('button.chip', { type: 'button', disabled: b.released, onclick: function () { self.setMass(b.m - 0.01); self.renderSide(); } }, '−'), h('b.side-v', Math.round(b.m * 1000) + ' g'), h('button.chip', { type: 'button', disabled: b.released, onclick: function () { self.setMass((b.m || 0.04) + 0.01); self.renderSide(); } }, '+')));
    side.appendChild(h('div.side-acts',
      h('button.btn.primary', { type: 'button', disabled: b.released, onclick: function () { self.launchGate(); } }, '由静止释放小车'),
      h('button.btn.sm', { type: 'button', onclick: function () { self.gate = null; self.reset(); } }, '重来')));
    var gScroll = h('div.gate-scroll');
    side.appendChild(gScroll);
    if (r && b.done) {
      var rel = function (x) { return ((x - r.a) / r.a * 100).toFixed(2) + '%'; };
      gScroll.appendChild(h('table.dt.gate-t',
        h('tr', h('th', 'Δt₁'), h('td', M.sig(r.dt1 * 1000, 4) + ' ms'), h('th', 'v₁ = d/Δt₁'), h('td', r.v1.toFixed(3) + ' m/s')),
        h('tr', h('th', 'Δt₂'), h('td', M.sig(r.dt2 * 1000, 4) + ' ms'), h('th', 'v₂ = d/Δt₂'), h('td', r.v2.toFixed(3) + ' m/s')),
        h('tr', h('th', 't'), h('td', M.sig(r.t * 1000, 4) + ' ms'), h('th', 'x'), h('td', '0.400 m'))));
      gScroll.appendChild(h('div.gate-res', { html:
        'a = ' + M.frac('v₂² − v₁²', '2x') + ' = <b>' + r.a1.toFixed(4) + '</b> m/s²（偏差 ' + rel(r.a1) + '）<br>' +
        'a = ' + M.frac('v₂ − v₁', 't') + ' = <b>' + r.a2.toFixed(4) + '</b> m/s²（偏差 ' + rel(r.a2) + '）<br>' +
        '<span class="muted">模型设定 a = ' + r.a.toFixed(4) + ' m/s²</span>' }));
      if (this.flag >= 0.03) gScroll.appendChild(h('button.link', { type: 'button', onclick: function () { openTry('E8'); } }, '为什么第二种算法偏小？试一试 →'));
    } else gScroll.appendChild(h('div.side-tip', { html: '遮光片随小车通过两个光电门。v = ' + M.frac('d', 'Δt') + ' 是遮光过程的平均速度。换不同宽度的遮光片，比较两种算法求出的 a。' }));
  };

  /* =====================================================================
   *  纸带处理
   * ===================================================================== */
  var ana = {
    show: function (tape, bn, opts) {
      opts = opts || {};
      var self = this, el = bn.analysis; this.bn = bn; this.tape = tape; el.hidden = false; ML.clear(el);
      this.baseTags = (tape.tags || []).filter(function (id) { return id !== 'E3' && id !== 'E4' && id !== 'E5'; });
      this.st = { O: null, every: 5, method: 'origin', Tcalc: null, meas: null, readingsChecked: false };
      var tapesBar = h('div.ana-tapes', h('b', '我的纸带：'), bn.tapes.map(function (t) {
        return h('button.chip' + (t === tape ? '.on' : ''), { type: 'button', onclick: function () { self.show(t, bn); } }, '纸带 ' + t.no + '（' + TIMER_NAME[t.timer || 'em'].slice(0, 2) + '）');
      }));
      this.tagBox = h('div.ana-tags');
      el.appendChild(h('h2.ana-h', '处理纸带'));
      el.appendChild(tapesBar); el.appendChild(this.tagBox);
      this.renderTags();
      this.hint = h('div.ana-hint');
      el.appendChild(this.hint);
      var stripWrap = h('div.ana-strip');
      el.appendChild(stripWrap);
      this.strip = new TV.TapeStrip(stripWrap, { height: 118, onTap: function (i) { self.pickO(i); },
        magLabel: function (x, s) {
          var dots = tape.run.dots;
          if (!dots.length) return '';
          if (!self.st.meas) {
            var best = -1, bd = 28;
            for (var i = 0; i < dots.length; i++) { var d = Math.abs(s.X(dots[i]) - x); if (d < bd) { bd = d; best = i; } }
            if (best < 0) return '移到点迹处看间距';
            if (best + 1 < dots.length) return '点 #' + best + ' · 间距 ' + ((dots[best + 1] - dots[best]) * 1000).toFixed(1) + ' mm';
            return '点 #' + best + '（末点）';
          }
          var pos = (x - s.X(dots[self.st.meas.idx[0]])) / s.scale;
          return '读数 ≈ ' + (pos * 100).toFixed(2) + ' cm';
        } });
      this.strip.set({ dots: tape.threaded ? tape.run.dots : [], timer: tape.timer, blankText: tape.threaded ? '（纸带上没有点：计时器没有打点）' : '（纸带没有穿过计时器）', count: null, ruler: false });
      setTimeout(function () { self.strip.zoomTo(3200, tape.run.dots.length ? tape.run.dots[Math.min(tape.run.dots.length - 1, T.firstClearDot(tape.run.dots) + 12)] : 0); }, 30);
      this.controls = h('div.ana-ctl'); el.appendChild(this.controls);
      this.out = h('div.ana-out'); el.appendChild(this.out);
      this.renderCtl();
      if (!opts.noScroll) el.scrollIntoView({ behavior: ML.perf.low ? 'auto' : 'smooth', block: 'start' });
    },
    renderTags: function () {
      var tags = this.baseTags.slice(), dots = this.tape.run.dots, st = this.st;
      if (st.O != null && st.O + 1 < dots.length && dots[st.O + 1] - dots[st.O] < 1e-3) tags.push('E4');
      if (st.method === 'segment') tags.push('E5');
      if (st.Tcalc != null && Math.abs(st.Tcalc - 0.02 * st.every) > 1e-9) tags.push('E3');
      tags = tags.filter(function (x, i, a) { return a.indexOf(x) === i && ERR[x]; });
      this.tape.tags = tags;
      ML.clear(this.tagBox);
      if (tags.length) {
        this.tagBox.appendChild(h('span.tag.err', '⚠ 本次操作有问题'));
        tags.forEach(function (id) { this.tagBox.appendChild(h('button.tag', { type: 'button', onclick: function () { openTry(id); } }, ERR[id].name + ' → 看看后果')); }, this);
      } else this.tagBox.appendChild(h('span.tag.ok', '✓ 操作规范'));
    },
    renderCtl: function () {
      var self = this, st = this.st, c = this.controls, dots = this.tape.run.dots; ML.clear(c);
      if (!dots.length || !this.tape.threaded) { this.hint.textContent = '这条纸带没有可用的点。回到上面检查电源与纸带后重新实验。'; return; }
      this.hint.innerHTML = st.O == null ? '<b>第 1 步：</b>在纸带上<b>点选起点 O</b>——舍去开头过于密集的点，选第一个清晰的点。（左右拖动纸带；按住出现放大镜）' :
        st.meas ? '<b>第 3 步：</b>选择计数间隔 T，查看各计数点速度、逐差法与 v-t 图。' : '<b>第 2 步：</b>选取计数点和测量方式，然后点“测量”。';
      c.appendChild(h('div.side-row', h('span.side-l', '计数点'),
        h('button.chip' + (st.every === 5 ? '.on' : ''), { type: 'button', onclick: function () { st.every = 5; st.meas = null; st.Tcalc = null; self.syncP9(); self.update(); } }, '每 5 个点取 1 个'),
        h('button.chip' + (st.every === 1 ? '.on' : ''), { type: 'button', onclick: function () { st.every = 1; st.meas = null; st.Tcalc = null; self.syncP9(); self.update(); } }, '每个点都是计数点')));
      c.appendChild(h('div.side-row', h('span.side-l', '测量方式'),
        h('button.chip' + (st.method === 'origin' ? '.on' : ''), { type: 'button', onclick: function () { st.method = 'origin'; st.meas = null; self.update(); } }, '从同一起点读数'),
        h('button.chip' + (st.method === 'segment' ? '.on' : ''), { type: 'button', onclick: function () {
          if (self.bn && self.bn.guided()) { self.bn.block('逐段测量会使每次对零误差累积，应从同一起点 O 读数。' + PROC.P10.why, 'E5'); return; }
          st.method = 'segment'; st.meas = null; self.update();
        } }, '逐段测量'),
        h('button.btn.primary', { type: 'button', disabled: st.O == null, onclick: function () { self.measure(); } }, '测量')));
    },
    syncP9: function () {
      var dots = this.tape.run.dots, st = this.st;
      if (!this.bn || st.O == null) return;
      this.bn.done.P10 = false; this.bn.done.P11 = false;
      var dense = st.O + 1 < dots.length && dots[st.O + 1] - dots[st.O] < 1e-3;
      this.bn.done.P9 = !dense && st.every === 5;
      this.bn.renderSide();
    },
    pickO: function (i) {
      var dots = this.tape.run.dots; if (!dots.length) return;
      var dense = i + 1 < dots.length && dots[i + 1] - dots[i] < 1e-3;
      if (dense && this.bn && this.bn.guided()) {
        this.bn.block('开头点迹过于密集（相邻间距 < 1 mm），不能在此选起点 O，请向右点选清晰的点。' + PROC.P9.why, 'E4');
        return;
      }
      this.st.O = i; this.st.meas = null; this.st.Tcalc = null;
      if (dense) ML.toast('这里的点太密了，相邻间距不到 1 mm', 'warn');
      if (this.bn) { this.bn.done.P10 = false; this.bn.done.P11 = false; this.bn.done.P9 = !dense && this.st.every === 5; this.bn.renderSide(); }
      this.update();
    },
    update: function () {
      var st = this.st, dots = this.tape.run.dots, count = null, labels = null;
      if (st.O != null) {
        count = []; for (var k = 0; k <= 6; k++) { var j = st.O + k * st.every; if (j < dots.length) count.push(j); }
        labels = count.map(function (_, k) { return k === 0 ? 'O' : String(k); });
      }
      this.strip.set({ count: count, labels: labels, ruler: !!st.meas });
      this.renderTags(); this.renderCtl(); this.renderOut();
    },
    measure: function () {
      var st = this.st, dots = this.tape.run.dots;
      var m = T.measure(dots, { start: st.O, every: st.every, n: 6, method: st.method, ideal: S.ideal || (this.bn && this.bn.guided()), seed: 5 + st.O });
      if (m.segs.length < 4) { ML.toast('计数点不够（至少需要 4 段），换一个更靠前的起点或换条纸带', 'warn'); return; }
      st.meas = m;
      st.readingsChecked = !this.bn || !this.bn.guided();
      if (this.bn) {
        var dense = st.O + 1 < dots.length && dots[st.O + 1] - dots[st.O] < 1e-3;
        this.bn.done.P9 = !dense && st.every === 5;
        this.bn.done.P10 = st.method === 'origin' && st.readingsChecked;
        this.bn.renderSide();
      }
      this.update();
      if (this.bn && this.bn.guided()) {
        ML.toast('刻度尺已放好。请逐点用放大镜读数，在下方填写各计数点读数。', 'info'); return;
      }
      // 自由演示：刻度尺滑入并在放大镜依次闪示读数
      var self = this, k = 0, gen = (this._animGen = (this._animGen || 0) + 1);
      (function step() {
        if (self._animGen !== gen || !self.st.meas || !self.strip.el.isConnected) { if (self.strip && self.strip.mag) self.strip.mag.hide(); return; }
        if (k >= m.idx.length) { self.strip.mag.hide(); return; }
        var s = dots[m.idx[k]]; self.strip.zoomTo(self.strip.scale, s);
        if (!ML.perf.reduced && self.strip.stage.w > 0) {
          var sx = self.strip.X(s);
          self.strip.mag.show([self.strip.stage.layer('t').canvas], sx, 44, self.strip.stage.dpr,
            (k === 0 ? 'O' : String(k)) + ': ' + cm(m.pos[k]) + ' cm');
        }
        k++; setTimeout(step, ML.perf.reduced ? 0 : 210);
      })();
    },
    renderOut: function () {
      var self = this, st = this.st, out = this.out, m = st.meas; ML.clear(out);
      if (!m) return;
      if (this.bn && this.bn.guided() && !st.readingsChecked) {
        var inputs = m.pos.map(function (_, i) { return h('input', { type: 'number', step: '0.01', min: '0', 'aria-label': 'd' + i + '（cm）', style: { width: '82px' } }); });
        var fb = h('div.ana-hint');
        out.appendChild(h('div.ana-block', h('h3', '我的刻度尺读数'),
          h('div.muted', '从同一起点 O 对零，依次读取已标出的计数点；单位 cm，估读到 0.01 cm。程序此时尚未代填数据。'),
          h('div.side-row', inputs.map(function (inp, i) { return h('label', 'd' + sub(i) + ' ', inp); })),
          h('button.btn.primary', { type: 'button', onclick: function () {
            var vals = inputs.map(function (inp) { return Number(inp.value); });
            var ok = vals.every(function (v, i) { return inputs[i].value !== '' && isFinite(v) && Math.abs(v - m.pos[i] * 100) <= 0.011; });
            if (!ok) { fb.textContent = '有读数不符，请检查对零、计数点、单位与估读位数。'; return; }
            st.meas.pos = vals.map(function (v) { return v / 100; });
            st.meas.segs = st.meas.pos.slice(1).map(function (v, i) { return v - st.meas.pos[i]; });
            st.readingsChecked = true; self.bn.done.P10 = st.method === 'origin'; self.bn.renderSide(); self.update();
            ML.toast('原始读数已记录。现在选择计数间隔，再计算速度和加速度。', 'ok');
          } }, '提交读数并核对'), fb));
        return;
      }
      var n = m.segs.length;
      var head = h('tr', h('th', '计数点'), m.pos.map(function (_, i) { return h('th', i === 0 ? 'O' : String(i)); }));
      var rowD = h('tr', h('th', '到 O 的距离 d / cm'), m.pos.map(function (x) { return h('td', cm(x)); }));
      var rowX = h('tr', h('th', '段长 x / cm'), h('td', '—'), m.segs.map(function (x, i) { return h('td', h('span', 'x' + sub(i + 1) + '=' + cm(x))); }));
      var dxs = m.segs.slice(1).map(function (x, i) { return x - m.segs[i]; });
      var rowDX = h('tr', h('th', 'Δx = xₙ₊₁ − xₙ / cm'), h('td', '—'), h('td', '—'), dxs.map(function (d) { return h('td', cm(d)); }));
      out.appendChild(h('div.ana-block', h('h3', '测量数据'), h('div.tbl-wrap', h('table.dt', head, rowD, rowX, rowDX)),
        h('div.muted', st.method === 'origin' ? '刻度尺 0 刻度对准 O，依次读出各点位置（估读到 0.1 mm），再相减得段长。' : '逐段测量：每段单独对零读数。')));
      var tchips = h('div.side-row', h('span.side-l', '计数间隔 T ='),
        [0.02, 0.1].map(function (t) { return h('button.chip' + (st.Tcalc === t ? '.on' : ''), { type: 'button', onclick: function () {
          if (self.bn && self.bn.guided() && Math.abs(t - 0.02 * st.every) > 1e-9) {
            self.bn.block('计数间隔应为 T = ' + (0.02 * st.every).toFixed(2) + ' s。' + PROC.P11.why, 'E3');
            return;
          }
          st.Tcalc = t; self.renderTags(); if (self.bn) { self.bn.done.P11 = Math.abs(t - 0.02 * st.every) < 1e-9; self.bn.renderSide(); } self.renderOut();
        } }, t + ' s'); }),
        h('span.muted', st.every === 5 ? '（每 5 个点取 1 个计数点）' : '（每个点都是计数点）'));
      out.appendChild(h('div.ana-block', h('h3', '选择计数间隔'), tchips));
      if (st.Tcalc == null) return;
      var Tc = st.Tcalc, an = T.analyze(m.segs, Tc), aTrue = this.tape.run.a, Tt = 0.02 * st.every;
      var vrow = h('tr', h('th', 'vₙ = (xₙ + xₙ₊₁)/2T / (m·s⁻¹)'), h('td', '—'), an.vs.map(function (v) { return h('td', v.toFixed(3)); }), h('td', '—'));
      var k2 = an.k, sA = [], sB = [];
      for (var i = 0; i < k2; i++) { sA.push('x' + sub(i + 1)); sB.push('x' + sub(k2 + i + 1)); }
      var formula = 'a = ' + M.frac('(' + sB.join(' + ') + ') − (' + sA.join(' + ') + ')', (k2 * k2) + 'T²');
      var sumA = 0, sumB = 0; for (i = 0; i < k2; i++) { sumA += m.segs[i]; sumB += m.segs[k2 + i]; }
      var subst = '= ' + M.frac('(' + cm(sumB) + ' − ' + cm(sumA) + ') × 10⁻² m', k2 * k2 + ' × (' + Tc + ' s)²') + ' = <b>' + M.sig(an.aZhuCha, 3) + ' m/s²</b>';
      var dev = (an.aZhuCha - aTrue) / aTrue;
      var verdict = Math.abs(dev) < 0.03 ? '<span class="tag ok">与模型设定值接近</span>' : '<span class="tag err">与模型设定值相差 ' + (dev * 100).toFixed(0) + '%</span>';
      out.appendChild(h('div.ana-block', h('h3', '求瞬时速度'), h('div.tbl-wrap', h('table.dt', h('tr', h('th', '计数点'), m.pos.map(function (_, i) { return h('th', i === 0 ? 'O' : String(i)); })), vrow))));
      out.appendChild(h('div.ana-block', h('h3', '逐差法求加速度（' + n + ' 段' + (n % 2 ? '，舍去最后一段' : '') + '）'),
        h('div.formula', { html: formula + '　' + subst }),
        h('div', { html: '实验台模型设定值 a = ' + aTrue.toFixed(3) + ' m/s²（' + (S.ideal ? '理想' : '真实') + '条件）　' + verdict }),
        Tc !== Tt ? h('div.warnline', { html: '⚠ 计数间隔应为 ' + Tt + ' s。 <button class="link" type="button">为什么差这么多？试一试 →</button>' }) : null));
      var wl = ML.$('.warnline .link', out); if (wl) wl.onclick = function () { openTry('E3'); };
      // v-t 图 + 剪纸带
      var chartBox = h('div.ana-block', h('h3', 'v-t 图像'));
      var sw = h('div.side-row', h('button.chip.on', { type: 'button' }, '描点 + 拟合'), h('button.chip', { type: 'button' }, '剪纸带贴条'));
      chartBox.appendChild(sw); out.appendChild(chartBox);
      var chart = new ML.Chart(chartBox, { xLabel: 't / s', yLabel: 'v / (m·s⁻¹)', height: 280, paper: true, x: [0, Tc * (n + 0.5)] });
      var pts = an.ts.map(function (t, i) { return [t, an.vs[i]]; });
      function vt() { chart.opts.y = null; chart.set([{ pts: pts, fit: true, color: '#1661FF', label: '拟合直线 斜率 = ' + M.sig(an.fit.k, 3) + ' m/s²' }]); }
      function bars() {
        var bp = m.segs.map(function (x, i) { return [(i + 0.5) * Tc, x / Tc]; });
        chart.opts.y = null; chart.set([{ bars: true, barW: Tc, pts: bp, color: '#C7374B', label: '各段纸带（长度 ∝ 平均速度）' }, { pts: bp, fit: true, color: '#1661FF', dash: true, mark: 'x' }]);
      }
      vt();
      var chips = ML.$$('.chip', sw);
      chips[0].onclick = function () { chips[0].classList.add('on'); chips[1].classList.remove('on'); vt(); };
      chips[1].onclick = function () { chips[1].classList.add('on'); chips[0].classList.remove('on'); bars(); };
      chartBox.appendChild(h('div.muted', { html: '纵截距 ≈ ' + an.fit.b.toFixed(3) + ' m/s，是计数起点 O 时刻的速度（不为零是正常的）。斜率 = ' + M.sig(an.fit.k, 3) + ' m/s²。' }));
    }
  };
  function sub(n) { return String(n).replace(/\d/g, function (d) { return '₀₁₂₃₄₅₆₇₈₉'[d]; }); }

  /* =====================================================================
   *  ③ 诊·误差：对比适配器
   * ===================================================================== */
  function stripRow(area, label, cls, run, timer, extra) {
    var row = h('div.cmp-row', h('div.cmp-k.' + cls, label)); area.appendChild(row);
    var s = new TV.TapeStrip(row, { height: 92 });
    s.set(Object.assign({ dots: run.dots, timer: timer || 'em', blankText: '（纸带上没有点）' }, extra || {}));
    return s;
  }
  function animateStrips(strips, runs, done) {
    var t = 0, maxT = Math.max.apply(null, runs.map(function (r) { return r.tOff; })), stopped = false;
    var full = runs.map(function (r) { return r.dots; });
    if (ML.perf.reduced) { strips.forEach(function (s, i) { s.set({ dots: full[i] }); }); done(); return function () { stopped = true; }; }
    var loop = new ML.stage.Loop(function (dt) {
      if (stopped || (strips[0] && !strips[0].el.isConnected)) { loop.stop(); return false; }
      t += dt * 1.2;
      strips.forEach(function (s, i) { var r = runs[i]; s.set({ dots: full[i].filter(function (_, k) { return r.times[k] <= t; }) }); });
      if (t >= maxT) { strips.forEach(function (s, i) { s.set({ dots: full[i] }); }); done(); return false; }
      return true;
    });
    loop.start();
    return function () { stopped = true; loop.stop(); };
  }
  function fitBoth(strips, maxS) { setTimeout(function () { strips.forEach(function (s) { s.scale = ((s.stage.w || 600) - 40) / maxS; s.offset = -0.004; s.stage.invalidate(); }); }, 20); }
  function measureA(run, opts) {
    var st = opts.start != null ? opts.start : T.firstClearDot(run.dots, 1e-3);
    var m = T.measure(run.dots, { start: st, every: 5, n: 6, method: opts.method || 'origin', ideal: opts.ideal, seed: opts.seed || 3 });
    return { m: m, an: T.analyze(m.segs, opts.T || 0.1) };
  }
  var adapter = {
    compare: function (err, area, done) {
      var cfg = err.config, seed = 21, base = { ideal: S.ideal };
      function both(errCfg, opts) {
        opts = opts || {};
        var good = T.run(base, seed), bad = T.run(Object.assign({}, base, errCfg), seed);
        var maxS = Math.max(good.L, bad.L) + 0.02;
        var s1 = stripRow(area, '正确操作', 'good', good, 'em'), s2 = stripRow(area, opts.badLabel || '本次错误', 'bad', bad, 'em');
        fitBoth([s1, s2], maxS);
        return animateStrips([s1, s2], [good, bad], function () { if (opts.after) opts.after(good, bad, s1, s2); done(); });
      }
      if (err.id === 'E1') return both(cfg, { after: function (g, b, s1, s2) {
        s2.set({ marks: [{ from: -0.002, to: b.dots[0], text: '开头没有密集点，首段空白' }] });
        s1.set({ marks: [{ from: -0.001, to: g.dots[T.firstClearDot(g.dots)] + 0.001, color: '#25A870', text: '静止时打的点叠在一起' }] });
        area.appendChild(h('div.cmp-note', '点数：正确 ' + g.dots.length + ' 个，错误 ' + b.dots.length + ' 个'));
      } });
      else if (err.id === 'E2') return both(cfg, { after: function () { area.appendChild(h('div.cmp-note', { html: '直流电：振针不会周期性振动，纸带上没有点。' })); } });
      else if (err.id === 'E6') return both(cfg, { after: function (g, b) { area.appendChild(h('div.cmp-note', '有效点（运动中打的点）：正确约 ' + Math.round((g.tStop - g.tRelease) * 50) + ' 个，错误约 ' + Math.round((b.tStop - b.tRelease) * 50) + ' 个')); } });
      else if (err.id === 'E7') return both(cfg, { after: function (g, b, s1, s2) { s2.set({ marks: [{ from: b.L - 0.03, to: b.L + 0.002, text: '撞击：末端点突然堆积' }] }); } });
      else if (err.id === 'E9') return both(cfg, { badLabel: '51 Hz', after: function (g, b) {
        var ag = measureA(g, { ideal: true }).an.aZhuCha, ab = measureA(b, { ideal: true }).an.aZhuCha;
        area.appendChild(h('table.dt.cmp-table', h('tr', h('th', ''), h('th', '50 Hz'), h('th', '51 Hz（仍按 T = 0.1 s 算）')),
          h('tr', h('th', '逐差法 a / (m·s⁻²)'), h('td', ag.toFixed(4)), h('td', ab.toFixed(4))),
          h('tr', h('th', '小车真实 a'), h('td', { colspan: 2 }, g.a.toFixed(4)))));
      } });
      else if (err.id === 'E3') {
        var r = T.run(base, seed), x = measureA(r, { ideal: S.ideal }), a1 = T.analyze(x.m.segs, 0.1).aZhuCha, a2 = T.analyze(x.m.segs, 0.02).aZhuCha;
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '段长 / cm'), x.m.segs.map(function (s, i) { return h('td', 'x' + sub(i + 1) + '=' + cm(s)); })),
          h('tr', h('th', 'T = 0.1 s'), h('td', { colspan: 6, html: 'a = <b>' + a1.toFixed(3) + '</b> m/s²' })),
          h('tr', h('th.bad', 'T = 0.02 s'), h('td', { colspan: 6, html: 'a = <b style="color:#C7374B">' + a2.toFixed(2) + '</b> m/s²　（是上面的 ' + (a2 / a1).toFixed(1) + ' 倍）' }))));
        setTimeout(done, 200);
      } else if (err.id === 'E4' || err.id === 'E5') {
        if (err.id === 'E4') {
          var rEx = T.run({ ideal: false }, 101), stEx = T.firstClearDot(rEx.dots, 1e-3);
          var blob0 = Math.max(0, stEx - 6), cntEx = [];
          for (var k = 0; k <= 4; k++) { if (blob0 + k * 5 < rEx.dots.length) cntEx.push(blob0 + k * 5); }
          var sEx = stripRow(area, '密集区取起点', 'bad', rEx, 'em', {
            count: cntEx,
            labels: ['O', '1', '2', '3', '4'],
            marks: [{ from: -0.001, to: rEx.dots[stEx] + 0.0005, color: '#C7374B', text: '错误起点：在开头密集重叠区取 O 点（间距 < 1 mm）' }]
          });
          fitBoth([sEx], 0.11);
        }
        var A = [], B = [], posErrA = [0, 0, 0, 0, 0, 0, 0], posErrB = [0, 0, 0, 0, 0, 0, 0];
        for (var s = 1; s <= 20; s++) {
          var rr = T.run({ ideal: false }, 100 + s), st0 = T.firstClearDot(rr.dots, 1e-3);
          var ga = measureA(rr, { start: st0, seed: s * 7 });
          var blobStart = Math.max(0, st0 - 3 - ((s * 7) % 10));
          var ba = err.id === 'E4' ? measureA(rr, { start: blobStart, seed: s * 7 }) : measureA(rr, { start: st0, method: 'segment', seed: s * 7 });
          A.push([s, ga.an.aZhuCha]); B.push([s, ba.an.aZhuCha]);
          ga.m.pos.forEach(function (p, i) { posErrA[i] += Math.pow(p - ga.m.truePos[i], 2) / 20; });
          ba.m.pos.forEach(function (p, i) { posErrB[i] += Math.pow(p - ba.m.truePos[i], 2) / 20; });
        }
        var trueA = T.accel({});
        var ch = new ML.Chart(area, { xLabel: '第几次测量', yLabel: 'a / (m·s⁻²)', height: err.id === 'E4' ? 200 : 240, x: [0, 21] });
        ch.set([{ pts: A, color: '#25A870', label: err.id === 'E4' ? '从清晰点起' : '同一起点读数' }, { pts: B, color: '#C7374B', mark: 'x', label: err.id === 'E4' ? '从密集点起' : '逐段测量' }, { pts: [], line: [[0, trueA], [21, trueA]], color: '#10233F', dash: true }]);
        var sdA = P.std(A.map(function (p) { return p[1]; })), sdB = P.std(B.map(function (p) { return p[1]; })), mB = P.mean(B.map(function (p) { return p[1]; }));
        area.appendChild(h('div.cmp-note', { html: '20 次测量 a 的标准差：' + (err.id === 'E4' ? '清晰点起 ' : '同一起点 ') + sdA.toFixed(4) + '，' + (err.id === 'E4' ? '密集点起 ' : '逐段 ') + sdB.toFixed(4) + ' m/s²' + (err.id === 'E4' ? '；密集点起的平均值 ' + mB.toFixed(3) + '（真实 ' + trueA.toFixed(3) + '）——起点选在静止/初动混叠区，离散度与系统偏差同时增大。' : '') }));
        if (err.id === 'E5') {
          var ch2 = new ML.Chart(area, { xLabel: '计数点序号 n', yLabel: '位置误差 / mm', height: 200, x: [0, 6.5] });
          ch2.set([{ pts: posErrA.map(function (v, i) { return [i, Math.sqrt(v) * 1000]; }).slice(1), color: '#25A870', label: '同一起点' }, { pts: posErrB.map(function (v, i) { return [i, Math.sqrt(v) * 1000]; }).slice(1), color: '#C7374B', mark: 'x', label: '逐段（误差累积）' }]);
        }
        setTimeout(done, 300);
      } else if (err.id === 'E8') {
        var rows = [0.002, 0.005, 0.010, 0.030].map(function (d) {
          var g = T.photogate(Object.assign({ timer: 'none' }, base), d);
          return h('tr' + (d === 0.03 ? '.hl' : ''), h('td', (d * 1000) + ' mm'), h('td', (g.dt1 * 1000).toFixed(2)), h('td', (g.dt2 * 1000).toFixed(2)), h('td', g.a1.toFixed(4)), h('td', g.a2.toFixed(4)), h('td', ((g.a2 - g.a) / g.a * 100).toFixed(2) + '%'));
        });
        area.appendChild(h('table.dt.cmp-table', h('tr', h('th', '遮光片 d'), h('th', 'Δt₁ / ms'), h('th', 'Δt₂ / ms'), h('th', '(v₂²−v₁²)/2x'), h('th', '(v₂−v₁)/t'), h('th', '后者偏差')), rows));
        area.appendChild(h('div.cmp-note', '模型设定 a = ' + T.accel(Object.assign({ timer: 'none' }, base)).toFixed(4) + ' m/s²'));
        setTimeout(done, 200);
      } else if (err.id === 'M1') {
        var th = T.compensateAngle({}), r0 = T.run({}, seed), r1 = T.run({ theta: th }, seed);
        var s1 = stripRow(area, '不补偿阻力', 'good', r0, 'em'), s2 = stripRow(area, '垫高恰好补偿', 'good', r1, 'em');
        fitBoth([s1, s2], 0.72);
        return animateStrips([s1, s2], [r0, r1], function () {
          var a0 = measureA(r0, { ideal: true }), a1 = measureA(r1, { ideal: true });
          var ch = new ML.Chart(area, { xLabel: 't / s', yLabel: 'v / (m·s⁻¹)', height: 220, x: [0, 0.65] });
          ch.set([{ pts: a0.an.ts.map(function (t, i) { return [t, a0.an.vs[i]]; }), fit: true, color: '#E07B24', label: '不补偿：a = ' + a0.an.aZhuCha.toFixed(3) }, { pts: a1.an.ts.map(function (t, i) { return [t, a1.an.vs[i]]; }), fit: true, color: '#1661FF', label: '补偿：a = ' + a1.an.aZhuCha.toFixed(3) }]);
          area.appendChild(h('div.cmp-note', '两种情况相邻段之差 Δx 都恒定（不补偿：' + a0.an.dx.map(function (d) { return cm(d); }).join('、') + ' cm）'));
          done();
        });
      }
    },
    show: function (c, vis) {
      var sh = c.show, seed = 33;
      if (sh.type === 'tape') { var r = T.run(Object.assign({ ideal: S.ideal }, sh.config), seed); var s = stripRow(vis, '交上来的纸带', 'bad', r, 'em'); fitBoth([s], 0.72); }
      else if (sh.type === 'calc') {
        var cfg = sh.config, rr = T.run({ ideal: false, freq: cfg.freq || 50 }, seed), x = measureA(rr, { ideal: false });
        vis.appendChild(h('table.dt', h('tr', h('th', '段长 / cm'), x.m.segs.map(function (s, i) { return h('td', 'x' + sub(i + 1) + '=' + cm(s)); }))));
        if (cfg.Tcalc) vis.appendChild(h('div.cmp-note', { html: '该同学算得 a = <b>' + T.analyze(x.m.segs, cfg.Tcalc).aZhuCha.toFixed(1) + ' m/s²</b>' }));
        else if (cfg.freq && cfg.freq !== 50) vis.appendChild(h('div.cmp-note', { html: '若按 50 Hz（T = 0.10 s）处理此 51 Hz 纸带，算得 a = <b>' + T.analyze(x.m.segs, 0.1).aZhuCha.toFixed(4) + ' m/s²</b>（真实 a = ' + rr.a.toFixed(4) + ' m/s²）' }));
      } else if (sh.type === 'vt') {
        var r2 = T.run({ ideal: S.ideal }, seed), y = measureA(r2, { ideal: S.ideal });
        var ch = new ML.Chart(vis, { xLabel: 't / s', yLabel: 'v / (m·s⁻¹)', height: 220, paper: true, x: [0, 0.65], y: [0, 1.0] });
        ch.set([{ pts: y.an.ts.map(function (t, i) { return [t, y.an.vs[i]]; }), fit: true, color: '#1661FF' }]);
      }
    },
    restore: function () { S.mode = 'guided'; ML.store.save(); if (bench) { bench.showComp = false; bench.setMode('guided'); bench.setApparatus('timer'); bench.updateFreqChip(); bench.setBanner(null); } },
    replay: function (errId) {
      var e = ERR[errId]; if (!e) return;
      shell.go('bench');
      bench.setMode('free', true);
      if (errId === 'E8') {
        bench.setApparatus('gate');
        bench.flag = 0.03; bench.b.m = 0.05;
        bench.renderSide(); bench.stage.invalidate();
        bench.setBanner('<b>复现：' + e.name + '</b>　已切换到自由模式并装好 30 mm 遮光片和 50 g 槽码，直接点“由静止释放小车”查看偏差。');
        shell.main.scrollTop = 0;
        return;
      }
      bench.setApparatus('timer');
      if (errId === 'E3' || errId === 'E4' || errId === 'E5') {
        var validTape = null;
        for (var i = bench.tapes.length - 1; i >= 0; i--) {
          if (bench.tapes[i].threaded && bench.tapes[i].run.dots.length >= 35) { validTape = bench.tapes[i]; break; }
        }
        if (!validTape) {
          var rr = T.run({ timer: 'em', power: 'ac8', m: 0.05, near: true, ideal: S.ideal, freq: 50 }, (seedCounter += 7));
          validTape = { no: ++bench.tapeSeq, run: rr, timer: 'em', tags: [], threaded: true };
          bench.tapes.push(validTape); if (bench.tapes.length > 3) bench.tapes.shift();
        }
        ana.show(validTape, bench, { noScroll: true });
        var st0 = T.firstClearDot(validTape.run.dots, 1e-3);
        if (errId === 'E4') {
          ana.pickO(Math.max(0, st0 - 3));
        } else if (errId === 'E5') {
          ana.st.O = st0; ana.st.method = 'segment'; ana.measure();
        } else if (errId === 'E3') {
          ana.st.O = st0; ana.st.every = 5; ana.st.method = 'origin';
          ana.measure();
          ana.st.Tcalc = 0.02;
          ana.renderTags(); ana.renderOut();
        }
        bench.setBanner('<b>复现：' + e.name + '</b>　已在下方纸带处理区预设好对应情形，可直接对比修改（' + M.tex(e.trigger) + '）。');
        setTimeout(function () { bench.analysis.scrollIntoView({ behavior: ML.perf.low ? 'auto' : 'smooth', block: 'start' }); }, 40);
        return;
      }
      // 实验台操作类错误：预置正常器材，仅留出或覆盖对应异常项
      bench.showComp = errId === 'M1';
      bench.b.timer = 'em';
      bench.b.power = e.config.power || 'ac8';
      bench.b.threaded = true;
      bench.b.m = 0.05;
      bench.b.theta = 0;
      bench.b.startAt = e.config.near === false ? 0.30 : 0;
      bench.freq = e.config.freq || 50;
      bench.updateFreqChip();
      bench.check(true); bench.stage.invalidate();
      bench.setBanner('<b>复现：' + e.name + '</b>　' + (errId === 'M1' ? '右侧已出现“垫高 0° / 1.58° 补偿”按钮，分别运行两条纸带对比 Δx 是否都恒定。' : (e.trigger ? '已预置器材，请这样操作：' + M.tex(e.trigger) + '。' : '') + '（已切换到自由模式，系统不拦截）'));
      shell.main.scrollTop = 0;
    }
  };
  function openTry(id) { var e = ERR[id]; if (e) ML.TryIt(e, adapter, e.noteId && PROC[e.noteId] ? '<b>' + PROC[e.noteId].title + '：</b>' + PROC[e.noteId].how + ' ' + PROC[e.noteId].why : ''); }

  /* =====================================================================
   *  学·原理：页面小部件
   * ===================================================================== */
  function learnWidget(p, card) {
    var box = h('div.learn-widget');
    if (p.widget === 'timers') {
      card.appendChild(box);
      var active = 'em';
      var sw = h('div.side-row',
        h('button.chip.on', { type: 'button', onclick: function () { setType('em'); } }, '电磁打点计时器（约 8 V 交流）'),
        h('button.chip', { type: 'button', onclick: function () { setType('spark'); } }, '电火花计时器（220 V 交流）'));
      var stageWrap = h('div.timer-widget-stage');
      var cap = h('div.cmp-note');
      box.appendChild(sw); box.appendChild(stageWrap); box.appendChild(cap);
      var stg = new ML.stage.Stage(stageWrap, { layers: ['bg'] });
      stg.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var isEm = active === 'em', midX = w * 0.52;
        // 底座与外壳
        ctx.fillStyle = isEm ? D.grad(ctx, 0, 22, 0, 128, ['#4F6A8A', '#2F4560']) : D.grad(ctx, 0, 22, 0, 128, ['#EDF2F7', '#C9D1D9']);
        D.rr(ctx, 20, 22, w - 40, 108, 10); ctx.fill();
        ctx.strokeStyle = '#9AA8B8'; ctx.stroke();
        // 限位孔通道
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(28, 72, w - 56, 36);
        if (isEm) {
          // 线圈、振片、振针
          ctx.fillStyle = '#B87333'; D.rr(ctx, 44, 30, 56, 30, 4); ctx.fill();
          D.text(ctx, '线圈(8V~)', 72, 49, { align: 'center', size: 11, color: '#fff', weight: 700 });
          ctx.fillStyle = '#8E99A6'; ctx.fillRect(98, 40, midX - 96, 6);
          ctx.fillStyle = '#10233F'; ctx.fillRect(midX - 2, 46, 4, 30);
          D.text(ctx, '振针上下振动', midX + 8, 52, { size: 12, color: '#fff', weight: 700 });
          // 复写纸（上）+ 纸带（下）
          ctx.fillStyle = '#3B4B60'; ctx.fillRect(midX - 42, 77, 84, 5);
          D.text(ctx, '复写纸（在上）', midX, 66, { align: 'center', size: 11, color: '#fff', weight: 600 });
          ctx.fillStyle = TV.PAPER; ctx.fillRect(34, 86, w - 68, 12);
          ctx.strokeStyle = '#CDBF98'; ctx.strokeRect(34, 86, w - 68, 12);
          ctx.fillStyle = '#2B2B2B'; ctx.beginPath(); ctx.arc(midX, 92, 2.5, 0, Math.PI * 2); ctx.fill();
          D.text(ctx, '纸带压在复写纸下面', midX, 118, { align: 'center', size: 12, color: '#fff', weight: 700 });
        } else {
          // 放电针 + 上下两条纸带夹墨粉纸盘
          ctx.fillStyle = '#3B4B60'; ctx.fillRect(midX - 4, 34, 8, 34);
          ctx.fillStyle = '#E69B2D'; ctx.beginPath(); ctx.arc(midX, 72, 4, 0, Math.PI * 2); ctx.fill();
          D.text(ctx, '脉冲火花放电（220V~）', midX + 12, 48, { size: 12, color: '#10233F', weight: 700 });
          // 上纸带
          ctx.fillStyle = TV.PAPER; ctx.fillRect(34, 75, w - 68, 8); ctx.strokeStyle = '#CDBF98'; ctx.strokeRect(34, 75, w - 68, 8);
          // 墨粉纸盘（中）
          ctx.fillStyle = '#2B2B2B'; ctx.fillRect(midX - 48, 84, 96, 5);
          // 下纸带
          ctx.fillStyle = TV.PAPER; ctx.fillRect(34, 90, w - 68, 10); ctx.strokeStyle = '#CDBF98'; ctx.strokeRect(34, 90, w - 68, 10);
          ctx.fillStyle = '#2B2B2B'; ctx.beginPath(); ctx.arc(midX, 95, 2.2, 0, Math.PI * 2); ctx.fill();
          D.text(ctx, '墨粉纸盘夹在两条纸带之间（阻力更小）', midX, 120, { align: 'center', size: 12, color: '#10233F', weight: 700 });
        }
      });
      function setType(t) {
        active = t;
        var chips = ML.$$('.chip', sw);
        chips[0].classList.toggle('on', t === 'em');
        chips[1].classList.toggle('on', t === 'spark');
        cap.textContent = t === 'em'
          ? '电磁打点计时器：接约 8 V 交流电源；振针周期性打在复写纸上，纸带必须压在复写纸下面；振针与纸带摩擦阻力较大。'
          : '电火花计时器：接 220 V 交流电源；脉冲放电把墨粉打在纸带上，墨粉纸盘夹在两条纸带之间，与纸带接触阻力更小。';
        stg.invalidate('bg');
      }
      setType('em');
    } else if (p.widget === 'midtime-demo') {
      card.appendChild(box);
      var pick = 3;
      var swN = h('div.side-row', h('span.side-l', '查看计数点'));
      [1, 2, 3, 4, 5].forEach(function (n) {
        swN.appendChild(h('button.chip' + (n === pick ? '.on' : ''), { type: 'button', data: { n: String(n) }, onclick: function () { setN(n); } }, '点 ' + n));
      });
      var stgWrap = h('div.mid-widget-stage');
      var infoBox = h('div.cmp-note');
      box.appendChild(swN); box.appendChild(stgWrap); box.appendChild(infoBox);
      var stgM = new ML.stage.Stage(stgWrap, { layers: ['bg'] });
      var normPts = [0, 0.06, 0.145, 0.255, 0.39, 0.555, 0.75];
      stgM.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var xL = 36, xR = w - 28, span = xR - xL;
        var xs = normPts.map(function (f) { return xL + (f / 0.75) * span; });
        var ty = 82, th = 28;
        // 纸带底
        ctx.fillStyle = TV.PAPER; ctx.fillRect(14, ty, w - 28, th);
        ctx.strokeStyle = '#CDBF98'; ctx.strokeRect(14, ty, w - 28, th);
        // 高亮与点 n 相邻的两段
        ctx.fillStyle = 'rgba(22,97,255,0.14)'; ctx.fillRect(xs[pick - 1], ty + 1, xs[pick] - xs[pick - 1], th - 2);
        ctx.fillStyle = 'rgba(18,169,196,0.16)'; ctx.fillRect(xs[pick], ty + 1, xs[pick + 1] - xs[pick], th - 2);
        // 上方：距起点 O 的距离 d_{n-1} 与 d_{n+1}
        function dimAbove(x0, x1, y, col, label) {
          ctx.strokeStyle = col; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(x0, ty - 14); ctx.lineTo(x0, y - 3); ctx.moveTo(x1, ty - 14); ctx.lineTo(x1, y - 3);
          ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
          ctx.font = '700 11.5px "PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif';
          var tw = ctx.measureText(label).width + 8;
          ctx.fillStyle = '#F8FBFF'; ctx.fillRect((x0 + x1) / 2 - tw / 2, y - 9, tw, 14);
          D.text(ctx, label, (x0 + x1) / 2, y + 3, { align: 'center', size: 11.5, weight: 700, color: col });
        }
        if (pick > 1) dimAbove(xs[0], xs[pick - 1], 32, '#4A5B73', 'd' + sub(pick - 1));
        dimAbove(xs[0], xs[pick + 1], 14, '#1661FF', 'd' + sub(pick + 1));
        dimAbove(xs[pick - 1], xs[pick + 1], 50, '#17784F', 'd' + sub(pick + 1) + (pick > 1 ? ' − d' + sub(pick - 1) : '') + '（用时 2T）');
        // 纸带上的点与编号
        for (var i = 0; i < xs.length; i++) {
          var isMid = i === pick;
          ctx.fillStyle = isMid ? '#C7374B' : '#2B2B2B';
          ctx.beginPath(); ctx.arc(xs[i], ty + th / 2, isMid ? 4.2 : 2.8, 0, Math.PI * 2); ctx.fill();
          if (isMid) { ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(xs[i], ty + th / 2, 7.5, 0, Math.PI * 2); ctx.stroke(); }
          D.text(ctx, i === 0 ? 'O' : String(i), xs[i], ty - 7, { align: 'center', size: 12, weight: isMid ? 700 : 600, color: isMid ? '#C7374B' : '#10233F' });
        }
        // 下方：分段位移 x₁..x₆
        for (i = 0; i < 6; i++) {
          var act = i === pick - 1 || i === pick, mid = (xs[i] + xs[i + 1]) / 2;
          D.text(ctx, 'x' + sub(i + 1), mid, ty + th + 16, { align: 'center', size: 12, weight: act ? 700 : 500, color: act ? (i === pick - 1 ? '#1661FF' : '#0E8CA3') : '#7D8B9D' });
        }
        // 2T 括弧
        ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(xs[pick - 1], ty + th + 22); ctx.lineTo(xs[pick - 1], ty + th + 27);
        ctx.lineTo(xs[pick + 1], ty + th + 27); ctx.lineTo(xs[pick + 1], ty + th + 22); ctx.stroke();
        D.text(ctx, '两段共 2T，点 ' + pick + ' 是中间时刻', (xs[pick - 1] + xs[pick + 1]) / 2, ty + th + 41, { align: 'center', size: 11.5, weight: 700, color: '#C7374B' });
      });
      function setN(n) {
        pick = n;
        ML.$$('.chip', swN).forEach(function (c) { c.classList.toggle('on', c.dataset.n === String(n)); });
        var n1 = sub(n), n2 = sub(n + 1), n0 = sub(n - 1);
        var bySeg = 'v' + n1 + ' = ' + M.frac('x' + n1 + ' + x' + n2, '2T');
        var byOrg = 'v' + n1 + ' = ' + M.frac(n > 1 ? 'd' + n2 + ' − d' + n0 : 'd' + n2, '2T');
        infoBox.innerHTML = '<b>两种题型对照（计数点 ' + n + '）：</b>　① 已知分段长时：' + bySeg + '　｜　② 已知到 O 点距离/坐标时：' + byOrg;
        stgM.invalidate('bg');
      }
      setN(3);
    } else if (p.widget === 'tape-demo') {
      card.appendChild(box);
      var r = T.run({ ideal: S.ideal }, 5), st = T.firstClearDot(r.dots, 1e-3), count = [];
      for (var k = 0; k <= 6; k++) count.push(st + 5 * k);
      var s = new TV.TapeStrip(box, { height: 110 });
      s.set({ dots: r.dots, timer: 'em', count: count, labels: ['O', '1', '2', '3', '4', '5', '6'], marks: [{ from: -0.001, to: r.dots[st] + 0.0005, color: '#E69B2D', text: '密集点' }] });
      setTimeout(function () { s.zoomTo(1500, 0.06); }, 30);
    } else if (p.widget === 'zhucha-demo') {
      card.appendChild(box);
      var rZ = T.run({ ideal: false }, 9), stZ = T.firstClearDot(rZ.dots, 1e-3);
      var mZ = T.measure(rZ.dots, { start: stZ, every: 5, n: 6, ideal: true });
      var baseSegs = mZ.segs.slice(0, 6), trueAZ = rZ.a;
      var zMode = 'zc', errTarget = 'none';
      var swM = h('div.side-row',
        h('span.side-l', '算法对比'),
        h('button.chip.on', { type: 'button', data: { m: 'zc' }, onclick: function () { zMode = 'zc'; updateZ(); } }, '逐差法（6 段全参与）'),
        h('button.chip', { type: 'button', data: { m: 'avg' }, onclick: function () { zMode = 'avg'; updateZ(); } }, '相邻差平均（中间 4 段抵消）'));
      var swE = h('div.side-row',
        h('span.side-l', '读数偏差'),
        h('button.chip.on', { type: 'button', data: { e: 'none' }, onclick: function () { errTarget = 'none'; updateZ(); } }, '无额外偏差'),
        h('button.chip', { type: 'button', data: { e: 'x1' }, onclick: function () { errTarget = 'x1'; updateZ(); } }, 'x₁ 读偏 +1.5 mm'),
        h('button.chip', { type: 'button', data: { e: 'x3' }, onclick: function () { errTarget = 'x3'; updateZ(); } }, 'x₃ 读偏 +1.5 mm'),
        h('button.chip', { type: 'button', data: { e: 'x6' }, onclick: function () { errTarget = 'x6'; updateZ(); } }, 'x₆ 读偏 +1.5 mm'));
      var stgWrapZ = h('div.zc-widget-stage');
      var resZ = h('div.cmp-note');
      box.appendChild(swM); box.appendChild(swE); box.appendChild(stgWrapZ); box.appendChild(resZ);
      var stgZ = new ML.stage.Stage(stgWrapZ, { layers: ['bg'] });
      function curSegs() {
        var s = baseSegs.slice();
        if (errTarget === 'x1') s[0] += 0.0015;
        else if (errTarget === 'x3') s[2] += 0.0015;
        else if (errTarget === 'x6') s[5] += 0.0015;
        return s;
      }
      stgZ.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var segs = curSegs(), sum = segs.reduce(function (a, b) { return a + b; }, 0);
        var x0 = 24, span = w - 48, xs = [x0], cur = x0;
        segs.forEach(function (v) { cur += (0.35 / 6 + 0.65 * (v / sum)) * span; xs.push(cur); });
        var ty = 28, th = 32;
        for (var i = 0; i < 6; i++) {
          var sx = xs[i], sw = xs[i + 1] - xs[i], used = zMode === 'zc' || i === 0 || i === 5;
          var fill = !used ? '#EAEFF5' : (zMode === 'zc' ? (i < 3 ? '#DCE8FF' : '#DCF4EA') : (i === 0 ? '#DCE8FF' : '#DCF4EA'));
          ctx.fillStyle = fill; ctx.fillRect(sx, ty, sw, th);
          ctx.strokeStyle = '#CDBF98'; ctx.strokeRect(sx, ty, sw, th);
          if (!used) {
            ctx.strokeStyle = 'rgba(142,153,166,0.55)'; ctx.beginPath(); ctx.moveTo(sx + 4, ty + th - 4); ctx.lineTo(sx + sw - 4, ty + 4); ctx.stroke();
          }
          var isErr = errTarget === 'x' + (i + 1);
          if (isErr) { ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 2; ctx.strokeRect(sx + 1, ty + 1, sw - 2, th - 2); ctx.lineWidth = 1; }
          var role = zMode === 'zc' ? (i < 3 ? '−x' + sub(i + 1) : '+x' + sub(i + 1)) : (i === 0 ? '−x₁' : i === 5 ? '+x₆' : '抵消×0');
          var col = !used ? '#8E99A6' : (i < 3 ? '#1661FF' : '#17784F');
          D.text(ctx, role, sx + sw / 2, ty + 14, { align: 'center', size: 11.5, weight: 700, color: col });
          D.text(ctx, (segs[i] * 100).toFixed(2), sx + sw / 2, ty + 27, { align: 'center', size: 10.5, color: isErr ? '#C7374B' : '#4A5B73' });
        }
        for (i = 0; i <= 6; i++) {
          ctx.fillStyle = '#2B2B2B'; ctx.beginPath(); ctx.arc(xs[i], ty + th / 2, 2.5, 0, Math.PI * 2); ctx.fill();
          D.text(ctx, i === 0 ? 'O' : String(i), xs[i], ty - 6, { align: 'center', size: 11.5, weight: 600, color: '#10233F' });
        }
        D.text(ctx, zMode === 'zc' ? '逐差法：6 段全部参与，误差被 9T² 摊薄' : '相邻差平均：x₂~x₅ 相互抵消，首尾误差被 5T² 放大', w / 2, ty + th + 20, { align: 'center', size: 12, weight: 600, color: zMode === 'zc' ? '#1661FF' : '#C7374B' });
      });
      function updateZ() {
        ML.$$('.chip', swM).forEach(function (c) { c.classList.toggle('on', c.dataset.m === zMode); });
        ML.$$('.chip', swE).forEach(function (c) { c.classList.toggle('on', c.dataset.e === errTarget); });
        var segs = curSegs(), an = T.analyze(segs, 0.1);
        var devZC = (an.aZhuCha - trueAZ) / trueAZ * 100;
        var devTwo = (an.aTwoPoint - trueAZ) / trueAZ * 100;
        var hint = errTarget === 'none'
          ? '无偏差时两种算法都接近真实值 a = ' + trueAZ.toFixed(3) + ' m/s²。试试点击右侧按钮给某一段加上 +1.5 mm 读数偏差。'
          : errTarget === 'x3'
            ? '<b>关键发现：</b>x₃ 读偏 +1.5 mm 时，相邻差平均把 x₃ 抵消了（只用了首尾两段，中间 4 段根本没起作用）；逐差法让 6 段共同平均，单个偏差只影响 1/9T²。'
            : '<b>误差比较：</b>当首段或末段（' + errTarget + '）读偏 +1.5 mm 时，逐差法偏差 ' + devZC.toFixed(2) + '%，而相邻差平均偏差高达 ' + devTwo.toFixed(2) + '%（约 1.8 倍）！';
        resZ.innerHTML = '逐差法 a = <b>' + an.aZhuCha.toFixed(3) + '</b> m/s²（偏差 ' + devZC.toFixed(2) + '%）　｜　相邻差平均 a = <b>' + an.aTwoPoint.toFixed(3) + '</b> m/s²（偏差 ' + devTwo.toFixed(2) + '%）<br>' + hint;
        stgZ.invalidate('bg');
      }
      updateZ();
    } else if (p.widget === 'vt-demo') {
      card.appendChild(box);
      var r3 = T.run({}, 9), y = measureA(r3, {});
      var c2 = new ML.Chart(box, { xLabel: 't / s', yLabel: 'v / (m·s⁻¹)', height: 240, paper: true, x: [0, 0.65] });
      c2.set([{ bars: true, barW: 0.1, pts: y.m.segs.map(function (x, i) { return [(i + 0.5) * 0.1, x / 0.1]; }), color: '#C7374B', label: '剪下的纸带条（高 ∝ 平均速度）' }, { pts: y.an.ts.map(function (t, i) { return [t, y.an.vs[i]]; }), fit: true, color: '#1661FF', label: 'v-t 拟合直线' }]);
    } else if (p.widget === 'gate-demo') {
      card.appendChild(box);
      var gateWrap = h('div.gate-widget-stage');
      box.appendChild(gateWrap);
      var stgG = new ML.stage.Stage(gateWrap, { layers: ['bg'] });
      stgG.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        // 上半区：光电门测速装置与局部放大图
        var trackY = 98, g1x = w * 0.27, g2x = w * 0.57, zoomX = w * 0.72, zoomW = w - zoomX - 14;
        // 长木板与小车
        ctx.fillStyle = '#D9B98C'; ctx.fillRect(14, trackY, zoomX - 28, 8);
        ctx.fillStyle = D.grad(ctx, 0, trackY - 26, 0, trackY, ['#5C8DEB', '#2E5FBF']);
        D.rr(ctx, 26, trackY - 24, 54, 22, 4); ctx.fill();
        ctx.fillStyle = '#10233F'; ctx.fillRect(76, trackY - 46, 7, 22);
        D.text(ctx, '遮光片 d', 79, trackY - 52, { align: 'center', size: 11, weight: 700 });
        // 光电门 1 与 2
        [g1x, g2x].forEach(function (gx, idx) {
          ctx.fillStyle = '#3B4B60'; D.rr(ctx, gx - 5, trackY - 62, 10, 62, 3); ctx.fill();
          ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.arc(gx, trackY - 36, 3, 0, Math.PI * 2); ctx.fill();
          D.text(ctx, '光电门' + (idx + 1), gx, trackY - 68, { align: 'center', size: 11.5, weight: 700 });
          D.text(ctx, idx === 0 ? 'Δt₁ ⇒ v₁=d/Δt₁' : 'Δt₂ ⇒ v₂=d/Δt₂', gx, trackY - 82, { align: 'center', size: 11, color: '#1661FF', weight: 600 });
        });
        // 两门间距 x
        ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(g1x, trackY + 12); ctx.lineTo(g1x, trackY + 20); ctx.moveTo(g2x, trackY + 12); ctx.lineTo(g2x, trackY + 20);
        ctx.moveTo(g1x, trackY + 16); ctx.lineTo(g2x, trackY + 16); ctx.stroke();
        D.text(ctx, '两门间距 x   a = (v₂² − v₁²) / 2x', (g1x + g2x) / 2, trackY + 30, { align: 'center', size: 11.5, weight: 600, color: '#10233F' });
        // 右侧遮光过程放大框
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#B9C8DA'; D.rr(ctx, zoomX, 8, zoomW, 114, 8); ctx.fill(); ctx.stroke();
        D.text(ctx, '遮光片通过光束（放大）', zoomX + zoomW / 2, 24, { align: 'center', size: 11, weight: 700, color: '#4A5B73' });
        var beamX = zoomX + zoomW * 0.50, fw = Math.min(34, zoomW * 0.24);
        ctx.strokeStyle = '#C7374B'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(beamX, 34); ctx.lineTo(beamX, 92); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(22,97,255,0.18)'; ctx.strokeStyle = '#1661FF'; ctx.setLineDash([3, 3]); ctx.fillRect(beamX - fw, 42, fw, 32); ctx.strokeRect(beamX - fw, 42, fw, 32); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(16,35,63,0.82)'; ctx.fillRect(beamX, 42, fw, 32);
        D.text(ctx, '位移 d（耗时 Δt）', beamX, 90, { align: 'center', size: 11, weight: 600, color: '#1661FF' });
        D.text(ctx, 'v = d / Δt', beamX, 110, { align: 'center', size: 12, weight: 700, color: '#C7374B' });
        // 分隔线
        ctx.strokeStyle = '#DCE5F0'; ctx.beginPath(); ctx.moveTo(14, 136); ctx.lineTo(w - 14, 136); ctx.stroke();
        // 下半区：时间轴误差对照
        D.text(ctx, '时间轴对比：为什么用 a = (v₂ − v₁) / t 会偏小？', 18, 154, { size: 12, weight: 700, color: '#10233F' });
        var axY = 204, t1a = 44, t1w = 68, t2a = Math.max(190, w * 0.44), t2w = 34;
        var tm1 = t1a + t1w / 2, tm2 = t2a + t2w / 2;
        ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(22, axY); ctx.lineTo(w - 20, axY); ctx.stroke();
        D.text(ctx, 't', w - 14, axY + 4, { size: 12, weight: 700 });
        ctx.fillStyle = 'rgba(230,155,45,0.28)'; ctx.strokeStyle = '#E69B2D'; ctx.fillRect(t1a, axY - 14, t1w, 14); ctx.strokeRect(t1a, axY - 14, t1w, 14);
        ctx.fillStyle = 'rgba(18,169,196,0.28)'; ctx.strokeStyle = '#12A9C4'; ctx.fillRect(t2a, axY - 14, t2w, 14); ctx.strokeRect(t2a, axY - 14, t2w, 14);
        D.text(ctx, 'Δt₁', tm1, axY - 3, { align: 'center', size: 11, weight: 700, color: '#9A5A00' });
        D.text(ctx, 'Δt₂', tm2, axY - 3, { align: 'center', size: 11, weight: 700, color: '#0E8CA3' });
        [tm1, tm2].forEach(function (tx, i) {
          ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.arc(tx, axY, 4, 0, Math.PI * 2); ctx.fill();
          D.text(ctx, i === 0 ? 'tₘ₁(v₁)' : 'tₘ₂(v₂)', tx, axY + 14, { align: 'center', size: 11, weight: 700, color: '#C7374B' });
        });
        // t 与 t' 对比括弧
        ctx.strokeStyle = '#4A5B73'; ctx.beginPath(); ctx.moveTo(t1a, axY - 20); ctx.lineTo(t1a, axY - 26); ctx.lineTo(t2a, axY - 26); ctx.lineTo(t2a, axY - 20); ctx.stroke();
        D.text(ctx, 't（两门开始遮光时间差）', (t1a + t2a) / 2, axY - 30, { align: 'center', size: 11, color: '#4A5B73', weight: 600 });
        ctx.strokeStyle = '#C7374B'; ctx.beginPath(); ctx.moveTo(tm1, axY + 19); ctx.lineTo(tm1, axY + 25); ctx.lineTo(tm2, axY + 25); ctx.lineTo(tm2, axY + 19); ctx.stroke();
        D.text(ctx, "真实间隔 t′ = t − (Δt₁−Δt₂)/2 < t", (tm1 + tm2) / 2, axY + 39, { align: 'center', size: 11, color: '#C7374B', weight: 700 });
        D.text(ctx, '用偏大的 t 作分母 ⇒ a 偏小', Math.max(t2a + t2w + 18, w * 0.62), axY + 20, { size: 11.5, weight: 700, color: '#C7374B' });
      });
      var rows = [0.002, 0.005, 0.010, 0.030].map(function (d) { var g = T.photogate({ timer: 'none' }, d); return h('tr', h('td', (d * 1000) + ' mm'), h('td', (g.dt1 * 1000).toFixed(2) + ' ms'), h('td', g.v1.toFixed(4)), h('td', g.vTrue1.toFixed(4))); });
      box.appendChild(h('table.dt', h('tr', h('th', '遮光片宽 d'), h('th', 'Δt₁'), h('th', 'd/Δt₁ (m/s)'), h('th', '遮光片前沿到达时的瞬时速度 (m/s)')), rows));
    }
  }

  /* =====================================================================
   *  组装
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
        wrap.appendChild(h('p.muted', '每个“试一试”按四拍进行：布置 → 运行 → 对比 → 追问与揭示。所有后果都由实验台的物理模型实时算出。'));
        var grid = h('div.err-grid'), cardMap = {};
        C.errors.forEach(function (e) {
          var note = PROC[e.noteId];
          var card = h('div.err-card' + ((S.done || {})[e.id] ? '.done' : ''),
            h('div.err-name', ((S.done || {})[e.id] ? '✓ ' : '') + e.name),
            note ? h('div.err-note', { html: '<b>注意事项：</b>' + M.tex(note.how) + (note.why ? '<div class="st-why">理由：' + M.tex(note.why) + '</div>' : '') }) : null,
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
        wrap.appendChild(h('p.muted', '看一个“出了问题”的结果，先判断原因，再去实验台亲手复现。'));
        var rev = h('div.rev'); wrap.appendChild(rev);
        ML.Reverse(rev, C.reverse, adapter);
      } },
      { id: 'paper', label: '练·真题', mount: function (el) { new ML.Paper(el, Q, { title: C.title.replace('实验：', '') + ' · 练习', onReplay: adapter.replay }); } }
    ]
  });
  ML.bus.on('tab', function (id) { if (id !== 'bench' && bench && bench.b.running) { bench.b.running = false; bench.loop.stop(); } });
  shell.go(S.tab);
  ML.perf.probe();
  ML.m01 = { bench: function () { return bench; }, ana: ana, adapter: adapter, shell: shell };
})(window.ML);
