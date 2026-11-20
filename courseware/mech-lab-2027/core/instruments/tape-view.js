/* ML.tapeView — 纸带与毫米刻度尺绘制；TapeStrip 可平移、点选、按住放大镜的纸带组件。 */
(function (ML) {
  'use strict';
  var h = ML.h, D = ML.stage.draw;
  var PAPER = '#F6F1E3', EDGE = '#CDBF98', INK = '#2B2B2B';

  /** o: {x0 纸带左端像素, y, w 可视宽, hh 纸带高, scale px/m, offset 左端对应的 m, dots, timer, count[], labels[], marks[{from,to,color,text}], blank} */
  function drawTape(ctx, o) {
    var y = o.y, hh = o.hh || 34, W = o.w, L = o.x0;
    ctx.fillStyle = PAPER; ctx.fillRect(L, y, W, hh);
    ctx.strokeStyle = EDGE; ctx.lineWidth = 1; ctx.strokeRect(L + 0.5, y + 0.5, W - 1, hh - 1);
    function X(s) { return L + 16 + (s - o.offset) * o.scale; }
    var r = o.timer === 'spark' ? 1.25 : 1.7;
    ctx.fillStyle = INK; ctx.globalAlpha = o.timer === 'spark' ? 0.8 : 0.6;
    var cy = y + hh / 2;
    (o.dots || []).forEach(function (s) { var x = X(s); if (x < L - 4 || x > L + W + 4) return; ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
    if (o.count) o.count.forEach(function (i, k) {
      var x = X(o.dots[i]); if (x < L - 20 || x > L + W + 20) return;
      ctx.strokeStyle = '#1661FF'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y + 3); ctx.lineTo(x, y + 10); ctx.moveTo(x, y + hh - 10); ctx.lineTo(x, y + hh - 3); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, cy, 5, 0, Math.PI * 2); ctx.stroke();
      D.text(ctx, (o.labels && o.labels[k]) || String(k), x, y - 5, { align: 'center', size: 12, weight: 700, color: '#1661FF' });
    });
    if (o.marks) o.marks.forEach(function (m) {
      var a = X(m.from), b = X(m.to), cx = (a + b) / 2, rx = Math.max(14, (b - a) / 2 + 8);
      ctx.save(); ctx.strokeStyle = m.color || '#C7374B'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, hh * 0.85, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      if (m.text) { ctx.font = '700 12px sans-serif'; var tw = ctx.measureText(m.text).width / 2 + 4; D.text(ctx, m.text, Math.max(L + tw, Math.min(L + W - tw, cx)), y + hh + 16, { align: 'center', size: 12, weight: 700, color: m.color || '#C7374B' }); }
    });
    if (o.blank) D.text(ctx, o.blank, L + W / 2, cy + 4, { align: 'center', size: 13, color: '#8A7F63' });
    return X;
  }
  /** 毫米刻度尺：zeroX 为 0 刻度像素，scale px/m */
  function drawRuler(ctx, x0, y, w, zeroX, scale, low) {
    ctx.fillStyle = '#FBFCFE'; ctx.fillRect(x0, y, w, 30);
    ctx.strokeStyle = '#9AA8B8'; ctx.strokeRect(x0 + 0.5, y + 0.5, w - 1, 29);
    var mmPx = scale / 1000, first = Math.ceil((x0 - zeroX) / mmPx), last = Math.floor((x0 + w - zeroX) / mmPx);
    if (mmPx < 2.2) { first = Math.ceil(first / 10) * 10; }
    ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (var k = Math.max(first, 0); k <= last; k++) {
      if (mmPx < 2.2 && k % 5) continue;
      var x = Math.round(zeroX + k * mmPx) + 0.5, len = k % 10 === 0 ? 13 : k % 5 === 0 ? 9 : 6;
      ctx.moveTo(x, y); ctx.lineTo(x, y + len);
    }
    ctx.stroke();
    for (k = Math.max(Math.ceil(first / 10) * 10, 0); k <= last; k += 10) D.text(ctx, String(k / 10), zeroX + k * mmPx, y + 25, { align: 'center', size: 11, color: '#10233F' });
    D.text(ctx, 'cm', x0 + w - 6, y + 25, { align: 'right', size: 10, color: '#4A5B73' });
  }

  /**
   * TapeStrip：opts {height, onTap(i), magLabel(i)→string}
   * set({dots, timer, count, labels, origin(下标, 尺的 0 刻度), ruler(bool), marks})
   */
  function TapeStrip(container, opts) {
    var self = this; opts = opts || {};
    this.opts = opts; this.d = { dots: [] }; this.scale = 4000; this.offset = 0;
    this.el = h('div.tape-strip'); this.el.style.height = (opts.height || 120) + 'px';
    container.appendChild(this.el);
    this.stage = new ML.stage.Stage(this.el, { layers: ['t'], onResize: function () { self.clampOffset(); } });
    this.stage.on('t', function (ctx, w, hh) { self.draw(ctx, w, hh); });
    this.mag = new ML.stage.Magnifier(this.el, { zoom: 3, size: 150 });
    var startOff = 0;
    ML.stage.pointer(this.stage.el, {
      down: function () { startOff = self.offset; },
      move: function (p, a) {
        if (a.pressed) { self.showMag(p); return; }
        self.offset = startOff - (p.x - a.x0) / self.scale; self.clampOffset(); self.stage.invalidate();
      },
      press: function (p) { self.showMag(p); },
      up: function (p, a) {
        self.mag.hide();
        if (a.moved || a.pressed) return;
        var i = self.hit(p.x); if (i >= 0 && opts.onTap) opts.onTap(i);
      }
    });
  }
  TapeStrip.prototype.set = function (d) { for (var k in d) this.d[k] = d[k]; this.stage.invalidate(); return this; };
  TapeStrip.prototype.X = function (s) { return 16 + (s - this.offset) * this.scale; };
  TapeStrip.prototype.clampOffset = function () {
    var dots = this.d.dots, w = this.stage.w || 600;
    var maxS = dots.length ? dots[dots.length - 1] + 0.01 : 0.1, maxOff = Math.max(-0.002, maxS - (w - 32) / this.scale);
    this.offset = Math.max(-0.004, Math.min(maxOff, this.offset));
  };
  TapeStrip.prototype.fit = function () {
    var dots = this.d.dots, w = this.stage.w || 600; if (!dots.length) return;
    this.scale = (w - 40) / Math.max(0.05, dots[dots.length - 1] - dots[0] + 0.004); this.offset = dots[0] - 0.002; this.stage.invalidate();
  };
  TapeStrip.prototype.zoomTo = function (scale, sCenter) {
    var w = this.stage.w || 600; this.scale = scale;
    this.offset = (sCenter == null ? this.offset : sCenter - (w / 2 - 16) / scale); this.clampOffset(); this.stage.invalidate();
  };
  TapeStrip.prototype.hit = function (x) {
    var best = -1, bd = 12, self = this;
    this.d.dots.forEach(function (s, i) { var dx = Math.abs(self.X(s) - x); if (dx < bd - 1e-6 || (Math.abs(dx - bd) < 1e-6 && best >= 0)) { bd = dx; best = i; } });
    return best;
  };
  TapeStrip.prototype.showMag = function (p) {
    var label = this.opts.magLabel ? this.opts.magLabel(p.x, this) : '';
    this.mag.show([this.stage.layer('t').canvas], p.x, p.y, this.stage.dpr, label);
  };
  TapeStrip.prototype.draw = function (ctx, w, hh) {
    var d = this.d, ty = 22, self = this;
    drawTape(ctx, { x0: 0, y: ty, w: w, hh: 36, scale: this.scale, offset: this.offset, dots: d.dots, timer: d.timer, count: d.count, labels: d.labels, marks: d.marks, blank: d.dots.length ? '' : (d.blankText || '（纸带上没有点）') });
    if (d.ruler && d.count && d.count.length) {
      var zero = this.X(d.dots[d.count[0]]);
      drawRuler(ctx, 0, ty + 40, w, zero, this.scale);
      // 0 刻度与计数点对齐线
      ctx.strokeStyle = 'rgba(22,97,255,.35)'; ctx.setLineDash([3, 3]);
      d.count.forEach(function (i) { var x = self.X(d.dots[i]); ctx.beginPath(); ctx.moveTo(x, ty + 36); ctx.lineTo(x, ty + 46); ctx.stroke(); });
      ctx.setLineDash([]);
    }
  };

  ML.tapeView = { drawTape: drawTape, drawRuler: drawRuler, TapeStrip: TapeStrip, PAPER: PAPER };
})(window.ML = window.ML || {});
