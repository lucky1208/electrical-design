/* ============================================================
 * 设备素材库 assetlib.js — 双层注册表 (矢量 glyph + 光栅产品图)
 * ------------------------------------------------------------
 * 用法: ASSET.draw('battery', x,y,w,h, color)  按当前模式返回 SVG
 *   模式 'vector' → 内联矢量 glyph (清晰/可变色/自包含, CAD 用)
 *   模式 'image'  → 真实产品图 <image> (形象/汇报用)
 * 增补库: 在 REG 里加一行 {vec:图标key, img:'assets/x.png'} 即可
 * ============================================================ */
window.ASSET = (function () {
  'use strict';
  const REG = {
    battery:       { vec: 'battery',     img: 'assets/battery_pack.png' },
    transformer:   { vec: 'transformer', img: 'assets/transformer.png' },
    charging_pile: { vec: 'pdu',         img: 'assets/charging_pile.png' },
    pcs:           { vec: 'dcac',        img: 'assets/pcs_inverter.png' },
    ess_cabinet:   { vec: 'ups',         img: 'assets/ess_cabinet.jpeg' },
    ups:           { vec: 'ups' }, breaker: { vec: 'breaker' }, ems: { vec: 'ems' },
    meter:         { vec: 'meter' }, acdc: { vec: 'acdc' }, dcac: { vec: 'dcac' },
    pdu:           { vec: 'pdu' }, pv: { vec: 'pv' }
  };
  let mode = 'vector';
  const img = (e, x, y, w, h) => `<image href="${e.img}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
  function draw(key, x, y, w, h, color) {
    const e = REG[key]; if (!e) return '';
    if (mode === 'image' && e.img) return img(e, x, y, w, h);
    if (window.PIC && e.vec) return window.PIC.draw(e.vec, x, y, w, h, color);
    if (e.img) return img(e, x, y, w, h);
    return '';
  }
  return { REG, draw, setMode: (m) => { mode = m; }, getMode: () => mode };
})();