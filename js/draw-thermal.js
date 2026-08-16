/* ============================================================
 * 图纸 5: AIDC 液冷与热管理方案图 (正确版)
 * 链路: GPU冷板机柜 → CDU(二次侧) → 一次侧(板换/冷水机+自然冷却) → 外部散热(冷却塔)
 * 分色: 二次供(蓝35℃)/二次回(红45℃)/一次冷冻水(青)/冷却水(绿)
 * ============================================================ */
window.drawThermal = function (R) {
  'use strict';
  const S = window.SYM, C = S.C, ASSET = window.ASSET;
  const Cl = R.cooling, Cx = R.compute;
  const W = 1500, H = 1061;
  const SUP = '#0284c7', RET = '#dc2626', PRI = '#0ea5e9', CW = '#059669';
  if (!Cl.isLiquid) {
    let air = S.svgOpen(W, H, 'AIDC 数据机房液冷与热管理方案图', `${R.projName} | 当前输入为风冷方案，液冷热管理链路不适用`, S.documentMeta(R, 'thermal'));
    air += S.block(290, 250, 920, 160, '#b45309', '当前方案未启用液冷热管理链路', '请在设计输入中选择“液冷”或“混合冷却”后，系统才会生成 GPU 冷板→CDU→一次侧→外部散热的概念图。', '#fffbeb');
    air += S.txt(W / 2, 480, '风冷方案应另行输出精密空调、气流组织和机房热环境专项方案。', 10, '#b45309', 'middle', 'bold');
    air += '</svg>';
    return air;
  }
  let s = S.svgOpen(W, H, 'AIDC 数据机房 液冷与热管理方案图', `${R.projName} | IT ${Cx.itLoadKw.toLocaleString()}kW · PUE 目标 ${R.pue.target} | 液冷热负荷 ${Cl.liquidHeatKw.toLocaleString()}kW | 供${Cl.supplyTemp}℃/回${Cl.returnTemp}℃`, S.documentMeta(R, 'thermal'));

  /* ---------- 右侧: 管路图例 / 符号图例 / 监控告警 ---------- */
  s += S.legend([
    { color: SUP, thick: 2, label: '二次侧供水 ' + Cl.supplyTemp + '℃ (CDU→冷板)' },
    { color: RET, thick: 2, label: '二次侧回水 ' + Cl.returnTemp + '℃ (冷板→CDU)' },
    { color: PRI, label: '一次侧冷冻水 (CDU↔板换/冷机)' },
    { color: CW, label: '冷却水 (冷机↔冷却塔)' }
  ], 1180, 110, 300);
  s += S.legend([
    { color: C.ink, label: 'T 温度 / P 压力 / F 流量' },
    { color: C.ink, label: '循环泵 / 调节阀' },
    { color: C.ink, label: '膨胀罐 / 板换 / 冷却塔' },
    { color: '#dc2626', label: '漏液检测/联锁（逻辑待专项确认）' }
  ], 1180, 290, 300);
  s += `<rect x="1180" y="460" width="300" height="190" rx="8" fill="#fff" stroke="#1d4ed8" stroke-width="1.4"/>`;
  s += `<rect x="1240" y="448" width="180" height="22" rx="5" fill="#1d4ed8"/><text x="1330" y="463" text-anchor="middle" font-size="10.5" font-weight="bold" fill="#fff" font-family="${S.FONT}">监控与告警</text>`;
  ['TT 温度监控（供/回水）', 'PT 压力监控（压差）', 'FT 流量监控（每回路）', 'LT 液位监控（膨胀罐）', '漏液点表/分区阀待深化', '故障告警 / 数据记录接口待确认'].forEach((m, i) => { s += S.txt(1200, 492 + i * 26, '● ' + m, 9.5, '#334155', 'start'); });

  /* ---------- Zone A: 二次侧 · GPU 冷板 ---------- */
  s += `<rect x="30" y="90" width="1120" height="250" rx="10" fill="#fff" stroke="${SUP}" stroke-width="1.6"/>`;
  s += S.txt(50, 112, '二次侧液冷回路 · GPU 冷板冷却 (IT 机房 · 冷/热通道封闭)', 11.5, SUP, 'start', 'bold');
  s += S.txt(50, 148, '冷却对象: GPU 液冷机柜 ×' + Cx.gpuRacks + ' · 液冷热负荷 ' + Cl.liquidHeatKw.toLocaleString() + 'kW · 支路 ' + Cl.branchDn + (Cl.cracCount > 0 ? ' · 风冷辅助: CRAC ×' + Cl.cracCount + '（能力待校核）' : ''), 8.5, '#475569', 'start');
  for (let i = 0; i < 3; i++) {
    const x = 60 + i * 250;
    s += S.block(x, 160, 200, 90, C.ink, 'GPU 液冷柜', '×' + Math.ceil(Cx.gpuRacks / 3) + ' · 冷板', '#f8fafc');
    s += S.txt(x + 100, 268, '漏液绳', 8, '#dc2626', 'middle');
  }
  s += S.block(850, 160, 260, 90, SUP, 'CDU 冷量分配组', Cl.cduCount + '台（' + Cl.cduActiveCount + '用+' + Cl.cduRedundancyCount + '备）×' + Cl.cduCap + 'kW', '#f0f9ff');
  // 二次供/回水
  s += S.wire(980, 160, 980, 140, SUP, 2); s += S.wire(160, 140, 980, 140, SUP, 2);
  for (let i = 0; i < 3; i++) { s += S.wire(160 + i * 250, 140, 160 + i * 250, 160, SUP, 2); }
  s += S.flowArrow(500, 140, 400, 140, SUP, '供水 ' + Cl.supplyTemp + '℃');
  s += S.wire(980, 270, 980, 292, RET, 2); s += S.wire(160, 292, 980, 292, RET, 2);
  for (let i = 0; i < 3; i++) { s += S.wire(160 + i * 250, 250, 160 + i * 250, 292, RET, 2); }
  s += S.flowArrow(500, 292, 600, 292, RET, '回水 ' + Cl.returnTemp + '℃');
  s += S.sensor(1080, 150, SUP, 'TT', 'TT-201'); s += S.sensor(1080, 270, RET, 'FT', 'FT-201');

  /* ---------- Zone B: 一次侧 · CDU 散热 ---------- */
  s += `<rect x="30" y="380" width="1120" height="220" rx="10" fill="#fff" stroke="${PRI}" stroke-width="1.6"/>`;
  s += S.txt(50, 402, '一次侧冷却回路 · CDU 散热 (制冷机房)', 11.5, PRI, 'start', 'bold');
  s += S.txt(50, 418, '设计湿球 ' + Cl.designWetBulb + '℃；自然冷却小时和切换策略待逐时气象模拟与设备性能曲线确认。', 8.5, '#475569', 'start');
  s += ASSET ? ASSET.draw('plate_hx', 120, 450, 90, 70, PRI) : S.hx(120, 450, PRI, '板式换热器', '自然冷却');
  s += S.txt(165, 540, '板式换热器', 9, PRI, 'middle', 'bold');
  s += ASSET ? ASSET.draw('chiller', 420, 445, 150, 80, PRI) : S.chiller(420, 445, 150, 80, PRI, '冷水机组', '');
  s += S.txt(495, 540, '冷水机组 ' + Cl.chillerCount + '台（' + Cl.chillerActiveCount + '用+' + Cl.chillerRedundancyCount + '备）×' + Cl.chillerCap + 'kW', 9, PRI, 'middle', 'bold');
  s += ASSET ? ASSET.draw('pump', 700, 460, 40, 40, PRI) : S.pump(700, 460, PRI, '');
  s += S.txt(720, 520, '一次泵 VFD', 9, PRI, 'middle');
  s += S.valve(860, 460, PRI, '自然冷却旁通阀');
  // CDU(上) → 一次侧
  s += S.wire(980, 292, 980, 470, PRI, 1.6); s += S.wire(740, 480, 980, 480, PRI, 1.6);
  s += S.wire(165, 480, 420, 480, PRI, 1.6); s += S.wire(570, 480, 700, 480, PRI, 1.6);
  s += S.flowArrow(300, 480, 360, 480, PRI, '冷冻水');

  /* ---------- Zone C: 外部散热 ---------- */
  s += `<rect x="30" y="640" width="1120" height="250" rx="10" fill="#fff" stroke="${CW}" stroke-width="1.6"/>`;
  s += S.txt(50, 662, '外部散热系统 · 二次侧 (室外)', 11.5, CW, 'start', 'bold');
  s += ASSET ? ASSET.draw('cooling_tower', 100, 690, 160, 90, CW) : S.tower(100, 690, 160, 90, CW, '冷却塔', '');
  s += S.txt(180, 820, '冷却塔 ' + Cl.towerCount + '台（' + Cl.towerActiveCount + '用+' + Cl.towerRedundancyCount + '备）×' + Cl.towerCap + 'kW', 9, CW, 'middle', 'bold');
  s += ASSET ? ASSET.draw('pump', 420, 710, 40, 40, CW) : S.pump(420, 710, CW, '');
  s += S.txt(440, 770, '二次泵', 9, CW, 'middle');
  s += ASSET ? ASSET.draw('tank', 560, 700, 70, 60, CW) : S.tank(560, 700, CW, '膨胀罐', '');
  s += S.txt(595, 780, '膨胀罐/定压', 9, CW, 'middle');
  s += S.block(720, 700, 160, 60, CW, '水处理', '过滤/软化/加药', '#ecfdf5');
  s += S.wire(260, 730, 420, 730, CW, 1.6); s += S.wire(460, 730, 560, 730, CW, 1.6); s += S.wire(630, 730, 720, 730, CW, 1.6);
  s += S.wire(495, 540, 495, 640, CW, 1.6); s += S.wire(495, 660, 495, 700, CW, 1.6);
  s += S.flowArrow(340, 730, 390, 730, CW, '冷却水');

  /* ---------- 建议配置 ---------- */
  s += S.txt(30, 920, '概念仪表点：TT/FT/PT/LT 与每柜漏液点表待深化；二次侧主管 ' + Cl.dn + ' / 概念流量 ' + Cl.flowLpm.toLocaleString() + ' L/min。', 9, '#334155', 'start');
  s += S.txt(30, 940, '材质: ' + Cl.material + ' · 设计压力: ' + Cl.pressure + ' · 冷却液/水处理: ' + Cl.glycol, 8.5, '#475569', 'start');
  s += S.txt(30, 960, '注：本图为热管理方案草案；设备性能、泵扬程、压降、NPSH、控制因果矩阵、故障工况和机房气流组织均需专项校核。', 8.2, '#b45309', 'start');

  s += '</svg>';
  return s;
};
