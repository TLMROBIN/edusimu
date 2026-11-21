/* M07 scene — 验证机械能守恒定律：竖直落体台、气轨光电门、纸带能量分析、诊断适配器、讲解小部件 */
(function (ML) {
  'use strict';
  var h = ML.h, M = ML.math, P = ML.phys, T = ML.tape, D = ML.stage.draw, TV = ML.tapeView;
  var C = ML.json('ml-content'), Q = ML.json('ml-questions') || [];
  var S = ML.store.init(C.slug, { v: 1, tab: 'learn', learnPage: 0, mode: 'guided', ideal: false, bench: { timer: null, power: null, bob: 'iron', near: true }, answers: {}, done: {} });
  var ERR = {}; C.errors.forEach(function (e) { ERR[e.id] = e; });
  var PROC = {}; C.procedure.forEach(function (p) { PROC[p.id] = p; });
  var TIMER_NAME = { em: '电磁打点计时器', spark: '电火花计时器' };
  var POWER_NAME = { ac8: '交流 8 V', ac220: '交流 220 V', dc8: '直流 8 V' };
  var BOB_INFO = {
    iron: { name: '重铁锤', massKg: 0.300, massG: 300, c1: '#7E8A98', c2: '#556272', w: 0.036, hh: 0.056 },
    al: { name: '铝锤', massKg: 0.100, massG: 100, c1: '#E2E8F0', c2: '#AEBAC7', w: 0.038, hh: 0.058 },
    wood: { name: '木块', massKg: 0.040, massG: 40, c1: '#E2C294', c2: '#B8905A', w: 0.056, hh: 0.068 }
  };
  var seedCounter = 17;

  function sig4(x) { if (!isFinite(x) || x === 0) return x; var e = Math.floor(Math.log10(Math.abs(x))) - 3; return Math.round(x / Math.pow(10, e)) * Math.pow(10, e); }
  function mmStr(x) { return (x * 1000).toFixed(2); }
  function cmStr(x) { return (x * 100).toFixed(2); }
  function sub(n) { return String(n).replace(/\d/g, function (d) { return '₀₁₂₃₄₅₆₇₈₉'[d]; }); }

  /* 公共物理计算：给定自由落体 run，提取起落首点间距与各计数点能量对比 */
  function firstMotionIndex(run) {
    if (!run || !run.dots || run.dots.length < 3) return 0;
    return T.firstClearDot(run.dots, 1e-3);
  }
  function computeEnergy(run, opts) {
    opts = opts || {};
    var dots = run.dots || [], times = run.times || [], T0 = run.T0 || 0.02;
    var gLoc = P.G;
    var st = opts.startIdx != null ? opts.startIdx : firstMotionIndex(run);
    var endIdx = st;
    for (var i = st + 1; i < dots.length; i++) {
      if (times[i] <= run.tArrive + 1e-6 && dots[i] <= run.L - 0.022) endIdx = i;
      else break;
    }
    var countN = Math.min(24, endIdx - st);
    if (countN < 3) return { valid: false, rows: [], aTape: NaN, kHalf: NaN, kV2: NaN, d12: 0 };
    var slice = dots.slice(st, st + countN + 1);
    var meas = T.measure(slice, { start: 0, every: 1, n: countN, method: 'origin', ideal: !!opts.ideal, seed: opts.seed || 7 });
    if (opts.readings) {
      opts.readings.heights.forEach(function (h, i) { meas.pos[opts.readings.first + i] = h; });
      meas.segs = meas.pos.slice(1).map(function (h, i) { return h - meas.pos[i]; });
    }
    var pos = meas.pos;
    var midTs = [], midVs = [];
    for (i = 1; i < pos.length - 1; i++) {
      midTs.push(i * T0);
      midVs.push((pos[i + 1] - pos[i - 1]) / (2 * T0));
    }
    var vFit = P.linfit(midTs, midVs);
    var aTape = isFinite(vFit.k) ? vFit.k : run.a;
    var refRel = opts.nonzero ? Math.min(2, pos.length - 4) : 0;
    var vRef = refRel >= 1 ? (pos[refRel + 1] - pos[refRel - 1]) / (2 * T0) : 0;
    var speedMethod = opts.speedMethod || 'mid';
    var gUsed = opts.useTapeA ? aTape : gLoc;
    var rows = [], hs = [], halfV2s = [], v2s = [];
    for (i = refRel + 1; i < pos.length - 1; i++) {
      var hVal = pos[i] - pos[refRel];
      var vMid = (pos[i + 1] - pos[i - 1]) / (2 * T0);
      var dtFromRef = (i - refRel) * T0;
      var vUsed = speedMethod === 'sqrt2gh' ? Math.sqrt(Math.max(0, (opts.nonzero ? vRef * vRef : 0) + 2 * gLoc * hVal))
        : speedMethod === 'gt' ? (vRef + gLoc * dtFromRef) : vMid;
      var ep = gUsed * hVal;
      var ek = 0.5 * (vUsed * vUsed - (opts.nonzero ? vRef * vRef : 0));
      var eta = ep > 1e-7 ? Math.abs(ep - ek) / ep : 0;
      rows.push({ idx: st + i, n: i, h: hVal, v: vUsed, vMid: vMid, ep: ep, ek: ek, eta: eta, halfV2: ek, v2: 2 * ek });
      hs.push(hVal); halfV2s.push(ek); v2s.push(2 * ek);
    }
    var fitHalf = P.linfit(hs, halfV2s), fitV2 = P.linfit(hs, v2s);
    var d12 = opts.readings ? opts.readings.d12 : (st + 1 < dots.length ? dots[st + 1] - dots[st] : 0);
    return { valid: rows.length >= 2, st: st, meas: meas, rows: rows, aTape: aTape, gUsed: gUsed,
      fitHalf: fitHalf, fitV2: fitV2, d12: d12, refIdx: st + refRel, vRef: vRef };
  }

  /* 倾斜气垫导轨光电门解析模型 */
  function runAirGate(sinTheta, d, L, ideal) {
    var g = P.G, cosTheta = Math.sqrt(Math.max(0, 1 - sinTheta * sinTheta));
    var muAir = ideal ? 0 : 0.0015;
    var a = g * sinTheta - muAir * g * cosTheta;
    var s1 = 0.16, s2 = s1 + L;
    function tAt(s) { return Math.sqrt(2 * s / a); }
    var dt1 = sig4(tAt(s1 + d) - tAt(s1)), dt2 = sig4(tAt(s2 + d) - tAt(s2));
    var v1 = d / dt1, v2 = d / dt2, dh = L * sinTheta;
    var gh = g * dh, halfDv2 = 0.5 * (v2 * v2 - v1 * v1);
    return {
      sinTheta: sinTheta, d: d, L: L, a: a, s1: s1, s2: s2, dh: dh,
      t1: tAt(s1), t2: tAt(s2), dt1: dt1, dt2: dt2, v1: v1, v2: v2,
      gh: gh, halfDv2: halfDv2, dv2: 2 * halfDv2,
      eta: gh > 1e-7 ? Math.abs(gh - halfDv2) / gh : 0
    };
  }

  /* =====================================================================
   *  ② 做·实验
   * ===================================================================== */
  var bench = null;
  function Bench(el) {
    var self = this; this.el = el;
    this.mode = S.mode || 'guided'; this.apparatus = 'timer'; this.speed = 0.25;
    this.sinTheta = 0.06; this.flag = 0.005; this.gateDist = 0.40;
    this.tapeSeq = 0; this.tapes = []; this.gateLogs = []; this.gateRes = null;
    // 顶栏
    this.modeChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'guided' }, onclick: function () { self.setMode('guided'); } }, '引导模式'),
      h('button.chip', { type: 'button', data: { v: 'free' }, onclick: function () { self.setMode('free'); } }, '自由模式'));
    this.appChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'timer' }, onclick: function () { self.setApparatus('timer'); } }, '竖直打点纸带'),
      h('button.chip', { type: 'button', data: { v: 'gate' }, onclick: function () { self.setApparatus('gate'); } }, '倾斜气垫导轨'));
    this.bobChips = h('div.seg',
      ['iron', 'al', 'wood'].map(function (k) {
        return h('button.chip', { type: 'button', data: { v: k }, onclick: function () { self.setBob(k); } }, BOB_INFO[k].name.replace('重', '') + ' ' + BOB_INFO[k].massG + 'g');
      }));
    this.idealChip = h('button.chip', { type: 'button', title: '理想：无阻力、无读数噪声', onclick: function () { S.ideal = !S.ideal; ML.store.save(); self.idealChip.classList.toggle('on', S.ideal); self.idealChip.textContent = S.ideal ? '理想条件' : '真实条件'; self.stage.invalidate(); } }, S.ideal ? '理想条件' : '真实条件');
    this.idealChip.classList.toggle('on', S.ideal);
    this.speedChip = h('button.chip', { type: 'button', onclick: function () { self.speed = self.speed === 0.25 ? 0.5 : self.speed === 0.5 ? 1 : 0.25; self.speedChip.textContent = '播放 ×' + self.speed; } }, '播放 ×0.25');
    this.bannerEl = h('div.bench-banner', { hidden: true });
    var topBar = h('div.bench-top', this.modeChips, this.appChips, this.bobChips, h('div.spacer'), this.idealChip, this.speedChip);
    this.stageWrap = h('div.bench-stage');
    this.side = h('aside.bench-side');
    this.analysis = h('section.analysis', { hidden: true });
    this.benchEl = h('div.bench', topBar, this.bannerEl, h('div.bench-row', this.stageWrap, this.side), this.analysis);
    el.appendChild(this.benchEl);
    this.stage = new ML.stage.Stage(this.stageWrap, { layers: ['bg', 'fg'] });
    this.stage.on('bg', function (ctx, w, hh) { self.drawBg(ctx, w, hh); });
    this.stage.on('fg', function (ctx, w, hh) { self.drawFg(ctx, w, hh); });
    this.loop = new ML.stage.Loop(function (dt) { return self.tick(dt); });
    this.bindPointer();
    this.reset();
    var saved = S.bench ? { timer: S.bench.timer || null, power: S.bench.power || null, bob: S.bench.bob || 'iron', near: S.bench.near !== false } : null;
    this.setMode(this.mode, true);
    this.setApparatus('timer');
    if (saved) {
      this.b.timer = saved.timer; this.b.power = saved.power; this.b.bob = saved.bob;
      this.b.startAt = saved.near ? 0 : 0.28;
      this.syncBobChips(); this.check(true); this.stage.invalidate();
    }
  }
  Bench.prototype.saveBench = function () {
    var b = this.b;
    ML.store.set({ bench: { timer: b.timer, power: b.power, bob: b.bob, near: b.startAt < 0.03 } });
  };
  Bench.prototype.syncBobChips = function () {
    var bob = this.b ? this.b.bob : 'iron';
    ML.$$('.chip', this.bobChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === bob); });
  };
  Bench.prototype.reset = function (opts) {
    opts = opts || {};
    var keepBob = this.b ? this.b.bob : 'iron';
    this.b = {
      timer: null, power: null, bob: keepBob, threaded: false, startAt: 0,
      powered: false, released: false, order: [], lag: null, running: false, t: 0, run: null, done: false, warn: ''
    };
    this.pendingTags = [];
    if (!opts.keepDone) this.done = {};
    this.syncBobChips();
    if (this.loop) this.loop.stop();
    if (this.stage) { this.stage.invalidate(); this.renderSide(); }
  };
  Bench.prototype.params = function () {
    var b = this.b;
    return {
      mode: 'drop', bob: b.bob || 'iron', g: P.G,
      timer: b.timer || 'em', power: b.power || 'ac8',
      ideal: S.ideal, freq: 50, startAt: b.startAt, near: b.startAt < 0.03,
      threaded: b.threaded, caught: true,
      order: b.order[0] === 'release' ? 'release-first' : 'power-first',
      lag: b.lag
    };
  };
  Bench.prototype.setMode = function (m, silent) {
    this.mode = m; S.mode = m; ML.store.save();
    ML.$$('.chip', this.modeChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === m); });
    if (!silent) { this.reset(); this.setBanner(null); ML.toast(m === 'guided' ? '引导模式：按实验规范逐步操作，出错会说明原因' : '自由模式：任意顺序都不拦截，结果由物理模型实时算出'); }
    this.renderSide();
  };
  Bench.prototype.setApparatus = function (a) {
    this.apparatus = a;
    ML.$$('.chip', this.appChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === a); });
    this.bobChips.hidden = a !== 'timer';
    this.gateRes = null; this.reset(); this.renderSide();
    if (a === 'timer') this.analysis.hidden = !this.tapes.length;
    else this.renderGateAnalysis();
  };
  Bench.prototype.setBob = function (k) {
    if (this.b.released) return;
    if (this.guided() && k === 'wood') { this.block('木块质量小、体积大，阻力占比超过 20%，应选密度大质量大的重铁锤。' + PROC.P3.why, 'E2'); return; }
    this.b.bob = k; this.syncBobChips(); this.setBanner(null); this.check(); this.stage.invalidate();
  };
  Bench.prototype.setBanner = function (html) {
    this.bannerEl.hidden = !html;
    this.bannerEl.innerHTML = html || '';
    if (this.benchEl) this.benchEl.classList.toggle('has-banner', !!html);
  };

  /* ---------- 几何映射 ---------- */
  Bench.prototype.geo = function () {
    var w = this.stage.w, hh = this.stage.h;
    var tableY = Math.round(hh * 0.87), timerY = Math.round(hh * 0.25), timerH = Math.round(Math.min(54, hh * 0.13));
    var dropX = Math.round(w * 0.62), standX = Math.round(w * 0.43);
    var padH = 14, bobNearY = timerY + timerH + 14;
    var scale = Math.max(120, (tableY - padH - 32 - bobNearY) / 0.70);
    return { w: w, h: hh, tableY: tableY, timerY: timerY, timerH: timerH, dropX: dropX, standX: standX, padH: padH, bobNearY: bobNearY, scale: scale };
  };
  Bench.prototype.bobTopY = function () {
    var g = this.geo(), b = this.b, sNow = b.run ? b.run.s(b.t) : 0;
    return g.bobNearY + (b.startAt + sNow) * g.scale;
  };

  /* ---------- 静态层 ---------- */
  Bench.prototype.drawBg = function (ctx, w, hh) {
    ctx.fillStyle = '#EAF1F8'; ctx.fillRect(0, 0, w, hh);
    if (this.apparatus === 'gate') { this.drawGateBg(ctx, w, hh); return; }
    var g = this.geo(), tY = g.tableY;
    // 实验桌面
    ctx.fillStyle = D.grad(ctx, 0, tY, 0, hh, ['#D2B284', '#B58F5C']);
    ctx.fillRect(0, tY, w, hh - tY);
    ctx.fillStyle = '#9D7947'; ctx.fillRect(0, tY, w, 3);
    // 缓冲软垫
    ctx.fillStyle = D.grad(ctx, 0, tY - g.padH, 0, tY, ['#56B88C', '#2E835C']);
    D.rr(ctx, g.dropX - 46, tY - g.padH, 92, g.padH, 4); ctx.fill();
    D.text(ctx, '缓冲软垫', g.dropX, tY + 15, { align: 'center', size: 11, color: '#fff', weight: 600 });
    // 铁架台底座与竖直立柱
    ctx.fillStyle = D.grad(ctx, 0, tY - 12, 0, tY, ['#7E8A98', '#4F5B69']);
    D.rr(ctx, g.standX - 54, tY - 12, 134, 12, 3); ctx.fill();
    ctx.fillStyle = D.grad(ctx, g.standX - 5, 0, g.standX + 5, 0, ['#DCE4EC', '#8E99A6']);
    ctx.fillRect(g.standX - 4, 24, 8, tY - 36);
    // 铁夹横臂
    ctx.fillStyle = '#6B7785';
    ctx.fillRect(g.standX - 10, g.timerY + g.timerH * 0.42, g.dropX - g.standX - 24, 9);
    D.rr(ctx, g.standX - 14, g.timerY + g.timerH * 0.32, 22, 22, 4); ctx.fill();
    D.text(ctx, '铁架台', g.standX - 20, tY - 22, { align: 'right', size: 12, color: '#4A5B73', weight: 600 });
  };
  Bench.prototype.drawGateBg = function (ctx, w, hh) {
    var tY = Math.round(hh * 0.85);
    ctx.fillStyle = D.grad(ctx, 0, tY, 0, hh, ['#D2B284', '#B58F5C']); ctx.fillRect(0, tY, w, hh - tY);
    var x0 = w * 0.12, x1 = w * 0.88, span = x1 - x0;
    var visAng = Math.min(0.24, Math.max(0.09, this.sinTheta * 1.9));
    var trackLen = span / Math.cos(visAng), y0 = tY - span * Math.tan(visAng) - 10;
    // 垫块
    ctx.fillStyle = '#9AA8B8'; ctx.fillRect(x0 + 18, y0 + 12, 32, tY - y0 - 12);
    D.text(ctx, '垫块', x0 + 34, tY - 8, { align: 'center', size: 11, color: '#10233F' });
    // 导轨
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(visAng);
    ctx.fillStyle = D.grad(ctx, 0, 0, 0, 14, ['#E3EAF2', '#B8C4D0']);
    ctx.fillRect(0, 0, trackLen, 14); ctx.strokeStyle = '#7E8A98'; ctx.strokeRect(0, 0, trackLen, 14);
    // 两光电门
    var mPerPx = trackLen / 0.86;
    var s1 = 0.16, s2 = s1 + this.gateDist;
    [s1, s2].forEach(function (s, idx) {
      var gx = (0.08 + s) * mPerPx;
      ctx.fillStyle = '#3B4B60'; D.rr(ctx, gx - 6, -54, 12, 54, 3); ctx.fill();
      ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.arc(gx, -28, 3, 0, Math.PI * 2); ctx.fill();
      D.text(ctx, '光电门' + (idx + 1), gx, -62, { align: 'center', size: 12, weight: 700, color: '#10233F' });
    });
    // 间距标尺
    var gx1 = (0.08 + s1) * mPerPx, gx2 = (0.08 + s2) * mPerPx;
    ctx.strokeStyle = '#12A9C4'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(gx1, 22); ctx.lineTo(gx1, 30); ctx.moveTo(gx2, 22); ctx.lineTo(gx2, 30); ctx.moveTo(gx1, 26); ctx.lineTo(gx2, 26); ctx.stroke();
    D.text(ctx, 'L = ' + this.gateDist.toFixed(2) + ' m   sinθ = ' + this.sinTheta.toFixed(2), (gx1 + gx2) / 2, 42, { align: 'center', size: 12, weight: 700, color: '#0E8CA3' });
    ctx.restore();
    D.text(ctx, '倾斜气垫导轨（Δh = L·sinθ = ' + (this.gateDist * this.sinTheta * 100).toFixed(2) + ' cm）', w * 0.5, 24, { align: 'center', size: 13, weight: 700, color: '#10233F' });
  };

  /* ---------- 动态层 ---------- */
  Bench.prototype.drawFg = function (ctx, w, hh) {
    this.hot = [];
    if (this.apparatus === 'gate') { this.drawGateFg(ctx, w, hh); return; }
    var g = this.geo(), b = this.b, bob = BOB_INFO[b.bob || 'iron'];
    var x = g.dropX, tY = g.tableY, bobY = this.bobTopY();
    var bw = Math.max(22, Math.round(bob.w * g.scale * 1.45)), bh = Math.max(30, Math.round(bob.hh * g.scale * 1.3));
    var holeY = g.timerY + g.timerH * 0.5, handY = Math.max(26, g.timerY - 58);

    // 1. 纸带（竖直拉直或未穿纸带卷）
    if (b.threaded) {
      var sNow = b.run ? b.run.s(b.t) : 0;
      var topTapeY = Math.min(bobY, handY + sNow * g.scale);
      var tapeH = Math.max(0, bobY - topTapeY);
      ctx.fillStyle = TV.PAPER; ctx.fillRect(x - 6, topTapeY, 12, tapeH);
      ctx.strokeStyle = '#CDBF98'; ctx.strokeRect(x - 6, topTapeY, 12, tapeH);
      // 实时打点（只显示当前已穿过计时器并向下移动的点）
      if (b.run) {
        ctx.fillStyle = '#2B2B2B';
        for (var i = 0; i < b.run.dots.length; i++) {
          if (b.run.times[i] > b.t) break;
          var dy = holeY + (sNow - b.run.dots[i]) * g.scale;
          if (dy >= topTapeY && dy <= bobY) {
            ctx.beginPath(); ctx.arc(x, dy, b.timer === 'spark' ? 1.3 : 1.7, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      // 手提上端示意
      ctx.strokeStyle = '#C98C6B'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath();
      if (!b.released) {
        ctx.moveTo(x - 14, handY); ctx.quadraticCurveTo(x, handY - 8, x + 14, handY);
        D.text(ctx, '手提上端（点击释放）', x, handY - 11, { align: 'center', size: 11.5, weight: 600, color: '#12A9C4' });
        this.hot.push({ id: 'hand', x: x - 46, y: handY - 26, w: 92, h: 44, label: '手提纸带' });
      } else {
        ctx.moveTo(x - 18, handY - 4); ctx.lineTo(x - 10, handY + 2);
        ctx.moveTo(x + 18, handY - 4); ctx.lineTo(x + 10, handY + 2);
      }
      ctx.stroke(); ctx.lineWidth = 1;
    } else {
      // 放在右侧桌面上的纸带卷
      var rx = Math.min(w - 50, g.dropX + 108), ry = tY - 22;
      ctx.fillStyle = TV.PAPER; ctx.strokeStyle = '#CDBF98';
      ctx.beginPath(); ctx.arc(rx, ry, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#EAF1F8'; ctx.beginPath(); ctx.arc(rx, ry, 5, 0, Math.PI * 2); ctx.fill();
      D.text(ctx, '纸带（点击穿入）', rx, ry - 24, { align: 'center', size: 11.5, weight: 600, color: '#12A9C4' });
      this.hot.push({ id: 'thread', x: rx - 28, y: ry - 30, w: 56, h: 56, label: '穿纸带' });
    }

    // 2. 竖直固定打点计时器（盖在纸带中段上）
    var tx = x - 34, ty = g.timerY, tw = 68, th = g.timerH;
    var isSpark = b.timer === 'spark';
    ctx.fillStyle = isSpark ? D.grad(ctx, 0, ty, 0, ty + th, ['#F2F5F9', '#C9D1D9']) : D.grad(ctx, 0, ty, 0, ty + th, ['#526E90', '#314864']);
    D.rr(ctx, tx, ty, tw, th, 7); ctx.fill();
    ctx.strokeStyle = '#6C7D91'; ctx.strokeRect(x - 8, ty + 2, 16, th - 4);
    ctx.fillStyle = b.powered && b.run && b.run.power.prints ? '#25A870' : b.powered ? '#E69B2D' : '#9AA8B8';
    ctx.beginPath(); ctx.arc(tx + tw - 10, ty + 11, 4.5, 0, Math.PI * 2); ctx.fill();
    D.text(ctx, b.timer ? TIMER_NAME[b.timer] : '打点计时器（点选）', tx + tw + 8, ty + th / 2 + 4, { size: 12, weight: 700, color: b.timer ? '#10233F' : '#12A9C4' });
    this.hot.push({ id: 'timer', x: tx - 6, y: ty - 6, w: tw + 12, h: th + 12, label: '打点计时器' });

    // 3. 学生电源与导线
    var px = Math.max(14, Math.round(w * 0.04)), pw = Math.min(180, Math.round(w * 0.25)), ph = 64, py = tY - ph;
    ctx.fillStyle = D.grad(ctx, 0, py, 0, py + ph, ['#F7F9FB', '#D7DEE6']);
    D.rr(ctx, px, py, pw, ph, 8); ctx.fill(); ctx.strokeStyle = '#9AA8B8'; ctx.stroke();
    D.text(ctx, '学生电源', px + 10, py + 18, { size: 12, weight: 700 });
    D.text(ctx, b.power ? POWER_NAME[b.power] : '未选档位', px + 10, py + 38, { size: 12.5, weight: 700, color: b.power ? (b.power === 'dc8' ? '#C7374B' : '#1661FF') : '#E69B2D' });
    var sx = px + pw - 28, sy = py + ph / 2;
    ctx.fillStyle = b.powered ? '#25A870' : '#8E99A6'; D.rr(ctx, sx - 15, sy - 9, 30, 18, 9); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.powered ? sx + 6 : sx - 6, sy, 6.5, 0, Math.PI * 2); ctx.fill();
    D.text(ctx, b.powered ? '开' : '关', sx, sy + 22, { align: 'center', size: 11 });
    ctx.strokeStyle = b.power === 'dc8' ? '#C7374B' : '#1C1C1C'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px + pw * 0.45, py); ctx.bezierCurveTo(px + pw * 0.4, py - 80, tx - 40, ty + th, tx, ty + th * 0.65); ctx.stroke(); ctx.lineWidth = 1;
    this.hot.push({ id: 'power', x: px, y: py, w: pw - 46, h: ph, label: '电源档位' });
    this.hot.push({ id: 'switch', x: sx - 24, y: sy - 22, w: 48, h: 46, label: '电源开关' });

    // 4. 靠近计时器虚线吸附框
    if (!b.released) {
      ctx.strokeStyle = 'rgba(18,169,196,.65)'; ctx.setLineDash([4, 4]);
      ctx.strokeRect(x - bw / 2 - 4, g.bobNearY - 2, bw + 8, bh + 4); ctx.setLineDash([]);
      if (b.startAt >= 0.03) D.text(ctx, '拖到此处靠近计时器', x + bw / 2 + 12, g.bobNearY + bh / 2 + 4, { size: 11, color: '#12A9C4', weight: 600 });
    }

    // 5. 重物（金属锤或木块）
    ctx.fillStyle = '#4A5B73'; ctx.fillRect(x - 4, bobY - 4, 8, 5);
    ctx.fillStyle = D.grad(ctx, x - bw / 2, bobY, x + bw / 2, bobY + bh, [bob.c1, bob.c2]);
    D.rr(ctx, x - bw / 2, bobY, bw, bh, 4); ctx.fill();
    ctx.strokeStyle = '#3B4B60'; ctx.stroke();
    D.text(ctx, bob.name + ' ' + bob.massG + 'g', x + bw / 2 + 8, bobY + bh / 2 + 4, { size: 12, weight: 600, color: '#10233F' });
    var hitBw = Math.max(48, bw + 26), hitBh = Math.max(48, bh + 18);
    if (!b.released) this.hot.push({ id: 'bob', x: x - hitBw / 2, y: bobY - (hitBh - bh) / 2, w: hitBw, h: hitBh, label: '重物' });

    if (b.warn) { ctx.fillStyle = 'rgba(199,55,75,.92)'; D.rr(ctx, 12, 10, w - 24, 34, 10); ctx.fill(); D.text(ctx, b.warn, w / 2, 32, { align: 'center', size: 13.5, color: '#fff', weight: 700 }); }
  };
  Bench.prototype.drawGateFg = function (ctx, w, hh) {
    var tY = Math.round(hh * 0.85), x0 = w * 0.12, x1 = w * 0.88, span = x1 - x0;
    var visAng = Math.min(0.24, Math.max(0.09, this.sinTheta * 1.9));
    var trackLen = span / Math.cos(visAng), y0 = tY - span * Math.tan(visAng) - 10;
    var mPerPx = trackLen / 0.86, sNow = this.b.run ? this.b.run.s(this.b.t) : 0;
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(visAng);
    var sx = (0.08 + sNow) * mPerPx, sw = 0.08 * mPerPx;
    ctx.fillStyle = D.grad(ctx, 0, -24, 0, 0, ['#5C8DEB', '#2E5FBF']);
    D.rr(ctx, sx - sw, -22, sw, 21, 4); ctx.fill();
    ctx.fillStyle = '#10233F'; ctx.fillRect(sx - 3, -44, Math.max(2, this.flag * mPerPx), 22);
    D.text(ctx, '滑块 d=' + (this.flag * 1000).toFixed(2).replace(/\.00$/, '') + 'mm', sx - sw / 2, -48, { align: 'center', size: 11, weight: 600 });
    ctx.restore();
    if (this.gateRes) {
      var r = this.gateRes, boxW = Math.min(460, w - 24), dx = Math.round((w - boxW) / 2), dy = Math.round(hh * 0.60);
      ctx.fillStyle = '#10233F'; D.rr(ctx, dx, dy, boxW, 62, 8); ctx.fill();
      D.text(ctx, '数字计时器（v = d/Δt）', dx + 12, dy + 19, { size: 11, color: '#9FB3CC' });
      D.text(ctx, 'Δt₁ = ' + (this.b.t > r.t1 ? (r.dt1 * 1000).toFixed(2) + ' ms' : '---'), dx + 12, dy + 44, { size: 13, color: '#7CF0B4', weight: 700, maxW: boxW * 0.34 });
      D.text(ctx, 'Δt₂ = ' + (this.b.t > r.t2 ? (r.dt2 * 1000).toFixed(2) + ' ms' : '---'), dx + Math.round(boxW * 0.35), dy + 44, { size: 13, color: '#7CF0B4', weight: 700, maxW: boxW * 0.34 });
      D.text(ctx, 'Δh = ' + (r.dh * 100).toFixed(2) + ' cm', dx + Math.round(boxW * 0.69), dy + 44, { size: 13, color: '#9FD2FF', weight: 700, maxW: boxW * 0.29 });
    }
  };

  /* ---------- 指针交互 ---------- */
  Bench.prototype.bindPointer = function () {
    var self = this, dragging = false, startY = 0, start0 = 0;
    ML.stage.pointer(this.stage.layer('fg').canvas, {
      down: function (p) {
        if (self.apparatus !== 'timer') return false;
        var hit = self.hitTest(p);
        dragging = hit === 'bob' && !self.b.released; startY = p.y; start0 = self.b.startAt;
      },
      move: function (p) {
        if (!dragging) return;
        var g = self.geo();
        self.b.startAt = P.clamp(start0 + (p.y - startY) / g.scale, 0, 0.28);
        self.stage.invalidate('fg');
      },
      up: function (p, a) {
        if (dragging && a.moved) {
          dragging = false;
          if (self.b.startAt < 0.03) { self.b.startAt = 0; ML.toast('重锤已紧靠打点计时器下方', 'ok'); }
          self.check(); self.stage.invalidate('fg'); return;
        }
        dragging = false;
        var hit = self.hitTest(p);
        if (hit === 'hand') self.release();
        else if (hit === 'timer') self.setTimer(self.b.timer === 'em' ? 'spark' : 'em');
        else if (hit === 'power') { var ord = ['ac8', 'ac220', 'dc8'], i = ord.indexOf(self.b.power); self.setPower(ord[(i + 1) % 3]); }
        else if (hit === 'switch') self.powerOn();
        else if (hit === 'thread') self.thread();
        else if (hit === 'bob') { self.b.startAt = self.b.startAt < 0.03 ? 0.28 : 0; self.check(); self.stage.invalidate(); }
      }
    });
  };
  Bench.prototype.hitTest = function (p) {
    var hs = this.hot || [];
    for (var i = hs.length - 1; i >= 0; i--) { var r = hs[i]; if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r.id; }
    return null;
  };
  Bench.prototype.guided = function () { return this.mode === 'guided'; };
  Bench.prototype.block = function (msg, errId) {
    ML.toast(msg, 'warn');
    this.setBanner('<b>先停一下：</b>' + msg + (errId ? ' <button class="link" type="button" data-try="' + errId + '">试一试：如果这样做会怎样 →</button>' : ''));
    var btn = ML.$('[data-try]', this.bannerEl); if (btn) btn.onclick = function () { openTry(errId); };
  };
  Bench.prototype.setTimer = function (t) {
    if (this.b.released) return;
    this.b.timer = t; this.b.power = this.b.power && this.guided() ? null : this.b.power; this.b.powered = false;
    this.check(); this.stage.invalidate();
  };
  Bench.prototype.setPower = function (p) {
    var b = this.b; if (b.released) return;
    if (!b.timer) { ML.toast('先选打点计时器', 'warn'); return; }
    if (this.guided()) {
      var right = b.timer === 'em' ? 'ac8' : 'ac220';
      if (p !== right) { this.block(TIMER_NAME[b.timer] + '应接' + POWER_NAME[right] + '。' + T.powerCheck({ timer: b.timer, power: p }).msg, null); return; }
    }
    b.power = p; b.powered = false; this.setBanner(null); this.check(); this.stage.invalidate();
  };
  Bench.prototype.thread = function () {
    if (this.b.released) return;
    this.b.threaded = true;
    ML.toast('纸带已竖直穿过限位孔，下端夹紧重物', 'ok');
    this.check(); this.stage.invalidate();
  };
  Bench.prototype.missing = function () {
    var b = this.b, miss = [];
    if (!b.timer) miss.push('选打点计时器');
    if (!b.power) miss.push('接电源');
    if (!b.threaded) miss.push('穿纸带并拉直');
    return miss;
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
    if (!b.timer || !b.power) { ML.toast('先选计时器并接好电源', 'warn'); return; }
    if (this.guided()) {
      var miss = this.missing(); if (miss.length) { ML.toast('还没完成：' + miss.join('、'), 'warn'); return; }
      if (b.startAt >= 0.03) { this.block('释放前重物应紧靠打点计时器下方。' + PROC.P4.why, 'E5'); return; }
    }
    var pc = T.powerCheck({ timer: b.timer, power: b.power });
    if (pc.blocked) { b.warn = '⚠ ' + pc.msg + ' 已自动断电。'; this.stage.invalidate(); var self = this; setTimeout(function () { self.b.warn = ''; self.stage.invalidate(); }, 3200); return; }
    b.powered = true; b.order.push('power');
    if (b.running) { b.lag = P.clamp(b.t, 0.06, 0.16); this.rebuild(); ML.toast('已在中途补通电源！', 'info'); }
    this.check(); this.stage.invalidate();
  };
  Bench.prototype.release = function () {
    var b = this.b; if (b.released) return;
    if (this.guided()) {
      var miss = this.missing(); if (miss.length) { ML.toast('还没完成：' + miss.join('、'), 'warn'); return; }
      if (b.startAt >= 0.03) { this.block('释放前重物应紧靠打点计时器下方。' + PROC.P4.why, 'E5'); return; }
      if (!b.powered) { this.block('应先接通电源让打点稳定，再松手释放纸带。' + PROC.P5.why, 'E1'); return; }
    }
    b.released = true; b.order.push('release'); b.running = true;
    b.lag = b.order[0] === 'power' ? 0.40 : (b.powered ? 0.12 : Infinity);
    b.t = b.order[0] === 'power' ? 0.40 : 0;
    this.rebuild(); this.setBanner(null); this.renderSide(); this.loop.start();
    if (!b.powered && !this.guided()) ML.toast('纸带正在下落！可在下落途中点“接通电源”观察先释放后果', 'warn');
  };
  Bench.prototype.releaseLateDemo = function () {
    var b = this.b; if (b.released) return;
    if (!b.timer) b.timer = 'em';
    if (!b.power) b.power = b.timer === 'em' ? 'ac8' : 'ac220';
    b.threaded = true; b.powered = true; b.released = true; b.order = ['release', 'power'];
    b.lag = 0.12; b.running = true; b.t = 0;
    this.rebuild(); this.renderSide(); this.loop.start();
  };
  Bench.prototype.rebuild = function () {
    var b = this.b, p = this.params();
    this.seed = this.seed || (seedCounter += 7);
    b.run = T.run(p, this.seed);
  };
  Bench.prototype.tick = function (dt) {
    var b = this.b;
    if (this.apparatus === 'gate') {
      if (!b.running || !this.gateRes) return false;
      b.t += dt * this.speed;
      var endG = this.gateRes.t2 + 0.25;
      this.stage.invalidate('fg');
      if (b.t >= endG) { b.t = endG; b.running = false; b.done = true; this.renderSide(); this.renderGateAnalysis(); return false; }
      return true;
    }
    if (!b.running) return false;
    b.t += dt * this.speed;
    var end = b.run ? b.run.tOff : 1.0;
    this.stage.invalidate('fg');
    if (b.t >= end) { b.t = end; b.running = false; this.finish(); return false; }
    return true;
  };
  Bench.prototype.finish = function () {
    var b = this.b; b.done = true;
    this.done.P5 = b.order[0] === 'power';
    this.check(true); this.stage.invalidate();
  };
  Bench.prototype.addTag = function (id) { this.pendingTags = this.pendingTags || []; if (this.pendingTags.indexOf(id) < 0) this.pendingTags.push(id); };
  Bench.prototype.takeTape = function () {
    var b = this.b; if (!b.done) return;
    var tags = [];
    if (b.order[0] === 'release' && b.powered) tags.push('E1');
    if (b.bob === 'wood') tags.push('E2');
    if (b.startAt >= 0.03) tags.push('E5');
    tags = tags.concat(this.pendingTags || []).filter(function (x, i, a) { return a.indexOf(x) === i && ERR[x]; });
    var tape = { no: ++this.tapeSeq, run: b.run, timer: b.timer || 'em', bob: b.bob || 'iron', tags: tags, threaded: b.threaded };
    this.tapes.push(tape); if (this.tapes.length > 3) this.tapes.shift();
    this.pendingTags = []; this.seed = 0; this.done.P6 = true;
    this.reset({ keepDone: true });
    ana.show(tape, this);
    ML.toast('已取下纸带，请在下方检验首两点间距并对比能量', 'ok');
  };
  Bench.prototype.check = function (skipSave) {
    var b = this.b;
    this.done.P1 = !!b.timer;
    this.done.P2 = !!b.power && T.powerCheck({ timer: b.timer, power: b.power }).prints;
    this.done.P3 = b.threaded && b.bob !== 'wood';
    this.done.P4 = b.startAt < 0.03;
    if (!skipSave) this.saveBench();
    this.renderSide();
  };

  function openGateCaliper(curM, onAdopt) {
    var modal = null;
    var st = {
      type: 'caliper', div: 20,
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
      h('button.chip', { type: 'button', onclick: function () { setVal(5.15); } }, '预设 5.15 mm'),
      h('button.chip', { type: 'button', onclick: function () { setVal(10.00); } }, '预设 10.00 mm'));
    var box = h('div'), info = h('div.cmp-note');
    var adoptBtn = h('button.btn.primary', { type: 'button', onclick: function () { var v = gb.value(); close(); if (onAdopt) onAdopt(v); } }, '采用此遮光片宽度 d');
    modal = h('div.ml-modal', {
      role: 'dialog', 'aria-modal': 'true', 'aria-label': '20分度游标卡尺测遮光片宽度',
      onclick: function (e) { if (e.target === modal) close(); }
    },
      h('div.ml-modal-card.gauge-modal-card',
        h('div.try-head', h('div', h('div.try-k', '仪器读数复用'), h('h2', '20 分度游标卡尺测遮光片宽度 d（拖动或长按放大）')), h('button.btn', { type: 'button', onclick: close }, '关闭')),
        ctrl, box, info, h('div.try-actions', adoptBtn)));
    document.body.appendChild(modal);
    var gb = new ML.gaugesView.GaugeBench(box, { height: 255, state: st, onChange: updateInfo });
    function updateInfo() {
      var val = gb.value(); st.valMm = val;
      info.innerHTML = '20 分度游标卡尺（精确度 0.05 mm，不估读）：当前遮光片宽度 d = <b>' + val.toFixed(2) + ' mm</b>（' + (val / 10).toFixed(3) + ' cm）';
    }
    function setVal(v) {
      st.valMm = Math.round(P.clamp(v, 2, 30) * 20) / 20;
      gb.set({ type: 'caliper', div: 20, valMm: st.valMm }); updateInfo();
    }
    function nudge(dv) { setVal((gb.value() || st.valMm) + dv); }
    updateInfo();
  }

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
    ctl.appendChild(row(h('span.side-l', '纸带'), btn(b.threaded ? '已穿好' : '穿纸带并拉直', b.threaded, function () { self.thread(); })));
    ctl.appendChild(row(h('span.side-l', '重物位置'), btn('靠近计时器', b.startAt < 0.03, function () { if (!b.released) { b.startAt = 0; self.check(); self.stage.invalidate(); } }), btn('远离计时器', b.startAt >= 0.03, function () { if (!b.released) { b.startAt = 0.28; self.check(); self.stage.invalidate(); } })));
    var pwrNeedsClick = b.running && !b.powered;
    ctl.appendChild(h('div.side-acts',
      h('button.btn' + (b.powered ? '.cyan' : pwrNeedsClick ? '.pulse' : ''), { type: 'button', onclick: function () { self.powerOn(); }, disabled: b.done }, b.powered ? '电源已接通' : (pwrNeedsClick ? '⚡ 立即补通电源' : '接通电源')),
      h('button.btn.primary', { type: 'button', onclick: function () { self.release(); }, disabled: b.released }, '释放纸带'),
      h('button.btn', { type: 'button', onclick: function () { self.takeTape(); }, disabled: !b.done }, '关电源，取下纸带'),
      !this.guided() && !b.released ? h('button.btn.sm', { type: 'button', onclick: function () { self.releaseLateDemo(); } }, '先释放 0.12s 后补通电（演示）') : null,
      h('button.btn.sm', { type: 'button', onclick: function () { self.reset(); self.saveBench(); self.setBanner(null); } }, '重新装置')));
    side.appendChild(ctl);
    if (this.guided()) {
      side.appendChild(h('div.side-k', '实验步骤'));
      var allIds = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'];
      var curId = null;
      for (var k = 0; k < allIds.length; k++) { if (!this.done[allIds[k]]) { curId = allIds[k]; break; } }
      var curEl = null;
      var stepsEl = h('ol.steps', allIds.map(function (id) {
        var p = PROC[id], ok = !!self.done[id], isCur = id === curId;
        var li = h('li' + (ok ? '.ok' : '') + (isCur ? '.cur' : ''),
          h('div.st-t', (ok ? '✓ ' : isCur ? '▸ ' : '') + p.title),
          h('div.st-how', { html: M.tex(p.how) }),
          p.why ? h('div.st-why', { html: M.tex('理由：' + p.why) }) : null,
          p.errorId ? h('button.link.sm', { type: 'button', onclick: function () { openTry(p.errorId); } }, '为什么？试一试 →') : null);
        if (isCur) curEl = li;
        return li;
      }));
      side.appendChild(stepsEl);
      if (curEl) setTimeout(function () { if (stepsEl.scrollHeight > stepsEl.clientHeight + 4) stepsEl.scrollTop = Math.max(0, curEl.offsetTop - stepsEl.offsetTop - 4); }, 0);
    } else {
      side.appendChild(h('div.side-tip', '自由模式：可任意换材质（如木块）、先释放后通电或远离计时器，观察真实物理结果与误差诊断标签。'));
    }
  };
  Bench.prototype.renderGateSide = function (side) {
    var self = this, b = this.b, r = this.gateRes;
    var presets = [0.002, 0.005, 0.010, 0.020];
    side.appendChild(h('div.side-k', '倾斜气垫导轨参数'));
    side.appendChild(h('div.side-row', h('span.side-l', '倾角 sinθ'), [0.05, 0.06, 0.08, 0.10].map(function (s) {
      return h('button.chip' + (self.sinTheta === s ? '.on' : ''), { type: 'button', disabled: b.running, onclick: function () { self.sinTheta = s; self.gateRes = null; self.b.done = false; self.renderSide(); self.stage.invalidate(); } }, s.toFixed(2));
    })));
    side.appendChild(h('div.side-row', h('span.side-l', '遮光片 d'), presets.map(function (d) {
      return h('button.chip' + (Math.abs(self.flag - d) < 1e-6 ? '.on' : ''), { type: 'button', disabled: b.running, onclick: function () { self.flag = d; self.gateRes = null; self.b.done = false; self.renderSide(); self.stage.invalidate(); } }, (d * 1000) + ' mm');
    }), h('button.link.sm', {
      type: 'button', disabled: b.running,
      onclick: function () {
        openGateCaliper(self.flag, function (mm) {
          self.flag = Math.round(mm * 100) / 100000;
          self.gateRes = null; self.b.done = false;
          self.renderSide(); self.stage.invalidate();
          ML.toast('已采用卡尺测得遮光片宽度 d = ' + mm.toFixed(2) + ' mm', 'ok');
        });
      }
    }, presets.some(function (d) { return Math.abs(self.flag - d) < 1e-6; }) ? '用游标卡尺测 d →' : '卡尺 ' + (self.flag * 1000).toFixed(2) + 'mm →')));
    side.appendChild(h('div.side-row', h('span.side-l', '门间距 L'), [0.25, 0.40, 0.55].map(function (L) {
      return h('button.chip' + (self.gateDist === L ? '.on' : ''), { type: 'button', disabled: b.running, onclick: function () { self.gateDist = L; self.gateRes = null; self.b.done = false; self.renderSide(); self.stage.invalidate(); } }, L.toFixed(2) + ' m');
    })));
    side.appendChild(h('div.side-acts',
      h('button.btn.primary', { type: 'button', disabled: b.running, onclick: function () { self.startGateRun(); } }, '由静止释放滑块'),
      h('button.btn.sm', { type: 'button', onclick: function () { self.gateLogs = []; self.gateRes = null; self.b.run = null; self.b.done = false; self.b.t = 0; self.renderSide(); self.renderGateAnalysis(); self.stage.invalidate(); } }, '清空数据重新测')));
    if (r && b.done) {
      side.appendChild(h('table.dt.gate-t',
        h('tr', h('th', 'v₁ = d/Δt₁'), h('td', r.v1.toFixed(3) + ' m/s'), h('th', 'v₂ = d/Δt₂'), h('td', r.v2.toFixed(3) + ' m/s')),
        h('tr', h('th', 'g·Δh'), h('td', r.gh.toFixed(4) + ' m²/s²'), h('th', '½(v₂²−v₁²)'), h('td', r.halfDv2.toFixed(4) + ' m²/s²')),
        h('tr', h('th', '高度差 Δh'), h('td', (r.dh * 100).toFixed(2) + ' cm'), h('th', '相对偏差 η'), h('td', (r.eta * 100).toFixed(2) + '%'))));
    } else {
      side.appendChild(h('div.side-tip', { html: M.tex('无需测滑块质量 m！只要测出 v₁、v₂ 和两门竖直高度差 Δh = L·sinθ，即可对比 gΔh 与 {{frac|1|2}}(v₂² − v₁²)。改变 L 多测几组，下方自动绘出 {{frac|1|2}}Δv² - Δh 图。') }));
    }
  };
  Bench.prototype.startGateRun = function () {
    var gr = runAirGate(this.sinTheta, this.flag, this.gateDist, S.ideal);
    this.gateRes = gr;
    this.b.run = { a: gr.a, s: function (t) { return Math.min(0.76, 0.5 * gr.a * t * t); } };
    this.b.t = 0; this.b.running = true; this.b.done = false;
    this.gateLogs.push(gr); if (this.gateLogs.length > 6) this.gateLogs.shift();
    this.renderSide(); this.loop.start();
  };
  Bench.prototype.renderGateAnalysis = function () {
    var el = this.analysis;
    if (!this.gateLogs.length) { el.hidden = true; return; }
    el.hidden = false; ML.clear(el);
    el.appendChild(h('h2.ana-h', '倾斜气垫导轨：多次测量与 ½Δv² - Δh 图像'));
    var rows = this.gateLogs.map(function (r, idx) {
      return h('tr', h('td', String(idx + 1)), h('td', r.L.toFixed(2)), h('td', r.sinTheta.toFixed(2)),
        h('td', (r.dh * 100).toFixed(2)), h('td', (r.dt1 * 1000).toFixed(2)), h('td', (r.dt2 * 1000).toFixed(2)),
        h('td', r.gh.toFixed(4)), h('td', r.halfDv2.toFixed(4)), h('td', (r.eta * 100).toFixed(2) + '%'));
    });
    el.appendChild(h('div.tbl-wrap', h('table.dt',
      h('tr', h('th', '组次'), h('th', 'L / m'), h('th', 'sinθ'), h('th', 'Δh / cm'), h('th', 'Δt₁ / ms'), h('th', 'Δt₂ / ms'), h('th', 'gΔh / (m²·s⁻²)'), h('th', '½Δv² / (m²·s⁻²)'), h('th', '偏差 η')),
      rows)));
    if (this.gateLogs.length >= 2) {
      var pts = this.gateLogs.map(function (r) { return [r.dh, r.halfDv2]; });
      var maxH = Math.max.apply(null, pts.map(function (p) { return p[0]; })) * 1.15;
      var chBox = h('div.ana-block', h('h3', '½(v₂² − v₁²) − Δh 图像（理论斜率 = g = 9.80 m/s²）'));
      el.appendChild(chBox);
      var ch = new ML.Chart(chBox, { xLabel: 'Δh / m', yLabel: '½Δv² / (m²·s⁻²)', height: 240, paper: true, x: [0, maxH], y: [0, P.G * maxH * 1.1] });
      var fit = P.linfit(pts.map(function (p) { return p[0]; }), pts.map(function (p) { return p[1]; }));
      var validFit = isFinite(fit.k) && Math.abs(fit.k) > 0;
      var sFit = validFit ? { pts: pts, fit: true, color: '#1661FF', label: '实验拟合直线' } : { pts: pts, color: '#1661FF', label: '实验实测点（Δh相同）' };
      ch.set([sFit, { pts: [], line: [[0, 0], [maxH, P.G * maxH]], color: '#25A870', dash: true, label: '理论参考 y = 9.80·Δh' }]);
      chBox.appendChild(h('div.cmp-note', validFit
        ? ('拟合斜率 k = ' + fit.k.toFixed(3) + ' m/s²，与当地 g = 9.80 m/s² 相差 ' + (Math.abs(fit.k - P.G) / P.G * 100).toFixed(2) + '%。')
        : '提示：多组测量的高度差 Δh 完全相同，请改变门间距 L 或倾角 sinθ 后再测以拟合直线斜率。'));
    }
  };

  /* =====================================================================
   *  纸带与能量对比分析区
   * ===================================================================== */
  var ana = {
    show: function (tape, bn, opts) {
      opts = opts || {};
      var self = this, el = bn.analysis; this.bn = bn; this.tape = tape; el.hidden = false; ML.clear(el);
      var stAuto = firstMotionIndex(tape.run);
      this.firstClear = stAuto;
      this.st = { O: stAuto, nonzero: false, showMass: false, speedMethod: 'mid', useTapeA: false, graphMode: 'halfv2', readings: null, readingsChecked: !bn.guided() };
      var tapesBar = h('div.ana-tapes', h('b', '我的纸带：'), bn.tapes.map(function (t) {
        return h('button.chip' + (t === tape ? '.on' : ''), { type: 'button', onclick: function () { self.show(t, bn); } }, '纸带 ' + t.no + '（' + BOB_INFO[t.bob || 'iron'].name + '）');
      }));
      this.tagBox = h('div.ana-tags');
      el.appendChild(h('h2.ana-h', '纸带检验与机械能守恒分析'));
      el.appendChild(tapesBar); el.appendChild(this.tagBox);
      this.twoMmBox = h('div.twomm-badge');
      el.appendChild(this.twoMmBox);
      this.hint = h('div.ana-hint');
      el.appendChild(this.hint);
      this.originStatus = h('span', { 'aria-live': 'polite' });
      this.prevPoint = h('button.chip', { type: 'button', onclick: function () { self.pickO(self.st.O - 1); } }, '上一点');
      this.nextPoint = h('button.chip', { type: 'button', onclick: function () { self.pickO(self.st.O + 1); } }, '下一点');
      this.pointPicker = h('div.ana-point-picker', this.originStatus, this.prevPoint, this.nextPoint);
      el.appendChild(this.pointPicker);
      var stripWrap = h('div.ana-strip');
      el.appendChild(stripWrap);
      this.strip = new TV.TapeStrip(stripWrap, { height: 118, onTap: function (i) { self.pickO(i); },
        magLabel: function (x, s) {
          var dots = tape.run.dots, best = s.hit(x);
          if (best < 0) return '移到点迹处看间距';
          if (best + 1 < dots.length) return '点 #' + best + ' · 下一段 ' + mmStr(Math.abs(dots[best + 1] - dots[best])) + ' mm';
          return '点 #' + best + '（末点）';
        } });
      this.controls = h('div.ana-ctl'); el.appendChild(this.controls);
      this.out = h('div.ana-out'); el.appendChild(this.out);
      this.update();
      this.strip.stage.resize();
      this.strip.zoomTo(3200, tape.run.dots.length ? tape.run.dots[Math.min(tape.run.dots.length - 1, stAuto + 6)] : 0);
      if (!opts.noScroll) el.scrollIntoView({ behavior: ML.perf.low ? 'auto' : 'smooth', block: 'start' });
    },
    pickO: function (i) {
      var dots = this.tape.run.dots; if (i < 0 || i >= dots.length) return;
      var x = this.strip.X(dots[i]);
      if (x < 8 || x > this.strip.stage.w - 8) this.strip.zoomTo(this.strip.scale, dots[i]);
      this.st.O = i;
      if (this.bn && this.bn.guided()) {
        this.st.readingsChecked = false; this.st.readings = null;
        this.bn.done.P7 = this.bn.done.P8 = this.bn.done.P9 = false; this.bn.renderSide();
      }
      this.update();
    },
    update: function () {
      var st = this.st, run = this.tape.run, dots = run.dots;
      var tags = (this.tape.tags || []).slice();
      if (st.speedMethod !== 'mid') tags.push('E3');
      if (st.useTapeA) tags.push('E4');
      tags = tags.filter(function (x, i, a) { return a.indexOf(x) === i && ERR[x]; });
      ML.clear(this.tagBox);
      if (tags.length) {
        this.tagBox.appendChild(h('span.tag.err', '⚠ 检测到操作或分析问题'));
        tags.forEach(function (id) { this.tagBox.appendChild(h('button.tag', { type: 'button', onclick: function () { openTry(id); } }, ERR[id].name + ' → 看看后果')); }, this);
      } else {
        this.tagBox.appendChild(h('span.tag.ok', '✓ 操作与算法规范'));
      }
      var res = dots.length && this.tape.threaded ? computeEnergy(run, { startIdx: st.O, nonzero: st.nonzero, speedMethod: st.speedMethod, useTapeA: st.useTapeA, ideal: S.ideal || this.bn.guided(), seed: 5 + st.O, readings: st.readings }) : { valid: false, d12: 0 };
      this.res = res;
      if (!dots.length || !this.tape.threaded) {
        this.twoMmBox.hidden = true;
        this.pointPicker.hidden = true;
        this.hint.textContent = '这条纸带没有点迹（未穿纸带或电源选错），请回到实验台重新实验。';
        this.strip.set({ dots: [], timer: this.tape.timer, blankText: '（纸带上没有可用的点）', count: null, ruler: false });
        ML.clear(this.controls); ML.clear(this.out); return;
      }
      this.pointPicker.hidden = false;
      this.twoMmBox.hidden = false;
      var hasNext = st.O + 1 < dots.length;
      var d12Mm = st.readings ? st.readings.d12 * 1000 : (hasNext ? Math.abs(dots[st.O + 1] - dots[st.O]) * 1000 : 0);
      var ok2mm = d12Mm >= 1.50 && d12Mm <= 2.60;
      this.twoMmBox.className = 'twomm-badge ' + (ok2mm ? 'ok' : 'bad');
      ML.clear(this.twoMmBox);
      if (this.bn && this.bn.guided() && !st.readingsChecked) {
        this.twoMmBox.className = 'twomm-badge';
        var kHint = res.valid ? Math.min(5, res.meas.pos.length - 2) : 5;
        var hHint = kHint >= 2 ? ' h' + sub(kHint - 1) + '、h' + sub(kHint) + '、h' + sub(kHint + 1) : ' 下方指定的三个高度';
        this.twoMmBox.appendChild(h('span', '请先用刻度尺测量 Δs₁₂ 和' + hHint + '，在下方填写原始读数；核对前不显示程序测量值。'));
      } else {
      this.twoMmBox.appendChild(h('span', { html: !hasNext ? '已选末点，后面没有点可用于测量首段间距。' :
        '<b>起点与下一点的间距 Δs₁₂ = ' + d12Mm.toFixed(2) + ' mm</b>　' +
        (ok2mm ? '✓ 接近理论值 h₁ = ½gT² = 1.96 mm ≈ 2 mm，可视为初速度为零的起点。'
          : d12Mm > 2.60 ? '⚠ 明显大于 2 mm！打首点时重物已有初速度，按静止起点算会出现 ΔEₖ > ΔEₚ。'
            : '⚠ 小于 1.5 mm，可能处于静止叠点区，请点选第 1 个下落清晰点作为起点 O。') }));
      if (d12Mm > 2.60) this.twoMmBox.appendChild(h('button.link', { type: 'button', onclick: function () { openTry('E1'); } }, '为什么会这样？试一试 →'));
      }

      this.hint.textContent = '点按点迹选择起点，拖动平移纸带，按住查看 3× 放大镜。' +
        (this.firstClear > 0 ? '纸带开头的点迹重叠，可用「上一点」「下一点」按打点顺序逐个选。' : '');
      this.originStatus.textContent = '已选起点 O（点 #' + st.O + '）';
      this.prevPoint.disabled = st.O === 0;
      this.nextPoint.disabled = !hasNext;
      var count = res.valid ? res.meas.idx.map(function (k) { return st.O + k; }) : [st.O];
      var labels = count.map(function (_, k) { return k === 0 ? 'O' : String(k); });
      this.strip.set({ dots: dots, timer: this.tape.timer, count: count, labels: labels, ruler: true,
        // 重叠的静止点用按钮逐个选；纸带上的这处点迹按首个清晰段的起点命中。
        hitStart: this.firstClear, minLabelGap: 16,
        marks: hasNext ? [{ from: dots[st.O], to: dots[st.O + 1], color: ok2mm ? '#25A870' : '#C7374B' }] : null });
      this.renderCtl();
      this.renderOut();
    },
    renderCtl: function () {
      var self = this, st = this.st, c = this.controls; ML.clear(c);
      var bobMassG = BOB_INFO[this.tape.bob || 'iron'].massG;
      c.appendChild(h('div.side-row', h('span.side-l', '计算基准'),
        h('button.chip' + (!st.nonzero ? '.on' : ''), { type: 'button', onclick: function () { st.nonzero = false; self.update(); } }, '从起点 O 出发（比 ghₙ 与 ½vₙ²）'),
        h('button.chip' + (st.nonzero ? '.on' : ''), { type: 'button', onclick: function () { st.nonzero = true; self.update(); } }, '任取清晰段 A→B（比 gΔh 与 ½Δv²）')));
      c.appendChild(h('div.side-row', h('span.side-l', '质量处理'),
        h('button.chip' + (!st.showMass ? '.on' : ''), { type: 'button', onclick: function () { st.showMass = false; self.renderCtl(); self.renderOut(); } }, '约去 m（比较 gh 与 ½v²）'),
        h('button.chip' + (st.showMass ? '.on' : ''), { type: 'button', onclick: function () { st.showMass = true; self.renderCtl(); self.renderOut(); } }, '乘以 m = ' + bobMassG + ' g（mgh 与 ½mv²）')));
      c.appendChild(h('div.side-row', h('span.side-l', '速度求法'),
        h('button.chip' + (st.speedMethod === 'mid' ? '.on' : ''), { type: 'button', onclick: function () { st.speedMethod = 'mid'; self.update(); } }, '中间时刻 (hₙ₊₁−hₙ₋₁)/2T'),
        h('button.chip' + (st.speedMethod === 'sqrt2gh' ? '.bad-on' : ''), { type: 'button', onclick: function () { st.speedMethod = 'sqrt2gh'; self.update(); } }, '误用 v = √(2gh)'),
        h('button.chip' + (st.speedMethod === 'gt' ? '.bad-on' : ''), { type: 'button', onclick: function () { st.speedMethod = 'gt'; self.update(); } }, '误用 v = gt')));
      c.appendChild(h('div.side-row', h('span.side-l', '势能 g 值'),
        h('button.chip' + (!st.useTapeA ? '.on' : ''), { type: 'button', onclick: function () { st.useTapeA = false; self.update(); } }, '当地真实 g = 9.80 m/s²'),
        h('button.chip' + (st.useTapeA ? '.bad-on' : ''), { type: 'button', onclick: function () { st.useTapeA = true; self.update(); } }, '改用纸带算出的 a 代入计算（逻辑对照）')));
    },
    renderOut: function () {
      var self = this, st = this.st, out = this.out, res = this.res; ML.clear(out);
      if (!res || !res.valid) { out.appendChild(h('div.warnline', '清晰落体点太少（至少需要 4 个下落点），请尝试把重物靠近计时器重做。')); return; }
      if (this.bn && this.bn.guided() && !st.readingsChecked) {
        var dots = this.tape.run.dots;
        var kRef = Math.min(5, res.meas.pos.length - 2);
        if (kRef < 2) { out.appendChild(h('div.warnline', '可用点不足，请重选更早的起点或重新实验。')); return; }
        var expected = [Math.abs(dots[st.O + 1] - dots[st.O]) * 1000,
          res.meas.pos[kRef - 1] * 100, res.meas.pos[kRef] * 100, res.meas.pos[kRef + 1] * 100];
        var labels = ['Δs₁₂ / mm', 'h' + sub(kRef - 1) + ' / cm', 'h' + sub(kRef) + ' / cm', 'h' + sub(kRef + 1) + ' / cm'];
        var inputs = expected.map(function (_, i) { return h('input', { type: 'number', step: '0.01', min: '0', 'aria-label': labels[i], style: { width: '90px' } }); });
        var fb = h('div.ana-hint');
        out.appendChild(h('div.ana-block', h('h3', '先读尺并记录原始数据'),
          h('div.muted', '用刻度尺和放大镜读取首段间距，以及 O 到第 ' + (kRef - 1) + '、' + kRef + '、' + (kRef + 1) + ' 点的距离；以指定单位保留两位小数。'),
          h('div.side-row', labels.map(function (lab, i) { return h('label', lab + ' ', inputs[i]); })),
          h('button.btn.primary', { type: 'button', onclick: function () {
            var vals = inputs.map(function (inp) { return Number(inp.value); });
            var ok = vals.every(function (v, i) { return isFinite(v) && inputs[i].value !== '' && Math.abs(v - expected[i]) <= 0.011; });
            if (!ok) { fb.textContent = '有读数不符，请核对起点、刻线、单位和估读位数。'; return; }
            st.readings = { d12: vals[0] / 1000, first: kRef - 1, heights: vals.slice(1).map(function (v) { return v / 100; }) };
            st.readingsChecked = true; self.bn.done.P7 = vals[0] >= 1.50 && vals[0] <= 2.60; self.bn.done.P8 = true;
            self.bn.renderSide();
            self.update(); ML.toast('原始读数已记录，下面可用中间时刻法计算并核对。', 'ok');
          } }, '提交原始读数并计算'), fb));
        return;
      }
      if (st.readings) out.appendChild(h('div.muted', '首段间距和已填写的三个高度采用你的读数。全纸带图像还使用其余点迹的辅助尺读数。'));
      var mKg = st.showMass ? BOB_INFO[this.tape.bob || 'iron'].massKg : 1;
      var unitE = st.showMass ? 'J' : 'm²·s⁻²';
      var epTitle = (st.useTapeA ? 'a纸带' : 'g') + (st.showMass ? '·m' : '') + (st.nonzero ? 'Δh' : 'hₙ') + ' / ' + unitE;
      var ekTitle = (st.showMass ? '½m' : '½') + (st.speedMethod === 'mid' ? (st.nonzero ? '(vₙ²−vₐ²)' : 'vₙ²') : 'vₙ²') + ' / ' + unitE;
      var tableRows = res.rows.map(function (r) {
        var epVal = r.ep * mKg, ekVal = r.ek * mKg;
        return h('tr',
          h('td', String(r.n)),
          h('td', cmStr(r.h)),
          h('td', r.v.toFixed(3)),
          h('td', epVal.toFixed(4)),
          h('td', ekVal.toFixed(4)),
          h('td', (r.eta * 100).toFixed(2) + '%'));
      });
      out.appendChild(h('div.ana-block',
        h('h3', '各点高度、瞬时速度与能量对比' + (st.nonzero ? '（以点 #' + res.refIdx + ' 为基准 A，vₐ = ' + res.vRef.toFixed(3) + ' m/s）' : '')),
        h('div.tbl-wrap', h('table.dt', h('tr', h('th', '计数点 n'), h('th', (st.nonzero ? 'Δh' : 'hₙ') + ' / cm'), h('th', 'vₙ / (m·s⁻¹)'), h('th', '势能减少 ' + epTitle), h('th', '动能增加 ' + ekTitle), h('th', '相对误差 η')), tableRows))));

      if (st.speedMethod !== 'mid') {
        var warnMsg = st.speedMethod === 'sqrt2gh'
          ? '⚠ 红线警告：改用 v = √(2gh) 后，代入 ½v² 恒等于 gh、误差恒为 0.00%，属于循环论证！'
          : '⚠ 红线警告：改用 v = gt 按自由落体时间算速度已预设加速度为 g（理想无阻力时误差假归零，有阻力时算出的 ½(gt)² 反超 gh），同样属于循环论证！';
        var w3 = h('div.warnline', { html: warnMsg + ' <button class="link" type="button">试一试 →</button>' });
        out.appendChild(w3);
        ML.$('.link', w3).onclick = function () { openTry('E3'); };
      }
      if (st.useTapeA) {
        var w4 = h('div.warnline', { html: '⚠ 逻辑性错误（2024·浙江 6 月真题）：纸带自身加速度 a = ' + res.aTape.toFixed(3) + ' m/s² 已包含阻力影响。用 a 代替当地 g = 9.80 m/s² 后，恒有 ½v² ≡ a·h，哪怕用大阻力木块误差也会变成 < 0.5%！ <button class="link" type="button">试一试 →</button>' });
        out.appendChild(w4);
        ML.$('.link', w4).onclick = function () { openTry('E4'); };
      } else if (this.bn && this.tape.bob !== 'wood' && st.speedMethod === 'mid' && this.tape.tags.length === 0) {
        // 引导模式的 P7 已由学生提交的首段原始读数判定，不能被自动计算覆盖。
        if (!this.bn.guided()) this.bn.done.P7 = true;
        this.bn.done.P8 = true; this.bn.done.P9 = true; this.bn.renderSide();
      }

      // 图像法对比区
      var chBox = h('div.ana-block', h('h3', '图像法对比分析'));
      var sw = h('div.side-row',
        h('button.chip' + (st.graphMode === 'halfv2' ? '.on' : ''), { type: 'button', onclick: function () { st.graphMode = 'halfv2'; self.renderOut(); } }, '½v² - h 图像（斜率 = g）'),
        h('button.chip' + (st.graphMode === 'v2' ? '.on' : ''), { type: 'button', onclick: function () { st.graphMode = 'v2'; self.renderOut(); } }, 'v² - h 图像（斜率 = 2g）'));
      chBox.appendChild(sw); out.appendChild(chBox);
      var isV2 = st.graphMode === 'v2', mult = isV2 ? 2 : 1;
      var pts = res.rows.map(function (r) { return [r.h, isV2 ? r.v2 : r.halfV2]; });
      var maxH = Math.max(0.1, res.rows[res.rows.length - 1].h * 1.15);
      var maxY = Math.max(1, P.G * mult * maxH * 1.12);
      var yLbl = (st.nonzero ? (isV2 ? 'Δv²' : '½Δv²') : (isV2 ? 'v²' : '½v²')) + ' / (m²·s⁻²)';
      var ch = new ML.Chart(chBox, { xLabel: (st.nonzero ? 'Δh' : 'h') + ' / m', yLabel: yLbl, height: 260, paper: true, x: [0, maxH], y: [0, maxY] });
      var fitRes = isV2 ? res.fitV2 : res.fitHalf;
      var series = [
        { pts: pts, fit: true, color: '#1661FF', label: '实测拟合 斜率 k = ' + fitRes.k.toFixed(3) + ' m/s²' },
        { pts: [], line: [[0, 0], [maxH, P.G * mult * maxH]], color: '#25A870', dash: true, label: '当地参考 y = ' + (P.G * mult).toFixed(2) + '·h' }
      ];
      if (st.useTapeA) {
        series.push({ pts: [], line: [[0, 0], [maxH, res.aTape * mult * maxH]], color: '#C7374B', dash: true, label: '错误参考 y = ' + (res.aTape * mult).toFixed(2) + '·h (纸带 a)' });
      }
      ch.set(series);
      var wantK = P.G * mult, kDev = (fitRes.k - wantK) / wantK;
      chBox.appendChild(h('div.cmp-note', { html: '拟合直线斜率 k = <b>' + fitRes.k.toFixed(3) + '</b> m/s²（理论 ' + wantK.toFixed(2) + ' m/s²，相对偏差 ' + (kDev * 100).toFixed(2) + '%）。' +
        (this.tape.bob === 'wood' ? '木块阻力占比大，图线明显落在参考虚线下方！' : Math.abs(kDev) < 0.05 ? '实测点与 y = ' + (isV2 ? '2g' : 'g') + 'h 虚线高度贴合，在误差允许范围内验证机械能守恒。' : '') }));
    }
  };

  /* =====================================================================
   *  ③ 诊·误差：四拍对比 & 结果反推适配器
   * ===================================================================== */
  function stripRow(area, label, cls, run, timer, extra) {
    var row = h('div.cmp-row', h('div.cmp-k.' + cls, label)); area.appendChild(row);
    var s = new TV.TapeStrip(row, { height: 86 });
    s.set(Object.assign({ dots: run.dots, timer: timer || 'em', blankText: '（纸带上没有点）' }, extra || {}));
    return s;
  }
  function fitStrips(strips, maxS) {
    return setTimeout(function () {
      strips.forEach(function (s) {
        if (!s || !s.stage || !s.stage.wrap || !s.stage.wrap.isConnected) return;
        s.scale = (Math.max(240, s.stage.w) - 40) / maxS;
        s.offset = -0.004;
        s.stage.invalidate();
      });
    }, 20);
  }
  function animStrips(strips, runs, done) {
    var t = 0, maxT = Math.max.apply(null, runs.map(function (r) { return r.tOff; }));
    var full = runs.map(function (r) { return r.dots; });
    if (ML.perf.reduced) { strips.forEach(function (s, i) { s.set({ dots: full[i] }); }); done(); return function () {}; }
    var stopped = false;
    var loop = new ML.stage.Loop(function (dt) {
      if (stopped || !strips[0] || !strips[0].stage || !strips[0].stage.wrap || !strips[0].stage.wrap.isConnected) return false;
      t += dt * 0.9;
      strips.forEach(function (s, i) { var r = runs[i]; s.set({ dots: full[i].filter(function (_, k) { return r.times[k] <= t; }) }); });
      if (t >= maxT) { strips.forEach(function (s, i) { s.set({ dots: full[i] }); }); done(); return false; }
      return true;
    });
    loop.start();
    return function () { stopped = true; loop.stop(); };
  }

  var adapter = {
    compare: function (err, area, done) {
      var cleanups = [], tids = [];
      function defer(fn, ms) {
        tids.push(setTimeout(function () { if (area && area.isConnected) fn(); }, ms));
      }
      var seed = 23, base = { mode: 'drop', bob: 'iron', timer: 'em', power: 'ac8', ideal: S.ideal, caught: true };
      if (err.id === 'E1') {
        var g1 = T.run(base, seed), b1 = T.run(Object.assign({}, base, { order: 'release-first', lag: 0.12 }), seed);
        var stG = firstMotionIndex(g1), stB = firstMotionIndex(b1);
        var s1 = stripRow(area, '先通电后释放', 'good', g1, 'em'), s2 = stripRow(area, '先释放后通电', 'bad', b1, 'em');
        tids.push(fitStrips([s1, s2], 0.25));
        cleanups.push(animStrips([s1, s2], [g1, b1], function () {
          if (!area || !area.isConnected) return;
          s1.set({ marks: [{ from: g1.dots[stG], to: g1.dots[stG + 1], color: '#25A870', text: 'Δs₁₂=' + mmStr(g1.dots[stG + 1] - g1.dots[stG]) + 'mm' }] });
          s2.set({ marks: [{ from: b1.dots[stB], to: b1.dots[stB + 1], color: '#C7374B', text: 'Δs₁₂=' + mmStr(b1.dots[stB + 1] - b1.dots[stB]) + 'mm ≫ 2mm' }] });
          var eg = computeEnergy(g1, { startIdx: stG, ideal: S.ideal }), eb = computeEnergy(b1, { startIdx: stB, ideal: S.ideal });
          var rG = eg.rows[Math.min(5, eg.rows.length - 1)], rB = eb.rows[Math.min(5, eb.rows.length - 1)];
          area.appendChild(h('table.dt.cmp-table',
            h('tr', h('th', '对比项'), h('th', '先通电后释放'), h('th.bad', '先释放后通电（误把首点当 v₀=0）')),
            h('tr', h('th', '第 1、2 点间距'), h('td', mmStr(eg.d12) + ' mm ≈ 2 mm'), h('td', mmStr(eb.d12) + ' mm ≫ 2 mm')),
            h('tr', h('th', '示例点：gh vs ½v²'), h('td', rG.ep.toFixed(3) + ' vs ' + rG.ek.toFixed(3)), h('td', { html: rB.ep.toFixed(3) + ' vs <b style="color:#C7374B">' + rB.ek.toFixed(3) + '（ΔEₖ > ΔEₚ！）</b>' }))));
          done();
        }));
      } else if (err.id === 'E2') {
        var rFe = T.run(Object.assign({}, base, { ideal: false }), seed);
        var rWd = T.run(Object.assign({}, base, { bob: 'wood', ideal: false }), seed);
        var eFe = computeEnergy(rFe, { ideal: S.ideal }), eWd = computeEnergy(rWd, { ideal: S.ideal });
        var ch = new ML.Chart(area, { xLabel: 'h / m', yLabel: '½v² / (m²·s⁻²)', height: 220, x: [0, 0.65], y: [0, 6.5] });
        ch.set([
          { pts: eFe.rows.map(function (r) { return [r.h, r.halfV2]; }), fit: true, color: '#25A870', label: '铁锤 300g（斜率 ' + eFe.fitHalf.k.toFixed(2) + '）' },
          { pts: eWd.rows.map(function (r) { return [r.h, r.halfV2]; }), fit: true, color: '#C7374B', mark: 'x', label: '木块 40g（斜率 ' + eWd.fitHalf.k.toFixed(2) + '）' },
          { pts: [], line: [[0, 0], [0.65, P.G * 0.65]], color: '#10233F', dash: true, label: '理论 y = 9.80·h' }
        ]);
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '重物'), h('th', '质量'), h('th', '下落 a / (m·s⁻²)'), h('th', '拟合斜率 k'), h('th', '相对损耗')),
          h('tr', h('td', '重铁锤'), h('td', '300 g'), h('td', rFe.a.toFixed(3)), h('td', eFe.fitHalf.k.toFixed(3)), h('td', ((1 - eFe.fitHalf.k / P.G) * 100).toFixed(2) + '%')),
          h('tr.hl', h('td', '木块'), h('td', '40 g'), h('td', rWd.a.toFixed(3)), h('td', eWd.fitHalf.k.toFixed(3)), h('td', ((1 - eWd.fitHalf.k / P.G) * 100).toFixed(2) + '%'))));
        defer(done, 250);
      } else if (err.id === 'E3') {
        var rW = T.run(Object.assign({}, base, { bob: 'wood', ideal: false }), seed);
        var em = computeEnergy(rW, { speedMethod: 'mid', ideal: true });
        var es = computeEnergy(rW, { speedMethod: 'sqrt2gh', ideal: true });
        var egT = computeEnergy(rW, { speedMethod: 'gt', ideal: true });
        var rows = em.rows.slice(2, 7).map(function (r, idx) {
          var rs = es.rows[idx + 2], rg = egT.rows[idx + 2];
          return h('tr', h('td', cmStr(r.h)), h('td', r.ep.toFixed(3)),
            h('td', r.ek.toFixed(3) + '（误差 ' + (r.eta * 100).toFixed(1) + '%）'),
            h('td', { style: { color: '#C7374B', fontWeight: '700' } }, rs.ek.toFixed(3) + '（' + (rs.eta * 100).toFixed(2) + '%）'),
            h('td', { style: { color: '#C7374B', fontWeight: '700' } }, rg.ek.toFixed(3) + '（偏高 +' + (rg.eta * 100).toFixed(1) + '%）'));
        });
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', 'h / cm'), h('th', 'gh / (m²·s⁻²)'), h('th', '正确 ½v² (中间时刻)'), h('th.bad', '错用 v=√(2gh)'), h('th.bad', '错用 v=gt')), rows));
        area.appendChild(h('div.cmp-note', '同一条损失约 20% 的木块纸带：只有中间时刻公式真实揭示了约 20% 的能量损耗；用 v = √(2gh) 会得出 0.00% 假守恒，而用 v = gt（按自由落体时间 t 算）则算得 ½(gt)² 虚高反超 gh（偏高 > 20%）——两者都预设了 a = g，丧失检验意义！'));
        defer(done, 250);
      } else if (err.id === 'E4') {
        var rW4 = T.run(Object.assign({}, base, { bob: 'wood', ideal: false }), seed);
        var eLoc = computeEnergy(rW4, { useTapeA: false, ideal: true });
        var eSelf = computeEnergy(rW4, { useTapeA: true, ideal: true });
        var ch4 = new ML.Chart(area, { xLabel: 'h / m', yLabel: '½v² / (m²·s⁻²)', height: 220, x: [0, 0.65], y: [0, 6.5] });
        ch4.set([
          { pts: eLoc.rows.map(function (r) { return [r.h, r.halfV2]; }), color: '#1661FF', label: '纸带实测点' },
          { pts: [], line: [[0, 0], [0.65, P.G * 0.65]], color: '#25A870', dash: true, label: '当地 g = 9.80（真实偏差 > 20%）' },
          { pts: [], line: [[0, 0], [0.65, eSelf.aTape * 0.65]], color: '#C7374B', dash: true, label: '纸带 a = ' + eSelf.aTape.toFixed(2) + '（恒等式重合！）' }
        ]);
        var pL = eLoc.rows[eLoc.rows.length - 2], pS = eSelf.rows[eSelf.rows.length - 2];
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '计算方式'), h('th', '势能减少 gh / ah'), h('th', '动能增加 ½v²'), h('th', '偏差 η')),
          h('tr', h('td', '代入当地 g = 9.80 m/s²'), h('td', pL.ep.toFixed(4)), h('td', pL.ek.toFixed(4)), h('td', (pL.eta * 100).toFixed(2) + '%（真实暴露阻力损耗）')),
          h('tr.hl', h('td', '错用纸带 a = ' + eSelf.aTape.toFixed(3)), h('td', pS.ep.toFixed(4)), h('td', pS.ek.toFixed(4)), h('td', (pS.eta * 100).toFixed(2) + '%（恒等式假象）'))));
        defer(done, 250);
      } else if (err.id === 'E5') {
        var rN = T.run(base, seed), rF = T.run(Object.assign({}, base, { startAt: 0.28, near: false }), seed);
        var sN = stripRow(area, '靠近计时器', 'good', rN, 'em'), sF = stripRow(area, '远离计时器', 'bad', rF, 'em');
        tids.push(fitStrips([sN, sF], 0.72));
        cleanups.push(animStrips([sN, sF], [rN, rF], function () {
          if (!area || !area.isConnected) return;
          var eN = computeEnergy(rN, { ideal: S.ideal }), eF = computeEnergy(rF, { ideal: S.ideal });
          area.appendChild(h('div.cmp-note', '有效落体点：靠近计时器可测 ' + (eN.rows.length + 2) + ' 个点（最大下落高度 ' + cmStr(eN.rows[eN.rows.length - 1].h) + ' cm）；远离计时器仅剩 ' + (eF.rows.length + 2) + ' 个点（最大 ' + cmStr(eF.rows[eF.rows.length - 1].h) + ' cm）。'));
          done();
        }));
      } else if (err.id === 'E6') {
        var r6 = T.run(Object.assign({}, base, { ideal: false }), seed);
        var e6 = computeEnergy(r6, { ideal: S.ideal });
        var pt6 = e6.rows[e6.rows.length - 2];
        var ms = [0.100, 0.200, 0.300].map(function (mKg) {
          return h('tr', h('td', Math.round(mKg * 1000) + ' g'), h('td', (mKg * pt6.ep).toFixed(4) + ' J'), h('td', (mKg * pt6.ek).toFixed(4) + ' J'), h('td', (pt6.eta * 100).toFixed(2) + '%'));
        });
        area.appendChild(h('table.dt.cmp-table', h('tr', h('th', '代入质量 m'), h('th', '重力势能减少 mgh'), h('th', '动能增加 ½mv²'), h('th', '相对误差 η')), ms));
        area.appendChild(h('div.cmp-note', '同一条纸带在 h = ' + cmStr(pt6.h) + ' cm 处：无论代入 100 g、200 g 还是 300 g，mgh 与 ½mv² 同比例变化，相对误差 η 恒为 ' + (pt6.eta * 100).toFixed(2) + '%——因此实验不需要用天平测质量。'));
        defer(done, 250);
      }
      return function () {
        tids.forEach(function (tid) { clearTimeout(tid); });
        cleanups.forEach(function (fn) { fn(); });
      };
    },
    show: function (c, vis) {
      var sh = c.show, seed = 31, base = { mode: 'drop', bob: 'iron', timer: 'em', power: 'ac8', ideal: false, caught: true };
      if (sh.type === 'e1') {
        var r1 = T.run(Object.assign({}, base, { order: 'release-first', lag: 0.12 }), seed);
        var s1 = stripRow(vis, '异常纸带', 'bad', r1, 'em', { marks: [{ from: r1.dots[0], to: r1.dots[1], color: '#C7374B', text: 'Δs₁₂=' + mmStr(r1.dots[1] - r1.dots[0]) + 'mm ≫ 2mm' }] });
        fitStrips([s1], 0.25);
        var e1 = computeEnergy(r1, { startIdx: 0, ideal: true });
        vis.appendChild(h('div.cmp-note', '按点 0 为静止起点计算：在 h = ' + cmStr(e1.rows[4].h) + ' cm 处，gh = ' + e1.rows[4].ep.toFixed(3) + ' m²/s²，而 ½v² = ' + e1.rows[4].ek.toFixed(3) + ' m²/s²（ΔEₖ > ΔEₚ）！'));
      } else if (sh.type === 'e4') {
        vis.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '采用 g 值'), h('th', '重力势能减小量'), h('th', '动能增加量'), h('th', '表面对比')),
          h('tr.hl', h('td', '纸带算出 g′ = 9.77 m/s²'), h('td', '5.09m'), h('td', '5.08m'), h('td', '差 0.2%（误导）')),
          h('tr', h('td', '当地真实 g = 9.80 m/s²'), h('td', '5.10m'), h('td', '5.08m'), h('td', '反映真实阻力损失'))));
      } else if (sh.type === 'e2') {
        var rFe = T.run(base, seed), rWd = T.run(Object.assign({}, base, { bob: 'wood' }), seed);
        var eFe = computeEnergy(rFe, {}), eWd = computeEnergy(rWd, {});
        var ch = new ML.Chart(vis, { xLabel: 'h / m', yLabel: '½v² / (m²·s⁻²)', height: 210, paper: true, x: [0, 0.65], y: [0, 6.5] });
        ch.set([
          { pts: eFe.rows.map(function (r) { return [r.h, r.halfV2]; }), color: '#25A870', label: '铁锤（略低于理论线）' },
          { pts: eWd.rows.map(function (r) { return [r.h, r.halfV2]; }), color: '#C7374B', mark: 'x', label: '木块（明显低于理论线）' },
          { pts: [], line: [[0, 0], [0.65, P.G * 0.65]], color: '#10233F', dash: true, label: '理论 y = g·h' }
        ]);
      } else if (sh.type === 'v2h') {
        var r4 = T.run(base, seed), e4 = computeEnergy(r4, {}), revMode = 'v2';
        var sw4 = h('div.side-row',
          h('button.chip.on', { type: 'button', onclick: function () { setMode4('v2', 0); } }, 'v² - h（斜率 = 2g）'),
          h('button.chip', { type: 'button', onclick: function () { setMode4('halfv2', 1); } }, '½v² - h（斜率 = g）'),
          h('button.link.sm', { type: 'button', onclick: function () {
            shell.go('bench'); bench.setMode('free', true); bench.setApparatus('timer');
            var tp4 = { no: ++bench.tapeSeq, run: r4, timer: 'em', bob: 'iron', tags: [], threaded: true };
            bench.tapes.push(tp4); if (bench.tapes.length > 3) bench.tapes.shift();
            ana.show(tp4, bench, { noScroll: true }); ana.st.graphMode = 'v2'; ana.update();
            bench.setBanner('<b>复现：v² - h 与 ½v² - h 图像斜率对照</b>　下方已切换到 v² - h 视图，可切换对比斜率 2g 与 g。');
          } }, '去实验台切换图像模式 →'));
        vis.appendChild(sw4);
        var ch4 = new ML.Chart(vis, { xLabel: 'h / m', yLabel: 'v² / (m²·s⁻²)', height: 210, paper: true, x: [0, 0.65], y: [0, 13.0] });
        function setMode4(m, idx) {
          revMode = m;
          ML.$$('.chip', sw4).forEach(function (b, i) { b.classList.toggle('on', i === idx); });
          var isV2 = revMode === 'v2', kMul = isV2 ? 2 : 1;
          ch4.opts.yLabel = isV2 ? 'v² / (m²·s⁻²)' : '½v² / (m²·s⁻²)';
          ch4.opts.y = [0, 6.5 * kMul];
          ch4.set([{ pts: e4.rows.map(function (r) { return [r.h, isV2 ? r.v2 : r.halfV2]; }), fit: true, color: '#1661FF', label: (isV2 ? 'v² - h' : '½v² - h') + '（k ≈ ' + (isV2 ? e4.fitV2.k : e4.fitHalf.k).toFixed(2) + ' m/s²）' }]);
        }
        setMode4('v2', 0);
      }
    },
    restore: function () {
      if (!bench) { S.mode = 'guided'; ML.store.save(); return; }
      bench.loop.stop();
      bench.setMode('guided');
      bench.setApparatus('timer');
      bench.b.bob = 'iron'; bench.b.startAt = 0;
      bench.syncBobChips(); bench.setBanner(null);
      bench.stage.invalidate(); bench.renderSide();
    },
    replay: function (errId) {
      var e = ERR[errId]; if (!e) return;
      shell.go('bench');
      bench.loop.stop();
      bench.setMode('free', true);
      bench.setApparatus('timer');
      if (errId === 'E3' || errId === 'E4' || errId === 'E6') {
        var bobType = e.config.bob || (errId === 'E6' ? 'iron' : 'wood');
        var rr = T.run({ mode: 'drop', bob: bobType, timer: 'em', power: 'ac8', ideal: false, caught: true }, (seedCounter += 7));
        var tp = { no: ++bench.tapeSeq, run: rr, timer: 'em', bob: bobType, tags: [], threaded: true };
        bench.tapes.push(tp); if (bench.tapes.length > 3) bench.tapes.shift();
        ana.show(tp, bench, { noScroll: true });
        if (errId === 'E3') ana.st.speedMethod = 'sqrt2gh';
        if (errId === 'E4') ana.st.useTapeA = true;
        if (errId === 'E6') ana.st.showMass = true;
        ana.update();
        bench.setBanner('<b>复现：' + e.name + '</b>　已在下方纸带分析区预设对应选项，可一键切换对比正常算法。');
        setTimeout(function () { bench.analysis.scrollIntoView({ behavior: ML.perf.low ? 'auto' : 'smooth', block: 'start' }); }, 40);
        return;
      }
      bench.b.timer = 'em'; bench.b.power = 'ac8'; bench.b.threaded = true;
      bench.b.bob = e.config.bob || 'iron';
      bench.b.startAt = e.config.near === false ? 0.28 : 0;
      bench.syncBobChips(); bench.check(true); bench.stage.invalidate();
      if (errId === 'E1') {
        bench.releaseLateDemo();
        bench.setBanner('<b>复现：' + e.name + '</b>　已演示先释放 0.12 s 后补通电源，下落完成后点“关电源，取下纸带”查看 Δs₁₂ 与 ΔEₖ > ΔEₚ。');
      } else {
        bench.setBanner('<b>复现：' + e.name + '</b>　' + e.trigger + '。请接通电源并释放纸带运行。');
      }
      if (shell.main) shell.main.scrollTop = 0;
    }
  };
  function openTry(id) { var e = ERR[id]; if (e) ML.TryIt(e, adapter, e.noteId && PROC[e.noteId] ? '<b>' + PROC[e.noteId].title + '：</b>' + PROC[e.noteId].how + ' ' + PROC[e.noteId].why : ''); }

  /* =====================================================================
   *  ① 学·原理：页面小部件
   * ===================================================================== */
  function learnWidget(p, card) {
    var box = h('div.learn-widget'); card.appendChild(box);
    if (p.widget === 'mass-cancel') {
      var massG = 300, hCm = 40;
      var swM = h('div.side-row', h('span.side-l', '重物质量 m'), [100, 200, 300].map(function (m) {
        return h('button.chip' + (m === massG ? '.on' : ''), { type: 'button', data: { m: String(m) }, onclick: function () { massG = m; paint(); } }, m + ' g');
      }));
      var swH = h('div.side-row', h('span.side-l', '下落高度 h'), [20, 40, 60].map(function (hc) {
        return h('button.chip' + (hc === hCm ? '.on' : ''), { type: 'button', data: { hc: String(hc) }, onclick: function () { hCm = hc; paint(); } }, hc + ' cm');
      }));
      var tblBox = h('div');
      box.appendChild(swM); box.appendChild(swH); box.appendChild(tblBox);
      function paint() {
        ML.$$('.chip', swM).forEach(function (c) { c.classList.toggle('on', c.dataset.m === String(massG)); });
        ML.$$('.chip', swH).forEach(function (c) { c.classList.toggle('on', c.dataset.hc === String(hCm)); });
        var aIron = T.accel({ mode: 'drop', bob: 'iron', timer: 'em', ideal: S.ideal });
        var mKg = massG / 1000, hm = hCm / 100, v2 = 2 * aIron * hm;
        var ep = mKg * P.G * hm, ek = 0.5 * mKg * v2, gh = P.G * hm, hv2 = 0.5 * v2;
        ML.clear(tblBox);
        tblBox.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '比较方式'), h('th', '重力势能减少量'), h('th', '动能增加量'), h('th', '相对偏差')),
          h('tr', h('td', '带质量 m = ' + massG + ' g'), h('td', ep.toFixed(4) + ' J'), h('td', ek.toFixed(4) + ' J'), h('td', ((ep - ek) / ep * 100).toFixed(2) + '%')),
          h('tr', h('td', '约去 m（mgh = ½mv² → gh = ½v²）'), h('td', gh.toFixed(4) + ' m²/s²'), h('td', hv2.toFixed(4) + ' m²/s²'), h('td', { style: { fontWeight: '700', color: '#17784F' } }, ((gh - hv2) / gh * 100).toFixed(2) + '%（完全一致）'))));
      }
      paint();
    } else if (p.widget === 'bob-compare') {
      var timerType = 'em';
      var swT = h('div.side-row', h('span.side-l', '计时器'),
        h('button.chip.on', { type: 'button', data: { t: 'em' }, onclick: function () { timerType = 'em'; paintBob(); } }, '电磁打点计时器'),
        h('button.chip', { type: 'button', data: { t: 'spark' }, onclick: function () { timerType = 'spark'; paintBob(); } }, '电火花计时器'));
      var stgWrap = h('div.widget-stage'), cap = h('div.cmp-note');
      box.appendChild(swT); box.appendChild(stgWrap); box.appendChild(cap);
      var stg = new ML.stage.Stage(stgWrap, { layers: ['bg'] });
      stg.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var keys = ['iron', 'al', 'wood'], colW = (w - 40) / 3;
        keys.forEach(function (k, idx) {
          var b = BOB_INFO[k], a = T.accel({ mode: 'drop', bob: k, timer: timerType, ideal: false });
          var loss = (1 - a / P.G) * 100, cx = 20 + colW * (idx + 0.5);
          ctx.fillStyle = D.grad(ctx, cx - 18, 22, cx + 18, 56, [b.c1, b.c2]);
          var bw = k === 'wood' ? 42 : 28, bh = k === 'wood' ? 38 : 30;
          D.rr(ctx, cx - bw / 2, 18, bw, bh, 4); ctx.fill(); ctx.strokeStyle = '#4A5B73'; ctx.stroke();
          D.text(ctx, b.name + ' ' + b.massG + 'g', cx, 72, { align: 'center', size: 12, weight: 700 });
          D.text(ctx, 'a = ' + a.toFixed(2) + ' m/s²', cx, 90, { align: 'center', size: 11.5, color: '#4A5B73' });
          // 能量保留条
          var barW = Math.min(110, colW - 28), bx = cx - barW / 2;
          ctx.fillStyle = '#DCE5F0'; ctx.fillRect(bx, 102, barW, 14);
          ctx.fillStyle = loss < 2 ? '#25A870' : loss < 10 ? '#E69B2D' : '#C7374B';
          ctx.fillRect(bx, 102, barW * (a / P.G), 14);
          D.text(ctx, '能量损耗 ' + loss.toFixed(1) + '%', cx, 134, { align: 'center', size: 12, weight: 700, color: loss < 2 ? '#17784F' : loss < 10 ? '#9A5A00' : '#C7374B' });
          D.text(ctx, loss < 2 ? '✓ 推荐选用' : loss < 10 ? '偏差较大' : '✕ 阻力太大', cx, 154, { align: 'center', size: 11.5, weight: 600, color: loss < 2 ? '#17784F' : '#C7374B' });
        });
      });
      function paintBob() {
        ML.$$('.chip', swT).forEach(function (c) { c.classList.toggle('on', c.dataset.t === timerType); });
        cap.textContent = timerType === 'em' ? '电磁计时器纸带摩擦约 0.035 N：300 g 铁锤损耗仅 1.9%，而 40 g 木块损耗高达 20.4%！'
          : '电火花计时器脉冲放电无振针摩擦，纸带阻力降至约 0.008 N，配合重铁锤损耗不到 1%。';
        stg.invalidate('bg');
      }
      paintBob();
    } else if (p.widget === 'twomm-demo') {
      var mode2 = 'good';
      var sw2 = h('div.side-row',
        h('button.chip.on', { type: 'button', data: { m: 'good' }, onclick: function () { mode2 = 'good'; paint2(); } }, '先通电后释放（≈ 2 mm）'),
        h('button.chip', { type: 'button', data: { m: 'bad' }, onclick: function () { mode2 = 'bad'; paint2(); } }, '先释放后通电（≫ 2 mm）'));
      var stripBox = h('div'), note2 = h('div.cmp-note');
      box.appendChild(sw2); box.appendChild(stripBox); box.appendChild(note2);
      var strip2 = new TV.TapeStrip(stripBox, { height: 100 });
      function paint2() {
        ML.$$('.chip', sw2).forEach(function (c) { c.classList.toggle('on', c.dataset.m === mode2); });
        var r = mode2 === 'good'
          ? T.run({ mode: 'drop', bob: 'iron', ideal: true, order: 'power-first', lag: 0.40 }, 3)
          : T.run({ mode: 'drop', bob: 'iron', ideal: true, order: 'release-first', lag: 0.12 }, 3);
        var st = firstMotionIndex(r), d12 = (r.dots[st + 1] - r.dots[st]) * 1000;
        var cnt = [st, st + 1, st + 2, st + 3, st + 4].filter(function (i) { return i < r.dots.length; });
        strip2.set({ dots: r.dots, timer: 'em', count: cnt, labels: ['0', '1', '2', '3', '4'], ruler: true,
          marks: [{ from: r.dots[st], to: r.dots[st + 1], color: mode2 === 'good' ? '#25A870' : '#C7374B', text: 'Δs₁₂=' + d12.toFixed(2) + 'mm' }] });
        setTimeout(function () { if (stripBox.isConnected) strip2.zoomTo(4500, r.dots[Math.min(r.dots.length - 1, st + 3)]); }, 20);
        note2.innerHTML = mode2 === 'good'
          ? '第 0、1 点间距 <b>' + d12.toFixed(2) + ' mm</b>（理论 ½gT² = 1.96 mm ≈ 2 mm），可放心以点 0 为静止起点。'
          : '先释放 0.12 s 后才通电，首两点间距已达 <b>' + d12.toFixed(1) + ' mm ≫ 2 mm</b>！打第 0 点时已有初速度，不能按静止起点算 mgh = ½mv²。';
      }
      paint2();
    } else if (p.widget === 'speed-redline') {
      var meth = 'mid', rW = T.run({ mode: 'drop', bob: 'wood', ideal: false }, 15);
      var swR = h('div.side-row', h('span.side-l', '速度公式'),
        h('button.chip.on', { type: 'button', data: { m: 'mid' }, onclick: function () { meth = 'mid'; paintR(); } }, '正确：中间时刻 (hₙ₊₁−hₙ₋₁)/2T'),
        h('button.chip', { type: 'button', data: { m: 'sqrt2gh' }, onclick: function () { meth = 'sqrt2gh'; paintR(); } }, '严禁：v = √(2gh)'),
        h('button.chip', { type: 'button', data: { m: 'gt' }, onclick: function () { meth = 'gt'; paintR(); } }, '严禁：v = gt'));
      var outR = h('div'); box.appendChild(swR); box.appendChild(outR);
      function paintR() {
        ML.$$('.chip', swR).forEach(function (c) { c.classList.toggle('on', c.dataset.m === meth); });
        var e = computeEnergy(rW, { speedMethod: meth, ideal: true });
        ML.clear(outR);
        outR.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '点 n'), h('th', 'h / cm'), h('th', 'v / (m·s⁻¹)'), h('th', 'gh'), h('th', '½v²'), h('th', '显示误差 η')),
          e.rows.slice(3, 7).map(function (r) {
            return h('tr' + (meth !== 'mid' ? '.hl' : ''), h('td', String(r.n)), h('td', cmStr(r.h)), h('td', r.v.toFixed(3)), h('td', r.ep.toFixed(3)), h('td', r.ek.toFixed(3)), h('td', (r.eta * 100).toFixed(2) + '%'));
          })));
        outR.appendChild(h('div.cmp-note', meth === 'mid' ? '（以高阻力木块纸带为例）中间时刻公式真实检出约 20% 能量损耗。'
          : (meth === 'sqrt2gh' ? '⚠ 改用 v = √(2gh) 会得到 0.00% 假守恒——根本检验不出约 20% 的木块阻力损耗！'
            : '⚠ 改用 v = gt 按自由落体时间算速度已预设加速度为 g（无阻力时假归零，有阻力时 ½(gt)² 反超 gh），同样丧失检验意义！')));
      }
      paintR();
    } else if (p.widget === 'graph-modes') {
      var gm = 'halfv2', rG = T.run({ mode: 'drop', bob: 'iron', ideal: false }, 19), eG = computeEnergy(rG, { ideal: true });
      var swG = h('div.side-row',
        h('button.chip.on', { type: 'button', data: { g: 'halfv2' }, onclick: function () { gm = 'halfv2'; paintG(); } }, '½v² - h 图像（斜率 = g）'),
        h('button.chip', { type: 'button', data: { g: 'v2' }, onclick: function () { gm = 'v2'; paintG(); } }, 'v² - h 图像（斜率 = 2g）'));
      box.appendChild(swG);
      var chG = new ML.Chart(box, { xLabel: 'h / m', yLabel: '½v² / (m²·s⁻²)', height: 220, paper: true, x: [0, 0.65], y: [0, 6.5] });
      var capG = h('div.cmp-note'); box.appendChild(capG);
      function paintG() {
        ML.$$('.chip', swG).forEach(function (c) { c.classList.toggle('on', c.dataset.g === gm); });
        var isV2 = gm === 'v2', mul = isV2 ? 2 : 1;
        chG.opts.yLabel = isV2 ? 'v² / (m²·s⁻²)' : '½v² / (m²·s⁻²)';
        chG.opts.y = [0, 6.5 * mul];
        chG.set([
          { pts: eG.rows.map(function (r) { return [r.h, isV2 ? r.v2 : r.halfV2]; }), fit: true, color: '#1661FF', label: '实测拟合（斜率 ' + (isV2 ? eG.fitV2.k : eG.fitHalf.k).toFixed(2) + '）' },
          { pts: [], line: [[0, 0], [0.65, P.G * mul * 0.65]], color: '#25A870', dash: true, label: '理论参考 y = ' + (P.G * mul).toFixed(1) + 'h' }
        ]);
        capG.textContent = isV2 ? 'v² = 2gh → v² - h 图斜率理论值为 2g = 19.60 m/s²（常见真题考法）。'
          : '½v² = gh → ½v² - h 图斜率理论值为 g = 9.80 m/s²。';
      }
      paintG();
    } else if (p.widget === 'logic-trap') {
      var trapMode = 'local', rT = T.run({ mode: 'drop', bob: 'wood', ideal: false }, 27);
      var eL = computeEnergy(rT, { useTapeA: false, ideal: true }), eS = computeEnergy(rT, { useTapeA: true, ideal: true });
      var swL = h('div.side-row',
        h('button.chip.on', { type: 'button', data: { t: 'local' }, onclick: function () { trapMode = 'local'; paintL(); } }, '正确：代入当地 g = 9.80 m/s²'),
        h('button.chip', { type: 'button', data: { t: 'self' }, onclick: function () { trapMode = 'self'; paintL(); } }, '逻辑错误：代入纸带算出的 a = ' + eS.aTape.toFixed(2) + ' m/s²'));
      box.appendChild(swL);
      var chL = new ML.Chart(box, { xLabel: 'h / m', yLabel: '½v² / (m²·s⁻²)', height: 210, paper: true, x: [0, 0.65], y: [0, 6.5] });
      var noteL = h('div.cmp-note'); box.appendChild(noteL);
      function paintL() {
        ML.$$('.chip', swL).forEach(function (c) { c.classList.toggle('on', c.dataset.t === trapMode); });
        var cur = trapMode === 'local' ? eL : eS;
        var pt = cur.rows[cur.rows.length - 2];
        chL.set([
          { pts: cur.rows.map(function (r) { return [r.h, r.halfV2]; }), color: '#1661FF', label: '纸带实测点' },
          { pts: [], line: [[0, 0], [0.65, cur.gUsed * 0.65]], color: trapMode === 'local' ? '#25A870' : '#C7374B', dash: true, label: trapMode === 'local' ? '当地 y = 9.80·h' : '纸带 y = ' + cur.gUsed.toFixed(2) + '·h' }
        ]);
        noteL.innerHTML = trapMode === 'local'
          ? '代入当地 g = 9.80 m/s²：在 h = ' + cmStr(pt.h) + ' cm 处，gh = ' + pt.ep.toFixed(3) + '，½v² = ' + pt.ek.toFixed(3) + '，偏差 <b>' + (pt.eta * 100).toFixed(1) + '%</b>，一眼看出损耗太大、不守恒！'
          : '错用纸带自身的 a = ' + cur.gUsed.toFixed(2) + ' m/s²：a·h = ' + pt.ep.toFixed(3) + '，½v² = ' + pt.ek.toFixed(3) + '，偏差仅 <b>' + (pt.eta * 100).toFixed(2) + '%</b>——恒等式把 20% 的机械能损耗完全掩盖了！';
      }
      paintL();
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
        var wrap = h('div.diag'); el.appendChild(wrap);
        wrap.appendChild(h('h2.diag-h', 'A. 错误操作实验室'));
        wrap.appendChild(h('p.muted', '每个“试一试”按四拍进行：布置 → 运行 → 对比 → 追问与揭示。所有结果均由物理模型实时算出。'));
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
          var n = ML.$('.err-name', card); if (n && n.textContent.indexOf('✓ ') !== 0) n.textContent = '✓ ' + n.textContent;
        });
        wrap.appendChild(grid);
        wrap.appendChild(h('h2.diag-h', 'B. 结果反推'));
        wrap.appendChild(h('p.muted', '先由异常数据或图像诊断错误原因，再去实验台亲手复现。'));
        var rev = h('div.rev'); wrap.appendChild(rev);
        ML.Reverse(rev, C.reverse, adapter);
      } },
      { id: 'paper', label: '练·真题', mount: function (el) { new ML.Paper(el, Q, { title: C.title.replace('实验：', '') + ' · 练习', onReplay: adapter.replay }); } }
    ]
  });
  ML.bus.on('tab', function (tabId) {
    if (bench && bench.loop) bench.loop.setVisible(tabId === 'bench');
  });
  shell.go(S.tab);
  ML.perf.probe();
  ML.m07 = { bench: function () { return bench; }, ana: ana, adapter: adapter, shell: shell, computeEnergy: computeEnergy, runAirGate: runAirGate };
})(window.ML);
