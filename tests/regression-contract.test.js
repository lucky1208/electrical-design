/*
 * Independent release-contract regression suite.
 *
 * This deliberately tests output contracts rather than duplicating individual
 * renderer implementation details: physical A3 SVG, concept-only scope, and
 * the static DXF export contract.  Run with:
 *   node tests/regression-contract.test.js
 */
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
  'symbols.js', 'design-model.js', 'vendors.js', 'engine.js', 'layout.js',
  'pictograms.js', 'assetlib.js', 'draw-arch.js', 'draw-wiring.js',
  'draw-dual.js', 'draw-cooling.js', 'draw-thermal.js'
].forEach(load);

const base = Object.freeze({
  projName: '回归验证智算中心', region: '上海', tier: 'tier3', gpuType: 'h100',
  gpuCount: 800, itLoad: 12000, voltage: '10', redundancy: '2n1',
  cooling: 'liquid', pueTarget: 1.25, rackPower: 40, gridScMva: 500,
  txUkPct: 6, upsBackupMin: 15, cduUnitKw: 500, supplyTemp: 35,
  returnTemp: 45, pricePeak: 1.05, priceValley: 0.35
});

const drawings = Object.freeze({
  drawArch: '系统架构图',
  drawWiring: '电气一次接线图',
  drawDual: '双路供电拓扑图',
  drawCooling: '液冷管路图',
  drawThermal: '热管理方案图'
});

const drawingKeys = Object.freeze({
  drawArch: 'architecture', drawWiring: 'single-line', drawDual: 'dual-path',
  drawCooling: 'cooling-pid', drawThermal: 'thermal'
});

const requiredCadLayers = Object.freeze([
  'AIDC-FRAME', 'AIDC-TEXT', 'AIDC-ANNO', 'AIDC-EQPT', 'AIDC-MV', 'AIDC-LV',
  'AIDC-UPS', 'AIDC-GEN', 'AIDC-BAT', 'AIDC-CTL', 'AIDC-COOL-SUP',
  'AIDC-COOL-RET', 'AIDC-COOL-COND'
]);

function build(overrides) {
  return win.AIDC_ENGINE.build(Object.assign({}, base, overrides || {}));
}

function getDrawings(result) {
  const out = {};
  for (const [fn, name] of Object.entries(drawings)) {
    const markup = win[fn](result);
    assert.strictEqual(typeof markup, 'string', name + ' 必须返回 SVG 字符串');
    assert.ok(markup.startsWith('<svg') && markup.includes('</svg>'), name + ' 必须返回完整 SVG');
    out[fn] = markup;
  }
  return out;
}

function assertA3Contract(markup, name) {
  const root = markup.match(/^<svg\b[^>]*>/);
  assert.ok(root, name + ' 缺少 SVG 根节点');
  const tag = root[0];
  assert.ok(/width="420mm"/.test(tag) && /height="297mm"/.test(tag), name + ' 必须以 420mm × 297mm 交付');
  assert.ok(/data-sheet-format="A3"/.test(tag) && /data-sheet-orientation="LANDSCAPE"/.test(tag) && /data-units="mm"/.test(tag), name + ' 缺少 A3 横向/mm 元数据');
  const viewBox = /viewBox="\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*"/.exec(tag);
  assert.ok(viewBox, name + ' 缺少可缩放 viewBox');
  const ratio = Number(viewBox[1]) / Number(viewBox[2]);
  assert.ok(Math.abs(ratio - 420 / 297) < 0.002, name + ' 虚拟画布与 A3 横向比例不一致');
}

