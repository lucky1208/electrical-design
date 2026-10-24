const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = require('../evse-source.js');

test('source registry seeds standards, datasheets, sites and assumptions', () => {
  source.reset();
  const s = source.stats();
  assert.equal(s.sources > 30, true);
  assert.equal(s.requirements, 11);
  assert.equal(s.verifiedSources, 0);
  assert.equal(s.assumptionSources > 0, true);
  assert.equal(s.byType.standard > 10, true);
  assert.equal(s.byType.datasheet > 3, true);
  assert.equal(s.byType.site, 1);
  assert.equal(s.requirementsByStatus.open > 0, true);
  assert.equal(s.openRequirements.length > 0, true);
});

test('requirement trace resolves source records', () => {
  source.reset();
  const t = source.trace('STD-IEC-60909');
  assert.ok(t);
  assert.equal(t.item.id, 'STD-IEC-60909');
  assert.equal(t.requirements.some(r => r.id === 'REQ-SC-001'), true);
  const list = source.requirementList();
  const sc = list.find(r => r.id === 'REQ-SC-001');
  assert.ok(sc.sources.some(x => x.id === 'STD-IEC-60909'));
});

test('import pack adds and updates sources and requirements', () => {
  source.reset();
  const before = source.stats();
  const pack = {
    sources: [
      { id: 'DS-TEST-001', type: 'datasheet', title: '测试断路器 datasheet', status: 'ingested', evidenceLevel: 'datasheet', publisher: 'TEST' },
      { id: 'SITE-TEST-001', type: 'site', title: '测试站原始资料', status: 'pending', evidenceLevel: 'none' }
    ],
    requirements: [
      { id: 'REQ-TEST-999', title: '测试要求', sourceIds: ['DS-TEST-001'], status: 'partial' }
    ]
  };
  const r = source.importPack(pack);
  assert.equal(r.added, 3);
  assert.equal(source.stats().sources, before.sources + 2);
  const updated = source.importPack({ sources: [{ id: 'DS-TEST-001', type: 'datasheet', title: '测试断路器 datasheet v2', status: 'verified' }] });
  assert.equal(updated.updated, 1);
  const s = source.byId('DS-TEST-001');
  assert.equal(s.status, 'verified');
  assert.match(s.title, /v2/);
});

test('export pack is round-trippable and hash is deterministic', () => {
  source.reset();
  const pack = source.exportPack();
  assert.equal(pack.schema, 'evse-source-pack/v1');
  assert.equal(Array.isArray(pack.sources), true);
  assert.equal(Array.isArray(pack.requirements), true);
  const h1 = source.hash(pack.sources);
  const h2 = source.hash(pack.sources);
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{8}$/);
});

test('validation rejects unknown type and duplicate ids', () => {
  const bad = source.validatePack({ sources: [{ id: 'X', type: 'nope', title: 'x' }] });
  assert.equal(bad.ok, false);
  const dup = source.validatePack({ sources: [{ id: 'X', type: 'standard', title: 'a' }, { id: 'X', type: 'standard', title: 'b' }] });
  assert.equal(dup.ok, false);
});

test('example source pack is valid and site data is exposed', () => {
  source.reset();
  const file = path.join(__dirname, '..', 'sources', 'source-pack.example.json');
  const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
  const v = source.validatePack(pack);
  assert.equal(v.ok, true);
  const r = source.importPack(pack);
  assert.ok(r.added >= 4);
  assert.ok(source.byId('SITE-DEMO-001'));
  assert.equal(source.byId('REQ-PILOT-001').status, 'open');
  const site = source.siteData();
  assert.equal(site.__sourceIds.includes('SITE-DEMO-001'), false);
  assert.equal(site.transformerKva, undefined);
  source.importPack({ sources: [{ id: 'SITE-TEST-002', type: 'site', title: '测试站点数据', status: 'ingested', data: { transformerKva: 1250, gridIkKa: 25 } }] });
  const site2 = source.siteData();
  assert.equal(site2.__sourceIds.includes('SITE-TEST-002'), true);
  assert.equal(site2.transformerKva, 1250);
  assert.equal(site2.gridIkKa, 25);
});