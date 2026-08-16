/* ============================================================
 * 图纸 4: AIDC 液冷管路图 (P&ID) — 闭合回路 + 网格对齐 + 加粗管线
 * 三环: 冷却水(绿,塔↔冷机) / 冷冻水(青,冷机↔CDU) / 二次侧(蓝供·红回,CDU↔冷板)
 * ============================================================ */
window.drawCooling = function (R) {
  'use strict';
  const S = window.SYM, C = S.C;
  const W = 1400, H = 900;
  const Cl = R.cooling, Cx = R.compute;
  const PW = 2.2;
  let s = S.svgOpen(W, H, 'AIDC 液冷管路图 (P&ID)', `${R.projName} | ${Cl.type === 'air' ? '风冷' : Cl.type === 'hybrid' ? '液冷+风冷' : '全液冷'} | 供${Cl.supplyTemp}℃/回${Cl.returnTemp}℃ | ${Cl.dn} · ${Cl.flowLpm}L/min`,
    { drawingNo: 'DWG-AIDC-104', scale: 'NTS', rev: 'Rev.B', designer: 'AI 引擎', projName: R.projName, standard: 'GB/T 4728 · ASHRAE TC9.9' });

  const zone = (x, y, w, h, label) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#94a3b8" stroke-width="1" stroke-dasharray="6,4" rx="4"/>
     <text x="${x + 8}" y="${y + 16}" font-size="10" font-weight="bold" fill="#64748b" font-family="${S.FONT}">${label}</text>`;
  s += zone(40, 80, 380, 560, '室外冷源区');
  s += zone(440, 80, 380, 560, '制冷机房');
  s += zone(840, 80, 520, 560, '二次侧 / IT 机房');

  /* ---------- 设备 ---------- */
  s += S.tower(80, 120, 170, 80, C.wtr, '冷却塔', Cl.towerCount + '×' + Cl.towerCap + 'kW');
  s += S.hx(90, 430, C.wtr, '板换', '自然冷却');
  s += S.txt(120, 500, '湿球≤21℃ 启用 ' + Cl.freeCoolingRatio, 8, '#059669', 'middle');
  s += S.chiller(480, 120, 170, 70, C.wtr, '冷水机组', Cl.chillerCount + '台 COP≥5.5');
  s += S.pump(540, 300, C.wtr, '一次泵 VFD');
  s += S.tank(520, 430, C.wtr, '膨胀罐/定压', '');
  s += S.cdu(880, 120, 170, 80, C.sup, 'CDU', Cl.cduCount + '×' + Cl.cduCap + 'kW N+1');
  const rackY = [250, 380, 510];
  rackY.forEach((y, i) => { s += S.block(1120, y, 210, 70, C.sup, 'GPU 机柜冷板', '×' + Math.ceil(Cx.gpuRacks / 3) + ' · ' + Cl.branchDn, '#f0f9ff'); });

  /* ---------- 环1 冷却水(绿) 塔↔冷机 ---------- */
  s += S.wire(250, 160, 480, 160, C.wtr, PW); s += S.flowArrow(320, 160, 400, 160, C.wtr, '冷却水供');
  s += S.wire(565, 190, 565, 240, C.wtr, PW); s += S.wire(565, 240, 165, 240, C.wtr, PW); s += S.wire(165, 240, 165, 200, C.wtr, PW);
  s += S.flowArrow(400, 240, 320, 240, C.wtr, '回塔');
  s += S.wire(120, 470, 120, 300, C.wtr, 1.4, '4,3'); s += S.wire(120, 300, 480, 300, C.wtr, 1.4, '4,3'); s += S.txt(300, 292, '自然冷却旁通', 8, '#059669', 'middle');

  /* ---------- 环2 冷冻水(青) 冷机↔CDU ---------- */
  s += S.wire(650, 150, 880, 150, C.sup, PW); s += S.flowArrow(700, 150, 780, 150, C.sup, '冷冻水供');
  s += S.wire(880, 180, 650, 180, C.sup, PW); s += S.flowArrow(780, 180, 700, 180, C.sup, '回冷机');
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
  s += S.sensor(1100, 130, C.sup, 'T', ''); s += S.sensor(1100, 580, C.ret, 'F', '');
  s += S.valve(1240, 585, C.ret, '');

  /* ---------- 图例 + 建议配置 ---------- */
  s += S.legend([
    { color: C.wtr, thick: 2, label: '冷却水环路 (塔↔冷机)' },
    { color: C.sup, thick: 2, label: '冷冻水/二次供水 ' + Cl.supplyTemp + '℃' },
    { color: C.ret, thick: 2, label: '二次回水 ' + Cl.returnTemp + '℃' },
    { color: C.wtr, dash: '4,3', label: '自然冷却旁通' },
    { color: C.ink, label: 'T/F 传感器 · 泵 · 阀' }
  ], 60, 680, 300);
  s += S.txt(420, 700, '建议配置: T×' + (4 + Cl.cduCount) + ' · F×' + (3 + Cl.cduCount) + ' · P×4 · 漏液检测每柜 <5s 关断', 9, '#334155', 'start');
  s += S.txt(420, 720, '材质 ' + Cl.material + ' · 压力 ' + Cl.pressure + ' · 冷却液 ' + Cl.glycol + ' · 电导率<10μS/cm', 8.5, '#475569', 'start');

  s += '</svg>';
  return s;
};