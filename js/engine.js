/* ============================================================
 * AIDC deterministic engineering concept engine v2.0
 * ------------------------------------------------------------
 * Scope: reproducible concept design and traceable preliminary
 * calculations. It intentionally does NOT issue construction-grade
 * protection settings, code compliance certificates, quotations or
 * a professional-engineer approval.
 * ============================================================ */
window.AIDC_ENGINE = (function () {
  'use strict';

  const ENGINE_VERSION = '2.1.0';
  const READINESS_VERSION = '1.0.0';
  const GPU_SPECS = {
    h100: { name: 'NVIDIA H100 SXM', tdp: 700, fp16: 990, mem: '80GB HBM3', interconnect: 'NVLink 900GB/s', rackPower: 10.2, serverPriceWan: 200, pulse: { spikeRatio: 1.5, spikeMs: 50, freqPerSec: 8 }, ips: { enabled: false, peakReduction: 0 } },
    a100: { name: 'NVIDIA A100 SXM', tdp: 400, fp16: 312, mem: '80GB HBM2e', interconnect: 'NVLink 600GB/s', rackPower: 6.5, serverPriceWan: 140, pulse: { spikeRatio: 1.4, spikeMs: 80, freqPerSec: 6 }, ips: { enabled: false, peakReduction: 0 } },
    h200: { name: 'NVIDIA H200 SXM', tdp: 700, fp16: 990, mem: '141GB HBM3e', interconnect: 'NVLink 900GB/s', rackPower: 10.2, serverPriceWan: 260, pulse: { spikeRatio: 1.5, spikeMs: 50, freqPerSec: 8 }, ips: { enabled: false, peakReduction: 0 } },
    b200: { name: 'NVIDIA B200 SXM', tdp: 1000, fp16: 2250, mem: '192GB HBM3e', interconnect: 'NVLink5 1.8TB/s', rackPower: 14.3, serverPriceWan: 320, pulse: { spikeRatio: 1.8, spikeMs: 30, freqPerSec: 10 }, ips: { enabled: true, peakReduction: 0.30 } },
    gb300: { name: 'NVIDIA GB300 NVL72', tdp: 1400, fp16: 2500, mem: '288GB HBM3e', interconnect: 'NVL72 域互联', rackPower: 130, serverPriceWan: 2500, rack72: true, pulse: { spikeRatio: 2.0, spikeMs: 20, freqPerSec: 12 }, ips: { enabled: true, peakReduction: 0.35 } },
    rubin: { name: 'NVIDIA Rubin NVL72', tdp: 1800, fp16: 3300, mem: 'HBM4', interconnect: 'NVL144 域互联', rackPower: 150, serverPriceWan: 3200, rack72: true, pulse: { spikeRatio: 2.0, spikeMs: 20, freqPerSec: 12 }, ips: { enabled: true, peakReduction: 0.35 } },
    ascend910b: { name: '昇腾 910B', tdp: 400, fp16: 376, mem: '64GB HBM2e', interconnect: 'HCCS 392GB/s', rackPower: 8, serverPriceWan: 160, pulse: { spikeRatio: 1.4, spikeMs: 80, freqPerSec: 6 }, ips: { enabled: false, peakReduction: 0 } }
  };

  const TX_UNIT_DEFAULT = { 10: 2500, 35: 10000, 110: 40000 };
  const MV_BREAKER_A = [630, 1250, 2000, 3150, 4000];
  const MV_BREAKING_KA = [25, 31.5, 40, 50];
  const LV_ACB_A = [1600, 2000, 2500, 3200, 4000, 5000, 6300];
  const LV_BREAKING_KA = [50, 65, 85, 100];
  const PIPE_DN_MM = [50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600];

  const asNumber = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const positive = (value, fallback) => {
    const n = asNumber(value, fallback);
    return n > 0 ? n : fallback;
  };
  const r1 = (n) => Math.round(n * 10) / 10;
  const r2 = (n) => Math.round(n * 100) / 100;
  const round = (n) => Math.round(n);
  const nextStandard = (value, series) => series.find((n) => n >= value) || Math.ceil(value / series[series.length - 1]) * series[series.length - 1];
  const cnyToWan = (value) => r2(value / 10000);
  const safeText = (value, fallback) => String(value == null ? fallback : value).replace(/[<>]/g, '').trim() || fallback;
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

  function declaredTrue(value) {
    if (value === true || value === 1 || value === '1') return true;
    const text = String(value == null ? '' : value).toUpperCase();
    return ['TRUE', 'YES', 'CONFIRMED', 'DECLARED_CONFIRMED', 'DECLARED_COMPLETE', 'PROJECT_DOCUMENT'].includes(text);
  }

  function pipeForFlow(flowLpm, velocityMps) {
    if (!(flowLpm > 0)) return { dn: '—', nominalMm: 0, calculatedMm: 0, velocityMps: 0 };
    const flowM3s = flowLpm / 60000;
    const calculatedMm = Math.sqrt(4 * flowM3s / (Math.PI * velocityMps)) * 1000;
    const nominalMm = nextStandard(calculatedMm, PIPE_DN_MM);
    const actualVelocity = flowM3s / (Math.PI * Math.pow(nominalMm / 1000, 2) / 4);
    return { dn: 'DN' + nominalMm, nominalMm, calculatedMm: r1(calculatedMm), velocityMps: r2(actualVelocity) };
  }

  function defaultClimate(region) {
    const r = String(region || '');
    if (/哈尔滨|内蒙古|长春|沈阳/.test(r)) return 24;
    if (/北京|成都/.test(r)) return 27;
    if (/深圳|新加坡/.test(r)) return 29;
    return 28;
  }

  function build(P0) {
    const rawInput = P0 && typeof P0 === 'object' ? P0 : {};
    const P = Object.assign({}, rawInput);
    const inputMeta = rawInput.inputMeta && typeof rawInput.inputMeta === 'object' ? rawInput.inputMeta : {};
    const releaseEvidence = rawInput.releaseEvidence && typeof rawInput.releaseEvidence === 'object' ? rawInput.releaseEvidence : {};
    const warnings = [];
    const assumptions = [];
    const assumptionIds = new Set();
    const addAssumption = (id, value, note) => {
      if (assumptionIds.has(id)) return;
      assumptionIds.add(id);
      assumptions.push({ id, value, note, status: 'ASSUMPTION' });
    };

    /*
     * Input provenance is intentionally conservative. A numeric value in a
     * browser form is not evidence: unless the caller marks it as verified,
     * it remains an ASSUMPTION. This prevents defaults from silently becoming
     * a "design basis" just because a calculation was able to run.
     */
    function metaFor(key) {
      const raw = inputMeta[key];
      if (raw && typeof raw === 'object') return raw;
      if (raw === true) return { provided: true, verified: true, source: 'DECLARED_CONFIRMED' };
      if (raw) return { provided: true, verified: false, source: String(raw) };
      return {};
    }
    function inputState(key, usedValue, label, fallbackNote) {
      const meta = metaFor(key);
      const source = safeText(meta.source,
        (declaredTrue(meta.verified) || declaredTrue(meta.status)) ? 'DECLARED_CONFIRMED' : (hasOwn(rawInput, key) ? 'UNVERIFIED_INPUT' : 'ENGINE_DEFAULT'));
      const provided = meta.provided === false ? false : (meta.provided === true || hasValue(rawInput[key]));
      const verified = declaredTrue(meta.verified) || declaredTrue(meta.status) || declaredTrue(meta.source);
      const defaulted = /DEFAULT|DERIVED|AI|LOCAL_RULE|UNVERIFIED/i.test(source) || meta.assumption === true;
      const valueText = safeText(usedValue, '未提供');
      let status = 'ASSUMPTION';
      if (!provided) status = hasValue(usedValue) ? 'ASSUMPTION' : 'MISSING';
      /* An explicit confirmation can validate a displayed default or AI translation;
       * without that confirmation, defaulted values remain assumptions. */
      else if (verified) status = 'DECLARED_CONFIRMED';
      if (status !== 'DECLARED_CONFIRMED') {
        addAssumption('INPUT-' + key.toUpperCase().replace(/[^A-Z0-9]+/g, '-'), valueText,
          fallbackNote || (label + '未提供可核验的项目设计依据；当前值仅作为概念计算假设。'));
      }
      return { key, label, status, value: valueText, source, provided, verified, defaulted };
    }
    function allState(states) {
      const usable = states.filter(Boolean);
      if (!usable.length) return 'MISSING';
      if (usable.some((item) => item.status === 'MISSING')) return 'MISSING';
      return usable.every((item) => item.status === 'DECLARED_CONFIRMED') ? 'DECLARED_CONFIRMED' : 'ASSUMPTION';
    }
    function anyState(states) {
      const usable = states.filter(Boolean);
      if (!usable.length || usable.every((item) => item.status === 'MISSING')) return 'MISSING';
      return usable.some((item) => item.status === 'DECLARED_CONFIRMED') ? 'DECLARED_CONFIRMED' : 'ASSUMPTION';
    }

    P.projName = safeText(P.projName, 'AIDC 数据中心');
    P.region = safeText(P.region, '未指定区域');
    P.tier = P.tier || 'tier3';
    P.redundancy = P.redundancy || '2n1';
    P.gpuType = P.gpuType || 'h100';
    P.cooling = P.cooling || 'liquid';
    P.pref = P.pref || 'balance';
    P.specialRequirements = Array.isArray(P.specialRequirements) ? P.specialRequirements.slice(0, 20) : [];
    const spec = GPU_SPECS[P.gpuType] || GPU_SPECS.h100;

    const gpuCount = Math.max(0, round(asNumber(P.gpuCount, 0)));
    const rackPower = positive(P.rackPower, 40);
    const servers = spec.rack72 ? gpuCount : Math.ceil(gpuCount / 8);
    const gpuRacks = spec.rack72 ? Math.max(1, Math.ceil(gpuCount / 72)) : Math.max(1, Math.ceil(servers * spec.rackPower / rackPower));
    const estimatedItLoadKw = spec.rack72 ? gpuRacks * spec.rackPower : servers * spec.rackPower;
    const suppliedItLoadKw = asNumber(P.itLoad, 0);
    const itLoadKw = suppliedItLoadKw > 0 ? suppliedItLoadKw : round(estimatedItLoadKw);
    if (!(suppliedItLoadKw > 0)) addAssumption('IT-LOAD-ESTIMATE', itLoadKw + ' kW', '按 GPU 配置与服务器装载假设估算，需以 IT 负荷清单确认');
    if (suppliedItLoadKw > 0 && gpuCount > 0 && Math.abs(suppliedItLoadKw - estimatedItLoadKw) / Math.max(1, suppliedItLoadKw) > 0.25) {
      warnings.push('已填 IT 负荷与 GPU 估算负荷相差超过 25%，请以机柜/服务器负荷清单复核。');
    }
    const netRacks = Math.max(1, Math.ceil(gpuRacks * 0.25));
    const storageRacks = Math.max(1, Math.ceil(gpuRacks * 0.10));
    const mgmtRacks = 4;
    const totalRacks = gpuRacks + netRacks + storageRacks + mgmtRacks;

    const pueTarget = positive(P.pueTarget, 1.25);
    const facilityDemandKw = round(itLoadKw * pueTarget);
    const coolingElectricalBudgetKw = Math.max(0, facilityDemandKw - itLoadKw);

    const voltageKv = positive(P.voltage, 10);
    const topology = P.redundancy;
    const paths = (P.tier === 'tier2' || topology === 'n1') ? ['A'] : ['A', 'B'];
    const mainsCount = paths.length;
    if (P.tier === 'tier2' && topology !== 'n1') warnings.push('Tier II 目标与双路冗余选择并存；本引擎按冗余路径输出，等级认证需独立审查。');

    /* ---------- electrical concept sizing ---------- */
    const pf = positive(P.powerFactor, 0.92);
    const txUnit = positive(P.txUnitKva, TX_UNIT_DEFAULT[voltageKv] || 2500);
    const txRequiredPerPathKva = facilityDemandKw / pf;
    const txActivePerPath = Math.max(1, Math.ceil(txRequiredPerPathKva / txUnit));
    const txRedundancyPerPath = (topology === 'n1' || topology === '2n1') ? 1 : 0;
    const txInstalledPerPath = txActivePerPath + txRedundancyPerPath;
    const txTotal = txInstalledPerPath * mainsCount;

    const upsUnit = positive(P.upsUnitKva, 1200);
    const upsPf = positive(P.upsOutputPf, 0.9);
    const upsUtilisation = positive(P.upsUtilisation, 0.85);
    const criticalKvaPerPath = itLoadKw / upsPf;
    const upsActivePerPath = Math.max(1, Math.ceil(criticalKvaPerPath / (upsUnit * upsUtilisation)));
    const upsRedundancyPerPath = (topology === 'n1' || topology === '2n1') ? 1 : 0;
    const upsInstalledPerPath = upsActivePerPath + upsRedundancyPerPath;
    const upsTotal = upsInstalledPerPath * mainsCount;
    const upsBackupMin = positive(P.upsBackupMin, 15);
    const batTotalKwh = round(mainsCount * itLoadKw * upsBackupMin / 60 / 0.92);

    const gridScMva = positive(P.gridScMva, 500);
    if (!(Number(P.gridScMva) > 0)) addAssumption('GRID-SC-MVA', gridScMva + ' MVA', '站外电源短路容量未提供；暂用概念值，不能据此定断路器或整定值');
    const mvIkA = gridScMva / (Math.sqrt(3) * voltageKv);
    const mvBreakingKa = nextStandard(mvIkA * 1.10, MV_BREAKING_KA);
    const mvInA = nextStandard(txRequiredPerPathKva / (Math.sqrt(3) * voltageKv), MV_BREAKER_A);
    const txUkPct = positive(P.txUkPct, 6);
    if (!(Number(P.txUkPct) > 0)) addAssumption('TX-UK', txUkPct + '%', '变压器阻抗未提供；暂用概念值，电缆/并列变压器/电源阻抗尚未纳入');
    const lvMainA = nextStandard(txUnit / (Math.sqrt(3) * 0.4), LV_ACB_A);
    const lvBaseKa = txUnit / (Math.sqrt(3) * 0.4) / 1000;
    const lvIkA = lvBaseKa / (txUkPct / 100);
    const lvBreakingKa = nextStandard(lvIkA * 1.10, LV_BREAKING_KA);

    const genUnitKw = positive(P.genUnitKw, 2500);
    const genActivePerPath = Math.max(1, Math.ceil(facilityDemandKw * 1.15 / genUnitKw));
    const genRedundancyPerPath = (topology === 'n1' || topology === '2n1') ? 1 : 0;
    const genCount = (genActivePerPath + genRedundancyPerPath) * mainsCount;
    const pduPerPath = Math.max(1, Math.ceil(gpuRacks / 10));
    const pduCount = pduPerPath * mainsCount;
    const auxStsCount = Math.max(1, Math.ceil(totalRacks / 30));

    /* ---------- cooling & hydraulic concept sizing ---------- */
    const isLiquid = P.cooling === 'liquid' || P.cooling === 'hybrid';
    const liquidRatio = P.cooling === 'hybrid' ? 0.70 : (isLiquid ? 1 : 0);
    const supplyTemp = positive(P.supplyTemp, 35);
    const requestedReturnTemp = positive(P.returnTemp, 45);
    const returnTemp = requestedReturnTemp > supplyTemp ? requestedReturnTemp : supplyTemp + 10;
    if (requestedReturnTemp <= supplyTemp) warnings.push('液冷回水温度必须高于供水温度；已按供回水温差 10℃进行概念计算。');
    const deltaT = returnTemp - supplyTemp;
    const liquidHeatKw = isLiquid ? round(itLoadKw * liquidRatio * 1.05) : 0;
    const airHeatKw = round(itLoadKw * (1 - liquidRatio) * 1.05);
    const heatRejectionKw = round(facilityDemandKw * 1.05);
    const cduCap = positive(P.cduUnitKw, 500);
    const cduUtilisation = positive(P.cduUtilisation, 0.90);
    const cduActiveCount = isLiquid ? Math.max(1, Math.ceil(liquidHeatKw / (cduCap * cduUtilisation))) : 0;
    const cduRedundancyCount = isLiquid ? 1 : 0;
    const cduCount = cduActiveCount + cduRedundancyCount;
    const chillerCap = positive(P.chillerUnitKw, 3000);
    const chillerActiveCount = Math.max(1, Math.ceil(heatRejectionKw / (chillerCap * 0.90)));
    const chillerRedundancyCount = 1;
    const chillerCount = chillerActiveCount + chillerRedundancyCount;
    const towerCap = positive(P.towerUnitKw, 3000);
    const towerActiveCount = Math.max(1, Math.ceil(heatRejectionKw / (towerCap * 0.90)));
    const towerRedundancyCount = 1;
    const towerCount = towerActiveCount + towerRedundancyCount;
    const cracCount = airHeatKw > 0 ? Math.ceil(airHeatKw / 200 / 0.90) + 1 : 0;
    const pumpCount = isLiquid ? Math.max(2, Math.ceil(cduCount / 8) * 2) : 0;

    const flowLpm = isLiquid ? round(liquidHeatKw * 60 / (4.186 * deltaT)) : 0;
    const primaryFlowLpm = round(heatRejectionKw * 60 / (4.186 * 8));
    const condenserFlowLpm = round(heatRejectionKw * 60 / (4.186 * 5));
    const pipe = pipeForFlow(flowLpm, 1.8);
    const primaryPipe = pipeForFlow(primaryFlowLpm, 2.0);
    const condenserPipe = pipeForFlow(condenserFlowLpm, 2.2);
    const designWetBulb = positive(P.designWetBulb, defaultClimate(P.region));
    if (!(Number(P.designWetBulb) > 0)) addAssumption('DESIGN-WET-BULB', designWetBulb + '℃', '未输入项目所在地逐时气象与设计湿球温度；自然冷却小时数不予计算');
    const coldRegion = /哈尔滨|长春|沈阳|内蒙|呼和浩特|新疆|西藏|青海/.test(P.region || '');
    const glycol = coldRegion ? '防冻液比例待最低环境温度与水质确认' : '水质、缓蚀剂与电导率要求待确认';

    /* ---------- pulse / storage concept, isolated from UPS autonomy ---------- */
    const peakPowerPerGpu = r2(spec.tdp * spec.pulse.spikeRatio / 1000);
    const totalPeakKw = round(gpuCount * peakPowerPerGpu);
    const transientKw = Math.max(0, totalPeakKw - itLoadKw);
    const hscPowerKw = round(transientKw * 0.80);
    const bbuPowerKw = round(transientKw * 0.20);
    const hscCapKwh = r1(Math.max(0.5, totalPeakKw * spec.pulse.spikeMs / 3600000 * spec.pulse.freqPerSec * 3));
    const bbuBackupMin = 15;
    const bbuCapKwh = round(bbuPowerKw * bbuBackupMin / 60);
    const bessPowerKw = round(itLoadKw * 0.15);
    const bessCapKwh = round(bessPowerKw * 0.5);
    const ipsReduce = spec.ips.enabled ? round(transientKw * spec.ips.peakReduction) : 0;

    /* ---------- controlled conceptual catalogue ---------- */
    const VEN = window.VENDORS;
    const selection = VEN ? {
      ups: VEN.select('ups', P.pref, { requiredCapacity: upsUnit }),
      transformer: VEN.select('transformer', P.pref, { requiredCapacity: txUnit }),
      battery: VEN.select('battery', P.pref, { requiredCapacity: bessCapKwh || 1 }),
      cdu: isLiquid ? VEN.select('cdu', P.pref, { requiredCapacity: cduCap }) : null,
      pcs: VEN.select('pcs', P.pref, { requiredCapacity: bessPowerKw || 1 })
    } : null;
    const estimate = (key, qty, cap) => (VEN && selection && selection[key]) ? VEN.estimate(selection[key].recommended, qty, cap) : { unitCny: 0, totalCny: 0 };
    const selectedModel = (key) => {
      const item = selection && selection[key];
      return item && item.recommended ? item.recommended.vendor + ' ' + item.recommended.model : '无目录容量匹配，待 RFQ';
    };
    const selectedStatus = (key) => {
      const item = selection && selection[key];
      return item && item.status === 'NO_CAPACITY_MATCH—RFQ_REQUIRED' ? item.status : 'RFQ_REQUIRED';
    };
    if (selection) Object.keys(selection).forEach((key) => {
      if (selection[key] && !selection[key].recommended) warnings.push(selection[key].name + '：受控示例目录无满足容量的条目，已停止概念推荐，需 RFQ。');
    });

    /* ---------- BOM, kept explicitly as a concept estimate ---------- */
    const bom = [];
    const addBom = (cat, name, model, qty, unit, unitCny, note, source, status) => {
      if (!(qty > 0)) return;
      const cleanUnitCny = Math.max(0, Number(unitCny) || 0);
      const totalCny = round(cleanUnitCny * qty);
      bom.push({
        cat, name, model, qty, unit,
        unitPriceCny: cleanUnitCny, totalCny,
        unitPrice: cnyToWan(cleanUnitCny), total: cnyToWan(totalCny),
        note: note || '', source: source || '概念估算/非报价', status: status || 'RFQ_REQUIRED'
      });
    };
    const txQuote = estimate('transformer', txTotal, txUnit);
    const upsQuote = estimate('ups', upsTotal, upsUnit);
    const bessQuote = estimate('battery', 1, bessCapKwh);
    const cduQuote = estimate('cdu', cduCount, cduCap);
    addBom('算力', 'GPU 服务器', spec.name, servers, '台', spec.serverPriceWan * 10000, spec.rack72 ? '整柜 72 卡的示例估算' : '8 卡/台的示例估算');
    addBom('算力', '网络交换机柜', 'Spine-Leaf 网络柜', netRacks, '柜', 150000, '概念预留');
    addBom('算力', '存储柜', 'NVMe 全闪存柜', storageRacks, '柜', 200000, '概念预留');
    addBom('算力', '管理/监控柜', '综合管理柜', mgmtRacks, '柜', 120000, '概念预留');
    addBom('供电', '干式变压器组', selectedModel('transformer'), txTotal, '台', txQuote.unitCny, '每路径 ' + txActivePerPath + ' 用 + ' + txRedundancyPerPath + ' 备，' + txUnit + 'kVA/台', VEN ? VEN.CATALOG_STATUS : 'RFQ_REQUIRED', selectedStatus('transformer'));
    addBom('供电', '中压开关柜', voltageKv + 'kV 进线/馈线柜', Math.max(3, mainsCount * 3 + 2), '面', 180000, '短路开断能力需以短路计算书校核');
    addBom('供电', '低压配电柜', '低压主配电/母联/馈线柜', Math.max(4, upsTotal + 4), '面', 110000, '柜体型式试验与温升校核待厂家深化');
    addBom('供电', 'UPS 系统', selectedModel('ups'), upsTotal, '台', upsQuote.unitCny, '每路径 ' + upsActivePerPath + ' 用 + ' + upsRedundancyPerPath + ' 备，后备 ' + upsBackupMin + 'min', VEN ? VEN.CATALOG_STATUS : 'RFQ_REQUIRED', selectedStatus('ups'));
    addBom('供电', 'UPS 电池组', '按 UPS 后备时间概念估算', 1, '套', batTotalKwh * 700, batTotalKwh + 'kWh（需按放电曲线、温度和寿命复核）');
    addBom('供电', '柴油发电机组', genUnitKw + 'kW 模块化机组', genCount, '台', genUnitKw * 900, '每路径 ' + genActivePerPath + ' 用 + ' + genRedundancyPerPath + ' 备；储油和并机策略待专项设计');
    addBom('供电', '列头柜/PDU', 'A/B 独立列头柜', pduCount, '台', 150000, 'GPU 机柜采用 A/B 双输入；STS 仅供辅助单电源负荷');
    addBom('供电', '辅助负荷 STS', '静态切换开关', auxStsCount, '台', 250000, '不作为 GPU 双电源主路径');
    if (isLiquid) {
      addBom('冷却', 'CDU 冷量分配组', selectedModel('cdu'), cduCount, '台', cduQuote.unitCny, cduActiveCount + ' 用 + ' + cduRedundancyCount + ' 备，' + cduCap + 'kW/台', VEN ? VEN.CATALOG_STATUS : 'RFQ_REQUIRED', selectedStatus('cdu'));
    }
    addBom('冷却', '冷水机组', chillerCap + 'kW 级', chillerCount, '台', chillerCap * 700, chillerActiveCount + ' 用 + ' + chillerRedundancyCount + ' 备，设备性能待选型');
    addBom('冷却', '冷却塔', towerCap + 'kW 级', towerCount, '台', towerCap * 320, towerActiveCount + ' 用 + ' + towerRedundancyCount + ' 备，需以当地气象工况校核');
    if (cracCount) addBom('冷却', '精密空调 CRAC', '200kW 级', cracCount, '台', 300000, '仅承担风冷部分热负荷');
    if (isLiquid) addBom('冷却', '液冷管路/阀件/仪表', pipe.dn + ' 级主干', 1, '套', Math.max(500000, liquidHeatKw * 200), '管径、泵扬程、压降、材料和水处理需专项水力计算');
    addBom('监控', 'DCIM/动环监控', 'DCIM + 漏液 + 能源监测', 1, '套', 2000000 + itLoadKw * 200, '点表、通讯协议、网络安全与联锁矩阵待深化');
    const bomTotalCny = bom.reduce((sum, item) => sum + item.totalCny, 0);
    const bomTotal = cnyToWan(bomTotalCny);

    const civilWan = round(facilityDemandKw * 0.30);
    const contingencyWan = round((bomTotal + civilWan) * 0.08);
    const capex = bomTotal + civilWan + contingencyWan;
    const energyTariff = positive(P.pricePeak, 1.05) * 0.65 + positive(P.priceValley, 0.35) * 0.35;
    const elecAnnual = round(facilityDemandKw * 8760 * energyTariff / 10000);
    const opexAnnual = round(elecAnnual + capex * 0.02);

    /* ---------- release readiness: data provenance, not a compliance claim ---------- */
    const inputStates = {
      itLoad: inputState('itLoad', suppliedItLoadKw > 0 ? itLoadKw + ' kW' : estimatedItLoadKw + ' kW（由 GPU 配置估算）', 'IT 负荷', 'IT 负荷清单未获项目方核实；当前负荷仅作概念计算依据。'),
      gpuCount: inputState('gpuCount', gpuCount + ' 卡', 'GPU 数量', 'GPU 数量/服务器装载未获项目方核实；仅作负荷估算辅助依据。'),
      gpuType: inputState('gpuType', P.gpuType, 'GPU 型号', 'GPU 型号/代际未获项目方设备清单核实。'),
      rackPower: inputState('rackPower', rackPower + ' kW/柜', '机柜功率密度', '机柜功率密度未获机柜、服务器和配电接口清单核实。'),
      tier: inputState('tier', P.tier, '可靠性等级目标', '可靠性等级仅为输入目标，尚无设计基准文件或认证路径核实。'),
      redundancy: inputState('redundancy', topology, '供电冗余拓扑', '供电冗余选择尚未由项目可靠性设计基准核实。'),
      voltage: inputState('voltage', voltageKv + ' kV', '接入电压', '接入电压/供电点条件未获电网或业主书面确认。'),
      gridScMva: inputState('gridScMva', gridScMva + ' MVA', '上级电网短路容量', '上级电网短路容量未获电网运行方式资料核实。'),
      txUkPct: inputState('txUkPct', txUkPct + '%', '变压器阻抗', '变压器阻抗尚未由厂家数据表/项目设备表核实。'),
      powerFactor: inputState('powerFactor', pf, '功率因数', '功率因数尚未由负荷清单、UPS/IT 设备数据表核实。'),
      upsBackupMin: inputState('upsBackupMin', upsBackupMin + ' min', 'UPS 后备时间', 'UPS 后备时间尚未由业务连续性策略与设备放电曲线核实。'),
      cooling: inputState('cooling', P.cooling, '冷却路线', '冷却路线尚未由 IT 设备接口、机房平面与冷源策略核实。'),
      region: inputState('region', P.region, '项目所在地', '项目所在地/气象设计边界未获得项目设计依据核实。'),
      designWetBulb: inputState('designWetBulb', designWetBulb + '℃', '设计湿球温度', '设计湿球温度未获逐时气象数据及项目工况书核实。'),
      cduUnitKw: inputState('cduUnitKw', cduCap + ' kW', 'CDU 单机能力', 'CDU 能力未获厂家性能曲线和液冷设备接口核实。'),
      supplyTemp: inputState('supplyTemp', supplyTemp + '℃', '液冷供水温度', '液冷供水温度未获 IT 设备液冷规范和项目冷源策略核实。'),
      returnTemp: inputState('returnTemp', returnTemp + '℃', '液冷回水温度', '液冷回水温度未获 IT 设备液冷规范和项目冷源策略核实。'),
      pueTarget: inputState('pueTarget', pueTarget, 'PUE 目标', 'PUE 目标未获项目能效口径核实；其本身也不是年度 PUE 模拟或实测结果。'),
      pricePeak: inputState('pricePeak', positive(P.pricePeak, 1.05) + ' 元/kWh', '峰电价', '峰电价未获项目能源合同/财务口径核实；经济性仅为概念估算。'),
      priceValley: inputState('priceValley', positive(P.priceValley, 0.35) + ' 元/kWh', '谷电价', '谷电价未获项目能源合同/财务口径核实；经济性仅为概念估算。')
    };

    function inputEntry(id, discipline, title, states, detail, aggregation) {
      const cleanStates = states.filter(Boolean);
      const status = (aggregation === 'any' ? anyState(cleanStates) : allState(cleanStates));
      return {
        id, kind: 'INPUT_BASIS', discipline, title, status,
        requiredFor: ['REVIEW_READY'], detail,
        inputs: cleanStates.map((item) => ({ key: item.key, label: item.label, value: item.value, status: item.status, source: item.source })),
        evidence: cleanStates.map((item) => item.key + ':' + item.source)
      };
    }
    function evidenceEntry(id, discipline, title, key, detail, applicable) {
      if (applicable === false) {
        return { id, kind: 'EXTERNAL_EVIDENCE', discipline, title, status: 'NOT_APPLICABLE', requiredFor: [], detail: '当前方案不适用：' + detail, evidence: [] };
      }
      const value = releaseEvidence[key];
      const declared = declaredTrue(value) || !!(value && typeof value === 'object' && (declaredTrue(value.complete) || declaredTrue(value.status)));
      const source = value && typeof value === 'object' ? safeText(value.source, 'USER_DECLARATION') : (declared ? 'USER_DECLARATION' : 'NOT_DECLARED');
      return {
        id, kind: 'EXTERNAL_EVIDENCE', discipline, title,
        status: declared ? 'DECLARED_COMPLETE' : 'EXTERNAL_EVIDENCE_REQUIRED',
        requiredFor: ['REVIEW_READY'], detail,
        evidence: declared ? [key + ':' + source] : []
      };
    }

    const readinessEntries = [
      inputEntry('BASIS-IT-001', '设计依据', 'IT 负荷与算力清单', [inputStates.itLoad, inputStates.gpuCount, inputStates.gpuType, inputStates.rackPower], '需要经项目方确认的 IT 负荷、GPU/服务器装载和机柜功率清单；GPU 推算不能替代负荷清单。', 'all'),
      inputEntry('BASIS-REL-001', '设计依据', '可靠性目标与运行策略', [inputStates.tier, inputStates.redundancy], '需要项目可靠性设计基准、维护策略、故障域及可用性目标。', 'all'),
      inputEntry('BASIS-GRID-001', '电气', '供电接入与短路数据', [inputStates.voltage, inputStates.gridScMva], '需要供电批复、运行方式、短路容量及站外电源边界。', 'all'),
      inputEntry('BASIS-ELEC-001', '电气', '关键电气设备设计数据', [inputStates.txUkPct, inputStates.powerFactor, inputStates.upsBackupMin], '需要变压器/UPS 数据表、负荷功率因数和业务连续性后备时间依据。', 'all'),
      inputEntry('BASIS-THERMAL-001', '暖通/液冷', '冷却与气象设计条件', isLiquid ? [inputStates.cooling, inputStates.region, inputStates.designWetBulb, inputStates.cduUnitKw, inputStates.supplyTemp, inputStates.returnTemp] : [inputStates.cooling, inputStates.region, inputStates.designWetBulb], '需要 IT 液冷接口、当地逐时气象、冷源性能和供回水设计条件。', 'all'),
      inputEntry('BASIS-ENERGY-001', '能效/经济', 'PUE 目标与能源经济边界', [inputStates.pueTarget, inputStates.pricePeak, inputStates.priceValley], '需要项目认可的 PUE 目标、运行时段和电价/能源合同口径；年度 PUE 仍须独立模拟或实测。', 'all'),
      evidenceEntry('STUDY-SC-001', '电气', '短路计算书与电网运行方式', 'shortCircuitStudy', '需提供并经电气专业复核短路计算书；本引擎的初算不能作为开断能力定值依据。'),
      evidenceEntry('STUDY-PROT-001', '电气', '保护配合、接地与弧光风险研究', 'protectionStudy', '需提供继电保护/低压选择性/接地/弧光风险计算书和设备 TCC 曲线。'),
      evidenceEntry('STUDY-HYD-001', '暖通/液冷', '水力、泵扬程与联锁计算书', 'hydraulicStudy', '需提供管网压降、泵扬程、NPSH、阀门、漏液和联锁故障工况分析。', isLiquid),
      evidenceEntry('COORD-FIRE-001', '多专业协调', '平面、路由、消防、结构与维护协调', 'fireCivilCoordination', '需完成机房平面、疏散、消防、承重、设备运输、线缆/管道物理隔离与维护空间协调。'),
      evidenceEntry('VENDOR-RFQ-001', '采购/设备', '设备数据表、型式文件与 RFQ', 'vendorData', '需以厂家正式数据表、型式试验资料、供货边界、交期及 RFQ 替代受控示例目录。'),
      evidenceEntry('DOC-CAD-001', '文控', '项目图框、图层、编号与校审流程', 'cadDocumentControl', '需纳入项目 CAD/BIM 标准、图号、修订、校审和文件受控流程。')
    ];
    const reviewEntries = readinessEntries.filter((item) => (item.requiredFor || []).includes('REVIEW_READY'));
    const unresolvedEntries = reviewEntries.filter((item) => !['DECLARED_CONFIRMED', 'DECLARED_COMPLETE', 'NOT_APPLICABLE'].includes(item.status));
    const declaredEntries = reviewEntries.filter((item) => ['DECLARED_CONFIRMED', 'DECLARED_COMPLETE'].includes(item.status));
    const applicableEntries = reviewEntries.filter((item) => item.status !== 'NOT_APPLICABLE');
    const weightedCompleteness = applicableEntries.reduce((sum, item) => sum + (['DECLARED_CONFIRMED', 'DECLARED_COMPLETE'].includes(item.status) ? 1 : (item.status === 'ASSUMPTION' ? 0.25 : 0)), 0);
    const completenessPct = applicableEntries.length ? Math.round(weightedCompleteness / applicableEntries.length * 100) : 0;
    const declaredPct = applicableEntries.length ? Math.round(declaredEntries.length / applicableEntries.length * 100) : 0;
    const readinessLevel = unresolvedEntries.length ? 'CONCEPT_ONLY' : 'REVIEW_READY';
    const readiness = {
      version: READINESS_VERSION,
      level: readinessLevel,
      label: readinessLevel === 'REVIEW_READY' ? '资料声明齐套，可进入专业方案评审' : '仅限概念方案，资料/校核尚未齐套',
      detail: readinessLevel === 'REVIEW_READY'
        ? '本级别基于提交人对资料齐套的声明；平台未读取或验证原始文件，仍必须由相应专业人员离线审查。'
        : '存在默认值、未核实输入或缺失专项资料。可用于方案比较，不得用于施工、采购、保护整定或规范符合性声明。',
      summary: {
        applicableCount: applicableEntries.length,
        declaredCount: declaredEntries.length,
        assumptionCount: reviewEntries.filter((item) => item.status === 'ASSUMPTION').length,
        missingEvidenceCount: reviewEntries.filter((item) => ['MISSING', 'EXTERNAL_EVIDENCE_REQUIRED'].includes(item.status)).length,
        completenessPct, declaredPct
      },
      entries: readinessEntries,
      blockingItems: unresolvedEntries.map((item) => ({ id: item.id, title: item.title, status: item.status, detail: item.detail })),
      release: {
        conceptExportAllowed: true,
        reviewPackageAllowed: readinessLevel === 'REVIEW_READY',
        constructionDrawingAllowed: false,
        constructionStatus: 'BLOCKED—EXTERNAL_PROFESSIONAL_SIGNOFF_REQUIRED',
        forbiddenLabels: ['施工图', '施工图设计', 'IFC', 'Issued for Construction'],
        reason: '自动生成器无法验证原始设计依据、计算书、设备文件、图纸校审记录或执业资格签章；任何自动输出均不得标记为施工图。',
        requiredExternalAction: '在受控项目环境中完成多专业计算、校审、签字/盖章与发布审批后，方可由项目文控系统另行发布。'
      },
      inputStates
    };

    /* ---------- explicit validation boundaries ---------- */
    const validation = [
      { id: 'ELEC-TOPOLOGY-001', result: mainsCount > 1 ? 'ASSUMPTION' : 'WARN', rule: '关键 IT 负荷 A/B 路径模型', ref: '项目可靠性目标/待第三方审查', detail: mainsCount > 1 ? '工程模型已建立 A/B 独立逻辑路径；物理路由、维护隔离和共因失效尚未验证。' : '当前为单路径 N+1 概念，不能声明双路无单点故障。', evidence: ['ADEM.powerPaths'] },
      { id: 'ELEC-SC-001', result: 'ASSUMPTION', rule: '短路电流概念计算', ref: 'IEC 60909 / 项目电网资料', detail: voltageKv + 'kV 母线概念短路电流 ' + r2(mvIkA) + 'kA；0.4kV 单台变压器端约 ' + r2(lvIkA) + 'kA。未计电缆、并列源、发电机和保护器件限流。', evidence: ['GRID-SC-MVA', 'TX-UK'] },
      { id: 'ELEC-PROTECTION-001', result: 'NOT_CHECKED', rule: '保护选择性与整定配合', ref: '保护配合研究/设备 TCC 曲线', detail: '禁止用固定倍数整定替代保护配合。需输入 CT/PT、继保、断路器、线路参数并形成 TCC/整定计算书。', evidence: [] },
      { id: 'ELEC-UPS-001', result: 'ASSUMPTION', rule: 'UPS 冗余与后备时间', ref: 'UPS 厂家曲线/负荷曲线', detail: '每路径 ' + upsActivePerPath + ' 用 + ' + upsRedundancyPerPath + ' 备，概念电池需求 ' + batTotalKwh + 'kWh；需按温度、老化、功率因数和放电曲线复核。', evidence: ['UPS-BACKUP-MIN'] },
      { id: 'CLG-CDU-001', result: isLiquid ? 'CALCULATED' : 'SKIP', rule: 'CDU 热负荷能力', ref: '热平衡与设备性能曲线', detail: isLiquid ? '液冷热负荷 ' + liquidHeatKw.toLocaleString() + 'kW；配置 ' + cduCount + ' 台×' + cduCap + 'kW（' + cduActiveCount + ' 用 + ' + cduRedundancyCount + ' 备）。' : '当前为风冷方案，不配置 CDU。', evidence: ['IT-LOAD', 'LIQUID-RATIO', 'CDU-UNIT-KW'] },
      { id: 'CLG-HYD-001', result: isLiquid ? 'NOT_CHECKED' : 'SKIP', rule: '液冷管网水力与泵扬程', ref: '水力计算书/厂家压降曲线', detail: isLiquid ? '二次侧概念流量 ' + flowLpm.toLocaleString() + 'L/min，初选 ' + pipe.dn + '；尚未计算长度、局部阻力、NPSH、阀权度和故障工况。' : '风冷方案不适用。', evidence: [] },
      { id: 'CLG-CLIMATE-001', result: 'NOT_CHECKED', rule: '冷源能力与自然冷却小时', ref: '当地逐时气象数据/设备性能曲线', detail: '概念设计湿球温度 ' + designWetBulb + '℃；未计算全年逐时 PUE、WUE 或自然冷却小时。', evidence: ['DESIGN-WET-BULB'] },
      { id: 'ENERGY-PUE-001', result: 'NOT_CHECKED', rule: 'PUE 目标校核', ref: '能效模拟与实测边界', detail: 'PUE ' + pueTarget + ' 仅作为用户目标，不能由本概念模型自动判定达标。', evidence: ['PUE-TARGET'] },
      { id: 'DOC-READINESS-001', result: readinessLevel === 'REVIEW_READY' ? 'ASSUMPTION' : 'WARN', rule: '发布检查与资料完整度', ref: '项目设计管理计划/文控流程', detail: readiness.label + '；资料完整度 ' + completenessPct + '%，提交人声明齐套比例 ' + declaredPct + '%。' + readiness.release.reason, evidence: readiness.blockingItems.map((item) => item.id) },
      { id: 'DOC-REVIEW-001', result: 'NOT_CHECKED', rule: '施工图签发与规范符合性', ref: '注册工程师审查/项目适用规范', detail: '当前输出为方案级自动草案。需由具备相应资格的电气、暖通及消防专业人员审核签发。', evidence: [] }
    ];

    const protection = [
      { bay: '中压进线与变压器', status: 'NOT_CHECKED', items: ['待导入站外短路容量、CT/PT 参数、继保型号与整定原则', '待完成过流、零序、差动、瓦斯/温度保护配合研究'] },
      { bay: '低压主配电与 UPS', status: 'NOT_CHECKED', items: ['待导入 ACB/MCCB 曲线、母线/电缆阻抗及负荷选择性要求', '待完成 UPS 旁路、维护旁路、反送电和接地故障保护校核'] },
      { bay: '柴油发电机与并机', status: 'NOT_CHECKED', items: ['待完成启动顺序、负荷投入阶梯、短路贡献、并机及储油专项设计'] },
      { bay: '液冷联锁', status: isLiquid ? 'NOT_CHECKED' : 'SKIP', items: isLiquid ? ['待定义 TT/PT/FT/漏液点表、阀门失效位、联锁矩阵和 EPO 接口', '待完成泵组、CDU 和冷源 N+1 故障工况验证'] : ['风冷方案不适用'] }
    ];

    const power = {
      voltage: voltageKv + 'kV', voltageKv, pf, mainsCount,
      topology, txUnit, txRequiredPerPathKva: r1(txRequiredPerPathKva), txActivePerPath, txRedundancyPerPath, txInstalledPerPath, txTotal,
      mvInA, mvIkA: r2(mvIkA), mvBreakingKa,
      txUkPct, lvMainA, lvIkA: r2(lvIkA), lvBreakingKa,
      upsUnit, upsActivePerPath, upsRedundancyPerPath, upsInstalledPerPath, upsPerSide: upsInstalledPerPath, upsTotal, upsBackupMin, batTotalKwh,
      genUnitKw, genActivePerPath, genRedundancyPerPath, genCap: genUnitKw, genCount,
      pduPerPath, pduCount, auxStsCount,
      panelType: voltageKv === 10 ? 'KYN28-12（待项目确认）' : voltageKv === 35 ? 'KYN61-40.5（待项目确认）' : 'GIS/主变方案待确认',
      txName: '干式变压器 ' + txUnit + 'kVA（待厂家确认）', txVector: '待确认', txUk: txUkPct + '%'
    };
    const cooling = {
      type: P.cooling, isLiquid, liquidRatio, itHeatKw: itLoadKw, liquidHeatKw, airHeatKw, heatRejectionKw,
      cduCap, cduActiveCount, cduRedundancyCount, cduCount,
      chillerCap, chillerActiveCount, chillerRedundancyCount, chillerCount,
      towerCap, towerActiveCount, towerRedundancyCount, towerCount,
      cracCount, pumpCount, supplyTemp, returnTemp, deltaT,
      flowLpm, primaryFlowLpm, condenserFlowLpm,
      dn: pipe.dn, primaryDn: primaryPipe.dn, condenserDn: condenserPipe.dn,
      pipeVelocity: pipe.velocityMps, primaryVelocity: primaryPipe.velocityMps, condenserVelocity: condenserPipe.velocityMps,
      designWetBulb, glycol, material: P.pipeMaterial || '待水质/腐蚀评估确认', pressure: P.designPressure || '待水力与设备额定压力确认',
      branchDn: '按单柜/单 CDU 流量与压降专项计算', freeCoolingH: null, freeCoolingRatio: '待逐时气象模拟',
      leakDetect: '待定义漏液点表、分区阀与联锁矩阵；不得以固定关断秒数替代设计验证'
    };
    const compute = {
      gpuName: spec.name, gpuCount, servers, gpuRacks, netRacks, storageRacks, mgmtRacks, totalRacks,
      itLoadKw, estimatedItLoadKw: round(estimatedItLoadKw), facilityDemandKw, coolingElectricalBudgetKw,
      rackPower, totalFlops: (gpuCount * spec.fp16 / 1000).toFixed(1) + ' PFLOPS(FP16)', interconnect: spec.interconnect, gpuMem: spec.mem
    };
    const pulse = {
      spikeRatio: spec.pulse.spikeRatio, spikeMs: spec.pulse.spikeMs, freqPerSec: spec.pulse.freqPerSec,
      peakPowerPerGpu, totalPeakKw, transientKw, ipsEnabled: spec.ips.enabled, ipsPeakReduction: spec.ips.peakReduction,
      effectiveTransientKw: Math.max(0, transientKw - ipsReduce), risk: transientKw > itLoadKw * 0.3 ? '需专项评估' : '待负荷实测确认',
      advice: 'GPU 瞬态、HSC/BBU/储能接口及 UPS 瞬态能力需由设备测试数据和动态仿真确认。'
    };
    const storage = {
      hsc: { powerKw: hscPowerKw, modules: Math.ceil(hscPowerKw / 100), capKwh: hscCapKwh, tech: '可选瞬态缓冲概念', resp: '待设备测试确认' },
      bbu: { powerKw: bbuPowerKw, modules: Math.ceil(bbuPowerKw / 50), capKwh: bbuCapKwh, backupMin: bbuBackupMin, tech: '可选瞬态缓冲概念', resp: '待设备测试确认' },
      bess: { powerKw: bessPowerKw, capKwh: bessCapKwh, tech: '可选储能概念', resp: '待系统控制与消防专项确认' },
      totalInvest: cnyToWan(bessQuote.totalCny), note: '本储能概念不替代 UPS 后备电池设计。'
    };
    const layout = {
      rows: Math.max(2, Math.ceil(gpuRacks / 12)), racksPerRow: Math.ceil(gpuRacks / Math.max(2, Math.ceil(gpuRacks / 12))),
      gpuRacks, netRacks, storageRacks, mgmtRacks, totalRacks,
      coldAisle: 1200, hotAisle: 1000, mainAisle: 2000,
      roomW: '待机房平面与消防疏散设计确认', roomD: '待机房平面与消防疏散设计确认', totalArea: '待建筑/结构/暖通协同确认', rackPower: rackPower + 'kW/柜'
    };
    const economics = {
      status: 'CONCEPT_ESTIMATE—RFQ_REQUIRED', bomTotal, capex, capexIT: null, capexPower: null, capexCooling: null,
      capexCivil: civilWan, capexNet: null, capexStorage: cnyToWan(bessQuote.totalCny), contingencyWan,
      opexAnnual, elecAnnual, tco10y: capex + opexAnnual * 10, energyIntensity: r2(energyTariff) + ' 元/kWh（概念电价结构）'
    };

    const design = window.AIDC_DESIGN ? window.AIDC_DESIGN.create({
      params: P, power, cooling, compute, topology: { paths }, assumptions
    }) : { schemaVersion: '2.0.0', project: { name: P.projName }, equipment: [], circuits: [], topology: { powerPaths: [] }, assumptions };

    return {
      ok: true, engineVersion: ENGINE_VERSION, documentStatus: 'CONCEPT_DRAFT—PROFESSIONAL_REVIEW_REQUIRED',
      projName: P.projName, region: P.region, tier: P.tier, red: topology, mainsCount, gpuType: P.gpuType, cooling: P.cooling, pref: P.pref,
      inputs: P, compute, pulse, storage, power, cooling, pue: {
        target: pueTarget, annual: null, status: 'NOT_CALCULATED', coolingElectricalBudgetKw, note: '需基于逐时气象、冷源性能曲线、IT 负荷曲线和运维策略进行年度模拟。'
      },
      layout, economics, bom, bomTotal, bomTotalCny, selection, protection,
      compliance: validation, validation, assumptions, warnings, readiness, releaseGate: readiness.release, design,
      calculations: {
        load: { itLoadKw, facilityDemandKw, pueTarget },
        shortCircuit: { gridScMva, mvIkA: r2(mvIkA), lvIkA: r2(lvIkA), status: 'PRELIMINARY' },
        thermal: { liquidHeatKw, heatRejectionKw, flowLpm, deltaT, status: 'PRELIMINARY' }
      }
    };
  }

  return { build, GPU_SPECS, ENGINE_VERSION };
})();
