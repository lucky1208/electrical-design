/* ============================================================
 * EVSE AI 接入层 v1.0
 * ------------------------------------------------------------
 * 兼容 OpenAI /chat/completions 协议的任意服务：
 *   OpenAI · Azure OpenAI · DeepSeek · 通义千问(兼容模式) · 智谱 · Moonshot
 *   本地 Ollama / vLLM / LM Studio（填 http://ip:port/v1）
 *
 * 两个能力：
 *   1) parseParams(自然语言) → 设计参数 JSON（客户口述转结构化输入）
 *   2) enrichBOM(BOM 行)     → 型号 / 厂家 / 参数 / 手册链接 回填
 *
 * 安全边界：
 *   · Key 只存在浏览器 localStorage，不上传任何第三方（除你填的那个端点）。
 *   · AI 回填内容一律标记 `AI_SUGGESTED`，**必须人工核验**。
 *   · 型号与手册链接是大模型最容易幻觉的部分，平台在 UI 上明确标注来源。
 * ============================================================ */
window.EVSE_AI = (function () {
  'use strict';

  const LS = 'evse.ai.cfg.v1';
  const DEF = { url: 'https://api.openai.com/v1', key: '', model: 'gpt-4o-mini', search: false, temp: 0.1 };

  function cfg(next) {
    if (next) {
      const c = Object.assign({}, load(), next);
      try { localStorage.setItem(LS, JSON.stringify(c)); } catch (e) {}
      return c;
    }
    return load();
  }
  function load() {
    try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(LS) || '{}')); }
    catch (e) { return Object.assign({}, DEF); }
  }
  function ready() { const c = load(); return !!(c.url && c.key && c.model); }

  async function chat(messages, opt) {
    const c = load();
    if (!c.url || !c.key) throw new Error('未配置大模型：请填写 API 地址与 Key');
    const base = c.url.replace(/\/+$/, '');
    const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
    const body = {
      model: c.model,
      messages: messages,
      temperature: (opt && opt.temp != null) ? opt.temp : c.temp,
      max_tokens: (opt && opt.max) || 4096
    };
    if (opt && opt.json) body.response_format = { type: 'json_object' };
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, (opt && opt.timeout) || 180000);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
        body: JSON.stringify(body)
      });
    } catch (e) {
      clearTimeout(t);
      throw new Error('请求失败：' + e.message + '（检查地址是否可达 / 是否被 CORS 拦截 / Key 是否正确）');
    }
    clearTimeout(t);
    if (!res.ok) {
      let d = ''; try { d = (await res.text()).slice(0, 300); } catch (e) {}
      throw new Error('HTTP ' + res.status + ' ' + res.statusText + (d ? ' · ' + d : ''));
    }
    const j = await res.json();
    const msg = j.choices && j.choices[0] && j.choices[0].message;
    if (!msg) throw new Error('返回体无 choices，检查是否为 OpenAI 兼容协议');
    return msg.content || '';
  }

  function grabJSON(s) {
    let t = String(s).trim();
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const i = t.indexOf('{'), j = t.lastIndexOf('}');
    if (i >= 0 && j > i) t = t.slice(i, j + 1);
    return JSON.parse(t);
  }

  /* ---------- 1. 自然语言 → 设计参数 ---------- */
  const PARAM_SYS = [
    '你是充电桩电气方案工程师。把客户的自然语言描述转成严格的 JSON 设计参数。',
    '只输出 JSON，不要任何解释文字。字段与取值范围：',
    '{',
    '  "name": 字符串, 项目名称，若客户没说就根据描述起一个简洁的中文名,',
    '  "std": "gb" 表示国标 GB/T | "ccs2" 表示欧标 CCS2,',
    '  "kw": 数字, 整桩额定输出功率 kW,',
    '  "guns": 整数 1-6, 充电枪数量,',
    '  "gunA": 数字, 单枪额定电流 A（客户未说时：液冷超充按 500-600，常规按 250）,',
    '  "moduleKw": 数字, 单台功率模块档位 kW，取 20/30/40/60/80 之一,',
    '  "ess": true|false, 是否配置储能,',
    '  "essKwh": 数字, 储能容量 kWh，无储能填 0,',
    '  "essClusters": 整数 1-4, 电池簇数，无储能填 1,',
    '  "coupling": "dc" 直流耦合(双向DC/DC) | "ac" 交流耦合(PCS),',
    '  "assumptions": 字符串数组, 你替客户补的假设，每条一句中文（这项很重要，务必如实列出）',
    '}',
    '推断规则：',
    '· "超充"/"液冷"/"600A" → gunA 取 500-600，moduleKw 取 60 或 80。',
    '· "光储充"/"储能"/"削峰填谷" → ess=true；未说容量时按整桩功率的 0.8-1.0 倍(kWh)估，并写入 assumptions。',
    '· 只说"双枪 240kW" → kw=240, guns=2。',
    '· 欧洲/CCS2/CE → std="ccs2"；国内/国标/GB → std="gb"。',
    '· 客户没提的一律给合理默认值，并在 assumptions 里写明你假设了什么。'
  ].join('\n');

  async function parseParams(text) {
    const out = await chat([
      { role: 'system', content: PARAM_SYS },
      { role: 'user', content: String(text || '').slice(0, 4000) }
    ], { json: true, temp: 0.1, max: 1200 });
    const j = grabJSON(out);
    const p = {
      name: String(j.name || '未命名项目').slice(0, 60),
      std: j.std === 'ccs2' ? 'ccs2' : 'gb',
      kw: Math.max(7, Math.min(2000, +j.kw || 120)),
      guns: Math.max(1, Math.min(6, Math.round(+j.guns || 1))),
      gunA: Math.max(32, Math.min(800, +j.gunA || 250)),
      moduleKw: [20, 30, 40, 60, 80].indexOf(+j.moduleKw) >= 0 ? +j.moduleKw : 40,
      ess: !!j.ess,
      essKwh: Math.max(0, Math.min(5000, +j.essKwh || 0)),
      essClusters: Math.max(1, Math.min(4, Math.round(+j.essClusters || 1))),
      coupling: j.coupling === 'ac' ? 'ac' : 'dc'
    };
    if (p.ess && !p.essKwh) p.essKwh = Math.round(p.kw * 0.9);
    return { params: p, assumptions: Array.isArray(j.assumptions) ? j.assumptions.map(String) : [] };
  }

  /* ---------- 2. BOM 型号 / 厂家 / 手册回填 ---------- */
  const BOM_SYS = [
    '你是充电桩供应链选型工程师。给定 BOM 条目，补全型号与厂家信息。',
    '只输出 JSON：{"rows":[{"i":行号, "model":"", "vendor":"", "params":"", "note":"", "doc":"", "conf":"high|med|low"}]}',
    '要求（极其重要）：',
    '· model：给具体可询价的系列或订货号。**如果你不确定该型号真实存在，就只给到系列级并把 conf 设为 low**。',
    '· vendor：1-3 个真实存在的厂家名（中文名 + 英文名）。',
    '· params：补充该品类必须在询价单里说明的关键参数（电压/电流/分断/防护等级/通信协议等），不要重复已给的参数。',
    '· note：一句话选型要点或坑点。',
    '· doc：厂家官网选型手册页面 URL。**绝对不要编造 PDF 直链**；如果你不确定确切 URL，就给厂家官网产品页或留空字符串。',
    '· conf：你对 model 与 doc 真实性的置信度。宁可给 low，也不要编造。',
    '· 严禁虚构不存在的型号和链接。这份 BOM 会被用于真实询价，编造会造成实际损失。'
  ].join('\n');

  async function enrichBOM(rows, onProgress) {
    const BATCH = 8, out = {};
    for (let s = 0; s < rows.length; s += BATCH) {
      const slice = rows.slice(s, s + BATCH);
      const payload = slice.map(function (r, k) {
        return { i: s + k, 类别: r.cat, 设备名称: r.name, 现有型号参考: r.model,
          候选厂家: r.vendors.join(' / '), 关键参数: r.params, 数量: r.qty };
      });
      let txt;
      try {
        txt = await chat([
          { role: 'system', content: BOM_SYS },
          { role: 'user', content: JSON.stringify({ rows: payload }, null, 1) }
        ], { json: true, temp: 0.15, max: 3500 });
      } catch (e) {
        if (onProgress) onProgress(Math.min(s + BATCH, rows.length), rows.length, e.message);
        continue;
      }
      try {
        const j = grabJSON(txt);
        (j.rows || []).forEach(function (r) {
          const i = +r.i;
          if (i >= 0 && i < rows.length) {
            out[i] = {
              model: String(r.model || '').slice(0, 160),
              vendor: String(r.vendor || '').slice(0, 160),
              params: String(r.params || '').slice(0, 300),
              note: String(r.note || '').slice(0, 300),
              doc: /^https?:\/\//.test(r.doc || '') ? r.doc : '',
              conf: ['high', 'med', 'low'].indexOf(r.conf) >= 0 ? r.conf : 'low',
              src: 'AI_SUGGESTED'
            };
          }
        });
      } catch (e) {}
      if (onProgress) onProgress(Math.min(s + BATCH, rows.length), rows.length, null);
    }
    return out;
  }

  async function test() {
    const t0 = performance.now();
    const r = await chat([{ role: 'user', content: '回复两个字：连通' }], { temp: 0, max: 20, timeout: 30000 });
    return { ok: true, ms: Math.round(performance.now() - t0), reply: String(r).trim().slice(0, 40) };
  }

  return { cfg, ready, chat, parseParams, enrichBOM, test, DEF };
})();
