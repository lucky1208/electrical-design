const test = require('node:test');
const assert = require('node:assert/strict');
global.window = global;
require('../evse-manual-kb.js');
require('../evse-bom.js');
require('../evse-ai.js');
const bom = global.window.EVSE_BOM;
const ai = global.window.EVSE_AI;
assert.ok(bom && ai);

test('document URL validation rejects unsafe and aggregator links', () => {
  assert.equal(ai.validateDocUrl('javascript:alert(1)'), '');
  assert.equal(ai.validateDocUrl('data:text/html,<script>x</script>'), '');
  assert.equal(ai.validateDocUrl('https://www.google.com/search?q=ABB+MCCB'), '');
  assert.equal(ai.validateDocUrl('https://www.baidu.com/s?wd=ABB'), '');
  assert.equal(ai.validateDocUrl('https://wenku.baidu.com/view/123'), '');
  assert.equal(ai.validateDocUrl('https://example.com/manual.pdf'), 'https://example.com/manual.pdf');
  assert.equal(ai.validateDocUrl('https://library.abb.com/'), 'https://library.abb.com/');
});

test('manual KB gives a real official URL for MCCB rows', () => {
  const row = { cat: '断路器 MCCB/MCB', name: '进线塑壳断路器', vendors: ['ABB'] };
  const dl = bom.docLink(row);
  assert.equal(dl.kind, 'oem');
  assert.match(dl.url, /^https:\/\//);
  assert.match(dl.url, /abb\.com/);
  const label = bom.docLabel(Object.assign({}, row, { doc: dl.url, docKind: dl.kind, docVendor: dl.vendor }));
  assert.match(label.text, /手册|文档/);
});

test('AI document overrides reach both panel and drawing label', () => {
  bom.clearDocOverrides();
  const row = { cat: '断路器 MCCB/MCB', name: '进线塑壳断路器', vendors: ['ABB'] };
  const key = bom.docKey(row);
  const n = bom.setDocOverrides({ [key]: { url: 'https://library.abb.com/search?q=NSX', title: 'ABB NSX 手册', vendor: 'ABB', conf: 'med', note: 'AI 搜索结果' } });
  assert.equal(n, 1);
  const dl = bom.docLink(row);
  assert.equal(dl.kind, 'ai');
  assert.equal(dl.url, 'https://library.abb.com/search?q=NSX');
  const label = bom.docLabel({ cat: row.cat, name: row.name, doc: dl.url, docKind: dl.kind });
  assert.equal(label.ai, true);
  assert.match(label.text, /AI/);
  bom.clearDocOverrides();
  assert.equal(bom.docLink(row).kind, 'oem');
});
test('AI document recommendation validates and applies official URLs', async () => {
  global.localStorage = { _: {}, getItem: function (k) { return this._[k] || null; }, setItem: function (k, v) { this._[k] = String(v); }, removeItem: function (k) { delete this._[k]; } };
  const originalFetch = global.fetch;
  ai.cfg({ url: 'https://example.com/v1', key: 'test-key', model: 'test-model', searchMode: 'off', searchKey: '' });
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ rows: [
      { i: 0, url: 'https://library.abb.com/search?q=NSX', title: 'ABB NSX', vendor: 'ABB', conf: 'med', reason: 'official' },
      { i: 1, url: 'https://www.google.com/search?q=x', title: 'bad', vendor: 'x', conf: 'high', reason: 'bad' }
    ] }) } }] })
  });
  try {
    const res = await ai.recommendDocs([
      { i: 0, cat: '断路器 MCCB/MCB', name: '进线塑壳断路器', model: 'NSX', vendors: ['ABB'], params: '', qty: 1 },
      { i: 1, cat: '断路器 MCCB/MCB', name: '进线塑壳断路器', model: 'NSX', vendors: ['ABB'], params: '', qty: 1 }
    ], function () {});
    assert.equal(res.rows[0].doc, 'https://library.abb.com/search?q=NSX');
    assert.equal(res.rows[0].docConf, 'med');
    assert.equal(res.rows[1].doc, '');
    assert.equal(res.meta.searchMode, 'off');
  } finally {
    global.fetch = originalFetch;
  }
});

test('MWESS cross-page flags expose labels and pair tags for jump', () => {
  require('../evse-core.js');
  require('../evse-mwess-core.js');
  const d = global.window.EVSE_MWESS.build({ family: 'mwess' });
  const xs = d.devices.filter(x => x.xref);
  assert.ok(xs.length > 0);
  assert.ok(xs.every(x => x.xrefLabel && x.xrefTag && /→\s*\d+\//.test(x.xrefLabel)));
  const first = xs[0];
  const pair = xs.filter(x => x.xrefTag === first.xrefTag);
  assert.equal(pair.length, 2);
  assert.notEqual(pair[0].sheet, pair[1].sheet);
});
