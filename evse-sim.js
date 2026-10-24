/* ============================================================
 * EVSE-SIM v1.0 —— 通电仿真引擎（一键分合闸 → 全图带电传播 → 功率流动画数据）
 *   模型：端子 (dev:pin) 为节点；网络/跨页符/器件内部导通为边；
 *         电源（XT 进线端子排 L/N、GB 电池）为源点，并查集合并后 BFS 求层级定流向。
 *   开关：sym.isSwitch（makeSwitch 家族）——simOpen 状态由画布点击切换；
 *         SB 按钮默认分闸（NO），其余默认合闸。
 *   导通规则：
 *     母排(isBus)      同名母排（pin 名 '.' 后缀）全导通
 *     开关(isSwitch)   合闸时极对 (1-2,3-4,...) 导通；分闸断开；线圈端子 A1/A2 不参与
 *     两端器件         熔断器/电阻/传感器/变压器等：pin0↔pin1 恒导通
 *     模块 M× / PCS     多端功率变换：AC↔DC 双向导通（动画语义，含 V2G 反向）
 *     其余多端器件     枪/控制器/监测装置 = 终端负载，不导通
 * ============================================================ */
window.EVSE_SIM = (function () {
  'use strict';

  function isSwitchDev(dv) { return !!(dv && dv.sym && dv.sym.isSwitch && !dv.sym.isBus && !dv.sym.isXref); }
  function effectiveOpen(dv) {
    if (dv.simOpen != null) return !!dv.simOpen;
    return /^SB/i.test(String(dv.tag || dv.id || '')); /* 按钮 NO 默认分闸 */
  }

  function conductPairs(dv) {
    const sym = dv.sym || {}, pins = sym.pins || [], out = [];
    const tag = String(dv.tag || dv.id || '');
    if (sym.isXref || dv.pwr) return out;
    if (sym.isBus) {
      const g = {};
      pins.forEach(function (p) {
        const n = String(p.n), b = n.indexOf('.') >= 0 ? n.split('.').pop() : n;
        (g[b] = g[b] || []).push(n);
      });
      Object.keys(g).forEach(function (b) { for (let i = 1; i < g[b].length; i++) out.push([g[b][0], g[b][i]]); });
      return out;
    }
    if (sym.isSwitch) {
      if (effectiveOpen(dv)) return out; /* 分闸：主触头断开 */
      const main = pins.filter(function (p) { const n = String(p.n); return n !== 'A1' && n !== 'A2'; });
      for (let i = 0; i + 1 < main.length; i += 2) out.push([main[i].n, main[i + 1].n]);
      return out;
    }
    if (Array.isArray(sym.conductPairs)) return sym.conductPairs.slice();
    if (pins.length === 2) { out.push([pins[0].n, pins[1].n]); return out; }
    if (/^M\d+$/.test(tag) && pins.length > 2) { /* 功率模块 / PCS：域间双向 */
      for (let i = 1; i < pins.length; i++) out.push([pins[0].n, pins[i].n]);
      return out;
    }
    return out;
  }

  function computeLive(D) {
    const key = function (d, p) { return d + ':' + p; };
    const parent = {};
    const find = function (a) {
      if (parent[a] == null) parent[a] = a;
      let r = a;
      while (parent[r] !== r) r = parent[r];
      while (parent[a] !== r) { const t = parent[a]; parent[a] = r; a = t; }
      return r;
    };
    const union = function (a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    const edges = []; /* BFS 邻接（含跨页符） */
    const adj = {};
    const addEdge = function (a, b) { edges.push([a, b]); (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); };

    /* 1) 网络边 */
    (D.nets || []).forEach(function (n) {
      if (!n.a || !n.b) return;
      const a = key(n.a.d, n.a.p), b = key(n.b.d, n.b.p);
      union(a, b); addEdge(a, b);
    });
    /* 2) 跨页符配对：同 xpair 的网络端子并成一个节点 */
    const xp = {};
    (D.nets || []).forEach(function (n) {
      const g = n.xpair || (n.opt && n.opt.xpair);
      if (!g) return;
      const t = key(n.a.d, n.a.p);
      if (xp[g] == null) xp[g] = t;
      else { union(xp[g], t); addEdge(xp[g], t); }
      const t2 = key(n.b.d, n.b.p);
      union(xp[g], t2); addEdge(xp[g], t2);
    });
    /* 3) 器件内部导通边 */
    (D.devices || []).forEach(function (dv) {
      if (dv.x == null) return;
      conductPairs(dv).forEach(function (pr) {
        const a = key(dv.id, pr[0]), b = key(dv.id, pr[1]);
        union(a, b); addEdge(a, b);
      });
    });
    /* 4) 源点：进线端子排 XT*（PE 除外）+ 电池 GB* */
    const srcs = [];
    (D.devices || []).forEach(function (dv) {
      if (dv.x == null) return;
      const tag = String(dv.tag || '');
      if (/^XT\d*$/i.test(tag)) {
        (dv.sym.pins || []).forEach(function (p) { if (!/^PE/i.test(String(p.n)) && !/^PE/i.test(String(p.name || ''))) srcs.push(key(dv.id, p.n)); });
      } else if (/^GB\d*$/i.test(tag)) {
        (dv.sym.pins || []).forEach(function (p) { srcs.push(key(dv.id, p.n)); });
      }
    });
    /* 5) BFS 层级（流向） */
    const level = {};
    const q = [];
    srcs.forEach(function (t) { find(t); if (level[t] == null) { level[t] = 0; q.push(t); } });
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi], nb = adj[cur] || [];
      for (let i = 0; i < nb.length; i++) {
        if (level[nb[i]] == null) { level[nb[i]] = level[cur] + 1; q.push(nb[i]); }
      }
    }
    /* 6) 带电网络 + 每根线流向 */
    const liveNets = {}, dirOf = {};
    (D.nets || []).forEach(function (n) {
      if (!n.a) return;
      if (level[key(n.a.d, n.a.p)] != null || level[key(n.b.d, n.b.p)] != null) liveNets[n.id] = true;
    });
    (D.wires || []).forEach(function (w) {
      if (!liveNets[w.net]) return;
      if (!w.a || !w.b) { dirOf[w.id] = 1; return; }
      const la = level[key(w.a.dev, w.a.pin)], lb = level[key(w.b.dev, w.b.pin)];
      dirOf[w.id] = (la == null ? 1e9 : la) <= (lb == null ? 1e9 : lb) ? 1 : -1;
    });
    /* 7) 开关状态表（画布徽标用） */
    const sw = [];
    (D.devices || []).forEach(function (dv) { if (dv.x != null && isSwitchDev(dv)) sw.push({ id: dv.id, tag: dv.tag, open: effectiveOpen(dv) }); });
    return { liveNets: liveNets, dirOf: dirOf, level: level, switches: sw, liveCount: Object.keys(liveNets).length, srcCount: srcs.length };
  }

  return { isSwitchDev: isSwitchDev, effectiveOpen: effectiveOpen, conductPairs: conductPairs, computeLive: computeLive };
})();
