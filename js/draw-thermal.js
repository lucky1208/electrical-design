/* ============================================================
 * 图纸 5: 液冷与热管理方案图 (形象版, 对齐 GPT5.5 参考图信息设计)
 * 分色回路 + 分区分组 + 双图例 + 监控告警 + 建议配置 + 形象化设备
 * ============================================================ */
window.drawThermal = function (R) {
  'use strict';
  const S = window.SYM, C = S.C;
  const Cl = R.cooling, P = R.power, PIC = window.PIC;
  const W = 1500, H = 1000;
  const L1 = '#1d4ed8', L2 = '#7c3aed', L3 = '#ea580c', DC = '#15803d', AC = '#dc2626';
  let s = S.svgOpen(W, H, '液冷与热管理方案图 (形象版)', `${R.projName} | 供${Cl.supplyTemp}℃/回${Cl.returnTemp}℃ | 三级分色回路`,
    { drawingNo: 'DWG-AIDC-105', scale: 'NTS', rev: 'Rev.A', designer: 'AI 引擎', projName: R.projName, standard: 'ASHRAE TC9.9 · GB/T 4728' });

  /* ---------- 形象化设备小图 ---------- */
  const tower = (x, y, c) => `<g stroke="${c}" stroke-width="2" fill="none">
    <path d="M${x},${y+70} L${x+18},${y} L${x+36},${y+70}"/><path d="M${x+6},${y+46} L${x+30},${y+46}"/><path d="M${x+9},${y+30} L${x+27},${y+30}"/><path d="M${x+6},${y+46} L${x+27},${y+30}"/><path d="M${x+30},${y+46} L${x+9},${y+30}"/><path d="M${x-6},${y+20} L${x+42},${y+20}"/></g>`;
  const cabinet = (x, y, w, h, t, sub, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f1f5f9" stroke="${c}" stroke-width="1.6" rx="3"/>
    <line x1="${x+w/2}" y1="${y+4}" x2="${x+w/2}" y2="${y+h-4}" stroke="${c}" stroke-width="1"/>
    <path d="M${x+w*0.25},${y+14} l5,9 h-10 z" fill="#f59e0b"/><path d="M${x+w*0.75},${y+14} l5,9 h-10 z" fill="#f59e0b"/>
    <text x="${x+w/2}" y="${y+h+14}" text-anchor="middle" font-size="10" font-weight="bold" fill="${C.ink}" font-family="${S.FONT}">${t}</text>
    <text x="${x+w/2}" y="${y+h+27}" text-anchor="middle" font-size="8.5" fill="#475569" font-family="${S.FONT}">${sub}</text>`;
  const pile = (x, y, t, sub) => `<rect x="${x}" y="${y}" width="34" height="70" rx="5" fill="#e2e8f0" stroke="#334155" stroke-width="1.5"/>
    <rect x="${x+7}" y="${y+8}" width="20" height="14" rx="2" fill="#38bdf8"/><circle cx="${x+17}" cy="${y+34}" r="4" fill="#334155"/>
    <path d="M${x+34},${y+40} q14,6 10,24" fill="none" stroke="#334155" stroke-width="2.5"/>
    <text x="${x+17}" y="${y+86}" text-anchor="middle" font-size="9.5" font-weight="bold" fill="${C.ink}" font-family="${S.FONT}">${t}</text>
    <text x="${x+17}" y="${y+98}" text-anchor="middle" font-size="8" fill="#475569" font-family="${S.FONT}">${sub}</text>`;
  const battcab = (x, y, t) => `<rect x="${x}" y="${y}" width="150" height="110" rx="6" fill="#f8fafc" stroke="#64748b" stroke-width="1.5"/>
    <text x="${x+75}" y="${y-6}" text-anchor="middle" font-size="10.5" font-weight="bold" fill="#fff" font-family="${S.FONT}"><tspan fill="#1d4ed8">${t}</tspan></text>
    <rect x="${x+75}" y="${y-18}" width="90" height="16" rx="4" fill="#1d4ed8"/><text x="${x+120}" y="${y-6}" text-anchor="middle" font-size="9.5" font-weight="bold" fill="#fff" font-family="${S.FONT}">${t}</text>
    ${[['电池包(电芯)'],['BMS系统'],['冷却系统(液冷)']].map((r,i)=>`<rect x="${x+25}" y="${y+12+i*32}" width="100" height="26" rx="4" fill="#ecfdf5" stroke="#10b981" stroke-width="1"/><text x="${x+75}" y="${y+29+i*32}" text-anchor="middle" font-size="9" fill="#065f46" font-family="${S.FONT}">${r[0]}</text>`).join('')}`;

  /* ---------- 顶部功率链: 电网→配电柜→充电主机→枪 ---------- */
  s += tower(50, 120, '#1e3a8a'); s += S.txt(68, 214, '电网', 10, C.ink, 'middle', 'bold'); s += S.txt(68, 228, P.voltage, 8.5, '#475569', 'middle');
  s += cabinet(150, 130, 90, 80, '配电柜', P.voltage + ' AC', '#334155');
  s += S.wire(100, 165, 150, 165, AC, 2); s += S.flowArrow(110, 165, 145, 165, AC, 'AC');
  s += `<rect x="300" y="100" width="420" height="140" rx="8" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>`;
  s += `<rect x="430" y="88" width="160" height="20" rx="5" fill="#1d4ed8"/><text x="510" y="102" text-anchor="middle" font-size="10" font-weight="bold" fill="#fff" font-family="${S.FONT}">充电主机 (${(P.genCap/1000).toFixed(1)}MW)</text>`;
  s += S.block(320, 130, 110, 40, '#0ea5e9', '控制系统', 'EMS', '#eff6ff');
  s += S.block(320, 180, 110, 40, '#0ea5e9', '功率分配', 'DC 分配单元', '#eff6ff');
  s += cabinet(460, 130, 80, 90, 'AC/DC 模块', '6×80kW', '#ea580c');
  s += cabinet(600, 130, 80, 90, 'DC/DC 模块', '24×80kW', '#ea580c');
  if (PIC) { s += PIC.draw('acdc', 468, 138, 24, 24, '#ea580c'); s += PIC.draw('dcac', 608, 138, 24, 24, '#ea580c'); s += PIC.draw('ems', 328, 136, 24, 24, '#0ea5e9'); s += PIC.draw('transformer', 158, 138, 26, 26, '#334155'); }
  s += S.wire(240, 170, 300, 170, AC, 2);
  s += S.wire(540, 170, 600, 170, DC, 2); s += S.txt(570, 162, 'DC母线 1000Vdc', 8.5, DC, 'middle');
  s += pile(960, 120, '液冷枪1', '1500A'); s += pile(1060, 120, '液冷枪2', '1500A');
  s += S.wire(720, 170, 977, 170, DC, 2); s += S.wire(977, 170, 977, 120, DC, 2); s += S.wire(977, 170, 1077, 170, DC, 2); s += S.wire(1077, 170, 1077, 120, DC, 2);

  /* ---------- 储能柜 ---------- */
  s += battcab(330, 300, '储能柜1'); s += battcab(640, 300, '储能柜2');
  s += S.wire(480, 355, 640, 355, '#10b981', 1.4, '5,3'); s += S.txt(560, 347, 'CAN/通信(以太网)', 8.5, '#10b981', 'middle');

  /* ---------- 三级分色回路分区 ---------- */
  const loop = (x, title, sub, color, tgt1, tgt2, cfg) => {
    let t = `<rect x="${x}" y="470" width="350" height="230" rx="10" fill="#fff" stroke="${color}" stroke-width="1.6"/>`;
    t += `<text x="${x+175}" y="492" text-anchor="middle" font-size="11.5" font-weight="bold" fill="${color}" font-family="${S.FONT}">${title}</text>`;
    t += `<text x="${x+175}" y="508" text-anchor="middle" font-size="8.5" fill="#475569" font-family="${S.FONT}">${sub}</text>`;
    t += S.block(x+40, 530, 110, 60, color, tgt1, '冷却板', '#f8fafc');
    t += S.block(x+200, 530, 110, 60, color, tgt2, '冷却板', '#f8fafc');
    // 循环回路
    t += `<rect x="${x+25}" y="525" width="300" height="120" rx="8" fill="none" stroke="${color}" stroke-width="1.6"/>`;
    t += S.pump(x+150, 630, color, '循环泵');
    t += S.valve(x+90, 634, color, ''); t += S.valve(x+240, 634, color, '');
    t += S.sensor(x+40, 610, color, 'T', ''); t += S.sensor(x+300, 610, color, 'F', '');
    return t;
  };
  s += loop(30, '一级液冷回路 (功率模块冷却)', '冷却对象: AC/DC · DC/DC 模块', L1, 'AC/DC模块', 'DC/DC模块', '');
  s += loop(400, '二级液冷回路 (储能电池冷却)', '冷却对象: 储能柜1/2 电池系统', L2, '储能柜1', '储能柜2', '');
  s += loop(770, '三级液冷回路 (充电枪线冷却)', '冷却对象: 枪线缆与枪头', L3, '枪线缆', '枪头', '');
  // 建议配置
  s += S.txt(30, 722, '建议配置(一级): T×4 F×3 P×2 监控模块冷却液流量/温度/压力', 8.5, '#334155', 'start');
  s += S.txt(400, 722, '建议配置(二级): T×6 F×1 P×2 监控电池液冷温度均匀性', 8.5, '#334155', 'start');
  s += S.txt(770, 722, '建议配置(三级): T×4 F×1 P×2 防止枪头过温与堵塞', 8.5, '#334155', 'start');

  /* ---------- 冷源 + 外部散热 ---------- */
  s += `<rect x="30" y="760" width="560" height="150" rx="10" fill="#eff6ff" stroke="#1d4ed8" stroke-width="1.4"/>`;
  s += S.txt(310, 782, '风冷冷水机组 (一次侧)', 10.5, '#1d4ed8', 'middle', 'bold');
  s += S.chiller(50, 800, 120, 56, '#1d4ed8', '冷水机组', 'COP≥5.5');
  s += S.tank(210, 800, '#1d4ed8', '缓冲水箱', '');
  s += S.pump(300, 810, '#1d4ed8', '一次泵');
  s += S.hx(380, 800, '#1d4ed8', '板式换热器', '');
  s += S.wire(170, 828, 210, 828, L1, 1.6); s += S.wire(270, 828, 300, 828, L1, 1.6); s += S.wire(340, 828, 380, 828, L1, 1.6);
  s += `<rect x="620" y="760" width="510" height="150" rx="10" fill="#ecfdf5" stroke="#059669" stroke-width="1.4"/>`;
  s += S.txt(875, 782, '外部散热系统 (二次侧)', 10.5, '#059669', 'middle', 'bold');
  s += S.pump(650, 810, '#059669', '二次泵');
  s += S.tank(740, 800, '#059669', '膨胀水箱', '');
  s += S.tower(850, 795, 120, 56, '#059669', '冷却塔', Cl.towerCount + '台');
  s += S.wire(690, 830, 740, 830, '#059669', 1.6); s += S.wire(800, 830, 850, 830, '#059669', 1.6);

  /* ---------- 右侧: 管路图例 / 符号图例 / 监控告警 ---------- */
  s += S.legend([
    { color: AC, dash: '6,3', label: '交流电回路 (AC)' },
    { color: DC, label: '直流电回路 (DC)' },
    { color: L1, label: '一级液冷 (功率模块)' },
    { color: L2, label: '二级液冷 (储能电池)' },
    { color: L3, label: '三级液冷 (充电枪)' }
  ], 1180, 120, 300);
  s += S.legend([
    { color: C.ink, label: 'T 温度传感器' },
    { color: C.ink, label: 'P 压力传感器' },
    { color: C.ink, label: 'F 流量传感器' },
    { color: C.ink, label: '循环泵 / 调节阀' }
  ], 1180, 300, 300);
  if (PIC) { [['battery','电池包'],['ups','UPS'],['breaker','断路器'],['transformer','变压器'],['meter','电表'],['pdu','PDU']].forEach((it,i)=>{ const x=1190+(i%3)*100, y=402+Math.floor(i/3)*30; s += PIC.draw(it[0], x, y, 20, 20, '#334155'); s += S.txt(x+26, y+15, it[1], 8.5, '#334155', 'start'); }); }
  s += `<rect x="1180" y="470" width="300" height="180" rx="8" fill="#fff" stroke="#1d4ed8" stroke-width="1.4"/>`;
  s += `<rect x="1240" y="458" width="180" height="22" rx="5" fill="#1d4ed8"/><text x="1330" y="473" text-anchor="middle" font-size="10.5" font-weight="bold" fill="#fff" font-family="${S.FONT}">监控与告警</text>`;
  ['温度监控', '压力监控', '流量监控', '液位监控', '泄漏监测 <5s', '故障告警/数据记录'].forEach((m, i) => {
    s += S.txt(1200, 500 + i * 25, '● ' + m, 9.5, '#334155', 'start');
  });

  s += '</svg>';
  return s;
};