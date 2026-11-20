// M00 仪器读数与错误诊断校验：node verify.mjs（无依赖）。对应 SPEC §4。
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const core = path.join(here, '..', '..', 'core');
for (const f of ['math.js', 'physics.js', 'paper.js', 'instruments/gauges-model.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(core, f), 'utf8'), { filename: f });
}
const { gauges: G, math } = globalThis.ML;
let fails = 0;
const check = (name, ok, info) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) fails++;
};

// 1. 游标卡尺 10/20/50 分度分解与诊断
{
  const d10 = G.caliper.decompose(19.0, 10);
  const d20 = G.caliper.decompose(10.0, 20);
  const d50 = G.caliper.decompose(41.08, 50);
  check('1a 游标分解：10/20/50 分度精确格式化',
    d10.mmStr === '19.0' && d20.mmStr === '10.00' && d50.cmStr === '4.108' && d50.k === 4,
    `${d10.mmStr} / ${d20.mmStr} / ${d50.cmStr} (k=${d50.k})`);

  check('1b 游标正确读数通过', G.caliper.diagnose('19.0', 19.0, { div: 10, unit: 'mm' }).ok);
  check('1c 游标多估读报错 E_CAL_EST', G.caliper.diagnose('19.00', 19.0, { div: 10, unit: 'mm' }).code === 'E_CAL_EST');
  check('1d 游标漏末尾0报错 E_CAL_PREC', G.caliper.diagnose('10.0', 10.0, { div: 20, unit: 'mm' }).code === 'E_CAL_PREC');
  check('1e 游标误读框边缘报错 E_CAL_EDGE', G.caliper.diagnose('8.35', 10.35, { div: 20, unit: 'mm' }).code === 'E_CAL_EDGE');
  check('1f 游标分度精度算错报错 E_CAL_DIV', G.caliper.diagnose('6.2', 6.04, { div: 50, unit: 'mm' }).code === 'E_CAL_DIV');
  check('1g 游标单位错10倍报错 E_UNIT', G.caliper.diagnose('41.08', 41.08, { div: 50, unit: 'cm' }).code === 'E_UNIT');
}

// 2. 螺旋测微器半毫米线边界与零误差诊断
{
  const m1 = G.micrometer.decompose(6.860, 0);
  const m2 = G.micrometer.decompose(7.415, 0);
  const m3 = G.micrometer.decompose(6.995, 0);
  const m4 = G.micrometer.decompose(7.000, 0);
  const m5 = G.micrometer.decompose(2.207, 0);
  const mZ = G.micrometer.decompose(1.500, 0.020);
  const mNeg = G.micrometer.decompose(1.260, -0.015);
  check('2a 螺旋测微器半毫米露出边界判定',
    m1.halfExposed === true && m2.halfExposed === false && m3.halfExposed === true && m4.halfExposed === false && m5.halfExposed === false && mZ.dispStr === '1.520' && mNeg.dispStr === '1.245',
    `6.860:${m1.halfExposed} 7.415:${m2.halfExposed} 6.995:${m3.halfExposed} 7.000:${m4.halfExposed} 2.207:${m5.halfExposed}`);
  check('2b 螺旋测微器正确读数与估读检查',
    G.micrometer.diagnose('8.260', 8.260, { unit: 'mm' }).ok &&
    G.micrometer.diagnose('2.207', 2.207, { unit: 'mm' }).ok &&
    G.micrometer.diagnose('8.26', 8.260, { unit: 'mm' }).code === 'E_MIC_EST');
  check('2c 半毫米错判识别 E_MIC_HALF', G.micrometer.diagnose('7.915', 7.415, { unit: 'mm' }).code === 'E_MIC_HALF');
  check('2d 未修零误差（含正负零误差）识别 E_MIC_ZERO',
    G.micrometer.diagnose('1.520', 1.500, { zeroErrMm: 0.020, unit: 'mm' }).code === 'E_MIC_ZERO' &&
    G.micrometer.diagnose('1.500', 1.500, { zeroErrMm: 0.020, unit: 'mm' }).ok &&
    G.micrometer.diagnose('1.245', 1.260, { zeroErrMm: -0.015, unit: 'mm' }).code === 'E_MIC_ZERO' &&
    G.micrometer.diagnose('1.260', 1.260, { zeroErrMm: -0.015, unit: 'mm' }).ok);
}

