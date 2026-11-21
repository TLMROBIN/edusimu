/* M08 scene — 验证动量守恒定律：碰撞+平抛/气垫导轨物理核心、双方案实验台、最小圆平均、诊断与讲解小部件。 */
(function (ML) {
  'use strict';

  var G = (ML.phys && ML.phys.G) || 9.80;
  var AIR = { gate1: 0.35, gate2: 0.85, start: 0.18, target: 0.60, length: 0.095, spring1: 0.53, spring2: 0.67 };
  var BALL_TYPES = {
    steel: { id: 'steel', name: '钢球', m: 0.045, c1: '#B8C3CF', c2: '#647282' },
    al:    { id: 'al',    name: '硬铝球', m: 0.015, c1: '#EFF4F8', c2: '#A5B2C0' },
    glass: { id: 'glass', name: '玻璃球', m: 0.012, c1: '#9CE3F8', c2: '#2395B8' }
  };

  /* =====================================================================
   *  一、纯物理计算核心（Node 与浏览器共用，ES2019）
   * ===================================================================== */
  function getRng(seed) {
    return ML.phys && ML.phys.rng ? ML.phys.rng(seed) : function () { return 0.5; };
  }

  function projectileLand(v, H, tiltDeg) {
    var rad = (tiltDeg || 0) * Math.PI / 180;
    var vx = v * Math.cos(rad);
    var vy0 = -v * Math.sin(rad); // 向下为正：末端上翘时 vy0 < 0
    var disc = vy0 * vy0 + 2 * G * H;
    var t = (-vy0 + Math.sqrt(Math.max(0, disc))) / G;
    return { x: vx * t, t: t, vx: vx, vy0: vy0 };
  }

  /** 单次斜槽平抛碰撞物理模型 */
  function chuteCollide(p) {
    p = p || {};
    var m1 = p.m1 != null ? p.m1 : 0.045;
    var m2 = p.m2 != null ? p.m2 : 0; // 0 表示不放被碰球（测 P）
    var e = p.e != null ? p.e : 0.98;
    var v0 = p.v0 != null ? p.v0 : 1.50;
    var H = p.H != null ? p.H : 0.500;
    var tiltDeg = p.tiltDeg || 0;
    var ideal = !!p.ideal;
    var jitter = !!p.releaseJitter;
    var rnd = getRng(p.seed || 17);

    var eEff = ideal ? (e >= 0.95 ? 1.0 : e) : e;
    var relNoise = ideal ? 0 : rnd.gauss(jitter ? 0.10 : 0.014);
    var vStart = Math.max(0.25, v0 * (1 + relNoise));

    if (!m2 || m2 <= 0) {
      var soloLand = projectileLand(vStart, H, tiltDeg);
      var sx = soloLand.x + (ideal ? 0 : rnd.gauss(jitter ? 0.006 : 0.0022));
      var sy = ideal ? 0 : rnd.gauss(jitter ? 0.005 : 0.0022);
      return {
        solo: true, vStart: vStart, v1After: vStart, v2After: null,
        v1Launch: vStart, v2Launch: null, rebound: false,
        tP: soloLand.t, tM: null, tN: null,
        xP: sx, xM: null, xN: null,
        pDot: { x: sx, y: sy, r: Math.hypot(sx, sy) }, mDot: null, nDot: null
      };
    }

    var v1After = ((m1 - eEff * m2) / (m1 + m2)) * vStart;
    var v2After = ((1 + eEff) * m1 / (m1 + m2)) * vStart;
    var rebound = v1After < -1e-6;
    // 若 m1 < m2 发生反弹：入射球沿斜槽倒滚一段并损耗机械能后再次滑出，速度与方向明显畸变
    var v1Launch = v1After;
    if (rebound) {
      var backNoise = ideal ? 0 : rnd.gauss(0.05);
      v1Launch = Math.max(0.06, Math.abs(v1After) * 0.52 + backNoise);
    }

    var lM = projectileLand(v1Launch, H, tiltDeg);
    var lN = projectileLand(v2After, H, tiltDeg);
    var latSigma = ideal ? 0 : (jitter ? 0.006 : 0.0024);
    var mx = Math.max(0.01, lM.x + (ideal ? 0 : rnd.gauss(rebound ? 0.012 : latSigma)));
    var my = ideal ? 0 : rnd.gauss(rebound ? 0.008 : latSigma);
    var nx = Math.max(0.02, lN.x + (ideal ? 0 : rnd.gauss(latSigma)));
    var ny = ideal ? 0 : rnd.gauss(latSigma);

    return {
      solo: false, vStart: vStart, v1After: v1After, v2After: v2After,
      v1Launch: v1Launch, v2Launch: v2After, rebound: rebound,
      tP: projectileLand(vStart, H, tiltDeg).t, tM: lM.t, tN: lN.t,
      xP: null, xM: mx, xN: nx,
      pDot: null,
      mDot: { x: mx, y: my, r: Math.hypot(mx, my) },
      nDot: { x: nx, y: ny, r: Math.hypot(nx, ny) }
    };
  }

  /* ---------- 精确最小包围圆（2点直径圆 + 3点外接圆） ---------- */
  function circle2(a, b) {
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, r: Math.hypot(a.x - b.x, a.y - b.y) / 2 };
  }
  function circle3(a, b, c) {
    var d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-12) return null;
    var a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
    var cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
    var cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
    return { cx: cx, cy: cy, r: Math.hypot(a.x - cx, a.y - cy) };
  }
  function insideAll(c, pts) {
    for (var i = 0; i < pts.length; i++) {
      if (Math.hypot(pts[i].x - c.cx, pts[i].y - c.cy) > c.r + 1e-9) return false;
    }
    return true;
  }
  function convexHull(pts) {
    if (pts.length <= 3) return pts.slice();
    var s = pts.slice().sort(function (a, b) { return a.x !== b.x ? a.x - b.x : a.y - b.y; });
    var uniq = [], i;
    for (i = 0; i < s.length; i++) {
      if (!i || Math.abs(s[i].x - s[i - 1].x) > 1e-12 || Math.abs(s[i].y - s[i - 1].y) > 1e-12) uniq.push(s[i]);
    }
    if (uniq.length <= 3) return uniq;
    function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
    var lo = [], hi = [];
    for (i = 0; i < uniq.length; i++) {
      while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], uniq[i]) <= 0) lo.pop();
      lo.push(uniq[i]);
    }
    for (i = uniq.length - 1; i >= 0; i--) {
      while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], uniq[i]) <= 0) hi.pop();
      hi.push(uniq[i]);
    }
    lo.pop(); hi.pop();
    return lo.concat(hi);
  }
  function minCircle(rawPts) {
    var pts = (rawPts || []).map(function (p) { return Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y }; });
    if (!pts.length) return null;
    if (pts.length === 1) return { cx: pts[0].x, cy: pts[0].y, r: 0.002, dist: Math.hypot(pts[0].x, pts[0].y) };
    var hPts = convexHull(pts), n = hPts.length;
    if (n === 1) return { cx: hPts[0].x, cy: hPts[0].y, r: 0.002, dist: Math.hypot(hPts[0].x, hPts[0].y) };
    var best = null, i, j, k, c;
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        c = circle2(hPts[i], hPts[j]);
        if ((!best || c.r < best.r) && insideAll(c, hPts)) best = c;
      }
    }
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        for (k = j + 1; k < n; k++) {
          c = circle3(hPts[i], hPts[j], hPts[k]);
          if (c && (!best || c.r < best.r) && insideAll(c, hPts)) best = c;
        }
      }
    }
    if (!best) best = circle2(hPts[0], hPts[1]);
    return { cx: best.cx, cy: best.cy, r: Math.max(best.r, 0.002), dist: Math.hypot(best.cx, best.cy) };
  }

  /** 批量打点并定最小圆 */
  function chuteSeries(p, nShots) {
    nShots = nShots || 10;
    var baseSeed = p.seed || 31;
    var pDots = [], mDots = [], nDots = [];
    for (var i = 0; i < nShots; i++) {
      var res = chuteCollide(Object.assign({}, p, { seed: baseSeed + i * 17 }));
      if (res.solo) pDots.push(res.pDot);
      else { mDots.push(res.mDot); nDots.push(res.nDot); }
    }
    return {
      pDots: pDots, mDots: mDots, nDots: nDots,
      P: minCircle(pDots), M: minCircle(mDots), N: minCircle(nDots)
    };
  }

  function chuteCheck(m1, m2, OP, OM, ON) {
    var pBefore = m1 * OP, pAfter = m1 * OM + m2 * ON;
    var relErr = pBefore ? (pAfter - pBefore) / pBefore : 0;
    var elSum = OP + OM, elDiff = ON ? (elSum - ON) / ON : 0;
    return { pBefore: pBefore, pAfter: pAfter, relErr: relErr, elSum: elSum, elDiff: elDiff };
  }

  /** 光电门精确遮光时间（已知入口速度 vEntry、导轨加速度 aSign、遮光片宽 d） */
  function gateTransitTime(vEntry, aAlong, d) {
    if (vEntry <= 1e-6) return Infinity;
    if (Math.abs(aAlong) < 1e-8) return d / vEntry;
    var disc = vEntry * vEntry + 2 * aAlong * d;
    if (disc <= 0) return Infinity;
    return (-vEntry + Math.sqrt(disc)) / aAlong;
  }

  /** 气垫导轨 + 双光电门物理核心 */
  function airtrackRun(p) {
    p = p || {};
    var airMode = p.airMode || 'elastic'; // 'elastic' | 'inelastic' | 'spring' | 'level'
    var m1 = p.m1 != null ? p.m1 : 0.200;
    var m2 = p.m2 != null ? p.m2 : 0.100;
    var d1 = p.d1 != null ? p.d1 : 0.010;
    var d2 = p.d2 != null ? p.d2 : 0.010;
    var tiltDeg = p.tiltDeg || 0; // 正值：右端偏高（沿 +x 加速度为负）
    var ideal = !!p.ideal;
    var v0 = p.v0 != null ? p.v0 : 0.80;
    var Ep = p.Ep != null ? p.Ep : 0.060;
    var rnd = getRng(p.seed || 41);

    var rad = tiltDeg * Math.PI / 180;
    var mu = ideal ? 0 : 0.0004;
    var xG1 = AIR.gate1, xG2 = AIR.gate2, xC = AIR.target, xStart = AIR.start;
    var xContact = xC - AIR.length;

    function speedAfterDisp(vIn, a, dx) {
      var v2 = vIn * vIn + 2 * a * dx;
      return v2 > 0 ? Math.sqrt(v2) : 0;
    }
    function jitterDt(dt) {
      if (!isFinite(dt) || ideal) return dt;
      return dt * (1 + rnd.gauss(0.002));
    }

    if (airMode === 'level') {
      // 单滑块自左向右（xStart -> xG1 -> xG2）检验水平
      var aR = -G * Math.sin(rad) - mu * G * Math.cos(rad);
      var vAtG1 = speedAfterDisp(v0, aR, xG1 - d1 / 2 - xStart);
      var dt1 = jitterDt(gateTransitTime(vAtG1, aR, d1));
      var vAtG2 = speedAfterDisp(v0, aR, xG2 - d1 / 2 - xStart);
      var dt2 = jitterDt(gateTransitTime(vAtG2, aR, d1));
      return {
        airMode: airMode, m1: m1, m2: m2, d1: d1, d2: d2, tiltDeg: tiltDeg, v0: v0, a: aR,
        dt1: dt1, dt2: dt2, v1: d1 / dt1, v2: d1 / dt2,
        pBefore: m1 * (d1 / dt1), pAfter: m1 * (d1 / dt2),
        relErr: ((d1 / dt2) - (d1 / dt1)) / (d1 / dt1),
        ekRatio: null
      };
    }

    if (airMode === 'spring') {
      var eEff = Ep * (ideal ? 1.0 : 0.985);
      var v1s = Math.sqrt((2 * eEff * m2) / (m1 * (m1 + m2)));
      var v2s = Math.sqrt((2 * eEff * m1) / (m2 * (m1 + m2)));
      // P 向左运动 (-x)：倾角向右高时向左加速；Q 向右运动 (+x)：倾角向右高时向右减速
      var aLeft = G * Math.sin(rad) - mu * G * Math.cos(rad);   // 沿 -x 正方向的加速度
      var aRight = -G * Math.sin(rad) - mu * G * Math.cos(rad); // 沿 +x 正方向的加速度
      var v1Entry = speedAfterDisp(v1s, aLeft, AIR.spring1 - xG1 - d1 / 2);
      var v2Entry = speedAfterDisp(v2s, aRight, xG2 - AIR.spring2 - d2 / 2);
      var dt1s = jitterDt(gateTransitTime(v1Entry, aLeft, d1));
      var dt2s = jitterDt(gateTransitTime(v2Entry, aRight, d2));
      var v1Meas = isFinite(dt1s) ? d1 / dt1s : 0;
      var v2Meas = isFinite(dt2s) ? d2 / dt2s : 0;
      var p1 = m1 * v1Meas, p2 = m2 * v2Meas;
      var relS = p1 > 0 ? (p2 - p1) / p1 : 0;
      return {
        airMode: airMode, m1: m1, m2: m2, d1: d1, d2: d2, tiltDeg: tiltDeg,
        v1Init: v1s, v2Init: v2s, aLeft: aLeft, aRight: aRight,
        dt1: dt1s, dt2: dt2s, v1: v1Meas, v2: v2Meas,
        p1: p1, p2: p2, pBefore: 0, pAfter: p2 - p1, relErr: relS, ekRatio: null
      };
    }

    // 'elastic' | 'inelastic'：滑块 1 自 xStart 向右过光电门 1，中心到达 xContact 时与静止的滑块 2 接触
    var a1 = -G * Math.sin(rad) - mu * G * Math.cos(rad);
    var v1EntryG1 = speedAfterDisp(v0, a1, xG1 - d1 / 2 - xStart);
    var dt1Pre = jitterDt(gateTransitTime(v1EntryG1, a1, d1));
    var v1MeasPre = d1 / dt1Pre;
    var v1AtC = speedAfterDisp(v0, a1, xContact - xStart);
    var tContact = v1AtC > 0 ? 2 * (xContact - xStart) / (v0 + v1AtC) : Infinity;

    var eCol = airMode === 'inelastic' ? 0 : (ideal ? 1.0 : 0.985);
    var v1Post = ((m1 - eCol * m2) / (m1 + m2)) * v1AtC;
    var v2Post = ((1 + eCol) * m1 / (m1 + m2)) * v1AtC;

    var dt2Post = Infinity, dt1Post = Infinity;
    var v2MeasPost = 0, v1MeasPost = 0;

    if (airMode === 'inelastic') {
      var vCombEntry = speedAfterDisp(v2Post, a1, (xG2 - xC) - d1 / 2);
      dt2Post = jitterDt(gateTransitTime(vCombEntry, a1, d1));
      v2MeasPost = isFinite(dt2Post) ? d1 / dt2Post : 0;
      v1MeasPost = v2MeasPost;
    } else {
      var v2EntryG2 = speedAfterDisp(v2Post, a1, (xG2 - xC) - d2 / 2);
      dt2Post = jitterDt(gateTransitTime(v2EntryG2, a1, d2));
      v2MeasPost = isFinite(dt2Post) ? d2 / dt2Post : 0;
      if (v1Post > 1e-4) {
        var v1EntryG2 = speedAfterDisp(v1Post, a1, (xG2 - xContact) - d1 / 2);
        dt1Post = jitterDt(gateTransitTime(v1EntryG2, a1, d1));
        v1MeasPost = isFinite(dt1Post) ? d1 / dt1Post : 0;
      } else if (v1Post < -1e-4) {
        var aBack = G * Math.sin(rad) - mu * G * Math.cos(rad);
        var v1RebEntry = speedAfterDisp(Math.abs(v1Post), aBack, (xContact - xG1) - d1 / 2);
        dt1Post = jitterDt(gateTransitTime(v1RebEntry, aBack, d1));
        v1MeasPost = isFinite(dt1Post) ? -(d1 / dt1Post) : 0;
      } else {
        v1MeasPost = 0;
      }
    }

    var pBefore = m1 * v1MeasPre;
    var pAfter = airMode === 'inelastic' ? (m1 + m2) * v2MeasPost : m1 * v1MeasPost + m2 * v2MeasPost;
    var ekBefore = 0.5 * m1 * v1MeasPre * v1MeasPre;
    var ekAfter = airMode === 'inelastic'
      ? 0.5 * (m1 + m2) * v2MeasPost * v2MeasPost
      : 0.5 * m1 * v1MeasPost * v1MeasPost + 0.5 * m2 * v2MeasPost * v2MeasPost;

    return {
      airMode: airMode, m1: m1, m2: m2, d1: d1, d2: d2, tiltDeg: tiltDeg,
      a: a1, axBack: -G * Math.sin(rad) + mu * G * Math.cos(rad),
      v0: v0, tContact: tContact, xContact: xContact, v1AtC: v1AtC, v1Post: v1Post, v2Post: v2Post,
      dt1: dt1Pre, dt2: dt2Post, dt1Post: dt1Post,
      v1: v1MeasPre, v1Out: v1MeasPost, v2: v2MeasPost,
      pBefore: pBefore, pAfter: pAfter,
      relErr: pBefore ? (pAfter - pBefore) / pBefore : 0,
      ekBefore: ekBefore, ekAfter: ekAfter,
      ekRatio: ekBefore > 0 ? ekAfter / ekBefore : 0
    };
  }

  ML.m08phys = {
    BALL_TYPES: BALL_TYPES,
    projectileLand: projectileLand,
    chuteCollide: chuteCollide,
    minCircle: minCircle,
    chuteSeries: chuteSeries,
    chuteCheck: chuteCheck,
    gateTransitTime: gateTransitTime,
    airtrackRun: airtrackRun
  };

  if (typeof document === 'undefined') return;

  /* =====================================================================
   *  二、浏览器端变量与存档
   * ===================================================================== */
  var h = ML.h, M = ML.math, P = ML.phys, PH = ML.m08phys, D = ML.stage.draw;
  var C = ML.json('ml-content'), Q = ML.json('ml-questions') || [];
  var S = ML.store.init(C.slug, {
    v: 1, tab: 'learn', learnPage: 0, mode: 'guided', ideal: false,
    bench: { scheme: 'chute', m1: 'steel', m2: 'al', e: 0.98, airMode: 'elastic', dMm: 10.0 },
    answers: {}, done: {}
  });
  var ERR = {}; C.errors.forEach(function (e) { ERR[e.id] = e; });
  var PROC = {}; C.procedure.forEach(function (p) { PROC[p.id] = p; });
  var seedCounter = 23;

  function fmtCm(m) { return (m * 100).toFixed(2); }
  function fmtPct(x) { return (x * 100).toFixed(2) + '%'; }
  function ballLabel(key) { var b = BALL_TYPES[key]; return b ? b.name + ' ' + Math.round(b.m * 1000) + 'g' : '无'; }

  /* ---------- 嵌入式仪器读数弹窗（复用 ML.gaugesView） ---------- */
  function openGaugePicker(curMm, dPrec, onAdopt) {
    if (typeof dPrec === 'function') { onAdopt = dPrec; dPrec = 1; }
    var modal = null;
    var isMic = dPrec === 3 || Math.abs(curMm - 6.86) < 0.05;
    var st = {
      type: isMic ? 'micrometer' : 'caliper',
      div: 10, valMm: Math.min(45, Math.max(4, curMm)),
      trueMm: Math.min(14, Math.max(1, curMm)), zeroErrMm: 0
    };
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      document.removeEventListener('keydown', onKey);
      if (modal) { modal.remove(); modal = null; }
    }
    var sw = h('div.side-row',
      h('button.chip' + (st.type === 'caliper' ? '.on' : ''), { type: 'button', onclick: function () { switchType('caliper'); } }, '10 分度游标卡尺'),
      h('button.chip' + (st.type === 'micrometer' ? '.on' : ''), { type: 'button', onclick: function () { switchType('micrometer'); } }, '螺旋测微器（千分尺）'),
      h('button.chip', { type: 'button', onclick: function () { setPreset(10.0, 'caliper'); } }, '预设 10.0 mm'),
      h('button.chip', { type: 'button', onclick: function () { setPreset(6.860, 'micrometer'); } }, '预设 6.860 mm'));
    var box = h('div');
    var info = h('div.cmp-note');
    var adoptBtn = h('button.btn.primary', { type: 'button', onclick: function () {
      var v = gb.value(), t = st.type; close(); if (onAdopt) onAdopt(v, t);
    } }, '采用此遮光片宽度 d');
    modal = h('div.ml-modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '测量遮光片宽度 d', onclick: function (e) { if (e.target === modal) close(); } },
      h('div.ml-modal-card.gauge-modal-card',
        h('div.try-head', h('div', h('div.try-k', '仪器读数复用'), h('h2', '测量遮光片宽度 d（拖动或长按看放大镜）')), h('button.btn', { type: 'button', onclick: close }, '关闭')),
        sw, box, info, h('div.try-actions', adoptBtn)));
    document.body.appendChild(modal);
    document.addEventListener('keydown', onKey);
    var gb = new ML.gaugesView.GaugeBench(box, { height: 270, state: st, onChange: updateInfo });
    function syncChips(t) {
      var cs = ML.$$('.chip', sw);
      if (cs[0]) cs[0].classList.toggle('on', t === 'caliper');
      if (cs[1]) cs[1].classList.toggle('on', t === 'micrometer');
    }
    function updateInfo() {
      var sCur = (gb && gb.st) || st;
      st.type = sCur.type || st.type;
      st.valMm = sCur.valMm != null ? sCur.valMm : st.valMm;
      st.trueMm = sCur.trueMm != null ? sCur.trueMm : st.trueMm;
      syncChips(st.type);
      var val = gb.value();
      info.innerHTML = st.type === 'caliper'
        ? '游标卡尺（不估读）：当前遮光片宽度 d = <b>' + val.toFixed(1) + ' mm</b>（' + (val / 10).toFixed(2) + ' cm）'
        : '螺旋测微器（估读到 0.001 mm）：当前遮光片宽度 d = <b>' + val.toFixed(3) + ' mm</b>';
    }
    function switchType(t) { st.type = t; syncChips(t); gb.set({ type: t }); updateInfo(); }
    function setPreset(val, t) {
      st.type = t;
      if (t === 'caliper') st.valMm = val; else st.trueMm = val;
      syncChips(t); gb.set({ type: t, valMm: st.valMm, trueMm: st.trueMm }); updateInfo();
    }
    updateInfo();
  }

  /* =====================================================================
   *  三、② 做·实验（斜槽平抛 + 气垫导轨双方案）
   * ===================================================================== */
  var bench = null;
  function Bench(el) {
    var self = this; this.el = el;
    var sb = S.bench || {};
    this.mode = S.mode || 'guided';
    this.scheme = sb.scheme || 'chute';
    this.speed = 1;
    this.done = {};

    // 方案一状态
    this.ch = {
      m1: sb.m1 || 'steel', m2: sb.m2 || 'al', e: sb.e != null ? sb.e : 0.98,
      hasM2: false, tiltDeg: 0, releaseJitter: false, H: 0.500,
      pDots: [], mDots: [], nDots: [], P: null, M: null, N: null,
      anim: null, lastRes: null
    };
    // 方案二状态
    var initDMm = sb.dMm || 10.0;
    this.at = {
      airMode: sb.airMode || 'elastic', m1: 0.200, m2: 0.100,
      dMm: initDMm, dPrec: (sb.dPrec === 3 || Math.abs(initDMm - 6.86) < 0.05) ? 3 : 1,
      tiltDeg: 0,
      anim: null, res: null
    };

    var modeChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'guided' }, onclick: function () { self.setMode('guided'); } }, '引导模式'),
      h('button.chip', { type: 'button', data: { v: 'free' }, onclick: function () { self.setMode('free'); } }, '自由模式'));
    this.modeChips = modeChips;
    this.schChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'chute' }, onclick: function () { self.setScheme('chute'); } }, '方案一：斜槽平抛'),
      h('button.chip', { type: 'button', data: { v: 'airtrack' }, onclick: function () { self.setScheme('airtrack'); } }, '方案二：气垫导轨'));
    this.idealChip = h('button.chip', { type: 'button', title: '理想：e=1.00 且无随机抖动', onclick: function () {
      S.ideal = !S.ideal; ML.store.save();
      self.idealChip.classList.toggle('on', S.ideal);
      self.idealChip.textContent = S.ideal ? '理想条件' : '真实条件';
      self.stage.invalidate();
    } }, S.ideal ? '理想条件' : '真实条件');
    this.idealChip.classList.toggle('on', S.ideal);
    this.speedChip = h('button.chip', { type: 'button', onclick: function () {
      self.speed = self.speed === 1 ? 0.5 : self.speed === 0.5 ? 0.25 : 1;
      self.speedChip.textContent = '播放 ×' + self.speed;
    } }, '播放 ×1');
    this.bannerEl = h('div.bench-banner', { hidden: true });
    var headBar = h('div.bench-top', modeChips, this.schChips, h('div.spacer'), this.idealChip, this.speedChip);
    this.stageWrap = h('div.bench-stage');
    this.side = h('aside.bench-side');
    this.benchEl = h('div.bench', headBar, this.bannerEl, h('div.bench-row', this.stageWrap, this.side));
    el.appendChild(this.benchEl);

    this.stage = new ML.stage.Stage(this.stageWrap, { layers: ['bg', 'fg'] });
    this.stage.on('bg', function (ctx, w, hh) { self.drawBg(ctx, w, hh); });
    this.stage.on('fg', function (ctx, w, hh) { self.drawFg(ctx, w, hh); });
    this.mag = new ML.stage.Magnifier(this.stageWrap, { zoom: 3, size: 146 });
    this.loop = new ML.stage.Loop(function (dt) { return self.tick(dt); });
    this.bindPointer();
    this.setMode(this.mode, true);
    this.setScheme(this.scheme, true);
  }

  Bench.prototype.saveBench = function () {
    ML.store.set({
      bench: {
        scheme: this.scheme, m1: this.ch.m1, m2: this.ch.m2, e: this.ch.e,
        airMode: this.at.airMode, dMm: this.at.dMm, dPrec: this.at.dPrec
      }
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
    if (!silent) {
      this.setBanner(null);
      ML.toast(m === 'guided' ? '引导模式：按步骤操作，发现错误会讲解原因' : '自由模式：不拦截任何操作，可任意尝试并查看偏差');
    }
    this.renderSide();
  };
  Bench.prototype.setScheme = function (sc, silent) {
    this.scheme = sc;
    if (this.loop) this.loop.stop();
    this.ch.anim = null; this.at.anim = null;
    ML.$$('.chip', this.schChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === sc); });
    if (!silent) this.saveBench();
    this.stage.invalidate();
    this.renderSide();
  };

  /* ---------- 几何映射 ---------- */
  Bench.prototype.chuteGeo = function (w, hh) {
    var splitY = Math.round(hh * 0.56);
    var ox = Math.round(w * 0.23);
    var maxMeter = 0.98;
    var pxPerM = Math.max(200, (w - ox - 28) / maxMeter);
    var lipX = ox, lipY = Math.round(splitY * 0.43), floorY = splitY - 12;
    return {
      splitY: splitY, ox: ox, pxPerM: pxPerM,
      lipX: lipX, lipY: lipY, floorY: floorY,
      X: function (m) { return ox + m * pxPerM; },
      paperTop: splitY + 14, paperH: hh - splitY - 24,
      paperMidY: splitY + 14 + (hh - splitY - 24) * 0.46
    };
  };
  Bench.prototype.airGeo = function (w, hh) {
    var trackX = Math.round(w * 0.08), trackW = Math.round(w * 0.84);
    var trackY = Math.round(hh * 0.54);
    var pxPerM = trackW / 1.20;
    return {
      trackX: trackX, trackW: trackW, trackY: trackY, pxPerM: pxPerM,
      X: function (m) { return trackX + m * pxPerM; },
      g1: AIR.gate1, g2: AIR.gate2, c: AIR.target
    };
  };

  /* ---------- 静态层绘制 ---------- */
  Bench.prototype.drawBg = function (ctx, w, hh) {
    ctx.fillStyle = '#EAF1F8'; ctx.fillRect(0, 0, w, hh);
    if (this.scheme === 'chute') this.drawChuteBg(ctx, w, hh);
    else this.drawAirBg(ctx, w, hh);
  };
  Bench.prototype.drawChuteBg = function (ctx, w, hh) {
    var g = this.chuteGeo(w, hh), ch = this.ch;
    // 上半部分：2.5D 侧视台
    ctx.fillStyle = '#F5F9FE'; ctx.fillRect(0, 0, w, g.splitY);
    // 地面与木板
    ctx.fillStyle = D.grad(ctx, 0, g.floorY, 0, g.splitY, ['#DFC49A', '#C8A571']);
    ctx.fillRect(0, g.floorY, w, g.splitY - g.floorY);
    ctx.strokeStyle = '#9C7A47'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, g.floorY); ctx.lineTo(w, g.floorY); ctx.stroke();

    // 桌台与支架
    var tblY = g.lipY + 10;
    ctx.fillStyle = D.grad(ctx, 0, tblY, 0, tblY + 12, ['#E6CBA2', '#C49F6B']);
    ctx.fillRect(14, tblY, g.lipX - 18, 12);
    ctx.strokeStyle = '#8E6B38'; ctx.strokeRect(14, tblY, g.lipX - 18, 12);
    ctx.fillStyle = '#8E99A6';
    ctx.fillRect(Math.max(24, g.lipX - 96), tblY + 12, 14, g.floorY - tblY - 12);

    // 斜槽轨道（按 tiltDeg 渲染末尾上翘/水平）
    var tiltRad = (ch.tiltDeg || 0) * Math.PI / 180;
    var flatLen = 58, endX = g.lipX, endY = g.lipY - Math.sin(tiltRad) * flatLen;
    var elbowX = g.lipX - flatLen, elbowY = g.lipY;
    var topStartX = Math.max(22, elbowX - 74), topStartY = Math.max(24, elbowY - 48);
    ctx.strokeStyle = '#3B4B60'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(topStartX, topStartY); ctx.quadraticCurveTo(elbowX - 24, elbowY, elbowX, elbowY); ctx.lineTo(endX, endY); ctx.stroke();
    ctx.strokeStyle = '#DCE4EC'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(topStartX, topStartY); ctx.quadraticCurveTo(elbowX - 24, elbowY, elbowX, elbowY); ctx.lineTo(endX, endY); ctx.stroke();
    ctx.lineCap = 'butt'; ctx.lineWidth = 1;

    // 释放标记 S
    var sX = topStartX + 16, sY = topStartY + 10;
    ctx.strokeStyle = '#C7374B'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sX - 7, sY - 9); ctx.lineTo(sX + 7, sY + 5); ctx.stroke();
    D.text(ctx, '释放点 S', sX - 4, sY + 24, { align: 'center', size: 11.5, weight: 700, color: '#C7374B' });
    if (ch.tiltDeg) {
      D.text(ctx, '⚠ 末端上翘 +' + ch.tiltDeg + '°', endX + 10, endY - 8, { size: 11.5, weight: 700, color: '#C7374B' });
    } else {
      D.text(ctx, '末端水平 0°', endX + 10, endY - 8, { size: 11.5, weight: 600, color: '#17784F' });
    }

    // 重垂线定 O 点
    ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#4A5B73'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(endX, endY + 4); ctx.lineTo(endX, g.floorY - 8); ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#4A5B73';
    ctx.beginPath(); ctx.moveTo(endX, g.floorY); ctx.lineTo(endX - 4, g.floorY - 9); ctx.lineTo(endX + 4, g.floorY - 9); ctx.closePath(); ctx.fill();
    D.text(ctx, 'O', endX, g.floorY + 11, { align: 'center', size: 12, weight: 700 });
    D.text(ctx, '桌面高 H = ' + ch.H.toFixed(2) + ' m（不必测量）', 16, 20, { size: 11.5, color: '#4A5B73' });

    // 分隔线
    ctx.fillStyle = '#DCE5F0'; ctx.fillRect(0, g.splitY, w, 4);

    // 下半部分：白纸落点区（俯视图）
    ctx.fillStyle = '#FBFAF5';
    D.rr(ctx, 12, g.paperTop, w - 24, g.paperH, 10); ctx.fill();
    ctx.strokeStyle = '#C9BFA8'; ctx.lineWidth = 1.2; ctx.stroke();
    D.text(ctx, '白纸落点区（俯视图）· 按住出现 3× 放大镜', 22, g.paperTop + 16, { size: 11.5, weight: 700, color: '#4A5B73' });

    // 刻度尺（从 O = 0 cm 起，延伸至 95 cm 覆盖 H = 0.80 m 射程）
    var rulerY = g.paperTop + g.paperH - 22;
    ctx.strokeStyle = '#7E8C9B'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.ox, rulerY); ctx.lineTo(w - 22, rulerY);
    for (var cm = 0; cm <= 95; cm += 1) {
      var rx = g.X(cm / 100);
      if (rx > w - 20) break;
      var maj = cm % 10 === 0, mid = cm % 5 === 0;
      ctx.moveTo(rx, rulerY); ctx.lineTo(rx, rulerY + (maj ? 9 : mid ? 6 : 3));
      if (maj) D.text(ctx, cm === 0 ? '0(O)' : String(cm), rx, rulerY + 19, { align: 'center', size: 10.5, weight: cm === 0 ? 700 : 500, color: '#4A5B73' });
    }
    ctx.stroke();
    D.text(ctx, 'cm', w - 22, rulerY + 19, { align: 'right', size: 10.5, color: '#4A5B73' });
    // O 点基线
    ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = '#8E99A6';
    ctx.beginPath(); ctx.moveTo(g.ox, g.paperTop + 22); ctx.lineTo(g.ox, rulerY); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#10233F'; ctx.beginPath(); ctx.arc(g.ox, g.paperMidY, 3.2, 0, Math.PI * 2); ctx.fill();
    D.text(ctx, 'O', g.ox - 10, g.paperMidY + 4, { align: 'right', size: 12, weight: 700 });
  };

  Bench.prototype.drawAirBg = function (ctx, w, hh) {
    var g = this.airGeo(w, hh), at = this.at;
    ctx.fillStyle = '#F5F9FE'; ctx.fillRect(0, 0, w, hh);
    // 实验台底座
    var baseY = g.trackY + 34;
    ctx.fillStyle = D.grad(ctx, 0, baseY, 0, hh, ['#E0C49A', '#C49F6B']);
    ctx.fillRect(0, baseY, w, hh - baseY);
    ctx.fillStyle = '#A5814F'; ctx.fillRect(0, baseY, w, 3);

    // 导轨（可随 tiltDeg 倾斜）
    ctx.save();
    var pivotX = g.X(0.05), pivotY = g.trackY + 8;
    var visualAng = -(at.tiltDeg || 0) * 2.2 * Math.PI / 180; // 放大可视倾角便于辨识
    ctx.translate(pivotX, pivotY); ctx.rotate(visualAng); ctx.translate(-pivotX, -pivotY);

    // 垫块（歪斜时右端出现垫块）
    if (at.tiltDeg > 0) {
      ctx.fillStyle = '#C7374B'; ctx.fillRect(g.X(1.10) - 10, g.trackY + 12, 20, 14);
      D.text(ctx, '右端偏高 +' + at.tiltDeg + '°', g.X(1.10), g.trackY + 38, { align: 'center', size: 11, weight: 700, color: '#C7374B' });
    }
    ctx.fillStyle = D.grad(ctx, 0, g.trackY - 4, 0, g.trackY + 12, ['#DCE4EC', '#9AA7B5']);
    D.rr(ctx, g.trackX, g.trackY - 4, g.trackW, 16, 4); ctx.fill();
    ctx.strokeStyle = '#596574'; ctx.stroke();

    // 刻度
    ctx.strokeStyle = '#4A5B73'; ctx.beginPath();
    for (var cm = 0; cm <= 120; cm += 5) {
      var sx = g.X(cm / 100);
      ctx.moveTo(sx, g.trackY + 12); ctx.lineTo(sx, g.trackY + (cm % 20 === 0 ? 5 : 8));
      if (cm % 20 === 0) D.text(ctx, String(cm), sx, g.trackY + 24, { align: 'center', size: 10, color: '#4A5B73' });
    }
    ctx.stroke();

    // 两个光电门支架
    [g.g1, g.g2].forEach(function (gp, i) {
      var gx = g.X(gp);
      ctx.fillStyle = '#3B4B60'; D.rr(ctx, gx - 6, g.trackY - 76, 12, 72, 3); ctx.fill();
      D.text(ctx, '光电门 ' + (i + 1), gx, g.trackY - 84, { align: 'center', size: 12, weight: 700 });
    });
    ctx.restore();
    D.text(ctx, '两光电门间距 0.500 m（气垫导轨）', w / 2, 22, { align: 'center', size: 12, color: '#4A5B73', weight: 600 });
  };

  /* ---------- 动态层绘制 ---------- */
  Bench.prototype.drawFg = function (ctx, w, hh) {
    this.hot = [];
    if (this.scheme === 'chute') this.drawChuteFg(ctx, w, hh);
    else this.drawAirFg(ctx, w, hh);
  };

  Bench.prototype.drawChuteFg = function (ctx, w, hh) {
    var g = this.chuteGeo(w, hh), ch = this.ch;
    var b1 = BALL_TYPES[ch.m1], b2 = BALL_TYPES[ch.m2];
    var rBall = 7.5;
    var tiltRad = (ch.tiltDeg || 0) * Math.PI / 180;
    var flatLen = 58, endX = g.lipX, endY = g.lipY - Math.sin(tiltRad) * flatLen;
    var elbowX = g.lipX - flatLen, elbowY = g.lipY;
    var topStartX = Math.max(22, elbowX - 74), topStartY = Math.max(24, elbowY - 48);

    function drawSphere(x, y, ball, lbl) {
      ctx.fillStyle = D.grad(ctx, x - rBall, y - rBall, x + rBall, y + rBall, [ball.c1, ball.c2]);
      ctx.beginPath(); ctx.arc(x, y, rBall, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.1; ctx.stroke();
      if (lbl) D.text(ctx, lbl, x, y - rBall - 4, { align: 'center', size: 11, weight: 700 });
    }

    // 上部斜槽小球与轨迹动画
    if (ch.anim) {
      var a = ch.anim, res = a.res;
      // 过往辅助轨迹弧线（淡虚线）
      if (a.phase === 'fly') {
        var dt = a.t - a.tCol;
        var drawArc = function (vL, col, tMax) {
          var rad = (ch.tiltDeg || 0) * Math.PI / 180;
          var vx = vL * Math.cos(rad), vy0 = -vL * Math.sin(rad);
          var tt = Math.min(dt, tMax);
          var bx = endX + vx * tt * g.pxPerM;
          var by = (endY - rBall) + (vy0 * tt + 0.5 * G * tt * tt) * ((g.floorY - (endY - rBall)) / ch.H);
          return { x: bx, y: Math.min(g.floorY - rBall, by) };
        };
        if (res.solo) {
          var p1 = drawArc(res.v1Launch, '#1661FF', res.tP);
          drawSphere(p1.x, p1.y, b1, 'm₁');
        } else {
          var p2 = drawArc(res.v2Launch, '#12A9C4', res.tN);
          drawSphere(p2.x, p2.y, b2, 'm₂');
          if (res.rebound && dt < 0.28) {
            // 反弹回滚动画：向斜槽倒退再滚回
            var frac = Math.sin((dt / 0.28) * Math.PI);
            drawSphere(endX - frac * 42, endY - rBall - frac * 14, b1, '反弹!');
          } else {
            var dt1 = res.rebound ? Math.max(0, dt - 0.28) : dt;
            var rad2 = (ch.tiltDeg || 0) * Math.PI / 180;
            var vx1 = res.v1Launch * Math.cos(rad2), vy1 = -res.v1Launch * Math.sin(rad2);
            var tt1 = Math.min(dt1, res.tM);
            var bx1 = endX + vx1 * tt1 * g.pxPerM;
            var by1 = (endY - rBall) + (vy1 * tt1 + 0.5 * G * tt1 * tt1) * ((g.floorY - (endY - rBall)) / ch.H);
            drawSphere(bx1, Math.min(g.floorY - rBall, by1), b1, 'm₁');
          }
        }
      } else {
        // 沿斜槽滑下阶段
        var u = Math.min(1, a.t / a.tCol);
        var sx = topStartX + 16 + (endX - (topStartX + 16)) * u * u;
        var sy = (topStartY + 10) * (1 - u * u) + (endY - rBall) * (u * u);
        drawSphere(sx, sy, b1, 'm₁');
        if (ch.hasM2) drawSphere(endX, endY - rBall, b2, 'm₂');
      }
    } else {
      drawSphere(topStartX + 16, topStartY + 4, b1, 'm₁(点击释放)');
      if (ch.hasM2) {
        drawSphere(endX, endY - rBall, b2, 'm₂');
      } else {
        ctx.save(); ctx.setLineDash([3, 2]); ctx.strokeStyle = '#12A9C4'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(endX, endY - rBall, rBall, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        D.text(ctx, '点此放 m₂', endX + 10, endY + 16, { size: 11, color: '#0E8CA3', weight: 600 });
      }
      this.hot.push({ id: 'release1', x: topStartX - 8, y: topStartY - 18, w: 68, h: 48 });
      this.hot.push({ id: 'toggleM2', x: endX - 24, y: endY - 30, w: 54, h: 48 });
    }

    // 下半部分：白纸上的落点簇 + 最小圆
    var scaleY = 180; // 横向用 g.pxPerM，横向散布垂直方向缩放
    function plotDots(dots, col, circle, lbl) {
      dots.forEach(function (d) {
        var px = g.X(d.x), py = g.paperMidY + d.y * scaleY;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, 2.7, 0, Math.PI * 2); ctx.fill();
      });
      if (circle) {
        var cx = g.X(circle.cx), cy = g.paperMidY + circle.cy * scaleY;
        var radPx = Math.max(8, circle.r * g.pxPerM);
        ctx.strokeStyle = col; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(cx, cy, radPx, 0, Math.PI * 2); ctx.stroke();
        // 十字圆心
        ctx.beginPath(); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5); ctx.stroke();
        D.text(ctx, lbl + ' (' + fmtCm(circle.dist) + 'cm)', cx, cy - radPx - 5, { align: 'center', size: 11.5, weight: 700, color: col });
      }
    }
    plotDots(ch.pDots, '#1661FF', ch.P, 'P');
    plotDots(ch.mDots, '#9A5A00', ch.M, 'M');
    plotDots(ch.nDots, '#17784F', ch.N, 'N');
    this.hot.push({ id: 'paper', x: 12, y: g.paperTop, w: w - 24, h: g.paperH });
  };

  Bench.prototype.drawAirFg = function (ctx, w, hh) {
    var g = this.airGeo(w, hh), at = this.at;
    var rad = -(at.tiltDeg || 0) * 2.2 * Math.PI / 180;
    var pivotX = g.X(0.05), pivotY = g.trackY + 8;

    ctx.save();
    ctx.translate(pivotX, pivotY); ctx.rotate(rad); ctx.translate(-pivotX, -pivotY);

    var p1x = AIR.start, p2x = AIR.target;
    if (at.airMode === 'spring') { p1x = AIR.spring1; p2x = AIR.spring2; }
    else if (at.airMode === 'level') { p1x = AIR.start; p2x = null; }
    if (at.anim) { p1x = at.anim.x1; p2x = at.anim.x2; }

    var cartW = AIR.length * g.pxPerM, cartH = 22, flagW = Math.max(3, (at.dMm / 1000) * g.pxPerM);
    function drawSlider(xm, col, lbl, flag) {
      if (xm == null) return;
      var cx = g.X(xm) - cartW / 2, cy = g.trackY - cartH - 4;
      ctx.fillStyle = D.grad(ctx, 0, cy, 0, cy + cartH, [col[0], col[1]]);
      D.rr(ctx, cx, cy, cartW, cartH, 4); ctx.fill();
      ctx.strokeStyle = '#10233F'; ctx.stroke();
      if (flag) {
        ctx.fillStyle = '#10233F';
        ctx.fillRect(g.X(xm) - flagW / 2, cy - 26, flagW, 26);
      }
      D.text(ctx, lbl, g.X(xm), cy + 15, { align: 'center', size: 11.5, weight: 700, color: '#fff' });
    }

    // 弹簧与细线（弹开模式未运行前）
    if (at.airMode === 'spring' && (!at.anim || at.anim.t < 0.03)) {
      var sx1 = g.X(p1x) + cartW / 2, sx2 = g.X(p2x) - cartW / 2;
      ctx.strokeStyle = '#4A5B73'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(sx1, g.trackY - 15);
      for (var k = 1; k <= 6; k++) ctx.lineTo(sx1 + (sx2 - sx1) * (k / 7), g.trackY - 15 + (k % 2 ? -5 : 5));
      ctx.lineTo(sx2, g.trackY - 15); ctx.stroke();
      ctx.strokeStyle = '#C7374B'; ctx.beginPath(); ctx.moveTo((sx1 + sx2) / 2, g.trackY - 32); ctx.lineTo((sx1 + sx2) / 2, g.trackY - 8); ctx.stroke();
    }

    drawSlider(p1x, ['#4E84EB', '#2653AD'], 'P ' + Math.round(at.m1 * 1000) + 'g', true);
    if (p2x != null) drawSlider(p2x, ['#22B0C9', '#0D788D'], 'Q ' + Math.round(at.m2 * 1000) + 'g', at.airMode !== 'inelastic');

    // 光电门指示灯（滑块遮光时亮琥珀）
    var g1Hit = Math.abs(p1x - g.g1) * 1000 < at.dMm + 8 || (p2x != null && Math.abs(p2x - g.g1) * 1000 < at.dMm + 8);
    var g2Hit = Math.abs(p1x - g.g2) * 1000 < at.dMm + 8 || (p2x != null && Math.abs(p2x - g.g2) * 1000 < at.dMm + 8);
    [g1Hit, g2Hit].forEach(function (hit, idx) {
      var gx = g.X(idx === 0 ? g.g1 : g.g2);
      ctx.fillStyle = hit ? '#E69B2D' : '#C7374B';
      ctx.beginPath(); ctx.arc(gx, g.trackY - 52, hit ? 4.5 : 3, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();

    // 底部数字计时器面板
    var bw = Math.min(w - 32, 500), bx = (w - bw) / 2, by = g.trackY + 44, bh = Math.min(78, hh - by - 6);
    if (bh >= 44) {
      ctx.fillStyle = '#10233F'; D.rr(ctx, bx, by, bw, bh, 10); ctx.fill();
      var r = at.res, done = r && (!at.anim || at.anim.done);
      var dStr = at.dMm.toFixed(at.dPrec === 3 ? 3 : 1);
      D.text(ctx, '数字计时器（遮光片 d = ' + dStr + ' mm）', bx + 12, by + 16, { size: 11, color: '#9FB3CC' });
      var t1s = done && isFinite(r.dt1) ? (r.dt1 * 1000).toFixed(2) + ' ms' : '---';
      var t2s = done && isFinite(r.dt2) ? (r.dt2 * 1000).toFixed(2) + ' ms' : '---';
      var hasPost = done && r.airMode === 'elastic';
      var yMain = hasPost && bh >= 62 ? by + 38 : by + 44;
      D.text(ctx, '光电门 1：Δt₁ = ' + t1s, bx + 14, yMain, { size: 14, color: '#7CF0B4', weight: 700, maxW: bw * 0.46 });
      D.text(ctx, '光电门 2：Δt₂ = ' + t2s, bx + bw * 0.51, yMain, { size: 14, color: '#7CF0B4', weight: 700, maxW: bw * 0.46 });
      if (hasPost && bh >= 62) {
        var pDir = r.v1Post < -1e-4 ? '反弹过门1' : Math.abs(r.v1Post) <= 1e-4 ? '碰后静止' : '追随过门2';
        var t1p = isFinite(r.dt1Post) ? (r.dt1Post * 1000).toFixed(2) + ' ms' : '∞（静止）';
        D.text(ctx, '碰后滑块 P（' + pDir + '）：Δt₁′ = ' + t1p, bx + 14, by + 62, { size: 12, color: '#A3D9FF', weight: 600, maxW: bw - 28 });
      }
    }
  };

  /* ---------- 指针与放大镜 ---------- */
  Bench.prototype.bindPointer = function () {
    var self = this;
    ML.stage.pointer(this.stage.layer('fg').canvas, {
      down: function () {},
      move: function (p, a) {
        if (a.pressed && self.scheme === 'chute') self.showMag(p);
      },
      press: function (p) {
        if (self.scheme === 'chute') self.showMag(p);
      },
      up: function (p, a) {
        self.mag.hide();
        if (a.moved || a.pressed) return;
        var hit = self.hitTest(p);
        if (self.scheme === 'chute') {
          if (self.ch.manualFit) { self.manualAt(p); return; }
          if (hit === 'release1') self.shoot(1);
          else if (hit === 'toggleM2') { self.ch.hasM2 = !self.ch.hasM2; self.renderSide(); self.stage.invalidate('fg'); }
        }
      }
    });
  };
  Bench.prototype.manualAt = function (p) {
    var ch = this.ch, id = ch.manualFit, g = this.chuteGeo(this.stage.w, this.stage.h);
    if (!id) return;
    if (p.y < g.paperTop || p.y > g.paperTop + g.paperH) { ML.toast('请在下方白纸的对应点簇内确定圆心。', 'warn'); return; }
    var cx = (p.x - g.ox) / g.pxPerM, cy = (p.y - g.paperMidY) / 180;
    var dots = id === 'P' ? ch.pDots : id === 'M' ? ch.mDots : ch.nDots;
    if (dots.length < 3) { this.cancelCircleSelection(); ML.toast('落点已改变，请重新采样再定圆心。', 'warn'); return; }
    var ref = PH.minCircle(dots);
    if (Math.hypot((cx - ref.cx) * g.pxPerM, (cy - ref.cy) * 180) > 18) {
      ML.toast('这个圆心不能合理代表点簇的平均位置，请观察落点分布后重试。', 'warn'); return;
    }
    var radius = Math.max.apply(null, dots.map(function (d) { return Math.hypot(d.x - cx, d.y - cy); }));
    ch[id] = { cx: cx, cy: cy, r: radius, dist: Math.hypot(cx, cy), manual: true };
    ch.manualFit = ch.manualQueue && ch.manualQueue.length ? ch.manualQueue.shift() : null;
    if (ch.P && ch.M && ch.N) this.done.P6 = true;
    this.setBanner(ch.manualFit ? '<b>继续作图：</b>请在白纸上点击 ' + ch.manualFit + ' 点簇的平均落点。' : '<b>作图记录完成：</b>三个平均落点均由你点击确定，下方距离由刻度尺坐标计算。');
    this.stage.invalidate('fg'); this.renderSide();
  };
  Bench.prototype.showMag = function (p) {
    var g = this.chuteGeo(this.stage.w, this.stage.h);
    var label = null;
    if (p.y >= g.paperTop) {
      var xCm = ((p.x - g.ox) / g.pxPerM) * 100;
      label = 'x = ' + xCm.toFixed(1) + ' cm';
    }
    this.mag.show([this.stage.layer('bg').canvas, this.stage.layer('fg').canvas], p.x, p.y, this.stage.dpr, label);
  };
  Bench.prototype.hitTest = function (p) {
    var hs = this.hot || [];
    for (var i = hs.length - 1; i >= 0; i--) {
      var r = hs[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r.id;
    }
    return null;
  };

  /* ---------- 方案一控制 ---------- */
  Bench.prototype.chuteParams = function () {
    var ch = this.ch;
    return {
      m1: BALL_TYPES[ch.m1].m,
      m2: ch.hasM2 ? BALL_TYPES[ch.m2].m : 0,
      e: ch.e, v0: 1.50, H: ch.H, tiltDeg: ch.tiltDeg,
      ideal: S.ideal, releaseJitter: ch.releaseJitter,
      seed: (seedCounter += 13)
    };
  };
  function pushDotCap(arr, dot) {
    arr.push(dot);
    if (arr.length > 30) arr.shift();
  }
  Bench.prototype.commitChuteAnim = function (a) {
    if (!a || !a.res) return;
    var ch = this.ch, res = a.res;
    if (res.solo) {
      if (!a.pAdded) { pushDotCap(ch.pDots, res.pDot); a.pAdded = true; }
    } else {
      if (!a.mAdded) { pushDotCap(ch.mDots, res.mDot); a.mAdded = true; }
      if (!a.nAdded) { pushDotCap(ch.nDots, res.nDot); a.nAdded = true; }
    }
  };
  Bench.prototype.cancelCircleSelection = function () {
    if (this.ch.manualFit) this.setBanner(null);
    this.ch.manualFit = null; this.ch.manualQueue = [];
  };

  Bench.prototype.invalidateCircles = function (solo) {
    if (solo) this.ch.P = null;
    else { this.ch.M = null; this.ch.N = null; }
    this.done.P6 = false; this.done.P7 = false;
    this.cancelCircleSelection();
  };

  Bench.prototype.shoot = function (n) {
    var ch = this.ch;
    if (this.guided()) {
      if (ch.tiltDeg !== 0) { this.block('请先将斜槽末端调节至水平（0°）。' + PROC.P1.why, 'E3'); return; }
      if (ch.hasM2 && BALL_TYPES[ch.m1].m <= BALL_TYPES[ch.m2].m) {
        this.block('入射球质量必须大于被碰球（m₁ > m₂），否则入射球会反弹回滚！', 'E1'); return;
      }
      if (ch.releaseJitter) { this.block('每次释放位置必须固定在 S 处，不能忽高忽低！', 'E2'); return; }
    }
    if (ch.anim) { ML.toast('请等待这一发落到白纸后再释放。', 'warn'); return; }
    this.invalidateCircles(!ch.hasM2);
    this.setBanner(null);
    var p = this.chuteParams();
    if (n === 1) {
      var res = PH.chuteCollide(p);
      ch.lastRes = res;
      this.done.P1 = ch.tiltDeg === 0; this.done.P2 = true; this.done.P3 = BALL_TYPES[ch.m1].m > BALL_TYPES[ch.m2].m;
      if (ch.hasM2) this.done.P5 = true; else this.done.P4 = true;
      var tFly = Math.max(res.tP || 0, res.tM || 0, res.tN || 0) + (res.rebound ? 0.28 : 0);
      ch.anim = { t: 0, tCol: 0.30, end: 0.30 + tFly, phase: 'slide', res: res, pAdded: false, mAdded: false, nAdded: false };
      this.renderSide();
      this.loop.start();
    } else {
      for (var i = 0; i < n; i++) {
        var r = PH.chuteCollide(Object.assign({}, p, { seed: p.seed + i * 19 }));
        if (r.solo) pushDotCap(ch.pDots, r.pDot);
        else { pushDotCap(ch.mDots, r.mDot); pushDotCap(ch.nDots, r.nDot); }
      }
      this.done.P1 = ch.tiltDeg === 0; this.done.P2 = true; this.done.P3 = BALL_TYPES[ch.m1].m > BALL_TYPES[ch.m2].m;
      if (ch.hasM2) this.done.P5 = true; else this.done.P4 = true;
      ch.anim = null;
      ML.toast('已完成 ' + n + ' 发释放（' + (ch.hasM2 ? 'M、N 点簇' : 'P 点簇') + '）', 'ok');
      this.stage.invalidate('fg');
      this.renderSide();
    }
  };
  Bench.prototype.fitCircles = function () {
    var ch = this.ch, okAny = false;
    if (ch.anim) { ML.toast('请等这一发落地后再定圆心。', 'warn'); return; }
    if (this.guided()) {
      var canP = ch.pDots.length >= 3, canMN = ch.mDots.length >= 3 && ch.nDots.length >= 3;
      if (!canP && !canMN) { this.block('请先逐次释放，每类落点至少 3 发，再徒手定圆心。', 'E4'); return; }
      ch.manualQueue = [canP && !ch.P ? 'P' : null, canMN && !ch.M ? 'M' : null, canMN && !ch.N ? 'N' : null].filter(Boolean);
      if (!ch.manualQueue.length) { this.autoFitCheck(); return; }
      ch.manualFit = ch.manualQueue.shift();
      this.setBanner('<b>学生作图：</b>用圆规尝试包住 ' + ch.manualFit + ' 点簇，在白纸上点击你确定的圆心；随后用刻度尺读圆心到 O 的距离。');
      ML.toast('请在下半部白纸上点击 ' + ch.manualFit + ' 的圆心位置', 'info'); this.stage.invalidate('fg'); this.renderSide(); return;
    }
    if (ch.pDots.length >= 3) { ch.P = PH.minCircle(ch.pDots); okAny = true; }
    if (ch.mDots.length >= 3 && ch.nDots.length >= 3) {
      ch.M = PH.minCircle(ch.mDots); ch.N = PH.minCircle(ch.nDots); okAny = true;
    }
    if (!okAny) {
      if (this.guided()) this.block('请先打够至少 3 发（建议 10 发）再画最小圆取平均落点！', 'E4');
      else ML.toast('当前点数不足 3 个，请多打几发再定圆心', 'warn');
      return;
    }
    if (ch.P && ch.M && ch.N) this.done.P6 = true;
    ML.toast('已画出最小圆并标出圆心平均位置', 'ok');
    this.stage.invalidate('fg');
    this.renderSide();
  };
  Bench.prototype.autoFitCheck = function () {
    var ch = this.ch;
    if (!ch.P || !ch.M || !ch.N) return;
    var refs = { P: PH.minCircle(ch.pDots), M: PH.minCircle(ch.mDots), N: PH.minCircle(ch.nDots) };
    var msg = ['P', 'M', 'N'].map(function (id) {
      return id + '：手工 ' + (ch[id].dist * 100).toFixed(2) + ' cm / 拟合 ' + (refs[id].dist * 100).toFixed(2) + ' cm';
    }).join('；');
    this.setBanner('<b>自动拟合核对（不替换你的作图）：</b>' + msg);
    ML.toast('拟合结果仅作核对，手工圆心与距离记录保持不变。', 'ok');
  };
  Bench.prototype.clearDots = function () {
    var ch = this.ch;
    ch.pDots = []; ch.mDots = []; ch.nDots = [];
    ch.P = null; ch.M = null; ch.N = null; ch.anim = null; ch.lastRes = null;
    this.done.P6 = false; this.done.P7 = false; this.cancelCircleSelection();
    this.stage.invalidate('fg'); this.renderSide();
  };

  /* ---------- 方案二控制 ---------- */
  Bench.prototype.runAir = function (modeOverride) {
    var at = this.at;
    var mode = modeOverride || at.airMode;
    if (this.guided() && mode !== 'level' && at.tiltDeg !== 0) {
      this.block('导轨尚未调水平，先进行水平检验并调平至 0°！', 'E5'); return;
    }
    this.setBanner(null);
    var dM = at.dMm / 1000;
    var res = PH.airtrackRun({
      airMode: mode, m1: at.m1, m2: at.m2, d1: dM, d2: dM,
      tiltDeg: at.tiltDeg, ideal: S.ideal, seed: (seedCounter += 11)
    });
    at.res = res;
    if (mode === 'level') {
      if (at.tiltDeg === 0) this.done.P7 = true;
      at.anim = { t: 0, end: 1.35, mode: 'level', x1: AIR.start, x2: null, done: false };
    } else if (mode === 'spring') {
      this.done.P8 = true;
      at.anim = { t: 0, end: 1.0, mode: 'spring', x1: AIR.spring1, x2: AIR.spring2, done: false };
    } else {
      this.done.P8 = true;
      at.anim = { t: 0, end: 1.45, mode: mode, x1: AIR.start, x2: AIR.target, done: false };
    }
    this.renderSide();
    this.loop.start();
  };

  /* ---------- 动画循环 ---------- */
  Bench.prototype.tick = function (dt) {
    if (!this.el || !this.el.isConnected) return false;
    var s = dt * this.speed;
    if (this.scheme === 'chute' && this.ch.anim) {
      var a = this.ch.anim; a.t += s;
      if (a.t >= a.tCol) {
        a.phase = 'fly';
        var dtFly = a.t - a.tCol;
        if (a.res.solo) {
          if (!a.pAdded && dtFly >= a.res.tP) { pushDotCap(this.ch.pDots, a.res.pDot); a.pAdded = true; }
        } else {
          var mFly = a.res.rebound ? dtFly - 0.28 : dtFly;
          if (!a.mAdded && mFly >= a.res.tM) { pushDotCap(this.ch.mDots, a.res.mDot); a.mAdded = true; }
          if (!a.nAdded && dtFly >= a.res.tN) { pushDotCap(this.ch.nDots, a.res.nDot); a.nAdded = true; }
        }
      }
      this.stage.invalidate('fg');
      if (a.t >= a.end) {
        this.commitChuteAnim(a);
        this.ch.anim = null;
        this.stage.invalidate('fg'); this.renderSide();
        return false;
      }
      return true;
    }
    if (this.scheme === 'airtrack' && this.at.anim) {
      var b = this.at.anim, r = this.at.res; b.t += s;
      var acc = r.a || 0, v0 = r.v0 || 0.80;
      if (b.mode === 'level') {
        b.x1 = Math.max(0.08, Math.min(1.08, AIR.start + v0 * b.t + 0.5 * acc * b.t * b.t));
      } else if (b.mode === 'spring') {
        b.x1 = Math.max(0.08, Math.min(0.95, AIR.spring1 - r.v1Init * b.t - 0.5 * r.aLeft * b.t * b.t));
        b.x2 = Math.max(0.18, Math.min(1.12, AIR.spring2 + r.v2Init * b.t + 0.5 * r.aRight * b.t * b.t));
      } else {
        var tCol = r.tContact;
        if (b.t <= tCol) {
          b.x1 = AIR.start + v0 * b.t + 0.5 * acc * b.t * b.t;
          b.x2 = AIR.target;
        } else {
          var t2 = b.t - tCol;
          if (b.mode === 'inelastic') {
            var xc2 = Math.max(0.20, Math.min(1.10, AIR.target + r.v2Post * t2 + 0.5 * acc * t2 * t2));
            b.x1 = xc2 - AIR.length; b.x2 = xc2;
          } else {
            var a1Post = r.v1Post < 0 ? (r.axBack != null ? r.axBack : acc) : acc;
            b.x1 = Math.max(0.08, Math.min(1.00, r.xContact + r.v1Post * t2 + 0.5 * a1Post * t2 * t2));
            b.x2 = Math.max(0.20, Math.min(1.12, AIR.target + r.v2Post * t2 + 0.5 * acc * t2 * t2));
          }
        }
      }
      this.stage.invalidate('fg');
      if (b.t >= b.end) { b.done = true; this.stage.invalidate('fg'); this.renderSide(); return false; }
      return true;
    }
    return false;
  };

  /* ---------- 侧栏面板 ---------- */
  Bench.prototype.renderSide = function () {
    var self = this, side = this.side; if (!side) return;
    ML.clear(side);
    if (this.scheme === 'airtrack') this.renderAirSide(side);
    else this.renderChuteSide(side);
  };

  Bench.prototype.renderChuteSide = function (side) {
    var self = this, ch = this.ch;
    var ctl = h('div.side-ctl');
    ctl.appendChild(h('div.side-k', '方案一：斜槽平抛参数'));
    ctl.appendChild(h('div.side-row', h('span.side-l', '入射球 m₁'),
      ['steel', 'al', 'glass'].map(function (k) {
        return h('button.chip' + (ch.m1 === k ? '.on' : ''), { type: 'button', onclick: function () {
          if (ch.m1 === k) return;
          ch.m1 = k; self.clearDots();
          self.saveBench(); self.stage.invalidate(); self.renderSide();
        } }, ballLabel(k));
      })));
    ctl.appendChild(h('div.side-row', h('span.side-l', '被碰球 m₂'),
      h('button.chip' + (!ch.hasM2 ? '.on' : ''), { type: 'button', onclick: function () { ch.hasM2 = false; self.stage.invalidate('fg'); self.renderSide(); } }, '无(测 P)'),
      ['steel', 'al', 'glass'].map(function (k) {
        return h('button.chip' + (ch.hasM2 && ch.m2 === k ? '.on' : ''), { type: 'button', onclick: function () {
          ch.hasM2 = true;
          if (ch.m2 !== k) { ch.m2 = k; ch.anim = null; ch.mDots = []; ch.nDots = []; self.invalidateCircles(false); }
          self.saveBench(); self.stage.invalidate(); self.renderSide();
        } }, ballLabel(k));
      })));
    ctl.appendChild(h('div.side-row', h('span.side-l', '碰撞与槽口'),
      h('button.chip' + (ch.e >= 0.9 ? '.on' : ''), { type: 'button', onclick: function () { if (ch.e === 0.98) return; ch.e = 0.98; ch.mDots = []; ch.nDots = []; ch.anim = null; self.invalidateCircles(false); self.saveBench(); self.stage.invalidate(); self.renderSide(); } }, '弹性 e=0.98'),
      h('button.chip' + (ch.e < 0.9 ? '.on' : ''), { type: 'button', onclick: function () { if (ch.e === 0.75) return; ch.e = 0.75; ch.mDots = []; ch.nDots = []; ch.anim = null; self.invalidateCircles(false); self.saveBench(); self.stage.invalidate(); self.renderSide(); } }, '非弹性 0.75'),
      h('button.chip' + (ch.tiltDeg === 0 ? '.on' : ''), { type: 'button', onclick: function () { ch.tiltDeg = ch.tiltDeg === 0 ? 12 : ch.tiltDeg === 12 ? 18 : 0; self.clearDots(); self.stage.invalidate(); self.renderSide(); } }, ch.tiltDeg === 0 ? '末端水平 0°' : '上翘 +' + ch.tiltDeg + '°'),
      h('button.chip' + (!ch.releaseJitter ? '.on' : ''), { type: 'button', onclick: function () { ch.releaseJitter = !ch.releaseJitter; self.clearDots(); self.stage.invalidate(); self.renderSide(); } }, ch.releaseJitter ? '释放不固定' : '固定 S 释放'),
      h('button.chip' + (Math.abs(ch.H - 0.50) < 0.05 ? '.on' : ''), { type: 'button', onclick: function () { ch.H = Math.abs(ch.H - 0.50) < 0.05 ? 0.800 : 0.500; self.clearDots(); self.stage.invalidate(); self.renderSide(); } }, '高 H=' + ch.H.toFixed(2) + 'm')));

    ctl.appendChild(h('div.side-acts',
      h('button.btn', { type: 'button', onclick: function () { self.shoot(1); } }, '打 1 发'),
      !this.guided() ? h('button.btn.primary', { type: 'button', onclick: function () { self.shoot(10); } }, '自由演示：连打 10 发') : null,
      h('button.btn.cyan', { type: 'button', onclick: function () { self.fitCircles(); } }, this.guided() ? '用圆规定 P/M/N 圆心' : '画最小圆定圆心'),
      h('button.btn', { type: 'button', onclick: function () { self.clearDots(); } }, '清空落点')));

    // 实时校验结果卡
    var m1 = BALL_TYPES[ch.m1].m, m2 = BALL_TYPES[ch.m2].m;
    if (ch.P && ch.M && ch.N) {
      var chk = PH.chuteCheck(m1, m2, ch.P.dist, ch.M.dist, ch.N.dist);
      var badTilt = ch.tiltDeg !== 0;
      var okMom = !badTilt && Math.abs(chk.relErr) < 0.04;
      var okEl = !badTilt && Math.abs(chk.elDiff) < 0.04;
      var momText = badTilt
        ? '✕ 末端不水平（+' + ch.tiltDeg + '°），飞行时间不等、射程不成正比'
        : (okMom ? '✓ 动量守恒成立' : '✕ 偏差过大（检查 m₁>m₂ 或释放位置）');
      ctl.appendChild(h('div.res-card.' + (okMom ? 'ok' : 'bad'), { html:
        '<div class="res-row"><span>OP = <b>' + fmtCm(ch.P.dist) + '</b> cm</span><span>OM = <b>' + fmtCm(ch.M.dist) + '</b> cm</span><span>ON = <b>' + fmtCm(ch.N.dist) + '</b> cm</span></div>' +
        '<div class="res-row"><span>m₁·OP = <b>' + (chk.pBefore * 1000).toFixed(2) + '</b></span><span>m₁·OM+m₂·ON = <b>' + (chk.pAfter * 1000).toFixed(2) + '</b> g·m</span></div>' +
        '<div>偏差：<b>' + fmtPct(chk.relErr) + '</b>　OP+OM=' + fmtCm(chk.elSum) + ' vs ON=' + fmtCm(ch.N.dist) + 'cm' +
        '<br><span class="res-badge ' + (okMom ? 'ok' : 'bad') + '">' + momText + '</span> ' +
        '<span class="res-badge ' + (okEl ? 'ok' : 'bad') + '">' + (okEl ? '✓ 弹性碰撞' : '非弹性/斜抛失真') + '</span></div>' }));
    } else {
      ctl.appendChild(h('div.side-tip', '已打点：P ' + ch.pDots.length + ' 发 · M/N ' + ch.mDots.length + ' 发。先不放 m₂ 打 10 发定 P，再放 m₂ 打 10 发定 M、N。'));
    }
    side.appendChild(ctl);
    this.appendSteps(side, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
  };

  Bench.prototype.renderAirSide = function (side) {
    var self = this, at = this.at;
    var ctl = h('div.side-ctl');
    ctl.appendChild(h('div.side-k', '方案二：气垫导轨 + 双光电门'));
    ctl.appendChild(h('div.side-row', h('span.side-l', '碰撞模式'),
      [['elastic', '弹性碰'], ['inelastic', '粘扣碰'], ['spring', '烧线弹开']].map(function (it) {
        return h('button.chip' + (at.airMode === it[0] ? '.on' : ''), { type: 'button', onclick: function () { at.airMode = it[0]; at.res = null; at.anim = null; self.saveBench(); self.stage.invalidate(); self.renderSide(); } }, it[1]);
      })));
    ctl.appendChild(h('div.side-row', h('span.side-l', '质量 m₁/m₂'),
      [0.100, 0.200, 0.300].map(function (v) {
        return h('button.chip' + (at.m1 === v ? '.on' : ''), { type: 'button', onclick: function () { at.m1 = v; at.res = null; at.anim = null; self.stage.invalidate('fg'); self.renderSide(); } }, 'P ' + Math.round(v * 1000) + 'g');
      }),
      [0.100, 0.200, 0.300].map(function (v) {
        return h('button.chip' + (at.m2 === v ? '.on' : ''), { type: 'button', onclick: function () { at.m2 = v; at.res = null; at.anim = null; self.stage.invalidate('fg'); self.renderSide(); } }, 'Q ' + Math.round(v * 1000) + 'g');
      })));
    ctl.appendChild(h('div.side-row', h('span.side-l', '倾角与遮光'),
      h('button.chip' + (at.tiltDeg === 0 ? '.on' : ''), { type: 'button', onclick: function () { at.tiltDeg = at.tiltDeg === 0 ? 0.6 : at.tiltDeg < 1.0 ? 1.35 : 0; at.res = null; at.anim = null; self.stage.invalidate(); self.renderSide(); } }, at.tiltDeg === 0 ? '导轨水平 0°' : '倾斜 +' + at.tiltDeg + '°'),
      [6.860, 10.0, 20.0].map(function (d) {
        return h('button.chip' + (Math.abs(at.dMm - d) < 0.01 ? '.on' : ''), { type: 'button', onclick: function () { at.dMm = d; at.dPrec = d === 6.86 ? 3 : 1; at.res = null; at.anim = null; self.saveBench(); self.stage.invalidate('fg'); self.renderSide(); } }, d === 6.86 ? '6.860mm' : d.toFixed(0) + 'mm');
      }),
      h('button.chip', { type: 'button', onclick: function () { openGaugePicker(at.dMm, at.dPrec, function (v, gType) { at.dMm = v; at.dPrec = gType === 'micrometer' ? 3 : 1; at.res = null; at.anim = null; self.saveBench(); self.stage.invalidate('fg'); self.renderSide(); ML.toast('已采用遮光片宽度 d = ' + v.toFixed(at.dPrec === 3 ? 3 : 1) + ' mm', 'ok'); }); } }, '卡尺/千分尺读 d')));

    ctl.appendChild(h('div.side-acts',
      h('button.btn', { type: 'button', onclick: function () { self.runAir('level'); } }, '水平试滑检验'),
      h('button.btn.primary', { type: 'button', onclick: function () { self.runAir(); } }, at.airMode === 'spring' ? '烧断细线弹开' : '运行碰撞'),
      h('button.btn.sm', { type: 'button', onclick: function () { at.res = null; at.anim = null; self.stage.invalidate('fg'); self.renderSide(); } }, '重置滑块')));

    if (at.res && (!at.anim || at.anim.done)) {
      var r = at.res;
      if (r.airMode === 'level') {
        var okL = Math.abs(r.relErr) < 0.01;
        ctl.appendChild(h('div.res-card.' + (okL ? 'ok' : 'bad'), { html:
          '单滑块试滑：Δt₁ = <b>' + (r.dt1 * 1000).toFixed(2) + ' ms</b>（v₁=' + r.v1.toFixed(3) + '），Δt₂ = <b>' + (r.dt2 * 1000).toFixed(2) + ' ms</b>（v₂=' + r.v2.toFixed(3) + ' m/s）<br>' +
          '<span class="res-badge ' + (okL ? 'ok' : 'bad') + '">' + (okL ? '✓ 两门时间相等，导轨已水平' : '✕ 遮光时间不等，导轨未调平') + '</span>' }));
      } else if (r.airMode === 'spring') {
        var okS = at.tiltDeg === 0 && Math.abs(r.relErr) < 0.03;
        ctl.appendChild(h('div.res-card.' + (okS ? 'ok' : 'bad'), { html:
          'm₁d₁/Δt₁ = <b>' + r.p1.toFixed(4) + '</b> kg·m/s（向−），m₂d₂/Δt₂ = <b>' + r.p2.toFixed(4) + '</b> kg·m/s（向+）<br>' +
          '相对偏差：<b>' + fmtPct(r.relErr) + '</b> <span class="res-badge ' + (okS ? 'ok' : 'bad') + '">' + (okS ? '✓ 总动量≈0 守恒' : '✕ 存在倾角外力') + '</span>' }));
      } else {
        var okC = at.tiltDeg === 0 && Math.abs(r.relErr) < 0.03;
        var postLine = r.airMode === 'elastic'
          ? 'Δt₁ = <b>' + (r.dt1 * 1000).toFixed(2) + ' ms</b>，碰后 Δt₁′ = <b>' + (isFinite(r.dt1Post) ? (r.dt1Post * 1000).toFixed(2) + ' ms' : '∞(静止)') + '</b>，Δt₂ = <b>' + (r.dt2 * 1000).toFixed(2) + ' ms</b><br>'
          : '';
        ctl.appendChild(h('div.res-card.' + (okC ? 'ok' : 'bad'), { html:
          postLine +
          '碰前 p前 = <b>' + r.pBefore.toFixed(4) + '</b>，碰后 p后 = <b>' + r.pAfter.toFixed(4) + '</b> kg·m/s（偏差 ' + fmtPct(r.relErr) + '）<br>' +
          '动能比 Eₖ′/Eₖ₀ = <b>' + r.ekRatio.toFixed(3) + '</b>' + (r.airMode === 'inelastic' ? '（理论 m₁/(m₁+m₂)=' + (r.m1 / (r.m1 + r.m2)).toFixed(3) + '）' : '') +
          ' <span class="res-badge ' + (okC ? 'ok' : 'bad') + '">' + (okC ? '✓ 动量守恒成立' : '✕ 导轨未调平或受外力') + '</span>' }));
      }
    } else {
      ctl.appendChild(h('div.side-tip', '提示：先点“水平试滑检验”确认 Δt₁ = Δt₂，再进行碰撞或烧线弹开测试。'));
    }
    side.appendChild(ctl);
    this.appendSteps(side, ['P7', 'P8']);
  };

  Bench.prototype.appendSteps = function (side, ids) {
    if (!this.guided()) {
      var tags = h('div.ana-tags'), hasErr = false, ch = this.ch, at = this.at;
      function addTag(txt, errId, isOk) {
        if (!isOk) hasErr = true;
        tags.appendChild(h('button.tag.' + (isOk ? 'ok' : 'err'), { type: 'button', onclick: function () { if (errId) openTry(errId); } }, txt));
      }
      if (this.scheme === 'chute') {
        if (ch.hasM2 && BALL_TYPES[ch.m1].m <= BALL_TYPES[ch.m2].m) addTag('⚠ m₁ ≤ m₂ 入射球反弹（E1）', 'E1', false);
        if (ch.releaseJitter) addTag('⚠ 释放位置不固定（E2）', 'E2', false);
        if (ch.tiltDeg !== 0) addTag('⚠ 斜槽末端不水平 +' + ch.tiltDeg + '°（E3）', 'E3', false);
        if ((ch.pDots.length > 0 && ch.pDots.length < 3) || (ch.mDots.length > 0 && ch.mDots.length < 3)) addTag('⚠ 单次未画最小圆（E4）', 'E4', false);
        if (Math.abs(ch.H - 0.80) < 0.05) addTag('✓ H=0.80m 等效不测 H/t（E6）', 'E6', true);
        if (!hasErr) addTag('✓ 斜槽参数规范', null, true);
      } else {
        if (at.tiltDeg !== 0) addTag('⚠ 气垫导轨未调平 +' + at.tiltDeg + '°（E5）', 'E5', false);
        else addTag('✓ 气垫导轨已水平 0°', null, true);
      }
      side.appendChild(tags);
      side.appendChild(h('div.side-tip', '自由模式：所有参数均可自由改动（点击上方标签可打开对应四拍诊断），实验台按真实物理计算结果。'));
      return;
    }
    side.appendChild(h('div.side-k', '引导步骤'));
    var self = this, curId = null;
    for (var i = 0; i < ids.length; i++) { if (!this.done[ids[i]]) { curId = ids[i]; break; } }
    var ol = h('ol.steps', ids.map(function (id) {
      var p = PROC[id], ok = !!self.done[id], cur = id === curId;
      return h('li' + (ok ? '.ok' : '') + (cur ? '.cur' : ''),
        h('div.st-t', (ok ? '✓ ' : cur ? '▸ ' : '') + p.title),
        h('div.st-how', { html: M.tex(p.how) }),
        p.why ? h('div.st-why', { html: M.tex('理由：' + p.why) }) : null,
        p.errorId ? h('button.link.sm', { type: 'button', onclick: function () { openTry(p.errorId); } }, '为什么？试一试 →') : null);
    }));
    side.appendChild(ol);
  };

  /* =====================================================================
   *  四、③ 诊·误差：四拍对比适配器 + 结果反推
   * ===================================================================== */
  function drawPaperCmp(ctx, w, hh, rows) {
    ctx.fillStyle = '#FBFAF5'; ctx.fillRect(0, 0, w, hh);
    var ox = 60, pxPerM = (w - ox - 28) / 0.85;
    rows.forEach(function (row, idx) {
      var cy = hh * (rows.length === 1 ? 0.50 : idx === 0 ? 0.30 : 0.72);
      ctx.strokeStyle = '#DCE5F0'; ctx.beginPath(); ctx.moveTo(ox, cy); ctx.lineTo(w - 14, cy); ctx.stroke();
      ctx.fillStyle = '#10233F'; ctx.beginPath(); ctx.arc(ox, cy, 3, 0, Math.PI * 2); ctx.fill();
      D.text(ctx, row.label, 8, cy + 4, { size: 11.5, weight: 700, color: row.good ? '#17784F' : '#C7374B' });
      var drawCluster = function (dots, circle, col, tag) {
        if (!dots || !dots.length) return;
        dots.forEach(function (d) {
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ox + d.x * pxPerM, cy + d.y * 200, 2.3, 0, Math.PI * 2); ctx.fill();
        });
        if (circle) {
          ctx.strokeStyle = col; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(ox + circle.cx * pxPerM, cy + circle.cy * 200, Math.max(7, circle.r * pxPerM), 0, Math.PI * 2); ctx.stroke();
          D.text(ctx, tag, ox + circle.cx * pxPerM, cy - Math.max(9, circle.r * pxPerM) - 4, { align: 'center', size: 11, weight: 700, color: col });
        }
      };
      drawCluster(row.s.pDots, row.s.P, '#1661FF', 'P');
      drawCluster(row.s.mDots, row.s.M, '#9A5A00', 'M');
      drawCluster(row.s.nDots, row.s.N, '#17784F', 'N');
    });
  }

  var adapter = {
    compare: function (err, area, done) {
      var id = err.id;
      if (id === 'E1') {
        var gSolo = PH.chuteSeries({ m1: 0.045, m2: 0, ideal: false, seed: 11 }, 10);
        var gCol = PH.chuteSeries({ m1: 0.045, m2: 0.015, e: 0.98, ideal: false, seed: 19 }, 10);
        var bSolo = PH.chuteSeries({ m1: 0.015, m2: 0, ideal: false, seed: 11 }, 10);
        var bCol = PH.chuteSeries({ m1: 0.015, m2: 0.045, e: 0.98, ideal: false, seed: 19 }, 10);
        gCol.pDots = gSolo.pDots; gCol.P = gSolo.P;
        bCol.pDots = bSolo.pDots; bCol.P = bSolo.P;
        var sw = h('div.cmp-stage'); area.appendChild(sw);
        var st = new ML.stage.Stage(sw, { layers: ['c'] });
        st.on('c', function (ctx, w, hh) { drawPaperCmp(ctx, w, hh, [{ label: 'm₁>m₂', good: true, s: gCol }, { label: 'm₁<m₂', good: false, s: bCol }]); });
        var cg = PH.chuteCheck(0.045, 0.015, gCol.P.dist, gCol.M.dist, gCol.N.dist);
        var cb = PH.chuteCheck(0.015, 0.045, bCol.P.dist, bCol.M.dist, bCol.N.dist);
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '条件'), h('th', 'm₁·OP'), h('th', 'm₁·OM + m₂·ON'), h('th', '相对偏差')),
          h('tr', h('td', '正确（45g 撞 15g）'), h('td', (cg.pBefore * 1000).toFixed(2)), h('td', (cg.pAfter * 1000).toFixed(2)), h('td', fmtPct(cg.relErr))),
          h('tr.hl', h('td', '错误（15g 撞 45g）'), h('td', (cb.pBefore * 1000).toFixed(2)), h('td', (cb.pAfter * 1000).toFixed(2)), h('td', fmtPct(cb.relErr)))));
        setTimeout(done, 250);
      } else if (id === 'E2') {
        var fixP = PH.chuteSeries({ m1: 0.045, m2: 0, releaseJitter: false, seed: 51 }, 10);
        var jitP = PH.chuteSeries({ m1: 0.045, m2: 0, releaseJitter: true, seed: 51 }, 10);
        var sw2 = h('div.cmp-stage'); area.appendChild(sw2);
        var st2 = new ML.stage.Stage(sw2, { layers: ['c'] });
        st2.on('c', function (ctx, w, hh) { drawPaperCmp(ctx, w, hh, [{ label: '固定 S', good: true, s: fixP }, { label: '不固定', good: false, s: jitP }]); });
        area.appendChild(h('div.cmp-note', { html: '10 发最小圆半径对比：固定释放 S 为 <b>' + (fixP.P.r * 100).toFixed(2) + ' cm</b>，不固定释放扩大为 <b>' + (jitP.P.r * 100).toFixed(2) + ' cm</b>（约 ' + (jitP.P.r / fixP.P.r).toFixed(1) + ' 倍）。' }));
        setTimeout(done, 250);
      } else if (id === 'E3') {
        var g0 = PH.chuteCollide({ m1: 0.045, m2: 0.015, e: 0.75, ideal: true, tiltDeg: 0 });
        var g0s = PH.chuteCollide({ m1: 0.045, m2: 0, ideal: true, tiltDeg: 0 });
        var b1 = PH.chuteCollide({ m1: 0.045, m2: 0.015, e: 0.75, ideal: true, tiltDeg: 18 });
        var b1s = PH.chuteCollide({ m1: 0.045, m2: 0, ideal: true, tiltDeg: 18 });
        var c0 = PH.chuteCheck(0.045, 0.015, g0s.xP, g0.xM, g0.xN);
        var c1 = PH.chuteCheck(0.045, 0.015, b1s.xP, b1.xM, b1.xN);
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '末端倾角'), h('th', { html: 't<sub>M</sub> / s' }), h('th', { html: 't<sub>P</sub> / s' }), h('th', { html: 't<sub>N</sub> / s' }), h('th', 'ON/OP（理论 1.3125）'), h('th', '动量式偏差')),
          h('tr', h('td', '水平 0°'), h('td', g0.tM.toFixed(4)), h('td', g0s.tP.toFixed(4)), h('td', g0.tN.toFixed(4)), h('td', (g0.xN / g0s.xP).toFixed(4)), h('td', fmtPct(c0.relErr))),
          h('tr.hl', h('td', '上翘 +18°'), h('td', b1.tM.toFixed(4)), h('td', b1s.tP.toFixed(4)), h('td', b1.tN.toFixed(4)), h('td', (b1.xN / b1s.xP).toFixed(4)), h('td', fmtPct(c1.relErr)))));
        area.appendChild(h('div.cmp-note', { html: '上翘时速度越大的球飞得越高、空中时间越长（t<sub>N</sub> > t<sub>P</sub> > t<sub>M</sub>），ON/OP 偏离速度比，射程不再正比于速度。' }));
        setTimeout(done, 250);
      } else if (id === 'E4') {
        var single = [], avg = [];
        for (var s = 1; s <= 20; s++) {
          var s1 = PH.chuteCollide({ m1: 0.045, m2: 0, ideal: false, seed: s * 31 });
          var s2 = PH.chuteCollide({ m1: 0.045, m2: 0.015, e: 0.98, ideal: false, seed: s * 31 + 7 });
          single.push([s, PH.chuteCheck(0.045, 0.015, s1.pDot.r, s2.mDot.r, s2.nDot.r).relErr * 100]);
          var gs = PH.chuteSeries({ m1: 0.045, m2: 0, ideal: false, seed: s * 31 }, 10);
          var gc = PH.chuteSeries({ m1: 0.045, m2: 0.015, e: 0.98, ideal: false, seed: s * 31 + 7 }, 10);
          avg.push([s, PH.chuteCheck(0.045, 0.015, gs.P.dist, gc.M.dist, gc.N.dist).relErr * 100]);
        }
        var ch4 = new ML.Chart(area, { xLabel: '第几次实验', yLabel: '相对偏差 / %', height: 220, x: [0, 21] });
        ch4.set([
          { pts: single, color: '#C7374B', mark: 'x', label: '只做 1 次（单发）' },
          { pts: avg, color: '#25A870', label: '10 发画最小圆圆心' },
          { pts: [], line: [[0, 0], [21, 0]], color: '#10233F', dash: true }
        ]);
        var sd1 = P.std(single.map(function (p) { return p[1]; })), sd10 = P.std(avg.map(function (p) { return p[1]; }));
        area.appendChild(h('div.cmp-note', '20 组偏差标准差：只打 1 发为 ' + sd1.toFixed(2) + '%，10 发画最小圆降为 ' + sd10.toFixed(2) + '%。'));
        setTimeout(done, 250);
      } else if (id === 'E5') {
        var l0 = PH.airtrackRun({ airMode: 'level', tiltDeg: 0, ideal: true });
        var l1 = PH.airtrackRun({ airMode: 'level', tiltDeg: 1.35, ideal: true });
        var s0 = PH.airtrackRun({ airMode: 'spring', tiltDeg: 0, ideal: true });
        var s1 = PH.airtrackRun({ airMode: 'spring', tiltDeg: 1.35, ideal: true });
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '导轨状态'), h('th', '试滑 Δt₁'), h('th', '试滑 Δt₂'), h('th', '弹开动量偏差')),
          h('tr', h('td', '水平 0°'), h('td', (l0.dt1 * 1000).toFixed(2) + ' ms'), h('td', (l0.dt2 * 1000).toFixed(2) + ' ms'), h('td', fmtPct(s0.relErr))),
          h('tr.hl', h('td', '歪斜 +1.35°'), h('td', (l1.dt1 * 1000).toFixed(2) + ' ms'), h('td', (l1.dt2 * 1000).toFixed(2) + ' ms'), h('td', fmtPct(s1.relErr)))));
        setTimeout(done, 250);
      } else if (id === 'E6') {
        var h1s = PH.chuteCollide({ m1: 0.045, m2: 0, H: 0.50, ideal: true });
        var h1c = PH.chuteCollide({ m1: 0.045, m2: 0.015, e: 1, H: 0.50, ideal: true });
        var h2s = PH.chuteCollide({ m1: 0.045, m2: 0, H: 0.80, ideal: true });
        var h2c = PH.chuteCollide({ m1: 0.045, m2: 0.015, e: 1, H: 0.80, ideal: true });
        var chk1 = PH.chuteCheck(0.045, 0.015, h1s.xP, h1c.xM, h1c.xN);
        var chk2 = PH.chuteCheck(0.045, 0.015, h2s.xP, h2c.xM, h2c.xN);
        area.appendChild(h('table.dt.cmp-table',
          h('tr', h('th', '桌面高度 H'), h('th', '飞行时间 t'), h('th', 'OP / cm'), h('th', 'OM / cm'), h('th', 'ON / cm'), h('th', '动量式偏差')),
          h('tr', h('td', '0.50 m'), h('td', h1s.tP.toFixed(3) + ' s'), h('td', fmtCm(h1s.xP)), h('td', fmtCm(h1c.xM)), h('td', fmtCm(h1c.xN)), h('td', fmtPct(chk1.relErr))),
          h('tr', h('td', '0.80 m'), h('td', h2s.tP.toFixed(3) + ' s'), h('td', fmtCm(h2s.xP)), h('td', fmtCm(h2c.xM)), h('td', fmtCm(h2c.xN)), h('td', fmtPct(chk2.relErr)))));
        area.appendChild(h('div.cmp-note', '桌面高度从 0.50 m 增至 0.80 m，三段射程按比例同时放大，但等式 m₁·OP = m₁·OM + m₂·ON 始终精确成立，无需测 H 和 t。'));
        setTimeout(done, 250);
      }
    },
    show: function (c, vis) {
      var sh = c.show;
      if (sh.type === 'chute-bad') {
        var sSolo = PH.chuteSeries({ m1: 0.015, m2: 0, ideal: false, seed: 23 }, 10);
        var sCol = PH.chuteSeries({ m1: 0.015, m2: 0.045, e: 0.98, ideal: false, seed: 29 }, 10);
        sCol.pDots = sSolo.pDots; sCol.P = sSolo.P;
        var st = new ML.stage.Stage(h('div.rev-stage'), { layers: ['c'] });
        vis.appendChild(st.el);
        st.on('c', function (ctx, w, hh) { drawPaperCmp(ctx, w, hh, [{ label: '异常结果', good: false, s: sCol }]); });
        var chk = PH.chuteCheck(0.015, 0.045, sCol.P.dist, sCol.M.dist, sCol.N.dist);
        vis.appendChild(h('div.cmp-note', '测得 OP = ' + fmtCm(sCol.P.dist) + ' cm，OM = ' + fmtCm(sCol.M.dist) + ' cm，ON = ' + fmtCm(sCol.N.dist) + ' cm，动量偏差达 ' + fmtPct(chk.relErr)));
      } else if (sh.type === 'gate-tilt') {
        var rTilt = PH.airtrackRun({ airMode: 'level', tiltDeg: 1.35, ideal: true });
        var st2 = new ML.stage.Stage(h('div.rev-stage'), { layers: ['c'] });
        vis.appendChild(st2.el);
        st2.on('c', function (ctx, w, hh) {
          ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
          var xL = 56, xR = w - 56, yL = hh * 0.56, yR = hh * 0.68;
          ctx.strokeStyle = '#596574'; ctx.lineWidth = 8; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(xL, yL); ctx.lineTo(xR, yR); ctx.stroke();
          ctx.lineCap = 'butt'; ctx.lineWidth = 1.5;
          var xB = xL + (xR - xL) * 0.26, yB = yL + (yR - yL) * 0.26;
          var xA = xL + (xR - xL) * 0.74, yA = yL + (yR - yL) * 0.74;
          ctx.fillStyle = '#3B4B60';
          ctx.fillRect(xB - 5, yB - 42, 10, 38); ctx.fillRect(xA - 5, yA - 42, 10, 38);
          D.text(ctx, '光电门 B：' + sh.dtB.toFixed(2) + ' ms', xB, yB - 48, { align: 'center', size: 11.5, weight: 700, color: '#C7374B' });
          D.text(ctx, '光电门 A：' + sh.dtA.toFixed(2) + ' ms', xA, yA - 48, { align: 'center', size: 11.5, weight: 700, color: '#1661FF' });
          var xc = (xA + xB) / 2, yc = (yA + yB) / 2;
          ctx.fillStyle = '#4E84EB'; D.rr(ctx, xc - 22, yc - 24, 44, 18, 3); ctx.fill();
          D.text(ctx, '← 小车向左减速（左高右低）', xc, yc + 22, { align: 'center', size: 12, weight: 700, color: '#C7374B' });
        });
        vis.appendChild(h('div.cmp-note', { html: '小车由右向左通过：光电门 A（右）<b>Δt<sub>A</sub> = ' + sh.dtA.toFixed(2) + ' ms</b>　→　光电门 B（左）<b>Δt<sub>B</sub> = ' + sh.dtB.toFixed(2) + ' ms</b>（模型参考 a = ' + rTilt.a.toFixed(2) + ' m/s²，向左减速，应调高右端）' }));
      } else if (sh.type === 'elastic-dots') {
        var sEl = PH.chuteCollide({ m1: 0.045, m2: 0, ideal: true });
        var cEl = PH.chuteCollide({ m1: 0.045, m2: 0.015, e: 1.0, ideal: true });
        var st3 = new ML.stage.Stage(h('div.rev-stage'), { layers: ['c'] });
        vis.appendChild(st3.el);
        st3.on('c', function (ctx, w, hh) {
          ctx.fillStyle = '#FBFAF5'; ctx.fillRect(0, 0, w, hh);
          var ox = 44, pxM = (w - 88) / 0.76, yDot = 42;
          ctx.strokeStyle = '#8E99A6'; ctx.beginPath(); ctx.moveTo(ox, yDot); ctx.lineTo(w - 30, yDot); ctx.stroke();
          var pts = [
            { x: 0, lbl: 'O (0)', col: '#10233F' },
            { x: cEl.xM, lbl: 'M (' + fmtCm(cEl.xM) + 'cm)', col: '#9A5A00' },
            { x: sEl.xP, lbl: 'P (' + fmtCm(sEl.xP) + 'cm)', col: '#1661FF' },
            { x: cEl.xN, lbl: 'N (' + fmtCm(cEl.xN) + 'cm)', col: '#17784F' }
          ];
          pts.forEach(function (pt) {
            var px = ox + pt.x * pxM;
            ctx.fillStyle = pt.col; ctx.beginPath(); ctx.arc(px, yDot, 4, 0, Math.PI * 2); ctx.fill();
            D.text(ctx, pt.lbl, px, yDot - 11, { align: 'center', size: 11, weight: 700, color: pt.col });
          });
          var wP = sEl.xP * pxM, wM = cEl.xM * pxM, wN = cEl.xN * pxM;
          ctx.fillStyle = '#1661FF'; ctx.fillRect(ox, 66, wP, 13);
          ctx.fillStyle = '#9A5A00'; ctx.fillRect(ox + wP, 66, wM, 13);
          D.text(ctx, 'OP + OM = ' + fmtCm(sEl.xP + cEl.xM) + ' cm', ox + (wP + wM) / 2, 76, { align: 'center', size: 10.5, weight: 700, color: '#fff' });
          ctx.fillStyle = '#17784F'; ctx.fillRect(ox, 86, wN, 13);
          D.text(ctx, 'ON = ' + fmtCm(cEl.xN) + ' cm（两段总长精确相等）', ox + wN / 2, 96, { align: 'center', size: 10.5, weight: 700, color: '#fff' });
        });
        vis.appendChild(h('div.cmp-note', { html: 'O —— M (<b>' + fmtCm(cEl.xM) + ' cm</b>) —— P (<b>' + fmtCm(sEl.xP) + ' cm</b>) —— N (<b>' + fmtCm(cEl.xN) + ' cm</b>)，满足 <b>OP + OM = ON</b>' }));
        vis.appendChild(h('div.try-actions', h('button.btn.sm', { type: 'button', onclick: function () {
          shell.go('bench');
          bench.setMode('free', true);
          bench.setScheme('chute', true);
          bench.clearDots();
          bench.ch.m1 = 'steel'; bench.ch.m2 = 'al'; bench.ch.e = 0.98; bench.ch.tiltDeg = 0; bench.ch.releaseJitter = false; bench.ch.H = 0.500;
          bench.ch.hasM2 = false; bench.shoot(10);
          bench.ch.hasM2 = true; bench.shoot(10);
          bench.fitCircles();
          bench.setBanner('<b>弹性碰撞判据对照：</b>已自动打完 P 与 M、N 并画最小圆，可在右侧切换“弹性 e=0.98 / 非弹性 0.75”对比 OP+OM 与 ON。');
          shell.main.scrollTop = 0;
        } }, '去实验台对比弹性 vs 非弹性碰撞 →')));
      } else if (sh.type === 'inelastic-bar') {
        var r = PH.airtrackRun({ airMode: 'inelastic', m1: (sh.m1 || 200) / 1000, m2: (sh.m2 || 100) / 1000, ideal: true });
        var st4 = new ML.stage.Stage(h('div.rev-stage'), { layers: ['c'] });
        vis.appendChild(st4.el);
        st4.on('c', function (ctx, w, hh) {
          ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
          var bx = 116, barW = Math.min(260, w - 150);
          D.text(ctx, '碰前总动能 Eₖ₀', 14, 46, { size: 12, weight: 700 });
          ctx.fillStyle = '#1661FF'; ctx.fillRect(bx, 32, barW, 20);
          D.text(ctx, '100%（m₁=' + (sh.m1 || 200) + 'g 单独运动）', bx + barW / 2, 46, { align: 'center', size: 11, weight: 700, color: '#fff' });
          D.text(ctx, '粘连后总动能 Eₖ′', 14, 88, { size: 12, weight: 700 });
          var wKeep = barW * r.ekRatio;
          ctx.fillStyle = '#25A870'; ctx.fillRect(bx, 74, wKeep, 20);
          ctx.fillStyle = '#FDECEF'; ctx.fillRect(bx + wKeep, 74, barW - wKeep, 20);
          ctx.strokeStyle = '#F2BFC8'; ctx.strokeRect(bx + wKeep, 74, barW - wKeep, 20);
          D.text(ctx, (r.ekRatio * 100).toFixed(1) + '% = m₁/(m₁+m₂)', bx + wKeep / 2, 88, { align: 'center', size: 11, weight: 700, color: '#fff' });
          D.text(ctx, '损耗 ' + ((1 - r.ekRatio) * 100).toFixed(1) + '%', bx + wKeep + (barW - wKeep) / 2, 88, { align: 'center', size: 10.5, weight: 700, color: '#C7374B' });
        });
        vis.appendChild(h('div.cmp-note', { html: '碰前动能 Eₖ₀（100%）→ 粘连后总动能 Eₖ′（<b>' + (r.ekRatio * 100).toFixed(1) + '%</b>，当 m₁=200 g, m₂=100 g 时为 2/3）' }));
        vis.appendChild(h('div.try-actions', h('button.btn.sm', { type: 'button', onclick: function () {
          shell.go('bench');
          bench.setMode('free', true);
          bench.setScheme('airtrack', true);
          bench.at.airMode = 'inelastic'; bench.at.m1 = 0.200; bench.at.m2 = 0.100; bench.at.tiltDeg = 0; bench.at.res = null; bench.at.anim = null;
          bench.renderSide(); bench.stage.invalidate();
          bench.setBanner('<b>完全非弹性碰撞：</b>已预置气垫导轨“粘扣碰”（m₁=200g, m₂=100g），请点击“运行碰撞”查看动能比 Eₖ′/Eₖ₀。');
          shell.main.scrollTop = 0;
        } }, '去实验台复现粘扣碰撞 →')));
      }
    },
    restore: function () {
      if (!bench) return;
      if (bench.loop) bench.loop.stop();
      bench.setMode('guided');
      bench.ch.m1 = 'steel'; bench.ch.m2 = 'al'; bench.ch.hasM2 = false; bench.ch.e = 0.98;
      bench.ch.tiltDeg = 0; bench.ch.releaseJitter = false; bench.ch.H = 0.500;
      bench.clearDots();
      bench.at.airMode = 'elastic'; bench.at.m1 = 0.200; bench.at.m2 = 0.100;
      bench.at.dMm = 10.0; bench.at.dPrec = 1; bench.at.tiltDeg = 0; bench.at.res = null; bench.at.anim = null;
      bench.setBanner(null);
      bench.setScheme('chute');
    },
    replay: function (errId) {
      var e = ERR[errId]; if (!e) return;
      shell.go('bench');
      bench.setMode('free', true);
      if (e.config.scheme === 'airtrack') {
        bench.setScheme('airtrack', true);
        bench.at.tiltDeg = e.config.tiltDeg || 0;
        bench.at.res = null; bench.at.anim = null;
        bench.renderSide(); bench.stage.invalidate();
      } else {
        bench.setScheme('chute', true);
        bench.clearDots();
        bench.ch.m1 = e.config.m1 === 0.015 ? 'al' : 'steel';
        bench.ch.m2 = e.config.m2 === 0.045 ? 'steel' : 'al';
        bench.ch.e = e.config.e != null ? e.config.e : 0.98;
        bench.ch.hasM2 = true;
        bench.ch.tiltDeg = e.config.tiltDeg || 0;
        bench.ch.releaseJitter = !!e.config.releaseJitter;
        bench.ch.H = e.config.compareH ? 0.800 : 0.500;
        bench.renderSide(); bench.stage.invalidate();
      }
      var hint = e.config.compareH
        ? '已将桌面高度设为 H = 0.80 m，请分别测 P 与 M、N 并画最小圆，观察动量守恒式是否仍成立。'
        : '已按该错误预置实验台（自由模式），请直接点击运行观察现象。';
      bench.setBanner('<b>复现：' + e.name + '</b>　' + hint);
      shell.main.scrollTop = 0;
    }
  };
  function openTry(id) {
    var e = ERR[id]; if (!e) return;
    var p = e.noteId && PROC[e.noteId] ? '<b>' + PROC[e.noteId].title + '：</b>' + PROC[e.noteId].how + ' ' + PROC[e.noteId].why : '';
    ML.TryIt(e, adapter, p);
  }

  /* =====================================================================
   *  五、① 学·原理：6 页互动小部件
   * ===================================================================== */
  function learnWidget(p, card) {
    var box = h('div.learn-widget');
    if (p.widget === 'momentum-bars') {
      card.appendChild(box);
      var mode = 'elastic';
      var sw = h('div.side-row',
        h('button.chip.on', { type: 'button', onclick: function () { setM('elastic'); } }, '弹性碰撞 (m₁>m₂)'),
        h('button.chip', { type: 'button', onclick: function () { setM('inelastic'); } }, '粘连碰'),
        h('button.chip', { type: 'button', onclick: function () { setM('spring'); } }, '静止弹开'));
      var stWrap = h('div.m08-w-stage');
      var cap = h('div.cmp-note');
      box.appendChild(sw); box.appendChild(stWrap); box.appendChild(cap);
      var stg = new ML.stage.Stage(stWrap, { layers: ['bg'] });
      stg.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var y1 = 48, y2 = 126, bx = 120, scale = Math.min(200, w - 160);
        D.text(ctx, '碰前总动量', 14, y1 + 14, { size: 12.5, weight: 700 });
        D.text(ctx, '碰后总动量', 14, y2 + 14, { size: 12.5, weight: 700 });
        if (mode === 'spring') {
          ctx.strokeStyle = '#10233F'; ctx.beginPath(); ctx.moveTo(w * 0.55, 28); ctx.lineTo(w * 0.55, hh - 20); ctx.stroke();
          D.text(ctx, 'p前 = 0（静止）', w * 0.55, y1 + 14, { align: 'center', size: 13, weight: 700, color: '#4A5B73' });
          ctx.fillStyle = '#1661FF'; ctx.fillRect(w * 0.55 - scale * 0.4, y2, scale * 0.4, 22);
          ctx.fillStyle = '#12A9C4'; ctx.fillRect(w * 0.55, y2, scale * 0.4, 22);
          D.text(ctx, '−m₁v₁', w * 0.55 - scale * 0.2, y2 - 6, { align: 'center', size: 12, color: '#1661FF', weight: 700 });
          D.text(ctx, '+m₂v₂', w * 0.55 + scale * 0.2, y2 - 6, { align: 'center', size: 12, color: '#0E8CA3', weight: 700 });
        } else {
          var f1 = mode === 'elastic' ? 0.50 : 0.67;
          ctx.fillStyle = '#1661FF'; ctx.fillRect(bx, y1, scale, 22);
          D.text(ctx, 'm₁v₀（100%）', bx + scale / 2, y1 + 15, { align: 'center', size: 12, color: '#fff', weight: 700 });
          ctx.fillStyle = '#1661FF'; ctx.fillRect(bx, y2, scale * f1, 22);
          ctx.fillStyle = '#12A9C4'; ctx.fillRect(bx + scale * f1, y2, scale * (1 - f1), 22);
          D.text(ctx, 'm₁v₁′', bx + scale * f1 / 2, y2 + 15, { align: 'center', size: 11.5, color: '#fff', weight: 700 });
          D.text(ctx, 'm₂v₂′', bx + scale * (f1 + (1 - f1) / 2), y2 + 15, { align: 'center', size: 11.5, color: '#fff', weight: 700 });
        }
      });
      function setM(m) {
        mode = m;
        ML.$$('.chip', sw).forEach(function (c, i) { c.classList.toggle('on', ['elastic', 'inelastic', 'spring'][i] === m); });
        cap.textContent = m === 'spring' ? '静止弹开：初动量为 0，两滑块向相反方向运动，动量大小相等、矢量和仍为 0。' : '一维同向碰撞：碰后两球动量之和等于碰前入射球总动量（矢量长度守恒）。';
        stg.invalidate('bg');
      }
      setM('elastic');
    } else if (p.widget === 'schemes-demo') {
      card.appendChild(box);
      var tab = 0;
      var sw = h('div.side-row',
        h('button.chip.on', { type: 'button', onclick: function () { setT(0); } }, '① 斜槽平抛法'),
        h('button.chip', { type: 'button', onclick: function () { setT(1); } }, '② 气垫导轨光电门'),
        h('button.chip', { type: 'button', onclick: function () { setT(2); } }, '③ 双摆弦长法'));
      var stWrap = h('div.m08-w-stage');
      box.appendChild(sw); box.appendChild(stWrap);
      var stg = new ML.stage.Stage(stWrap, { layers: ['bg'] });
      stg.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        if (tab === 0) {
          var ox0 = Math.round(Math.max(110, Math.min(180, w * 0.28)));
          var span = Math.max(180, w - ox0 - 36);
          var xM = ox0 + Math.round(span * 0.34), xP = ox0 + Math.round(span * 0.62), xN = ox0 + Math.round(span * 0.92);
          ctx.strokeStyle = '#10233F'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(26, 32); ctx.quadraticCurveTo(ox0 - 76, 75, ox0 - 34, 75); ctx.lineTo(ox0, 75); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ox0, 75); ctx.lineTo(ox0, 152); ctx.stroke();
          ctx.setLineDash([4, 3]); ctx.strokeStyle = '#1661FF';
          ctx.beginPath(); ctx.moveTo(ox0, 75); ctx.quadraticCurveTo((ox0 + xM) / 2, 78, xM, 152); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ox0, 75); ctx.quadraticCurveTo((ox0 + xP) / 2, 78, xP, 152); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ox0, 75); ctx.quadraticCurveTo((ox0 + xN) / 2, 78, xN, 152); ctx.stroke();
          ctx.setLineDash([]); ctx.strokeStyle = '#10233F'; ctx.beginPath(); ctx.moveTo(26, 152); ctx.lineTo(w - 22, 152); ctx.stroke();
          D.text(ctx, 'O', ox0, 168, { align: 'center', weight: 700 });
          D.text(ctx, 'M', xM, 168, { align: 'center', weight: 700, color: '#9A5A00' });
          D.text(ctx, 'P', xP, 168, { align: 'center', weight: 700, color: '#1661FF' });
          D.text(ctx, 'N', xN, 168, { align: 'center', weight: 700, color: '#17784F' });
          D.text(ctx, '同高度 t 相等 ⇒ v ∝ 射程', w - 20, 32, { align: 'right', size: 12.5, weight: 700, color: '#1661FF' });
        } else if (tab === 1) {
          ctx.fillStyle = '#C9D1D9'; ctx.fillRect(40, 120, w - 80, 14);
          ctx.fillStyle = '#3B4B60'; ctx.fillRect(w * 0.28, 62, 10, 58); ctx.fillRect(w * 0.72, 62, 10, 58);
          ctx.fillStyle = '#1661FF'; ctx.fillRect(w * 0.36, 98, 46, 20);
          ctx.fillStyle = '#12A9C4'; ctx.fillRect(w * 0.56, 98, 46, 20);
          ctx.fillStyle = '#10233F'; ctx.fillRect(w * 0.36 + 20, 76, 6, 22); ctx.fillRect(w * 0.56 + 20, 76, 6, 22);
          D.text(ctx, '光电门1 (Δt₁)', w * 0.28, 52, { align: 'center', size: 12, weight: 700 });
          D.text(ctx, '光电门2 (Δt₂)', w * 0.72, 52, { align: 'center', size: 12, weight: 700 });
          D.text(ctx, 'v = d / Δt', w / 2, 158, { align: 'center', size: 13, weight: 700, color: '#1661FF' });
        } else {
          var ox = w * 0.48, oy = 24, L = 104, rB = 11;
          ctx.strokeStyle = '#10233F'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox - 28, oy); ctx.lineTo(ox + 50, oy); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + L); ctx.moveTo(ox + 22, oy); ctx.lineTo(ox + 22, oy + L); ctx.stroke();
          var ax = ox - L * Math.sin(0.95), ay = oy + L * Math.cos(0.95);
          var dx = ox + 22 + L * Math.sin(0.72), dy = oy + L * Math.cos(0.72);
          ctx.setLineDash([4, 3]); ctx.strokeStyle = '#12A9C4';
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ax, ay); ctx.moveTo(ox + 22, oy); ctx.lineTo(dx, dy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#fff'; ctx.strokeStyle = '#12A9C4';
          ctx.beginPath(); ctx.arc(ax, ay, rB, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(dx, dy, rB, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.strokeStyle = '#10233F';
          ctx.beginPath(); ctx.arc(ox, oy + L, rB, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(ox + 22, oy + L, rB, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          D.text(ctx, 'A', ax - 16, ay + 4, { align: 'center', size: 11.5, weight: 700, color: '#0E8CA3' });
          D.text(ctx, 'B', ox, oy + L + 23, { align: 'center', size: 11.5, weight: 700 });
          D.text(ctx, 'C', ox + 22, oy + L + 23, { align: 'center', size: 11.5, weight: 700 });
          D.text(ctx, 'D', dx + 16, dy + 4, { align: 'center', size: 11.5, weight: 700, color: '#0E8CA3' });
          D.text(ctx, '弦长 l₁, l₂, l₃ ⇒ v ∝ l', w / 2, 168, { align: 'center', size: 13, weight: 700, color: '#1661FF' });
        }
      });
      function setT(i) {
        tab = i;
        ML.$$('.chip', sw).forEach(function (c, k) { c.classList.toggle('on', k === i); });
        stg.invalidate('bg');
      }
      setT(0);
    } else if (p.widget === 'mass-ratio') {
      card.appendChild(box);
      var ratio = 3.0;
      var rng = h('input', { type: 'range', min: '0.3', max: '3.0', step: '0.1', value: '3.0', oninput: function () { ratio = parseFloat(rng.value); upd(); } });
      var lbl = h('b');
      var stWrap = h('div.m08-w-stage');
      var cap = h('div.cmp-note');
      box.appendChild(h('div.range-row', h('span', '质量比 m₁ / m₂ = '), lbl, rng));
      box.appendChild(stWrap); box.appendChild(cap);
      var stg = new ML.stage.Stage(stWrap, { layers: ['bg'] });
      stg.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#F8FBFF'; ctx.fillRect(0, 0, w, hh);
        var v1 = (ratio - 1) / (ratio + 1), v2 = (2 * ratio) / (ratio + 1);
        var cx = w * 0.45, cy = 88, scale = 95;
        ctx.strokeStyle = '#DCE5F0'; ctx.beginPath(); ctx.moveTo(20, cy); ctx.lineTo(w - 20, cy); ctx.stroke();
        ctx.fillStyle = '#1661FF'; ctx.beginPath(); ctx.arc(cx - 24, cy, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#12A9C4'; ctx.beginPath(); ctx.arc(cx + 24, cy, 13, 0, Math.PI * 2); ctx.fill();
        D.text(ctx, 'm₁', cx - 24, cy + 4, { align: 'center', size: 11, color: '#fff', weight: 700 });
        D.text(ctx, 'm₂', cx + 24, cy + 4, { align: 'center', size: 11, color: '#fff', weight: 700 });
        // 速度矢量
        ctx.strokeStyle = v1 >= 0 ? '#1661FF' : '#C7374B'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - 24, cy + 32); ctx.lineTo(cx - 24 + v1 * scale, cy + 32); ctx.stroke();
        D.text(ctx, 'v₁′ = ' + v1.toFixed(2) + ' v₀' + (v1 < 0 ? '（反弹！）' : ''), cx - 24, cy + 54, { align: 'center', size: 12, weight: 700, color: v1 >= 0 ? '#1661FF' : '#C7374B' });
        ctx.strokeStyle = '#17784F';
        ctx.beginPath(); ctx.moveTo(cx + 24, cy - 32); ctx.lineTo(cx + 24 + v2 * scale, cy - 32); ctx.stroke();
        D.text(ctx, 'v₂′ = ' + v2.toFixed(2) + ' v₀', cx + 24 + v2 * scale / 2, cy - 42, { align: 'center', size: 12, weight: 700, color: '#17784F' });
      });
      function upd() {
        lbl.textContent = ratio.toFixed(1);
        cap.innerHTML = ratio > 1 ? '<b>m₁ > m₂：</b>v₁′ > 0，入射球碰后继续向前运动，可直接从斜槽落向地面。' :
          ratio === 1 ? '<b>m₁ = m₂：</b>弹性正碰交换速度，入射球瞬间静止停在槽口附近。' :
            '<b style="color:#C7374B">m₁ < m₂：</b>v₁′ < 0，入射球被撞后<b>向后反弹滚回斜槽</b>，造成严重误差！';
        stg.invalidate('bg');
      }
      upd();
    } else if (p.widget === 'circle-demo') {
      card.appendChild(box);
      var showC = true, sSeed = 77, dots = [];
      function roll() { dots = PH.chuteSeries({ m1: 0.045, m2: 0, ideal: false, seed: (sSeed += 17) }, 10).pDots; }
      roll();
      var btnRoll = h('button.chip', { type: 'button', onclick: function () {
        roll(); showC = false; btnRoll.classList.add('on'); btnFit.classList.remove('on'); stg.invalidate('bg');
      } }, '重新打 10 发');
      var btnFit = h('button.chip.on', { type: 'button', onclick: function () {
        showC = true; btnFit.classList.add('on'); btnRoll.classList.remove('on'); stg.invalidate('bg');
      } }, '画最小圆找圆心');
      var row = h('div.side-row', btnRoll, btnFit);
      var stWrap = h('div.m08-w-stage');
      box.appendChild(row); box.appendChild(stWrap);
      var stg = new ML.stage.Stage(stWrap, { layers: ['bg'] });
      stg.on('bg', function (ctx, w, hh) {
        ctx.fillStyle = '#FBFAF5'; ctx.fillRect(0, 0, w, hh);
        var ox = 56, pxPerM = (w - 86) / 0.65, cy = hh * 0.52;
        ctx.fillStyle = '#10233F'; ctx.beginPath(); ctx.arc(ox, cy, 3.5, 0, Math.PI * 2); ctx.fill();
        D.text(ctx, 'O', ox - 12, cy + 4, { align: 'right', weight: 700 });
        dots.forEach(function (d) {
          ctx.fillStyle = '#2B2B2B'; ctx.beginPath(); ctx.arc(ox + d.x * pxPerM, cy + d.y * pxPerM, 3, 0, Math.PI * 2); ctx.fill();
        });
        if (showC) {
          var c = PH.minCircle(dots);
          var cx = ox + c.cx * pxPerM, ccy = cy + c.cy * pxPerM, rr = Math.max(10, c.r * pxPerM + 3);
          ctx.strokeStyle = '#1661FF'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, ccy, rr, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx - 6, ccy); ctx.lineTo(cx + 6, ccy); ctx.moveTo(cx, ccy - 6); ctx.lineTo(cx, ccy + 6); ctx.stroke();
          D.text(ctx, '圆心 = 平均落点（OP = ' + fmtCm(c.dist) + ' cm）', cx, ccy - rr - 8, { align: 'center', size: 12, weight: 700, color: '#1661FF' });
        }
      });
    } else if (p.widget === 'elastic-check') {
      card.appendChild(box);
      var eVal = 1.0;
      var sw = h('div.side-row',
        h('button.chip.on', { type: 'button', onclick: function () { setE(1.0); } }, '弹性碰撞 e = 1.00'),
        h('button.chip', { type: 'button', onclick: function () { setE(0.75); } }, '非弹性碰撞 e = 0.75'),
        h('button.chip', { type: 'button', onclick: function () { setE(0.0); } }, '完全非弹性 e = 0'));
      var cap = h('div.cmp-note');
      box.appendChild(sw); box.appendChild(cap);
      function setE(e) {
        eVal = e;
        ML.$$('.chip', sw).forEach(function (c, i) { c.classList.toggle('on', [1.0, 0.75, 0.0][i] === e); });
        var solo = PH.chuteCollide({ m1: 0.045, m2: 0, ideal: true });
        var col = PH.chuteCollide({ m1: 0.045, m2: 0.015, e: e, ideal: true });
        var ekR = (0.045 * col.v1Launch * col.v1Launch + 0.015 * col.v2Launch * col.v2Launch) / (0.045 * solo.vStart * solo.vStart);
        cap.innerHTML = 'm₁ = 45 g, m₂ = 15 g：OP = <b>' + fmtCm(solo.xP) + '</b> cm，OM = <b>' + fmtCm(col.xM) + '</b> cm，ON = <b>' + fmtCm(col.xN) + '</b> cm<br>' +
          'OP + OM = <b>' + fmtCm(solo.xP + col.xM) + '</b> cm　vs　ON = <b>' + fmtCm(col.xN) + '</b> cm　｜　动能比 Eₖ′/Eₖ₀ = <b>' + ekR.toFixed(3) + '</b>';
      }
      setE(1.0);
    } else if (p.widget === 'gauge-preview') {
      card.appendChild(box);
      var sw = h('div.side-row',
        h('button.chip.on', { type: 'button', onclick: function () { setG('caliper'); } }, '10 分度游标卡尺（10.0 mm）'),
        h('button.chip', { type: 'button', onclick: function () { setG('micrometer'); } }, '螺旋测微器（6.860 mm）'));
      var gbWrap = h('div');
      box.appendChild(sw); box.appendChild(gbWrap);
      var gb = new ML.gaugesView.GaugeBench(gbWrap, { height: 225, state: { type: 'caliper', valMm: 10.0, div: 10, trueMm: 6.860, zeroErrMm: 0 } });
      function setG(t) {
        ML.$$('.chip', sw).forEach(function (c, i) { c.classList.toggle('on', ['caliper', 'micrometer'][i] === t); });
        gb.set({ type: t });
      }
    }
  }

  /* =====================================================================
   *  六、组装四区一卡外壳
   * ===================================================================== */
  var shell = new ML.Shell({
    title: C.title, sub: C.sub, summary: C.summary,
    tabs: [
      { id: 'learn', label: '学·原理', mount: function (el) { ML.Learn(el, C.learn, C.equipment, { onPage: learnWidget, onFinish: function () { shell.go('bench'); } }); } },
      { id: 'bench', label: '做·实验', mount: function (el) { bench = new Bench(el); } },
      {
        id: 'diag', label: '诊·误差',
        mount: function (el) {
          var wrap = h('div.diag'); el.appendChild(wrap);
          wrap.appendChild(h('h2.diag-h', 'A. 错误操作实验室'));
          wrap.appendChild(h('p.muted', '每个“试一试”按四拍进行：布置 → 运行 → 对比 → 追问与揭示。结果均由物理模型实时算出。'));
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
          wrap.appendChild(h('p.muted', '观察实验异常结果，判断原因并前往实验台复现。'));
          var rev = h('div.rev'); wrap.appendChild(rev);
          ML.Reverse(rev, C.reverse, adapter);
        }
      },
      { id: 'paper', label: '练·真题', mount: function (el) { new ML.Paper(el, Q, { title: C.title.replace('实验：', '') + ' · 真题练习', onReplay: adapter.replay }); } }
    ]
  });
  ML.bus.on('tab', function (id) {
    if (bench && bench.loop) bench.loop.setVisible(id === 'bench');
  });
  shell.go(S.tab);
  ML.perf.probe();
  ML.m08 = { bench: function () { return bench; }, adapter: adapter, shell: shell };
})(typeof window !== 'undefined' ? (window.ML = window.ML || {}) : (globalThis.ML = globalThis.ML || {}));
