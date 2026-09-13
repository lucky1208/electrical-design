/* 定位 eu × ac-dc-combo 的那 1 处 VIS-003 重叠对象 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = 'D:\\charging_pile\\_patched\\schematicforge-2.7.0-fixed';
const { orderedEngineFiles } = require(path.join(ROOT, 'scripts', 'core-modules.js'));
const win = {};
orderedEngineFiles(path.join(ROOT, 'engine')).forEach((f) => {
  (new Function('window', 'document', fs.readFileSync(path.join(ROOT, 'engine', f), 'utf8')))(win, {});
});
const params = Object.assign({}, win.EVSE_REQUIREMENT_SPEC.DEFAULTS, {
  pileName: 'diag', standard: 'eu', archetype: 'ac-dc-combo',
  outputKw: 120, moduleKw: 30, gunCount: 2, gunCurrentA: 250, supplyMode: 'grid',
  thermal: 'air', essEnabled: false, acVoltage: 400, voltageWindow: '200-1000', requirementConfirmed: true
});
const built = win.EVSE_ENGINE.build(params);
const rendered = win.EVSE_SCHEMATIC_SHEET_RENDERING.buildDocument(built);
console.log('rendered.status =', rendered.status);
rendered.pages.forEach((p) => {
  const vq = (p.pageGate && p.pageGate.visualQuality) || {};
  const hits = (vq.findings || []).filter((f) => f.code === 'VIS-003-TEXT-OVERLAP');
  if (!hits.length) return;
  console.log('\n页面 ' + p.sheet.id + ' 有 ' + hits.length + ' 处 VIS-003：');
  hits.forEach((f) => console.log('   ' + JSON.stringify(f)));

  /* 找到涉及的两个文本 primitive，打印其几何 */
  const prims = (p.compiled.drawingIR.primitives || []).filter((x) => x.kind === 'text');
  const involved = new Set();
  hits.forEach((f) => { if (f.textId) involved.add(f.textId); if (f.otherTextId) involved.add(f.otherTextId); });
  prims.filter((x) => involved.has(x.id)).forEach((x) => {
    console.log('   文本 ' + x.id + '  text="' + x.text + '" x=' + x.x + ' y=' + x.y +
      ' h=' + x.height + ' rot=' + (x.rotation || 0) + ' anchor=' + (x.anchor || 'middle'));
  });
});
