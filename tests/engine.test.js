/* AIDC concept-engine regression suite: node tests/engine.test.js */
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

/* Keep load order identical to the browser dependency graph. */
['symbols.js', 'design-model.js', 'drawing-skill.js', 'vendors.js', 'engine.js', 'layout.js', 'pictograms.js', 'assetlib.js',
  'draw-arch.js', 'draw-wiring.js', 'draw-dual.js', 'draw-cooling.js', 'draw-thermal.js'].forEach(load);

const sample = {
  projName: '测试智算中心', region: '上海', tier: 'tier3', gpuType: 'h100', gpuCount: 800,
  itLoad: 12000, voltage: '10', redundancy: '2n1', cooling: 'liquid', pueTarget: 1.25,
  rackPower: 40, gridScMva: 500, txUkPct: 6, upsBackupMin: 15,
  cduUnitKw: 500, supplyTemp: 35, returnTemp: 45, pricePeak: 1.05, priceValley: 0.35
};

const R1 = win.AIDC_ENGINE.build(sample);
const R2 = win.AIDC_ENGINE.build(sample);
assert.strictEqual(JSON.stringify(R1), JSON.stringify(R2), '相同输入必须生成完全一致的工程模型');
assert.strictEqual(R1.engineVersion, '2.2.0');
assert.strictEqual(R1.design.schemaVersion, '2.2.0');
assert.strictEqual(R1.drawingSkill.id, 'AIDC-SCH-LIB-DRAWING-SKILL');
assert.strictEqual(R1.drawingSkill.graphValidation.blockingCount, 0, '正常模型必须通过端口/拓扑规则校验');
assert.strictEqual(R1.documentStatus, 'CONCEPT_DRAFT—PROFESSIONAL_REVIEW_REQUIRED');
assert.strictEqual(R1.readiness.level, 'CONCEPT_ONLY', '未声明核实的表单/接口输入只能产生概念方案');
assert.strictEqual(R1.releaseGate.constructionDrawingAllowed, false, '自动引擎不得开放施工图发布');
assert.strictEqual(R1.releaseGate.constructionStatus, 'BLOCKED—EXTERNAL_PROFESSIONAL_SIGNOFF_REQUIRED');
assert.ok(R1.readiness.summary.assumptionCount > 0, '默认或未核实的输入必须记为假设');
assert.ok(R1.readiness.blockingItems.some((item) => item.id === 'BASIS-GRID-001'));

/* Regression for the former fatal error: IT thermal duty cannot be derived from PUE delta. */
assert.strictEqual(R1.compute.facilityDemandKw, 15000, 'PUE 目标只用于设施输入概念预算');
assert.strictEqual(R1.compute.coolingElectricalBudgetKw, 3000);
assert.strictEqual(R1.cooling.liquidHeatKw, 12600, '液冷热负荷必须基于 IT 热负荷并含设计裕量');
assert.strictEqual(R1.cooling.cduActiveCount, 28);
assert.strictEqual(R1.cooling.cduCount, 29, 'CDU 应为 28 用 + 1 备');
assert.strictEqual(R1.cooling.flowLpm, 18060);
assert.strictEqual(R1.power.txTotal, 16);
assert.strictEqual(R1.power.upsTotal, 30);
assert.strictEqual(R1.pue.annual, null, '概念引擎不能伪造年度 PUE 结果');
assert.ok(R1.compliance.every((item) => item.result !== 'PASS'), '合规表不得把概念检查伪装为 PASS');

/* Canonical model must preserve two independent rack feeds and keep STS off that path. */
const criticalFeeds = R1.design.circuits.filter((item) => item.loadType === 'dual-cord-it');
assert.strictEqual(criticalFeeds.length, 2);
assert.deepStrictEqual(criticalFeeds.map((item) => item.from).sort(), ['EQ-PDU-A', 'EQ-PDU-B']);
assert.ok(R1.design.topology.auxiliarySts && R1.design.topology.auxiliarySts === 'EQ-STS-AUX');
assert.ok(R1.design.equipment.find((item) => item.id === 'EQ-STS-AUX').note.includes('不作为 GPU'));
assert.ok(R1.bom.every((item) => item.status === 'RFQ_REQUIRED'));

