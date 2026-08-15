/* ============================================================
 * 图纸 3: AIDC 双路供电拓扑图 (Dual-Feed Power Topology)
 * 依据: GB 50174 A级双路电源 / TIA-942 冗余等级 / GB 50052
 * 表达: 两路物理独立电源 → 全程冗余 → STS 无扰切换 → 双电源机柜
 * ============================================================ */
window.drawDual = function (R) {
  'use strict';
  const S = window.SYM, C = S.C;
  const W = 1360, H = 880;
  const P = R.power, Cx = R.compute;
  const tierTxt = R.tier === 'tier4' ? 'IV' : R.tier === 'tier2' ? 'II' : 'III';
  let s = S.svgOpen(W, H, 'AIDC 双路供电拓扑图', `${R.projName} | Tier ${tierTxt} | ${R.red} | 双路物理独立 · 无单点故障设计`,
    { drawingNo: 'DWG-AIDC-103', scale: 'NTS', rev: 'Rev.A', designer: 'AI 确定性引擎', projName: R.projName, standard: 'GB 50174-2017 · TIA-942 · GB 50052' });

  const ya = 240, yb = 420;   /* A/B 两路主干线 Y */

  const zone = (x, y, w, h, label) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#94a3b8" stroke-width="1" stroke-dasharray="6,4" rx="4"/>
     <text x="${x + 8}" y="${y + 14}" font-size="9" font-weight="bold" fill="#64748b" font-family="${S.FONT}">${label}</text>`;
  s += zone(40, 100, 160, 470, '电源区');
  s += zone(220, 100, 210, 470, '中压区');
  s += zone(450, 100, 130, 470, '变配电');
  s += zone(600, 100, 360, 470, 'UPS / 储能区');
  s += zone(980, 100, 350, 470, '切换 / 负荷区');

  /* ---------- 一条冗余链 (A/B 对称) ---------- */
  const lane = (tag, spineY, col) => {
    let t = '';
    const pwrY = spineY - S._pwrH, cbY = spineY - S._cbH, ctY = spineY - S._ctH, txY = spineY - S._txH;
    t += S.pwr(90, pwrY, C.mv, '变电所 ' + tag, P.voltage + ' 独立双回线');
    t += S.wire(90, spineY, 180, spineY, C.mv, 1.6);
    t += S.cb(180, cbY, C.mv, 'QF1-' + tag, P.mvInA + 'A');
    t += S.wire(180, spineY, 260, spineY, C.mv, 1.6);
    t += S.ct(260, ctY, C.ink, 'CT1-' + tag);
    t += S.wire(260, spineY, 350, spineY, C.mv, 1.6);
    t += S.tx(350, txY, '#d97706', 'T' + tag, P.txName + ' ' + P.voltage + '/0.4kV');
    t += S.wire(350, spineY, 450, spineY, C.lv, 1.8);
    t += S.cb(450, cbY, C.lv, 'QF2-' + tag, P.lvMainA + 'A ACB');
    t += S.wire(450, spineY, 560, spineY, C.lv, 1.8);
    t += S.ups(560, spineY - 30, C.ups, 'UPS-' + tag, P.upsPerSide + '×' + P.upsUnit + 'kVA · ' + P.upsBackupMin + 'min');
    t += S.wire(660, spineY, 990, spineY, C.ups, 1.8);
    t += S.wire(610, spineY + 30, 610, spineY + 40, C.bat, 1.3, '5,3');
    t += S.bat(610, spineY + 40, C.bat, 'BATT-' + tag, Math.round(P.batTotalKwh / 2).toLocaleString() + 'kWh');
    return t;
  };
  s += lane('A', ya);
  s += lane('B', yb);

  /* ---------- 物理隔离标注 ---------- */
  s += S.wire(1000, 100, 1000, 295, '#94a3b8', 1.2, '2,3');
  s += S.txt(1008, 200, 'A / B 路物理隔离', 9, '#64748b', 'start');
  s += S.txt(1008, 216, '不同母线 · 不同路径 · 不同变电所', 8.5, '#64748b', 'start');

  /* ---------- STS 汇聚 + PDU + 机柜 ---------- */
  s += S.wire(990, ya, 990, 300, C.ups, 1.8);
  s += S.wire(990, yb, 990, 344, C.ups, 1.8);
  s += S.sts(990, 300, 160, 44, '#e11d48', 'STS 静态切换', '<10ms · 无扰切换');
  s += S.wire(1150, 322, 1180, 322, C.ups, 1.8);
  s += S.pdu(1180, 300, 130, 44, C.ups, '列头柜 PDU', 'A/B 双母线');
  s += S.wire(1245, 344, 1245, 380, C.ups, 1.8);
  s += S.rack(1180, 380, 130, 70, C.ink, 'GPU 机柜', '×' + Cx.gpuRacks + ' 双电源输入');
  s += S.txt(1245, 470, '机柜 PSU: 2×独立输入', 8.5, '#334155', 'middle');
  s += S.txt(1245, 486, '(双电源模块 1+1)', 8.5, '#64748b', 'middle');

  /* ---------- 三层储能 + 应急柴发 ---------- */
  s += S.block(40, 560, 200, 70, C.bat, '三层储能 HSC→BBU→BESS', '', '#fffbeb');
  s += S.txt(140, 585, 'HSC ' + R.storage.hsc.powerKw + 'kW / BBU ' + R.storage.bbu.powerKw + 'kW', 8.5, '#92400e', 'middle');
  s += S.txt(140, 603, 'BESS ' + R.storage.bess.powerKw + 'kW · ' + R.storage.bess.capKwh + 'kWh', 8.5, '#92400e', 'middle');
  s += S.wire(140, 560, 140, 310, C.bat, 1.4, '5,3');
  s += S.wire(140, 310, 140, 490, C.bat, 1.4, '5,3');
  s += S.jdot(140, 310, C.bat, 2.2);
  s += S.jdot(140, 490, C.bat, 2.2);

  s += S.gen(720, 560, 170, 70, C.gen, '应急柴发 N+1', P.genCount + '×' + P.genCap.toLocaleString() + 'kW');
  s += S.wire(805, 560, 805, ya, C.gen, 1.4, '6,3');
  s += S.wire(805, 560, 805, yb, C.gen, 1.4, '6,3');
  s += S.jdot(805, ya, C.gen, 2.2);
  s += S.jdot(805, yb, C.gen, 2.2);

  /* ---------- 冗余等级徽标 ---------- */
  const badge = (x, y, w, text, color) =>
    `<rect x="${x}" y="${y}" width="${w}" height="20" rx="10" fill="${color}18" stroke="${color}" stroke-width="1.2"/>
     <text x="${x + w / 2}" y="${y + 13.5}" text-anchor="middle" font-size="9" font-weight="bold" fill="${color}" font-family="${S.FONT}">${text}</text>`;
  s += badge(50, 76, 130, '双路独立电源', C.mv);
  s += badge(230, 76, 130, '每路 100% 容量', C.mv);
  s += badge(600, 76, 150, 'UPS ' + R.red, C.ups);
  s += badge(985, 76, 150, 'STS <10ms 切换', '#e11d48');
  s += badge(1160, 76, 130, '机柜双电源', C.ups);
  s += badge(985, 250, 130, '无单点故障设计', '#059669');

  /* ---------- 图例 ---------- */
  s += S.legend([
    { color: C.mv, label: P.voltage + 'kV 中压主干' },
    { color: C.lv, thick: 2, label: '0.4kV 低压主干' },
    { color: C.ups, label: 'UPS 输出 / PDU' },
    { color: C.gen, dash: '6,3', label: '应急柴发 (N+1)' },
    { color: C.bat, dash: '5,3', label: '储能/电池直流' }
  ], 1180, 560, 170);

  s += S.txt(680, 800, '冗余说明: ' + (R.red === '2n' ? '2N — 双路各自独立承载 100% 负荷, 任意一路故障不影响运行'
    : R.red === '2n1' ? '2(N+1) — 双路独立 + 每路内部 N+1 冗余, 任意单点故障/计划维护均可不停机'
      : 'N+1 — 关键设备 N+1 冗余, 单点故障可在线更换'), 9.5, '#334155', 'middle');
  s += '</svg>';
  return s;
};