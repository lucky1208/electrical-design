/* ============================================================
 * 图纸 4: AIDC 液冷管路图 (方案级 P&ID)
 *
 * 规则来源：AIDC_DRAWING_SKILL。渲染顺序固定为：
 * 语义设备/端口 -> 三个闭合供回回路 -> 仪表/阀门 -> 标注与图例。
 * 禁止绘制未接入工艺边的“漂浮设备”，禁止管线穿越设备框。
 * ============================================================ */
window.drawCooling = function (R) {
  'use strict';
  const S = window.SYM, C = S.C;
  const W = 1485, H = 1050;
  const Cl = R.cooling, Cx = R.compute;
  const PW = 2.2;
  const value = (v, fallback) => (v === undefined || v === null || v === '' ? fallback : v);

  if (!Cl.isLiquid) {
    let air = S.svgOpen(W, H, 'AIDC 液冷管路图 (P&ID)', `${R.projName} | 当前输入为风冷方案，液冷 P&ID 不适用`, S.documentMeta(R, 'cooling-pid'));
    air += S.block(300, 250, 880, 155, '#b45309', '当前方案未启用液冷回路', '已按风冷输入计算；请改为“液冷”或“混合冷却”后生成 CDU、一次侧及二次侧概念 P&ID。', '#fffbeb');
    air += S.txt(W / 2, 480, '注：不为未启用的系统生成可能被误读为工程设计的液冷管路图。', 10, '#b45309', 'middle', 'bold');
    air += '</svg>';
    return air;
  }

  let s = S.svgOpen(
    W,
    H,
    'AIDC 液冷管路图 (P&ID)',
    `${R.projName} | ${Cl.type === 'hybrid' ? '液冷+风冷' : '全液冷'} | 二次供${Cl.supplyTemp}℃/回${Cl.returnTemp}℃ | ${Cl.dn} · ${Cl.flowLpm}L/min`,
    S.documentMeta(R, 'cooling-pid')
  );

  const zone = (x, y, w, h, label) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#cbd5e1" stroke-width="0.8" stroke-dasharray="6,4" rx="4"/>
     <text x="${x + 8}" y="${y + 17}" font-size="10" font-weight="bold" fill="#64748b" font-family="${S.FONT}">${label}</text>`;

  s += zone(40, 80, 330, 560, '室外冷源区');
  s += zone(390, 80, 440, 560, '制冷机房');
  s += zone(850, 80, 510, 560, '二次侧 / IT 机房');

  /* ---------- 设备：每个设备均实际接入某条工艺边 ---------- */
  s += S.tower(70, 115, 190, 80, C.wtr, 'CT-101 冷却塔组', `${Cl.towerCount}台（${Cl.towerActiveCount}用+${Cl.towerRedundancyCount}备）×${Cl.towerCap}kW`);
  s += S.pump(280, 130, C.wtr, 'P-201 冷却水泵组');
  s += S.chiller(460, 110, 190, 90, C.wtr, 'CH-101 冷水机组', `${Cl.chillerCount}台（${Cl.chillerActiveCount}用+${Cl.chillerRedundancyCount}备）×${Cl.chillerCap}kW`);
  s += S.pump(680, 130, C.sup, 'P-101 一次泵组');
  s += S.tank(730, 315, C.wtr, 'TK-101 定压补水', '接一次回水管；策略待深化');
  s += S.cdu(875, 110, 200, 90, C.sup, 'CDU-101 CDU 组', `${Cl.cduCount}台（${Cl.cduActiveCount}用+${Cl.cduRedundancyCount}备）×${Cl.cduCap}kW`);

  /* ---------- CW 冷却水闭环：冷却塔 -> 冷却水泵 -> 冷机冷凝器 -> 冷却塔 ---------- */
  s += S.wire(260, 150, 286, 150, C.wtr, PW);
  s += S.wire(314, 150, 460, 150, C.wtr, PW);
  s += S.flowArrow(330, 150, 420, 150, C.wtr, `CW-S-001 冷却水供 · ${value(Cl.condenserDn, 'DN待定')}`);
  s += S.wire(460, 185, 440, 185, C.wtr, PW);
  s += S.wire(440, 185, 440, 250, C.wtr, PW);
  s += S.wire(440, 250, 165, 250, C.wtr, PW);
  s += S.wire(165, 250, 165, 195, C.wtr, PW);
  s += S.flowArrow(400, 250, 300, 250, C.wtr, 'CW-R-001 冷却水回');

  /* ---------- CHW 一次水闭环：冷机蒸发器 -> 一次泵 -> CDU 换热器 -> 冷机 ---------- */
  s += S.wire(650, 150, 686, 150, C.sup, PW);
  s += S.wire(714, 150, 875, 150, C.sup, PW);
  s += S.flowArrow(735, 150, 825, 150, C.sup, `CHWS-001 一次侧供 · ${value(Cl.primaryDn, 'DN待定')}`);
  s += S.wire(875, 190, 850, 190, C.sup, PW);
  s += S.wire(850, 190, 850, 245, C.sup, PW);
  s += S.wire(850, 245, 650, 245, C.sup, PW);
  s += S.wire(650, 245, 650, 190, C.sup, PW);
  s += S.flowArrow(815, 245, 710, 245, C.sup, 'CHWR-001 一次侧回');

  /* 定压补水支路必须与一次回水实际连接。 */
  s += S.jdot(760, 245, C.sup, 2.5);
  s += S.wire(760, 245, 760, 270, C.sup, 1.7);
  s += S.valve(760, 270, C.sup, 'XV-201');
  s += S.wire(760, 300, 760, 325, C.sup, 1.7);

  /* ---------- LCW 二次水闭环：CDU -> 外置供水汇管 -> 冷板 -> 外置回水汇管 -> CDU ---------- */
  const totalRacks = Math.max(1, Number(Cx.gpuRacks) || 1);
  const groupCount = Math.min(3, totalRacks);
  const rackYs = [270, 400, 530].slice(0, groupCount);
  const baseQty = Math.floor(totalRacks / groupCount);
  const extraQty = totalRacks % groupCount;
  const rackGroups = rackYs.map((y, i) => ({ y, qty: baseQty + (i < extraQty ? 1 : 0), tag: `RG-${String(i + 101)}` }));

  rackGroups.forEach((group) => {
    s += S.block(1170, group.y, 150, 70, C.sup, `${group.tag} GPU 机柜冷板`, `典型组 ×${group.qty} · ${value(Cl.branchDn, '支管DN待定')}`, '#f0f9ff');
  });

  const supplyX = 1130, returnX = 1340;
  const firstBranchY = rackGroups[0].y + 35;
  const lastBranchY = rackGroups[rackGroups.length - 1].y + 35;
  s += S.wire(1075, 150, supplyX, 150, C.sup, PW);
  s += S.wire(supplyX, 150, supplyX, lastBranchY, C.sup, PW);
  rackGroups.forEach((group) => {
    const yy = group.y + 35;
    s += S.wire(supplyX, yy, 1170, yy, C.sup, PW);
    s += S.jdot(supplyX, yy, C.sup, 2.4);
    s += S.wire(1320, yy, returnX, yy, C.ret, PW);
    s += S.jdot(returnX, yy, C.ret, 2.4);
  });
  s += S.wire(returnX, firstBranchY, returnX, 600, C.ret, PW);
  s += S.wire(returnX, 600, 975, 600, C.ret, PW);
  s += S.wire(975, 600, 975, 200, C.ret, PW);
  s += S.flowArrow(supplyX, 190, supplyX, 250, C.sup, `LCWS-001 二次供 ${Cl.supplyTemp}℃`);
  s += S.flowArrow(returnX, 520, returnX, 580, C.ret, `LCWR-001 二次回 ${Cl.returnTemp}℃`);

  /* ---------- 仪表与隔离：位号全局唯一，接点清晰 ---------- */
  s += S.sensor(1100, 112, C.sup, 'TT', 'TT-101');
  s += S.wire(1100, 134, 1100, 150, C.sup, 1.1, '3,2');
  s += S.sensor(1090, 615, C.ret, 'FT', 'FT-101');
  s += S.wire(1090, 600, 1090, 615, C.ret, 1.1, '3,2');
  s += S.sensor(1225, 615, C.ret, 'PT', 'PT-101');
  s += S.wire(1225, 600, 1225, 615, C.ret, 1.1, '3,2');
  s += S.valve(1290, 585, C.ret, 'XV-101');

  /* ---------- 图例、容量核对与方案边界 ---------- */
  s += S.legend([
    { color: C.wtr, thick: 2.2, label: 'CW-S/CW-R 冷却水供回（塔↔冷机）' },
    { color: C.sup, thick: 2.2, label: 'CHWS/CHWR 一次水供回（冷机↔CDU）' },
    { color: C.sup, thick: 2.2, label: `LCWS 二次供水 ${Cl.supplyTemp}℃` },
    { color: C.ret, thick: 2.2, label: `LCWR 二次回水 ${Cl.returnTemp}℃` },
    { color: C.ink, dash: '3,2', label: 'TT/FT/PT 仪表引压/测量连接' }
  ], 60, 680, 360);

  s += S.txt(450, 700, `概念热负荷：液冷 ${Cl.liquidHeatKw.toLocaleString()}kW；二次流量 ${Cl.flowLpm.toLocaleString()} L/min；主管初选 ${Cl.dn}`, 9, '#334155', 'start');
  s += S.txt(450, 722, `机柜分组核对：${rackGroups.map((g) => g.qty).join(' + ')} = ${totalRacks} 柜；数量来自同一计算模型，非渲染器常量。`, 8.5, '#334155', 'start');
  s += S.txt(450, 744, `材质：${Cl.material} · 设计压力：${Cl.pressure} · 冷却液/水处理：${Cl.glycol}`, 8.5, '#475569', 'start');
  s += S.txt(450, 766, `漏液及联锁：${Cl.leakDetect}`, 8.2, '#b45309', 'start');
  s += S.txt(450, 788, '方案边界：管径、扬程、压降、NPSH、阀门失效位、报警/联锁和点表须经专项计算及专业校核。', 8.2, '#64748b', 'start');
  s += S.txt(450, 810, '绘图规则：端口连接、供回闭环、管线不穿设备、位号唯一；参考图库规则为待专业审批状态。', 8.2, '#64748b', 'start');

  s += '</svg>';
  return s;
};
