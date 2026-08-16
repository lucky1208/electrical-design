/* ============================================================
 * 受控设备目录与可追溯概念估算
 * ------------------------------------------------------------
 * This is deliberately a sample catalogue, not a quotation or a
 * product compliance statement. Every price is normalised to CNY
 * and a declared engineering unit so calculation code never mixes
 * 元/Wh、元/kWh、万元/台等 units.
 * ============================================================ */
window.VENDORS = (function () {
  'use strict';

  const CATALOG_STATUS = 'SAMPLE_CATALOGUE—RFQ_REQUIRED';
  const CAT = {
    ups: {
      name: 'UPS 不间断电源', capacityKey: 'kVA', priceUnit: 'CNY/kVA', options: [
        { vendor: '华为', model: 'UPS5000 系列', capacity: 1200, priceCnyPerUnit: 790, eff: 96.0, rel: 5, delWeeks: 6, source: '示例目录', asOf: '2026-08-16' },
        { vendor: '科华', model: '模块化 UPS 系列', capacity: 1200, priceCnyPerUnit: 660, eff: 95.5, rel: 4, delWeeks: 5, source: '示例目录', asOf: '2026-08-16' },
        { vendor: '维谛', model: 'Liebert EXL S1 系列', capacity: 1200, priceCnyPerUnit: 930, eff: 96.5, rel: 5, delWeeks: 8, source: '示例目录', asOf: '2026-08-16' }
      ]
    },
    transformer: {
      name: '干式变压器', capacityKey: 'kVA', priceUnit: 'CNY/kVA', options: [
        { vendor: '特变电工', model: 'SCB13 系列', capacity: 2500, priceCnyPerUnit: 140, eff: 98.5, rel: 5, delWeeks: 7, source: '示例目录', asOf: '2026-08-16' },
        { vendor: '顺特', model: 'SCB13 系列', capacity: 2500, priceCnyPerUnit: 118, eff: 98.2, rel: 4, delWeeks: 6, source: '示例目录', asOf: '2026-08-16' },
        { vendor: 'ABB', model: 'RESIBLOC 系列', capacity: 2500, priceCnyPerUnit: 180, eff: 98.8, rel: 5, delWeeks: 10, source: '示例目录', asOf: '2026-08-16' }
      ]
    },
    battery: {
      name: '储能电池（LFP）', capacityKey: 'kWh', priceUnit: 'CNY/kWh', options: [
        { vendor: '宁德时代', model: 'EnerC 系列', capacity: 1000, priceCnyPerUnit: 700, eff: 95.0, rel: 5, delWeeks: 8, source: '示例目录', asOf: '2026-08-16' },
        { vendor: '比亚迪', model: 'Cube 系列', capacity: 1000, priceCnyPerUnit: 650, eff: 94.0, rel: 4, delWeeks: 7, source: '示例目录', asOf: '2026-08-16' },
        { vendor: '亿纬', model: 'LFP 系列', capacity: 1000, priceCnyPerUnit: 620, eff: 93.5, rel: 4, delWeeks: 6, source: '示例目录', asOf: '2026-08-16' }
      ]
    },
    cdu: {
      name: '液冷 CDU', capacityKey: 'kW', priceUnit: 'CNY/kW', options: [
        { vendor: '英维克', model: 'Coolinside 系列', capacity: 500, priceCnyPerUnit: 1100, eff: 92.0, rel: 5, delWeeks: 7, source: '示例目录', asOf: '2026-08-16' },
        { vendor: '维谛', model: 'Liebert XDU 系列', capacity: 500, priceCnyPerUnit: 1300, eff: 93.0, rel: 5, delWeeks: 9, source: '示例目录', asOf: '2026-08-16' },
        { vendor: '申菱', model: 'CDU 系列', capacity: 500, priceCnyPerUnit: 980, eff: 90.0, rel: 4, delWeeks: 6, source: '示例目录', asOf: '2026-08-16' }
      ]
    },
    pcs: {
      name: '储能变流器（PCS）', capacityKey: 'kW', priceUnit: 'CNY/kW', options: [
        { vendor: '阳光电源', model: 'PCS 系列', capacity: 2500, priceCnyPerUnit: 760, eff: 98.5, rel: 5, delWeeks: 7, source: '示例目录', asOf: '2026-08-16' },
        { vendor: '科华', model: 'PCS 系列', capacity: 2500, priceCnyPerUnit: 680, eff: 98.0, rel: 4, delWeeks: 6, source: '示例目录', asOf: '2026-08-16' },
        { vendor: '上能', model: 'PCS 系列', capacity: 2500, priceCnyPerUnit: 640, eff: 97.8, rel: 4, delWeeks: 6, source: '示例目录', asOf: '2026-08-16' }
      ]
    }
  };

  const WEIGHTS = {
    cost: { c: 0.50, e: 0.15, r: 0.20, d: 0.15 },
    reliability: { c: 0.15, e: 0.20, r: 0.50, d: 0.15 },
    balance: { c: 0.35, e: 0.25, r: 0.25, d: 0.15 }
  };

  function normalise(items, key, value, higherBetter) {
    const values = items.map((x) => x[key]);
    const lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    if (hi === lo) return 1;
    const score = (value - lo) / (hi - lo);
    return higherBetter ? score : 1 - score;
  }

  function select(cat, pref, requirement) {
    const c = CAT[cat];
    if (!c) return null;
    const required = Number(requirement && requirement.requiredCapacity) || 0;
    const compatible = c.options.filter((o) => !required || o.capacity >= required);
    const hasCapacityMatch = compatible.length > 0;
    /* Keep the full sample list visible for RFQ research, but never label an
     * undersized catalogue entry as a recommendation. */
    const candidates = (hasCapacityMatch ? compatible : c.options).map((x) => Object.assign({}, x));
    const w = WEIGHTS[pref] || WEIGHTS.balance;
    candidates.forEach((x) => {
      x.score = Math.round(1000 * (
        w.c * normalise(candidates, 'priceCnyPerUnit', x.priceCnyPerUnit, false) +
        w.e * normalise(candidates, 'eff', x.eff, true) +
        w.r * normalise(candidates, 'rel', x.rel, true) +
        w.d * normalise(candidates, 'delWeeks', x.delWeeks, false)
      )) / 10;
      x.compatible = x.capacity >= required;
    });
    candidates.sort((a, b) => b.score - a.score || a.vendor.localeCompare(b.vendor, 'zh-CN') || a.model.localeCompare(b.model));
    return {
      name: c.name, category: cat, capacityKey: c.capacityKey, priceUnit: c.priceUnit,
      requirement: required || null, options: candidates,
      recommended: hasCapacityMatch ? candidates[0] : null,
      pref: pref || 'balance',
      status: hasCapacityMatch ? CATALOG_STATUS : 'NO_CAPACITY_MATCH—RFQ_REQUIRED',
      note: hasCapacityMatch ? '目录容量匹配；仍需 RFQ 与技术澄清。' : '当前受控示例目录没有满足所需容量的条目；不得推荐或采用现有示例型号。'
    };
  }

  function estimate(option, quantity, capacityPerUnit) {
    if (!option) return { unitCny: 0, totalCny: 0 };
    const cap = Math.max(0, Number(capacityPerUnit) || 0);
    const qty = Math.max(0, Number(quantity) || 0);
    const unitCny = option.priceCnyPerUnit * cap;
    return { unitCny, totalCny: unitCny * qty, priceUnit: option.priceCnyPerUnit, basis: option.priceCnyPerUnit + ' ' + option.vendor + ' ' + option.model };
  }

  return { CAT, CATALOG_STATUS, select, estimate };
})();
