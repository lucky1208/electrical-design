/* AIDC sch_lib drawing-skill contract tests: node tests/drawing-skill.test.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const win = {};

function load(name) {
  const source = fs.readFileSync(path.join(ROOT, 'js', name), 'utf8');
  (new Function('window', 'document', source))(win, {});
}

[
  'symbols.js', 'design-model.js', 'drawing-skill.js', 'vendors.js', 'engine.js',
  'layout.js', 'pictograms.js', 'assetlib.js', 'draw-arch.js', 'draw-wiring.js',
  'draw-dual.js', 'draw-cooling.js', 'draw-thermal.js'
].forEach(load);

const params = {
  projName: '绘图规则测试项目', region: '上海', tier: 'tier3', gpuType: 'h100',
  gpuCount: 800, itLoad: 12000, voltage: '10', redundancy: '2n1',
  cooling: 'liquid', pueTarget: 1.25, rackPower: 40, gridScMva: 500,
  txUkPct: 6, upsBackupMin: 15, cduUnitKw: 500, supplyTemp: 35,
  returnTemp: 45, pricePeak: 1.05, priceValley: 0.35
};

const result = win.AIDC_ENGINE.build(params);
const skill = win.AIDC_DRAWING_SKILL;
assert.ok(skill, '绘图 skill 必须装载');
assert.strictEqual(skill.ID, 'AIDC-SCH-LIB-DRAWING-SKILL');
assert.strictEqual(skill.BASIS_STATUS, 'REFERENCE_DERIVED—PROFESSIONAL_REVIEW_REQUIRED');
assert.ok(skill.SOURCE_LIBRARY.length >= 10, '规则包应记录已复核的参考图来源');
assert.ok(skill.RULES.length >= 15, '规则包应包含拓扑、布局、标注和文控规则');
assert.ok(skill.RULES.every((rule) => rule.id && rule.group && rule.enforcement && rule.text));
assert.ok(skill.RULES.every((rule) => !/APPROVED|CERTIFIED/.test(rule.basis || '')), '参考图规律不得伪装成已批准标准');

assert.strictEqual(result.drawingSkill.status, 'ACTIVE');
assert.strictEqual(result.drawingSkill.graphValidation.blockingCount, 0);
assert.ok(result.drawingSkill.selectedRuleIds.length > result.drawingSkill.evaluatedRuleIds.length, '候选/指导规则不得伪装成机器已检查');
assert.ok(result.drawingSkill.appliedRuleIds.includes('TOP-001'));
assert.ok(result.drawingSkill.appliedRuleIds.includes('PID-001'));

/* Every in-use object is port based; every edge lands on declared ports. */
const equipmentById = Object.fromEntries(result.design.equipment.map((item) => [item.id, item]));
result.design.equipment.filter((item) => Number(item.quantity || 0) > 0).forEach((item) => {
  assert.ok(Array.isArray(item.ports) && item.ports.length, item.id + ' 缺少命名端口');
});
result.design.circuits.forEach((edge) => {
  const from = equipmentById[edge.from], to = equipmentById[edge.to];
  assert.ok(from && to, edge.id + ' 存在悬空设备引用');
  assert.ok(from.ports.some((port) => port.id === edge.fromPort), edge.id + ' 起点端口无效');
  assert.ok(to.ports.some((port) => port.id === edge.toPort), edge.id + ' 终点端口无效');
  assert.ok(edge.netClass && edge.direction, edge.id + ' 缺少网络语义');
});

const pipeMedia = result.design.circuits.filter((edge) => edge.kind === 'pipe').map((edge) => edge.medium);
['secondary-supply', 'secondary-return', 'primary-supply', 'primary-return', 'condenser-supply', 'condenser-return']
  .forEach((medium) => assert.ok(pipeMedia.includes(medium), medium + ' 回路缺失'));

const drawingFunctions = {
  architecture: 'drawArch',
  'single-line': 'drawWiring',
  'dual-path': 'drawDual',
  'cooling-pid': 'drawCooling',
  thermal: 'drawThermal'
};

for (const [drawingKey, functionName] of Object.entries(drawingFunctions)) {
  const markup = win[functionName](result);
  assert.ok(markup.includes('data-drawing-skill="' + skill.ID + '"'), drawingKey + ' 缺少 skill 元数据');
  assert.ok(markup.includes('data-drawing-profile="' + skill.profileFor(drawingKey).id + '"'), drawingKey + ' 缺少 profile 元数据');
  const audit = skill.auditMarkup(markup, drawingKey, result);
  skill.recordDrawingAudit(result, drawingKey, audit);
  assert.strictEqual(audit.blockingCount, 0, drawingKey + ' 未通过渲染规则：' + JSON.stringify(audit.checks.filter((item) => !item.ok)));
}
skill.finalizeDrawingAudits(result);
assert.strictEqual(result.drawingSkill.renderBlockingCount, 0);
assert.strictEqual(skill.canExport(result, 'cooling-pid', 'SVG').allowed, true);

