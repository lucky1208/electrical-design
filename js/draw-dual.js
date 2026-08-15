/* ============================================================
 * 图纸 3: AIDC 双路供电拓扑图 — 基于自动布局引擎 (LAYOUT.layered)
 * 两路独立馈线(A/B 两行) × 阶段列, 下游 STS→PDU→机柜 居中汇聚
 * ============================================================ */
window.drawDual = function (R) {
  'use strict';
  const S = window.SYM, C = S.C, L = window.LAYOUT;
  const P = R.power, Cx = R.compute;
  const tierTxt = R.tier === 'tier4' ? 'IV' : R.tier === 'tier2' ? 'II' : 'III';
  const W = 1360, H = 880;

  /* ---------- 节点模型: rank=阶段列, A/B 两行 ---------- */
  const nodes = [
    { id: 'sA', rank: 0, title: '变电所 A', sub: P.voltage + ' 双回线', color: C.mv, fill: '#eff6ff' },
    { id: 'sB', rank: 0, title: '变电所 B', sub: P.voltage + ' 双回线', color: C.mv, fill: '#eff6ff' },
    { id: 'q1A', rank: 1, title: '中压进线柜 A', sub: 'QF1 ' + P.mvInA + 'A', color: C.mv, fill: '#eff6ff' },
    { id: 'q1B', rank: 1, title: '中压进线柜 B', sub: 'QF1 ' + P.mvInA + 'A', color: C.mv, fill: '#eff6ff' },
    { id: 'tA', rank: 2, title: '变压器 T-A', sub: P.txUnit + 'kVA', color: '#d97706', fill: '#fffbeb' },
    { id: 'tB', rank: 2, title: '变压器 T-B', sub: P.txUnit + 'kVA', color: '#d97706', fill: '#fffbeb' },
    { id: 'q2A', rank: 3, title: '低压总开关 A', sub: 'ACB ' + P.lvMainA + 'A', color: C.lv, fill: '#f0fdf4' },
    { id: 'q2B', rank: 3, title: '低压总开关 B', sub: 'ACB ' + P.lvMainA + 'A', color: C.lv, fill: '#f0fdf4' },
    { id: 'uA', rank: 4, title: 'UPS-A', sub: P.upsPerSide + '×' + P.upsUnit + 'kVA', color: C.ups, fill: '#f5f3ff' },
    { id: 'uB', rank: 4, title: 'UPS-B', sub: P.upsPerSide + '×' + P.upsUnit + 'kVA', color: C.ups, fill: '#f5f3ff' },
    { id: 'sts', rank: 5, title: 'STS 切换', sub: '<10ms', color: '#e11d48', fill: '#fff1f2' },
    { id: 'pdu', rank: 6, title: '列头柜 PDU', sub: 'A/B 双母线', color: C.ups, fill: '#f5f3ff' },
    { id: 'rack', rank: 7, title: 'GPU 机柜', sub: '×' + Cx.gpuRacks + ' 双电源', color: C.ink, fill: '#f8fafc' }
  ];
  const lay = L.layered(nodes, { left: 50, top: 130, colWidth: 130, gapX: 26, rowHeight: 170, nodeH: 62 });
  const yA = lay.pos.sA.y + 31, yB = lay.pos.sB.y + 31, yM = lay.pos.sts.y + 31;

  let s = S.svgOpen(W, H, 'AIDC 双路供电拓扑图', `${R.projName} | Tier ${tierTxt} | ${R.red} | 双路物理独立 · 无单点故障`,
    { drawingNo: 'DWG-AIDC-103', scale: 'NTS', rev: 'Rev.A', designer: 'AI 引擎+自动布局', projName: R.projName, standard: 'GB 50174 · TIA-942 · GB 50052' });

  /* ---------- 节点块 ---------- */
  nodes.forEach((n) => { const p = lay.pos[n.id]; s += S.block(p.x, p.y, p.w, p.h, n.color, n.title, n.sub, n.fill); });

  /* ---------- A/B 两行横向能量流 ---------- */
  for (let r = 0; r < 4; r++) {
    const a = lay.cols[r], b = lay.cols[r + 1];
    [yA, yB].forEach((y) => {
      s += `<line x1="${a.right}" y1="${y}" x2="${b.x}" y2="${y}" stroke="${C.mv}" stroke-width="1.8"/>
        <path d="M${b.x - 8},${y - 4} L${b.x},${y} L${b.x - 8},${y + 4}" fill="none" stroke="${C.mv}" stroke-width="1.8"/>`;
    });
  }
  /* UPS → STS 汇聚 */
  s += S.wire(lay.pos.uA.x + 130, yA, lay.pos.sts.x, yM, C.ups, 1.6);
  s += S.wire(lay.pos.uB.x + 130, yB, lay.pos.sts.x, yM, C.ups, 1.6);
  /* STS → PDU → 机柜 */
  s += `<line x1="${lay.cols[5].right}" y1="${yM}" x2="${lay.cols[6].x}" y2="${yM}" stroke="${C.ups}" stroke-width="1.8"/>
    <path d="M${lay.cols[6].x - 8},${yM - 4} L${lay.cols[6].x},${yM} L${lay.cols[6].x - 8},${yM + 4}" fill="none" stroke="${C.ups}" stroke-width="1.8"/>`;
  s += `<line x1="${lay.cols[6].right}" y1="${yM}" x2="${lay.cols[7].x}" y2="${yM}" stroke="${C.ups}" stroke-width="1.8"/>
    <path d="M${lay.cols[7].x - 8},${yM - 4} L${lay.cols[7].x},${yM} L${lay.cols[7].x - 8},${yM + 4}" fill="none" stroke="${C.ups}" stroke-width="1.8"/>`;

  /* ---------- 物理隔离标注 ---------- */
  const isoX = L.snap((lay.cols[4].right + lay.cols[5].x) / 2);
  s += S.wire(isoX, 100, isoX, yM - 40, '#94a3b8', 1.2, '2,3');
  s += S.txt(isoX + 6, 190, 'A/B 路物理隔离', 9, '#64748b', 'start');
  s += S.txt(isoX + 6, 206, '不同母线·不同路径', 8.5, '#64748b', 'start');

  /* ---------- 三层储能 + 柴发 (底部横排) ---------- */
  const aux = L.rowFlow([
    { id: 'sto' }, { id: 'gen' }
  ], { left: 50, y: 640, itemW: 240, gapX: 60, itemH: 64 });
  s += S.block(aux.pos.sto.x, aux.pos.sto.y, 240, 64, C.bat, '三层储能 HSC→BBU→BESS', 'HSC ' + R.storage.hsc.powerKw + 'kW / BESS ' + R.storage.bess.capKwh + 'kWh', '#fffbeb');
  s += S.gen(aux.pos.gen.x, aux.pos.gen.y, 240, 64, C.gen, '应急柴发 N+1', P.genCount + '×' + P.genCap + 'kW · 8h储油');
  s += S.wire(aux.pos.sto.x + 120, aux.pos.sto.y, aux.pos.sto.x + 120, yB + 31, C.bat, 1.3, '5,3');
  s += S.wire(aux.pos.gen.x + 120, aux.pos.gen.y, aux.pos.gen.x + 120, yB + 31, C.gen, 1.3, '6,3');

  /* ---------- 冗余徽标 ---------- */
  const badge = (x, y, w, text, color) =>
    `<rect x="${x}" y="${y}" width="${w}" height="20" rx="10" fill="${color}18" stroke="${color}" stroke-width="1.2"/>
     <text x="${x + w / 2}" y="${y + 13.5}" text-anchor="middle" font-size="9" font-weight="bold" fill="${color}" font-family="${S.FONT}">${text}</text>`;
  s += badge(50, 84, 130, '双路独立电源', C.mv);
  s += badge(300, 84, 140, '每路 100% 容量', C.mv);
  s += badge(560, 84, 140, 'UPS ' + R.red, C.ups);
  s += badge(820, 84, 150, 'STS <10ms 切换', '#e11d48');
  s += badge(1080, 84, 130, '机柜双电源', C.ups);

  /* ---------- 图例 ---------- */
  s += S.legend([
    { color: C.mv, label: P.voltage + 'kV 中压主干' },
    { color: C.lv, label: '0.4kV 低压主干' },
    { color: C.ups, label: 'UPS 输出 / PDU' },
    { color: C.gen, dash: '6,3', label: '应急柴发 (N+1)' },
    { color: C.bat, dash: '5,3', label: '储能/电池直流' }
  ], 1120, 620, 220);

  s += S.txt(680, 820, '冗余说明: ' + (R.red === '2n' ? '2N — 双路各自独立承载 100% 负荷' : R.red === '2n1' ? '2(N+1) — 双路独立 + 每路 N+1, 单点故障/维护可不停机' : 'N+1 — 关键设备 N+1 冗余'), 9.5, '#334155', 'middle');
  s += '</svg>';
  return s;
};