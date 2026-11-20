/* ML.Chart — 轻量坐标图：描点、拟合线、叠图、条形（剪纸带）、交互描点作图。 */
(function (ML) {
  'use strict';
  var h = ML.h, D = ML.stage.draw;
  function niceStep(span, n) {
    var raw = span / (n || 5), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  function decimals(step) { return Math.max(0, -Math.floor(Math.log10(step) + 1e-9)); }

  /**
   * opts: { xLabel, yLabel, x:[min,max]?, y:[min,max]?, height, paper(bool 坐标纸风格),
   *         edit: { snap:[dx,dy], line:bool, onChange(state) } }
   */
  function Chart(container, opts) {
    var self = this; opts = opts || {};
    this.opts = opts; this.series = []; this.notes = [];
    this.el = h('div.ml-chart' + (opts.paper ? '.paper' : ''));
    this.el.style.height = (opts.height || 260) + 'px';
    container.appendChild(this.el);
    this.stage = new ML.stage.Stage(this.el, { layers: ['c'] });
    this.stage.on('c', function (ctx, w, hh) { self._draw(ctx, w, hh); });
    this.pad = { l: 52, r: 16, t: 14, b: 40 };
    if (opts.edit) { this.state = { pts: [], line: null }; this.lastPt = null; this._bindEdit(); }
  }
  Chart.prototype.set = function (series, notes) { this.series = series || []; this.notes = notes || []; this.stage.invalidate(); return this; };
  Chart.prototype._range = function () {
    var o = this.opts, xs = [], ys = [];
    this.series.forEach(function (s) { (s.pts || []).forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
    var x = o.x || [0, Math.max.apply(null, xs.concat([1])) * 1.15], y = o.y || [0, Math.max.apply(null, ys.concat([1])) * 1.2];
    return { x: x, y: y };
  };
  Chart.prototype.toPx = function (x, y) {
    var r = this.r, p = this.pad, w = this.stage.w - p.l - p.r, hh = this.stage.h - p.t - p.b;
    return [p.l + (x - r.x[0]) / (r.x[1] - r.x[0]) * w, p.t + hh - (y - r.y[0]) / (r.y[1] - r.y[0]) * hh];
  };
  Chart.prototype.fromPx = function (px, py) {
    var r = this.r, p = this.pad, w = this.stage.w - p.l - p.r, hh = this.stage.h - p.t - p.b;
    return [r.x[0] + (px - p.l) / w * (r.x[1] - r.x[0]), r.y[0] + (p.t + hh - py) / hh * (r.y[1] - r.y[0])];
  };
  Chart.prototype._draw = function (ctx, w, hh) {
    var self = this, o = this.opts, p = this.pad; this.r = this._range();
    var r = this.r, sx = niceStep(r.x[1] - r.x[0]), sy = niceStep(r.y[1] - r.y[0]);
    var x0 = p.l, y0 = hh - p.b, x1 = w - p.r, y1 = p.t;
    // 坐标纸细格
    if (o.paper) {
      ctx.strokeStyle = 'rgba(199,55,75,.13)'; ctx.lineWidth = 1;
      var fx = sx / 5, fy = sy / 5, v;
      for (v = r.x[0]; v <= r.x[1] + 1e-9; v += fx) { var X = this.toPx(v, 0)[0]; ctx.beginPath(); ctx.moveTo(X, y0); ctx.lineTo(X, y1); ctx.stroke(); }
      for (v = r.y[0]; v <= r.y[1] + 1e-9; v += fy) { var Y = this.toPx(0, v)[1]; ctx.beginPath(); ctx.moveTo(x0, Y); ctx.lineTo(x1, Y); ctx.stroke(); }
    }
    ctx.strokeStyle = o.paper ? 'rgba(199,55,75,.32)' : '#E3EAF3'; ctx.lineWidth = 1;
    var t, dx = decimals(sx), dy = decimals(sy);
    for (t = Math.ceil(r.x[0] / sx) * sx; t <= r.x[1] + 1e-9; t += sx) {
      var px = this.toPx(t, 0)[0]; ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y1); ctx.stroke();
      D.text(ctx, t.toFixed(dx), px, y0 + 16, { align: 'center', size: 12, color: '#4A5B73' });
    }
    for (t = Math.ceil(r.y[0] / sy) * sy; t <= r.y[1] + 1e-9; t += sy) {
      var py = this.toPx(0, t)[1]; ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(x1, py); ctx.stroke();
      D.text(ctx, t.toFixed(dy), x0 - 6, py + 4, { align: 'right', size: 12, color: '#4A5B73' });
    }
    ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x0, y1 - 4); ctx.lineTo(x0, y0); ctx.lineTo(x1 + 4, y0); ctx.stroke();
    D.text(ctx, o.xLabel || '', x1, y0 + 32, { align: 'right', size: 13, weight: 600 });
    D.text(ctx, o.yLabel || '', x0 + 6, y1 + 12, { size: 13, weight: 600 });
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y1 - 2, x1 - x0 + 2, y0 - y1 + 2); ctx.clip();
    this.series.forEach(function (s) {
      var c = s.color || '#1661FF';
      if (s.bars) {
        var bw = Math.abs(self.toPx(s.barW || sx, 0)[0] - self.toPx(0, 0)[0]);
        s.pts.forEach(function (pt, i) {
          var a = self.toPx(pt[0], 0), b = self.toPx(pt[0], pt[1]);
          ctx.fillStyle = '#F6F1E3'; ctx.strokeStyle = '#BFAF86'; ctx.lineWidth = 1;
          ctx.fillRect(a[0] - bw / 2 + 1, b[1], bw - 2, a[1] - b[1]); ctx.strokeRect(a[0] - bw / 2 + 1, b[1], bw - 2, a[1] - b[1]);
          ctx.fillStyle = c; ctx.beginPath(); ctx.arc(b[0], b[1], 3.2, 0, Math.PI * 2); ctx.fill();
        });
      }
      if (s.fit && s.pts.length >= 2) {
        var f = ML.phys.linfit(s.pts.map(function (q) { return q[0]; }), s.pts.map(function (q) { return q[1]; }));
        s.fitResult = f;
        var A = self.toPx(r.x[0], f.k * r.x[0] + f.b), B = self.toPx(r.x[1], f.k * r.x[1] + f.b);
        ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.setLineDash(s.dash ? [6, 5] : []);
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); ctx.setLineDash([]);
      }
      if (s.line) {
        var L1 = self.toPx(s.line[0][0], s.line[0][1]), L2 = self.toPx(s.line[1][0], s.line[1][1]);
        ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.setLineDash(s.dash ? [6, 5] : []);
        ctx.beginPath(); ctx.moveTo(L1[0], L1[1]); ctx.lineTo(L2[0], L2[1]); ctx.stroke(); ctx.setLineDash([]);
      }
      if (!s.bars && s.pts) s.pts.forEach(function (pt) {
        var q = self.toPx(pt[0], pt[1]);
        ctx.fillStyle = s.hollow ? '#fff' : c; ctx.strokeStyle = c; ctx.lineWidth = 1.6;
        if (s.mark === 'x') { ctx.beginPath(); ctx.moveTo(q[0] - 5, q[1] - 5); ctx.lineTo(q[0] + 5, q[1] + 5); ctx.moveTo(q[0] + 5, q[1] - 5); ctx.lineTo(q[0] - 5, q[1] + 5); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(q[0], q[1], 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      });
    });
    if (this.state) this._drawEdit(ctx);
    ctx.restore();
    var leg = this.series.filter(function (s) { return !!s.label; });
    if (leg.length) {
      ctx.font = '500 12px "PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif';
      var maxW = 0;
      leg.forEach(function (s) { maxW = Math.max(maxW, ctx.measureText(s.label).width); });
      var boxW = Math.min(x1 - x0 - 8, maxW + 30);
      var legH = leg.length * 18 + 6;
      var pos = o.legendPos || 'tr';
      var lx = pos === 'tl' ? (x0 + 8) : Math.max(x0 + 4, x1 - boxW - 4);
      var ly = pos === 'br' ? Math.max(y1 + 4, y0 - legH - 4) : (pos === 'tl' ? y1 + 22 : y1 + 4);
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillRect(lx - 4, ly - 2, boxW + 4, legH);
      leg.forEach(function (s) {
        ctx.fillStyle = s.color || '#1661FF'; ctx.fillRect(lx, ly + 5, 14, 3);
        D.text(ctx, s.label, lx + 20, ly + 11, { size: 12, color: '#10233F' }); ly += 18;
      });
    }
    this.notes.forEach(function (n) { var q = self.toPx(n.x, n.y); D.text(ctx, n.text, q[0], q[1], { size: 12, color: n.color || '#10233F', align: n.align || 'left', weight: 600 }); });
  };
  /* ---------- 交互描点作图 ---------- */
  Chart.prototype._drawEdit = function (ctx) {
    var self = this, st = this.state;
    st.pts.forEach(function (pt) {
      var q = self.toPx(pt[0], pt[1]);
      ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(q[0] - 5, q[1] - 5); ctx.lineTo(q[0] + 5, q[1] + 5); ctx.moveTo(q[0] + 5, q[1] - 5); ctx.lineTo(q[0] - 5, q[1] + 5); ctx.stroke();
    });
    if (st.line) {
      var a = this.toPx(st.line[0][0], st.line[0][1]), b = this.toPx(st.line[1][0], st.line[1][1]);
      var ux = b[0] - a[0], uy = b[1] - a[1], L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
      ctx.strokeStyle = '#1661FF'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a[0] - ux * 2000, a[1] - uy * 2000); ctx.lineTo(b[0] + ux * 2000, b[1] + uy * 2000); ctx.stroke();
      [a, b].forEach(function (q) { ctx.fillStyle = 'rgba(18,169,196,.18)'; ctx.beginPath(); ctx.arc(q[0], q[1], 14, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#12A9C4'; ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, Math.PI * 2); ctx.fill(); });
    }
    // 实时显示直线斜率与最近操作点坐标
    var k = this.slope(), info = [];
    if (isFinite(k)) info.push('直线斜率 k = ' + (Math.abs(k) < 1e-12 ? '0' : (ML.math && ML.math.sig ? ML.math.sig(k, 3) : k.toFixed(2))));
    if (this.lastPt) info.push('点 (' + this.lastPt[0].toFixed(2) + ', ' + this.lastPt[1].toFixed(2) + ')');
    if (info.length) {
      var msg = info.join('  |  '), tx = this.pad.l + 8, ty = this.pad.t + 22;
      ctx.font = '600 12px "PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif';
      var tw = ctx.measureText(msg).width;
      ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fillRect(tx - 2, ty - 2, tw + 10, 20);
      D.text(ctx, msg, tx + 3, ty + 12, { size: 12, weight: 600, color: '#1661FF' });
    }
  };
  Chart.prototype._bindEdit = function () {
    var self = this, e = this.opts.edit, dragLine = -1, dragPt = -1;
    function snap(v, s) { return s ? Math.round(v / s) * s : v; }
    function toVal(p, useSnap) {
      var r = self.r || self._range(), pd = self.pad;
      var px = Math.max(pd.l, Math.min(self.stage.w - pd.r, p.x));
      var py = Math.max(pd.t, Math.min(self.stage.h - pd.b, p.y));
      var v = self.fromPx(px, py);
      v[0] = Math.max(r.x[0], Math.min(r.x[1], v[0]));
      v[1] = Math.max(r.y[0], Math.min(r.y[1], v[1]));
      if (useSnap) {
        var sn = e.snap || [0, 0];
        v = [Math.round(snap(v[0], sn[0]) * 1e6) / 1e6, Math.round(snap(v[1], sn[1]) * 1e6) / 1e6];
      }
      return v;
    }
    ML.stage.pointer(this.stage.el, {
      down: function (p) {
        if (self.locked) return false;
        dragLine = -1; dragPt = -1;
        if (self.state.line) for (var i = 0; i < 2; i++) { var q = self.toPx(self.state.line[i][0], self.state.line[i][1]); if (Math.hypot(q[0] - p.x, q[1] - p.y) < 24) { dragLine = i; break; } }
        if (dragLine < 0) self.state.pts.forEach(function (pt, i) { var q = self.toPx(pt[0], pt[1]); if (Math.hypot(q[0] - p.x, q[1] - p.y) < 16) dragPt = i; });
      },
      move: function (p, a) {
        if (dragLine >= 0) {
          self.state.line[dragLine] = toVal(p, false);
          self.stage.invalidate();
          if (e.onChange) e.onChange(self.state);
        } else if (dragPt >= 0 && a.moved) {
          var v = toVal(p, true);
          self.state.pts[dragPt] = v; self.lastPt = v;
          self.stage.invalidate();
          if (e.onChange) e.onChange(self.state);
        }
      },
      up: function (p, a) {
        if (dragLine >= 0) { dragLine = -1; if (e.onChange) e.onChange(self.state); return; }
        if (dragPt >= 0) {
          var idx = dragPt; dragPt = -1;
          if (!a.moved) { self.state.pts.splice(idx, 1); self.lastPt = null; }
          self.stage.invalidate(); if (e.onChange) e.onChange(self.state); return;
        }
        if (a.moved || (e.maxPoints && self.state.pts.length >= e.maxPoints)) return;
        var v = toVal(p, true);
        self.state.pts.push(v); self.lastPt = v;
        self.stage.invalidate(); if (e.onChange) e.onChange(self.state);
      }
    });
  };
  /** 交互作图：放一条可拖动直线（两个手柄） */
  Chart.prototype.addLine = function (p1, p2) { this.state.line = [p1, p2]; this.stage.invalidate(); };
  Chart.prototype.setState = function (st) { this.state = { pts: (st && st.pts) || [], line: (st && st.line) || null }; this.stage.invalidate(); };
  Chart.prototype.slope = function () { var l = this.state && this.state.line; return l ? (l[1][1] - l[0][1]) / (l[1][0] - l[0][0]) : NaN; };

  ML.Chart = Chart;
})(window.ML = window.ML || {});
