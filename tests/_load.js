/* 测试用引擎加载器：按浏览器依赖顺序把 engine/ 模块注入同一个 window 沙箱 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ORDER = ['color-scheme.js', 'symbols.js', 'ev-standards.js', 'component-library.js',
  'connector-library.js', 'placement.js', 'router.js', 'design-model.js', 'drawing-skill.js', 'vendors.js',
  'engine.js', 'layout.js', 'draw-pile.js'];

function load(skip) {
  const win = {};
  ORDER.filter((n) => !(skip || []).includes(n)).forEach((n) => {
    const src = fs.readFileSync(path.join(ROOT, 'engine', n), 'utf8').replace(/^﻿/, '');
    (new Function('window', 'document', src))(win, {});
  });
  return win;
}

const BASE = Object.freeze({
  pileName: '测试桩', site: '上海', standard: 'gb', outputKw: 240, gunCount: 2,
  gunCurrentA: 250, moduleKw: 40, voltageWindow: '200-1000', thermal: 'liquid',
  essEnabled: true, essKwh: 200, essPowerKw: 120, essCoupling: 'dc'
});
const build = (win, over) => win.EVSE_ENGINE.build(Object.assign({}, BASE, over || {}));

/* 与 drawing-skill.unhoppedCrossings 同口径的独立实现：
 * 测试必须独立于被测代码，否则两边一起错也测不出来。 */
function unhopped(text) {
  const lines = [];
  for (const m of String(text).matchAll(/<line\s+([^>]*?)\/>/g)) {
    const a = (n) => { const h = new RegExp(n + '="([^"]*)"').exec(m[1]); return h ? Number(h[1]) : null; };
    const w = a('stroke-width');
    if (w != null && w <= 0.95) continue;
    lines.push({ x1: a('x1'), y1: a('y1'), x2: a('x2'), y2: a('y2') });
  }
  const hops = [];
  for (const m of String(text).matchAll(/<path d="M([\d.]+),([\d.]+) A\d+,\d+ 0 0,1 \1,([\d.]+)"/g)) {
    hops.push({ x: +m[1], y: (+m[2] + +m[3]) / 2 });
  }
  for (const m of String(text).matchAll(/<path d="M([\d.]+),([\d.]+) A\d+,\d+ 0 0,1 ([\d.]+),\2"/g)) {
    hops.push({ x: (+m[1] + +m[3]) / 2, y: +m[2] });
  }
  const bad = [];
  const V = lines.filter((L) => L.x1 === L.x2 && L.y1 !== L.y2);
  const H = lines.filter((L) => L.y1 === L.y2 && L.x1 !== L.x2);
  for (const v of V) for (const h of H) {
    const x = v.x1, y = h.y1;
    if (!(y > Math.min(v.y1, v.y2) + 2 && y < Math.max(v.y1, v.y2) - 2)) continue;
    if (!(x > Math.min(h.x1, h.x2) + 2 && x < Math.max(h.x1, h.x2) - 2)) continue;
    if (!hops.some((p) => Math.abs(p.x - x) < 2 && Math.abs(p.y - y) < 2)) bad.push(x + ',' + y);
  }
  return bad;
}

module.exports = { load, build, BASE, unhopped, ROOT };
