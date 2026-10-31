/* ============================================================
 * EVSE-SCHEMATIC GEO v2.1 —— 布局 / 通道布线 / 跨越 / 挤线 / 规则引擎
 *   place()   坐标即数据：母排优先，其余器件按母排分接点对齐
 *   route()   正交布线 + 通道分轨（区间重叠才换轨，间距≥MIN_CLEAR）
 *   crossings() 统一后处理插半圆（与绘制顺序无关）
 *   shove()   交互式改线的挤推走线
 *   audit()   DRC + 图纸优劣评分（可机检项才计分）
 * ============================================================ */
window.EVSE_GEO = (function () {
  'use strict';

  const MIN_CLEAR = 8;      // 平行走线最小间距（V12d: 用户规程 ≥8px）
  const ESC = 14;           // 引脚出线段
  const PAD = 8;            // 器件避让余量 = 蓝色禁布框 body+8（V7-PIN4 统一口径）
  const SNAP = 2;           // 交互吸附栅格
  let VIA = '';             // 上一条走线的求解来源（诊断用）

  /* v2.11 audit-fix: 器件 90° 旋转——引脚坐标/朝向同步旋转（绕符号中心，顺时针） */
  function rotPt(dv, p) {
    if (!dv.rot) return p;
    const cx = dv.sym.w / 2, cy = dv.sym.h / 2;
    const steps = (((dv.rot % 360) + 360) % 360) / 90;
    let dx = p.x - cx, dy = p.y - cy, d0 = p.d;
    const DIRR = { E: 'S', S: 'W', W: 'N', N: 'E' };
    for (let i = 0; i < steps; i++) { const t = dx; dx = -dy; dy = t; d0 = DIRR[d0] || d0; }
    return { x: cx + dx, y: cy + dy, d: d0, n: p.n, k: p.k, name: p.name };
  }
  const abs = (dv, p) => { const q = rotPt(dv, p); return { x: dv.x + q.x, y: dv.y + q.y, d: q.d, dev: dv.id, pin: q.n || p.n, k: q.k, name: q.name }; };
  function devDims(d) { const r = (d.rot || 0) % 180; return r ? { w: d.sym.h, h: d.sym.w } : { w: d.sym.w, h: d.sym.h }; }
  const DIRV = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };

  function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  /* 文字宽度估算（CJK 全宽，ASCII 约 0.56字符宽） */
  function textW(s, size) {
    let w = 0;
    for (let i = 0; i < s.length; i++) w += /[\u3000-\u9fff\uff00-\uffef]/.test(s[i]) ? size : size * 0.56;
    return w;
  }
  const ANCHW = { s: 0, m: -0.5, e: -1 };
  /* 符号内部全部文字带（本地坐标）：draw 中的 T 基元 + 渲染器画的引脚名 */
  function textBands(dv) {
    const out = [], sym = dv.sym;
    (sym.draw || []).forEach(function (pr) {
      if (pr[0] !== 'T') return;
      const s = String(pr[3]), size = pr[4] || 7.5, w = textW(s, size);
      const a = pr[5] || 's';
      out.push({ x: pr[1] + (ANCHW[a] || 0) * w, y: pr[2] - size * 0.82, w: w, h: size * 1.12, s: s });
    });
    if (sym.nameIn) {
      sym.pins.forEach(function (p) {
        if (p.name) {
          let ix, iy, a;
          if (p.d === 'N') { ix = p.x; iy = p.y - 13; a = 'm'; }
          else if (p.d === 'S') { ix = p.x; iy = p.y + 19; a = 'm'; }
          else {
            const v = p.d === 'W' ? -1 : 1;
            ix = p.x - v * (p.len + 5); iy = p.y + 2.4; a = p.d === 'W' ? 's' : 'e';
          }
          const w = textW(String(p.name), 6.8);
          out.push({ x: ix + (ANCHW[a] || 0) * w, y: iy - 5.6, w: w, h: 7.6, s: p.name });
        }
        /* 引脚号文字带（与 devSVG 一致） */
        if (p.n) {
          const vert = p.d === 'N' || p.d === 'S';
          const px = vert ? p.x + 4 : p.x + (p.d === 'E' ? 6 : -6);
          const py = p.y + (vert ? (p.d === 'N' ? -3 : 7) : -4);
          const aw = vert ? 0 : (p.d === 'E' ? 0 : -1);
          const w = textW(String(p.n), 5.6);
          out.push({ x: px + aw * w, y: py - 4.6, w: w, h: 6.3, s: '#' + p.n });
        }
      });
    }
    return out;
  }
  function labelBand(d) {
    const t = d.sym.tagAt, o = d.tagOff || { dx: 0, dy: 0 };
    const x0 = d.x + t.x + o.dx, y0 = d.y + t.y + o.dy;
    const wTxt = Math.max(textW(String(d.tag || ''), 11), textW(String(d.name || ''), 8), textW(String(d.spec || ''), 7)) + 2;
    const x = x0 + (ANCHW[t.a] || 0) * wTxt;
    return { sheet: d.sheet, x: x - 2, y: y0 - 11, w: wTxt + 4, h: 32, kind: 'label', id: d.id };
  }
  function dashedBand(d) {
    const dm = devDims(d);
    return { sheet: d.sheet, id: d.id, x: d.x - 8, y: d.y - 8, w: dm.w + 16, h: dm.h + 16,
      core: { x: d.x, y: d.y, w: dm.w, h: dm.h } };
  }  function pinKeepouts(d) {
    const out = [];
    (d.sym.pins || []).forEach(function (p) {
      const a = abs(d, p);
      const len = Math.max(6, (p.len || 0) + 6), half = 4;
      let r;
      if (p.d === 'W') r = { x: a.x, y: a.y - half, w: len, h: half * 2 };
      else if (p.d === 'E') r = { x: a.x - len, y: a.y - half, w: len, h: half * 2 };
      else if (p.d === 'N') r = { x: a.x - half, y: a.y, w: half * 2, h: len };
      else r = { x: a.x - half, y: a.y - len, w: half * 2, h: len };
      out.push(r);
    });
    return out;
  }  function pinOf(dv, pid) {
    for (let i = 0; i < dv.sym.pins.length; i++) if (dv.sym.pins[i].n === pid) return dv.sym.pins[i];
    return null;
  }
  /* 器件禁止布线区：本体 + 全部引脚外沿，core 保留纯本体用于端点引出段豁免 */
  function deviceKeepout(d) {
    const dm = devDims(d);
    let x0 = d.x, y0 = d.y, x1 = d.x + dm.w, y1 = d.y + dm.h;
    (d.sym.pins || []).forEach(function (p) {
      const a = abs(d, p);
      x0 = Math.min(x0, a.x); y0 = Math.min(y0, a.y);
      x1 = Math.max(x1, a.x); y1 = Math.max(y1, a.y);
    });
    const pad = 2;
    return {
      sheet: d.sheet, id: d.id,
      x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2,
      core: { x: d.x, y: d.y, w: dm.w, h: dm.h }
    };
  }
  function pinAbs(map, ref) {
    const dv = map[ref.d]; if (!dv) return null;
    const p = pinOf(dv, ref.p); if (!p) return null;
    return abs(dv, p);
  }

  /* ============================================================
   * 1. 布局：母排先定位，用电器件按分接点对齐（保证下引线笔直）
   * ============================================================ */
  function place(design) {
    const M = {}; design.devices.forEach(function (d) { M[d.id] = d; });
    const px = (id, pid) => { const q = pinOf(M[id], pid); return q ? q.x : 0; };
    const tap = (busId, pid) => { const q = pinOf(M[busId], pid); return q ? M[busId].x + q.x : 0; };
    const has = (id) => !!M[id];
    const put = (id, x, y) => { if (M[id]) { M[id].x = x; M[id].y = y; } };
    const p = design.params, guns = p.guns, mod = design.modShown;
    if (!M['M1']) throw new Error('参数异常：未生成充电模块（请检查额定功率与模块功率）');

    /* ---------------- 页 1 ---------------- */
    put('WB1', 170, 940);
    const acIn = tap('WB1', 'IN.L1');
    put('XT1', acIn, 150);
    put('QS1', acIn, 240);
    put('QF1', acIn, 350);
    put('RCM1', acIn, 460);
    put('PJ1', acIn, 620);
    put('KM1', acIn, 760);
    put('QF2', tap('WB1', 'SPD.L1'), 1180);
    put('FV1', tap('WB1', 'SPD.L1') + 200, 1320); /* V3-LAY: 右移避开直流母线引脚列 */
    for (let i = 1; i <= mod; i++) put('M' + i, tap('WB1', 'M' + i + '.L1') - px('M' + i, 'L1'), 1060);
    put('WBC', M['M1'].x + px('M1', 'DC+') - 26, 1300);
    const dcChainX = tap('WBC', 'OUT.DC+');
    put('FU1', dcChainX, 1390);
    put('TA1', dcChainX - px('TA1', 'P1') - 40, 1480); /* V3-LAY: 左移让出母线输出列 */
    put('PJ2', dcChainX - px('PJ2', '1'), 1600);
    put('WB2', M['PJ2'].x + px('PJ2', '2') - px('WB2', 'IN.DC+'), 1760);
    put('RI1', tap('WB2', 'IMD.DC+') - px('RI1', 'DC+'), 1620);
    put('K0', tap('WB2', 'BLD.DC+'), 1840);
    put('RS0', tap('WB2', 'BLD.DC+'), 1940);
    for (let g = 1; g <= guns; g++) {
      const xp = tap('WB2', 'G' + g + '.DC+');
      put('FU' + (g + 1), xp, 1850);
      put('K' + g + 'P', xp, 1950);
      put('K' + g + 'N', xp + 230, 1950);
      put('XS' + g, xp + 120, 2150);
      put('YV' + g, xp + 30, 2320);
      put('KF' + g, xp + 440, 1900);
      put('SC' + g, xp + 440, 2110);
    }
    if (p.ess) {
      const cl = Math.max(1, p.essClusters);
      put('WB3', 240, 2620);
      put('M9', 300, 2420);
      for (let i = 1; i <= cl; i++) {
        const bx = tap('WB3', 'B' + i + '.B+'), bn = tap('WB3', 'B' + i + '.B-'), br = tap('WB3', 'B' + i + 'R.B+');
        put('KB' + i + 'P', bx, 2700);
        put('FB' + i, bx, 2810);
        put('GB' + i, bx - 210, 2960);
        put('KB' + i + 'R', br, 2700);
        put('RB' + i, br, 2810);
        put('KB' + i + 'N', bn, 3120);
      }
    }
    put('PE1', 200, 3420);
    put('PE0', 240, 3520);
    put('FE1', acIn + 320, 240);
    put('PEC1', tap('WB1', 'PEC.L1') + 60, 3180);

    /* ---------------- 页 2 ---------------- */
    put('T1', 300, 380); /* v2.0.6: 全局轨后 T1/T2 固定位 */
    put('T2', 520, 380);
    put('SB1', 240, 1000);
    put('SQ1', 240, 1180);
    put('HL1', 240, 1360);
    put('MF1', 240, 1540);
    put('PE2', 240, 1780);
    put('A1', 620, 940);
    put('A2', 1500, 940);
    put('A3', 1500, 1220);
    put('A4', 1500, 1440);
    if (has('A5')) put('A5', 1500, 1660);
    for (let g = 1; g <= guns; g++) put('CG' + g, 2000, 620 + (g - 1) * 420);
    /* ---- 占位集合：器件本体 + 标注文字带（LIB-R20 禁止重叠堆积） ---- */
    const boxes = [];
    const xlane = {};
    design.devices.forEach(function (d) {
      if (d.x == null || d.attach) return;
      if (!d.sym.isBus) boxes.push({ sheet: d.sheet, x: d.x - 4, y: d.y - 4, w: devDims(d).w + 8, h: devDims(d).h + 8, kind: 'body', id: d.id });
      if (d.tag && d.sym.tagAt) boxes.push(labelBand(d));
    });
    /* V6-GCORR: 全局引脚出线走廊——所有器件每个引脚沿出线方向 L=100 宽±5 的保护带 */
    design.devices.forEach(function (d) {
      if (true) return; /* V6-GCORR-OFF: 全局走廊连锁过大回退（C10 脱焊），保留代码待 L1 通道路由统一解决 */
      d.sym.pins.forEach(function (p2) {
        if (p2.k !== 'DC' && p2.k !== 'AC' && p2.k !== 'PE') return; /* V6-GCORR2: 仅功率引脚走廊 */
        const v2 = DIRV[p2.d] || [1, 0];
        const px2 = d.x + p2.x, py2 = d.y + p2.y;
        const L2 = 100, W2 = 5;
        const ex2 = px2 + v2[0] * L2, ey2 = py2 + v2[1] * L2;
        boxes.push({ sheet: d.sheet, x: Math.min(px2, ex2) - W2, y: Math.min(py2, ey2) - W2, w: Math.abs(ex2 - px2) + W2 * 2, h: Math.abs(ey2 - py2) + W2 * 2, kind: 'corridor', id: d.id + ':' + p2.n });
      });
    });
    /* 跨页连接符：沿引脚轴线外移，逐档避让本体与文字带 */
    design.devices.forEach(function (d) {
      if (!d.attach) return;
      const own = M[d.attach.d], pn = pinOf(own, d.attach.p);
      if (!own || pn == null) { d.x = 0; d.y = 0; return; }
      const v = DIRV[pn.d] || [1, 0], q = d.sym.pins[0];
      const bx = own.x + pn.x, by = own.y + pn.y;
      let best = null, free = false, bestCorr = null; /* V6-CORR2: 压走廊近位回退 */
      const LAT = [0, 20, -20, 40, -40, 62, -62, 86, -86, 110, -110];
      const per = (pn.d === 'N' || pn.d === 'S') ? [1, 0] : [0, 1];
      /* V6-GCORR: 用全局走廊框（boxes 里 kind=corridor，排除自身 attach 引脚） */
      const corrids = (function () {
        if (d.sym.isXref) return boxes.filter(function (b) { return b.kind === 'corridor' && b.sheet === own.sheet && b.id !== d.attach.d + ':' + d.attach.p; });
        return [];
      })();
      const corridsOld = [];
      /* V12b: 已放置器件的全部 pin 电点——跨页符落点绝不得与之重合（骑 pin=两网络共点视觉短路） */
      const pinPts = [];
      design.devices.forEach(function (o2) {
        if (o2.x == null || o2 === d || o2 === own) return;
        (o2.sym.pins || []).forEach(function (p3) {
          const a3 = pinAbs(M, { d: o2.id, p: p3.n });
          if (a3) pinPts.push([a3.x, a3.y]);
        });
      });
      if (!own.sym.isBus && (devDims(own).w >= 180 || /^PJ\d/.test(own.id))) { /* V6-CORR3: 仅大 hub 宿主（A1/A2/A5 类）启用走廊避让，小器件（枪座/表计）保持近位防 C10 脱线 */
        own.sym.pins.forEach(function (p2) {
          if (p2.n === d.attach.p) return;
          const v2 = DIRV[p2.d] || [1, 0];
          const px2 = own.x + p2.x, py2 = own.y + p2.y;
          const L2 = 150, W2 = 6;
          const ex2 = px2 + v2[0] * L2, ey2 = py2 + v2[1] * L2;
          corrids.push({ sheet: own.sheet, x: Math.min(px2, ex2) - W2, y: Math.min(py2, ey2) - W2, w: Math.abs(ex2 - px2) + W2 * 2, h: Math.abs(ey2 - py2) + W2 * 2 });
        });
      }
      outer:
      for (let dist = d.attach.dist; dist <= d.attach.dist + 700; dist += 22) {
        for (let li = 0; li < LAT.length; li++) {
          const ax = bx + v[0] * dist + per[0] * LAT[li], ay = by + v[1] * dist + per[1] * LAT[li];
          const x = ax - q.x, y = ay - q.y; /* v2.0.3: 变体引脚在轴端，锚点统一 */
          const r = { sheet: own.sheet, x: x - 2, y: y - 2, w: devDims(d).w + 4, h: devDims(d).h + 4 };
          const colr = { sheet: own.sheet, x: Math.min(bx, ax) - 2, y: Math.min(by, ay) - 2, w: Math.abs(ax - bx) + 4, h: Math.abs(ay - by) + 4 };
          if (best === null) best = { x: x, y: y };
          const boxOk = !boxes.some(function (b) { return b.sheet === r.sheet && overlap(b, r); }) && !boxes.some(function (b) { return b.sheet === colr.sheet && b.kind === 'label' && overlap(b, colr); });
          const pinFree = !pinPts.some(function (q2) { return Math.abs(q2[0] - ax) < 5 && Math.abs(q2[1] - ay) < 5; }); /* V12b */
          if (boxOk && pinFree && !corrids.some(function (c) { return overlap(c, r); })) { best = { x: x, y: y }; free = true; break outer; } /* V6-CORR: 兄弟引脚走廊避让 */
          if (boxOk && pinFree && bestCorr === null) bestCorr = { x: x, y: y }; /* V6-CORR2: 压走廊近位候选 */
        }
      }
      if (!free && bestCorr) { best = bestCorr; free = true; } /* V6-CORR2: 无免走廊位则用压走廊近位（C08 warn 优于 C05/C10 error） */
      if (!free) {
        /* 保底道：沿轴线推到专属车道，永不与已放置对象叠在一起 */
        xlane[own.sheet] = (xlane[own.sheet] || 0) + 1;
        const dist = d.attach.dist + 740 + xlane[own.sheet] * 26;
        const ax = bx + v[0] * dist, ay = by + v[1] * dist;
        best = { x: ax - q.x, y: ay - q.y };
      }
      d.x = best.x; d.y = best.y;
      boxes.push({ sheet: own.sheet, x: d.x - 2, y: d.y - 2, w: devDims(d).w + 4, h: devDims(d).h + 4, kind: 'xref', id: d.id });
    });
    design.boxes = boxes;

    /* 图幅 */
    const sheets = {};
    design.sheets.forEach(function (s) { sheets[s.no] = { no: s.no, title: s.title, x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; });
    design.devices.forEach(function (d) {
      const s = sheets[d.sheet]; if (!s || d.x == null) return;
      s.x0 = Math.min(s.x0, d.x - 60); s.y0 = Math.min(s.y0, d.y - 70);
      s.x1 = Math.max(s.x1, d.x + d.sym.w + 90); s.y1 = Math.max(s.y1, d.y + d.sym.h + 70);
    });
    design.sheets.forEach(function (s) {
      const b = sheets[s.no];
      s.frame = { x: 60, y: 60, w: Math.max(s.no === 1 ? 3900 : 2100, Math.ceil((b.x1 + 180) / 20) * 20), h: Math.max(s.no === 1 ? 3600 : 2000, Math.ceil((b.y1 + 200) / 20) * 20) }; /* v2.22 自适应页框 */
    });
    design.map = M;
    defragmentWires(design); /* V3-S3 */
    return design;
  }

  /* ============================================================
   * 2. 布线
   * ============================================================ */
  function segsOf(pts) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01) continue;
      out.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], v: Math.abs(a[0] - b[0]) < 0.01 });
    }
    return out;
  }
  function crossingPairs(design, tolerance) {
    const tol = tolerance == null ? 0.5 : tolerance;
    const cell = 16, horizontal = {}, vertical = [], out = [], seen = {};
    const bin = function (v) { return Math.floor(v / cell); };
    (design.wires || []).forEach(function (w) {
      segsOf(w.pts || []).forEach(function (s, i) {
        const ref = { w: w, s: s, i: i };
        if (s.v) vertical.push(ref);
        else if (Math.abs(s.y1 - s.y2) <= tol) {
          const k = w.sheet + '|' + bin(s.y1);
          (horizontal[k] = horizontal[k] || []).push(ref);
        }
      });
    });
    vertical.forEach(function (v) {
      const y0 = bin(Math.min(v.s.y1, v.s.y2) - tol), y1 = bin(Math.max(v.s.y1, v.s.y2) + tol);
      for (let bi = y0; bi <= y1; bi++) {
        const list = horizontal[v.w.sheet + '|' + bi] || [];
        list.forEach(function (h) {
          const px = v.s.x1, py = h.s.y1;
          if (px < Math.min(h.s.x1, h.s.x2) - tol || px > Math.max(h.s.x1, h.s.x2) + tol) return;
          if (py < Math.min(v.s.y1, v.s.y2) - tol || py > Math.max(v.s.y1, v.s.y2) + tol) return;
          const ids = [String(v.w.id), String(h.w.id)].sort();
          const key = v.w.sheet + '|' + px.toFixed(2) + '|' + py.toFixed(2) + '|' + ids.join('|');
          if (seen[key]) return;
          seen[key] = true;
          const interiorV = py > Math.min(v.s.y1, v.s.y2) + tol && py < Math.max(v.s.y1, v.s.y2) - tol;
          const interiorH = px > Math.min(h.s.x1, h.s.x2) + tol && px < Math.max(h.s.x1, h.s.x2) - tol;
          out.push({ sheet: v.w.sheet, x: px, y: py, a: v, b: h, interiorV: interiorV, interiorH: interiorH, interior: interiorV && interiorH });
        });
      }
    });
    return out;
  }
  function sharedPinAt(design, a, b, x, y) {
    const na = netById(design, a.w.net), nb = netById(design, b.w.net);
    if (!na || !nb) return false;
    const ea = [na.a, na.b], eb = [nb.a, nb.b];
    for (let i = 0; i < ea.length; i++) for (let j = 0; j < eb.length; j++) {
      if (ea[i].d !== eb[j].d || ea[i].p !== eb[j].p) continue;
      const pin = pinAbs(design.map || {}, ea[i]);
      const dev = (design.map || {})[ea[i].d];
      if (pin && dev && dev.sheet === a.w.sheet && Math.abs(pin.x - x) <= 1 && Math.abs(pin.y - y) <= 1) return true;
    }
    return false;
  }
  function hasMarkerAt(markers, sheet, x, y, tol) {
    return (markers || []).some(function (m) {
      return m.sheet === sheet && Math.abs(m.x - x) <= tol && Math.abs(m.y - y) <= tol;
    });
  }
  function sameWireAdjacentAt(pair) {
    if (pair.a.w !== pair.b.w || Math.abs(pair.a.i - pair.b.i) !== 1) return false;
    const p = pair.a.w.pts[Math.max(pair.a.i, pair.b.i)];
    return !!p && Math.abs(p[0] - pair.x) <= 0.6 && Math.abs(p[1] - pair.y) <= 0.6;
  }
  function auditCrossings(design) {
    const pairs = crossingPairs(design), missingHops = [], expectedJunctions = {};
    let distinctNetCrossings = 0;
    pairs.forEach(function (pair) {
      const sameNet = pair.a.w.net === pair.b.w.net;
      const sharedPin = sharedPinAt(design, pair.a, pair.b, pair.x, pair.y);
      if (!sameNet && !sharedPin) {
        distinctNetCrossings++;
        const hop = (design.hops || []).some(function (h) {
          return h.sheet === pair.sheet && Math.abs(h.x - pair.x) <= 1 && Math.abs(h.y - pair.y) <= 1 && (!h.w || h.w === pair.a.w.id || h.w === pair.b.w.id);
        });
        if (!hop) missingHops.push(pair);
      }
      if ((sameNet || sharedPin) && !sharedPin && !sameWireAdjacentAt(pair)) {
        expectedJunctions[pair.sheet + '|' + pair.x.toFixed(1) + '|' + pair.y.toFixed(1)] = pair;
      }
    });
    const endpointCounts = {};
    (design.wires || []).forEach(function (w) {
      if (!w.pts || w.pts.length < 2) return;
      [w.pts[0], w.pts[w.pts.length - 1]].forEach(function (p) {
        const k = w.sheet + '|' + Math.round(p[0]) + '|' + Math.round(p[1]);
        const e = endpointCounts[k] || (endpointCounts[k] = { sheet: w.sheet, x: Math.round(p[0]), y: Math.round(p[1]), count: 0 });
        e.count++;
      });
    });
    Object.keys(endpointCounts).forEach(function (k) {
      const e = endpointCounts[k];
      if (e.count >= 2) expectedJunctions[e.sheet + '|' + e.x.toFixed(1) + '|' + e.y.toFixed(1)] = e;
    });
    const missingJunctions = Object.keys(expectedJunctions).map(function (k) { return expectedJunctions[k]; }).filter(function (p) {
      return !hasMarkerAt(design.junctions, p.sheet, p.x, p.y, 1);
    });
    return { pairs: pairs, distinctNetCrossings: distinctNetCrossings, missingHops: missingHops, missingJunctions: missingJunctions };
  }
  /* V3-1: 真实本体相交（无 PAD 容差）——用于 C02/推挤的"穿越本体"判定 */
  /* V10-GUARD: 引线 stub 豁免（首末段、pin 轴向、朝外）与体内穿入判定 */
  function leadStubSegW(w, s, i, len, design) {
    if (i !== 0 && i !== len - 1) return false;
    /* `w.a/w.b` are route-time snapshots. Reflow, symbol moves and shove
     * operations can move the physical pins after those snapshots are made;
     * resolve live pin coordinates for the lead-stub exemption. */
    const n = design && netById(design, w.net);
    const live = n && design.map ? [pinAbs(design.map, n.a), pinAbs(design.map, n.b)] : [];
    const cands = live.some(function (e) { return !!e; }) ? live.filter(function (e) { return e && e.d; }) : [w.a, w.b].filter(function (e) { return e && e.d; });
    for (let ci = 0; ci < cands.length; ci++) {
      const e = cands[ci];
      const dv = DIRV[e.d];
      if (!dv) continue;
      const t1 = Math.abs(s.x1 - e.x) < 0.6 && Math.abs(s.y1 - e.y) < 0.6;
      const t2 = Math.abs(s.x2 - e.x) < 0.6 && Math.abs(s.y2 - e.y) < 0.6;
      if (!t1 && !t2) continue;
      const ox = (t1 ? s.x2 : s.x1) - e.x, oy = (t1 ? s.y2 : s.y1) - e.y;
      const axial = dv[1] === 0 ? Math.abs(oy) < 0.6 : Math.abs(ox) < 0.6;
      if (axial && (ox * dv[0] + oy * dv[1]) > 0) return true;
    }
    return false;
  }
  function ptsIntrude(design, w, pts, mode) {
    const sg = segsOf(pts);
    for (let di = 0; di < design.devices.length; di++) {
      const v = design.devices[di];
      if (v.sheet !== w.sheet || v.x == null || v.sym.isBus || v.sym.isXref || v.pwr) continue;
      const dm = devDims(v);
      /* V11: 默认 keepout 级；mode='body' 用于 separate 平行干推挤（环带内允许） */
      const rr = mode === 'body' ? { x: v.x + 2, y: v.y + 2, w: dm.w - 4, h: dm.h - 4 } : { x: v.x - 6, y: v.y - 6, w: dm.w + 12, h: dm.h + 12 };
      if (rr.w <= 0 || rr.h <= 0) continue;
      for (let i = 0; i < sg.length; i++) {
        if (leadStubSegW(w, sg[i], i, sg.length, design)) continue;
        if (hitRect(sg[i], rr)) return true;
      }
    }
    return false;
  }
  function bodyHitRect(s, r) {
    const lo = (a, b) => Math.min(a, b), hi = (a, b) => Math.max(a, b);
    if (s.v) return s.x1 >= r.x && s.x1 <= r.x + r.w && hi(s.y1, s.y2) > r.y && lo(s.y1, s.y2) < r.y + r.h;
    return s.y1 >= r.y && s.y1 <= r.y + r.h && hi(s.x1, s.x2) > r.x && lo(s.x1, s.x2) < r.x + r.w;
  }
  function hitRect(s, r) {
    const lo = (a, b) => Math.min(a, b), hi = (a, b) => Math.max(a, b);
    if (s.v) return s.x1 > r.x - PAD && s.x1 < r.x + r.w + PAD && hi(s.y1, s.y2) > r.y - PAD && lo(s.y1, s.y2) < r.y + r.h + PAD;
    return s.y1 > r.y - PAD && s.y1 < r.y + r.h + PAD && hi(s.x1, s.x2) > r.x - PAD && lo(s.x1, s.x2) < r.x + r.w + PAD;
  }
  function newUsed() { return { v: {}, h: {} }; }
  function addUsed(u, s) {
    const m = s.v ? u.v : u.h, c = s.v ? s.x1 : s.y1, k = Math.floor(c / MIN_CLEAR);
    (m[k] = m[k] || []).push(s);
  }
  function tooClose(s, u) {
    const m = s.v ? u.v : u.h, c = s.v ? s.x1 : s.y1, k = Math.floor(c / MIN_CLEAR);
    for (let b = k - 1; b <= k + 1; b++) {
      const arr = m[b]; if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const t = arr[i];
        if (s.v) {
          if (Math.abs(t.x1 - s.x1) >= MIN_CLEAR) continue;
          if (Math.max(s.y1, s.y2) < Math.min(t.y1, t.y2) + 2 || Math.min(s.y1, s.y2) > Math.max(t.y1, t.y2) - 2) continue;
        } else {
          if (Math.abs(t.y1 - s.y1) >= MIN_CLEAR) continue;
          if (Math.max(s.x1, s.x2) < Math.min(t.x1, t.x2) + 2 || Math.min(s.x1, s.x2) > Math.max(t.x1, t.x2) - 2) continue;
        }
        return true;
      }
    }
    return false;
  }

  function route(design) {
    const M = design.map;
    const flowAware = design.params && design.params.family === 'mwess';
    const obst = {};
    design.sheets.forEach(function (s) { obst[s.no] = []; });
    design.devices.forEach(function (d) {
      if (d.sym.isBus || d.x == null || d.pwr) return; /* v2.0.4: 旗标非实体 */
      (obst[d.sheet] || []).push(deviceKeepout(d));
    });
    const used = {}; design.sheets.forEach(function (s) { used[s.no] = newUsed(); });
    const soft = {}; design.sheets.forEach(function (s) { soft[s.no] = []; });
    (design.boxes || []).forEach(function (b) {
      if (b.kind === 'body' || b.kind === 'corridor') return; /* V6-GCORR: 走廊仅供 XR 摆放，不入布线软障碍 */
      (soft[b.sheet] || []).push({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h });
    });
    design.soft = soft;
    const wires = [];
    /* 布线次序：短的、已对齐的先占直道，长的后绕行（经典启发，不影响确定性） */
    const classOrder = { AC: 0, DC: 0, ESS: 0, PE: 1, AUX: 2, SAF: 3, CTL: 4, COMM: 5 };
    const order = design.nets.map(function (n, i) {
      const A = pinAbs(M, n.a), B = pinAbs(M, n.b);
      const d = (A && B) ? Math.abs(A.x - B.x) + Math.abs(A.y - B.y) : 1e9;
      return { n: n, i: i, d: d, priority: classOrder[n.cls] == null ? 6 : classOrder[n.cls] };
    }).sort(function (p, q) {
      return (flowAware && p.priority !== q.priority ? p.priority - q.priority : p.d - q.d) || p.i - q.i;
    });
    /* v2.24 audit-fix: hub 器件（≥8 网）的网按引脚坐标聚簇连续布线——相邻引脚占相邻车道，消除交叉团 */
    (function () {
      const hubCount = {};
      design.nets.forEach(function (nn) { hubCount[nn.a.d] = (hubCount[nn.a.d] || 0) + 1; hubCount[nn.b.d] = (hubCount[nn.b.d] || 0) + 1; });
      const pinKey = function (nn, devId) {
        const dv = M[devId]; if (!dv) return { side: '?', c: 0 };
        const pn = pinOf(dv, devId === nn.a.d ? nn.a.p : nn.b.p);
        if (!pn) return { side: '?', c: 0 };
        return (pn.d === 'N' || pn.d === 'S') ? { side: pn.d, c: dv.x + pn.x } : { side: pn.d, c: dv.y + pn.y };
      };
      const groups = {};
      order.forEach(function (o, i) {
        const nn = o.n;
        let h = (hubCount[nn.a.d] || 0) >= 8 ? nn.a.d : ((hubCount[nn.b.d] || 0) >= 8 ? nn.b.d : null);
        if (!h) return;
        const pk = pinKey(nn, h);
        const gk = h + '|' + pk.side;
        (groups[gk] = groups[gk] || []).push({ i: i, key: pk.c });
      });
      Object.keys(groups).forEach(function (gk) {
        const g = groups[gk].sort(function (a, b) { return a.key - b.key; });
        const slots = g.map(function (x) { return x.i; }).sort(function (a, b) { return a - b; });
        const items = g.map(function (x) { return order[x.i]; });
        slots.forEach(function (s, k) { order[s] = items[k]; });
      });
    })();
    order.forEach(function (o) {
      const n = o.n;
      const A = pinAbs(M, n.a), B = pinAbs(M, n.b);
      if (!A || !B) { n.err = 'PIN_NOT_FOUND'; return; }
      const sh = M[n.a.d].sheet;
      A.esc = (M[n.a.d].sym.isXref || M[n.a.d].pwr) ? 0 : ESC; B.esc = (M[n.b.d].sym.isXref || M[n.b.d].pwr) ? 0 : ESC;
      const pts = solve(A, B, obst[sh], used[sh], n.a.d, n.b.d, soft[sh], n.cls, !!(M[n.a.d].sym.noCross || M[n.b.d].sym.noCross), flowAware);
      if (!pts || pts.length < 2) { n.err = 'ROUTE_NO_CLEAR_PATH'; return; }
      /* V11-FLUSH: 两端补沿 pin 方向 10px 引出段（引线只能从 pin 往外引的视觉与分离基础） */
      const stubFix = function (pts2, e, front) {
        /* V11: 先清 [X,Y,X] 折返尖刺 */
        while (pts2.length >= 3) {
          const L = pts2.length;
          const a0 = pts2[0], b0 = pts2[1], c0 = pts2[2];
          const a1x = pts2[L - 3], b1x = pts2[L - 2], c1x = pts2[L - 1];
          if (Math.abs(a0[0] - c0[0]) < 0.01 && Math.abs(a0[1] - c0[1]) < 0.01 && (Math.abs(a0[0] - b0[0]) > 0.01 || Math.abs(a0[1] - b0[1]) > 0.01)) pts2.splice(1, 1);
          else if (Math.abs(a1x[0] - c1x[0]) < 0.01 && Math.abs(a1x[1] - c1x[1]) < 0.01 && (Math.abs(a1x[0] - b1x[0]) > 0.01 || Math.abs(a1x[1] - b1x[1]) > 0.01)) pts2.splice(L - 2, 1);
          else break;
        }
        if (!e || !e.d || pts2.length < 2) return pts2;
        const dvv = DIRV[e.d];
        if (!dvv) return pts2;
        const p = front ? pts2[1] : pts2[pts2.length - 2];
        const e0 = pts2[0], e1 = pts2[pts2.length - 1];
        const ee = front ? e0 : e1;
        const ax = dvv[1] === 0 ? Math.abs(p[1] - ee[1]) < 0.01 : Math.abs(p[0] - ee[0]) < 0.01;
        const sgn = dvv[1] === 0 ? Math.sign(p[0] - ee[0]) : Math.sign(p[1] - ee[1]);
        if (ax && sgn === (dvv[1] === 0 ? dvv[0] : dvv[1])) return pts2;
        const s = [ee[0] + dvv[0] * 10, ee[1] + dvv[1] * 10];
        const c = dvv[0] === 0 ? [p[0], s[1]] : [s[0], p[1]];
        const ins = [s, c].filter(function (q2, qi, arr2) {
          const prev = qi === 0 ? ee : arr2[qi - 1];
          return Math.abs(q2[0] - prev[0]) > 0.01 || Math.abs(q2[1] - prev[1]) > 0.01;
        });
        if (!ins.length) return pts2;
        const last = ins[ins.length - 1];
        if (Math.abs(last[0] - p[0]) < 0.01 && Math.abs(last[1] - p[1]) < 0.01) ins.pop();
        if (!ins.length) return pts2;
        return front ? [pts2[0]].concat(ins, pts2.slice(1)) : pts2.slice(0, pts2.length - 1).concat(ins, [pts2[pts2.length - 1]]);
      };
      let ptsF = stubFix(pts, A, true);
      ptsF = stubFix(ptsF, B, false);
      ptsF.forEach(function (q3) { q3[0] = Math.round(q3[0]); q3[1] = Math.round(q3[1]); });
      const sg = segsOf(ptsF);
      sg.forEach(function (s) { addUsed(used[sh], s); });
      wires.push({ id: 'W-' + n.id, net: n.id, cls: n.cls, name: n.name, sheet: sh, pts: ptsF, a: A, b: B, via: VIA });
      n.wire_id = 'W-' + n.id;
    });
    wires.sort(function (p, q) { return p.net < q.net ? -1 : p.net > q.net ? 1 : 0; });
    wires.forEach(function (w, i) { w.wno = 'W' + String(i + 1).padStart(3, '0'); }); /* v2.12: 唯一线号 */
    design.wires = wires;
    return design;
  }

  /* 引脚扇出：出线段长度可在多个档位间选，使相邻引脚的拐点错开（C05 主因） */
  const FANOUT = [0, MIN_CLEAR, 2 * MIN_CLEAR, 3 * MIN_CLEAR, 4 * MIN_CLEAR, -4];

  /* 保证返回路径的起点始终是 A（混合方向的形状模板会产生反向路径） */
  function orient(pts, A0) {
    if (!pts || pts.length < 2) return pts;
    const p = pts[0], q = pts[pts.length - 1];
    const dA = Math.abs(p[0] - A0[0]) + Math.abs(p[1] - A0[1]);
    const dZ = Math.abs(q[0] - A0[0]) + Math.abs(q[1] - A0[1]);
    return (dZ < dA) ? pts.slice().reverse() : pts;
  }

  let OWN_HARD = false; /* V11: 当前 solve 是否信号线（COMM/CTL 自体硬障碍） */
  function solve(A, B, ob, used, ida, idb, soft, cls, oh, strict) {
    OWN_HARD = !!oh || cls === 'COMM' || cls === 'CTL';
    if (strict) {
      /* 相邻端子密集时逐级增加引出长度，让同组引脚先扇出再并入干线。 */
      for (let i = 0; i < FANOUT.length; i++) {
        const pts = solveAt(A, B, ob, used, ida, idb, soft, FANOUT[i], true, true);
        if (pts && pts.length > 1) return pts;
      }
      VIA = 'NO_CLEAR_PATH';
      return null;
    }
    return solveAt(A, B, ob, used, ida, idb, soft, 0, true, !!strict);
  }

  function solveAt(A, B, ob, used, ida, idb, soft, fan, last, strict) {
    const va = DIRV[A.d] || [1, 0], vb = DIRV[B.d] || [-1, 0];
    /* V10-CLAMP: 端点器件外框；lane 落入则夹到最近外侧（保可行性：仅移动 lane，不删候选） */
    const bodySpan = function (id) { for (let q = 0; q < ob.length; q++) { if (ob[q].id === id) return ob[q]; } return null; };
    const RA = bodySpan(ida), RB = bodySpan(idb);
    const clampY = function (m) { const bs = [RA, RB]; for (let q = 0; q < 2; q++) { const r = bs[q]; if (!r) continue; if (m > r.y + 2 && m < r.y + r.h - 2) m = (m < r.y + r.h / 2) ? r.y - 12 : r.y + r.h + 12; } return m; };
    const clampX = function (m) { const bs = [RA, RB]; for (let q = 0; q < 2; q++) { const r = bs[q]; if (!r) continue; if (m > r.x - 6 && m < r.x + r.w + 6) m = (m < r.x + r.w / 2) ? r.x - 12 : r.x + r.w + 12; /* V11: lane 须在外边框外 */ } return m; };
    let ea = A.esc == null ? ESC : A.esc, eb = B.esc == null ? ESC : B.esc;
    if (ea) ea = Math.max(6, ea + fan);
    if (eb) eb = Math.max(6, eb + fan);
    const a1 = [A.x + va[0] * ea, A.y + va[1] * ea];
    const b1 = [B.x + vb[0] * eb, B.y + vb[1] * eb];
    const A0 = [A.x, A.y], B0 = [B.x, B.y];
    const hA = va[1] === 0, hB = vb[1] === 0;
    const ok = (pts, useSoft, ignoreUsed) => {
      const sg = segsOf(pts);
      for (let i = 0; i < sg.length; i++) {
        for (let j = 0; j < ob.length; j++) {
          const r = ob[j];
          if (r.id === ida || r.id === idb) {
            const stub = i === 0 || i === sg.length - 1;
            const core = r.core || r;
            if (stub && !bodyHitRect(sg[i], core)) continue;
            if (stub) return false;
          }
          if (hitRect(sg[i], r)) return false;
        }
        if (useSoft && soft) {
          for (let j = 0; j < soft.length; j++) {
            const r = soft[j];
            if (r.id === ida || r.id === idb) continue;
            if (hitRect(sg[i], r)) return false;
          }
        }
        if (!ignoreUsed && i > 0 && i < sg.length - 1 && used && tooClose(sg[i], used)) return false;
      }
      return true;
    };
    if (hA && hB && Math.abs(A.y - B.y) < 0.6) { if ((A.x - B.x) * vb[0] < 0) { const s = [A0, [B.x, A.y]]; if (ok(s, true)) return s; } }
    if (!hA && !hB && Math.abs(A.x - B.x) < 0.6) { if ((A.y - B.y) * vb[1] < 0) { const s = [A0, [A.x, B.y]]; if (ok(s, true)) return s; } }
    const lane = (base, k) => base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * MIN_CLEAR;
    const sameDir = (u, v) => u[0] === v[0] && u[1] === v[1];
    let first = null;
    const shapes = [];
    if (hA && hB) {
      const bx = sameDir(va, vb) ? (va[0] > 0 ? Math.max(a1[0], b1[0]) + 12 : Math.min(a1[0], b1[0]) - 12) : Math.round((a1[0] + b1[0]) / 2);
      shapes.push({ n: 90, f: (k) => { const m = clampX(lane(bx, k)); return [A0, a1, [m, a1[1]], [m, b1[1]], b1, B0]; } });
      const by = Math.round((a1[1] + b1[1]) / 2);
      shapes.push({ n: 60, f: (k) => { const m = clampY(lane(by, k)); return [A0, a1, [a1[0], m], [b1[0], m], b1, B0]; } });
    } else if (!hA && !hB) {
      const by = sameDir(va, vb) ? (va[1] > 0 ? Math.max(a1[1], b1[1]) + 12 : Math.min(a1[1], b1[1]) - 12) : Math.round((a1[1] + b1[1]) / 2);
      shapes.push({ n: 90, f: (k) => { const m = clampY(lane(by, k)); return [A0, a1, [a1[0], m], [b1[0], m], b1, B0]; } });
      const bx = Math.round((a1[0] + b1[0]) / 2);
      shapes.push({ n: 60, f: (k) => { const m = clampX(lane(bx, k)); return [A0, a1, [m, a1[1]], [m, b1[1]], b1, B0]; } });
    } else {
      const H = hA ? a1 : b1, V = hA ? b1 : a1;
      const P1 = hA ? A0 : B0, P2 = hA ? B0 : A0;
      shapes.push({ n: 1, f: () => [P1, H, [V[0], H[1]], V, P2] });
      shapes.push({ n: 60, f: (k) => { const m = lane(H[1], k + 1); return [P1, H, [H[0], m], [V[0], m], V, P2]; } });
      shapes.push({ n: 60, f: (k) => { const m = lane(V[0], k + 1); return [P1, H, [m, H[1]], [m, V[1]], V, P2]; } });
    }
    /* 第1轮：固定简洁形状（硬障 + 文字带均避让）—— 大多数网络走这里 */
    for (let si = 0; si < shapes.length; si++) {
      for (let k = 0; k < shapes[si].n; k++) {
        const c = shapes[si].f(k);
        if (!first) first = c;
        if (ok(c, true)) { VIA = fan ? 'shape-fan' : 'shape'; return orient(c, A0); }
      }
    }
    /* 扇出档位未穷尽前不降级：交由下一个档位尝试 */
    if (!last) return null;
    /* 第2轮：A* 通道绕障（避器件 + 避文字）；V12: OWN_HARD 不在这里松（自体穿越留给第5轮兕底） */
    let ap = pathFindAdaptive(A, B, ob, soft || [], used, ida, idb, a1, b1, A0, B0, false, strict);
    if (ap) { const po = orient(ap, A0); if (ok(po, true)) { VIA = 'astar'; return po; } }
    /* 第3轮：A* 仅绕器件（允许压文字，C02 优先于 C08） */
    let ap2 = pathFindAdaptive(A, B, ob, soft || [], used, ida, idb, a1, b1, A0, B0, true, strict);
    if (ap2) { const po = orient(ap2, A0); if (ok(po, false)) { VIA = 'astar-nosoft'; return po; } }
    /* 第4轮：不穿器件优先于间距（C02 > C05），先避文字再不避 */
    for (let si = 0; si < shapes.length; si++) {
      for (let k = 0; k < shapes[si].n; k++) {
        const c = shapes[si].f(k);
        if (ok(c, true, true)) { VIA = 'shape-nogap'; return orient(c, A0); }
      }
    }
    for (let si = 0; si < shapes.length; si++) {
      for (let k = 0; k < shapes[si].n; k++) {
        const c = shapes[si].f(k);
        if (ok(c, false, true)) { VIA = 'shape-hard'; return orient(c, A0); }
      }
    }
    /* 第5轮（V2.2）：禁止“穿自体”兜底；无路径时明确失败，交由布局/通道扩容处理 */
    /* V2.2：硬禁区-only 通道兜底——忽略文字/已用通道，仍不得穿越器件与管脚区 */
    const apH = pathFindAdaptive(A, B, ob, [], null, ida, idb, a1, b1, A0, B0, true, true);
    if (apH) {
      const ph = orient(apH, A0);
      if (ok(ph, false, true)) { VIA = 'astar-hard'; return ph; }
    }
    /* MWESS 方案禁止穿器件兜底；无路时明确留错并阻止误交付。 */
    if (strict) { VIA = 'NO_CLEAR_PATH'; return null; }
    VIA = 'FALLBACK';
    if (hA && hB && Math.abs(A.y - B.y) < 0.6) return [A0, [B.x, A.y]];
    if (!hA && !hB && Math.abs(A.x - B.x) < 0.6) return [A0, [A.x, B.y]];
    /* V7-ORTH: 斜线兜底改为正交 L/Z 候选（横平竖直），优先不穿器件/文字 */
    const mx = Math.round((A.x + B.x) / 2), my = Math.round((A.y + B.y) / 2);
    const fbC = [
      [A0, [B.x, A.y], B0],
      [A0, [A.x, B.y], B0],
      [A0, [mx, A.y], [mx, B.y], B0],
      [A0, [A.x, my], [B.x, my], B0]
    ];
    /* V7-FIX3: ok 通过不代表无贴行——2 段候选的 used 检查被中间段条件跳过；改为在 ok 通过候选中选全段冲突最少者 */
    let bkOK = -1, bkC = 1e9, bkHard = -1, bkHC = 1e9;
    for (let fi = 0; fi < fbC.length; fi++) {
      if (!ok(fbC[fi], true)) continue;
      const sg = segsOf(fbC[fi]);
      let cn = 0;
      for (let qi = 0; qi < sg.length; qi++) { if (used && tooClose(sg[qi], used)) cn++; }
      if (cn === 0) { VIA = 'FALLBACK-ORTH'; return orient(fbC[fi], A0); }
      if (cn < bkC) { bkC = cn; bkOK = fi; }
    }
    if (bkOK >= 0) { VIA = 'FALLBACK-ORTH-BK'; return orient(fbC[bkOK], A0); }
    for (let fi = 0; fi < fbC.length; fi++) {
      if (!ok(fbC[fi], false)) continue;
      const sg = segsOf(fbC[fi]);
      let cn = 0;
      for (let qi = 0; qi < sg.length; qi++) { if (used && tooClose(sg[qi], used)) cn++; }
      if (cn === 0) { VIA = 'FALLBACK-ORTH-H'; return orient(fbC[fi], A0); }
      if (cn < bkHC) { bkHC = cn; bkHard = fi; }
    }
    if (bkHard >= 0) { VIA = 'FALLBACK-ORTH-HB'; return orient(fbC[bkHard], A0); }
    /* V7-ORTH-FIX: 全候选均不通过时，取与已占用通道冲突最少者（盲选 fbC[0] 曾在 480+400 储充引起 C05）。注意必须统计全部段：2 段候选的“中间段”集合为空会导致四候选同分再度盲选 */
    let bestI = 0, bestC = 1e9;
    for (let fi = 0; fi < fbC.length; fi++) {
      const sg = segsOf(fbC[fi]);
      let cn = 0;
      for (let qi = 0; qi < sg.length; qi++) { if (used && tooClose(sg[qi], used)) cn++; }
      if (cn < bestC) { bestC = cn; bestI = fi; }
    }
    VIA = 'FALLBACK-ORTH-MIN';
    return orient(fbC[bestI], A0);

  }

  /* ============================================================
   * 2b. A* 通道布线
   *   格网：障碍物（器件体 + 标注文字带 + 跨页符）边界±PAD 汇成的稀疏坐标
   *   代价：长度 + 拐点 + 文字带罚函数 + 通道已占罚函数
   * ============================================================ */
  function Heap() { this.a = []; }
  Heap.prototype.push = function (n) {
    const a = this.a; a.push(n); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; const t = a[p]; a[p] = a[i]; a[i] = t; i = p; }
  };
  Heap.prototype.pop = function () {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        const t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };

  function axisCoords(vals, must, cap) {
    const s = {};
    vals.forEach(function (v) { s[Math.round(v)] = 1; });
    must.forEach(function (v) { delete s[Math.round(v)]; });
    let arr = Object.keys(s).map(Number).sort(function (m, n) { return m - n; });
    if (arr.length > cap) {
      /* 均匀降采：保留全跳跃的空间覆盖，而不是只留中心附近
         —— 这是 68 条网络找不到路径的真因 */
      const out = [], step = arr.length / cap;
      for (let i = 0; i < cap; i++) out.push(arr[Math.min(arr.length - 1, Math.round(i * step))]);
      arr = out;
    }
    must.forEach(function (v) { arr.push(v); });
    const u = {}; const res = [];
    arr.sort(function (m, n) { return m - n; }).forEach(function (v) { if (!u[v]) { u[v] = 1; res.push(v); } });
    return res;
  }

  /* 自适应边界盒：小盒快，失败则逐级扩大到足以绕过大母排群（C02 主因） */
  function pathFindAdaptive(A, B, hard, soft, used, ida, idb, a1, b1, A0, B0, noSoft, strict) {
    const BOXES = strict ? [190, 560, 1120, 2240] : [190, 560];
    for (let i = 0; i < BOXES.length; i++) {
      const cap = strict && i >= 2 ? 80 : 52;
      const r = pathFind(A, B, hard, soft, used, ida, idb, a1, b1, A0, B0, noSoft, BOXES[i], cap, strict);
      if (r) return r;
    }
    return null;
  }

  function pathFind(A, B, hard, soft, used, ida, idb, a1, b1, A0, B0, noSoft, padx, cap, strict) {
    const PADX = padx || 190, CAP = cap || 52, MAXPOP = strict && CAP >= 80 ? 100000 : 26000;
    const bb = { x: Math.min(a1[0], b1[0]) - PADX, y: Math.min(a1[1], b1[1]) - PADX, w: Math.abs(a1[0] - b1[0]) + 2 * PADX, h: Math.abs(a1[1] - b1[1]) + 2 * PADX };
    const H = [], S = [], xv = [], yv = [];
    const LANES = [PAD, PAD + MIN_CLEAR, PAD + 2 * MIN_CLEAR];
    const feed = function (r) {
      LANES.forEach(function (L) { xv.push(r.x - L, r.x + r.w + L); yv.push(r.y - L, r.y + r.h + L); });
    };
    for (let i = 0; i < hard.length; i++) { const r = hard[i]; if (r.id === ida || r.id === idb) continue; if (!overlap(r, bb)) continue; H.push(r); feed(r); } /* 端点器件不参与 A* 硬障碍，最终 ok() 用 core 严格复核首末段与中间段 */
    for (let i = 0; i < soft.length; i++) { const r = soft[i]; if (r.id === ida || r.id === idb) continue; if (!overlap(r, bb)) continue; S.push(r); feed(r); }
    if (!H.length && !S.length) return null;
    xv.push(Math.round((a1[0] + b1[0]) / 2));
    yv.push(Math.round((a1[1] + b1[1]) / 2));
    const X0 = axisCoords(xv, [a1[0], b1[0]], CAP), Y0 = axisCoords(yv, [a1[1], b1[1]], CAP);
    /* 格网必须限在 bb 内：越过 bb 后障碍物集合不完备，会漏判穿器件 */
    const inb = function (v, lo, hi) { return v >= lo - 0.5 && v <= hi + 0.5; };
    const mustX = {}, mustY = {};
    mustX[a1[0]] = 1; mustX[b1[0]] = 1; mustY[a1[1]] = 1; mustY[b1[1]] = 1;
    const X = X0.filter(function (v) { return mustX[v] || inb(v, bb.x, bb.x + bb.w); });
    const Y = Y0.filter(function (v) { return mustY[v] || inb(v, bb.y, bb.y + bb.h); });
    const NX = X.length, NY = Y.length;
    const ix0 = X.indexOf(a1[0]), iy0 = Y.indexOf(a1[1]);
    const ix1 = X.indexOf(b1[0]), iy1 = Y.indexOf(b1[1]);
    if (ix0 < 0 || iy0 < 0 || ix1 < 0 || iy1 < 0) return null;

    /* 障碍物一次性光栅到格网边（而不是每条边遍历障碍物） */
    const NE = NX * NY;
    const bH = new Uint8Array(NE), bV = new Uint8Array(NE);
    const sH = new Uint8Array(NE), sV = new Uint8Array(NE);
    const raster = function (list, hb, vb) {
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        const x0 = r.x - PAD, x1 = r.x + r.w + PAD, y0 = r.y - PAD, y1 = r.y + r.h + PAD;
        for (let yi = 0; yi < NY; yi++) {
          if (Y[yi] <= y0 || Y[yi] >= y1) continue;
          for (let xi = 0; xi + 1 < NX; xi++) {
            if (X[xi + 1] <= x0 || X[xi] >= x1) continue;
            hb[yi * NX + xi] = 1;
          }
        }
        for (let xi = 0; xi < NX; xi++) {
          if (X[xi] <= x0 || X[xi] >= x1) continue;
          for (let yi = 0; yi + 1 < NY; yi++) {
            if (Y[yi + 1] <= y0 || Y[yi] >= y1) continue;
            vb[yi * NX + xi] = 1;
          }
        }
      }
    };
    raster(H, bH, bV);
    if (!noSoft) raster(S, sH, sV);
    const gapH = new Int8Array(NE), gapV = new Int8Array(NE);
    const gapOf = function (xi, yi, horiz) {
      const idx = yi * NX + xi, cache = horiz ? gapH : gapV;
      if (cache[idx]) return cache[idx] > 0 ? 1 : 0;
      const s = horiz
        ? { x1: X[xi], y1: Y[yi], x2: X[xi + 1], y2: Y[yi], v: false }
        : { x1: X[xi], y1: Y[yi], x2: X[xi], y2: Y[yi + 1], v: true };
      const hit = used ? tooClose(s, used) : false;
      cache[idx] = hit ? 1 : -1;
      return hit ? 1 : 0;
    };
    const key = (xi, yi, d) => ((yi * NX + xi) << 2) | d;
    const g = {}, prev = {};
    const h = (xi, yi) => Math.abs(X[xi] - X[ix1]) + Math.abs(Y[yi] - Y[iy1]);
    const hp = new Heap();
    [0, 1, 2, 3].forEach(function (d) { const k = key(ix0, iy0, d); g[k] = 0; hp.push({ xi: ix0, yi: iy0, d: d, g: 0, f: h(ix0, iy0) }); });
    let pops = 0, endKey = -1;
    while (hp.a.length) {
      const cur = hp.pop(); pops++;
      if (pops > MAXPOP) break;
      const ck = key(cur.xi, cur.yi, cur.d);
      if (cur.g > (g[ck] == null ? Infinity : g[ck])) continue;
      if (cur.xi === ix1 && cur.yi === iy1) { endKey = ck; break; }
      const moves = [[1, 0, 0], [-1, 0, 1], [0, 1, 2], [0, -1, 3]];
      for (let m = 0; m < 4; m++) {
        const nxi = cur.xi + moves[m][0], nyi = cur.yi + moves[m][1], nd = moves[m][2];
        if (nxi < 0 || nxi >= NX || nyi < 0 || nyi >= NY) continue;
        const horiz = nd < 2;
        const exi = horiz ? Math.min(cur.xi, nxi) : cur.xi;
        const eyi = horiz ? cur.yi : Math.min(cur.yi, nyi);
        const ei = eyi * NX + exi;
        if ((horiz ? bH : bV)[ei]) continue;
        let ec = Math.abs(X[nxi] - X[cur.xi]) + Math.abs(Y[nyi] - Y[cur.yi]);
        if ((horiz ? sH : sV)[ei]) ec += 2600;
        if (gapOf(exi, eyi, horiz)) ec += 1400;
        const ng = cur.g + ec + (nd !== cur.d ? 46 : 0);
        const nk = key(nxi, nyi, nd);
        if (g[nk] != null && g[nk] <= ng) continue;
        g[nk] = ng; prev[nk] = ck;
        hp.push({ xi: nxi, yi: nyi, d: nd, g: ng, f: ng + h(nxi, nyi) });
      }
    }
    if (endKey < 0) return null;
    const pts = [];
    let k = endKey, guard = 0;
    while (k != null && guard++ < 4000) {
      const cell = k >> 2, xi = cell % NX, yi = (cell - xi) / NX;
      pts.push([X[xi], Y[yi]]);
      k = prev[k];
    }
    pts.reverse();
    const out = [A0];
    pts.forEach(function (p) {
      const last = out[out.length - 1];
      if (Math.abs(last[0] - p[0]) < 0.01 && Math.abs(last[1] - p[1]) < 0.01) return;
      out.push(p);
    });
    out.push(B0);
    /* 压平共线拐点 */
    const cp = [out[0]];
    for (let i = 1; i < out.length - 1; i++) {
      const a = cp[cp.length - 1], b = out[i], c = out[i + 1];
      const v1 = Math.abs(a[0] - b[0]) < 0.01, v2 = Math.abs(b[0] - c[0]) < 0.01;
      if (v1 === v2) continue;
      cp.push(b);
    }
    cp.push(out[out.length - 1]);
    return cp;
  }

  /* ============================================================
   * 2c. 自动车道分离：把间距 < MIN_CLEAR 的同向平行中间段挤开
   *   只动中间段，永不动引脚出线段（保证终结在真实端子上）
   * ============================================================ */
  function separate(design, sweeps) {
    const hardBy = {};
    design.devices.forEach(function (d) {
      if (d.sym.isBus || d.x == null || d.pwr) return;
      (hardBy[d.sheet] = hardBy[d.sheet] || []).push({ id: d.id, x: d.x, y: d.y, w: devDims(d).w, h: devDims(d).h });
    });
    for (let pass = 0; pass < (sweeps || 3); pass++) {
      const items = [];
      design.wires.forEach(function (w) {
        for (let i = 0; i < w.pts.length - 1; i++) {
          const a = w.pts[i], b = w.pts[i + 1];
          const v = Math.abs(a[0] - b[0]) < 0.01;
          items.push({ w: w, i: i, v: v, c: v ? a[0] : a[1], lo: v ? Math.min(a[1], b[1]) : Math.min(a[0], b[0]), hi: v ? Math.max(a[1], b[1]) : Math.max(a[0], b[0]), sheet: w.sheet, net: w.net, fix: (i === 0 || i === w.pts.length - 2) }); /* V11: 含首末段（fix=端点钉死不可横移） */
        }
      });
      const buck = {};
      items.forEach(function (it) {
        if (it.hi - it.lo < 1.5) return;
        const k = it.sheet + '|' + (it.v ? 'v' : 'h') + '|' + Math.floor(it.c / MIN_CLEAR);
        (buck[k] = buck[k] || []).push(it);
      });
      let moved = 0;
      Object.keys(buck).forEach(function (k) {
        const parts = k.split('|'), sheet = +parts[0], vert = parts[1] === 'v', base = +parts[2];
        const arr = [];
        for (let b = base - 1; b <= base + 1; b++) { const g = buck[sheet + '|' + parts[1] + '|' + b]; if (g) g.forEach(function (x) { arr.push(x); }); }
        for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
          let p = arr[i], q = arr[j];
          if (p.net === q.net || p.w === q.w) continue;
          if (q.hi - q.lo < 1.5) continue;
          if (Math.abs(p.c - q.c) >= MIN_CLEAR) continue;
          if (q.hi < p.lo + 3 || q.lo > p.hi - 3) continue;
          if (q.fix && !p.fix) { const sw = p; p = q; q = sw; } /* V11: 被推方不可动则互换 */
          if (q.fix) continue;
          const dir0 = (q.c >= p.c) ? 1 : -1;
          const SEPDBG = (typeof globalThis !== 'undefined' && globalThis.SEPDBG) ? 1 : 0;
          if (SEPDBG && Math.abs(p.c - 1164) < 3 && Math.abs(q.c - 1165) < 3) console.log('SEP pair p=' + p.net + '@' + p.c + ' q=' + q.net + '@' + q.c + ' fixp=' + p.fix + ' dir=' + dir0);
          const clashAt = function (cc) {
            for (let oi = 0; oi < items.length; oi++) {
              const o = items[oi];
              if (o === q || o === p || o.net === q.net || o.w === q.w) continue;
              if (o.v !== q.v) continue;
              if (Math.abs(o.c - cc) >= MIN_CLEAR - 0.01) continue;
              if (o.hi >= q.lo - 3 && o.lo <= q.hi + 3) { if (SEPDBG && Math.abs(p.c - 1164) < 3 && Math.abs(q.c - 1165) < 3) console.log('SEP clashBy nc=' + cc + ' o=' + o.net + '@' + o.c + ' x' + o.lo + '-' + o.hi); return true; }
            }
            return false;
          };
          const cands = [p.c + dir0 * MIN_CLEAR, p.c - dir0 * MIN_CLEAR, p.c + dir0 * 2 * MIN_CLEAR, p.c - dir0 * 2 * MIN_CLEAR, q.c + MIN_CLEAR, q.c - MIN_CLEAR, q.c + 2 * MIN_CLEAR, q.c - 2 * MIN_CLEAR]; /* V11: 扩候选车道 */
          let done = false, ncOut = null;
          for (let ci = 0; ci < cands.length && !done; ci++) {
            const nc = cands[ci];
            if (Math.abs(nc - q.c) < 0.01) continue;
            if (clashAt(nc)) { if (SEPDBG && Math.abs(p.c - 1164) < 3 && Math.abs(q.c - 1165) < 3) console.log('SEP clash nc=' + nc); continue; }
          const a = q.w.pts[q.i], b = q.w.pts[q.i + 1];
          const oa = a.slice(), ob = b.slice();
          if (vert) { a[0] = nc; b[0] = nc; } else { a[1] = nc; b[1] = nc; }
          const n = netById(design, q.w.net);
          let bad = false;
          for (let z = 0; z < q.w.pts.length - 1; z++) {
            const u = q.w.pts[z], v2 = q.w.pts[z + 1];
            if (Math.abs(u[0] - v2[0]) > 0.01 && Math.abs(u[1] - v2[1]) > 0.01) { bad = true; break; }
          }
          if (!bad) bad = ptsIntrude(design, q.w, q.w.pts, 'body');
          if (!bad) bad = segsOf(q.w.pts).some(function (s) {
            return (hardBy[sheet] || []).some(function (r) {
              if (n && (r.id === n.a.d || r.id === n.b.d)) return false;
              return hitRect(s, r);
            });
          });
          if (bad) { if (SEPDBG && Math.abs(p.c - 1164) < 3 && Math.abs(q.c - 1165) < 3) console.log('SEP badval nc=' + nc); q.w.pts[q.i] = oa; q.w.pts[q.i + 1] = ob; continue; }
          if (SEPDBG && Math.abs(p.c - 1164) < 3 && Math.abs(q.c - 1165) < 3) console.log('SEP MOVED q=' + q.net + ' -> ' + nc);
          done = true; q.c = nc;
          }
          /* V11: 整步全被挡时最小推挤（缺多少推多少，p/q 均可） */
          if (!done) {
            const gap0 = Math.abs(q.c - p.c), need0 = MIN_CLEAR - gap0;
            if (need0 > 0.01 && need0 < MIN_CLEAR) {
              const tryMove = function (it, nc) {
                if (clashAt(nc)) return false;
                const a2 = it.w.pts[it.i], b2 = it.w.pts[it.i + 1];
                const oa2 = a2.slice(), ob2 = b2.slice();
                if (vert) { a2[0] = nc; b2[0] = nc; } else { a2[1] = nc; b2[1] = nc; }
                let bad2 = false;
                for (let z2 = 0; z2 < it.w.pts.length - 1; z2++) {
                  const u2 = it.w.pts[z2], v3 = it.w.pts[z2 + 1];
                  if (Math.abs(u2[0] - v3[0]) > 0.01 && Math.abs(u2[1] - v3[1]) > 0.01) { bad2 = true; break; }
                }
                if (!bad2) bad2 = ptsIntrude(design, it.w, it.w.pts, 'body');
                if (!bad2) bad2 = segsOf(it.w.pts).some(function (s2) {
                  return (hardBy[sheet] || []).some(function (r2) {
                    const n2 = netById(design, it.w.net);
                    if (n2 && (r2.id === n2.a.d || r2.id === n2.b.d)) return false;
                    return hitRect(s2, r2);
                  });
                });
                if (bad2) { it.w.pts[it.i] = oa2; it.w.pts[it.i + 1] = ob2; return false; }
                it.c = nc;
                return true;
              };
              if (tryMove(q, q.c + dir0 * need0)) done = true;
              else if (!p.fix && tryMove(p, p.c - dir0 * need0)) done = true;
              else if (p.fix) { /* 对称推挤需要 p 可动，跳过 */ }
              else {
                /* V11: 对称推挤——p/q 各让一半 */
                const h1 = Math.ceil(need0 / 2), h2 = need0 - h1;
                const a3 = q.w.pts[q.i], b3 = q.w.pts[q.i + 1], oa3 = a3.slice(), ob3 = b3.slice();
                const p3 = p.w.pts[p.i], q3b = p.w.pts[p.i + 1], op3 = p3.slice(), oq3 = q3b.slice();
                if (vert) { a3[0] += dir0 * h1; b3[0] += dir0 * h1; p3[0] -= dir0 * h2; q3b[0] -= dir0 * h2; }
                else { a3[1] += dir0 * h1; b3[1] += dir0 * h1; p3[1] -= dir0 * h2; q3b[1] -= dir0 * h2; }
                const orth3 = function (ww) { for (let z3 = 0; z3 < ww.pts.length - 1; z3++) { const u3 = ww.pts[z3], v4 = ww.pts[z3 + 1]; if (Math.abs(u3[0] - v4[0]) > 0.01 && Math.abs(u3[1] - v4[1]) > 0.01) return false; } return true; };
                let bad3 = !orth3(q.w) || !orth3(p.w);
                if (!bad3) bad3 = ptsIntrude(design, q.w, q.w.pts, 'body') || ptsIntrude(design, p.w, p.w.pts, 'body');
                if (!bad3) bad3 = segsOf(q.w.pts).concat(segsOf(p.w.pts)).some(function (s3) {
                  return (hardBy[sheet] || []).some(function (r3) {
                    const n3q = netById(design, q.w.net), n3p = netById(design, p.w.net);
                    if (n3q && (r3.id === n3q.a.d || r3.id === n3q.b.d)) return false;
                    if (n3p && (r3.id === n3p.a.d || r3.id === n3p.b.d)) return false;
                    return hitRect(s3, r3);
                  });
                });
                if (bad3) { q.w.pts[q.i] = oa3; q.w.pts[q.i + 1] = ob3; p.w.pts[p.i] = op3; p.w.pts[p.i + 1] = oq3; }
                else { done = true; q.c += dir0 * h1; p.c -= dir0 * h2; }
              }
            }
          }
          if (done) { moved++; }
        }
      });
      if (!moved) break;
    }
    return design;
  }

  /* V3-S3: 全局折弯消除——合并共线邻段 + 消冗余尖刺 */
  function defragmentWires(design) {
    if (!design.wires) return 0;
    var o2 = {};
    design.devices.forEach(function (d) {
      if (d.sym.isBus || d.sym.isXref || d.x == null) return;
      (o2[d.sheet] = o2[d.sheet] || []).push({ x: d.x, y: d.y, w: d.sym.w, h: d.sym.h });
    });
    var merged = 0;
    var free = function (sh, x1, y1, x2, y2) {
      var o = o2[sh] || []; for (var oi = 0; oi < o.length; oi++) { if (hitRect({ x1: x1, y1: y1, x2: x2, y2: y2 }, o[oi])) return false; } return true;
    };
    design.wires.forEach(function (w) {
      for (var i = w.pts.length - 2; i >= 1; i--) {
        var a = w.pts[i - 1], b = w.pts[i], c = w.pts[i + 1];
        if ((Math.abs(a[1] - b[1]) < 0.01 && Math.abs(b[1] - c[1]) < 0.01) ||
            (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(b[0] - c[0]) < 0.01)) {
          w.pts.splice(i, 1); merged++;
        }
      }
    });
    design.wires.forEach(function (w) {
      for (var i = 0; i + 3 < w.pts.length; i++) {
        var a = w.pts[i], b = w.pts[i + 1], c = w.pts[i + 2], d = w.pts[i + 3];
        if (Math.abs(a[1] - b[1]) < 0.01 && Math.abs(b[0] - c[0]) < 0.01 && Math.abs(c[1] - d[1]) < 0.01
            && Math.abs(c[1] - b[1]) < 6 * 2.5) {
          var my = Math.round((a[1] + c[1]) / 2), x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
          if (free(w.sheet, x0, my, x1, my) && free(w.sheet, c[0], my, d[0], my)) {
            w.pts.splice(i + 1, 2, [b[0], my], [c[0], my]); merged++;
          }
        }
        if (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(b[1] - c[1]) < 0.01 && Math.abs(c[0] - d[0]) < 0.01
            && Math.abs(c[0] - b[0]) < 6 * 2.5) {
          var mx = Math.round((a[0] + c[0]) / 2), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
          if (free(w.sheet, mx, y0, mx, y1) && free(w.sheet, mx, c[1], mx, d[1])) {
            w.pts.splice(i + 1, 2, [mx, b[1]], [mx, c[1]]); merged++;
          }
        }
      }
    });
    return merged;
  }

  /* ============================================================
   * 3. 交叉后处理：统一插半圆（竖线让横线，与绘制顺序无关）
   * ============================================================ */
  /* v2.25 audit-fix: detouch——异网角点/端点落在对方线内部=短路风险点，垂直挪开 */
  function detouch(design) {
    const pinSet = {};
    design.devices.forEach(function (dv) {
      (dv.sym.pins || []).forEach(function (p) {
        const q = pinAbs(dv, p);
        if (!q) return;
        pinSet[dv.id + ':' + Math.round(q.x) + ',' + Math.round(q.y)] = 1;
      });
    });
    for (let pass = 0; pass < 3; pass++) {
      const segs = [];
      design.wires.forEach(function (w) { segsOf(w.pts).forEach(function (s, i) { segs.push({ w: w, i: i, s: s }); }); });
      let moved = 0;
      for (let i = 0; i < segs.length && moved < 4; i++) {
        const A = segs[i]; if (!A.s.v) continue;
        for (let e = 0; e < 2; e++) {
          const p = e === 0 ? [A.s.x1, A.s.y1] : [A.s.x2, A.s.y2];
          const isPin = pinSet[A.w.id + ':' + Math.round(p[0]) + ',' + Math.round(p[1])];
          for (let j = 0; j < segs.length; j++) {
            const B = segs[j];
            if (B.w.id === A.w.id || B.w.net === A.w.net || B.w.sheet !== A.w.sheet) continue;
            if (Math.abs(B.s.y1 - B.s.y2) > 0.5) continue; /* B 须水平 */
            if (Math.abs(p[1] - B.s.y1) > 0.5) continue;
            if (p[0] <= Math.min(B.s.x1, B.s.x2) + 0.5 || p[0] >= Math.max(B.s.x1, B.s.x2) - 0.5) continue;
            if (isPin) { /* 引脚端点不动 → 挪对方横线（端点非引脚时） */
              const bpts = B.w.pts;
              const bEndsPin = bpts.some(function (q2) { return pinSet[B.w.id + ':' + Math.round(q2[0]) + ',' + Math.round(q2[1])]; });
              if (bEndsPin) continue;
              const dys2 = [6, -6, 12, -12];
              for (let k2 = 0; k2 < dys2.length; k2++) {
                const ny2 = B.s.y1 + dys2[k2];
                let ok2 = Math.abs(ny2 - p[1]) > 1.5;
                if (ok2) for (let j3 = 0; j3 < segs.length && ok2; j3++) {
                  const C3 = segs[j3];
                  if (C3.w.id === B.w.id || C3.w.net === B.w.net) continue;
                  if (Math.abs(C3.s.x1 - C3.s.x2) > 0.5) continue;
                  if (p[0] > Math.min(C3.s.x1, C3.s.x2) - 0.5 && p[0] < Math.max(C3.s.x1, C3.s.x2) + 0.5 && Math.abs(p[1] - Math.min(C3.s.y1, C3.s.y2)) < 0.5) ok2 = false;
                }
                if (!ok2) continue;
                const bSnap = bpts.map(function (zz) { return zz.slice(); });
                for (let q3 = 0; q3 < bpts.length; q3++) {
                  if (Math.abs(bpts[q3][1] - B.s.y1) < 0.5 && bpts[q3][0] >= Math.min(B.s.x1, B.s.x2) - 0.5 && bpts[q3][0] <= Math.max(B.s.x1, B.s.x2) + 0.5) bpts[q3][1] = ny2;
                }
                if (ptsIntrude(design, B.w, bpts)) { for (let q4 = 0; q4 < bpts.length; q4++) { bpts[q4][0] = bSnap[q4][0]; bpts[q4][1] = bSnap[q4][1]; } continue; }
                moved++;
                break;
              }
              if (moved) break;
            }
            /* 角点垂直挪动 dy */
            const dys = [6, -6, 12, -12, 18, -18];
            for (let k = 0; k < dys.length; k++) {
              const ny = p[1] + dys[k];
              let ok = Math.abs(ny - B.s.y1) > 1.5;
              if (ok) for (let j2 = 0; j2 < segs.length && ok; j2++) {
                const C2 = segs[j2];
                if (C2.w.id === A.w.id || C2.w.net === A.w.net) continue;
                if (Math.abs(C2.s.y1 - C2.s.y2) > 0.5) continue;
                if (Math.abs(ny - C2.s.y1) <= 1.5 && p[0] > Math.min(C2.s.x1, C2.s.x2) + 0.5 && p[0] < Math.max(C2.s.x1, C2.s.x2) - 0.5) ok = false;
              }
              if (!ok) continue;
              /* 应用：移动 A 线该端点（角点连带相邻段端点） */
              const pts = A.w.pts;
              const aSnap = pts.map(function (zz) { return zz.slice(); });
              for (let q = 0; q < pts.length; q++) {
                if (Math.abs(pts[q][0] - p[0]) < 0.5 && Math.abs(pts[q][1] - p[1]) < 0.5) pts[q][1] = ny;
              }
              if (ptsIntrude(design, A.w, pts)) { for (let q5 = 0; q5 < pts.length; q5++) { pts[q5][0] = aSnap[q5][0]; pts[q5][1] = aSnap[q5][1]; } continue; }
              moved++;
              break;
            }
            if (moved) break;
          }
          if (moved) break;
        }
      }
      if (!moved) break;
    }
    return design;
  }
  /* V9-REROUTE: 同网走线穿越自身母线轨 = 路由错误 → 删除穿越段，绕母线端部重新生成（幂等，带间隙搜索） */
  function fixBusThrough(design) {
    const busNets = {};
    design.devices.forEach(function (v) {
      if (!v.sym || !v.sym.isBus || v.x == null) return;
      const nets = {};
      (v.sym.pins || []).forEach(function (p) {
        const tx = v.x + p.x, ty = v.y + p.y;
        design.wires.forEach(function (w) {
          if (w.sheet !== v.sheet) return;
          const e0 = w.pts[0], e1 = w.pts[w.pts.length - 1];
          if ((Math.abs(e0[0] - tx) < 1 && Math.abs(e0[1] - ty) < 1) || (Math.abs(e1[0] - tx) < 1 && Math.abs(e1[1] - ty) < 1)) nets[w.net] = 1;
        });
      });
      busNets[v.id] = nets;
    });
    let fixed = 0;
    design.devices.forEach(function (v) {
      if (!v.sym || !v.sym.isBus || v.x == null) return;
      const rails = [];
      let topTip = 1e9, botTip = -1e9;
      (v.sym.pins || []).forEach(function (p) {
        const ty = v.y + p.y;
        if (p.d === 'S') { if (ty > botTip) botTip = ty; } else if (ty < topTip) topTip = ty;
      });
      (v.sym.draw || []).forEach(function (pr) {
        if (pr && pr[0] === 'L' && Math.abs(pr[1]) < 0.5 && Math.abs(pr[3] - v.sym.w) < 0.5 && Math.abs(pr[2] - pr[4]) < 0.5) rails.push(v.y + pr[2]);
      });
      if (!rails.length) return;
      const band0 = Math.min.apply(null, rails) - 1.5, band1 = Math.max.apply(null, rails) + 1.5;
      const x0 = v.x, x1 = v.x + v.sym.w;
      design.wires.forEach(function (w) {
        if (w.sheet !== v.sheet) return;
        if (!busNets[v.id] || !busNets[v.id][w.net]) return;
        for (let pass = 0; pass < 4; pass++) {
          let hit = -1;
          for (let i = 1; i < w.pts.length; i++) {
            const a = w.pts[i - 1], b = w.pts[i];
            if (!a || !b || Math.abs(a[0] - b[0]) > 0.5) continue;
            const x = a[0], y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
            if (x <= x0 + 1.5 || x >= x1 - 1.5) continue;
            if (y0 < band0 && y1 > band1) { hit = i; break; }
          }
          if (hit < 0) break;
          const a = w.pts[hit - 1], b = w.pts[hit];
          const x = a[0];
          /* 间隙搜索：横腿高度 × 端部偏移 */
          const hSegs = [], vSegs = [];
          design.wires.forEach(function (q) {
            if (q.id === w.id || q.sheet !== v.sheet) return;
            for (let i = 1; i < q.pts.length; i++) {
              const p0 = q.pts[i - 1], p1 = q.pts[i];
              if (!p0 || !p1) continue;
              if (Math.abs(p0[1] - p1[1]) < 0.5) hSegs.push({ y: p0[1], a: Math.min(p0[0], p1[0]), b: Math.max(p0[0], p1[0]) });
              else if (Math.abs(p0[0] - p1[0]) < 0.5) vSegs.push({ x: p0[0], a: Math.min(p0[1], p1[1]), b: Math.max(p0[1], p1[1]) });
            }
          });
          function ovx(s, xa, xb) { return Math.min(s.b, xb) - Math.max(s.a, xa) > 4; }
          function ovy(s, ya, yb) { return Math.min(s.b, yb) - Math.max(s.a, ya) > 4; }
          function hClear(y, xa, xb) { for (let i = 0; i < hSegs.length; i++) { if (Math.abs(hSegs[i].y - y) < 8 && ovx(hSegs[i], xa, xb)) return false; } return true; }
          function vClear(xv, ya, yb) { for (let i = 0; i < vSegs.length; i++) { if (Math.abs(vSegs[i].x - xv) < 8 && ovy(vSegs[i], ya, yb)) return false; } return true; }
          let plan = null;
          const offs = [18, 30, 42, 54, 66];
          const cands = [];
          for (let k = 1; k <= 8; k++) { cands.push(x0 - 12 * k - 12); cands.push(x1 + 12 * k + 12); }
          for (let ci = 0; ci < cands.length && !plan; ci++) {
            const xEnd = cands[ci];
            for (let u = 0; u < offs.length && !plan; u++) {
              const yU = topTip < 1e8 ? topTip - offs[u] : band0 - offs[u];
              for (let dn = 0; dn < offs.length && !plan; dn++) {
                const yD = botTip > -1e8 ? botTip + offs[dn] : band1 + offs[dn];
                const xa = Math.min(x, xEnd), xb = Math.max(x, xEnd);
                if (!hClear(yU, xa, xb)) continue;
                if (!hClear(yD, xa, xb)) continue;
                if (!vClear(xEnd, yU, yD)) continue;
                plan = { xEnd: xEnd, yU: yU, yD: yD };
              }
            }
          }
          if (!plan) plan = { xEnd: x1 + 108, yU: (topTip < 1e8 ? topTip : band0) - 78, yD: (botTip > -1e8 ? botTip : band1) + 78 };
          /* 腿高：端点已在安全侧则保持，否则收到安全腿 */
          const yL1 = a[1] < band0 ? (a[1] <= plan.yU + 0.5 ? a[1] : plan.yU) : (a[1] >= plan.yD - 0.5 ? a[1] : plan.yD);
          const yL2 = b[1] < band0 ? (b[1] <= plan.yU + 0.5 ? b[1] : plan.yU) : (b[1] >= plan.yD - 0.5 ? b[1] : plan.yD);
          const rep = [[x, a[1]], [x, yL1], [plan.xEnd, yL1], [plan.xEnd, yL2], [x, yL2], [x, b[1]]];
          const out = [];
          rep.forEach(function (q) {
            const l = out[out.length - 1];
            if (!l || Math.abs(l[0] - q[0]) > 0.01 || Math.abs(l[1] - q[1]) > 0.01) out.push(q);
          });
          w.pts.splice.apply(w.pts, [hit - 1, 2].concat(out));
          fixed++;
        }
      });
    });
    design.busReroute = (design.busReroute || 0) + fixed;
    return design;
  }
  function crossings(design) {
    /* V9-MERGE: 原位去除共线竖断点，使 T-split 穿越改由规则1命中（半圆落竖线，渲染层可画） */
    design.wires.forEach(function (w) {
      for (let i = 1; i < w.pts.length - 1; i++) {
        if (Math.abs(w.pts[i - 1][0] - w.pts[i][0]) < 0.5 && Math.abs(w.pts[i][0] - w.pts[i + 1][0]) < 0.5) { w.pts.splice(i, 1); i--; }
      }
    });
    const all = [];
    design.wires.forEach(function (w) {
      segsOf(w.pts).forEach(function (s, i) { all.push({ w: w.id, net: w.net, sheet: w.sheet, i: i, s: s }); });
    });
    const hops = [];
    const ends = {};
    design.wires.forEach(function (w) {
      [w.pts[0], w.pts[w.pts.length - 1]].forEach(function (p) {
        const k = w.sheet + ':' + Math.round(p[0]) + ',' + Math.round(p[1]);
        ends[k] = (ends[k] || 0) + 1;
      });
    });
    const has = function (sheet, x, y) { return hops.some(function (h) { return h.sheet === sheet && Math.abs(h.x - x) < 1 && Math.abs(h.y - y) < 1; }); };
    /* 规则1：竖线完整穿越横线内部 → 半圆在竖线（竖让横） */
    for (let i = 0; i < all.length; i++) {
      const A = all[i]; if (!A.s.v) continue;
      for (let j = 0; j < all.length; j++) {
        const B = all[j];
        if (B.s.v || A.sheet !== B.sheet || A.net === B.net) continue;
        const x = A.s.x1, y = B.s.y1;
        const ay0 = Math.min(A.s.y1, A.s.y2), ay1 = Math.max(A.s.y1, A.s.y2);
        const bx0 = Math.min(B.s.x1, B.s.x2), bx1 = Math.max(B.s.x1, B.s.x2);
        if (x <= bx0 + 1.5 || x >= bx1 - 1.5 || y <= ay0 + 1.5 || y >= ay1 - 1.5) continue;
        if (has(A.sheet, x, y)) continue;
        hops.push({ sheet: A.sheet, w: A.w, x: x, y: y });
      }
    }
    /* 规则2（v2.25）：竖线在交点被截断但同 x 共线延续（T-split 穿越）→ 半圆记横线（横让竖一次） */
    for (let i = 0; i < all.length; i++) {
      const A = all[i]; if (!A.s.v) continue;
      const x = A.s.x1;
      const ay0 = Math.min(A.s.y1, A.s.y2), ay1 = Math.max(A.s.y1, A.s.y2);
      for (let j = 0; j < all.length; j++) {
        const B = all[j];
        if (B.s.v || A.sheet !== B.sheet || A.net === B.net) continue;
        const y = B.s.y1;
        const bx0 = Math.min(B.s.x1, B.s.x2), bx1 = Math.max(B.s.x1, B.s.x2);
        if (x <= bx0 + 1.5 || x >= bx1 - 1.5) continue;
        const atEnd = (Math.abs(y - ay0) <= 1.5 || Math.abs(y - ay1) <= 1.5);
        if (!atEnd) continue;
        const cont = all.some(function (q) {
          if (q === A || q.w !== A.w || !q.s.v) return false;
          if (Math.abs(q.s.x1 - x) > 0.6) return false;
          const q0 = Math.min(q.s.y1, q.s.y2), q1 = Math.max(q.s.y1, q.s.y2);
          return (Math.abs(q0 - ay1) <= 0.6 && q1 > ay1) || (Math.abs(q1 - ay0) <= 0.6 && q0 < ay0);
        });
        if (!cont) continue;
        if (has(A.sheet, x, y)) continue;
        hops.push({ sheet: A.sheet, w: B.w, x: x, y: y, horiz: true });
      }
    }
    /* 规则3（V9-HOPBUS）：竖线完整穿越母线轨内部 → 半圆在竖线；与母线条同网穿越视为连接点跳过 */
    const busNets = {};
    design.devices.forEach(function (v) {
      if (!v.sym || !v.sym.isBus || v.x == null) return;
      const nets = {};
      (v.sym.pins || []).forEach(function (p) {
        const tx = v.x + p.x, ty = v.y + p.y;
        design.wires.forEach(function (w) {
          if (w.sheet !== v.sheet) return;
          const e0 = w.pts[0], e1 = w.pts[w.pts.length - 1];
          if ((Math.abs(e0[0] - tx) < 1 && Math.abs(e0[1] - ty) < 1) || (Math.abs(e1[0] - tx) < 1 && Math.abs(e1[1] - ty) < 1)) nets[w.net] = 1;
        });
      });
      busNets[v.id] = nets;
    });
    design.devices.forEach(function (v) {
      if (!v.sym || !v.sym.isBus || v.x == null) return;
      const x0 = v.x, x1 = v.x + v.sym.w;
      (v.sym.draw || []).forEach(function (pr) {
        if (!pr || pr[0] !== 'L') return;
        if (Math.abs(pr[1]) > 0.5 || Math.abs(pr[3] - v.sym.w) > 0.5) return;
        if (Math.abs(pr[2] - pr[4]) > 0.5) return;
        const y = v.y + pr[2];
        for (let i = 0; i < all.length; i++) {
          const A = all[i];
          if (!A.s.v || A.sheet !== v.sheet) continue;
          const x = A.s.x1;
          if (x <= x0 + 1.5 || x >= x1 - 1.5) continue;
          const ay0 = Math.min(A.s.y1, A.s.y2), ay1 = Math.max(A.s.y1, A.s.y2);
          if (y <= ay0 + 1.5 || y >= ay1 - 1.5) continue;
          if (busNets[v.id] && busNets[v.id][A.net]) {
            /* 同网：仅当交叉位于该母线某引脚列且本线端点落在该引脚尖端（真实 tap，轨上有接点）才豁免半圆 */
            let tapCol = false;
            (v.sym.pins || []).forEach(function (pp) {
              if (tapCol) return;
              if (Math.abs(v.x + pp.x - x) > 1.5) return;
              const tx = v.x + pp.x, ty = v.y + pp.y;
              const wObj = design.wires.filter(function (q) { return q.id === A.w; })[0];
              if (!wObj) return;
              const e0 = wObj.pts[0], e1 = wObj.pts[wObj.pts.length - 1];
              if ((Math.abs(e0[0] - tx) < 1 && Math.abs(e0[1] - ty) < 1) || (Math.abs(e1[0] - tx) < 1 && Math.abs(e1[1] - ty) < 1)) tapCol = true;
            });
            if (tapCol) continue;
          }
          if (has(v.sheet, x, y)) continue;
          hops.push({ sheet: v.sheet, w: A.w, x: x, y: y });
        }
      });
    });
    for (var jI = 0; jI < all.length; jI++) {
      var A3 = all[jI]; if (!A3.s.v) continue;
      for (var jJ = 0; jJ < all.length; jJ++) {
        var B3 = all[jJ];
        if (B3.s.v || A3.sheet !== B3.sheet || A3.net !== B3.net) continue;
        var x3 = A3.s.x1, y3 = B3.s.y1;
        if (x3 <= Math.min(B3.s.x1, B3.s.x2) + 1.5 || x3 >= Math.max(B3.s.x1, B3.s.x2) - 1.5) continue;
        if (y3 <= Math.min(A3.s.y1, A3.s.y2) + 1.5 || y3 >= Math.max(A3.s.y1, A3.s.y2) - 1.5) continue;
        ends[A3.sheet + ':' + Math.round(x3) + ',' + Math.round(y3)] = 2;
      }
    }
    const junc = [];
    Object.keys(ends).forEach(function (k) {
      if (ends[k] < 2) return;
      const parts = k.split(':'), xy = parts[1].split(',');
      junc.push({ sheet: +parts[0], x: +xy[0], y: +xy[1] });
    });
    /* V12b: 穿他网 pin 电点处也渲染跳线弧——明确“跨越不连接”语义（走廊容量不足无法改道时的诚实画法） */
    (function () {
      const pinQ = [];
      design.devices.forEach(function (v) {
        if (v.x == null) return;
        (v.sym.pins || []).forEach(function (pp) {
          const a = pinAbs(design.map, { d: v.id, p: pp.n });
          if (a) pinQ.push({ x: a.x, y: a.y, dev: v.id, sheet: v.sheet });
        });
      });
      design.wires.forEach(function (w) {
        const n = netById(design, w.net);
        segsOf(w.pts).forEach(function (s) {
          pinQ.forEach(function (q) {
            if (q.sheet !== w.sheet) return;
            if (n && (n.a.d === q.dev || n.b.d === q.dev)) return;
            const lo = Math.min, hi = Math.max;
            const on = s.v ? (Math.abs(s.x1 - q.x) < 0.6 && q.y > lo(s.y1, s.y2) + 0.01 && q.y < hi(s.y1, s.y2) - 0.01)
              : (Math.abs(s.y1 - q.y) < 0.6 && q.x > lo(s.x1, s.x2) + 0.01 && q.x < hi(s.x1, s.x2) - 0.01);
            if (!on || has(w.sheet, q.x, q.y)) return;
            hops.push({ sheet: w.sheet, w: w.id, x: q.x, y: q.y, horiz: !s.v });
          });
        });
      });
    })();
    /* Ensure every distinct-net perpendicular crossing has a hop owned by one
     * of the two wires. Legacy special cases above intentionally skip some
     * endpoint/near-end intersections; those still need explicit graphics. */
    crossingPairs(design).forEach(function (pair) {
      if (!pair.interior || pair.a.w.net === pair.b.w.net || sharedPinAt(design, pair.a, pair.b, pair.x, pair.y)) return;
      const pairHop = hops.some(function (h) {
        return h.sheet === pair.sheet && Math.abs(h.x - pair.x) < 1 && Math.abs(h.y - pair.y) < 1 && (h.w === pair.a.w.id || h.w === pair.b.w.id);
      });
      if (!pairHop) hops.push({ sheet: pair.sheet, w: pair.a.w.id, x: pair.x, y: pair.y, horiz: false });
    });
    /* A same-net perpendicular intersection is a real node, including a T
     * branch where one segment terminates on the middle of another. */
    crossingPairs(design).forEach(function (pair) {
      if (pair.a.w.net !== pair.b.w.net || sameWireAdjacentAt(pair)) return;
      if (!hasMarkerAt(junc, pair.sheet, pair.x, pair.y, 1)) junc.push({ sheet: pair.sheet, x: Math.round(pair.x), y: Math.round(pair.y) });
    });
    design.hops = hops; design.junctions = junc;
    return design;
  }
  function hubAlign(design, id) {
    const M = design.map, own = M[id];
    if (!own || own.x == null) return 0;
    const foll = design.devices.filter(function (d) { return d.attach && d.attach.d === id && d.x != null; });
    if (foll.length < 4) return 0;
    const bySide = {};
    foll.forEach(function (d) {
      const pn = pinOf(own, d.attach.p); if (!pn) return;
      (bySide[pn.d] = bySide[pn.d] || []).push({ d: d, pn: pn });
    });
    let cnt = 0;
    Object.keys(bySide).forEach(function (side) {
      const g = bySide[side].sort(function (a, b) { return (side === 'W' || side === 'E') ? (a.pn.y - b.pn.y) : (a.pn.x - b.pn.x); });
      const horiz = (side === 'W' || side === 'E');
      const fW = Math.max.apply(null, g.map(function (o) { return devDims(o.d).w; }));
      const fH = Math.max.apply(null, g.map(function (o) { return devDims(o.d).h; }));
      const dw = devDims(own);
      const colX = (side === 'W') ? (own.x - 60 - fW) : (side === 'E') ? (own.x + dw.w + 60) : null;
      const colY = (side === 'N') ? (own.y - 60 - fH) : (side === 'S') ? (own.y + dw.h + 60) : null;
      g.forEach(function (o) {
        const q = o.d.sym.pins[0];
        const dd = devDims(o.d);
        if (horiz) {
          const py = own.y + o.pn.y;
          let x = Math.max(8, colX);
          o.d.x = Math.round(x - q.x + (side === 'W' ? (fW - dd.w) : 0));
          o.d.y = Math.round(py - dd.h / 2 - q.y + dd.h / 2); /* 符号中心对齐引脚 */
          o.d.y = Math.round(py - q.y);
        } else {
          const px = own.x + o.pn.x;
          let y = Math.max(8, colY);
          o.d.x = Math.round(px - q.x);
          o.d.y = Math.round(y - q.y);
        }
        cnt++;
      });
    });
    return cnt;
  }
  /* v2.24: 删除并重走某器件全部连线（先对齐跟随符，再按引脚序重路由） */
  function rerouteDevice(design, id) {
    hubAlign(design, id);
    const moved = reroute(design, [id]);
    snapEnds(design); forceOrtho(design); crossings(design);
    return moved;
  }
  function reroute(design, devIds) {
    const set = {}; (devIds || []).forEach(function (d) { set[d] = 1; });
    const M = design.map;
    const obst = {}; design.sheets.forEach(function (s) { obst[s.no] = []; });
    design.devices.forEach(function (d) {
      if (d.sym.isBus || d.sym.isXref || d.x == null) return;
      (obst[d.sheet] || []).push(deviceKeepout(d));
    });
    const used = {}; design.sheets.forEach(function (s) { used[s.no] = newUsed(); });
    design.wires.forEach(function (w) {
      const n = netById(design, w.net);
      if (!n) return;
      const touch = set[n.a.d] || set[n.b.d];
      if (!touch && !w.dirty) { segsOf(w.pts).forEach(function (s) { addUsed(used[w.sheet], s); }); }
    });
    /* v2.24: 重路由对象按引脚坐标排序（消除交叉团） */
    const rrList = [];
    design.wires.forEach(function (w) {
      const n = netById(design, w.net);
      if (!n) return;
      if (!(set[n.a.d] || set[n.b.d])) return;
      if (w.manual) return;
      const devId = set[n.a.d] ? n.a.d : n.b.d;
      const dv = M[devId];
      const pn = dv ? pinOf(dv, devId === n.a.d ? n.a.p : n.b.p) : null;
      const key = pn ? ((pn.d === 'N' || pn.d === 'S') ? (dv.x + pn.x) / 10000 + 0 : (dv.y + pn.y)) : 0;
      rrList.push({ w: w, n: n, key: key });
    });
    rrList.sort(function (a, b) { return a.key - b.key; });
    rrList.forEach(function (item) {
      const w = item.w, n = item.n;
      const A = pinAbs(M, n.a), B = pinAbs(M, n.b);
      if (!A || !B) return;
      A.esc = M[n.a.d].sym.isXref ? 0 : ESC; B.esc = M[n.b.d].sym.isXref ? 0 : ESC;
      const pts = solve(A, B, obst[w.sheet], used[w.sheet], n.a.d, n.b.d, (design.soft || {})[w.sheet] || [], w.cls, !!(design.map[n.a.d].sym.noCross || design.map[n.b.d].sym.noCross), !!(design.params && design.params.family === 'mwess'));
      if (!pts || pts.length < 2) { n.err = 'ROUTE_NO_CLEAR_PATH'; return; }
      w.pts = pts;
      w.a = A; w.b = B;
      segsOf(w.pts).forEach(function (s) { addUsed(used[w.sheet], s); });
    });
    crossings(design);
    return design;
  }
  function netById(design, id) {
    if (!design._ni) { design._ni = {}; design.nets.forEach(function (n) { design._ni[n.id] = n; }); }
    return design._ni[id];
  }

  /* 拖动线段：dir='v' 改 x，'h' 改 y；同向邻线被挤推 */
  function dragSegmentCore(design, wireId, segIdx, newCoord) {
    const w = design.wires.filter(function (q) { return q.id === wireId; })[0];
    if (!w) return [];
    const pts = w.pts.map(function (p) { return p.slice(); });
    if (segIdx <= 0 || segIdx >= pts.length - 2) return [];   // 端部出线段不允许平移（必须留在引脚上）
    const a = pts[segIdx], b = pts[segIdx + 1];
    const vertical = Math.abs(a[0] - b[0]) < 0.01;
    const snap = Math.round(newCoord / SNAP) * SNAP;
    const from = vertical ? a[0] : a[1];
    if (vertical) { a[0] = snap; b[0] = snap; } else { a[1] = snap; b[1] = snap; }
    w.pts = pts; w.manual = true;
    const moved = [wireId];
    /* 挤推：同 sheet、同方向、区间重叠、间距 < MIN_CLEAR 的线段沿位移方向推开 */
    const dirSign = snap >= from ? 1 : -1;
    const lo = vertical ? Math.min(a[1], b[1]) : Math.min(a[0], b[0]);
    const hi = vertical ? Math.max(a[1], b[1]) : Math.max(a[0], b[0]);
    design.wires.forEach(function (o) {
      if (o.id === wireId || o.sheet !== w.sheet) return;
      const op = o.pts;
      let changed = false;
      for (let i = 1; i < op.length - 2; i++) {
        const c = op[i], d2 = op[i + 1];
        const ov = Math.abs(c[0] - d2[0]) < 0.01;
        if (ov !== vertical) continue;
        const oc = vertical ? c[0] : c[1];
        const olo = vertical ? Math.min(c[1], d2[1]) : Math.min(c[0], d2[0]);
        const ohi = vertical ? Math.max(c[1], d2[1]) : Math.max(c[0], d2[0]);
        if (ohi < lo || olo > hi) continue;
        if (Math.abs(oc - snap) >= MIN_CLEAR) continue;
        const nc = snap + dirSign * MIN_CLEAR;
        if (vertical) { c[0] = nc; d2[0] = nc; } else { c[1] = nc; d2[1] = nc; }
        changed = true;
      }
      if (changed) { o.manual = true; moved.push(o.id); }
    });
    crossings(design);
    return moved;
  }

  function dragSegment(design, wireId, segIdx, newCoord) {
    const snap = design.wires.map(function (w) { return { w: w, pts: w.pts.map(function (p) { return p.slice(); }), manual: w.manual }; });
    const snapHops = JSON.parse(JSON.stringify(design.hops || []));
    const snapJunc = JSON.parse(JSON.stringify(design.junctions || []));
    const moved = dragSegmentCore(design, wireId, segIdx, newCoord);
    if (!moved.length) return moved;
    const bad = moved.some(function (id) {
      const w = design.wires.filter(function (q) { return q.id === id; })[0];
      if (!w) return true;
      const sg = segsOf(w.pts);
      for (let i = 0; i < sg.length; i++) if (sg[i].x1 !== sg[i].x2 && sg[i].y1 !== sg[i].y2) return true;
      const n = netById(design, w.net);
      for (let di = 0; di < design.devices.length; di++) {
        const v = design.devices[di];
        if (v.sheet !== w.sheet || v.x == null || v.sym.isBus || v.sym.isXref || v.pwr) continue;
        const ko = deviceKeepout(v);
        for (let i = 0; i < sg.length; i++) {
          const own = n && (v.id === n.a.d || v.id === n.b.d);
          const stub = i === 0 || i === sg.length - 1;
          if (own && stub && !bodyHitRect(sg[i], ko.core)) continue;
          if (bodyHitRect(sg[i], ko)) return true;
        }
      }
      return false;
    });
    if (bad) {
      snap.forEach(function (s) { s.w.pts = s.pts; s.w.manual = s.manual; });
      design.hops = snapHops; design.junctions = snapJunc;
      return [];
    }
    return moved;
  }
  /* ============================================================
   * 5. 规则引擎：DRC + 图纸优劣评分
   * ============================================================ */
  const RUBRIC = [
    { id: 'A', name: '完整性（单元与必备器件）', weight: 22 },
    { id: 'B', name: '连接明确性（引脚级可追溯）', weight: 18 },
    { id: 'C', name: '制图规范（正交/跨越/间距/避让）', weight: 18 },
    { id: 'D', name: '可读性（分区/走线经济性）', weight: 10 },
    { id: 'E', name: '符号规范（IEC 60617 / GB 4728 画法）', weight: 8 },
    { id: 'F', name: '文档控制（图框/编号/签署/边界）', weight: 8 },
    { id: 'G', name: '功能安全检测单元（厂家对比库导出）', weight: 16 }
  ];

  function audit(design) {
    const M = design.map, p = design.params;
    const items = [];
    const add = (cat, id, title, ok, detail, level) => items.push({ cat: cat, id: id, title: title, ok: ok, detail: detail || '', level: level || (ok ? 'pass' : 'error') });
    const hasDev = (id) => !!M[id];
    const tagList = design.devices.map(function (d) { return d.id; });
    const mw = p.family === 'mwess';

    /* --- A 完整性 --- */
    add('A', 'A01', '交流进线具备隔离 / 断路 / 浪涌 / 剩余电流四要素', hasDev('QS1') && hasDev('QF1') && hasDev('FV1') && hasDev('RCM1'), 'QS1/QF1/FV1/RCM1');
    add('A', 'A02', '直流母线配置绝缘监测与电流采样', hasDev('RI1') && (mw ? hasDev('TA1') && hasDev('TA2') : hasDev('TA1')), mw ? 'RI1 + TA1/TA2 储能支路电流传感器' : 'RI1 + TA1');
    const meteringOK = mw ? hasDev('PJ1') && hasDev('PG1') && hasDev('PG2') : hasDev('PJ1') && hasDev('PJ2');
    add('A', 'A03', mw ? '交流计量 + 双枪直流电能计量' : '交流与直流双侧计量', meteringOK, mw ? 'PJ1 + PG1/PG2（逐枪串联电流计量）' : 'PJ1 + PJ2');
    add('A', 'A04', '母线泄放回路', hasDev('K0') && hasDev('RS0'), 'K0 + RS0');
    let gunOK = true, gunMiss = [];
    if (mw) {
      /* 兆瓦储能：每枪包含熔断、正负接触器、独立电子锁、枪体与充电控制器。 */
      for (let g = 1; g <= (p.gunCount || 1); g++) {
        ['FG' + g, 'KGP' + g, 'KGN' + g, 'XG' + g, 'CCU' + g, 'YL' + g].forEach(function (t) { if (!hasDev(t)) { gunOK = false; gunMiss.push(t); } });
      }
      add('A', 'A05', '每枪独立快熔 + 正/负极直流接触器 + 电子锁 + 连接器', gunOK, gunOK ? (p.gunCount || 1) + ' 把枪：FG/KGP/KGN/YL/XG/CCU 齐备' : '缺 ' + gunMiss.join(','));
    } else {
      for (let g = 1; g <= p.guns; g++) {
        const need = ['FU' + (g + 1), 'K' + g + 'P', 'K' + g + 'N', 'YV' + g, 'XS' + g];
        need.forEach(function (t) { if (!hasDev(t)) { gunOK = false; gunMiss.push(t); } });
      }
      add('A', 'A05', '每枪独立快熔 + 正/负极直流接触器 + 电子锁 + 连接器', gunOK, gunOK ? p.guns + ' 把枪全部齐备' : '缺 ' + gunMiss.join(','));
    }
    if (mw) {
      /* 兆瓦储能：每柜 = 2P 直流断路器 QFB + 主熔断 FU + 主正 KMP + 预充 KMR/RR（负极经 QFB 第 2 极分断） */
      let eOK = true, eMiss = [];
      for (let i = 1; i <= Math.max(1, p.essCab || 1); i++) {
        ['QFB' + i, 'FU' + i, 'KMP' + i, 'KMR' + i, 'RR' + i].forEach(function (t) { if (!hasDev(t)) { eOK = false; eMiss.push(t); } });
      }
      add('A', 'A06', '每柜熔断 + 主正/主负分断 + 预充单元', eOK, eOK ? 'QFB(2P ±)+FU+KMP / KMR+RR 预充' : '缺 ' + eMiss.join(','));
      add('A', 'A07', '储能经开关/变换受控并入母线，不直接搭接', hasDev('QFB1') && hasDev('FU1') && hasDev('KMP1') && (hasDev('KB11') || hasDev('KB12')), '柜内 QFB/FU/KMP 受控并入；AC/DC 经 KB 投切供电');
      add('A', 'A08', '储能 BMS 主控在图', hasDev('BCU1'), 'BCU1/BCU2 + BMU + 电池插箱（1P100S×4 串联）');
    } else if (p.ess) {
      let eOK = true, eMiss = [];
      for (let i = 1; i <= Math.max(1, p.essClusters); i++) ['FB' + i, 'KB' + i + 'P', 'KB' + i + 'N', 'KB' + i + 'R', 'RB' + i].forEach(function (t) { if (!hasDev(t)) { eOK = false; eMiss.push(t); } });
      add('A', 'A06', '每簇熔断 + 主正/主负接触器 + 预充单元', eOK, eOK ? '预充 = 接触器 + 电阻' : '缺 ' + eMiss.join(','));
      add('A', 'A07', '储能经变换设备并入，不直接搭接充电母线', hasDev('M9'), p.coupling === 'dc' ? '双向 DC/DC' : 'PCS 交流耦合');
      add('A', 'A08', '电池管理主控在图', hasDev('A5'), 'A5 BAMS');
    }
    const RAILS6 = (window.EVSE_CORE.rails ? window.EVSE_CORE.rails() : {});
    const auxWired = function (id, pn) { return design.nets.some(function (n) { return (n.a.d === id && n.a.p === pn) || (n.b.d === id && n.b.p === pn); }); };
    const auxOK = mw
      ? hasDev('T1') && hasDev('T2') && ['V+', 'V-'].every(function (pn) { return auxWired('T1', pn) && auxWired('T2', pn); })
      : hasDev('T1') && hasDev('T2') && Object.keys(RAILS6).length >= 4;
    add('A', 'A09', mw ? '控制辅源与主回路辅源分列接线' : '辅助电源 24V / 12V 双档且全局轨分列', auxOK, mw ? 'T1 控制24V / T2 主回路24V，正负端均已接线' : 'T1/T2+全局轨 ' + Object.keys(RAILS6).join('/'));
    add('A', 'A10', '急停硬线联锁 + 门禁 + 安全继电器', hasDev('SB1') && hasDev('SQ1') && (!mw || (hasDev('SR1') && hasDev('WBSAFE1') && hasDev('WBSAFE2'))), mw ? 'SB1/SQ1→SR1→充电与储能安全使能' : 'SB1/SQ1');
    add('A', 'A11', '热管理单元在图', hasDev('MF1'), 'MF1 风机');
    add('A', 'A12', '保护接地排与等电位', hasDev('PE1'), 'PE1');

    /* --- B 连接明确性 --- */
    const conn = {};
    design.nets.forEach(function (n) {
      conn[n.a.d + '/' + n.a.p] = (conn[n.a.d + '/' + n.a.p] || 0) + 1;
      conn[n.b.d + '/' + n.b.p] = (conn[n.b.d + '/' + n.b.p] || 0) + 1;
    });
    const float_ = [];
    design.devices.forEach(function (d) {
      if (d.sym.isBus) return; /* v2.0.4: 母排 tap 即轨节点 */
      d.sym.pins.forEach(function (q) {
        if (q.n === '' || q.n == null) return;
        if (!conn[d.id + '/' + q.n]) float_.push(d.id + ':' + (q.name || q.n));
      });
    });
    add('B', 'B01', '无悬空引脚（每个端子都有归属网络）', float_.length === 0, float_.length ? float_.length + ' 个未接：' + float_.slice(0, 14).join('、') + (float_.length > 14 ? ' …' : '') : '全部端子已接线', float_.length ? 'warn' : 'pass');
    const badPin = design.nets.filter(function (n) { return n.err; });
    add('B', 'B02', '每条网络两端均落在具名物理端子上', badPin.length === 0, badPin.length ? badPin.length + ' 条网络端子未解析' : design.nets.length + ' 条网络全部 pin→pin 可追溯');
    const shared = {};
    design.nets.forEach(function (n) { if (n.cls === 'CTL' || n.cls === 'COMM' || n.cls === 'SAF') { const k = n.a.d + '/' + n.a.p; shared[k] = (shared[k] || 0) + 1; } });
    const busSig = Object.keys(shared).filter(function (k) { return shared[k] > 2 && k.indexOf('WB') !== 0 && k.indexOf('XR') !== 0; }); /* V4-BUS3: 跨页符汇聚点豁免 */
    add('B', 'B03', '信号回路点对点（不共用干线）', busSig.length === 0, busSig.length ? '疑似共享节点：' + busSig.join('、') : '控制/通信/安全回路均为点对点', busSig.length ? 'warn' : 'pass');
    const xpair = {};
    design.nets.forEach(function (n) { if (n.xpair) xpair[n.xpair] = (xpair[n.xpair] || 0) + 1; });
    const brokenX = Object.keys(xpair).filter(function (k) { return xpair[k] !== 2 && k.indexOf('XPBUS') !== 0; }); /* V4-BUS3: 总线合并网豁免成对 */
    add('B', 'B04', '跨页信号成对连接符闭合（→页/器件:引脚）', brokenX.length === 0, Object.keys(xpair).length + ' 组跨页信号，标注含目标页/器件/引脚');

    /* ERC 只消费显式声明的 pin.ercType；旧 t=in/out 是符号方向，不等于驱动能力。 */
    const ERC_TYPES = (window.EVSE_CORE && window.EVSE_CORE.ERC_PIN_TYPES) || ['unclassified', 'passive', 'input', 'output', 'bidirectional', 'power_input', 'power_output', 'power_bidirectional', 'no_connect'];
    const isElectricalDevice = function (d) { return !!d && !d.xref && !d.pwr && !(d.sym && d.sym.isXref); };
    const pinMeta = function (ep) {
      const d = M[ep.d];
      const q = d && d.sym && (d.sym.pins || []).filter(function (x) { return String(x.n) === String(ep.p); })[0];
      const type = q && ERC_TYPES.indexOf(q.ercType) > 0 ? q.ercType : 'unclassified';
      return { d: d, q: q, type: type, key: ep.d + ':' + ep.p };
    };
    const ercErrors = [], driversByNet = {}, noConnect = [];
    let typedPins = 0, unknownPins = 0, ercPins = 0;
    design.devices.filter(isElectricalDevice).forEach(function (d) { (d.sym.pins || []).forEach(function (q) {
      ercPins++;
      if (ERC_TYPES.indexOf(q.ercType) > 0 && q.ercType !== 'unclassified') typedPins++; else unknownPins++;
    }); });
    design.nets.forEach(function (n) {
      const a = pinMeta(n.a), b = pinMeta(n.b), key = String(n.cls || '') + '|' + String(n.name || n.id);
      [a, b].forEach(function (m) {
        if (m.type === 'power_output' || m.type === 'output') {
          const list = driversByNet[key] || (driversByNet[key] = []);
          if (list.indexOf(m.key) < 0) list.push(m.key);
        }
        if (m.type === 'no_connect') noConnect.push(m.key + ' (' + (n.name || n.id) + ')');
      });
      if ((a.type === 'output' || a.type === 'power_output') && (b.type === 'output' || b.type === 'power_output')) {
        ercErrors.push('多驱动：' + a.key + ' ↔ ' + b.key + '（' + (n.name || n.id) + '）');
      }
    });
    Object.keys(driversByNet).forEach(function (k) {
      if (driversByNet[k].length > 1) ercErrors.push('同一逻辑网络存在多个输出驱动：' + driversByNet[k].join(' / ') + '（' + k.split('|').slice(1).join('|') + '）');
    });
    noConnect.forEach(function (x) { ercErrors.push('NC 引脚仍接入网络：' + x); });
    add('B', 'B05', '显式引脚类型 ERC（多驱动 / NC 接线）', ercErrors.length ? false : (typedPins ? true : null),
      ercErrors.length ? ercErrors.slice(0, 8).join('；') + (ercErrors.length > 8 ? ' …' : '')
        : (typedPins ? '已声明类型 ' + typedPins + '/' + ercPins + ' 个引脚；未声明 ' + unknownPins + ' 个保持 unknown，旧 in/out 未用于推断 ERC' : ercPins + ' 个引脚均未声明 ERC 类型，结果为 unknown'),
      ercErrors.length ? 'error' : (typedPins ? 'pass' : 'info'));

    const ratingErrors = [], ratingUnknown = [], ratingAssumed = [];
    let ratingVerified = 0;
    const SOURCE = window.EVSE_SOURCE;
    const ratingDevices = design.devices.filter(isElectricalDevice);
    ratingDevices.forEach(function (d) {
      const e = d.electrical || { status: 'unknown', ratings: {} };
      const ratings = e.ratings && typeof e.ratings === 'object' ? e.ratings : {};
      const hasRatings = Object.keys(ratings).length > 0;
      if (e.status === 'verified') {
        ratingVerified++;
        const src = SOURCE && e.sourceId && SOURCE.byId(e.sourceId);
        if (!src || src.status !== 'verified') ratingErrors.push(d.id + ': 已核验声明缺少状态为 verified 的来源记录');
        else {
          const sourceRevision = src.version || src.sha256 || src.file;
          if (!sourceRevision || !e.sourceRevision || e.sourceRevision !== sourceRevision) ratingErrors.push(d.id + ': 来源修订/文件标识未绑定或不一致');
        }
        if (!e.manufacturer || !e.model) ratingErrors.push(d.id + ': 已核验额定值未绑定制造商和型号');
        if (!hasRatings) ratingErrors.push(d.id + ': verified 但没有结构化额定参数');
        Object.keys(ratings).forEach(function (k) {
          const r = ratings[k], value = r && typeof r === 'object' ? Number(r.value) : NaN;
          const unit = r && typeof r === 'object' ? String(r.unit || '') : '';
          if (!Number.isFinite(value) || value <= 0 || !unit) ratingErrors.push(d.id + ': 额定参数 ' + k + ' 数值/单位无效');
        });
      } else if (e.status === 'assumption' && hasRatings) ratingAssumed.push(d.id);
      else ratingUnknown.push(d.id);
    });
    add('B', 'B06', '器件额定值与来源证据绑定', ratingErrors.length ? false : (ratingUnknown.length || ratingAssumed.length ? null : true),
      ratingErrors.length ? ratingErrors.slice(0, 8).join('；') + (ratingErrors.length > 8 ? ' …' : '')
        : ('真实器件 ' + ratingDevices.length + ' 个；来源核验 ' + ratingVerified + ' 个；假设 ' + ratingAssumed.length + ' 个；未知 ' + ratingUnknown.length + ' 个。假设和未知均不表示满足选型要求'),
      ratingErrors.length ? 'error' : (ratingUnknown.length || ratingAssumed.length ? 'info' : 'pass'));
    const domainMismatch = [];
    const powerDomain = function (ep) {
      const d = M[ep.d], q = d && d.sym && (d.sym.pins || []).filter(function (x) { return String(x.n) === String(ep.p); })[0];
      return q && q.k ? String(q.k).toUpperCase() : '';
    };
    design.nets.forEach(function (n) {
      const da = M[n.a.d], db = M[n.b.d];
      if (!da || !db || da.xref || db.xref || da.sym.isXref || db.sym.isXref || da.pwr || db.pwr) return;
      const ka = powerDomain(n.a), kb = powerDomain(n.b);
      const isACDC = (ka === 'AC' && (kb === 'DC' || kb === 'ESS')) || (kb === 'AC' && (ka === 'DC' || ka === 'ESS'));
      const cls = String(n.cls || '').toUpperCase();
      const classConflict = (cls === 'AC' && (ka === 'DC' || ka === 'ESS' || kb === 'DC' || kb === 'ESS')) ||
        ((cls === 'DC' || cls === 'ESS') && (ka === 'AC' || kb === 'AC'));
      if (isACDC || classConflict) domainMismatch.push((n.name || n.id) + ': ' + n.a.d + '/' + ka + ' ↔ ' + n.b.d + '/' + kb + '（网类 ' + cls + '）');
    });
    add('B', 'B07', '交流与直流高压域不直接跨接', domainMismatch.length === 0,
      domainMismatch.length ? domainMismatch.slice(0, 10).join('；') + (domainMismatch.length > 10 ? ' …' : '') : '未发现明确 AC↔DC/ESS 直接跨接；变换器隔离/耐压仍需额定值与资料核验', domainMismatch.length ? 'warn' : 'info');

    /* --- C 制图规范 --- */
    let nonOrtho = 0, thruDev = 0, offGrid = 0, segCount = 0, totalLen = 0, bends = 0;
    const obst = design.devices.filter(function (d) { return !d.sym.isBus && !d.sym.isXref && !d.pwr && d.x != null; })
      .map(function (d) { return deviceKeepout(d); });
    design.wires.forEach(function (w) {
      const sg = segsOf(w.pts); segCount += sg.length; bends += Math.max(0, w.pts.length - 2);
      sg.forEach(function (s) {
        totalLen += Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1);
        if (Math.abs(s.x1 - s.x2) > 0.01 && Math.abs(s.y1 - s.y2) > 0.01) nonOrtho++;
        if (Math.abs(s.x1 % 1) > 0.01 || Math.abs(s.y1 % 1) > 0.01) offGrid++;
        obst.forEach(function (r) {
          if (r.sheet !== w.sheet) return;
          if (bodyHitRect(s, r.core)) thruDev++;
        });
      });
    });
    add('C', 'C01', '全部走线正交（无斜线）', nonOrtho === 0, nonOrtho ? nonOrtho + ' 段非正交' : segCount + ' 段全部水平/垂直');
    add('C', 'C02', '走线不穿越器件本体（含自身端子）', thruDev === 0, thruDev ? thruDev + ' 段穿越器件（需人工挤线或改布局）' : '0 段穿越', thruDev ? 'error' : 'pass');
    const crossingAudit = auditCrossings(design);
    const hopExamples = crossingAudit.missingHops.slice(0, 5).map(function (x) { return (x.interior ? '交叉' : '端点接触') + ' ' + x.a.w.id + '/' + x.b.w.id + '@' + Math.round(x.x) + ',' + Math.round(x.y); });
    add('C', 'C03', '异网交叉须有跨越；端点接触必须分离', crossingAudit.missingHops.length === 0,
      crossingAudit.missingHops.length ? crossingAudit.missingHops.length + ' 处交叉/端点接触需处理：' + hopExamples.join('、') : crossingAudit.distinctNetCrossings + ' 处异网交叉均有对应跨越标记', crossingAudit.missingHops.length ? 'error' : 'pass');
    const juncExamples = crossingAudit.missingJunctions.slice(0, 5).map(function (x) { return Math.round(x.x) + ',' + Math.round(x.y); });
    add('C', 'C04', '真实连接点画实心结点', crossingAudit.missingJunctions.length === 0,
      crossingAudit.missingJunctions.length ? crossingAudit.missingJunctions.length + ' 处连接缺少结点：' + juncExamples.join('、') : design.junctions.length + ' 个结点；检测到的连接点均已标记', crossingAudit.missingJunctions.length ? 'error' : 'pass');
    let tight = 0;
    const c05pairs = []; /* V11: 供 fixC05 使用的配对清单 */
    const bySheet = {};
    design.wires.forEach(function (w) { (bySheet[w.sheet] = bySheet[w.sheet] || []).push(w); });
    Object.keys(bySheet).forEach(function (sh) {
      const arr = [];
      bySheet[sh].forEach(function (w) { segsOf(w.pts).forEach(function (s) { arr.push({ s: s, net: w.net, w: w }); }); });
      /* V4-C05EX2: 同节点汇接共线豁免（E1 同名总线 / E2 共享引脚 / E3 器件引脚步段 / E4 母线邻域） */
      const netByIdX = {};
      design.nets.forEach(function (nn) { netByIdX[nn.id] = nn; });
      const pinKeyX = function (ep) { return ep.d + ':' + ep.p; };
      const isBusX = function (dname) { const q = design.devices.filter(function (z) { return z.id === dname; })[0]; return q && q.sym.isBus; };
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
        if (arr[i].net === arr[j].net) continue;
        const a = arr[i].s, b = arr[j].s;
        if (a.v !== b.v) continue;
        let overl = false;
        if (a.v) { if (Math.abs(a.x1 - b.x1) < MIN_CLEAR - 0.5 && Math.max(a.y1, a.y2) > Math.min(b.y1, b.y2) + 3 && Math.min(a.y1, a.y2) < Math.max(b.y1, b.y2) - 3) overl = true; }
        else { if (Math.abs(a.y1 - b.y1) < MIN_CLEAR - 0.5 && Math.max(a.x1, a.x2) > Math.min(b.x1, b.x2) + 3 && Math.min(a.x1, a.x2) < Math.max(b.x1, b.x2) - 3) overl = true; }
        if (!overl) continue;
        const na = netByIdX[arr[i].net], nb = netByIdX[arr[j].net];
        /* E1: 同名网络（总线汇聚多源共享同名网） */
        if (na && nb && na.name === nb.name) continue;
        /* 端点引脚集合 */
        const pa = na ? [pinKeyX(na.a), pinKeyX(na.b)] : [], pb = nb ? [pinKeyX(nb.a), pinKeyX(nb.b)] : [];
        /* E2: 共享同一物理引脚（同节点多线汇接，如接触器主触点进线侧熔断+检测） */
        let sharePin = false;
        for (let u = 0; u < pa.length && !sharePin; u++) for (let v = 0; v < pb.length; v++) if (pa[u] === pb[v]) { sharePin = true; break; }
        if (sharePin) continue;
        /* E3: 各自为同一器件的引脚步段（器件内部汇接，如接触器上下主触点引出段） */
        let e3 = false;
        if (na && nb) {
          const da = [na.a.d, na.b.d], db = [nb.a.d, nb.b.d];
          for (let u = 0; u < da.length && !e3; u++) for (let v = 0; v < db.length; v++) if (da[u] === db[v]) { e3 = true; break; }
        }
        if (e3) continue;
        /* E4: 任一端接入母线引脚（WBx）且重叠长度 ≤ 24（母线 tap 邻域汇接） */
        let e4 = false;
        if (na && nb) {
          const touchBus = function (ep) { return isBusX(ep.d); };
          if ((touchBus(na.a) || touchBus(na.b) || touchBus(nb.a) || touchBus(nb.b))) {
            const ovl = a.v ? (Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) - Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2))) : (Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) - Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2)));
            if (ovl <= 24) e4 = true;
          }
        }
        if (e4) continue;
        tight++;
        c05pairs.push({ a: arr[i], b: arr[j] });
      }
    });
    design._c05pairs = c05pairs;
    add('C', 'C05', '平行走线间距 ≥ ' + MIN_CLEAR + '（含共线重叠）', tight === 0, tight ? tight + ' 对过近/重叠' : '通道分轨全部满足', tight ? 'error' : 'pass');
    add('C', 'C06', '走线端点落在栅格上', offGrid === 0, offGrid ? offGrid + ' 处不在整数栅格' : '全部对齐', offGrid ? 'warn' : 'pass');
    /* C10 走线端点必须终结在它所属网络的真实引脚上（实时校验，不用布线快照） */
    let endOff = 0; const endEx = [];
    design.wires.forEach(function (w) {
      const n = netById(design, w.net); if (!n) return;
      const A = pinAbs(design.map, n.a), B = pinAbs(design.map, n.b);
      const L = w.pts.length;
      if (A && (Math.abs(w.pts[0][0] - A.x) > 1.2 || Math.abs(w.pts[0][1] - A.y) > 1.2)) { endOff++; if (endEx.length < 6) endEx.push(n.a.d + ':' + n.a.p); }
      if (B && (Math.abs(w.pts[L - 1][0] - B.x) > 1.2 || Math.abs(w.pts[L - 1][1] - B.y) > 1.2)) { endOff++; if (endEx.length < 6) endEx.push(n.b.d + ':' + n.b.p); }
    });
    /* C11：和路由/挤线共用首末 pin 外引段判定。端子处在符号边沿时，
     * 引线会经过器件外框外扩 6px 的净空带；只要该段从当前 pin 沿轴向向外，
     * 且 C02 已确认没有穿过器件本体，就不应误报为禁布区冲突。 */
    let inBody = 0;
    design.wires.forEach(function (w) {
      const sgx = segsOf(w.pts);
      let badW = false;
      design.devices.forEach(function (v) {
        if (badW || v.sheet !== w.sheet || v.x == null || v.sym.isBus || v.sym.isXref || v.pwr) return;
        const dm = devDims(v);
        const ir = { x: v.x - 6, y: v.y - 6, w: dm.w + 12, h: dm.h + 12 }; /* 外框外扩 6px 净空区 */
        if (ir.w <= 0 || ir.h <= 0) return;
        for (let i = 0; i < sgx.length && !badW; i++) {
          const s = sgx[i];
          if (leadStubSegW(w, s, i, sgx.length, design)) continue;
          if (bodyHitRect(s, ir)) badW = true;
        }
      });
      if (badW) inBody++;
    });
    add('C', 'C11', '走线避开器件外框外扩 6px 净空区（端子外引段除外）', inBody === 0, inBody ? inBody + ' 条线进入器件外框外扩 6px 净空区（非器件本体穿越）' : '端子外引段豁免后均满足 6px 净空', inBody ? 'error' : 'pass');
    let pinHit = 0;
    design.wires.forEach(function (w) {
      const sg = segsOf(w.pts), n = netById(design, w.net);
      design.devices.forEach(function (v) {
        if (v.sheet !== w.sheet || v.x == null || v.sym.isBus || v.sym.isXref || v.pwr) return;
        const ko = deviceKeepout(v);
        for (let i = 0; i < sg.length; i++) {
          const own = n && (v.id === n.a.d || v.id === n.b.d);
          const stub = i === 0 || i === sg.length - 1;
          if (own && stub && !bodyHitRect(sg[i], ko.core)) continue;
          if (!bodyHitRect(sg[i], ko.core) && bodyHitRect(sg[i], ko)) { pinHit++; break; }
        }
      });
    });
    add('C', 'C12', '走线不穿越元器件管脚延伸区', pinHit === 0, pinHit ? pinHit + ' 条线穿越管脚延伸区（禁止区已扩展到引脚外沿）' : '0 条线穿越管脚延伸区', pinHit ? 'error' : 'pass');
    let dashHit = 0;
    design.wires.forEach(function (w) {
      const sg = segsOf(w.pts), n = netById(design, w.net);
      design.devices.forEach(function (v) {
        if (v.sheet !== w.sheet || v.x == null || v.sym.isBus || v.sym.isXref || v.pwr) return;
        const db = dashedBand(v);
        for (let i = 0; i < sg.length; i++) {
          const own = n && (v.id === n.a.d || v.id === n.b.d);
          const stub = i === 0 || i === sg.length - 1;
          if (own && stub && !bodyHitRect(sg[i], db.core)) continue;
          if (!bodyHitRect(sg[i], db.core) && bodyHitRect(sg[i], db)) { dashHit++; break; }
        }
      });
    });
    add('C', 'C13', '走线不进入器件虚线禁布框（本体外扩 8px）', dashHit === 0, dashHit ? dashHit + ' 条线进入虚线禁布框' : '0 条线进入虚线禁布框', dashHit ? 'error' : 'pass');    const ctrack = {};
    design.wires.forEach(function (w) {
      segsOf(w.pts).forEach(function (s) {
        const axis = s.v ? 'V' : 'H', coord = s.v ? s.x1 : s.y1;
        const key = w.sheet + '|' + axis + '|' + Math.round(coord * 2);
        (ctrack[key] = ctrack[key] || []).push({ w: w, s: s, axis: axis, coord: coord });
      });
    });
    const coincident = {};
    const coincidentEx = [];
    Object.keys(ctrack).forEach(function (key) {
      const group = ctrack[key];
      for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        if (a.w === b.w || a.w.net === b.w.net || Math.abs(a.coord - b.coord) > 0.5) continue;
        const na = netById(design, a.w.net), nb = netById(design, b.w.net);
        const pk = function (r) { return r ? r.d + ':' + r.p : ''; };
        if (na && nb && (pk(na.a) === pk(nb.a) || pk(na.a) === pk(nb.b) || pk(na.b) === pk(nb.a) || pk(na.b) === pk(nb.b))) continue;
        const ol = a.s.v
          ? Math.min(Math.max(a.s.y1, a.s.y2), Math.max(b.s.y1, b.s.y2)) - Math.max(Math.min(a.s.y1, a.s.y2), Math.min(b.s.y1, b.s.y2))
          : Math.min(Math.max(a.s.x1, a.s.x2), Math.max(b.s.x1, b.s.x2)) - Math.max(Math.min(a.s.x1, a.s.x2), Math.min(b.s.x1, b.s.x2));
        if (ol <= 0.01) continue;
        const ids = [a.w.id, b.w.id].sort();
        const k2 = ids.join('|') + '|' + key;
        if (coincident[k2]) continue;
        coincident[k2] = 1;
        if (coincidentEx.length < 8) coincidentEx.push(ids.join('/') + ' (' + a.axis + ' @ ' + Math.round(a.coord) + ')');
      }
    });
    const coincidentCount = Object.keys(coincident).length;
    add('C', 'C14', '不同走线不得共线重叠', coincidentCount === 0, coincidentCount ? coincidentCount + ' 组共线重叠：' + coincidentEx.join('、') : '未发现共线重叠', coincidentCount ? 'error' : 'pass');    add('C', 'C10', '走线端点终结在真实物理端子上', endOff === 0,
      endOff ? endOff + ' 处脉线脱离引脚：' + endEx.join('、') : design.wires.length * 2 + ' 个端点全部钉在端子上');
    /* LIB-R20 禁止重叠堆积：器件本体 / 跨页符 / 标注文字带互不重叠 */
    const bx = (design.boxes || []).filter(function (b) { return b.kind !== 'corridor'; }); /* V6-GCORR: 走廊不参与重叠审计 */
    let ovl = 0; const ovlList = [];
    for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) {
      if (bx[i].sheet !== bx[j].sheet) continue;
      if (bx[i].kind === bx[j].kind && bx[i].id === bx[j].id) continue;
      if (!overlap(bx[i], bx[j])) continue;
      ovl++; if (ovlList.length < 8) ovlList.push(bx[i].id + '(' + bx[i].kind + ')×' + bx[j].id + '(' + bx[j].kind + ')');
    }
    add('C', 'C07', '器件框 / 跨页符 / 标注文字互不重叠堆积（含器件与自身标注）', ovl === 0, ovl ? ovl + ' 处重叠：' + ovlList.join('、') : bx.length + ' 个占位框全部分离');
    /* C09 符号内部文字不重叠：标题 / 副标题 / 内部注释 / 引脚名逐对校验 */
    let inOvl = 0; const inList = [];
    design.devices.forEach(function (d) {
      const tb = textBands(d);
      for (let i = 0; i < tb.length; i++) for (let j = i + 1; j < tb.length; j++) {
        if (!overlap(tb[i], tb[j])) continue;
        inOvl++;
        if (inList.length < 8) inList.push(d.tag + '：「' + tb[i].s + '」×「' + tb[j].s + '」');
      }
    });
    add('C', 'C09', '符号内部文字（标题/副标题/引脚名/注释）不重叠', inOvl === 0,
      inOvl ? inOvl + ' 处重叠：' + inList.join('；') : design.devices.length + ' 个符号内部文字全部分离');
    let txtHit = 0;
    design.wires.forEach(function (w) {
      segsOf(w.pts).forEach(function (s) {
        (design.boxes || []).forEach(function (b) {
          if (b.kind !== 'label' && b.kind !== 'xref') return;
          if (b.sheet !== w.sheet) return;
          const n = netById(design, w.net);
          if (n && (b.id === n.a.d || b.id === n.b.d)) return;
          if (bodyHitRect(s, { x: b.x, y: b.y, w: b.w, h: b.h })) txtHit++; /* V5-C08: 真实本体判定 */
        });
      });
    });
    add('C', 'C08', '走线不压标注文字与跨页符', txtHit === 0, txtHit ? txtHit + ' 段压住文字（需挤线或移动文字）' : '0 段', txtHit ? 'warn' : 'pass');

    /* --- D 可读性 --- */
    const avgBend = design.wires.length ? bends / design.wires.length : 0;
    add('D', 'D01', '平均拐点数 ≤ 4（原理图审美：短直、少拐）', avgBend <= 4, '平均 ' + avgBend.toFixed(2) + ' 个拐点 / 条', avgBend <= 4 ? 'pass' : 'warn');
    add('D', 'D02', '按功能分区且分页（一次 / 二次分离）', design.sheets.length >= 2, design.sheets.length + ' 页：' + design.sheets.map(function (s) { return s.no + '.' + s.title.split('·')[0].trim(); }).join(' / '));
    add('D', 'D03', '母排分相绘制（L1/L2/L3/N、DC+/DC- 独立成线）', null, '当前规则尚未从实际网络/母排几何验证分相；需工程复核', 'info');
    add('D', 'D04', '走线总长受控', totalLen > 0, '合计 ' + Math.round(totalLen / 100) / 10 + 'k 单位，' + segCount + ' 段');

    /* --- E 符号规范 --- */
    add('E', 'E01', '开关符号功能画法符合适用标准', null, '符号外形当前未与受控标准符号编号及版本逐项比对', 'info');
    add('E', 'E02', '变换器符号画法符合适用标准', null, '符号外形当前未与受控标准符号编号及版本逐项比对', 'info');
    add('E', 'E03', '保护/接地/负载符号画法符合适用标准', null, '符号外形当前未与受控标准符号编号及版本逐项比对', 'info');
    add('E', 'E04', '符号来自具有来源与修订记录的受控库', null, '当前符号实例 ' + design.devices.length + ' 个；库来源/修订完整性尚未自动检查', 'info');
    add('E', 'E05', '符号库标准符合性需专业复核（不自动声明合规）', null, '状态：REFERENCE_ONLY — SYMBOL_LIBRARY_TO_BE_VERIFIED', 'info');

    /* --- F 文档控制 --- */
    add('F', 'F01', '图框 / 图号 / 修订 / 状态 / 签署栏齐备', null, '签署栏和标题栏字段未按交付类型自动校验', 'info');
    add('F', 'F02', '线型图例 + 设备明细表遍历全部位号', null, '当前规则未对渲染结果与完整器件清单做逐项比对', 'info');
    add('F', 'F03', '输出状态标注为方案级概念草图', design.status.indexOf('CONCEPT_DRAFT') === 0, design.status);
    add('F', 'F04', '器件档位标 RFQ_REQUIRED，不作为报价', null, '当前规则未检查全部器件档位和 BOM 状态', 'info');

    /* --- G 功能安全检测单元（源自厂家电路对比库 EVSE_VENDOR_KB） --- */
    const KB = window.EVSE_VENDOR_KB;
    if (KB) {
      KB.G_CHECKS.forEach(function (g) {
        if (g.id === 'G04') {
          const coils = design.devices.filter(function (x) { return x.sym.hasCoil; });
          const bad = coils.filter(function (x) { return !x.sym.coilDiode; });
          add('G', 'G04', g.title, coils.length > 0 && bad.length === 0,
            coils.length + ' 个线圈均已画续流二极管（阴极朝 A1）' + (bad.length ? '，缺 ' + bad.map(function (x) { return x.tag; }).join(',') : ''),
            bad.length ? 'error' : 'pass');
          return;
        }
        const need = g.need.map(function (t) { return t.indexOf('#') === 0 ? t : t; });
        const expand = [];
        const mwG = design.params && design.params.family === 'mwess';
        const gunN = (mwG ? design.params.gunCount : design.params.guns) || 1;
        need.forEach(function (t) {
          if (mwG && t === 'SC') return; /* 兆瓦储能机：直流输出由 IMD(RI1) 绝缘监测承担，无需交流短路检测继电器 */
          if (mwG && t === 'CG') { for (let i = 1; i <= gunN; i++) expand.push('CCU' + i); return; } /* CCU 承担 GB/T 27930.2 CC/S± 导引发生+检测+二极管 */
          if (/^(KF|SC|CG)$/.test(t)) { for (let i = 1; i <= gunN; i++) expand.push(t + i); }
          else expand.push(t);
        });
        const miss = expand.filter(function (t) { return !hasDev(t); });
        const ok = expand.length > 0 && miss.length === 0;
        const b = KB.best(g.block);
        add('G', g.id, g.title, ok,
          (ok ? '已覆盖：' + expand.join('/') : (expand.length ? '缺 ' + miss.join('/') : '图上无对应单元')) +
          ' · 最优范式：' + (b ? b.t + '（' + b.who.join('/') + '）' : '—') + ' · ' + g.note,
          ok ? 'pass' : 'error');
      });
    }

    /* --- 计分 --- */
    const score = RUBRIC.map(function (r) {
      const list = items.filter(function (i) { return i.cat === r.id && i.level !== 'info'; });
      const good = list.filter(function (i) { return i.ok; }).length;
      const applicable = list.length > 0;
      const pct = applicable ? good / list.length : null;
      return { id: r.id, name: r.name, weight: r.weight, appliedWeight: applicable ? r.weight : 0,
        applicable: applicable, pct: pct, got: applicable ? Math.round(pct * r.weight * 10) / 10 : 0, pass: good, total: list.length };
    });
    const applicableWeight = score.reduce(function (a, s) { return a + s.appliedWeight; }, 0);
    const weightedGot = score.reduce(function (a, s) { return a + s.got; }, 0);
    const total = applicableWeight ? Math.round(weightedGot / applicableWeight * 1000) / 10 : 0;
    let grade = total >= 95 ? 'S' : total >= 88 ? 'A' : total >= 78 ? 'B' : total >= 65 ? 'C' : 'D';
    const cRow = score.filter(function (s) { return s.id === 'C'; })[0];
    const cHardFail = items.filter(function (i) { return i.cat === 'C' && !i.ok && (i.id === 'C02' || i.id === 'C05'); });
    if ((cRow && cRow.got < 12) || cHardFail.length) {
      const ord = ['S', 'A', 'B', 'C', 'D'];
      if (ord.indexOf(grade) < ord.indexOf('B')) grade = 'B';
    }
    if (!applicableWeight || applicableWeight < RUBRIC.reduce(function (a, r) { return a + r.weight; }, 0) || items.some(function (i) { return !i.ok && i.level === 'warn'; })) {
      if (grade === 'S') grade = 'A';
    }
    const blocking = items.filter(function (i) { return !i.ok && i.level === 'error'; });
    if (blocking.length) grade = 'D';
    design.audit = { items: items, score: score, total: total, applicableWeight: applicableWeight, rubricWeight: RUBRIC.reduce(function (a, r) { return a + r.weight; }, 0), grade: grade, status: blocking.length ? 'BLOCKED' : 'PASS', blocking: blocking, rubric: RUBRIC, stats: { segs: segCount, bends: bends, len: Math.round(totalLen), hops: design.hops.length, junc: design.junctions.length, pins: design.devices.reduce(function (a, d) { return a + d.sym.pins.length; }, 0) } };
    return design;
  }

  /* 拖动电气连接点（junction "·"）
     结点分两类：
       ① 自由结点：仅由走线拐点/端点汇聚 → 直接平移这些点
       ② 引脚重合点：结点落在某器件引脚上 → 平移该器件（引脚跟着走），
          再对受影响网络重路由，保证"走线永远终结在真实端子上"（LIB-R22）*/
  function dragJunction(design, jIdx, nx, ny) {
    const j = (design.junctions || [])[jIdx];
    if (!j) return [];
    const tx = Math.round(nx / SNAP) * SNAP, ty = Math.round(ny / SNAP) * SNAP;
    const ox = j.x, oy = j.y;
    if (Math.abs(tx - ox) < 0.5 && Math.abs(ty - oy) < 0.5) return [];

    /* 找出结点上落着引脚的器件 */
    const ownDevs = [];
    design.devices.forEach(function (d) {
      if (d.sheet !== j.sheet || d.x == null) return;
      for (let i = 0; i < d.sym.pins.length; i++) {
        const p = d.sym.pins[i];
        if (Math.abs(d.x + p.x - ox) < 1.5 && Math.abs(d.y + p.y - oy) < 1.5) { ownDevs.push(d); return; }
      }
    });
    /* ② 引脚重合点：整体平移器件（母排除外——母排是分相基准，不随单点走） */
    const movable = ownDevs.filter(function (d) { return !d.sym.isBus; });
    if (movable.length) {
      const dx = tx - ox, dy = ty - oy;
      movable.forEach(function (d) { d.x += dx; d.y += dy; });
      j.x = tx; j.y = ty;
      reroute(design, movable.map(function (d) { return d.id; }));
      return movable.map(function (d) { return d.id; });
    }
    /* ① 自由结点：平移落在该点的走线顶点，相邻拐点同步保持正交 */
    const hit = [];
    design.wires.forEach(function (w) {
      if (w.sheet !== j.sheet) return;
      const pts = w.pts;
      let touched = false;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (Math.abs(p[0] - ox) > 1.2 || Math.abs(p[1] - oy) > 1.2) continue;
        const pv = pts[i - 1], nb = pts[i + 1];
        if (pv) { if (Math.abs(pv[1] - p[1]) < 1.2) pv[1] = ty; else if (Math.abs(pv[0] - p[0]) < 1.2) pv[0] = tx; }
        if (nb) { if (Math.abs(nb[1] - p[1]) < 1.2) nb[1] = ty; else if (Math.abs(nb[0] - p[0]) < 1.2) nb[0] = tx; }
        p[0] = tx; p[1] = ty;
        touched = true;
      }
      if (touched) { w.manual = true; hit.push(w.id); }
    });
    if (hit.length) { j.x = tx; j.y = ty; crossings(design); }
    return hit;
  }

  /* 校正：把端点脱离引脚的走线**重新求解**（而非手工挪点——手工挪会产生斜线）。
     LIB-R23：任何几何修正都必须经过正交布线器，不得直接改端点坐标。 */
  function snapEnds(design) {
    const obst = {}; design.sheets.forEach(function (s) { obst[s.no] = []; });
    design.devices.forEach(function (d) {
      if (d.sym.isBus || d.x == null) return;
      (obst[d.sheet] || []).push(deviceKeepout(d));
    });
    const used = {}; design.sheets.forEach(function (s) { used[s.no] = newUsed(); });
    const bad = [];
    design.wires.forEach(function (w) {
      const n = netById(design, w.net); if (!n) { return; }
      const A = pinAbs(design.map, n.a), B = pinAbs(design.map, n.b);
      const L = w.pts.length;
      const offA = A && (Math.abs(w.pts[0][0] - A.x) > 0.6 || Math.abs(w.pts[0][1] - A.y) > 0.6);
      const offB = B && (Math.abs(w.pts[L - 1][0] - B.x) > 0.6 || Math.abs(w.pts[L - 1][1] - B.y) > 0.6);
      if (offA || offB) bad.push({ w: w, n: n, A: A, B: B });
      else segsOf(w.pts).forEach(function (s) { addUsed(used[w.sheet], s); });
    });
    bad.forEach(function (it) {
      const w = it.w, n = it.n, A = it.A, B = it.B;
      if (!A || !B) return;
      A.esc = design.map[n.a.d].sym.isXref ? 0 : ESC;
      B.esc = design.map[n.b.d].sym.isXref ? 0 : ESC;
      const pts = solve(A, B, obst[w.sheet], used[w.sheet], n.a.d, n.b.d, null, w.cls, !!(design.map[n.a.d].sym.noCross || design.map[n.b.d].sym.noCross), !!(design.params && design.params.family === 'mwess'));
      if (!pts || pts.length < 2) { n.err = 'ROUTE_NO_CLEAR_PATH'; return; }
      w.pts = pts;
      w.a = A; w.b = B; w.manual = false;
      segsOf(w.pts).forEach(function (s) { addUsed(used[w.sheet], s); });
    });
    design.snapFixed = bad.length;
    return design;
  }

  /* 正交强制：任何残留斜段拆成 L 形两段（最后一道闸门，保证 C01 恒为 0） */
  /* v2.0.1 audit-fix F9: 穿器件违例线定向重路由（整线替换，不扰动他线） */
  function healReroute(design) {
    const M = design.map;
    const obst = {};
    design.devices.forEach(function (d) {
      if (d.sym.isBus || d.x == null) return;
      (obst[d.sheet] = obst[d.sheet] || []).push(deviceKeepout(d));
    });
    for (let round = 0; round < 2; round++) {
      let fixed = 0;
      design.wires.forEach(function (w) {
        const n = netById(design, w.net);
        if (!n) return;
        const hit = segsOf(w.pts).some(function (s) {
          return (obst[w.sheet] || []).some(function (rr) {
            if (rr.id === n.a.d || rr.id === n.b.d) return false;
            return hitRect(s, rr);
          });
        });
        if (!hit) return;
        const A = pinAbs(M, n.a), B = pinAbs(M, n.b);
        if (!A || !B) return;
        A.esc = M[n.a.d].sym.isXref ? 0 : ESC;
        B.esc = M[n.b.d].sym.isXref ? 0 : ESC;
        const used = newUsed();
        design.wires.forEach(function (o) { if (o !== w) segsOf(o.pts).forEach(function (s) { addUsed(used, s); }); });
      const pts = solve(A, B, obst[w.sheet], used, n.a.d, n.b.d, (design.soft || {})[w.sheet] || [], n.cls, !!(design.map[n.a.d].sym.noCross || design.map[n.b.d].sym.noCross), !!(design.params && design.params.family === 'mwess')); /* V12: 补 cls/oh */
        if (pts && pts.length > 1) { w.pts = orient(pts, [A.x, A.y]); fixed++; }
      });
      if (!fixed) break;
    }
    return design;
  }
  function forceOrtho(design) {
    let fixed = 0;
    design.wires.forEach(function (w) {
      const out = [w.pts[0]];
      for (let i = 1; i < w.pts.length; i++) {
        const a = out[out.length - 1], b = w.pts[i];
        const dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]);
        if (dx > 0.01 && dy > 0.01) { out.push([b[0], a[1]]); fixed++; }
        out.push(b);
      }
      if (fixed) w.pts = out;
    });
    design.orthoFixed = fixed;
    return design;
  }

  /* L1-P21: clearFixXref——走线穿跨页符/旗标框时，按 union 包络正交绕行（仅端点出框的段可修） */
  function clearFixXref(design) {
    const bhr = function (s, r) {
      const lo = (a, b) => Math.min(a, b), hi = (a, b) => Math.max(a, b);
      if (s.v) return s.x1 >= r.x && s.x1 <= r.x + r.w && hi(s.y1, s.y2) > r.y && lo(s.y1, s.y2) < r.y + r.h;
      return s.y1 >= r.y && s.y1 <= r.y + r.h && hi(s.x1, s.x2) > r.x && lo(s.x1, s.x2) < r.x + r.w;
    };
    const sgs = function (pts) { const o = []; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; o.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], v: a[0] === b[0] }); } return o; };
    const ni = {}; design.nets.forEach(function (n) { ni[n.id] = n; });
    const boxBySheet = {}; const obstBySheet = {};
    (design.boxes || []).forEach(function (b) { if (b.kind !== 'label' && b.kind !== 'xref') return; (boxBySheet[b.sheet] = boxBySheet[b.sheet] || []).push(b); });
    design.devices.forEach(function (x) { if (x.sym.isBus || x.sym.isXref || x.x == null) return; (obstBySheet[x.sheet] = obstBySheet[x.sheet] || []).push({ id: x.id, x: x.x, y: x.y, w: devDims(x).w, h: devDims(x).h }); });
    const tryFix = function (w, s, si, boxes, obst) {
      const n = ni[w.net];
      const hits = boxes.filter(function (b) { if (n && (b.id === n.a.d || b.id === n.b.d)) return false; return bhr(s, { x: b.x, y: b.y, w: b.w, h: b.h }); });
      if (!hits.length) return null;
      let ux = Infinity, uy = Infinity, ux2 = -Infinity, uy2 = -Infinity;
      hits.forEach(function (b) { ux = Math.min(ux, b.x); uy = Math.min(uy, b.y); ux2 = Math.max(ux2, b.x + b.w); uy2 = Math.max(uy2, b.y + b.h); });
      const uw = ux2 - ux, uh = uy2 - uy;
      const pad = 10;
      const xL = ux - pad - 12, xR = ux2 + pad + 12;
      const yT = uy - pad - 12, yB2 = uy2 + pad + 12;
      const A = w.pts[si], B = w.pts[si + 1];
      if (s.v) {
        const ayOk = Math.min(A[1], B[1]) < uy && Math.max(A[1], B[1]) > uy2;
        if (!ayOk) return null;
        const oxs = [(s.x1 < ux + uw / 2) ? xL : xR];
        if (oxs[0] === xL) oxs.push(xR); else oxs.push(xL);
        for (let oi = 0; oi < oxs.length; oi++) {
          const ox = oxs[oi];
          const cand = [A.slice(), [ox, A[1]], [ox, B[1]], B.slice()];
          const cs = sgs(cand); let ok = true;
          for (let q = 0; q < cs.length && ok; q++) {
            const sg = cs[q];
            if (!sg.v && sg.y1 !== sg.y2) { ok = false; break; }
            if (sg.v && sg.x1 !== sg.x2) { ok = false; break; }
            for (let v2 = 0; v2 < obst.length && ok; v2++) { const oo = obst[v2]; if (n && (oo.id === n.a.d || oo.id === n.b.d)) continue; if (bhr(sg, oo)) { ok = false; break; } }
            for (let v3 = 0; v3 < boxes.length && ok; v3++) { const bb = boxes[v3]; if (n && (bb.id === n.a.d || bb.id === n.b.d)) continue; if (bhr(sg, { x: bb.x, y: bb.y, w: bb.w, h: bb.h })) { ok = false; break; } }
          }
          if (ok) return cand;
        }
        return null;
      } else {
        const axOk = Math.min(A[0], B[0]) < ux && Math.max(A[0], B[0]) > ux2;
        if (!axOk) return null;
        const oys = [(s.y1 < uy + uh / 2) ? yT : yB2];
        if (oys[0] === yT) oys.push(yB2); else oys.push(yT);
        for (let oi = 0; oi < oys.length; oi++) {
          const oy = oys[oi];
          const cand = [A.slice(), [A[0], oy], [B[0], oy], B.slice()];
          const cs = sgs(cand); let ok = true;
          for (let q = 0; q < cs.length && ok; q++) {
            const sg = cs[q];
            if (!sg.v && sg.y1 !== sg.y2) { ok = false; break; }
            if (sg.v && sg.x1 !== sg.x2) { ok = false; break; }
            for (let v2 = 0; v2 < obst.length && ok; v2++) { const oo = obst[v2]; if (n && (oo.id === n.a.d || oo.id === n.b.d)) continue; if (bhr(sg, oo)) { ok = false; break; } }
            for (let v3 = 0; v3 < boxes.length && ok; v3++) { const bb = boxes[v3]; if (n && (bb.id === n.a.d || bb.id === n.b.d)) continue; if (bhr(sg, { x: bb.x, y: bb.y, w: bb.w, h: bb.h })) { ok = false; break; } }
          }
          if (ok) return cand;
        }
        return null;
      }
    };
    let fixed = 0;
    for (let round = 0; round < 6; round++) {
      let any = false;
      design.wires.forEach(function (w) {
        const boxes = boxBySheet[w.sheet] || [], obst = obstBySheet[w.sheet] || [];
        const ss = sgs(w.pts);
        for (let si = 0; si < ss.length; si++) {
          let hit = false;
          boxes.forEach(function (b) { const n = ni[w.net]; if (n && (b.id === n.a.d || b.id === n.b.d)) return; if (bhr(ss[si], { x: b.x, y: b.y, w: b.w, h: b.h })) hit = true; });
          if (!hit) continue;
          const nw = tryFix(w, ss[si], si, boxes, obst);
          if (nw) { w.pts = nw; fixed++; any = true; }
          break;
        }
      });
      if (!any) break;
    }
    return fixed;
  }
  /* V7-PIN: 连接管脚外伸——电气点移出本体外 18px（蓝色禁布框 body+12 之外），
   * 渲染桩自动变为外伸引脚腿，连线端点=腿尖；母排分接点不外伸 */
  function extendPins(design) {
    const EXT = 18;
    design.devices.forEach(function (dv) {
      const s = dv.sym;
      if (!s || s.isBus || s.__ext) return;
      s.__ext = 1;
      (s.pins || []).forEach(function (p) {
        const v = DIRV[p.d] || [1, 0];
        p.x += v[0] * EXT; p.y += v[1] * EXT;
        p.len = (p.len || 0) + EXT;
      });
    });
  }
  /* V7-UNTANGLE: 负极接触器顶引脚(1)→粘连检测 KF 侧引脚(3) 的网络，求解器等长 tie-break 会选
   * 沿自身本体左缘下穿的候选；此处按两器件间走廊中点重写为标准正交 Z 径（端点不变） */
  function untangleOwn(design) {
    design.wires.forEach(function (w) {
      const a = w.a, b = w.b;
      if (!a || !b || !a.dev || !b.dev || a.pin !== '1') return;
      if (!/^K\d+N$/.test(a.dev) || !/^KF\d+$/.test(b.dev)) return;
      const dvA = design.map[a.dev], dvB = design.map[b.dev];
      if (!dvA || !dvB || dvA.sheet !== dvB.sheet || dvA.x == null) return;
      const right = dvA.x + dvA.sym.w, left = dvB.x;
      if (left - right < 40 || b.y <= dvA.y) return;
      const kfX = Math.round((right + left) / 2);
      const tipY = a.y - 14;
      w.pts = [[a.x, a.y], [a.x, tipY], [kfX, tipY], [kfX, b.y], [b.x, b.y]];
    });
  }
  /* V11: 清除 [X,Y,X] 折返尖刺（含中部） */
  function deSpike(design) {
    design.wires.forEach(function (w) {
      let changed = true;
      while (changed && w.pts.length >= 3) {
        changed = false;
        for (let i = 0; i + 2 < w.pts.length; i++) {
          const a = w.pts[i], b = w.pts[i + 1], c = w.pts[i + 2];
          if (Math.abs(a[0] - c[0]) < 0.01 && Math.abs(a[1] - c[1]) < 0.01 && (Math.abs(a[0] - b[0]) > 0.01 || Math.abs(a[1] - b[1]) > 0.01)) {
            w.pts.splice(i + 1, 2); changed = true; break;
          }
          /* V12b: 共线中间点一律删除（含折返毛刺：p→q→r 同线反向时删 q 即消除 4px 重叠小段） */
          const collH = Math.abs(a[1] - b[1]) < 0.01 && Math.abs(b[1] - c[1]) < 0.01 && Math.abs(a[0] - b[0]) > 0.01 && Math.abs(b[0] - c[0]) > 0.01;
          const collV = Math.abs(a[0] - b[0]) < 0.01 && Math.abs(b[0] - c[0]) < 0.01 && Math.abs(a[1] - b[1]) > 0.01 && Math.abs(b[1] - c[1]) > 0.01;
          if (collH || collV) { w.pts.splice(i + 1, 1); changed = true; break; }
        }
        for (let i = 0; i + 1 < w.pts.length; i++) {
          if (Math.abs(w.pts[i][0] - w.pts[i + 1][0]) < 0.01 && Math.abs(w.pts[i][1] - w.pts[i + 1][1]) < 0.01) { w.pts.splice(i + 1, 1); changed = true; break; }
        }
      }
    });
  }
  /* V11: 审计驱动的 C05 最终修正——以 audit（含豁免）为 oracle 爬山，只接受“C05 对数下降且 C02/C10 不增”的移动 */
  function fixC05(design) {
    const failOf = function (code) { return design.audit.items.filter(function (i) { return i.id === code && !i.ok; }).length; };
    for (let iter = 0; iter < 6; iter++) {
      audit(design);
      const pairs = (design._c05pairs || []).slice();
      if (!pairs.length) return;
      const baseT = pairs.length, baseC02 = failOf('C02'), baseC10 = failOf('C10'), baseC01 = failOf('C01'), baseC11 = failOf('C11');
      let improved = false;
      for (let pi = 0; pi < pairs.length && !improved; pi++) {
        const tryW = function (entry) {
          if (!entry || !entry.w || !entry.s) return false;
          const w = entry.w, s = entry.s;
          let idx = -1;
          for (let i = 0; i + 1 < w.pts.length; i++) {
            if (Math.abs(w.pts[i][0] - s.x1) < 0.6 && Math.abs(w.pts[i][1] - s.y1) < 0.6 && Math.abs(w.pts[i + 1][0] - s.x2) < 0.6 && Math.abs(w.pts[i + 1][1] - s.y2) < 0.6) { idx = i; break; }
          }
          if (idx < 0 || idx === 0 || idx === w.pts.length - 2) { if (globalThis.FIXDBG) console.log('FIX skip idx=' + idx + ' len=' + w.pts.length + ' w=' + w.id); return false; }
          const A1 = w.pts[idx], B1 = w.pts[idx + 1];
          const vert = Math.abs(A1[0] - B1[0]) < 0.01;
          const prevV = Math.abs(w.pts[idx - 1][0] - A1[0]) < 0.01;
          const nextV = Math.abs(B1[0] - w.pts[idx + 2][0]) < 0.01;
          if (vert ? (prevV || nextV) : (!prevV || !nextV)) { if (globalThis.FIXDBG) console.log('FIX skip adj w=' + w.id + ' vert=' + vert + ' prevV=' + prevV + ' nextV=' + nextV); return false; }
          const deltas = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 8, -8, 12, -12, 16, -16];
          for (let di = 0; di < deltas.length; di++) {
            const dl = deltas[di];
            const oa = A1.slice(), ob = B1.slice();
            if (vert) { A1[0] += dl; B1[0] += dl; } else { A1[1] += dl; B1[1] += dl; }
            forceOrtho(design); snapEnds(design); /* V11: 自愈残留斜线/端点漂移 */
            crossings(design); audit(design);
            const np = (design._c05pairs || []).length;
            if (globalThis.FIXDBG) console.log('FIX try w=' + w.id + ' dl=' + dl + ' np=' + np + '/' + baseT + ' c02=' + failOf('C02') + '/' + baseC02 + ' c10=' + failOf('C10') + '/' + baseC10 + ' c01=' + failOf('C01'));
            if (globalThis.FIXDBG && failOf('C01') > 0) { design.wires.forEach(function (ww) { const sg = segsOf(ww.pts); sg.forEach(function (ss) { if (Math.abs(ss.x1 - ss.x2) > 0.01 && Math.abs(ss.y1 - ss.y2) > 0.01) console.log('FIX diag w=' + ww.id + ' seg=' + ss.x1 + ',' + ss.y1 + '->' + ss.x2 + ',' + ss.y2 + ' pts=' + JSON.stringify(ww.pts)); }); }); }
            if (np < baseT && failOf('C02') <= baseC02 && failOf('C10') <= baseC10 && failOf('C01') <= baseC01 && failOf('C11') <= baseC11) { improved = true; return true; }
            A1[0] = oa[0]; A1[1] = oa[1]; B1[0] = ob[0]; B1[1] = ob[1];
          }
          return false;
        };
        if (!tryW(pairs[pi].b)) tryW(pairs[pi].a);
      }
      if (!improved) { audit(design); return; }
    }
  }
  /* V12: xref 让位——压在 pin 引出走廊上的跨页符整体侧移 */
  function xrefNudge(design) {
    const corr = [];
    design.devices.forEach(function (v) {
      if (v.x == null || v.sym.isXref || v.sym.isBus) return;
      (v.sym.pins || []).forEach(function (p) {
        const a = pinAbs(design.map, { d: v.id, p: p.n });
        if (!a || !a.d) return;
        const dv = DIRV[a.d];
        if (!dv) return;
        if (dv[1] === 0) corr.push({ sheet: v.sheet, x: a.x - 5, y: dv[0] > 0 ? a.x * 0 + Math.min(a.y, a.y) : 0, w: 10, h: 0, vx: a.x, hy: null, x0: dv[0] > 0 ? a.x : a.x - 20, y0: a.y - 5, w2: 20, h2: 10 });
        else corr.push({ sheet: v.sheet, vx: null, hy: a.y, x0: a.x - 5, y0: dv[1] > 0 ? a.y : a.y - 20, w2: 10, h2: 20 });
      });
    });
    const rects = function (b) { return { x: b.x, y: b.y, w: b.w, h: b.h }; };
    const ovlR = function (a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; };
    const solids = (design.boxes || []).filter(function (b) { return b.kind === 'body' || b.kind === 'xref' || b.kind === 'label'; });
    (design.boxes || []).forEach(function (b) {
      if (b.kind !== 'xref') return;
      const hit = corr.some(function (c) { return c.sheet === b.sheet && ovlR(rects(b), { x: c.x0, y: c.y0, w: c.w2, h: c.h2 }); });
      if (!hit) return;
      const dev = design.devices.filter(function (v) { return v.id === b.id; })[0];
      if (!dev) return;
      const cands = [[24, 0], [-24, 0], [36, 0], [-36, 0], [48, 0], [-48, 0], [0, -24], [0, 24], [60, 0], [-60, 0]];
      for (let ci = 0; ci < cands.length; ci++) {
        const nb = { x: b.x + cands[ci][0], y: b.y + cands[ci][1], w: b.w, h: b.h };
        if (nb.x < 40 || nb.y < 40) continue;
        const bad = solids.some(function (s2) { if (s2 === b) return false; if (s2.sheet !== b.sheet) return false; return ovlR(nb, rects(s2)); })
          || corr.some(function (c2) { return c2.sheet === b.sheet && ovlR(nb, { x: c2.x0, y: c2.y0, w: c2.w2, h: c2.h2 }); });
        if (bad) continue;
        dev.x += cands[ci][0]; dev.y += cands[ci][1];
        b.x = nb.x; b.y = nb.y;
        break;
      }
    });
  }
  /* V12: 路由后 xref 让位——被走线压住的跨页符整体平移，以真实走线为障碍 */
  function fixC08(design) {
    const failOf = function (code) { return design.audit.items.filter(function (i) { return i.id === code && !i.ok; }).length; };
    const ovlR = function (a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; };
    const hitsOf = function () {
      const out = [];
      design.wires.forEach(function (w) {
        segsOf(w.pts).forEach(function (s) {
          (design.boxes || []).forEach(function (b) {
            if (b.kind !== 'xref') return;
            if (b.sheet !== w.sheet) return;
            const n = netById(design, w.net);
            if (n && (b.id === n.a.d || b.id === n.b.d)) return;
            if (bodyHitRect(s, { x: b.x, y: b.y, w: b.w, h: b.h })) out.push(b);
          });
        });
      });
      const uniq = [];
      out.forEach(function (b) { if (uniq.indexOf(b) < 0) uniq.push(b); });
      return uniq;
    };
    for (let iter = 0; iter < 2; iter++) {
      audit(design);
      const hits = hitsOf();
      if (!hits.length) return;
      const base08 = failOf('C08'), base07 = failOf('C07'), base10 = failOf('C10'), base11 = failOf('C11');
      let improved = false;
      for (let hi = 0; hi < hits.length && !improved; hi++) {
        const b = hits[hi];
        const dev = design.devices.filter(function (v) { return v.id === b.id; })[0];
        if (!dev) continue;
        const solids = (design.boxes || []).filter(function (s2) { return s2 !== b && s2.sheet === b.sheet && (s2.kind === 'body' || s2.kind === 'xref' || s2.kind === 'label'); });
        const cands = [[16, 0], [-16, 0], [20, 0], [-20, 0], [24, 0], [-24, 0], [0, -24], [0, 24], [24, -24], [-24, -24], [24, 24], [-24, 24], [36, 0], [-36, 0], [0, -36], [0, 36], [48, 0], [-48, 0], [60, 0], [-60, 0], [0, 48], [0, -48], [72, 0], [-72, 0], [36, -36], [-36, 36]];
        for (let ci = 0; ci < cands.length && !improved; ci++) {
          const nb = { x: b.x + cands[ci][0], y: b.y + cands[ci][1], w: b.w, h: b.h };
          if (nb.x < 60 || nb.y < 60) continue;
          let bad = solids.some(function (s2) { return ovlR(nb, s2); });
          if (!bad) bad = design.wires.some(function (w) { if (w.sheet !== b.sheet) return false; const n2 = netById(design, w.net); if (n2 && (n2.a.d === b.id || n2.b.d === b.id)) return false; return segsOf(w.pts).some(function (s) { return bodyHitRect(s, nb); }); }); /* V12: 豁免自身接线 */
          if (bad) continue;
          const ox = dev.x, oy = dev.y, obx = b.x, oby = b.y;
          dev.x += cands[ci][0]; dev.y += cands[ci][1]; b.x = nb.x; b.y = nb.y;
          audit(design);
          if (failOf('C08') < base08 && failOf('C07') <= base07 && failOf('C10') <= base10 && failOf('C11') <= base11) { improved = true; }
          else { dev.x = ox; dev.y = oy; b.x = obx; b.y = oby; }
        }
      }
      if (!improved) {
        /* V12: xref 动不了则动线——命中段 lateral 避让 oracle */
        const hits2 = hitsOf();
        for (let hi2 = 0; hi2 < hits2.length && !improved; hi2++) {
          const b2 = hits2[hi2];
          design.wires.forEach(function (w) {
            if (improved || w.sheet !== b2.sheet) return;
            const sg = segsOf(w.pts);
            for (let si2 = 0; si2 < sg.length && !improved; si2++) {
              const s2 = sg[si2];
              if (!bodyHitRect(s2, { x: b2.x, y: b2.y, w: b2.w, h: b2.h })) continue;
              let idx = -1;
              for (let i2 = 0; i2 + 1 < w.pts.length; i2++) {
                if (Math.abs(w.pts[i2][0] - s2.x1) < 0.6 && Math.abs(w.pts[i2][1] - s2.y1) < 0.6 && Math.abs(w.pts[i2 + 1][0] - s2.x2) < 0.6 && Math.abs(w.pts[i2 + 1][1] - s2.y2) < 0.6) { idx = i2; break; }
              }
              if (idx < 0 || idx === 0 || idx === w.pts.length - 2) continue;
              const A2 = w.pts[idx], B2 = w.pts[idx + 1];
              const vert2 = Math.abs(A2[0] - B2[0]) < 0.01;
              const pv = Math.abs(w.pts[idx - 1][0] - A2[0]) < 0.01, nv = Math.abs(B2[0] - w.pts[idx + 2][0]) < 0.01;
              if (vert2 ? (pv || nv) : (!pv || !nv)) continue;
              const dls = [8, -8, 16, -16, 24, -24];
              for (let di2 = 0; di2 < dls.length && !improved; di2++) {
                const oa2 = A2.slice(), ob2 = B2.slice();
                if (vert2) { A2[0] += dls[di2]; B2[0] += dls[di2]; } else { A2[1] += dls[di2]; B2[1] += dls[di2]; }
                /* V12: 几何预筛——新位置仍压目标盒或压其他文字/跨页符则不审 */
                const ns = { x1: A2[0], y1: A2[1], x2: B2[0], y2: B2[1], v: vert2 };
                let geoBad = bodyHitRect(ns, { x: b2.x, y: b2.y, w: b2.w, h: b2.h });
                if (!geoBad) geoBad = (design.boxes || []).some(function (bb) { if (bb.kind !== 'label' && bb.kind !== 'xref') return false; if (bb.sheet !== w.sheet) return false; return bodyHitRect(ns, { x: bb.x, y: bb.y, w: bb.w, h: bb.h }); });
                if (geoBad) { A2[0] = oa2[0]; A2[1] = oa2[1]; B2[0] = ob2[0]; B2[1] = ob2[1]; continue; }
                forceOrtho(design); snapEnds(design); crossings(design); audit(design);
                if (failOf('C08') < base08 && failOf('C07') <= base07 && failOf('C10') <= base10 && failOf('C11') <= base11 && failOf('C02') === 0) { improved = true; }
                else { A2[0] = oa2[0]; A2[1] = oa2[1]; B2[0] = ob2[0]; B2[1] = ob2[1]; forceOrtho(design); }
              }
            }
          });
        }
      }
      if (!improved) { audit(design); return; }
    }
  }
  /* V12b: 线穿他网 pin 电点修正——不同网络的线段绝不得穿过器件 pin 电气点（视觉短路），lateral 平移避让 */
  function fixPinTransit(design) {
    const failOf = function (code) { return design.audit.items.filter(function (i) { return i.id === code && !i.ok; }).length; };
    const allPins = function () {
      const out = [];
      design.devices.forEach(function (v) {
        if (v.x == null) return;
        (v.sym.pins || []).forEach(function (p) {
          const a = pinAbs(design.map, { d: v.id, p: p.n });
          if (a) out.push({ x: a.x, y: a.y, dev: v.id });
        });
      });
      return out;
    };
    const segOnPin = function (s, q) {
      const lo = Math.min, hi = Math.max;
      return s.v ? (Math.abs(s.x1 - q.x) < 0.6 && q.y > lo(s.y1, s.y2) + 0.01 && q.y < hi(s.y1, s.y2) - 0.01)
        : (Math.abs(s.y1 - q.y) < 0.6 && q.x > lo(s.x1, s.x2) + 0.01 && q.x < hi(s.x1, s.x2) - 0.01);
    };
    const transits = function (pins) {
      const hits = [];
      design.wires.forEach(function (w) {
        const n = netById(design, w.net);
        segsOf(w.pts).forEach(function (s) {
          pins.forEach(function (q) {
            if (n && (n.a.d === q.dev || n.b.d === q.dev)) return;
            if (segOnPin(s, q)) hits.push({ w: w, s: s, q: q });
          });
        });
      });
      return hits;
    };
    const pins = allPins();
    for (let iter = 0; iter < 5; iter++) {
      audit(design);
      const hits = transits(pins);
      if (!hits.length) return;
      const baseT = hits.length, b01 = failOf('C01'), b02 = failOf('C02'), b05 = failOf('C05'), b07 = failOf('C07'), b08 = failOf('C08'), b10 = failOf('C10'), b11 = failOf('C11');
      let improved = false;
      for (let hi2 = 0; hi2 < hits.length && !improved; hi2++) {
        const h = hits[hi2], w = h.w;
        let idx = -1;
        for (let i = 0; i + 1 < w.pts.length; i++) {
          if (Math.abs(w.pts[i][0] - h.s.x1) < 0.6 && Math.abs(w.pts[i][1] - h.s.y1) < 0.6 && Math.abs(w.pts[i + 1][0] - h.s.x2) < 0.6 && Math.abs(w.pts[i + 1][1] - h.s.y2) < 0.6) { idx = i; break; }
        }
        if (idx < 0 || idx === 0 || idx === w.pts.length - 2) continue; /* 端点段不可 lateral */
        const n = netById(design, w.net);
        const A2 = w.pts[idx], B2 = w.pts[idx + 1];
        const vert2 = Math.abs(A2[0] - B2[0]) < 0.01;
        const pv = Math.abs(w.pts[idx - 1][0] - A2[0]) < 0.01, nv = Math.abs(B2[0] - w.pts[idx + 2][0]) < 0.01;
        if (vert2 ? (pv || nv) : (!pv || !nv)) continue;
        const dls = [4, -4, 8, -8, 12, -12, 16, -16, 20, -20, 24, -24, 30, -30, 36, -36];
        for (let di = 0; di < dls.length && !improved; di++) {
          const oa = A2.slice(), ob = B2.slice();
          if (vert2) { A2[0] += dls[di]; B2[0] += dls[di]; } else { A2[1] += dls[di]; B2[1] += dls[di]; }
          /* 几何预筛：新段离所有 pin ≥3px，不穿他器 body/keepout 内部 */
          const ns = { x1: A2[0], y1: A2[1], x2: B2[0], y2: B2[1], v: vert2 };
          let bad = pins.some(function (q2) {
            const lo = Math.min, hi3 = Math.max;
            return ns.v ? (Math.abs(ns.x1 - q2.x) < 3 && q2.y > lo(ns.y1, ns.y2) - 3 && q2.y < hi3(ns.y1, ns.y2) + 3)
              : (Math.abs(ns.y1 - q2.y) < 3 && q2.x > lo(ns.x1, ns.x2) - 3 && q2.x < hi3(ns.x1, ns.x2) + 3);
          });
          if (!bad) bad = design.devices.some(function (v2) {
            if (v2.x == null || v2.sheet !== w.sheet || v2.sym.isBus || v2.sym.isXref || v2.pwr) return false;
            if (n && (n.a.d === v2.id || n.b.d === v2.id)) return false;
            const k = { x: v2.x - 8, y: v2.y - 8, w: v2.sym.w + 16, h: v2.sym.h + 16 };
            return bodyHitRect({ x1: ns.x1 + (ns.v ? 0 : 0.02), y1: ns.y1 + (ns.v ? 0.02 : 0), x2: ns.x2, y2: ns.y2, v: ns.v }, k);
          });
          if (bad) { A2[0] = oa[0]; A2[1] = oa[1]; B2[0] = ob[0]; B2[1] = ob[1]; continue; }
          forceOrtho(design); snapEnds(design); crossings(design); audit(design);
          if (transits(pins).length < baseT && failOf('C01') <= b01 && failOf('C02') <= b02 && failOf('C05') <= b05 && failOf('C07') <= b07 && failOf('C08') <= b08 && failOf('C10') <= b10 && failOf('C11') <= b11) { improved = true; }
          else { A2[0] = oa[0]; A2[1] = oa[1]; B2[0] = ob[0]; B2[1] = ob[1]; forceOrtho(design); snapEnds(design); }
        }
      }
      if (!improved) { audit(design); return; }
    }
  }
  /* V12d: 净空 oracle——线-器件外框(keepout=body+8) ≥8px 且 平行线-线 ≥8px；首末引出段(pin锁定)豁免；局部Δcost+审计Pareto接受 */
  function fixClear8(design) {
    const failOf = function (code) { return design.audit.items.filter(function (i) { return i.id === code && !i.ok; }).length; };
    const cntOf = function (code) {
      const it = design.audit.items.filter(function (i) { return i.id === code; })[0];
      if (!it || it.ok) return 0;
      const m = /(\d+)/.exec(it.detail || '');
      return m ? parseInt(m[1], 10) : 1;
    };
    const KO2 = 8;
    const segFrameDist = function (s, r) {
      let best = 1e9;
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const px = s.x1 + (s.x2 - s.x1) * t, py = s.y1 + (s.y2 - s.y1) * t;
        const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
        const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
        best = Math.min(best, Math.hypot(dx, dy));
      }
      return best;
    };
    const FR = [], BR = [];
    design.devices.forEach(function (v) {
      if (v.x == null || v.sym.isBus || v.sym.isXref || v.pwr) return;
      FR.push({ sheet: v.sheet, r: { x: v.x - KO2, y: v.y - KO2, w: v.sym.w + 2 * KO2, h: v.sym.h + 2 * KO2 } });
      BR.push({ sheet: v.sheet, r: { x: v.x, y: v.y, w: v.sym.w, h: v.sym.h } });
    });
    const bodyIn = function (s, sheet) {
      for (let bi = 0; bi < BR.length; bi++) {
        const r = BR[bi].r;
        if (BR[bi].sheet !== sheet) continue;
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          const px = s.x1 + (s.x2 - s.x1) * t, py = s.y1 + (s.y2 - s.y1) * t;
          if (px > r.x + 0.5 && px < r.x + r.w - 0.5 && py > r.y + 0.5 && py < r.y + r.h - 0.5) return true;
        }
      }
      return false;
    };
    const frameViol = function (s, sheet) {
      let c = 0;
      FR.forEach(function (f) { if (f.sheet === sheet && segFrameDist(s, f.r) < 7.99) c++; });
      return c;
    };
    const keepoutViol = function (s, sheet) {
      let c = 0;
      FR.forEach(function (f) {
        if (f.sheet === sheet && bodyHitRect(s, f.r)) c++;
      });
      return c;
    };
    const allSegs = function () {
      const sg = [];
      design.wires.forEach(function (w) {
        segsOf(w.pts).forEach(function (s, si) { s.wire = w; s.si = si; sg.push(s); });
      });
      return sg;
    };
    const wwFor = function (s, sg, skipWire) {
      let c = 0;
      const sheet = skipWire.sheet;
      sg.forEach(function (o) {
        if (o.wire === skipWire || o.wire.sheet !== sheet || o.v !== s.v) return;
        if (s.v) {
          const dx = Math.abs(o.x1 - s.x1);
          if (dx < 0.01 || dx >= 7.99) return;
          const ov = Math.min(Math.max(o.y1, o.y2), Math.max(s.y1, s.y2)) - Math.max(Math.min(o.y1, o.y2), Math.min(s.y1, s.y2));
          if (ov > 4) c++;
        } else {
          const dy = Math.abs(o.y1 - s.y1);
          if (dy < 0.01 || dy >= 7.99) return;
          const ov = Math.min(Math.max(o.x1, o.x2), Math.max(s.x1, s.x2)) - Math.max(Math.min(o.x1, o.x2), Math.min(s.x1, s.x2));
          if (ov > 4) c++;
        }
      });
      return c;
    };
    const collectHits = function () {
      const out = [], sg = allSegs();
      design.wires.forEach(function (w) {
        const segs = segsOf(w.pts);
        segs.forEach(function (s, si) {
          if (si === 0 || si === segs.length - 1) return;
          if (frameViol(s, w.sheet) > 0 || keepoutViol(s, w.sheet) > 0) out.push({ w: w, si: si, dist: 0 });
        });
      });
      const seen = {};
      for (let i = 0; i < sg.length; i++) for (let j = i + 1; j < sg.length; j++) {
        const a = sg[i], b = sg[j];
        if (a.wire === b.wire || a.wire.sheet !== b.wire.sheet || a.v !== b.v) continue;
        let dd = -1;
        if (a.v) {
          const dx = Math.abs(a.x1 - b.x1);
          if (dx < 0.01 || dx >= 7.99) continue;
          const ov = Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) - Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2));
          if (ov <= 4) continue;
          dd = dx;
        } else {
          const dy = Math.abs(a.y1 - b.y1);
          if (dy < 0.01 || dy >= 7.99) continue;
          const ov = Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) - Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2));
          if (ov <= 4) continue;
          dd = dy;
        }
        [[a, b], [b, a]].forEach(function (pr) {
          const s0 = pr[0];
          const segs0 = segsOf(s0.wire.pts);
          if (s0.si === 0 || s0.si === segs0.length - 1) return;
          const key = s0.wire.id + ':' + s0.si;
          if (seen[key]) return;
          seen[key] = 1;
          out.push({ w: s0.wire, si: s0.si, dist: dd });
        });
      }
      return out;
    };
    const txtViol = function (s, sheet, net) {
      const n = netById(design, net);
      return (design.boxes || []).some(function (b) {
        if (b.kind !== 'label' && b.kind !== 'xref') return false;
        if (b.sheet !== sheet) return false;
        if (n && (b.id === n.a.d || b.id === n.b.d)) return false;
        return bodyHitRect(s, { x: b.x, y: b.y, w: b.w, h: b.h });
      });
    };
    const banned = {}; /* V12d: 被回滚的 (wire,si,dl) 永不重试，防跨迭代 thrash */
    for (let iter = 0; iter < 8; iter++) {
      const t0 = Date.now();
      let hits = collectHits();
      const tCollect = Date.now() - t0;
      if (globalThis.T8) console.log('T8 iter', iter, 'collectHits ms', tCollect, 'hits', hits.length);
      if (!hits.length) return;
      hits.sort(function (a, b) { return a.dist - b.dist; }).slice(0, 24);
      hits = hits.slice(0, 24);
      audit(design);
      const b01 = cntOf('C01'), b02 = cntOf('C02'), b05 = cntOf('C05'), b07 = cntOf('C07'), b08 = cntOf('C08'), b10 = cntOf('C10'), b11 = cntOf('C11');
      const okP = function () { return cntOf('C01') <= b01 && cntOf('C02') <= b02 && cntOf('C05') <= b05 && cntOf('C07') <= b07 && cntOf('C08') <= b08 && cntOf('C10') <= b10 && cntOf('C11') <= b11; };
      let improved = false;
      const undo = [];
      for (let hi2 = 0; hi2 < hits.length; hi2++) {
        const h = hits[hi2], w = h.w;
        if (h.si - 1 < 0 || h.si + 2 > w.pts.length - 1) continue;
        const A2 = w.pts[h.si], B2 = w.pts[h.si + 1];
        const vert2 = Math.abs(A2[0] - B2[0]) < 0.01;
        const pv = Math.abs(w.pts[h.si - 1][0] - A2[0]) < 0.01, nv = Math.abs(B2[0] - w.pts[h.si + 2][0]) < 0.01;
        if (vert2 ? (pv || nv) : (!pv || !nv)) continue;
        const sgAll = allSegs();
        const oldSeg = segsOf(w.pts)[h.si];
        const oldFV = frameViol(oldSeg, w.sheet), oldWW = wwFor(oldSeg, sgAll, w);
        const oldKO = keepoutViol(oldSeg, w.sheet);
        const oldTxt = txtViol(oldSeg, w.sheet, w.net);
        const need = Math.ceil(8 - h.dist) + 1;
        const dls = [];
        [need, need + 2, need + 4, need + 8, need + 12, need + 16].forEach(function (b) { dls.push(b, -b); });
        for (let di = 0; di < dls.length; di++) {
          if (banned[w.id + ':' + h.si + ':' + dls[di]]) continue;
          const oa = A2.slice(), ob = B2.slice();
          if (vert2) { A2[0] += dls[di]; B2[0] += dls[di]; } else { A2[1] += dls[di]; B2[1] += dls[di]; }
          const ns = { x1: A2[0], y1: A2[1], x2: B2[0], y2: B2[1], v: vert2 };
          if (bodyIn(ns, w.sheet)) { A2[0] = oa[0]; A2[1] = oa[1]; B2[0] = ob[0]; B2[1] = ob[1]; continue; }
          if (!oldTxt && txtViol(ns, w.sheet, w.net)) { A2[0] = oa[0]; A2[1] = oa[1]; B2[0] = ob[0]; B2[1] = ob[1]; continue; }
          const dF = frameViol(ns, w.sheet) - oldFV, dW = wwFor(ns, sgAll, w) - oldWW;
          const dKO = keepoutViol(ns, w.sheet) - oldKO;
          /* Pareto 推挤：修框、线间距或器件净空时，不得新增另外两类冲突。 */
          if (!((dF < 0 && dW <= 0 && dKO <= 0) ||
                (dW < 0 && dF <= 0 && dKO <= 0) ||
                (dKO < 0 && dF <= 0 && dW <= 0))) { A2[0] = oa[0]; A2[1] = oa[1]; B2[0] = ob[0]; B2[1] = ob[1]; continue; }
          /* V12d-fast: 乐观接受 + 迭代末批量审计；Pareto 失败则逆序回滚 */
          undo.push({ w: w, si: h.si, oa: oa, ob: ob, dl: dls[di] });
          improved = true;
          break;
        }
      }
      if (!undo.length) { if (globalThis.T8) console.log('T8 iter', iter, 'no-undo exit; cand ms', Date.now() - t0 - tCollect); return; }
      const tCand = Date.now() - t0 - tCollect;
      forceOrtho(design); snapEnds(design); audit(design); /* V12d-fast: Pareto 项不依赖 crossings，统一留给管线末尾 */
      const tAudit = Date.now() - t0 - tCollect - tCand;
      if (globalThis.T8) console.log('T8 iter', iter, 'cand ms', tCand, 'audit ms', tAudit, 'undo', undo.length, 'okP', okP());
      let guardN = 0;
      while (undo.length && !okP() && guardN++ < 64) {
        const m = undo.pop();
        banned[m.w.id + ':' + m.si + ':' + m.dl] = 1;
        const A3 = m.w.pts[m.si], B3 = m.w.pts[m.si + 1];
        A3[0] = m.oa[0]; A3[1] = m.oa[1]; B3[0] = m.ob[0]; B3[1] = m.ob[1];
        forceOrtho(design); snapEnds(design); audit(design);
      }
      if (!undo.length && !okP()) return; /* 全回滚仍不达标 → 止损，防死循环 */
      if (!improved) return;
    }
  }
  /* 兆瓦储能：器件已带坐标，按 bbox 求每页图幅（等价 place() 末段） */
  function frameAll(design) {
    const sheets = {};
    design.sheets.forEach(function (s) { sheets[s.no] = { no: s.no, x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; });
    design.devices.forEach(function (d) {
      const s = sheets[d.sheet]; if (!s || d.x == null) return;
      s.x0 = Math.min(s.x0, d.x - 60); s.y0 = Math.min(s.y0, d.y - 70);
      s.x1 = Math.max(s.x1, d.x + d.sym.w + 90); s.y1 = Math.max(s.y1, d.y + d.sym.h + 70);
    });
    design.sheets.forEach(function (s) {
      const b = sheets[s.no];
      s.frame = { x: 60, y: 60, w: Math.max(2100, Math.ceil((b.x1 + 180) / 20) * 20), h: Math.max(2000, Math.ceil((b.y1 + 200) / 20) * 20) };
    });
    return design;
  }

  /* MWESS routing may extend past the device-only frame bounds. Shift routed
   * content into the sheet margin, then resize the frame around wires/devices. */
  function fitRoutedFrames(design) {
    const SAFE = 40, WIRE_PAD = 16, MWESS_BOM_W = 1196, MWESS_BOM_GAP = 90, MWESS_BOM_PAD = 14, bounds = {};
    design.sheets.forEach(function (s) { bounds[s.no] = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; });
    const add = function (sheet, x0, y0, x1, y1, pad) {
      const b = bounds[sheet]; if (!b) return;
      b.x0 = Math.min(b.x0, x0 - pad); b.y0 = Math.min(b.y0, y0 - pad);
      b.x1 = Math.max(b.x1, x1 + pad); b.y1 = Math.max(b.y1, y1 + pad);
    };
    design.devices.forEach(function (d) {
      if (d.x == null) return;
      const dim = devDims(d);
      add(d.sheet, d.x, d.y, d.x + dim.w, d.y + dim.h, 8);
    });
    (design.boxes || []).forEach(function (b) {
      if (b.kind === 'corridor') return;
      add(b.sheet, b.x, b.y, b.x + b.w, b.y + b.h, 4);
    });
    (design.wires || []).forEach(function (w) {
      (w.pts || []).forEach(function (p) { add(w.sheet, p[0], p[1], p[0], p[1], WIRE_PAD); });
    });
    design.sheets.forEach(function (s) {
      const b = bounds[s.no]; if (!Number.isFinite(b.x0)) return;
      const dx0 = Math.max(0, s.frame.x + SAFE - b.x0), dy0 = Math.max(0, s.frame.y + SAFE - b.y0);
      const dx = Math.ceil(dx0 / SNAP) * SNAP, dy = Math.ceil(dy0 / SNAP) * SNAP;
      if (dx || dy) {
        design.devices.forEach(function (d) { if (d.sheet === s.no && d.x != null) { d.x += dx; d.y += dy; } });
        (design.boxes || []).forEach(function (box) { if (box.sheet === s.no) { box.x += dx; box.y += dy; } });
        (design.wires || []).forEach(function (w) { if (w.sheet === s.no) (w.pts || []).forEach(function (p) { p[0] += dx; p[1] += dy; }); });
        (design.hops || []).forEach(function (h) { if (h.sheet === s.no) { h.x += dx; h.y += dy; } });
        (design.junctions || []).forEach(function (j) { if (j.sheet === s.no) { j.x += dx; j.y += dy; } });
      }
      const diagramW = Math.max(s.frame.w, 2100, Math.ceil((b.x1 + dx + SAFE - s.frame.x) / 20) * 20);
      /* frameSVG places the BOM at the frame's right edge. Give MWESS a
       * dedicated right column, starting 90 units beyond the diagram frame. */
      s.frame.w = diagramW + (design.params && design.params.family === 'mwess' ? MWESS_BOM_W + MWESS_BOM_GAP + MWESS_BOM_PAD : 0);
      s.frame.h = Math.max(s.frame.h, 2000, Math.ceil((b.y1 + dy + SAFE + 164 - s.frame.y) / 20) * 20);
    });
    return design;
  }

  function bodyViolationCount(design) {
    const devs = design.devices.filter(function (d) { return d.x != null && !d.sym.isBus && !d.sym.isXref && !d.pwr; }).map(deviceKeepout);
    let n = 0;
    design.wires.forEach(function (w) {
      let bad = false;
      segsOf(w.pts).forEach(function (s) {
        if (bad) return;
        devs.forEach(function (r) { if (r.sheet === w.sheet && bodyHitRect(s, r.core)) bad = true; });
      });
      if (bad) n++;
    });
    return n;
  }
  function fixCrossXrefs(design) {
    let cur = bodyViolationCount(design);
    if (!cur) return 0;
    const xrefs = design.devices.filter(function (d) { return d.xref && d.x != null; });
    for (let xi = 0; xi < xrefs.length && cur > 0; xi++) {
      const xr = xrefs[xi];
      const nets = design.nets.filter(function (n) { return n.a.d === xr.id || n.b.d === xr.id; });
      if (!nets.length) continue;
      const ownWires = design.wires.filter(function (w) { return nets.some(function (n) { return n.id === w.net; }); });
      let bad = false;
      ownWires.forEach(function (w) {
        if (bad) return;
        const devs = design.devices.filter(function (d) { return d.x != null && !d.sym.isBus && !d.sym.isXref && !d.pwr; }).map(deviceKeepout);
        segsOf(w.pts).forEach(function (s) {
          if (bad) return;
          devs.forEach(function (r) { if (r.sheet === w.sheet && bodyHitRect(s, r.core)) bad = true; });
        });
      });
      if (!bad) continue;
      const xp = xr.sym.pins[0];
      if (!xp) continue;
      const others = [];
      nets.forEach(function (n) {
        const ep = n.a.d === xr.id ? n.b : n.a;
        const dv = design.map[ep.d];
        if (dv && !dv.xref) others.push({ dv: dv, p: ep.p });
      });
      if (!others.length) continue;
      const cands = [];
      others.forEach(function (o) {
        const pa = pinAbs(design.map, { d: o.dv.id, p: o.p });
        if (!pa) return;
        [40, 80, 120].forEach(function (off) {
          cands.push({ x: pa.x + off - xp.x, y: pa.y - xp.y });
          cands.push({ x: pa.x - off - xp.x, y: pa.y - xp.y });
          cands.push({ x: pa.x - xp.x, y: pa.y + off - xp.y });
          cands.push({ x: pa.x - xp.x, y: pa.y - off - xp.y });
        });
      });
      const oldWires = JSON.parse(JSON.stringify(design.wires));
      const oldX = xr.x, oldY = xr.y;
      const bb = (design.boxes || []).filter(function (b) { return b.id === xr.id && b.kind === 'xref'; })[0];
      const oldB = bb ? { x: bb.x, y: bb.y } : null;
      for (let ci = 0; ci < cands.length; ci++) {
        const c = cands[ci];
        if (c.x < 60 || c.y < 60) continue;
        xr.x = c.x; xr.y = c.y;
        if (bb) { bb.x = xr.x - 2; bb.y = xr.y - 2; }
        reroute(design, [xr.id]);
        const now = bodyViolationCount(design);
        if (now < cur) { cur = now; break; }
        design.wires = JSON.parse(JSON.stringify(oldWires));
        xr.x = oldX; xr.y = oldY;
        if (bb && oldB) { bb.x = oldB.x; bb.y = oldB.y; }
      }
    }
    return cur;
  }
  function repairLabelCross(design) {
    const devs = design.devices.filter(function (d) { return d.x != null && !d.sym.isBus && !d.sym.isXref && !d.pwr; }).map(deviceKeepout);
    const boxes = (design.boxes || []).filter(function (b) { return b.kind === 'label' || b.kind === 'xref'; }).concat(design.devices.filter(function (d) { return d.x != null && !d.sym.isBus && !d.sym.isXref && !d.pwr; }).map(dashedBand));
    const samePt = function (a, b) { return Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01; };
    const boxHit = function (s, sheet, net) {
      return boxes.filter(function (b) {
        if (b.sheet !== sheet) return false;
        if (net && (b.id === net.a.d || b.id === net.b.d)) return false;
        return bodyHitRect(s, b);
      });
    };
    const bodyBad = function (segs, sheet) {
      for (let i = 0; i < segs.length; i++) for (let j = 0; j < devs.length; j++) if (devs[j].sheet === sheet && bodyHitRect(segs[i], devs[j].core)) return true;
      return false;
    };
    let fixed = 0;
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      design.wires.forEach(function (w) {
        const net = netById(design, w.net);
        for (let i = 0; i + 1 < w.pts.length; i++) {
          const p = w.pts[i], q = w.pts[i + 1];
          if (samePt(p, q)) continue;
          const horiz = Math.abs(p[1] - q[1]) < 0.01;
          const s = horiz ? { v: false, x1: p[0], x2: q[0], y1: p[1], y2: q[1] } : { v: true, x1: p[0], x2: q[0], y1: p[1], y2: q[1] };
          if (!boxHit(s, w.sheet, net).length) continue;
          const cands = [];
          [8, 16, 24, 32, 48, 64, 96].forEach(function (g) {
            if (horiz) { cands.push([[p[0], p[1] + g], [q[0], q[1] + g]]); cands.push([[p[0], p[1] - g], [q[0], q[1] - g]]); }
            else { cands.push([[p[0] + g, p[1]], [q[0] + g, q[1]]]); cands.push([[p[0] - g, p[1]], [q[0] - g, q[1]]]); }
          });
          let done = false;
          for (let ci = 0; ci < cands.length && !done; ci++) {
            const np = w.pts.slice(0, i + 1).concat(cands[ci], w.pts.slice(i + 1));
            const clean = [np[0]];
            for (let k = 1; k < np.length; k++) if (!samePt(np[k], clean[clean.length - 1])) clean.push(np[k]);
            const ss = segsOf(clean);
            let bad = bodyBad(ss, w.sheet);
            for (let k = 0; k < ss.length && !bad; k++) if (boxHit(ss[k], w.sheet, net).length) bad = true;
            if (bad) continue;
            w.pts = clean; w.manual = true; w.via = 'REPAIR-LABEL';
            fixed++; changed = true; done = true;
          }
          if (done) break;
        }
      });
      if (!changed) break;
    }
    return fixed;
  }  function repairBodyCross(design) {
    const devs = design.devices.filter(function (d) { return d.x != null && !d.sym.isBus; }).map(deviceKeepout);
    const hits = function (s, sheet, opt) {
      return devs.filter(function (r) {
        if (r.sheet !== sheet || !bodyHitRect(s, r)) return false;
        if (opt && opt.n && (r.id === opt.n.a.d || r.id === opt.n.b.d) && (opt.k === 0 || opt.k === opt.total - 1) && !bodyHitRect(s, r.core)) return false;
        return true;
      });
    };
    const samePt = function (a, b) { return Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01; };
    let fixed = 0;
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      design.wires.forEach(function (w) {
        for (let i = 0; i + 1 < w.pts.length; i++) {
          const p = w.pts[i], q = w.pts[i + 1];
          if (samePt(p, q)) continue;
          const horiz = Math.abs(p[1] - q[1]) < 0.01;
          const s = horiz
            ? { v: false, x1: p[0], x2: q[0], y1: p[1], y2: q[1] }
            : { v: true, x1: p[0], x2: q[0], y1: p[1], y2: q[1] };
          const crossed = hits(s, w.sheet, { n: netById(design, w.net), k: i, total: w.pts.length - 1 });
          if (!crossed.length) continue;
          const cands = [];
          if (horiz) {
            const top = Math.min.apply(null, crossed.map(function (r) { return r.y; }));
            const bot = Math.max.apply(null, crossed.map(function (r) { return r.y + r.h; }));
            [12, 24, 40, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1280, 1536, 2048].forEach(function (g) {
              [top - g, bot + g].forEach(function (c) {
                cands.push([[p[0], c], [q[0], c]]);
                [0, 12, -12, 24, -24].forEach(function (dx0) {
                  [0, 12, -12, 24, -24].forEach(function (dx1) {
                    if (!dx0 && !dx1) return;
                    cands.push([[p[0], p[1]], [p[0] + dx0, p[1]], [p[0] + dx0, c], [q[0] + dx1, c], [q[0] + dx1, q[1]], [q[0], q[1]]]);
                  });
                });
              });
            });
          } else {
            const left = Math.min.apply(null, crossed.map(function (r) { return r.x; }));
            const right = Math.max.apply(null, crossed.map(function (r) { return r.x + r.w; }));
            [12, 24, 40, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1280, 1536, 2048].forEach(function (g) {
              [left - g, right + g].forEach(function (c) {
                cands.push([[c, p[1]], [c, q[1]]]);
                [0, 12, -12, 24, -24].forEach(function (dy0) {
                  [0, 12, -12, 24, -24].forEach(function (dy1) {
                    if (!dy0 && !dy1) return;
                    cands.push([[p[0], p[1]], [p[0], p[1] + dy0], [c, p[1] + dy0], [c, q[1] + dy1], [q[0], q[1] + dy1], [q[0], q[1]]]);
                  });
                });
              });
            });
          }
          let done = false;
          for (let ci = 0; ci < cands.length && !done; ci++) {
            const np = w.pts.slice(0, i + 1).concat(cands[ci], w.pts.slice(i + 1));
            const clean = [np[0]];
            for (let k = 1; k < np.length; k++) if (!samePt(np[k], clean[clean.length - 1])) clean.push(np[k]);
            const ss = segsOf(clean);
            let bad = false;
            const wn = netById(design, w.net);
            for (let k = 0; k < ss.length && !bad; k++) if (hits(ss[k], w.sheet, { n: wn, k: k, total: ss.length }).length) bad = true;
            if (bad) continue;
            w.pts = clean;
            w.manual = true;
            w.via = 'REPAIR-BODY';
            fixed++; changed = true; done = true;
          }
            if (done) break;
        }
      });
      if (!changed) break;
    }
    design.bodyRepair = fixed;
    return fixed;
  }
  function wireHardClean(design, w) {
    const sg = segsOf(w.pts);
    for (let di = 0; di < design.devices.length; di++) {
      const v = design.devices[di];
      if (v.sheet !== w.sheet || v.x == null || v.sym.isBus || v.sym.isXref || v.pwr) continue;
      const ko = deviceKeepout(v), db = dashedBand(v), dm = devDims(v);
      const ir = { x: v.x - 6, y: v.y - 6, w: dm.w + 12, h: dm.h + 12 };
      for (let i = 0; i < sg.length; i++) {
        const s = sg[i], lead = leadStubSegW(w, s, i, sg.length, design);
        if (!lead && bodyHitRect(s, ko.core)) return false;
        if (!lead) {
          for (let t = 0.08; t <= 0.92; t += 0.08) {
            const x = s.x1 + (s.x2 - s.x1) * t, y = s.y1 + (s.y2 - s.y1) * t;
            if (x > ir.x && x < ir.x + ir.w && y > ir.y && y < ir.y + ir.h) return false;
          }
        }
        const n = netById(design, w.net);
        const own = n && (v.id === n.a.d || v.id === n.b.d);
        const stub = i === 0 || i === sg.length - 1;
        if (own && stub && !bodyHitRect(s, ko.core)) continue;
        if (!bodyHitRect(s, ko.core) && bodyHitRect(s, ko)) return false;
        if (!bodyHitRect(s, db.core) && bodyHitRect(s, db)) return false;
      }
    }
    return true;
  }
  function c02Hits(design) {
    const out = [];
    design.wires.forEach(function (w) {
      const sg = segsOf(w.pts);
      design.devices.forEach(function (v) {
        if (v.sheet !== w.sheet || v.x == null || v.sym.isBus || v.sym.isXref || v.pwr) return;
        const ko = deviceKeepout(v);
        for (let i = 0; i < sg.length; i++) {
          if (leadStubSegW(w, sg[i], i, sg.length, design)) continue;
          if (bodyHitRect(sg[i], ko.core)) { out.push({ wire: w, dev: v, seg: i }); break; }
        }
      });
    });
    return out;
  }
  function c11Hits(design) {
    const out = [];
    design.wires.forEach(function (w) {
      const sg = segsOf(w.pts);
      design.devices.forEach(function (v) {
        if (v.sheet !== w.sheet || v.x == null || v.sym.isBus || v.sym.isXref || v.pwr) return;
        const dm = devDims(v);
        const ir = { x: v.x - 6, y: v.y - 6, w: dm.w + 12, h: dm.h + 12 };
        for (let i = 0; i < sg.length; i++) {
          if (leadStubSegW(w, sg[i], i, sg.length, design)) continue;
          for (let t = 0.08; t <= 0.92; t += 0.08) {
            const x = sg[i].x1 + (sg[i].x2 - sg[i].x1) * t, y = sg[i].y1 + (sg[i].y2 - sg[i].y1) * t;
            if (x > ir.x && x < ir.x + ir.w && y > ir.y && y < ir.y + ir.h) { out.push({ wire: w, dev: v, seg: i }); return; }
          }
        }
      });
    });
    return out;
  }
  function c12Hits(design) {
    const out = [];
    design.wires.forEach(function (w) {
      const n = netById(design, w.net), sg = segsOf(w.pts);
      design.devices.forEach(function (v) {
        if (v.sheet !== w.sheet || v.x == null || v.sym.isBus || v.sym.isXref || v.pwr) return;
        const ko = deviceKeepout(v);
        for (let i = 0; i < sg.length; i++) {
          const own = n && (v.id === n.a.d || v.id === n.b.d);
          const stub = i === 0 || i === sg.length - 1;
          if (own && stub && !bodyHitRect(sg[i], ko.core)) continue;
          if (!bodyHitRect(sg[i], ko.core) && bodyHitRect(sg[i], ko)) { out.push({ wire: w, dev: v, seg: i }); break; }
        }
      });
    });
    return out;
  }
  function c13Hits(design) {
    const out = [];
    design.wires.forEach(function (w) {
      const n = netById(design, w.net);
      const sg = segsOf(w.pts);
      design.devices.forEach(function (v) {
        if (v.sheet !== w.sheet || v.x == null || v.sym.isBus || v.sym.isXref || v.pwr) return;
        const db = dashedBand(v);
        for (let i = 0; i < sg.length; i++) {
          const own = n && (v.id === n.a.d || v.id === n.b.d);
          const stub = i === 0 || i === sg.length - 1;
          if (own && stub && !bodyHitRect(sg[i], db.core)) continue;
          if (!bodyHitRect(sg[i], db.core) && bodyHitRect(sg[i], db)) { out.push({ wire: w, dev: v, seg: i }); break; }
        }
      });
    });
    return out;
  }
  function c14Conflicts(design) {
    const ctrack = {}, out = [], seen = {};
    design.wires.forEach(function (w) {
      segsOf(w.pts).forEach(function (s) {
        const axis = s.v ? 'V' : 'H', coord = s.v ? s.x1 : s.y1;
        const key = w.sheet + '|' + axis + '|' + Math.round(coord * 2);
        (ctrack[key] = ctrack[key] || []).push({ w: w, s: s, axis: axis, coord: coord });
      });
    });
    Object.keys(ctrack).forEach(function (key) {
      const group = ctrack[key];
      for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        if (a.w === b.w || a.w.net === b.w.net || Math.abs(a.coord - b.coord) > 0.5) continue;
        const na = netById(design, a.w.net), nb = netById(design, b.w.net);
        const pk = function (r) { return r ? r.d + ':' + r.p : ''; };
        if (na && nb && (pk(na.a) === pk(nb.a) || pk(na.a) === pk(nb.b) || pk(na.b) === pk(nb.a) || pk(na.b) === pk(nb.b))) continue;
        const ol = a.s.v
          ? Math.min(Math.max(a.s.y1, a.s.y2), Math.max(b.s.y1, b.s.y2)) - Math.max(Math.min(a.s.y1, a.s.y2), Math.min(b.s.y1, b.s.y2))
          : Math.min(Math.max(a.s.x1, a.s.x2), Math.max(b.s.x1, b.s.x2)) - Math.max(Math.min(a.s.x1, a.s.x2), Math.min(b.s.x1, b.s.x2));
        if (ol <= 0.01) continue;
        const ids = [a.w.id, b.w.id].sort();
        const k2 = ids.join('|') + '|' + key;
        if (seen[k2]) continue;
        seen[k2] = 1;
        out.push({ a: a, b: b, ol: ol, axis: a.axis, coord: a.coord });
      }
    });
    return out;
  }
  function nudgeC14(design) {
    if (design.params && design.params.family === 'mwess') return 0;
    let fixed = 0;
    for (let pass = 0; pass < 8; pass++) {
      const before = c14Conflicts(design).length;
      if (!before) break;
      let changed = false;
      const conflicts = c14Conflicts(design);
      for (let ci = 0; ci < conflicts.length && !changed; ci++) {
        const pair = conflicts[ci];
        const candidates = [pair.a, pair.b];
        for (let wi = 0; wi < 2 && !changed; wi++) {
const item = candidates[wi];
          const w = item.w;
          const oldRoutePts = w.pts.map(function (p) { return p.slice(); });
          const oldA = w.a, oldB = w.b, oldManual = w.manual, oldVia = w.via;
          if (rerouteWireHard(design, w)) {
            const afterRoute = c14Conflicts(design).length;
            audit(design);
            const r02 = design.audit.items.filter(function (i) { return i.id === 'C02'; })[0];
            const r11 = design.audit.items.filter(function (i) { return i.id === 'C11'; })[0];
            if (!c13Hits(design).length && !c12Hits(design).length && r02.ok && r11.ok && afterRoute < before) {
              fixed++; changed = true; w.manual = true; w.via = 'C14-REROUTE';
              continue;
            }
            w.pts = oldRoutePts; w.a = oldA; w.b = oldB; w.manual = oldManual; w.via = oldVia;
            crossings(design);
          }
          const sg = segsOf(w.pts);
          let idx = -1;
          for (let k = 0; k < sg.length; k++) {
            if (sg[k].x1 === item.s.x1 && sg[k].y1 === item.s.y1 && sg[k].x2 === item.s.x2 && sg[k].y2 === item.s.y2) { idx = k; break; }
          }
          if (idx <= 0 || idx >= sg.length - 1) continue;
          const prev = sg[idx - 1], next = sg[idx + 1];
          const base = item.axis === 'V' ? item.coord : item.coord;
          if (item.axis === 'V' && (prev.v || next.v)) continue;
          if (item.axis === 'H' && (!prev.v || !next.v)) continue;
          const oldPts = w.pts;
          let accepted = false;
          for (let d = 0; d < 4 && !accepted; d++) {
            const off = (d + 1) * MIN_CLEAR;
            for (let si = 0; si < 2 && !accepted; si++) {
              const nc = base + (si ? off : -off);
              const np = oldPts.map(function (p) { return p.slice(); });
              if (item.axis === 'V') { np[idx][0] = nc; np[idx + 1][0] = nc; }
              else { np[idx][1] = nc; np[idx + 1][1] = nc; }
              const ns = segsOf(np);
              let bad = false;
              for (let k = 0; k < ns.length; k++) if (ns[k].x1 !== ns[k].x2 && ns[k].y1 !== ns[k].y2) { bad = true; break; }
              if (bad) continue;
              w.pts = np;
              const c13 = c13Hits(design).length, c12 = c12Hits(design).length;
              const after = c14Conflicts(design).length;
              audit(design);
              const a02 = design.audit.items.filter(function (i) { return i.id === 'C02'; })[0];
              const a11 = design.audit.items.filter(function (i) { return i.id === 'C11'; })[0];
              if (!c13 && !c12 && a02.ok && a11.ok && after < before) { accepted = true; changed = true; fixed++; w.manual = true; w.via = 'C14-NUDGE'; }
              else w.pts = oldPts;
            }
          }
        }
      }
      if (!changed) break;
    }
    return fixed;
  }

  function nudgeC05(design) {
    if (design.params && design.params.family === 'mwess') return 0;
    audit(design);
    let fixed = 0;
    let before = (design._c05pairs || []).length;
    for (let pass = 0; pass < 10; pass++) {
      if (!before) break;
      let changed = false;
      const pairs = (design._c05pairs || []).slice();
      for (let pi = 0; pi < pairs.length && !changed; pi++) {
        const pair = pairs[pi];
        const items = [pair.a, pair.b];
        for (let wi = 0; wi < 2 && !changed; wi++) {
          const item = items[wi], w = item.w;
          const routeOld = w.pts.map(function (p) { return p.slice(); });
          const routeA = w.a, routeB = w.b, routeManual = w.manual, routeVia = w.via;
          if (rerouteWireHard(design, w)) {
            crossings(design);
            audit(design);
            const rr02 = design.audit.items.filter(function (i) { return i.id === 'C02'; })[0];
            const rr11 = design.audit.items.filter(function (i) { return i.id === 'C11'; })[0];
            const rrCount = (design._c05pairs || []).length;
            if (!c13Hits(design).length && !c12Hits(design).length && !c14Conflicts(design).length && rr02.ok && rr11.ok && rrCount < before) {
              before = rrCount; fixed++; changed = true; w.via = 'C05-REROUTE'; w.manual = true;
              continue;
            }
            w.pts = routeOld; w.a = routeA; w.b = routeB; w.manual = routeManual; w.via = routeVia;
            crossings(design); audit(design);
          }
          const sg = segsOf(w.pts);
          let idx = -1;
          for (let k = 0; k < sg.length; k++) if (sg[k].x1 === item.s.x1 && sg[k].y1 === item.s.y1 && sg[k].x2 === item.s.x2 && sg[k].y2 === item.s.y2) { idx = k; break; }
          if (idx <= 0 || idx >= sg.length - 1) continue;
          const prev = sg[idx - 1], next = sg[idx + 1];
          if (sg[idx].v && (prev.v || next.v)) continue;
          if (!sg[idx].v && (!prev.v || !next.v)) continue;
          const base = sg[idx].v ? sg[idx].x1 : sg[idx].y1;
          const old = w.pts.map(function (p) { return p.slice(); });
          for (let d = 0; d < 3 && !changed; d++) {
            const off = (d + 1) * MIN_CLEAR;
            for (let si = 0; si < 2 && !changed; si++) {
              const nc = base + (si ? off : -off);
              const np = old.map(function (p) { return p.slice(); });
              if (sg[idx].v) { np[idx][0] = nc; np[idx + 1][0] = nc; }
              else { np[idx][1] = nc; np[idx + 1][1] = nc; }
              const ns = segsOf(np);
              let bad = false;
              for (let k = 0; k < ns.length; k++) if (ns[k].x1 !== ns[k].x2 && ns[k].y1 !== ns[k].y2) { bad = true; break; }
              if (bad) continue;
              w.pts = np; w.manual = true;
              crossings(design);
              const c13 = c13Hits(design).length, c12 = c12Hits(design).length, c14 = c14Conflicts(design).length;
              audit(design);
              const a02 = design.audit.items.filter(function (i) { return i.id === 'C02'; })[0];
              const a11 = design.audit.items.filter(function (i) { return i.id === 'C11'; })[0];
              const after = (design._c05pairs || []).length;
              if (!c13 && !c12 && !c14 && a02.ok && a11.ok && after < before) {
                before = after; fixed++; changed = true; w.via = 'C05-NUDGE';
              } else {
                w.pts = old; crossings(design); audit(design);
              }
            }
          }
        }
      }
      if (!changed) break;
    }
    return fixed;
  }
  function rerouteWireHard(design, w) {
    const n = netById(design, w.net); if (!n) return false;
    const M = design.map;
    const A = pinAbs(M, n.a), B = pinAbs(M, n.b);
    if (!A || !B) return false;
    const sheet = w.sheet;
    const obst = [];
    design.devices.forEach(function (d) {
      if (d.sheet !== sheet || d.sym.isBus || d.sym.isXref || d.x == null || d.pwr) return;
      obst.push(deviceKeepout(d));
      obst.push(dashedBand(d));
    });
    const used = newUsed();
    design.wires.forEach(function (q) {
      if (q === w || q.net === w.net || q.sheet !== sheet) return;
      segsOf(q.pts).forEach(function (s) { addUsed(used, s); });
    });
    const soft = (design.soft || {})[sheet] || [];
    A.esc = M[n.a.d] && M[n.a.d].sym.isXref ? 0 : ESC;
    B.esc = M[n.b.d] && M[n.b.d].sym.isXref ? 0 : ESC;
    const old = w.pts;
    const pts = solve(A, B, obst, used, n.a.d, n.b.d, soft, w.cls,
      !!(M[n.a.d].sym.noCross || M[n.b.d].sym.noCross), false);
    if (!pts || pts.length < 2) return false;
    w.pts = pts; w.a = A; w.b = B; w.manual = true; w.via = 'C13-REROUTE';
    crossings(design);
    const bad = c13Hits(design).some(function (h) { return h.wire === w; }) || c12Hits(design).some(function (h) { return h.wire === w; });
    if (bad) { w.pts = old; w.via = 'C13-REROUTE-FAIL'; crossings(design); return false; }
    return true;
  }
  function enforceC13(design) {
    let fixed = 0;
    for (let pass = 0; pass < 4; pass++) {
      const hits = c13Hits(design).concat(c12Hits(design));
      if (!hits.length) break;
      const seen = {};
      let any = false;
      hits.forEach(function (h) {
        if (seen[h.wire.id]) return;
        seen[h.wire.id] = 1;
        if (rerouteWireHard(design, h.wire)) { fixed++; any = true; }
      });
      if (!any) break;
    }
    design.c13Repaired = fixed;
    return c13Hits(design).length;
  }

  function emergencyRoute(design) {
    const failed = design.nets.filter(function (n) { return n.err === 'ROUTE_NO_CLEAR_PATH'; });
    let fixed = 0;
    failed.forEach(function (n) {
      const M = design.map;
      const A = pinAbs(M, n.a), B = pinAbs(M, n.b);
      if (!A || !B || !M[n.a.d] || !M[n.b.d]) return;
      const sheet = M[n.a.d].sheet;
      const obst = [];
      design.devices.forEach(function (d) {
        if (d.sheet !== sheet || d.sym.isBus || d.sym.isXref || d.x == null || d.pwr) return;
        obst.push(deviceKeepout(d));
        obst.push(dashedBand(d));
      });
      const soft = (design.soft || {})[sheet] || [];
      const tried = {};
      let accepted = false;
      for (let ei = 0; ei < 3 && !accepted; ei++) {
        for (let si = 0; si < 2 && !accepted; si++) {
          const A2 = pinAbs(M, n.a), B2 = pinAbs(M, n.b);
          if (!A2 || !B2) continue;
          A2.esc = (M[n.a.d].sym.isXref ? 0 : ESC) + ei * 16;
          B2.esc = (M[n.b.d].sym.isXref ? 0 : ESC) + ei * 16;
          const pts = solve(A2, B2, obst, newUsed(), n.a.d, n.b.d, soft, n.cls,
            !!(M[n.a.d].sym.noCross || M[n.b.d].sym.noCross), !!si);
          if (!pts || pts.length < 2) continue;
          const key = JSON.stringify(pts);
          if (tried[key]) continue;
          tried[key] = 1;
          const w = { id: 'W-' + n.id, net: n.id, cls: n.cls, name: n.name, sheet: sheet, pts: pts, a: A2, b: B2, manual: true, via: 'EMERGENCY-ROUTE' };
          design.wires.push(w);
          const bad = c13Hits(design).some(function (h) { return h.wire === w; }) ||
            c12Hits(design).some(function (h) { return h.wire === w; }) ||
            c02Hits(design).some(function (h) { return h.wire === w; }) ||
            c11Hits(design).some(function (h) { return h.wire === w; });
          if (bad) { design.wires.pop(); continue; }
          n.err = null; n.wire_id = w.id; fixed++; accepted = true;
        }
      }
      if (!accepted) {
        const ys = [];
        const sA = A.d === 'S' ? 1 : A.d === 'N' ? -1 : 1;
        const sB = B.d === 'S' ? 1 : B.d === 'N' ? -1 : -1;
        [8, 16, 24, 40, 80].forEach(function (o) { ys.push(A.y + sA * o, A.y - sA * o); });
        const ybs = [];
        for (let yy = 40; yy <= B.y - 8; yy += 40) ybs.push(yy);
        for (let yy = B.y + 40; yy <= B.y + 600; yy += 40) ybs.push(yy);
        [8, 16, 24, 40, 80, 120, 160, 200].forEach(function (o) { ybs.push(B.y + sB * o); });
        const xls = [];
        for (let off = 40; off <= 360; off += 8) { xls.push(A.x + off); xls.push(A.x - off); xls.push(B.x + off); xls.push(B.x - off); }
        for (let yi = 0; yi < ys.length && !accepted; yi++) {
          for (let bi = 0; bi < ybs.length && !accepted; bi++) {
            for (let xi = 0; xi < xls.length && !accepted; xi++) {
              if (xls[xi] < 20 || ys[yi] === ybs[bi]) continue;
              const raw = [[A.x, A.y], [A.x, ys[yi]], [xls[xi], ys[yi]], [xls[xi], ybs[bi]], [B.x, ybs[bi]], [B.x, B.y]];
              const pts = [];
              raw.forEach(function (p) { if (!pts.length || pts[pts.length - 1][0] !== p[0] || pts[pts.length - 1][1] !== p[1]) pts.push(p); });
              const w2 = { id: 'W-' + n.id, net: n.id, cls: n.cls, name: n.name, sheet: sheet, pts: pts, a: A, b: B, manual: true, via: 'EMERGENCY-CHANNEL' };
              if (!wireHardClean(design, w2)) continue;
              design.wires.push(w2); n.err = null; n.wire_id = w2.id; fixed++; accepted = true;
            }
          }
        }
      }
    });
    if (fixed) crossings(design);
    design.emergencyRouted = fixed;
    return fixed;
  }

  function fixXrefOverlap(design) {
    if (design.params && design.params.family === 'mwess') return 0;
    const xrefs = design.devices.filter(function (d) { return d.xref && d.x != null; });
    const bodies = design.devices.filter(function (d) { return d.x != null && !d.sym.isXref && !d.sym.isBus && !d.pwr; });
    let fixed = 0;
    xrefs.forEach(function (xr) {
      const dm = devDims(xr);
      const box = (design.boxes || []).filter(function (b) { return b.id === xr.id && b.kind === 'xref'; })[0];
      if (!box) return;
      const r = { x: box.x, y: box.y, w: box.w, h: box.h };
      const hit = bodies.some(function (d) { return d.sheet === xr.sheet && overlap(r, { x: d.x - 2, y: d.y - 2, w: devDims(d).w + 4, h: devDims(d).h + 4 }); });
      if (!hit) return;
      const parent = xr.attach && design.map[xr.attach.d];
      if (!parent || parent.x == null) return;
      const pw = devDims(parent).w, py = parent.y, px = parent.x;
      const cands = [];
      [34, 40, 20, 60, 80, 100, 120, 160, 200].forEach(function (off) {
        cands.push([px - dm.w - off, py]);
        cands.push([px + pw + off, py]);
        cands.push([px, py - dm.h - off]);
        cands.push([px, py + devDims(parent).h + off]);
      });
      const oldWires = JSON.parse(JSON.stringify(design.wires));
      const oldX = xr.x, oldY = xr.y, oldBX = box.x, oldBY = box.y;
      for (let ci = 0; ci < cands.length; ci++) {
        const x = Math.round(cands[ci][0]), y = Math.round(cands[ci][1]);
        if (x < 20 || y < 20) continue;
        xr.x = x; xr.y = y; box.x = x - 2; box.y = y - 2;
        design.wires.forEach(function (w) {
          const n = netById(design, w.net);
          if (n && (n.a.d === xr.id || n.b.d === xr.id)) w.manual = false;
        });
        reroute(design, [xr.id]);
        crossings(design);
        audit(design);
        if (!design.audit.blocking.length) { fixed++; return; }
        design.wires = JSON.parse(JSON.stringify(oldWires));
        xr.x = oldX; xr.y = oldY; box.x = oldBX; box.y = oldBY;
        crossings(design);
      }
      audit(design);
    });
    return fixed;
  }

  function generate(params) {
    let d;
    const report = function (text) { if (typeof globalThis !== 'undefined' && typeof globalThis.__EVSE_PROGRESS === 'function') globalThis.__EVSE_PROGRESS(String(text)); };
    if (params && params.family === 'mwess') {
      /* 兆瓦储能：build 自带器件坐标（绕开 place() 硬编码坐标表），布线/清理/审计复用下方共享管线 */
      report('正在生成器件与引脚级网表');
      d = window.EVSE_MWESS.build(params);
      d.map = {}; d.devices.forEach(function (q) { d.map[q.id] = q; }); /* route/audit 依赖 design.map */
      d.hops = d.hops || []; d.junctions = d.junctions || []; d.boxes = d.boxes || [];
      frameAll(d);
      /* 大型储能图按功率、辅助、安全、控制、通信次序布线；失败路径不穿器件兜底，分轮推挤后再统一审计。 */
      report('正在计算大图正交布线路径');
      route(d);
      if (window.EVSE_LABELFIX) window.EVSE_LABELFIX.run(d);
      snapEnds(d); forceOrtho(d); crossings(d);
      separate(d, 4);
      /* 储能页含成对母线引线与高扇出控制节点，多轮分轨可继续推开短段拥挤。 */
      snapEnds(d); forceOrtho(d); separate(d, 8);
      if (window.EVSE_LABELFIX) window.EVSE_LABELFIX.run(d);
      /* MWESS 也走同一套净空与跨页符避让 oracle：只做通道分离不足以
       * 保证引线离开器件边框或标签框；每次局部推线须经过 DRC Pareto 检查。 */
      audit(d);
      fixC08(d);
      fixClear8(d);
      if (window.EVSE_LABELFIX) window.EVSE_LABELFIX.run(d);
      snapEnds(d); forceOrtho(d); fitRoutedFrames(d); crossings(d); fixCrossXrefs(d); fixC08(d); repairLabelCross(d); repairBodyCross(d); enforceC13(d); nudgeC14(d); crossings(d); nudgeC14(d); emergencyRoute(d); enforceC13(d); audit(d);
      report('正在完成禁布区、重叠与 ERC/DRC 审计');
      if (window.EVSE_GEO) window.EVSE_GEO.lastDesign = d;
      return d;
    } else {
      report('正在生成器件与引脚级网表');
      d = window.EVSE_CORE.build(params);
      place(d);
    }
    /* L1-P9: hubAlign 已移除——A1/A5 的跟随符全部为 XR/PF（自带 LAT 避让摆放），hubAlign 强行按引脚 19px 排布导致跨页符框重叠（box 高 22），且移动后不刷新 boxes 造成 C08 虚报 */
    report('正在计算正交布线路径与推挤通道');
    route(d); separate(d, 8);
    if (window.EVSE_LABELFIX) window.EVSE_LABELFIX.run(d);
    snapEnds(d); forceOrtho(d); healReroute(d); forceOrtho(d);
    if (window.EVSE_LABELFIX) window.EVSE_LABELFIX.run(d); /* v2.24: heal 后二次避让 */
    detouch(d); snapEnds(d); forceOrtho(d);
    untangleOwn(d); /* V7-UNTANGLE: 接触器顶引脚→KF 侧引脚的穿自身体网络改标准 Z 径 */
    clearFixXref(d); /* L1-P21: 穿框段正交绕行（仅端点出框可修） */
    crossings(d);
    deSpike(d); /* V11: 清折返尖刺 */
    separate(d, 3); snapEnds(d); forceOrtho(d); /* V11: 终局平行间距收敛 */
    crossings(d);
    fixC05(d); /* V11: 审计驱动最终修正 */
    deSpike(d); /* V12b: 清 oracle 引入的共线冗余/折返 */
    if (window.EVSE_LABELFIX) window.EVSE_LABELFIX.run(d); /* V12: 终局文字避让（消 C08） */
    fixC08(d); /* V12: 路由后 xref 让位 oracle */
    deSpike(d); /* V12b */
    if (window.EVSE_LABELFIX) window.EVSE_LABELFIX.run(d); /* V12: 对最终走线再避一次文字 */
    fixPinTransit(d); /* V12b: 线穿他网 pin 电点 → lateral 避让 */
    deSpike(d);
    separate(d, 2); snapEnds(d); forceOrtho(d); /* V12d: 平行间距收敛前置 */
    fixClear8(d); /* V12d: 线-器件外框 ≥8px 避让 oracle */
    deSpike(d);
    fixCrossXrefs(d);
    fixC08(d);
    repairLabelCross(d);
    repairBodyCross(d);
    enforceC13(d);
    d.c14Nudged = nudgeC14(d);
    crossings(d);
    d.c14Nudged += nudgeC14(d);
    crossings(d);
    d.c05Nudged = nudgeC05(d);
    crossings(d);
    d.xrefFixed = fixXrefOverlap(d);
    d.emergencyRouted = emergencyRoute(d);
    report('正在完成禁布区、重叠与 ERC/DRC 审计');
    crossings(d); audit(d);
    if (window.EVSE_GEO) window.EVSE_GEO.lastDesign = d; /* V5-EX1: 导出模块取当前方案 */
    return d;
  }

  return { MIN_CLEAR, ESC, SNAP, place, route, separate, snapEnds, forceOrtho, crossings, detouch, reroute, rerouteDevice, hubAlign, dragSegment, dragJunction, audit, generate, repairBodyCross, segsOf, pinAbs, pinOf, rotateDev: function (design, id) { const d = design.map[id]; if (!d) return false; d.rot = ((d.rot || 0) + 90) % 360; return true; }, devDims: devDims, RUBRIC, textBands, overlap, labelBandOf: labelBand, hitRectOf: function (s, b) { return hitRect(s, { x: b.x, y: b.y, w: b.w, h: b.h }); } };
})();
