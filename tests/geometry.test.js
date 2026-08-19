/* 几何不变量测试（第0步核心）: node tests/geometry.test.js
 * 断言 resolveCrossings 的三条性质：正确、幂等、与绘制顺序无关。 */
'use strict';
const assert = require('assert');
const { load, build, unhopped } = require('./_load.js');
const win = load();
const S = win.SYM;

/* ---------- 1. 覆盖矩阵：任何参数组合都不得留下未跨越交叉 ---------- */
const CASES = [];
for (const standard of ['gb', 'eu', 'us']) {
  for (const gunCount of [1, 2, 3, 4]) {
    for (const essEnabled of [true, false]) {
      CASES.push({ standard, gunCount, essEnabled, essCoupling: essEnabled ? 'dc' : 'dc' });
    }
  }
}
let worst = null;
CASES.forEach((over) => {
  const svg = win.drawPile(build(win, over));
  const bad = unhopped(svg);
  if (bad.length && !worst) worst = { over, bad };
  assert.strictEqual(bad.length, 0,
    `${over.standard}/${over.gunCount}枪/储能${over.essEnabled} 留下 ${bad.length} 处未跨越交叉: ${bad.slice(0, 3)}`);
});
console.log(`✓ 覆盖矩阵 ${CASES.length} 组：未跨越交叉均为 0`);

/* ---------- 2. 幂等：已处理过的图再跑一次不应有任何变化 ---------- */
const once = win.drawPile(build(win, { standard: 'gb', gunCount: 4 }));
const twice = S.resolveCrossings(once);
assert.strictEqual(twice, once, 'resolveCrossings 必须幂等：重复处理不得再改动图元');
console.log('✓ 幂等性：重复后处理输出完全一致');

/* ---------- 3. 与绘制顺序无关 ----------
 * 旧实现（segV2/segH2 边画边查局部注册表）的结果取决于谁先画。
 * 这里把同一组线段以正序/逆序两种顺序喂给后处理器，未跨越交叉都必须为 0，
 * 且插入的半圆数量相同。 */
function hopCount(t) {
  return (String(t).match(/A\d+,\d+ 0 0,1/g) || []).length;
}
const mk = (segs) => '<svg><metadata></metadata>' + segs.join('') + '</svg>';
const H = (y, x1, x2) => S.wire(x1, y, x2, y, '#475569', 1.2);
const V = (x, y1, y2) => S.wire(x, y1, x, y2, '#475569', 1.2);
const grid = [];
for (let i = 0; i < 5; i += 1) grid.push(H(100 + i * 20, 50, 400));
for (let i = 0; i < 5; i += 1) grid.push(V(80 + i * 60, 50, 300));
const fwd = S.resolveCrossings(mk(grid));
const rev = S.resolveCrossings(mk(grid.slice().reverse()));
assert.strictEqual(unhopped(fwd).length, 0, '正序：5×5 网格必须无未跨越交叉');
assert.strictEqual(unhopped(rev).length, 0, '逆序：5×5 网格必须无未跨越交叉');
assert.strictEqual(hopCount(fwd), hopCount(rev), '半圆数量必须与绘制顺序无关');
assert.strictEqual(hopCount(fwd), 25, '5 横 × 5 竖应恰好产生 25 个半圆');
console.log('✓ 顺序无关性：正序/逆序半圆数一致（' + hopCount(fwd) + ' 个）');

/* ---------- 4. 让谁跳：细线让粗线（母排必须保持连续） ---------- */
const busTest = S.resolveCrossings(mk([S.bus(50, 200, 300, '#dc2626', 5), V(150, 100, 300)]));
assert.ok(/M150,\d+(\.\d+)? A\d+,\d+ 0 0,1 150,/.test(busTest), '细的竖走线必须跳过粗母排');
assert.ok(busTest.includes('x1="50" y1="200" x2="350" y2="200"'), '母排必须保持完整不被打断');
console.log('✓ 让线规则：细线让粗线，母排保持连续');

/* ---------- 5. 走线不得输出为 polyline（否则闸门几何自检看不见） ---------- */
CASES.slice(0, 6).forEach((over) => {
  const svg = win.drawPile(build(win, over));
  assert.ok(!svg.includes('<polyline'), 'L 形走线必须拆成正交 <line>，polyline 是闸门盲区');
});
console.log('✓ 无 polyline 盲区：走线全部为可被闸门解析的 <line>');

/* ---------- 6. 设备符号内部线不得被打断 ---------- */
const symTest = S.resolveCrossings(mk([S.hbreaker(100, 200, '#1d4ed8', 'QF1'), V(122, 150, 260)]));
const brokenSym = (symTest.match(/<line(?![^>]*data-w)/g) || []).length;
const origSym = (mk([S.hbreaker(100, 200, '#1d4ed8', 'QF1')]).match(/<line(?![^>]*data-w)/g) || []).length;
assert.strictEqual(brokenSym, origSym, '设备符号内部线不得被后处理打断（只允许打断 data-w 走线）');
console.log('✓ 符号完整性：只打断走线，不打断设备符号');

console.log('\n几何不变量测试全部通过。');
