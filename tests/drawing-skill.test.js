/* 绘图规则包回归（注入缺陷必须被拦截）: node tests/drawing-skill.test.js */
'use strict';
const assert = require('assert');
const { load, build } = require('./_load.js');
const win = load();
const SKILL = win.EVSE_DRAWING_SKILL;
const R = build(win);
const KEY = 'ev-schematic';

const markup = win.drawPile(R);
const audit = SKILL.auditMarkup(markup, KEY, R);
assert.strictEqual(audit.blockingCount, 0,
  '正常渲染不得有阻断项：' + audit.checks.filter((c) => !c.ok).map((c) => c.code).join(','));

/* 关键文本缺失必须被抓到 */
/* 注意：部分检查是多选一（如 G033 匹配 绝缘监测|IMD|H100D），必须把同义词一并抹掉 */
[[['图例 LEGEND'], 'G005-LEGEND'], [['设备明细表'], 'G006-SCHEDULE'], [['急停'], 'G030-LIB-ESTOP'],
 [['绝缘监测', 'IMD', 'H100D'], 'G033-LIB-IMD'], [['开关电源'], 'G013-AUX'],
 [['风扇', '风机', '液冷', '热管理'], 'G034-LIB-THERMAL']].forEach(([tokens, code]) => {
  let broken = markup;
  tokens.forEach((t) => { broken = broken.split(t).join('＿'); });
  const res = SKILL.auditMarkup(broken, KEY, R);
  assert.ok(res.checks.some((c) => c.code === code && !c.ok), code + ' 未能抓到缺失的「' + tokens[0] + '」');
});

/* 注入一条未跨越交叉，G037 必须阻断 */
const injected = markup.replace('</svg>',
  '<line x1="100" y1="900" x2="900" y2="900" stroke="#475569" stroke-width="1.2" data-w="1"/>' +
  '<line x1="500" y1="700" x2="500" y2="1100" stroke="#475569" stroke-width="1.2" data-w="1"/></svg>');
const bad = SKILL.auditMarkup(injected, KEY, R);
assert.ok(bad.checks.some((c) => c.code === 'G037-LIB-CROSS' && !c.ok), 'G037 必须抓到注入的未跨越交叉');

/* 语义图缺陷注入 */
const codes = (res) => SKILL.validateGraph(res).violations.map((v) => v.code);
function mutate(fn) { const L = build(win); fn(L); return codes(L); }
assert.ok(mutate((L) => {
  const b = L.design.topology.gunBranches[0];
  L.design.equipment = L.design.equipment.filter((e) => e.id !== b.fuse);
}).includes('E021-GUN-PROTECTION'), '缺枪快熔必须被拦截');
assert.ok(mutate((L) => {
  L.design.circuits = L.design.circuits.filter((c) => c.id !== 'CCT-G1-06');
}).includes('E022-GUN-EARTH'), '缺枪 PE 必须被拦截');
assert.ok(mutate((L) => {
  L.design.equipment = L.design.equipment.filter((e) => e.kind !== 'surge-protector');
}).includes('E020-AC-PROTECTION'), '缺 SPD 必须被拦截');

/* 导出闸门 */
assert.strictEqual(SKILL.canExport(R, KEY, 'SVG').allowed, false, '未记录审计前禁止导出');
SKILL.recordDrawingAudit(R, KEY, audit);
SKILL.finalizeDrawingAudits(R);
assert.strictEqual(SKILL.canExport(R, KEY, 'SVG').allowed, true, '审计通过后应允许导出');

console.log('绘图规则包回归通过：文本缺失、几何交叉、语义缺陷注入与导出闸门。');
