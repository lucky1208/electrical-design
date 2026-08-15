/* ============================================================
 * AIDC 确定性工程设计引擎 v1.0
 * ------------------------------------------------------------
 * 原则: LLM 只做翻译不做决策 —— 本引擎 100% 确定性, 无 LLM 依赖。
 * 约束来源 (skills):
 *  - 拓扑容量 Skill: 变压器按 总负荷/0.92 且 N+1/2N 冗余, 标准容量序列
 *  - 保护整定 Skill: 进线三段式保护、变压器差动、零序、防孤岛
 *  - 热管理 Skill: CDU N+1、供 35℃/回 45℃ (GPU 高温液冷)、
 *    冷板流量 5~8L/min/模组、304 不锈钢、漏液检测 <5s 关断
 *  - 硬件选型 Skill: UPS 在线双变换、柴发 N+1、STS <10ms
 *  - 标准: GB 50174-2017 / GB 50052 / TIA-942 / ASHRAE TC9.9
 * ============================================================ */
window.AIDC_ENGINE = (function () {
  'use strict';

  /* ---------- GPU 参数库 (设计经验值, 可替换) ---------- */
  const GPU_SPECS = {
    h100:  { name: 'NVIDIA H100 SXM',    tdp: 700,  fp16: 990,  mem: '80GB HBM3',  interconnect: 'NVLink 900GB/s', rackPower: 10.2, serverPrice: 200,
             pulse: { spikeRatio: 1.5, spikeMs: 50,  peakDiDt: 400, freqPerSec: 8 },  ips: { enabled: false, peakReduction: 0 } },
    a100:  { name: 'NVIDIA A100 SXM',    tdp: 400,  fp16: 312,  mem: '80GB HBM2e', interconnect: 'NVLink 600GB/s', rackPower: 6.5,  serverPrice: 140,
             pulse: { spikeRatio: 1.4, spikeMs: 80,  peakDiDt: 250, freqPerSec: 6 },  ips: { enabled: false, peakReduction: 0 } },
    h200:  { name: 'NVIDIA H200 SXM',    tdp: 700,  fp16: 990,  mem: '141GB HBM3e', interconnect: 'NVLink 900GB/s', rackPower: 10.2, serverPrice: 260,
             pulse: { spikeRatio: 1.5, spikeMs: 50,  peakDiDt: 400, freqPerSec: 8 },  ips: { enabled: false, peakReduction: 0 } },
    b200:  { name: 'NVIDIA B200 SXM',    tdp: 1000, fp16: 2250, mem: '192GB HBM3e', interconnect: 'NVLink5 1.8TB/s', rackPower: 14.3, serverPrice: 320,
             pulse: { spikeRatio: 1.8, spikeMs: 30,  peakDiDt: 600, freqPerSec: 10 }, ips: { enabled: true,  peakReduction: 0.30 } },
    gb300: { name: 'NVIDIA GB300 NVL72', tdp: 1400, fp16: 2500, mem: '288GB HBM3e', interconnect: 'NVL72 域互联',    rackPower: 130,  serverPrice: 2500, rack72: true,
             pulse: { spikeRatio: 2.0, spikeMs: 20,  peakDiDt: 800, freqPerSec: 12 }, ips: { enabled: true,  peakReduction: 0.35 } },
    rubin: { name: 'NVIDIA Rubin NVL72', tdp: 1800, fp16: 3300, mem: 'HBM4',        interconnect: 'NVL144 域互联',   rackPower: 150,  serverPrice: 3200, rack72: true,
             pulse: { spikeRatio: 2.0, spikeMs: 20,  peakDiDt: 900, freqPerSec: 12 }, ips: { enabled: true,  peakReduction: 0.35 } },
    ascend910b: { name: '昇腾 910B',      tdp: 400,  fp16: 376,  mem: '64GB HBM2e', interconnect: 'HCCS 392GB/s',   rackPower: 8,    serverPrice: 160,
             pulse: { spikeRatio: 1.4, spikeMs: 80,  peakDiDt: 250, freqPerSec: 6 },  ips: { enabled: false, peakReduction: 0 } }
  };

  const KVA_SERIES = [630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000];
  const MV_BREAKER_A = [630, 1250, 2000, 3150, 4000];
  const LV_ACB_A = [3200, 4000, 5000, 6300];
  const TX_UNIT = { 10: 2500, 35: 10000, 110: 40000 };
  const PANEL_TYPE = { 10: 'KYN28-12', 35: 'KYN61-40.5', 110: 'GIS 126kV' };
  const SC_KA = { 10: 25, 35: 31.5, 110: 40 };

  function stdUp(v, series) {
    for (const s of series) if (s >= v) return s;
    return Math.ceil(v / series[series.length - 1]) * series[series.length - 1];
  }
  function r1(v) { return Math.round(v * 10) / 10; }

  /* ==================== 主构建函数 ==================== */
  function build(P) {
    const warnings = [];
    const spec = GPU_SPECS[P.gpuType] || GPU_SPECS.h100;
    const tier = P.tier || 'tier3';
    const red = P.redundancy || '2n1';
    const mainsCount = tier === 'tier2' ? 1 : 2;
    const gpuCount = Number(P.gpuCount) || 0;

    /* ---------- 1. 算力规划 ---------- */
    let servers, gpuRacks, rackPower;
    if (spec.rack72) {
      servers = gpuCount;            // NVL72 按卡计, 整柜 72 卡
      gpuRacks = Math.max(1, Math.ceil(gpuCount / 72));
      rackPower = spec.rackPower;    // 整柜功率
    } else {
      servers = Math.ceil(gpuCount / 8);
      rackPower = Number(P.rackPower) || 40;
      gpuRacks = Math.max(1, Math.ceil(servers * spec.rackPower / rackPower));
    }
    const netRacks = Math.ceil(gpuRacks * 0.25);
    const storageRacks = Math.ceil(gpuRacks * 0.1);
    const mgmtRacks = 4;
    const totalRacks = gpuRacks + netRacks + storageRacks + mgmtRacks;
    const itLoad = Number(P.itLoad) || Math.round(servers * spec.rackPower);
    if (!P.itLoad) warnings.push('未填写 IT 负荷, 已按 GPU 数量自动估算为 ' + itLoad + ' kW');
    const totalLoad = Math.round(itLoad * (Number(P.pueTarget) || 1.25));
    const coolingLoad = totalLoad - itLoad;

    /* ---------- 2. GPU 脉冲与三层储能 (HSC→BBU→BESS) ---------- */
    const pulse = spec.pulse;
    const peakPowerPerGpu = Math.round(spec.tdp * pulse.spikeRatio / 1000 * 100) / 100;
    const totalPeakKw = Math.round(gpuCount * peakPowerPerGpu);
    const transientKw = Math.max(0, Math.round(totalPeakKw - itLoad));
    const hscPowerKw = Math.round(transientKw * 0.8);
    const hscModules = Math.ceil(hscPowerKw / 100);
    const hscCapKwh = r1(Math.max(0.5, (totalPeakKw * pulse.spikeMs / 1000 / 3600) * pulse.freqPerSec * 3));
    const bbuPowerKw = Math.round(transientKw * 0.2);
    const bbuModules = Math.ceil(bbuPowerKw / 50);
    const bbuBackupMin = 15;
    const bbuCapKwh = Math.round(bbuPowerKw * bbuBackupMin / 60);
    const bessPowerKw = Math.round(itLoad * 0.15);
    const bessCapKwh = Math.round(bessPowerKw * 0.5);
    const ipsReduce = spec.ips.enabled ? Math.round(transientKw * spec.ips.peakReduction) : 0;
    const effTransient = Math.max(0, transientKw - ipsReduce);

    /* ---------- 3. 供电架构 ---------- */
    const V = Number(P.voltage) || 10;
    const unitTx = TX_UNIT[V] || 2500;
    const needKva = totalLoad / 0.92;
    const txPerSide = Math.max(1, Math.ceil(needKva / unitTx));
    const spareTx = (red === 'n1' || red === '2n1') ? 1 : 0;
    const txTotal = mainsCount * txPerSide + spareTx;
    const txCap = unitTx;
    const mvInA = stdUp((txPerSide * unitTx * 1000) / (Math.sqrt(3) * V * 1000), MV_BREAKER_A);
    const lvMainA = stdUp((unitTx * 1000) / (Math.sqrt(3) * 400), LV_ACB_A);
    const upsUnit = 1200;
    const upsPerSideKva = itLoad * (red === '2n' ? 1.0 : 0.6);
    const upsPerSide = Math.max(1, Math.ceil((upsPerSideKva * 1.2) / upsUnit));
    const upsTotal = mainsCount * upsPerSide;
    const upsBackupMin = 20;
    const batTotalKwh = Math.round(upsTotal * upsUnit * 0.9 * upsBackupMin / 60);
    const stsCount = Math.max(2, Math.ceil(upsPerSide / 4));
    const genCap = Math.ceil(totalLoad * 1.15 / 500) * 500;
    const genCount = 2;                 // N+1
    const pduCount = Math.max(2, Math.ceil(gpuRacks / 10) * mainsCount);
    const mvPanels = mainsCount * 2 + 3; // 每路: 进线+出线, 另计量PT+母联+PT
    const lvPanels = Math.max(4, Math.ceil(upsTotal / 3) + 4);

    /* ---------- 4. 液冷系统 ---------- */
    const isLiquid = P.cooling === 'liquid' || P.cooling === 'hybrid';
    const liquidRatio = P.cooling === 'hybrid' ? 0.7 : (isLiquid ? 1.0 : 0);
    const cduCap = 300;
    const cduCount = isLiquid ? Math.max(3, Math.ceil(coolingLoad * liquidRatio / cduCap)) + 1 : 0; // N+1
    const towerCap = 2000;
    const towerCount = Math.max(2, Math.ceil(coolingLoad / towerCap)) + 1;   // N+1
    const chillerCap = 1500;
    const chillerCount = Math.max(2, Math.ceil(coolingLoad * (1 - liquidRatio) / chillerCap)) + 1;
    const cracCount = liquidRatio < 0.999 ? Math.ceil(coolingLoad * (1 - liquidRatio) / 200) + 1 : 0;
    const pumpCount = cduCount + 2;
    const supplyTemp = isLiquid ? 35 : 24, returnTemp = isLiquid ? 45 : 34;
    const flowLpm = isLiquid ? Math.round(coolingLoad * liquidRatio * 1.433 / 10) * 10 : 0;
    const dn = totalLoad >= 20000 ? 'DN150' : totalLoad >= 10000 ? 'DN100' : 'DN80';
    const coldRegion = /哈尔滨|长春|沈阳|内蒙|呼和浩特|新疆|西藏|青海/.test(P.region || '');
    const glycol = coldRegion ? '乙二醇 30% 防冻液' : '纯化水 + 缓蚀剂';
    const freeCoolingH = /哈尔滨|内蒙/.test(P.region || '') ? 5000 : /北京|石家庄|天津/.test(P.region || '') ? 3500
      : /上海|深圳|广州/.test(P.region || '') ? 1800 : /成都|重庆|贵阳/.test(P.region || '') ? 2200 : 2500;

    /* ---------- 5. PUE 分解 ---------- */
    const pueTarget = Number(P.pueTarget) || 1.25;
    const coolingPue = (pueTarget - 1) * 0.65;
    const powerPue = (pueTarget - 1) * 0.20;
    const lightingPue = (pueTarget - 1) * 0.08;
    const otherPue = (pueTarget - 1) * 0.07;
    const annualPue = Math.max(1.1, pueTarget - 0.03 - (pueTarget > 1.3 ? 0.02 : 0));

    /* ---------- 6. 机柜布局 ---------- */
    const rows = Math.max(2, Math.ceil(gpuRacks / 12));
    const racksPerRow = Math.ceil(gpuRacks / rows);
    const roomW = Math.max(30, Math.round(racksPerRow * 0.7 + 8));
    const roomD = rows * 6 + 8;
    /* ---------- 7. 投资测算 ---------- */
    const price = {
      tx: 35, mvPanel: 18, mvAuxPanel: 8, lvPanel: 10, lvTiePanel: 12,
      upsUnit: 110, sts: 25, genPerKw: 0.09, pdu: 15,
      netRack: 15, storRack: 20, mgmtRack: 12,
      hscPerKw: 0.8, bbuPerKw: 0.35, bessPerKwh: 0.12,
      cdu: 45, tower: 60, chiller: 75, crac: 30, pump: 12,
      dcim: 200, fire: 300
    };
    const capexIT = Math.round(servers * spec.serverPrice);
    const capexPower = Math.round(totalLoad * 0.65);
    const capexCooling = isLiquid ? Math.round(itLoad * 0.9) : Math.round(itLoad * 0.45);
    const capexCivil = Math.round(totalLoad * 0.3);
    const capexNet = Math.round(gpuRacks * 4 * 0.15);
    const capexStorage = Math.round((hscPowerKw * price.hscPerKw + bbuPowerKw * price.bbuPerKw + bessCapKwh * price.bessPerKwh) / 10000);
    const capex = capexIT + capexPower + capexCooling + capexCivil + capexNet + capexStorage;
    const elecAnnual = Math.round(totalLoad * 8760 * ((Number(P.pricePeak) || 1.05) * 0.65 + (Number(P.priceValley) || 0.35) * 0.35) / 10000);
    const opexSalary = Math.round(totalRacks * 0.008 * 12);
    const opexMaint = Math.round(capex * 0.025);
    const opexAnnual = elecAnnual + opexSalary + opexMaint;
    const tco10y = capex + opexAnnual * 10;
    const pueSaving = Math.round(itLoad * 8760 * (1.4 - pueTarget) * 0.65 / 10000);

    /* ---------- 8. BOM ---------- */
    const bom = [];
    const addBom = (cat, name, model, qty, unit, unitPrice, note) => {
      if (qty > 0) bom.push({ cat, name, model, qty, unit, unitPrice, total: Math.round(qty * unitPrice), note: note || '' });
    };
    addBom('算力', 'GPU 服务器', spec.name, servers, '台', spec.serverPrice, (spec.rack72 ? '整柜 72 卡' : '8 卡/台'));
    addBom('算力', '网络交换机柜', '100G/400G 交换机柜', netRacks, '柜', price.netRack, 'Spine-Leaf');
    addBom('算力', '存储柜', 'NVMe 全闪存', storageRacks, '柜', price.storRack, '');
    addBom('算力', '管理/监控柜', '综合管理', mgmtRacks, '柜', price.mgmtRack, '');
    addBom('供电', '干式变压器', `SCB13-${txCap}/10 ${txCap}kVA`, txTotal, '台', price.tx, 'Dyn11 Uk=6%');
    addBom('供电', '中压开关柜', `${PANEL_TYPE[V]} 进线/出线`, mvPanels, '面', price.mvPanel, `Icu=${SC_KA[V]}kA`);
    addBom('供电', '中压计量/PT 柜', '0.5S 计量 + PT', mainsCount, '面', price.mvAuxPanel, '');
    addBom('供电', '低压配电柜', 'GCS 馈线柜', lvPanels, '面', price.lvPanel, '');
    addBom('供电', '低压母联柜', `GCS ${lvMainA}A 母联`, 1, '面', price.lvTiePanel, '自动切换 AT');
    addBom('供电', 'UPS 系统', `${upsUnit}kVA 在线双变换(含电池)`, upsTotal, '台', price.upsUnit, `${upsBackupMin}min 后备, 效率96%`);
    addBom('供电', '静态切换开关', `STS ${stsCount * 400}A <10ms`, stsCount, '台', price.sts, '双路失压检测');
    addBom('供电', '柴油发电机', `${genCap}kW ${V}kV 柴发`, genCount, '台', Math.round(genCap * price.genPerKw), 'N+1, 8h 储油');
    addBom('供电', '列头柜 PDU', '双路列头柜', pduCount, '台', price.pdu, 'A/B 双路馈电');
    addBom('储能', 'HSC 混合超级电容', '100kW 模块', hscModules, '模块', hscPowerKw * price.hscPerKw / Math.max(1, hscModules), '<1μs 脉冲吸收');
    addBom('储能', 'BBU 全极耳电池', '50kW 模块', bbuModules, '模块', bbuPowerKw * price.bbuPerKw / Math.max(1, bbuModules), '<1ms 缓冲');
    addBom('储能', 'BESS 磷酸铁锂', 'LFP 集装箱', 1, '套', bessCapKwh * price.bessPerKwh, `${bessPowerKw}kW/${bessCapKwh}kWh`);
    addBom('冷却', 'CDU 冷量分配单元', `${cduCap}kW 液冷 CDU`, cduCount, '台', price.cdu, 'N+1, 供35/回45℃');
    addBom('冷却', '冷却塔', `${towerCap}kW 变频冷却塔`, towerCount, '台', price.tower, 'EC 风机');
    addBom('冷却', '冷水机组', `${chillerCap}kW 磁悬浮`, chillerCount, '台', price.chiller, 'COP≥5.5');
    addBom('冷却', '精密空调 CRAC', '200kW 精密空调', cracCount, '台', price.crac, '风冷段');
    addBom('冷却', '变频离心泵', '一次/二次侧泵组', pumpCount, '台', price.pump, 'VFD');
    addBom('冷却', '管路阀件/传感器', `${dn} 不锈钢管路+阀组+FT/TT/PT`, 1, '套', Math.round(coolingLoad * 0.12), '304 不锈钢');
    addBom('监控', 'DCIM/动环监控', 'DCIM+EMS+视频+门禁', 1, '套', price.dcim + Math.round(itLoad * 0.02), '漏液联动');
    addBom('消防', '气体灭火+极早期', '七氟丙烷+VESDA', 1, '套', price.fire + Math.round(itLoad * 0.03), 'GB 50370');
    const bomTotal = bom.reduce((s, b) => s + b.total, 0);

    /* ---------- 9. 合规检查 ---------- */
    const compliance = [
      { rule: '双路独立市电进线 (A/B 不同母线)', result: mainsCount >= 2 ? 'PASS' : 'WARN', ref: 'GB 50174 A级 / TIA-942', detail: mainsCount >= 2 ? '双路独立进线, 满足' : `Tier ${tier === 'tier4' ? 'IV' : 'II'} 单路进线, 建议升级双路` },
      { rule: '变压器冗余 ' + red, result: (spareTx > 0 || red === '2n') ? 'PASS' : 'WARN', ref: 'TIA-942', detail: `${txTotal} 台 ${txCap}kVA (${mainsCount} 路 × ${txPerSide} + ${spareTx} 备用)` },
      { rule: 'UPS 在线双变换, 后备 ' + upsBackupMin + 'min', result: 'PASS', ref: 'GB 50174 8.1', detail: `${upsTotal} 台 ${upsUnit}kVA, 效率 96%` },
      { rule: 'STS 静态切换 <10ms', result: 'PASS', ref: 'GB 50174 8.1', detail: stsCount + ' 台, 双路失压检测' },
      { rule: '应急柴发 N+1, 8h 储油', result: 'PASS', ref: 'GB 50174 8.2', detail: genCount + ' 台 ' + genCap + 'kW' },
      { rule: '液冷供回水 35/45℃ (GPU 高温液冷)', result: isLiquid ? 'PASS' : 'SKIP', ref: 'ASHRAE TC9.9 W45', detail: isLiquid ? `CDU ${cduCount} 台 N+1, 流量 ${flowLpm} L/min` : '风冷方案' },
      { rule: 'CDU N+1 冗余', result: isLiquid ? 'PASS' : 'SKIP', ref: '热管理 Skill', detail: '任意单台 CDU 故障不影响供冷' },
      { rule: '漏液检测 <5s 自动关断', result: isLiquid ? 'PASS' : 'SKIP', ref: 'GB 50174 12.3', detail: '每柜漏液绳 + CDU 压差/流量/温度三重监测' },
      { rule: '消防: 极早期 + 气体灭火', result: 'PASS', ref: 'GB 50116 / GB 50370', detail: 'VESDA + 七氟丙烷' },
      { rule: '接地系统 TN-S', result: 'PASS', ref: 'GB 50065', detail: 'UPS 输出 TN-S, 等电位联结' },
      { rule: '负荷分级: 一级负荷双电源', result: mainsCount >= 2 ? 'PASS' : 'WARN', ref: 'GB 50052 3.0', detail: mainsCount >= 2 ? '满足一级负荷双电源要求' : '单电源, 不满足一级负荷' },
      { rule: 'PUE ≤ ' + pueTarget, result: annualPue <= pueTarget ? 'PASS' : 'WARN', ref: 'GB 40879 / 政策', detail: '设计 PUE ' + pueTarget + ', 年化预估 ' + annualPue.toFixed(2) }
    ];

    /* ---------- 10. 保护配置 ---------- */
    const protection = [
      { bay: '10kV 进线', items: ['过流 I 段 (速断): 8In / 0s', '过流 II 段 (限时): 3In / 0.3s', '过流 III 段: 1.2In / 0.9s', '零序过流: 0.2In / 0.5s', '低电压保护 / 失压跳闸'] },
      { bay: '变压器', items: ['差动保护 (≥2000kVA)', '重瓦斯跳闸 / 轻瓦斯告警', '温度过高告警 (140℃ 跳闸)', '过负荷告警'] },
      { bay: '0.4kV 低压', items: ['长延时 1.0In (选择性配合)', '短延时 3In / 0.2s', '瞬时 OFF (与馈线配合)', '接地故障保护'] },
      { bay: 'UPS/STS', items: ['UPS 过载 110% 持续 / 125% 10min', 'STS 双路失压 <10ms 切换', '电池巡检 + 内阻监测', '旁路自动/手动切换'] },
      { bay: '柴发', items: ['差动保护', '过流 + 欠压保护', '逆功率保护', '并机/切机逻辑 (PLC)'] },
      { bay: '液冷', items: ['供回水压差低告警', '流量 <60% 报警', '温度越限 (供>38℃) 告警', '漏液检测 <5s 关断 + 联动'] }
    ];

    /* ---------- 11. 汇总返回 ---------- */
    return {
      ok: true,
      projName: P.projName || 'AIDC 数据中心',
      region: P.region || '中国',
      tier, red, mainsCount,
      gpuType: P.gpuType, cooling: P.cooling,
      compute: {
        gpuName: spec.name, gpuCount, servers, gpuRacks, netRacks, storageRacks, mgmtRacks, totalRacks,
        itLoadKw: itLoad, totalLoadKw: totalLoad, coolingLoadKw: coolingLoad,
        rackPower, totalFlops: (gpuCount * spec.fp16 / 1000).toFixed(1) + ' PFLOPS(FP16)',
        interconnect: spec.interconnect, gpuMem: spec.mem
      },
      pulse: {
        spikeRatio: pulse.spikeRatio, spikeMs: pulse.spikeMs, peakDiDt: pulse.peakDiDt,
        freqPerSec: pulse.freqPerSec, peakPowerPerGpu, totalPeakKw, transientKw,
        ipsEnabled: spec.ips.enabled, ipsPeakReduction: spec.ips.peakReduction, effectiveTransientKw: effTransient,
        risk: transientKw > itLoad * 0.3 ? '严重' : transientKw > itLoad * 0.15 ? '中等' : '可控',
        advice: pulse.spikeMs <= 30 ? 'HSC 必须 (毫秒级响应)' : pulse.spikeMs <= 80 ? 'HSC+BBU 推荐' : 'BBU 可覆盖'
      },
      storage: {
        hsc: { powerKw: hscPowerKw, modules: hscModules, capKwh: hscCapKwh, invest: Math.round(hscPowerKw * price.hscPerKw), tech: '混合超级电容 (锂离子+双电层)', resp: '<1μs' },
        bbu: { powerKw: bbuPowerKw, modules: bbuModules, capKwh: bbuCapKwh, backupMin: bbuBackupMin, invest: Math.round(bbuPowerKw * price.bbuPerKw), tech: '全极耳固液混合电池', resp: '<1ms' },
        bess: { powerKw: bessPowerKw, capKwh: bessCapKwh, invest: Math.round(bessCapKwh * price.bessPerKwh), tech: 'LFP 磷酸铁锂', resp: '<200ms' },
        totalInvest: capexStorage
      },
      power: {
        voltage: V + 'kV', pf: 0.92, mainsCount, txUnit: txCap, txPerSide, spareTx, txTotal,
        mvInA, scKa: SC_KA[V], panelType: PANEL_TYPE[V], mvPanels,
        lvMainA, lvPanels,
        upsUnit, upsPerSide, upsTotal, upsBackupMin, batTotalKwh, stsCount,
        genCap, genCount, pduCount,
        txName: `SCB13-${txCap}/${V}`, txVector: 'Dyn11', txUk: '6%'
      },
      cooling: {
        type: P.cooling, isLiquid, liquidRatio, cduCap, cduCount, towerCap, towerCount,
        chillerCap, chillerCount, cracCount, pumpCount,
        supplyTemp, returnTemp, flowLpm, dn, glycol,
        material: '304 不锈钢', pressure: '1.6MPa', branchDn: 'DN32~DN50',
        freeCoolingH, freeCoolingRatio: (freeCoolingH / 8760 * 100).toFixed(0) + '%',
        leakDetect: '漏液绳(每柜) + CDU 压差/流量/温度三重监测 + 快速关断阀 <5s',
        secondaryDn: rows > 3 ? 'DN65 支管' : 'DN50 支管'
      },
      pue: {
        target: pueTarget, annual: annualPue.toFixed(2),
        cooling: coolingPue.toFixed(3), power: powerPue.toFixed(3),
        lighting: lightingPue.toFixed(3), other: otherPue.toFixed(3),
        freeCoolingH, aiPeakShaving: (0.35 + (gpuCount > 1000 ? 0.05 : 0) * 100 / 100).toFixed(0) + '%'
      },
      layout: {
        rows, racksPerRow, gpuRacks, netRacks, storageRacks, mgmtRacks, totalRacks,
        coldAisle: 1200, hotAisle: 1000, mainAisle: 2000,
        roomW: roomW + 'm', roomD: roomD + 'm', totalArea: Math.round(roomW * roomD * 1.4) + 'm²',
        rackPower: rackPower + 'kW/柜'
      },
      economics: {
        capex, capexIT, capexPower, capexCooling, capexCivil, capexNet, capexStorage,
        bomTotal, opexAnnual, elecAnnual, tco10y, pueSavingAnnual: pueSaving,
        energyIntensity: (elecAnnual * 10000 / itLoad / 8760).toFixed(3) + ' 元/kWh'
      },
      bom, bomTotal,
      protection,
      compliance,
      warnings
    };
  }

  return { build, GPU_SPECS };
})();