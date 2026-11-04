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
  assert.equal(calc.ambientFactor(30, calc.normalizeOpts({})), 1);
  assert.equal(calc.ambientFactor(35, calc.normalizeOpts({ insulation: 'pvc' })), 0.94);
  assert.equal(calc.groupFactor(1), 1);
  assert.equal(calc.groupFactor(2), 0.8);
});

test('cable selection respects ampacity, insulation and derating', () => {
  const a = calc.selectCable(200, opts());
  assert.equal(a.size, 70);
  assert.equal(a.ok, true);
  assert.ok(a.iz >= 200);
  const b = calc.selectCable(200, opts({ ambientC: 35, grouping: 2 }));
  assert.equal(b.size, 95);
  assert.equal(b.ok, true);
  assert.ok(b.iz >= 200);
  const c = calc.selectCable(500, opts());
  assert.equal(c.size, 300);
  assert.equal(c.ok, true);
  const d = calc.selectCable(700, opts());
  assert.equal(d.size, 300);
  assert.equal(d.ok, false);
  assert.match(d.note, /超过参考表最大截面/);
  const pvc = calc.selectCable(200, opts({ insulation: 'pvc' }));
  assert.equal(pvc.size, 95);
  assert.ok(pvc.iz > a.iz);
  assert.ok(calc.cableIz(70, opts({ insulation: 'xlpe' })) > calc.cableIz(70, opts({ insulation: 'pvc' })));
});

