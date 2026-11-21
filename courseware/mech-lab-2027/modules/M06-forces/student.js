/* M06 学生实验台：独立拉拽、自由结点、读数描点与学生作图。 */
(function (ML) {
  'use strict';
  if (typeof document === 'undefined') return;
  var h = ML.h, P = ML.phys, FF = ML.forces, D = ML.stage.draw;
  var C = ML.json('ml-content'), S = ML.store.data;
  var PROC = {}; C.procedure.forEach(function (p) { PROC[p.id] = p; });
  var TOL_O = 0.003;

  function cp(o) { return JSON.parse(JSON.stringify(o)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function arrow(ctx, a, b, color, width) {
    var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    if (L < 2) return;
    var ux = dx / L, uy = dy / L, hl = 9;
    ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = width || 2.2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x - ux * 4, b.y - uy * 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - ux * hl - uy * hl * 0.44, b.y - uy * hl + ux * hl * 0.44);
    ctx.lineTo(b.x - ux * hl + uy * hl * 0.44, b.y - uy * hl - ux * hl * 0.44);
    ctx.closePath(); ctx.fill();
  }
  function meter(ctx, knotPx, handPx, label, active, valueText) {
    var dx = handPx.x - knotPx.x, dy = handPx.y - knotPx.y, len = Math.hypot(dx, dy) || 1;
    var ux = dx / len, uy = dy / len, hook = { x: knotPx.x + ux * 24, y: knotPx.y + uy * 24 };
    var bodyLen = Math.max(38, len - 42), ang = Math.atan2(dy, dx);
    ctx.strokeStyle = '#34465C'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(knotPx.x, knotPx.y); ctx.lineTo(hook.x, hook.y); ctx.stroke();
    ctx.save(); ctx.translate(hook.x, hook.y); ctx.rotate(ang);
    ctx.fillStyle = active ? '#EAF1FF' : '#F8FAFC'; ctx.strokeStyle = active ? '#1661FF' : '#52677F'; ctx.lineWidth = 1.6;
    D.rr(ctx, 0, -12, bodyLen, 24, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFF'; ctx.strokeStyle = '#9AABC0'; D.rr(ctx, 12, -7, Math.max(18, bodyLen - 30), 14, 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#73859A'; ctx.lineWidth = 1;
    for (var i = 0; i <= 10; i++) { var x = 16 + i * Math.max(1, (bodyLen - 38) / 10); ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x, i % 5 ? -1 : 2); ctx.stroke(); }
    ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bodyLen + 8, 0, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    D.text(ctx, label, (hook.x + handPx.x) / 2, (hook.y + handPx.y) / 2 - 20, { align: 'center', size: 12, weight: 700, color: '#10233F' });
    if (valueText) D.text(ctx, valueText, handPx.x, handPx.y - 18, { align: 'center', size: 11.5, weight: 700, color: '#1661FF' });
  }
  function initialLive(angles) {
    var a = angles || [35, 45], k = { x: 0, y: 0.115 };
    var hs = a.map(function (deg, i) {
      var r = deg * Math.PI / 180, reach = 0.140;
      return { x: k.x + (i ? 1 : -1) * Math.sin(r) * reach, y: k.y + Math.cos(r) * reach };
    });
    return { knot: k, vel: { x: 0, y: 0 }, hands: hs, frozen: false, snap: null };
  }

  function StudentBench(el) {
    var self = this; this.el = el; this.mode = S.mode || 'guided';
    if (['guided', 'free', 'demo'].indexOf(this.mode) < 0) this.mode = 'guided';
    this.stageId = 'cal'; this.trials = []; this.done = {};
    this.st = {};
    this.modeChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'guided' }, onclick: function () { self.setMode('guided'); } }, '学生实验'),
      h('button.chip', { type: 'button', data: { v: 'free' }, onclick: function () { self.setMode('free'); } }, '自由探究'),
      h('button.chip', { type: 'button', data: { v: 'demo' }, onclick: function () { self.setMode('demo'); } }, '教师演示'));
    this.stageChips = h('div.seg', ['cal', 'two', 'single', 'plot'].map(function (id, i) {
      return h('button.chip', { type: 'button', data: { v: id }, onclick: function () { self.setStage(id); } }, ['① 校准', '② 双表拉拽', '③ 单表等效', '④ 学生作图'][i]);
    }));
    this.idealChip = h('button.chip', { type: 'button', onclick: function () {
      S.ideal = !S.ideal; ML.store.save(); self.idealChip.textContent = S.ideal ? '理想条件' : '真实条件'; self.idealChip.classList.toggle('on', S.ideal);
    } }, S.ideal ? '理想条件' : '真实条件'); this.idealChip.classList.toggle('on', S.ideal);
    this.bannerEl = h('div.bench-banner', { hidden: true });
    this.stageWrap = h('div.bench-stage'); this.stageActs = h('div.stage-acts'); this.stageWrap.appendChild(this.stageActs);
    this.side = h('aside.bench-side'); this.analysis = h('section.analysis', { hidden: true });
    this.benchEl = h('div.bench', h('div.bench-top', this.modeChips, this.stageChips, h('div.spacer'), this.idealChip), this.bannerEl,
      h('div.bench-row', this.stageWrap, this.side), this.analysis); el.appendChild(this.benchEl);
    this.stage = new ML.stage.Stage(this.stageWrap, { layers: ['bg', 'fg'] });
    this.stage.on('bg', function (ctx, w, hh) { self.drawBg(ctx, w, hh); });
    this.stage.on('fg', function (ctx, w, hh) { self.drawFg(ctx, w, hh); });
    this.mag = new ML.stage.Magnifier(this.stageWrap, { zoom: 3, size: 136 });
    this.loop = new ML.stage.Loop(function (dt) { return self.tick(dt); });
    this.resetExperiment(true); this.bindPointer(); this.setMode(this.mode, true); this.setStage('cal', true);
  }
  StudentBench.prototype.guided = function () { return this.mode === 'guided'; };
  StudentBench.prototype.setBanner = function (html) { this.bannerEl.hidden = !html; this.bannerEl.innerHTML = html || ''; this.benchEl.classList.toggle('has-banner', !!html); };
  StudentBench.prototype.block = function (msg) { ML.toast(msg, 'warn'); this.setBanner('<b>先停一下：</b>' + msg); };
  StudentBench.prototype.resetExperiment = function (silent) {
    this.loop.stop();
    this.st = { calDone: false, zeroSet: [false, false], zeroErr1: 0, zeroErr2: 0, calPullN: 2, calPulled: false,
      paperFixed: false, parallelChecked: false, liftDeg: 0, markDist: 0.120,
      target: { x: 0, y: FF.Y_O }, two: initialLive(), single: null,
      twoRead: [null, null], singleRead: null, marks: {}, singleDirRecorded: false,
      twoRecorded: false, singleRecorded: false, markTool: null, plotTool: null,
      plot: null, plotRecorded: false, lastResult: null };
    this.done = {}; this._dragId = null; this.analysis.hidden = true;
    if (!silent) { this.setStage('cal', true); this.setBanner(null); ML.toast('已重置：请从调零、对拉开始亲手完成实验', 'info'); }
  };
  StudentBench.prototype.setMode = function (m, silent) {
    var old = this.mode; this.mode = m; S.mode = m; ML.store.save();
    ML.$$('.chip', this.modeChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === m); });
    if (!silent) {
      if (m === 'guided' && old !== 'guided') { this.resetExperiment(true); this.stageId = 'cal'; }
      this.setBanner(null); this.setStage(this.stageId, true);
      ML.toast(m === 'guided' ? '学生实验：独立拉拽、亲自读数描点与作图，无自动答案' : m === 'demo' ? '教师演示：可使用标准拉拽和自动作图按钮' : '自由探究：可设置未调零、抬起和短细绳，观察后果', 'info');
    }
  };
  StudentBench.prototype.setStage = function (id, silent) {
    var st = this.st;
    if (!silent && this.guided()) {
      if (id === 'two' && !st.calDone) { this.block('先分别调零，再拖动两表对拉并核对示数。'); return; }
      if (id === 'single' && !st.twoRecorded) { this.block('先稳定到 O 点，读出 F₁、F₂，描下 O、P₁、P₂，再保存双拉记录。'); return; }
    }
    if (id === 'plot' && !this.hasPlotData()) { this.block('先保存双拉读数和方向点，再保存单拉读数与方向。'); return; }
    this.loop.stop(); this.stageId = id; S.stage = id; ML.store.save();
    if (id === 'single' && !st.single) {
      st.single = initialLive([15]); st.single.knot = { x: 0.025, y: 0.145 };
      st.single.hands = [{ x: 0.061, y: 0.280 }]; st.single.vel = { x: 0, y: 0 };
    }
    if (id === 'plot' && !st.plot) this.resetPlot(st.plotScale || 1);
    ML.$$('.chip', this.stageChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === id); });
    if (!silent) this.setBanner(null);
    this.stage.invalidate(); this.renderStageActs(); this.renderSide();
    if ((id === 'two' || id === 'single') && !this.live().frozen) this.loop.start();
  };
  StudentBench.prototype.live = function () { return this.st[this.stageId]; };
  StudentBench.prototype.tick = function (dt) {
    if (!this.el.isConnected || (this.stageId !== 'two' && this.stageId !== 'single')) return false;
    var l = this.live(); if (!l || l.frozen) return false;
    dt = Math.min(0.04, Math.max(0.001, dt)); var n = Math.max(1, Math.ceil(dt / 0.003)), step = dt / n;
    for (var i = 0; i < n; i++) FF.stepPullKnot(l.knot, l.vel, l.hands, step);
    this.stage.invalidate('fg'); this.updateStatus(); return true;
  };
  StudentBench.prototype.geo = function (w, hh) {
    var bw = Math.min(w - 28, 650), bh = Math.max(210, hh - 56), bx = (w - bw) / 2, by = 10;
    var px = bx + 12, py = by + 12, pw = bw - 24, ph = bh - 24;
    var ppm = Math.min(pw / 0.44, ph / 0.37), ax = px + pw / 2, ay = py + 18;
    return { px: px, py: py, pw: pw, ph: ph, bx: bx, by: by, bw: bw, bh: bh, ppm: ppm, ax: ax, ay: ay };
  };
  StudentBench.prototype.xy = function (g, p) { return { x: g.ax + p.x * g.ppm, y: g.ay + p.y * g.ppm }; };
  StudentBench.prototype.meters = function (g, p) { return { x: (p.x - g.ax) / g.ppm, y: (p.y - g.ay) / g.ppm }; };
  StudentBench.prototype.drawBg = function (ctx, w, hh) {
    ctx.fillStyle = '#EAF1F8'; ctx.fillRect(0, 0, w, hh); var g = this.geo(w, hh);
    ctx.fillStyle = '#D2AE7B'; D.rr(ctx, g.bx, g.by, g.bw, g.bh, 10); ctx.fill();
    ctx.fillStyle = '#FFF'; D.rr(ctx, g.px, g.py, g.pw, g.ph, 4); ctx.fill(); ctx.strokeStyle = '#CBD5E1'; ctx.stroke();
    if (this.stageId === 'cal') return;
    ctx.save(); ctx.strokeStyle = 'rgba(18,169,196,.13)'; ctx.lineWidth = 0.8;
    var step = 0.01 * g.ppm;
    for (var x = g.ax; x < g.px + g.pw; x += step) { ctx.beginPath(); ctx.moveTo(x, g.py); ctx.lineTo(x, g.py + g.ph); ctx.stroke(); }
    for (x = g.ax - step; x > g.px; x -= step) { ctx.beginPath(); ctx.moveTo(x, g.py); ctx.lineTo(x, g.py + g.ph); ctx.stroke(); }
    for (var y = g.ay; y < g.py + g.ph; y += step) { ctx.beginPath(); ctx.moveTo(g.px, y); ctx.lineTo(g.px + g.pw, y); ctx.stroke(); }
    ctx.restore();
    var A = this.xy(g, { x: 0, y: 0 });
    if (this.stageId === 'plot') {
      D.text(ctx, '白纸作图区（浅蓝网格每格 1 cm）', g.px + g.pw - 12, g.py + 18, { align: 'right', size: 11.5, color: '#4A5B73' });
      return;
    }
    var O = this.xy(g, this.st.target); ctx.strokeStyle = '#12A9C4'; ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(O.x, O.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(O.x, O.y, 8, 0, Math.PI * 2); ctx.stroke();
    D.text(ctx, 'O', O.x - 13, O.y + 4, { align: 'right', size: 12, weight: 700, color: '#0E8CA3' });
    ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.arc(A.x, A.y, 5, 0, Math.PI * 2); ctx.fill();
    D.text(ctx, 'A（图钉）', A.x + 10, A.y + 4, { size: 11, weight: 700 });
  };
  StudentBench.prototype.drawFg = function (ctx, w, hh) {
    this.hot = []; if (w < 80 || hh < 80) return;
    var g = this.geo(w, hh), st = this.st;
    if (this.stageId === 'cal') { this.drawCal(ctx, g); return; }
    if (this.stageId === 'plot') { this.drawPlot(ctx, g); return; }
    var l = this.live(), k = this.xy(g, l.knot), A = this.xy(g, { x: 0, y: 0 }), atO = dist(l.knot, st.target) <= TOL_O;
    ctx.strokeStyle = '#7A5C3E'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(k.x, k.y); ctx.stroke();
    var f = FF.pullForces(l.knot, l.hands);
    for (var i = 0; i < l.hands.length; i++) {
      var hp = this.xy(g, l.hands[i]), val = this.mode === 'demo' ? f.meters[i].mag.toFixed(2) + ' N' : '';
      meter(ctx, k, hp, this.stageId === 'two' ? (i ? 'F₂（乙）' : 'F₁（甲）') : 'F′', this._dragId === 'h' + i, val);
      if (!l.frozen) this.hot.push({ id: 'h' + i, x: hp.x - 25, y: hp.y - 25, w: 50, h: 50 });
    }
    ctx.fillStyle = atO ? '#25A870' : '#E69B2D'; ctx.beginPath(); ctx.arc(k.x, k.y, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#10233F'; ctx.stroke();
    D.text(ctx, l.frozen ? '已定格：可读数、描点' : atO ? '已到 O；松手待稳定后定格' : '分别拖动测力计拉环，协调位置与拉力', k.x + 11, k.y - 8, { size: 11.5, weight: 700, color: atO ? '#17784F' : '#9A5A00' });
    if (this.stageId === 'two') this.drawMarks(ctx, g);
    if (f.meters.some(function (m) { return m.mag > 5; })) D.text(ctx, '⚠ 超过 5 N 量程，请减小拉力或调整夹角', g.px + g.pw / 2, g.py + g.ph - 12, { align: 'center', size: 12, weight: 700, color: '#C7374B' });
  };
  StudentBench.prototype.drawCal = function (ctx, g) {
    var st = this.st, c = { x: g.px + g.pw / 2, y: g.py + g.ph / 2 };
    D.text(ctx, '分别调零后，左右拖动拉环对拉；两表应示数相同', c.x, g.py + 30, { align: 'center', size: 13, weight: 700 });
    var span = 120 + st.calPullN * 18;
    meter(ctx, { x: c.x - 8, y: c.y }, { x: c.x - span, y: c.y }, '甲表', this._dragId === 'cal0', (st.calPullN + st.zeroErr1).toFixed(2) + ' N');
    meter(ctx, { x: c.x + 8, y: c.y }, { x: c.x + span, y: c.y }, '乙表', this._dragId === 'cal1', (st.calPullN + st.zeroErr2).toFixed(2) + ' N');
    this.hot.push({ id: 'cal0', x: c.x - span - 24, y: c.y - 24, w: 48, h: 48 }, { id: 'cal1', x: c.x + span - 24, y: c.y - 24, w: 48, h: 48 });
  };
  StudentBench.prototype.drawMarks = function (ctx, g) {
    var marks = this.st.marks;
    ['O', 'P1', 'P2'].forEach(function (id) {
      var m = marks[id]; if (!m) return; var p = { x: g.ax + m.x * g.ppm, y: g.ay + m.y * g.ppm };
      ctx.fillStyle = '#10233F'; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
      D.text(ctx, id === 'P1' ? 'P₁' : id === 'P2' ? 'P₂' : 'O', p.x + 7, p.y - 7, { size: 11, weight: 700 });
    });
    if (marks.O && marks.P1 && marks.P2) {
      var O = this.xy(g, marks.O); [marks.P1, marks.P2].forEach(function (m) { var p = { x: g.ax + m.x * g.ppm, y: g.ay + m.y * g.ppm }; ctx.strokeStyle = '#64748B'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(O.x, O.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]); });
    }
  };
  StudentBench.prototype.bindPointer = function () {
    var self = this, drag = null, start = null;
    ML.stage.pointer(this.stage.layer('fg').canvas, {
      down: function (p) {
        if (self.stageId === 'plot') { self.plotClick(p); return; }
        if (self.st.markTool) { self.markAt(p); return; }
        drag = null; start = p;
        (self.hot || []).slice().reverse().forEach(function (r) { if (!drag && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) drag = r.id; });
        self._dragId = drag; self.stage.invalidate('fg');
      },
      move: function (p, a) {
        if (a.pressed) { self.showMag(p); return; }
        if (!drag) return; var g = self.geo(self.stage.w, self.stage.h), st = self.st;
        if (drag.indexOf('cal') === 0) { st.calPullN = P.clamp(st.calPullN + (p.x - start.x) * (drag === 'cal0' ? -0.012 : 0.012), 0.5, 4.5); if (Math.abs(st.calPullN - 2) > 0.05) st.calPulled = true; start = p; self.stage.invalidate('fg'); self.updateStatus(); return; }
        var i = +drag.slice(1), l = self.live(), q = self.meters(g, p);
        if (self.stageId === 'two') q.x = i ? Math.max(l.knot.x + 0.025, q.x) : Math.min(l.knot.x - 0.025, q.x);
        q.x = P.clamp(q.x, -0.20, 0.20); q.y = P.clamp(Math.max(l.knot.y + 0.025, q.y), 0.08, 0.36);
        l.hands[i] = q; self.stage.invalidate('fg'); self.updateStatus();
      },
      press: function (p) { self.showMag(p); },
      up: function () { drag = null; self._dragId = null; self.mag.hide(); self.stage.invalidate('fg'); }
    });
  };
  StudentBench.prototype.showMag = function (p) {
    var f = this.stageId === 'two' || this.stageId === 'single' ? FF.pullForces(this.live().knot, this.live().hands) : null;
    var lbl = f ? f.meters.map(function (m, i) { return (i ? 'F₂ ' : 'F₁ ') + m.mag.toFixed(2) + ' N'; }).join(' | ') : '3× 放大';
    this.mag.show([this.stage.layer('bg').canvas, this.stage.layer('fg').canvas], p.x, p.y, this.stage.dpr, lbl);
  };
  StudentBench.prototype.updateStatus = function () {
    if (!this.statusEl) return;
    if (this.stageId === 'cal') { this.statusEl.textContent = '甲表调零：' + (this.st.zeroSet[0] ? '✓' : '未完成') + '；乙表调零：' + (this.st.zeroSet[1] ? '✓' : '未完成') + '。对拉中两表真实拉力相同。'; return; }
    if (this.stageId === 'plot') { this.statusEl.textContent = this.st.plotRecorded ? '本组作图已记录。可改变拉力与夹角，再完成一组。' : '请选统一标度，依次画力线段、平行辅助线、对角线 F 和实际 F′。'; return; }
    var l = this.live(); if (!l) return;
    var dx = (l.knot.x - this.st.target.x) * 100, dy = (l.knot.y - this.st.target.y) * 100, speed = Math.hypot(l.vel.x, l.vel.y);
    this.statusEl.textContent = l.frozen ? '已定格。请从表盘读数，再用铅笔描点；继续调整会清除本次读数和描点。' : '结点相对 O：水平 ' + dx.toFixed(2) + ' cm，竖直 ' + dy.toFixed(2) + ' cm；速度 ' + speed.toFixed(3) + ' m/s。力的大小请看表盘，不显示参考答案。';
  };
  StudentBench.prototype.freezeLive = function (force) {
    var l = this.live(); if (!l || l.frozen) return false;
    if (this.guided() && !force) {
      if (dist(l.knot, this.st.target) > TOL_O) { this.block('结点还没到 O 点。请同时调整两只测力计，不要只改一个方向。'); return false; }
      if (Math.hypot(l.vel.x, l.vel.y) > 0.015) { this.block('结点仍在运动，请保持双手不动，等结点稳定后再定格。'); return false; }
    }
    l.frozen = true; l.vel = { x: 0, y: 0 }; l.snap = cp(l); this.loop.stop(); this.stage.invalidate('fg'); this.renderStageActs(); this.renderSide();
    ML.toast('已保持当前位置。现在请读表盘并描点。', 'ok'); return true;
  };
  StudentBench.prototype.unfreeze = function () {
    var l = this.live(), st = this.st; l.frozen = false; l.snap = null;
    st.markTool = null;
    if (this.stageId === 'two') {
      st.twoRead = [null, null]; st.marks = {}; st.twoRecorded = false;
      st.singleRecorded = false; st.single = null; st.singleRead = null; st.singleDirRecorded = false;
      this.done.P2 = this.done.P4 = this.done.P5 = false;
    } else { st.singleRead = null; st.singleDirRecorded = false; st.singleRecorded = false; this.done.P5 = false; }
    this.done.P6 = false; this.resetPlot(st.plotScale || 1);
    this.renderStageActs(); this.renderSide(); this.loop.start();
  };
  StudentBench.prototype.openRead = function (idx) {
    var self = this, st = this.st, l = this.live();
    if (!l.frozen || !l.snap) { this.block('先保持测力计不动，等结点稳定后点击“定格并读数”。'); return; }
    var f = FF.pullForces(l.snap.knot, l.snap.hands), m = f.meters[idx];
    var base = m.mag / Math.max(0.2, Math.cos(st.liftDeg * Math.PI / 180)) + (st.liftDeg ? 0.10 : 0);
    var zero = this.stageId === 'two' ? (idx ? st.zeroErr2 : st.zeroErr1) : 0;
    var old = document.querySelector('.ml-dyn-modal'); if (old) old.remove();
    var inp = h('input.cal-inp', { type: 'text', placeholder: '估读到 0.01 N', 'aria-label': '输入测力计读数' });
    var fb = h('div.cal-fb', '最小分度 0.1 N，请正视表盘并估读到 0.01 N。');
    var modal;
    function close() { if (modal) modal.remove(); }
    function verify() {
      var res = ML.gauges.dynamometer.diagnose(inp.value, base, { zeroOffsetN: zero, tolN: 0.02 });
      fb.className = 'cal-fb ' + (res.ok ? 'ok' : 'bad'); fb.textContent = (res.ok ? '✓ ' : '✕ ') + res.msg;
      if (res.ok) {
        var val = ML.math.parseNum(inp.value);
        if (self.stageId === 'two') st.twoRead[idx] = val; else st.singleRead = val;
        self.renderStageActs(); self.renderSide();
      }
    }
    var children = [h('span', '我的读数 ='), inp, h('span', 'N'), h('button.btn.primary', { type: 'button', onclick: verify }, '核对读数')];
    if (this.mode === 'demo') children.push(h('button.btn', { type: 'button', onclick: function () { inp.value = (base + zero).toFixed(2); verify(); } }, '演示：填入参考值'));
    modal = h('div.ml-modal.ml-dyn-modal', { role: 'dialog', 'aria-modal': 'true', onclick: function (e) { if (e.target === modal) close(); } }, h('div.ml-modal-card',
      h('div.try-head', h('h2', this.stageId === 'two' ? (idx ? '读取乙表 F₂' : '读取甲表 F₁') : '读取单表 F′'), h('button.btn', { type: 'button', onclick: close }, '关闭')),
      h('div'), h('div.cal-read-row', children), fb));
    document.body.appendChild(modal);
    new ML.gaugesView.GaugeBench(modal.querySelector('.ml-modal-card > div:nth-child(2)'), { height: 264, state: { type: 'dynamometer', trueForceN: base, zeroOffsetN: zero, locked: true } });
  };
  StudentBench.prototype.markAt = function (p) {
    var st = this.st, l = this.live(), tool = st.markTool;
    if (!l || !l.frozen) { this.block('先定格，再描点。'); return; }
    var g = this.geo(this.stage.w, this.stage.h), q = this.meters(g, p), k = this.xy(g, l.knot);
    if (tool === 'O') {
      if (Math.hypot(p.x - k.x, p.y - k.y) > 13) { ML.toast('请把铅笔点在实际结点处。', 'warn'); return; }
      st.marks.O = cp(l.knot);
    } else {
      var i = tool === 'P1' ? 0 : 1, hp = this.xy(g, l.hands[i]), vx = hp.x - k.x, vy = hp.y - k.y, len = Math.hypot(vx, vy);
      var along = ((p.x - k.x) * vx + (p.y - k.y) * vy) / len;
      var cross = Math.abs((p.x - k.x) * vy - (p.y - k.y) * vx) / len;
      if (along < 38 || along > len - 12 || cross > 10) { ML.toast('描点要落在对应细绳方向上，并离 O 适当远。', 'warn'); return; }
      st.marks[tool] = q;
    }
    st.markTool = null; this.stage.invalidate('fg'); this.renderStageActs(); this.renderSide();
  };
  StudentBench.prototype.selectMark = function (tool) { this.st.markTool = tool; this.renderStageActs(); ML.toast('铅笔已选中：请在白纸上描下 ' + tool + '。', 'info'); };
  StudentBench.prototype.measuredAngles = function () {
    var st = this.st, O = st.marks.O;
    function ang(Pt, left) { return Math.atan2((left ? -1 : 1) * (Pt.x - O.x), Pt.y - O.y) * 180 / Math.PI; }
    return [ang(st.marks.P1, true), ang(st.marks.P2, false)];
  };
  StudentBench.prototype.saveTwo = function () {
    var st = this.st, l = st.two;
    if (this.guided()) {
      if (!st.paperFixed || !st.parallelChecked || !l.frozen || dist(l.knot, st.target) > TOL_O) { this.block('请固定白纸、检查与纸面平行，并实际稳定到 O 点。'); return; }
      if (st.twoRead[0] == null || st.twoRead[1] == null) { this.block('两只测力计都要分别读数，不能只读一只。'); return; }
      if (!st.marks.O || !st.marks.P1 || !st.marks.P2) { this.block('请亲手描下 O、P₁、P₂ 三个点。'); return; }
    }
    if (st.twoRead.some(function (v) { return v == null; }) || !st.marks.O || !st.marks.P1 || !st.marks.P2 || !l.snap) {
      this.block('请先定格、读出两表读数并描下方向点。'); return;
    }
    st.twoRecorded = true; this.done.P2 = true; this.done.P3 = st.liftDeg === 0; this.done.P4 = true;
    this.setStage('single', true); ML.toast('双拉记录已保存。换用一只测力计，把结点拉回同一个 O。', 'ok');
  };
  StudentBench.prototype.saveSingle = function () {
    var st = this.st, l = st.single;
    if (this.guided() && (!l.frozen || dist(l.knot, st.target) > TOL_O)) { this.block('单表也必须把结点实际拉回同一个 O 点。'); return; }
    if (this.guided() && (st.singleRead == null || !st.singleDirRecorded)) { this.block('请读出 F′，并沿 AO 记录单拉方向。'); return; }
    if (!st.twoRecorded || !l.snap || st.singleRead == null || !st.singleDirRecorded) {
      this.block('先保存双表数据，再定格单表、读数并记录方向。'); return;
    }
    st.singleRecorded = true; this.done.P5 = dist(l.knot, st.target) <= TOL_O;
    this.setStage('plot', true); ML.toast('进入学生作图：选标度，画两条力线段，再作平行线和对角线。', 'ok');
  };
  StudentBench.prototype.nudge = function (idx, kind, amount) {
    var l = this.live(); if (!l || l.frozen) return;
    var hand = l.hands[idx], k = l.knot, dx = hand.x - k.x, dy = hand.y - k.y, d = Math.hypot(dx, dy) || 1;
    if (kind === 'force') { d = Math.max(0.05, d + amount / FF.METER_K); hand.x = k.x + dx / (Math.hypot(dx, dy) || 1) * d; hand.y = k.y + dy / (Math.hypot(dx, dy) || 1) * d; }
    else { var a = Math.atan2(dy, dx) + amount * Math.PI / 180; hand.x = k.x + Math.cos(a) * d; hand.y = k.y + Math.sin(a) * d; }
    this.stage.invalidate('fg'); this.updateStatus();
  };
  StudentBench.prototype.renderStageActs = function () {
    var self = this, st = this.st, box = this.stageActs; ML.clear(box);
    function btn(text, fn, cls, dis) { var b = h('button.btn.sm' + (cls || ''), { type: 'button', onclick: fn, disabled: !!dis }, text); box.appendChild(b); return b; }
    if (this.stageId === 'cal') {
      btn('甲表调零', function () { st.zeroSet[0] = true; st.zeroErr1 = 0; self.stage.invalidate('fg'); self.renderSide(); });
      btn('乙表调零', function () { st.zeroSet[1] = true; st.zeroErr2 = 0; self.stage.invalidate('fg'); self.renderSide(); });
      btn('核对对拉，进入双表', function () {
        if (self.guided() && (!st.zeroSet[0] || !st.zeroSet[1])) { self.block('两只表都要分别调零。'); return; }
        if (self.guided() && !st.calPulled) { self.block('请拖动拉环改变对拉力度，比较两表读数。'); return; }
        st.calDone = true; self.done.P1 = true; self.setStage('two', true);
      }, '.primary');
      if (this.mode !== 'guided') btn('注入甲表 +0.30 N 零误差', function () { st.zeroErr1 = 0.30; st.zeroSet[0] = false; self.stage.invalidate('fg'); });
      return;
    }
    if (this.stageId === 'two' || this.stageId === 'single') {
      var l = this.live();
      if (!l.frozen) btn('定格并读数', function () { self.freezeLive(false); }, '.primary');
      else btn('继续调整（清除记录）', function () { self.unfreeze(); });
      if (this.stageId === 'two') {
        btn(st.twoRead[0] == null ? '读 F₁ 表盘' : '✓ F₁ 已读', function () { self.openRead(0); }, '', !l.frozen);
        btn(st.twoRead[1] == null ? '读 F₂ 表盘' : '✓ F₂ 已读', function () { self.openRead(1); }, '', !l.frozen);
        ['O', 'P1', 'P2'].forEach(function (id) { btn((st.marks[id] ? '✓ ' : '铅笔 ') + id, function () { self.selectMark(id); }, st.markTool === id ? '.cyan' : '', !l.frozen); });
        btn('保存双拉，进入单表', function () { self.saveTwo(); }, '.cyan');
        if (this.mode === 'demo') btn('演示标准双拉并补齐记录', function () { self.demoTwo(); });
      } else {
        btn(st.singleRead == null ? '读 F′ 表盘' : '✓ F′ 已读', function () { self.openRead(0); }, '', !l.frozen);
        btn(st.singleDirRecorded ? '✓ 已记录 AO 方向' : '记录单拉方向（沿 AO）', function () { if (!l.frozen) { self.block('先定格再记录方向。'); return; } st.singleDirRecorded = true; self.renderStageActs(); self.renderSide(); });
        btn('保存单拉，进入作图', function () { self.saveSingle(); }, '.cyan');
        if (this.mode === 'demo') btn('演示单拉并读数', function () { self.demoSingle(); });
      }
    } else if (this.stageId === 'plot') {
      [['F1', '画 F₁'], ['F2', '画 F₂'], ['para1', '过 F₁ 端点作平行线'], ['para2', '过 F₂ 端点作平行线'], ['diag', '连接对角线 F'], ['actual', '画实际 F′']].forEach(function (it) {
        btn((st.plot[it[0]] ? '✓ ' : '') + it[1], function () { st.plotTool = it[0]; self.renderStageActs(); }, st.plotTool === it[0] ? '.cyan' : '', st.plotRecorded);
      });
      btn('完成作图检验', function () { self.recordTrial(); }, '.primary', st.plotRecorded);
      if (this.mode === 'demo') btn('演示自动完成作图', function () { self.demoPlot(); }, '', st.plotRecorded);
    }
  };
  StudentBench.prototype.renderSide = function () {
    var self = this, st = this.st, side = this.side; ML.clear(side);
    function row(label, nodes) { return h('div.side-row', h('span.side-l', label), nodes); }
    function chip(text, fn) { return h('button.chip', { type: 'button', onclick: fn }, text); }
    var ctl = h('div.side-ctl'); this.statusEl = h('div.m06-readout');
    if (this.stageId === 'cal') {
      ctl.appendChild(h('div.side-k', '① 调零与对拉校准'));
      ctl.appendChild(h('div.side-tip', '拖动拉环改变对拉力度。两表挂钩互勾时真实拉力相等；若读数恒差一个值，应重新调零。'));
    } else if (this.stageId === 'two') {
      ctl.appendChild(h('div.side-k', '② 双手协调拉拽'));
      ctl.appendChild(h('div.side-tip', '拖动两只测力计的拉环：绕结点移动改变方向，向外拉远增加弹簧伸长与拉力。两手相互影响，必须协调调整。'));
      ctl.appendChild(row('白纸与橡皮条', chip(st.paperFixed ? '✓ 已固定' : '固定白纸和 A 点', function () { st.paperFixed = true; self.renderSide(); })));
      ctl.appendChild(row('操作检查', chip(st.parallelChecked ? '✓ 与纸面平行' : '检查测力计与纸面平行', function () { st.parallelChecked = true; st.liftDeg = 0; self.done.P3 = true; self.renderSide(); })));
      [0, 1].forEach(function (i) {
        ctl.appendChild(row(i ? '乙表微调' : '甲表微调', [chip('转 −2°', function () { self.nudge(i, 'angle', -2); }), chip('转 +2°', function () { self.nudge(i, 'angle', 2); }), chip('拉力 −0.05 N', function () { self.nudge(i, 'force', -0.05); }), chip('拉力 +0.05 N', function () { self.nudge(i, 'force', 0.05); })]));
      });
      if (!this.guided()) ctl.appendChild(row('误差设置', [chip(st.liftDeg ? '恢复水平' : '抬起 22°', function () { st.liftDeg = st.liftDeg ? 0 : 22; st.parallelChecked = false; self.renderSide(); }), chip(st.markDist < 0.05 ? '长绳 12 cm' : '短绳 2.5 cm', function () { st.markDist = st.markDist < 0.05 ? 0.12 : 0.025; self.renderSide(); })]));
    } else if (this.stageId === 'single') {
      ctl.appendChild(h('div.side-k', '③ 单表等效替代'));
      ctl.appendChild(h('div.side-tip', '双拉的读数和方向点已经保存。现在只保留一只测力计，仍须把结点拉回同一个 O，作用效果才相同。'));
      ctl.appendChild(row('单表微调', [chip('转 −2°', function () { self.nudge(0, 'angle', -2); }), chip('转 +2°', function () { self.nudge(0, 'angle', 2); }), chip('拉力 −0.05 N', function () { self.nudge(0, 'force', -0.05); }), chip('拉力 +0.05 N', function () { self.nudge(0, 'force', 0.05); })]));
    } else if (this.stageId === 'plot') {
      ctl.appendChild(h('div.side-k', '④ 选标度并亲手作图'));
      ctl.appendChild(h('div.side-tip', '先选统一标度。点击“画 F₁”后在白纸上点箭头终点；再画 F₂。随后分别从两个端点作平行线，交出顶点，最后连接对角线并画 F′。'));
      ctl.appendChild(row('统一标度', [0.5, 1, 2].map(function (v) { var b = chip('1 cm = ' + v.toFixed(1) + ' N', function () { self.resetPlot(v); }); if ((st.plotScale || 1) === v) b.classList.add('on'); return b; })));
      if (st.twoRead[0] != null) ctl.appendChild(h('div.m06-readout', '实验记录：F₁＝' + st.twoRead[0].toFixed(2) + ' N，F₂＝' + st.twoRead[1].toFixed(2) + ' N；F′＝' + (st.singleRead == null ? '未读' : st.singleRead.toFixed(2) + ' N') + '。请按标度自行计算线段长度。'));
    }
    ctl.appendChild(this.statusEl); side.appendChild(ctl);
    side.appendChild(h('div.side-acts', h('button.btn', { type: 'button', onclick: function () { self.resetExperiment(false); } }, '重置本组'), h('button.btn', { type: 'button', onclick: function () { self.newTrial(); } }, '换新一组')));
    if (this.guided()) {
      var ol = h('ol.steps', C.procedure.map(function (p) { var ok = !!self.done[p.id]; return h('li' + (ok ? '.ok' : ''), h('div.st-t', (ok ? '✓ ' : '○ ') + p.title), h('div.st-how', p.how)); }));
      side.appendChild(h('div.side-k', '实验步骤（实际操作后打勾）')); side.appendChild(ol);
    } else side.appendChild(h('div.side-tip', this.mode === 'demo' ? '教师演示可使用自动按钮；切回学生实验会清空当前演示记录。' : '自由探究不会限制错误操作，可观察未调零、抬起、结点偏移等后果。'));
    this.updateStatus();
  };
  StudentBench.prototype.demoTwo = function (angles) {
    var st = this.st, a = angles || [35, 45], l = st.two;
    l.knot = cp(st.target); l.vel = { x: 0, y: 0 }; l.hands = FF.equilibriumHands(st.target, a[0], a[1]); l.frozen = false;
    st.paperFixed = true; st.parallelChecked = true; this.freezeLive(true);
    var f = FF.pullForces(l.knot, l.hands);
    st.twoRead = f.meters.map(function (m, i) { return +(m.mag / Math.cos(st.liftDeg * Math.PI / 180) + (st.liftDeg ? 0.10 : 0) + (i ? st.zeroErr2 : st.zeroErr1)).toFixed(2); });
    st.marks.O = cp(l.knot);
    st.marks.P1 = { x: l.knot.x + (l.hands[0].x - l.knot.x) * 0.55, y: l.knot.y + (l.hands[0].y - l.knot.y) * 0.55 };
    st.marks.P2 = { x: l.knot.x + (l.hands[1].x - l.knot.x) * 0.55, y: l.knot.y + (l.hands[1].y - l.knot.y) * 0.55 };
    this.stage.invalidate('fg'); this.renderStageActs(); this.renderSide();
  };
  StudentBench.prototype.demoSingle = function () {
    var st = this.st, l = st.single; l.knot = cp(st.target); l.vel = { x: 0, y: 0 };
    var band = FF.rubberBandForce(l.knot.x, l.knot.y), d = FF.METER_REST + band.mag / FF.METER_K;
    l.hands = [{ x: l.knot.x, y: l.knot.y + d }]; l.frozen = false; this.freezeLive(true); st.singleRead = band.mag; st.singleDirRecorded = true;
    this.stage.invalidate('fg'); this.renderStageActs(); this.renderSide();
  };
  StudentBench.prototype.resetPlot = function (scale) {
    if (this.stageId === 'plot' && this.st.plotRecorded) return;
    this.st.plotScale = scale; this.st.plot = { F1: null, F2: null, para1: null, para2: null, diag: null, actual: null }; this.st.plotTool = null; this.st.plotRecorded = false;
    if (this.stageId === 'plot') { this.stage.invalidate(); this.renderStageActs(); this.renderSide(); }
  };
  StudentBench.prototype.plotOrigin = function () { return { x: 0, y: 0.085 }; };
  StudentBench.prototype.hasPlotData = function () {
    var st = this.st;
    return !!(st.twoRecorded && st.singleRecorded && st.marks.O && st.marks.P1 && st.marks.P2 &&
      st.twoRead[0] != null && st.twoRead[1] != null && st.singleRead != null && st.single && st.single.snap);
  };
  StudentBench.prototype.plotMetersPerNewton = function () { return 0.01 / (this.st.plotScale || 1); };
  StudentBench.prototype.vectorData = function () {
    var st = this.st, angles = this.measuredAngles(), singleF = FF.pullForces(st.single.snap.knot, st.single.snap.hands).meters[0];
    var actualAngle = Math.atan2(singleF.ux, singleF.uy);
    return { angles: angles, F1: { x: -st.twoRead[0] * Math.sin(angles[0] * Math.PI / 180), y: st.twoRead[0] * Math.cos(angles[0] * Math.PI / 180) },
      F2: { x: st.twoRead[1] * Math.sin(angles[1] * Math.PI / 180), y: st.twoRead[1] * Math.cos(angles[1] * Math.PI / 180) },
      actual: { x: st.singleRead * Math.sin(actualAngle), y: st.singleRead * Math.cos(actualAngle) } };
  };
  StudentBench.prototype.plotExpected = function (tool) {
    var v = this.vectorData(), o = this.plotOrigin(), sc = this.plotMetersPerNewton();
    function add(a, b, k) { return { x: a.x + b.x * k, y: a.y + b.y * k }; }
    if (tool === 'F1' || tool === 'F2' || tool === 'actual') return add(o, v[tool], sc);
    var d = add(o, { x: v.F1.x + v.F2.x, y: v.F1.y + v.F2.y }, sc); return d;
  };
  StudentBench.prototype.plotClick = function (p) {
    var st = this.st, tool = st.plotTool;
    if (st.plotRecorded || !this.hasPlotData()) return;
    if (!tool) { ML.toast('先选择要画的力线段或平行线。', 'info'); return; }
    if (['para1', 'para2', 'diag', 'actual'].indexOf(tool) >= 0 && (!st.plot.F1 || !st.plot.F2)) { ML.toast('先按同一标度画好 F₁、F₂。', 'warn'); return; }
    if ((tool === 'diag' || tool === 'actual') && (!st.plot.para1 || !st.plot.para2)) { ML.toast('先作出两条平行辅助线，确定交点。', 'warn'); return; }
    var g = this.geo(this.stage.w, this.stage.h), q = this.meters(g, p), o = this.plotOrigin();
    var expected = this.plotExpected(tool), plot = st.plot, start = o;
    if (tool === 'para1' || tool === 'para2') {
      start = tool === 'para1' ? plot.F1 : plot.F2;
      expected = { x: plot.F1.x + plot.F2.x - o.x, y: plot.F1.y + plot.F2.y - o.y };
    }
    if (tool === 'diag') {
      var u = { x: plot.para1.x - plot.F1.x, y: plot.para1.y - plot.F1.y };
      var v = { x: plot.para2.x - plot.F2.x, y: plot.para2.y - plot.F2.y };
      var cross = u.x * v.y - u.y * v.x;
      if (Math.abs(cross) < 1e-7) { ML.toast('两条辅助线没有明确交点，请重画。', 'warn'); return; }
      var t = ((plot.F2.x - plot.F1.x) * v.y - (plot.F2.y - plot.F1.y) * v.x) / cross;
      expected = { x: plot.F1.x + t * u.x, y: plot.F1.y + t * u.y };
    }
    var tol = P.clamp(dist(start, expected) * g.ppm * 0.16, 3, 10);
    if (dist(q, expected) * g.ppm > tol || dist(q, start) * g.ppm < 2) {
      ML.toast('长度、方向或交点不合适。请按读数、方向点和所选标度检查。', 'warn'); return;
    }
    if (tool === 'F1' || tool === 'F2') plot.para1 = plot.para2 = plot.diag = null;
    if (tool === 'para1' || tool === 'para2') plot.diag = null;
    st.plot[tool] = q; st.plotTool = null; this.stage.invalidate('fg'); this.renderStageActs(); this.renderSide();
  };
  StudentBench.prototype.drawPlot = function (ctx, g) {
    var st = this.st, o = this.xy(g, this.plotOrigin()), p = st.plot;
    ctx.fillStyle = '#10233F'; ctx.beginPath(); ctx.arc(o.x, o.y, 4, 0, Math.PI * 2); ctx.fill(); D.text(ctx, 'O', o.x - 10, o.y + 4, { align: 'right', size: 12, weight: 700 });
    D.text(ctx, '标度：1 cm = ' + (st.plotScale || 1).toFixed(1) + ' N', g.px + g.pw - 14, g.py + 38, { align: 'right', size: 12, weight: 700, color: '#1661FF' });
    var self = this;
    if (this.hasPlotData()) {
      var dirs = this.vectorData(), origin = this.plotOrigin();
      ctx.strokeStyle = '#A5B4C7'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ['F1', 'F2', 'actual'].forEach(function (id) {
        var v = dirs[id], mag = Math.hypot(v.x, v.y);
        if (mag < 1e-6) return;
        var end = self.xy(g, { x: origin.x + 0.13 * v.x / mag, y: origin.y + 0.13 * v.y / mag });
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      });
      ctx.setLineDash([]);
    }
    ['F1', 'F2', 'actual'].forEach(function (id) { if (!p[id]) return; var e = self.xy(g, p[id]); arrow(ctx, o, e, id === 'F1' ? '#12A9C4' : id === 'F2' ? '#E07B24' : '#25A870', 2.4); D.text(ctx, id === 'actual' ? 'F′' : id, e.x + 7, e.y + 8, { size: 12, weight: 700 }); });
    if (p.para1 && p.F1) { var a = this.xy(g, p.F1), b = this.xy(g, p.para1); ctx.strokeStyle = '#64748B'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); }
    if (p.para2 && p.F2) { var a2 = this.xy(g, p.F2), b2 = this.xy(g, p.para2); ctx.strokeStyle = '#64748B'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke(); ctx.setLineDash([]); }
    if (p.diag) arrow(ctx, o, this.xy(g, p.diag), '#1661FF', 2.6);
    if (!p.F1) D.text(ctx, '学生作图：选择下方工具，再点击白纸上的线段终点', o.x, o.y + 32, { align: 'center', size: 12, weight: 700, color: '#4A5B73' });
  };
  StudentBench.prototype.demoPlot = function () {
    if (!this.hasPlotData() || this.st.plotRecorded) return;
    var self = this; ['F1', 'F2', 'para1', 'para2', 'diag', 'actual'].forEach(function (id) { self.st.plot[id] = self.plotExpected(id); });
    this.stage.invalidate('fg'); this.renderStageActs(); this.renderSide();
  };
  StudentBench.prototype.computeResult = function () {
    var st = this.st, p = st.plot;
    if (!p || !p.diag || !p.actual) return null;
    var o = this.plotOrigin(), sc = this.plotMetersPerNewton();
    function vec(q) { var x = (q.x - o.x) / sc, y = (q.y - o.y) / sc; return { fx: x, fy: y, mag: Math.hypot(x, y), angleDeg: Math.atan2(x, y) * 180 / Math.PI }; }
    var th = vec(p.diag), act = vec(p.actual), angles = this.measuredAngles();
    var dot = (th.fx * act.fx + th.fy * act.fy) / Math.max(1e-9, th.mag * act.mag);
    var res = { F_theory: th, F_actual: act, F1Read: st.twoRead[0], F2Read: st.twoRead[1], theta1Deg: angles[0], theta2Deg: angles[1], alphaDeg: angles[0] + angles[1],
      relMagErr: Math.abs(th.mag - act.mag) / Math.max(1e-9, act.mag), angleDiffDeg: Math.acos(P.clamp(dot, -1, 1)) * 180 / Math.PI,
      overRange: FF.pullForces(st.two.snap.knot, st.two.snap.hands).meters.some(function (m) { return m.mag > 5; }) };
    st.lastResult = res; return res;
  };
  StudentBench.prototype.recordTrial = function () {
    var st = this.st, p = st.plot;
    if (st.plotRecorded || !this.hasPlotData()) return;
    if (this.guided() && (!p.F1 || !p.F2 || !p.para1 || !p.para2 || !p.diag || !p.actual)) { this.block('请完成两条力线段、两条平行辅助线、对角线 F 和实际 F′，再提交。'); return; }
    var r = this.computeResult(); if (!r) return;
    var tags = []; if (dist(st.single.snap.knot, st.target) > TOL_O) tags.push('E1'); if (st.zeroErr1 || st.zeroErr2) tags.push('E2'); if (st.liftDeg) tags.push('E3'); if (st.markDist < 0.05) tags.push('E4'); if (r.overRange || r.alphaDeg < 25 || r.alphaDeg > 140) tags.push('E5');
    this.trials.push({ idx: this.trials.length + 1, theta1: r.theta1Deg, theta2: r.theta2Deg, alpha: r.alphaDeg, F1: r.F1Read, F2: r.F2Read, F_th: r.F_theory.mag, F_act: r.F_actual.mag, relErrPct: r.relMagErr * 100, angDiff: r.angleDiffDeg, overRange: r.overRange, tags: tags });
    st.plotRecorded = true; this.done.P6 = true; if (this.trials.length >= 2) this.done.P7 = true;
    this.renderAnalysis(true); this.renderStageActs(); this.renderSide(); ML.toast('已根据你画的线段计算偏差，并记录本组。', 'ok');
  };
  StudentBench.prototype.renderAnalysis = function (scroll) {
    var el = this.analysis, self = this; el.hidden = false; ML.clear(el);
    el.appendChild(h('div.ana-head', h('h2.ana-h', '学生读数与作图检验记录'), h('button.btn.sm', { type: 'button', onclick: function () { el.hidden = true; } }, '收起')));
    el.appendChild(h('div.tbl-wrap', h('table.dt.ana-tbl', h('tr', ['组', 'θ₁/θ₂', 'F₁/N', 'F₂/N', '作图 F/N', '单拉 F′/N', '大小误差', '方向差'].map(function (x) { return h('th', x); })), this.trials.map(function (r) {
      return h('tr', [r.idx, r.theta1.toFixed(1) + '°/' + r.theta2.toFixed(1) + '°', r.F1.toFixed(2), r.F2.toFixed(2), r.F_th.toFixed(2), r.F_act.toFixed(2), r.relErrPct.toFixed(1) + '%', r.angDiff.toFixed(1) + '°'].map(function (x) { return h('td', String(x)); }));
    }))));
    var last = this.trials[this.trials.length - 1];
    el.appendChild(h('div.cmp-note', last.relErrPct < 4 && last.angDiff < 3 ? '✓ 你作出的对角线 F 与单拉 F′ 在误差允许范围内基本重合。' : '⚠ 两条合力偏差较大，请检查读数、描点、标度、平行线和单拉是否回到同一 O。'));
    el.appendChild(h('button.btn.primary', { type: 'button', onclick: function () { self.newTrial(); } }, '改变拉力与夹角，再做一组'));
    if (scroll) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  StudentBench.prototype.newTrial = function () {
    var calibrated = this.st.calDone && this.st.zeroSet.every(Boolean);
    this.resetExperiment(true); this.setBanner(null);
    if (!calibrated) { this.setStage('cal', true); return; }
    this.st.calDone = true; this.st.zeroSet = [true, true]; this.done.P1 = true; this.setStage('two', true);
    ML.toast('新一组：可改变两分力和夹角；同一组的双拉与单拉仍须回到同一个 O。', 'info');
  };
  StudentBench.prototype.applyReplay = function (errId, err) {
    this.setMode('free', true); this.resetExperiment(true); this.setStage('cal', true); var st = this.st;
    if (errId === 'E2') { st.zeroErr1 = st.zeroErr2 = 0.30; this.stage.invalidate('fg'); this.renderSide(); }
    else {
      st.calDone = true; this.setStage('two', true);
      if (errId === 'E3') st.liftDeg = 22;
      if (errId === 'E4') st.markDist = 0.025;
      this.demoTwo(errId === 'E5' ? [72.5, 72.5] : errId === 'E6' ? [30, 50] : [35, 45]); this.saveTwo();
      this.demoSingle();
      if (errId === 'E1') {
        var l = st.single; l.frozen = false; l.snap = null;
        l.knot = { x: 0.008, y: FF.Y_O + 0.014 }; l.vel = { x: 0, y: 0 };
        l.hands = [{ x: 0.008, y: l.knot.y + FF.METER_REST + FF.rubberBandForce(l.knot.x, l.knot.y).mag / FF.METER_K }];
        this.freezeLive(true); st.singleRead = FF.rubberBandForce(l.knot.x, l.knot.y).mag;
      }
      this.saveSingle(); this.demoPlot();
    }
    this.setBanner('<b>复现：' + err.name + '</b>　已布置自由探究状态，可继续调整并观察后果。');
  };
  ML.M06StudentBench = StudentBench;
})(typeof window !== 'undefined' ? (window.ML = window.ML || {}) : (globalThis.ML = globalThis.ML || {}));
