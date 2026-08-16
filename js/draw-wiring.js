/* ============================================================
 * 图纸 2: AIDC 电气一次接线图 (双列单线图)
 * 方案级单线图。符号、额定值和保护逻辑均须由项目 CAD 模板与专业计算书复核。
 * ============================================================ */
window.drawWiring = function (R) {
  'use strict';
  const S = window.SYM, C = S.C, L = window.LAYOUT;
  const W = 1680, H = 1188;
  const P = R.power, Cx = R.compute;
  const tierTxt = R.tier === 'tier4' ? 'IV' : R.tier === 'tier2' ? 'II' : 'III';
  const dualPath = P.mainsCount > 1;
  const doc = S.documentMeta(R, 'single-line');
  let s = S.svgOpen(W, H, 'AIDC 电气一次接线图', `${R.projName} | ${P.voltage} ${dualPath ? '双路' : '单路径'}进线 | Tier ${tierTxt} | ${R.red} | 0.4kV TN-S`, doc);

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
    t += S.wire(x, y, x, busY - 6, C.lv, 1.8);
    sched.push(
      { tag: 'QS1-' + tag, name: '隔离开关', spec: P.mvInA + 'A' },
      { tag: 'QF1-' + tag, name: '高压断路器', spec: P.voltage + ' ' + P.mvInA + 'A；额定短路开断≥' + P.mvBreakingKa + 'kA（概念）' },
      { tag: 'CT1-' + tag, name: '电流互感器', spec: Math.round(P.mvInA / 10) * 5 + '/5A 0.5S' },
      { tag: 'T-' + tag, name: '干式变压器组', spec: P.txInstalledPerPath + '台（' + P.txActivePerPath + '用+' + P.txRedundancyPerPath + '备）×' + P.txUnit + 'kVA；Uk=' + P.txUk },
      { tag: 'QF2-' + tag, name: '低压总开关', spec: 'ACB 0.4kV ' + P.lvMainA + 'A；Icu≥' + P.lvBreakingKa + 'kA（概念）' },
      { tag: 'CT2-' + tag, name: '电流互感器', spec: P.lvMainA + '/5A' }
    );
    return t;
  };
  s += `<text x="${xA}" y="88" text-anchor="middle" font-size="10.5" font-weight="bold" fill="${C.mv}" font-family="${S.FONT}">───── A 路电源回路 ─────</text>`;
  s += chain(xA, 'A');
  if (dualPath) {
    s += `<text x="${xB}" y="88" text-anchor="middle" font-size="10.5" font-weight="bold" fill="${C.mv}" font-family="${S.FONT}">───── B 路电源回路 ─────</text>`;
    s += chain(xB, 'B');
  } else {
    s += S.block(xB - 115, 210, 230, 90, '#b45309', 'B 路未配置', '当前输入为单路径 N+1；不可声称 A/B 双路供电', '#fffbeb');
  }

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
  if (dualPath) s += ptBranch(xB, 'B');

  /* ---------- 0.4kV 双母线 + 母联 ---------- */
  s += S.bus(150, busY, dualPath ? 680 : 220, C.lv, '');
  s += S.txt(cx, busY - 12, dualPath ? '0.4kV 双母线（A 段 / B 段分段运行）' : '0.4kV 单母线（单路径 N+1 概念）', 9.5, C.lv, 'middle', 'bold');
  if (dualPath) {
    s += S.wire(cx, busY, cx, busY + 6, C.lv, 1.6);
    s += S.ds(cx, busY + 6, C.lv, 'AT 母联 ' + P.lvMainA + 'A');
  }
  s += S.jumpV(xA, busY, C.lv, 6);
  if (dualPath) s += S.jumpV(xB, busY, C.lv, 6);

  /* ---------- 应急柴发 (接入 0.4kV 母线) ---------- */
  s += S.gen(30, 580, 130, 66, C.gen, '柴发 A', P.genActivePerPath + '用+' + P.genRedundancyPerPath + '备 ×' + P.genCap.toLocaleString() + 'kW');
  s += S.wire(95, 580, 95, busY, C.gen, 1.4, '6,3');
  s += S.wire(95, busY, 150, busY, C.gen, 1.4, '6,3');
  if (dualPath) {
    s += S.gen(820, 580, 130, 66, C.gen, '柴发 B', P.genActivePerPath + '用+' + P.genRedundancyPerPath + '备 ×' + P.genCap.toLocaleString() + 'kW');
    s += S.wire(885, 580, 885, busY, C.gen, 1.4, '6,3');
    s += S.wire(830, busY, 885, busY, C.gen, 1.4, '6,3');
  }
  s += S.jdot(150, busY, C.gen, 2.4);
  if (dualPath) s += S.jdot(830, busY, C.gen, 2.4);
  /* ============ UPS 支路 (母线下方) ============ */
  const upsBranch = (x, tag, batSide) => {
    let t = '', y = busY + 6;
    t += S.wire(x, y, x, y + 40, C.lv, 1.6); y += 40;
    t += S.cb(x, y, C.lv, 'QF3-' + tag); y += S._cbH;
    t += S.wire(x, y, x, y + 8, C.ups, 1.6); y += 8;
    t += S.ups(x - 50, y, C.ups, 'UPS-' + tag, ''); y += 60;
    t += S.wire(x, y, x, y + 12, C.bat, 1.3, '5,3'); y += 12;
    t += S.bat(x, y, C.bat, 'BATT-' + tag, ''); y += S._batH;
    sched.push(
      { tag: 'QF3-' + tag, name: 'UPS 进线开关', spec: P.upsInstalledPerPath + '台（' + P.upsActivePerPath + '用+' + P.upsRedundancyPerPath + '备）×' + P.upsUnit + 'kVA' },
      { tag: 'UPS-' + tag, name: '在线双变换 UPS 组', spec: P.upsInstalledPerPath + '台（' + P.upsActivePerPath + '用+' + P.upsRedundancyPerPath + '备）×' + P.upsUnit + 'kVA；效率待厂家曲线' },
      { tag: 'BATT-' + tag, name: '蓄电池组', spec: P.upsBackupMin + 'min ' + Math.round(P.batTotalKwh / P.mainsCount) + 'kWh' }
    );
    t += S.wire(x, y, x, 802, C.ups, 1.4);
    t += S.txt(batSide, 760, '蓄电池室', 8.5, '#475569', 'start');
    return t;
  };
  s += upsBranch(xA, 'A', 320);
  if (dualPath) s += upsBranch(xB, 'B', 745);

  /* ============ A/B 独立 PDU → 双输入机柜 → 接地 ============
   * STS 仅服务单电源辅助负荷，绝不串入双电源 GPU 机柜主供电路径。
   */
  s += S.wire(xA, 802, xA, 850, C.ups, 1.5);
  s += S.pdu(xA - 60, 850, 120, 46, C.ups, dualPath ? 'PDU-A' : 'PDU-A（单路径）', 'A 路独立 · ' + P.pduPerPath + ' 台/路径');
  if (dualPath) {
    s += S.wire(xB, 802, xB, 850, C.ups, 1.5);
    s += S.pdu(xB - 60, 850, 120, 46, C.ups, 'PDU-B', 'B 路独立 · ' + P.pduPerPath + ' 台/路径');
    s += S.rack(cx - 100, 930, 200, 70, C.ink, 'GPU 双输入机柜 ×' + Cx.gpuRacks, Cx.itLoadKw.toLocaleString() + ' kW · ' + Cx.rackPower + 'kW/柜');
    s += S.wire(xA, 896, cx - 70, 930, C.ups, 1.5);
    s += S.wire(xB, 896, cx + 70, 930, C.ups, 1.5);
    s += S.txt(cx - 78, 918, 'A 输入', 8.5, C.ups, 'middle', 'bold');
    s += S.txt(cx + 78, 918, 'B 输入', 8.5, C.ups, 'middle', 'bold');
  } else {
    s += S.rack(xA - 100, 930, 200, 70, C.ink, 'GPU 单路径输入机柜 ×' + Cx.gpuRacks, Cx.itLoadKw.toLocaleString() + ' kW · 单路径 N+1 概念');
    s += S.wire(xA, 896, xA, 930, C.ups, 1.5);
    s += S.txt(xA, 918, 'A 输入（未建立 B 路）', 8.5, '#b45309', 'middle', 'bold');
  }
  const rackCx = dualPath ? cx : xA;
  s += S.wire(rackCx, 1000, rackCx, 1012, C.lv, 1.6);
  s += S.pe(rackCx, 1012, C.lv);
  s += S.txt(rackCx + 20, 1024, 'PE 保护接地（TN-S 系统、等电位联结均待专项确认）', 9, C.lv, 'start');
  s += S.sts(710, 785, '#e11d48', '辅助负荷 STS', '仅单电源辅助负荷 · 切换指标待设备确认');
  s += S.wire(710, 807, 670, 807, '#e11d48', 1.1, '4,3');
  s += S.wire(890, 807, 930, 807, '#e11d48', 1.1, '4,3');

  /* ---------- 设备明细表 (型号规格集中) ---------- */
  sched.push(
    { tag: dualPath ? 'AT' : '—', name: dualPath ? '母联开关' : '单路径母线', spec: dualPath ? '0.4kV ' + P.lvMainA + 'A；常开/闭策略待保护配合研究' : '当前输入未配置母联与 B 路' },
    { tag: dualPath ? 'PDU-A/B' : 'PDU-A', name: '列头柜', spec: dualPath ? 'A/B 物理独立，合计 ' + P.pduCount + ' 台；每路径 ' + P.pduPerPath + ' 台' : '单路径，' + P.pduCount + ' 台；不能声明双输入供电' },
    { tag: 'STS-AUX', name: '辅助负荷静态切换', spec: P.auxStsCount + ' 台；不得作为 GPU 双输入主路径' },
    { tag: 'G', name: '柴油发电机', spec: P.genCount + '台，储油/并机/启动策略待专项设计' }
  );
  s += S.schedule(sched, 1000, 120, 260);

  /* ---------- 电缆/母线标注 ---------- */
  s += S.txt(408, 508, P.voltage + ' 电缆截面、敷设及耐火等级待电缆计算书确定', 8, '#475569', 'start');
  s += S.txt(560, 605, '母线额定电流 ' + P.lvMainA + 'A；温升、短路耐受待型式试验/校核', 8, '#475569', 'start');

  /* ---------- 图例 ---------- */
  s += S.legend([
    { color: C.mv, label: P.voltage + ' 中压线路' },
    { color: C.lv, thick: 2, label: '0.4kV 低压线路' },
    { color: C.gen, dash: '6,3', label: '应急柴发回路 (虚线)' },
    { color: C.bat, dash: '5,3', label: '蓄电池直流回路' },
    { color: C.ups, label: 'UPS 输出 / PDU 配电' },
    { color: '#9333ea', label: 'PT/避雷器' }
  ], 60, 940, 210);

  s += S.txt(cx, 1088, '注：本图为方案级一次接线草案；施工设计须补充保护配合、二次原理、端子排、电缆清册、接地与试验文件。', 8.5, '#64748b', 'middle');
  s += '</svg>';
  return s;
};
