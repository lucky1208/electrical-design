/* ============================================================
 * 多 vendor 设备选型 + 性价比评分引擎 (确定性, 无需 LLM)
 * ------------------------------------------------------------
 * LLM 负责"理解偏好/给建议", 本引擎负责"评分决策" (可复现/可审计)
 * preference: 'cost' 成本优先 | 'balance' 均衡 | 'reliability' 可靠性优先
 * ============================================================ */
window.VENDORS = (function () {
  'use strict';
  const CAT = {
    ups: { name: 'UPS 不间断电源', options: [
      { vendor: '华为', model: 'UPS5000-E-1200kVA', price: 95, eff: 96.0, rel: 5, del: 4 },
      { vendor: '科华', model: 'KHDT-1200', price: 78, eff: 95.0, rel: 4, del: 3 },
      { vendor: '维谛', model: 'Liebert EXL S1', price: 112, eff: 96.5, rel: 5, del: 6 }
    ]},
    transformer: { name: '干式变压器', options: [
      { vendor: '特变电工', model: 'SCB13-2500', price: 35, eff: 98.5, rel: 5, del: 5 },
      { vendor: '顺特', model: 'SCB13-2500', price: 30, eff: 98.2, rel: 4, del: 4 },
      { vendor: 'ABB', model: 'RESIBLOC-2500', price: 45, eff: 98.8, rel: 5, del: 8 }
    ]},
    battery: { name: '储能电池 (LFP)', options: [
      { vendor: '宁德时代', model: 'EnerC-250', price: 0.12, eff: 95, rel: 5, del: 6, per: '元/Wh' },
      { vendor: '比亚迪', model: 'BYD-Cube', price: 0.10, eff: 94, rel: 4, del: 5, per: '元/Wh' },
      { vendor: '亿纬', model: 'LF280K', price: 0.09, eff: 93.5, rel: 4, del: 4, per: '元/Wh' }
    ]},
    cdu: { name: '液冷 CDU', options: [
      { vendor: '英维克', model: 'Coolinside-300', price: 45, eff: 92, rel: 5, del: 4 },
      { vendor: '维谛', model: 'Liebert XDU', price: 55, eff: 93, rel: 5, del: 6 },
      { vendor: '申菱', model: 'SL-CDU300', price: 38, eff: 90, rel: 4, del: 3 }
    ]},
    pcs: { name: 'PCS 储能变流器', options: [
      { vendor: '阳光电源', model: 'SG250HX', price: 0.11, eff: 98.5, rel: 5, del: 4, per: '元/W' },
      { vendor: '科华', model: 'KH500K', price: 0.09, eff: 98.0, rel: 4, del: 3, per: '元/W' },
      { vendor: '上能', model: 'SP-250K', price: 0.08, eff: 97.8, rel: 4, del: 3, per: '元/W' }
    ]}
  };

  function select(cat, pref) {
    const c = CAT[cat]; if (!c) return null;
    const w = pref === 'cost' ? { c: 0.5, e: 0.15, r: 0.2, d: 0.15 }
      : pref === 'reliability' ? { c: 0.15, e: 0.2, r: 0.5, d: 0.15 }
        : { c: 0.35, e: 0.25, r: 0.25, d: 0.15 };
    const o = c.options.map((x) => Object.assign({}, x));
    const mn = (k) => Math.min.apply(null, o.map((x) => x[k]));
    const mx = (k) => Math.max.apply(null, o.map((x) => x[k]));
    const norm = (v, k, higherBetter) => { const a = mn(k), b = mx(k); const t = (v - a) / (b - a || 1); return higherBetter ? t : 1 - t; };
    o.forEach((x) => {
      x.score = Math.round(100 * (w.c * norm(x.price, 'price', false) + w.e * norm(x.eff, 'eff', true) + w.r * norm(x.rel, 'rel', true) + w.d * norm(x.del, 'del', false)));
    });
    o.sort((a, b) => b.score - a.score);
    return { name: c.name, options: o, recommended: o[0], pref: pref };
  }

  return { CAT, select };
})();