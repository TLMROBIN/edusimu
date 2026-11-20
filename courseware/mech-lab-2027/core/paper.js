/* ML.Paper — 仿纸质真题：单/多选、数值填空（容差+有效数字）、符号拼式、坐标纸作图。提交即判分并显示解析。 */
(function (ML) {
  'use strict';
  var h = ML.h, M = ML.math;

  /* ---------- 表达式解析（无 eval，CSP 安全） ---------- */
  function tokenize(s) {
    var out = [], i = 0, m;
    s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/²/g, '^2').replace(/√/g, 'sqrt ').replace(/π/g, ' pi ');
    while (i < s.length) {
      var c = s[i];
      if (c === ' ') { i++; continue; }
      if ((m = /^\d+\.?\d*|^\.\d+/.exec(s.slice(i)))) { out.push({ t: 'n', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z][A-Za-z0-9_]*/.exec(s.slice(i)))) { out.push(m[0] === 'sqrt' ? { t: 'sqrt' } : { t: 'id', v: m[0] }); i += m[0].length; continue; }
      if ('+-*/^()'.indexOf(c) >= 0) { out.push({ t: c }); i++; continue; }
      throw new Error('非法字符 ' + c);
    }
    return out;
  }
  function parse(s) {
    var tk = tokenize(s), i = 0;
    function peek() { return tk[i] || { t: 'end' }; }
    function eat(t) { if (peek().t !== t) throw new Error('缺少 ' + t); i++; }
    function expr() { var n = term(); while (peek().t === '+' || peek().t === '-') { var op = tk[i++].t; n = { op: op, a: n, b: term() }; } return n; }
    function term() {
      var n = juxt();
      while (peek().t === '*' || peek().t === '/') { var op = tk[i++].t; n = { op: op, a: n, b: juxt() }; }
      return n;
    }
    // 无运算符并置相乘（如 2T、10T、225T²）优先级高于显式 * /
    function juxt() {
      var n = unary();
      for (;;) {
        var t = peek().t;
        if (t === 'n' || t === 'id' || t === '(' || t === 'sqrt') n = { op: '*', a: n, b: unary() };
        else return n;
      }
    }
    function unary() { if (peek().t === '-') { i++; return { op: 'neg', a: unary() }; } if (peek().t === '+') { i++; return unary(); } return power(); }
    function power() { var b = primary(); if (peek().t === '^') { i++; return { op: '^', a: b, b: unary() }; } return b; }
    function primary() {
      var t = peek();
      if (t.t === 'n') { i++; return { num: t.v }; }
      if (t.t === 'id') { i++; return { id: t.v }; }
      if (t.t === 'sqrt') {
        i++;
        if (peek().t === '(') { i++; var inner = expr(); eat(')'); return { op: 'sqrt', a: inner }; }
        return { op: 'sqrt', a: unary() };
      }
      if (t.t === '(') { i++; var n = expr(); eat(')'); return n; }
      throw new Error('式子不完整');
    }
    var root = expr(); if (i !== tk.length) throw new Error('式子多余部分'); return root;
  }
  function evalNode(n, env) {
    if ('num' in n) return n.num;
    if ('id' in n) { if (n.id === 'pi' && !(n.id in env)) return Math.PI; if (!(n.id in env)) throw new Error('未知符号 ' + n.id); return env[n.id]; }
    var a = evalNode(n.a, env);
    if (n.op === 'neg') return -a;
    if (n.op === 'sqrt') return Math.sqrt(a);
    var b = evalNode(n.b, env);
    return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : n.op === '/' ? a / b : Math.pow(a, b);
  }
  /** 两式在随机取值下是否等价 */
  function exprEqual(a, b, vars) {
    var A = parse(a), B = parse(b), rnd = ML.phys.rng(97);
    for (var k = 0; k < 6; k++) {
      var env = {}; vars.forEach(function (v) { env[v] = 0.5 + rnd() * 2; });
      var x = evalNode(A, env), y = evalNode(B, env);
      if (!isFinite(x) || Math.abs(x - y) > 1e-9 * Math.max(1, Math.abs(y))) return false;
    }
    return true;
  }

  /** 拼式块 → 表达式串：相邻的数字块连成一个数（2、2、5 → 225），其余块之间加空格 */
  function joinTokens(list) {
    var s = '';
    list.forEach(function (b, i) {
      var digit = /^[0-9.]$/.test(b.v), prevDigit = i > 0 && /^[0-9.]$/.test(list[i - 1].v);
      s += (i > 0 && !(digit && prevDigit) ? ' ' : '') + b.v;
    });
    return s;
  }
  /* ---------- 软键盘（全局一个） ---------- */
  var kp = null, kpTarget = null;
  function keypad() {
    if (kp) return kp;
    var keys = ['7', '8', '9', '⌫', '4', '5', '6', '−', '1', '2', '3', '×10ⁿ', '0', '.', '清空', '完成'];
    kp = h('div.ml-keypad', { hidden: true, role: 'group', 'aria-label': '数字键盘' },
      keys.map(function (k) {
        return h('button.kp-key' + (k === '完成' ? '.primary' : ''), { type: 'button', onclick: function () { press(k); } }, k);
      }));
    document.body.appendChild(kp);
    window.addEventListener('scroll', positionKeypad, { capture: true, passive: true });
    window.addEventListener('resize', positionKeypad);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('scroll', positionKeypad);
      window.visualViewport.addEventListener('resize', positionKeypad);
    }
    return kp;
  }
  function positionKeypad() {
    if (!kpTarget) return;
    var viewport = window.visualViewport;
    var gap = 10;
    var left = (viewport ? viewport.offsetLeft : 0) + gap;
    var right = left + (viewport ? viewport.width : document.documentElement.clientWidth) - 2 * gap;
    var viewportTop = viewport ? viewport.offsetTop : 0;
    var main = kpTarget.el.closest('.ml-main');
    var top = Math.max(viewportTop, main.getBoundingClientRect().top) + gap;
    // 给平板底部的系统导航留出空间。
    var bottom = viewportTop + (viewport ? viewport.height : window.innerHeight) - 28;
    var anchor = kpTarget.el.getBoundingClientRect();
    if (anchor.bottom <= top - gap || anchor.top >= bottom + 28 ||
        anchor.right <= left - gap || anchor.left >= right + gap) {
      closeKeypad();
      return;
    }

    kp.style.maxWidth = Math.max(0, right - left) + 'px';
    kp.style.maxHeight = Math.max(0, bottom - top) + 'px';
    var width = kp.offsetWidth, height = kp.offsetHeight;
    var unit = kpTarget.el.nextElementSibling;
    var fieldRight = unit ? unit.getBoundingClientRect().right : anchor.right;
    var x = anchor.left, y = anchor.bottom + gap;
    if (fieldRight + gap + width <= right) {
      x = fieldRight + gap;
      y = anchor.top;
    } else if (anchor.left - gap - width >= left) {
      x = anchor.left - gap - width;
      y = anchor.top;
    } else if (y + height > bottom) {
      var above = anchor.top - gap - height;
      if (above >= top) {
        y = above;
      } else {
        var roomAbove = anchor.top - gap - top, roomBelow = bottom - y;
        var useAbove = roomAbove > roomBelow;
        var available = useAbove ? roomAbove : roomBelow;
        kp.style.maxHeight = Math.max(0, available) + 'px';
        if (useAbove) y = anchor.top - gap - kp.offsetHeight;
      }
    }
    kp.style.left = Math.max(left, Math.min(x, right - width)) + 'px';
    kp.style.top = Math.max(top, Math.min(y, bottom - kp.offsetHeight)) + 'px';
  }
  function press(k) {
    if (!kpTarget) return;
    var v = kpTarget.value;
    if (k === '⌫') v = v.slice(0, -1);
    else if (k === '清空') v = '';
    else if (k === '完成') { closeKeypad(); return; }
    else if (k === '×10ⁿ') { if (v.indexOf('×10^') < 0) v += '×10^'; }
    else if (k === '−') v = (v.indexOf('×10^') >= 0 && /\^$/.test(v)) ? v + '-' : (v[0] === '-' ? v.slice(1) : '-' + v);
    else v += k;
    kpTarget.value = v; kpTarget.onInput(v);
  }
  function openKeypad(target) {
    keypad(); if (kpTarget && kpTarget.el) kpTarget.el.classList.remove('focus');
    kpTarget = target; target.el.classList.add('focus'); kp.hidden = false;
    positionKeypad();
  }
  function closeKeypad() { if (kp) kp.hidden = true; if (kpTarget) kpTarget.el.classList.remove('focus'); kpTarget = null; }

  // 每个参考点必须匹配一个不同的作答点。
  function matchPlotPoints(points, reference, tolerance) {
    var assigned = [];
    function assign(i, visited) {
      return points.some(function (p, j) {
        var target = reference[i];
        if (visited[j] || Math.abs(p[0] - target[0]) > tolerance[0] + 1e-9 ||
            Math.abs(p[1] - target[1]) > tolerance[1] + 1e-9) return false;
        visited[j] = true;
        if (assigned[j] !== undefined && !assign(assigned[j], visited)) return false;
        assigned[j] = i;
        return true;
      });
    }
    return points.length === reference.length && reference.every(function (_, i) { return assign(i, []); });
  }

  /* ---------- 题目渲染 ---------- */
  function Paper(container, questions, opts) {
    opts = opts || {};
    this.opts = opts; this.el = h('div.paper-sheet'); container.appendChild(this.el);
    var store = ML.store.data; store.answers = store.answers || {};
    var self = this;
    this.el.appendChild(h('div.paper-head', h('div.paper-title', opts.title || '练·真题'), h('div.paper-sub', '在题面上直接作答，每题“提交”后立即判分并显示解析。')));
    questions.forEach(function (q, qi) { self.el.appendChild(self.renderQ(q, qi)); });
    document.addEventListener('pointerdown', function (e) { if (kpTarget && !kp.contains(e.target) && !(e.target.closest && e.target.closest('.blank'))) closeKeypad(); });
    ML.bus.on('tab', closeKeypad);
  }
  Paper.prototype.renderQ = function (q, qi) {
    var self = this, saved = ML.store.data.answers[q.id] || { vals: {}, sub: false };
    var parts = [], card = h('section.pq', { id: 'q-' + q.id });
    card.appendChild(h('div.pq-head', h('span.pq-no', (qi + 1) + '.'), h('span.pq-src', '（' + q.source + '）'), q.score ? h('span.pq-score', q.score + ' 分') : null));
    card.appendChild(h('div.pq-stem', { html: M.tex(q.stem) }));
    q.parts.forEach(function (pt, pi) { var r = self.renderPart(q, pt, pi, saved.vals[pi]); parts.push(r); card.appendChild(r.el); });
    var actions = h('div.pq-actions');
    var submit = h('button.btn.primary', { type: 'button' }, '提交本题');
    var redo = h('button.btn', { type: 'button' }, '重做');
    actions.appendChild(submit); actions.appendChild(redo);
    var result = h('div.pq-result', { 'aria-live': 'polite' });
    card.appendChild(actions); card.appendChild(result);
    function save() { var vals = {}; parts.forEach(function (p, i) { vals[i] = p.get(); }); ML.store.data.answers[q.id] = { vals: vals, sub: card.classList.contains('submitted') }; ML.store.save(); }
    parts.forEach(function (p) { p.onChange = save; });
    function grade(report) {
      closeKeypad();
      var right = 0;
      parts.forEach(function (p, i) {
        var correct = p.grade();
        if (correct) right++;
        if (report) ML.quiz.submit(q.parts[i].quizId, p.get(), correct, q.parts[i]);
      });
      card.classList.add('submitted');
      submit.disabled = true;
      result.className = 'pq-result ' + (right === parts.length ? 'ok' : 'some');
      result.textContent = right === parts.length ? '✓ 全部正确' : '本题 ' + parts.length + ' 空，答对 ' + right + ' 空。看看下面每空的解析。';
      save();
      ML.bus.emit('paper:graded', q.id, right === parts.length);
    }
    submit.onclick = function () { if (!card.classList.contains('submitted')) grade(true); };
    redo.onclick = function () { card.classList.remove('submitted'); submit.disabled = false; result.textContent = ''; result.className = 'pq-result'; parts.forEach(function (p) { p.reset(); }); save(); };
    if (saved.sub) grade(false);
    return card;
  };
  Paper.prototype.renderPart = function (q, pt, pi, saved) {
    var self = this, R = { el: h('div.pp'), onChange: null }, body = h('div.pp-body'), fb = h('div.pp-fb');
    var expl = h('div.pp-explain', h('b', '解析　'), h('span', { html: M.tex(pt.explain || '') }),
      pt.replay ? h('button.link', { type: 'button', onclick: function () { if (self.opts.onReplay) self.opts.onReplay(pt.replay); } }, '去实验台复现 →') : null);
    R.el.appendChild(h('div.pp-prompt', h('span.pp-label', pt.label || ''), h('span', { html: M.tex(pt.prompt || '') })));
    R.el.appendChild(body); R.el.appendChild(fb); R.el.appendChild(expl);
    function changed() { if (R.onChange) R.onChange(); }
    var t = pt.type;
    if (t === 'choice' || t === 'multi' || t === 'text-choice') {
      var multi = t === 'multi', sel = saved != null ? (multi ? saved.slice() : saved) : (multi ? [] : null), btns = [];
      var wrap = h('div.pp-opts' + (t === 'text-choice' || pt.inline ? '.inline' : ''));
      pt.options.forEach(function (o, i) {
        var letter = t === 'text-choice' ? '' : String.fromCharCode(65 + i) + '. ';
        var b = h('button.opt', { type: 'button', 'aria-pressed': 'false', html: '<b>' + letter + '</b>' + M.tex(o) });
        b.onclick = function () {
          if (R.el.parentNode.classList.contains('submitted')) return;
          if (multi) { var k = sel.indexOf(i); if (k >= 0) sel.splice(k, 1); else sel.push(i); } else sel = i;
          paint(); changed();
        };
        btns.push(b); wrap.appendChild(b);
      });
      function paint() { btns.forEach(function (b, i) { var on = multi ? sel.indexOf(i) >= 0 : sel === i; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
      paint(); body.appendChild(wrap);
      R.get = function () { return sel; };
      R.reset = function () { sel = multi ? [] : null; paint(); clearMarks(); };
      R.grade = function () {
        var ans = pt.answer, ok;
        if (multi) { var a = (Array.isArray(ans) ? ans : [ans]).slice().sort().join(','), s = sel.slice().sort().join(','); ok = a === s; }
        else ok = sel === ans;
        btns.forEach(function (b, i) { var isAns = multi ? ans.indexOf(i) >= 0 : ans === i; b.classList.toggle('right', isAns); b.classList.toggle('wrong', !isAns && (multi ? sel.indexOf(i) >= 0 : sel === i)); });
        mark(ok, ok ? '正确' : '正确答案：' + (multi ? ans : [ans]).map(function (i) { return t === 'text-choice' ? pt.options[i] : String.fromCharCode(65 + i); }).join(t === 'text-choice' ? '、' : ''));
        return ok;
      };
    } else if (t === 'numeric') {
      var blank = h('span.blank', { tabindex: '0', role: 'textbox', 'aria-label': '填空 ' + (pt.label || '') }), unit = pt.unit ? h('span.unit', pt.unit) : null;
      var target = { el: blank, value: saved || '', onInput: function (v) {
        blank.textContent = v || ' '; changed();
        if (kpTarget === target) positionKeypad();
      } };
      blank.textContent = target.value || ' ';
      function open() { if (!R.el.parentNode.classList.contains('submitted')) openKeypad(target); }
      blank.addEventListener('click', open);
      blank.addEventListener('keydown', function (e) {
        if (R.el.parentNode.classList.contains('submitted')) return;
        if (/^[0-9.]$/.test(e.key)) { target.value += e.key; target.onInput(target.value); e.preventDefault(); }
        else if (e.key === 'Backspace') { target.value = target.value.slice(0, -1); target.onInput(target.value); e.preventDefault(); }
        else if (e.key === '-') {
          var tv = target.value;
          target.value = (tv.indexOf('×10^') >= 0 && /\^$/.test(tv)) ? tv + '-' : (tv[0] === '-' ? tv.slice(1) : '-' + tv);
          target.onInput(target.value); e.preventDefault();
        }
        else if (e.key === 'Enter') open();
      });
      body.appendChild(h('div.pp-fill', blank, unit));
      R.get = function () { return target.value; };
      R.reset = function () { target.value = ''; blank.textContent = ' '; clearMarks(); };
      R.grade = function () {
        var v = M.parseNum(target.value), okV = isFinite(v) && Math.abs(v - pt.answer) <= (pt.tol != null ? pt.tol : Math.abs(pt.answer) * 0.01) + 1e-12;
        var okS = pt.sig ? M.countSig(target.value) === pt.sig : true, ok = okV && okS;
        var refShow = pt.show != null ? pt.show : (pt.sig ? M.sig(pt.answer, pt.sig) : pt.answer);
        var msg = (okV ? '数值 ✓' : '数值 ✗（参考 ' + refShow + (pt.unit ? ' ' + pt.unit : '') + '）') + (pt.sig ? '　有效数字 ' + (okS ? '✓' : '✗（应保留 ' + pt.sig + ' 位）') : '');
        mark(ok, msg); return ok;
      };
    } else if (t === 'expr') {
      var built = Array.isArray(saved) ? saved.slice() : [], disp = h('div.expr-disp', { 'aria-live': 'polite' });
      var palette = h('div.expr-pal');
      var blocks = Object.keys(pt.vars).map(function (k) { return { v: k, label: pt.vars[k] }; })
        .concat((pt.extra || ['1', '2', '3', '4', '5', '9', '0']).map(function (d) { return { v: d, label: d }; }))
        .concat([{ v: '(', label: '(' }, { v: ')', label: ')' }, { v: '+', label: '+' }, { v: '-', label: '−' }, { v: '*', label: '×' }, { v: '/', label: '÷' }, { v: '^2', label: '²' }]);
      if (pt.sqrt || (pt.answer && String(pt.answer).indexOf('sqrt') >= 0)) blocks.push({ v: 'sqrt(', label: '√(' });
      blocks.forEach(function (b) { palette.appendChild(h('button.tok', { type: 'button', onclick: function () { if (R.el.parentNode.classList.contains('submitted')) return; built.push(b); show(); changed(); } }, b.label)); });
      palette.appendChild(h('button.tok.fn', { type: 'button', onclick: function () { if (R.el.parentNode.classList.contains('submitted')) return; built.pop(); show(); changed(); } }, '⌫'));
      palette.appendChild(h('button.tok.fn', { type: 'button', onclick: function () { if (R.el.parentNode.classList.contains('submitted')) return; built = []; show(); changed(); } }, '清空'));
      function show() {
        disp.textContent = built.length ? built.map(function (b, i) { return (i > 0 && /^[0-9.]$/.test(b.v) && /^[0-9.]$/.test(built[i - 1].v) ? '' : ' ') + b.label; }).join('').trim() : '点下面的符号块拼出表达式';
        disp.classList.toggle('empty', !built.length);
      }
      show(); body.appendChild(h('div.pp-expr', h('span.expr-lhs', { html: M.tex(pt.lhs || '') }), disp)); body.appendChild(palette);
      R.get = function () { return built; };
      R.reset = function () { built = []; show(); clearMarks(); };
      R.grade = function () {
        var ok = false, msg;
        try { ok = exprEqual(joinTokens(built), pt.answer, Object.keys(pt.vars)); msg = ok ? '正确' : '与标准答案不等价'; }
        catch (e) { msg = '式子不完整：' + e.message; }
        mark(ok, msg + (ok ? '' : '。参考：' + (pt.show || pt.answer))); return ok;
      };
    } else if (t === 'plot') {
      var plotStatus = h('div.pp-plot-status');
      function updatePlotStatus() {
        var k = chart.slope();
        var ptsCount = chart.state && chart.state.pts ? chart.state.pts.length : 0;
        var needCount = pt.points ? pt.points.length : 0;
        var last = chart.lastPt ? '　最近点：(' + chart.lastPt[0].toFixed(2) + ', ' + chart.lastPt[1].toFixed(2) + ')' : '';
        plotStatus.textContent = '已描点：' + ptsCount + (needCount ? ' / ' + needCount : '') + ' 个　当前直线斜率 k ≈ ' + (isFinite(k) ? M.sig(k, 3) : '—') + last;
      }
      var chart = new ML.Chart(body, { paper: true, x: pt.x, y: pt.y, xLabel: pt.xLabel, yLabel: pt.yLabel, height: 300, edit: { snap: pt.snap, maxPoints: pt.points.length + 4, onChange: function () { updatePlotStatus(); changed(); } } });
      body.appendChild(plotStatus);
      body.appendChild(h('div.pp-tip', '点坐标纸描点（可拖动微调位置，轻点已有点删除）；拖动两个青色手柄调整直线，使尽量多的点落在线上，其余点均匀分布在两侧。'));
      chart.setState(saved || null);
      if (!chart.state.line) chart.addLine(pt.lineInit ? pt.lineInit[0] : [pt.x[0], pt.y[0]], pt.lineInit ? pt.lineInit[1] : [pt.x[1] * 0.6, pt.y[1] * 0.6]);
      updatePlotStatus();
      R.get = function () { return chart.state; };
      R.reset = function () { chart.locked = false; chart.lastPt = null; chart.setState(null); chart.addLine(pt.lineInit ? pt.lineInit[0] : [pt.x[0], pt.y[0]], pt.lineInit ? pt.lineInit[1] : [pt.x[1] * 0.6, pt.y[1] * 0.6]); chart.set([]); updatePlotStatus(); clearMarks(); };
      R.grade = function () {
        chart.locked = true;
        var tolP = pt.ptTol || pt.snap;
        var okPoints = matchPlotPoints(chart.state.pts, pt.points, tolP);
        var k = chart.slope(), okK = Math.abs(k - pt.slope) <= pt.tol;
        var anchor = chart.state.line[0];
        var okFit = okK && pt.points.every(function (p) {
          return Math.abs(anchor[1] + k * (p[0] - anchor[0]) - p[1]) <= (pt.fitTol || tolP[1]) + 1e-9;
        });
        var ok = okPoints && okFit;
        chart.set([{ pts: pt.points, color: '#25A870', fit: true, hollow: true, dash: true, label: '参考：描点与拟合线' }]);
        mark(ok, (okPoints ? '描点 ✓' : '请检查漏点、多余点及点位') + '　斜率 ' + (isFinite(k) ? M.sig(k, 3) : '—') + (okK ? ' ✓' : ' ✗（参考 ' + pt.slope + ' ± ' + pt.tol + '）') + (okK && !okFit ? '　直线位置偏离数据' : ''));
        return ok;
      };
    }
    function mark(ok, msg) { R.el.classList.toggle('ok', ok); R.el.classList.toggle('bad', !ok); fb.textContent = (ok ? '✓ ' : '✕ ') + msg; }
    function clearMarks() { R.el.classList.remove('ok', 'bad'); fb.textContent = ''; ML.$$('.opt', R.el).forEach(function (b) { b.classList.remove('right', 'wrong'); }); }
    return R;
  };

  ML.Paper = Paper;
  ML.expr = { parse: parse, evalNode: evalNode, equal: exprEqual };
})(typeof window !== 'undefined' ? (window.ML = window.ML || {}) : (globalThis.ML = globalThis.ML || {}));
