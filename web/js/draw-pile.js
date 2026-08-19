/* ============================================================
 * 充电桩电气原理图渲染器
 * ------------------------------------------------------------
 * 只读取引擎结果与工程模型渲染，不自行决定设备数量、额定值或拓扑。
 * 分区遵循 sch_lib 参考图确认的阅读顺序：
 *   交流进线 → 功率变换 → 直流母线与保护计量 → 充电枪回路
 *   下方依次为 保护接地干线 / 储能与二次系统 / 辅助电源与配电
 * ============================================================ */
window.drawPile = function (R) {
  'use strict';
  const S = window.SYM, C = S.C, L = window.LAYOUT;
  const W = 1680, H = 1188;
  const std = R.standard, ac = R.ac, dc = R.dc, guns = R.guns || [], ess = R.ess || {}, aux = R.aux || {};
  /* 设计人/水印：可由输入参数覆盖（skill 缺省为作者名） */
  const designerName = S.clip((R.inputs && R.inputs.designer) || 'Jixiong Lu', 9, 120);
  const watermarkText = (R.inputs && R.inputs.watermarkText) || '卢继雄';
  const doc = S.documentMeta(R, 'ev-schematic', { designer: designerName });

  const subtitle = [
    std.name + ' · ' + R.archetype.name,
    dc.ratedKw + 'kW 额定 / ' + dc.installedKw + 'kW 装机',
    guns.length + ' 枪 × ' + (guns[0] ? guns[0].currentA : 0) + 'A',
    dc.outputRangeText,
    ess.enabled ? ('储能 ' + ess.installedKwh + 'kWh · ' + ess.couplingName) : '无储能配置'
  ].join(' | ');

  let s = S.svgOpen(W, H, '充电桩电气原理图', subtitle, doc);
  s += S.watermark(W, H, watermarkText);

  /* ============ 几何基准：全部来自布局层，本文件不再持有坐标字面量 ============ */
  const P = window.EVSE_PLACEMENT.compute(R);
  const RAIL_AC = P.rails.acY;
  const AC_BUS_X = P.rails.acBusX;
  const RAIL_DC_P = P.rails.dcP;
  const RAIL_DC_N = P.rails.dcN;
  const RAIL_X0 = P.rails.dcX0, RAIL_X1 = P.rails.dcX1;
  const PE_Y = P.rails.peY;
  const ESS_RISER_X = P.rails.essRiserX;
  const AUX_DROP_X = P.rails.auxDropX;
  const SIG_BUS_Y = P.rails.sigBusY;
  const D = P.devices;
  const zoneOf = (id) => P.zones.find((z) => z.id === id);
  const zrect = (id, title) => { const z = zoneOf(id); return S.zone(z.x, z.y, z.w, z.h, title || z.title); };

  /* L1/L2/L3(/N) 分线母排的多线扇入/扇出：每根水平线接本相线，
   * 途中跨越中间相线时走半圆（强制规则 LIB-R10）。side=left/right 为扇来向，extraHops 为额外需跨越的竖线 x。 */
  /* L1/L2/L3(/N) 分线母排的多线扇入/扇出：每根水平线接本相线。
   * 交叉半圆不在此处判断——由 S.resolveCrossings 统一后处理（第0步）。 */
  function fanAC(xFrom, yTop, side, n, extraHops, color) {
    const col = color || C.ac;
    const colFor = (i) => (i === n - 1 && n === 4) ? C.n : col; /* 第 4 线为 N，IEC 蓝 */
    const xs = Array.from({ length: n }, (u, k) => AC_BUS_X + (k - (n - 1) / 2) * 8);
    let out = '';
    for (let i = 0; i < n; i += 1) {
      const y = yTop + i * 6; /* 分线间距 6px，禁止视觉并合 */
      const ti = side === 'left' ? i : n - 1 - i;
      out += S.wire(xFrom, y, xs[ti], y, colFor(i), 1.4);
    }
    return out;
  }

  /* ============ 1. 交流进线与保护 ============ */
  s += zrect('ac-in');
  s += S.terminals(D.W01.box.x, D.W01.box.y, D.W01.terminals, C.ac, D.W01.box.w);
  s += S.txt(D.W01.box.x + D.W01.box.w / 2, 112, 'W01 进线', 7.5, C.ac, 'middle', 'bold');
  s += S.wire(D.W01.ports.out.x, RAIL_AC, D.QS1.x, RAIL_AC, C.ac, 1.8, null, undefined, { c: 'CCT-AC-01' });
  s += S.hisolator(D.QS1.x, RAIL_AC, C.ac, 'QS1');
  s += S.wire(D.QS1.ports.out.x, RAIL_AC, D.QF1.x, RAIL_AC, C.ac, 1.8, null, undefined, { c: 'CCT-AC-02' });
  s += S.hbreaker(D.QF1.x, RAIL_AC, C.ac, 'QF1');
  s += S.wire(D.QF1.ports.out.x, RAIL_AC, D.RCM1.x, RAIL_AC, C.ac, 1.8, null, undefined, { c: 'CCT-AC-03' });
  s += S.jdot(D.FV1.tapX, RAIL_AC, C.ac);
  s += S.wire(D.FV1.tapX, RAIL_AC, D.FV1.tapX, D.FV1.y0, C.saf, 1.4, null, undefined, { c: 'CCT-AC-07', r: 'safety' });
  s += S.spd(D.FV1.tapX, D.FV1.y0, C.saf, 'FV1');
  s += S.wire(D.FV1.tapX, D.FV1.y0 + 30, D.FV1.tapX, PE_Y, C.pe, 1.5, null, undefined, { c: 'CCT-PE-01' });
  s += S.hsensor(D.RCM1.x, RAIL_AC, C.ac, 'RCM1', 'IΔ');
  s += S.wire(D.RCM1.ports.out.x, RAIL_AC, D.PJ1.x, RAIL_AC, C.ac, 1.8, null, undefined, { c: 'CCT-AC-04' });
  s += S.block(D.PJ1.box.x, D.PJ1.box.y, D.PJ1.box.w, D.PJ1.box.h, C.ac, 'PJ1', '交流计量', C.fill.ac);
  s += S.wire(D.PJ1.ports.out.x, RAIL_AC, D.KM1.x, RAIL_AC, C.ac, 1.8, null, undefined, { c: 'CCT-AC-05' });
  s += S.hcontact(D.KM1.x, RAIL_AC, C.ac, 'KM1');
  s += S.wire(D.KM1.ports.out.x, RAIL_AC, P.acEndX, RAIL_AC, C.ac, 1.8, null, undefined, { c: 'CCT-AC-06' });
  s += S.txt(44, 200, ac.description + ' · ' + ac.supplyText, 7, C.anno, 'start');
  s += S.txt(44, 212, 'QS1/QF1 ' + ac.breakerA + 'A · KM1 ' + ac.contactorA + 'A · 进线 ' + ac.cableText, 7, C.anno, 'start');

  /* 交流分配母排：L1/L2/L3(/N) 各自分线（强制规则 LIB-R11，禁止三相合一） */
  const acPhases = std.neutral ? 4 : 3;
  const phaseXs = Array.from({ length: acPhases }, (u, k) => AC_BUS_X + (k - (acPhases - 1) / 2) * 8);
  phaseXs.forEach((px, k) => {
    const phc = (k === acPhases - 1 && acPhases === 4) ? C.n : C.ac; /* N 线 IEC 蓝 */
    s += S.vbus(px, 110, 234, phc, 2);
    s += S.txt(px, 105, ['L1', 'L2', 'L3', 'N'][k], 5, phc, 'middle', 'bold');
  });
  s += S.txt(AC_BUS_X - 18, 97, 'WB1 交流母排 ' + ac.busbarA + 'A', 7.5, C.ac, 'middle', 'bold');
  s += fanAC(376, RAIL_AC - 6, 'left', acPhases);

  /* ============ 2. 功率变换 ============ */
  s += zrect('convert');
  s += S.moduleArray(D.M1.box.x, D.M1.box.y, D.M1.box.w, D.M1.box.h, C.dc, D.M1.rows, null, null);
  s += fanAC(D.M1.ports.ac.x, D.M1.ports.ac.y, 'right', acPhases);
  s += S.txt(D.M1.box.x + D.M1.box.w / 2, 204, 'M1 充电功率模块 ' + dc.moduleCount + ' × ' + dc.moduleKw + 'kW', 7.5, C.dc, 'middle', 'bold');
  s += S.txt(D.M1.box.x + D.M1.box.w / 2, 215, dc.outputRangeText + ' · ' + dc.moduleCooling + ' · 并联均流', 7, C.anno, 'middle');

  /* ============ 3. 直流保护与计量 ============ */
  s += zrect('dc-prot');
  s += S.wire(D.M1.ports.dcP.x, P.rails.dcChainY, D.FU1.x, P.rails.dcChainY, C.dc, 1.8, null, undefined, { c: 'CCT-DC-01' });
  s += S.hfuse(D.FU1.x, P.rails.dcChainY, C.dc, 'FU1');
  s += S.wire(D.FU1.ports.out.x, P.rails.dcChainY, D.TA1.x, P.rails.dcChainY, C.dc, 1.8, null, undefined, { c: 'CCT-DC-02' });
  s += S.hsensor(D.TA1.x, P.rails.dcChainY, C.dc, 'TA1', 'A');
  s += S.wire(D.TA1.ports.out.x, P.rails.dcChainY, D.PJ2.x, P.rails.dcChainY, C.dc, 1.8, null, undefined, { c: 'CCT-DC-03' });
  s += S.block(D.PJ2.box.x, D.PJ2.box.y, D.PJ2.box.w, D.PJ2.box.h, C.dc, 'PJ2', '直流计量', C.fill.dc);
  s += S.wire(D.PJ2.ports.out.x, P.rails.dcChainY, P.dcRiserX, P.rails.dcChainY, C.dc, 1.8, null, undefined, { c: 'CCT-DC-04' });
  s += S.wire(P.dcRiserX, P.rails.dcChainY, P.dcRiserX, RAIL_DC_P, C.dc, 1.8);
  s += S.jdot(P.dcRiserX, RAIL_DC_P, C.dc, 3);
  s += S.wire(D.M1.ports.dcN.x, D.M1.ports.dcN.y, P.dcNegRiserX, D.M1.ports.dcN.y, C.dc, 1.8);
  s += S.wire(P.dcNegRiserX, D.M1.ports.dcN.y, P.dcNegRiserX, RAIL_DC_P - 6, C.dc, 1.8);
  s += S.jumpV(P.dcNegRiserX, RAIL_DC_P, C.dc, 6);
  s += S.wire(P.dcNegRiserX, RAIL_DC_P + 6, P.dcNegRiserX, RAIL_DC_N, C.dc, 1.8);
  s += S.jdot(P.dcNegRiserX, RAIL_DC_N, C.dc, 3);
  s += S.txt(616, 200, 'FU1 ' + dc.mainFuseA + 'A gR · TA1 0–' + dc.sensorRangeA + 'A', 7, C.anno, 'start');
  s += S.txt(616, 212, 'PJ2 ' + S.clip(std.meter, 7, 224), 7, C.anno, 'start');

  /* ============ 4. 充电直流母线 ============ */
  s += S.bus(RAIL_X0, RAIL_DC_P, RAIL_X1 - RAIL_X0, C.dc, 5);
  s += S.bus(RAIL_X0, RAIL_DC_N, RAIL_X1 - RAIL_X0, C.dc, 5);
  s += S.txt(560, 242, 'DC+ 母线 ' + dc.busbarA + 'A', 7.5, C.dc, 'start', 'bold');
  s += S.txt(560, 293, 'DC- 母线 ' + dc.busbarA + 'A · 输出窗口 ' + dc.outputRangeText, 7.5, C.dc, 'start', 'bold');

  /* 绝缘监测 IMD：取样自 DC+/DC-，基准接 PE */
  s += S.jdot(D.RI1.ports.dcP.x, RAIL_DC_P, C.dc);
  s += S.wire(D.RI1.ports.dcP.x, RAIL_DC_P, D.RI1.ports.dcP.x, RAIL_DC_N - 6, C.dc, 1.3, null, undefined, { c: 'CCT-DC-05' });
  s += S.jumpV(D.RI1.ports.dcP.x, RAIL_DC_N, C.dc, 6);
  s += S.wire(D.RI1.ports.dcP.x, RAIL_DC_N + 6, D.RI1.ports.dcP.x, D.RI1.box.y, C.dc, 1.3);
  s += S.jdot(D.RI1.ports.dcN.x, RAIL_DC_N, C.dc);
  s += S.wire(D.RI1.ports.dcN.x, RAIL_DC_N, D.RI1.ports.dcN.x, D.RI1.box.y, C.dc, 1.3);
  s += S.block(D.RI1.box.x, D.RI1.box.y, D.RI1.box.w, D.RI1.box.h, C.dc, 'RI1 绝缘监测', 'IMD · ≥100Ω/V', C.fill.dc);
  s += S.wire(D.RI1.ports.pe.x, D.RI1.ports.pe.y, D.RI1.ports.pe.x, PE_Y, C.pe, 1.5, null, undefined, { c: 'CCT-PE-02' });

  /* 母线泄放电阻 */
  s += S.jdot(D.RS0.x, RAIL_DC_P, C.dc);
  s += S.wire(D.RS0.x, RAIL_DC_P, D.RS0.x, D.RS0.y0, C.dc, 1.3);
  s += S.vres(D.RS0.x, D.RS0.y0, C.dc, 'RS0');
  s += S.wire(D.RS0.x, D.RS0.y0 + 30, D.RS0.x, RAIL_DC_N, C.dc, 1.3);
  s += S.jdot(D.RS0.x, RAIL_DC_N, C.dc);
  s += S.txt(806, 322, '停机泄放：1s 内降至 ≤60VDC（阻值待核算）', 7, C.anno, 'middle');

  /* ============ 5. 充电枪回路 ============ */
  s += zrect('guns');
  const centers = P.guns.map((g) => g.cx);
  const sigLines = [];
  P.guns.forEach((G, index) => {
    const gun = guns[index];
    const cx = G.cx, xp = G.xp, xn = G.xn, T = G.terminals;
    /* DC+ 支路：母线 → 快熔 → 正极接触器 → 枪 */
    s += S.jdot(xp, RAIL_DC_P, C.dc, 3);
    const gid = 'CCT-G' + gun.index + '-';
    const gk = 'G' + gun.index + '#';
    /* DC+ 支路画成一根连续导线，与 DC- 母线的跨越交给统一后处理，
     * 这样弧也带回路身份，G052 才能判出真正的断线（手工 jumpV 的弧无身份）。 */
    s += S.wire(xp, RAIL_DC_P, xp, G.fuse.y0, C.dc, 1.6, null, undefined, { c: gid + '01', k: gk + 'DC+in' });
    s += S.vfuse(xp, G.fuse.y0, C.dc, gun.fuseTag, 'left');
    s += S.wire(xp, G.fuse.y0 + 30, xp, G.contactorP.y0, C.dc, 1.6, null, undefined, { c: gid + '02', k: gk + 'DC+mid' });
    s += S.vcontact(xp, G.contactorP.y0, C.dc, gun.contactorTagP, 'left');
    s += S.wire(xp, G.contactorP.y0 + 30, xp, T['DC-'][1] - 6, C.dc, 1.6, null, undefined, { c: gid + '03', k: gk + 'DC+out' });
    /* DC- 支路：母线 → 负极接触器 → 枪 */
    s += S.jdot(xn, RAIL_DC_N, C.dc, 3);
    s += S.wire(xn, RAIL_DC_N, xn, G.contactorN.y0, C.dc, 1.6, null, undefined, { c: gid + '04', k: gk + 'DC-in' });
    s += S.vcontact(xn, G.contactorN.y0, C.dc, gun.contactorTagN, 'right');
    s += S.wire(xn, G.contactorN.y0 + 30, xn, T['DC+'][1] - 6, C.dc, 1.6, null, undefined, { c: gid + '05', k: gk + 'DC-out' });
    /* 枪本体：符号与端子全部按 connector-library 数据绘制，外部接线落到端子 */
    s += S.connector(cx, G.cy, G.connectorType, C.dc);
    s += S.txt(cx, 532, gun.tag, 8.5, C.dc, 'middle', 'bold');
    s += S.txt(cx, 544, gun.currentA + 'A/' + gun.powerKw + 'kW', 7, C.ink, 'middle');
    s += S.txt(T['DC-'][0] - 12, T['DC-'][1] + 2, 'DC-', 5.5, C.dc, 'end');
    s += S.txt(T['DC+'][0] + 12, T['DC+'][1] + 2, 'DC+', 5.5, C.dc, 'start');
    /* PE 接枪 PE 端子：有引出线走引出线，否则直连 */
    if (T.peLeadX) {
      s += S.wire(T.peLeadX, PE_Y, T.peLeadX, T.peLeadY, C.pe, 1.5, null, undefined, { c: gid + '06', k: gk + 'PE' });
      s += S.jdot(T.peLeadX, PE_Y, C.pe, 3);
      s += S.txt(T.peLeadX + 4, T.peLeadY + 4, 'PE', 6, C.pe, 'start', 'bold');
    } else {
      s += S.wire(cx, PE_Y, cx, T.PE[1] + 4, C.pe, 1.5, null, undefined, { c: gid + '06', k: gk + 'PE' });
      s += S.jdot(cx, PE_Y, C.pe, 3);
      s += S.txt(cx - 28, T.PE[1] + 2, 'PE', 6, C.pe, 'end', 'bold');
    }
    /* 信号触头：点对点连线（LIB-R12/LIB-R15），锚点由布局层给出 */
    G.signals.forEach((sig) => {
      s += S.txt(sig.x + 4, sig.labelY, sig.pin, 5.5, C.ctl, 'start');
      sigLines.push({ sx: sig.x, sy: sig.y, dest: sig.dest, gun: gun.index, pin: sig.pin });
    });
    /* 电子锁/锁反馈不画独立信号线（避免悬空线），经 A1 硬线接入，以文字注释表达 */
  });
  s += S.txt(1095, 556, '每枪：' + guns[0].lockText, 7, C.anno, 'middle');

  /* ============ 6. 保护接地干线 ============ */
  s += S.bus(P.rails.peX0, PE_Y, P.rails.peX1 - P.rails.peX0, C.pe, 4);
  s += S.txt(66, PE_Y - 8, 'PE 保护接地排（等电位联结，接地电阻待现场实测）', 7.5, C.pe, 'start', 'bold');
  s += S.pe(140, PE_Y);
  s += S.jdot(D.FV1.tapX, PE_Y, C.pe, 3);
  s += S.jdot(D.RI1.ports.pe.x, PE_Y, C.pe, 3);
  guns.forEach((gun, index) => { s += S.jdot(centers[index] + 22, PE_Y, C.pe, 3); });

  /* ============ 7. 储能系统 ============ */
  if (ess.enabled) {
    const E = P.ess;
    s += zrect('ess', '⑤ 储能系统（' + ess.couplingName + '）');
    for (let i = 0; i < E.shown; i += 1) {
      const row = E.rows[i], cy = row.cy;
      s += S.batteryCluster(row.cluster.box.x, row.cluster.box.y, row.cluster.box.w, row.cluster.box.h,
        C.ess, 'GB' + row.index + ' 电池簇', ess.clusterKwh + 'kWh · ' + ess.busVoltageV + 'V');
      s += S.wire(row.cluster.box.x + row.cluster.box.w, cy, row.fuse.x, cy, C.ess, 1.8);
      s += S.hfuse(row.fuse.x, cy, C.ess, 'FB' + row.index);
      s += S.wire(row.fuse.x + S.H, cy, row.contactor.x, cy, C.ess, 1.8);
      s += S.hcontact(row.contactor.x, cy, C.ess, 'KB' + row.index);
      s += S.wire(row.contactor.x + S.H, cy, E.busX, cy, C.ess, 1.8);
      /* 预充支路：接触器 + 限流电阻，与主接触器并联 */
      s += S.jdot(row.preContactor.x, cy, C.ess);
      s += S.wire(row.preContactor.x, cy, row.preContactor.x, row.preContactor.y, C.ess, 1.3);
      s += S.hcontact(row.preContactor.x, row.preContactor.y, C.ess, 'KP' + row.index);
      s += S.hres(row.preRes.x, row.preRes.y, C.ess, 'RS' + row.index);
      s += S.wire(row.preContactor.x + S.H, row.preContactor.y, row.preRes.x, row.preRes.y, C.ess, 1.3);
      s += S.wire(row.preJoinX, row.preRes.y, row.preJoinX, cy, C.ess, 1.3);
      s += S.jdot(row.preJoinX, cy, C.ess);
      s += S.txt(52, cy + 34, '预充 ' + ess.prechargeR + 'Ω/200W', 6.5, C.anno, 'start');
    }
    if (ess.clusterCount > E.shown) {
      s += S.txt(50, 852, '⋯ 共 ' + ess.clusterCount + ' 簇，其余簇同型并联（簇间环流与均衡策略待 BMS 厂家确认）', 7, C.anno, 'start');
    }
    /* 簇级通信与加热接口 */
    s += S.wire(E.commX, E.rows[0].cy, E.commX, E.commY, C.comm, 1.1);
    for (let i = 0; i < E.shown; i += 1) {
      s += S.wire(E.commX, E.rows[i].cy, E.rows[i].cluster.box.x, E.rows[i].cy, C.comm, 1.1);
    }
    s += S.wire(E.commX, E.commY, E.busX - 6, E.commY, C.comm, 1.1);
    s += S.jumpH(E.busX, E.commY, C.comm, 6);
    s += S.wire(E.busX + 6, E.commY, E.bms.box.x, E.commY, C.comm, 1.1);
    s += S.txt(52, 838, '电池簇含温感/加热接口，簇级 CAN 接 BAMS（低温加热策略待热工确认）', 6.5, C.anno, 'start');
    s += S.vbus(E.busX, E.busY0, E.busLen, C.ess, 4.5);
    s += S.txt(E.busX + 4, E.busY0 - 4, 'WB3 储能母线 ' + ess.voltageRangeText, 7, C.ess, 'start', 'bold');
    s += S.converter(E.converter.box.x, E.converter.box.y, E.converter.box.w, E.converter.box.h,
      C.ess, 'DC', ess.coupling === 'ac' ? 'AC' : 'DC', null, null);
    const ccx = E.converter.box.x + E.converter.box.w / 2;
    s += S.txt(ccx, E.converter.box.y - 6, (ess.coupling === 'ac' ? 'M3 储能 PCS' : 'M4 储能 DC/DC'), 8, C.ess, 'middle', 'bold');
    s += S.txt(ccx, E.converter.box.y + E.converter.box.h + 12, ess.converterText, 7, C.anno, 'middle');
    s += S.jdot(E.busX, E.gridProtect.y, C.ess, 3);
    s += S.wire(E.busX, E.gridProtect.y, E.converter.box.x, E.gridProtect.y, C.ess, 1.8);
    /* 变换器输出并网：必须经并网保护 */
    const gc = ess.coupling === 'ac' ? C.ac : C.dc;
    s += S.wire(E.converter.box.x + E.converter.box.w, E.gridProtect.y, E.gridProtect.x, E.gridProtect.y, gc, 1.8);
    s += S.hbreaker(E.gridProtect.x, E.gridProtect.y, gc, ess.coupling === 'ac' ? 'QF2' : 'FC1');
    s += S.wire(E.gridProtect.x + 32, E.gridProtect.y, ESS_RISER_X, E.gridProtect.y, gc, 1.8);
    if (ess.coupling === 'ac') {
      s += S.wire(ESS_RISER_X, E.gridProtect.y, ESS_RISER_X, PE_Y + 6, C.ac, 1.8);
      s += S.jumpV(ESS_RISER_X, PE_Y, C.ac, 6);
      s += S.wire(ESS_RISER_X, PE_Y - 6, ESS_RISER_X, 550, C.ac, 1.8);
      s += S.vcontact(ESS_RISER_X, 520, C.ac, 'KM2', 'left');
      s += S.wire(ESS_RISER_X, 520, ESS_RISER_X, 336, C.ac, 1.8);
      s += fanAC(532, 330, 'right', acPhases, [AUX_DROP_X]);
      for (let k = 0; k < acPhases; k += 1) s += S.wire(532, 330 + k * 4, 540, 340, C.ac, 1.2);
      s += S.wire(ESS_RISER_X, 340, ESS_RISER_X, 336, C.ac, 1.8);
      s += S.txt(470, 326, '经 QF2/KM2 并入交流母排 L1/L2/L3' + (std.neutral ? '/N' : ''), 7, C.ac, 'middle');
    } else {
      s += S.wire(ESS_RISER_X, E.gridProtect.y, ESS_RISER_X, PE_Y + 6, C.dc, 1.8);
      s += S.jumpV(ESS_RISER_X, PE_Y, C.dc, 6);
      s += S.wire(ESS_RISER_X, PE_Y - 6, ESS_RISER_X, 510, C.dc, 1.8);
      s += S.vcontact(ESS_RISER_X, 480, C.dc, 'KC1', 'left');
      s += S.wire(ESS_RISER_X, 480, ESS_RISER_X, RAIL_DC_N + 6, C.dc, 1.8);
      s += S.jumpV(ESS_RISER_X, RAIL_DC_N, C.dc, 6);
      s += S.wire(ESS_RISER_X, RAIL_DC_N - 6, ESS_RISER_X, RAIL_DC_P, C.dc, 1.8);
      s += S.jdot(ESS_RISER_X, RAIL_DC_P, C.dc, 3);
      s += S.txt(500, 244, '经 KC1/FC1 并入 DC+', 7, C.dc, 'middle');
    }
    s += S.block(E.bms.box.x, E.bms.box.y, E.bms.box.w, E.bms.box.h, C.comm, 'A5 BAMS', '电池管理主控', C.fill.comm);
    s += S.txt(50, 866, ess.chemistryName + ' · DOD ' + Math.round(ess.dod * 100) + '% · 可用 ' + ess.usableKwh + 'kWh · ' + ess.cRate + 'C', 7, C.anno, 'start');
  } else {
    s += zrect('ess', '⑤ 储能系统（本方案未配置）');
    s += S.txt(60, 700, '当前输入未选择储能配置：', 8, C.anno, 'start', 'bold');
    s += S.txt(60, 718, '· 全部充电功率由交流进线承担，进线容量与需量费用需按峰值核算；', 7.5, C.anno, 'start');
    s += S.txt(60, 734, '· 如后续增加储能，需重新校核进线容量、并网批复、消防与柜体布置；', 7.5, C.anno, 'start');
    s += S.txt(60, 750, '· 本图不预留储能支路的保护、预充与并离网切换回路。', 7.5, C.anno, 'start');
  }

  /* ============ 8. 二次控制与通信 ============ */
  const K = P.control;
  const blk = (o, color, title, sub, fill) => S.block(o.box.x, o.box.y, o.box.w, o.box.h, color, title, sub, fill);
  s += zrect('control');
  s += blk(K.A1, C.ctl, 'A1 充电控制单元 CCU', S.clip(std.protocol, 7.5, 142), C.fill.ctl);
  s += blk(K.A2, C.comm, std.physicalLayer === 'PLC' ? 'A2 SECC 通信控制器' : 'A2 计费通信网关',
    std.physicalLayer === 'PLC' ? 'HomePlug Green PHY' : 'CAN / RS485', C.fill.comm);
  s += blk(K.A3, C.comm, 'A3 路由器', '4G / 以太网', C.fill.comm);
  s += S.antenna(K.antenna.x, K.antenna.y, C.comm);
  s += S.txt(K.antenna.x, K.antenna.y + 16, '天线', 7, C.comm, 'middle');
  s += S.txt(1100, 686, '后台协议：' + aux.backendText, 7.5, C.anno, 'start');
  s += S.txt(1100, 700, '计量：' + S.clip(std.meter, 7.5, 196), 7.5, C.anno, 'start');
  s += S.txt(1100, 714, '接口：' + S.clip(std.connector, 7.5, 196), 7.5, C.anno, 'start');
  s += blk(K.A4, C.ctl, 'A4 显示屏', S.clip(aux.hmiText, 7, 100), C.fill.ctl);
  s += blk(K.reader, C.ctl, '读卡/扫码', '身份与计费', C.fill.ctl);
  s += S.estop(K.SB1.x, K.SB1.y, C.saf);
  s += S.txt(K.SB1.x, K.SB1.y + 32, 'SB1 急停', 7, C.saf, 'middle', 'bold');
  s += S.lamp(K.HL.x, K.HL.y, C.warn);
  s += S.txt(K.HL.x, K.HL.y + 32, 'HL 状态灯', 7, C.warn, 'middle');
  s += blk(K.SQ1, C.ctl, 'SQ1 门禁', '防拆/开门联锁', C.fill.ctl);
  s += blk(K.ENV, C.ctl, '环境监测', '温度/烟感/水浸', C.fill.ctl);
  s += S.txt(1182, 800, '所有联锁信号硬线接入 A1，', 7, C.anno, 'start');
  s += S.txt(1182, 812, '动作后直接切除输出使能。', 7, C.anno, 'start');
  /* 二次设备供电：自 WB4 辅助母排单独馈出并标注电压（LIB-R16） */
  P.aux.feeds.forEach((p) => {
    s += S.wire(p[0], P.rails.auxBusY, p[0], p[1], C.aux, 1.4);
    s += S.jdot(p[0], P.rails.auxBusY, C.aux, 2.5);
    s += S.txt(p[0] + 3, 906, p[2], 5.5, C.aux, 'start');
  });
  /* 环境监测供电：绕开图例区（LIB-R16） */
  s += S.wire(P.aux.envFeed.x, P.rails.auxBusY, P.aux.envFeed.x, P.aux.envFeed.viaY, C.aux, 1.4);
  s += S.jdot(P.aux.envFeed.x, P.rails.auxBusY, C.aux, 2.5);
  s += S.wire(P.aux.envFeed.x, P.aux.envFeed.viaY, P.aux.envFeed.toX, P.aux.envFeed.viaY, C.aux, 1.4);
  s += S.wire(P.aux.envFeed.toX, P.aux.envFeed.viaY, P.aux.envFeed.toX, P.aux.envFeed.toY, C.aux, 1.4);
  s += S.txt(P.aux.envFeed.x + 5, P.aux.envFeed.viaY - 4, '24V', 5.5, C.aux, 'start');
  /* 联锁信号：交由布线层做通道 + 区间着色，不再手工摆 i*6 阶梯。
   * 源=二次设备顶边中点，目标=A1 底边等距落点，走线带在两者之间的空白通道。 */
  const RT = window.EVSE_ROUTER;
  const obstacles = P.obstacles();
  const a1Bottom = P.channels.attachTop({ x: K.A1.box.x, y: K.A1.box.y + K.A1.box.h, w: K.A1.box.w, h: 0 }, K.interlocks.length);
  const ilNets = K.interlocks.map((src, i) => ({
    id: 'IL-' + src.id, from: { x: src.x, y: src.y }, to: a1Bottom[i], exempt: ['A1', src.id]
  }));
  const ilRes = RT.route(ilNets, P.channels.interlock, obstacles);
  ilRes.routes.forEach((r, i) => {
    if (!r) return;
    for (let k = 0; k < r.points.length - 1; k += 1) {
      s += S.wire(r.points[k][0], r.points[k][1], r.points[k + 1][0], r.points[k + 1][1], C.ctl, 1.2, null, undefined, { r: ilNets[i].id });
    }
    s += S.jdot(ilNets[i].to.x, ilNets[i].to.y, C.ctl, 2);
  });
  s += S.wire(730, 700, 750, 700, C.comm, 1.3);
  s += S.wire(890, 700, 910, 700, C.comm, 1.3);
  /* 点对点信号走线（不用共享总线，LIB-R15）：每根信号单独从枪端子接到 A1/A2 */
  const CT0 = std.connectorType || (std.id === 'gb' ? 'gbt-dc' : (std.id === 'eu' ? 'ccs2' : 'ccs1'));
  const capText = CT0 === 'gbt-dc' ? '点对点信号：CC1/CC2→A1 · S+/S-→A1 · 电子锁/锁反馈经 A1 硬线接入 · A1↔A2 SECC 互联'
    : (CT0 === 'chademo' ? '点对点信号：CP→A1 · CAN_H/CAN_L→A1 · A1↔A2 互联'
      : '点对点信号：CP→A1 · PP→A1 · 电子锁/锁反馈经 A1 硬线接入 · A1↔A2 SECC 互联（PLC/ISO 15118）');
  /* 枪信号：布线层通道 + 区间着色。互不重叠的走线会复用同一轨道，
   * 因此枪数少时自然收敛到很少几条轨道（旧实现固定 i*10/i*12 阶梯）。 */
  const a1Top = P.channels.attachTop(K.A1.box, sigLines.filter((l) => l.dest === 'A1').length || 1);
  const a2Top = P.channels.attachTop(K.A2.box, sigLines.filter((l) => l.dest === 'A2').length || 1);
  let i1 = 0, i2 = 0;
  const sigNets = sigLines.map((Lg, i) => ({
    id: 'SIG' + (i + 1),
    from: { x: Lg.sx, y: Lg.sy },
    to: Lg.dest === 'A2' ? a2Top[i2++] : a1Top[i1++],
    exempt: [Lg.dest],
    /* 网表回路：控制导引 → SIG-Gn-04（接 CCU）；通信 → SIG-Gn-05（接 SECC/网关） */
    circuit: 'SIG-G' + Lg.gun + (Lg.dest === 'A2' ? '-05' : '-04'),
    conductor: 'G' + Lg.gun + '#' + Lg.pin
  }));
  const sigRes = RT.route(sigNets, P.channels.signal, obstacles);
  sigRes.routes.forEach((r, i) => {
    if (!r) return;
    for (let k = 0; k < r.points.length - 1; k += 1) {
      s += S.wire(r.points[k][0], r.points[k][1], r.points[k + 1][0], r.points[k + 1][1], C.ctl, 1.2, null, undefined, { c: sigNets[i].circuit, k: sigNets[i].conductor, r: 'gun-signal' });
    }
    s += S.jdot(sigNets[i].to.x, sigNets[i].to.y, C.ctl, 2);
  });
  if (sigRes.unrouted.length || ilRes.unrouted.length) {
    /* 布不通必须显式暴露，绝不静默叠线 */
    s += S.txt(940, 652, '⚠ 未布通信号 ' + (sigRes.unrouted.length + ilRes.unrouted.length) + ' 根，通道容量不足', 6.5, C.saf, 'start', 'bold');
  }
  s += S.txt(940, 664, capText, 6.5, C.ctl, 'start');
  /* 模块与计量的通信总线 */
  s += S.wire(580, 690, ESS_RISER_X + 6, 690, C.comm, 1.2);
  s += S.jumpH(ESS_RISER_X, 690, C.comm, 6);
  s += S.wire(ESS_RISER_X - 6, 690, 470, 690, C.comm, 1.2);
  if (ess.enabled) {
    s += S.wire(486, 821, AUX_DROP_X - 6, 821, C.comm, 1.2);
    s += S.jumpH(AUX_DROP_X, 821, C.comm, 6);
    s += S.wire(AUX_DROP_X + 6, 821, 540, 821, C.comm, 1.2);
  }

  /* ============ 9. 辅助电源与配电 ============ */
  const X = P.aux;
  s += zrect('aux');
  s += fanAC(508, 310, 'right', acPhases);
  for (let k = 0; k < acPhases; k += 1) s += S.wire(508, 310 + k * 4, 516, 316, C.ac, 1.2);
  s += S.wire(516, 316, AUX_DROP_X, 316, C.aux, 1.5);
  /* 辅助电源馈线：与所有正交走线的交叉点逐一半圆跨越（强制规则 LIB-R10） */
  const auxHops = [690, PE_Y];
  if (ess.enabled) auxHops.push(P.ess.gridProtect.y);
  if (ess.enabled && ess.coupling === 'ac') auxHops.push(336);
  auxHops.sort((a, b) => a - b);
  let auxY = 316;
  for (const hy of auxHops) {
    s += S.wire(AUX_DROP_X, auxY, AUX_DROP_X, hy - 6, C.aux, 1.5);
    s += S.jumpV(AUX_DROP_X, hy, C.aux, 6);
    auxY = hy + 6;
  }
  s += S.wire(AUX_DROP_X, auxY, AUX_DROP_X, P.rails.auxFeedY, C.aux, 1.5);
  const t1cx = X.T1.box.x + X.T1.box.w / 2, t2cx = X.T2.box.x + X.T2.box.w / 2;
  s += S.wire(t1cx, P.rails.auxFeedY, AUX_DROP_X, P.rails.auxFeedY, C.aux, 1.5);
  s += S.block(X.T1.box.x, X.T1.box.y, X.T1.box.w, X.T1.box.h, C.aux, 'T1 开关电源', 'AC/DC ' + aux.psu24W + 'W 24V', C.fill.aux);
  s += S.block(X.T2.box.x, X.T2.box.y, X.T2.box.w, X.T2.box.h, C.aux, 'T2 开关电源', 'AC/DC ' + aux.psu12W + 'W 12V', C.fill.aux);
  s += S.jdot(t1cx, P.rails.auxFeedY, C.aux);
  s += S.jdot(t2cx, P.rails.auxFeedY, C.aux);
  s += S.wire(t2cx, P.rails.auxFeedY, t2cx, X.T2.box.y, C.aux, 1.4);
  s += S.wire(t1cx, X.T1.box.y + X.T1.box.h, t1cx, P.rails.auxBusY, C.aux, 1.6);
  s += S.wire(t2cx, X.T2.box.y + X.T2.box.h, t2cx, P.rails.auxBusY, C.aux, 1.6);
  s += S.bus(P.rails.auxBusX0, P.rails.auxBusY, P.rails.auxBusLen, C.aux, 4);
  s += S.txt(P.rails.auxBusX0 + 6, P.rails.auxBusY - 6, 'WB4 辅助直流母排 DC24V / DC12V', 7.5, C.aux, 'start', 'bold');
  X.taps.forEach((tap) => {
    s += S.jdot(tap.x, P.rails.auxBusY, C.aux);
    s += S.wire(tap.x, P.rails.auxBusY, tap.x, 976, C.aux, 1.3);
    s += `<rect x="${tap.x - 5}" y="976" width="10" height="8" fill="#fff" stroke="${C.aux}" stroke-width="1.1"/>`;
    s += S.txt(tap.x, 998, S.clip(tap.label, 6.8, 80), 6.8, C.aux, 'middle', 'bold');
    s += S.txt(tap.x, 1009, S.clip(tap.sub, 6.5, 80), 6.5, C.anno, 'middle');
  });
  s += S.fan(X.fanIcon.x, X.fanIcon.y, C.aux);
  s += S.txt(X.fanIcon.x, X.fanIcon.y + 22, S.clip(aux.thermalName, 6.8, 90), 6.8, C.aux, 'middle');
  s += S.txt(150, 998, '防护等级 ' + aux.ipRating, 7, C.anno, 'start');
  s += S.txt(150, 1010, '工作温度 ' + aux.ambientText, 7, C.anno, 'start');
  s += S.txt(150, 1022, S.clip(aux.thermalText, 7, 170), 7, C.anno, 'start');

  /* ============ 10. 图例 ============ */
  s += S.legend([
    { color: C.ac, thick: 2, label: '交流电源回路 ' + ac.lineVoltage + 'V（相线棕·IEC 60446）' },
    { color: C.n, thick: 1.6, label: '中性线 N（蓝·IEC 60446 专用）' },
    { color: C.dc, thick: 2, label: '充电直流回路（红·极性以 DC± 标注）' },
    { color: C.ess, thick: 2, label: '储能直流回路（橙·项目约定）' },
    { color: C.aux, thick: 1.8, label: '辅助电源 DC24V/12V（青·项目约定）' },
    { color: C.ctl, label: '控制/联锁/采样（灰实线·项目约定）' },
    { color: C.comm, label: '通信总线（紫实线·项目约定）' },
    { color: C.pe, thick: 2.4, label: '保护接地 PE（绿·IEC 60446 专用）' },
    { color: C.saf, thick: 1.6, label: '安全器件 急停/浪涌（安全红·ISO 3864）' }
  ], 1000, 872, 300);

  /* ============ 11. 设备明细表 ============ */
  s += S.schedule((R.schedule || []).slice(0, 40), 1326, 92, 330);

  /* ============ 12. 图注 ============ */
  s += S.txt(44, 1064, '枪端子（' + std.name + ' ' + std.connector + '）：' + std.dcPins.join(' / ') +
    '；控制导引 ' + std.controlPins.join('/') + '；通信 ' + guns[0].commSignalText, 7.5, C.anno, 'start');
  s += S.txt(44, 1076, '注：本图由确定性算法按输入参数选取设备档位并自动出图，为方案级原理图。' +
    '短路与保护配合、EMC、温升、接口一致性测试、消防与并网审批均未完成，不得作为生产图或合规证明。', 7.5, C.anno, 'start');
  s += S.txt(44, 1088, '颜色规范 EVSE-COLOR-SCHEME v1.0：识别颜色按 IEC 60446（PE 绿黄/N 蓝/相线棕），其余为项目约定；' +
    '设备块底色=所属回路浅色；详见 knowledge/color-scheme.md。', 7, C.anno, 'start');

  /* 交叉半圆统一后处理：全部几何算完后一次性求交并插入半圆。
   * 使用与绘图闸门相同的检测口径，结果与绘制顺序无关（第0步止血）。 */
  s = S.resolveCrossings(s);
  s += '</svg>';
  return s;
};



