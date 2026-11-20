/* ML.phys — 种子随机、噪声、拟合、数值工具。浏览器与 Node 通用（无 DOM）。 */
(function (ML) {
  'use strict';
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    function next() {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    var spare = null;
    next.gauss = function (sigma) {
      sigma = sigma === undefined ? 1 : sigma;
      if (spare !== null) { var r = spare; spare = null; return r * sigma; }
      var u = 0, v = 0;
      while (u === 0) u = next();
      v = next();
      var mag = Math.sqrt(-2 * Math.log(u));
      spare = mag * Math.sin(2 * Math.PI * v);
      return mag * Math.cos(2 * Math.PI * v) * sigma;
    };
    next.int = function (a, b) { return a + Math.floor(next() * (b - a + 1)); };
    return next;
  }
  /** 最小二乘直线 y = k x + b */
  function linfit(xs, ys) {
    var n = xs.length, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, i;
    for (i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; syy += ys[i] * ys[i]; }
    var den = n * sxx - sx * sx;
    if (n < 2 || den === 0) return { k: NaN, b: NaN, r2: NaN };
    var k = (n * sxy - sx * sy) / den, b = (sy - k * sx) / n;
    var ssTot = syy - sy * sy / n, ssRes = 0;
    for (i = 0; i < n; i++) { var e = ys[i] - (k * xs[i] + b); ssRes += e * e; }
    return { k: k, b: b, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1 };
  }
  function roundTo(x, step) { return Math.round(x / step) * step; }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : NaN; }
  function std(a) { var m = mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return a.length > 1 ? Math.sqrt(s / (a.length - 1)) : 0; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  ML.phys = { rng: rng, linfit: linfit, roundTo: roundTo, mean: mean, std: std, clamp: clamp, G: 9.80 };
})(typeof window !== 'undefined' ? (window.ML = window.ML || {}) : (globalThis.ML = globalThis.ML || {}));
