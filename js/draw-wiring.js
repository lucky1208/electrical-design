/* ============================================================
 * 图纸 2: AIDC 电气一次接线图 (双列单线图)
 * 依据: GB/T 4728 / IEC 60617 / GB 50052 / GB 50174
 * SLD 审图 Skill: 母线>=3倍线宽 · 连接点实心圆 · 电压等级标注 ·
 *                 高低压分区虚线 · 图例/标题栏完整
 * ============================================================ */
window.drawWiring = function (R) {
  'use strict';
  const S = window.SYM, C = S.C, L = window.LAYOUT;
  const W = 980, H = 1180;
  const P = R.power, Cx = R.compute;
  const tierTxt = R.tier === 'tier4' ? 'IV' : R.tier === 'tier2' ? 'II' : 'III';
  let s = S.svgOpen(W, H, 'AIDC 电气一次接线图', `${R.projName} | ${P.voltage} 双路进线 | Tier ${tierTxt} | ${R.red} | 0.4kV TN-S`,
    { drawingNo: 'DWG-AIDC-102', scale: 'NTS', rev: 'Rev.A', designer: 'AI 确定性引擎', projName: R.projName, standard: 'GB/T 4728 · IEC 60617 · GB 50052 · GB 50174' });

  // 馈线列锚点由布局引擎等距分布 + 网格对齐 (替代手工坐标)
  const [xA, xB] = L.distribute(2, 260, 720);
  const cx = L.snap((xA + xB) / 2);
  const busY = L.snap(560);
  const sched = [];   // 设备明细表数据 (图上只放位号)

  /* ---------- 电压分区 (虚线边界) ---------- */
  const zone = (x, y, w, h, label) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#94a3b8" stroke-width="1" stroke-dasharray="6,4" rx="4"/>
     <text x="${x + 10}" y="${y + 15}" font-size="9.5" font-weight="bold" fill="#64748b" font-family="${S.FONT}">${label}</text>`;
  s += zone(55, 70, 870, 420, P.voltage + ' 中压区');
  s += zone(55, 500, 870, 150, '0.4kV 低压配电区');
  s += zone(55, 660, 870, 420, 'UPS / IT 负荷区');

  /* ============ A 路电源列 ============ */
  const chain = (x, tag) => {
    let t = '', y = 100;
    t += S.pwr(x, y, C.mv, '市电 ' + tag + ' 路', P.voltage + ' 独立 PCC'); y += S._pwrH;
    t += S.wire(x, y, x, y + 6, C.mv, 1.6); y += 6;
    t += S.ds(x, y, C.mv, 'QS1-' + tag); y += S._dsH;
    t += S.wire(x, y, x, y + 6, C.mv, 1.6); y += 6;
    t += S.cb(x, y, C.mv, 'QF1-' + tag); y += S._cbH;
    t += S.wire(x, y, x, y + 6, C.mv, 1.6); y += 6;
    t += S.ct(x, y, C.ink, 'CT1-' + tag); y += S._ctH;
    t += S.wire(x, y, x, y + 6, C.mv, 1.6); y += 6;
    t += S.tx(x, y, '#d97706', 'T-' + tag, ''); y += S._txH;
    t += S.wire(x, y, x, y + 6, C.lv, 1.8); y += 6;
    t += S.cb(x, y, C.lv, 'QF2-' + tag); y += S._cbH;
    t += S.wire(x, y, x, y + 6, C.lv, 1.8); y += 6;
    t += S.ct(x, y, C.ink, 'CT2-' + tag); y += S._ctH;
    t += S.wire(x, y, x, busY, C.lv, 1.8);
    sched.push(
      { tag: 'QS1-' + tag, name: '隔离开关', spec: P.mvInA + 'A' },
      { tag: 'QF1-' + tag, name: '高压断路器', spec: P.voltage + ' ' + P.mvInA + 'A Icu=' + P.scKa + 'kA' },
      { tag: 'CT1-' + tag, name: '电流互感器', spec: Math.round(P.mvInA / 10) * 5 + '/5A 0.5S' },
      { tag: 'T-' + tag, name: '干式变压器', spec: P.txName + ' ' + P.txVector + ' Uk=' + P.txUk },
      { tag: 'QF2-' + tag, name: '低压总开关', spec: 'ACB 0.4kV ' + P.lvMainA + 'A' },
      { tag: 'CT2-' + tag, name: '电流互感器', spec: P.lvMainA + '/5A' }
    );
    return t;
  };
  s += `<text x="${xA}" y="88" text-anchor="middle" font-size="10.5" font-weight="bold" fill="${C.mv}" font-family="${S.FONT}">───── A 路电源回路 ─────</text>`;
  s += chain(xA, 'A');
  s += `<text x="${xB}" y="88" text-anchor="middle" font-size="10.5" font-weight="bold" fill="${C.mv}" font-family="${S.FONT}">───── B 路电源回路 ─────</text>`;
  s += chain(xB, 'B');

  /* ---------- PT / 避雷器 / 计量分支 (A/B 对称) ---------- */
  const ptBranch = (x, tag) => {
    let t = '';
    t += S.wire(x, 215, x + 115, 215, C.mv, 1.3);
    t += S.pt(x + 115, 185, '#9333ea', 'PT1-' + tag, false);
    t += S.wire(x + 115, 215, x + 115, 245, C.mv, 1.3);
    t += S.pt(x + 115, 245, '#9333ea', 'F1-' + tag + ' 避雷器', true);
    t += S.jdot(x, 215, C.mv, 2.4);
    t += S.txt(x + 130, 290, '计量 0.5S', 8, '#475569', 'start');
    return t;
  };
  s += ptBranch(xA, 'A');
  s += ptBranch(xB, 'B');

  /* ---------- 0.4kV 双母线 + 母联 ---------- */
  s += S.bus(150, busY, 680, C.lv, '');
  s += S.txt(cx, busY - 12, '0.4kV 双母线 (A 段 / B 段 分段运行)', 9.5, C.lv, 'middle', 'bold');
  s += S.wire(cx, busY, cx, busY + 6, C.lv, 1.6);
  s += S.ds(cx, busY + 6, C.lv, 'AT 母联 ' + P.lvMainA + 'A');
  s += S.jdot(xA, busY, C.lv, 2.8);
  s += S.jdot(xB, busY, C.lv, 2.8);

  /* ---------- 应急柴发 (接入 0.4kV 母线) ---------- */
  s += S.gen(30, 580, 130, 66, C.gen, '柴发 A', P.genCap.toLocaleString() + 'kW · 8h储油');
  s += S.wire(95, 580, 95, busY, C.gen, 1.4, '6,3');
  s += S.wire(95, busY, 150, busY, C.gen, 1.4, '6,3');
  s += S.gen(820, 580, 130, 66, C.gen, '柴发 B', P.genCap.toLocaleString() + 'kW · 8h储油');
  s += S.wire(885, 580, 885, busY, C.gen, 1.4, '6,3');
  s += S.wire(830, busY, 885, busY, C.gen, 1.4, '6,3');
  s += S.jdot(150, busY, C.gen, 2.4);
  s += S.jdot(830, busY, C.gen, 2.4);
  /* ============ UPS 支路 (母线下方) ============ */
  const upsBranch = (x, tag, batSide) => {
    let t = '', y = busY;
    t += S.wire(x, y, x, y + 40, C.lv, 1.6); y += 40;
    t += S.cb(x, y, C.lv, 'QF3-' + tag); y += S._cbH;
    t += S.wire(x, y, x, y + 8, C.ups, 1.6); y += 8;
    t += S.ups(x - 50, y, C.ups, 'UPS-' + tag, ''); y += 60;
    t += S.wire(x, y, x, y + 12, C.bat, 1.3, '5,3'); y += 12;
    t += S.bat(x, y, C.bat, 'BATT-' + tag, ''); y += S._batH;
    sched.push(
      { tag: 'QF3-' + tag, name: 'UPS 进线开关', spec: P.upsPerSide + '×' + P.upsUnit + 'kVA' },
      { tag: 'UPS-' + tag, name: '在线双变换 UPS', spec: P.upsPerSide + '×' + P.upsUnit + 'kVA 效率96%' },
      { tag: 'BATT-' + tag, name: '蓄电池组', spec: P.upsBackupMin + 'min ' + Math.round(P.batTotalKwh / 2) + 'kWh' }
    );
    t += S.wire(x, y, x, 802, C.ups, 1.4);
    t += S.txt(batSide, 760, '蓄电池室', 8.5, '#475569', 'start');
    return t;
  };
  s += upsBranch(xA, 'A', 320);
  s += upsBranch(xB, 'B', 745);

  /* ============ STS → PDU → 机柜 → 接地 ============ */
  s += S.sts(410, 780, 160, 44, '#e11d48', 'STS 静态切换', '<10ms 双路失压检测');
  s += S.wire(xA, 802, 410, 802, C.ups, 1.4);
  s += S.wire(xB, 802, 570, 802, C.ups, 1.4);
  s += S.jdot(xA, 802, C.ups, 2.4);
  s += S.jdot(xB, 802, C.ups, 2.4);
  s += S.wire(cx, 824, cx, 850, C.ups, 1.5);
  s += S.pdu(430, 850, 120, 46, C.ups, '列头柜 PDU', 'A/B 双路 · ' + P.pduCount + ' 台');
  s += S.wire(cx, 896, cx, 920, C.ups, 1.5);
  s += S.rack(400, 920, 180, 80, C.ink, 'GPU 机柜 ×' + Cx.gpuRacks, Cx.itLoadKw.toLocaleString() + ' kW · ' + Cx.rackPower + 'kW/柜');
  s += S.wire(cx, 1000, cx, 1012, C.lv, 1.6);
  s += S.pe(cx, 1012, C.lv);
  s += S.txt(cx + 20, 1024, 'PE 保护接地 (TN-S 系统, 等电位联结)', 9, C.lv, 'start');

  /* ---------- 设备明细表 (型号规格集中) ---------- */
  sched.push(
    { tag: 'AT', name: '母联开关', spec: '0.4kV ' + P.lvMainA + 'A' },
    { tag: 'STS', name: '静态切换开关', spec: '<10ms 双路失压' },
    { tag: 'PDU', name: '列头柜', spec: 'A/B 双路 ' + P.pduCount + ' 台' },
    { tag: 'G', name: '柴油发电机', spec: P.genCount + '×' + P.genCap + 'kW 8h' }
  );
  s += S.schedule(sched, 700, 780, 250);

  /* ---------- 电缆/母线标注 ---------- */
  s += S.txt(408, 508, P.voltage + 'kV 电缆 3×240', 8, '#475569', 'start');
  s += S.txt(560, 605, '母线槽 ' + P.lvMainA + 'A', 8, '#475569', 'start');

  /* ---------- 图例 ---------- */
  s += S.legend([
    { color: C.mv, label: P.voltage + 'kV 中压线路' },
    { color: C.lv, thick: 2, label: '0.4kV 低压线路' },
    { color: C.gen, dash: '6,3', label: '应急柴发回路 (虚线)' },
    { color: C.bat, dash: '5,3', label: '蓄电池直流回路' },
    { color: C.ups, label: 'UPS 输出 / PDU 配电' },
    { color: '#9333ea', label: 'PT/避雷器' }
  ], 60, 940, 210);

  s += S.txt(cx, 1088, '注: 本图为方案级一次接线图, 施工图需补充二次回路/端子排/电缆清册 (GB/T 4728)', 8.5, '#64748b', 'middle');
  s += '</svg>';
  return s;
};