/* ============================================================
 * 图纸 1: AIDC 系统架构图 — 基于自动布局引擎 (LAYOUT.layered)
 * 节点/边模型 → 分层布局自动排布, 网格对齐, 随设备数伸缩
 * ============================================================ */
window.drawArch = function (R) {
  'use strict';
  const S = window.SYM, C = S.C, L = window.LAYOUT;
  const P = R.power, Cx = R.compute, Cl = R.cooling;
  const W = 1280;

  /* ---------- 节点模型 (rank=层级列) ---------- */
  const nodes = [
    { id: 'mA',  rank: 0, title: '市电 A 路', sub: P.voltage + ' 独立PCC', color: C.mv, fill: '#eff6ff' },
    { id: 'mB',  rank: 0, title: '市电 B 路', sub: P.voltage + ' 独立PCC', color: C.mv, fill: '#eff6ff' },
    { id: 'gen', rank: 0, title: '应急柴发 N+1', sub: P.genCount + '×' + P.genCap + 'kW', color: C.gen, fill: '#faf5ff' },
    { id: 'mv',  rank: 1, title: '中压开关柜', sub: P.panelType, color: C.mv, fill: '#eff6ff' },
    { id: 'pt',  rank: 1, title: '计量/PT柜', sub: '0.5S 关口', color: C.mv, fill: '#eff6ff' },
    { id: 'dc',  rank: 1, title: '直流屏', sub: 'DC220V', color: C.mv, fill: '#eff6ff' },
    { id: 't1',  rank: 2, title: '变压器 T1', sub: P.txUnit + 'kVA', color: '#d97706', fill: '#fffbeb' },
    { id: 't2',  rank: 2, title: '变压器 T2', sub: P.txUnit + 'kVA', color: '#d97706', fill: '#fffbeb' },
    { id: 'lv',  rank: 3, title: '低压配电 GCS', sub: '0.4kV 双母线', color: C.lv, fill: '#f0fdf4' },
    { id: 'uA',  rank: 3, title: 'UPS A', sub: P.upsPerSide + '×' + P.upsUnit + 'kVA', color: C.ups, fill: '#f5f3ff' },
    { id: 'uB',  rank: 3, title: 'UPS B', sub: P.upsPerSide + '×' + P.upsUnit + 'kVA', color: C.ups, fill: '#f5f3ff' },
    { id: 'sto', rank: 3, title: '三层储能', sub: 'HSC→BBU→BESS', color: C.bat, fill: '#fffbeb' },
    { id: 'sts', rank: 4, title: 'STS 切换', sub: '<10ms', color: '#e11d48', fill: '#fff1f2' },
    { id: 'pdu', rank: 4, title: '列头柜 PDU', sub: 'A/B 双路', color: C.ups, fill: '#f5f3ff' },
    { id: 'bus', rank: 4, title: '智能母线', sub: '支路计量', color: C.ups, fill: '#f5f3ff' },
    { id: 'gpu', rank: 5, title: 'GPU 机柜', sub: '×' + Cx.gpuRacks, color: C.ink, fill: '#f8fafc' },
    { id: 'net', rank: 5, title: '网络柜', sub: '×' + Cx.netRacks, color: '#0e7490', fill: '#f8fafc' },
    { id: 'str', rank: 5, title: '存储/管理', sub: '×' + (Cx.storageRacks + Cx.mgmtRacks), color: '#0e7490', fill: '#f8fafc' }
  ];
  const lay = L.layered(nodes, { left: 40, top: 112, colWidth: 170, gapX: 40, rowHeight: 96, nodeH: 60 });
  const H = 760;
  const zoneNames = ['电源区', '中压配电区', '变配电区', '不间断电源区', '配电区', 'IT区'];

  let s = S.svgOpen(W, H, 'AIDC 系统架构图', `${R.projName} | Tier ${R.tier === 'tier4' ? 'IV' : R.tier === 'tier2' ? 'II' : 'III'} | ${R.red} | IT ${Cx.itLoadKw.toLocaleString()} kW`,
    { drawingNo: 'DWG-AIDC-101', scale: 'NTS', rev: 'Rev.A', designer: 'AI 引擎+自动布局', projName: R.projName, standard: 'GB 50174 · TIA-942 · IEC 60617' });

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

  /* ---------- 能量流箭头 (列间自动) ---------- */
  const midY = L.snap(lay.opts.top + lay.maxN * lay.opts.rowHeight / 2);
  const flowLabels = [[P.voltage + ' 双路', C.mv], [P.voltage, C.mv], ['0.4kV', C.lv], ['UPS 输出', C.ups], ['双路', C.ups]];
  for (let i = 0; i < lay.cols.length - 1; i++) {
    const x1 = lay.cols[i].right + 4, x2 = lay.cols[i + 1].x - 4, col = flowLabels[i][1];
    s += `<line x1="${x1}" y1="${midY}" x2="${x2}" y2="${midY}" stroke="${col}" stroke-width="2"/>
      <path d="M${x2 - 8},${midY - 4} L${x2},${midY} L${x2 - 8},${midY + 4}" fill="none" stroke="${col}" stroke-width="2"/>
      <text x="${(x1 + x2) / 2}" y="${midY - 6}" text-anchor="middle" font-size="8.5" fill="${col}" font-family="${S.FONT}">${flowLabels[i][0]}</text>`;
  }

  /* ---------- EMS/DCIM 监控 (信息流虚线) ---------- */
  s += S.txt(W / 2, 62, 'EMS / DCIM / 动环监控平台 (信息流虚线)', 10, C.ctl, 'middle', 'bold');
  lay.cols.forEach((col) => {
    s += S.wire(W / 2, 68, col.x + 85, lay.opts.top - 40, C.ctl, 1.1, '4,3');
  });
  s += S.jdot(W / 2, 68, C.ctl, 2);

  /* ---------- 液冷支路 (水平流程, 自动排布) ---------- */
  const cool = L.rowFlow([
    { id: 'tw', title: '冷却塔', sub: Cl.towerCount + '×' + Cl.towerCap + 'kW', color: C.wtr },
    { id: 'ch', title: '冷水机组', sub: Cl.chillerCount + '台 COP≥5.5', color: C.wtr },
    { id: 'cd', title: 'CDU', sub: Cl.cduCount + '×' + Cl.cduCap + 'kW', color: C.sup },
    { id: 'cp', title: '冷板 GPU 机柜', sub: '供' + Cl.supplyTemp + '/回' + Cl.returnTemp + '℃', color: C.sup }
  ], { left: 40, y: 560, itemW: 160, gapX: 40, itemH: 56 });
  s += S.txt(40, 548, '液冷系统 (二次侧 ' + Cl.supplyTemp + '/' + Cl.returnTemp + '℃)', 9.5, C.sup, 'start', 'bold');
  const citems = [ ['tw', C.wtr], ['ch', C.wtr], ['cd', C.sup], ['cp', C.sup] ];
  citems.forEach(([id]) => {
    const p = cool.pos[id];
    const src = { tw: ['冷却塔', Cl.towerCount + '×' + Cl.towerCap + 'kW', C.wtr], ch: ['冷水机组', Cl.chillerCount + '台', C.wtr], cd: ['CDU', Cl.cduCount + '×' + Cl.cduCap + 'kW', C.sup], cp: ['冷板GPU机柜', '供' + Cl.supplyTemp + '/回' + Cl.returnTemp, C.sup] }[id];
    s += S.block(p.x, p.y, p.w, p.h, src[2], src[0], src[1], '#f0fdfa');
  });
  for (let i = 0; i < 3; i++) {
    const a = cool.pos[citems[i][0]], b = cool.pos[citems[i + 1][0]];
    const y = a.y + a.h / 2;
    s += S.wire(a.x + a.w, y, b.x, y, C.sup, 1.6);
    s += S.flowArrow(a.x + a.w + 6, y, b.x - 6, y, C.sup);
  }

  /* ---------- 图例 ---------- */
  s += S.legend([
    { color: C.mv, label: P.voltage + 'kV 中压' },
    { color: C.lv, label: '0.4kV 低压' },
    { color: C.ups, label: 'UPS/PDU 配电' },
    { color: C.bat, label: '储能直流' },
    { color: C.ctl, dash: '4,3', label: '监控信息流' },
    { color: C.sup, label: '液冷回路' }
  ], 820, 520, 240);

  s += '</svg>';
  return s;
};