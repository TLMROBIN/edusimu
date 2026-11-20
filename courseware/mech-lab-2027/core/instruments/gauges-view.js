/* ML.gaugesView — 基础仪器 2.5D 绘制与通用交互舞台组件（ES2019，纯 Canvas 2D，无外链）。
 * 供 M00 以及后续 M02 / M03 / M06 / M07 / M08 / M09 嵌入复用。 */
(function (ML) {
  'use strict';
  var h = ML.h, D = ML.stage.draw, G = ML.gauges;

  function drawLine(ctx, x1, y1, x2, y2, col, lw) {
    ctx.strokeStyle = col || '#10233F'; ctx.lineWidth = lw || 1;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  /* =====================================================================
   *  1. 毫米刻度尺
   * ===================================================================== */
  function drawRuler(ctx, w, hh, st) {
    st = st || {};
    var startMm = st.startMm != null ? st.startMm : 0;
    var lenMm = st.lengthMm != null ? st.lengthMm : 24.5;
    var d = G.ruler.decompose(lenMm, startMm);
    ctx.fillStyle = '#F6F9FD'; ctx.fillRect(0, 0, w, hh);

    var minCm = Math.max(0, Math.floor(d.startMm / 10) - (d.startMm > 0 ? 1 : 0));
    var maxCm = Math.max(minCm + 4, Math.ceil(d.endMm / 10) + 1);
    var spanMm = (maxCm - minCm) * 10;
    var rx = 28, rw = w - 56, pxPerMm = rw / spanMm;
    var ry = Math.round(hh * 0.44), rh = 54;
    function X(mm) { return rx + (mm - minCm * 10) * pxPerMm; }

    // 被测物体（木块）
    var ox0 = X(d.startMm), ox1 = X(d.endMm), oy = ry - 34;
    ctx.fillStyle = D.grad(ctx, 0, oy, 0, ry, ['#E8CA9C', '#D9B98C']);
    ctx.fillRect(ox0, oy, ox1 - ox0, 34);
    ctx.strokeStyle = '#9F7C49'; ctx.lineWidth = 1.2; ctx.strokeRect(ox0, oy, ox1 - ox0, 34);
    // 左端对准参考线
    ctx.save(); ctx.setLineDash([4, 3]);
    drawLine(ctx, ox0, oy - 6, ox0, ry + 26, '#12A9C4', 1.4);
    drawLine(ctx, ox1, oy - 6, ox1, ry + 26, '#C7374B', 1.4);
    ctx.restore();

    // 刻度尺本体
    ctx.fillStyle = D.grad(ctx, 0, ry, 0, ry + rh, ['#FFFFFF', '#EDF2F7']);
    D.rr(ctx, rx - 10, ry, rw + 20, rh, 4); ctx.fill();
    ctx.strokeStyle = '#9AA8B8'; ctx.lineWidth = 1; ctx.stroke();

    ctx.strokeStyle = '#10233F'; ctx.beginPath();
    for (var m = minCm * 10; m <= maxCm * 10; m++) {
      var x = Math.round(X(m)) + 0.5;
      var tl = m % 10 === 0 ? 18 : m % 5 === 0 ? 13 : 8;
      ctx.moveTo(x, ry); ctx.lineTo(x, ry + tl);
    }
    ctx.stroke();
    for (var c = minCm; c <= maxCm; c++) {
      D.text(ctx, String(c), X(c * 10), ry + 34, { align: 'center', size: 12, weight: 700 });
    }
    D.text(ctx, 'cm', rx + rw + 4, ry + 34, { align: 'right', size: 11, color: '#4A5B73' });

    // 末端局部放大窗（右上）
    var zx = Math.max(rx, w - 210), zy = 12, zw = 192, zh = Math.min(82, ry - 44);
    if (zh >= 54) {
      ctx.save();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#12A9C4'; ctx.lineWidth = 1.5;
      D.rr(ctx, zx, zy, zw, zh, 10); ctx.fill(); ctx.stroke();
      ctx.beginPath(); D.rr(ctx, zx + 2, zy + 2, zw - 4, zh - 4, 8); ctx.clip();
      var zSpan = 12, zPx = zw / zSpan, zMin = d.endMm - zSpan / 2;
      var zX = function (mm) { return zx + (mm - zMin) * zPx; };
      var zMidY = zy + zh * 0.48;
      ctx.fillStyle = '#E8CA9C'; ctx.fillRect(zx, zy + 8, zX(d.endMm) - zx, zMidY - zy - 8);
      ctx.strokeStyle = '#9F7C49'; ctx.strokeRect(zx - 2, zy + 8, zX(d.endMm) - zx + 2, zMidY - zy - 8);
      ctx.fillStyle = '#FBFCFE'; ctx.fillRect(zx, zMidY, zw, zh);
      drawLine(ctx, zx, zMidY, zx + zw, zMidY, '#9AA8B8', 1);
      var mStart = Math.max(0, Math.floor(zMin)), mEnd = Math.ceil(zMin + zSpan);
      ctx.strokeStyle = '#10233F'; ctx.beginPath();
      for (var mm = mStart; mm <= mEnd; mm++) {
        var tx = zX(mm), hTick = mm % 10 === 0 ? 18 : mm % 5 === 0 ? 13 : 8;
        ctx.moveTo(tx, zMidY); ctx.lineTo(tx, zMidY + hTick);
      }
      ctx.stroke();
      for (mm = mStart; mm <= mEnd; mm++) {
        if (mm % 5 === 0) D.text(ctx, (mm / 10).toFixed(mm % 10 === 0 ? 0 : 1), zX(mm), zMidY + 30, { align: 'center', size: 11, weight: mm % 10 === 0 ? 700 : 500 });
      }
      drawLine(ctx, zX(d.endMm), zy + 4, zX(d.endMm), zMidY + 22, '#C7374B', 1.8);
      ctx.restore();
      D.text(ctx, '末端放大', zx + 6, zy + 13, { size: 10, color: '#0E8CA3', weight: 700 });
    }

    if (st.marks && st.marks.indexOf('nonzero') >= 0 && startMm > 0) {
      D.ring(ctx, ox0, ry + 14, 24, '#C7374B');
      D.text(ctx, '起点在 ' + (startMm / 10).toFixed(2) + ' cm，需做差！', ox0 + 28, ry + rh + 20, { size: 12, weight: 700, color: '#C7374B' });
    } else if (st.sightShiftMm) {
      var sx = X(d.endMm + st.sightShiftMm);
      ctx.save(); ctx.setLineDash([4, 3]);
      drawLine(ctx, ox1 + st.sightShiftMm * pxPerMm * 2.2, 22, ox1, oy, '#C7374B', 1.6);
      drawLine(ctx, ox1, oy, sx, ry + 12, '#C7374B', 1.6);
      ctx.restore();
      D.text(ctx, '斜视（未正对刻度线）', ox1 + 10, 26, { size: 12, weight: 700, color: '#C7374B' });
    }
    D.text(ctx, '分度值 1 mm · 估读到 0.1 mm（0.01 cm）', 14, hh - 10, { size: 12, color: '#4A5B73' });
  }

  /* =====================================================================
   *  2. 游标卡尺（10 / 20 / 50 分度）
   * ===================================================================== */
  function drawCaliper(ctx, w, hh, st) {
    st = st || {};
    var div = st.div || 10, valMm = st.valMm != null ? st.valMm : 19.0;
    var d = G.caliper.decompose(valMm, div);
    ctx.fillStyle = '#F6F9FD'; ctx.fillRect(0, 0, w, hh);

    // 上半部分：2.5D 卡尺与被测物示意
    var compact = hh < 270;
    var jawX = 56, topY = compact ? 6 : 22, beamY = topY + (compact ? 12 : 26), beamH = compact ? 22 : 30;
    var jawDrop = compact ? 26 : 44, jawInner = compact ? 14 : 22, objOff = compact ? 6 : 14, objH = compact ? 16 : 24;
    var maxMainMm = Math.max(60, Math.ceil((d.q + 52) / 10) * 10);
    var topPxPerMm = Math.min(4.8, (w - jawX - 36) / maxMainMm);
    var mX = function (mm) { return jawX + mm * topPxPerMm; };

    // 主尺身与左固定量爪
    ctx.fillStyle = D.grad(ctx, 0, beamY, 0, beamY + beamH, ['#EEF2F6', '#CDD6E0']);
    ctx.beginPath();
    ctx.moveTo(jawX - 18, beamY); ctx.lineTo(mX(maxMainMm) + 12, beamY);
    ctx.lineTo(mX(maxMainMm) + 12, beamY + beamH); ctx.lineTo(jawX, beamY + beamH);
    ctx.lineTo(jawX, beamY + beamH + jawDrop); ctx.lineTo(jawX - 16, beamY + beamH + jawInner);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#7E8C9B'; ctx.lineWidth = 1.2; ctx.stroke();

    // 主尺上刻度
    ctx.strokeStyle = '#10233F'; ctx.beginPath();
    for (var m = 0; m <= maxMainMm; m++) {
      var tx = mX(m), tl = m % 10 === 0 ? 11 : m % 5 === 0 ? 8 : 5;
      ctx.moveTo(tx, beamY + beamH); ctx.lineTo(tx, beamY + beamH - tl);
    }
    ctx.stroke();
    for (var c = 0; c <= Math.floor(maxMainMm / 10); c++) {
      D.text(ctx, String(c), mX(c * 10), beamY + (compact ? 10 : 13), { align: 'center', size: 10, weight: 700 });
    }

    // 被测圆柱（夹在两外量爪之间）
    var objW = d.q * topPxPerMm, objY = beamY + beamH + objOff;
    ctx.fillStyle = D.grad(ctx, jawX, objY, jawX + objW, objY, ['#E69B2D', '#F5C469', '#C87E1A']);
    ctx.fillRect(jawX, objY, objW, objH);
    ctx.strokeStyle = '#9A5A00'; ctx.strokeRect(jawX, objY, objW, objH);

    // 可动游标框（左边缘在 d.q - 2.0 mm，游标 0 刻线在 d.q mm）
    var vLeft = mX(d.q - 2.2), vRight = mX(d.q + (div === 10 ? 11 : div === 20 ? 21 : 51));
    var vBoxBot = compact ? 15 : 20;
    ctx.fillStyle = D.grad(ctx, 0, beamY + beamH - 2, 0, beamY + beamH + vBoxBot + 4, ['#DCE4EC', '#AEB9C6']);
    ctx.beginPath();
    ctx.moveTo(mX(d.q), beamY + beamH + jawDrop); ctx.lineTo(mX(d.q) + 16, beamY + beamH + jawInner);
    ctx.lineTo(mX(d.q) + 16, beamY + beamH + vBoxBot); ctx.lineTo(vRight, beamY + beamH + vBoxBot);
    ctx.lineTo(vRight, beamY + beamH - 2); ctx.lineTo(vLeft, beamY + beamH - 2);
    ctx.lineTo(vLeft, beamY + beamH + vBoxBot); ctx.lineTo(mX(d.q), beamY + beamH + vBoxBot);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#596574'; ctx.stroke();
    // 游标 0 刻线标记
    drawLine(ctx, mX(d.q), beamY + beamH - 1, mX(d.q), beamY + beamH + (compact ? 11 : 14), '#1661FF', 1.5);

    if (st.marks && st.marks.indexOf('frameEdge') >= 0) {
      D.ring(ctx, vLeft, beamY + beamH + 8, 14, '#C7374B');
      D.text(ctx, '这是游标框左边缘（不是 0 线）', vLeft - 8, beamY + beamH + (compact ? 31 : 34), { size: 11, weight: 700, color: '#C7374B' });
    }

    // 下半部分：高倍率刻度放大阅读窗（能清晰分辨 50 分度 0.02 mm）
    var zy = compact ? Math.max(Math.round(hh * 0.48), beamY + beamH + 36) : Math.round(hh * 0.45);
    var zh = hh - zy - (compact ? 22 : 26), zx = 14, zw = w - 28;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#B9C8DA'; ctx.lineWidth = 1.4;
    D.rr(ctx, zx, zy, zw, zh, 12); ctx.fill(); ctx.stroke();
    D.text(ctx, '局部放大（' + div + ' 分度 · 精度 ' + d.step + ' mm）', zx + 12, zy + 17, { size: 12, weight: 700, color: '#1661FF' });

    ctx.save();
    ctx.beginPath(); D.rr(ctx, zx + 4, zy + 22, zw - 8, zh - 26, 8); ctx.clip();
    var vernLen = div === 10 ? 9 : div === 20 ? 19 : 49;
    var winSpan = Math.max(18, vernLen + 9);
    var winMinMm = Math.max(0, Math.floor(d.q) - 4);
    var zScale = (zw - 36) / winSpan;
    var zX = function (mm) { return zx + 18 + (mm - winMinMm) * zScale; };
    var midY = zy + 22 + (zh - 26) * 0.48;

    // 放大主尺
    ctx.fillStyle = '#F3F7FC'; ctx.fillRect(zx, zy + 22, zw, midY - zy - 22);
    ctx.strokeStyle = '#10233F'; ctx.lineWidth = 1.1; ctx.beginPath();
    var m0 = Math.floor(winMinMm), m1 = Math.ceil(winMinMm + winSpan);
    for (m = m0; m <= m1; m++) {
      var xPos = zX(m), hT = m % 10 === 0 ? 22 : m % 5 === 0 ? 16 : 10;
      ctx.moveTo(xPos, midY); ctx.lineTo(xPos, midY - hT);
    }
    ctx.stroke();
    for (m = m0; m <= m1; m++) {
      if (m % 10 === 0) D.text(ctx, String(m / 10), zX(m), midY - 26, { align: 'center', size: 12, weight: 700 });
    }
    D.text(ctx, 'cm', zX(m1) - 10, midY - 26, { align: 'right', size: 11, color: '#4A5B73' });

    // 放大游标尺框（框左边缘明显在 0 线左 2 mm）
    var zvLeft = zX(d.q - 2.0), zvRight = zX(d.markPosMm(div) + 1.8);
    ctx.fillStyle = '#E8EEF5'; ctx.fillRect(zvLeft, midY, zvRight - zvLeft, zh);
    drawLine(ctx, zvLeft, midY, zvLeft, zy + zh, '#7E8C9B', 2);
    drawLine(ctx, zx, midY, zx + zw, midY, '#596574', 1.2);

    // 放大游标刻线
    for (var i = 0; i <= div; i++) {
      var vx = zX(d.markPosMm(i));
      var isMajor = div === 10 ? true : (div === 20 ? i % 2 === 0 : i % 5 === 0);
      var isAlign = st.hintAlign && i === d.k;
      var vLen = i === 0 || i === div ? 22 : (i % 5 === 0 ? 18 : 11);
      drawLine(ctx, vx, midY, vx, midY + vLen, isAlign ? '#25A870' : (i === 0 ? '#1661FF' : '#10233F'), isAlign || i === 0 ? 1.8 : 1);
      if (isMajor && (div !== 50 || i % 10 === 0 || i === 5)) {
        var lbl = div === 50 ? String(i / 5) : String(i);
        D.text(ctx, lbl, vx, midY + 35, { align: 'center', size: div === 50 ? 10.5 : 11, weight: i === 0 ? 700 : 500, color: i === 0 ? '#1661FF' : '#10233F' });
      }
    }
    if (st.marks && st.marks.indexOf('frameEdge') >= 0) {
      D.ring(ctx, zvLeft, midY + 12, 16, '#C7374B');
      D.ring(ctx, zX(d.q), midY + 12, 16, '#25A870');
    }
    if (st.hintAlign) {
      var ax = zX(d.markPosMm(d.k));
      ctx.save(); ctx.setLineDash([3, 3]);
      drawLine(ctx, ax, midY - 26, ax, midY + 26, '#25A870', 1.6);
      ctx.restore();
    }
    ctx.restore();

    D.text(ctx, '主尺读到游标 0 刻线左侧整毫米；拖动量爪或右侧按钮调长度，按住看放大镜', 14, hh - 8, { size: 12, color: '#4A5B73' });
  }

  /* =====================================================================
   *  3. 螺旋测微器（千分尺）
   * ===================================================================== */
  function drawMicSleeve(ctx, x, y, w, hh, dispMm, opts) {
    opts = opts || {};
    var pxPerMm = opts.pxPerMm || 28;
    var sleeveW = w * 0.56, zeroX = x + 16;
    var datumY = y + hh * 0.50;
    var thimbleX = Math.max(zeroX, zeroX + dispMm * pxPerMm);
    if (thimbleX > x + sleeveW - 18) {
      var shiftMm = (thimbleX - (x + sleeveW - 18)) / pxPerMm;
      zeroX -= shiftMm * pxPerMm;
      thimbleX = Math.max(zeroX, zeroX + dispMm * pxPerMm);
    }

    ctx.save();
    ctx.beginPath(); D.rr(ctx, x, y, w, hh, 8); ctx.clip();
    ctx.fillStyle = '#FBFCFE'; ctx.fillRect(x, y, w, hh);

    // 固定刻度套筒
    ctx.fillStyle = D.grad(ctx, 0, datumY - 36, 0, datumY + 36, ['#DCE3EC', '#F8FAFC', '#C7D1DC']);
    ctx.fillRect(x, datumY - 36, Math.max(0, thimbleX - x), 72);
    drawLine(ctx, x, datumY - 36, thimbleX, datumY - 36, '#8E99A6', 1);
    drawLine(ctx, x, datumY + 36, thimbleX, datumY + 36, '#8E99A6', 1);
    drawLine(ctx, Math.min(x, zeroX - 4), datumY, thimbleX, datumY, '#10233F', 1.4);

    // 整毫米（上）与 0.5 mm（下）
    var maxM = Math.ceil((thimbleX - zeroX) / pxPerMm) + 1;
    var halfExp = (Math.floor((dispMm + 1e-9) / 0.5) % 2) === 1;
    for (var m = 0; m <= maxM; m++) {
      var mx = zeroX + m * pxPerMm;
      if (mx <= thimbleX + 0.5 && mx >= x + 4) {
        drawLine(ctx, mx, datumY, mx, datumY - (m % 5 === 0 ? 18 : 12), '#10233F', m % 5 === 0 ? 1.5 : 1.1);
        if (m % 5 === 0) D.text(ctx, String(m), mx, datumY - 22, { align: 'center', size: 11, weight: 700 });
      }
      var hx = zeroX + (m + 0.5) * pxPerMm;
      if (hx <= thimbleX + 0.5 && hx >= x + 4) {
        var isHalfMark = opts.markHalf && halfExp && Math.abs(m - Math.floor(dispMm)) < 0.01;
        drawLine(ctx, hx, datumY, hx, datumY + 13, isHalfMark ? '#C7374B' : '#10233F', isHalfMark ? 2 : 1.1);
        if (isHalfMark) D.ring(ctx, hx, datumY + 7, 13, '#C7374B');
      }
    }
    if (opts.markHalf && !halfExp && dispMm > 0) {
      D.ring(ctx, thimbleX - 6, datumY + 8, 13, '#C7374B');
      D.text(ctx, '半mm未露', Math.max(x + 34, thimbleX - 18), datumY + 28, { align: 'center', size: 10.5, weight: 700, color: '#C7374B' });
    }

    // 可动刻度锥面套筒
    var bevelW = 34, bodyW = x + w - thimbleX - bevelW;
    ctx.fillStyle = D.grad(ctx, 0, datumY - 48, 0, datumY + 48, ['#B8C3CF', '#F5F8FB', '#9AA7B5']);
    ctx.beginPath();
    ctx.moveTo(thimbleX, datumY - 36); ctx.lineTo(thimbleX + bevelW, datumY - 48);
    ctx.lineTo(thimbleX + bevelW, datumY + 48); ctx.lineTo(thimbleX, datumY + 36);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#596574'; ctx.stroke();

    ctx.fillStyle = D.grad(ctx, 0, datumY - 48, 0, datumY + 48, ['#9FAAB7', '#E6ECF3', '#7E8A98']);
    ctx.fillRect(thimbleX + bevelW, datumY - 48, Math.max(20, bodyW), 96);
    ctx.strokeRect(thimbleX + bevelW, datumY - 48, Math.max(20, bodyW), 96);

    // 可动刻度 50 格（向上递增）
    var thVal = +((dispMm - Math.floor((dispMm + 1e-9) / 0.5) * 0.5) * 100).toFixed(2);
    var sp = 6.2;
    for (var t = 0; t < 50; t++) {
      var diff = ((t - thVal + 75) % 50) - 25;
      var ty = datumY - diff * sp;
      if (ty < datumY - 43 || ty > datumY + 43) continue;
      var is5 = t % 5 === 0;
      drawLine(ctx, thimbleX + 3, ty, thimbleX + (is5 ? 20 : 12), ty, '#10233F', is5 ? 1.4 : 1);
      if (is5) D.text(ctx, String(t), thimbleX + 23, ty + 4, { size: 11, weight: 700 });
    }
    ctx.restore();
    ctx.strokeStyle = '#B9C8DA'; ctx.lineWidth = 1.2;
    D.rr(ctx, x, y, w, hh, 8); ctx.stroke();
  }

  function drawMicrometer(ctx, w, hh, st) {
    st = st || {};
    var trueMm = st.trueMm != null ? st.trueMm : 6.860, zeroErr = st.zeroErrMm || 0;
    var d = G.micrometer.decompose(trueMm, zeroErr);
    ctx.fillStyle = '#F6F9FD'; ctx.fillRect(0, 0, w, hh);

    // 左侧：2.5D U 形尺架与被测物
    var uLeft = 24, uTop = 26, anvilX = 56, gapW = Math.max(12, Math.min(72, d.trueMm * 4.5));
    var spinX = anvilX + gapW, axisY = uTop + 34;
    ctx.strokeStyle = '#596574'; ctx.lineWidth = 14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(uLeft + 52, axisY + 34, 48, Math.PI * 0.12, Math.PI * 1.12); ctx.stroke();
    ctx.strokeStyle = '#9AA7B5'; ctx.lineWidth = 8; ctx.stroke(); ctx.lineCap = 'butt'; ctx.lineWidth = 1;

    ctx.fillStyle = '#8E99A6'; ctx.fillRect(anvilX - 10, axisY - 7, 10, 14);
    ctx.fillStyle = D.grad(ctx, 0, axisY - 12, 0, axisY + 12, ['#D9B98C', '#C49F6B']);
    ctx.beginPath(); ctx.arc((anvilX + spinX) / 2, axisY, gapW / 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8E6B38'; ctx.stroke();
    ctx.fillStyle = '#C9D1D9'; ctx.fillRect(spinX, axisY - 6, 48, 12); ctx.strokeStyle = '#6E7B8A'; ctx.strokeRect(spinX, axisY - 6, 48, 12);
    ctx.fillStyle = D.grad(ctx, 0, axisY - 16, 0, axisY + 16, ['#DCE4EC', '#9AA7B5']);
    ctx.fillRect(spinX + 46, axisY - 16, 62, 32); ctx.strokeRect(spinX + 46, axisY - 16, 62, 32);

    var compact = hh < 270;
    // 零误差参考小窗（若存在零误差）
    if (Math.abs(zeroErr) > 1e-6) {
      var zx = w - 210, zy = compact ? 4 : 10, zh0 = compact ? 62 : 88;
      D.text(ctx, '空载零误差：' + (zeroErr >= 0 ? '+' : '') + zeroErr.toFixed(3) + ' mm', zx + 2, zy + 11, { size: 11.5, weight: 700, color: '#C7374B' });
      drawMicSleeve(ctx, zx, zy + 16, 194, zh0, zeroErr, { pxPerMm: 24 });
    } else {
      D.text(ctx, '螺距 0.5 mm · 50 格（0.01 mm/格）· 估读到 0.001 mm', w - 16, axisY - 12, { align: 'right', size: 11.5, weight: 600, color: '#10233F' });
    }

    // 下方：高清晰放大套筒读数窗
    var my = (compact && Math.abs(zeroErr) > 1e-6) ? Math.max(Math.round(hh * 0.42), 88) : Math.round(hh * 0.36);
    var mh = hh - my - 26;
    drawMicSleeve(ctx, 18, my, w - 36, mh, d.dispMm, { pxPerMm: Math.min(34, (w - 160) / Math.max(6, d.dispMm + 2)), markHalf: st.marks && st.marks.indexOf('half') >= 0 });
    D.text(ctx, '读数 = 固定刻度（注意下排 0.5 mm 刻线）+ 可动刻度格数 × 0.01 mm', 18, hh - 8, { size: 12, color: '#4A5B73' });
  }

  /* =====================================================================
   *  4. 弹簧测力计（0-5 N，0.1 N 分度）
   * ===================================================================== */
  function drawDynamometer(ctx, w, hh, st) {
    st = st || {};
    var f = st.trueForceN != null ? st.trueForceN : 3.70, zErr = st.zeroOffsetN || 0;
    var d = G.dynamometer.decompose(f, zErr);
    ctx.fillStyle = '#F6F9FD'; ctx.fillRect(0, 0, w, hh);

    // 左侧：测力计整机
    var cx = Math.round(w * 0.28), by = 30, bw = 82, bh = Math.min(220, hh - 80);
    ctx.strokeStyle = '#8E99A6'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, by - 8, 12, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = D.grad(ctx, cx - bw / 2, 0, cx + bw / 2, 0, ['#F8FAFC', '#DCE4EC']);
    D.rr(ctx, cx - bw / 2, by, bw, bh, 12); ctx.fill(); ctx.strokeStyle = '#7E8C9B'; ctx.stroke();

    var sTop = by + 24, sBot = by + bh - 26, sH = sBot - sTop;
    var yOf = function (n) { return sTop + (n / 5) * sH; };
    ctx.fillStyle = '#fff'; ctx.fillRect(cx - 22, sTop - 8, 44, sH + 16);
    ctx.strokeStyle = '#B9C8DA'; ctx.strokeRect(cx - 22, sTop - 8, 44, sH + 16);
    for (var n = 0; n <= 50; n++) {
      var yy = yOf(n / 10), maj = n % 10 === 0, mid = n % 5 === 0;
      drawLine(ctx, cx - 20, yy, cx - 20 + (maj ? 14 : mid ? 10 : 6), yy, '#10233F', maj ? 1.4 : 0.9);
      if (maj) D.text(ctx, String(n / 10), cx + 14, yy + 4, { align: 'right', size: 11, weight: 700 });
    }
    var py = yOf(Math.max(0, Math.min(5, d.dispN)));
    drawLine(ctx, cx - 22, py, cx + 18, py, '#C7374B', 2.4);
    drawLine(ctx, cx, by + bh, cx, by + bh + 18, '#6E7B8A', 2.5);
    ctx.fillStyle = '#8E99A6'; ctx.fillRect(cx - 14, by + bh + 16, 28, 16);
    D.text(ctx, '0–5 N', cx, by + 16, { align: 'center', size: 11, weight: 700, color: '#4A5B73' });

    // 右侧：指针处高倍率放大窗
    var zx = Math.round(w * 0.48), zw = w - zx - 20, zy = 26, zh = hh - 62;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#B9C8DA'; D.rr(ctx, zx, zy, zw, zh, 12); ctx.fill(); ctx.stroke();
    D.text(ctx, '指针局部放大（最小分度 0.1 N · 估读到 0.01 N）', zx + 14, zy + 20, { size: 12, weight: 700, color: '#1661FF' });
    if (Math.abs(zErr) > 1e-6) {
      D.text(ctx, '注意：空载未调零，零误差 ' + (zErr >= 0 ? '+' : '') + zErr.toFixed(2) + ' N', zx + 14, zy + 38, { size: 12, weight: 700, color: '#C7374B' });
    }
    ctx.save();
    ctx.beginPath(); D.rr(ctx, zx + 8, zy + 46, zw - 16, zh - 56, 8); ctx.clip();
    var zScale = (zh - 60) / 1.4, zCenter = d.dispN;
    var zY = function (val) { return zy + 46 + (zh - 56) / 2 + (val - zCenter) * zScale; };
    var n0 = Math.max(0, Math.floor((zCenter - 0.8) * 10)), n1 = Math.min(50, Math.ceil((zCenter + 0.8) * 10));
    var scaleX = zx + zw * 0.42;
    ctx.fillStyle = '#F8FBFF'; ctx.fillRect(scaleX - 30, zy + 46, 90, zh);
    for (n = n0; n <= n1; n++) {
      var yk = zY(n / 10), isMaj = n % 10 === 0, isMid = n % 5 === 0;
      drawLine(ctx, scaleX - 24, yk, scaleX - 24 + (isMaj ? 32 : isMid ? 22 : 14), yk, '#10233F', isMaj ? 1.8 : 1.1);
      if (isMaj || isMid) D.text(ctx, (n / 10).toFixed(1), scaleX + 20, yk + 4, { size: 12.5, weight: isMaj ? 700 : 500 });
    }
    var zpy = zY(d.dispN);
    drawLine(ctx, scaleX - 42, zpy, scaleX + 18, zpy, '#C7374B', 2.6);
    ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.moveTo(scaleX - 42, zpy - 6); ctx.lineTo(scaleX - 30, zpy); ctx.lineTo(scaleX - 42, zpy + 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    D.text(ctx, '拖动挂钩或右侧按钮改变拉力', 14, hh - 8, { size: 12, color: '#4A5B73' });
  }

  /* =====================================================================
   *  5. 机械停表（0-15 min 小盘 + 0-30 s 大盘，不估读）
   * ===================================================================== */
  function drawStopwatch(ctx, w, hh, st) {
    st = st || {};
    var totalSec = st.totalSec != null ? st.totalSec : 54.0;
    var d = G.stopwatch.decompose(totalSec);
    ctx.fillStyle = '#F6F9FD'; ctx.fillRect(0, 0, w, hh);

    // 左侧：停表主体
    var R = Math.min(hh * 0.38, w * 0.22, 118), cx = Math.round(w * 0.27), cy = Math.round(hh * 0.52);
    ctx.fillStyle = '#8E99A6'; ctx.fillRect(cx - 10, cy - R - 18, 20, 14);
    ctx.fillStyle = D.grad(ctx, cx - R, cy - R, cx + R, cy + R, ['#E6ECF2', '#9AA7B5']);
    ctx.beginPath(); ctx.arc(cx, cy, R + 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#596574'; ctx.stroke();

    // 大表盘（30 s 一圈，300 格）
    for (var i = 0; i < 300; i++) {
      var ang = (i / 300) * Math.PI * 2 - Math.PI / 2;
      var maj = i % 10 === 0, mid = i % 5 === 0;
      if (R < 90 && !maj && i % 2 !== 0) continue;
      var rOut = R - 4, rIn = rOut - (maj ? 10 : mid ? 7 : 4);
      drawLine(ctx, cx + Math.cos(ang) * rIn, cy + Math.sin(ang) * rIn, cx + Math.cos(ang) * rOut, cy + Math.sin(ang) * rOut, '#10233F', maj ? 1.3 : 0.7);
      if (maj && i % 20 === 0) {
        var s0 = i / 10;
        D.text(ctx, String(s0 === 0 ? 30 : s0), cx + Math.cos(ang) * (R - 20), cy + Math.sin(ang) * (R - 20) + 4, { align: 'center', size: 10.5, weight: 700 });
        D.text(ctx, String(s0 === 0 ? 60 : s0 + 30), cx + Math.cos(ang) * (R - 32), cy + Math.sin(ang) * (R - 32) + 4, { align: 'center', size: 9, color: '#C7374B', weight: 600 });
      }
    }

    // 小表盘（15 min）
    var sx = cx, sy = cy - R * 0.38, sr = R * 0.29;
    ctx.fillStyle = '#F8FBFF'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9AA8B8'; ctx.stroke();
    for (i = 0; i < 30; i++) {
      var ma = (i / 30) * Math.PI * 2 - Math.PI / 2;
      var isInt = i % 2 === 0;
      drawLine(ctx, sx + Math.cos(ma) * (sr - (isInt ? 6 : 4)), sy + Math.sin(ma) * (sr - (isInt ? 6 : 4)), sx + Math.cos(ma) * (sr - 1), sy + Math.sin(ma) * (sr - 1), isInt ? '#10233F' : '#C7374B', isInt ? 1.2 : 1);
    }
    var mAng = (d.minPos / 15) * Math.PI * 2 - Math.PI / 2;
    drawLine(ctx, sx, sy, sx + Math.cos(mAng) * (sr - 5), sy + Math.sin(mAng) * (sr - 5), '#C7374B', 2);

    // 秒针
    var sAng = (d.handSec / 30) * Math.PI * 2 - Math.PI / 2;
    drawLine(ctx, cx - Math.cos(sAng) * 14, cy - Math.sin(sAng) * 14, cx + Math.cos(sAng) * (R - 8), cy + Math.sin(sAng) * (R - 8), '#10233F', 2);
    ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();

    // 右侧上下两个局部放大窗
    var zx = Math.round(w * 0.50), zw = w - zx - 16;
    var z1y = 14, z1h = Math.round((hh - 44) * 0.44);
    var z2y = z1y + z1h + 10, z2h = hh - z2y - 24;

    // 放大1：小表盘（分针与红线半分钟判定）
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#B9C8DA'; D.rr(ctx, zx, z1y, zw, z1h, 10); ctx.fill(); ctx.stroke();
    D.text(ctx, '① 小表盘放大（红线为半分钟线）', zx + 10, z1y + 16, { size: 11.5, weight: 700, color: '#C7374B' });
    ctx.save(); ctx.beginPath(); D.rr(ctx, zx + 4, z1y + 20, zw - 8, z1h - 24, 6); ctx.clip();
    var mStart = Math.max(0, d.minInt - 1), mSpan = 3.2, mScale = (zw - 40) / mSpan;
    var mBarY = z1y + z1h * 0.62;
    drawLine(ctx, zx + 14, mBarY, zx + zw - 14, mBarY, '#9AA8B8', 1.2);
    for (var mi = mStart * 2; mi <= (mStart + 4) * 2; mi++) {
      var mv = mi * 0.5, mx = zx + 20 + (mv - mStart) * mScale;
      var isMin = mi % 2 === 0;
      drawLine(ctx, mx, mBarY - (isMin ? 16 : 11), mx, mBarY, isMin ? '#10233F' : '#C7374B', isMin ? 1.8 : 1.5);
      if (isMin) D.text(ctx, String(mv), mx, mBarY + 14, { align: 'center', size: 11, weight: 700 });
      else D.text(ctx, '半', mx, mBarY - 19, { align: 'center', size: 9.5, color: '#C7374B' });
    }
    var mPtrX = zx + 20 + (d.minPos - mStart) * mScale;
    ctx.fillStyle = '#C7374B'; ctx.beginPath(); ctx.moveTo(mPtrX, mBarY - 2); ctx.lineTo(mPtrX - 5, mBarY - 14); ctx.lineTo(mPtrX + 5, mBarY - 14); ctx.closePath(); ctx.fill();
    if (st.marks && st.marks.indexOf('half') >= 0) D.ring(ctx, mPtrX, mBarY - 6, 18, '#C7374B');
    ctx.restore();

    // 放大2：大表盘（外圈 0-30 s / 内圈 30-60 s）
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#B9C8DA'; D.rr(ctx, zx, z2y, zw, z2h, 10); ctx.fill(); ctx.stroke();
    D.text(ctx, '② 大表盘放大（黑 0~30 / 红 30~60 s，不估读）', zx + 10, z2y + 16, { size: 11.5, weight: 700, color: '#1661FF' });
    ctx.save(); ctx.beginPath(); D.rr(ctx, zx + 4, z2y + 20, zw - 8, z2h - 24, 6); ctx.clip();
    var sSpan = 3.4, sMin = d.handSec - sSpan / 2, sScale = (zw - 24) / sSpan;
    var sBarY = z2y + z2h * 0.52;
    drawLine(ctx, zx + 10, sBarY, zx + zw - 10, sBarY, '#9AA8B8', 1.2);
    for (var ti = Math.floor(sMin * 10); ti <= Math.ceil((sMin + sSpan) * 10); ti++) {
      var sv = ((ti % 300) + 300) % 300;
      var sx2 = zx + 12 + (ti / 10 - sMin) * sScale;
      var isSec = sv % 10 === 0, isHalfS = sv % 5 === 0;
      drawLine(ctx, sx2, sBarY - (isSec ? 18 : isHalfS ? 13 : 8), sx2, sBarY, '#10233F', isSec ? 1.6 : 0.9);
      if (isSec) {
        var bLbl = sv / 10, rLbl = bLbl + 30;
        D.text(ctx, String(bLbl === 0 ? 30 : bLbl), sx2, sBarY + 14, { align: 'center', size: 11.5, weight: 700 });
        D.text(ctx, String(rLbl === 30 ? 60 : rLbl), sx2, sBarY + 27, { align: 'center', size: 10.5, weight: 700, color: '#C7374B' });
      }
    }
    var sPtrX = zx + 12 + (d.handSec - sMin) * sScale;
    drawLine(ctx, sPtrX, sBarY - 24, sPtrX, sBarY + 8, '#1661FF', 2.4);
    ctx.restore();
    D.text(ctx, '最小分度 0.1 s（不估读）', 14, hh - 8, { size: 12, color: '#4A5B73' });
  }

  /* =====================================================================
   *  6. 通用交互台（支持单指拖动改读数 + 长按 3 倍放大镜）
   * ===================================================================== */
  function GaugeBench(container, opts) {
    var self = this; opts = opts || {};
    this.opts = opts;
    this.st = Object.assign({ type: 'caliper', valMm: 19.0, div: 10, trueMm: 6.860, zeroErrMm: 0, lengthMm: 24.5, startMm: 0, trueForceN: 3.70, zeroOffsetN: 0, totalSec: 54.0 }, opts.state || {});
    this.el = h('div.ml-gauge');
    this.el.style.height = (opts.height || 340) + 'px';
    container.appendChild(this.el);
    this.stage = new ML.stage.Stage(this.el, { layers: ['g'] });
    this.stage.on('g', function (ctx, w, hh) { self.draw(ctx, w, hh); });
    this.mag = new ML.stage.Magnifier(this.el, { zoom: 3, size: 150 });
    var startX = 0, startY = 0, startVal = 0;
    ML.stage.pointer(this.stage.el, {
      down: function (p) {
        startX = p.x; startY = p.y; startVal = self.value();
      },
      move: function (p, a) {
        if (a.pressed) { self.mag.show([self.stage.layer('g').canvas], p.x, p.y, self.stage.dpr); return; }
        if (!a.moved || self.st.locked) return;
        var dx = p.x - startX, dy = p.y - startY, t = self.st.type;
        if (t === 'caliper') self.st.valMm = ML.phys.clamp(Math.round((startVal + dx * 0.12) * self.st.div) / self.st.div, 2, 48);
        else if (t === 'micrometer') self.st.trueMm = ML.phys.clamp(Math.round((startVal + dx * 0.015) * 1000) / 1000, 0.5, 14.5);
        else if (t === 'ruler') self.st.lengthMm = ML.phys.clamp(Math.round((startVal + dx * 0.15) * 10) / 10, 5, 48);
        else if (t === 'dynamometer') {
          var delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
          self.st.trueForceN = ML.phys.clamp(Math.round((startVal + delta * 0.015) * 100) / 100, 0.2, 4.8);
        }
        else if (t === 'stopwatch') self.st.totalSec = ML.phys.clamp(Math.round((startVal + dx * 0.2) * 10) / 10, 1, 179);
        self.stage.invalidate();
        if (self.opts.onChange) self.opts.onChange(self.st);
      },
      press: function (p) { self.mag.show([self.stage.layer('g').canvas], p.x, p.y, self.stage.dpr); },
      up: function () { self.mag.hide(); }
    });
  }
  GaugeBench.prototype.value = function () {
    var s = this.st;
    return s.type === 'caliper' ? s.valMm : s.type === 'micrometer' ? s.trueMm : s.type === 'ruler' ? s.lengthMm : s.type === 'dynamometer' ? s.trueForceN : s.totalSec;
  };
  GaugeBench.prototype.set = function (patch) {
    for (var k in patch) this.st[k] = patch[k];
    this.stage.invalidate();
    return this;
  };
  GaugeBench.prototype.draw = function (ctx, w, hh) {
    var t = this.st.type;
    if (t === 'ruler') drawRuler(ctx, w, hh, this.st);
    else if (t === 'caliper') drawCaliper(ctx, w, hh, this.st);
    else if (t === 'micrometer') drawMicrometer(ctx, w, hh, this.st);
    else if (t === 'dynamometer') drawDynamometer(ctx, w, hh, this.st);
    else if (t === 'stopwatch') drawStopwatch(ctx, w, hh, this.st);
  };

  ML.gaugesView = {
    drawRuler: drawRuler, drawCaliper: drawCaliper, drawMicrometer: drawMicrometer,
    drawDynamometer: drawDynamometer, drawStopwatch: drawStopwatch, GaugeBench: GaugeBench
  };
})(window.ML = window.ML || {});
