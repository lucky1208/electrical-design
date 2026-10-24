/* ============================================================
 * MW-ESS CORE v1.0 —— 兆瓦级储能系统 原理图生成器（器件 + 引脚级网表）
 * ------------------------------------------------------------
 * 依据《兆瓦极充产品系统方案_完整版.docx》
 *   2.1 系统框图 + 3.1/3.2/3.3 电气原理 生成。
 * 与 evse-core.js 并存：params.family === 'mwess' 时启用本模块。
 *
 * 系统构成（默认档位）
 *   充电主机：CMS + 2×PMU + 2×DCU + 6×AC/DC(80kW)
 *             + 24×双向DC/DC(80kW) + 功率投切接触器矩阵 + 液冷 + 保护
 *   充电终端：2×CCU + 2×液冷枪(1500V/1500A)
 *   储能柜×2：151.5kWh 电池簇 + BCU/BMU + 预充 + 分流器 + 液冷 + 消防
 *
 * 关键拓扑（3.1）
 *   6×AC/DC 直流侧并成 3 组(160kW) → DCU "3进2出" 投切 → 枪 / 直流母线
 *   两路直流母线，各接 1 个储能柜 + 12×DC/DC 母线侧
 *   24×DC/DC 车辆侧并成 12 组(160kW) → DCU "12进1出" 投切 → 枪（可逆放）
 * ============================================================ */
