/* 布线层测试: node tests/router.test.js
 * 断言：全参数矩阵零未布通、轨道间距合规、走线不穿设备、结果确定。 */
'use strict';
const assert = require('assert');
const { load, build } = require('./_load.js');
const win = load();
const RT = win.EVSE_ROUTER;

/* ---------- 1. 单元：区间着色必须复用不重叠的轨道 ---------- */
const tracks = [100, 106, 112, 118, 124];
const disjoint = [
  { id: 'a', from: { x: 0, y: 0 }, to: { x: 50, y: 200 } },
  { id: 'b', from: { x: 200, y: 0 }, to: { x: 250, y: 200 } },
  { id: 'c', from: { x: 400, y: 0 }, to: { x: 450, y: 200 } }
];
const r1 = RT.assignLanes(disjoint, tracks, []);
assert.deepStrictEqual(r1.result.map((r) => r.lane), [0, 0, 0], '不重叠的走线必须复用同一轨道');

const overlapping = [
  { id: 'a', from: { x: 0, y: 0 }, to: { x: 400, y: 200 } },
  { id: 'b', from: { x: 10, y: 0 }, to: { x: 410, y: 200 } },
  { id: 'c', from: { x: 20, y: 0 }, to: { x: 420, y: 200 } }
];
const r2 = RT.assignLanes(overlapping, tracks, []);
assert.deepStrictEqual(r2.result.map((r) => r.lane), [0, 1, 2], '完全重叠的走线必须各占一条轨道');
console.log('✓ 区间着色：不重叠复用轨道、重叠强制分轨');

/* ---------- 2. 走线不得穿越设备 ---------- */
const box = { id: 'BLOCK', x: 180, y: 90, w: 80, h: 60 };
const through = [{ id: 'x', from: { x: 100, y: 0 }, to: { x: 400, y: 200 } }];
const r3 = RT.assignLanes(through, [100, 106, 160], [box]);
assert.ok(r3.result[0], '应能找到可用轨道');
assert.ok(r3.result[0].laneY === 160, '穿设备的轨道必须被跳过，改用下一条可用轨道');
console.log('✓ 障碍避让：撞设备的轨道被跳过');

/* ---------- 3. 端点落在自身设备框内不算撞设备 ---------- */
const own = { id: 'SELF', x: 90, y: -10, w: 40, h: 30 };
const r4 = RT.assignLanes([{ id: 'y', from: { x: 100, y: 0 }, to: { x: 400, y: 200 } }], [100], [own]);
assert.ok(r4.result[0], '起点所属设备的外框不得判为障碍');
console.log('✓ 自身设备豁免：从端子引出的第一段不被自己的外框判死');

/* ---------- 4. 全参数矩阵：零未布通 ---------- */
let cases = 0, maxLanes = 0;
for (const standard of ['gb', 'eu', 'us']) {
  for (const gunCount of [1, 2, 3, 4]) {
    for (const essEnabled of [true, false]) {
      const R = build(win, { standard, gunCount, essEnabled });
      const svg = win.drawPile(R);
      const warn = /未布通信号 (\d+)/.exec(svg);
      assert.ok(!warn, `${standard}/${gunCount}枪/储能${essEnabled} 存在未布通信号 ${warn && warn[1]} 根`);
      const P = win.EVSE_PLACEMENT.compute(R);
      const sig = P.guns.flatMap((g) => g.signals);
      const K = P.control;
      const a1 = P.channels.attachTop(K.A1.box, sig.filter((x) => x.dest === 'A1').length || 1);
      const a2 = P.channels.attachTop(K.A2.box, sig.filter((x) => x.dest === 'A2').length || 1);
      let i1 = 0, i2 = 0;
      const nets = sig.map((L) => ({ id: 'S', from: { x: L.x, y: L.y }, to: L.dest === 'A2' ? a2[i2++] : a1[i1++], exempt: [L.dest] }));
      const res = RT.route(nets, P.channels.signal, P.obstacles());
      assert.strictEqual(res.unrouted.length, 0, `${standard}/${gunCount}枪 有 ${res.unrouted.length} 根信号布不通`);
      /* 同一轨道上的走线水平区间必须留出净距 */
      const byLane = {};
      res.routes.forEach((r, i) => {
        (byLane[r.laneY] = byLane[r.laneY] || []).push([Math.min(nets[i].from.x, nets[i].to.x), Math.max(nets[i].from.x, nets[i].to.x)]);
      });
      Object.entries(byLane).forEach(([y, ivs]) => {
        ivs.sort((a, b) => a[0] - b[0]);
        for (let k = 1; k < ivs.length; k += 1) {
          assert.ok(ivs[k][0] - ivs[k - 1][1] >= RT.CLEARANCE,
            `轨道 y=${y} 上两根走线水平间隙不足 ${RT.CLEARANCE}px`);
        }
      });
      maxLanes = Math.max(maxLanes, res.lanesUsed);
      cases += 1;
    }
  }
}
console.log(`✓ 参数矩阵 ${cases} 组：零未布通，最大轨道占用 ${maxLanes} 条`);

/* ---------- 5. 确定性：同输入同输出 ---------- */
const R0 = build(win, { standard: 'gb', gunCount: 4 });
assert.strictEqual(win.drawPile(R0), win.drawPile(build(win, { standard: 'gb', gunCount: 4 })), '布线结果必须确定');
console.log('✓ 确定性：相同输入布线结果完全一致');

console.log('\n布线层测试全部通过。');
