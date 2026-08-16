/* ============================================================
 * 设备素材库 assetlib.js — 三层注册表, 语义 key 调用
 *   光栅层 img  : assets/ 真实产品图 (形象/汇报)
 *   矢量层 vec  : 内联 glyph (pictograms.js, 清晰/可变色)
 *   符号层 sym  : SYM 工程符号 (冷水机/冷却塔/泵/阀/水箱/板换/传感器)
 * 用法: ASSET.draw(key,x,y,w,h,color)  ASSET.setMode('image'|'vector')
 * 增补: REG 加一行即可; ASSET.preview() 生成素材库总览图
 * ============================================================ */
window.ASSET = (function () {
  'use strict';
  const REG = {
    /* --- 光栅产品图 --- */
    battery_pack:   { img: 'assets/battery_pack.png',   vec: 'battery',     label: '电池包' },
    battery_alt:    { img: 'assets/battery_pack_alt.png', vec: 'battery',   label: '电池包(侧)' },
    transformer:    { img: 'assets/transformer.png',    vec: 'transformer', label: '变压器' },
    charging_pile:  { img: 'assets/charging_pile.png',  vec: 'pdu',         label: '充电桩' },
    pcs_inverter:   { img: 'assets/pcs_inverter.png',   vec: 'dcac',        label: 'PCS/逆变器' },
    ess_cabinet:    { img: 'assets/ess_cabinet.jpeg',   vec: 'ups',         label: '储能柜' },
    home_storage:   { img: 'assets/home_storage.jpeg',  vec: 'battery',     label: '户用储能' },
    portable_power: { img: 'assets/portable_power.png', vec: 'battery',     label: '便携电源' },
    inverter_alt:   { img: 'assets/inverter_alt.png',   vec: 'dcac',        label: '逆变器(另)' },
    micro_inverter: { img: 'assets/micro_inverter.jpeg', vec: 'dcac',       label: '微逆' },
    /* --- 矢量 glyph --- */
    ups: { vec: 'ups', label: 'UPS' }, breaker: { vec: 'breaker', label: '断路器' },
    ems: { vec: 'ems', label: 'EMS' }, meter: { vec: 'meter', label: '电表' },
    acdc: { vec: 'acdc', label: 'AC/DC' }, dcac: { vec: 'dcac', label: 'DC/DC' },
    pdu: { vec: 'pdu', label: 'PDU' }, pv: { vec: 'pv', label: '光伏板' }, pv_sun: { vec: 'pv_sun', label: '光伏(太阳)' },
    /* --- SYM 工程符号 (冷水机/冷却塔/泵等) --- */
    chiller:      { sym: 'chiller', label: '冷水机' },
    cooling_tower:{ sym: 'cooling_tower', label: '冷却塔' },
    pump:         { sym: 'pump', label: '循环泵' },
    valve:        { sym: 'valve', label: '调节阀' },
    tank:         { sym: 'tank', label: '水箱/膨胀罐' },
    plate_hx:     { sym: 'plate_hx', label: '板式换热器' },
    sensor:       { sym: 'sensor', label: '传感器' }
  };
  let mode = 'vector';
  const imgTag = (e, x, y, w, h) => `<image href="${e.img}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
  function symDraw(fn, x, y, w, h, color) {
    const S = window.SYM; if (!S) return '';
    switch (fn) {
      case 'chiller': return S.chiller(x, y, w, h, color, '', '');
      case 'cooling_tower': return S.tower(x, y, w, h, color, '', '');
      case 'pump': return S.pump(x, y, color, '');
      case 'valve': return S.valve(x + w / 2, y, color, '');
      case 'tank': return S.tank(x, y, color, '', '');
      case 'plate_hx': return S.hx(x, y, color, '', '');
      case 'sensor': return S.sensor(x + w / 2, y, color, 'T', '');
    }
    return '';
  }
  function draw(key, x, y, w, h, color) {
    const e = REG[key]; if (!e) return '';
    if (mode === 'image' && e.img) return imgTag(e, x, y, w, h);
    if (e.sym) return symDraw(e.sym, x, y, w, h, color);
    if (e.vec && window.PIC) return window.PIC.draw(e.vec, x, y, w, h, color);
    if (e.img) return imgTag(e, x, y, w, h);
    return '';
  }
  /* 素材库总览图 */
  function preview() {
    const keys = Object.keys(REG), cols = 5, cw = 160, ch = 110;
    const rows = Math.ceil(keys.length / cols);
    const W = cols * cw + 40, H = rows * ch + 70;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>
      <text x="20" y="30" font-size="16" font-weight="bold" fill="#0f172a">设备素材库 (${keys.length} 项) · 矢量/光栅/符号 三层</text>`;
    keys.forEach((k, i) => {
      const x = 20 + (i % cols) * cw, y = 50 + Math.floor(i / cols) * ch;
      s += `<rect x="${x}" y="${y}" width="${cw - 14}" height="${ch - 22}" rx="6" fill="#f8fafc" stroke="#cbd5e1"/>`;
      s += draw(k, x + (cw - 14) / 2 - 32, y + 8, 64, 52, '#334155');
      s += `<text x="${x + (cw - 14) / 2}" y="${y + ch - 30}" text-anchor="middle" font-size="9.5" fill="#334155">${k} · ${REG[k].label || ''}</text>`;
    });
    return s + '</svg>';
  }
  return { REG, draw, preview, setMode: (m) => { mode = m; }, getMode: () => mode };
})();