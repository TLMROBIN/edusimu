/* M04 scene — 探究平抛运动的特点：物理引擎（Node/浏览器通用）、双实验台、数据分析、学原理部件、四拍诊断与反推。 */
(function (ML) {
  'use strict';
  var P = ML.phys;
  var G_DEF = P.G || 9.80;
  var BALL_R = 0.015; // 小钢球半径 1.50 cm

  function integrateTrail(vx0, vy0, g, drag, maxT, maxY) {
    var dt = 1 / 480, t = 0, x = 0, y = 0, vx = vx0, vy = vy0;
    var pts = [{ t: 0, x: 0, y: 0, vx: vx, vy: vy }];
    while (t < maxT && y <= maxY + 0.05) {
      var spd = Math.hypot(vx, vy);
      var ax = -drag * spd * vx;
      var ay = g - drag * spd * vy;
      var vxMid = vx + 0.5 * ax * dt, vyMid = vy + 0.5 * ay * dt;
      var spdMid = Math.hypot(vxMid, vyMid);
      var axMid = -drag * spdMid * vxMid, ayMid = g - drag * spdMid * vyMid;
      x += vxMid * dt; y += vyMid * dt;
      vx += axMid * dt; vy += ayMid * dt;
      t += dt;
      pts.push({ t: t, x: x, y: y, vx: vx, vy: vy });
    }
    return pts;
  }

  function interpTrail(pts, key, val, fromIdx) {
    var i0 = fromIdx || 0;
    for (var i = Math.max(1, i0); i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      if ((a[key] <= val && b[key] >= val) || (a[key] >= val && b[key] <= val)) {
        var den = b[key] - a[key];
        var f = Math.abs(den) < 1e-12 ? 0 : (val - a[key]) / den;
        return {
          t: a.t + f * (b.t - a.t),
          x: a.x + f * (b.x - a.x),
          y: a.y + f * (b.y - a.y),
          vx: a.vx + f * (b.vx - a.vx),
          vy: a.vy + f * (b.vy - a.vy)
        };
      }
    }
    var last = pts[pts.length - 1];
    return { t: last.t, x: last.x, y: last.y, vx: last.vx, vy: last.vy };
  }

  /* ---------- 装置 A：平抛与自由落体对比仪 ---------- */
  function simulateAB(params, seed) {
    params = params || {};
    var g = params.g || G_DEF;
    var H = P.clamp(params.H != null ? params.H : 0.80, 0.30, 1.80);
    var v0 = P.clamp(params.v0 != null ? params.v0 : 1.80, 0.50, 3.50);
    var tiltDeg = P.clamp(params.tiltDeg != null ? params.tiltDeg : 0, -10, 10);
    var ideal = !!params.ideal;
    var rng = P.rng(seed || 17);
    var rad = tiltDeg * Math.PI / 180;
    var vx0 = v0 * Math.cos(rad), vy0 = -v0 * Math.sin(rad); // 向下为正
    var jitA = ideal ? 0 : P.clamp(rng.gauss(0.0005), -0.0012, 0.0012);

    var tB, tA, xLand, atFn;
    if (ideal) {
      tB = Math.sqrt(2 * H / g);
      tA = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * g * H)) / g;
      xLand = vx0 * tA;
      atFn = function (t) {
        var ta = Math.min(Math.max(0, t), tA);
        var tb = Math.min(Math.max(0, t), tB);
        return {
          xA: vx0 * ta,
          yA: t >= tA ? H : vy0 * ta + 0.5 * g * ta * ta,
          yB: t >= tB ? H : 0.5 * g * tb * tb,
          hitA: t >= tA,
          hitB: t >= tB
        };
      };
    } else {
      var drag = 0.012;
      var maxT = Math.sqrt(2 * H / g) + 0.35;
      var trA = integrateTrail(vx0, vy0, g, drag, maxT, H);
      var trB = integrateTrail(0, 0, g, drag, maxT, H);
      var startIdxA = 1;
      for (var k = 1; k < trA.length; k++) { if (trA[k].vy > 0) { startIdxA = k; break; } }
      var landA = interpTrail(trA, 'y', H, startIdxA);
      var landB = interpTrail(trB, 'y', H, 1);
      tA = Math.max(0.05, landA.t + jitA);
      tB = landB.t;
      xLand = landA.x;
      atFn = function (t) {
        var tEffA = Math.max(0, t - jitA);
        var pA = t >= tA ? landA : interpTrail(trA, 't', tEffA, 1);
        var pB = t >= tB ? landB : interpTrail(trB, 't', Math.max(0, t), 1);
        return {
          xA: pA.x,
          yA: t >= tA ? H : pA.y,
          yB: t >= tB ? H : pB.y,
          hitA: t >= tA,
          hitB: t >= tB
        };
      };
    }

    function pulseWave(t, t0) {
      var d = t - t0;
      if (d < -0.001 || d > 0.022) return 0;
      if (d < 0) return Math.exp(-d * d / 2e-7) * 0.25;
      return Math.exp(-d / 0.0045) * Math.sin(2 * Math.PI * 320 * d);
    }

    return {
      H: H, v0: v0, tiltDeg: tiltDeg, g: g, ideal: ideal,
      vx0: vx0, vy0: vy0, tA: tA, tB: tB, deltaT: tA - tB, xLand: xLand,
      at: atFn,
      pulseA: function (t) { return pulseWave(t, tA); },
      pulseB: function (t) { return pulseWave(t, tB); },
      pulseSum: function (t) { return 0.55 * pulseWave(t, tA) + 0.55 * pulseWave(t, tB); }
    };
  }

  /* ---------- 装置 B：斜槽描迹与频闪照相 ---------- */
  function chuteV0(params, rng) {
    params = params || {};
    var g = params.g || G_DEF;
    var hDrop = params.randomHeight ? (0.10 + rng() * 0.20) : P.clamp(params.hDrop != null ? params.hDrop : 0.18, 0.06, 0.35);
    var eta = params.chuteRough ? 0.72 : 0.85;
    var vBase = eta * Math.sqrt(2 * g * hDrop);
    var v0 = params.ideal ? vBase : vBase * (1 + P.clamp(rng.gauss(0.003), -0.008, 0.008));
    return { v0: v0, hDrop: hDrop, eta: eta };
  }

  function launchChute(params, seed) {
    params = params || {};
    var g = params.g || G_DEF;
    var R = params.R != null ? params.R : BALL_R;
    var ideal = !!params.ideal;
    var tiltDeg = P.clamp(params.tiltDeg != null ? params.tiltDeg : 0, -10, 10);
    var plumbCalibrated = params.plumbCalibrated !== false;
    var boardTiltDeg = plumbCalibrated ? 0 : (params.boardTiltDeg != null ? params.boardTiltDeg : 6);
    var originMode = params.originMode === 'rim' ? 'rim' : 'center';
    var rng = P.rng(seed || 29);

    var ch = chuteV0(params, rng);
    var v0 = ch.v0;
    var rad = tiltDeg * Math.PI / 180;
    var vx0 = v0 * Math.cos(rad), vy0 = -v0 * Math.sin(rad);
    var phi = boardTiltDeg * Math.PI / 180;
    var cosP = Math.cos(phi), sinP = Math.sin(phi);
    var offsetY = originMode === 'rim' ? -R : 0;

    var maxY = 0.52, maxT = 0.45;
    var trail = ideal ? null : integrateTrail(vx0, vy0, g, plumbCalibrated ? 0.010 : 0.095, maxT, maxY);

    function worldAtT(t) {
      if (ideal) {
        return { t: t, x: vx0 * t, y: vy0 * t + 0.5 * g * t * t, vx: vx0, vy: vy0 + g * t };
      }
      return interpTrail(trail, 't', t, 1);
    }

    function toPaper(xw, yw, addNoise) {
      var xp = xw * cosP + yw * sinP;
      var y0 = -xw * sinP + yw * cosP;
      if (addNoise && !ideal) {
        xp += rng.gauss(0.00035);
        y0 += rng.gauss(0.00035);
      }
      return { x: xp, y0: y0, y: y0 + offsetY };
    }

    function hitAtPlateY(plateY) {
      var targetY = P.clamp(plateY, 0.015, 0.46);
      var tHit, wPt;
      if (ideal) {
        var disc = vy0 * vy0 + 2 * g * targetY;
        if (disc < 0) return { valid: false };
        tHit = (-vy0 + Math.sqrt(disc)) / g;
        wPt = worldAtT(tHit);
      } else {
        var startIdx = 1;
        for (var k = 1; k < trail.length; k++) { if (trail[k].vy >= 0) { startIdx = k; break; } }
        wPt = interpTrail(trail, 'y', targetY, startIdx);
        tHit = wPt.t;
      }
      var pPt = toPaper(wPt.x, wPt.y, true);
      return {
        valid: true, t: tHit,
        xTrue: wPt.x, yTrue: wPt.y,
        x: pPt.x, y0: pPt.y0, y: pPt.y
      };
    }

    function strobePoints(T, yLim) {
      var step = T || 0.05, limit = yLim || 0.44, out = [];
      for (var k = 0; k <= 20; k++) {
        var t = k * step;
        var wPt = worldAtT(t);
        if (wPt.y > limit) break;
        var pPt = toPaper(wPt.x, wPt.y, k > 0);
        out.push({ idx: k, t: t, xTrue: wPt.x, yTrue: wPt.y, x: pPt.x, y0: pPt.y0, y: pPt.y });
      }
      return out;
    }

    return {
      v0: v0, hDrop: ch.hDrop, eta: ch.eta, tiltDeg: tiltDeg,
      plumbCalibrated: plumbCalibrated, boardTiltDeg: boardTiltDeg,
      originMode: originMode, R: R, g: g, ideal: ideal,
      vx0: vx0, vy0: vy0,
      worldAtT: worldAtT,
      toPaper: toPaper,
      hitAtPlateY: hitAtPlateY,
      strobePoints: strobePoints
    };
  }

  /* ---------- 数据处理：有抛出点（y-x²）与无抛出点（Δy=gT²） ---------- */
  function analyzeOriginPts(pts, g) {
    g = g || G_DEF;
    var xs2 = [], ys = [], singles = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (p.x <= 0.015) continue;
      xs2.push(p.x * p.x);
      ys.push(p.y);
      if (p.y > 0.004) singles.push(p.x * Math.sqrt(g / (2 * p.y)));
    }
    var fit = P.linfit(xs2, ys);
    var v0Fit = fit.k > 0 ? Math.sqrt(g / (2 * fit.k)) : NaN;
    return {
      fit: fit,
      v0Fit: v0Fit,
      v0SinglePts: singles,
      v0SingleMean: singles.length ? P.mean(singles) : NaN
    };
  }

  function analyzeThreePts(pA, pB, pC, g, assumeZeroV0) {
    g = g || G_DEF;
    var dx = 0.5 * ((pB.x - pA.x) + (pC.x - pB.x));
    var yAB = pB.y - pA.y, yBC = pC.y - pB.y;
    var dy = yBC - yAB;
    var T = dy > 0 ? Math.sqrt(dy / g) : NaN;
    var v0 = isFinite(T) && T > 0 ? dx / T : NaN;
    var vBy = isFinite(T) && T > 0 ? (yAB + yBC) / (2 * T) : NaN;
    var vB = isFinite(v0) && isFinite(vBy) ? Math.hypot(v0, vBy) : NaN;

    var Twrong = yAB > 0 ? Math.sqrt(2 * yAB / g) : NaN;
    var v0Wrong = isFinite(Twrong) && Twrong > 0 ? dx / Twrong : NaN;
    var vByWrong = isFinite(Twrong) ? g * Twrong : NaN;

    return {
      dx: dx, yAB: yAB, yBC: yBC, dy: dy,
      ratioBC_AB: yAB > 0 ? yBC / yAB : NaN,
      T: T, v0: v0, vBy: vBy, vB: vB,
      assumeZeroV0: !!assumeZeroV0,
      Twrong: Twrong, v0Wrong: v0Wrong, vByWrong: vByWrong
    };
  }

  function yxLine(pts, g) {
    g = g || G_DEF;
    var xs = [], yxs = [];
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].x > 0.01) { xs.push(pts[i].x); yxs.push(pts[i].y / pts[i].x); }
    }
    var fit = P.linfit(xs, yxs);
    var k = fit.k, b = fit.b;
    return {
      fit: fit, k: k, b: b,
      x0: k ? -b / (2 * k) : NaN,
      y0: k ? -(b * b) / (4 * k) : NaN,
      v0: k > 0 ? Math.sqrt(g / (2 * k)) : NaN
    };
  }

  ML.proj = {
    G: G_DEF,
    BALL_R: BALL_R,
    simulateAB: simulateAB,
    chuteV0: chuteV0,
    launchChute: launchChute,
    analyzeOriginPts: analyzeOriginPts,
    analyzeThreePts: analyzeThreePts,
    yxLine: yxLine
  };
})(typeof window !== 'undefined' ? (window.ML = window.ML || {}) : (globalThis.ML = globalThis.ML || {}));

/* =========================================================================
 *  浏览器交互界面（Node 校验不执行此部分）
 * ========================================================================= */