function assertDocumentControl(result, allDrawings) {
  const control = result.design && result.design.documentControl;
  assert.ok(control, 'ADEM 必须输出文控对象');
  assert.strictEqual(control.documentClass, 'CONCEPTUAL_SCHEME');
  assert.strictEqual(control.revision, 'P01');
  assert.strictEqual(control.status, result.documentStatus);
  const register = control.drawingRegister || [];
  assert.deepStrictEqual(register.map((item) => item.key), Object.values(drawingKeys), '图纸登记册必须覆盖五张固定图纸');
  register.forEach((item) => {
    assert.strictEqual(item.sheet, 'A3');
    assert.strictEqual(item.orientation, 'LANDSCAPE');
    assert.strictEqual(item.revision, 'P01');
    assert.strictEqual(item.status, result.documentStatus);
  });
  assert.deepStrictEqual(control.cadLayerManifest.map((item) => item.name), requiredCadLayers, '工程模型与 CAD 图层清单必须一致');
  for (const [fn, markup] of Object.entries(allDrawings)) {
    const root = markup.match(/^<svg\b[^>]*>/);
    assert.ok(root, fn + ' 缺少 SVG 根节点');
    assert.ok(root[0].includes('data-document-control="CONCEPTUAL_SCHEME"'), fn + ' 缺少方案级文控类别');
    assert.ok(root[0].includes('data-document-key="' + drawingKeys[fn] + '"'), fn + ' 的 SVG 文控键与登记册不一致');
    assert.ok(root[0].includes('data-document-status="' + result.documentStatus + '"'), fn + ' 的 SVG 文档状态不一致');
    const encodedManifest = /data-cad-layer-manifest="([^"]+)"/.exec(root[0]);
    assert.ok(encodedManifest, fn + ' 缺少 CAD 图层清单');
    const decodedManifest = encodedManifest[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const layers = JSON.parse(decodedManifest).map((item) => item.name);
    assert.deepStrictEqual(layers, requiredCadLayers, fn + ' 的 SVG 图层清单与工程模型不一致');
    ['图号:', '修订: P01', '阶段: 方案级草图', '校核:', '批准:', '页: 1/1'].forEach((label) => {
      assert.ok(markup.includes(label), fn + ' 标题栏缺少字段：' + label);
    });
  }
}

function assertConceptOnly(result, markup, name) {
  assert.strictEqual(result.documentStatus, 'CONCEPT_DRAFT—PROFESSIONAL_REVIEW_REQUIRED');
  assert.ok(markup.includes('CONCEPT_DRAFT'), name + ' 必须显示方案级文档状态');
  assert.ok(/待(?:专业|专项|确认|校核)|不构成|不能声明/.test(markup), name + ' 必须声明尚待专业确认的边界');
  /* Positive construction/compliance claims are forbidden.  Scope notices such
   * as “不构成 IEC 合规认证” are intentionally allowed. */
  const prohibited = [
    /CONSTRUCTION[_ -]?READY/i,
    /施工图(?:级|交付|输出|已生成|已完成)/,
    /可直接(?:用于)?施工/,
    /(?:已|自动|满足|符合|通过).{0,8}(?:IEC|规范|Tier|合规|认证)/,
    /(?:IEC|规范|Tier|合规|认证).{0,8}(?:已|自动|满足|符合|通过)/
  ];
  prohibited.forEach((rule) => assert.ok(!rule.test(markup), name + ' 出现不允许的施工/合规正向声明：' + rule));
}

/* 1. 12 MW liquid cooling: heat duty must be based on IT heat, not PUE delta. */
const liquid = build();
assert.strictEqual(liquid.compute.itLoadKw, 12000);
assert.strictEqual(liquid.compute.coolingElectricalBudgetKw, 3000, 'PUE 差值仅是设施用电概念预算');
assert.strictEqual(liquid.cooling.liquidHeatKw, 12600, '液冷热负荷必须以 IT 热负荷 × 1.05 计算');
assert.ok(liquid.cooling.liquidHeatKw > liquid.compute.coolingElectricalBudgetKw, '不得以 PUE 差值代替冷却热负荷');
assert.strictEqual(liquid.cooling.cduActiveCount, 28);
assert.strictEqual(liquid.cooling.cduCount, 29, '应保留一台 CDU 概念冗余');
assert.ok(
  liquid.cooling.cduActiveCount * liquid.cooling.cduCap * 0.90 >= liquid.cooling.liquidHeatKw,
  'CDU 工作容量必须覆盖液冷热负荷'
);
assert.deepStrictEqual(
  liquid.design.circuits.filter((c) => c.loadType === 'dual-cord-it').map((c) => c.from).sort(),
  ['EQ-PDU-A', 'EQ-PDU-B'],
  '双输入关键 IT 负荷必须由独立 PDU-A/PDU-B 供电'
);
const liquidDrawings = getDrawings(liquid);
assertDocumentControl(liquid, liquidDrawings);
for (const [fn, name] of Object.entries(drawings)) {
  assertA3Contract(liquidDrawings[fn], name);
  assertConceptOnly(liquid, liquidDrawings[fn], name);
}

