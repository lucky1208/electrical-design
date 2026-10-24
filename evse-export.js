/* ============================================================
 * EVSE-SCHEMATIC EXPORT v1.0 —— M2 中期：DXF / CSV / 打印 PDF 导出
 *   exportDXF(design):   DXF R12 文本（线段/圆弧/结点/文字/图层按能量域）
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

  function dxfText(x, y, text, layer, h) {
    const hh = h || 2.5;
    return dxfPair(0, 'TEXT') +
      dxfPair(8, LAYER[layer] || 'TXT') +
      dxfPair(10, dbl(x)) + dxfPair(20, dbl(-y)) + dxfPair(30, '0') +
      dxfPair(40, dbl(hh)) +
      dxfPair(1, text || '') +
      dxfPair(50, '0');
  }

  function dxfLine(x1, y1, x2, y2, layer, lw) {
    return dxfPair(0, 'LINE') +
      dxfPair(8, LAYER[layer] || 'SYM') +
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

  function exportDXF(design, opts) {
    const o = opts || {};
    const scale = o.scale || 1; /* 单位：图面 1 = 输出 mm */
    const s = (n) => n * scale;
    let out = '';
    out += dxfPair(0, 'SECTION') + dxfPair(2, 'HEADER') + dxfPair(9, '$INSUNITS') + dxfPair(70, '4') + dxfPair(0, 'ENDSEC');
    out += dxfPair(0, 'SECTION') + dxfPair(2, 'TABLES') +
      dxfPair(0, 'TABLE') + dxfPair(2, 'LTYPE') + dxfPair(70, '3') +
      dxfPair(0, 'LTYPE') + dxfPair(2, 'CONTINUOUS') + dxfPair(70, '0') + dxfPair(3, 'Solid line') + dxfPair(72, '65') + dxfPair(73, '0') + dxfPair(40, '0') +
      dxfPair(0, 'LTYPE') + dxfPair(2, 'DASHED') + dxfPair(70, '0') + dxfPair(3, 'Dashed __ __') + dxfPair(72, '65') + dxfPair(73, '2') + dxfPair(40, '6.35') + dxfPair(49, '3.175') + dxfPair(49, '-3.175') +
      dxfPair(0, 'LTYPE') + dxfPair(2, 'DOT') + dxfPair(70, '0') + dxfPair(3, 'Dot . . .') + dxfPair(72, '65') + dxfPair(73, '2') + dxfPair(40, '6.35') + dxfPair(49, '0') + dxfPair(49, '-6.35') +
      dxfPair(0, 'ENDTAB') +
      dxfPair(0, 'TABLE') + dxfPair(2, 'LAYER') + dxfPair(70, '8') +
      Object.keys(LAYER).map(function (k) {
        const c = { AC: '6', DC: '1', ESS: '3', AUX: '2', CTL: '4', COMM: '5', PE: '3', SAF: '1', SYM: '7', TXT: '7' }[k] || '7';
        return dxfPair(0, 'LAYER') + dxfPair(2, LAYER[k]) + dxfPair(70, '0') + dxfPair(62, c) + dxfPair(6, 'CONTINUOUS');
      }).join('') +
      dxfPair(0, 'ENDTAB') +
      dxfPair(0, 'ENDSEC');
    out += dxfPair(0, 'SECTION') + dxfPair(2, 'ENTITIES');
    /* 器件框 + 位号 */
    (design.devices || []).forEach(function (d) {
      if (d.x == null) return;
      if (d.sym.isBus) return; /* 母排用线路表达 */
      const x = s(d.x), y = s(d.y), w = s(d.sym.w), h = s(d.sym.h);
      out += dxfLine(x, y, x + w, y, 'SYM', 0.25);
      out += dxfLine(x + w, y, x + w, y + h, 'SYM', 0.25);
      out += dxfLine(x + w, y + h, x, y + h, 'SYM', 0.25);
      out += dxfLine(x, y + h, x, y, 'SYM', 0.25);
      if (d.tag) out += dxfText(x, y - 4, d.tag, 'TXT', 2.5);
    });
    /* 走线（按能量域分层 + 线宽） */
    (design.wires || []).forEach(function (w) {
      const layer = LAYER[w.cls] || 'SYM';
      const lw = LW[w.cls] || 0.25;
      segsOfLocal(w.pts).forEach(function (sg) {
        out += dxfLine(s(sg.x1), s(sg.y1), s(sg.x2), s(sg.y2), layer, lw);
      });
    });
    /* 跨越半圆 → ARC（凸侧朝 x 正方向） */
    (design.hops || []).forEach(function (h) {
      const r = s(h.r || 10), cx = s(h.cx != null ? h.cx : (h.x || 0)), cy = s(h.cy != null ? h.cy : (h.y || 0));
      const a0 = h.a0 != null ? h.a0 : 0, a1 = h.a1 != null ? h.a1 : 180;
      out += dxfArc(cx, cy, r, a0, a1, 'SYM');
    });
    /* 结点 → 实心圆（半径 1.2） */
    (design.junctions || []).forEach(function (j) {
      out += dxfCircle(s(j.x), s(j.y), 1.2, 'SYM');
    });
    /* 跨页/旗标文字 */
    (design.devices || []).forEach(function (d) {
      if (d.x == null || !(d.xref || d.pwr)) return;
      const x = s(d.x), y = s(d.y);
      out += dxfText(x, y - 3, d.spec || d.pwr || '', 'TXT', 2);
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
    const g = window.EVSE_GEO;
    if (!g || !g.lastDesign) return null;
    return g.lastDesign;
  }

  function exportDXFNow() {
    const d = getDesign();
    if (!d) { alert('请先生成方案'); return; }
    const fn = 'evse-schematic-' + d.params.std + '-' + (d.params.kw || '') + 'kW.dxf';
    download(fn, exportDXF(d, { scale: 1 }), 'application/dxf');
  }

  function exportCSVNow() {
    const d = getDesign();
    if (!d) { alert('请先生成方案'); return; }
    download('evse-netlist.csv', exportCSV(d), 'text/csv;charset=utf-8');
  }

  function exportBOMCSVNow() {
    download('evse-bom.csv', exportBOMCSV(), 'text/csv;charset=utf-8');
  }

  function printPDF() {
    const d = getDesign();
    if (!d) { alert('请先生成方案'); return; }
    window.print();
  }

  return { exportDXF: exportDXF, exportCSV: exportCSV, exportBOMCSV: exportBOMCSV, exportDXFNow: exportDXFNow, exportCSVNow: exportCSVNow, exportBOMCSVNow: exportBOMCSVNow, printPDF: printPDF, getDesign: getDesign };
})();