const drawings = {
  drawArch: '系统架构图', drawWiring: '电气一次接线图', drawDual: '双路供电拓扑图',
  drawCooling: '液冷管路图', drawThermal: '热管理方案图'
};
for (const [fn, name] of Object.entries(drawings)) {
  const svg = win[fn](R1);
  assert.ok(typeof svg === 'string' && svg.startsWith('<svg') && svg.includes('</svg>'), name + ' 未返回完整 SVG');
  assert.ok(svg.includes('width="420mm"') && svg.includes('height="297mm"') && svg.includes('data-sheet-format="A3"'), name + ' 必须使用 A3 物理图幅元数据');
  assert.ok(svg.includes('data-drawing-skill="AIDC-SCH-LIB-DRAWING-SKILL"'), name + ' 必须记录实际调用的绘图规则包');
  assert.ok(svg.includes('CONCEPT_DRAFT'), name + ' 必须标注方案级状态');
  assert.ok(!/undefined|null/.test(svg), name + ' 包含未解析字段');
}
const wiring = win.drawWiring(R1), dual = win.drawDual(R1);
assert.ok(wiring.includes('PDU-A') && wiring.includes('PDU-B') && wiring.includes('辅助负荷 STS'));
assert.ok(dual.includes('PDU-A') && dual.includes('PDU-B') && dual.includes('不经 STS'));

const air = win.AIDC_ENGINE.build(Object.assign({}, sample, { cooling: 'air' }));
assert.ok(win.drawCooling(air).includes('未启用液冷回路'));
assert.ok(win.drawThermal(air).includes('未启用液冷热管理链路'));

const singlePath = win.AIDC_ENGINE.build(Object.assign({}, sample, { tier: 'tier2', redundancy: 'n1', cooling: 'air' }));
const singlePathWiring = win.drawWiring(singlePath);
assert.strictEqual(singlePath.power.mainsCount, 1);
assert.ok(singlePathWiring.includes('B 路未配置') && !singlePathWiring.includes('PDU-B'), '单路径方案不得伪装成 A/B 双路图');
assert.ok(win.drawArch(singlePath).includes('未建立 B 路') && !win.drawArch(singlePath).includes('PDU-B'));

const noCatalogueMatch = win.AIDC_ENGINE.build(Object.assign({}, sample, { voltage: '35' }));
assert.strictEqual(noCatalogueMatch.selection.transformer.recommended, null, '无容量匹配时不得虚构目录推荐');
assert.strictEqual(noCatalogueMatch.selection.transformer.status, 'NO_CAPACITY_MATCH—RFQ_REQUIRED');
assert.ok(noCatalogueMatch.warnings.some((message) => message.includes('无满足容量')));
assert.ok(noCatalogueMatch.bom.some((item) => item.name === '干式变压器组' && item.status === 'NO_CAPACITY_MATCH—RFQ_REQUIRED' && item.model.includes('无目录容量匹配')));

/* A complete declaration may unlock professional review, but never construction issue. */
const confirmedInputMeta = {};
[
  'itLoad', 'gpuCount', 'gpuType', 'rackPower', 'tier', 'redundancy', 'voltage', 'gridScMva', 'txUkPct', 'powerFactor',
  'upsBackupMin', 'cooling', 'region', 'designWetBulb', 'cduUnitKw', 'supplyTemp', 'returnTemp', 'pueTarget', 'pricePeak', 'priceValley'
].forEach((key) => { confirmedInputMeta[key] = { provided: true, verified: true, source: 'PROJECT_DOCUMENT' }; });
const reviewReady = win.AIDC_ENGINE.build(Object.assign({}, sample, {
  powerFactor: 0.92,
  inputMeta: confirmedInputMeta,
  releaseEvidence: {
    shortCircuitStudy: { complete: true, source: 'PROJECT_DOCUMENT' },
    protectionStudy: { complete: true, source: 'PROJECT_DOCUMENT' },
    hydraulicStudy: { complete: true, source: 'PROJECT_DOCUMENT' },
    fireCivilCoordination: { complete: true, source: 'PROJECT_DOCUMENT' },
    vendorData: { complete: true, source: 'PROJECT_DOCUMENT' },
    cadDocumentControl: { complete: true, source: 'PROJECT_DOCUMENT' }
  }
}));
assert.strictEqual(reviewReady.readiness.level, 'REVIEW_READY');
assert.strictEqual(reviewReady.readiness.summary.declaredPct, 100);
assert.strictEqual(reviewReady.readiness.release.reviewPackageAllowed, true);
assert.strictEqual(reviewReady.readiness.release.constructionDrawingAllowed, false, '即使资料声明齐套，平台也不能出具施工图');
assert.ok(reviewReady.validation.some((item) => item.id === 'DOC-READINESS-001' && item.result === 'ASSUMPTION'));

console.log('AIDC concept-engine regression checks completed successfully.');