/* 2. Single-path air cooling: never fabricate a second critical path or P&ID. */
const airSinglePath = build({ tier: 'tier2', redundancy: 'n1', cooling: 'air' });
assert.strictEqual(airSinglePath.power.mainsCount, 1);
assert.strictEqual(airSinglePath.design.topology.powerPaths.length, 1);
assert.strictEqual(airSinglePath.cooling.isLiquid, false);
assert.strictEqual(airSinglePath.cooling.liquidHeatKw, 0);
assert.strictEqual(airSinglePath.cooling.cduCount, 0);
const airDrawings = getDrawings(airSinglePath);
assertDocumentControl(airSinglePath, airDrawings);
assert.ok(airDrawings.drawWiring.includes('B 路未配置') && !airDrawings.drawWiring.includes('PDU-B'), '单路径一次图不得伪装为 A/B PDU');
assert.ok(airDrawings.drawDual.includes('未建立双路关键 IT 供电路径'), '单路径拓扑图必须明确 B 路未建立');
assert.ok(airDrawings.drawCooling.includes('未启用液冷回路'), '风冷方案不得输出液冷 P&ID');
assert.ok(airDrawings.drawThermal.includes('未启用液冷热管理链路'), '风冷方案不得输出液冷热管理链路');
for (const [fn, name] of Object.entries(drawings)) {
  assertA3Contract(airDrawings[fn], name + '（风冷单路径）');
  assertConceptOnly(airSinglePath, airDrawings[fn], name + '（风冷单路径）');
}

/* 3. 35 kV needs a transformer capacity absent from the sample catalogue. */
const voltage35 = build({ voltage: '35' });
const txSelection = voltage35.selection.transformer;
assert.strictEqual(txSelection.recommended, null, '目录不匹配时不得伪造变压器推荐型号');
assert.strictEqual(txSelection.status, 'NO_CAPACITY_MATCH—RFQ_REQUIRED');
assert.ok(txSelection.options.every((option) => option.compatible === false));
assert.ok(voltage35.warnings.some((warning) => warning.includes('无满足容量')));
const txBom = voltage35.bom.find((item) => item.name === '干式变压器组');
assert.ok(txBom && txBom.status === 'NO_CAPACITY_MATCH—RFQ_REQUIRED' && /无目录容量匹配/.test(txBom.model));

/* 4. Engine validation may report calculated/assumed/open items, never a code
 * certificate, construction approval, or a synthetic pass result. */
for (const result of [liquid, airSinglePath, voltage35]) {
  const statusText = JSON.stringify({ compliance: result.compliance, validation: result.validation, protection: result.protection });
  assert.ok(!/\b(?:PASS|COMPLIANT|CERTIFIED|APPROVED)\b/i.test(statusText), '方案级校核不得输出合规/签发结论');
  assert.ok(result.compliance.some((item) => /NOT_CHECKED|ASSUMPTION|CALCULATED|WARN|SKIP/.test(item.result)), '校核清单必须保留开放状态');
}

/* 5. DXF contract is statically checked because the browser DOMParser is not
 * available in a Node-only CI runner.  These tokens form the R2010/mm API
 * contract consumed by app.js. */
const dxfSource = fs.readFileSync(path.join(ROOT, 'js', 'dxf-export.js'), 'utf8');
const appSource = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
[
  'window.AIDC_DXF', 'exportSvg', 'DOMParser', 'AC1024', '$INSUNITS',
  "'AIDC-FRAME'", "'AIDC-TEXT'", "'AIDC-ANNO'", "'AIDC-EQPT'",
  "'AIDC-MV'", "'AIDC-LV'", "'AIDC-UPS'", "'AIDC-GEN'", "'AIDC-BAT'",
  "'AIDC-CTL'", "'AIDC-COOL-SUP'", "'AIDC-COOL-RET'", "'AIDC-COOL-COND'",
  'FALLBACK_LAYER_MANIFEST', 'manifestFromSvg', 'data-cad-layer-manifest',
  'documentFromSvg', 'paperMm'
].forEach((token) => assert.ok(dxfSource.includes(token), 'DXF 导出缺少静态契约：' + token));
assert.ok(/concept sketch|方案级.*草图|概念.*草图/i.test(dxfSource), 'DXF 导出必须明确为方案级草图，而非施工图');
assert.ok(!/\['(?:MV|LV|UPS|COOL-SUP|COOL-RET|COOL-COND)'\s*,/.test(dxfSource), 'DXF 不得退回无 AIDC 前缀的旧图层名称');
assert.ok(/downloadCurrentDxf/.test(appSource) && /AIDC_DXF/.test(appSource), '界面必须调用 DXF 概念草图导出器');
const dxfScriptIndex = htmlSource.indexOf('js/dxf-export.js');
const appScriptIndex = htmlSource.indexOf('js/app.js');
assert.ok(dxfScriptIndex >= 0 && appScriptIndex > dxfScriptIndex, 'DXF 导出器必须在 app.js 前加载');

console.log('AIDC release contracts: liquid, air/single-path, 35kV catalogue, concept-only SVG, and DXF static contract passed.');
