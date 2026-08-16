/* ============================================================
 * AIDC 方案设计平台 — 应用交互层
 * 输入 → 受控需求翻译（可选）→ 确定性工程模型 → 图纸 / 计算 / 清单
 *
 * Security boundary: browsers never receive or store model API keys.
 * Optional AI requests go only to the same-origin /api/ai proxy.
 * ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const AI_API = '/api/ai';
  const state = {
    R: null,
    tab: 'drawings',
    subTab: 'arch',
    zoom: 1,
    requirement: null,
    providerStatus: {},
    providerStatusLoaded: false,
    generating: false,
    initialInputValues: {},
    automatedInputSources: {}
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function textWithBreaks(value) { return escapeHtml(value).replace(/\n/g, '<br>'); }
  function asNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
  function inputNumber(id, fallback) { return asNumber($(id) && $(id).value, fallback); }
  function numberText(value, digits) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('zh-CN', { maximumFractionDigits: digits == null ? 0 : digits }) : '—';
  }
  function optionExists(select, value) {
    return !!select && Array.from(select.options).some((option) => option.value === String(value));
  }
  function cleanList(value, max) {
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    return list.map((item) => String(item).replace(/[<>]/g, '').trim()).filter(Boolean).slice(0, max || 12);
  }
  function humanError(error) {
    const message = String((error && error.message) || error || '未知错误').replace(/[<>]/g, '').slice(0, 220);
    return message || '请求未完成';
  }
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /*
   * A value is not treated as a verified design basis merely because it is
   * visible in a form. Defaults, AI-translated values and manually typed
   * values remain assumptions until the submitter explicitly declares the
   * underlying project document has been checked.
   */
  const INPUT_META_FIELDS = [
    { key: 'itLoad', id: 'f-itload', confirmation: 'f-confirm-load' },
    { key: 'gpuCount', id: 'f-gpu-count', confirmation: 'f-confirm-load' },
    { key: 'gpuType', id: 'f-gpu', confirmation: 'f-confirm-load' },
    { key: 'rackPower', id: 'f-rack', confirmation: 'f-confirm-load' },
    { key: 'tier', id: 'f-tier', confirmation: 'f-confirm-reliability' },
    { key: 'redundancy', id: 'f-red', confirmation: 'f-confirm-reliability' },
    { key: 'voltage', id: 'f-voltage', confirmation: 'f-confirm-grid' },
    { key: 'gridScMva', id: 'f-grid-sc', confirmation: 'f-confirm-grid' },
    { key: 'txUkPct', id: 'f-tx-uk', confirmation: 'f-confirm-equipment' },
    { key: 'powerFactor', id: 'f-pf', confirmation: 'f-confirm-equipment' },
    { key: 'upsBackupMin', id: 'f-ups-backup', confirmation: 'f-confirm-equipment' },
    { key: 'cooling', id: 'f-cooling', confirmation: 'f-confirm-thermal' },
    { key: 'region', id: 'f-region', confirmation: 'f-confirm-thermal' },
    { key: 'designWetBulb', id: 'f-wetbulb', confirmation: 'f-confirm-thermal' },
    { key: 'cduUnitKw', id: 'f-cdu-cap', confirmation: 'f-confirm-thermal' },
    { key: 'supplyTemp', id: 'f-supply-temp', confirmation: 'f-confirm-thermal' },
    { key: 'returnTemp', id: 'f-return-temp', confirmation: 'f-confirm-thermal' },
    { key: 'pueTarget', id: 'f-pue', confirmation: 'f-confirm-energy' },
    { key: 'pricePeak', id: 'f-peak', confirmation: 'f-confirm-energy' },
    { key: 'priceValley', id: 'f-valley', confirmation: 'f-confirm-energy' }
  ];
  const RELEASE_EVIDENCE_FIELDS = [
    ['shortCircuitStudy', 'f-evidence-sc'],
    ['protectionStudy', 'f-evidence-protection'],
    ['hydraulicStudy', 'f-evidence-hydraulic'],
    ['fireCivilCoordination', 'f-evidence-civil'],
    ['vendorData', 'f-evidence-vendor'],
    ['cadDocumentControl', 'f-evidence-cad']
  ];

  function captureInitialInputValues() {
    INPUT_META_FIELDS.forEach((field) => {
      const input = $(field.id);
      if (input) state.initialInputValues[field.id] = String(input.value);
    });
  }
  function markUserEdited(fieldId) {
    delete state.automatedInputSources[fieldId];
  }
  function setAutomatedValue(fieldId, value, source) {
    const input = $(fieldId);
    if (!input) return;
    input.value = value;
    state.automatedInputSources[fieldId] = source || 'AI_TRANSLATION';
  }
  function sourceForInput(fieldId) {
    if (state.automatedInputSources[fieldId]) return state.automatedInputSources[fieldId];
    const input = $(fieldId);
    if (!input) return 'MISSING_CONTROL';
    if (Object.prototype.hasOwnProperty.call(state.initialInputValues, fieldId) && String(input.value) === state.initialInputValues[fieldId]) return 'FORM_DEFAULT';
    return 'FORM_ENTERED';
  }
  function buildInputMeta() {
    const meta = {};
    INPUT_META_FIELDS.forEach((field) => {
      const input = $(field.id), confirmation = $(field.confirmation);
      meta[field.key] = {
        provided: !!input && String(input.value).trim() !== '',
        verified: !!confirmation && !!confirmation.checked,
        source: sourceForInput(field.id)
      };
    });
    return meta;
  }
  function buildReleaseEvidence() {
    const evidence = {};
    RELEASE_EVIDENCE_FIELDS.forEach((entry) => {
      const checkbox = $(entry[1]);
      evidence[entry[0]] = {
        complete: !!checkbox && !!checkbox.checked,
        source: checkbox && checkbox.checked ? 'USER_DECLARATION' : 'NOT_DECLARED'
      };
    });
    return evidence;
  }

  /* ---------- 表单与工程输入 ---------- */
  function getParams() {
    const req = state.requirement || {};
    return {
      projName: $('f-proj').value.trim() || 'AIDC 数据中心',
      region: $('f-region').value,
      tier: $('f-tier').value,
      gpuType: $('f-gpu').value,
      gpuCount: Math.max(0, Math.round(inputNumber('f-gpu-count', 0))),
      itLoad: Math.max(0, inputNumber('f-itload', 0)),
      voltage: $('f-voltage').value,
      redundancy: $('f-red').value,
      cooling: $('f-cooling').value,
      pueTarget: inputNumber('f-pue', 1.25),
      rackPower: inputNumber('f-rack', 40),
      pricePeak: inputNumber('f-peak', 1.05),
      priceValley: inputNumber('f-valley', 0.35),
      pref: $('f-pref').value,
      gridScMva: inputNumber('f-grid-sc', 500),
      txUkPct: inputNumber('f-tx-uk', 6),
      powerFactor: inputNumber('f-pf', 0.92),
      upsBackupMin: inputNumber('f-ups-backup', 15),
      cduUnitKw: inputNumber('f-cdu-cap', 500),
      supplyTemp: inputNumber('f-supply-temp', 35),
      returnTemp: inputNumber('f-return-temp', 45),
      designWetBulb: inputNumber('f-wetbulb', 28),
      specialRequirements: cleanList(req.specialRequirements, 20),
      requirementSource: req.source || 'FORM',
      inputMeta: buildInputMeta(),
      releaseEvidence: buildReleaseEvidence()
    };
  }

  function logStep(message, type) {
    const box = $('step-log');
    if (!box) return;
    const line = document.createElement('div');
    line.className = 'step ' + (type || '');
    line.textContent = message;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
    return line;
  }

  /* ---------- 服务端 AI 代理（不在浏览器处理密钥） ---------- */
  function providerEnabled(provider) {
    const status = state.providerStatus && state.providerStatus[provider];
    return status === true || !!(status && (status.enabled || status.configured || status.available));
  }

  function updateProviderStatus() {
    const target = $('ai-provider-status');
    if (!target) return;
    const model = $('f-model').value;
    if (model === 'local') {
      target.textContent = '本地规则解析：自然语言不会发送到服务端。';
      return;
    }
    if (!state.providerStatusLoaded) {
      target.textContent = '正在检查同源服务端 AI 配置；不可用时将自动使用本地规则。';
      return;
    }
    target.textContent = providerEnabled(model)
      ? '对应 AI 已由服务端配置。仅发送自然语言需求用于参数翻译，计算与出图仍由确定性引擎完成。'
      : '对应 AI 尚未在服务端配置；生成时会自动退回本地规则解析。浏览器不需要、也不能填写 API Key。';
  }

  async function loadProviderStatus() {
    try {
      const response = await fetch(AI_API + '?action=status', {
        method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store'
      });
      if (!response.ok) throw new Error('status ' + response.status);
      const body = await response.json();
      const payload = body && (body.data || body.result || body);
      state.providerStatus = (payload && payload.providers) || {};
    } catch (error) {
      state.providerStatus = {};
    } finally {
      state.providerStatusLoaded = true;
      updateProviderStatus();
    }
  }

  async function requestAI(action, payload) {
    const response = await fetch(AI_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(Object.assign({ action }, payload || {}))
    });
    let body = null;
    try { body = await response.json(); } catch (error) { /* handled below */ }
    if (!response.ok || !body || body.ok === false) {
      throw new Error((body && (body.error || body.message)) || ('服务端 AI 请求失败（' + response.status + '）'));
    }
    return body.data || body.result || body;
  }

  function normaliseTier(value) {
    const v = String(value == null ? '' : value).toLowerCase().replace(/\s/g, '');
    if (v === 'tier4' || v === 'iv' || v === '4') return 'tier4';
    if (v === 'tier2' || v === 'ii' || v === '2') return 'tier2';
    if (v === 'tier3' || v === 'iii' || v === '3') return 'tier3';
    return null;
  }
  function normaliseRedundancy(value) {
    const v = String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9+()]/g, '');
    if (v === '2n1' || v === '2(n+1)' || v === '2n+1') return '2n1';
    if (v === '2n') return '2n';
    if (v === 'n1' || v === 'n+1') return 'n1';
    return null;
  }
  function normaliseCooling(value) {
    const v = String(value == null ? '' : value).toLowerCase();
    if (/hybrid|混合/.test(v)) return 'hybrid';
    if (/air|风冷/.test(v)) return 'air';
    if (/liquid|液冷|冷板/.test(v)) return 'liquid';
    return null;
  }
  function normalisePreference(value) {
    const v = String(value == null ? '' : value).toLowerCase();
    if (/cost|成本|预算|国产/.test(v)) return 'cost';
    if (/reliab|可靠|稳定|高可用/.test(v)) return 'reliability';
    if (/balance|均衡|性价比/.test(v)) return 'balance';
    return null;
  }
  function normaliseVoltage(value) {
    const parsed = Number(String(value == null ? '' : value).replace(/[^0-9.]/g, ''));
    return [10, 35, 110].includes(parsed) ? String(parsed) : null;
  }
  function normaliseRequirement(payload, source) {
    const raw = payload && (payload.parsed || payload.requirements || payload.requirement || payload);
    const result = raw && typeof raw === 'object' ? raw : {};
    const getNumber = function () {
      for (let i = 0; i < arguments.length; i += 1) {
        const n = Number(result[arguments[i]]);
        if (Number.isFinite(n) && n > 0) return n;
      }
      return null;
    };
    const gpuType = String(result.gpuType || result.gpu_type || '').toLowerCase();
    const knownGpu = window.AIDC_ENGINE && window.AIDC_ENGINE.GPU_SPECS && window.AIDC_ENGINE.GPU_SPECS[gpuType] ? gpuType : null;
    const confidence = Number(result.confidence);
    return {
      source: source || 'AI',
      itLoadKw: getNumber('itLoadKw', 'it_load_kw', 'powerKw', 'power_kw', 'load_kw'),
      gpuCount: getNumber('gpuCount', 'gpu_count'),
      gpuType: knownGpu,
      tier: normaliseTier(result.tier || result.tierTarget),
      voltage: normaliseVoltage(result.voltageKv || result.voltage_kv || result.voltage || result.voltage_level),
      redundancy: normaliseRedundancy(result.redundancy),
      cooling: normaliseCooling(result.cooling || result.coolingType),
      pueTarget: getNumber('pueTarget', 'pue_target', 'pue'),
      region: String(result.region || '').replace(/[<>]/g, '').trim() || null,
      pref: normalisePreference(result.preference || result.pref),
      specialRequirements: cleanList(result.specialRequirements || result.special_requirements, 20),
      assumptions: cleanList(result.assumptions, 12),
      questions: cleanList(result.questions, 12),
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null
    };
  }

  async function callAIParse(provider, text) {
    const payload = await requestAI('parse', { provider, text: String(text).slice(0, 5000) });
    return normaliseRequirement(payload, 'SERVER_AI:' + provider);
  }
  async function callAIAdvice(provider, context) {
    const payload = await requestAI('advise', { provider, context });
    return String((payload && (payload.text || payload.advice || payload.message)) || '').trim();
  }

  /* ---------- 本地规则解析：仅提取，不做工程决策 ---------- */
  function parseNLLocal(text) {
    const input = String(text || '');
    const find = (regex) => { const match = input.match(regex); return match ? Number(match[1]) : null; };
    const mw = find(/([\d.]+)\s*MW\b/i);
    const kw = find(/([\d.]+)\s*(?:kW|千瓦)\b/i);
    const cardCount = find(/(\d+)\s*(?:张|块|卡)\s*(?:GPU|H100|H200|B200|A100|910B)?/i);
    const gpuPatterns = [
      ['gb300', /GB300/i], ['rubin', /Rubin/i], ['b200', /B200/i], ['h200', /H200/i],
      ['h100', /H100/i], ['a100', /A100/i], ['ascend910b', /(?:昇腾\s*910B|910B)/i]
    ];
    const gpuMatch = gpuPatterns.find((item) => item[1].test(input));
    const special = [];
    if (/高盐雾|沿海|海边/.test(input)) special.push('沿海/高盐雾环境：防腐等级、材料、外壳防护与检验要求待项目确认。');
    if (/国产|本土/.test(input)) special.push('偏好国产供应链：需以合格供方、型式试验、维保能力与 RFQ 核实。');
    if (/保密|涉密|数据安全/.test(input)) special.push('存在信息安全要求：需确认数据分级、接口与部署边界。');
    if (/快速交付|工期紧/.test(input)) special.push('工期敏感：需以受控目录的实际交期、物流和调试计划核实。');
    return {
      source: 'LOCAL_RULES',
      itLoadKw: mw ? Math.round(mw * 1000) : (kw ? Math.round(kw) : null),
      gpuCount: cardCount && cardCount > 0 ? Math.round(cardCount) : null,
      gpuType: gpuMatch ? gpuMatch[0] : null,
      tier: /Tier\s*(?:IV|4)\b/i.test(input) ? 'tier4' : (/Tier\s*(?:II(?!I)|2)\b/i.test(input) ? 'tier2' : (/Tier\s*(?:III|3)\b/i.test(input) ? 'tier3' : null)),
      voltage: normaliseVoltage((input.match(/(?:10|35|110)\s*kV/i) || [])[0]),
      redundancy: /2\s*\(?\s*N\s*\+?\s*1\s*\)?|2N\+1/i.test(input) ? '2n1' : (/\b2N\b/i.test(input) ? '2n' : (/N\s*\+\s*1/i.test(input) ? 'n1' : null)),
      cooling: normaliseCooling(input),
      pueTarget: find(/PUE\s*(?:[<≤=]\s*)?([\d.]+)/i),
      region: null,
      pref: normalisePreference(input),
      specialRequirements: special,
      assumptions: ['本地规则仅识别明显的容量、等级、冗余和冷却关键词；其余文字要求已保留为待确认事项。'],
      questions: [],
      confidence: 0.55
    };
  }

  function applyRequirement(requirement) {
    if (!requirement) return;
    const source = requirement.source || 'AI_TRANSLATION';
    if (requirement.itLoadKw) setAutomatedValue('f-itload', Math.round(requirement.itLoadKw), source);
    if (requirement.gpuCount) setAutomatedValue('f-gpu-count', Math.round(requirement.gpuCount), source);
    if (requirement.gpuType && optionExists($('f-gpu'), requirement.gpuType)) setAutomatedValue('f-gpu', requirement.gpuType, source);
    if (requirement.tier && optionExists($('f-tier'), requirement.tier)) setAutomatedValue('f-tier', requirement.tier, source);
    if (requirement.voltage && optionExists($('f-voltage'), requirement.voltage)) setAutomatedValue('f-voltage', requirement.voltage, source);
    if (requirement.redundancy && optionExists($('f-red'), requirement.redundancy)) setAutomatedValue('f-red', requirement.redundancy, source);
    if (requirement.cooling && optionExists($('f-cooling'), requirement.cooling)) setAutomatedValue('f-cooling', requirement.cooling, source);
    if (requirement.pueTarget && requirement.pueTarget >= 1.05 && requirement.pueTarget <= 2) setAutomatedValue('f-pue', requirement.pueTarget, source);
    if (requirement.pref && optionExists($('f-pref'), requirement.pref)) setAutomatedValue('f-pref', requirement.pref, source);
    if (requirement.region && optionExists($('f-region'), requirement.region)) setAutomatedValue('f-region', requirement.region, source);
  }

  /* ---------- 生成方案 ---------- */
  window.generateSolution = async function () {
    if (state.generating) return;
    state.generating = true;
    const log = $('step-log');
    log.innerHTML = '';
    log.style.display = 'block';
    const text = $('f-nl').value.trim();
    const provider = $('f-model').value;
    state.requirement = { source: 'FORM', specialRequirements: [], assumptions: [], questions: [], confidence: null };

    try {
      if (text) {
        let parsed = null;
        if (provider !== 'local' && (!state.providerStatusLoaded || providerEnabled(provider))) {
          try {
            logStep('服务端 AI 正在翻译自然语言需求（不参与工程计算）…', 'running');
            parsed = await callAIParse(provider, text);
            logStep('AI 需求翻译完成；已回填可识别字段，请在“设计状态”中复核假设。', 'ok');
          } catch (error) {
            logStep('服务端 AI 不可用：' + humanError(error) + '；已退回本地规则。', 'warn');
          }
        }
        if (!parsed) {
          logStep(provider === 'local' ? '本地规则正在解析自然语言需求…' : '使用本地规则解析自然语言需求…', 'running');
          parsed = parseNLLocal(text);
          logStep('本地规则解析完成；未识别的内容列为待确认事项。', 'ok');
        }
        state.requirement = parsed;
        applyRequirement(parsed);
      }

      const params = getParams();
      if (!params.gpuCount && !params.itLoad) {
        alert('请至少填写 GPU 数量或总 IT 负荷。');
        return;
      }
      if (!window.AIDC_ENGINE || typeof window.AIDC_ENGINE.build !== 'function') {
        throw new Error('工程引擎未加载，无法生成方案。');
      }
      const steps = [
        '建立输入、设计假设与可追溯工程模型',
        '计算 IT 负荷、供电路径与概念短路容量',
        '计算液冷热负荷、流量与设备数量',
        '生成方案级图纸、概念 BOM 与待校核事项'
      ];
      for (let index = 0; index < steps.length; index += 1) {
        const line = logStep('[' + (index + 1) + '/' + steps.length + '] ' + steps[index], 'running');
        await sleep(60);
        if (line) line.className = 'step ok';
      }
      state.R = window.AIDC_ENGINE.build(params);
      logStep('✅ 已生成确定性方案级工程草案；AI（如已使用）仅参与需求翻译。', 'ok');
      renderSummary();
      renderDesignStatus();
      renderDrawings();
      renderParams();
      renderBom();
      renderCompliance();
      renderReadiness();
      renderSelection();
      $('empty-hint').style.display = 'none';
      $('result-area').style.display = 'block';
      switchTab('drawings');
      $('result-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      logStep('生成失败：' + humanError(error), 'warn');
      alert('方案未生成：' + humanError(error));
    } finally {
      state.generating = false;
    }
  };

  /* ---------- 结果状态与摘要 ---------- */
  function formatWan(value) {
    const wan = Number(value);
    if (!Number.isFinite(wan)) return '—';
    return wan >= 10000 ? (wan / 10000).toFixed(2) + ' 亿' : wan.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + ' 万';
  }
  function renderSummary() {
    const R = state.R;
    if (!R) return;
    const Cx = R.compute || {}, P = R.power || {}, Cl = R.cooling || {}, Ec = R.economics || {};
    const cdu = Cl.isLiquid ? (numberText(Cl.cduCount) + ' 台（' + numberText(Cl.cduActiveCount) + ' 用 + ' + numberText(Cl.cduRedundancyCount) + ' 备）') : '不适用（风冷）';
    const cards = [
      ['IT 负荷', numberText(Cx.itLoadKw) + ' kW', '#58a6ff'],
      ['设施目标负荷', numberText(Cx.facilityDemandKw) + ' kW', '#3fb950'],
      ['变压器组', numberText(P.txTotal) + ' × ' + numberText(P.txUnit) + ' kVA', '#e3b341'],
      ['UPS 组', numberText(P.upsTotal) + ' × ' + numberText(P.upsUnit) + ' kVA', '#a78bfa'],
      ['液冷 CDU', cdu, '#4ac8ff'],
      ['概念投资估算', '¥' + formatWan(Ec.capex), '#f85149']
    ];
    $('summary-cards').innerHTML = cards.map((card) =>
      '<div class="kpi"><div class="kpi-label">' + escapeHtml(card[0]) + '</div><div class="kpi-value" style="color:' + card[2] + '">' + escapeHtml(card[1]) + '</div></div>'
    ).join('');
    const warnings = Array.isArray(R.warnings) ? R.warnings : [];
    $('warn-box').innerHTML = warnings.length
      ? '<div class="warn-box">⚠ ' + warnings.map(escapeHtml).join('；') + '</div>'
      : '';
  }

  function renderDesignStatus() {
    const R = state.R;
    const el = $('design-status');
    if (!R || !el) return;
    const req = state.requirement || {};
    const model = R.design || {};
    const readiness = R.readiness || {};
    const release = readiness.release || R.releaseGate || {};
    const summary = readiness.summary || {};
    const tags = [
      '<span class="state-tag warn">文档：方案级自动草案</span>',
      '<span class="state-tag warn">发布等级：' + escapeHtml(readiness.level || 'CONCEPT_ONLY') + '</span>',
      '<span class="state-tag warn">施工图发布：' + escapeHtml(release.constructionStatus || 'BLOCKED') + '</span>',
      '<span class="state-tag">工程模型：' + escapeHtml(model.schemaVersion || '2.0.0') + '</span>',
      '<span class="state-tag calc">确定性引擎：' + escapeHtml(R.engineVersion || '—') + '</span>',
      '<span class="state-tag">需求来源：' + escapeHtml(req.source || 'FORM') + '</span>'
    ];
    if (Number.isFinite(Number(summary.completenessPct))) {
      tags.push('<span class="state-tag">资料完整度：' + escapeHtml(summary.completenessPct) + '%</span>');
    }
    if (Number.isFinite(Number(req.confidence))) {
      tags.push('<span class="state-tag">需求翻译置信度：' + escapeHtml(Math.round(Number(req.confidence) * 100)) + '%（仅供复核）</span>');
    }
    const special = cleanList(req.specialRequirements, 20);
    const assumptions = cleanList(req.assumptions, 12);
    const questions = cleanList(req.questions, 12);
    let detail = '<b>设计状态与边界</b>　当前成果仅用于方案比较与专业沟通，不能作为施工、采购、保护整定或规范符合性结论。<br><b style="color:#f85149">施工图发布已被系统永久阻止：</b>' + escapeHtml(release.reason || '自动生成结果不能代替原始资料审查、专业校审和签章。');
    if (readiness.detail) detail += '<br><b>发布检查：</b>' + escapeHtml(readiness.detail);
    if (special.length) detail += '<br><b>已保留的专项要求：</b>' + special.map(escapeHtml).join('；');
    if (assumptions.length) detail += '<br><b>需求解析假设：</b>' + assumptions.map(escapeHtml).join('；');
    if (questions.length) detail += '<br><b>待确认问题：</b>' + questions.map(escapeHtml).join('；');
    el.innerHTML = '<div class="state-box">' + detail + '<div class="state-tags">' + tags.join('') + '</div></div>';
  }

  /* ---------- 图纸 ---------- */
  function renderDrawing(id, renderer) {
    const target = $('d-' + id);
    if (!target) return;
    try {
      target.innerHTML = typeof renderer === 'function'
        ? renderer(state.R)
        : '<div style="padding:16px;color:#8b9bb4">该图纸渲染器未加载。</div>';
    } catch (error) {
      target.innerHTML = '<div style="padding:16px;color:#e3b341">图纸渲染失败：' + escapeHtml(humanError(error)) + '</div>';
    }
  }
  function renderDrawings() {
    renderDrawing('arch', window.drawArch);
    renderDrawing('wiring', window.drawWiring);
    renderDrawing('dual', window.drawDual);
    renderDrawing('cooling', window.drawCooling);
    renderDrawing('thermal', window.drawThermal);
    if (window.ASSET) $('d-assets').innerHTML = window.ASSET.preview();
    showSubTab(state.subTab);
  }
  window.showSubTab = function (id) {
    state.subTab = id;
    ['arch', 'wiring', 'dual', 'cooling', 'thermal', 'assets'].forEach((key) => {
      const diagram = $('d-' + key);
      const button = $('sub-' + key);
      if (diagram) diagram.style.display = key === id ? 'block' : 'none';
      if (button) button.classList.toggle('active', key === id);
    });
    applyZoom();
  };
  function getCurrentSvg() {
    const box = $('d-' + state.subTab);
    return box && box.querySelector('svg');
  }
  function exportSvgMarkup(svg) {
    const clone = svg && svg.cloneNode ? svg.cloneNode(true) : null;
    if (!clone) return '';
    /* applyZoom() is viewer-only; it must never override the A3 mm size in an exported file. */
    if (clone.style) {
      clone.style.removeProperty('width');
      clone.style.removeProperty('height');
      if (!clone.getAttribute('style') || !clone.getAttribute('style').trim()) clone.removeAttribute('style');
    }
    clone.removeAttribute('data-bw');
    clone.removeAttribute('data-bh');
    return clone.outerHTML;
  }
  function applyZoom() {
    const svg = getCurrentSvg();
    if (!svg) return;
    if (!svg.dataset.bw) {
      const vb = (svg.getAttribute('viewBox') || '0 0 1000 700').trim().split(/\s+/);
      svg.dataset.bw = Number(vb[2]) || 1000;
      svg.dataset.bh = Number(vb[3]) || 700;
    }
    svg.style.width = (Number(svg.dataset.bw) * state.zoom) + 'px';
    svg.style.height = (Number(svg.dataset.bh) * state.zoom) + 'px';
    const label = $('zoom-label');
    if (label) label.textContent = Math.round(state.zoom * 100) + '%';
  }
  window.zoomIn = function () { state.zoom = Math.min(4, state.zoom * 1.2); applyZoom(); };
  window.zoomOut = function () { state.zoom = Math.max(0.4, state.zoom / 1.2); applyZoom(); };
  window.zoomReset = function () { state.zoom = 1; applyZoom(); };

  /* ---------- 自动前置检查：不把图纸内容发送给第三方模型 ---------- */
  function showReview(text) {
    let el = $('review-box');
    if (!el) {
      el = document.createElement('div');
      el.id = 'review-box';
      el.className = 'card';
      el.style.margin = '12px 0';
      $('result-area').appendChild(el);
    }
    el.innerHTML = '<div class="panel-title" style="color:#58a6ff">🧪 图纸前置检查（自动规则）</div><div style="font-size:12px;line-height:1.7;white-space:pre-wrap;color:var(--text)">' + textWithBreaks(text) + '</div>';
  }
  window.aiReviewDiagram = function () {
    const svg = getCurrentSvg();
    if (!svg) { showReview('当前标签没有可检查的 SVG 图纸。'); return; }
    const markup = svg.outerHTML;
    const issues = [];
    const passes = [];
    if (!svg.getAttribute('viewBox')) issues.push('缺少 viewBox，无法保证跨终端缩放。'); else passes.push('已检测到 viewBox。');
    if (!/width="420mm"/.test(markup) || !/height="297mm"/.test(markup)) issues.push('未检测到 A3 横向物理图幅声明。'); else passes.push('已检测到 A3 横向物理图幅声明。');
    if (!/documentStatus|方案级自动草案|CONCEPT_DRAFT/.test(markup)) issues.push('未检测到方案级文档状态标识。'); else passes.push('已检测到方案级文档状态。');
    if (/\b(undefined|null|NaN)\b/i.test(markup)) issues.push('图面包含 undefined / null / NaN 占位值，须修正后导出。'); else passes.push('未发现 undefined / null / NaN 占位值。');
    const textCount = svg.querySelectorAll('text').length;
    if (textCount < 5) issues.push('文本对象数量异常少，建议检查图纸是否完整渲染。'); else passes.push('检测到 ' + textCount + ' 个文本对象。');
    const message = '检查对象：' + state.subTab + '\n' +
      (passes.length ? '通过：\n- ' + passes.join('\n- ') + '\n' : '') +
      (issues.length ? '待处理：\n- ' + issues.join('\n- ') + '\n' : '') +
      '结论：这是自动前置检查，不等同于 IEC/国家规范符合性审查、CAD 校审或专业签发。';
    showReview(message);
  };

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function drawingName() {
    return {
      arch: 'AIDC系统架构图', wiring: 'AIDC电气一次接线图', dual: 'AIDC双路供电拓扑图',
      cooling: 'AIDC液冷管路图', thermal: 'AIDC热管理方案图', assets: 'AIDC素材库'
    }[state.subTab] || 'AIDC图纸';
  }
  window.downloadCurrentSvg = function () {
    const svg = getCurrentSvg();
    if (!svg) { alert('当前标签没有可下载的 SVG 图纸。'); return; }
    const markup = exportSvgMarkup(svg);
    downloadBlob(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }), drawingName() + '.svg');
  };
  window.downloadCurrentDxf = function () {
    const svg = getCurrentSvg();
    if (!svg) { alert('当前标签没有可导出的图纸。'); return; }
    const exporter = window.AIDC_DXF;
    if (!exporter) {
      alert('DXF 导出模块尚未加载。请刷新页面，或确认 js/dxf-export.js 已部署。');
      return;
    }
    try {
      const options = {
        title: drawingName(),
        drawing: state.subTab,
        project: state.R && state.R.projName,
        documentStatus: state.R && state.R.documentStatus,
        notice: '可编辑 DXF 概念草图；复杂符号、图层、线宽、比例和打印样式须在 CAD 模板中复核。'
      };
      let result;
      const markup = exportSvgMarkup(svg);
      if (typeof exporter.exportSvg === 'function') result = exporter.exportSvg(markup, options);
      else if (typeof exporter.fromSvg === 'function') result = exporter.fromSvg(markup, options);
      else throw new Error('DXF 模块未暴露 exportSvg/fromSvg 方法');
      const dxf = typeof result === 'string' ? result : (result && (result.dxf || result.text));
      if (!dxf || !/^\s*0\s*[\r\n]+SECTION/m.test(dxf)) throw new Error('DXF 转换结果无效');
      downloadBlob(new Blob([dxf], { type: 'application/dxf;charset=utf-8' }), drawingName() + '.dxf');
      if (result && Array.isArray(result.warnings) && result.warnings.length) {
        showReview('DXF 已导出，但转换器提示：\n- ' + result.warnings.join('\n- ') + '\n请在 CAD 中复核后使用。');
      }
    } catch (error) {
      alert('DXF 导出失败：' + humanError(error));
    }
  };
  window.toggleAssetMode = function () {
    if (!window.ASSET) return;
    const mode = window.ASSET.getMode() === 'image' ? 'vector' : 'image';
    window.ASSET.setMode(mode);
    if (state.R) renderDrawing('thermal', window.drawThermal);
    showSubTab('thermal');
  };
  window.downloadJson = function () {
    if (!state.R) return;
    const packageData = {
      schema: 'AIDC-SOLUTION-PACKAGE/2.0',
      exportedAt: new Date().toISOString(),
      documentStatus: state.R.documentStatus,
      notice: '方案级自动草案；不构成施工图、规范符合性证明、设备报价或专业签发文件。',
      releaseGate: state.R.releaseGate || (state.R.readiness && state.R.readiness.release) || { constructionDrawingAllowed: false },
      model: state.R
    };
    downloadBlob(new Blob([JSON.stringify(packageData, null, 2)], { type: 'application/json;charset=utf-8' }), 'aidc-solution-' + Date.now() + '.json');
  };

  /* ---------- 选型比较与可选 AI 表述建议 ---------- */
  function renderSelection() {
    const R = state.R, el = $('selection');
    if (!R || !el) return;
    const selections = R.selection || {};
    const keys = Object.keys(selections).filter((key) => selections[key]);
    if (!keys.length) {
      el.innerHTML = '<div class="bom-note">受控设备目录未加载，暂无法生成概念选型比较。</div>';
      return;
    }
    const pref = { cost: '成本优先', balance: '均衡（性价比）', reliability: '可靠性优先' }[R.pref] || R.pref;
    let html = '<div class="bom-note">选型偏好：<b style="color:#58a6ff">' + escapeHtml(pref) + '</b> · 评分由受控示例目录的价格、效率、可靠性与交期加权得出。它不是厂家报价、型式试验或供货承诺。</div>';
    keys.forEach((key) => {
      const selection = selections[key];
      const recommended = selection.recommended || null;
      const recommendationLabel = recommended
        ? '<span style="color:#3fb950">→ 概念推荐：' + escapeHtml(recommended.vendor) + ' ' + escapeHtml(recommended.model) + '（评分 ' + escapeHtml(recommended.score) + '）</span>'
        : '<span style="color:#e3b341">→ 无目录容量匹配，停止推荐，必须 RFQ</span>';
      html += '<div class="panel" style="margin-bottom:14px"><div class="panel-title" style="color:#58a6ff">' + escapeHtml(selection.name) + ' ' + recommendationLabel + '</div>' +
        '<div class="field-help">' + escapeHtml(selection.note || selection.status || 'RFQ_REQUIRED') + '</div>' +
        '<table class="bom-table"><tr><th>厂商</th><th>型号</th><th>能力</th><th>价格基础</th><th>效率%</th><th>可靠性</th><th>交期(周)</th><th>评分</th></tr>';
      (selection.options || []).forEach((option) => {
        const recommendedRow = !!recommended && option.vendor === recommended.vendor && option.model === recommended.model;
        html += '<tr' + (recommendedRow ? ' style="background:#12301a"' : '') + '><td>' + escapeHtml(option.vendor) + '</td><td>' + escapeHtml(option.model) + '</td><td class="num">' + escapeHtml(option.capacity) + ' ' + escapeHtml(selection.capacityKey) + '</td><td class="num">' + numberText(option.priceCnyPerUnit, 2) + ' ' + escapeHtml(selection.priceUnit) + '</td><td class="num">' + escapeHtml(option.eff) + '</td><td class="num">' + escapeHtml(option.rel) + '</td><td class="num">' + escapeHtml(option.delWeeks) + '</td><td class="num" style="color:#3fb950;font-weight:700">' + escapeHtml(option.score) + '</td></tr>';
      });
      html += '</table></div>';
    });
    html += '<div id="ai-advice" class="panel"></div>';
    el.innerHTML = html;
    advisor();
  }
  async function advisor() {
    const box = $('ai-advice');
    if (!box || !state.R) return;
    const provider = $('f-model').value;
    const fallback = '<div class="panel-title">AI 选型建议（可选）</div><div style="font-size:11px;color:var(--text2)">AI 只能解释已生成的确定性评分，不会改变设备数量、热负荷、保护策略或图纸几何。</div>';
    if (provider === 'local') { box.innerHTML = fallback + '<div class="field-help">当前为本地模式，未发送任何文本。</div>'; return; }
    if (state.providerStatusLoaded && !providerEnabled(provider)) {
      box.innerHTML = fallback + '<div class="field-help">对应服务端 AI 未配置，因此未发送请求。</div>';
      return;
    }
    box.innerHTML = '<div class="panel-title">AI 选型建议（可选）</div><div style="font-size:11px;color:var(--text2)">正在请求服务端文字建议；不会修改确定性计算结果…</div>';
    const choices = Object.keys(state.R.selection || {}).filter((key) => state.R.selection[key]).map((key) => {
      const item = state.R.selection[key];
      return { category: item.name, recommended: item.recommended && (item.recommended.vendor + ' ' + item.recommended.model), score: item.recommended && item.recommended.score };
    });
    try {
      const text = await callAIAdvice(provider, {
        preference: state.R.pref,
        userRequirements: cleanList(state.requirement && state.requirement.specialRequirements, 12),
        selections: choices,
        status: 'CONCEPT_DRAFT—RFQ_REQUIRED'
      });
      box.innerHTML = '<div class="panel-title">AI 选型建议（可选）</div><div style="font-size:11.5px;line-height:1.7;color:var(--text)">' + textWithBreaks(text || '服务端未返回文字建议。') + '</div>';
    } catch (error) {
      box.innerHTML = fallback + '<div style="font-size:11px;color:#e3b341;margin-top:5px">服务端建议不可用：' + escapeHtml(humanError(error)) + '</div>';
    }
  }

  /* ---------- 参数、BOM、校核边界 ---------- */
  function kv(key, value) {
    return '<tr><td class="k">' + escapeHtml(key) + '</td><td class="v">' + escapeHtml(value) + '</td></tr>';
  }
  function renderParams() {
    const R = state.R;
    if (!R) return;
    const P = R.power || {}, Cl = R.cooling || {}, St = R.storage || {}, Cx = R.compute || {};
    const liquidRows = Cl.isLiquid ? [
      kv('液冷热负荷（计算值）', numberText(Cl.liquidHeatKw) + ' kW'),
      kv('CDU 概念配置', numberText(Cl.cduCount) + ' 台 × ' + numberText(Cl.cduCap) + ' kW（' + numberText(Cl.cduActiveCount) + ' 用 + ' + numberText(Cl.cduRedundancyCount) + ' 备）'),
      kv('二次侧概念流量 / 管径', numberText(Cl.flowLpm) + ' L/min / ' + (Cl.dn || '待计算')),
      kv('供 / 回水温度', numberText(Cl.supplyTemp, 1) + '℃ / ' + numberText(Cl.returnTemp, 1) + '℃（ΔT ' + numberText(Cl.deltaT, 1) + '℃）'),
      kv('冷源概念配置', '冷水机 ' + numberText(Cl.chillerCount) + ' 台；冷却塔 ' + numberText(Cl.towerCount) + ' 台'),
      kv('设计湿球温度', numberText(Cl.designWetBulb, 1) + '℃（项目逐时气象待导入）'),
      kv('水力 / 联锁边界', Cl.leakDetect || '待专项设计')
    ] : [
      kv('散热方式', '风冷；未配置 CDU'),
      kv('风冷散热量（概念）', numberText(Cl.airHeatKw) + ' kW'),
      kv('精密空调概念数量', numberText(Cl.cracCount) + ' 台（待设备性能与气流组织校核）')
    ];
    const storageRows = [
      kv('HSC 瞬态缓冲概念', numberText(St.hsc && St.hsc.powerKw) + ' kW / ' + numberText(St.hsc && St.hsc.capKwh, 1) + ' kWh'),
      kv('BBU 瞬态缓冲概念', numberText(St.bbu && St.bbu.powerKw) + ' kW / ' + numberText(St.bbu && St.bbu.capKwh) + ' kWh'),
      kv('储能概念边界', (St.note || '不替代 UPS 后备电池设计')),
      kv('GPU 瞬态风险', (R.pulse && R.pulse.risk ? R.pulse.risk : '待确认') + '；需设备测试与动态仿真')
    ];
    const assumptionRows = [
      kv('文档状态', R.documentStatus || 'CONCEPT_DRAFT'),
      kv('工程模型', (R.design && R.design.project && R.design.project.id) || '待生成'),
      kv('PUE', '目标 ' + numberText(R.pue && R.pue.target, 2) + '；年化模拟 ' + ((R.pue && R.pue.status) || 'NOT_CALCULATED')),
      kv('设施目标负荷', numberText(Cx.facilityDemandKw) + ' kW'),
      kv('已记录工程假设', String((R.assumptions || []).length) + ' 项（见“合规检查”）')
    ];
    $('params').innerHTML = '<div class="param-grid">' +
      '<div class="panel"><div class="panel-title" style="color:#58a6ff">⚡ 供电架构（概念）</div><table>' + [
        kv('接入方式', (P.voltage || '—') + ' · ' + numberText(P.mainsCount) + ' 路关键供电路径'),
        kv('冗余拓扑', P.topology || R.red || '—'),
        kv('中压短路电流（初算）', numberText(P.mvIkA, 2) + ' kA；建议开断能力 ' + numberText(P.mvBreakingKa, 1) + ' kA（待短路计算书）'),
        kv('变压器', numberText(P.txTotal) + ' 台 × ' + numberText(P.txUnit) + ' kVA；每路径 ' + numberText(P.txActivePerPath) + ' 用 + ' + numberText(P.txRedundancyPerPath) + ' 备'),
        kv('低压侧短路电流（初算）', numberText(P.lvIkA, 2) + ' kA；建议开断能力 ' + numberText(P.lvBreakingKa, 1) + ' kA（待短路计算书）'),
        kv('UPS', numberText(P.upsTotal) + ' 台 × ' + numberText(P.upsUnit) + ' kVA；后备 ' + numberText(P.upsBackupMin) + ' min（待厂家曲线复核）'),
        kv('UPS 电池概念需求', numberText(P.batTotalKwh) + ' kWh（不含放电曲线、温度和寿命修正）'),
        kv('辅助 STS', numberText(P.auxStsCount) + ' 台，仅供辅助单电源负荷；不作为 GPU A/B 主路径'),
        kv('发电机概念配置', numberText(P.genCount) + ' 台 × ' + numberText(P.genCap) + ' kW（储油/并机待专项设计）')
      ].join('') + '</table></div>' +
      '<div class="panel"><div class="panel-title" style="color:#4ac8ff">🌡 热管理与液冷（概念）</div><table>' + liquidRows.join('') + '</table></div>' +
      '<div class="panel"><div class="panel-title" style="color:#e3b341">🔋 瞬态与储能边界</div><table>' + storageRows.join('') + '</table></div>' +
      '<div class="panel"><div class="panel-title" style="color:#f85149">🛡 保护与审查边界</div>' +
      (R.protection || []).map((group) => '<div class="prot-group"><b>' + escapeHtml(group.bay) + ' · ' + escapeHtml(group.status || 'NOT_CHECKED') + '</b><ul>' + (group.items || []).map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul></div>').join('') +
      '</div><div class="panel"><div class="panel-title" style="color:#b7d5f4">📋 计算状态与假设</div><table>' + assumptionRows.join('') + '</table></div>' +
      '</div>';
  }
  function renderBom() {
    const R = state.R;
    if (!R) return;
    let html = '<div class="bom-note">概念设备估算总价：<b style="color:#f85149">¥' + escapeHtml(formatWan(R.bomTotal)) + '</b>。受控示例目录仅用于方案比较；所有设备价格、技术协议、适配性、交期与合规文件必须通过 RFQ / 厂家资料确认。</div>' +
      '<table class="bom-table"><tr><th>类别</th><th>设备</th><th>型号规格</th><th>数量</th><th>单位</th><th>单价(万元)</th><th>合计(万元)</th><th>状态 / 备注</th></tr>';
    (R.bom || []).forEach((item) => {
      html += '<tr><td>' + escapeHtml(item.cat) + '</td><td>' + escapeHtml(item.name) + '</td><td>' + escapeHtml(item.model) + '</td><td class="num">' + escapeHtml(item.qty) + '</td><td>' + escapeHtml(item.unit) + '</td><td class="num">' + numberText(item.unitPrice, 2) + '</td><td class="num">' + numberText(item.total, 2) + '</td><td>' + escapeHtml(item.status || 'RFQ_REQUIRED') + ' · ' + escapeHtml(item.note) + '</td></tr>';
    });
    html += '<tr class="sum"><td colspan="6">合计（概念估算）</td><td class="num">' + numberText(R.bomTotal, 2) + '</td><td>RFQ_REQUIRED</td></tr></table>';
    $('bom').innerHTML = html;
  }
  function renderCompliance() {
    const R = state.R;
    if (!R) return;
    const defs = {
      CALCULATED: ['🧮', '#3fb950', '已按当前输入计算'],
      ASSUMPTION: ['◐', '#58a6ff', '含明确工程假设'],
      NOT_CHECKED: ['⚪', '#8b949e', '尚未完成专业校核'],
      WARN: ['⚠️', '#e3b341', '需要处理的风险'],
      SKIP: ['➖', '#8b949e', '当前方案不适用']
    };
    const items = R.validation || R.compliance || [];
    let html = items.map((item) => {
      const style = defs[item.result] || defs.NOT_CHECKED;
      return '<div class="comp-row"><span class="comp-icon" style="color:' + style[1] + '">' + style[0] + '</span><div><div class="comp-rule">' + escapeHtml(item.rule) + ' <span style="font-size:10px;color:' + style[1] + '">[' + escapeHtml(item.result || 'NOT_CHECKED') + ']</span></div><div class="comp-detail">' + escapeHtml(item.detail) + '</div></div><div class="comp-ref">' + escapeHtml(item.ref) + '</div></div>';
    }).join('');
    if (R.assumptions && R.assumptions.length) {
      html += '<div class="state-box"><b>引擎采用的输入假设</b><br>' + R.assumptions.map((item) => '· ' + escapeHtml(item.id) + '：' + escapeHtml(item.value) + '（' + escapeHtml(item.note) + '）').join('<br>') + '</div>';
    }
    $('compliance').innerHTML = html || '<div class="bom-note">当前没有可展示的校核记录。</div>';
  }

  function renderReadiness() {
    const R = state.R, el = $('readiness');
    if (!R || !el) return;
    const readiness = R.readiness || {};
    const summary = readiness.summary || {};
    const release = readiness.release || R.releaseGate || {};
    const labels = {
      DECLARED_CONFIRMED: ['已声明核实', '#3fb950'],
      DECLARED_COMPLETE: ['已声明资料齐套', '#3fb950'],
      ASSUMPTION: ['假设 / 未核实', '#e3b341'],
      MISSING: ['缺少输入', '#f85149'],
      EXTERNAL_EVIDENCE_REQUIRED: ['缺少外部资料', '#f85149'],
      NOT_APPLICABLE: ['不适用', '#8b949e']
    };
    const entries = Array.isArray(readiness.entries) ? readiness.entries : [];
    const statusBadge = (status) => {
      const item = labels[status] || ['待核实', '#8b949e'];
      return '<span style="color:' + item[1] + ';font-size:11px;font-weight:700">' + escapeHtml(status) + ' · ' + escapeHtml(item[0]) + '</span>';
    };
    let html = '<div class="release-lock"><div><b>🔒 施工图发布：已阻止</b><br><span>' + escapeHtml(release.reason || '自动生成器不具备施工图签发权限。') + '</span></div>' +
      '<div class="release-lock-meta">当前等级：<b>' + escapeHtml(readiness.level || 'CONCEPT_ONLY') + '</b><br>资料完整度：<b>' + escapeHtml(Number.isFinite(Number(summary.completenessPct)) ? summary.completenessPct + '%' : '—') + '</b></div></div>' +
      '<div class="state-box"><b>发布检查说明</b><br>' + escapeHtml(readiness.detail || '默认值和未核实输入会作为工程假设处理。') +
      '<br><span style="color:var(--text2)">“已声明”仅表示提交人勾选确认；平台不读取、不验证原始计算书、图纸、厂家文件或签章。</span></div>';
    if (readiness.level === 'REVIEW_READY') {
      html += '<div class="bom-note" style="color:#3fb950">资料声明已齐套，可提交专业方案评审；这不是施工图状态，也不解除施工图发布禁令。</div>';
    } else {
      html += '<div class="bom-note" style="color:#e3b341">仍存在资料缺口或未核实假设，仅限概念方案使用。请在左侧“发布检查与资料确认”补充设计依据和专项资料状态。</div>';
    }
    html += '<table class="bom-table"><tr><th>编号</th><th>专业</th><th>检查项</th><th>状态</th><th>资料/行动说明</th></tr>';
    entries.forEach((item) => {
      const inputSummary = (item.inputs || []).map((input) => input.label + '：' + input.value + ' [' + input.status + ']').join('；');
      html += '<tr><td>' + escapeHtml(item.id) + '</td><td>' + escapeHtml(item.discipline || '—') + '</td><td>' + escapeHtml(item.title) + '</td><td>' + statusBadge(item.status) + '</td><td>' + escapeHtml(item.detail || '') + (inputSummary ? '<div class="field-help">当前输入：' + escapeHtml(inputSummary) + '</div>' : '') + '</td></tr>';
    });
    html += '</table>';
    const blockers = Array.isArray(readiness.blockingItems) ? readiness.blockingItems : [];
    if (blockers.length) {
      html += '<div class="state-box"><b style="color:#e3b341">尚未满足“专业方案评审资料齐套”条件的项目</b><br>' + blockers.map((item) => '· ' + escapeHtml(item.id) + '：' + escapeHtml(item.title) + ' [' + escapeHtml(item.status) + ']').join('<br>') + '</div>';
    }
    html += '<div class="state-box"><b style="color:#f85149">施工图发布所需的外部动作</b><br>' + escapeHtml(release.requiredExternalAction || '须在受控项目环境中完成专业校审和文控发布。') + '</div>';
    el.innerHTML = html;
  }

  /* ---------- 标签切换与初始化 ---------- */
  window.switchTab = function (id) {
    state.tab = id;
    ['drawings', 'params', 'bom', 'compliance', 'readiness', 'selection'].forEach((key) => {
      const panel = $('tab-' + key), button = $('tbtn-' + key);
      if (panel) panel.style.display = key === id ? 'block' : 'none';
      if (button) button.classList.toggle('active', key === id);
    });
  };
  window.addEventListener('DOMContentLoaded', () => {
    captureInitialInputValues();
    INPUT_META_FIELDS.forEach((field) => {
      const input = $(field.id);
      if (!input) return;
      input.addEventListener('input', () => markUserEdited(field.id));
      input.addEventListener('change', () => markUserEdited(field.id));
    });
    const gpu = $('f-gpu');
    if (gpu) {
      gpu.addEventListener('change', () => {
        const spec = window.AIDC_ENGINE && window.AIDC_ENGINE.GPU_SPECS && window.AIDC_ENGINE.GPU_SPECS[gpu.value];
        const load = $('f-itload');
        if (spec && load && !load.value) {
          const count = Math.max(0, Math.round(inputNumber('f-gpu-count', 0)));
          load.placeholder = spec.rack72 ? ('约 ' + Math.ceil(count / 72) * spec.rackPower + ' kW') : ('约 ' + Math.ceil(Math.ceil(count / 8) * spec.rackPower) + ' kW');
        }
      });
      gpu.dispatchEvent(new Event('change'));
    }
    $('f-model').addEventListener('change', updateProviderStatus);
    loadProviderStatus();
  });

  window.AIDC_APP = { state, getParams, parseNLLocal };
})();
