/* 验证 AI 审图上下文已包含图面证据 */
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
const built = win.EVSE_ENGINE.build(Object.assign({}, win.EVSE_REQUIREMENT_SPEC.DEFAULTS, {
  pileName: 'AI审图验证', standard: 'gb', archetype: 'dc-integrated', outputKw: 120,
  moduleKw: 30, gunCount: 2, gunCurrentA: 250, acVoltage: 380, voltageWindow: '200-1000',
  thermal: 'liquid', essEnabled: false, requirementConfirmed: true
}));
const rendered = win.EVSE_SCHEMATIC_SHEET_RENDERING.buildDocument(built);

console.log('=== 不传 rendered（旧行为）===');
const c1 = win.SCHEMATIC_ENGINEERING_REVIEW.buildCase(built);
console.log('  含 drawingEvidence =', !!c1.drawingEvidence);
console.log('  顶层键:', Object.keys(c1).join(', '));

console.log('\n=== 传 rendered（新行为）===');
const c2 = win.SCHEMATIC_ENGINEERING_REVIEW.buildCase(built, { rendered });
console.log('  含 drawingEvidence =', !!c2.drawingEvidence);
const de = c2.drawingEvidence;
console.log('  document:', JSON.stringify(de.document));
console.log('  页数 =', de.sheets.length);
de.sheets.forEach((s) => {
  console.log('   ' + s.sheetId + ' 图号=' + s.drawingNo + ' ' + s.format + ' ' +
    s.widthMm + '×' + s.heightMm + 'mm  器件=' + s.deviceCount + ' 走线=' + s.routeCount +
    ' 跨页符=' + s.offPageConnectorCount + ' 闸门=' + s.gate);
  console.log('        反读=' + s.renderedSvgAudit.status + '(blocking ' + s.renderedSvgAudit.blockingCount + ')' +
    '  视觉=' + s.visualQuality.status + '(review ' + s.visualQuality.reviewCount + ')' +
    '  coverage.ok=' + s.coverage.ok);
});
console.log('\n  layout 抽样（前 3）:');
de.sheets[0].layout.slice(0, 3).forEach((l) => console.log('   ' + JSON.stringify(l)));

console.log('\n=== reviewCaseHash 是否随证据变化 ===');
console.log('  旧 hash =', c1.reviewCaseHash);
console.log('  新 hash =', c2.reviewCaseHash);
console.log('  两者不同 =', c1.reviewCaseHash !== c2.reviewCaseHash);

console.log('\n=== 上下文体积 ===');
console.log('  旧 =', Math.round(JSON.stringify(c1).length / 1024), 'KB');
console.log('  新 =', Math.round(JSON.stringify(c2).length / 1024), 'KB');
console.log('  超出 API 上限风险（MAX 见 api/engineering.js）: 需人工确认');
