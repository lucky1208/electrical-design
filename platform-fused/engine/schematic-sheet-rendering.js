/* ============================================================
 * Non-authoritative multi-sheet rendering projection
 * ------------------------------------------------------------
 * The EDEM remains immutable and authoritative.  This module derives a
 * bounded graphical model for one sheet, splits high-fan-out symbols into
 * traceable graphic units, and terminates every cross-sheet circuit on an
 * explicit IEC 61082-style continuation reference.  It never invents or
 * merges an electrical circuit.
 * ============================================================ */
(function (root, factory) {
  'use strict';
  let nodeDependencies = null;
  if (typeof window === 'undefined' && typeof module === 'object' && module && module.exports && typeof require === 'function') {
    require('./color-scheme.js');
    require('./symbols.js');
    nodeDependencies = {
      document: require('./schematic-document.js'),
      placement: require('./schematic-placement.js'),
      drawingIR: require('./drawing-ir.js'),
      renderer: require('./svg-ir-renderer.js'),
      renderedSvgAudit: require('./rendered-svg-audit.js'),
      visualQualityAudit: require('./visual-quality-audit.js')
    };
  }
  const api = factory(root, nodeDependencies);
  if (root) {
    root.EVSE_SCHEMATIC_SHEET_RENDERING = api;
    root.SCHEMATIC_FORGE_SHEET_RENDERING = api;
  }
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window :
  (typeof globalThis !== 'undefined' ? globalThis : this), function (root, nodeDependencies) {
  'use strict';

  const VERSION = '1.1.0';
  const SCHEMA = 'SCHEMATIC-SHEET-RENDERING/1.0';
  const PAGE_MODEL_SCHEMA = 'SCHEMATIC-GRAPHICAL-PROJECTION/1.0';
  const DEFAULT_MAX_ENDPOINTS = 14;

  class SheetRenderingError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = 'SheetRenderingError';
      this.code = code;
      this.details = details || {};
    }
  }

  function runtime() {
    const dependencies = nodeDependencies || {};
    const value = {
      document: dependencies.document || (root && root.SCHEMATIC_DOCUMENT),
      placement: dependencies.placement || (root && root.EVSE_SCHEMATIC_PLACEMENT),
      drawingIR: dependencies.drawingIR || (root && root.EVSE_DRAWING_IR),
      renderer: dependencies.renderer || (root && root.EVSE_SVG_IR_RENDERER),
      renderedSvgAudit: dependencies.renderedSvgAudit || (root && root.EVSE_RENDERED_SVG_AUDIT),
      visualQualityAudit: dependencies.visualQualityAudit || (root && root.EVSE_VISUAL_QUALITY_AUDIT)
    };
    const missing = Object.keys(value).filter((key) => !value[key]);
    if (missing.length) throw new SheetRenderingError('SHEET_RENDERING_DEPENDENCY_MISSING',
      'Missing multi-sheet rendering dependencies: ' + missing.join(', '), { missing });
    return value;
  }

  function text(value) { return String(value == null ? '' : value).trim(); }
  function compare(left, right) {
    const a = text(left); const b = text(right);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).forEach((key) => { out[key] = clone(value[key]); });
      return out;
    }
    return value;
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return Object.freeze(value);
  }
  function endpoint(instanceId, terminalId) {
    return { instanceId: text(instanceId), terminalId: text(terminalId),
      ref: text(instanceId) + ':' + text(terminalId) };
  }
  function terminals(instance) {
    return Array.isArray(instance && instance.terminals) ? instance.terminals :
      (Array.isArray(instance && instance.ports) ? instance.ports : []);
  }
  function findTerminal(instance, terminalId) {
    return terminals(instance).find((item) => text(item && item.id) === text(terminalId));
  }
  function safeToken(value) {
    return text(value).replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || 'X';
  }
  function chunks(values, size) {
    const out = [];
    for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
    return out;
  }
  function unique(values) { return Array.from(new Set(values)); }

  function assertInputs(result, documentValue, sheetId) {
    const design = result && result.design;
    if (!design || !text(design.modelHash)) throw new SheetRenderingError('AUTHORITATIVE_EDEM_REQUIRED',
      'compilePage requires a build result with an authoritative EDEM modelHash.');
    if (!documentValue || !Array.isArray(documentValue.sheets)) throw new SheetRenderingError('DOCUMENT_REQUIRED',
      'compilePage requires a SCHEMATIC_DOCUMENT plan.');
    if (text(documentValue.sourceModelHash) !== text(design.modelHash)) {
      throw new SheetRenderingError('DOCUMENT_MODEL_HASH_MISMATCH',
        'The sheet document was not planned from this EDEM.', {
          designModelHash: design.modelHash, documentModelHash: documentValue.sourceModelHash
        });
    }
    const sheet = documentValue.sheets.find((item) => item.id === sheetId);
    if (!sheet) throw new SheetRenderingError('SHEET_UNKNOWN', 'Unknown sheet ' + text(sheetId) + '.', { sheetId });
    return { design, sheet };
  }

  function resolvePhysicalEndpoint(instanceById, instanceId, terminalId) {
    const instance = instanceById.get(instanceId);
    const terminal = instance && findTerminal(instance, terminalId);
    if (!instance || !terminal) throw new SheetRenderingError('GLOBAL_ENDPOINT_UNKNOWN',
      'Cannot project unknown global endpoint ' + endpoint(instanceId, terminalId).ref + '.');
    if (instance.logicalOnlyProxy !== true) return { instance, terminal, instanceId, terminalId };
    const ownerId = text(instance.physicalOwnerId || terminal.physicalOwnerId);
    const ownerTerminalId = text(terminal.physicalTerminalId);
    const owner = instanceById.get(ownerId);
    const ownerTerminal = owner && findTerminal(owner, ownerTerminalId);
    if (!owner || !ownerTerminal || owner.logicalOnlyProxy === true) {
      throw new SheetRenderingError('LOGICAL_PROXY_GRAPHICAL_OWNER_MISSING',
        'Logical endpoint ' + endpoint(instanceId, terminalId).ref + ' has no usable graphical owner.', {
          ownerId, ownerTerminalId
        });
    }
    return { instance: owner, terminal: ownerTerminal, instanceId: ownerId, terminalId: ownerTerminalId,
      logicalInstanceId: instanceId, logicalTerminalId: terminalId };
  }

  function systemForNetClass(netClass) {
    const value = text(netClass).toUpperCase();
    if (value === 'POWER_AC') return 'ac';
    if (value === 'POWER_DC') return 'dc';
    if (value === 'POWER_DC_ESS' || value === 'POWER_INTERFACE_MODED') return 'ess';
    if (value === 'POWER_DC_AUX') return 'aux';
    if (value === 'PROTECTIVE_EARTH') return 'earth';
    return value === 'SIGNAL_COMM' ? 'comm' : 'control';
  }

  function makeProjection(result, documentValue, sheet, options) {
    const design = result.design;
    const maxEndpoints = Math.max(12, Math.min(16,
      Math.floor(Number(options && options.maxEndpointsPerGraphicUnit || DEFAULT_MAX_ENDPOINTS))));
    const instanceById = new Map(design.instances.map((instance) => [instance.id, instance]));
    const circuitById = new Map(design.circuits.map((circuit) => [circuit.id, circuit]));
    const netById = new Map(design.nets.map((net) => [net.id, net]));
    const connectorByCircuit = new Map(sheet.offPageConnectors.map((connector) => [connector.circuitId, connector]));
    const circuitIds = unique(sheet.internalCircuitIds.concat(sheet.crossCircuitIds)).sort(compare);
    const occurrenceByInstance = new Map();
    const occurrenceDetails = new Map();
    const displayInstanceIds = new Set();

    function addOccurrence(circuit, role) {
      const originalId = role === 'FROM' ? circuit.from : circuit.to;
      const originalTerminalId = role === 'FROM' ? circuit.fromPort : circuit.toPort;
      const physical = resolvePhysicalEndpoint(instanceById, originalId, originalTerminalId);
      displayInstanceIds.add(physical.instanceId);
      const record = {
        key: circuit.id + ':' + role, circuitId: circuit.id, role,
        originalInstanceId: originalId, originalTerminalId,
        displayInstanceId: physical.instanceId, displayTerminalId: physical.terminalId,
        terminal: physical.terminal
      };
      const list = occurrenceByInstance.get(physical.instanceId) || [];
      list.push(record); occurrenceByInstance.set(physical.instanceId, list);
      occurrenceDetails.set(record.key, record);
    }

    sheet.instanceIds.forEach((id) => {
      const instance = instanceById.get(id);
      if (instance && instance.logicalOnlyProxy !== true) displayInstanceIds.add(id);
    });
    circuitIds.forEach((id) => {
      const circuit = circuitById.get(id);
      if (!circuit) throw new SheetRenderingError('DOCUMENT_CIRCUIT_UNKNOWN',
        'Sheet ' + sheet.id + ' references unknown circuit ' + id + '.');
      const connector = connectorByCircuit.get(id);
      if (!connector) { addOccurrence(circuit, 'FROM'); addOccurrence(circuit, 'TO'); }
      else addOccurrence(circuit, connector.role === 'SOURCE' ? 'FROM' : 'TO');
    });

    const graphicalInstances = [];
    const occurrenceEndpoint = new Map();
    const graphicUnitManifest = [];
    Array.from(displayInstanceIds).sort(compare).forEach((instanceId) => {
      const source = instanceById.get(instanceId);
      if (!source) throw new SheetRenderingError('DISPLAY_INSTANCE_UNKNOWN',
        'Missing display instance ' + instanceId + '.');
      const connected = (occurrenceByInstance.get(instanceId) || []).slice()
        .sort((a, b) => compare(a.displayTerminalId, b.displayTerminalId) ||
          compare(a.circuitId, b.circuitId) || compare(a.role, b.role));
      const connectedTerminalIds = new Set(connected.map((item) => item.displayTerminalId));
      const open = terminals(source).filter((terminal) => !connectedTerminalIds.has(terminal.id))
        .map((terminal) => ({ key: '', circuitId: '', role: 'OPEN', displayInstanceId: instanceId,
          displayTerminalId: terminal.id, terminal }));
      const records = connected.concat(open);
      if (records.length <= maxEndpoints) {
        const copy = clone(source);
        copy.modelInstanceId = instanceId;
        copy.graphicalRepresentationOf = instanceId;
        copy.graphicUnitIndex = 1; copy.graphicUnitCount = 1;
        copy.projectionRole = sheet.instanceIds.includes(instanceId) ? 'LOCAL_INSTANCE' : 'LOGICAL_OWNER_REPLICA';
        graphicalInstances.push(copy);
        connected.forEach((record) => occurrenceEndpoint.set(record.key,
          endpoint(instanceId, record.displayTerminalId)));
        graphicUnitManifest.push({ graphicId: instanceId, modelInstanceId: instanceId,
          unitIndex: 1, unitCount: 1, endpointCount: records.length });
        return;
      }
      const recordChunks = chunks(records, maxEndpoints);
      recordChunks.forEach((unitRecords, unitIndex) => {
        const graphicId = instanceId + '~GR' + String(unitIndex + 1).padStart(2, '0');
        const copy = clone(source);
        copy.id = graphicId;
        copy.modelInstanceId = instanceId;
        copy.graphicalRepresentationOf = instanceId;
        copy.graphicUnitIndex = unitIndex + 1; copy.graphicUnitCount = recordChunks.length;
        copy.projectionRole = 'FANOUT_GRAPHIC_UNIT';
        copy.tag = text(source.tag || source.designation || source.referenceDesignation || instanceId) +
          '.' + (unitIndex + 1) + '/' + recordChunks.length;
        copy.name = text(source.name || source.kind) + ' · 图形分段';
        copy.terminals = unitRecords.map((record, recordIndex) => {
          const terminalCopy = clone(record.terminal);
          terminalCopy.id = 'P' + String(recordIndex + 1).padStart(2, '0') + '-' + safeToken(record.displayTerminalId);
          terminalCopy.label = text(record.terminal.label || record.displayTerminalId);
          terminalCopy.modelInstanceId = instanceId;
          terminalCopy.modelTerminalId = record.displayTerminalId;
          terminalCopy.graphicalOccurrence = record.key || 'OPEN:' + record.displayTerminalId;
          if (record.key) occurrenceEndpoint.set(record.key, endpoint(graphicId, terminalCopy.id));
          return terminalCopy;
        });
        copy.ports = copy.terminals;
        graphicalInstances.push(copy);
        graphicUnitManifest.push({ graphicId, modelInstanceId: instanceId,
          unitIndex: unitIndex + 1, unitCount: recordChunks.length, endpointCount: unitRecords.length });
      });
    });

    const offPageEndpoint = new Map();
    const offPageBanks = [];
    const groups = new Map();
    sheet.offPageConnectors.slice().sort((a, b) => compare(a.id, b.id)).forEach((connector) => {
      const key = [connector.role, connector.remoteSheetId, connector.netClass].join('|');
      const list = groups.get(key) || []; list.push(connector); groups.set(key, list);
    });
    Array.from(groups.keys()).sort(compare).forEach((groupKey) => {
      const group = groups.get(groupKey);
      chunks(group, maxEndpoints).forEach((bankConnectors, bankIndex) => {
        const first = bankConnectors[0];
        const outgoing = first.role === 'SOURCE';
        const bankId = 'OPB-' + sheet.id + '-' + (outgoing ? 'OUT' : 'IN') + '-' +
          safeToken(first.remoteSheetId) + '-' + safeToken(first.netClass) + '-' + String(bankIndex + 1).padStart(2, '0');
        const bank = {
          id: bankId,
          kind: outgoing ? 'off-page-connector-outgoing' : 'off-page-connector-incoming',
          system: systemForNetClass(first.netClass),
          name: (outgoing ? '续至' : '来自') + ' ' + first.remoteSheetId + ' / ' + first.xref.drawingNo,
          tag: (outgoing ? '→' : '←') + first.xref.page + '/' + documentValue.sheets.length,
          referenceDesignation: bankId,
          modelInstanceId: '', graphicalRepresentationOf: '',
          graphicUnitIndex: bankIndex + 1,
          graphicUnitCount: Math.ceil(group.length / maxEndpoints),
          projectionRole: 'OFF_PAGE_CONNECTOR_BANK',
          syntheticProjection: true,
          offPageConnectors: bankConnectors.map(clone),
          terminals: bankConnectors.map((connector, connectorIndex) => {
            const id = 'X' + String(connectorIndex + 1).padStart(2, '0');
            offPageEndpoint.set(connector.id, endpoint(bankId, id));
            return {
              id,
              label: (outgoing ? '→' : '←') + 'p' + connector.xref.page + ' ' +
                connector.remoteSheetId + ' ' + connector.xref.endpointKey,
              netClass: connector.netClass,
              domain: '',
              direction: outgoing ? 'in' : 'out',
              required: true,
              offPageConnectorId: connector.id,
              circuitId: connector.circuitId,
              netId: connector.netId,
              xref: clone(connector.xref)
            };
          })
        };
        bank.ports = bank.terminals;
        graphicalInstances.push(bank); offPageBanks.push(bank);
        graphicUnitManifest.push({ graphicId: bankId, modelInstanceId: '', unitIndex: bankIndex + 1,
          unitCount: bank.graphicUnitCount, endpointCount: bank.terminals.length,
          projectionRole: bank.projectionRole });
      });
    });

    const pageCircuits = circuitIds.map((id) => {
      const source = circuitById.get(id);
      const connector = connectorByCircuit.get(id);
      const projected = clone(source);
      projected.projectionOfCircuitId = source.id;
      projected.globalFrom = source.from; projected.globalFromPort = source.fromPort;
      projected.globalTo = source.to; projected.globalToPort = source.toPort;
      if (!connector) {
        const from = occurrenceEndpoint.get(id + ':FROM');
        const to = occurrenceEndpoint.get(id + ':TO');
        if (!from || !to) throw new SheetRenderingError('GRAPHICAL_ENDPOINT_MISSING',
          'Internal circuit ' + id + ' has no graphical endpoint mapping.');
        projected.from = from.instanceId; projected.fromPort = from.terminalId;
        projected.to = to.instanceId; projected.toPort = to.terminalId;
      } else if (connector.role === 'SOURCE') {
        const from = occurrenceEndpoint.get(id + ':FROM');
        const to = offPageEndpoint.get(connector.id);
        projected.from = from.instanceId; projected.fromPort = from.terminalId;
        projected.to = to.instanceId; projected.toPort = to.terminalId;
      } else {
        const from = offPageEndpoint.get(connector.id);
        const to = occurrenceEndpoint.get(id + ':TO');
        projected.from = from.instanceId; projected.fromPort = from.terminalId;
        projected.to = to.instanceId; projected.toPort = to.terminalId;
      }
      if (connector) {
        projected.offPageConnectorId = connector.id;
        projected.xref = clone(connector.xref);
      }
      return projected;
    });
    const visibleNetIds = unique(pageCircuits.map((circuit) => circuit.netId)).sort(compare);
    const pageNets = visibleNetIds.map((id) => {
      const source = netById.get(id);
      if (!source) throw new SheetRenderingError('PAGE_NET_UNKNOWN', 'Missing page net ' + id + '.');
      const copy = clone(source);
      copy.members = unique(pageCircuits.filter((circuit) => circuit.netId === id).flatMap((circuit) => [
        circuit.from + ':' + circuit.fromPort, circuit.to + ':' + circuit.toPort
      ])).sort(compare).map((ref) => {
        const split = ref.indexOf(':');
        return { instanceId: ref.slice(0, split), terminalId: ref.slice(split + 1) };
      });
      return copy;
    });
    const pageModel = {
      schema: PAGE_MODEL_SCHEMA,
      schemaVersion: '1.0.0',
      authoritative: false,
      sourceModelHash: design.modelHash,
      sourceSchema: design.schema,
      sheetId: sheet.id,
      instances: graphicalInstances.sort((a, b) => compare(a.id, b.id)),
      equipment: null,
      nets: pageNets,
      circuits: pageCircuits,
      requirements: clone(design.requirements || {})
    };
    pageModel.equipment = pageModel.instances;
    pageModel.projectionHash = runtime().document.hash({
      sourceModelHash: design.modelHash, sheetId: sheet.id,
      instances: pageModel.instances, nets: pageModel.nets, circuits: pageModel.circuits
    });
    return { pageModel: deepFreeze(pageModel), graphicUnitManifest: deepFreeze(graphicUnitManifest),
      offPageBanks: deepFreeze(offPageBanks), maxEndpoints };
  }

  function emptyCompiled(dependencies, pageModel, sheet) {
    const sheetInfo = dependencies.placement.chooseDrawingSheet(1500, 930);
    const annotations = [{
      id: 'SHEET:' + sheet.id + ':EMPTY', kind: 'text', layer: 'EVSE-TEXT',
      annotationRole: 'empty-sheet-note', x: 100, y: 120,
      text: '本配置不需要此功能单元；页次保留以维持受控图册编号。', height: 13
    }];
    const drawingIR = dependencies.drawingIR.buildDrawingIR({
      devices: [], routes: [], annotations, model: pageModel,
      metadata: { sourceModelHash: pageModel.sourceModelHash, sheetId: sheet.id,
        projectionSchema: PAGE_MODEL_SCHEMA, emptySheet: true }, strict: false
    });
    const plan = Object.freeze({
      schema: 'EVSE-SCHEMATIC-PLACEMENT/1.2', version: VERSION,
      width: sheetInfo.canvasWidth, height: sheetInfo.canvasHeight,
      requiredWidth: 1500, requiredHeight: 930, sheet: sheetInfo,
      content: Object.freeze({ left: 40, top: 68, right: 1500, bottom: 930 }),
      schedule: Object.freeze({ x: 0, y: 0, width: 0, included: false }),
      zones: Object.freeze([]), readability: Object.freeze({ terminalPitchMin: 12, routeLanePitchMin: 10 }),
      rows: 0, columns: 0
    });
    return Object.freeze({ schema: plan.schema, version: VERSION, drawingIR, plan,
      instances: Object.freeze([]), modelInstances: Object.freeze([]), nets: Object.freeze([]),
      circuits: Object.freeze([]), routedCircuits: Object.freeze([]), aliasTraces: Object.freeze([]),
      sheets: Object.freeze([{ index: sheet.page, total: sheet.total, drawingIR, plan }]) });
  }

  /* v2.7.1-FIX-G1: 导线编号（线号）生成。
   * ------------------------------------------------------------------
   * 三家平台此前都没有线号：施工查线、端子排配线、故障定位全部依赖线号，
   * 没有它图纸无法用于接线。这里以**确定性派生**的方式补齐，且不引入任何
   * 新的真值来源：
   *   · 线号 = 'W' + circuitId 的数字部分（CCT-0125 → W0125）。
   *     circuitId 本就是 EDEM 回路身份，因此线号与电气真值一一对应、可逆追溯，
   *     且随模型确定性地变化，不需要独立编号表。
   *   · 只对**本页物理导线**编号（跨页回路的两端各有一个续接符，按本页段编号）。
   *   · 注记在编译期登记为 IR annotation → 自动进入 primitives →
   *     因此能通过平台自身的反读审计（该审计要求图面每个文字都在 IR 中登记）。
   *   · 数量受限：超过上限时按网络类别优先级截断，宁可少标也不把图面糊死。
   */
  const WIRE_NUMBER_LIMIT = 48;
  const WIRE_NET_PRIORITY = ['POWER_AC', 'POWER_DC', 'POWER_DC_ESS', 'POWER_DC_AUX', 'PROTECTIVE_EARTH', 'SIGNAL_CTRL', 'SIGNAL_COMM'];

  function conductorNumber(circuitId) {
    const digits = String(circuitId || '').match(/(\d+)\s*$/);
    if (!digits) return '';
    return 'W' + digits[1].padStart(4, '0');
  }

  /* 文字宽度估算：与 visual-quality-audit 的 estimateTextWidth 同口径
   * （ASCII 0.58、宽字符 1.0、空白 0.35 倍字号 + padding 0.6），
   * 使预留占位区与实际审计判定一致，避免「我算不撞、审计判撞」。 */
  function estimateLabelWidth(value, height) {
    let width = 0;
    Array.from(String(value || '')).forEach((character) => {
      const code = character.codePointAt(0);
      if (/\s/u.test(character)) { width += height * 0.35; return; }
      const wide = code >= 0x1100 && (
        code <= 0x115f || code === 0x2329 || code === 0x232a ||
        (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe10 && code <= 0xfe19) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6));
      width += height * (wide ? 1.0 : 0.58);
    });
    return width;
  }

  function labelBox(item) {
    const width = estimateLabelWidth(item.text, item.height);
    const halfHeight = item.height * 0.68;
    /* 保留平台审计同款 padding（0.6），否则我算"刚好不撞"而审计判"撞"。 */
    const pad = 0.6;
    const radians = (Number(item.rotation) || 0) * Math.PI / 180;
    if (Math.abs(radians) < 1e-9) {
      return { xMin: item.x - width / 2 - pad, xMax: item.x + width / 2 + pad, yMin: item.y - halfHeight - pad, yMax: item.y + halfHeight + pad };
    }
    /* 旋转 90°（竖排线号）：长边沿 y 轴、短边沿 x 轴 */
    return { xMin: item.x - halfHeight - pad, xMax: item.x + halfHeight + pad, yMin: item.y - width / 2 - pad, yMax: item.y + width / 2 + pad };
  }

  function boxesOverlap(left, right) {
    return left.xMin < right.xMax && right.xMin < left.xMax && left.yMin < right.yMax && right.yMin < left.yMax;
  }

  /* 交叠面积占"较小盒子"的比例。用于允许小幅压边而不允许实质重叠。 */
  function overlapRatio(left, right) {
    if (!boxesOverlap(left, right)) return 0;
    const width = Math.min(left.xMax, right.xMax) - Math.max(left.xMin, right.xMin);
    const height = Math.min(left.yMax, right.yMax) - Math.max(left.yMin, right.yMin);
    if (width <= 0 || height <= 0) return 0;
    const intersection = width * height;
    const leftArea = (left.xMax - left.xMin) * (left.yMax - left.yMin);
    const rightArea = (right.xMax - right.xMin) * (right.yMax - right.yMin);
    const smaller = Math.min(leftArea, rightArea);
    return smaller > 0 ? intersection / smaller : 0;
  }

  function wireNumberAnnotations(routes, devices, sheetId, textPrimitives) {
    /* 1) 收集既占区域：器件外框 + 每段导线本身。
     *    线号不能压在器件体或其他导线上；但允许紧贴**它自己所属的那条导线**
     *    （线号本来就该标在自己的线上，把自己也算作障碍物会导致全部放不下）。 */
    const deviceAreas = [];
    (devices || []).forEach((device) => {
      const bbox = device && device.bbox;
      if (bbox) deviceAreas.push({ xMin: bbox.xMin, xMax: bbox.xMax, yMin: bbox.yMin, yMax: bbox.yMax });
    });
    /* 导线障碍：直接保存线段本身，判定时用与审计同口径的
     * segmentIntersectsBox（严格穿过），因此线号可以紧贴导线放在相邻道间，
     * 只要不被导线"穿过"即可。 */
    const otherSegments = [];
    (routes || []).forEach((route) => {
      (route.segments || []).forEach((segment) => otherSegments.push(segment));
    });
    /* 已存在的图面文字障碍：**必须包含器件位号/规格等标签**。
     * 实测器件标签（如 "A1.2/4"）画在器件外框之上或外侧，只避让 bbox
     * 仍会与它相撞（eu/chademo × ac-dc-combo 各出现 1 处 VIS-003）。 */
    const otherTexts = [];
    (textPrimitives || []).forEach((primitive) => {
      const width = estimateLabelWidth(primitive.text, primitive.height);
      const halfHeight = primitive.height * 0.68;
      const pad = 0.6;
      otherTexts.push({
        xMin: primitive.x - width / 2 - pad, xMax: primitive.x + width / 2 + pad,
        yMin: primitive.y - halfHeight - pad, yMax: primitive.y + halfHeight + pad
      });
    });
    /* 已放置的线号占位 */
    const placedLabels = [];

    const candidates = [];
    /* 先收集全部线路的候选落点池（不做重叠判定），随后按网络类别优先级排序
     * 再依次放置——高优先级线路先占位，避免控制线把主线位置抢光。 */
    const pooled = [];
    (routes || []).forEach((route) => {
      const label = conductorNumber(route.circuitId);
      if (!label) return;
      const segments = (Array.isArray(route.segments) ? route.segments : [])
        .map((segment) => ({
          segment,
          length: Math.abs(segment.x2 - segment.x1) + Math.abs(segment.y2 - segment.y1)
        }))
        .sort((left, right) => right.length - left.length);
      const labelWidth = estimateLabelWidth(label, 7.5);
      const usable = segments.filter((item) => item.length >= labelWidth + 10);
      if (!usable.length) return;
      const spots = [];
      /* 多个偏移量：布线道距为 8，故 4.5 落在相邻道之间，9/13.5 用于越过
       * 被占用的一条道。偏移越多，越有机会找到不压线的位置。 */
      const offsets = [4.5, -4.5, 9, -9, 13.5, -13.5];
      usable.slice(0, 3).forEach((item) => {
        const segment = item.segment;
        const horizontal = segment.orientation === 'horizontal';
        const midX = (segment.x1 + segment.x2) / 2;
        const midY = (segment.y1 + segment.y2) / 2;
        const lowX = Math.min(segment.x1, segment.x2) + labelWidth / 2 + 3;
        const highX = Math.max(segment.x1, segment.x2) - labelWidth / 2 - 3;
        const lowY = Math.min(segment.y1, segment.y2) + labelWidth / 2 + 3;
        const highY = Math.max(segment.y1, segment.y2) - labelWidth / 2 - 3;
        const alongX = [midX, midX - item.length * 0.28, midX + item.length * 0.28, lowX, highX];
        const alongY = [midY, midY - item.length * 0.28, midY + item.length * 0.28, lowY, highY];
        if (horizontal) {
          alongX.forEach((x) => offsets.forEach((off) => spots.push({ x, y: midY + off, rotation: 0 })));
        } else {
          alongY.forEach((y) => offsets.forEach((off) => spots.push({ x: midX + off, y, rotation: -90 })));
        }
      });
      pooled.push({ label, routeId: route.id, netClass: String(route.netClass || ''), spots });
    });

    /* 稳定排序：先按网络类别优先级，再按线号，保证同一输入产生同一张图。 */
    pooled.sort((left, right) => {
      const leftRank = WIRE_NET_PRIORITY.indexOf(left.netClass);
      const rightRank = WIRE_NET_PRIORITY.indexOf(right.netClass);
      const leftKey = leftRank < 0 ? WIRE_NET_PRIORITY.length : leftRank;
      const rightKey = rightRank < 0 ? WIRE_NET_PRIORITY.length : rightRank;
      if (leftKey !== rightKey) return leftKey - rightKey;
      return left.label < right.label ? -1 : left.label > right.label ? 1 : 0;
    });

    pooled.forEach((item) => {
      const label = item.label;
      const fits = () => item.spots.find((candidate) => {
        if (candidate.x < 30 || candidate.x > 3300 || candidate.y < 40 || candidate.y > 2330) return false;
        const box = labelBox({ text: label, height: 7.5, x: candidate.x, y: candidate.y, rotation: candidate.rotation });
        /* ① 不得被任何导线穿过（与审计同口径）
         * ② 不得压在其他线号上
         * ③ 与器件体最多 20% 压边（引脚区允许轻微压边，实体区不允许） */
        if (otherSegments.some((segment) => segmentIntersectsBox(segment, box))) return false;
        if (placedLabels.some((area) => overlapRatio(box, area) > 0)) return false;
        if (otherTexts.some((area) => overlapRatio(box, area) > 0)) return false;
        /* 器件体零容差：审计对任何进入器件外框的文字都记 VIS-004。 */
        return !deviceAreas.some((area) => overlapRatio(box, area) > 0);
      });
      const spot = fits();
      if (!spot) return;
      placedLabels.push(labelBox({ text: label, height: 7.5, x: spot.x, y: spot.y, rotation: spot.rotation }));
      candidates.push({ label, routeId: item.routeId, netClass: item.netClass, x: spot.x, y: spot.y, rotation: spot.rotation });
    });
    /* 放置后收敛：若有线号仍与"其他线号"重叠，按最坏重叠度从大到小逐个移除，
     * 直到线号之间零重叠。这样保证线号本身清晰可读；线号与导线/器件之间的
     * 压边仍受分级容差约束。移除是确定性的（排序稳定），不引入随机性。 */
    const conflicts = [];
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const left = labelBox({ text: candidates[i].label, height: 7.5, x: candidates[i].x, y: candidates[i].y, rotation: candidates[i].rotation });
        const right = labelBox({ text: candidates[j].label, height: 7.5, x: candidates[j].x, y: candidates[j].y, rotation: candidates[j].rotation });
        const ratio = overlapRatio(left, right);
        if (ratio > 0) conflicts.push({ i, j, ratio });
      }
    }
    const dropped = new Set();
    conflicts.sort((left, right) => right.ratio - left.ratio);
    conflicts.forEach((conflict) => {
      if (dropped.has(conflict.i) || dropped.has(conflict.j)) return;
      /* 保留先放置者（优先级更高），移除后放置者。 */
      dropped.add(conflict.j);
    });
    const finalCandidates = candidates.filter((_, index) => !dropped.has(index));

    return finalCandidates.slice(0, WIRE_NUMBER_LIMIT).map((item) => ({
      id: 'WIRE-NUMBER:' + sheetId + ':' + item.label,
      kind: 'text',
      layer: 'EVSE-TEXT',
      annotationRole: 'conductor-number',
      x: item.x,
      y: item.y,
      text: item.label,
      height: 7.5,
      rotation: item.rotation,
      anchor: 'middle',
      routeId: item.routeId,
      circuitNumber: item.label
    }));
  }

  /* 与 visual-quality-audit 的 segmentIntersectsBox 同口径：导线必须**穿过**
   * 文字框内部才算碰撞（严格内部判定，不含边界）。用带容差的盒子重叠会与
   * 审计结论不一致，导致"我算不撞、审计判撞"（实测出现 270 处 VIS-005）。 */
  function segmentIntersectsBox(segment, box) {
    const x1 = Number(segment && segment.x1);
    const y1 = Number(segment && segment.y1);
    const x2 = Number(segment && segment.x2);
    const y2 = Number(segment && segment.y2);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return false;
    const EPS = 1e-6;
    if (Math.abs(y1 - y2) <= EPS) {
      return y1 > box.yMin + EPS && y1 < box.yMax - EPS &&
        Math.max(x1, x2) > box.xMin + EPS && Math.min(x1, x2) < box.xMax - EPS;
    }
    if (Math.abs(x1 - x2) <= EPS) {
      return x1 > box.xMin + EPS && x1 < box.xMax - EPS &&
        Math.max(y1, y2) > box.yMin + EPS && Math.min(y1, y2) < box.yMax - EPS;
    }
    return boxesOverlap({ xMin: Math.min(x1, x2), yMin: Math.min(y1, y2), xMax: Math.max(x1, x2), yMax: Math.max(y1, y2) }, box);
  }

  function connectorSignature(connector) {
    const value = connector || {};
    const xref = value.xref || {};
    const from = value.from || {};
    const to = value.to || {};
    const local = value.localEndpoint || {};
    const remote = value.remoteEndpoint || {};
    return [
      text(value.id), text(value.peerConnectorId), text(value.circuitId), text(value.netId),
      text(value.netClass), text(value.role), text(value.direction),
      text(from.endpointKey), text(to.endpointKey), text(local.endpointKey), text(remote.endpointKey),
      text(value.localSheetId), text(value.remoteSheetId), text(xref.connectorId),
      text(xref.sheetId), text(xref.page), text(xref.drawingNo), text(xref.endpointKey)
    ].join('|');
  }

  function routeConnectorContract(sheet, compiled) {
    const expectedByCircuit = new Map((sheet.offPageConnectors || []).map((item) => [item.circuitId, item]));
    const errors = [];
    (compiled.drawingIR.routes || []).forEach((route) => {
      const expected = expectedByCircuit.get(route.circuitId) || null;
      const actual = route.offPageConnector || null;
      if (!expected && actual) errors.push('UNEXPECTED:' + route.circuitId + ':' + text(actual.id));
      else if (expected && !actual) errors.push('MISSING:' + route.circuitId + ':' + expected.id);
      else if (expected && connectorSignature(expected) !== connectorSignature(actual)) {
        errors.push('MISMATCH:' + route.circuitId + ':' + text(actual && actual.id));
      }
    });
    expectedByCircuit.forEach((connector, circuitId) => {
      const matches = (compiled.drawingIR.routes || []).filter((route) => route.circuitId === circuitId);
      if (matches.length !== 1) errors.push('CARDINALITY:' + circuitId + ':' + matches.length);
    });
    return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(unique(errors).sort(compare)) });
  }

  function connectorMarkupPresent(svg, connector) {
    const source = String(svg || '');
    const attrs = {
      'data-off-page-connector': connector.id,
      'data-peer-connector': connector.peerConnectorId,
      'data-circuit': connector.circuitId,
      'data-net': connector.netId,
      'data-local-sheet': connector.localSheetId,
      'data-remote-sheet': connector.remoteSheetId,
      'data-remote-page': connector.xref && connector.xref.page,
      'data-remote-drawing-no': connector.xref && connector.xref.drawingNo,
      'data-remote-endpoint': connector.xref && connector.xref.endpointKey
    };
    return Object.keys(attrs).every((name) => source.includes(name + '="' + text(attrs[name]) + '"'));
  }

  function pageCoverage(design, sheet, compiled, svg) {
    const expected = unique(sheet.internalCircuitIds.concat(sheet.crossCircuitIds)).sort(compare);
    const actual = compiled.drawingIR.routes.concat(compiled.drawingIR.aliasTraces || [])
      .map((trace) => trace.circuitId).sort(compare);
    const circuitById = new Map(design.circuits.map((circuit) => [circuit.id, circuit]));
    const exact = compiled.drawingIR.routes.every((route) => {
      const source = circuitById.get(route.circuitId);
      return source && route.globalSource && route.globalTarget &&
        route.globalSource.ref === source.from + ':' + source.fromPort &&
        route.globalTarget.ref === source.to + ':' + source.toPort;
    });
    const connectorIds = sheet.offPageConnectors.map((connector) => connector.id).sort(compare);
    const renderedConnectorIds = sheet.offPageConnectors.filter((connector) => connectorMarkupPresent(svg, connector))
      .map((connector) => connector.id).sort(compare);
    const connectorContract = routeConnectorContract(sheet, compiled);
    const ok = compiled.drawingIR.coverage && compiled.drawingIR.coverage.ok &&
      JSON.stringify(expected) === JSON.stringify(actual) && exact &&
      connectorContract.ok && renderedConnectorIds.length === connectorIds.length;
    return Object.freeze({
      ok, status: ok ? 'PASS' : 'BLOCKED', code: ok ? 'EXACT_PAGE_PROJECTION' : 'PAGE_PROJECTION_INCOMPLETE',
      expectedCircuitCount: expected.length, renderedCircuitCount: actual.length,
      expectedOffPageConnectorCount: connectorIds.length,
      renderedOffPageConnectorCount: renderedConnectorIds.length,
      exactGlobalEndpoints: exact,
      exactOffPageConnectors: connectorContract.ok,
      offPageConnectorErrors: connectorContract.errors,
      drawingIRCoverage: compiled.drawingIR.coverage
    });
  }

  function pagePresentationQuality(sheet, compiled, coverage, svg) {
    const dependencies = runtime();
    const ir = compiled && compiled.drawingIR || {};
    const plan = compiled && compiled.plan || {};
    const devices = Array.isArray(ir.devices) ? ir.devices : [];
    const routes = Array.isArray(ir.routes) ? ir.routes : [];
    const checks = [];
    function add(code, ok, severity, detail, evidence) {
      checks.push(Object.freeze({ code, ok: !!ok, severity, detail,
        evidence: Object.freeze((Array.isArray(evidence) ? evidence : []).slice()) }));
    }
    /* Bboxes are reconstructed from absolute floating-point coordinates, so
       an exact 240-unit body can read back as 240.00000000000045.  Keep the
       engineering limit exact while tolerating only numeric round-off. */
    const sizeEpsilon = 1e-7;
    const oversize = devices.filter((device) => Number(device.bbox && device.bbox.height) > 300 + sizeEpsilon ||
      Number(device.bbox && device.bbox.width) > 240 + sizeEpsilon).map((device) => device.id);
    const fallbacks = devices.filter((device) => device.symbolFallback === true).map((device) => device.id);
    const duplicateCircuits = routes.map((route) => route.circuitId)
      .filter((id, index, values) => values.indexOf(id) !== index);
    const readability = plan.readability || {};
    const sheetInfo = plan.sheet || {};
    const svgText = String(svg || '');
    const expectedGeometryHash = dependencies.drawingIR.drawingIRHash(ir);
    let freshGeometry;
    try { freshGeometry = dependencies.drawingIR.analyzeGeometry(ir); }
    catch (error) {
      freshGeometry = { ok: false, violations: [{ code: 'GEOMETRY_REANALYSIS_FAILED', detail: error.message }] };
    }
    const renderedGeometry = dependencies.renderedSvgAudit.audit(svgText, ir,
      root && root.SYM && root.SYM.C || {});
    const visualQuality = dependencies.visualQualityAudit.audit(ir);
    const offPageLabelClearance =
      dependencies.visualQualityAudit.auditOffPageConnectorLabelClearance(ir);
    const connectorContract = routeConnectorContract(sheet, compiled);
    const connectorIssues = (sheet.offPageConnectors || []).filter((connector) =>
      !connector.id || !connector.peerConnectorId || !connector.circuitId || !connector.netId ||
      !connector.xref || !connector.xref.sheetId || !connector.xref.drawingNo || !connector.xref.endpointKey)
      .map((connector) => connector.id || connector.circuitId || 'UNKNOWN')
      .concat(connectorContract.errors);

    add('PAGE-Q01-COVERAGE', coverage && coverage.ok, 'BLOCKING',
      '本页每条回路必须由一条内部导线或一个精确跨页续接端表示。', coverage && coverage.drawingIRCoverage && coverage.drawingIRCoverage.errors);
    add('PAGE-Q02-GEOMETRY', freshGeometry.ok === true, 'BLOCKING',
      '本页在闸门执行时重新计算几何，不得存在穿器件、不同网误接、共线重叠或非法自交。',
      freshGeometry.violations || []);
    add('PAGE-Q03-UNIQUE-CIRCUIT', duplicateCircuits.length === 0, 'BLOCKING',
      '同一页面内每个 circuitId 只能对应一条可选择导线。', unique(duplicateCircuits));
    add('PAGE-Q04-SYMBOL-RESOLUTION', fallbacks.length === 0, 'BLOCKING',
      '页面器件必须解析到受控符号，禁止静默回退通用方框。', fallbacks);
    add('PAGE-Q05-FANOUT-BOUND', oversize.length === 0, 'BLOCKING',
      '高扇出器件必须拆为可追溯图形分段，单个图形框不得超过 240×300 图形单位。', oversize);
    add('PAGE-Q06-READABILITY', Number(readability.terminalPitchMin || 0) >= 10 &&
      Number(readability.routeLanePitchMin || 0) >= 8, 'BLOCKING',
      '端子间距和路由 lane 间距必须满足页面可读性下限。', [readability]);
    add('PAGE-Q07-XREF-CONTRACT', connectorIssues.length === 0 &&
      Number(coverage && coverage.renderedOffPageConnectorCount || 0) === (sheet.offPageConnectors || []).length,
    'BLOCKING', '跨页续接符必须具有成对 ID、目标页、图号和远端精确 PIN。', connectorIssues);
    add('PAGE-Q08-DOCUMENT', /^<svg\b/.test(svgText) && /<\/svg>\s*$/.test(svgText) &&
      !/\b(?:undefined|NaN|Infinity|-Infinity)\b/.test(svgText) &&
      svgText.includes('data-sheet-id="' + sheet.id + '"') &&
      svgText.includes('data-geometry-hash="' + expectedGeometryHash + '"') &&
      svgText.includes('data-route-count="' + routes.length + '"'), 'BLOCKING',
      '页面必须是完整 SVG，并携带与当前 Drawing IR 一致的页号、几何哈希和路由数量。');
    add('PAGE-Q09-STANDARD-SHEET', text(sheetInfo.format) !== 'CUSTOM', 'REVIEW',
      text(sheetInfo.format) === 'CUSTOM'
        ? '内容超过 A0，需由工程师决定继续分页或批准自定义图幅。'
        : '页面已装入 A3/A2/A1/A0 标准图幅。', [sheetInfo.format]);
    add('PAGE-Q10-RENDERED-SVG', renderedGeometry.ok === true, 'BLOCKING',
      '独立读取最终 SVG 的每段导线、跨线、选线层、端子、符号和页面骨架，必须与当前 Drawing IR 完全相符。',
      renderedGeometry.errors || []);
    add('PAGE-Q11-VISUAL-CLEARANCE', visualQuality.ok === true, 'REVIEW',
      '文字与导线、不同器件文字、功能分区标题之间应保留可读间距；该项使用确定性保守字宽估算，命中时须人工复核。',
      visualQuality.findings || []);
    add('PAGE-Q12-OFFPAGE-LABEL-CLEARANCE', offPageLabelClearance.ok === true, 'BLOCKING',
      '每个跨页续接属性文字必须与小三角、短引线、端子及同组相邻属性文字保持最小净距；无法证明时禁止交付。',
      offPageLabelClearance.findings || []);

    const blocking = checks.filter((item) => !item.ok && item.severity === 'BLOCKING');
    const review = checks.filter((item) => !item.ok && item.severity === 'REVIEW');
    return Object.freeze({
      status: blocking.length ? 'BLOCKED' : review.length ? 'REVIEW_REQUIRED' : 'PASS',
      code: blocking.length ? 'PAGE_PRESENTATION_BLOCKED' : review.length ? 'PAGE_PRESENTATION_REVIEW_REQUIRED' : 'PAGE_PRESENTATION_PASS',
      blockingCount: blocking.length,
      reviewCount: review.length,
      checks: Object.freeze(checks),
      freshGeometry: Object.freeze(freshGeometry),
      renderedGeometry,
      visualQuality,
      offPageLabelClearance
    });
  }

  function evaluatePage(result, documentValue, sheetId, compiled, svg) {
    const checked = assertInputs(result, documentValue, sheetId);
    const drawingIR = compiled && compiled.drawingIR;
    if (!drawingIR) throw new SheetRenderingError('PAGE_DRAWING_IR_REQUIRED',
      'A rendered or edited page Drawing IR is required for the page gate.');
    const coverage = pageCoverage(checked.design, checked.sheet, compiled, String(svg || ''));
    const quality = pagePresentationQuality(checked.sheet, compiled, coverage, svg);
    const currentViolations = quality.freshGeometry && quality.freshGeometry.violations || [];
    const drawing = Object.freeze({
      allowed: quality.freshGeometry && quality.freshGeometry.ok === true,
      status: quality.freshGeometry && quality.freshGeometry.ok === true ? 'PASS' : 'BLOCKED',
      code: quality.freshGeometry && quality.freshGeometry.ok === true ? 'PAGE_GEOMETRY_PASS' : 'PAGE_GEOMETRY_BLOCKED',
      blockingCount: currentViolations.length || (quality.freshGeometry && quality.freshGeometry.ok === true ? 0 : 1)
    });
    const status = !drawing.allowed || !coverage.ok || quality.status === 'BLOCKED' ? 'BLOCKED' :
      quality.status === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'PASS';
    return Object.freeze({ status, allowed: status !== 'BLOCKED', drawing, quality, coverage,
      renderedGeometry: quality.renderedGeometry, visualQuality: quality.visualQuality,
      offPageLabelClearance: quality.offPageLabelClearance });
  }

  function compilePage(result, documentValue, sheetId, options) {
    const dependencies = runtime();
    const checked = assertInputs(result, documentValue, sheetId);
    const sourceSnapshot = JSON.stringify(checked.design);
    const projection = makeProjection(result, documentValue, checked.sheet, options || {});
    const placementOptions = Object.assign({
      /* Cross-sheet PIN labels retain the exact remote endpoint.  Permit the
         existing page-quality ceiling so those labels stay inside their IEC
         connector bank instead of protruding into an adjacent routing lane. */
      deviceWidth: 118, maximumDeviceWidth: 240, minimumDeviceHeight: 58,
      portPitch: 12, lanePitch: 8, channelInset: 14,
      minimumHorizontalGap: 70, minimumVerticalGap: 74, zoneStackLimit: 5,
      essFoldColumnLimit: 12,
      left: 40, top: 68, rightMargin: 40, bottomMargin: 330,
      scheduleWidth: 0, includeSchedule: false
    }, options && options.placement || {});
    let placed = projection.pageModel.circuits.length
      ? dependencies.placement.compile(projection.pageModel, placementOptions)
      : emptyCompiled(dependencies, projection.pageModel, checked.sheet);
    const instanceMetadata = new Map(projection.pageModel.instances.map((instance) => [instance.id, instance]));
    const circuitById = new Map(checked.design.circuits.map((circuit) => [circuit.id, circuit]));
    const connectorByCircuit = new Map(checked.sheet.offPageConnectors.map((connector) => [connector.circuitId, connector]));
    const devices = placed.drawingIR.devices.map((device) => {
      const metadata = instanceMetadata.get(device.id) || {};
      return Object.freeze(Object.assign({}, device, {
        modelInstanceId: metadata.modelInstanceId || metadata.graphicalRepresentationOf || metadata.id || '',
        graphicalRepresentationOf: metadata.graphicalRepresentationOf || metadata.modelInstanceId || metadata.id || '',
        graphicUnitIndex: metadata.graphicUnitIndex || 1,
        graphicUnitCount: metadata.graphicUnitCount || 1,
        projectionRole: metadata.projectionRole || '',
        offPageConnectors: Object.freeze((metadata.offPageConnectors || []).map(clone))
      }));
    });
    const routes = placed.drawingIR.routes.map((route) => {
      const circuit = circuitById.get(route.circuitId);
      const connector = connectorByCircuit.get(route.circuitId) || null;
      if (!circuit) throw new SheetRenderingError('RENDERED_CIRCUIT_UNKNOWN',
        'Rendered page route has no authoritative circuit ' + route.circuitId + '.');
      return Object.freeze(Object.assign({}, route, {
        globalSource: Object.freeze({ ref: circuit.from + ':' + circuit.fromPort,
          deviceId: circuit.from, portId: circuit.fromPort,
          physicalRef: circuit.from + ':' + circuit.fromPort }),
        globalTarget: Object.freeze({ ref: circuit.to + ':' + circuit.toPort,
          deviceId: circuit.to, portId: circuit.toPort,
          physicalRef: circuit.to + ':' + circuit.toPort }),
        offPageConnector: connector ? deepFreeze(clone(connector)) : null
      }));
    });
    const drawingIR = dependencies.drawingIR.buildDrawingIR({
      devices, routes, aliasTraces: placed.drawingIR.aliasTraces,
      /* v2.7.1-FIX-G1: 并入导线编号注记（编译期登记，故可通过反读审计）。 */
      annotations: placed.drawingIR.annotations.concat(wireNumberAnnotations(
        routes, devices, checked.sheet.id,
        (placed.drawingIR.primitives || []).filter((primitive) => primitive.kind === 'text'))),
      model: projection.pageModel,
      metadata: Object.assign({}, placed.drawingIR.metadata, {
        sourceModelHash: checked.design.modelHash,
        projectionHash: projection.pageModel.projectionHash,
        projectionSchema: PAGE_MODEL_SCHEMA,
        authoritative: false,
        sheetId: checked.sheet.id,
        drawingNo: checked.sheet.drawingNo,
        page: checked.sheet.page,
        pageTotal: checked.sheet.total,
        maxEndpointsPerGraphicUnit: projection.maxEndpoints
      }),
      unit: 'mm', yAxis: 'down', strict: false
    });
    if (drawingIR.violations.length || !drawingIR.coverage || !drawingIR.coverage.ok) {
      throw new SheetRenderingError('PAGE_GEOMETRY_BLOCKED',
        'Sheet ' + checked.sheet.id + ' failed its graphical projection gate.', {
          violations: drawingIR.violations, coverage: drawingIR.coverage
        });
    }
    placed = Object.freeze(Object.assign({}, placed, {
      drawingIR,
      instances: projection.pageModel.instances,
      modelInstances: projection.pageModel.instances,
      nets: projection.pageModel.nets,
      circuits: projection.pageModel.circuits,
      routedCircuits: projection.pageModel.circuits,
      offPageConnectors: checked.sheet.offPageConnectors,
      sourceModelHash: checked.design.modelHash,
      projectionHash: projection.pageModel.projectionHash,
      sheets: Object.freeze([{ index: checked.sheet.page, total: checked.sheet.total,
        drawingIR, plan: placed.plan }])
    }));
    const renderOptions = Object.assign({}, options && options.render || {}, {
      title: checked.sheet.title,
      subtitle: checked.sheet.drawingNo + ' | ' + checked.sheet.purpose + ' | 图形投影·非权威 EDEM',
      sheetId: checked.sheet.id,
      drawingNo: checked.sheet.drawingNo,
      pageCurrent: checked.sheet.page,
      pageTotal: checked.sheet.total,
      sourceModelHash: checked.design.modelHash,
      includeSchedule: false,
      includeLegend: true,
      offPageConnectors: checked.sheet.offPageConnectors,
      projectionNote: '本页为不可编辑电气真值的图形投影；图形分段与跨页续接符均通过 circuitId/netId 追溯至全局 EDEM。'
    });
    const svg = dependencies.renderer.render(placed, result, renderOptions);
    const pageGate = evaluatePage(result, documentValue, checked.sheet.id, placed, svg);
    if (JSON.stringify(checked.design) !== sourceSnapshot) throw new SheetRenderingError('EDEM_MUTATED',
      'Sheet rendering changed the authoritative EDEM in memory.');
    const geometryHash = dependencies.drawingIR.drawingIRHash(drawingIR);
    return Object.freeze({
      schema: SCHEMA, version: VERSION, sheetId: checked.sheet.id,
      sheet: checked.sheet, compiled: placed, svg,
      pageModel: projection.pageModel, pageGate,
      geometryHash, projectionHash: projection.pageModel.projectionHash,
      sourceModelHash: checked.design.modelHash,
      offPageConnectors: checked.sheet.offPageConnectors,
      graphicUnitManifest: projection.graphicUnitManifest
    });
  }

  function evaluateDocument(result, renderedValue, replacements) {
    const dependencies = runtime();
    if (!result || !result.design) throw new SheetRenderingError('AUTHORITATIVE_EDEM_REQUIRED',
      'evaluateDocument requires an EVSE engine result.');
    const canonical = dependencies.document.compile(result.design);
    const originalPages = renderedValue && Array.isArray(renderedValue.pages) ? renderedValue.pages : [];
    const replacementMap = replacements || {};
    const pages = canonical.sheets.map((sheet) => {
      const candidate = replacementMap[sheet.id] || originalPages.find((page) => page.sheetId === sheet.id);
      if (!candidate || !candidate.compiled || !candidate.svg) {
        throw new SheetRenderingError('PAGE_RESULT_MISSING', 'Rendered sheet ' + sheet.id + ' is missing.', { sheetId: sheet.id });
      }
      if (text(candidate.sourceModelHash) !== text(result.design.modelHash)) {
        throw new SheetRenderingError('PAGE_MODEL_HASH_MISMATCH', 'Rendered sheet ' + sheet.id + ' belongs to another EDEM.', {
          sheetId: sheet.id, pageModelHash: candidate.sourceModelHash, designModelHash: result.design.modelHash
        });
      }
      const gate = evaluatePage(result, canonical, sheet.id, candidate.compiled, candidate.svg);
      return Object.freeze(Object.assign({}, candidate, { sheet, pageGate: gate }));
    });
    const pageGates = {};
    pages.forEach((page) => {
      pageGates[page.sheetId] = {
        drawing: page.pageGate.drawing,
        quality: page.pageGate.quality,
        coverage: page.pageGate.coverage
      };
    });
    const connectorErrors = [];
    canonical.sheets.forEach((sheet) => {
      const page = pages.find((item) => item.sheetId === sheet.id);
      const contract = page && routeConnectorContract(sheet, page.compiled);
      if (!contract || !contract.ok) connectorErrors.push.apply(connectorErrors,
        (contract && contract.errors || ['PAGE_MISSING']).map((item) => sheet.id + ':' + item));
    });
    const documentValue = dependencies.document.compile(result.design, {
      model: result.design.modelValidation || { status: 'PASS' },
      pages: pageGates,
      crossPageCoverage: connectorErrors.length
        ? { status: 'BLOCKED', code: 'CONNECTOR_PAIR_RENDER_MISMATCH', blockingCount: connectorErrors.length,
          errors: connectorErrors }
        : { status: 'PASS', code: 'ALL_CONNECTOR_PAIRS_RENDERED' }
    });
    return Object.freeze({
      schema: 'SCHEMATIC-RENDERED-DOCUMENT/1.0', version: VERSION,
      sourceModelHash: result.design.modelHash,
      document: documentValue,
      pages: Object.freeze(pages),
      status: documentValue.status,
      projectGate: documentValue.projectGate
    });
  }

  function buildDocument(result, options) {
    const dependencies = runtime();
    if (!result || !result.design) throw new SheetRenderingError('AUTHORITATIVE_EDEM_REQUIRED',
      'buildDocument requires an EVSE engine result.');
    const initial = dependencies.document.compile(result.design);
    const pages = initial.sheets.map((sheet) => compilePage(result, initial, sheet.id, options));
    return evaluateDocument(result, { pages });
  }

  return Object.freeze({
    VERSION, SCHEMA, PAGE_MODEL_SCHEMA, DEFAULT_MAX_ENDPOINTS,
    SheetRenderingError,
    compilePage, buildDocument, build: buildDocument,
    evaluatePage, evaluateDocument, pageCoverage, pagePresentationQuality,
    connectorSignature, routeConnectorContract
  });
});