(function (ML) {
  'use strict';
  if (typeof document === 'undefined') return;

  var h = ML.h, M = ML.math, P = ML.phys, PR = ML.proj, D = ML.stage.draw;
  var C = ML.json('ml-content'), Q = ML.json('ml-questions') || [];
  var S = ML.store.init('mech-lab-m04', {
    v: 1, tab: 'learn', learnPage: 0, mode: 'guided', ideal: false, app: 'A', answers: {}, done: {}
  });
  var ERR = {}; C.errors.forEach(function (e) { ERR[e.id] = e; });
  var PROC = {}; C.procedure.forEach(function (p) { PROC[p.id] = p; });
  var seedCounter = 31;

  function cm(m) { return (m * 100).toFixed(2); }
  function sub(n) { return String(n).replace(/\d/g, function (d) { return '₀₁₂₃₄₅₆₇₈₉'[d]; }); }

  /* ---------- 共用绘图辅助 ---------- */
  function drawBall(ctx, x, y, r, c1, c2) {
    r = Math.max(1, r);
    ctx.fillStyle = D.grad(ctx, x - r * 0.5, y - r * 0.6, x + r * 0.8, y + r * 0.8, [c1, c2]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.32, Math.max(0.5, r * 0.25), 0, Math.PI * 2); ctx.fill();
  }

  function drawSoundStrip(ctx, x, y, w, hh, sim, tNow, title, tRange) {
    if (w < 96 || hh < 36) return;
    ctx.fillStyle = '#0F1C2E'; D.rr(ctx, x, y, w, hh, 10); ctx.fill();
    ctx.strokeStyle = '#29405E'; ctx.stroke();
    var padL = 72, padR = 16, gw = w - padL - padR, midY = y + hh * 0.56;
    var tMax = tRange ? tRange[1] : (sim ? Math.max(sim.tA, sim.tB) + 0.05 : 0.48);
    var tMin = tRange ? tRange[0] : Math.max(0, tMax - 0.14);
    var mapX = function (t) { return x + padL + ((t - tMin) / (tMax - tMin)) * gw; };
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + padL, midY); ctx.lineTo(x + w - padR, midY); ctx.stroke();
    D.text(ctx, title || '声音双脉冲', x + 10, y + 18, { size: 11.5, weight: 700, color: '#9FB3CC' });
    if (!sim) {
      D.text(ctx, '点击“用小锤击打”采集 A/B 球落地声波', x + padL + gw / 2, midY + 4, { align: 'center', size: 12, color: '#7D92AC' });
      return;
    }
    var nStep = Math.max(80, Math.round(gw * 0.7));
    function plotPulse(fn, col, lw) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      for (var i = 0; i <= nStep; i++) {
        var tt = tMin + (i / nStep) * (tMax - tMin);
        var amp = tt <= tNow ? fn(tt) : 0;
        var px = x + padL + (i / nStep) * gw, py = midY - amp * (hh * 0.34);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    plotPulse(sim.pulseB, 'rgba(37,168,112,0.55)', 1.4);
    plotPulse(sim.pulseA, 'rgba(22,97,255,0.65)', 1.4);
    plotPulse(sim.pulseSum, '#FFFFFF', 1.8);
    if (tNow >= Math.min(sim.tA, sim.tB)) {
      var xB = mapX(sim.tB), xA = mapX(sim.tA);
      ctx.strokeStyle = '#25A870'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xB, y + 24); ctx.lineTo(xB, y + hh - 8); ctx.stroke();
      ctx.strokeStyle = '#5CA0FF'; ctx.beginPath(); ctx.moveTo(xA, y + 24); ctx.lineTo(xA, y + hh - 8); ctx.stroke(); ctx.setLineDash([]);
      D.text(ctx, 'B', xB - 8, y + 34, { align: 'center', size: 11, weight: 700, color: '#7CF0B4' });
      D.text(ctx, 'A', xA + (Math.abs(xA - xB) < 12 ? 9 : 8), y + 34, { align: 'center', size: 11, weight: 700, color: '#84B5FF' });
    }
    var bothDone = tNow >= Math.max(sim.tA, sim.tB);
    var dtMs = (sim.deltaT * 1000);
    var badge = !bothDone ? '下落采集中…' : (Math.abs(dtMs) < 5 ? '两峰重合 · 听到一声响（Δt = ' + dtMs.toFixed(1) + ' ms）' : '两峰分离 · 先后落地（tA − tB = ' + (dtMs > 0 ? '+' : '') + dtMs.toFixed(1) + ' ms）');
    D.text(ctx, badge, x + w - 12, y + 18, { align: 'right', size: 11.5, weight: 700, color: !bothDone ? '#F3D3A1' : (Math.abs(dtMs) < 5 ? '#7CF0B4' : '#FF8A9B') });
    D.text(ctx, 't / ms', x + 10, midY + 14, { size: 10.5, color: '#7D92AC' });
  }

  /* =====================================================================
   *  ② 做·实验台
   * ===================================================================== */
  var bench = null;
  function Bench(el) {
    var self = this; this.el = el;
    this.mode = S.mode || 'guided';
    this.app = S.app || 'A';
    this.speed = 0.5;
    this.levelTest = null;

    this.stA = { H: 0.80, v0: 1.80, tiltDeg: 0, running: false, done: false, t: 0, sim: null };
    this.stB = {
      subMode: 'catcher', // 'catcher' | 'strobe'
      tiltDeg: 0,
      hDrop: 0.18,
      randomHeight: false,
      chuteRough: false,
      plumbCalibrated: true,
      originMode: 'center',
      plateY: 0.14,
      dots: [],
      strobePts: null,
      strobeT: 0.05,
      ball: null, // 动画状态
      analyzed: false,
      assumeZeroV0: false
    };
    this.doneA = {};
    this.doneB = {};

    var modeChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'guided' }, onclick: function () { self.setMode('guided'); } }, '引导模式'),
      h('button.chip', { type: 'button', data: { v: 'free' }, onclick: function () { self.setMode('free'); } }, '自由模式'));
    this.modeChips = modeChips;

    this.appChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'A' }, onclick: function () { self.setApp('A'); } }, '装置 A：平抛与自由落体'),
      h('button.chip', { type: 'button', data: { v: 'B' }, onclick: function () { self.setApp('B'); } }, '装置 B：斜槽描迹与频闪'));

    this.idealChip = h('button.chip', {
      type: 'button', title: '理想条件：无空气阻力与读数噪声',
      onclick: function () {
        S.ideal = !S.ideal; ML.store.save();
        self.idealChip.classList.toggle('on', S.ideal);
        self.idealChip.textContent = S.ideal ? '理想条件' : '真实条件';
        self.stage.invalidate();
      }
    }, S.ideal ? '理想条件' : '真实条件');
    this.idealChip.classList.toggle('on', S.ideal);

    this.speedChip = h('button.chip', {
      type: 'button',
      onclick: function () {
        self.speed = self.speed === 1 ? 0.5 : self.speed === 0.5 ? 0.25 : 1;
        self.speedChip.textContent = '播放 ×' + self.speed;
      }
    }, '播放 ×0.5');

    this.bannerEl = h('div.bench-banner', { hidden: true });
    var topBar = h('div.bench-top', modeChips, this.appChips, h('div.spacer'), this.idealChip, this.speedChip);
    this.stageWrap = h('div.bench-stage');
    this.side = h('aside.bench-side');
    this.analysis = h('section.analysis', { hidden: true });
    this.benchEl = h('div.bench', topBar, this.bannerEl, h('div.bench-row', this.stageWrap, this.side), this.analysis);
    el.appendChild(this.benchEl);

    this.stage = new ML.stage.Stage(this.stageWrap, { layers: ['bg', 'fg'] });
    this.stage.on('bg', function (ctx, w, hh) { self.drawBg(ctx, w, hh); });
    this.stage.on('fg', function (ctx, w, hh) { self.drawFg(ctx, w, hh); });
    this.mag = new ML.stage.Magnifier(this.stageWrap, { zoom: 3, size: 136 });
    this.loop = new ML.stage.Loop(function (dt) { return self.tick(dt); });
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

  Bench.prototype.setMode = function (m, silent) {
    this.mode = m; S.mode = m; ML.store.save();
    ML.$$('.chip', this.modeChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === m); });
    if (!silent) {
      this.setBanner(null);
      ML.toast(m === 'guided' ? '引导模式：按规范步骤完成，误操作会提示原因' : '自由模式：不拦截任何操作，结果按物理真实呈现');
    }
    this.renderSide();
  };

  Bench.prototype.setApp = function (a, silent) {
    this.app = a; S.app = a; ML.store.save();
    ML.$$('.chip', this.appChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === a); });
    this.loop.stop();
    this.stA.running = false;
    this.stB.ball = null;
    this.levelTest = null;
    if (!silent) this.setBanner(null);
    this.analysis.hidden = a !== 'B' || !this.stB.analyzed;
    this.stage.invalidate();
    this.renderSide();
  };

  /* ---------- 几何映射 ---------- */
  Bench.prototype.geoA = function (w, hh) {
    var waveH = 88, floorY = Math.max(80, hh - waveH - 22), topPad = 56;
    var ppm = Math.max(40, Math.min((floorY - topPad) / 1.50, (w - 140) / 1.45));
    var pivotX = Math.max(110, w * 0.24);
    var launchY = Math.max(topPad, floorY - this.stA.H * ppm);
    return { w: w, h: hh, waveH: waveH, floorY: floorY, ppm: ppm, pivotX: pivotX, launchY: launchY };
  };

  Bench.prototype.geoB = function (w, hh) {
    var chuteW = Math.min(200, w * 0.30);
    var ox = chuteW + 24;
    var ppm = Math.max(40, Math.min((w - ox - 30) / 0.58, (hh - 54) / 0.62));
    var oy = Math.max(26 + 0.14 * ppm, hh - 26 - 0.48 * ppm);
    return { w: w, h: hh, ox: ox, oy: oy, ppm: ppm, boardW: 0.56 * ppm, boardH: 0.48 * ppm };
  };

  /* ---------- 静态层 ---------- */
  Bench.prototype.drawBg = function (ctx, w, hh) {
    if (w < 80 || hh < 80) return;
    ctx.fillStyle = '#EAF1F8'; ctx.fillRect(0, 0, w, hh);
    if (this.app === 'A') {
      var g = this.geoA(w, hh);
      // 地面
      ctx.fillStyle = D.grad(ctx, 0, g.floorY, 0, g.floorY + 14, ['#D4DFEB', '#BCC9D8']);
      ctx.fillRect(20, g.floorY, w - 40, 10);
      ctx.strokeStyle = '#4A5B73'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(20, g.floorY); ctx.lineTo(w - 20, g.floorY); ctx.stroke();
      // 高度标尺
      var rx = 44;
      ctx.strokeStyle = '#6D7F96'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(rx, g.floorY); ctx.lineTo(rx, 24); ctx.stroke();
      for (var hm = 0.2; hm <= 1.51; hm += 0.2) {
        var yy = g.floorY - hm * g.ppm;
        if (yy < 26) break;
        ctx.beginPath(); ctx.moveTo(rx - 5, yy); ctx.lineTo(rx + 5, yy); ctx.stroke();
        D.text(ctx, hm.toFixed(1) + 'm', rx - 8, yy + 4, { align: 'right', size: 10.5, color: '#4A5B73' });
      }
      // 立柱
      ctx.fillStyle = D.grad(ctx, g.pivotX - 18, 0, g.pivotX - 10, 0, ['#8E99A6', '#596574']);
      ctx.fillRect(g.pivotX - 18, 28, 8, g.floorY - 28);
      ctx.fillStyle = '#596574'; D.rr(ctx, g.pivotX - 36, g.floorY - 8, 44, 8, 3); ctx.fill();
      return;
    }

    // 装置 B 静态层：底座 + 坐标纸背板 + 重锤线 + 固定斜槽
    var b = this.geoB(w, hh), sb = this.stB;
    var dark = sb.subMode === 'strobe';
    // 实验台底座
    ctx.fillStyle = D.grad(ctx, 0, hh - 18, 0, hh, ['#C9A97A', '#A88454']);
    ctx.fillRect(14, hh - 18, w - 28, 18);

    // 坐标纸背板（若未校准，围绕左上角旋转 6°）
    var phi = (sb.plumbCalibrated ? 0 : 6) * Math.PI / 180;
    ctx.save();
    ctx.translate(b.ox, b.oy);
    ctx.rotate(phi);
    ctx.fillStyle = dark ? '#10233F' : '#FFFFFF';
    D.rr(ctx, -10, -14, b.boardW + 24, b.boardH + 26, 6); ctx.fill();
    ctx.strokeStyle = dark ? '#2A4365' : '#9AA8B8'; ctx.lineWidth = 1.6; ctx.stroke();

    // 1 cm 细格 + 5 cm 粗格
    var step1 = 0.01 * b.ppm, maxCmX = 56, maxCmY = 48;
    for (var cxIdx = 0; cxIdx <= maxCmX; cxIdx++) {
      var posX = cxIdx * step1, majX = cxIdx % 5 === 0;
      ctx.strokeStyle = dark
        ? (majX ? 'rgba(132,181,255,0.28)' : 'rgba(132,181,255,0.10)')
        : (majX ? 'rgba(18,169,196,0.32)' : 'rgba(18,169,196,0.11)');
      ctx.lineWidth = majX ? 1 : 0.7;
      ctx.beginPath(); ctx.moveTo(posX, 0); ctx.lineTo(posX, b.boardH); ctx.stroke();
      if (majX && cxIdx > 0 && cxIdx <= 55) {
        D.text(ctx, String(cxIdx), posX, -4, { align: 'center', size: 10, color: dark ? '#9FB3CC' : '#4A5B73' });
      }
    }
    for (var cyIdx = 0; cyIdx <= maxCmY; cyIdx++) {
      var posY = cyIdx * step1, majY = cyIdx % 5 === 0;
      ctx.strokeStyle = dark
        ? (majY ? 'rgba(132,181,255,0.28)' : 'rgba(132,181,255,0.10)')
        : (majY ? 'rgba(18,169,196,0.32)' : 'rgba(18,169,196,0.11)');
      ctx.lineWidth = majY ? 1 : 0.7;
      ctx.beginPath(); ctx.moveTo(0, posY); ctx.lineTo(b.boardW, posY); ctx.stroke();
      if (majY && cyIdx > 0 && cyIdx <= 45) {
        D.text(ctx, String(cyIdx), -4, posY + 3, { align: 'right', size: 10, color: dark ? '#9FB3CC' : '#4A5B73' });
      }
    }
    // x / y 轴
    var oyOff = sb.originMode === 'rim' ? PR.BALL_R * b.ppm : 0;
    ctx.strokeStyle = dark ? '#7CF0B4' : '#10233F'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, oyOff); ctx.lineTo(b.boardW + 6, oyOff); ctx.moveTo(0, oyOff); ctx.lineTo(0, b.boardH + 6); ctx.stroke();
    D.text(ctx, 'x/cm', b.boardW + 6, oyOff + 14, { align: 'right', size: 11, weight: 700, color: dark ? '#7CF0B4' : '#10233F' });
    D.text(ctx, 'y/cm', 4, b.boardH + 10, { size: 11, weight: 700, color: dark ? '#7CF0B4' : '#10233F' });

    // 原点标注（O vs O'）
    var rPx = PR.BALL_R * b.ppm;
    ctx.strokeStyle = '#12A9C4'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, rPx, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = sb.originMode === 'center' ? '#1661FF' : '#C7374B';
    ctx.beginPath(); ctx.arc(0, oyOff, 4, 0, Math.PI * 2); ctx.fill();
    D.text(ctx, sb.originMode === 'center' ? 'O(球心)' : "O'(槽口偏R)", 8, oyOff - 4, {
      size: 11, weight: 700, color: sb.originMode === 'center' ? '#1661FF' : '#C7374B'
    });
    ctx.restore();

    // 斜槽支架与轨道（末端位置在 (b.ox, b.oy + rPx)）
    var exitX = b.ox, exitY = b.oy + rPx;
    var dropPx = sb.hDrop * b.ppm * 0.72;
    var slopeLen = Math.min(b.ox - 24, 150);
    var flatLen = 46;
    var startX = exitX - flatLen - slopeLen * 0.78;
    var startY = exitY - dropPx;
    ctx.fillStyle = '#596574';
    ctx.fillRect(exitX - flatLen - 8, exitY + 4, 10, hh - 18 - exitY - 4);
    ctx.fillRect(startX + 18, startY + 20, 8, hh - 18 - startY - 20);

    // 重锤线（始终真竖直向下）
    var plumbX = exitX + 2;
    ctx.strokeStyle = sb.plumbCalibrated ? '#25A870' : '#C7374B';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(plumbX, exitY + 4); ctx.lineTo(plumbX, b.oy + b.boardH - 8); ctx.stroke();
    ctx.fillStyle = sb.plumbCalibrated ? '#25A870' : '#C7374B';
    ctx.beginPath();
    ctx.moveTo(plumbX, b.oy + b.boardH + 4);
    ctx.lineTo(plumbX - 5, b.oy + b.boardH - 8);
    ctx.lineTo(plumbX + 5, b.oy + b.boardH - 8);
    ctx.closePath(); ctx.fill();
    D.text(ctx, sb.plumbCalibrated ? '重锤线(竖直)' : '背板与重锤线偏斜 6°!', plumbX + 8, b.oy + b.boardH - 12, {
      size: 11, weight: 700, color: sb.plumbCalibrated ? '#17784F' : '#C7374B'
    });

    // 斜槽轨道
    var tiltRad = -sb.tiltDeg * Math.PI / 180; // 正角度向上翘
    var endTipX = exitX, endTipY = exitY + Math.tan(tiltRad) * 28;
    ctx.strokeStyle = sb.chuteRough ? '#7A5C3E' : '#4A5B73';
    ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(exitX - flatLen, exitY);
    ctx.lineTo(endTipX, endTipY);
    ctx.stroke();
    ctx.strokeStyle = sb.chuteRough ? '#B8895A' : '#D5DCE3';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.lineCap = 'butt';

    // 定位挡片
    var dxS = (exitX - flatLen) - startX, dyS = exitY - startY;
    var norm = Math.hypot(dxS, dyS) || 1;
    var nx = -dyS / norm, ny = dxS / norm;
    var blkX = startX + 12 * (dxS / norm), blkY = startY + 12 * (dyS / norm);
    ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(blkX - nx * 10, blkY - ny * 10); ctx.lineTo(blkX + nx * 10, blkY + ny * 10); ctx.stroke();
    D.text(ctx, sb.randomHeight ? '随机释放高度' : '定位挡片(固定高度)', startX - 4, startY - 14, {
      size: 11, weight: 600, color: sb.randomHeight ? '#C7374B' : '#10233F'
    });
    if (sb.tiltDeg !== 0) {
      D.text(ctx, '末端' + (sb.tiltDeg > 0 ? '上翘 +' : '下倾 ') + sb.tiltDeg + '°', exitX - 18, exitY - 18, {
        align: 'right', size: 11.5, weight: 700, color: '#C7374B'
      });
    }
  };

  /* ---------- 动态层 ---------- */
  Bench.prototype.drawFg = function (ctx, w, hh) {
    this.hot = [];
    if (w < 80 || hh < 80) return;
    if (this.app === 'A') { this.drawFgA(ctx, w, hh); return; }
    this.drawFgB(ctx, w, hh);
  };

  Bench.prototype.drawFgA = function (ctx, w, hh) {
    var g = this.geoA(w, hh), sa = this.stA;
    var px = g.pivotX, ly = g.launchY, r = 11;
    // 支架平台
    ctx.fillStyle = D.grad(ctx, px - 42, ly, px + 36, ly + 10, ['#9AA8B8', '#6B7A8C']);
    D.rr(ctx, px - 42, ly + r, 78, 9, 3); ctx.fill();
    // 高度拖动把手（置于平台下方，避免遮挡 B 球标签）
    ctx.fillStyle = '#12A9C4';
    D.rr(ctx, px - 58, ly + 24, 24, 24, 6); ctx.fill();
    D.text(ctx, '↕', px - 46, ly + 41, { align: 'center', size: 13, color: '#fff', weight: 700 });
    this.hot.push({ id: 'handleH', x: px - 68, y: ly + 14, w: 46, h: 46, label: '调高度 H' });
    D.text(ctx, 'H = ' + sa.H.toFixed(2) + ' m', px - 64, ly + 40, { align: 'right', size: 12, weight: 700, color: '#10233F' });

    // 弹性金属片（倾斜显示）
    var plateAngle = (sa.running ? 0.14 : 0) + (-sa.tiltDeg * Math.PI / 180);
    ctx.save();
    ctx.translate(px + 6, ly - 24);
    ctx.rotate(plateAngle);
    ctx.fillStyle = sa.tiltDeg !== 0 ? '#C7374B' : '#3B4B60';
    ctx.fillRect(-2, 0, 5, 36);
    ctx.restore();

    // 小锤
    var hamRot = sa.running || sa.done ? 0.42 : -0.35;
    ctx.save();
    ctx.translate(px - 22, ly - 32);
    ctx.rotate(hamRot);
    ctx.strokeStyle = '#7A5C3E'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-22, -14); ctx.lineTo(8, 12); ctx.stroke();
    ctx.fillStyle = '#8E99A6'; D.rr(ctx, 4, 6, 12, 18, 2); ctx.fill();
    ctx.restore();
    this.hot.push({ id: 'hammer', x: px - 48, y: ly - 56, w: 72, h: 52, label: '用小锤击打' });

    // 轨迹虚线
    if (sa.sim) {
      ctx.strokeStyle = 'rgba(22,97,255,0.42)'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 4]);
      ctx.beginPath();
      var steps = 28;
      for (var i = 0; i <= steps; i++) {
        var tt = (i / steps) * Math.min(sa.t, sa.sim.tA);
        var pt = sa.sim.at(tt);
        var sx = px + 20 + pt.xA * g.ppm, sy = ly + pt.yA * g.ppm;
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(37,168,112,0.42)';
      ctx.beginPath(); ctx.moveTo(px - 8, ly); ctx.lineTo(px - 8, ly + (sa.sim.at(sa.t).yB) * g.ppm); ctx.stroke();
      ctx.setLineDash([]);
    }

    // B 球（绿：自由落体）与 A 球（蓝：平抛）
    var pos = sa.sim ? sa.sim.at(sa.t) : { xA: 0, yA: 0, yB: 0 };
    var bx = px - 8, by = Math.min(g.floorY - r, ly + pos.yB * g.ppm);
    var ax = px + 20 + pos.xA * g.ppm, ay = Math.min(g.floorY - r, ly + pos.yA * g.ppm);
    drawBall(ctx, bx, by, r, '#7CF0B4', '#17784F');
    drawBall(ctx, ax, ay, r, '#84B5FF', '#1661FF');
    D.text(ctx, 'B(自由)', bx - 14, by + 4, { align: 'right', size: 11.5, weight: 700, color: '#17784F' });
    D.text(ctx, 'A(平抛)', ax + 14, ay + 4, { size: 11.5, weight: 700, color: '#1661FF' });

    if (sa.tiltDeg !== 0) {
      D.text(ctx, '金属片末端' + (sa.tiltDeg > 0 ? '上翘 +' : '下倾 ') + sa.tiltDeg + '°', px + 34, ly - 24, {
        size: 12, weight: 700, color: '#C7374B'
      });
    }
    // 声音双脉冲条
    drawSoundStrip(ctx, 16, g.floorY + 14, w - 32, g.waveH - 8, sa.sim, sa.t);
  };

  Bench.prototype.drawFgB = function (ctx, w, hh) {
    var b = this.geoB(w, hh), sb = this.stB;
    var phi = (sb.plumbCalibrated ? 0 : 6) * Math.PI / 180;
    var dark = sb.subMode === 'strobe';
    var oyOff = sb.originMode === 'rim' ? PR.BALL_R * b.ppm : 0;

    // 在纸面上绘制记录点、平滑连线或频闪球影
    ctx.save();
    ctx.translate(b.ox, b.oy);
    ctx.rotate(phi);

    // 挡板描迹模式的点与连线
    if (sb.subMode === 'catcher') {
      if (sb.analyzed && sb.dots.length >= 2) {
        var an = PR.analyzeOriginPts(sb.dots, PR.G);
        if (isFinite(an.fit.k) && an.fit.k > 0) {
          ctx.strokeStyle = '#1661FF'; ctx.lineWidth = 2;
          ctx.beginPath();
          var started = false;
          for (var xm = 0; xm <= 0.56; xm += 0.01) {
            var ym = an.fit.k * xm * xm + an.fit.b;
            if (ym < -0.04 || ym > 0.48) continue;
            var px = xm * b.ppm, py = oyOff + ym * b.ppm;
            if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }
      for (var i = 0; i < sb.dots.length; i++) {
        var d = sb.dots[i], dx = d.x * b.ppm, dy = oyOff + d.y * b.ppm;
        ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.arc(dx, dy, 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
        D.text(ctx, String(i + 1), dx + 7, dy - 4, { size: 10.5, weight: 700, color: '#C7374B' });
      }
    } else if (sb.strobePts && sb.strobePts.length) {
      // 频闪球影
      var pts = sb.strobePts;
      for (i = 0; i < pts.length; i++) {
        var sp = pts[i], sx = sp.x * b.ppm, sy = oyOff + sp.y * b.ppm;
        ctx.strokeStyle = 'rgba(124,240,180,0.45)'; ctx.setLineDash([2, 2]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, sy); ctx.moveTo(0, sy); ctx.lineTo(sx, sy); ctx.stroke();
        ctx.setLineDash([]);
        drawBall(ctx, sx, sy, 6.5, '#FFFFFF', '#84B5FF');
        D.text(ctx, String(i), sx + 9, sy - 6, { size: 10.5, weight: 700, color: '#7CF0B4' });
      }
    }
    ctx.restore();

    // 水平接球挡板（可拖动）
    if (sb.subMode === 'catcher') {
      var pyPlate = b.oy + sb.plateY * b.ppm;
      ctx.fillStyle = D.grad(ctx, 0, pyPlate, 0, pyPlate + 10, ['#E6CBA2', '#B8915C']);
      D.rr(ctx, b.ox - 6, pyPlate, b.boardW + 16, 10, 3); ctx.fill();
      ctx.strokeStyle = '#7A5C3E'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#12A9C4'; D.rr(ctx, b.ox + b.boardW - 18, pyPlate - 7, 26, 24, 6); ctx.fill();
      D.text(ctx, '↕', b.ox + b.boardW - 5, pyPlate + 9, { align: 'center', size: 13, color: '#fff', weight: 700 });
      D.text(ctx, '挡板 y = ' + (sb.plateY * 100).toFixed(1) + ' cm', b.ox + b.boardW - 24, pyPlate + 22, {
        align: 'right', size: 11, weight: 700, color: '#0E8CA3'
      });
      this.hot.push({ id: 'plate', x: b.ox - 10, y: pyPlate - 18, w: b.boardW + 30, h: 46, label: '上下拖动挡板' });
    }

    // 正在运动的小钢球或轻放检验球
    var rExit = PR.BALL_R * b.ppm;
    var rBall = Math.max(6, rExit);
    var exitX = b.ox, exitY = b.oy + rExit;
    var dropPx = sb.hDrop * b.ppm * 0.72;
    var slopeLen = Math.min(b.ox - 24, 150), flatLen = 46;
    var startX = exitX - flatLen - slopeLen * 0.78, startY = exitY - dropPx;

    if (this.levelTest) {
      var lt = this.levelTest;
      var tiltRad = -sb.tiltDeg * Math.PI / 180;
      var lx = exitX - 18 + lt.s * Math.cos(tiltRad);
      var ly = exitY + (lx - (exitX - flatLen)) * Math.tan(tiltRad) - rBall;
      drawBall(ctx, lx, ly, rBall, '#F1F5F9', '#64748B');
      D.text(ctx, sb.tiltDeg === 0 ? '轻放静止 → 末端水平 ✓' : '小球滚落 → 末端不水平!', exitX + 16, exitY - 20, {
        size: 12, weight: 700, color: sb.tiltDeg === 0 ? '#17784F' : '#C7374B'
      });
    } else if (sb.ball) {
      var bl = sb.ball;
      if (bl.phase === 'chute') {
        var u = bl.u, bx0, by0;
        var tipRad = -sb.tiltDeg * Math.PI / 180;
        var tipY = exitY + Math.tan(tipRad) * 28;
        if (u < 0.72) {
          var f = u / 0.72;
          bx0 = startX + 16 + f * (exitX - flatLen - startX - 16);
          var fLine = (bx0 - startX) / Math.max(1, exitX - flatLen - startX);
          by0 = startY + fLine * (exitY - startY) - rBall;
        } else {
          var f2 = (u - 0.72) / 0.28;
          bx0 = exitX - flatLen + f2 * flatLen;
          var flatEndOff = (bx0 > exitX - 28 && sb.tiltDeg !== 0) ? ((bx0 - (exitX - 28)) / 28) * (tipY - exitY) : 0;
          by0 = exitY + flatEndOff - rBall;
        }
        drawBall(ctx, bx0, by0, rBall, '#F1F5F9', '#64748B');
      } else {
        var wPt = bl.launch.worldAtT(bl.t);
        drawBall(ctx, b.ox + wPt.x * b.ppm, b.oy + wPt.y * b.ppm, rBall, '#F1F5F9', '#64748B');
      }
    } else {
      // 静止在挡片处
      var restSlope = (18 / Math.max(1, exitX - flatLen - startX)) * (exitY - startY);
      drawBall(ctx, startX + 18, startY + restSlope - rBall, rBall, '#F1F5F9', '#64748B');
    }
    if (dark) {
      D.text(ctx, '频闪暗室（T = ' + (sb.strobeT * 1000).toFixed(0) + ' ms）', b.ox + b.boardW - 8, b.oy + b.boardH - 10, {
        align: 'right', size: 11.5, weight: 700, color: '#7CF0B4'
      });
    }
  };

  /* ---------- 指针交互 ---------- */
  Bench.prototype.bindPointer = function () {
    var self = this, dragId = null, y0 = 0, v0 = 0, magOn = false;
    function showMagAt(p) {
      var b = self.geoB(self.stage.w, self.stage.h), sb = self.stB;
      var phi = (sb.plumbCalibrated ? 0 : 6) * Math.PI / 180;
      var dx = p.x - b.ox, dy = p.y - b.oy;
      var xm = (dx * Math.cos(phi) + dy * Math.sin(phi)) / b.ppm;
      var ym = (-dx * Math.sin(phi) + dy * Math.cos(phi)) / b.ppm - (sb.originMode === 'rim' ? PR.BALL_R : 0);
      var cvs = [self.stage.layer('bg').canvas, self.stage.layer('fg').canvas];
      self.mag.show(cvs, p.x, p.y, self.stage.dpr, '(' + (xm * 100).toFixed(1) + ', ' + (ym * 100).toFixed(1) + ') cm');
    }
    ML.stage.pointer(this.stage.layer('fg').canvas, {
      down: function (p) {
        var hs = self.hot || [];
        dragId = null; magOn = false;
        for (var i = hs.length - 1; i >= 0; i--) {
          var r = hs[i];
          if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) { dragId = r.id; break; }
        }
        y0 = p.y;
        if (dragId === 'handleH') v0 = self.stA.H;
        else if (dragId === 'plate') v0 = self.stB.plateY;
      },
      move: function (p) {
        if (dragId === 'handleH' && !self.stA.running) {
          var g = self.geoA(self.stage.w, self.stage.h);
          self.stA.H = P.clamp(Math.round((v0 - (p.y - y0) / g.ppm) * 20) / 20, 0.40, 1.50);
          self.stA.done = false; self.stA.sim = null;
          self.stage.invalidate('fg'); self.renderSide();
        } else if (dragId === 'plate' && !(self.stB.ball)) {
          var b = self.geoB(self.stage.w, self.stage.h);
          self.stB.plateY = P.clamp(Math.round((v0 + (p.y - y0) / b.ppm) * 100) / 100, 0.04, 0.42);
          self.stage.invalidate('fg'); self.renderSide();
        } else if (magOn && self.app === 'B') {
          showMagAt(p);
        }
      },
      press: function (p) {
        if (self.app === 'B' && !dragId) {
          magOn = true;
          showMagAt(p);
        }
      },
      up: function (p, a) {
        magOn = false;
        self.mag.hide();
        if (!a.moved && dragId === 'hammer') self.fireA();
        dragId = null;
        void p;
      }
    });
  };

  /* ---------- 动作与动画 ---------- */
  Bench.prototype.fireA = function () {
    var sa = this.stA;
    if (sa.running) return;
    if (this.guided() && sa.tiltDeg !== 0) {
      this.block('弹性金属片末端必须保持水平（0°），否则 A 球做斜抛而不是平抛！', 'E1');
      return;
    }
    this.setBanner(null);
    sa.sim = PR.simulateAB({ H: sa.H, v0: sa.v0, tiltDeg: sa.tiltDeg, ideal: S.ideal }, (seedCounter += 7));
    sa.t = 0; sa.running = true; sa.done = false;
    this.loop.start();
    this.renderSide();
  };

  Bench.prototype.testLevel = function () {
    var sb = this.stB;
    if (sb.ball) return;
    this.levelTest = { t: 0, s: 0, done: false };
    this.loop.start();
    if (sb.tiltDeg === 0) {
      this.doneB.P1 = true;
      ML.toast('轻放检验：小球静止在斜槽末端，说明末端切线水平 ✓', 'ok');
    } else {
      ML.toast('轻放检验：小球沿倾斜末端滚出，请先调回 0° 水平！', 'warn');
    }
    this.renderSide();
  };

  Bench.prototype.checkGuidedB = function () {
    var sb = this.stB;
    if (sb.tiltDeg !== 0) { this.block('斜槽末端切线必须调至水平（0°）。', 'E1'); return false; }
    if (!sb.plumbCalibrated) { this.block('背板必须先用重锤线校准至竖直平面内。', 'E5'); return false; }
    if (sb.originMode === 'rim') { this.block('坐标原点应取小球出槽口时的球心投影 O（槽口正上方 R 处）。', 'E3'); return false; }
    if (sb.randomHeight) { this.block('每次必须从斜槽同一固定高度由静止释放小球。', 'E2'); return false; }
    return true;
  };

  Bench.prototype.fireB = function (instant) {
    var sb = this.stB;
    if (sb.ball) return;
    this.levelTest = null;
    if (this.guided() && !this.checkGuidedB()) return;
    this.setBanner(null);
    var launch = PR.launchChute({
      hDrop: sb.hDrop, tiltDeg: sb.tiltDeg, plumbCalibrated: sb.plumbCalibrated,
      originMode: sb.originMode, chuteRough: sb.chuteRough, randomHeight: sb.randomHeight, ideal: S.ideal
    }, (seedCounter += 11));

    if (sb.subMode === 'strobe') {
      var pts = launch.strobePoints(sb.strobeT, 0.46);
      if (instant) {
        sb.strobePts = pts; sb.analyzed = true;
        this.doneB.P5 = true; this.doneB.P6 = true; this.doneB.P8 = true;
        this.stage.invalidate('fg'); this.renderSide(); this.renderAnalysis();
        return;
      }
      sb.strobePts = [];
      sb.ball = { phase: 'chute', u: 0, t: 0, launch: launch, strobeAll: pts, endT: pts.length ? pts[pts.length - 1].t : 0.30 };
      this.loop.start();
      this.renderSide();
      return;
    }

    var hit = launch.hitAtPlateY(sb.plateY);
    if (!hit.valid) return;
    if (instant) {
      sb.dots.push(hit);
      this.afterDot();
      return;
    }
    sb.ball = { phase: 'chute', u: 0, t: 0, launch: launch, hit: hit };
    this.loop.start();
    this.renderSide();
  };

  Bench.prototype.fillFive = function () {
    var sb = this.stB;
    if (sb.ball) return;
    if (this.guided() && !this.checkGuidedB()) return;
    var heights = [0.05, 0.11, 0.18, 0.27, 0.37].filter(function (hh) {
      return sb.dots.every(function (d) { return Math.abs((d.y0 != null ? d.y0 : d.y) - hh) > 0.025; });
    });
    var need = Math.max(0, 5 - sb.dots.length);
    for (var i = 0; i < need && i < heights.length; i++) {
      sb.plateY = heights[i];
      this.fireB(true);
    }
    this.stage.invalidate('fg');
    this.renderSide();
    ML.toast('已记录 ' + sb.dots.length + ' 个轨迹印迹点，可点击“平滑连线与分析”', 'ok');
  };

  Bench.prototype.afterDot = function () {
    var sb = this.stB;
    if (sb.dots.length >= 5) this.doneB.P5 = true;
    this.doneB.P2 = sb.plumbCalibrated;
    this.doneB.P3 = sb.originMode === 'center';
    this.doneB.P4 = !sb.randomHeight;
    this.stage.invalidate('fg');
    this.renderSide();
  };

  Bench.prototype.tick = function (dt) {
    if (this.app === 'A') {
      var sa = this.stA;
      if (!sa.running || !sa.sim) return false;
      sa.t += dt * this.speed;
      var endT = Math.max(sa.sim.tA, sa.sim.tB) + 0.04;
      this.stage.invalidate('fg');
      if (sa.t >= endT) {
        sa.t = endT; sa.running = false; sa.done = true;
        this.doneA.PA1 = true;
        if (sa.v0 >= 2.2 || sa.v0 <= 1.2) this.doneA.PA2 = true;
        if (sa.H >= 1.0 || sa.H <= 0.6) this.doneA.PA3 = true;
        if (this.doneA.PA1 && this.doneA.PA2 && this.doneA.PA3 && Math.abs(sa.sim.deltaT) < 0.005) {
          this.doneA.PA4 = true;
        }
        this.renderSide();
        return false;
      }
      return true;
    }

    if (this.levelTest) {
      var lt = this.levelTest;
      lt.t += dt;
      if (this.stB.tiltDeg !== 0) lt.s += Math.sign(this.stB.tiltDeg) * (-1) * 40 * dt;
      this.stage.invalidate('fg');
      if (lt.t > 0.75) { lt.done = true; return false; }
      return true;
    }

    var sb = this.stB, bl = sb.ball;
    if (!bl) return false;
    var spd = this.speed;
    if (bl.phase === 'chute') {
      bl.u += dt * 1.9 * spd;
      if (bl.u >= 1) { bl.phase = 'air'; bl.t = 0; }
      this.stage.invalidate('fg');
      return true;
    }
    bl.t += dt * spd;
    if (sb.subMode === 'strobe' && bl.strobeAll) {
      var shown = [];
      for (var i = 0; i < bl.strobeAll.length; i++) {
        if (bl.strobeAll[i].t <= bl.t + 1e-6) shown.push(bl.strobeAll[i]);
      }
      sb.strobePts = shown;
      this.stage.invalidate('fg');
      if (bl.t >= bl.endT) {
        sb.strobePts = bl.strobeAll;
        sb.ball = null; sb.analyzed = true;
        this.doneB.P5 = true; this.doneB.P6 = true; this.doneB.P8 = true;
        this.renderSide(); this.renderAnalysis();
        return false;
      }
      return true;
    }
    this.stage.invalidate('fg');
    if (!bl.hit || bl.t >= bl.hit.t) {
      if (bl.hit) sb.dots.push(bl.hit);
      sb.ball = null;
      this.afterDot();
      return false;
    }
    return true;
  };

  /* ---------- 右侧操作面板 ---------- */
  Bench.prototype.renderSide = function () {
    var self = this, side = this.side; if (!side) return;
    ML.clear(side);
    if (this.app === 'A') { this.renderSideA(side); return; }
    this.renderSideB(side);
  };

  Bench.prototype.renderSideA = function (side) {
    var self = this, sa = this.stA;
    function row() { return h('div.side-row', Array.prototype.slice.call(arguments)); }
    function chip(label, on, fn) { return h('button.chip' + (on ? '.on' : ''), { type: 'button', disabled: sa.running, onclick: fn }, label); }
    var ctl = h('div.side-ctl');
    ctl.appendChild(h('div.side-k', '平抛竖落仪参数'));
    ctl.appendChild(row(h('span.side-l', '释放高度'),
      [0.60, 0.80, 1.20].map(function (H) {
        return chip(H.toFixed(2) + ' m', Math.abs(sa.H - H) < 0.02, function () { sa.H = H; sa.done = false; sa.sim = null; self.stage.invalidate('fg'); self.renderSide(); });
      })));
    ctl.appendChild(row(h('span.side-l', '击打力度'),
      [[1.20, '轻(1.2)'], [1.80, '中(1.8)'], [2.50, '强(2.5)']].map(function (it) {
        return chip(it[1], Math.abs(sa.v0 - it[0]) < 0.05, function () { sa.v0 = it[0]; sa.done = false; sa.sim = null; self.stage.invalidate('fg'); self.renderSide(); });
      })));
    ctl.appendChild(row(h('span.side-l', '金属片'),
      [[0, '水平 0°'], [5, '上翘 +5°'], [-5, '下倾 −5°']].map(function (it) {
        return chip(it[1], sa.tiltDeg === it[0], function () {
          if (self.guided() && it[0] !== 0) { self.block('弹性金属片末端必须保持水平，否则变成斜抛。', 'E1'); return; }
          sa.tiltDeg = it[0]; sa.done = false; sa.sim = null; self.setBanner(null); self.stage.invalidate('fg'); self.renderSide();
        });
      })));
    ctl.appendChild(h('div.side-acts',
      h('button.btn.primary', { type: 'button', disabled: sa.running, onclick: function () { self.fireA(); } }, '用小锤击打'),
      h('button.btn', { type: 'button', onclick: function () { self.loop.stop(); sa.running = false; sa.done = false; sa.t = 0; sa.sim = null; self.setBanner(null); self.stage.invalidate('fg'); self.renderSide(); } }, '重置双球')));
    if (sa.sim && sa.done) {
      var s = sa.sim;
      ctl.appendChild(h('div.m04-readout', {
        html: 't<sub>A</sub> = <b>' + s.tA.toFixed(4) + ' s</b>　｜　t<sub>B</sub> = <b>' + s.tB.toFixed(4) + ' s</b><br>' +
          '时间差 Δt = <b>' + (s.deltaT * 1000).toFixed(1) + ' ms</b>　｜　A 射程 x = ' + (s.xLand * 100).toFixed(1) + ' cm'
      }));
    }
    side.appendChild(ctl);
    if (this.guided()) {
      side.appendChild(h('div.side-k', '探究指引'));
      var tasks = [
        { id: 'PA1', t: '① 标准高度击打，观察是否同时落地', why: '保证 A、B 两球从同一高度同时开始运动，检验落地声是否重合。', err: 'E1' },
        { id: 'PA2', t: '② 改变击打力度（轻/强），再比一次', why: '改变 A 球水平初速度 v₀，检验飞行时间是否与水平初速度无关。' },
        { id: 'PA3', t: '③ 改变高度 H（如 1.20 m），再比一次', why: '改变下落高度 H，排除巧合，证实不同高度下两球仍同时落地。' },
        { id: 'PA4', t: '④ 总结：两球始终同时落地 ⇒ 竖直分运动为自由落体', why: '在任意 v₀ 和 H 下竖直下落时间均与自由落体相同，证明平抛竖直分运动是自由落体运动。' }
      ];
      side.appendChild(h('ol.steps', tasks.map(function (x) {
        var ok = !!self.doneA[x.id];
        return h('li' + (ok ? '.ok' : ''),
          h('div.st-t', (ok ? '✓ ' : '▸ ') + x.t),
          h('div.st-why', '理由：' + x.why),
          x.err ? h('button.link.sm', { type: 'button', onclick: function () { openTry(x.err); } }, '为什么？试一试 →') : null);
      })));
    } else {
      side.appendChild(h('div.side-tip', '自由模式：可把金属片调至“上翘 +5°”，观察声音双脉冲波形条如何从重合变成明显分离。'));
      if (sa.tiltDeg !== 0 || sa.done) {
        side.appendChild(h('div.ana-tags',
          h('span.muted', '现象诊断：'),
          h('button.tag.' + (sa.tiltDeg !== 0 ? 'warn' : 'info'), { type: 'button', onclick: function () { openTry('E1'); } },
            (sa.tiltDeg !== 0 ? '⚠ 金属片不水平斜抛 (E1) →' : 'ℹ 对比金属片上翘效果 (E1) →'))));
      }
    }
  };

  Bench.prototype.renderSideB = function (side) {
    var self = this, sb = this.stB, busy = !!sb.ball;
    function row() { return h('div.side-row', Array.prototype.slice.call(arguments)); }
    function chip(label, on, fn) { return h('button.chip' + (on ? '.on' : ''), { type: 'button', disabled: busy, onclick: fn }, label); }
    function clearRecorded() {
      sb.dots = []; sb.strobePts = null; sb.analyzed = false;
      self.analysis.hidden = true; ML.clear(self.analysis);
    }
    var ctl = h('div.side-ctl');
    ctl.appendChild(h('div.side-k', '斜槽与记录设置'));
    ctl.appendChild(row(h('span.side-l', '记录方式'),
      chip('挡板描迹', sb.subMode === 'catcher', function () {
        sb.subMode = 'catcher'; sb.analyzed = false;
        self.analysis.hidden = true; ML.clear(self.analysis);
        self.stage.invalidate(); self.renderSide();
      }),
      chip('频闪照相', sb.subMode === 'strobe', function () {
        sb.subMode = 'strobe'; sb.strobePts = null; sb.analyzed = false;
        self.analysis.hidden = true; ML.clear(self.analysis);
        self.stage.invalidate(); self.renderSide();
      })));
    ctl.appendChild(row(h('span.side-l', '斜槽末端'),
      chip('0°水平', sb.tiltDeg === 0, function () { sb.tiltDeg = 0; self.levelTest = null; clearRecorded(); self.setBanner(null); self.stage.invalidate(); self.renderSide(); }),
      chip('上翘+5°', sb.tiltDeg === 5, function () {
        if (self.guided()) { self.block('斜槽末端必须保持水平，不能上翘。', 'E1'); return; }
        sb.tiltDeg = 5; self.levelTest = null; clearRecorded(); self.stage.invalidate(); self.renderSide();
      }),
      chip('轻放检验', false, function () { self.testLevel(); })));
    ctl.appendChild(row(h('span.side-l', '释放高度'),
      chip('同一位置', !sb.randomHeight, function () { sb.randomHeight = false; clearRecorded(); self.stage.invalidate(); self.renderSide(); }),
      chip('随机高度', sb.randomHeight, function () {
        if (self.guided()) { self.block('每次应从斜槽同一位置由静止释放。', 'E2'); return; }
        sb.randomHeight = true; clearRecorded(); self.stage.invalidate(); self.renderSide();
      }),
      chip(sb.chuteRough ? '槽略粗糙' : '槽光滑', sb.chuteRough, function () {
        sb.chuteRough = !sb.chuteRough; clearRecorded(); self.stage.invalidate(); self.renderSide();
        ML.toast(sb.chuteRough ? '已切换为较粗糙斜槽（验证同一位置释放仍重合）' : '已切换为光滑斜槽', 'info');
      })));
    ctl.appendChild(row(h('span.side-l', '重锤原点'),
      chip(sb.plumbCalibrated ? '重锤竖直' : '偏斜6°', sb.plumbCalibrated, function () {
        if (self.guided() && sb.plumbCalibrated) { self.block('背板需用重锤线校准竖直。', 'E5'); return; }
        sb.plumbCalibrated = !sb.plumbCalibrated; clearRecorded(); self.stage.invalidate(); self.renderSide();
      }),
      chip(sb.originMode === 'center' ? '球心 O' : "槽口 O'", sb.originMode === 'center', function () {
        if (self.guided() && sb.originMode === 'center') { self.block('坐标原点应取槽口正上方 R 处的球心投影 O。', 'E3'); return; }
        sb.originMode = sb.originMode === 'center' ? 'rim' : 'center';
        var off = sb.originMode === 'rim' ? -PR.BALL_R : 0;
        sb.dots.forEach(function (d) { if (d.y0 != null) d.y = d.y0 + off; });
        if (sb.strobePts) sb.strobePts.forEach(function (d) { if (d.y0 != null) d.y = d.y0 + off; });
        self.stage.invalidate(); self.renderSide();
        if (sb.analyzed) self.renderAnalysis();
      })));
    if (sb.subMode === 'catcher') {
      ctl.appendChild(row(h('span.side-l', '挡板 y'),
        chip('↑ −3cm', false, function () { sb.plateY = P.clamp(sb.plateY - 0.03, 0.04, 0.42); self.stage.invalidate('fg'); self.renderSide(); }),
        h('b.side-v', (sb.plateY * 100).toFixed(0) + ' cm'),
        chip('↓ +3cm', false, function () { sb.plateY = P.clamp(sb.plateY + 0.03, 0.04, 0.42); self.stage.invalidate('fg'); self.renderSide(); }),
        h('span.muted', '已记 ' + sb.dots.length + ' 点')));
    }
    ctl.appendChild(h('div.side-acts',
      h('button.btn.primary', { type: 'button', disabled: busy, onclick: function () { self.fireB(false); } }, sb.subMode === 'strobe' ? '频闪发射' : '释放小球'),
      sb.subMode === 'catcher'
        ? h('button.btn', { type: 'button', disabled: busy || sb.dots.length >= 5, onclick: function () { self.fillFive(); } }, '一键补齐 5 点')
        : h('button.btn', { type: 'button', disabled: !sb.strobePts, onclick: function () { sb.analyzed = true; self.renderAnalysis(); } }, '分析频闪'),
      sb.subMode === 'catcher'
        ? h('button.btn.cyan', { type: 'button', disabled: sb.dots.length < 5, onclick: function () { sb.analyzed = true; self.doneB.P6 = true; self.doneB.P7 = true; self.stage.invalidate('fg'); self.renderSide(); self.renderAnalysis(); } }, '平滑连线与分析')
        : null,
      h('button.btn', { type: 'button', onclick: function () {
        self.loop.stop(); sb.ball = null; clearRecorded();
        self.levelTest = null; self.setBanner(null);
        self.stage.invalidate(); self.renderSide();
      } }, '清空重测')));
    side.appendChild(ctl);

    if (this.guided()) {
      side.appendChild(h('div.side-k', '实验步骤'));
      var ids = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
      var curId = null;
      for (var k = 0; k < ids.length; k++) { if (!this.doneB[ids[k]]) { curId = ids[k]; break; } }
      var stepsEl = h('ol.steps', ids.map(function (id) {
        var p = PROC[id], ok = !!self.doneB[id], isCur = id === curId;
        return h('li' + (ok ? '.ok' : '') + (isCur ? '.cur' : ''),
          h('div.st-t', (ok ? '✓ ' : isCur ? '▸ ' : '') + p.title),
          h('div.st-how', { html: M.tex(p.how) }),
          p.why ? h('div.st-why', { html: M.tex('理由：' + p.why) }) : null,
          p.errorId ? h('button.link.sm', { type: 'button', onclick: function () { openTry(p.errorId); } }, '为什么？试一试 →') : null);
      }));
      side.appendChild(stepsEl);
    } else {
      side.appendChild(h('div.side-tip', '自由模式：可故意制造斜槽上翘、随机高度、背板偏斜或槽口原点 O\'，再看下方数据分析的变化！'));
    }
  };

  /* ---------- 装置 B 下方数据分析区 ---------- */
  Bench.prototype.renderAnalysis = function () {
    var self = this, sb = this.stB, el = this.analysis;
    el.hidden = false; ML.clear(el);
    var tags = [];
    if (sb.tiltDeg !== 0) tags.push('E1');
    if (sb.randomHeight) tags.push('E2');
    if (sb.originMode === 'rim') tags.push('E3');
    if (!sb.plumbCalibrated) tags.push('E5');
    if (sb.subMode === 'strobe' && sb.assumeZeroV0) tags.push('E4');

    el.appendChild(h('h2.ana-h', sb.subMode === 'strobe' ? '频闪轨迹数据分析' : '描迹轨迹拟合与求初速度'));
    var tagBar = h('div.ana-tags');
    if (tags.length) {
      tagBar.appendChild(h('span.tag.err', '⚠ 本次操作存在问题'));
      tags.forEach(function (id) {
        tagBar.appendChild(h('button.tag', { type: 'button', onclick: function () { openTry(id); } }, ERR[id].name + ' → 试一试'));
      });
    } else {
      tagBar.appendChild(h('span.tag.ok', '✓ 装置与坐标系设置规范'));
    }
    el.appendChild(tagBar);

    var pts = sb.subMode === 'strobe' ? (sb.strobePts || []) : sb.dots;
    if (pts.length < 3) return;
    var trueV0 = PR.chuteV0({ hDrop: sb.hDrop, chuteRough: sb.chuteRough, ideal: true }, P.rng(1)).v0;

    // 数据表
    var rows = pts.map(function (p, i) {
      var noStr = (sb.subMode === 'strobe' && p.idx != null) ? String(p.idx) : String(i + 1);
      return h('tr', h('td', noStr), h('td', cm(p.x)), h('td', cm(p.y)), h('td', (p.x * p.x).toFixed(4)));
    });
    var tblBox = h('div.ana-block', h('h3', '坐标数据（' + (sb.originMode === 'rim' ? "以槽口下沿 O' 为原点" : '以球心投影 O 为原点') + '）'),
      h('div.tbl-wrap', h('table.dt', h('tr', h('th', '点序'), h('th', 'x / cm'), h('th', 'y / cm'), h('th', 'x² / m²')), rows)));

    // 右侧：y-x² 拟合图或频闪三点法
    var fitBox = h('div.ana-block');
    if (sb.subMode === 'catcher') {
      var an = PR.analyzeOriginPts(pts, PR.G);
      fitBox.appendChild(h('h3', { html: '方案一：y - x² 图像法（理论 y = ' + M.frac('g', '2v₀²') + 'x²）' }));
      var cPts = pts.filter(function (p) { return p.x > 0.01; }).map(function (p) { return [p.x * p.x, p.y]; });
      var maxX2 = cPts.length ? Math.max.apply(null, cPts.map(function (q) { return q[0]; })) : 0.20;
      var maxY = cPts.length ? Math.max.apply(null, cPts.map(function (q) { return q[1]; })) : 0.40;
      var minY = cPts.length ? Math.min.apply(null, cPts.map(function (q) { return q[1]; })) : 0;
      var ch = new ML.Chart(fitBox, {
        xLabel: 'x² / m²', yLabel: 'y / m', height: 240, paper: true,
        x: [0, Math.max(0.06, maxX2 * 1.18)],
        y: [Math.min(-0.02, minY - 0.01), Math.max(0.10, maxY * 1.15)]
      });
      ch.set([{ pts: cPts, fit: true, color: '#1661FF', label: '拟合 k=' + (isFinite(an.fit.k) ? an.fit.k.toFixed(2) : '—') + ' m⁻¹' }]);
      fitBox.appendChild(h('div.formula', {
        html: '拟合直线斜率 k = <b>' + (isFinite(an.fit.k) ? an.fit.k.toFixed(3) : '—') + ' m⁻¹</b>，截距 b = <b>' + (isFinite(an.fit.b) ? (an.fit.b * 100).toFixed(2) : '—') + ' cm</b>，R² = ' + (isFinite(an.fit.r2) ? an.fit.r2.toFixed(4) : '—') + '<br>' +
          '图像斜率求得 v₀ = ' + M.tex('{{sqrt|{{frac|g|2k}}}}') + ' = <b>' + (isFinite(an.v0Fit) ? an.v0Fit.toFixed(3) : '—') + ' m/s</b>　｜　单点公式均值 v₀ = <b>' + (isFinite(an.v0SingleMean) ? an.v0SingleMean.toFixed(3) : '—') + ' m/s</b>' +
          (!sb.randomHeight ? ' <span class="muted">（斜槽理论 v₀ = ' + trueV0.toFixed(3) + ' m/s）</span>' : '')
      }));
      if (sb.originMode === 'rim') {
        fitBox.appendChild(h('div.warnline', { html: '⚠ 因原点选在槽口下沿 O\'，纵截距 ≈ −1.50 cm（即 −R），单点公式 v₀ = x√(g/2y\') 明显偏大；而图像斜率仍能准确给出 v₀！' }));
      }
    } else {
      // 频闪模式：显示 Δx 与 Δy=gT²
      fitBox.appendChild(h('h3', '方案二：频闪等时间间隔分析（T = ' + sb.strobeT + ' s）'));
      var p1 = pts[Math.min(2, pts.length - 3)], p2 = pts[Math.min(3, pts.length - 2)], p3 = pts[Math.min(4, pts.length - 1)];
      var tri = PR.analyzeThreePts(p1, p2, p3, PR.G, sb.assumeZeroV0);
      var toggleBtn = h('button.chip' + (sb.assumeZeroV0 ? '.on' : ''), {
        type: 'button',
        onclick: function () { sb.assumeZeroV0 = !sb.assumeZeroV0; self.renderAnalysis(); }
      }, sb.assumeZeroV0 ? '当前：误把第 1 点当零速起点' : '模拟误区：把首点当零速点按 1:3:5 算');
      fitBox.appendChild(h('div.side-row', toggleBtn));
      fitBox.appendChild(h('div.formula', {
        html: '水平间隔 Δx = <b>' + cm(tri.dx) + ' cm</b>；相邻竖直间距 y<sub>AB</sub> = ' + cm(tri.yAB) + ' cm，y<sub>BC</sub> = ' + cm(tri.yBC) + ' cm，差 Δy = <b>' + cm(tri.dy) + ' cm</b><br>' +
          '正确公式（Δy = gT²）：T = <b>' + tri.T.toFixed(4) + ' s</b>，v₀ = ' + M.frac('Δx', 'T') + ' = <b>' + tri.v0.toFixed(3) + ' m/s</b>，v<sub>By</sub> = ' + M.frac('y<sub>AB</sub>+y<sub>BC</sub>', '2T') + ' = <b>' + tri.vBy.toFixed(3) + ' m/s</b>'
      }));
      if (sb.assumeZeroV0) {
        fitBox.appendChild(h('div.warnline', {
          html: '⚠ 错用 y<sub>AB</sub> = ½gT²：y<sub>BC</sub>:y<sub>AB</sub> = ' + tri.ratioBC_AB.toFixed(2) + ' ≠ 3（并非 1:3:5），错算得 T = ' + tri.Twrong.toFixed(4) + ' s，v₀ = ' + tri.v0Wrong.toFixed(3) + ' m/s（偏差过大）！'
        }));
      }
      var ch2 = new ML.Chart(fitBox, { xLabel: '间隔序号', yLabel: 'Δx 或 Δy / cm', height: 210 });
      var dxs = [], dys = [];
      for (var j = 1; j < pts.length; j++) {
        dxs.push([j, (pts[j].x - pts[j - 1].x) * 100]);
        dys.push([j, (pts[j].y - pts[j - 1].y) * 100]);
      }
      ch2.set([
        { pts: dxs, fit: true, color: '#1661FF', label: '水平间距 Δx（近似恒定）' },
        { pts: dys, fit: true, color: '#25A870', label: '竖直间距 Δy（线性递增）' }
      ]);
    }
    el.appendChild(h('div.ana-grid', tblBox, fitBox));
    el.scrollIntoView({ behavior: ML.perf.low ? 'auto' : 'smooth', block: 'start' });
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
        var sGood = PR.simulateAB({ H: 0.80, v0: 1.80, tiltDeg: 0, ideal: S.ideal }, 11);
        var sBad = PR.simulateAB({ H: 0.80, v0: 1.80, tiltDeg: 5, ideal: S.ideal }, 11);
        var maxT1 = Math.max(sGood.tA, sGood.tB, sBad.tA, sBad.tB) + 0.04;
        var tRange1 = [Math.max(0, maxT1 - 0.14), maxT1];
        var stg = makeTryStage(area, 165);
        stg.on('bg', function (ctx, w, hh) {
          ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
          drawSoundStrip(ctx, 10, 8, w - 20, 72, sGood, 1.0, '水平 0° · 声音双脉冲', tRange1);
          drawSoundStrip(ctx, 10, 86, w - 20, 72, sBad, 1.0, '上翘 +5° · 声音双脉冲', tRange1);
        });
        var ch = new ML.Chart(area, { xLabel: 'x² / m²', yLabel: 'y / m', height: 190, paper: true, x: [0, 0.25], y: [-0.04, 0.42] });
        var lG = PR.launchChute({ tiltDeg: 0, ideal: true }, 1), lB = PR.launchChute({ tiltDeg: 5, ideal: true }, 1);
        var pG = [], pB = [];
        for (var t = 0.04; t <= 0.28; t += 0.04) {
          var wg = lG.worldAtT(t), wb = lB.worldAtT(t);
          pG.push([wg.x * wg.x, wg.y]); pB.push([wb.x * wb.x, wb.y]);
        }
        ch.set([
          { pts: pG, fit: true, color: '#25A870', label: '水平 0°（过原点直线）' },
          { pts: pB, color: '#C7374B', mark: 'x', label: '上翘 +5°（向下偏折）' }
        ]);
        area.appendChild(h('div.cmp-note', { html: '上翘 +5° 时：装置 A 两球落地时间差 Δt = <b>+' + (sBad.deltaT * 1000).toFixed(1) + ' ms</b>（A 晚于 B）；装置 B 的 y-x² 偏离过原点直线。' }));
        defer(done, 120);
      } else if (err.id === 'E2') {
        var ptsGood = [], ptsBad = [];
        var ys = [0.06, 0.12, 0.18, 0.24, 0.30, 0.36];
        for (var i = 0; i < ys.length; i++) {
          var lg = PR.launchChute({ randomHeight: false, ideal: S.ideal }, 10 + i);
          var lb = PR.launchChute({ randomHeight: true, ideal: S.ideal }, 20 + i * 17);
          var hg = lg.hitAtPlateY(ys[i]), hb = lb.hitAtPlateY(ys[i]);
          ptsGood.push([hg.x * 100, hg.y * 100]); ptsBad.push([hb.x * 100, hb.y * 100]);
        }
        var ch2 = new ML.Chart(area, { xLabel: 'x / cm', yLabel: 'y / cm', height: 220, paper: true, x: [0, 56], y: [0, 44] });
        ch2.set([
          { pts: ptsGood, color: '#25A870', label: '同一位置释放（共线同一抛物线）' },
          { pts: ptsBad, color: '#C7374B', mark: 'x', label: '每次随机高度（左右散乱）' }
        ]);
        area.appendChild(h('div.cmp-note', '同一高度释放 6 次落在同一条光滑抛物线上；高度变化导致每次 v₀ 不同，点迹属于不同抛物线而散乱。'));
        defer(done, 120);
      } else if (err.id === 'E3') {
        var lC = PR.launchChute({ originMode: 'center', ideal: true }, 1);
        var lR = PR.launchChute({ originMode: 'rim', ideal: true }, 1);
        var cPts = [], rPts = [], dC = [], dR = [];
        [0.06, 0.12, 0.18, 0.24, 0.32].forEach(function (yy) {
          var hc = lC.hitAtPlateY(yy), hr = lR.hitAtPlateY(yy);
          cPts.push([hc.x * hc.x, hc.y]); rPts.push([hr.x * hr.x, hr.y]);
          dC.push(hc); dR.push(hr);
        });
        var anC = PR.analyzeOriginPts(dC, PR.G), anR = PR.analyzeOriginPts(dR, PR.G);
        var ch3 = new ML.Chart(area, { xLabel: 'x² / m²', yLabel: 'y / m', height: 210, paper: true, x: [0, 0.20], y: [-0.03, 0.36] });
        ch3.set([
          { pts: cPts, fit: true, color: '#25A870', label: '球心 O：截距 = 0.00 cm' },
          { pts: rPts, fit: true, color: '#C7374B', mark: 'x', label: "槽口 O'：截距 = −1.50 cm (−R)" }
        ]);
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '原点选择'), h('th', '图像纵截距'), h('th', '单点公式 v₀ 均值'), h('th', '图像斜率求 v₀'), h('th', '真实 v₀')),
          h('tr', h('td', '球心投影 O'), h('td', (anC.fit.b * 100).toFixed(2) + ' cm'), h('td', anC.v0SingleMean.toFixed(3) + ' m/s'), h('td', anC.v0Fit.toFixed(3) + ' m/s'), h('td', { rowspan: 2 }, lC.v0.toFixed(3) + ' m/s')),
          h('tr.hl', h('td', "槽口下沿 O'"), h('td', (anR.fit.b * 100).toFixed(2) + ' cm'), h('td', anR.v0SingleMean.toFixed(3) + ' m/s（偏大）'), h('td', anR.v0Fit.toFixed(3) + ' m/s（仍准）'))));
        defer(done, 120);
      } else if (err.id === 'E4') {
        var l4 = PR.launchChute({ ideal: true }, 1);
        var pA = l4.worldAtT(0.12), pB = l4.worldAtT(0.18), pC = l4.worldAtT(0.24);
        var tri = PR.analyzeThreePts(pA, pB, pC, PR.G, true);
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '中段三点 (t=0.12, 0.18, 0.24s)'), h('th', 'y<sub>AB</sub> / cm'), h('th', 'y<sub>BC</sub> / cm'), h('th', '比值 y<sub>BC</sub> : y<sub>AB</sub>'), h('th', '算得 T'), h('th', '算得 v₀')),
          h('tr', h('td', '正确（Δy = gT²）'), h('td', cm(tri.yAB)), h('td', cm(tri.yBC)), h('td', tri.ratioBC_AB.toFixed(2) + ' : 1'), h('td', tri.T.toFixed(4) + ' s'), h('td', tri.v0.toFixed(3) + ' m/s')),
          h('tr.hl', h('td', '错误（误用 y<sub>AB</sub> = ½gT²）'), h('td', cm(tri.yAB)), h('td', cm(tri.yBC)), h('td', '误当成 3 : 1'), h('td', tri.Twrong.toFixed(4) + ' s'), h('td', tri.v0Wrong.toFixed(3) + ' m/s（偏小!）'))));
        area.appendChild(h('div.cmp-note', { html: '真实 v₀ = ' + l4.v0.toFixed(3) + ' m/s。因为首点 A 已有竖直速度 v<sub>Ay</sub> = ' + (PR.G * 0.12).toFixed(2) + ' m/s，切勿按初速度为零的 1:3:5 套用。' }));
        defer(done, 120);
      } else if (err.id === 'E5') {
        var pOk = [], pTilt = [], rawOk = [], rawTilt = [], refOkV0 = 0, refTiltV0 = 0;
        [0.08, 0.14, 0.20, 0.28, 0.36].forEach(function (yy, idx) {
          var lOkI = PR.launchChute({ plumbCalibrated: true, ideal: S.ideal }, 40 + idx);
          var lTiltI = PR.launchChute({ plumbCalibrated: false, ideal: S.ideal }, 40 + idx);
          refOkV0 = lOkI.v0; refTiltV0 = lTiltI.v0;
          var ho = lOkI.hitAtPlateY(yy), ht = lTiltI.hitAtPlateY(yy);
          pOk.push([ho.x * ho.x, ho.y]); pTilt.push([ht.x * ht.x, ht.y]);
          rawOk.push(ho); rawTilt.push(ht);
        });
        var anOk = PR.analyzeOriginPts(rawOk, PR.G), anTilt = PR.analyzeOriginPts(rawTilt, PR.G);
        var ch5 = new ML.Chart(area, { xLabel: 'x² / m²', yLabel: 'y / m', height: 210, paper: true });
        ch5.set([
          { pts: pOk, fit: true, color: '#25A870', label: '重锤校准：v₀=' + anOk.v0Fit.toFixed(3) },
          { pts: pTilt, fit: true, color: '#C7374B', mark: 'x', label: '背板偏斜 6°+刮擦：v₀=' + anTilt.v0Fit.toFixed(3) }
        ]);
        area.appendChild(h('div.cmp-note', '背板未校准竖直不仅使坐标轴偏斜 6°，还会让钢球擦碰背板产生额外阻力，测得 v₀ 产生明显偏差（理论 ' + refOkV0.toFixed(3) + ' vs 偏斜测量 ' + anTilt.v0Fit.toFixed(3) + ' m/s）。'));
        defer(done, 120);
      } else if (err.id === 'E6') {
        var sPts = [], rPts = [], vSmSum = 0, vRgSum = 0, ys6 = [0.06, 0.12, 0.18, 0.25, 0.34];
        ys6.forEach(function (yy, idx) {
          var lSm = PR.launchChute({ chuteRough: false, ideal: S.ideal }, 60 + idx);
          var lRg = PR.launchChute({ chuteRough: true, ideal: S.ideal }, 70 + idx);
          vSmSum += lSm.v0; vRgSum += lRg.v0;
          var a = lSm.hitAtPlateY(yy), b = lRg.hitAtPlateY(yy);
          sPts.push([a.x * 100, a.y * 100]); rPts.push([b.x * 100, b.y * 100]);
        });
        var ch6 = new ML.Chart(area, { xLabel: 'x / cm', yLabel: 'y / cm', height: 210, paper: true, x: [0, 48], y: [0, 42] });
        ch6.set([
          { pts: sPts, color: '#1661FF', label: '光滑斜槽 (v₀≈' + (vSmSum / ys6.length).toFixed(2) + ' m/s)' },
          { pts: rPts, color: '#E07B24', mark: 'x', label: '较粗糙斜槽 (v₀≈' + (vRgSum / ys6.length).toFixed(2) + ' m/s)' }
        ]);
        area.appendChild(h('div.cmp-note', '只要每次从同一位置由静止释放，较粗糙斜槽虽使初速度略小，但 5 次发射依然完美重合在一条抛物线上，完全不影响探究平抛运动规律！'));
        defer(done, 120);
      }
      return function () {
        tids.forEach(function (tid) { clearTimeout(tid); });
        tids.length = 0;
      };
    },
    show: function (c, vis) {
      var sh = c.show || {};
      if (sh.type === 'ab-pulse') {
        var sBad = PR.simulateAB({ H: 0.80, v0: 1.80, tiltDeg: sh.config.tiltDeg || 5, ideal: true }, 9);
        var wrap = h('div.rev-stage-wrap'); wrap.style.height = '104px'; vis.appendChild(wrap);
        var stg = new ML.stage.Stage(wrap, { layers: ['bg'] });
        stg.on('bg', function (ctx, w, hh) { drawSoundStrip(ctx, 4, 4, w - 8, hh - 8, sBad, 1.0); });
      } else if (sh.type === 'scatter') {
        var pts = [], ys = [0.06, 0.12, 0.18, 0.24, 0.30, 0.36];
        for (var i = 0; i < ys.length; i++) {
          var lb = PR.launchChute({ randomHeight: true, ideal: true }, 30 + i * 19);
          var hb = lb.hitAtPlateY(ys[i]);
          pts.push([hb.x * 100, hb.y * 100]);
        }
        var ch = new ML.Chart(vis, { xLabel: 'x / cm', yLabel: 'y / cm', height: 190, paper: true, x: [0, 56], y: [0, 44] });
        ch.set([{ pts: pts, color: '#C7374B', mark: 'x', label: '实测 6 个印迹点' }]);
      } else if (sh.type === 'yx-x') {
        var chY = PR.launchChute({ hDrop: 0.18, ideal: true }, 1);
        var oP = chY.worldAtT(0.08);
        var shifted = [0.12, 0.17, 0.22, 0.27, 0.32].map(function (t) {
          var w = chY.worldAtT(t);
          return { x: w.x - oP.x, y: w.y - oP.y };
        });
        var yxRes = PR.yxLine(shifted, PR.G);
        var yxPts = shifted.map(function (p) { return [p.x, p.y / p.x]; });
        var ch2 = new ML.Chart(vis, { xLabel: 'x / m', yLabel: '(y/x) / 无量纲', height: 190, paper: true, x: [0, 0.42], y: [0, 1.6] });
        ch2.set([{ pts: yxPts, fit: true, color: '#1661FF', label: 'y/x = kx + b (k=' + yxRes.k.toFixed(2) + ', b=' + yxRes.b.toFixed(2) + ')' }]);
      } else if (sh.type === 'rough') {
        var lRg = PR.launchChute({ chuteRough: true, ideal: false }, 5);
        var rPts = [0.06, 0.12, 0.18, 0.26, 0.34].map(function (yy) { var p = lRg.hitAtPlateY(yy); return [p.x * 100, p.y * 100]; });
        var ch3 = new ML.Chart(vis, { xLabel: 'x / cm', yLabel: 'y / cm', height: 185, paper: true, x: [0, 42], y: [0, 40] });
        ch3.set([{ pts: rPts, color: '#E07B24', label: '生锈斜槽同一位置释放 5 次轨迹' }]);
      }
    },
    restore: function () {
      if (!bench) {
        S.mode = 'guided';
        ML.store.save();
        return;
      }
      bench.loop.stop();
      bench.setMode('guided');
      bench.stA.running = false; bench.stA.tiltDeg = 0; bench.stA.done = false; bench.stA.sim = null;
      bench.stB.ball = null; bench.levelTest = null;
      bench.stB.tiltDeg = 0; bench.stB.randomHeight = false; bench.stB.plumbCalibrated = true;
      bench.stB.originMode = 'center'; bench.stB.chuteRough = false; bench.stB.assumeZeroV0 = false;
      bench.stB.dots = []; bench.stB.strobePts = null; bench.stB.analyzed = false;
      bench.analysis.hidden = true; ML.clear(bench.analysis);
      bench.setBanner(null);
      bench.stage.invalidate(); bench.renderSide();
    },
    replay: function (errId) {
      var e = ERR[errId]; if (!e) return;
      shell.go('bench');
      bench.loop.stop();
      bench.setMode('free', true);
      if (errId === 'E1') {
        bench.setApp('A', true);
        bench.stA.running = false; bench.stA.tiltDeg = 5; bench.stA.done = false; bench.stA.sim = null;
        bench.stage.invalidate(); bench.renderSide();
        bench.setBanner('<b>复现：' + e.name + '</b>　已将金属片设为上翘 +5°，点击“用小锤击打”查看声音双脉冲分离。');
        return;
      }
      bench.setApp('B', true);
      var sb = bench.stB;
      sb.ball = null; bench.levelTest = null;
      sb.dots = []; sb.strobePts = null; sb.analyzed = false;
      bench.analysis.hidden = true; ML.clear(bench.analysis);
      sb.tiltDeg = 0; sb.randomHeight = false; sb.plumbCalibrated = true; sb.originMode = 'center'; sb.chuteRough = false; sb.assumeZeroV0 = false;
      if (errId === 'E2') { sb.subMode = 'catcher'; sb.randomHeight = true; }
      else if (errId === 'E3') { sb.subMode = 'catcher'; sb.originMode = 'rim'; }
      else if (errId === 'E4') { sb.subMode = 'strobe'; sb.assumeZeroV0 = true; }
      else if (errId === 'E5') { sb.subMode = 'catcher'; sb.plumbCalibrated = false; }
      else if (errId === 'E6') { sb.subMode = 'catcher'; sb.chuteRough = true; }
      bench.stage.invalidate(); bench.renderSide();
      bench.setBanner('<b>复现：' + e.name + '</b>　已预设自由模式实验台，直接点“' + (sb.subMode === 'strobe' ? '频闪发射' : '一键补齐 5 点') + '”查看结果。');
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
  function learnWidget(p, card) {
    var box = h('div.learn-widget');
    card.appendChild(box);
    if (p.widget === 'decompose-demo') {
      var tVal = 0.25, anim = false;
      var playBtn = h('button.chip.on', { type: 'button', onclick: function () {
        anim = !anim; playBtn.textContent = anim ? '暂停' : '播放分运动投影';
        if (anim) { tVal = 0; lp.start(); }
      } }, '播放分运动投影');
      var rngEl = h('input', { type: 'range', min: '0', max: '0.30', step: '0.01', value: '0.25', style: { flex: '1', minWidth: '140px' }, oninput: function () { anim = false; playBtn.textContent = '播放分运动投影'; tVal = parseFloat(rngEl.value); stg.invalidate('bg'); } });
      box.appendChild(h('div.side-row', playBtn, rngEl));
      var wrap = h('div.m04-w-stage'); box.appendChild(wrap);
      var stg = new ML.stage.Stage(wrap, { layers: ['bg'] });
      var lp = new ML.stage.Loop(function (dt) {
        if (!anim || !wrap.isConnected) { anim = false; return false; }
        tVal += dt * 0.16;
        if (tVal >= 0.30) { tVal = 0.30; anim = false; playBtn.textContent = '播放分运动投影'; stg.invalidate('bg'); return false; }
        rngEl.value = tVal.toFixed(2);
        stg.invalidate('bg'); return true;
      });
      stg.on('bg', function (ctx, w, hh) {
        if (w < 60 || hh < 60) return;
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var ox = 54, oy = 32, g = 9.8, v0 = 1.4, ppmX = (w - 90) / 0.44, ppmY = (hh - 54) / 0.45;
        ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(w - 22, oy); ctx.moveTo(ox, oy); ctx.lineTo(ox, hh - 16); ctx.stroke();
        D.text(ctx, '水平分运动：x = v₀t（等距）', w - 24, oy - 10, { align: 'right', size: 11.5, weight: 700, color: '#1661FF' });
        D.text(ctx, '竖直：1:3:5', 6, oy + 14, { size: 11, weight: 700, color: '#25A870' });
        ctx.strokeStyle = '#1661FF'; ctx.lineWidth = 2; ctx.beginPath();
        for (var tt = 0; tt <= tVal; tt += 0.01) {
          var sx = ox + v0 * tt * ppmX, sy = oy + 0.5 * g * tt * tt * ppmY;
          if (tt === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        [0.10, 0.20, 0.30].forEach(function (tk) {
          if (tk > tVal + 0.001) return;
          var px = ox + v0 * tk * ppmX, py = oy + 0.5 * g * tk * tk * ppmY;
          ctx.strokeStyle = 'rgba(18,169,196,0.45)'; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, py); ctx.moveTo(ox, py); ctx.lineTo(px, py); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#1661FF'; ctx.beginPath(); ctx.arc(px, oy, 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#25A870'; ctx.beginPath(); ctx.arc(ox, py, 4, 0, Math.PI * 2); ctx.fill();
        });
        var cx = ox + v0 * tVal * ppmX, cy = oy + 0.5 * g * tVal * tVal * ppmY;
        drawBall(ctx, cx, cy, 7, '#84B5FF', '#1661FF');
      });
    } else if (p.widget === 'ab-demo') {
      var H = 0.80, v0 = 1.60, sim = PR.simulateAB({ H: H, v0: v0, ideal: true }, 1), tNow = sim.tA + 0.04;
      var fire = h('button.chip.on', { type: 'button', onclick: function () { sim = PR.simulateAB({ H: H, v0: v0, ideal: true }, 1); tNow = 0; lp.start(); } }, '小锤击打');
      var forceBtn = h('button.chip', { type: 'button', onclick: function () { v0 = v0 > 2 ? 1.2 : 2.4; forceBtn.textContent = '打击力度：' + (v0 > 2 ? '强' : '轻'); sim = PR.simulateAB({ H: H, v0: v0, ideal: true }, 1); tNow = 0; lp.start(); } }, '切换打击力度');
      var hBtn = h('button.chip', { type: 'button', onclick: function () { H = H > 1 ? 0.65 : 1.15; hBtn.textContent = '高度 H = ' + H.toFixed(2) + 'm'; sim = PR.simulateAB({ H: H, v0: v0, ideal: true }, 1); tNow = 0; lp.start(); } }, '切换高度 H');
      box.appendChild(h('div.side-row', fire, forceBtn, hBtn));
      var wrapA = h('div.m04-w-stage'); box.appendChild(wrapA);
      var stgA = new ML.stage.Stage(wrapA, { layers: ['bg'] });
      var lp = new ML.stage.Loop(function (dt) {
        if (!wrapA.isConnected) return false;
        tNow += dt * 0.6;
        stgA.invalidate('bg');
        if (tNow >= sim.tA + 0.04) { tNow = sim.tA + 0.04; return false; }
        return true;
      });
      stgA.on('bg', function (ctx, w, hh) {
        if (w < 60 || hh < 90) return;
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var flY = hh - 74, ppm = Math.max(20, (flY - 24) / 1.25), px = 78, ly = flY - H * ppm;
        ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(18, flY); ctx.lineTo(w - 18, flY); ctx.stroke();
        ctx.fillStyle = '#4A5B73'; ctx.fillRect(px - 22, ly + 6, 44, 6);
        var pos = sim.at(tNow);
        var byA = Math.min(flY - 8, ly + pos.yB * ppm), ayA = Math.min(flY - 8, ly + pos.yA * ppm);
        drawBall(ctx, px - 8, byA, 8, '#7CF0B4', '#17784F');
        drawBall(ctx, px + 14 + pos.xA * ppm, ayA, 8, '#84B5FF', '#1661FF');
        D.text(ctx, 'B 自由落体', px - 14, byA, { align: 'right', size: 11, weight: 700, color: '#17784F' });
        D.text(ctx, 'A 平抛', px + 26 + pos.xA * ppm, ayA, { size: 11, weight: 700, color: '#1661FF' });
        drawSoundStrip(ctx, 12, flY + 8, w - 24, 58, sim, tNow);
      });
    } else if (p.widget === 'chute-check-demo') {
      var modeC = 'level';
      var bar = h('div.side-row',
        h('button.chip.on', { type: 'button', onclick: function () { sel('level', 0); } }, '① 末端水平检验'),
        h('button.chip', { type: 'button', onclick: function () { sel('plumb', 1); } }, '② 重锤线定竖直'),
        h('button.chip', { type: 'button', onclick: function () { sel('rough', 2); } }, '③ 同位置释放（允许粗糙）'));
      var wrapC = h('div.m04-w-stage.short'), noteC = h('div.cmp-note');
      box.appendChild(bar); box.appendChild(wrapC); box.appendChild(noteC);
      var stgC = new ML.stage.Stage(wrapC, { layers: ['bg'] });
      stgC.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        if (modeC === 'level') {
          ctx.strokeStyle = '#596574'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(40, 42); ctx.lineTo(130, 108); ctx.lineTo(220, 108); ctx.stroke();
          drawBall(ctx, 185, 97, 9, '#84B5FF', '#1661FF');
          D.text(ctx, '轻放在末端保持静止 ⇔ 末端切线水平 ✓', 238, 104, { size: 13, weight: 700, color: '#17784F' });
        } else if (modeC === 'plumb') {
          ctx.fillStyle = '#fff'; ctx.strokeStyle = '#10233F'; ctx.fillRect(140, 20, 140, 145); ctx.strokeRect(140, 20, 140, 145);
          ctx.strokeStyle = '#25A870'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(155, 28); ctx.lineTo(155, 152); ctx.stroke();
          ctx.fillStyle = '#25A870'; ctx.beginPath(); ctx.moveTo(155, 162); ctx.lineTo(150, 150); ctx.lineTo(160, 150); ctx.closePath(); ctx.fill();
          D.text(ctx, '沿重锤线画竖直 y 轴', 292, 92, { size: 13, weight: 700, color: '#17784F' });
        } else {
          ctx.strokeStyle = '#7A5C3E'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(40, 38); ctx.lineTo(130, 94); ctx.lineTo(180, 94); ctx.stroke();
          ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(48, 30); ctx.lineTo(40, 46); ctx.stroke();
          drawBall(ctx, 56, 37, 8, '#84B5FF', '#1661FF');
          ctx.strokeStyle = '#1661FF'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(180, 86); ctx.quadraticCurveTo(280, 92, 340, 164); ctx.stroke(); ctx.setLineDash([]);
          D.text(ctx, '同位置静止释放 → 每次出槽 v₀ 仍相同', 210, 52, { size: 13, weight: 700, color: '#1661FF' });
        }
      });
      function sel(m, idx) {
        modeC = m;
        ML.$$('.chip', bar).forEach(function (c, i) { c.classList.toggle('on', i === idx); });
        noteC.textContent = m === 'level' ? '判断末端是否水平：把钢球轻放在斜槽末端不同位置，能静止不动即为水平。'
          : m === 'plumb' ? '重锤线自然竖直，既用来调平背板竖直，又用来在白纸上标记竖直 y 轴。'
          : '斜槽无需绝对光滑：只要每次在同一位置由静止释放，阻力每次做功相等，飞出速度就相同。';
        stgC.invalidate('bg');
      }
      sel('level', 0);
    } else if (p.widget === 'origin-demo') {
      var modeO = 'center';
      var barO = h('div.side-row',
        h('button.chip.on', { type: 'button', onclick: function () { selO('center', 0); } }, '正确：球心投影 O'),
        h('button.chip', { type: 'button', onclick: function () { selO('rim', 1); } }, "错误：槽口下沿 O'（偏 R）"));
      var split = h('div.cmp-split');
      var wrapO = h('div.m04-w-stage.short'), chBox = h('div');
      split.appendChild(wrapO); split.appendChild(chBox);
      box.appendChild(barO); box.appendChild(split);
      var stgO = new ML.stage.Stage(wrapO, { layers: ['bg'] });
      var chO = new ML.Chart(chBox, { xLabel: 'x² / m²', yLabel: 'y / m', height: 186, paper: true, x: [0, 0.20], y: [-0.03, 0.36] });
      stgO.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var ex = 90, ey = 96, r = 24;
        ctx.fillStyle = '#596574'; ctx.fillRect(14, ey, ex - 14, 10);
        drawBall(ctx, ex, ey - r, r, '#DCE8FF', '#1661FF');
        ctx.strokeStyle = '#10233F'; ctx.beginPath(); ctx.moveTo(ex, ey - r); ctx.lineTo(ex, ey); ctx.stroke();
        D.text(ctx, 'R', ex + 6, ey - r / 2 + 4, { size: 12, weight: 700 });
        ctx.fillStyle = '#25A870'; ctx.beginPath(); ctx.arc(ex, ey - r, 5, 0, Math.PI * 2); ctx.fill();
        D.text(ctx, 'O（球心投影）', ex + 30, ey - r + 4, { size: 12, weight: 700, color: '#17784F' });
        ctx.fillStyle = modeO === 'rim' ? '#C7374B' : '#8E99A6'; ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2); ctx.fill();
        D.text(ctx, "O'（槽口下沿）", ex + 30, ey + 6, { size: 12, weight: 700, color: modeO === 'rim' ? '#C7374B' : '#4A5B73' });
      });
      function selO(m, idx) {
        modeO = m;
        ML.$$('.chip', barO).forEach(function (c, i) { c.classList.toggle('on', i === idx); });
        var l = PR.launchChute({ originMode: m, ideal: true }, 1);
        var pts = [0.05, 0.10, 0.16, 0.24, 0.32].map(function (yy) { var pt = l.hitAtPlateY(yy); return [pt.x * pt.x, pt.y]; });
        chO.set([{ pts: pts, fit: true, color: m === 'center' ? '#25A870' : '#C7374B', label: m === 'center' ? '截距 = 0' : '截距 = −R' }]);
        stgO.invalidate('bg');
      }
      selO('center', 0);
    } else if (p.widget === 'calc-methods-demo') {
      var modeM = 'origin';
      var barM = h('div.side-row',
        h('button.chip.on', { type: 'button', onclick: function () { selM('origin', 0); } }, '方案一：有抛出点（y-x²）'),
        h('button.chip', { type: 'button', onclick: function () { selM('no-origin', 1); } }, '方案二：无抛出点（Δy = gT²）'));
      var wrapM = h('div.m04-w-stage.short'), noteM = h('div.cmp-note');
      box.appendChild(barM); box.appendChild(wrapM); box.appendChild(noteM);
      var stgM = new ML.stage.Stage(wrapM, { layers: ['bg'] });
      stgM.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        if (modeM === 'origin') {
          ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(48, 22); ctx.lineTo(w - 28, 22); ctx.moveTo(48, 22); ctx.lineTo(48, hh - 18); ctx.stroke();
          D.text(ctx, 'O(0,0)', 16, 26, { size: 11, weight: 700 });
          ctx.strokeStyle = '#1661FF'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(48, 22); ctx.quadraticCurveTo(180, 36, 280, hh - 26); ctx.stroke();
          var px = 216, py = 104;
          ctx.strokeStyle = '#4A5B73'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(px, 22); ctx.lineTo(px, py); ctx.lineTo(48, py); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
          D.text(ctx, 'P(x, y)', px + 8, py + 4, { size: 12, weight: 700, color: '#C7374B' });
          D.text(ctx, 'v₀ = x√(g/2y)', w - 34, 62, { align: 'right', size: 13, weight: 700, color: '#1661FF' });
        } else {
          ctx.strokeStyle = '#1661FF'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(64, 26); ctx.quadraticCurveTo(160, 48, 264, hh - 22); ctx.stroke();
          var pts = [[94, 38, 'A'], [158, 72, 'B'], [222, 134, 'C']];
          ctx.strokeStyle = '#25A870'; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(94, 38); ctx.lineTo(158, 38); ctx.lineTo(158, 72); ctx.lineTo(222, 72); ctx.lineTo(222, 134); ctx.stroke(); ctx.setLineDash([]);
          pts.forEach(function (q) {
            ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.arc(q[0], q[1], 4.5, 0, Math.PI * 2); ctx.fill();
            D.text(ctx, q[2], q[0] - 12, q[1] - 4, { size: 12, weight: 700 });
          });
          D.text(ctx, 'Δx', 126, 32, { align: 'center', size: 11, color: '#17784F', weight: 700 });
          D.text(ctx, 'Δx', 190, 66, { align: 'center', size: 11, color: '#17784F', weight: 700 });
          D.text(ctx, 'y_AB', 164, 58, { size: 11, color: '#1661FF' });
          D.text(ctx, 'y_BC', 228, 108, { size: 11, color: '#1661FF' });
          D.text(ctx, 'T = √((y_BC−y_AB)/g)', w - 24, 56, { align: 'right', size: 12.5, weight: 700, color: '#1661FF' });
        }
      });
      function selM(m, idx) {
        modeM = m;
        ML.$$('.chip', barM).forEach(function (c, i) { c.classList.toggle('on', i === idx); });
        noteM.innerHTML = m === 'origin'
          ? M.tex('<b>有抛出点 O</b>：任意远点 (x, y) 算 v₀ = x{{sqrt|{{frac|g|2y}}}}，或多点作 y-x² 图由斜率 k = {{frac|g|2v₀²}} 求 v₀。')
          : '<b>无抛出点</b>：取水平等间距 Δx 三点 A、B、C，由 Δy = y<sub>BC</sub> − y<sub>AB</sub> = gT² 求 T，再求 v₀ = Δx/T 与 v<sub>By</sub> = (y<sub>AB</sub>+y<sub>BC</sub>)/2T（切忌错套 1:3:5）。';
        stgM.invalidate('bg');
      }
      selM('origin', 0);
    } else if (p.widget === 'strobe-demo') {
      var modeS = 'strobe';
      var barS = h('div.side-row',
        h('button.chip.on', { type: 'button', onclick: function () { selS('strobe', 0); } }, '频闪照相法'),
        h('button.chip', { type: 'button', onclick: function () { selS('dual', 1); } }, '双斜槽水平匀速对比'));
      var wrapS = h('div.m04-w-stage.short'); box.appendChild(barS); box.appendChild(wrapS);
      var stgS = new ML.stage.Stage(wrapS, { layers: ['bg'] });
      stgS.on('bg', function (ctx, w, hh) {
        if (modeS === 'strobe') {
          ctx.fillStyle = '#10233F'; ctx.fillRect(0, 0, w, hh);
          var ox = 48, oy = 24, stepX = (w - 90) / 5, stepY = 7;
          ctx.strokeStyle = 'rgba(132,181,255,0.22)'; ctx.lineWidth = 1;
          for (var c = 0; c <= 5; c++) { ctx.beginPath(); ctx.moveTo(ox + c * stepX, oy); ctx.lineTo(ox + c * stepX, hh - 16); ctx.stroke(); }
          for (var k = 0; k <= 5; k++) {
            var sx = ox + k * stepX, sy = oy + k * k * stepY * 0.8;
            drawBall(ctx, sx, sy, 7, '#FFFFFF', '#84B5FF');
            D.text(ctx, 't=' + k + 'T', sx, oy - 7, { align: 'center', size: 10.5, color: '#7CF0B4' });
          }
          D.text(ctx, '水平相邻间距相等 ⇒ 水平匀速；竖直 Δy = gT² 恒定 ⇒ 自由落体', w / 2, hh - 10, { align: 'center', size: 11.5, weight: 700, color: '#fff' });
        } else {
          ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
          ctx.strokeStyle = '#596574'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(26, 22); ctx.lineTo(86, 56); ctx.lineTo(136, 56); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(26, 108); ctx.lineTo(86, 142); ctx.lineTo(w - 30, 142); ctx.stroke();
          ctx.strokeStyle = '#1661FF'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(136, 48); ctx.quadraticCurveTo(206, 48, 276, 134); ctx.stroke(); ctx.setLineDash([]);
          [176, 226, 276].forEach(function (px) {
            var frac = (px - 136) / 140;
            var py = 48 + frac * frac * 86;
            ctx.strokeStyle = 'rgba(18,169,196,0.45)'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, 134); ctx.stroke();
            drawBall(ctx, px, py, 6, '#84B5FF', '#1661FF');
            drawBall(ctx, px, 134, 6, '#7CF0B4', '#17784F');
          });
          D.text(ctx, '两球任意时刻在同一竖直线上并在末端相撞 ⇒ 水平分运动为匀速直线运动', w / 2, hh - 14, { align: 'center', size: 11.5, weight: 700, color: '#10233F' });
        }
      });
      function selS(m, idx) { modeS = m; ML.$$('.chip', barS).forEach(function (c, i) { c.classList.toggle('on', i === idx); }); stgS.invalidate('bg'); }
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
        wrap.appendChild(h('p.muted', '每个“试一试”按四拍进行：布置 → 运行 → 对比 → 追问与揭示。所有曲线与脉冲均由物理模型实时算出。'));
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
      { id: 'paper', label: '练·真题', mount: function (el) { new ML.Paper(el, Q, { title: C.title.replace('实验：', '') + ' · 练习', onReplay: adapter.replay }); } }
    ]
  });
  ML.bus.on('tab', function (tabId) {
    if (bench && bench.loop) bench.loop.setVisible(tabId === 'bench');
  });
  shell.go(S.tab);
  ML.perf.probe();
  ML.m04 = { bench: function () { return bench; }, adapter: adapter, shell: shell };
})(typeof window !== 'undefined' ? (window.ML = window.ML || {}) : (globalThis.ML = globalThis.ML || {}));
