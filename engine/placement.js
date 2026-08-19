/* ============================================================
 * EVSE 布局层 v1.0 —— 把图面坐标从代码变成数据
 * ------------------------------------------------------------
 * 职责：只决定"什么东西放在哪、端子在哪、哪里不能走线"，
 * 不产出任何 SVG，也不决定连接关系（那是 design-model 的事）。
 *
 * 为什么要有这一层：
 *   1.0.13 之前坐标是散在渲染器里的字面量（RAIL_AC=150、
 *   S.wire(600,120,620,120)…），导致改枪数/改标准就要人工重摆，
 *   而绘图闸门的几何自检是全局的——生产端做不到校验端的要求。
 *   把坐标数据化之后，布线层才可能拿到障碍物与端口做真正的路径规划。
 *
 * 输出契约：
 *   sheet     图幅
 *   rails     具名基准线（母线/干线/立管的 x 或 y）
 *   zones     分区矩形
 *   chains    串联链路（交流进线链、直流保护链）：设备按序列排布，x 自动推导
 *   devices   设备几何：box{x,y,w,h} + ports{name:{x,y,side}}
 *   guns      每把枪的列几何与端子锚点
 *   ess/control/aux  各分区子布局
 *   obstacles() 供布线层避让的矩形集合（LIB-R18 禁走线区）
 * ============================================================ */
