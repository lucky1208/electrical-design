(function (root, factory) {
  var api = factory(root);
  root.EVSE_CALC = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var STD_RATINGS = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6300];
  var CABLE_TABLE = [
    { size: 2.5, iz: 24 }, { size: 4, iz: 32 }, { size: 6, iz: 41 }, { size: 10, iz: 57 },
    { size: 16, iz: 76 }, { size: 25, iz: 96 }, { size: 35, iz: 119 }, { size: 50, iz: 144 },
    { size: 70, iz: 184 }, { size: 95, iz: 223 }, { size: 120, iz: 257 }, { size: 150, iz: 296 },
    { size: 185, iz: 341 }, { size: 240, iz: 400 }
  ];
  var AMBIENT = [
    { c: 30, f: 1 }, { c: 35, f: 0.94 }, { c: 40, f: 0.87 }, { c: 45, f: 0.79 }, { c: 50, f: 0.71 }
  ];
  var GROUPING = [
    { n: 1, f: 1 }, { n: 2, f: 0.8 }, { n: 3, f: 0.7 }, { n: 4, f: 0.65 }, { n: 5, f: 0.6 }, { n: 6, f: 0.57 }
  ];
  var K_THERMAL = { cu: { pvc: 115, xlpe: 143 }, al: { pvc: 76, xlpe: 94 } };
  var IEC_CURVES = {
    SI: { K: 0.14, a: 0.02, label: 'IEC 标准反时限' },
    VI: { K: 13.5, a: 1, label: 'IEC 非常反时限' },
    EI: { K: 80, a: 2, label: 'IEC 极度反时限' },
    LTI: { K: 120, a: 1, label: 'IEC 长反时限' }
  };
  var DEFAULT_OPTS = {
    acVoltage: 400, pf: 0.95, efficiency: 0.96, ambientC: 35, grouping: 1,
    acCableM: 30, dcCableM: 20, gunCableM: 15, essCableM: 10,
    voltageDropLimitAc: 3, voltageDropLimitDc: 2,
    transformerKva: 1000, transformerZPct: 6, gridIkKa: 20,
    faultClearSec: 0.1, acBreakerIcuKa: 36, dcBreakerIcuKa: 25, gunFuseIcuKa: 25,
    acBreakerA: null, dcBreakerA: null, gunFuseA: null, essBreakerA: null,
    acCableSize: null, dcCableSize: null, gunCableSize: null, essCableSize: null,
    dcIscKa: null, batteryIscKa: null, upstreamBreakerA: null,
    upstreamCurve: 'SI', upstreamPickupA: null, upstreamTms: null,
    downstreamCurve: 'SI', downstreamPickupA: null, downstreamTms: null,
    selectivityMarginSec: 0.2,
    essPowerKw: null, essDod: 0.9, essSoh: 0.8, essCycleLife: 6000, essCyclesPerDay: 1, essRte: 0.88, maxCrate: 0.5,
    thdPct: null, unbalancePct: null, thdLimitPct: 5, unbalanceLimitPct: 2,
    voltageLimitPct: 5, transformerLoadLimitPct: 80,
    airflowM3h: null, temperatureRiseK: 10,
    capexYuan: null, opexYuanPerYear: null, projectYears: 15, discountRate: 0.06,
    annualDischargeMwh: null, degradationPct: 0.02, residualPct: 0.1, targetLcosYuan: null,
    cableMaterial: 'cu', insulation: 'xlpe', dataSource: 'assumption'
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function finite(v) { return typeof v === 'number' && isFinite(v); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function optNum(v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) && n > 0 ? n : null; }
  function optZero(v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) && n >= 0 ? n : null; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function round(v, n) { var k = Math.pow(10, n == null ? 2 : n); return Math.round(v * k) / k; }
  function pct(v) { return round(v * 100, 2); }
  function stdRating(current) {
    if (!(current > 0)) return STD_RATINGS[0];
    for (var i = 0; i < STD_RATINGS.length; i++) if (STD_RATINGS[i] >= current) return STD_RATINGS[i];
    return STD_RATINGS[STD_RATINGS.length - 1];
  }
  function ambientFactor(c) {
    var t = num(c, 35);
    if (t <= 30) return 1;
    for (var i = 0; i < AMBIENT.length; i++) if (t <= AMBIENT[i].c) return AMBIENT[i].f;
    return 0.71;
  }
  function groupFactor(n) {
    var x = Math.max(1, Math.round(num(n, 1)));
    for (var i = 0; i < GROUPING.length; i++) if (x === GROUPING[i].n) return GROUPING[i].f;
    return 0.57;
  }
  function normalizeOpts(o) {
    var x = Object.assign({}, DEFAULT_OPTS, o || {});
    ['acVoltage', 'pf', 'efficiency', 'ambientC', 'grouping', 'acCableM', 'dcCableM', 'gunCableM', 'essCableM',
      'voltageDropLimitAc', 'voltageDropLimitDc', 'transformerKva', 'transformerZPct', 'gridIkKa', 'faultClearSec',
      'acBreakerIcuKa', 'dcBreakerIcuKa', 'gunFuseIcuKa', 'essDod', 'essSoh', 'essCycleLife', 'essCyclesPerDay',
      'essRte', 'maxCrate', 'temperatureRiseK', 'selectivityMarginSec', 'thdLimitPct', 'unbalanceLimitPct',
      'voltageLimitPct', 'transformerLoadLimitPct', 'projectYears', 'discountRate', 'degradationPct', 'residualPct'].forEach(function (k) { x[k] = num(x[k], DEFAULT_OPTS[k]); });
    x.pf = clamp(x.pf, 0.5, 1);
    x.efficiency = clamp(x.efficiency, 0.7, 1);
    x.ambientC = clamp(x.ambientC, 20, 60);
    x.grouping = clamp(Math.round(x.grouping), 1, 6);
    x.acVoltage = Math.max(100, x.acVoltage);
    x.transformerZPct = clamp(x.transformerZPct, 1, 20);
    x.essDod = clamp(x.essDod, 0.1, 1);
    x.essSoh = clamp(x.essSoh, 0.1, 1);
    x.essRte = clamp(x.essRte, 0.5, 1);
    x.maxCrate = Math.max(0.05, x.maxCrate);
    x.selectivityMarginSec = clamp(x.selectivityMarginSec, 0.05, 2);
    x.thdLimitPct = Math.max(0.1, x.thdLimitPct);
    x.unbalanceLimitPct = Math.max(0.1, x.unbalanceLimitPct);
    x.voltageLimitPct = Math.max(0.1, x.voltageLimitPct);
    x.transformerLoadLimitPct = clamp(x.transformerLoadLimitPct, 10, 200);
    x.projectYears = clamp(Math.round(x.projectYears), 1, 40);
    x.discountRate = clamp(x.discountRate, 0, 0.3);
    x.degradationPct = clamp(x.degradationPct, 0, 0.2);
    x.residualPct = clamp(x.residualPct, 0, 1);
    x.cableMaterial = x.cableMaterial === 'al' ? 'al' : 'cu';
    x.insulation = x.insulation === 'pvc' ? 'pvc' : 'xlpe';
    x.upstreamCurve = IEC_CURVES[x.upstreamCurve] ? x.upstreamCurve : 'SI';
    x.downstreamCurve = IEC_CURVES[x.downstreamCurve] ? x.downstreamCurve : 'SI';
    ['acBreakerA', 'dcBreakerA', 'gunFuseA', 'essBreakerA', 'acCableSize', 'dcCableSize', 'gunCableSize', 'essCableSize',
      'dcIscKa', 'batteryIscKa', 'upstreamBreakerA', 'upstreamPickupA', 'upstreamTms', 'downstreamPickupA', 'downstreamTms',
      'essPowerKw', 'airflowM3h', 'capexYuan', 'annualDischargeMwh', 'targetLcosYuan'].forEach(function (k) {
      x[k] = optNum(x[k]);
    });
    x.opexYuanPerYear = optZero(x.opexYuanPerYear);
    x.thdPct = optZero(x.thdPct);
    x.unbalancePct = optZero(x.unbalancePct);
    return x;
  }
  function cableEntry(size) {
    for (var i = 0; i < CABLE_TABLE.length; i++) if (CABLE_TABLE[i].size === size) return CABLE_TABLE[i];
    return null;
  }
  function cableIz(size, opts) { var e = cableEntry(size); return e ? e.iz * ambientFactor(opts.ambientC) * groupFactor(opts.grouping) : null; }
  function selectCable(required, opts, forcedSize) {
    var der = ambientFactor(opts.ambientC) * groupFactor(opts.grouping);
    if (forcedSize) {
      var e0 = cableEntry(forcedSize);
      if (!e0) return { size: forcedSize, izBase: null, iz: 0, derated: false, ok: false, note: '指定截面不在参考表' };
      return { size: e0.size, izBase: e0.iz, iz: e0.iz * der, ambientFactor: ambientFactor(opts.ambientC), groupFactor: groupFactor(opts.grouping), derated: true, ok: e0.iz * der >= required, note: '用户指定截面' };
    }
    for (var i = 0; i < CABLE_TABLE.length; i++) {
      var iz = CABLE_TABLE[i].iz * der;
      if (iz >= required) return { size: CABLE_TABLE[i].size, izBase: CABLE_TABLE[i].iz, iz: iz, ambientFactor: ambientFactor(opts.ambientC), groupFactor: groupFactor(opts.grouping), derated: true, ok: true, note: '' };
    }
    var last = CABLE_TABLE[CABLE_TABLE.length - 1];
    return { size: last.size, izBase: last.iz, iz: last.iz * der, ambientFactor: ambientFactor(opts.ambientC), groupFactor: groupFactor(opts.grouping), derated: true, ok: false, note: '超过参考表最大截面，需并联或母排校核' };
  }
  function voltageDropAC(current, lengthM, size, opts) {
    if (!(current > 0) || !(lengthM > 0) || !(size > 0)) return null;
    var rho = opts.cableMaterial === 'al' ? 0.0282 : 0.0175;
    var r = rho * lengthM / size;
    var x = 0.00008 * lengthM;
    var sin = Math.sqrt(Math.max(0, 1 - opts.pf * opts.pf));
    var du = Math.sqrt(3) * current * (r * opts.pf + x * sin);
    return { volts: du, pct: du / opts.acVoltage * 100 };
  }
  function voltageDropDC(current, lengthM, size, opts) {
    if (!(current > 0) || !(lengthM > 0) || !(size > 0)) return null;
    var rho = opts.cableMaterial === 'al' ? 0.0282 : 0.0175;
    var r = rho * lengthM / size;
    var du = 2 * current * r;
    return { volts: du, pct: du / opts.busVoltage * 100 };
  }
  function thermalMinSize(ikA, tSec, opts) {
    if (!(ikA > 0) || !(tSec > 0)) return null;
    var k = K_THERMAL[opts.cableMaterial][opts.insulation];
    return ikA * 1000 * Math.sqrt(tSec) / k;
  }
  function transformerIsc(kva, zPct, voltage) {
    if (!(kva > 0) || !(zPct > 0) || !(voltage > 0)) return null;
    return kva * 1000 / (Math.sqrt(3) * voltage * (zPct / 100)) / 1000;
  }
  function curveTime(curve, currentA, pickupA, tms) {
    var c = IEC_CURVES[curve] || IEC_CURVES.SI;
    if (!(currentA > pickupA) || !(pickupA > 0) || !(tms > 0)) return null;
    return tms * c.K / (Math.pow(currentA / pickupA, c.a) - 1);
  }
  function designInputs(D, opts) {
    var p = (D && D.params) || {};
    var fam = p.family === 'mwess' ? 'mwess' : 'evse';
    var eff = opts.efficiency, pf = opts.pf;
    var acVoltage = opts.acVoltage;
    var out = { family: fam, params: clone(p), acVoltage: acVoltage, busVoltage: num(p.busV, fam === 'mwess' ? 1500 : 750) };
    if (fam === 'mwess') {
      out.acDcKw = Math.max(1, num(p.acdcCount, 6)) * Math.max(1, num(p.acdcKw, 80));
      out.dcDcKw = Math.max(1, num(p.dcdcCount, 24)) * Math.max(1, num(p.dcdcKw, 80));
      out.acPowerKw = out.acDcKw / eff;
      out.acFeeds = Math.max(1, Math.round(num(p.acIn, 2)));
      out.acCurrent = out.acPowerKw * 1000 / (Math.sqrt(3) * acVoltage * pf);
      out.acCurrentPerFeed = out.acCurrent / out.acFeeds;
      out.dcBusCurrent = out.acDcKw * 1000 / out.busVoltage;
      out.guns = Math.max(1, Math.round(num(p.gunCount, 2)));
      out.gunV = Math.max(1, num(p.gunV, out.busVoltage));
      out.gunA = Math.max(1, num(p.gunA, 1500));
      out.essEnergyKwh = Math.max(0, num(p.essCab, 2)) * Math.max(0, num(p.essKwh, 151.5));
      out.convLossKw = out.acPowerKw - out.acDcKw;
    } else {
      out.dcKw = Math.max(1, num(p.kw, 240));
      out.acPowerKw = out.dcKw / eff;
      out.acFeeds = 1;
      out.acCurrent = out.acPowerKw * 1000 / (Math.sqrt(3) * acVoltage * pf);
      out.acCurrentPerFeed = out.acCurrent;
      out.dcBusCurrent = out.dcKw * 1000 / out.busVoltage;
      out.guns = Math.max(1, Math.round(num(p.guns, 2)));
      out.gunV = Math.max(1, num(p.busV, 750));
      out.gunA = Math.max(1, num(p.gunA, 250));
      out.essEnergyKwh = p.ess ? Math.max(0, num(p.essKwh, 200)) : 0;
      out.convLossKw = out.acPowerKw - out.dcKw;
    }
    out.gunPowerKw = out.gunV * out.gunA / 1000;
    out.essPowerKw = optNum(opts.essPowerKw);
    out.hasEss = fam === 'mwess' || !!p.ess;
    return out;
  }
  function add(list, item) { list.push(item); return item; }
  function statusOf(ok, warn) { return ok ? 'pass' : (warn ? 'warn' : 'fail'); }
  function src(id) { return id; }
  function result(id, cat, title, status, value, unit, detail, sourceIds, assumptions, formula, remediation) {
    return { id: id, cat: cat, title: title, status: status, value: value == null ? '' : value, unit: unit || '', detail: detail || '', sourceIds: sourceIds || [], assumptions: assumptions || [], formula: formula || '', remediation: remediation || '' };
  }
  function circuitResult(prefix, title, circuit, opts) {
    var out = [];
    var required = circuit.breakerA || stdRating(circuit.current * 1.1);
    var cable = selectCable(required, opts, circuit.forcedSize);
    var vd = circuit.dc
      ? voltageDropDC(circuit.current, circuit.length, cable.size, Object.assign({}, opts, { busVoltage: circuit.voltage }))
      : voltageDropAC(circuit.current, circuit.length, cable.size, opts);
    var limit = circuit.limit;
    var cableOk = cable.ok && (cable.iz >= required);
    out.push(result(prefix + '-CABLE', '电缆与载流', title + '电缆截面选择',
      statusOf(cableOk, !cable.ok && cable.size === 240),
      cable.size, 'mm²',
      '设计电流 ' + round(circuit.current, 1) + ' A；保护额定 ' + round(required, 0) + ' A；降容后 Iz ' + round(cable.iz, 1) + ' A' + (cable.note ? '；' + cable.note : ''),
      ['STD-IEC-60364-5-52', 'ASM-CABLE-AMPACITY'],
      ['载流量按 Cu/XLPE C 法参考表，环境 ' + opts.ambientC + '°C，成组 ' + opts.grouping + ' 回路；须以厂家/标准原文复核'],
      'Iz = I_table × k_amb × k_group ≥ In', '增大截面、减少并联回路或调整敷设/环境温度'));
    var vdOk = vd && vd.pct <= limit;
    out.push(result(prefix + '-VDROP', '电缆与载流', title + '电压降',
      vd ? statusOf(vdOk, vd.pct <= limit * 1.2) : 'unknown',
      vd ? round(vd.pct, 2) : '', '%',
      vd ? 'ΔU ' + round(vd.volts, 1) + ' V / 限值 ' + limit + '%；长度 ' + circuit.length + ' m' : '缺少电流/长度/截面',
      ['STD-IEC-60364-5-52'],
      ['按集总参数、忽略并联与谐波；须以现场长度与实测校核'],
      circuit.dc ? 'ΔU = 2·I·ρL/A' : 'ΔU = √3·I·L·(R·cosφ + X·sinφ)', '缩短电缆、增大截面或提高母线电压'));
    return { cable: cable, required: required, vd: vd, results: out };
  }
  function safetyCheck(D) {
    var devices = (D && D.devices) || [];
    var has = function (re) { return devices.some(function (d) { return re.test(String(d.id || '')) || re.test(String(d.tag || '')) || re.test(String(d.name || '')); }); };
    var out = [];
    var ess = !!(D && D.params && (D.params.family === 'mwess' || D.params.ess));
    out.push(result('SAFE-ESTOP', '安全', '急停 / 门禁 / 安全继电器',
      (has(/^SB\d/) && has(/^SQ\d/)) ? (has(/^SR\d/) ? 'pass' : 'warn') : 'fail',
      (has(/^SB\d/) ? 'SB' : '') + (has(/^SQ\d/) ? ' SQ' : '') + (has(/^SR\d/) ? ' SR' : ''),
      '', '急停与门禁硬线链路；MWESS 另需安全继电器', ['STD-GB-18487-1', 'STD-GB-42288'], ['图中符号存在不等于回路动作正确，需接线检查/测试'], '', '补齐急停、门禁、安全继电器与硬线切除路径'));
    out.push(result('SAFE-FIRE', '安全', '储能消防与热失控证据',
      !ess ? 'na' : (has(/^FR\d/) ? 'warn' : 'fail'),
      !ess ? '不适用' : (has(/^FR\d/) ? '消防系统块' : '缺失'),
      '', !ess ? '未配置储能' : '图纸中消防系统为功能块；气体探测、泄压、防火间距、UL 9540A 传播试验报告仍需原始资料',
      ['STD-NFPA-855', 'STD-UL-9540A', 'STD-GB-51048', 'STD-GB-42288'],
      ['消防系统块的存在不代表满足 NFPA 855/GB 51048；需布置图、设备证书、探测与联锁逻辑'],
      '', '补充气体/烟感/温感、泄压、防火间距、水消防与应急联锁证据'));
    out.push(result('SAFE-GAS', '安全', '可燃气体 / 烟感 / 温感探测',
      !ess ? 'na' : (has(/气体|GAS|烟感|温感|可燃/) ? 'pass' : 'warn'),
      !ess ? '不适用' : (has(/气体|GAS|烟感|温感|可燃/) ? '已见' : '未见'),
      '', !ess ? '未配置储能' : 'BESS 舱/柜应独立配置可燃气体、烟感、温感并与消防/通风联锁', ['STD-NFPA-855', 'STD-GB-51048'], ['需厂家消防系统 datasheet 与联锁逻辑'], '', '增加探测点并明确报警/排风/切断策略'));
    var fireVerified = false;
    try {
      var src = root.EVSE_SOURCE;
      if (src && src.list) fireVerified = src.list('test-report').some(function (s) { return /消防|fire|热失控|9540/i.test(String(s.title || '') + ' ' + String(s.scope || '')) && (s.status === 'verified' || s.status === 'ingested'); });
    } catch (e) {}
    out.push(result('SAFE-FIRE-EVIDENCE', '安全', '消防/热失控测试证据', !ess ? 'na' : (fireVerified ? 'pass' : 'unknown'),
      !ess ? '不适用' : (fireVerified ? '已核验' : '缺报告'), '',
      !ess ? '未配置储能' : '需 UL 9540A/消防联锁/气体探测/泄压报告，并由厂家与第三方签字；当前来源登记中无已核验消防测试报告',
      ['TST-FIRE-001', 'STD-UL-9540A', 'STD-NFPA-855', 'STD-GB-51048'], ['来源状态为 pending 时不能视为合规证据'], '', '导入消防/热失控测试报告并关闭 REQ-ESS-001'));
    return out;
  }
  function vendorSafetyCheck(D) {
    var kb = root.EVSE_VENDOR_KB;
    if (!kb || !Array.isArray(kb.G_CHECKS) || !D) return [];
    var fam = D.params && D.params.family;
    if (fam === 'mwess') return [result('SAFE-VENDOR', '安全', '厂家功能安全单元检查', 'na', 'MWESS 未映射', '', '现有 G_CHECKS 面向 EVSE 单机，MWESS 需单独映射', ['KB-VENDOR'], [], '', '')];
    var devices = D.devices || [];
    var missing = [];
    kb.G_CHECKS.forEach(function (g) {
      if (!g.need || !g.need.length) return;
      var ok = g.need.every(function (prefix) { return devices.some(function (d) { return String(d.id || '').indexOf(prefix) === 0 || String(d.tag || '').indexOf(prefix) === 0; }); });
      if (!ok) missing.push(g.id + ' ' + g.title);
    });
    return [result('SAFE-VENDOR', '安全', '厂家功能安全单元检查', missing.length ? 'warn' : 'pass',
      missing.length ? missing.length + ' 项缺失' : '全部命中', '', missing.length ? missing.slice(0, 6).join('；') : 'SC/KF/PEC/CP/EMC 等功能单元齐备',
      ['KB-VENDOR', 'STD-GB-18487-1'],
      ['该检查来自二手厂家对比库，须回溯原始资料与型式试验'],
      '', '补齐缺失的安全检测单元并完成硬线/软件联锁验证')];
  }
  function resilienceCheck(D) {
    var devs = (D && D.devices) || [];
    var count = function (re) { return devs.filter(function (d) { return re.test(String(d.id || '')) || re.test(String(d.tag || '')) || re.test(String(d.name || '')); }).length; };
    var hasEss = !!(D && D.params && (D.params.family === 'mwess' || D.params.ess));
    var out = [];
    var aux = count(/^T[12]$/);
    out.push(result('REL-AUX', '可靠性与单点', '控制/主回路辅助电源分列', aux >= 2 ? 'pass' : 'warn', aux + ' 路', '',
      'T1/T2 分列可降低单电源失效风险', ['STD-GB-42288', 'ASM-PROTECTION'], ['数量不等于冗余，需回路与切换逻辑验证'], '', '增加独立辅源/切换与监视'));
    if (hasEss) {
      var bms = count(/^(BCU|A5)/);
      var imd = count(/^RI\d/);
      out.push(result('REL-BMS', '可靠性与单点', 'BMS/BCU 单点', bms >= 2 ? 'pass' : 'warn', bms + ' 个', '',
        bms >= 2 ? 'BMS/BCU 数量≥2' : '仅 1 个 BMS/BCU，无冗余；需评估单点失效', ['STD-GB-34131', 'STD-GB-42288', 'DS-BMS'], ['需故障树/FMEA 与厂家可靠性数据'], '', '增加冗余或明确降级运行策略'));
      out.push(result('REL-IMD', '可靠性与单点', '绝缘监测单点', imd >= 2 ? 'pass' : 'warn', imd + ' 个', '',
        imd >= 2 ? '双 IMD' : '单 IMD；需自检与失效告警策略（是否强制冗余由项目风险评估决定）', ['STD-GB-34131', 'DS-IMD'], ['单 IMD 不必然违规，需 FMEA/风险评估'], '', '按风险增加冗余/自检'));
    }
    if (D && D.params && D.params.family === 'mwess') {
      var sr = count(/^SR\d/), pmu = count(/^PMU/), dcu = count(/^DCU/);
      out.push(result('REL-CTRL', '可靠性与单点', 'CMS/PMU/DCU 控制链', (sr >= 1 && pmu >= 2 && dcu >= 2) ? 'pass' : 'warn', 'SR' + sr + ' PMU' + pmu + ' DCU' + dcu, '',
        'MWESS 控制链建议 PMU/DCU 双机与安全继电器硬线联锁', ['STD-GB-34131', 'STD-GB-42288'], ['需控制架构图/故障树验证'], '', '补充冗余与切换测试'));
    }
    return out;
  }
  function auditDesign(D, rawOpts) {
    var opts = normalizeOpts(rawOpts);
    var res = [];
    var siteIds = Array.isArray(opts.__sourceIds) ? opts.__sourceIds.slice() : [];
    var siteSrc = siteIds.length ? siteIds : ['SITE-PILOT-001'];
    var inputs = designInputs(D, opts);
    inputs.siteSourceIds = siteIds;
    opts.busVoltage = inputs.busVoltage;
    var acIk = Math.max(num(opts.gridIkKa, 0), num(transformerIsc(opts.transformerKva, opts.transformerZPct, opts.acVoltage), 0));
    var acThermal = acIk > 0 ? thermalMinSize(acIk, opts.faultClearSec, opts) : null;
    var acBreaker = opts.acBreakerA || stdRating(inputs.acCurrentPerFeed);
    var dcBreaker = opts.dcBreakerA || stdRating(inputs.dcBusCurrent);
    var gunRating = opts.gunFuseA || stdRating(inputs.gunA);
    var essCurrent = inputs.essPowerKw ? inputs.essPowerKw * 1000 / inputs.busVoltage : null;
    var circuits = [
      { id: 'AC-IN', title: '交流进线（每路）', current: inputs.acCurrentPerFeed, length: opts.acCableM, voltage: opts.acVoltage, dc: false, limit: opts.voltageDropLimitAc, breakerA: acBreaker, forcedSize: opts.acCableSize, icu: opts.acBreakerIcuKa, ik: acIk, thermal: acThermal },
      { id: 'DC-BUS', title: '直流母线', current: inputs.dcBusCurrent, length: opts.dcCableM, voltage: inputs.busVoltage, dc: true, limit: opts.voltageDropLimitDc, breakerA: dcBreaker, forcedSize: opts.dcCableSize, icu: opts.dcBreakerIcuKa, ik: optNum(opts.dcIscKa), thermal: null },
      { id: 'GUN', title: '充电枪回路', current: inputs.gunA, length: opts.gunCableM, voltage: inputs.gunV, dc: true, limit: opts.voltageDropLimitDc, breakerA: gunRating, forcedSize: opts.gunCableSize, icu: opts.gunFuseIcuKa, ik: optNum(opts.dcIscKa), thermal: null }
    ];
    if (inputs.hasEss && essCurrent) circuits.push({ id: 'ESS', title: '储能支路', current: essCurrent, length: opts.essCableM, voltage: inputs.busVoltage, dc: true, limit: opts.voltageDropLimitDc, breakerA: opts.essBreakerA || stdRating(essCurrent), forcedSize: opts.essCableSize, icu: opts.dcBreakerIcuKa, ik: optNum(opts.batteryIscKa || opts.dcIscKa), thermal: null });
    res.push(result('INPUT-AC', '设计输入', '交流侧计算电流', 'pass', round(inputs.acCurrentPerFeed, 1), 'A', '总交流功率 ' + round(inputs.acPowerKw, 1) + ' kW；' + inputs.acFeeds + ' 路；PF ' + opts.pf + '；效率 ' + opts.efficiency, ['ASM-CONVERSION'], ['效率/功率因数为工程假设'], 'I = P/(√3·U·PF·η)', '用实测 PF/效率修正'));
    res.push(result('INPUT-DC', '设计输入', '直流母线计算电流', 'pass', round(inputs.dcBusCurrent, 1), 'A', '母线电压 ' + inputs.busVoltage + ' V；枪峰值 ' + inputs.gunA + ' A', ['ASM-CONVERSION'], [], 'I = P/U', ''));
    circuits.forEach(function (c) {
      var r = circuitResult(c.id, c.title, c, opts);
      res.push.apply(res, r.results);
      if (c.id === 'AC-IN') {
        var scOk = acIk > 0 ? (acIk <= c.icu) : null;
        var thermalTxt = acThermal == null ? '数据缺失' : (round(acThermal, 1) + ' mm²');
        res.push(result('SC-AC', '短路与保护', '交流侧短路电流与开断能力', scOk == null ? 'unknown' : (scOk ? 'pass' : 'fail'), acIk > 0 ? round(acIk, 2) : '数据缺失', 'kA',
          '电网/变压器估算 Ik=' + (acIk > 0 ? round(acIk, 2) : '—') + ' kA；断路器 Icu=' + c.icu + ' kA；电缆热稳定最小截面 ' + thermalTxt,
          ['STD-IEC-60909', 'ASM-PROTECTION'], ['Ik 由电网或变压器阻抗估算；未做完整阻抗网络与电动机反馈'], 'Ik3 ≈ S/(√3·U·Z)', '获取电网短路容量、变压器阻抗与保护定值；做完整短路计算'));
        var thermalOk = acThermal != null && r.cable.size >= acThermal;
        res.push(result('SC-AC-THERMAL', '短路与保护', '交流电缆短路热稳定', acThermal == null ? 'unknown' : (thermalOk ? 'pass' : 'fail'), acThermal == null ? '数据缺失' : round(acThermal, 1), 'mm²',
          '按 Ik=' + round(acIk, 2) + ' kA、t=' + opts.faultClearSec + ' s、k=' + K_THERMAL[opts.cableMaterial][opts.insulation] + '；所选 ' + r.cable.size + ' mm²',
          ['STD-IEC-60364-5-52', 'STD-IEC-60909'], ['清除时间取假设值；需保护曲线/整定校核'], 'S ≥ Ik·√t / k', '增大截面或缩短清除时间'));
        var acProtOk = (c.breakerA >= inputs.acCurrentPerFeed) && (c.breakerA <= r.cable.iz);
        res.push(result('PROT-AC', '短路与保护', '交流保护与电缆配合', acProtOk ? 'pass' : 'fail', c.breakerA + ' / ' + round(r.cable.iz, 1), 'A',
          'In=' + c.breakerA + ' A；Ib=' + round(inputs.acCurrentPerFeed, 1) + ' A；Iz=' + round(r.cable.iz, 1) + ' A', ['ASM-PROTECTION', 'STD-IEC-60364-5-52'], ['保护额定值为默认/用户输入；需厂家曲线'], 'Ib ≤ In ≤ Iz', '调整保护额定值或电缆截面'));
        var selOk = opts.upstreamBreakerA ? (opts.upstreamBreakerA >= c.breakerA * 1.6) : null;
        res.push(result('PROT-SELECT', '短路与保护', '上下级选择性（启发式）', selOk == null ? 'unknown' : (selOk ? 'pass' : 'warn'), opts.upstreamBreakerA ? opts.upstreamBreakerA + ' / ' + c.breakerA : '未输入', '',
          selOk == null ? '需上级保护额定值与脱扣曲线' : '按 1.6 倍额定比启发式判断，不能替代曲线配合',
          ['STD-IEC-60909', 'ASM-PROTECTION'], ['未使用脱扣曲线/I2t；仅提示'], 'I_up ≥ 1.6·I_down', '导入上级/下级脱扣曲线做选择性研究'));
        var tUp = null, tDown = null, margin = null;
        if (opts.upstreamPickupA && opts.upstreamTms && opts.downstreamPickupA && opts.downstreamTms && acIk > 0) {
          tUp = curveTime(opts.upstreamCurve, acIk * 1000, opts.upstreamPickupA, opts.upstreamTms);
          tDown = curveTime(opts.downstreamCurve, acIk * 1000, opts.downstreamPickupA, opts.downstreamTms);
          if (tUp != null && tDown != null) margin = tUp - tDown;
        }
        var curveStatus = margin == null ? 'unknown' : (margin >= opts.selectivityMarginSec ? 'pass' : (margin > 0 ? 'warn' : 'fail'));
        res.push(result('PROT-CURVE', '短路与保护', '上下级保护曲线配合', curveStatus,
          margin == null ? '参数缺失' : round(margin, 3) + ' s', '',
          margin == null ? '需上级/下级反时限曲线、启动值、TMS 与故障电流' : '故障 Ik=' + round(acIk, 2) + ' kA；上级 ' + opts.upstreamCurve + ' t=' + round(tUp, 3) + ' s；下级 ' + opts.downstreamCurve + ' t=' + round(tDown, 3) + ' s；要求时间级差 ≥ ' + opts.selectivityMarginSec + ' s',
          ['STD-IEC-60255', 'STD-IEC-60909', 'DS-ACB-MCCB'], ['曲线为 IEC 反时限模型；未使用厂家实测曲线/CTI/熔断器 I2t'], 't = TMS·K/((I/Is)^α - 1)', '导入厂家脱扣曲线与整定单，按同一故障电流复核'));
      }
      if (c.id === 'DC-BUS' || c.id === 'GUN' || c.id === 'ESS') {
        var ik = c.ik;
        var dcOk = ik ? (ik <= c.icu) : null;
        res.push(result('SC-' + c.id, '短路与保护', c.title + '短路与开断', dcOk == null ? 'unknown' : (dcOk ? 'pass' : 'fail'), ik ? round(ik, 2) : '数据缺失', 'kA',
          ik ? 'Ik=' + round(ik, 2) + ' kA；保护 Icu=' + c.icu + ' kA' : '缺少电池/变流器原始短路数据或直流侧故障水平',
          ['STD-IEC-60909', 'DS-DC-CONTACTOR', 'DS-FUSE-AR', 'DS-BMS'], ['未做电池簇 Thevenin/厂家短路模型；需 datasheet/试验报告'], 'Icu ≥ Ik', '导入电池/变流器短路数据并做直流短路计算'));
        if (ik) {
          var th = thermalMinSize(ik, opts.faultClearSec, opts);
          res.push(result('SC-' + c.id + '-THERMAL', '短路与保护', c.title + '短路热稳定', r.cable.size >= th ? 'pass' : 'fail', round(th, 1), 'mm²',
            '最小 ' + round(th, 1) + ' mm²；所选 ' + r.cable.size + ' mm²', ['STD-IEC-60364-5-52'], ['清除时间与 k 为假设'], 'S ≥ Ik·√t/k', '增大截面或缩短清除时间'));
        }
        var pOk = (c.breakerA >= c.current) && (c.breakerA <= r.cable.iz);
        res.push(result('PROT-' + c.id, '短路与保护', c.title + '保护与电缆配合', pOk ? 'pass' : 'fail', c.breakerA + ' / ' + round(r.cable.iz, 1), 'A',
          'In=' + c.breakerA + ' A；Ib=' + round(c.current, 1) + ' A；Iz=' + round(r.cable.iz, 1) + ' A', ['ASM-PROTECTION', 'STD-IEC-60364-5-52'], ['保护额定值为默认/用户输入；需厂家曲线'], 'Ib ≤ In ≤ Iz', '调整保护额定值或电缆截面'));
      }
    });
    var trKva = opts.transformerKva > 0 ? opts.transformerKva : null;
    var trReq = inputs.acPowerKw / opts.pf * 1.1;
    res.push(result('TRANSFORMER', '电源与并网', '变压器容量', trKva ? (trKva >= trReq ? 'pass' : 'fail') : 'unknown', round(trReq, 1), 'kVA',
      trKva ? '需求 ' + round(trReq, 1) + ' kVA（含 10% 裕量）；现有 ' + trKva + ' kVA' : '未提供变压器容量/阻抗',
      siteSrc.concat(['STD-IEC-60909']), ['按视在功率与 10% 裕量估算；未考虑同时率、谐波与未来扩容'], 'S_req = P/(PF)·1.1', '导入变压器铭牌/并网协议并复核'));
    var sLoadMva = inputs.acPowerKw / opts.pf / 1000;
    var trLoadPct = trKva ? (sLoadMva * 1000 / trKva * 100) : null;
    res.push(result('TRANSFORMER-LOAD', '电源与并网', '变压器负载率', trLoadPct == null ? 'unknown' : (trLoadPct <= opts.transformerLoadLimitPct ? 'pass' : (trLoadPct <= 100 ? 'warn' : 'fail')), trLoadPct == null ? '数据缺失' : round(trLoadPct, 1), '%',
      trLoadPct == null ? '未提供变压器容量' : '视在负载 ' + round(sLoadMva * 1000, 1) + ' kVA / 变压器 ' + trKva + ' kVA；建议限值 ' + opts.transformerLoadLimitPct + '%',
      siteSrc.concat(['STD-IEC-60909']), ['未考虑同时率、谐波、温升与短时过载'], 'Load% = S_load/S_tr×100', '导入铭牌/负荷曲线；评估扩容或限功率'));
    var sScMva = opts.gridIkKa > 0 ? Math.sqrt(3) * (opts.acVoltage / 1000) * opts.gridIkKa : null;
    if (sScMva && sLoadMva > 0) {
      var scr = sScMva / sLoadMva;
      res.push(result('GRID-SCR', '并网与电能质量', '短路比 SCR', scr >= 3 ? 'pass' : (scr >= 2 ? 'warn' : 'fail'), round(scr, 2), '',
        '并网点 S_sc=' + round(sScMva, 2) + ' MVA；负载 S=' + round(sLoadMva, 2) + ' MVA；SCR<3 视为弱电网筛查阈值',
        ['STD-GB-36547', 'STD-IEEE-1547'].concat(siteSrc), ['SCR 由短路电流反推；弱电网阈值需按当地电网代码/变流器手册确认'], 'SCR = S_sc/S_load', '获取电网短路容量与变流器弱网特性；必要时降低容量或加装支撑'));
      var vPct = 100 * sLoadMva / sScMva;
      res.push(result('GRID-VOLTAGE', '并网与电能质量', '并网点电压变化（筛查）', vPct <= opts.voltageLimitPct ? 'pass' : (vPct <= opts.voltageLimitPct * 1.2 ? 'warn' : 'fail'), round(vPct, 2), '%',
        '近似 ΔU≈S_load/S_sc；限值 ' + opts.voltageLimitPct + '%；未做潮流/多机叠加',
        ['STD-GB-12325', 'STD-IEEE-1547'].concat(siteSrc), ['单机近似；未考虑线路阻抗、变压器分接头、无功补偿与多桩同时率'], 'ΔU% ≈ 100·S_load/S_sc', '导入电网阻抗/线路参数并做潮流计算；配置无功/调压'));
    } else {
      res.push(result('GRID-SCR', '并网与电能质量', '短路比 SCR', 'unknown', '数据缺失', '', '未提供并网点短路电流', ['STD-GB-36547', 'STD-IEEE-1547'].concat(siteSrc), [], 'SCR = S_sc/S_load', '导入电网短路容量'));
      res.push(result('GRID-VOLTAGE', '并网与电能质量', '并网点电压变化（筛查）', 'unknown', '数据缺失', '', '未提供电网阻抗/短路容量', ['STD-GB-12325', 'STD-IEEE-1547'].concat(siteSrc), [], 'ΔU% ≈ 100·S_load/S_sc', '导入电网资料并做潮流计算'));
    }
    var essE = inputs.essEnergyKwh * opts.essDod * opts.essSoh;
    if (!inputs.hasEss) {
      res.push(result('ESS-ENERGY', '储能', '储能容量与功率', 'na', '不适用', '', '未配置储能', [], [], '', ''));
    } else {
      var cRate = inputs.essPowerKw && essE > 0 ? inputs.essPowerKw / essE : null;
      var duration = inputs.essPowerKw && essE > 0 ? essE / inputs.essPowerKw : null;
      res.push(result('ESS-ENERGY', '储能', '可用容量 / C-rate / 时长', cRate == null ? 'unknown' : (cRate <= opts.maxCrate ? 'pass' : 'warn'),
        cRate == null ? '待输入储能功率' : round(cRate, 2) + 'C / ' + round(duration, 1) + 'h', '',
        '额定 ' + round(inputs.essEnergyKwh, 1) + ' kWh；可用 ' + round(essE, 1) + ' kWh（DoD ' + opts.essDod + '，SOH ' + opts.essSoh + '）' + (cRate == null ? '；未输入 PCS/DC-DC 功率' : ''),
        ['ASM-BESS', 'DS-PCS', 'DS-BMS'], ['DoD/SOH/最大 C-rate 为假设；需电池与 PCS datasheet'], 'E_usable=E·DoD·SOH；C=P/E', '导入电池/PCS 手册并做运行策略仿真'));
      var lifeYears = opts.essCycleLife / Math.max(0.01, opts.essCyclesPerDay * 365);
      res.push(result('ESS-LIFE', '储能', '循环寿命与更换周期', lifeYears >= 10 ? 'pass' : 'warn', round(lifeYears, 1), '年',
        '循环寿命 ' + opts.essCycleLife + ' 次；' + opts.essCyclesPerDay + ' 次/日；RTEF ' + opts.essRte,
        ['ASM-BESS', 'DS-BMS'], ['循环寿命/日循环数为假设；未考虑温度/倍率/DoD 加速衰减'], 'Years = N_cycle/(365·n_day)', '导入电池老化曲线与运行策略'));
    }
    var lossKw = Math.max(0, inputs.convLossKw);
    var airflowReq = opts.temperatureRiseK > 0 ? 2984 * lossKw / opts.temperatureRiseK : null;
    res.push(result('THERMAL', '热与损耗', '变流器损耗与通风需求', opts.airflowM3h ? (opts.airflowM3h >= airflowReq ? 'pass' : 'fail') : 'unknown',
      airflowReq ? round(airflowReq, 0) : '', 'm³/h',
      '估算损耗 ' + round(lossKw, 1) + ' kW；ΔT=' + opts.temperatureRiseK + ' K；' + (opts.airflowM3h ? '现有风量 ' + opts.airflowM3h + ' m³/h' : '未提供风量/液冷能力'),
      ['ASM-CONVERSION', 'DS-PCS'], ['仅按空气显热估算，未计算柜体传热、海拔、液冷、太阳辐射'], 'Q ≈ 2984·P_loss/ΔT', '导入热仿真/液冷 datasheet 并复核'));
    var thdOk = opts.thdPct == null ? null : opts.thdPct <= opts.thdLimitPct;
    var unbOk = opts.unbalancePct == null ? null : opts.unbalancePct <= opts.unbalanceLimitPct;
    var pqStatus = (thdOk == null && unbOk == null) ? 'unknown' : ((thdOk === false || unbOk === false) ? 'fail' : ((thdOk == null || unbOk == null) ? 'warn' : 'pass'));
    var pqVal = (opts.thdPct == null ? 'THD 缺少' : 'THD ' + opts.thdPct + '%') + ' / ' + (opts.unbalancePct == null ? '不平衡 缺少' : '不平衡 ' + opts.unbalancePct + '%');
    res.push(result('POWER-QUALITY', '并网与电能质量', '谐波 / 三相不平衡', pqStatus, pqVal, '',
      '限值：THD ≤ ' + opts.thdLimitPct + '%，不平衡 ≤ ' + opts.unbalanceLimitPct + '%；仍需背景谐波、变流器频谱与闪变/防孤岛研究',
      ['STD-GB-14549', 'STD-GB-12325', 'STD-GB-12326', 'STD-IEEE-519'].concat(siteSrc), ['限值为筛查阈值；电网/项目适用条款需按并网协议确认'], '', '导入电能质量实测与变流器谐波数据，做谐波潮流/闪变评估'));
    res.push(result('GRID-PROTECTION', '并网与电能质量', '并网保护与防孤岛', 'unknown', '待电网定值', '', '需按当地电网代码配置过/欠压、过/欠频、防孤岛、过流与零序保护，并提交定值单', ['STD-GB-36547', 'STD-IEEE-1547'], [], '', '导入并网协议/定值单并完成继保整定'));
    var annualMwh = opts.annualDischargeMwh || (inputs.hasEss && essE > 0 ? essE * opts.essCyclesPerDay * 365 * opts.essRte / 1000 : null);
    if (opts.capexYuan && opts.opexYuanPerYear != null && annualMwh > 0) {
      var N = opts.projectYears, r = opts.discountRate, deg = opts.degradationPct;
      var pvCost = opts.capexYuan;
      for (var y = 1; y <= N; y++) pvCost += opts.opexYuanPerYear / Math.pow(1 + r, y);
      pvCost -= opts.capexYuan * opts.residualPct / Math.pow(1 + r, N);
      var pvEnergy = 0;
      for (var y2 = 0; y2 < N; y2++) pvEnergy += annualMwh * 1000 * Math.pow(1 - deg, y2) / Math.pow(1 + r, y2);
      var lcos = pvCost / pvEnergy;
      var target = opts.targetLcosYuan;
      var lcosStatus = target ? (lcos <= target ? 'pass' : 'fail') : 'warn';
      res.push(result('LIFE-LCOS', '全寿命', 'LCOS 平准化度电成本', lcosStatus, round(lcos, 3), '元/kWh',
        'CAPEX ' + opts.capexYuan + ' 元；年 OPEX ' + opts.opexYuanPerYear + ' 元；年放电 ' + round(annualMwh, 1) + ' MWh；N=' + N + ' 年，折现 ' + round(opts.discountRate * 100, 1) + '%，衰减 ' + round(deg * 100, 1) + '%/年' + (target ? '；目标 ' + target + ' 元/kWh' : '；未设目标值'),
        ['ECO-PILOT-001', 'OPS-PILOT-001', 'ASM-BESS'], ['未含更换、税费、需量费与辅助服务收益；年放电量由循环数估算', 'CAPEX/OPEX/电价必须来自报价与运行数据'],
        'LCOS = PV(CAPEX+OPEX-残值)/PV(放电量)', '导入报价/电价/运行数据，加入更换与敏感性分析'));
    } else {
      res.push(result('LIFE-LCOS', '全寿命', 'LCOS 平准化度电成本', 'unknown', '待成本数据', '',
        '需 CAPEX、年 OPEX、年放电量；当前数据不足，不能给出 LCOS', ['ECO-PILOT-001', 'OPS-PILOT-001'], ['全寿命评估需要原始报价、电价与运行数据'], '', '导入报价/电价/运行数据，做 LCOS 与敏感性分析'));
    }
    res.push.apply(res, resilienceCheck(D));
    res.push.apply(res, safetyCheck(D));
    res.push.apply(res, vendorSafetyCheck(D));
    try {
      var src = root.EVSE_SOURCE;
      if (src && src.stats) {
        var st = src.stats();
        res.push(result('EVIDENCE', '证据链', '原始来源与要求覆盖', st.openRequirements.length ? 'warn' : 'pass',
          st.verifiedSources + '/' + st.sources, '',
          '已核验来源 ' + st.verifiedSources + ' / ' + st.sources + '；未关闭要求 ' + st.openRequirements.length + ' 项；假设 ' + st.assumptionSources + ' 项',
          ['KB-VENDOR'], ['来源登记中的 metadata/pending 不代表已取得原文或已核验'], '', '导入标准原文、datasheet、现场与测试证据后重新评估'));
      }
    } catch (e) {}
    var counts = { pass: 0, warn: 0, fail: 0, unknown: 0, na: 0 };
    res.forEach(function (r) { counts[r.status] = (counts[r.status] || 0) + 1; });
    var denom = counts.pass + counts.warn + counts.fail + counts.unknown;
    var score = denom ? Math.round(100 * (counts.pass + counts.warn * 0.5) / denom) : 0;
    var resultObj = {
      schema: 'evse-electrical-audit/v1',
      version: VERSION,
      generatedAt: new Date().toISOString(),
      family: inputs.family,
      project: { name: (D && D.params && D.params.name) || '', params: clone((D && D.params) || {}) },
      inputs: inputs,
      assumptions: opts,
      summary: { pass: counts.pass, warn: counts.warn, fail: counts.fail, unknown: counts.unknown, na: counts.na, score: score, scoreLabel: '综合校核分（未知=0，非合规认证）' },
      results: res,
      disclaimer: '方案级预审结果，不替代注册电气工程师复核、并网试验、消防审批与型式试验。'
    };
    resultObj.designHash = hash((D && D.params) || {});
    resultObj.resultHash = hash(resultObj.results);
    return resultObj;
  }
  function toCSV(audit) {
    var rows = [['id', 'category', 'title', 'status', 'value', 'unit', 'detail', 'sources', 'assumptions', 'remediation']];
    ((audit && audit.results) || []).forEach(function (r) {
      rows.push([r.id, r.cat, r.title, r.status, r.value, r.unit, r.detail, (r.sourceIds || []).join('|'), (r.assumptions || []).join('|'), r.remediation]);
    });
    return rows.map(function (r) { return r.map(function (c) { var s = String(c == null ? '' : c); return '"' + s.replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
  }
  function toEvidencePack(D, audit) {
    var src = root.EVSE_SOURCE;
    return {
      schema: 'evse-evidence-pack/v1',
      generatedAt: new Date().toISOString(),
      project: { name: (D && D.params && D.params.name) || '', family: (D && D.params && D.params.family) || 'evse', params: (D && D.params) || {} },
      designHash: audit && audit.designHash,
      resultHash: audit && audit.resultHash,
      audit: audit,
      sources: src && src.exportPack ? src.exportPack() : null,
      disclaimer: '证据包用于专家预审与追溯；原始标准/手册/现场/测试记录须由项目责任人归档并核验。'
    };
  }
  function hash(obj) {
    var s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  return {
    VERSION: VERSION, DEFAULT_OPTS: DEFAULT_OPTS, CABLE_TABLE: CABLE_TABLE, STD_RATINGS: STD_RATINGS, IEC_CURVES: IEC_CURVES,
    normalizeOpts: normalizeOpts, stdRating: stdRating, ambientFactor: ambientFactor, groupFactor: groupFactor,
    cableIz: cableIz, selectCable: selectCable, voltageDropAC: voltageDropAC, voltageDropDC: voltageDropDC,
    thermalMinSize: thermalMinSize, transformerIsc: transformerIsc, curveTime: curveTime, designInputs: designInputs,
    auditDesign: auditDesign, toCSV: toCSV, toEvidencePack: toEvidencePack, hash: hash
  };
});