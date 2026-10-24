(function (root, factory) {
  var api = factory();
  root.EVSE_SOURCE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var VERSION = '1.0.0';
  var STORAGE_KEY = 'evse.sourcePack.v2';
  var TYPES = ['standard', 'datasheet', 'test-report', 'site', 'operational', 'economic', 'incident', 'literature', 'symbol-library', 'assumption'];
  var STATUSES = ['verified', 'ingested', 'metadata', 'pending', 'assumption', 'deprecated'];

  function source(id, type, title, opts) {
    return Object.assign({
      id: id, type: type, title: title, publisher: '', version: '', date: '', status: 'metadata',
      evidenceLevel: 'metadata', scope: '', url: '', license: '', note: '',
      file: '', sha256: '', owner: '', retrievedAt: ''
    }, opts || {});
  }

  var SEED = {
    version: '2026.10-pilot',
    sources: [
      source('STD-GB-18487-1', 'standard', 'GB/T 18487.1 电动汽车传导充电系统 第1部分：通用要求', { publisher: 'SAC', status: 'metadata', evidenceLevel: 'clause-pending', scope: '传导充电系统安全、接口、控制与试验' }),
      source('STD-GB-20234-1', 'standard', 'GB/T 20234.1 电动汽车传导充电用连接装置 第1部分：通用要求', { publisher: 'SAC', status: 'metadata', evidenceLevel: 'clause-pending', scope: '连接装置通用要求' }),
      source('STD-GB-20234-2', 'standard', 'GB/T 20234.2 电动汽车传导充电用连接装置 第2部分：交流充电接口', { publisher: 'SAC', status: 'metadata', evidenceLevel: 'clause-pending', scope: '交流接口' }),
      source('STD-GB-20234-3', 'standard', 'GB/T 20234.3 电动汽车传导充电用连接装置 第3部分：直流充电接口', { publisher: 'SAC', status: 'metadata', evidenceLevel: 'clause-pending', scope: '直流接口' }),
      source('STD-GB-27930', 'standard', 'GB/T 27930 非车载传导式充电机与电动汽车之间的数字通信协议', { publisher: 'SAC', status: 'metadata', evidenceLevel: 'clause-pending', scope: 'CAN 通信协议' }),
      source('STD-GB-34120', 'standard', 'GB/T 34120 电化学储能系统储能变流器技术规范', { publisher: 'SAC', status: 'metadata', evidenceLevel: 'clause-pending', scope: 'PCS 技术规范' }),
      source('STD-GB-34131', 'standard', 'GB/T 34131 电化学储能电站用锂离子电池管理系统技术规范', { publisher: 'SAC', status: 'metadata', evidenceLevel: 'clause-pending', scope: 'BMS 技术规范' }),
      source('STD-GB-36547', 'standard', 'GB/T 36547 电化学储能系统接入电网技术规定', { publisher: 'SAC', status: 'metadata', evidenceLevel: 'clause-pending', scope: '并网技术规定' }),
      source('STD-GB-36548', 'standard', 'GB/T 36548 电化学储能系统接入电网测试规范', { publisher: 'SAC', status: 'metadata', evidenceLevel: 'clause-pending', scope: '并网测试' }),
      source('STD-GB-51048', 'standard', 'GB 51048 电化学储能电站设计规范', { publisher: 'MOHURD', status: 'metadata', evidenceLevel: 'clause-pending', scope: '储能电站设计、布置、消防与安全' }),
      source('STD-GB-42288', 'standard', 'GB/T 42288 电化学储能电站安全规程', { publisher: 'SAC', status: 'metadata', evidenceLevel: 'clause-pending', scope: '储能电站运行安全' }),
      source('STD-IEC-61851-1', 'standard', 'IEC 61851-1 Electric vehicle conductive charging system - Part 1: General requirements', { publisher: 'IEC', status: 'metadata', evidenceLevel: 'clause-pending', scope: '传导充电通用安全' }),
      source('STD-IEC-62196', 'standard', 'IEC 62196 Plugs, socket-outlets, vehicle connectors and vehicle inlets - Conductive charging of electric vehicles', { publisher: 'IEC', status: 'metadata', evidenceLevel: 'clause-pending', scope: '连接器与接口' }),
      source('STD-IEC-62933', 'standard', 'IEC 62933 Electrical energy storage (EES) systems', { publisher: 'IEC', status: 'metadata', evidenceLevel: 'clause-pending', scope: '储能系统安全与并网' }),
      source('STD-IEC-62477', 'standard', 'IEC 62477 Safety requirements for power electronic converter systems and equipment', { publisher: 'IEC', status: 'metadata', evidenceLevel: 'clause-pending', scope: '电力电子变换器安全' }),
      source('STD-IEC-60364-5-52', 'standard', 'IEC 60364-5-52 Low-voltage electrical installations - Selection and erection of wiring systems', { publisher: 'IEC', status: 'metadata', evidenceLevel: 'clause-pending', scope: '导体载流量、敷设与降容' }),
      source('STD-IEC-60909', 'standard', 'IEC 60909 Short-circuit currents in three-phase a.c. systems', { publisher: 'IEC', status: 'metadata', evidenceLevel: 'clause-pending', scope: '短路电流计算' }),
      source('STD-IEC-61000', 'standard', 'IEC 61000 Electromagnetic compatibility (EMC)', { publisher: 'IEC', status: 'metadata', evidenceLevel: 'clause-pending', scope: 'EMC 发射与抗扰度' }),
      source('STD-IEC-62443', 'standard', 'IEC 62443 Industrial communication networks - IT security for networks and systems', { publisher: 'IEC', status: 'metadata', evidenceLevel: 'clause-pending', scope: '工业网络安全' }),
      source('STD-ISO-15118', 'standard', 'ISO 15118 Road vehicles - Vehicle to grid communication interface', { publisher: 'ISO', status: 'metadata', evidenceLevel: 'clause-pending', scope: 'V2G / Plug and Charge 通信' }),
      source('STD-OCPP-2-0-1', 'standard', 'OCPP 2.0.1 Open Charge Point Protocol', { publisher: 'Open Charge Alliance', status: 'metadata', evidenceLevel: 'clause-pending', scope: '充电桩与后台通信、安全与交易' }),
      source('STD-NFPA-855', 'standard', 'NFPA 855 Standard for the Installation of Stationary Energy Storage Systems', { publisher: 'NFPA', status: 'metadata', evidenceLevel: 'clause-pending', scope: '储能布置、防火间距、通风、消防与应急' }),
      source('STD-UL-9540', 'standard', 'UL 9540 Energy Storage Systems and Equipment', { publisher: 'UL', status: 'metadata', evidenceLevel: 'clause-pending', scope: '储能系统与设备安全' }),
      source('STD-UL-9540A', 'standard', 'UL 9540A Test Method for Evaluating Thermal Runaway Fire Propagation in Battery Energy Storage Systems', { publisher: 'UL', status: 'metadata', evidenceLevel: 'clause-pending', scope: '热失控传播测试' }),
      source('STD-IEEE-1547', 'standard', 'IEEE 1547 Standard for Interconnection and Interoperability of Distributed Energy Resources', { publisher: 'IEEE', status: 'metadata', evidenceLevel: 'clause-pending', scope: '分布式电源并网' }),
      source('STD-IEEE-519', 'standard', 'IEEE 519 Recommended Practice and Requirements for Harmonic Control in Electric Power Systems', { publisher: 'IEEE', status: 'metadata', evidenceLevel: 'clause-pending', scope: '谐波与电能质量' }),
      source('STD-IEEE-1584', 'standard', 'IEEE 1584 Guide for Performing Arc-Flash Hazard Calculations', { publisher: 'IEEE', status: 'metadata', evidenceLevel: 'clause-pending', scope: '弧闪边界与防护' }),
      source('DS-ACB-MCCB', 'datasheet', '进线塑壳断路器原始 datasheet（待导入）', { status: 'pending', evidenceLevel: 'none', scope: '脱扣曲线、Icu/Ics、I2t、降容、附件' }),
      source('DS-DC-CONTACTOR', 'datasheet', '直流接触器原始 datasheet（待导入）', { status: 'pending', evidenceLevel: 'none', scope: '额定电压/电流、分断能力、线圈、粘连反馈' }),
      source('DS-FUSE-AR', 'datasheet', 'aR 直流熔断器原始 datasheet（待导入）', { status: 'pending', evidenceLevel: 'none', scope: 'I2t、额定电压、分断能力、降容曲线' }),
      source('DS-SPD', 'datasheet', 'SPD 原始 datasheet（待导入）', { status: 'pending', evidenceLevel: 'none', scope: 'Uc、In、Imax、Up、后备保护' }),
      source('DS-IMD', 'datasheet', '绝缘监测 IMD 原始 datasheet（待导入）', { status: 'pending', evidenceLevel: 'none', scope: '测量范围、响应时间、报警阈值' }),
      source('DS-BMS', 'datasheet', 'BESS BMS/BCU/BMU 原始 datasheet（待导入）', { status: 'pending', evidenceLevel: 'none', scope: '采样、保护、通信、绝缘与继电器' }),
      source('DS-PCS', 'datasheet', 'PCS / 双向 DC-DC 原始 datasheet（待导入）', { status: 'pending', evidenceLevel: 'none', scope: '效率曲线、谐波、过载、并网保护' }),
      source('DS-METER', 'datasheet', '电能表 / 电流互感器原始 datasheet（待导入）', { status: 'pending', evidenceLevel: 'none', scope: '精度、量程、通信、校准' }),
      source('DS-CABLE', 'datasheet', '电缆 / 母排原始 datasheet（待导入）', { status: 'pending', evidenceLevel: 'none', scope: '载流量、阻抗、绝缘、阻燃' }),
      source('DS-CONNECTOR', 'datasheet', '充电连接器原始 datasheet（待导入）', { status: 'pending', evidenceLevel: 'none', scope: '触点、温升、插拔寿命、防护等级' }),
      source('SITE-PILOT-001', 'site', '示范站原始资料包（待导入）', { status: 'pending', evidenceLevel: 'none', scope: '变压器、短路容量、保护定值、平面、电缆长度、环境' }),
      source('OPS-PILOT-001', 'operational', '示范站运行数据（OCPP / BMS / SCADA / 工单，待导入）', { status: 'pending', evidenceLevel: 'none', scope: '充电会话、负荷、告警、故障、维护' }),
      source('ECO-PILOT-001', 'economic', '示范站电价、需量、成本与收益数据（待导入）', { status: 'pending', evidenceLevel: 'none', scope: '电价、需量费、CAPEX/OPEX、衰减与更换' }),
      source('TST-PILOT-001', 'test-report', '示范站 FAT/SAT/并网/EMC 测试报告（待导入）', { status: 'pending', evidenceLevel: 'none', scope: '出厂、现场、并网与 EMC 证据' }),
      source('INC-PILOT-001', 'incident', '储能与充电设施事故/失效案例库（待导入）', { status: 'pending', evidenceLevel: 'none', scope: '热失控、粘连、绝缘、保护误动' }),
      source('ASM-CABLE-AMPACITY', 'assumption', '铜芯 XLPE 电缆参考载流量表（内置示例，待标准原文核验）', { status: 'assumption', evidenceLevel: 'assumption', scope: 'C 法、3 根负载导体、30°C 基准' }),
      source('ASM-CONVERSION', 'assumption', '变流器效率、功率因数、环境温度与敷设降容工程假设', { status: 'assumption', evidenceLevel: 'assumption', scope: '效率 0.96、PF 0.95、环境 35°C、成组 1 回路' }),
      source('ASM-PROTECTION', 'assumption', '保护电器额定值、Icu 与选择性判据默认假设', { status: 'assumption', evidenceLevel: 'assumption', scope: '默认 Icu 36kA/25kA、上下级 1.6 倍启发式' }),
      source('ASM-BESS', 'assumption', 'BESS DoD、SOH、循环寿命、往返效率默认假设', { status: 'assumption', evidenceLevel: 'assumption', scope: 'DoD 0.9、SOH 0.8、6000 循环、RTE 0.88' }),
      source('ASM-SITE-LENGTH', 'assumption', 'AC/DC/储能电缆长度默认假设', { status: 'assumption', evidenceLevel: 'assumption', scope: 'AC 30m、DC 20m、枪 15m、储能 10m' }),
      source('KB-VENDOR', 'literature', '现有厂家对比知识库（二手整理，需回溯原始资料）', { status: 'assumption', evidenceLevel: 'secondary', scope: '功能单元做法与判定规则' }),
      source('KB-MANUAL', 'literature', '现有手册链接索引（仅链接，不含原始参数）', { status: 'metadata', evidenceLevel: 'index-only', scope: 'BOM 手册入口' })
    ],
    requirements: [
      { id: 'REQ-EV-001', title: '充电接口、通信与安全符合目标市场标准', sourceIds: ['STD-GB-18487-1', 'STD-GB-20234-3', 'STD-GB-27930', 'STD-IEC-61851-1'], status: 'partial', note: '符号与引脚画法已编码，条款级证据待导入' },
      { id: 'REQ-CABLE-001', title: '导体载流量、压降与短路热稳定满足安装条件', sourceIds: ['STD-IEC-60364-5-52', 'STD-IEC-60909'], status: 'open', note: '' },
      { id: 'REQ-SC-001', title: '短路电流、保护开断能力与选择性校核', sourceIds: ['STD-IEC-60909', 'DS-ACB-MCCB', 'DS-DC-CONTACTOR', 'DS-FUSE-AR'], status: 'open', note: '' },
      { id: 'REQ-GRID-001', title: '并网电压、频率、谐波、防孤岛与保护满足接入要求', sourceIds: ['STD-GB-36547', 'STD-IEEE-1547', 'STD-IEEE-519'], status: 'open', note: '' },
      { id: 'REQ-ESS-001', title: '储能消防、热失控传播、气体探测与应急满足安全规范', sourceIds: ['STD-NFPA-855', 'STD-UL-9540A', 'STD-GB-51048', 'STD-GB-42288'], status: 'open', note: '' },
      { id: 'REQ-CYBER-001', title: '充电通信、远程运维与支付具备网络安全与互操作证据', sourceIds: ['STD-IEC-62443', 'STD-OCPP-2-0-1', 'STD-ISO-15118'], status: 'open', note: '' },
      { id: 'REQ-TEST-001', title: 'FAT/SAT、并网、EMC 与消防测试证据齐备', sourceIds: ['STD-GB-36548', 'TST-PILOT-001'], status: 'open', note: '' },
      { id: 'REQ-PROC-001', title: '关键器件具备原始 datasheet、证书与采购级参数', sourceIds: ['DS-ACB-MCCB', 'DS-DC-CONTACTOR', 'DS-FUSE-AR', 'DS-BMS', 'DS-PCS'], status: 'open', note: '' },
      { id: 'REQ-LIFE-001', title: '全寿命成本、衰减、维护与更换策略可评估', sourceIds: ['ECO-PILOT-001', 'OPS-PILOT-001'], status: 'open', note: '' }
    ],
    links: []
  };

  var state = null;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  function uniqueIds(arr) { var seen = {}, dup = []; (arr || []).forEach(function (x) { if (!x || !x.id) return; if (seen[x.id]) dup.push(x.id); seen[x.id] = 1; }); return dup; }

  function validatePack(pack) {
    var errors = [], warnings = [];
    if (!pack || typeof pack !== 'object') return { ok: false, errors: ['来源包不是对象'], warnings: warnings };
    var sources = pack.sources || [], reqs = pack.requirements || [], links = pack.links || [];
    if (!Array.isArray(sources) || !Array.isArray(reqs) || !Array.isArray(links)) errors.push('sources/requirements/links 必须是数组');
    var ds = uniqueIds(sources), dr = uniqueIds(reqs);
    if (ds.length) errors.push('来源 ID 重复: ' + ds.join(','));
    if (dr.length) errors.push('要求 ID 重复: ' + dr.join(','));
    sources.forEach(function (s) {
      if (!s.id || !s.type || !s.title) errors.push('来源缺少 id/type/title: ' + (s.id || '(unknown)'));
      if (s.type && TYPES.indexOf(s.type) < 0) errors.push('未知来源类型: ' + s.id + ' / ' + s.type);
      if (s.status && STATUSES.indexOf(s.status) < 0) errors.push('未知来源状态: ' + s.id + ' / ' + s.status);
    });
    reqs.forEach(function (r) {
      if (!r.id || !r.title) errors.push('要求缺少 id/title: ' + (r.id || '(unknown)'));
      if (r.sourceIds && !Array.isArray(r.sourceIds)) errors.push('要求 sourceIds 必须是数组: ' + r.id);
      var known = (state ? state.sources : []).concat(sources, SEED.sources);
      (r.sourceIds || []).forEach(function (sid) { if (!byId(known, sid)) warnings.push('要求引用了未登记来源: ' + r.id + ' -> ' + sid); });
      if (r.status && ['open', 'partial', 'covered', 'na'].indexOf(r.status) < 0) errors.push('未知要求状态: ' + r.id + ' / ' + r.status);
    });
    return { ok: !errors.length, errors: errors, warnings: warnings };
  }

  function upsert(arr, item) {
    var cur = byId(arr, item.id);
    if (!cur) { arr.push(clone(item)); return 'added'; }
    Object.keys(item).forEach(function (k) { if (item[k] !== undefined) cur[k] = clone(item[k]); });
    return 'updated';
  }

  function importPack(pack) {
    var v = validatePack(pack);
    if (!v.ok) { var e = new Error(v.errors.join('; ')); e.validation = v; throw e; }
    var added = 0, updated = 0;
    (pack.sources || []).forEach(function (s) { upsert(state.sources, s) === 'added' ? added++ : updated++; });
    (pack.requirements || []).forEach(function (r) { upsert(state.requirements, r) === 'added' ? added++ : updated++; });
    (pack.links || []).forEach(function (l) { if (!state.links.some(function (x) { return x.from === l.from && x.to === l.to && x.relation === l.relation; })) state.links.push(clone(l)); });
    save();
    return { added: added, updated: updated, warnings: v.warnings, sources: state.sources.length, requirements: state.requirements.length };
  }

  function exportPack() {
    return {
      schema: 'evse-source-pack/v1',
      version: state.version,
      exportedAt: new Date().toISOString(),
      sources: clone(state.sources),
      requirements: clone(state.requirements),
      links: clone(state.links)
    };
  }

  function stats() {
    var byType = {}, byStatus = {}, verified = 0, assumptions = 0, pending = 0;
    state.sources.forEach(function (s) {
      byType[s.type] = (byType[s.type] || 0) + 1;
      byStatus[s.status] = (byStatus[s.status] || 0) + 1;
      if (s.status === 'verified' || s.status === 'ingested') verified++;
      if (s.status === 'assumption') assumptions++;
      if (s.status === 'pending' || s.status === 'metadata') pending++;
    });
    var req = { open: 0, partial: 0, covered: 0, na: 0 };
    state.requirements.forEach(function (r) { req[r.status || 'open'] = (req[r.status || 'open'] || 0) + 1; });
    var totalReq = state.requirements.length;
    return {
      version: state.version,
      sources: state.sources.length,
      requirements: totalReq,
      verifiedSources: verified,
      assumptionSources: assumptions,
      pendingSources: pending,
      byType: byType,
      byStatus: byStatus,
      requirementsByStatus: req,
      evidenceCoverage: state.sources.length ? verified / state.sources.length : 0,
      requirementCoverage: totalReq ? (req.covered || 0) / totalReq : 0,
      openRequirements: state.requirements.filter(function (r) { return r.status !== 'covered' && r.status !== 'na'; }).map(function (r) { return { id: r.id, title: r.title, status: r.status, sourceIds: r.sourceIds || [] }; })
    };
  }

  function trace(id) {
    var s = byId(state.sources, id) || byId(state.requirements, id);
    if (!s) return null;
    var reqs = state.requirements.filter(function (r) { return (r.sourceIds || []).indexOf(id) >= 0; });
    var links = state.links.filter(function (l) { return l.from === id || l.to === id; });
    return { item: s, requirements: reqs, links: links };
  }

  function requirementList() {
    return state.requirements.map(function (r) {
      return Object.assign({}, r, { sources: (r.sourceIds || []).map(function (id) { return byId(state.sources, id) || { id: id, title: '未登记', status: 'missing', type: 'unknown' }; }) });
    });
  }

  function siteData() {
    var out = {}, ids = [];
    state.sources.forEach(function (s) {
      if (s.type === 'site' && s.data && typeof s.data === 'object') {
        var added = false;
        Object.keys(s.data).forEach(function (k) { if (s.data[k] != null && s.data[k] !== '') { out[k] = s.data[k]; added = true; } });
        if (added) ids.push(s.id);
      }
    });
    out.__sourceIds = ids;
    return out;
  }

  function list(type) {
    return state.sources.filter(function (s) { return !type || s.type === type; });
  }

  function hash(obj) {
    var s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  function persist() { save(); }

  function reset() {
    state = clone(SEED);
    save();
    return stats();
  }

  function save() {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: state.version, sources: state.sources, requirements: state.requirements, links: state.links })); } catch (e) {}
  }

  function load() {
    state = clone(SEED);
    if (typeof localStorage === 'undefined') return;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var p = JSON.parse(raw);
      if (p && Array.isArray(p.sources)) {
        p.sources.forEach(function (s) { if (s && s.id) upsert(state.sources, s); });
        (p.requirements || []).forEach(function (r) { if (r && r.id) upsert(state.requirements, r); });
        (p.links || []).forEach(function (l) { if (l && l.from && l.to) state.links.push(l); });
      }
    } catch (e) {}
  }

  load();

  return {
    VERSION: VERSION, TYPES: TYPES, STATUSES: STATUSES,
    list: list, stats: stats, trace: trace, requirementList: requirementList, siteData: siteData,
    validatePack: validatePack, importPack: importPack, exportPack: exportPack,
    reset: reset, persist: persist, hash: hash, byId: function (id) { return byId(state.sources, id) || byId(state.requirements, id); }
  };
});