// 3. 毫米刻度尺非零起点与估读
{
  check('3a 刻度尺 1.90 cm 正确、1.9 漏估读、1.900 多估读',
    G.ruler.diagnose('1.90', 19.0, { unit: 'cm' }).ok &&
    G.ruler.diagnose('1.9', 19.0, { unit: 'cm' }).code === 'E_RULER_EST' &&
    G.ruler.diagnose('1.900', 19.0, { unit: 'cm' }).code === 'E_RULER_OVER');
  check('3b 非零起点未相减识别 E_RULER_ZERO',
    G.ruler.diagnose('3.45', 24.5, { startMm: 10.0, unit: 'cm' }).code === 'E_RULER_ZERO' &&
    G.ruler.diagnose('2.45', 24.5, { startMm: 10.0, unit: 'cm' }).ok);
}

// 4. 弹簧测力计
{
  check('4 测力计 3.70 N 正确、3.7 漏估读、未调零及反号识别 E_DYN_ZERO、离谱数值报 E_VAL',
    G.dynamometer.diagnose('3.70', 3.70).ok &&
    G.dynamometer.diagnose('3.7', 3.70).code === 'E_DYN_EST' &&
    G.dynamometer.diagnose('3.80', 3.70, { zeroOffsetN: 0.10 }).code === 'E_DYN_ZERO' &&
    G.dynamometer.diagnose('3.90', 3.70, { zeroOffsetN: 0.10 }).code === 'E_DYN_ZERO' &&
    G.dynamometer.diagnose('1', 3.70).code === 'E_VAL' &&
    G.ruler.diagnose('1.90.', 19.0, { unit: 'cm' }).code === 'E_FORMAT');
}

// 5. 机械停表半分钟刻线与六十进制
{
  const s1 = G.stopwatch.decompose(24.0), s2 = G.stopwatch.decompose(54.0), s3 = G.stopwatch.decompose(78.4);
  check('5a 停表分解：<30s vs >=30s vs >60s',
    s1.halfPassed === false && s1.handSec === 24.0 &&
    s2.halfPassed === true && s2.handSec === 24.0 &&
    s3.minInt === 1 && s3.halfPassed === false && s3.handSec === 18.4,
    `54.0→hand=${s2.handSec},half=${s2.halfPassed}; 78.4→min=${s3.minInt},hand=${s3.handSec}`);
  check('5b 停表差30s识别 E_SW_HALF、百进制识别 E_SW_MIN、多估读识别 E_SW_PREC',
    G.stopwatch.diagnose('54.0', 54.0).ok &&
    G.stopwatch.diagnose('24.0', 54.0).code === 'E_SW_HALF' &&
    G.stopwatch.diagnose('118.4', 78.4).code === 'E_SW_MIN' &&
    G.stopwatch.diagnose('54.00', 54.0).code === 'E_SW_PREC');
}

// 6. questions.json 有效数字与答案自洽
{
  const qs = JSON.parse(fs.readFileSync(path.join(here, 'questions.json'), 'utf8'));
  const bad = [];
  for (const q of qs) {
    if (!q.verified) continue;
    for (const [i, pt] of q.parts.entries()) {
      if (pt.type === 'numeric') {
        const ref = String(pt.show != null ? pt.show : (pt.sig ? math.sig(pt.answer, pt.sig) : pt.answer));
        const v = math.parseNum(ref), tol = pt.tol != null ? pt.tol : Math.abs(pt.answer) * 0.01;
        if (!isFinite(v) || Math.abs(v - pt.answer) > tol + 1e-12) bad.push(`${q.id}(${i + 1}) val`);
        if (pt.sig && math.countSig(ref) !== pt.sig) bad.push(`${q.id}(${i + 1}) sig`);
      }
    }
  }
  check('6 questions.json 全部题目有效数字与答案自洽', bad.length === 0, bad.join('; ') || `共校验 ${qs.length} 题`);
}

console.log(fails ? `\n${fails} 项未通过` : '\n全部通过');
process.exit(fails ? 1 : 0);