const coolingSvg = win.drawCooling(result);
assert.ok(coolingSvg.includes('CW-S-001') && coolingSvg.includes('CW-R-001'), '冷却水供回必须明确标识');
assert.ok(coolingSvg.includes('CHWS-001') && coolingSvg.includes('CHWR-001'), '一次水供回必须明确标识');
assert.ok(coolingSvg.includes('LCWS-001') && coolingSvg.includes('LCWR-001'), '二次水供回必须明确标识');
assert.ok(coolingSvg.includes('TK-101 定压补水') && coolingSvg.includes('XV-201'), '定压补水装置必须实际接入回路');
assert.ok(coolingSvg.includes('机柜分组核对：') && coolingSvg.includes('= ' + result.compute.gpuRacks + ' 柜'), '聚合机柜数量必须回算到工程模型');
assert.strictEqual((coolingSvg.match(/TT-101/g) || []).length, 1, '仪表位号不得重复');

/* Fault injection proves the validator and export gate fail closed. */
const badPort = JSON.parse(JSON.stringify(result));
badPort.design.circuits[0].fromPort = 'not-a-port';
const badPortReport = skill.validateGraph(badPort);
assert.ok(badPortReport.blockingCount > 0);
assert.ok(badPortReport.violations.some((item) => item.code === 'E001-EDGE-PORT'));

const openCooling = JSON.parse(JSON.stringify(result));
openCooling.design.circuits = openCooling.design.circuits.filter((edge) => edge.medium !== 'primary-return');
const openCoolingReport = skill.validateGraph(openCooling);
assert.ok(openCoolingReport.violations.some((item) => item.code === 'E009-COOLING-LOOPS'));

const wrongNetwork = JSON.parse(JSON.stringify(result));
wrongNetwork.design.circuits[0].netClass = 'POWER_LV';
assert.ok(skill.validateGraph(wrongNetwork).violations.some((item) => item.code === 'E002-PORT-NETCLASS'));

const falseLoop = JSON.parse(JSON.stringify(result));
const primaryReturn = falseLoop.design.circuits.find((edge) => edge.medium === 'primary-return');
primaryReturn.from = 'EQ-CH-01'; primaryReturn.fromPort = 'chw-supply';
primaryReturn.to = 'EQ-CDU-01'; primaryReturn.toPort = 'primary-in';
assert.ok(skill.validateGraph(falseLoop).violations.some((item) => item.code === 'E009-CLOSED-PRIMARY'), '仅有供回名称但未形成有向闭环时必须阻断');

const badMarkupAudit = skill.auditMarkup('<svg></svg>', 'single-line', result);
assert.ok(badMarkupAudit.blockingCount > 0);
const unaudited = win.AIDC_ENGINE.build(params);
assert.strictEqual(skill.canExport(unaudited, 'single-line', 'DXF').allowed, false, '未审计图纸必须禁止导出');
assert.strictEqual(skill.profileFor('typo-profile'), null, '未知图型不得静默降级为架构图');
assert.strictEqual(skill.auditMarkup('<svg></svg>', 'typo-profile', result).status, 'BLOCKED');

const renderBlocked = win.AIDC_ENGINE.build(params);
for (const [drawingKey, functionName] of Object.entries(drawingFunctions)) {
  const markup = win[functionName](renderBlocked);
  skill.recordDrawingAudit(renderBlocked, drawingKey, skill.auditMarkup(markup, drawingKey, renderBlocked));
}
skill.recordDrawingAudit(renderBlocked, 'thermal', {
  drawingKey: 'thermal', profile: 'functional-block', status: 'BLOCKED', blockingCount: 1,
  evaluatedRuleIds: ['DOC-001'],
  checks: [{ code: 'G000-TEST', ruleId: 'DOC-001', ok: false, severity: 'ERROR', detail: '故障注入' }]
});
skill.finalizeDrawingAudits(renderBlocked);
skill.finalizeDrawingAudits(renderBlocked);
assert.strictEqual(renderBlocked.drawingSkill.status, 'BLOCKED');
assert.strictEqual(renderBlocked.design.drawingSkill.status, 'BLOCKED', '运行报告与 ADEM 状态必须同步');
assert.strictEqual(renderBlocked.validation.find((item) => item.id === 'DRAW-SKILL-001').result, 'WARN');
assert.strictEqual(renderBlocked.readiness.blockingItems.filter((item) => item.id === 'DRAWING-THERMAL').length, 1, '重复 finalize 不得追加重复阻断项');
assert.strictEqual(renderBlocked.warnings.filter((item) => item === '至少一张图未通过绘图 skill 渲染检查，已阻止评审包发布。').length, 1, '重复 finalize 不得追加重复警告');
assert.strictEqual(skill.canExport(renderBlocked, 'single-line', 'DXF').allowed, false, '全图集存在阻断时不得绕过导出闸门');

console.log('drawing-skill.test.js: PASS');
