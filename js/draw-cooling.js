/* ============================================================
 * 图纸 4: AIDC 液冷管路图 (P&ID 管道仪表流程图)
 * 依据: 热管理 Skill / GB/T 4728 管道仪表符号 / ASHRAE TC9.9
 * 约束: CDU N+1 · 供水 35℃ / 回水 45℃ · 304 不锈钢 · 1.6MPa ·
 *       漏液检测 <5s 关断 · 冷板流量 5~8L/min/模组
 * ============================================================ */
window.drawCooling = function (R) {
  'use strict';
  const S = window.SYM, C = S.C;
  const W = 1280, H = 900;
  const Cl = R.cooling, Cx = R.compute;
  let s = S.svgOpen(W, H, 'AIDC 液冷管路图 (P&ID)', `${R.projName} | ${Cl.type === 'air' ? '风冷' : Cl.type === 'hybrid' ? '液冷+风冷混合' : '全液冷'} | 供 ${Cl.supplyTemp}℃ / 回 ${Cl.returnTemp}℃ | ${Cl.dn} 主管 · ${Cl.flowLpm} L/min`,
    { drawingNo: 'DWG-AIDC-104', scale: 'NTS', rev: 'Rev.A', designer: 'AI 确定性引擎', projName: R.projName, standard: 'GB/T 4728 · ASHRAE TC9.9 · IEC 60617' });

  const zone = (x, y, w, h, label) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#94a3b8" stroke-width="1" stroke-dasharray="6,4" rx="4"/>
     <text x="${x + 8}" y="${y + 14}" font-size="9.5" font-weight="bold" fill="#64748b" font-family="${S.FONT}">${label}</text>`;
  s += zone(40, 70, 240, 560, '室外冷源区');
  s += zone(300, 70, 420, 560, '制冷机房');
  s += zone(760, 70, 480, 560, '二次侧 / IT 机房');

  /* ---------- 冷却塔 ---------- */
  s += S.tower(55, 100, 160, 62, C.wtr, '冷却塔', Cl.towerCount + ' 台 × ' + Cl.towerCap + 'kW');
  s += S.txt(135, 92, 'EC 变频风机 · 湿球 26℃ 设计', 8, '#475569', 'middle');

  /* ---------- 自然冷却板换 ---------- */
  s += S.hx(60, 300, C.wtr, '板式换热器', '自然冷却');
  s += S.txt(90, 375, '湿球 ≤21℃ 启用自然冷却', 8, '#475569', 'middle');
  s += S.txt(90, 390, Cl.freeCoolingRatio + ' (' + Cl.freeCoolingH + 'h/年)', 8, '#059669', 'middle');

  /* ---------- 冷水机 / CDU / 泵 ---------- */
  s += S.chiller(300, 130, 150, 62, C.wtr, '冷水机组', Cl.chillerCount + ' 台 COP≥5.5');
  s += S.cdu(560, 120, 130, 80, C.sup, 'CDU', Cl.cduCount + ' 台 × ' + Cl.cduCap + 'kW');
  s += S.pump(470, 300, C.wtr, '一次泵 VFD');
  s += S.txt(350, 88, '冷冻水一次侧 (5~12℃)', 8.5, C.wtr, 'start', 'bold');

  /* ---------- 冷却水环路 (绿色) ---------- */
  s += S.wire(135, 162, 135, 300, C.wtr, 1.8);
  s += S.wire(135, 300, 300, 300, C.wtr, 1.8);
  s += S.wire(300, 300, 300, 161, C.wtr, 1.8);
  s += S.flowArrow(200, 300, 270, 300, C.wtr, '冷却水');
  s += S.wire(450, 161, 450, 52, C.wtr, 1.8);
  s += S.wire(450, 52, 135, 52, C.wtr, 1.8);
  s += S.wire(135, 52, 135, 100, C.wtr, 1.8);
  s += S.flowArrow(300, 52, 370, 52, C.wtr, '回塔');
  s += S.txt(230, 265, '自然冷却旁通 (板换并联)', 8.5, '#059669', 'middle');
  s += S.wire(60, 323, 300, 323, C.wtr, 1.2, '4,3');
  s += S.wire(300, 323, 300, 300, C.wtr, 1.2, '4,3');
  s += S.jdot(300, 300, C.wtr, 2.2);

  /* ---------- 一次侧冷冻水 (蓝) 冷水机 → CDU ---------- */
  s += S.wire(450, 192, 450, 90, C.sup, 1.8);
  s += S.wire(450, 90, 625, 90, C.sup, 1.8);
  s += S.wire(625, 90, 625, 120, C.sup, 1.8);
  s += S.flowArrow(480, 90, 560, 90, C.sup, '供水');
  s += S.valve(540, 60, C.sup, 'V1 电动调节');
  s += S.sensor(470, 70, C.ink, 'TT', '5℃');
  /* 一次侧回水 */
  s += S.wire(625, 200, 625, 340, C.sup, 1.4);
  s += S.wire(625, 340, 300, 340, C.sup, 1.4);
  s += S.wire(300, 340, 300, 192, C.sup, 1.4);
  s += S.flowArrow(500, 340, 430, 340, C.sup, '回水');
  s += S.pump(490, 315, C.wtr, '');
  s += S.txt(530, 375, '一次侧泵组 (N+1)', 8.5, '#475569', 'start');

  /* ---------- 二次侧: CDU → 分水器 → 冷板 → 集水器 ---------- */
  s += S.wire(690, 150, 690, 190, C.sup, 1.8);
  s += S.wire(690, 190, 760, 190, C.sup, 1.8);
  s += S.sensor(700, 120, C.ink, 'TT', '35℃');
  s += S.sensor(735, 120, C.ink, 'FT', 'L/min');
  s += S.manifold(760, 190, 230, C.sup, '分水器 (二次侧供水 ' + Cl.supplyTemp + '℃ · ' + Cl.dn + ')');
  s += S.manifold(760, 520, 230, C.ret, '集水器 (二次侧回水 ' + Cl.returnTemp + '℃)');

  const rackRows = [250, 340, 430];
  const tapX = [800, 880, 960];
  rackRows.forEach((ry, i) => {
    s += S.rack(750, ry, 230, 60, '#0e7490', 'GPU 机柜冷板 ×' + Math.ceil(Cx.gpuRacks / 3), Cl.branchDn + ' · 5~8L/min/模组');
    tapX.forEach(x => {
      s += S.wire(x, 190, x, ry, C.sup, 1.6);
      s += S.wire(x, ry + 60, x, 520, C.ret, 1.6);
      s += S.jdot(x, 190, C.sup, 2.2);
      s += S.jdot(x, 520, C.ret, 2.2);
    });
    s += S.valve(tapX[1], ry + 12, C.ink, '');
  });
  s += S.flowArrow(800, 205, 800, 240, C.sup);
  s += S.flowArrow(960, 500, 960, 465, C.ret);

  /* ---------- 二次侧回水 → CDU ---------- */
  s += S.wire(760, 520, 690, 520, C.ret, 1.8);
  s += S.wire(690, 520, 690, 210, C.ret, 1.8);
  s += S.valve(690, 430, C.ret, 'QV 快速关断阀');
  s += S.flowArrow(730, 520, 700, 520, C.ret, '回水');
  s += S.sensor(660, 490, C.ink, 'TT', '45℃');

  /* ---------- 补水定压 ---------- */
  s += S.tank(60, 440, C.wtr, '膨胀罐 / 定压补水', Cl.pressure);
  s += S.pump(40, 550, C.aux, '补水泵');
  s += S.wire(74, 570, 150, 570, C.aux, 1.2, '4,3');
  s += S.wire(116, 478, 150, 478, C.aux, 1.2, '4,3');
  s += S.wire(150, 478, 150, 570, C.aux, 1.2, '4,3');
  s += S.wire(150, 570, 150, 340, C.aux, 1.2, '4,3');
  s += S.wire(150, 340, 300, 340, C.aux, 1.2, '4,3');
  
  s += S.jdot(150, 570, C.aux, 2);
  s += S.jdot(150, 340, C.aux, 2);
  s += S.jdot(300, 340, C.aux, 2);
  s += S.txt(60, 620, '补水: ' + Cl.glycol, 8.5, '#475569', 'start');

  /* ---------- 漏液检测 ---------- */
  s += S.wire(750, 505, 1000, 505, C.ctl, 1.2, '3,3');
  s += S.sensor(1010, 496, '#dc2626', 'LS', '');
  s += S.txt(1010, 528, '漏液检测绳 (每柜) <5s 关断 + DCIM 告警', 8.5, '#dc2626', 'start');
  s += S.txt(640, 620, '材质: ' + Cl.material + ' · 设计压力 ' + Cl.pressure + ' · 冷板流量 5~8L/min/模组', 8.5, '#475569', 'middle');
  s += S.txt(640, 638, '水质: ' + Cl.glycol + ' · 电导率 <10μS/cm · PH 7~8.5 · 过滤精度 50μm', 8.5, '#475569', 'middle');

  /* ---------- 图例 ---------- */
  s += S.legend([
    { color: C.wtr, thick: 2, label: '冷却水环路 (冷却塔↔冷水机)' },
    { color: C.sup, thick: 2, label: '冷冻水供水 (CDU 一次侧)' },
    { color: C.sup, label: '二次侧供水 35℃' },
    { color: C.ret, thick: 2, label: '二次侧回水 45℃' },
    { color: C.aux, dash: '4,3', label: '补水 / 定压管路' },
    { color: C.ctl, dash: '3,3', label: '漏液检测 / 信息线' }
  ], 1010, 560, 240);

  s += '</svg>';
  return s;
};