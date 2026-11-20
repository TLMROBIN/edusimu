/* M00 scene — 基础仪器与读数：五类仪器实训台、错误诊断、学习小部件、四拍对比与结果反推。 */
(function (ML) {
  'use strict';
  var h = ML.h, M = ML.math, P = ML.phys, G = ML.gauges, GV = ML.gaugesView;
  var C = ML.json('ml-content'), Q = ML.json('ml-questions') || [];
  var S = ML.store.init(C.slug, {
    v: 1, tab: 'learn', learnPage: 0, mode: 'guided',
    inst: 'caliper', streak: 0, done: {}, answers: {}, pDone: {}, solvedInst: {}
  });
  var ERR = {}; C.errors.forEach(function (e) { ERR[e.id] = e; });
  var PROC = {}; C.procedure.forEach(function (p) { PROC[p.id] = p; });
  var INST_LIST = [
    { id: 'caliper', name: '游标卡尺' },
    { id: 'micrometer', name: '螺旋测微器' },
    { id: 'ruler', name: '毫米刻度尺' },
    { id: 'dynamometer', name: '弹簧测力计' },
    { id: 'stopwatch', name: '机械停表' }
  ];
  var randSeed = 17;

  function stageHeight(bannerEl) {
    var ih = window.innerHeight || 600;
    var bh = (bannerEl && !bannerEl.hidden) ? bannerEl.offsetHeight + 6 : 0;
    return ih <= 640 ? Math.max(260, ih - 106 - bh) : 410;
  }

  function expectInfo(st) {
    if (st.type === 'caliper') {
      var dc = G.caliper.decompose(st.valMm, st.div);
      return { val: st.unit === 'cm' ? dc.cmStr : dc.mmStr, unit: st.unit };
    }
    if (st.type === 'micrometer') {
      var dm = G.micrometer.decompose(st.trueMm, st.zeroErrMm);
      return { val: st.unit === 'cm' ? dm.cmStr : dm.trueStr, unit: st.unit };
    }
    if (st.type === 'ruler') {
      var dr = G.ruler.decompose(st.lengthMm, st.startMm);
      return { val: st.unit === 'cm' ? dr.cmStr : dr.mmStr, unit: st.unit };
    }
    if (st.type === 'dynamometer') {
      return { val: G.dynamometer.decompose(st.trueForceN, st.zeroOffsetN).trueStr, unit: 'N' };
    }
    return { val: G.stopwatch.decompose(st.totalSec).secStr, unit: 's' };
  }

  /* =====================================================================
   *  ② 做·实验
   * ===================================================================== */
  var bench = null;
  function Bench(el) {
    var self = this; this.el = el;
    this.mode = S.mode || 'guided';
    this.input = '';
    this.fb = null;
    this.pDone = S.pDone || {};
    this.solvedInst = S.solvedInst || {};
    this.freeTags = [];
    this.st = {
      type: S.inst || 'caliper',
      div: 10, valMm: 19.0, unit: (S.inst === 'ruler' ? 'cm' : 'mm'), hintAlign: false,
      trueMm: 6.860, zeroErrMm: 0,
      lengthMm: 19.0, startMm: 0, sightShiftMm: 0,
      trueForceN: 3.70, zeroOffsetN: 0,
      totalSec: 54.0,
      marks: null
    };

    var modeChips = h('div.seg',
      h('button.chip', { type: 'button', data: { v: 'guided' }, onclick: function () { self.setMode('guided'); } }, '引导模式'),
      h('button.chip', { type: 'button', data: { v: 'free' }, onclick: function () { self.setMode('free'); } }, '自由模式'));
    this.modeChips = modeChips;

    this.instChips = h('div.seg', INST_LIST.map(function (it) {
      return h('button.chip', { type: 'button', data: { v: it.id }, onclick: function () { self.setInst(it.id); } }, it.name);
    }));
    var randBtn = h('button.btn.primary', { type: 'button', onclick: function () { self.randomize(); } }, '随机出题');
    this.bannerEl = h('div.bench-banner', { hidden: true });
    var top = h('div.bench-top', modeChips, this.instChips, h('div.spacer'), randBtn);

    this.stageWrap = h('div.bench-stage-wrap');
    this.side = h('aside.bench-side');
    this.benchEl = h('div.bench', top, this.bannerEl, h('div.bench-row', this.stageWrap, this.side));
    el.appendChild(this.benchEl);

    this.gauge = new GV.GaugeBench(this.stageWrap, {
      height: stageHeight(this.bannerEl),
      state: this.st,
      onChange: function (st) {
        ['valMm', 'div', 'trueMm', 'zeroErrMm', 'lengthMm', 'startMm', 'trueForceN', 'zeroOffsetN', 'totalSec', 'unit'].forEach(function (k) {
          if (st[k] !== undefined) self.st[k] = st[k];
        });
        self.fb = null; self.renderFb();
      }
    });
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(function () {
        var nh = stageHeight(self.bannerEl);
        if (self.gauge && self.gauge.el && Math.abs(parseInt(self.gauge.el.style.height, 10) - nh) > 4) {
          self.gauge.el.style.height = nh + 'px';
        }
      });
      this._ro.observe(document.body);
    }

    this.setMode(this.mode, true);
    this.setInst(this.st.type, true);
  }

  Bench.prototype.setBanner = function (html) {
    this.bannerEl.hidden = !html;
    this.bannerEl.innerHTML = html || '';
    if (this.benchEl) this.benchEl.classList.toggle('has-banner', !!html);
    var nh = stageHeight(this.bannerEl);
    if (this.gauge && this.gauge.el) this.gauge.el.style.height = nh + 'px';
  };
  Bench.prototype.setMode = function (m, silent) {
    this.mode = m; S.mode = m; ML.store.save();
    ML.$$('.chip', this.modeChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === m); });
    if (!silent) { this.setBanner(null); ML.toast(m === 'guided' ? '引导模式：按要点完成各类仪器读数' : '自由模式：自由拖动仪器、随时验证读数'); }
    this.renderSide();
  };
  Bench.prototype.setInst = function (id, silent) {
    this.st.type = id;
    this.st.marks = null;
    if (id === 'ruler' && this.st.unit !== 'cm' && this.st.unit !== 'mm') this.st.unit = 'cm';
    if (id === 'ruler' && !silent) this.st.unit = 'cm';
    if ((id === 'caliper' || id === 'micrometer') && !silent) this.st.unit = 'mm';
    S.inst = id; ML.store.save();
    ML.$$('.chip', this.instChips).forEach(function (c) { c.classList.toggle('on', c.dataset.v === id); });
    this.input = ''; this.fb = null;
    this.gauge.set(this.st);
    this.renderSide();
  };
  Bench.prototype.randomize = function () {
    var rnd = P.rng(randSeed += 13), s = this.st;
    s.marks = null;
    if (s.type === 'caliper') {
      var divs = [10, 20, 50]; s.div = divs[rnd.int(0, 2)];
      var step = 1 / s.div;
      s.valMm = +(rnd.int(40, 260) / 10 + rnd.int(0, s.div - 1) * step).toFixed(2);
    } else if (s.type === 'micrometer') {
      s.trueMm = +(rnd.int(12, 98) / 10 + rnd.int(0, 49) * 0.01 + rnd.int(0, 9) * 0.001).toFixed(3);
    } else if (s.type === 'ruler') {
      s.lengthMm = +(rnd.int(110, 380) / 10).toFixed(1);
    } else if (s.type === 'dynamometer') {
      s.trueForceN = +(rnd.int(5, 44) / 10 + rnd.int(0, 9) * 0.01).toFixed(2);
    } else if (s.type === 'stopwatch') {
      s.totalSec = +(rnd.int(60, 1480) / 10).toFixed(1);
    }
    this.input = ''; this.fb = null;
    this.gauge.set(s);
    this.renderSide();
    ML.toast('已生成新题目，可用放大镜观察后输入读数', 'info');
  };
  Bench.prototype.nudge = function (delta) {
    var s = this.st;
    s.marks = null;
    if (s.type === 'caliper') s.valMm = P.clamp(+(s.valMm + delta * (1 / s.div)).toFixed(2), 1, 48);
    else if (s.type === 'micrometer') s.trueMm = P.clamp(+(s.trueMm + delta * 0.005).toFixed(3), 0.2, 14.5);
    else if (s.type === 'ruler') s.lengthMm = P.clamp(+(s.lengthMm + delta * 0.5).toFixed(1), 5, 48);
    else if (s.type === 'dynamometer') s.trueForceN = P.clamp(+(s.trueForceN + delta * 0.05).toFixed(2), 0.1, 4.9);
    else if (s.type === 'stopwatch') s.totalSec = P.clamp(+(s.totalSec + delta * 0.5).toFixed(1), 0.5, 179);
    this.fb = null;
    this.gauge.set(s);
    this.renderFb();
  };
  Bench.prototype.markStep = function (id) {
    this.pDone[id] = true;
    S.pDone = this.pDone;
    ML.store.set({ pDone: this.pDone });
  };
  Bench.prototype.submitReading = function () {
    var s = this.st, res;
    if (s.type === 'caliper') res = G.caliper.diagnose(this.input, s.valMm, { div: s.div, unit: s.unit });
    else if (s.type === 'micrometer') res = G.micrometer.diagnose(this.input, s.trueMm, { zeroErrMm: s.zeroErrMm, unit: s.unit });
    else if (s.type === 'ruler') res = G.ruler.diagnose(this.input, s.lengthMm, { startMm: s.startMm, unit: s.unit });
    else if (s.type === 'dynamometer') res = G.dynamometer.diagnose(this.input, s.trueForceN, { zeroOffsetN: s.zeroOffsetN });
    else res = G.stopwatch.diagnose(this.input, s.totalSec);

    this.fb = res;
    if (res.ok) {
      S.streak = (S.streak || 0) + 1;
      this.solvedInst[s.type] = true;
      this.markStep('P1');
      if (s.type === 'caliper') this.markStep('P2');
      if (s.type === 'micrometer') this.markStep('P3');
      if ((s.type === 'ruler' || s.type === 'dynamometer' || s.type === 'micrometer') && /0$/.test(this.input.trim())) this.markStep('P4');
      if ((s.type === 'micrometer' && Math.abs(s.zeroErrMm) > 1e-6) || (s.type === 'dynamometer' && Math.abs(s.zeroOffsetN) > 1e-6)) this.markStep('P5');
      if (s.type === 'stopwatch') this.markStep('P6');
      if (s.type === 'ruler' && s.startMm > 0) this.markStep('P7');
      if (Object.keys(this.solvedInst).length >= 5) this.markStep('P8');
      ML.store.set({ streak: S.streak, solvedInst: this.solvedInst });
      ML.toast('读数完全正确！已连续答对 ' + S.streak + ' 次', 'ok');
    } else {
      S.streak = 0; ML.store.set({ streak: 0 });
      if (this.mode === 'free' && res.errorId && ERR[res.errorId] && this.freeTags.indexOf(res.errorId) < 0) {
        this.freeTags.push(res.errorId);
      }
    }
    this.renderSide();
  };
  Bench.prototype.renderFb = function () {
    if (!this.fbBox) return;
    ML.clear(this.fbBox);
    if (!this.fb) {
      this.fbBox.className = 'm00-fb';
      this.fbBox.textContent = '长按仪器可呼出 3× 放大镜；拖动量爪/旋钮也可调数值。';
      return;
    }
    var r = this.fb;
    this.fbBox.className = 'm00-fb ' + (r.ok ? 'ok' : 'bad');
    this.fbBox.appendChild(h('div', (r.ok ? '✓ ' : '✕ ') + r.msg));
    if (!r.ok && r.errorId && ERR[r.errorId]) {
      this.fbBox.appendChild(h('button.link', { type: 'button', onclick: function () { openTry(r.errorId); } }, '为什么这样错？试一试 →'));
    }
  };
  Bench.prototype.renderSide = function () {
    var self = this, s = this.st, side = this.side; if (!side) return;
    ML.clear(side);
    var row = function () { return h('div.side-row', Array.prototype.slice.call(arguments)); };
    function chip(label, on, fn) { return h('button.chip' + (on ? '.on' : ''), { type: 'button', onclick: fn }, label); }

    var ctl = h('div.side-ctl');
    ctl.appendChild(h('div.side-k', h('span', '参数与读数'), h('span', { style: { color: '#17784F' } }, '连对 ' + (S.streak || 0) + ' 次')));

    if (s.type === 'caliper') {
      ctl.appendChild(row(h('span.side-l', '分度'),
        [10, 20, 50].map(function (d) { return chip(d + '分度', s.div === d, function () { s.div = d; self.fb = null; self.gauge.set(s); self.renderSide(); }); }),
        chip('对齐线', !!s.hintAlign, function () { s.hintAlign = !s.hintAlign; self.gauge.set(s); self.renderSide(); })));
      ctl.appendChild(row(h('span.side-l', '单位'),
        chip('mm', s.unit === 'mm', function () { s.unit = 'mm'; self.fb = null; self.renderSide(); }),
        chip('cm', s.unit === 'cm', function () { s.unit = 'cm'; self.fb = null; self.renderSide(); }),
        chip('19.0 mm', false, function () { s.div = 10; s.valMm = 19.0; s.unit = 'mm'; self.input = ''; self.fb = null; self.gauge.set(s); self.renderSide(); }),
        chip('6.04 mm', false, function () { s.div = 50; s.valMm = 6.04; s.unit = 'mm'; self.input = ''; self.fb = null; self.gauge.set(s); self.renderSide(); })));
    } else if (s.type === 'micrometer') {
      ctl.appendChild(row(h('span.side-l', '零误差'),
        [0, 0.02, -0.015].map(function (z) {
          return chip(z === 0 ? '无' : (z > 0 ? '+' : '') + z.toFixed(3), Math.abs(s.zeroErrMm - z) < 1e-6, function () { s.zeroErrMm = z; self.fb = null; self.gauge.set(s); self.renderSide(); });
        }),
        chip('mm', s.unit === 'mm', function () { s.unit = 'mm'; self.fb = null; self.renderSide(); }),
        chip('cm', s.unit === 'cm', function () { s.unit = 'cm'; self.fb = null; self.renderSide(); })));
      ctl.appendChild(row(h('span.side-l', '典型'),
        chip('6.860', false, function () { s.trueMm = 6.860; s.zeroErrMm = 0; s.unit = 'mm'; self.input = ''; self.fb = null; self.gauge.set(s); self.renderSide(); }),
        chip('7.415', false, function () { s.trueMm = 7.415; s.zeroErrMm = 0; s.unit = 'mm'; self.input = ''; self.fb = null; self.gauge.set(s); self.renderSide(); }),
        chip('8.260', false, function () { s.trueMm = 8.260; s.zeroErrMm = 0; s.unit = 'mm'; self.input = ''; self.fb = null; self.gauge.set(s); self.renderSide(); })));
    } else if (s.type === 'ruler') {
      ctl.appendChild(row(h('span.side-l', '起点'),
        chip('0 刻度', s.startMm === 0, function () { s.startMm = 0; s.marks = null; self.fb = null; self.gauge.set(s); self.renderSide(); }),
        chip('1.00 cm', s.startMm === 10, function () { s.startMm = 10; s.marks = null; self.fb = null; self.gauge.set(s); self.renderSide(); }),
        chip('cm', s.unit === 'cm', function () { s.unit = 'cm'; self.fb = null; self.renderSide(); }),
        chip('mm', s.unit === 'mm', function () { s.unit = 'mm'; self.fb = null; self.renderSide(); })));
    } else if (s.type === 'dynamometer') {
      ctl.appendChild(row(h('span.side-l', '空载'),
        chip('已调零', s.zeroOffsetN === 0, function () { s.zeroOffsetN = 0; self.fb = null; self.gauge.set(s); self.renderSide(); }),
        chip('偏 +0.10 N', Math.abs(s.zeroOffsetN - 0.1) < 1e-6, function () { s.zeroOffsetN = 0.1; self.fb = null; self.gauge.set(s); self.renderSide(); }),
        chip('3.70 N', false, function () { s.trueForceN = 3.70; s.zeroOffsetN = 0; self.input = ''; self.fb = null; self.gauge.set(s); self.renderSide(); })));
    } else if (s.type === 'stopwatch') {
      ctl.appendChild(row(h('span.side-l', '示例'),
        chip('24.0 s', false, function () { s.totalSec = 24.0; self.input = ''; self.fb = null; self.gauge.set(s); self.renderSide(); }),
        chip('54.0 s', false, function () { s.totalSec = 54.0; self.input = ''; self.fb = null; self.gauge.set(s); self.renderSide(); }),
        chip('78.4 s', false, function () { s.totalSec = 78.4; self.input = ''; self.fb = null; self.gauge.set(s); self.renderSide(); })));
    }

    ctl.appendChild(row(h('span.side-l', '微调'),
      chip('−', false, function () { self.nudge(-1); }),
      chip('+', false, function () { self.nudge(1); }),
      chip('看答案', false, function () {
        var ex = expectInfo(s);
        ML.toast('当前参考读数：' + ex.val + ' ' + ex.unit, 'info');
      })));

    var unitLbl = s.type === 'dynamometer' ? 'N' : s.type === 'stopwatch' ? 's' : s.unit;
    var disp = h('div.m00-disp' + (this.input ? '' : '.empty'), {
      tabindex: '0', role: 'textbox', 'aria-label': '输入仪器读数',
      onkeydown: function (e) {
        if (/^[0-9.]$/.test(e.key)) {
          if (e.key === '.' && self.input.indexOf('.') >= 0) { e.preventDefault(); return; }
          self.input += e.key; updateDisp(); e.preventDefault();
        }
        else if (e.key === 'Backspace') { self.input = self.input.slice(0, -1); updateDisp(); e.preventDefault(); }
        else if (e.key === 'Enter') { self.submitReading(); e.preventDefault(); }
      }
    }, this.input || '点下面数字键输入读数');
    function updateDisp() {
      disp.textContent = self.input || '点下面数字键输入读数';
      disp.classList.toggle('empty', !self.input);
    }
    var checkBtn = h('button.btn.primary.sm', { type: 'button', onclick: function () { self.submitReading(); } }, '判分');
    ctl.appendChild(h('div.m00-read-row', disp, h('span.m00-unit', unitLbl), checkBtn));

    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', '⌫'];
    ctl.appendChild(h('div.m00-pad', keys.map(function (k) {
      return h('button.m00-k', { type: 'button', onclick: function () {
        if (k === '⌫') self.input = self.input.slice(0, -1);
        else if (k === '.' && self.input.indexOf('.') >= 0) return;
        else self.input += k;
        updateDisp();
      } }, k);
    })));

    this.fbBox = h('div.m00-fb');
    ctl.appendChild(this.fbBox);
    this.renderFb();
    side.appendChild(ctl);

    if (this.mode === 'guided') {
      side.appendChild(h('div.side-k', '读数要点清单'));
      var ids = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'], curId = null;
      for (var i = 0; i < ids.length; i++) { if (!this.pDone[ids[i]]) { curId = ids[i]; break; } }
      var curEl = null;
      var ol = h('ol.steps', ids.map(function (id) {
        var p = PROC[id], ok = !!self.pDone[id], isCur = id === curId;
        var li = h('li' + (ok ? '.ok' : '') + (isCur ? '.cur' : ''),
          h('div.st-t', (ok ? '✓ ' : isCur ? '▸ ' : '') + p.title),
          h('div.st-how', { html: M.tex(p.how) + (p.why ? '<div class="st-why">理由：' + M.tex(p.why) + '</div>' : '') }),
          p.errorId ? h('button.link.sm', { type: 'button', onclick: function () { openTry(p.errorId); } }, '试一试 →') : null);
        if (isCur) curEl = li;
        return li;
      }));
      side.appendChild(ol);
      if (curEl) setTimeout(function () { if (ol.scrollHeight > ol.clientHeight + 4) ol.scrollTop = Math.max(0, curEl.offsetTop - ol.offsetTop - 4); }, 0);
    } else {
      side.appendChild(h('div.side-k', '自由模式错因标签'));
      if (this.freeTags.length) {
        side.appendChild(h('div.ana-tags', this.freeTags.map(function (id) {
          return h('button.tag.err', { type: 'button', onclick: function () { openTry(id); } }, '✕ ' + ERR[id].name + ' → 试一试');
        })));
      } else {
        side.appendChild(h('div.st-how', '可自由拖动仪器并判分；若读数触及典型易错点，这里会记下对应纠错标签。'));
      }
    }
  };

  /* =====================================================================
   *  ③ 诊·误差（四拍试一试 + 反推）
   * ===================================================================== */
  function cfgToState(cfg, forReverse) {
    var st = Object.assign({ type: cfg.type || 'caliper', locked: true, marks: null }, cfg);
    if (cfg.type === 'caliper' && cfg.bad && cfg.valMm === 10.35) st.marks = ['frameEdge'];
    if (cfg.type === 'micrometer' && cfg.trueMm === 7.415) st.marks = ['half'];
    if (!forReverse && cfg.type === 'stopwatch' && cfg.totalSec === 54.0) st.marks = ['half'];
    if (cfg.type === 'ruler' && cfg.startMm > 0) st.marks = ['nonzero'];
    return st;
  }
  function comparePair(err) {
    var c = err.config, bad = String(c.bad || '');
    if (c.type === 'caliper') {
      var dc = G.caliper.decompose(c.valMm, c.div);
      var diag = G.caliper.diagnose(bad, c.valMm, { div: c.div, unit: 'mm' });
      var goodMsg = err.id === 'E2'
        ? dc.mmStr + ' mm（主尺看游标 0 刻线左侧整毫米 ' + dc.mainMm + ' mm + ' + dc.k + '×' + dc.step + '）'
        : dc.mmStr + ' mm（' + dc.div + ' 分度不估读，保留 ' + dc.mmDecimals + ' 位小数）';
      return { good: goodMsg, bad: bad + ' mm（' + diag.msg + '）' };
    }
    if (c.type === 'micrometer') {
      var dm = G.micrometer.decompose(c.trueMm, c.zeroErrMm || 0);
      var diagM = G.micrometer.diagnose(bad, c.trueMm, { zeroErrMm: c.zeroErrMm || 0, unit: 'mm' });
      var goodM = c.zeroErrMm
        ? dm.trueStr + ' mm（示数 ' + dm.dispStr + ' − 零误差 ' + (c.zeroErrMm >= 0 ? '+' : '') + c.zeroErrMm.toFixed(3) + '）'
        : dm.trueStr + ' mm（固定 ' + dm.fixedMm.toFixed(1) + ' + 可动 ' + dm.thimble.toFixed(1) + '×0.01）';
      return { good: goodM, bad: bad + ' mm（' + diagM.msg + '）' };
    }
    if (c.type === 'dynamometer') {
      var dd = G.dynamometer.decompose(c.trueForceN, c.zeroOffsetN || 0);
      var diagD = G.dynamometer.diagnose(bad, c.trueForceN, { zeroOffsetN: c.zeroOffsetN || 0 });
      return { good: dd.trueStr + ' N（0.1 N 分度，对齐刻线补估读位 0）', bad: bad + ' N（' + diagD.msg + '）' };
    }
    if (c.type === 'stopwatch') {
      var ds = G.stopwatch.decompose(c.totalSec);
      var diagS = G.stopwatch.diagnose(bad, c.totalSec);
      return { good: ds.secStr + ' s（小盘过半分钟线，大盘读 ' + (ds.halfPassed ? '30+' + ds.handSec.toFixed(1) : ds.handSec.toFixed(1)) + ' s）', bad: bad + ' s（' + diagS.msg + '）' };
    }
    var dr = G.ruler.decompose(c.lengthMm, c.startMm || 0);
    var diagR = G.ruler.diagnose(bad, c.lengthMm, { startMm: c.startMm || 0, unit: 'cm' });
    return { good: dr.cmStr + ' cm（末端 ' + dr.endCmStr + ' − 起点 ' + (dr.startMm / 10).toFixed(2) + '）', bad: bad + ' cm（' + diagR.msg + '）' };
  }
  var adapter = {
    compare: function (err, area, done) {
      new GV.GaugeBench(area, { height: 226, state: cfgToState(err.config, false) });
      var pair = comparePair(err);
      area.appendChild(h('div.cmp-split',
        h('div.cmp-box.good', '✓ 规范读数', h('b', pair.good)),
        h('div.cmp-box.bad', '✕ 常见错读', h('b', pair.bad))));
      setTimeout(done, ML.perf.reduced ? 0 : 250);
    },
    show: function (c, vis) {
      new GV.GaugeBench(vis, { height: 224, state: cfgToState(c.show, true) });
    },
    restore: function () {
      S.mode = 'guided'; ML.store.save();
      if (!bench) return;
      bench.st.zeroErrMm = 0; bench.st.zeroOffsetN = 0; bench.st.startMm = 0;
      bench.st.marks = null; bench.st.hintAlign = false;
      bench.freeTags = []; bench.input = ''; bench.fb = null;
      bench.gauge.set(bench.st);
      bench.setMode('guided');
      bench.setBanner(null);
    },
    replay: function (errId) {
      var e = ERR[errId]; if (!e) return;
      shell.go('bench');
      bench.setMode('free', true);
      var c = e.config;
      bench.setInst(c.type, true);
      bench.st.hintAlign = false; bench.st.marks = null;
      bench.st.zeroErrMm = 0; bench.st.zeroOffsetN = 0; bench.st.startMm = 0;
      if (c.div) bench.st.div = c.div;
      if (c.valMm != null) bench.st.valMm = c.valMm;
      if (c.trueMm != null) bench.st.trueMm = c.trueMm;
      if (c.zeroErrMm != null) bench.st.zeroErrMm = c.zeroErrMm;
      if (c.lengthMm != null) bench.st.lengthMm = c.lengthMm;
      if (c.startMm != null) bench.st.startMm = c.startMm;
      if (c.trueForceN != null) bench.st.trueForceN = c.trueForceN;
      if (c.zeroOffsetN != null) bench.st.zeroOffsetN = c.zeroOffsetN;
      if (c.totalSec != null) bench.st.totalSec = c.totalSec;
      bench.st.unit = c.type === 'ruler' ? 'cm' : 'mm';
      bench.input = ''; bench.fb = null;
      bench.gauge.set(bench.st);
      bench.renderSide();
      bench.setBanner('<b>复现：' + e.name + '</b>　实验台已设为对应情景（' + M.tex(e.trigger) + '），请在右侧输入你的读数试试看。');
      shell.main.scrollTop = 0;
    }
  };
  function openTry(id) {
    var e = ERR[id];
    if (e) ML.TryIt(e, adapter, e.noteId && PROC[e.noteId] ? '<b>' + PROC[e.noteId].title + '：</b>' + PROC[e.noteId].how + (PROC[e.noteId].why ? ' 理由：' + PROC[e.noteId].why : '') : '');
  }

  /* =====================================================================
   *  ① 学·原理：交互小部件
   * ===================================================================== */
  function learnWidget(p, card) {
    if (!p.widget) return;
    var box = h('div.learn-widget'), cur = null;
    card.appendChild(box);
    var presets = [];
    if (p.widget === 'ruler-dyn-demo') {
      presets = [
        { label: '刻度尺 0 起点 (1.90 cm)', st: { type: 'ruler', lengthMm: 19.0, startMm: 0, locked: true } },
        { label: '非零起点 (2.45 cm)', st: { type: 'ruler', lengthMm: 24.5, startMm: 10.0, marks: ['nonzero'], locked: true } },
        { label: '弹簧测力计 (3.70 N)', st: { type: 'dynamometer', trueForceN: 3.70, zeroOffsetN: 0, locked: true } }
      ];
    } else if (p.widget === 'caliper-demo') {
      presets = [
        { label: '10 分度 (19.0 mm)', st: { type: 'caliper', div: 10, valMm: 19.0, hintAlign: true, locked: true } },
        { label: '20 分度 (10.35 mm)', st: { type: 'caliper', div: 20, valMm: 10.35, hintAlign: true, locked: true } },
        { label: '50 分度 (6.04 mm)', st: { type: 'caliper', div: 50, valMm: 6.04, hintAlign: true, locked: true } }
      ];
    } else if (p.widget === 'micrometer-demo') {
      presets = [
        { label: '露出半毫米 (6.860 mm)', st: { type: 'micrometer', trueMm: 6.860, zeroErrMm: 0, locked: true } },
        { label: '未露半毫米 (7.415 mm)', st: { type: 'micrometer', trueMm: 7.415, zeroErrMm: 0, marks: ['half'], locked: true } },
        { label: '零误差 +0.020 (真值 1.500)', st: { type: 'micrometer', trueMm: 1.500, zeroErrMm: 0.020, locked: true } }
      ];
    } else if (p.widget === 'stopwatch-demo') {
      presets = [
        { label: '未过半分钟 (24.0 s)', st: { type: 'stopwatch', totalSec: 24.0, locked: true } },
        { label: '已过半分钟 (54.0 s)', st: { type: 'stopwatch', totalSec: 54.0, marks: ['half'], locked: true } },
        { label: '超过 1 分钟 (78.4 s)', st: { type: 'stopwatch', totalSec: 78.4, locked: true } }
      ];
    }
    if (!presets.length) return;
    var sw = h('div.side-row');
    box.appendChild(sw);
    var gb = new GV.GaugeBench(box, { height: 226, state: presets[0].st });
    presets.forEach(function (pr, idx) {
      var b = h('button.chip' + (idx === 0 ? '.on' : ''), { type: 'button', onclick: function () {
        ML.$$('.chip', sw).forEach(function (c) { c.classList.remove('on'); });
        b.classList.add('on');
        cur = Object.assign({ marks: null, hintAlign: false }, pr.st);
        gb.set(cur);
      } }, pr.label);
      sw.appendChild(b);
    });
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
        var wrap = h('div.diag'); el.appendChild(wrap);
        wrap.appendChild(h('h2.diag-h', 'A. 常见错因实验室'));
        wrap.appendChild(h('p.muted', '每个“试一试”按四拍进行：观察位置 → 对比正误写法 → 追问与揭示。'));
        var grid = h('div.err-grid'), cardMap = {};
        C.errors.forEach(function (e) {
          var note = PROC[e.noteId];
          var card = h('div.err-card' + ((S.done || {})[e.id] ? '.done' : ''),
            h('div.err-name', ((S.done || {})[e.id] ? '✓ ' : '') + e.name),
            note ? h('div.err-note', { html: '<b>规范：</b>' + M.tex(note.how) + (note.why ? '<div class="st-why">理由：' + M.tex(note.why) + '</div>' : '') }) : null,
            h('button.btn.primary.sm', { type: 'button', onclick: function () { openTry(e.id); } }, '试一试'));
          cardMap[e.id] = card; grid.appendChild(card);
        });
        ML.bus.on('try:done', function (id) {
          var card = cardMap[id]; if (!card || card.classList.contains('done')) return;
          card.classList.add('done');
          var nm = ML.$('.err-name', card); if (nm && nm.textContent.indexOf('✓ ') !== 0) nm.textContent = '✓ ' + nm.textContent;
        });
        wrap.appendChild(grid);
        wrap.appendChild(h('h2.diag-h', 'B. 结果反推'));
        wrap.appendChild(h('p.muted', '看一个读错了的答案，判断原因后去实验台再读一次。'));
        var rev = h('div.rev'); wrap.appendChild(rev);
        ML.Reverse(rev, C.reverse, adapter);
      } },
      { id: 'paper', label: '练·真题', mount: function (el) { new ML.Paper(el, Q, { title: C.title + ' · 真题训练', onReplay: adapter.replay }); } }
    ]
  });
  shell.go(S.tab);
  ML.perf.probe();
  ML.m00 = { bench: function () { return bench; }, adapter: adapter, shell: shell };
})(window.ML);
