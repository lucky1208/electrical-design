const test = require('node:test');
const assert = require('node:assert/strict');
const source = require('../evse-source.js');
globalThis.EVSE_SOURCE = source;
const calc = require('../evse-calc.js');

const opts = overrides => calc.normalizeOpts(Object.assign({ ambientC: 30, grouping: 1 }, overrides || {}));

test('standard ratings and derating factors', () => {
  assert.equal(calc.stdRating(15), 16);
  assert.equal(calc.stdRating(201), 250);
  assert.equal(calc.stdRating(99999), 6300);
  assert.equal(calc.ambientFactor(30), 1);
  assert.equal(calc.ambientFactor(35), 0.94);
  assert.equal(calc.groupFactor(1), 1);
  assert.equal(calc.groupFactor(2), 0.8);
});

test('cable selection respects ampacity and derating', () => {
  const a = calc.selectCable(200, opts());
  assert.equal(a.size, 95);
  assert.equal(a.ok, true);
  assert.ok(a.iz >= 200);
  const b = calc.selectCable(200, opts({ ambientC: 35, grouping: 2 }));
  assert.equal(b.size, 150);
  assert.equal(b.ok, true);
  assert.ok(b.iz >= 200);
  const c = calc.selectCable(500, opts());
  assert.equal(c.size, 240);
  assert.equal(c.ok, false);
});

test('voltage drop AC and DC formulas', () => {
  const ac = calc.voltageDropAC(100, 50, 95, calc.normalizeOpts({ acVoltage: 400, pf: 0.95 }));
  assert.ok(Math.abs(ac.volts - 1.732) < 0.02);
  assert.ok(Math.abs(ac.pct - 0.433) < 0.01);
  const dc = calc.voltageDropDC(200, 50, 95, calc.normalizeOpts({ busVoltage: 750 }));
  assert.ok(Math.abs(dc.volts - 3.684) < 0.02);
  assert.ok(Math.abs(dc.pct - 0.491) < 0.01);
});

test('dominant electrical formulas', () => {
  assert.ok(Math.abs(calc.thermalMinSize(25, 0.1, calc.normalizeOpts({})) - 55.28) < 0.1);
  assert.ok(Math.abs(calc.transformerIsc(1000, 6, 400) - 24.056) < 0.02);
});

test('EVSE design current extraction', () => {
  const D = { params: { family: 'evse', kw: 240, guns: 2, gunA: 250, moduleKw: 40, ess: false, busV: 750 } };
  const x = calc.designInputs(D, calc.normalizeOpts({}));
  assert.equal(x.family, 'evse');
  assert.ok(Math.abs(x.acCurrent - 379.83) < 0.1);
  assert.ok(Math.abs(x.dcBusCurrent - 320) < 0.01);
  assert.equal(x.gunA, 250);
  assert.equal(x.hasEss, false);
});

test('MWESS design current extraction', () => {
  const D = { params: { family: 'mwess', acdcCount: 6, acdcKw: 80, dcdcCount: 24, dcdcKw: 80, acIn: 2, busV: 1500, gunCount: 2, gunV: 1500, gunA: 1500, essCab: 2, essKwh: 151.5 } };
  const x = calc.designInputs(D, calc.normalizeOpts({}));
  assert.equal(x.family, 'mwess');
  assert.ok(Math.abs(x.acCurrentPerFeed - 379.83) < 0.1);
  assert.ok(Math.abs(x.dcBusCurrent - 320) < 0.01);
  assert.equal(x.essEnergyKwh, 303);
  assert.equal(x.hasEss, true);
});

