/* ============================================================
 * 图纸 1: AIDC 系统架构图 (System Architecture)
 * 依据: GB 50174 供配电架构 / TIA-942 / 能量流实线·信息流虚线
 * ============================================================ */
window.drawArch = function (R) {
  'use strict';
  const S = window.SYM, C = S.C;
  const W = 1280, H = 880;
  const P = R.power, Cx = R.compute, Cl = R.cooling;
  let s = S.svgOpen(W, H, 'AIDC 系统架构图', `${R.projName} | Tier ${R.tier === 'tier4' ? 'IV' : R.tier === 'tier2' ? 'II' : 'III'} | ${R.red} 冗余 | IT 负荷 ${Cx.itLoadKw.toLocaleString()} kW | ${P.voltage} 双路进线`,
    { drawingNo: 'DWG-AIDC-101', scale: 'NTS', rev: 'Rev.A', designer: 'AI 确定性引擎', projName: R.projName, standard: 'GB 50174-2017 · TIA-942 · IEC 60617' });

  /* ---------- 区域边界 (虚线) ---------- */
  const zone = (x, y, w, h, label) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#94a3b8" stroke-width="1" stroke-dasharray="6,4" rx="4"/>
     <text x="${x + 8}" y="${y + 14}" font-size="9" fill="#64748b" font-family="${S.FONT}">${label}</text>`;

  /* ---------- 第 1 列: 电源区 ---------- */
  s += zone(30, 96, 190, 620, '电源区');
  s += S.pwr(72, 150, C.mv, '市电 A 路', P.voltage + ' 独立PCC');
  s += S.pwr(72, 330, C.mv, '市电 B 路', P.voltage + ' 独立PCC');
  s += S.gen(45, 480, 160, 64, C.gen, '应急柴发 N+1', P.genCount + '×' + P.genCap.toLocaleString() + 'kW · 8h储油');
  s += S.txt(72, 545, '油罐区: 埋地双层油罐', 8.5, '#64748b', 'start');

  /* ---------- 第 2 列: 中压配电 ---------- */
  s += zone(250, 96, 190, 620, '中压配电区 ' + P.voltage);
  const sw1 = S.block(260, 160, 170, 150, C.mv, '中压开关柜', P.panelType, '#eff6ff');
  const swInner = S.cb(300, 180, C.mv, 'QF1-A') + S.cb(300, 230, C.mv, 'QF1-B') + S.pt(370, 200, '#9333ea', 'PT') + S.txt(260, 300, '进线/计量/PT/母联', 8.5, '#334155', 'start');
  s += `<g>${sw1}${swInner}</g>`;
  s += S.block(260, 350, 170, 76, C.mv, '中压计量与PT柜', '0.5S 关口计量', '#eff6ff');
  s += S.block(260, 460, 170, 70, C.mv, '直流屏/所用电', 'DC220V · 交流380V', '#eff6ff');

  /* ---------- 第 3 列: 变配电 ---------- */
  s += zone(470, 96, 180, 620, '变配电区');
  s += `<g>${S.block(480, 160, 160, 120, '#d97706', '变压器 T1', P.txName + ' ' + P.txVector + ' Uk=' + P.txUk, '#fffbeb')}</g>`;
  s += S.tx(520, 176, '#d97706', 'T1', P.txName);
  s += `<g>${S.block(480, 330, 160, 120, '#d97706', '变压器 T2', P.txName + ' ' + P.txVector, '#fffbeb')}</g>`;
  s += S.tx(520, 346, '#d97706', 'T2', P.txName);
  s += S.txt(560, 470, '每路 ' + P.txPerSide + ' 台 + ' + P.spareTx + ' 台备用 (N+1)', 9, '#334155', 'middle');

  /* ---------- 第 4 列: 不间断电源 ---------- */
  s += zone(680, 96, 210, 620, '低压/不间断电源区 0.4kV');
  s += S.block(690, 160, 190, 80, C.lv, '低压配电柜 GCS', '0.4kV 双母线 · 分段运行', '#f0fdf4');
  s += S.bus(700, 200, 170, C.lv, '');
  s += S.ups(700, 270, C.ups, 'UPS A', P.upsPerSide + '×' + P.upsUnit + 'kVA · ' + P.upsBackupMin + 'min');
  s += S.ups(700, 350, C.ups, 'UPS B', P.upsPerSide + '×' + P.upsUnit + 'kVA · ' + P.upsBackupMin + 'min');
  s += S.bat(640, 390, C.bat, '电池组', P.batTotalKwh.toLocaleString() + ' kWh');
  s += `<g>${S.block(690, 460, 190, 130, C.bat, '三层储能 (HSC→BBU→BESS)', '', '#fffbeb')}</g>`;
  s += S.txt(785, 485, 'HSC ' + R.storage.hsc.powerKw + 'kW', 8.5, '#b45309', 'middle');
  s += S.txt(785, 500, 'BBU ' + R.storage.bbu.powerKw + 'kW', 8.5, '#b45309', 'middle');
  s += S.txt(785, 515, 'BESS ' + R.storage.bess.capKwh + 'kWh', 8.5, '#b45309', 'middle');
  s += S.txt(785, 565, '不重叠时间常数互补闭环', 8.5, '#92400e', 'middle');
  s += S.txt(785, 585, 'IPS 芯片级功率平滑: ' + (R.pulse.ipsEnabled ? '支持' : '不支持'), 8.5, '#92400e', 'middle');

  /* ---------- 第 5 列: 切换与配电 ---------- */
  s += zone(920, 96, 190, 620, '配电区');
  s += S.sts(930, 200, '#e11d48', 'STS 静态切换', '<10ms 双路失压检测');
  s += S.pdu(930, 280, 170, 50, C.ups, '列头柜 PDU', 'A/B 双路 · 智能监控');
  s += S.block(930, 370, 170, 60, C.ups, '智能母线/精密配电', '支路计量 · 绝缘监测', '#f5f3ff');
  s += S.txt(1015, 480, '三级负荷分级供电', 9, '#334155', 'middle');
  s += S.txt(1015, 498, 'GB 50052 一级负荷双电源', 8.5, '#64748b', 'middle');

  /* ---------- 第 6 列: IT 负荷 ---------- */
  s += zone(1140, 96, 110, 620, 'IT区');
  s += S.rack(1150, 170, 90, 150, C.ink, 'GPU 机柜', '×' + Cx.gpuRacks);
  s += S.txt(1195, 345, Cx.rackPower + 'kW/柜', 8.5, '#334155', 'middle');
  s += S.txt(1195, 365, Cx.gpuName, 8, '#64748b', 'middle');
  s += S.rack(1150, 400, 90, 70, '#0e7490', '网络柜', '×' + Cx.netRacks);
  s += S.rack(1150, 490, 90, 70, '#0e7490', '存储柜', '×' + Cx.storageRacks);
  s += S.rack(1150, 580, 90, 60, '#0e7490', '管理柜', '×' + Cx.mgmtRacks);

  /* ---------- 液冷支路 (底部) ---------- */
  s += zone(250, 640, 900, 130, '液冷系统 (二次侧 35/45℃)');
  s += S.tower(270, 660, 150, 56, C.wtr, '冷却塔', Cl.towerCount + ' 台 × ' + Cl.towerCap + 'kW');
  s += S.chiller(460, 662, 140, 56, C.wtr, '冷水机组', Cl.chillerCount + ' 台 COP≥5.5');
  s += S.cdu(650, 660, 140, 60, C.sup, 'CDU', Cl.cduCount + ' 台 × ' + Cl.cduCap + 'kW');
  s += S.rack(830, 660, 170, 60, C.sup, '冷板 GPU 机柜', '供 ' + Cl.supplyTemp + '℃ / 回 ' + Cl.returnTemp + '℃');
  s += S.flowArrow(420, 688, 460, 688, C.wtr);
  s += S.flowArrow(600, 690, 650, 690, C.wtr);
  s += S.flowArrow(790, 690, 840, 690, C.sup);
  s += S.wire(950, 720, 950, 760, C.ret, 1.6);
  s += S.flowArrow(950, 720, 950, 760, C.ret, '回水');
  s += S.txt(950, 780, '自然冷却 ' + Cl.freeCoolingRatio + ' (' + Cl.freeCoolingH + 'h/年)', 8.5, '#059669', 'middle');

  /* ---------- EMS/DCIM 监控 (虚线信息流) ---------- */
  s += S.txt(640, 82, 'EMS / DCIM / 动环监控平台 (信息流虚线)', 10, C.ctl, 'middle', 'bold');
  s += S.wire(640, 90, 72, 140, C.ctl, 1.1, '4,3');
  s += S.wire(640, 90, 345, 150, C.ctl, 1.1, '4,3');
  s += S.wire(640, 90, 560, 150, C.ctl, 1.1, '4,3');
  s += S.wire(640, 90, 785, 150, C.ctl, 1.1, '4,3');
  s += S.wire(640, 90, 1015, 190, C.ctl, 1.1, '4,3');
  s += S.wire(640, 90, 1195, 160, C.ctl, 1.1, '4,3');
  s += S.wire(785, 590, 810, 660, C.ctl, 1.1, '4,3');
  s += S.jdot(640, 90, C.ctl, 2);

  /* ---------- 主能量流箭头 ---------- */
  const arrow = (x1, x2, y, label, color) => {
    s += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="2"/>`;
    s += `<path d="M${x2 - 8},${y - 4} L${x2},${y} L${x2 - 8},${y + 4}" fill="none" stroke="${color}" stroke-width="2"/>`;
    s += S.txt((x1 + x2) / 2, y - 6, label, 8.5, color, 'middle');
  };
  arrow(220, 250, 250, P.voltage + ' 双路', C.mv);
  arrow(440, 470, 250, P.voltage, C.mv);
  arrow(650, 680, 250, '0.4kV', C.lv);
  arrow(890, 920, 250, 'UPS输出 400V', C.ups);
  arrow(1110, 1140, 250, '双路', C.ups);
  s += S.wire(75, 184, 220, 184, C.mv, 1.6);
  s += S.wire(75, 364, 220, 364, C.mv, 1.6);
  s += S.wire(75, 512, 170, 512, C.mv, 1.6);
  s += S.wire(170, 512, 170, 250, C.mv, 1.6);
  s += S.wire(170, 250, 220, 250, C.mv, 1.6);
  s += S.jdot(170, 250, C.mv, 2.4);
  s += S.wire(640, 300, 700, 300, C.bat, 1.4, '5,3');
  s += S.wire(800, 300, 890, 300, C.ups, 1.6);
  s += S.wire(800, 380, 890, 380, C.ups, 1.6);
  s += S.wire(890, 300, 890, 250, C.ups, 1.6);
  s += S.wire(890, 380, 890, 250, C.ups, 1.6);
  s += S.jdot(890, 250, C.ups, 2.4);

  /* ---------- 图例 ---------- */
  s += S.legend([
    { color: C.mv, label: P.voltage + 'kV 中压线路' },
    { color: C.lv, label: '0.4kV 低压线路' },
    { color: C.ups, label: 'UPS 输出/配电 (400V)' },
    { color: C.bat, dash: '5,3', label: '蓄电池直流回路' },
    { color: C.ctl, dash: '4,3', label: '监控/信息流 (虚线)' },
    { color: C.wtr, label: '冷却水回路' },
    { color: C.sup, label: '液冷供水 35℃' },
    { color: C.ret, label: '液冷回水 45℃' }
  ], 1020, 640, 240);
  s += '</svg>';
  return s;
};