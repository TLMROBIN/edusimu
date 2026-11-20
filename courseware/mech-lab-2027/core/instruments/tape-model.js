/* ML.tape — 打点计时器 + 纸带 + 光电门物理模型（无 DOM，Node 可运行）。
 * 单位：SI（m, s, kg）。所有随机过程用 ML.phys.rng(seed)，同种子同结果。 */
(function (ML) {
  'use strict';
  var P = ML.phys, G = P.G;
  var DEFAULTS = {
    mode: 'cart',       // 'cart' 小车木板 | 'drop' 竖直重锤自由落体 (M07)
    bob: 'iron',        // 'iron' 300g | 'al' 100g | 'wood' 40g (仅 drop 模式)
    g: 9.80,            // 当地重力加速度 (drop 模式可调)
    v0: 0,              // 初速度 (M03 轻推检验平衡阻力)
    timer: 'em',        // 'em' 电磁打点计时器 | 'spark' 电火花计时器 | 'none' 不连纸带（光电门）
    power: 'ac8',       // 'ac8' 交流约8V | 'ac220' 交流220V | 'dc8' 直流8V
    M: 0.400, m: 0.050, theta: 0,
    ideal: false, freq: 50,
    near: true,         // 小车是否靠近计时器释放
    order: 'power-first', // 'power-first' | 'release-first'
    caught: true,       // 到滑轮前是否按住
    threaded: true,     // 是否穿好纸带
    lag: null,          // 两次操作的时间差 (s)；默认先通电 0.40 s 后释放 / 先释放 0.30 s 后通电；Infinity 表示从未通电
    startAt: 0          // 小车出发位置离“靠近计时器”位置的距离 (m)，非 0 时覆盖 near
  };
  function withDefaults(p) { var o = {}, k; for (k in DEFAULTS) o[k] = DEFAULTS[k]; if (p) for (k in p) if (p[k] !== undefined) o[k] = p[k]; return o; }
  function resist(p) {
    if (p.ideal) return { mu: 0, fTape: 0 };
    return { mu: 0.020, fTape: (!p.threaded || p.timer === 'none') ? 0 : (p.timer === 'spark' ? 0.005 : 0.030) };
  }
  function accel(p) {
    p = withDefaults(p);
    if (p.mode === 'drop') {
      var mBob = p.bob === 'wood' ? 0.040 : p.bob === 'al' ? 0.100 : (p.M !== DEFAULTS.M ? p.M : 0.300);
      var gLoc = p.g != null ? p.g : G;
      var fT = (p.ideal || !p.threaded || p.timer === 'none') ? 0 : (p.timer === 'spark' ? 0.008 : 0.035);
      var fA = p.ideal ? 0 : (p.bob === 'wood' ? 0.045 : p.bob === 'al' ? 0.025 : 0.020);
      return (mBob * gLoc - fT - fA) / mBob;
    }
    var r = resist(p), th = p.theta * Math.PI / 180;
    if (p.m === 0 && p.v0 > 0) return (p.M * G * Math.sin(th) - r.mu * p.M * G * Math.cos(th) - r.fTape) / p.M;
    return (p.m * G + p.M * G * Math.sin(th) - r.mu * p.M * G * Math.cos(th) - r.fTape) / (p.M + p.m);
  }
  function tension(p) {
    p = withDefaults(p);
    if (p.m <= 0) return 0;
    var a = Math.max(0, accel(p));
    return p.m * (G - a);
  }
  /** 恰好补偿阻力的垫高角（度） */
  function compensateAngle(p) {
    p = withDefaults(p); var r = resist(p), lo = 0, hi = 10;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2, th = mid * Math.PI / 180;
      var net = p.M * G * Math.sin(th) - r.mu * p.M * G * Math.cos(th) - r.fTape;
      if (net > 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }
  /** 电源检查：{prints, blocked, msg} */
  function powerCheck(p) {
    if (p.timer === 'em' && p.power === 'ac220') return { prints: false, blocked: true, msg: '电磁打点计时器额定约 8 V 交流，接 220 V 电压远超额定，线圈可能烧毁。' };
    if (p.power === 'dc8') return { prints: false, blocked: false, msg: '直流电不能使振针（或放电）周期性动作，纸带上不打点。' };
    if (p.timer === 'spark' && p.power !== 'ac220') return { prints: false, blocked: false, msg: '电火花计时器需要 220 V 交流，8 V 不能产生火花放电，纸带上不打点。' };
    return { prints: true, blocked: false, msg: '' };
  }
  /** 运行一次实验，返回运动函数与点迹 */
  function run(p, seed) {
    p = withDefaults(p);
    var rnd = P.rng(seed || 1), a = accel(p), pc = powerCheck(p);
    var L = p.startAt ? 0.70 - p.startAt : (p.near ? 0.70 : 0.35), T0 = 1 / p.freq;
    var lag = p.lag != null ? p.lag : (p.order === 'release-first' ? 0.30 : 0.40);
    var tp, tr;
    if (!isFinite(lag)) { tp = Infinity; tr = 0; }
    else { tp = p.order === 'release-first' ? lag : 0; tr = p.order === 'release-first' ? 0 : lag; }
    var v0 = p.v0 > 0 ? p.v0 : 0;
    var moving = (v0 > 0 || a > 1e-6) && !pc.blocked, t1, v1, b = 0, tEnd, s1, stoppedEarly = false, sMax = 0;
    var tags = [];
    if (p.order === 'release-first') tags.push('E1');
    if (!pc.prints || pc.blocked) tags.push('E2');
    if (L < 0.6) tags.push('E6');
    if (!p.caught && moving) tags.push('E7');
    if (p.freq !== 50) tags.push('E9');
    if (moving) {
      if (v0 > 0) {
        if (a < -1e-6 && (v0 * v0) / (2 * (-a)) <= L - 0.02) {
          stoppedEarly = true;
          sMax = (v0 * v0) / (2 * (-a));
          t1 = tr + v0 / (-a);
          tEnd = t1;
          v1 = 0;
          s1 = sMax;
        } else {
          s1 = p.caught ? L - 0.02 : L;
          var dtReach = Math.abs(a) <= 1e-6 ? s1 / v0 : (-v0 + Math.sqrt(Math.max(0, v0 * v0 + 2 * a * s1))) / a;
          t1 = tr + dtReach;
          v1 = Math.max(0, v0 + a * dtReach);
          if (p.caught) { b = v1 * v1 / (2 * 0.02); tEnd = t1 + (b > 0 ? v1 / b : 0); }
          else tEnd = t1 + 0.12;
        }
      } else if (p.caught) {
        s1 = L - 0.02; t1 = tr + Math.sqrt(2 * s1 / a); v1 = a * (t1 - tr);
        b = v1 * v1 / (2 * 0.02); tEnd = t1 + v1 / b;
      } else {
        s1 = L; t1 = tr + Math.sqrt(2 * L / a); v1 = a * (t1 - tr); tEnd = t1 + 0.12;
      }
    } else { t1 = tr; tEnd = tr + 0.6; v1 = 0; s1 = 0; }
    function s(t) {
      if (!moving || t <= tr) return 0;
      if (t <= t1) { var dt = t - tr; return v0 * dt + 0.5 * a * dt * dt; }
      if (stoppedEarly) return sMax;
      if (p.caught) { var u = Math.min(t, tEnd) - t1; return s1 + v1 * u - 0.5 * b * u * u; }
      return L - 0.004 * (1 - Math.exp(-(t - t1) / 0.03)) * Math.sin(Math.min(1, (t - t1) / 0.03) * Math.PI / 2);
    }
    function v(t) {
      if (!moving || t <= tr) return 0;
      if (t <= t1) return Math.max(0, v0 + a * (t - tr));
      if (stoppedEarly) return 0;
      if (p.caught) return Math.max(0, v1 - b * (t - t1));
      return 0;
    }
    var tOff = tEnd + 0.2, dots = [], times = [];
    if (pc.prints && p.threaded && isFinite(tp) && isFinite(tOff)) {
      var jitter = p.ideal ? 0 : 0.05e-3;
      for (var k = 0; tp + k * T0 <= tOff + 1e-9; k++) {
        var t = tp + k * T0; times.push(t); dots.push(s(t) + (jitter ? rnd.gauss(jitter) : 0));
      }
    }
    return { params: p, a: a, moving: moving, power: pc, L: L, T0: T0, tPower: tp, tRelease: tr, tArrive: t1, tStop: tEnd, tOff: tOff,
      s: s, v: v, dots: dots, times: times, tags: tags };
  }
  /** 第一个“清晰点”：之后相邻间距 ≥ minGap 的第一个点的下标 */
  function firstClearDot(dots, minGap) {
    minGap = minGap || 1e-3;
    for (var i = 0; i < dots.length - 1; i++) if (dots[i + 1] - dots[i] >= minGap) return i;
    return 0;
  }
  /** 选计数点并用刻度尺测量。opts: {start, every, n, method:'origin'|'segment', ideal, seed} */
  function measure(dots, opts) {
    var rnd = P.rng(opts.seed || 7), every = opts.every || 5, n = opts.n || 6, ideal = !!opts.ideal;
    var idx = [], i;
    for (i = 0; i <= n; i++) { var j = opts.start + i * every; if (j >= dots.length) break; idx.push(j); }
    var D = idx.map(function (j) { return dots[j] - dots[idx[0]]; });
    var step = 1e-4, pos = [0], segs = [];
    if (opts.method === 'segment') {
      for (i = 1; i < D.length; i++) {
        var x = D[i] - D[i - 1] + (ideal ? 0 : rnd.gauss(0.15e-3 * Math.SQRT2) + rnd.gauss(0.20e-3));
        x = P.roundTo(x, step); segs.push(x); pos.push(pos[i - 1] + x);
      }
    } else {
      for (i = 1; i < D.length; i++) pos.push(P.roundTo(D[i] + (ideal ? 0 : rnd.gauss(0.15e-3)), step));
      for (i = 1; i < pos.length; i++) segs.push(pos[i] - pos[i - 1]);
    }
    // 清理浮点尾巴（保留到 0.01 mm 以下精度）
    pos = pos.map(function (x) { return Math.round(x * 1e6) / 1e6; });
    segs = segs.map(function (x) { return Math.round(x * 1e6) / 1e6; });
    return { idx: idx, truePos: D, pos: pos, segs: segs };
  }
  /** 纸带数据处理：segs (m)、计数周期 T (s) */
  function analyze(segs, T) {
    var n = segs.length, i, dx = [], vs = [], ts = [];
    for (i = 0; i < n - 1; i++) dx.push(segs[i + 1] - segs[i]);
    for (i = 1; i < n; i++) { vs.push((segs[i - 1] + segs[i]) / (2 * T)); ts.push(i * T); }
    var k = Math.floor(n / 2), sA = 0, sB = 0;
    for (i = 0; i < k; i++) { sA += segs[i]; sB += segs[k + i]; }
    var aZC = k > 0 ? (sB - sA) / (k * k * T * T) : NaN;
    var aTwo = n > 1 ? (segs[n - 1] - segs[0]) / ((n - 1) * T * T) : NaN;
    var fit = P.linfit(ts, vs);
    return { dx: dx, vs: vs, ts: ts, aZhuCha: aZC, aTwoPoint: aTwo, fit: fit, k: k };
  }
  function sig4(x) { if (!isFinite(x) || x === 0) return x; var e = Math.floor(Math.log10(Math.abs(x))) - 3; return Math.round(x / Math.pow(10, e)) * Math.pow(10, e); }
  /** 光电门：d 遮光片宽 (m)；两门距出发点 0.200 m 与 0.600 m */
  function photogate(p, d) {
    p = withDefaults(p);
    var a = accel(p), p1 = 0.200, p2 = 0.600, x = p2 - p1;
    if (a <= 1e-6) return { a: a, d: d, x: x, dt1: Infinity, dt2: Infinity, t: Infinity, v1: NaN, v2: NaN, vTrue1: NaN, vTrue2: NaN, a1: NaN, a2: NaN };
    function tAt(s) { return Math.sqrt(2 * s / a); }
    var dt1 = sig4(tAt(p1 + d) - tAt(p1)), dt2 = sig4(tAt(p2 + d) - tAt(p2)), t = sig4(tAt(p2) - tAt(p1));
    var v1 = d / dt1, v2 = d / dt2;
    return { a: a, d: d, x: x, dt1: dt1, dt2: dt2, t: t, v1: v1, v2: v2,
      vTrue1: a * tAt(p1), vTrue2: a * tAt(p2),
      a1: (v2 * v2 - v1 * v1) / (2 * x), a2: (v2 - v1) / t };
  }
  ML.tape = { DEFAULTS: DEFAULTS, withDefaults: withDefaults, accel: accel, tension: tension, compensateAngle: compensateAngle, powerCheck: powerCheck,
    run: run, firstClearDot: firstClearDot, measure: measure, analyze: analyze, photogate: photogate };
})(typeof window !== 'undefined' ? (window.ML = window.ML || {}) : (globalThis.ML = globalThis.ML || {}));
