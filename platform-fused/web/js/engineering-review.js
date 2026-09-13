/* ============================================================
 * SchematicForge deterministic engineering-review envelope
 * ------------------------------------------------------------
 * This module does not ask a model to design, connect or approve anything.
 * It creates a bounded, reproducible review case from the authoritative
 * EDEM/result and normalises an optional AI observation as CANDIDATE data.
 * ============================================================ */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (root) root.SCHEMATIC_ENGINEERING_REVIEW = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window :
  (typeof globalThis !== 'undefined' ? globalThis : this), function (runtimeRoot) {
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA = 'schematic-engineering-review/v1';
  const CANDIDATE_SCHEMA = 'schematic-review-candidate/v1';
  const MAX_FINDINGS = 80;

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).sort().forEach((key) => {
        if (value[key] !== undefined) out[key] = stable(value[key]);
      });
      return out;
    }
    return value;
  }

  function hash(value) {
    const text = JSON.stringify(stable(value));
    let output = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      output ^= text.charCodeAt(index);
      output = Math.imul(output, 16777619);
    }
    return 'fnv1a32-' + (output >>> 0).toString(16).padStart(8, '0');
  }

  function cleanText(value, max) {
    return String(value == null ? '' : value)
      .replace(/\u0000/g, '')
      .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim()
      .slice(0, max || 1200);
  }

  function cleanList(value, maxItems, maxChars) {
    return (Array.isArray(value) ? value : [])
      .map((item) => cleanText(item, maxChars || 500))
      .filter(Boolean)
      .slice(0, maxItems || 20);
  }

  function finiteInteger(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
  }

  function resultStatus(value) {
    const status = cleanText(value, 40).toUpperCase();
    if (status === 'ACTIVE' || status === 'OK') return 'PASS';
    if (status === 'WARNING' || status === 'REVIEW_REQUIRED') return 'WARN';
    return ['PASS', 'WARN', 'BLOCKED', 'NOT_ASSESSED'].includes(status) ? status : 'NOT_ASSESSED';
  }

  function issue(id, severity, category, title, detail, evidence, source) {
    return {
      id: cleanText(id, 120),
      severity: ['BLOCK', 'ERROR', 'WARN', 'INFO'].includes(severity) ? severity : 'WARN',
      category: cleanText(category, 80) || 'GENERAL',
      title: cleanText(title, 240) || cleanText(id, 120),
      detail: cleanText(detail, 1400),
      evidence: cleanList(evidence, 20, 240),
      source: cleanText(source, 80) || 'DETERMINISTIC_RULE'
    };
  }

  function deterministicSeverity(entry, fallback) {
    const value = entry || {};
    const level = cleanText(value.severity, 30).toUpperCase();
    const status = cleanText(value.status || value.result, 30).toUpperCase();
    if (value.blocking === true || ['BLOCK', 'BLOCKING', 'BLOCKER', 'FATAL'].includes(level) ||
        ['BLOCKED', 'FATAL'].includes(status)) return 'BLOCK';
    if (level === 'ERROR') return 'ERROR';
    if (level === 'INFO' || status === 'NOT_ASSESSED') return 'INFO';
    if (level === 'WARN' || level === 'WARNING') return 'WARN';
    return fallback || 'WARN';
  }

  function deterministicFindings(result) {
    const findings = [];
    const model = result && result.design || {};
    const modelValidation = model.modelValidation || {};
    (modelValidation.violations || []).forEach((entry, index) => {
      findings.push(issue(
        entry.ruleId || entry.code || ('ERC-' + (index + 1)),
        deterministicSeverity(entry, 'WARN'),
        'ELECTRICAL_MODEL', entry.code || entry.ruleId || 'ERC issue', entry.message || entry.detail,
        [entry.instanceId, entry.netId, entry.circuitId, entry.terminalId].filter(Boolean), 'EDEM_ERC'
      ));
    });

    const quality = result && result.schematicQuality || {};
    (quality.checks || []).filter((entry) => entry && (!entry.ok || entry.result === 'NOT_ASSESSED')).forEach((entry) => {
      findings.push(issue(
        entry.ruleId || entry.id || 'QUALITY',
        deterministicSeverity(entry, entry.result === 'NOT_ASSESSED' ? 'INFO' : 'WARN'),
        entry.dimension || 'SCHEMATIC_QUALITY', entry.title || entry.rule || entry.ruleId,
        entry.detail || entry.message, entry.evidence || entry.evidenceRefs || [], 'QUALITY_RULE'
      ));
    });

    const skill = result && result.drawingSkill || {};
    Object.keys(skill.drawingAudits || {}).sort().forEach((drawingKey) => {
      const audit = skill.drawingAudits[drawingKey] || {};
      (audit.checks || []).filter((entry) => entry && !entry.ok).forEach((entry) => {
        findings.push(issue(
          entry.code || 'DRAWING', deterministicSeverity(entry, 'WARN'),
          'DRAWING_GEOMETRY', entry.code || 'Drawing issue', entry.detail || entry.message,
          [drawingKey], 'DRAWING_SKILL'
        ));
      });
    });

    (result && result.validation || []).filter((entry) => entry && entry.result !== 'CALCULATED').forEach((entry) => {
      findings.push(issue(
        entry.id || 'VALIDATION', entry.result === 'FAIL' ? 'BLOCK' : entry.result === 'NOT_CHECKED' ? 'INFO' : 'WARN',
        'ENGINEERING_VALIDATION', entry.rule || entry.id, entry.detail,
        (entry.evidence || []).concat(entry.ref ? [entry.ref] : []), 'VALIDATION_REGISTER'
      ));
    });

    (result && result.warnings || []).forEach((entry, index) => {
      findings.push(issue('ENGINE-WARN-' + String(index + 1).padStart(3, '0'), 'WARN', 'ENGINE_ASSUMPTION',
        '确定性引擎警告', entry, [], 'ENGINE'));
    });

    const severityOrder = { BLOCK: 0, ERROR: 1, WARN: 2, INFO: 3 };
    return findings
      .filter((entry) => entry.id)
      .sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity] ||
        left.category.localeCompare(right.category, 'en') || left.id.localeCompare(right.id, 'en'))
      .slice(0, MAX_FINDINGS);
  }

  function endpoint(value) {
    if (!value || typeof value !== 'object') return null;
    const instanceId = cleanText(value.instanceId || value.deviceId, 160);
    const terminalId = cleanText(value.terminalId || value.portId, 160);
    return instanceId && terminalId ? { instanceId, terminalId } : null;
  }

  function compactCircuit(circuit) {
    const from = endpoint(circuit && circuit.fromEndpoint) || endpoint({ instanceId: circuit && circuit.from, terminalId: circuit && circuit.fromPort });
    const to = endpoint(circuit && circuit.toEndpoint) || endpoint({ instanceId: circuit && circuit.to, terminalId: circuit && circuit.toPort });
    return {
      id: cleanText(circuit && circuit.id, 120), netId: cleanText(circuit && circuit.netId, 120),
      netClass: cleanText(circuit && circuit.netClass, 80), domain: cleanText(circuit && circuit.domain, 80),
      from, to
    };
  }

  function knowledgeSnapshot() {
    const evidence = runtimeRoot && runtimeRoot.EVSE_EVIDENCE_LIBRARY;
    const quality = runtimeRoot && runtimeRoot.EVSE_SCHEMATIC_QUALITY;
    const board = runtimeRoot && runtimeRoot.EVSE_BOARD_CIRCUIT_LIBRARY;
    const references = runtimeRoot && runtimeRoot.EVSE_REFERENCE_SYSTEM_LIBRARY;
    const templates = board && board.TEMPLATES || {};
    const systems = references && references.SYSTEMS || {};
    return {
      lifecyclePolicy: {
        deterministicRulesAreAuthoritative: true,
        projectExamplesAreReferenceOnly: true,
        observedExperienceRequiresEngineerReview: true,
        aiMayPromoteKnowledge: false
      },
      deterministicQualityRules: (quality && quality.RULES || []).map((entry) => ({
        id: cleanText(entry.id, 100), title: cleanText(entry.title, 260),
        dimension: cleanText(entry.dimension, 100), severity: cleanText(entry.severity, 60),
        description: cleanText(entry.description, 900),
        evidenceRefs: cleanList(entry.evidenceRefs, 12, 120)
      })),
      observedEngineeringExperience: (evidence && evidence.CLAIMS || []).map((entry) => ({
        id: cleanText(entry.id, 100), severity: cleanText(entry.severity, 60),
        statement: cleanText(entry.statement, 1000), sourceId: cleanText(entry.sourceId, 120),
        pages: Array.isArray(entry.pages) ? entry.pages.slice(0, 8) : [], lifecycle: 'OBSERVED_REVIEW_REQUIRED'
      })),
      boardTemplateIndex: Object.keys(templates).sort().map((id) => {
        const entry = templates[id] || {};
        return { id, name: cleanText(entry.name, 240), family: cleanText(entry.family, 100),
          componentCount: (entry.components || []).length, circuitCount: (entry.circuits || []).length,
          sourceRefs: (entry.sourceRefs || []).slice(0, 6) };
      }),
      projectReferenceIndex: Object.keys(systems).sort().map((id) => {
        const entry = systems[id] || {};
        return { id, name: cleanText(entry.name, 240), sourceId: cleanText(entry.sourceId, 120),
          deviceCount: (entry.devices || []).length, connectionCount: (entry.connections || []).length,
          functionalUnits: (entry.functionalUnits || []).map((unit) => cleanText(unit.name || unit.id, 180)).slice(0, 20),
          unresolvedCount: (entry.unresolved || []).length,
          automaticSelectionAllowed: entry.automaticSelectionAllowed === true };
      })
    };
  }

  function buildCase(result, options) {
    if (!result || typeof result !== 'object') throw new TypeError('A compiled engineering result is required.');
    const model = result.design;
    if (!model || !Array.isArray(model.instances) || !Array.isArray(model.nets) || !Array.isArray(model.circuits)) {
      throw new TypeError('The result must contain an authoritative EDEM design.');
    }
    const quality = result.schematicQuality || {};
    const drawingSkill = result.drawingSkill || {};
    const localFindings = deterministicFindings(result);
    const payload = {
      schema: SCHEMA,
      version: VERSION,
      subject: {
        projectId: cleanText(model.project && model.project.id, 160),
        projectName: cleanText(model.project && model.project.name || result.pileName, 240),
        modelSchema: cleanText(model.schema, 120),
        modelHash: cleanText(model.modelHash, 120),
        standardId: cleanText(result.standardId || model.requirements && model.requirements.standard, 80),
        archetype: cleanText(result.archetype && result.archetype.id || model.requirements && model.requirements.archetype, 80)
      },
      counts: {
        instances: model.instances.length, nets: model.nets.length, circuits: model.circuits.length,
        functionalUnits: finiteInteger(model.topology && model.topology.functionalUnits && model.topology.functionalUnits.length, 0)
      },
      gates: {
        model: resultStatus(model.modelValidation && model.modelValidation.status),
        drawing: resultStatus(drawingSkill.status),
        quality: resultStatus(quality.status),
        constructionRelease: cleanText(result.releaseGate && result.releaseGate.constructionStatus, 120) || 'BLOCKED'
      },
      assumptions: (result.assumptions || []).slice(0, 30).map((entry) => ({
        id: cleanText(entry.id, 120), value: cleanText(entry.value, 300), note: cleanText(entry.note, 700)
      })),
      circuits: model.circuits.slice(0, 600).map(compactCircuit),
      localFindings,
      knowledgeContext: knowledgeSnapshot(),
      reviewPolicy: {
        aiRole: 'OBSERVATION_ONLY', lifecycle: 'CANDIDATE',
        authoritativeSources: ['EDEM', 'ERC', 'DRAWING_IR', 'APPROVED_KNOWLEDGE'],
        forbiddenClaims: ['COMPLIANT', 'PRODUCTION_READY', 'APPROVED', 'SIGNED_OFF'],
        humanApprovalRequired: true,
        note: 'AI observations cannot modify the electrical model, approve a component, close an ERC issue or release a drawing.'
      }
    };
    if (options && options.file) {
      payload.attachment = {
        name: cleanText(options.file.name, 200), mimeType: cleanText(options.file.mimeType, 100),
        byteLength: finiteInteger(options.file.byteLength, 0), sha256: cleanText(options.file.sha256, 100)
      };
    }
    /* v2.7.1-INTEG-D1: 图面证据（drawing evidence）。
     * 修复前 buildCase 只含电路级事实（instances/nets/circuits），AI 拿不到
     * 「图上是怎么画的」—— 图幅、页数、器件摆放、走线数、跨页续接、反读审计
     * 与视觉质量结果全部缺失，导致所谓「AI 审图」实际上只能审模型，无法审图。
     * 现在把已渲染页面清单、Drawing IR 的几何摘要与各页反读/视觉审计结论
     * 一起交给 AI，使它具备真正的读图依据，同时仍只产出 CANDIDATE 意见。 */
    const rendered = options && options.rendered;
    if (rendered && Array.isArray(rendered.pages) && rendered.pages.length) {
      payload.drawingEvidence = {
        document: {
          sheetCount: rendered.pages.length,
          documentSetId: cleanText(rendered.document && rendered.document.documentSetId, 200),
          revision: cleanText(rendered.document && rendered.document.revision, 80),
          projectGate: rendered.projectGate ? resultStatus(rendered.projectGate.status) : 'NOT_EVALUATED',
          crossPageCoverage: rendered.projectGate && rendered.projectGate.crossPageCoverage
            ? resultStatus(rendered.projectGate.crossPageCoverage.status) : 'NOT_EVALUATED'
        },
        sheets: rendered.pages.slice(0, 12).map((page) => {
          const plan = page.compiled && page.compiled.plan || {};
          const sheetMeta = plan.sheet || {};
          const sheet = page.sheet || {};
          const ir = page.compiled && page.compiled.drawingIR || {};
          const gate = page.pageGate || {};
          const devices = Array.isArray(ir.devices) ? ir.devices : [];
          const routes = Array.isArray(ir.routes) ? ir.routes : [];
          /* 字段位置以实际结构为准：图幅在 compiled.plan.sheet，
           * 反读审计在 pageGate.renderedGeometry，视觉质量在 pageGate.visualQuality。 */
          const audit = gate.renderedGeometry || {};
          const visual = gate.visualQuality || {};
          const coverage = gate.coverage || {};
          return {
            sheetId: cleanText(sheet.id, 40),
            drawingNo: cleanText(sheet.drawingNo, 60),
            title: cleanText(sheet.title, 200),
            page: finiteInteger(sheet.page, 0),
            total: finiteInteger(sheet.total, 0),
            format: cleanText(sheetMeta.format || plan.format, 40),
            widthMm: finiteInteger(sheetMeta.widthMm, 0),
            heightMm: finiteInteger(sheetMeta.heightMm, 0),
            scale: cleanText(sheetMeta.scale, 40),
            deviceCount: devices.length,
            routeCount: routes.length,
            offPageConnectorCount: Array.isArray(page.offPageConnectors) ? page.offPageConnectors.length : 0,
            gate: resultStatus(gate.status),
            drawingGate: resultStatus(gate.drawing && gate.drawing.status),
            qualityGate: resultStatus(gate.quality && gate.quality.status),
            /* 反读审计：独立解析最终 SVG 的结果，是「图是否忠实于模型」的硬证据 */
            renderedSvgAudit: {
              status: resultStatus(audit.status || (audit.ok === true ? 'PASS' : '')),
              blockingCount: finiteInteger(audit.blockingCount, 0),
              renderedSegments: finiteInteger(audit.stats && audit.stats.renderedSegments, 0),
              primitives: finiteInteger(audit.stats && audit.stats.primitives, 0),
              errors: (Array.isArray(audit.errors) ? audit.errors : []).slice(0, 8)
                .map((e) => cleanText(e && (e.code + ' ' + (e.detail || '')), 200)).filter(Boolean)
            },
            /* 视觉质量：文字碰撞、越界等版面问题（此前完全没交给 AI） */
            visualQuality: {
              status: resultStatus(visual.status || (visual.ok === true ? 'PASS' : '')),
              reviewCount: finiteInteger(visual.reviewCount, 0),
              textCount: finiteInteger(visual.stats && visual.stats.textCount, 0),
              findings: (Array.isArray(visual.findings) ? visual.findings : []).slice(0, 8)
                .map((f) => cleanText(f && (f.code ? f.code + ' ' : '') + (f.detail || f.message || ''), 220)).filter(Boolean)
            },
            coverage: {
              ok: coverage.ok === true,
              exactGlobalEndpoints: coverage.exactGlobalEndpoints === true,
              modelDevices: finiteInteger(coverage.summary && coverage.summary.modelDevices, 0),
              drawingDevices: finiteInteger(coverage.summary && coverage.summary.drawingDevices, 0),
              modelRoutes: finiteInteger(coverage.summary && coverage.summary.modelCircuits, 0),
              drawingRoutes: finiteInteger(coverage.summary && coverage.summary.drawingRoutes, 0)
            },
            /* 供 AI 判断版面可读性的器件位置摘要（只给位号与包围盒，不给全部图元） */
            layout: devices.slice(0, 40).map((d) => ({
              ref: cleanText(d.tag || d.id, 60),
              x: finiteInteger(d.bbox && d.bbox.xMin, 0),
              y: finiteInteger(d.bbox && d.bbox.yMin, 0),
              w: finiteInteger(d.bbox && d.bbox.width, 0),
              h: finiteInteger(d.bbox && d.bbox.height, 0)
            }))
          };
        })
      };
    }
    payload.reviewCaseHash = hash(payload);
    return payload;
  }

  function normaliseCandidate(value, reviewCase) {
    const input = value && typeof value === 'object' ? value : {};
    const severity = { BLOCK: true, ERROR: true, WARN: true, INFO: true };
    const findings = (Array.isArray(input.findings) ? input.findings : []).slice(0, MAX_FINDINGS).map((entry, index) => {
      const rawLevel = cleanText(entry && entry.severity, 20).toUpperCase();
      const levelMap = { BLOCKER: 'BLOCK', MAJOR: 'ERROR', MINOR: 'WARN', INFO: 'INFO' };
      const level = levelMap[rawLevel] || rawLevel;
      const evidence = (Array.isArray(entry && entry.evidence) ? entry.evidence : []).map((item) => {
        if (typeof item === 'string') return item;
        if (!item || typeof item !== 'object') return '';
        return [cleanText(item.source, 100), cleanText(item.locator, 180), cleanText(item.observation, 300)]
          .filter(Boolean).join(' · ');
      }).filter(Boolean);
      const recommendation = cleanText(entry && entry.recommendation, 700);
      return issue(
        'AI-CAND-' + String(index + 1).padStart(3, '0'), severity[level] ? level : 'WARN',
        entry && (entry.category || entry.code), entry && entry.title,
        cleanText(entry && (entry.detail || entry.description), 900) +
          (recommendation ? '；建议复核：' + recommendation : ''),
        cleanList(evidence, 12, 500), 'AI_OBSERVATION'
      );
    });
    const unresolvedSource = Array.isArray(input.unresolvedItems) ? input.unresolvedItems : input.unresolved;
    const unresolvedItems = (Array.isArray(unresolvedSource) ? unresolvedSource : []).map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return '';
      return [cleanText(item.question, 300), cleanText(item.reason, 400),
        item.requiredEvidence ? '所需证据：' + cleanText(item.requiredEvidence, 400) : ''].filter(Boolean).join('；');
    });
    const output = {
      schema: CANDIDATE_SCHEMA, version: VERSION, lifecycle: 'CANDIDATE',
      approvalStatus: 'UNREVIEWED', modelMutationAllowed: false, releaseDecisionAllowed: false,
      reviewCaseHash: cleanText(reviewCase && reviewCase.reviewCaseHash || input.reviewCaseHash, 120),
      summary: cleanText(input.summary, 1800), findings,
      unresolvedItems: cleanList(unresolvedItems, 30, 900),
      sourceCitations: cleanList(input.sourceCitations, 30, 800),
      limitations: cleanList(input.limitations, 20, 500),
      disclaimer: 'AI审图结果仅为待复核候选意见，不改变EDEM/ERC结论，不代表标准符合、专业校审或签发。'
    };
    output.candidateHash = hash(output);
    return output;
  }

  return Object.freeze({
    VERSION, SCHEMA, CANDIDATE_SCHEMA, buildCase, deterministicFindings, deterministicSeverity, normaliseCandidate,
    knowledgeSnapshot, hash
  });
});
