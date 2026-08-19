/* 引擎回归: node tests/engine.test.js */
'use strict';
const assert = require('assert');
const { load, build, BASE } = require('./_load.js');
const win = load();

const A = build(win), B = build(win);
assert.strictEqual(JSON.stringify(A), JSON.stringify(B), '相同输入必须完全一致（确定性）');
assert.strictEqual(A.drawingSkill.graphValidation.blockingCount, 0, '正常模型语义图不得有阻断项');
assert.strictEqual(A.releaseGate.constructionDrawingAllowed, false, '不得开放生产图发布');

/* 选型裕度 */
assert.ok(A.ac.breakerA >= A.ac.inputA * 1.25, '进线断路器须留 25% 裕度');
assert.ok(A.dc.mainFuseA >= A.dc.mainCurrentA * 1.25, '直流总快熔须留裕度');
A.guns.forEach((g) => {
  assert.ok(g.fuseA >= g.currentA * 1.25 && g.contactorA >= g.currentA * 1.25, '枪回路器件须留裕度');
});
assert.ok(A.ac.inputKva > A.dc.installedKw / 0.95 / 0.99, '进线容量必须计入辅助与热管理负荷');

/* 位号唯一 */
const tags = A.schedule.map((r) => r.tag);
assert.strictEqual(tags.length, new Set(tags).size, '设备明细表位号必须唯一');

/* 储能：优先最少簇数 */
assert.strictEqual(A.ess.clusterCount, 1, '200kWh 应由 1 簇满足');
assert.ok(A.ess.installedKwh >= A.ess.requestedKwh, '装机容量不得低于目标');

/* 无储能时不得残留储能对象 */
const N = build(win, { essEnabled: false });
assert.strictEqual(N.design.equipment.filter((e) => /^(battery|ess)-/.test(e.kind)).length, 0, '无储能时不得残留储能设备');
assert.strictEqual(N.drawingSkill.graphValidation.blockingCount, 0);

/* 三标准 */
['gb', 'eu', 'us'].forEach((id) => {
  const R = build(win, { standard: id, acVoltage: null });
  assert.strictEqual(R.drawingSkill.graphValidation.blockingCount, 0, id + ' 语义图必须无阻断');
  assert.strictEqual(R.ac.lineVoltage, win.EV_STD.standard(id).acLineVoltage, id + ' 缺省进线电压');
});

/* 校核清单不得伪装成合规结论 */
const txt = JSON.stringify(A.validation);
assert.ok(!/\b(?:PASS|COMPLIANT|CERTIFIED|APPROVED)\b/i.test(txt), '不得输出合规/签发结论');
assert.ok(A.validation.some((v) => v.result === 'NOT_CHECKED'), '必须保留未校核项');
assert.ok(A.bom.every((b) => b.status === 'RFQ_REQUIRED'), '目录条目必须标 RFQ_REQUIRED');

console.log('引擎回归通过：确定性、选型裕度、位号唯一、储能簇配置、三标准、校核边界。');
