/* 图 ↔ 网表一致性闸门测试: node tests/netlist-consistency.test.js */
'use strict';
const assert = require('assert');
const { load, build } = require('./_load.js');
const win = load();
const SKILL = win.EVSE_DRAWING_SKILL;
const KEY = 'ev-schematic';
const pick = (a, code) => a.checks.find((c) => c.code === code);

/* ---------- 1. 正常图必须全部通过 ---------- */
let cases = 0, minCov = 100;
for (const standard of ['gb', 'eu', 'us']) {
  for (const gunCount of [1, 2, 3, 4]) {
    for (const essEnabled of [true, false]) {
      const R = build(win, { standard, gunCount, essEnabled });
      const a = SKILL.auditMarkup(win.drawPile(R), KEY, R);
      ['G050-NET-COVERAGE', 'G051-NET-ORPHAN', 'G052-NET-CONTINUITY'].forEach((code) => {
        const c = pick(a, code);
        assert.ok(c && c.ok, `${standard}/${gunCount}枪 未通过 ${code}：${c && c.detail}`);
      });
      const cov = Number(/（(\d+)%）/.exec(pick(a, 'G050-NET-COVERAGE').detail)[1]);
      minCov = Math.min(minCov, cov);
      cases += 1;
    }
  }
}
console.log(`✓ ${cases} 组参数：三条一致性闸门全通过（最低回路覆盖率 ${minCov}%）`);

/* ---------- 2. 缺陷注入：图上出现网表里没有的回路 ---------- */
const R = build(win, { standard: 'gb', gunCount: 2 });
const svg = win.drawPile(R);
const ghost = svg.replace('</svg>',
  '<line x1="100" y1="1100" x2="200" y2="1100" stroke="#dc2626" stroke-width="1.4" data-w="1" data-circuit="CCT-FAKE-99" data-role="power-dc"/></svg>');
assert.ok(!pick(SKILL.auditMarkup(ghost, KEY, R), 'G051-NET-ORPHAN').ok, 'G051 必须抓到网表中不存在的回路');
console.log('✓ G051 抓到"图上多画了网表没有的回路"');

/* ---------- 3. 缺陷注入：无归属的孤立走线 ---------- */
const orphan = svg.replace('</svg>',
  '<line x1="100" y1="1100" x2="200" y2="1100" stroke="#dc2626" stroke-width="1.4" data-w="1"/></svg>');
assert.ok(!pick(SKILL.auditMarkup(orphan, KEY, R), 'G051-NET-ORPHAN').ok, 'G051 必须抓到无回路无角色的孤立走线');
console.log('✓ G051 抓到"既无回路也无角色的孤立线"');

/* ---------- 4. 缺陷注入：同一导线被画断 ---------- */
const broken = svg.replace('</svg>',
  '<line x1="20" y1="1100" x2="60" y2="1100" stroke="#dc2626" stroke-width="1.6" data-w="1" data-circuit="CCT-G1-01" data-conductor="G1#DC+in" data-role="power-dc"/></svg>');
assert.ok(!pick(SKILL.auditMarkup(broken, KEY, R), 'G052-NET-CONTINUITY').ok, 'G052 必须抓到同一导线的断开段');
console.log('✓ G052 抓到"同一导线出现断开的孤立段"');

/* ---------- 5. 缺陷注入：网表新增回路而图上未画且未登记 ---------- */
const R2 = build(win, { standard: 'gb', gunCount: 2 });
R2.design.circuits.push({ id: 'CCT-NEWDEV-01', kind: 'electrical', netClass: 'POWER_DC', direction: 'from-to', voltageV: 750 });
const missing = SKILL.auditMarkup(win.drawPile(R2), KEY, R2);
assert.ok(!pick(missing, 'G050-NET-COVERAGE').ok, 'G050 必须抓到"网表有回路但图上没画且未登记为已知缺口"');
console.log('✓ G050 抓到"网表新增回路而图上漏画"');

/* ---------- 6. 已知缺口必须在规则包里登记（渲染器不能自我开脱） ---------- */
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'engine', 'drawing-skill.js'), 'utf8');
assert.ok(/UNDRAWN_CIRCUITS/.test(src), '已知缺口清单必须位于规则包');
const render = require('fs').readFileSync(require('path').join(__dirname, '..', 'engine', 'draw-pile.js'), 'utf8');
assert.ok(!/UNDRAWN|allowlist|白名单/.test(render), '渲染器不得自带缺口白名单——否则等于自己给自己发合格证');
console.log('✓ 已知缺口登记在规则包而非渲染器');

console.log('\n图↔网表一致性测试全部通过。');