test('auditDesign returns traceable findings for EVSE without storage', () => {
  globalThis.EVSE_VENDOR_KB = { G_CHECKS: [{ id: 'G01', title: '短路/绝缘单元', need: ['SC', 'RI1'] }] };
  const D = {
    params: { name: 'EVSE 240kW', family: 'evse', std: 'gb', kw: 240, guns: 2, gunA: 250, moduleKw: 40, ess: false, busV: 750 },
    devices: [
      { id: 'SB1', tag: 'SB1', name: '急停' }, { id: 'SQ1', tag: 'SQ1', name: '门开关' },
      { id: 'SC1', tag: 'SC1', name: '短路检测' }, { id: 'RI1', tag: 'RI1', name: '绝缘监测' },
      { id: 'KF1', tag: 'KF1', name: '粘连检测' }, { id: 'PEC1', tag: 'PEC1', name: 'PE检测' },
      { id: 'CG1', tag: 'CG1', name: '导引' }, { id: 'RCM1', tag: 'RCM1', name: '剩余电流' },
      { id: 'T1', tag: 'T1' }, { id: 'T2', tag: 'T2' }, { id: 'FE1', tag: 'FE1' }, { id: 'FV1', tag: 'FV1' }
    ]
  };
  const r = calc.auditDesign(D, { gridIkKa: 20, transformerKva: 1000, essPowerKw: null, __sourceIds: ['SITE-TEST-002'] });
  assert.equal(r.schema, 'evse-electrical-audit/v1');
  assert.equal(r.family, 'evse');
  assert.ok(r.results.length >= 12);
  assert.ok(r.results.every(x => ['pass', 'warn', 'fail', 'unknown', 'na'].includes(x.status)));
  assert.equal(r.results.find(x => x.id === 'ESS-ENERGY').status, 'na');
  assert.equal(r.results.find(x => x.id === 'SAFE-FIRE').status, 'na');
  assert.equal(r.results.find(x => x.id === 'SAFE-VENDOR').status, 'pass');
  assert.ok(r.results.find(x => x.id === 'TRANSFORMER').sourceIds.includes('SITE-TEST-002'));
  assert.equal(r.inputs.siteSourceIds[0], 'SITE-TEST-002');
  assert.ok(r.summary.pass > 0);
  assert.match(r.designHash, /^[0-9a-f]{8}$/);
  assert.match(r.resultHash, /^[0-9a-f]{8}$/);
  const csv = calc.toCSV(r);
  assert.match(csv, /电缆与载流/);
  assert.match(csv, /SAFE-FIRE/);
  const pack = calc.toEvidencePack(D, r);
  assert.equal(pack.schema, 'evse-evidence-pack/v1');
  assert.ok(pack.sources);
  assert.ok(pack.sources.sources.length > 0);
});

test('auditDesign includes storage checks when ESS is configured', () => {
  const D = {
    params: { name: 'EVSE + ESS', family: 'evse', std: 'gb', kw: 240, guns: 2, gunA: 250, moduleKw: 40, ess: true, essKwh: 200, essClusters: 2, coupling: 'dc', busV: 750 },
    devices: [{ id: 'SB1', tag: 'SB1' }, { id: 'SQ1', tag: 'SQ1' }, { id: 'FR1', tag: 'FR1', name: '消防系统' }]
  };
  const r = calc.auditDesign(D, { gridIkKa: 20, essPowerKw: 100, transformerKva: 1000 });
  const energy = r.results.find(x => x.id === 'ESS-ENERGY');
  assert.equal(energy.status, 'warn');
  assert.match(String(energy.detail), /可用/);
  const fire = r.results.find(x => x.id === 'SAFE-FIRE');
  assert.equal(fire.status, 'warn');
});

