/* ML.stage — 分层画布、按需渲染循环、指针拖拽、放大镜。 */
(function (ML) {
  'use strict';
  var h = ML.h, live = [], mags = [];
  if (ML.bus && ML.bus.on) ML.bus.on('tab', function () { mags.forEach(function (m) { m.hide(); }); });

  /** Stage：在 container 内叠放多层 canvas。layers: ['bg','fg'] → stage.layer('bg') */
  function Stage(container, opts) {
    opts = opts || {};
    var self = this;
    this.el = h('div.ml-stage');
    container.appendChild(this.el);
    this.layers = {}; this.order = opts.layers || ['bg', 'fg'];
    this.w = 0; this.h = 0; this.dpr = 1; this._connected = !!this.el.isConnected;
    this.drawers = {};
    this.order.forEach(function (name) {
      var c = h('canvas.ml-layer', { 'aria-hidden': 'true' });
      self.el.appendChild(c);
      self.layers[name] = { canvas: c, ctx: c.getContext('2d'), dirty: true };
    });
    this.resize = function () {
      if (!self.el.isConnected) return;
      self._connected = true;
      var r = self.el.getBoundingClientRect(), dpr = ML.perf.dpr();
      var w = Math.max(1, Math.round(r.width)), hh = Math.max(1, Math.round(r.height));
      if (w === self.w && hh === self.h && dpr === self.dpr) return;
      self.w = w; self.h = hh; self.dpr = dpr;
      self.order.forEach(function (n) {
        var L = self.layers[n]; L.canvas.width = Math.round(w * dpr); L.canvas.height = Math.round(hh * dpr);
        L.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); L.dirty = true;
      });
      if (opts.onResize) opts.onResize(w, hh);
      self.render();
    };
    if (window.ResizeObserver) { this.ro = new ResizeObserver(function () { self.resize(); }); this.ro.observe(this.el); }
    else window.addEventListener('resize', this.resize);
    this.offPerf = ML.bus.on('perf', function () { self.w = 0; self.resize(); });
    // 回收已离开文档的画布（试一试弹窗等），避免 4GB 平板上内存持续增长；尚未挂载的同批画布不误杀
    live = live.filter(function (s) {
      if (!s._connected || s.el.isConnected) return true;
      if (s.ro) s.ro.disconnect(); else window.removeEventListener('resize', s.resize);
      s.offPerf(); s.order.forEach(function (n) { s.layers[n].canvas.width = s.layers[n].canvas.height = 0; });
      return false;
    });
    mags = mags.filter(function (m) {
      if (!m._connected || (m.host && m.host.isConnected)) return true;
      if (m.c && m.c.parentNode) m.c.parentNode.removeChild(m.c);
      return false;
    });
    live.push(this);
    setTimeout(this.resize, 0);
  }
  Stage.prototype.layer = function (n) { return this.layers[n]; };
  /** 注册某层的绘制函数 draw(ctx, w, h) */
  Stage.prototype.on = function (n, draw) { this.drawers[n] = draw; this.layers[n].dirty = true; return this; };
  Stage.prototype.invalidate = function (n) {
    var self = this;
    (n ? [n] : this.order).forEach(function (k) { self.layers[k].dirty = true; });
    if (!this._raf) this._raf = requestAnimationFrame(function () { self._raf = 0; self.render(); });
  };
  Stage.prototype.render = function () {
    var self = this;
    if (!this.w) return;
    this.order.forEach(function (n) {
      var L = self.layers[n];
      if (!L.dirty || !self.drawers[n]) return;
      L.ctx.clearRect(0, 0, self.w, self.h);
      self.drawers[n](L.ctx, self.w, self.h);
      L.dirty = false;
    });
  };

  /** Loop：按需 rAF。step(dt, t) 返回 false 时自动停止，空闲 CPU≈0 */
  function Loop(step) { this.step = step; this.running = false; this.last = null; this.frame = 0; }
  Loop.prototype.start = function () {
    if (this.running) return;
    var self = this;
    this.running = true;
    this.last = null;
    function frame(t) {
      self.frame = 0;
      var dt = self.last === null ? 0 : Math.min(0.05, (t - self.last) / 1000);
      self.last = t;
      if (self.step(dt, t) === false) self.running = false;
      if (self.running && !self.frame) self.frame = requestAnimationFrame(frame);
    }
    this.frame = requestAnimationFrame(frame);
  };
  Loop.prototype.stop = function () {
    this.running = false;
    this.resumeOnShow = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  };
  Loop.prototype.setVisible = function (visible) {
    if (!visible && this.running) {
      this.stop();
      this.resumeOnShow = true;
    } else if (visible && this.resumeOnShow) {
      this.resumeOnShow = false;
      this.start();
    }
  };

  /** 指针：在元素上统一处理 tap / drag / press。handlers: {down(p,e)→bool 是否接管, move(p), up(p, moved), press(p) 长按} */
  function pointer(el, hd) {
    var active = null;
    function pos(e) { var r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX, cy: e.clientY }; }
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', function (e) {
      if (active !== null) return;
      var p = pos(e);
      if (hd.down && hd.down(p, e) === false) return;
      active = e.pointerId; try { el.setPointerCapture && el.setPointerCapture(e.pointerId); } catch (err) {}
      active = { id: e.pointerId, x0: p.x, y0: p.y, moved: false, pressT: setTimeout(function () { if (active && !active.moved && hd.press) { active.pressed = true; hd.press(p); } }, 260) };
      e.preventDefault();
    });
    el.addEventListener('pointermove', function (e) {
      if (!active || e.pointerId !== active.id) { if (hd.hover) hd.hover(pos(e)); return; }
      var p = pos(e);
      if (!active.moved && Math.abs(p.x - active.x0) + Math.abs(p.y - active.y0) > 6) { active.moved = true; clearTimeout(active.pressT); }
      if (hd.move) hd.move(p, active);
    });
    function up(e) {
      if (!active || e.pointerId !== active.id) return;
      var a = active; active = null; clearTimeout(a.pressT);
      if (hd.up) hd.up(pos(e), a);
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  /** 放大镜：从若干 canvas 取区域放大，显示在手指上方 80px */
  function Magnifier(host, opts) {
    opts = opts || {};
    this.host = host;
    this._connected = !!(host && host.isConnected);
    this.zoom = opts.zoom || 3; this.size = opts.size || 150;
    this.c = h('canvas.ml-mag', { 'aria-hidden': 'true' });
    this.c.style.width = this.c.style.height = this.size + 'px';
    document.body.appendChild(this.c);
    this.ctx = this.c.getContext('2d');
    mags.push(this);
  }
  /** sources: canvas 数组；x,y 为 CSS 坐标（相对 host）；dpr 源画布像素比 */
  Magnifier.prototype.show = function (sources, x, y, dpr, label) {
    if (this.host && this.host.isConnected) this._connected = true;
    var s = this.size, z = this.zoom, d = ML.perf.dpr(), c = this.c, ctx = this.ctx;
    if (c.width !== Math.round(s * d)) { c.width = c.height = Math.round(s * d); }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, s, s);
    var src = s / z;
    sources.forEach(function (cv) {
      if (!cv || !cv.width || !cv.height) return;
      ctx.drawImage(cv, (x - src / 2) * dpr, (y - src / 2) * dpr, src * dpr, src * dpr, 0, 0, s, s);
    });
    ctx.strokeStyle = 'rgba(22,97,255,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.stroke();
    if (label) { ctx.fillStyle = 'rgba(16,35,63,.82)'; ctx.fillRect(0, s - 24, s, 24); ctx.fillStyle = '#fff'; ctx.font = '600 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, s / 2, s - 7); }
    var r = this.host && this.host.getBoundingClientRect ? this.host.getBoundingClientRect() : { left: 0, top: 0 };
    var vx = r.left + x, vy = r.top + y;
    var top = vy - s - 80; if (top < 6) top = vy + 60;
    top = Math.max(6, Math.min((window.innerHeight || 600) - s - 6, top));
    var left = Math.max(6, Math.min((window.innerWidth || 1016) - s - 6, vx - s / 2));
    c.style.left = Math.round(left) + 'px'; c.style.top = Math.round(top) + 'px'; c.style.display = 'block';
  };
  Magnifier.prototype.hide = function () { this.c.style.display = 'none'; };

  /* 绘图小工具 */
  var draw = {
    rr: function (ctx, x, y, w, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); },
    grad: function (ctx, x0, y0, x1, y1, stops) { var g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(function (s, i) { g.addColorStop(i / (stops.length - 1), s); }); return g; },
    text: function (ctx, s, x, y, o) { o = o || {}; ctx.font = (o.weight || 500) + ' ' + (o.size || 13) + 'px "PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif'; ctx.fillStyle = o.color || '#10233F'; ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic'; if (o.maxW) ctx.fillText(s, x, y, o.maxW); else ctx.fillText(s, x, y); },
    ring: function (ctx, x, y, r, color) { ctx.save(); ctx.strokeStyle = color || '#C7374B'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  };

  ML.stage = { Stage: Stage, Loop: Loop, pointer: pointer, Magnifier: Magnifier, draw: draw };
})(window.ML = window.ML || {});
