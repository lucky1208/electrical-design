/* ============================================================
 * 图纸 1: AIDC 系统架构图 — 基于自动布局引擎 (LAYOUT.layered)
 * 节点/边模型 → 分层布局自动排布, 网格对齐, 随设备数伸缩
 * ============================================================ */
window.drawArch = function (R) {
  'use strict';
  const S = window.SYM, C = S.C, L = window.LAYOUT;
  const P = R.power, Cx = R.compute, Cl = R.cooling;
  const W = 1485;
  const dualPath = P.mainsCount > 1;

  /* ---------- 节点模型 (rank=层级列) ---------- */
  const nodes = [
    { id: 'mA',  rank: 0, title: dualPath ? '市电 A 路' : '市电进线', sub: P.voltage + ' PCC/路径待确认', color: C.mv, fill: '#eff6ff' },
    ...(dualPath ? [{ id: 'mB', rank: 0, title: '市电 B 路', sub: P.voltage + ' 独立PCC', color: C.mv, fill: '#eff6ff' }] : []),
    { id: 'gen', rank: 0, title: '应急柴发组', sub: P.genCount + '台（每路径 ' + P.genActivePerPath + '用+' + P.genRedundancyPerPath + '备）', color: C.gen, fill: '#faf5ff' },
    { id: 'mv',  rank: 1, title: '中压开关柜', sub: P.panelType, color: C.mv, fill: '#eff6ff' },
    { id: 'pt',  rank: 1, title: '计量/PT柜', sub: '0.5S 关口', color: C.mv, fill: '#eff6ff' },
    { id: 'dc',  rank: 1, title: '直流屏', sub: 'DC220V', color: C.mv, fill: '#eff6ff' },
    { id: 't1',  rank: 2, title: dualPath ? '变压器组 A' : '变压器组', sub: P.txInstalledPerPath + '台×' + P.txUnit + 'kVA (' + P.txActivePerPath + '用+' + P.txRedundancyPerPath + '备)', color: '#d97706', fill: '#fffbeb' },
    ...(dualPath ? [{ id: 't2', rank: 2, title: '变压器组 B', sub: P.txInstalledPerPath + '台×' + P.txUnit + 'kVA (' + P.txActivePerPath + '用+' + P.txRedundancyPerPath + '备)', color: '#d97706', fill: '#fffbeb' }] : []),
    { id: 'lv',  rank: 3, title: '低压配电 GCS', sub: '0.4kV 双母线', color: C.lv, fill: '#f0fdf4' },
    { id: 'uA',  rank: 3, title: dualPath ? 'UPS 组 A' : 'UPS 组', sub: P.upsInstalledPerPath + '台×' + P.upsUnit + 'kVA (' + P.upsActivePerPath + '用+' + P.upsRedundancyPerPath + '备)', color: C.ups, fill: '#f5f3ff' },
    ...(dualPath ? [{ id: 'uB', rank: 3, title: 'UPS 组 B', sub: P.upsInstalledPerPath + '台×' + P.upsUnit + 'kVA (' + P.upsActivePerPath + '用+' + P.upsRedundancyPerPath + '备)', color: C.ups, fill: '#f5f3ff' }] : []),
    { id: 'sto', rank: 3, title: '三层储能', sub: 'HSC→BBU→BESS', color: C.bat, fill: '#fffbeb' },
    { id: 'pduA', rank: 4, title: dualPath ? 'PDU-A' : 'PDU（单路径）', sub: dualPath ? 'A 路独立 · ' + P.pduPerPath + '台/路径' : P.pduPerPath + '台；未建立 B 路', color: C.ups, fill: '#f5f3ff' },
    ...(dualPath ? [{ id: 'pduB', rank: 4, title: 'PDU-B', sub: 'B 路独立 · ' + P.pduPerPath + '台/路径', color: C.ups, fill: '#f5f3ff' }] : []),
    { id: 'sts', rank: 4, title: '辅助负荷 STS', sub: '不在 GPU 双输入主路径', color: '#e11d48', fill: '#fff1f2' },
    { id: 'bus', rank: 4, title: '智能母线', sub: '支路计量', color: C.ups, fill: '#f5f3ff' },
    { id: 'gpu', rank: 5, title: dualPath ? 'GPU 双输入机柜' : 'GPU 单路径输入机柜', sub: '×' + Cx.gpuRacks, color: C.ink, fill: '#f8fafc' },
    { id: 'net', rank: 5, title: '网络柜', sub: '×' + Cx.netRacks, color: '#0e7490', fill: '#f8fafc' },
    { id: 'str', rank: 5, title: '存储/管理', sub: '×' + (Cx.storageRacks + Cx.mgmtRacks), color: '#0e7490', fill: '#f8fafc' }
  ];
  const lay = L.layered(nodes, { left: 40, top: 112, colWidth: 170, gapX: 40, rowHeight: 96, nodeH: 60 });
  const H = 1050;
  const zoneNames = ['电源区', '中压配电区', '变配电区', '不间断电源区', '配电区', 'IT区'];

  const doc = S.documentMeta(R, 'architecture');
  let s = S.svgOpen(W, H, 'AIDC 系统架构图', `${R.projName} | Tier ${R.tier === 'tier4' ? 'IV' : R.tier === 'tier2' ? 'II' : 'III'} | ${R.red} | ${dualPath ? 'A/B 独立逻辑路径' : '单路径 N+1'} | IT ${Cx.itLoadKw.toLocaleString()} kW`, doc);

  /* ---------- 分区框 (按布局列自动计算) ---------- */
  lay.cols.forEach((col, i) => {
    s += `<rect x="${col.x - 10}" y="${lay.opts.top - 36}" width="${col.right - col.x + 20}" height="${lay.height - lay.opts.top + 46}"
      fill="none" stroke="#94a3b8" stroke-width="1" stroke-dasharray="6,4" rx="4"/>
      <text x="${col.x - 2}" y="${lay.opts.top - 24}" font-size="9" font-weight="bold" fill="#64748b" font-family="${S.FONT}">${zoneNames[i] || ''}</text>`;
  });

  /* ---------- 节点块 (位置由布局引擎给出) ---------- */
  nodes.forEach((n) => {
    const p = lay.pos[n.id];
    s += S.block(p.x, p.y, p.w, p.h, n.color, n.title, n.sub, n.fill);
  });

  /* ---------- 方案级关系连线（不再以一条中心箭头假装连接所有节点） ---------- */
  const edge = (from, to, color) => {
    const a = lay.pos[from], b = lay.pos[to];
    if (!a || !b) return '';
    const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
    const elbowX = Math.round((x1 + x2) / 2 / 10) * 10;
    let out = S.pathPts([[x1, y1], [elbowX, y1], [elbowX, y2], [x2, y2]], color, 1.45);
    out += `<path d="M${x2 - 7},${y2 - 4} L${x2},${y2} L${x2 - 7},${y2 + 4}" fill="none" stroke="${color}" stroke-width="1.45"/>`;
    return out;
  };
  s += edge('mA', 'mv', C.mv);
  if (dualPath) s += edge('mB', 'mv', C.mv);
  s += edge('mv', 't1', C.mv);
  if (dualPath) s += edge('mv', 't2', C.mv);
  s += edge('t1', 'lv', C.lv);
  if (dualPath) s += edge('t2', 'lv', C.lv);
  s += edge('lv', 'uA', C.ups);
  if (dualPath) s += edge('lv', 'uB', C.ups);
  s += edge('uA', 'pduA', C.ups);
  if (dualPath) s += edge('uB', 'pduB', C.ups);
  s += edge('pduA', 'gpu', C.ups);
  if (dualPath) s += edge('pduB', 'gpu', C.ups);

  /* ---------- EMS/DCIM 监控 (信息流虚线) ---------- */
  s += S.txt(W / 2, 62, 'EMS / DCIM / 动环监控平台 (信息流虚线)', 10, C.ctl, 'middle', 'bold');
  lay.cols.forEach((col) => {
    s += S.wire(W / 2, 68, col.x + 85, lay.opts.top - 40, C.ctl, 1.1, '4,3');
  });
  s += S.jdot(W / 2, 68, C.ctl, 2);

  /* ---------- 液冷支路 (水平流程, 自动排布) ---------- */
  if (Cl.isLiquid) {
    const cool = L.rowFlow([
      { id: 'tw' }, { id: 'ch' }, { id: 'cd' }, { id: 'cp' }
    ], { left: 40, y: 560, itemW: 160, gapX: 40, itemH: 56 });
    s += S.txt(40, 548, '液冷热管理概念链路（液冷热负荷 ' + Cl.liquidHeatKw.toLocaleString() + 'kW；二次侧 ' + Cl.supplyTemp + '/' + Cl.returnTemp + '℃；流量 ' + Cl.flowLpm.toLocaleString() + ' L/min）', 9.5, C.sup, 'start', 'bold');
    const citems = [ ['tw', C.wtr], ['ch', C.wtr], ['cd', C.sup], ['cp', C.sup] ];
    citems.forEach(([id]) => {
      const p = cool.pos[id];
      const src = { tw: ['冷却塔组', Cl.towerCount + '台（' + Cl.towerActiveCount + '用+' + Cl.towerRedundancyCount + '备）', C.wtr], ch: ['冷水机组组', Cl.chillerCount + '台（' + Cl.chillerActiveCount + '用+' + Cl.chillerRedundancyCount + '备）', C.wtr], cd: ['CDU 组', Cl.cduCount + '台（' + Cl.cduActiveCount + '用+' + Cl.cduRedundancyCount + '备）', C.sup], cp: ['冷板 GPU 机柜', '供' + Cl.supplyTemp + '/回' + Cl.returnTemp + '℃', C.sup] }[id];
      s += S.block(p.x, p.y, p.w, p.h, src[2], src[0], src[1], '#f0fdfa');
    });
    for (let i = 0; i < 3; i++) {
      const a = cool.pos[citems[i][0]], b = cool.pos[citems[i + 1][0]];
      const y = a.y + a.h / 2;
      s += S.wire(a.x + a.w, y, b.x, y, C.sup, 1.6);
      s += S.flowArrow(a.x + a.w + 6, y, b.x - 6, y, C.sup);
    }
  } else {
    s += S.block(40, 560, 680, 74, '#b45309', '当前输入为风冷方案', '未生成 CDU/液冷管路概念；应另行进行精密空调、气流组织和机房热环境专项设计。', '#fffbeb');
  }

  /* ---------- 图例 ---------- */
  s += S.legend([
    { color: C.mv, label: P.voltage + ' 中压' },
    { color: C.lv, label: '0.4kV 低压' },
    { color: C.ups, label: 'UPS/PDU 配电' },
    { color: C.bat, label: '储能直流' },
    { color: C.ctl, dash: '4,3', label: '监控信息流' },
    { color: C.sup, label: '液冷回路' }
  ], 820, 520, 240);

  s += S.txt(W / 2, 715, dualPath ? '说明：关键 IT 负荷采用 PDU-A/PDU-B 至双输入机柜的独立逻辑路径；物理路由、共因失效、保护配合与维护旁路均待专项验证。' : '说明：当前为单路径 N+1 概念，未建立 B 路关键 IT 供电路径，不能声明双路供电或无单点故障。', 8.6, '#b45309', 'middle');

  s += '</svg>';
  return s;
};
