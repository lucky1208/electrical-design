/* 找出 20 个标准×桩型组合中哪些从 PASS 变为 REVIEW_REQUIRED，以及原因 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = 'D:\\charging_pile\\_patched\\schematicforge-2.7.0-fixed';
const { orderedEngineFiles } = require(path.join(ROOT, 'scripts', 'core-modules.js'));
const win = {};
orderedEngineFiles(path.join(ROOT, 'engine')).forEach((f) => {
  (new Function('window', 'document', fs.readFileSync(path.join(ROOT, 'engine', f), 'utf8')))(win, {});
});
const variants = {
  'dc-integrated': { outputKw: 120, moduleKw: 30, gunCount: 2, gunCurrentA: 250, supplyMode: 'transformer', thermal: 'air', essEnabled: false },
  'dc-split': { outputKw: 180, moduleKw: 30, gunCount: 2, gunCurrentA: 250, supplyMode: 'transformer', thermal: 'liquid', essEnabled: false },
  'ac-dc-combo': { outputKw: 120, moduleKw: 30, gunCount: 2, gunCurrentA: 250, supplyMode: 'grid', thermal: 'air', essEnabled: false },
  'ess-mobile': { outputKw: 60, moduleKw: 30, gunCount: 1, gunCurrentA: 250, supplyMode: 'offgrid', thermal: 'liquid', essEnabled: true, essKwh: 200, essPowerKw: 120, essCoupling: 'dc' }
};
const standards = win.EVSE_REQUIREMENT_SPEC.SUPPORTED.standards;
const archetypes = win.EVSE_REQUIREMENT_SPEC.SUPPORTED.archetypes;
const bad = [];
for (const standard of standards) {
  for (const archetype of archetypes) {
    const params = Object.assign({}, win.EVSE_REQUIREMENT_SPEC.DEFAULTS, variants[archetype], {
      pileName: 'M-' + standard + '-' + archetype, standard, archetype,
      acVoltage: win.EVSE_REQUIREMENT_SPEC.STANDARD_VOLTAGES[standard],
      voltageWindow: '200-1000', requirementConfirmed: true
    });
    const built = win.EVSE_ENGINE.build(params);
    const rendered = win.EVSE_SCHEMATIC_SHEET_RENDERING.buildDocument(built);
    const codes = {};
    rendered.pages.forEach((p) => {
      const q = (p.pageGate && p.pageGate.quality) || {};
      [].concat(q.checks || [], q.evidence || []).forEach((c) => {
        if (c && (c.ok === false || c.severity === 'REVIEW')) {
          const key = (c.code || '?');
          codes[key] = (codes[key] || 0) + 1;
        }
      });
      const vq = (p.pageGate && p.pageGate.visualQuality) || {};
      (vq.findings || []).forEach((f) => {
        const key = 'VQ:' + (f.code || '?');
        codes[key] = (codes[key] || 0) + 1;
      });
    });
    const line = (standard + ' x ' + archetype).padEnd(22) + rendered.status.padEnd(18) + JSON.stringify(codes);
    console.log('  ' + line);
    if (rendered.status !== 'PASS') bad.push({ standard, archetype, codes });
  }
}
console.log('\n非 PASS 组合数 =', bad.length, '/', standards.length * archetypes.length);
bad.forEach((b) => console.log('  !! ' + b.standard + ' x ' + b.archetype + ' -> ' + JSON.stringify(b.codes)));
