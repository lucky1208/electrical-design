/* ============================================================
 * 图纸 5: AIDC 液冷与热管理方案图 (正确版)
 * 链路: GPU冷板机柜 → CDU(二次侧) → 一次侧(板换/冷水机+自然冷却) → 外部散热(冷却塔)
 * 分色: 二次供(蓝35℃)/二次回(红45℃)/一次冷冻水(青)/冷却水(绿)
 * ============================================================ */
window.drawThermal = function (R) {
  'use strict';
  const S = window.SYM, C = S.C, ASSET = window.ASSET;
  const Cl = R.cooling, Cx = R.compute;
  const W = 1500, H = 1000;
  const SUP = '#0284c7', RET = '#dc2626', PRI = '#0ea5e9', CW = '#059669';
  let s = S.svgOpen(W, H, 'AIDC 数据机房 液冷与热管理方案图', `${R.projName} | IT ${Cx.itLoadKw.toLocaleString()}kW · PUE ${R.pue.target} | GPU ${Cx.gpuRacks} 柜 | 供${Cl.supplyTemp}℃/回${Cl.returnTemp}℃ | CDU ${Cl.cduCount} 台 N+1`,
    { drawingNo: 'DWG-AIDC-105', scale: 'NTS', rev: 'Rev.B', designer: 'AI 引擎', projName: R.projName, standard: 'ASHRAE TC9.9 · GB 50174 · GB/T 4728' });

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
    { color: '#dc2626', label: '漏液检测 <5s 关断' }
  ], 1180, 290, 300);
  s += `<rect x="1180" y="460" width="300" height="190" rx="8" fill="#fff" stroke="#1d4ed8" stroke-width="1.4"/>`;
  s += `<rect x="1240" y="448" width="180" height="22" rx="5" fill="#1d4ed8"/><text x="1330" y="463" text-anchor="middle" font-size="10.5" font-weight="bold" fill="#fff" font-family="${S.FONT}">监控与告警</text>`;
  ['温度监控 (供/回水)', '压力监控 (压差)', '流量监控 (每回路)', '液位监控 (膨胀罐)', '泄漏监测 <5s 关断', '故障告警 / 数据记录'].forEach((m, i) => { s += S.txt(1200, 492 + i * 26, '● ' + m, 9.5, '#334155', 'start'); });

  /* ---------- Zone A: 二次侧 · GPU 冷板 ---------- */
  s += `<rect x="30" y="90" width="1120" height="250" rx="10" fill="#fff" stroke="${SUP}" stroke-width="1.6"/>`;
  s += S.txt(50, 112, '二次侧液冷回路 · GPU 冷板冷却 (IT 机房 · 冷/热通道封闭)', 11.5, SUP, 'start', 'bold');
  s += S.txt(50, 128, '冷却对象: GPU 液冷机柜 ×' + Cx.gpuRacks + ' · 冷板 5~8L/min/模组 · ' + Cl.branchDn + (Cl.cracCount > 0 ? ' · 风冷辅助: 精密空调 CRAC ×' + Cl.cracCount : ''), 8.5, '#475569', 'start');
  for (let i = 0; i < 3; i++) {
    const x = 60 + i * 250;
    s += S.block(x, 160, 200, 90, C.ink, 'GPU 液冷柜', '×' + Math.ceil(Cx.gpuRacks / 3) + ' · 冷板', '#f8fafc');
    s += S.txt(x + 100, 268, '漏液绳', 8, '#dc2626', 'middle');
  }
  s += S.block(850, 160, 260, 90, SUP, 'CDU 冷量分配', Cl.cduCount + ' 台 ×' + Cl.cduCap + 'kW · N+1', '#f0f9ff');
  if (ASSET) { for (let i = 0; i < 3; i++) s += ASSET.draw('battery', 70 + i * 250, 172, 40, 40, '#334155'); }
  // 二次供/回水
  s += S.wire(980, 160, 980, 140, SUP, 2); s += S.wire(160, 140, 980, 140, SUP, 2);
  for (let i = 0; i < 3; i++) { s += S.wire(160 + i * 250, 140, 160 + i * 250, 160, SUP, 2); }
  s += S.flowArrow(500, 140, 400, 140, SUP, '供水 ' + Cl.supplyTemp + '℃');
  s += S.wire(980, 270, 980, 292, RET, 2); s += S.wire(160, 292, 980, 292, RET, 2);
  for (let i = 0; i < 3; i++) { s += S.wire(160 + i * 250, 250, 160 + i * 250, 292, RET, 2); }
  s += S.flowArrow(500, 292, 600, 292, RET, '回水 ' + Cl.returnTemp + '℃');
  s += S.sensor(1080, 150, SUP, 'T', ''); s += S.sensor(1080, 270, RET, 'F', '');

  /* ---------- Zone B: 一次侧 · CDU 散热 ---------- */
  s += `<rect x="30" y="380" width="1120" height="220" rx="10" fill="#fff" stroke="${PRI}" stroke-width="1.6"/>`;
  s += S.txt(50, 402, '一次侧冷却回路 · CDU 散热 (制冷机房)', 11.5, PRI, 'start', 'bold');
  s += S.txt(50, 418, '自然冷却: 湿球≤21℃ 启用板换旁通 · ' + Cl.freeCoolingRatio + ' (' + Cl.freeCoolingH + 'h/年)', 8.5, '#475569', 'start');
  s += ASSET ? ASSET.draw('plate_hx', 120, 450, 90, 70, PRI) : S.hx(120, 450, PRI, '板式换热器', '自然冷却');
  s += S.txt(165, 540, '板式换热器', 9, PRI, 'middle', 'bold');
  s += ASSET ? ASSET.draw('chiller', 420, 445, 150, 80, PRI) : S.chiller(420, 445, 150, 80, PRI, '冷水机组', '');
  s += S.txt(495, 540, '冷水机组 ' + Cl.chillerCount + ' 台 COP≥5.5', 9, PRI, 'middle', 'bold');
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
  s += S.txt(180, 820, '冷却塔 ' + Cl.towerCount + ' 台 ×' + Cl.towerCap + 'kW', 9, CW, 'middle', 'bold');
  s += ASSET ? ASSET.draw('pump', 420, 710, 40, 40, CW) : S.pump(420, 710, CW, '');
  s += S.txt(440, 770, '二次泵', 9, CW, 'middle');
  s += ASSET ? ASSET.draw('tank', 560, 700, 70, 60, CW) : S.tank(560, 700, CW, '膨胀罐', '');
  s += S.txt(595, 780, '膨胀罐/定压', 9, CW, 'middle');
  s += S.block(720, 700, 160, 60, CW, '水处理', '过滤/软化/加药', '#ecfdf5');
  s += S.wire(260, 730, 420, 730, CW, 1.6); s += S.wire(460, 730, 560, 730, CW, 1.6); s += S.wire(630, 730, 720, 730, CW, 1.6);
  s += S.wire(495, 540, 495, 640, CW, 1.6); s += S.wire(495, 660, 495, 700, CW, 1.6);
  s += S.flowArrow(340, 730, 390, 730, CW, '冷却水');

  /* ---------- 建议配置 ---------- */
  s += S.txt(30, 920, '建议配置: 温度T×' + (4 + Cl.cduCount) + ' · 流量F×' + (3 + Cl.cduCount) + ' · 压力P×4 · 液位×1 · 漏液检测每柜 · 主管 ' + Cl.dn + ' / 流量 ' + Cl.flowLpm + ' L/min', 9, '#334155', 'start');
  s += S.txt(30, 940, '材质: ' + Cl.material + ' · 设计压力 ' + Cl.pressure + ' · 冷却液: ' + Cl.glycol + ' · 电导率<10μS/cm', 8.5, '#475569', 'start');

  s += '</svg>';
  return s;
};