#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const e2e = require('../tests/e2e-scenarios.js');

const OUT_DIR = path.join(e2e.ROOT, 'out_audit');
const DOCS_DIR = path.join(e2e.ROOT, 'docs');
const BASELINE = path.join(e2e.ROOT, 'tests', 'e2e-baseline.json');
const update = process.argv.indexOf('--update-baseline') >= 0;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(DOCS_DIR, { recursive: true });

const artifacts = [];
Object.keys(e2e.SCENARIOS).forEach(function (key) {
  process.stdout.write('generating ' + key + ' ... ');
  const run = e2e.runScenario(key);
  const a = e2e.artifact(run);
  artifacts.push(a);
  fs.writeFileSync(path.join(OUT_DIR, key + '-audit.json'), JSON.stringify(a, null, 2));
  console.log(a.ms + ' ms; devices=' + a.devices + ' nets=' + a.nets + ' wires=' + a.wires + ' blocking=' + a.blocking.join(','));
});

fs.writeFileSync(path.join(DOCS_DIR, 'audit-status.md'), e2e.statusMarkdown(artifacts) + '\n');

if (update) {
  const baseline = {
    schema: 'evse-e2e-baseline/v1',
    generatedAt: new Date().toISOString(),
    note: '违规计数只允许下降。修复后运行 node scripts/audit-snapshot.js --update-baseline。',
    scenarios: {}
  };
  artifacts.forEach(function (a) {
    baseline.scenarios[a.scenario.key] = {
      name: a.scenario.name,
      params: a.scenario.params,
      devices: a.devices,
      nets: a.nets,
      wires: a.wires,
      unrouted: a.unrouted,
      grade: a.grade,
      status: a.status,
      blocking: a.blocking,
      violations: a.violations
    };
  });
  fs.writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log('baseline updated: ' + path.relative(e2e.ROOT, BASELINE));
}

console.log('audit snapshot written: ' + path.relative(e2e.ROOT, OUT_DIR));
console.log('status doc written: ' + path.relative(e2e.ROOT, path.join(DOCS_DIR, 'audit-status.md')));