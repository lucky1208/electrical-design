/* ============================================================
 * 图纸 3: AIDC 双路供电拓扑图
 * 方案级逻辑图：GPU 机柜的 A/B 输入始终保持两条独立路径；STS 仅用于
 * 单电源辅助负荷，不得画入关键 IT 双输入主供电路径。
 * ============================================================ */
window.drawDual = function (R) {
  'use strict';
  const S = window.SYM, C = S.C, L = window.LAYOUT;
  const P = R.power, Cx = R.compute;
  const tierTxt = R.tier === 'tier4' ? 'IV' : R.tier === 'tier2' ? 'II' : 'III';
  const W = 1485, H = 1050;
  const dualPath = P.mainsCount > 1;
  const x = L.distribute(7, 75, 1130);
  const yA = 190, yB = 370, nodeW = 130, nodeH = 64;
  const arrow = (x1, y, x2, color) =>
    `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="1.8"/>
     <path d="M${x2 - 8},${y - 4} L${x2},${y} L${x2 - 8},${y + 4}" fill="none" stroke="${color}" stroke-width="1.8"/>`;
  const block = (xx, yy, color, title, sub, fill) => S.block(xx - nodeW / 2, yy - nodeH / 2, nodeW, nodeH, color, title, sub, fill);
  const pathNodes = [
    (tag) => ['变电所 ' + tag, P.voltage + ' PCC/路径待确认', C.mv, '#eff6ff'],
    (tag) => ['中压进线柜 ' + tag, '额定开断≥' + P.mvBreakingKa + 'kA（概念）', C.mv, '#eff6ff'],
    (tag) => ['变压器组 ' + tag, P.txInstalledPerPath + '台（' + P.txActivePerPath + '用+' + P.txRedundancyPerPath + '备）', '#d97706', '#fffbeb'],
    (tag) => ['低压总开关 ' + tag, 'Icu≥' + P.lvBreakingKa + 'kA（概念）', C.lv, '#f0fdf4'],
    (tag) => ['UPS 组 ' + tag, P.upsInstalledPerPath + '台（' + P.upsActivePerPath + '用+' + P.upsRedundancyPerPath + '备）', C.ups, '#f5f3ff'],
    (tag) => ['PDU-' + tag, '独立列头柜 · ' + P.pduPerPath + ' 台/路径', C.ups, '#f5f3ff']
  ];
  const doc = S.documentMeta(R, 'dual-path');
  let s = S.svgOpen(W, H, 'AIDC 双路供电拓扑图', `${R.projName} | Tier ${tierTxt} | ${R.red} | A/B 独立逻辑路径（物理隔离待项目验证）`, doc);

  s += `<rect x="35" y="110" width="1190" height="350" rx="8" fill="#fff" stroke="#94a3b8" stroke-width="1" stroke-dasharray="6,4"/>
        <text x="52" y="132" font-size="10" font-weight="bold" fill="#64748b" font-family="${S.FONT}">关键 IT 负荷供电路径（方案级逻辑）</text>`;

  const drawPath = (tag, yy, isActive) => {
    const opacity = isActive ? 1 : 0.45;
    let out = `<g opacity="${opacity}">`;
    pathNodes.forEach((make, i) => {
      const [title, sub, color, fill] = make(tag);
      out += block(x[i], yy, color, title, sub, fill);
      if (i < pathNodes.length - 1) out += arrow(x[i] + nodeW / 2, yy, x[i + 1] - nodeW / 2, i < 2 ? C.mv : (i === 2 ? C.lv : C.ups));
    });
    out += `</g>`;
    return out;
  };
  s += drawPath('A', yA, true);
  s += drawPath('B', yB, dualPath);
  if (!dualPath) s += S.txt(x[0], yB - 48, 'B 路：当前输入为单路径 N+1，未建立双路关键 IT 供电路径', 9, '#b45309', 'middle', 'bold');

  /* GPU rack receives separate A and B inputs. No common STS/PDU follows UPS. */
  const rackX = x[6] - 85, rackY = 250;
  s += S.rack(rackX, rackY, 170, 92, C.ink, 'GPU 双输入机柜', '×' + Cx.gpuRacks + ' · A/B 双输入', '#f8fafc');
  s += S.wire(x[5] + nodeW / 2, yA, rackX, rackY + 28, C.ups, 1.8);
  s += S.txt(rackX - 10, rackY + 24, 'A 输入', 8.5, C.ups, 'end', 'bold');
  if (dualPath) {
    s += S.wire(x[5] + nodeW / 2, yB, rackX, rackY + 64, C.ups, 1.8);
    s += S.txt(rackX - 10, rackY + 74, 'B 输入', 8.5, C.ups, 'end', 'bold');
  }

  const sepX = Math.round((x[4] + x[5]) / 2);
  s += `<line x1="${sepX}" y1="145" x2="${sepX}" y2="440" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="2,4"/>
        <text x="${sepX + 8}" y="160" font-size="8.5" fill="#64748b" font-family="${S.FONT}">A/B 物理路由、分区、火灾与共因失效待专项验证</text>`;

  s += `<rect x="45" y="535" width="1080" height="185" rx="8" fill="#fff" stroke="#94a3b8" stroke-width="1" stroke-dasharray="6,4"/>
        <text x="62" y="558" font-size="10" font-weight="bold" fill="#64748b" font-family="${S.FONT}">后备与辅助系统（不改变上述关键 IT A/B 主路径）</text>`;
  s += S.block(85, 590, 240, 64, C.bat, 'UPS 后备电池', P.upsBackupMin + 'min 概念后备 · ' + P.batTotalKwh + 'kWh 待放电曲线复核', '#fffbeb');
  s += S.gen(400, 590, 240, 64, C.gen, '应急柴油发电机组', P.genCount + '台；并机、储油与启动序列待专项设计');
  s += S.sts(735, 600, '#e11d48', '辅助负荷 STS', P.auxStsCount + ' 台 · 仅服务单电源辅助负荷');
  s += S.block(1010, 590, 160, 64, '#475569', 'DCIM / 联锁', '保护配合、控制因果矩阵待深化', '#f8fafc');

  const badge = (xx, yy, ww, text, color) =>
    `<rect x="${xx}" y="${yy}" width="${ww}" height="20" rx="10" fill="${color}18" stroke="${color}" stroke-width="1.1"/>
     <text x="${xx + ww / 2}" y="${yy + 13.5}" text-anchor="middle" font-size="8.6" font-weight="bold" fill="${color}" font-family="${S.FONT}">${text}</text>`;
  s += badge(50, 76, 150, dualPath ? 'A/B 逻辑独立' : '单路径 N+1', C.mv);
  s += badge(220, 76, 180, '每路径容量为概念估算', C.ups);
  s += badge(420, 76, 190, 'GPU 机柜双输入、不经 STS', '#0f766e');
  s += badge(630, 76, 210, '物理隔离/维护策略待验证', '#b45309');

  s += S.legend([
    { color: C.mv, label: P.voltage + ' 中压供电路径' },
    { color: C.lv, label: '0.4kV 低压供电路径' },
    { color: C.ups, label: 'UPS 输出 / A-B 独立 PDU' },
    { color: C.gen, dash: '6,3', label: '应急电源（概念）' },
    { color: C.bat, dash: '5,3', label: 'UPS 后备电池（概念）' }
  ], 1190, 520, 225);
  s += S.txt(W / 2, 790, '冗余说明：' + (R.red === '2n' ? '2N 双路各自按 100% 关键负荷概念配置。' : R.red === '2n1' ? '2(N+1) 双路各自配置 N+1 概念冗余。' : 'N+1 单路径概念冗余。') + ' 保护配合、选择性、维护旁路及可用性认证均未完成。', 9.2, '#334155', 'middle');
  s += S.txt(W / 2, 812, '本图不构成“无单点故障”或任何 Tier/IEC 合规认证；须由具备资格的专业人员结合现场条件审核。', 8.6, '#b45309', 'middle', 'bold');
  s += '</svg>';
  return s;
};
