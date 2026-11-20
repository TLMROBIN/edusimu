/* ML.Shell — 四区一卡外壳；ML.Learn 分步讲解；ML.TryIt 四拍“试一试”；ML.Reverse 结果反推。 */
(function (ML) {
  'use strict';
  var h = ML.h, M = ML.math;

  function Shell(cfg) {
    var self = this; this.cfg = cfg; this.panels = {}; this.mounted = {};
    var tabsEl = h('nav.ml-tabs', { role: 'tablist' });
    this.tabBtns = {};
    cfg.tabs.forEach(function (t, i) {
      var b = h('button.ml-tab', { type: 'button', role: 'tab', 'aria-selected': 'false', onclick: function () { self.go(t.id); } },
        h('span.ml-tab-no', ['①', '②', '③', '④'][i]), h('span', t.label));
      self.tabBtns[t.id] = b; tabsEl.appendChild(b);
    });
    var perfBtn = h('button.ml-icon', { type: 'button', title: '流畅模式（降低画质，适合较慢平板）', onclick: function () { ML.perf.set(!ML.perf.low); perfBtn.classList.toggle('on', ML.perf.low); ML.toast(ML.perf.low ? '已开启流畅模式' : '已关闭流畅模式'); } }, '流畅');
    ML.bus.on('perf', function (low) { perfBtn.classList.toggle('on', low); });
    var head = h('header.ml-head',
      h('div.ml-brand', h('div.ml-title', cfg.title), h('div.ml-sub', cfg.sub || '')),
      tabsEl,
      h('div.ml-tools', perfBtn, h('button.btn.ml-sumbtn', { type: 'button', onclick: function () { self.summary(true); } }, '小结卡')));
    this.main = h('main.ml-main');
    cfg.tabs.forEach(function (t) { var p = h('section.ml-panel', { role: 'tabpanel', 'aria-label': t.label, hidden: true }); self.panels[t.id] = p; self.main.appendChild(p); });
    this.sumEl = this._buildSummary(cfg.summary);
    document.body.appendChild(h('div.ml-app', head, this.main));
    document.body.appendChild(this.sumEl);
  }
  Shell.prototype.go = function (id) {
    var self = this, t = null;
    this.cfg.tabs.forEach(function (x) { if (x.id === id) t = x; });
    if (!t) t = this.cfg.tabs[0];
    this.cfg.tabs.forEach(function (x) { var on = x.id === t.id; self.panels[x.id].hidden = !on; self.tabBtns[x.id].setAttribute('aria-selected', on ? 'true' : 'false'); self.tabBtns[x.id].classList.toggle('on', on); });
    if (!this.mounted[t.id]) { this.mounted[t.id] = true; t.mount(this.panels[t.id]); }
    ML.store.set({ tab: t.id });
    ML.bus.emit('tab', t.id);
    this.main.scrollTop = 0;
    if (t.id === 'bench') this.fitBench(this.panels[t.id]);
  };
  Shell.prototype.fitBench = function (panel) {
    if (this.benchFit || !window.ResizeObserver) return;
    var main = this.main, row = panel.querySelector('.bench-row');
    if (!row) return;
    function resize() {
      if (panel.hidden) return;
      var offset = row.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
      row.style.setProperty('--bench-room', Math.max(220, main.clientHeight - offset - 6) + 'px');
    }
    this.benchFit = new ResizeObserver(resize);
    this.benchFit.observe(main);
    panel.querySelectorAll('.bench-top,.bench-banner').forEach(function (el) { this.benchFit.observe(el); }, this);
    resize();
  };
  Shell.prototype._buildSummary = function (s) {
    var self = this;
    var card = h('div.ml-sum', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '小结卡', hidden: true },
      h('div.ml-sum-card',
        h('div.ml-sum-head', h('h2', '小结卡'), h('button.btn', { type: 'button', onclick: function () { self.summary(false); } }, '关闭')),
        h('div.ml-sum-grid',
          h('div.sum-box.c1', h('h3', '原理'), h('div', { html: M.tex(s.principle) })),
          h('div.sum-box.c2', h('h3', '步骤'), h('ol', s.steps.map(function (x) { return h('li', { html: M.tex(x) }); }))),
          h('div.sum-box.c3', h('h3', '注意事项 → 理由'), h('ul.sum-notes', s.notes.map(function (n) { return h('li', h('b', { html: M.tex(n['do']) }), h('span', { html: '→ ' + M.tex(n.why) })); }))),
          h('div.sum-box.c4', h('h3', '误差'), h('ul', s.errors.map(function (x) { return h('li', { html: M.tex(x) }); }))),
          h('div.sum-box.c5', h('h3', '常考结论'), h('ul', s.conclusions.map(function (x) { return h('li', { html: M.tex(x) }); }))))));
    card.addEventListener('click', function (e) { if (e.target === card) self.summary(false); });
    return card;
  };
  Shell.prototype.summary = function (on) {
    var self = this;
    this.sumEl.hidden = !on;
    if (this._escSum) { document.removeEventListener('keydown', this._escSum); this._escSum = null; }
    if (on) {
      this._escSum = function (e) { if (e.key === 'Escape') self.summary(false); };
      document.addEventListener('keydown', this._escSum);
    }
  };

  /* ---------- 学·原理：分步揭示 ---------- */
  function Learn(el, pages, equipment, opts) {
    opts = opts || {};
    var idx = Math.max(0, Math.min(ML.store.data.learnPage || 0, pages.length - 1)), shown = 0;
    var nav = h('div.learn-nav'), card = h('article.learn-card'), eqWrap = h('div.learn-eq');
    var methods = opts.methods || ((ML.json('ml-content') || {}).methods) || [];
    var refs = h('div.learn-refs', { hidden: true },
      methods.length ? h('div.learn-methods', h('span.method-title', '方法标签'),
        h('div.method-list', methods.map(function (m) { return h('span.method-pill', { html: M.tex(m) }); }))) : null, eqWrap);
    el.appendChild(h('div.learn', nav, h('div.learn-main', card)));
    var navBtns = pages.map(function (p, i) {
      var b = h('button.learn-dot', { type: 'button', title: p.title, onclick: function () { go(i); } }, h('span', String(i + 1)), h('em', p.title));
      nav.appendChild(b);
      return b;
    });
    if (equipment && equipment.length) {
      var eqCard = h('div.eq-card', { hidden: true });
      eqWrap.appendChild(h('div.eq-title', '器材认识'));
      eqWrap.appendChild(h('div.eq-list', equipment.map(function (q) {
        return h('button.eq-chip', { type: 'button', onclick: function () {
          eqCard.hidden = false;
          eqCard.innerHTML = '<b>' + ML.esc(q.name) + '</b>' + M.tex(q.html);
        } }, q.name);
      })));
      eqWrap.appendChild(eqCard);
    }
    var caption = h('div.learn-k'), title = h('h2');
    var intro = h('div.learn-body'), stepBox = h('div.learn-steps'), widgetBox = h('div.learn-widgets');
    var viewport = h('div.learn-viewport', intro, stepBox, widgetBox, refs), bar = h('div.learn-bar');
    card.append(caption, title, viewport, bar);
    var references = false;
    function go(i) {
      idx = i;
      shown = 0;
      references = false;
      ML.store.set({ learnPage: idx });
      renderPage();
    }
    function renderStep() {
      var steps = pages[idx].steps || [];
      var hasWidget = widgetBox.childElementCount > 0;
      var last = steps.length + (hasWidget ? 1 : 0);
      var widgetVisible = !references && hasWidget && shown === last;
      caption.textContent = '第 ' + (idx + 1) + ' / ' + pages.length + ' 页' +
        (references ? ' · 方法与器材' : last ? ' · ' + (shown === 0 ? '概览' : widgetVisible ? '互动演示' : '步骤 ' + shown + ' / ' + steps.length) : '');
      intro.hidden = references || shown !== 0;
      widgetBox.hidden = !widgetVisible;
      refs.hidden = !references;
      ML.clear(stepBox);
      if (!references && shown > 0 && shown <= steps.length) {
        stepBox.appendChild(h('div.learn-step', { html: M.tex(steps[shown - 1]) }));
      }
      viewport.scrollTop = 0;
      ML.clear(bar);
      if (methods.length || (equipment && equipment.length)) {
        bar.appendChild(h('button.btn.learn-ref-btn', { type: 'button', onclick: function () {
          references = !references;
          renderStep();
        } }, references ? '返回讲解' : '方法与器材'));
      }
      if (references) return;
      bar.appendChild(h('button.btn', { type: 'button', disabled: idx === 0 && shown === 0, onclick: function () {
        if (shown > 0) { shown--; renderStep(); } else go(idx - 1);
      } }, '上一步'));
      if (shown < last) {
        bar.appendChild(h('button.btn.primary', { type: 'button', onclick: function () { shown++; renderStep(); } },
          shown === steps.length && hasWidget ? '互动演示' : '下一步（' + shown + '/' + steps.length + '）'));
      } else if (idx < pages.length - 1) {
        bar.appendChild(h('button.btn.primary', { type: 'button', onclick: function () { go(idx + 1); } }, '下一页'));
      } else if (opts.onFinish) {
        bar.appendChild(h('button.btn.primary', { type: 'button', onclick: opts.onFinish }, '去做实验 →'));
      }
    }
    function renderPage() {
      var p = pages[idx];
      navBtns.forEach(function (b, i) { b.classList.toggle('on', i === idx); });
      title.textContent = p.title;
      intro.innerHTML = M.tex(p.html);
      ML.clear(widgetBox);
      if (opts.onPage) opts.onPage(p, widgetBox);
      renderStep();
    }
    renderPage();
  }

  /* ---------- 四拍“试一试” ---------- */
  var tryEl = null, activeTryClose = null;
  /** adapter: { compare(err, area) 运行并渲染对比（可异步，完成时调用 done），restore(), replay(errId) } */
  function TryIt(err, adapter, note) {
    if (activeTryClose) activeTryClose();
    if (tryEl) { tryEl.remove(); tryEl = null; }
    var beats = ['布置', '运行', '对比', '追问 → 揭示'], bi = 0, cleanup = null, closed = false;
    var beatEl = h('ol.try-beats', beats.map(function (b) { return h('li', b); }));
    var area = h('div.try-area'), qa = h('div.try-qa'), msg = h('div.try-msg');
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    var close = function () {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      if (activeTryClose === close) activeTryClose = null;
      if (typeof cleanup === 'function') { try { cleanup(); } catch (e) {} cleanup = null; }
      if (tryEl) { tryEl.remove(); tryEl = null; }
    };
    activeTryClose = close;
    document.addEventListener('keydown', onKey);
    tryEl = h('div.ml-modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '试一试：' + err.name },
      h('div.ml-modal-card.try',
        h('div.try-head', h('div', h('div.try-k', '试一试'), h('h2', err.name)), h('button.btn', { type: 'button', onclick: close }, '关闭')),
        beatEl, msg, area, qa));
    document.body.appendChild(tryEl);
    function setBeat(i) { bi = i; ML.$$('li', beatEl).forEach(function (li, k) { li.classList.toggle('on', k === i); li.classList.toggle('done', k < i); }); }
    setBeat(0);
    msg.innerHTML = '<b>观察：</b>' + M.tex(err.observe);
    if (err.trigger) msg.innerHTML += '<div class="try-trigger">实验台已设置为：' + M.tex(err.trigger) + '</div>';
    var runBtn = h('button.btn.primary.big', { type: 'button' }, '运行');
    area.appendChild(h('div.try-ready', runBtn));
    runBtn.onclick = function () {
      setBeat(1); ML.clear(area);
      cleanup = adapter.compare(err, area, function () {
        if (closed || !tryEl || !area.isConnected) return;
        setBeat(2);
        setTimeout(function () { if (!closed && tryEl && area.isConnected) ask(); }, ML.perf.reduced ? 0 : 350);
      });
    };
    function ask() {
      setBeat(3);
      var a = err.ask, chosen = null;
      qa.appendChild(h('div.try-q', { html: M.tex(a.stem) }));
      var opts = h('div.pp-opts');
      a.options.forEach(function (o, i) {
        opts.appendChild(h('button.opt', { type: 'button', html: '<b>' + String.fromCharCode(65 + i) + '. </b>' + M.tex(o), onclick: function () {
          if (chosen !== null) return; chosen = i;
          ML.$$('.opt', opts).forEach(function (b, k) { b.classList.toggle('right', k === a.answer); b.classList.toggle('wrong', k === i && i !== a.answer); });
          ML.quiz.submit(a.quizId, i, i === a.answer, a);
          reveal(i === a.answer);
        } }));
      });
      qa.appendChild(opts);
    }
    function reveal(ok) {
      var d = ML.store.data.done || {}; d[err.id] = true; ML.store.set({ done: d });
      ML.bus.emit('try:done', err.id);
      qa.appendChild(h('div.try-reveal' + (ok ? '.ok' : ''),
        h('div', h('b', ok ? '✓ 判断正确。' : '再想想——答案见上方绿色选项。')),
        h('p', h('b', '后果：'), h('span', { html: M.tex(err.consequence) })),
        h('p', h('b', '为什么：'), h('span', { html: M.tex(err.why) })),
        note ? h('p.try-note', h('b', '对应注意事项：'), h('span', { html: M.tex(note) })) : null,
        h('div.try-actions',
          h('button.btn.primary', { type: 'button', onclick: function () { close(); adapter.restore(); ML.toast('已恢复正确操作', 'ok'); } }, '恢复正确操作'),
          adapter.replay ? h('button.btn', { type: 'button', onclick: function () { close(); adapter.replay(err.id); } }, '去实验台亲手做一次') : null)));
      qa.lastChild.scrollIntoView({ block: 'nearest' });
    }
  }

  /* ---------- 结果反推 ---------- */
  function Reverse(el, cases, adapter) {
    cases.forEach(function (c, ci) {
      var vis = h('div.rev-vis'), opts = h('div.pp-opts'), out = h('div.rev-out'), sel = [];
      var card = h('section.rev-card', h('div.rev-k', '反推 ' + (ci + 1)), h('div.rev-stem', { html: M.tex(c.stem) }), vis, opts, out);
      el.appendChild(card);
      adapter.show(c, vis);
      var multi = Array.isArray(c.answer) && c.answer.length > 1, btns = [];
      c.options.forEach(function (o, i) {
        var b = h('button.opt', { type: 'button', html: '<b>' + String.fromCharCode(65 + i) + '. </b>' + M.tex(o), onclick: function () {
          if (card.classList.contains('done')) return;
          var k = sel.indexOf(i); if (k >= 0) sel.splice(k, 1); else { if (!multi) sel = []; sel.push(i); }
          btns.forEach(function (bb, j) { bb.classList.toggle('on', sel.indexOf(j) >= 0); });
        } });
        btns.push(b); opts.appendChild(b);
      });
      var submit = h('button.btn.primary', { type: 'button', onclick: function () {
        if (!sel.length) { ML.toast('先选一个原因', 'warn'); return; }
        if (card.classList.contains('done')) return;
        card.classList.add('done');
        var ans = [].concat(c.answer), ok = ans.slice().sort().join() === sel.slice().sort().join();
        ML.quiz.submit(c.quizId, sel, ok, c);
        btns.forEach(function (b, j) { b.classList.toggle('right', ans.indexOf(j) >= 0); b.classList.toggle('wrong', sel.indexOf(j) >= 0 && ans.indexOf(j) < 0); });
        ML.clear(out);
        out.appendChild(h('div.try-reveal' + (ok ? '.ok' : ''), h('b', ok ? '✓ 正确。' : '答案见绿色选项。'), h('p', { html: M.tex(c.why) }),
          h('div.try-actions',
            c.replay ? h('button.btn.primary', { type: 'button', onclick: function () { adapter.replay(c.replay); } }, '去实验台复现') : null,
            h('button.btn', { type: 'button', onclick: function () { card.classList.remove('done'); sel = []; btns.forEach(function (b) { b.classList.remove('on', 'right', 'wrong'); }); ML.clear(out); } }, '重做'))));
      } }, '提交');
      card.appendChild(h('div.pq-actions', submit));
    });
  }

  ML.Shell = Shell; ML.Learn = Learn; ML.TryIt = TryIt; ML.Reverse = Reverse;
})(window.ML = window.ML || {});
