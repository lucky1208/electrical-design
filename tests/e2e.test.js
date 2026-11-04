const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const e2e = require('./e2e-scenarios.js');

const BASELINE_FILE = path.join(__dirname, 'e2e-baseline.json');
const BASELINE = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
const OUT_DIR = path.join(e2e.ROOT, 'out_audit');

Object.keys(e2e.SCENARIOS).forEach(function (key) {
  test('end-to-end generation baseline: ' + key, function () {
    const expected = BASELINE.scenarios[key];
    assert.ok(expected, 'baseline missing scenario ' + key);
    const run = e2e.runScenario(key);
    const current = e2e.artifact(run);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, key + '-audit.json'), JSON.stringify(current, null, 2));

    /* 场景结构锁定：器件/网络/页数/参数一旦变化必须显式更新基线，防止用更小的图“改善”违规数 */
    assert.equal(current.devices, expected.devices, key + ': device count changed, update baseline via npm run audit:update');
    assert.equal(current.nets, expected.nets, key + ': net count changed, update baseline via npm run audit:update');
    if (expected.pageCount != null) assert.equal(current.pageCount, expected.pageCount, key + ': page count changed');
    assert.deepEqual(current.scenario.params, expected.params, key + ': scenario params changed');

    const byNet = {};
    run.design.wires.forEach(function (w) { byNet[w.net] = (byNet[w.net] || 0) + 1; });
    run.design.nets.forEach(function (n) {
      const routed = byNet[n.id] || 0;
      assert.ok(routed > 0 || n.err, key + ': network ' + n.id + ' is silently unrouted');
      assert.ok(!(routed > 0 && n.err), key + ': network ' + n.id + ' has both wire and error');
    });

    assert.ok(current.unrouted <= expected.unrouted, key + ': unrouted ' + current.unrouted + ' > baseline ' + expected.unrouted);
    Object.keys(current.violations).forEach(function (id) {
      assert.ok(Object.prototype.hasOwnProperty.call(expected.violations, id), key + ': new violation item ' + id + '=' + current.violations[id]);
      assert.ok(current.violations[id] <= expected.violations[id],
        key + ': ' + id + ' ' + current.violations[id] + ' > baseline ' + expected.violations[id]);
    });
    const newBlocking = current.blocking.filter(function (id) { return expected.blocking.indexOf(id) < 0; });
    assert.deepEqual(newBlocking, [], key + ': new blocking items ' + newBlocking.join(','));

    if (current.blocking.length) {
      assert.equal(current.status, 'BLOCKED', key + ': blocking items must force BLOCKED');
      assert.equal(current.grade, 'D', key + ': blocking items must force grade D');
    }
  });
});