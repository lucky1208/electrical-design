/* ============================================================
 * EVSE 标注自动避让（C08）v1.0
 * ------------------------------------------------------------
 * 走线已定后，把「位号 + 名称 + 规格」文字带整体移到最空的候选位。
 * 动文字不动线：不会破坏已满足的 C02 / C05。
 * ============================================================ */
window.EVSE_LABELFIX = (function () {
  'use strict';

  const SLOTS = [
    { dx: 0, dy: 0 }, { dx: 0, dy: -18 }, { dx: 0, dy: -36 },
    { dx: -62, dy: 0 }, { dx: 62, dy: 0 },
    { dx: -62, dy: -20 }, { dx: 62, dy: -20 },
    { dx: -112, dy: 0 }, { dx: 112, dy: 0 },
    { dx: 0, dy: 20 }, { dx: -112, dy: -24 }, { dx: 112, dy: -24 },
    /* v2.0.2 audit-fix: 扩容候选位（垂直落线密集区逃逸） */
    { dx: 0, dy: -54 }, { dx: 0, dy: 38 }, { dx: 0, dy: 56 },
    { dx: -160, dy: 0 }, { dx: 160, dy: 0 },
    { dx: 62, dy: 20 }, { dx: -62, dy: 20 }, { dx: 112, dy: 20 }, { dx: -112, dy: 20 }
  ];
  const GRID = 128;

  function run(design) {
    const G = window.EVSE_GEO;
    const band = G.labelBandOf, hit = G.hitRectOf, ovl = G.overlap;
    if (!band || !hit) return design;

    /* 线段网格索引 */
    const idx = {};
    design.wires.forEach(function (w) {
      G.segsOf(w.pts).forEach(function (s) {
        const x0 = Math.floor(Math.min(s.x1, s.x2) / GRID), x1 = Math.floor(Math.max(s.x1, s.x2) / GRID);
        const y0 = Math.floor(Math.min(s.y1, s.y2) / GRID), y1 = Math.floor(Math.max(s.y1, s.y2) / GRID);
        for (let xi = x0; xi <= x1; xi++) for (let yi = y0; yi <= y1; yi++) {
          const k = w.sheet + ':' + xi + ',' + yi;
          (idx[k] = idx[k] || []).push({ s: s, a: w.a, b: w.b });
        }
      });
    });
    const near = function (sheet, r) {
      const out = [];
      const x0 = Math.floor(r.x / GRID), x1 = Math.floor((r.x + r.w) / GRID);
      const y0 = Math.floor(r.y / GRID), y1 = Math.floor((r.y + r.h) / GRID);
      for (let xi = x0; xi <= x1; xi++) for (let yi = y0; yi <= y1; yi++) {
        const arr = idx[sheet + ':' + xi + ',' + yi];
        if (arr) for (let i = 0; i < arr.length; i++) out.push(arr[i]);
      }
      return out;
    };

    const solid = (design.boxes || []).filter(function (b) { return b.kind !== 'label' && b.kind !== 'corridor'; }); /* V6-GCORR2: 走廊不参与文字避让 */
    const placed = [];
    design.devices.forEach(function (d) {
      if (!d.tag || !d.sym.tagAt || d.x == null) return;
      let bestS = null, bestC = Infinity;
      for (let i = 0; i < SLOTS.length; i++) {
        const sl = SLOTS[i];
        d.tagOff = { dx: sl.dx, dy: sl.dy };
        const b = band(d);
        let c = i * 3;
        const ws = near(d.sheet, b);
        for (let j = 0; j < ws.length; j++) {
          const q = ws[j];
          if (q.a && (q.a.dev === d.id || (q.b && q.b.dev === d.id))) continue;
          if (hit(q.s, b)) { c += 100; if (c >= bestC) break; }
        }
        if (c < bestC) {
          for (let j = 0; j < solid.length; j++) {
            const s2 = solid[j];
            if (s2.sheet !== b.sheet) continue;
            /* V12: 自体 body 重叠不再豁免（C07 error 重于 C08 warn） */
            if (ovl(s2, b)) { c += 300; if (c >= bestC) break; }
          }
        }
        if (c < bestC) {
          for (let j = 0; j < placed.length; j++) {
            if (placed[j].sheet !== b.sheet) continue;
            if (ovl(placed[j], b)) { c += 300; if (c >= bestC) break; }
          }
        }
        if (c < bestC) { bestC = c; bestS = sl; if (c === i * 3) break; }
      }
      d.tagOff = (bestS && (bestS.dx || bestS.dy)) ? { dx: bestS.dx, dy: bestS.dy } : null;
      placed.push(band(d));
    });
    design.boxes = solid.concat(placed);
    return design;
  }

  return { run: run, SLOTS: SLOTS };
})();
