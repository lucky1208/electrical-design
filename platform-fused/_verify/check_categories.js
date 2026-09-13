/* 验证分类补全：BOM 分类列不得出现裸英文 system 键名 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = 'D:\\charging_pile\\_patched\\schematicforge-2.7.0-fixed';
const E = path.join(ROOT, 'engine');
const { orderedEngineFiles } = require(path.join(ROOT, 'scripts', 'core-modules.js'));
const win = {};
orderedEngineFiles(E).forEach((f) => {
  (new Function('window', 'document', fs.readFileSync(path.join(E, f), 'utf8')))(win, {});
});
const BOM = win.SCHEMATIC_ENGINEERING_BOM;
const DEFAULTS = win.EVSE_REQUIREMENT_SPEC.DEFAULTS;
const cases = [
  ['gb-dc', { standard: 'gb', archetype: 'dc-integrated', outputKw: 120, gunCount: 2, essEnabled: false }],
  ['gb-dc-ess', { standard: 'gb', archetype: 'dc-integrated', outputKw: 240, gunCount: 2, essEnabled: true }],
  ['gb-split', { standard: 'gb', archetype: 'dc-split', outputKw: 240, gunCount: 2, essEnabled: false }],
  ['gb-combo', { standard: 'gb', archetype: 'ac-dc-combo', outputKw: 120, gunCount: 2, essEnabled: false }],
  ['gb-mobile', { standard: 'gb', archetype: 'ess-mobile', outputKw: 120, gunCount: 2, essEnabled: true }],
  ['eu-ess-ac', { standard: 'eu', archetype: 'dc-integrated', outputKw: 240, gunCount: 2, essEnabled: true, essCoupling: 'ac' }],
  ['chademo', { standard: 'chademo', archetype: 'ess-mobile', outputKw: 120, gunCount: 2, essEnabled: true }]
];
const allCats = new Set();
let asciiLeak = 0;
cases.forEach(([name, params]) => {
  const built = win.EVSE_ENGINE.build(Object.assign({}, DEFAULTS, params, {
    pileName: name, acVoltage: params.standard === 'eu' ? 400 : params.standard === 'chademo' ? 200 : 380,
    voltageWindow: '200-1000', moduleKw: 30, thermal: 'liquid', requirementConfirmed: true
  }));
  const bom = BOM.build(built);
  const cats = new Set(bom.rows.map((r) => r['类别']));
  const bad = [...cats].filter((c) => /^[a-z][a-z-]*$/.test(c));
  console.log(name.padEnd(12) + ' 行数=' + String(bom.rows.length).padStart(3) +
    '  分类数=' + cats.size + (bad.length ? '   !! 裸英文分类: ' + bad.join(', ') : ''));
  asciiLeak += bad.length;
  cats.forEach((c) => allCats.add(c));
});
console.log('\n全部类别：');
[...allCats].sort().forEach((c) => console.log('   ' + c));
console.log('\n裸英文分类泄漏总数（必须 0）= ' + asciiLeak);
console.log('参考列抽样：');
const sample = BOM.build(win.EVSE_ENGINE.build(Object.assign({}, DEFAULTS, cases[0][1], {
  pileName: 'x', acVoltage: 380, voltageWindow: '200-1000', moduleKw: 30, thermal: 'liquid', requirementConfirmed: true
})));
console.log(JSON.stringify(sample.rows[0], null, 1));
