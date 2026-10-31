/* ============================================================
 * EVSE-SCHEMATIC EXPORT v1.0 —— DXF 2000 / CSV / 打印 PDF 导出
 *   exportDXF(design):   DXF 2000 文本（符号基元/走线/跨越/结点/文字/图层）
 *   exportCSV(design):   网表 CSV（网络、端点、位号、名称）
 *   exportBOMCSV():      BOM 导出（复用 EVSE_BOM 数据）
 *   printPDF():          window.print() 打印为 PDF
 * 依赖：window.EVSE_GEO（route 后的 design）、window.EVSE_BOM
 * 挂载：window.EVSE_EXPORT
 * ============================================================ */
window.EVSE_EXPORT = (function () {
  'use strict';

  const LAYER = {
    AC: 'AC', DC: 'DC', ESS: 'ESS', AUX: 'AUX', CTL: 'CTL',
    COMM: 'COMM', PE: 'PE', SAF: 'SAF', SYM: 'SYM', TXT: 'TXT'
  };
  const LW = { AC: 0.35, DC: 0.6, ESS: 0.5, AUX: 0.25, CTL: 0.25, COMM: 0.25, PE: 0.5, SAF: 0.35 };

  /* ---------- DXF R12 writer ---------- */
  function dxfPair(code, val) { return code + '\n' + val + '\n'; }

  function dbl(n) { return (Math.round(n * 100) / 100).toString(); }

  function dxfEncodeText(text) {
    return String(text || '').replace(/[\u0080-\uFFFF]/g, function (ch) {
      const n = ch.charCodeAt(0).toString(16).toUpperCase();
      return '\\U+' + ('0000' + n).slice(-4);
    });
  }

  function dxfText(x, y, text, layer, h, align, angle) {
    const hh = h || 2.5;
    const al = align === 'm' ? 1 : align === 'e' ? 2 : 0;
    return dxfPair(0, 'TEXT') +
      dxfPair(8, LAYER[layer] || 'TXT') +
      dxfPair(10, dbl(x)) + dxfPair(20, dbl(-y)) + dxfPair(30, '0') +
      dxfPair(40, dbl(hh)) +
      dxfPair(1, dxfEncodeText(text)) +
      dxfPair(50, dbl(angle || 0)) + dxfPair(72, String(al)) + dxfPair(73, '0') +
      (al ? dxfPair(11, dbl(x)) + dxfPair(21, dbl(-y)) + dxfPair(31, '0') : '');
  }

  function dxfLine(x1, y1, x2, y2, layer, lw, ltype) {
    return dxfPair(0, 'LINE') +
      dxfPair(8, LAYER[layer] || 'SYM') +
      (ltype ? dxfPair(6, ltype) : '') +
      dxfPair(62, '7') +
      dxfPair(10, dbl(x1)) + dxfPair(20, dbl(-y1)) + dxfPair(30, '0') +
      dxfPair(11, dbl(x2)) + dxfPair(21, dbl(-y2)) + dxfPair(31, '0') +
      (lw ? dxfPair(370, dbl(lw * 100)) : '');
  }

  function dxfCircle(cx, cy, r, layer) {
    return dxfPair(0, 'CIRCLE') +
      dxfPair(8, LAYER[layer] || 'SYM') +
      dxfPair(10, dbl(cx)) + dxfPair(20, dbl(-cy)) + dxfPair(30, '0') +
      dxfPair(40, dbl(r));
  }

  function dxfArc(cx, cy, r, a0, a1, layer) {
    return dxfPair(0, 'ARC') +
      dxfPair(8, LAYER[layer] || 'SYM') +
      dxfPair(10, dbl(cx)) + dxfPair(20, dbl(-cy)) + dxfPair(30, '0') +
      dxfPair(40, dbl(r)) +
      dxfPair(50, dbl(a0)) + dxfPair(51, dbl(a1));
  }

  function dxfSolidTriangle(a, b, c, layer) {
    return dxfPair(0, 'SOLID') + dxfPair(8, LAYER[layer] || 'SYM') +
      dxfPair(10, dbl(a.x)) + dxfPair(20, dbl(-a.y)) + dxfPair(30, '0') +
      dxfPair(11, dbl(b.x)) + dxfPair(21, dbl(-b.y)) + dxfPair(31, '0') +
      dxfPair(12, dbl(c.x)) + dxfPair(22, dbl(-c.y)) + dxfPair(32, '0') +
      dxfPair(13, dbl(c.x)) + dxfPair(23, dbl(-c.y)) + dxfPair(33, '0');
  }

  function pathLines(path) {
    if (typeof document !== 'undefined' && document.createElementNS) {
      try {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        el.setAttribute('d', String(path || ''));
        const len = el.getTotalLength(), pts = [];
        for (let d = 0; d <= len; d += 2) { const p = el.getPointAtLength(d); pts.push([p.x, p.y]); }
        const end = el.getPointAtLength(len); pts.push([end.x, end.y]);
        return pts.length > 1 ? [pts] : [];
      } catch (e) {}
    }
    const tokens = String(path || '').match(/[MmLlHhVvQqCcAaZz]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || [];
    const lines = []; let pts = [], x = 0, y = 0, sx = 0, sy = 0, i = 0, cmd = '';
    const number = function () { return Number(tokens[i++]); };
    const push = function (px, py) { x = px; y = py; pts.push([x, y]); };
    const endPath = function () { if (pts.length > 1) lines.push(pts); pts = []; };
    while (i < tokens.length) {
      if (/^[a-z]$/i.test(tokens[i])) cmd = tokens[i++];
      if (!cmd) break;
      const rel = cmd === cmd.toLowerCase(), up = cmd.toUpperCase();
      if (up === 'Z') { if (pts.length) { pts.push([sx, sy]); endPath(); x = sx; y = sy; } cmd = ''; continue; }
      if (up === 'M' || up === 'L') {
        if (i + 1 >= tokens.length) break;
        const nx = number(), ny = number(), px = rel ? x + nx : nx, py = rel ? y + ny : ny;
        if (up === 'M') { endPath(); push(px, py); sx = x; sy = y; cmd = rel ? 'l' : 'L'; } else push(px, py);
      } else if (up === 'H') { const nx = number(); push(rel ? x + nx : nx, y); }
      else if (up === 'V') { const ny = number(); push(x, rel ? y + ny : ny); }
      else if (up === 'Q') {
        if (i + 3 >= tokens.length) break;
        let cx = number(), cy = number(), nx = number(), ny = number();
        if (rel) { cx += x; cy += y; nx += x; ny += y; }
        const x0 = x, y0 = y;
        for (let k = 1; k <= 10; k++) { const t = k / 10, mt = 1 - t; pts.push([mt * mt * x0 + 2 * mt * t * cx + t * t * nx, mt * mt * y0 + 2 * mt * t * cy + t * t * ny]); }
        x = nx; y = ny;
      } else if (up === 'C') {
        if (i + 5 >= tokens.length) break;
        let c1x = number(), c1y = number(), c2x = number(), c2y = number(), nx = number(), ny = number();
        if (rel) { c1x += x; c1y += y; c2x += x; c2y += y; nx += x; ny += y; }
        const x0 = x, y0 = y;
        for (let k = 1; k <= 12; k++) { const t = k / 12, mt = 1 - t; pts.push([mt * mt * mt * x0 + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * nx, mt * mt * mt * y0 + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * ny]); }
        x = nx; y = ny;
      } else if (up === 'A') {
        if (i + 6 >= tokens.length) break;
        const rx0 = Math.abs(number()), ry0 = Math.abs(number()), phi = number() * Math.PI / 180, large = number() ? 1 : 0, sweep = number() ? 1 : 0;
        let nx = number(), ny = number(); if (rel) { nx += x; ny += y; }
        if (!rx0 || !ry0 || (Math.abs(nx - x) < 1e-9 && Math.abs(ny - y) < 1e-9)) push(nx, ny);
        else {
          const cp = Math.cos(phi), sp = Math.sin(phi), dx = (x - nx) / 2, dy = (y - ny) / 2;
          const xp = cp * dx + sp * dy, yp = -sp * dx + cp * dy;
          let rx = rx0, ry = ry0, lam = xp * xp / (rx * rx) + yp * yp / (ry * ry);
          if (lam > 1) { const m = Math.sqrt(lam); rx *= m; ry *= m; }
          const den = rx * rx * yp * yp + ry * ry * xp * xp;
          const num = Math.max(0, rx * rx * ry * ry - den);
          const sign = large === sweep ? -1 : 1, coef = den ? sign * Math.sqrt(num / den) : 0;
          const cxp = coef * rx * yp / ry, cyp = coef * -ry * xp / rx;
          const cx = cp * cxp - sp * cyp + (x + nx) / 2, cy = sp * cxp + cp * cyp + (y + ny) / 2;
          const angle = function (ux, uy, vx, vy) { const dot = ux * vx + uy * vy, det = ux * vy - uy * vx; return Math.atan2(det, dot); };
          const ux = (xp - cxp) / rx, uy = (yp - cyp) / ry, vx = (-xp - cxp) / rx, vy = (-yp - cyp) / ry;
          let a0 = Math.atan2(uy, ux), da = angle(ux, uy, vx, vy);
          if (!sweep && da > 0) da -= Math.PI * 2; if (sweep && da < 0) da += Math.PI * 2;
          const steps = Math.max(4, Math.ceil(Math.abs(da) / (Math.PI / 12)));
          for (let k = 1; k <= steps; k++) { const a = a0 + da * k / steps, ex = rx * Math.cos(a), ey = ry * Math.sin(a); pts.push([cx + cp * ex - sp * ey, cy + sp * ex + cp * ey]); }
          x = nx; y = ny;
        }
      } else break;
    }
    endPath();
    return lines;
  }

  function transformLocal(d, x, y) {
    const rot = ((d.rot || 0) % 360) * Math.PI / 180;
    if (!rot) return { x: d.x + x, y: d.y + y };
    const cx = d.sym.w / 2, cy = d.sym.h / 2, dx = x - cx, dy = y - cy;
    return { x: d.x + cx + dx * Math.cos(rot) - dy * Math.sin(rot), y: d.y + cy + dx * Math.sin(rot) + dy * Math.cos(rot) };
  }

  function lineOutsideMasks(x1, y1, x2, y2, masks) {
    const vertical = Math.abs(x1 - x2) < 1e-6, horizontal = Math.abs(y1 - y2) < 1e-6;
    if (!vertical && !horizontal) return [[x1, y1, x2, y2]];
    const lo = vertical ? Math.min(y1, y2) : Math.min(x1, x2), hi = vertical ? Math.max(y1, y2) : Math.max(x1, x2);
    const coord = vertical ? x1 : y1, cuts = [];
    (masks || []).forEach(function (m) {
      const hit = vertical ? coord >= m[1] && coord <= m[1] + m[3] : coord >= m[2] && coord <= m[2] + m[4];
      if (!hit) return;
      const a = vertical ? m[2] : m[1], b = a + (vertical ? m[4] : m[3]);
      if (b > lo && a < hi) cuts.push([Math.max(lo, a), Math.min(hi, b)]);
    });
    cuts.sort(function (a, b) { return a[0] - b[0]; });
    const merged = [];
    cuts.forEach(function (c) { const last = merged[merged.length - 1]; if (last && c[0] <= last[1]) last[1] = Math.max(last[1], c[1]); else merged.push(c.slice()); });
    const spans = []; let at = lo;
    merged.forEach(function (c) { if (c[0] > at) spans.push([at, c[0]]); at = Math.max(at, c[1]); });
    if (at < hi) spans.push([at, hi]);
    return spans.map(function (sp) { return vertical ? [x1, y1 <= y2 ? sp[0] : sp[1], x1, y1 <= y2 ? sp[1] : sp[0]] : [y1 <= y2 ? sp[0] : sp[1], y1, y1 <= y2 ? sp[1] : sp[0], y1]; });
  }

  function emitSymbol(out, d, scale) {
    const draw = d.sym.draw || [], masks = draw.filter(function (g) { return g[0] === 'M'; });
    const pt = function (x, y) { const p = transformLocal(d, x, y); return { x: p.x * scale, y: p.y * scale }; };
    const line = function (x1, y1, x2, y2, lw, dashed) {
      lineOutsideMasks(x1, y1, x2, y2, masks).forEach(function (seg) {
        const a = pt(seg[0], seg[1]), b = pt(seg[2], seg[3]);
        out += dxfLine(a.x, a.y, b.x, b.y, 'SYM', (lw || 0.9) * scale, dashed ? 'DASHED' : null);
      });
    };
    draw.forEach(function (g) {
      const t = g[0];
      if (t === 'M') return;
      if (t === 'L' || t === 'D') { line(g[1], g[2], g[3], g[4], g[5] || (t === 'D' ? 0.7 : 0.9), t === 'D'); return; }
      if (t === 'R') { const x = g[1], y = g[2], w = g[3], h = g[4]; line(x, y, x + w, y, 0.9); line(x + w, y, x + w, y + h, 0.9); line(x + w, y + h, x, y + h, 0.9); line(x, y + h, x, y, 0.9); return; }
      if (t === 'C' || t === 'CF') {
        const c = pt(g[1], g[2]), r = g[3] * scale;
        if (t === 'C') out += dxfCircle(c.x, c.y, r, 'SYM');
        else { const n = 16; for (let i = 0; i < n; i++) { const a0 = i * Math.PI * 2 / n, a1 = (i + 1) * Math.PI * 2 / n; out += dxfSolidTriangle(c, { x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) }, { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) }, 'SYM'); } }
        return;
      }
      if (t === 'A') {
        const pts = [], step = Math.max(2, Math.ceil(Math.abs(g[5] - g[4]) / 12));
        for (let i = 0; i <= step; i++) { const a = (g[4] + (g[5] - g[4]) * i / step) * Math.PI / 180; pts.push([g[1] + g[3] * Math.cos(a), g[2] + g[3] * Math.sin(a)]); }
        for (let i = 0; i < pts.length - 1; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0.9); return;
      }
      if (t === 'P') {
        pathLines(g[1]).forEach(function (path) { for (let i = 0; i < path.length - 1; i++) line(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], 0.9); }); return;
      }
      if (t === 'T') {
        const p = pt(g[1], g[2]), angle = -((d.rot || 0) % 360);
        out += dxfText(p.x, p.y, g[3], 'TXT', (g[4] || 7) * scale, g[5], angle);
      }
    });
    (d.sym.pins || []).forEach(function (p) {
      if (!p.len) return;
      const dx = p.d === 'E' ? -p.len : p.d === 'W' ? p.len : 0, dy = p.d === 'S' ? -p.len : p.d === 'N' ? p.len : 0;
      line(p.x, p.y, p.x + dx, p.y + dy, 0.9);
    });
    return out;
  }

  function exportDXF(design, opts) {
    const o = opts || {};
    const scale = o.scale == null ? 0.25 : o.scale; /* 画布 4 单位 = 1 mm；保持 ISO A 系列页面物理尺寸 */
    const sheetNo = o.sheet == null ? (design.sheets && design.sheets[0] && design.sheets[0].no) : Number(o.sheet);
    const sheet = (design.sheets || []).filter(function (s) { return s.no === sheetNo; })[0] || null;
    const s = (n) => n * scale;
    let out = '';
    out += dxfPair(0, 'SECTION') + dxfPair(2, 'HEADER') + dxfPair(9, '$ACADVER') + dxfPair(1, 'AC1015') + dxfPair(9, '$INSUNITS') + dxfPair(70, '4') + dxfPair(9, '$MEASUREMENT') + dxfPair(70, '1') + dxfPair(9, '$LWDISPLAY') + dxfPair(290, '1') + dxfPair(0, 'ENDSEC');
    out += dxfPair(0, 'SECTION') + dxfPair(2, 'TABLES') +
      dxfPair(0, 'TABLE') + dxfPair(2, 'LTYPE') + dxfPair(70, '3') +
      dxfPair(0, 'LTYPE') + dxfPair(2, 'CONTINUOUS') + dxfPair(70, '0') + dxfPair(3, 'Solid line') + dxfPair(72, '65') + dxfPair(73, '0') + dxfPair(40, '0') +
      dxfPair(0, 'LTYPE') + dxfPair(2, 'DASHED') + dxfPair(70, '0') + dxfPair(3, 'Dashed __ __') + dxfPair(72, '65') + dxfPair(73, '2') + dxfPair(40, '6.35') + dxfPair(49, '3.175') + dxfPair(49, '-3.175') +
      dxfPair(0, 'LTYPE') + dxfPair(2, 'DOT') + dxfPair(70, '0') + dxfPair(3, 'Dot . . .') + dxfPair(72, '65') + dxfPair(73, '2') + dxfPair(40, '6.35') + dxfPair(49, '0') + dxfPair(49, '-6.35') +
      dxfPair(0, 'ENDTAB') +
      dxfPair(0, 'TABLE') + dxfPair(2, 'STYLE') + dxfPair(70, '1') +
      dxfPair(0, 'STYLE') + dxfPair(2, 'STANDARD') + dxfPair(70, '0') + dxfPair(40, '0') + dxfPair(41, '1') + dxfPair(50, '0') + dxfPair(71, '0') + dxfPair(42, '2.5') + dxfPair(3, 'txt') + dxfPair(4, '') +
      dxfPair(0, 'ENDTAB') +
      dxfPair(0, 'TABLE') + dxfPair(2, 'LAYER') + dxfPair(70, String(Object.keys(LAYER).length)) +
      Object.keys(LAYER).map(function (k) {
        const c = { AC: '6', DC: '1', ESS: '3', AUX: '2', CTL: '4', COMM: '5', PE: '3', SAF: '1', SYM: '7', TXT: '7' }[k] || '7';
        return dxfPair(0, 'LAYER') + dxfPair(2, LAYER[k]) + dxfPair(70, '0') + dxfPair(62, c) + dxfPair(6, 'CONTINUOUS');
      }).join('') +
      dxfPair(0, 'ENDTAB') +
      dxfPair(0, 'ENDSEC');
    out += dxfPair(0, 'SECTION') + dxfPair(2, 'ENTITIES');
    /* 图框与标题栏：每次导出当前页，避免多页坐标重叠。 */
    if (sheet && sheet.frame) {
      const f = sheet.frame, x = s(f.x), y = s(f.y), w = s(f.w), h = s(f.h);
      out += dxfLine(x, y, x + w, y, 'TXT', 0.35) + dxfLine(x + w, y, x + w, y + h, 'TXT', 0.35) + dxfLine(x + w, y + h, x, y + h, 'TXT', 0.35) + dxfLine(x, y + h, x, y, 'TXT', 0.35);
      const bx = x + w - s(420), by = y + h - s(150), bw = s(420), bh = s(150);
      out += dxfLine(bx, by, bx + bw, by, 'TXT', 0.25) + dxfLine(bx + bw, by, bx + bw, by + bh, 'TXT', 0.25) + dxfLine(bx + bw, by + bh, bx, by + bh, 'TXT', 0.25) + dxfLine(bx, by + bh, bx, by, 'TXT', 0.25);
      out += dxfLine(bx, by + s(42), bx + bw, by + s(42), 'TXT', 0.18) + dxfLine(bx, by + s(82), bx + bw, by + s(82), 'TXT', 0.18);
      out += dxfText(bx + s(8), by + s(24), 'EVSE / BESS 原理图 · 概念方案', 'TXT', s(18));
      out += dxfText(bx + s(8), by + s(65), '图页 ' + sheetNo + '  ' + (sheet.title || ''), 'TXT', s(12));
      out += dxfText(bx + s(8), by + s(105), '状态 ' + (design.status || 'UNKNOWN') + '  审计 ' + (design.audit ? design.audit.status : 'UNKNOWN') + ' / ' + (design.audit ? design.audit.grade : '—'), 'TXT', s(10));
      out += dxfText(x + s(8), y + s(22), '单位：mm  比例：1:1  ·  图形几何按 0.25 mm/画布单位导出', 'TXT', s(9));
    }
    const devices = (design.devices || []).filter(function (d) { return d.x != null && (sheetNo == null || d.sheet === sheetNo); });
    devices.forEach(function (d) {
      out = emitSymbol(out, d, scale);
      const tagAt = d.sym.tagAt;
      if (d.tag && tagAt) {
        const off = d.tagOff || { dx: 0, dy: 0 }, p = transformLocal(d, tagAt.x + off.dx, tagAt.y + off.dy);
        out += dxfText(s(p.x), s(p.y), d.tag, 'TXT', s(11), tagAt.a, -(d.rot || 0));
        if (d.name) { const q = transformLocal(d, tagAt.x + off.dx, tagAt.y + off.dy + 10); out += dxfText(s(q.x), s(q.y), d.name, 'TXT', s(8), tagAt.a, -(d.rot || 0)); }
        if (d.spec) { const q = transformLocal(d, tagAt.x + off.dx, tagAt.y + off.dy + 19); out += dxfText(s(q.x), s(q.y), d.spec, 'TXT', s(7), tagAt.a, -(d.rot || 0)); }
      }
      (d.sym.pins || []).forEach(function (p) {
        const px = p.d === 'E' ? 6 : p.d === 'W' ? -6 : 4;
        const py = p.d === 'N' ? -3 : p.d === 'S' ? 7 : -4;
        const pos = transformLocal(d, p.x + px, p.y + py);
        if (p.n) out += dxfText(s(pos.x), s(pos.y), p.n, 'TXT', s(5.6), 's', -(d.rot || 0));
        if (d.sym.nameIn && p.name) {
          const namePos = transformLocal(d, p.d === 'N' || p.d === 'S' ? p.x : p.x + (p.d === 'W' ? -p.len - 5 : p.len + 5), p.d === 'N' ? p.y - 27 : p.d === 'S' ? p.y + 33 : p.y + 2.4);
          out += dxfText(s(namePos.x), s(namePos.y), p.name, 'TXT', s(6.8), p.d === 'W' ? 's' : p.d === 'E' ? 'e' : 'm', -(d.rot || 0));
        }
      });
    });
    /* 走线（按能量域分层 + 线宽） */
    (design.wires || []).filter(function (w) { return sheetNo == null || w.sheet === sheetNo; }).forEach(function (w) {
      const layer = LAYER[w.cls] || 'SYM';
      const lw = LW[w.cls] || 0.25;
      segsOfLocal(w.pts).forEach(function (sg) {
        out += dxfLine(s(sg.x1), s(sg.y1), s(sg.x2), s(sg.y2), layer, lw);
      });
    });
    /* 跨越半圆 → ARC（凸侧朝 x 正方向） */
    (design.hops || []).filter(function (h) { return sheetNo == null || h.sheet === sheetNo; }).forEach(function (h) {
      const r = s(h.r || 4.5), cx = s(h.cx != null ? h.cx : (h.x || 0)), cy = s(h.cy != null ? h.cy : (h.y || 0));
      const a0 = h.a0 != null ? h.a0 : 0, a1 = h.a1 != null ? h.a1 : 180;
      out += dxfArc(cx, cy, r, (360 - a1 + 360) % 360, (360 - a0 + 360) % 360, 'SYM');
    });
    /* 结点 → 实心圆（半径 1.2） */
    (design.junctions || []).filter(function (j) { return sheetNo == null || j.sheet === sheetNo; }).forEach(function (j) {
      const c = { x: s(j.x), y: s(j.y) }, r = s(1.6), n = 16;
      for (let i = 0; i < n; i++) { const a0 = i * Math.PI * 2 / n, a1 = (i + 1) * Math.PI * 2 / n; out += dxfSolidTriangle(c, { x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) }, { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) }, 'SYM'); }
    });
    out += dxfPair(0, 'ENDSEC') + dxfPair(0, 'EOF');
    return out;
  }

  function segsOfLocal(pts) {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      segs.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
    }
    return segs;
  }

  /* ---------- CSV 网表 ---------- */
  function csvEsc(v) { const s2 = String(v == null ? '' : v); return /[",\n]/.test(s2) ? '"' + s2.replace(/"/g, '""') + '"' : s2; }

  function exportCSV(design) {
    const rows = [];
    rows.push(['网络', '类', '端点A器件', '端点A引脚', '端点A名', '端点B器件', '端点B引脚', '端点B名', '名称'].join(','));
    (design.nets || []).forEach(function (n) {
      const da = design.map && design.map[n.a.d], db = design.map && design.map[n.b.d];
      rows.push([csvEsc(n.id), csvEsc(n.cls), csvEsc(n.a.d), csvEsc(n.a.p), csvEsc(da ? da.tag : ''), csvEsc(n.b.d), csvEsc(n.b.p), csvEsc(db ? db.tag : ''), csvEsc(n.name || '')].join(','));
    });
    return rows.join('\n');
  }

  /* ---------- BOM CSV（复用 EVSE_BOM 权威 9 列实现，含参考候选） ---------- */
  function exportBOMCSV() {
    const d = getDesign();
    if (!d) return 'BOM 不可用（请先生成方案）';
    if (window.EVSE_BOM && window.EVSE_BOM.toCSV && window.EVSE_BOM.build) {
      const bom = window.EVSE_BOM.build(d);
      return window.EVSE_BOM.toCSV(bom, d);
    }
    return 'BOM 引擎不可用';
  }

  /* ---------- 下载辅助 ---------- */
  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 50);
  }

  function getDesign() {
    if (typeof window.EVSE_CURRENT_DESIGN === 'function') return window.EVSE_CURRENT_DESIGN();
    const g = window.EVSE_GEO;
    if (!g || !g.lastDesign) return null;
    return g.lastDesign;
  }

  function exportDXFNow() {
    const d = getDesign();
    if (!d) { alert('请先生成方案'); return; }
    if (window.EVSE_EXPORT_GUARD && !window.EVSE_EXPORT_GUARD('DXF')) return;
    const mw = d.params.family === 'mwess';
    const sheet = typeof window.EVSE_CURRENT_SHEET === 'function' ? window.EVSE_CURRENT_SHEET() : (d.sheets[0] && d.sheets[0].no);
    const fn = 'evse-schematic-' + (mw ? 'mwess' : (d.params.std || 'gb')) + '-' + (mw ? ((d.params.gunV || '') + 'V') : ((d.params.kw || '') + 'kW')) + '-sheet' + sheet + '.dxf';
    download(fn, exportDXF(d, { scale: 0.25, sheet: sheet }), 'application/dxf');
  }

  function exportCSVNow() {
    const d = getDesign();
    if (!d) { alert('请先生成方案'); return; }
    if (window.EVSE_EXPORT_GUARD && !window.EVSE_EXPORT_GUARD('CSV 网表')) return;
    download('evse-netlist.csv', exportCSV(d), 'text/csv;charset=utf-8');
  }

  function exportBOMCSVNow() {
    const d = getDesign();
    if (d && window.EVSE_EXPORT_GUARD && !window.EVSE_EXPORT_GUARD('BOM CSV')) return;
    download('evse-bom.csv', exportBOMCSV(), 'text/csv;charset=utf-8');
  }

  function printPDF() {
    const d = getDesign();
    if (!d) { alert('请先生成方案'); return; }
    if (window.EVSE_EXPORT_GUARD && !window.EVSE_EXPORT_GUARD('打印 / PDF')) return;
    window.print();
  }

  return { exportDXF: exportDXF, exportCSV: exportCSV, exportBOMCSV: exportBOMCSV, exportDXFNow: exportDXFNow, exportCSVNow: exportCSVNow, exportBOMCSVNow: exportBOMCSVNow, printPDF: printPDF, getDesign: getDesign };
})();