test('voltage drop AC and DC formulas use operating-temperature resistivity', () => {
  const o = calc.normalizeOpts({ acVoltage: 400, pf: 0.95 });
  const ac = calc.voltageDropAC(100, 50, 95, o);
  assert.ok(Math.abs(ac.volts - 2.149) < 0.02);
  assert.ok(Math.abs(ac.pct - 0.537) < 0.01);
  assert.ok(Math.abs(ac.rho - 0.022314) < 0.00001);
  const dc = calc.voltageDropDC(200, 50, 95, calc.normalizeOpts({ busVoltage: 750 }));
  assert.ok(Math.abs(dc.volts - 4.698) < 0.02);
  assert.ok(Math.abs(dc.pct - 0.626) < 0.01);
  const pvc = calc.conductorRho(calc.normalizeOpts({ insulation: 'pvc' }));
  assert.ok(pvc < dc.rho);
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
  assert.ok(Math.abs(x.acDcBusCurrent - 320) < 0.01);
  assert.ok(Math.abs(x.dcDcBusCurrent - 1280) < 0.01);
  assert.ok(Math.abs(x.dcBusCurrent - 1280) < 0.01);
  assert.match(x.dcBusCurrentBasis, /DC\/DC/);
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
  assert.ok(r.results.every(x => ['pass', 'assumed', 'warn', 'fail', 'unknown', 'na'].includes(x.status)));
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

test('oversized DC gun cable fails ampacity and invalidates voltage drop', () => {
  const D = { params: { family: 'mwess', acdcCount: 6, acdcKw: 80, dcdcCount: 24, dcdcKw: 80, acIn: 2, busV: 1500, gunCount: 2, gunV: 1500, gunA: 1500, essCab: 2, essKwh: 151.5 }, devices: [] };
  const r = calc.auditDesign(D, {});
  const cable = r.results.find(x => x.id === 'GUN-CABLE');
  const vd = r.results.find(x => x.id === 'GUN-VDROP');
  assert.equal(cable.status, 'fail');
  assert.match(String(cable.detail), /不满足载流/);
  assert.equal(vd.status, 'unknown');
  assert.match(String(vd.detail), /压降结论不成立/);
});

test('default transformer and grid values are assumed, not pass', () => {
  const D = { params: { name: 'EVSE', family: 'evse', std: 'gb', kw: 240, guns: 2, gunA: 250, moduleKw: 40, ess: false, busV: 750 }, devices: [] };
  const assumed = calc.auditDesign(D, {});
  for (const id of ['TRANSFORMER', 'TRANSFORMER-LOAD', 'SC-AC', 'GRID-SCR']) {
    assert.equal(assumed.results.find(x => x.id === id).status, 'assumed', id);
  }
  assert.ok(assumed.summary.assumed >= 4);
  const explicit = calc.auditDesign(D, { transformerKva: 1000, transformerZPct: 6, gridIkKa: 20, acBreakerIcuKa: 36, faultClearSec: 0.1 });
  for (const id of ['TRANSFORMER', 'TRANSFORMER-LOAD', 'SC-AC', 'GRID-SCR']) {
    assert.equal(explicit.results.find(x => x.id === id).status, 'pass', id);
  }
});

test('DC protective device rating is unknown until 1500 V DC evidence is supplied', () => {
  const D = { params: { family: 'mwess', acdcCount: 6, acdcKw: 80, dcdcCount: 24, dcdcKw: 80, acIn: 2, busV: 1500, gunCount: 2, gunV: 1500, gunA: 1500, essCab: 2, essKwh: 151.5 }, devices: [] };
  const unknown = calc.auditDesign(D, {});
  assert.equal(unknown.results.find(x => x.id === 'DC-RATING-GUN').status, 'unknown');
  /* 缺直流短路电流时不得判分断通过：即使填了电压/分断/L/R 仍为 unknown */
  const noIk = calc.auditDesign(D, { dcRatedVoltage: 1500, dcBreakingKa: 25, dcLrMs: 5 });
  assert.equal(noIk.results.find(x => x.id === 'DC-RATING-GUN').status, 'unknown');
  assert.match(String(noIk.results.find(x => x.id === 'DC-RATING-GUN').detail), /无法校核直流分断/);
  const pass = calc.auditDesign(D, { dcRatedVoltage: 1500, dcBreakingKa: 25, dcLrMs: 5, dcIscKa: 20 });
  assert.equal(pass.results.find(x => x.id === 'DC-RATING-GUN').status, 'pass');
  const fail = calc.auditDesign(D, { dcRatedVoltage: 1000, dcBreakingKa: 10, dcIscKa: 20 });
  assert.equal(fail.results.find(x => x.id === 'DC-RATING-GUN').status, 'fail');
});

test('aluminium conductors derate ampacity and insulation picks its own ambient table', () => {
  const o = (x) => calc.normalizeOpts(Object.assign({ ambientC: 30, grouping: 1 }, x || {}));
  const cu = calc.cableIz(95, o({ cableMaterial: 'cu', insulation: 'xlpe' }));
  const al = calc.cableIz(95, o({ cableMaterial: 'al', insulation: 'xlpe' }));
  assert.ok(al < cu);
  assert.ok(Math.abs(al - cu * 0.78) < 0.5);
  const xlpe = calc.ambientFactor(40, o({ insulation: 'xlpe' }));
  const pvc = calc.ambientFactor(40, o({ insulation: 'pvc' }));
  assert.equal(xlpe, 0.91);
  assert.equal(pvc, 0.87);
  assert.equal(calc.ambientFactor(55, o({ insulation: 'pvc' })), 0.61);
});

test('safety emergency loop is verified from netlist topology, not device names', () => {
  const devices = [
    { id: 'T1', sym: { pins: [{ n: 'V+', name: '24V+' }, { n: 'V-', name: '24V-' }] } },
    { id: 'SB1', sym: { pins: [{ n: '11' }, { n: '12' }] } },
    { id: 'SQ1', sym: { pins: [{ n: '11' }, { n: '12' }] } },
    { id: 'SR1', sym: { pins: [{ n: 'A1', name: '线圈+' }, { n: 'A2' }, { n: '1' }, { n: '2' }, { n: '3' }, { n: '4' }] } },
    { id: 'WB1', sym: { pins: [{ n: 'S1' }, { n: 'S2' }] } }
  ];
  const series = {
    params: { family: 'mwess' }, devices,
    nets: [
      { a: { d: 'T1', p: 'V+' }, b: { d: 'SB1', p: '11' } },
      { a: { d: 'SB1', p: '12' }, b: { d: 'SQ1', p: '11' } },
      { a: { d: 'SQ1', p: '12' }, b: { d: 'SR1', p: 'A1' } },
      { a: { d: 'SR1', p: 'A2' }, b: { d: 'T1', p: 'V-' } },
      { a: { d: 'SR1', p: '1' }, b: { d: 'WB1', p: 'S1' } },
      { a: { d: 'SR1', p: '2' }, b: { d: 'T1', p: 'V+' } },
      { a: { d: 'SR1', p: '3' }, b: { d: 'WB1', p: 'S2' } },
      { a: { d: 'SR1', p: '4' }, b: { d: 'T1', p: 'V+' } }
    ]
  };
  const ok = calc.auditDesign(series, {});
  assert.equal(ok.results.find(x => x.id === 'SAFE-ESTOP').status, 'pass');
  assert.match(String(ok.results.find(x => x.id === 'SAFE-ESTOP').detail), /串联安全链/);
  assert.equal(ok.results.find(x => x.id === 'SAFE-LOOP-OUT').status, 'pass');

  const parallel = {
    params: { family: 'evse' },
    devices: [
      { id: 'SB1', sym: { pins: [{ n: '11' }, { n: '12' }] } },
      { id: 'SQ1', sym: { pins: [{ n: '11' }, { n: '12' }] } },
      { id: 'A1', sym: { pins: [{ n: 'X4.1' }, { n: 'X4.2' }] } }
    ],
    nets: [
      { a: { d: 'SB1', p: '12' }, b: { d: 'A1', p: 'X4.1' } },
      { a: { d: 'SQ1', p: '12' }, b: { d: 'A1', p: 'X4.2' } }
    ]
  };
  const warn = calc.auditDesign(parallel, {});
  assert.equal(warn.results.find(x => x.id === 'SAFE-ESTOP').status, 'warn');
  assert.match(String(warn.results.find(x => x.id === 'SAFE-ESTOP').detail), /并联接入/);
});
