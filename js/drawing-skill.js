/* ============================================================
 * AIDC Drawing Skill — sch_lib reference-derived rule pack
 * ------------------------------------------------------------
 * The source drawings are evidence, not executable instructions and not a
 * standards certificate.  This module turns reviewed recurring conventions
 * into deterministic graph / drawing checks that run for every generation.
 * ============================================================ */
window.AIDC_DRAWING_SKILL = (function () {
  'use strict';

  const ID = 'AIDC-SCH-LIB-DRAWING-SKILL';
  const VERSION = '1.0.0';
  const BASIS_STATUS = 'REFERENCE_DERIVED—PROFESSIONAL_REVIEW_REQUIRED';

  const SOURCE_LIBRARY = Object.freeze([
    { id: 'SRC-AIDC-TOPOLOGY', file: 'AIDC系统拓扑图.png', type: 'architecture-topology' },
    { id: 'SRC-ESS-01', file: '储能系统图.png', type: 'architecture-topology' },
    { id: 'SRC-ESS-02', file: '储能系统图2.png', type: 'architecture-topology' },
    { id: 'SRC-ESS-03', file: '储能系统图3.png', type: 'functional-block' },
    { id: 'SRC-ESS-WIRING', file: '产品系统拓扑及电池柜接线图.png', type: 'multiline-schematic' },
    { id: 'SRC-AC-RACK', file: 'AC柜直流铜排部分与对应760电池柜连接图.png', type: 'multiline-schematic' },
    { id: 'SRC-MICROGRID', file: '工业园区微电网图.png', type: 'architecture-topology' },
    { id: 'SRC-GRID-AREA', file: '区域侧电网系统拓扑图.png', type: 'architecture-topology' },
    { id: 'SRC-RENEWABLE', file: '风光储分布式新能源并网接入架构图.png', type: 'architecture-topology' },
    { id: 'SRC-EV-CN', file: '国标60kW充电桩原理图.svg', type: 'multiline-schematic' },
    { id: 'SRC-EV-EU', file: '欧标充电桩电气原理图.svg', type: 'multiline-schematic' },
    { id: 'SRC-EV-US', file: '移动充电桩（美标版）电气原理图.png', type: 'multiline-schematic' },
    { id: 'SRC-COMMS-US', file: '移动充电桩（美标版）通讯拓扑图.png', type: 'functional-block' }
  ]);

  const RULES = Object.freeze([
    { id: 'TOP-001', group: 'topology', enforcement: 'BLOCKING', text: '每条边必须连接两个已声明设备端口，禁止自由坐标端点。', evidence: ['SRC-ESS-WIRING', 'SRC-AC-RACK', 'SRC-EV-US'] },
    { id: 'TOP-002', group: 'topology', enforcement: 'BLOCKING', text: '边必须声明介质/网络类别、方向以及适用的电压或工艺服务。', evidence: ['SRC-AIDC-TOPOLOGY', 'SRC-MICROGRID', 'SRC-RENEWABLE'] },
    { id: 'TOP-003', group: 'topology', enforcement: 'BLOCKING', text: '跨电压或 AC/DC 域的连接必须经过明确的变压器或变换设备。', evidence: ['SRC-ESS-01', 'SRC-MICROGRID', 'SRC-RENEWABLE'] },
    { id: 'TOP-005', group: 'topology', enforcement: 'BLOCKING', text: '控制/通信网络与功率网络必须分离，控制边不得成为功率路径。', evidence: ['SRC-ESS-03', 'SRC-MICROGRID', 'SRC-COMMS-US'] },
    { id: 'BUS-001', group: 'topology', enforcement: 'GUIDANCE', text: '母线采用连续主干，支路从显式连接点正交接出。', evidence: ['SRC-ESS-01', 'SRC-ESS-02', 'SRC-AC-RACK'] },
    { id: 'BUS-002', group: 'topology', enforcement: 'BLOCKING', text: 'A/B 独立路径不得在负载前无母联/切换节点直接合并。', evidence: ['SRC-AC-RACK', 'SRC-MICROGRID'] },
    { id: 'FED-001', group: 'protection', enforcement: 'BLOCKING', text: '每个功率支路必须有独立隔离/保护节点或明确标记为待深化。', evidence: ['SRC-ESS-01', 'SRC-ESS-WIRING', 'SRC-AC-RACK'] },
    { id: 'FED-002', group: 'repetition', enforcement: 'BLOCKING', text: '重复支路从模板实例化，位号、端口与目标设备必须唯一。', evidence: ['SRC-ESS-WIRING', 'SRC-AC-RACK'] },
    { id: 'TAG-001', group: 'annotation', enforcement: 'BLOCKING', text: '设备、回路及仪表参考代号在项目范围内必须唯一。', evidence: ['SRC-ESS-WIRING', 'SRC-AC-RACK', 'SRC-EV-US'] },
    { id: 'TAG-002', group: 'annotation', enforcement: 'GUIDANCE', text: '详细图中的额定值应来自工程数据；未知参数必须显示待确认，不得伪造精确值。', evidence: ['SRC-ESS-WIRING', 'SRC-AC-RACK'] },
    { id: 'TAG-003', group: 'annotation', enforcement: 'GUIDANCE', text: '相线、中性线、PE、DC+/DC−及端子号不得只依赖颜色区分。', evidence: ['SRC-ESS-WIRING', 'SRC-AC-RACK', 'SRC-EV-US'] },
    { id: 'ANN-001', group: 'annotation', enforcement: 'GUIDANCE', text: '电压、容量、管径和线缆规格必须绑定到设备或边，不得成为浮动文本。', evidence: ['SRC-ESS-WIRING', 'SRC-AC-RACK', 'SRC-MICROGRID'] },
    { id: 'LAY-001', group: 'layout', enforcement: 'GUIDANCE', text: '主能量链在同一图内保持单一阅读方向。', evidence: ['SRC-AIDC-TOPOLOGY', 'SRC-ESS-01', 'SRC-RENEWABLE'] },
    { id: 'LAY-002', group: 'layout', enforcement: 'GUIDANCE', text: '线路正交；重复支路等距、同尺寸、同层级。', evidence: ['SRC-ESS-01', 'SRC-AC-RACK', 'SRC-COMMS-US'] },
    { id: 'LAY-004', group: 'layout', enforcement: 'BLOCKING', text: '线路不得穿过设备、文字、图例或标题栏禁入区。', evidence: ['SRC-ESS-WIRING', 'SRC-AC-RACK'] },
    { id: 'LAY-005', group: 'layout', enforcement: 'BLOCKING', text: '真实连接使用连接点；视觉交叉默认不连接并需跨线表达。', evidence: ['SRC-ESS-WIRING', 'SRC-AC-RACK', 'SRC-EV-US'] },
    { id: 'STYLE-001', group: 'style', enforcement: 'GUIDANCE', text: '功率、直流、控制/通信使用稳定线型并带图例；颜色只能作为辅助。', evidence: ['SRC-AIDC-TOPOLOGY', 'SRC-MICROGRID', 'SRC-RENEWABLE'] },
    { id: 'GRP-001', group: 'grouping', enforcement: 'GUIDANCE', text: '柜体、功能单元与机房区域使用容器边界，成员不得越界漂浮。', evidence: ['SRC-ESS-03', 'SRC-AC-RACK', 'SRC-COMMS-US'] },
    { id: 'DOC-001', group: 'document', enforcement: 'BLOCKING', text: '系统拓扑、一次图和功能图使用各自模板，且必须保留图框、图号、修订与状态。', evidence: ['SRC-AIDC-TOPOLOGY', 'SRC-ESS-WIRING', 'SRC-COMMS-US'] },
    { id: 'PID-001', group: 'process', enforcement: 'BLOCKING', text: '液冷设备必须通过命名端口组成明确的供/回闭合回路，禁止孤立工艺设备。', evidence: [], basis: 'PROJECT_SAFETY_BASELINE' },
    { id: 'PID-002', group: 'process', enforcement: 'GUIDANCE', text: '工艺线需标方向、服务、管径；仪表/阀门位号必须唯一且绑定测点。', evidence: [], basis: 'PROJECT_SAFETY_BASELINE' }
  ]);

  const PROFILES = Object.freeze({
    architecture: { id: 'architecture-topology', rules: ['TOP-001', 'TOP-002', 'TOP-003', 'TOP-005', 'BUS-001', 'LAY-001', 'LAY-002', 'LAY-004', 'LAY-005', 'STYLE-001', 'GRP-001', 'DOC-001'] },
    'single-line': { id: 'electrical-single-line', rules: ['TOP-001', 'TOP-002', 'TOP-003', 'BUS-001', 'BUS-002', 'FED-001', 'FED-002', 'TAG-001', 'TAG-002', 'TAG-003', 'ANN-001', 'LAY-001', 'LAY-002', 'LAY-004', 'LAY-005', 'STYLE-001', 'DOC-001'] },
    'dual-path': { id: 'electrical-dual-path', rules: ['TOP-001', 'TOP-002', 'BUS-002', 'FED-002', 'TAG-001', 'ANN-001', 'LAY-001', 'LAY-002', 'LAY-004', 'LAY-005', 'STYLE-001', 'DOC-001'] },
    'cooling-pid': { id: 'cooling-pid', rules: ['TOP-001', 'TOP-002', 'TAG-001', 'ANN-001', 'LAY-001', 'LAY-002', 'LAY-004', 'LAY-005', 'STYLE-001', 'GRP-001', 'DOC-001', 'PID-001', 'PID-002'] },
    thermal: { id: 'functional-block', rules: ['TOP-001', 'TOP-002', 'TOP-005', 'TAG-001', 'ANN-001', 'LAY-001', 'LAY-002', 'LAY-004', 'LAY-005', 'STYLE-001', 'GRP-001', 'DOC-001'] }
  });

  const ruleById = (id) => RULES.find((rule) => rule.id === id);
  const portId = (port) => typeof port === 'string' ? port : (port && port.id);
  const unique = (items) => Array.from(new Set(items));

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
    const checks = [];
    const add = (code, ruleId, ok, severity, detail, evidence) => checks.push({
      code, ruleId, ok: !!ok, status: ok ? 'CHECKED' : 'VIOLATION', severity,
      detail, evidence: evidence || []
    });
    const ids = equipment.map((item) => item.id).filter(Boolean);
    const refs = equipment.map((item) => item.referenceDesignation || item.ref).filter(Boolean);
    const circuitIds = circuits.map((item) => item.id).filter(Boolean);
    const circuitRefs = circuits.map((item) => item.referenceDesignation || item.ref).filter(Boolean);
    const byId = {};
    equipment.forEach((item) => { if (item && item.id) byId[item.id] = item; });

    add('E004-EQUIPMENT-ID', 'TAG-001', ids.length === unique(ids).length, 'ERROR', '设备 ID 必须唯一。', ids);
    add('E004-REFERENCE', 'TAG-001', refs.length === equipment.length && refs.length === unique(refs).length, 'ERROR', '设备参考代号必须存在且唯一。', refs);
    add('E004-CIRCUIT-ID', 'FED-002', circuitIds.length === circuits.length && circuitIds.length === unique(circuitIds).length, 'ERROR', '回路 ID 必须存在且唯一。', circuitIds);
    add('E004-CIRCUIT-REFERENCE', 'FED-002', circuitRefs.length === circuits.length && circuitRefs.length === unique(circuitRefs).length, 'ERROR', '回路参考代号必须存在且唯一。', circuitRefs);

    const missingPorts = equipment.filter((item) => Number(item.quantity || 0) > 0 && (!Array.isArray(item.ports) || !item.ports.length));
    add('E001-EQUIPMENT-PORTS', 'TOP-001', missingPorts.length === 0, 'ERROR', '所有在用设备必须声明命名端口。', missingPorts.map((item) => item.id));

    const badEndpoints = [];
    const badPortRefs = [];
    const badSemantics = [];
    const badNetClasses = [];
    const badDirections = [];
    const connectedPorts = new Set();
    circuits.forEach((edge) => {
      const from = byId[edge.from], to = byId[edge.to];
      if (!from || !to) badEndpoints.push(edge.id);
      if (from) {
        const ports = new Map((from.ports || []).map((port) => [portId(port), port]));
        const port = ports.get(edge.fromPort);
        if (!edge.fromPort || !port) badPortRefs.push(edge.id + ':from');
        else {
          connectedPorts.add(from.id + ':' + edge.fromPort);
          if (port.netClass && edge.netClass && port.netClass !== edge.netClass) badNetClasses.push(edge.id + ':from:' + port.netClass + '!=' + edge.netClass);
          if (!['out', 'bidirectional'].includes(port.direction)) badDirections.push(edge.id + ':from:' + port.direction);
        }
      }
      if (to) {
        const ports = new Map((to.ports || []).map((port) => [portId(port), port]));
        const port = ports.get(edge.toPort);
        if (!edge.toPort || !port) badPortRefs.push(edge.id + ':to');
        else {
          connectedPorts.add(to.id + ':' + edge.toPort);
          if (port.netClass && edge.netClass && port.netClass !== edge.netClass) badNetClasses.push(edge.id + ':to:' + port.netClass + '!=' + edge.netClass);
          if (!['in', 'bidirectional'].includes(port.direction)) badDirections.push(edge.id + ':to:' + port.direction);
        }
      }
      if (!edge.netClass || !edge.direction || (edge.kind === 'electrical' && !(Number(edge.voltageKv) > 0)) || (edge.kind === 'pipe' && !edge.medium)) badSemantics.push(edge.id);
    });
    add('E001-EDGE-ENDPOINT', 'TOP-001', badEndpoints.length === 0, 'ERROR', '回路两端必须引用已声明设备。', badEndpoints);
    add('E001-EDGE-PORT', 'TOP-001', badPortRefs.length === 0, 'ERROR', '回路必须连接设备的已声明端口。', badPortRefs);
    add('E002-EDGE-SEMANTICS', 'TOP-002', badSemantics.length === 0, 'ERROR', '回路必须声明网络类别、方向及电压/工艺服务。', badSemantics);
    add('E002-PORT-NETCLASS', 'TOP-002', badNetClasses.length === 0, 'ERROR', '端口网络类别必须与所接回路一致。', badNetClasses);
    add('E002-PORT-DIRECTION', 'TOP-002', badDirections.length === 0, 'ERROR', '回路方向必须与起点/终点端口方向一致。', badDirections);

    const disconnectedRequiredPorts = [];
    equipment.forEach((item) => (item.ports || []).forEach((port) => {
      if (Number(item.quantity || 0) > 0 && port.required && !connectedPorts.has(item.id + ':' + port.id)) disconnectedRequiredPorts.push(item.id + ':' + port.id);
    }));
    add('E001-REQUIRED-PORT', 'TOP-001', disconnectedRequiredPorts.length === 0, 'ERROR', '在用设备的必接端口不得悬空。', disconnectedRequiredPorts);

    const domainConverters = equipment.filter((item) => {
      const classes = unique((item.ports || []).map((port) => port.netClass).filter((name) => /^POWER_/.test(name || '')));
      return classes.length > 1 && !['transformer-bank', 'ups-bank'].includes(item.kind);
    });
    add('E003-DOMAIN-CONVERSION', 'TOP-003', domainConverters.length === 0, 'ERROR', '跨电压/功率域必须由明确的变压或变换设备完成。', domainConverters.map((item) => item.id));

    const mixedControlEdges = circuits.filter((edge) => ['control', 'communication'].includes(edge.kind) && /^POWER_/.test(edge.netClass || ''));
    add('E008-CONTROL-SEPARATION', 'TOP-005', mixedControlEdges.length === 0, 'ERROR', '控制/通信边不得混入功率网络。', mixedControlEdges.map((edge) => edge.id));

    const pathList = design.topology && Array.isArray(design.topology.powerPaths) ? design.topology.powerPaths : [];
    if (pathList.length > 1) {
      const sets = pathList.map((path) => new Set(path.equipment || []));
      const shared = [];
      for (let i = 0; i < sets.length; i += 1) for (let j = i + 1; j < sets.length; j += 1) {
        sets[i].forEach((id) => { if (sets[j].has(id)) shared.push(id); });
      }
      add('E006-PATH-SEPARATION', 'BUS-002', shared.length === 0, 'ERROR', 'A/B 关键路径设备必须独立。', unique(shared));
      const feeds = circuits.filter((edge) => edge.loadType === 'dual-cord-it').map((edge) => edge.from).sort();
      add('E006-DUAL-FEED', 'BUS-002', feeds.includes('EQ-PDU-A') && feeds.includes('EQ-PDU-B'), 'ERROR', '双输入 IT 负荷必须由 PDU-A/PDU-B 独立馈电。', feeds);
    }

    pathList.forEach((path) => {
      const kinds = (path.equipment || []).map((id) => byId[id] && byId[id].kind).filter(Boolean);
      add('E005-PROTECTION-' + path.id, 'FED-001', kinds.includes('mv-switchgear') && kinds.includes('lv-main-switchgear'), 'ERROR', path.id + ' 必须包含中压和低压保护/开关设备。', kinds);
    });

    if (result && result.cooling && result.cooling.isLiquid) {
      const requiredMedia = ['secondary-supply', 'secondary-return', 'primary-supply', 'primary-return', 'condenser-supply', 'condenser-return'];
      const media = circuits.filter((edge) => edge.kind === 'pipe').map((edge) => edge.medium);
      const missingMedia = requiredMedia.filter((name) => !media.includes(name));
      add('E009-COOLING-LOOPS', 'PID-001', missingMedia.length === 0, 'ERROR', '液冷二次侧、一次侧和冷却水侧均须有明确供/回边。', missingMedia);
      const degree = {};
      circuits.filter((edge) => edge.kind === 'pipe').forEach((edge) => {
        degree[edge.from] = (degree[edge.from] || 0) + 1;
        degree[edge.to] = (degree[edge.to] || 0) + 1;
      });
      const orphans = equipment.filter((item) => item.discipline === 'cooling' && Number(item.quantity || 0) > 0 && !degree[item.id]).map((item) => item.id);
      add('E010-COOLING-ORPHAN', 'PID-001', orphans.length === 0, 'ERROR', '液冷工艺设备不得成为孤立图元。', orphans);

      const stronglyConnected = (edges) => {
        const nodes = unique(edges.flatMap((edge) => [edge.from, edge.to]));
        if (!nodes.length) return false;
        const walk = (reverse) => {
          const adjacency = {};
          nodes.forEach((id) => { adjacency[id] = []; });
          edges.forEach((edge) => {
            const a = reverse ? edge.to : edge.from, b = reverse ? edge.from : edge.to;
            if (adjacency[a]) adjacency[a].push(b);
          });
          const seen = new Set(), stack = [nodes[0]];
          while (stack.length) {
            const id = stack.pop();
            if (seen.has(id)) continue;
            seen.add(id);
            (adjacency[id] || []).forEach((next) => stack.push(next));
          }
          return seen.size === nodes.length;
        };
        return walk(false) && walk(true);
      };
      [
        { id: 'SECONDARY', media: ['secondary-supply', 'secondary-return'] },
        { id: 'PRIMARY', media: ['primary-supply', 'primary-return'] },
        { id: 'CONDENSER', media: ['condenser-supply', 'condenser-return'] }
      ].forEach((domain) => {
        const edges = circuits.filter((edge) => edge.kind === 'pipe' && domain.media.includes(edge.medium));
        add('E009-CLOSED-' + domain.id, 'PID-001', stronglyConnected(edges), 'ERROR', domain.id + ' 供回管网必须形成连通的有向闭环。', edges.map((edge) => edge.id));
      });
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

  function selectedRuleIds(result) {
    const keys = ['architecture', 'single-line', 'dual-path', 'thermal'];
    if (result && result.cooling && result.cooling.isLiquid) keys.push('cooling-pid');
    return unique(keys.flatMap((key) => profileFor(key).rules));
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
    const graphCount = Number(report.graphValidation && report.graphValidation.blockingCount || 0);
    const renderCount = Number(report.renderBlockingCount || 0);
    const blocked = graphCount + renderCount > 0;
    const record = {
      id: 'DRAW-SKILL-001',
      result: blocked ? 'WARN' : 'CALCULATED',
      rule: 'sch_lib 绘图规则包与语义图/渲染校验',
      ref: ID + '@' + VERSION,
      detail: blocked
        ? '语义图阻断 ' + graphCount + ' 项、渲染阻断 ' + renderCount + ' 项；已阻止进入专业方案评审。'
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
        : ((Object.keys(report.drawingAudits || {}).length >= 5)
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
    const merged = retained.concat(incoming);
    const seen = new Set();
    result.readiness.blockingItems = merged.filter((item) => item && item.id && !seen.has(item.id) && seen.add(item.id));
    const drawingBlockingCount = result.readiness.blockingItems.filter((item) => /^(?:E\d+|DRAWING-)/.test(item.id || '')).length;
    result.readiness.summary = Object.assign({}, result.readiness.summary, { drawingBlockingCount });
    if (result.readiness.release) {
      result.readiness.release.reviewPackageAllowed = false;
      result.readiness.release.drawingRuleStatus = 'BLOCKED';
    }
    result.releaseGate = result.readiness.release || result.releaseGate;
  }

  function apply(result) {
    if (!result || typeof result !== 'object') return result;
    const graphValidation = validateGraph(result);
    const ruleIds = selectedRuleIds(result);
    const sources = unique(ruleIds.flatMap((id) => (ruleById(id) && ruleById(id).evidence) || []));
    const report = {
      id: ID,
      version: VERSION,
      basisStatus: BASIS_STATUS,
      status: graphValidation.blockingCount ? 'BLOCKED' : 'ACTIVE',
      note: '规则从 sch_lib 参考图中提炼并叠加项目安全基线；不构成标准符合性或专业签发。',
      profiles: Object.keys(PROFILES).reduce((out, key) => {
        out[key] = { id: PROFILES[key].id, ruleIds: PROFILES[key].rules.slice() };
        return out;
      }, {}),
      selectedRuleIds: ruleIds,
      evaluatedRuleIds: graphValidation.evaluatedRuleIds.slice(),
      appliedRuleIds: graphValidation.evaluatedRuleIds.slice(),
      guidanceRuleIds: [],
      skippedRuleIds: [],
      sourceIds: sources,
      graphValidation,
      drawingAudits: {}
    };
    syncRuleCoverage(report);
    result.drawingSkill = report;
    if (result.design) result.design.drawingSkill = {
      id: report.id, version: report.version, basisStatus: report.basisStatus,
      status: report.status, selectedRuleIds: report.selectedRuleIds.slice(),
      evaluatedRuleIds: report.evaluatedRuleIds.slice(), appliedRuleIds: report.appliedRuleIds.slice(), sourceIds: report.sourceIds.slice()
    };
    if (graphValidation.blockingCount) {
      const items = graphValidation.violations.filter((item) => item.severity === 'ERROR').map((item) => ({
        id: item.code, title: item.detail, status: 'DRAWING_RULE_VIOLATION', detail: (item.evidence || []).join('；')
      }));
      blockReview(result, '语义图未通过 sch_lib 绘图规则校验；必须修正连接、端口和回路后再评审。', items);
      const warning = '绘图规则校验发现阻断项，已将发布等级降为 CONCEPT_ONLY。';
      result.warnings = unique((result.warnings || []).concat(warning));
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
      id: ID,
      version: VERSION,
      profile: profile.id,
      basisStatus: BASIS_STATUS,
      selectedRuleIds: profile.rules.slice(),
      evaluatedRuleIds: evaluated,
      appliedRuleIds: evaluated.slice(),
      status: report ? report.status : 'NOT_APPLIED'
    };
  }

  function auditMarkup(markup, drawingKey, result) {
    const text = String(markup || '');
    const checks = [];
    const profile = profileFor(drawingKey);
    if (!profile) return {
      drawingKey, profile: 'UNKNOWN_DRAWING_PROFILE', status: 'BLOCKED', blockingCount: 1,
      evaluatedRuleIds: [],
      checks: [{ code: 'G000-UNKNOWN-PROFILE', ruleId: 'DOC-001', ok: false, severity: 'ERROR', detail: '未知图型 profile，禁止静默按其他图型校验。' }]
    };
    const add = (code, ruleId, ok, severity, detail) => checks.push({ code, ruleId, ok: !!ok, severity, detail });
    add('G000-SVG-COMPLETE', 'DOC-001', /^<svg\b/.test(text) && /<\/svg>\s*$/.test(text), 'ERROR', '输出必须是完整 SVG。');
    add('G001-A3', 'DOC-001', /width="420mm"/.test(text) && /height="297mm"/.test(text), 'ERROR', '输出必须保留 A3 物理图幅。');
    add('G002-SKILL-META', 'DOC-001', text.includes('data-drawing-skill="' + ID + '"') && text.includes('data-drawing-profile="' + profile.id + '"'), 'ERROR', 'SVG 必须记录绘图 skill 与图型 profile。');
    add('G003-DOCUMENT-CONTROL', 'DOC-001', /图号:/.test(text) && /修订:/.test(text) && /校核:/.test(text) && /批准:/.test(text), 'ERROR', 'SVG 必须包含文控标题栏。');
    add('G004-UNRESOLVED-TOKEN', 'TAG-002', !/\b(?:undefined|NaN)\b/.test(text), 'ERROR', 'SVG 不得包含未解析占位值。');
    const legendApplicable = !(drawingKey === 'cooling-pid' && result && result.cooling && !result.cooling.isLiquid);
    add('G005-LEGEND', 'STYLE-001', !legendApplicable || /图例|LEGEND/.test(text), drawingKey === 'architecture' || drawingKey === 'thermal' ? 'WARN' : 'ERROR', '使用颜色/线型的图纸必须有图例。');
    if (drawingKey === 'single-line') {
      add('E005-PROTECTION-VISIBLE', 'FED-001', /QF1-A/.test(text) && /QF2-A/.test(text), 'ERROR', '一次图应显示进线与低压保护设备。');
      add('E007-PE-VISIBLE', 'TAG-003', /PE 保护接地/.test(text), 'ERROR', '一次图应显示保护接地边界。');
    }
    if (drawingKey === 'dual-path' && result && result.power && result.power.mainsCount > 1) {
      add('E006-DUAL-PATH-VISIBLE', 'BUS-002', /PDU-A/.test(text) && /PDU-B/.test(text), 'ERROR', '双路图应显示独立 PDU-A/PDU-B。');
    }
    if (drawingKey === 'cooling-pid' && result && result.cooling && result.cooling.isLiquid) {
      add('E009-SUPPLY-RETURN-VISIBLE', 'PID-001', /一次侧供/.test(text) && /一次侧回/.test(text) && /二次供/.test(text) && /二次回/.test(text), 'ERROR', '液冷图应明确一次/二次供回水。');
      add('E010-INSTRUMENT-TAGS', 'PID-002', /TT-101/.test(text) && /FT-101/.test(text) && /PT-101/.test(text), 'WARN', '液冷图应显示唯一仪表位号。');
    }
    const blocking = checks.filter((check) => !check.ok && check.severity === 'ERROR');
    return {
      drawingKey, profile: profile.id, status: blocking.length ? 'BLOCKED' : 'CHECKED', checks,
      blockingCount: blocking.length,
      evaluatedRuleIds: unique(checks.map((check) => check.ruleId).filter(Boolean))
    };
  }

  function recordDrawingAudit(result, drawingKey, audit) {
    if (!result || !result.drawingSkill) return;
    result.drawingSkill.drawingAudits[drawingKey] = audit;
    result.drawingSkill.evaluatedRuleIds = unique((result.drawingSkill.evaluatedRuleIds || []).concat(audit && audit.evaluatedRuleIds || []));
    syncRuleCoverage(result.drawingSkill);
  }

  function finalizeDrawingAudits(result) {
    if (!result || !result.drawingSkill) return result;
    if (result.readiness) {
      result.readiness.blockingItems = (result.readiness.blockingItems || []).filter((item) => !/^DRAWING-/.test(item.id || ''));
    }
    result.warnings = (result.warnings || []).filter((message) => message !== '至少一张图未通过绘图 skill 渲染检查，已阻止评审包发布。');
    const expectedKeys = ['architecture', 'single-line', 'dual-path', 'cooling-pid', 'thermal'];
    const drawingAudits = result.drawingSkill.drawingAudits || {};
    expectedKeys.filter((key) => !drawingAudits[key]).forEach((key) => {
      drawingAudits[key] = {
        drawingKey: key,
        profile: profileFor(key).id,
        status: 'BLOCKED',
        blockingCount: 1,
        evaluatedRuleIds: ['DOC-001'],
        checks: [{ code: 'G000-AUDIT-MISSING', ruleId: 'DOC-001', ok: false, severity: 'ERROR', detail: '图纸未完成渲染规则校验。' }]
      };
    });
    result.drawingSkill.drawingAudits = drawingAudits;
    const audits = Object.values(drawingAudits);
    const blocked = audits.filter((audit) => audit && audit.blockingCount > 0);
    result.drawingSkill.renderBlockingCount = blocked.reduce((sum, audit) => sum + audit.blockingCount, 0);
    if (blocked.length) {
      result.drawingSkill.status = 'BLOCKED';
      const items = blocked.map((audit) => ({
        id: 'DRAWING-' + String(audit.drawingKey || '').toUpperCase(),
        title: audit.drawingKey + ' 图纸渲染规则未通过', status: 'DRAWING_RULE_VIOLATION',
        detail: audit.checks.filter((check) => !check.ok && check.severity === 'ERROR').map((check) => check.code).join('、')
      }));
      blockReview(result, '生成图纸未通过 sch_lib 绘图规则的渲染前置检查。', items);
      result.warnings = unique((result.warnings || []).concat('至少一张图未通过绘图 skill 渲染检查，已阻止评审包发布。'));
    } else {
      result.drawingSkill.status = Number(result.drawingSkill.graphValidation && result.drawingSkill.graphValidation.blockingCount || 0) > 0 ? 'BLOCKED' : 'ACTIVE';
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
      return { allowed: false, reason: '生成图集中存在未通过渲染规则的图纸，须先修正完整图集。', format };
    }
    const audit = report.drawingAudits && report.drawingAudits[drawingKey];
    if (!audit) return { allowed: false, reason: '当前图纸尚未执行渲染规则校验，禁止导出。', format };
    if (audit.blockingCount > 0) return { allowed: false, reason: '当前图纸未通过渲染规则校验，禁止导出。', format };
    return { allowed: true, reason: '允许导出方案级草图；仍不得作为施工图或规范符合性证明。', format };
  }

  return {
    ID, VERSION, BASIS_STATUS, SOURCE_LIBRARY, RULES, PROFILES,
    profileFor, rulesFor, validateGraph, apply, metadata,
    auditMarkup, recordDrawingAudit, finalizeDrawingAudits, canExport
  };
})();
