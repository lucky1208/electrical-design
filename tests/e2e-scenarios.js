const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCENARIOS = {
  evse: {
    name: 'EVSE 默认（双枪 + 储能）',
    params: {
      name: '示例站 240kW 智能充电桩',
      family: 'evse', std: 'gb', kw: 240, guns: 2, gunA: 250, moduleKw: 40,
      ess: true, essKwh: 200, essClusters: 2, coupling: 'dc'
    }
  },
  mwess: {
    name: 'MWESS 默认（7 页）',
    params: { family: 'mwess' }
  }
};

let loaded = false;
function loadModules() {
  if (loaded) return;
  global.window = global;
  ['evse-core.js', 'evse-mwess-core.js', 'evse-vendor-kb.js', 'evse-source.js', 'evse-geo.js', 'evse-labelfix.js'].forEach(function (f) {
    require(path.join(ROOT, f));
  });
  loaded = true;
}

function runScenario(key) {
  loadModules();
  const s = SCENARIOS[key];
  if (!s) throw new Error('unknown scenario: ' + key);
  const started = Date.now();
  const design = global.window.EVSE_GEO.generate(Object.assign({}, s.params));
  const ms = Date.now() - started;
  return { key: key, name: s.name, params: s.params, design: design, ms: ms };
}

function countFromItem(item, design) {
  if (item.id === 'B02') return design.nets.filter(function (n) { return n.err; }).length;
  const m = /^(\d+)/.exec(String(item.detail || ''));
  return m ? Number(m[1]) : 1;
}

function violationCounts(design) {
  const out = {};
  (design.audit.items || []).forEach(function (item) {
    if (item.ok !== false) return;
    out[item.id] = countFromItem(item, design);
  });
  return out;
}

function blockingIds(design) {
  return (design.audit.blocking || []).map(function (b) { return b.id || b; }).filter(Boolean).sort();
}

function artifact(run) {
  const d = run.design;
  const counts = {};
  (d.audit.items || []).forEach(function (item) { counts[item.level] = (counts[item.level] || 0) + 1; });
  return {
    schema: 'evse-audit-snapshot/v1',
    generatedAt: new Date().toISOString(),
    scenario: { key: run.key, name: run.name, params: run.params },
    ms: run.ms,
    devices: d.devices.length,
    nets: d.nets.length,
    wires: d.wires.length,
    unrouted: d.nets.filter(function (n) { return n.err; }).length,
    pageCount: (d.sheets || []).length,
    grade: d.audit.grade,
    status: d.audit.status,
    blocking: blockingIds(d),
    violations: violationCounts(d),
    levelCounts: counts,
    stats: d.audit.stats || {},
    items: (d.audit.items || []).map(function (item) {
      return { id: item.id, cat: item.cat, title: item.title, ok: item.ok, level: item.level, detail: item.detail };
    })
  };
}

function statusMarkdown(artifacts) {
  const lines = [
    '# 当前审计基线',
    '',
    '> 本文件由 `node scripts/audit-snapshot.js` 从真实 `generate()` 审计 JSON 生成；手改无效。',
    '> 生成时间：' + new Date().toISOString() + '。这些数字是**待修复基线**，不是可交付证明。',
    '',
    '| 场景 | 页 | 器件 | 网络 | 走线 | 未布线 | 等级 | 阻断项 | 违规计数 |',
    '|---|---:|---:|---:|---:|---:|---|---|---|'
  ];
  artifacts.forEach(function (a) {
    lines.push('| ' + a.scenario.name + ' | ' + a.pageCount + ' | ' + a.devices + ' | ' + a.nets + ' | ' + a.wires + ' | ' + a.unrouted + ' | ' + a.grade + ' / ' + a.status + ' | ' + (a.blocking.join(', ') || '—') + ' | ' + Object.keys(a.violations).sort().map(function (k) { return k + '=' + a.violations[k]; }).join('；') + ' |');
  });
  lines.push('', '## 说明', '', '- `npm test` 会运行同一组场景，并断言违规计数 **不得高于** `tests/e2e-baseline.json`。', '- 修复后请运行 `node scripts/audit-snapshot.js --update-baseline` 下调基线。', '- 只有 `blocking` 为空且人工复核通过后，才能把图纸标记为可交付。', '');
  return lines.join('\n');
}

module.exports = { ROOT, SCENARIOS, loadModules, runScenario, violationCounts, blockingIds, artifact, statusMarkdown, countFromItem };