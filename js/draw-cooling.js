/* ============================================================
 * 图纸 4: AIDC 液冷管路图 (P&ID) — 闭合回路 + 网格对齐 + 加粗管线
 * 三环: 冷却水(绿,塔↔冷机) / 冷冻水(青,冷机↔CDU) / 二次侧(蓝供·红回,CDU↔冷板)
 * ============================================================ */
window.drawCooling = function (R) {
  'use strict';
  const S = window.SYM, C = S.C;
  const W = 1485, H = 1050;
  const Cl = R.cooling, Cx = R.compute;
  const PW = 2.2;
  if (!Cl.isLiquid) {
    let air = S.svgOpen(W, H, 'AIDC 液冷管路图 (P&ID)', `${R.projName} | 当前输入为风冷方案，液冷 P&ID 不适用`, S.documentMeta(R, 'cooling-pid'));
    air += S.block(300, 250, 880, 155, '#b45309', '当前方案未启用液冷回路', '已按风冷输入计算；请改为“液冷”或“混合冷却”后生成 CDU、一次侧及二次侧概念 P&ID。', '#fffbeb');
    air += S.txt(W / 2, 480, '注：不应为未启用的系统生成可被误读为工程设计的液冷管路图。', 10, '#b45309', 'middle', 'bold');
    air += '</svg>';
    return air;
  }
  let s = S.svgOpen(W, H, 'AIDC 液冷管路图 (P&ID)', `${R.projName} | ${Cl.type === 'air' ? '风冷' : Cl.type === 'hybrid' ? '液冷+风冷' : '全液冷'} | 供${Cl.supplyTemp}℃/回${Cl.returnTemp}℃ | ${Cl.dn} · ${Cl.flowLpm}L/min`, S.documentMeta(R, 'cooling-pid'));

  const zone = (x, y, w, h, label) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#94a3b8" stroke-width="1" stroke-dasharray="6,4" rx="4"/>
     <text x="${x + 8}" y="${y + 16}" font-size="10" font-weight="bold" fill="#64748b" font-family="${S.FONT}">${label}</text>`;
  s += zone(40, 80, 380, 560, '室外冷源区');
  s += zone(440, 80, 380, 560, '制冷机房');
  s += zone(840, 80, 520, 560, '二次侧 / IT 机房');

  /* ---------- 设备 ---------- */
  s += S.tower(80, 120, 170, 80, C.wtr, '冷却塔组', Cl.towerCount + '台（' + Cl.towerActiveCount + '用+' + Cl.towerRedundancyCount + '备）×' + Cl.towerCap + 'kW');
  s += S.hx(90, 430, C.wtr, '板式换热器', '旁通策略待性能曲线确认');
  s += S.txt(120, 500, '设计湿球 ' + Cl.designWetBulb + '℃；自然冷却小时待逐时模拟', 8, '#059669', 'middle');
  s += S.chiller(480, 120, 170, 70, C.wtr, '冷水机组组', Cl.chillerCount + '台（' + Cl.chillerActiveCount + '用+' + Cl.chillerRedundancyCount + '备）×' + Cl.chillerCap + 'kW');
  s += S.pump(540, 300, C.wtr, '一次泵组（VFD待确认）');
  s += S.tank(520, 430, C.wtr, '膨胀罐/定压', '控制策略待深化');
  s += S.cdu(880, 120, 170, 80, C.sup, 'CDU 组', Cl.cduCount + '台（' + Cl.cduActiveCount + '用+' + Cl.cduRedundancyCount + '备）×' + Cl.cduCap + 'kW');
  const rackY = [250, 380, 510];
  rackY.forEach((y, i) => { s += S.block(1120, y, 210, 70, C.sup, 'GPU 机柜冷板', '×' + Math.ceil(Cx.gpuRacks / 3) + ' · ' + Cl.branchDn, '#f0f9ff'); });

  /* ---------- 环1 冷却水(绿) 塔↔冷机 ---------- */
  s += S.wire(250, 160, 480, 160, C.wtr, PW); s += S.flowArrow(320, 160, 400, 160, C.wtr, '冷却水供 · ' + Cl.condenserDn);
  s += S.wire(565, 190, 565, 240, C.wtr, PW); s += S.wire(565, 240, 165, 240, C.wtr, PW); s += S.wire(165, 240, 165, 200, C.wtr, PW);
  s += S.flowArrow(400, 240, 320, 240, C.wtr, '回塔');
  s += S.wire(120, 470, 120, 300, C.wtr, 1.4, '4,3'); s += S.wire(120, 300, 480, 300, C.wtr, 1.4, '4,3'); s += S.txt(300, 292, '板换旁通（启停条件待控制因果矩阵）', 8, '#059669', 'middle');

  /* ---------- 环2 冷冻水(青) 冷机↔CDU ---------- */
  s += S.wire(650, 150, 880, 150, C.sup, PW); s += S.flowArrow(700, 150, 780, 150, C.sup, '一次侧供 · ' + Cl.primaryDn);
  s += S.wire(880, 180, 650, 180, C.sup, PW); s += S.flowArrow(780, 180, 700, 180, C.sup, '一次侧回');
  s += S.pump(700, 130, C.sup, '');

  /* ---------- 环3 二次侧 蓝供·红回 CDU↔冷板 ---------- */
  s += S.wire(1050, 160, 1180, 160, C.sup, PW);
  s += S.wire(1180, 160, 1180, 600, C.sup, PW);
  s += S.jump(1180, 600, C.sup, 5);
  rackY.forEach((y) => { s += S.wire(1180, y + 35, 1120, y + 35, C.sup, PW); s += S.jdot(1180, y + 35, C.sup, 2.4); });
  s += S.flowArrow(1180, 200, 1180, 240, C.sup, '供' + Cl.supplyTemp + '℃');
  s += S.wire(1330, 285, 1290, 285, C.ret, PW); s += S.wire(1330, 415, 1290, 415, C.ret, PW); s += S.wire(1330, 545, 1290, 545, C.ret, PW);
  s += S.wire(1290, 285, 1290, 600, C.ret, PW);
  s += S.jdot(1290, 415, C.ret, 2.4); s += S.jdot(1290, 545, C.ret, 2.4);
  s += S.wire(1290, 600, 965, 600, C.ret, PW); s += S.wire(965, 600, 965, 200, C.ret, PW);
  s += S.flowArrow(1290, 560, 1290, 590, C.ret, '回' + Cl.returnTemp + '℃');
  s += S.sensor(1100, 130, C.sup, 'TT', 'TT-101');
  s += S.sensor(1100, 580, C.ret, 'FT', 'FT-101');
  s += S.sensor(1050, 615, C.ret, 'PT', 'PT-101');
  s += S.valve(1240, 585, C.ret, 'XV-101');

  /* ---------- 图例 + 建议配置 ---------- */
  s += S.legend([
    { color: C.wtr, thick: 2, label: '冷却水环路 (塔↔冷机)' },
    { color: C.sup, thick: 2, label: '冷冻水/二次供水 ' + Cl.supplyTemp + '℃' },
    { color: C.ret, thick: 2, label: '二次回水 ' + Cl.returnTemp + '℃' },
    { color: C.wtr, dash: '4,3', label: '板换旁通（逻辑待确认）' },
    { color: C.ink, label: 'TT/FT/PT 仪表 · 泵 · 阀（点表待深化）' }
  ], 60, 680, 300);
  s += S.txt(420, 700, '概念热负荷：液冷 ' + Cl.liquidHeatKw.toLocaleString() + 'kW；二次侧流量 ' + Cl.flowLpm.toLocaleString() + ' L/min；主管初选 ' + Cl.dn, 9, '#334155', 'start');
  s += S.txt(420, 720, '材质：' + Cl.material + ' · 设计压力：' + Cl.pressure + ' · 冷却液/水处理：' + Cl.glycol, 8.5, '#475569', 'start');
  s += S.txt(420, 740, '漏液及联锁：' + Cl.leakDetect, 8.2, '#b45309', 'start');
  s += S.txt(420, 760, '注：本图为方案级 P&ID 草案；管径、扬程、压降、NPSH、阀门失效位、报警与联锁须以专项计算及点表确认。', 8.2, '#64748b', 'start');

  s += '</svg>';
  return s;
};