window.EVSE_PLACEMENT = (function () {
  'use strict';

  const ID = 'EVSE-PLACEMENT';
  const VERSION = '1.0.0';

  const SHEET = { W: 1680, H: 1188 };

  /* 具名基准线：全图仅此一处定义 */
  const RAILS = {
    acY: 150,          // 交流主回路水平轴
    acBusX: 400,       // 交流分配母排（分相时以此为中心）
    acPhasePitch: 8,   // 相线间距
    dcP: 250,          // 充电直流母线 DC+
    dcN: 300,          // 充电直流母线 DC-
    dcX0: 536, dcX1: 1290,
    dcChainY: 120,     // 直流保护链水平轴
    peY: 624,          // 保护接地干线
    peX0: 60, peX1: 1290,
    essRiserX: 540,    // 储能并入立管
    auxDropX: 520,     // 辅助电源交流馈线立管
    sigBusY: 596,      // 枪回路控制/通信走线层基准
    auxBusY: 952, auxBusX0: 110, auxBusLen: 1090,
    auxFeedY: 886
  };

  const ZONES = [
    { id: 'ac-in',   x: 40,  y: 74,  w: 344, h: 148, title: '① 交流进线与保护' },
    { id: 'convert', x: 404, y: 74,  w: 200, h: 148, title: '② 功率变换' },
    { id: 'dc-prot', x: 612, y: 74,  w: 250, h: 148, title: '③ 直流保护与计量' },
    { id: 'guns',    x: 880, y: 314, w: 430, h: 300, title: '④ 充电枪回路（每枪独立快熔 + 正/负极直流接触器）' },
    { id: 'ess',     x: 40,  y: 650, w: 460, h: 232, title: '⑤ 储能系统' },
    { id: 'control', x: 560, y: 650, w: 750, h: 232, title: '⑥ 二次控制、计量与通信' },
    { id: 'aux',     x: 40,  y: 872, w: 940, h: 176, title: '⑦ 辅助电源、热管理与配电' }
  ];

  /* 横向串联元件的标准宽度（symbols.H）与间隙 */
  const H_UNIT = 44, GAP = 8;

  /* 交流进线链：从进线端子排出发，依次串联。x 由序列推导，不再手写。 */
  const AC_CHAIN = [
    { id: 'W01',  kind: 'terminals', w: 30, span: 0 },
    { id: 'QS1',  kind: 'hisolator', w: H_UNIT },
    { id: 'QF1',  kind: 'hbreaker',  w: H_UNIT },
    { id: 'FV1',  kind: 'spd-tap',   w: 0,  tapOnly: true, gapBefore: 10 },
    { id: 'RCM1', kind: 'hsensor',   w: H_UNIT, gapBefore: 8 },
    { id: 'PJ1',  kind: 'block',     w: 58, h: 32 },
    { id: 'KM1',  kind: 'hcontact',  w: H_UNIT }
  ];
  /* 直流保护链 */
  const DC_CHAIN = [
    { id: 'FU1', kind: 'hfuse',   w: H_UNIT },
    { id: 'TA1', kind: 'hsensor', w: H_UNIT, gapBefore: 10 },
    { id: 'PJ2', kind: 'block',   w: 62, h: 32, gapBefore: 10 }
  ];

  function layoutChain(spec, x0, y) {
    const out = {};
    let x = x0;
    spec.forEach((d) => {
      x += (d.gapBefore == null ? (d.w === 0 ? 10 : GAP) : d.gapBefore);
      const h = d.h || 0;
      out[d.id] = {
        kind: d.kind, x, y, w: d.w, h,
        box: d.h ? { x, y: y - d.h / 2, w: d.w, h: d.h } : null,
        ports: { in: { x, y, side: 'W' }, out: { x: x + d.w, y, side: 'E' } }
      };
      x += d.w;
    });
    return { devices: out, endX: x };
  }

  function compute(R) {
    const std = R.standard, dc = R.dc, guns = R.guns || [], ess = R.ess || {}, aux = R.aux || {};
    const L = window.LAYOUT;
    const CT = std.connectorType || (std.id === 'gb' ? 'gbt-dc' : (std.id === 'eu' ? 'ccs2' : 'ccs1'));
    const devices = {};

    /* ---------- 交流进线链 ---------- */
    const acChain = layoutChain(AC_CHAIN, 48 - GAP, RAILS.acY);
    Object.assign(devices, acChain.devices);
    devices.W01.x = 48; devices.W01.terminals = std.neutral ? ['L1', 'L2', 'L3', 'N', 'PE'] : ['L1', 'L2', 'L3', 'PE'];
    devices.W01.box = { x: 48, y: 118, w: 30, h: devices.W01.terminals.length * 13 };
    devices.W01.ports = { out: { x: 78, y: RAILS.acY, side: 'E' } };
    devices.FV1.tapX = 192; devices.FV1.y0 = 160; devices.FV1.box = { x: 183, y: 166, w: 18, h: 16 };
    devices.PJ1.box = { x: devices.PJ1.x, y: 134, w: 58, h: 32 };
    const acEndX = 376;

    /* ---------- 交流分相母排 ---------- */
    const phases = std.neutral ? 4 : 3;
    const phaseXs = Array.from({ length: phases }, (u, k) =>
      RAILS.acBusX + (k - (phases - 1) / 2) * RAILS.acPhasePitch);
    const acBus = { phases, xs: phaseXs, y0: 110, len: 234, labels: ['L1', 'L2', 'L3', 'N'] };

    /* ---------- 功率变换 ---------- */
    devices.M1 = {
      kind: 'moduleArray', box: { x: 430, y: 98, w: 170, h: 94 },
      rows: Math.min(4, dc.moduleCount),
      ports: { ac: { x: 430, y: 134, side: 'W' }, dcP: { x: 600, y: RAILS.dcChainY, side: 'E' }, dcN: { x: 600, y: 170, side: 'E' } }
    };

    /* ---------- 直流保护链 ---------- */
    const dcChain = layoutChain(DC_CHAIN, 600 + 12, RAILS.dcChainY);
    Object.assign(devices, dcChain.devices);
    devices.PJ2.box = { x: devices.PJ2.x, y: 104, w: 62, h: 32 };
    const dcRiserX = 812, dcNegRiserX = 630;

    /* ---------- 直流母线附属 ---------- */
    devices.RI1 = {
      kind: 'block', box: { x: 650, y: 340, w: 110, h: 44 },
      ports: { dcP: { x: 678, y: 340, side: 'N' }, dcN: { x: 730, y: 340, side: 'N' }, pe: { x: 705, y: 384, side: 'S' } }
    };
    devices.RS0 = { kind: 'vres', x: 850, y0: 256, box: { x: 843, y: 263, w: 14, h: 16 } };

    /* ---------- 充电枪列 ---------- */
    const centers = L.distribute(guns.length, guns.length > 1 ? 950 : 1090, guns.length > 1 ? 1250 : 1090);
    const gunLayout = guns.map((gun, i) => {
      const cx = centers[i];
      const T = window.SYM.gunTerminals(cx, 480, CT);
      const g = {
        index: gun.index, cx, xp: cx - 18, xn: cx + 18, cy: 480, connectorType: CT, terminals: T,
        fuse: { x: cx - 18, y0: 322, box: { x: cx - 24, y: 328, w: 12, h: 18 } },
        contactorP: { x: cx - 18, y0: 360, box: { x: cx - 24, y: 360, w: 12, h: 30 } },
        contactorN: { x: cx + 18, y0: 360, box: { x: cx + 12, y: 360, w: 12, h: 30 } },
        body: { x: cx - 30, y: 450, w: 60, h: 60 },
        signals: []
      };
      window.EVSE_CONNECTOR_LIB.get(CT).pins.filter((p) => p.kind === 'signal').forEach((p, k) => {
        const sx = p.lead ? cx + p.lead.x : cx + p.dx;
        const sy = p.lead ? 480 + p.lead.y : T[p.id][1] + 3;
        let dest;
        if (CT === 'gbt-dc') dest = (p.id === 'S+' || p.id === 'S-') ? 'A2' : 'A1';
        else if (CT === 'chademo') dest = p.id === 'CP' ? 'A1' : 'A2';
        else dest = p.id === 'CP' ? 'A2' : 'A1';
        g.signals.push({ pin: p.id, x: sx, y: sy, labelY: 516 + (k % 2) * 9, dest });
      });
      return g;
    });

    /* ---------- 储能 ---------- */
    const essLayout = ess.enabled ? (() => {
      const shown = Math.min(2, ess.clusterCount);
      const busX = 360;
      const rows = [];
      for (let i = 0; i < shown; i += 1) {
        const cy = 690 + i * 92;
        rows.push({
          index: i + 1, cy,
          cluster: { box: { x: 50, y: cy - 22, w: 140, h: 44 } },
          fuse: { x: 198, y: cy },
          contactor: { x: 250, y: cy },
          preContactor: { x: 246, y: cy + 28 },
          preRes: { x: 298, y: cy + 28 },
          preJoinX: 342
        });
      }
      return {
        shown, busX, busY0: 660, busLen: 180,
        rows,
        converter: { box: { x: 376, y: 700, w: 100, h: 54 } },
        gridProtect: { x: 484, y: 727 },
        bms: { box: { x: 376, y: 800, w: 110, h: 42 } },
        commX: 44, commY: 821
      };
    })() : null;

    /* ---------- 二次控制 ---------- */
    const control = {
      A1: { box: { x: 580, y: 676, w: 150, h: 64 } },
      A2: { box: { x: 750, y: 676, w: 140, h: 56 } },
      A3: { box: { x: 910, y: 676, w: 110, h: 50 } },
      antenna: { x: 1062, y: 700 },
      A4: { box: { x: 580, y: 782, w: 108, h: 46 } },
      reader: { box: { x: 700, y: 782, w: 100, h: 46 } },
      SB1: { x: 838, y: 800 },
      HL: { x: 898, y: 800 },
      SQ1: { box: { x: 940, y: 782, w: 100, h: 46 } },
      ENV: { box: { x: 1052, y: 782, w: 118, h: 46 } },
      /* 联锁信号源：设备顶边中点 → A1 底边（向上短接，不再绕最左走廊） */
      interlocks: [
        { id: 'A4', x: 634, y: 782 }, { id: 'reader', x: 750, y: 782 },
        { id: 'SB1', x: 838, y: 789 }, { id: 'HL', x: 898, y: 789 },
        { id: 'SQ1', x: 990, y: 782 }, { id: 'ENV', x: 1111, y: 782 }
      ],
      a1LeftX: 580
    };

    /* ---------- 辅助电源与配电 ---------- */
    const auxLayout = {
      T1: { box: { x: 80, y: 896, w: 100, h: 38 } },
      T2: { box: { x: 200, y: 896, w: 100, h: 38 } },
      feeds: [[634, 828, '24V'], [750, 828, '12V'], [838, 828, '24V'], [898, 828, '24V'],
        [990, 828, '24V'], [694, 740, '24V'], [820, 732, '24V'], [930, 726, '24V']],
      envFeed: { x: 995, viaY: 846, toX: 1111, toY: 828 },
      taps: [
        ['M2 热管理', aux.thermalMode === 'liquid' ? '控制/联锁' : aux.fanCount + ' 台风机'],
        ['EH 加热/除湿', aux.heaterW ? aux.heaterW + 'W' : '按需选配'],
        ['KM/K 线圈', '接触器驱动'],
        ['YV 电子锁', guns.length + ' 套'],
        ['A1 控制单元', 'DC24V'],
        ['A2/A3 通信', 'DC12V'],
        ['A4 显示/读卡', 'DC12V'],
        [ess.enabled ? 'A5 BMS' : '备用回路', ess.enabled ? 'DC24V' : '预留']
      ].map((t, i) => ({ x: 340 + i * 82, label: t[0], sub: t[1] })),
      fanIcon: { x: 70, y: 1000 }
    };

    /* ---------- 走线通道：布线层可用的横向轨道与落点 ----------
     * 通道是"分区之间的空白带"，轨道按 6px 间距（LIB-R19 最小间距）离散。
     * 布线层用区间图着色在轨道上分配走线，不重叠的走线可复用同一轨道，
     * 因此枪数少时自然收敛到很少的轨道，不会出现固定 i*10 的阶梯。 */
    const CH_PITCH = 6;
    function tracks(y0, y1, pitch) {
      const out = [];
      for (let y = y0; y <= y1; y += (pitch || CH_PITCH)) out.push(y);
      return out;
    }
    /* 落点：在目标设备顶边等距分布，避免全部挤在一个点 */
    function attachTop(box, n) {
      const out = [];
      for (let i = 0; i < n; i += 1) out.push({ x: Math.round(box.x + box.w * (i + 1) / (n + 1)), y: box.y });
      return out;
    }
    const channels = {
      /* 枪信号：优先用控制区上方空白带（PE 干线以下、A1/A2 顶边以上），
       * 不够时向上溢出到枪区下方空白带（枪标注以下、PE 干线以上）。 */
      signal: { primary: tracks(630, 670), overflow: tracks(560, 614), pitch: CH_PITCH },
      /* 联锁：A1 底边(740) 与二次设备顶边(782) 之间的空白带——比旧的
       * "绕到最左侧走廊再折回"短得多，且不穿越任何设备。 */
      interlock: { primary: tracks(746, 778), overflow: tracks(844, 868), pitch: CH_PITCH },
      attachTop
    };

    /* ---------- 障碍物：布线层的禁走线区（LIB-R18） ---------- */
    function obstacles() {
      const boxes = [];
      const push = (b, id) => { if (b && b.w > 0 && b.h > 0) boxes.push({ id, x: b.x, y: b.y, w: b.w, h: b.h }); };
      Object.keys(devices).forEach((k) => push(devices[k].box, k));
      gunLayout.forEach((g) => {
        push(g.body, 'XS' + g.index);
        push(g.fuse.box, 'F' + g.index);
        push(g.contactorP.box, 'K' + g.index + 'P');
        push(g.contactorN.box, 'K' + g.index + 'N');
      });
      if (essLayout) {
        essLayout.rows.forEach((r) => push(r.cluster.box, 'GB' + r.index));
        push(essLayout.converter.box, 'ESS-CONV');
        push(essLayout.bms.box, 'A5');
      }
      ['A1', 'A2', 'A3', 'A4', 'reader', 'SQ1', 'ENV'].forEach((k) => push(control[k].box, k));
      push(auxLayout.T1.box, 'T1'); push(auxLayout.T2.box, 'T2');
      return boxes;
    }

    return {
      id: ID, version: VERSION,
      sheet: SHEET, rails: RAILS, zones: ZONES,
      acChain: AC_CHAIN.map((d) => d.id), acEndX, acBus, phases, phaseXs,
      dcChain: DC_CHAIN.map((d) => d.id), dcRiserX, dcNegRiserX,
      devices, guns: gunLayout, ess: essLayout, control, aux: auxLayout, channels,
      connectorType: CT, obstacles
    };
  }

  return { ID, VERSION, SHEET, RAILS, ZONES, compute };
})();
