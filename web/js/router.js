/* ============================================================
 * EVSE 布线层 v1.0 —— 通道模型正交布线
 * ------------------------------------------------------------
 * 输入：网表边（源端口 → 目标端口）+ 布局层的通道与障碍物
 * 输出：每条边的正交折点 polyline，附带轨道号与所属回路 ID
 *
 * 为什么不用像素级 A*：
 *   原理图是稀疏图，A* 出来的路径拐点多、不规整、代价函数难调，
 *   也不符合电气制图习惯。真实原理图用的是"通道 + 轨道"：
 *   走线在分区之间的空白带里排队，互不重叠的走线共用同一轨道。
 *
 * 轨道分配用区间图着色（贪心，按区间左端排序）：
 *   两条走线只有 x 区间重叠时才必须占不同轨道，
 *   因此"≥6px 间距"（LIB-R19）是构造性保证，而不是靠人工错开 i*10。
 *   枪数少时会自然收敛到很少几条轨道。
 *
 * 本层不产出 SVG，只产出几何；半圆交叉仍由 SYM.resolveCrossings 统一后处理。
 * ============================================================ */
window.EVSE_ROUTER = (function () {
  'use strict';

  const ID = 'EVSE-ROUTER';
  const VERSION = '1.0.0';
  const CLEARANCE = 8;   /* 同轨道相邻走线的最小水平间隙 */

  function hitsBox(seg, box, pad) {
    const p = pad == null ? 2 : pad;
    const x0 = Math.min(seg.x1, seg.x2) - p, x1 = Math.max(seg.x1, seg.x2) + p;
    const y0 = Math.min(seg.y1, seg.y2) - p, y1 = Math.max(seg.y1, seg.y2) + p;
    return !(x1 < box.x || x0 > box.x + box.w || y1 < box.y || y0 > box.y + box.h);
  }
  function inBox(x, y, b, pad) {
    const p = pad == null ? 3 : pad;
    return x >= b.x - p && x <= b.x + b.w + p && y >= b.y - p && y <= b.y + b.h + p;
  }
  /* 端点落在某个障碍内 ⇒ 那正是本走线所属设备的外框，不算"撞设备"。
   * 否则任何从设备端子引出的走线，第一段都会被自己的设备框判死。 */
  function blocked(segs, obstacles, exempt, endpoints) {
    return segs.some((sg) => obstacles.some((b) => {
      if ((exempt || []).includes(b.id)) return false;
      if ((endpoints || []).some((pt) => inBox(pt[0], pt[1], b))) return false;
      return hitsBox(sg, b);
    }));
  }

  /* 一条走线的候选路径：源点竖直下引 → 轨道横走 → 落点竖直进入目标顶边 */
  function pathFor(net, laneY) {
    const pts = [[net.from.x, net.from.y], [net.from.x, laneY], [net.to.x, laneY], [net.to.x, net.to.y]];
    const segs = [];
    for (let i = 0; i < pts.length - 1; i += 1) {
      segs.push({ x1: pts[i][0], y1: pts[i][1], x2: pts[i + 1][0], y2: pts[i + 1][1] });
    }
    return { pts, segs };
  }

  /* 区间图着色：按区间左端排序，贪心分配最低可用轨道 */
  function assignLanes(nets, trackList, obstacles) {
    const order = nets.map((n, i) => ({ n, i })).sort((a, b) => {
      const la = Math.min(a.n.from.x, a.n.to.x), lb = Math.min(b.n.from.x, b.n.to.x);
      return la - lb || a.i - b.i;
    });
    const laneEnd = new Array(trackList.length).fill(-Infinity);
    const result = new Array(nets.length).fill(null);
    const overflowed = [];
    order.forEach(({ n, i }) => {
      const lo = Math.min(n.from.x, n.to.x), hi = Math.max(n.from.x, n.to.x);
      let placed = false;
      for (let k = 0; k < trackList.length; k += 1) {
        if (laneEnd[k] + CLEARANCE > lo) continue;             /* 该轨道尚被占用 */
        const cand = pathFor(n, trackList[k]);
        const ends = [[n.from.x, n.from.y], [n.to.x, n.to.y]];
        if (blocked(cand.segs, obstacles, n.exempt, ends)) continue;  /* 撞设备，换轨道 */
        laneEnd[k] = hi;
        result[i] = { lane: k, laneY: trackList[k], points: cand.pts };
        placed = true;
        break;
      }
      if (!placed) overflowed.push(i);
    });
    return { result, overflowed };
  }

  /* 主入口：nets = [{id, from:{x,y}, to:{x,y}, color, width, exempt[]}] */
  function route(nets, channel, obstacles) {
    const primary = (channel.primary || []).slice();
    const overflow = (channel.overflow || []).slice();
    const first = assignLanes(nets, primary, obstacles);
    const routes = first.result;
    if (first.overflowed.length) {
      /* 主通道不够用：溢出的走线改用备用通道，仍走区间着色，绝不叠线 */
      const rest = first.overflowed.map((i) => nets[i]);
      const second = assignLanes(rest, overflow, obstacles);
      second.result.forEach((r, k) => { if (r) routes[first.overflowed[k]] = r; });
      if (second.overflowed.length) {
        return { routes, unrouted: second.overflowed.map((k) => rest[k].id), lanesUsed: primary.length + overflow.length };
      }
    }
    const used = new Set(routes.filter(Boolean).map((r) => r.laneY));
    return { routes, unrouted: routes.map((r, i) => (r ? null : nets[i].id)).filter(Boolean), lanesUsed: used.size };
  }

  return { ID, VERSION, CLEARANCE, route, assignLanes, hitsBox };
})();
