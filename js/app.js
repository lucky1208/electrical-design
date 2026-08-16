/* ============================================================
 * AIDC 方案设计平台 — 应用交互层
 * 表单 → 确定性引擎 → 4 张 IEC 图纸 + 参数 + BOM + 合规检查
 * ============================================================ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { R: null, tab: 'drawings', subTab: 'arch' };

  /* ---------- 表单读取 ---------- */
  function getParams() {
    return {
      projName: $('f-proj').value.trim() || 'AIDC 数据中心',
      region: $('f-region').value,
      tier: $('f-tier').value,
      gpuType: $('f-gpu').value,
      gpuCount: parseInt($('f-gpu-count').value, 10) || 0,
      itLoad: parseInt($('f-itload').value, 10) || 0,
      voltage: $('f-voltage').value,
      redundancy: $('f-red').value,
      cooling: $('f-cooling').value,
      pueTarget: parseFloat($('f-pue').value) || 1.25,
      rackPower: parseInt($('f-rack').value, 10) || 40,
      pricePeak: parseFloat($('f-peak').value) || 1.05,
      priceValley: parseFloat($('f-valley').value) || 0.35,
      pref: $('f-pref').value
    };
  }

  /* ---------- 步骤日志 ---------- */
  function logStep(msg, type) {
    const el = $('step-log');
    if (!el) return;
    const d = document.createElement('div');
    d.className = 'step ' + (type || '');
    d.textContent = msg;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


  /* ---------- AI 模型调用 (自然语言 → 参数 JSON) ---------- */
  const AI_ENDPOINTS = {
    kimi: { url: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k' },
    deepseek: { url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
    glm: { url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' }
  };
  const AIDC_SYSTEM_PROMPT = `你是储能与微电网电气设计专家系统的需求解析引擎。从用户的自然语言需求中提取结构化工程参数。
规则：
1. 只输出一个合法的 JSON 对象，不输出任何其他文字
2. 所有数值必须是数字类型，不能是字符串
3. 无法确定的字段填 null，不能猜测或编造
4. 容量单位统一为 kWh，功率统一为 kW，电压统一为字符串如 "10kV"
5. 遇到"度"="kWh"，"千瓦"="kW"，"万千瓦"×10000="kW"
输出 JSON 字段：project_type, scenario, capacity_kwh, power_kw, duration_h, voltage_level, grid_mode, pv_kw, diesel_kw, load_kw, load_type, phases, standard, tier, redundancy, ups_topology, special_requirements`;

  async function callAI(model, apiKey, userText) {
    const ep = AI_ENDPOINTS[model];
    if (!ep) throw new Error('未知模型：' + model);
    const resp = await fetch(ep.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: ep.model,
        messages: [
          { role: 'system', content: AIDC_SYSTEM_PROMPT },
          { role: 'user', content: userText }
        ],
        temperature: 0.3
      })
    });
    if (!resp.ok) throw new Error('API 调用失败：' + resp.status + ' ' + resp.statusText);
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';
    // JSON 提取 + 修复
    const m = content.match(/```json([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('AI 未返回 JSON');
    try { return JSON.parse(m[1] || m[0]); }
    catch (e) {
      const fixed = (m[1] || m[0]).replace(/,\s*([}\]])/g, '$1');
      try { return JSON.parse(fixed); }
      catch (e2) { throw new Error('JSON 解析失败：' + e2.message); }
    }
  }

  /* ---------- 从 AI 结果回填表单 ---------- */
  function fillFormFromAI(ai) {
    if (ai.project_type === 'aidc') $('f-tier').value = ai.tier === 'IV' ? 'tier4' : ai.tier === 'II' ? 'tier2' : 'tier3';
    if (ai.redundancy) $('f-red').value = ai.redundancy.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ai.voltage_level) {
      const v = String(ai.voltage_level).replace('kV', '');
      if (['10', '35', '110'].includes(v)) $('f-voltage').value = v;
    }
    if (ai.power_kw) $('f-itload').value = ai.power_kw;
    if (ai.capacity_kwh) $('f-gpu-count').value = Math.round(ai.capacity_kwh / 15); // 粗略估算
    logStep('AI 解析完成：IT 负荷 ' + (ai.power_kw || '未知') + ' kW, 电压 ' + (ai.voltage_level || '未知'), 'ok');
  }

  /* ---------- 本地规则 NL 解析 (无 LLM 兜底) ---------- */
  function parseNLLocal(t) {
    const o = {};
    const num = (re) => { const m = t.match(re); return m ? parseFloat(m[1]) : null; };
    const mw = num(/([\d.]+)\s*MW/i), kw = num(/([\d.]+)\s*(?:kW|千瓦)/i);
    if (mw) o.itLoad = Math.round(mw * 1000); else if (kw) o.itLoad = Math.round(kw);
    const kv = num(/([\d.]+)\s*kV/i); if (kv && [10, 35, 110].includes(kv)) o.voltage = String(kv);
    if (/Tier\s*IV|Tier\s*4/i.test(t)) o.tier = 'tier4'; else if (/Tier\s*II|Tier\s*2/i.test(t)) o.tier = 'tier2'; else if (/Tier/i.test(t)) o.tier = 'tier3';
    if (/2\s*\(?\s*N\s*\+?\s*1\s*\)?|2N\+1/.test(t)) o.red = '2n1'; else if (/2N/.test(t)) o.red = '2n'; else if (/N\+1/.test(t)) o.red = 'n1';
    if (/风冷/.test(t)) o.cooling = 'air'; else if (/混合/.test(t)) o.cooling = 'hybrid'; else if (/液冷/.test(t)) o.cooling = 'liquid';
    const pue = num(/PUE\s*[<≤]?\s*([\d.]+)/i); if (pue) o.pueTarget = pue;
    if (/预算|成本|便宜|国产/.test(t)) o.pref = 'cost'; else if (/可靠|稳定|高可用/.test(t)) o.pref = 'reliability';
    return o;
  }
  function applyLocal(o) {
    if (o.itLoad) $('f-itload').value = o.itLoad; if (o.voltage) $('f-voltage').value = o.voltage;
    if (o.tier) $('f-tier').value = o.tier; if (o.red) $('f-red').value = o.red;
    if (o.cooling) $('f-cooling').value = o.cooling; if (o.pueTarget) $('f-pue').value = o.pueTarget;
    if (o.pref) $('f-pref').value = o.pref;
  }

  /* ---------- LLM 自由文本建议 (选型顾问) ---------- */
  async function callAIText(model, key, user) {
    const ep = AI_ENDPOINTS[model]; if (!ep) throw new Error('未知模型');
    const resp = await fetch(ep.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: ep.model, messages: [{ role: 'system', content: '你是储能/数据中心电气选型顾问, 用2-3句中文给出选型理由与风险提示。' }, { role: 'user', content: user }], temperature: 0.4 }) });
    if (!resp.ok) throw new Error('API ' + resp.status);
    const d = await resp.json(); return d.choices?.[0]?.message?.content || '';
  }

  /* ---------- 选型比较渲染 ---------- */
  function renderSelection() {
    const R = state.R, el = $('selection'); if (!el) return;
    if (!R.selection) { el.innerHTML = '<div class="bom-note">选型引擎未加载</div>'; return; }
    const prefName = { cost: '成本优先', balance: '均衡(性价比)', reliability: '可靠性优先' }[R.pref] || R.pref;
    let html = '<div class="bom-note">选型偏好: <b style="color:#58a6ff">' + prefName + '</b> · 评分=价格/效率/可靠/交期加权 (确定性, 可复现) · 绿色行为推荐</div>';
    for (const key of Object.keys(R.selection)) {
      const sel = R.selection[key]; if (!sel) continue;
      html += '<div class="panel" style="margin-bottom:14px"><div class="panel-title" style="color:#58a6ff">' + sel.name +
        ' <span style="color:#3fb950">→ 推荐: ' + sel.recommended.vendor + ' ' + sel.recommended.model + ' (评分' + sel.recommended.score + ')</span></div>' +
        '<table class="bom-table"><tr><th>厂商</th><th>型号</th><th>单价</th><th>效率%</th><th>可靠</th><th>交期周</th><th>评分</th></tr>';
      sel.options.forEach((o) => {
        const rec = o.vendor === sel.recommended.vendor;
        html += '<tr' + (rec ? ' style="background:#12301a"' : '') + '><td>' + o.vendor + '</td><td>' + o.model + '</td><td class="num">' + o.price + (o.per || '万') + '</td><td class="num">' + o.eff + '</td><td class="num">' + o.rel + '</td><td class="num">' + o.del + '</td><td class="num" style="color:#3fb950;font-weight:700">' + o.score + '</td></tr>';
      });
      html += '</table></div>';
    }
    html += '<div id="ai-advice" class="panel"></div>';
    el.innerHTML = html;
    advisor();
  }
  async function advisor() {
    const box = $('ai-advice'); if (!box) return;
    const model = $('f-model').value, key = $('f-apikey').value.trim();
    if (model === 'local' || !key) { box.innerHTML = '<div class="panel-title">AI 选型建议</div><div style="font-size:11px;color:var(--text2)">配置 API Key 并选择模型后, LLM 将结合您的自然语言偏好给出定性选型理由 (不改变确定性计算)。</div>'; return; }
    const R = state.R;
    const prompt = '用户偏好: ' + ($('f-nl').value || $('f-pref').value) + '。各设备推荐: ' + Object.keys(R.selection).map((k) => R.selection[k].name + '=' + R.selection[k].recommended.vendor).join(', ') + '。请给出选型理由与风险提示。';
    try { const txt = await callAIText(model, key, prompt); box.innerHTML = '<div class="panel-title">AI 选型建议</div><div style="font-size:11.5px;line-height:1.7;color:var(--text)">' + txt + '</div>'; }
    catch (e) { box.innerHTML = '<div class="panel-title">AI 选型建议</div><div style="font-size:11px;color:#e3b341">' + e.message + '</div>'; }
  }
  /* ---------- 生成方案 ---------- */
  window.generateSolution = async function () {
    const log = $('step-log');
    log.innerHTML = ''; log.style.display = 'block';
    const model = $('f-model').value, apiKey = $('f-apikey').value.trim();
    const nl = $('f-nl').value.trim();
    if (nl) {
      if (model !== 'local' && apiKey) {
        try { logStep('LLM 解析自然语言需求...', 'running'); const ai = await callAI(model, apiKey, nl); fillFormFromAI(ai); }
        catch (e) { logStep('LLM 失败: ' + e.message + ', 用本地规则', 'warn'); applyLocal(parseNLLocal(nl)); }
      } else { logStep('本地规则解析自然语言需求', 'running'); applyLocal(parseNLLocal(nl)); }
    }
    const P = getParams();
    if (!P.gpuCount && !P.itLoad) { alert('请至少填写 GPU 数量或 IT 负荷'); return; }
    const steps = [
      '[1/7] 解析输入参数 — 等级/GPU/负荷/冗余/散热',
      '[2/7] 算力规划 — 服务器/机柜/互联拓扑',
      '[3/7] 供电架构 — 变压器/UPS/柴发/STS/母线选型',
      '[4/7] 三层储能 — HSC/BBU/BESS 脉冲响应计算',
      '[5/7] 液冷系统 — CDU/冷却塔/管路/漏液检测',
      '[6/7] 保护整定 + 合规检查 — GB 50174/50052',
      '[7/7] 生成 4 张 IEC 标准图纸 + BOM'
    ];
    for (let i = 0; i < steps.length; i++) {
      logStep(steps[i], 'running');
      await sleep(220);
      log.lastChild.className = 'step ok';
    }
    state.R = window.AIDC_ENGINE.build(P);
    logStep('✅ 方案生成完成 (确定性引擎, 无 LLM 依赖)', 'ok');
    renderSummary();
    renderDrawings();
    renderParams();
    renderBom();
    renderCompliance();
    renderSelection();
    $('empty-hint').style.display = 'none';
    $('result-area').style.display = 'block';
    switchTab('drawings');
    $('result-area').scrollIntoView({ behavior: 'smooth' });
  };

  /* ---------- 顶部概览卡片 ---------- */
  function renderSummary() {
    const R = state.R, Cx = R.compute, P = R.power;
    const cards = [
      ['IT 负荷', Cx.itLoadKw.toLocaleString() + ' kW', '#58a6ff'],
      ['GPU 机柜', Cx.gpuRacks + ' 柜 (' + Cx.totalRacks + ' 总柜)', '#3fb950'],
      ['变压器', P.txTotal + ' × ' + P.txUnit + 'kVA', '#e3b341'],
      ['UPS', P.upsTotal + ' × ' + P.upsUnit + 'kVA (' + P.upsBackupMin + 'min)', '#a78bfa'],
      ['CDU 液冷', R.cooling.cduCount + ' 台 N+1 (供35/回45℃)', '#4ac8ff'],
      ['估算投资', '¥' + (R.economics.capex / 10000).toFixed(1) + ' 亿', '#f85149']
    ];
    $('summary-cards').innerHTML = cards.map(c =>
      `<div class="kpi"><div class="kpi-label">${c[0]}</div><div class="kpi-value" style="color:${c[2]}">${c[1]}</div></div>`).join('');
    const warns = R.warnings.length ? '<div class="warn-box">⚠ ' + R.warnings.join('；') + '</div>' : '';
    $('warn-box').innerHTML = warns;
  }

  /* ---------- 图纸标签 ---------- */
  function renderDrawings() {
    const R = state.R;
    $('d-arch').innerHTML = window.drawArch(R);
    $('d-wiring').innerHTML = window.drawWiring(R);
    $('d-dual').innerHTML = window.drawDual(R);
    $('d-cooling').innerHTML = window.drawCooling(R);
    $('d-thermal').innerHTML = window.drawThermal(R);
    if (window.ASSET) $('d-assets').innerHTML = window.ASSET.preview();
    showSubTab(state.subTab);
  }

  window.showSubTab = function (id) {
    state.subTab = id;
    ['arch', 'wiring', 'dual', 'cooling', 'thermal', 'assets'].forEach(k => {
      $('d-' + k).style.display = k === id ? 'block' : 'none';
      $('sub-' + k).classList.toggle('active', k === id);
    });
  };

  window.downloadCurrentSvg = function () {
    const map = { arch: 'AIDC系统架构图', wiring: 'AIDC电气一次接线图', dual: 'AIDC双路供电拓扑图', cooling: 'AIDC液冷管路图', thermal: '液冷热管理方案图' };
    const svg = $('d-' + state.subTab).innerHTML;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = map[state.subTab] + '.svg';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  window.toggleAssetMode = function () {
    if (!window.ASSET) return;
    const m = window.ASSET.getMode() === 'image' ? 'vector' : 'image';
    window.ASSET.setMode(m);
    if (state.R) { $('d-thermal').innerHTML = window.drawThermal(state.R); }
    showSubTab('thermal');
  };
  window.downloadJson = function () {
    const blob = new Blob([JSON.stringify(state.R, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aidc-solution-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ---------- 参数表 ---------- */
  function renderParams() {
    const R = state.R, P = R.power, Cl = R.cooling, St = R.storage;
    const kv = (k, v) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`;
    $('params').innerHTML = `
    <div class="param-grid">
      <div class="panel">
        <div class="panel-title" style="color:#58a6ff">⚡ 供电架构</div>
        <table>${[
          kv('接入方式', P.voltage + ' ' + P.mainsCount + ' 路独立进线 (A/B)'),
          kv('冗余等级', R.red + (R.tier === 'tier4' ? ' · 无单点故障' : '')),
          kv('中压开关柜', P.panelType + ' 共 ' + P.mvPanels + ' 面, Icu=' + P.scKa + 'kA'),
          kv('变压器', P.txTotal + ' 台 ' + P.txName + ' ' + P.txVector + ' Uk=' + P.txUk),
          kv('低压母线', '0.4kV 双母线分段, 主开关 ' + P.lvMainA + 'A ACB'),
          kv('UPS', P.upsTotal + ' 台 ' + P.upsUnit + 'kVA 在线双变换, 效率96%'),
          kv('蓄电池', P.batTotalKwh.toLocaleString() + ' kWh · ' + P.upsBackupMin + 'min 后备'),
          kv('STS', P.stsCount + ' 台静态切换 <10ms'),
          kv('应急柴发', P.genCount + ' 台 ' + P.genCap.toLocaleString() + 'kW (N+1, 8h储油)'),
          kv('标准依据', 'GB 50174-2017 / GB 50052 / TIA-942')
        ].join('')}</table>
      </div>
      <div class="panel">
        <div class="panel-title" style="color:#4ac8ff">🌡 液冷系统</div>
        <table>${[
          kv('散热方式', Cl.type === 'air' ? '风冷 (精密空调)' : Cl.type === 'hybrid' ? '液冷70%+风冷30%' : '全液冷冷板'),
          kv('CDU', Cl.cduCount + ' 台 × ' + Cl.cduCap + 'kW (N+1)'),
          kv('冷源', '冷却塔 ' + Cl.towerCount + ' 台 + 冷水机 ' + Cl.chillerCount + ' 台'),
          kv('供/回水温度', '供水 ' + Cl.supplyTemp + '℃ / 回水 ' + Cl.returnTemp + '℃'),
          kv('主管/流量', Cl.dn + ' · ' + Cl.flowLpm + ' L/min'),
          kv('支管', Cl.branchDn + ' · 冷板 5~8L/min/模组'),
          kv('材质/压力', Cl.material + ' · ' + Cl.pressure),
          kv('冷却液', Cl.glycol),
          kv('自然冷却', Cl.freeCoolingH + 'h/年 (' + Cl.freeCoolingRatio + ')'),
          kv('漏液保护', '漏液绳+三重监测, <5s 关断'),
          kv('标准依据', 'ASHRAE TC9.9 · GB/T 4728')
        ].join('')}</table>
      </div>
      <div class="panel">
        <div class="panel-title" style="color:#e3b341">🔋 三层储能 (HSC→BBU→BESS)</div>
        <table>${[
          kv('HSC 混合超级电容', St.hsc.powerKw + 'kW/' + St.hsc.capKwh + 'kWh · ' + St.hsc.modules + ' 模块 · ' + St.hsc.resp),
          kv('BBU 全极耳电池', St.bbu.powerKw + 'kW/' + St.bbu.capKwh + 'kWh · ' + St.bbu.modules + ' 模块 · ' + St.bbu.resp),
          kv('BESS 磷酸铁锂', St.bess.powerKw + 'kW/' + St.bess.capKwh + 'kWh · ' + St.bess.resp),
          kv('GPU 脉冲峰值', R.pulse.totalPeakKw.toLocaleString() + ' kW (瞬态 ' + R.pulse.transientKw.toLocaleString() + ' kW)'),
          kv('IPS 功率平滑', R.pulse.ipsEnabled ? '支持 (-' + Math.round(R.pulse.ipsPeakReduction * 100) + '%)' : '不支持'),
          kv('脉冲风险', R.pulse.risk + ' → ' + R.pulse.advice)
        ].join('')}</table>
      </div>
      <div class="panel">
        <div class="panel-title" style="color:#f85149">🛡 保护配置</div>
        ${R.protection.map(p =>
          `<div class="prot-group"><b>${p.bay}</b><ul>${p.items.map(i => `<li>${i}</li>`).join('')}</ul></div>`).join('')}
      </div>
    </div>`;
  }

  /* ---------- BOM ---------- */
  function renderBom() {
    const R = state.R;
    const fmt = (n) => n >= 10000 ? (n / 10000).toFixed(1) + ' 亿' : n.toLocaleString() + ' 万';
    let html = `<div class="bom-note">设备清单估算总价: <b style="color:#f85149">¥${fmt(R.bomTotal)}</b> (含税参考价, 实际以询价为准)</div>
    <table class="bom-table"><tr><th>类别</th><th>设备</th><th>型号规格</th><th>数量</th><th>单位</th><th>单价(万元)</th><th>合计(万元)</th><th>备注</th></tr>`;
    R.bom.forEach(b => {
      html += `<tr><td>${b.cat}</td><td>${b.name}</td><td>${b.model}</td><td class="num">${b.qty}</td><td>${b.unit}</td>
        <td class="num">${b.unitPrice.toLocaleString()}</td><td class="num">${b.total.toLocaleString()}</td><td>${b.note}</td></tr>`;
    });
    html += `<tr class="sum"><td colspan="6">合计</td><td class="num">${R.bomTotal.toLocaleString()}</td><td></td></tr></table>`;
    $('bom').innerHTML = html;
  }

  /* ---------- 合规检查 ---------- */
  function renderCompliance() {
    const R = state.R;
    $('compliance').innerHTML = R.compliance.map(c => {
      const icon = c.result === 'PASS' ? '✅' : c.result === 'WARN' ? '⚠️' : '➖';
      const color = c.result === 'PASS' ? '#3fb950' : c.result === 'WARN' ? '#e3b341' : '#8b949e';
      return `<div class="comp-row"><span class="comp-icon" style="color:${color}">${icon}</span>
        <div><div class="comp-rule">${c.rule}</div><div class="comp-detail">${c.detail}</div></div>
        <div class="comp-ref">${c.ref}</div></div>`;
    }).join('');
  }

  /* ---------- 标签切换 ---------- */
  window.switchTab = function (id) {
    state.tab = id;
    ['drawings', 'params', 'bom', 'compliance', 'selection'].forEach(k => {
      $('tab-' + k).style.display = k === id ? 'block' : 'none';
      $('tbtn-' + k).classList.toggle('active', k === id);
    });
  };

  /* ---------- 初始化 ---------- */
  window.addEventListener('DOMContentLoaded', () => {
    /* GPU 数量变化时估算 IT 负荷 */
    $('f-gpu').addEventListener('change', () => {
      const spec = window.AIDC_ENGINE.GPU_SPECS[$('f-gpu').value];
      if (spec && !$('f-itload').value) {
        const n = parseInt($('f-gpu-count').value, 10) || 0;
        if (spec.rack72) $('f-itload').placeholder = '约 ' + Math.ceil(n / 72) * spec.rackPower + ' kW';
        else $('f-itload').placeholder = '约 ' + Math.ceil(Math.ceil(n / 8) * spec.rackPower) + ' kW';
      }
    });
    $('f-gpu').dispatchEvent(new Event('change'));
  });
})();