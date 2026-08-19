/* 图面体检：文字重叠 / 越出图框: node tests/draw-lint.test.js */
'use strict';
const assert = require('assert');
const { load, build } = require('./_load.js');
const win = load();

function textWidth(v, size) {
  let w = 0;
  for (const ch of v) w += (ch.codePointAt(0) > 0x2e80 ? size : size * 0.58);
  return w;
}
/* 解析整个 <text> 标签属性，不依赖属性书写顺序 */
function extract(svg) {
  const out = [];
  const attr = (src, n) => { const h = new RegExp(n + '="([^"]*)"').exec(src); return h ? h[1] : null; };
  for (const m of String(svg).matchAll(/<text\s+([^>]*?)>([\s\S]*?)<\/text>/g)) {
    const a = m[1], raw = m[2].replace(/<[^>]+>/g, '');
    /* 水印是半透明衬底层（data-watermark），按设计就压在正文下面，不参与重叠判定 */
    if (/data-watermark="1"/.test(a)) continue;
    const x = Number(attr(a, 'x')), y = Number(attr(a, 'y')), size = Number(attr(a, 'font-size'));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || !raw) continue;
    const w = textWidth(raw, size);
    const anchor = attr(a, 'text-anchor');
    let left = x;
    if (anchor === 'middle') left = x - w / 2; else if (anchor === 'end') left = x - w;
    out.push({ left, top: y - size * 0.85, right: left + w, bottom: y + size * 0.2, raw: raw.slice(0, 16), y });
  }
  return out;
}
const FRAME = { left: 14, top: 14, right: 1666, bottom: 1174 };
const CASES = [
  ['国标单枪 60kW 无储能', { standard: 'gb', outputKw: 60, gunCount: 1, gunCurrentA: 125, moduleKw: 20, thermal: 'air', essEnabled: false }],
  ['国标四枪 480kW 储能直流耦合', { standard: 'gb', outputKw: 480, gunCount: 4, gunCurrentA: 250, essEnabled: true, essCoupling: 'dc' }],
  ['欧标双枪 360kW 储能交流耦合', { standard: 'eu', outputKw: 360, gunCount: 2, gunCurrentA: 300, essEnabled: true, essCoupling: 'ac', essKwh: 500, essPowerKw: 250 }],
  ['美标四枪 600kW 液冷储能', { standard: 'us', outputKw: 600, gunCount: 4, gunCurrentA: 400, moduleKw: 60, essEnabled: true, essKwh: 1000 }],
  ['国标三枪 480kW 高压平台无储能', { standard: 'gb', outputKw: 480, gunCount: 3, voltageWindow: '500-1000', essEnabled: false }]
];
let overlapTotal = 0, outsideTotal = 0;
for (const [name, over] of CASES) {
  const texts = extract(win.drawPile(build(win, over)));
  const bad = [];
  for (let i = 0; i < texts.length; i += 1) for (let j = i + 1; j < texts.length; j += 1) {
    const a = texts[i], b = texts[j];
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push([a.raw, b.raw]);
  }
  const outside = texts.filter((t) => t.left < FRAME.left || t.right > FRAME.right || t.top < FRAME.top || t.bottom > FRAME.bottom);
  overlapTotal += bad.length; outsideTotal += outside.length;
  console.log(`【${name}】文字 ${texts.length} · 重叠 ${bad.length} · 越界 ${outside.length}`);
  bad.slice(0, 5).forEach((p) => console.log(`   重叠: "${p[0]}" × "${p[1]}"`));
  outside.slice(0, 5).forEach((t) => console.log(`   越界: "${t.raw}" @${Math.round(t.left)},${Math.round(t.y)}`));
  assert.ok(texts.length > 120, name + ' 文本数异常少，图纸可能未完整渲染');
}
console.log(`\n总重叠 ${overlapTotal} · 总越界 ${outsideTotal}（目标 0 / 0）`);
assert.strictEqual(overlapTotal, 0, '图纸文字重叠必须为 0');
assert.strictEqual(outsideTotal, 0, '图纸文字不得越出 A3 图框');
