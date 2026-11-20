/* ML.math — 轻量公式与数字格式。 */
(function (ML) {
  'use strict';
  function frac(n, d) { return '<span class="mf"><span class="mf-n">' + n + '</span><span class="mf-d">' + d + '</span></span>'; }
  /** 展开内容中的 {{frac|分子|分母}}、{{sqrt|x}}、{{bar|x}} 标记；可嵌套（由内向外） */
  function tex(s) {
    if (!s) return '';
    s = s.replace(/([A-Za-z0-9])\u0304/g, '<span class="mbar">$1</span>');
    var prev;
    do {
      prev = s;
      s = s.replace(/\{\{frac\|([^{}|]*)\|([^{}]*)\}\}/g, function (_, a, b) { return frac(a, b); })
        .replace(/\{\{sqrt\|([^{}]*)\}\}/g, function (_, a) { return '<span class="msq">√<span class="msq-in">' + a + '</span></span>'; })
        .replace(/\{\{bar\|([^{}]*)\}\}/g, '<span class="mbar">$1</span>');
    } while (s !== prev);
    return s;
  }
  /** 保留 n 位有效数字的字符串 */
  function sig(x, n) {
    if (!isFinite(x)) return '—';
    if (x === 0) return (0).toFixed(Math.max(0, n - 1));
    var e = Math.floor(Math.log10(Math.abs(x))), dec = n - 1 - e;
    return dec > 0 ? x.toFixed(Math.min(dec, 10)) : String(Math.round(x / Math.pow(10, -dec)) * Math.pow(10, -dec));
  }
  function fix(x, d) { return isFinite(x) ? x.toFixed(d) : '—'; }
  /** 数字字符串的有效数字位数（"0.0340"→3；整数末尾 0 按不计处理，如 "340"→2） */
  function countSig(str) {
    var s = String(str).trim().replace(/^[+−-]/, '').replace(/[×x]10\^?.*$/, '');
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    if (s.indexOf('.') >= 0) { var t = s.replace('.', '').replace(/^0+/, ''); return t.length || 1; }
    return s.replace(/^0+/, '').replace(/0+$/, '').length || 1;
  }
  function parseNum(str) {
    var s = String(str).trim().replace(/−/g, '-').replace(/\s/g, '');
    var m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))(?:[×x]10\^?([+-]?\d+))?$/);
    if (!m) return NaN;
    return parseFloat(m[1]) * (m[2] ? Math.pow(10, parseInt(m[2], 10)) : 1);
  }
  ML.math = { frac: frac, tex: tex, sig: sig, fix: fix, countSig: countSig, parseNum: parseNum };
})(typeof window !== 'undefined' ? (window.ML = window.ML || {}) : (globalThis.ML = globalThis.ML || {}));
