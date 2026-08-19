/* ============================================================
 * EVSE Drawing Skill — sch_lib 参考图提炼的规则包
 * ------------------------------------------------------------
 * 参考图（国标 60kW 充电桩原理图、欧标储能充电桩电气原理图）是
 * 工程经验证据，不是可执行指令，也不是标准符合性证书。本模块把
 * 复核过的画图规律转换成每次生成都要跑的确定性语义图 / 渲染检查。
 *
 * 明确不学习：不复制参考图中的额定值、接触器顺序、线缆规格、
 * 连接器料号、厂商型号与设备数量；不因文件名含“国标/欧标/美标”
 * 就声明标准合规。
 * ============================================================ */
window.EVSE_DRAWING_SKILL = (function () {
  'use strict';

  const ID = 'EVSE-SCH-LIB-DRAWING-SKILL';
  const VERSION = '2.0.0';
  const BASIS_STATUS = 'REFERENCE_DERIVED—PROFESSIONAL_REVIEW_REQUIRED';
  const DRAWING_KEY = 'ev-schematic';

  const SOURCE_LIBRARY = Object.freeze([
    { id: 'SRC-EV-CN', file: 'sch_lib/国标60kW充电桩原理图.svg', type: 'multiline-schematic', reviewed: true },
    { id: 'SRC-EV-EU', file: 'sch_lib/欧标充电桩电气原理图.svg', type: 'multiline-schematic', reviewed: true }
  ]);

  /* 关键元器件库（js/component-library.js）：PDF/sch_lib 四源提取的组件与约束 */
  const LIB = window.EVSE_COMPONENT_LIB || null;

  const RULES = Object.freeze([
    { id: 'TOP-001', group: 'topology', enforcement: 'BLOCKING', text: '每条边必须连接两个已声明设备端口，禁止自由坐标端点。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'TOP-002', group: 'topology', enforcement: 'BLOCKING', text: '边必须声明网络类别、方向以及电压或通信协议。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'TOP-003', group: 'topology', enforcement: 'BLOCKING', text: '跨 AC/DC 或跨直流域的连接必须经过明确的变换设备（模块、PCS、DC/DC、开关电源）。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'TOP-005', group: 'topology', enforcement: 'BLOCKING', text: '控制/通信网络与功率网络必须分离，控制边不得成为功率路径。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'BUS-001', group: 'topology', enforcement: 'GUIDANCE', text: '直流母线采用连续主干，支路从显式连接点正交接出。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'EVS-001', group: 'protection', enforcement: 'BLOCKING', text: '每把充电枪必须具备独立的直流快熔与正/负极直流接触器。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'EVS-002', group: 'protection', enforcement: 'BLOCKING', text: '每把充电枪必须接入保护接地，PE 不得只依靠颜色表达。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'EVS-003', group: 'protection', enforcement: 'BLOCKING', text: '充电直流母线必须配置绝缘监测与电流采样，并把信号送至控制单元。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'EVS-004', group: 'protection', enforcement: 'BLOCKING', text: '交流进线必须具备隔离、断路、浪涌保护与剩余电流监测节点。', evidence: ['SRC-EV-EU'] },
    { id: 'EVS-005', group: 'interface', enforcement: 'BLOCKING', text: '充电枪的控制与通信端子必须按所选标准标注，且由控制器/通信控制器驱动。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'ESS-001', group: 'protection', enforcement: 'BLOCKING', text: '每个电池簇必须经过熔断、主接触器与预充单元才能并到储能母线。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'ESS-002', group: 'topology', enforcement: 'BLOCKING', text: '储能直流母线必须经变换设备并入充电直流母线或交流母排，不得直连。', evidence: ['SRC-EV-EU'] },
    { id: 'AUX-001', group: 'protection', enforcement: 'BLOCKING', text: '辅助 24V/12V 必须来自明确的开关电源，不得从功率母线直接取电。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'FED-002', group: 'repetition', enforcement: 'BLOCKING', text: '重复支路（多枪、多电池簇）从模板实例化，位号与目标设备必须唯一。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'TAG-001', group: 'annotation', enforcement: 'BLOCKING', text: '设备、回路及仪表参考代号在项目范围内必须唯一。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'TAG-002', group: 'annotation', enforcement: 'GUIDANCE', text: '额定值必须来自工程数据；未知参数显示“待确认”，不得伪造精确值。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'TAG-003', group: 'annotation', enforcement: 'GUIDANCE', text: '相线、中性线、PE、DC+/DC− 及端子号不得只依赖颜色区分。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'ANN-001', group: 'annotation', enforcement: 'GUIDANCE', text: '电压、电流、容量和线缆规格必须绑定到设备或边，不得成为浮动文本。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'LAY-001', group: 'layout', enforcement: 'GUIDANCE', text: '主能量链保持单一阅读方向：交流进线 → 功率变换 → 直流母线 → 充电枪。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'LAY-002', group: 'layout', enforcement: 'GUIDANCE', text: '线路正交；重复支路等距、同尺寸、同层级。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'LAY-004', group: 'layout', enforcement: 'BLOCKING', text: '线路不得穿过设备、文字、图例或标题栏禁入区。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'LAY-005', group: 'layout', enforcement: 'BLOCKING', text: '真实连接使用连接点；视觉交叉默认不连接并需跨线表达。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'STYLE-001', group: 'style', enforcement: 'GUIDANCE', text: '交流、直流、储能、辅助、控制与通信使用稳定线型并带图例；颜色只能作为辅助。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'GRP-001', group: 'grouping', enforcement: 'GUIDANCE', text: '功能单元（进线柜、功率单元、枪回路、储能舱、二次系统）使用容器边界，成员不得越界漂浮。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] },
    { id: 'DOC-001', group: 'document', enforcement: 'BLOCKING', text: '原理图必须保留图框、图号、修订、状态和编制/校核/批准字段。', evidence: ['SRC-EV-CN', 'SRC-EV-EU'] }
  ]);

  const PROFILES = Object.freeze({
    'ev-schematic': {
      id: 'ev-power-schematic',
      rules: ['TOP-001', 'TOP-002', 'TOP-003', 'TOP-005', 'BUS-001', 'EVS-001', 'EVS-002', 'EVS-003', 'EVS-004', 'EVS-005',
        'ESS-001', 'ESS-002', 'AUX-001', 'FED-002', 'TAG-001', 'TAG-002', 'TAG-003', 'ANN-001',
        'LAY-001', 'LAY-002', 'LAY-004', 'LAY-005', 'STYLE-001', 'GRP-001', 'DOC-001']
    }
  });

  const ruleById = (id) => RULES.find((rule) => rule.id === id);
  const portId = (port) => (typeof port === 'string' ? port : (port && port.id));
  const unique = (items) => Array.from(new Set(items));
  const isPower = (netClass) => /^POWER_/.test(netClass || '');
  const isSignal = (netClass) => /^SIGNAL_/.test(netClass || '');

  function profileFor(drawingKey) {
    return Object.prototype.hasOwnProperty.call(PROFILES, drawingKey) ? PROFILES[drawingKey] : null;
  }
  function rulesFor(drawingKey) {
    const profile = profileFor(drawingKey);
    return profile ? profile.rules.map(ruleById).filter(Boolean).map((rule) => Object.assign({}, rule)) : [];
  }

  function validateGraph(result) {
    const design = result && result.design ? result.design : {};
    const equipment = Array.isArray(design.equipment) ? design.equipment : [];
    const circuits = Array.isArray(design.circuits) ? design.circuits : [];
    const converters = Array.isArray(design.domainConverters) ? design.domainConverters : [];
    const checks = [];
    const add = (code, ruleId, ok, severity, detail, evidence) => checks.push({
      code, ruleId, ok: !!ok, status: ok ? 'CHECKED' : 'VIOLATION', severity, detail, evidence: evidence || []
    });

    const ids = equipment.map((item) => item.id).filter(Boolean);
    const refs = equipment.map((item) => item.referenceDesignation || item.ref).filter(Boolean);
    const circuitIds = circuits.map((item) => item.id).filter(Boolean);
    const circuitRefs = circuits.map((item) => item.referenceDesignation || item.ref).filter(Boolean);
    const byId = {};
    equipment.forEach((item) => { if (item && item.id) byId[item.id] = item; });
    const byKind = (kind) => equipment.filter((item) => item.kind === kind);

    add('E004-EQUIPMENT-ID', 'TAG-001', ids.length === equipment.length && ids.length === unique(ids).length, 'ERROR', '设备 ID 必须存在且唯一。', ids);
    add('E004-REFERENCE', 'TAG-001', refs.length === equipment.length && refs.length === unique(refs).length, 'ERROR', '设备参考代号必须存在且唯一。', refs);
    add('E004-CIRCUIT-ID', 'FED-002', circuitIds.length === circuits.length && circuitIds.length === unique(circuitIds).length, 'ERROR', '回路 ID 必须存在且唯一。', circuitIds);
    add('E004-CIRCUIT-REFERENCE', 'FED-002', circuitRefs.length === circuits.length && circuitRefs.length === unique(circuitRefs).length, 'ERROR', '回路参考代号必须存在且唯一。', circuitRefs);

    const missingPorts = equipment.filter((item) => Number(item.quantity || 0) > 0 && (!Array.isArray(item.ports) || !item.ports.length));
    add('E001-EQUIPMENT-PORTS', 'TOP-001', missingPorts.length === 0, 'ERROR', '所有在用设备必须声明命名端口。', missingPorts.map((item) => item.id));

    const badEndpoints = [], badPortRefs = [], badSemantics = [], badNetClasses = [], badDirections = [];
    const connectedPorts = new Set();
    circuits.forEach((edge) => {
      const from = byId[edge.from], to = byId[edge.to];
      if (!from || !to) badEndpoints.push(edge.id);
      if (from) {
        const port = new Map((from.ports || []).map((item) => [portId(item), item])).get(edge.fromPort);
        if (!edge.fromPort || !port) badPortRefs.push(edge.id + ':from');
        else {
          connectedPorts.add(from.id + ':' + edge.fromPort);
          if (port.netClass && edge.netClass && port.netClass !== edge.netClass) badNetClasses.push(edge.id + ':from:' + port.netClass + '!=' + edge.netClass);
          if (!['out', 'bidirectional'].includes(port.direction)) badDirections.push(edge.id + ':from:' + port.direction);
        }
      }
      if (to) {
        const port = new Map((to.ports || []).map((item) => [portId(item), item])).get(edge.toPort);
        if (!edge.toPort || !port) badPortRefs.push(edge.id + ':to');
        else {
          connectedPorts.add(to.id + ':' + edge.toPort);
          if (port.netClass && edge.netClass && port.netClass !== edge.netClass) badNetClasses.push(edge.id + ':to:' + port.netClass + '!=' + edge.netClass);
          if (!['in', 'bidirectional'].includes(port.direction)) badDirections.push(edge.id + ':to:' + port.direction);
        }
      }
      const semanticOk = !!edge.netClass && !!edge.direction && (
        edge.kind === 'signal'
          ? !!edge.protocol
          : (edge.netClass === 'PROTECTIVE_EARTH' ? !!edge.service : Number(edge.voltageV) > 0)
      );
      if (!semanticOk) badSemantics.push(edge.id);
    });
    add('E001-EDGE-ENDPOINT', 'TOP-001', badEndpoints.length === 0, 'ERROR', '回路两端必须引用已声明设备。', badEndpoints);
    add('E001-EDGE-PORT', 'TOP-001', badPortRefs.length === 0, 'ERROR', '回路必须连接设备的已声明端口。', badPortRefs);
    add('E002-EDGE-SEMANTICS', 'TOP-002', badSemantics.length === 0, 'ERROR', '回路必须声明网络类别、方向及电压/协议/服务。', badSemantics);
    add('E002-PORT-NETCLASS', 'TOP-002', badNetClasses.length === 0, 'ERROR', '端口网络类别必须与所接回路一致。', badNetClasses);
    add('E002-PORT-DIRECTION', 'TOP-002', badDirections.length === 0, 'ERROR', '回路方向必须与起点/终点端口方向一致。', badDirections);

    const danglingRequired = [];
    equipment.forEach((item) => (item.ports || []).forEach((port) => {
      if (Number(item.quantity || 0) > 0 && port.required && !connectedPorts.has(item.id + ':' + port.id)) danglingRequired.push(item.id + ':' + port.id);
    }));
    add('E001-REQUIRED-PORT', 'TOP-001', danglingRequired.length === 0, 'ERROR', '在用设备的必接端口不得悬空。', danglingRequired);

    const illegalConverters = equipment.filter((item) => {
      const classes = unique((item.ports || []).map((port) => port.netClass).filter(isPower));
      return classes.length > 1 && !converters.includes(item.kind);
    });
    add('E003-DOMAIN-CONVERSION', 'TOP-003', illegalConverters.length === 0, 'ERROR', '跨 AC/DC 或跨直流域必须由声明的变换设备完成。', illegalConverters.map((item) => item.id));

    const mixedEdges = circuits.filter((edge) => (edge.kind === 'signal' && isPower(edge.netClass)) || (edge.kind === 'electrical' && isSignal(edge.netClass)));
    add('E008-CONTROL-SEPARATION', 'TOP-005', mixedEdges.length === 0, 'ERROR', '控制/通信边不得混入功率网络，功率边不得声明为信号网络。', mixedEdges.map((edge) => edge.id));

    /* ---------- 交流进线保护完整性 ---------- */
    const acKinds = ['ac-isolator', 'ac-breaker', 'surge-protector', 'residual-current-monitor'];
    const missingAc = acKinds.filter((kind) => byKind(kind).length === 0);
    add('E020-AC-PROTECTION', 'EVS-004', missingAc.length === 0, 'ERROR', '交流进线必须包含隔离、断路、浪涌与剩余电流监测设备。', missingAc);

    /* ---------- 每枪保护完整性 ---------- */
    const branches = (design.topology && Array.isArray(design.topology.gunBranches)) ? design.topology.gunBranches : [];
    const connectors = byKind('charge-connector');
    add('E021-GUN-BRANCH', 'FED-002', branches.length === connectors.length && connectors.length > 0, 'ERROR', '每把充电枪必须有一条已实例化的枪支路。', connectors.map((item) => item.id));
    const gunProtectionFaults = [];
    const gunEarthFaults = [];
    const gunSignalFaults = [];
    branches.forEach((branch) => {
      const fuse = byId[branch.fuse];
      const kp = byId[branch.contactorPositive];
      const kn = byId[branch.contactorNegative];
      if (!fuse || fuse.kind !== 'dc-fuse' || !kp || kp.kind !== 'dc-contactor' || !kn || kn.kind !== 'dc-contactor') {
        gunProtectionFaults.push(branch.connector);
      }
      const earth = circuits.some((edge) => edge.to === branch.connector && edge.toPort === 'earth' && edge.netClass === 'PROTECTIVE_EARTH');
      if (!earth) gunEarthFaults.push(branch.connector);
      const control = circuits.some((edge) => edge.to === branch.connector && edge.toPort === 'control' && edge.netClass === 'SIGNAL_CTRL');
      const comm = circuits.some((edge) => edge.to === branch.connector && edge.toPort === 'comm' && edge.netClass === 'SIGNAL_COMM');
      if (!control || !comm) gunSignalFaults.push(branch.connector);
    });
    add('E021-GUN-PROTECTION', 'EVS-001', gunProtectionFaults.length === 0, 'ERROR', '每把充电枪必须有独立快熔和正/负极直流接触器。', gunProtectionFaults);
    add('E022-GUN-EARTH', 'EVS-002', gunEarthFaults.length === 0, 'ERROR', '每把充电枪必须接入 PE 保护接地。', gunEarthFaults);
    add('E023-GUN-INTERFACE', 'EVS-005', gunSignalFaults.length === 0, 'ERROR', '每把充电枪必须有控制导引与通信回路。', gunSignalFaults);

    /* ---------- 直流母线监测 ---------- */
    const imd = byKind('insulation-monitor')[0];
    const sensor = byKind('current-transducer')[0];
    const imdSignal = !!imd && circuits.some((edge) => edge.from === imd.id && edge.fromPort === 'signal');
    const sensorSignal = !!sensor && circuits.some((edge) => edge.from === sensor.id && edge.fromPort === 'signal');
    add('E024-DC-MONITORING', 'EVS-003', imdSignal && sensorSignal, 'ERROR', '直流母线的绝缘监测与电流采样必须送至控制单元。', [imd && imd.id, sensor && sensor.id].filter(Boolean));

    /* ---------- 辅助电源来源 ---------- */
    const auxSources = circuits.filter((edge) => edge.netClass === 'POWER_DC_AUX' && byId[edge.from] && byId[edge.from].kind !== 'aux-psu' && byId[edge.from].kind !== 'aux-busbar');
    add('E025-AUX-SOURCE', 'AUX-001', auxSources.length === 0, 'ERROR', '辅助直流电源必须来自开关电源或辅助母排。', auxSources.map((edge) => edge.id));

    /* ---------- 储能支路 ---------- */
    if (result && result.ess && result.ess.enabled) {
      const clusters = byKind('battery-cluster');
      const unprotected = clusters.filter((cluster) => !circuits.some((edge) => edge.from === cluster.id && byId[edge.to] && byId[edge.to].kind === 'battery-protection'));
      add('E030-ESS-PROTECTION', 'ESS-001', clusters.length > 0 && unprotected.length === 0, 'ERROR', '每个电池簇必须经熔断/主接触器/预充单元并入储能母线。', unprotected.map((item) => item.id));
      const directTie = circuits.filter((edge) => edge.netClass === 'POWER_DC_ESS' && byId[edge.to] && byId[edge.to].kind === 'dc-busbar');
      const converter = equipment.filter((item) => item.kind === 'ess-dcdc' || item.kind === 'ess-pcs');
      add('E031-ESS-CONVERSION', 'ESS-002', directTie.length === 0 && converter.length === 1, 'ERROR', '储能母线必须经 DC/DC 或 PCS 并入，不得直接搭接充电母线。', converter.map((item) => item.id));
    }

    const blocking = checks.filter((check) => !check.ok && check.severity === 'ERROR');
    return {
      status: blocking.length ? 'BLOCKED' : 'CHECKED_WITH_OPEN_PROFESSIONAL_ITEMS',
      checks,
      violations: checks.filter((check) => !check.ok),
      blockingCount: blocking.length,
      checkedCount: checks.length,
      evaluatedRuleIds: unique(checks.map((check) => check.ruleId).filter(Boolean))
    };
  }

  function selectedRuleIds() {
    return PROFILES[DRAWING_KEY].rules.slice();
  }

  function syncRuleCoverage(report) {
    if (!report) return;
    report.selectedRuleIds = unique(report.selectedRuleIds || []);
    report.evaluatedRuleIds = unique(report.evaluatedRuleIds || []);
    report.appliedRuleIds = report.evaluatedRuleIds.slice();
    report.guidanceRuleIds = report.selectedRuleIds.filter((id) => {
      const rule = ruleById(id);
      return rule && rule.enforcement === 'GUIDANCE';
    });
    report.skippedRuleIds = report.selectedRuleIds.filter((id) => !report.evaluatedRuleIds.includes(id)).map((ruleId) => ({
      ruleId,
      reason: (ruleById(ruleId) && ruleById(ruleId).enforcement === 'GUIDANCE')
        ? 'GUIDANCE_ONLY—PROFESSIONAL_VISUAL_REVIEW_REQUIRED'
        : 'NOT_MACHINE_EVALUATED—PROFESSIONAL_REVIEW_REQUIRED'
    }));
  }

  function updateSkillValidation(result) {
    if (!result || !result.drawingSkill) return;
    const report = result.drawingSkill;
    const graphCount = Number((report.graphValidation && report.graphValidation.blockingCount) || 0);
    const renderCount = Number(report.renderBlockingCount || 0);
    const blocked = graphCount + renderCount > 0;
    const record = {
      id: 'DRAW-SKILL-001',
      result: blocked ? 'WARN' : 'CALCULATED',
      rule: 'sch_lib 绘图规则包与语义图/渲染校验',
      ref: ID + '@' + VERSION,
      detail: blocked
        ? '语义图阻断 ' + graphCount + ' 项、渲染阻断 ' + renderCount + ' 项；已阻止导出。'
        : '已执行 ' + report.evaluatedRuleIds.length + ' 条机器可检查规则；其余指导规则和专业适用性仍须人工复核。',
      evidence: report.evaluatedRuleIds.slice()
    };
    result.validation = (result.validation || []).filter((item) => item.id !== record.id).concat(record);
    result.compliance = result.validation;
    if (result.design && result.design.drawingSkill) {
      result.design.drawingSkill.status = report.status;
      result.design.drawingSkill.selectedRuleIds = report.selectedRuleIds.slice();
      result.design.drawingSkill.evaluatedRuleIds = report.evaluatedRuleIds.slice();
      result.design.drawingSkill.appliedRuleIds = report.appliedRuleIds.slice();
    }
    if (result.readiness && result.readiness.release) {
      result.readiness.release.drawingRuleStatus = blocked
        ? 'BLOCKED—DRAWING_INTEGRITY_FAILED'
        : (report.drawingAudits && report.drawingAudits[DRAWING_KEY]
          ? 'GRAPH_AND_RENDER_CHECKED—PROFESSIONAL_REVIEW_REQUIRED'
          : 'GRAPH_CHECKED—VISUAL_REVIEW_REQUIRED');
      result.releaseGate = result.readiness.release;
    }
  }

  function blockReview(result, reason, items) {
    if (!result || !result.readiness) return;
    result.readiness.level = 'CONCEPT_ONLY';
    result.readiness.label = '仅限概念方案，绘图规则校验未通过';
    result.readiness.detail = reason;
    const incoming = items || [];
    const incomingIds = new Set(incoming.map((item) => item.id));
    const retained = (result.readiness.blockingItems || []).filter((item) => !incomingIds.has(item.id));
    const seen = new Set();
    result.readiness.blockingItems = retained.concat(incoming).filter((item) => item && item.id && !seen.has(item.id) && seen.add(item.id));
    if (result.readiness.release) {
      result.readiness.release.reviewPackageAllowed = false;
      result.readiness.release.drawingRuleStatus = 'BLOCKED';
    }
    result.releaseGate = result.readiness.release || result.releaseGate;
  }

  function apply(result) {
    if (!result || typeof result !== 'object') return result;
    const graphValidation = validateGraph(result);
    const ruleIds = selectedRuleIds();
    const sources = unique(ruleIds.flatMap((id) => (ruleById(id) && ruleById(id).evidence) || []));
    const report = {
      id: ID, version: VERSION, basisStatus: BASIS_STATUS,
      status: graphValidation.blockingCount ? 'BLOCKED' : 'ACTIVE',
      note: '规则从 sch_lib 参考图中提炼并叠加项目安全基线；不构成标准符合性或专业签发。',
      profiles: Object.keys(PROFILES).reduce((out, key) => {
        out[key] = { id: PROFILES[key].id, ruleIds: PROFILES[key].rules.slice() };
        return out;
      }, {}),
      selectedRuleIds: ruleIds,
      evaluatedRuleIds: graphValidation.evaluatedRuleIds.slice(),
      appliedRuleIds: graphValidation.evaluatedRuleIds.slice(),
      guidanceRuleIds: [], skippedRuleIds: [],
      sourceIds: sources,
      componentLibrary: LIB ? {
        id: LIB.ID, version: LIB.VERSION,
        components: LIB.COMPONENTS.length,
        mandatory: LIB.COMPONENTS.filter((c) => c.mandatory === true).length,
        constraints: LIB.CONSTRAINTS.length,
        sourceIds: LIB.SOURCES.map((s) => s.id)
      } : null,
      graphValidation,
      drawingAudits: {}
    };
    syncRuleCoverage(report);
    result.drawingSkill = report;
    if (result.design) result.design.drawingSkill = {
      id: report.id, version: report.version, basisStatus: report.basisStatus, status: report.status,
      selectedRuleIds: report.selectedRuleIds.slice(), evaluatedRuleIds: report.evaluatedRuleIds.slice(),
      appliedRuleIds: report.appliedRuleIds.slice(), sourceIds: report.sourceIds.slice()
    };
    if (graphValidation.blockingCount) {
      const items = graphValidation.violations.filter((item) => item.severity === 'ERROR').map((item) => ({
        id: item.code, title: item.detail, status: 'DRAWING_RULE_VIOLATION', detail: (item.evidence || []).join('；')
      }));
      blockReview(result, '语义图未通过 sch_lib 绘图规则校验；必须修正连接、端口和回路后再评审。', items);
      result.warnings = unique((result.warnings || []).concat('绘图规则校验发现阻断项，已禁止导出。'));
    }
    updateSkillValidation(result);
    return result;
  }

  function metadata(result, drawingKey) {
    const profile = profileFor(drawingKey);
    if (!profile) return {
      id: ID, version: VERSION, profile: 'UNKNOWN_DRAWING_PROFILE', basisStatus: BASIS_STATUS,
      selectedRuleIds: [], evaluatedRuleIds: [], appliedRuleIds: [], status: 'BLOCKED'
    };
    const report = result && result.drawingSkill;
    const evaluated = report ? profile.rules.filter((id) => (report.evaluatedRuleIds || []).includes(id)) : [];
    return {
      id: ID, version: VERSION, profile: profile.id, basisStatus: BASIS_STATUS,
      selectedRuleIds: profile.rules.slice(), evaluatedRuleIds: evaluated, appliedRuleIds: evaluated.slice(),
      status: report ? report.status : 'NOT_APPLIED'
    };
  }

  /* 强制规则 LIB-R10 的几何自检：任何电源/信号走线正交交叉，
   * 必须有一条走线以半圆跨越；返回未跨越的交叉点坐标列表。 */
  function unhoppedCrossings(text) {
    const lines = [];
    for (const m of String(text).matchAll(/<line\s+([^>]*?)\/>/g)) {
      const a = (n) => { const h = new RegExp(n + '="([^"]*)"').exec(m[1]); return h ? Number(h[1]) : null; };
      const w = a('stroke-width');
      if (w != null && w <= 0.95) continue; /* 标题栏等细线不参与 */
      lines.push({ x1: a('x1'), y1: a('y1'), x2: a('x2'), y2: a('y2') });
    }
    const hops = [];
    for (const m of String(text).matchAll(/<path d="M([\d.]+),([\d.]+) A\d+,\d+ 0 0,1 \1,([\d.]+)"/g)) {
      hops.push({ x: Number(m[1]), y: (Number(m[2]) + Number(m[3])) / 2 });
    }
    for (const m of String(text).matchAll(/<path d="M([\d.]+),([\d.]+) A\d+,\d+ 0 0,1 ([\d.]+),\2"/g)) {
      hops.push({ x: (Number(m[1]) + Number(m[3])) / 2, y: Number(m[2]) });
    }
    const bad = [];
    const verts = lines.filter((L) => L.x1 === L.x2 && L.y1 !== L.y2);
    const horzs = lines.filter((L) => L.y1 === L.y2 && L.x1 !== L.x2);
    for (const v of verts) {
      for (const h of horzs) {
        const x = v.x1, y = h.y1;
        if (!(y > Math.min(v.y1, v.y2) + 2 && y < Math.max(v.y1, v.y2) - 2)) continue;
        if (!(x > Math.min(h.x1, h.x2) + 2 && x < Math.max(h.x1, h.x2) - 2)) continue;
        if (!hops.some((p) => Math.abs(p.x - x) < 2 && Math.abs(p.y - y) < 2)) bad.push(x + ',' + y);
      }
    }
    return bad;
  }


  /* ============================================================
   * 图 ↔ 网表一致性检查（G050/G051/G052）
   * ------------------------------------------------------------
   * 1.0.13 之前完全缺失这类检查：渲染器绕开工程模型手画图纸，
   * 于是"模型算对了但图画错了"没有任何机制能发现。
   *
   * UNDRAWN_CIRCUITS 是【已知且被接受的缺口】，写在规则包里而不是
   * 渲染器里——渲染器不能自我开脱，缺口只能由规则包评审后登记。
   * 每条都必须写明为什么不作为独立走线出现在图上。
   * ============================================================ */
  const UNDRAWN_CIRCUITS = Object.freeze([
    { re: /^CCT-PM-01$/,        why: '模块交流进线以 L1/L2/L3(/N) 分相扇入表达，不是单根走线' },
    { re: /^CCT-AUX-0[1-4]$/,   why: '辅助电源进线与母排在图上以 WB4 母排 + 立管表达' },
    { re: /^CCT-AUX-0[5-9]$/,   why: '二次设备取电以母排抽头 + 电压标注表达（LIB-R16）' },
    { re: /^SIG-CTL-0[1-7]$/,   why: '接触器线圈/采样回路在符号内部以虚线联动杆表达' },
    { re: /^SIG-COM-0[1-5]$/,   why: '模块与计量通信以 A1↔A2↔A3 短接线表达' },
    { re: /^CCT-G\d+-0[47]$/,   why: '枪负极母线抽头与电子锁供电并入母排/抽头表达' },
    { re: /^SIG-G\d+-0[123]$/,  why: '接触器线圈与电子锁驱动经 A1 硬线，图上以文字注释表达' },
    { re: /^CCT-ESS-AUX$/,      why: 'BMS 取电并入辅助母排抽头' },
    { re: /^SIG-ESS/,           why: '簇级 CAN 以 BAMS 汇总线表达' },
    { re: /^CCT-ESS-\d+-0[12]$/, why: '簇内熔断/接触器/预充以串联符号链表达，非独立走线' },
    { re: /^CCT-ESS-CV[12]$/,   why: '变换器并网支路以 QF2/KM2（或 KC1/FC1）符号链表达' }
  ]);
  const isKnownUndrawn = (id) => UNDRAWN_CIRCUITS.some((e) => e.re.test(id));

  function netlistConsistency(text, result) {
    const design = (result && result.design) || {};
    const declared = (design.circuits || []).map((c) => c.id);
    const wires = Array.from(String(text).matchAll(/<line\s+([^>]*?)\/>/g))
      .map((m) => m[1]).filter((a) => /data-w="1"/.test(a));
    const drawn = new Set();
    const orphans = [];
    const byCircuit = {};
    wires.forEach((a) => {
      const c = /data-circuit="([^"]*)"/.exec(a);
      const r = /data-role="([^"]*)"/.exec(a);
      if (c) {
        drawn.add(c[1]);
        const k = /data-conductor="([^"]*)"/.exec(a);
        const key = k ? c[1] + '/' + k[1] : c[1];
        const num = (n) => { const h = new RegExp(n + '="([^"]*)"').exec(a); return h ? Number(h[1]) : null; };
        (byCircuit[key] = byCircuit[key] || []).push({ x1: num('x1'), y1: num('y1'), x2: num('x2'), y2: num('y2') });
      } else if (!r) orphans.push(a.slice(0, 40));
    });
    /* 半圆跨越弧是导线的组成部分，必须纳入连通性判定，
     * 否则连续两个相邻半圆会把一根完好的导线判成断线。 */
    for (const m of String(text).matchAll(/<path d="M([\d.]+),([\d.]+) A\d+,\d+ 0 0,1 ([\d.]+),([\d.]+)"([^>]*)\/>/g)) {
      const c = /data-circuit="([^"]*)"/.exec(m[5]);
      if (!c) continue;
      const k = /data-conductor="([^"]*)"/.exec(m[5]);
      const key = k ? c[1] + '/' + k[1] : c[1];
      (byCircuit[key] = byCircuit[key] || []).push({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] });
    }
    const missing = declared.filter((id) => !drawn.has(id));
    const unexplained = missing.filter((id) => !isKnownUndrawn(id));
    const ghosts = Array.from(drawn).filter((id) => !declared.includes(id));

    /* 已标注回路的线段必须首尾相连（允许被半圆打断留出 2r 间隙） */
    const broken = [];
    Object.keys(byCircuit).forEach((id) => {
      const segs = byCircuit[id];
      if (segs.length < 2) return;
      /* 容差需覆盖半圆跨越造成的断口（半径最大 3，断口 2r=6，另留裕度） */
      const near = (a, b) => Math.abs(a[0] - b[0]) < 2 && Math.abs(a[1] - b[1]) < 2;
      const seen = [0];
      let grew = true;
      while (grew) {
        grew = false;
        for (let i = 0; i < segs.length; i += 1) {
          if (seen.includes(i)) continue;
          const ends = [[segs[i].x1, segs[i].y1], [segs[i].x2, segs[i].y2]];
          if (seen.some((j) => {
            const e2 = [[segs[j].x1, segs[j].y1], [segs[j].x2, segs[j].y2]];
            return ends.some((p) => e2.some((q) => near(p, q)));
          })) { seen.push(i); grew = true; }
        }
      }
      if (seen.length !== segs.length) broken.push(id + '(' + seen.length + '/' + segs.length + ')');
    });

    return {
      declared: declared.length, drawn: drawn.size,
      missing, unexplained, ghosts, orphans, broken,
      coverage: declared.length ? Math.round(drawn.size / declared.length * 100) : 0
    };
  }

  function auditMarkup(markup, drawingKey, result) {
    const text = String(markup || '');
    const profile = profileFor(drawingKey);
    if (!profile) return {
      drawingKey, profile: 'UNKNOWN_DRAWING_PROFILE', status: 'BLOCKED', blockingCount: 1, evaluatedRuleIds: [],
      checks: [{ code: 'G000-UNKNOWN-PROFILE', ruleId: 'DOC-001', ok: false, severity: 'ERROR', detail: '未知图型 profile，禁止静默按其他图型校验。' }]
    };
    const checks = [];
    const add = (code, ruleId, ok, severity, detail) => checks.push({ code, ruleId, ok: !!ok, severity, detail });
    add('G000-SVG-COMPLETE', 'DOC-001', /^<svg\b/.test(text) && /<\/svg>\s*$/.test(text), 'ERROR', '输出必须是完整 SVG。');
    add('G001-A3', 'DOC-001', /width="420mm"/.test(text) && /height="297mm"/.test(text), 'ERROR', '输出必须保留 A3 物理图幅。');
    add('G002-SKILL-META', 'DOC-001', text.includes('data-drawing-skill="' + ID + '"') && text.includes('data-drawing-profile="' + profile.id + '"'), 'ERROR', 'SVG 必须记录绘图 skill 与图型 profile。');
    add('G003-DOCUMENT-CONTROL', 'DOC-001', /图号:/.test(text) && /修订:/.test(text) && /校核:/.test(text) && /批准:/.test(text), 'ERROR', 'SVG 必须包含文控标题栏。');
    add('G004-UNRESOLVED-TOKEN', 'TAG-002', !/\b(?:undefined|NaN)\b/.test(text), 'ERROR', 'SVG 不得包含未解析占位值。');
    add('G005-LEGEND', 'STYLE-001', /图例|LEGEND/.test(text), 'ERROR', '使用颜色/线型的图纸必须有图例。');
    add('G006-SCHEDULE', 'ANN-001', /设备明细表/.test(text), 'ERROR', '规格型号必须集中到设备明细表，不得只散落在图面。');
    add('G010-AC-PROTECTION', 'EVS-004', /QS1/.test(text) && /QF1/.test(text) && /FV1/.test(text) && /RCM1/.test(text), 'ERROR', '图面必须显示进线隔离、断路、浪涌与剩余电流监测位号。');
    add('G011-DC-MONITOR', 'EVS-003', /RI1/.test(text) && /TA1/.test(text), 'ERROR', '图面必须显示绝缘监测与直流电流传感器位号。');
    add('G012-PE', 'EVS-002', /PE\s*保护接地|保护接地排/.test(text), 'ERROR', '图面必须显示保护接地边界。');
    add('G013-AUX', 'AUX-001', /开关电源/.test(text), 'ERROR', '图面必须显示辅助电源来源。');
    const guns = (result && Array.isArray(result.guns)) ? result.guns : [];
    if (guns.length) {
      const gunTags = guns.every((gun) => text.includes('XS' + gun.index));
      add('G014-GUN-TAGS', 'FED-002', gunTags, 'ERROR', '每把充电枪必须在图面上有唯一位号。');
      const pins = (result.standard && result.standard.controlPins) || [];
      add('G015-GUN-PINS', 'EVS-005', pins.every((pin) => text.includes(pin)), 'ERROR', '充电枪的控制导引端子必须按所选标准标注。');
    }
    if (result && result.ess && result.ess.enabled) {
      add('G020-ESS-PROTECTION', 'ESS-001', /预充/.test(text) && /GB1/.test(text), 'ERROR', '储能支路必须显示电池簇与预充/主接触器回路。');
      add('G021-ESS-CONVERTER', 'ESS-002', /PCS|DC\/DC/.test(text), 'ERROR', '储能必须经变换设备并入，图面须显示该设备。');
    }
    /* 元器件库约束（LIB-Rxx，证据：国标/欧标 PDF + sch_lib 参考图） */
    if (LIB) {
      add('G030-LIB-ESTOP', 'LIB-R05', /急停/.test(text), 'ERROR', '元器件库约束：图面必须含急停节点（急停开关组/AQSF）。');
      add('G031-LIB-PSU', 'LIB-R04', /24V/.test(text) && /12V/.test(text), 'ERROR', '元器件库约束：辅助电源须含 24V 与 12V 两档开关电源。');
      add('G032-LIB-LOCK', 'LIB-R02', (text.match(/电子锁/g) || []).length >= Math.max(1, guns.length), 'ERROR', '元器件库约束：每枪须配电子锁及锁到位反馈。');
      add('G033-LIB-IMD', 'LIB-R01', /绝缘监测|IMD|H100D/.test(text), 'ERROR', '元器件库约束：直流母线须含绝缘监测节点（H100D/IMD 类）。');
      add('G034-LIB-THERMAL', 'LIB-R08', /风扇|风机|液冷|热管理/.test(text), 'ERROR', '元器件库约束：图面须含热管理节点。');
      add('G035-LIB-PE', 'LIB-R07', /PE/.test(text) && /接地/.test(text), 'ERROR', '元器件库约束：保护接地边界必须明确。');
      const essOn = !!(result && result.ess && result.ess.enabled);
      add('G036-LIB-GRID', 'LIB-R09', !essOn || /QF2|KC1/.test(text), 'ERROR', '元器件库约束：储能变换器并网侧须经隔离/分断器件（AC: QF2+KM2；DC: KC1+FC1）。');
      /* ---- 图 ↔ 网表一致性（1.0.13 完全缺失的一类检查） ---- */
      const NC = netlistConsistency(text, result);
      add('G050-NET-COVERAGE', 'TOP-001', NC.unexplained.length === 0, 'ERROR',
        '网表回路必须画出或在规则包中登记为已知缺口：覆盖 ' + NC.drawn + '/' + NC.declared +
        '（' + NC.coverage + '%），未解释缺失 ' + NC.unexplained.length + ' 条' +
        (NC.unexplained.length ? '（' + NC.unexplained.slice(0, 4).join('、') + '）' : '') + '。');
      add('G051-NET-ORPHAN', 'TOP-001', NC.orphans.length === 0 && NC.ghosts.length === 0, 'ERROR',
        '图上每根走线必须可归属：无回路且无角色的走线 ' + NC.orphans.length +
        ' 段；标注了网表中不存在的回路 ' + NC.ghosts.length + ' 条' +
        (NC.ghosts.length ? '（' + NC.ghosts.slice(0, 3).join('、') + '）' : '') + '。');
      add('G052-NET-CONTINUITY', 'TOP-001', NC.broken.length === 0, 'ERROR',
        '同一回路的线段必须首尾相连成通路，不得出现断开的孤立段：' +
        (NC.broken.length ? NC.broken.slice(0, 4).join('、') : '全部连通') + '。');
      const cross = unhoppedCrossings(text);
      add('G037-LIB-CROSS', 'LIB-R10', cross.length === 0, 'ERROR', '强制规则：电源/信号走线正交交叉必须一条走半圆跨越；未处理 ' + cross.length + ' 处（' + cross.slice(0, 4).join(' ') + '）。');
      const needPh = (result && result.standard && result.standard.neutral) ? 4 : 3;
      let busLines = 0;
      for (const m of text.matchAll(/<line\s+([^>]*?)\/>/g)) {
        const a = (n) => { const h = new RegExp(n + '="([^"]*)"').exec(m[1]); return h ? Number(h[1]) : null; };
        const x1 = a('x1'), y1 = a('y1'), x2 = a('x2'), y2 = a('y2');
        if (x1 === x2 && x1 >= 388 && x1 <= 412 && Math.abs(y2 - y1) >= 200) busLines += 1;
      }
      add('G038-LIB-ACBUS', 'LIB-R11', busLines >= needPh, 'ERROR', '强制规则：交流分配母排必须按相分线 L1/L2/L3' + (needPh === 4 ? '/N' : '') + '（检测到 ' + busLines + ' 条分线，要求 ' + needPh + '）。');
      /* LIB-R13：遍历图面设备位号，明细表必须全部列入 */
      const schedSet = new Set();
      ((result && result.schedule) || []).forEach((row) => {
        String(row.tag).split('/').forEach((t) => {
          const rm = t.trim().match(/^([A-Z]+)(\d+)~(\d+)$/);
          if (rm) { for (let i = Number(rm[2]); i <= Number(rm[3]); i += 1) schedSet.add(rm[1] + i); }
          else schedSet.add(t.trim());
        });
      });
      /* 只从 <text> 文本节点提取位号，避免误扫 path 坐标等属性 */
      const textOnly = [...text.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
        .map((m) => m[1].replace(/<[^>]+>/g, '')).join(' ');
      const drawn = new Set();
      for (const m of textOnly.matchAll(/\b(RCM|QS|QF|FV|PJ|KM|WB|TA|RI|RS|FS|SB|SQ|EH|GB|FB|KB|KP|KC|FC|YV|XS|FU|HL|K|M|T|A|F)\d{1,2}[A-Z]?\b/g)) drawn.add(m[0]);
      if (/\bPE\b/.test(textOnly)) drawn.add('PE');
      if (/\bHL\b/.test(textOnly)) drawn.add('HL');
      const missing = [...drawn].filter((t) => !schedSet.has(t));
      add('G039-LIB-SCHED', 'LIB-R13', missing.length === 0, 'ERROR', '强制规则：设备明细表必须遍历列入图面全部设备；缺 ' + missing.length + ' 项（' + missing.slice(0, 6).join(' ') + '）。');
      /* LIB-R12：充电枪控制导引信号必须画出并明确去向（五类枪头通用） */
      const sigOk = /CC1\/CC2→A1/.test(text) || /CP→A2/.test(text) || /CP→A1/.test(text);
      add('G040-LIB-GUNSIGNAL', 'LIB-R12', sigOk, 'ERROR', '强制规则：充电枪控制导引信号（CCS: CP/PP；GB: CC1/CC2/S±）必须画出并标明连接去向（CP→SECC、PP→CCU 等）。');
      /* LIB-R14：图上所有颜色必须在颜色规范白名单内 */
      const allow = (window.EVSE_COLOR_SCHEME && window.EVSE_COLOR_SCHEME.allowlist()) || new Set();
      const norm = (h) => { let v = h.toLowerCase(); if (/^#[0-9a-f]{3}$/.test(v)) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]; return v; };
      const badColors = new Set();
      for (const m of text.matchAll(/(?:stroke|fill)="(#[0-9a-fA-F]{3,8})"/g)) {
        const v = norm(m[1]);
        if (!allow.has(v)) badColors.add(v);
      }
      add('G041-LIB-COLOR', 'LIB-R14', badColors.size === 0, 'ERROR', '强制规则：图上颜色必须出自 EVSE-COLOR-SCHEME；未登记 ' + badColors.size + ' 种（' + [...badColors].slice(0, 5).join(' ') + '）。');
      /* LIB-R16：控制类设备必须明确供电电压与取电来源 */
      const pwrTags = ['A1', 'A2', 'A3', 'A4', 'SB1', 'HL', 'SQ1', 'M2', 'RI1', 'KM1', 'T1', 'T2', 'B1'];
      if (result.ess && result.ess.enabled) pwrTags.push('A5');
      const schedRows = (result && result.schedule) || [];
      const missingPwr = pwrTags.filter((tg) => {
        const row = schedRows.find((r) => r.tag === tg);
        return !row || !/VDC|24V|12V|AC|回路|母线取电|簇供电|线圈/.test(row.spec);
      });
      schedRows.forEach((r) => { if (/^YV/.test(r.tag) && !/24V/.test(r.spec)) missingPwr.push(r.tag); });
      add('G042-LIB-POWER', 'LIB-R16', missingPwr.length === 0, 'ERROR', '强制规则：每个设备必须明确供电电压与取电来源；缺 ' + missingPwr.length + ' 项（' + missingPwr.slice(0, 6).join(' ') + '）。');
      /* LIB-R17：信号线必须设备A→设备B 单独走线，两根信号线不得同向共线重合 */
      const sigSegs = [];
      for (const m2 of text.matchAll(/<line\s+([^>]*?)\/>/g)) {
        const a2 = (n) => { const h = new RegExp(n + '="([^"]*)"').exec(m2[1]); return h ? Number(h[1]) : null; };
        const st = a2('stroke');
        if (st !== '#475569' && st !== '#7c3aed') continue;
        const x1 = a2('x1'), y1 = a2('y1'), x2 = a2('x2'), y2 = a2('y2');
        if (y1 === y2) sigSegs.push({ o: 'h', k: y1, a: Math.min(x1, x2), b: Math.max(x1, x2) });
        else if (x1 === x2) sigSegs.push({ o: 'v', k: x1, a: Math.min(y1, y2), b: Math.max(y1, y2) });
      }
      let dup = 0;
      for (let i2 = 0; i2 < sigSegs.length; i2++) {
        for (let j2 = i2 + 1; j2 < sigSegs.length; j2++) {
          const p2 = sigSegs[i2], q2 = sigSegs[j2];
          if (p2.o === q2.o && p2.k === q2.k && p2.a < q2.b - 1 && q2.a < p2.b - 1) dup += 1;
        }
      }
      add('G043-LIB-NOOVERLAP', 'LIB-R17', dup === 0, 'ERROR', '强制规则：信号线必须单独从设备A接到设备B，两根信号线不得重合/共线重叠（' + dup + ' 处）。');
      /* LIB-R18：信号线必须实线，且禁止穿过设备（设备上方为禁走线区） */
      let dashedSig = 0;
      for (const m3 of text.matchAll(/<line\s+([^>]*?)\/>/g)) {
        const a3 = (n) => { const h = new RegExp(n + '="([^"]*)"').exec(m3[1]); return h ? h[1] : null; };
        const st3 = a3('stroke');
        if ((st3 === '#475569' || st3 === '#7c3aed') && a3('stroke-dasharray')) dashedSig += 1;
      }
      add('G044-LIB-SOLID', 'LIB-R18', dashedSig === 0, 'ERROR', '强制规则：信号线必须走实线，禁止虚线（' + dashedSig + ' 处）。');
      const EQ_RECTS = [[580, 676, 150, 64], [750, 676, 140, 56], [910, 676, 110, 50], [580, 782, 108, 46], [700, 782, 100, 46], [940, 782, 100, 46], [1052, 782, 118, 46], [650, 340, 110, 44], [252, 134, 58, 32], [728, 104, 62, 32], [430, 98, 170, 94], [376, 700, 100, 54], [376, 800, 110, 42], [80, 896, 100, 38], [200, 896, 100, 38], [50, 668, 140, 44], [50, 760, 140, 44]];
      let thruEq = 0;
      for (const m4 of text.matchAll(/<line\s+([^>]*?)\/>/g)) {
        const a4 = (n) => { const h = new RegExp(n + '="([^"]*)"').exec(m4[1]); return h ? Number(h[1]) : null; };
        const st4 = a4('stroke');
        if (st4 !== '#475569' && st4 !== '#7c3aed') continue;
        const x1 = a4('x1'), y1 = a4('y1'), x2 = a4('x2'), y2 = a4('y2');
        for (let t = 1; t < 20; t += 1) {
          const px = x1 + (x2 - x1) * t / 20, py = y1 + (y2 - y1) * t / 20;
          if (EQ_RECTS.some((r) => px > r[0] + 2 && px < r[0] + r[2] - 2 && py > r[1] + 2 && py < r[1] + r[3] - 2)) { thruEq += 1; break; }
        }
      }
      add('G045-LIB-NOEQUIP', 'LIB-R18', thruEq === 0, 'ERROR', '强制规则：设备上方为禁走线区，信号线必须避让（穿设备 ' + thruEq + ' 处）。');
      /* LIB-R19：平行信号线必须上下/左右错开≥6px，禁止并合 */
      const hSegs = [], vSegs = [];
      for (const m5 of text.matchAll(/<line\s+([^>]*?)\/>/g)) {
        const a5 = (n) => { const h = new RegExp(n + '="([^"]*)"').exec(m5[1]); return h ? Number(h[1]) : null; };
        const st5 = a5('stroke');
        if (st5 !== '#475569' && st5 !== '#7c3aed') continue;
        const x1 = a5('x1'), y1 = a5('y1'), x2 = a5('x2'), y2 = a5('y2');
        if (y1 === y2 && Math.abs(x2 - x1) > 30) hSegs.push({ k: y1, a: Math.min(x1, x2), b: Math.max(x1, x2) });
        else if (x1 === x2 && Math.abs(y2 - y1) > 30) vSegs.push({ k: x1, a: Math.min(y1, y2), b: Math.max(y1, y2) });
      }
      let close = 0;
      const proj = (p, q) => p.a < q.b - 4 && q.a < p.b - 4;
      for (let i5 = 0; i5 < hSegs.length; i5++) for (let j5 = i5 + 1; j5 < hSegs.length; j5++) {
        const d = Math.abs(hSegs[i5].k - hSegs[j5].k);
        if (d > 0 && d < 6 && proj(hSegs[i5], hSegs[j5])) close += 1;
      }
      for (let i6 = 0; i6 < vSegs.length; i6++) for (let j6 = i6 + 1; j6 < vSegs.length; j6++) {
        const d = Math.abs(vSegs[i6].k - vSegs[j6].k);
        if (d > 0 && d < 6 && proj(vSegs[i6], vSegs[j6])) close += 1;
      }
      add('G046-LIB-SPACING', 'LIB-R19', close === 0, 'ERROR', '强制规则：平行信号线必须错开≥6px（' + close + ' 处过近）。');
    }
    const blocking = checks.filter((check) => !check.ok && check.severity === 'ERROR');
    return {
      drawingKey, profile: profile.id, status: blocking.length ? 'BLOCKED' : 'CHECKED',
      checks, blockingCount: blocking.length,
      evaluatedRuleIds: unique(checks.map((check) => check.ruleId).filter(Boolean))
    };
  }

  function recordDrawingAudit(result, drawingKey, audit) {
    if (!result || !result.drawingSkill) return;
    result.drawingSkill.drawingAudits[drawingKey] = audit;
    result.drawingSkill.evaluatedRuleIds = unique((result.drawingSkill.evaluatedRuleIds || []).concat((audit && audit.evaluatedRuleIds) || []));
    syncRuleCoverage(result.drawingSkill);
  }

  function finalizeDrawingAudits(result) {
    if (!result || !result.drawingSkill) return result;
    if (result.readiness) {
      result.readiness.blockingItems = (result.readiness.blockingItems || []).filter((item) => !/^DRAWING-/.test(item.id || ''));
    }
    result.warnings = (result.warnings || []).filter((message) => message !== '充电桩原理图未通过绘图 skill 渲染检查，已禁止导出。');
    const drawingAudits = result.drawingSkill.drawingAudits || {};
    if (!drawingAudits[DRAWING_KEY]) {
      drawingAudits[DRAWING_KEY] = {
        drawingKey: DRAWING_KEY, profile: PROFILES[DRAWING_KEY].id, status: 'BLOCKED', blockingCount: 1,
        evaluatedRuleIds: ['DOC-001'],
        checks: [{ code: 'G000-AUDIT-MISSING', ruleId: 'DOC-001', ok: false, severity: 'ERROR', detail: '图纸未完成渲染规则校验。' }]
      };
    }
    result.drawingSkill.drawingAudits = drawingAudits;
    const audits = Object.values(drawingAudits);
    const blocked = audits.filter((audit) => audit && audit.blockingCount > 0);
    result.drawingSkill.renderBlockingCount = blocked.reduce((sum, audit) => sum + audit.blockingCount, 0);
    if (blocked.length) {
      result.drawingSkill.status = 'BLOCKED';
      blockReview(result, '充电桩原理图未通过 sch_lib 绘图规则的渲染前置检查。', blocked.map((audit) => ({
        id: 'DRAWING-' + String(audit.drawingKey || '').toUpperCase(),
        title: audit.drawingKey + ' 渲染规则未通过', status: 'DRAWING_RULE_VIOLATION',
        detail: audit.checks.filter((check) => !check.ok && check.severity === 'ERROR').map((check) => check.code).join('、')
      })));
      result.warnings = unique((result.warnings || []).concat('充电桩原理图未通过绘图 skill 渲染检查，已禁止导出。'));
    } else {
      result.drawingSkill.status = Number((result.drawingSkill.graphValidation && result.drawingSkill.graphValidation.blockingCount) || 0) > 0 ? 'BLOCKED' : 'ACTIVE';
    }
    syncRuleCoverage(result.drawingSkill);
    updateSkillValidation(result);
    return result;
  }

  function canExport(result, drawingKey, format) {
    const report = result && result.drawingSkill;
    if (!report) return { allowed: false, reason: '绘图 skill 报告缺失，禁止导出。', format };
    if (report.graphValidation && report.graphValidation.blockingCount > 0) {
      return { allowed: false, reason: '语义图存在阻断性连接/端口错误，禁止导出。', format };
    }
    if (Number(report.renderBlockingCount || 0) > 0) {
      return { allowed: false, reason: '原理图未通过渲染规则校验，须先修正。', format };
    }
    const audit = report.drawingAudits && report.drawingAudits[drawingKey];
    if (!audit) return { allowed: false, reason: '当前图纸尚未执行渲染规则校验，禁止导出。', format };
    if (audit.blockingCount > 0) return { allowed: false, reason: '当前图纸未通过渲染规则校验，禁止导出。', format };
    return { allowed: true, reason: '允许导出方案级原理图；仍不得作为生产图、施工图或规范符合性证明。', format };
  }

  return {
    ID, VERSION, BASIS_STATUS, DRAWING_KEY, SOURCE_LIBRARY, RULES, PROFILES,
    profileFor, rulesFor, validateGraph, apply, metadata,
    auditMarkup, recordDrawingAudit, finalizeDrawingAudits, canExport
  };
})();