window.EVSE_MWESS = (function () {
  'use strict';

  const CORE = () => window.EVSE_CORE;
  const VERSION = '1.0.0';

  /* ---------- 默认参数 ---------- */
  function defaults() {
    return {
      family: 'mwess',
      name: '兆瓦极充 · 储能系统',
      acdcKw: 80,          // 单台 AC/DC
      acdcCount: 6,        // 2~6
      dcdcKw: 80,          // 单台双向 DC/DC
      dcdcCount: 24,
      acIn: 2,             // 路三相交流进线
      gunCount: 2,
      gunV: 1500, gunA: 1500, gunRated: 800,
      busV: 1500,
      essCab: 2,           // 储能柜数
      essKwh: 151.5,       // 每柜容量
      essPack: 4,          // 每柜电池插箱数（1P100S）
      pmuCount: 2, dcuCount: 2, ccuCount: 2
    };
  }

  /* This drawing implements the documented two-gun / two-cabinet topology.
   * Only AC/DC population and module ratings are variable; the bus split,
   * DC/DC count, cabinet strings and controller counts are architectural. */
  function normalize(par) {
    const p = Object.assign(defaults(), par || {});
    const num = function (v, fallback) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fallback; };
    p.acdcKw = Math.max(20, Math.min(160, Math.round(num(p.acdcKw, 80))));
    p.dcdcKw = Math.max(20, Math.min(160, Math.round(num(p.dcdcKw, 80))));
    const acdcChoices = [2, 4, 6];
    p.acdcCount = acdcChoices.reduce(function (best, n) {
      return Math.abs(n - num(p.acdcCount, 6)) < Math.abs(best - num(p.acdcCount, 6)) ? n : best;
    }, acdcChoices[0]);
    p.dcdcCount = 24;
    p.acIn = 2;
    p.busV = 1500;
    p.gunCount = 2;
    p.gunV = 1500;
    p.gunA = 1500;
    p.gunRated = 800;
    p.essCab = 2;
    p.essKwh = 151.5;
    p.essPack = 4;
    p.pmuCount = 2;
    p.dcuCount = 2;
    p.ccuCount = 2;
    p.family = 'mwess';
    return p;
  }

  /* ============================================================
   * 符号库 —— 全部基于 EVSE_CORE.makeBox / makeSwitch / makeFuse / makeRes
   * ============================================================ */
  const S = {};
  const P = (n, name, x, y, d, k, t, len) => ({ n, name, x, y, d, k, t: t || 'pas', len: len == null ? 8 : len });

  /* ---- 80kW 液冷 AC/DC 模块 ---- */
  S.acdcMod = function (tag, kw) {
    const C = CORE();
    return C.makeBox({
      w: 132, minH: 104, glyph: 'acdc', title: 'AC/DC 模块', sub: kw + 'kW 液冷',
      top: ['L1', 'L2', 'L3', 'N'].map(n => ({ n, name: n, k: 'AC', t: 'in' })),
      bottom: [
        { n: 'DC+', name: 'DC+', k: 'DC', t: 'out' },
        { n: 'DC-', name: 'DC-', k: 'DC', t: 'out' },
        { n: 'PE', name: 'PE', k: 'PE', t: 'in' }
      ],
      right: [
        { n: 'CANH', name: 'CANH', k: 'COMM', t: 'bi' },
        { n: 'CANL', name: 'CANL', k: 'COMM', t: 'bi' }
      ],
      tpitch: 26, bpitch: 44
    });
  };

  /* ---- 80kW 液冷双向 DC/DC 模块 ----
   * 母线侧 B+/B-（接直流母线 / 储能柜）
   * 车辆侧 V+/V-（经 DCU 投切到充电枪） */
  S.dcdcMod = function (tag, kw) {
    const C = CORE();
    return C.makeBox({
      w: 132, minH: 104, glyph: 'dcdc', title: '双向 DC/DC', sub: kw + 'kW 液冷',
      left: [
        { n: 'B+', name: 'B+', k: 'ESS', t: 'bi' },
        { n: 'B-', name: 'B-', k: 'ESS', t: 'bi' }
      ],
      right: [
        { n: 'V+', name: 'V+', k: 'DC', t: 'bi' },
        { n: 'V-', name: 'V-', k: 'DC', t: 'bi' }
      ],
      bottom: [
        { n: 'CANH', name: 'CANH', k: 'COMM', t: 'bi' },
        { n: 'CANL', name: 'CANL', k: 'COMM', t: 'bi' },
        { n: 'PE', name: 'PE', k: 'PE', t: 'in' }
      ],
      bpitch: 40, pitch: 22
    });
  };

  /* ---- 中央管理系统 CMS ---- */
  S.cms = function () {
    const C = CORE();
    return C.makeBox({
      w: 150, minH: 118, title: 'CMS 中央管理系统', sub: '能源控制核心',
      left: [
        { n: 'CAN_H', name: 'CAN-H', k: 'COMM', t: 'bi' },
        { n: 'CAN_L', name: 'CAN-L', k: 'COMM', t: 'bi' }
      ],
      right: [
        { n: 'LAN_A', name: 'LAN_A', k: 'COMM', t: 'bi' },
        { n: 'LAN_B', name: 'LAN_B', k: 'COMM', t: 'bi' }
      ],
      bottom: [
        { n: '4G', name: '4G', k: 'COMM', t: 'out' },
        { n: 'PE', name: 'PE', k: 'PE', t: 'in' }
      ],
      pitch: 22, bpitch: 44
    });
  };

  /* ---- 能量管理单元 PMU ---- */
  S.pmu = function (idx) {
    const C = CORE();
    return C.makeBox({
      w: 176, minH: 260, title: 'PMU' + idx + ' 能量管理单元', sub: '功率策略 / 调度',
      left: [
        { n: 'CAN_CMS_H', name: 'CMS-H', k: 'COMM', t: 'bi' },
        { n: 'CAN_CMS_L', name: 'CMS-L', k: 'COMM', t: 'bi' },
        { n: 'CAN_DCU_H', name: 'DCU-H', k: 'COMM', t: 'bi' },
        { n: 'CAN_DCU_L', name: 'DCU-L', k: 'COMM', t: 'bi' },
        { n: 'CAN_MOD_H', name: 'MOD-H', k: 'COMM', t: 'bi' },
        { n: 'CAN_MOD_L', name: 'MOD-L', k: 'COMM', t: 'bi' }
      ],
      right: [
        { n: 'CAN_CCU_H', name: 'CCU-H', k: 'COMM', t: 'bi' },
        { n: 'CAN_CCU_L', name: 'CCU-L', k: 'COMM', t: 'bi' },
        { n: 'DI_SAFE', name: 'DI_SAFE', k: 'SAF', t: 'in' },
        { n: 'AI_PE', name: 'AI_PE', k: 'CTL', t: 'in' },
        { n: 'AI_ESS1+', name: 'ESS1-I+', k: 'CTL', t: 'in' },
        { n: 'AI_ESS1-', name: 'ESS1-I-', k: 'CTL', t: 'in' },
        { n: 'AI_ESS2+', name: 'ESS2-I+', k: 'CTL', t: 'in' },
        { n: 'AI_ESS2-', name: 'ESS2-I-', k: 'CTL', t: 'in' },
        { n: 'DO_PUMP', name: 'DO_PUMP', k: 'CTL', t: 'out' }
      ],
      bottom: [
        { n: 'V+', name: 'V+', k: 'AUX', t: 'in' },
        { n: 'V-', name: 'V-', k: 'AUX', t: 'in' },
        { n: 'PE', name: 'PE', k: 'PE', t: 'in' }
      ],
      pitch: 22, bpitch: 40
    });
  };

  /* ---- 开关控制单元 DCU ---- */
  S.dcu = function (idx) {
    const C = CORE();
    const outs = [];
    for (let i = 1; i <= 3; i++) outs.push({ n: 'DO_KA' + i, name: 'KA' + i, k: 'CTL', t: 'out' });
    for (let i = 1; i <= 3; i++) outs.push({ n: 'DO_KB' + i, name: 'KB' + i, k: 'CTL', t: 'out' });
    for (let i = 1; i <= 12; i++) outs.push({ n: 'DO_KC' + i, name: 'KC' + i, k: 'CTL', t: 'out' });
    return C.makeBox({
      w: 176, minH: 344, title: 'DCU' + idx + ' 开关控制单元', sub: '接触器独立输出 / 状态采集',
      left: [
        { n: 'CAN_H', name: 'CAN-H', k: 'COMM', t: 'bi' },
        { n: 'CAN_L', name: 'CAN-L', k: 'COMM', t: 'bi' },
        { n: 'DI_FB', name: 'DI_FB', k: 'CTL', t: 'in' },
        { n: 'DI_KF', name: 'DI_KF', k: 'CTL', t: 'in' },
        { n: 'EN_SAFE', name: 'EN_SAFE', k: 'SAF', t: 'in' }
      ],
      right: outs,
      bottom: [
        { n: 'V+', name: 'V+', k: 'AUX', t: 'in' },
        { n: 'V-', name: 'V-', k: 'AUX', t: 'in' },
        { n: 'PE', name: 'PE', k: 'PE', t: 'in' }
      ],
      pitch: 15, bpitch: 40
    });
  };

  /* ---- 充电控制器 CCU ---- */
  S.ccu = function (idx) {
    const C = CORE();
    return C.makeBox({
      w: 164, minH: 220, title: 'CCU' + idx + ' 充电控制器', sub: '车 BMS 通讯 / 充电控制',
      left: [
        { n: 'CAN_V_H', name: '车CAN-H', k: 'COMM', t: 'bi' },
        { n: 'CAN_V_L', name: '车CAN-L', k: 'COMM', t: 'bi' },
        { n: 'CAN_P_H', name: '系统CAN-H', k: 'COMM', t: 'bi' },
        { n: 'CAN_P_L', name: '系统CAN-L', k: 'COMM', t: 'bi' },
        { n: 'DI_LOCK', name: 'DI_LOCK', k: 'CTL', t: 'in' },
        { n: 'EN_SAFE', name: 'EN_SAFE', k: 'SAF', t: 'in' }
      ],
      right: [
        { n: 'DO_LOCK', name: 'DO_LOCK', k: 'CTL', t: 'out' },
        { n: 'DO_CC', name: 'DO_CC', k: 'CTL', t: 'out' },
        { n: 'DO_KGP', name: 'DO_KGP', k: 'CTL', t: 'out' },
        { n: 'DO_KGN', name: 'DO_KGN', k: 'CTL', t: 'out' },
        { n: 'AI_I+', name: 'AI_I+', k: 'CTL', t: 'in' },
        { n: 'AI_I-', name: 'AI_I-', k: 'CTL', t: 'in' },
        { n: 'AI_TEMP', name: 'AI_TEMP', k: 'CTL', t: 'in' }
      ],
      bottom: [
        { n: 'V+', name: 'V+', k: 'AUX', t: 'in' },
        { n: 'V-', name: 'V-', k: 'AUX', t: 'in' },
        { n: 'PE', name: 'PE', k: 'PE', t: 'in' }
      ],
      pitch: 22, bpitch: 40
    });
  };

  /* ---- 储能 BMS 主控 BCU ---- */
  S.bcu = function (idx) {
    const C = CORE();
    return C.makeBox({
      w: 150, minH: 118, title: 'BCU' + idx + ' 储能BMS主控', sub: '1P100S ×' ,
      left: [
        { n: 'CAN_BMU_H', name: 'BMU-H', k: 'COMM', t: 'bi' },
        { n: 'CAN_BMU_L', name: 'BMU-L', k: 'COMM', t: 'bi' },
        { n: 'V_BAT', name: 'V_BAT', k: 'CTL', t: 'in' }
      ],
      right: [
        { n: 'DO_KM', name: 'DO_KM', k: 'CTL', t: 'out' },
        { n: 'DO_PRE', name: 'DO_PRE', k: 'CTL', t: 'out' },
        { n: 'AI_I+', name: 'AI_I+', k: 'CTL', t: 'in' },
        { n: 'AI_I-', name: 'AI_I-', k: 'CTL', t: 'in' },
        { n: 'DI_FIRE', name: 'DI_FIRE', k: 'CTL', t: 'in' },
        { n: 'EN_SAFE', name: 'EN_SAFE', k: 'SAF', t: 'in' }
      ],
      bottom: [
        { n: 'LAN', name: 'LAN', k: 'COMM', t: 'bi' },
        { n: 'RS485_A', name: '485A', k: 'COMM', t: 'bi' },
        { n: 'RS485_B', name: '485B', k: 'COMM', t: 'bi' },
        { n: 'V+', name: 'V+', k: 'AUX', t: 'in' },
        { n: 'V-', name: 'V-', k: 'AUX', t: 'in' },
        { n: 'PE', name: 'PE', k: 'PE', t: 'in' }
      ],
      pitch: 22, bpitch: 32
    });
  };

  /* ---- 电池管理单元 BMU ---- */
  S.bmu = function (idx) {
    const C = CORE();
    return C.makeBox({
      w: 116, minH: 76, title: 'BMU' + idx, sub: '1P100S 采集',
      left: [{ n: 'B+', name: 'B+', k: 'ESS', t: 'in' }, { n: 'B-', name: 'B-', k: 'ESS', t: 'in' }],
      right: [{ n: 'CAN_H', name: 'CAN-H', k: 'COMM', t: 'bi' }, { n: 'CAN_L', name: 'CAN-L', k: 'COMM', t: 'bi' }],
      pitch: 20
    });
  };

  /* ---- 电池插箱 1P100S ---- */
  S.pack = function (idx) {
    const C = CORE();
    return C.makeBox({
      w: 126, minH: 92, title: '电池插箱 ' + idx, sub: '1P100S · 118Ah LFP',
      left: [{ n: 'P', name: 'P', k: 'ESS', t: 'out' }, { n: 'N', name: 'N', k: 'ESS', t: 'out' }],
      right: [{ n: 'T1', name: 'T1', k: 'CTL', t: 'out' }, { n: 'T2', name: 'T2', k: 'CTL', t: 'out' }],
      pitch: 20
    });
  };

  /* ---- 储能电池簇（整簇等效） ---- */
  S.cluster = function (idx, kwh) {
    const C = CORE();
    return C.makeBox({
      w: 140, minH: 100, glyph: 'dcdc', title: '电池簇 ' + idx, sub: kwh + 'kWh LFP',
      left: [{ n: 'B+', name: 'B+', k: 'ESS', t: 'out' }, { n: 'B-', name: 'B-', k: 'ESS', t: 'out' }],
      bottom: [{ n: 'CAN', name: 'CAN', k: 'COMM', t: 'bi' }],
      bpitch: 40
    });
  };

  /* ---- 液冷充电枪 ---- */
  S.gun = function (idx, v, a) {
    const C = CORE();
    return C.makeBox({
      w: 120, minH: 104, title: '液冷枪 ' + idx, sub: v + 'V / ' + a + 'A',
      left: [{ n: 'DC+', name: 'DC+', k: 'DC', t: 'in' }, { n: 'DC-', name: 'DC-', k: 'DC', t: 'in' }],
      right: [{ n: 'CC', name: 'CC', k: 'CTL', t: 'bi' }, { n: 'S+', name: 'S+', k: 'COMM', t: 'bi' }, { n: 'S-', name: 'S-', k: 'COMM', t: 'bi' }, { n: 'LK', name: 'LK', k: 'CTL', t: 'out' }],
      bottom: [{ n: 'TEMP', name: 'TEMP', k: 'CTL', t: 'out' }, { n: 'PE', name: 'PE', k: 'PE', t: 'in' }],
      bpitch: 40
    });
  };

  /* ---- 电子锁执行器：命令、锁止反馈与连接器锁状态分开建模 ---- */
  S.lockActuator = function (idx) {
    const C = CORE();
    return C.makeBox({
      w: 126, minH: 88, title: '枪' + idx + ' 电子锁', sub: '命令 / 到位反馈',
      left: [{ n: 'V+', name: 'V+', k: 'AUX', t: 'in' }, { n: 'V-', name: 'V-', k: 'AUX', t: 'in' }, { n: 'CMD', name: 'CMD', k: 'CTL', t: 'in' }],
      right: [{ n: 'SENSE', name: 'SENSE', k: 'CTL', t: 'in' }, { n: 'FB', name: 'FB', k: 'CTL', t: 'out' }],
      pitch: 20
    });
  };

  /* ---- 液冷机组 / 除湿机 / 消防 ---- */
  S.cooling = function (idx) {
    const C = CORE();
    return C.makeBox({
      w: 124, minH: 80, title: '液冷机组 ' + idx, sub: 'RS485 联控',
      left: [{ n: 'L', name: 'L', k: 'AC', t: 'in' }, { n: 'N', name: 'N', k: 'AC', t: 'in' }, { n: 'PE', name: 'PE', k: 'PE', t: 'in' }],
      right: [{ n: 'RS485_A', name: '485A', k: 'COMM', t: 'bi' }, { n: 'RS485_B', name: '485B', k: 'COMM', t: 'bi' }, { n: 'PUMP', name: 'PUMP', k: 'CTL', t: 'in' }],
      pitch: 20
    });
  };
  S.dehum = function (idx) {
    const C = CORE();
    return C.makeBox({
      w: 124, minH: 76, title: '除湿机 ' + idx, sub: 'AC220V/DC24V',
      left: [{ n: 'L', name: 'L', k: 'AC', t: 'in' }, { n: 'N', name: 'N', k: 'AC', t: 'in' }],
      right: [{ n: 'RS485_A', name: '485A', k: 'COMM', t: 'bi' }, { n: 'RS485_B', name: '485B', k: 'COMM', t: 'bi' }],
      pitch: 20
    });
  };
  S.fire = function (idx) {
    const C = CORE();
    return C.makeBox({
      w: 124, minH: 72, title: '消防系统 ' + idx, sub: 'DC24V + 干接点',
      left: [{ n: 'V+', name: 'V+', k: 'AUX', t: 'in' }, { n: 'V-', name: 'V-', k: 'AUX', t: 'in' }],
      right: [{ n: 'ALM', name: 'ALM', k: 'CTL', t: 'out' }],
      pitch: 20
    });
  };

  /* ---- 多通道 RS485 / Modbus 网关，串口与以太网端口分开 ---- */
  S.rtuGateway = function () {
    const C = CORE();
    const left = [];
    for (let i = 1; i <= 5; i++) {
      left.push({ n: 'CH' + i + '_A', name: 'CH' + i + '-A', k: 'COMM', t: 'bi' });
      left.push({ n: 'CH' + i + '_B', name: 'CH' + i + '-B', k: 'COMM', t: 'bi' });
    }
    return C.makeBox({
      w: 170, minH: 248, title: 'GW1 串口网关', sub: '5×RS485 / Modbus TCP',
      left: left,
      right: [{ n: 'LAN1', name: 'LAN1', k: 'COMM', t: 'bi' }],
      pitch: 14
    });
  };

  /* ---- 直流计量表 / 霍尔 / 绝缘监测 ---- */
  S.meterDC = function () {
    const C = CORE();
    const sym = C.makeBox({
      w: 116, minH: 92, title: '直流电能表', sub: '串联电流 / 并联电压',
      left: [{ n: 'I+', name: 'I+进', k: 'DC', t: 'in' }, { n: 'V+', name: 'V+采样', k: 'DC', t: 'in' }, { n: '485A', name: '485A', k: 'COMM', t: 'bi' }],
      right: [{ n: 'I-', name: 'I+出', k: 'DC', t: 'out' }, { n: 'V-', name: 'V-采样', k: 'DC', t: 'in' }, { n: '485B', name: '485B', k: 'COMM', t: 'bi' }],
      pitch: 20
    });
    sym.conductPairs = [['I+', 'I-']];
    return sym;
  };
  S.busMeter = function () {
    const C = CORE();
    return C.makeBox({
      w: 126, minH: 104, title: '直流母线监测表', sub: '双母线电压 / RS485',
      left: [
        { n: 'BUS1+', name: 'BUS1+', k: 'DC', t: 'in' },
        { n: 'BUS1-', name: 'BUS1-', k: 'DC', t: 'in' },
        { n: 'BUS2+', name: 'BUS2+', k: 'DC', t: 'in' },
        { n: 'BUS2-', name: 'BUS2-', k: 'DC', t: 'in' }
      ],
      right: [{ n: '485A', name: '485A', k: 'COMM', t: 'bi' }, { n: '485B', name: '485B', k: 'COMM', t: 'bi' }],
      pitch: 18
    });
  };
  S.hall = function () {
    const C = CORE();
    const sym = C.makeBox({
      w: 106, minH: 82, title: '霍尔传感器', sub: '±1500A 开环',
      left: [{ n: 'P1', name: 'P进', k: 'DC', t: 'in' }],
      right: [{ n: 'P2', name: 'P出', k: 'DC', t: 'out' }, { n: 'I+', name: 'I+', k: 'CTL', t: 'out' }, { n: 'I-', name: 'I-', k: 'CTL', t: 'out' }],
      pitch: 20
    });
    sym.conductPairs = [['P1', 'P2']];
    return sym;
  };
  S.imd = function () {
    const C = CORE();
    return C.makeBox({
      w: 126, minH: 104, title: '绝缘监测 IMD', sub: '1500V 系统',
      left: [{ n: 'DC+', name: 'DC+', k: 'DC', t: 'in' }, { n: 'DC-', name: 'DC-', k: 'DC', t: 'in' }, { n: 'PE', name: 'PE', k: 'PE', t: 'in' }],
      right: [
        { n: 'ALM', name: 'ALM', k: 'CTL', t: 'out' },
        { n: '485A', name: '485A', k: 'COMM', t: 'bi' },
        { n: '485B', name: '485B', k: 'COMM', t: 'bi' }
      ],
      bottom: [{ n: 'V+', name: 'V+', k: 'AUX', t: 'in' }, { n: 'V-', name: 'V-', k: 'AUX', t: 'in' }],
      pitch: 20, bpitch: 34
    });
  };

  /* ---- 分流器（储能负极计量） ---- */
  S.shunt = function () {
    const C = CORE();
    const sym = C.makeBox({
      w: 76, minH: 44, title: '分流器', sub: 'BMS 采样',
      left: [{ n: '1', name: '1', k: 'ESS', t: 'in' }],
      right: [{ n: '2', name: '2', k: 'ESS', t: 'out' }, { n: 'I+', name: 'I+', k: 'CTL', t: 'out' }, { n: 'I-', name: 'I-', k: 'CTL', t: 'out' }],
      pitch: 18
    });
    sym.conductPairs = [['1', '2']];
    return sym;
  };

  /* ---- 三相交流进线（含防雷/断路） ---- */
  S.acIn = function (idx) {
    const C = CORE();
    return C.S.termStrip(['L1', 'L2', 'L3', 'N', 'PE'], 'AC');
  };
  /* ============================================================
   * build(par) —— 生成器件 + 引脚级网表（含坐标）
   * 页1 交流进线 / AC-DC 功率级 + AC-DC 投切矩阵
   * 页2 DC-DC 模块阵列 + 直流母线
   * 页3 直流出线 / 枪回路
   * 页4 储能柜 1   页5 储能柜 2   页6 二次回路   页7 功率投切矩阵
   * ============================================================ */
  function build(par) {
    const p = normalize(par);
    const C = CORE();
    const D = [], N = [];
    const dev = function (o) { if (o && o.sym) C.normSym(o.sym); D.push(o); return o.id; };
    let seq = 0;
    const net = function (a, b, cls, o) {
      seq++;
      const id = 'N' + String(seq).padStart(3, '0');
      N.push(Object.assign({ id: id, name: (o && o.name) || (a.d + ':' + a.p + '→' + b.d + ':' + b.p), cls: cls, a: a, b: b }, o || {}));
      return id;
    };
    const pin = (d, q) => ({ d: d, p: q });

    const SH = { AC: 1, DC: 2, GUN: 3, ESS1: 4, ESS2: 5, CTL: 6, MATRIX: 7 };
    const acdc = Math.max(2, Math.min(6, p.acdcCount));
    const dcdc = p.dcdcCount;
    const grpA = acdc / 2;           // AC/DC 组数（每组2台）
    const grpD = dcdc / 2;           // DC/DC 组数（每组2台）
    const kA = p.acdcKw * 2, kD = p.dcdcKw * 2;

    /* ---------- 页1：交流进线 + AC/DC 模块 ---------- */
    for (let r = 1; r <= p.acIn; r++) {
      dev({ id: 'XT' + r, sheet: SH.AC, tag: 'XT' + r, name: '交流进线端子排 ' + r, spec: 'AC 380V 3P+N+PE', sym: C.S.termStrip(['L1', 'L2', 'L3', 'N', 'PE'], 'AC'), x: 120, y: 120 + (r - 1) * 420 });
      dev({ id: 'QS' + r, sheet: SH.AC, tag: 'QS' + r, name: '进线隔离开关 ' + r, spec: '4P 630A', sym: C.makeSwitch({ poles: 4, marker: 'iso' }), x: 320, y: 120 + (r - 1) * 420 });
      dev({ id: 'QF' + r, sheet: SH.AC, tag: 'QF' + r, name: '进线断路器 ' + r, spec: '4P 630A MCCB', sym: C.makeSwitch({ poles: 4, marker: 'cb' }), x: 500, y: 120 + (r - 1) * 420 });
      dev({ id: 'FV' + r, sheet: SH.AC, tag: 'FV' + r, name: '防雷 SPD ' + r, spec: 'T2 3P+N', sym: C.S.spd(), x: 500, y: 260 + (r - 1) * 420 });
      ['L1', 'L2', 'L3', 'N'].forEach(function (ph, i) {
        net(pin('XT' + r, ph), pin('QS' + r, String(2 * i + 1)), 'AC', { name: 'AC' + r + '-' + ph });
        net(pin('QS' + r, String(2 * i + 2)), pin('QF' + r, String(2 * i + 1)), 'AC', { name: 'QF' + r + '-' + ph });
      });
      net(pin('QF' + r, '2'), pin('FV' + r, 'L1'), 'AC', { name: 'SPD' + r + '-L1' });
      net(pin('QF' + r, '8'), pin('FV' + r, 'N'), 'AC', { name: 'SPD' + r + '-N' });
      net(pin('XT' + r, 'PE'), pin('FV' + r, 'PE'), 'PE', { name: 'PE-SPD' + r });
    }

    /* ---------- 页1：AC/DC 模块 + 直流侧 3 组汇流 ---------- */
    for (let i = 1; i <= acdc; i++) {
      dev({
        id: 'A' + i, sheet: SH.AC, tag: 'A' + i, name: 'AC/DC 模块', spec: p.acdcKw + 'kW 液冷 · 250~1500V',
        sym: S.acdcMod('A' + i, p.acdcKw), x: 760 + ((i - 1) % 2) * 200, y: 120 + Math.floor((i - 1) / 2) * 230
      });
      const inR = ((i - 1) % 2) + 1;   // 奇数模块挂进线1，偶数挂进线2
      ['L1', 'L2', 'L3', 'N'].forEach(function (ph, k) {
        net(pin('QF' + inR, String(2 * k + 2)), pin('A' + i, ph), 'AC', { name: 'A' + i + '-' + ph });
      });
      net(pin('A' + i, 'PE'), pin('FV' + inR, 'PE'), 'PE', { name: 'A' + i + '-PE' });
    }
    const canATaps = [{ id: 'IN', wires: ['CANH', 'CANL'], side: 'N', label: 'PMU1', gap: 64 }];
    for (let i = 1; i <= acdc; i++) canATaps.push({ id: 'A' + i, wires: ['CANH', 'CANL'], side: 'N', label: 'A' + i, gap: 64 });
    canATaps.push({ id: 'OUT', wires: ['CANH', 'CANL'], side: 'S', label: '→DC/DC总线', gap: 64 });
    dev({ id: 'WBCANM1', sheet: SH.AC, tag: 'WBCANM1', name: 'AC/DC 模块 CAN 总线', spec: 'CANH / CANL 多点总线', sym: C.makeBus({ bars: [{ name: 'CANH', k: 'COMM' }, { name: 'CANL', k: 'COMM' }], taps: canATaps, dropPitch: 12, barPitch: 14 }), x: 760, y: 820 });
    for (let i = 1; i <= acdc; i++) {
      net(pin('A' + i, 'CANH'), pin('WBCANM1', 'A' + i + '.CANH'), 'COMM', { name: 'A' + i + '-CANH' });
      net(pin('A' + i, 'CANL'), pin('WBCANM1', 'A' + i + '.CANL'), 'COMM', { name: 'A' + i + '-CANL' });
    }
    /* 进线 EMC 前置（并联于 QS 出线节点）+ PE 有效性检测（参照厂家对比库范式，G11/G03） */
    for (let r = 1; r <= p.acIn; r++) {
      dev({
        id: 'FE' + r, sheet: SH.AC, tag: 'FE' + r, name: '进线 EMC / 防雷前置', spec: 'X/Y 电容 + 压敏 + GDT 3500V（分流）',
        sym: C.S.emcFront(), x: 660, y: r === 1 ? 150 : 520
      });
      net(pin('QS' + r, '2'), pin('FE' + r, 'L1'), 'AC', { name: 'FE' + r + '-L1' });
      net(pin('QS' + r, '4'), pin('FE' + r, 'L2'), 'AC', { name: 'FE' + r + '-L2' });
      net(pin('QS' + r, '6'), pin('FE' + r, 'L3'), 'AC', { name: 'FE' + r + '-L3' });
      net(pin('QS' + r, '8'), pin('FE' + r, 'N'), 'AC', { name: 'FE' + r + '-N' });
      net(pin('FE' + r, 'PE'), pin('FV' + r, 'PE'), 'PE', { name: 'FE' + r + '-PE' });
    }
    dev({
      id: 'PEC1', sheet: SH.AC, tag: 'PEC1', name: 'PE 有效性检测单元', spec: '双运放差分精密检测',
      sym: C.S.peDet(), x: 500, y: 370
    });
    net(pin('PEC1', 'L'), pin('FV1', 'L1'), 'AC', { name: 'PEC1-L' });
    net(pin('PEC1', 'N'), pin('FV1', 'N'), 'AC', { name: 'PEC1-N' });
    net(pin('PEC1', 'PE'), pin('FV1', 'PE'), 'PE', { name: 'PEC1-PE' });
    net(pin('PEC1', 'AO'), pin('PMU1', 'AI_PE'), 'CTL', { name: 'PEC1-AO→PMU1' });
    net(pin('PEC1', 'AO'), pin('PMU2', 'AI_PE'), 'CTL', { name: 'PEC1-AO→PMU2' });
    net(pin('PEC1', 'V+'), pin('T1', 'V+'), 'AUX', { name: 'PEC1-24V+' });
    net(pin('PEC1', 'V-'), pin('T1', 'V-'), 'AUX', { name: 'PEC1-24V-' });
    /* AC/DC 母线侧汇流：3 组，每组 2 台 → 直流输出 */
    for (let g = 1; g <= grpA; g++) {
      const a1 = 2 * g - 1, a2 = 2 * g;
      dev({
        id: 'WA' + g, sheet: SH.AC, tag: 'WA' + g, name: 'AC/DC 直流汇流排 组' + g, spec: kA + 'kW · 1500V',
        sym: C.makeBus({ bars: [{ name: 'DC+', k: 'DC' }, { name: 'DC-', k: 'DC' }], taps: [
          { id: 'M1', wires: ['DC+', 'DC-'], side: 'N', label: 'A' + a1, gap: 120 },
          { id: 'M2', wires: ['DC+', 'DC-'], side: 'N', label: 'A' + a2, gap: 120 },
          { id: 'OUT', wires: ['DC+', 'DC-'], side: 'S', label: '→DCU', gap: 60 }
        ], dropPitch: 40 }),
        x: 1180, y: 120 + (g - 1) * 150
      });
      net(pin('A' + a1, 'DC+'), pin('WA' + g, 'M1.DC+'), 'DC', { name: 'WA' + g + 'M1+' });
      net(pin('A' + a1, 'DC-'), pin('WA' + g, 'M1.DC-'), 'DC', { name: 'WA' + g + 'M1-' });
      net(pin('A' + a2, 'DC+'), pin('WA' + g, 'M2.DC+'), 'DC', { name: 'WA' + g + 'M2+' });
      net(pin('A' + a2, 'DC-'), pin('WA' + g, 'M2.DC-'), 'DC', { name: 'WA' + g + 'M2-' });
    }

    /* ---------- 页1：交流侧安全 / 计量 / 接地（A01/A03/A04/A12） ---------- */
    dev({ id: 'RCM1', sheet: SH.AC, tag: 'RCM1', name: '剩余电流监测装置', spec: 'Type B 含直流分量', sym: C.S.rcm(), x: 1560, y: 170 });
    dev({ id: 'PJ1', sheet: SH.AC, tag: 'PJ1', name: '交流电能表', spec: '三相四线 RS485', sym: C.S.meterAC(), x: 1560, y: 300 });
    dev({ id: 'K0', sheet: SH.AC, tag: 'K0', name: '泄放接触器', spec: '1P 10A 线圈 DC24V', sym: C.makeSwitch({ poles: 1, marker: 'km', coil: true, names: ['DC+'], k: 'DC' }), x: 1560, y: 480 });
    dev({ id: 'RS0', sheet: SH.AC, tag: 'RS0', name: '母线泄放电阻', spec: '按母线电容量核算', sym: C.makeRes({ k: 'DC' }), x: 1560, y: 610 });
    /* RCM1 / PJ1：导体穿过式（in 与 out 同接 QF1 保护侧输出 = 4 极贯穿监测/计量） */
    ['1', '3', '5', '7'].forEach(function (ip, j) { net(pin('QF1', String(2 * j + 2)), pin('RCM1', ip), 'AC', { name: 'RCM1-in' + ip }); });
    ['2', '4', '6', '8'].forEach(function (op, j) { net(pin('QF1', String(2 * j + 2)), pin('RCM1', op), 'AC', { name: 'RCM1-out' + op }); });
    ['1', '3', '5', '7'].forEach(function (ip, j) { net(pin('QF1', String(2 * j + 2)), pin('PJ1', ip), 'AC', { name: 'PJ1-in' + ip }); });
    ['2', '4', '6', '8'].forEach(function (op, j) { net(pin('QF1', String(2 * j + 2)), pin('PJ1', op), 'AC', { name: 'PJ1-out' + op }); });
    net(pin('RCM1', '24V+'), pin('T1', 'V+'), 'AUX', { name: 'RCM-24V+' });
    net(pin('RCM1', '24V-'), pin('T1', 'V-'), 'AUX', { name: 'RCM-24V-' });
    net(pin('RCM1', 'ALM'), pin('DCU1', 'DI_FB'), 'CTL', { name: 'RCM-ALM' });
    net(pin('PJ1', 'A'), pin('GW1', 'CH1_A'), 'COMM', { name: 'PJ1-485A' });
    net(pin('PJ1', 'B'), pin('GW1', 'CH1_B'), 'COMM', { name: 'PJ1-485B' });
    /* 母线泄放：母线+ → K0 → RS0 → 母线- */
    net(pin('WA' + grpA, 'OUT.DC+'), pin('K0', '1'), 'DC', { name: '母线+→K0' });
    net(pin('K0', '2'), pin('RS0', '1'), 'DC', { name: 'K0→RS0' });
    net(pin('RS0', '2'), pin('WA' + grpA, 'OUT.DC-'), 'DC', { name: 'RS0→母线-' });
    net(pin('K0', 'A1'), pin('T1', 'V+'), 'CTL', { name: 'K0-coil+' });
    net(pin('K0', 'A2'), pin('T1', 'V-'), 'CTL', { name: 'K0-coil-' });
    /* 保护接地排 PE1（A12）：进线、AC/DC、枪、储能柜 PE 汇接 */
    dev({
      id: 'PE1', sheet: SH.AC, tag: 'PE1', name: '保护接地排', spec: 'Cu 30×4 等电位',
      sym: C.makeBus({ bars: [{ name: 'PE', k: 'PE' }], taps: [
        { id: 'XT', wires: ['PE'], side: 'N', label: '进线PE', gap: 90 },
        { id: 'MOD', wires: ['PE'], side: 'N', label: 'AC/DC PE', gap: 90 },
        { id: 'GUN', wires: ['PE'], side: 'S', label: '枪PE', gap: 90 },
        { id: 'ESS', wires: ['PE'], side: 'S', label: '储能PE', gap: 90 }
      ], dropPitch: 90 }), x: 1980, y: 120
    });
    net(pin('XT1', 'PE'), pin('PE1', 'XT.PE'), 'PE', { name: 'PE-XT1' });
    net(pin('XT2', 'PE'), pin('PE1', 'XT.PE'), 'PE', { name: 'PE-XT2' });
    for (let i = 1; i <= acdc; i++) net(pin('A' + i, 'PE'), pin('PE1', 'MOD.PE'), 'PE', { name: 'PE-A' + i });

    /* ---------- 页2：24×双向 DC/DC 模块 + 两路直流母线 ---------- */
    for (let i = 1; i <= dcdc; i++) {
      const side = i <= 12 ? 1 : 2;    // 1~12 挂直流母线1，13~24 挂直流母线2
      const pos = ((i - 1) % 12) + 1;  // 第几排
      dev({
        id: 'D' + i, sheet: SH.DC, tag: 'D' + i, name: '双向 DC/DC 模块', spec: p.dcdcKw + 'kW · 母线↔车辆 1500V',
        sym: S.dcdcMod('D' + i, p.dcdcKw), x: 760 + (side - 1) * 320, y: 110 + (pos - 1) * 114
      });
    }
    const canDTaps = [{ id: 'IN', wires: ['CANH', 'CANL'], side: 'N', label: 'AC/DC总线', gap: 54 }];
    for (let i = 1; i <= dcdc; i++) canDTaps.push({ id: 'D' + i, wires: ['CANH', 'CANL', 'PE'], side: 'N', label: 'D' + i, gap: 54 });
    canDTaps.push({ id: 'DCU1', wires: ['PE'], side: 'S', label: 'DCU1-PE', gap: 60 });
    canDTaps.push({ id: 'DCU2', wires: ['PE'], side: 'S', label: 'DCU2-PE', gap: 60 });
    canDTaps.push({ id: 'PEMAIN', wires: ['PE'], side: 'S', label: '→PE1', gap: 54 });
    canDTaps.push({ id: 'OUT', wires: ['CANH', 'CANL'], side: 'S', label: 'PMU2', gap: 54 });
    dev({ id: 'WBCANM2', sheet: SH.DC, tag: 'WBCANM2', name: 'DC/DC 通信与保护地母排', spec: 'CANH / CANL 差分通信；PE 独立绝缘母排', sym: C.makeBus({ bars: [{ name: 'CANH', k: 'COMM' }, { name: 'CANL', k: 'COMM' }, { name: 'PE', k: 'PE' }], taps: canDTaps, dropPitch: 12, barPitch: 14 }), x: 40, y: 1740 });
    for (let i = 1; i <= dcdc; i++) {
      net(pin('D' + i, 'CANH'), pin('WBCANM2', 'D' + i + '.CANH'), 'COMM', { name: 'D' + i + '-CANH' });
      net(pin('D' + i, 'CANL'), pin('WBCANM2', 'D' + i + '.CANL'), 'COMM', { name: 'D' + i + '-CANL' });
      net(pin('D' + i, 'PE'), pin('WBCANM2', 'D' + i + '.PE'), 'PE', { name: 'D' + i + '-PE' });
    }
    net(pin('PE1', 'MOD.PE'), pin('WBCANM2', 'PEMAIN.PE'), 'PE', { name: 'PE1→DC/DC PE 母排' });
    /* 直流母线：1 / 2，每路各接 12 台 DC/DC 母线侧 + 1 个储能柜 */
    for (let b = 1; b <= 2; b++) {
      const taps = [];
      for (let k = 1; k <= 12; k++) taps.push({ id: 'M' + k, wires: ['B+', 'B-'], side: 'N', label: 'D' + ((b - 1) * 12 + k), gap: 84 });
      taps.push({ id: 'ESS', wires: ['B+', 'B-'], side: 'N', label: '储能柜' + b, gap: 70 });
      dev({
        id: 'WB' + b, sheet: SH.DC, tag: 'WB' + b, name: '直流母线 ' + b, spec: '±1500V · 12×' + p.dcdcKw + 'kW',
        sym: C.makeBus({ bars: [{ name: 'B+', k: 'DC' }, { name: 'B-', k: 'DC' }], taps: taps, dropPitch: 78, dropTop: 60 }),
        x: 300 + (b - 1) * 380, y: b === 1 ? 40 : 76
      });
      for (let k = 1; k <= 12; k++) {
        const idx = (b - 1) * 12 + k;
        net(pin('D' + idx, 'B+'), pin('WB' + b, 'M' + k + '.B+'), 'DC', { name: 'WB' + b + 'M' + k + '+' });
        net(pin('D' + idx, 'B-'), pin('WB' + b, 'M' + k + '.B-'), 'DC', { name: 'WB' + b + 'M' + k + '-' });
      }
    }

    /* ---------- 页2：直流母线安全 / 计量 / 绝缘（A02/A03） ---------- */
    dev({ id: 'PJ2', sheet: SH.DC, tag: 'PJ2', name: '双母线直流电压监测表', spec: '1500VDC · 双通道电压采样', sym: S.busMeter(), x: 220, y: 1500 });
    dev({ id: 'RI1', sheet: SH.DC, tag: 'RI1', name: '直流绝缘监测装置', spec: '判据按 GB/T 18487.1', sym: S.imd(), x: 780, y: 1500 });
    /* PJ2 只做并联电压采样；电能计量由每把枪的 PG 串联电流表完成。 */
    net(pin('WB1', 'ESS.B+'), pin('PJ2', 'BUS1+'), 'DC', { name: 'PJ2-BUS1+' });
    net(pin('WB1', 'ESS.B-'), pin('PJ2', 'BUS1-'), 'DC', { name: 'PJ2-BUS1-' });
    net(pin('WB2', 'ESS.B+'), pin('PJ2', 'BUS2+'), 'DC', { name: 'PJ2-BUS2+' });
    net(pin('WB2', 'ESS.B-'), pin('PJ2', 'BUS2-'), 'DC', { name: 'PJ2-BUS2-' });
    net(pin('WB1', 'ESS.B+'), pin('RI1', 'DC+'), 'DC', { name: '母线1+→RI1' });
    net(pin('WB1', 'ESS.B-'), pin('RI1', 'DC-'), 'DC', { name: '母线1-→RI1' });
    net(pin('RI1', 'PE'), pin('PE1', 'MOD.PE'), 'PE', { name: 'RI1-PE' });
    net(pin('RI1', 'ALM'), pin('DCU2', 'DI_FB'), 'CTL', { name: 'RI1-ALM' });
    net(pin('RI1', 'V+'), pin('T1', 'V+'), 'AUX', { name: 'RI1-24V+' });
    net(pin('RI1', 'V-'), pin('T1', 'V-'), 'AUX', { name: 'RI1-24V-' });
    net(pin('PJ2', '485A'), pin('GW1', 'CH2_A'), 'COMM', { name: 'PJ2-485A' });
    net(pin('PJ2', '485B'), pin('GW1', 'CH2_B'), 'COMM', { name: 'PJ2-485B' });
    net(pin('RI1', '485A'), pin('GW1', 'CH3_A'), 'COMM', { name: 'RI1-485A' });
    net(pin('RI1', '485B'), pin('GW1', 'CH3_B'), 'COMM', { name: 'RI1-485B' });

    /* AC/DC 侧：3 进 2 出（进=AC/DC 汇流组，出=枪 / 直流母线）；DC/DC 侧：12 进 1 出 */
    for (let d = 1; d <= p.dcuCount; d++) {
      dev({
        id: 'DCU' + d, sheet: SH.MATRIX, tag: 'DCU' + d, name: '开关控制单元 ' + d, spec: '接触器投切 / 状态采集',
        sym: S.dcu(d), x: 200 + (d - 1) * 380, y: 120
      });
      /* AC/DC 侧 3 进 2 出 */
      for (let g = 1; g <= grpA; g++) {
        /* → 枪 d */
        dev({
          id: 'KA' + d + g, sheet: SH.MATRIX, tag: 'KA' + d + g, name: 'AC/DC→枪' + d + ' G' + g, spec: '2P 1500VDC · ' + kA + 'kW',
          sym: C.makeSwitch({ poles: 2, marker: 'km', coil: true, names: ['DC+', 'DC-'], k: 'DC' }), x: 1320 + (g - 1) * 210, y: 120 + (d - 1) * 320
        });
        /* → 储能柜 d */
        dev({
          id: 'KB' + d + g, sheet: SH.MATRIX, tag: 'KB' + d + g, name: 'AC/DC→储能' + d + ' G' + g, spec: '2P 1500VDC · ' + kA + 'kW',
          sym: C.makeSwitch({ poles: 2, marker: 'km', coil: true, names: ['DC+', 'DC-'], k: 'DC' }), x: 1320 + (g - 1) * 210, y: 300 + (d - 1) * 320
        });
        /* 每个支路独立输出，避免同枪/储能去向被共用 DO 一起吸合。 */
        net(pin('KA' + d + g, 'A1'), pin('DCU' + d, 'DO_KA' + g), 'CTL', { name: 'KA' + d + g + '-coil+', tag: 'KA' + d + g });
        net(pin('KB' + d + g, 'A1'), pin('DCU' + d, 'DO_KB' + g), 'CTL', { name: 'KB' + d + g + '-coil+', tag: 'KB' + d + g });
      }
      /* DC/DC 侧 12 进 1 出（车辆侧 → 枪 d，可逆向放电） */
      for (let k = 1; k <= grpD; k++) {
        dev({
          id: 'KC' + d + k, sheet: SH.MATRIX, tag: 'KC' + d + k, name: 'DC/DC→枪' + d + ' G' + k, spec: '2P 1500VDC · ' + kD + 'kW 可逆',
          sym: C.makeSwitch({ poles: 2, marker: 'km', coil: true, names: ['V+', 'V-'], k: 'DC' }), x: 1950 + ((k - 1) % 6) * 210, y: 760 + (d - 1) * 380 + Math.floor((k - 1) / 6) * 190
        });
        net(pin('KC' + d + k, 'A1'), pin('DCU' + d, 'DO_KC' + k), 'CTL', { name: 'KC' + d + k + '-coil+', tag: 'KC' + d + k });
      }
    }

    /* ---------- 页3：每枪一条直流汇流轨 + 双枪回路 ---------- */
    /* RAIL{d} 收集该枪全部 AC/DC 组(A) 与 DC/DC 组(D) 输出，再经熔断器→主正→电表→枪→主负→回轨 */
    const railTaps = [];
    for (let g = 1; g <= grpA; g++) railTaps.push({ id: 'A' + g, wires: ['P', 'N'], side: 'N', label: 'AC/DC组' + g, gap: 84 });
    for (let k = 1; k <= grpD; k++) railTaps.push({ id: 'D' + k, wires: ['P', 'N'], side: 'N', label: 'DC/DC组' + k, gap: 84 });
    railTaps.push({ id: 'OUT', wires: ['P', 'N'], side: 'S', label: '→枪回路', gap: 60 });
    for (let d = 1; d <= p.gunCount; d++) {
      dev({ id: 'RAIL' + d, sheet: SH.GUN, tag: 'RAIL' + d, name: '枪' + d + ' 直流汇流轨', spec: '±1500V · ' + (grpA * kA + grpD * kD) + 'kW 上限',
        sym: C.makeBus({ bars: [{ name: 'P', k: 'DC' }, { name: 'N', k: 'DC' }], taps: railTaps, dropPitch: 84, dropTop: 70 }),
        x: 140 + (d - 1) * 640, y: 110 + (d - 1) * 60 });
    }
    /* 双枪：熔断器 + 主正/主负接触器 + 电能表 + 霍尔 + 液冷枪 + CCU */
    for (let g = 1; g <= p.gunCount; g++) {
      const y = 760 + (g - 1) * 300;
      dev({ id: 'FG' + g, sheet: SH.GUN, tag: 'FG' + g, name: '枪' + g + ' 直流熔断器', spec: '1500VDC ' + p.gunRated + 'A', sym: C.makeFuse({ k: 'DC', rated: p.gunRated + 'A' }), x: 140 + (g - 1) * 640, y: y });
      dev({ id: 'KGP' + g, sheet: SH.GUN, tag: 'KGP' + g, name: '枪' + g + ' 主正接触器', spec: 'DC 1500V 1500A', sym: C.makeSwitch({ poles: 1, marker: 'km', coil: true, names: ['DC+'], k: 'DC' }), x: 320 + (g - 1) * 640, y: y });
      dev({ id: 'KGN' + g, sheet: SH.GUN, tag: 'KGN' + g, name: '枪' + g + ' 主负接触器', spec: 'DC 1500V 1500A', sym: C.makeSwitch({ poles: 1, marker: 'km', coil: true, names: ['DC-'], k: 'DC' }), x: 320 + (g - 1) * 640, y: y + 130 });
      dev({ id: 'PG' + g, sheet: SH.GUN, tag: 'PG' + g, name: '枪' + g + ' 直流电能表', spec: '1500V 1500A', sym: S.meterDC(), x: 520 + (g - 1) * 640, y: y });
      dev({ id: 'HG' + g, sheet: SH.GUN, tag: 'HG' + g, name: '枪' + g + ' 霍尔传感器', spec: '±1500A', sym: S.hall(), x: 520 + (g - 1) * 640, y: y + 130 });
      dev({ id: 'XG' + g, sheet: SH.GUN, tag: 'XG' + g, name: '液冷充电枪 ' + g, spec: p.gunV + 'V/' + p.gunA + 'A 液冷', sym: S.gun(g, p.gunV, p.gunA), x: 740 + (g - 1) * 640, y: y });
      dev({ id: 'CCU' + g, sheet: SH.GUN, tag: 'CCU' + g, name: '充电控制器 ' + g, spec: 'GB/T 27930.2 + 私有协议', sym: S.ccu(g), x: 980 + (g - 1) * 640, y: y });
      dev({ id: 'YL' + g, sheet: SH.GUN, tag: 'YL' + g, name: '枪' + g + ' 电子锁执行器', spec: 'DC24V · 命令与到位反馈分离', sym: S.lockActuator(g), x: 1160 + (g - 1) * 640, y: y + 130 });
      /* 正极：轨OUT.P → 熔断器 → 主正 → 电表 → 枪 */
      net(pin('RAIL' + g, 'OUT.P'), pin('FG' + g, '1'), 'DC', { name: '轨' + g + '+→熔断器' });
      net(pin('FG' + g, '2'), pin('KGP' + g, '1'), 'DC', { name: '熔断器' + g + '→主正' });
      net(pin('KGP' + g, '2'), pin('PG' + g, 'I+'), 'DC', { name: '主正' + g + '→电表I+' });
      net(pin('PG' + g, 'I-'), pin('XG' + g, 'DC+'), 'DC', { name: '电表' + g + 'I-→枪+' });
      net(pin('RAIL' + g, 'OUT.P'), pin('PG' + g, 'V+'), 'DC', { name: '电表' + g + '电压采样+' });
      net(pin('RAIL' + g, 'OUT.N'), pin('PG' + g, 'V-'), 'DC', { name: '电表' + g + '电压采样-' });
      /* 负极：枪 → 主负 → 霍尔 → 轨OUT.N */
      net(pin('XG' + g, 'DC-'), pin('KGN' + g, '1'), 'DC', { name: '枪' + g + '-→主负' });
      net(pin('KGN' + g, '2'), pin('HG' + g, 'P1'), 'DC', { name: '主负' + g + '→霍尔进' });
      net(pin('HG' + g, 'P2'), pin('RAIL' + g, 'OUT.N'), 'DC', { name: '霍尔' + g + '出→轨-回流' });
      /* 采样 / 线圈 / 导引 / 锁控 / 通讯均独立成对接线。 */
      net(pin('HG' + g, 'I+'), pin('CCU' + g, 'AI_I+'), 'CTL', { name: 'G' + g + '-I采样+' });
      net(pin('HG' + g, 'I-'), pin('CCU' + g, 'AI_I-'), 'CTL', { name: 'G' + g + '-I采样-' });
      net(pin('XG' + g, 'TEMP'), pin('CCU' + g, 'AI_TEMP'), 'CTL', { name: 'G' + g + '-枪温度' });
      net(pin('KGP' + g, 'A1'), pin('CCU' + g, 'DO_KGP'), 'CTL', { name: 'G' + g + '-KGP线圈+' });
      net(pin('KGN' + g, 'A1'), pin('CCU' + g, 'DO_KGN'), 'CTL', { name: 'G' + g + '-KGN线圈+' });
      net(pin('PG' + g, '485A'), pin('GW1', 'CH' + (3 + g) + '_A'), 'COMM', { name: 'G' + g + '-485A' });
      net(pin('PG' + g, '485B'), pin('GW1', 'CH' + (3 + g) + '_B'), 'COMM', { name: 'G' + g + '-485B' });
      net(pin('XG' + g, 'CC'), pin('CCU' + g, 'DO_CC'), 'CTL', { name: 'G' + g + '-CC导引' });
      net(pin('XG' + g, 'S+'), pin('CCU' + g, 'CAN_V_H'), 'COMM', { name: 'G' + g + '-车辆CANH' });
      net(pin('XG' + g, 'S-'), pin('CCU' + g, 'CAN_V_L'), 'COMM', { name: 'G' + g + '-车辆CANL' });
      net(pin('CCU' + g, 'DO_LOCK'), pin('YL' + g, 'CMD'), 'CTL', { name: 'G' + g + '-锁命令' });
      net(pin('YL' + g, 'FB'), pin('CCU' + g, 'DI_LOCK'), 'CTL', { name: 'G' + g + '-锁反馈' });
      net(pin('XG' + g, 'LK'), pin('YL' + g, 'SENSE'), 'CTL', { name: 'G' + g + '-锁状态' });
      net(pin('YL' + g, 'V+'), pin('T1', 'V+'), 'AUX', { name: 'G' + g + '-锁电源+' });
      net(pin('YL' + g, 'V-'), pin('T1', 'V-'), 'AUX', { name: 'G' + g + '-锁电源-' });
      /* 粘连检测：正/负极接触器进出侧四点采样 + ADC 送 DCU（V-ST-01/02） */
      dev({ id: 'KF' + g, sheet: SH.GUN, tag: 'KF' + g, name: '枪' + g + ' 接触器粘连检测', spec: '阻容分压 + ADC（正/负极均覆盖）', sym: C.S.stickDet(), x: 160 + (g - 1) * 640, y: y });
      net(pin('KF' + g, '1'), pin('KGP' + g, '1'), 'DC', { name: 'KF' + g + '-KGP进' });
      net(pin('KF' + g, '2'), pin('KGP' + g, '2'), 'DC', { name: 'KF' + g + '-KGP出' });
      net(pin('KF' + g, '3'), pin('KGN' + g, '1'), 'DC', { name: 'KF' + g + '-KGN进' });
      net(pin('KF' + g, '4'), pin('KGN' + g, '2'), 'DC', { name: 'KF' + g + '-KGN出' });
      net(pin('KF' + g, 'AO'), pin('DCU' + g, 'DI_KF'), 'CTL', { name: 'KF' + g + '-AO→DCU' });
      net(pin('KF' + g, 'V+'), pin('T1', 'V+'), 'AUX', { name: 'KF' + g + '-24V+' });
      net(pin('KF' + g, 'V-'), pin('T1', 'V-'), 'AUX', { name: 'KF' + g + '-24V-' });
    }

    /* ---------- 页4/5：储能柜 ---------- */
    for (let b = 1; b <= p.essCab; b++) {
      const sh = b === 1 ? SH.ESS1 : SH.ESS2;
      const ox = 140 + (b - 1) * 40;
      dev({ id: 'ES' + b + 'A', sheet: sh, tag: 'ESA' + b, name: '储能柜 ' + b + ' 正极进线', spec: '1500VDC 母线 B+', sym: C.S.termStrip(['B+'], 'DC'), x: ox, y: 120 });
      dev({ id: 'ES' + b + 'N', sheet: sh, tag: 'ESN' + b, name: '储能柜 ' + b + ' 负极进线', spec: '1500VDC 母线 B-', sym: C.S.termStrip(['B-'], 'DC'), x: ox + 120, y: 120 });
      dev({ id: 'QFB' + b, sheet: sh, tag: 'QFB' + b, name: '储能柜 ' + b + ' 直流断路器', spec: '1500VDC 快断', sym: C.makeSwitch({ poles: 2, marker: 'cb', names: ['B+', 'B-'], k: 'DC' }), x: ox + 280, y: 120 });
      dev({ id: 'TA' + b, sheet: sh, tag: 'TA' + b, name: '储能柜 ' + b + ' 支路电流传感器', spec: '双向 Hall · 量程 RFQ_REQUIRED', sym: S.hall(), x: ox + 780, y: 120 });
      dev({ id: 'FU' + b, sheet: sh, tag: 'FUE' + b, name: '储能柜 ' + b + ' 主熔断器', spec: '1500VDC · 额定电流 RFQ_REQUIRED', sym: C.makeFuse({ k: 'DC' }), x: ox + 460, y: 120 });
      dev({ id: 'KMP' + b, sheet: sh, tag: 'KMP' + b, name: '储能柜 ' + b + ' 主正接触器', spec: 'DC 1500V', sym: C.makeSwitch({ poles: 1, marker: 'km', coil: true, names: ['B+'], k: 'DC' }), x: ox + 620, y: 120 });
      dev({ id: 'KMR' + b, sheet: sh, tag: 'KMR' + b, name: '储能柜 ' + b + ' 预充接触器', spec: 'DC 1500V 小容量', sym: C.makeSwitch({ poles: 1, marker: 'km', coil: true, names: ['B+'], k: 'DC' }), x: ox + 620, y: 250 });
      dev({ id: 'RR' + b, sheet: sh, tag: 'RR' + b, name: '储能柜 ' + b + ' 预充电阻', spec: '50Ω 500W', sym: C.makeRes({ r: '50Ω', p: '500W', k: 'DC' }), x: ox + 620, y: 340 });
      dev({ id: 'SH' + b, sheet: sh, tag: 'SHU' + b, name: '储能柜 ' + b + ' 分流器', spec: 'BMS 电流采样', sym: S.shunt(), x: ox + 280, y: 420 });
      dev({ id: 'FL' + b, sheet: sh, tag: 'FL' + b, name: '储能柜 ' + b + ' 防雷 SPD', spec: 'T2 2P', sym: C.S.spd(), x: ox + 460, y: 420 });
      dev({ id: 'BCU' + b, sheet: sh, tag: 'BCU' + b, name: '储能 BMS 主控 ' + b, spec: p.essPack + '×' + p.essKwh + 'kWh 簇', sym: S.bcu(b), x: ox + 280, y: 560 });
      /* 电池插箱 + BMU */
      for (let k = 1; k <= p.essPack; k++) {
        dev({ id: 'B' + b + k, sheet: sh, tag: 'B' + b + k, name: '电池插箱 ' + k, spec: '1P100S · 118Ah LFP', sym: S.pack(k), x: ox + 40 + (k - 1) * 190, y: 760 });
        dev({ id: 'M' + b + k, sheet: sh, tag: 'M' + b + k, name: 'BMU ' + k, spec: '1P100S 采集', sym: S.bmu(k), x: ox + 40 + (k - 1) * 190, y: 900 });
        net(pin('B' + b + k, 'T1'), pin('M' + b + k, 'B+'), 'CTL', { name: 'BMU' + b + k + '-采+' });
        net(pin('B' + b + k, 'T2'), pin('M' + b + k, 'B-'), 'CTL', { name: 'BMU' + b + k + '-采-' });
        net(pin('M' + b + k, 'CAN_H'), pin('WBMU' + b, 'M' + k + '.CANH'), 'COMM', { name: 'BMU' + b + k + '-CANH' });
        net(pin('M' + b + k, 'CAN_L'), pin('WBMU' + b, 'M' + k + '.CANL'), 'COMM', { name: 'BMU' + b + k + '-CANL' });
      }
      const bmuTaps = [{ id: 'BCU', wires: ['CANH', 'CANL'], side: 'N', label: 'BCU', gap: 54 }];
      for (let k = 1; k <= p.essPack; k++) bmuTaps.push({ id: 'M' + k, wires: ['CANH', 'CANL'], side: 'N', label: 'BMU' + k, gap: 54 });
      dev({ id: 'WBMU' + b, sheet: sh, tag: 'WBMU' + b, name: 'BMU CAN 总线', spec: 'CANH / CANL 多点总线', sym: C.makeBus({ bars: [{ name: 'CANH', k: 'COMM' }, { name: 'CANL', k: 'COMM' }], taps: bmuTaps, dropPitch: 12, barPitch: 14 }), x: ox + 180, y: 1050 });
      net(pin('BCU' + b, 'CAN_BMU_H'), pin('WBMU' + b, 'BCU.CANH'), 'COMM', { name: 'BCU' + b + '-CANH' });
      net(pin('BCU' + b, 'CAN_BMU_L'), pin('WBMU' + b, 'BCU.CANL'), 'COMM', { name: 'BCU' + b + '-CANL' });
      /* 电池簇串联回路 */
      for (let k = 1; k <= p.essPack; k++) {
        const nx = k < p.essPack ? pin('B' + b + (k + 1), 'N') : pin('KMP' + b, '1');
        net(pin('B' + b + k, 'P'), nx, 'ESS', { name: '簇' + b + '-' + k + '+' });
      }
      net(pin('BCU' + b, 'DO_KM'), pin('KMP' + b, 'A1'), 'CTL', { name: 'ES' + b + '-KMPcoil' });
      net(pin('BCU' + b, 'DO_PRE'), pin('KMR' + b, 'A1'), 'CTL', { name: 'ES' + b + '-KMRcoil' });
      net(pin('BCU' + b, 'V+'), pin('T2', 'V+'), 'AUX', { name: 'ES' + b + '-BCU24V+' });
      net(pin('BCU' + b, 'V-'), pin('T2', 'V-'), 'AUX', { name: 'ES' + b + '-BCU24V-' });
      /* 柜内高压回路：簇负→分流器→断路器负极；簇正→主正→熔断→断路器正极→进线端子 */
      net(pin('B' + b + '1', 'N'), pin('SH' + b, '1'), 'ESS', { name: 'ES' + b + '-簇负→分流' });
      net(pin('SH' + b, '2'), pin('QFB' + b, '3'), 'ESS', { name: 'ES' + b + '-分流→QFB-' });
      net(pin('SH' + b, 'I+'), pin('BCU' + b, 'AI_I+'), 'CTL', { name: 'ES' + b + '-分流采样+' });
      net(pin('SH' + b, 'I-'), pin('BCU' + b, 'AI_I-'), 'CTL', { name: 'ES' + b + '-分流采样-' });
      net(pin('QFB' + b, '4'), pin('ES' + b + 'N', 'B-'), 'DC', { name: 'ES' + b + '-负进线' });
      net(pin('KMP' + b, '2'), pin('FU' + b, '1'), 'DC', { name: 'ES' + b + '-主正→熔断' });
      net(pin('FU' + b, '2'), pin('QFB' + b, '1'), 'DC', { name: 'ES' + b + '-熔断→QFB+' });
      net(pin('QFB' + b, '2'), pin('TA' + b, 'P1'), 'DC', { name: 'ES' + b + '-QFB+→Hall进' });
      net(pin('TA' + b, 'P2'), pin('ES' + b + 'A', 'B+'), 'DC', { name: 'ES' + b + '-Hall出→正进线' });
      [1, 2].forEach(function (m) {
        net(pin('TA' + b, 'I+'), pin('PMU' + m, 'AI_ESS' + b + '+'), 'CTL', { name: 'ES' + b + '-PMU' + m + '-支路电流+' });
        net(pin('TA' + b, 'I-'), pin('PMU' + m, 'AI_ESS' + b + '-'), 'CTL', { name: 'ES' + b + '-PMU' + m + '-支路电流-' });
      });
      /* 预充支路与主正接触器并联：KMR.1 与 KMP.1 同点，KMR.2→RR→熔断节点（合闸时经 R 限流） */
      net(pin('KMR' + b, '1'), pin('KMP' + b, '1'), 'ESS', { name: 'ES' + b + '-预充并接' });
      net(pin('KMR' + b, '2'), pin('RR' + b, '1'), 'DC', { name: 'ES' + b + '-预充→R' });
      net(pin('RR' + b, '2'), pin('FU' + b, '1'), 'DC', { name: 'ES' + b + '-R→熔断节点' });
      /* 柜 ↔ 直流母线（跨页：经 WB{b} 的 ESS 抽头，跨页符自动拆对） */
      net(pin('ES' + b + 'A', 'B+'), pin('WB' + b, 'ESS.B+'), 'DC', { name: '储能柜' + b + '+→母线' + b });
      net(pin('ES' + b + 'N', 'B-'), pin('WB' + b, 'ESS.B-'), 'DC', { name: '储能柜' + b + '-→母线' + b });
      /* BCU 电压采样 + 保护接地（PE1.ESS 抽头，跨页） */
      net(pin('BCU' + b, 'V_BAT'), pin('B' + b + p.essPack, 'P'), 'CTL', { name: 'ES' + b + '-V采样' });
      net(pin('BCU' + b, 'PE'), pin('PE1', 'ESS.PE'), 'PE', { name: 'ES' + b + '-PE' });
      /* 柜内辅电：AC220 进线端子 → SPD / 液冷 / 除湿；PE 汇入 PE1.ESS（跨页） */
      dev({ id: 'XT' + (b + 2), sheet: sh, tag: 'XT' + (b + 2), name: '储能柜 ' + b + ' 辅电进线', spec: 'AC220V L/N/PE', sym: C.S.termStrip(['L', 'N', 'PE'], 'AC'), x: ox + 800, y: 480 });
      net(pin('XT' + (b + 2), 'L'), pin('FL' + b, 'L1'), 'AC', { name: 'ES' + b + '-辅L→SPD' });
      net(pin('FL' + b, 'L1'), pin('FL' + b, 'L2'), 'AC', { name: 'ES' + b + '-SPD并L2' });
      net(pin('FL' + b, 'L1'), pin('FL' + b, 'L3'), 'AC', { name: 'ES' + b + '-SPD并L3' });
      net(pin('XT' + (b + 2), 'N'), pin('FL' + b, 'N'), 'AC', { name: 'ES' + b + '-辅N→SPD' });
      net(pin('XT' + (b + 2), 'L'), pin('LC' + b, 'L'), 'AC', { name: 'ES' + b + '-辅L→液冷' });
      net(pin('XT' + (b + 2), 'N'), pin('LC' + b, 'N'), 'AC', { name: 'ES' + b + '-辅N→液冷' });
      net(pin('XT' + (b + 2), 'L'), pin('DH' + b, 'L'), 'AC', { name: 'ES' + b + '-辅L→除湿' });
      net(pin('XT' + (b + 2), 'N'), pin('DH' + b, 'N'), 'AC', { name: 'ES' + b + '-辅N→除湿' });
      net(pin('XT' + (b + 2), 'PE'), pin('PE1', 'ESS.PE'), 'PE', { name: 'ES' + b + '-辅PE' });
      net(pin('FL' + b, 'PE'), pin('PE1', 'ESS.PE'), 'PE', { name: 'ES' + b + '-SPD-PE' });
      net(pin('LC' + b, 'PE'), pin('PE1', 'ESS.PE'), 'PE', { name: 'ES' + b + '-液冷PE' });
      /* 柜内 24V：消防电源 + 主正/预充线圈回线 ← T2（主回路辅源，跨页） */
      net(pin('FR' + b, 'V+'), pin('T2', 'V+'), 'AUX', { name: 'ES' + b + '-消防+' });
      net(pin('FR' + b, 'V-'), pin('T2', 'V-'), 'AUX', { name: 'ES' + b + '-消防-' });
      net(pin('KMP' + b, 'A2'), pin('T2', 'V-'), 'CTL', { name: 'ES' + b + '-KMP线圈回线' });
      net(pin('KMR' + b, 'A2'), pin('T2', 'V-'), 'CTL', { name: 'ES' + b + '-KMR线圈回线' });
      /* 辅助：液冷 / 除湿 / 消防 */
      dev({ id: 'LC' + b, sheet: sh, tag: 'LC' + b, name: '液冷机组 ' + b, spec: 'RS485 联控', sym: S.cooling(b), x: ox + 800, y: 620 });
      dev({ id: 'DH' + b, sheet: sh, tag: 'DH' + b, name: '除湿机 ' + b, spec: 'AC220V', sym: S.dehum(b), x: ox + 800, y: 760 });
      dev({ id: 'FR' + b, sheet: sh, tag: 'FR' + b, name: '消防系统 ' + b, spec: 'DC24V + 干接点', sym: S.fire(b), x: ox + 800, y: 900 });
      const rsTaps = [
        { id: 'BCU', wires: ['A', 'B'], side: 'N', label: 'BCU', gap: 54 },
        { id: 'LC', wires: ['A', 'B'], side: 'N', label: '液冷', gap: 54 },
        { id: 'DH', wires: ['A', 'B'], side: 'N', label: '除湿', gap: 54 }
      ];
      dev({ id: 'WRS' + b, sheet: sh, tag: 'WRS' + b, name: '柜内 RS485 总线', spec: 'BCU / 液冷 / 除湿', sym: C.makeBus({ bars: [{ name: 'A', k: 'COMM' }, { name: 'B', k: 'COMM' }], taps: rsTaps, dropPitch: 12, barPitch: 14 }), x: ox + 980, y: 620 });
      net(pin('BCU' + b, 'RS485_A'), pin('WRS' + b, 'BCU.A'), 'COMM', { name: 'ES' + b + '-RS485-A' });
      net(pin('BCU' + b, 'RS485_B'), pin('WRS' + b, 'BCU.B'), 'COMM', { name: 'ES' + b + '-RS485-B' });
      net(pin('LC' + b, 'RS485_A'), pin('WRS' + b, 'LC.A'), 'COMM', { name: 'ES' + b + '-液冷485A' });
      net(pin('LC' + b, 'RS485_B'), pin('WRS' + b, 'LC.B'), 'COMM', { name: 'ES' + b + '-液冷485B' });
      net(pin('DH' + b, 'RS485_A'), pin('WRS' + b, 'DH.A'), 'COMM', { name: 'ES' + b + '-除湿485A' });
      net(pin('DH' + b, 'RS485_B'), pin('WRS' + b, 'DH.B'), 'COMM', { name: 'ES' + b + '-除湿485B' });
      net(pin('FR' + b, 'ALM'), pin('BCU' + b, 'DI_FIRE'), 'CTL', { name: 'ES' + b + '-消防告警' });
    }

    /* ---------- 页6：控制、电源、通信与安全联锁 ---------- */
    dev({ id: 'CMS', sheet: SH.CTL, tag: 'CMS', name: '中央管理系统', spec: 'MQTT / OCPP 云接口', sym: S.cms(), x: 140, y: 120 });
    dev({ id: 'SW', sheet: SH.CTL, tag: 'SW', name: '工业以太网交换机', spec: '5×LAN', sym: C.makeBox({ w: 130, minH: 90, title: '交换机', left: [{ n: 'P1', name: 'P1', k: 'COMM', t: 'bi' }, { n: 'P2', name: 'P2', k: 'COMM', t: 'bi' }, { n: 'P3', name: 'P3', k: 'COMM', t: 'bi' }], right: [{ n: 'P4', name: 'P4', k: 'COMM', t: 'bi' }, { n: 'P5', name: 'P5', k: 'COMM', t: 'bi' }], pitch: 24 }), x: 400, y: 120 });
    for (let m = 1; m <= p.pmuCount; m++) {
      dev({ id: 'PMU' + m, sheet: SH.CTL, tag: 'PMU' + m, name: '能量管理单元 ' + m, spec: '功率策略 / 调度', sym: S.pmu(m), x: 140 + (m - 1) * 300, y: 380 });
      net(pin('PMU' + m, 'V+'), pin('T1', 'V+'), 'AUX', { name: 'PMU' + m + '-V+' });
      net(pin('PMU' + m, 'V-'), pin('T1', 'V-'), 'AUX', { name: 'PMU' + m + '-V-' });
    }
    dev({ id: 'GW1', sheet: SH.CTL, tag: 'GW1', name: 'RS485 / Modbus 网关', spec: '5 路隔离 RS485 → LAN', sym: S.rtuGateway(), x: 850, y: 380 });
    dev({ id: 'T1', sheet: SH.CTL, tag: 'T1', name: '辅助电源 24V(控制)', spec: 'AC220→DC24V', sym: C.makeBox({ w: 110, minH: 74, title: '辅助电源', sub: 'DC24V', left: [{ n: 'L', name: 'L', k: 'AC', t: 'in' }, { n: 'N', name: 'N', k: 'AC', t: 'in' }], right: [{ n: 'V+', name: 'V+', k: 'AUX', t: 'out' }, { n: 'V-', name: 'V-', k: 'AUX', t: 'out' }], pitch: 20 }), x: 700, y: 120 });
    dev({ id: 'T2', sheet: SH.CTL, tag: 'T2', name: '辅助电源 24V(主回路)', spec: 'AC220→DC24V', sym: C.makeBox({ w: 110, minH: 74, title: '辅助电源', sub: 'DC24V 主', left: [{ n: 'L', name: 'L', k: 'AC', t: 'in' }, { n: 'N', name: 'N', k: 'AC', t: 'in' }], right: [{ n: 'V+', name: 'V+', k: 'AUX', t: 'out' }, { n: 'V-', name: 'V-', k: 'AUX', t: 'out' }], pitch: 20 }), x: 900, y: 120 });

    /* 急停与柜门常闭触点串入 SR1，安全输出分别控制充电与储能侧使能。 */
    dev({ id: 'SB1', sheet: SH.CTL, tag: 'SB1', name: '急停按钮', spec: '蘑菇头自锁，常闭安全链', sym: C.S.estop(), x: 140, y: 620 });
    dev({ id: 'SQ1', sheet: SH.CTL, tag: 'SQ1', name: '柜门门禁/防拆开关', spec: '常闭安全链', sym: C.S.posSwitch(), x: 360, y: 620 });
    dev({ id: 'SR1', sheet: SH.CTL, tag: 'SR1', name: '双通道安全继电器', spec: '急停 + 门禁串联输入；双路安全使能输出', sym: C.makeSwitch({ poles: 2, marker: 'km', coil: true, names: ['SAFE1', 'SAFE2'], k: 'SAF' }), x: 580, y: 620 });
    dev({ id: 'MF1', sheet: SH.CTL, tag: 'MF1', name: '热管理风机', spec: '轴流 DC24V', sym: C.S.motor('M'), x: 900, y: 620 });
    net(pin('T1', 'V+'), pin('SB1', '11'), 'SAF', { name: '安全链24V+' });
    net(pin('SB1', '12'), pin('SQ1', '11'), 'SAF', { name: '急停→门禁' });
    net(pin('SQ1', '12'), pin('SR1', 'A1'), 'SAF', { name: '门禁→SR1线圈+' });
    net(pin('SR1', 'A2'), pin('T1', 'V-'), 'SAF', { name: 'SR1线圈回路' });
    net(pin('T1', 'V+'), pin('SR1', '1'), 'SAF', { name: 'SR1通道1电源' });
    net(pin('T2', 'V+'), pin('SR1', '3'), 'SAF', { name: 'SR1通道2电源' });
    const safe1Taps = [
      { id: 'SR', wires: ['S1'], side: 'N', label: 'SR1-2', gap: 70 },
      { id: 'PMU1', wires: ['S1'], side: 'S', label: 'PMU1', gap: 70 },
      { id: 'PMU2', wires: ['S1'], side: 'S', label: 'PMU2', gap: 70 },
      { id: 'DCU1', wires: ['S1'], side: 'S', label: 'DCU1', gap: 70 },
      { id: 'DCU2', wires: ['S1'], side: 'S', label: 'DCU2', gap: 70 },
      { id: 'CCU1', wires: ['S1'], side: 'S', label: 'CCU1', gap: 70 },
      { id: 'CCU2', wires: ['S1'], side: 'S', label: 'CCU2', gap: 70 }
    ];
    dev({ id: 'WBSAFE1', sheet: SH.CTL, tag: 'WBSAFE1', name: '充电侧安全使能分配', spec: 'SR1 通道 1', sym: C.makeBus({ bars: [{ name: 'S1', k: 'SAF' }], taps: safe1Taps, dropPitch: 12 }), x: 140, y: 970 });
    net(pin('SR1', '2'), pin('WBSAFE1', 'SR.S1'), 'SAF', { name: 'SR1-2→充电侧安全使能' });
    ['PMU1', 'PMU2'].forEach(function (id) { net(pin(id, 'DI_SAFE'), pin('WBSAFE1', id + '.S1'), 'SAF', { name: id + '-安全使能' }); });
    ['DCU1', 'DCU2'].forEach(function (id) { net(pin(id, 'EN_SAFE'), pin('WBSAFE1', id + '.S1'), 'SAF', { name: id + '-安全使能' }); });
    ['CCU1', 'CCU2'].forEach(function (id) { net(pin(id, 'EN_SAFE'), pin('WBSAFE1', id + '.S1'), 'SAF', { name: id + '-安全使能' }); });
    const safe2Taps = [
      { id: 'SR', wires: ['S2'], side: 'N', label: 'SR1-4', gap: 76 },
      { id: 'BCU1', wires: ['S2'], side: 'S', label: 'BCU1', gap: 76 },
      { id: 'BCU2', wires: ['S2'], side: 'S', label: 'BCU2', gap: 76 }
    ];
    dev({ id: 'WBSAFE2', sheet: SH.CTL, tag: 'WBSAFE2', name: '储能侧安全使能分配', spec: 'SR1 通道 2', sym: C.makeBus({ bars: [{ name: 'S2', k: 'SAF' }], taps: safe2Taps, dropPitch: 12 }), x: 1050, y: 970 });
    net(pin('SR1', '4'), pin('WBSAFE2', 'SR.S2'), 'SAF', { name: 'SR1-4→储能侧安全使能' });
    ['BCU1', 'BCU2'].forEach(function (id) { net(pin(id, 'EN_SAFE'), pin('WBSAFE2', id + '.S2'), 'SAF', { name: id + '-安全使能' }); });
    net(pin('T1', 'V+'), pin('MF1', 'U'), 'AUX', { name: '风机-+' });
    net(pin('T1', 'V-'), pin('MF1', 'V'), 'AUX', { name: '风机--' });

    /* 控制辅电进线、CMS 网口与 4G 天线。 */
    dev({ id: 'XT5', sheet: SH.CTL, tag: 'XT5', name: '控制电源进线', spec: 'AC220V L/N/PE', sym: C.S.termStrip(['L', 'N', 'PE'], 'AC'), x: 700, y: 40 });
    net(pin('XT5', 'L'), pin('T1', 'L'), 'AC', { name: '控制AC→T1-L' });
    net(pin('T1', 'L'), pin('T2', 'L'), 'AC', { name: 'T1并L→T2' });
    net(pin('XT5', 'N'), pin('T1', 'N'), 'AC', { name: '控制AC→T1-N' });
    net(pin('T1', 'N'), pin('T2', 'N'), 'AC', { name: 'T1并N→T2' });
    net(pin('XT5', 'PE'), pin('PE1', 'XT.PE'), 'PE', { name: '控制AC-PE' });
    dev({ id: 'AT1', sheet: SH.CTL, tag: 'AT1', name: 'CMS 4G 天线', spec: '吸盘 / 胶棒天线', sym: C.makeBox({ w: 76, minH: 56, title: '4G 天线', left: [{ n: 'A', name: 'A', k: 'COMM', t: 'bi' }], pitch: 20 }), x: 170, y: 270 });
    net(pin('CMS', '4G'), pin('AT1', 'A'), 'COMM', { name: 'CMS-4G天线' });
    net(pin('CMS', 'LAN_A'), pin('SW', 'P1'), 'COMM', { name: 'CMS-LAN-A→SW-P1' });
    net(pin('CMS', 'LAN_B'), pin('SW', 'P2'), 'COMM', { name: 'CMS-LAN-B→SW-P2' });
    net(pin('BCU1', 'LAN'), pin('SW', 'P3'), 'COMM', { name: 'BCU1-LAN→SW-P3' });
    net(pin('BCU2', 'LAN'), pin('SW', 'P4'), 'COMM', { name: 'BCU2-LAN→SW-P4' });
    net(pin('GW1', 'LAN1'), pin('SW', 'P5'), 'COMM', { name: 'GW1-LAN→SW-P5' });
    net(pin('CMS', 'PE'), pin('PE1', 'XT.PE'), 'PE', { name: 'CMS-PE' });

    /* 三条独立 CAN 总线均采用差分 CANH/CANL。 */
    const addCanBus = function (id, name, taps, x, y) {
      dev({ id: id, sheet: SH.CTL, tag: id, name: name, spec: 'CANH / CANL 差分总线', sym: C.makeBus({ bars: [{ name: 'CANH', k: 'COMM' }, { name: 'CANL', k: 'COMM' }], taps: taps, dropPitch: 12, barPitch: 14 }), x: x, y: y });
    };
    addCanBus('WBCMS', 'CMS / PMU CAN 总线', [
      { id: 'CMS', wires: ['CANH', 'CANL'], side: 'N', label: 'CMS', gap: 72 },
      { id: 'PMU1', wires: ['CANH', 'CANL'], side: 'S', label: 'PMU1', gap: 72 },
      { id: 'PMU2', wires: ['CANH', 'CANL'], side: 'S', label: 'PMU2', gap: 72 }
    ], 140, 850);
    net(pin('CMS', 'CAN_H'), pin('WBCMS', 'CMS.CANH'), 'COMM', { name: 'CMS-CANH' });
    net(pin('CMS', 'CAN_L'), pin('WBCMS', 'CMS.CANL'), 'COMM', { name: 'CMS-CANL' });
    ['PMU1', 'PMU2'].forEach(function (id) {
      net(pin(id, 'CAN_CMS_H'), pin('WBCMS', id + '.CANH'), 'COMM', { name: id + '-CMS-CANH' });
      net(pin(id, 'CAN_CMS_L'), pin('WBCMS', id + '.CANL'), 'COMM', { name: id + '-CMS-CANL' });
    });
    addCanBus('WBCAND', 'PMU / DCU CAN 总线', [
      { id: 'PMU1', wires: ['CANH', 'CANL'], side: 'N', label: 'PMU1', gap: 64 },
      { id: 'DCU1', wires: ['CANH', 'CANL'], side: 'S', label: 'DCU1', gap: 64 },
      { id: 'DCU2', wires: ['CANH', 'CANL'], side: 'S', label: 'DCU2', gap: 64 },
      { id: 'PMU2', wires: ['CANH', 'CANL'], side: 'S', label: 'PMU2', gap: 64 }
    ], 140, 1110);
    ['PMU1', 'PMU2'].forEach(function (id) {
      net(pin(id, 'CAN_DCU_H'), pin('WBCAND', id + '.CANH'), 'COMM', { name: id + '-DCU-CANH' });
      net(pin(id, 'CAN_DCU_L'), pin('WBCAND', id + '.CANL'), 'COMM', { name: id + '-DCU-CANL' });
    });
    ['DCU1', 'DCU2'].forEach(function (id) {
      net(pin(id, 'CAN_H'), pin('WBCAND', id + '.CANH'), 'COMM', { name: id + '-CANH' });
      net(pin(id, 'CAN_L'), pin('WBCAND', id + '.CANL'), 'COMM', { name: id + '-CANL' });
    });
    addCanBus('WBCCU', 'PMU / CCU CAN 总线', [
      { id: 'PMU1', wires: ['CANH', 'CANL'], side: 'N', label: 'PMU1', gap: 64 },
      { id: 'CCU1', wires: ['CANH', 'CANL'], side: 'S', label: 'CCU1', gap: 64 },
      { id: 'CCU2', wires: ['CANH', 'CANL'], side: 'S', label: 'CCU2', gap: 64 },
      { id: 'PMU2', wires: ['CANH', 'CANL'], side: 'S', label: 'PMU2', gap: 64 }
    ], 850, 1110);
    ['PMU1', 'PMU2'].forEach(function (id) {
      net(pin(id, 'CAN_CCU_H'), pin('WBCCU', id + '.CANH'), 'COMM', { name: id + '-CCU-CANH' });
      net(pin(id, 'CAN_CCU_L'), pin('WBCCU', id + '.CANL'), 'COMM', { name: id + '-CCU-CANL' });
    });
    ['CCU1', 'CCU2'].forEach(function (id) {
      net(pin(id, 'CAN_P_H'), pin('WBCCU', id + '.CANH'), 'COMM', { name: id + '-system-CANH' });
      net(pin(id, 'CAN_P_L'), pin('WBCCU', id + '.CANL'), 'COMM', { name: id + '-system-CANL' });
    });

    /* 模块 CAN 干线：两页模块母排串接，PMU1/PMU2 分别连接两端。 */
    net(pin('PMU1', 'CAN_MOD_H'), pin('WBCANM1', 'IN.CANH'), 'COMM', { name: 'PMU1→ACDC-CANH' });
    net(pin('PMU1', 'CAN_MOD_L'), pin('WBCANM1', 'IN.CANL'), 'COMM', { name: 'PMU1→ACDC-CANL' });
    net(pin('WBCANM1', 'OUT.CANH'), pin('WBCANM2', 'IN.CANH'), 'COMM', { name: 'ACDC→DCDC-CANH' });
    net(pin('WBCANM1', 'OUT.CANL'), pin('WBCANM2', 'IN.CANL'), 'COMM', { name: 'ACDC→DCDC-CANL' });
    net(pin('WBCANM2', 'OUT.CANH'), pin('PMU2', 'CAN_MOD_H'), 'COMM', { name: 'DCDC→PMU2-CANH' });
    net(pin('WBCANM2', 'OUT.CANL'), pin('PMU2', 'CAN_MOD_L'), 'COMM', { name: 'DCDC→PMU2-CANL' });

    /* PMU 泵控；表计与绝缘监测的五路隔离 RS485 已分别接入 GW1。 */
    net(pin('PMU1', 'DO_PUMP'), pin('LC1', 'PUMP'), 'CTL', { name: 'PMU1→液冷泵1' });
    net(pin('PMU2', 'DO_PUMP'), pin('LC2', 'PUMP'), 'CTL', { name: 'PMU2→液冷泵2' });

    /* ---------- 页2/3 跨页：AC/DC 汇流→DCU 投切→枪轨；DC/DC 车辆侧→DCU→枪轨 ---------- */
    /* AC/DC 组 g：WA{g}.OUT 经 KA{d}{g}(→枪d) / KB{d}{g}(→储能母线d) 二选一 */
    for (let g = 1; g <= grpA; g++) {
      for (let d = 1; d <= p.dcuCount; d++) {
        net(pin('WA' + g, 'OUT.DC+'), pin('KA' + d + g, '1'), 'DC', { name: 'ACDC组' + g + '+→KA' + d + g });
        net(pin('WA' + g, 'OUT.DC-'), pin('KA' + d + g, '3'), 'DC', { name: 'ACDC组' + g + '-→KA' + d + g });
        net(pin('KA' + d + g, '2'), pin('RAIL' + d, 'A' + g + '.P'), 'DC', { name: 'KA' + d + g + '+→枪' + d + '轨' });
        net(pin('KA' + d + g, '4'), pin('RAIL' + d, 'A' + g + '.N'), 'DC', { name: 'KA' + d + g + '-→枪' + d + '轨' });
        net(pin('WA' + g, 'OUT.DC+'), pin('KB' + d + g, '1'), 'DC', { name: 'ACDC组' + g + '+→KB' + d + g });
        net(pin('WA' + g, 'OUT.DC-'), pin('KB' + d + g, '3'), 'DC', { name: 'ACDC组' + g + '-→KB' + d + g });
        net(pin('KB' + d + g, '2'), pin('WB' + d, 'ESS.B+'), 'DC', { name: 'KB' + d + g + '+→储能母线' + d });
        net(pin('KB' + d + g, '4'), pin('WB' + d, 'ESS.B-'), 'DC', { name: 'KB' + d + g + '-→储能母线' + d });
      }
    }
    /* DC/DC 组 k：模块 k(母线1) 与 模块 k+12(母线2) 车辆侧并联，经 KC{d}{k} → 枪 d 轨 */
    for (let k = 1; k <= grpD; k++) {
      const m1 = k, m2 = k + 12;
      for (let d = 1; d <= p.dcuCount; d++) {
        net(pin('D' + m1, 'V+'), pin('KC' + d + k, '1'), 'DC', { name: 'D' + m1 + 'V+→KC' + d + k });
        net(pin('D' + m2, 'V+'), pin('KC' + d + k, '1'), 'DC', { name: 'D' + m2 + 'V+→KC' + d + k });
        net(pin('D' + m1, 'V-'), pin('KC' + d + k, '3'), 'DC', { name: 'D' + m1 + 'V-→KC' + d + k });
        net(pin('D' + m2, 'V-'), pin('KC' + d + k, '3'), 'DC', { name: 'D' + m2 + 'V-→KC' + d + k });
        net(pin('KC' + d + k, '2'), pin('RAIL' + d, 'D' + k + '.P'), 'DC', { name: 'KC' + d + k + '+→枪' + d + '轨' });
        net(pin('KC' + d + k, '4'), pin('RAIL' + d, 'D' + k + '.N'), 'DC', { name: 'KC' + d + k + '-→枪' + d + '轨' });
      }
    }

    /* ---------- 页末：接触器线圈回线 / PE 接地 / SPD 相线 / 辅助供电 补全（B01） ---------- */
    for (let d = 1; d <= p.dcuCount; d++) {
      for (let g = 1; g <= grpA; g++) {
        net(pin('KA' + d + g, 'A2'), pin('T1', 'V-'), 'CTL', { name: 'KA' + d + g + 'coil-' });
        net(pin('KB' + d + g, 'A2'), pin('T1', 'V-'), 'CTL', { name: 'KB' + d + g + 'coil-' });
      }
      for (let k = 1; k <= grpD; k++) net(pin('KC' + d + k, 'A2'), pin('T1', 'V-'), 'CTL', { name: 'KC' + d + k + 'coil-' });
      net(pin('DCU' + d, 'V+'), pin('T1', 'V+'), 'AUX', { name: 'DCU' + d + '-V+' });
      net(pin('DCU' + d, 'V-'), pin('T1', 'V-'), 'AUX', { name: 'DCU' + d + '-V-' });
      net(pin('DCU' + d, 'PE'), pin('WBCANM2', 'DCU' + d + '.PE'), 'PE', { name: 'DCU' + d + '-PE' });
    }
    for (let g = 1; g <= p.gunCount; g++) {
      net(pin('KGP' + g, 'A2'), pin('T1', 'V-'), 'CTL', { name: 'KGP' + g + 'coil-' });
      net(pin('KGN' + g, 'A2'), pin('T1', 'V-'), 'CTL', { name: 'KGN' + g + 'coil-' });
      net(pin('CCU' + g, 'V+'), pin('T1', 'V+'), 'AUX', { name: 'CCU' + g + '-V+' });
      net(pin('CCU' + g, 'V-'), pin('T1', 'V-'), 'AUX', { name: 'CCU' + g + '-V-' });
      net(pin('CCU' + g, 'PE'), pin('PE1', 'GUN.PE'), 'PE', { name: 'CCU' + g + '-PE' });
      net(pin('XG' + g, 'PE'), pin('PE1', 'GUN.PE'), 'PE', { name: 'XG' + g + '-PE' });
    }
    net(pin('QF1', '4'), pin('FV1', 'L2'), 'AC', { name: 'SPD1-L2' });
    net(pin('QF1', '6'), pin('FV1', 'L3'), 'AC', { name: 'SPD1-L3' });
    net(pin('QF2', '4'), pin('FV2', 'L2'), 'AC', { name: 'SPD2-L2' });
    net(pin('QF2', '6'), pin('FV2', 'L3'), 'AC', { name: 'SPD2-L3' });
    for (let m = 1; m <= p.pmuCount; m++) net(pin('PMU' + m, 'PE'), pin('PE1', 'MOD.PE'), 'PE', { name: 'PMU' + m + '-PE' });

    const sheets = [
      { no: SH.AC, id: 'AC', title: '交流进线与 AC/DC 功率级' },
      { no: SH.DC, id: 'DC', title: 'DC/DC 模块阵列与直流母线' },
      { no: SH.GUN, id: 'GUN', title: '直流出线与液冷充电枪' },
      { no: SH.ESS1, id: 'ESS1', title: '储能柜 1（电池簇 + BCU/BMU + 预充）' },
      { no: SH.ESS2, id: 'ESS2', title: '储能柜 2（电池簇 + BCU/BMU + 预充）' },
      { no: SH.CTL, id: 'CTL', title: '二次回路与通信' },
      { no: SH.MATRIX, id: 'MATRIX', title: 'AC/DC 与 DC/DC 功率投切矩阵' }
    ];

    const design = {
      params: { family: 'mwess', name: p.name, std: 'GB', ...p },
      sheets: sheets, devices: D, nets: N, wires: [], status: 'CONCEPT_DRAFT—PROFESSIONAL_REVIEW_REQUIRED', _ni: null
    };
    reflowByPowerAndSignal(design);
    splitCrossSheet(design); /* 跨页网拆成跨页符对（XR###A/B），否则跨页线被画到错误坐标 */
    return design;
  }

  /* 页面功能流保持原有分区顺序，但按各页器件密度展开坐标。
   * 主回路页纵向拉开模块与支路；柜内与控制页同时扩大行、列距；
   * 所有位置落到 20 单位网格，给正交走线留出独立车道。 */
  function reflowByPowerAndSignal(design) {
    const spacing = {
      1: { x: 2.10, y: 2.30 }, /* 交流输入 → AC/DC → 计量/保护：加大相间与设备通道间距 */
      2: { x: 2.00, y: 2.55 }, /* 双母线 → DC/DC 阵列 → 监测 / CAN-PE：纵向展开阵列与支路线道 */
      3: { x: 1.22, y: 1.40 }, /* 母线 → 双枪并列输出支路 */
      4: { x: 1.34, y: 1.50 }, /* 电池簇 → 保护/预充 → 辅机与 BMS */
      5: { x: 1.34, y: 1.50 },
      6: { x: 2.15, y: 2.50 }, /* CMS/PMU → 设备通信与硬线安全链：分开通信与安全通道 */
      7: { x: 1.18, y: 1.32 }  /* 控制器 → AC/DC、DC/DC 投切矩阵 */
    };
    design.devices.forEach(function (d) {
      const s = spacing[d.sheet];
      if (!s || d.x == null || d.y == null) return;
      d.x = Math.round(d.x * s.x / 20) * 20;
      d.y = Math.round(d.y * s.y / 20) * 20;
    });
    const byId = {};
    design.devices.forEach(function (d) { byId[d.id] = d; });
    const swapX = function (a, b) {
      if (!byId[a] || !byId[b]) return;
      const x = byId[a].x; byId[a].x = byId[b].x; byId[b].x = x;
    };
    /* 枪负极的实际功率顺序是枪端 → 主负接触器 → 霍尔传感器 → 负母线。
     * 将 KGN/HG 按该顺序重排到 XG 左侧，避免旧坐标让枪负极线横穿霍尔器件。 */
    swapX('KGN1', 'HG1'); swapX('KGN2', 'HG2');
    /* 给从枪 DC- 引出的负极回路留出绕开表计跨页符的转向间隙；
     * 枪端仍与 CCU 保持顺序相邻，线束从器件间空档向下再回到 KGN。 */
    if (byId.XG1) byId.XG1.x += 60;
    if (byId.XG2) byId.XG2.x += 60;

    /* 给 T1 的高扇出 24V/0V 跨页符留出并列列位，T2 移到右侧独立区。 */
    if (byId.T2) { byId.T2.x = 1900; byId.T2.y = 260; }

    /* 安全链单独放到控制页右侧空区，保持 急停 → 门禁 → 双通道安全继电器 的阅读顺序，
     * 与 PMU、通信总线和跨页符列留出完整走线通道。 */
    [['SB1', 2200], ['SQ1', 2600], ['SR1', 3000]].forEach(function (p) {
      if (byId[p[0]]) { byId[p[0]].x = p[1]; byId[p[0]].y = 1120; }
    });

  }

  /* ---------- 跨页网 → 跨页符对（对齐 EVSE attach/xref 机制）---------- */
  function pinDirOf(dv, pn) { const p = (dv.sym.pins || []).find(function (q) { return q.n === pn; }); return p ? p.d : 'W'; }
  function splitCrossSheet(design) {
    const byId = {}; design.devices.forEach(function (d) { byId[d.id] = d; });
    const keep = []; let xn = 0;
    design.nets.forEach(function (n) {
      const A = byId[n.a.d], B = byId[n.b.d];
      if (!A || !B || A.sheet === B.sheet) { keep.push(n); return; }
      xn++;
      const sA = 'XR' + String(xn).padStart(3, '0') + 'A', sB = 'XR' + String(xn).padStart(3, '0') + 'B';
      const labA = '→' + B.sheet + '/' + B.id + ':' + n.b.p, labB = '→' + A.sheet + '/' + A.id + ':' + n.a.p;
      const xtag = 'XP' + String(xn).padStart(3, '0');
      design.devices.push({ id: sA, sheet: A.sheet, tag: '', name: '跨页连接符', spec: n.name || '', xref: true, sym: window.EVSE_CORE.S.xref(labA, pinDirOf(A, n.a.p), xtag), attach: { d: A.id, p: n.a.p } });
      design.devices.push({ id: sB, sheet: B.sheet, tag: '', name: '跨页连接符', spec: n.name || '', xref: true, sym: window.EVSE_CORE.S.xref(labB, pinDirOf(B, n.b.p), xtag), attach: { d: B.id, p: n.b.p } });
      keep.push({ id: n.id + 'a', name: n.name + '/1', cls: n.cls, a: n.a, b: { d: sA, p: '1' }, xpair: n.name });
      keep.push({ id: n.id + 'b', name: n.name + '/2', cls: n.cls, a: { d: sB, p: '1' }, b: n.b, xpair: n.name });
    });
    design.nets = keep;
    positionXrefs(design);
  }
  /* 把跨页符沿锚点引脚方向扫到首个不压器件本体的空位（对齐 place() 的 attach 定位） */
  function positionXrefs(design) {
    const byId = {}; design.devices.forEach(function (d) { byId[d.id] = d; });
    const bodies = {};
    design.devices.forEach(function (d) { if (d.xref || d.x == null) return; (bodies[d.sheet] = bodies[d.sheet] || []).push({ x: d.x - 8, y: d.y - 8, w: d.sym.w + 16, h: d.sym.h + 16 }); });
    const hit = function (sheet, x, y, w, h) { return (bodies[sheet] || []).some(function (b) { return x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y; }); };
    design.devices.forEach(function (d) {
      if (!d.xref || !d.attach) return;
      const anc = byId[d.attach.d]; if (!anc || anc.x == null) return;
      const p = (anc.sym.pins || []).find(function (q) { return q.n === d.attach.p }); if (!p) return;
      const ax = anc.x + p.x, ay = anc.y + p.y, dir = p.d, w = d.sym.w, h = d.sym.h;
      let placed = false;
      /* 大型控制页存在 T1:V- 等高扇出端（数十个跨页符）。旧版只在
       * ±130 的窄带内找位，塞满后把所有剩余符号叠到同一备用坐标，
       * 造成器件重叠并让严格路由无解。按 pin 周围由近到远扩展搜索，
       * 直到找到真实空位；网格间距同时留出文字框和引线通道。 */
      const offsets = [0];
      for (let step = 32; step <= 2400; step += 32) offsets.push(step, -step);
      for (let dist = 40; dist <= 6400 && !placed; dist += 32) {
        for (let oi = 0; oi < offsets.length && !placed; oi++) {
          const off = offsets[oi];
          let x, y;
          if (dir === 'E') { x = ax + dist; y = ay + off - h / 2; }
          else if (dir === 'W') { x = ax - dist - w; y = ay + off - h / 2; }
          else if (dir === 'S') { x = ax + off - w / 2; y = ay + dist; }
          else { x = ax + off - w / 2; y = ay - dist - h; }
          if (!hit(d.sheet, x, y, w, h)) { d.x = Math.round(x); d.y = Math.round(y); bodies[d.sheet].push({ x: d.x - 8, y: d.y - 8, w: w + 16, h: h + 16 }); placed = true; }
        }
      }
      /* 这里理论上总能在扩大搜索区内找到位置。保留最后一道不重叠保障，
       * 若极端拥挤则继续沿引脚方向外扩，而不再回退到可能压住其他符号的位置。 */
      if (!placed) {
        let dist = 6432, x, y;
        do {
          if (dir === 'E') { x = ax + dist; y = ay - h / 2; }
          else if (dir === 'W') { x = ax - dist - w; y = ay - h / 2; }
          else if (dir === 'S') { x = ax - w / 2; y = ay + dist; }
          else { x = ax - w / 2; y = ay - dist - h; }
          dist += 32;
        } while (hit(d.sheet, x, y, w, h));
        d.x = Math.round(x); d.y = Math.round(y);
        bodies[d.sheet].push({ x: d.x - 8, y: d.y - 8, w: w + 16, h: h + 16 });
      }
    });
  }

  /* ---------- 简易正交布线（按设备坐标）----------
   * pts 用 [x,y] 数组（对齐 EVSE segsOf / wirePath）；a/b 带 dev/pin/方向 d */
  function route(design) {
    design.wires = [];
    const M = {}; design.devices.forEach(function (dv) { M[dv.id] = dv; });
    design.nets.forEach(function (n) {
      const A = M[n.a.d], B = M[n.b.d]; if (!A || !B) { n.err = 'DEV'; return; }
      const pa = (A.sym.pins || []).find(function (q) { return q.n === n.a.p; });
      const pb = (B.sym.pins || []).find(function (q) { return q.n === n.b.p; });
      if (!pa || !pb) { n.err = 'PIN'; return; }
      const ax = A.x + pa.x, ay = A.y + pa.y, bx = B.x + pb.x, by = B.y + pb.y;
      const sheet = A.sheet;
      const pts = (Math.abs(ax - bx) < 0.01 || Math.abs(ay - by) < 0.01)
        ? [[ax, ay], [bx, by]]
        : [[ax, ay], [bx, ay], [bx, by]];
      design.wires.push({
        id: 'W-' + n.id, net: n.id, cls: n.cls, name: n.name, sheet: sheet, pts: pts,
        a: { x: ax, y: ay, d: pa.d, dev: A.id, pin: pa.n, k: pa.k, name: pa.name },
        b: { x: bx, y: by, d: pb.d, dev: B.id, pin: pb.n, k: pb.k, name: pb.name }
      });
    });
    design.junctions = design.junctions || [];
    design.hops = design.hops || [];
    return design;
  }

  function generate(par) {
    const d = build(par);
    route(d);
    d.wires.forEach(function (w) { const dv = d.devices.find(function (q) { return q.sheet === w.sheet; }); });
    return d;
  }

  /* ============================================================
   * MODES —— 四工况动作矩阵（哪些 DC/DC 参与 / 哪些接触器动作）
   * 依据 docx 3.3 能量传输分配
   * ============================================================ */
  function modes(par) {
    const p = normalize(par);
    const grpA = p.acdcCount / 2, grpD = p.dcdcCount / 2;
    function full(v, n) { return new Array(n).fill(v); }
    return [
      {
        id: 'M1', name: '工况1 · 车辆超级快充（单枪最大 2.25MW）',
        source: 'AC/DC 直供 + 储能柜经 DC/DC 补能',
        rows: [
          { item: 'AC/DC 参与组', val: '全部 ' + grpA + ' 组（AC/DC充车接触器 KA 闭合）', state: full('●', grpA).join(' ') },
          { item: 'DC/DC 参与组', val: '全部 ' + grpD + ' 组 → 该枪（KC 闭合，正向放电）', state: full('●', grpD).join(' ') },
          { item: 'AC/DC 充储能接触器 KB', val: '全部断开（储能不吸收，反而对外放）', state: full('○', grpA).join(' ') },
          { item: '储能柜 KM1/KM2', val: 'KM1 闭合、KM2 断开（正常运行，非预充）', state: '● ○' },
          { item: '枪接触器 KGP/KGN', val: '闭合', state: '● ●' },
          { item: '功率流向', val: 'AC/DC ' + (grpA * p.acdcKw * 2) + 'kW + DC/DC(储能→车) 至单枪 2250kW', state: '电网→车 ; 储能→车' }
        ]
      },
      {
        id: 'M2', name: '工况2 · 储能补能（AC/DC 给储能柜充电）',
        source: 'AC/DC 直供 → 直流母线 → 储能柜',
        rows: [
          { item: 'AC/DC 参与组', val: '全部 ' + grpA + ' 组', state: full('●', grpA).join(' ') },
          { item: 'DC/DC 参与组', val: '全部退出（车辆侧 KC 断开）', state: full('○', grpD).join(' ') },
          { item: 'AC/DC 充储能接触器 KB', val: '闭合（经 DCU 投切到对应直流母线）', state: full('●', grpA).join(' ') },
          { item: 'AC/DC 充车接触器 KA', val: '断开', state: full('○', grpA).join(' ') },
          { item: '储能柜 KM1/KM2', val: 'KM2+R 预充 → KM1 闭合、KM2 断开', state: '→● ○' },
          { item: '枪接触器 KGP/KGN', val: '断开', state: '○ ○' },
          { item: '功率流向', val: '电网→AC/DC→直流母线→储能柜电池', state: '电网→储能' }
        ]
      },
      {
        id: 'M3', name: '工况3 · 低温大倍率脉冲加热（单枪最大 1.1MW）',
        source: '两个储能柜共同支持（SOC 需 ≤50%）',
        rows: [
          { item: 'AC/DC 参与组', val: '不参与（由储能放电）', state: full('○', grpA).join(' ') },
          { item: 'DC/DC 参与组', val: '两柜对应组均闭合，按脉冲频率/占空比自主切换充放（约 5Hz）', state: full('◈', grpD).join(' ') },
          { item: '同步要求', val: '多 DC/DC 模块需同频同相，DCU/PMU 统一触发', state: '同步' },
          { item: '储能柜 KM1/KM2', val: 'KM1 闭合（两柜均放电）', state: '● ●' },
          { item: '枪接触器 KGP/KGN', val: '闭合', state: '● ●' },
          { item: '功率流向', val: '储能柜1+储能柜2 → DC/DC（逆向）→ 车（脉冲）', state: '储能→车(脉冲)' }
        ]
      },
      {
        id: 'M4', name: '工况4 · 车辆 + 储能 同时充（分组投切）',
        source: '部分 AC/DC 组供车，其余组供储能',
        rows: [
          { item: 'AC/DC 参与组', val: '示例：组1..组N→车（KA 闭合），组N+1..组' + grpA + '→储能（KB 闭合）', state: 'KA:● KB:●' },
          { item: 'DC/DC 参与组', val: '供车侧组闭合正向放电，其余断开', state: '部分 ●' },
          { item: '储能柜 KM1/KM2', val: '被充柜 KM1 闭合（预充后）', state: '→●' },
          { item: '枪接触器 KGP/KGN', val: '闭合', state: '● ●' },
          { item: '功率流向', val: 'AC/DC 组分两路：一路→车，一路→另一储能柜', state: '电网→车 ; 电网→储能' }
        ]
      }
    ];
  }

  return { VERSION: VERSION, defaults: defaults, normalize: normalize, S: S, P: P, build: build, route: route, generate: generate, modes: modes };
})();

