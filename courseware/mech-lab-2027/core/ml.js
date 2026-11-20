/* ML — 命名空间、DOM 助手、存档、事件、提示、性能模式。ES2019，无依赖。 */
(function (ML) {
  'use strict';
  /** h('div.cls#id', {属性 | onXxx 事件 | style | html | text}, children...) */
  function h(sel, attrs) {
    var m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i), el = document.createElement((m && m[1]) || 'div');
    if (m && m[2]) m[2].replace(/([.#])([\w-]+)/g, function (_, t, v) { if (t === '.') el.classList.add(v); else el.id = v; });
    var kids = Array.prototype.slice.call(arguments, 2);
    if (attrs && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    if (attrs) for (var k in attrs) {
      var v = attrs[k]; if (v === undefined || v === null || v === false) continue;
      if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') for (var s in v) el.style[s] = v[s];
      else if (k === 'class') String(v).split(/\s+/).forEach(function (c) { if (c) el.classList.add(c); });
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'data') for (var d in v) el.dataset[d] = v[d];
      else el.setAttribute(k, v === true ? '' : v);
    }
    (function add(list) {
      list.forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        if (Array.isArray(c)) add(c); else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
      });
    })(kids);
    return el;
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clear(el) { el.textContent = ''; return el; }

  /* 事件总线 */
  var handlers = {};
  var bus = {
    on: function (n, f) { (handlers[n] = handlers[n] || []).push(f); return function () { bus.off(n, f); }; },
    off: function (n, f) { var l = handlers[n]; if (l) { var i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } },
    emit: function (n, a, b) { (handlers[n] || []).slice().forEach(function (f) { try { f(a, b); } catch (e) { console.error(e); } }); }
  };

  /* 存档：唯一键 lab3d:<slug>，≤16KB，失败静默 */
  var store = {
    key: null, data: {}, timer: 0,
    init: function (slug, defaults) {
      store.key = 'lab3d:' + slug; store.data = {};
      var k; for (k in defaults) store.data[k] = defaults[k];
      try {
        var raw = window.localStorage.getItem(store.key);
        if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object' && o.v === defaults.v) for (k in o) store.data[k] = o[k]; }
      } catch (e) { /* 降级为内存 */ }
      return store.data;
    },
    set: function (patch) { for (var k in patch) store.data[k] = patch[k]; store.save(); },
    _write: function () {
      if (!store.key) return;
      try {
        var s = JSON.stringify(store.data);
        while (s.length > 16000 && store.data.answers) {
          var ks = Object.keys(store.data.answers); if (!ks.length) break;
          delete store.data.answers[ks[0]]; s = JSON.stringify(store.data);
        }
        if (s.length <= 16000) window.localStorage.setItem(store.key, s);
      } catch (e) { /* 忽略 */ }
    },
    flush: function () {
      clearTimeout(store.timer); store.timer = 0;
      store._write();
    },
    save: function () {
      clearTimeout(store.timer);
      store.timer = setTimeout(function () { store.timer = 0; store._write(); }, 500);
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', function () { store.flush(); });
    window.addEventListener('beforeunload', function () { store.flush(); });
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () { if (document.hidden) store.flush(); });
  }

  /* 提示条 */
  var toastEl = null, toastTimer = 0;
  function toast(msg, type) {
    if (!toastEl) { toastEl = h('div.ml-toast', { role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastEl); }
    toastEl.className = 'ml-toast show ' + (type || 'info');
    toastEl.innerHTML = '<b>' + ({ ok: '✓', warn: '!', err: '✕', info: 'i' }[type || 'info']) + '</b><span></span>';
    toastEl.lastChild.textContent = msg;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.className = 'ml-toast'; }, 2600);
  }

  /* 性能模式：前 60 帧平均 < 28fps 自动开启低性能（M9 实测基线约 33.6fps，见 SERIES §0） */
  var perf = {
    low: false, dprCap: 1.5, fps: 0,
    reduced: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    set: function (low) {
      perf.low = !!low; perf.dprCap = low ? 1.25 : 1.5;
      document.documentElement.classList.toggle('ml-low', perf.low);
      bus.emit('perf', perf.low);
    },
    probe: function () {
      var n = 0, t0 = 0;
      function f(t) {
        if (!t0) t0 = t;
        if (++n < 60) { requestAnimationFrame(f); return; }
        var fps = 59000 / (t - t0); perf.fps = fps;
        if (fps < 28 && !perf.low) { perf.set(true); toast('检测到设备较慢，已切换到流畅模式', 'info'); }
      }
      requestAnimationFrame(f);
    },
    dpr: function () { return Math.min(window.devicePixelRatio || 1, perf.dprCap); }
  };

  function json(id) { var el = document.getElementById(id); if (!el) return null; try { return JSON.parse(el.textContent); } catch (e) { console.error('JSON 解析失败', id, e); return null; } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function submitQuiz(id, value, correct, part) {
    if (!id || window.parent === window) return;
    if (part && part.type === 'expr') value = value.map(function (token) { return token.label; }).join(' ');
    if (part && part.type === 'plot') {
      function compact(p) { return p.map(function (n) { return Math.round(n * 1000000) / 1000000; }); }
      value = { pts: value.pts.slice(0, part.points.length + 4).map(compact),
        pointCount: value.pts.length, line: value.line ? value.line.map(compact) : null };
    }
    if (part && part.options) {
      var selected = Array.isArray(value) ? value : value == null ? [] : [value];
      var labels = selected.slice().sort(function (a, b) { return a - b; }).map(function (i) {
        return String.fromCharCode(65 + i);
      });
      value = part.type === 'multi' || (Array.isArray(part.answer) && part.answer.length > 1) ? labels : (labels[0] || '');
    }
    var answer = typeof value === 'string' ? value : JSON.stringify(value);
    // Keep the report within the platform's UTF-8 limit even with older saved inputs.
    var bytes = new TextEncoder().encode(answer);
    if (bytes.length > 1024) answer = new TextDecoder().decode(bytes.subarray(0, 1021)).replace(/\uFFFD$/, '') + '…';
    window.parent.postMessage({
      type: 'EDUSIMU_QUIZ_SUBMIT', version: 1, questionId: id,
      answer: answer, isCorrect: correct
    }, '*');
  }

  ML.quiz = { submit: submitQuiz };
  ML.h = h; ML.$ = $; ML.$$ = $$; ML.clear = clear; ML.bus = bus; ML.store = store; ML.toast = toast; ML.perf = perf; ML.json = json; ML.esc = esc;
})(window.ML = window.ML || {});
