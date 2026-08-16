/* ============================================================
 * AIDC Engineering Design Model (ADEM)
 * ------------------------------------------------------------
 * The canonical, renderer-independent source of truth for a
 * generated scheme.  Drawings, BOMs, calculation records and
 * validation results must reference these IDs rather than create
 * their own independent topology.
 * ============================================================ */
(function () {
  'use strict';

  const SCHEMA_VERSION = '2.2.0';
  const DOCUMENT_STATUS = 'CONCEPT_DRAFT—PROFESSIONAL_REVIEW_REQUIRED';

  /*
   * This is deliberately a project document-control convention, not a claim
   * that an automatically generated drawing has been approved to IEC 81346,
   * ISO 7200, ISO 5457, or a client's CAD manual.  It gives every generated
   * artefact a stable identity so that later calculation files, CAD sheets
   * and review records can reference the same concept.
   */
  const CAD_LAYER_MANIFEST = [
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

  const DRAWING_REGISTER = [
    { key: 'architecture', drawingNo: 'AIDC-CONCEPT-101', title: 'AIDC 系统架构图', discipline: 'GENERAL', sheet: 'A3', orientation: 'LANDSCAPE', scale: 'NTS' },
    { key: 'single-line', drawingNo: 'AIDC-CONCEPT-102', title: 'AIDC 电气一次接线图', discipline: 'ELECTRICAL', sheet: 'A3', orientation: 'LANDSCAPE', scale: 'NTS' },
    { key: 'dual-path', drawingNo: 'AIDC-CONCEPT-103', title: 'AIDC 双路供电拓扑图', discipline: 'ELECTRICAL', sheet: 'A3', orientation: 'LANDSCAPE', scale: 'NTS' },
    { key: 'cooling-pid', drawingNo: 'AIDC-CONCEPT-104', title: 'AIDC 液冷管路图（P&ID 概念草图）', discipline: 'MECHANICAL', sheet: 'A3', orientation: 'LANDSCAPE', scale: 'NTS' },
    { key: 'thermal', drawingNo: 'AIDC-CONCEPT-105', title: 'AIDC 液冷与热管理方案图', discipline: 'MECHANICAL', sheet: 'A3', orientation: 'LANDSCAPE', scale: 'NTS' }
  ];

  /* Named ports are the contract between the engineering graph and every
   * renderer.  The sch_lib review showed that professional schematics attach
   * conductors/pipes to explicit terminals or nozzles, never to box centres. */
  const PORT_TEMPLATES = {
    'utility-incomer': [{ id: 'out', netClass: 'POWER_MV', direction: 'out', required: true }],
    'mv-switchgear': [{ id: 'in', netClass: 'POWER_MV', direction: 'in', required: true }, { id: 'out', netClass: 'POWER_MV', direction: 'out', required: true }],
    'transformer-bank': [{ id: 'hv', netClass: 'POWER_MV', direction: 'in', required: true }, { id: 'lv', netClass: 'POWER_LV', direction: 'out', required: true }],
    'lv-main-switchgear': [{ id: 'in', netClass: 'POWER_LV', direction: 'in', required: true }, { id: 'out', netClass: 'POWER_LV', direction: 'out', required: true }],
    'ups-bank': [{ id: 'in', netClass: 'POWER_LV', direction: 'in', required: true }, { id: 'out', netClass: 'POWER_UPS', direction: 'out', required: true }, { id: 'battery', netClass: 'POWER_DC', direction: 'bidirectional', required: false }],
    'pdu-bank': [{ id: 'in', netClass: 'POWER_UPS', direction: 'in', required: true }, { id: 'out', netClass: 'POWER_UPS', direction: 'out', required: true }],
    'gpu-rack-bank': [{ id: 'power-in', netClass: 'POWER_UPS', direction: 'in', required: true }, { id: 'cooling-in', netClass: 'PROCESS_SECONDARY', direction: 'in', required: false }, { id: 'cooling-out', netClass: 'PROCESS_SECONDARY', direction: 'out', required: false }],
    'static-transfer-switch': [{ id: 'in-a', netClass: 'POWER_LV', direction: 'in', required: false }, { id: 'in-b', netClass: 'POWER_LV', direction: 'in', required: false }, { id: 'out', netClass: 'POWER_LV', direction: 'out', required: false }],
    'cdu-bank': [{ id: 'primary-in', netClass: 'PROCESS_PRIMARY', direction: 'in', required: true }, { id: 'primary-out', netClass: 'PROCESS_PRIMARY', direction: 'out', required: true }, { id: 'secondary-supply', netClass: 'PROCESS_SECONDARY', direction: 'out', required: true }, { id: 'secondary-return', netClass: 'PROCESS_SECONDARY', direction: 'in', required: true }],
    'chiller-bank': [{ id: 'chw-supply', netClass: 'PROCESS_PRIMARY', direction: 'out', required: true }, { id: 'chw-return', netClass: 'PROCESS_PRIMARY', direction: 'in', required: true }, { id: 'condenser-in', netClass: 'PROCESS_CONDENSER', direction: 'in', required: true }, { id: 'condenser-out', netClass: 'PROCESS_CONDENSER', direction: 'out', required: true }],
    'cooling-tower-bank': [{ id: 'condenser-supply', netClass: 'PROCESS_CONDENSER', direction: 'out', required: true }, { id: 'condenser-return', netClass: 'PROCESS_CONDENSER', direction: 'in', required: true }],
    'pump-bank': [{ id: 'in', netClass: 'PROCESS_COOLING', direction: 'in', required: true }, { id: 'out', netClass: 'PROCESS_COOLING', direction: 'out', required: true }]
  };

  function portsFor(kind) {
    return (PORT_TEMPLATES[kind] || [{ id: 'in', netClass: 'UNCLASSIFIED', direction: 'in', required: false }, { id: 'out', netClass: 'UNCLASSIFIED', direction: 'out', required: false }])
      .map((port) => Object.assign({}, port));
  }

  function idPart(value) {
    const raw = String(value || '').trim();
    const ascii = raw.toUpperCase().replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 28);
    /* Chinese and other non-Latin project names must not all collapse to the
     * same reference.  This is a deterministic identifier, not a security
     * hash or a replacement for a client project number. */
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
    const unicodeSuffix = 'U' + (hash >>> 0).toString(36).toUpperCase().slice(0, 10);
    if (ascii && !/[^\x00-\x7F]/.test(raw)) return ascii;
    if (ascii) return (ascii.slice(0, 16) + '-' + unicodeSuffix).slice(0, 28);
    return raw ? unicodeSuffix : 'AIDC';
  }

  function projectReference(projectId) {
    return 'AIDC-' + String(projectId || 'AIDC').replace(/^PRJ-/, '');
  }

  function documentControl(projectId) {
    const projectRef = projectReference(projectId);
    return {
      documentSetId: projectRef + '-CONCEPT-SET',
      projectReference: projectRef,
      documentClass: 'CONCEPTUAL_SCHEME',
      issuePurpose: '方案比较与工程深化输入',
      status: DOCUMENT_STATUS,
      revision: 'P01',
      revisionHistory: [{ revision: 'P01', status: 'UNISSUED', description: '自动生成的方案级草图；待专业校核、批准和签发', issueDate: null }],
      page: { current: 1, total: 1 },
      roleStatus: {
        preparedBy: 'AUTO_GENERATED—REVIEW_REQUIRED',
        checkedBy: 'UNASSIGNED',
        approvedBy: 'UNASSIGNED'
      },
      referenceDesignationSystem: {
        convention: 'PROJECT_INTERNAL_AIDC_V1',
        status: 'PROJECT_CONVENTION—NOT_A_CERTIFIED_IEC_81346_IMPLEMENTATION',
        equipmentPattern: 'AIDC-{discipline}-{path/system}-{type}{sequence}',
        circuitPattern: 'AIDC-{discipline}-{path/system}-CCT{sequence}',
        note: '代号用于方案追溯；项目深化时须由业主/设计院 CAD 编码规则复核。'
      },
      referenceBaseline: [
        { id: 'REF-IEC-61082-1', title: 'IEC 61082-1', use: '文件编制参考', status: 'REFERENCE_ONLY—APPLICABILITY_TO_BE_CONFIRMED' },
        { id: 'REF-IEC-60617', title: 'IEC 60617', use: '图形符号参考', status: 'REFERENCE_ONLY—SYMBOL_LIBRARY_TO_BE_VERIFIED' },
        { id: 'REF-ISO-5457', title: 'ISO 5457', use: '图幅/图框参考', status: 'REFERENCE_ONLY—PROJECT_TEMPLATE_REQUIRED' },
        { id: 'REF-ISO-7200', title: 'ISO 7200', use: '标题栏字段参考', status: 'REFERENCE_ONLY—PROJECT_TEMPLATE_REQUIRED' }
      ],
      drawingRegister: DRAWING_REGISTER.map((drawing) => Object.assign({}, drawing, {
        drawingRef: projectRef + '-' + drawing.drawingNo,
        revision: 'P01',
        status: DOCUMENT_STATUS,
        issuePurpose: '方案级自动草图，待专业校核/签发',
        verification: 'NOT_VERIFIED',
        output: ['SVG_A3_PREVIEW', 'DXF_R2010_CONCEPT']
      })),
      cadLayerManifest: CAD_LAYER_MANIFEST.map((layer) => Object.assign({}, layer)),
      traceability: {
        modelSchema: 'ADEM-' + SCHEMA_VERSION,
        source: 'AIDC_ENGINE',
        generatedAt: null,
        immutableInputHash: null,
        note: '导出包应另行记录输入快照、计算版本、审查人和签发时间。'
      }
    };
  }

  function create(spec) {
    const p = spec.params || {};
    const power = spec.power || {};
    const cooling = spec.cooling || {};
    const compute = spec.compute || {};
    const topology = spec.topology || {};
    const projectId = 'PRJ-' + idPart(p.projName);
    const docControl = documentControl(projectId);
    const equipment = [];
    const circuits = [];
    const paths = [];

    const addEquipment = (data) => {
      const item = Object.assign({
        id: data.id,
        ref: data.ref || data.id,
        referenceDesignation: data.referenceDesignation || data.ref || data.id,
        kind: data.kind,
        quantity: 1,
        source: 'AIDC_ENGINE',
        status: 'CONCEPT',
        ports: portsFor(data.kind)
      }, data);
      equipment.push(item);
      return item.id;
    };
    const addCircuit = (data) => {
      const kind = data.kind || 'electrical';
      const item = Object.assign({
        id: data.id,
        ref: data.ref || data.id,
        referenceDesignation: data.referenceDesignation || data.ref || data.id,
        kind,
        netClass: kind === 'pipe' ? 'PROCESS_COOLING' : 'POWER_AC',
        direction: 'from-to',
        status: 'CONCEPT'
      }, data);
      circuits.push(item);
      return item.id;
    };

    const pathNames = topology.paths || (power.mainsCount === 1 ? ['A'] : ['A', 'B']);
    pathNames.forEach((path) => {
      const suffix = String(path).toUpperCase();
      const grid = addEquipment({
        id: 'EQ-GRID-' + suffix,
        ref: 'AIDC-PWR-' + suffix + '-GRID-001',
        kind: 'utility-incomer', name: '市电 ' + suffix + ' 路', quantity: 1,
        voltageKv: power.voltageKv
      });
      const mv = addEquipment({
        id: 'EQ-MV-' + suffix,
        ref: 'AIDC-PWR-' + suffix + '-QF101',
        kind: 'mv-switchgear', name: '中压进线/馈线柜 ' + suffix, quantity: 1,
        ratedCurrentA: power.mvInA, breakingKa: power.mvBreakingKa
      });
      const tx = addEquipment({
        id: 'EQ-TX-' + suffix,
        ref: 'AIDC-PWR-' + suffix + '-T101',
        kind: 'transformer-bank', name: '变压器组 ' + suffix,
        quantity: power.txInstalledPerPath, activeQuantity: power.txActivePerPath,
        redundancyQuantity: power.txRedundancyPerPath, unitKva: power.txUnit
      });
      const lv = addEquipment({
        id: 'EQ-LV-' + suffix,
        ref: 'AIDC-PWR-' + suffix + '-QF201',
        kind: 'lv-main-switchgear', name: '低压总配电 ' + suffix, quantity: 1,
        ratedCurrentA: power.lvMainA, breakingKa: power.lvBreakingKa
      });
      const ups = addEquipment({
        id: 'EQ-UPS-' + suffix,
        ref: 'AIDC-PWR-' + suffix + '-UPS101',
        kind: 'ups-bank', name: 'UPS 组 ' + suffix,
        quantity: power.upsInstalledPerPath, activeQuantity: power.upsActivePerPath,
        redundancyQuantity: power.upsRedundancyPerPath, unitKva: power.upsUnit
      });
      const pdu = addEquipment({
        id: 'EQ-PDU-' + suffix,
        ref: 'AIDC-IT-' + suffix + '-PDU101',
        kind: 'pdu-bank', name: '列头柜/PDU ' + suffix,
        quantity: power.pduPerPath, supplies: suffix
      });

      addCircuit({ id: 'CCT-' + suffix + '-01', ref: 'AIDC-PWR-' + suffix + '-CCT01', from: grid, fromPort: 'out', to: mv, toPort: 'in', voltageKv: power.voltageKv, netClass: 'POWER_MV' });
      addCircuit({ id: 'CCT-' + suffix + '-02', ref: 'AIDC-PWR-' + suffix + '-CCT02', from: mv, fromPort: 'out', to: tx, toPort: 'hv', voltageKv: power.voltageKv, netClass: 'POWER_MV' });
      addCircuit({ id: 'CCT-' + suffix + '-03', ref: 'AIDC-PWR-' + suffix + '-CCT03', from: tx, fromPort: 'lv', to: lv, toPort: 'in', voltageKv: 0.4, netClass: 'POWER_LV' });
      addCircuit({ id: 'CCT-' + suffix + '-04', ref: 'AIDC-PWR-' + suffix + '-CCT04', from: lv, fromPort: 'out', to: ups, toPort: 'in', voltageKv: 0.4, netClass: 'POWER_LV' });
      addCircuit({ id: 'CCT-' + suffix + '-05', ref: 'AIDC-PWR-' + suffix + '-CCT05', from: ups, fromPort: 'out', to: pdu, toPort: 'in', voltageKv: 0.4, netClass: 'POWER_UPS' });
      paths.push({ id: 'PATH-' + suffix, name: suffix + ' 路关键供电路径', equipment: [grid, mv, tx, lv, ups, pdu] });
    });

    const rackA = addEquipment({
      id: 'EQ-RACK-A', ref: 'AIDC-IT-A-RACK-GRP', kind: 'gpu-rack-bank', name: 'GPU 机柜 A 路输入',
      quantity: compute.gpuRacks || 0, rackPowerKw: compute.rackPower
    });
    const rackB = pathNames.length > 1 ? addEquipment({
      id: 'EQ-RACK-B', ref: 'AIDC-IT-B-RACK-GRP', kind: 'gpu-rack-bank', name: 'GPU 机柜 B 路输入',
      quantity: compute.gpuRacks || 0, rackPowerKw: compute.rackPower
    }) : null;
    paths.forEach((path) => {
      const pdu = path.equipment[path.equipment.length - 1];
      addCircuit({ id: 'CCT-' + path.name.charAt(0) + '-IT', ref: 'AIDC-IT-' + path.name.charAt(0) + '-CCT01', from: pdu, fromPort: 'out', to: path.name.charAt(0) === 'A' ? rackA : (rackB || rackA), toPort: 'power-in', voltageKv: 0.4, netClass: 'POWER_UPS', loadType: 'dual-cord-it' });
    });

    const auxSts = addEquipment({
      id: 'EQ-STS-AUX', ref: 'AIDC-AUX-STS101', kind: 'static-transfer-switch',
      name: '辅助单电源负荷 STS', quantity: power.auxStsCount || 0,
      note: 'STS 仅用于单电源辅助负荷，不作为 GPU 双电源机柜主供电路径'
    });

    const coolingObjects = [];
    const addCooling = (id, ref, kind, name, quantity, data) => {
      const eq = addEquipment(Object.assign({ id, ref, kind, name, quantity, discipline: 'cooling' }, data || {}));
      coolingObjects.push(eq); return eq;
    };
    if (cooling.isLiquid) {
      const cdu = addCooling('EQ-CDU-01', 'AIDC-CLG-CDU101', 'cdu-bank', 'CDU 冷量分配组', cooling.cduCount, {
        activeQuantity: cooling.cduActiveCount, redundancyQuantity: cooling.cduRedundancyCount,
        unitKw: cooling.cduCap, dutyKw: cooling.liquidHeatKw
      });
      const chiller = addCooling('EQ-CH-01', 'AIDC-CLG-CH101', 'chiller-bank', '冷水机组', cooling.chillerCount, {
        activeQuantity: cooling.chillerActiveCount, redundancyQuantity: cooling.chillerRedundancyCount,
        unitKw: cooling.chillerCap, dutyKw: cooling.heatRejectionKw
      });
      const tower = addCooling('EQ-CT-01', 'AIDC-CLG-CT101', 'cooling-tower-bank', '冷却塔', cooling.towerCount, {
        activeQuantity: cooling.towerActiveCount, redundancyQuantity: cooling.towerRedundancyCount,
        unitKw: cooling.towerCap, dutyKw: cooling.heatRejectionKw
      });
      const primaryPump = addCooling('EQ-PUMP-PRI', 'AIDC-CLG-P101', 'pump-bank', '一次侧循环泵组', cooling.pumpCount, {
        dutyFlowLpm: cooling.primaryFlowLpm, note: '数量与扬程待水力计算确认',
        ports: [{ id: 'in', netClass: 'PROCESS_PRIMARY', direction: 'in', required: true }, { id: 'out', netClass: 'PROCESS_PRIMARY', direction: 'out', required: true }]
      });
      const condenserPump = addCooling('EQ-PUMP-CW', 'AIDC-CLG-P201', 'pump-bank', '冷却水循环泵组', cooling.pumpCount, {
        dutyFlowLpm: cooling.condenserFlowLpm, note: '数量与扬程待水力计算确认',
        ports: [{ id: 'in', netClass: 'PROCESS_CONDENSER', direction: 'in', required: true }, { id: 'out', netClass: 'PROCESS_CONDENSER', direction: 'out', required: true }]
      });
      addCircuit({ id: 'PIPE-SEC-SUP', ref: 'AIDC-CLG-L101-S', kind: 'pipe', medium: 'secondary-supply', netClass: 'PROCESS_SECONDARY', from: cdu, fromPort: 'secondary-supply', to: rackA, toPort: 'cooling-in', dn: cooling.dn, flowLpm: cooling.flowLpm });
      addCircuit({ id: 'PIPE-SEC-RET', ref: 'AIDC-CLG-L101-R', kind: 'pipe', medium: 'secondary-return', netClass: 'PROCESS_SECONDARY', from: rackA, fromPort: 'cooling-out', to: cdu, toPort: 'secondary-return', dn: cooling.dn, flowLpm: cooling.flowLpm });
      addCircuit({ id: 'PIPE-PRI-SUP-01', ref: 'AIDC-CLG-L201-S1', kind: 'pipe', medium: 'primary-supply', netClass: 'PROCESS_PRIMARY', from: chiller, fromPort: 'chw-supply', to: primaryPump, toPort: 'in', dn: cooling.primaryDn, flowLpm: cooling.primaryFlowLpm });
      addCircuit({ id: 'PIPE-PRI-SUP-02', ref: 'AIDC-CLG-L201-S2', kind: 'pipe', medium: 'primary-supply', netClass: 'PROCESS_PRIMARY', from: primaryPump, fromPort: 'out', to: cdu, toPort: 'primary-in', dn: cooling.primaryDn, flowLpm: cooling.primaryFlowLpm });
      addCircuit({ id: 'PIPE-PRI-RET', ref: 'AIDC-CLG-L201-R', kind: 'pipe', medium: 'primary-return', netClass: 'PROCESS_PRIMARY', from: cdu, fromPort: 'primary-out', to: chiller, toPort: 'chw-return', dn: cooling.primaryDn, flowLpm: cooling.primaryFlowLpm });
      addCircuit({ id: 'PIPE-CW-SUP-01', ref: 'AIDC-CLG-L301-S1', kind: 'pipe', medium: 'condenser-supply', netClass: 'PROCESS_CONDENSER', from: tower, fromPort: 'condenser-supply', to: condenserPump, toPort: 'in', dn: cooling.condenserDn, flowLpm: cooling.condenserFlowLpm });
      addCircuit({ id: 'PIPE-CW-SUP-02', ref: 'AIDC-CLG-L301-S2', kind: 'pipe', medium: 'condenser-supply', netClass: 'PROCESS_CONDENSER', from: condenserPump, fromPort: 'out', to: chiller, toPort: 'condenser-in', dn: cooling.condenserDn, flowLpm: cooling.condenserFlowLpm });
      addCircuit({ id: 'PIPE-CW-RET', ref: 'AIDC-CLG-L301-R', kind: 'pipe', medium: 'condenser-return', netClass: 'PROCESS_CONDENSER', from: chiller, fromPort: 'condenser-out', to: tower, toPort: 'condenser-return', dn: cooling.condenserDn, flowLpm: cooling.condenserFlowLpm });
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      project: { id: projectId, name: p.projName || 'AIDC 数据中心', region: p.region || '', status: 'CONCEPT_DRAFT', referenceDesignation: docControl.projectReference },
      documentControl: docControl,
      requirements: {
        tierTarget: p.tier, redundancy: p.redundancy, voltageKv: power.voltageKv,
        itLoadKw: compute.itLoadKw, pueTarget: p.pueTarget, coolingType: p.cooling,
        specialRequirements: p.specialRequirements || []
      },
      assumptions: spec.assumptions || [],
      equipment,
      circuits,
      topology: {
        powerPaths: paths,
        rackFeeds: rackB ? [rackA, rackB] : [rackA],
        auxiliarySts: auxSts,
        topologyType: p.redundancy || 'n1'
      },
      cooling: { objectIds: coolingObjects, isLiquid: !!cooling.isLiquid },
      provenance: {
        engine: 'AIDC_ENGINE',
        engineVersion: spec.engineVersion || (window.AIDC_ENGINE && window.AIDC_ENGINE.ENGINE_VERSION) || 'UNSPECIFIED',
        // A generation timestamp belongs to the exported document package,
        // not to the deterministic engineering model itself.
        generatedAt: spec.generatedAt || null,
        calculationStatus: 'CONCEPTUAL—PROFESSIONAL_REVIEW_REQUIRED'
      }
    };
  }

  window.AIDC_DESIGN = { SCHEMA_VERSION, DOCUMENT_STATUS, CAD_LAYER_MANIFEST, DRAWING_REGISTER, create };
})();
