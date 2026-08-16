/* ============================================================
 * 项目概念符号库 + CAD 图框组件  v1.0
 * ------------------------------------------------------------
 * 参考基线（须由项目专业人员复核适用性）：
 *  - IEC 60617 / GB/T 4728 图形符号参考
 *  - SLD 审图 Skill: 图框/标题栏/图例完整; 母线线宽>=3倍普通线宽;
 *    能量流=实线, 信息流=虚线; 导线连接点=实心圆; 电压等级全图标注
 *  - 热管理 Skill: 液冷 P&ID 符号 (泵/阀/换热器/传感器)
 * ------------------------------------------------------------
 * 全部符号为纯函数，返回 SVG 字符串，可直接拼装。它们是方案级
 * 占位表达，不能单独作为 IEC/GB 符号合规、施工图或审图结论。
 * ============================================================ */
window.SYM = (function () {
  'use strict';

  /* ---------- 颜色规范 (白纸 CAD 出图, 打印友好) ---------- */
  const C = {
    ink:  '#0f172a',   // 图框/文字
    mv:   '#1d4ed8',   // 中压 10kV/35kV 蓝
    lv:   '#15803d',   // 低压 0.4kV 绿
    ups:  '#7c3aed',   // UPS/PDU 紫
    gen:  '#9333ea',   // 柴发 深紫
    bat:  '#b45309',   // 蓄电池 琥珀
    ctl:  '#475569',   // 控制/信息虚线 灰
    sup:  '#0284c7',   // 液冷供水 蓝
    ret:  '#dc2626',   // 液冷回水 红
    wtr:  '#059669',   // 冷却水 绿
    aux:  '#0e7490',   // 辅助
    grid: '#cbd5e1'
  };

  const FONT = "'Segoe UI','Microsoft YaHei',sans-serif";
  const MONO = "Consolas,'Courier New',monospace";
  /* The exporter consumes the same manifest.  Names are project CAD layers,
   * not proof that a client CAD manual or any IEC/ISO document is satisfied. */
  const DEFAULT_CAD_LAYER_MANIFEST = [
    { name: 'AIDC-FRAME', color: 7, linetype: 'CONTINUOUS', lineweightMm: 0.50, purpose: '图框、标题栏、修订栏' },
    { name: 'AIDC-TEXT', color: 7, linetype: 'CONTINUOUS', lineweightMm: 0.18, purpose: '标题、说明、位号' },
    { name: 'AIDC-ANNO', color: 8, linetype: 'CONTINUOUS', lineweightMm: 0.18, purpose: '待核说明、参考注释' },
    { name: 'AIDC-EQPT', color: 7, linetype: 'CONTINUOUS', lineweightMm: 0.25, purpose: '通用设备外形与符号' },
    { name: 'AIDC-MV', color: 5, linetype: 'CONTINUOUS', lineweightMm: 0.35, purpose: '中压回路' },
    { name: 'AIDC-LV', color: 3, linetype: 'CONTINUOUS', lineweightMm: 0.35, purpose: '低压回路' },
    { name: 'AIDC-UPS', color: 6, linetype: 'CONTINUOUS', lineweightMm: 0.35, purpose: 'UPS/PDU 关键负荷回路' },
    { name: 'AIDC-GEN', color: 214, linetype: 'DASHED', lineweightMm: 0.25, purpose: '应急发电概念回路' },
    { name: 'AIDC-BAT', color: 30, linetype: 'DASHED', lineweightMm: 0.25, purpose: '蓄电池直流概念回路' },
    { name: 'AIDC-CTL', color: 8, linetype: 'DASHED', lineweightMm: 0.18, purpose: '监控、联锁和信息流' },
    { name: 'AIDC-COOL-SUP', color: 4, linetype: 'CONTINUOUS', lineweightMm: 0.35, purpose: '冷冻水/二次侧供水' },
    { name: 'AIDC-COOL-RET', color: 1, linetype: 'CONTINUOUS', lineweightMm: 0.35, purpose: '二次侧回水' },
    { name: 'AIDC-COOL-COND', color: 94, linetype: 'CONTINUOUS', lineweightMm: 0.35, purpose: '冷却水/冷凝水回路' }
  ];
  const esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  /* ---------- 基础元件 ---------- */
  function txt(x, y, s, size, color, anchor, weight, font) {
    return `<text x="${x}" y="${y}" font-size="${size || 10}" fill="${color || C.ink}"
      font-family="${font || FONT}" ${anchor ? 'text-anchor="' + anchor + '"' : ''}
      ${weight ? 'font-weight="' + weight + '"' : ''}>${esc(s)}</text>`;
  }

  /* 正交布线 (无斜线): 先竖后横 */
  function wire(x1, y1, x2, y2, color, w, dash, midY) {
    const c = color || C.lv, sw = w || 1.4;
    const d = dash ? `stroke-dasharray="${dash}"` : '';
    if (Math.abs(x1 - x2) < 0.5)
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" ${d}/>`;
    if (Math.abs(y1 - y2) < 0.5)
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" ${d}/>`;
    const my = midY !== undefined ? midY : y1;
    return `<polyline points="${x1},${y1} ${x1},${my} ${x2},${my} ${x2},${y2}" fill="none"
      stroke="${c}" stroke-width="${sw}" stroke-linejoin="round" ${d}/>`;
  }
  function pathPts(pts, color, w, dash) {
    const d = dash ? `stroke-dasharray="${dash}"` : '';
    const dd = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1]).join(' ');
    return `<path d="${dd}" fill="none" stroke="${color || C.ink}" stroke-width="${w || 1.4}" ${d}/>`;
  }

  /* 导线交叉半圆跳线 (CAD 标准: 不连接交叉处走半圆) */
  function jump(cx, cy, color, r) {
    const c = color || C.ink, rr = r || 4;
    return `<path d="M${cx - rr},${cy} A${rr},${rr} 0 0,1 ${cx + rr},${cy}" fill="none" stroke="${c}" stroke-width="1.4"/>`;
  }
  /* 竖直线跨过水平线的半圆跳线 (向右凸), 用于正交交叉不连接 */
  function jumpV(cx, cy, color, r) {
    const c = color || C.ink, rr = r || 6;
    return `<path d="M${cx},${cy - rr} A${rr},${rr} 0 0,1 ${cx},${cy + rr}" fill="none" stroke="${c}" stroke-width="1.6"/>`;
  }
  function jdot(x, y, color, r) {
    return `<circle cx="${x}" cy="${y}" r="${r || 2.6}" fill="${color || C.ink}"/>`;
  }

  /* ---------- IEC 60617 一次设备符号 ---------- */

  /* 电源 (IEC 60617-6): 圆 + 正弦波 */
  const _pwrH = 34;
  function pwr(cx, y0, color, label, sub) {
    const c = color || C.mv, cy = y0 + 12;
    return `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${cy - 10}" stroke="${c}" stroke-width="1.4"/>
    <circle cx="${cx}" cy="${cy}" r="10" fill="none" stroke="${c}" stroke-width="1.4"/>
    <path d="M${cx - 5},${cy} q5,-6 10,0 q5,6 10,0" fill="none" stroke="${c}" stroke-width="1.1"/>
    <line x1="${cx}" y1="${cy + 10}" x2="${cx}" y2="${y0 + _pwrH}" stroke="${c}" stroke-width="1.4"/>
    ${label ? txt(cx + 16, cy - 4, label, 10, c, 'start', 'bold') : ''}
    ${sub ? txt(cx + 16, cy + 12, sub, 8.5, c) : ''}`;
  }

  /* 断路器 (IEC 60617-7 / GB 4728.7): 方块 + 斜线, 高32 */
  const _cbH = 32;
  function cb(cx, y0, color, label, sub) {
    const c = color || C.lv, bx = cx - 10, by = y0 + 8;
    return `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${by}" stroke="${c}" stroke-width="1.4"/>
    <rect x="${bx}" y="${by}" width="20" height="16" fill="#fff" stroke="${c}" stroke-width="1.4"/>
    <line x1="${bx}" y1="${by + 16}" x2="${bx + 20}" y2="${by}" stroke="${c}" stroke-width="1.1"/>
    <line x1="${cx}" y1="${by + 16}" x2="${cx}" y2="${y0 + _cbH}" stroke="${c}" stroke-width="1.4"/>
    ${label ? txt(cx + 16, by + 5, label, 9.5, c, 'start', 'bold', MONO) : ''}
    ${sub ? txt(cx + 16, by + 18, sub, 8, C.ink, 'start', '', MONO) : ''}`;
  }

  /* 隔离开关 (IEC 60617-7): 刀闸, 高24 */
  const _dsH = 24;
  function ds(cx, y0, color, label) {
    const c = color || C.ink;
    return `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y0 + 6}" stroke="${c}" stroke-width="1.4"/>
    <circle cx="${cx}" cy="${y0 + 8}" r="2.2" fill="${c}"/>
    <line x1="${cx}" y1="${y0 + 8}" x2="${cx + 15}" y2="${y0 + 16}" stroke="${c}" stroke-width="1.3"/>
    <circle cx="${cx}" cy="${y0 + 18}" r="2.2" fill="none" stroke="${c}" stroke-width="1.3"/>
    <line x1="${cx}" y1="${y0 + 18}" x2="${cx}" y2="${y0 + _dsH}" stroke="${c}" stroke-width="1.4"/>
    ${label ? txt(cx + 20, y0 + 16, label, 9.5, c, 'start', 'bold', MONO) : ''}`;
  }

  /* 熔断器 (IEC 60617-7), 高30 */
  const _fuH = 30;
  function fu(cx, y0, color, label) {
    const c = color || '#b45309';
    return `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y0 + 6}" stroke="${c}" stroke-width="1.4"/>
    <rect x="${cx - 7}" y="${y0 + 6}" width="14" height="18" fill="#fff" stroke="${c}" stroke-width="1.3"/>
    <line x1="${cx}" y1="${y0 + 6}" x2="${cx}" y2="${y0 + 24}" stroke="${c}" stroke-width="1"/>
    <line x1="${cx}" y1="${y0 + 24}" x2="${cx}" y2="${y0 + _fuH}" stroke="${c}" stroke-width="1.4"/>
    ${label ? txt(cx + 14, y0 + 18, label, 8.5, c, 'start', '', MONO) : ''}`;
  }

  /* 电流互感器 CT (IEC 60617-13), 高32 */
  const _ctH = 32;
  function ct(cx, y0, color, label) {
    const c = color || C.ink;
    return `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y0 + 8}" stroke="${c}" stroke-width="1.4"/>
    <circle cx="${cx}" cy="${y0 + 16}" r="8" fill="#fff" stroke="${c}" stroke-width="1.4"/>
    <text x="${cx}" y="${y0 + 20}" text-anchor="middle" font-size="9" fill="${c}" font-family="${MONO}">A</text>
    <line x1="${cx}" y1="${y0 + 24}" x2="${cx}" y2="${y0 + _ctH}" stroke="${c}" stroke-width="1.4"/>
    ${label ? txt(cx + 14, y0 + 17, label, 8.5, c, 'start', '', MONO) : ''}`;
  }

  /* 电压互感器 PT / 避雷器 (IEC 60617-11), 高30 */
  const _ptH = 30;
  function pt(cx, y0, color, label, arrester) {
    const c = color || '#9333ea';
    if (arrester) {
      return `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y0 + 6}" stroke="${c}" stroke-width="1.4"/>
      <rect x="${cx - 8}" y="${y0 + 6}" width="16" height="14" fill="#fff" stroke="${c}" stroke-width="1.3"/>
      <line x1="${cx - 4}" y1="${y0 + 20}" x2="${cx + 6}" y2="${y0 + 8}" stroke="${c}" stroke-width="1.2"/>
      <line x1="${cx}" y1="${y0 + 20}" x2="${cx}" y2="${y0 + _ptH}" stroke="${c}" stroke-width="1.4"/>
      ${label ? txt(cx + 14, y0 + 17, label, 8.5, c, 'start', '', MONO) : ''}`;
    }
    return `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y0 + 6}" stroke="${c}" stroke-width="1.4"/>
    <circle cx="${cx}" cy="${y0 + 14}" r="8" fill="#fff" stroke="${c}" stroke-width="1.4"/>
    <text x="${cx}" y="${y0 + 18}" text-anchor="middle" font-size="9" fill="${c}" font-family="${MONO}">V</text>
    <line x1="${cx - 8}" y1="${y0 + 22}" x2="${cx + 8}" y2="${y0 + 22}" stroke="${c}" stroke-width="1.3"/>
    <line x1="${cx}" y1="${y0 + 22}" x2="${cx}" y2="${y0 + _ptH}" stroke="${c}" stroke-width="1.4"/>
    ${label ? txt(cx + 14, y0 + 17, label, 8.5, c, 'start', '', MONO) : ''}`;
  }

  /* 双绕组变压器 (IEC 60617-5), 高56 */
  const _txH = 56;
  function tx(cx, y0, color, label, sub, r) {
    const c = color || '#d97706', rr = r || 13;
    const cy1 = y0 + rr, cy2 = y0 + rr * 2 + 4;
    return `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${cy1 - rr}" stroke="${c}" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${cy1}" r="${rr}" fill="#fff" stroke="${c}" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${cy2}" r="${rr}" fill="#fff" stroke="${c}" stroke-width="1.5"/>
    <line x1="${cx}" y1="${cy2 + rr}" x2="${cx}" y2="${y0 + _txH}" stroke="${c}" stroke-width="1.5"/>
    ${label ? txt(cx + 20, cy1 + 4, label, 9.5, c, 'start', 'bold', MONO) : ''}
    ${sub ? txt(cx + 20, cy2 + 5, sub, 8, C.ink, 'start', '', MONO) : ''}`;
  }
  /* ---------- 块设备符号 (设备外框 + 内部图形) ---------- */
  function block(x, y, w, h, color, title, sub, fill, inner) {
    const c = color || C.ink;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill || '#f8fafc'}"
      stroke="${c}" stroke-width="1.5" rx="3"/>
    ${inner || ''}
    ${title ? txt(x + w / 2, y + (sub ? h / 2 - 2 : h / 2 + 3.5), title, 10.5, c, 'middle', 'bold') : ''}
    ${sub ? txt(x + w / 2, y + h / 2 + 13, sub, 8, C.ink, 'middle') : ''}`;
  }

  /* UPS: 框 + 内部 ~/= 变换示意, 高60 */
  const _upsH = 60, _upsW = 100;
  function ups(x, y, color, label, sub) {
    const c = color || C.ups;
    return `<rect x="${x}" y="${y}" width="${_upsW}" height="${_upsH}" fill="#f5f3ff" stroke="${c}" stroke-width="1.5" rx="3"/>
    <path d="M${x + 10},${y + 30} q5,-8 10,0 q5,8 10,0" fill="none" stroke="${c}" stroke-width="1.2"/>
    <line x1="${x + 36}" y1="${y + 12}" x2="${x + 36}" y2="${y + 48}" stroke="${c}" stroke-width="1"/>
    <line x1="${x + 44}" y1="${y + 20}" x2="${x + 58}" y2="${y + 20}" stroke="${c}" stroke-width="1.6"/>
    <line x1="${x + 44}" y1="${y + 34}" x2="${x + 58}" y2="${y + 34}" stroke="${c}" stroke-width="1.6"/>
    <text x="${x + 64}" y="${y + 26}" font-size="10" font-weight="bold" fill="${c}" font-family="${FONT}">${esc(label || '')}</text>
    ${sub ? `<text x="${x + 64}" y="${y + 42}" font-size="7" fill="${C.ink}" font-family="${FONT}">${esc(sub)}</text>` : ''}`;
  }

  /* 蓄电池组: 极板组 (长-短交替), 高30 */
  const _batH = 30;
  function bat(cx, y0, color, label, sub) {
    const c = color || C.bat, cy = y0 + 12;
    return `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${cy - 8}" stroke="${c}" stroke-width="1.4"/>
    <line x1="${cx - 11}" y1="${cy - 5}" x2="${cx + 11}" y2="${cy - 5}" stroke="${c}" stroke-width="1.4"/>
    <line x1="${cx - 4}" y1="${cy + 1}" x2="${cx + 4}" y2="${cy + 1}" stroke="${c}" stroke-width="3.2"/>
    <line x1="${cx - 11}" y1="${cy + 7}" x2="${cx + 11}" y2="${cy + 7}" stroke="${c}" stroke-width="1.4"/>
    <line x1="${cx - 4}" y1="${cy + 13}" x2="${cx + 4}" y2="${cy + 13}" stroke="${c}" stroke-width="3.2"/>
    <line x1="${cx}" y1="${cy + 13}" x2="${cx}" y2="${y0 + _batH}" stroke="${c}" stroke-width="1.4"/>
    ${label ? txt(cx + 20, cy - 2, label, 9.5, c, 'start', 'bold', MONO) : ''}
    ${sub ? txt(cx + 20, cy + 13, sub, 8, C.ink, 'start', '', MONO) : ''}`;
  }

  /* STS 静态切换开关: 框 + 双向切换, 高44 */
  const _stsH = 44, _stsW = 150;
  function sts(x, y, color, label, sub) {
    const c = color || '#e11d48', cx = x + _stsW / 2;
    const inner = `<line x1="${x + 20}" y1="${y + 22}" x2="${x + _stsW - 20}" y2="${y + 22}" stroke="${c}" stroke-width="1.4"/>
      <line x1="${x + _stsW / 2}" y1="${y + 10}" x2="${x + _stsW / 2}" y2="${y + 34}" stroke="${c}" stroke-width="1.4"/>
      <path d="M${x + _stsW / 2},${y + 10} L${x + _stsW / 2 - 6},${y + 16} M${x + _stsW / 2},${y + 10} L${x + _stsW / 2 + 6},${y + 16}"
        fill="none" stroke="${c}" stroke-width="1.2"/>`;
    return block(x, y, _stsW, _stsH, c, label, sub, '#fff1f2', inner);
  }

  /* 列头柜 PDU, 高44 */
  function pdu(x, y, w, h, color, label, sub) {
    const c = color || C.ups;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f5f3ff" stroke="${c}" stroke-width="1.5" rx="3"/>
    <line x1="${x + 10}" y1="${y + 12}" x2="${x + w - 10}" y2="${y + 12}" stroke="${c}" stroke-width="2.2"/>
    <line x1="${x + w / 2}" y1="${y + 12}" x2="${x + w / 2}" y2="${y + 20}" stroke="${c}" stroke-width="1.4"/>
    <text x="${x + w / 2}" y="${y + h / 2 + 9}" text-anchor="middle" font-size="10" font-weight="bold" fill="${c}" font-family="${FONT}">${esc(label || '')}</text>
    ${sub ? `<text x="${x + w / 2}" y="${y + h - 6}" text-anchor="middle" font-size="7.5" fill="${C.ink}" font-family="${FONT}">${esc(sub)}</text>` : ''}`;
  }

  /* 服务器机柜, 高70 */
  function rack(x, y, w, h, color, label, sub) {
    const c = color || C.ink, inner = '';
    let g = '';
    for (let i = 1; i <= 3; i++)
      g += `<line x1="${x + 10}" y1="${y + 10 + i * 11}" x2="${x + w - 10}" y2="${y + 10 + i * 11}" stroke="${c}" stroke-width="0.8" opacity="0.45"/>`;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f8fafc" stroke="${c}" stroke-width="1.5" rx="3"/>
      ${g}
      <text x="${x + w / 2}" y="${y + 16}" text-anchor="middle" font-size="10.5" font-weight="bold" fill="${c}" font-family="${FONT}">${esc(label || '')}</text>
      ${sub ? txt(x + w / 2, y + h - 10, sub, 8, C.ink, 'middle') : ''}`;
  }

  /* 柴油发电机: 框 + G 圆 */
  function gen(x, y, w, h, color, label, sub) {
    const c = color || C.gen;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#faf5ff" stroke="${c}" stroke-width="1.5" rx="3"/>
    <circle cx="${x + 18}" cy="${y + h / 2}" r="11" fill="#fff" stroke="${c}" stroke-width="1.5"/>
    <text x="${x + 18}" y="${y + h / 2 + 4}" text-anchor="middle" font-size="10" fill="${c}" font-family="${MONO}">G</text>
    <text x="${x + 36}" y="${y + h / 2 - 1}" font-size="10" font-weight="bold" fill="${c}" font-family="${FONT}">${esc(label || '')}</text>
    ${sub ? `<text x="${x + 36}" y="${y + h / 2 + 13}" font-size="8" fill="${C.ink}" font-family="${FONT}">${esc(sub)}</text>` : ''}`;
  }

  /* 保护接地 PE (IEC 60617-2), 高16 */
  function pe(cx, y0, color) {
    const c = color || C.lv;
    return `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y0 + 4}" stroke="${c}" stroke-width="1.6"/>
    <line x1="${cx - 11}" y1="${y0 + 5}" x2="${cx + 11}" y2="${y0 + 5}" stroke="${c}" stroke-width="1.4"/>
    <line x1="${cx - 7}" y1="${y0 + 10}" x2="${cx + 7}" y2="${y0 + 10}" stroke="${c}" stroke-width="1.4"/>
    <line x1="${cx - 3}" y1="${y0 + 15}" x2="${cx + 3}" y2="${y0 + 15}" stroke="${c}" stroke-width="1.4"/>`;
  }

  /* 母线 (>=3倍线宽), 高12 */
  function bus(x, y, len, color, label) {
    const c = color || C.lv;
    return `<line x1="${x}" y1="${y}" x2="${x + len}" y2="${y}" stroke="${c}" stroke-width="4.5"/>
    ${label ? txt(x + len / 2, y - 6, label, 9.5, c, 'middle', 'bold') : ''}`;
  }

  /* ---------- 液冷 P&ID 符号 (GB/T 4728 管道仪表 + IEC 60617) ---------- */

  /* 离心泵: 圆 + 三角, 40x40 */
  function pump(x, y, color, label) {
    const c = color || C.wtr, cx = x + 20, cy = y + 20;
    return `<circle cx="${cx}" cy="${cy}" r="14" fill="#fff" stroke="${c}" stroke-width="1.5"/>
    <path d="M${cx},${cy - 9} L${cx + 9},${cy} L${cx},${cy + 9} Z" fill="${c}" opacity="0.9"/>
    ${label ? txt(x, y + 48, label, 9, c, 'middle', 'bold') : ''}`;
  }

  /* 电动调节阀 (两通), 高24 */
  const _valH = 24;
  function valve(cx, y0, color, label) {
    const c = color || C.ink;
    return `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y0 + 6}" stroke="${c}" stroke-width="1.4"/>
    <path d="M${cx - 8},${y0 + 6} L${cx + 8},${y0 + 18} L${cx - 8},${y0 + 24} Z" fill="#fff" stroke="${c}" stroke-width="1.3"/>
    <path d="M${cx - 8},${y0 + 6} L${cx - 13},${y0 + 6} M${cx + 8},${y0 + 24} L${cx + 13},${y0 + 24}" stroke="${c}" stroke-width="1.4"/>
    <line x1="${cx}" y1="${y0 + 24}" x2="${cx}" y2="${y0 + 30}" stroke="${c}" stroke-width="1.4"/>
    ${label ? txt(cx + 18, y0 + 17, label, 8.5, c, 'start', '', MONO) : ''}`;
  }

  /* 止回阀, 高20 */
  function chk(cx, y0, color) {
    const c = color || C.ink;
    return `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y0 + 20}" stroke="${c}" stroke-width="1.4"/>
    <path d="M${cx - 8},${y0 + 4} L${cx + 8},${y0 + 12} L${cx - 8},${y0 + 16} Z" fill="#fff" stroke="${c}" stroke-width="1.2"/>`;
  }

  /* 板式换热器, 60x46 */
  function hx(x, y, color, label, sub) {
    const c = color || C.wtr;
    const inner = `<line x1="${x + 18}" y1="${y + 10}" x2="${x + 18}" y2="${y + 36}" stroke="${c}" stroke-width="2"/>
      <line x1="${x + 30}" y1="${y + 10}" x2="${x + 30}" y2="${y + 36}" stroke="${c}" stroke-width="1.4"/>
      <line x1="${x + 42}" y1="${y + 10}" x2="${x + 42}" y2="${y + 36}" stroke="${c}" stroke-width="2"/>`;
    return block(x, y, 60, 46, c, label, sub, '#f0fdfa', inner);
  }

  /* 冷却塔: 梯形 + 波纹, 110x54 */
  function tower(x, y, w, h, color, label, sub) {
    const c = color || C.wtr;
    const inner = `<path d="M${x + 8},${y + h} L${x + w - 8},${y + h} L${x + w - 26},${y + 12} L${x + 26},${y + 12} Z"
        fill="#f0fdfa" stroke="${c}" stroke-width="1.5"/>
      ${[0.32, 0.5, 0.68].map((f) => `<line x1="${x + w * f}" y1="${y + h - 12}" x2="${x + w * f}" y2="${y + 16}" stroke="${c}" stroke-width="0.9" opacity="0.6"/>`).join('')}
      <path d="M${x + w / 2 - 12},${y + 6} q6,-8 12,0 q6,8 12,0" fill="none" stroke="${c}" stroke-width="1"/>`;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="none"/>
      ${inner}
      <text x="${x + w / 2}" y="${y + h + 14}" text-anchor="middle" font-size="9.5" font-weight="bold" fill="${c}">${esc(label || '')}</text>
      ${sub ? txt(x + w / 2, y + h + 27, sub, 8, C.ink, 'middle') : ''}`;
  }

  /* 冷水机, 96x56 */
  function chiller(x, y, w, h, color, label, sub) {
    const c = color || C.wtr, cx = x + w / 2;
    const inner = `<circle cx="${cx - 14}" cy="${y + h / 2}" r="11" fill="#fff" stroke="${c}" stroke-width="1.4"/>
      <path d="M${cx - 19},${y + h / 2} q5,-7 10,0 q5,7 10,0" fill="none" stroke="${c}" stroke-width="1"/>
      <line x1="${cx + 4}" y1="${y + h / 2}" x2="${cx + 16}" y2="${y + h / 2}" stroke="${c}" stroke-width="1.4"/>`;
    return block(x, y, w, h, c, label, sub, '#f0fdfa', inner);
  }

  /* CDU 冷量分配单元, 96x60 */
  function cdu(x, y, w, h, color, label, sub) {
    const c = color || C.sup, cx = x + w / 2;
    const inner = `<circle cx="${cx - 16}" cy="${y + 22}" r="9" fill="#fff" stroke="${c}" stroke-width="1.3"/>
      <path d="M${cx - 16},${y + 15} L${cx - 8},${y + 22} L${cx - 16},${y + 29} Z" fill="${c}" opacity="0.85"/>
      <line x1="${cx - 2}" y1="${y + 10}" x2="${cx - 2}" y2="${y + 34}" stroke="${c}" stroke-width="1.6"/>
      <line x1="${cx + 12}" y1="${y + 10}" x2="${cx + 12}" y2="${y + 34}" stroke="${c}" stroke-width="1.6"/>`;
    return block(x, y, w, h, c, label, sub, '#f0f9ff', inner);
  }

  /* 仪表传感器圆 (TT/FT/PT), 高22 */
  function sensor(cx, y0, color, kind, label) {
    const c = color || C.ink;
    return `<circle cx="${cx}" cy="${y0 + 9}" r="9" fill="#fff" stroke="${c}" stroke-width="1.3"/>
    <text x="${cx}" y="${y0 + 13}" text-anchor="middle" font-size="8.5" fill="${c}" font-family="${MONO}">${esc(kind || 'TT')}</text>
    <line x1="${cx}" y1="${y0 + 18}" x2="${cx}" y2="${y0 + 22}" stroke="${c}" stroke-width="1.2"/>
    ${label ? txt(cx + 13, y0 + 11, label, 8.5, c, 'start', '', MONO) : ''}`;
  }

  /* 膨胀罐/定压罐, 60x50 */
  function tank(x, y, color, label, sub) {
    const c = color || C.wtr;
    const inner = `<ellipse cx="${x + 30}" cy="${y + 38}" rx="26" ry="7" fill="#f0fdfa" stroke="${c}" stroke-width="1.3"/>
      <path d="M${x + 4},${y + 38} L${x + 4},${y + 10} A26,14 0 0 1 ${x + 56},${y + 10} L${x + 56},${y + 38}"
        fill="#f0fdfa" stroke="${c}" stroke-width="1.3"/>
      <line x1="${x + 4}" y1="${y + 20}" x2="${x + 56}" y2="${y + 20}" stroke="${c}" stroke-width="0.8" stroke-dasharray="3,2"/>`;
    return `<g>${inner}
      <text x="${x + 30}" y="${y + 62}" text-anchor="middle" font-size="9.5" font-weight="bold" fill="${c}">${esc(label || '')}</text>
      ${sub ? txt(x + 30, y + 75, sub, 8, C.ink, 'middle') : ''}</g>`;
  }

  /* 集水器/分水器 manifold, 高40 */
  function manifold(x, y, len, color, label) {
    const c = color || C.sup;
    return `<line x1="${x}" y1="${y}" x2="${x + len}" y2="${y}" stroke="${c}" stroke-width="4"/>
    ${label ? txt(x + len / 2, y - 6, label, 9.5, c, 'middle', 'bold') : ''}`;
  }

  /* 流向箭头 */
  function flowArrow(x1, y1, x2, y2, color, label) {
    const c = color || C.ink;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const l = 8;
    const xa = mx - l * Math.cos(ang - 0.5), ya = my - l * Math.sin(ang - 0.5);
    const xb = mx - l * Math.cos(ang + 0.5), yb = my - l * Math.sin(ang + 0.5);
    return `<path d="M${xa},${ya} L${mx},${my} L${xb},${yb} M${mx},${my} L${mx + l * Math.cos(ang)},${my + l * Math.sin(ang)}"
      fill="none" stroke="${c}" stroke-width="1.4"/>${label ? txt(mx, my - 6, label, 8, c, 'middle') : ''}`;
  }

  /* 设备明细表 (CAD 惯例: 图上只放位号, 型号规格集中到明细表) */
  function schedule(rows, x, y, w) {
    const c = C.ink, rh = 12, hw = 16;
    const h = hw + rows.length * rh;
    const c1 = x + 52, c2 = x + 118;
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${c}" stroke-width="1.2"/>
    <text x="${x + w / 2}" y="${y - 5}" text-anchor="middle" font-size="9" font-weight="bold" fill="${c}" font-family="${FONT}">设备明细表</text>
    <line x1="${x}" y1="${y + hw}" x2="${x + w}" y2="${y + hw}" stroke="${c}" stroke-width="0.9"/>
    <line x1="${c1}" y1="${y}" x2="${c1}" y2="${y + h}" stroke="${c}" stroke-width="0.7"/>
    <line x1="${c2}" y1="${y}" x2="${c2}" y2="${y + h}" stroke="${c}" stroke-width="0.7"/>
    ${txt(x + 4, y + 11, '位号', 8, c, 'start', 'bold')}
    ${txt(c1 + 4, y + 11, '名称', 8, c, 'start', 'bold')}
    ${txt(c2 + 4, y + 11, '规格型号', 8, c, 'start', 'bold')}`;
    rows.forEach((r, i) => {
      const yy = y + hw + i * rh;
      s += txt(x + 4, yy + 9, r.tag, 7, c, 'start', '', MONO);
      s += txt(c1 + 4, yy + 9, r.name, 7, c, 'start');
      s += txt(c2 + 4, yy + 9, r.spec, 7, '#334155', 'start', '', MONO);
      if (i < rows.length - 1) s += `<line x1="${x}" y1="${yy + rh}" x2="${x + w}" y2="${yy + rh}" stroke="${c}" stroke-width="0.5"/>`;
    });
    return s;
  }

  /* Resolve a sheet from ADEM's drawing register.  Renderers pass the
   * generated result R, so the document ID is stable even if the title text
   * or screen language is changed later. */
  function documentMeta(R, drawingKey, overrides) {
    const design = R && R.design ? R.design : {};
    const control = design.documentControl || {};
    const register = Array.isArray(control.drawingRegister) ? control.drawingRegister : [];
    const drawing = register.find((item) => item.key === drawingKey) || {};
    const project = design.project || {};
    const baseline = Array.isArray(control.referenceBaseline) ? control.referenceBaseline : [];
    const baselineLabel = baseline.slice(0, 3).map((item) => item.title).join(' · ') || '项目适用标准待确认';
    const defaultSheet = { format: 'A3', widthMm: 420, heightMm: 297, orientation: 'LANDSCAPE' };
    return Object.assign({
      drawingKey: drawingKey || 'unregistered',
      drawingNo: drawing.drawingNo || 'AIDC-CONCEPT-000',
      drawingRef: drawing.drawingRef || '',
      revision: drawing.revision || control.revision || 'P01',
      rev: drawing.revision || control.revision || 'P01',
      discipline: drawing.discipline || 'GENERAL',
      issuePurpose: drawing.issuePurpose || control.issuePurpose || '方案级自动草图，待专业校核/签发',
      status: drawing.status || control.status || 'CONCEPT_DRAFT—PROFESSIONAL_REVIEW_REQUIRED',
      verification: drawing.verification || 'NOT_VERIFIED',
      documentSetId: control.documentSetId || '',
      projectRef: control.projectReference || project.referenceDesignation || '',
      projName: (R && R.projName) || project.name || '',
      designer: '自动生成（待校核）',
      checker: '未委派',
      approver: '未委派',
      issueDate: '待签发',
      page: control.page || { current: 1, total: 1 },
      scale: drawing.scale || 'NTS',
      sheet: Object.assign({}, defaultSheet, drawing.sheet ? { format: drawing.sheet } : {}, drawing.orientation ? { orientation: drawing.orientation } : {}),
      standard: baselineLabel + '（仅参考，适用性待确认）',
      cadLayerManifest: Array.isArray(control.cadLayerManifest) && control.cadLayerManifest.length ? control.cadLayerManifest : DEFAULT_CAD_LAYER_MANIFEST
    }, overrides || {});
  }

  /* ---------- CAD-style drawing frame + title block ---------- */

  /*
   * SVG is the preview/publish surface, not a DWG replacement.  The
   * root now has an actual A3 paper size in millimetres and receives a
   * matching 1.414:1 virtual canvas from each renderer.
   */
  function svgOpen(W, H, title, sub, meta) {
    const m = meta || {};
    const st = m.standard || '标准基线待项目确认';
    /* Do not use the browser clock: generated diagrams must remain
     * deterministic.  Signing/export dates belong in the export package. */
    const date = m.issueDate || m.date || '待签发';
    const rev = m.revision || m.rev || 'P01';
    const scale = m.scale || 'NTS';
    const no = m.drawingNo || 'AIDC-CONCEPT-000';
    const designer = m.designer || '自动化方案草案';
    const proj = m.projName || '';
    const status = m.status || 'CONCEPT_DRAFT—PROFESSIONAL_REVIEW_REQUIRED';
    const statusLabel = /CONCEPT_DRAFT/.test(status) ? '方案级草图 · 待专业校核/签发' : status;
    const discipline = m.discipline || 'GENERAL';
    const purpose = m.issuePurpose || '方案级自动草图，待专业校核/签发';
    const checker = m.checker || '未委派';
    const approver = m.approver || '未委派';
    const page = m.page || { current: 1, total: 1 };
    const sheet = m.sheet || { format: 'A3', widthMm: 420, heightMm: 297, orientation: 'LANDSCAPE' };
    const tbH = 84, tbY = H - tbH - 10;
    const tbW = Math.min(560, W * 0.38), tbX = W - tbW - 10;
    const splitA = tbX + tbW * 0.53, splitB = tbX + tbW * 0.77;
    const stdShort = st.split('·').slice(0, 3).join('·').trim();
    const layers = Array.isArray(m.cadLayerManifest) && m.cadLayerManifest.length ? m.cadLayerManifest : DEFAULT_CAD_LAYER_MANIFEST;
    const metadata = esc(JSON.stringify({
      documentStatus: status, issuePurpose: purpose, verification: m.verification || 'NOT_VERIFIED',
      documentSetId: m.documentSetId || '', projectReference: m.projectRef || '',
      drawingKey: m.drawingKey || '', drawingNo: no, drawingRef: m.drawingRef || '', revision: rev,
      sheet: sheet.format + ' ' + sheet.orientation, units: 'mm', engine: 'AIDC',
      cadLayerManifest: layers
    }));
    const layerManifest = esc(JSON.stringify(layers));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${sheet.widthMm}mm" height="${sheet.heightMm}mm" preserveAspectRatio="xMidYMid meet" data-sheet-format="${sheet.format}" data-sheet-orientation="${sheet.orientation}" data-units="mm" data-document-key="${esc(m.drawingKey || '')}" data-document-status="${esc(status)}" data-document-control="CONCEPTUAL_SCHEME" data-cad-layer-manifest="${layerManifest}">
    <title>${esc(title)}</title><desc>${esc(status)}</desc><metadata>${metadata}</metadata>
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <g id="AIDC-FRAME" data-layer="AIDC-FRAME">
      <rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="none" stroke="${C.ink}" stroke-width="2"/>
      <rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="${C.ink}" stroke-width="0.8"/>
      <rect x="${tbX}" y="${tbY}" width="${tbW}" height="${tbH}" fill="#fff" stroke="${C.ink}" stroke-width="1.5"/>
      <line x1="${tbX}" y1="${tbY + 20}" x2="${tbX + tbW}" y2="${tbY + 20}" stroke="${C.ink}" stroke-width="0.9"/>
      <line x1="${tbX}" y1="${tbY + 42}" x2="${tbX + tbW}" y2="${tbY + 42}" stroke="${C.ink}" stroke-width="0.9"/>
      <line x1="${tbX}" y1="${tbY + 63}" x2="${tbX + tbW}" y2="${tbY + 63}" stroke="${C.ink}" stroke-width="0.9"/>
      <line x1="${splitA}" y1="${tbY}" x2="${splitA}" y2="${tbY + tbH}" stroke="${C.ink}" stroke-width="0.9"/>
      <line x1="${splitB}" y1="${tbY}" x2="${splitB}" y2="${tbY + 63}" stroke="${C.ink}" stroke-width="0.9"/>
      <text x="${tbX + 6}" y="${tbY + 13}" font-size="7.5" fill="${C.ink}" font-family="${FONT}">项目: ${esc(proj)}</text>
      <text x="${tbX + 6}" y="${tbY + 35}" font-size="9.4" font-weight="bold" fill="${C.ink}" font-family="${FONT}">${esc(title)}</text>
      <text x="${tbX + 6}" y="${tbY + 57}" font-size="6.8" fill="${C.ink}" font-family="${FONT}">文件集: ${esc(m.documentSetId || '待分配')} · 参考: ${esc(m.projectRef || '待确认')}</text>
      <text x="${tbX + 6}" y="${tbY + 78}" font-size="6.8" fill="#b45309" font-weight="bold" font-family="${FONT}">状态: ${esc(statusLabel)}</text>
      <text x="${splitA + 5}" y="${tbY + 12}" font-size="7.2" fill="${C.ink}" font-family="${FONT}">图号: ${esc(no)}</text>
      <text x="${splitA + 5}" y="${tbY + 31}" font-size="7.2" fill="${C.ink}" font-family="${FONT}">修订: ${esc(rev)} · ${esc(discipline)}</text>
      <text x="${splitA + 5}" y="${tbY + 51}" font-size="6.7" fill="${C.ink}" font-family="${FONT}">编制: ${esc(designer)}</text>
      <text x="${splitA + 5}" y="${tbY + 70}" font-size="6.7" fill="${C.ink}" font-family="${FONT}">校核: ${esc(checker)} · 批准: ${esc(approver)}</text>
      <text x="${splitB + 5}" y="${tbY + 12}" font-size="7.1" fill="${C.ink}" font-family="${FONT}">图幅: ${esc(sheet.format)} ${esc(sheet.orientation)}</text>
      <text x="${splitB + 5}" y="${tbY + 31}" font-size="7.1" fill="${C.ink}" font-family="${FONT}">比例: ${esc(scale)} · 页: ${esc(page.current)}/${esc(page.total)}</text>
      <text x="${splitB + 5}" y="${tbY + 51}" font-size="6.7" fill="${C.ink}" font-family="${FONT}">阶段: 方案级草图</text>
      <text x="${splitB + 5}" y="${tbY + 70}" font-size="6.7" fill="${C.ink}" font-family="${FONT}">签发: ${esc(date)}</text>
    </g>
    <g id="AIDC-TITLE" data-layer="AIDC-TEXT">
      <text x="${W / 2}" y="30" text-anchor="middle" font-size="15" font-weight="bold" fill="${C.ink}" font-family="${FONT}">${esc(title)}</text>
      <text x="${W / 2}" y="46" text-anchor="middle" font-size="9.5" fill="#334155" font-family="${FONT}">${esc(sub || '')}</text>
    </g>`;
  }

  /* 图例 */
  function legend(items, x, y, w) {
    const c = C.ink;
    let s = `<rect x="${x}" y="${y}" width="${w || 200}" height="${items.length * 18 + 26}" fill="#fff"
      stroke="${c}" stroke-width="1.1" rx="3"/>
    <text x="${x + 10}" y="${y + 16}" font-size="10" font-weight="bold" fill="${c}" font-family="${FONT}">图例 LEGEND</text>`;
    items.forEach((it, i) => {
      const yy = y + 30 + i * 18;
      s += `<line x1="${x + 10}" y1="${yy}" x2="${x + 46}" y2="${yy}" stroke="${it.color}"
        stroke-width="${it.thick || 1.6}" ${it.dash ? `stroke-dasharray="${it.dash}"` : ''}/>`;
      s += txt(x + 52, yy + 3.5, it.label, 9, '#334155', 'start');
    });
    return s;
  }

  return {
    C, FONT, MONO, CAD_LAYER_MANIFEST: DEFAULT_CAD_LAYER_MANIFEST,
    txt, wire, pathPts, jdot, jump, jumpV, block,
    pwr, _pwrH, cb, _cbH, ds, _dsH, fu, _fuH, ct, _ctH, pt, _ptH, tx, _txH,
    ups, _upsH, _upsW, bat, _batH, sts, _stsH, _stsW, pdu, rack, gen, pe, bus,
    pump, valve, chk, hx, tower, chiller, cdu, sensor, tank, manifold, flowArrow,
    svgOpen, legend, schedule, documentMeta
  };
})();
