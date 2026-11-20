/* ML.gauges — 力学基础仪器读数几何分解与错误诊断模型（无 DOM，Node 与浏览器通用，ES2019）。
 * 包含：毫米刻度尺(ruler)、游标卡尺(caliper)、螺旋测微器(micrometer)、弹簧测力计(dynamometer)、机械停表(stopwatch)。 */
(function (ML) {
  'use strict';

  function parseNum(str) {
    if (ML.math && ML.math.parseNum) return ML.math.parseNum(str);
    var s = String(str).trim().replace(/−/g, '-').replace(/\s/g, '');
    var m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))(?:[×x]10\^?([+-]?\d+))?$/);
    return m ? parseFloat(m[1]) * (m[2] ? Math.pow(10, parseInt(m[2], 10)) : 1) : NaN;
  }

  function decPlaces(str) {
    var s = String(str).trim().replace(/^[+−-]/, '').replace(/[×x]10\^?.*$/, '').replace(/\s/g, '');
    var dot = s.indexOf('.');
    if (dot < 0) return 0;
    return s.length - dot - 1;
  }

  function badInput(inputStr) {
    var trimmed = String(inputStr == null ? '' : inputStr).trim();
    if (!trimmed) return { ok: false, okVal: false, okSig: false, code: 'E_EMPTY', msg: '请输入读数', errorId: null };
    return { ok: false, okVal: false, okSig: false, code: 'E_FORMAT', msg: '输入格式有误，请检查小数点或科学计数法写法', errorId: null };
  }

  /* 1. 毫米刻度尺（最小分度 1 mm，估读到 0.1 mm / 0.01 cm） */
  var ruler = {
    decompose: function (lengthMm, startMm) {
      startMm = startMm == null ? 0 : +(+startMm).toFixed(1);
      lengthMm = +(+lengthMm).toFixed(1);
      var endMm = +(startMm + lengthMm).toFixed(1);
      return {
        startMm: startMm, endMm: endMm, lengthMm: lengthMm,
        mmStr: lengthMm.toFixed(1), cmStr: (lengthMm / 10).toFixed(2),
        endMmStr: endMm.toFixed(1), endCmStr: (endMm / 10).toFixed(2)
      };
    },
    diagnose: function (inputStr, lengthMm, opts) {
      opts = opts || {};
      var startMm = opts.startMm || 0, unit = opts.unit || 'cm', tolMm = opts.tolMm != null ? opts.tolMm : 0.15;
      var d = ruler.decompose(lengthMm, startMm);
      var v = parseNum(inputStr);
      if (!isFinite(v)) return badInput(inputStr);
      var dec = decPlaces(inputStr), wantDec = unit === 'cm' ? 2 : 1;
      var vMm = unit === 'cm' ? v * 10 : v;
      if (Math.abs(startMm) > 0.05 && Math.abs(vMm - d.endMm) <= tolMm + 0.05) {
        return {
          ok: false, okVal: false, okSig: dec === wantDec, code: 'E_RULER_ZERO', errorId: 'E7',
          msg: '物体左端在 ' + (unit === 'cm' ? (startMm / 10).toFixed(2) + ' cm' : startMm.toFixed(1) + ' mm') + ' 处，未减去起点刻度，直接读成了末端位置！'
        };
      }
      if (Math.abs(vMm - d.lengthMm * 10) <= tolMm * 10 || Math.abs(vMm * 10 - d.lengthMm) <= tolMm) {
        return { ok: false, okVal: false, okSig: false, code: 'E_UNIT', errorId: null, msg: '单位为 ' + unit + '（1 cm = 10 mm），数值相差 10 倍。' };
      }
      var okVal = Math.abs(vMm - d.lengthMm) <= tolMm + 1e-9;
      var nearVal = Math.abs(vMm - d.lengthMm) <= 1.0 + 1e-9;
      if (nearVal && dec < wantDec) {
        return {
          ok: false, okVal: okVal, okSig: false, code: 'E_RULER_EST', errorId: 'E4',
          msg: '毫米刻度尺必须估读到下一位（以 ' + unit + ' 为单位保留 ' + wantDec + ' 位小数，对齐整刻线也要补 0）。'
        };
      }
      if (nearVal && dec > wantDec) {
        return {
          ok: false, okVal: okVal, okSig: false, code: 'E_RULER_OVER', errorId: 'E4',
          msg: '毫米刻度尺只需估读到 0.1 mm（以 ' + unit + ' 为单位保留 ' + wantDec + ' 位小数），不要多估读。'
        };
      }
      if (okVal) return { ok: true, okVal: true, okSig: true, code: 'OK', msg: '读数正确！', errorId: null };
      return {
        ok: false, okVal: false, okSig: dec === wantDec, code: 'E_VAL', errorId: null,
        msg: '刻度位置与读数不符（参考 ' + (unit === 'cm' ? d.cmStr + ' cm' : d.mmStr + ' mm') + '），请用放大镜对齐核对。'
      };
    }
  };

  /* 2. 游标卡尺（10 / 20 / 50 分度，不估读） */
  var caliper = {
    decompose: function (valMm, div) {
      div = (div === 20 || div === 50) ? div : 10;
      var step = 1 / div;
      var steps = Math.round(valMm * div);
      var mmDecimals = div === 10 ? 1 : 2, cmDecimals = div === 10 ? 2 : 3;
      var q = +(steps / div).toFixed(mmDecimals);
      var mainMm = Math.floor(q + 1e-9);
      var k = steps - mainMm * div;
      return {
        div: div, step: step, q: q, mainMm: mainMm, k: k,
        mmDecimals: mmDecimals, cmDecimals: cmDecimals,
        mmStr: q.toFixed(mmDecimals), cmStr: (q / 10).toFixed(cmDecimals),
        frameEdgeMm: +(q - 2.0).toFixed(2),
        markPosMm: function (i) { return q + i * ((div - 1) / div); }
      };
    },
    diagnose: function (inputStr, valMm, opts) {
      opts = opts || {};
      var div = opts.div || 10, unit = opts.unit || 'mm';
      var d = caliper.decompose(valMm, div);
      var v = parseNum(inputStr);
      if (!isFinite(v)) return badInput(inputStr);
      var dec = decPlaces(inputStr), wantDec = unit === 'cm' ? d.cmDecimals : d.mmDecimals;
      var vMm = unit === 'cm' ? v * 10 : v;
      if (Math.abs(vMm - d.q * 10) < 0.05 || Math.abs(vMm * 10 - d.q) < 0.005) {
        return { ok: false, okVal: false, okSig: false, code: 'E_UNIT', errorId: 'E1', msg: '注意题目要求单位是 ' + unit + '（1 cm = 10 mm）。' };
      }
      if (Math.abs(vMm - (d.q - 2)) <= 0.15 || Math.abs(vMm - (Math.floor(d.frameEdgeMm) + d.k * d.step)) <= 0.05) {
        return {
          ok: false, okVal: false, okSig: dec === wantDec, code: 'E_CAL_EDGE', errorId: 'E2',
          msg: '把游标尺金属框左边缘当成了游标 0 刻线！主尺应看游标 0 刻线左侧最邻近的整毫米线。'
        };
      }
      if (div !== 10 && d.k > 0 && Math.abs(vMm - (d.mainMm + d.k * 0.1)) < 0.005) {
        return {
          ok: false, okVal: false, okSig: dec === wantDec, code: 'E_CAL_DIV', errorId: 'E1',
          msg: div + ' 分度游标卡尺每格精度是 ' + d.step + ' mm，不能按 0.1 mm 乘以对齐格数！'
        };
      }
      if (d.k > 0 && Math.abs(vMm - (d.mainMm + d.k)) < 0.05) {
        return {
          ok: false, okVal: false, okSig: dec === wantDec, code: 'E_CAL_DIV', errorId: 'E1',
          msg: '游标第 ' + d.k + ' 格对齐，应加 ' + d.k + ' × ' + d.step + ' mm = ' + (d.k * d.step).toFixed(d.mmDecimals) + ' mm，不能直接加格数。'
        };
      }
      var okVal = Math.abs(vMm - d.q) <= 1e-6 + 0.0005;
      if (dec > wantDec && Math.abs(vMm - d.q) <= d.step * 0.5 + 1e-6) {
        return {
          ok: false, okVal: okVal, okSig: false, code: 'E_CAL_EST', errorId: 'E1',
          msg: '游标卡尺不估读！' + div + ' 分度以 ' + unit + ' 为单位只能写 ' + wantDec + ' 位小数（应为 ' + (unit === 'cm' ? d.cmStr : d.mmStr) + '）。'
        };
      }
      if (okVal && dec < wantDec) {
        return {
          ok: false, okVal: true, okSig: false, code: 'E_CAL_PREC', errorId: 'E1',
          msg: '游标卡尺不估读，但精度末尾的 0 不能省略！' + div + ' 分度以 ' + unit + ' 为单位必须写足 ' + wantDec + ' 位小数（' + (unit === 'cm' ? d.cmStr : d.mmStr) + '）。'
        };
      }
      if (okVal && dec === wantDec) return { ok: true, okVal: true, okSig: true, code: 'OK', msg: '读数正确！', errorId: null };
      return {
        ok: false, okVal: false, okSig: dec === wantDec, code: 'E_VAL', errorId: null,
        msg: '主尺整毫米为 ' + d.mainMm + ' mm，游标第 ' + d.k + ' 条刻线对齐，应读 ' + (unit === 'cm' ? d.cmStr + ' cm' : d.mmStr + ' mm') + '。'
      };
    }
  };

  /* 3. 螺旋测微器（固定刻度 0.5 mm + 可动刻度 50 格 × 0.01 mm，估读到 0.001 mm） */
  var micrometer = {
    decompose: function (trueMm, zeroErrMm) {
      zeroErrMm = +(zeroErrMm || 0).toFixed(3);
      trueMm = +(+trueMm).toFixed(3);
      var dispMm = +(trueMm + zeroErrMm).toFixed(3);
      var halfCount = Math.floor((dispMm + 1e-9) / 0.5);
      var fixedMm = halfCount * 0.5;
      var halfExposed = (halfCount % 2) === 1;
      var thimble = +((dispMm - fixedMm) * 100).toFixed(1);
      return {
        trueMm: trueMm, zeroErrMm: zeroErrMm, dispMm: dispMm,
        fixedMm: fixedMm, wholeMm: Math.floor(fixedMm + 1e-9),
        halfExposed: halfExposed, thimble: thimble,
        dispStr: dispMm.toFixed(3), trueStr: trueMm.toFixed(3), cmStr: (trueMm / 10).toFixed(4)
      };
    },
    diagnose: function (inputStr, trueMm, opts) {
      opts = opts || {};
      var zeroErrMm = +(opts.zeroErrMm || 0).toFixed(3), unit = opts.unit || 'mm', tolMm = opts.tolMm != null ? opts.tolMm : 0.003;
      var d = micrometer.decompose(trueMm, zeroErrMm);
      var v = parseNum(inputStr);
      if (!isFinite(v)) return badInput(inputStr);
      var dec = decPlaces(inputStr), wantDec = unit === 'cm' ? 4 : 3;
      var vMm = unit === 'cm' ? v * 10 : v;
      if (Math.abs(vMm - d.trueMm * 10) <= tolMm * 10 || Math.abs(vMm * 10 - d.trueMm) <= tolMm) {
        return { ok: false, okVal: false, okSig: false, code: 'E_UNIT', errorId: null, msg: '注意单位是 ' + unit + '（1 cm = 10 mm）。' };
      }
      var dispU = unit === 'cm' ? (d.dispMm / 10).toFixed(4) + ' cm' : d.dispStr + ' mm';
      var trueU = unit === 'cm' ? d.cmStr + ' cm' : d.trueStr + ' mm';
      var zeroU = unit === 'cm'
        ? (zeroErrMm >= 0 ? '+' : '') + (zeroErrMm / 10).toFixed(4) + ' cm'
        : (zeroErrMm >= 0 ? '+' : '') + zeroErrMm.toFixed(3) + ' mm';
      if (Math.abs(zeroErrMm) > 1e-6) {
        if (Math.abs(vMm - d.dispMm) <= tolMm + 1e-9) {
          return {
            ok: false, okVal: false, okSig: dec === wantDec, code: 'E_MIC_ZERO', errorId: 'E5',
            msg: '未修正零点误差！真实值 = 测量示数 − 零误差 = ' + dispU + ' − (' + zeroU + ') = ' + trueU + '。'
          };
        }
        if (Math.abs(vMm - (d.dispMm + zeroErrMm)) <= tolMm + 1e-9) {
          return {
            ok: false, okVal: false, okSig: dec === wantDec, code: 'E_MIC_ZERO', errorId: 'E5',
            msg: '零误差正负号算反了！应为 测量示数 − 零误差 = ' + trueU + '。'
          };
        }
      }
      if (Math.abs(Math.abs(vMm - d.trueMm) - 0.5) <= tolMm + 1e-9) {
        return {
          ok: false, okVal: false, okSig: dec === wantDec, code: 'E_MIC_HALF', errorId: 'E3',
          msg: (vMm < d.trueMm ? '漏加了 0.5 mm 半毫米刻线！' : '半毫米刻线尚未露出，多加了 0.5 mm！') + '可结合可动刻度是否刚过 0 线判断。'
        };
      }
      var okVal = Math.abs(vMm - d.trueMm) <= tolMm + 1e-9;
      var nearVal = Math.abs(vMm - d.trueMm) <= 0.05 + 1e-9;
      if (nearVal && dec < wantDec) {
        return {
          ok: false, okVal: okVal, okSig: false, code: 'E_MIC_EST', errorId: 'E4',
          msg: '螺旋测微器必须估读到千分位（以 ' + unit + ' 为单位写足 ' + wantDec + ' 位小数，如 ' + (unit === 'cm' ? d.cmStr : d.trueStr) + '）。'
        };
      }
      if (nearVal && dec > wantDec) {
        return {
          ok: false, okVal: okVal, okSig: false, code: 'E_MIC_EST', errorId: 'E4',
          msg: '小数位数过多，螺旋测微器只需估读到 0.001 mm（以 ' + unit + ' 为单位保留 ' + wantDec + ' 位小数）。'
        };
      }
      if (okVal) return { ok: true, okVal: true, okSig: true, code: 'OK', msg: '读数正确！', errorId: null };
      return {
        ok: false, okVal: false, okSig: dec === wantDec, code: 'E_VAL', errorId: null,
        msg: '固定刻度 ' + d.fixedMm.toFixed(1) + ' mm，可动刻度 ' + d.thimble.toFixed(1) + ' 格，示数 ' + dispU + (zeroErrMm ? '，修正后 ' + trueU : '') + '。'
      };
    }
  };

  /* 4. 弹簧测力计（最小分度 0.1 N，估读到 0.01 N） */
  var dynamometer = {
    decompose: function (trueForceN, zeroOffsetN) {
      zeroOffsetN = +(zeroOffsetN || 0).toFixed(2);
      trueForceN = +(+trueForceN).toFixed(2);
      var dispN = +(trueForceN + zeroOffsetN).toFixed(2);
      return { trueForceN: trueForceN, zeroOffsetN: zeroOffsetN, dispN: dispN, dispStr: dispN.toFixed(2), trueStr: trueForceN.toFixed(2) };
    },
    diagnose: function (inputStr, trueForceN, opts) {
      opts = opts || {};
      var zeroOffsetN = +(opts.zeroOffsetN || 0).toFixed(2), tolN = opts.tolN != null ? opts.tolN : 0.02;
      var d = dynamometer.decompose(trueForceN, zeroOffsetN);
      var v = parseNum(inputStr);
      if (!isFinite(v)) return badInput(inputStr);
      var dec = decPlaces(inputStr);
      if (Math.abs(zeroOffsetN) > 1e-6) {
        if (Math.abs(v - d.dispN) <= tolN + 1e-9) {
          return {
            ok: false, okVal: false, okSig: dec === 2, code: 'E_DYN_ZERO', errorId: 'E5',
            msg: '弹簧测力计未调零（空载示数 ' + (zeroOffsetN >= 0 ? '+' : '') + zeroOffsetN.toFixed(2) + ' N），真实拉力应减去零误差得 ' + d.trueStr + ' N。'
          };
        }
        if (Math.abs(v - (d.dispN + zeroOffsetN)) <= tolN + 1e-9) {
          return {
            ok: false, okVal: false, okSig: dec === 2, code: 'E_DYN_ZERO', errorId: 'E5',
            msg: '零误差正负号算反了！真实拉力应为 测量示数 − 零误差 = ' + d.trueStr + ' N。'
          };
        }
      }
      var okVal = Math.abs(v - d.trueForceN) <= tolN + 1e-9;
      var nearVal = Math.abs(v - d.trueForceN) <= 0.15 + 1e-9;
      if (nearVal && dec < 2) {
        return {
          ok: false, okVal: okVal, okSig: false, code: 'E_DYN_EST', errorId: 'E4',
          msg: '最小分度 0.1 N 的弹簧测力计必须估读到 0.01 N（保留 2 位小数，如 ' + d.trueStr + ' N）。'
        };
      }
      if (nearVal && dec > 2) {
        return { ok: false, okVal: okVal, okSig: false, code: 'E_DYN_EST', errorId: 'E4', msg: '只需估读到 0.01 N（保留 2 位小数）。' };
      }
      if (okVal) return { ok: true, okVal: true, okSig: true, code: 'OK', msg: '读数正确！', errorId: null };
      return {
        ok: false, okVal: false, okSig: dec === 2, code: 'E_VAL', errorId: null,
        msg: '请看清 0.1 N 刻度并估读一位（参考 ' + d.trueStr + ' N）。'
      };
    }
  };

  /* 5. 机械停表（小盘 0-15 min，大盘 0-30 s/圈，分度 0.1 s，不估读） */
  var stopwatch = {
    decompose: function (totalSec) {
      var q = +(Math.round(totalSec * 10) / 10).toFixed(1);
      var minInt = Math.floor((q + 1e-9) / 60);
      var remSec = +(q - minInt * 60).toFixed(1);
      var halfPassed = remSec >= 30.0 - 1e-9;
      var handSec = +(halfPassed ? remSec - 30 : remSec).toFixed(1);
      return {
        totalSec: q, minInt: minInt, remSec: remSec, halfPassed: halfPassed,
        handSec: handSec, secStr: q.toFixed(1), minPos: +(q / 60).toFixed(3)
      };
    },
    diagnose: function (inputStr, totalSec, opts) {
      void opts;
      var d = stopwatch.decompose(totalSec);
      var v = parseNum(inputStr);
      if (!isFinite(v)) return badInput(inputStr);
      var dec = decPlaces(inputStr);
      if (Math.abs(Math.abs(v - d.totalSec) - 30) <= 0.15) {
        return {
          ok: false, okVal: false, okSig: dec === 1, code: 'E_SW_HALF', errorId: 'E6',
          msg: d.halfPassed ? '小表盘分针已过半分钟线，大表盘应读 30～60 s 内圈（需要加 30 s）！' : '小表盘分针未过半分钟线，大表盘应读 0～30 s 外圈（不应加 30 s）！'
        };
      }
      if (d.minInt >= 1) {
        var bad100 = d.minInt * 100 + d.remSec, badDec = d.minInt + d.remSec / 100;
        if (Math.abs(v - bad100) <= 0.2 || Math.abs(v - badDec) <= 0.005) {
          return { ok: false, okVal: false, okSig: false, code: 'E_SW_MIN', errorId: 'E6', msg: '1 min = 60 s（六十进制），不能按百进制把分和秒直接拼起来！' };
        }
      }
      var okVal = Math.abs(v - d.totalSec) <= 0.05;
      if (okVal && dec > 1) {
        return { ok: false, okVal: true, okSig: false, code: 'E_SW_PREC', errorId: 'E1', msg: '机械停表不估读！最小分度 0.1 s，保留 1 位小数即可。' };
      }
      if (okVal && dec < 1) {
        return { ok: false, okVal: true, okSig: false, code: 'E_SW_PREC', errorId: 'E1', msg: '机械停表精度为 0.1 s，整数秒也要写到十分位（如 ' + d.secStr + ' s）。' };
      }
      if (okVal && dec === 1) return { ok: true, okVal: true, okSig: true, code: 'OK', msg: '读数正确！', errorId: null };
      return {
        ok: false, okVal: false, okSig: dec === 1, code: 'E_VAL', errorId: null,
        msg: '小表盘在 ' + d.minInt + ' min' + (d.halfPassed ? '半过' : '未过半') + '，大表盘应读 ' + d.remSec.toFixed(1) + ' s，总计 ' + d.secStr + ' s。'
      };
    }
  };

  ML.gauges = {
    ruler: ruler, caliper: caliper, micrometer: micrometer,
    dynamometer: dynamometer, stopwatch: stopwatch,
    parseNum: parseNum, decPlaces: decPlaces
  };
})(typeof window !== 'undefined' ? (window.ML = window.ML || {}) : (globalThis.ML = globalThis.ML || {}));
