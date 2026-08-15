/* 图纸专业度体检 (无需 LLM): 检测文字重叠/越界/符号过密
 * 用法: node tests/draw-lint.test.js
 * 输出每张图的文字重叠对数, 作为"专业度"客观指标 (目标 0) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
function load(name, win) { (new Function('window', fs.readFileSync(path.join(ROOT, 'js', name), 'utf8')))(win); }
const win = { SYM: null };
load('symbols.js', win); load('engine.js', win); load('layout.js', win);
['draw-arch.js','draw-wiring.js','draw-dual.js','draw-cooling.js','draw-thermal.js'].forEach(f => load(f, win));

const R = win.AIDC_ENGINE.build({ projName:'T', region:'上海', tier:'tier3', gpuType:'h100',
  gpuCount:800, itLoad:12000, voltage:'10', redundancy:'2n1', cooling:'liquid', pueTarget:1.25,
  rackPower:40, pricePeak:1.05, priceValley:0.35 });

function textWidth(s, fs) {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) > 0x2e80 ? fs : fs * 0.58);
  return w;
}
function extractTexts(svg) {
  const out = [];
  const re = /<text x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*?font-size="([\d.]+)"([^>]*)>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(svg))) {
    const x = +m[1], y = +m[2], fs = +m[3], attrs = m[4], raw = m[5].replace(/<[^>]+>/g, '');
    const w = textWidth(raw, fs);
    const anchor = /text-anchor="(middle|end)/.exec(attrs);
    let left = x; if (anchor && anchor[1] === 'middle') left = x - w / 2; else if (anchor && anchor[1] === 'end') left = x - w;
    out.push({ left, top: y - fs * 0.85, right: left + w, bottom: y + fs * 0.2, raw: raw.slice(0, 14), fs });
  }
  return out;
}
function overlaps(texts) {
  const bad = [];
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push([a.raw, b.raw]);
  }
  return bad;
}
const names = { drawArch:'系统架构图', drawWiring:'一次接线图', drawDual:'双路拓扑图', drawCooling:'液冷管路图', drawThermal:'热管理方案图' };
let total = 0;
for (const [fn, name] of Object.entries(names)) {
  const svg = win[fn](R);
  const bad = overlaps(extractTexts(svg));
  total += bad.length;
  console.log(`\n【${name}】文字重叠: ${bad.length} 处`);
  bad.slice(0, 12).forEach(p => console.log('   重叠: "' + p[0] + '" × "' + p[1] + '"'));
}
console.log('\n=== 总重叠数: ' + total + ' (专业目标: 0) ===');