test('auditDesign handles MWESS without throwing', () => {
  const D = { params: { name: 'MWESS', family: 'mwess', acdcCount: 6, acdcKw: 80, dcdcCount: 24, dcdcKw: 80, acIn: 2, busV: 1500, gunCount: 2, gunV: 1500, gunA: 1500, essCab: 2, essKwh: 151.5 }, devices: [{ id: 'FR1', tag: 'FR1', name: '消防系统' }, { id: 'SB1', tag: 'SB1' }, { id: 'SQ1', tag: 'SQ1' }, { id: 'SR1', tag: 'SR1' }] };
  const r = calc.auditDesign(D, { gridIkKa: 25, transformerKva: 2000, essPowerKw: 100 });
  assert.equal(r.family, 'mwess');
  assert.equal(r.results.find(x => x.id === 'ESS-ENERGY').status, 'pass');
  assert.equal(r.results.find(x => x.id === 'SAFE-GAS').status, 'warn');
  assert.ok(r.results.some(x => x.id === 'SC-ESS'));
});
test('IEC inverse-time protection curves', () => {
  assert.ok(Math.abs(calc.curveTime('SI', 5000, 400, 0.1) - 0.2702) < 0.002);
  assert.ok(Math.abs(calc.curveTime('VI', 5000, 400, 0.1) - 0.1174) < 0.002);
  assert.ok(Math.abs(calc.curveTime('EI', 5000, 400, 0.1) - 0.0515) < 0.002);
  assert.equal(calc.curveTime('SI', 400, 400, 0.1), null);
  assert.equal(calc.curveTime('SI', 6000, 400, 0), null);
  assert.equal(calc.curveTime('bad', 5000, 400, 0.1), calc.curveTime('SI', 5000, 400, 0.1));
});

test('protection curve selectivity, grid impact and transformer loading', () => {
  const D = { params: { name: 'EVSE 240kW', family: 'evse', std: 'gb', kw: 240, guns: 2, gunA: 250, moduleKw: 40, ess: false, busV: 750 }, devices: [{ id: 'SB1', tag: 'SB1' }, { id: 'SQ1', tag: 'SQ1' }] };
  const r = calc.auditDesign(D, {
    gridIkKa: 20, transformerKva: 1000, transformerZPct: 6,
    upstreamPickupA: 400, upstreamTms: 0.4, downstreamPickupA: 400, downstreamTms: 0.1,
    selectivityMarginSec: 0.2, thdPct: 4.8, unbalancePct: 1.5
  });
  const curve = r.results.find(x => x.id === 'PROT-CURVE');
  assert.equal(curve.status, 'pass');
  assert.match(String(curve.detail), /时间级差/);
  const load = r.results.find(x => x.id === 'TRANSFORMER-LOAD');
  assert.equal(load.status, 'pass');
  assert.ok(Math.abs(parseFloat(load.value) - 26.32) < 0.1);
  const scr = r.results.find(x => x.id === 'GRID-SCR');
  assert.equal(scr.status, 'pass');
  const voltage = r.results.find(x => x.id === 'GRID-VOLTAGE');
  assert.equal(voltage.status, 'pass');
  const pq = r.results.find(x => x.id === 'POWER-QUALITY');
  assert.equal(pq.status, 'pass');
});

test('power quality fails above configured limit', () => {
  const D = { params: { name: 'EVSE', family: 'evse', std: 'gb', kw: 120, guns: 1, gunA: 250, moduleKw: 30, ess: false, busV: 750 }, devices: [] };
  const r = calc.auditDesign(D, { thdPct: 8, unbalancePct: 1, thdLimitPct: 5 });
  const pq = r.results.find(x => x.id === 'POWER-QUALITY');
  assert.equal(pq.status, 'fail');
});

test('LCOS calculation with cost data', () => {
  const D = { params: { name: 'EVSE', family: 'evse', std: 'gb', kw: 240, guns: 2, gunA: 250, moduleKw: 40, ess: false, busV: 750 }, devices: [] };
  const r = calc.auditDesign(D, {
    capexYuan: 1000000, opexYuanPerYear: 50000, annualDischargeMwh: 1000,
    projectYears: 10, discountRate: 0, degradationPct: 0, residualPct: 0,
    targetLcosYuan: 0.2
  });
  const lcos = r.results.find(x => x.id === 'LIFE-LCOS');
  assert.equal(lcos.status, 'pass');
  assert.ok(Math.abs(parseFloat(lcos.value) - 0.15) < 0.001);
  assert.match(String(lcos.detail), /年 OPEX/);
});

test('LCOS is unknown without cost data', () => {
  const D = { params: { name: 'EVSE', family: 'evse', std: 'gb', kw: 240, guns: 2, gunA: 250, moduleKw: 40, ess: false, busV: 750 }, devices: [] };
  const r = calc.auditDesign(D, {});
  assert.equal(r.results.find(x => x.id === 'LIFE-LCOS').status, 'unknown');
});
