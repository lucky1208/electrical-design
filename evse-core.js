/* ============================================================
 * EVSE-SCHEMATIC CORE v2.0 —— pin 级符号库 + 引脚级网表生成器
 * ------------------------------------------------------------
 * 与 1.1.0 引擎的关系：
 *   1.1.0 的 design-model.js 端口是"功能端口"（in/out/coil/control），
 *   一个 control 端口同时承载 CC1/CC2/S+/S- 四路信号 —— 无法表达
 *   "哪根 PIN 出来进到哪根 PIN"。本文件把端口细化到**物理端子**：
 *   每个器件声明带端子号(n)、端子名(name)、坐标(x,y)、外向方向(d)、
 *   能量域(k)、电气方向(t) 的 pin，网表的每一条都是 pin→pin。
 *
 * 符号几何参考 IEC 60617 / GB/T 4728 的画法约定（开关类器件在固定
 * 触头端加功能标记：隔离开关=垂直短横，断路器=×，接触器=半圆∪；
 * 熔断器=矩形加贯穿导线，进线侧粗实线；变换器=矩形加对角线，
 * 交流侧∼、直流侧=）。本库是**工程画法库**，不是标准符合性证明。
 * ============================================================ */
window.EVSE_CORE = (function () {
  let RAILS = {};
  'use strict';

  const VERSION = '2.1.0';
  const GRID = 10;
  const ERC_PIN_TYPES = ['unclassified', 'passive', 'input', 'output', 'bidirectional', 'power_input', 'power_output', 'power_bidirectional', 'no_connect'];

  /* ---------- 能量域 / 网络类别（线型、线宽、颜色） ---------- */
  const NETC = {
    AC:   { id: 'AC',   name: '交流主回路',        color: '#1F5FC0', w: 2.0 },
    DC:   { id: 'DC',   name: '充电直流主回路',     color: '#D42A2A', w: 2.0 },
    ESS:  { id: 'ESS',  name: '储能直流回路',       color: '#E08600', w: 2.0 },
    AUX:  { id: 'AUX',  name: '辅助直流 24V/12V',   color: '#0E8F9F', w: 1.2 },
    CTL:  { id: 'CTL',  name: '控制/采样信号',      color: '#5A6473', w: 0.9 },
    COMM: { id: 'COMM', name: '通信总线',          color: '#7B3FE4', w: 0.9 },
    SAF:  { id: 'SAF',  name: '安全联锁回路',       color: '#C81E78', w: 1.2 },
    PE:   { id: 'PE',   name: '保护接地 PE',        color: '#17A34A', w: 1.6 }
  };

  /* ---------- 绘图基元 ----------
   * ['L',x1,y1,x2,y2,w?]   实线
   * ['D',x1,y1,x2,y2]      虚线（机械联动/内部关联）
   * ['R',x,y,w,h,r?]       矩形
   * ['C',cx,cy,r]          圆
   * ['CF',cx,cy,r]         实心圆（连接点）
   * ['A',cx,cy,r,a0,a1]    圆弧（度，y 向下）
   * ['P',d]                路径
   * ['T',x,y,s,size?,anchor?,style?] 文本
   * ['M',x,y,w,h]          遮罩块（底色，用于跨线断口）
   */
  const P = (n, name, x, y, d, k, t, len, ercType, ercStatus, ercSourceId) => ({
    n: n, name: name, x: x, y: y, d: d, k: k, t: t || 'pas', len: len == null ? 8 : len,
    ercType: ERC_PIN_TYPES.indexOf(ercType) > 0 ? ercType : 'unclassified',
    ercStatus: ERC_PIN_TYPES.indexOf(ercType) > 0 ? (ercStatus || 'modeled') : 'unknown',
    ercSourceId: ercSourceId || null
  });

  function normalizeElectrical(e) {
    const src = e && typeof e === 'object' ? e : {};
    const ratings = src.ratings && typeof src.ratings === 'object' ? src.ratings : {};
    return {
      schema: 'evse-device-electrical/v1',
      status: ['unknown', 'assumption', 'verified'].indexOf(src.status) >= 0 ? src.status : 'unknown',
      manufacturer: String(src.manufacturer || ''), model: String(src.model || ''),
      ratings: Object.assign({}, ratings), sourceId: src.sourceId || null,
      sourceRevision: String(src.sourceRevision || ''), note: String(src.note || '')
    };
  }

  function acGlyph(cx, cy, s) { return ['P', 'M ' + (cx - s) + ' ' + cy + ' q ' + (s / 2) + ' ' + (-s * 0.8) + ' ' + s + ' 0 q ' + (s / 2) + ' ' + (s * 0.8) + ' ' + s + ' 0']; }
  function dcGlyph(cx, cy, s) { return [['L', cx - s, cy - 3, cx + s, cy - 3], ['D', cx - s, cy + 3, cx + s, cy + 3]]; }

  /* ============================================================
   * 1. 开关类器件：makeSwitch(n极, 标记, 带线圈)
   * ============================================================ */
  const PHASE4 = ['L1', 'L2', 'L3', 'N'];
  function makeSwitch(opt) {
    const n = opt.poles, pitch = opt.pitch || 26, mk = opt.marker;
    const names = opt.names || (n === 4 ? PHASE4 : n === 3 ? ['L1', 'L2', 'L3'] : n === 2 ? ['DC+', 'DC-'] : ['1']);
    const k = opt.k || 'AC';
    const d = [], pins = [];
    for (let i = 0; i < n; i++) {
      const x = i * pitch;
      d.push(['L', x, 8, x, 16], ['L', x, 44, x, 52], ['L', x, 44, x + 9, 22], ['CF', x, 44, 1.7]);
      if (mk === 'iso') d.push(['L', x - 7, 16, x + 7, 16]);
      else if (mk === 'cb') d.push(['L', x - 5, 11, x + 5, 21], ['L', x - 5, 21, x + 5, 11]);
      else if (mk === 'km') d.push(['A', x, 19, 5, 0, 180]);
      else if (mk === 'ls') d.push(['L', x - 7, 16, x + 7, 16], ['A', x, 19, 5, 0, 180]);
      pins.push(P(String(2 * i + 1), names[i], x, 0, 'N', k, 'in', 8, 'passive'));
      pins.push(P(String(2 * i + 2), names[i], x, 60, 'S', k, 'out', 8, 'passive'));
    }
    if (n > 1) d.push(['D', 4.5, 33, (n - 1) * pitch + 4.5, 33]);
    let w = (n - 1) * pitch;
    if (opt.coil) {
      const cx = w + 34;
      d.push(['D', (n - 1) * pitch + 4.5, 28, cx - 11, 28]);
      d.push(['R', cx - 11, 18, 22, 20], ['L', cx, 8, cx, 18], ['L', cx, 38, cx, 52]);
      /* V-DRV-01：线圈必须画续流/钳位回路（阴极朝 A1 正端） */
      d.push(['L', cx, 12, cx + 20, 12], ['L', cx + 20, 12, cx + 20, 48], ['L', cx, 48, cx + 20, 48]);
      d.push(['P', 'M ' + (cx + 15) + ' 36 l 10 0 l -5 -9 z'], ['L', cx + 15, 27, cx + 25, 27]);
      pins.push(P('A1', 'A1', cx, 0, 'N', 'CTL', 'in', 8, 'passive'));
      pins.push(P('A2', 'A2', cx, 60, 'S', 'CTL', 'in', 8, 'passive'));
      w = cx + 25;
    }
    return { w: w, h: 60, draw: d, pins: pins, isSwitch: true, hasCoil: !!opt.coil, coilDiode: !!opt.coil, noCross: true, tagAt: { x: -16, y: 4, a: 'e' } }; /* V13: isSwitch 供通电仿真识别 */
  }

  /* ============================================================
   * 2. 熔断器 / 电阻
   * ============================================================ */
  function makeFuse(opt) {
    opt = opt || {};
    const k = opt.k || 'DC';
    const d = [['L', 0, 8, 0, 52], ['R', -6, 18, 12, 24]];
    if (opt.fast !== false) d.push(['L', -6, 21, 6, 21, 2.4]);
    return {
      w: 0, h: 60, draw: d, tagAt: { x: -13, y: 26, a: 'e' },
      pins: [P('1', '1', 0, 0, 'N', k, 'in', 8, 'passive'), P('2', '2', 0, 60, 'S', k, 'out', 8, 'passive')], noCross: true
    };
  }
  function makeRes(opt) {
    opt = opt || {};
    const k = opt.k || 'ESS';
    return {
      w: 0, h: 60, draw: [['L', 0, 8, 0, 16], ['R', -7, 16, 14, 28], ['L', 0, 44, 0, 52]],
      tagAt: { x: -14, y: 26, a: 'e' },
      pins: [P('1', '1', 0, 0, 'N', k, 'in', 8, 'passive'), P('2', '2', 0, 60, 'S', k, 'out', 8, 'passive')]
    };
  }

  /* ============================================================
   * 3. 母排（核心构件）：分相绘制 + 分接下引 + 跨线半圆
   *    bars: [{name,k}]  taps: [{id, wires:[名], side:'N'|'S', gap?}]
   * ============================================================ */
  function makeBus(opt) {
    const bars = opt.bars, taps = opt.taps || [], BP = opt.barPitch || 14, DP = opt.dropPitch || 9;
    const H = (bars.length - 1) * BP;
    const OUT = opt.out || 22;
    const d = [], pins = [];
    let x = opt.pad == null ? 26 : opt.pad;
    taps.forEach(function (t) {
      const side = t.side || 'S';
      const yEnd = side === 'S' ? H + OUT : -OUT;
      t.wires.forEach(function (wn, j) {
        const bi = bars.findIndex(function (b) { return b.name === wn; });
        if (bi < 0) return;
        const by = bi * BP, px = x + j * DP;
        d.push(['L', px, by, px, yEnd], ['CF', px, by, 2.0]);
        /* 下引线跨过其它母排 → 半圆跨越（不连接） */
        bars.forEach(function (b, bj) {
          if (bj === bi) return;
          const cy = bj * BP;
          if (side === 'S' ? cy > by : cy < by) {
            d.push(['M', px - 4.5, cy - 1.6, 9, 3.2]);
            d.push(['A', px, cy, 4.5, side === 'S' ? 180 : 0, side === 'S' ? 360 : 180]);
          }
        });
        pins.push(P(t.id + '.' + wn, wn, px, yEnd, side, bars[bi].k || 'AC', 'pas', 0, 'passive'));
      });
      if (t.label) d.push(['T', x + (t.wires.length - 1) * DP / 2, side === 'S' ? yEnd + 11 : yEnd - 5, t.label, 7.5, 'm', 'dim']);
      x += (t.wires.length - 1) * DP + (t.gap || 30);
    });
    const W = Math.max(x, 120);
    bars.forEach(function (b, i) {
      d.unshift(['L', 0, i * BP, W, i * BP, 3.0]);
      d.push(['T', -8, i * BP + 3, b.name, 8.5, 'e', 'bar']);
    });
    return { w: W, h: H, draw: d, pins: pins, isBus: true, tagAt: { x: W + 12, y: 3, a: 's' } };
  }

  /* ============================================================
   * 4. 功能框：左/右/上/下四边引脚
   * ============================================================ */
  /* 标题带预留高度：引脚行不得侵入标题/副标题区（LIB-R21） */
  function HDR(opt) { return opt.title ? ((opt.titleY || 15) + (opt.sub ? 23 : 9)) : 0; }
  function makeBox(opt) {
    const L = opt.left || [], R = opt.right || [], B = opt.bottom || [], T = opt.top || [];
    const pitch = opt.pitch || 18, padY = opt.padY == null ? 20 : opt.padY;
    const h = Math.max(opt.minH || 0, HDR(opt) + padY * 2 + (Math.max(L.length, R.length) - 1) * pitch);
    const wMin = Math.max((T.length - 1) * (opt.tpitch || 22) + 30, (B.length - 1) * (opt.bpitch || 22) + 30);
    const w = Math.max(opt.w || 0, wMin);
    const d = [['R', 0, 0, w, h, opt.r || 0]];
    const pins = [];
    const y0 = (n) => Math.round(HDR(opt) + (h - HDR(opt) - (n - 1) * pitch) / 2);
    const addBoxPin = function (p, x, y, side) { pins.push(P(p.n || p.name, p.name, x, y, side, p.k, p.t, 10, p.ercType, p.ercStatus, p.ercSourceId)); };
    L.forEach(function (p, i) { addBoxPin(p, -10, y0(L.length) + i * pitch, 'W'); });
    R.forEach(function (p, i) { addBoxPin(p, w + 10, y0(R.length) + i * pitch, 'E'); });
    const tx0 = (n, pt) => Math.round((w - (n - 1) * pt) / 2);
    T.forEach(function (p, i) { addBoxPin(p, tx0(T.length, opt.tpitch || 22) + i * (opt.tpitch || 22), -10, 'N'); });
    B.forEach(function (p, i) { addBoxPin(p, tx0(B.length, opt.bpitch || 22) + i * (opt.bpitch || 22), h + 10, 'S'); });
    if (opt.title) d.push(['T', w / 2, opt.titleY || 15, opt.title, opt.titleSize || 10, 'm', 'title']);
    if (opt.sub) d.push(['T', w / 2, (opt.titleY || 15) + 12, opt.sub, 7.5, 'm', 'dim']);
    if (opt.glyph === 'acdc') { d.push(['L', 0, h, w, 0], acGlyph(w * 0.28, h * 0.3, 7)); dcGlyph(w * 0.72, h * 0.72, 8).forEach(function (g) { d.push(g); }); }
    if (opt.glyph === 'dcdc') { d.push(['L', 0, h, w, 0]); dcGlyph(w * 0.26, h * 0.28, 8).forEach(function (g) { d.push(g); }); dcGlyph(w * 0.74, h * 0.74, 8).forEach(function (g) { d.push(g); }); }
    if (opt.glyph === 'dcac') { d.push(['L', 0, h, w, 0]); dcGlyph(w * 0.26, h * 0.28, 8).forEach(function (g) { d.push(g); }); d.push(acGlyph(w * 0.74, h * 0.74, 7)); }
    if (opt.extra) opt.extra.forEach(function (g) { d.push(g); });
    return { w: w, h: h, draw: d, pins: pins, nameIn: true, gutter: 52, noCross: true, tagAt: opt.tagAt || { x: 0, y: T.length ? -56 : -34, a: 's' } };
  }

  /* ============================================================
   * 5. 静态/半参数符号
   * ============================================================ */
  const S = {};

  /* 进线电缆端子排 */
  /* v2.31 无源/半导体/机电新符号（IEC 60617 画法） */
  S.cap = function () {
    return { w: 0, h: 44, draw: [['L', 0, 0, 0, 18], ['L', -10, 18, 10, 18, 2], ['L', -10, 24, 10, 24, 2], ['L', 0, 24, 0, 44]],
      pins: [P('1', '+', 0, 0, 'N', 'DC', 'in'), P('2', '-', 0, 44, 'S', 'DC', 'out')], tagAt: { x: 14, y: 24, a: 's' } };
  };
  S.ind = function () {
    return { w: 0, h: 48, draw: [['L', 0, 0, 0, 12], ['R', -6, 12, 12, 24, 3], ['L', 0, 36, 0, 48]],
      pins: [P('1', '1', 0, 0, 'N', 'DC', 'in'), P('2', '2', 0, 48, 'S', 'DC', 'out')], tagAt: { x: 12, y: 26, a: 's' } };
  };
  S.diode = function () {
    return { w: 0, h: 44, draw: [['L', 0, 0, 0, 12], ['P', 'M -9 12 L 9 12 L 0 30 Z'], ['L', -9, 30, 9, 30, 2], ['L', 0, 30, 0, 44]],
      pins: [P('A', 'A', 0, 0, 'N', 'DC', 'in'), P('K', 'K', 0, 44, 'S', 'DC', 'out')], tagAt: { x: 13, y: 24, a: 's' } };
  };
  S.led = function () {
    return { w: 0, h: 44, draw: [['L', 0, 0, 0, 12], ['P', 'M -9 12 L 9 12 L 0 30 Z'], ['L', -9, 30, 9, 30, 2], ['L', 0, 30, 0, 44],
      ['L', 4, 14, 12, 6], ['P', 'M 12 6 l -4 1 l 2 3 z'], ['L', 8, 20, 16, 12], ['P', 'M 16 12 l -4 1 l 2 3 z']],
      pins: [P('A', 'A', 0, 0, 'N', 'AUX', 'in'), P('K', 'K', 0, 44, 'S', 'AUX', 'out')], tagAt: { x: 20, y: 26, a: 's' } };
  };
  S.bridge = function () {
    return { w: 64, h: 56, draw: [['R', 0, 0, 64, 56], ['T', 32, 20, '~', 12, 'm', 'dim'], ['T', 32, 40, '=', 12, 'm', 'dim'],
      ['P', 'M 20 24 l 8 8 l -8 8 z'], ['L', 14, 40, 30, 40, 1.5]],
      pins: [P('AC1', 'AC1', 0, 18, 'W', 'AC', 'in'), P('AC2', 'AC2', 0, 38, 'W', 'AC', 'in'),
        P('+', 'DC+', 64, 18, 'E', 'DC', 'out'), P('-', 'DC-', 64, 38, 'E', 'DC', 'out')], tagAt: { x: 8, y: -6, a: 's' } };
  };
  S.relay = function () {
    return { w: 72, h: 64, draw: [['R', 0, 0, 72, 64], ['R', 8, 8, 20, 28], ['L', 12, 14, 24, 20, 1], ['L', 12, 20, 24, 26, 1], ['L', 12, 26, 24, 32, 1],
      ['L', 44, 12, 52, 12], ['L', 52, 12, 60, 20, 1.5], ['C', 44, 12, 1.6], ['C', 60, 24, 1.6]],
      pins: [P('A1', 'A1', 0, 16, 'W', 'CTL', 'in'), P('A2', 'A2', 0, 30, 'W', 'CTL', 'in'),
        P('11', '11', 72, 12, 'E', 'CTL', 'in'), P('14', '14', 72, 24, 'E', 'CTL', 'out')], tagAt: { x: 8, y: -6, a: 's' } };
  };
  S.trelay = function () {
    return { w: 72, h: 64, draw: [['R', 0, 0, 72, 64], ['R', 8, 8, 20, 28], ['C', 18, 22, 8], ['L', 18, 14, 18, 18, 1], ['L', 14, 22, 16, 22, 1],
      ['L', 44, 12, 52, 12], ['L', 52, 12, 60, 20, 1.5], ['C', 44, 12, 1.6], ['C', 60, 24, 1.6], ['L', 48, 8, 48, 16, 1], ['L', 44, 16, 52, 16, 1]],
      pins: [P('A1', 'A1', 0, 16, 'W', 'CTL', 'in'), P('A2', 'A2', 0, 30, 'W', 'CTL', 'in'),
        P('15', '15', 72, 12, 'E', 'CTL', 'in'), P('18', '18', 72, 24, 'E', 'CTL', 'out')], tagAt: { x: 8, y: -6, a: 's' } };
  };
  S.tc = function () {
    return { w: 84, h: 56, draw: [['R', 0, 0, 84, 56], ['T', 42, 20, '°C', 11, 'm', 'title'], ['T', 42, 38, 'PT100', 7, 'm', 'dim']],
      pins: [P('PT+', 'PT+', 0, 18, 'W', 'CTL', 'in'), P('PT-', 'PT-', 0, 38, 'W', 'CTL', 'in'),
        P('DO', 'DO', 84, 18, 'E', 'CTL', 'out'), P('CM', '485', 84, 38, 'E', 'COMM', 'bi'),
        P('V+', '24V+', 42, 0, 'N', 'AUX', 'in'), P('V-', '24V-', 42, 56, 'S', 'AUX', 'out')], tagAt: { x: 8, y: -6, a: 's' } };
  };
  S.termStrip = function (names, k) {
    const d = [], pins = [], pitch = 26;
    const w = (names.length - 1) * pitch;
    d.push(['R', -11, 0, w + 22, 26]);
    names.forEach(function (nm, i) {
      const x = i * pitch;
      d.push(['C', x, 13, 4.5], ['L', x, 26, x, 34]);
      d.push(['T', x, -5, nm, 7.5, 'm', 'dim']);
      pins.push(P(nm, nm, x, 34, 'S', nm === 'PE' ? 'PE' : k, 'out', 0));
    });
    return { w: w, h: 34, draw: d, pins: pins, tagAt: { x: -20, y: 16, a: 'e' } };
  };

  /* 电涌保护器 3P+N */
  S.spd = function () {
    const d = [], pins = [], pitch = 26;
    PHASE4.forEach(function (nm, i) {
      const x = i * pitch;
      d.push(['L', x, 0, x, 14], ['R', x - 6, 14, 12, 24], ['L', x - 5, 36, x + 5, 16], ['P', 'M ' + (x + 5) + ' 16 l -5 1.5 l 2 4.5 z'], ['L', x, 38, x, 48]);
      pins.push(P(nm, nm, x, 0, 'N', 'AC', 'in', 0));
    });
    d.push(['L', -6, 48, 3 * pitch + 6, 48, 2.2], ['L', 1.5 * pitch, 48, 1.5 * pitch, 60]);
    pins.push(P('PE', 'PE', 1.5 * pitch, 60, 'S', 'PE', 'out', 0));
    return { w: 3 * pitch, h: 60, draw: d, pins: pins, tagAt: { x: -18, y: 30, a: 'e' } };
  };

  /* 剩余电流监测（穿芯式） */
  S.rcm = function () {
    const pitch = 26, w = 3 * pitch + 40;
    const d = [['R', -14, 0, w + 28, 76]], pins = [];
    PHASE4.forEach(function (nm, i) {
      const x = i * pitch;
      d.push(['L', x, -8, x, 84]);
      pins.push(P(String(2 * i + 1), nm, x, -8, 'N', 'AC', 'in', 0));
      pins.push(P(String(2 * i + 2), nm, x, 84, 'S', 'AC', 'out', 0));
    });
    d.push(['P', 'M -8 38 a 46 30 0 1 0 ' + (3 * pitch + 16) + ' 0 a 46 30 0 1 0 ' + (-(3 * pitch + 16)) + ' 0']);
    d.push(['T', 1.5 * pitch, 14, 'RCM', 9, 'm', 'title'], ['T', 1.5 * pitch, 70, 'Type B', 7, 'm', 'dim']);
    [['ALM', 'ALM'], ['24V+', '24V+'], ['24V-', '24V-']].forEach(function (p, i) {
      const y = 24 + i * 14;
      d.push(['L', w + 14, y, w + 24, y]);
      pins.push(P(p[0], p[1], w + 24, y, 'E', i === 0 ? 'CTL' : 'AUX', i === 0 ? 'out' : 'in', 0));
    });
    return { w: w, h: 76, draw: d, pins: pins, tagAt: { x: -22, y: 38, a: 'e' } };
  };

  /* 交流电能表 */
  S.meterAC = function () {
    const pitch = 26, w = 3 * pitch + 34;
    const d = [['R', -12, 0, w + 24, 70]], pins = [];
    PHASE4.forEach(function (nm, i) {
      const x = i * pitch;
      d.push(['L', x, -8, x, 78]);
      pins.push(P(String(i * 2 + 1), nm, x, -8, 'N', 'AC', 'in', 0));
      pins.push(P(String(i * 2 + 2), nm, x, 78, 'S', 'AC', 'out', 0));
    });
    d.push(['C', w - 2, 35, 13], ['T', w - 2, 39, 'Wh', 9.5, 'm', 'title']);
    [['A', 'COMM'], ['B', 'COMM']].forEach(function (p, i) {
      const y = 20 + i * 30;
      d.push(['L', w + 12, y, w + 22, y]);
      pins.push(P(p[0], 'RS485-' + p[0], w + 22, y, 'E', p[1], 'out', 0));
    });
    return { w: w, h: 70, draw: d, pins: pins, tagAt: { x: -20, y: 35, a: 'e' } };
  };

  /* 霍尔电流传感器（穿芯） */
  S.hall = function () {
    const d = [['R', -14, 0, 76, 70], ['L', 16, -8, 16, 78], ['C', 16, 35, 15], ['C', 16, 35, 11]], pins = [];
    pins.push(P('P1', 'P1', 16, -8, 'N', 'DC', 'in', 0), P('P2', 'P2', 16, 78, 'S', 'DC', 'out', 0));
    [['5V+', 'AUX', 'in'], ['OUT', 'CTL', 'out'], ['GND', 'AUX', 'in']].forEach(function (p, i) {
      const y = 17 + i * 18;
      d.push(['L', 46, y, 62, y]);
      pins.push(P(p[0], p[0], 62, y, 'E', p[1], p[2], 0));
    });
    d.push(['T', 40, 66, 'HALL', 7, 'm', 'dim']);
    return { w: 62, h: 70, draw: d, pins: pins, nameIn: true, tagAt: { x: -20, y: 35, a: 'e' } };
  };

  /* 直流电能表 */
  S.meterDC = function () {
    const d = [['R', 0, 0, 104, 72], ['C', 74, 36, 13], ['T', 74, 40, 'Wh', 9.5, 'm', 'title'], ['T', 34, 20, 'DC', 8.5, 'm', 'title']], pins = [];
    [['1', 'DC+', 24], ['3', 'DC-', 58]].forEach(function (p) {
      d.push(['L', p[2], -10, p[2], 0]);
      pins.push(P(p[0], p[1] + '进', p[2], -10, 'N', 'DC', 'in', 0));
    });
    [['2', 'DC+', 24], ['4', 'DC-', 58]].forEach(function (p) {
      d.push(['L', p[2], 72, p[2], 82]);
      pins.push(P(p[0], p[1] + '出', p[2], 82, 'S', 'DC', 'out', 0));
    });
    ['A', 'B'].forEach(function (nm, i) {
      const y = 22 + i * 28; d.push(['L', 104, y, 114, y]);
      pins.push(P(nm, 'RS485-' + nm, 114, y, 'E', 'COMM', 'out', 0));
    });
    return { w: 114, h: 72, draw: d, pins: pins, nameIn: true, tagAt: { x: 0, y: -34, a: 's' } };
  };

  /* 绝缘监测装置 IMD */
  S.imd = function () {
    const d = [['R', 0, 0, 104, 78], ['C', 30, 44, 15], ['T', 30, 49, 'R', 12, 'm', 'title'],
      ['P', 'M 46 56 l 16 -16'], ['P', 'M 62 40 l -6 1 l 1.6 5 z'], ['T', 62, 20, 'IMD', 9.5, 'm', 'title']], pins = [];
    [['DC+', 20], ['DC-', 84]].forEach(function (p) { d.push(['L', p[1], 78, p[1], 88]); pins.push(P(p[0], p[0], p[1], 88, 'S', 'DC', 'in', 0)); }); /* V10: 直流母线在 IMD 下方，DC± pin 朝下 */
    d.push(['L', 52, 78, 52, 88]); pins.push(P('PE', 'PE', 52, 88, 'S', 'PE', 'out', 0));
    [['A', 'COMM', 'out'], ['B', 'COMM', 'out'], ['ALM', 'CTL', 'out'], ['24V+', 'AUX', 'in'], ['24V-', 'AUX', 'in']].forEach(function (p, i) {
      const y = 12 + i * 14; d.push(['L', 104, y, 114, y]);
      pins.push(P(p[0], p[0], 114, y, 'E', p[1], p[2], 0));
    });
    return { w: 114, h: 78, draw: d, pins: pins, nameIn: true, noCross: true, tagAt: { x: 0, y: -34, a: 's' } };
  };

  /* 充电连接器（枪）—— 圆形接口面 + 左侧端子 */
  const GUN_FACE = {
    'ccs1': { r: 30, pins: [['DC+', 19, 15, 9], ['DC-', -19, 15, 9], ['PE', 0, -20, 4], ['CP', 8, -13, 3.4], ['PP', -8, -13, 3.4], ['L1', -6, -4, 2.6], ['L2', 6, -4, 2.6]] },
    'nacs': { r: 28, pins: [['DC+', 14, 10, 9], ['DC-', -14, 10, 9], ['PE', 0, -18, 4], ['CP', 10, -8, 3.2], ['PP', -10, -8, 3.2]] },
    'chademo': { r: 32, pins: [['DC+', 18, -8, 8], ['DC-', -18, -8, 8], ['PE', 0, 16, 5], ['CP', 0, -20, 3.4], ['CAN_H', 22, 8, 3], ['CAN_L', -22, 8, 3], ['d1', -9, 20, 2.6], ['d2', 9, 20, 2.6]] },
    'gb': { r: 32, pins: [['DC+', 20, -10, 8], ['DC-', -20, -10, 8], ['PE', 0, 3, 6], ['S+', -21, 11, 3.6], ['S-', 21, 11, 3.6], ['CC1', -9, 18, 3.6], ['CC2', 9, 18, 3.6], ['A+', -5, -23, 3], ['A-', 5, -23, 3]] },
    'ccs2': { r: 30, pins: [['DC+', 19, 15, 9], ['DC-', -19, 15, 9], ['PE', 0, -20, 4], ['CP', 8, -13, 3.4], ['PP', -8, -13, 3.4], ['L1', -9, -4, 2.6], ['L2', -3, -1, 2.6], ['L3', 3, -1, 2.6], ['N', 9, -4, 2.6]] }
  };
  /* v2.32: 充电标准描述表（枪端子/协议/电压范围/后台单元命名） */
  const STDDEF = {
    gb:      { label: '国标 DC 枪', sig: 'gb', terms: ['DC+', 'DC-', 'PE', 'S+', 'S-', 'CC1', 'CC2'], spec: 'GB/T 20234.3 9芯', proto: 'GB/T 27930 CAN 250k', vRange: '200-1000V', a2: '计费与后台通信网关', a2spec: 'OCPP 1.6J', a2title: '通信网关' },
    ccs2:    { label: 'CCS2 DC 枪', sig: 'cp', terms: ['DC+', 'DC-', 'PE', 'CP', 'PP'], spec: 'IEC 62196-3 FF', proto: 'DIN 70121 / ISO 15118', vRange: '150-1000V', a2: 'SECC 通信控制器', a2spec: 'HomePlug Green PHY / OCPP', a2title: 'SECC' },
    ccs1:    { label: 'CCS1 DC 枪', sig: 'cp', terms: ['DC+', 'DC-', 'PE', 'CP', 'PP'], spec: 'IEC 62196-3 EE', proto: 'SAE J2847-2 / ISO 15118', vRange: '150-1000V', a2: 'SECC 通信控制器', a2spec: 'HomePlug Green PHY / OCPP', a2title: 'SECC' },
    nacs:    { label: 'NACS DC 枪', sig: 'cp', terms: ['DC+', 'DC-', 'PE', 'CP', 'PP'], spec: 'SAE J3400 5触点', proto: 'ISO 15118 PLC / PWM-CP', vRange: '150-1000V', a2: 'SECC 通信控制器', a2spec: 'HomePlug Green PHY / OCPP', a2title: 'SECC' },
    chademo: { label: 'CHAdeMO 枪', sig: 'chademo', terms: ['DC+', 'DC-', 'PE', 'CP', 'CAN_H', 'CAN_L'], spec: 'CHAdeMO 10针', proto: 'CHAdeMO CAN（车辆主导）', vRange: '50-500V', a2: 'CHAdeMO 后台网关', a2spec: 'CHAdeMO 协议 / OCPP 网关', a2title: '后台网关' },
  };
  S.gun = function (std, termNames) {
    const face = GUN_FACE[std] || GUN_FACE.ccs2, cx = 96, cy = 60;
    const d = [['R', 0, 0, 150, 120, 4], ['C', cx, cy, face.r], ['C', cx, cy, face.r - 5]], pins = [];
    face.pins.forEach(function (p) {
      d.push(['C', cx + p[1], cy + p[2], p[3]]);
      if (p[3] >= 5) d.push(['T', cx + p[1], cy + p[2] + 2.6, p[0], 6.2, 'm', 'dim']);
    });
    d.push(['T', 40, 16, (STDDEF[std] || STDDEF.ccs2).label, 8.5, 'm', 'title']);
    termNames.forEach(function (nm, i) {
      const y = 30 + i * 15;
      d.push(['L', -10, y, 4, y], ['CF', 4, y, 1.6], ['T', 8, y + 2.6, nm, 6.8, 's', 'dim']);
      const k = nm === 'PE' ? 'PE' : (nm === 'DC+' || nm === 'DC-') ? 'DC' : (nm === 'S+' || nm === 'S-' || nm === 'CP' || nm === 'CAN_H' || nm === 'CAN_L') ? 'COMM' : 'CTL';
      pins.push(P(nm, nm, -10, y, 'W', k, 'bi', 0));
    });
    return { w: 150, h: 120, draw: d, pins: pins, noCross: true, tagAt: { x: 0, y: -34, a: 's' } };
  };

  /* 电子锁 */
  S.lock = function () {
    const d = [['R', 0, 0, 76, 56], ['R', 14, 18, 30, 20], ['L', 44, 28, 60, 28], ['P', 'M 60 28 l -6 -2.5 l 0 5 z'], ['T', 38, 13, '电子锁', 8, 'm', 'title']], pins = [];
    [['V+', 'AUX', 'in'], ['V-', 'AUX', 'in']].forEach(function (p, i) { const y = 18 + i * 20; d.push(['L', -10, y, 0, y]); pins.push(P(p[0], p[0], -10, y, 'W', p[1], p[2], 0)); });
    [['FB1', 'CTL', 'out'], ['FB2', 'CTL', 'out']].forEach(function (p, i) { const y = 18 + i * 20; d.push(['L', 76, y, 86, y]); pins.push(P(p[0], p[0], 86, y, 'E', p[1], p[2], 0)); });
    return { w: 86, h: 56, draw: d, pins: pins, nameIn: true, tagAt: { x: 0, y: -34, a: 's' } };
  };

  /* 电池簇 */
  S.battery = function (n) {
    const d = [['R', 0, 0, 156, 96]], pins = [];
    for (let i = 0; i < 3; i++) {
      const x = 26 + i * 26;
      d.push(['L', x, 34, x, 62, 2.6], ['L', x + 10, 42, x + 10, 54]);
    }
    d.push(['L', 26, 48, 14, 48], ['L', 88, 48, 100, 48], ['D', 62, 48, 78, 48]);
    d.push(['T', 78, 20, '电池箱 ' + n, 9, 'm', 'title'], ['T', 78, 86, 'LFP 簇', 7, 'm', 'dim']);
    [['+', 'ESS', 'out'], ['-', 'ESS', 'out']].forEach(function (p, i) {
      const y = 30 + i * 36; d.push(['L', 156, y, 166, y]);
      pins.push(P(p[0], p[0], 166, y, 'E', p[1], p[2], 0));
    });
    [['CANH', 'COMM', 'bi'], ['CANL', 'COMM', 'bi'], ['24V+', 'AUX', 'in'], ['24V-', 'AUX', 'in'], ['HEAT', 'AUX', 'in']].forEach(function (p, i) {
      const x = 20 + i * 30; d.push(['L', x, 96, x, 106]);
      pins.push(P(p[0], p[0], x, 106, 'S', p[1], p[2], 0));
    });
    return { w: 166, h: 96, draw: d, pins: pins, nameIn: true, tagAt: { x: 0, y: -34, a: 's' } };
  };

  /* 急停按钮（蘑菇头 常闭双断点） */
  S.estop = function () {
    const d = [['L', 0, 8, 0, 18], ['L', 0, 42, 0, 52], ['L', -8, 18, 10, 40], ['L', 8, 18, 8, 24],
      ['D', 4, 30, 26, 30], ['L', 20, 30, 32, 30], ['P', 'M 20 30 a 6 6 0 0 1 12 0'], ['L', 26, 30, 26, 24]], pins = [];
    pins.push(P('11', '11', 0, 0, 'N', 'SAF', 'in'), P('12', '12', 0, 60, 'S', 'SAF', 'out'));
    return { w: 32, h: 60, draw: d, pins: pins, tagAt: { x: -14, y: 30, a: 'e' } };
  };
  /* 位置开关（门禁/防拆）常闭 */
  S.posSwitch = function () {
    const d = [['L', 0, 8, 0, 18], ['L', 0, 42, 0, 52], ['L', -8, 18, 10, 40], ['L', 8, 18, 8, 24], ['D', 6, 30, 22, 30], ['L', 22, 24, 22, 36]], pins = [];
    pins.push(P('11', '11', 0, 0, 'N', 'SAF', 'in'), P('12', '12', 0, 60, 'S', 'SAF', 'out'));
    return { w: 22, h: 60, draw: d, pins: pins, tagAt: { x: -14, y: 30, a: 'e' } };
  };
  /* 指示灯 */
  S.lamp = function () {
    const r = 13, d = [['L', 0, 0, 0, 17], ['C', 0, 30, r], ['L', -9.2, 20.8, 9.2, 39.2], ['L', 9.2, 20.8, -9.2, 39.2], ['L', 0, 43, 0, 60]];
    return { w: 0, h: 60, draw: d, tagAt: { x: -18, y: 33, a: 'e' }, pins: [P('X1', 'X1', 0, 0, 'N', 'AUX', 'in'), P('X2', 'X2', 0, 60, 'S', 'AUX', 'in')] };
  };
  /* 电机 / 风机 */
  S.motor = function (label) {
    const d = [['C', 0, 30, 20], ['T', 0, 35, label || 'M', 12, 'm', 'title'], ['L', 0, 0, 0, 10], ['L', 0, 50, 0, 60]];
    return { w: 0, h: 60, draw: d, tagAt: { x: -26, y: 33, a: 'e' }, pins: [P('U', 'U', 0, 0, 'N', 'AUX', 'in'), P('V', 'V', 0, 60, 'S', 'AUX', 'in')] };
  };
  /* 保护接地符号 */
  S.earth = function () {
    return {
      w: 0, h: 26, draw: [['L', 0, 0, 0, 10], ['L', -13, 10, 13, 10, 2], ['L', -8, 16, 8, 16], ['L', -3.5, 21, 3.5, 21]],
      pins: [P('PE', 'PE', 0, 0, 'N', 'PE', 'in')], tagAt: { x: 18, y: 14, a: 's' }
    };
  };
  /* v2.0.4 audit-fix: 电源旗标（power flag）——全局电源轨连接符，同名即连通 */
  S.pwrflag = function (label, pd) {
    const tw = label.length * 4.4 + 4;
    if (pd === 'N') {
      const d = [['L', 0, 0, 0, 12], ['L', -5, 12, 5, 12, 2], ['T', 8, 16, label, 7.2, 's', 'pwr']];
      return { w: 8 + tw, h: 22, draw: d, pins: [P('1', '', 0, 0, 'N', 'AUX', 'bi', 0)], tagAt: null };
    }
    if (pd === 'S') {
      const d = [['L', 0, 22, 0, 10], ['L', -5, 10, 5, 10, 2], ['T', 8, 8, label, 7.2, 's', 'pwr']];
      return { w: 8 + tw, h: 22, draw: d, pins: [P('1', '', 0, 22, 'S', 'AUX', 'bi', 0)], tagAt: null };
    }
    if (pd === 'E') {
      const w = 16 + Math.round(tw);
      const d = [['L', w, 0, w - 12, 0], ['L', w - 12, -5, w - 12, 5, 2], ['T', w - 16, -3, label, 7.2, 'e', 'pwr']];
      return { w: w, h: 10, draw: d, pins: [P('1', '', w, 0, 'E', 'AUX', 'bi', 0)], tagAt: null };
    }
    const w2 = 16 + Math.round(tw);
    const d2 = [['L', 0, 0, 12, 0], ['L', 12, -5, 12, 5, 2], ['T', 16, -3, label, 7.2, 's', 'pwr']];
    return { w: w2, h: 10, draw: d2, pins: [P('1', '', 0, 0, 'W', 'AUX', 'bi', 0)], tagAt: null };
  };
  /* 跨页连接符（off-page connector, IEC 61082）
     信号线头用电气符号惯用的 "》" 双折人字形，不占面积；标签紧随其后 */
  S.xref = function (label, dir, tag) {
    const tagPrim = tag ? ['T', 0, -5, tag, 6.5, 's', 'xrtag'] : null; /* v2.12: 跨页配对编号（两页同名） */
    if (dir === 'S') { /* v2.0.2 audit-fix: 垂直跨页符——引脚在顶、人字朝下，消除横向扫线 */
      const CHv = 9, GAPv = 4;
      const wv = 2 * CHv, hv = Math.round(CHv * 1.7 + 4);
      const dv = [
        ['P', 'M 0 0 L ' + CHv + ' ' + CHv + ' L ' + (2 * CHv) + ' 0'],
        ['P', 'M 0 ' + (CHv * 0.7) + ' L ' + CHv + ' ' + (CHv * 1.7) + ' L ' + (2 * CHv) + ' ' + (CHv * 0.7)],
        ['T', 2 * CHv + GAPv, CHv + 3, label, 7.2, 's', 'xref']
      ];
      if (tagPrim) dv.unshift(tagPrim);
      return { w: wv, h: hv, draw: dv, pins: [P('1', '', CHv, 0, 'N', 'CTL', 'bi', 0)], isXref: true, tagAt: null };
    }
    if (dir === 'N') { /* v2.0.3 audit-fix: 垂直跨页符·引脚在底/人字朝上（入线自下来） */
      const CHn = 9, GAPn = 4;
      const wn = 2 * CHn, hn = Math.round(CHn * 1.7 + 4);
      const dn = [
        ['P', 'M 0 ' + (CHn * 1.0) + ' L ' + CHn + ' 0 L ' + (2 * CHn) + ' ' + (CHn * 1.0)],
        ['P', 'M 0 ' + (CHn * 1.7) + ' L ' + CHn + ' ' + (CHn * 0.7) + ' L ' + (2 * CHn) + ' ' + (CHn * 1.7)],
        ['T', 2 * CHn + GAPn, CHn + 3, label, 7.2, 's', 'xref']
      ];
      if (tagPrim) { tagPrim[1] = hn + 11; dn.unshift(tagPrim); }
      return { w: wn, h: hn, draw: dn, pins: [P('1', '', CHn, hn, 'S', 'CTL', 'bi', 0)], isXref: true, tagAt: null };
    }
    const flip = (dir === 'W');
    const CH = 9, GAP = 4;                       // 人字半高 / 与文字间隙
    const tw = label.length * 4.4 + 6;
    const w = Math.round(CH + GAP + tw); /* v2.13c: 取整保栅格 */
    const d = flip
      /* 引脚在右，人字指向左：》 镜像 */
      ? [['P', 'M ' + (w - CH * 0.7) + ' 0 L ' + (w - CH * 1.7) + ' ' + CH + ' L ' + (w - CH * 0.7) + ' ' + (2 * CH)],
         ['P', 'M ' + w + ' 0 L ' + (w - CH) + ' ' + CH + ' L ' + w + ' ' + (2 * CH)],
         ['T', w - CH * 1.7 - GAP, CH + 3, label, 7.2, 'e', 'xref']]
      /* 引脚在左，人字指向右：》 */
      : [['P', 'M 0 0 L ' + CH + ' ' + CH + ' L 0 ' + (2 * CH)],
         ['P', 'M ' + (CH * 0.7) + ' 0 L ' + (CH * 1.7) + ' ' + CH + ' L ' + (CH * 0.7) + ' ' + (2 * CH)],
         ['T', CH * 1.7 + GAP, CH + 3, label, 7.2, 's', 'xref']];
    if (tagPrim) d.unshift(tagPrim);
    const px = flip ? w : 0, pd = flip ? 'E' : 'W';
    return { w: w, h: 2 * CH, draw: d, pins: [P('1', '', px, CH, pd, 'CTL', 'bi', 0)], isXref: true, tagAt: null };
  };

  /* ============================================================
   * 5b. 功能安全检测单元 —— 源自厂家电路对比库（EVSE_VENDOR_KB）
   *     每个单元采用对比库中评级最高的拓扑范式
   * ============================================================ */
  /* 粘连检测 —— 小鹬范式 ★★★★★：防浪涌电容 + 阻容分压 + ADC 采样 */
  S.stickDet = function () {
    return makeBox({
      w: 138, minH: 96, title: '粘连检测', sub: '阻容分压 + ADC · TVS 钳位', titleY: 17,
      left: [{ n: '1', name: 'K+进', k: 'DC', t: 'in' }, { n: '2', name: 'K+出', k: 'DC', t: 'in' },
        { n: '3', name: 'K-进', k: 'DC', t: 'in' }, { n: '4', name: 'K-出', k: 'DC', t: 'in' }],
      right: [{ n: 'AO', name: 'ADC', k: 'CTL', t: 'out' }, { n: 'V+', name: '24V+', k: 'AUX', t: 'in' }, { n: 'V-', name: '24V-', k: 'AUX', t: 'in' }],
      pitch: 18, padY: 22,
      extra: [['R', 62, 46, 12, 20], ['L', 68, 40, 68, 46], ['L', 68, 66, 68, 74], ['R', 62, 74, 12, 16]]
    });
  };
  /* 合闸前短路检测 —— 普诺德范式 ★★★★★：双继电器 + 隔离驱动，检测完即断开 */
  S.scDet = function () {
    return makeBox({
      w: 156, minH: 96, title: '合闸前短路检测', sub: '双继电器 + 光耦隔离（检测后断开）', titleY: 17,
      left: [{ n: '1', name: 'DC+', k: 'DC', t: 'in' }, { n: '2', name: 'DC-', k: 'DC', t: 'in' }],
      right: [{ n: 'DO', name: '短路判定', k: 'CTL', t: 'out' }, { n: 'EN', name: '检测使能', k: 'CTL', t: 'in' },
        { n: 'V+', name: '24V+', k: 'AUX', t: 'in' }, { n: 'V-', name: '24V-', k: 'AUX', t: 'in' }],
      pitch: 18, padY: 22,
      extra: [['R', 60, 50, 24, 16], ['L', 72, 66, 72, 74], ['A', 72, 74, 5, 0, 180],
        ['P', 'M 90 52 l 8 6 l -8 6 z'], ['L', 98, 50, 98, 66]]
    });
  };
  /* PE 有效性检测 —— 普诺德范式 ★★★★★：双运放差分精密检测 */
  S.peDet = function () {
    return makeBox({
      w: 142, minH: 84, title: 'PE 有效性检测', sub: '双运放差分精密检测', titleY: 17,
      left: [{ n: 'L', name: 'L', k: 'AC', t: 'in' }, { n: 'N', name: 'N', k: 'AC', t: 'in' }, { n: 'PE', name: 'PE', k: 'PE', t: 'in' }],
      right: [{ n: 'AO', name: 'PE-ADC', k: 'CTL', t: 'out' }, { n: 'V+', name: '24V+', k: 'AUX', t: 'in' }, { n: 'V-', name: '24V-', k: 'AUX', t: 'in' }],
      pitch: 18, padY: 20,
      extra: [['P', 'M 58 46 l 0 30 l 26 -15 z']]
    });
  };
  /* 充电控制引导单元（发生 + 检测 + 车辆二极管存在）
     发生级：万邦/小鹬 运放+三极管图腾柱/推挽 ★★★★★
     检测级：公牛 运放跟随+电阑分压（线性采样） ★★★★★
     二极管存在：深圳佳诺 双运放精密滞回比较 ★★★★★ */
  S.guide = function (mode) {
    const sig = mode === true ? 'gb' : (mode === false || mode == null) ? 'cp' : mode;
    const L = sig === 'gb'
      ? [{ n: 'CC1', name: 'CC1', k: 'CTL', t: 'in' }, { n: 'CC2', name: 'CC2', k: 'CTL', t: 'in' },
        { n: 'S+', name: 'S+', k: 'COMM', t: 'bi' }, { n: 'S-', name: 'S-', k: 'COMM', t: 'bi' }]
      : sig === 'chademo'
        ? [{ n: 'CP', name: 'CP', k: 'CTL', t: 'in' }, { n: 'CAN_H', name: 'CAN-H', k: 'COMM', t: 'bi' }, { n: 'CAN_L', name: 'CAN-L', k: 'COMM', t: 'bi' }]
        : [{ n: 'CP', name: 'CP', k: 'COMM', t: 'bi' }, { n: 'PP', name: 'PP', k: 'CTL', t: 'in' }];
    const R = sig === 'gb'
      ? [{ n: 'TX', name: 'CAN-H', k: 'COMM', t: 'bi' }, { n: 'RX', name: 'CAN-L', k: 'COMM', t: 'bi' },
        { n: 'CS', name: '连接确认', k: 'CTL', t: 'out' }, { n: 'DP', name: '二极管存在', k: 'CTL', t: 'out' }]
      : sig === 'chademo'
        ? [{ n: 'TX', name: 'CAN-H', k: 'COMM', t: 'bi' }, { n: 'RX', name: 'CAN-L', k: 'COMM', t: 'bi' },
          { n: 'CS', name: '使能d1', k: 'CTL', t: 'out' }, { n: 'DP', name: '互锁d2', k: 'CTL', t: 'in' }]
        : [{ n: 'TX', name: 'CP-PWM', k: 'COMM', t: 'bi' }, { n: 'CS', name: 'PP-状态', k: 'CTL', t: 'out' },
          { n: 'DP', name: '二极管存在', k: 'CTL', t: 'out' }];
    return makeBox({
      w: 172, minH: 112, titleY: 17,
      title: sig === 'gb' ? '引导单元 CC/S±' : sig === 'chademo' ? '引导单元 CP/CAN' : '引导单元 CP',
      sub: sig === 'gb' ? '发生级 + 线性检测 + 二极管存在' : sig === 'chademo' ? 'CP 检测 + CAN 收发 + 使能/互锁' : 'PWM 图腾柱 + 线性采样 + 二极管存在',
      left: L, right: R, pitch: 18, padY: 30,
      bottom: [{ n: 'V+', name: '24V+', k: 'AUX', t: 'in' }, { n: 'V-', name: '24V-', k: 'AUX', t: 'in' }], bpitch: 44,
      extra: [['R', 52, 52, 26, 18], ['P', 'M 82 54 l 0 20 l 16 -10 z'], ['L', 98, 64, 106, 64],
        ['P', 'M 106 58 l 0 12 l 9 -6 z'], ['L', 115, 58, 115, 70]]
    });
  };
  /* 进线 EMC / 防雷前置（分流元件）—— EN科技范式 ★★★★★：X/Y + 压敏 + 高等级 GDT */
  S.emcFront = function () {
    const pitch = 26, d = [], pins = [];
    PHASE4.forEach(function (nm, i) {
      const x = i * pitch;
      d.push(['L', x, 0, x, 16]);
      d.push(['R', x - 6, 16, 12, 18], ['L', x - 8, 20, x + 8, 30]);        /* 压敏电阻 */
      d.push(['L', x, 34, x, 44]);
      d.push(['L', x - 7, 44, x + 7, 44], ['L', x - 7, 49, x + 7, 49]);      /* X 电容 */
      d.push(['L', x, 49, x, 60]);
      pins.push(P(nm, nm, x, 0, 'N', 'AC', 'in', 0));
    });
    const cx = 1.5 * pitch;
    d.push(['L', -8, 60, 3 * pitch + 8, 60, 2.2]);
    d.push(['L', cx, 60, cx, 70]);
    d.push(['L', cx - 8, 70, cx + 8, 70], ['L', cx - 8, 75, cx + 8, 75]);    /* Y 电容 */
    d.push(['L', cx, 75, cx, 84]);
    d.push(['R', cx - 8, 84, 16, 18], ['L', cx - 5, 89, cx + 5, 89], ['L', cx - 5, 97, cx + 5, 97]);  /* GDT */
    d.push(['L', cx, 102, cx, 112]);
    d.push(['T', cx, -8, 'X/Y 电容 + 压敏 + GDT', 7, 'm', 'dim'], ['T', 3 * pitch + 16, 92, 'GDT 3500V', 6.6, 's', 'dim']);
    pins.push(P('PE', 'PE', cx, 112, 'S', 'PE', 'out', 0));
    return { w: 3 * pitch, h: 112, draw: d, pins: pins, tagAt: { x: -20, y: 56, a: 'e' } };
  };

  /* ============================================================
   * 6. 引脚级网表生成器
   * ============================================================ */
  const MODULE_SERIES = [20, 30, 40, 60, 80];

  function pick(series, v) { for (let i = 0; i < series.length; i++) if (series[i] >= v) return series[i]; return null; }

  function build(par) {
    const p = Object.assign({
      name: '示范站 直流充电桩', site: '', std: 'gb', kw: 240, guns: 2, gunA: 250,
      moduleKw: 40, ess: false, essKwh: 200, essClusters: 2, coupling: 'dc', busV: 750
    }, par || {});
    p.name = String(p.name || '示范站 直流充电桩');
    p.busV = Math.max(50, Number(p.busV) || 750);
    p.kw = Math.max(1, Number(p.kw) || 240);
    p.guns = Math.max(1, Math.min(6, Math.round(Number(p.guns) || 2)));
    p.gunA = Math.max(1, Number(p.gunA) || 250);
    p.moduleKw = Math.max(1, Number(p.moduleKw) || 40);
    p.ess = p.ess === true || p.ess === 1 || p.ess === '1' || String(p.ess).toLowerCase() === 'true';
    p.essKwh = Math.max(1, Number(p.essKwh) || 200);
    p.essClusters = Math.max(1, Math.min(4, Math.round(Number(p.essClusters) || 2)));
    p.coupling = p.coupling === 'ac' ? 'ac' : 'dc';
    if (!STDDEF[p.std]) p.std = 'gb';
    const SD = STDDEF[p.std];
    const sig = SD.sig;
    const isGB = sig === 'gb';
    const acV = 400;
    const modCount = Math.max(1, Math.ceil(p.kw / p.moduleKw));
    const modShown = Math.min(modCount, 4);
    const gunTerms = SD.terms;
    const acA = Math.round(p.kw * 1000 / (1.732 * acV * 0.95) + 32);
    const D = [], N = [];
    const dev = function (o) { if (o && o.sym) normSym(o.sym); o.electrical = normalizeElectrical(o.electrical); D.push(o); return o.id; };
    let netSeq = 0;
    const net = function (a, b, cls, o) {
      netSeq++;
      const id = 'N' + String(netSeq).padStart(3, '0');
      N.push(Object.assign({ id: id, name: o && o.name || (a.d + ':' + a.p + '→' + b.d + ':' + b.p), cls: cls, a: a, b: b }, o || {}));
      return id;
    };
    const pin = (d, p2) => ({ d: d, p: p2 });

    /* ---------- 页 1：一次主回路 ---------- */
    const SH1 = 1, SH2 = 2;
    dev({ id: 'XT1', sheet: SH1, zone: 'Z1', tag: 'XT1', name: '交流进线端子排', spec: 'AC ' + acV + 'V 3P+N+PE / ' + acA + 'A', sym: S.termStrip(['L1', 'L2', 'L3', 'N', 'PE'], 'AC') });
    dev({ id: 'QS1', sheet: SH1, zone: 'Z1', tag: 'QS1', name: '进线隔离开关', spec: '4P ' + pickA(acA) + 'A 隔离', sym: makeSwitch({ poles: 4, marker: 'iso' }) });
    dev({ id: 'QF1', sheet: SH1, zone: 'Z1', tag: 'QF1', name: '进线塑壳断路器', spec: '4P ' + pickA(acA) + 'A Icu 待短路计算', sym: makeSwitch({ poles: 4, marker: 'cb' }) });
    dev({ id: 'RCM1', sheet: SH1, zone: 'Z1', tag: 'RCM1', name: '剩余电流监测装置', spec: 'Type B 含直流分量', sym: S.rcm() });
    dev({ id: 'PJ1', sheet: SH1, zone: 'Z1', tag: 'PJ1', name: '交流电能表', spec: '三相四线 RS485', sym: S.meterAC() });
    dev({ id: 'KM1', sheet: SH1, zone: 'Z1', tag: 'KM1', name: '交流主接触器', spec: '4P ' + pickA(acA) + 'A 线圈 DC24V', sym: makeSwitch({ poles: 4, marker: 'km', coil: true }) });

    const acTaps = [{ id: 'IN', wires: PHASE4, side: 'N', label: '进线', gap: 120 }];
    for (let i = 1; i <= modShown; i++) acTaps.push({ id: 'M' + i, wires: PHASE4, side: 'S', label: 'M' + i, gap: 128 }); /* V12e: 110→128 模块走廊加宽至 40px（8px 净空规则下容纳 4 车道干线） */
    acTaps.push({ id: 'SPD', wires: PHASE4, side: 'S', label: 'SPD', gap: 60 });
    acTaps.push({ id: 'T1', wires: ['L1', 'N'], side: 'S', label: 'T1', gap: 40 });
    acTaps.push({ id: 'T2', wires: ['L2', 'N'], side: 'S', label: 'T2', gap: 40 });
    acTaps.push({ id: 'PEC', wires: ['L1', 'N'], side: 'S', label: 'PE检测', gap: 40 });
    if (p.ess && p.coupling === 'ac') acTaps.push({ id: 'PCS', wires: PHASE4, side: 'S', label: 'PCS', gap: 60 });
    dev({ id: 'WB1', sheet: SH1, zone: 'Z1', tag: 'WB1', name: '交流分配母排', spec: acV + 'V ' + pickA(acA * 1.25) + 'A', sym: makeBus({ bars: [{ name: 'L1', k: 'AC' }, { name: 'L2', k: 'AC' }, { name: 'L3', k: 'AC' }, { name: 'N', k: 'AC' }], taps: acTaps, dropPitch: 26 }) });
    dev({ id: 'QF2', sheet: SH1, zone: 'Z1', tag: 'QF2', name: 'SPD 后备断路器', spec: '4P 63A gG', sym: makeSwitch({ poles: 4, marker: 'cb' }) });
    dev({ id: 'FV1', sheet: SH1, zone: 'Z1', tag: 'FV1', name: '电源电涌保护器', spec: 'T2 3P+N Up 待评估', sym: S.spd() });
    dev({ id: 'FE1', sheet: SH1, zone: 'Z1', tag: 'FE1', name: '进线 EMC / 防雷前置', spec: 'X/Y 电容 + 压敏 + GDT 3500V（分流）', sym: S.emcFront() });
    dev({ id: 'PEC1', sheet: SH1, zone: 'Z1', tag: 'PEC1', name: 'PE 有效性检测单元', spec: '双运放差分精密检测', sym: S.peDet() });
    dev({ id: 'PE0', sheet: SH1, zone: 'Z0', tag: 'PE0', name: '接地极 / 柜体等电位', spec: '接地电阻实测待定', sym: S.earth() });
    dev({ id: 'PE1', sheet: SH1, zone: 'Z0', tag: 'PE1', name: '保护接地排', spec: 'Cu 30×4 等电位', sym: makeBus({ bars: [{ name: 'PE', k: 'PE' }], taps: pePlan(p, modShown), out: 20 }) });

    for (let i = 1; i <= modShown; i++) {
      dev({
        id: 'M' + i, sheet: SH1, zone: 'Z2', tag: 'M' + i, name: '充电功率模块', spec: p.moduleKw + 'kW ' + SD.vRange + (i === modShown && modCount > modShown ? ' ×' + (modCount - modShown + 1) + '（同接线）' : ''),
        sym: makeBox({
          w: 150, minH: 96, glyph: 'acdc', title: '充电模块 M' + i, sub: p.moduleKw + 'kW AC/DC',
          top: PHASE4.map(function (nm) { return { n: nm, name: nm, k: 'AC', t: 'in' }; }), /* V12: PE 翻下侧 */
          bottom: [{ n: 'DC+', name: 'DC+', k: 'DC', t: 'out' }, { n: 'DC-', name: 'DC-', k: 'DC', t: 'out' }, { n: 'PE', name: 'PE', k: 'PE', t: 'in' }],
          right: [{ n: 'CANH', name: 'CANH', k: 'COMM', t: 'bi' }, { n: 'CANL', name: 'CANL', k: 'COMM', t: 'bi' }], tpitch: 26, bpitch: 46
        })
      });
    }
    const wcTaps = [];
    for (let i = 1; i <= modShown; i++) wcTaps.push({ id: 'M' + i, wires: ['DC+', 'DC-'], side: 'N', label: 'M' + i, gap: 160 }); /* V12e: 142→160 与 WB1 同步加宽，保持模块上下对齐 */
    wcTaps.push({ id: 'OUT', wires: ['DC+', 'DC-'], side: 'S', label: '汇流出', gap: 40 });
    dev({ id: 'WBC', sheet: SH1, zone: 'Z3', tag: 'WBC', name: '模块直流汇流排', spec: p.busV + 'V', sym: makeBus({ bars: [{ name: 'DC+', k: 'DC' }, { name: 'DC-', k: 'DC' }], taps: wcTaps, dropPitch: 46 }) });

    dev({ id: 'FU1', sheet: SH1, zone: 'Z3', tag: 'FU1', name: '直流总快速熔断器', spec: 'aR ' + pickA(p.kw * 1000 / p.busV * 1.3) + 'A / 1000VDC', sym: makeFuse({}) });
    dev({ id: 'TA1', sheet: SH1, zone: 'Z3', tag: 'TA1', name: '直流霍尔电流传感器', spec: '±' + pickA(p.kw * 1000 / p.busV * 1.5) + 'A 开环', sym: S.hall() });
    dev({ id: 'PJ2', sheet: SH1, zone: 'Z3', tag: 'PJ2', name: '直流电能表', spec: '1000V / ' + pickA(p.kw * 1000 / p.busV * 1.3) + 'A', sym: S.meterDC() });
    dev({ id: 'RI1', sheet: SH1, zone: 'Z3', tag: 'RI1', name: '直流绝缘监测装置', spec: '判据按 GB/T 18487.1 项目确认', sym: S.imd() });
    dev({ id: 'K0', sheet: SH1, zone: 'Z3', tag: 'K0', name: '泄放接触器', spec: '1P 10A 线圈 DC24V', sym: makeSwitch({ poles: 1, marker: 'km', coil: true, names: ['DC+'], k: 'DC' }) });
    dev({ id: 'RS0', sheet: SH1, zone: 'Z3', tag: 'RS0', name: '母线泄放电阻', spec: '阻值待电容量核算', sym: makeRes({ k: 'DC' }) });

    const dcTaps = [];
    if (p.ess && p.coupling === 'dc') dcTaps.push({ id: 'ESS', wires: ['DC+', 'DC-'], side: 'S', label: 'DC/DC', gap: 80 }); /* V9: 储能 DC/DC 在母线下方，tap 朝下 */
    dcTaps.push({ id: 'IMD', wires: ['DC+', 'DC-'], side: 'N', label: 'IMD', gap: 160 });
    dcTaps.push({ id: 'IN', wires: ['DC+', 'DC-'], side: 'N', label: '模块汇流', gap: 120 });
    dcTaps.push({ id: 'BLD', wires: ['DC+', 'DC-'], side: 'S', label: '泄放', gap: 700 });
    for (let g = 1; g <= p.guns; g++) dcTaps.push({ id: 'G' + g, wires: ['DC+', 'DC-'], side: 'S', label: '枪' + g, gap: 700 });
    dev({ id: 'WB2', sheet: SH1, zone: 'Z3', tag: 'WB2', name: '充电直流主母线', spec: p.busV + 'V ' + pickA(p.kw * 1000 / p.busV * 1.3) + 'A', sym: makeBus({ bars: [{ name: 'DC+', k: 'DC' }, { name: 'DC-', k: 'DC' }], taps: dcTaps, barPitch: 18, dropPitch: 34 }) });

    for (let g = 1; g <= p.guns; g++) {
      dev({ id: 'FU' + (g + 1), sheet: SH1, zone: 'Z4', tag: 'FU' + (g + 1), name: '枪' + g + ' 直流快熔', spec: 'aR ' + pickA(p.gunA * 1.25) + 'A / 1000VDC', sym: makeFuse({}) });
      dev({ id: 'K' + g + 'P', sheet: SH1, zone: 'Z4', tag: 'K' + g + 'P', name: '枪' + g + ' 正极直流接触器', spec: pickA(p.gunA * 1.15) + 'A 线圈 DC24V', sym: makeSwitch({ poles: 1, marker: 'km', coil: true, names: ['DC+'], k: 'DC' }) });
      dev({ id: 'K' + g + 'N', sheet: SH1, zone: 'Z4', tag: 'K' + g + 'N', name: '枪' + g + ' 负极直流接触器', spec: pickA(p.gunA * 1.15) + 'A 线圈 DC24V', sym: makeSwitch({ poles: 1, marker: 'km', coil: true, names: ['DC-'], k: 'DC' }) });
      dev({ id: 'YV' + g, sheet: SH1, zone: 'Z4', tag: 'YV' + g, name: '枪' + g + ' 电子锁', spec: 'DC12V 含锁到位反馈', sym: S.lock() });
      dev({ id: 'KF' + g, sheet: SH1, zone: 'Z4', tag: 'KF' + g, name: '枪' + g + ' 接触器粘连检测', spec: '阻容分压 + ADC（正/负极均覆盖）', sym: S.stickDet() });
      dev({ id: 'SC' + g, sheet: SH1, zone: 'Z4', tag: 'SC' + g, name: '枪' + g + ' 合闸前短路检测', spec: '双继电器 + 光耦隔离', sym: S.scDet() });
      dev({ id: 'XS' + g, sheet: SH1, zone: 'Z4', tag: 'XS' + g, name: '枪' + g + ' 充电连接器', spec: SD.spec + ' ' + p.gunA + 'A', sym: S.gun(p.std, gunTerms) });
    }

    if (p.ess) {
      const cl = Math.max(1, p.essClusters);
      const essTaps = [{ id: 'CV', wires: ['B+', 'B-'], side: 'N', label: '变换器', gap: 120 }];
      for (let i = 1; i <= cl; i++) essTaps.push({ id: 'B' + i, wires: ['B+', 'B-'], side: 'S', label: '簇' + i, gap: 150 }, { id: 'B' + i + 'R', wires: ['B+'], side: 'S', label: '簇' + i + '预充', gap: 300 });
      dev({ id: 'WB3', sheet: SH1, zone: 'Z5', tag: 'WB3', name: '储能直流母线', spec: '标称 ' + p.busV + 'V ' + Math.round(p.essKwh) + 'kWh', sym: makeBus({ bars: [{ name: 'B+', k: 'ESS' }, { name: 'B-', k: 'ESS' }], taps: essTaps, barPitch: 18, dropPitch: 34 }) });
      for (let i = 1; i <= cl; i++) {
        dev({ id: 'GB' + i, sheet: SH1, zone: 'Z5', tag: 'GB' + i, name: '电池簇 ' + i, spec: Math.round(p.essKwh / cl) + 'kWh LFP', sym: S.battery(i) });
        dev({ id: 'FB' + i, sheet: SH1, zone: 'Z5', tag: 'FB' + i, name: '簇' + i + ' 熔断器', spec: 'gR ' + pickA(300) + 'A', sym: makeFuse({ k: 'ESS' }) });
        dev({ id: 'KB' + i + 'P', sheet: SH1, zone: 'Z5', tag: 'KB' + i + 'P', name: '簇' + i + ' 主正接触器', spec: '200A 线圈 DC24V', sym: makeSwitch({ poles: 1, marker: 'km', coil: true, names: ['B+'], k: 'ESS' }) });
        dev({ id: 'KB' + i + 'N', sheet: SH1, zone: 'Z5', tag: 'KB' + i + 'N', name: '簇' + i + ' 主负接触器', spec: '200A 线圈 DC24V', sym: makeSwitch({ poles: 1, marker: 'km', coil: true, names: ['B-'], k: 'ESS' }) });
        dev({ id: 'KB' + i + 'R', sheet: SH1, zone: 'Z5', tag: 'KB' + i + 'R', name: '簇' + i + ' 预充接触器', spec: '50A 线圈 DC24V', sym: makeSwitch({ poles: 1, marker: 'km', coil: true, names: ['B+'], k: 'ESS' }) });
        dev({ id: 'RB' + i, sheet: SH1, zone: 'Z5', tag: 'RB' + i, name: '簇' + i + ' 预充电阻', spec: '200W 30Ω', sym: makeRes({ k: 'ESS' }) });
      }
      if (p.coupling === 'dc') {
        dev({
          id: 'M9', sheet: SH1, zone: 'Z5', tag: 'M9', name: '储能双向 DC/DC', spec: Math.round(p.essKwh / 2) + 'kW 级 待复核', sym: makeBox({
            w: 140, minH: 100, glyph: 'dcdc', title: '双向 DC/DC', sub: '储能 ↔ 充电母线',
            left: [{ n: 'B+', name: 'B+', k: 'ESS', t: 'in' }, { n: 'B-', name: 'B-', k: 'ESS', t: 'in' }],
            right: [{ n: 'DC+', name: 'DC+', k: 'DC', t: 'out' }, { n: 'DC-', name: 'DC-', k: 'DC', t: 'out' }],
            bottom: [{ n: 'CANH', name: 'CANH', k: 'COMM', t: 'bi' }, { n: 'CANL', name: 'CANL', k: 'COMM', t: 'bi' }, { n: 'PE', name: 'PE', k: 'PE', t: 'in' }], bpitch: 40
          })
        });
      } else {
        dev({
          id: 'M9', sheet: SH1, zone: 'Z5', tag: 'M9', name: '储能双向变流器 PCS', spec: Math.round(p.essKwh / 2) + 'kW 级 待复核', sym: makeBox({
            w: 140, minH: 110, glyph: 'dcac', title: 'PCS', sub: '储能 ↔ 交流母排',
            left: [{ n: 'B+', name: 'B+', k: 'ESS', t: 'in' }, { n: 'B-', name: 'B-', k: 'ESS', t: 'in' }],
            right: PHASE4.map(function (nm) { return { n: nm, name: nm, k: 'AC', t: 'out' }; }),
            bottom: [{ n: 'CANH', name: 'CANH', k: 'COMM', t: 'bi' }, { n: 'CANL', name: 'CANL', k: 'COMM', t: 'bi' }, { n: 'PE', name: 'PE', k: 'PE', t: 'in' }], bpitch: 40
          })
        });
      }
    }

    /* ---------- 页 2：二次控制、通信与辅助电源 ---------- */
    dev({
      id: 'T1', sheet: SH2, zone: 'Z7', tag: 'T1', name: '开关电源 DC24V', spec: '4500W 24V', sym: makeBox({
        w: 120, minH: 84, glyph: 'acdc', title: '开关电源', sub: 'AC→DC 24V',
        left: [{ n: 'L', name: 'L', k: 'AC', t: 'in' }, { n: 'N', name: 'N', k: 'AC', t: 'in' }, { n: 'PE', name: 'PE', k: 'PE', t: 'in' }],
        right: [{ n: 'V+', name: '24V+', k: 'AUX', t: 'out' }, { n: 'V-', name: '24V-', k: 'AUX', t: 'out' }]
      })
    });
    dev({
      id: 'T2', sheet: SH2, zone: 'Z7', tag: 'T2', name: '开关电源 DC12V', spec: '360W 12V', sym: makeBox({
        w: 120, minH: 84, glyph: 'acdc', title: '开关电源', sub: 'AC→DC 12V',
        left: [{ n: 'L', name: 'L', k: 'AC', t: 'in' }, { n: 'N', name: 'N', k: 'AC', t: 'in' }, { n: 'PE', name: 'PE', k: 'PE', t: 'in' }],
        right: [{ n: 'V+', name: '12V+', k: 'AUX', t: 'out' }, { n: 'V-', name: '12V-', k: 'AUX', t: 'out' }]
      })
    });
    const COILS = [{ id: 'KM1' }, { id: 'K0' }];
    for (let g = 1; g <= p.guns; g++) COILS.push({ id: 'K' + g + 'P' }, { id: 'K' + g + 'N' });
    if (p.ess) for (let i = 1; i <= Math.max(1, p.essClusters); i++) COILS.push({ id: 'KB' + i + 'P' }, { id: 'KB' + i + 'N' }, { id: 'KB' + i + 'R' });
    const auxTaps = [
      { id: 'T1', wires: ['24V+', '24V-'], side: 'N', label: 'T1', gap: 40 },
      { id: 'T2', wires: ['12V+', '12V-'], side: 'N', label: 'T2', gap: 40 },
      { id: 'A1', wires: ['24V+', '24V-'], side: 'S', label: 'A1', gap: 26 },
      { id: 'A2', wires: ['12V+', '12V-'], side: 'S', label: 'A2', gap: 26 },
      { id: 'A3', wires: ['12V+', '12V-'], side: 'S', label: 'A3', gap: 26 },
      { id: 'A4', wires: ['12V+', '12V-'], side: 'S', label: 'A4', gap: 26 },
      { id: 'HL', wires: ['24V+', '24V-'], side: 'S', label: 'HL1', gap: 26 },
      { id: 'SAF', wires: ['24V+', '24V-'], side: 'S', label: '安全回路', gap: 26 },
      { id: 'MF', wires: ['24V+', '24V-'], side: 'S', label: 'MF1', gap: 26 },
      { id: 'TA1', wires: ['24V+', '24V-'], side: 'S', label: 'TA1', gap: 26 },
      { id: 'RI1', wires: ['24V+', '24V-'], side: 'S', label: 'RI1', gap: 26 },
      { id: 'RCM1', wires: ['24V+', '24V-'], side: 'S', label: 'RCM1', gap: 26 }
    ];
    if (p.ess) auxTaps.push({ id: 'A5', wires: ['24V+', '24V-'], side: 'S', label: 'A5', gap: 26 });
    auxTaps.push({ id: 'PEC', wires: ['24V+', '24V-'], side: 'S', label: 'PEC1', gap: 26 });
    for (let g = 1; g <= p.guns; g++) auxTaps.push(
      { id: 'KF' + g, wires: ['24V+', '24V-'], side: 'S', label: 'KF' + g, gap: 26 },
      { id: 'SC' + g, wires: ['24V+', '24V-'], side: 'S', label: 'SC' + g, gap: 26 },
      { id: 'CG' + g, wires: ['24V+', '24V-'], side: 'S', label: 'CG' + g, gap: 26 });
    if (p.ess) for (let i = 1; i <= Math.max(1, p.essClusters); i++) auxTaps.push({ id: 'HT' + i, wires: ['24V+'], side: 'S', label: '簇' + i + '加热', gap: 24 }, { id: 'BC' + i, wires: ['24V+', '24V-'], side: 'S', label: '簇' + i + 'BCU', gap: 26 });
    COILS.forEach(function (c) { auxTaps.push({ id: 'C' + c.id, wires: ['24V-'], side: 'S', label: c.id, gap: 24 }); });
    for (let g = 1; g <= p.guns; g++) auxTaps.push({ id: 'YV' + g, wires: ['12V-'], side: 'S', label: 'YV' + g, gap: 24 }, { id: 'FB' + g, wires: ['12V-'], side: 'S', label: 'YV' + g + '反馈', gap: 24 });
    /* v2.0.9: WB4 母排移除（四轨=全局电源符号） */

    const ccuLeft = [{ n: 'X1.1', name: '24V+', k: 'AUX', t: 'in' }, { n: 'X1.2', name: '24V-', k: 'AUX', t: 'in' },
      { n: 'X2.1', name: 'CANH1', k: 'COMM', t: 'bi' }, { n: 'X2.2', name: 'CANL1', k: 'COMM', t: 'bi' },
      { n: 'X2.3', name: 'CANH2', k: 'COMM', t: 'bi' }, { n: 'X2.4', name: 'CANL2', k: 'COMM', t: 'bi' },
      { n: 'X3.1', name: 'RS485A', k: 'COMM', t: 'bi' }, { n: 'X3.2', name: 'RS485B', k: 'COMM', t: 'bi' },
      { n: 'X4.1', name: 'ESTOP', k: 'SAF', t: 'in' }, { n: 'X4.2', name: 'DOOR', k: 'SAF', t: 'in' },
      { n: 'X5.1', name: 'IA-IN', k: 'CTL', t: 'in' }, { n: 'X5.2', name: 'IMD-ALM', k: 'CTL', t: 'in' }, { n: 'X5.3', name: 'RCM-ALM', k: 'CTL', t: 'in' }];
    for (let g = 1; g <= p.guns; g++) {
      ccuLeft.push({ n: 'X6.' + g, name: 'KF' + g + '-ADC', k: 'CTL', t: 'in' });
      ccuLeft.push({ n: 'X7.' + g, name: 'SC' + g + '-DO', k: 'CTL', t: 'in' });
    }
    ccuLeft.push({ n: 'X5.4', name: 'PE-ADC', k: 'CTL', t: 'in' });
    const ccuRight = [{ n: 'Y0.1', name: 'KM1', k: 'CTL', t: 'out' }, { n: 'Y0.2', name: 'K0', k: 'CTL', t: 'out' }];
    for (let g = 1; g <= p.guns; g++) {
      ccuRight.push({ n: 'Y' + g + '.1', name: 'K' + g + 'P', k: 'CTL', t: 'out' });
      ccuRight.push({ n: 'Y' + g + '.2', name: 'K' + g + 'N', k: 'CTL', t: 'out' });
      ccuRight.push({ n: 'Y' + g + '.3', name: 'YV' + g, k: 'CTL', t: 'out' });
      ccuRight.push({ n: 'Y' + g + '.4', name: 'YV' + g + '-FB', k: 'CTL', t: 'in' });
      ccuRight.push({ n: 'Y' + g + '.5', name: 'SC' + g + '-EN', k: 'CTL', t: 'out' });
      if (sig === 'cp') {
        ccuRight.push({ n: 'G' + g + '.1', name: 'PP-状态' + g, k: 'CTL', t: 'in' });
        ccuRight.push({ n: 'G' + g + '.2', name: '二极管存在' + g, k: 'CTL', t: 'in' });
      } else {
        ccuRight.push({ n: 'G' + g + '.1', name: 'CAN-H枪' + g, k: 'COMM', t: 'bi' });
        ccuRight.push({ n: 'G' + g + '.2', name: 'CAN-L枪' + g, k: 'COMM', t: 'bi' });
        ccuRight.push({ n: 'G' + g + '.3', name: sig === 'chademo' ? '使能d1-' + g : '连接确认' + g, k: 'CTL', t: 'in' });
        ccuRight.push({ n: 'G' + g + '.4', name: sig === 'chademo' ? '互锁d2-' + g : '二极管存在' + g, k: 'CTL', t: 'in' });
      }
    }
    dev({
      id: 'A1', sheet: SH2, zone: 'Z6', tag: 'A1', name: '充电控制单元 CCU', spec: SD.proto, sym: makeBox({
        w: 190, title: '充电控制单元 CCU', sub: 'A1', left: ccuLeft, right: ccuRight, pitch: 19, padY: 30,
        bottom: [{ n: 'ETH1', name: 'ETH1', k: 'COMM', t: 'bi' }, { n: 'PE', name: 'PE', k: 'PE', t: 'in' }]
      })
    });
    const seccRight = [{ n: 'ETH1', name: 'ETH-CCU', k: 'COMM', t: 'bi' }, { n: 'ETH2', name: 'ETH-WAN', k: 'COMM', t: 'bi' }];
    if (sig === 'cp') for (let g = 1; g <= p.guns; g++) seccRight.push({ n: 'CP' + g, name: 'CP-' + g, k: 'COMM', t: 'bi' });
    dev({
      id: 'A2', sheet: SH2, zone: 'Z6', tag: 'A2', name: SD.a2, spec: SD.a2spec, sym: makeBox({
        w: 160, title: SD.a2title, sub: 'A2',
        left: [{ n: 'X1.1', name: '12V+', k: 'AUX', t: 'in' }, { n: 'X1.2', name: '12V-', k: 'AUX', t: 'in' }], right: seccRight, padY: 26
      })
    });
    dev({
      id: 'A3', sheet: SH2, zone: 'Z6', tag: 'A3', name: '4G/以太网路由器', spec: '含三合一天线', sym: makeBox({
        w: 140, title: '路由器', sub: 'A3',
        left: [{ n: 'X1.1', name: '12V+', k: 'AUX', t: 'in' }, { n: 'X1.2', name: '12V-', k: 'AUX', t: 'in' }],
        right: [{ n: 'LAN1', name: 'LAN1', k: 'COMM', t: 'bi' }, { n: 'ANT', name: 'ANT', k: 'COMM', t: 'bi' }]
      })
    });
    dev({
      id: 'A4', sheet: SH2, zone: 'Z6', tag: 'A4', name: '人机交互（显示屏/读卡器）', spec: '7" 触摸 + RFID', sym: makeBox({
        w: 140, title: 'HMI', sub: 'A4',
        left: [{ n: 'X1.1', name: '12V+', k: 'AUX', t: 'in' }, { n: 'X1.2', name: '12V-', k: 'AUX', t: 'in' }],
        right: [{ n: 'LAN1', name: 'LAN', k: 'COMM', t: 'bi' }]
      })
    });
    dev({ id: 'SB1', sheet: SH2, zone: 'Z6', tag: 'SB1', name: '急停按钮', spec: '蘑菇头 自锁 双断点', sym: S.estop() });
    for (let g = 1; g <= p.guns; g++) {
      dev({ id: 'CG' + g, sheet: SH2, zone: 'Z6', tag: 'CG' + g, name: '枪' + g + ' 充电控制引导单元', spec: sig === 'gb' ? '发生+检测+二极管存在（GB/T 18487.1）' : sig === 'chademo' ? 'CP 检测 + CAN 收发（CHAdeMO）' : 'CP PWM 图腾柱 + 线性采样 + 二极管存在', sym: S.guide(sig) });
    }
    dev({ id: 'SQ1', sheet: SH2, zone: 'Z6', tag: 'SQ1', name: '柜门门禁/防拆开关', spec: '常闭', sym: S.posSwitch() });
    dev({ id: 'HL1', sheet: SH2, zone: 'Z6', tag: 'HL1', name: '状态指示灯', spec: 'DC24V 三色', sym: S.lamp() });
    dev({ id: 'MF1', sheet: SH2, zone: 'Z7', tag: 'MF1', name: '热管理风机', spec: '轴流 DC24V 含转速反馈', sym: S.motor('M') });
    dev({ id: 'PE2', sheet: SH2, zone: 'Z0', tag: 'PE2', name: '二次侧保护接地端子排', spec: '与页 1 PE1 等电位', sym: makeBus({ bars: [{ name: 'PE', k: 'PE' }], taps: [{ id: 'IN', wires: ['PE'], side: 'N', label: '←页1', gap: 70 }, { id: 'T1', wires: ['PE'], side: 'N', label: 'T1', gap: 70 }, { id: 'T2', wires: ['PE'], side: 'N', label: 'T2', gap: 70 }, { id: 'A1', wires: ['PE'], side: 'N', label: 'A1', gap: 70 }], out: 18 }) });
    if (p.ess) {
      const bamsRight = [{ n: 'Y1', name: 'KB+', k: 'CTL', t: 'out' }, { n: 'Y2', name: 'KB-', k: 'CTL', t: 'out' }, { n: 'Y3', name: 'KB-PRE', k: 'CTL', t: 'out' }];
      dev({
        id: 'A5', sheet: SH2, zone: 'Z6', tag: 'A5', name: '电池管理主控 BAMS', spec: '簇级 BCU 汇聚 + 主控', sym: makeBox({
          w: 170, title: '电池管理主控 BAMS', sub: 'A5',
          left: [{ n: 'X1.1', name: '24V+', k: 'AUX', t: 'in' }, { n: 'X1.2', name: '24V-', k: 'AUX', t: 'in' },
            { n: 'X2.1', name: 'INCANH', k: 'COMM', t: 'bi' }, { n: 'X2.2', name: 'INCANL', k: 'COMM', t: 'bi' },
            { n: 'X3.1', name: 'CANH', k: 'COMM', t: 'bi' }, { n: 'X3.2', name: 'CANL', k: 'COMM', t: 'bi' }],
          right: bamsRight, padY: 26
        })
      });
    }

    /* ---------- 网表（引脚级，点对点） ---------- */
    /* 交流进线链 */
    PHASE4.forEach(function (nm, i) {
      net(pin('XT1', nm), pin('QS1', String(2 * i + 1)), 'AC', { name: 'AC-IN-' + nm, wire: '进线电缆 ' + nm });
      net(pin('QS1', String(2 * i + 2)), pin('QF1', String(2 * i + 1)), 'AC', { name: 'AC-QS-QF-' + nm });
      net(pin('QF1', String(2 * i + 2)), pin('RCM1', String(2 * i + 1)), 'AC', { name: 'AC-QF-RCM-' + nm });
      net(pin('RCM1', String(2 * i + 2)), pin('PJ1', String(2 * i + 1)), 'AC', { name: 'AC-RCM-PJ-' + nm });
      net(pin('PJ1', String(2 * i + 2)), pin('KM1', String(2 * i + 1)), 'AC', { name: 'AC-PJ-KM-' + nm });
      net(pin('KM1', String(2 * i + 2)), pin('WB1', 'IN.' + nm), 'AC', { name: 'AC-KM-WB1-' + nm });
      net(pin('WB1', 'SPD.' + nm), pin('QF2', String(2 * i + 1)), 'AC', { name: 'AC-SPD-QF2-' + nm });
      net(pin('QF2', String(2 * i + 2)), pin('FV1', nm), 'AC', { name: 'AC-SPD-' + nm });
    });
    net(pin('XT1', 'PE'), pin('PE1', 'IN.PE'), 'PE', { name: 'PE-IN' });
    net(pin('PE1', 'CAB.PE'), pin('PE0', 'PE'), 'PE', { name: 'PE-EARTH' });
    /* 进线 EMC 分流元件（V-EMC-01：X 与 Y 路径均必备） */
    PHASE4.forEach(function (nm, i) {
      net(pin('QS1', String(2 * i + 2)), pin('FE1', nm), 'AC', { name: 'AC-EMC-' + nm });
    });
    net(pin('FE1', 'PE'), pin('PE1', 'EMC.PE'), 'PE', { name: 'PE-EMC' });
    /* PE 有效性检测（V-PE-01/02） */
    net(pin('WB1', 'PEC.L1'), pin('PEC1', 'L'), 'AC', { name: 'AC-PEC-L' });
    net(pin('WB1', 'PEC.N'), pin('PEC1', 'N'), 'AC', { name: 'AC-PEC-N' });
    net(pin('PE1', 'DET.PE'), pin('PEC1', 'PE'), 'PE', { name: 'PE-PEC' });
    net(pin('FV1', 'PE'), pin('PE1', 'SPD.PE'), 'PE', { name: 'PE-SPD' });

    /* 模块交流进线 + 直流汇流 */
    for (let i = 1; i <= modShown; i++) {
      PHASE4.forEach(function (nm) { net(pin('WB1', 'M' + i + '.' + nm), pin('M' + i, nm), 'AC', { name: 'AC-M' + i + '-' + nm }); });
      net(pin('PE1', 'M' + i + '.PE'), pin('M' + i, 'PE'), 'PE', { name: 'PE-M' + i });
      net(pin('M' + i, 'DC+'), pin('WBC', 'M' + i + '.DC+'), 'DC', { name: 'DC-M' + i + '-P' });
      net(pin('M' + i, 'DC-'), pin('WBC', 'M' + i + '.DC-'), 'DC', { name: 'DC-M' + i + '-N' });
    }
    /* 直流保护计量链 */
    net(pin('WBC', 'OUT.DC+'), pin('FU1', '1'), 'DC', { name: 'DC-WBC-FU1' });
    net(pin('FU1', '2'), pin('TA1', 'P1'), 'DC', { name: 'DC-FU1-TA1' });
    net(pin('TA1', 'P2'), pin('PJ2', '1'), 'DC', { name: 'DC-TA1-PJ2-P' });
    net(pin('WBC', 'OUT.DC-'), pin('PJ2', '3'), 'DC', { name: 'DC-WBC-PJ2-N' });
    net(pin('PJ2', '2'), pin('WB2', 'IN.DC+'), 'DC', { name: 'DC-PJ2-WB2-P' });
    net(pin('PJ2', '4'), pin('WB2', 'IN.DC-'), 'DC', { name: 'DC-PJ2-WB2-N' });
    net(pin('WB2', 'IMD.DC+'), pin('RI1', 'DC+'), 'DC', { name: 'DC-IMD-P' });
    net(pin('WB2', 'IMD.DC-'), pin('RI1', 'DC-'), 'DC', { name: 'DC-IMD-N' });
    net(pin('RI1', 'PE'), pin('PE1', 'IMD.PE'), 'PE', { name: 'PE-IMD' });
    net(pin('WB2', 'BLD.DC+'), pin('K0', '1'), 'DC', { name: 'DC-BLD-K0' });
    net(pin('K0', '2'), pin('RS0', '1'), 'DC', { name: 'DC-K0-RS0' });
    net(pin('RS0', '2'), pin('WB2', 'BLD.DC-'), 'DC', { name: 'DC-RS0-N' });

    /* 枪回路 */
    for (let g = 1; g <= p.guns; g++) {
      net(pin('WB2', 'G' + g + '.DC+'), pin('FU' + (g + 1), '1'), 'DC', { name: 'DC-G' + g + '-FU' });
      net(pin('FU' + (g + 1), '2'), pin('K' + g + 'P', '1'), 'DC', { name: 'DC-G' + g + '-FU-KP' });
      net(pin('K' + g + 'P', '2'), pin('XS' + g, 'DC+'), 'DC', { name: 'DC-G' + g + '-KP-GUN', wire: '枪线 DC+' });
      net(pin('WB2', 'G' + g + '.DC-'), pin('K' + g + 'N', '1'), 'DC', { name: 'DC-G' + g + '-KN' });
      net(pin('K' + g + 'N', '2'), pin('XS' + g, 'DC-'), 'DC', { name: 'DC-G' + g + '-KN-GUN', wire: '枪线 DC-' });
      net(pin('PE1', 'G' + g + '.PE'), pin('XS' + g, 'PE'), 'PE', { name: 'PE-G' + g });
      /* 粘连检测：正/负极接触器进出侧四点采样（V-ST-01） */
      net(pin('K' + g + 'P', '1'), pin('KF' + g, '1'), 'DC', { name: 'DET-G' + g + '-KP-IN' });
      net(pin('K' + g + 'P', '2'), pin('KF' + g, '2'), 'DC', { name: 'DET-G' + g + '-KP-OUT' });
      net(pin('K' + g + 'N', '1'), pin('KF' + g, '3'), 'DC', { name: 'DET-G' + g + '-KN-IN' });
      net(pin('K' + g + 'N', '2'), pin('KF' + g, '4'), 'DC', { name: 'DET-G' + g + '-KN-OUT' });
      /* 合闸前短路检测：接在接触器下游、枪侧（V-SC-01） */
      net(pin('K' + g + 'P', '2'), pin('SC' + g, '1'), 'DC', { name: 'DET-G' + g + '-SC-P' });
      net(pin('K' + g + 'N', '2'), pin('SC' + g, '2'), 'DC', { name: 'DET-G' + g + '-SC-N' });
    }

    /* 储能一次 */
    if (p.ess) {
      const cl = Math.max(1, p.essClusters);
      for (let i = 1; i <= cl; i++) {
        net(pin('GB' + i, '+'), pin('FB' + i, '2'), 'ESS', { name: 'ESS-B' + i + '-FUSE' }); /* V12: 链序修正 GB→熔断开侧(下) */
        net(pin('FB' + i, '1'), pin('KB' + i + 'P', '2'), 'ESS', { name: 'ESS-B' + i + '-KP' }); /* V12: 熔断进侧(上)→接触器开侧(下) */
        net(pin('KB' + i + 'P', '1'), pin('WB3', 'B' + i + '.B+'), 'ESS', { name: 'ESS-B' + i + '-BUS-P' }); /* V12: 接触器进侧(上)→母线 */
        net(pin('FB' + i, '2'), pin('KB' + i + 'R', '1'), 'ESS', { name: 'ESS-B' + i + '-PRE-IN' });
        net(pin('KB' + i + 'R', '2'), pin('RB' + i, '1'), 'ESS', { name: 'ESS-B' + i + '-PRE-R' });
        net(pin('RB' + i, '2'), pin('WB3', 'B' + i + 'R.B+'), 'ESS', { name: 'ESS-B' + i + '-PRE-BUS' });
        net(pin('GB' + i, '-'), pin('KB' + i + 'N', '2'), 'ESS', { name: 'ESS-B' + i + '-KN' }); /* V12: 链序修正 */
        net(pin('KB' + i + 'N', '1'), pin('WB3', 'B' + i + '.B-'), 'ESS', { name: 'ESS-B' + i + '-BUS-N' }); /* V12: 链序修正 */
      }
      net(pin('WB3', 'CV.B+'), pin('M9', 'B+'), 'ESS', { name: 'ESS-CV-P' });
      net(pin('WB3', 'CV.B-'), pin('M9', 'B-'), 'ESS', { name: 'ESS-CV-N' });
      net(pin('PE1', 'ESS.PE'), pin('M9', 'PE'), 'PE', { name: 'PE-M9' });
      if (p.coupling === 'dc') {
        net(pin('M9', 'DC+'), pin('WB2', 'ESS.DC+'), 'DC', { name: 'DC-ESS-IN-P' });
        net(pin('M9', 'DC-'), pin('WB2', 'ESS.DC-'), 'DC', { name: 'DC-ESS-IN-N' });
      } else {
        PHASE4.forEach(function (nm) { net(pin('M9', nm), pin('WB1', 'PCS.' + nm), 'AC', { name: 'AC-PCS-' + nm }); });
      }
    }

    /* 辅助电源（页2） */
    net(pin('T1', 'V+'), pin('WB4', 'T1.24V+'), 'AUX', { name: 'AUX-T1-P' });
    net(pin('T1', 'V-'), pin('WB4', 'T1.24V-'), 'AUX', { name: 'AUX-T1-N' });
    net(pin('T2', 'V+'), pin('WB4', 'T2.12V+'), 'AUX', { name: 'AUX-T2-P' });
    net(pin('T2', 'V-'), pin('WB4', 'T2.12V-'), 'AUX', { name: 'AUX-T2-N' });
    net(pin('WB4', 'A1.24V+'), pin('A1', 'X1.1'), 'AUX', { name: 'AUX-A1-P' });
    net(pin('WB4', 'A1.24V-'), pin('A1', 'X1.2'), 'AUX', { name: 'AUX-A1-N' });
    net(pin('WB4', 'A2.12V+'), pin('A2', 'X1.1'), 'AUX', { name: 'AUX-A2-P' });
    net(pin('WB4', 'A2.12V-'), pin('A2', 'X1.2'), 'AUX', { name: 'AUX-A2-N' });
    net(pin('WB4', 'A3.12V+'), pin('A3', 'X1.1'), 'AUX', { name: 'AUX-A3-P' });
    net(pin('WB4', 'A3.12V-'), pin('A3', 'X1.2'), 'AUX', { name: 'AUX-A3-N' });
    net(pin('WB4', 'A4.12V+'), pin('A4', 'X1.1'), 'AUX', { name: 'AUX-A4-P' });
    net(pin('WB4', 'A4.12V-'), pin('A4', 'X1.2'), 'AUX', { name: 'AUX-A4-N' });
    net(pin('WB4', 'HL.24V+'), pin('HL1', 'X1'), 'AUX', { name: 'AUX-HL1-P' });
    net(pin('WB4', 'HL.24V-'), pin('HL1', 'X2'), 'AUX', { name: 'AUX-HL1-N' });
    net(pin('WB4', 'MF.24V+'), pin('MF1', 'U'), 'AUX', { name: 'AUX-MF1-P' });
    net(pin('WB4', 'MF.24V-'), pin('MF1', 'V'), 'AUX', { name: 'AUX-MF1-N' });
    net(pin('T1', 'PE'), pin('PE2', 'T1.PE'), 'PE', { name: 'PE-T1' });
    net(pin('T2', 'PE'), pin('PE2', 'T2.PE'), 'PE', { name: 'PE-T2' });
    net(pin('A1', 'PE'), pin('PE2', 'A1.PE'), 'PE', { name: 'PE-A1' });
    if (p.ess) {
      net(pin('WB4', 'A5.24V+'), pin('A5', 'X1.1'), 'AUX', { name: 'AUX-A5-P' });
      net(pin('WB4', 'A5.24V-'), pin('A5', 'X1.2'), 'AUX', { name: 'AUX-A5-N' });
    }
    /* 引导单元 → 控制单元（同页直达，V-CP-01 / V-CPD-01 / V-DI-01） */
    for (let g = 1; g <= p.guns; g++) {
      net(pin('WB4', 'CG' + g + '.24V+'), pin('CG' + g, 'V+'), 'AUX', { name: 'AUX-CG' + g + '-P' });
      net(pin('WB4', 'CG' + g + '.24V-'), pin('CG' + g, 'V-'), 'AUX', { name: 'AUX-CG' + g + '-N' });
      if (sig === 'gb' || sig === 'chademo') {
        net(pin('CG' + g, 'TX'), pin('A1', 'G' + g + '.1'), 'COMM', { name: 'COMM-CG' + g + '-H' });
        net(pin('CG' + g, 'RX'), pin('A1', 'G' + g + '.2'), 'COMM', { name: 'COMM-CG' + g + '-L' });
        net(pin('CG' + g, 'CS'), pin('A1', 'G' + g + '.3'), 'CTL', { name: 'CTL-CG' + g + '-CS' });
        net(pin('CG' + g, 'DP'), pin('A1', 'G' + g + '.4'), 'CTL', { name: 'CTL-CG' + g + '-DP' });
      } else {
        net(pin('CG' + g, 'TX'), pin('A2', 'CP' + g), 'COMM', { name: 'COMM-CG' + g + '-CP' });
        net(pin('CG' + g, 'CS'), pin('A1', 'G' + g + '.1'), 'CTL', { name: 'CTL-CG' + g + '-PP' });
        net(pin('CG' + g, 'DP'), pin('A1', 'G' + g + '.2'), 'CTL', { name: 'CTL-CG' + g + '-DP' });
      }
    }
    /* 二次信号（页2 内部） */
    net(pin('SB1', '12'), pin('A1', 'X4.1'), 'SAF', { name: 'SAF-ESTOP' });
    net(pin('SQ1', '12'), pin('A1', 'X4.2'), 'SAF', { name: 'SAF-DOOR' });
    net(pin('WB4', 'SAF.24V+'), pin('SB1', '11'), 'SAF', { name: 'SAF-ESTOP-24V' });
    net(pin('WB4', 'SAF.24V-'), pin('SQ1', '11'), 'SAF', { name: 'SAF-DOOR-24V' });
    net(pin('A1', 'ETH1'), pin('A2', 'ETH1'), 'COMM', { name: 'COMM-A1-A2' });
    net(pin('A2', 'ETH2'), pin('A3', 'LAN1'), 'COMM', { name: 'COMM-A2-A3' });
    net(pin('A3', 'ANT'), pin('A4', 'LAN1'), 'COMM', { name: 'COMM-A3-A4' });
    if (p.ess) {
      net(pin('A5', 'X3.1'), pin('A1', 'X2.3'), 'COMM', { name: 'COMM-A5-A1-H' });
      net(pin('A5', 'X3.2'), pin('A1', 'X2.4'), 'COMM', { name: 'COMM-A5-A1-L' });
    }

    /* ---------- 跨页网络（一次 ↔ 二次），全部逐 pin 明确 ---------- */
    const X = [];
    const xnet = function (a, b, cls, nm) { X.push({ a: a, b: b, cls: cls, name: nm }); };
    xnet(pin('WB1', 'T1.L1'), pin('T1', 'L'), 'AC', 'AC-T1-L');
    xnet(pin('WB1', 'T1.N'), pin('T1', 'N'), 'AC', 'AC-T1-N');
    xnet(pin('WB1', 'T2.L2'), pin('T2', 'L'), 'AC', 'AC-T2-L');
    xnet(pin('WB1', 'T2.N'), pin('T2', 'N'), 'AC', 'AC-T2-N');
    xnet(pin('PE1', 'AUX.PE'), pin('PE2', 'IN.PE'), 'PE', 'PE-SEC');
    xnet(pin('A1', 'Y0.1'), pin('KM1', 'A1'), 'CTL', 'CTL-KM1');
    xnet(pin('WB4', 'CKM1.24V-'), pin('KM1', 'A2'), 'AUX', 'AUX-KM1-N');
    xnet(pin('A1', 'Y0.2'), pin('K0', 'A1'), 'CTL', 'CTL-K0');
    xnet(pin('WB4', 'CK0.24V-'), pin('K0', 'A2'), 'AUX', 'AUX-K0-N');
    xnet(pin('RCM1', 'ALM'), pin('A1', 'X5.3'), 'CTL', 'CTL-RCM-ALM');
    xnet(pin('TA1', 'OUT'), pin('A1', 'X5.1'), 'CTL', 'CTL-TA1-OUT');
    xnet(pin('WB4', 'TA1.24V+'), pin('TA1', '5V+'), 'AUX', 'AUX-TA1-P');
    xnet(pin('WB4', 'TA1.24V-'), pin('TA1', 'GND'), 'AUX', 'AUX-TA1-N');
    xnet(pin('RI1', 'ALM'), pin('A1', 'X5.2'), 'CTL', 'CTL-IMD-ALM');
    xnet(pin('RI1', 'A'), pin('A1', 'X3.1'), 'COMM', 'COMM-IMD-A');
    xnet(pin('RI1', 'B'), pin('A1', 'X3.2'), 'COMM', 'COMM-IMD-B');
    xnet(pin('WB4', 'RI1.24V+'), pin('RI1', '24V+'), 'AUX', 'AUX-IMD-P');
    xnet(pin('WB4', 'RI1.24V-'), pin('RI1', '24V-'), 'AUX', 'AUX-IMD-N');
    xnet(pin('PJ1', 'A'), pin('A1', 'X3.1'), 'COMM', 'COMM-PJ1-A');
    xnet(pin('PJ1', 'B'), pin('A1', 'X3.2'), 'COMM', 'COMM-PJ1-B');
    xnet(pin('PJ2', 'A'), pin('A1', 'X3.1'), 'COMM', 'COMM-PJ2-A');
    xnet(pin('PJ2', 'B'), pin('A1', 'X3.2'), 'COMM', 'COMM-PJ2-B');
    xnet(pin('WB4', 'RCM1.24V+'), pin('RCM1', '24V+'), 'AUX', 'AUX-RCM-P');
    xnet(pin('WB4', 'RCM1.24V-'), pin('RCM1', '24V-'), 'AUX', 'AUX-RCM-N');
    xnet(pin('PEC1', 'AO'), pin('A1', 'X5.4'), 'CTL', 'CTL-PE-ADC');
    xnet(pin('WB4', 'PEC.24V+'), pin('PEC1', 'V+'), 'AUX', 'AUX-PEC-P');
    xnet(pin('WB4', 'PEC.24V-'), pin('PEC1', 'V-'), 'AUX', 'AUX-PEC-N');
    for (let i = 1; i <= modShown; i++) {
      xnet(pin('M' + i, 'CANH'), pin('A1', 'X2.1'), 'COMM', 'COMM-M' + i + '-H');
      xnet(pin('M' + i, 'CANL'), pin('A1', 'X2.2'), 'COMM', 'COMM-M' + i + '-L');
    }
    for (let g = 1; g <= p.guns; g++) {
      xnet(pin('A1', 'Y' + g + '.1'), pin('K' + g + 'P', 'A1'), 'CTL', 'CTL-K' + g + 'P');
      xnet(pin('WB4', 'CK' + g + 'P.24V-'), pin('K' + g + 'P', 'A2'), 'AUX', 'AUX-K' + g + 'P-N');
      xnet(pin('A1', 'Y' + g + '.2'), pin('K' + g + 'N', 'A1'), 'CTL', 'CTL-K' + g + 'N');
      xnet(pin('WB4', 'CK' + g + 'N.24V-'), pin('K' + g + 'N', 'A2'), 'AUX', 'AUX-K' + g + 'N-N');
      xnet(pin('A1', 'Y' + g + '.3'), pin('YV' + g, 'V+'), 'CTL', 'CTL-YV' + g);
      xnet(pin('WB4', 'YV' + g + '.12V-'), pin('YV' + g, 'V-'), 'AUX', 'AUX-YV' + g + '-N');
      xnet(pin('YV' + g, 'FB1'), pin('A1', 'Y' + g + '.4'), 'CTL', 'CTL-YV' + g + '-FB');
      xnet(pin('YV' + g, 'FB2'), pin('WB4', 'FB' + g + '.12V-'), 'AUX', 'AUX-YV' + g + '-FB-N');
      if (sig === 'gb') {
        xnet(pin('XS' + g, 'S+'), pin('CG' + g, 'S+'), 'COMM', 'COMM-G' + g + '-S+');
        xnet(pin('XS' + g, 'S-'), pin('CG' + g, 'S-'), 'COMM', 'COMM-G' + g + '-S-');
        xnet(pin('XS' + g, 'CC1'), pin('CG' + g, 'CC1'), 'CTL', 'CTL-G' + g + '-CC1');
        xnet(pin('XS' + g, 'CC2'), pin('CG' + g, 'CC2'), 'CTL', 'CTL-G' + g + '-CC2');
      } else if (sig === 'chademo') {
        xnet(pin('XS' + g, 'CP'), pin('CG' + g, 'CP'), 'CTL', 'CTL-G' + g + '-CP');
        xnet(pin('XS' + g, 'CAN_H'), pin('CG' + g, 'CAN_H'), 'COMM', 'COMM-G' + g + '-H');
        xnet(pin('XS' + g, 'CAN_L'), pin('CG' + g, 'CAN_L'), 'COMM', 'COMM-G' + g + '-L');
      } else {
        xnet(pin('XS' + g, 'CP'), pin('CG' + g, 'CP'), 'COMM', 'COMM-G' + g + '-CP');
        xnet(pin('XS' + g, 'PP'), pin('CG' + g, 'PP'), 'CTL', 'CTL-G' + g + '-PP');
      }
      xnet(pin('KF' + g, 'AO'), pin('A1', 'X6.' + g), 'CTL', 'CTL-KF' + g + '-ADC');
      xnet(pin('WB4', 'KF' + g + '.24V+'), pin('KF' + g, 'V+'), 'AUX', 'AUX-KF' + g + '-P');
      xnet(pin('WB4', 'KF' + g + '.24V-'), pin('KF' + g, 'V-'), 'AUX', 'AUX-KF' + g + '-N');
      xnet(pin('SC' + g, 'DO'), pin('A1', 'X7.' + g), 'CTL', 'CTL-SC' + g + '-DO');
      xnet(pin('A1', 'Y' + g + '.5'), pin('SC' + g, 'EN'), 'CTL', 'CTL-SC' + g + '-EN');
      xnet(pin('WB4', 'SC' + g + '.24V+'), pin('SC' + g, 'V+'), 'AUX', 'AUX-SC' + g + '-P');
      xnet(pin('WB4', 'SC' + g + '.24V-'), pin('SC' + g, 'V-'), 'AUX', 'AUX-SC' + g + '-N');
    }
    if (p.ess) {
      const cl = Math.max(1, p.essClusters);
      for (let i = 1; i <= cl; i++) {
        xnet(pin('GB' + i, 'CANH'), pin('A5', 'X2.1'), 'COMM', 'COMM-B' + i + '-H');
        xnet(pin('GB' + i, 'CANL'), pin('A5', 'X2.2'), 'COMM', 'COMM-B' + i + '-L');
        xnet(pin('WB4', 'BC' + i + '.24V+'), pin('GB' + i, '24V+'), 'AUX', 'AUX-B' + i + '-P');
        xnet(pin('WB4', 'BC' + i + '.24V-'), pin('GB' + i, '24V-'), 'AUX', 'AUX-B' + i + '-N');
        xnet(pin('WB4', 'HT' + i + '.24V+'), pin('GB' + i, 'HEAT'), 'AUX', 'AUX-B' + i + '-HEAT');
        xnet(pin('A5', 'Y1'), pin('KB' + i + 'P', 'A1'), 'CTL', 'CTL-KB' + i + 'P');
        xnet(pin('WB4', 'CKB' + i + 'P.24V-'), pin('KB' + i + 'P', 'A2'), 'AUX', 'AUX-KB' + i + 'P-N');
        xnet(pin('A5', 'Y2'), pin('KB' + i + 'N', 'A1'), 'CTL', 'CTL-KB' + i + 'N');
        xnet(pin('WB4', 'CKB' + i + 'N.24V-'), pin('KB' + i + 'N', 'A2'), 'AUX', 'AUX-KB' + i + 'N-N');
        xnet(pin('A5', 'Y3'), pin('KB' + i + 'R', 'A1'), 'CTL', 'CTL-KB' + i + 'R');
        xnet(pin('WB4', 'CKB' + i + 'R.24V-'), pin('KB' + i + 'R', 'A2'), 'AUX', 'AUX-KB' + i + 'R-N');
      }
      xnet(pin('A1', 'X2.3'), pin('M9', 'CANH'), 'COMM', 'COMM-M9-H');
      xnet(pin('A1', 'X2.4'), pin('M9', 'CANL'), 'COMM', 'COMM-M9-L');
    }

    /* 跨页网络拆成 两段 + 一对跨页连接符 */
    const byId = {}; D.forEach(function (d) { byId[d.id] = d; });
    /* v2.0.4 audit-fix: 辅助电源全局轨——WB4 母排即轨节点；负载引脚就近打电源旗标，同名连通，
       取消逐负载点对点辅助电源线与跨页符（用户评审意见：全局变量直连） */
    (function () {
      const RAILMAP = { '24V+': '24V+', '24V-': '24V-', '12V+': '12V+', '12V-': '12V-', 'V+': '24V+', 'V-': '24V-', 'HEAT': '24V+', 'GND': '24V-', 'OV+': '24V+', 'OV-': '24V-' }; /* v2.0.7 */
      const OPP = { E: 'W', W: 'E', N: 'S', S: 'N' };
      const rails = {};
      const add = [];
      const kill = {};
      let fq = 0;
      N.forEach(function (nn) {
        const touchWB = nn.a.d === 'WB4' || nn.b.d === 'WB4'; /* v2.0.10: 安全回路等挂轨网一并旗标化 */
        if (nn.cls !== 'AUX' && !touchWB) return;
        const aW = nn.a.d === 'WB4', bW = nn.b.d === 'WB4';
        if (!aW && !bW) return;
        const wp = aW ? nn.a.p : nn.b.p;
        const cons = aW ? nn.b : nn.a;
        const pnW = { name: wp.indexOf('.') >= 0 ? wp.split('.').pop() : wp }; /* v2.0.9: 无 WB4 器件，轨名=tap 引脚名后缀 */
        if (!pnW) return;
        let rail = pnW.name;
        let cons2 = cons;
        if (!aW && !bW) {
          const pa = byId[nn.a.d] ? (byId[nn.a.d].sym.pins.filter(function (q) { return q.n === nn.a.p; })[0] || {}) : {};
          const pb = byId[nn.b.d] ? (byId[nn.b.d].sym.pins.filter(function (q) { return q.n === nn.b.p; })[0] || {}) : {};
          const ra = RAILMAP[pa.name], rb = RAILMAP[pb.name];
          if (!(ra && rb && ra === rb)) return; /* 不可映射则保留原线 */
          rail = ra;
          /* 双端各打旗标 */
          kill[nn.id] = 1;
          [nn.a, nn.b].forEach(function (ep) {
            const edev = byId[ep.d];
            if (!edev || edev.xref) return;
            fq++;
            const fid2 = 'PF' + String(fq).padStart(3, '0');
            const pd2 = OPP[pinDirOf(edev, ep.p)] || 'W';
            D.push({ id: fid2, sheet: edev.sheet, zone: 'ZX', tag: '', name: '电源旗标', spec: rail, pwr: rail, sym: S.pwrflag(rail, pd2), attach: { d: ep.d, p: ep.p, dist: 20 } });
            add.push({ id: nn.id + 'F' + ep.d, name: rail, cls: 'AUX', a: { d: ep.d, p: ep.p }, b: { d: fid2, p: '1' } });
            (rails[rail] = rails[rail] || []).push(fid2);
          });
          return;
        }
        const cdev = byId[cons.d];
        if (!cdev) return;
        kill[nn.id] = 1;
        fq++;
        const fid = 'PF' + String(fq).padStart(3, '0');
        const pd = OPP[pinDirOf(cdev, cons.p)] || 'W';
        D.push({ id: fid, sheet: cdev.sheet, zone: 'ZX', tag: '', name: '电源旗标', spec: rail, pwr: rail, sym: S.pwrflag(rail, pd), attach: { d: cons.d, p: cons.p, dist: 20 } });
        add.push({ id: nn.id + 'F', name: rail, cls: 'AUX', a: { d: cons.d, p: cons.p }, b: { d: fid, p: '1' } });
        (rails[rail] = rails[rail] || []).push(fid);
      });
      if (fq) {
        const keep = N.filter(function (nn) { return !kill[nn.id]; });
        N.length = 0;
        keep.forEach(function (x) { N.push(x); });
        add.forEach(function (x) { N.push(x); });
        RAILS = rails;
      }
    })();
    let xn = 0, xq = 0;
    /* V4-BUS: 总线型跨页通信网（多源→同引脚）合并为一对跨页符 + 同名网络 */
    const commByPin = {};
    X.forEach(function (x) {
      if (x.cls !== 'COMM') return;
      if (!byId[x.a.d] || !byId[x.b.d]) return;
      if (byId[x.a.d].sheet === byId[x.b.d].sheet) return;
      const key = x.b.d + ':' + x.b.p;
      (commByPin[key] = commByPin[key] || []).push({ x: x, srcDev: byId[x.a.d], tgtDev: byId[x.b.d] });
    });
    const busSkip = {};
    const busNetNames = {};
    Object.keys(commByPin).forEach(function (key) {
      const arr = commByPin[key];
      if (arr.length < 2) return;
      const first = arr[0];
      const target = first.x.b, tdev = first.tgtDev;
      const tpn = (tdev.sym.pins.filter(function (q) { return q.n === target.p; })[0] || {});
      const busName = (tpn.name || tpn.n || ('BUS-' + target.d + '-' + target.p));
      const sa = first.srcDev.sheet;
      xn++;
      const tagA = 'XR' + String(xn).padStart(3, '0') + 'A', tagB = 'XR' + String(xn).padStart(3, '0') + 'B';
      const xtag = 'XP' + String(xn).padStart(3, '0');
      const dirA = pinDirOf(first.srcDev, first.x.a.p), dirB = pinDirOf(tdev, target.p);
      const labA = '→' + tdev.sheet + '/' + target.d + ':' + target.p;
      const labB = '→' + sa + '/' + first.x.a.d + ':' + first.x.a.p + (arr.length > 1 ? ' 等' + arr.length + '路' : '');
      D.push({ id: tagA, sheet: sa, zone: 'ZX', tag: '', name: '跨页连接符', spec: busName, xref: true, sym: S.xref(labA, dirA, xtag), xrefLabel: labA, xrefTag: xtag, attach: { d: first.x.a.d, p: first.x.a.p, dist: 46 } });
      D.push({ id: tagB, sheet: tdev.sheet, zone: 'ZX', tag: '', name: '跨页连接符', spec: busName, xref: true, sym: S.xref(labB, dirB, xtag), xrefLabel: labB, xrefTag: xtag, attach: { d: target.d, p: target.p, dist: 46 } });
      arr.forEach(function (item) {
        const x = item.x;
        net(x.a, pin(tagA, '1'), 'COMM', { name: busName + '/1', xpair: 'XPBUS' + xn });
        busSkip[x.name] = 1;
      });
      net(pin(tagB, '1'), target, 'COMM', { name: busName + '/2', xpair: 'XPBUS' + xn });
      busNetNames[busName] = 1;
    });
    X.forEach(function (x) {
      if (busSkip[x.name]) return;
      if (!byId[x.a.d] || !byId[x.b.d]) { /* v2.0.9: WB4 已移除——消费端打旗标 */
        const ep = byId[x.a.d] ? x.a : x.b;
        const wp2 = byId[x.a.d] ? x.b.p : x.a.p;
        const r3 = wp2.indexOf('.') >= 0 ? wp2.split('.').pop() : null;
        const ed = byId[ep.d];
        if (ed && r3 && !ed.xref) {
          xq++;
          const fid = 'PF' + String(900 + xq).padStart(3, '0');
          const pd = ({ E: 'W', W: 'E', N: 'S', S: 'N' })[pinDirOf(ed, ep.p)] || 'W';
          D.push({ id: fid, sheet: ed.sheet, zone: 'ZX', tag: '', name: '电源旗标', spec: r3, pwr: r3, sym: S.pwrflag(r3, pd), attach: { d: ep.d, p: ep.p, dist: 20 } });
          N.push({ id: x.name + 'X9', name: r3, cls: 'AUX', a: { d: ep.d, p: ep.p }, b: { d: fid, p: '1' } });
        }
        return;
      }
      const sa = byId[x.a.d].sheet, sb = byId[x.b.d].sheet;
      if (x.cls === 'AUX') { /* v2.0.9: 跨页辅助网→双端电源旗标（全局轨） */
        const pnA = (byId[x.a.d].sym.pins.filter(function (q) { return q.n === x.a.p; })[0] || {});
        const pnB = (byId[x.b.d].sym.pins.filter(function (q) { return q.n === x.b.p; })[0] || {});
        const RM = { '24V+': '24V+', '24V-': '24V-', '12V+': '12V+', '12V-': '12V-', 'V+': '24V+', 'V-': '24V-', 'HEAT': '24V+', 'GND': '24V-', 'OV+': '24V+', 'OV-': '24V-' };
        let rail = null;
        if (x.a.d === 'WB4') rail = pnA.name; else if (x.b.d === 'WB4') rail = pnB.name;
        else if (RM[pnA.name] && RM[pnA.name] === RM[pnB.name]) rail = RM[pnA.name];
        if (rail || (RM[pnA.name] && RM[pnB.name])) {
          const rr = rail || RM[pnA.name];
          [x.a, x.b].forEach(function (ep, ei2) {
            const ed = byId[ep.d];
            if (!ed || ed.id === 'WB4' || ed.xref) return;
            const r2 = rail || (ei2 === 0 ? RM[pnA.name] : RM[pnB.name]);
            if (!r2) return;
            xq++;
            const fid = 'PF' + String(900 + xq).padStart(3, '0');
            const pd = ({ E: 'W', W: 'E', N: 'S', S: 'N' })[pinDirOf(ed, ep.p)] || 'W';
            D.push({ id: fid, sheet: ed.sheet, zone: 'ZX', tag: '', name: '电源旗标', spec: r2, pwr: r2, sym: S.pwrflag(r2, pd), attach: { d: ep.d, p: ep.p, dist: 20 } });
            N.push({ id: x.name + 'X' + ei2, name: r2, cls: 'AUX', a: { d: ep.d, p: ep.p }, b: { d: fid, p: '1' } });
          });
          return;
        }
      }
      if (sa === sb) { net(x.a, x.b, x.cls, { name: x.name }); return; }
      xn++;
      const tagA = 'XR' + String(xn).padStart(3, '0') + 'A', tagB = 'XR' + String(xn).padStart(3, '0') + 'B';
      const labA = '→' + sb + '/' + x.b.d + ':' + x.b.p, labB = '→' + sa + '/' + x.a.d + ':' + x.a.p;
      const dirA = pinDirOf(byId[x.a.d], x.a.p), dirB = pinDirOf(byId[x.b.d], x.b.p);
      const xtag = 'XP' + String(xn).padStart(3, '0'); /* v2.12: 配对同名编号 */
      D.push({ id: tagA, sheet: sa, zone: 'ZX', tag: '', name: '跨页连接符', spec: x.name, xref: true, sym: S.xref(labA, dirA, xtag), xrefLabel: labA, xrefTag: xtag, attach: { d: x.a.d, p: x.a.p, dist: 46 } });
      D.push({ id: tagB, sheet: sb, zone: 'ZX', tag: '', name: '跨页连接符', spec: x.name, xref: true, sym: S.xref(labB, dirB, xtag), xrefLabel: labB, xrefTag: xtag, attach: { d: x.b.d, p: x.b.p, dist: 46 } });
      net(x.a, pin(tagA, '1'), x.cls, { name: x.name + '/1', xpair: x.name });
      net(pin(tagB, '1'), x.b, x.cls, { name: x.name + '/2', xpair: x.name });
    });

    return {
      version: VERSION, params: p, modCount: modCount, modShown: modShown, acA: acA,
      sheets: [{ no: 1, id: 'S1', title: '一次主回路 · 交流进线 / 功率变换 / 直流保护 / 枪回路 / 储能' },
        { no: 2, id: 'S2', title: '二次回路 · 辅助电源 / 控制 / 通信 / 安全联锁' }],
      devices: D, nets: N,
      status: 'CONCEPT_DRAFT—PROFESSIONAL_REVIEW_REQUIRED'
    };
  }

  function pinDirOf(d, pid) {
    const pn = d.sym.pins.filter(function (q) { return q.n === pid; })[0];
    return pn ? pn.d : 'E';
  }
  function pePlan(p, modShown) {
    const t = [{ id: 'IN', wires: ['PE'], side: 'N', label: '进线', gap: 84 }, { id: 'SPD', wires: ['PE'], side: 'N', label: 'SPD', gap: 84 }, { id: 'IMD', wires: ['PE'], side: 'N', label: 'IMD', gap: 84 }];
    for (let i = 1; i <= modShown; i++) t.push({ id: 'M' + i, wires: ['PE'], side: 'N', label: 'M' + i, gap: 84 });
    t.push({ id: 'EMC', wires: ['PE'], side: 'N', label: 'EMC', gap: 84 }, { id: 'DET', wires: ['PE'], side: 'N', label: 'PE检测', gap: 84 });
    for (let g = 1; g <= p.guns; g++) t.push({ id: 'G' + g, wires: ['PE'], side: 'N', label: '枪' + g, gap: 84 });
    if (p.ess) t.push({ id: 'ESS', wires: ['PE'], side: 'N', label: '储能', gap: 84 });
    t.push({ id: 'AUX', wires: ['PE'], side: 'N', label: '二次', gap: 84 }, { id: 'CAB', wires: ['PE'], side: 'N', label: '柜体', gap: 60 });
    return t;
  }
  const A_SERIES = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250];
  function pickA(v) { const r = pick(A_SERIES, v); return r == null ? '＞1250（需专业选型）' : r; }

  /* V11-FLUSH（V12c 提升至模块级供库审计复用）: pin 电气点与外边框（keepout=body+8）平齐；禁止布线区内只允许器件自画引脚内线 */
  const KO = 8;
  /* V12c: 路径真顶点提取（M/L/H/V/Q/C/A 的当前点；弧参数不作为坐标） */
  const pathPts = function (dstr) {
    const toks = String(dstr).match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    let i = 0, cx = 0, cy = 0; const out = [];
    const num = function () { return parseFloat(toks[i++]); };
    while (i < toks.length) {
      const c = toks[i++];
      if (c === 'M' || c === 'm') { const x = num(), y = num(); if (c === 'm') { cx += x; cy += y; } else { cx = x; cy = y; } out.push([cx, cy]); }
      else if (c === 'L' || c === 'l') { const x = num(), y = num(); if (c === 'l') { cx += x; cy += y; } else { cx = x; cy = y; } out.push([cx, cy]); }
      else if (c === 'H' || c === 'h') { const x = num(); cx = c === 'h' ? cx + x : x; out.push([cx, cy]); }
      else if (c === 'V' || c === 'v') { const y = num(); cy = c === 'v' ? cy + y : y; out.push([cx, cy]); }
      else if (c === 'Q' || c === 'q') { num(); num(); const x = num(), y = num(); if (c === 'q') { cx += x; cy += y; } else { cx = x; cy = y; } out.push([cx, cy]); }
      else if (c === 'T' || c === 't') { const x = num(), y = num(); if (c === 't') { cx += x; cy += y; } else { cx = x; cy = y; } out.push([cx, cy]); }
      else if (c === 'C' || c === 'c') { num(); num(); num(); num(); const x = num(), y = num(); if (c === 'c') { cx += x; cy += y; } else { cx = x; cy = y; } out.push([cx, cy]); }
      else if (c === 'S' || c === 's') { num(); num(); const x = num(), y = num(); if (c === 's') { cx += x; cy += y; } else { cx = x; cy = y; } out.push([cx, cy]); }
      else if (c === 'A' || c === 'a') { for (let k = 0; k < 5; k++) num(); const x = num(), y = num(); if (c === 'a') { cx += x; cy += y; } else { cx = x; cy = y; } out.push([cx, cy]); }
      else if (c === 'Z' || c === 'z') { out.push([cx, cy]); }
      else if (!isNaN(parseFloat(c))) { i--; const x = num(), y = num(); cx = x; cy = y; out.push([cx, cy]); }
    }
    return out;
  };
  const normSym = function (sym) {
    if (!sym || sym.__norm) return sym;
    sym.__norm = 1;
    const w = sym.w, h = sym.h;
    const cl = function (x, y, vert) {
      if (vert) return [x, Math.max(-KO, Math.min(h + KO, y))];
      return [Math.max(-KO, Math.min(w + KO, x)), y];
    };
    (sym.draw || []).forEach(function (e) {
      if (e[0] !== 'L') return;
      const vert = Math.abs(e[1] - e[3]) < 0.01, hor = Math.abs(e[2] - e[4]) < 0.01;
      if (vert) { const a = cl(e[1], e[2], true), b = cl(e[3], e[4], true); e[2] = a[1]; e[4] = b[1]; }
      else if (hor) { const a = cl(e[1], e[2], false), b = cl(e[3], e[4], false); e[1] = a[0]; e[3] = b[0]; }
    });
    (sym.pins || []).forEach(function (p) {
      const ox = p.x, oy = p.y;
      let ex = ox, ey = oy;
      if (p.d === 'N') ey = -KO; else if (p.d === 'S') ey = h + KO; else if (p.d === 'W') ex = -KO; else if (p.d === 'E') ex = w + KO;
      p.x = ex; p.y = ey;
      /* V12c: 内线延伸到 pin 轴上最近已画端点（消除体边与端子图形间 8px 悬空）；无已画端点则至少到体边 */
      const vert = p.d === 'N' || p.d === 'S';
      const fc = vert ? ey : ex;
      let best = null, bd = 1e9;
      (sym.draw || []).forEach(function (e) {
        if (e[0] === 'L') {
          for (let k = 1; k <= 3; k += 2) {
            const px = e[k], py = e[k + 1];
            if (vert ? Math.abs(px - ex) > 0.01 : Math.abs(py - ey) > 0.01) continue;
            const c = vert ? py : px;
            const inner = p.d === 'N' ? c >= fc - 0.01 : p.d === 'S' ? c <= fc + 0.01 : p.d === 'E' ? c <= fc + 0.01 : c >= fc - 0.01;
            if (!inner) continue;
            const dd = Math.abs(c - fc);
            if (dd < bd) { bd = dd; best = c; }
          }
        } else if (e[0] === 'P') {
          /* V12c: P 路径真顶点也作候选（跨页符箭尖等） */
          const pts = pathPts(e[1]);
          for (let k = 0; k < pts.length; k++) {
            const px = pts[k][0], py = pts[k][1];
            if (vert ? Math.abs(px - ex) > 0.01 : Math.abs(py - ey) > 0.01) continue;
            const c = vert ? py : px;
            const inner = p.d === 'N' ? c >= fc - 0.01 : p.d === 'S' ? c <= fc + 0.01 : p.d === 'E' ? c <= fc + 0.01 : c >= fc - 0.01;
            if (!inner) continue;
            const dd = Math.abs(c - fc);
            if (dd < bd) { bd = dd; best = c; }
          }
        }
      });
      const t0 = vert ? (p.d === 'N' ? 0 : h) : (p.d === 'E' ? w : 0);
      let end = best == null ? t0 : (p.d === 'N' || p.d === 'W' ? Math.max(best, t0) : Math.min(best, t0));
      const lo2 = Math.min(fc, end), hi2 = Math.max(fc, end);
      const covered = (sym.draw || []).some(function (e2) {
        if (e2[0] !== 'L') return false;
        if (vert) return Math.abs(e2[1] - ex) < 0.01 && Math.abs(e2[3] - ex) < 0.01 && Math.min(e2[2], e2[4]) <= lo2 + 0.01 && Math.max(e2[2], e2[4]) >= hi2 - 0.01;
        return Math.abs(e2[2] - ey) < 0.01 && Math.abs(e2[4] - ey) < 0.01 && Math.min(e2[1], e2[3]) <= lo2 + 0.01 && Math.max(e2[1], e2[3]) >= hi2 - 0.01;
      });
      if (!covered && Math.abs(end - fc) > 0.01) {
        if (vert) sym.draw.push(['L', ex, ey, ex, end]); else sym.draw.push(['L', ex, ey, end, ey]);
      }
    });
    return sym;
  };
  return { VERSION, GRID, NETC, ERC_PIN_TYPES, normalizeElectrical, S, makeSwitch, makeFuse, makeRes, makeBus, makeBox, build, PHASE4, normSym: normSym, rails: function () { return RAILS; } };
})();
